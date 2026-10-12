/* Живой тест телепорта сикера на спавн (Task 13). Один игрок в комнате —
   рулетка всегда выбирает его искателем (100% шанс, единственный кандидат).
   Пока крутится лобби, уходим от спавна подальше, затем ждём старта охоты
   и проверяем, что игрока реально вернуло на точку старта — не просто
   что клиент так думает, а что x/y физики совпадают с тем, что было сразу
   после входа (см. respawn() в game.html). */
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3210';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pos = p => p.evaluate(() => window.GAME && window.GAME.pl ? { x: +window.GAME.pl.x.toFixed(0), y: +window.GAME.pl.y.toFixed(0) } : null);

(async () => {
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
  await sleep(8000);   // карта грузится и приземляется, анимация рулетки (~6.8с) успевает докрутиться

  const role = await p.evaluate(() => { var e = document.getElementById('gRole'); return e ? e.textContent : ''; });
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
