/* Отдельные режимы — сами по себе: режим прямо в ссылке (game?mode=war), свои карты в Map Editor (Murder
   Mystery, Team Battle, War, Party, Adventure), «Приключение» из объектов «Враг» и «Кристалл» (fromObjects в
   adventure.js), а комната режима берёт карты своего вида. Свой сервер: 3256. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const { io } = require('socket.io-client');
const ROOT = __dirname;
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(80); } return null; };

// карта «Приключения», нарисованная в редакторе: два этажа врагов, без описания adv
const floor = (y, x, w) => ({ type: 'rect', x, y, w, h: 40, fill: '#475569' });
const towerObjs = [
  floor(600, 0, 1400), floor(300, 0, 1400),
  { type: 'spawn', x: 60, y: 500, w: 30, h: 100 },
  { type: 'enemy', foe: 'slime', x: 700, y: 536, w: 40, h: 64 }, { type: 'enemy', foe: 'skeleton', x: 1000, y: 536, w: 40, h: 64 },
  { type: 'enemy', foe: 'boss', x: 800, y: 236, w: 40, h: 64 }
];

function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-kinds-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git|builtinMaps)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const now = Date.now();
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([{
    mapName: 'Editor Tower', mapType: 'adventure', author: 'kindtestowner', date: now, created: now, rating: 0, votes: {},
    boostLikes: 0, boostDislikes: 0, inGameModes: [], mapData: JSON.stringify({ mode: 'hideAndSeek', kind: 'adventure', apoc: false, gravity: 1, objects: towerObjs })
  }]));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), OWNER_ALIASES: 'kindtestowner', HS_LOBBY_MS: '5000' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}

(async () => {
  console.log('Приключение из объектов:');
  const adv = require(path.join(ROOT, 'adventure.js'));
  const q = adv.fromObjects(towerObjs);
  ok(!!q && q.kind === 'quest' && q.floors.length === 2 && q.floors[0].y === 600 && q.floors[0].enemies.length === 2 && q.floors[1].enemies[0].k === 'boss',
    'враги на двух высотах — башня из двух этажей снизу вверх, босс наверху', q && JSON.stringify(q.floors.map(f => [f.y, f.enemies.map(e => e.k).join('+')])));
  const d = adv.fromObjects(towerObjs.concat([{ type: 'crystal', x: 650, y: 480, w: 90, h: 120 }]));
  ok(!!d && d.kind === 'defense' && d.waves.length === 5 && d.ground.y === 600 && d.waves[4].length > d.waves[0].length,
    'с кристаллом — оборона: пять волн, каждая больше', d && JSON.stringify({ g: d.ground.y, w: d.waves.map(w => w.length) }));
  ok(adv.fromObjects([{ type: 'rect', x: 0, y: 0, w: 10, h: 10 }]) === null, 'без врагов — не приключение');
  const maps = require(path.join(ROOT, 'maps.js'));
  ok(['murder', 'team', 'war', 'party', 'adventure'].every(k => maps.MODES.indexOf(k) !== -1 && maps.familyOf(k) === 'hideAndSeek'),
    'сервер принимает карты пяти режимов, механика у них — прятки');

  const S = server(3256);
  process.on('exit', () => S.kill());
  if (!await until(() => fetch(S.base + '/').then(r => r.ok).catch(() => false), 20000)) throw new Error('сервер не поднялся');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bfConsent', '1'); } catch (e) {} });
  const errs = [];
  const open = async (url) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(url + ': ' + e.message.slice(0, 140))); await p.goto(S.base + url, { waitUntil: 'domcontentloaded' }); return p; };

  console.log('Режим в ссылке:');
  const vp = await open('/war');
  await until(() => vp.evaluate(() => !!document.getElementById('mdPlay')), 6000);
  await vp.click('#mdPlay');
  await vp.waitForURL(/game/, { timeout: 8000 }).catch(() => {});
  ok(/[?&]mode=war(&|$)/.test(vp.url()) && !/variant=/.test(vp.url()), 'PLAY на странице War — game?mode=war', vp.url());
  ok(/War/.test(await vp.title()), 'вкладка игры — War', await vp.title());
  ok(!!await until(async () => { const r = await fetch(S.base + '/getRoomList?mode=hideAndSeek&variant=war').then(r => r.json()); return r.rooms.some(x => /^war-\d+$/.test(x.room) && x.players > 0); }, 8000),
    'игрок попал в комнату войны war-1');
  await vp.close();
  const old = await open('/game?mode=hideAndSeek&variant=party');
  ok(!!await until(() => /[?&]mode=party(&|$)/.test(old.url()) && !/variant=/.test(old.url()), 4000), 'старая ссылка с variant= переписывается на mode=party', old.url());
  await old.close();

  console.log('Карта режима из редактора в игре:');
  // прямо по сокету, как игрок: на тестовом сайте страница игры по умолчанию играет офлайн (offline.js)
  const s = io(S.base, { transports: ['websocket'], forceNew: true });
  let advPh = null;
  s.on('hsPhase', (d) => { if (d && d.phase === 'round') advPh = d; });
  await new Promise(r => s.once('connect', r));
  s.emit('join', { playerName: 'kind_a', gameMode: 'hideAndSeek', room: 'adventure-1' });
  await until(() => advPh, 25000);
  ok(!!advPh && advPh.map && advPh.map.mapName === 'Editor Tower' && advPh.adv && advPh.adv.v === 'quest' && advPh.adv.floors === 2,
    'комната «Приключения» играет карту из редактора: башня в 2 этажа', advPh && JSON.stringify({ map: advPh.map, v: advPh.adv && advPh.adv.v, f: advPh.adv && advPh.adv.floors }));
  s.close();

  console.log('Map Editor:');
  const ed = await open('/editor.html');
  await until(() => ed.evaluate(() => document.querySelectorAll('.modeBtn').length === 7), 8000);
  const pick = async (k) => { if (!await ed.evaluate((k) => document.querySelector('.modeBtn[data-kind="' + k + '"]').offsetParent !== null, k)) await ed.click('#modeMore'); await ed.click('.modeBtn[data-kind="' + k + '"]'); await sleep(150); };
  const kinds = await ed.evaluate(() => [...document.querySelectorAll('.modeBtn')].map(b => b.dataset.kind));
  ok(kinds.join() === 'hideAndSeek,race,murder,team,war,party,adventure', 'семь режимов карты', kinds.join());
  // пять отдельных режимов — в выпадашке «More modes»: верхняя панель не залезает под инструменты
  const lay = await ed.evaluate(() => { const a = document.getElementById('modes').getBoundingClientRect(), b = document.getElementById('scene').getBoundingClientRect(); return { modesRight: Math.round(a.right), sceneLeft: Math.round(b.left) }; });
  ok(lay.modesRight <= lay.sceneLeft, 'панель режимов не залезает под панель инструментов', JSON.stringify(lay));
  const vis = (t) => ed.evaluate((t) => { const e = document.querySelector('.tool[data-tool="' + t + '"]'); return !!e && e.style.display !== 'none'; }, t);
  await pick('adventure');
  ok(await vis('enemy') && await vis('crystal'), 'в «Приключении» есть Враг и Кристалл');
  const cv = await ed.evaluate(() => { const r = document.getElementById('c').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await ed.click('.tool[data-tool="enemy"]'); await ed.mouse.click(cv.x, cv.y); await sleep(150);
  const m1 = await ed.evaluate(() => { const m = window.getEditorMap(); return { mode: m.mode, data: JSON.parse(m.data) }; });
  ok(m1.mode === 'adventure' && m1.data.kind === 'adventure' && m1.data.mode === 'hideAndSeek' && m1.data.objects.some(o => o.type === 'enemy'),
    'карта публикуется как Adventure, механика — прятки, враг на карте', JSON.stringify({ mode: m1.mode, kind: m1.data.kind }));
  await pick('war');
  const m2 = await ed.evaluate(() => { const m = window.getEditorMap(); return { mode: m.mode, n: JSON.parse(m.data).objects.filter(o => o.type === 'enemy').length }; });
  ok(m2.mode === 'war' && m2.n === 0 && !await vis('enemy') && await vis('cannon'), 'в War врагов нет (убраны с карты), а пушка есть', JSON.stringify(m2));
  ok(/War/.test(await ed.evaluate(() => document.getElementById('modeMore').textContent)), 'на кнопке выпадашки — выбранный режим');
  await pick('race');
  ok((await ed.evaluate(() => window.getEditorMap().mode)) === 'race' && await vis('checkpoint'), 'гонка — как раньше');
  await ed.close();

  ok(errs.length === 0, 'ошибок скриптов нет', errs.join(' | '));
  await browser.close();
  console.log(`\n${pass} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
