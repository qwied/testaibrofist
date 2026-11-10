/* Десятая волна идей игроков — логика карт: блок «Появляется по кнопке», триггер-переключатель и
   случайный триггер, вращение по рычагу, кнопка на двоих, блок-преследователь, спринт на Shift.
   Свой сервер: 3272. Запуск: node test-wave10.js */
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
const objs = [
  { id: 1, type: 'rect', x: 0, y: 600, w: 5000, h: 40 },
  { id: 2, type: 'spawn', x: 60, y: 500, w: 30, h: 100 },
  { id: 3, type: 'button', x: 300, y: 582, w: 34, h: 18, customId: 'b1', targetIds: 'wall1,rot1', holdSec: 5 },
  { id: 4, type: 'rect', x: 500, y: 300, w: 30, h: 300, customId: 'wall1', invert: true },
  { id: 5, type: 'rect', x: 700, y: 300, w: 120, h: 20, customId: 'rot1', spins: true, spin: 3 },
  { id: 6, type: 'trigger', x: 1000, y: 450, w: 80, h: 150, fx: 'toggle', customId: 't1', targetIds: 'gate1' },
  { id: 7, type: 'rect', x: 1200, y: 300, w: 30, h: 300, customId: 'gate1' },
  { id: 8, type: 'trigger', x: 1500, y: 450, w: 80, h: 150, fx: 'random', customId: 't2', targetIds: 'ra,rb,rc' },
  { id: 9, type: 'rect', x: 1700, y: 300, w: 30, h: 300, customId: 'ra' },
  { id: 10, type: 'rect', x: 1800, y: 300, w: 30, h: 300, customId: 'rb' },
  { id: 11, type: 'rect', x: 1900, y: 300, w: 30, h: 300, customId: 'rc' },
  { id: 12, type: 'button', x: 2200, y: 582, w: 34, h: 18, customId: 'b2', targetIds: 'g2', need: 2 },
  { id: 13, type: 'rect', x: 2400, y: 300, w: 30, h: 300, customId: 'g2' },
  { id: 14, type: 'rect', x: 3000, y: 200, w: 40, h: 40, chase: 4, chaseR: 500, deadly: true },
  { id: 15, type: 'finishline', x: 4800, y: 474, w: 52, h: 126 }
];
function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave10-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const now = Date.now();
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([{ mapName: 'Logic Test', mapType: 'race', author: 'w10', date: now, created: now, rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: [],
    mapData: JSON.stringify({ mode: 'race', gravity: 9, sprint: 1, objects: objs }) }]));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), OWNER_ALIASES: 'w10' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
(async () => {
  const S = server(3272);
  await until(() => fetch(S.base + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const g = await ctx.newPage(); g.on('pageerror', e => errs.push('game: ' + e.message.slice(0, 200)));
    await g.goto(S.base + '/game.html?mode=race&view=Logic%20Test&author=w10');
    await until(() => g.evaluate(() => window.GAME && GAME.playing && GAME.objects.some(o => o.chase)), 15000);
    const tp = x => g.evaluate(x => { GAME.pl.x = x; GAME.pl.y = 500; GAME.pl.vx = 0; GAME.pl.vy = 0; }, x);
    const O = id => g.evaluate(id => { const o = GAME.objects.find(o => o.id === id); return { act: !!o._act, spin: o._spin || 0, x: o.x, y: o.y }; }, id);
    const solidAt = (x) => g.evaluate(x => GAME.solidAt ? GAME.solidAt(x, 450) : null, x);
    console.log('Появляется по кнопке и вращение по кнопке:');
    const s0 = (await O(5)).spin; await sleep(300);
    ok((await O(5)).spin === s0, 'привязанный к кнопке ротатор стоит, пока кнопку не нажали');
    await tp(460); await g.keyboard.down('ArrowRight'); await sleep(400); await g.keyboard.up('ArrowRight');
    ok(await g.evaluate(() => GAME.pl.x > 520), 'блок «Появляется по кнопке» сначала проходим', await g.evaluate(() => GAME.pl.x));
    await tp(300); await sleep(200);
    ok((await O(4)).act, 'нажали кнопку — блок появился');
    const s1 = (await O(5)).spin; await sleep(300);
    ok((await O(5)).spin > s1, 'нажали кнопку — ротатор крутится');
    await tp(460); await g.keyboard.down('ArrowRight'); await sleep(400); await g.keyboard.up('ArrowRight');
    ok(await g.evaluate(() => GAME.pl.x < 480), 'появившийся блок не пускает (кнопка держит 5 с)', await g.evaluate(() => GAME.pl.x));
    console.log('Триггеры:');
    await tp(1020); await sleep(200);
    ok((await O(7)).act, 'триггер-переключатель открыл ворота');
    await tp(900); await sleep(150); await tp(1020); await sleep(200);
    ok(!(await O(7)).act, 'вошёл снова — закрыл');
    await tp(1520); await sleep(200);
    const rnd = [await O(9), await O(10), await O(11)].filter(x => x.act).length;
    ok(rnd === 1, 'случайный триггер открыл ровно одну цель из трёх', rnd);
    console.log('Кнопка на двоих:');
    await tp(2200); await sleep(300);
    ok(!(await O(13)).act, 'один игрок на кнопке «на двоих» — не открывает');
    console.log('Преследователь:');
    const c0 = await O(14);
    ok(c0.x === 3000, 'далёкого игрока не преследует', c0.x);
    await tp(3300); await sleep(600);
    const c1 = await O(14);
    ok(c1.x > c0.x + 30, 'блок-преследователь едет к игроку', c0.x + ' → ' + Math.round(c1.x));
    await tp(4400); await sleep(1500);
    ok(Math.abs((await O(14)).x - 3000) < 5, 'игрок ушёл дальше радиуса — блок вернулся на место', Math.round((await O(14)).x));
    console.log('Спринт:');
    await tp(3900); await sleep(300);
    await g.keyboard.down('ArrowLeft'); await sleep(150);
    const v1 = Math.abs(await g.evaluate(() => GAME.pl.vx));
    await g.keyboard.down('Shift'); await sleep(150);
    const v2 = Math.abs(await g.evaluate(() => GAME.pl.vx));
    await g.keyboard.up('Shift'); await g.keyboard.up('ArrowLeft');
    ok(v2 > v1 * 1.3, 'с Shift бег быстрее', v1.toFixed(2) + ' → ' + v2.toFixed(2));
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); S.kill(); process.exit(fail ? 1 : 0);
})();
