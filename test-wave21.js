/* Волна 21: раздавило платформой, чекпоинт с жизнями, триггеры «при смерти» и «перекрасить»,
   размер по рычагу (морфинг), песок, свой фон карты, время карты 3 минуты. Свой сервер: 3285. */
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
const objs = [
  { id: 1, type: 'rect', x: 0, y: 600, w: 6000, h: 40 },
  { id: 2, type: 'spawn', x: 60, y: 500, w: 30, h: 100 },
  { id: 3, type: 'rect', x: 400, y: 580, w: 300, h: 20, look: 'sand' },
  { id: 4, type: 'checkpoint', x: 900, y: 496, w: 40, h: 104, lives: 2 },
  { id: 5, type: 'trigger', x: 1300, y: 450, w: 80, h: 150, fx: 'color', color: '#22c55e', customId: 'tc', targetIds: 'paint1' },
  { id: 6, type: 'rect', x: 1500, y: 400, w: 60, h: 60, customId: 'paint1', fill: '#111111' },
  { id: 7, type: 'trigger', x: 4000, y: 0, w: 10, h: 10, fx: 'death', customId: 'td', targetIds: 'dgate' },
  { id: 8, type: 'rect', x: 1700, y: 300, w: 30, h: 300, customId: 'dgate' },
  { id: 9, type: 'lever', x: 2000, y: 558, w: 22, h: 42, customId: 'lv', targetIds: 'grow' },
  { id: 10, type: 'rect', x: 2200, y: 500, w: 40, h: 40, customId: 'grow', morph: 2 },
  { id: 11, type: 'rect', x: 3000, y: 200, w: 200, h: 300, moves: true, speed: 3, moveX: 0, moveY: 300 },
  { id: 12, type: 'finishline', x: 5800, y: 474, w: 52, h: 126 }
];
function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave21-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git|builtinMaps)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const now = Date.now();
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([{ mapName: 'W21', mapType: 'race', author: 'w21', date: now, created: now, rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: [],
    mapData: JSON.stringify({ mode: 'race', gravity: 9, bg: '#fde68a', timeMin: 3, objects: objs }) }]));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), OWNER_ALIASES: 'w21' } });
  return { tmp, base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
(async () => {
  const S = server(3285);
  await until(() => fetch(S.base + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const g = await ctx.newPage(); g.on('pageerror', e => errs.push('game: ' + e.message.slice(0, 200)));
    await g.goto(S.base + '/game.html?mode=race&view=W21&author=w21');
    await until(() => g.evaluate(() => window.GAME && GAME.playing && GAME.objects.length >= 12), 15000);
    await sleep(300);
    const tp = (x, y) => g.evaluate(([x, y]) => { GAME.pl.x = x; GAME.pl.y = y; GAME.pl.vx = 0; GAME.pl.vy = 0; }, [x, y || 480]);
    const O = id => g.evaluate(id => { const o = GAME.objects.find(o => o.id === id); return { act: !!o._act, fill: o.fill, ms: o._ms }; }, id);
    console.log('Песок:');
    await tp(150, 500); await sleep(300);
    await g.keyboard.down('ArrowRight'); await sleep(150); const vn = await g.evaluate(() => GAME.pl.vx); await g.keyboard.up('ArrowRight');
    await tp(500, 470); await sleep(400);
    await g.keyboard.down('ArrowRight'); await sleep(150); const vs = await g.evaluate(() => GAME.pl.vx); await g.keyboard.up('ArrowRight');
    ok(vs < vn * 0.8, 'на песке медленнее', vn.toFixed(1) + ' → ' + vs.toFixed(1));
    console.log('Чекпоинт с жизнями и триггер смерти:');
    await tp(910); await sleep(300);
    const d0 = (await O(8)).act;
    await g.keyboard.press('KeyR'); await sleep(500);
    ok((await O(8)).act !== d0, 'смерть переключила цель триггера «при смерти»');
    ok(await g.evaluate(() => Math.abs(GAME.pl.x - 900) < 60), 'первая смерть — на чекпоинт', await g.evaluate(() => Math.round(GAME.pl.x)));
    await g.keyboard.press('KeyR'); await sleep(500);
    ok(await g.evaluate(() => GAME.pl.x < 200), 'жизни чекпоинта кончились — снова со старта', await g.evaluate(() => Math.round(GAME.pl.x)));
    console.log('Перекрасить:');
    await tp(1320); await sleep(250);
    ok((await O(6)).fill === '#22c55e', 'триггер перекрасил блок', (await O(6)).fill);
    console.log('Морфинг:');
    await tp(2000); await sleep(1200);
    ok((await O(10)).ms > 1.8, 'рычаг — блок плавно вырос вдвое', (await O(10)).ms);
    console.log('Раздавило:');
    const dd = await g.evaluate(() => GAME.deaths);
    let killed = false;
    for (let i = 0; i < 40 && !killed; i++) { await tp(3080, 500); await sleep(100); killed = await g.evaluate(d => GAME.deaths > d, dd); }
    ok(killed, 'опускающийся блок прижал к полу — смерть');
    console.log('Фон и время:');
    const px = await g.evaluate(() => { const c = document.getElementById('c'); return Array.from(c.getContext('2d').getImageData(5, 120, 1, 1).data).join(','); });
    ok(/^25[0-5],2[2-4][0-9],1[0-6][0-9]/.test(px), 'фон карты — свой цвет', px);
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); S.kill(); process.exit(fail ? 1 : 0);
})();
