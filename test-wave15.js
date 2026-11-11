/* Пятнадцатая волна идей игроков: зиплайн (канат, по которому скатываешься в прыжке) и поиск по
   своим картам в профиле. Свой сервер: 3279. Запуск: node test-wave15.js */
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
  { type: 'rect', x: 0, y: 900, w: 3000, h: 40 },
  { type: 'spawn', x: 60, y: 800, w: 30, h: 100 },
  { type: 'zipline', x: 200, y: 300, w: 1200, h: 400 },
  { type: 'finishline', x: 2800, y: 774, w: 52, h: 126 }
];
function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave15-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git|builtinMaps)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const now = Date.now();
  const maps = [{ mapName: 'Zip Line', mapType: 'race', author: 'w15', date: now, created: now, rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: [],
    mapData: JSON.stringify({ mode: 'race', gravity: 9, objects: objs }) }];
  ['Lava Jump', 'Ice Run', 'Lava Pit', 'Sky Road', 'Deep Cave', 'Night Town'].forEach((n, i) => maps.push({ mapName: n, mapType: 'race', author: 'w15', date: now - i, created: now,
    rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: [], mapData: JSON.stringify({ mode: 'race', gravity: 9, objects: objs }) }));
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify(maps));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), OWNER_ALIASES: 'w15' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
(async () => {
  const S = server(3279);
  await until(() => fetch(S.base + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    console.log('Зиплайн:');
    const g = await ctx.newPage(); g.on('pageerror', e => errs.push('game: ' + e.message.slice(0, 200)));
    await g.goto(S.base + '/game.html?mode=race&view=Zip%20Line&author=w15');
    await until(() => g.evaluate(() => window.GAME && GAME.playing && GAME.objects.some(o => o.type === 'zipline')), 15000);
    // падаем на канат сверху у его начала: руки (верх головы) встречают канат
    await g.evaluate(() => { GAME.pl.x = 300 - 15; GAME.pl.y = 300; GAME.pl.vx = 0; GAME.pl.vy = 0; });
    const hooked = await until(() => g.evaluate(() => !!GAME.pl.zip), 2000);
    ok(!!hooked, 'игрок в воздухе зацепился за канат');
    const x0 = await g.evaluate(() => GAME.pl.x); await sleep(700);
    const st = await g.evaluate(() => ({ x: GAME.pl.x, zip: !!GAME.pl.zip, t: GAME.pl.zip && GAME.pl.zip.t }));
    ok(st.x > x0 + 80, 'скатывается вниз по канату', Math.round(x0) + ' → ' + Math.round(st.x));
    await g.keyboard.down('ArrowUp'); await sleep(80); await g.keyboard.up('ArrowUp');
    ok(await g.evaluate(() => !GAME.pl.zip), 'прыжок — отцепился');
    ok(await g.evaluate(() => GAME.pl.vx > 1), 'и летит дальше с разгоном', await g.evaluate(() => GAME.pl.vx.toFixed(2)));
    await g.screenshot({ path: path.join(os.tmpdir(), 'wave15-zip.png') });
    console.log('Поиск по своим картам:');
    const up = await ctx.newPage(); up.on('pageerror', e => errs.push('users: ' + e.message.slice(0, 200)));
    await up.goto(S.base + '/users?name=w15');
    await up.waitForSelector('[data-tab="maps"]', { timeout: 8000 });
    await up.click('[data-tab="maps"]');
    await up.waitForSelector('#upMapSearch', { timeout: 6000 });
    await up.fill('#upMapSearch', 'lava');
    const found = await until(() => up.evaluate(() => { const t = [...document.querySelectorAll('#upTabBody .upRow .who a')].map(a => a.textContent); return t.length === 2 ? t.join(',') : null; }), 3000);
    ok(found === 'Lava Jump,Lava Pit', 'поиск оставляет только подходящие карты', found);
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); S.kill(); process.exit(fail ? 1 : 0);
})();
