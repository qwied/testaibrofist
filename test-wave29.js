/* Волна 29 — совместный редактор карт: сеанс по коду, новичок получает карту целиком, правки
   (новый объект, сдвиг, удаление) доходят до остальных, больше 6 человек — нельзя. Сервер: 3295. */
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
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(80); } return null; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave29-'));
fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
  const r = path.relative(ROOT, x);
  return !(/^(node_modules|data|\.git|builtinMaps)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
} });
fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
fs.mkdirSync(path.join(tmp, 'data'));
const BASE = 'http://127.0.0.1:3295';
const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: '3295' } });
(async () => {
  await until(() => fetch(BASE + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [], socks = [];
  try {
    const ca = await b.newContext({ viewport: { width: 1400, height: 900 } }), cb = await b.newContext({ viewport: { width: 1400, height: 900 } });
    const A = await ca.newPage(), B = await cb.newPage();
    A.on('pageerror', e => errs.push('A: ' + e.message.slice(0, 200))); B.on('pageerror', e => errs.push('B: ' + e.message.slice(0, 200)));
    await A.goto(BASE + '/editor.html');
    await until(() => A.evaluate(() => window.GAME && Array.isArray(GAME.objects)), 15000);
    await A.evaluate(() => { GAME.objects.push({ id: 501, type: 'rect', x: 100, y: 100, w: 200, h: 40 }); });
    await A.click('#bCoop');
    const coopA = await until(() => A.evaluate(() => GAME.coop), 8000);
    ok(coopA && /^[a-z0-9]{6}$/.test(coopA.code), 'кнопка включает сеанс с кодом', JSON.stringify(coopA));
    await B.goto(BASE + '/editor.html?coop=' + coopA.code);
    await until(() => B.evaluate(() => window.GAME && Array.isArray(GAME.objects)), 15000);
    ok(!!await until(() => B.evaluate(() => GAME.objects.some(o => o.id === 501 && o.x === 100)), 8000), 'вошедший по ссылке получил карту целиком');
    ok(!!await until(() => A.evaluate(() => GAME.coop && GAME.coop.members === 2), 5000), 'в сеансе двое');
    await A.evaluate(() => { GAME.objects.push({ id: 777001, type: 'rect', x: 500, y: 300, w: 80, h: 80, fill: '#22c55e' }); });
    ok(!!await until(() => B.evaluate(() => GAME.objects.some(o => o.id === 777001)), 5000), 'новый объект появился у второго');
    await B.evaluate(() => { const o = GAME.objects.find(o => o.id === 501); o.x = 260; });
    ok(!!await until(() => A.evaluate(() => GAME.objects.find(o => o.id === 501).x === 260), 5000), 'сдвиг у второго — виден первому');
    await A.evaluate(() => { const i = GAME.objects.findIndex(o => o.id === 777001); GAME.objects.splice(i, 1); });
    ok(!!await until(() => B.evaluate(() => !GAME.objects.some(o => o.id === 777001)), 5000), 'удаление тоже доходит');
    console.log('Лимит:');
    const code = 'zz' + Math.floor(Math.random() * 9000 + 1000);
    let denied = 0;
    for (let i = 0; i < 7; i++) {
      const s = io(BASE, { transports: ['websocket'], forceNew: true }); socks.push(s);
      s.on('coopDenied', () => { denied++; });
      await new Promise(r => s.on('connect', r)); s.emit('coopJoin', { code }); await sleep(80);
    }
    await sleep(500);
    ok(denied === 1, 'седьмого в сеанс не пускает', denied);
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  socks.forEach(s => { try { s.close(); } catch (e) {} });
  await b.close(); try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
