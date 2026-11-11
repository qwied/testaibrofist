/* Четвёртая волна идей игроков: крупные надписи раунда («3, 2, 1», «Старт!», «Прячься!», «Ищи!»),
   пропуск карты голосованием, прогресс гонки в %, «Скрыть всех» в списке игроков, свои клавиши
   и «Слабый ПК» / режим для дальтоников из настроек. Свой сервер: 3266. Запуск: node test-wave4.js */
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
  { id: 1, type: 'rect', x: 0, y: 600, w: 2400, h: 40, fill: '#475569' },
  { id: 2, type: 'spawn', x: 60, y: 500, w: 30, h: 100 },
  { id: 3, type: 'rect', x: 500, y: 560, w: 60, h: 40, deadly: true },
  { id: 4, type: 'finishline', x: 2000, y: 474, w: 52, h: 126 }
];
function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave4-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    // встроенные карты не копируем: в пуле гонки — только две карты теста (Run A, Run B)
    return !(/^(node_modules|data|\.git|builtinMaps)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const now = Date.now();
  const map = (n, mode) => ({ mapName: n, mapType: mode, author: 'wave4owner', date: now, created: now, rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0,
    inGameModes: [], mapData: JSON.stringify({ mode, gravity: 9, objects: objs }) });
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([map('Run A', 'race'), map('Run B', 'race'), map('Hide A', 'hideAndSeek')]));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), OWNER_ALIASES: 'wave4owner',
    RACE_LOBBY_MS: '4500', HS_LOBBY_MS: '5000', HS_ROUND_MS: '60000' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}

(async () => {
  const S = server(3266);
  await until(() => fetch(S.base + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('bfKeys', JSON.stringify({ u: 'KeyK' })); localStorage.setItem('bfColorblind', '1'); } catch (e) {} });
    const g = await ctx.newPage(); g.on('pageerror', e => errs.push('game: ' + e.message.slice(0, 200)));
    console.log('Гонка: надписи, прогресс, пропуск карты:');
    await g.goto(S.base + '/game.html?mode=race&room=w4');
    const bigs = new Set();
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) { const t = await g.evaluate(() => window.__bfBig ? __bfBig() : ''); if (t) bigs.add(t); if (bigs.has('Go!') || bigs.has('Старт!')) break; await sleep(50); }
    ok(bigs.has('3') && bigs.has('2') && bigs.has('1'), 'перед стартом крупный отсчёт 3, 2, 1', [...bigs].join(','));
    ok(bigs.has('Go!') || bigs.has('Старт!'), 'на старте крупно «Старт!»', [...bigs].join(','));
    await until(() => g.evaluate(() => !GAME.frozen && GAME.playing), 6000);
    const prog0 = await until(() => g.evaluate(() => document.getElementById('gProgBox').style.display !== 'none' && document.getElementById('gProg').textContent), 4000);
    ok(prog0 === '0%', 'прогресс гонки виден: 0%', prog0);
    await g.evaluate(() => { GAME.pl.x = 1000; GAME.pl.y = 500; });
    const prog1 = await until(async () => { const t = await g.evaluate(() => document.getElementById('gProg').textContent); return parseInt(t) >= 40 ? t : null; }, 3000);
    ok(!!prog1, 'прошёл полпути — прогресс около 50%', prog1);
    ok(await g.evaluate(() => { const e = document.getElementById('gSkip'); return e.style.display !== 'none'; }), 'кнопка «Пропустить карту» видна в раунде');
    const before = await g.evaluate(() => document.getElementById('gMapName').textContent);
    await g.click('#gSkip');
    ok(!!await until(() => g.evaluate(() => /1\/1/.test(document.getElementById('gSkip').textContent) || document.getElementById('gSkip').style.display === 'none'), 3000), 'голос засчитан (1/1)');
    ok(!!await until(() => g.evaluate(() => GAME.frozen), 6000), 'карту пропустили — новое лобби');
    const after = await until(async () => { const t = await g.evaluate(() => document.getElementById('gMapName').textContent); return t !== before ? t : null; }, 6000);
    ok(!!after, 'выбрана другая карта', before + ' → ' + after);

    console.log('Свои клавиши и дальтоники:');
    await until(() => g.evaluate(() => !GAME.frozen), 9000);
    await g.keyboard.down('KeyK'); await sleep(60);
    ok(await g.evaluate(() => GAME.keys.u), 'своя клавиша прыжка (K) работает');
    await g.keyboard.up('KeyK');
    await g.screenshot({ path: path.join(os.tmpdir(), 'wave4-race.png') });

    console.log('Скрыть всех:');
    await g.click('#gCount');
    await g.click('#gPlayers [data-pall]');
    ok(await g.evaluate(() => window.__bfChatDebug.isHidden('anyone') && localStorage.getItem('bfHideAll') === '1'), '«Скрыть всех» прячет всех и запоминается');
    await g.click('#gPlayers [data-pall]');
    ok(await g.evaluate(() => !window.__bfChatDebug.isHidden('anyone')), 'повторно — все снова видны');
    await g.close();

    console.log('Прятки:');
    const h = await ctx.newPage(); h.on('pageerror', e => errs.push('hns: ' + e.message.slice(0, 200)));
    await h.goto(S.base + '/game.html?mode=hideAndSeek&room=w4h');
    const hb = new Set();
    const t1 = Date.now();
    while (Date.now() - t1 < 14000) { const t = await h.evaluate(() => window.__bfBig ? __bfBig() : ''); if (t) hb.add(t); if (hb.has('Seek!') || hb.has('Ищи!')) break; await sleep(50); }
    ok(hb.has('Hide!') || hb.has('Прячься!'), 'в начале пряток крупно «Прячься!»', [...hb].join(','));
    ok(hb.has('Seek!') || hb.has('Ищи!'), 'с началом охоты крупно «Ищи!»', [...hb].join(','));
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); S.kill(); process.exit(fail ? 1 : 0);
})();
