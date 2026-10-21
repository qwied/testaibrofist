/* Подключение бота к Discord (discordGateway.js): сторож «открыто, но не вошло».
   Если соединение открылось, а HELLO или READY так и не пришли (бывает у
   хостинга), без сторожа бот так и висел бы «в процессе подключения» и не видел
   ни одного сообщения. Теперь через readyMs соединение рвётся и открывается
   заново; соединение, которое вошло, сторож не трогает.
   Запуск: node test-discord-gateway.js */
'use strict';
const WebSocket = require('ws');
const { Gateway } = require('./discordGateway.js');

let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // 1) сервер, который принимает соединение и молчит — HELLO не присылает
  let opened = 0, mode = 'silent';
  const wss = new WebSocket.Server({ port: 0 });
  const port = wss.address().port;
  wss.on('connection', ws => {
    opened++;
    if (mode === 'silent') return;
    ws.send(JSON.stringify({ op: 10, d: { heartbeat_interval: 400 } }));
    ws.on('message', data => {
      const msg = JSON.parse(String(data));
      if (msg.op === 1) ws.send(JSON.stringify({ op: 11 }));
      if (msg.op === 2) ws.send(JSON.stringify({ op: 0, t: 'READY', s: 1, d: { session_id: 's1', resume_gateway_url: 'ws://127.0.0.1:' + port } }));
    });
  });

  console.log('соединение открылось, но не вошло:');
  const gw = new Gateway({ token: 'x', intents: 1, url: 'ws://127.0.0.1:' + port, readyMs: 400 });
  gw.connect();
  await sleep(300);
  ok('сначала одно соединение, и оно ещё «подключается»', opened === 1 && gw.state === 'connecting', opened + ' / ' + gw.state);
  await sleep(2600);
  ok('молчащее соединение сторож порвал (код 4903), бот открыл новое — и так снова и снова', opened >= 2 && gw.lastClose && gw.lastClose.code === 4903, opened + ' соединений, ' + JSON.stringify(gw.lastClose && gw.lastClose.code));

  console.log('\nсоединение, которое вошло:');
  mode = 'good';
  const before = opened;
  const ready = new Promise(r => gw.once('dispatch', t => { if (t === 'READY') r(); }));
  await Promise.race([ready, sleep(6000)]);
  ok('когда сервер ответил, бот вошёл (READY)', gw.state === 'ready', gw.state);
  await sleep(1200);
  ok('вошедшее соединение сторож не трогает: ещё секунда — и никаких новых соединений', opened <= before + 1 && gw.state === 'ready', opened + ' / ' + before + ' / ' + gw.state);

  gw.destroy();
  await sleep(200);
  const after = opened;
  await sleep(900);
  ok('после остановки сторож не оставляет таймеров, новых соединений нет', opened === after, opened + ' / ' + after);
  wss.close();
  console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('✗ тест упал:', e.stack); process.exit(1); });
