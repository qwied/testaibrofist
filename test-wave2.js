/* Вторая волна идей игроков (по их картинкам): звёзды для сбора и закрытый без них финиш,
   вид блока «Шипы» / «Пружина», копии блока в ряд «+ / −» в редакторе, эмоции «Сесть» / «Лечь»
   (видны другим), стиль облачков чата. Свой сервер: 3264. Запуск: node test-wave2.js */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const { io } = require('socket.io-client');
const ROOT = __dirname;
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + String(x).slice(0, 220))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(80); } return null; };

const objs = [
  { id: 1, type: 'rect', x: 0, y: 600, w: 2400, h: 40, fill: '#475569' },
  { id: 2, type: 'spawn', x: 60, y: 500, w: 30, h: 100 },
  { id: 3, type: 'star', x: 400, y: 540, w: 44, h: 44 },
  { id: 4, type: 'star', x: 700, y: 540, w: 44, h: 44 },
  { id: 5, type: 'finishline', x: 1100, y: 474, w: 52, h: 126 },
  { id: 6, type: 'rect', x: 1500, y: 560, w: 120, h: 40, look: 'spring', power: 2 },
  { id: 7, type: 'rect', x: 1900, y: 570, w: 120, h: 30, look: 'spikes', deadly: true }
];
function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave2-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const now = Date.now();
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([{ mapName: 'Star Test', mapType: 'race', author: 'wave2owner', date: now, created: now,
    rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: [], mapData: JSON.stringify({ mode: 'race', gravity: 1, objects: objs }) }]));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), OWNER_ALIASES: 'wave2owner' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}

(async () => {
  const S = server(3264);
  await until(() => fetch(S.base + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    console.log('Звёзды:');
    const g = await ctx.newPage(); g.on('pageerror', e => errs.push('game: ' + e.message.slice(0, 200)));
    await g.goto(S.base + '/game.html?mode=race&view=' + encodeURIComponent('Star Test') + '&author=wave2owner');
    await until(() => g.evaluate(() => window.GAME && GAME.playing && GAME.objects.some(o => o.type === 'star')), 15000);
    const hud0 = await until(() => g.evaluate(() => { const e = document.getElementById('starHud'); return e && e.style.display !== 'none' ? e.textContent : null; }), 4000);
    ok(/0 \/ 2/.test(hud0 || ''), 'счётчик звёзд виден: 0 / 2', hud0);
    const tp = (x, y) => g.evaluate(([x, y]) => { GAME.pl.x = x; GAME.pl.y = y; GAME.pl.vx = 0; GAME.pl.vy = 0; }, [x, y]);
    await tp(1110, 500); await sleep(400);
    ok(await g.evaluate(() => !GAME.done), 'без звёзд финиш не засчитан');
    ok(/звёзд|stars/i.test(await g.evaluate(() => document.getElementById('msgS').textContent)), 'подсказка «сначала собери звёзды»', await g.evaluate(() => document.getElementById('msgS').textContent));
    await tp(405, 500); await sleep(300);
    await tp(705, 500); await sleep(300);
    const hud2 = await g.evaluate(() => document.getElementById('starHud').textContent);
    ok(/2 \/ 2/.test(hud2), 'обе звезды собраны', hud2);
    await tp(1110, 500); await sleep(400);
    ok(await g.evaluate(() => GAME.done), 'со всеми звёздами финиш засчитан');
    await g.evaluate(() => GAME.restartRun());
    await sleep(200);
    ok(/0 \/ 2/.test(await g.evaluate(() => document.getElementById('starHud').textContent)), 'новый забег — звёзды снова на месте');

    console.log('Пружина и шипы:');
    await tp(1540, 380); await sleep(50);
    const vmin = await g.evaluate(() => new Promise(r => { let m = 0; const t0 = Date.now(); const iv = setInterval(() => { m = Math.min(m, GAME.pl.vy); if (Date.now() - t0 > 900) { clearInterval(iv); r(m); } }, 10); }));
    const jv = await g.evaluate(() => -Math.sqrt(2 * 9 * 0.062 * 1.44 * 155));
    ok(vmin < jv * 1.5, 'пружина подбрасывает выше обычного прыжка', 'vy ' + vmin.toFixed(1) + ' vs jump ' + jv.toFixed(1));
    const d0 = await g.evaluate(() => GAME.deaths);
    await tp(1930, 480); await sleep(600);
    ok(await g.evaluate(() => GAME.deaths) > d0, 'шипы убивают', await g.evaluate(() => GAME.deaths));

    console.log('Эмоции:');
    const spy = io(S.base, { transports: ['websocket'], forceNew: true });
    await new Promise(r => spy.on('connect', r));
    const room = await g.evaluate(() => new URLSearchParams(location.search).get('room'));
    const poses = [];
    spy.on('state', list => list.forEach(e => { if (e.p !== undefined) poses.push(e.p); }));
    // view-режим без комнаты — заходим в обычную гонку
    const g2 = await ctx.newPage(); g2.on('pageerror', e => errs.push('game2: ' + e.message.slice(0, 200)));
    await g2.goto(S.base + '/game.html?mode=race&room=emo1');
    await until(() => g2.evaluate(() => window.GAME && GAME.playing), 15000);
    spy.emit('join', { playerName: 'Spy', gameMode: 'race', room: 'emo1' });
    await sleep(1500);
    await g2.click('#gEmo');
    await g2.click('#gEmoBox [data-emo="sit"]');
    ok(!!await until(() => poses.includes('sit'), 4000), 'другие видят позу «сесть»', JSON.stringify(poses));
    await g2.click('#gEmo'); await g2.click('#gEmoBox [data-emo="sleep"]');
    ok(!!await until(() => poses.includes('sleep'), 4000), 'другие видят позу «лечь»', JSON.stringify(poses));
    await g2.evaluate(() => { GAME.pl.x += 80; });
    ok(!!await until(() => poses[poses.length - 1] === '', 4000), 'сдвинулся — поза сбрасывается', JSON.stringify(poses));
    await g2.screenshot({ path: path.join(os.tmpdir(), 'wave2-emo.png') });

    console.log('Облачко чата:');
    await g2.evaluate(() => { localStorage.setItem('bfBubbleStyle', 'box'); });
    await g2.keyboard.press('Enter'); await g2.keyboard.type('Hello! My name is Kirk!'); await sleep(400);
    await g2.screenshot({ path: path.join(os.tmpdir(), 'wave2-bubble.png') });
    ok(!errs.length, 'облачко-рамка рисуется без ошибок', errs.join(' | '));
    spy.close();

    console.log('Редактор:');
    const ed = await ctx.newPage(); ed.on('pageerror', e => errs.push('editor: ' + e.message.slice(0, 200)));
    await ed.goto(S.base + '/editor.html');
    await until(() => ed.evaluate(() => window.GAME && Array.isArray(GAME.objects)), 15000);
    const sel = await ed.evaluate(() => {
      GAME.objects.push({ id: 9001, type: 'rect', x: 200, y: 300, w: 80, h: 40, fill: '#475569' });
      GAME.setSel(GAME.objects[GAME.objects.length - 1]);
      return GAME.sel && GAME.sel.id === 9001;
    });
    ok(sel, 'блок выделен, панель свойств открыта');
    const look = await ed.evaluate(() => {
      const sel = [...document.querySelectorAll('#insp .pRow')].find(r => /Look|Вид/.test(r.textContent));
      if (!sel) return null;
      const s = sel.querySelector('select'); s.value = 'spikes'; s.dispatchEvent(new Event('change'));
      return { look: GAME.sel && GAME.sel.look, deadly: GAME.sel && GAME.sel.deadly };
    });
    ok(look && look.look === 'spikes' && look.deadly === true, '«Вид: Шипы» делает блок ядовитым', JSON.stringify(look));
    const arr = await ed.evaluate(() => {
      const row = [...document.querySelectorAll('#insp .pRow')].find(r => /Copies|Копии/.test(r.textContent));
      if (!row) return null;
      const plus = [...row.querySelectorAll('button')].find(b => b.textContent === '+');
      plus.click(); plus.click();
      const s = GAME.sel, mates = GAME.objects.filter(o => o.row && o.row === s.row).sort((a, b) => a.x - b.x);
      const minus = [...document.querySelectorAll('#insp .pRow')].find(r => /Copies|Копии/.test(r.textContent)).querySelectorAll('button')[1];
      return { n: mates.length, adj: mates[1].x === mates[0].x + mates[0].w, minus: !!minus };
    });
    ok(arr && arr.n === 3 && arr.adj, '«+» дважды — три блока вплотную в ряд', JSON.stringify(arr));
    const back = await ed.evaluate(() => {
      const row = [...document.querySelectorAll('#insp .pRow')].find(r => /Copies|Копии/.test(r.textContent));
      [...row.querySelectorAll('button')].find(b => b.textContent !== '+').click();
      return GAME.objects.filter(o => o.row && o.row === GAME.sel.row).length;
    });
    ok(back === 2, '«−» убирает последнюю копию', back);
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); S.kill(); process.exit(fail ? 1 : 0);
})();
