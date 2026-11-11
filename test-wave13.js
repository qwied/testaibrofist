/* Тринадцатая волна идей игроков — режимы: «Авто-бег» (опция гонки), дуэль 1 на 1 в гонке
   (комната на двоих, счёт побед), Hot Trap в прятках (искатель обязан поймать норму).
   Свои серверы: 3275 (гонка), 3276 (прятки). Запуск: node test-wave13.js */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const { io } = require('socket.io-client');
const ROOT = __dirname;
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + String(x).slice(0, 220))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(80); } return null; };
const run = [{ type: 'rect', x: 0, y: 600, w: 3000, h: 40 }, { type: 'spawn', x: 60, y: 500, w: 30, h: 100 }, { type: 'finishline', x: 1500, y: 474, w: 52, h: 126 }];
const yard = [{ type: 'rect', x: 0, y: 600, w: 3000, h: 40 }, { type: 'spawn', x: 60, y: 500, w: 30, h: 100 }];
function server(port, maps, env) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave13-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    // встроенные карты не копируем: в пуле гонки и пряток — только карты теста
    return !(/^(node_modules|data|\.git|builtinMaps)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify(maps));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), OWNER_ALIASES: 'w13', ...env } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
const now = Date.now();
const mapOf = (n, type, data) => ({ mapName: n, mapType: type, author: 'w13', date: now, created: now, rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0,
  inGameModes: [type], mapData: JSON.stringify(data) });
(async () => {
  const R = server(3275, [mapOf('Auto Dash', 'race', { mode: 'race', gravity: 9, autoRun: 1, objects: run })], { RACE_LOBBY_MS: '2500' });
  const H = server(3276, [mapOf('Trap Yard', 'hideAndSeek', { mode: 'hideAndSeek', gravity: 9, objects: yard })], { HS_VARIANT: 'hottrap', HS_LOBBY_MS: '3000', HS_ROUND_MS: '5000', HS_TRAP_MS: '6000' });
  await until(() => fetch(R.base + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  await until(() => fetch(H.base + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [];
  try {
    console.log('Авто-бег:');
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const v = await ctx.newPage(); v.on('pageerror', e => errs.push('view: ' + e.message.slice(0, 200)));
    await v.goto(R.base + '/game.html?mode=race&view=Auto%20Dash&author=w13');
    await until(() => v.evaluate(() => window.GAME && GAME.playing && GAME.objects.length >= 3), 15000);
    const x0 = await v.evaluate(() => GAME.pl.x); await sleep(800);
    ok(await v.evaluate(() => GAME.pl.x) > x0 + 150, 'без нажатий персонаж бежит сам');
    await v.keyboard.down('ArrowLeft'); await sleep(300); const xl = await v.evaluate(() => GAME.pl.x); await sleep(300);
    ok(Math.abs(await v.evaluate(() => GAME.pl.x) - xl) < 20, '«влево» притормаживает');
    await v.keyboard.up('ArrowLeft'); await v.close();

    console.log('Дуэль 1 на 1:');
    const d1 = await fetch(R.base + '/getDuelRoom').then(r => r.json());
    ok(/^duel-\d+$/.test(d1.room), 'выдана комната дуэли', d1.room);
    const pa = await ctx.newPage(); pa.on('pageerror', e => errs.push('a: ' + e.message.slice(0, 200)));
    await pa.goto(R.base + '/game.html?mode=race&room=' + d1.room);
    await until(() => pa.evaluate(() => window.GAME && GAME.playing), 15000);
    await sleep(800);
    ok(!!await until(() => pa.evaluate(() => /opponent|соперник/i.test(document.body.innerText)), 4000), 'один в дуэли — «ждём соперника»');
    const d2 = await fetch(R.base + '/getDuelRoom').then(r => r.json());
    ok(d2.room === d1.room, 'второго игрока ведёт в ту же дуэль', d2.room);
    const cb = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const pb = await cb.newPage(); pb.on('pageerror', e => errs.push('b: ' + e.message.slice(0, 200)));
    await pb.goto(R.base + '/game.html?mode=race&room=' + d2.room);
    await until(() => pb.evaluate(() => window.GAME && GAME.playing), 15000);
    const d3 = await fetch(R.base + '/getDuelRoom').then(r => r.json());
    ok(d3.room !== d1.room, 'полная дуэль — третьему новая комната', d3.room);
    const spy = io(R.base, { transports: ['websocket'], forceNew: true }); let denied = false;
    spy.on('joinDenied', () => { denied = true; });
    await new Promise(r => spy.on('connect', r)); spy.emit('join', { playerName: 'Third', gameMode: 'race', room: d1.room });
    ok(!!await until(() => denied, 3000), 'третьего в дуэль не пускает');
    spy.close();
    const score = await until(() => pa.evaluate(() => { const t = document.body.innerText; return /Duel score|Счёт дуэли/.test(t) ? t.match(/(Duel score|Счёт дуэли)[^\n]*/)[0] : null; }), 30000);
    ok(!!score && /1/.test(score), 'кто финишировал первым — получил очко дуэли', score);
    await pa.close(); await pb.close();

    console.log('Hot Trap:');
    const socks = [], phases = [], traps = [];
    for (let i = 0; i < 3; i++) {
      const s = io(H.base, { transports: ['websocket'], forceNew: true });
      await new Promise(r => s.on('connect', r));
      if (i === 0) { s.on('hsPhase', d => phases.push(d)); s.on('hotTrap', d => traps.push(d)); }
      s.emit('join', { playerName: 'T' + i, gameMode: 'hideAndSeek', room: 'tr1' });
      socks.push(s);
    }
    // первый раунд мог начаться классикой (на старте лобби игрок был один) — Hot Trap со следующего
    const rd = await until(() => phases.find(p => p.phase === 'round' && p.variant === 'hottrap'), 25000);
    ok(!!rd && rd.trap === 1 && rd.msLeft <= 5000, 'раунд Hot Trap: не длиннее обычного, норма 1 из 2 прячущихся', rd && JSON.stringify({ trap: rd.trap, ms: rd.msLeft }));
    const tr = await until(() => traps[0], 12000);
    ok(tr && tr.ok === false && tr.got === 0 && tr.quota === 1, 'никого не поймал — «искатель сгорел»', JSON.stringify(tr));
    socks.forEach(s => s.close());
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); R.kill(); H.kill(); process.exit(fail ? 1 : 0);
})();
