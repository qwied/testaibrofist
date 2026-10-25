/* Варианты пряток (идеи 2019 года, «смешанный режим», см. hsPickVariant в server.js):
   Murder Mystery — тайные роли, убийца выбивает касанием, шериф ловит убийцу, а убийца, тронувший
   шерифа, проигрывает сам; Cops and Robbers — копов несколько, пойманный грабитель замирает
   (GAME.frozen), другой грабитель освобождает его касанием. Вариант задан принудительно (HS_VARIANT),
   поэтому раунд с ним — второй: первое лобби комната открывает одна, а варианту нужно трое.
   Два своих сервера на копиях репозитория: 3233 — Murder Mystery, 3234 — Cops and Robbers. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
const OWNER = 'varianttestowner';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(80); } return null; };

function server(port, variant) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-variant-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const mapData = JSON.stringify({ mode: 'hideAndSeek', objects: [
    { id: 1, type: 'spawn', x: 300, y: 450, w: 30, h: 100 }, { id: 2, type: 'rect', x: 0, y: 560, w: 3000, h: 80 }] });
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([{ mapName: 'VariantLand', mapType: 'hideAndSeek', mapData,
    author: OWNER, date: Date.now(), created: Date.now(), rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: [] }]));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), OWNER_ALIASES: OWNER, HS_VARIANT: variant, HS_LOBBY_MS: '9500', HS_ROUND_MS: '40000' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}

// игрок-сокет: записывает все события пряток и умеет ходить
function player(base, n, name, room) {
  const s = io(base, { transports: ['websocket'], forceNew: true, extraHeaders: { 'CF-Connecting-IP': '10.26.' + n + '.1' } });
  const p = { s, name, ev: [], x: 100 + n * 40, y: 486 };
  ['hsRoulette', 'hsSecret', 'hsPhase', 'hsOut', 'hsFreed', 'hsReveal', 'hsState', 'playerJoined'].forEach(e => s.on(e, d => p.ev.push({ e, d, t: Date.now() })));
  p.join = () => s.emit('join', { playerName: name, gameMode: 'hideAndSeek', room });
  p.at = (x, y) => { p.x = x; p.y = y; s.emit('movePlayer', { position: { x, y, w: 30, h: 74 } }); };
  // живой клиент шлёт позицию всё время; молчащего 45 с сервер убирает из комнаты
  const hb = setInterval(() => s.connected && s.emit('movePlayer', { position: { x: p.x, y: p.y, w: 30, h: 74 } }), 2000);
  s.on('disconnect', () => clearInterval(hb));
  // честный путь (сервер засчитывает поимку только после HS_MIN_DIST за раунд)
  p.walk = async () => { for (const dx of [150, 300, 150, 0]) { p.at(100 + dx, 486); await sleep(60); } };
  p.last = (e, f) => p.ev.filter(x => x.e === e && (!f || f(x.d))).pop();
  p.count = (e, f) => p.ev.filter(x => x.e === e && (!f || f(x.d))).length;
  return p;
}

async function browserJoin(browser, base, room, ip, errs) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'CF-Connecting-IP': ip } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await page.goto(base + '/game.html?mode=hideAndSeek&room=' + room, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { const x = document.getElementById('bfConsent'); if (x) x.remove(); const b = document.getElementById('gBanner'); if (b) b.style.display = 'none'; });
  return page;
}
const roleText = page => page.evaluate(() => document.getElementById('gRole').textContent);

(async () => {
  const M = server(3233, 'murder'), C = server(3234, 'cops');
  process.on('exit', () => { M.kill(); C.kill(); });
  for (const s of [M, C]) if (!await until(() => fetch(s.base + '/').then(r => r.ok).catch(() => false), 20000)) throw new Error('сервер не поднялся');
  const browser = await chromium.launch();
  const errs = [];

  // ================= Murder Mystery =================
  const mroom = 'mm' + Math.floor(Math.random() * 1e6);
  const mp = ['mm_a', 'mm_b', 'mm_c', 'mm_d'].map((nm, i) => player(M.base, i + 1, nm, mroom));
  // ================= Cops and Robbers (параллельно) =================
  const croom = 'cr' + Math.floor(Math.random() * 1e6);
  const cp = ['cr_a', 'cr_b', 'cr_c', 'cr_d', 'cr_e', 'cr_f'].map((nm, i) => player(C.base, i + 11, nm, croom));
  await Promise.all(mp.concat(cp).map(p => new Promise(r => p.s.once('connect', r))));
  for (const p of mp.concat(cp)) { p.join(); await sleep(120); }
  mp.concat(cp).forEach(p => p.at(p.x, p.y));

  if (!process.env.SKIP_MM) {
  console.log('Murder Mystery:');
  const mRoul = await until(() => { const r = mp[0].last('hsRoulette', d => d.variant === 'murder'); return r && r.d; }, 60000);
  ok(!!mRoul && mRoul.winnerId === null && mRoul.players.length === 0, 'рулетка режима — Murder Mystery, без рулетки игроков: убийцу не видно', mRoul && JSON.stringify({ w: mRoul.winnerId, n: mRoul.players.length }));
  await sleep(500);
  const roles = mp.map(p => { const x = p.last('hsSecret'); return x && x.d.role; });
  const by = r => mp[roles.indexOf(r)];
  ok(roles.filter(r => r === 'murderer').length === 1 && roles.filter(r => r === 'sheriff').length === 1 && roles.filter(r => r === 'innocent').length === 2,
    'каждый получил только свою роль: один убийца, один шериф, двое невиновных', roles.join(','));
  const mRound = await until(() => { const r = mp[0].last('hsPhase', d => d.phase === 'round' && d.variant === 'murder'); return r && r.d; }, 30000);
  ok(!!mRound && mRound.seekerId === null && mRound.seekerName === '' && mRound.seekerIds.length === 0, 'охота началась, а кто убийца — в событии не сказано');
  const killer = by('murderer'), sheriff = by('sheriff'), inn = mp.filter((p, i) => roles[i] === 'innocent');
  await Promise.all(mp.map(p => p.walk()));
  // браузер входит посреди охоты — он невиновный
  const mpage = await browserJoin(browser, M.base, mroom, '10.26.9.9', errs);
  const mRole = await until(async () => { const t = await roleText(mpage); return /Innocent/.test(t) ? t : null; }, 10000);
  ok(!!mRole, 'вошедший посреди охоты — Innocent', mRole || await roleText(mpage));
  ok(await mpage.evaluate(() => document.getElementById('gMini').style.display !== 'block'), 'мини-карты в Murder Mystery нет: охотник тайный');

  const outs = () => mp[0].count('hsOut');
  // шериф трогает невиновного — ничего; невиновный «ловит» — ничего
  sheriff.at(inn[0].x, inn[0].y); await sleep(80);
  sheriff.s.emit('hsCatch', { targetId: inn[0].s.id });
  inn[1].at(inn[0].x, inn[0].y); await sleep(80);
  inn[1].s.emit('hsCatch', { targetId: inn[0].s.id });
  await sleep(900);
  ok(outs() === 0, 'шериф и невиновный, тронув невиновного, никого не выбивают');
  // убийца выбивает невиновного
  killer.at(inn[0].x, inn[0].y); await sleep(80);
  killer.s.emit('hsCatch', { targetId: inn[0].s.id });
  const out1 = await until(() => { const o = mp[0].last('hsOut'); return o && o.d; }, 3000);
  ok(!!out1 && out1.id === inn[0].s.id && !out1.murderer, 'убийца коснулся невиновного — тот выбыл', JSON.stringify(out1));
  ok(!!await until(() => mpage.evaluate(n => document.body.innerText.indexOf(n) !== -1, inn[0].name), 3000), 'в браузере видно, кто выбыл');
  // убийца трогает шерифа — проигрывает сам
  killer.at(sheriff.x, sheriff.y); await sleep(80);
  killer.s.emit('hsCatch', { targetId: sheriff.s.id });
  const out2 = await until(() => { const o = mp[0].last('hsOut', d => d.murderer); return o && o.d; }, 3000);
  ok(!!out2 && out2.id === killer.s.id && out2.name === killer.name, 'убийца тронул шерифа — пойман сам убийца', JSON.stringify(out2));
  const rev = await until(() => { const r = mp[0].last('hsReveal'); return r && r.d; }, 6000);
  ok(!!rev && rev.winner === 'sheriff' && rev.murderer === killer.name && rev.sheriff === sheriff.name, 'раунд кончился сразу: невиновные победили, убийца раскрыт', JSON.stringify(rev));
  ok(!!await until(() => mpage.evaluate(() => /Innocents win/i.test(document.body.innerText)), 4000), 'в браузере итог: «Innocents win»');
  }

  console.log('Cops and Robbers:');
  const cRoul = await until(() => { const r = cp[0].last('hsRoulette', d => d.variant === 'cops'); return r && r.d; }, 70000);
  const copIds = cRoul ? cRoul.cops.map(c => c.id) : [];
  ok(!!cRoul && copIds.length === 2 && copIds.indexOf(cRoul.winnerId) !== -1, 'рулетка режима — Cops & Robbers, из шести двое копов', cRoul && cRoul.cops.map(c => c.name).join(','));
  const cRound = await until(() => { const r = cp[0].last('hsPhase', d => d.phase === 'round' && d.variant === 'cops'); return r && r.d; }, 30000);
  ok(!!cRound && cRound.seekerIds.slice().sort().join() === copIds.slice().sort().join(), 'охота: копы объявлены всем');
  const cops = cp.filter(p => copIds.indexOf(p.s.id) !== -1), rob = cp.filter(p => copIds.indexOf(p.s.id) === -1);
  await Promise.all(cp.map(p => p.walk()));
  const cpage = await browserJoin(browser, C.base, croom, '10.26.8.8', errs);
  const bJoined = await until(() => { const j = cp[0].ev.filter(x => x.e === 'playerJoined').pop(); return j && j.d && j.d.name && cp.every(p => p.name !== j.d.name) ? j.d : null; }, 10000);
  ok(!!await until(async () => /Robber/.test(await roleText(cpage)), 10000), 'вошедший посреди охоты — Robber', await roleText(cpage));
  ok(!!await until(() => cpage.evaluate(() => document.getElementById('gMini').style.display === 'block'), 4000), 'у грабителя мини-карта с копами');

  const cout = (f) => cp[0].count('hsOut', f);
  cops[0].at(rob[0].x, rob[0].y); await sleep(80);
  cops[0].s.emit('hsCatch', { targetId: rob[0].s.id });
  ok(!!await until(() => cout(d => d.id === rob[0].s.id && d.jail) === 1, 3000), 'коп поймал грабителя — тот арестован (замирает)');
  // арестованный не может освобождать, коп тоже
  cops[1].at(rob[0].x, rob[0].y); await sleep(80);
  cops[1].s.emit('hsFree', { targetId: rob[0].s.id });
  await sleep(700);
  ok(cp[0].count('hsFreed') === 0, 'коп освободить не может');
  rob[1].at(rob[0].x, rob[0].y); await sleep(80);
  rob[1].s.emit('hsFree', { targetId: rob[0].s.id });
  const fr = await until(() => { const f = cp[0].last('hsFreed'); return f && f.d; }, 3000);
  ok(!!fr && fr.id === rob[0].s.id && fr.by === rob[1].name, 'другой грабитель освободил его касанием', JSON.stringify(fr));
  ok(!!await until(() => cpage.evaluate(() => /freed/.test(document.body.innerText)), 3000), 'в браузере: «… freed …»');
  cops[0].at(rob[0].x, rob[0].y); await sleep(80);
  cops[0].s.emit('hsCatch', { targetId: rob[0].s.id });
  ok(!!await until(() => cout(d => d.id === rob[0].s.id) === 2, 3000), 'освобождённого можно поймать снова');

  // браузерного грабителя ловят — он замирает; освобождают — снова ходит
  const bpos = await cpage.evaluate(() => ({ x: window.GAME.pl.x, y: window.GAME.pl.y }));
  cops[1].at(bpos.x, bpos.y); await sleep(150);
  cops[1].s.emit('hsCatch', { targetId: bJoined && bJoined.id });
  ok(!!await until(() => cpage.evaluate(() => window.GAME.frozen === true), 3000), 'браузерного грабителя поймали — GAME.frozen');
  ok(/arrested/i.test(await cpage.evaluate(() => document.body.innerText)), 'в браузере: «… was arrested»');
  const x0 = await cpage.evaluate(() => window.GAME.pl.x);
  await cpage.keyboard.down('ArrowRight'); await cpage.keyboard.press('ArrowUp'); await sleep(700); await cpage.keyboard.up('ArrowRight');
  const x1 = await cpage.evaluate(() => window.GAME.pl.x);
  ok(Math.abs(x1 - x0) < 3, 'пойманный не может ходить', x0.toFixed(1) + ' → ' + x1.toFixed(1));
  rob[2].at(bpos.x, bpos.y); await sleep(150);
  rob[2].s.emit('hsFree', { targetId: bJoined && bJoined.id });
  ok(!!await until(() => cpage.evaluate(() => window.GAME.frozen === false), 3000), 'освободили — заморозка снята');
  await cpage.keyboard.down('ArrowRight'); await sleep(500); await cpage.keyboard.up('ArrowRight');
  const x2 = await cpage.evaluate(() => window.GAME.pl.x);
  ok(x2 - x1 > 40, 'и снова может ходить', x1.toFixed(1) + ' → ' + x2.toFixed(1));

  // копы ловят всех грабителей с начала раунда — раунд кончается досрочно
  for (const r of rob) {
    if (r === rob[0]) continue;                 // rob[0] уже снова сидит
    cops[0].at(r.x, r.y); await sleep(80);
    cops[0].s.emit('hsCatch', { targetId: r.s.id });
    await sleep(200);
  }
  const crev = await until(() => { const r = cp[0].last('hsReveal'); return r && r.d; }, 6000);
  ok(!!crev && crev.winner === 'cops', 'все грабители пойманы — копы победили, раунд окончен', JSON.stringify(crev));
  ok(!!await until(() => cpage.evaluate(() => /Cops win/i.test(document.body.innerText)), 4000), 'в браузере итог: «Cops win»');

  // следующее лобби: рулетка режима в браузере — сначала режим, потом своя роль
  const seen = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < 12000) {
    const t = await cpage.evaluate(() => { const r = document.getElementById('gRoulRes'); return r && r.classList.contains('on') ? r.textContent : ''; });
    if (t) seen.add(t);
    if ([...seen].some(x => /You are a (cop|robber)/.test(x))) { if (process.env.SHOT) await cpage.screenshot({ path: process.env.SHOT }); break; }
    await sleep(100);
  }
  const seenList = [...seen];
  ok(seenList.indexOf('Cops & Robbers') !== -1 && seenList.some(x => /You are a (cop|robber)!/.test(x)), 'в лобби рулетка показала режим, а под ним — свою роль', seenList.join(' | '));
  const mine = seenList.find(x => /You are a (cop|robber)!/.test(x)) || '';
  const lbl = await until(async () => { const t = await roleText(cpage); return /Cop|Robber/.test(t) ? t : null; }, 4000);
  ok(!!lbl && (/cop/.test(mine) ? lbl === 'Cop' : lbl === 'Robber'), 'подпись роли совпадает с объявленной', lbl);

  ok(errs.length === 0, 'ошибок скриптов нет', errs.join(' | '));
  if (fail && process.env.DEBUG) {
    const t0 = cp[0].ev.length ? cp[0].ev[0].t : 0;
    cp[0].ev.filter(x => /hsPhase|hsRoulette|hsReveal|hsOut|hsFreed/.test(x.e)).forEach(x =>
      console.log('   ', ((x.t - t0) / 1000).toFixed(1) + 's', x.e, JSON.stringify(x.d).slice(0, 160)));
  }
  mp.concat(cp).forEach(p => p.s.disconnect());
  await browser.close(); M.kill(); C.kill();
  console.log(pass + ' ok, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
