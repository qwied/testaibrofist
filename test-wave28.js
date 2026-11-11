/* Волна 28 — Trials (идея #1592): комната race:trials-N, ловкач по очереди дёргает рычаги и
   ставит шипы, бегущие с 3 жизнями; никто не дошёл — победил ловкач. Свой сервер: 3294. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + String(x).slice(0, 220))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(60); } return null; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave28-'));
fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
  const r = path.relative(ROOT, x);
  return !(/^(node_modules|data|\.git|builtinMaps)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
} });
fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
fs.mkdirSync(path.join(tmp, 'data'));
const now = Date.now();
const objects = [{ id: 1, type: 'rect', x: 0, y: 600, w: 3000, h: 40 }, { id: 2, type: 'spawn', x: 60, y: 490, w: 30, h: 100 },
  { id: 7, type: 'lever', x: 400, y: 560, w: 30, h: 40, customId: 'w7', targetIds: 'g1' }, { id: 8, type: 'rect', x: 800, y: 400, w: 40, h: 200, customId: 'g1' },
  { id: 9, type: 'finishline', x: 2900, y: 474, w: 52, h: 126 }];
fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([{ mapName: 'Trick Run', mapType: 'race', author: 'w28', date: now, created: now,
  rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: ['race'], mapData: JSON.stringify({ mode: 'race', gravity: 9, objects }) }]));
const BASE = 'http://127.0.0.1:3294';
const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: '3294', OWNER_ALIASES: 'w28', RACE_LOBBY_MS: '1500', RACE_ROUND_MS: '4000' } });
let ipN = 0;
function player(name, room) {
  const s = io(BASE, { transports: ['websocket'], forceNew: true, extraHeaders: { 'CF-Connecting-IP': '10.28.' + (++ipN) + '.1' } });
  const p = { s, name, ev: [] };
  ['racePhase', 'trialToggle', 'trialTrap', 'raceResult'].forEach(e => s.on(e, d => p.ev.push({ e, d, t: Date.now() })));
  p.join = () => s.emit('join', { playerName: name, gameMode: 'race', room });
  p.last = (e, f, after) => { const x = p.ev.filter(v => v.e === e && v.t > (after || 0) && (!f || f(v.d))).pop(); return x && x.d; };
  p.count = (e) => p.ev.filter(v => v.e === e).length;
  return p;
}
(async () => {
  await until(() => fetch(BASE + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [], socks = [];
  try {
    console.log('Комната и роли:');
    const r = await fetch(BASE + '/getTrialsRoom').then(x => x.json());
    ok(r.room === 'trials-1', 'выдана комната Trials', r.room);
    const P = ['ta', 'tb'].map(n => player(n, r.room)); socks.push(...P);
    await Promise.all(P.map(p => new Promise(x => p.s.once('connect', x))));
    for (const p of P) { p.join(); await sleep(150); }
    const rd = await until(() => P[0].last('racePhase', d => d.phase === 'round' && d.trials && d.trials.trickster), 15000);
    ok(rd && rd.trials.lives === 3 && rd.goal === 'first', 'раунд Trials: есть ловкач, у бегущих 3 жизни', rd && JSON.stringify(rd.trials));
    const rdAt = Date.now();
    const trick = P.find(p => p.s.id === rd.trials.trickster), run = P.find(p => p !== trick);
    run.s.emit('trialToggle', { id: 7 });
    await sleep(400);
    ok(!run.last('trialToggle'), 'бегущий рычаги удалённо не дёргает');
    trick.s.emit('trialToggle', { id: 7 });
    ok(!!await until(() => run.last('trialToggle', d => d.id === 7), 3000), 'ловкач дёрнул рычаг — у всех');
    trick.s.emit('trialTrap', { x: 600, y: 600 }); trick.s.emit('trialTrap', { x: 700, y: 600 });
    await sleep(500);
    ok(run.count('trialTrap') === 1, 'шипы — не чаще раза в 3 секунды', run.count('trialTrap'));
    const res = await until(() => run.last('raceResult', null, rdAt), 10000);
    ok(res && res.winner === trick.name, 'никто не дошёл — победил ловкач', res && JSON.stringify(res));
    const rd2 = await until(() => P[0].last('racePhase', d => d.phase === 'round' && d.trials && d.trials.trickster, rdAt + 1000), 15000);
    ok(rd2 && rd2.trials.trickster === run.s.id, 'в следующем раунде ловкач — другой', rd2 && rd2.trials.name);
    console.log('Движок:');
    const pg = await b.newPage(); pg.on('pageerror', e => errs.push(e.message.slice(0, 200)));
    await pg.goto(BASE + '/game.html?mode=race&view=Trick%20Run&author=w28');
    await until(() => pg.evaluate(() => window.GAME && GAME.playing && GAME.objects.length >= 5), 15000);
    ok(await pg.evaluate(() => { const l = GAME.objects.find(o => o.id === 7); GAME.trialToggle(7); const g = GAME.objects.find(o => o.id === 8); return l._act === true && g._act === true; }), 'рычаг ловкача включает свою цель');
    const n0 = await pg.evaluate(() => GAME.objects.length);
    await pg.evaluate(() => GAME.trialTrap(600, 600, 600));
    ok(await pg.evaluate(n0 => GAME.objects.length === n0 + 1 && GAME.objects.some(o => o.deadly && o._trialUntil), n0), 'шипы ловкача появились');
    ok(!!await until(() => pg.evaluate(n0 => GAME.objects.length === n0, n0), 3000), 'и исчезли через время');
    await pg.evaluate(() => GAME.setLives(3));
    ok(await pg.evaluate(() => GAME.raceLives === 3), 'бегущим — 3 жизни');
    console.log('Список комнат:');
    const rl = await b.newPage(); rl.on('pageerror', e => errs.push('race: ' + e.message.slice(0, 200)));
    await rl.goto(BASE + '/race');
    ok(!!await until(() => rl.evaluate(() => !!document.querySelector('.rlTrials')), 8000), 'на странице гонки — кнопка Trials');
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  socks.forEach(p => { try { p.s.close(); } catch (e) {} });
  await b.close(); try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
