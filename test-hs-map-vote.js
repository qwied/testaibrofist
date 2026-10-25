/* Голосование за следующую карту в прятках (см. hsOpenVote в server.js и блок «Next map» в game.js).
   Во время охоты сервер предлагает до трёх карт, игроки голосуют (можно передумать), в следующем лобби
   загружается карта с большинством голосов. Свой сервер на копии репозитория (порт 3222) с четырьмя
   картами пряток и коротким раундом (HS_ROUND_MS). */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
const PORT = 3222, BASE = 'http://127.0.0.1:' + PORT;
const OWNER = 'votetestowner';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(60); } return null; };
const once = (s, ev, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('нет события ' + ev)), ms || 40000); s.once(ev, d => { clearTimeout(t); res(d); }); });

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-vote-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const mapData = JSON.stringify({ mode: 'hideAndSeek', objects: [
    { id: 1, type: 'spawn', x: 100, y: 400, w: 30, h: 100 }, { id: 2, type: 'rect', x: 0, y: 500, w: 900, h: 80 }] });
  const names = ['Alpha', 'Bravo', 'Charlie', 'Delta'];
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify(names.map(n => ({
    mapName: n, mapType: 'hideAndSeek', mapData, author: OWNER, date: Date.now(), created: Date.now(),
    rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: [] }))));
  const srv = spawn('node', ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(PORT), OWNER_ALIASES: OWNER, HS_ROUND_MS: '14000' }, stdio: 'ignore' });
  const cleanup = () => { try { srv.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} };
  process.on('exit', cleanup);
  if (!await until(() => fetch(BASE + '/').then(r => r.ok).catch(() => false), 20000)) throw new Error('сервер не поднялся');

  const room = 'vote' + Math.floor(Math.random() * 1e6);
  const mk = (n) => { const s = io(BASE, { transports: ['websocket'], forceNew: true, extraHeaders: { 'CF-Connecting-IP': '10.22.' + n + '.1' } }); return s; };
  const a = mk(1), b = mk(2);
  await Promise.all([once(a, 'connect'), once(b, 'connect')]);
  const tallies = [];
  a.on('hsVoteTally', d => tallies.push(d.counts.join(',')));
  const lobbyA = once(a, 'hsPhase', 15000);
  a.emit('join', { playerName: 'voter_a', gameMode: 'hideAndSeek', room });
  await sleep(200);
  b.emit('join', { playerName: 'voter_b', gameMode: 'hideAndSeek', room });
  const lobby = await lobbyA;
  ok(lobby.phase === 'lobby' && lobby.map && names.indexOf(lobby.map.mapName) !== -1 && !lobby.voted, 'первое лобби — карта выбрана сервером, без голосования', JSON.stringify(lobby.map));

  // голос в лобби не принимается
  a.emit('hsVote', { i: 0 });
  await sleep(400);
  ok(tallies.length === 0, 'в лобби голосовать нельзя');

  const voteA = once(a, 'hsVote', 40000), voteB = once(b, 'hsVote', 40000);
  const [va, vb] = await Promise.all([voteA, voteB]);
  const optNames = va.options.map(o => o.mapName);
  ok(va.options.length === 3 && vb.options.length === 3, 'в начале охоты обоим предложены 3 карты', optNames.join(', '));
  ok(new Set(optNames).size === 3 && optNames.every(n => names.indexOf(n) !== -1), 'все варианты разные и из пула карт пряток');
  ok(optNames.indexOf(lobby.map.mapName) === -1, 'текущую карту не предлагают, раз есть из чего выбрать');
  ok(va.counts.join(',') === '0,0,0', 'голосов пока нет');

  // голоса, смена голоса, мусор
  a.emit('hsVote', { i: 1 }); b.emit('hsVote', { i: 1 });
  ok(!!await until(() => tallies[tallies.length - 1] === '0,2,0'), 'оба за второй вариант: 0,2,0', tallies.join(' | '));
  b.emit('hsVote', { i: 2 });
  ok(!!await until(() => tallies[tallies.length - 1] === '0,1,1'), 'второй передумал: 0,1,1');
  const before = tallies.length;
  b.emit('hsVote', { i: 99 }); b.emit('hsVote', { i: 'x' }); b.emit('hsVote', null); b.emit('hsVote', { i: -1 });
  await sleep(500);
  ok(tallies.length === before, 'мусорные голоса игнорируются');

  // зашёл посреди охоты — видит голосование; ушёл — его голос снимается
  const c = mk(3);
  await once(c, 'connect');
  const stC = once(c, 'hsState', 8000);
  c.emit('join', { playerName: 'voter_c', gameMode: 'hideAndSeek', room });
  const sc = await stC;
  ok(sc.phase === 'round' && sc.vote && sc.vote.options.length === 3 && sc.vote.counts.join(',') === '0,1,1', 'вошедший посреди охоты получает текущее голосование', JSON.stringify(sc.vote && sc.vote.counts));
  c.emit('hsVote', { i: 0 });
  ok(!!await until(() => tallies[tallies.length - 1] === '1,1,1'), 'третий голос: 1,1,1');
  c.disconnect();
  ok(!!await until(() => tallies[tallies.length - 1] === '0,1,1'), 'ушёл — его голос снят: 0,1,1');

  // браузер: блок «Next map» в карточке карты
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'CF-Connecting-IP': '10.22.9.9' } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await page.goto(BASE + '/game.html?mode=hideAndSeek&room=' + room, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { const x = document.getElementById('bfConsent'); if (x) x.remove(); });
  const shown = await until(() => page.evaluate(() => { const v = document.getElementById('gVote'); return v && v.style.display === 'block' && v.querySelectorAll('button').length; }), 8000);
  ok(shown === 3, 'в карточке карты появился блок «Next map» с тремя кнопками', String(shown));
  const label = await page.evaluate(() => document.getElementById('gVoteT').textContent);
  ok(/Next map/.test(label), 'подпись по-английски', label);
  await page.click('#gVoteOpts button[data-i="1"]');
  ok(!!await until(() => tallies[tallies.length - 1] === '0,2,1'), 'клик в браузере засчитан: 0,2,1', tallies[tallies.length - 1]);
  const uiNow = () => page.evaluate(() => Array.from(document.querySelectorAll('#gVoteOpts button')).map(b => (b.classList.contains('on') ? '*' : '') + b.querySelector('.c').textContent).join(','));
  const ui = await until(async () => { const u = await uiNow(); return u === '0,*2,1' ? u : null; }, 8000) || await uiNow();
  ok(ui === '0,*2,1', 'выбранная кнопка подсвечена, счётчики на кнопках', ui);
  const box = await page.locator('#gMap').boundingBox();
  ok(box && box.x + box.width <= 1280 && box.y + box.height <= 800 && box.y >= 0, 'карточка с голосованием целиком на экране', JSON.stringify(box && { y: Math.round(box.y), h: Math.round(box.height) }));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });

  // телефон: та же карточка, кнопки помещаются
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, extraHTTPHeaders: { 'CF-Connecting-IP': '10.22.8.8' } });
  const pp = await pctx.newPage();
  pp.on('pageerror', e => errs.push('phone: ' + e.message.slice(0, 140)));
  await pp.goto(BASE + '/game.html?mode=hideAndSeek&room=' + room, { waitUntil: 'domcontentloaded' });
  await pp.evaluate(() => { const x = document.getElementById('bfConsent'); if (x) x.remove(); });
  const pshown = await until(() => pp.evaluate(() => { const v = document.getElementById('gVote'); return v && v.style.display === 'block'; }), 8000);
  const pfit = pshown && await pp.evaluate(() => {
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    return Array.from(document.querySelectorAll('#gVoteOpts button')).every(b => { const r = b.getBoundingClientRect(); return r.width > 40 && r.left >= 0 && r.right <= vw + 1 && r.bottom <= vh; });
  });
  ok(!!pfit, 'на телефоне кнопки голосования целиком на экране');
  if (process.env.SHOT2) await pp.screenshot({ path: process.env.SHOT2 });
  await pctx.close();

  // конец охоты — следующее лобби на победившей карте
  const nextLobby = await until(async () => { const d = await once(a, 'hsPhase', 30000); return d.phase === 'lobby' ? d : null; }, 40000);
  ok(nextLobby && nextLobby.map && nextLobby.map.mapName === optNames[1] && nextLobby.voted === true, 'следующее лобби загрузило победившую карту', nextLobby && JSON.stringify(nextLobby.map));
  const hidden = await until(() => page.evaluate(() => document.getElementById('gVote').style.display === 'none'), 5000);
  ok(!!hidden, 'в лобби блок голосования скрыт');
  const logged = await until(() => page.evaluate((n) => (document.body.innerText || '').indexOf(n) !== -1 && /by vote/i.test(document.body.innerText), optNames[1]), 5000);
  ok(!!logged, 'в журнале игры написано, что карта выбрана голосованием');

  ok(errs.length === 0, 'ошибок скриптов нет', errs.join(' | '));
  a.disconnect(); b.disconnect(); await browser.close(); cleanup();
  console.log(pass + ' ok, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
