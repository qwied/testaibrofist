/* Общие раунды гонки (см. raceRooms в server.js и racePhase в game.js): вся комната бежит одну
   карту — сервер ведёт отсчёт перед стартом (игроки стоят), раунд и его конец. Цели раунда из
   правил карты: обычная (финишируют все), «1st wins» (Deathrun: очки только у первого) и «Last one»
   (Last bro standing: кончились жизни — выбыл, последний оставшийся побеждает).
   Три своих сервера на копиях репозитория: 3237 — две обычные карты, 3238 — «1st wins»,
   3239 — «Last one» с тремя жизнями. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
const OWNER = 'raceroundsowner';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(80); } return null; };

// старт и финиш рядом — проверка «не быстрее прямой» почти ничего не требует
const nearMap = (extra) => JSON.stringify(Object.assign({ mode: 'race', objects: [
  { id: 1, type: 'spawn', x: 200, y: 400, w: 30, h: 100 },
  { id: 2, type: 'rect', x: 0, y: 560, w: 2400, h: 80 },
  { id: 3, type: 'finishline', x: 1800, y: 440, w: 30, h: 120 }] }, extra));
function server(port, maps) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-rounds-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git|builtinMaps)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify(maps.map(m => ({ mapName: m.name, mapType: 'race',
    mapData: m.data, author: OWNER, date: Date.now(), created: Date.now(), rating: 0, votes: {},
    boostLikes: 0, boostDislikes: 0, inGameModes: [] }))));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), OWNER_ALIASES: OWNER, RACE_LOBBY_MS: '3000', RACE_ROUND_MS: '40000' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
let ipN = 0;
function player(base, name, room) {
  const s = io(base, { transports: ['websocket'], forceNew: true, extraHeaders: { 'CF-Connecting-IP': '10.37.' + (++ipN) + '.1' } });
  const p = { s, name, ev: [], x: 200 };
  ['racePhase', 'raceState', 'raceFinished', 'raceOut', 'raceResult', 'raceScores'].forEach(e => s.on(e, d => p.ev.push({ e, d, t: Date.now() })));
  p.join = () => s.emit('join', { playerName: name, gameMode: 'race', room });
  const hb = setInterval(() => s.connected && s.emit('movePlayer', { position: { x: p.x, y: 486, w: 30, h: 74 } }), 2000);
  s.on('disconnect', () => clearInterval(hb));
  p.last = (e, f) => { const x = p.ev.filter(v => v.e === e && (!f || f(v.d))).pop(); return x && x.d; };
  p.score = () => { const l = p.last('raceScores'); const me = l && l.find(v => v.name === name); return me ? me.score : null; };
  // честный забег по карте раунда: старт, движение, финиш не раньше RACE_MIN_MS
  p.run = async (map) => {
    s.emit('raceStart', { author: map.author, mapName: map.mapName });
    const t0 = Date.now();
    for (let i = 0; i < 12; i++) { p.x = 200 + (i % 2) * 400; s.emit('movePlayer', { position: { x: p.x, y: 486, w: 30, h: 74 } }); await sleep(60); }
    await sleep(Math.max(0, 1700 - (Date.now() - t0)));
    s.emit('raceFinish', { author: map.author, mapName: map.mapName });
  };
  return p;
}
const phaseOf = (p, ph) => p.last('racePhase', d => d.phase === ph) || p.last('raceState', d => d.phase === ph);
async function openPage(browser, base, room, errs) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await page.goto(base + '/game.html?mode=race&room=' + room, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { const x = document.getElementById('bfConsent'); if (x) x.remove(); });
  return { page, ctx };
}

(async () => {
  const S1 = server(3237, [{ name: 'PlainOne', data: nearMap({}) }, { name: 'PlainTwo', data: nearMap({}) }]);
  const S2 = server(3238, [{ name: 'FirstWins', data: nearMap({ goal: 'first' }) }]);
  const S3 = server(3239, [{ name: 'LastOne', data: nearMap({ goal: 'last', lives: 3 }) }]);
  process.on('exit', () => { S1.kill(); S2.kill(); S3.kill(); });
  for (const s of [S1, S2, S3]) if (!await until(() => fetch(s.base + '/').then(r => r.ok).catch(() => false), 20000)) throw new Error('сервер не поднялся');
  const browser = await chromium.launch();
  const errs = [];

  // ================= обычная цель: одна карта, отсчёт, все финишировали — следующая карта =================
  console.log('обычная гонка:');
  const r1 = 'rr' + Math.floor(Math.random() * 1e6);
  const b1 = await openPage(browser, S1.base, r1, errs);            // браузер открывает комнату — с него начинается отсчёт
  const frozen = await until(() => b1.page.evaluate(() => window.GAME && window.GAME.playing && window.GAME.frozen === true), 8000);
  ok(!!frozen, 'отсчёт перед стартом: игрок стоит на старте (GAME.frozen)');
  const x0 = await b1.page.evaluate(() => window.GAME.pl.x);
  await b1.page.keyboard.down('ArrowRight'); await sleep(500); await b1.page.keyboard.up('ArrowRight');
  ok(Math.abs((await b1.page.evaluate(() => window.GAME.pl.x)) - x0) < 3, 'и не может сдвинуться до старта');
  const a = player(S1.base, 'rr_a', r1), b = player(S1.base, 'rr_b', r1);
  await Promise.all([a, b].map(p => new Promise(r => p.s.once('connect', r))));
  a.join(); b.join();
  const lob = await until(() => phaseOf(a, 'lobby'), 4000);
  const mapName = await b1.page.evaluate(() => document.getElementById('gMapName').textContent);
  ok(!!lob && lob.map && lob.map.mapName === mapName, 'вошедшие во время отсчёта получили ту же карту, что у браузера', lob && lob.map && lob.map.mapName + ' / ' + mapName);
  const round = await until(() => a.last('racePhase', d => d.phase === 'round'), 6000);
  ok(!!round && round.map.mapName === lob.map.mapName && round.msLeft === 40000, 'старт раунда — у всех одна карта и общее время', round && JSON.stringify({ map: round.map.mapName, ms: round.msLeft }));
  ok(!!await until(() => b1.page.evaluate(() => window.GAME.frozen === false), 4000), 'со стартом заморозку сняли');
  const x1 = await b1.page.evaluate(() => window.GAME.pl.x);
  await b1.page.keyboard.down('ArrowRight'); await sleep(500); await b1.page.keyboard.up('ArrowRight');
  ok((await b1.page.evaluate(() => window.GAME.pl.x)) - x1 > 40, 'и теперь игрок бежит');
  ok(/Go!/.test(await b1.page.evaluate(() => document.body.innerText)), 'в журнале: «Go!»');
  await Promise.all([a.run(round.map), sleep(300).then(() => b.run(round.map))]);
  const fa = await until(() => a.last('raceFinished', d => d.name === 'rr_a'), 4000);
  const fb = await until(() => a.last('raceFinished', d => d.name === 'rr_b'), 4000);
  ok(!!fa && !!fb && fa.place === 1 && fb.place === 2, 'места на финише: 1 и 2', JSON.stringify({ a: fa && fa.place, b: fb && fb.place }));
  ok(!!await until(() => b1.page.evaluate(() => /rr_a finished #1/.test(document.body.innerText)), 3000), 'в браузере: «rr_a finished #1»');
  ok((await until(() => a.score() > 0 && b.score() > 0 ? 1 : 0, 3000)) === 1, 'обычная цель: очки у обоих финишировавших', JSON.stringify({ a: a.score(), b: b.score() }));
  await sleep(2500);
  ok(!a.last('raceResult'), 'раунд ждёт браузерного игрока, который ещё бежит');
  await b1.ctx.close();                                            // ушёл — остальные уже на финише
  const res1 = await until(() => a.last('raceResult'), 5000);
  ok(!!res1 && res1.places.map(p => p.name).join() === 'rr_a,rr_b', 'все оставшиеся на финише — раунд окончен досрочно', JSON.stringify(res1));
  const lob2 = await until(() => a.last('racePhase', d => d.phase === 'lobby' && d.roundNum === 2), 3000);
  ok(!!lob2 && lob2.map.mapName !== lob.map.mapName, 'следующий раунд — на другой карте', lob2 && lob2.map.mapName);
  // вошёл посреди раунда — сразу получает его состояние
  await until(() => a.last('racePhase', d => d.phase === 'round' && d.roundNum === 2), 5000);
  const c = player(S1.base, 'rr_c', r1);
  await new Promise(r => c.s.once('connect', r)); c.join();
  const st = await until(() => c.last('raceState'), 4000);
  ok(!!st && st.phase === 'round' && st.map.mapName === lob2.map.mapName && st.msLeft > 30000, 'вошедший посреди раунда — та же карта и оставшееся время', st && JSON.stringify({ ph: st.phase, ms: st.msLeft }));
  [a, b, c].forEach(p => p.s.disconnect());

  // ================= «1st wins»: очки только у первого, раунд кончается вскоре после первого финиша =================
  console.log('1st wins (Deathrun):');
  const r2 = 'rf' + Math.floor(Math.random() * 1e6);
  const d1 = player(S2.base, 'fw_one', r2), d2 = player(S2.base, 'fw_two', r2);
  await Promise.all([d1, d2].map(p => new Promise(r => p.s.once('connect', r))));
  d1.join(); await sleep(150); d2.join();
  const fr = await until(() => d1.last('racePhase', d => d.phase === 'round'), 8000);
  ok(!!fr && fr.goal === 'first', 'цель раунда — «first»', fr && fr.goal);
  await d1.run(fr.map);
  const w1 = await until(() => d1.last('raceFinished'), 3000);
  ok(!!w1 && w1.place === 1, 'первый финишировал первым', JSON.stringify(w1));
  const t1 = Date.now();
  await d2.run(fr.map);
  ok(!!await until(() => d1.last('raceFinished', d => d.name === 'fw_two' && d.place === 2), 3000), 'второй тоже дошёл — второе место');
  await sleep(600);
  ok(d1.score() > 0 && !(d2.score() > 0), 'очки только у первого', JSON.stringify({ one: d1.score(), two: d2.score() }));
  const res2 = await until(() => d1.last('raceResult'), 7000);
  ok(!!res2 && res2.winner === 'fw_one' && Date.now() - t1 < 6500, 'через несколько секунд после первого финиша раунд окончен — победил первый', JSON.stringify(res2 && { w: res2.winner, why: res2.why }));
  [d1, d2].forEach(p => p.s.disconnect());

  // ================= «Last one»: у браузера кончаются жизни — выбыл; остался один — победил =================
  console.log('Last one (Last bro standing):');
  const r3 = 'rl' + Math.floor(Math.random() * 1e6);
  const b3 = await openPage(browser, S3.base, r3, errs);
  const e1 = player(S3.base, 'lo_one', r3), e2 = player(S3.base, 'lo_two', r3);
  await Promise.all([e1, e2].map(p => new Promise(r => p.s.once('connect', r))));
  await until(() => b3.page.evaluate(() => window.GAME && window.GAME.playing), 8000);
  e1.join(); e2.join();
  const lr = await until(() => e1.last('racePhase', d => d.phase === 'round'), 8000);
  ok(!!lr && lr.goal === 'last', 'цель раунда — «last»', lr && lr.goal);
  ok(!!await until(() => b3.page.evaluate(() => window.GAME.frozen === false && /Last bro standing/.test(document.body.innerText) || window.GAME.frozen === false), 4000), 'раунд начался');
  for (let i = 0; i < 3; i++) {
    await b3.page.evaluate(() => { window.GAME.pl.y = 6000; });
    await sleep(700);
  }
  const outB = await until(() => e1.last('raceOut'), 3000);
  ok(!!outB, 'у браузерного игрока кончились жизни — сервер объявил «выбыл»', JSON.stringify(outB));
  const me = await b3.page.evaluate(() => ({ fr: window.GAME.frozen, c: window.GAME.myColor, t: /You are out until the next map/.test(document.body.innerText) }));
  ok(me.fr === true && me.c === '#9ca3af' && me.t, 'он стоит серым до следующей карты, в журнале объяснение', JSON.stringify(me));
  ok(!e1.last('raceResult'), 'двое ещё в игре — раунд идёт');
  e1.s.emit('raceOut');
  const res3 = await until(() => e1.last('raceResult'), 5000);
  ok(!!res3 && res3.winner === 'lo_two', 'выбыл и второй — последний оставшийся победил', JSON.stringify(res3 && { w: res3.winner }));
  ok(!!await until(() => b3.page.evaluate(() => /lo_two wins!/.test(document.body.innerText)), 3000), 'в браузере: «lo_two wins!»');
  const back = await until(() => b3.page.evaluate(() => window.GAME.myColor !== '#9ca3af'), 5000);
  ok(!!back, 'новый раунд — выбывший снова в игре');
  await b3.ctx.close();
  [e1, e2].forEach(p => p.s.disconnect());

  ok(errs.length === 0, 'ошибок скриптов нет', errs.join(' | '));
  await browser.close(); S1.kill(); S2.kill(); S3.kill();
  console.log(pass + ' ok, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
