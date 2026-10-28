/* Гонка-«шпион» (идея 2019 года «Spy mode», см. spyTick в game.html/editor.html): камера смотрит
   конусом и качается, стены и полка закрывают ей обзор; кто у неё на виду — назад на чекпоинт; флаг
   шпиона: без него финиш не засчитан, с ним — засчитан; умер с флагом — флаг вернулся на место,
   а донёс до чекпоинта — сохранён; ядовитый лазер выбивает. Проверяем в игре редактора на встроенной
   карте «Spy Base» (builtinMaps/spybase.json), её подбор сервером и подсказки в игре. Свой сервер: 3250. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
const SHOTS = process.env.SHOTS_DIR || '';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(60); } return null; };

function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-spy-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), OWNER_ALIASES: 'spytestowner' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}

(async () => {
  const S = server(3250);
  process.on('exit', () => S.kill());
  if (!await until(() => fetch(S.base + '/').then(r => r.ok).catch(() => false), 20000)) throw new Error('сервер не поднялся');

  console.log('Карта:');
  const m = await fetch(S.base + '/getRandomMap?mapType=race').then(r => r.json());
  const data = m && JSON.parse(m.mapData);
  const objs = data ? data.objects : [];
  ok(!!m && m.mapName === 'Spy Base', 'встроенная «Spy Base» — в подборе карт гонки', m && m.mapName);
  ok(objs.filter(o => o.type === 'camera').length === 3 && objs.filter(o => o.type === 'spyFlag').length === 1 && objs.some(o => o.type === 'camera' && o.hidden),
    'три камеры (одна скрытая) и флаг шпиона');
  const hsRnd = await fetch(S.base + '/getRandomMap?mapType=hideAndSeek').then(r => r.json());
  ok(!hsRnd || hsRnd.mapName !== 'Spy Base', 'в прятки она не попадает');

  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bfConsent', '1'); } catch (e) {} });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  await page.goto(S.base + '/editor.html', { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !!(window.GAME && GAME.loadMap)), 8000);

  console.log('Редактор:');
  await page.click('.modeBtn[data-mode="race"]');
  const tools = await page.evaluate(() => ['camera', 'spyFlag', 'cannon'].map(t => { const e = document.querySelector('.tool[data-tool="' + t + '"]'); return e ? e.style.display : 'none'; }));
  ok(tools[0] === 'flex' && tools[1] === 'flex' && tools[2] === 'none', 'в гонке есть камера и флаг шпиона (пушки нет)', tools.join());
  const cv = await page.evaluate(() => { const r = document.getElementById('c').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  for (const [t, dx] of [['camera', -200], ['spyFlag', 0], ['spyFlag', 160]]) {
    await page.click('.tool[data-tool="' + t + '"]');
    await page.mouse.click(cv.x + dx, cv.y);
    await sleep(120);
  }
  const placed = await page.evaluate(() => JSON.parse(window.getEditorMap().data).objects.filter(o => o.type === 'camera' || o.type === 'spyFlag'));
  const cam = placed.find(o => o.type === 'camera');
  ok(!!cam && cam.w === 36 && cam.h === 26 && placed.filter(o => o.type === 'spyFlag').length === 1, 'камера своего размера, флаг на карте один', JSON.stringify(placed.map(o => o.type + ':' + o.w + 'x' + o.h)));
  await page.click('.tool[data-tool="camera"]'); await page.mouse.click(cv.x - 400, cv.y); await sleep(150);
  const insp = await page.evaluate(() => document.body.innerText);
  ok(/Sweep, degrees/.test(insp) && /View range/.test(insp) && /Hidden camera/.test(insp), 'у камеры — прицел, поворот, дальность и «скрытая»');

  console.log('Игра на «Spy Base»:');
  await page.evaluate((json) => { GAME.loadMap(json); GAME.play(); }, m.mapData);
  await until(() => page.evaluate(() => GAME.playing), 4000);
  const at = (x, y) => page.evaluate(([x, y]) => { const p = GAME.pl; p.x = x; p.y = y; p.vx = 0; p.vy = 0; }, [x, y]);
  const msg = () => page.evaluate(() => { const e = document.getElementById('msg'); return e && e.style.display !== 'none' ? document.getElementById('msgS').textContent : ''; });
  // 1) под полкой камера зала не видит, на открытом полу — видит (неуязвимость, чтобы смотреть подольше)
  await page.evaluate(() => { GAME.godMode = true; });
  let seenShelf = false, seenOpen = false;
  for (let t = Date.now(); Date.now() - t < 4600;) { await at(875, 600); await sleep(40); if ((await page.evaluate(() => GAME.cams[0].sees))) seenShelf = true; }
  for (let t = Date.now(); Date.now() - t < 4600 && !seenOpen;) { await at(560, 600); await sleep(40); if ((await page.evaluate(() => GAME.cams[0].sees))) seenOpen = true; }
  ok(!seenShelf, 'под полкой камера не видит — полка закрывает обзор');
  ok(seenOpen, 'на открытом полу камера замечает');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'spy-hall.png') });
  // 2) без неуязвимости — камера возвращает на старт
  await page.evaluate(() => { GAME.godMode = false; });
  const d0 = await page.evaluate(() => GAME.deaths);
  let caught = false;
  for (let t = Date.now(); Date.now() - t < 5000 && !caught;) { await at(560, 600); await sleep(40); caught = (await page.evaluate(() => GAME.deaths)) > d0; }
  ok(caught && /camera spotted/i.test(await msg()), 'заметила камера — смерть и подсказка', await msg());
  await sleep(900);
  // дальше проверяем флаг, а не камеры: скрытая камера хранилища смотрит в потолок, иначе телепорт к флагу
  // она замечает раньше, чем флаг успевают проверить
  await page.evaluate(() => { GAME.objects.filter(o => o.type === 'camera' && o.hidden).forEach(o => { o.aim = -90; o.sweep = 0; o.range = 100; }); });
  // 3) финиш без флага не засчитан
  await at(3470, 600); await sleep(400);
  ok(!(await page.evaluate(() => GAME.done)) && /spy flag first/i.test(await msg()), 'финиш без флага — не засчитан, подсказка', await msg());
  // 4) взял флаг
  await at(2352, 600); await sleep(250);
  ok(await page.evaluate(() => GAME.spyFlag) && /have the flag/i.test(await msg()), 'коснулся флага — несёшь его');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'spy-flag.png') });
  // 5) умер с флагом, не сохранив, — флаг вернулся на место
  await at(2780, 700); await sleep(1600);
  ok(!(await page.evaluate(() => GAME.spyFlag)) && /went back/i.test(await msg()), 'умер с флагом — флаг вернулся на место', await msg());
  // 6) флаг на чекпоинте сохранён: после смерти он остаётся у игрока, игрок — у этого чекпоинта
  await at(2352, 600); await sleep(250);
  await at(2525, 600); await sleep(300);
  ok(/saved at the checkpoint/i.test(await msg()), 'донёс до чекпоинта — флаг сохранён');
  await at(2780, 700); await sleep(1600);
  const back = await page.evaluate(() => ({ f: GAME.spyFlag, x: Math.round(GAME.pl.x) }));
  ok(back.f && Math.abs(back.x - 2520) < 40, 'после смерти — у чекпоинта и с флагом', JSON.stringify(back));
  // 6б) коридор лазеров честно проходим с клавиатуры: разбег, прыжок через низкий луч, под высоким — без прыжка
  const crossed = await page.evaluate(async () => {
    const sl = (ms) => new Promise(r => setTimeout(r, ms));
    const p = GAME.pl, k = GAME.keys, d0 = GAME.deaths;
    p.x = 1380; p.y = 600; p.vx = 0; p.vy = 0;
    await sl(300);
    k.r = true;
    while (p.x < 1405) await sl(5);
    k.u = true; await sl(120); k.u = false;
    const t = Date.now();
    while (p.x < 2000 && Date.now() - t < 4000) await sl(16);
    k.r = false;
    return { x: Math.round(p.x), died: GAME.deaths - d0 };
  });
  ok(crossed.x >= 2000 && crossed.died === 0, 'коридор лазеров проходим: прыжок через низкий луч, под высоким — пешком', JSON.stringify(crossed));
  // 7) ядовитый лазер (низкий луч) выбивает
  const d1 = await page.evaluate(() => GAME.deaths);
  await at(1540, 600); await sleep(300);
  ok((await page.evaluate(() => GAME.deaths)) > d1, 'ядовитый лазер выбивает');
  await sleep(1300);
  // 8) с флагом финиш засчитан
  await page.evaluate(() => { GAME.godMode = true; });
  await at(3470, 600); await sleep(400);
  ok(await page.evaluate(() => GAME.done), 'с флагом финиш засчитан');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'spy-finish.png') });

  console.log('Подсказки в игре:');
  const g = await ctx.newPage();
  g.on('pageerror', e => errs.push('game: ' + e.message.slice(0, 160)));
  await g.goto(S.base + '/game.html?mode=race&room=spy' + Math.floor(Math.random() * 1e6), { waitUntil: 'domcontentloaded' });
  await until(() => g.evaluate(() => !!(window.GAME && typeof GAME.onSpy === 'function')), 8000);
  await g.evaluate(() => GAME.onSpy('flag'));
  ok(!!await until(() => g.evaluate(() => /have the flag/i.test((document.getElementById('gLog') || {}).textContent || '')), 2000), 'в игре подсказка — короткое сообщение, а не табличка');
  ok(errs.length === 0, 'ошибок скриптов нет', errs.join(' | '));
  await browser.close();
  console.log(`\n${pass} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
