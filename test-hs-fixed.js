/* Отдельные режимы на главной (см. hsFixedOf/hsMapOk в server.js, variant.html): комнаты пряток
   «murder-1», «cops-1», «ctf-1», «dom-1» всегда играют свой вариант, с двух игроков; одиночке
   приходит «ждём второго — пока обычные прятки», второй вошедший в лобби сразу перекручивает
   рулетку на нужный режим. Зомби-карты в такие комнаты не попадают, командным — только карты
   хотя бы с двумя укрытиями; нет таких карт вовсе — раунд обычный, с пояснением «нет укрытий».
   Обычный список комнат пряток таких комнат не показывает, список режима — только их.
   Два своих сервера на копиях репозитория: 3242 — разные карты, 3243 — только карты без укрытий. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
const OWNER = 'fixedtestowner';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(80); } return null; };

const base = [{ id: 1, type: 'spawn', x: 300, y: 450, w: 30, h: 100 }, { id: 2, type: 'rect', x: 0, y: 560, w: 3000, h: 80 }];
const spots = [{ id: 3, type: 'rect', x: 200, y: 500, w: 60, h: 60, hideSpot: true }, { id: 4, type: 'rect', x: 2400, y: 500, w: 60, h: 60, hideSpot: true }];
const zombie = { id: 5, type: 'zombie', x: 900, y: 480, w: 30, h: 74 };
function rec(name, data) {
  return { mapName: name, mapType: 'hideAndSeek', mapData: JSON.stringify(data), author: OWNER, date: Date.now(), created: Date.now(),
    rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: [] };
}
function server(port, maps) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-fixed-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify(maps));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), OWNER_ALIASES: OWNER, HS_LOBBY_MS: '9000', HS_ROUND_MS: '40000' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}

function player(base, n, name, room) {
  const s = io(base, { transports: ['websocket'], forceNew: true, extraHeaders: { 'CF-Connecting-IP': '10.27.' + n + '.1' } });
  const p = { s, name, ev: [], x: 100 + n * 40, y: 486 };
  ['hsRoulette', 'hsSecret', 'hsPhase', 'hsState', 'hsFixedWait'].forEach(e => s.on(e, d => p.ev.push({ e, d, t: Date.now() })));
  p.join = () => s.emit('join', { playerName: name, gameMode: 'hideAndSeek', room });
  const hb = setInterval(() => s.connected && s.emit('movePlayer', { position: { x: p.x, y: p.y, w: 30, h: 74 } }), 2000);
  s.on('disconnect', () => clearInterval(hb));
  p.last = (e, f) => p.ev.filter(x => x.e === e && (!f || f(x.d))).pop();
  p.ready = () => new Promise(r => s.connected ? r() : s.once('connect', r));
  return p;
}
const getJ = (b, u) => fetch(b + u).then(r => r.json());

(async () => {
  // зомби-карт больше всех: случайно мимо них отдельные режимы не проскочат
  const A = server(3242, [
    rec('PlainLand', { mode: 'hideAndSeek', objects: base }),
    rec('SpotLand', { mode: 'hideAndSeek', objects: base.concat(spots) }),
    ...[1, 2, 3, 4, 5, 6].map(i => rec('ZombieLand' + i, { mode: 'hideAndSeek', apoc: true, objects: base.concat(spots, [zombie]) }))]);
  const B = server(3243, [rec('FlatOne', { mode: 'hideAndSeek', objects: base }), rec('FlatTwo', { mode: 'hideAndSeek', objects: base })]);
  process.on('exit', () => { A.kill(); B.kill(); });
  for (const s of [A, B]) if (!await until(() => fetch(s.base + '/').then(r => r.ok).catch(() => false), 20000)) throw new Error('сервер не поднялся');

  console.log('Страницы и комнаты:');
  for (const [page, name] of [['murder-mystery', 'mmText'], ['cops-and-robbers', 'crText'], ['capture-the-flag', 'ctfText'], ['domination', 'domText']]) {
    const r = await fetch(A.base + '/' + page);
    const html = await r.text();
    ok(r.ok && html.indexOf("'" + page + "'") !== -1 && html.indexOf(name) !== -1, 'страница /' + page + ' открывается');
  }
  const sm = await fetch(A.base + '/sitemap.xml').then(r => r.text());
  ok(/\/murder-mystery</.test(sm) && /\/domination</.test(sm), 'новые страницы есть в sitemap');
  const idx = await fetch(A.base + '/').then(r => r.text());
  ok(['murder', 'cops', 'ctf', 'dom'].every(m => idx.indexOf('data-mode="' + m + '"') !== -1), 'на главной четыре новые карточки');
  const nav = await fetch(A.base + '/nav.js').then(r => r.text());
  ok(/murder: 'murder-mystery'/.test(nav) && /dom: 'domination'/.test(nav), 'карточки ведут на страницы режимов');
  for (const v of ['murder', 'cops', 'ctf', 'dom']) {
    const b = await getJ(A.base, '/getBestRoom?mode=hideAndSeek&variant=' + v);
    ok(b.room === v + '-1', 'Играть в ' + v + ' — комната ' + v + '-1', b.room);
  }
  ok((await getJ(A.base, '/getBestRoom?mode=hideAndSeek')).room === 'room1', 'обычные прятки — по-прежнему room1');
  ok((await getJ(A.base, '/getBestRoom?mode=hideAndSeek&variant=zombie')).room === 'room1', 'чужой вариант в адресе — обычная комната');

  // одиночка в cops-2: его обычный раунд начнётся раньше, чем придёт второй (см. ниже)
  const n1 = player(A.base, 9, 'fx_i', 'cops-2');
  await n1.ready(); n1.join();

  console.log('Murder Mystery: один ждёт, второй запускает режим');
  const m1 = player(A.base, 1, 'fx_a', 'murder-1');
  await m1.ready(); m1.join();
  const solo = await until(() => { const r = m1.last('hsRoulette'); return r && r.d; }, 8000);
  ok(!!solo && solo.variant === 'classic' && solo.fixed === 'murder' && solo.wait === 'players' && solo.need === 2,
    'одиночке — обычные прятки и «ждём игроков»', solo && JSON.stringify({ v: solo.variant, f: solo.fixed, w: solo.wait }));
  const lob1 = m1.last('hsPhase', d => d.phase === 'lobby');
  ok(!!lob1 && lob1.d.map && !/^ZombieLand/.test(lob1.d.map.mapName), 'зомби-карта в комнату режима не попала', lob1 && lob1.d.map && lob1.d.map.mapName);
  const t0 = Date.now();
  const m2 = player(A.base, 2, 'fx_b', 'murder-1');
  await m2.ready(); m2.join();
  const mm = await until(() => { const r = m1.last('hsRoulette', d => d.variant === 'murder'); return r && r.d; }, 4000);
  ok(!!mm && mm.wait === null && mm.fixed === 'murder', 'второй вошёл — рулетка сразу перекрутилась на Murder Mystery', mm && (Date.now() - t0) + 'мс');
  ok(!m1.last('hsPhase', d => d.phase === 'round'), 'и это то же лобби, раунд ещё не начинался');
  const m2s = m2.last('hsState');
  ok(!!m2s && m2s.d.wait === null && !m1.last('hsFixedWait'), 'никому не сказано «режим со следующего раунда» — он начался сразу',
    m2s && JSON.stringify({ w: m2s.d.wait }));
  await sleep(400);
  const roles = [m1, m2].map(p => { const s = p.last('hsSecret'); return s && s.d.role; }).sort().join(',');
  ok(roles === 'innocent,murderer', 'вдвоём — убийца и невиновный, без шерифа', roles);
  const rl = await getJ(A.base, '/getRoomList?mode=hideAndSeek');
  ok(!rl.rooms.some(r => r.room === 'murder-1'), 'в обычном списке комнат пряток комнаты режима нет');
  const rlm = await getJ(A.base, '/getRoomList?mode=hideAndSeek&variant=murder');
  ok(rlm.rooms.length === 1 && rlm.rooms[0].room === 'murder-1' && rlm.rooms[0].players === 2, 'в списке режима — она, с двумя игроками', JSON.stringify(rlm.rooms));
  ok(!(await getJ(A.base, '/getRoomList?mode=hideAndSeek&variant=cops')).rooms.some(r => r.room === 'murder-1'), 'в списке другого режима её нет');
  const best = await getJ(A.base, '/getBestRoom?mode=hideAndSeek&variant=murder');
  ok(best.room === 'murder-1' && best.players === 2, 'Играть ведёт в уже начатую комнату', JSON.stringify(best));
  const mr = await until(() => { const r = m1.last('hsPhase', d => d.phase === 'round'); return r && r.d; }, 14000);
  ok(!!mr && mr.variant === 'murder', 'охота началась как Murder Mystery', mr && mr.variant);

  console.log('Domination и Cops & Robbers: карта с укрытиями, без зомби');
  const d1 = player(A.base, 3, 'fx_c', 'dom-1'), d2 = player(A.base, 4, 'fx_d', 'dom-1');
  const c1 = player(A.base, 5, 'fx_e', 'cops-1'), c2 = player(A.base, 6, 'fx_f', 'cops-1');
  await Promise.all([d1, d2, c1, c2].map(p => p.ready()));
  d1.join(); c1.join(); await sleep(300); d2.join(); c2.join();
  const dr = await until(() => { const r = d1.last('hsRoulette', d => d.variant === 'dom'); return r && r.d; }, 6000);
  ok(!!dr && dr.teams && Object.keys(dr.teams).length === 2 && (dr.points || []).length >= 2, 'Domination: две команды по одному, точки на укрытиях',
    dr && JSON.stringify({ t: dr.teams && Object.values(dr.teams), p: (dr.points || []).length }));
  const dl = d1.last('hsPhase', d => d.phase === 'lobby');
  ok(!!dl && dl.d.map && dl.d.map.mapName === 'SpotLand', 'командному режиму досталась карта с укрытиями (не зомби, не пустая)', dl && dl.d.map && dl.d.map.mapName);
  const cr = await until(() => { const r = c1.last('hsRoulette', d => d.variant === 'cops'); return r && r.d; }, 6000);
  ok(!!cr && cr.cops && cr.cops.length === 1, 'Cops & Robbers: вдвоём — один коп и один грабитель', cr && cr.cops && cr.cops.map(c => c.name).join(','));
  const cl = c1.last('hsPhase', d => d.phase === 'lobby');
  ok(!!cl && cl.d.map && !/^ZombieLand/.test(cl.d.map.mapName), 'и снова без зомби-карты', cl && cl.d.map && cl.d.map.mapName);

  console.log('Capture the Flag на сервере без карт с укрытиями:');
  const f1 = player(B.base, 7, 'fx_g', 'ctf-1'), f2 = player(B.base, 8, 'fx_h', 'ctf-1');
  await Promise.all([f1, f2].map(p => p.ready()));
  f1.join(); await sleep(300); f2.join();
  const fw = await until(() => { const r = f1.last('hsFixedWait'); return r && r.d; }, 3000);
  ok(!!fw && fw.fixed === 'ctf' && fw.wait === 'map', 'второй вошёл, а укрытий нет — первому сказано «на карте нет укрытий»', JSON.stringify(fw));
  const fs2 = f2.last('hsState');
  ok(!!fs2 && fs2.d.variant === 'classic' && fs2.d.fixed === 'ctf' && fs2.d.wait === 'map', 'и вошедшему — то же', fs2 && JSON.stringify({ v: fs2.d.variant, w: fs2.d.wait }));
  ok(!f1.last('hsRoulette', d => d.variant === 'ctf'), 'Capture the Flag без укрытий не запускается');

  console.log('Вошёл посреди обычного раунда:');
  ok(!!await until(() => n1.last('hsPhase', d => d.phase === 'round'), 14000), 'одиночка в cops-2 уже играет обычный раунд');
  const n2 = player(A.base, 10, 'fx_j', 'cops-2');
  await n2.ready(); n2.join();
  const nw = await until(() => { const r = n1.last('hsFixedWait'); return r && r.d; }, 3000);
  const ns = await until(() => { const r = n2.last('hsState'); return r && r.d; }, 3000);
  ok(!!nw && nw.wait === 'next' && !!ns && ns.wait === 'next' && ns.phase === 'round', 'обоим сказано: режим начнётся со следующего раунда',
    JSON.stringify({ a: nw && nw.wait, b: ns && ns.wait }));

  console.log('Браузер:');
  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'CF-Connecting-IP': '10.27.9.9' } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bfConsent', '1'); } catch (e) {} });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await page.goto(A.base + '/', { waitUntil: 'domcontentloaded' });
  await page.click('.card[data-mode="cops"]');
  await page.waitForURL(/cops-and-robbers/, { timeout: 8000 }).catch(() => {});
  ok(/\/cops-and-robbers$/.test(page.url()), 'клик по карточке открывает страницу режима', page.url());
  const info = await until(() => page.evaluate(() => {
    const li = [...document.querySelectorAll('#mdList li')];
    const rows = [...document.querySelectorAll('#roomList .rlName')].map(x => x.textContent);
    return li.length === 5 && li.every(x => x.textContent.trim()) && rows.length ? { name: document.getElementById('mdName').textContent, title: document.title, rows } : null;
  }), 8000);
  ok(!!info && info.name === 'Cops & Robbers' && /Cops & Robbers/.test(info.title), 'название, описание и пять правил переведены', JSON.stringify(info));
  ok(!!info && info.rows.length === 2 && info.rows.every(r => /^cops-\d+$/.test(r)), 'в списке комнат — только комнаты этого режима', info && info.rows.join(','));
  await page.click('#mdPlay');
  await page.waitForURL(/game/, { timeout: 8000 }).catch(() => {});
  ok(/mode=hideAndSeek&variant=cops/.test(page.url()), 'Играть открывает игру в этом режиме', page.url());
  await page.evaluate(() => { const b = document.getElementById('gBanner'); if (b) b.style.display = 'none'; });
  const title = await until(() => page.evaluate(() => /Cops & Robbers/.test(document.title) ? document.title : null), 6000);
  ok(!!title, 'вкладка игры называется по режиму', title || await page.evaluate(() => document.title));
  const joined = await until(async () => (await getJ(A.base, '/getRoomList?mode=hideAndSeek&variant=cops')).rooms.find(r => r.players === 3), 8000);
  ok(!!joined, 'браузер вошёл в комнату этого режима', joined && JSON.stringify(joined));
  // одиночка в браузере видит, что режим ждёт второго
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'CF-Connecting-IP': '10.27.9.10' } });
  const sp = await ctx2.newPage();
  sp.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await sp.goto(A.base + '/game.html?mode=hideAndSeek&variant=ctf&room=ctf-1', { waitUntil: 'domcontentloaded' });
  const waitMsg = await until(() => sp.evaluate(() => { const l = document.getElementById('gLog'); return l && /Capture the Flag starts when there are 2 players/.test(l.textContent) ? l.textContent : null; }), 9000);
  ok(!!waitMsg, 'одиночке в игре сказано, что режим начнётся со вторым игроком', waitMsg);
  ok(!(await sp.evaluate(() => !!document.getElementById('gMini'))), 'мини-карты в игре больше нет');
  ok(errs.length === 0, 'без ошибок на страницах', errs.join(' | '));
  await browser.close();

  [m1, m2, d1, d2, c1, c2, f1, f2, n1, n2].forEach(p => p.s.close());
  console.log(`\n${pass} ✓  ${fail} ✗`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
