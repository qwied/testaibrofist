/* Волна 31 — столкновения игроков (опция карты гонки, идея #401): на другого игрока можно встать
   сверху; без опции проходишь сквозь. Свой сервер: 3297. */
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
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(80); } return null; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave31-'));
fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
  const r = path.relative(ROOT, x);
  return !(/^(node_modules|data|\.git|builtinMaps)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
} });
fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
fs.mkdirSync(path.join(tmp, 'data'));
const now = Date.now();
const objects = [{ id: 1, type: 'rect', x: 0, y: 600, w: 3000, h: 40 }, { id: 2, type: 'spawn', x: 300, y: 490, w: 30, h: 100 }, { id: 3, type: 'finishline', x: 2900, y: 474, w: 52, h: 126 }];
fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([{ mapName: 'Bump', mapType: 'race', author: 'w31', date: now, created: now,
  rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: ['race'], mapData: JSON.stringify({ mode: 'race', gravity: 9, collide: 1, objects }) }]));
const BASE = 'http://127.0.0.1:3297';
const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: '3297', OWNER_ALIASES: 'w31', RACE_LOBBY_MS: '1500', RACE_ROUND_MS: '60000' } });
(async () => {
  await until(() => fetch(BASE + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [];
  try {
    const V = await b.newPage(); V.on('pageerror', e => errs.push(e.message.slice(0, 200)));
    await V.goto(BASE + '/game.html?mode=race&view=Bump&author=w31');
    await until(() => V.evaluate(() => window.GAME && GAME.playing && GAME.pl && GAME.pl.ground), 15000);
    await V.evaluate(() => { GAME.others = () => [{ x: 700, y: 500, w: 30, h: 100 }]; GAME.teleportTo(700, 200); });
    await sleep(1500);
    ok(await V.evaluate(() => Math.abs(GAME.pl.y + GAME.pl.h - 500) < 3), 'движок: с опцией карты на другого игрока можно встать');
    const mk = async (ip) => { const c = await b.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'CF-Connecting-IP': ip } }); const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message.slice(0, 200))); await p.goto(BASE + '/game.html?mode=race&room=bump1'); return p; };
    const A = await mk('10.31.1.1'), B = await mk('10.31.2.1');
    const ready = p => until(() => p.evaluate(() => window.GAME && GAME.playing && !GAME.frozen && GAME.pl && GAME.pl.ground), 20000);
    await ready(A); await ready(B);
    const bx = await B.evaluate(() => ({ x: GAME.pl.x, y: GAME.pl.y, h: GAME.pl.h }));
    await until(() => A.evaluate(() => GAME.others().length === 1 && Math.abs(GAME.others()[0].y - 0) > 1), 6000);
    await sleep(1000);
    await A.evaluate(o => { GAME.teleportTo(o.x, o.y - 250); }, bx);
    await sleep(1200);
    const top = await until(() => A.evaluate(() => GAME.pl.ground ? GAME.pl.y + GAME.pl.h : null), 5000);
    ok(top && Math.abs(top - bx.y) < 6, 'встал на голову другого игрока', JSON.stringify({ feet: top, otherTop: bx.y }));
    await A.keyboard.down('ArrowRight'); await sleep(900); await A.keyboard.up('ArrowRight');
    const fl = await until(() => A.evaluate(() => GAME.pl.ground ? GAME.pl.y + GAME.pl.h : null), 5000);
    ok(fl && Math.abs(fl - 600) < 3, 'сошёл — на полу', fl);
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
