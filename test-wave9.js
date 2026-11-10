/* Девятая волна идей игроков — общение: подписка на автора (его новые карты — в шапке),
   жалоба на карту (видит владелец), «Принять всех» в заявках, друзья в списке игроков (Tab),
   популярные карты недели на главной. Свой сервер: 3271. Запуск: node test-wave9.js */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + String(x).slice(0, 220))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(80); } return null; };
const objs = [{ type: 'rect', x: 0, y: 600, w: 1400, h: 40 }, { type: 'spawn', x: 60, y: 500, w: 30, h: 100 }, { type: 'finishline', x: 1200, y: 474, w: 52, h: 126 }];
function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave9-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const now = Date.now();
  const h = execFileSync('node', ['-e', "process.stdout.write(require('./accounts.js').hashNew('ownerpass123','s9'))"], { cwd: tmp }).toString();
  fs.rmSync(path.join(tmp, 'data', 'users.json'), { force: true });
  fs.writeFileSync(path.join(tmp, 'data', 'users.json'), JSON.stringify({ users: { boss9: { name: 'Boss9', salt: 's9', hash: h, joined: now, lastSeen: now, coins: 0, about: '', avatar: '0',
    items: [], skin: {}, lang: '', friends: [], incoming: [], outgoing: [] } } }));
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([{ mapName: 'Hot Run', mapType: 'race', author: 'Boss9', date: now - 5000, created: now, rating: 0, votes: {},
    boostLikes: 0, boostDislikes: 0, inGameModes: ['race'], plays: 7, playDays: { [new Date().toISOString().slice(0, 10)]: 7 }, mapData: JSON.stringify({ mode: 'race', gravity: 9, objects: objs }) }]));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), OWNER_ALIASES: 'boss9', PASSWORD_AUTH: '1' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
function client(S) {
  let cookie = '';
  const req = (u, body) => fetch(S.base + u, body ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie }, body: new URLSearchParams(body).toString() }
    : { headers: { cookie } }).then(r => { const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0]; return r.json(); });
  return { req, cookie: () => cookie };
}
(async () => {
  const S = server(3271);
  await until(() => fetch(S.base + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [];
  try {
    const boss = client(S), fan = client(S), f2 = client(S), f3 = client(S);
    await boss.req('/signIn', { username: 'Boss9', password: 'ownerpass123' });
    await fan.req('/signUp', { name: 'Fan9', password: 'secret12345' });
    await f2.req('/signUp', { name: 'Pal9', password: 'secret12345' });
    await f3.req('/signUp', { name: 'Bud9', password: 'secret12345' });
    console.log('Подписка на автора:');
    await fan.req('/maps/seen', {});
    const fo = await fan.req('/follow', { name: 'Boss9', on: '1' });
    ok(fo.status === 'success' && fo.on === true && (await fan.req('/follow/state?name=Boss9')).on, 'подписался на Boss9');
    await sleep(30);
    const up = await boss.req('/uploadMap', { mapName: 'Brand New', mapType: 'race', mapData: JSON.stringify({ mode: 'race', gravity: 9, objects: objs }) });
    const nt = await fan.req('/notifications');
    ok(nt.maps.count >= 1 && nt.maps.authors.indexOf('Boss9') !== -1, 'новая карта автора — в уведомлениях подписчика', JSON.stringify(up).slice(0, 80) + ' ' + JSON.stringify(nt.maps));
    await fan.req('/follow', { name: 'Boss9', on: '0' });
    ok(!(await fan.req('/follow/state?name=Boss9')).on, 'отписка работает');
    console.log('Жалоба на карту:');
    ok((await fan.req('/reportMap', { author: 'Boss9', mapName: 'Hot Run', why: 'too hard lol' })).status === 'success', 'игрок пожаловался');
    const reps = await boss.req('/owner/mapReports');
    ok(reps.length === 1 && reps[0].reports[0].why === 'too hard lol', 'владелец видит жалобу', JSON.stringify(reps));
    ok((await fan.req('/owner/mapReports')).length === 0, 'другим жалобы не видны');
    console.log('Принять всех:');
    await f2.req('/friendRequest', { name: 'Fan9' }); await f3.req('/friendRequest', { name: 'Fan9' });
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies([{ name: fan.cookie().split('=')[0], value: fan.cookie().split('=').slice(1).join('='), url: S.base }]);
    const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push('users: ' + e.message.slice(0, 200)));
    await pg.goto(S.base + '/users?name=Fan9');
    await pg.waitForSelector('[data-tab="requests"]', { timeout: 8000 });
    await pg.click('[data-tab="requests"]');
    await pg.waitForSelector('#upAcceptAll', { timeout: 6000 });
    await pg.click('#upAcceptAll');
    const fr = await until(async () => { const d = await fan.req('/getFriendsList?name=Fan9&type=friends&page=1'); return d.count === 2 ? d : null; }, 5000);
    ok(!!fr, '«Принять всех» — оба стали друзьями');
    console.log('Главная и игра:');
    const ix = await ctx.newPage(); ix.on('pageerror', e => errs.push('index: ' + e.message.slice(0, 200)));
    await ix.goto(S.base + '/');
    const wt = await until(() => ix.evaluate(() => { const e = document.getElementById('weekTop'); return e && e.style.display !== 'none' ? e.textContent : null; }), 8000);
    ok(wt && /Hot Run/.test(wt), 'на главной — популярные карты недели', wt);
    await ix.screenshot({ path: path.join(os.tmpdir(), 'wave9-index.png') });
    const ctx2 = await b.newContext(); await ctx2.addCookies([{ name: f2.cookie().split('=')[0], value: f2.cookie().split('=').slice(1).join('='), url: S.base }]);
    const g1 = await ctx.newPage(); g1.on('pageerror', e => errs.push('g1: ' + e.message.slice(0, 200)));
    const g2 = await ctx2.newPage();
    await g1.goto(S.base + '/game.html?mode=race&room=f9'); await g2.goto(S.base + '/game.html?mode=race&room=f9');
    await until(() => g1.evaluate(() => document.getElementById('gCount').textContent === '2'), 12000);
    await g1.click('#gCount');
    const row = await until(() => g1.evaluate(() => { const t = document.getElementById('gPlayers').textContent; return /friend|друг/.test(t) ? t : null; }), 6000);
    ok(!!row && /Pal9/.test(row), 'в списке игроков друг отмечен', row);
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); S.kill(); process.exit(fail ? 1 : 0);
})();
