/* Режимы на главной (см. hsFixedOf/hsPickVariant в server.js, variant.html): Hide and Seek, Race,
   Murder Mystery и Team Battle. Murder Mystery («murder-N») — с трёх игроков, Team Battle
   («team-N») — с двух, раунды Capture the Flag и Domination по очереди, только на картах с
   укрытиями. Пока режиму не хватает игроков или карта не подходит — обычные прятки с пояснением;
   кто вошёл в лобби последним недостающим — рулетка сразу перекручивается на режим. Зомби-карты в
   эти комнаты не попадают. В обычных прятках бывают только Classic, Zombie и Cops & Robbers
   (в большой комнате, два раза подряд — нет). Списки комнат у каждого режима свои.
   Два своих сервера на копиях репозитория: 3242 — разные карты, 3243 — только карты без укрытий,
   короткие раунды и Cops & Robbers уже вдвоём (HS_COPS_MIN), чтобы быстро проверить чередование. */
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
function server(port, maps, env) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-fixed-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify(maps));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), OWNER_ALIASES: OWNER, HS_VARIANT: '', ...env } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}

let ipN = 0;
function player(base, name, room) {
  const n = ++ipN;
  const s = io(base, { transports: ['websocket'], forceNew: true, extraHeaders: { 'CF-Connecting-IP': '10.27.' + n + '.1' } });
  const p = { s, name, ev: [], x: 100 + (n % 20) * 40, y: 486 };
  ['hsRoulette', 'hsSecret', 'hsPhase', 'hsState', 'hsFixedWait'].forEach(e => s.on(e, d => p.ev.push({ e, d, t: Date.now() })));
  p.join = () => s.emit('join', { playerName: name, gameMode: 'hideAndSeek', room });
  const hb = setInterval(() => s.connected && s.emit('movePlayer', { position: { x: p.x, y: p.y, w: 30, h: 74 } }), 2000);
  s.on('disconnect', () => clearInterval(hb));
  p.last = (e, f) => p.ev.filter(x => x.e === e && (!f || f(x.d))).pop();
  p.all = (e, f) => p.ev.filter(x => x.e === e && (!f || f(x.d))).map(x => x.d);
  p.ready = () => new Promise(r => s.connected ? r() : s.once('connect', r));
  return p;
}
const getJ = (b, u) => fetch(b + u).then(r => r.json());
const mapOf = p => { const l = p.last('hsPhase', d => d.phase === 'lobby'); return l && l.d.map ? l.d.map.mapName : null; };

(async () => {
  // зомби-карт больше всех: случайно мимо них отдельные режимы не проскочат
  const A = server(3242, [
    rec('PlainLand', { mode: 'hideAndSeek', objects: base }),
    rec('SpotLand', { mode: 'hideAndSeek', objects: base.concat(spots) }),
    ...[1, 2, 3, 4, 5, 6].map(i => rec('ZombieLand' + i, { mode: 'hideAndSeek', apoc: true, objects: base.concat(spots, [zombie]) }))],
    { HS_LOBBY_MS: '9000', HS_ROUND_MS: '14000' });
  const B = server(3243, [rec('FlatOne', { mode: 'hideAndSeek', objects: base }), rec('FlatTwo', { mode: 'hideAndSeek', objects: base })],
    { HS_LOBBY_MS: '3000', HS_ROUND_MS: '3000', HS_COPS_MIN: '2' });
  process.on('exit', () => { A.kill(); B.kill(); });
  for (const s of [A, B]) if (!await until(() => fetch(s.base + '/').then(r => r.ok).catch(() => false), 20000)) throw new Error('сервер не поднялся');

  // обычные прятки на B: десять комнат по двое — Cops & Robbers выпадает, но не два раза подряд
  const hs = [];
  for (let i = 0; i < 10; i++) hs.push(player(B.base, 'hs_' + i + 'a', 'hsroom' + i), player(B.base, 'hs_' + i + 'b', 'hsroom' + i));
  await Promise.all(hs.map(p => p.ready()));
  hs.forEach(p => p.join());
  // одиночка в team-2 на A: его обычный раунд начнётся раньше, чем придёт второй (см. ниже)
  const n1 = player(A.base, 'fx_i', 'team-2');
  await n1.ready(); n1.join();

  console.log('Страницы и комнаты:');
  for (const [page, name] of [['murder-mystery', 'mmText'], ['team-battle', 'teamText']]) {
    const r = await fetch(A.base + '/' + page);
    const html = await r.text();
    ok(r.ok && html.indexOf("'" + page + "'") !== -1 && html.indexOf(name) !== -1, 'страница /' + page + ' открывается');
  }
  ok(!/variant\.html|BF_VARIANT/.test(await fetch(A.base + '/cops-and-robbers').then(r => r.text())), 'отдельной страницы Cops & Robbers нет — он в прятках');
  const sm = await fetch(A.base + '/sitemap.xml').then(r => r.text());
  ok(/\/murder-mystery</.test(sm) && /\/team-battle</.test(sm) && /\/war</.test(sm) && !/domination|capture-the-flag/.test(sm), 'в sitemap — страницы режимов');
  const idx = await fetch(A.base + '/').then(r => r.text());
  const modes = (idx.match(/class="card" data-mode="[^"]+"/g) || []).map(x => x.split('"')[3]);
  ok(['hideAndSeek', 'race', 'murder', 'team', 'war'].every((m, i) => modes[i] === m), 'на главной режимы по порядку', modes.join());
  const hsPage = await fetch(A.base + '/hide-and-seek').then(r => r.text());
  ok(/data-i18n="hsRule7"/.test(hsPage), 'в правилах пряток — Cops & Robbers в большой комнате');
  const bm = await getJ(A.base, '/getBestRoom?mode=hideAndSeek&variant=murder');
  ok(bm.room === 'murder-1' && bm.players === 0, 'Играть в Murder Mystery — новая комната murder-1', JSON.stringify(bm));
  const bt = await getJ(A.base, '/getBestRoom?mode=hideAndSeek&variant=team');
  ok(bt.room === 'team-2' && bt.players === 1, 'Играть в Team Battle — туда, где уже ждут (team-2)', JSON.stringify(bt));
  for (const v of ['', 'cops', 'ctf', 'zombie']) {
    const b = await getJ(A.base, '/getBestRoom?mode=hideAndSeek' + (v ? '&variant=' + v : ''));
    ok(b.room === 'room1', (v || 'без режима') + ' — обычные прятки, room1', b.room);
  }

  console.log('Murder Mystery: с трёх игроков');
  const m1 = player(A.base, 'fx_a', 'murder-1');
  await m1.ready(); m1.join();
  const solo = await until(() => { const r = m1.last('hsRoulette'); return r && r.d; }, 8000);
  ok(!!solo && solo.variant === 'classic' && solo.fixed === 'murder' && solo.wait === 'players' && solo.need === 3,
    'одиночке — обычные прятки и «нужно 3 игрока»', solo && JSON.stringify({ v: solo.variant, w: solo.wait, n: solo.need }));
  ok(!!mapOf(m1) && !/^ZombieLand/.test(mapOf(m1)), 'зомби-карта в комнату режима не попала', mapOf(m1));
  const m2 = player(A.base, 'fx_b', 'murder-1');
  await m2.ready(); m2.join();
  const m2s = await until(() => { const r = m2.last('hsState'); return r && r.d; }, 3000);
  ok(!!m2s && m2s.wait === 'players' && !m1.last('hsRoulette', d => d.variant === 'murder'), 'вдвоём режим ещё ждёт третьего', m2s && m2s.wait);
  const t0 = Date.now();
  const m3 = player(A.base, 'fx_c', 'murder-1');
  await m3.ready(); m3.join();
  const mm = await until(() => { const r = m1.last('hsRoulette', d => d.variant === 'murder'); return r && r.d; }, 4000);
  ok(!!mm && mm.wait === null && mm.fixed === 'murder', 'третий вошёл — рулетка сразу перекрутилась на Murder Mystery', mm && (Date.now() - t0) + 'мс');
  ok(!m1.last('hsPhase', d => d.phase === 'round'), 'и это то же лобби, раунд ещё не начинался');
  const m3s = m3.last('hsState');
  ok(!!m3s && m3s.d.wait === null && !m1.last('hsFixedWait'), 'лишних «ждём» и «со следующего раунда» никому', m3s && JSON.stringify({ w: m3s.d.wait }));
  await sleep(400);
  const roles = [m1, m2, m3].map(p => { const s = p.last('hsSecret'); return s && s.d.role; }).sort().join(',');
  ok(roles === 'innocent,murderer,sheriff', 'роли: убийца, шериф и невиновный', roles);
  ok(!(await getJ(A.base, '/getRoomList?mode=hideAndSeek')).rooms.some(r => r.room === 'murder-1'), 'в обычном списке комнат пряток комнаты режима нет');
  const rlm = await getJ(A.base, '/getRoomList?mode=hideAndSeek&variant=murder');
  ok(rlm.rooms.length === 1 && rlm.rooms[0].room === 'murder-1' && rlm.rooms[0].players === 3, 'в списке режима — она, с тремя игроками', JSON.stringify(rlm.rooms.map(r => [r.room, r.players])));
  ok(!(await getJ(A.base, '/getRoomList?mode=hideAndSeek&variant=team')).rooms.some(r => r.room === 'murder-1'), 'в списке Team Battle её нет');
  const best = await getJ(A.base, '/getBestRoom?mode=hideAndSeek&variant=murder');
  ok(best.room === 'murder-1' && best.players === 3, 'Играть ведёт в уже начатую комнату', JSON.stringify(best));

  console.log('Team Battle: с двух, Capture the Flag и Domination по очереди');
  const d1 = player(A.base, 'fx_d', 'team-1'), d2 = player(A.base, 'fx_e', 'team-1');
  await Promise.all([d1, d2].map(p => p.ready()));
  d1.join(); await sleep(300); d2.join();
  const dr = await until(() => { const r = d1.last('hsRoulette', d => d.variant === 'ctf'); return r && r.d; }, 6000);
  ok(!!dr && dr.teams && Object.values(dr.teams).sort().join() === 'blue,red' && dr.bases, 'первый раунд — Capture the Flag, один на один',
    dr && JSON.stringify(dr.teams && Object.values(dr.teams)));
  ok(mapOf(d1) === 'SpotLand', 'карта — с укрытиями (не зомби, не пустая)', mapOf(d1));
  const dd = await until(() => { const r = d1.last('hsRoulette', d => d.variant === 'dom'); return r && r.d; }, 32000);
  ok(!!dd && (dd.points || []).length >= 2, 'следующий раунд — Domination, точки на укрытиях', dd && (dd.points || []).length);

  console.log('Вошёл посреди обычного раунда:');
  // входим в первые секунды обычного раунда одиночки, а не на стыке с лобби
  ok(!!await until(() => { const l = n1.last('hsPhase'); return l && l.d.phase === 'round' && Date.now() - l.t < 6000; }, 30000),
    'одиночка в team-2 играет обычный раунд');
  const n2 = player(A.base, 'fx_j', 'team-2');
  await n2.ready(); n2.join();
  const nw = await until(() => { const r = n1.last('hsFixedWait'); return r && r.d; }, 3000);
  const ns = await until(() => { const r = n2.last('hsState'); return r && r.d; }, 3000);
  ok(!!nw && nw.wait === 'next' && !!ns && ns.wait === 'next' && ns.phase === 'round', 'обоим сказано: режим начнётся со следующего раунда',
    JSON.stringify({ a: nw && nw.wait, b: ns && ns.wait }));

  console.log('Team Battle на сервере без карт с укрытиями:');
  const f1 = player(B.base, 'fx_g', 'team-1'), f2 = player(B.base, 'fx_h', 'team-1');
  await Promise.all([f1, f2].map(p => p.ready()));
  f1.join(); await sleep(300); f2.join();
  const fw = await until(() => { const r = f1.last('hsFixedWait'); return r && r.d; }, 3000);
  const fs2 = await until(() => { const r = f2.last('hsState'); return r && r.d; }, 3000);
  ok(!!fw && fw.wait === 'map' && !!fs2 && fs2.wait === 'map' && fs2.variant === 'classic',
    'второй вошёл, а укрытий нет — обоим сказано «на карте нет укрытий»', JSON.stringify({ a: fw && fw.wait, b: fs2 && fs2.wait }));

  console.log('Обычные прятки:');
  // за это время у B прошло несколько раундов
  const seq = hs.filter((p, i) => i % 2 === 0).map(p => p.all('hsRoulette').map(d => d.variant));
  const flat = [].concat(...seq);
  ok(flat.every(v => v === 'classic' || v === 'cops'), 'в прятках только Classic и Cops & Robbers', [...new Set(flat)].join(','));
  ok(flat.indexOf('cops') !== -1, 'Cops & Robbers выпадает', flat.filter(v => v === 'cops').length + ' из ' + flat.length);
  ok(seq.every(s => s.every((v, i) => !(v === 'cops' && s[i - 1] === 'cops'))), 'два раза подряд — никогда', seq.map(s => s.map(v => v === 'cops' ? 'K' : 'c').join('')).join(' '));

  console.log('Браузер:');
  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'CF-Connecting-IP': '10.27.200.1' } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bfConsent', '1'); } catch (e) {} });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await page.goto(A.base + '/', { waitUntil: 'domcontentloaded' });
  // ряды карточек: до четырёх в ряд, неполный ряд — по центру страницы с карточками
  const grid = await page.evaluate(() => {
    const box = document.querySelector('.cards').getBoundingClientRect();
    const cs = [...document.querySelectorAll('.card')].map(c => c.getBoundingClientRect());
    const rows = {};
    cs.forEach(r => { (rows[Math.round(r.y)] = rows[Math.round(r.y)] || []).push(r); });
    return { mid: box.x + box.width / 2, rows: Object.keys(rows).map(y => { const rr = rows[y]; return { n: rr.length, c: (rr[0].x + rr[rr.length - 1].right) / 2 }; }) };
  });
  ok(grid.rows.length >= 2 && grid.rows.every(r => r.n <= 4 && Math.abs(r.c - grid.mid) < 3), 'карточки рядами до четырёх, каждый ряд по центру', JSON.stringify(grid));
  await page.click('.card[data-mode="team"]');
  await page.waitForURL(/team-battle/, { timeout: 8000 }).catch(() => {});
  ok(/\/team-battle$/.test(page.url()), 'клик по карточке открывает страницу режима', page.url());
  const info = await until(() => page.evaluate(() => {
    const li = [...document.querySelectorAll('#mdList li')];
    const rows = [...document.querySelectorAll('#roomList .rlName')].map(x => x.textContent);
    return li.length === 5 && li.every(x => x.textContent.trim()) && rows.length ? { name: document.getElementById('mdName').textContent, title: document.title, rows } : null;
  }), 8000);
  ok(!!info && info.name === 'Team Battle' && /Team Battle/.test(info.title), 'название, описание и пять правил переведены', JSON.stringify(info));
  ok(!!info && info.rows.length === 2 && info.rows.every(r => /^team-\d+$/.test(r)), 'в списке комнат — только комнаты этого режима', info && info.rows.join(','));
  await page.click('#mdPlay');
  await page.waitForURL(/game/, { timeout: 8000 }).catch(() => {});
  ok(/mode=hideAndSeek&variant=team/.test(page.url()), 'Играть открывает игру в этом режиме', page.url());
  const title = await until(() => page.evaluate(() => /Team Battle/.test(document.title) ? document.title : null), 6000);
  ok(!!title, 'вкладка игры называется по режиму', title || await page.evaluate(() => document.title));
  const joined = await until(async () => (await getJ(A.base, '/getRoomList?mode=hideAndSeek&variant=team')).rooms.find(r => r.players === 3), 8000);
  ok(!!joined, 'браузер вошёл в комнату этого режима', joined && JSON.stringify([joined.room, joined.players]));
  // одиночка в своей комнате Team Battle: рулетка режима крутит только варианты этого режима
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'CF-Connecting-IP': '10.27.200.2' } });
  const sp = await ctx2.newPage();
  sp.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await sp.goto(A.base + '/game.html?mode=hideAndSeek&variant=team&room=team-7', { waitUntil: 'domcontentloaded' });
  const waitMsg = await until(() => sp.evaluate(() => { const l = document.getElementById('gLog'); return l && /Team Battle starts when there are 2 players/.test(l.textContent) ? l.textContent : null; }), 9000);
  ok(!!waitMsg, 'одиночке в игре сказано, что режим начнётся со вторым игроком', waitMsg);
  const pills = await until(() => sp.evaluate(() => { const t = [...document.querySelectorAll('#gRoulTrack .rName')].map(x => x.textContent); return t.length ? [...new Set(t)].sort().join(',') : null; }), 6000);
  ok(pills === 'Capture the Flag,Classic,Domination', 'рулетка режима — только Classic, Capture the Flag и Domination', pills);
  ok(!(await sp.evaluate(() => !!document.getElementById('gMini'))), 'мини-карты в игре больше нет');
  ok(errs.length === 0, 'без ошибок на страницах', errs.join(' | '));
  await browser.close();

  hs.concat([m1, m2, m3, d1, d2, f1, f2, n1, n2]).forEach(p => p.s.close());
  console.log(`\n${pass} ✓  ${fail} ✗`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
