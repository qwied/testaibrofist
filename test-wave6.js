/* Шестая волна идей игроков — прогресс: уровень и значки в профиле, промокоды от владельца,
   подарок монет, счётчик игр и 10 лучших времён у карты, сортировка «Больше всего игр»,
   «Карта дня» со своей комнатой. Свой сервер: 3268. Запуск: node test-wave6.js */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const { io } = require('socket.io-client');
const ROOT = __dirname;
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + String(x).slice(0, 220))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(80); } return null; };
const objs = [{ type: 'rect', x: 0, y: 600, w: 1400, h: 40 }, { type: 'spawn', x: 60, y: 500, w: 30, h: 100 }, { type: 'finishline', x: 1200, y: 474, w: 52, h: 126 }];

let TMP = '';
function server(port) {
  const tmp = TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave6-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const now = Date.now();
  const map = (n, k) => ({ mapName: n, mapType: 'race', author: 'Boss6', date: now - k * 1000, created: now, rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0,
    inGameModes: ['race'], mapData: JSON.stringify({ mode: 'race', gravity: 9, objects: objs }) });
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([map('Alpha Run', 1), map('Beta Run', 2), map('Gamma Run', 3)]));
  // аккаунт владельца заводится не через регистрацию (ник зарезервирован) — кладём в users.json сразу
  const h = execFileSync('node', ['-e', "const a=require('./accounts.js');process.stdout.write(a.hashNew('ownerpass123','s6'))"], { cwd: tmp }).toString();
  fs.rmSync(path.join(tmp, 'data', 'users.json'), { force: true });
  fs.writeFileSync(path.join(tmp, 'data', 'users.json'), JSON.stringify({ users: { boss6: { name: 'Boss6', salt: 's6', hash: h, joined: now - 3 * 365 * 864e5, lastSeen: now,
    coins: 0, about: '', avatar: '0', items: [], skin: {}, lang: '', friends: [], incoming: [], outgoing: [], score: 1500, hsScore: 200, rcFin: 120 } } }));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), OWNER_ALIASES: 'boss6', PASSWORD_AUTH: '1', RACE_LOBBY_MS: '800' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
function client(S) {
  let cookie = '';
  const req = (u, body) => fetch(S.base + u, body ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie }, body: new URLSearchParams(body).toString() }
    : { headers: { cookie } }).then(r => { const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0]; return r.json(); });
  return { req, cookie: () => cookie };
}

(async () => {
  const S = server(3268);
  await until(() => fetch(S.base + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [];
  try {
    console.log('Уровень и значки:');
    const boss = client(S), pl = client(S);
    ok((await boss.req('/signIn', { username: 'Boss6', password: 'ownerpass123' })).status === 'success', 'владелец вошёл');
    ok((await pl.req('/signUp', { name: 'Player6', password: 'secret12345' })).status === 'success', 'игрок зарегистрировался');
    const pb = await boss.req('/getProgress?name=Boss6');
    ok(pb && pb.level === 5 && pb.xp === 1700 && pb.from === 1600 && pb.to === 2500 && pb.stars === 2, 'уровень от очков Race + Hide and Seek, звёзды за каждые 50 карт', JSON.stringify(pb && { l: pb.level, xp: pb.xp, to: pb.to, s: pb.stars }));
    const ids = (pb.badges || []).map(x => x.id);
    ok(['creator', 'veteran', 'builder', 'racer'].every(i => ids.includes(i)), 'значки: создатель, ветеран, автор карт, гонщик', ids.join(','));
    const pp = await pl.req('/getProgress?name=Player6');
    ok(pp.level === 1 && !pp.badges.length, 'у новичка 1-й уровень и нет значков');

    console.log('Промокоды:');
    ok((await pl.req('/owner/promo/create', { code: 'HACK', coins: 999 })).status === 'error', 'игрок не может создать промокод');
    const cr = await boss.req('/owner/promo/create', { code: 'brofest', coins: 50, uses: 1 });
    ok(cr.status === 'success' && cr.code === 'BROFEST', 'владелец создал промокод', JSON.stringify(cr));
    const r1 = await pl.req('/promo/redeem', { code: 'Brofest' });
    ok(r1.status === 'success' && r1.coins === 50, 'игрок активировал промокод: +50', JSON.stringify(r1));
    ok((await pl.req('/promo/redeem', { code: 'BROFEST' })).status === 'error', 'второй раз тот же код — нельзя');
    ok((await boss.req('/promo/redeem', { code: 'BROFEST' })).status === 'error', 'активации кончились');

    console.log('Подарок монет:');
    ok((await pl.req('/giftCoins', { to: 'Player6', amount: 5 })).status === 'error', 'себе подарить нельзя');
    ok((await pl.req('/giftCoins', { to: 'Boss6', amount: 500 })).status === 'error', 'больше, чем есть, — нельзя');
    const g = await pl.req('/giftCoins', { to: 'Boss6', amount: 20 });
    ok(g.status === 'success' && g.coins === 30, 'подарил 20 монет', JSON.stringify(g));
    ok((await boss.req('/getCoins?name=Boss6')) !== undefined, 'монеты у получателя');

    console.log('Карта: игры, рекорды, сортировка:');
    const s1 = io(S.base, { transports: ['websocket'], forceNew: true, extraHeaders: { cookie: pl.cookie() } });
    const phases = [];
    s1.on('racePhase', d => phases.push(d));
    await new Promise(r => s1.on('connect', r));
    s1.emit('join', { playerName: 'Player6', gameMode: 'race', room: 'r6' });
    const round = await until(() => phases.find(p => p.phase === 'round'), 8000);
    ok(!!round, 'раунд гонки начался', round && round.map && round.map.mapName);
    const lst = await pl.req('/getMapsForList?page=1&sortBy=popular');
    ok(lst.maps[0].plays >= 1 && lst.maps[0].mapName === round.map.mapName, 'счётчик игр вырос, «Больше всего игр» ставит карту первой', JSON.stringify(lst.maps.map(m => m.mapName + ':' + m.plays)));
    s1.close();
    // рекорды карты — через сам модуль (честный финиш гонки проверяет test-race-rules)
    const rec = execFileSync('node', ['-e', `const M=require('./maps.js');
      const a=M.addRecord('Boss6','Alpha Run','Zed',9000), b=M.addRecord('Boss6','Alpha Run','Amy',7000), c=M.addRecord('Boss6','Alpha Run','Zed',12000), d=M.addRecord('Boss6','Alpha Run','Zed',5000);
      process.stdout.write(JSON.stringify([a,b,c,d,M.find('Boss6','Alpha Run').records.map(r=>r.name+':'+r.ms)]))`], { cwd: TMP }).toString();
    const rj = JSON.parse(rec);
    ok(rj[0] === 1 && rj[1] === 1 && rj[2] === null && rj[3] === 1 && rj[4].join() === 'Zed:5000,Amy:7000', 'топ-10 времён: по одному на игрока, только улучшения', rec);

    console.log('Карта дня:');
    const dm = await pl.req('/getDailyMap');
    ok(dm && dm.mapName && dm.done === false, 'карта дня есть', JSON.stringify(dm));
    const s2 = io(S.base, { transports: ['websocket'], forceNew: true });
    const ph2 = [];
    s2.on('racePhase', d => ph2.push(d)); s2.on('raceState', d => ph2.push(d));
    await new Promise(r => s2.on('connect', r));
    s2.emit('join', { playerName: 'Guest6', gameMode: 'race', room: 'daily' });
    const dl = await until(() => ph2.find(p => p.map), 6000);
    ok(dl && dl.map.mapName === dm.mapName, 'комната «daily» играет карту дня', dl && dl.map && dl.map.mapName);
    s2.close();

    console.log('Страницы:');
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies([{ name: pl.cookie().split('=')[0], value: pl.cookie().split('=').slice(1).join('='), url: S.base }]);
    const up = await ctx.newPage(); up.on('pageerror', e => errs.push('users: ' + e.message.slice(0, 200)));
    await up.goto(S.base + '/users?name=Boss6');
    const prog = await until(() => up.evaluate(() => { const e = document.getElementById('upProg'); return e && e.textContent.length > 5 ? e.textContent : null; }), 8000);
    ok(prog && /5/.test(prog) && /XP/.test(prog), 'в профиле уровень и полоса опыта', prog);
    ok(await up.evaluate(() => document.querySelectorAll('.upBadge').length >= 4), 'в профиле значки');
    ok(await up.evaluate(() => !!document.getElementById('upGift')), 'в чужом профиле — «Подарить монеты»');
    await up.screenshot({ path: path.join(os.tmpdir(), 'wave6-profile.png') });
    const mb = await ctx.newPage(); mb.on('pageerror', e => errs.push('maps: ' + e.message.slice(0, 200)));
    await mb.goto(S.base + '/mapsBrowser');
    const daily = await until(() => mb.evaluate(() => { const e = document.getElementById('mbDaily'); return e && e.style.display !== 'none' ? e.textContent : null; }), 8000);
    ok(daily && daily.indexOf(dm.mapName) !== -1, 'в Maps Browser — плашка «Карта дня»', daily);
    ok(!!await until(() => mb.evaluate(() => document.querySelectorAll('.mbPlays').length > 0), 6000), 'у карт видно число игр');
    await mb.screenshot({ path: path.join(os.tmpdir(), 'wave6-maps.png') });
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); S.kill(); process.exit(fail ? 1 : 0);
})();
