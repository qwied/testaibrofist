/* E2E v105: клиентские изменения для быстрого сервера на Cloudflare Workers.
   Воркер в тесте заменяет MIMIC — Node-сервер, повторяющий протокол worker.js
   (init/join/playersList/nameFixed/playerMoved/pongCheck/chatMessage).
   Проверяем:
   1) два клиента через ?ws= подключаются к mimic-серверу и видят друг друга;
   2) движение ходит по каналу (movePlayer -> playerMoved);
   3) скин уезжает в первом пакете и ПОВТОРНО после входа второго игрока
      (сброс «что уже отправлено» в playerJoined);
   4) пинг показывается в интерфейсе (pingCheck/pongCheck);
   5) Fallback: если воркер недоступен, игра сама возвращается на старый
      socket.io-сервер и играет дальше;
   6) game.html грузит game.js?v=105. */
const { chromium } = require('/home/z/node_modules/playwright');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };

const GAME_PORT = process.env.PORT || 3113;
const BASE = 'http://localhost:' + GAME_PORT;
const MIMIC_PORT = 3121;
const DEAD_PORT = 59961;

/* ---------- MIMIC: протокол worker.js на Node ---------- */
function startMimic() {
  const stats = { moveTotal: 0, playerMoved: 0, joins: 0, pongs: 0, chat: 0, perClient: {} };
  // perClient[id] = { name, moves, withSk }
  const server = http.createServer((req, res) => {
    if (req.url === '/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats));
    } else { res.writeHead(404); res.end(); }
  });
  const wss = new WebSocket.Server({ server, path: '/ws' });
  const atts = new Map();

  function broadcast(obj, except) {
    const text = JSON.stringify(obj);
    for (const [ws, a] of atts) {
      if (ws === except) continue;
      if (a.rk !== obj._rk) continue;
      try { ws.send(text); } catch (e) {}
    }
  }

  wss.on('connection', (ws) => {
    const id = 'mimic-' + Math.random().toString(36).slice(2, 10);
    const att = { id, rk: null, name: null, nid: 0, pos: null };
    atts.set(ws, att);
    ws.send(JSON.stringify({ ev: 'init', data: { id } }));

    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (!m || typeof m.ev !== 'string') return;

      if (m.ev === 'join') {
        stats.joins++;
        att.rk = (m.data.gameMode || 'race') + '|' + (m.data.room || 'room1');
        att.name = m.data.playerName || 'Player';
        att.nid++;
        att.pos = { x: 100, y: 100 };
        stats.perClient[att.id] = { name: att.name, moves: 0, withSk: 0 };
        broadcast({ _rk: att.rk, ev: 'playerJoined', data: { id: att.id, name: att.name, nid: att.nid, position: att.pos } }, null);
        const list = [];
        for (const [, a] of atts) {
          if (a.rk === att.rk && a.name) list.push({ id: a.id, name: a.name, nid: a.nid, position: a.pos });
        }
        ws.send(JSON.stringify({ ev: 'playersList', data: list }));
        ws.send(JSON.stringify({ ev: 'nameFixed', data: { name: att.name } }));

      } else if (m.ev === 'movePlayer') {
        if (!att.rk || !m.data || !m.data.position) return;
        stats.moveTotal++;
        const pc = stats.perClient[att.id];
        if (pc) { pc.moves++;
          if (m.data.position.sk !== undefined) pc.withSk++;
        }
        const pos = m.data.position;
        if (pos.sk === undefined && att.pos && att.pos.sk !== undefined) pos.sk = att.pos.sk;
        att.pos = pos;
        stats.playerMoved++;
        broadcast({ _rk: att.rk, ev: 'playerMoved', data: { playerId: att.id, position: pos } }, ws);

      } else if (m.ev === 'pingCheck') {
        stats.pongs++;
        ws.send(JSON.stringify({ ev: 'pongCheck', data: m.data }));

      } else if (m.ev === 'sendChat') {
        stats.chat++;
        broadcast({ _rk: att.rk, ev: 'chatMessage', data: { playerId: att.id, playerName: att.name, text: String(m.data && m.data.text || '').slice(0, 200) } }, null);
      }
    });

    ws.on('close', () => {
      const a = atts.get(ws);
      atts.delete(ws);
      if (a && a.rk) broadcast({ _rk: a.rk, ev: 'playerLeft', data: { playerId: a.id } }, null);
    });
  });

  return new Promise(resolve => server.listen(MIMIC_PORT, () => resolve(stats)));
}

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(BASE + path, res => {
      let body = '';
      res.on('data', c => { body += c; if (body.length > 200000) res.destroy(); });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

(async () => {
  // 1) поднимаем игровой сервер (как в e2e103: владелец = E2EOwner)
  const game = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: Object.assign({}, process.env, { PORT: String(GAME_PORT), OWNER_NAME: 'E2EOwner' }),
    stdio: 'ignore'
  });
  for (let i = 0; i < 40; i++) {
    try { await get('/game.html'); break; } catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }

  // 2) посев карты race от владельца (пул карт режима — карты владельца)
  async function ownerCookie() {
    const body = { name: 'E2EOwner', password: 'e2e-pass-123' };
    let r = await fetch(BASE + '/signUp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let j = await r.json().catch(() => ({}));
    if (j.status !== 'success') {
      r = await fetch(BASE + '/signIn', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      j = await r.json().catch(() => ({}));
    }
    return j.status === 'success' ? (r.headers.get('set-cookie') || '') : '';
  }
  const cookie = await ownerCookie();
  await fetch(BASE + '/uploadMap', {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      mapName: 'e2e-seed', mapType: 'race',
      mapData: JSON.stringify({ objects: [
        { type: 'spawn', x: 60, y: 300, w: 20, h: 60 },
        { type: 'rect', x: 0, y: 380, w: 600, h: 40 },
        { type: 'finishline', x: 520, y: 300, w: 20, h: 80 }
      ] })
    })
  }).catch(() => {});

  // 3) mimic-сервер воркера
  const stats = await startMimic();

  const browser = await chromium.launch();
  const ctxA = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const ctxB = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();

  const wsQ = '&ws=' + encodeURIComponent('ws://localhost:' + MIMIC_PORT + '/ws');
  await Promise.all([
    A.goto(BASE + '/game.html?mode=race&room=e2ews' + wsQ, { waitUntil: 'domcontentloaded' }),
    B.goto(BASE + '/game.html?mode=race&room=e2ews' + wsQ, { waitUntil: 'domcontentloaded' })
  ]);
  await A.waitForTimeout(5000);

  const aInfo = await A.evaluate(() => ({
    count: (document.getElementById('gCount') || {}).textContent || '?',
    ping: (document.getElementById('gPing') || {}).textContent || ''
  }));
  ok('оба игрока в комнате через воркер (mimic)', aInfo.count === '2', 'count=' + aInfo.count);
  ok('пинг показан (pingCheck/pongCheck работают)', /\d+/.test(aInfo.ping), 'gPing=' + aInfo.ping);

  // 4) B двигается — по каналу должны пойти movePlayer/playerMoved
  await B.keyboard.down('ArrowRight');
  await A.waitForTimeout(1800);
  await B.keyboard.up('ArrowRight');

  ok('оба шлют движение (комната не пуста — темп 20 Гц)',
     stats.moveTotal >= 30,
     'moveTotal=' + stats.moveTotal);
  ok('сервер разослал playerMoved', stats.playerMoved > 10, String(stats.playerMoved));
  const pcs = Object.values(stats.perClient);
  ok('скин уезжает из первого пакета каждого клиента (lastSk=null после connect)',
     pcs.length >= 2 && pcs.every(p => p.withSk >= 1),
     JSON.stringify(stats.perClient));

  // 5) скиновый сброс при входе новичка: третий игрок C входит, у A и B
  //    должен снова появиться пакет с sk (client reset в playerJoined)
  const ctxC = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const C = await ctxC.newPage();
  await C.goto(BASE + '/game.html?mode=race&room=e2ews' + wsQ, { waitUntil: 'domcontentloaded' });
  await A.waitForTimeout(2500);
  await B.keyboard.down('ArrowRight');
  await A.waitForTimeout(1200);
  await B.keyboard.up('ArrowRight');
  const firstTwo = pcs.filter(p => p.moves >= 10);
  ok('после входа новичка скин переотправлен (сброс в playerJoined)',
     firstTwo.length >= 2 && firstTwo.every(p => p.withSk >= 2),
     JSON.stringify(stats.perClient));

  // 6) fallback: воркер мёртв -> игра возвращается на socket.io-сервер
  const D = await ctxC.newPage();
  await D.goto(BASE + '/game.html?mode=race&room=e2ewsf&ws=' +
    encodeURIComponent('ws://localhost:' + DEAD_PORT + '/ws'), { waitUntil: 'domcontentloaded' });
  await A.waitForTimeout(10000);
  const dInfo = await D.evaluate(() => ({
    count: (document.getElementById('gCount') || {}).textContent || '?'
  }));
  ok('мёртвый воркер -> авто-возврат на старый сервер (игрок в комнате)',
     dInfo.count === '1', 'count=' + dInfo.count);

  // 7) версия статики
  const gh = await get('/game.html');
  ok('game.html грузит game.js?v=105', gh.body.indexOf('game.js?v=105') !== -1);

  await browser.close();
  game.kill();
  console.log(fails ? '\n✗ ошибок: ' + fails : '\n✓ всё зелено');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('E2E упал:', e.message); process.exit(1); });
