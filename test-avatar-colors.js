/* Страница Avatar: цвет чата и цвет ника — две отдельные карточки (одна покупка открывает обе),
   а в окне «Change nickname» кнопка «Change» целиком внутри окна — на десктопе, телефоне и по-русски.
   Свой сервер на копии репозитория (порт 3214): монеты нужны, а на общем их взять негде. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
const PORT = 3214, BASE = 'http://127.0.0.1:' + PORT;
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(60); } return null; };

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-avatar-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: s => {
    const r = path.relative(ROOT, s);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  const A = require('./accounts.js');
  const salt = 'ef'.repeat(16);
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(path.join(tmp, 'data', 'users.json'), JSON.stringify({ users: { avabro: {
    name: 'AvaBro', salt, hash: A.hashNew('Passw0rd!x', salt), joined: Date.now(), lastSeen: Date.now(), coins: 700,
    about: '', avatar: '0', items: [], skin: {}, lang: '', friends: [], incoming: [], outgoing: [] } }, sessions: {} }));
  const srv = spawn('node', ['server.js'], { cwd: tmp, env: { ...process.env, PASSWORD_AUTH: '1', PORT: String(PORT) }, stdio: 'ignore' });
  const cleanup = () => { try { srv.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} };
  process.on('exit', cleanup);
  if (!await until(() => fetch(BASE + '/').then(r => r.ok).catch(() => false), 20000)) throw new Error('сервер не поднялся');

  const ip = '10.' + (1 + Math.floor(Math.random() * 250)) + '.14.9';
  const lr = await fetch(BASE + '/login/password', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ name: 'AvaBro', password: 'Passw0rd!x' }) });
  const cookie = (/sid=[^;]+/.exec((lr.headers.getSetCookie() || [])[0] || '') || [''])[0];
  ok(!!cookie, 'игрок вошёл');
  const bio = () => fetch(BASE + '/getMyBio', { headers: { cookie, 'CF-Connecting-IP': ip } }).then(x => x.json());

  const browser = await chromium.launch();
  const errs = [];
  async function open(opts) {
    opts = opts || {};
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'CF-Connecting-IP': ip } }, opts.ctx || {}));
    await ctx.addCookies([{ name: 'sid', value: cookie.slice(4), url: BASE }]);
    const page = await ctx.newPage();
    if (opts.lang) {
      await ctx.addInitScript(l => { try { localStorage.setItem('bfLang', l); } catch (e) {} }, opts.lang);
      await page.route('**/i18n/get', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ lang: opts.lang }) }));
    }
    page.on('pageerror', e => errs.push(e.message.slice(0, 140)));
    await page.goto(BASE + '/avatar', { waitUntil: 'networkidle' });
    await page.evaluate(() => { const c = document.getElementById('bfConsent'); if (c) c.remove(); });
    await page.waitForSelector('#avBody', { state: 'visible' });
    await sleep(300);
    return { page, ctx };
  }
  const vis = (page, sel) => page.isVisible(sel).catch(() => false);

  // ---- до покупки: одна карточка с покупкой, карточки ника нет ----
  {
    const { page, ctx } = await open();
    ok(await vis(page, '#avChatBtn') && /Unlock colors/i.test(await page.textContent('#avChatBtn')), 'до покупки — кнопка «Unlock colors» с ценой');
    ok(/One purchase unlocks both/i.test(await page.textContent('#avChatColorBox')), 'сказано, что одна покупка открывает оба цвета');
    ok(!(await vis(page, '#avNickCard')), 'карточка цвета ника пока скрыта');
    await page.click('#avChatBtn');
    await page.waitForSelector('#avColorInput', { timeout: 6000 });
    ok(await vis(page, '#avNickCard'), 'после покупки появилась карточка «Nick color»');
    ok((await page.textContent('#avNickCard .avCardTitle')).trim() === 'Nick color', 'у неё свой заголовок');
    ok(/messages in the game chat/i.test(await page.textContent('#avChatColorBox')) && /under your character/i.test(await page.textContent('#avNickColorBox')),
       'у каждой своё пояснение: чат — сообщения, ник — под фигурой');
    ok((await bio()).coins === 200, 'монеты списаны один раз', String((await bio()).coins));

    // каждый цвет сохраняется отдельно и не трогает второй
    const setColor = (sel, v) => page.evaluate(([s, c]) => { const i = document.querySelector(s); i.value = c; i.dispatchEvent(new Event('input', { bubbles: true })); }, [sel, v]);
    await setColor('#avColorInput', '#e11d48');
    await page.click('#avChatBtn');
    await page.waitForSelector('#avChatErr.good', { timeout: 6000 });
    let b = await bio();
    ok(b.chatColor === '#e11d48' && b.nickColor === '#ffffff', 'сохранён только цвет чата, ник по умолчанию белый', b.chatColor + ' ' + b.nickColor);
    await setColor('#avNickColorInput', '#16a34a');
    await page.click('#avNickBtn');
    await page.waitForSelector('#avNickErr.good', { timeout: 6000 });
    b = await bio();
    ok(b.chatColor === '#e11d48' && b.nickColor === '#16a34a', 'цвет ника сохранён отдельно, цвет чата не изменился', b.chatColor + ' ' + b.nickColor);
    await ctx.close();
  }
  // ---- после перезагрузки обе карточки показывают сохранённое ----
  {
    const { page, ctx } = await open();
    ok((await page.inputValue('#avColorInput')) === '#e11d48' && (await page.inputValue('#avNickColorInput')) === '#16a34a', 'после перезагрузки в обоих выборах сохранённые цвета');
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
    await ctx.close();
  }

  // ---- окно смены ника: кнопка целиком внутри окна ----
  const inside = async page => page.evaluate(() => {
    const box = document.querySelector('.bf-box').getBoundingClientRect();
    const b = document.getElementById('avModalNickBtn').getBoundingClientRect();
    const i = document.getElementById('avModalNick').getBoundingClientRect();
    const cs = getComputedStyle(document.querySelector('.bf-box'));
    const padR = parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth);
    return { fits: b.right <= box.right - padR + 0.5 && b.left >= box.left && b.width > 40, gap: Math.round(b.left - i.right),
             w: Math.round(b.width), right: Math.round(box.right - padR - b.right) };
  });
  for (const [name, opts, text] of [
    ['десктоп', {}, /^Change$/],
    ['телефон 360px', { ctx: { viewport: { width: 360, height: 700 }, hasTouch: true, isMobile: true } }, /^Change$/],
    ['по-русски', { lang: 'ru' }, /^Изменить$/],
    ['по-русски на телефоне', { lang: 'ru', ctx: { viewport: { width: 340, height: 700 }, hasTouch: true, isMobile: true } }, /^Изменить$/]]) {
    const { page, ctx } = await open(opts);
    await page.click('#avNickOpenBtn');
    await page.waitForSelector('#avModalNickBtn', { state: 'visible' });
    await sleep(200);
    const r = await inside(page);
    ok(r.fits, 'кнопка в окне смены ника целиком видна: ' + name, 'ширина ' + r.w + ', до края ' + r.right + ', от поля ' + r.gap);
    ok(text.test((await page.textContent('#avModalNickBtn')).trim()), 'на кнопке полный текст: ' + name, (await page.textContent('#avModalNickBtn')).trim());
    // и она нажимается: пустое поле даёт ошибку, а не клик мимо
    await page.click('#avModalNickBtn');
    ok(((await page.textContent('#avModalNickErr')) || '').trim().length > 0, 'по кнопке клик доходит: ' + name);
    if (name === 'десктоп' && process.env.SHOT2) await page.screenshot({ path: process.env.SHOT2 });
    await ctx.close();
  }

  ok(errs.length === 0, 'ошибок скриптов нет', errs.join(' | '));
  await browser.close(); cleanup();
  console.log(pass + ' ok, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
