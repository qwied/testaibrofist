/* Бот без живого подключения к Discord (с хостинга не открывается
   gateway.discord.gg): работает запросами.
   - через несколько секунд без подключения сам переходит на запросы и
     указывает Discord адрес для кнопок (/discord/interactions);
   - новые сообщения находит опросом: старые (до запуска) не трогает,
     нарушения удаляет и наказывает, модераторов не трогает, волна флуда —
     одно наказание;
   - секретная команда владельца работает так же;
   - кнопки приходят по HTTP: подпись Discord проверяется (чужая — 401),
     проверка адреса (PING) проходит, окно открывается;
   - новые участники и смена ника замечаются опросом.
   Запуск: node test-discord-rest.js */
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) {
  const end = Date.now() + (ms || 4000);
  while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(25); }
  return fn();
}

const G = '100', OWNER = '900', BOT = '800', APP = '700', MOD_ROLE = '200';
const CH = { general: '300', news: '306' };
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const verifyHex = publicKey.export({ format: 'der', type: 'spki' }).slice(-32).toString('hex');

/* ---------- поддельный Discord: только HTTP, живого подключения нет ---------- */
let snow = 1000000;
const nextId = () => String(++snow);
const store = { [CH.general]: [], [CH.news]: [] };
const members = new Map([
  [OWNER, { user: { id: OWNER, username: 'qwied' }, roles: [], joined_at: '2024-01-01T00:00:00Z' }],
  ['M1', { user: { id: 'M1', username: 'moder' }, roles: [MOD_ROLE], joined_at: '2024-01-01T00:00:00Z' }],
  ['U1', { user: { id: 'U1', username: 'player1' }, roles: [], joined_at: '2024-01-01T00:00:00Z' }],
  ['U2', { user: { id: 'U2', username: 'player2' }, roles: [], joined_at: '2024-01-01T00:00:00Z' }]
]);
function addMsg(channel, author, content, extra) {
  const m = Object.assign({ id: nextId(), channel_id: channel, type: 0, content, author, timestamp: new Date().toISOString(),
                            mentions: [], mention_roles: [], attachments: [] }, extra || {});
  store[channel].push(m);
  return m;
}
const say = (uid, content, extra) => addMsg((extra && extra.channel) || CH.general, members.get(uid) ? members.get(uid).user : { id: uid, username: uid }, content, extra);

const calls = [];
let listCalls = 0;
const roles = [{ id: G, name: '@everyone', permissions: '1024' }, { id: MOD_ROLE, name: 'Moderator', permissions: String(1n << 13n) }];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    const u = new URL(req.url, 'http://x'), p = u.pathname.replace(/^\/api\/v10/, '');
    let json = null;
    try { json = body ? JSON.parse(body) : null; } catch (e) {}
    calls.push({ method: req.method, path: p, query: u.search, body: json, t: Date.now() });
    const send = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    let m;
    if (p === '/users/@me') return send(200, { id: BOT, username: 'AiBrofist', bot: true });
    if (p === '/applications/@me' && req.method === 'GET') return send(200, { id: APP, verify_key: verifyHex, interactions_endpoint_url: null });
    if (p === '/applications/@me' && req.method === 'PATCH') return send(200, { id: APP });
    if (p === '/users/@me/guilds') return send(200, [{ id: G, name: 'AIBROFIST' }]);
    if (p === '/guilds/' + G) return send(200, { id: G, name: 'AIBROFIST', owner_id: OWNER, roles });
    // как у настоящего Discord: список каналов дают редко (10 раз за ~40 с),
    // дальше — 429 и долгое ожидание
    if (p === '/guilds/' + G + '/channels' && ++listCalls > 2) return send(429, { message: 'You are being rate limited.', retry_after: 30, global: false });
    if (p === '/guilds/' + G + '/channels') return send(200, [
      { id: CH.general, name: 'general', type: 0, last_message_id: (store[CH.general].slice(-1)[0] || {}).id || null },
      { id: CH.news, name: 'news', type: 5, last_message_id: (store[CH.news].slice(-1)[0] || {}).id || null },
      { id: '399', name: 'voice', type: 2 }]);
    if ((m = /^\/channels\/(\d+)\/messages$/.exec(p)) && req.method === 'GET') {
      const after = u.searchParams.get('after') || '0';
      const newer = (a, b) => a.length !== b.length ? a.length > b.length : a > b;
      return send(200, (store[m[1]] || []).filter(x => newer(x.id, after)).slice(0, 50).reverse());
    }
    if ((m = /^\/channels\/(\d+)\/messages$/.exec(p)) && req.method === 'POST') {
      const msg = addMsg(m[1], { id: BOT, username: 'AiBrofist', bot: true }, (json && json.content) || '');
      calls[calls.length - 1].resId = msg.id;
      return send(200, { id: msg.id, channel_id: m[1] });
    }
    if (p === '/guilds/' + G + '/members' && req.method === 'GET') return send(200, [...members.values()]);
    if (p === '/guilds/' + G + '/members/' + OWNER && req.method === 'GET') return send(200, members.get(OWNER));
    if (p === '/guilds/' + G + '/bans') return send(200, []);
    if (/^\/guilds\/\w+\/members\/\w+$/.test(p)) return send(200, {});
    if (/^\/applications\/\w+\/guilds\/\w+\/commands$/.test(p)) return send(200, []);
    if (/auto-moderation\/rules$/.test(p)) return send(200, req.method === 'GET' ? [] : { id: nextId() });
    if (p === '/users/@me/channels') return send(200, { id: 'dm' + json.recipient_id });
    if (/^\/channels\/dm/.test(p)) return send(200, { id: nextId() });
    if (req.method === 'DELETE' || /bulk-delete$/.test(p)) return send(204);
    if (/^\/webhooks\//.test(p)) return send(200, {});
    send(404, { message: 'unknown route ' + p });
  });
});
const since = t => calls.filter(c => c.t >= t);
const find = (list, method, re) => list.filter(c => c.method === method && re.test(c.path));

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bfrest-'));
  Object.assign(process.env, {
    DISCORD_BOT_TOKEN: 'test-token', DISCORD_API_BASE: 'http://127.0.0.1:' + port + '/api/v10',
    DISCORD_GATEWAY_URL: 'ws://127.0.0.1:1/gw',                 // живое подключение не откроется
    DISCORD_BOT_STATE: path.join(tmp, 'bot.json'), UPDATES_FEED_STATE: path.join(tmp, 'feed.json'),
    DISCORD_SCAN_IMAGES: '0', DISCORD_CMD_PREFIX: 'qa',
    DISCORD_REST_AFTER_MS: '800', DISCORD_POLL_MS: '250', DISCORD_MEMBERS_POLL_MS: '600', DISCORD_CHANNELS_POLL_MS: '500'
  });
  // сообщение, отправленное ДО запуска бота, — его бот не трогает
  const old = say('U1', 'ты пидор');
  const bot = require('./discordBot.js');

  console.log('переход на запросы:');
  bot.start();
  const patch = await waitFor(() => find(calls, 'PATCH', /^\/applications\/@me$/)[0], 6000);
  ok('живое подключение не открылось — бот сам перешёл на запросы', (await bot.status()).mode === 'requests');
  ok('указал Discord адрес для кнопок', patch && /\/discord\/interactions$/.test(patch.body.interactions_endpoint_url));
  await sleep(600);
  ok('сообщения до запуска не трогает', find(calls, 'DELETE', new RegExp('/messages/' + old.id + '$')).length === 0);

  console.log('\nавтомодерация опросом:');
  let t = Date.now();
  const bad = say('U1', 'ты пидор');
  await waitFor(() => find(since(t), 'PATCH', /members\/U1$/).length);
  ok('новое нарушение — удалено и мьют', find(since(t), 'DELETE', new RegExp('/messages/' + bad.id + '$')).length === 1 &&
     find(since(t), 'PATCH', /members\/U1$/).length === 1);
  t = Date.now();
  say('M1', 'ты пидор');
  say(OWNER, 'hello everyone');
  await sleep(700);
  ok('модератора (роль из списка участников) и владельца не трогает', find(since(t), 'DELETE', /messages/).length === 0);
  t = Date.now();
  for (let i = 0; i < 8; i++) say('U2', 'spam ' + i);
  await waitFor(() => find(since(t), 'POST', /^\/channels\/dmU2\/messages$/).length);
  await sleep(500);
  ok('волна флуда пришла пачкой — одно наказание', find(since(t), 'POST', /^\/channels\/dmU2\/messages$/).length === 1);
  ok('список каналов почти всё время отвечает 429 — бот всё равно читает сообщения', listCalls > 2);
  t = Date.now();
  const inNews = say('U1', 'ты пидор', { channel: CH.news });
  await waitFor(() => find(since(t), 'DELETE', new RegExp('/messages/' + inNews.id + '$')).length);
  ok('в канале, где до запуска не было сообщений, первое же нарушение замечено',
     find(since(t), 'DELETE', new RegExp('/messages/' + inNews.id + '$')).length === 1);
  // владелец выдал роли новые права, перезапуска не было
  roles.push({ id: '201', name: 'Helper', permissions: String(1n << 13n) });
  members.set('U3', { user: { id: 'U3', username: 'helper' }, roles: ['201'], joined_at: '2024-01-01T00:00:00Z' });
  await sleep(1500);
  t = Date.now();
  say('U3', 'ты пидор');
  await sleep(800);
  ok('права, выданные роли после запуска, учтены (помощника не наказывает)', find(since(t), 'DELETE', /messages/).length === 0);

  console.log('\nсекретная команда и кнопки по HTTP:');
  t = Date.now();
  const cmd = say(OWNER, '!qanews');
  await waitFor(() => find(since(t), 'POST', /^\/channels\/300\/messages$/).some(x => x.body && x.body.components));
  ok('«!qanews» удалено, вместо него панель с кнопкой', find(since(t), 'DELETE', new RegExp('/messages/' + cmd.id + '$')).length === 1);
  const st = await bot.status();
  ok('на странице состояния видно, что бот читает каналы и узнал команду', st.reading && st.reading.channels === 2 && st.reading.rounds > 0 &&
     /s ago$/.test(st.reading.lastRound) && /s ago$/.test(st.reading.lastCommand) && st.problems.join() === 'none', st.reading);
  // панель — сообщение с кнопкой (не предупреждение, которое могло прийти позже)
  const panelCall = find(since(t), 'POST', /^\/channels\/300\/messages$/).find(x => x.body && x.body.components);
  const panel = panelCall && store[CH.general].find(x => x.id === panelCall.resId);
  const customId = panelCall && panelCall.body.components[0].components[0].custom_id;

  let route = null;
  bot.register({ get: () => {}, post: (p, fn) => { route = fn; } });
  const hit = async (obj, signed) => {
    const body = Buffer.from(JSON.stringify(obj)), ts = String(Math.floor(Date.now() / 1000));
    const sig = signed === false ? '0'.repeat(128) : crypto.sign(null, Buffer.concat([Buffer.from(ts), body]), privateKey).toString('hex');
    const out = { code: 200, json: null, headersSent: false };
    await route({ headers: { 'x-signature-ed25519': sig, 'x-signature-timestamp': ts }, body }, {
      get headersSent() { return out.headersSent; },
      status(c) { out.code = c; return this; },
      json(o) { out.json = o; out.headersSent = true; },
      end() { out.headersSent = true; }
    });
    return out;
  };
  ok('проверка адреса от Discord (PING) — ответ PONG', (await hit({ type: 1 })).json.type === 1);
  ok('чужая подпись — 401', (await hit({ type: 1 }, false)).code === 401);
  const press = await hit({ id: 'i1', token: 'tk1', type: 3, guild_id: G, channel_id: CH.general, message: { id: panel && panel.id },
                            member: { user: { id: OWNER } }, data: { custom_id: customId, component_type: 2 } });
  ok('владелец нажал кнопку — окно поста пришло прямо в ответ', press.json && press.json.type === 9 && press.json.data.components.length === 5);
  const stranger = await hit({ id: 'i2', token: 'tk2', type: 3, guild_id: G, channel_id: CH.general,
                               member: { user: { id: 'U1' } }, data: { custom_id: customId, component_type: 2 } });
  ok('чужому — отказ, видит только он', stranger.json && stranger.json.type === 4 && stranger.json.data.flags === 64);

  console.log('\nучастники опросом:');
  t = Date.now();
  members.set('W1', { user: { id: 'W1', username: 'newbie' }, nick: 'Admin', roles: [], joined_at: new Date().toISOString() });
  await waitFor(() => find(since(t), 'PATCH', /members\/W1$/).length, 4000);
  const w1 = find(since(t), 'PATCH', /members\/W1$/)[0];
  ok('новый участник с ником «Admin» — ник заменён', w1 && w1.body.nick === 'Player W1');
  t = Date.now();
  members.get('U2').nick = '!!!Top';
  await waitFor(() => find(since(t), 'PATCH', /members\/U2$/).filter(x => x.body.nick).length, 4000);
  ok('смена ника замечена — значки убраны', (find(since(t), 'PATCH', /members\/U2$/).filter(x => x.body.nick)[0] || {}).body.nick === 'Top');

  bot.stop();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('✗ тест упал:', e.stack); process.exit(1); });
