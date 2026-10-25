/* Правила гонки на карту (идеи 2019 года: Deathrun с тремя жизнями, Maze с долгим таймером):
   в редакторе у Race в строке под режимом — «Lives ∞ 1 3 5» и «Time 2 5 10 min», они пишутся
   в JSON карты (lives/timeMin). В игре: таймер карты берётся из неё, жизни видны в шапке, после
   последней смерти забег начинается заново с самого старта (чекпоинты сброшены). Сервер растягивает
   шкалу очков на время карты. Свои серверы на копиях репозитория: 3235 — карта с правилами для
   браузера, 3236 — обычная карта и лабиринт для подсчёта очков. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
const OWNER = 'racerulesowner';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(80); } return null; };

function server(port, maps) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-rr-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify(maps.map(m => ({ mapName: m.name, mapType: 'race',
    mapData: JSON.stringify(m.data), author: OWNER, date: Date.now(), created: Date.now(), rating: 0, votes: {},
    boostLikes: 0, boostDislikes: 0, inGameModes: [] }))));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), OWNER_ALIASES: OWNER, RACE_LOBBY_MS: '800' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
const floorMap = (extra) => Object.assign({ mode: 'race', objects: [
  { id: 1, type: 'spawn', x: 200, y: 400, w: 30, h: 100 },
  { id: 2, type: 'rect', x: 0, y: 560, w: 3000, h: 80 },
  { id: 3, type: 'checkpoint', x: 900, y: 460, w: 30, h: 100 },
  { id: 4, type: 'finishline', x: 2600, y: 440, w: 30, h: 120 }] }, extra);
// для подсчёта очков старт и финиш рядом — порог «быстрее прямой» тут почти нулевой
const nearMap = (extra) => Object.assign({ mode: 'race', objects: [
  { id: 1, type: 'spawn', x: 200, y: 400, w: 30, h: 100 },
  { id: 2, type: 'rect', x: 0, y: 560, w: 1200, h: 80 },
  { id: 3, type: 'finishline', x: 300, y: 440, w: 30, h: 120 }] }, extra);

(async () => {
  const A = server(3235, [{ name: 'Deathrun', data: floorMap({ lives: 3, timeMin: 5 }) }]);
  const B = server(3236, [{ name: 'Plain', data: nearMap({}) }, { name: 'Maze', data: nearMap({ timeMin: 10 }) }]);
  process.on('exit', () => { A.kill(); B.kill(); });
  for (const s of [A, B]) if (!await until(() => fetch(s.base + '/').then(r => r.ok).catch(() => false), 20000)) throw new Error('сервер не поднялся');
  const browser = await chromium.launch();
  const errs = [];

  // ---------- редактор ----------
  console.log('редактор:');
  for (const vp of [{ width: 1400, height: 900 }, { width: 390, height: 844, mobile: true }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
    const ep = await ctx.newPage();
    ep.on('pageerror', e => errs.push('editor: ' + e.message.slice(0, 140)));
    await ep.goto(A.base + '/editor', { waitUntil: 'networkidle' });
    await ep.evaluate(() => { const x = document.getElementById('bfConsent'); if (x) x.remove(); });
    const tag = vp.mobile ? ' (телефон)' : '';
    const vis = () => ep.evaluate(() => {
      const shown = el => el && getComputedStyle(el).display !== 'none' && document.getElementById('apoc').style.display !== 'none';
      return { rr: Array.from(document.querySelectorAll('#apoc .rrBtn')).filter(shown).length,
               ap: Array.from(document.querySelectorAll('#apoc .apocBtn')).filter(shown).length };
    });
    await ep.click('.modeBtn[data-mode="hideAndSeek"]');
    const hs = await vis();
    ok(hs.rr === 0 && hs.ap === 2, 'прятки: только Classic / Zombie Apocalypse' + tag, JSON.stringify(hs));
    await ep.click('.modeBtn[data-mode="race"]');
    const rc = await vis();
    ok(rc.rr === 10 && rc.ap === 0, 'гонка: вместо них жизни, время и цель карты' + tag, JSON.stringify(rc));
    const fit = await ep.evaluate(() => {
      const r = document.getElementById('apoc').getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), vw: document.documentElement.clientWidth, scroll: document.getElementById('apoc').scrollWidth - document.getElementById('apoc').clientWidth };
    });
    ok(fit.left >= 0 && fit.right <= fit.vw && fit.scroll <= 1, 'строка правил целиком на экране (на узком — в две строки)' + tag, JSON.stringify(fit));
    if (process.env.SHOT && vp.mobile) await ep.screenshot({ path: process.env.SHOT });
    if (!vp.mobile) {
      const tips = await ep.evaluate(() => Array.from(document.querySelectorAll('#apoc .rrLbl')).map(b => b.title));
      ok(/restarts from the very start/.test(tips[0]) && /Time limit/.test(tips[1]), 'у подписей есть понятные подсказки', tips.join(' | '));
      const before = JSON.parse(await ep.evaluate(() => window.getEditorMap().data));
      ok(before.lives === undefined && before.timeMin === undefined, 'по умолчанию правил в карте нет (∞ и 2 мин)');
      await ep.click('#apoc .rrBtn[data-lives="3"]');
      await ep.click('#apoc .rrBtn[data-time="10"]');
      const after = JSON.parse(await ep.evaluate(() => window.getEditorMap().data));
      ok(after.lives === 3 && after.timeMin === 10, 'выбрали 3 жизни и 10 минут — они в JSON карты', JSON.stringify({ lives: after.lives, timeMin: after.timeMin }));
      const on = await ep.evaluate(() => Array.from(document.querySelectorAll('#apoc .rrBtn.on')).map(b => b.textContent).join(','));
      ok(on === '3,10 min,Finish', 'выбранные кнопки подсвечены', on);
      // Last bro standing без жизней не бывает: выбрали его при ∞ — жизни становятся 3, вернули ∞ — цель снова Finish
      await ep.click('#apoc .rrBtn[data-lives="0"]');
      await ep.click('#apoc .rrBtn[data-goal="last"]');
      const g1 = JSON.parse(await ep.evaluate(() => window.getEditorMap().data));
      ok(g1.goal === 'last' && g1.lives === 3, '«Last one» при ∞ жизнях сам ставит 3 жизни', JSON.stringify({ goal: g1.goal, lives: g1.lives }));
      await ep.click('#apoc .rrBtn[data-lives="0"]');
      const g2 = JSON.parse(await ep.evaluate(() => window.getEditorMap().data));
      ok(g2.goal === undefined && g2.lives === undefined, 'вернули ∞ — цель снова «Finish»', JSON.stringify({ goal: g2.goal, lives: g2.lives }));
      await ep.click('#apoc .rrBtn[data-lives="3"]');
      await ep.click('#apoc .rrBtn[data-goal="first"]');
      const g3 = JSON.parse(await ep.evaluate(() => window.getEditorMap().data));
      ok(g3.goal === 'first', '«1st wins» записан в карту', String(g3.goal));
      const gtip = await ep.evaluate(() => document.querySelectorAll('#apoc .rrLbl')[2].title);
      ok(/1st wins/.test(gtip) && /Last one/.test(gtip), 'у «Goal» подсказка объясняет все три цели', gtip.slice(0, 60) + '…');
      await ep.click('.modeBtn[data-mode="hideAndSeek"]');
      const hsMap = JSON.parse(await ep.evaluate(() => window.getEditorMap().data));
      ok(hsMap.lives === undefined && hsMap.timeMin === undefined, 'в карте пряток правил гонки нет');
      // загрузка карты с правилами возвращает их на кнопки
      await ep.evaluate((d) => window.GAME.loadMap(d), JSON.stringify(floorMap({ lives: 5, timeMin: 5 })));
      const on2 = await ep.evaluate(() => Array.from(document.querySelectorAll('#apoc .rrBtn.on')).map(b => b.textContent).join(','));
      ok(on2 === '5,5 min,Finish', 'открыли карту с правилами — кнопки показывают их', on2);
      await ep.evaluate((d) => window.GAME.loadMap(d), JSON.stringify(floorMap({ lives: 7, timeMin: 99, goal: 'boom' })));
      ok(await ep.evaluate(() => window.GAME.raceLives === 0 && window.GAME.raceTimeMin === 0 && window.GAME.raceGoal === ''), 'мусорные значения из чужой карты не принимаются');
      await ep.evaluate((d) => window.GAME.loadMap(d), JSON.stringify(floorMap({ goal: 'last' })));
      ok(await ep.evaluate(() => window.GAME.raceGoal === ''), '«Last one» без жизней из чужой карты не принимается');
    }
    await ctx.close();
  }

  // ---------- игра: Deathrun на 3 жизни, 5 минут ----------
  console.log('игра:');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await page.goto(A.base + '/game.html?mode=race&room=rr' + Math.floor(Math.random() * 1e6), { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { const x = document.getElementById('bfConsent'); if (x) x.remove(); });
  // общий раунд: короткий отсчёт (RACE_LOBBY_MS), потом старт — ждём, пока снимут заморозку
  await until(() => page.evaluate(() => window.GAME && window.GAME.playing && window.GAME.raceLives === 3 && window.GAME.frozen === false), 15000);
  const time = await until(async () => { const t = await page.evaluate(() => document.getElementById('gTime').textContent); return /^(5:00|4:5\d)$/.test(t) ? t : null; }, 4000);
  ok(/^(5:00|4:5\d)$/.test(time), 'таймер карты — 5 минут', time);
  const lives = () => page.evaluate(() => { const b = document.getElementById('gLivesBox'); return b.style.display === 'none' ? '' : document.getElementById('gLives').textContent; });
  ok(await until(async () => (await lives()) === '3/3'), 'в шапке: Lives 3/3', await lives());
  ok(/Lives/.test(await page.evaluate(() => document.getElementById('gLivesBox').textContent)), 'подпись по-английски');
  // дошли до чекпоинта, падаем в пропасть
  await page.evaluate(() => { const p = window.GAME.pl; p.x = 900; p.y = 460; p.vx = 0; p.vy = 0; });
  await sleep(400);
  const fall = () => page.evaluate(() => { const p = window.GAME.pl; p.y = 6000; });
  await fall();
  ok(await until(async () => (await lives()) === '2/3'), 'одна смерть — осталось 2/3', await lives());
  await sleep(500);
  const atCp = await page.evaluate(() => Math.round(window.GAME.pl.x));
  ok(Math.abs(atCp - 900) < 40, 'пока жизни есть — возрождение на чекпоинте', String(atCp));
  await fall(); await until(async () => (await lives()) === '1/3');
  await sleep(500);
  await fall();
  ok(await until(async () => (await lives()) === '3/3', 3000), 'жизни кончились — снова 3/3', await lives());
  await sleep(300);
  const atStart = await page.evaluate(() => ({ x: Math.round(window.GAME.pl.x), d: window.GAME.deaths }));
  ok(Math.abs(atStart.x - 200) < 40 && atStart.d === 0, 'и забег заново с самого старта: чекпоинт сброшен', JSON.stringify(atStart));
  ok(await until(() => page.evaluate(() => /Out of lives/.test(document.body.innerText)), 3000), 'в журнале: «Out of lives! Back to the start.»');
  if (process.env.SHOT2) await page.screenshot({ path: process.env.SHOT2 });
  await ctx.close();

  // ---------- очки: обычная карта и 10-минутный лабиринт ----------
  console.log('очки:');
  async function run(mapName, n) {
    const s = io(B.base, { transports: ['websocket'], forceNew: true, extraHeaders: { 'CF-Connecting-IP': '10.35.' + n + '.1' } });
    await new Promise(r => s.once('connect', r));
    const name = 'rr_' + n;
    const scores = [];
    s.on('raceScores', d => scores.push(d));
    s.emit('join', { playerName: name, gameMode: 'race', room: 'rrpts' + n });
    await sleep(400);
    s.emit('raceStart', { author: OWNER, mapName });
    const t0 = Date.now();
    for (let i = 0; i < 12; i++) { s.emit('movePlayer', { position: { x: 200 + (i % 2) * 120, y: 486, w: 30, h: 74 } }); await sleep(60); }
    await sleep(6000 - (Date.now() - t0));
    s.emit('raceFinish', { author: OWNER, mapName });
    const sec = (Date.now() - t0) / 1000;
    const got = await until(() => { const l = scores[scores.length - 1]; const me = l && l.find(x => x.name === name); return me && me.score > 0 ? me.score : null; }, 4000);
    s.disconnect();
    return { score: got, sec };
  }
  const [plain, maze] = await Promise.all([run('Plain', 1), run('Maze', 2)]);
  ok(plain.score !== null && Math.abs(plain.score - (120 - plain.sec)) <= 1.5, 'обычная карта: 120 минус секунды забега', JSON.stringify(plain));
  ok(maze.score !== null && Math.abs(maze.score - 120 * (1 - maze.sec / 600)) <= 1.5 && maze.score > plain.score, 'лабиринт на 10 минут: шкала растянута — очков больше', JSON.stringify(maze));

  ok(errs.length === 0, 'ошибок скриптов нет', errs.join(' | '));
  await browser.close(); A.kill(); B.kill();
  console.log(pass + ' ok, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
