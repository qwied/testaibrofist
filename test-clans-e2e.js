/* Кланы на настоящем сервере: страница (создать, заявка, принять), профиль, значок в меню,
   смена ника и тег клана рядом с ником в игре. Свой сервер на копии репозитория (порт 3213). */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const { PNG } = require('pngjs');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
const PORT = 3213, BASE = 'http://127.0.0.1:' + PORT;
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(60); } return null; };

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-clans-e2e-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: s => {
    const r = path.relative(ROOT, s);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  const A = require('./accounts.js');
  const mk = (name, coins, score) => {
    const salt = 'cd'.repeat(16);
    return { name, salt, hash: A.hashNew('Passw0rd!x', salt), joined: Date.now(), lastSeen: Date.now(), coins, score: score || 0,
             about: '', avatar: '0', items: [], skin: {}, lang: '', friends: [], incoming: [], outgoing: [] };
  };
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(path.join(tmp, 'data', 'users.json'), JSON.stringify({ users: {
    nightlead: mk('NightLead', 2000, 12), nightmem: mk('NightMem', 0, 5) }, sessions: {} }));
  const srv = spawn('node', ['server.js'], { cwd: tmp, env: { ...process.env, PASSWORD_AUTH: '1', PORT: String(PORT) }, stdio: 'ignore' });
  const cleanup = () => { try { srv.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} };
  process.on('exit', cleanup);
  if (!await until(() => fetch(BASE + '/').then(r => r.ok).catch(() => false), 20000)) throw new Error('сервер не поднялся');

  const ip = '10.' + (1 + Math.floor(Math.random() * 250)) + '.13.1';
  const login = async name => {
    const r = await fetch(BASE + '/login/password', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
      body: JSON.stringify({ name, password: 'Passw0rd!x' }) });
    return (/sid=[^;]+/.exec((r.headers.getSetCookie() || [])[0] || '') || [''])[0];
  };
  const api = async (cookie, url, body) => (await fetch(BASE + url, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, cookie }, body: body ? JSON.stringify(body) : undefined })).json();
  const lead = await login('NightLead'), mem = await login('NightMem');
  ok(lead && mem, 'оба игрока вошли');

  const browser = await chromium.launch();
  const mkPage = async cookie => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'CF-Connecting-IP': ip } });
    if (cookie) await ctx.addCookies([{ name: 'sid', value: cookie.slice(4), url: BASE }]);
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message.slice(0, 140)));
    p.on('dialog', d => d.accept());
    return p;
  };
  const errs = [];
  const open = async (p, url) => {
    await p.goto(BASE + url, { waitUntil: 'networkidle' });
    await p.evaluate(() => { const c = document.getElementById('bfConsent'); if (c) c.remove(); });
    await sleep(500);
  };

  // ---- гость ----
  const g = await mkPage('');
  await open(g, '/clans');
  ok(!!(await g.$('.bfNavItem[data-key="clans"]')), 'в боковом меню есть пункт «Clans»');
  ok(/Sign in/i.test(await g.textContent('#clMine')), 'гостю предлагают войти');
  ok(!(await g.isVisible('#clNew')), 'гость не видит кнопку создания');

  // ---- лидер создаёт клан через форму ----
  const pl = await mkPage(lead);
  await open(pl, '/clans');
  ok(/No clans yet/i.test(await pl.textContent('#clList')), 'список пока пуст');
  ok(/Free/i.test(await pl.textContent('#clNew')), 'на кнопке «Create a clan» написано «Free»');
  await pl.click('#clNew');
  ok(/free/i.test(await pl.textContent('#clForm')), 'в форме сказано, что создание бесплатно');
  await pl.fill('#clfName', 'Night Owls');
  await pl.fill('#clfTag', 'owl');
  await pl.fill('#clfDesc', 'We play at night');
  await pl.evaluate(() => { const c = document.getElementById('clfColor'); c.value = '#16a34a'; c.dispatchEvent(new Event('input', { bubbles: true })); });
  await pl.selectOption('#clfOpen', 'false');
  await pl.click('#clfGo');
  await pl.waitForURL(/clans\?id=/, { timeout: 8000 });
  await sleep(600);
  const clanId = new URL(pl.url()).searchParams.get('id');
  ok(/Night Owls/.test(await pl.textContent('h1')) && (await pl.textContent('.clTag')) === 'OWL', 'клан создан, тег в верхнем регистре');
  ok(!!(await pl.$('[data-act="disband"]')) && !!(await pl.$('[data-act="save"]')), 'лидер видит роспуск и настройки');
  ok((await pl.textContent('.clMem')).includes('NightLead') && /Leader/i.test(await pl.textContent('.clMem')), 'лидер в списке участников');

  // ---- игрок подаёт заявку ----
  const pm = await mkPage(mem);
  await open(pm, '/clans');
  ok(/Night Owls/.test(await pm.textContent('#clList')) && /By request/i.test(await pm.textContent('#clList')), 'клан в списке, вход по заявке');
  await pm.click('.clRow');
  await pm.waitForSelector('[data-act="join"]');
  ok(/Request to join/i.test(await pm.textContent('[data-act="join"]')), 'кнопка «Request to join»');
  await pm.click('[data-act="join"]');
  await pm.waitForSelector('[data-act="cancel"]');
  ok(true, 'после заявки кнопка «Cancel request»');
  ok(!(await pm.$('[data-act="accept"]')), 'заявитель не видит чужие заявки');

  // ---- значок в меню и принятие ----
  const note = await api(lead, '/notifications');
  ok(note.clans && note.clans.requests === 1, 'лидеру пришло уведомление о заявке', JSON.stringify(note.clans));
  await pl.reload({ waitUntil: 'networkidle' });
  await sleep(500);
  ok(/NightMem/.test(await pl.textContent('body')) && !!(await pl.$('[data-act="accept"]')), 'лидер видит заявку');
  await pl.click('[data-act="accept"]');
  await sleep(800);
  ok((await pl.$$('.clMem')).length >= 2 && /NightMem/.test(await pl.textContent('body')), 'игрок принят, в клане двое');
  ok((await api(lead, '/notifications')).clans.requests === 0, 'уведомление погасло');
  const c1 = await api(mem, '/clan?id=' + clanId);
  ok(c1.myRole === 'member' && c1.members === 2 && c1.points === 17, 'очки клана — сумма очков участников', c1.points + ' очков');

  // ---- профиль игрока ----
  const prof = await mkPage('');
  await open(prof, '/users?name=NightMem');
  await sleep(600);
  ok(/OWL/.test(await prof.textContent('#upClan')) && /Night Owls/.test(await prof.textContent('#upClan')), 'в профиле виден клан игрока');

  // ---- смена ника ----
  const ren = await api(lead, '/changeNickname', { name: 'NightBoss' });
  ok(ren.status === 'success', 'лидер сменил ник', ren.message);
  const c2 = await api(lead, '/clan?id=' + clanId);
  ok(c2.leader === 'NightBoss' && c2.memberList.some(m => m.name === 'NightBoss' && m.role === 'leader'), 'клан узнал лидера под новым ником');

  // ---- тег клана в игре ----
  const sa = io(BASE, { extraHeaders: { cookie: mem, 'CF-Connecting-IP': ip }, transports: ['websocket'], forceNew: true });
  let list = null;
  sa.on('playersList', l => { list = l; });
  await until(() => sa.connected);
  sa.emit('join', { gameMode: 'race', room: 'clroom', playerName: 'x' });
  const mine = await until(() => list && list.find(p => p.name === 'NightMem'));
  ok(mine && mine.clanTag === 'OWL' && mine.clanColor === '#16a34a', 'сервер присылает тег и цвет клана в списке игроков', mine && mine.clanTag + ' ' + mine.clanColor);
  const guestSock = io(BASE, { extraHeaders: { 'CF-Connecting-IP': ip }, transports: ['websocket'], forceNew: true });
  let list2 = null;
  guestSock.on('playersList', l => { list2 = l; });
  await until(() => guestSock.connected);
  guestSock.emit('join', { gameMode: 'race', room: 'clroom', playerName: 'Wanderer' });
  const seen = await until(() => list2 && list2.find(p => p.name === 'NightMem'));
  const me2 = list2 && list2.find(p => p.name !== 'NightMem');
  ok(seen && seen.clanTag === 'OWL', 'гость тоже видит тег');
  ok(me2 && me2.clanTag === '', 'у игрока без клана тега нет', me2 && JSON.stringify(me2.clanTag));
  guestSock.disconnect();

  // тег нарисован на экране: наблюдатель открывает игру, игрок стоит перед ним
  const obs = await mkPage(await login('NightBoss'));
  await open(obs, '/game?mode=race&room=clroom');
  const known = await until(() => obs.evaluate(() => window.__bfChatDebug && window.__bfChatDebug.clanTags['NightMem']), 10000);
  ok(known && known.tag === 'OWL', 'клиент знает тег игрока', JSON.stringify(known));
  const mover = setInterval(() => sa.emit('movePlayer', { position: { x: 560, y: 380, w: 34, h: 74 } }), 80);
  await sleep(1500);
  await obs.evaluate(() => { const b = document.getElementById('gBanner'); if (b) b.style.display = 'none'; });
  await sleep(400);
  const shot = await obs.screenshot();
  if (process.env.SHOT) fs.writeFileSync(process.env.SHOT, shot);
  const png = PNG.sync.read(shot);
  let hits = 0;
  for (let i = 0; i < png.data.length; i += 4)
    if (Math.abs(png.data[i] - 22) < 12 && Math.abs(png.data[i + 1] - 163) < 12 && Math.abs(png.data[i + 2] - 74) < 12) hits++;
  ok(hits > 40, 'тег «[OWL]» нарисован цветом клана', hits + ' px');
  clearInterval(mover);

  // ---- выход и роспуск ----
  ok((await api(mem, '/clan/leave', {})).status === 'success', 'игрок вышел');
  ok((await api(lead, '/clan/disband', {})).status === 'success', 'лидер распустил клан');
  const after = await api(mem, '/clan/list');
  ok(after.total === 0, 'список пуст');

  ok(errs.length === 0, 'ошибок скриптов нет', errs.join(' | '));
  sa.disconnect(); await browser.close(); cleanup();
  console.log(pass + ' ok, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
