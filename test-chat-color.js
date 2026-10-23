/* Купленный цвет чата доходит до игры: сервер шлёт его в списке игроков и в репликах,
   клиент рисует им ник под фигурой и реплики над головой.
   Свой сервер на копии репозитория (порт 3212) — монеты нужны, а на общем их взять негде. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const { PNG } = require('pngjs');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
const PORT = 3212, BASE = 'http://127.0.0.1:' + PORT;
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(60); } return null; };

(async () => {
  // копия сайта с пустыми данными и двумя игроками: у a есть 600 монет, у b нет цвета
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-chatcolor-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: s => {
    const r = path.relative(ROOT, s);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  const A = require('./accounts.js');
  const mk = (name, coins) => {
    const salt = 'ab'.repeat(16);
    return { name, salt, hash: A.hashNew('Passw0rd!x', salt), joined: Date.now(), lastSeen: Date.now(), coins,
             about: '', avatar: '0', items: [], skin: {}, lang: '', friends: [], incoming: [], outgoing: [] };
  };
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(path.join(tmp, 'data', 'users.json'),
    JSON.stringify({ users: { colorbro: mk('ColorBro', 600), plainbro: mk('PlainBro', 0) }, sessions: {} }));

  const srv = spawn('node', ['server.js'], { cwd: tmp, env: { ...process.env, PASSWORD_AUTH: '1', PORT: String(PORT) }, stdio: 'ignore' });
  const cleanup = () => { try { srv.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} };
  process.on('exit', cleanup);
  if (!await until(() => fetch(BASE + '/').then(r => r.ok).catch(() => false), 20000)) throw new Error('сервер не поднялся');

  const ip = '10.' + (1 + Math.floor(Math.random() * 250)) + '.12.1';
  const api = async (cookie, url, body) => {
    const r = await fetch(BASE + url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, cookie: cookie || '' },
      body: JSON.stringify(body || {}) });
    const sc = (r.headers.getSetCookie && r.headers.getSetCookie()[0]) || '';
    return { json: await r.json(), cookie: (/sid=[^;]+/.exec(sc) || [''])[0] };
  };
  const a = await api('', '/login/password', { name: 'ColorBro', password: 'Passw0rd!x' });
  const b = await api('', '/login/password', { name: 'PlainBro', password: 'Passw0rd!x' });
  ok(a.json.status === 'success' && b.json.status === 'success' && a.cookie && b.cookie, 'оба игрока вошли');

  // до покупки цвет не выбрать, после — выбирается; неверный цвет не принимается
  let r = await api(a.cookie, '/setMyBio', { chatColor: '#e11d48' });
  ok(r.json.status !== 'success', 'до покупки цвет не выбрать', r.json.message);
  r = await api(a.cookie, '/chatColor/unlock');
  ok(r.json.status === 'success', 'цвет куплен', r.json.message);
  r = await api(a.cookie, '/setMyBio', { chatColor: '#E11D48' });
  ok(r.json.status === 'success', 'цвет сохранён', r.json.message);
  await api(a.cookie, '/setMyBio', { chatColor: 'red' });
  const bio = await fetch(BASE + '/getMyBio', { headers: { cookie: a.cookie, 'CF-Connecting-IP': ip } }).then(x => x.json());
  ok(bio.chatColor === '#E11D48', 'неверный цвет не заменяет выбранный', bio.chatColor);

  // сервер: список игроков и реплики несут цвет
  const mkSock = cookie => io(BASE, { extraHeaders: { cookie, 'CF-Connecting-IP': ip }, transports: ['websocket'], forceNew: true });
  const sa = mkSock(a.cookie), sb = mkSock(b.cookie);
  const listB = [], msgsA = [], msgsB = [];
  sb.on('playersList', l => listB.push(l));
  sa.on('chatMessage', m => msgsA.push(m));
  sb.on('chatMessage', m => msgsB.push(m));
  await until(() => sa.connected && sb.connected);
  const room = { gameMode: 'race', room: 'ccroom' };
  sa.emit('join', { ...room, playerName: 'x' });
  await sleep(300);
  sb.emit('join', { ...room, playerName: 'x' });
  const full = await until(() => listB.find(l => l.length === 2));
  const pa = full && full.find(p => p.name === 'ColorBro'), pb = full && full.find(p => p.name === 'PlainBro');
  ok(pa && pa.chatColor === '#e11d48', 'в списке игроков у купившего есть цвет', pa && pa.chatColor);
  ok(pb && pb.chatColor === '', 'у некупившего цвета нет', pb && JSON.stringify(pb.chatColor));
  sa.emit('sendChat', { text: 'hello' });
  sb.emit('sendChat', { text: 'hi' });
  await until(() => msgsB.length && msgsA.length >= 2, 4000);
  const fromA = msgsB.find(m => m.playerName === 'ColorBro'), fromB = msgsA.find(m => m.playerName === 'PlainBro');
  ok(fromA && fromA.color === '#e11d48', 'реплика купившего приходит с цветом', fromA && fromA.color);
  ok(fromB && fromB.color === '', 'реплика некупившего — без цвета', fromB && JSON.stringify(fromB.color));

  // клиент: открываем игру за купившего, второй игрок уже в комнате
  const b2 = await chromium.launch();
  const ctx = await b2.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'CF-Connecting-IP': ip } });
  await ctx.addCookies([{ name: 'sid', value: a.cookie.slice(4), url: BASE }]);
  const errs = [];
  ctx.on('page', p => p.on('pageerror', e => errs.push(e.message.slice(0, 120))));
  sa.disconnect();                                   // одного аккаунта — один игрок
  await sleep(500);
  const p = await ctx.newPage();
  await p.goto(BASE + '/game?mode=race&room=ccroom', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => { const c = document.getElementById('bfConsent'); if (c) c.remove(); });
  const dbg = await until(() => p.evaluate(() => window.__bfChatDebug && window.__bfChatDebug.chatColors['ColorBro']), 10000);
  ok(dbg === '#e11d48', 'клиент знает свой цвет из списка игроков', dbg);
  sb.emit('sendChat', { text: 'plain talk' });
  await until(() => p.evaluate(() => (window.__bfChatDebug.spoken['PlainBro'] || []).length), 4000);
  const plain = await p.evaluate(() => window.__bfChatDebug.spoken['PlainBro'][0]);
  ok(plain && plain.color === '', 'чужая реплика без цвета рисуется как обычно', JSON.stringify(plain));
  await p.fill('#gMsg', 'colored talk');
  await p.press('#gMsg', 'Enter');
  const own = await p.evaluate(() => (window.__bfChatDebug.spoken['ColorBro'] || [])[0]);
  ok(own && own.color === '#e11d48', 'своя реплика уплывает с купленным цветом', JSON.stringify(own));
  const echoed = await until(() => msgsB.filter(m => m.text === 'colored talk')[0], 4000);
  ok(echoed && echoed.color === '#e11d48', 'остальные получают её с цветом', echoed && echoed.color);

  // на экране: наблюдатель видит ник и реплику цветного игрока нарисованными этим цветом
  await b2.close();
  sb.disconnect();                                   // одного аккаунта — один игрок
  await sleep(500);
  const sa2 = mkSock(a.cookie);
  await until(() => sa2.connected);
  const b3 = await chromium.launch();
  const ctx2 = await b3.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'CF-Connecting-IP': ip } });
  await ctx2.addCookies([{ name: 'sid', value: b.cookie.slice(4), url: BASE }]);
  ctx2.on('page', pg => pg.on('pageerror', e => errs.push(e.message.slice(0, 120))));
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + '/game?mode=race&room=ccroom', { waitUntil: 'domcontentloaded' });
  await p2.evaluate(() => { const c = document.getElementById('bfConsent'); if (c) c.remove(); });
  await until(() => p2.evaluate(() => !!window.__bfChatDebug), 10000);
  sa2.emit('join', { ...room, playerName: 'x' });
  await until(() => p2.evaluate(() => window.__bfChatDebug.chatColors['ColorBro']), 6000);
  await sleep(600);
  sa2.emit('sendChat', { text: 'colored words' });
  await until(() => p2.evaluate(() => (window.__bfChatDebug.spoken['ColorBro'] || []).length), 4000);
  const seen = await p2.evaluate(() => window.__bfChatDebug.spoken['ColorBro'][0]);
  ok(seen && seen.color === '#e11d48', 'наблюдатель получил реплику с цветом', JSON.stringify(seen));
  await p2.evaluate(() => { const g = document.getElementById('gBanner'); if (g) g.style.display = 'none'; });
  await sleep(500);
  const shot = await p2.screenshot();
  if (process.env.SHOT) fs.writeFileSync(process.env.SHOT, shot);
  const png = PNG.sync.read(shot);
  let hits = 0;
  for (let i = 0; i < png.data.length; i += 4)
    if (Math.abs(png.data[i] - 225) < 10 && Math.abs(png.data[i + 1] - 29) < 10 && Math.abs(png.data[i + 2] - 72) < 10) hits++;
  ok(hits > 40, 'на экране есть пиксели купленного цвета', hits + ' px');
  sa2.disconnect(); await b3.close(); cleanup();
  ok(errs.length === 0, 'ошибок скриптов нет', errs.join(' | '));
  console.log(pass + ' ok, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
