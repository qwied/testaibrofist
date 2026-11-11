/* Шестнадцатая волна идей игроков: крюк-кошка — опция гонки. E — зацепиться за блок впереди-
   вверху, верёвка держит игрока маятником; прыжок или E — отпустить. Свой сервер: 3280. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + String(x).slice(0, 220))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(60); } return null; };
const objs = [
  { type: 'rect', x: 0, y: 600, w: 400, h: 40 },
  { type: 'rect', x: 1400, y: 600, w: 600, h: 40 },
  { type: 'rect', x: 300, y: 250, w: 500, h: 40 },
  { type: 'spawn', x: 200, y: 500, w: 30, h: 100 },
  { type: 'finishline', x: 1800, y: 474, w: 52, h: 126 }
];
function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave16-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git|builtinMaps)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const now = Date.now();
  const m = (n, hook) => ({ mapName: n, mapType: 'race', author: 'w16', date: now, created: now, rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: [],
    mapData: JSON.stringify(Object.assign({ mode: 'race', gravity: 9, objects: objs }, hook ? { hook: 1 } : {})) });
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([m('Hook Gap', true), m('No Hook', false)]));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), OWNER_ALIASES: 'w16' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
(async () => {
  const S = server(3280);
  await until(() => fetch(S.base + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const open = async (name) => {
      const g = await ctx.newPage(); g.on('pageerror', e => errs.push(name + ': ' + e.message.slice(0, 200)));
      await g.goto(S.base + '/game.html?mode=race&view=' + encodeURIComponent(name) + '&author=w16');
      await until(() => g.evaluate(() => window.GAME && GAME.playing && GAME.objects.length >= 5), 15000);
      await sleep(400);
      return g;
    };
    console.log('Без опции:');
    const n = await open('No Hook');
    await n.keyboard.press('KeyE'); await sleep(100);
    ok(await n.evaluate(() => !GAME.pl.hook), 'на карте без крюка E ничего не делает');
    await n.close();
    console.log('Крюк:');
    const g = await open('Hook Gap');
    await g.evaluate(() => { GAME.pl.face = 1; });
    await g.keyboard.press('KeyE'); await sleep(100);
    const h = await g.evaluate(() => GAME.pl.hook && { x: Math.round(GAME.pl.hook.x), y: Math.round(GAME.pl.hook.y), len: Math.round(GAME.pl.hook.len) });
    ok(!!h && h.y >= 250 && h.y <= 292, 'E — крюк зацепился за блок сверху', JSON.stringify(h));
    // разбегаемся вправо с края и повисаем на верёвке над пропастью
    await g.keyboard.down('ArrowRight'); await sleep(900); await g.keyboard.up('ArrowRight');
    await sleep(400);
    const st = await g.evaluate(() => { const p = GAME.pl, hk = p.hook; if (!hk) return null; const dx = p.x + p.w / 2 - hk.x, dy = p.y + p.h * 0.2 - hk.y; return { d: Math.round(Math.hypot(dx, dy)), len: Math.round(hk.len), y: Math.round(p.y) }; });
    ok(st && st.d <= st.len + 2 && st.y < 600, 'над пропастью верёвка держит — игрок не падает вниз', JSON.stringify(st));
    await g.screenshot({ path: path.join(os.tmpdir(), 'wave16-hook.png') });
    await g.keyboard.down('ArrowUp'); await sleep(80); await g.keyboard.up('ArrowUp');
    ok(await g.evaluate(() => !GAME.pl.hook), 'прыжок — отпустил верёвку');
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); S.kill(); process.exit(fail ? 1 : 0);
})();
