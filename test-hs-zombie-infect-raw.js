/* Apoc-раунд с человеком-зомби — напрямую через сокеты, без браузера и без
   реальной физики, по тому же рецепту, что test-hs-infect-raw.js для
   обычного заражения. Раньше здесь был AI-NPC зомби (zombieDriverAssign/
   zombiePos/zombieCatch) — его заменил "пациент ноль": apoc-раунд выбирает
   обычного человека-охотника той же рулеткой, что и классика (см. hsSpin/
   hsStartRound в server.js), только он выглядит зомби на экране у всех
   (см. hsApocRound в game.js) и ловит через тот же hsCatch, что и человек-
   искатель. Проверяем:
   - apoc-раунд стартует С искателем (seekerId не пуст, apoc:true) —
     рулетка (hsRoulette) разослана с apoc:true, а не пропущена вовсе;
   - "пациент ноль" честно ловит жертву через hsCatch — обе стороны
     получают hsInfected, как в классике;
   - заражённый тоже теперь охотник: он сам честно ловит третьего игрока
     через hsCatch, и это снова даёт hsInfected обеим сторонам — цепь
     заражения продолжается дальше первой поимки;
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
// честный "подход" мелкими шагами до упора, потом один НЕ-телепорт шаг
// вплотную — тот же приём, что в test-hs-infect-raw.js, набирает одометр
async function walkUpTo(socket, fromX, toX, y, w, h) {
  let x = fromX;
  for (let i = 0; i < 5; i++) {
    x += (toX - x) / 2;
    socket.emit('movePlayer', { position: { x, y, w, h, color: '#111827', say: '', fin: false, hid: false } });
    await sleep(40);
  }
  socket.emit('movePlayer', { position: { x: toX, y, w, h, color: '#111827', say: '', fin: false, hid: false } });
  await sleep(60);
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

    const rouletteA = once(a, 'hsRoulette', 15000);
    a.emit('join', { playerName: 'zr_a_' + Math.floor(Math.random()*1e6), gameMode: 'hideAndSeek', room });
    await sleep(200);
    b.emit('join', { playerName: 'zr_b_' + Math.floor(Math.random()*1e6), gameMode: 'hideAndSeek', room });
    await sleep(200);
    c.emit('join', { playerName: 'zr_c_' + Math.floor(Math.random()*1e6), gameMode: 'hideAndSeek', room });

    const rA = await rouletteA;
    ok(rA.apoc === true, 'apoc-карта крутит ту же рулетку, что и классика, с apoc:true', JSON.stringify(rA.apoc));

    const roundA = once(a, 'hsPhase', 40000);
    const phA = await roundA;
    ok(phA.phase === 'round' && phA.apoc === true, 'apoc-раунд стартовал, phase=round apoc=true', JSON.stringify(phA));
    ok(!!phA.seekerId, 'у apoc-раунда есть охотник-человек ("пациент ноль"), а не пустой seekerId', JSON.stringify(phA.seekerId));

    const patientZeroId = phA.seekerId;
    const patientZero = socks.a.id === patientZeroId ? a : (socks.b.id === patientZeroId ? b : c);
    const others = [a, b, c].filter(s => s.id !== patientZeroId);
    const victim1 = others[0], victim2 = others[1];
    console.log('  patientZero=' + patientZeroId + ' victim1=' + victim1.id + ' victim2=' + victim2.id);

    // --- первая поимка: "пациент ноль" ловит victim1 через hsCatch, как человек-искатель ---
    victim1.emit('movePlayer', { position: { x: 1400, y: 900, w: 30, h: 100, color: '#111827', say: '', fin: false, hid: false } });
    await sleep(80);
    await walkUpTo(patientZero, 0, 1395, 900, 30, 100);

    const infectedOnZero = once(patientZero, 'hsInfected', 5000).catch(() => null);
    const infectedOnV1 = once(victim1, 'hsInfected', 5000).catch(() => null);
    patientZero.emit('hsCatch', { targetId: victim1.id });
    const [evZero, evV1] = await Promise.all([infectedOnZero, infectedOnV1]);
    ok(!!evZero && evZero.id === victim1.id, '"пациент ноль" честно поймал victim1 через hsCatch (как человек-искатель)', JSON.stringify(evZero));
    ok(!!evV1 && evV1.id === victim1.id, 'заражённый victim1 тоже получил hsInfected', JSON.stringify(evV1));

    /* --- цепь продолжается: теперь заражённый victim1 сам ловит victim2 ---
       Одометр victim1 для целей hsCatch сбросился в момент заражения (см.
       seekerOdo в hsDoInfect) — он должен честно пройти HS_MIN_DIST заново,
       поэтому victim2 ставим вдалеке от точки, где victim1 только что стоял
       (1395), а не рядом с ней. */
    victim2.emit('movePlayer', { position: { x: 700, y: 900, w: 30, h: 100, color: '#111827', say: '', fin: false, hid: false } });
    await sleep(80);
    await walkUpTo(victim1, 1395, 705, 900, 30, 100);

    const infectedOnV1b = once(victim1, 'hsInfected', 5000).catch(() => null);
    const infectedOnV2 = once(victim2, 'hsInfected', 5000).catch(() => null);
    victim1.emit('hsCatch', { targetId: victim2.id });
    const [evV1b, evV2] = await Promise.all([infectedOnV1b, infectedOnV2]);
    ok(!!evV1b && evV1b.id === victim2.id, 'цепь заражения продолжается: только что заражённый victim1 сам ловит victim2', JSON.stringify(evV1b));
    ok(!!evV2 && evV2.id === victim2.id, 'victim2 тоже получил hsInfected — все трое теперь охотники', JSON.stringify(evV2));

    const pong = once(a, 'pongCheck', 5000);
    a.emit('pingCheck', Date.now());
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
