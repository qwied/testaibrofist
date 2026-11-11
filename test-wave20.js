/* Двадцатая волна идей игроков: вертолёт спасения в зомби-раунде пряток — добежавший прячущийся
   спасён, зомби его уже не поймает; далеко от вертолёта спастись нельзя. Свой сервер: 3284. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const ROOT = __dirname;
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + String(x).slice(0, 220))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(60); } return null; };
const objs = [
  { type: 'rect', x: 0, y: 600, w: 3000, h: 40 },
  { type: 'spawn', x: 60, y: 500, w: 30, h: 100 },
  { type: 'zombie', x: 200, y: 500, w: 30, h: 100 },
  { type: 'heli', x: 2600, y: 510, w: 160, h: 90 }
];
function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave20-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git|builtinMaps)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const now = Date.now();
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([{ mapName: 'Heli Escape', mapType: 'hideAndSeek', author: 'w20', date: now, created: now, rating: 0, votes: {},
    boostLikes: 0, boostDislikes: 0, inGameModes: ['hideAndSeek'], mapData: JSON.stringify({ mode: 'hideAndSeek', apoc: true, gravity: 9, objects: objs }) }]));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), OWNER_ALIASES: 'w20', HS_LOBBY_MS: '2500', HS_ROUND_MS: '60000' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
(async () => {
  const S = server(3284);
  await until(() => fetch(S.base + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  try {
    const P = [];
    for (let i = 0; i < 3; i++) {
      const s = io(S.base, { transports: ['websocket'], forceNew: true });
      const p = { s, ev: [] };
      ['hsPhase', 'hsRescued', 'hsInfected'].forEach(ev => s.on(ev, d => p.ev.push([ev, d])));
      await new Promise(r => s.on('connect', r));
      s.emit('join', { playerName: 'H' + i, gameMode: 'hideAndSeek', room: 'z1' });
      s.emit('movePlayer', { position: { x: 300 + i * 50, y: 500, w: 30, h: 100 } });
      P.push(p);
    }
    // ждём зомби-раунд, где в начале лобби уже были все трое
    let round = null;
    for (let k = 0; k < 3 && !round; k++) {
      const r = await until(() => { const e = P[0].ev.filter(x => x[0] === 'hsPhase' && x[1].phase === 'round' && x[1].apoc).pop(); return e && e[1]; }, 70000);
      if (r && (r.seekerIds || []).length) round = r;
    }
    ok(!!round, 'зомби-раунд начался', round && JSON.stringify({ apoc: round.apoc, z: (round.seekerIds || []).length }));
    const zid = round.seekerIds[0];
    const z = P.find(p => p.s.id === zid), hiders = P.filter(p => p.s.id !== zid);
    const far = hiders[0], runner = hiders[1];
    far.s.emit('hsRescue'); await sleep(400);
    ok(!P[0].ev.some(x => x[0] === 'hsRescued'), 'далеко от вертолёта спастись нельзя');
    // бежим к вертолёту по шагам (так считает путь и сервер)
    for (let x = 400; x <= 2620; x += 60) { runner.s.emit('movePlayer', { position: { x, y: 500, w: 30, h: 100 } }); await sleep(20); }
    runner.s.emit('hsRescue');
    const resc = await until(() => P[0].ev.find(x => x[0] === 'hsRescued'), 3000);
    ok(!!resc && resc[1].id === runner.s.id, 'у вертолёта — спасён, все видят', resc && JSON.stringify(resc[1]));
    // зомби догоняет спасённого — заразить уже нельзя
    for (let x = 300; x <= 2600; x += 60) { z.s.emit('movePlayer', { position: { x, y: 500, w: 30, h: 100 } }); await sleep(15); }
    z.s.emit('hsCatch', { targetId: runner.s.id }); await sleep(500);
    ok(!P[0].ev.some(x => x[0] === 'hsInfected' && x[1].id === runner.s.id), 'спасённого зомби не поймает');
    P.forEach(p => p.s.close());
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  S.kill(); process.exit(fail ? 1 : 0);
})();
