/* Team Battle на четыре команды (идея 2019 года «4 team capture the flag», см. hsTeamSetup в
   server.js): с 8 игроков и на карте хотя бы с четырьмя укрытиями к красным и синим добавляются
   зелёные и жёлтые. Базы — четыре самых разнесённых укрытия, у Domination ещё точка в стороне от
   всех баз. Флаг можно нести любой вражеский, по одному; очко — у своей базы, пока свой флаг дома.
   Свой сервер на копии репозитория: 3244, короткие лобби и раунды, раунды по очереди. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
const OWNER = 'teams4testowner';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(80); } return null; };

// пять укрытий: базы встанут на 200, 2600, 1400 и 900, пятая точка Domination — 1900
const SPOTS = [200, 900, 1400, 1900, 2600].map(x => ({ x, y: 460, w: 80, h: 100 }));
function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-teams4-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const objects = [{ id: 1, type: 'spawn', x: 1420, y: 450, w: 30, h: 100 }, { id: 2, type: 'rect', x: 0, y: 560, w: 3000, h: 80 }]
    .concat(SPOTS.map((s, i) => Object.assign({ id: 10 + i, type: 'rect', hideSpot: true, fill: '#86efac' }, s)));
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([{ mapName: 'QuadLand', mapType: 'hideAndSeek',
    mapData: JSON.stringify({ mode: 'hideAndSeek', objects }), author: OWNER, date: Date.now(), created: Date.now(),
    rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: [] }]));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), OWNER_ALIASES: OWNER, HS_VARIANT: '', HS_LOBBY_MS: '4000', HS_ROUND_MS: '9000' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
let ipN = 0;
function player(base, name, room) {
  const s = io(base, { transports: ['websocket'], forceNew: true, extraHeaders: { 'CF-Connecting-IP': '10.44.' + (++ipN) + '.1' } });
  const p = { s, name, ev: [], x: 1420, y: 486 };
  ['hsRoulette', 'hsPhase', 'hsTeams', 'ctfState', 'domState', 'hsReveal'].forEach(e => s.on(e, d => p.ev.push({ e, d, t: Date.now() })));
  p.join = () => s.emit('join', { playerName: name, gameMode: 'hideAndSeek', room });
  p.at = (x, y) => { p.x = x; p.y = y === undefined ? 486 : y; s.emit('movePlayer', { position: { x: p.x, y: p.y, w: 30, h: 74 } }); };
  const hb = setInterval(() => s.connected && s.emit('movePlayer', { position: { x: p.x, y: p.y, w: 30, h: 74 } }), 2000);
  s.on('disconnect', () => clearInterval(hb));
  p.walk = async () => { for (const dx of [0, 150, 300, 150, 0]) { p.at(1420 + dx); await sleep(60); } };
  p.last = (e, f, after) => { const x = p.ev.filter(v => v.e === e && v.t > (after || 0) && (!f || f(v.d))).pop(); return x && x.d; };
  return p;
}
const four = (teams) => { const v = Object.values(teams || {}); return ['red', 'blue', 'green', 'yellow'].every(t => v.filter(x => x === t).length === 2); };

(async () => {
  const S = server(3244);
  process.on('exit', () => S.kill());
  if (!await until(() => fetch(S.base + '/').then(r => r.ok).catch(() => false), 20000)) throw new Error('сервер не поднялся');
  const room = 'team-' + Math.floor(Math.random() * 1e6);
  const P = ['q_a', 'q_b', 'q_c', 'q_d', 'q_e', 'q_f', 'q_g', 'q_h'].map(n => player(S.base, n, room));
  await Promise.all(P.map(p => new Promise(r => p.s.once('connect', r))));
  for (const p of P) { p.join(); await sleep(100); }

  console.log('Четыре команды:');
  // вдвоём режим стартовал сразу на две команды; со следующего лобби в комнате 8 — команд четыре
  const r4 = await until(() => P[0].last('hsRoulette', d => four(d.teams)), 40000);
  ok(!!r4, 'с 8 игроков — четыре команды по двое', r4 && JSON.stringify(Object.values(r4.teams).sort()));
  ok(!!r4 && Object.keys(r4.bases).sort().join() === 'blue,green,red,yellow', 'у каждой команды своя база');
  const bx = r4 ? Object.keys(r4.bases).map(t => t + ':' + r4.bases[t].x).sort().join(',') : '';
  ok(!!r4 && r4.bases.red.x === 200 && r4.bases.blue.x === 2600 && r4.bases.green.x === 1400 && r4.bases.yellow.x === 900,
    'базы — самые разнесённые укрытия', bx);
  if (r4 && r4.variant === 'dom') ok(r4.points.length === 5 && r4.points[4].x === 1900, 'Domination: пять точек — базы и ещё одна в стороне', r4.points.map(p => p.x).join(','));

  // ждём раунд Capture the Flag на четыре команды
  const cr = await until(() => P[0].last('hsPhase', d => d.phase === 'round' && d.variant === 'ctf' && d.ctf && Object.keys(d.ctf.flags).length === 4), 40000);
  ok(!!cr && Object.keys(cr.ctf.score).sort().join() === 'blue,green,red,yellow', 'Capture the Flag: четыре флага и четыре счёта', cr && JSON.stringify(cr.ctf.score));
  const tStart = Date.now();
  const teams = cr ? cr.teams : {};
  const bases = cr ? cr.bases : {};
  const gp = P.find(p => teams[p.s.id] === 'green');
  await Promise.all(P.map(p => p.walk()));
  // зелёный берёт жёлтый флаг и несёт к себе
  gp.at(bases.yellow.x + 20); await sleep(120);
  gp.s.emit('ctfTouch', { team: 'yellow' });
  const took = await until(() => P[0].last('ctfState', d => d.ev && d.ev.ev === 'take' && d.ev.team === 'yellow', tStart), 3000);
  ok(!!took && took.flags.yellow === gp.s.id, 'зелёный взял жёлтый флаг', took && JSON.stringify(took.flags));
  // второй флаг сразу не дают
  gp.at(bases.blue.x + 20); await sleep(120);
  gp.s.emit('ctfTouch', { team: 'blue' });
  await sleep(500);
  ok(!(P[0].last('ctfState', d => d.flags && d.flags.blue, tStart)), 'второй вражеский флаг, пока несёшь первый, не взять');
  gp.at(bases.green.x + 20); await sleep(120);
  gp.s.emit('ctfTouch', { team: 'green' });
  const cap = await until(() => P[0].last('ctfState', d => d.ev && d.ev.ev === 'capture', tStart), 3000);
  ok(!!cap && cap.score.green === 1 && cap.flags.yellow === null, 'донёс до своей базы — очко зелёным, жёлтый флаг дома', cap && JSON.stringify(cap.score));

  // браузер входит посреди раунда — в одну из команд, в шапке счёт четырёх
  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'CF-Connecting-IP': '10.44.99.1' } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bfConsent', '1'); } catch (e) {} });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await page.goto(S.base + '/game.html?mode=hideAndSeek&room=' + room, { waitUntil: 'domcontentloaded' });
  const hud = await until(() => page.evaluate(() => { const b = document.getElementById('gTeamBox'); return b && b.style.display !== 'none' && /Yellow/.test(b.textContent) ? b.textContent : null; }), 10000);
  ok(!!hud && /Red 0 · Blue 0 · Green 1 · Yellow 0/.test(hud), 'в шапке счёт четырёх команд', hud);
  const lbl = await until(async () => { const t = await page.evaluate(() => document.getElementById('gRole').textContent); return /^(Red|Blue|Green|Yellow)$/.test(t) ? t : null; }, 8000);
  ok(!!lbl, 'вошедшему досталась команда', lbl);
  const fit = await page.evaluate(() => window.GAME.myOutfit);
  const colors = { Red: '#dc2626', Blue: '#2563eb', Green: '#16a34a', Yellow: '#ca8a04' };
  ok(!!fit && fit.kind === 'team' && fit.arg === colors[lbl], 'наряд — цвета своей команды', JSON.stringify(fit));
  const rev = await until(() => P[0].last('hsReveal', d => d.variant === 'ctf', tStart), 15000);
  ok(!!rev && rev.winner === 'green' && Object.keys(rev.score).length === 4, 'конец раунда: побеждают зелёные', rev && JSON.stringify(rev));
  ok(!!await until(() => page.evaluate(() => /Green team wins! 0 : 0 : 1 : 0/.test(document.body.innerText)), 4000), 'в браузере: «Green team wins! 0 : 0 : 1 : 0»');
  ok(errs.length === 0, 'ошибок скриптов нет', errs.join(' | '));
  await browser.close();
  P.forEach(p => p.s.close());
  console.log(`\n${pass} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
