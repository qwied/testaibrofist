/* Волна 30 — вариант пряток «Медик» (идея #761): один из прячущихся может один раз за раунд
   коснуться пойманного и вернуть его в игру. Свой сервер: 3296. */
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
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(80); } return null; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave30-'));
fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
  const r = path.relative(ROOT, x);
  return !(/^(node_modules|data|\.git|builtinMaps)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
} });
fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
fs.mkdirSync(path.join(tmp, 'data'));
const now = Date.now();
fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([{ mapName: 'MedLand', mapType: 'hideAndSeek', author: 'w30', date: now, created: now,
  rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: ['hideAndSeek'],
  mapData: JSON.stringify({ mode: 'hideAndSeek', objects: [{ id: 1, type: 'spawn', x: 300, y: 450, w: 30, h: 100 }, { id: 2, type: 'rect', x: 0, y: 560, w: 3000, h: 80 }] }) }]));
const BASE = 'http://127.0.0.1:3296';
const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: '3296', OWNER_ALIASES: 'w30', HS_VARIANT: 'medic', HS_LOBBY_MS: '3000', HS_ROUND_MS: '15000' } });
function player(n, name, room) {
  const s = io(BASE, { transports: ['websocket'], forceNew: true, extraHeaders: { 'CF-Connecting-IP': '10.30.' + n + '.1' } });
  const p = { s, name, ev: [], x: 100 + n * 40, y: 486 };
  ['hsPhase', 'hsOut', 'hsFreed'].forEach(e => s.on(e, d => p.ev.push({ e, d, t: Date.now() })));
  p.join = () => s.emit('join', { playerName: name, gameMode: 'hideAndSeek', room });
  p.at = (x, y) => { p.x = x; p.y = y; s.emit('movePlayer', { position: { x, y, w: 30, h: 74 } }); };
  const hb = setInterval(() => s.connected && s.emit('movePlayer', { position: { x: p.x, y: p.y, w: 30, h: 74 } }), 2000);
  s.on('disconnect', () => clearInterval(hb));
  p.walk = async () => { for (const dx of [150, 300, 150, 0]) { p.at(100 + dx, 486); await sleep(60); } };
  p.last = (e, f) => { const x = p.ev.filter(v => v.e === e && (!f || f(v.d))).pop(); return x && x.d; };
  p.count = (e, f) => p.ev.filter(v => v.e === e && (!f || f(v.d))).length;
  return p;
}
(async () => {
  await until(() => fetch(BASE + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const P = [];
  try {
    const room = 'md' + Math.floor(Math.random() * 1e5);
    for (let i = 0; i < 4; i++) P.push(player(i + 1, 'm' + i, room));
    await Promise.all(P.map(p => new Promise(r => p.s.once('connect', r))));
    for (const p of P) { p.join(); await sleep(120); }
    const rd = await until(() => P[0].last('hsPhase', d => d.phase === 'round' && d.variant === 'medic'), 60000);
    ok(rd && rd.medic && rd.seekerIds.indexOf(rd.medic) === -1, 'раунд «Медик»: медик — из прячущихся', rd && JSON.stringify({ medic: rd.medic, seekers: rd.seekerIds }));
    const seeker = P.find(p => p.s.id === rd.seekerIds[0]), medic = P.find(p => p.s.id === rd.medic);
    const hiders = P.filter(p => p !== seeker && p !== medic);
    await Promise.all(P.map(p => p.walk()));
    seeker.at(hiders[0].x, hiders[0].y); await sleep(80);
    seeker.s.emit('hsCatch', { targetId: hiders[0].s.id });
    ok(!!await until(() => P[0].count('hsOut', d => d.id === hiders[0].s.id) === 1, 3000), 'искатель поймал прячущегося');
    hiders[1].at(hiders[0].x, hiders[0].y); await sleep(80);
    hiders[1].s.emit('hsFree', { targetId: hiders[0].s.id });
    await sleep(700);
    ok(P[0].count('hsFreed') === 0, 'обычный прячущийся вернуть не может');
    medic.at(hiders[0].x, hiders[0].y); await sleep(80);
    medic.s.emit('hsFree', { targetId: hiders[0].s.id });
    const fr = await until(() => P[0].last('hsFreed'), 3000);
    ok(fr && fr.id === hiders[0].s.id && fr.medic, 'медик вернул пойманного в игру', JSON.stringify(fr));
    seeker.at(hiders[0].x, hiders[0].y); await sleep(1300);
    seeker.s.emit('hsCatch', { targetId: hiders[0].s.id });
    ok(!!await until(() => P[0].count('hsOut', d => d.id === hiders[0].s.id) === 2, 3000), 'вернувшегося можно поймать снова');
    medic.at(hiders[0].x, hiders[0].y); await sleep(1300);
    medic.s.emit('hsFree', { targetId: hiders[0].s.id });
    await sleep(800);
    ok(P[0].count('hsFreed') === 1, 'второй раз за раунд медик не спасает');
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  P.forEach(p => { try { p.s.close(); } catch (e) {} });
  try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
