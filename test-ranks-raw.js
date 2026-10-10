/* Ранги (см. ranks.js) — часть A: чистые функции формулы, без сервера.
   Часть B: /owner/setRank и /getRank живьём через HTTP — ручной ранг
   владельца поверх автоматического, отказ не-владельцу, сброс обратно
   на авто, прогресс (raceProgress/hsProgress) для ещё не ранжированных.

   Часть B регистрирует "владельца" тем же приёмом, что и остальные raw-
   тесты (test-hs-zombie-infect-raw.js и т.п.): signUp именем из
   OWNER_ALIASES запрещён нарочно ("reserved") — поэтому аккаунт сначала
   заводят БЕЗ переопределения алиасов, а затем сервер перезапускают с
   OWNER_ALIASES=<то самое имя>; сессия и аккаунт лежат в одном
   data/users.json и переживают рестарт, тот же cookie в браузере/клиенте
   после рестарта уже владелец. */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

console.log('часть A — чистые функции (bandFor/raceScore/hsScore/declassified):');
(function () {
  const rk = require('./ranks.js');

  ok(rk.bandFor(0.99, 0.9) === 'S', 'высокий процентиль и пол — S');
  ok(rk.bandFor(0.99, 0.1) === 'C', 'высокий процентиль, но пол не пройден — опускается до C');
  ok(rk.bandFor(0, 0) === 'C', 'низший процентиль — C');
  ok(JSON.stringify(rk.BANDS.map(b => b.rank)) === JSON.stringify(['S', 'A+', 'A', 'B+', 'B', 'C+', 'C']),
     'ступени по порядку сверху вниз');

  ok(rk.raceScore({ rcFin: 1 }, new Map()) === null, 'меньше RACE_MIN_FIN финишей — null');
  ok(rk.hsScore({ hsHide: 1 }) === null, 'меньше HS_MIN_ROUNDS раундов — null');
  ok(rk.hsScore({ hsHide: 10, hsSurv: 10 }) === 1, 'стопроцентная выживаемость без охоты — 1');
  ok(rk.hsScore({ hsHide: 10, hsSurv: 0 }) === 0, 'нулевая выживаемость без охоты — 0');

  ok(rk.raceDeclassified({ rcTry: 20, rcFin: 0 }) === true, 'много попыток, ни одного финиша — declassified');
  ok(rk.raceDeclassified({ rcTry: 20, rcFin: 10 }) === false, 'половина попыток дошла — не declassified');
  ok(rk.hsDeclassified({ hsHide: 10, hsSurv: 0 }) === true, 'десять раундов, ни разу не выжил — declassified');
  ok(rk.hsDeclassified({ hsHide: 10, hsSurv: 5 }) === false, 'половина раундов пережита — не declassified');

  const field = rk.mapField([{ rcBest: { m1: 1000 } }, { rcBest: { m1: 2000 } }, { rcBest: { m1: 3000 } }]);
  ok(field.get('m1').length === 3, 'mapField собирает времена всех игроков по карте');
})();

console.log('\nчасть B — /owner/setRank и /getRank живьём:');
(async () => {
  const PORT = 3222;
  const BASE = 'http://127.0.0.1:' + PORT;
  const OWNER = 'ranktestowner' + Math.floor(Math.random() * 1e6);
  const TARGET = 'ranktesttarget' + Math.floor(Math.random() * 1e6);

  function startServer(extraEnv) {
    return spawn(process.execPath, ['server.js'], {
      cwd: __dirname, env: Object.assign({}, process.env, { PORT: String(PORT) }, extraEnv || {}),
      stdio: ['ignore', 'pipe', 'pipe']
    });
  }
  async function waitUp() {
    for (let i = 0; i < 50; i++) {
      try { const r = await fetch(BASE + '/'); if (r.ok) return true; } catch (e) {}
      await sleep(200);
    }
    return false;
  }
  function signUp(name, cookieJar) {
    return fetch(BASE + '/signUp', {
      method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, cookieJar.header()),
      body: JSON.stringify({ name: name, password: 'Passw0rd!x' })
    }).then(r => { cookieJar.capture(r); return r.json(); });
  }
  // мини-банка кук — raw fetch в Node не ведёт cookie jar сам, в отличие от браузера
  function jar() {
    let cookie = '';
    return {
      header() { return cookie ? { Cookie: cookie } : {}; },
      capture(r) {
        const sc = r.headers.get('set-cookie');
        if (sc) cookie = sc.split(';')[0];
      }
    };
  }
  function post(url, body, cookieJar) {
    return fetch(BASE + url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded' }, cookieJar.header()),
      body: new URLSearchParams(body).toString()
    }).then(r => r.json());
  }
  function get(url, cookieJar) {
    return fetch(BASE + url, { headers: cookieJar ? cookieJar.header() : {} }).then(r => r.json());
  }

  let child = startServer({});
  let childErr = '';
  child.stderr.on('data', d => { childErr += d.toString(); });
  try {
    ok(await waitUp(), 'тестовый сервер поднялся на ' + PORT);

    const ownerJar = jar(), targetJar = jar();
    const su1 = await signUp(OWNER, ownerJar);
    ok(su1.status === 'success', 'владелец зарегистрирован (пока без алиаса)', JSON.stringify(su1));
    const su2 = await signUp(TARGET, targetJar);
    ok(su2.status === 'success', 'цель зарегистрирована', JSON.stringify(su2));
    await sleep(700); // save() в accounts.js дебаунсит запись на диск 300мс

    // перезапуск с OWNER_ALIASES — аккаунты и сессии лежат в одном
    // data/users.json и переживают рестарт вместе с cookie
    child.kill();
    await sleep(400);
    child = startServer({ OWNER_ALIASES: OWNER });
    child.stderr.on('data', d => { childErr += d.toString(); });
    ok(await waitUp(), 'сервер поднялся заново с OWNER_ALIASES=' + OWNER);

    const whoAmI = await get('/whoAmI', ownerJar);
    ok(whoAmI.owner === true, 'владелец распознан после рестарта', JSON.stringify(whoAmI));

    const before = await get('/getRank?name=' + encodeURIComponent(TARGET), ownerJar);
    ok(before.race === null && before.hs === null, 'до переопределения — ранга нет ни там, ни там', JSON.stringify(before));
    ok(before.hsProgress && before.hsProgress.need === 6 && before.hsProgress.have === 0,
       'прогресс прятек виден даже без единого раунда', JSON.stringify(before.hsProgress));

    const denied = await post('/owner/setRank', { name: TARGET, mode: 'hs', rank: 'S' }, targetJar);
    ok(denied.status === 'error', 'не-владелец получает отказ', JSON.stringify(denied));

    const setOk = await post('/owner/setRank', { name: TARGET, mode: 'hs', rank: 'S' }, ownerJar);
    ok(setOk.status === 'success', 'владелец ставит ранг S', JSON.stringify(setOk));

    const after = await get('/getRank?name=' + encodeURIComponent(TARGET), ownerJar);
    ok(after.hs && after.hs.rank === 'S' && after.hs.manual === true,
       'ранг S стоит и помечен manual, даже без единой игры', JSON.stringify(after.hs));
    ok(after.race === null, 'race не затронут — переопределяли только hs', JSON.stringify(after.race));

    const badRank = await post('/owner/setRank', { name: TARGET, mode: 'hs', rank: 'Z' }, ownerJar);
    ok(badRank.status === 'error', 'неизвестная буква отклоняется', JSON.stringify(badRank));

    const badMode = await post('/owner/setRank', { name: TARGET, mode: 'nope', rank: 'S' }, ownerJar);
    ok(badMode.status === 'error', 'неизвестный режим отклоняется', JSON.stringify(badMode));

    const missing = await post('/owner/setRank', { name: 'нет_такого_игрока_' + Date.now(), mode: 'hs', rank: 'S' }, ownerJar);
    ok(missing.status === 'error', 'несуществующий игрок отклоняется', JSON.stringify(missing));

    const clearOk = await post('/owner/setRank', { name: TARGET, mode: 'hs', rank: '' }, ownerJar);
    ok(clearOk.status === 'success', 'владелец снимает переопределение', JSON.stringify(clearOk));

    const afterClear = await get('/getRank?name=' + encodeURIComponent(TARGET), ownerJar);
    ok(afterClear.hs === null, 'после снятия — опять как до переопределения (0 игр)', JSON.stringify(afterClear.hs));

    const pong = await get('/whoAmI', ownerJar);
    ok(!!pong, 'сервер отвечает после всего этого (не упал)');
  } catch (e) {
    console.error('FATAL', e);
    fail++;
  } finally {
    child.kill();
    await sleep(300);
    // подчистить тестовые аккаунты
    try {
      const USERS_FILE = path.join(__dirname, 'data', 'users.json');
      let db = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      delete db.users[OWNER.toLowerCase()];
      delete db.users[TARGET.toLowerCase()];
      fs.writeFileSync(USERS_FILE, JSON.stringify(db, null, 2));
    } catch (e) { /* не критично для теста — просто не подчистили */ }
  }

  console.log(fail ? ('\n' + fail + ' ошибок') : '\nвсё чисто');
  process.exit(fail ? 1 : 0);
})();
