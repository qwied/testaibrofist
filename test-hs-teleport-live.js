/* Живой тест телепорта сикера на спавн (Task 13). Один игрок в комнате —
   рулетка всегда выбирает его искателем (100% шанс, единственный кандидат).
   Пока крутится лобби, уходим от спавна подальше, затем ждём старта охоты
   и проверяем, что игрока реально вернуло на точку старта — не просто
   что клиент так думает, а что x/y физики совпадают с тем, что было сразу
   после входа (см. respawn() в game.html). */
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
/* Свой сервер со своей картой: прятки играются только на картах владельца
   (см. randomFor в maps.js), и на общем тестовом сервере такой карты может
   не оказаться — тогда раунд не начинается вовсе и проверять нечего. */
const PORT = 3232;
const BASE = 'http://127.0.0.1:' + PORT;
const OWNER = 'tpOwner' + Math.floor(Math.random() * 1e6);
const MAP_NAME = 'TpLiveTestMap';
const MAPS_FILE = path.join(__dirname, 'data', 'maps.json');
function readMaps() {
  try { const m = JSON.parse(fs.readFileSync(MAPS_FILE, 'utf8')); return Array.isArray(m) ? m : []; } catch (e) { return []; }
}
function seedMap() {
  fs.mkdirSync(path.dirname(MAPS_FILE), { recursive: true });
  const maps = readMaps();
  const mapData = JSON.stringify({ mode: 'hideAndSeek', objects: [
    { id: 1, type: 'rect', x: -200, y: 1000, w: 3000, h: 80, rot: 0 },
    { id: 2, type: 'spawn', x: 200, y: 900, w: 30, h: 100, rot: 0 }] });
  maps.push({ mapName: MAP_NAME, mapType: 'hideAndSeek', mapData, author: OWNER, date: Date.now(), created: Date.now(),
              rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: [] });
  fs.writeFileSync(MAPS_FILE, JSON.stringify(maps, null, 2));
}
function unseedMap() {
  try { fs.writeFileSync(MAPS_FILE, JSON.stringify(readMaps().filter(m => !(m.author === OWNER && m.mapName === MAP_NAME)), null, 2)); }
  catch (e) { /* не критично */ }
}
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pos = p => p.evaluate(() => window.GAME && window.GAME.pl ? { x: +window.GAME.pl.x.toFixed(0), y: +window.GAME.pl.y.toFixed(0) } : null);

(async () => {
  seedMap();
  const server = spawn(process.execPath, ['server.js'], {
    cwd: __dirname, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(PORT), PASSWORD_AUTH: '1', OWNER_ALIASES: OWNER })
  });
  const stop = () => { try { server.kill(); } catch (e) {} unseedMap(); };
  process.on('exit', stop);
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/')).ok) break; } catch (e) {} await sleep(200); }
  const b = await chromium.launch();
  const room = 'tp' + Math.floor(Math.random() * 1e6);
  const errs = [];
  const ip = '10.' + (1 + Math.floor(Math.random() * 250)) + '.40.40';
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { 'CF-Connecting-IP': ip } });
  ctx.on('page', p => p.on('pageerror', e => errs.push(e.message)));
  const p = await ctx.newPage();
  const name = 'tp' + Math.floor(Math.random() * 1e6);
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.evaluate(() => { const c = document.getElementById('bfConsent'); if (c) c.remove(); });
  await p.evaluate(async n => {
    await fetch('/signUp', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: n, password: 'Passw0rd!x' }), credentials: 'same-origin' });
  }, name);
  await p.goto(BASE + '/game.html?mode=hideAndSeek&room=' + room, { waitUntil: 'networkidle' });
  /* Рулетка крутится ~6.8с с момента входа в комнату, а роль игроку
     ставится, только когда она докрутилась, — ждём её до 15с, а не
     фиксированные 8с впритык (вход в комнату сам занимает пару секунд). */
  let role = '';
  for (let t = 0; t < 30; t++) {
    await sleep(500);
    role = await p.evaluate(() => { var e = document.getElementById('gRole'); return e ? e.textContent : ''; });
    if (/Искатель|Seeker/i.test(role || '')) break;
  }
  await sleep(500);   // приземлился и стоит на спавне
  ok(/Искатель|Seeker/i.test(role || ''), 'единственный игрок в комнате — рулетка сделала его искателем', role);

  const spawnPos = await pos(p);
  console.log('  позиция на спавне:', JSON.stringify(spawnPos));

  // уходим от спавна во время подготовки (лобби)
  await p.keyboard.down('ArrowRight');
  await sleep(2000);
  await p.keyboard.up('ArrowRight');
  const moved = await pos(p);
  console.log('  позиция после ухода от спавна:', JSON.stringify(moved));
  ok(spawnPos && moved && Math.abs(moved.x - spawnPos.x) > 50, 'реально отошли от спавна перед проверкой', JSON.stringify(moved));

  // ждём конца лобби (30с) и старта охоты — проверяем позицию каждую секунду
  let restoredAt = -1, lastPos = moved;
  for (let t = 0; t < 30; t++) {
    await sleep(1000);
    lastPos = await pos(p);
    if (spawnPos && lastPos && Math.abs(lastPos.x - spawnPos.x) < 5 && Math.abs(lastPos.y - spawnPos.y) < 5) { restoredAt = t; break; }
  }
  console.log('  финальная позиция:', JSON.stringify(lastPos), restoredAt >= 0 ? ('(восстановлено на ' + restoredAt + 'с)') : '');

  ok(restoredAt >= 0, 'сикера телепортировало обратно на спавн к началу охоты',
      'spawn=' + JSON.stringify(spawnPos) + ' final=' + JSON.stringify(lastPos));

  ok(errs.length === 0, 'без ошибок в консоли', errs[0] || '');

  await b.close();
  console.log(fail ? ('\n' + fail + ' ошибок') : '\nвсё чисто');
  process.exit(fail ? 1 : 0);
})();
