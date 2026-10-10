/* hsCaught раньше было голым доверием клиенту: любой текущий сикер мог
   прислать "все пойманы" без единой реальной поимки, и hsOnCaught
   обрывал раунд по этому одному заявлению (см. server.js, было без
   проверки stillHiding). Значит, любой сикер мог рушить каждый раунд
   подряд — хайдеры, которые честно прячутся и ещё не набрали HS_MIN_DIST,
   теряли награду за выживание, а раунд за раундом сокращался до ~1.4с.

   Тест поднимает свой сервер (как test-hs-zombie-infect-raw.js), сажает
   троих в комнату, ждёт раунда и, если сикером выбрали не того, кого
   нужно, просто смотрит, кого выбрала рулетка. Сикер сразу шлёт hsCaught
   БЕЗ единой настоящей поимки — после фикса раунд не должен кончиться
   раньше таймера (HS_ROUND_MS намеренно короткий через env). Второй
   блок — честная поимка всех через hsCatch — тоже должна отрабатывать
   штатно (общий путь через hsDoInfect/stillHiding, не задет фиксом). */
'use strict';
const { io } = require('socket.io-client');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PORT = 3225;
const BASE = 'http://127.0.0.1:' + PORT;
const OWNER = 'caughtabuseowner';
const MAP_NAME = 'CaughtAbuseRawTestMap';
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
function neverWithin(socket, event, ms) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(true), ms);
    socket.once(event, () => { clearTimeout(t); resolve(false); });
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
    mode: 'hideAndSeek', gravity: 9,
    objects: [{ id: 1, type: 'spawn', x: 50, y: 900, w: 30, h: 100 }]
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
    env: Object.assign({}, process.env, { PORT: String(PORT), OWNER_ALIASES: OWNER, HS_ROUND_MS: '6000' }),
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

    const room = 'rawcaught' + Math.floor(Math.random() * 1e6);
    const a = connect(), b = connect(), c = connect();
    await Promise.all([once(a, 'connect'), once(b, 'connect'), once(c, 'connect')]);

    const lobbyA = once(a, 'hsPhase', 10000);
    a.emit('join', { playerName: 'rc_a_' + Math.floor(Math.random()*1e6), gameMode: 'hideAndSeek', room });
    await sleep(150);
    b.emit('join', { playerName: 'rc_b_' + Math.floor(Math.random()*1e6), gameMode: 'hideAndSeek', room });
    await sleep(150);
    c.emit('join', { playerName: 'rc_c_' + Math.floor(Math.random()*1e6), gameMode: 'hideAndSeek', room });

    const phLobby = await lobbyA;
    ok(phLobby.phase === 'lobby', 'лобби стартовало', JSON.stringify(phLobby));

    const roundA = once(a, 'hsPhase', 40000);
    const phA = await roundA;
    ok(phA.phase === 'round' && !!phA.seekerId, 'раунд стартовал с сикером', JSON.stringify(phA));

    const socks = { [a.id]: a, [b.id]: b, [c.id]: c };
    const seeker = socks[phA.seekerId];
    const hiders = [a, b, c].filter(s => s.id !== phA.seekerId);
    ok(!!seeker && hiders.length === 2, 'сикер и два хайдера определены', phA.seekerId);

    // ложное "все пойманы" от сикера — НИ ОДНОЙ реальной поимки не было
    const noEarlyEnd = neverWithin(a, 'hsPhase', 3500);
    seeker.emit('hsCaught');
    const stayedInRound = await noEarlyEnd;
    ok(stayedInRound, 'ложное hsCaught без поимок не обрывает раунд (фикс stillHiding)');

    // честная зачистка: ловим обоих хайдеров через hsCatch — это ДОЛЖНО
    // закончить раунд, через тот же стандартный путь (hsDoInfect)
    for (const hider of hiders) {
      const pos = { x: 900, y: 900, w: 20, h: 60, color: '#111827', say: '', fin: false, hid: false };
      hider.emit('movePlayer', { position: pos });
      await sleep(50);
      let sx = 0;
      for (let i = 0; i < 5; i++) {
        sx += 50;
        seeker.emit('movePlayer', { position: { x: sx, y: 900, w: 20, h: 60, color: '#111827', say: '', fin: false, hid: false } });
        await sleep(40);
      }
      seeker.emit('movePlayer', { position: { x: 895, y: 900, w: 20, h: 60, color: '#111827', say: '', fin: false, hid: false } });
      await sleep(60);
      const infectedOnHider = once(hider, 'hsInfected', 5000).catch(() => null);
      seeker.emit('hsCatch', { targetId: hider.id });
      const ev = await infectedOnHider;
      ok(!!ev, 'настоящая поимка хайдера дошла', hider.id);
    }

    const lobbyAgain = once(a, 'hsPhase', 5000).catch(() => null);
    const phEnd = await lobbyAgain;
    ok(!!phEnd && phEnd.phase === 'lobby', 'после настоящей зачистки всех раунд закончился сам', JSON.stringify(phEnd));

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
