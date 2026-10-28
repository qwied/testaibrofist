/* Пиратская война (идея 2019 года «Missile war a.k.a. Pirate mode», см. war.js и hsPirateSetup в
   server.js). Встроенная карта «Pirate Bay» (builtinMaps/piratebay.json) попадает только в комнаты
   войны; на карте с пушками каждый второй раунд — пиратский: две команды на двух кораблях, базы —
   каюты. Из пушки стреляют, только стоя рядом, у каждой пушки своя перезарядка; ядро бьёт облаком
   яда: в центре — нокаут, у края — меньше и отбрасывает от взрыва, дальше — мимо; очко команде.
   Кого ранили и он тут же упал в ядовитую воду — нокаут стрелка. В браузере: пушки на карте, у
   своей пушки F стреляет ядром туда, куда смотрит мышь (сервер шлёт выстрел остальным). В редакторе
   пушка есть только в прятках, размер задан, вместо поворота — прицел. Свой сервер на копии
   репозитория: 3248. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
const SHOTS = process.env.SHOTS_DIR || '';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(60); } return null; };

function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-pirate-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  // своих карт у владельца нет: в комнатах войны — только встроенная «Pirate Bay»
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), OWNER_ALIASES: 'piratetestowner', HS_VARIANT: '', HS_LOBBY_MS: '3000',
      HS_ROUND_MS: '60000', WAR_RESPAWN_MS: '1200', WAR_TDM_WIN: '3', WAR_FFA_WIN: '1' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
let ipN = 0;
function bot(base, name, room) {
  const s = io(base, { transports: ['websocket'], forceNew: true, extraHeaders: { 'CF-Connecting-IP': '10.48.' + (++ipN) + '.1' } });
  const p = { s, name, ev: [], x: 1685, y: 660 };
  ['hsRoulette', 'hsPhase', 'hsReveal', 'warHp', 'warDown', 'warUp', 'warShot'].forEach(e => s.on(e, d => p.ev.push({ e, d, t: Date.now() })));
  p.join = () => s.emit('join', { playerName: name, gameMode: 'hideAndSeek', room });
  p.at = (x, y) => { p.x = x; p.y = y; s.emit('movePlayer', { position: { x, y, w: 30, h: 100 } }); };
  const hb = setInterval(() => s.connected && s.emit('movePlayer', { position: { x: p.x, y: p.y, w: 30, h: 100 } }), 300);
  s.on('disconnect', () => clearInterval(hb));
  p.last = (e, f, after) => { const x = p.ev.filter(v => v.e === e && v.t > (after || 0) && (!f || f(v.d))).pop(); return x && x.d; };
  return p;
}
const connected = (ps) => Promise.all(ps.map(p => new Promise(r => p.s.connected ? r() : p.s.once('connect', r))));

(async () => {
  const S = server(3248);
  process.on('exit', () => S.kill());
  if (!await until(() => fetch(S.base + '/').then(r => r.ok).catch(() => false), 20000)) throw new Error('сервер не поднялся');

  console.log('Карта только для войны:');
  const rnd = await fetch(S.base + '/getRandomMap?mapType=hideAndSeek').then(r => r.json());
  ok(rnd === null, 'в случайный подбор пряток «Pirate Bay» не попадает', JSON.stringify(rnd && rnd.mapName));
  const hs = [bot(S.base, 'pz_h1', 'pz' + Date.now()), bot(S.base, 'pz_h2', 'pz' + Date.now())];
  await connected(hs); hs.forEach(p => p.join());
  const hsLobby = await until(() => hs[0].last('hsPhase', d => d.phase === 'lobby') || hs[0].last('hsRoulette'), 8000);
  const hsMap = hs[0].last('hsPhase', d => d.phase === 'lobby');
  ok(!!hsLobby && !(hsMap && hsMap.map), 'в обычной комнате пряток её тоже нет', JSON.stringify(hsMap && hsMap.map));
  hs.forEach(p => p.s.close());

  console.log('Пиратский раунд:');
  const room = 'war-' + Math.floor(Math.random() * 1e6);
  const A = bot(S.base, 'pz_a', room), B = bot(S.base, 'pz_b', room);
  await connected([A, B]);
  A.join(); await sleep(150); B.join();
  const roul = await until(() => A.last('hsRoulette', d => d.variant === 'pirate'), 12000);
  ok(!!roul, 'на карте с пушками — Пиратская война', roul && roul.variant);
  const lob = A.last('hsPhase', d => d.phase === 'lobby') || {};
  ok(!!lob.map && lob.map.mapName === 'Pirate Bay', 'карта комнаты войны — «Pirate Bay»', JSON.stringify(lob.map));
  const teams = roul ? roul.teams : {};
  ok(!!roul && teams[A.s.id] && teams[B.s.id] && teams[A.s.id] !== teams[B.s.id], 'две команды по одному', JSON.stringify(teams));
  ok(!!roul && roul.bases.red.x === 560 && roul.bases.blue.x === 2640, 'базы — каюты кораблей: красные слева, синие справа',
    roul && JSON.stringify(roul.bases));
  const R = teams[A.s.id] === 'red' ? A : B, Bl = R === A ? B : A;
  const round = await until(() => A.last('hsPhase', d => d.phase === 'round' && d.war), 20000);
  ok(!!round && round.war.v === 'pirate' && round.war.guns.length === 8 && JSON.stringify(round.war.score) === '{"red":0,"blue":0}',
    'раунд: восемь пушек, счёт команд 0:0', round && JSON.stringify({ v: round.war.v, guns: round.war.guns.length, score: round.war.score }));

  const t0 = Date.now();
  // не у пушки — выстрела нет
  R.at(1685, 660); Bl.at(2400, 600); await sleep(400);
  R.s.emit('warShot', { w: 'cannon', c: 0, sid: 1, vx: 1.4, vy: -0.4 });
  await sleep(600);
  ok(!Bl.last('warShot', d => d.w === 'cannon', t0), 'вдали от пушки выстрела нет');
  // у пушки на палубе (пушка 0: x 1040..1112, y 656..700)
  R.at(1061, 600); await sleep(400);
  R.s.emit('warShot', { w: 'cannon', c: 0, sid: 2, vx: 1.4, vy: -0.4 });
  const sh = await until(() => Bl.last('warShot', d => d.w === 'cannon' && d.sid === 2, t0), 3000);
  ok(!!sh && sh.c === 0 && sh.x === 1076 && sh.y === 678 && sh.id === R.s.id, 'у пушки — ядро летит из её центра', sh && JSON.stringify(sh));
  R.s.emit('warShot', { w: 'cannon', c: 0, sid: 3, vx: 1.4, vy: -0.4 });
  await sleep(500);
  ok(!Bl.last('warShot', d => d.sid === 3, t0), 'пока пушка заряжается — второго выстрела нет');
  // попадание в центр облака — нокаут, очко красным
  const bc = { x: Bl.x + 15, y: Bl.y + 50 };
  R.s.emit('warHit', { t: Bl.s.id, sid: 2, x: bc.x, y: bc.y });
  const dn = await until(() => A.last('warDown', d => d.id === Bl.s.id, t0), 3000);
  ok(!!dn && dn.by === R.s.id && dn.score.red === 1, 'ядро в центр — нокаут, очко красным', dn && JSON.stringify(dn.score));
  const up = await until(() => Bl.last('warUp', d => d.id === Bl.s.id, t0), 4000);
  ok(!!up && up.at && up.at.x === 2640, 'выбитый синий вернулся в свою каюту', up && JSON.stringify(up.at));
  Bl.at(2400, 600); await sleep(1300);
  // мимо: взрыв в 400 px от цели
  const t1 = Date.now();
  R.s.emit('warShot', { w: 'cannon', c: 0, sid: 4, vx: 1.4, vy: -0.4 });
  await until(() => Bl.last('warShot', d => d.sid === 4, t1), 3000);
  R.s.emit('warHit', { t: Bl.s.id, sid: 4, x: Bl.x + 15 - 400, y: Bl.y + 50 });
  await sleep(500);
  ok(!A.last('warHp', d => d.id === Bl.s.id, t1), 'взрыв далеко от цели — мимо');
  // край облака: меньше урона и отбрасывает от взрыва (взрыв правее цели — отлетает влево)
  await sleep(1700);
  const t2 = Date.now();
  R.s.emit('warShot', { w: 'cannon', c: 0, sid: 5, vx: 1.4, vy: -0.4 });
  await until(() => Bl.last('warShot', d => d.sid === 5, t2), 3000);
  R.s.emit('warHit', { t: Bl.s.id, sid: 5, x: Bl.x + 15 + 100, y: Bl.y + 50 });
  const hp = await until(() => A.last('warHp', d => d.id === Bl.s.id, t2), 3000);
  ok(!!hp && hp.hp === 45 && hp.kx < 0 && hp.ky < 0, 'край облака: 55 урона и отбрасывает от взрыва', hp && JSON.stringify(hp));
  // раненый тут же упал в ядовитую воду — нокаут засчитан стрелку
  Bl.s.emit('warHazard');
  const dz = await until(() => A.last('warDown', d => d.id === Bl.s.id, t2), 3000);
  ok(!!dz && dz.by === R.s.id && dz.score.red === 2, 'сбит в яд после ядра — нокаут стрелка, очко красным', dz && JSON.stringify({ by: dz.by === R.s.id, score: dz.score }));
  await until(() => Bl.last('warUp', d => d.id === Bl.s.id, t2), 4000);
  // сам упал, никто не ранил — нокаут без стрелка, счёт не меняется
  const t3 = Date.now();
  Bl.s.emit('warHazard');
  const ds = await until(() => A.last('warDown', d => d.id === Bl.s.id, t3), 3000);
  ok(!!ds && !ds.by && ds.score.red === 2, 'сам упал в яд — без стрелка, счёт прежний', ds && JSON.stringify(ds.score));
  await until(() => Bl.last('warUp', d => d.id === Bl.s.id, t3), 4000);
  // синий стреляет из чужой (красной) пушки — тоже можно, но по своим ядро не бьёт: проверим третье очко красных
  await sleep(300);
  const t4 = Date.now();
  Bl.at(2400, 600); R.at(1061, 600); await sleep(400);
  R.s.emit('warShot', { w: 'cannon', c: 0, sid: 6, vx: 1.4, vy: -0.4 });
  await until(() => Bl.last('warShot', d => d.sid === 6, t4), 3000);
  R.s.emit('warHit', { t: Bl.s.id, sid: 6, x: Bl.x + 15, y: Bl.y + 50 });
  const rev = await until(() => A.last('hsReveal', d => d.variant === 'pirate', t4), 6000);
  ok(!!rev && rev.winner === 'red' && rev.score.red === 3, 'три нокаута — победа красных', rev && JSON.stringify({ w: rev.winner, s: rev.score }));
  // следующий раунд — не пиратский (через раунд), а следующий по очереди
  const r2 = await until(() => A.last('hsRoulette', d => d.variant !== 'pirate', t4), 12000);
  ok(!!r2 && r2.variant === 'ffa', 'следующий раунд — по очереди (Free for All)', r2 && r2.variant);
  A.s.close(); B.s.close();

  console.log('В браузере:');
  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'CF-Connecting-IP': '10.48.99.1' } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bfConsent', '1'); } catch (e) {} });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  const room2 = 'war-' + Math.floor(Math.random() * 1e6);
  await page.goto(S.base + '/game.html?mode=hideAndSeek&room=' + room2, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !!(window.GAME && GAME.objects && GAME.objects.length > 20)), 10000);
  const C = bot(S.base, 'pz_c', room2);
  await connected([C]); C.join();
  const r3 = await until(() => C.last('hsPhase', d => d.phase === 'round' && d.war && d.war.v === 'pirate'), 15000);
  ok(!!r3, 'браузер и бот — пиратский раунд', r3 && r3.war.v);
  const cTeam = r3 ? r3.teams[C.s.id] : null;
  const myTeam = cTeam === 'red' ? 'blue' : 'red';
  const guns = await page.evaluate(() => GAME.objects.filter(o => o.type === 'cannon').map(o => [o.x, o.y, o.w, o.h, o.rot, o.aim]));
  ok(guns.length === 8 && guns.every(g => g[2] === 72 && g[3] === 44 && g[4] === 0), 'на карте восемь пушек 72×44 без поворота', JSON.stringify(guns.slice(0, 2)));
  // встаём у своей палубной пушки, бот — на вражеской палубе
  const gi = myTeam === 'red' ? 0 : 4, g = guns[gi];
  C.at(myTeam === 'red' ? 2400 : 970, 600);
  await page.evaluate((g) => { GAME.teleportTo(g[0] + 36 - 15, g[1] + 44 - 100); }, g);
  await sleep(500);
  // мышь — над вражеской стороной, на уровне палуб
  const aim = await page.evaluate((side) => {
    const r = document.getElementById('c').getBoundingClientRect(), v = GAME.view, p = GAME.pl;
    const wx = p.x + side * 520, wy = p.y + 10;
    return { x: r.left + wx * v.s + v.x, y: r.top + wy * v.s + v.y };
  }, myTeam === 'red' ? 1 : -1);
  await page.mouse.move(aim.x, aim.y);
  await sleep(300);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'pirate-aim.png') });
  const aimed = await page.evaluate((i) => { const o = GAME.objects.filter(o => o.type === 'cannon')[i]; return { a: o._aim, ready: o._ready }; }, gi);
  ok(aimed.a !== undefined && aimed.ready === true && (myTeam === 'red' ? Math.cos(aimed.a) > 0 : Math.cos(aimed.a) < 0) && Math.sin(aimed.a) < 0,
    'ствол своей пушки смотрит за мышью — на врага и вверх', JSON.stringify(aimed));
  const t5 = Date.now();
  await page.keyboard.press('f');
  const csh = await until(() => C.last('warShot', d => d.w === 'cannon', t5), 3000);
  ok(!!csh && csh.c === gi && (myTeam === 'red' ? csh.vx > 0 : csh.vx < 0) && csh.vy < 0, 'F у пушки — выстрел ядом, бот видит его', csh && JSON.stringify(csh));
  await sleep(250);
  const after = await page.evaluate((i) => GAME.objects.filter(o => o.type === 'cannon')[i]._ready, gi);
  ok(after === false, 'после выстрела пушка заряжается');
  if (SHOTS) { await sleep(500); await page.screenshot({ path: path.join(SHOTS, 'pirate-shot.png') }); }
  const hud = await page.evaluate(() => document.getElementById('gTeamBox').textContent);
  ok(/Red 0 : 0 Blue/.test(hud), 'в шапке счёт команд', hud);
  ok(errs.length === 0, 'ошибок скриптов нет', errs.join(' | '));

  console.log('Редактор:');
  const ed = await ctx.newPage();
  ed.on('pageerror', e => errs.push('editor: ' + e.message.slice(0, 160)));
  await ed.goto(S.base + '/editor.html', { waitUntil: 'domcontentloaded' });
  await ed.waitForSelector('.modeBtn[data-mode="hideAndSeek"]', { timeout: 8000 });
  await ed.click('.modeBtn[data-mode="hideAndSeek"]');
  const shown = await ed.evaluate(() => { const t = document.querySelector('.tool[data-tool="cannon"]'); return t ? t.style.display : 'none'; });
  ok(shown === 'flex', 'в палитре пряток есть пушка');
  await ed.click('.tool[data-tool="cannon"]');
  const cv = await ed.evaluate(() => { const r = document.getElementById('c').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await ed.mouse.move(cv.x, cv.y); await ed.mouse.down(); await ed.mouse.move(cv.x + 120, cv.y + 90); await ed.mouse.up();
  const placed = await ed.evaluate(() => JSON.parse(window.getEditorMap().data).objects.filter(o => o.type === 'cannon'));
  ok(placed.length === 1 && placed[0].w === 72 && placed[0].h === 44, 'пушка ставится своим размером, не растягивается', JSON.stringify(placed));
  const insp = await ed.evaluate(() => document.body.innerText);
  ok(/Aim, degrees/.test(insp) && /Pirate War/.test(insp), 'в свойствах — прицел и подсказка про Пиратскую войну');
  await ed.click('.modeBtn[data-mode="race"]');
  const hidden = await ed.evaluate(() => document.querySelector('.tool[data-tool="cannon"]').style.display);
  ok(hidden === 'none', 'в гонке пушки в палитре нет');
  ok(errs.length === 0, 'ошибок скриптов нет и в редакторе', errs.join(' | '));
  await browser.close();
  C.s.close();
  console.log(`\n${pass} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
