/* Волна 26 — перевёрнутая гравитация: зона гравитации со значением меньше нуля тянет вверх,
   игрок стоит на нижней грани потолка, прыгает вниз и рисуется вверх ногами. Свой сервер: 3292. */
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave26-'));
fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
  const r = path.relative(ROOT, x);
  return !(/^(node_modules|data|\.git|builtinMaps)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
} });
fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
fs.mkdirSync(path.join(tmp, 'data'));
const now = Date.now();
// пол на 600, потолок 200..240; зона переворота над спавном до потолка, справа обычная гравитация
const objects = [{ id: 1, type: 'rect', x: 0, y: 600, w: 3000, h: 40 }, { id: 2, type: 'rect', x: 0, y: 200, w: 3000, h: 40 },
  { id: 3, type: 'spawn', x: 100, y: 490, w: 30, h: 100 }, { id: 4, type: 'gravzone', x: 0, y: 240, w: 700, h: 360, gmul: -1 },
  { id: 5, type: 'finishline', x: 2900, y: 474, w: 52, h: 126 }];
fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([{ mapName: 'Upside', mapType: 'race', author: 'w26', date: now, created: now,
  rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: ['race'], mapData: JSON.stringify({ mode: 'race', gravity: 9, objects }) }]));
const BASE = 'http://127.0.0.1:3292';
const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: '3292', OWNER_ALIASES: 'w26' } });
(async () => {
  await until(() => fetch(BASE + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [];
  try {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
    await p.goto(BASE + '/game.html?mode=race&view=Upside&author=w26');
    await until(() => p.evaluate(() => window.GAME && GAME.playing && GAME.objects.length >= 4), 15000);
    const up = await until(() => p.evaluate(() => GAME.pl.ground && GAME.pl.y < 300 ? { y: GAME.pl.y, flip: GAME.pl.gflip } : null), 6000);
    ok(up && up.flip && Math.abs(up.y - 240) < 2, 'в зоне игрока тянет вверх — стоит на нижней грани потолка', JSON.stringify(up));
    await p.keyboard.down('ArrowUp'); await sleep(120); await p.keyboard.up('ArrowUp');
    const maxY = await p.evaluate(async () => { let m = GAME.pl.y; for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 30)); m = Math.max(m, GAME.pl.y); } return m; });
    ok(maxY > 300, 'прыжок — вниз, от потолка', maxY);
    ok(!!await until(() => p.evaluate(() => GAME.pl.ground && Math.abs(GAME.pl.y - 240) < 2), 4000), 'и снова «падает» на потолок');
    await p.keyboard.down('ArrowRight');
    const out = await until(() => p.evaluate(() => GAME.pl.x > 760 && GAME.pl.ground ? { feet: GAME.pl.y + GAME.pl.h, flip: GAME.pl.gflip } : null), 8000);
    await p.keyboard.up('ArrowRight');
    ok(out && !out.flip && Math.abs(out.feet - 600) < 3, 'вышел из зоны — упал на пол, гравитация обычная', JSON.stringify(out));
    ok(!errs.length, 'без ошибок на странице', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
