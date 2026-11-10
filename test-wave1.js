/* Первая волна идей игроков: приватные комнаты по коду (isPrivateRoom в server.js, roomList.js),
   поиск карт по названию и переход на страницу в Maps Browser, список игроков по Tab с
   «Заглушить» / «Скрыть» (game.js). Свой сервер: 3263. Запуск: node test-wave1.js */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const { io } = require('socket.io-client');
const ROOT = __dirname;
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + String(x).slice(0, 220))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(80); } return null; };

function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave1-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const now = Date.now();
  const objs = [{ type: 'rect', x: 0, y: 600, w: 1400, h: 40, fill: '#475569' }, { type: 'spawn', x: 60, y: 500, w: 30, h: 100 }, { type: 'finishline', x: 1200, y: 500, w: 40, h: 100 }];
  const map = (name, k) => ({ mapName: name, mapType: 'race', author: 'wave1owner', date: now - k * 1000, created: now, rating: 0, votes: {},
    boostLikes: 0, boostDislikes: 0, inGameModes: [], mapData: JSON.stringify({ mode: 'race', gravity: 1, objects: objs }) });
  const maps = [map('Lava Tower', 1), map('Ice Cave', 2), map('lava lake', 3)];
  for (let i = 0; i < 24; i++) maps.push(map('Filler ' + i, 10 + i));
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify(maps));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), OWNER_ALIASES: 'wave1owner' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
const J = (S, u) => fetch(S.base + u).then(r => r.json());
function player(S, name, mode, room) {
  const s = io(S.base, { transports: ['websocket'], forceNew: true });
  return new Promise(res => s.on('connect', () => { s.emit('join', { playerName: name, gameMode: mode, room }); setTimeout(() => res(s), 400); }));
}

(async () => {
  const S = server(3263);
  await until(() => fetch(S.base + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [];
  try {
    console.log('Приватные комнаты:');
    const a = await player(S, 'PrivA', 'race', 'pk3x9aq');
    const pub = await player(S, 'PubA', 'race', 'room1');
    const list = await J(S, '/getRoomList?mode=race');
    ok(list.rooms.some(r => r.room === 'room1') && !list.rooms.some(r => /pk3x9aq/.test(r.room)), 'приватной комнаты нет в списке комнат', JSON.stringify(list.rooms.map(r => r.room)));
    const best = await J(S, '/getBestRoom?mode=race');
    ok(best.room === 'room1', '«Играть» не заводит в приватную комнату', JSON.stringify(best));
    const online = await J(S, '/api/online');
    ok(!/PrivA|pk3x9aq/.test(JSON.stringify(online)) && /PubA/.test(JSON.stringify(online)), 'в /api/online приватной комнаты и её игроков нет', JSON.stringify(online).slice(0, 160));
    const ex = await J(S, '/getPrivateRoom?mode=race&room=pk3x9aq');
    ok(ex.exists === true && ex.players === 1, 'по коду комната находится', JSON.stringify(ex));
    const no = await J(S, '/getPrivateRoom?mode=race&room=pzzzzzz');
    ok(no.exists === false, 'по несуществующему коду — «нет комнаты»', JSON.stringify(no));
    const notPriv = await J(S, '/getPrivateRoom?mode=race&room=room1');
    ok(notPriv.exists === false, 'обычную комнату по коду не выдаёт', JSON.stringify(notPriv));
    // приватная комната отдельного режима: war-p…
    const w = await player(S, 'PrivW', 'hideAndSeek', 'war-pabc234');
    const wl = await J(S, '/getRoomList?mode=hideAndSeek&variant=war');
    ok(!wl.rooms.length, 'приватной комнаты War нет в списке War', JSON.stringify(wl.rooms));
    const wex = await J(S, '/getPrivateRoom?mode=hideAndSeek&room=war-pabc234');
    ok(wex.exists === true, 'приватная комната War находится по коду', JSON.stringify(wex));

    console.log('Страница режима и вход по коду:');
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push('race: ' + e.message.slice(0, 160)));
    await pg.goto(S.base + '/race.html');
    await pg.waitForSelector('.rlPrivNew', { timeout: 8000 });
    await pg.fill('.rlPrivCode', 'zzzzzz'); await pg.click('.rlPrivJoin');
    ok(!!await until(() => pg.evaluate(() => document.querySelector('.rlPrivMsg').textContent.length > 3), 4000), 'неверный код — сообщение, а не пустая комната', await pg.textContent('.rlPrivMsg'));
    await pg.fill('.rlPrivCode', 'K3X9AQ'); await pg.click('.rlPrivJoin');
    await pg.waitForURL(/game\?mode=race&room=pk3x9aq/, { timeout: 8000 }).catch(() => {});
    ok(/room=pk3x9aq/.test(pg.url()), 'верный код ведёт в ту же приватную комнату', pg.url());
    const chip = await until(() => pg.evaluate(() => { const e = document.getElementById('gPriv'); return e && e.style.display !== 'none' ? e.textContent : null; }), 8000);
    ok(chip === 'K3X9AQ', 'в игре в шапке виден код комнаты', chip);
    const cnt = await until(() => pg.evaluate(() => document.getElementById('gCount').textContent === '2'), 8000);
    ok(!!cnt, 'в комнате двое: создатель и вошедший по коду');

    console.log('Список игроков (Tab):');
    await pg.keyboard.press('Tab');
    const rows = await until(() => pg.evaluate(() => { const p = document.getElementById('gPlayers'); return p && p.style.display !== 'none' ? p.textContent : null; }), 4000);
    ok(!!rows && /PrivA/.test(rows), 'Tab открывает список с другим игроком', rows);
    await pg.click('#gPlayers [data-pa="hide"][data-pn="PrivA"]');
    await pg.click('#gPlayers [data-pa="mute"][data-pn="PrivA"]');
    const st = await pg.evaluate(() => ({ h: window.__bfChatDebug.isHidden('PrivA'), m: window.__bfChatDebug.isMuted('PrivA'), ls: localStorage.getItem('bfHiddenPlayers') }));
    ok(st.h && st.m && /priva/.test(st.ls), '«Скрыть» и «Заглушить» включаются и запоминаются', JSON.stringify(st));
    a.emit('chatMessage', { text: 'hello from muted' }); a.emit('chat', { text: 'hello from muted' });
    await sleep(700);
    ok(await pg.evaluate(() => !(window.__bfChatDebug.spoken.PrivA || []).length), 'реплики заглушённого не показываются');
    await pg.click('#gPlayers [data-pa="hide"][data-pn="PrivA"]');
    ok(await pg.evaluate(() => !window.__bfChatDebug.isHidden('PrivA')), 'повторный клик возвращает игрока на экран');
    await pg.keyboard.press('Escape');
    ok(await pg.evaluate(() => document.getElementById('gPlayers').style.display === 'none'), 'Esc закрывает список');
    await pg.close();

    console.log('Создание приватной комнаты:');
    const pg2 = await ctx.newPage(); pg2.on('pageerror', e => errs.push('war: ' + e.message.slice(0, 160)));
    await pg2.goto(S.base + '/war.html');
    await pg2.waitForSelector('.rlPrivNew', { timeout: 8000 });
    await pg2.click('.rlPrivNew');
    await pg2.waitForURL(/game\?mode=war&room=war-p[a-z0-9]{6}$/, { timeout: 8000 }).catch(() => {});
    ok(/mode=war&room=war-p[a-z0-9]{6}$/.test(pg2.url()), '«Создать приватную комнату» на странице War — комната war-p…', pg2.url());
    await pg2.close();

    console.log('Maps Browser:');
    const mb = await ctx.newPage(); mb.on('pageerror', e => errs.push('maps: ' + e.message.slice(0, 160)));
    await mb.goto(S.base + '/mapsBrowser.html');
    await mb.waitForSelector('#mbName', { timeout: 8000 });
    const api = await J(S, '/getMapsForList?page=1&name=LAVA');
    ok(api.count === 2 && api.maps.every(m => /lava/i.test(m.mapName)), 'поиск по названию без учёта регистра', JSON.stringify(api.maps.map(m => m.mapName)));
    await mb.fill('#mbName', 'ice'); await mb.press('#mbName', 'Enter');
    const got = await until(() => mb.evaluate(() => { const t = document.getElementById('mbList').textContent; return /Ice Cave/.test(t) && !/Filler/.test(t) ? t : null; }), 6000);
    ok(!!got, 'на странице поиск по названию находит карту', got && got.slice(0, 60));
    await mb.fill('#mbName', ''); await mb.press('#mbName', 'Enter');
    await until(() => mb.evaluate(() => /^1\/[2-9]/.test(document.getElementById('mbPage').textContent)), 6000);
    await mb.click('#mbLast');
    const last = await until(() => mb.evaluate(() => { const t = document.getElementById('mbPage').textContent.split('/'); return t[0] === t[1] && t[0] !== '1' ? t.join('/') : null; }), 6000);
    ok(!!last, 'кнопка «в конец» листает на последнюю страницу', last);
    mb.once('dialog', d => d.accept('2'));
    await mb.click('#mbPage');
    ok(!!await until(() => mb.evaluate(() => /^2\//.test(document.getElementById('mbPage').textContent)), 6000), 'клик по номеру страницы — переход на нужную', await mb.textContent('#mbPage'));
    await mb.click('#mbFirst');
    ok(!!await until(() => mb.evaluate(() => /^1\//.test(document.getElementById('mbPage').textContent)), 6000), 'кнопка «в начало» возвращает на первую');
    await mb.close();

    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
    [a, pub, w].forEach(s => s.close());
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); S.kill(); process.exit(fail ? 1 : 0);
})();
