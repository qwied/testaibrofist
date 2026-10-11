/* Поимка в классических прятках (не apoc) напрямую через сокеты, без
   браузера и без реальной физики — детерминированный тест серверной
   логики hsCatch/hsOut/seekerIds, которую живой Playwright-тест
   (test-hs-infect-live.js) не может надёжно прогнать вслепую на случайной
   карте. Раз и навсегда проверяет: пойманный в классике НЕ присоединяется
   к охоте (не попадает в seekerIds, в охоту не вступает) — он просто
   выходит из игры, обе стороны получают hsOut (а не hsInfected — та
   зарезервирована для apoc-цепочки, см. hsDoInfect в server.js), а сервер
   не падает и продолжает отвечать после этого. */
'use strict';
const { io } = require('socket.io-client');
const BASE = process.env.BASE || 'http://127.0.0.1:3210';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function connect() {
  return io(BASE, { transports: ['websocket'], forceNew: true });
}
function once(socket, event, timeoutMs) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for ' + event)), timeoutMs || 15000);
    socket.once(event, (d) => { clearTimeout(t); resolve(d); });
  });
}

(async () => {
  const room = 'rawinfect' + Math.floor(Math.random() * 1e6);
  const a = connect(), b = connect();
  await Promise.all([once(a, 'connect'), once(b, 'connect')]);

  const rouletteA = once(a, 'hsRoulette', 20000);
  a.emit('join', { playerName: 'raw_a_' + Math.floor(Math.random()*1e6), gameMode: 'hideAndSeek', room });
  await sleep(300);
  // B присоединяется, когда лобби A уже крутится — рулетку не переигрывают
  // заново специально для опоздавшего, он получает hsState-снимок вместо неё
  const stateB = once(b, 'hsState', 20000);
  b.emit('join', { playerName: 'raw_b_' + Math.floor(Math.random()*1e6), gameMode: 'hideAndSeek', room });

  const rA = await rouletteA, sB = await stateB;
  ok(!!rA && !!sB, 'A получил hsRoulette, опоздавший B — hsState');

  // ждём конца лобби — раунд стартует сам, дальше сервер решает, msLeft
  const roundA = once(a, 'hsPhase', 40000);
  const roundB = once(b, 'hsPhase', 40000);
  const [phA, phB] = await Promise.all([roundA, roundB]);
  ok(phA.phase === 'round' && phB.phase === 'round', 'обе стороны получили старт раунда', JSON.stringify({a: phA.phase, b: phB.phase}));
  const seekerId = phA.seekerId;
  ok(!!seekerId, 'у раунда есть искатель', seekerId);

  const seeker = seekerId === a.id ? a : b;
  const hider = seekerId === a.id ? b : a;
  const hiderId = hider.id;
  console.log('  seekerId=' + seekerId + ' hiderId=' + hiderId);

  // прячущийся стоит на месте на своей позиции
  hider.emit('movePlayer', { position: { x: 900, y: 300, w: 20, h: 60, color: '#111827', say: '', fin: false, hid: false } });

  // искатель честно "идёт" мелкими шагами до упора в 200px одометра —
  // раздельно от финальной позиции: сперва набираем путь вдалеке от цели,
  // потом одним НЕ-телепорт шагом (<=600px) подходим вплотную
  let sx = 0, sy = 300;
  for (let i = 0; i < 5; i++) {
    sx += 50;
    seeker.emit('movePlayer', { position: { x: sx, y: sy, w: 20, h: 60, color: '#111827', say: '', fin: false, hid: false } });
    await sleep(40);
  }
  // теперь честный подход к жертве вплотную (в пределах дистанции ловли, шаг < MAX_STEP)
  seeker.emit('movePlayer', { position: { x: 895, y: 300, w: 20, h: 60, color: '#111827', say: '', fin: false, hid: false } });
  await sleep(60);

  const outOnSeeker = once(seeker, 'hsOut', 5000).catch(() => null);
  const outOnHider = once(hider, 'hsOut', 5000).catch(() => null);
  const noInfectOnHider = once(hider, 'hsInfected', 2500).then(() => false).catch(() => true);
  seeker.emit('hsCatch', { targetId: hiderId });
  const [evSeeker, evHider, stayedOut] = await Promise.all([outOnSeeker, outOnHider, noInfectOnHider]);

  ok(!!evSeeker && evSeeker.id === hiderId, 'искатель получил hsOut с правильным id', JSON.stringify(evSeeker));
  ok(!!evHider && evHider.id === hiderId, 'пойманный тоже получил hsOut', JSON.stringify(evHider));
  ok(stayedOut, 'классика не шлёт hsInfected — пойманный не присоединяется к охоте');

  // сервер жив и отвечает дальше (не упал от нового кода)
  const pong = once(a, 'pongCheck', 5000);
  a.emit('pingCheck', Date.now());
  ok((await pong) !== undefined, 'сервер отвечает после заражения (не упал)');

  a.close(); b.close();
  console.log(fail ? ('\n' + fail + ' ошибок') : '\nвсё чисто');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
