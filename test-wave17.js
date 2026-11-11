/* Семнадцатая волна идей игроков: свой многоугольник в редакторе — клики ставят вершины, Enter или
   клик по первой точке замыкает; фигура сохраняется в карте, в игре на ней можно стоять.
   Свой сервер: 3281. Запуск: node test-wave17.js */
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
function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave17-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git|builtinMaps)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port) } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
(async () => {
  const S = server(3281);
  await until(() => fetch(S.base + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const ed = await ctx.newPage(); ed.on('pageerror', e => errs.push('editor: ' + e.message.slice(0, 200)));
    await ed.goto(S.base + '/editor.html');
    await until(() => ed.evaluate(() => window.GAME && Array.isArray(GAME.objects)), 15000);
    ok(await ed.evaluate(() => !!document.querySelector('.tool[data-tool="poly"]')), 'в палитре есть «Многоугольник»');
    await ed.click('.tool[data-tool="poly"]');
    const n0 = await ed.evaluate(() => GAME.objects.length);
    // пятиугольник кликами по холсту, замыкаем кликом по первой точке
    const pts = [[500, 500], [700, 480], [760, 600], [640, 680], [480, 640]];
    for (const p of pts) { await ed.mouse.click(p[0], p[1]); await sleep(60); }
    await ed.screenshot({ path: path.join(os.tmpdir(), 'wave17-draw.png') });
    await ed.mouse.click(502, 501);
    const o = await until(() => ed.evaluate(n0 => GAME.objects.length > n0 ? GAME.objects[GAME.objects.length - 1] : null, n0), 3000);
    ok(o && o.type === 'triangle' && o.shape === 'custom' && o.pts.length === 5, 'получилась фигура из 5 вершин', o && JSON.stringify({ t: o.type, s: o.shape, n: o.pts && o.pts.length }));
    ok(o && o.pts.every(p => p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1), 'вершины — в долях рамки');
    ok(await ed.evaluate(() => /custom/.test(window.getEditorMap().data)), 'фигура сохраняется в карте');
    console.log('Enter и в игре:');
    await ed.click('.tool[data-tool="poly"]');
    // плоская «гора»-трапеция: на ней будем стоять
    for (const p of [[300, 300], [900, 300], [1000, 380], [200, 380]]) { await ed.mouse.click(p[0], p[1]); await sleep(50); }
    await ed.keyboard.press('Enter');
    const hill = await ed.evaluate(() => GAME.objects[GAME.objects.length - 1]);
    ok(hill.shape === 'custom' && hill.pts.length === 4, 'Enter замыкает фигуру');
    const stand = await ed.evaluate(h => {
      GAME.objects.push({ id: 99901, type: 'spawn', x: h.x + h.w / 2 - 15, y: h.y - 160, w: 30, h: 100 });
      GAME.startPlay();
      return true;
    }, hill);
    await sleep(1500);
    const pl = await ed.evaluate(() => ({ y: GAME.pl.y + GAME.pl.h, g: GAME.pl.ground }));
    ok(pl.g && Math.abs(pl.y - hill.y) < 3, 'в игре на своей фигуре можно стоять', JSON.stringify(pl) + ' top ' + hill.y);
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); S.kill(); process.exit(fail ? 1 : 0);
})();
