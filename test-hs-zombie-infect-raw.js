/* Заражение зомби-ботом apoc-раунда — напрямую через сокеты, без браузера
   и без реальной физики, по тому же рецепту, что test-hs-infect-raw.js
   для обычного заражения человеком. Поднимает СВОЙ сервер на отдельном
   порту (переменная OWNER_ALIASES указывает на тестового "владельца" —
   только его карты попадают в случайную выдачу hideAndSeek, см.
   randomFor() в maps.js), засевает единственную apoc-карту с меткой
   зомби напрямую в data/maps.json (в обход /uploadMap — тестовой карте
   не нужны ни аккаунт, ни 100 объектов для публикации), и проверяет:
   - раунд на apoc-карте стартует без искателя-человека (apoc:true,
     seekerId пуст) и ровно один из подключённых получает zombieDriverAssign;
   - если ведущий отключается посреди раунда, зомби не замирает —
     zombieDriverAssign уходит кому-то ещё (см. hsZombieReassignDriver);
   - честный «подход» зомби (zombiePos пошагово, в пределах MAX_STEP) и
     zombieCatch заражают жертву ровно так же, как hsCatch у человека —
     обе стороны получают hsInfected с тем же payload;
   - сервер не падает и продолжает отвечать после всего этого. */
'use strict';
const { io } = require('socket.io-client');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PORT = 3221;
const BASE = 'http://127.0.0.1:' + PORT;
const OWNER = 'zombietestowner';
const MAP_NAME = 'ZombieRawTestMap';
const MAPS_FILE = path.join(__dirname, 'data', 'maps.json');

function connect() {
  return io(BASE, { transports: ['websocket'], forceNew: true });
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
  const mapData = JSON.stringify({
    mode: 'hideAndSeek', apoc: true, gravity: 9,
    objects: [
      { id: 1, type: 'spawn', x: 50, y: 900, w: 30, h: 100 },
      { id: 2, type: 'zombie', x: 900, y: 900, w: 30, h: 100 }
    ]
  });
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
  } catch (e) { /* не критично для теста — просто не подчистили */ }
}

(async () => {
  seedMap();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: Object.assign({}, process.env, { PORT: String(PORT), OWNER_ALIASES: OWNER }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let childErr = '';
  child.stderr.on('data', d => { childErr += d.toString(); });

  try {
    // ждём, пока сервер поднимется
    let up = false;
    for (let i = 0; i < 50 && !up; i++) {
      try { const r = await fetch(BASE + '/'); up = r.ok; } catch (e) { /* ещё не слушает */ }
      if (!up) await sleep(200);
    }
    ok(up, 'тестовый сервер поднялся на ' + PORT);
    if (!up) throw new Error('сервер не поднялся: ' + childErr.slice(0, 500));

    const room = 'rawzombie' + Math.floor(Math.random() * 1e6);
    const a = connect(), b = connect(), c = connect();
    const socks = { a, b, c };
    await Promise.all([once(a, 'connect'), once(b, 'connect'), once(c, 'connect')]);

    // слушаем zombieDriverAssign на всех троих ДО join — событие уходит
    // только выбранному, но мы не знаем заранее, кого выберут
    const driverWaiters = {};
    Object.keys(socks).forEach(k => {
      driverWaiters[k] = once(socks[k], 'zombieDriverAssign', 40000).then(d => ({ k, d })).catch(() => null);
    });

    // первый hsPhase после join — это 'lobby' (стартует сразу), раунд
    // придёт вторым, через HS_LOBBY_MS — ждём оба по очереди
    const lobbyA = once(a, 'hsPhase', 10000);
    a.emit('join', { playerName: 'zr_a_' + Math.floor(Math.random()*1e6), gameMode: 'hideAndSeek', room });
    await sleep(200);
    b.emit('join', { playerName: 'zr_b_' + Math.floor(Math.random()*1e6), gameMode: 'hideAndSeek', room });
    await sleep(200);
    c.emit('join', { playerName: 'zr_c_' + Math.floor(Math.random()*1e6), gameMode: 'hideAndSeek', room });

    const phLobby = await lobbyA;
    ok(phLobby.phase === 'lobby' && phLobby.apoc === true, 'apoc определилась уже в лобби', JSON.stringify(phLobby));
    const roundA = once(a, 'hsPhase', 40000);
    const phA = await roundA;
    ok(phA.phase === 'round' && phA.apoc === true, 'apoc-карта стартует раунд без рулетки, phase=round apoc=true', JSON.stringify(phA));
    ok(!phA.seekerId, 'у apoc-раунда нет искателя-человека', JSON.stringify(phA.seekerId));

    const firstDriver = (await Promise.race([driverWaiters.a, driverWaiters.b, driverWaiters.c,
      sleep(5000).then(() => null)]));
    ok(!!firstDriver, 'ровно кто-то получил zombieDriverAssign', JSON.stringify(firstDriver && firstDriver.d));

    if (!firstDriver) throw new Error('никто не стал ведущим зомби — дальше тест бессмыслен');

    // --- переизбрание ведущего при отключении ---
    const remaining = Object.keys(socks).filter(k => k !== firstDriver.k);
    const reassignWaiters = {};
    remaining.forEach(k => {
      reassignWaiters[k] = once(socks[k], 'zombieDriverAssign', 10000).then(d => ({ k, d })).catch(() => null);
    });
    socks[firstDriver.k].close();
    const reassigned = await Promise.race([...remaining.map(k => reassignWaiters[k]), sleep(8000).then(() => null)]);
    ok(!!reassigned && remaining.indexOf(reassigned.k) !== -1,
       'ведущий отключился — зомби передали кому-то из оставшихся', JSON.stringify(reassigned));

    if (!reassigned) throw new Error('переизбрания не случилось — дальше тест бессмыслен');

    const driverKey = reassigned.k;
    const targetKey = remaining.find(k => k !== driverKey);
    const driver = socks[driverKey], target = socks[targetKey];
    const targetId = target.id;
    console.log('  firstDriver=' + firstDriver.k + ' reassignedTo=' + driverKey + ' target=' + targetKey);

    // жертва вдалеке от спавна зомби — иначе зомби "стоит прямо на ней" с
    // первого же кадра, одометр не набирается, и zombieCatch честно
    // отклоняется тем же анти-телепорт правилом, что и у искателя-человека
    target.emit('movePlayer', { position: { x: 1400, y: 900, w: 30, h: 100, color: '#111827', say: '', fin: false, hid: false } });
    await sleep(80);

    // зомби честно идёт к жертве мелкими шагами (как искатель в test-hs-infect-raw.js),
    // затем один некрупный финальный шаг вплотную — набирает одометр и остаётся честным
    let zx = reassigned.d.x;
    const zombieStateSeen = once(target, 'zombieState', 5000).catch(() => null);
    for (let i = 0; i < 6; i++) {
      zx += (1400 - zx) / 3;
      driver.emit('zombiePos', { x: Math.round(zx), y: 900 });
      await sleep(40);
    }
    const zs = await zombieStateSeen;
    ok(!!zs, 'позицию зомби от ведущего разослало остальным через zombieState', JSON.stringify(zs));
    driver.emit('zombiePos', { x: 1395, y: 900 });
    await sleep(60);

    const infectedOnDriver = once(driver, 'hsInfected', 5000).catch(() => null);
    const infectedOnTarget = once(target, 'hsInfected', 5000).catch(() => null);
    driver.emit('zombieCatch', { targetId });
    const [evDriver, evTarget] = await Promise.all([infectedOnDriver, infectedOnTarget]);
    ok(!!evDriver && evDriver.id === targetId, 'ведущий зомби получил hsInfected с правильным id', JSON.stringify(evDriver));
    ok(!!evTarget && evTarget.id === targetId, 'заражённый тоже получил hsInfected', JSON.stringify(evTarget));

    const pong = once(driver, 'pongCheck', 5000);
    driver.emit('pingCheck', Date.now());
    ok((await pong) !== undefined, 'сервер отвечает после всего этого (не упал)');

    a.close(); b.close(); c.close();
  } catch (e) {
    console.error('FATAL', e);
    fail++;
  } finally {
    child.kill();
    await sleep(300);
    unseedMap();
  }

  console.log(fail ? ('\n' + fail + ' ошибок') : '\nвсё чисто');
  process.exit(fail ? 1 : 0);
})();
