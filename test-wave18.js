/* Восемнадцатая волна идей игроков: текстуры блоков (кирпич, дерево, трава, камень, металл, песок)
   и кисть — рисовать карту блоками 20×20 по клеткам. Свой сервер: 3282. Запуск: node test-wave18.js */
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave18-'));
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
  const S = server(3282);
  await until(() => fetch(S.base + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1500, height: 900 } });
    const ed = await ctx.newPage(); ed.on('pageerror', e => errs.push('editor: ' + e.message.slice(0, 200)));
    await ed.goto(S.base + '/editor.html');
    await until(() => ed.evaluate(() => window.GAME && Array.isArray(GAME.objects)), 15000);
    console.log('Текстуры:');
    const tex = await ed.evaluate(() => {
      const out = [];
      ['brick', 'wood', 'grass', 'stone', 'metal', 'sand'].forEach((t, i) => GAME.objects.push({ id: 9100 + i, type: i % 3 === 1 ? 'circle' : 'rect', x: 300 + i * 130, y: 300, w: 120, h: 120, fill: '#000000', tex: t }));
      const r = GAME.objects.find(o => o.id === 9100); GAME.setSel(r);
      const s = [...document.querySelectorAll('#insp select')].find(x => [...x.options].some(o => o.value === 'brick'));
      if (!s) return null;
      s.value = 'wood'; s.dispatchEvent(new Event('change'));
      return { opts: s.options.length, tex: r.tex };
    });
    ok(tex && tex.opts === 7 && tex.tex === 'wood', 'в инспекторе — «Текстура» с 6 узорами', JSON.stringify(tex));
    await sleep(300);
    await ed.screenshot({ path: path.join(os.tmpdir(), 'wave18-tex.png') });
    console.log('Кисть:');
    await ed.click('.tool[data-tool="brush"]');
    const n0 = await ed.evaluate(() => GAME.objects.length);
    await ed.mouse.move(320, 560); await ed.mouse.down();
    for (let x = 320; x <= 520; x += 7) await ed.mouse.move(x, 560);
    await ed.mouse.up();
    const painted = await ed.evaluate(n0 => GAME.objects.slice(n0).map(o => o.type + ':' + o.w + 'x' + o.h + ':' + (o.tex || '')), n0);
    ok(painted.length >= 9 && painted.length <= 12, 'проведённая кисть поставила блоки по клеткам', painted.length);
    ok(painted.every(p => p === 'rect:20x20:wood'), 'кисть рисует последней выбранной текстурой', painted[0]);
    await ed.mouse.move(320, 560); await ed.mouse.down(); await ed.mouse.move(330, 560); await ed.mouse.up();
    ok(await ed.evaluate(n => GAME.objects.length, 0) === n0 + painted.length, 'по уже закрашенным клеткам второй раз не ставит');
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); S.kill(); process.exit(fail ? 1 : 0);
})();
