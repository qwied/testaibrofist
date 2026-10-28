/* Командные варианты пряток (идеи 2019 года, см. hsTeamSetup/hsDomTick в server.js): Capture the
   Flag и Domination на обычных картах пряток — базы и точки захвата ставятся на укрытия карты.
   Вариант задан принудительно (HS_VARIANT), поэтому он во втором раунде: первое лобби комната
   открывает одна, а командам нужно HS_TEAM_MIN игроков. Два своих сервера на копиях репозитория:
   3240 — Capture the Flag, 3241 — Domination. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
const OWNER = 'teamstestowner';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(80); } return null; };

// три укрытия: слева, в центре, справа (базы — крайние, третья точка Domination — центр)
const SPOTS = [{ x: 100, y: 460, w: 80, h: 100 }, { x: 1200, y: 460, w: 80, h: 100 }, { x: 2300, y: 460, w: 80, h: 100 }];
function server(port, variant, roundMs) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-teams-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const objects = [{ id: 1, type: 'spawn', x: 1220, y: 450, w: 30, h: 100 }, { id: 2, type: 'rect', x: 0, y: 560, w: 2500, h: 80 }]
    .concat(SPOTS.map((s, i) => Object.assign({ id: 10 + i, type: 'rect', hideSpot: true, fill: '#86efac' }, s)));
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([{ mapName: 'TeamLand', mapType: 'hideAndSeek',
    mapData: JSON.stringify({ mode: 'hideAndSeek', objects }), author: OWNER, date: Date.now(), created: Date.now(),
    rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: [] }]));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), OWNER_ALIASES: OWNER, HS_VARIANT: variant, HS_LOBBY_MS: '9500', HS_ROUND_MS: String(roundMs) } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
let ipN = 0;
function player(base, name, room) {
  const s = io(base, { transports: ['websocket'], forceNew: true, extraHeaders: { 'CF-Connecting-IP': '10.40.' + (++ipN) + '.1' } });
  const p = { s, name, ev: [], x: 1220, y: 486 };
  ['hsRoulette', 'hsPhase', 'hsTeams', 'ctfState', 'domState', 'hsReveal', 'playerJoined'].forEach(e => s.on(e, d => p.ev.push({ e, d, t: Date.now() })));
  p.join = () => s.emit('join', { playerName: name, gameMode: 'hideAndSeek', room });
  p.at = (x, y) => { p.x = x; p.y = y === undefined ? 486 : y; s.emit('movePlayer', { position: { x: p.x, y: p.y, w: 30, h: 74 } }); };
  const hb = setInterval(() => s.connected && s.emit('movePlayer', { position: { x: p.x, y: p.y, w: 30, h: 74 } }), 2000);
  s.on('disconnect', () => clearInterval(hb));
  // честный путь за раунд (сервер принимает действия с флагом только после HS_MIN_DIST)
  p.walk = async () => { for (const dx of [0, 150, 300, 150, 0]) { p.at(1220 + dx); await sleep(60); } };
  p.last = (e, f) => { const x = p.ev.filter(v => v.e === e && (!f || f(v.d))).pop(); return x && x.d; };
  p.count = (e, f) => p.ev.filter(v => v.e === e && (!f || f(v.d))).length;
  return p;
}
const at = (spot) => spot.x + 20;            // встать внутрь укрытия

(async () => {
  const C = server(3240, 'ctf', 40000), D = server(3241, 'dom', 16000);
  process.on('exit', () => { C.kill(); D.kill(); });
  for (const s of [C, D]) if (!await until(() => fetch(s.base + '/').then(r => r.ok).catch(() => false), 20000)) throw new Error('сервер не поднялся');
  const browser = await chromium.launch();
  const errs = [];

  // ================= Capture the Flag =================
  console.log('Capture the Flag:');
  const room = 'ctf' + Math.floor(Math.random() * 1e6);
  const P = ['ct_a', 'ct_b', 'ct_c', 'ct_d'].map(n => player(C.base, n, room));
  // параллельно — комната Domination (её второй раунд тоже ждать ~10 с лобби + раунд)
  const droom = 'dom' + Math.floor(Math.random() * 1e6);
  const Q = ['dm_a', 'dm_b', 'dm_c', 'dm_d'].map(n => player(D.base, n, droom));
  await Promise.all(P.concat(Q).map(p => new Promise(r => p.s.once('connect', r))));
  for (const p of P.concat(Q)) { p.join(); await sleep(100); }
  P.concat(Q).forEach(p => p.at(p.x));

  const roul = await until(() => P[0].last('hsRoulette', d => d.variant === 'ctf'), 70000);
  const teams = roul ? roul.teams : {};
  const reds = P.filter(p => teams[p.s.id] === 'red'), blues = P.filter(p => teams[p.s.id] === 'blue');
  ok(!!roul && reds.length === 2 && blues.length === 2 && roul.winnerId === null, 'рулетка режима — Capture the Flag, команды 2 на 2, искателя нет', roul && JSON.stringify(teams).length + ' байт');
  ok(!!roul && roul.bases.red.x === SPOTS[0].x && roul.bases.blue.x === SPOTS[2].x || !!roul && roul.bases.red.x === SPOTS[2].x && roul.bases.blue.x === SPOTS[0].x,
    'базы — два самых далёких укрытия карты', roul && JSON.stringify({ r: roul.bases.red.x, b: roul.bases.blue.x }));
  const RB = roul.bases.red, BB = roul.bases.blue;
  const round = await until(() => P[0].last('hsPhase', d => d.phase === 'round' && d.variant === 'ctf'), 20000);
  ok(!!round && round.ctf && round.ctf.score.red === 0 && round.ctf.flags.red === null && !round.seekerId, 'раунд: счёт 0:0, оба флага на базах');
  await Promise.all(P.map(p => p.walk()));

  // браузер входит посреди раунда — в меньшую (любую из равных) команду
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'CF-Connecting-IP': '10.40.99.1' } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await page.goto(C.base + '/game.html?mode=hideAndSeek&room=' + room, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { const x = document.getElementById('bfConsent'); if (x) x.remove(); });
  ok(!!await until(() => P[0].last('hsTeams', d => Object.keys(d.teams).length === 5), 10000), 'вошедшему досталась команда — всем разослан новый состав');
  const lbl = await until(async () => { const t = await page.evaluate(() => document.getElementById('gRole').textContent); return /^(Red|Blue)$/.test(t) ? t : null; }, 8000);
  ok(!!lbl, 'в шапке роль — его команда', lbl);
  const hud = await until(() => page.evaluate(() => { const b = document.getElementById('gTeamBox'); return b && b.style.display !== 'none' ? b.textContent : null; }), 5000);
  ok(!!hud && /Red 0\s*:\s*0 Blue/.test(hud), 'в шапке счёт команд', hud);
  const col = await page.evaluate(() => window.GAME.myColor);
  ok((lbl === 'Red' && col === '#dc2626') || (lbl === 'Blue' && col === '#2563eb'), 'цвет игрока — цвет команды', col);
  const fit = await page.evaluate(() => window.GAME.myOutfit);
  ok(!!fit && fit.kind === 'team' && fit.arg === col, 'модель — игрок команды: повязка и полоса её цвета', JSON.stringify(fit));

  const r1 = reds[0], b1 = blues[0];
  const flags = () => (P[0].last('ctfState') || round.ctf).flags;
  // красный бежит к синей базе и берёт синий флаг
  r1.at(at(BB)); await sleep(150);
  r1.s.emit('ctfTouch', { team: 'blue' });
  ok(!!await until(() => flags().blue === r1.s.id, 3000), 'красный у синей базы взял синий флаг');
  ok(!!await until(() => page.evaluate(() => /took the flag/.test(document.body.innerText)), 3000), 'в браузере: «… took the flag»');
  if (process.env.SHOT2) {             // снимок: несущий с флагом над головой у синей базы
    await page.evaluate((x) => window.GAME.teleportTo(x, 486), BB.x + 150);
    await sleep(700);
    await page.screenshot({ path: process.env.SHOT2 });
  }
  // чужой флаг у своей базы, но флаг уже занят — второй красный его не возьмёт
  reds[1].at(at(BB)); await sleep(150);
  reds[1].s.emit('ctfTouch', { team: 'blue' });
  await sleep(500);
  ok(flags().blue === r1.s.id, 'занятый флаг второй раз не берётся');
  // синий догоняет несущего и возвращает флаг
  b1.at(r1.x + 10); await sleep(150);
  b1.s.emit('ctfTag', { targetId: r1.s.id });
  ok(!!await until(() => flags().blue === null, 3000), 'синий коснулся несущего — флаг вернулся на базу');
  // снова взял и донёс до своей базы — очко
  r1.s.emit('ctfTouch', { team: 'blue' });
  await until(() => flags().blue === r1.s.id, 3000);
  // далеко от своей базы — очка нет
  r1.at(1220); await sleep(150);
  r1.s.emit('ctfTouch', { team: 'red' });
  await sleep(500);
  ok((P[0].last('ctfState').score.red | 0) === 0, 'вдали от своей базы очка нет');
  r1.at(at(RB)); await sleep(150);
  r1.s.emit('ctfTouch', { team: 'red' });
  ok(!!await until(() => P[0].last('ctfState', d => d.score.red === 1), 3000), 'донёс до своего флага — очко красным');
  ok(flags().blue === null, 'синий флаг вернулся на свою базу');
  ok(!!await until(() => page.evaluate(() => /Red 1\s*:\s*0 Blue/.test(document.getElementById('gTeamBox').textContent)), 3000), 'счёт в шапке обновился: Red 1 : 0 Blue');
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  // ещё два очка — победа досрочно
  for (let i = 0; i < 2; i++) {
    r1.at(at(BB)); await sleep(150); r1.s.emit('ctfTouch', { team: 'blue' });
    await until(() => flags().blue === r1.s.id, 3000);
    r1.at(at(RB)); await sleep(150); r1.s.emit('ctfTouch', { team: 'red' });
    await until(() => P[0].last('ctfState', d => d.score.red === 2 + i), 3000);
    await sleep(700);
  }
  const rev = await until(() => P[0].last('hsReveal', d => d.variant === 'ctf'), 5000);
  ok(!!rev && rev.winner === 'red' && rev.score.red === 3, 'три очка — красные победили досрочно', JSON.stringify(rev));
  ok(!!await until(() => page.evaluate(() => /Red team wins!/.test(document.body.innerText)), 4000), 'в браузере: «Red team wins!»');
  await ctx.close();
  P.forEach(p => p.s.disconnect());

  // ================= Domination =================
  console.log('Domination:');
  // пока шёл Capture the Flag, у Domination прошли целые раунды — ждём свежую рулетку, состав
  // команд у неё свой
  let tD = Date.now();
  const fresh = (e, f) => { const x = Q[0].ev.filter(v => v.e === e && v.t > tD && (!f || f(v.d))).pop(); return x && x.d; };
  const droul = await until(() => fresh('hsRoulette', d => d.variant === 'dom'), 40000);
  const dteams = droul ? droul.teams : {};
  ok(!!droul && droul.points.length === 3 && droul.points[1].x === SPOTS[1].x, 'три точки захвата: две базы и центр карты', droul && droul.points.map(p => p.x).join(','));
  const dr = Q.filter(p => dteams[p.s.id] === 'red'), db = Q.filter(p => dteams[p.s.id] === 'blue');
  const pts = droul.points;
  const dround = await until(() => fresh('hsPhase', d => d.phase === 'round' && d.variant === 'dom'), 20000);
  tD = Date.now();                     // итог нужен именно этого раунда, а не того, что шёл до него
  ok(!!dround && dround.dom && dround.dom.points.every(p => !p.owner), 'раунд: точки ничьи');
  const iA = 0, iB = 1;
  // все отходят в сторону, красный встаёт на точку A
  Q.forEach(p => p.at(700));
  dr[0].at(at(pts[iA]));
  const own = await until(() => { const d = Q[0].last('domState'); return d && d.points[iA].owner === 'red' ? d : null; }, 6000);
  ok(!!own, 'красный простоял на точке A 3 секунды — точка красная');
  const s0 = own ? own.score.red : 0;
  await sleep(2100);
  const s1 = (Q[0].last('domState') || {}).score.red;
  ok(s1 >= s0 + 2, 'своя точка приносит очко в секунду', s0 + ' → ' + s1);
  // синий приходит туда же — спор, точка остаётся красной
  db[0].at(at(pts[iA]));
  await sleep(3500);
  ok(Q[0].last('domState').points[iA].owner === 'red', 'вдвоём с соперником точку не отнять');
  // красный уходит — синий забирает
  dr[0].at(700);
  ok(!!await until(() => Q[0].last('domState', d => d.points[iA].owner === 'blue'), 6000), 'красный ушёл — синий захватил точку A');
  // второй синий берёт точку B: у синих две точки — к концу раунда они впереди
  db[1].at(at(pts[iB]));
  const drev = await until(() => fresh('hsReveal', d => d.variant === 'dom'), 20000);
  ok(!!drev && drev.winner && drev.score[drev.winner] > drev.score[drev.winner === 'red' ? 'blue' : 'red'], 'конец раунда: побеждает команда с бóльшим счётом', JSON.stringify(drev));
  Q.forEach(p => p.s.disconnect());

  ok(errs.length === 0, 'ошибок скриптов нет', errs.join(' | '));
  await browser.close(); C.kill(); D.kill();
  console.log(pass + ' ok, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
