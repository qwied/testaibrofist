/* Волна 24 — игровые идеи: выбор команды в лобби Team Battle, режим «Ниндзя» в прятках,
   капкан для искателя в магазине пряток, адаптивная сложность гонки, ветер со сменой стороны.
   Свои серверы: 3288 (команды), 3289 (ниндзя), 3290 (гонка). Запуск: node test-wave24.js */
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
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(70); } return null; };
const now = Date.now();
function server(port, maps, env) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave24-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git|builtinMaps)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify(maps));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), OWNER_ALIASES: 'w24', ...env } });
  return { tmp, base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
const mapOf = (n, type, objects) => ({ mapName: n, mapType: type, author: 'w24', date: now, created: now, rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0,
  inGameModes: [type], mapData: JSON.stringify({ mode: type, gravity: 9, objects }) });
const floor = { id: 2, type: 'rect', x: 0, y: 560, w: 3000, h: 80 };
const spots = [200, 2600].map((x, i) => ({ id: 10 + i, type: 'rect', hideSpot: true, fill: '#86efac', x, y: 460, w: 80, h: 100 }));
let ipN = 0;
function player(base, name, room, mode) {
  const s = io(base, { transports: ['websocket'], forceNew: true, extraHeaders: { 'CF-Connecting-IP': '10.24.' + (++ipN) + '.1' } });
  const p = { s, name, ev: [] };
  ['hsRoulette', 'hsPhase', 'hsTeams', 'hsTeamFull', 'racePhase'].forEach(e => s.on(e, d => p.ev.push({ e, d, t: Date.now() })));
  p.join = () => s.emit('join', { playerName: name, gameMode: mode || 'hideAndSeek', room });
  const hb = setInterval(() => s.connected && s.emit('movePlayer', { position: { x: 1420, y: 486, w: 30, h: 74 } }), 1500);
  s.on('disconnect', () => clearInterval(hb));
  p.last = (e, f) => { const x = p.ev.filter(v => v.e === e && (!f || f(v.d))).pop(); return x && x.d; };
  return p;
}
(async () => {
  const T = server(3288, [mapOf('TeamLand', 'hideAndSeek', [{ id: 1, type: 'spawn', x: 1420, y: 450, w: 30, h: 100 }, floor].concat(spots))], { HS_VARIANT: '', HS_LOBBY_MS: '9000', HS_ROUND_MS: '6000' });
  const N = server(3289, [mapOf('DarkLand', 'hideAndSeek', [{ id: 1, type: 'spawn', x: 1420, y: 450, w: 30, h: 100 }, floor].concat(spots))], { HS_VARIANT: 'ninja', HS_LOBBY_MS: '3000', HS_ROUND_MS: '8000' });
  const R = server(3290, [mapOf('Long Way', 'race', [floor, { id: 1, type: 'spawn', x: 60, y: 450, w: 30, h: 100 }, { id: 3, type: 'finishline', x: 2900, y: 434, w: 52, h: 126 }]),
    mapOf('Windy', 'race', [floor, { id: 1, type: 'spawn', x: 1400, y: 450, w: 30, h: 100 }, { id: 4, type: 'gravzone', x: 1000, y: 300, w: 900, h: 260, gmul: 1, wind: 5, windFlip: 0.5 }])],
    { RACE_LOBBY_MS: '1200', RACE_ROUND_MS: '2500' });
  for (const S of [T, N, R]) await until(() => fetch(S.base + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [];
  const socks = [];
  try {
    console.log('Капкан (war.js):');
    const ev = [];
    const fakeIo = { to: () => ({ emit: (e, d) => ev.push([e, d]) }) };
    const gs = { players: new Map([['h', { name: 'Hid', position: { x: 100, y: 500, w: 30, h: 74 } }], ['s', { name: 'Seek', position: { x: 700, y: 500, w: 30, h: 74 } }]]) };
    const W = require(path.join(T.tmp, 'war.js'))({ io: fakeIo, gameState: gs, hsMembers: () => [], hsTeamOf: () => null, sessionName: () => '', credit: () => 0, creditScore: () => 0, endEarly: () => {} });
    const st = { phase: 'round', roundNum: 1, seekerIds: new Set(['s']), tok: { bank: new Map([['h', 10], ['s', 10]]), items: [], next: 1, trail: [], trailMap: '', lastAt: new Map(), timer: null } };
    W.buy(st, 'r', 's', { item: 'trap' });
    ok(ev.some(x => x[0] === 'shopNo' && x[1].why === 'role'), 'искателю капкан не продаётся');
    W.buy(st, 'r', 'h', { item: 'trap' });
    const set = ev.find(x => x[0] === 'trapSet');
    ok(set && set[1].x === 115 && set[1].y === 574 && st.tok.bank.get('h') === 5, 'прячущийся ставит капкан у ног за 5 жетонов', JSON.stringify(set && set[1]));
    W.trapHit(st, 'r', 's', { id: set[1].id });
    ok(!ev.some(x => x[0] === 'trapGone'), 'издалека «наступить» нельзя');
    gs.players.get('s').position.x = 102;
    W.trapHit(st, 'r', 'h', { id: set[1].id });
    ok(!ev.some(x => x[0] === 'trapGone'), 'прячущийся в свой капкан не попадает');
    W.trapHit(st, 'r', 's', { id: set[1].id });
    const gone = ev.find(x => x[0] === 'trapGone');
    ok(gone && gone[1].victim === 's' && gone[1].ms === 3000, 'искатель наступил — застрял на 3 секунды', JSON.stringify(gone && gone[1]));
    st.roundNum = 2;
    ok(W.trapHit(st, 'r', 's', { id: set[1].id }) === undefined && (st.hsTraps || []).length === 0, 'в новом раунде старых капканов нет');

    console.log('Выбор команды:');
    const room = 'team-' + Math.floor(Math.random() * 1e6);
    const P = ['ta', 'tb', 'tc'].map(n => player(T.base, n, room)); socks.push(...P);
    await Promise.all(P.map(p => new Promise(r => p.s.once('connect', r))));
    for (const p of P) { p.join(); await sleep(120); }
    const rl = await until(() => { const r = P[0].last('hsRoulette', d => d.teams && Object.keys(d.teams).length === 3); return r; }, 30000);
    ok(!!rl, 'команды розданы в лобби', rl && JSON.stringify(rl.teams));
    if (rl) {
      const teams = rl.teams, cnt = {}; Object.values(teams).forEach(t => { cnt[t] = (cnt[t] || 0) + 1; });
      const big = Object.keys(cnt).find(t => cnt[t] === 2), small = Object.keys(cnt).find(t => cnt[t] === 1);
      const mover = P.find(p => teams[p.s.id] === big), lone = P.find(p => teams[p.s.id] === small);
      lone.s.emit('hsPickTeam', big);
      ok(!!await until(() => lone.last('hsTeamFull'), 3000), 'в команду, где людей больше, — нельзя');
      mover.s.emit('hsPickTeam', small);
      const nt = await until(() => P[0].last('hsTeams', d => d.teams[mover.s.id] === small), 3000);
      ok(!!nt, 'из большей команды — в меньшую можно', nt && JSON.stringify(nt.teams));
    }
    const tp = await b.newPage(); tp.on('pageerror', e => errs.push('team: ' + e.message.slice(0, 200)));
    await tp.goto(T.base + '/game.html?mode=hideAndSeek&room=' + room);
    ok(!!await until(() => tp.evaluate(() => { const e = document.getElementById('teamPick'); return e && e.style.display !== 'none' && e.querySelectorAll('button').length === 2; }), 30000),
      'в лобби командного режима — кнопки выбора команды');
    await tp.close();

    console.log('Ниндзя:');
    const np = await b.newPage(); np.on('pageerror', e => errs.push('ninja: ' + e.message.slice(0, 200)));
    await np.addInitScript(() => {
      window.__vig = 0; const f = CanvasRenderingContext2D.prototype.createRadialGradient;
      CanvasRenderingContext2D.prototype.createRadialGradient = function (a, b, r0, c, d, r1) { if (r0 === 225 && r1 > 329 && r1 < 331) window.__vig++; return f.apply(this, arguments); };
    });
    const nroom = 'nj' + Math.floor(Math.random() * 1e5);
    const q = player(N.base, 'nq', nroom); socks.push(q);
    await new Promise(r => q.s.once('connect', r)); q.join();
    await np.goto(N.base + '/game.html?mode=hideAndSeek&room=' + nroom);
    // первый раунд мог начаться классикой (в начале лобби игрок был один) — ждём «Ниндзя»
    const nr = await until(() => q.last('hsPhase', d => d.phase === 'round' && d.variant === 'ninja'), 40000);
    ok(nr && nr.variant === 'ninja', 'раунд «Ниндзя»', nr && nr.variant);
    ok(!!await until(() => np.evaluate(() => window.__vig > 5), 6000), 'в раунде — темнота вокруг игрока');
    ok(!!await until(() => np.evaluate(() => /Ninja|Ниндзя/.test(document.body.innerText)), 4000), 'подсказка режима на экране');
    await np.close();

    console.log('Адаптивная сложность:');
    const rp = player(R.base, 'rq', 'ad1', 'race'); socks.push(rp);
    await new Promise(r => rp.s.once('connect', r)); rp.join();
    const lob = await until(() => rp.ev.filter(v => v.e === 'racePhase' && v.d.phase === 'lobby').length >= 2 && rp.last('racePhase', d => d.phase === 'lobby'), 15000);
    ok(lob && lob.mood === 'easy', 'никто не дошёл — следующая карта «попроще»', lob && JSON.stringify({ mood: lob.mood }));

    console.log('Ветер со сменой стороны:');
    const wp = await b.newPage(); wp.on('pageerror', e => errs.push('wind: ' + e.message.slice(0, 200)));
    await wp.goto(R.base + '/game.html?mode=race&view=Windy&author=w24');
    await until(() => wp.evaluate(() => window.GAME && GAME.playing && GAME.pl && GAME.pl.ground), 15000);
    const dirs = await wp.evaluate(async () => { const out = new Set(); let x = GAME.pl.x;
      for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 100)); const d = GAME.pl.x - x; x = GAME.pl.x; if (Math.abs(d) > 3) out.add(Math.sign(d)); } return Array.from(out); });
    ok(dirs.length === 2, 'ветер дует то вправо, то влево', JSON.stringify(dirs));
    await wp.close();
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  socks.forEach(p => p.s.close());
  await b.close(); T.kill(); N.kill(); R.kill(); process.exit(fail ? 1 : 0);
})();
