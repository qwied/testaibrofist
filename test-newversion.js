/* Уведомление «вышла новая версия сайта»: сервер отдаёт версию (/assetVersion), меню (shell.js) сверяет
   с ней свою и показывает плашку с кнопкой «Обновить». Само страницу не перезагружает. */
'use strict';
const fs = require('fs');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3210';   // сервер: PASSWORD_AUTH=1 PORT=3210 node server.js
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const own = +/shell\.js\?v=(\d+)/.exec(fs.readFileSync(__dirname + '/index.html', 'utf8'))[1];

(async () => {
  // ---- сервер ----
  const r = await fetch(BASE + '/assetVersion');
  const j = await r.json();
  ok(j.v === String(own), 'сервер отдаёт версию из index.html', JSON.stringify(j) + ' vs ' + own);
  ok(/no-store/.test(r.headers.get('cache-control') || ''), 'ответ не кэшируется');

  const browser = await chromium.launch();
  const ip = '10.' + (1 + Math.floor(Math.random() * 250)) + '.14.2';
  const errs = [];

  /* mock: функция, возвращающая { v } / 'fail' / 'abort' / undefined (настоящий ответ сервера) */
  async function open(url, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'CF-Connecting-IP': ip } });
    const page = await ctx.newPage();
    // язык игрока: в браузере и в аккаунте (ответ сервера главнее браузерного, см. i18n.js)
    if (opts.lang) {
      await ctx.addInitScript(l => { try { localStorage.setItem('bfLang', l); } catch (e) {} }, opts.lang);
      await page.route('**/i18n/get', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ lang: opts.lang }) }));
    }
    page.on('pageerror', e => errs.push(url + ': ' + e.message.slice(0, 120)));
    const st = { reqs: 0, mock: opts.mock, loads: 0 };
    page.on('load', () => { st.loads++; });
    await page.route('**/assetVersion', route => {
      st.reqs++;
      const m = typeof st.mock === 'function' ? st.mock() : st.mock;
      if (m === 'abort') return route.abort();
      if (m === 'fail') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":1}' });
      if (m === 'garbage') return route.fulfill({ status: 200, contentType: 'application/json', body: 'not json' });
      if (m && m.v !== undefined) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(m) });
      return route.continue();
    });
    if (opts.clock) await page.clock.install();
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    await page.evaluate(() => { const c = document.getElementById('bfConsent'); if (c) c.remove(); });
    return { page, ctx, st };
  }
  const bar = p => p.$('#bfNewVer');
  const waitBar = async (p, ms) => { try { await p.waitForSelector('#bfNewVer', { timeout: ms || 9000 }); return true; } catch (e) { return false; } };

  // ---- настоящий сервер: версии совпадают — плашки нет ----
  {
    const { page, ctx, st } = await open('/quests');
    await sleep(6500);
    ok(st.reqs >= 1, 'страница спросила версию сама', st.reqs + ' запрос(а)');
    ok(!(await bar(page)), 'версии совпадают — плашки нет');
    await ctx.close();
  }

  // ---- сервер новее: плашка, кнопка, перевод; страница сама не перезагружается ----
  {
    const { page, ctx, st } = await open('/quests', { mock: { v: String(own + 1) } });
    ok(await waitBar(page), 'версия на сервере новее — плашка появилась');
    const text = (await page.textContent('#bfNewVer')).replace(/\s+/g, ' ');
    ok(/new version/i.test(text) && /Reload/.test(text), 'текст и кнопка по-английски', text);
    await sleep(2500);
    ok(st.loads === 1, 'страница сама не перезагрузилась', st.loads + ' загрузок');
    const box = await page.locator('#bfNewVer').boundingBox();
    ok(box && box.y >= 0 && box.x >= 0 && box.x + box.width <= 1280, 'плашка целиком на экране', JSON.stringify(box && { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width) }));
    await Promise.all([page.waitForNavigation({ timeout: 15000 }), page.click('#bfNewVer button:not(.bfNewVerX)')]);
    ok(st.loads === 2, 'кнопка «Reload» перезагружает страницу', st.loads + ' загрузок');
    await ctx.close();
  }
  {
    const { page, ctx } = await open('/quests', { mock: { v: String(own + 1) }, lang: 'ru' });
    await waitBar(page);
    const text = ((await page.textContent('#bfNewVer')) || '').replace(/\s+/g, ' ');
    ok(/Доступна новая версия/.test(text) && /Обновить/.test(text), 'по-русски при русском языке', text);
    await ctx.close();
  }

  // ---- не показываем: то же, старее, мусор, ошибка, обрыв ----
  for (const [name, mock] of [['та же версия', { v: String(own) }], ['на сервере версия старее (выкладка ещё катится)', { v: String(own - 1) }],
                              ['пустая версия', { v: '' }], ['мусор вместо версии', { v: 'abc' }], ['не JSON', 'garbage'],
                              ['ошибка сервера 500', 'fail'], ['обрыв связи', 'abort']]) {
    const { page, ctx, st } = await open('/story', { mock });
    await sleep(6500);
    ok(st.reqs >= 1 && !(await bar(page)), 'плашки нет: ' + name);
    await ctx.close();
  }

  // ---- закрыть крестиком: после этого не возвращается до перезагрузки ----
  // ---- опрос раз в 5 минут и при возврате на вкладку (время ускоряем) ----
  {
    let answer = { v: String(own) };
    const { page, ctx, st } = await open('/quests', { mock: () => answer, clock: true });
    await sleep(5500);
    ok(!(await bar(page)), 'сначала версии совпадают');
    const base = st.reqs;
    answer = { v: String(own + 1) };
    await page.clock.fastForward(70 * 1000);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    ok(await waitBar(page, 5000), 'возврат на вкладку через минуту — проверка и плашка');
    ok(st.reqs === base + 1, 'один запрос, а не несколько', (st.reqs - base) + ' запрос(ов)');
    await page.click('#bfNewVer .bfNewVerX');
    ok(!(await bar(page)), 'крестик убирает плашку');
    await page.clock.fastForward('06:00');
    await sleep(1500);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await sleep(800);
    ok(!(await bar(page)), 'закрытая плашка не возвращается до перезагрузки');
    await ctx.close();
  }
  {
    let answer = { v: String(own) };
    const { page, ctx, st } = await open('/quests', { mock: () => answer, clock: true });
    await sleep(5500);
    answer = { v: String(own + 1) };
    const base = st.reqs;
    await page.clock.fastForward('06:00');
    ok(await waitBar(page, 5000), 'через 5 минут опрос сам находит новую версию', (st.reqs - base) + ' запрос(ов)');
    await ctx.close();
  }
  {
    let answer = { v: String(own) };
    const { page, ctx, st } = await open('/quests', { mock: () => answer, clock: true });
    await sleep(5500);
    const base = st.reqs;
    await page.clock.fastForward(20 * 1000);
    for (let i = 0; i < 3; i++) await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await sleep(800);
    ok(st.reqs === base, 'чаще раза в минуту при возврате на вкладку не спрашиваем', (st.reqs - base) + ' запрос(ов)');
    await ctx.close();
  }

  // ---- игра: меню там нет — и уведомления нет ----
  {
    const { page, ctx, st } = await open('/game?mode=race&room=nvroom', { mock: { v: String(own + 1) } });
    await sleep(6500);
    ok(st.reqs === 0 && !(await bar(page)), 'в игре версию не проверяем и раунд не прерываем');
    await ctx.close();
  }

  ok(errs.length === 0, 'ошибок скриптов нет', errs.join(' | '));
  await browser.close();
  console.log(pass + ' ok, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
