/* «Вечеринка» (идеи 2019 года «Quiz mode», «Guess the word», «Build battle», «Mixed mode», см. party.js
   и hsMixPick в server.js). Комнаты «party-N», раунды по кругу: викторина → случайный раунд другого
   режима → угадай слово → случайный → строительная битва. Сокетами: верный и быстрый ответ даёт
   очки, второй ответ не принимается, все ответили — сразу итог вопроса; рисующий видит слово, другие —
   нет, штрих доходит до остальных, а штрих не рисующего — нет; неверная догадка видна только самому,
   верная — всем, угадали все — слово открывается; модели оцениваются только чужие, лучшая побеждает.
   Браузером: страница /party, панель мини-игры, ответ кнопкой, рисунок мышью или догадка с клавиатуры
   (печать уходит в поле догадки, а не в чат), модель по клеткам и звёзды. Свой сервер: 3249. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
const OWNER = 'partytestowner';
const SHOTS = process.env.SHOTS_DIR || '';
const { QUESTIONS } = require('./party.js');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(60); } return null; };

function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-party-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git|builtinMaps)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const objects = [{ id: 1, type: 'spawn', x: 900, y: 450, w: 30, h: 100 }, { id: 2, type: 'rect', x: 0, y: 560, w: 3000, h: 80 },
    { id: 3, type: 'rect', x: 600, y: 460, w: 80, h: 100, hideSpot: true }];
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([{ mapName: 'Lawn', mapType: 'hideAndSeek',
    mapData: JSON.stringify({ mode: 'hideAndSeek', objects }), author: OWNER, date: Date.now(), created: Date.now(),
    rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: [] }]));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), OWNER_ALIASES: OWNER, HS_VARIANT: '', HS_LOBBY_MS: '2000', HS_ROUND_MS: '4000',
      PARTY_QUIZ_N: '2', PARTY_Q_MS: '4000', PARTY_SHOW_MS: '800', PARTY_GUESS_MS: '12000', PARTY_BUILD_MS: '5000', PARTY_VOTE_MS: '2500' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
let ipN = 0;
function bot(base, name, room) {
  const s = io(base, { transports: ['websocket'], forceNew: true, extraHeaders: { 'CF-Connecting-IP': '10.49.' + (++ipN) + '.1' } });
  const p = { s, name, ev: [] };
  ['hsRoulette', 'hsPhase', 'hsReveal', 'party', 'partyStroke', 'partyGuessed', 'partyNo', 'partyClear'].forEach(e => s.on(e, d => p.ev.push({ e, d, t: Date.now() })));
  p.join = () => s.emit('join', { playerName: name, gameMode: 'hideAndSeek', room });
  const hb = setInterval(() => s.connected && s.emit('movePlayer', { position: { x: 900, y: 450, w: 30, h: 100 } }), 1000);
  s.on('disconnect', () => clearInterval(hb));
  p.last = (e, f, after) => { const x = p.ev.filter(v => v.e === e && v.t > (after || 0) && (!f || f(v.d))).pop(); return x && x.d; };
  return p;
}
const connected = (ps) => Promise.all(ps.map(p => new Promise(r => p.s.connected ? r() : p.s.once('connect', r))));
// номер верного ответа на этот вопрос (первый ответ в банке вопросов — верный)
const rightOf = (d) => { const Q = QUESTIONS.find(q => q.q.en === d.q.en); return Q ? d.a.findIndex(a => a.en === Q.a[0].en) : -1; };
const GAMES = ['quiz', 'guess', 'build'];

(async () => {
  const S = server(3249);
  process.on('exit', () => S.kill());
  if (!await until(() => fetch(S.base + '/').then(r => r.ok).catch(() => false), 20000)) throw new Error('сервер не поднялся');

  console.log('Страница и комнаты:');
  const page0 = await fetch(S.base + '/party').then(r => r.text());
  ok(/variant\.html|mdList/.test(page0), 'страница /party открывается');
  const sm = await fetch(S.base + '/sitemap.xml').then(r => r.text());
  ok(/\/party</.test(sm), 'в sitemap есть /party');
  const best = await fetch(S.base + '/getBestRoom?mode=hideAndSeek&variant=party').then(r => r.json());
  ok(/^party-\d+$/.test(best.room), 'комната режима — party-N', best.room);

  console.log('Викторина:');
  const room = 'party-' + Math.floor(Math.random() * 1e6);
  const A = bot(S.base, 'pt_a', room), B = bot(S.base, 'pt_b', room);
  await connected([A, B]);
  A.join(); await sleep(150); B.join();
  const q1 = await until(() => A.last('party', d => d.g === 'quiz' && d.stage === 'q'), 20000);
  ok(!!q1 && q1.n === 1 && q1.a.length === 4 && q1.q.en && q1.q.ru && q1.right === -1, 'вопрос: текст на двух языках, четыре ответа, верный не виден',
    q1 && q1.q.en);
  const r1 = q1 ? rightOf(q1) : -1;
  ok(r1 >= 0, 'вопрос из банка вопросов');
  A.s.emit('partyAns', { i: r1 });
  await sleep(150);
  A.s.emit('partyAns', { i: (r1 + 1) % 4 });             // второй ответ не принимается
  B.s.emit('partyAns', { i: (r1 + 1) % 4 });
  const e1 = await until(() => A.last('party', d => d.g === 'quiz' && d.stage === 'qEnd' && d.n === 1), 3000);
  ok(!!e1 && e1.right === r1 && e1.rightIds.length === 1 && e1.rightIds[0] === A.s.id, 'все ответили — сразу итог: верно ответил только A', e1 && JSON.stringify(e1.rightIds));
  const sa = e1 && e1.score.find(x => x.id === A.s.id), sb = e1 && e1.score.find(x => x.id === B.s.id);
  ok(!!sa && sa.pts > 150 && sa.pts <= 200 && sb.pts === 0, 'быстрый верный ответ — от 100 до 200 очков, неверный — 0', sa && sa.pts + ' / ' + (sb && sb.pts));
  ok(e1 && e1.mine === r1, 'засчитан первый ответ, а не второй');
  // второй вопрос — отвечает только A (верно), B молчит: итог по таймеру
  const q2 = await until(() => A.last('party', d => d.g === 'quiz' && d.stage === 'q' && d.n === 2), 6000);
  if (q2) A.s.emit('partyAns', { i: rightOf(q2) });
  const e2 = await until(() => A.last('party', d => d.g === 'quiz' && d.stage === 'qEnd' && d.n === 2), 6000);
  ok(!!e2 && e2.rightIds.join() === A.s.id, 'ответили не все — итог вопроса по таймеру');
  const rev1 = await until(() => A.last('hsReveal', d => d.variant === 'quiz'), 12000);
  ok(!!rev1 && rev1.winnerName === 'pt_a' && rev1.top.length === 2, 'конец викторины: побеждает A', rev1 && JSON.stringify(rev1.top));

  console.log('Случайный раунд:');
  const mix1 = await until(() => A.last('hsRoulette', d => GAMES.indexOf(d.variant) === -1, rev1 ? 0 : 0), 15000);
  ok(!!mix1 && ['classic', 'ffa', 'hunger'].indexOf(mix1.variant) !== -1, 'между мини-играми — раунд другого режима (вдвоём: прятки, все против всех, голодные игры)', mix1 && mix1.variant);
  ok(!!mix1 && mix1.fixed === 'party', 'комната остаётся «Вечеринкой»');

  console.log('Угадай слово:');
  const g1 = await until(() => A.last('party', d => d.g === 'guess' && d.stage === 'draw'), 30000);
  const gB = await until(() => B.last('party', d => d.g === 'guess' && d.stage === 'draw'), 3000);
  const D = g1 && g1.drawer === A.s.id ? A : B, G = D === A ? B : A;
  const dSnap = D.last('party', d => d.g === 'guess'), gSnap = G.last('party', d => d.g === 'guess');
  ok(!!g1 && !!gB && !!dSnap.word && !gSnap.word && /_/.test(gSnap.hint.en), 'рисующий видит слово, угадывающий — только подсказку', dSnap && JSON.stringify(dSnap.word));
  const tG = Date.now();
  D.s.emit('partyDraw', { n: true, c: 1, w: 0, p: [10, 10, 60, 40, 120, 80] });
  const st1 = await until(() => G.last('partyStroke', null, tG), 2000);
  ok(!!st1 && st1.c === 1 && st1.p.length === 6, 'штрих рисующего доходит до остальных', st1 && JSON.stringify(st1));
  G.s.emit('partyDraw', { n: true, c: 2, w: 0, p: [1, 1, 2, 2] });
  await sleep(400);
  ok(!D.last('partyStroke', null, tG), 'не рисующий рисовать не может');
  G.s.emit('partyGuess', { t: 'definitelynotaword' });
  const no = await until(() => G.last('partyNo', null, tG), 2000);
  await sleep(200);
  ok(!!no && !D.last('partyNo', null, tG) && !D.last('partyGuessed', null, tG), 'неверная догадка — ответ только самому угадывающему');
  G.s.emit('partyGuess', { t: '  ' + dSnap.word.en.toUpperCase() + '!' });
  const gd = await until(() => D.last('partyGuessed', d => d.id === G.s.id, tG), 3000);
  ok(!!gd && gd.name === G.name, 'верная догадка (регистр и знаки не важны) — видят все', gd && JSON.stringify(gd));
  const gEnd = await until(() => G.last('party', d => d.g === 'guess' && d.stage === 'end'), 3000);
  ok(!!gEnd && gEnd.word && gEnd.word.en === dSnap.word.en, 'угадали все — слово открыто');
  const gs = gEnd ? gEnd.score : [];
  const pg = (gs.find(x => x.id === G.s.id) || {}).pts, pd = (gs.find(x => x.id === D.s.id) || {}).pts;
  ok(pg > 100 && pd === 50, 'угадавшему — 100 и бонус за скорость, рисующему — 50', pg + ' / ' + pd);
  const rev2 = await until(() => A.last('hsReveal', d => d.variant === 'guess'), 8000);
  ok(!!rev2 && rev2.winnerName === G.name && rev2.word.en === dSnap.word.en, 'итог: победил угадавший, в итоге — слово', rev2 && JSON.stringify(rev2.word));

  console.log('Строительная битва:');
  const b1 = await until(() => A.last('party', d => d.g === 'build' && d.stage === 'build'), 30000);
  ok(!!b1 && b1.theme && b1.theme.en && b1.size === 12, 'тема и поле 12×12', b1 && b1.theme.en);
  const pxA = '2'.repeat(60) + '.'.repeat(84), pxB = '5' + '.'.repeat(143);
  A.s.emit('partyBuild', { px: pxA });
  B.s.emit('partyBuild', { px: 'bad' });
  await sleep(200);
  B.s.emit('partyBuild', { px: pxB });
  // голосование: модели по очереди; каждый ставит чужой, своей — не может
  const seen = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < 20000 && seen.size < 2) {
    const va = A.last('party', d => d.g === 'build' && d.stage === 'vote' && !seen.has(d.k));
    if (!va) { await sleep(100); continue; }
    seen.add(va.k);
    if (va.own) {
      A.s.emit('partyVote', { s: 5 });            // за свою — не засчитается
      B.s.emit('partyVote', { s: 4 });
    } else {
      A.s.emit('partyVote', { s: 1 });
      B.s.emit('partyVote', { s: 3 });            // за свою — не засчитается
    }
  }
  ok(seen.size === 2, 'обе модели показаны по очереди');
  const bEnd = await until(() => A.last('party', d => d.g === 'build' && d.stage === 'end'), 8000);
  ok(!!bEnd && bEnd.win && bEnd.win.name === 'pt_a' && bEnd.win.pts === 4 && bEnd.win.px === pxA, 'лучшая модель — A: 4 звезды (своя оценка не в счёт)',
    bEnd && JSON.stringify(bEnd.win && { n: bEnd.win.name, p: bEnd.win.pts }));
  const rev3 = await until(() => A.last('hsReveal', d => d.variant === 'build'), 8000);
  ok(!!rev3 && rev3.winnerName === 'pt_a' && rev3.px === pxA, 'итог: победитель и его модель');
  A.s.close(); B.s.close();

  console.log('В браузере:');
  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'CF-Connecting-IP': '10.49.99.1' } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bfConsent', '1'); } catch (e) {} });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  await page.goto(S.base + '/', { waitUntil: 'domcontentloaded' });
  const modes = await page.evaluate(() => [...document.querySelectorAll('.card')].map(c => c.dataset.mode));
  ok(modes.indexOf('party') !== -1, 'на главной есть карточка «Party»', modes.join(','));
  await page.click('.card[data-mode="party"]');
  await page.waitForURL(/\/party$/, { timeout: 8000 }).catch(() => {});
  const rules = await until(() => page.evaluate(() => { const li = [...document.querySelectorAll('#mdList li')]; return li.length === 5 && li.every(x => x.textContent.trim()) ? document.getElementById('mdName').textContent : null; }), 6000);
  ok(rules === 'Party', 'страница /party: название и пять правил', rules);
  await page.click('#mdPlay');
  await page.waitForURL(/mode=party/, { timeout: 8000 }).catch(() => {});
  const room2 = await until(async () => { const r = await fetch(S.base + '/getRoomList?mode=hideAndSeek&variant=party').then(r => r.json()); return r.rooms[0] && r.rooms[0].room; }, 8000);
  ok(!!room2, 'браузер в комнате «Вечеринки»', room2);
  const C = bot(S.base, 'pt_c', room2);
  await connected([C]); C.join();

  // викторина: панель, ответ кнопкой
  const q = await until(() => C.last('party', d => d.g === 'quiz' && d.stage === 'q'), 25000);
  const shown = await until(() => page.evaluate(() => { const b = document.getElementById('gParty'); return b && b.style.display !== 'none' && document.querySelectorAll('#gParty .pOpt').length === 4 ? document.getElementById('gPQ').textContent : null; }), 5000);
  ok(!!q && shown === q.q.en, 'панель викторины: вопрос и четыре кнопки', shown);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'party-quiz.png') });
  const ri = q ? rightOf(q) : 0;
  await page.click('#gParty .pOpt[data-i="' + ri + '"]');
  C.s.emit('partyAns', { i: (ri + 1) % 4 });
  const okBtn = await until(() => page.evaluate((i) => { const b = document.querySelector('#gParty .pOpt[data-i="' + i + '"]'); return b && /\bok\b/.test(b.className) && /\bmine\b/.test(b.className); }, ri), 4000);
  ok(!!okBtn, 'свой ответ отмечен и подсвечен верным');
  // второй вопрос — клавишей
  const qk = await until(() => C.last('party', d => d.g === 'quiz' && d.stage === 'q' && d.n === 2), 6000);
  await until(() => page.evaluate(() => /Question 2/.test(document.getElementById('gPSub') ? document.getElementById('gPSub').textContent : '')), 3000);
  await page.keyboard.press(String(rightOf(qk) + 1));
  const keyOk = await until(() => page.evaluate(() => !!document.querySelector('#gParty .pOpt.mine')), 3000);
  ok(!!keyOk, 'ответ клавишей 1–4');
  const chatFocused = await page.evaluate(() => document.activeElement && document.activeElement.id);
  ok(chatFocused !== 'gMsg', 'цифра ответа не открыла чат', chatFocused);

  // угадай слово
  const gc = await until(() => C.last('party', d => d.g === 'guess' && d.stage === 'draw'), 35000);
  ok(!!gc, 'раунд «Угадай слово»');
  await until(() => page.evaluate(() => !!document.getElementById('gPBoard')), 4000);
  if (gc && gc.drawer !== C.s.id) {
    // браузер рисует мышью — бот видит штрихи
    const tw = Date.now();
    const bx = await page.evaluate(() => { const r = document.getElementById('gPBoard').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await page.mouse.move(bx.x + bx.w * 0.2, bx.y + bx.h * 0.3); await page.mouse.down();
    for (let k = 1; k <= 8; k++) { await page.mouse.move(bx.x + bx.w * (0.2 + k * 0.07), bx.y + bx.h * (0.3 + k * 0.04)); await sleep(30); }
    await page.mouse.up();
    const got = await until(() => C.last('partyStroke', null, tw), 3000);
    ok(!!got && got.p.length >= 4, 'рисунок мышью доходит до других', got && got.p.length);
    const word = await page.evaluate(() => document.getElementById('gPWord').textContent);
    ok(/Draw:/.test(word), 'рисующему показано слово', word);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'party-draw.png') });
    C.s.emit('partyGuess', { t: gc.drawer === C.s.id ? '' : 'zzz' });
  } else {
    // бот рисует, браузер угадывает с клавиатуры: печать уходит в поле догадки
    C.s.emit('partyDraw', { n: true, c: 5, w: 1, p: [40, 40, 200, 150, 400, 60] });
    const drawn = await until(() => page.evaluate(() => { const c = document.getElementById('gPBoard'); const d = c.getContext('2d').getImageData(200, 150, 1, 1).data; return d[2] > 200 && d[0] < 120; }), 3000);
    ok(!!drawn, 'штрих бота нарисован на доске');
    const w = C.last('party', d => d.g === 'guess' && d.word).word.en;
    await page.keyboard.type(w.slice(0, 1)); await sleep(80);
    const focus = await page.evaluate(() => document.activeElement && document.activeElement.id);
    ok(focus === 'gPGuess', 'печать уходит в поле догадки, а не в чат', focus);
    await page.keyboard.type(w.slice(1)); await page.keyboard.press('Enter');
    ok(!!await until(() => C.last('partyGuessed', d => d.name !== 'pt_c'), 3000), 'догадка из браузера засчитана');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'party-guess.png') });
  }

  // строительная битва: клетки мышью, потом звёзды за модель бота
  const bc = await until(() => C.last('party', d => d.g === 'build' && d.stage === 'build'), 40000);
  ok(!!bc, 'раунд строительной битвы');
  await until(() => page.evaluate(() => !!document.getElementById('gPGrid')), 4000);
  C.s.emit('partyBuild', { px: '7'.repeat(30) + '.'.repeat(114) });
  const gr = await page.evaluate(() => { const r = document.getElementById('gPGrid').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; });
  await page.click('#gParty .pSw[data-b="5"]');
  await page.mouse.move(gr.x + gr.w * 0.1, gr.y + gr.w * 0.5); await page.mouse.down();
  for (let k = 1; k <= 6; k++) { await page.mouse.move(gr.x + gr.w * (0.1 + k * 0.12), gr.y + gr.w * 0.5); await sleep(30); }
  await page.mouse.up();
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'party-build.png') });
  let sawMine = false, rated = false;
  const tb = Date.now();
  while (Date.now() - tb < 25000 && !(sawMine && rated)) {
    const v = C.last('party', d => d.g === 'build' && d.stage === 'vote');
    if (v && !v.own && v.show && (v.show.match(/5/g) || []).length >= 4) sawMine = true;     // мышь шла через клетку — клетки не подряд
    const own = await page.evaluate(() => !!document.querySelector('#gParty .pStar') && !document.querySelector('#gParty .pStar').disabled);
    if (own && !rated) { await page.click('#gParty .pStar[data-s="4"]'); rated = await until(() => page.evaluate(() => document.querySelectorAll('#gParty .pStar.on').length === 4), 2000); if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'party-vote.png') }); }
    if (!sawMine || !rated) await sleep(150);
  }
  ok(sawMine, 'модель из браузера (нарисованная мышью) показана другим');
  ok(rated, 'звёзды за чужую модель — четыре');
  const endB = await until(() => C.last('party', d => d.g === 'build' && d.stage === 'end'), 10000);
  const cScore = endB && (endB.score.find(x => x.id === C.s.id) || {}).pts;
  ok(cScore === 4, 'модели бота засчитаны четыре звезды из браузера', cScore);
  ok(errs.length === 0, 'ошибок скриптов нет', errs.join(' | '));
  await browser.close();
  C.s.close();
  console.log(`\n${pass} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
