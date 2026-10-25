/* Мини-карта с искателями в прятках (идея 2019 года): во время охоты у прячущегося в левом верхнем углу
   маленькая карта — контуры уровня, он сам и красные точки искателей (см. drawMini в game.js). У искателя
   и в лобби её нет. Свой сервер на копии репозитория (порт 3225). */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
const PORT = 3225, BASE = 'http://127.0.0.1:' + PORT;
const OWNER = 'minimapowner';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(100); } return null; };

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-mini-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const mapData = JSON.stringify({ mode: 'hideAndSeek', objects: [
    { id: 1, type: 'spawn', x: 300, y: 450, w: 30, h: 100 },
    { id: 2, type: 'rect', x: 0, y: 560, w: 2400, h: 80 },
    { id: 3, type: 'rect', x: 900, y: 380, w: 200, h: 30 }, { id: 4, type: 'rect', x: 1600, y: 300, w: 300, h: 30 }] });
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([{ mapName: 'MiniLand', mapType: 'hideAndSeek', mapData,
    author: OWNER, date: Date.now(), created: Date.now(), rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: [] }]));
  const srv = spawn('node', ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(PORT), OWNER_ALIASES: OWNER, HS_ROUND_MS: '20000' }, stdio: 'ignore' });
  const cleanup = () => { try { srv.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} };
  process.on('exit', cleanup);
  if (!await until(() => fetch(BASE + '/').then(r => r.ok).catch(() => false), 20000)) throw new Error('сервер не поднялся');

  const browser = await chromium.launch();
  const errs = [];
  const room = 'mini' + Math.floor(Math.random() * 1e6);
  async function open(n) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'CF-Connecting-IP': '10.25.' + n + '.1' } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message.slice(0, 140)));
    await p.goto(BASE + '/game.html?mode=hideAndSeek&room=' + room, { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => { const x = document.getElementById('bfConsent'); if (x) x.remove(); });
    return p;
  }
  // первый вошедший — искатель (рулетка крутится, когда в комнате он один), второй — прячется
  const seeker = await open(1);
  await until(() => seeker.evaluate(() => /Seeker/.test((document.getElementById('gRole') || {}).textContent || '')), 15000);
  const hider = await open(2);
  await until(() => hider.evaluate(() => window.GAME && window.GAME.playing), 15000);
  const miniShown = p => p.evaluate(() => { const c = document.getElementById('gMini'); return !!c && c.style.display === 'block'; });
  ok(!(await miniShown(hider)), 'в лобби мини-карты нет');
  // прячущийся отбегает вправо, чтобы точки на мини-карте не слились
  await hider.keyboard.down('ArrowRight'); await sleep(1600); await hider.keyboard.up('ArrowRight');

  const round = await until(() => hider.evaluate(() => /Hider/.test(document.getElementById('gRole').textContent) && (document.getElementById('gTime').textContent || '').indexOf('0:') === 0 && Number(document.getElementById('gTime').textContent.split(':')[1]) > 0 && document.getElementById('gMini').style.display === 'block'), 45000);
  ok(!!round, 'началась охота — у прячущегося появилась мини-карта');
  ok(!(await miniShown(seeker)), 'у искателя мини-карты нет');
  await sleep(600);
  const box = await hider.locator('#gMini').boundingBox();
  const png = PNG.sync.read(await hider.screenshot({ clip: box }));
  let red = 0, dark = 0, gray = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
    if (r > 200 && g < 110 && b < 110) red++;
    else if (r < 40 && g < 45 && b < 60) dark++;
    else if (Math.abs(r - 156) < 14 && Math.abs(g - 163) < 14 && Math.abs(b - 175) < 14) gray++;
  }
  ok(red > 15, 'на мини-карте красная точка искателя', red + ' px');
  ok(dark > 15, 'и тёмная точка — сам прячущийся', dark + ' px');
  ok(gray > 30, 'и контуры уровня', gray + ' px');
  ok(box.x >= 0 && box.y >= 40 && box.x + box.width <= 1280, 'мини-карта в левом верхнем углу под верхней панелью', JSON.stringify({ x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width) }));
  if (process.env.SHOT) await hider.screenshot({ path: process.env.SHOT });

  // телефон: зашёл посреди охоты прячущимся — мини-карта целиком на экране и не наезжает на панель и кнопки
  {
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, extraHTTPHeaders: { 'CF-Connecting-IP': '10.25.8.8' } });
    const pp = await pctx.newPage();
    pp.on('pageerror', e => errs.push('phone: ' + e.message.slice(0, 140)));
    await pp.goto(BASE + '/game.html?mode=hideAndSeek&room=' + room, { waitUntil: 'domcontentloaded' });
    await pp.evaluate(() => { const x = document.getElementById('bfConsent'); if (x) x.remove(); });
    const fit = await until(() => pp.evaluate(() => {
      const m = document.getElementById('gMini');
      if (!m || m.style.display !== 'block') return null;
      const r = m.getBoundingClientRect(), top = document.getElementById('gTop').getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      // кнопки и карточки, с которыми мини-карта не должна пересекаться
      const hits = Array.from(document.querySelectorAll('#gTop, #gMap, button')).filter(el => {
        const q = el.getBoundingClientRect();
        return q.width && q.height && getComputedStyle(el).visibility !== 'hidden' && el.offsetParent !== null &&
          !(q.right <= r.left || q.left >= r.right || q.bottom <= r.top || q.top >= r.bottom);
      }).map(el => el.id || el.textContent.trim().slice(0, 12));
      return { inView: r.left >= 0 && r.right <= vw && r.top >= top.bottom - 1, hits, r: [Math.round(r.left), Math.round(r.top), Math.round(r.width)] };
    }), 10000);
    ok(!!fit && fit.inView && fit.hits.length === 0, 'на телефоне мини-карта на экране и ничего не перекрывает', JSON.stringify(fit));
    if (process.env.SHOT2) await pp.screenshot({ path: process.env.SHOT2 });
    await pctx.close();
  }

  ok(errs.length === 0, 'ошибок скриптов нет', errs.join(' | '));
  await browser.close(); cleanup();
  console.log(pass + ' ok, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
