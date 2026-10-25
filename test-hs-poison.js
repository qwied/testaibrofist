/* Яд в зомби-раунде пряток (идея 2019 года «venom obstacles»): прячущийся, коснувшийся яда, сам становится
   зомби (см. onHazard в game.js, die() в game.html и hsPoisoned в server.js). В классике яд по-прежнему ничего
   не делает. Два своих сервера на копиях репозитория: 3223 — зомби-карта с ядом, 3224 — классическая. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
const OWNER = 'poisontestowner';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(80); } return null; };
const once = (s, ev, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('нет события ' + ev)), ms || 40000); s.once(ev, d => { clearTimeout(t); res(d); }); });

function server(port, apoc) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-poison-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  // точка появления над ядовитым блоком: игрок падает в яд и стоит в нём на полу
  const objects = [
    { id: 1, type: 'spawn', x: 300, y: 300, w: 30, h: 100 },
    { id: 2, type: 'rect', x: 0, y: 600, w: 1200, h: 80 },
    { id: 3, type: 'rect', x: 200, y: 450, w: 240, h: 150, deadly: true, fill: '#16a34a' }];
  if (apoc) objects.push({ id: 4, type: 'zombie', x: 900, y: 500, w: 30, h: 100 });
  const mapData = JSON.stringify({ mode: 'hideAndSeek', apoc: !!apoc, objects });
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([{ mapName: apoc ? 'PoisonZ' : 'PoisonClassic', mapType: 'hideAndSeek', mapData,
    author: OWNER, date: Date.now(), created: Date.now(), rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: [] }]));
  const proc = spawn('node', ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), OWNER_ALIASES: OWNER, HS_ROUND_MS: '20000' }, stdio: 'ignore' });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}

(async () => {
  const Z = server(3223, true), C = server(3224, false);
  process.on('exit', () => { Z.kill(); C.kill(); });
  for (const s of [Z, C]) if (!await until(() => fetch(s.base + '/').then(r => r.ok).catch(() => false), 20000)) throw new Error('сервер не поднялся');
  const mk = (base, n) => io(base, { transports: ['websocket'], forceNew: true, extraHeaders: { 'CF-Connecting-IP': '10.23.' + n + '.1' } });

  // ---------- зомби-карта: первым входит сокет (он и станет зомби), потом браузер ----------
  const room = 'poison' + Math.floor(Math.random() * 1e6);
  const a = mk(Z.base, 1);
  await once(a, 'connect');
  const infected = [];
  a.on('hsInfected', d => infected.push(d));
  const lobbyA = once(a, 'hsPhase', 15000);
  a.emit('join', { playerName: 'zed_first', gameMode: 'hideAndSeek', room });
  const lob = await lobbyA;
  ok(lob.phase === 'lobby' && lob.apoc === true, 'зомби-карта: лобби с apoc', JSON.stringify({ apoc: lob.apoc, map: lob.map && lob.map.mapName }));

  // второй сокет на классике — параллельно, чтобы не ждать два лобби подряд
  const croom = 'poisonc' + Math.floor(Math.random() * 1e6);
  const c1 = mk(C.base, 3), c2 = mk(C.base, 4);
  await Promise.all([once(c1, 'connect'), once(c2, 'connect')]);
  const cEvents = [], cPhases = [];
  c1.on('hsInfected', d => cEvents.push('infected')); c1.on('hsOut', d => cEvents.push('out'));
  c1.on('hsPhase', d => cPhases.push(d));
  c1.emit('join', { playerName: 'classic_a', gameMode: 'hideAndSeek', room: croom });
  await sleep(200);
  c2.emit('join', { playerName: 'classic_b', gameMode: 'hideAndSeek', room: croom });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'CF-Connecting-IP': '10.23.9.9' } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await page.goto(Z.base + '/game.html?mode=hideAndSeek&room=' + room, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { const x = document.getElementById('bfConsent'); if (x) x.remove(); });

  // охота: сокет a — зомби (вошёл первым), браузер — прячущийся, стоит в яде
  const roundA = await until(async () => { const d = await once(a, 'hsPhase', 40000); return d.phase === 'round' ? d : null; }, 45000);
  ok(roundA && roundA.apoc && roundA.seekerId === a.id, 'охота началась, зомби — тот, кто вошёл первым');
  const inf = await until(() => infected.find(d => d.id !== a.id), 6000);
  ok(!!inf && inf.poison === true, 'прячущийся в яде заразился сам — событие с пометкой «яд»', JSON.stringify(inf));
  const zombie = await until(() => page.evaluate(() => window.GAME.meIsZombie === true && /Zombie/.test(document.getElementById('gRole').textContent)), 4000);
  ok(!!zombie, 'у игрока в браузере роль Zombie и зомби-модель');
  const logged = await until(() => page.evaluate(() => /touched poison/i.test(document.body.innerText)), 4000);
  ok(!!logged, 'в журнале: «You touched poison and became a zombie!»');
  await sleep(1500);
  ok(infected.filter(d => d.id === (inf && inf.id)).length === 1, 'заражение одно, повторные касания яда его не повторяют', String(infected.length));

  // зомби (сокет a) шлёт касание яда — ничего не происходит
  const before = infected.length;
  a.emit('hsPoisoned');
  await sleep(800);
  ok(infected.length === before, 'уже зомби — касание яда ничего не меняет');

  // ---------- классика: яд не заражает и не выбивает ----------
  // охота на классике могла начаться, пока шла проверка зомби-карты — берём последнюю записанную
  const roundC = await until(() => { const r = cPhases.filter(d => d.phase === 'round').pop(); const last = cPhases[cPhases.length - 1]; return r && last === r ? r : null; }, 60000);
  const hider = roundC.seekerId === c1.id ? c2 : c1;
  ok(roundC && !roundC.apoc, 'классическая карта: охота без apoc');
  hider.emit('hsPoisoned');
  await sleep(1200);
  ok(cEvents.length === 0, 'в классике касание яда ничего не делает', cEvents.join(','));

  // ---------- редактор: на зомби-карте пряток галочка «Яд (заражает)» ----------
  {
    const ectx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const ep = await ectx.newPage();
    ep.on('pageerror', e => errs.push('editor: ' + e.message.slice(0, 140)));
    await ep.goto(Z.base + '/editor', { waitUntil: 'networkidle' });
    await ep.evaluate(() => { const x = document.getElementById('bfConsent'); if (x) x.remove(); });
    await ep.click('.modeBtn[data-mode="hideAndSeek"]');
    await ep.click('.tool[data-tool="rect"]');
    const cv = await ep.locator('#c').boundingBox();
    await ep.mouse.click(cv.x + cv.width / 2, cv.y + cv.height / 2);
    await ep.click('.tab[data-tab="automatic"]');
    const autoText = () => ep.evaluate(() => document.getElementById('automatic').innerText);
    ok(/only in Zombie Apocalypse/i.test(await autoText()) && !/Poison \(infects\)/.test(await autoText()), 'классика пряток: вместо галочки — подсказка про Zombie Apocalypse');
    await ep.click('.apocBtn[data-apoc="1"]');
    await ep.click('.tab[data-tab="automatic"]');
    ok(/Poison \(infects\)/.test(await autoText()), 'включили Zombie Apocalypse — сразу появилась галочка «Poison (infects)»');
    await ep.click('.apocBtn[data-apoc="0"]');
    await ep.click('.tab[data-tab="automatic"]');
    ok(!/Poison \(infects\)/.test(await autoText()), 'выключили — галочка снова скрыта');
    await ectx.close();
  }

  ok(errs.length === 0, 'ошибок скриптов нет', errs.join(' | '));
  [a, c1, c2].forEach(s => s.disconnect());
  await browser.close(); Z.kill(); C.kill();
  console.log(pass + ' ok, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
