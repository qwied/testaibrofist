/* Третья волна идей игроков: новые блоки и опции карты — лёд, ломающийся блок, платформа,
   проходимая снизу, мигающий блок, ключ и дверь с замком, кнопка с таймером, зона гравитации,
   двойной прыжок, урон от падения, R — к чекпоинту. Свой сервер: 3265. Запуск: node test-wave3.js */
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
  { id: 1, type: 'rect', x: 0, y: 600, w: 4000, h: 40, fill: '#475569' },
  { id: 2, type: 'spawn', x: 60, y: 500, w: 30, h: 100 },
  { id: 3, type: 'rect', x: 300, y: 580, w: 700, h: 20, look: 'ice' },
  { id: 4, type: 'rect', x: 1100, y: 400, w: 120, h: 20, crumble: true },
  { id: 5, type: 'rect', x: 1400, y: 420, w: 160, h: 20, oneWay: true },
  { id: 6, type: 'rect', x: 1700, y: 420, w: 100, h: 20, blink: 0.5 },
  { id: 7, type: 'key', x: 2000, y: 550, w: 36, h: 36, customId: 'k1', targetIds: 'door1' },
  { id: 8, type: 'rect', x: 2200, y: 300, w: 40, h: 300, look: 'lock', customId: 'door1' },
  { id: 9, type: 'button', x: 2500, y: 582, w: 34, h: 18, customId: 'b1', targetIds: 'gate2', holdSec: 1 },
  { id: 10, type: 'rect', x: 2700, y: 300, w: 30, h: 300, customId: 'gate2' },
  { id: 11, type: 'gravzone', x: 3000, y: 100, w: 300, h: 500, gmul: 0 },
  { id: 12, type: 'finishline', x: 3800, y: 474, w: 52, h: 126 }
];
function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave3-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const now = Date.now();
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([{ mapName: 'Block Test', mapType: 'race', author: 'wave3owner', date: now, created: now,
    rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: [],
    mapData: JSON.stringify({ mode: 'race', gravity: 9, djump: 1, fallDmg: 1, objects: objs }) }]));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), OWNER_ALIASES: 'wave3owner' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}

(async () => {
  const S = server(3265);
  await until(() => fetch(S.base + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const g = await ctx.newPage(); g.on('pageerror', e => errs.push('game: ' + e.message.slice(0, 200)));
    await g.goto(S.base + '/game.html?mode=race&view=' + encodeURIComponent('Block Test') + '&author=wave3owner');
    await until(() => g.evaluate(() => window.GAME && GAME.playing && GAME.objects.some(o => o.type === 'key')), 15000);
    const tp = (x, y) => g.evaluate(([x, y]) => { GAME.pl.x = x; GAME.pl.y = y; GAME.pl.vx = 0; GAME.pl.vy = 0; GAME.pl.airTop = undefined; }, [x, y]);
    const O = id => g.evaluate(id => { const o = GAME.objects.find(o => o.id === id); return { act: !!o._act, off: !!o._off, gone: !!o._gone, got: !!o._got }; }, id);

    console.log('Лёд:');
    await tp(400, 480); await sleep(400);
    await g.keyboard.down('ArrowRight'); await sleep(120);
    const vIce = await g.evaluate(() => GAME.pl.vx);
    await sleep(700); await g.keyboard.up('ArrowRight'); await sleep(250);
    const vSlide = await g.evaluate(() => GAME.pl.vx);
    ok(vSlide > 0.5, 'на льду после отпускания игрок продолжает скользить', 'vx ' + vSlide.toFixed(2));
    await tp(150, 500); await sleep(400);
    await g.keyboard.down('ArrowRight'); await sleep(120);
    const vNorm = await g.evaluate(() => GAME.pl.vx);
    await g.keyboard.up('ArrowRight'); await sleep(250);
    ok(vIce < vNorm * 0.8, 'на льду разгон медленнее, чем на обычном полу', vIce.toFixed(2) + ' vs ' + vNorm.toFixed(2));
    ok(Math.abs(await g.evaluate(() => GAME.pl.vx)) < 0.3, 'на обычном полу игрок останавливается');

    console.log('Ломается:');
    await tp(1140, 290); await sleep(300);
    ok(await g.evaluate(() => GAME.pl.ground && GAME.pl.y + GAME.pl.h <= 401), 'игрок стоит на ломающемся блоке');
    ok(!!await until(async () => (await O(4)).gone, 2000), 'блок рассыпался под игроком');
    ok(!!await until(() => g.evaluate(() => GAME.pl.y + GAME.pl.h > 590), 2000), 'игрок упал вниз');
    ok(!!await until(async () => !(await O(4)).gone, 5000), 'блок вернулся через пару секунд');

    console.log('Платформа, проходимая снизу:');
    await tp(1460, 500); await g.evaluate(() => { GAME.pl.vy = -24; }); await sleep(900);
    const ow = await g.evaluate(() => ({ y: GAME.pl.y + GAME.pl.h, g: GAME.pl.ground }));
    ok(Math.abs(ow.y - 420) < 2 && ow.g, 'прыжок снизу проходит сквозь и игрок встаёт сверху', JSON.stringify(ow));
    await g.keyboard.down('ArrowDown'); await sleep(500); await g.keyboard.up('ArrowDown');
    ok(await g.evaluate(() => GAME.pl.y + GAME.pl.h > 590), '«вниз» — спрыгнуть сквозь платформу');

    console.log('Мигает:');
    const seen = new Set();
    for (let i = 0; i < 16; i++) { seen.add((await O(6)).off); await sleep(90); }
    ok(seen.has(true) && seen.has(false), 'мигающий блок то есть, то нет');

    console.log('Ключ и дверь с замком:');
    ok(!(await O(8)).act, 'дверь закрыта без ключа');
    await tp(2005, 500); await sleep(300);
    ok((await O(7)).got && (await O(8)).act, 'ключ подобран — дверь открылась');
    await tp(2160, 500); await g.keyboard.down('ArrowRight'); await sleep(500); await g.keyboard.up('ArrowRight');
    ok(await g.evaluate(() => GAME.pl.x > 2250), 'сквозь открытую дверь можно пройти', await g.evaluate(() => GAME.pl.x));

    console.log('Кнопка с таймером:');
    await tp(2500, 500); await sleep(300);
    ok((await O(10)).act, 'кнопка нажата — ворота открыты');
    await tp(2400, 500); await sleep(400);
    ok((await O(10)).act, 'сошли с кнопки — ворота ещё открыты (таймер)');
    ok(!!await until(async () => !(await O(10)).act, 2500), 'через секунду ворота закрылись');

    console.log('Зона гравитации:');
    await tp(3100, 300); await sleep(500);
    const zy = await g.evaluate(() => GAME.pl.y);
    ok(Math.abs(zy - 300) < 30, 'в зоне невесомости игрок не падает', zy.toFixed(1));

    console.log('Двойной прыжок:');
    await tp(3500, 500); await sleep(300);
    await g.keyboard.down('ArrowUp'); await sleep(140); await g.keyboard.up('ArrowUp');
    await sleep(80);
    const vy1 = await g.evaluate(() => GAME.pl.vy);
    await g.keyboard.down('ArrowUp'); await sleep(40);
    const dj = await g.evaluate(() => ({ vy: GAME.pl.vy, dj: GAME.pl.dj }));
    await g.keyboard.up('ArrowUp');
    ok(dj.dj && dj.vy < vy1 - 2, 'второй прыжок в воздухе срабатывает', vy1.toFixed(1) + ' → ' + dj.vy.toFixed(1));
    await sleep(1500);

    console.log('Урон от падения и R:');
    const d0 = await g.evaluate(() => GAME.deaths);
    await tp(3600, -500); await sleep(2200);
    ok(await g.evaluate(() => GAME.deaths) > d0, 'падение с большой высоты убивает', await g.evaluate(() => GAME.deaths));
    await sleep(500);
    const d1 = await g.evaluate(() => GAME.deaths);
    await tp(3600, 400); await sleep(700);
    ok(await g.evaluate(() => GAME.deaths) === d1, 'невысокий прыжок вниз не убивает');
    await g.keyboard.press('KeyR'); await sleep(200);
    ok(await g.evaluate(() => GAME.deaths) === d1 + 1, 'R — назад на чекпоинт');
    await g.screenshot({ path: path.join(os.tmpdir(), 'wave3-game.png') });

    console.log('Редактор:');
    const ed = await ctx.newPage(); ed.on('pageerror', e => errs.push('editor: ' + e.message.slice(0, 200)));
    await ed.goto(S.base + '/editor.html');
    await until(() => ed.evaluate(() => window.GAME && Array.isArray(GAME.objects)), 15000);
    ok(await ed.evaluate(() => !!document.querySelector('.tool[data-tool="key"]') && !!document.querySelector('.tool[data-tool="gravzone"]')), 'в палитре есть Ключ и Зона гравитации');
    const ins = await ed.evaluate(() => {
      GAME.objects.push({ id: 9001, type: 'rect', x: 200, y: 300, w: 80, h: 40, fill: '#475569' });
      GAME.setSel(GAME.objects[GAME.objects.length - 1]);
      const t = document.getElementById('insp').textContent;
      const opts = [...document.querySelectorAll('#insp select option')].map(o => o.value);
      return { crumble: /Ломается|Crumbles/.test(t), oneWay: /снизу|from below/.test(t), blink: /Мигает|Blinks/.test(t), ice: opts.includes('ice'), lock: opts.includes('lock') };
    });
    ok(Object.values(ins).every(Boolean), 'у блока есть «Ломается», «Проходима снизу», «Мигает», вид «Лёд» и «Дверь с замком»', JSON.stringify(ins));
    const rr = await ed.evaluate(() => [...document.querySelectorAll('.rrBtn')].map(b => b.textContent).join('|'));
    ok(/Double jump|Двойной/.test(rr) && /Fall damage|Урон/.test(rr), 'в правилах гонки — двойной прыжок и урон от падения', rr);
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); S.kill(); process.exit(fail ? 1 : 0);
})();
