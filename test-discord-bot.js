/* Бот Discord целиком, против поддельного Discord (свой HTTP API и Gateway
   на localhost — настоящий токен не нужен):
   - входит с нужными intents, включает встроенную AutoMod, правил в #rules
     сам не пишет (их пишет владелец) и слэш-команд не заводит;
   - автомодерация: удаляет нарушения, у каждого из 9 правил своё наказание
     (баллов нет), пишет игроку в личку и в mod-log; правила — и для модераторов,
     и для владельца (владельцу и администраторам — предупреждение без мьюта:
     Discord их мьютить не даёт);
   - спам — больше 3 сообщений за 2 секунды: сообщения удаляются, на 5-й раз
     мьют на 10 минут;
   - участники: рейд (много входов больше 100 за минуту) — входящие в мьют;
     ники, аватарки и дату создания аккаунта бот не смотрит; политика
     не нарушение; продажа аккаунтов, «мне 11 лет» (только сообщение владельцу);
   - второй канал чтения («ловец»): раз в секунду спрашивает у Discord, что
     пришло после последнего прочитанного, и разбирает то, что живое
     подключение не принесло; то, что пришло по обоим путям, разбирается
     один раз; ветки читаются; после перезапуска доразбирается то, что пришло
     за время простоя; потеря сообщений подключением — повод его переоткрыть;
   - бот никого не пингует: предупреждения в канале и ответы на команды — обычным
     текстом с именем, без упоминаний; цель команды — имя (без @), id или упоминание;
   - «!warn» — кнопка с формой, где обязательны игрок, правило и причина; в канале
     сообщение-карточка: правило, причина, какое по счёту; предупреждения копятся —
     3-е за 30 дней даёт мьют на час; «!warns» показывает их, «!unwarn» снимает;
   - ответы бота — настоящие сообщения Discord (рамка, текст, аватарка, серые кнопки)
     с флагами English / Русский, в том числе правила в #rules; Discord сообщение
     не принял — прежний текст;
   - секретные команды владельца (начало задаётся на хостинге, здесь «!qa»):
     news, updates, warn, mute, clear, help — сообщение с командой исчезает,
     без секретного начала не срабатывают, окно видит только
     владелец, у остальных команды не срабатывают; пост с картинками,
     упоминаниями и кнопкой-ссылкой; запасное окно, если новое Discord
     не покажет;
   - новости и записи Logs уходят во все выбранные каналы, правка и удаление
     повторяются в Discord;
   - /servers и /account ник — сообщением с кнопками (обновить, вкладки, период,
     ссылка, язык); команды и нажатия идут по живому подключению, не через сайт;
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
// ответ с файлом приходит multipart: JSON — в поле payload_json, дальше файлы
function multipartOf(c) {
  if (!c || !/multipart\/form-data/.test(c.ct)) return null;
  const m = /name="payload_json"\r\nContent-Type: application\/json\r\n\r\n([\s\S]*?)\r\n--aibrofist/.exec(c.raw);
  const files = [];
  c.raw.replace(/name="files\[\d+\]"; filename="([^"]+)"\r\nContent-Type: ([^\r]+)/g, (all, name, type) => { files.push(name + ' ' + type); });
  return { body: m ? JSON.parse(m[1]) : null, files, png: /PNG\r\n\x1a\n/.test(c.raw) };
}
// тело запроса: JSON, а с файлами — payload_json из multipart
const bodyOf = c => !c ? null : c.body || (multipartOf(c) || {}).body || null;
const J = c => JSON.stringify(bodyOf(c));
// все части сообщения (обычного, ответа на нажатие или правки) — рамка, текст, ряды кнопок, кнопки, аватарка
const comps = b => (b && (b.data ? b.data.components : b.components)) || [];
const walkAll = (n, fn) => { if (Array.isArray(n)) n.forEach(x => walkAll(x, fn)); else if (n && typeof n === 'object') { fn(n); walkAll(n.components, fn); if (n.accessory) walkAll(n.accessory, fn); } };
const textsOf = b => { const out = []; walkAll(comps(b), n => { if (n.type === 10) out.push(n.content); }); return out; };
// то, что в сообщении написано, одной строкой без разметки Discord (жирный, код, заголовки, мелкий шрифт, экранирование)
const plain = s => String(s).replace(/\\([\\*_`~|>#\[\]()<@:-])/g, '$1').replace(/[*`]/g, '').replace(/^(#{1,3}|-#)\s+/gm, '').replace(/\s+/g, ' ').trim();
const plainOf = c => plain(textsOf(bodyOf(c)).join('\n'));
// строки кнопок сообщения, все кнопки, кнопки с флагами; аватарка (справа в заголовке)
const rowsOf = b => { const r = []; walkAll(comps(b), n => { if (n.type === 1) r.push(n); }); return r; };
const buttonsOf = b => rowsOf(b).flatMap(r => r.components);
const flagsOf = b => { const r = rowsOf(b).find(x => x.components.some(c => c.emoji)); return r ? r.components : []; };
const thumbOf = c => { let u = null; walkAll(comps(bodyOf(c)), n => { if (n.type === 11) u = n.media.url; }); return u; };
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
let msgId = 5000, rateLimitedOnce = false, rejectNewModal = false, rejectUpdate = false, amRules = [];
let rejectV2Reply = false, rejectV2Post = false, rejectV2Edit = false;     // Discord не принимает новые сообщения: ответ на команду, пост в канал, правку «думаю…»
const chatLog = new Map();           // канал -> сообщения, которые есть в Discord (их отдаёт GET), даже если подключение их не принесло
let threadsActive = [];              // открытые ветки сервера
let appUrl = 'https://aibrofist.online/discord/interactions';   // как было у настоящего бота: команды шли через сайт
const known = new Set();
let pollCount = 0;
const directory = [];                // участники сервера для поиска по имени: { user: { id, username, global_name }, nick, roles }
const banList = [];                  // список банов сервера: { user }
const history = new Map();           // канал -> сообщения (новые первыми) для «!clear»
const denied = new Set();            // каналы, куда боту писать нельзя (403)
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    const p = req.url.replace(/^\/api\/v10/, '');
    let json = null;
    try { json = body ? JSON.parse(body) : null; } catch (e) {}
    // с файлами: JSON сообщения — в поле payload_json
    const pj = (() => { const mm = !json && /name="payload_json"\r\nContent-Type: application\/json\r\n\r\n([\s\S]*?)\r\n--aibrofist/.exec(body);
      try { return mm ? JSON.parse(mm[1]) : null; } catch (e) { return null; } })();
    // запросы второго канала чтения (раз в секунду по каждому каналу) в журнал вызовов не пишем: он нужен для того, что бот сделал
    const polled = req.method === 'GET' && /^\/channels\/(\w+)\/messages\?(?:after=\w+&)?limit=(?:1|50)$/.test(p) && !history.has((/^\/channels\/(\w+)/.exec(p) || [])[1]);
    const threadPoll = req.method === 'GET' && /^\/guilds\/\w+\/threads\/active$/.test(p);
    if (polled || threadPoll) pollCount++;
    else calls.push({ method: req.method, path: p, body: json, raw: body, ct: req.headers['content-type'] || '',
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
      if (rejectV2Post && json && (json.flags & 32768)) return send(400, { code: 50035, message: 'Invalid Form Body' });
      const id = String(++msgId); known.add(id);
      calls[calls.length - 1].resId = id;
      return send(200, { id, channel_id: m[1] });
    }
    if (req.method === 'PATCH' && (m = /^\/channels\/\w+\/messages\/(\w+)$/.exec(p))) return known.has(m[1]) ? send(200, { id: m[1] }) : send(404, { code: 10008 });
    if (req.method === 'DELETE' && /^\/channels\/312\/messages\/\w+$/.test(p)) return setTimeout(() => send(204), 20);   // медленный канал
    if (req.method === 'DELETE' && /^\/channels\/\w+\/messages\/\w+$/.test(p)) return send(204);
    if (req.method === 'GET' && (m = /^\/channels\/(\w+)\/messages\?(.*)$/.exec(p)) && !history.has(m[1])) {
      const q = new URLSearchParams(m[2]), after = q.get('after'), lim = Number(q.get('limit') || 50);
      const list = (chatLog.get(m[1]) || []).slice().sort((a, b) => (a.id.length - b.id.length) || (a.id < b.id ? -1 : 1));
      if (after) return send(200, list.filter(x => x.id.length > after.length || (x.id.length === after.length && x.id > after)).slice(0, lim));
      return send(200, list.slice(-lim).reverse());            // без after — самые новые первыми
    }
    if (req.method === 'GET' && /^\/guilds\/\w+\/threads\/active$/.test(p)) return send(200, { threads: threadsActive });
    if (req.method === 'GET' && (m = /^\/channels\/(\w+)\/messages\?(.*)$/.exec(p)) && history.has(m[1])) {
      const q = new URLSearchParams(m[2]), before = q.get('before'), list = history.get(m[1]);
      const from = before ? list.findIndex(x => x.id === before) + 1 : 0;
      return send(200, list.slice(from, from + Number(q.get('limit') || 50)));
    }
    if (/bulk-delete$/.test(p)) return send(204);
    if (p === '/applications/@me') {
      if (req.method === 'PATCH' && json && 'interactions_endpoint_url' in json) appUrl = json.interactions_endpoint_url;
      return send(200, { id: APP, interactions_endpoint_url: appUrl });
    }
    if (/^\/applications\/\w+\/guilds\/\w+\/commands$/.test(p)) return send(200, []);
    if (/^\/applications\/\w+\/commands$/.test(p)) return send(200, json || []);
    if (req.method === 'GET' && /auto-moderation\/rules$/.test(p)) return send(200, amRules);
    if (req.method === 'DELETE' && /auto-moderation\/rules\/\w+$/.test(p)) return send(204);
    if (req.method === 'POST' && /auto-moderation\/rules$/.test(p)) return send(200, { id: 'am' + (++msgId) });
    if (req.method === 'GET' && (m = /^\/guilds\/\w+\/members\/search\?(.*)$/.exec(p))) {
      const q = (new URLSearchParams(m[1]).get('query') || '').toLowerCase();
      return send(200, directory.filter(x => [x.nick, x.user.username, x.user.global_name].filter(Boolean).some(n => n.toLowerCase().indexOf(q) === 0)).slice(0, 10));
    }
    if (req.method === 'GET' && /^\/guilds\/\w+\/bans\?/.test(p)) return send(200, banList);
    if (req.method === 'GET' && (m = /^\/guilds\/\w+\/members\/(\w+)$/.exec(p)) && directory.some(x => x.user.id === m[1])) return send(200, directory.find(x => x.user.id === m[1]));
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
      if (rejectUpdate && (json || pj) && (json || pj).type === 7) return send(400, { code: 50035, message: 'Invalid Form Body' });
      if (rejectV2Reply && json && json.type === 4 && json.data && (json.data.flags & 32768)) return send(400, { code: 50035, message: 'Invalid Form Body' });
      return send(204);
    }
    if (/^\/webhooks\//.test(p)) {
      if (rejectV2Edit && req.method === 'PATCH' && json && (json.flags & 32768)) return send(400, { code: 50035, message: 'Invalid Form Body' });
      return send(200, {});
    }
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
  roles: [{ id: G, name: '@everyone', permissions: '1024' }, { id: MOD_ROLE, name: 'Moderator', permissions: String(1n << 13n) },
          { id: '202', name: 'Developer', permissions: '8' }],
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
// «ничего не сделал»: удаление бота собственных коротких предупреждений (они гаснут сами через 10 секунд) не в счёт
const quietSince = t => since(t).filter(c => !(c.method === 'DELETE' && known.has(c.path.split('/').pop())));
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
    DISCORD_CMD_PREFIX: 'qa', UPDATES_FILE: path.join(tmp, 'updates.json'), DISCORD_RULES_CHANNEL_ID: CH.rules,
    NEWS_DIR: path.join(tmp, 'news'), SERVERS_DATA_DIR: path.join(tmp, 'srv'),
    DISCORD_THREADS_POLL_MS: '1000'      // ветки второй канал ищет раз в секунду, а не раз в 10
  });
  fs.mkdirSync(path.join(tmp, 'news'));
  fs.writeFileSync(path.join(tmp, 'news', 'shot.png'), 'PNG');
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
  ok('список участников для проверки ников не запрашивает: ники бот не смотрит', !gwLog.some(m => m.op === 8) && find(calls, 'PATCH', /members\//).length === 0);
  ok('токен — из DISCORD_BOT_TOKEN', ident && ident.d.token === 'test-token');
  await waitFor(() => find(calls, 'POST', /auto-moderation\/rules$/).length >= 1);
  const cmds = find(calls, 'PUT', /^\/applications\/700\/guilds\/100\/commands$/);
  ok('слэш-команд на сервере нет (старые, если были, убраны)', cmds.length === 1 && Array.isArray(cmds[0].body) && cmds[0].body.length === 0);
  await waitFor(() => find(calls, 'PUT', /^\/applications\/700\/commands$/).length);
  const gcmds = find(calls, 'PUT', /^\/applications\/700\/commands$/);
  const nick = gcmds[0] && gcmds[0].body[1] && (gcmds[0].body[1].options || [])[0];
  ok('у приложения две команды для всех — /servers и /account (старая /say убрана: список заменяется целиком)', gcmds.length === 1 &&
     gcmds[0].body.map(c => c.name).join() === 'servers,account' && gcmds[0].body.every(c => !c.default_member_permissions),
     gcmds[0] && JSON.stringify(gcmds[0].body.map(c => c.name)));
  ok('/account: обязательный ник с подсказками по мере ввода', nick && nick.name === 'nick' && nick.type === 3 && nick.required && nick.autocomplete);
  await waitFor(() => find(calls, 'PATCH', /^\/applications\/@me$/).length);
  ok('команды и нажатия — по живому подключению: адрес на сайте убран (через сайт бывало по 20+ секунд)',
     appUrl === null && find(calls, 'PATCH', /^\/applications\/@me$/)[0].body.interactions_endpoint_url === null);
  await waitFor(() => find(calls, 'POST', /^\/channels\/301\/messages$/).length >= 1);
  await sleep(200);
  const rauto = find(calls, 'POST', /^\/channels\/301\/messages$/);
  const rpost = rauto[0], rb = bodyOf(rpost) || {}, rbtns = flagsOf(rb), rtxt = plainOf(rpost);
  ok('правила сам выложил в #rules — один пост настоящим сообщением Discord (рамка и текст, не картинка), никого не пингуя; 7 правил, без политики, ников и расы',
     rauto.length === 1 && !multipartOf(rpost) && rb.flags === 32768 && rb.components.length === 1 && rb.components[0].type === 17 && rb.components[0].accent_color > 0 &&
     !rb.attachments && !rb.embeds && !rb.content && /^AIBROFIST Server Rules 1 No spam MUTE 10 MINUTES /.test(rtxt) && /7 No other people's IP addresses/.test(rtxt) &&
     !/8 |politic|nickname|\brace\b|strike/i.test(rtxt) && rb.allowed_mentions.parse.length === 0, rtxt.slice(0, 80));
  ok('у каждого правила своё наказание и короткая строка; никаких картинок, логотипа и описаний (alt)', /2 No invites to other Discord servers WARNING /.test(rtxt) &&
     /5 No scams or dangerous links BAN 7 DAYS /.test(rtxt) && !/"type":12|"type":13|"description"|attachment:/.test(JSON.stringify(rb)));
  ok('предупреждения копятся — это тоже в правилах: 3-е за 30 дней даёт мьют на час', /Warnings add up: the 3rd within 30 days gives a 1-hour mute/.test(rtxt));
  ok('под правилами флаги English и Русский (текст меняется в этом же посте) и глобус «My language» (правила на языке самого нажавшего); кнопки серые, выбранный не нажимается, русского отдельного поста нет', rbtns.length === 3 &&
     rbtns[0].custom_id === 'rules-lang' && rbtns[0].disabled && rbtns[0].emoji.name === '🇬🇧' && rbtns[0].style === 2 && rbtns[1].custom_id === 'rules:ru' &&
     rbtns[1].label === 'Русский' && rbtns[1].emoji.name === '🇷🇺' && rbtns[1].style === 2 && !rbtns[1].disabled && rbtns[2].custom_id === 'rules:me' &&
     rbtns[2].label === 'My language' && rbtns[2].emoji.name === '🌐' && rbtns[2].style === 2 && !/Без спама/.test(JSON.stringify(rb)));
  ok('кнопок темы больше нет — один ряд', rowsOf(rb).length === 1 && !/Dark theme|Light theme/.test(JSON.stringify(rb)));
  ok('пост запомнен (с временем выкладки, картинкой), разовая замена правил отмечена', bot._test.state().guilds[G].rules.message === rpost.resId &&
     bot._test.state().guilds[G].rules.ruMessage === undefined && bot._test.state().guilds[G].rules.at > 0 && bot._test.state().guilds[G].rules.pic === true &&
     bot._test.state().fixes.rules7 === true && bot._test.state().fixes.rulesCard === 4);
  const am = find(calls, 'POST', /auto-moderation\/rules$/).map(c => c.body.trigger_type).sort().join(',');
  ok('включает встроенную AutoMod только со списком слов вражды и 18+ (спама и упоминаний в правилах больше нет)', am === '4', am);

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
  ok('обычное сообщение не трогает', quietSince(t).length === 0, since(t).map(c => c.method + ' ' + c.path).join(' | '));

  t = Date.now();
  const bad = say('U1', 'ты пидор');
  await waitFor(() => find(since(t), 'POST', /^\/channels\/303\/messages$/).length);
  let c = since(t);
  ok('слово вражды — сообщение удалено', find(c, 'DELETE', new RegExp('/messages/' + bad.id + '$')).length === 1);
  const mute1 = find(c, 'PATCH', /^\/guilds\/100\/members\/U1$/)[0];
  const until1 = mute1 && Date.parse(mute1.body.communication_disabled_until) - Date.now();
  ok('правило 4 — мьют на час', until1 > 59 * 60000 && until1 <= 60 * 60000, Math.round(until1 / 1000) + ' с');
  ok('в журнале аудита есть причина', mute1 && /Case 1/.test(decodeURIComponent(mute1.reason || '')));
  const dmMsg = find(c, 'POST', /^\/channels\/dmU1\/messages$/)[0];
  const dmText = plainOf(dmMsg), dmBody = bodyOf(dmMsg);
  ok('игроку в личку — сообщением: правило, наказание, без баллов, как оспорить', dmBody && dmBody.flags === 32768 && !multipartOf(dmMsg) &&
     /^Muted · 1 hour playerU1 Rule: 4\. No hate speech /.test(dmText) && /Until: /.test(dmText) && !/strike/i.test(dmText) && /Message the owner/.test(dmText), dmText);
  ok('без эмодзи (флаги — только на кнопках языка), кнопки серые: English и Русский', dmMsg && !/\p{Extended_Pictographic}/u.test(JSON.stringify(textsOf(dmBody))) &&
     flagsOf(dmBody).map(b => b.label + ':' + b.style).join() === 'English:2,Русский:2,My language:2' && buttonsOf(dmBody).every(b => b.style === 2 || b.style === 5));
  const note = find(c, 'POST', /^\/channels\/300\/messages$/)[0];
  ok('короткое предупреждение в канале — с именем, но без упоминания и без пинга', note && /^\*\*playerU1\*\*, your message was removed: rule 4/.test(note.body.content) &&
     /Mute for 1 hour\.$/.test(note.body.content) && !/<@/.test(note.body.content) && note.body.allowed_mentions.parse.length === 0 &&
     !note.body.allowed_mentions.users, note && note.body.content);
  const log1 = find(c, 'POST', /^\/channels\/303\/messages$/)[0];
  ok('запись в mod-log: номер случая, наказание, никого не пингует', log1 && /Case 1 \| Mute for 1 hour/.test(log1.body.embeds[0].title) && log1.body.allowed_mentions.parse.length === 0);
  await sleep(10600);
  ok('предупреждение в канале само удаляется через 10 с', note && find(calls, 'DELETE', new RegExp('^/channels/300/messages/' + note.resId + '$')).length === 1);

  t = Date.now();
  const modMsg = say('U19', 'ты пидор', { member: member([MOD_ROLE]) });
  await waitFor(() => find(since(t), 'PATCH', /members\/U19$/).length);
  await waitFor(() => find(since(t), 'POST', /^\/channels\/303\/messages$/).length);    // запись в журнал — последнее, что бот делает
  ok('модератора — как всех: удалено и мьют', find(since(t), 'DELETE', new RegExp('/messages/' + modMsg.id + '$')).length === 1 &&
     find(since(t), 'PATCH', /members\/U19$/).length === 1);
  t = Date.now();
  const ownMsg = say(OWNER, 'ты пидор');
  await waitFor(() => find(since(t), 'POST', /^\/channels\/dm900\/messages$/).length);
  await waitFor(() => find(since(t), 'POST', /^\/channels\/303\/messages$/).length);
  const ownDm = J(find(since(t), 'POST', /^\/channels\/dm900\/messages$/)[0]);
  ok('владельца тоже: удалено и предупреждение, но без мьюта (Discord не даёт)',
     find(since(t), 'DELETE', new RegExp('/messages/' + ownMsg.id + '$')).length === 1 &&
     find(since(t), 'PATCH', new RegExp('members/' + OWNER + '$')).length === 0 &&
     /not applied: the server owner cannot be muted or banned/i.test(ownDm), ownDm.slice(0, 200));
  t = Date.now();
  const admMsg = say('A1', 'ты пидор', { member: member(['202']) });
  await waitFor(() => find(since(t), 'POST', /^\/channels\/dmA1\/messages$/).length);
  await waitFor(() => find(since(t), 'POST', /^\/channels\/303\/messages$/).length);    // запись в журнал — последнее, что бот делает
  ok('администратора: удалено и предупреждение, мьюта нет (Discord не даёт мьютить администраторов)',
     find(since(t), 'DELETE', new RegExp('/messages/' + admMsg.id + '$')).length === 1 && find(since(t), 'PATCH', /members\/A1$/).length === 0 &&
     /administrators cannot be muted/.test(J(find(since(t), 'POST', /^\/channels\/dmA1\/messages$/)[0])));

  console.log('\nспам — больше 3 сообщений за 2 секунды:');
  t = Date.now();
  say('U2', 'one'); say('U2', 'two'); say('U2', 'three');
  await sleep(300);
  ok('3 сообщения подряд — ещё не спам', quietSince(t).length === 0, since(t).map(c => c.method + ' ' + c.path).join(' | '));
  await sleep(2200);
  t = Date.now();
  const burst = [0, 1, 2, 3].map(i => say('U2', 'spam number ' + i));
  await waitFor(() => find(since(t), 'POST', /^\/channels\/300\/messages$/).length);
  await sleep(250);
  c = since(t);
  const delCount = (list, ids) => find(list, 'POST', /bulk-delete$/).reduce((n, x) => n + x.body.messages.filter(id => ids.indexOf(id) !== -1).length, 0) +
                                 find(list, 'DELETE', /\/messages\/\d+$/).filter(x => ids.some(id => x.path.endsWith('/' + id))).length;
  ok('4 сообщения за 2 секунды — спам: все 4 удалены', delCount(c, burst.map(m => m.id)) === 4, delCount(c, burst.map(m => m.id)));
  const slow1 = find(c, 'POST', /^\/channels\/300\/messages$/)[0];
  ok('в первый раз — только «помедленнее» (1 из 5), без мьюта, без записи в mod-log и без личного сообщения',
     slow1 && /^\*\*playerU2\*\*, slow down: more than 3 messages within 2 seconds is spam \(rule 1, 1 of 5\)/.test(slow1.body.content) && !/<@/.test(slow1.body.content) &&
     find(c, 'PATCH', /members\/U2$/).length === 0 && find(c, 'POST', /^\/channels\/303\/messages$/).length === 0 &&
     find(c, 'POST', /^\/channels\/dmU2\/messages$/).length === 0, slow1 && slow1.body.content);
  // ещё 3 пачки по 4 сообщения: 2-е, 3-е и 4-е срабатывание — мьюта всё ещё нет
  for (let k = 0; k < 3; k++) { for (let i = 0; i < 4; i++) say('U2', 'again ' + k + '/' + i); await sleep(120); }
  await sleep(350);
  ok('со 2-го по 4-е срабатывание — мьюта по-прежнему нет', find(since(t), 'PATCH', /members\/U2$/).length === 0);
  t = Date.now();
  for (let i = 0; i < 4; i++) say('U2', 'last ' + i);
  await waitFor(() => find(since(t), 'PATCH', /members\/U2$/).length);
  await sleep(250);
  c = since(t);
  const mute2 = find(c, 'PATCH', /members\/U2$/)[0];
  const until2 = mute2 && Date.parse(mute2.body.communication_disabled_until) - Date.now();
  ok('5-е срабатывание — мьют на 10 минут', until2 > 9 * 60000 && until2 <= 10 * 60000, Math.round(until2 / 1000) + ' с');
  ok('игроку в личку правило 1 и мьют, в mod-log — случай', /1\. No spam/.test(J(find(c, 'POST', /^\/channels\/dmU2\/messages$/)[0])) &&
     /Mute for 10 minutes/.test(JSON.stringify(find(c, 'POST', /^\/channels\/303\/messages$/)[0].body)));
  await sleep(5200);                      // «помедленнее» — не чаще раза в 5 секунд
  t = Date.now();
  for (let i = 0; i < 4; i++) say('U2', 'after ' + i);
  await waitFor(() => find(since(t), 'POST', /^\/channels\/300\/messages$/).length);
  await sleep(250);
  ok('после мьюта счёт начался заново: снова «1 из 5», а не второй мьют', /\(rule 1, 1 of 5\)/.test(find(since(t), 'POST', /^\/channels\/300\/messages$/)[0].body.content) &&
     find(since(t), 'PATCH', /members\/U2$/).length === 0);
  t = Date.now();
  say('U2b', 'hello'); say('U2c', 'hello'); say('U2b', 'again'); say('U2c', 'again');
  await sleep(250);
  ok('у каждого игрока свой счёт: 2 + 2 сообщения от двоих — не спам', quietSince(t).length === 0);

  t = Date.now();
  say('U3', 'free nitro for everyone https://dlscord.gift/abc');
  await waitFor(() => find(since(t), 'PUT', /bans\/U3$/).length);
  await sleep(100);
  ok('мошенническая ссылка — правило 5: бан на 7 дней, бот запомнил, когда снять', find(since(t), 'PATCH', /members\/U3$/).length === 0 &&
     Math.abs(bot._test.state().unbans[G + ':U3'] - Date.now() - 7 * 86400000) < 60000);

  t = Date.now();
  const okMsgs = [say('U4', 'come to my server discord.gg/own'), say('U4', 'my stuff discord.gg/other', { channel_id: CH.promo }),
                  say('U5', 'https://pornhub.com/x', { channel_id: CH.nsfw })];
  await sleep(400);
  // удаления «помедленнее» от прежних нарушений (они гаснут сами через 10 секунд) сюда не относятся
  ok('своё приглашение, реклама в #self-promo, 18+ в канале 18+ — можно', okMsgs.every(m => find(since(t), 'DELETE', new RegExp('/messages/' + m.id + '$')).length === 0) &&
     find(since(t), 'PATCH', /members\/(U4|U5)$/).length === 0 && find(since(t), 'PUT', /bans\/(U4|U5)$/).length === 0);
  t = Date.now();
  const inv = say('U4', 'join us discord.gg/other');
  await waitFor(() => find(since(t), 'DELETE', new RegExp(inv.id + '$')).length);
  await waitFor(() => find(since(t), 'POST', /^\/channels\/dmU4\/messages$/).length);
  ok('приглашение на чужой сервер — правило 2: удалено, предупреждение, без мьюта', find(since(t), 'DELETE', new RegExp(inv.id + '$')).length === 1 &&
     find(since(t), 'PATCH', /members\/U4$/).length === 0 && /2\. No invites to other Discord servers/.test(J(find(since(t), 'POST', /^\/channels\/dmU4\/messages$/)[0])) &&
     /^Warning · 1 of 3 playerU4 Rule: 2\. /.test(plainOf(find(since(t), 'POST', /^\/channels\/dmU4\/messages$/)[0])));
  await waitFor(() => find(since(t), 'POST', /^\/channels\/300\/messages$/).length);
  const invNote = find(since(t), 'POST', /^\/channels\/300\/messages$/)[0];
  ok('в канале коротко: правило и какое это предупреждение по счёту', invNote && /no invites to other discord servers\. Warning 1 of 3\.$/.test(invNote.body.content), invNote && invNote.body.content);

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
  dispatch('AUTO_MODERATION_ACTION_EXECUTION', { guild_id: G, action: { type: 1 }, rule_id: 'r3', rule_trigger_type: 3,
    user_id: 'U8', channel_id: CH.general, content: 'hey check this out' });
  dispatch('AUTO_MODERATION_ACTION_EXECUTION', { guild_id: G, action: { type: 1 }, rule_id: 'r4', rule_trigger_type: 4,
    user_id: 'U9', channel_id: CH.general, content: 'some word from the preset list' });
  dispatch('AUTO_MODERATION_ACTION_EXECUTION', { guild_id: G, action: { type: 2 }, rule_id: 'r5', rule_trigger_type: 1,
    user_id: 'U6', channel_id: CH.general, content: 'alert only, not a block' });
  await sleep(350);
  ok('догадки Discord (упоминания, спам, общий список слов) и просто оповещения — без наказания: AutoMod и так не пропустила',
     quietSince(t).length === 0, since(t).map(x => x.method + ' ' + x.path).join(' | '));
  t = Date.now();
  dispatch('AUTO_MODERATION_ACTION_EXECUTION', { guild_id: G, action: { type: 1 }, rule_id: 'r4', rule_trigger_type: 4,
    user_id: 'U10', channel_id: CH.general, content: 'ты пидор' });
  await waitFor(() => find(since(t), 'PATCH', /members\/U10$/).length);
  ok('слово вражды из списка Discord — подтверждено самим ботом: правило 4, мьют на час, без сообщения в канал',
     Date.parse(find(since(t), 'PATCH', /members\/U10$/)[0].body.communication_disabled_until) - Date.now() > 59 * 60000 &&
     find(since(t), 'POST', /^\/channels\/300\/messages$/).length === 0);
  t = Date.now();
  dispatch('AUTO_MODERATION_ACTION_EXECUTION', { guild_id: G, action: { type: 1 }, rule_id: 'r9', rule_trigger_type: 1,
    user_id: 'U11', channel_id: CH.general, content: 'a word from the owner list', matched_keyword: 'owner-word' });
  await waitFor(() => find(since(t), 'POST', /^\/channels\/dmU11\/messages$/).length);
  await sleep(150);
  ok('слово из своего списка администратора — только предупреждение, без мьюта', find(since(t), 'PATCH', /members\/U11$/).length === 0 &&
     /Warning/.test(J(find(since(t), 'POST', /^\/channels\/dmU11\/messages$/)[0])));

  console.log('\nпродажа, политика, чужой IP, «мне 11 лет»:');
  t = Date.now();
  const sale = say('V1', 'продам акк за 500 руб, пишите');
  await waitFor(() => find(since(t), 'POST', /^\/channels\/dmV1\/messages$/).length);
  await waitFor(() => find(since(t), 'POST', /^\/channels\/303\/messages$/).length);    // запись в журнал — последнее, что бот делает
  ok('продажа аккаунта за деньги — правило 6: удалено, предупреждение, без мьюта', find(since(t), 'DELETE', new RegExp(sale.id + '$')).length === 1 &&
     find(since(t), 'PATCH', /members\/V1$/).length === 0 && /6\. No selling accounts or coins for real money/.test(J(find(since(t), 'POST', /^\/channels\/dmV1\/messages$/)[0])));
  t = Date.now();
  const pol = say('V2', 'а что вы думаете про путина и выборы?');
  await sleep(300);
  ok('политика — больше не нарушение: ничего не тронуто', quietSince(t).length === 0, since(t).map(x => x.method + ' ' + x.path).join(' | '));
  t = Date.now();
  const ip = say('V5', 'my ip is 85.143.20.11 add me');
  await waitFor(() => find(since(t), 'POST', /^\/channels\/303\/messages$/).length);
  c = since(t);
  ok('похоже на IP — правило 7: скрыто, без наказания, владельцу сообщение', find(c, 'DELETE', new RegExp(ip.id + '$')).length === 1 &&
     find(c, 'PATCH', /members\/V5$/).length === 0 && /IP address/.test(JSON.stringify(find(c, 'POST', /^\/channels\/303\/messages$/)[0].body)));
  t = Date.now();
  const ch7 = say('V6', 'кидаю чит бесплатно скачать');
  const shout = say('V7', 'WHY IS THIS GAME SO HARD TODAY, YOU ARE SO STUPID', { mentions: [{ id: 'V6' }] });
  await sleep(300);
  ok('разговор о читах, капс и оскорбления — больше не нарушения: ничего не тронуто', quietSince(t).length === 0, since(t).map(x => x.method + ' ' + x.path).join(' | '));
  t = Date.now();
  const kid = say('V3', 'привет всем, мне 11 лет');
  await waitFor(() => find(since(t), 'POST', /^\/channels\/303\/messages$/).length);
  await sleep(150);
  const alertMsg = find(since(t), 'POST', /^\/channels\/303\/messages$/)[0];
  ok('«мне 11 лет» — не наказание: сообщение не удалено, владельцу в mod-log', alertMsg &&
     /under 13/.test(alertMsg.body.embeds[0].title) && find(since(t), 'DELETE', new RegExp(kid.id + '$')).length === 0 &&
     find(since(t), 'PATCH', /members\/V3$/).length === 0);
  t = Date.now();
  const evl = say('V4', '@everyone free gifts https://gift-drop.example.com');
  await waitFor(() => find(since(t), 'PUT', /bans\/V4$/).length);
  ok('@everyone со ссылкой — правило 5: бан на 7 дней', Math.abs(bot._test.state().unbans[G + ':V4'] - Date.now() - 7 * 86400000) < 60000);
  const snow = ms => String((BigInt(ms) - 1420070400000n) << 22n);
  t = Date.now();
  const nl = say(snow(Date.now() - 3600000), 'check this https://example.com/cool', { member: Object.assign(member(), { joined_at: new Date().toISOString() }) });
  await sleep(250);
  ok('новый аккаунт сразу после входа может слать ссылки (дату создания бот не смотрит)', find(since(t), 'DELETE', new RegExp(nl.id + '$')).length === 0);

  console.log('\nучастники:');
  t = Date.now();
  dispatch('GUILD_MEMBER_ADD', { guild_id: G, user: { id: 'W1', username: 'w1' }, nick: null, roles: [], joined_at: new Date().toISOString() });
  dispatch('GUILD_MEMBER_UPDATE', { guild_id: G, user: { id: 'W1', username: 'w1' }, nick: 'Модератор', roles: [] });
  dispatch('GUILD_MEMBER_ADD', { guild_id: G, user: { id: 'W2', username: 'n1gg3r' }, nick: '!!!Admin', roles: [] });
  await sleep(450);
  ok('ники бот не проверяет и не меняет: «Модератор», «!!!Admin», слова в имени — всё как есть, никому ничего не пишет',
     quietSince(t).length === 0, since(t).map(x => x.method + ' ' + x.path).join(' | '));
  t = Date.now();
  dispatch('GUILD_BAN_ADD', { guild_id: G, user: { id: 'B1', username: 'badguy', avatar: 'cafe1234' } });
  const B2 = snow(Date.now() - 86400000);
  dispatch('GUILD_MEMBER_ADD', { guild_id: G, user: { id: B2, username: 'newguy', avatar: 'cafe1234' }, roles: [] });
  await sleep(250);
  ok('та же аватарка, что у забаненного, — ничего (аватарки бот не смотрит)', find(since(t), 'PUT', new RegExp('bans/' + B2 + '$')).length === 0 &&
     !/avatar/i.test(JSON.stringify(find(since(t), 'POST', /^\/channels\/303\/messages$/))));
  t = Date.now();
  dispatch('GUILD_MEMBER_ADD', { guild_id: G, user: { id: 'B3', username: 'badguy' }, roles: [] });
  await waitFor(() => find(since(t), 'POST', /^\/channels\/303\/messages$/).length);
  ok('то же имя, что у забаненного, — только сообщение владельцу', find(since(t), 'PUT', /bans\/B3$/).length === 0 &&
     /second account/.test(JSON.stringify(find(since(t), 'POST', /^\/channels\/303\/messages$/)[0].body)));
  t = Date.now();
  // до этого за минуту зашли ещё 4 человека: 90 + 4 — меньше 100, ещё не рейд
  for (let i = 0; i < 90; i++) dispatch('GUILD_MEMBER_ADD', { guild_id: G, user: { id: snow(Date.now() - 400 * 86400000 - i), username: 'guest' + i }, roles: [] });
  await sleep(600);
  ok('94 входа за минуту — ещё не рейд: никого не мьютит', !/Raid/.test(JSON.stringify(find(since(t), 'POST', /^\/channels\/303\/messages$/))) &&
     find(since(t), 'PATCH', /members\/\d+$/).filter(x => x.body.communication_disabled_until).length === 0);
  t = Date.now();
  for (let i = 0; i < 15; i++) dispatch('GUILD_MEMBER_ADD', { guild_id: G, user: { id: snow(Date.now() - 400 * 86400000 - 100 - i), username: 'raider' + i }, roles: [] });
  await waitFor(() => find(since(t), 'POST', /^\/channels\/303\/messages$/).length && find(since(t), 'PATCH', /members\/\d+$/).length);
  await sleep(300);
  ok('больше 100 входов за минуту — рейд: сообщение владельцу и мьют всех входящих, даже старых аккаунтов',
     /Raid/.test(JSON.stringify(find(since(t), 'POST', /^\/channels\/303\/messages$/))) &&
     find(since(t), 'PATCH', /members\/\d+$/).filter(x => x.body.communication_disabled_until).length >= 4);

  console.log('\nвторой канал чтения — разбирает всё, что живое подключение не принесло:');
  // сообщение, которое есть в Discord (его отдаёт GET), но подключение его не прислало; ageMs — сколько назад оно отправлено
  const lost = (uid, content, ageMs, channel, extra) => {
    const m = Object.assign({ id: String(++mid), channel_id: channel || CH.general, type: 0, content, timestamp: new Date(Date.now() - ageMs).toISOString(),
      author: { id: uid, username: 'player' + uid }, mentions: [], mention_roles: [], attachments: [] }, extra || {});
    if (!chatLog.has(m.channel_id)) chatLog.set(m.channel_id, []);
    chatLog.get(m.channel_id).push(m);
    return m;
  };
  const w0 = (await bot.status()).watching;
  ok('всё до этого пришло по подключению; второй канал при этом работает раз в секунду и ничего не теряет', w0.fromLiveConnection > 30 &&
     w0.fromSecondReader === 0 && w0.rounds > 10 && w0.lostByLiveConnection === 0 && /^[0-3]s ago$/.test(w0.secondReader) && w0.every === '1s', JSON.stringify(w0));
  ok('и он на самом деле спрашивает Discord: запросов чтения каналов уже много', pollCount > 30, pollCount);
  t = Date.now();
  const m1 = lost('C1', 'free nitro for everyone https://dlscord.gift/abc', 3000);
  await waitFor(() => find(since(t), 'PUT', /bans\/C1$/).length, 8000);
  await waitFor(() => find(since(t), 'POST', /^\/channels\/dmC1\/messages$/).length, 3000);
  ok('сообщение, которое подключение не принесло, найдено за пару секунд и разобрано как обычное: удалено, бан за мошенничество (правило 5)',
     find(since(t), 'DELETE', new RegExp('/messages/' + m1.id + '$')).length === 1 && find(since(t), 'PUT', /bans\/C1$/).length === 1 &&
     /5\. No scams or dangerous links/.test(J(find(since(t), 'POST', /^\/channels\/dmC1\/messages$/)[0])));
  ok('нужные для наказания сведения об авторе взяты отдельно (роли, мьют)', find(since(t), 'GET', /^\/guilds\/100\/members\/C1$/).length === 1);
  t = Date.now();
  const m2 = lost('C2', 'join us discord.gg/other', 3000);
  dispatch('MESSAGE_CREATE', Object.assign({}, m2, { guild_id: G, member: member() }));
  await waitFor(() => find(since(t), 'POST', /^\/channels\/dmC2\/messages$/).length);
  await sleep(3200);
  ok('сообщение пришло и по подключению, и нашлось вторым каналом (в Discord оно одно) — разобрано один раз: одно удаление, одно предупреждение',
     find(since(t), 'DELETE', new RegExp('/messages/' + m2.id + '$')).length === 1 && find(since(t), 'POST', /^\/channels\/dmC2\/messages$/).length === 1);
  t = Date.now();
  const m4 = lost('C4', 'free nitro https://dlscord.gift/old', 40000);
  await sleep(100);
  const beforeKick = gwLog.length;
  const THREAD = snow(Date.now());
  threadsActive = [{ id: THREAD, name: 'help', type: 11, parent_id: CH.general }];
  await sleep(1300);                                        // ветку второй канал находит раз в секунду
  const m3 = lost('C3', 'free nitro https://dlscord.gift/thread', 3000, THREAD);
  await waitFor(() => find(since(t), 'PUT', /bans\/C3$/).length, 8000);
  ok('сообщения в ветках тоже читаются: ветка найдена, сообщение в ней разобрано', find(since(t), 'DELETE', new RegExp('/channels/' + THREAD + '/messages/' + m3.id + '$')).length === 1 &&
     find(since(t), 'PUT', /bans\/C3$/).length === 1);
  ok('сообщение 40-секундной давности (пока подключение «спало») тоже найдено и разобрано', find(since(t), 'PUT', /bans\/C4$/).length === 1);
  threadsActive = [];
  const kick = await waitFor(() => gwLog.slice(beforeKick).find(x => x.op === 6), 8000);
  ok('подключение дважды «потеряло» сообщения — бот сам переоткрыл его и продолжил ту же сессию (resume)', kick && kick.d.session_id === 'sess1');
  for (let i = 0; i < 40 && (await bot.status()).gateway.state !== 'ready'; i++) await sleep(100);
  const w1 = (await bot.status()).watching;
  ok('на странице состояния видно, сколько сообщений разобрано, кем принесено и сколько потеряло подключение', w1.fromSecondReader >= 3 && w1.lostByLiveConnection >= 2 &&
     w1.fromLiveConnection > w0.fromLiveConnection - 1 && w1.messagesChecked > 30, JSON.stringify(w1));
  ok('на странице состояния проблем нет, секретов нет', (await bot.status()).problems.join() === 'none' && !JSON.stringify(await bot.status()).includes('test-token'));

  console.log('\nкартинки в сообщениях (нейросеть может ошибаться):');
  // настоящие цифры: обычное фото (одетый человек в коридоре) — «порно» 87%
  const doubtful = { Porn: 0.87, Neutral: 0.12, Sexy: 0.007, Hentai: 0.003 };
  ok('уверенное 18+ (95%+) — удалить', bot._test.imageVerdict({ Porn: 0.97 }) === 'remove' && bot._test.imageVerdict({ Hentai: 0.96 }) === 'remove');
  ok('сомнительное (как то фото) — только показать модераторам', bot._test.imageVerdict(doubtful) === 'review');
  ok('обычная картинка — ничего', bot._test.imageVerdict({ Neutral: 0.9, Porn: 0.05 }) === null);

  console.log('\nу каждого правила — своё наказание, и оно не растёт:');
  const g = bot._test.guilds.get(G);
  const A = require('./discordAutomod.js');
  const RR = require('./discordRules.js');
  t = Date.now();
  const rs = await bot._test.punish(g, { id: 'U8' }, A.finding('scam'), {});
  ok('мошенничество (правило 5) — бан на 7 дней, бот запомнил, когда снять', rs.step.type === 'ban' && rs.step.ms === 7 * 86400000 &&
     bot._test.state().unbans[G + ':U8'] > Date.now() + 6 * 86400000);
  c = since(t);
  const dmBan = c.findIndex(x => x.method === 'POST' && x.path === '/channels/dmU8/messages' && /^Banned · 7 days /.test(plainOf(x)));
  const banCall = c.findIndex(x => x.method === 'PUT' && /bans\/U8$/.test(x.path));
  ok('сначала личное сообщение, потом бан (иначе не дойдёт)', dmBan !== -1 && banCall > dmBan);
  const steps = [];
  for (let i = 0; i < 4; i++) steps.push((await bot._test.punish(g, { id: 'U18' }, A.finding('slur'), { silent: true })).step);
  ok('слово вражды (правило 4) — мьют на час каждый раз, сколько ни нарушай: счёта нет', steps.every(x => x.type === 'mute' && x.ms === 3600000));
  const rk = [
    ['invite', 'warn'], ['nsfw-image', 'mute'], ['nsfw-link', 'mute'], ['selfharm', 'mute'], ['badfile', 'ban'], ['grabber', 'ban'],
    ['cheat', 'warn'], ['custom', 'warn'], ['native-word', 'warn']
  ];
  const got = [];
  for (const [i, [kind]] of rk.entries()) got.push(kind + ':' + (await bot._test.punish(g, { id: 'U19x' + i }, A.finding(kind), { silent: true })).step.type);
  ok('и остальные находки: приглашение — предупреждение, 18+ и «убей себя» — мьют, exe и IP-логгер — бан, продажа и свои слова — предупреждение',
     got.join() === rk.map(([k, w]) => k + ':' + w).join(), got.join());
  ok('баллов в состоянии бота нет вовсе', !('strikes' in bot._test.state()));

  console.log('\nпредупреждения засчитываются: 3-е за 30 дней — мьют на час:');
  const w1r = await bot._test.punish(g, { id: 'WX1', username: 'wx' }, A.finding('invite'), { silent: true });
  const w2r = await bot._test.punish(g, { id: 'WX1', username: 'wx' }, A.finding('cheat'), { silent: true });
  ok('каждое предупреждение запомнено: 1 из 3, потом 2 из 3, мьюта нет', w1r.warned.n === 1 && w2r.warned.n === 2 && !w2r.esc &&
     bot._test.state().warns[G + ':WX1'].length === 2 && bot._test.state().warns[G + ':WX1'][1].rule === 6);
  t = Date.now();
  const w3r = await bot._test.punish(g, { id: 'WX1', username: 'wx' }, A.finding('invite'), { silent: true });
  await sleep(100);
  c = since(t);
  const wmute = find(c, 'PATCH', /members\/WX1$/)[0], wleft = wmute && Date.parse(wmute.body.communication_disabled_until) - Date.now();
  ok('третье — мьют на час, счёт начинается заново', w3r.warned.n === 3 && w3r.esc && wleft > 59 * 60000 && wleft <= 60 * 60000 &&
     bot._test.state().warns[G + ':WX1'].every(w => w.used), Math.round(wleft / 1000) + ' с');
  ok('в личку и в журнал — что это 3-е предупреждение и мьют', /Warning 3 of 3: muted for 1 hour/.test(plainOf(find(c, 'POST', /^\/channels\/dmWX1\/messages$/)[0])) &&
     /Warning 3 of 3: mute for 1 hour/.test(JSON.stringify(find(c, 'POST', /^\/channels\/303\/messages$/).map(x => x.body))),
     plainOf(find(c, 'POST', /^\/channels\/dmWX1\/messages$/)[0]) + ' / ' + JSON.stringify(find(c, 'POST', /^\/channels\/303\/messages$/).map(x => x.body && x.body.embeds[0].title)));
  const w4r = await bot._test.punish(g, { id: 'WX1', username: 'wx' }, A.finding('invite'), { silent: true });
  ok('после мьюта — снова 1 из 3', w4r.warned.n === 1 && !w4r.esc);
  bot._test.state().warns[G + ':WX2'] = [{ at: Date.now() - 31 * 86400000, rule: 2, reason: 'old' }, { at: Date.now() - 40 * 86400000, rule: 2, reason: 'older' }];
  const w5r = await bot._test.punish(g, { id: 'WX2', username: 'wx2' }, A.finding('invite'), { silent: true });
  ok('предупреждения старше 30 дней не считаются', w5r.warned.n === 1);
  t = Date.now();
  for (let i = 0; i < 3; i++) await bot._test.punish(g, { id: OWNER, username: 'qwied' }, A.finding('invite'), { silent: true });
  ok('у владельца тоже считаются, но мьют Discord не даёт — не применяется', find(since(t), 'PATCH', new RegExp('members/' + OWNER + '$')).length === 0 &&
     /Not applied: the server owner cannot be muted or banned/.test(plainOf(find(since(t), 'POST', /^\/channels\/dm900\/messages$/).slice(-1)[0])));

  console.log('\nсекретные команды владельца:');
  const cb = (list, id) => find(list, 'POST', new RegExp('^/interactions/' + id + '/[^/]+/callback$'));
  let iid = 0;
  // legacy — нажатие на сообщение прежней версии бота (картинка с кнопками, не из новых компонентов Discord)
  const press = (uid, customId, legacy) => { const id = 'b' + (++iid);
    dispatch('INTERACTION_CREATE', { id, token: 'tk' + id, type: 3, guild_id: G, channel_id: CH.general,
      member: { user: { id: uid }, permissions: uid === OWNER ? String(1n << 3n) : '1024' },
      message: { id: 'panelmsg', flags: legacy ? 0 : 32768 }, data: { custom_id: customId, component_type: 2 } });
    return id; };
  const submit = (customId, components, resolved) => { const id = 'm' + (++iid);
    dispatch('INTERACTION_CREATE', { id, token: 'tk' + id, type: 5, guild_id: G, channel_id: CH.general,
      member: { user: { id: OWNER }, permissions: String(1n << 3n) }, data: { custom_id: customId, components, resolved } });
    return id; };
  const panelOf = list => { const pm = find(list, 'POST', /^\/channels\/300\/messages$/).find(x => x.body && x.body.components);
    return pm && { msg: pm, id: pm.body.components[0].components[0].custom_id }; };

  // «!warn»: бот ставит кнопку; нажатие открывает форму. Возвращает кнопку и окно
  const openWarn = async (text, classic) => {
    const t0 = Date.now();
    say(OWNER, '!qawarn' + (text ? ' ' + text : ''));
    await waitFor(() => panelOf(since(t0)));
    const pn = panelOf(since(t0)), t1 = Date.now(), b = press(OWNER, pn.id);
    await waitFor(() => cb(since(t1), b).length >= (classic ? 2 : 1));
    return { panel: pn, modal: cb(since(t1), b)[classic ? 1 : 0].body };
  };
  // отправка формы: user — { id, username, global_name } или null; rule — число или null; reason — текст
  const warnSend = (user, rule, reason) => submit('warn:' + CH.general, [
    { type: 18, component: { type: 5, custom_id: 'user', values: user ? [user.id] : [] } },
    { type: 18, component: { type: 3, custom_id: 'rule', values: rule === null ? [] : [String(rule)] } },
    { type: 18, component: { type: 4, custom_id: 'reason', value: reason } }],
    { users: user ? { [user.id]: user } : {}, members: user ? { [user.id]: { roles: user.roles || [], communication_disabled_until: user.until } } : {} });
  const cardOf = (list, id) => { const x = find(list, 'PATCH', new RegExp('tk' + id + '/messages/@original$'))[0]; return x ? J(x) : ''; };
  // ответ сообщением на нажатие: сразу (callback), правкой «думаю…» (@original) или новым сообщением (followup)
  const picAnswer = (list, id) => {
    const isV2 = y => y.body && ((y.body.data || y.body).flags & 32768);
    const x = cb(list, id).find(isV2) || find(list, 'PATCH', new RegExp('tk' + id + '/messages/@original$')).find(isV2) ||
              find(list, 'POST', new RegExp('^/webhooks/700/tk' + id + '$')).find(isV2);
    return x ? { call: x, body: x.body, data: x.body.data || x.body, alt: plainOf(x) } : null; };
  // карточка, выложенная ботом в канал (по началу текста)
  const cardIn = (list, re, ch) => find(list, 'POST', new RegExp('^/channels/' + (ch || CH.general) + '/messages$')).find(x => x.body && (x.body.flags & 32768) && re.test(plainOf(x)));

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
  ok('у игрока и модератора «!» команды не срабатывают (и не удаляются)', quietSince(t).length === 0, since(t).map(x => x.method + ' ' + x.path).join(' | '));
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
  const replyCall = find(c, 'PATCH', new RegExp('tk' + sid + '/messages/@original$'))[0], reply = plainOf(replyCall);
  const postBtn = rowsOf(bodyOf(replyCall))[0].components[0];
  ok('владельцу — карточка «опубликовано» с кнопкой-ссылкой на пост (сообщение Discord, а не картинка)', !multipartOf(replyCall) && bodyOf(replyCall).flags === 32768 && /^Post Posted in #news/.test(reply) &&
     /^https:\/\/discord\.com\/channels\/100\/306\/\d+$/.test(postBtn.url) && postBtn.label === 'Open the post' && postBtn.style === 5, reply);
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

  // участники сервера для поиска по имени и список банов (дальше они же нужны командам по имени)
  directory.push(
    { user: { id: '70001', username: 'alice_p', global_name: 'Alice' }, nick: null, roles: [] },
    { user: { id: '70002', username: 'bigbob', global_name: 'Bob' }, nick: 'Big Bob', roles: [] },
    { user: { id: '70003', username: 'sam', global_name: 'Sam' }, nick: null, roles: [] },
    { user: { id: '70004', username: 'samantha', global_name: 'Samantha' }, nick: null, roles: [] },
    { user: { id: '70005', username: 'quitter', global_name: null }, nick: null, roles: [] });
  banList.push({ user: { id: '71000', username: 'banned_guy', global_name: 'Banned Guy' } });
  console.log('\n«!warn» — форма, где всё обязательное:');
  t = Date.now();
  const wf = await openWarn('');
  const wcomps = wf.modal.data.components, wtypes = wcomps.map(x => x.type + ':' + x.component.type).join(',');
  const wopts = wcomps[1].component.options.map(o => o.value + '=' + o.label);
  ok('«!warn» — на месте команды кнопка «Open the warning form» (без текста и упоминаний)', wf.panel.msg.body.components[0].components[0].label === 'Open the warning form' &&
     !wf.panel.msg.body.content && wf.panel.msg.body.allowed_mentions.parse.length === 0);
  ok('по кнопке открывается форма: игрок (список участников), правило (список), причина (текст)', wf.modal.type === 9 && wf.modal.data.title === 'Warning' && wtypes === '18:5,18:3,18:4', wtypes);
  ok('все три поля обязательные; выбрать нужно ровно одного игрока и одно правило', wcomps.every(x => x.component.required === true) &&
     wcomps[0].component.min_values === 1 && wcomps[0].component.max_values === 1 && wcomps[1].component.min_values === 1 && wcomps[1].component.max_values === 1);
  ok('в списке правил — все 7 по номерам и «0. Other»', wopts.length === 8 && wopts[0] === '1=1. No spam' && wopts[6] === '7=7. No other people\'s IP addresses' && wopts[7] === '0=0. Other (explain in the reason)', wopts.join(' | '));
  ok('причина — не короче 3 знаков, не длиннее 300', wcomps[2].component.min_length === 3 && wcomps[2].component.max_length === 300 && wcomps[2].component.style === 2);
  ok('игрок в форму не вписан, если его не называли', !wcomps[0].component.default_values);
  t = Date.now();
  const wsid = warnSend({ id: 'U2', username: 'playerU2' }, 6, 'продавал монеты в чате за деньги');
  await waitFor(() => find(since(t), 'POST', /^\/channels\/dmU2\/messages$/).length);
  await sleep(250);
  c = since(t);
  const warnDm = plainOf(find(c, 'POST', /^\/channels\/dmU2\/messages$/)[0]);
  const warnCard = cardIn(c, /^Warning · 1 of 3 playerU2 /), wcAlt = warnCard ? plainOf(warnCard) : '', wcBody = bodyOf(warnCard);
  ok('форма отправлена — игроку в личку: правило, причина, кто выдал, какое по счёту; мьюта нет', /Rule: 6\. No selling accounts or coins for real money/.test(warnDm) &&
     /продавал монеты в чате за деньги/.test(warnDm) && /Issued by/.test(warnDm) && /Count: ●○○/.test(warnDm) && !/strike/i.test(warnDm) &&
     find(c, 'PATCH', /members\/U2$/).length === 0, warnDm);
  ok('в канале — карточка-сообщение: кого, правило, причина, 1 из 3; без упоминаний, без картинок', warnCard && !multipartOf(warnCard) && wcBody.flags === 32768 &&
     new RegExp('^Warning · 1 of 3 playerU2 Rule: 6\\. No selling accounts or coins for real money Reason: продавал монеты в чате за деньги Count: ●○○ ' +
                'The 3rd warning within 30 days gives a 1-hour mute\\. Issued by 900 · Case ' + bot._test.state().warns[G + ':U2'][0].caseNo + ' · ').test(wcAlt) &&
     wcBody.allowed_mentions.parse.length === 0 && !/<@/.test(JSON.stringify(wcBody)) && !/"description"|"type":12/.test(JSON.stringify(wcBody)), wcAlt);
  ok('под карточкой — флаги English и Русский, обе серые, выбранный не нажимается', flagsOf(wcBody).map(b => b.emoji.name + b.label + ':' + b.style + ':' + !!b.disabled).join() === '🇬🇧English:2:true,🇷🇺Русский:2:false,🌐My language:2:false');
  ok('карточка в канале и есть ответ: «думаю…», видное только владельцу, убрано; старого текстового предупреждения нет',
     find(c, 'DELETE', new RegExp('^/webhooks/700/tk' + wsid + '/messages/@original$')).length === 1 &&
     !find(c, 'POST', /^\/channels\/300\/messages$/).some(x => /received a warning/.test((x.body && x.body.content) || '')));
  ok('предупреждение засчитано: в памяти бота — правило, причина, кто выдал', bot._test.state().warns[G + ':U2'].length === 1 &&
     bot._test.state().warns[G + ':U2'][0].rule === 6 && bot._test.state().warns[G + ':U2'][0].by === '900');
  ok('в mod-log — случай с правилом и причиной', /Warning/.test(JSON.stringify(find(c, 'POST', /^\/channels\/303\/messages$/)[0].body)) &&
     /6\. No selling accounts/.test(JSON.stringify(find(c, 'POST', /^\/channels\/303\/messages$/)[0].body)));
  t = Date.now();
  const wsid2 = warnSend({ id: 'U3', username: 'playerU3', until: new Date(Date.now() + 7 * 86400000).toISOString() }, 0, 'грубил в чате');
  await waitFor(() => find(since(t), 'POST', /^\/channels\/dmU3\/messages$/).length);
  await sleep(250);
  await waitFor(() => cardIn(since(t), /^Warning · \d of 3 playerU3 /));
  const noteOther = plainOf(cardIn(since(t), /^Warning · \d of 3 playerU3 /));
  ok('«0. Other» — предупреждение без номера правила, только причина; уже действующий мьют не трогает', /^Warning · \d of 3 playerU3 Rule: Other Reason: грубил в чате /.test(noteOther) &&
     find(since(t), 'PATCH', /members\/U3$/).length === 0, noteOther);
  t = Date.now();
  const wsid3 = warnSend(null, null, '');
  await waitFor(() => cardOf(since(t), wsid3));
  ok('пустая форма не уходит (Discord и так не даёт, бот проверяет ещё раз): назван каждый недостающий пункт', cardOf(since(t), wsid3).indexOf('Not sent: fill in the member, the rule, the reason.') !== -1 &&
     find(since(t), 'POST', /^\/channels\/dm\w+\/messages$/).length === 0);
  t = Date.now();
  const wsid4 = warnSend({ id: 'U6', username: 'playerU6' }, null, 'ok');
  await waitFor(() => cardOf(since(t), wsid4));
  ok('нет правила и слишком короткая причина — тоже не уходит, названо что именно', cardOf(since(t), wsid4).indexOf('Not sent: fill in the rule, the reason.') !== -1 &&
     find(since(t), 'POST', /^\/channels\/dmU6\/messages$/).length === 0);
  t = Date.now();
  const wsid5 = warnSend({ id: OWNER, username: 'qwied' }, 1, 'тест на себе');
  await waitFor(() => cardOf(since(t), wsid5));
  ok('себя (владельца) и ботов предупреждать нельзя', /cannot be punished/.test(cardOf(since(t), wsid5)) && find(since(t), 'POST', /^\/channels\/dm900\/messages$/).length === 0);
  t = Date.now();
  const wsid6 = warnSend({ id: 'U9', username: 'playerU9', roles: [MOD_ROLE] }, 2, 'ссылка на чужой сервер');
  await waitFor(() => find(since(t), 'POST', /^\/channels\/dmU9\/messages$/).length);
  ok('модератора предупредить можно, как всех', find(since(t), 'POST', /^\/channels\/dmU9\/messages$/).length === 1 && /2\. No invites/.test(J(find(since(t), 'POST', /^\/channels\/dmU9\/messages$/)[0])));
  t = Date.now();
  rejectNewModal = true;
  const wc = await openWarn('', true);
  rejectNewModal = false;
  const wcrow = wc.modal.data.components.map(x => x.type + ':' + x.components[0].custom_id + ':' + x.components[0].required).join(',');
  ok('если Discord не покажет новую форму — простая: те же три поля текстом, все обязательные', wc.modal.type === 9 && wcrow === '1:user:true,1:rule:true,1:reason:true', wcrow);
  t = Date.now();
  const wsid7 = submit('warn:' + CH.general, [
    { type: 1, components: [{ type: 4, custom_id: 'user', value: 'quitter' }] },
    { type: 1, components: [{ type: 4, custom_id: 'rule', value: '3' }] },
    { type: 1, components: [{ type: 4, custom_id: 'reason', value: 'картинка 18+ в чате' }] }]);
  await waitFor(() => cardIn(since(t), /^Warning · \d of 3 quitter /));
  ok('простая форма: игрок по имени из списка сервера, правило цифрой, причина текстом', /Rule: 3\. No adult content Reason: картинка 18\+ в чате/.test(plainOf(cardIn(since(t), /^Warning · \d of 3 quitter /))) &&
     find(since(t), 'POST', /^\/channels\/dm70005\/messages$/).length === 1);
  t = Date.now();
  say(OWNER, '!qamute <@U5> 1h flooding', { mentions: [{ id: 'U5', member: { roles: [] } }] });
  await waitFor(() => find(since(t), 'PATCH', /members\/U5$/).length);
  const m5 = find(since(t), 'PATCH', /members\/U5$/)[0];
  const u5 = Date.parse(m5.body.communication_disabled_until) - Date.now();
  ok('«!mute @игрок 1h» — мьют на час', u5 > 59 * 60000 && u5 <= 60 * 60000);
  await waitFor(() => cardIn(since(t), /^Muted · 1 hour U5 /));
  const conf = cardIn(since(t), /^Muted · 1 hour U5 /);
  ok('итог в канале — карточка: кого, на сколько, за что, кто; без пинга', conf && /^Muted · 1 hour U5 Reason: flooding Until: .* Issued by player900 · Case \d+ · /.test(plainOf(conf)) &&
     bodyOf(conf).allowed_mentions.parse.length === 0, conf && plainOf(conf));
  t = Date.now();
  say(OWNER, '!qamute <@' + OWNER + '> 1h');
  await sleep(300);
  ok('себя наказать нельзя', find(since(t), 'PATCH', new RegExp('members/' + OWNER + '$')).length === 0);
  t = Date.now();
  say(OWNER, '!qastrikes <@U1>', { mentions: [{ id: 'U1' }] });
  say(OWNER, '!qapardon <@U1>', { mentions: [{ id: 'U1' }] });
  await sleep(300);
  ok('«!strikes» и «!pardon» больше нет: баллов нет, команды не узнаются (сообщения остаются обычными)', quietSince(t).length === 0, since(t).map(x => x.method + ' ' + x.path).join(' | '));
  t = Date.now();
  say(OWNER, '!qa help');
  await waitFor(() => panelOf(since(t)));
  panel = panelOf(since(t));
  t = Date.now();
  bid = press(OWNER, panel.id);
  await waitFor(() => cb(since(t), bid).length);
  await waitFor(() => picAnswer(since(t), bid), 5000);
  const hp = picAnswer(since(t), bid);
  ok('«!qa help» — сообщение со списком команд (с секретным началом) только владельцу, без страйков', hp && /!qanews Write a post/.test(hp.alt) &&
     /!qawarns \[name\] Warnings of a member or of all/.test(hp.alt) && /!qaunwarn name Remove warnings/.test(hp.alt) &&
     hp.data.flags === (32768 | 64) && hp.body.type === 4 && !/strike|pardon/i.test(hp.alt), hp && hp.alt.slice(0, 120));
  t = Date.now();
  bid = press(OWNER, panel.id);
  await waitFor(() => cb(since(t), bid).length);
  ok('нажатая панель больше не работает', /expired/.test(JSON.stringify(cb(since(t), bid)[0].body)));
  console.log('\n/servers и /account — сообщения Discord:');
  const cards = require('./discordData.js');
  // legacy — нажатие на сообщение прежней версии бота (картинка с кнопками): оно в новое не превращается
  // extra: { locale — язык Discord человека, msgFlags — флаги сообщения с кнопкой (по умолчанию новые компоненты) }
  const ix = (id, type, data, uid, legacy, extra) => dispatch('INTERACTION_CREATE', { id, token: 'tk' + id, type, guild_id: G, channel_id: CH.general,
    member: { user: { id: uid || 'U0' }, permissions: '1024' }, locale: extra && extra.locale,
    message: type === 3 ? { id: '1', flags: extra && extra.msgFlags !== undefined ? extra.msgFlags : legacy ? 0 : 32768 } : undefined, data });
  const labels = b => rowsOf(b).map(r => r.components.map(c => c.label + (c.disabled ? '(off)' : '') + (c.custom_id ? '=' + c.custom_id : '')).join(' | '));
  const allGrey = b => buttonsOf(b).every(x => x.style === 2 || x.style === 5);
  t = Date.now();
  ix('sv1', 2, { name: 'servers', type: 1 });
  await waitFor(() => cb(since(t), 'sv1').length, 5000);
  const sv = cb(since(t), 'sv1')[0], svp = plainOf(sv), svl = labels(sv && sv.body), svBtns = buttonsOf(sv && sv.body);
  ok('/servers может любой: ответ виден всем и сразу — сообщение Discord с комнатами обоих режимов, а не картинка', sv && sv.body.type === 4 &&
     sv.body.data.flags === 32768 && !multipartOf(sv) && !sv.body.data.attachments && /^Servers · 0 online Race · 0 players · 0 rooms /.test(svp) &&
     /Hide and Seek · 0 players · 0 rooms/.test(svp) && !/"type":12|"type":13|"description"/.test(JSON.stringify(sv.body)), svp);
  ok('и быстро: ' + (sv ? sv.t - t : '?') + ' мс', sv && sv.t - t < 1500);
  ok('кнопки в один ряд: «Refresh», ссылка «Play now», флаги языка; все серые (чёрных и синих в Discord нет), выбранный язык не нажимается', svl.length === 1 &&
     svl[0] === 'Refresh=sv:r:en | Play now | English(off)=sv-lang | Русский=sv:r:ru | My language=sv:r:me' && allGrey(sv.body) && svBtns[1].style === 5 &&
     /^https:\/\/aibrofist\.online/.test(svBtns[1].url) && sv.body.data.components[0].type === 17, svl.join(' || '));
  ok('в ответе /servers никого не пингует', sv && sv.body.data.allowed_mentions.parse.length === 0);
  t = Date.now();
  ix('sv2', 3, { custom_id: 'sv:r:en', component_type: 2 }, 'U5');
  await waitFor(() => cb(since(t), 'sv2').length, 5000);
  const sv2 = cb(since(t), 'sv2')[0];
  ok('«Refresh» — то же сообщение с новыми данными, прямо в нём (правка, не новое)', sv2 && sv2.body.type === 7 && sv2.body.data.flags === 32768 && /^Servers · 0 online /.test(plainOf(sv2)) &&
     labels(sv2.body)[0] === svl[0]);
  t = Date.now();
  ix('sv3', 3, { custom_id: 'sv:r:en', component_type: 2 }, 'U5');
  await waitFor(() => cb(since(t), 'sv3').length);
  ok('чаще раза в секунду от одного человека — не обновляет', cb(since(t), 'sv3')[0] && cb(since(t), 'sv3')[0].body.type === 6);
  t = Date.now();
  ix('sv3c', 3, { custom_id: 'sv:light', component_type: 2 }, 'U10', true);
  await waitFor(() => cb(since(t), 'sv3c').length, 5000);
  const sv3c = cb(since(t), 'sv3c')[0];
  ok('кнопки сообщений прежней версии (картинка, тема, страница) тоже работают: свежие данные новым сообщением, видным только нажавшему', sv3c && sv3c.body.type === 4 &&
     sv3c.body.data.flags === (32768 | 64) && /^Servers · 0 online /.test(plainOf(sv3c)));
  t = Date.now();
  ix('sv3d', 3, { custom_id: 'sv:dark:1:ru', component_type: 2 }, 'U13', true);
  await waitFor(() => cb(since(t), 'sv3d').length, 5000);
  ok('…в том числе со страницей, которой больше нет, и на русском', /^Серверы · онлайн: 0 /.test(plainOf(cb(since(t), 'sv3d')[0])));
  t = Date.now();
  ix('sv3e', 3, { custom_id: 'sv:r:ru', component_type: 2 }, 'U16');
  await waitFor(() => cb(since(t), 'sv3e').length, 5000);
  const sv3e = cb(since(t), 'sv3e')[0];
  ok('флаг «Русский» — то же сообщение по-русски, кнопки тоже', sv3e && sv3e.body.type === 7 && /^Серверы · онлайн: 0 Гонка · 0 игр\. · 0 комн\. /.test(plainOf(sv3e)) &&
     labels(sv3e.body)[0] === 'Обновить=sv:r:ru | Играть | English=sv:r:en | Русский(off)=sv-lang | Мой язык=sv:r:me' && allGrey(sv3e.body), labels(sv3e.body).join(' || '));
  rejectV2Reply = true;
  t = Date.now();
  ix('sv6', 2, { name: 'servers', type: 1 }, 'U12');
  await waitFor(() => cb(since(t), 'sv6').length >= 2);
  rejectV2Reply = false;
  const fb = cb(since(t), 'sv6');
  ok('Discord не принял сообщение — /servers всё равно отвечает: коротким текстом, который видит только спросивший', fb.length === 2 && fb[1].body.type === 4 &&
     (fb[1].body.data.flags & 64) && /Could not show this right now/.test(fb[1].body.data.content));

  const day = 24 * 3600 * 1000;
  const accountSource = {
    profile: n => String(n).toLowerCase() !== 'qwied' ? null : { at: Date.now(), name: 'qwied', joined: Date.now() - 30 * day, about: 'Hi',
      coins: 5, coinsDay: 1, coinsWeek: 2, score: 3, scoreDay: 0, scoreWeek: 0, hsScore: 0, hsScoreDay: 0, hsScoreWeek: 0,
      rank: { race: { rank: 'S' }, hs: null }, mapsCount: 1, friendsCount: 1, friends: [{ name: 'Ann', lastSeen: Date.now() }],
      maps: [{ mapName: 'Forest', mapType: 'race', rating: 2, likes: 3, dislikes: 1, date: Date.now(), inGame: true }] },
    search: (q, n) => ['qwied', 'qwerty', 'Ann'].filter(x => x.toLowerCase().indexOf(String(q).toLowerCase()) !== -1).slice(0, n)
  };
  cards.setSource(accountSource);
  t = Date.now();
  ix('ac1', 2, { name: 'account', type: 1, options: [{ name: 'nick', type: 3, value: 'QWIED' }] }, 'U7');
  await waitFor(() => cb(since(t), 'ac1').length, 5000);
  const ac = cb(since(t), 'ac1')[0], acl = labels(ac && ac.body), acp = plainOf(ac);
  ok('/account ник — профиль игрока сообщением (ник как в аккаунте), видят все, без картинок и логотипа', ac && ac.body.type === 4 && ac.body.data.flags === 32768 && !multipartOf(ac) &&
     /^qwied Joined .* · Race: S · Hide and Seek: no rank Coins 5 Race scores 3 Hide and Seek scores 0 Maps 1 · Friends 1 About Hi$/.test(acp) &&
     !/"type":12|"type":13|"description"/.test(JSON.stringify(ac.body)), acp);
  ok('вкладки (профиль, карты, друзья), период монет и очков, «Refresh», ссылка на профиль и флаги языка; выбранные не нажимаются, все кнопки серые', acl.length === 3 &&
     acl[0] === 'Profile(off)=ac-page | Maps=ac:m:all:en:qwied | Friends=ac:f:all:en:qwied' &&
     acl[1] === 'Today=ac:p:day:en:qwied | This week=ac:p:week:en:qwied | All time(off)=ac-per' &&
     acl[2] === 'Refresh=ac:p:all:en:qwied | Open profile | English(off)=ac-lang | Русский=ac:p:all:ru:qwied | My language=ac:p:all:me:qwied' && allGrey(ac.body) &&
     /^https:\/\/aibrofist\.online\/users\?name=qwied$/.test(buttonsOf(ac.body)[7].url), acl.join(' || '));
  const ids = buttonsOf(ac && ac.body).map(c => c.custom_id).filter(Boolean);
  ok('у всех кнопок разные id (иначе Discord не примет сообщение)', ids.length === 10 && new Set(ids).size === ids.length, ids.join());
  t = Date.now();
  ix('ac2', 3, { custom_id: 'ac:m:all:en:qwied', component_type: 2 }, 'U7');
  await waitFor(() => cb(since(t), 'ac2').length, 5000);
  const ac2 = cb(since(t), 'ac2')[0];
  ok('вкладка Maps — в том же сообщении (правка): карта, режим, «in game», рейтинг, лайки; период тут не нужен', ac2 && ac2.body.type === 7 &&
     /Forest RACE IN GAME \+2 Published .* · likes 3 · dislikes 1$/.test(plainOf(ac2)) && labels(ac2.body).length === 2 &&
     labels(ac2.body)[0] === 'Profile=ac:p:all:en:qwied | Maps(off)=ac-page | Friends=ac:f:all:en:qwied', labels(ac2.body).join(' || '));
  t = Date.now();
  ix('ac2f', 3, { custom_id: 'ac:f:all:en:qwied', component_type: 2 }, 'U18');
  await waitFor(() => cb(since(t), 'ac2f').length, 5000);
  ok('вкладка Friends — друзья и когда были в игре', /Ann · online now$/.test(plainOf(cb(since(t), 'ac2f')[0])));
  t = Date.now();
  ix('ac2b', 3, { custom_id: 'ac:p:week:en:qwied', component_type: 2 }, 'U14');
  await waitFor(() => cb(since(t), 'ac2b').length, 5000);
  const ac2b = cb(since(t), 'ac2b')[0];
  ok('«This week» — монеты и очки за неделю, выбранный период не нажимается', ac2b && ac2b.body.type === 7 && /Coins \+2 this week Race scores 0 this week/.test(plainOf(ac2b)) &&
     labels(ac2b.body)[1] === 'Today=ac:p:day:en:qwied | This week(off)=ac-per | All time=ac:p:all:en:qwied', labels(ac2b.body).join(' || '));
  t = Date.now();
  ix('ac2c', 3, { custom_id: 'ac:light:0:qwied', component_type: 2 }, 'U15', true);
  await waitFor(() => cb(since(t), 'ac2c').length, 5000);
  const ac2c = cb(since(t), 'ac2c')[0];
  ok('кнопки сообщений прежней версии (тема, страница, без периода) тоже работают: профиль новым сообщением, видным только нажавшему', ac2c && ac2c.body.type === 4 &&
     ac2c.body.data.flags === (32768 | 64) && /^qwied Joined /.test(plainOf(ac2c)) && /Coins 5 /.test(plainOf(ac2c)));
  t = Date.now();
  ix('ac2e', 3, { custom_id: 'ac:dark:1:week:ru:qwied', component_type: 2 }, 'U19', true);
  await waitFor(() => cb(since(t), 'ac2e').length, 5000);
  ok('…и старая страница Maps на русском', /Forest ГОНКА В ИГРЕ \+2/.test(plainOf(cb(since(t), 'ac2e')[0])));
  t = Date.now();
  ix('ac2d', 3, { custom_id: 'ac:p:week:ru:qwied', component_type: 2 }, 'U17');
  await waitFor(() => cb(since(t), 'ac2d').length, 5000);
  const ac2d = cb(since(t), 'ac2d')[0];
  ok('флаг «Русский» в профиле — то же по-русски, вкладка и период те же', ac2d && ac2d.body.type === 7 && /Монеты \+2 за неделю Очки гонки 0 за неделю/.test(plainOf(ac2d)) &&
     labels(ac2d.body).join(' || ') === 'Профиль(off)=ac-page | Карты=ac:m:week:ru:qwied | Друзья=ac:f:week:ru:qwied || ' +
       'Сегодня=ac:p:day:ru:qwied | За неделю(off)=ac-per | За всё время=ac:p:all:ru:qwied || ' +
       'Обновить=ac:p:week:ru:qwied | Открыть профиль | English=ac:p:week:en:qwied | Русский(off)=ac-lang | Мой язык=ac:p:week:me:qwied', labels(ac2d.body).join(' || '));
  t = Date.now();
  ix('ac3', 2, { name: 'account', type: 1, options: [{ name: 'nick', type: 3, value: 'qw' }] }, 'U8');
  await waitFor(() => cb(since(t), 'ac3').length);
  const ac3 = cb(since(t), 'ac3')[0], ac3t = ac3 && ac3.body.data && ac3.body.data.content;
  ok('нет такого игрока — видит только спросивший, с похожими никами', ac3 && ac3.body.type === 4 && (ac3.body.data.flags & 64) &&
     /No player named \*\*qw\*\*/.test(ac3t) && /\*\*qwied\*\*, \*\*qwerty\*\*/.test(ac3t), ac3t);
  t = Date.now();
  ix('ac4', 4, { name: 'account', type: 1, options: [{ name: 'nick', type: 3, value: 'qw', focused: true }] }, 'U8');
  await waitFor(() => cb(since(t), 'ac4').length);
  const ac4 = cb(since(t), 'ac4')[0];
  ok('пока печатает ник — подсказки', ac4 && ac4.body.type === 8 && ac4.body.data.choices.map(c => c.value).join() === 'qwied,qwerty');
  cards.setSource(null);
  const sst = await bot.status();
  ok('картинок и браузера для ответов больше нет: на странице состояния про снимки ничего не осталось', !('screenshots' in sst));

  console.log('\nязык — по языку Discord у человека (и глобус «My language»):');
  cards.setSource(accountSource);
  const lang1 = async (id, locale, nick) => {
    t = Date.now();
    ix(id, 2, nick ? { name: 'account', type: 1, options: [{ name: 'nick', type: 3, value: nick }] } : { name: 'servers', type: 1 }, 'U' + id, false, { locale });
    await waitFor(() => cb(since(t), id).length, 5000);
    return cb(since(t), id)[0];
  };
  const de = await lang1('lg1', 'de');
  ok('/servers у человека с немецким Discord — сразу по-немецки: заголовок, режимы, кнопки; английский и русский рядом, немецкий выбран', de && de.body.type === 4 &&
     /^Server · 0 online Rennen · 0 Spieler · 0 Räume Gerade keine Räume\. /.test(plainOf(de)) &&
     labels(de.body)[0] === 'Aktualisieren=sv:r:de | Spielen | English=sv:r:en | Русский=sv:r:ru | Deutsch(off)=sv-lang' && allGrey(de.body), de && labels(de.body).join(' || '));
  const langs = { 'pt-BR': /^Servidores · 0 online Corrida · 0 jogadores /, 'es-ES': /^Servidores · 0 en línea Carrera · 0 jugadores /, 'es-419': /^Servidores/, fr: /^Serveurs · 0 en ligne Course · 0 joueurs /,
                  tr: /^Sunucular · 0 çevrimiçi Yarış · 0 oyuncu /, pl: /^Serwery · online: 0 Wyścig · graczy: 0 /, uk: /^Сервери · онлайн: 0 Перегони · 0 грав\. /,
                  it: /^Server · 0 online Corsa · 0 giocatori /, 'zh-CN': /^服务器 · 0 人在线 竞速 · 0 名玩家 /, 'zh-TW': /^服务器/, ja: /^サーバー · オンライン 0人 レース · 0人 /,
                  ru: /^Серверы · онлайн: 0 /, 'en-GB': /^Servers · 0 online /, ar: /^Servers · 0 online /, ko: /^Servers · 0 online /, '': /^Servers · 0 online /, undefined: /^Servers · 0 online / };
  let n = 0;
  for (const [loc, re] of Object.entries(langs)) {
    const m = await lang1('lgx' + (++n), loc === 'undefined' ? undefined : loc);
    ok('язык Discord «' + (loc || 'нет') + '» -> ' + re.source.slice(0, 28), m && re.test(plainOf(m)) && allGrey(m.body), m && plainOf(m).slice(0, 60));
  }
  const ja = await lang1('lg2', 'ja', 'QWIED');
  ok('/account — тоже по языку Discord (японский): ник, дата по-японски, подписи; кнопки вкладок и период по-японски', ja && /^qwied 登録日 \d{4}年\d{1,2}月\d{1,2}日 · レース: S · かくれんぼ: ランクなし コイン 5 レースのスコア 3 /.test(plainOf(ja)) &&
     labels(ja.body)[0] === 'プロフィール(off)=ac-page | マップ=ac:m:all:ja:qwied | フレンド=ac:f:all:ja:qwied' &&
     labels(ja.body)[1] === '今日=ac:p:day:ja:qwied | 今週=ac:p:week:ja:qwied | 通算(off)=ac-per', ja && labels(ja.body).join(' || '));
  const frm = await lang1('lg3', 'fr', 'qwied');
  ok('/account по-французски: подписи, «пока ничего нет» и т. д.', /^qwied Inscrit le .* · Course: S · Cache-cache: sans rang Pièces 5 Points de course 3 /.test(plainOf(frm)), plainOf(frm).slice(0, 90));
  // глобус на общем сообщении — личная копия на языке нажавшего, остальные ничего не видят
  t = Date.now();
  ix('lg4', 3, { custom_id: 'sv:r:me', component_type: 2 }, 'U61', false, { locale: 'pl' });
  await waitFor(() => cb(since(t), 'lg4').length);
  const pl = cb(since(t), 'lg4')[0];
  ok('глобус под общим сообщением /servers: человек с польским Discord получает свою копию по-польски, видную только ему; общее сообщение не тронуто', pl && pl.body.type === 4 &&
     pl.body.data.flags === (32768 | 64) && /^Serwery · online: 0 /.test(plainOf(pl)) &&
     labels(pl.body)[0] === 'Odśwież=sv:r:pl | Graj | English=sv:r:en | Русский=sv:r:ru | Polski(off)=sv-lang', pl && labels(pl.body).join(' || '));
  t = Date.now();
  ix('lg5', 3, { custom_id: 'sv:r:ru', component_type: 2 }, 'U62', false, { locale: 'pl', msgFlags: 32768 | 64 });
  await waitFor(() => cb(since(t), 'lg5').length);
  ok('кнопка «Русский» в такой личной копии правит её же на месте (type 7), а не шлёт ещё одну', cb(since(t), 'lg5')[0].body.type === 7 && /^Серверы · онлайн: 0 /.test(plainOf(cb(since(t), 'lg5')[0])));
  t = Date.now();
  ix('lg6', 3, { custom_id: 'sv:r:me', component_type: 2 }, 'U63', false, { locale: 'tr', msgFlags: 32768 | 64 });
  await waitFor(() => cb(since(t), 'lg6').length);
  ok('глобус внутри личной копии — она же меняется на месте (на язык нажавшего)', cb(since(t), 'lg6')[0].body.type === 7 && /^Sunucular · /.test(plainOf(cb(since(t), 'lg6')[0])) &&
     (cb(since(t), 'lg6')[0].body.data.flags & 64) === 0);
  t = Date.now();
  ix('lg7', 3, { custom_id: 'ac:p:all:me:qwied', component_type: 2 }, 'U64', false, { locale: 'it' });
  await waitFor(() => cb(since(t), 'lg7').length);
  ok('глобус в /account — личная копия на языке нажавшего (итальянский), на той же вкладке и с тем же периодом', cb(since(t), 'lg7')[0].body.type === 4 &&
     cb(since(t), 'lg7')[0].body.data.flags === (32768 | 64) && /^qwied Iscritto il .* · Corsa: S · Nascondino: nessun rango Monete 5 /.test(plainOf(cb(since(t), 'lg7')[0])) &&
     labels(cb(since(t), 'lg7')[0].body)[2] === 'Aggiorna=ac:p:all:it:qwied | Apri profilo | English=ac:p:all:en:qwied | Русский=ac:p:all:ru:qwied | Italiano(off)=ac-lang', labels(cb(since(t), 'lg7')[0].body).join(' || '));
  // карточка наказания в канале и в личке
  const pubMe = flagsOf(wcBody)[2].custom_id;
  t = Date.now();
  dispatch('INTERACTION_CREATE', { id: 'lg8', token: 'tklg8', type: 3, guild_id: G, channel_id: CH.general, member: { user: { id: 'U66' }, permissions: '1024' }, locale: 'de',
    message: { id: '1', flags: 32768 }, data: { custom_id: pubMe, component_type: 2 } });
  await waitFor(() => cb(since(t), 'lg8').length);
  const cardDe = cb(since(t), 'lg8')[0];
  ok('глобус под карточкой наказания в канале — карточка по-немецки личной копией (ник игрока, правило, причина, счёт), канал не тронут', cardDe && cardDe.body.type === 4 &&
     cardDe.body.data.flags === (32768 | 64) && /^Verwarnung · 1 von 3 playerU2 Regel: 6\. Kein Verkauf von Konten oder Münzen für echtes Geld Grund: продавал монеты в чате за деньги Zähler: ●○○ /.test(plainOf(cardDe)) &&
     flagsOf(cardDe.body.data).map(b => b.label + ':' + !!b.disabled).join() === 'English:false,Русский:false,Deutsch:true', cardDe && plainOf(cardDe));
  dispatch('INTERACTION_CREATE', { id: 'lg9', token: 'tklg9', type: 3, channel_id: 'dmU2', user: { id: 'U2' }, locale: 'ja',
    message: { id: '2', flags: 32768 }, data: { custom_id: pubMe, component_type: 2 } });
  await waitFor(() => cb(since(t), 'lg9').length);
  const cardJa = cb(since(t), 'lg9')[0];
  ok('в личке (получатель — сам нажавший) глобус меняет то же сообщение на месте, по-японски', cardJa && cardJa.body.type === 7 && /^警告 · 1 / .test(plainOf(cardJa)) && /ルール: 6\. /.test(plainOf(cardJa)));
  // правила
  t = Date.now();
  ix('lg10', 3, { custom_id: 'rules:me', component_type: 2 }, 'U67', false, { locale: 'es-ES' });
  await waitFor(() => cb(since(t), 'lg10').length);
  const rEs = cb(since(t), 'lg10')[0];
  ok('глобус под правилами: стандартные правила по-испански личной копией (с переведённым названием), пост не тронут', rEs && rEs.body.type === 4 && rEs.body.data.flags === (32768 | 64) &&
     /^Reglas del servidor AIBROFIST 1 Sin spam SILENCIO 10 MINUTOS Más de 3 mensajes en 2 segundos\. Silencio a la 5\.ª vez\. 2 Sin invitaciones a otros servidores de Discord ADVERTENCIA /.test(plainOf(rEs)) &&
     /Las advertencias se acumulan: 3 en 30 días dan un silencio de 1 hora\./.test(plainOf(rEs)) && flagsOf(rEs.body.data).map(b => b.label + ':' + !!b.disabled).join() === 'English:false,Русский:false,Español:true',
     rEs && plainOf(rEs).slice(0, 160));
  t = Date.now();
  ix('lg11', 3, { custom_id: 'rules:me', component_type: 2 }, 'U68', false, { locale: 'ko' });
  await waitFor(() => cb(since(t), 'lg11').length);
  ok('язык Discord без перевода (корейский) — правила по-английски, без выбранного языка', /^AIBROFIST Server Rules 1 No spam MUTE 10 MINUTES /.test(plainOf(cb(since(t), 'lg11')[0])) &&
     flagsOf(cb(since(t), 'lg11')[0].body.data).map(b => b.label + ':' + !!b.disabled).join() === 'English:true,Русский:false,My language:false');

  cards.setSource(null);
  console.log('\nсекретная статистика:');
  t = Date.now();
  say(OWNER, '!qastats');
  await waitFor(() => panelOf(since(t)));
  panel = panelOf(since(t));
  t = Date.now();
  bid = press(OWNER, panel.id);
  await waitFor(() => picAnswer(since(t), bid), 5000);
  const st1 = picAnswer(since(t), bid);
  const link1 = st1 && (/https:\/\/[^"\s]+\/stats\/[\w-]+/.exec(JSON.stringify(st1.body)) || [])[0];
  ok('«!stats» — сообщение с живой статистикой и кнопка с секретной ссылкой, видит только владелец', st1 && /^Live stats 0 players in the game · 0 rooms /.test(st1.alt) &&
     st1.data.flags === (32768 | 64) && link1 && buttonsOf(st1.body).some(b => b.style === 5 && b.url === link1 && b.label === 'Open live stats'), link1 && link1.replace(/[\w-]+$/, '<key>'));
  t = Date.now();
  say(OWNER, '!qastats new');
  await waitFor(() => panelOf(since(t)));
  panel = panelOf(since(t));
  t = Date.now();
  bid = press(OWNER, panel.id);
  await waitFor(() => picAnswer(since(t), bid), 5000);
  const link2 = (/https:\/\/[^"\s]+\/stats\/[\w-]+/.exec(JSON.stringify(picAnswer(since(t), bid).body)) || [])[0];
  ok('«!stats new» — новая ссылка', link2 && link1 && link2 !== link1);

  await sleep(2100);                   // ответы теперь мгновенные: пусть окно «больше 3 сообщений за 2 секунды» от прежних команд владельца закроется
  t = Date.now();
  say(OWNER, '!hello there');
  say(OWNER, '!news');
  say(OWNER, '!help');
  await sleep(250);
  ok('без секретного начала и неизвестные команды — обычные сообщения, не трогаем', quietSince(t).length === 0, since(t).map(x => x.method + ' ' + x.path).join(' | '));

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
  ok('в окне подсказано, что русский — кнопка в том же посте, а слово из списка даёт предупреждение', /Shown in the same post/.test(JSON.stringify(rm.data.components)) &&
     /gets a warning/.test(JSON.stringify(rm.data.components)) && !/strike/i.test(JSON.stringify(rm.data.components)));
  const pre = id => (rm.data.components.find(x => x.component.custom_id === id) || {}).component || {};
  ok('в окне уже вписаны стандартные правила и наказания', /1\. No spam/.test(pre('en').value) && /banned for 7 days/.test(pre('en').value) &&
     /бан на 7 дней/.test(pre('ru').value) && !pre('words').value);
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
  ok('правила в #rules исправлены на месте: тот же пост, нового нет, прежних картинок в нём нет, флаги на месте', redit && bodyOf(redit).flags === 32768 && !multipartOf(redit) &&
     Array.isArray(bodyOf(redit).attachments) && bodyOf(redit).attachments.length === 0 && find(since(t), 'POST', /^\/channels\/301\/messages$/).length === 0 &&
     /^Server Rules 1 No spam /.test(plainOf(redit)) && flagsOf(bodyOf(redit)).map(b => b.custom_id).join() === 'rules-lang,rules:ru,rules:me', plainOf(redit).slice(0, 60));
  ok('свои слова запомнены, без повторов', JSON.stringify(bot._test.state().guilds[G].words) === '["bananas","free robux"]',
     JSON.stringify(bot._test.state().guilds[G].words));
  t = Date.now();
  bid = press('U0', 'rules:ru');
  await waitFor(() => picAnswer(since(t), bid), 5000);
  const rru = picAnswer(since(t), bid);
  ok('«Русский» — текст в том же посте становится русским (правка самого поста), подсвечен флаг «Русский»',
     rru && rru.body.type === 7 && rru.data.flags === 32768 && /^Правила сервера AIBROFIST 1 Без спама /.test(rru.alt) &&
     flagsOf(rru.data).map(b => b.custom_id + ':' + b.style + ':' + !!b.disabled).join() === 'rules:en:2:false,rules-lang:2:true,rules:me:2:false' && !(rru.data.flags & 64) &&
     Array.isArray(rru.data.attachments) && rru.data.attachments.length === 0, rru && rru.alt.slice(0, 60));
  ok('русский текст — тот же набор из 7 правил и про копящиеся предупреждения', /7 Без чужих IP-адресов/.test(rru.alt) && !/8 /.test(rru.alt) && /Предупреждения копятся/.test(rru.alt));
  t = Date.now();
  bid = press('U0', 'rules:en');
  await waitFor(() => picAnswer(since(t), bid), 5000);
  const ren = picAnswer(since(t), bid);
  ok('«English» — обратно английский в том же посте', ren && ren.body.type === 7 && /^Server Rules 1 No spam /.test(ren.alt));
  t = Date.now();
  rejectUpdate = true;
  bid = press('U0', 'rules:ru');
  await waitFor(() => cb(since(t), bid).length >= 2);
  rejectUpdate = false;
  const cbs = cb(since(t), bid);
  ok('если Discord не принял правку поста, русский текст получает только нажавший (запасной ответ)', cbs[0].body.type === 7 &&
     cbs[1].body.type === 4 && cbs[1].body.data.flags === (32768 | 64) && /1 Без спама/.test(plainOf(cbs[1])));
  t = Date.now();
  bid = press('U32', 'rules:ru:light', true);
  await waitFor(() => picAnswer(since(t), bid), 5000);
  const rlt = picAnswer(since(t), bid);
  ok('кнопки поста прежней версии (с темой) не ломаются: русский текст новым сообщением, видным только нажавшему; кнопок темы нет', rlt && rlt.body.type === 4 &&
     rlt.data.flags === (32768 | 64) && /^Правила сервера AIBROFIST 1 Без спама /.test(rlt.alt) && !/Тёмная|Светлая|Dark|Light/.test(JSON.stringify(rlt.body)));
  t = Date.now();
  dispatch('INTERACTION_CREATE', { id: 'dm1', token: 'tkdm1', type: 3, channel_id: 'dmOWNER', user: { id: OWNER },
    data: { custom_id: 'rules:ru', component_type: 2 } });
  await waitFor(() => picAnswer(since(t), 'dm1'), 5000);
  ok('и в личке (превью правил) флаг «Русский» тоже работает', /^Правила сервера AIBROFIST /.test(picAnswer(since(t), 'dm1').alt));
  t = Date.now();
  const bw = say('U20', 'I really love bananas');
  await waitFor(() => find(since(t), 'DELETE', new RegExp('/messages/' + bw.id + '$')).length);
  await sleep(150);
  await waitFor(() => find(since(t), 'POST', /^\/channels\/dmU20\/messages$/).length);
  ok('сообщение со своим запрещённым словом удалено, автору — предупреждение по правилам сервера, без мьюта', find(since(t), 'PATCH', /members\/U20$/).length === 0 &&
     /Rule: Words banned on this server/.test(plainOf(find(since(t), 'POST', /^\/channels\/dmU20\/messages$/)[0])) &&
     /^Warning · /.test(plainOf(find(since(t), 'POST', /^\/channels\/dmU20\/messages$/)[0])));
  t = Date.now();
  const rid2 = submit('rules:' + CH.general, rulesForm('', 'Server Rules'));
  await waitFor(() => find(since(t), 'PATCH', new RegExp('tk' + rid2 + '/messages/@original$')).length);
  ok('повторный «!rules» в тот же канал правит прежний пост, а не дублирует', rpost &&
     find(since(t), 'PATCH', new RegExp('^/channels/301/messages/' + rpost.resId + '$')).length === 1 &&
     find(since(t), 'POST', /^\/channels\/301\/messages$/).length === 0);
  ok('слова можно убрать', bot._test.state().guilds[G].words.length === 0);
  ok('свой текст правил бот потом сам не меняет', bot._test.state().guilds[G].rules.custom === true);

  console.log('\nкоманды по имени — без упоминаний и без пингов:');
  const sayIn = (list, re) => find(list, 'POST', /^\/channels\/300\/messages$/).map(x => x.body && x.body.content || '').find(x => re.test(x));
  t = Date.now();
  const cmdName = say(OWNER, '!qamute alice_p 1h being loud');
  await waitFor(() => find(since(t), 'PATCH', /members\/70001$/).length);
  await waitFor(() => cardIn(since(t), /^Muted · 1 hour Alice /));
  const confName = cardIn(since(t), /^Muted · 1 hour Alice /);
  ok('«!mute alice_p 1h» — игрок найден по логину, без @: мьют на час, команда удалена', find(since(t), 'DELETE', new RegExp('/messages/' + cmdName.id + '$')).length === 1 &&
     Math.abs(Date.parse(find(since(t), 'PATCH', /members\/70001$/)[0].body.communication_disabled_until) - Date.now() - 3600000) < 60000);
  ok('итог — карточка с именем и без упоминания, никого не пингует', confName && /^Muted · 1 hour Alice @alice_p Reason: being loud Until: /.test(plainOf(confName)) &&
     bodyOf(confName).allowed_mentions.parse.length === 0 && !/<@/.test(J(confName)), confName && plainOf(confName));
  t = Date.now();
  say(OWNER, '!qamute "Big Bob" 6h');
  await waitFor(() => find(since(t), 'PATCH', /members\/70002$/).length);
  await waitFor(() => cardIn(since(t), /^Muted · 6 hours Big Bob /));
  ok('имя с пробелами — в кавычках, находится по нику на сервере', !!cardIn(since(t), /^Muted · 6 hours Big Bob @bigbob /));
  t = Date.now();
  say(OWNER, '!qamute ALICE 1h');
  await waitFor(() => find(since(t), 'PATCH', /members\/70001$/).length);
  ok('«!mute ALICE 1h» — регистр не важен, начало имени подходит, если оно одно', find(since(t), 'PATCH', /members\/70001$/).length === 1);
  t = Date.now();
  say(OWNER, '!qamute sa 1h');
  await waitFor(() => sayIn(since(t), /Several/));
  ok('несколько подходящих — бот не гадает, а перечисляет и просит точное имя или id', sayIn(since(t), /Several/) === 'Several members match: Sam, Samantha. Write the exact name or the user ID.' &&
     find(since(t), 'PATCH', /members\/7000\d$/).length === 0);
  t = Date.now();
  say(OWNER, '!qamute sam 1h');
  await waitFor(() => find(since(t), 'PATCH', /members\/70003$/).length);
  await sleep(150);
  ok('точное имя выбирает одного из похожих (sam, а не samantha)', find(since(t), 'PATCH', /members\/70004$/).length === 0);
  t = Date.now();
  const pf = await openWarn('alice');
  const pf2 = await openWarn('sa');
  const pf3 = await openWarn('sam');
  const dv = x => x.modal.data.components[0].component.default_values;
  ok('«!warn alice» — игрок сразу вписан в форму; «!warn sa» (их двое) — не угадывает, форма пустая; «!warn sam» — точное имя', dv(pf) && dv(pf)[0].id === '70001' && dv(pf)[0].type === 'user' &&
     !dv(pf2) && dv(pf3) && dv(pf3)[0].id === '70003');
  t = Date.now();
  say(OWNER, '!qamute nobody 1h');
  await waitFor(() => sayIn(since(t), /cannot find/));
  ok('нет такого — так и пишет, ничего не делает', sayIn(since(t), /cannot find/) === 'I cannot find **nobody** on the server. Write the exact name or the user ID.' &&
     find(since(t), 'PATCH', /members\//).length === 0);
  t = Date.now();
  say(OWNER, '!qaunmute 70005');
  await waitFor(() => find(since(t), 'PATCH', /members\/70005$/).length);
  await waitFor(() => cardIn(since(t), /^Mute lifted quitter /));
  ok('по id тоже: имя берётся с сервера, карточка с ним', find(since(t), 'PATCH', /members\/70005$/)[0].body.communication_disabled_until === null &&
     /Status: Can talk again/.test(plainOf(cardIn(since(t), /^Mute lifted quitter /))));
  t = Date.now();
  say(OWNER, '!qaban bigbob 7d spam');
  await waitFor(() => find(since(t), 'PUT', /bans\/70002$/).length);
  await waitFor(() => cardIn(since(t), /^Banned · 7 days Big Bob /));
  ok('«!ban bigbob 7d spam» — бан на неделю, карточка с ником', /^Banned · 7 days Big Bob @bigbob Reason: spam Lifts: /.test(plainOf(cardIn(since(t), /^Banned · 7 days Big Bob /))));
  t = Date.now();
  say(OWNER, '!qaunban banned_guy');
  await waitFor(() => find(since(t), 'DELETE', /bans\/71000$/).length);
  await waitFor(() => cardIn(since(t), /^Ban lifted Banned Guy /));
  ok('«!unban banned_guy» — находит в списке банов по имени, разбанивает', /Status: Can join the server again/.test(plainOf(cardIn(since(t), /^Ban lifted Banned Guy /))));
  t = Date.now();
  say(OWNER, '!qaunban ghost');
  await waitFor(() => sayIn(since(t), /among the banned/));
  ok('нет в списке банов — так и пишет', sayIn(since(t), /among the banned/) === 'I cannot find **ghost** among the banned. Write the exact name or the user ID.');
  t = Date.now();
  say(OWNER, '!qamute');
  await waitFor(() => sayIn(since(t), /Who\?/));
  ok('без цели — подсказка: имя, id или упоминание', /name, a user ID or a mention/.test(sayIn(since(t), /Who\?/)));
  t = Date.now();
  say(OWNER, '!qaclear all alice_p');
  await waitFor(() => panelOf(since(t)));
  const cpName = panelOf(since(t));
  ok('«!clear all alice_p» — красная кнопка с именем (не с упоминанием)', cpName && cpName.msg.body.components[0].components[0].label === 'Delete all messages of Alice here' &&
     !/<@/.test(JSON.stringify(cpName.msg.body)));
  t = Date.now();
  say(OWNER, '!qa help');
  await waitFor(() => panelOf(since(t)));
  panel = panelOf(since(t));
  t = Date.now();
  bid = press(OWNER, panel.id);
  await waitFor(() => picAnswer(since(t), bid), 5000);
  const helpAlt = picAnswer(since(t), bid).alt;
  ok('справка: «!warn» — форма с обязательными полями; цель команды — имя без @', /!qawarn \[name\] Warning form \(all fields required\)/.test(helpAlt) &&
     /!qamute name 1h reason Mute: 10m, 1h, 6h, 1d, 3d, 7d/.test(helpAlt) && !/@user/.test(helpAlt), helpAlt.slice(0, 200));
  // Discord сообщение не принял — справка текстом, как раньше
  rejectV2Reply = true;
  t = Date.now();
  say(OWNER, '!qa help');
  await waitFor(() => panelOf(since(t)));
  panel = panelOf(since(t));
  t = Date.now();
  bid = press(OWNER, panel.id);
  await waitFor(() => cb(since(t), bid).length >= 2);
  rejectV2Reply = false;
  const helpText = JSON.stringify(cb(since(t), bid)[1].body);
  ok('Discord не принял сообщение — справка текстом: объяснено, почему не упоминание, и про кавычки', /warn\*\* - open the warning form/.test(helpText) &&
     /unwarn name\*\* - remove all warnings/.test(helpText) && /pings the person before the bot can delete/.test(helpText) && /in quotes/.test(helpText) &&
     cb(since(t), bid)[1].body.data.flags === 64);

  console.log('\nпредупреждения: список, снятие, флаги языка:');
  const alice = { id: '70001', username: 'alice_p', global_name: 'Alice' };
  const tAlice = Date.now();
  for (const [k, why] of ['link to another server', 'sold coins'].entries()) {
    t = Date.now();
    warnSend(alice, 2, why);
    await waitFor(() => find(since(tAlice), 'POST', /^\/channels\/300\/messages$/).filter(x => x.body && /^Warning · \d of 3 Alice /.test(plainOf(x))).length > k);
  }
  const aliceCards = find(since(tAlice), 'POST', /^\/channels\/300\/messages$/).filter(x => x.body && /^Warning · \d of 3 Alice /.test(plainOf(x)));
  ok('у Alice два предупреждения — на второй карточке «2 из 3»', aliceCards.length === 2 && /^Warning · 1 of 3 Alice @alice_p .* Count: ●○○ /.test(plainOf(aliceCards[0])) &&
     /^Warning · 2 of 3 Alice @alice_p .* Count: ●●○ /.test(plainOf(aliceCards[1])) && bot._test.state().warns[G + ':70001'].length === 2);
  t = Date.now();
  say(OWNER, '!qawarns alice_p');
  await waitFor(() => panelOf(since(t)));
  panel = panelOf(since(t));
  ok('«!warns alice_p» — кнопка «Show warnings of Alice» (список видит только владелец)', panel.msg.body.components[0].components[0].label === 'Show warnings of Alice');
  t = Date.now();
  bid = press(OWNER, panel.id);
  await waitFor(() => picAnswer(since(t), bid), 5000);
  const wl = picAnswer(since(t), bid), wlData = wl.body.data || wl.body;
  ok('по кнопке — сообщение: сколько действует, сколько всего, за что и кто выдал', /^Warnings · 2 of 3 ●●○ Alice @alice_p /.test(wl.alt) && /All time: 2$/.test(wl.alt) &&
     /2\. No invites to other Discord servers ACTIVE .* link to another server · 900/.test(wl.alt) && /sold coins/.test(wl.alt) && wlData.flags === (32768 | 64), wl.alt);
  const wlRu = flagsOf(wlData)[1].custom_id;
  t = Date.now();
  bid = press('U0', wlRu);
  await waitFor(() => cb(since(t), bid).length);
  ok('чужой флаг на карточке владельца не нажмёт', /Only the server owner/.test(JSON.stringify(cb(since(t), bid)[0].body)) && !picAnswer(since(t), bid));
  t = Date.now();
  bid = press(OWNER, wlRu);
  await waitFor(() => picAnswer(since(t), bid), 5000);
  const wlr = picAnswer(since(t), bid);
  ok('флаг «Русский» — та же карточка по-русски, в том же сообщении', /^Предупреждения · 2 из 3 ●●○ Alice /.test(wlr.alt) && wlr.body.type === 7 &&
     flagsOf(wlr.data).map(b => !!b.disabled).join() === 'false,true,false', wlr.alt);
  t = Date.now();
  say(OWNER, '!qawarns');
  await waitFor(() => panelOf(since(t)));
  panel = panelOf(since(t));
  t = Date.now();
  bid = press(OWNER, panel.id);
  await waitFor(() => picAnswer(since(t), bid), 5000);
  const wall = picAnswer(since(t), bid).alt;
  ok('«!warns» без имени — все, у кого есть предупреждения', /^Members with warnings /.test(wall) && /Alice ●●○ 2\/3/.test(wall) && /playerU2 [●○]{3} \d\/3/.test(wall), wall);
  // флаг на карточке в канале — её может нажать любой: язык меняется у всех, в том же сообщении
  const pubRu = flagsOf(wcBody)[1].custom_id;
  t = Date.now();
  bid = press('U5', pubRu);
  await waitFor(() => picAnswer(since(t), bid), 5000);
  ok('флаг под карточкой в канале — та же карточка по-русски, в том же сообщении', /^Предупреждение · 1 из 3 playerU2 Правило: 6\. Без продажи аккаунтов и монет за реальные деньги /.test(picAnswer(since(t), bid).alt) &&
     picAnswer(since(t), bid).body.type === 7 && !(picAnswer(since(t), bid).data.flags & 64), picAnswer(since(t), bid).alt);
  t = Date.now();
  say(OWNER, '!qaunwarn alice_p');
  await waitFor(() => cardIn(since(t), /^Warnings removed · 2 Alice /));
  ok('«!unwarn alice_p» — все её предупреждения сняты, в канале карточка, в журнале запись', !bot._test.state().warns[G + ':70001'] &&
     /Status: Clean record now/.test(plainOf(cardIn(since(t), /^Warnings removed · 2 Alice /))) &&
     /Warnings removed \(2\)/.test(JSON.stringify(find(since(t), 'POST', /^\/channels\/303\/messages$/))));
  t = Date.now();
  say(OWNER, '!qaunwarn alice_p');
  await waitFor(() => sayIn(since(t), /has no warnings/));
  ok('снимать нечего — так и пишет', sayIn(since(t), /has no warnings/) === '**Alice** has no warnings.');
  t = Date.now();
  say(OWNER, '!qaunwarn all');
  await waitFor(() => panelOf(since(t)));
  panel = panelOf(since(t));
  ok('«!unwarn all» сначала спрашивает: красная кнопка', panel.msg.body.components[0].components[0].style === 4 &&
     panel.msg.body.components[0].components[0].label === 'Remove all warnings on the server' && Object.keys(bot._test.state().warns).some(k => k.indexOf(G + ':') === 0));
  t = Date.now();
  bid = press(OWNER, panel.id);
  await waitFor(() => picAnswer(since(t), bid), 5000);
  ok('владелец нажал — сняты все предупреждения на сервере, карточка об этом', /^Warnings All warnings removed /.test(picAnswer(since(t), bid).alt) &&
     !Object.keys(bot._test.state().warns).some(k => k.indexOf(G + ':') === 0), picAnswer(since(t), bid).alt);
  // Discord карточку в канале не принял — предупреждение всё равно уходит, в канале — текстом
  rejectV2Post = true;
  t = Date.now();
  warnSend({ id: 'U3', username: 'playerU3' }, 2, 'invite again');
  await waitFor(() => sayIn(since(t), /received a warning/));
  rejectV2Post = false;
  ok('карточку Discord не принял — в канале текстом: правило, причина, какое по счёту', sayIn(since(t), /received a warning/) ===
     '**playerU3**, you received a warning for rule 2, no invites to other discord servers: invite again. Warning 1 of 3.', sayIn(since(t), /received a warning/));

  console.log('\nаватарки Discord, серые кнопки, без описаний картинок:');
  t = Date.now();
  warnSend({ id: '70006', username: 'dave', global_name: 'Dave' }, 3, 'картинка 18+');
  await waitFor(() => cardIn(since(t), /^Warning · \d of 3 Dave /));
  const dave = cardIn(since(t), /^Warning · \d of 3 Dave /), daveBtns = buttonsOf(bodyOf(dave));
  ok('у кого нет своей аватарки — стандартная аватарка Discord справа в заголовке (по ссылке на CDN, бот её не скачивает)',
     thumbOf(dave) === 'http://127.0.0.1:' + port + '/embed/avatars/0.png' && find(calls, 'GET', /\/embed\/avatars\//).length === 0, thumbOf(dave));
  ok('под карточкой один ряд: флаги языка, обе кнопки серые (secondary), кнопок темы нет; id разные', rowsOf(bodyOf(dave)).length === 1 &&
     daveBtns.map(b => b.label + ':' + b.style + ':' + !!b.disabled).join() === 'English:2:true,Русский:2:false,My language:2:false' && new Set(daveBtns.map(b => b.custom_id)).size === 3 &&
     /^cd:[0-9a-f]+:ru$/.test(daveBtns[1].custom_id) && !/Dark theme|Light theme/.test(J(dave)), daveBtns.map(b => b.custom_id).join());
  t = Date.now();
  bid = press('U30', daveBtns[1].custom_id);
  await waitFor(() => picAnswer(since(t), bid), 5000);
  const daveRu = picAnswer(since(t), bid);
  ok('«Русский» — та же карточка по-русски в том же сообщении (аватарка и серые кнопки на месте), выбран русский', /^Предупреждение · \d из 3 Dave @dave /.test(daveRu.alt) && daveRu.body.type === 7 &&
     daveRu.data.flags === 32768 && flagsOf(daveRu.data).map(b => b.label + ':' + !!b.disabled).join() === 'English:false,Русский:true,Мой язык:false' &&
     (function () { let u = null; walkAll(daveRu.data.components, n => { if (n.type === 11) u = n.media.url; }); return u; })() === thumbOf(dave), daveRu.alt.slice(0, 60));
  t = Date.now();
  bid = press('U31', 'cd:' + /^cd:([0-9a-f]+):/.exec(daveBtns[1].custom_id)[1] + ':en:light', true);
  await waitFor(() => picAnswer(since(t), bid), 5000);
  const daveOld = picAnswer(since(t), bid);
  ok('кнопки карточек прежней версии (с темой) не ломаются: карточка новым сообщением, видным только нажавшему', daveOld && daveOld.body.type === 4 &&
     daveOld.data.flags === (32768 | 64) && /^Warning · \d of 3 Dave /.test(daveOld.alt));
  t = Date.now();
  warnSend({ id: '70007', username: 'erin', avatar: 'abc123' }, 2, 'ссылка');
  await waitFor(() => cardIn(since(t), /^Warning · \d of 3 erin /));
  ok('своя аватарка (хеш из Discord) — берётся она', thumbOf(cardIn(since(t), /^Warning · \d of 3 erin /)) === 'http://127.0.0.1:' + port + '/avatars/70007/abc123.png?size=128');
  t = Date.now();
  warnSend({ id: '70008', username: 'finn' }, 3, 'без плашки');
  await waitFor(() => cardIn(since(t), /^Warning · \d of 3 finn /));
  const noAlt = cardIn(since(t), /^Warning · \d of 3 finn /);
  ok('у карточки нет описаний картинок (alt, «ПОДСКАЗКА»), вложений и картинок вообще', noAlt && !/"description"|"attachments"|"type":12|"type":13|attachment:/.test(J(noAlt)) && !multipartOf(noAlt));

  console.log('\nбан и разбан:');
  t = Date.now();
  say(OWNER, '!qaban <@U21> 7d cheating', { mentions: [{ id: 'U21', member: { roles: [] } }] });
  await waitFor(() => find(since(t), 'PUT', /bans\/U21$/).length);
  await sleep(150);
  c = since(t);
  const un21 = bot._test.state().unbans[G + ':U21'];
  ok('«!ban @игрок 7d причина» — бан на неделю, бот запомнил, когда снять', un21 && Math.abs(un21 - Date.now() - 7 * 86400000) < 60000);
  const dm21 = c.findIndex(x => x.method === 'POST' && x.path === '/channels/dmU21/messages' && /^Banned · 7 days /.test(plainOf(x)));
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

  console.log('\nчистка канала:');
  {
    const H = '310', H2 = '311';
    const at = (ms, uid, pinned) => ({ id: snow(Date.now() - ms), author: { id: uid }, pinned: !!pinned });
    const y1 = at(3600000, '3030'), y2 = at(7200000, '3031'), pin = at(3 * 3600000, '3031', true),
          o1 = at(20 * 86400000, '3030'), o2 = at(30 * 86400000, '3031');
    history.set(H, [y1, y2, pin, o1, o2]);
    const panelIn = (list, ch) => { const pm = find(list, 'POST', new RegExp('^/channels/' + ch + '/messages$')).find(x => x.body && x.body.components);
      return pm && { msg: pm, id: pm.body.components[0].components[0].custom_id }; };
    // итог чистки — карточкой (подпись), подсказки — текстом
    const said = (list, ch, re) => find(list, 'POST', new RegExp('^/channels/' + ch + '/messages$')).some(x => re.test((x.body && x.body.content) || plainOf(x)));

    t = Date.now();
    const c3 = say(OWNER, '!qaclear 3', { channel_id: H });
    await waitFor(() => said(since(t), H, /Deleted/));
    c = since(t);
    const bulk = find(c, 'POST', new RegExp('^/channels/' + H + '/messages/bulk-delete$'));
    const dels = find(c, 'DELETE', new RegExp('^/channels/' + H + '/messages/')).map(x => x.path.split('/').pop());
    ok('«!clear 3» — три последних: свежие пачкой, старое по одному, команда удалена', bulk.length === 1 &&
       JSON.stringify(bulk[0].body.messages) === JSON.stringify([y1.id, y2.id]) && dels.indexOf(o1.id) !== -1 &&
       dels.indexOf(c3.id) !== -1 && dels.indexOf(o2.id) === -1 && said(c, H, /Deleted 3 messages/), dels.join());
    ok('закреплённое не тронуто, в журнале запись', dels.indexOf(pin.id) === -1 && !JSON.stringify(bulk[0].body).includes(pin.id) &&
       /Deleted 3 messages/.test(JSON.stringify(find(c, 'POST', /^\/channels\/303\/messages$/))));

    t = Date.now();
    say(OWNER, '!qaclear all <@3031>', { channel_id: H, mentions: [{ id: '3031' }] });
    await waitFor(() => panelIn(since(t), H));
    const cp = panelIn(since(t), H);
    ok('«!clear all» сначала спрашивает: красная кнопка', cp && cp.msg.body.components[0].components[0].style === 4 &&
       find(since(t), 'GET', new RegExp('^/channels/' + H + '/messages')).length === 0);
    t = Date.now();
    bid = press('U0', cp.id);
    await waitFor(() => cb(since(t), bid).length);
    await sleep(150);
    ok('чужой нажать не может', find(since(t), 'GET', new RegExp('^/channels/' + H + '/messages')).length === 0);
    t = Date.now();
    bid = press(OWNER, cp.id);
    await waitFor(() => said(since(t), H, /Deleted/));
    c = since(t);
    const d2 = find(c, 'DELETE', new RegExp('^/channels/' + H + '/messages/')).map(x => x.path.split('/').pop());
    ok('«!clear all @игрок» — только его сообщения, все', d2.indexOf(y2.id) !== -1 && d2.indexOf(o2.id) !== -1 &&
       d2.indexOf(y1.id) === -1 && d2.indexOf(o1.id) === -1 && d2.indexOf(pin.id) === -1 && said(c, H, /Deleted 2 messages/), d2.join());

    const many = [];
    for (let i = 0; i < 150; i++) many.push(at(60000 + i * 1000, 'U32'));
    history.set(H2, many);
    t = Date.now();
    say(OWNER, '!qaclear all', { channel_id: H2 });
    await waitFor(() => panelIn(since(t), H2));
    t = Date.now();
    press(OWNER, panelIn(since(t - 5000), H2).id);
    await waitFor(() => said(since(t), H2, /Deleted/));
    c = since(t);
    const b2 = find(c, 'POST', new RegExp('^/channels/' + H2 + '/messages/bulk-delete$'));
    ok('«!clear all» в большом канале — по 100 за раз, пока не кончатся', b2.length === 2 && b2[0].body.messages.length === 100 &&
       b2[1].body.messages.length === 50 && said(c, H2, /Deleted 150 messages/));

    const slow = [];
    for (let i = 0; i < 300; i++) slow.push(at(20 * 86400000 + i * 1000, '3033'));
    history.set('312', slow);
    t = Date.now();
    say(OWNER, '!qaclear 300', { channel_id: '312' });
    await waitFor(() => find(since(t), 'DELETE', /^\/channels\/312\/messages\/\d{15,}$/).length >= 3);
    say(OWNER, '!qaclear stop', { channel_id: H });
    await waitFor(() => said(since(t), '312', /Stopped/), 5000);
    const gone = find(since(t), 'DELETE', /^\/channels\/312\/messages\/\d{15,}$/).length;
    ok('«!clear stop» останавливает долгую чистку', said(since(t), '312', /Deleted \d+ messages Stopped before the end/) && gone < 300, gone);

    t = Date.now();
    say(OWNER, '!qaclear all <@&200>', { channel_id: H });
    say(OWNER, '!qaclear all @3031', { channel_id: H });
    await waitFor(() => find(since(t), 'POST', new RegExp('^/channels/' + H + '/messages$')).filter(x => /How many|I cannot find/.test((x.body && x.body.content) || '')).length === 2);
    ok('непонятное вместо игрока (роль, опечатка) — «не нашёл», а не «удалить у всех»', !panelIn(since(t), H) &&
       find(since(t), 'GET', new RegExp('^/channels/' + H + '/messages')).length === 0);
    t = Date.now();
    say(OWNER, '!qaclear', { channel_id: H });
    say(OWNER, '!qaclear stop', { channel_id: H });
    say('U0', '!qaclear 5', { channel_id: H });
    await waitFor(() => said(since(t), H, /How many/) && said(since(t), H, /Nothing is being deleted/));
    await sleep(150);
    ok('без числа — подсказка; stop без чистки — так и пишет; у других не работает',
       said(since(t), H, /How many/) && said(since(t), H, /Nothing is being deleted/) &&
       find(since(t), 'GET', new RegExp('^/channels/' + H + '/messages')).length === 0);
  }

  console.log('\nновости и Logs в Discord:');
  process.env.DISCORD_UPDATES_CHANNEL_ID = CH.updates;
  const feed = require('./updatesFeed.js');
  let hook = null;
  // новость до запуска бота (её не публикуем) и сегодняшняя
  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(process.env.UPDATES_FILE, JSON.stringify([
    { id: '2026-10-13-1', date: '2026-10-13', title: 'Old news', text: 'old' },
    { id: today + '-1', date: today, title: 'Discord bot 🎉', text: '- First line\n- Second line',
      images: ['/news/shot.png', '/news/missing.png', '/news/../server.js', 'https://evil.example/x.png'] }]));
  const logged = [], loggedFiles = [];
  t = Date.now();
  denied.add(CH.updates);              // в #updates боту пока писать нельзя
  feed.start({ onLogChange: fn => { hook = fn; }, removeAutoLogs: () => 0, addAutoLog: (src, title, text, date, files) => { logged.push(src + '|' + title); loggedFiles.push(files); } });
  await waitFor(() => logged.length);
  await sleep(200);
  const fresh = find(since(t), 'POST', /^\/channels\/(302|306)\/messages$/);
  ok('новость из updates.json — во все каналы новостей, потом в Logs', fresh.length === 2 && logged.length === 1 &&
     logged[0] === 'upd:' + today + '-1|Discord bot', logged.join());
  ok('и в Discord, и в Logs — без эмодзи', fresh[0] && partsOf(fresh[0].body, 10)[0].content === '## Discord bot');
  const gal = fresh[0] && partsOf(fresh[0].body, 12)[0];
  ok('картинки новости: в Discord — ссылкой на сайт, в Logs — файлом; чужие и несуществующие отброшены',
     gal && gal.items.length === 1 && /\/news\/shot\.png$/.test(gal.items[0].media.url) &&
     loggedFiles[0] && loggedFiles[0].length === 1 && loggedFiles[0][0] === path.join(tmp, 'news', 'shot.png'),
     gal && JSON.stringify(gal.items));
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
  // вышедшую новость поправили в updates.json — правка доходит до Logs и до сообщений бота
  fs.writeFileSync(process.env.UPDATES_FILE, JSON.stringify([
    { id: today + '-1', date: today, title: 'Discord bot', text: '- First line, fixed' }]));
  const edits = [];
  t = Date.now();
  feed.start({ onLogChange: fn => { hook = fn; }, removeAutoLogs: () => 0, addAutoLog: () => null,
               editAutoLog: (src, title, text) => { edits.push(src + '|' + text); hook('edit', { src, title, text, date: Date.now(), images: [] }); } });
  await waitFor(() => find(since(t), 'PATCH', /^\/channels\/(302|306)\/messages\/\d+$/).length >= 1);
  await sleep(200);
  const fixed = find(since(t), 'PATCH', /^\/channels\/(302|306)\/messages\/\d+$/);
  // в #updates тогда прав не было — сообщение одно, в канале, выбранном командой
  ok('поправленная новость: правка в Logs и в сообщение бота в Discord, заново не публикуется',
     edits.join() === 'upd:' + today + '-1|- First line, fixed' && fixed.length === 1 && /^\/channels\/306\//.test(fixed[0].path) &&
     partsOf(fixed[0].body, 10).some(x => x.content === '- First line, fixed') &&
     find(since(t), 'POST', /^\/channels\/(302|306)\/messages$/).length === 0, edits.join());
  // новость убрали из updates.json (остался только «Release») — она уходит из Logs и из Discord
  const keepId = '2026-10-13-1';
  fs.writeFileSync(process.env.UPDATES_FILE, JSON.stringify([{ id: keepId, date: '2026-10-13', title: 'Release', text: 'old' }]));
  const removed = [], deletedBefore = find(calls, 'DELETE', /^\/channels\/(302|306)\/messages\/\d+$/).length;
  const posted = fixed[0] && fixed[0].path.split('/').pop();
  t = Date.now();
  feed.start({ onLogChange: fn => { hook = fn; }, removeAutoLogs: () => 0, addAutoLog: () => null, editAutoLog: () => null,
               autoLogSources: () => ['upd:' + today + '-1', 'upd:2026-10-10-9', 'upd:' + keepId],
               removeAutoLog: src => { removed.push(src); return true; } });
  await waitFor(() => find(since(t), 'DELETE', /^\/channels\/306\/messages\/\d+$/).length, 4000);
  await sleep(150);
  const gone = find(since(t), 'DELETE', /^\/channels\/(302|306)\/messages\/\d+$/);
  ok('новость убрали из updates.json — убрана из Logs и её сообщение в Discord удалено; оставшаяся не тронута',
     removed.sort().join() === ['upd:2026-10-10-9', 'upd:' + today + '-1'].sort().join() && gone.length === 1 &&
     gone[0].path === '/channels/306/messages/' + posted && removed.indexOf('upd:' + keepId) === -1, removed.join() + ' / ' + gone.map(g => g.path).join());
  const st0 = JSON.parse(fs.readFileSync(process.env.UPDATES_FEED_STATE, 'utf8'));
  ok('и больше о ней не помнит (не правит, не удаляет второй раз)', st0.posted.indexOf(today + '-1') === -1 && !st0.msgs['upd:' + today + '-1']);
  fs.writeFileSync(process.env.UPDATES_FILE, '[ broken');
  const removed2 = [];
  t = Date.now();
  feed.start({ onLogChange: fn => { hook = fn; }, removeAutoLogs: () => 0, addAutoLog: () => null, editAutoLog: () => null,
               autoLogSources: () => ['upd:' + keepId], removeAutoLog: src => { removed2.push(src); return true; } });
  await sleep(400);
  ok('битый updates.json — ничего не удаляется', !removed2.length && !find(since(t), 'DELETE', /^\/channels\/(302|306)\/messages\/\d+$/).length &&
     find(calls, 'DELETE', /^\/channels\/(302|306)\/messages\/\d+$/).length === deletedBefore + 1);

  console.log('\nитог окна, когда Discord не даёт превратить «думаю…» в новую карточку:');
  rejectV2Edit = true;
  t = Date.now();
  const sid4 = submit('updates:' + G, [{ type: 18, component: { type: 8, custom_id: 'channels', values: [CH.updates] } }]);
  await waitFor(() => find(since(t), 'POST', new RegExp('^/webhooks/700/tk' + sid4 + '$')).length);
  rejectV2Edit = false;
  c = since(t);
  const chain = c.filter(x => new RegExp('^/webhooks/700/tk' + sid4 + '(/messages/@original)?$').test(x.path)).map(x => x.method + ' ' + (x.path.indexOf('@original') !== -1 ? 'original' : 'followup'));
  const follow = find(c, 'POST', new RegExp('^/webhooks/700/tk' + sid4 + '$'))[0];
  ok('правка «думаю…» не принята — «думаю…» убрано, карточка пришла новым сообщением, видным только владельцу', chain.join() === 'PATCH original,DELETE original,POST followup' &&
     follow.body.flags === (32768 | 64) && /^Game updates Game updates will be posted in #updates/.test(plainOf(follow)), chain.join() + ' / ' + plainOf(follow));
  t = Date.now();
  const sid5 = submit('updates:' + G, [{ type: 18, component: { type: 8, custom_id: 'channels', values: [CH.updates] } }]);
  await waitFor(() => find(since(t), 'PATCH', new RegExp('^/webhooks/700/tk' + sid5 + '/messages/@original$')).length);
  ok('и обычная правка «думаю…» снова работает: одной правкой, без лишнего', find(since(t), 'POST', new RegExp('^/webhooks/700/tk' + sid5 + '$')).length === 0 &&
     find(since(t), 'DELETE', new RegExp('^/webhooks/700/tk' + sid5 + '/messages/@original$')).length === 0 &&
     /^Game updates Game updates will be posted in #updates/.test(plainOf(find(since(t), 'PATCH', new RegExp('^/webhooks/700/tk' + sid5 + '/messages/@original$'))[0])));

  console.log('\nпроверка пингов за весь тест:');
  {
    const posts = calls.filter(c => c.method === 'POST' && /^\/channels\/[^/]+\/messages$/.test(c.path) && bodyOf(c) && c.path !== '/channels/306/messages');
    const pinging = posts.filter(c => { const a = bodyOf(c).allowed_mentions; return !a || (a.parse && a.parse.length) || (a.users && a.users.length) || (a.roles && a.roles.length) || a.replied_user; });
    ok('ни одно сообщение бота за весь тест — в каналах и в личку, текстом и картинкой — не пингует (кроме поста !news, где владелец сам написал @everyone)',
       posts.length > 100 && posts.filter(c => bodyOf(c).flags & 32768).length > 20 && pinging.length === 0,
       posts.length + ' сообщений, с пингом: ' + pinging.map(c => c.path + ' ' + JSON.stringify(bodyOf(c).allowed_mentions)).slice(0, 3).join(' | '));
    const texts = posts.filter(c => /^\/channels\/(300|dm\w+)\/messages$/.test(c.path)).map(c => (bodyOf(c).content || '') + textsOf(bodyOf(c)).join('\n'));
    ok('в коротких сообщениях бота в канале нет упоминаний людей вообще (<@...>)', !texts.some(x => /<@/.test(x)), texts.filter(x => /<@/.test(x)).slice(0, 2).join(' | '));
  }

  {
    // все сообщения бота из новых компонентов Discord (кроме постов !news и новостей, где кнопку выбирает владелец): кнопки только серые и ссылки, id не повторяются
    const v2 = calls.filter(x => x.body && (x.body.flags & 32768) && /^\/channels\/(300|301|303|dm\w+)\/messages$/.test(x.path) && x.method === 'POST');
    const bad = v2.filter(x => buttonsOf(bodyOf(x)).some(b => !(b.style === 2 || b.style === 5)) ||
      new Set(buttonsOf(bodyOf(x)).map(b => b.custom_id).filter(Boolean)).size !== buttonsOf(bodyOf(x)).map(b => b.custom_id).filter(Boolean).length);
    ok('во всех сообщениях бота за весь тест кнопки только серые (secondary) и ссылки, id кнопок не повторяются', v2.length > 20 && bad.length === 0,
       v2.length + ' сообщений' + (bad[0] ? ', плохое: ' + JSON.stringify(buttonsOf(bodyOf(bad[0]))).slice(0, 200) : ''));
    const tooLong = calls.filter(x => x.body && (x.body.flags & 32768)).filter(x => textsOf(bodyOf(x)).join('').length > 4000);
    ok('в одном сообщении не больше 4000 знаков текста (предел Discord)', tooLong.length === 0, tooLong.length);
  }

  console.log('\nподключение:');
  t = Date.now();
  sock.send(JSON.stringify({ op: 7, d: null }));
  const resume = await waitFor(() => gwLog.find(m => m.op === 6), 8000);
  ok('просьба переподключиться — продолжает ту же сессию (resume)', resume && resume.d.session_id === 'sess1' && resume.d.seq > 0);

  t = Date.now();
  bot.stop();
  await sleep(200);
  // состояние от прежней версии бота: свой текст правил, отдельный русский пост, накопленные штрафные баллы
  // и два встроенных правила AutoMod, которых теперь нет
  const sf = JSON.parse(fs.readFileSync(process.env.DISCORD_BOT_STATE, 'utf8'));
  ok('бот запомнил, на каком сообщении остановился в каждом канале (после остановки это уже в файле состояния)',
     sf.watch && sf.watch.last && /^\d+$/.test(sf.watch.last[CH.general] || '') && Object.keys(sf.watch.last).length >= 3, JSON.stringify(sf.watch && Object.keys(sf.watch.last)));
  Object.assign(sf.guilds[G].rules, { custom: true, en: 'my own rules', ru: 'мои правила', ruMessage: '9999' });
  delete sf.fixes.rules7;
  sf.strikes = { [G + ':U1']: [{ t: Date.now(), p: 2, r: 1, k: 'slur', by: 'auto' }], [G + ':U2']: [{ t: Date.now(), p: 1, r: 2, k: 'caps', by: 'auto' }] };
  Object.assign(sf.guilds[G].automod, { mentions: '123', spam: '456' });
  fs.writeFileSync(process.env.DISCORD_BOT_STATE, JSON.stringify(sf));
  amRules = [{ id: '123', name: 'AIBROFIST: mention spam', trigger_type: 5 }, { id: '456', name: 'My own spam rule', trigger_type: 3 },
             { id: sf.guilds[G].automod.words, name: 'AIBROFIST: slurs and sexual content', trigger_type: 4 }];
  // пока бот был выключен (выкладка), в чат пришло: 2 минуты назад — мошенник; 30 минут назад — тоже, но это уже давно
  const down1 = lost('R1', 'free nitro https://dlscord.gift/while-off', 120000);
  const down2 = lost('R2', 'free nitro https://dlscord.gift/long-ago', 30 * 60000);
  const before = gwLog.length;
  closeNextIdentify = 4014;
  bot._test.reload();
  ok('накопленные штрафные баллы при загрузке пропали: у всех счёт с нуля', !('strikes' in bot._test.state()));
  bot.start();
  const ident2 = await waitFor(() => gwLog.slice(before).filter(m => m.op === 2).length >= 2 && gwLog.slice(before).filter(m => m.op === 2)[1], 8000);
  ok('без привилегированных intents переподключается без них', ident2 && ident2.d.intents === (1 | 4 | 512 | 2097152), ident2 && ident2.d.intents);
  await waitFor(() => find(since(t), 'PUT', /bans\/R1$/).length, 8000);
  await sleep(1500);
  c = since(t);
  ok('пришедшее за время простоя (2 минуты назад) бот доразобрал сам: удалено, бан', find(c, 'DELETE', new RegExp('/messages/' + down1.id + '$')).length === 1 &&
     find(c, 'PUT', /bans\/R1$/).length === 1);
  ok('а давнее (30 минут назад) не трогает: после долгого простоя не наказываем за старое', find(c, 'DELETE', new RegExp('/messages/' + down2.id + '$')).length === 0 &&
     find(c, 'PUT', /bans\/R2$/).length === 0);
  const rfix = find(c, 'PATCH', new RegExp('^/channels/301/messages/' + (rpost && rpost.resId) + '$'))[0];
  ok('один раз бот заменил и свой прежний текст: пост исправлен на месте — 7 правил сообщением и флаги, нового поста нет', rfix &&
     /1 No spam/.test(plainOf(rfix)) && !/my own rules/.test(J(rfix)) && flagsOf(bodyOf(rfix)).map(b => b.label).join() === 'English,Русский,My language' &&
     find(c, 'POST', /^\/channels\/301\/messages$/).length === 0 && bot._test.state().guilds[G].rules.custom !== true && bot._test.state().fixes.rules7 === true);
  ok('прежний отдельный русский пост убран', find(c, 'DELETE', /^\/channels\/301\/messages\/9999$/).length === 1 && bot._test.state().guilds[G].rules.ruMessage === undefined);
  ok('пропавшие из правил встроенные правила AutoMod (упоминания) удалены, чужое («My own spam rule») не тронуто',
     find(c, 'DELETE', /auto-moderation\/rules\/123$/).length === 1 && find(c, 'DELETE', /auto-moderation\/rules\/456$/).length === 0 &&
     bot._test.state().guilds[G].automod.mentions === 'removed' && bot._test.state().guilds[G].automod.spam === 'removed' &&
     find(c, 'POST', /auto-moderation\/rules$/).length === 0);
  ok('после перезапуска больше ничего не постит заново (команды)', find(c, 'PUT', /commands$/).length === 0);
  await sleep(700);
  const saved = JSON.parse(fs.readFileSync(process.env.DISCORD_BOT_STATE, 'utf8'));
  ok('в файле состояния баллов больше нет', !('strikes' in saved) && saved.fixes.rules7 === true);
  t = Date.now();
  bot.stop();
  await sleep(200);
  const before2 = gwLog.length;
  bot._test.reload();
  bot.start();
  await waitFor(() => gwLog.slice(before2).filter(m => m.op === 2).length >= 1, 8000);
  await sleep(2500);
  ok('ещё один перезапуск: правила не публикуются заново, AutoMod не трогается, уже разобранное второй раз не разбирается (позиция сохранена)',
     find(since(t), 'POST', /^\/channels\/301\/messages$/).length === 0 && find(since(t), 'PATCH', /^\/channels\/301\/messages\/\d+$/).length === 0 &&
     find(since(t), 'DELETE', /auto-moderation/).length === 0 && find(since(t), 'POST', /auto-moderation/).length === 0 &&
     find(since(t), 'PUT', /bans\/R1$/).length === 0 && find(since(t), 'DELETE', new RegExp('/messages/' + down1.id + '$')).length === 0);

  // выкладка с кнопками темы: пост правил, выложенный раньше, один раз правится на месте (текст владельца остаётся)
  bot.stop();
  await sleep(200);
  const sf2 = JSON.parse(fs.readFileSync(process.env.DISCORD_BOT_STATE, 'utf8'));
  ok('в состоянии отмечено: пост правил уже в нынешнем оформлении (сообщения Discord)', sf2.fixes.rulesCard === 4);
  sf2.fixes.rulesCard = 3;                // состояние от прежнего оформления (картинки)
  fs.writeFileSync(process.env.DISCORD_BOT_STATE, JSON.stringify(sf2));
  t = Date.now();
  bot._test.reload();
  bot.start();
  await waitFor(() => find(since(t), 'PATCH', /^\/channels\/301\/messages\/\d+$/).length, 8000);
  await sleep(500);
  const upg = find(since(t), 'PATCH', /^\/channels\/301\/messages\/\d+$/);
  ok('после выкладки нового оформления бот один раз правит пост правил на месте: нового поста нет, прежняя картинка убрана из поста, вместо неё текст и один ряд флагов',
     upg.length === 1 && find(since(t), 'POST', /^\/channels\/301\/messages$/).length === 0 && bodyOf(upg[0]).flags === 32768 && !multipartOf(upg[0]) &&
     Array.isArray(bodyOf(upg[0]).attachments) && bodyOf(upg[0]).attachments.length === 0 && rowsOf(bodyOf(upg[0])).length === 1 &&
     /^AIBROFIST Server Rules 1 No spam /.test(plainOf(upg[0])) && bot._test.state().fixes.rulesCard === 4,
     upg.length + ' ' + (upg[0] ? JSON.stringify(Object.keys(bodyOf(upg[0]))) + ' ' + plainOf(upg[0]).slice(0, 60) + ' rows ' + rowsOf(bodyOf(upg[0])).length : '') + ' card=' + bot._test.state().fixes.rulesCard);

  bot.stop();
  wss.close(); server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('✗ тест упал:', e.stack); process.exit(1); });
