/* Одиннадцатая волна идей игроков — прятки: пожелание роли (вес в рулетке), «Сдаться» и
   свободная камера пойманного. Свой сервер: 3273. Запуск: node test-wave11.js */
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
const objs = [{ type: 'rect', x: 0, y: 600, w: 3000, h: 40 }, { type: 'spawn', x: 60, y: 500, w: 30, h: 100 }, { type: 'rect', x: 600, y: 400, w: 200, h: 200, hideSpot: true }];
function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave11-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const now = Date.now();
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([{ mapName: 'Hide Yard', mapType: 'hideAndSeek', author: 'w11', date: now, created: now, rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0,
    inGameModes: ['hideAndSeek'], only: true, mapData: JSON.stringify({ mode: 'hideAndSeek', gravity: 9, objects: objs }) }]));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), OWNER_ALIASES: 'w11', HS_LOBBY_MS: '4000', HS_ROUND_MS: '9000' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
(async () => {
  const S = server(3273);
  await until(() => fetch(S.base + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [];
  try {
    console.log('Пожелание роли:');
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('bfHsPref', 'hide'); } catch (e) {} });
    const g = await ctx.newPage(); g.on('pageerror', e => errs.push('game: ' + e.message.slice(0, 200)));
    await g.goto(S.base + '/game.html?mode=hideAndSeek&room=y11');
    await until(() => g.evaluate(() => window.GAME && GAME.playing), 15000);
    const bot = io(S.base, { transports: ['websocket'], forceNew: true });
    let seekerId = null; const outs = [], seekers = [];
    bot.on('hsPhase', d => { if (d.phase === 'round') { seekerId = d.seekerId; seekers.push(d.seekerId); } });
    bot.on('hsOut', d => outs.push(d.id));
    await new Promise(r => bot.on('connect', r));
    bot.emit('join', { playerName: 'Bot11', gameMode: 'hideAndSeek', room: 'y11' });
    bot.emit('hsPref', { pref: 'seek' });
    bot.emit('movePlayer', { position: { x: 100, y: 500, w: 30, h: 100 } });
    // второй прячущийся — чтобы раунд не кончился, когда игрок сдастся
    const hid = io(S.base, { transports: ['websocket'], forceNew: true });
    await new Promise(r => hid.on('connect', r));
    hid.emit('join', { playerName: 'Hid11', gameMode: 'hideAndSeek', room: 'y11' });
    hid.emit('hsPref', { pref: 'hide' });
    // первый раунд мог начаться до прихода ботов — смотрим следующие два
    await until(() => seekers.length >= 3, 45000);
    ok(seekers.slice(1).filter(id => id === bot.id).length >= 1 && seekers.length >= 3, 'кто хочет искать — тот искатель (вес жребия ×3, «хочу прятаться» ×0,2)', seekers.map(id => id === bot.id ? 'бот' : 'другой').join(','));
    await until(() => g.evaluate(() => document.getElementById('gRoleBox') && /Hider|Прячущ/i.test(document.getElementById('gRoleBox').textContent)), 20000);
    ok(await g.evaluate(() => document.getElementById('gHs').style.display !== 'none'), 'в прятках есть кнопка меню пряток');
    console.log('Сдаться:');
    await g.click('#gHs');
    const btns = await g.evaluate(() => document.getElementById('gHsBox').textContent);
    ok(/Give up|Сдаться/.test(btns), 'в меню прячущегося есть «Сдаться»', btns);
    await g.click('#gHsBox [data-hs="giveup"]');
    const myId = await until(() => outs[0], 4000);
    ok(!!myId, 'сдался — сервер вывел игрока из раунда, как пойманного');
    console.log('Свободная камера:');
    await g.click('#gHs');
    const camBtn = await until(() => g.evaluate(() => !!document.querySelector('#gHsBox [data-hs="cam"]')), 3000);
    ok(camBtn, 'у сдавшегося в меню — «Свободная камера»');
    await g.click('#gHsBox [data-hs="cam"]');
    const x0 = await g.evaluate(() => ({ c: GAME.freeCam && GAME.freeCam.x, p: GAME.pl.x }));
    await g.keyboard.down('ArrowRight'); await sleep(600); await g.keyboard.up('ArrowRight');
    const x1 = await g.evaluate(() => ({ c: GAME.freeCam && GAME.freeCam.x, p: GAME.pl.x }));
    ok(x1.c > x0.c + 100 && Math.abs(x1.p - x0.p) < 2, 'стрелки двигают камеру, а не игрока', JSON.stringify([x0, x1]));
    hid.close();
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
    bot.close();
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); S.kill(); process.exit(fail ? 1 : 0);
})();
