/* Игра на «боевом» адресе: после load движок убирает window.GAME из window (hideBridge в game.html), и
   game.js должен пользоваться своей, уже взятой ссылкой, а не проверять window.GAME. На localhost мост
   остаётся, поэтому обычные тесты этого не видят: подпись «Role: Zombie» была, а фигурка у игрока —
   обычная чёрная, потому что флаг зомби так и не включался. Здесь страница открывается по не-локальному
   имени хоста (Chromium направляет его на наш сервер), как у настоящих игроков. Свой сервер на копии
   репозитория (порт 3217). */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
const PORT = 3217, HOST = 'prod-like.test';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(100); } return null; };

(async () => {
  // статическая сторона: после load window.GAME нет, значит game.js не должен на него опираться
  const src = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
  ok(!/window\.GAME\s*&&/.test(src) && !/if\s*\(\s*window\.GAME\s*\)/.test(src),
     'game.js не проверяет window.GAME (его убирают после load) — только свою ссылку GAME');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-zprod-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: s => {
    const r = path.relative(ROOT, s);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const mapData = JSON.stringify({ mode: 'hideAndSeek', apoc: true, gravity: 9, objects: [
    { id: 1, type: 'spawn', x: 600, y: 400, w: 30, h: 100 },
    { id: 2, type: 'rect', x: 300, y: 500, w: 436, h: 224 },
    { id: 3, type: 'zombie', x: 900, y: 400, w: 30, h: 100 }] });
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([{ mapName: 'Tst', mapType: 'hideAndSeek', mapData,
    author: 'qwied', date: Date.now(), created: Date.now(), rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: [] }]));
  const srv = spawn('node', ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(PORT), OWNER_ALIASES: 'qwied' }, stdio: 'ignore' });
  const cleanup = () => { try { srv.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} };
  process.on('exit', cleanup);
  if (!await until(() => fetch('http://127.0.0.1:' + PORT + '/').then(r => r.ok).catch(() => false), 20000)) throw new Error('сервер не поднялся');

  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP ' + HOST + ' 127.0.0.1'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'CF-Connecting-IP': '10.9.9.9' } });
  const errs = [];
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await p.goto('http://' + HOST + ':' + PORT + '/game.html?mode=hideAndSeek&room=zprod' + (Date.now() % 100000), { waitUntil: 'load' });
  await p.evaluate(() => { const c = document.getElementById('bfConsent'); if (c) c.remove(); });
  await sleep(500);
  ok(await p.evaluate(() => typeof window.GAME === 'undefined'), 'после load window.GAME убран, как на настоящем сайте');

  // ждём роль «Zombie»: рулетка приземлилась на единственного игрока (≈8 с лобби)
  const role = await until(() => p.evaluate(() => {
    const b = document.getElementById('gRoleBox'), r = document.getElementById('gRole');
    return b && b.style.display === 'inline' && r && /Zombie/.test(r.textContent) ? r.textContent : '';
  }), 30000);
  ok(role === 'Zombie', 'в углу написано «Role: Zombie»', role);
  await sleep(700);
  const png = PNG.sync.read(await p.screenshot());
  // фигурка стоит по центру экрана; тело — прямоугольник под головой
  const px = (x, y) => { const i = (png.width * y + x) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
  let green = 0, black = 0;
  for (let y = 470; y < 520; y++) for (let x = 630; x < 650; x++) {
    const [r, g, b] = px(x, y);
    if (Math.abs(r - 85) < 14 && Math.abs(g - 114) < 14 && Math.abs(b - 44) < 14) green++;
    else if (r < 20 && g < 20 && b < 20) black++;
  }
  ok(green > 400 && black < 50, 'у зомби зелёная модель, а не обычная чёрная фигурка', 'зелёных ' + green + ', чёрных ' + black);

  ok(errs.length === 0, 'ошибок скриптов нет', errs.join(' | '));
  await browser.close(); cleanup();
  console.log(pass + ' ok, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
