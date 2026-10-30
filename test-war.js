/* Война (см. war.js): комнаты «war-N», раунды по очереди — все против всех, команды, Голодные
   игры, контрольные точки, Bro RED. Бой считает клиент атакующего, сервер проверяет: выстрел был,
   перезарядка прошла, патрон был, цель жива, враг и в досягаемости. Жетоны на карте и магазин —
   и в войне (оружие), и в обычных прятках (бусты, с ограничением по роли).
   Свой сервер на копии репозитория: 3246, короткие лобби/раунды, малые пороги победы. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const ROOT = __dirname;
const OWNER = 'wartestowner';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(50); } return null; };

const SPOTS = [200, 1400, 2600].map(x => ({ x, y: 460, w: 80, h: 100 }));
function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-war-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git|builtinMaps)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const objects = [{ id: 1, type: 'spawn', x: 700, y: 450, w: 30, h: 100 }, { id: 2, type: 'rect', x: 0, y: 560, w: 3000, h: 80 }]
    .concat(SPOTS.map((s, i) => Object.assign({ id: 10 + i, type: 'rect', hideSpot: true }, s)));
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([{ mapName: 'Arena', mapType: 'hideAndSeek',
    mapData: JSON.stringify({ mode: 'hideAndSeek', objects }), author: OWNER, date: Date.now(), created: Date.now(),
    rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: [] }]));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), OWNER_ALIASES: OWNER, HS_VARIANT: '', HS_LOBBY_MS: '2500', HS_ROUND_MS: '20000',
      WAR_RESPAWN_MS: '1200', WAR_FFA_WIN: '3', WAR_TDM_WIN: '2', TOK_EVERY_MS: '700' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
let ipN = 0;
function player(base, name, room) {
  const s = io(base, { transports: ['websocket'], forceNew: true, extraHeaders: { 'CF-Connecting-IP': '10.46.' + (++ipN) + '.1' } });
  const p = { s, name, ev: [], x: 700, y: 486, sid: 1 };
  ['hsRoulette', 'hsPhase', 'hsState', 'hsReveal', 'hsTeams', 'warShot', 'warHp', 'warDown', 'warUp', 'warSpawn', 'warAmmo',
   'toks', 'tokAdd', 'tokGone', 'tokBank', 'shopOk', 'shopNo', 'boost', 'domState'].forEach(e => s.on(e, d => p.ev.push({ e, d, t: Date.now() })));
  p.join = () => s.emit('join', { playerName: name, gameMode: 'hideAndSeek', room });
  p.at = (x, y) => { p.x = x; p.y = y === undefined ? 486 : y; s.emit('movePlayer', { position: { x: p.x, y: p.y, w: 30, h: 74 } }); };
  const hb = setInterval(() => s.connected && s.emit('movePlayer', { position: { x: p.x, y: p.y, w: 30, h: 74 } }), 1500);
  s.on('disconnect', () => clearInterval(hb));
  p.last = (e, f, after) => { const x = p.ev.filter(v => v.e === e && v.t > (after || 0) && (!f || f(v.d))).pop(); return x && x.d; };
  p.count = (e, f, after) => p.ev.filter(v => v.e === e && v.t > (after || 0) && (!f || f(v.d))).length;
  p.fire = (w, extra) => { const sid = p.sid++; s.emit('warShot', Object.assign({ w, sid, x: p.x, y: p.y, vx: 10, vy: 0 }, extra || {})); return sid; };
  p.hitT = (t, sid, extra) => s.emit('warHit', Object.assign({ t: t.s.id, sid }, extra || {}));
  // удар вплотную: подойти, ударить, засчитать попадание; ждём перезарядку
  p.punch = async (t) => { p.at(t.x - 40, t.y); await sleep(60); const sid = p.fire('fist'); await sleep(30); p.hitT(t, sid); await sleep(380); };
  return p;
}
const hpOf = (p, id, after) => { const h = p.last('warHp', d => d.id === id, after); return h ? h.hp : null; };

(async () => {
  const S = server(3246);
  process.on('exit', () => S.kill());
  if (!await until(() => fetch(S.base + '/').then(r => r.ok).catch(() => false), 20000)) throw new Error('сервер не поднялся');

  console.log('Страница и комната:');
  const page = await fetch(S.base + '/war').then(r => r.text());
  ok(/'war'/.test(page) && /warText/.test(page), 'страница /war открывается');
  ok((await fetch(S.base + '/getBestRoom?mode=hideAndSeek&variant=war').then(r => r.json())).room === 'war-1', 'Играть — комната war-1');

  const room = 'war-' + Math.floor(Math.random() * 1e6);
  const a = player(S.base, 'w_a', room), b = player(S.base, 'w_b', room);
  await Promise.all([a, b].map(p => new Promise(r => p.s.once('connect', r))));
  a.join(); await sleep(200); b.join();
  a.at(700); b.at(740);

  console.log('Все против всех:');
  const r1 = await until(() => a.last('hsRoulette', d => d.variant === 'ffa'), 6000);
  ok(!!r1 && r1.shop === true && r1.winnerId === null && r1.fixed === 'war', 'вдвоём — сразу раунд «все против всех», магазин есть, искателя нет', r1 && JSON.stringify({ v: r1.variant, s: r1.shop }));
  const ph = await until(() => a.last('hsPhase', d => d.phase === 'round' && d.variant === 'ffa'), 9000);
  const t0 = Date.now() - 50;
  ok(!!ph && ph.war && ph.war.hp[a.s.id] === 100 && ph.war.hp[b.s.id] === 100 && ph.seekerIds.length === 0, 'раунд: у обоих по 100 здоровья, охотников нет');
  ok(!!await until(() => a.last('warSpawn', null, t0 - 2000), 2000), 'каждому сказано, где он появляется');
  ok(!!await until(() => a.last('tokBank', d => d.n >= 2), 2000), 'в начале раунда — 2 жетона', JSON.stringify(a.last('tokBank')));
  const toks = await until(() => a.last('toks', d => d.list.length > 0), 3000);
  ok(!!toks && toks.list.length >= 3, 'на карте лежат жетоны', toks && toks.list.length);

  // удар кулаком
  a.at(700); b.at(740); await sleep(120);
  let sid = a.fire('fist');
  const sid2 = a.fire('fist');            // второй удар сразу же — перезарядка не даст
  ok(!!await until(() => b.last('warShot', d => d.id === a.s.id && d.w === 'fist'), 2000), 'удар виден другим (warShot)');
  a.hitT(b, sid);
  ok(await until(() => hpOf(a, b.s.id, t0) === 80, 2000) === true, 'удар кулаком — минус 20 здоровья', hpOf(a, b.s.id, t0));
  a.hitT(b, sid); a.hitT(b, sid2); await sleep(300);
  ok(a.count('warHp', d => d.id === b.s.id, t0) === 1 && hpOf(a, b.s.id, t0) === 80, 'одно попадание за удар, второй удар до перезарядки не прошёл');
  await sleep(400);
  b.at(1400); await sleep(150);
  const sid3 = a.fire('fist'); a.hitT(b, sid3); await sleep(300);
  ok(hpOf(a, b.s.id, t0) === 80, 'кулак не достаёт через полкарты');
  // патроны: без них рогатка не стреляет; купили — стреляет
  await sleep(400);
  const sidS = a.fire('sling'); a.hitT(b, sidS); await sleep(300);
  ok(hpOf(a, b.s.id, t0) === 80 && !!a.last('warAmmo'), 'без патронов рогатка не стреляет');
  // жетон с карты
  const it = toks.list[0];
  a.at(it.x - 15, it.y - 37); await sleep(150);
  a.s.emit('tokTake', { id: it.id });
  ok(!!await until(() => b.last('tokGone', d => d.id === it.id && d.by === a.s.id), 2000) && a.last('tokBank').n === 3, 'подобрал жетон — +1', JSON.stringify(a.last('tokBank')));
  a.s.emit('tokTake', { id: it.id }); await sleep(200);
  ok(a.last('tokBank').n === 3, 'второй раз тот же жетон не взять');
  a.s.emit('shopBuy', { item: 'invis' }); await sleep(200);
  ok(!!a.last('shopNo', d => d.item === 'invis' && d.why === 'closed'), 'невидимость в войне не продаётся');
  a.s.emit('shopBuy', { item: 'sling' });
  const bought = await until(() => a.last('shopOk', d => d.item === 'sling'), 2000);
  ok(!!bought && bought.ammo.sling === 10 && a.last('tokBank').n === 0, 'купил рогатку за 3 жетона — 10 выстрелов', JSON.stringify(bought));
  a.s.emit('shopBuy', { item: 'bomb' });
  ok(!!await until(() => a.last('shopNo', d => d.item === 'bomb' && d.why === 'tokens'), 2000), 'на бомбы жетонов не хватает');
  // стрелок возвращается на своё место: жетон, за которым он ходил, лежит где попало, и оттуда цель
  // бывает дальше, чем бьёт рогатка (сервер такое попадание справедливо не засчитывает)
  a.at(700);
  // цель отошла: если сервер ещё не получил её новое место, попадание не засчитано — стреляем ещё раз
  let slingHit = false;
  for (let k = 0; k < 3 && !slingHit; k++) {
    b.at(1300); await sleep(150 + 300 * k);
    const sidS2 = a.fire('sling'); a.hitT(b, sidS2);
    slingHit = await until(() => hpOf(a, b.s.id, t0) === 65, 1200) === true;
  }
  ok(slingHit, 'рогатка попала издалека — минус 15', hpOf(a, b.s.id, t0));
  // нокаут и возрождение
  b.at(800); a.at(760);
  const tK = Date.now();
  for (let i = 0; i < 6 && !a.last('warDown', null, tK); i++) await a.punch(b);
  const dn = a.last('warDown', null, tK);
  ok(!!dn && dn.id === b.s.id && dn.by === a.s.id && dn.kills === 1, 'выбил — засчитано', JSON.stringify(dn));
  ok(!!await until(() => a.last('tokBank', d => d.n === 2, tK), 2000), 'за выбитого — 2 жетона', JSON.stringify(a.last('tokBank')));
  const dead = a.fire('fist');
  ok(!!await until(() => a.last('warUp', d => d.id === b.s.id && d.hp === 100, tK), 3000), 'через секунды выбитый снова в бою с полным здоровьем');
  // касание яда
  const tH = Date.now();
  b.s.emit('warHazard');
  ok(!!await until(() => a.last('warDown', d => d.id === b.s.id && d.by === null, tH), 2000), 'яд выбивает сразу');
  await until(() => a.last('warUp', d => d.id === b.s.id, tH), 3000);
  // ещё два нокаута — победа в раунде (порог 3 в тесте)
  for (let k = 0; k < 2; k++) {
    const tk = Date.now();
    await until(() => a.last('warUp', d => d.id === b.s.id, tk - 3000) || k === 0, 3000);
    for (let i = 0; i < 6 && !a.last('warDown', d => d.id === b.s.id, tk); i++) await a.punch(b);
    if (k === 0) await until(() => a.last('warUp', d => d.id === b.s.id, tk), 3000);
  }
  const rev = await until(() => a.last('hsReveal', d => d.variant === 'ffa'), 4000);
  ok(!!rev && rev.winnerName === 'w_a' && rev.kills[0].name === 'w_a' && rev.kills[0].k === 3, 'три нокаута — победа в раунде', rev && JSON.stringify(rev));

  console.log('Голодные игры (следующий раунд по очереди, вдвоём):');
  const r2 = await until(() => a.last('hsRoulette', d => d.variant === 'hunger'), 8000);
  ok(!!r2, 'следующий раунд — Голодные игры (команд и Bro RED вдвоём не бывает)');
  const t2 = Date.now();
  await until(() => a.last('hsPhase', d => d.phase === 'round' && d.variant === 'hunger', t2), 9000);
  const tl = await until(() => a.last('toks', d => d.list.length, t2), 3000);
  ok(!!tl && tl.list.length >= 3, 'жетонов на карте', tl && tl.list.length);
  // двое входят посреди Голодных игр — зрителями (одна жизнь на раунд), бой дальше вдвоём
  const c = player(S.base, 'w_c', room), dd = player(S.base, 'w_d', room);
  await Promise.all([c, dd].map(p => new Promise(r => p.s.once('connect', r))));
  c.join(); dd.join(); c.at(100); dd.at(120);
  const cs = await until(() => c.last('hsState'), 3000);
  ok(!!cs && cs.war && cs.war.hp[c.s.id] === 0 && cs.war.out.indexOf(c.s.id) !== -1, 'вошедший в Голодные игры — зритель до следующего раунда');
  a.at(700); b.at(740);
  for (let i = 0; i < 7 && !a.last('warDown', null, t2); i++) await a.punch(b);
  ok(!!a.last('warDown', d => d.id === b.s.id, t2), 'выбил в Голодных играх');
  const rev2 = await until(() => a.last('hsReveal', d => d.variant === 'hunger', t2), 4000);
  ok(!!rev2 && rev2.winnerName === 'w_a' && !a.last('warUp', d => d.id === b.s.id, t2), 'одна жизнь: остался один — победил, раунд окончен', rev2 && JSON.stringify(rev2));

  console.log('Вчетвером: контрольные точки, Bro RED, команды:');
  const P = [a, b, c, dd];

  const r4 = await until(() => a.last('hsRoulette', d => d.variant === 'cp'), 12000);
  ok(!!r4 && r4.points && r4.points.length === 3 && Object.values(r4.teams).filter(t => t === 'red').length === 2,
    'после Голодных игр — контрольные точки на всех укрытиях, 2 на 2', r4 && r4.points && r4.points.length);
  const t4 = Date.now();
  const ph4 = await until(() => a.last('hsPhase', d => d.phase === 'round' && d.variant === 'cp', t4), 9000);
  ok(!!ph4 && ph4.dom && ph4.dom.points.length === 3, 'раунд контрольных точек: точки ничьи');
  const tm4 = ph4 ? ph4.teams : {};
  const r4red = P.filter(p => tm4[p.s.id] === 'red'), r4blue = P.filter(p => tm4[p.s.id] === 'blue');
  r4red[0].at(900); r4red[1].at(940); await sleep(150);
  const ff = r4red[0].fire('fist'); r4red[0].hitT(r4red[1], ff); await sleep(400);
  ok(!a.last('warHp', d => d.id === r4red[1].s.id, t4), 'по своим урона нет');
  const pt = ph4 ? ph4.points[1] : SPOTS[1];
  P.forEach(p => p.at(p === r4red[0] ? pt.x + 20 : 50));
  const own = await until(() => a.last('domState', d => d.points[1].owner === 'red', t4), 6000);
  ok(!!own, 'красный простоял на точке — точка красных');
  // синий выбит — на точке его не считают
  r4blue[0].at(pt.x + 30); await sleep(100);
  r4blue[0].s.emit('warHazard');
  await until(() => a.last('warDown', d => d.id === r4blue[0].s.id, t4), 2000);
  const sc0 = (a.last('domState', null, t4) || { score: {} }).score.red;
  await sleep(2100);
  const sc1 = (a.last('domState', null, t4) || { score: {} }).score.red;
  ok(sc1 >= sc0 + 2, 'выбитый синий точку не оспаривает — красные копят очки', sc0 + ' → ' + sc1);
  const rev4 = await until(() => a.last('hsReveal', d => d.variant === 'cp', t4), 25000);
  ok(!!rev4 && rev4.winner === 'red', 'контрольные точки: побеждает команда с бóльшим счётом', rev4 && JSON.stringify(rev4.score));

  const r5 = await until(() => a.last('hsRoulette', d => d.variant === 'bro'), 12000);
  ok(!!r5 && !!r5.winnerId && r5.players.length === 4, 'дальше — Bro RED: рулетка выбирает одного', r5 && r5.winnerId);
  const t5 = Date.now();
  const ph5 = await until(() => a.last('hsPhase', d => d.phase === 'round' && d.variant === 'bro', t5), 9000);
  const broId = ph5 && ph5.war ? ph5.war.bro : null;
  const bro = P.find(p => p.s.id === broId), fighters = P.filter(p => p !== bro);
  ok(!!bro && ph5.war.max[broId] === 100 + 120 * 3 && ph5.war.hp[fighters[0].s.id] === 100, 'у Bro RED здоровья больше, у бойцов — 100', ph5 && JSON.stringify(ph5.war.max));
  fighters[0].at(1000); fighters[1].at(1040); await sleep(120);
  const fs1 = fighters[0].fire('fist'); fighters[0].hitT(fighters[1], fs1); await sleep(400);
  ok(!a.last('warHp', d => d.id === fighters[1].s.id, t5), 'бойцы друг друга не бьют');
  bro.at(1000); fighters[0].at(1040); await sleep(150);
  const bs = bro.fire('fist'); bro.hitT(fighters[0], bs);
  ok(await until(() => hpOf(a, fighters[0].s.id, t5) === 68, 2000) === true, 'удар Bro RED тяжелее (32 вместо 20)', hpOf(a, fighters[0].s.id, t5));
  for (let i = 0; i < 40 && !a.last('warDown', d => d.id === broId, t5); i++) {
    const f = fighters[i % 3];
    bro.at(1000); f.at(960);
    await sleep(40);
    const s5 = f.fire('fist'); await sleep(20); f.hitT(bro, s5);
    await sleep(140);
  }
  ok(!!a.last('warDown', d => d.id === broId, t5), 'бойцы втроём выбили Bro RED');
  const rev5 = await until(() => a.last('hsReveal', d => d.variant === 'bro', t5), 4000);
  ok(!!rev5 && rev5.winner === 'fighters' && !a.last('warUp', d => d.id === broId, t5), 'Bro RED не возрождается — победили бойцы', rev5 && JSON.stringify(rev5));

  // все против всех вчетвером — быстро, до трёх нокаутов
  const r6 = await until(() => a.last('hsRoulette', d => d.variant === 'ffa', t5), 12000);
  const t6 = Date.now();
  await until(() => a.last('hsPhase', d => d.phase === 'round' && d.variant === 'ffa', t6), 9000);
  for (let k = 0; k < 3; k++) {
    const tk = Date.now();
    b.at(800);
    for (let i = 0; i < 6 && !a.last('warDown', d => d.id === b.s.id, tk); i++) { a.at(760); await a.punch(b); }
    if (k < 2) await until(() => a.last('warUp', d => d.id === b.s.id, tk), 3000);
  }
  ok(!!r6 && !!await until(() => a.last('hsReveal', d => d.variant === 'ffa', t6), 4000), 'дальше снова «все против всех»');

  const r3 = await until(() => a.last('hsRoulette', d => d.variant === 'tdm', t6), 12000);
  ok(!!r3 && Object.values(r3.teams).filter(t => t === 'red').length === 2, 'и командный бой, 2 на 2', r3 && JSON.stringify(Object.values(r3.teams)));
  const t3 = Date.now();
  const ph3 = await until(() => a.last('hsPhase', d => d.phase === 'round' && d.variant === 'tdm', t3), 9000);
  const teams = ph3 ? ph3.teams : {};
  const red = P.filter(p => teams[p.s.id] === 'red'), blue = P.filter(p => teams[p.s.id] === 'blue');
  for (let k = 0; k < 2; k++) {
    const tk = Date.now();
    if (k) await until(() => a.last('warUp', d => d.id === blue[0].s.id, tk - 3000), 3000);
    blue[0].at(1000);
    for (let i = 0; i < 6 && !a.last('warDown', d => d.id === blue[0].s.id, tk); i++) { red[0].at(960); await red[0].punch(blue[0]); }
  }
  const rev3 = await until(() => a.last('hsReveal', d => d.variant === 'tdm', t3), 4000);
  ok(!!rev3 && rev3.winner === 'red' && rev3.score.red === 2, 'очко команде за каждого выбитого — красные победили', rev3 && JSON.stringify(rev3.score));

  console.log('Жетоны и бусты в обычных прятках:');
  const hroom = 'room' + Math.floor(Math.random() * 1e6);
  const h1 = player(S.base, 'h_a', hroom), h2 = player(S.base, 'h_b', hroom);
  await Promise.all([h1, h2].map(p => new Promise(r => p.s.once('connect', r))));
  h1.join(); await sleep(150); h2.join();
  const hr = await until(() => h1.last('hsRoulette', d => d.shop === true), 6000);
  ok(!!hr, 'в прятках тоже есть магазин');
  const hp = await until(() => h1.last('hsPhase', d => d.phase === 'round'), 12000);
  const ht = await until(() => h1.last('toks', d => d.list.length), 3000);
  ok(!!ht && ht.list.length >= 3, 'в раунде пряток на карте жетоны', ht && ht.list.length);
  const seeker = hp && hp.seekerId === h1.s.id ? h1 : h2, hider = seeker === h1 ? h2 : h1;
  // собираем, пока не наберётся 4: новые жетоны появляются там, где игроки уже ходили
  const known = (p) => {
    const all = [].concat((p.last('toks') || { list: [] }).list, p.ev.filter(v => v.e === 'tokAdd').map(v => v.d));
    return all.filter(x => !p.last('tokGone', d => d.id === x.id));
  };
  const tEnd = Date.now() + 15000;
  let wx = 300;
  while (Date.now() < tEnd && ((hider.last('tokBank') || {}).n || 0) < 4) {
    const l = known(hider);
    if (l.length) { const x = l[0]; hider.at(x.x - 15, x.y - 37); await sleep(120); hider.s.emit('tokTake', { id: x.id }); await sleep(250); }
    else { wx = wx > 2500 ? 300 : wx + 300; hider.at(wx); seeker.at(3000 - wx); await sleep(400); }
  }
  ok((hider.last('tokBank') || {}).n >= 4, 'прячущийся собрал жетоны', JSON.stringify(hider.last('tokBank')));
  hider.s.emit('shopBuy', { item: 'radar' });
  ok(!!await until(() => hider.last('shopNo', d => d.item === 'radar' && d.why === 'role'), 2000), 'радар — только искателю');
  hider.s.emit('shopBuy', { item: 'invis' });
  ok(!!await until(() => seeker.last('boost', d => d.id === hider.s.id && d.item === 'invis'), 2000), 'невидимость прячущегося видна всем как буст');
  hider.s.emit('shopBuy', { item: 'sling' });
  ok(!!await until(() => hider.last('shopNo', d => d.item === 'sling' && d.why === 'closed'), 2000), 'оружие в прятках не продаётся');

  const mroom = 'murder-' + Math.floor(Math.random() * 1e6);
  const m1 = player(S.base, 'm_a', mroom);
  await new Promise(r => m1.s.once('connect', r)); m1.join();
  const mr = await until(() => m1.last('hsRoulette'), 6000);
  ok(!!mr && mr.shop === false, 'в Murder Mystery жетонов и магазина нет');

  P.concat([h1, h2, m1]).forEach(p => p.s.close());
  console.log(`\n${pass} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
