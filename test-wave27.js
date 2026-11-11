/* Волна 27 — мелочи: «Случайный образ» аксессуаров, горячие клавиши и слои редактора,
   новогодний снег на сайте, свой вид кнопок на телефоне. Свой сервер: 3293. */
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave27-'));
fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
  const r = path.relative(ROOT, x);
  return !(/^(node_modules|data|\.git|builtinMaps)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
} });
fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
fs.mkdirSync(path.join(tmp, 'data'));
const BASE = 'http://127.0.0.1:3293';
let proc;
const start = async () => { proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: '3293', PASSWORD_AUTH: '1' } });
  await until(() => fetch(BASE + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000); };
const stop = async () => { proc.kill(); await new Promise(r => proc.once('exit', r)); };
(async () => {
  await start();
  const b = await chromium.launch();
  const errs = [];
  try {
    console.log('Случайный образ:');
    let cookie = '';
    const req = (u, body) => fetch(BASE + u, body ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie }, body: new URLSearchParams(body).toString() }
      : { headers: { cookie } }).then(r => { const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0]; return r.json(); });
    await req('/signUp', { name: 'Rand27', password: 'secret12345' });
    ok((await req('/cosm/random', {})).status === 'error', 'без купленных вещей — нельзя');
    await sleep(700); await stop();
    const uf = path.join(tmp, 'data', 'users.json'), db = JSON.parse(fs.readFileSync(uf, 'utf8'));
    const u = Object.values(db.users).find(x => x.name === 'Rand27');
    u.cosmOwned = ['hat_crown', 'hat_party', 'cape_red', 'trail_spark', 'nick_gold'];
    fs.writeFileSync(uf, JSON.stringify(db)); await start();
    const shop = await req('/cosm/shop');
    const owned = shop.owned.filter(id => shop.items.some(i => i.id === id));
    ok(owned.length >= 3, 'есть купленные вещи', owned.join(','));
    const seen = new Set();
    for (let i = 0; i < 12; i++) {
      const r = await req('/cosm/random', {});
      if (r.status !== 'success') { seen.add('ERR:' + r.message); break; }
      Object.keys(r.equipped).forEach(sl => { if (r.equipped[sl]) seen.add(r.equipped[sl]); });
    }
    ok([...seen].length >= 2 && [...seen].every(id => owned.indexOf(id) !== -1), 'надевает случайные вещи только из купленных', [...seen].join(','));
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies([{ name: cookie.split('=')[0], value: cookie.split('=').slice(1).join('='), url: BASE }]);
    const av = await ctx.newPage(); av.on('pageerror', e => errs.push('avatar: ' + e.message.slice(0, 200)));
    await av.goto(BASE + '/avatar');
    ok(!!await until(() => av.evaluate(() => !!document.querySelector('[data-rand]')), 8000), 'на странице образа — кнопка «Случайный образ»');
    console.log('Редактор:');
    const ed = await ctx.newPage(); ed.on('pageerror', e => errs.push('editor: ' + e.message.slice(0, 200)));
    await ed.goto(BASE + '/editor.html');
    await until(() => ed.evaluate(() => window.GAME && Array.isArray(GAME.objects)), 15000);
    await ed.evaluate(() => {
      GAME.objects.push({ id: 9001, type: 'rect', x: 400, y: 300, w: 200, h: 60 });
      GAME.objects.push({ id: 9002, type: 'rect', x: 400, y: 300, w: 200, h: 60, ghost: true });
    });
    await ed.click('.tool[data-tool="brush"]').catch(() => {});
    await ed.keyboard.press('KeyV');
    ok(await ed.evaluate(() => document.querySelector('.tool.on').dataset.tool === 'select'), 'V — инструмент выбора');
    await ed.keyboard.press('KeyP');
    ok(await ed.evaluate(() => document.querySelector('.tool.on').dataset.tool === 'poly'), 'P — многоугольник');
    await ed.keyboard.press('KeyV');
    await ed.evaluate(() => GAME.setSel(GAME.objects.find(o => o.id === 9001)));
    await ed.keyboard.press('ArrowRight'); await ed.keyboard.press('Shift+ArrowDown');
    ok(await ed.evaluate(() => { const o = GAME.objects.find(o => o.id === 9001); return o.x === 401 && o.y === 310; }), 'стрелки двигают выделенное (Shift — на 10)');
    await ed.keyboard.press('BracketRight');
    ok(await ed.evaluate(() => GAME.objects[GAME.objects.length - 1].id === 9001), '] — на передний план');
    await ed.keyboard.press('KeyL');
    ok(await ed.evaluate(() => GAME.layerView === 1 && GAME.at(450, 320) && GAME.at(450, 320).id === 9001), 'L — слой игровых объектов: декорация не выделяется');
    await ed.keyboard.press('KeyL');
    ok(await ed.evaluate(() => GAME.layerView === 2 && GAME.at(450, 320) && GAME.at(450, 320).id === 9002), 'ещё L — слой декораций');
    await ed.keyboard.press('KeyL');
    ok(await ed.evaluate(() => GAME.layerView === 0), 'и снова все слои');
    console.log('Снег и кнопки телефона:');
    const ix = await ctx.newPage(); ix.on('pageerror', e => errs.push('index: ' + e.message.slice(0, 200)));
    await ix.goto(BASE + '/?snow=1');
    ok(!!await until(() => ix.evaluate(() => { const c = document.getElementById('bfSnow'); return c && c.style.display !== 'none'; }), 6000), 'новогодний снег на сайте');
    await ix.click('#bfSnowBtn');
    ok(await ix.evaluate(() => document.getElementById('bfSnow').style.display === 'none' && localStorage.getItem('bfNoSnow') === '1'), 'снежинка в углу выключает снег и запоминает');
    const ix2 = await ctx.newPage(); await ix2.goto(BASE + '/');
    await sleep(800);
    ok(await ix2.evaluate(() => { const d = new Date(), m = d.getMonth() + 1, day = d.getDate(); const season = (m === 12 && day >= 15) || (m === 1 && day <= 10); return season || !document.getElementById('bfSnow'); }), 'не в сезон снега нет');
    const gp = await ctx.newPage(); gp.on('pageerror', e => errs.push('game: ' + e.message.slice(0, 200)));
    await gp.addInitScript(() => { localStorage.setItem('bfPadSwap', '1'); localStorage.setItem('bfPadSize', 'l'); });
    await gp.goto(BASE + '/game.html?mode=race');
    ok(!!await until(() => gp.evaluate(() => { const p = document.getElementById('pad'); return p && p.classList.contains('swap') && p.classList.contains('sz-l'); }), 8000), 'свой вид кнопок телефона применяется в игре');
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
