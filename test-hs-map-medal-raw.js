/* Медали за время на карте в Hide and Seek (см. hsCreditMapBest в
   server.js, добавка к ranks.js) — живой тест на реальных аккаунтах
   (не гостях, как в test-hs-caught-abuse-raw.js: hsStat там никогда не
   сработал бы без account). Три игрока на одной карте, один раунд:
   - хайдер1 пойман вскоре после начала раунда — ждём hiderMs МЕНЬШЕ
     полной длины раунда (см. hsDoInfect);
   - хайдер2 не пойман вообще, доживает до естественного конца раунда —
     ждём hiderMs РОВНО HS_ROUND_MS (см. hsAwardRoundEnd);
   - искатель поймал не всех (хайдер2 выжил) — раунд не зачищен целиком,
     поэтому у искателя НЕ должно быть seekerMs вовсе (медаль за скорость
     зачистки даётся только за полную зачистку, см. hsDoInfect). */
'use strict';
const { io } = require('socket.io-client');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const low = s => String(s || '').toLowerCase();

const PORT = 3229;
const BASE = 'http://127.0.0.1:' + PORT;
const OWNER = 'hsMedalOwner' + Math.floor(Math.random() * 1e6);
const SEEKER = 'hsMedalSeek' + Math.floor(Math.random() * 1e5);
const HIDER1 = 'hsMedalH1' + Math.floor(Math.random() * 1e5);
const HIDER2 = 'hsMedalH2' + Math.floor(Math.random() * 1e5);
const MAP_NAME = 'HsMedalRawTestMap';
const MAPS_FILE = path.join(__dirname, 'data', 'maps.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const HS_ROUND_MS = 4000;

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
function connectAs(cookieJar) {
  return io(BASE, { forceNew: true, extraHeaders: cookieJar.header() });
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
  const mapData = JSON.stringify({ mode: 'hideAndSeek', objects: [{ id: 1, type: 'spawn', x: 50, y: 900, w: 30, h: 100 }] });
  maps.push({
    mapName: MAP_NAME, mapType: 'hideAndSeek', mapData,
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
  } catch (e) { /* не критично */ }
}
function cleanupUsers() {
  try {
    const db = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    [OWNER, SEEKER, HIDER1, HIDER2].forEach(n => delete db.users[n.toLowerCase()]);
    fs.writeFileSync(USERS_FILE, JSON.stringify(db, null, 2));
  } catch (e) { /* не критично */ }
}

(async () => {
  seedMap();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: Object.assign({}, process.env, { PORT: String(PORT), OWNER_ALIASES: OWNER, HS_ROUND_MS: String(HS_ROUND_MS) }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let childErr = '';
  child.stderr.on('data', d => { childErr += d.toString(); });

  try {
    let up = false;
    for (let i = 0; i < 50 && !up; i++) {
      try { const r = await fetch(BASE + '/'); up = r.ok; } catch (e) {}
      if (!up) await sleep(200);
    }
    ok(up, 'тестовый сервер поднялся на ' + PORT);
    if (!up) throw new Error('сервер не поднялся: ' + childErr.slice(0, 500));

    const seekerJar = jar(), h1Jar = jar(), h2Jar = jar();
    const su1 = await signUp(SEEKER, seekerJar), su2 = await signUp(HIDER1, h1Jar), su3 = await signUp(HIDER2, h2Jar);
    ok(su1.status === 'success' && su2.status === 'success' && su3.status === 'success',
       'все три аккаунта зарегистрированы', JSON.stringify([su1.status, su2.status, su3.status]));

    const room = 'rawhsmedal' + Math.floor(Math.random() * 1e6);
    const seeker = connectAs(seekerJar), h1 = connectAs(h1Jar), h2 = connectAs(h2Jar);
    await Promise.all([once(seeker, 'connect'), once(h1, 'connect'), once(h2, 'connect')]);

    const lobbySeeker = once(seeker, 'hsPhase', 10000);
    seeker.emit('join', { playerName: SEEKER, gameMode: 'hideAndSeek', room });
    await sleep(150);
    h1.emit('join', { playerName: HIDER1, gameMode: 'hideAndSeek', room });
    await sleep(150);
    h2.emit('join', { playerName: HIDER2, gameMode: 'hideAndSeek', room });

    const phLobby = await lobbySeeker;
    ok(phLobby.phase === 'lobby', 'лобби стартовало', JSON.stringify(phLobby));

    const roundSeeker = once(seeker, 'hsPhase', 40000);
    const phRound = await roundSeeker;
    ok(phRound.phase === 'round' && !!phRound.seekerId, 'раунд стартовал с сикером', JSON.stringify(phRound));

    const socks = { [seeker.id]: SEEKER, [h1.id]: HIDER1, [h2.id]: HIDER2 };
    ok(socks[phRound.seekerId] === SEEKER, 'сикером выбран ожидаемый игрок (единственный не-хайдер в тесте)', phRound.seekerId);

    // искатель честно подходит ТОЛЬКО к хайдеру1 и ловит его быстро; хайдера2
    // не ловим вообще, но честно двигаем (HS_MIN_DIST=200) — иначе выживание
    // не засчитывается вовсе, ни монетами, ни медалью (anti-AFK, см. hsAwardRoundEnd)
    h1.emit('movePlayer', { position: { x: 900, y: 900, w: 20, h: 60, color: '#111827', say: '', fin: false, hid: false } });
    for (let i = 1; i <= 3; i++) {
      h2.emit('movePlayer', { position: { x: 50 + i * 100, y: 900, w: 20, h: 60, color: '#111827', say: '', fin: false, hid: false } });
      await sleep(40);
    }
    await sleep(60);
    let sx = 0;
    for (let i = 0; i < 5; i++) {
      sx += 150;
      seeker.emit('movePlayer', { position: { x: sx, y: 900, w: 20, h: 60, color: '#111827', say: '', fin: false, hid: false } });
      await sleep(40);
    }
    seeker.emit('movePlayer', { position: { x: 895, y: 900, w: 20, h: 60, color: '#111827', say: '', fin: false, hid: false } });
    await sleep(60);
    const infectedOnH1 = once(h1, 'hsInfected', 5000).catch(() => null);
    seeker.emit('hsCatch', { targetId: h1.id });
    const evH1 = await infectedOnH1;
    ok(!!evH1 && evH1.id === h1.id, 'хайдер1 пойман', JSON.stringify(evH1));

    // ждём, пока раунд закончится САМ (хайдер2 не пойман — не зачистка, таймер решает)
    const lobbyAgain = once(seeker, 'hsPhase', HS_ROUND_MS + 15000).catch(() => null);
    const phEnd = await lobbyAgain;
    ok(!!phEnd && phEnd.phase === 'lobby', 'раунд закончился по таймеру (хайдер2 выжил)', JSON.stringify(phEnd));
    await sleep(500); // accountsRef.save() дебаунсит запись на диск 300мс

    const udb = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const mapKey = low(OWNER) + '|' + low(MAP_NAME);
    // ключ мог сохраниться с исходным регистром автора/карты — ищем нечувствительно к регистру
    function mapBestOf(u) {
      if (!u || !u.hsMapBest) return null;
      const k = Object.keys(u.hsMapBest).find(k => low(k) === mapKey);
      return k ? u.hsMapBest[k] : null;
    }
    const uH1 = udb.users[low(HIDER1)], uH2 = udb.users[low(HIDER2)], uSeeker = udb.users[low(SEEKER)];
    const mbH1 = mapBestOf(uH1), mbH2 = mapBestOf(uH2), mbSeeker = mapBestOf(uSeeker);

    ok(!!mbH1 && mbH1.hiderMs > 0 && mbH1.hiderMs < HS_ROUND_MS,
       'пойманный хайдер1: hiderMs записан и меньше полной длины раунда', JSON.stringify(mbH1));
    ok(!!mbH2 && mbH2.hiderMs === HS_ROUND_MS,
       'выживший хайдер2: hiderMs равен полной длине раунда', JSON.stringify(mbH2));
    ok(!mbSeeker || mbSeeker.seekerMs === undefined,
       'искатель не зачистил карту целиком — seekerMs НЕ записан', JSON.stringify(mbSeeker));

    // раунд 2 — с единственной картой в пуле она же и выпадет снова (см.
    // randomFor). На этот раз ловим ОБОИХ хайдеров — полная зачистка должна
    // дать искателю seekerMs (см. hsDoInfect: только за реальный !stillHiding)
    const round2 = once(seeker, 'hsPhase', 40000);
    const ph2 = await round2;
    ok(ph2.phase === 'round', 'раунд 2 стартовал', JSON.stringify(ph2));
    const seeker2Id = ph2.seekerId;
    const seekerSock2 = socks[seeker2Id] === SEEKER ? seeker : (socks[seeker2Id] === HIDER1 ? h1 : h2);
    const others = [[h1, HIDER1], [h2, HIDER2], [seeker, SEEKER]].filter(([s]) => s !== seekerSock2);

    for (const [hiderSock] of others) {
      hiderSock.emit('movePlayer', { position: { x: 900, y: 900, w: 20, h: 60, color: '#111827', say: '', fin: false, hid: false } });
      await sleep(50);
      let sx2 = 0;
      for (let i = 0; i < 5; i++) {
        sx2 += 150;
        seekerSock2.emit('movePlayer', { position: { x: sx2, y: 900, w: 20, h: 60, color: '#111827', say: '', fin: false, hid: false } });
        await sleep(40);
      }
      seekerSock2.emit('movePlayer', { position: { x: 895, y: 900, w: 20, h: 60, color: '#111827', say: '', fin: false, hid: false } });
      await sleep(60);
      const infected = once(hiderSock, 'hsInfected', 5000).catch(() => null);
      seekerSock2.emit('hsCatch', { targetId: hiderSock.id });
      await infected;
    }
    await sleep(500);

    const udb2 = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const nameOfSock = seekerSock2 === seeker ? SEEKER : (seekerSock2 === h1 ? HIDER1 : HIDER2);
    const mbSeeker2 = mapBestOf(udb2.users[low(nameOfSock)]);
    ok(!!mbSeeker2 && mbSeeker2.seekerMs > 0,
       'раунд 2: полная зачистка — у искателя записан seekerMs', JSON.stringify(mbSeeker2));

    const pong = await fetch(BASE + '/').then(r => r.status);
    ok(pong === 200, 'сервер жив и отвечает после всего этого');

    seeker.close(); h1.close(); h2.close();
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
