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

  // медали за время на карте (см. /owner/setMapRankTiers в maps.js) — добавка к формуле выше
  const raceTiers = [{ rank: 'S', ms: 10000 }, { rank: 'A+', ms: 15000 }, { rank: 'A', ms: 20000 }];
  ok(rk.rankForTime(raceTiers, 9000, 'min') === 'S', 'rankForTime: быстрее порога S — S');
  ok(rk.rankForTime(raceTiers, 14000, 'min') === 'A+', 'rankForTime: между S и A+ — A+');
  ok(rk.rankForTime(raceTiers, 99999, 'min') === null, 'rankForTime: медленнее всех порогов — null (не ошибка)');
  const hiderTiers = [{ rank: 'S', ms: 100000 }, { rank: 'B', ms: 50000 }];
  ok(rk.rankForTime(hiderTiers, 110000, 'max') === 'S', 'rankForTime(dir=max): дольше порога S — S');
  ok(rk.rankForTime(hiderTiers, 10000, 'max') === null, 'rankForTime(dir=max): меньше любого порога — null');
  ok(rk.rankForTime(null, 1000, 'min') === null, 'rankForTime: без лестницы (карта без медалей) — null, не падает');

  const mapsByKey = new Map([['own|m1', { race: raceTiers }]]);
  const uGoodMedal = { rcFin: 10, rcBest: { 'own|m1': 9000 } };   // S на единственной карте с лестницей
  ok(rk.medalAvgRace(uGoodMedal, mapsByKey) === rk.MEDAL_WEIGHT.S,
     'medalAvgRace: одна карта с медалью S — средняя равна весу S');
  ok(rk.medalAvgRace({ rcBest: {} }, mapsByKey) === null,
     'medalAvgRace: нет времён ни на одной карте с лестницей — null (добавка не участвует)');

  // добавка не портит оценку, когда владелец ещё НИЧЕГО не настроил —
  // raceScore/hsScore должны совпадать с версией без mapsByKey совсем
  const uRace = { rcFin: 10, rcBest: { a: 1000, b: 1000, c: 1000, d: 1000, e: 1000 } };
  const emptyField = rk.mapField([uRace, { rcBest: { a: 2000 } }, { rcBest: { a: 3000 } }]);
  const withoutMaps = rk.raceScore(uRace, emptyField);
  const withEmptyMapsByKey = rk.raceScore(uRace, emptyField, new Map());
  ok(withoutMaps === withEmptyMapsByKey,
     'raceScore: пустая mapsByKey (владелец ничего не настроил) не меняет оценку',
     withoutMaps + ' vs ' + withEmptyMapsByKey);

  /* Главная просьба, из-за которой gate переписан: медаль за КОНКРЕТНУЮ
     карту не должна ждать, пока человек набегает общий минимум
     (RACE_MIN_FIN/HS_MIN_ROUNDS) по ВСЕЙ игре — ранг это и есть медаль,
     без неё раньше было бы "нет ранга" даже с S на размеченной карте. */
  const uFewFinishes = { rcFin: 1, rcBest: { 'own|m1': 9000 } };   // меньше RACE_MIN_FIN=5
  ok(rk.raceScore(uFewFinishes, new Map(), mapsByKey) === rk.MEDAL_WEIGHT.S,
     'raceScore: мало финишей всего, но есть медаль S на размеченной карте — ранг всё равно S',
     rk.raceScore(uFewFinishes, new Map(), mapsByKey));
  ok(rk.raceScore({ rcFin: 1, rcBest: {} }, new Map(), mapsByKey) === null,
     'raceScore: мало финишей и вообще никаких медалей — честно null, не 0');

  const hsMapsByKey = new Map([['own|hsmap', { hider: [{ rank: 'A', ms: 50000 }] }]]);
  const uFewRounds = { hsHide: 1, hsMapBest: { 'own|hsmap': { hiderMs: 60000 } } };  // меньше HS_MIN_ROUNDS=6
  ok(rk.hsScore(uFewRounds, hsMapsByKey) === rk.MEDAL_WEIGHT.A,
     'hsScore: мало раундов всего, но есть медаль A на размеченной карте — ранг всё равно A',
     rk.hsScore(uFewRounds, hsMapsByKey));
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
