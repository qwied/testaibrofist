/* Бот Discord целиком, против поддельного Discord (свой HTTP API и Gateway
   на localhost — настоящий токен не нужен):
   - входит с нужными intents, включает встроенную AutoMod, правил в #rules
     сам не пишет (их пишет владелец) и слэш-команд не заводит;
   - автомодерация: удаляет нарушения, наказывает по лестнице, пишет игроку
     в личку и в mod-log, не трогает модераторов и разрешённые каналы;
   - за волну флуда — одно наказание, а не по штрафу за каждое сообщение;
   - участники: плохой ник меняется (и балл), значки в начале убираются,
     ники всех, кто уже на сервере, тоже проверяются; рейд (много входов
     сразу) — новые аккаунты в мьют; та же аватарка, что у забаненного, —
     бан; совсем новый аккаунт не может сразу слать ссылки; политика,
     продажа аккаунтов, «мне 11 лет» (только сообщение владельцу);
   - секретные команды владельца (начало задаётся на хостинге, здесь «!qa»):
     news, updates, warn, mute, strikes, help — сообщение с командой исчезает,
     без секретного начала не срабатывают, окно видит только
     владелец, у остальных команды не срабатывают; пост с картинками,
     упоминаниями и кнопкой-ссылкой; запасное окно, если новое Discord
     не покажет;
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
// пост-карточка в рамке: части внутри рамки и части нужного типа
const parts = b => (b && b.components && b.components[0] && b.components[0].components) || [];
const partsOf = (b, type) => parts(b).filter(x => x.type === type);
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
let msgId = 5000, rateLimitedOnce = false, rejectNewModal = false;
const known = new Set();
const denied = new Set();            // каналы, куда боту писать нельзя (403)
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    const p = req.url.replace(/^\/api\/v10/, '');
    let json = null;
    try { json = body ? JSON.parse(body) : null; } catch (e) {}
    calls.push({ method: req.method, path: p, body: json, raw: body, ct: req.headers['content-type'] || '',
                 reason: req.headers['x-audit-log-reason'], t: Date.now() });
    const send = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    let m;
    if (p === '/cdn/pic.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(Buffer.from('PNGDATA')); }
    if (p === '/ratelimit') {
      if (!rateLimitedOnce) { rateLimitedOnce = true; return send(429, { retry_after: 0.08, global: false }); }
      return send(200, { fine: true });
    }
    if (req.method === 'POST' && (m = /^\/channels\/(\w+)\/messages$/.exec(p))) {
      if (denied.has(m[1])) return send(403, { code: 50013, message: 'Missing Permissions' });
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
    if (req.method === 'GET' && p === '/guilds/' + G + '/members/' + OWNER) return send(200, { user: { id: OWNER, username: 'qwied' } });
    if (/^\/guilds\/\w+\/members\/\w+$/.test(p)) return send(200, {});
    if (/^\/guilds\/\w+\/bans\/\w+$/.test(p)) return send(204);
    if (p === '/users/@me/channels') return send(200, { id: 'dm' + json.recipient_id });
    if ((m = /^\/invites\/(\w+)/.exec(p))) {
      if (m[1] === 'own') return send(200, { guild: { id: G } });
      if (m[1] === 'other') return send(200, { guild: { id: '555' } });
      return send(404, { code: 10006 });
    }
    if (/\/callback$/.test(p)) {
      const comps = json && json.type === 9 && json.data && json.data.components;
      if (rejectNewModal && comps && comps[0] && comps[0].type === 18) return send(400, { code: 50035, message: 'Invalid Form Body' });
      return send(204);
    }
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
    if (msg.op === 8) dispatch('GUILD_MEMBERS_CHUNK', { guild_id: G, chunk_index: 0, chunk_count: 1, members: [
      { user: { id: 'E1', username: 'oldhoister' }, nick: '!!!Hoister', roles: [] },
      { user: { id: 'E2', username: 'fine' }, roles: [] },
      { user: { id: 'E3', username: 'staffer' }, nick: 'Admin', roles: [MOD_ROLE] }] });
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
const points = list => (list || []).reduce((n, s) => n + s.p, 0);
const find = (list, method, re) => list.filter(c => c.method === method && re.test(c.path));

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bfbot-'));
  Object.assign(process.env, {
    DISCORD_BOT_TOKEN: 'test-token', DISCORD_API_BASE: 'http://127.0.0.1:' + port + '/api/v10',
    DISCORD_GATEWAY_URL: 'ws://127.0.0.1:' + port + '/gw', DISCORD_BOT_STATE: path.join(tmp, 'bot.json'),
    UPDATES_FEED_STATE: path.join(tmp, 'feed.json'), DISCORD_SCAN_IMAGES: '0', DISCORD_TEST_CDN: '127.0.0.1:' + port,
    DISCORD_CMD_PREFIX: 'qa', UPDATES_FILE: path.join(tmp, 'updates.json'), DISCORD_RULES_CHANNEL_ID: CH.rules
  });
  delete process.env.DISCORD_UPDATES_CHANNEL_ID; delete process.env.DISCORD_MODLOG_CHANNEL_ID;
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
  ok('входит с intents: серверы, участники, баны, сообщения, их текст, события AutoMod',
     ident && ident.d.intents === (1 | 2 | 4 | 512 | 32768 | 2097152), ident && ident.d.intents);
  const op8 = await waitFor(() => gwLog.find(m => m.op === 8));
  ok('запрашивает список участников, чтобы проверить уже стоящие ники', op8 && op8.d.guild_id === G);
  await waitFor(() => find(calls, 'PATCH', /members\/E1$/).length);
  const e1 = find(calls, 'PATCH', /members\/E1$/)[0];
  ok('у старого участника значки в начале ника убраны (без балла)', e1 && e1.body.nick === 'Hoister' && !(bot._test.state().strikes[G + ':E1'] || []).length);
  ok('модератора с ником Admin и обычный ник не трогает', find(calls, 'PATCH', /members\/(E2|E3)$/).length === 0);
  ok('токен — из DISCORD_BOT_TOKEN', ident && ident.d.token === 'test-token');
  await waitFor(() => find(calls, 'POST', /auto-moderation\/rules$/).length >= 3);
  const cmds = find(calls, 'PUT', /^\/applications\/700\/guilds\/100\/commands$/);
  ok('слэш-команд нет (старые, если были, убраны)', cmds.length === 1 && Array.isArray(cmds[0].body) && cmds[0].body.length === 0);
  await waitFor(() => find(calls, 'POST', /^\/channels\/301\/messages$/).length);
  const rauto = find(calls, 'POST', /^\/channels\/301\/messages$/);
  const rpost = rauto[0], rbtn = rpost && (partsOf(rpost.body, 1)[0] || { components: [] }).components[0];
  ok('стандартные правила сам выложил в #rules — один раз, карточкой в рамке, никого не пингуя', rauto.length === 1 &&
     rpost.body.flags === 32768 && partsOf(rpost.body, 10)[0].content === '## AIBROFIST Server Rules' &&
     /1\. Be respectful/.test(partsOf(rpost.body, 10)[1].content) && /Permanent ban/.test(partsOf(rpost.body, 10)[1].content) &&
     rpost.body.allowed_mentions.parse.length === 0);
  ok('под правилами — кнопка «Русский»', rbtn && rbtn.style === 2 && rbtn.label === 'Русский' && rbtn.custom_id === 'rules:ru');
  const am = find(calls, 'POST', /auto-moderation\/rules$/).map(c => c.body.trigger_type).sort().join(',');
  ok('включает встроенную AutoMod: спам, оскорбления и 18+, упоминания', am === '3,4,5', am);

  console.log('\nстраница состояния:');
  const st = await bot.status();
  ok('подключён, сервер виден, проблем нет', st.token && st.gateway.state === 'ready' && st.guilds.length === 1 &&
     st.problems.join() === 'none' && st.bot === 'AIBROFIST', JSON.stringify(st.problems));
  ok('в ответе нет ни токена, ни начала команд', !JSON.stringify(st).includes('test-token') && !JSON.stringify(st).includes('qa'));
  let route = null;
  bot.register({ get: (p, fn) => { route = { p, fn }; }, post: () => {} });
  let page = null;
  await route.fn({}, { set() {}, json(o) { page = o; } });
  ok('/discord/status открывается без входа и без секретов', route.p === '/discord/status' && page && page.token === true &&
     page.gateway.state === 'ready' && !JSON.stringify(page).includes('test-token') && !JSON.stringify(page).includes('qa'));
  await sleep(150);
  ok('страница проверяет, может ли сайт скачивать картинки с CDN Discord', (await bot.status()).cdn === 'ok');

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

  console.log('\nправила 7, 10, 12 и новички:');
  t = Date.now();
  const sale = say('V1', 'продам акк за 500 руб, пишите');
  await waitFor(() => find(since(t), 'DELETE', new RegExp(sale.id + '$')).length);
  ok('продажа аккаунта за деньги — удалено, правило 7', (bot._test.state().strikes[G + ':V1'] || [])[0].r === 7);
  t = Date.now();
  const pol = say('V2', 'а что вы думаете про путина?');
  await waitFor(() => find(since(t), 'DELETE', new RegExp(pol.id + '$')).length);
  ok('политика — удалено, правило 10', (bot._test.state().strikes[G + ':V2'] || [])[0].r === 10);
  t = Date.now();
  const kid = say('V3', 'привет всем, мне 11 лет');
  await waitFor(() => find(since(t), 'POST', /^\/channels\/303\/messages$/).length);
  await sleep(150);
  const alertMsg = find(since(t), 'POST', /^\/channels\/303\/messages$/)[0];
  ok('«мне 11 лет» — не наказание: сообщение не удалено, без баллов, владельцу в mod-log', alertMsg &&
     /under 13/.test(alertMsg.body.embeds[0].title) && find(since(t), 'DELETE', new RegExp(kid.id + '$')).length === 0 &&
     !(bot._test.state().strikes[G + ':V3'] || []).length);
  t = Date.now();
  const evl = say('V4', '@everyone free gifts https://gift-drop.example.com');
  await waitFor(() => find(since(t), 'PATCH', /members\/V4$/).length);
  ok('@everyone со ссылкой — 2 балла, мьют на 10 минут', points(bot._test.state().strikes[G + ':V4']) === 2);
  const snow = ms => String((BigInt(ms) - 1420070400000n) << 22n);
  const newbie = snow(Date.now() - 3600000);
  t = Date.now();
  const nl = say(newbie, 'check this https://example.com/cool', { member: Object.assign(member(), { joined_at: new Date().toISOString() }) });
  await waitFor(() => find(since(t), 'POST', /^\/channels\/300\/messages$/).length);
  c = since(t);
  ok('новый аккаунт сразу после входа шлёт ссылку — удалено, без баллов, с объяснением', find(c, 'DELETE', new RegExp(nl.id + '$')).length === 1 &&
     !(bot._test.state().strikes[G + ':' + newbie] || []).length && /10 minutes after joining/.test(find(c, 'POST', /^\/channels\/300\/messages$/)[0].body.content));
  t = Date.now();
  say(snow(Date.now() - 30 * 86400000), 'check this https://example.com/cool', { member: Object.assign(member(), { joined_at: new Date().toISOString() }) });
  await sleep(250);
  ok('старому аккаунту, только что зашедшему, ссылки можно', find(since(t), 'DELETE', /messages/).length === 0);

  console.log('\nучастники:');
  t = Date.now();
  dispatch('GUILD_MEMBER_ADD', { guild_id: G, user: { id: 'W1', username: 'w1' }, nick: null, roles: [], joined_at: new Date().toISOString() });
  dispatch('GUILD_MEMBER_UPDATE', { guild_id: G, user: { id: 'W1', username: 'w1' }, nick: 'Модератор', roles: [] });
  await waitFor(() => find(since(t), 'PATCH', /members\/W1$/).length);
  ok('ник «Модератор» — заменён и балл по правилу 9', find(since(t), 'PATCH', /members\/W1$/)[0].body.nick === 'Player W1' &&
     (bot._test.state().strikes[G + ':W1'] || [])[0].r === 9);
  t = Date.now();
  dispatch('GUILD_MEMBER_UPDATE', { guild_id: G, user: { id: 'W1', username: 'w1' }, nick: 'Player W1', roles: [] });
  dispatch('GUILD_MEMBER_UPDATE', { guild_id: G, user: { id: 'W1', username: 'w1' }, nick: 'Player W1', roles: ['777'] });
  await sleep(250);
  ok('наш же новый ник — повторно не наказывает', find(since(t), 'PATCH', /members\/W1$/).length === 0 && (bot._test.state().strikes[G + ':W1'] || []).length === 1);
  t = Date.now();
  dispatch('GUILD_MEMBER_ADD', { guild_id: G, user: { id: 'W2', username: 'n1gg3r' }, roles: [] });
  await waitFor(() => find(since(t), 'PATCH', /members\/W2$/).length);
  ok('оскорбление в имени — ник заменён', find(since(t), 'PATCH', /members\/W2$/)[0].body.nick === 'Player W2');
  t = Date.now();
  dispatch('GUILD_BAN_ADD', { guild_id: G, user: { id: 'B1', username: 'badguy', avatar: 'cafe1234' } });
  dispatch('GUILD_MEMBER_ADD', { guild_id: G, user: { id: 'B2', username: 'newguy', avatar: 'cafe1234' }, roles: [] });
  await waitFor(() => find(since(t), 'PUT', /bans\/B2$/).length);
  ok('та же аватарка, что у забаненного, — бан за обход (правило 11)', find(since(t), 'PUT', /bans\/B2$/).length === 1 &&
     /ban evasion/.test(decodeURIComponent(find(since(t), 'PUT', /bans\/B2$/)[0].reason || '')));
  t = Date.now();
  dispatch('GUILD_MEMBER_ADD', { guild_id: G, user: { id: 'B3', username: 'badguy' }, roles: [] });
  await waitFor(() => find(since(t), 'POST', /^\/channels\/303\/messages$/).length);
  ok('то же имя, что у забаненного, — только сообщение владельцу', find(since(t), 'PUT', /bans\/B3$/).length === 0 &&
     /second account/.test(JSON.stringify(find(since(t), 'POST', /^\/channels\/303\/messages$/)[0].body)));
  t = Date.now();
  for (let i = 0; i < 10; i++) dispatch('GUILD_MEMBER_ADD', { guild_id: G, user: { id: snow(Date.now() - 3600000 - i), username: 'raider' + i }, roles: [] });
  await waitFor(() => find(since(t), 'POST', /^\/channels\/303\/messages$/).length && find(since(t), 'PATCH', /members\/\d+$/).length);
  await sleep(300);
  ok('рейд: 10 входов за минуту — сообщение владельцу и мьют новых аккаунтов', /Raid/.test(JSON.stringify(find(since(t), 'POST', /^\/channels\/303\/messages$/))) &&
     find(since(t), 'PATCH', /members\/\d+$/).filter(x => x.body.communication_disabled_until).length >= 1);

  console.log('\nлестница до бана:');
  const g = bot._test.guilds.get(G);
  const A = require('./discordAutomod.js');
  t = Date.now();
  const r1 = await bot._test.punish(g, { id: 'U8' }, A.finding('scam'), {});
  const r2 = await bot._test.punish(g, { id: 'U8' }, A.finding('scam'), {});
  const r3 = await bot._test.punish(g, { id: 'U8' }, A.finding('scam'), {});
  ok('3, 6, 9 баллов: мьют на час, на 3 дня, бан навсегда', r1.step.ms === 3600000 && r2.step.ms === 3 * 86400000 &&
     r3.step.type === 'ban' && !r3.step.ms && !bot._test.state().unbans[G + ':U8'],
     [r1, r2, r3].map(r => require('./discordRules.js').describe(r.step)).join(' / '));
  await bot._test.punish(g, { id: 'U18' }, A.finding('scam'), {});
  await bot._test.punish(g, { id: 'U18' }, A.finding('scam'), {});
  const r7 = await bot._test.punish(g, { id: 'U18' }, A.finding('caps'), {});
  ok('7 баллов — бан на неделю, бот запомнил, когда его снять', r7.step.type === 'ban' && r7.step.ms === 7 * 86400000 &&
     bot._test.state().unbans[G + ':U18'] > Date.now() + 6 * 86400000);
  c = since(t);
  const dmBan = c.findIndex(x => x.method === 'POST' && x.path === '/channels/dmU8/messages' && /banned/.test(JSON.stringify(x.body)));
  const banCall = c.findIndex(x => x.method === 'PUT' && /bans\/U8$/.test(x.path));
  ok('сначала личное сообщение, потом бан (иначе не дойдёт)', dmBan !== -1 && banCall > dmBan);

  console.log('\nсекретные команды владельца:');
  const cb = (list, id) => find(list, 'POST', new RegExp('^/interactions/' + id + '/[^/]+/callback$'));
  let iid = 0;
  const press = (uid, customId) => { const id = 'b' + (++iid);
    dispatch('INTERACTION_CREATE', { id, token: 'tk' + id, type: 3, guild_id: G, channel_id: CH.general,
      member: { user: { id: uid }, permissions: uid === OWNER ? String(1n << 3n) : '1024' },
      message: { id: 'panelmsg' }, data: { custom_id: customId, component_type: 2 } });
    return id; };
  const submit = (customId, components, resolved) => { const id = 'm' + (++iid);
    dispatch('INTERACTION_CREATE', { id, token: 'tk' + id, type: 5, guild_id: G, channel_id: CH.general,
      member: { user: { id: OWNER }, permissions: String(1n << 3n) }, data: { custom_id: customId, components, resolved } });
    return id; };
  const panelOf = list => { const pm = find(list, 'POST', /^\/channels\/300\/messages$/).find(x => x.body && x.body.components);
    return pm && { msg: pm, id: pm.body.components[0].components[0].custom_id }; };

  t = Date.now();
  const cmd = say(OWNER, '!qanews');
  await waitFor(() => panelOf(since(t)));
  c = since(t);
  let panel = panelOf(c);
  ok('«!qanews» от владельца — сообщение с командой сразу удалено', find(c, 'DELETE', new RegExp('/messages/' + cmd.id + '$')).length === 1);
  ok('вместо него — панель с одной кнопкой, без текста и упоминаний', panel && !panel.msg.body.content && !panel.msg.body.embeds &&
     panel.msg.body.components[0].components.length === 1 && panel.msg.body.allowed_mentions.parse.length === 0);
  t = Date.now();
  say('U0', '!qanews');
  say('U9', '!qawarn <@U1> test', { member: member([MOD_ROLE]), mentions: [{ id: 'U1' }] });
  await sleep(300);
  ok('у игрока и модератора «!» команды не срабатывают (и не удаляются)', since(t).length === 0, since(t).map(x => x.method + ' ' + x.path).join(' | '));
  t = Date.now();
  let bid = press('U0', panel.id);
  await waitFor(() => cb(since(t), bid).length);
  ok('чужое нажатие на кнопку — отказ, видит только он', cb(since(t), bid)[0].body.type === 4 && cb(since(t), bid)[0].body.data.flags === 64 &&
     /Only the server owner/.test(JSON.stringify(cb(since(t), bid)[0].body)));
  t = Date.now();
  bid = press(OWNER, panel.id);
  await waitFor(() => cb(since(t), bid).length);
  const modal = cb(since(t), bid)[0].body;
  const types = modal.data.components.map(x => x.type + ':' + x.component.type).join(',');
  ok('владелец нажал — открылось окно: канал списком, заголовок, текст, картинки, кнопка-ссылка', modal.type === 9 && types === '18:8,18:4,18:4,18:19,18:4', types);
  ok('в окне по умолчанию — канал, где набрана команда', modal.data.components[0].component.default_values[0].id === CH.general);
  await sleep(150);
  ok('панель исчезла сразу после нажатия', find(since(t), 'DELETE', new RegExp('^/channels/300/messages/' + panel.msg.resId + '$')).length === 1);

  t = Date.now();
  const sid = submit('news:' + CH.general, [
    { type: 18, id: 1, component: { type: 8, custom_id: 'channel', values: [CH.news2] } },
    { type: 18, id: 2, component: { type: 4, custom_id: 'title', value: 'Tournament on Friday' } },
    { type: 18, id: 3, component: { type: 4, custom_id: 'text', value: 'Join us @everyone, ask @Moderator in #general.\nhttps://aibrofist.online/race' } },
    { type: 18, id: 4, component: { type: 19, custom_id: 'images', values: ['att1', 'att2', 'att3', 'att4'] } },
    { type: 18, id: 5, component: { type: 4, custom_id: 'link', value: 'aibrofist.online/race' } }
  ], { attachments: {
    att1: { id: 'att1', filename: 'one.png', content_type: 'image/png', size: 7, url: 'http://127.0.0.1:' + port + '/cdn/pic.png' },
    att2: { id: 'att2', filename: 'two.png', content_type: 'image/png', size: 7, url: 'http://127.0.0.1:' + port + '/cdn/pic.png' },
    // без типа от Discord — узнаём картинку по имени файла
    att3: { id: 'att3', filename: 'three.JPG', size: 7, url: 'http://127.0.0.1:' + port + '/cdn/pic.png' },
    // скачать не выйдет — покажем по ссылке и скажем владельцу
    att4: { id: 'att4', filename: 'four.png', content_type: 'image/png', size: 7, url: 'http://127.0.0.1:' + port + '/cdn/missing.png' } } });
  await waitFor(() => find(since(t), 'PATCH', new RegExp('tk' + sid + '/messages/@original$')).length);
  c = since(t);
  ok('окно отправлено — сначала «думаю» (только владельцу)', cb(c, sid)[0] && cb(c, sid)[0].body.type === 5 && cb(c, sid)[0].body.data.flags === 64);
  const post = find(c, 'POST', /^\/channels\/306\/messages$/)[0];
  const payload = post && JSON.parse((/name="payload_json"\r\nContent-Type: application\/json\r\n\r\n(.*)\r\n/.exec(post.raw) || [])[1] || 'null');
  ok('пост ушёл в выбранный канал, картинки загружены заново', post && /multipart/.test(post.ct) &&
     /filename="image1\.png"/.test(post.raw) && /filename="image2\.png"/.test(post.raw) && /filename="image3\.jpg"/.test(post.raw));
  const texts = partsOf(payload, 10).map(x => x.content), gallery = (partsOf(payload, 12)[0] || { items: [] }).items.map(x => x.media.url);
  ok('пост — карточка в рамке, без обычного текста и вставок', payload && payload.flags === 32768 && payload.components.length === 1 &&
     payload.components[0].type === 17 && payload.components[0].accent_color > 0 && !payload.embeds && !payload.content);
  ok('в рамке: заголовок крупно, текст, картинки сеткой', texts[0] === '## Tournament on Friday' && /^Join us/.test(texts[1]) &&
     gallery.slice(0, 3).join() === 'attachment://image1.png,attachment://image2.png,attachment://image3.jpg', gallery);
  ok('внизу — линия и мелкая подпись с датой', partsOf(payload, 14).length === 1 && /^-# AIBROFIST .*<t:\d+:D>$/.test(texts[texts.length - 1]));
  ok('@Роль и #канал в тексте стали упоминанием и ссылкой', /<@&200>/.test(texts[1]) && /<#300>/.test(texts[1]));
  ok('@everyone и роль пингуют прямо из карточки', /@everyone/.test(texts[1]) &&
     payload.allowed_mentions.parse.indexOf('everyone') !== -1 && payload.allowed_mentions.parse.indexOf('roles') !== -1);
  const btn = (partsOf(payload, 1)[0] || { components: [] }).components[0];
  ok('кнопка-ссылка внизу карточки', btn && btn.style === 5 && btn.url === 'https://aibrofist.online/race' && btn.label === 'aibrofist.online' &&
     parts(payload).slice(-1)[0].type === 1);
  const reply = JSON.stringify(find(c, 'PATCH', new RegExp('tk' + sid + '/messages/@original$'))[0].body);
  ok('владельцу — «опубликовано» со ссылкой на пост', /Posted in <#306>: https:\/\/discord\.com\/channels\/100\/306\/\d+/.test(reply));
  ok('картинку, которую не скачать, показывает по ссылке и говорит об этом владельцу', gallery[3] === 'http://127.0.0.1:' + port + '/cdn/missing.png' &&
     /four\.png: could not copy it/.test(reply), reply);

  console.log('\nзапасное окно (если Discord не покажет новое):');
  rejectNewModal = true;
  t = Date.now();
  say(OWNER, '!qanews');
  await waitFor(() => panelOf(since(t)));
  panel = panelOf(since(t));
  t = Date.now();
  bid = press(OWNER, panel.id);
  await waitFor(() => cb(since(t), bid).length >= 2);
  const second = cb(since(t), bid)[1] && cb(since(t), bid)[1].body;
  ok('после отказа показывает простое окно из текстовых полей', second && second.type === 9 && second.data.components.every(x => x.type === 1) &&
     second.data.components[0].components[0].value === 'general');
  rejectNewModal = false;
  t = Date.now();
  const sid2 = submit('news:' + CH.general, [
    { type: 1, components: [{ type: 4, custom_id: 'channel', value: '#news' }] },
    { type: 1, components: [{ type: 4, custom_id: 'title', value: '' }] },
    { type: 1, components: [{ type: 4, custom_id: 'text', value: 'Short note' }] },
    { type: 1, components: [{ type: 4, custom_id: 'images', value: 'https://aibrofist.online/a.png' }] },
    { type: 1, components: [{ type: 4, custom_id: 'link', value: '' }] }]);
  await waitFor(() => find(since(t), 'PATCH', new RegExp('tk' + sid2 + '/messages/@original$')).length);
  const post2 = find(since(t), 'POST', /^\/channels\/306\/messages$/)[0];
  ok('пост из простого окна: канал по имени, картинка по ссылке, без кнопки', post2 && post2.body.flags === 32768 &&
     partsOf(post2.body, 10)[0].content === 'Short note' && partsOf(post2.body, 12)[0].items[0].media.url === 'https://aibrofist.online/a.png' &&
     partsOf(post2.body, 1).length === 0);

  console.log('\nостальные команды:');
  t = Date.now();
  say(OWNER, '!qaupdates');
  await waitFor(() => panelOf(since(t)));
  panel = panelOf(since(t));
  t = Date.now();
  bid = press(OWNER, panel.id);
  await waitFor(() => cb(since(t), bid).length);
  const um = cb(since(t), bid)[0].body;
  ok('«!updates» — окно со списком каналов (до 5)', um.type === 9 && um.data.components[0].component.type === 8 && um.data.components[0].component.max_values === 5);
  t = Date.now();
  const sid3 = submit('updates:' + G, [{ type: 18, component: { type: 8, custom_id: 'channels', values: [CH.updates, CH.news2] } }]);
  await waitFor(() => find(since(t), 'PATCH', new RegExp('tk' + sid3 + '/messages/@original$')).length);
  ok('каналы новостей запомнены', bot.feedChannels().join() === CH.updates + ',' + CH.news2, bot.feedChannels().join());

  t = Date.now();
  const w = say(OWNER, '!qawarn <@U2> 7 selling coins', { mentions: [{ id: 'U2', member: { roles: [] } }] });
  await waitFor(() => find(since(t), 'PATCH', /members\/U2$/).length);
  c = since(t);
  ok('«!warn @игрок 7 причина» — второй балл, мьют на 10 минут, правило 7', find(c, 'DELETE', new RegExp('/messages/' + w.id + '$')).length === 1 &&
     (bot._test.state().strikes[G + ':U2'] || []).length === 2 && (bot._test.state().strikes[G + ':U2'] || [])[1].r === 7);
  t = Date.now();
  say(OWNER, '!qawarn <@U3> again', { mentions: [{ id: 'U3', member: { roles: [], communication_disabled_until: new Date(Date.now() + 7 * 86400000).toISOString() } }] });
  await waitFor(() => find(since(t), 'POST', /^\/channels\/303\/messages$/).length);
  ok('уже замьюченного на неделю — мьют не сокращает', find(since(t), 'PATCH', /members\/U3$/).length === 0);
  t = Date.now();
  say(OWNER, '!qamute <@U5> 1h flooding', { mentions: [{ id: 'U5', member: { roles: [] } }] });
  await waitFor(() => find(since(t), 'PATCH', /members\/U5$/).length);
  const m5 = find(since(t), 'PATCH', /members\/U5$/)[0];
  const u5 = Date.parse(m5.body.communication_disabled_until) - Date.now();
  ok('«!mute @игрок 1h» — мьют на час', u5 > 59 * 60000 && u5 <= 60 * 60000);
  await sleep(200);
  const conf = find(since(t), 'POST', /^\/channels\/300\/messages$/).find(x => /muted for 1 hour/.test(x.body.content || ''));
  ok('подтверждение в канале без пинга, исчезает само', conf && conf.body.allowed_mentions.parse.length === 0);
  t = Date.now();
  say(OWNER, '!qamute <@' + OWNER + '> 1h');
  say(OWNER, '!qawarn <@U9> x', { mentions: [{ id: 'U9', member: { roles: [MOD_ROLE] } }] });
  await sleep(300);
  ok('себя наказать нельзя; модератора можно', find(since(t), 'PATCH', new RegExp('members/' + OWNER + '$')).length === 0 &&
     (bot._test.state().strikes[G + ':U9'] || []).length === 1);
  t = Date.now();
  say(OWNER, '!qastrikes <@U1>', { mentions: [{ id: 'U1' }] });
  await waitFor(() => panelOf(since(t)));
  panel = panelOf(since(t));
  t = Date.now();
  bid = press(OWNER, panel.id);
  await waitFor(() => cb(since(t), bid).length);
  ok('«!strikes» — список баллов только владельцу', cb(since(t), bid)[0].body.data.flags === 64 && /rule 1/.test(JSON.stringify(cb(since(t), bid)[0].body)));
  t = Date.now();
  say(OWNER, '!qa help');
  await waitFor(() => panelOf(since(t)));
  panel = panelOf(since(t));
  t = Date.now();
  bid = press(OWNER, panel.id);
  await waitFor(() => cb(since(t), bid).length);
  ok('«!qa help» — список команд (с секретным началом) только владельцу', /!qanews/.test(JSON.stringify(cb(since(t), bid)[0].body)) && cb(since(t), bid)[0].body.data.flags === 64);
  t = Date.now();
  bid = press(OWNER, panel.id);
  await waitFor(() => cb(since(t), bid).length);
  ok('нажатая панель больше не работает', /expired/.test(JSON.stringify(cb(since(t), bid)[0].body)));
  t = Date.now();
  say(OWNER, '!hello there');
  say(OWNER, '!news');
  say(OWNER, '!help');
  await sleep(250);
  ok('без секретного начала и неизвестные команды — обычные сообщения, не трогаем', since(t).length === 0);

  console.log('\nправила сервера и свои запрещённые слова:');
  t = Date.now();
  say(OWNER, '!qarules');
  await waitFor(() => panelOf(since(t)));
  panel = panelOf(since(t));
  t = Date.now();
  bid = press(OWNER, panel.id);
  await waitFor(() => cb(since(t), bid).length);
  const rm = cb(since(t), bid)[0].body;
  const rtypes = rm.data.components.map(x => x.type + ':' + x.component.type).join(',');
  ok('«!rules» — окно: канал, заголовок, правила по-английски и по-русски, свои слова', rm.type === 9 && rtypes === '18:8,18:4,18:4,18:4,18:4', rtypes);
  const pre = id => (rm.data.components.find(x => x.component.custom_id === id) || {}).component || {};
  ok('в окне уже вписаны стандартные правила и наказания', /1\. Be respectful/.test(pre('en').value) && /Permanent ban/.test(pre('en').value) &&
     /Бан навсегда/.test(pre('ru').value) && !pre('words').value);
  const rulesForm = (words, title) => [
    { type: 18, component: { type: 8, custom_id: 'channel', values: [CH.rules] } },
    { type: 18, component: { type: 4, custom_id: 'title', value: title } },
    { type: 18, component: { type: 4, custom_id: 'en', value: pre('en').value } },
    { type: 18, component: { type: 4, custom_id: 'ru', value: pre('ru').value } },
    { type: 18, component: { type: 4, custom_id: 'words', value: words } }];
  t = Date.now();
  ok('в окне по умолчанию — канал #rules', pre('channel').default_values && pre('channel').default_values[0].id === CH.rules);
  const rid = submit('rules:' + CH.general, rulesForm('bananas, Free  Robux\nbananas', 'Server Rules'));
  await waitFor(() => find(since(t), 'PATCH', new RegExp('tk' + rid + '/messages/@original$')).length);
  const redit = find(since(t), 'PATCH', new RegExp('^/channels/301/messages/' + (rpost && rpost.resId) + '$'))[0];
  ok('правила в #rules исправлены на месте (тот же пост, нового нет)', redit && find(since(t), 'POST', /^\/channels\/301\/messages$/).length === 0 &&
     partsOf(redit.body, 10)[0].content === '## Server Rules' && partsOf(redit.body, 1)[0].components[0].custom_id === 'rules:ru');
  ok('свои слова запомнены, без повторов', JSON.stringify(bot._test.state().guilds[G].words) === '["bananas","free robux"]',
     JSON.stringify(bot._test.state().guilds[G].words));
  t = Date.now();
  bid = press('U0', 'rules:ru');
  await waitFor(() => cb(since(t), bid).length);
  const rru = cb(since(t), bid)[0] && cb(since(t), bid)[0].body;
  ok('«Русский» может нажать любой — русские правила видит только он', rru && rru.type === 4 && rru.data.flags === (64 | 32768) &&
     /Уважайте друг друга/.test(JSON.stringify(rru.data.components)));
  t = Date.now();
  dispatch('INTERACTION_CREATE', { id: 'dm1', token: 'tkdm1', type: 3, channel_id: 'dmOWNER', user: { id: OWNER },
    data: { custom_id: 'rules:ru', component_type: 2 } });
  await waitFor(() => cb(since(t), 'dm1').length);
  ok('и в личке (превью правил) кнопка «Русский» тоже работает', cb(since(t), 'dm1')[0] &&
     /Уважайте друг друга/.test(JSON.stringify(cb(since(t), 'dm1')[0].body.data.components)));
  t = Date.now();
  const bw = say('U20', 'I really love bananas');
  await waitFor(() => find(since(t), 'DELETE', new RegExp('/messages/' + bw.id + '$')).length);
  await sleep(150);
  const s20 = bot._test.state().strikes[G + ':U20'] || [];
  ok('сообщение со своим запрещённым словом удалено, балл по правилам сервера', s20.length === 1 && s20[0].k === 'custom');
  t = Date.now();
  const rid2 = submit('rules:' + CH.general, rulesForm('', 'Server Rules'));
  await waitFor(() => find(since(t), 'PATCH', new RegExp('tk' + rid2 + '/messages/@original$')).length);
  ok('повторный «!rules» в тот же канал правит прежний пост, а не дублирует', rpost &&
     find(since(t), 'PATCH', new RegExp('^/channels/301/messages/' + rpost.resId + '$')).length === 1 &&
     find(since(t), 'POST', /^\/channels\/301\/messages$/).length === 0);
  ok('слова можно убрать', bot._test.state().guilds[G].words.length === 0);

  console.log('\nбан и разбан:');
  t = Date.now();
  say(OWNER, '!qaban <@U21> 7d cheating', { mentions: [{ id: 'U21', member: { roles: [] } }] });
  await waitFor(() => find(since(t), 'PUT', /bans\/U21$/).length);
  await sleep(150);
  c = since(t);
  const un21 = bot._test.state().unbans[G + ':U21'];
  ok('«!ban @игрок 7d причина» — бан на неделю, бот запомнил, когда снять', un21 && Math.abs(un21 - Date.now() - 7 * 86400000) < 60000);
  const dm21 = c.findIndex(x => x.method === 'POST' && x.path === '/channels/dmU21/messages' && /banned for 7 days/.test(JSON.stringify(x.body)));
  ok('сначала личное сообщение со сроком, потом бан', dm21 !== -1 && c.findIndex(x => x.method === 'PUT' && /bans\/U21$/.test(x.path)) > dm21);
  t = Date.now();
  await bot._test.releaseBans(Date.now() + 8 * 86400000);
  ok('срок вышел — бот сам снимает бан и пишет в журнал', find(since(t), 'DELETE', /bans\/U21$/).length === 1 &&
     !bot._test.state().unbans[G + ':U21'] && /Temporary ban is over/.test(JSON.stringify(find(since(t), 'POST', /^\/channels\/303\/messages$/))));
  t = Date.now();
  say(OWNER, '!qaban <@U22> scam links', { mentions: [{ id: 'U22', member: { roles: [] } }] });
  await waitFor(() => find(since(t), 'PUT', /bans\/U22$/).length);
  await sleep(100);
  ok('«!ban» без срока — навсегда', !bot._test.state().unbans[G + ':U22'] &&
     /Case \d+: scam links/.test(decodeURIComponent(find(since(t), 'PUT', /bans\/U22$/)[0].reason || '')));
  t = Date.now();
  say(OWNER, '!qaunban <@U22>', { mentions: [{ id: 'U22' }] });
  await waitFor(() => find(since(t), 'DELETE', /bans\/U22$/).length);
  ok('«!unban» снимает бан', find(since(t), 'DELETE', /bans\/U22$/).length === 1);

  console.log('\nновости и Logs в Discord:');
  process.env.DISCORD_UPDATES_CHANNEL_ID = CH.updates;
  const feed = require('./updatesFeed.js');
  let hook = null;
  // новость до запуска бота (её не публикуем) и сегодняшняя
  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(process.env.UPDATES_FILE, JSON.stringify([
    { id: '2026-10-13-1', date: '2026-10-13', title: 'Old news', text: 'old' },
    { id: today + '-1', date: today, title: 'Discord bot 🎉', text: '- First line\n- Second line' }]));
  const logged = [];
  t = Date.now();
  denied.add(CH.updates);              // в #updates боту пока писать нельзя
  feed.start({ onLogChange: fn => { hook = fn; }, removeAutoLogs: () => 0, addAutoLog: (src, title) => { logged.push(src + '|' + title); } });
  await waitFor(() => logged.length);
  await sleep(200);
  const fresh = find(since(t), 'POST', /^\/channels\/(302|306)\/messages$/);
  ok('новость из updates.json — во все каналы новостей, потом в Logs', fresh.length === 2 && logged.length === 1 &&
     logged[0] === 'upd:' + today + '-1|Discord bot', logged.join());
  ok('и в Discord, и в Logs — без эмодзи', fresh[0] && partsOf(fresh[0].body, 10)[0].content === '## Discord bot');
  const when = fresh[0] && /<t:(\d+):f>/.exec(partsOf(fresh[0].body, 10).slice(-1)[0].content);
  ok('время на карточке — момент выхода, а не полночь даты', when && Math.abs(when[1] * 1000 - Date.now()) < 60000, when && when[0]);
  ok('новости, вышедшие до появления бота, не публикуются', !JSON.stringify(fresh).includes('Old news'));
  const err = feed.status().lastError;
  ok('нет прав в #updates — это видно на странице состояния', err && err.channel === CH.updates && err.status === 403, err);
  denied.delete(CH.updates);           // права выдали
  t = Date.now();
  hook('add', { id: 77, title: 'New maps', text: '- Two new race maps\n- Faster loading', images: [{ u: '/logimg/a.png' }], date: Date.now() });
  await waitFor(() => find(since(t), 'POST', /^\/channels\/(302|306)\/messages$/).length >= 2);
  const sent = find(since(t), 'POST', /^\/channels\/(302|306)\/messages$/);
  ok('запись Logs ушла во все каналы новостей (#updates и выбранный командой)', sent.length === 2);
  ok('права выдали — старая ошибка со страницы состояния ушла', feed.status().lastError === null, feed.status().lastError);
  const e = sent[0] && sent[0].body, et = partsOf(e, 10).map(x => x.content);
  const ebtn = (partsOf(e, 1)[0] || { components: [] }).components[0];
  ok('карточка в рамке: заголовок, список, картинка, дата и кнопка на Logs', e && e.flags === 32768 && et[0] === '## New maps' &&
     /^- Two/.test(et[1]) && /\/logimg\/a\.png$/.test(partsOf(e, 12)[0].items[0].media.url) && /^-# AIBROFIST .*<t:\d+:f>$/.test(et[2]) &&
     ebtn && ebtn.style === 5 && /\/logs$/.test(ebtn.url) && e.allowed_mentions.parse.length === 0);
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
  ok('без привилегированных intents переподключается без них', ident2 && ident2.d.intents === (1 | 4 | 512 | 2097152), ident2 && ident2.d.intents);
  await sleep(800);
  c = since(t);
  ok('после перезапуска ничего не постит заново (команды, AutoMod)',
     find(c, 'PUT', /commands$/).length === 0 && find(c, 'POST', /auto-moderation/).length === 0 &&
     find(c, 'POST', /^\/channels\/301\/messages$/).length === 0);
  ok('баллы пережили перезапуск', (bot._test.state().strikes[G + ':U1'] || []).length === 1);

  bot.stop();
  wss.close(); server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('✗ тест упал:', e.stack); process.exit(1); });
