/* Седьмая волна идей игроков — атмосфера карт: дождь, снег, ночь и туман, триггер-эффект
   (тряска, вспышка, надпись), параллакс-фон без столкновений, кнопка атмосферы в редакторе.
   Свой сервер: 3269. Запуск: node test-wave7.js */
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
const objs = [
  { id: 1, type: 'rect', x: 0, y: 600, w: 3000, h: 40 },
  { id: 2, type: 'spawn', x: 60, y: 500, w: 30, h: 100 },
  { id: 3, type: 'trigger', x: 400, y: 450, w: 120, h: 150, fx: 'flash' },
  { id: 4, type: 'trigger', x: 800, y: 450, w: 120, h: 150, fx: 'msg', text: 'Welcome to the cave!', once: true },
  { id: 5, type: 'trigger', x: 1200, y: 450, w: 120, h: 150, fx: 'shake' },
  { id: 6, type: 'rect', x: 1500, y: 450, w: 200, h: 150, parallax: 0.5, fill: '#94a3b8' },
  { id: 7, type: 'finishline', x: 2800, y: 474, w: 52, h: 126 }
];
function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave7-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const now = Date.now();
  const map = (n, atmo) => ({ mapName: n, mapType: 'race', author: 'wave7owner', date: now, created: now, rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: [],
    mapData: JSON.stringify({ mode: 'race', gravity: 9, atmo, objects: objs }) });
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([map('Night Map', 'night'), map('Rain Map', 'rain'), map('Snow Map', 'snow'), map('Fog Map', 'fog')]));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), OWNER_ALIASES: 'wave7owner' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
(async () => {
  const S = server(3269);
  await until(() => fetch(S.base + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const open = async (name) => {
      const g = await ctx.newPage(); g.on('pageerror', e => errs.push(name + ': ' + e.message.slice(0, 200)));
      await g.goto(S.base + '/game.html?mode=race&view=' + encodeURIComponent(name) + '&author=wave7owner');
      await until(() => g.evaluate(() => window.GAME && GAME.playing && GAME.objects.some(o => o.type === 'trigger')), 15000);
      return g;
    };
    console.log('Атмосфера:');
    for (const [name, a] of [['Night Map', 'night'], ['Rain Map', 'rain'], ['Snow Map', 'snow'], ['Fog Map', 'fog']]) {
      const g = await open(name);
      await sleep(500);
      ok(await g.evaluate(() => GAME.atmo) === a, 'карта «' + name + '»: атмосфера ' + a);
      await g.screenshot({ path: path.join(os.tmpdir(), 'wave7-' + a + '.png') });
      if (a !== 'night') await g.close();
      else {
        console.log('Триггеры:');
        const tp = (x) => g.evaluate(x => { GAME.pl.x = x; GAME.pl.y = 500; GAME.pl.vx = 0; GAME.pl.vy = 0; }, x);
        await tp(440); await sleep(60);
        ok(await g.evaluate(() => GAME.flashA) > 0.1, 'вошёл в триггер «Вспышка» — экран вспыхнул');
        await tp(840); await sleep(200);
        ok(/cave/.test(await g.evaluate(() => document.getElementById('msgS').textContent)), 'триггер «Надпись» показал текст');
        await tp(1240); await sleep(40);
        ok(await g.evaluate(() => GAME.shake) > 5, 'триггер «Тряска» трясёт экран');
        console.log('Параллакс:');
        await tp(1550); await sleep(300);
        ok(await g.evaluate(() => GAME.pl.ground && GAME.pl.y + GAME.pl.h > 590), 'сквозь параллакс-декорацию игрок проходит');
        await g.close();
      }
    }
    console.log('Редактор:');
    const ed = await ctx.newPage(); ed.on('pageerror', e => errs.push('editor: ' + e.message.slice(0, 200)));
    await ed.goto(S.base + '/editor.html');
    await until(() => ed.evaluate(() => window.GAME && Array.isArray(GAME.objects)), 15000);
    await ed.click('#bAtmo'); await ed.click('#bAtmo');
    ok(/Snow|Снег/.test(await ed.evaluate(() => document.getElementById('bAtmo').getAttribute('data-tip'))), 'кнопка атмосферы: Ясно → Дождь → Снег');
    const saved = await ed.evaluate(() => JSON.parse(window.getEditorMap().data).atmo);
    ok(saved === 'snow', 'атмосфера сохраняется в карте', saved);
    ok(await ed.evaluate(() => !!document.querySelector('.tool[data-tool="trigger"]')), 'в палитре есть «Триггер-эффект»');
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); S.kill(); process.exit(fail ? 1 : 0);
})();
