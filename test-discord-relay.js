/* Посредник в Cloudflare (cloudflare/discord-relay.mjs) и бот через него.
   - сам посредник: без ключа — отказ; файлы — только с CDN Discord;
     подключение — только к хостам Discord, ключ дальше не уходит;
   - бот: живое подключение идёт через посредника с ключом, продолжение
     сессии — тоже через него, к хосту, который назвал Discord;
   - картинки бот берёт через посредника (страница состояния: cdn ok).
   Запуск: node test-discord-relay.js */
'use strict';
const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');
const WebSocket = require('ws');

let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) {
  const end = Date.now() + (ms || 4000);
  while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(25); }
  return fn();
}
const KEY = 'relay-test-key';

(async () => {
  console.log('сам посредник (код для Cloudflare):');
  const relay = (await import(pathToFileURL(path.join(__dirname, 'cloudflare', 'discord-relay.mjs')).href)).default;
  const env = { RELAY_KEY: KEY };
  const fetched = [];
  global.fetch = async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init);
    fetched.push(req);
    return new Response('PNG', { status: 200, headers: { 'content-type': 'image/png' } });
  };
  const call = (p, headers) => relay.fetch(new Request('https://relay.example' + p, { headers: headers || {} }), env);
  ok('без ключа — отказ', (await call('/health')).status === 403);
  ok('с чужим ключом — отказ', (await call('/health', { 'x-relay-key': 'nope' })).status === 403);
  ok('с ключом — «ok»', (await (await call('/health', { 'x-relay-key': KEY })).text()) === 'ok');
  const img = await call('/cdn?url=' + encodeURIComponent('https://cdn.discordapp.com/attachments/1/2/a.png'), { 'x-relay-key': KEY });
  ok('картинка с CDN Discord — отдаёт как есть', img.status === 200 && img.headers.get('content-type') === 'image/png' &&
     fetched.slice(-1)[0].url === 'https://cdn.discordapp.com/attachments/1/2/a.png');
  const n = fetched.length;
  const other = await call('/cdn?url=' + encodeURIComponent('https://example.com/a.png'), { 'x-relay-key': KEY });
  ok('чужой сайт — отказ (не открытый прокси)', other.status === 400 && fetched.length === n);
  ok('не WebSocket на /gateway — отказ', (await call('/gateway', { 'x-relay-key': KEY })).status === 426);
  const ws = { 'x-relay-key': KEY, upgrade: 'websocket', 'sec-websocket-key': 'abc', 'sec-websocket-version': '13' };
  ok('подключение к чужому хосту — отказ', (await call('/gateway?host=evil.com', ws)).status === 400 && fetched.length === n);
  await call('/gateway?host=gateway-us-east1-b.discord.gg&v=10&encoding=json', ws);
  const up = fetched.slice(-1)[0];
  ok('подключение — к названному хосту Discord, с параметрами', up && up.url === 'https://gateway-us-east1-b.discord.gg/?v=10&encoding=json', up && up.url);
  ok('заголовки WebSocket передаёт, а ключ — нет', up && up.headers.get('upgrade') === 'websocket' &&
     up.headers.get('sec-websocket-key') === 'abc' && !up.headers.get('x-relay-key'));
  const nb = fetched.length;
  ok('серверы brofist.io без ключа — отказ', (await call('/brofist')).status === 403 && fetched.length === nb);
  const bfr = await call('/brofist?url=' + encodeURIComponent('https://example.com/'), { 'x-relay-key': KEY });
  ok('серверы brofist.io с ключом — только их адрес, чужой не подставить', bfr.status === 200 &&
     fetched.slice(-1)[0].url === 'https://brofist.io/getGamingServersInfo', fetched.slice(-1)[0].url);
  delete global.fetch;

  console.log('\nбот через посредника:');
  // поддельный посредник: сам ведёт себя как Discord
  const hits = [], conns = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    hits.push({ path: u.pathname, url: u.searchParams.get('url'), key: req.headers['x-relay-key'] });
    if (req.headers['x-relay-key'] !== KEY) { res.writeHead(403); return res.end(); }
    if (u.pathname === '/cdn') { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end('PNGDATA'); }
    res.writeHead(404); res.end();
  });
  const wss = new WebSocket.Server({ noServer: true });
  server.on('upgrade', (req, sock, head) => {
    const u = new URL(req.url, 'http://x');
    conns.push({ path: u.pathname, host: u.searchParams.get('host'), v: u.searchParams.get('v'), key: req.headers['x-relay-key'], got: [] });
    if (req.headers['x-relay-key'] !== KEY || u.pathname !== '/gateway') { sock.destroy(); return; }
    wss.handleUpgrade(req, sock, head, ws => {
      const c = conns[conns.length - 1];
      ws.on('message', d => {
        const m = JSON.parse(String(d));
        c.got.push(m.op);
        if (m.op === 2) ws.send(JSON.stringify({ op: 0, t: 'READY', s: 1, d: { session_id: 's1',
          resume_gateway_url: 'wss://gateway-us-east1-b.discord.gg', user: { id: '1', username: 'bot' } } }));
        if (m.op === 6) ws.send(JSON.stringify({ op: 0, t: 'RESUMED', s: 2, d: {} }));
      });
      ws.send(JSON.stringify({ op: 10, d: { heartbeat_interval: 30000 } }));
      c.ws = ws;
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  Object.assign(process.env, { DISCORD_BOT_TOKEN: 'test-token', DISCORD_API_BASE: 'http://127.0.0.1:1/api/v10',
    DISCORD_RELAY_URL: 'http://127.0.0.1:' + port + '/', DISCORD_RELAY_KEY: KEY, DISCORD_UPDATES_CHANNEL_ID: '1' });
  delete process.env.DISCORD_GATEWAY_URL;

  const { Gateway } = require('./discordGateway.js');
  const gw = new Gateway({ token: 't', intents: 1, relay: { url: process.env.DISCORD_RELAY_URL, key: KEY } });
  gw.on('debug', () => {});
  gw.connect();
  await waitFor(() => gw.state === 'ready');
  ok('живое подключение — через посредника, с ключом, к gateway.discord.gg', gw.state === 'ready' && conns[0] &&
     conns[0].path === '/gateway' && conns[0].host === 'gateway.discord.gg' && conns[0].v === '10' && conns[0].key === KEY,
     conns[0] && conns[0].host);
  conns[0].ws.send(JSON.stringify({ op: 7, d: null }));                 // Discord просит переподключиться
  await waitFor(() => conns[1] && conns[1].got.indexOf(6) !== -1);
  ok('продолжение сессии — тоже через посредника, к хосту из READY', conns[1] && conns[1].host === 'gateway-us-east1-b.discord.gg' &&
     conns[1].got.indexOf(6) !== -1 && gw.state === 'ready', conns[1] && conns[1].host);
  gw.destroy();

  const bot = require('./discordBot.js');
  await bot.status();                                                   // запускает проверку CDN
  await waitFor(() => hits.some(h => h.path === '/cdn'));
  await sleep(100);
  const st = await bot.status();
  const h = hits.find(x => x.path === '/cdn');
  ok('картинки — через посредника (страница состояния: cdn ok, relay on)', st.cdn === 'ok' && st.relay === 'on' &&
     h && h.key === KEY && h.url === 'https://cdn.discordapp.com/embed/avatars/0.png', { cdn: st.cdn, relay: st.relay });
  ok('в ответе страницы нет ни ключа, ни адреса посредника', !JSON.stringify(st).includes(KEY) && !JSON.stringify(st).includes(String(port)));

  server.close();
  console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('✗ тест упал:', e.stack); process.exit(1); });
