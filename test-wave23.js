/* Волна 23 — карты: категории, «вперемешку», продвижение за монеты, монета автору за лайк,
   подборка недели из 5 гоночных карт с наградой. Свой сервер: 3287. Запуск: node test-wave23.js */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + String(x).slice(0, 220))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(60); } return null; };
const PORT = 3287, BASE = 'http://127.0.0.1:' + PORT;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave23-'));
fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
  const r = path.relative(ROOT, x);
  return !(/^(node_modules|data|\.git|builtinMaps)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
} });
fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
fs.mkdirSync(path.join(tmp, 'data'));
const now = Date.now();
const objs = [{ type: 'rect', x: 0, y: 600, w: 3000, h: 40 }, { type: 'spawn', x: 60, y: 500, w: 30, h: 100 }, { type: 'finishline', x: 1500, y: 474, w: 52, h: 126 }];
const names = ['Ash Run', 'Birch Run', 'Cedar Run', 'Dune Run', 'Elm Run', 'Fir Run', 'Gale Run'];
fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify(names.map((n, i) => ({ mapName: n, mapType: 'race', author: 'Maker23',
  date: now - i * 1000, created: now, rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: ['race'],
  mapData: JSON.stringify({ mode: 'race', gravity: 9, objects: objs }) }))));
let proc = null;
const start = async () => {
  proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(PORT), PASSWORD_AUTH: '1' } });
  await until(() => fetch(BASE + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
};
const stop = async () => { proc.kill(); await new Promise(r => proc.once('exit', r)); };
function client() {
  let cookie = '';
  const req = (u, body) => fetch(BASE + u, body ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie }, body: new URLSearchParams(body).toString() }
    : { headers: { cookie } }).then(r => { const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0]; return r.json(); });
  return { req, cookie: () => cookie };
}
const coins = async c => (await c.req('/cosm/shop')).coins;
(async () => {
  await start();
  const b = await chromium.launch();
  const errs = [];
  try {
    const mk = client(), vt = client();
    await mk.req('/signUp', { name: 'Maker23', password: 'secret12345' });
    await vt.req('/signUp', { name: 'Voter23', password: 'secret12345' });
    console.log('Монета автору за лайк:');
    const c0 = await coins(mk);
    await vt.req('/uploadVote', { author: 'Maker23', mapName: 'Ash Run', vote: 1 });
    ok(await coins(mk) === c0 + 1, 'лайк карте — автору +1 монета', (await coins(mk)) + ' vs ' + c0);
    await vt.req('/uploadVote', { author: 'Maker23', mapName: 'Ash Run', vote: 1 });
    await vt.req('/uploadVote', { author: 'Maker23', mapName: 'Ash Run', vote: 1 });
    ok(await coins(mk) === c0 + 1, 'снять и снова поставить лайк — монета не копится');
    await vt.req('/uploadVote', { author: 'Maker23', mapName: 'Birch Run', vote: -1 });
    ok(await coins(mk) === c0 + 1, 'за дизлайк монет нет');
    console.log('Категории и «вперемешку»:');
    ok((await vt.req('/setMapCategory', { author: 'Maker23', mapName: 'Ash Run', category: 'troll' })).status === 'error', 'чужой карте категорию не поставить');
    ok((await mk.req('/setMapCategory', { author: 'Maker23', mapName: 'Ash Run', category: 'bogus' })).status === 'error', 'неизвестная категория — отказ');
    ok((await mk.req('/setMapCategory', { author: 'Maker23', mapName: 'Ash Run', category: 'speedrun' })).category === 'speedrun', 'автор ставит категорию');
    const cat = await vt.req('/getMapsForList?category=speedrun');
    ok(cat.count === 1 && cat.maps[0].mapName === 'Ash Run' && cat.maps[0].category === 'speedrun', 'фильтр по категории', JSON.stringify(cat.maps.map(m => m.mapName)));
    const order = async seed => (await vt.req('/getMapsForList?sortBy=random&seed=' + seed)).maps.map(m => m.mapName).join(',');
    const o1 = await order('aa'), o2 = await order('aa'), o3 = await order('zz'), o4 = await order('qq');
    ok(o1 === o2 && (o1 !== o3 || o1 !== o4), 'перемешивание: одинаковое при одном seed, разное при разных', o1 + ' | ' + o3);
    console.log('Продвижение карты:');
    ok((await mk.req('/promoteMap', { author: 'Maker23', mapName: 'Gale Run' })).status === 'error', 'без 50 монет продвинуть нельзя');
    await sleep(800); await stop();
    const uf = path.join(tmp, 'data', 'users.json'), db = JSON.parse(fs.readFileSync(uf, 'utf8'));
    const mku = Object.values(db.users).find(u => u.name === 'Maker23'), vtu = Object.values(db.users).find(u => u.name === 'Voter23');
    mku.coins = 100;
    vtu.rcBest = {}; ['Ash Run', 'Birch Run', 'Cedar Run', 'Dune Run', 'Elm Run', 'Fir Run', 'Gale Run'].forEach(n => { vtu.rcBest['Maker23|' + n] = 5000; });
    fs.writeFileSync(uf, JSON.stringify(db));
    await start();
    ok((await vt.req('/promoteMap', { author: 'Maker23', mapName: 'Gale Run' })).status === 'error', 'чужую карту продвинуть нельзя');
    const pr = await mk.req('/promoteMap', { author: 'Maker23', mapName: 'Gale Run' });
    ok(pr.status === 'success' && pr.coins === 50, 'автор продвигает карту за 50 монет', JSON.stringify(pr));
    const top = await vt.req('/getMapsForList?sortBy=date');
    ok(top.maps[0].mapName === 'Gale Run' && top.maps[0].promoted, 'продвинутая карта — первая в «новых»', top.maps[0].mapName);
    console.log('Подборка недели:');
    const pk = await vt.req('/mapPack');
    ok(pk.maps.length === 5 && pk.maps.every(x => x.done) && !pk.claimed, 'в подборке 5 карт, все пройдены', JSON.stringify(pk.maps.map(x => x.mapName)));
    const pk2 = await mk.req('/mapPack');
    ok(pk2.week === pk.week && pk2.maps.map(x => x.mapName).join() === pk.maps.map(x => x.mapName).join(), 'подборка одна на всех');
    ok((await mk.req('/mapPack/claim', {})).status === 'error', 'не прошёл все — награды нет');
    const vc = await coins(vt);
    const cl = await vt.req('/mapPack/claim', {});
    ok(cl.status === 'success' && cl.coins === vc + 50, 'прошёл все — +50 монет', JSON.stringify(cl));
    ok((await vt.req('/mapPack/claim', {})).status === 'error', 'второй раз за неделю — нельзя');
    console.log('Maps Browser:');
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies([{ name: mk.cookie().split('=')[0], value: mk.cookie().split('=').slice(1).join('='), url: BASE }]);
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
    await p.goto(BASE + '/mapsBrowser');
    ok(!!await until(() => p.evaluate(() => document.querySelectorAll('#mbPack .mbPackMap').length === 5), 8000), 'плашка подборки с 5 картами');
    ok(!!await until(() => p.evaluate(() => !!document.querySelector('.mbRow .mbPromo') && !!document.querySelector('.mbRow [data-cat]') && !!document.querySelector('.mbRow .mbCatTag')), 8000), 'в списке значки «продвигается» и категория, у своих карт — выбор категории');
    await p.selectOption('#mbCat', 'speedrun');
    ok(!!await until(() => p.evaluate(() => document.querySelectorAll('.mbRow').length === 1), 6000), 'фильтр категории в браузере карт');
    await p.selectOption('#mbCat', '');
    await until(() => p.evaluate(() => document.querySelectorAll('.mbRow').length === 7), 6000);
    await p.selectOption('.mbRow[data-map="Birch Run"] [data-cat]', 'puzzle');
    ok(!!await until(async () => (await mk.req('/getMapsForList?category=puzzle')).count === 1, 6000), 'категорию можно сменить прямо из списка');
    ok(!errs.length, 'без ошибок на странице', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
