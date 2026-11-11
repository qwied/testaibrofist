/* Волна 25 — настройки своей комнаты (идея #760): хост приватной комнаты пряток задаёт время
   пряток и охоты, число искателей, лимит игроков, режим и карту. Свой сервер: 3291. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + String(x).slice(0, 220))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(70); } return null; };
const now = Date.now();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave25-'));
fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
  const r = path.relative(ROOT, x);
  return !(/^(node_modules|data|\.git|builtinMaps)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
} });
fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
fs.mkdirSync(path.join(tmp, 'data'));
const objs = [{ id: 1, type: 'spawn', x: 1420, y: 450, w: 30, h: 100 }, { id: 2, type: 'rect', x: 0, y: 560, w: 3000, h: 80 }];
fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify(['Alpha Yard', 'Beta Yard', 'Gamma Yard'].map(n => ({ mapName: n, mapType: 'hideAndSeek', author: 'w25',
  date: now, created: now, rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: ['hideAndSeek'], mapData: JSON.stringify({ mode: 'hideAndSeek', objects: objs }) }))));
const BASE = 'http://127.0.0.1:3291';
const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: '3291', OWNER_ALIASES: 'w25', HS_VARIANT: '', HS_LOBBY_MS: '3000', HS_ROUND_MS: '5000' } });
let ipN = 0;
function player(name, room) {
  const s = io(BASE, { transports: ['websocket'], forceNew: true, extraHeaders: { 'CF-Connecting-IP': '10.25.' + (++ipN) + '.1' } });
  const p = { s, name, ev: [] };
  ['hsHost', 'hsPhase', 'joinDenied'].forEach(e => s.on(e, d => p.ev.push({ e, d, t: Date.now() })));
  p.join = () => s.emit('join', { playerName: name, gameMode: 'hideAndSeek', room });
  const hb = setInterval(() => s.connected && s.emit('movePlayer', { position: { x: 1420, y: 486, w: 30, h: 74 } }), 1500);
  s.on('disconnect', () => clearInterval(hb));
  p.last = (e, f, after) => { const x = p.ev.filter(v => v.e === e && v.t > (after || 0) && (!f || f(v.d))).pop(); return x && x.d; };
  return p;
}
(async () => {
  await until(() => fetch(BASE + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [], socks = [];
  try {
    console.log('Хост и настройки:');
    const room = 'pab12cd';
    const P = ['ha', 'hb', 'hc'].map(n => player(n, room)); socks.push(...P);
    await Promise.all(P.map(p => new Promise(r => p.s.once('connect', r))));
    for (const p of P) { p.join(); await sleep(150); }
    const h0 = await until(() => P[2].last('hsHost'), 4000);
    ok(h0 && h0.host === P[0].s.id && h0.hostName === 'ha', 'хост — первый вошедший', JSON.stringify(h0));
    P[1].s.emit('hsHostCfg', { hideS: 10 });
    await sleep(600);
    ok(!P[0].last('hsHost', d => d.changed), 'не хост настройки не меняет');
    const t0 = Date.now();
    P[0].s.emit('hsHostCfg', { hideS: 12, roundS: 30, seekers: 2, limit: 3, variant: 'classic', map: { author: 'w25', mapName: 'Beta Yard' } });
    const ch = await until(() => P[1].last('hsHost', d => d.changed), 3000);
    ok(ch && ch.cfg.hideS === 12 && ch.cfg.roundS === 30 && ch.cfg.seekers === 2 && ch.cfg.limit === 3 && ch.cfg.map && ch.cfg.map.mapName === 'Beta Yard',
      'хост меняет настройки — все получают', JSON.stringify(ch && ch.cfg));
    const rd = await until(() => P[0].last('hsPhase', d => d.phase === 'round', t0), 20000);
    ok(rd && rd.msLeft > 25000 && rd.variant === 'classic' && (rd.seekerIds || []).length === 2, 'охота 30 сек, два искателя', rd && JSON.stringify({ ms: rd.msLeft, v: rd.variant, s: rd.seekerIds }));
    const rdAt = Date.now();
    const lob = await until(() => P[0].last('hsPhase', d => d.phase === 'lobby', rdAt), 45000);
    ok(lob && lob.msLeft > 10000 && lob.map && lob.map.mapName === 'Beta Yard', 'следующее лобби: 12 сек на прятки и карта хоста', lob && JSON.stringify({ ms: lob.msLeft, map: lob.map && lob.map.mapName }));
    const extra = player('hd', room); socks.push(extra);
    await new Promise(r => extra.s.once('connect', r)); extra.join();
    const den = await until(() => extra.last('joinDenied'), 3000);
    ok(den && den.reason === 'roomFull', 'лимит 3 места — четвёртого не пускает', JSON.stringify(den));
    P[0].s.emit('hsHostCfg', { hideS: 999, roundS: 'x', seekers: 9, limit: 1, variant: 'bogus', map: { author: 'w25', mapName: 'Nope' } });
    const bad = await until(() => P[1].last('hsHost', d => d.changed && d.cfg.hideS === 30), 3000);
    ok(bad && bad.cfg.roundS === 120 && bad.cfg.seekers === 1 && bad.cfg.limit === 40 && bad.cfg.variant === '' && !bad.cfg.map, 'плохие значения — по умолчанию', JSON.stringify(bad && bad.cfg));
    const tl = Date.now();
    P[0].s.close();
    const nh = await until(() => P[1].last('hsHost', d => d.host !== P[0].s.id, tl), 4000);
    ok(nh && (nh.host === P[1].s.id || nh.host === P[2].s.id), 'хост ушёл — хостом стал другой', JSON.stringify(nh));
    const pub = player('pu', 'room1'); socks.push(pub);
    await new Promise(r => pub.s.once('connect', r)); pub.join(); await sleep(800);
    ok(!pub.last('hsHost'), 'в обычной комнате хоста нет');
    console.log('Панель в игре:');
    const pg = await b.newPage(); pg.on('pageerror', e => errs.push(e.message.slice(0, 200)));
    await pg.goto(BASE + '/game.html?mode=hideAndSeek&room=pzz99xx');
    ok(!!await until(() => pg.evaluate(() => { const e = document.getElementById('gHost'); return e && e.style.display !== 'none'; }), 15000), 'хосту видна кнопка «Комната»');
    await pg.click('#gHost');
    ok(!!await until(() => pg.evaluate(() => document.querySelectorAll('#hcMap option').length === 4), 6000), 'панель настроек со списком карт');
    await pg.fill('#hcHunt', '200'); await pg.selectOption('#hcVar', 'ninja');
    await pg.click('#hcSave');
    ok(!!await until(() => pg.evaluate(() => /200s/.test(document.body.innerText)), 5000), 'сохранено — в чате сообщение с настройками');
    ok(!errs.length, 'без ошибок на странице', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  socks.forEach(p => { try { p.s.close(); } catch (e) {} });
  await b.close(); try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
