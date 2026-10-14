/* Бот Discord целиком, против поддельного Discord (свой HTTP API и Gateway
   на localhost — настоящий токен не нужен):
   - входит с нужными intents, регистрирует команды, выкладывает правила в
     #rules и включает встроенную AutoMod;
   - автомодерация: удаляет нарушения, наказывает по лестнице, пишет игроку
     в личку и в mod-log, не трогает модераторов и разрешённые каналы;
   - за волну флуда — одно наказание, а не по штрафу за каждое сообщение;
   - команды /warnings, /warn, /post, /updates, права на них;
   - новости и записи Logs уходят во все выбранные каналы, правка и удаление
     повторяются в Discord;
   - после обрыва продолжает сессию (resume), после перезапуска ничего не
     постит заново, без Message Content Intent переподключается без него.
   Запуск: node test-discord-bot.js */
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) {
  const end = Date.now() + (ms || 3000);
  while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(20); }
  return fn();
}

const G = '100', OWNER = '900', BOT = '800', APP = '700';
const CH = { general: '300', rules: '301', updates: '302', modlog: '303', nsfw: '304', promo: '305', news2: '306' };
const MOD_ROLE = '200';

/* ---------- поддельный Discord ---------- */
const calls = [];
let msgId = 5000, rateLimitedOnce = false;
const known = new Set();
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    const p = req.url.replace(/^\/api\/v10/, '');
    let json = null;
    try { json = body ? JSON.parse(body) : null; } catch (e) {}
    calls.push({ method: req.method, path: p, body: json, reason: req.headers['x-audit-log-reason'], t: Date.now() });
    const send = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    let m;
    if (p === '/ratelimit') {
      if (!rateLimitedOnce) { rateLimitedOnce = true; return send(429, { retry_after: 0.08, global: false }); }
      return send(200, { fine: true });
    }
    if (req.method === 'POST' && (m = /^\/channels\/(\w+)\/messages$/.exec(p))) {
      const id = String(++msgId); known.add(id);
      calls[calls.length - 1].resId = id;
      return send(200, { id, channel_id: m[1] });
    }
    if (req.method === 'PATCH' && (m = /^\/channels\/\w+\/messages\/(\w+)$/.exec(p))) return known.has(m[1]) ? send(200, { id: m[1] }) : send(404, { code: 10008 });
    if (req.method === 'DELETE' && /^\/channels\/\w+\/messages\/\w+$/.test(p)) return send(204);
    if (/bulk-delete$/.test(p)) return send(204);
    if (/^\/applications\/\w+\/guilds\/\w+\/commands$/.test(p)) return send(200, []);
    if (req.method === 'GET' && /auto-moderation\/rules$/.test(p)) return send(200, []);
    if (req.method === 'POST' && /auto-moderation\/rules$/.test(p)) return send(200, { id: 'am' + (++msgId) });
    if (/^\/guilds\/\w+\/members\/\w+$/.test(p)) return send(200, {});
    if (/^\/guilds\/\w+\/bans\/\w+$/.test(p)) return send(204);
    if (p === '/users/@me/channels') return send(200, { id: 'dm' + json.recipient_id });
    if ((m = /^\/invites\/(\w+)/.exec(p))) {
      if (m[1] === 'own') return send(200, { guild: { id: G } });
      if (m[1] === 'other') return send(200, { guild: { id: '555' } });
      return send(404, { code: 10006 });
    }
    if (/\/callback$/.test(p)) return send(204);
    if (/^\/webhooks\//.test(p)) return send(200, {});
    if (p === '/users/@me/guilds') return send(200, [{ id: G }]);
    send(404, { message: 'unknown route ' + p });
  });
});

/* Gateway: HELLO -> IDENTIFY/RESUME -> READY/RESUMED -> события */
const gwLog = [];
let sock = null, seq = 0, closeNextIdentify = 0;
const wss = new WebSocket.Server({ server, path: '/gw' });
const guildCreate = () => ({
  id: G, name: 'AIBROFIST', owner_id: OWNER,
  roles: [{ id: G, name: '@everyone', permissions: '1024' }, { id: MOD_ROLE, name: 'Moderator', permissions: String(1n << 13n) }],
  channels: [
    { id: CH.general, name: 'general', type: 0 }, { id: CH.rules, name: 'rules', type: 0 },
    { id: CH.updates, name: 'updates', type: 0 }, { id: CH.modlog, name: 'mod-log', type: 0 },
    { id: CH.nsfw, name: 'nsfw', type: 0, nsfw: true }, { id: CH.promo, name: 'self-promo', type: 0 },
    { id: CH.news2, name: 'news', type: 5 }]
});
function dispatch(t, d) { if (sock) sock.send(JSON.stringify({ op: 0, t, s: ++seq, d })); }
wss.on('connection', ws => {
  sock = ws;
  ws.send(JSON.stringify({ op: 10, d: { heartbeat_interval: 500 } }));
  ws.on('message', data => {
    const msg = JSON.parse(String(data));
    gwLog.push(msg);
    if (msg.op === 1) ws.send(JSON.stringify({ op: 11 }));
    if (msg.op === 2) {
      if (closeNextIdentify) { const code = closeNextIdentify; closeNextIdentify = 0; ws.close(code, 'Disallowed intent(s).'); return; }
      seq = 0;
      dispatch('READY', { session_id: 'sess1', resume_gateway_url: 'ws://127.0.0.1:' + server.address().port + '/gw',
                          user: { id: BOT, username: 'AIBROFIST', bot: true }, application: { id: APP }, guilds: [{ id: G, unavailable: true }] });
      dispatch('GUILD_CREATE', guildCreate());
    }
    if (msg.op === 6) dispatch('RESUMED', {});
  });
});

let mid = 100000;
const member = roles => ({ roles: roles || [] });
function say(uid, content, extra) {
  const m = Object.assign({ id: String(++mid), guild_id: G, channel_id: CH.general, type: 0, content,
    author: { id: uid, username: 'player' + uid }, member: member(), mentions: [], mention_roles: [], attachments: [] }, extra || {});
  dispatch('MESSAGE_CREATE', m);
  return m;
}
const since = t => calls.filter(c => c.t >= t);
const find = (list, method, re) => list.filter(c => c.method === method && re.test(c.path));

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bfbot-'));
  Object.assign(process.env, {
    DISCORD_BOT_TOKEN: 'test-token', DISCORD_API_BASE: 'http://127.0.0.1:' + port + '/api/v10',
    DISCORD_GATEWAY_URL: 'ws://127.0.0.1:' + port + '/gw', DISCORD_BOT_STATE: path.join(tmp, 'bot.json'),
    UPDATES_FEED_STATE: path.join(tmp, 'feed.json'), DISCORD_SCAN_IMAGES: '0'
  });
  delete process.env.DISCORD_UPDATES_CHANNEL_ID; delete process.env.DISCORD_RULES_CHANNEL_ID; delete process.env.DISCORD_MODLOG_CHANNEL_ID;
  const { api } = require('./discordApi.js');
  const bot = require('./discordBot.js');

  console.log('HTTP API:');
  const t0r = Date.now();
  const rl = await api('GET', '/ratelimit');
  ok('ответ 429 — ждёт и повторяет сам', rl.status === 200 && Date.now() - t0r >= 70, (Date.now() - t0r) + ' мс');

  console.log('\nзапуск:');
  let t = Date.now();
  bot.start();
  const ident = await waitFor(() => gwLog.find(m => m.op === 2));
  ok('входит с intents: серверы, сообщения, их текст, события AutoMod', ident && ident.d.intents === (1 | 512 | 32768 | 2097152), ident && ident.d.intents);
  ok('токен — из DISCORD_BOT_TOKEN', ident && ident.d.token === 'test-token');
  await waitFor(() => find(calls, 'POST', /auto-moderation\/rules$/).length >= 3);
  const cmds = find(calls, 'PUT', /^\/applications\/700\/guilds\/100\/commands$/);
  ok('регистрирует 9 команд на сервере', cmds.length === 1 && cmds[0].body.length === 9, cmds[0] && cmds[0].body.map(c => c.name).join(','));
  ok('команды скрыты от обычных игроков (нужны права)', cmds[0] && cmds[0].body.every(c => c.default_member_permissions));
  const rules = find(calls, 'POST', /^\/channels\/301\/messages$/);
  ok('правила выложены в #rules: 3 карточки, без упоминаний', rules.length === 1 && rules[0].body.embeds.length === 3 &&
     rules[0].body.allowed_mentions.parse.length === 0);
  const am = find(calls, 'POST', /auto-moderation\/rules$/).map(c => c.body.trigger_type).sort().join(',');
  ok('включает встроенную AutoMod: спам, оскорбления и 18+, упоминания', am === '3,4,5', am);

  console.log('\nавтомодерация:');
  t = Date.now();
  say('U0', 'hello there, anyone up for a race?');
  await sleep(250);
  ok('обычное сообщение не трогает', since(t).length === 0, since(t).map(c => c.method + ' ' + c.path).join(' | '));

  t = Date.now();
  const bad = say('U1', 'ты пидор');
  await waitFor(() => find(since(t), 'POST', /^\/channels\/303\/messages$/).length);
  let c = since(t);
  ok('оскорбление по признаку — сообщение удалено', find(c, 'DELETE', new RegExp('/messages/' + bad.id + '$')).length === 1);
  const mute1 = find(c, 'PATCH', /^\/guilds\/100\/members\/U1$/)[0];
  const until1 = mute1 && Date.parse(mute1.body.communication_disabled_until) - Date.now();
  ok('2 балла — мьют на 10 минут', until1 > 9 * 60000 && until1 <= 10 * 60000, Math.round(until1 / 1000) + ' с');
  ok('в журнале аудита есть причина', mute1 && /Case 1/.test(decodeURIComponent(mute1.reason || '')));
  const dmMsg = find(c, 'POST', /^\/channels\/dmU1\/messages$/)[0];
  ok('игроку в личку: правило, наказание, баллы', dmMsg && /1\. Be respectful/.test(JSON.stringify(dmMsg.body)) && /Mute for 10 minutes/.test(JSON.stringify(dmMsg.body)));
  ok('и без эмодзи', dmMsg && !/\p{Extended_Pictographic}/u.test(JSON.stringify(dmMsg.body)));
  const note = find(c, 'POST', /^\/channels\/300\/messages$/)[0];
  ok('короткое предупреждение в канале с упоминанием игрока', note && /^<@U1>, your message was removed: rule 1/.test(note.body.content), note && note.body.content);
  const log1 = find(c, 'POST', /^\/channels\/303\/messages$/)[0];
  ok('запись в mod-log: номер случая, наказание, никого не пингует', log1 && /Case 1 \| Mute for 10 minutes/.test(log1.body.embeds[0].title) && log1.body.allowed_mentions.parse.length === 0);
  await sleep(10600);
  ok('предупреждение в канале само удаляется через 10 с', note && find(calls, 'DELETE', new RegExp('^/channels/300/messages/' + note.resId + '$')).length === 1);

  t = Date.now();
  say('U9', 'ты пидор', { member: member([MOD_ROLE]) });
  say(OWNER, 'ты пидор');
  await sleep(250);
  ok('модераторов и владельца не трогает', since(t).length === 0);

  t = Date.now();
  for (let i = 0; i < 8; i++) say('U2', 'spam number ' + i);
  await waitFor(() => find(since(t), 'POST', /^\/channels\/303\/messages$/).length);
  await sleep(300);
  c = since(t);
  const deleted = find(c, 'POST', /bulk-delete$/).reduce((n, x) => n + x.body.messages.length, 0) + find(c, 'DELETE', /\/messages\/\d+$/).length;
  ok('флуд: удалены все сообщения волны', deleted >= 8, deleted);
  ok('за волну — одно наказание (предупреждение), а не восемь', find(c, 'POST', /^\/channels\/303\/messages$/).length === 1 &&
     find(c, 'PATCH', /members\/U2$/).length === 0);
  ok('у игрока 1 балл', (bot._test.state().strikes[G + ':U2'] || []).length === 1);

  t = Date.now();
  say('U3', 'free nitro for everyone https://dlscord.gift/abc');
  await waitFor(() => find(since(t), 'PATCH', /members\/U3$/).length);
  const mute3 = find(since(t), 'PATCH', /members\/U3$/)[0];
  const until3 = mute3 && Date.parse(mute3.body.communication_disabled_until) - Date.now();
  ok('мошенническая ссылка — 3 балла, мьют на час', until3 > 59 * 60000 && until3 <= 60 * 60000);

  t = Date.now();
  say('U4', 'come to my server discord.gg/own');
  say('U4', 'my stuff discord.gg/other', { channel_id: CH.promo });
  say('U5', 'https://pornhub.com/x', { channel_id: CH.nsfw });
  await sleep(400);
  ok('своё приглашение, реклама в #self-promo, 18+ в канале 18+ — можно', find(since(t), 'DELETE', /messages/).length === 0);
  t = Date.now();
  const inv = say('U4', 'join us discord.gg/other');
  await waitFor(() => find(since(t), 'DELETE', new RegExp(inv.id + '$')).length);
  ok('приглашение на чужой сервер — удалено, предупреждение', find(since(t), 'DELETE', new RegExp(inv.id + '$')).length === 1 &&
     find(since(t), 'PATCH', /members\/U4$/).length === 0);

  t = Date.now();
  dispatch('MESSAGE_UPDATE', { id: String(++mid), guild_id: G, channel_id: CH.general, content: 'kys',
    author: { id: 'U7', username: 'p7' }, member: member(), mentions: [], attachments: [] });   // превью ссылки, не правка
  dispatch('MESSAGE_UPDATE', { id: String(++mid), guild_id: G, channel_id: CH.general, content: 'edited: kys',
    edited_timestamp: new Date().toISOString(),
    author: { id: 'U7', username: 'p7' }, member: member(), mentions: [], attachments: [] });
  await waitFor(() => find(since(t), 'PATCH', /members\/U7$/).length);
  await sleep(200);
  ok('исправленное сообщение проверяется так же (а дорисованное превью — нет)', find(since(t), 'PATCH', /members\/U7$/).length === 1 &&
     find(since(t), 'DELETE', /\/messages\/\d+$/).length === 1);

  t = Date.now();
  dispatch('AUTO_MODERATION_ACTION_EXECUTION', { guild_id: G, action: { type: 1 }, rule_id: 'r1', rule_trigger_type: 5,
    user_id: 'U6', channel_id: CH.general, content: '<@1> <@2> <@3> <@4> <@5> <@6> <@7>' });
  dispatch('AUTO_MODERATION_ACTION_EXECUTION', { guild_id: G, action: { type: 2 }, rule_id: 'r1', rule_trigger_type: 5,
    user_id: 'U6', channel_id: CH.general, content: '<@1>' });
  await waitFor(() => find(since(t), 'POST', /^\/channels\/303\/messages$/).length);
  await sleep(200);
  ok('блок встроенной AutoMod засчитывается (1 балл), без сообщения в канал', (bot._test.state().strikes[G + ':U6'] || []).length === 1 &&
     find(since(t), 'POST', /^\/channels\/300\/messages$/).length === 0);

  console.log('\nлестница до бана:');
  const g = bot._test.guilds.get(G);
  const A = require('./discordAutomod.js');
  t = Date.now();
  const r1 = await bot._test.punish(g, { id: 'U8' }, A.finding('scam'), {});
  const r2 = await bot._test.punish(g, { id: 'U8' }, A.finding('scam'), {});
  const r3 = await bot._test.punish(g, { id: 'U8' }, A.finding('scam'), {});
  ok('3, 6, 9 баллов: мьют на час, на 3 дня, бан', r1.step.ms === 3600000 && r2.step.ms === 3 * 86400000 && r3.step.type === 'ban',
     [r1, r2, r3].map(r => require('./discordRules.js').describe(r.step)).join(' / '));
  c = since(t);
  const dmBan = c.findIndex(x => x.method === 'POST' && x.path === '/channels/dmU8/messages' && /banned/.test(JSON.stringify(x.body)));
  const banCall = c.findIndex(x => x.method === 'PUT' && /bans\/U8$/.test(x.path));
  ok('сначала личное сообщение, потом бан (иначе не дойдёт)', dmBan !== -1 && banCall > dmBan);

  console.log('\nкоманды:');
  t = Date.now();
  dispatch('INTERACTION_CREATE', { id: 'i1', token: 'tok1', type: 2, guild_id: G, channel_id: CH.general,
    member: { user: { id: 'M1' }, permissions: String(1n << 40n) },
    data: { name: 'warnings', options: [{ name: 'user', type: 6, value: 'U1' }], resolved: { users: { U1: { id: 'U1' } } } } });
  await waitFor(() => find(since(t), 'PATCH', /@original$/).length);
  c = since(t);
  ok('/warnings: сначала «думаю», потом список баллов только для модератора', find(c, 'POST', /i1\/tok1\/callback$/)[0].body.type === 5 &&
     /rule 1/.test(JSON.stringify(find(c, 'PATCH', /@original$/)[0].body)));
  t = Date.now();
  dispatch('INTERACTION_CREATE', { id: 'i2', token: 'tok2', type: 2, guild_id: G, channel_id: CH.general,
    member: { user: { id: 'U0' }, permissions: '1024' },
    data: { name: 'warn', options: [{ name: 'user', type: 6, value: 'U2' }], resolved: { users: { U2: { id: 'U2' } } } } });
  await waitFor(() => find(since(t), 'POST', /i2\/tok2\/callback$/).length);
  ok('без прав команда отказывает', /permission/.test(JSON.stringify(find(since(t), 'POST', /i2\/tok2\/callback$/)[0].body)));
  t = Date.now();
  dispatch('INTERACTION_CREATE', { id: 'i3', token: 'tok3', type: 2, guild_id: G, channel_id: CH.general,
    member: { user: { id: 'M1' }, permissions: String(1n << 40n) },
    data: { name: 'warn', options: [{ name: 'user', type: 6, value: 'U2' }, { name: 'rule', type: 4, value: 7 }],
            resolved: { users: { U2: { id: 'U2' } }, members: { U2: { roles: [] } } } } });
  await waitFor(() => find(since(t), 'PATCH', /@original$/).length);
  ok('/warn: второй балл — мьют на 10 минут', find(since(t), 'PATCH', /members\/U2$/).length === 1 &&
     /2 strikes/.test(JSON.stringify(find(since(t), 'PATCH', /@original$/)[0].body)));
  t = Date.now();
  dispatch('INTERACTION_CREATE', { id: 'i3b', token: 'tok3b', type: 2, guild_id: G, channel_id: CH.general,
    member: { user: { id: 'M1' }, permissions: String(1n << 40n) },
    data: { name: 'warn', options: [{ name: 'user', type: 6, value: 'U3' }],
            resolved: { users: { U3: { id: 'U3' } }, members: { U3: { roles: [], communication_disabled_until: new Date(Date.now() + 7 * 86400000).toISOString() } } } } });
  await waitFor(() => find(since(t), 'PATCH', /tok3b\/messages\/@original$/).length);
  ok('/warn уже замьюченного на неделю — мьют не сокращает', find(since(t), 'PATCH', /members\/U3$/).length === 0);
  t = Date.now();
  dispatch('INTERACTION_CREATE', { id: 'i4', token: 'tok4', type: 2, guild_id: G, channel_id: CH.general,
    member: { user: { id: OWNER }, permissions: String(1n << 3n) },
    data: { name: 'post', options: [{ name: 'channel', type: 7, value: CH.news2 }] } });
  await waitFor(() => find(since(t), 'POST', /i4\/tok4\/callback$/).length);
  ok('/post открывает окно для текста', find(since(t), 'POST', /i4\/tok4\/callback$/)[0].body.type === 9);
  t = Date.now();
  dispatch('INTERACTION_CREATE', { id: 'i5', token: 'tok5', type: 5, guild_id: G, channel_id: CH.general,
    member: { user: { id: OWNER }, permissions: String(1n << 3n) },
    data: { custom_id: 'post:' + CH.news2 + ':embed', components: [
      { type: 1, components: [{ type: 4, custom_id: 'title', value: 'Tournament on Friday' }] },
      { type: 1, components: [{ type: 4, custom_id: 'text', value: '- Starts at 18:00\n- Prizes for top 3' }] }] } });
  await waitFor(() => find(since(t), 'POST', /^\/channels\/306\/messages$/).length);
  const posted = find(since(t), 'POST', /^\/channels\/306\/messages$/)[0];
  ok('сообщение выложено в выбранный канал карточкой', posted && posted.body.embeds[0].title === 'Tournament on Friday');
  t = Date.now();
  dispatch('INTERACTION_CREATE', { id: 'i6', token: 'tok6', type: 2, guild_id: G, channel_id: CH.general,
    member: { user: { id: OWNER }, permissions: String(1n << 3n) },
    data: { name: 'updates', options: [{ name: 'add', type: 1, options: [{ name: 'channel', type: 7, value: CH.news2 }] }] } });
  await waitFor(() => find(since(t), 'PATCH', /@original$/).length);
  ok('/updates add: канал для новостей запомнен', bot.feedChannels().indexOf(CH.news2) !== -1);

  console.log('\nновости и Logs в Discord:');
  process.env.DISCORD_UPDATES_CHANNEL_ID = CH.updates;
  const feed = require('./updatesFeed.js');
  let hook = null;
  feed.start({ onLogChange: fn => { hook = fn; }, removeAutoLogs: () => 0, addAutoLog: () => null });
  t = Date.now();
  hook('add', { id: 77, title: 'New maps', text: '- Two new race maps\n- Faster loading', images: [{ u: '/logimg/a.png' }], date: Date.now() });
  await waitFor(() => find(since(t), 'POST', /^\/channels\/(302|306)\/messages$/).length >= 2);
  const sent = find(since(t), 'POST', /^\/channels\/(302|306)\/messages$/);
  ok('запись Logs ушла во все каналы новостей (#updates и выбранный командой)', sent.length === 2);
  const e = sent[0] && sent[0].body.embeds[0];
  ok('карточка: заголовок, список, ссылка на Logs, картинка, дата', e && e.title === 'New maps' && /^- Two/.test(e.description) &&
     /\/logs$/.test(e.url) && /\/logimg\/a\.png$/.test(e.image.url) && e.timestamp && e.footer.text === 'AIBROFIST');
  t = Date.now();
  hook('edit', { id: 77, title: 'New maps!', text: 'fixed', date: Date.now() });
  await waitFor(() => find(since(t), 'PATCH', /^\/channels\/(302|306)\/messages\/\d+$/).length >= 2);
  ok('правка записи повторяется в Discord', find(since(t), 'PATCH', /^\/channels\/(302|306)\/messages\/\d+$/).length === 2);
  t = Date.now();
  hook('delete', { id: 77 });
  await waitFor(() => find(since(t), 'DELETE', /^\/channels\/(302|306)\/messages\/\d+$/).length >= 2);
  ok('удаление записи убирает и сообщения в Discord', find(since(t), 'DELETE', /^\/channels\/(302|306)\/messages\/\d+$/).length === 2);

  console.log('\nподключение:');
  t = Date.now();
  sock.send(JSON.stringify({ op: 7, d: null }));
  const resume = await waitFor(() => gwLog.find(m => m.op === 6), 8000);
  ok('просьба переподключиться — продолжает ту же сессию (resume)', resume && resume.d.session_id === 'sess1' && resume.d.seq > 0);

  t = Date.now();
  bot.stop();
  await sleep(200);
  const before = gwLog.length;
  closeNextIdentify = 4014;
  bot._test.reload();
  bot.start();
  const ident2 = await waitFor(() => gwLog.slice(before).filter(m => m.op === 2).length >= 2 && gwLog.slice(before).filter(m => m.op === 2)[1], 8000);
  ok('без Message Content Intent переподключается без него', ident2 && ident2.d.intents === (1 | 512 | 2097152), ident2 && ident2.d.intents);
  await sleep(800);
  c = since(t);
  ok('после перезапуска ничего не постит заново (правила, команды, AutoMod)',
     find(c, 'POST', /^\/channels\/301\/messages$/).length === 0 && find(c, 'PUT', /commands$/).length === 0 &&
     find(c, 'POST', /auto-moderation/).length === 0 && find(c, 'PATCH', /^\/channels\/301\//).length === 0);
  ok('баллы пережили перезапуск', (bot._test.state().strikes[G + ':U1'] || []).length === 1);

  bot.stop();
  wss.close(); server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('✗ тест упал:', e.stack); process.exit(1); });
