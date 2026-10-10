/* Медали за время на карте (см. rankForTime в ranks.js) — разработчик
   задаёт лестницу порогов конкретной карте через /owner/setMapRankTiers
   (панель в owner.js), и она тут же видна всем в /getMaps/getMapsForList
   (Maps Browser) как rankTiers/myMedal. Проверяет живьём:
   - не-владелец получает отказ на попытке задать лестницу;
   - мусорная буква/не-объект отклоняются, а не портят карту тихо;
   - /owner/getMapRankTiers отдаёт ровно то, что перед этим установили;
   - честный финиш гонки (через raceStart/raceFinish, с реальным честным
     одометром — см. RACE_MIN_DIST/RACE_MIN_MOVES/raceGate) отражается в
     /getMaps как myMedal.race нужной буквы у того, кто финишировал;
   - у постороннего (не финишировавшего) игрока myMedal на той же карте
     не появляется.

   Карта сеется прямо в data/maps.json, в обход /uploadMap (как в
   test-hs-zombie-infect-raw.js) — её 100-объектный минимум тут не нужен,
   а spawn/finishline достаточно для честного прохождения гонки. */
'use strict';
const { io } = require('socket.io-client');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PORT = 3226;
const BASE = 'http://127.0.0.1:' + PORT;
const OWNER = 'rtOwner' + Math.floor(Math.random() * 1e6);
const RUNNER = 'rtRunner' + Math.floor(Math.random() * 1e6);
const BYSTANDER = 'rtByst' + Math.floor(Math.random() * 1e6);
const MAP_NAME = 'RankTiersRawTestMap';
const MAPS_FILE = path.join(__dirname, 'data', 'maps.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

function jar() {
  let cookie = '';
  return {
    header() { return cookie ? { Cookie: cookie } : {}; },
    capture(r) { const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; }
  };
}
function signUp(name, cookieJar) {
  return fetch(BASE + '/signUp', {
    method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, cookieJar.header()),
    body: JSON.stringify({ name, password: 'Passw0rd!x' })
  }).then(r => { cookieJar.capture(r); return r.json(); });
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
function connectAs(cookieJar) {
  return io(BASE, { transports: ['websocket'], forceNew: true, extraHeaders: cookieJar.header() });
}
function once(socket, event, timeoutMs) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for ' + event)), timeoutMs || 15000);
    socket.once(event, (d) => { clearTimeout(t); resolve(d); });
  });
}

function seedMap() {
  fs.mkdirSync(path.dirname(MAPS_FILE), { recursive: true });
  let maps = [];
  if (fs.existsSync(MAPS_FILE)) {
    try { maps = JSON.parse(fs.readFileSync(MAPS_FILE, 'utf8')); } catch (e) { maps = []; }
    if (!Array.isArray(maps)) maps = [];
  }
  // прямая спавн->финиш — 700px, тот же отрезок ограничивает raceGate
  const mapData = JSON.stringify({
    mode: 'race',
    objects: [
      { id: 1, type: 'spawn', x: 0, y: 900, w: 30, h: 100 },
      { id: 2, type: 'finishline', x: 700, y: 900, w: 52, h: 126 }
    ]
  });
  maps.push({
    mapName: MAP_NAME, mapType: 'race', mapData,
    author: OWNER, date: Date.now(), created: Date.now(),
    rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: []
  });
  fs.writeFileSync(MAPS_FILE, JSON.stringify(maps, null, 2));
}
function unseedMap() {
  if (!fs.existsSync(MAPS_FILE)) return;
  try {
    let maps = JSON.parse(fs.readFileSync(MAPS_FILE, 'utf8'));
    if (!Array.isArray(maps)) return;
    maps = maps.filter(m => !(m.author === OWNER && m.mapName === MAP_NAME));
    fs.writeFileSync(MAPS_FILE, JSON.stringify(maps, null, 2));
  } catch (e) { /* не критично для теста */ }
}
function cleanupUsers() {
  try {
    const db = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    [OWNER, RUNNER, BYSTANDER].forEach(n => delete db.users[n.toLowerCase()]);
    fs.writeFileSync(USERS_FILE, JSON.stringify(db, null, 2));
  } catch (e) { /* не критично для теста */ }
}

(async () => {
  seedMap();

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

  let child = startServer({});
  let childErr = '';
  child.stderr.on('data', d => { childErr += d.toString(); });

  try {
    ok(await waitUp(), 'тестовый сервер поднялся на ' + PORT);

    const ownerJar = jar(), runnerJar = jar(), bystanderJar = jar();
    const suO = await signUp(OWNER, ownerJar);
    ok(suO.status === 'success', 'владелец зарегистрирован (пока без алиаса)', JSON.stringify(suO));
    const suR = await signUp(RUNNER, runnerJar);
    ok(suR.status === 'success', 'бегун зарегистрирован', JSON.stringify(suR));
    const suB = await signUp(BYSTANDER, bystanderJar);
    ok(suB.status === 'success', 'посторонний зарегистрирован', JSON.stringify(suB));
    await sleep(700); // save() в accounts.js дебаунсит запись на диск 300мс

    child.kill();
    await sleep(400);
    child = startServer({ OWNER_ALIASES: OWNER });
    child.stderr.on('data', d => { childErr += d.toString(); });
    ok(await waitUp(), 'сервер поднялся заново с OWNER_ALIASES=' + OWNER);

    // не-владелец получает отказ
    const denied = await post('/owner/setMapRankTiers',
      { author: OWNER, mapName: MAP_NAME, tiers: JSON.stringify({ race: { S: 1 } }) }, runnerJar);
    ok(denied.status === 'error', 'не-владелец не может задать лестницу', JSON.stringify(denied));

    // мусорная буква отклоняется
    const badLetter = await post('/owner/setMapRankTiers',
      { author: OWNER, mapName: MAP_NAME, tiers: JSON.stringify({ race: { Z: 10 } }) }, ownerJar);
    ok(badLetter.status === 'error', 'неизвестная буква ранга отклоняется', JSON.stringify(badLetter));

    // владелец задаёт нормальную лестницу: S < 5с, A+ < 15с
    const setOk = await post('/owner/setMapRankTiers',
      { author: OWNER, mapName: MAP_NAME, tiers: JSON.stringify({ race: { S: 5, 'A+': 15 } }) }, ownerJar);
    ok(setOk.status === 'success', 'владелец задаёт лестницу S/A+', JSON.stringify(setOk));

    const got = await get('/owner/getMapRankTiers?author=' + encodeURIComponent(OWNER) +
      '&mapName=' + encodeURIComponent(MAP_NAME), ownerJar);
    ok(got.status === 'success' && got.mapType === 'race' &&
       Array.isArray(got.rankTiers && got.rankTiers.race) && got.rankTiers.race.length === 2,
       'getMapRankTiers отдаёт только что установленную лестницу', JSON.stringify(got));

    // честный забег: бегун финиширует быстро (меньше 5с) — должен получить S
    const runner = connectAs(runnerJar);
    await once(runner, 'connect');
    const room = 'rawranktiers' + Math.floor(Math.random() * 1e6);
    runner.emit('join', { playerName: RUNNER, gameMode: 'race', room });
    await sleep(500);

    runner.emit('raceStart', { author: OWNER, mapName: MAP_NAME });
    await sleep(200);
    // честные мелкие шаги от спавна к финишу: RACE_MIN_MOVES=8 и RACE_MIN_DIST=200
    // (здесь даже больше — gate.dist по прямой спавн-финиш 700px тоже требует запаса)
    for (let i = 1; i <= 10; i++) {
      runner.emit('movePlayer', { position: { x: i * 100, y: 900, w: 30, h: 100, color: '#111827', say: '', fin: false, hid: false } });
      await sleep(60);
    }
    await sleep(1200); // RACE_MIN_MS=1500 — финиш раньше этого честным не считается
    runner.emit('raceFinish', { author: OWNER, mapName: MAP_NAME });
    await sleep(300);

    const listAfterFinish = await get('/getMaps?mapType=race&author=' + encodeURIComponent(low(OWNER)), runnerJar);
    const rowForRunner = (listAfterFinish.maps || []).find(m => m.mapName === MAP_NAME);
    ok(!!rowForRunner && rowForRunner.myMedal && rowForRunner.myMedal.race === 'S',
       'честный быстрый финиш — бегун видит у себя медаль S', JSON.stringify(rowForRunner && rowForRunner.myMedal));

    const listForBystander = await get('/getMaps?mapType=race&author=' + encodeURIComponent(low(OWNER)), bystanderJar);
    const rowForBystander = (listForBystander.maps || []).find(m => m.mapName === MAP_NAME);
    ok(!!rowForBystander && !rowForBystander.myMedal,
       'посторонний, который не финишировал, медали не видит', JSON.stringify(rowForBystander && rowForBystander.myMedal));
    ok(!!rowForBystander && Array.isArray(rowForBystander.rankTiers && rowForBystander.rankTiers.race),
       'сама лестница порогов видна всем (не только тому, кто её прошёл)', JSON.stringify(rowForBystander && rowForBystander.rankTiers));

    runner.close();

    const pong = await fetch(BASE + '/').then(r => r.status);
    ok(pong === 200, 'сервер жив и отвечает после всего этого');
  } catch (e) {
    console.error('FATAL', e);
    fail++;
  } finally {
    child.kill();
    await sleep(300);
    unseedMap();
    cleanupUsers();
  }

  console.log(fail ? ('\n' + fail + ' ошибок') : '\nвсё чисто');
  process.exit(fail ? 1 : 0);
})();

function low(s) { return String(s || '').toLowerCase(); }
