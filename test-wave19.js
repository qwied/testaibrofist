/* Девятнадцатая волна идей игроков: присед — «вниз» на земле, фигура ниже и пролезает под низким
   блоком; встаёт, только когда над головой свободно. Свой сервер: 3283. Запуск: node test-wave19.js */
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
  { type: 'rect', x: 0, y: 600, w: 2000, h: 40 },
  { type: 'spawn', x: 60, y: 500, w: 30, h: 100 },
  { type: 'rect', x: 400, y: 450, w: 300, h: 70 },        // низкий потолок: под ним 80 по высоте
  { type: 'finishline', x: 1800, y: 474, w: 52, h: 126 }
];
function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave19-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git|builtinMaps)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const now = Date.now();
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([{ mapName: 'Low Gap', mapType: 'race', author: 'w19', date: now, created: now, rating: 0, votes: {},
    boostLikes: 0, boostDislikes: 0, inGameModes: [], mapData: JSON.stringify({ mode: 'race', gravity: 9, objects: objs }) }]));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), OWNER_ALIASES: 'w19' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
(async () => {
  const S = server(3283);
  await until(() => fetch(S.base + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const g = await ctx.newPage(); g.on('pageerror', e => errs.push('game: ' + e.message.slice(0, 200)));
    await g.goto(S.base + '/game.html?mode=race&view=Low%20Gap&author=w19');
    await until(() => g.evaluate(() => window.GAME && GAME.playing && GAME.objects.length >= 4), 15000);
    await sleep(400);
    await g.evaluate(() => { GAME.pl.x = 300; });
    await sleep(200);
    await g.keyboard.down('ArrowRight'); await sleep(600); await g.keyboard.up('ArrowRight');
    ok(await g.evaluate(() => GAME.pl.x < 380), 'стоя под низкий блок не пройти', await g.evaluate(() => Math.round(GAME.pl.x)));
    await g.keyboard.down('ArrowDown'); await sleep(100);
    ok(await g.evaluate(() => GAME.pl.crouch && GAME.pl.h === 60), 'присел: фигура ниже', await g.evaluate(() => GAME.pl.h));
    await g.keyboard.down('ArrowRight'); await sleep(900);
    ok(await g.evaluate(() => GAME.pl.x > 420 && GAME.pl.x < 690), 'в приседе пролез под блок', await g.evaluate(() => Math.round(GAME.pl.x)));
    await g.keyboard.up('ArrowRight'); await g.keyboard.up('ArrowDown'); await sleep(200);
    ok(await g.evaluate(() => GAME.pl.crouch), 'под блоком встать нельзя — остаётся в приседе');
    await g.keyboard.down('ArrowRight'); await sleep(1500); await g.keyboard.up('ArrowRight'); await sleep(200);
    ok(await g.evaluate(() => !GAME.pl.crouch && GAME.pl.h === 100 && GAME.pl.x > 700), 'вылез — встал во весь рост', await g.evaluate(() => JSON.stringify({ c: GAME.pl.crouch, h: GAME.pl.h, x: Math.round(GAME.pl.x) })));
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); S.kill(); process.exit(fail ? 1 : 0);
})();
