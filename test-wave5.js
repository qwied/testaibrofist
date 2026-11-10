/* Пятая волна идей игроков — редактор: формы фигуры (ромб, трапеция, полукруг, звезда…), зеркало,
   прозрачность, обводка, «невидим в игре», вычисления в числовых полях, «к точке старта»,
   рамка обзора, свой цвет фона и предупреждение о несохранённой карте. Свой сервер: 3267. */
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
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(80); } return null; };
function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave5-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port) } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
(async () => {
  const S = server(3267);
  await until(() => fetch(S.base + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const ed = await ctx.newPage(); ed.on('pageerror', e => errs.push('editor: ' + e.message.slice(0, 200)));
    await ed.goto(S.base + '/editor.html');
    await until(() => ed.evaluate(() => window.GAME && Array.isArray(GAME.objects)), 15000);
    console.log('Формы:');
    const sh = await ed.evaluate(() => {
      GAME.objects.push({ id: 9001, type: 'triangle', x: 300, y: 300, w: 100, h: 80, fill: '#475569' });
      const t = GAME.objects[GAME.objects.length - 1];
      GAME.setSel(t);
      const s = [...document.querySelectorAll('#insp select')].find(x => [...x.options].some(o => o.value === 'rhombus'));
      if (!s) return null;
      const n = {};
      ['rhombus', 'trapezoid', 'semicircle', 'pentagon', 'hexagon', 'star5', 'right'].forEach(k => { s.value = k; s.dispatchEvent(new Event('change')); n[k] = t.shape === k ? 1 : 0; });
      return n;
    });
    ok(sh && Object.values(sh).every(Boolean), 'у треугольника есть формы: ромб, трапеция, полукруг, пяти- и шестиугольник, звезда', JSON.stringify(sh));
    const fl = await ed.evaluate(() => {
      const row = [...document.querySelectorAll('#insp .pRow')].find(r => /Mirror|Отразить/.test(r.textContent));
      if (!row) return null;
      row.querySelector('input').click();
      return GAME.objects.find(o => o.id === 9001).flip === true;
    });
    ok(fl, '«Отразить зеркально» включается');

    console.log('Прозрачность, обводка, невидимость:');
    const props = await ed.evaluate(() => {
      const t = GAME.objects.find(o => o.id === 9001), txt = document.getElementById('insp').textContent;
      return { alpha: /Opacity|Прозрачность/.test(txt), stroke: /Outline|Обводка/.test(txt), inv: /Invisible|Невидим/.test(txt) };
    });
    ok(Object.values(props).every(Boolean), 'есть «Прозрачность», «Обводка», «Невидим в игре»', JSON.stringify(props));
    await ed.evaluate(() => { const t = GAME.objects.find(o => o.id === 9001); t.alpha = 0.4; t.strokeW = 6; t.stroke = '#ef4444'; t.inv = true; });
    await sleep(300);

    console.log('Вычисления в полях:');
    const calc = await ed.evaluate(() => {
      const row = [...document.querySelectorAll('#insp .pRow')].find(r => /^(Width|Ширина)/.test(r.textContent));
      const i = row.querySelector('input'), t = GAME.objects.find(o => o.id === 9001), out = [];
      [['100+50', 150], ['(400-10)/2', 195], ['20*3-5', 55], ['abc', 55], ['2+', 55]].forEach(([v, want]) => {
        i.value = v; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change'));
        out.push(t.w === want ? 1 : v + '→' + t.w);
      });
      return out;
    });
    ok(calc.every(x => x === 1), 'в поле можно писать 100+50, (400-10)/2; мусор не меняет размер', JSON.stringify(calc));

    console.log('Кнопки редактора:');
    const sp = await ed.evaluate(() => {
      let s = GAME.objects.find(o => o.type === 'spawn');
      if (!s) { GAME.objects.push({ id: 9100, type: 'spawn', x: 3000, y: 1500, w: 30, h: 100 }); s = GAME.objects[GAME.objects.length - 1]; }
      document.getElementById('bToSpawn').click();
      const v = GAME.view, cx = (innerWidth / 2 - v.x) / v.s, cy = (innerHeight / 2 - v.y) / v.s;
      return { dx: Math.round(cx - (s.x + s.w / 2)), dy: Math.round(cy - (s.y + s.h / 2)) };
    });
    ok(sp && Math.abs(sp.dx) < 400 && Math.abs(sp.dy) < 400, '«К точке старта» показывает старт', JSON.stringify(sp));
    await ed.click('#bViewBox'); await sleep(200);
    ok(await ed.evaluate(() => document.getElementById('bViewBox').classList.contains('on')), 'рамка обзора включается');
    await ed.evaluate(() => { const i = document.getElementById('bBg'); i.value = '#9ca3af'; i.dispatchEvent(new Event('input')); });
    ok(await ed.evaluate(() => localStorage.getItem('bfEdBg') === '#9ca3af'), 'цвет фона редактора запоминается');
    await sleep(200);
    await ed.screenshot({ path: path.join(os.tmpdir(), 'wave5-editor.png') });

    console.log('Несохранённая карта:');
    let asked = false;
    ed.on('dialog', d => { if (d.type() === 'beforeunload') asked = true; d.accept().catch(() => {}); });
    await ed.evaluate(() => { const row = [...document.querySelectorAll('#insp .pRow')].find(r => /^(Width|Ширина)/.test(r.textContent)); row.querySelector('input').dispatchEvent(new Event('focus')); });
    await ed.close({ runBeforeUnload: true }); await sleep(800);
    ok(asked, 'закрыть вкладку с правками — браузер переспрашивает');
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); S.kill(); process.exit(fail ? 1 : 0);
})();
