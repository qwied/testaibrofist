// ============ DISCORD-БОТ: правила, автомодерация, команды ============
// Работает, только если на хостинге задан DISCORD_BOT_TOKEN; без него
// модуль ничего не делает. Что умеет:
//   - автомодерация: проверяет каждое сообщение (discordAutomod.js),
//     удаляет нарушения и наказывает так, как написано у самого правила
//     (discordRules.js): предупреждение, мьют на 10 минут или час, бан
//     только за мошенничество; предупреждения копятся — 3-е за 30 дней
//     даёт мьют на час (счёта баллов нет);
//     следит и за участниками: ники, рейды (больше 100 входов за минуту),
//     имя как у забаненного;
//     дополнительно включает встроенную AutoMod Discord со списком
//     слов вражды и 18+, которые она не даёт отправить вовсе;
//   - пишет игроку в личку, за что и как он наказан, а в канал mod-log
//     (если он есть) — запись о случае;
//   - отвечает аккуратными сообщениями Discord (рамка, текст, аватарка,
//     серые кнопки; discordViews.js). Язык берёт у самого Discord (locale в
//     команде или нажатии): английский, русский и ещё 10 языков из
//     discordLang.js, остальным — английский. Под сообщением кнопки English /
//     Русский и глобус «My language» (то же на языке нажавшего);
//   - секретные команды владельца сервера прямо в канале (начало команд —
//     DISCORD_CMD_PREFIX на хостинге): news (пост в любой канал с
//     картинками и кнопкой-ссылкой — в окне, которое видит только он),
//     updates (в какие каналы идут новости), warn, warns, unwarn, mute,
//     unmute, ban, unban, modlog, clear (удалить сообщения в канале),
//     stats, help. Остальным они не видны и не работают.
// Правила сервера владелец пишет в #rules сам; номера правил в
// уведомлениях бота — из discordRules.js.
// Новости в #updates публикует updatesFeed.js — каналы для них берёт отсюда.
// Состояние — data/discordBot.json.
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { api, ok, token, frame, COMPONENTS_V2 } = require('./discordApi.js');
const { Gateway } = require('./discordGateway.js');
const R = require('./discordRules.js');
const A = require('./discordAutomod.js');
const { atomicWriteFileSync } = require('./fsAtomic.js');

const STATE_FILE = process.env.DISCORD_BOT_STATE || path.join(__dirname, 'data', 'discordBot.json');
const SCAN_IMAGES = process.env.DISCORD_SCAN_IMAGES !== '0';

const INTENT = { GUILDS: 1, GUILD_MEMBERS: 1 << 1, GUILD_MODERATION: 1 << 2, GUILD_MESSAGES: 1 << 9,
                 MESSAGE_CONTENT: 1 << 15, AUTOMOD_EXECUTION: 1 << 21 };
const ALL_INTENTS = INTENT.GUILDS | INTENT.GUILD_MEMBERS | INTENT.GUILD_MODERATION | INTENT.GUILD_MESSAGES |
                    INTENT.MESSAGE_CONTENT | INTENT.AUTOMOD_EXECUTION;
// «привилегированные»: их надо включить в Developer Portal, иначе Discord не пустит
const PRIVILEGED = INTENT.GUILD_MEMBERS | INTENT.MESSAGE_CONTENT;

const PERM = { KICK: 1n << 1n, BAN: 1n << 2n, ADMIN: 1n << 3n, MANAGE_GUILD: 1n << 5n,
               MANAGE_MESSAGES: 1n << 13n, MODERATE: 1n << 40n };
const ALL_PERMS = (1n << 64n) - 1n;

const COOLDOWN = 30 * 1000;      // за одну волну спама — одно наказание, а не восемь
const RAID_JOINS = 100;           // больше стольких входов за минуту — рейд
const RAID_MS = 10 * 60 * 1000;
const NOTICE_MS = 10 * 1000;     // короткое предупреждение в канале исчезает само

// banned — приметы забаненных (аватарка, имя): по ним ловим обход бана
// warns — предупреждения участников («сервер:игрок» -> список), cards — карточки, которые можно показать на другом языке
let state = { feed: [], guilds: {}, cases: 0, banned: {}, unbans: {}, fixes: {}, watch: { last: {} }, warns: {}, cards: {} };
let loaded = false, saveTimer = null;
const guilds = new Map();        // id -> { id, name, owner, roles: Map, channels: Map }
const setupDone = new Set();
const lastHit = new Map();       // guild:user -> { t, weight }
const inviteCache = new Map();   // код приглашения -> { guild, t }
const dmChannels = new Map();
const said = new Set();          // какие подсказки владельцу уже были в журнале
const flood = new A.FloodWatch();
const joins = new Map();          // guild -> времена входов за последнюю минуту
const raidUntil = new Map();
const softHit = new Map();        // guild:user -> когда последний раз писали «подожди»
const reviewHit = new Map();      // guild:user:вид -> когда последний раз сообщали владельцу
const spamHits = new Map();       // guild:user -> { n, t }: сколько раз подряд спамил и когда в последний
let gw = null, me = null, appId = null, timers = [];

const log = (...a) => console.log('[discord]', ...a);
const once = (key, ...a) => { if (!said.has(key)) { said.add(key); log(...a); } };

/* ---------- состояние ---------- */
function loadState() {
  if (loaded) return;
  loaded = true;
  let s0 = null;
  try {
    const s = s0 = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    state = {
      feed: Array.isArray(s.feed) ? s.feed.filter(x => /^\d+$/.test(x)) : [],
      guilds: s.guilds && typeof s.guilds === 'object' ? s.guilds : {},
      cases: Number(s.cases) || 0,
      banned: s.banned && typeof s.banned === 'object' ? s.banned : {},
      unbans: s.unbans && typeof s.unbans === 'object' ? s.unbans : {},    // «сервер:игрок» -> когда снять бан
      fixes: s.fixes && typeof s.fixes === 'object' ? s.fixes : {},        // разовые исправления, уже сделанные
      watch: { last: s.watch && s.watch.last && typeof s.watch.last === 'object' ? s.watch.last : {} },  // канал -> последнее прочитанное сообщение
      warns: s.warns && typeof s.warns === 'object' ? s.warns : {},
      cards: s.cards && typeof s.cards === 'object' ? s.cards : {}
    };
  } catch (e) { /* первый запуск */ }
  // штрафных баллов больше нет — у каждого правила своё наказание; накопленные при загрузке не читаются
  // и пропадают при первом сохранении (у всех счёт с нуля)
  if (s0 && s0.strikes) save();
}

function saveNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    atomicWriteFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) { log('state not saved:', e.message); }
}
function save() { if (!saveTimer) saveTimer = setTimeout(saveNow, 500); }

function gstate(gid) {
  if (!state.guilds[gid]) state.guilds[gid] = {};
  const g = state.guilds[gid];
  if (!g.automod) g.automod = {};
  return g;
}


/* ---------- кэш сервера из событий Gateway ---------- */
function cacheGuild(d) {
  const g = { id: d.id, name: d.name, owner: d.owner_id, roles: new Map(), channels: new Map() };
  (d.roles || []).forEach(r => g.roles.set(r.id, { perms: BigInt(r.permissions || '0'), name: r.name }));
  (d.channels || []).forEach(c => g.channels.set(c.id, chan(c)));
  (d.threads || []).forEach(c => g.channels.set(c.id, chan(c)));
  guilds.set(g.id, g);
  return g;
}
const chan = c => ({ id: c.id, name: String(c.name || ''), type: c.type, nsfw: !!c.nsfw, parent: c.parent_id || null, last: c.last_message_id || null });

function memberPerms(g, uid, roleIds) {
  if (g.owner === uid) return ALL_PERMS;
  let p = (g.roles.get(g.id) || { perms: 0n }).perms;              // @everyone
  for (const r of roleIds || []) p |= (g.roles.get(r) || { perms: 0n }).perms;
  return (p & PERM.ADMIN) ? ALL_PERMS : p;
}

function channelInfo(g, id) {
  const c = g.channels.get(id);
  if (!c) return { nsfw: false, name: '' };
  // ветка наследует 18+ и назначение у своего канала
  const parent = c.parent ? g.channels.get(c.parent) : null;
  const isThread = c.type === 10 || c.type === 11 || c.type === 12;
  return { nsfw: c.nsfw || !!(isThread && parent && parent.nsfw),
           name: isThread && parent ? parent.name : c.name };
}

function findChannel(g, exact, loose) {
  const text = [...g.channels.values()].filter(c => c.type === 0 || c.type === 5);
  const c = text.find(c => exact.test(c.name)) || (loose && text.find(c => loose.test(c.name)));
  return c ? c.id : null;
}

function modlogChannel(g) {
  const st = gstate(g.id);
  if (st.modlog === '') return null;                         // выключен командой /modlog
  if (st.modlog) return st.modlog;
  const env = String(process.env.DISCORD_MODLOG_CHANNEL_ID || '').trim();
  if (env) return env;
  return findChannel(g, /^(?:mod-?logs?|moderation-?logs?|модер[а-я-]*лог[а-я]*)$/i);
}

/* ---------- отправка ----------
   Бот никого не пингует: если в сообщении явно не указано иначе
   (allowed_mentions — так делает только пост !news с @everyone и @ролью, которые
   владелец сам написал), упоминания в его сообщениях никого не уведомляют. */
const noPing = body => body && body.allowed_mentions ? body : Object.assign({ allowed_mentions: { parse: [] } }, body);

// как человека назвать в сообщении бота: ник на сервере, имя, логин — обычным текстом, без упоминания
const nameOf = (user, member) => String((member && member.nick) || (user && (user.global_name || user.username)) || (user && user.id) || 'member');
// автор сообщения для предупреждения владельцу: имя и id обычным текстом, без упоминания
const authorText = m => plainName(nameOf(m.author, m.member)) + ' (' + (m.author && m.author.id) + ')';
const plainName = s => String(s || '').replace(/[\\*_`~|>#\[\]()<@:-]/g, c => '\\' + c).slice(0, 60);

async function sendMessage(channel, body, reason) {
  const r = await api('POST', '/channels/' + channel + '/messages', noPing(body), { reason });
  if (!ok(r) && r.status === 403) once('nowrite:' + channel, 'cannot write to channel ' + channel + ': allow View Channel, Send Messages and Embed Links for the bot there');
  return r;
}

async function deleteMessages(list, reason) {
  const byChannel = new Map();
  for (const m of list) {
    if (!byChannel.has(m.channel)) byChannel.set(m.channel, []);
    byChannel.get(m.channel).push(m.id);
  }
  for (const [channel, ids] of byChannel) {
    let r = null;
    if (ids.length >= 2) r = await api('POST', '/channels/' + channel + '/messages/bulk-delete', { messages: ids.slice(0, 100) }, { reason });
    if (!r || !ok(r)) {
      for (const id of ids) {
        r = await api('DELETE', '/channels/' + channel + '/messages/' + id, null, { reason });
        if (r.status === 403) { once('nodel:' + channel, 'cannot delete messages in ' + channel + ': give the bot Manage Messages'); break; }
      }
    }
  }
}

async function dmChannel(uid) {
  let ch = dmChannels.get(uid);
  if (!ch) {
    const r = await api('POST', '/users/@me/channels', { recipient_id: uid });
    if (!ok(r) || !r.body) return null;
    ch = r.body.id;
    dmChannels.set(uid, ch);
  }
  return ch;
}
async function dm(uid, body) {
  const ch = await dmChannel(uid);
  if (!ch) return false;
  const r = await api('POST', '/channels/' + ch + '/messages', noPing(body));
  return ok(r);          // 403 — у игрока закрыты личные сообщения
}
// в личку — карточкой (не вышло собрать — текстом fallback)
async function dmCard(uid, kind, data, gid, fallback) {
  const ch = await dmChannel(uid);
  if (!ch) return false;
  return ok(await postCard(ch, kind, data, gid, fallback, true));
}

async function notice(channel, name, text) {
  const r = await sendMessage(channel, { content: '**' + plainName(name) + '**, ' + text, allowed_mentions: { parse: [] } });
  if (ok(r) && r.body && r.body.id) {
    const t = setTimeout(() => api('DELETE', '/channels/' + channel + '/messages/' + r.body.id).catch(() => {}), NOTICE_MS);
    if (t.unref) t.unref();
  }
}

const quote = s => String(s || '').replace(/```/g, "'''").replace(/\s+\n/g, '\n').slice(0, 300);
const color = step => !step ? R.COLORS.neutral : step.type === 'ban' ? R.COLORS.ban : step.type === 'mute' ? R.COLORS.mute : R.COLORS.warn;
const ruleLine = id => { const r = R.ruleById(id); return r ? r.id + '. ' + r.title : 'Owner decision'; };

async function modlog(g, entry) {
  const ch = modlogChannel(g);
  if (!ch) return;
  const fields = [
    { name: 'User', value: (entry.userName ? plainName(entry.userName) : '<@' + entry.user + '>') + ' (' + entry.user + ')', inline: true },
    { name: 'By', value: entry.by ? (entry.byName ? plainName(entry.byName) : '<@' + entry.by + '>') : 'Automod', inline: true }
  ];
  if (entry.rule !== undefined) fields.push({ name: 'Rule', value: entry.ruleText || ruleLine(entry.rule), inline: true });
  if (entry.reason) fields.push({ name: 'Reason', value: String(entry.reason).slice(0, 1000) });
  if (entry.channel) fields.push({ name: 'Channel', value: '<#' + entry.channel + '>', inline: true });
  const embed = { color: entry.color || R.COLORS.neutral, title: 'Case ' + entry.caseNo + ' | ' + entry.title, fields,
                  timestamp: new Date().toISOString() };
  if (entry.excerpt) embed.description = '>>> ' + quote(entry.excerpt);
  await sendMessage(ch, { embeds: [embed], allowed_mentions: { parse: [] } });
}

/* ---------- наказания ---------- */
async function timeout(g, uid, ms, reason) {
  const until = ms ? new Date(Date.now() + ms).toISOString() : null;
  const r = await api('PATCH', '/guilds/' + g.id + '/members/' + uid, { communication_disabled_until: until }, { reason });
  if (r.status === 403) once('nomute:' + g.id, 'cannot mute in ' + g.name + ': give the bot Timeout Members and move its role above member roles');
  return ok(r);
}

async function ban(g, uid, reason) {
  const r = await api('PUT', '/guilds/' + g.id + '/bans/' + uid, { delete_message_seconds: 3600 }, { reason });
  if (r.status === 403) once('noban:' + g.id, 'cannot ban in ' + g.name + ': give the bot Ban Members and move its role above member roles');
  return ok(r);
}

/* Временный бан: когда снять. ms нет — бан навсегда, снимать нечего. */
function setUnban(gid, uid, ms) {
  if (ms) state.unbans[gid + ':' + uid] = Date.now() + ms;
  else delete state.unbans[gid + ':' + uid];
  save();
}

// бан снят (сам или владельцем): это тот же игрок, а не второй аккаунт — из приметы убираем
function forgetBan(gid, uid) {
  delete state.unbans[gid + ':' + uid];
  if (state.banned[gid]) state.banned[gid] = state.banned[gid].filter(b => b.id !== uid);
  save();
}

// срок временных банов вышел — снимаем (проверка раз в минуту)
async function releaseBans(now) {
  now = now || Date.now();
  for (const [key, until] of Object.entries(state.unbans)) {
    if (until > now) continue;
    const [gid, uid] = key.split(':');
    const r = await api('DELETE', '/guilds/' + gid + '/bans/' + uid, null, { reason: 'Temporary ban is over' });
    if (!ok(r) && r.status !== 404) continue;                    // не вышло — попробуем через минуту
    forgetBan(gid, uid);
    const g = guilds.get(gid);
    if (g && ok(r)) await modlog(g, { caseNo: ++state.cases, title: 'Temporary ban is over', color: R.COLORS.ok, user: uid }).catch(() => {});
  }
}

/* Наказание за нарушение. f — находка ({rule, weight, kind, note}); что делать,
   написано у самого правила (R.actionFor), ctx.step — своё наказание
   (спам, предупреждение владельца). ctx.by — владелец (для warn), ctx.channel —
   где было нарушение, ctx.silent — не писать в канал (сообщение и так не
   появилось), ctx.until — до какого времени игрок уже в мьюте (короче не делаем),
   ctx.card — в канал не писать: вызвавший сам выложит карточку (res.card).
   Предупреждение засчитывается (addWarn): третье за 30 дней — ещё и мьют на час. */
async function punish(g, user, f, ctx) {
  ctx = ctx || {};
  const step = ctx.step || R.actionFor(f);
  const caseNo = ++state.cases;
  save();
  const rule = R.ruleById(f.rule);
  const ruleText = rule ? rule.id + '. ' + rule.title : f.kind === 'custom' ? 'Server rules' : 'Owner decision';
  // правила для всех, но Discord не даёт мьютить и банить владельца сервера, а мьютить — администраторов
  const hard = step.type === 'mute' || step.type === 'ban';
  const owner = user.id === g.owner;
  const admin = !owner && !!(memberPerms(g, user.id, ctx.roles) & PERM.ADMIN);
  const blocked = owner ? (hard ? 'the server owner cannot be muted or banned' : '')
                        : admin && step.type === 'mute' ? 'administrators cannot be muted' : '';
  const why = f.note + (f.detail ? ' (' + f.detail + ')' : '');
  const reason = 'Case ' + caseNo + ': ' + (rule ? 'rule ' + rule.id + ', ' : '') + why;
  const name = ctx.name || nameOf(user, ctx.member);
  const av = avatarUrl(g.id, user, ctx.member);

  // предупреждение засчитывается; набралось три — мьют на час (владельца и администраторов Discord мьютить не даёт)
  let warned = null, esc = null, escBlocked = '';
  if (step.type === 'warn' && !user.bot) {
    warned = addWarn(g.id, user.id, { at: Date.now(), rule: f.rule || 0, kind: f.kind === 'manual' ? undefined : f.kind, reason: why,
                                      by: ctx.by ? (ctx.byName || 'owner') : '', caseNo, name, av });
    if (warned.escalate) { esc = R.WARNS.act; escBlocked = owner ? 'the server owner cannot be muted or banned' : admin ? 'administrators cannot be muted' : ''; }
  }
  const action = warned
    ? 'Warning ' + warned.n + ' of ' + warned.limit + (esc ? ': ' + R.describe(esc).toLowerCase() + (escBlocked ? ' (not applied: ' + escBlocked + ')' : '') : '')
    : R.describe(step) + (blocked ? ' (not applied: ' + blocked + ')' : '');
  const cardData = { type: step.type === 'none' ? 'none' : step.type, name, user: user.username || '', avatarUrl: av,
                     rule: f.rule || 0, kind: f.kind === 'manual' ? undefined : f.kind, detail: f.detail, reason: why, ms: step.ms || 0,
                     n: warned ? warned.n : undefined, limit: warned ? warned.limit : undefined, escalated: esc ? { ms: esc.ms } : null,
                     blocked: blocked ? (owner ? 'owner' : 'admin') : escBlocked ? (owner ? 'owner' : 'admin') : '',
                     by: ctx.by ? (ctx.byName || '') : '', caseNo, at: Date.now() };

  // личное сообщение — до бана, иначе оно уже не дойдёт; карточкой, не вышло — текстом
  await dmCard(user.id, 'action', cardData, g.id, { embeds: [{
    color: color(step),
    title: blocked || !hard ? (esc && !escBlocked ? 'You have been muted' : 'Warning')
         : step.type === 'ban' ? (step.ms ? 'You have been banned for ' + R.duration(step.ms) : 'You have been banned permanently')
         : 'You have been muted',
    description: ctx.dm || ((ctx.by ? 'The owner of **' : 'Your message in **') + g.name + (ctx.by ? '** gave you a warning.' : '** was removed.')),
    fields: [
      { name: 'Rule', value: ruleText, inline: true },
      { name: 'Action', value: action, inline: true },
      { name: 'Reason', value: why.slice(0, 1000) }
    ],
    footer: { text: step.type === 'ban' && step.ms ? 'The ban is lifted automatically when it ends. If you think this is a mistake, message the owner.'
                                                     : 'If you think this is a mistake, message the owner.' }
  }] }).catch(() => false);

  let done = true;                                     // blocked — наказывать нечем: только предупреждение
  if (!blocked && step.type === 'mute') {
    // уже замьючен дольше (например, владельцем на неделю) — не сокращаем
    if (!(ctx.until && ctx.until > Date.now() + step.ms)) done = await timeout(g, user.id, step.ms, reason);
  }
  else if (!blocked && step.type === 'ban') {
    done = await ban(g, user.id, reason);
    if (done) setUnban(g.id, user.id, step.ms);
  }
  if (esc && !escBlocked && !(ctx.until && ctx.until > Date.now() + esc.ms))
    done = await timeout(g, user.id, esc.ms, reason + ' (' + warned.limit + ' warnings within 30 days)');
  cardData.failed = !done;

  if (ctx.channel && !ctx.silent && !ctx.card && (step.type !== 'ban' || blocked)) {
    // автоматическое: что сделано с сообщением (предупреждение владельца — карточкой, её выкладывает вызвавший)
    const line = ctx.by
      ? 'you received a warning' + (rule ? ' for rule ' + rule.id + ', ' + rule.title.toLowerCase() : '') + ': ' + why.replace(/[.!?\s]+$/, '') + '. ' + action + '.'
      : 'your message was removed' + (rule ? ': rule ' + rule.id + ', ' + rule.title.toLowerCase() : '') + '. ' + action + '.';
    await notice(ctx.channel, name, line).catch(() => {});
  }
  await modlog(g, { caseNo, title: action + (done ? '' : ' (failed: no permission)'), color: color(esc && !escBlocked ? esc : step),
                    user: user.id, userName: ctx.name || (user.username || user.global_name ? nameOf(user) : ''), by: ctx.by, byName: ctx.byName,
                    rule: f.rule || 0, ruleText, reason: why,
                    channel: ctx.channel, excerpt: ctx.excerpt }).catch(() => {});
  return { step, caseNo, done, warned, esc, card: cardData };
}

// нарушение в сообщении: удалить и — если это не та же волна — наказать
async function enforce(g, m, f) {
  // решаем сразу, до ожидания сети: сообщения волны приходят почти разом
  const key = g.id + ':' + m.author.id, now = Date.now();
  const last = lastHit.get(key);
  const repeat = f.kind !== 'flood' && !!(last && now - last.t < COOLDOWN && last.weight >= f.weight);
  if (!repeat && f.kind !== 'flood') lastHit.set(key, { t: now, weight: f.weight });
  const msgs = f.messages && f.messages.length ? f.messages : [{ id: m.id, channel: m.channel_id }];
  await deleteMessages(msgs, f.note).catch(e => log('delete failed:', e.message));
  if (f.kind === 'flood') return spam(g, m, f);
  if (repeat) return null;
  const until = Date.parse(m.member && m.member.communication_disabled_until) || 0;
  return punish(g, m.author, f, { channel: m.channel_id, excerpt: m.content, until, roles: m.member && m.member.roles, name: nameOf(m.author, m.member), member: m.member });
}

/* Спам (правило 1): каждое срабатывание — сообщения уже удалены и игроку
   коротко сказано «помедленнее»; на 5-е срабатывание за час — мьют на 10
   минут; после мьюта и после часа без спама счёт начинается заново. */
async function spam(g, m, f) {
  const key = g.id + ':' + m.author.id, now = Date.now();
  let h = spamHits.get(key);
  if (!h || now - h.t > R.SPAM.reset) h = { n: 0, t: now };
  h.n++; h.t = now;
  if (h.n < R.SPAM.limit) {
    spamHits.set(key, h);
    // сообщение «помедленнее» — не чаще раза в несколько секунд: пачки идут одна за другой
    if (now - (softHit.get('spam:' + key) || 0) > 5000) {
      softHit.set('spam:' + key, now);
      await notice(m.channel_id, nameOf(m.author, m.member), 'slow down: more than 3 messages within 2 seconds is spam (rule 1, ' + h.n + ' of ' + R.SPAM.limit + ').').catch(() => {});
    }
    return null;
  }
  spamHits.delete(key);
  const until = Date.parse(m.member && m.member.communication_disabled_until) || 0;
  return punish(g, m.author, f, { channel: m.channel_id, excerpt: m.content, until, roles: m.member && m.member.roles, name: nameOf(m.author, m.member), member: m.member });
}

/* ---------- приглашения на чужие серверы ---------- */
async function foreignInvite(g, codes) {
  const allowed = String(process.env.DISCORD_ALLOWED_INVITE_GUILDS || '').split(',').map(s => s.trim()).filter(Boolean);
  for (const code of codes) {
    let c = inviteCache.get(code);
    if (!c || Date.now() - c.t > 6 * 60 * 60 * 1000) {
      const r = await api('GET', '/invites/' + encodeURIComponent(code));
      if (r.status === 404) c = { guild: null, t: Date.now() };          // приглашение не действует
      else if (ok(r) && r.body) c = { guild: r.body.guild ? r.body.guild.id : null, t: Date.now() };
      else continue;                                                     // не узнали — не наказываем
      inviteCache.set(code, c);
    }
    if (c.guild && c.guild !== g.id && allowed.indexOf(c.guild) === -1) return code;
  }
  return null;
}

/* ---------- картинки 18+ ----------
   Та же локальная нейросеть, что проверяет скины (imgModeration.js), но
   свои пороги: здесь наказываем только явное (порно, хентай), а не
   купальники. Очередь по одной картинке, чтобы не грузить сервер игры. */
const imgQueue = [];
let imgBusy = false;
const IMG_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' };
const CDN = /^(?:cdn\.discordapp\.com|media\.discordapp\.net)$/;
const TEST_CDN = String(process.env.DISCORD_TEST_CDN || '');      // только тесты: свой сервер вместо CDN
/* Посредник в Cloudflare (cloudflare/discord-relay.mjs): хостинг не достаёт
   до файлов Discord и до живого подключения — через него достаёт. Задаётся
   на хостинге: DISCORD_RELAY_URL (https://relay.aibrofist.online) и
   DISCORD_RELAY_KEY (тот же секрет, что RELAY_KEY у посредника). */
const RELAY = { url: String(process.env.DISCORD_RELAY_URL || '').trim().replace(/\/+$/, ''),
                key: String(process.env.DISCORD_RELAY_KEY || '').trim() };
const relayOn = () => !!(RELAY.url && RELAY.key);

function download(url, limit) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const test = TEST_CDN && u.protocol === 'http:' && u.host === TEST_CDN;
    if (!test && (u.protocol !== 'https:' || !CDN.test(u.hostname))) return reject(new Error('not a Discord CDN url'));
    // есть посредник — файл берём через него (сам хостинг до CDN не достаёт)
    const via = !test && relayOn() ? new URL(RELAY.url + '/cdn?url=' + encodeURIComponent(u.toString())) : u;
    const opts = { family: 4, timeout: 15000 };
    if (via !== u) opts.headers = { 'x-relay-key': RELAY.key };
    const req = (via.protocol === 'http:' ? require('http') : https).get(via, opts, res => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('status ' + res.statusCode)); }
      const chunks = []; let size = 0;
      res.on('data', c => { size += c.length; if (size > limit) req.destroy(new Error('too big')); else chunks.push(c); });
      res.on('end', () => resolve({ buf: Buffer.concat(chunks), type: String(res.headers['content-type'] || '').split(';')[0] }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

// видит ли сайт CDN Discord (оттуда бот скачивает картинки) — для страницы состояния
const cdn = { at: 0, ok: null, error: '' };
function checkCdn() {
  if (Date.now() - cdn.at < 10 * 60 * 1000) return;
  if (process.env.DISCORD_API_BASE && !TEST_CDN && !relayOn()) return;   // тесты без своего CDN
  cdn.at = Date.now();
  const url = TEST_CDN && !relayOn() ? 'http://' + TEST_CDN + '/cdn/pic.png' : 'https://cdn.discordapp.com/embed/avatars/0.png';
  download(url, 1024 * 1024).then(() => { cdn.ok = true; cdn.error = ''; }, e => { cdn.ok = false; cdn.error = e.message; });
}

function queueImages(g, m) {
  const pics = (m.attachments || []).filter(a => a && /^image\/(png|jpeg|gif)/.test(a.content_type || '') && (a.size || 0) <= 10 * 1024 * 1024);
  if (!pics.length || imgQueue.length > 10) return;
  imgQueue.push({ g, m, pics: pics.slice(0, 4) });
  pumpImages();
}

/* Нейросеть ошибается на обычных фото с бежевыми и телесными тонами: одетого
   человека в коридоре сочла «порно» на 87%. Поэтому сама бот убирает только
   очень уверенное (95%+), сомнительное (85%+) — показывает модераторам и
   ничего не удаляет. remove | review | null */
function imageVerdict(s) {
  const porn = s.Porn || 0, hentai = s.Hentai || 0;
  if (porn >= 0.95 || hentai >= 0.95 || porn + hentai >= 0.97) return 'remove';
  if (porn >= 0.85 || hentai >= 0.85 || porn + hentai >= 0.92) return 'review';
  return null;
}

async function pumpImages() {
  if (imgBusy) return;
  imgBusy = true;
  try {
    while (imgQueue.length) {
      const job = imgQueue.shift();
      for (const a of job.pics) {
        try {
          // уменьшенная копия с медиа-прокси Discord: нейросети хватает 512 px
          let url = a.proxy_url || a.url;
          const w = a.width || 0, h = a.height || 0, k = Math.min(1, 512 / Math.max(w, h, 1));
          if (a.proxy_url && w && h && k < 1) url += (url.indexOf('?') === -1 ? '?' : '&') + 'width=' + Math.round(w * k) + '&height=' + Math.round(h * k);
          const { buf, type } = await download(url, 12 * 1024 * 1024);
          const ext = IMG_TYPES[type];
          if (!ext) continue;
          const img = require('./imgModeration.js');
          const decoded = img.decodeImage(buf, ext);
          if (!decoded || !decoded.frames) continue;
          const verdict = imageVerdict(await img.nsfwScores(decoded));
          if (verdict === 'remove') { await enforce(job.g, job.m, A.finding('nsfw-image')); break; }
          if (verdict === 'review') {
            await alert(job.g, 'Picture may be 18+', authorText(job.m) + ' in <#' + job.m.channel_id + '>: https://discord.com/channels/' +
              job.g.id + '/' + job.m.channel_id + '/' + job.m.id + '\nThe bot is not sure, so the message was not removed. Please check it.');
            break;
          }
        } catch (e) {
          once('img:' + e.message, 'image check skipped:', e.message);
        }
      }
    }
  } finally { imgBusy = false; }
}

/* ---------- сообщения ---------- */
async function onMessage(m, edited, via) {
  // каждое сообщение отмечается сразу, до любых проверок: живое подключение и второй канал чтения
  // (ниже, «ловец») могут принести одно и то же — разбираем только раз
  if (m && m.id && m.channel_id && m.guild_id && !edited) {
    if (WATCH.seen.has(m.id)) return;
    markSeen(m, via || 'gateway');
  }
  if (!m || !m.guild_id || !m.author || m.author.bot || m.webhook_id) return;
  if (m.type !== undefined && m.type !== 0 && m.type !== 19) return;   // обычное сообщение и ответ
  if (edited && !(m.member && m.member.roles)) return;   // без ролей не отличить модератора
  const g = guilds.get(m.guild_id);
  if (!g) return;
  if (!edited && m.author.id === g.owner && /^!/.test(m.content || '') && await onOwnerCommand(g, m)) return;
  // правила — для всех: и для модераторов, и для владельца (см. punish — что Discord не даёт)
  const ch = channelInfo(g, m.channel_id);
  const allowAds = /promo|advert|реклам|самопиар/i.test(ch.name);

  const found = A.inspect(m, { nsfw: ch.nsfw });
  const custom = A.checkCustom(m.content, gstate(g.id).words);
  if (custom) found.push(custom);
  // «мне 11 лет» — не наказание, а сообщение владельцу: решать ему
  const young = found.findIndex(f => f.kind === 'underage');
  if (young !== -1) {
    found.splice(young, 1);
    if (!edited) alert(g, 'Possibly under 13', authorText(m) + ' wrote in <#' + m.channel_id + '>:\n>>> ' + quote(m.content) +
                       '\n\nDiscord does not allow accounts of people under 13.').catch(() => {});
  }
  if (!edited) {
    // время — из самого сообщения: без живого подключения они приходят пачками
    const fl = flood.add(m.guild_id + ':' + m.author.id, Object.assign({}, m, { t: Date.parse(m.timestamp) || Date.now() }));
    if (fl) found.push(A.finding(fl.kind, { messages: fl.messages }));
  }
  found.sort((a, b) => b.weight - a.weight);
  // находки с mode (политика, чужой IP) — без наказания: сообщение просто убирается
  const sure = found.filter(f => !f.mode);
  if (sure.length) return enforce(g, m, sure[0]);

  if (!allowAds) {
    const codes = A.inviteCodes(m.content);
    if (codes.length) {
      const code = await foreignInvite(g, codes).catch(() => null);
      if (code) return enforce(g, m, A.finding('invite', { detail: 'discord.gg/' + code }));
    }
  }
  if (found.length) {
    const f = found.find(x => x.mode === 'hide') || found[0];
    await gentle(g, m, f, edited);
    return;                                                             // сообщение уже убрано
  }
  if (SCAN_IMAGES && !ch.nsfw && !edited) queueImages(g, m);
}

/* Встроенная AutoMod Discord уже не дала отправить сообщение — бот только
   добавляет наказание по правилу и пишет игроку, за что. */
const seenExec = new Map();
async function onAutomodExecution(d) {
  if (!d || !d.action || d.action.type !== 1) return;     // считаем только блокировку, не алерты
  const g = guilds.get(d.guild_id);
  if (!g || !d.user_id) return;
  const key = d.user_id + ':' + (d.content || '') + ':' + d.rule_id;
  const now = Date.now();
  if (seenExec.has(key) && now - seenExec.get(key) < 5000) return;
  seenExec.set(key, now);
  for (const [k, t] of seenExec) if (now - t > 60000) seenExec.delete(k);

  // спам по догадке Discord, упоминания и его общие списки слов тоже ошибаются:
  // сообщение AutoMod уже не пропустила, а наказание — только за то, что подтвердили сами
  let f;
  if (d.rule_trigger_type === 5 || d.rule_trigger_type === 3) return;
  else if (d.rule_trigger_type === 4) {
    const w = A.checkWords({ content: d.content || d.matched_content || '' });
    if (!(w.length && w[0].kind === 'slur')) return;
    f = A.finding('slur');
  } else f = A.finding('native-word', { detail: d.matched_keyword || undefined });

  const hk = g.id + ':' + d.user_id, last = lastHit.get(hk);
  if (last && now - last.t < COOLDOWN && last.weight >= f.weight) return;
  lastHit.set(hk, { t: now, weight: f.weight });
  // кто это: имя и аватарка для карточки, роли (администратора Discord мьютить не даёт), уже действующий мьют
  const mb = await memberOf(g.id, d.user_id).catch(() => null);
  const user = (mb && mb.user) || { id: d.user_id };
  await punish(g, user, f, { channel: d.channel_id, excerpt: d.content, silent: true, member: mb, roles: mb && mb.roles,
                             name: nameOf(user, mb), until: Date.parse(mb && mb.communication_disabled_until) || 0 });
}

/* ---------- участники: рейды, обход бана ---------- */
const DISCORD_EPOCH = 1420070400000n;

// удалить сообщение и коротко объяснить почему — без наказания (раз в 30 секунд)
async function softRemove(m, text) {
  await api('DELETE', '/channels/' + m.channel_id + '/messages/' + m.id).catch(() => {});
  const key = m.guild_id + ':' + m.author.id, now = Date.now();
  if (now - (softHit.get(key) || 0) < COOLDOWN) return;
  softHit.set(key, now);
  await notice(m.channel_id, nameOf(m.author, m.member), text).catch(() => {});
}

const jump = m => 'https://discord.com/channels/' + m.guild_id + '/' + m.channel_id + '/' + m.id;
const SOFT_TEXT = {
  doxx: 'it looked like an IP address, so it was hidden to protect privacy (rule 7). No punishment.'
};
async function gentle(g, m, f, edited) {
  if (f.mode === 'hide') await softRemove(m, SOFT_TEXT[f.kind] || 'please keep to the rules.');
  if (edited) return;
  const key = g.id + ':' + m.author.id + ':' + f.kind, now = Date.now();
  if (now - (reviewHit.get(key) || 0) < 10 * 60 * 1000) return;       // не заваливать журнал
  reviewHit.set(key, now);
  for (const [k, t] of reviewHit) if (now - t > 10 * 60 * 1000) reviewHit.delete(k);
  await alert(g, f.note + ' (rule ' + f.rule + ')', authorText(m) + ' in <#' + m.channel_id + '>' +
    (f.mode === 'hide' ? ' (message hidden)' : ': ' + jump(m)) + '\n>>> ' + quote(m.content) +
    '\n\nThe bot is not sure, so the author was not punished. If it breaks the rules, use the warn command.').catch(() => {});
}

async function alert(g, title, text) {
  const embed = { color: R.COLORS.warn, title: 'Alert | ' + title, description: text, timestamp: new Date().toISOString() };
  const ch = modlogChannel(g);
  if (ch) await sendMessage(ch, { embeds: [embed], allowed_mentions: { parse: [] } });
  else if (g.owner) await dm(g.owner, { embeds: [embed] });     // журнала нет — владельцу в личку
}

// больше 100 входов за минуту — рейд: следующие 10 минут каждый, кто заходит, получает мьют на час
async function trackJoin(g, d) {
  const now = Date.now();
  const list = (joins.get(g.id) || []).filter(t => now - t < 60000);
  list.push(now);
  joins.set(g.id, list);
  if (list.length > RAID_JOINS && !((raidUntil.get(g.id) || 0) > now)) {
    raidUntil.set(g.id, now + RAID_MS);
    alert(g, 'Raid', list.length + ' members joined within a minute. For the next 10 minutes everyone who joins ' +
                     'is muted for an hour.').catch(() => {});
  }
  if ((raidUntil.get(g.id) || 0) > now) await timeout(g, d.user.id, R.HOUR, 'Raid protection');
}

// имя забаненного: зайдёт с другого аккаунта под тем же именем — скажем модераторам
function rememberBan(gid, user) {
  if (!user || !user.username) return;
  const list = (state.banned[gid] || []).filter(b => b.id !== user.id);
  list.push({ id: user.id, n: String(user.global_name || user.username || '').toLowerCase(), t: Date.now() });
  state.banned[gid] = list.slice(-500);
  save();
}

async function checkEvasion(g, d) {
  const list = state.banned[g.id] || [];
  const u = d.user, name = String(u.global_name || u.username || '').toLowerCase();
  const alike = name.length >= 4 && list.find(b => b.n === name && b.id !== u.id);
  if (alike) alert(g, 'Possible second account', plainName(nameOf(u, d)) + ' (' + u.id + ') has the same name as banned member ' + plainName(alike.n) + ' (' + alike.id + ').').catch(() => {});
}

async function onMemberAdd(d) {
  const g = guilds.get(d.guild_id);
  if (!g || !d.user || d.user.bot) return;
  await trackJoin(g, d);
  await checkEvasion(g, d);
}

/* ---------- встроенная AutoMod Discord ----------
   Создаём свои правила один раз. Если администратор потом удалит какое-то
   из них — не возвращаем: значит, оно серверу не нужно. */
const BLOCK = { type: 1, metadata: { custom_message: 'This message breaks the server rules. Please read #rules.' } };
const NATIVE = [
  { key: 'words', trigger: 4, body: { name: 'AIBROFIST: slurs and sexual content', event_type: 1, trigger_type: 4,
    trigger_metadata: { presets: [2, 3] }, actions: [BLOCK], enabled: true } }
];
// правила прежних версий бота (спам упоминаниями, «подозрение на спам»): таких правил на сервере больше нет — убираем
const OLD_NATIVE = ['mentions', 'spam'];

async function ensureNativeAutomod(g) {
  const st = gstate(g.id);
  const stale = OLD_NATIVE.filter(k => /^\d+$/.test(String(st.automod[k] || '')));
  if (NATIVE.every(n => st.automod[n.key]) && !stale.length) return;
  const list = await api('GET', '/guilds/' + g.id + '/auto-moderation/rules');
  if (list.status === 403) {
    once('noautomod:' + g.id, 'Discord AutoMod not set up in ' + g.name + ': give the bot Manage Server (optional, the bot still moderates on its own)');
    return;
  }
  if (!ok(list) || !Array.isArray(list.body)) return;
  for (const k of stale) {
    // только свои правила (имя начинается с «AIBROFIST:»): чужое администратор сервера мог сделать сам
    const mine = list.body.find(r => r.id === st.automod[k] && /^AIBROFIST:/.test(r.name || ''));
    if (mine) {
      const r = await api('DELETE', '/guilds/' + g.id + '/auto-moderation/rules/' + mine.id, null, { reason: 'Not part of the server rules any more' });
      if (!ok(r) && r.status !== 404) { log('AutoMod rule "' + k + '" not removed:', r.status); continue; }
    }
    st.automod[k] = 'removed';
  }
  for (const n of NATIVE) {
    if (st.automod[n.key]) continue;
    // таких правил у сервера может быть только по одному — есть своё, не трогаем
    if (list.body.some(r => r.trigger_type === n.trigger)) { st.automod[n.key] = 'existing'; continue; }
    const r = await api('POST', '/guilds/' + g.id + '/auto-moderation/rules', n.body, { reason: 'AIBROFIST automod setup' });
    if (ok(r) && r.body) st.automod[n.key] = r.body.id;
    else log('AutoMod rule "' + n.key + '" not created:', r.status, JSON.stringify(r.body).slice(0, 160));
  }
  save();
}


/* ---------- ответы-сообщения ----------
   Ответы бота — настоящие сообщения Discord (discordViews.js): рамка с
   цветной полоской, текст, аватарка участника справа и серые кнопки. Под
   ответом кнопки с флагами: English и Русский — нажатие меняет язык в том
   же сообщении (видят все, кто видит сообщение); живые карточки (справка,
   статистика, предупреждения) при этом снова берут свежие данные.
   Что показано, бот помнит (state.cards) — кнопки работают и после
   перезапуска. Discord не принял сообщение — бот отвечает прежним текстом. */
const V = require('./discordViews.js');
const CARD_KEEP = 400;
const CARD_AGE = 60 * R.DAY;
const FLASH_MS = 15 * 1000;          // итог команды в канале (журнал включён, канал почищен) гаснет сам
const LIVE = new Set(['help', 'stats', 'warns', 'warnsAll']);
const OWNER_ONLY = new Set(['help', 'stats', 'warns', 'warnsAll']);

function keepCard(kind, data, gid) {
  const id = crypto.randomBytes(6).toString('hex'), now = Date.now();
  state.cards[id] = { k: kind, d: data, g: gid || null, at: now };
  for (const k of Object.keys(state.cards)) if (now - (state.cards[k].at || 0) > CARD_AGE) delete state.cards[k];
  const left = Object.keys(state.cards);
  if (left.length > CARD_KEEP) left.sort((a, b) => state.cards[a].at - state.cards[b].at).slice(0, left.length - CARD_KEEP).forEach(k => delete state.cards[k]);
  save();
  return id;
}

/* Аватарка участника — настоящая, с CDN Discord: Discord сам показывает её
   справа в сообщении. Своей нет — стандартная, какую он показывает всем. */
const cdnBase = () => TEST_CDN && !relayOn() ? 'http://' + TEST_CDN : 'https://cdn.discordapp.com';
function avatarUrl(gid, user, member) {
  if (!user || !user.id) return null;
  if (member && member.avatar && gid) return cdnBase() + '/guilds/' + gid + '/users/' + user.id + '/avatars/' + member.avatar + '.png?size=128';
  if (user.avatar) return cdnBase() + '/avatars/' + user.id + '/' + user.avatar + '.png?size=128';
  // своей аватарки нет — стандартная: у новых имён по id, у старых по номеру после «#»
  if (!/^\d+$/.test(String(user.id))) return null;
  const n = user.discriminator && user.discriminator !== '0' ? Number(user.discriminator) % 5 : Number((BigInt(user.id) >> 22n) % 6n);
  return cdnBase() + '/embed/avatars/' + n + '.png';
}

function liveData(rec) {
  const g = rec.g && guilds.get(rec.g);
  if (rec.k === 'help') return helpData(g);
  if (rec.k === 'stats') return statsData();
  if (rec.k === 'warns') return g ? warnsData(g, rec.d) : rec.d;
  if (rec.k === 'warnsAll') return g ? warnsAllData(g) : rec.d;
  return rec.d;
}

// один ряд под текстом: ссылки (если есть) и флаги языка
function cardRows(rec, id, lang) {
  const links = [];
  if (rec.k === 'stats') links.push(V.linkButton(V.say(lang, 'openStats'), require('./serversInfo.js').link()));
  const link = rec.d && rec.d.link;
  if (link && link.url) links.push(V.linkButton(String((lang === 'ru' ? link.ru : link.en) || link.en || 'Open'), link.url));
  return [V.row(...links, ...V.langButtons(l => 'cd:' + id + ':' + l, lang, 'cd-lang'))];
}

// готовое сообщение с карточкой: для нового сообщения, ответа на нажатие или правки
function cardMessage(rec, id, lang, ephemeral) {
  const data = LIVE.has(rec.k) ? liveData(rec) : rec.d;
  return V.message(V.view(rec.k, data, lang), cardRows(rec, id, lang), { ephemeral });
}

// новая карточка в канал или в личку (dm: закрытая личка — обычное дело, в журнал не пишем);
// не собралась или Discord её не взял — запасной текст
async function postCard(channel, kind, data, gid, fallback, dm) {
  const rec = { k: kind, d: data, g: gid || null };
  const id = keepCard(kind, data, gid);
  let msg = null;
  try { msg = cardMessage(rec, id, 'en'); }
  catch (e) { once('card:' + e.message, 'could not build the ' + kind + ' card, sending text instead:', e.message); }
  if (msg) {
    const r = await api('POST', '/channels/' + channel + '/messages', msg);
    if (ok(r)) return r;
    if (r.status === 403) {
      if (!dm) once('nowrite:' + channel, 'cannot write to channel ' + channel + ': allow View Channel and Send Messages for the bot there');
      return r;
    }
    log('Discord did not take the ' + kind + ' card:', r.status, JSON.stringify(r.body).slice(0, 200));
  }
  return fallback ? api('POST', '/channels/' + channel + '/messages', noPing(fallback)) : { status: 0, body: null };
}

// итог команды в канале, который сам гаснет (журнал включён, канал почищен)
async function flashCard(channel, g, data, text) {
  const r = await postCard(channel, 'info', Object.assign({ at: Date.now() }, data), g.id, { content: text, allowed_mentions: { parse: [] } });
  if (ok(r) && r.body && r.body.id) {
    const t = setTimeout(() => api('DELETE', '/channels/' + channel + '/messages/' + r.body.id).catch(() => {}), FLASH_MS);
    if (t.unref) t.unref();
  }
  return r;
}

/* Ответ на нажатие кнопки в том же сообщении. Сообщение прежней версии бота
   (картинка с кнопками) в новое не превратить — тогда новое сообщение, видное
   только нажавшему. */
async function updateMessage(i, msg) {
  const legacy = i.message && !((i.message.flags || 0) & COMPONENTS_V2);
  if (!legacy) {
    const r = await respond(i, { type: 7, data: msg });
    if (!r || r.status !== 400) return r;
    log('Discord did not take the message update:', JSON.stringify(r.body).slice(0, 200));
  }
  return respond(i, { type: 4, data: Object.assign({}, msg, { flags: msg.flags | 64 }) });
}
// запасной ответ текстом (виден только нажавшему)
const textAnswer = (i, data) => respond(i, { type: 4, data: Object.assign({ flags: 64, allowed_mentions: { parse: [] } }, data) });

/* Язык человека — по языку его Discord (locale есть в каждой команде и каждом нажатии): ru, de, pt-BR... ->
   свой перевод из discordLang.js, чего там нет — английский. В публичных карточках канала и в личке язык
   получателя Discord не сообщает — там английский, а глобус под текстом («Мой язык») показывает карточку на языке нажавшего. */
const userLang = i => V.fromLocale(i && i.locale);
/* Кнопка языка: code — en, ru, другой язык или «me» (глобус: язык самого нажавшего). make(язык) собирает сообщение.
   Сообщение общее (в канале) и нажат глобус — человек получает личную копию, видную только ему, остальным ничего
   не меняется; в личке, в личной копии и при выборе English/Русский — то же сообщение правится на месте. */
function langAnswer(i, code, make) {
  const me = code === 'me', lang = me ? userLang(i) : V.langOf(code);
  let msg;
  try { msg = make(lang); }
  catch (e) { once('lang:' + e.message, 'could not build the message in', lang + ':', e.message); return textAnswer(i, { content: 'Could not change the language right now. Please try again.' }); }
  const shared = i.guild_id && !(i.message && (i.message.flags & 64));
  if (me && shared) return respond(i, { type: 4, data: Object.assign({}, msg, { flags: msg.flags | 64 }) });
  return updateMessage(i, msg);
}

/* Ответ на команду или кнопку панели: новое сообщение, видное только владельцу.
   fallback — текст на случай, если сообщение не соберётся или Discord его не возьмёт. */
async function showCard(i, g, kind, data, fallback) {
  const rec = { k: kind, d: data, g: g ? g.id : null };
  const id = keepCard(kind, data, rec.g);
  let msg = null;
  try { msg = cardMessage(rec, id, userLang(i), true); }
  catch (e) { once('card:' + e.message, 'could not build the ' + kind + ' card, sending text instead:', e.message); }
  const r = msg ? await respond(i, { type: 4, data: msg }) : null;
  if (r && ok(r)) return r;
  if (r) log('Discord did not take the ' + kind + ' card:', r.status, JSON.stringify(r.body).slice(0, 200));
  return textAnswer(i, fallback || card('Could not show this right now. Please try again.'));
}

// кнопка языка (флаг или глобус): та же карточка на выбранном языке
function onCardLang(i, cid) {
  const m = /^cd:([0-9a-f]+):(me|[a-z]{2})(?::(?:dark|light))?$/.exec(cid);       // «:тема» — кнопки сообщений прежней версии
  if (!m || pressedTooFast(i)) return respond(i, { type: 6 });
  const rec = state.cards[m[1]];
  if (!rec) return reply(i, { content: (m[2] === 'me' ? userLang(i) : m[2]) === 'ru' ? 'Эта карточка слишком старая: вызовите команду снова.' : 'This card is too old: use the command again.' });
  // справка, статистика и предупреждения — только владельцу (их и видит только он)
  const g = rec.g && guilds.get(rec.g);
  if (OWNER_ONLY.has(rec.k) && !(g && userOf(i) === g.owner)) return reply(i, card('Only the server owner can use this.'));
  return langAnswer(i, m[2], lang => cardMessage(rec, m[1], lang, false));
}

/* ---------- предупреждения ----------
   Каждое предупреждение (от бота или владельца) запоминается: за какое
   правило, почему, кто выдал. Действует R.WARNS.window (30 дней); третье
   действующее даёт R.WARNS.act (мьют на час), и эти три больше не
   считаются — счёт начинается заново. Команда unwarn снимает все. */
const WARN_KEEP = 50;
const wkey = (gid, uid) => gid + ':' + uid;
const warnState = (w, now) => w.used ? 'used' : now - (w.at || 0) >= R.WARNS.window ? 'expired' : 'active';
const warnsOf = (gid, uid) => state.warns[wkey(gid, uid)] || [];
function countActive(gid) {
  let n = 0;
  const now = Date.now();
  for (const [k, list] of Object.entries(state.warns)) if (k.indexOf(gid + ':') === 0) n += list.filter(w => warnState(w, now) === 'active').length;
  return n;
}
function addWarn(gid, uid, w) {
  const list = warnsOf(gid, uid).concat([w]).slice(-WARN_KEEP);
  state.warns[wkey(gid, uid)] = list;
  const now = Date.now(), active = list.filter(x => warnState(x, now) === 'active');
  const escalate = active.length >= R.WARNS.limit;
  if (escalate) active.forEach(x => { x.used = true; });
  save();
  return { n: escalate ? R.WARNS.limit : active.length, limit: R.WARNS.limit, escalate };
}
// снять все предупреждения участника (uid) или всех на сервере (uid не задан); сколько снято
function clearWarns(gid, uid) {
  let n = 0;
  for (const k of Object.keys(state.warns)) {
    if (uid ? k !== wkey(gid, uid) : k.indexOf(gid + ':') !== 0) continue;
    n += state.warns[k].length;
    delete state.warns[k];
  }
  // и счёт спама («1 из 5») тоже с нуля
  for (const k of [...spamHits.keys()]) if (uid ? k === wkey(gid, uid) : k.indexOf(gid + ':') === 0) spamHits.delete(k);
  save();
  return n;
}
function warnsData(g, who) {
  const now = Date.now(), list = warnsOf(g.id, who.uid).slice().reverse();
  // ушёл с сервера (нашли по id) — имя из его последнего предупреждения
  const name = who.name && who.name !== who.uid ? who.name : (list[0] && list[0].name) || who.name;
  return { uid: who.uid, name, user: who.user, avatarUrl: who.avatarUrl, limit: R.WARNS.limit, at: now,
           active: list.filter(w => warnState(w, now) === 'active').length, total: list.length, last: list.length ? list[0].at : 0,
           list: list.map(w => ({ at: w.at, rule: w.rule, kind: w.kind, reason: w.reason, by: w.by, status: warnState(w, now) })) };
}
function warnsAllData(g) {
  const now = Date.now(), out = [];
  let active = 0, total = 0;
  for (const [k, list] of Object.entries(state.warns)) {
    if (k.indexOf(g.id + ':') !== 0 || !list.length) continue;
    const a = list.filter(w => warnState(w, now) === 'active').length, last = list[list.length - 1];
    active += a; total += list.length;
    out.push({ uid: k.slice(g.id.length + 1), name: last.name || k.slice(g.id.length + 1), avatarUrl: last.av || null, active: a, total: list.length, last: last.at });
  }
  out.sort((x, y) => y.active - x.active || y.last - x.last);
  return { members: out.length, active, total, limit: R.WARNS.limit, list: out.slice(0, 10), at: now };
}
function helpData(g) {
  const b = statusBrief();
  return { prefix: PREFIX, online: b.mode === 'live' || b.mode === 'requests', mode: b.mode, checked: WATCH.checked,
           activeWarns: g ? countActive(g.id) : 0, cases: state.cases, at: Date.now() };
}
function statsData() {
  let s = {};
  try { s = require('./serversInfo.js').details(); } catch (e) { s = {}; }
  const a = s.aibrofist || {}, sv = s.server || {}, ex = s.extra || {}, b = statusBrief();
  return { online: a.online || 0, rooms: a.rooms || 0, modes: a.modes || {}, peak: (sv.peak && sv.peak.n) || 0, peakAt: sv.peak && sv.peak.at,
           accounts: ex.accounts || 0, maps: ex.maps || 0, uptime: sv.uptimeSec || 0, memory: (sv.memoryMb && sv.memoryMb.rss) || 0,
           sockets: sv.sockets || 0, botOnline: b.mode === 'live' || b.mode === 'requests', botMode: b.mode, checked: WATCH.checked, at: Date.now() };
}

/* ---------- секретные команды владельца ----------
   Команды пишутся прямо в канале и начинаются с «!». Срабатывают только
   у владельца сервера, сообщение с командой бот сразу удаляет, у всех
   остальных они просто ничего не делают — снаружи их не видно и не
   найти в списке команд Discord.
   Окна (редактор поста, выбор каналов) Discord показывает только по
   нажатию кнопки, поэтому на месте команды появляется маленькая панель
   с одной кнопкой. Открыть её может только владелец, а исчезает она,
   как только её нажали (или через минуту). Само окно и ответы бота
   видит только владелец. В закрытом канале не видно даже панели. */
const PANEL_MS = 60 * 1000;
const CONFIRM_MS = 5 * 1000;
const COMMANDS = ['news', 'updates', 'rules', 'warn', 'warns', 'unwarn', 'mute', 'unmute', 'ban', 'unban', 'modlog', 'clear', 'purge', 'stats', 'help'];
/* Начало команд задаётся на хостинге (DISCORD_CMD_PREFIX, например «!ab3»
   -> «!ab3news»). В открытом коде его нет — по исходникам не узнать, что
   набирать. Без настройки команды начинаются просто с «!». */
const PREFIX = (() => {
  const p = String(process.env.DISCORD_CMD_PREFIX || '').trim().toLowerCase().replace(/\s+/g, '');
  return p.charAt(0) === '!' ? p : '!' + p;
})();
const panels = new Map();          // id -> { kind, guild, channel, message, data }
const BANS = { '1d': R.DAY, '3d': 3 * R.DAY, '7d': 7 * R.DAY, '30d': 30 * R.DAY, 'forever': 0, 'perm': 0 };
const DURATIONS = { '10m': ['10 minutes', 10 * R.MIN], '1h': ['1 hour', R.HOUR], '6h': ['6 hours', 6 * R.HOUR],
                    '1d': ['1 day', R.DAY], '3d': ['3 days', 3 * R.DAY], '7d': ['7 days', 7 * R.DAY] };

const HELP = [
  '**' + PREFIX + 'news** - write a post: channel, title, text, up to 4 images and a link button',
  '**' + PREFIX + 'updates** - choose the channels for automatic game updates',
  '**' + PREFIX + 'rules** - post the server rules (English and Russian) and set extra banned words',
  '**' + PREFIX + 'warn** - open the warning form: the member, the rule and the reason are all required (' + PREFIX + 'warn name fills in the member)',
  '**' + PREFIX + 'warns name** - warnings of a member, **' + PREFIX + 'warns** - everyone who has them. Warnings add up: the 3rd within 30 days gives a 1-hour mute',
  '**' + PREFIX + 'unwarn name** - remove all warnings of a member, **' + PREFIX + 'unwarn all** - of everyone (asks first)',
  '**' + PREFIX + 'mute name 1h reason** - mute for 10m, 1h, 6h, 1d, 3d or 7d',
  '**' + PREFIX + 'unmute name** - lift a mute',
  '**' + PREFIX + 'ban name 7d reason** - ban for 1d, 3d, 7d or 30d, without a duration - forever',
  '**' + PREFIX + 'unban name** - lift a ban',
  '**' + PREFIX + 'modlog** - send moderation logs to this channel, **' + PREFIX + 'modlog off** to stop',
  '**' + PREFIX + 'clear 50** - delete the last 50 messages in this channel, **' + PREFIX + 'clear all** - all of them ' +
    '(asks first), add a name to delete only theirs, **' + PREFIX + 'clear stop** to stop. Pinned messages and the rules post stay',
  '**' + PREFIX + 'stats** - your secret link to live server stats, **' + PREFIX + 'stats new** - make a new link (the old one stops working)',
  '',
  '**name** is a server nickname, display name or username, written without @ - the bot never pings anyone, and neither do you: ' +
    'an @mention in your command pings the person before the bot can delete the message. A user ID works too (a mention as well, but it pings). ' +
    'A name with spaces goes in quotes: ' + PREFIX + 'mute "Big Bob" 1h.',
  '',
  'For everyone: **/servers** - game rooms and players online right now, **/account nick** - a player profile.',
  'Only you can use these commands. The message with a command is removed at once.'
].join('\n');

/* Ответ на нажатие. Пришло оно по HTTP (см. /discord/interactions) — первый
   ответ уходит прямо в тот же запрос, иначе — отдельным запросом к Discord. */
function respond(i, payload) {
  if (i._http && !i._http.headersSent) { i._http.json(payload); return Promise.resolve({ status: 204, body: null }); }
  return api('POST', '/interactions/' + i.id + '/' + i.token + '/callback', payload);
}
const reply = (i, data) => respond(i, { type: 4, data: Object.assign({ flags: 64, allowed_mentions: { parse: [] } }, data) });
const defer = i => respond(i, { type: 5, data: { flags: 64 } });
const finish = (i, data) => api('PATCH', '/webhooks/' + appId + '/' + i.token + '/messages/@original', Object.assign({ allowed_mentions: { parse: [] } }, data));
const card = (text, c) => ({ embeds: [{ color: c || R.COLORS.neutral, description: text }] });
const textChannels = g => [...g.channels.values()].filter(c => c.type === 0 || c.type === 5);
const channelByName = (g, name) => {
  name = String(name || '').trim().replace(/^#/, '').toLowerCase();
  return textChannels(g).find(c => c.name.toLowerCase() === name || c.id === name) || null;
};

// «#канал» и «@Роль» в тексте поста -> настоящая ссылка и упоминание
function linkify(g, text) {
  return String(text || '')
    .replace(/(^|[^<\w])#([\w-]{1,100})/g, (all, pre, name) => {
      const c = channelByName(g, name);
      return c ? pre + '<#' + c.id + '>' : all;
    })
    .replace(/(^|[^<\w])@([\w-]{1,100})/g, (all, pre, name) => {
      if (/^(everyone|here)$/i.test(name)) return all;
      const r = [...g.roles.entries()].find(([id, r]) => id !== g.id && r.name.toLowerCase() === name.toLowerCase());
      return r ? pre + '<@&' + r[0] + '>' : all;
    });
}


async function confirm(channel, text) {
  const r = await sendMessage(channel, { content: text, allowed_mentions: { parse: [] } });
  if (ok(r) && r.body) {
    const t = setTimeout(() => api('DELETE', '/channels/' + channel + '/messages/' + r.body.id).catch(() => {}), CONFIRM_MS);
    if (t.unref) t.unref();
  }
}

async function openPanel(g, m, kind, data) {
  const id = crypto.randomBytes(9).toString('hex');
  const label = { news: 'Open the post editor', updates: 'Choose update channels', help: 'Show commands', warn: 'Open the warning form',
                  warns: 'Show warnings' + (data && data.name ? ' of ' + String(data.name).slice(0, 30) : ''),
                  unwarnAll: 'Remove all warnings on the server',
                  rules: 'Open the rules editor',
                  clear: 'Delete all messages' + (data && data.userName ? ' of ' + String(data.userName).slice(0, 30) : '') + ' here',
                  stats: 'Show the stats link' }[kind];
  const r = await sendMessage(m.channel_id, { allowed_mentions: { parse: [] },
    components: [{ type: 1, components: [{ type: 2, style: kind === 'clear' || kind === 'unwarnAll' ? 4 : 2, label, custom_id: 'panel:' + id }] }] });
  if (!ok(r) || !r.body) return;
  panels.set(id, { kind, guild: g.id, channel: m.channel_id, message: r.body.id, data: data || {} });
  const t = setTimeout(() => closePanel(id), PANEL_MS);
  if (t.unref) t.unref();
}

function closePanel(id) {
  const p = panels.get(id);
  if (!p) return;
  panels.delete(id);
  api('DELETE', '/channels/' + p.channel + '/messages/' + p.message).catch(() => {});
}

// «!команда ...» от владельца; true — команда узнана и выполнена
async function onOwnerCommand(g, m) {
  const text = String(m.content || '').trim();
  if (text.toLowerCase().indexOf(PREFIX) !== 0) return false;
  const mm = /^\s*([a-z]+)(?:\s+([\s\S]*))?$/i.exec(text.slice(PREFIX.length));
  if (!mm || COMMANDS.indexOf(mm[1].toLowerCase()) === -1) return false;
  const cmd = mm[1].toLowerCase(), args = (mm[2] || '').trim();
  lastCommandAt = Date.now();
  api('DELETE', '/channels/' + m.channel_id + '/messages/' + m.id).catch(() => {});

  if (cmd === 'news' || cmd === 'updates' || cmd === 'help' || cmd === 'rules') { await openPanel(g, m, cmd); return true; }
  if (cmd === 'warn') {
    // «!warn» — кнопка с формой; «!warn имя» сразу вписывает игрока в форму, если он найден
    let data = {};
    const tg0 = targetOf(args);
    if (tg0) { const f0 = await findMember(g, tg0.ref, m, tg0.id); if (!f0.error) data = { user: f0.id, userName: nameOf(f0.user, f0.member) }; }
    await openPanel(g, m, 'warn', data);
    return true;
  }
  if (cmd === 'clear' || cmd === 'purge') return clearCommand(g, m, args);
  if (cmd === 'stats') {
    if (/^new$/i.test(args)) require('./serversInfo.js').rotate();   // старая ссылка сразу перестаёт работать
    await openPanel(g, m, 'stats');
    return true;
  }
  if (cmd === 'modlog') {
    const off = /^off$/i.test(args);
    gstate(g.id).modlog = off ? '' : m.channel_id;
    save();
    await flashCard(m.channel_id, g, off
      ? { tag: { en: 'Moderation log', ru: 'Журнал модерации' }, color: 'warn',
          title: { en: 'Moderation logs are off', ru: 'Журнал модерации выключен' },
          lines: [{ en: 'Type the command in a channel again to send the logs there.', ru: 'Чтобы включить, наберите команду в нужном канале.' }] }
      : { tag: { en: 'Moderation log', ru: 'Журнал модерации' }, color: 'ok',
          title: { en: 'Moderation logs will be posted here', ru: 'Журнал модерации теперь в этом канале' },
          lines: [{ en: 'Every case: who, which rule, why and what the bot did.', ru: 'Каждый случай: кто, какое правило, почему и что сделал бот.' }] },
      off ? 'Moderation logs are off.' : 'Moderation logs will be posted here.');
    return true;
  }
  if (cmd === 'warns') {
    // «!warns» — у кого есть предупреждения, «!warns имя» — все предупреждения участника (видит только владелец, по кнопке)
    let data = {};
    const tw = targetOf(args);
    if (tw) {
      const fw = await findMember(g, tw.ref, m, tw.id);
      if (fw.error) { await confirm(m.channel_id, whoText(fw, 'on the server')); return true; }
      data = { uid: fw.id, name: nameOf(fw.user, fw.member), user: fw.user.username || '', avatarUrl: avatarUrl(g.id, fw.user, fw.member) };
    }
    await openPanel(g, m, 'warns', data);
    return true;
  }
  if (cmd === 'unwarn' && /^(all|все|всё)$/i.test(args)) { await openPanel(g, m, 'unwarnAll'); return true; }

  // дальше — команды над игроком: имя, id или упоминание
  const tg = targetOf(args);
  if (!tg) { await confirm(m.channel_id, 'Who? ' + PREFIX + cmd + ' name (a name, a user ID or a mention).'); return true; }
  const byName = nameOf(m.author, m.member);
  if (cmd === 'unban') {
    const b = await findBanned(g, tg.ref, tg.id);
    if (b.error) { await confirm(m.channel_id, whoText(b, 'among the banned')); return true; }
    const uid = b.id, who = b.name;
    const r = await api('DELETE', '/guilds/' + g.id + '/bans/' + uid, null, { reason: 'Unbanned by the owner' });
    if (ok(r) || r.status === 404) forgetBan(g.id, uid);
    if (!ok(r)) { await confirm(m.channel_id, r.status === 404 ? '**' + plainName(who) + '** is not banned.' : 'I could not unban them.'); return true; }
    const caseNo = ++state.cases;
    await modlog(g, { caseNo, title: 'Ban lifted', color: R.COLORS.ok, user: uid, userName: who, by: m.author.id, byName });
    await postCard(m.channel_id, 'action', { type: 'unban', name: who, user: (b.user && b.user.username) || '', avatarUrl: avatarUrl(g.id, b.user),
                                             by: byName, caseNo, at: Date.now() }, g.id, { content: '**' + plainName(who) + '** is unbanned.' });
    return true;
  }
  const found = await findMember(g, tg.ref, m, tg.id);
  if (found.error) { await confirm(m.channel_id, whoText(found, 'on the server')); return true; }
  const uid = found.id, target = found.user, rest = tg.rest, who = nameOf(found.user, found.member), shown = plainName(who);
  // себя (владельца Discord наказать не даёт) и ботов — незачем; администраторов — можно, кроме мьюта
  const roles = found.member && found.member.roles;
  // карточка итога в канале: кто, что, по чьей команде
  const base = { name: who, user: target.username || '', avatarUrl: avatarUrl(g.id, target, found.member), by: byName, at: Date.now() };
  if (cmd === 'unwarn') {
    const n = clearWarns(g.id, uid);
    if (!n) { await confirm(m.channel_id, '**' + shown + '** has no warnings.'); return true; }
    const caseNo = ++state.cases;
    save();
    await modlog(g, { caseNo, title: 'Warnings removed (' + n + ')', color: R.COLORS.ok, user: uid, userName: who, by: m.author.id, byName });
    await postCard(m.channel_id, 'action', Object.assign({ type: 'unwarn', count: n, caseNo }, base), g.id,
                   { content: 'All warnings of **' + shown + '** are removed (' + n + ').' });
    return true;
  }
  if (uid === g.owner || (me && uid === me.id) || target.bot) {
    await confirm(m.channel_id, 'The server owner and bots cannot be punished.');
    return true;
  }
  const admin = !!(memberPerms(g, uid, roles) & PERM.ADMIN);
  const until = Date.parse(found.member && found.member.communication_disabled_until) || 0;

  if (cmd === 'mute') {
    const dm2 = /^(\S+)\s*([\s\S]*)$/.exec(rest) || [];
    const d = DURATIONS[String(dm2[1] || '').toLowerCase()];
    if (!d) { await confirm(m.channel_id, 'Choose a duration: 10m, 1h, 6h, 1d, 3d or 7d.'); return true; }
    if (admin) { await confirm(m.channel_id, 'Discord does not allow muting administrators: use warn or ban.'); return true; }
    const reason = (dm2[2] || '').trim().slice(0, 300) || 'Muted by the owner';
    const caseNo = ++state.cases;
    save();
    const done = until > Date.now() + d[1] ? true : await timeout(g, uid, d[1], 'Case ' + caseNo + ': ' + reason);
    if (!done) { await confirm(m.channel_id, 'I could not mute them: my role must be above theirs and have Timeout Members.'); return true; }
    const mc = Object.assign({ type: 'mute', ms: d[1], reason, rule: null, caseNo }, base);
    await dmCard(uid, 'action', mc, g.id, { embeds: [{ color: R.COLORS.mute, title: 'You have been muted',
      description: 'You were muted in **' + g.name + '** for ' + d[0] + '.',
      fields: [{ name: 'Reason', value: reason }],
      footer: { text: 'If you think this is a mistake, message the owner.' } }] }).catch(() => {});
    await modlog(g, { caseNo, title: 'Mute for ' + d[0], color: R.COLORS.mute, user: uid, userName: who, by: m.author.id, byName, reason });
    await postCard(m.channel_id, 'action', mc, g.id, { content: '**' + shown + '** is muted for ' + d[0] + '.' });
    return true;
  }
  if (cmd === 'ban') {
    const bm = /^(\S+)\s*([\s\S]*)$/.exec(rest) || [];
    const key = String(bm[1] || '').toLowerCase();
    const ms = key in BANS ? BANS[key] : 0;                        // без срока — навсегда
    const reason = ((key in BANS ? bm[2] : rest) || '').trim().slice(0, 300) || 'Banned by the owner';
    const what = ms ? 'Ban for ' + R.duration(ms) : 'Permanent ban';
    const caseNo = ++state.cases;
    save();
    const bc = Object.assign({ type: 'ban', ms, reason, rule: null, caseNo }, base);
    // личное сообщение — до бана, иначе оно уже не дойдёт
    await dmCard(uid, 'action', bc, g.id, { embeds: [{ color: R.COLORS.ban, title: ms ? 'You have been banned for ' + R.duration(ms) : 'You have been banned permanently',
      description: 'You were banned from **' + g.name + '**.', fields: [{ name: 'Reason', value: reason }],
      footer: { text: ms ? 'The ban is lifted automatically when it ends.' : 'If you think this is a mistake, message the owner.' } }] }).catch(() => {});
    const done = await ban(g, uid, 'Case ' + caseNo + ': ' + reason);
    if (!done) { await confirm(m.channel_id, 'I could not ban them: my role must be above theirs and have Ban Members.'); return true; }
    setUnban(g.id, uid, ms);
    await modlog(g, { caseNo, title: what, color: R.COLORS.ban, user: uid, userName: who, by: m.author.id, byName, reason });
    await postCard(m.channel_id, 'action', bc, g.id, { content: '**' + shown + '** is banned ' + (ms ? 'for ' + R.duration(ms) : 'permanently') + '.' });
    return true;
  }
  if (cmd === 'unmute') {
    const done = await timeout(g, uid, 0, 'Unmuted by the owner');
    if (!done) { await confirm(m.channel_id, 'I could not unmute them.'); return true; }
    const caseNo = ++state.cases;
    save();
    await modlog(g, { caseNo, title: 'Mute lifted', color: R.COLORS.ok, user: uid, userName: who, by: m.author.id, byName });
    await postCard(m.channel_id, 'action', Object.assign({ type: 'unmute', caseNo }, base), g.id, { content: '**' + shown + '** can talk again.' });
    return true;
  }
  return true;
}

/* Кого касается команда: имя (ник на сервере, имя или логин — без «@»), id или упоминание. Лучше имя или id:
   упоминание в тексте команды пингует человека сразу при отправке — раньше, чем бот успеет удалить сообщение.
   Имя с пробелами пишут в кавычках. */
const targetOf = text => {
  const mm = /^\s*(?:"([^"]+)"|“([^”]+)”|<@!?(\w+)>|(\S+))\s*([\s\S]*)$/.exec(String(text || ''));
  return mm ? { ref: mm[1] || mm[2] || mm[3] || mm[4], rest: mm[5].trim(), id: !!mm[3] } : null;
};
const memberNames = mb => [mb.nick, mb.user && mb.user.global_name, mb.user && mb.user.username].filter(Boolean).map(x => String(x).toLowerCase());

// участник сервера по имени, id или упоминанию: { id, user, member } либо { error: 'none' | 'several', ref, names }
async function findMember(g, ref, m, isId) {
  ref = String(ref || '').trim().replace(/^@/, '');
  if (!ref) return { error: 'none', ref };
  if (isId || /^\d{5,}$/.test(ref)) {
    const ment = (m.mentions || []).find(u => u && u.id === ref);
    if (ment) return { id: ref, user: ment, member: ment.member || null };           // данные пришли вместе с упоминанием
    const r = await api('GET', '/guilds/' + g.id + '/members/' + ref);
    const mb = ok(r) && r.body && r.body.user ? r.body : null;
    return { id: ref, user: mb ? mb.user : { id: ref }, member: mb };                // ушёл с сервера — всё равно можно по id
  }
  const r = await api('GET', '/guilds/' + g.id + '/members/search?query=' + encodeURIComponent(ref.slice(0, 32)) + '&limit=10');
  const list = ok(r) && Array.isArray(r.body) ? r.body.filter(x => x && x.user) : [];
  const exact = list.filter(mb => memberNames(mb).indexOf(ref.toLowerCase()) !== -1);
  const pick = exact.length ? exact : list;
  if (pick.length === 1) return { id: pick[0].user.id, user: pick[0].user, member: pick[0] };
  return { error: pick.length ? 'several' : 'none', ref, names: pick.slice(0, 5).map(mb => nameOf(mb.user, mb)) };
}

// забаненный по имени или id: { id, name } либо { error }
async function findBanned(g, ref, isId) {
  ref = String(ref || '').trim().replace(/^@/, '');
  if (isId || /^\d{5,}$/.test(ref)) return { id: ref, name: ref };
  const r = await api('GET', '/guilds/' + g.id + '/bans?limit=1000');
  const list = ok(r) && Array.isArray(r.body) ? r.body.filter(x => x && x.user) : [];
  const low = ref.toLowerCase(), nm = b => [b.user.global_name, b.user.username].filter(Boolean).map(x => String(x).toLowerCase());
  const exact = list.filter(b => nm(b).indexOf(low) !== -1), pre = list.filter(b => nm(b).some(n => n.indexOf(low) === 0));
  const pick = exact.length ? exact : pre;
  if (pick.length === 1) return { id: pick[0].user.id, name: nameOf(pick[0].user), user: pick[0].user };
  return { error: pick.length ? 'several' : 'none', ref, names: pick.slice(0, 5).map(b => nameOf(b.user)) };
}

const whoText = (e, where) => e.error === 'several'
  ? 'Several members match: ' + e.names.map(plainName).join(', ') + '. Write the exact name or the user ID.'
  : 'I cannot find **' + plainName(e.ref) + '** ' + where + '. Write the exact name or the user ID.';

/* ---------- чистка канала: «!clear 50», «!clear all», «!clear 20 @игрок» ----------
   Сообщения моложе 14 дней Discord даёт удалять пачками по 100, старые —
   только по одному (и медленно), поэтому «all» в старом канале может идти
   долго: идёт в фоне, «!clear stop» останавливает. Закреплённые сообщения
   и пост с правилами не трогаем. Канал не пересоздаём — у него остаётся
   тот же id (на него завязаны правила, новости и журнал). */
const clearing = new Map();        // канал -> { guild, stop }
const msgTime = id => Number((BigInt(id) >> 22n) + DISCORD_EPOCH);

async function clearCommand(g, m, args) {
  const a = String(args || '').trim();
  if (/^stop\b/i.test(a)) {
    let n = 0;
    for (const job of clearing.values()) if (job.guild === g.id) { job.stop = true; n++; }
    await confirm(m.channel_id, n ? 'Stopped.' : 'Nothing is being deleted now.');
    return true;
  }
  // строго: число или all и, по желанию, один игрок (имя, id или упоминание). Что-то непонятное — не «все подряд», а подсказка
  let count = null, ref = '', refId = false, bad = false;
  for (const mm of a.matchAll(/"([^"]+)"|“([^”]+)”|(\S+)/g)) {
    const w = mm[1] || mm[2] || mm[3], quoted = !mm[3];
    if (!quoted && /^(?:all|все|всё|[1-9]\d{0,5})$/i.test(w) && count === null) count = w.toLowerCase();
    else if (!ref) { const id = /^<@!?(\w+)>$/.exec(w); ref = id ? id[1] : w; refId = !!id; }
    else bad = true;
  }
  if (bad || count === null) {
    await confirm(m.channel_id, 'How many? ' + PREFIX + 'clear 50, ' + PREFIX + 'clear all, or ' + PREFIX + 'clear 20 name.');
    return true;
  }
  let user = null, userName = '';
  if (ref) {
    const f = await findMember(g, ref, m, refId);
    if (f.error) { await confirm(m.channel_id, whoText(f, 'on the server')); return true; }
    user = f.id; userName = nameOf(f.user, f.member);
  }
  if (clearing.has(m.channel_id)) { await confirm(m.channel_id, 'Already deleting here. ' + PREFIX + 'clear stop to stop.'); return true; }
  if (!/^\d+$/.test(count)) { await openPanel(g, m, 'clear', { user, userName }); return true; }      // «all» — сначала спросить
  startClear(g, m.channel_id, Number(count), user, m.author.id, [m.id], userName, nameOf(m.author, m.member));
  return true;
}

function startClear(g, channel, limit, user, by, skip, userName, byName) {
  if (clearing.has(channel)) return;
  const job = { guild: g.id, stop: false };
  clearing.set(channel, job);
  clearChannel(g, channel, limit, user, skip, job)
    .then(async n => {
      // удаление закончено — новую чистку можно начинать, пока рисуется итог
      if (clearing.get(channel) === job) clearing.delete(channel);
      if (n) await modlog(g, { caseNo: ++state.cases, title: 'Deleted ' + n + (n === 1 ? ' message' : ' messages'), color: R.COLORS.neutral,
                               user: user || by, userName: user ? userName : byName, by, byName, channel, reason: user ? 'Only messages of this member' : undefined });
      save();
      const text = (job.stop ? 'Stopped. ' : '') + 'Deleted ' + n + (n === 1 ? ' message.' : ' messages.');
      await flashCard(channel, g, { tag: { en: 'Channel', ru: 'Канал' }, color: job.stop ? 'warn' : 'info',
        title: { en: 'Deleted ' + n + (n === 1 ? ' message' : ' messages'), ru: 'Удалено: ' + ruCount(n, 'сообщение', 'сообщения', 'сообщений') },
        lines: [].concat(job.stop ? [{ en: 'Stopped before the end.', ru: 'Остановлено раньше конца.' }] : [],
                         user ? [{ en: 'Only messages of ' + userName + '.', ru: 'Только сообщения ' + userName + '.' }] : [],
                         [{ en: 'Pinned messages and the rules post stay.', ru: 'Закреплённые сообщения и правила остались.' }]) }, text);
    })
    .catch(e => log('clear failed:', e.message))
    .finally(() => { if (clearing.get(channel) === job) clearing.delete(channel); });
}

async function clearChannel(g, channel, limit, user, skip, job) {
  const keep = new Set(skip || []);
  const rules = gstate(g.id).rules;
  if (rules && rules.message) keep.add(rules.message);
  let before = '', done = 0;
  while (!job.stop && done < limit) {
    const r = await api('GET', '/channels/' + channel + '/messages?limit=100' + (before ? '&before=' + before : ''));
    if (r.status === 403) { once('noread:' + channel, 'cannot read messages in ' + channel + ': give the bot Read Message History'); break; }
    if (!ok(r) || !Array.isArray(r.body) || !r.body.length) break;
    before = r.body[r.body.length - 1].id;
    const pick = r.body.filter(x => x && x.id && !x.pinned && !keep.has(x.id) && (!user || (x.author && x.author.id === user)))
                       .slice(0, limit - done).map(x => x.id);
    // запас в час: на границе 14 дней Discord отказывает всей пачке
    const edge = Date.now() - 14 * R.DAY + R.HOUR;
    const fresh = pick.filter(id => msgTime(id) > edge), old = pick.filter(id => msgTime(id) <= edge);
    if (fresh.length >= 2) {
      const b = await api('POST', '/channels/' + channel + '/messages/bulk-delete', { messages: fresh }, { reason: 'Cleared by the owner' });
      if (ok(b)) done += fresh.length; else old.unshift(...fresh);
    } else old.unshift(...fresh);
    for (const id of old) {
      if (job.stop) break;
      const d = await api('DELETE', '/channels/' + channel + '/messages/' + id, null, { reason: 'Cleared by the owner' });
      if (ok(d)) done++;
      else if (d.status === 403) { once('nodel:' + channel, 'cannot delete messages in ' + channel + ': give the bot Manage Messages'); return done; }
    }
    if (r.body.length < 100) break;
  }
  return done;
}

/* ---------- окна: редактор поста и каналы новостей ----------
   Новые окна Discord умеют выпадающий список каналов и загрузку картинок.
   Если Discord откажется их показать, бот откроет простое окно из
   текстовых полей: канал по имени, картинки ссылками. */
const row = (custom_id, label, style, extra) => ({ type: 1, components: [Object.assign({ type: 4, custom_id, label, style, required: false }, extra || {})] });
const field = (label, description, component) => Object.assign({ type: 18, label }, description ? { description } : {}, { component });

function newsModal(g, p) {
  return { custom_id: 'news:' + p.channel, title: 'New post', components: [
    field('Channel', null, { type: 8, custom_id: 'channel', channel_types: [0, 5], min_values: 1, max_values: 1,
                             default_values: [{ id: p.channel, type: 'channel' }] }),
    field('Title', null, { type: 4, custom_id: 'title', style: 1, required: false, max_length: 256 }),
    field('Text', 'Links work. @everyone, @here and @Role names ping.',
          { type: 4, custom_id: 'text', style: 2, required: false, max_length: 4000 }),
    field('Images', 'Up to 4', { type: 19, custom_id: 'images', min_values: 0, max_values: 4, required: false }),
    field('Link button', 'Optional: a button under the post', { type: 4, custom_id: 'link', style: 1, required: false,
                                                               max_length: 512, placeholder: 'https://aibrofist.online' })
  ] };
}
function newsModalClassic(g, p) {
  const c = g.channels.get(p.channel);
  return { custom_id: 'news:' + p.channel, title: 'New post', components: [
    row('channel', 'Channel', 1, { required: true, max_length: 100, value: c ? c.name : '' }),
    row('title', 'Title', 1, { max_length: 256 }),
    row('text', 'Text', 2, { max_length: 4000 }),
    row('images', 'Image links (one per line, up to 4)', 2, { max_length: 2000 }),
    row('link', 'Link button', 1, { max_length: 512, placeholder: 'https://aibrofist.online' })
  ] };
}
function updatesModal(g) {
  const mine = state.feed.filter(c => g.channels.has(c));
  return { custom_id: 'updates:' + g.id, title: 'Game update channels', components: [
    field('Channels', 'Leave empty to use #updates', { type: 8, custom_id: 'channels', channel_types: [0, 5],
      min_values: 0, max_values: 5, required: false, default_values: mine.map(id => ({ id, type: 'channel' })) })
  ] };
}
function updatesModalClassic(g) {
  const mine = state.feed.filter(c => g.channels.has(c)).map(c => g.channels.get(c).name);
  return { custom_id: 'updates:' + g.id, title: 'Game update channels', components: [
    row('channels', 'Channel names, separated by commas', 1, { max_length: 400, value: mine.join(', '),
                                                              placeholder: 'updates, news' })
  ] };
}

/* Предупреждение (команда warn): форма, где всё обязательно — кого, за какое
   правило и что именно случилось. Игрок выбирается из списка сервера (или
   вписан командой «!warn имя»), правило — из списка правил (или «0. Other»).
   Простое окно (если Discord не покажет новое) — те же три поля текстом. */
const warnRuleOptions = () => R.RULES.map(r => ({ label: (r.id + '. ' + r.title).slice(0, 100), value: String(r.id) }))
  .concat([{ label: '0. Other (explain in the reason)', value: '0' }]);
function warnModal(g, p) {
  const user = { type: 5, custom_id: 'user', min_values: 1, max_values: 1, required: true, placeholder: 'Choose a member' };
  if (p.data && p.data.user) user.default_values = [{ id: p.data.user, type: 'user' }];
  return { custom_id: 'warn:' + p.channel, title: 'Warning', components: [
    field('Member', 'Who gets the warning', user),
    field('Rule', 'Which rule was broken', { type: 3, custom_id: 'rule', min_values: 1, max_values: 1, required: true,
                                            placeholder: 'Choose a rule', options: warnRuleOptions() }),
    field('Reason', 'What exactly happened: the member sees this', { type: 4, custom_id: 'reason', style: 2, required: true, min_length: 3, max_length: 300 })
  ] };
}
function warnModalClassic(g, p) {
  return { custom_id: 'warn:' + p.channel, title: 'Warning', components: [
    row('user', 'Member (name or user ID)', 1, { required: true, max_length: 100, value: (p.data && p.data.userName) || '' }),
    row('rule', 'Rule number (1-' + R.RULES.length + ', 0 - other)', 1, { required: true, min_length: 1, max_length: 1 }),
    row('reason', 'Reason (the member sees this)', 2, { required: true, min_length: 3, max_length: 300 })
  ] };
}

async function onWarnSubmit(i, g) {
  await defer(i);
  const v = modalValues(i), channel = String(i.data.custom_id).slice(5);
  const reason = String(v.reason || '').trim().slice(0, 300);
  const ruleRaw = String(Array.isArray(v.rule) ? v.rule[0] : v.rule || '').trim();
  const rule = /^\d$/.test(ruleRaw) ? Number(ruleRaw) : -1;
  let found = null;
  if (Array.isArray(v.user)) {
    const id = v.user[0], res = i.data.resolved || {};
    if (id) found = { id, user: (res.users && res.users[id]) || { id }, member: (res.members && res.members[id]) || null };
  } else if (String(v.user || '').trim()) {
    found = await findMember(g, String(v.user).trim(), { mentions: [] });
    if (found.error) return finish(i, card('Not sent. ' + whoText(found, 'on the server')));
  }
  // Discord сам не пускает пустое, но проверяем и здесь: без кого, правила и причины предупреждения нет
  const missing = [];
  if (!found) missing.push('the member');
  if (rule < 0 || rule > R.RULES.length) missing.push('the rule');
  if (reason.length < 3) missing.push('the reason');
  if (missing.length) return finish(i, card('Not sent: fill in ' + missing.join(', ') + '.'));
  const uid = found.id;
  if (uid === g.owner || (me && uid === me.id) || found.user.bot) return finish(i, card('Not sent: the server owner and bots cannot be punished.'));
  const who = nameOf(found.user, found.member), by = (i.member && i.member.user) || {};
  const f = { kind: 'manual', rule, weight: 1, note: reason };
  const ch = g.channels.has(channel) ? channel : null;
  // предупреждение засчитывается; в канал — карточка (её выкладываем сами, ниже)
  const res = await punish(g, found.user, f, { step: { type: 'warn' }, by: by.id, byName: nameOf(by, i.member), name: who, member: found.member,
                                               channel: ch, roles: found.member && found.member.roles, card: true });
  const r = R.ruleById(rule), w = res.warned || { n: 1, limit: R.WARNS.limit };
  const count = 'Warning ' + w.n + ' of ' + w.limit + (res.esc ? (res.card.blocked ? '' : ': ' + R.describe(res.esc).toLowerCase()) : '');
  if (ch) {
    const line = '**' + plainName(who) + '**, you received a warning' + (r ? ' for rule ' + r.id + ', ' + r.title.toLowerCase() : '') + ': ' +
                 reason.replace(/[.!?\s]+$/, '') + '. ' + count + '.';
    const pr = await postCard(ch, 'action', res.card, g.id, { content: line });
    // карточка в канале — и есть ответ: «думаю…», которое видит только владелец, убираем
    if (ok(pr)) { await api('DELETE', '/webhooks/' + (i.application_id || appId) + '/' + i.token + '/messages/@original').catch(() => {}); return pr; }
  }
  // в канал не вышло — карточку видит хотя бы владелец
  return finishCard(i, g, 'action', res.card, count + ' sent to **' + plainName(who) + '**.\n' + (r ? 'Rule ' + r.id + ': ' + r.title : 'Rule: other') + '\nReason: ' + reason);
}

/* Итог окна (пост, каналы, правила, предупреждение) — карточкой вместо «думаю…».
   Окно уже ответило «думаю…» простым сообщением; Discord не всегда даёт превратить
   его в новые компоненты, поэтому: правка на месте -> иначе «думаю…» убираем и шлём
   новое сообщение (видит только владелец) -> иначе простой текст. Что из этого
   сработало, помним: правку, которую Discord не берёт, повторно не пробуем. */
const caps = { patchCard: null };
async function finishMessage(i, msg) {
  const hook = '/webhooks/' + (i.application_id || appId) + '/' + i.token;
  if (caps.patchCard !== false) {
    const r = await api('PATCH', hook + '/messages/@original', Object.assign({}, msg, { flags: msg.flags & ~64 }));
    if (ok(r)) { caps.patchCard = true; return r; }
    if (r.status === 400 && caps.patchCard === null) { caps.patchCard = false; log('Discord does not turn a "thinking" reply into a card; sending the card as a new message'); }
    else if (r.status !== 400) return r;
  }
  await api('DELETE', hook + '/messages/@original').catch(() => {});
  return api('POST', hook, msg);
}
async function finishCard(i, g, kind, data, text) {
  const rec = { k: kind, d: Object.assign({ at: Date.now() }, data), g: g ? g.id : null };
  const id = keepCard(kind, rec.d, rec.g);
  try {
    const r = await finishMessage(i, cardMessage(rec, id, userLang(i), true));
    if (ok(r)) return r;
    log('Discord did not take the ' + kind + ' card:', r.status, JSON.stringify(r.body).slice(0, 200));
  } catch (e) { once('card:' + e.message, 'could not build the ' + kind + ' card, sending text instead:', e.message); }
  const r = await finish(i, card(text));
  return ok(r) ? r : api('POST', '/webhooks/' + (i.application_id || appId) + '/' + i.token, Object.assign({ flags: 64, allowed_mentions: { parse: [] } }, card(text)));
}
const chName = (g, id) => { const c = g.channels.get(id); return '#' + (c ? c.name : id); };
// «5 сообщений», «1 сообщение»
const ruCount = (n, one, few, many) => { const a = n % 100, b = n % 10; return n + ' ' + (a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many); };

/* Правила сервера (команда rules): канал, заголовок, правила по-английски
   и по-русски — одним постом: сверху английский, кнопка «Русский» меняет
   текст в этом же окне на русский (и обратно, кнопка «English»), — свои
   запрещённые слова. Сразу вписаны стандартные правила с наказаниями — бот
   следит именно за ними. */
const RULES_TITLE = 'AIBROFIST Server Rules';
const RULES_TITLE_RU = 'Правила сервера AIBROFIST';
// канал #rules сервера AIBROFIST (DISCORD_RULES_CHANNEL_ID на хостинге его заменяет)
const RULES_CHANNEL = String(process.env.DISCORD_RULES_CHANNEL_ID || '1543921319563886643').trim();
function rulesNow(g) {
  const st = gstate(g.id), r = st.rules || {};
  return { channel: r.channel || '', title: r.title || RULES_TITLE, en: r.en || R.rulesText('en'),
           ru: r.ru === undefined ? R.rulesText('ru') : r.ru, words: (st.words || []).join(', ') };
}
function rulesModal(g, p) {
  const r = rulesNow(g), channel = [r.channel, RULES_CHANNEL].find(c => c && g.channels.has(c)) || p.channel;
  return { custom_id: 'rules:' + p.channel, title: 'Server rules', components: [
    field('Channel', null, { type: 8, custom_id: 'channel', channel_types: [0, 5], min_values: 1, max_values: 1,
                             default_values: [{ id: channel, type: 'channel' }] }),
    field('Title', null, { type: 4, custom_id: 'title', style: 1, required: true, max_length: 100, value: r.title }),
    field('Rules in English', 'Shown in the post. Keep the rule numbers: the bot names them.',
          { type: 4, custom_id: 'en', style: 2, required: true, max_length: 3700, value: r.en.slice(0, 3700) }),
    field('Rules in Russian', 'Shown in the same post by the Русский button. Leave empty for English only.',
          { type: 4, custom_id: 'ru', style: 2, required: false, max_length: 3700, value: r.ru.slice(0, 3700) }),
    field('Extra banned words', 'Comma or new line between them. A message with one is removed and the author gets a warning.',
          Object.assign({ type: 4, custom_id: 'words', style: 2, required: false, max_length: 2000 }, r.words ? { value: r.words } : {}))
  ] };
}
function rulesModalClassic(g, p) {
  const r = rulesNow(g), c = g.channels.get([r.channel, RULES_CHANNEL].find(x => x && g.channels.has(x)) || p.channel);
  return { custom_id: 'rules:' + p.channel, title: 'Server rules', components: [
    row('channel', 'Channel', 1, { required: true, max_length: 100, value: c ? c.name : '' }),
    row('title', 'Title', 1, { required: true, max_length: 100, value: r.title }),
    row('en', 'Rules in English', 2, { required: true, max_length: 3700, value: r.en.slice(0, 3700) }),
    row('ru', 'Rules in Russian (Русский button)', 2, { max_length: 3700, value: r.ru.slice(0, 3700) }),
    row('words', 'Extra banned words (comma between them)', 2, Object.assign({ max_length: 2000 }, r.words ? { value: r.words } : {}))
  ] };
}
/* Пост с правилами. o.lang — какой язык показан: на английском внизу кнопка
   «Русский», на русском — «English»; без русского текста кнопки нет.
   o.at — когда пост выложен (подпись внизу не прыгает при переключении). */
const rulesPost = (title, text, o) => {
  o = o || {};
  return frame({ color: R.COLORS.neutral, title, text,
    footer: 'AIBROFIST  ·  Updated <t:' + Math.floor((o.at || Date.now()) / 1000) + ':D>',
    button: o.lang === 'en' ? { label: 'Русский', id: 'rules:ru' } : o.lang === 'ru' ? { label: 'English', id: 'rules:en' } : null });
};

/* Правила сообщением (discordViews.js): стандартные — с наказанием у каждого
   правила, свой текст владельца — как он написан. Под текстом флаги: English и
   Русский (без русского текста флагов нет). */
const CARD_DESIGN = 4;               // версия оформления ответов бота (1-3 — картинки, 4 — сообщения Discord): поменялось — пост правил один раз перерисуется
const rulesAreStd = r => r.en === R.rulesText('en') && (!r.ru || r.ru === R.rulesText('ru'));
function rulesData(g, r, lang) {
  const ru = lang === 'ru' && !!r.ru, std = rulesAreStd(r), title = r.title || RULES_TITLE;
  const text = ru ? r.ru : r.en;
  // другой язык (не en и не ru) — только у стандартных правил, у них есть перевод; название по умолчанию тоже переводится
  return { std, title: ru ? RULES_TITLE_RU : lang !== 'en' && lang !== 'ru' && title === RULES_TITLE ? V.say(lang, 'rulesTitle') : title,
           text: g ? linkify(g, text) : text, at: r.at };
}
function rulesMessage(g, r, lang) {
  lang = V.langOf(lang);
  const std = rulesAreStd(r);
  if ((lang === 'ru' && !r.ru) || (!std && lang !== 'en' && lang !== 'ru')) lang = 'en';
  // свой текст владельца переводится только на русский (если он его написал): глобуса у него нет
  const btns = V.langButtons(l => 'rules:' + l, lang, 'rules-lang').slice(0, std ? 3 : 2);
  return V.message(V.view('rules', rulesData(g, r, lang), lang), r.ru ? [V.row(...btns)] : []);
}

/* Один пост: тот же канал — правим прежний на месте (картинку прежней версии
   убираем), иначе кладём новый, а старый убираем. Прежний отдельный русский
   пост (если был) убирается. Сначала красивым сообщением; не собралось или
   Discord его не взял — простой рамкой с текстом.
   Возвращает { message, at, pic } или { error: код ответа Discord }. */
async function publishRules(g, chan, r, old) {
  old = old || {};
  const at = Date.now();
  const tries = [];
  try { tries.push({ body: rulesMessage(g, Object.assign({}, r, { at }), 'en'), nice: true }); }
  catch (e) { once('rulespic:' + e.message, 'could not build the rules, posting plain text instead:', e.message); }
  tries.push({ body: rulesPost(r.title, linkify(g, r.en), { lang: r.ru ? 'en' : null, at }) });
  let res = null, used = null;
  for (const m of tries) {
    res = null;
    if (old.message && old.channel === chan) res = await api('PATCH', '/channels/' + chan + '/messages/' + old.message, Object.assign({ attachments: [] }, m.body));
    if (!res || !ok(res)) res = await api('POST', '/channels/' + chan + '/messages', m.body);
    if (ok(res) && res.body) { used = m; break; }
    if (m.nice) log('Discord did not take the rules message:', res.status, JSON.stringify(res.body).slice(0, 200));
  }
  if (!used) return { error: res.status };
  const out = { message: res.body.id, at, pic: !!used.nice };
  for (const id of [old.message, old.ruMessage])
    if (id && id !== out.message && old.channel) api('DELETE', '/channels/' + old.channel + '/messages/' + id).catch(() => {});
  return out;
}

async function onRulesSubmit(i, g) {
  await defer(i);
  const v = modalValues(i);
  const chosen = Array.isArray(v.channel) ? g.channels.get(v.channel[0]) : channelByName(g, v.channel);
  if (!chosen || (chosen.type !== 0 && chosen.type !== 5)) return finish(i, card('I cannot find that channel.'));
  const title = String(v.title || '').trim() || RULES_TITLE;
  const en = String(v.en || '').trim(), ru = String(v.ru || '').trim();
  if (!en) return finish(i, card('The rules are empty.'));
  // слова: через запятую или с новой строки, без повторов, не короче двух букв
  const words = [...new Set(String(v.words || '').split(/[,\n;]+/).map(w => w.trim().toLowerCase().replace(/\s+/g, ' '))
                       .filter(w => w.length >= 2 && w.length <= 60))].slice(0, 200);
  const st = gstate(g.id), old = st.rules || {};
  const r = await publishRules(g, chosen.id, { title, en, ru }, old);
  if (r.error) return finish(i, card('Could not post in <#' + chosen.id + '> (error ' + r.error + '). Check that I can send messages there.'));
  st.rules = { channel: chosen.id, message: r.message, title, en, ru, at: r.at, custom: true, pic: r.pic };   // свой текст — сам бот его больше не меняет
  st.words = words;
  save();
  const url = 'https://discord.com/channels/' + g.id + '/' + chosen.id + '/' + r.message;
  return finishCard(i, g, 'info', {
    tag: { en: 'Server rules', ru: 'Правила сервера' }, color: 'ok', link: { url, en: 'Open the rules', ru: 'Открыть правила' },
    title: { en: 'Rules are posted in ' + chName(g, chosen.id), ru: 'Правила выложены в ' + chName(g, chosen.id) },
    lines: [ru ? { en: 'The flag buttons under the post switch it between English and Russian.', ru: 'Кнопки с флагами под постом переключают английский и русский.' }
               : { en: 'No Russian version, so there are no language buttons.', ru: 'Русского текста нет, поэтому и кнопок языка нет.' },
            words.length ? { en: 'Extra banned words: ' + words.length + '. A message with one is removed and the author gets a warning.',
                             ru: 'Своих запрещённых слов: ' + words.length + '. Сообщение с таким словом удаляется, автору — предупреждение.' }
                         : { en: 'No extra banned words.', ru: 'Своих запрещённых слов нет.' }]
  }, 'Rules are in <#' + chosen.id + '>: ' + url +
    '\n' + (ru ? 'The Russian version opens with the button under the post, in the same window.' : 'No Russian version, so there is no button.') +
    '\n' + (words.length ? 'Extra banned words: ' + words.length + '. Messages with them are removed and the author gets a warning.' : 'No extra banned words.'));
}

/* Правила ещё не выкладывались — бот сам кладёт стандартные в #rules.
   Поменялся стандартный текст (новая версия бота), а владелец свой не писал —
   бот правит тот же пост. Написал свой командой rules (custom) — не трогаем;
   удалил пост — бот выкладывает новый только когда текст правил меняется.
   Пост текстом прежних версий бота один раз перерисовывается красивым сообщением (pic),
   свой текст владельца при этом остаётся.
   Исключение — разовая замена на 7 правил с одним постом и кнопкой «Русский»
   (fixes.rules7): она перекрывает и свой текст, и убирает прежний отдельный
   русский пост. */
async function postDefaultRules(g) {
  const st = gstate(g.id);
  const old = st.rules;
  const force = !state.fixes.rules7;
  const en = R.rulesText('en'), ru = R.rulesText('ru');
  const c = g.channels.get(RULES_CHANNEL);
  const toPic = !!(old && old.message && !old.pic);
  const upgrade = state.fixes.rulesCard !== CARD_DESIGN;     // один раз на версию оформления: пост перерисовывается
  if (old && old.message && !force && !toPic && !upgrade && (old.custom || (old.en === en && old.ru === ru && !old.ruMessage))) return;
  if (!old && !c) return;
  const chan = old && old.channel && g.channels.has(old.channel) ? old.channel : c && c.id;
  if (!chan) return;
  const keep = !!(old && old.custom && !force);
  const text = keep ? { title: old.title || RULES_TITLE, en: old.en || en, ru: old.ru || '' }
                    : { title: (old && !force && old.title) || RULES_TITLE, en, ru };
  const r = await publishRules(g, chan, text, old || {});
  if (r.error) { log('could not post the rules in ' + chan + ':', r.error); return; }
  st.rules = Object.assign({ channel: chan, message: r.message }, text, { at: r.at, pic: r.pic }, keep ? { custom: true } : {});
  if (force) state.fixes.rules7 = true;
  state.fixes.rulesCard = CARD_DESIGN;
  save();
}

/* Кнопки языка под правилами: English и Русский меняют текст в том же посте (это правка самого поста, её видят
   все), глобус даёт правила на языке Discord нажавшего личной копией, видной только ему. Не собралось —
   прежняя рамка с текстом; Discord правку не примет — отвечаем только нажавшему. */
async function rulesSwitch(i, g, code) {
  const r = g && gstate(g.id).rules || {};
  const full = { title: r.title || RULES_TITLE, en: r.en || R.rulesText('en'), ru: r.ru === undefined ? R.rulesText('ru') : r.ru, at: r.at };
  return langAnswer(i, code, lang => {
    let msg;
    try { msg = rulesMessage(g, full, lang); }
    catch (e) {
      const showRu = lang === 'ru' && !!full.ru, text = showRu ? full.ru : full.en;
      msg = rulesPost(showRu ? RULES_TITLE_RU : full.title, g ? linkify(g, text) : text, { lang: showRu ? 'ru' : full.ru ? 'en' : null, at: r.at });
    }
    return Object.assign({ attachments: [] }, msg);
  });
}

async function showModal(i, modern, classic) {
  if (i._http) return respond(i, { type: 9, data: modern });     // по HTTP ответ один — сразу новое окно
  const cb = '/interactions/' + i.id + '/' + i.token + '/callback';
  const r = await api('POST', cb, { type: 9, data: modern });
  if (r.status === 400) return api('POST', cb, { type: 9, data: classic });
  return r;
}

function modalValues(i) {
  const out = {};
  const walk = c => {
    if (!c) return;
    if (Array.isArray(c)) { c.forEach(walk); return; }
    if (c.custom_id) {
      if (Array.isArray(c.values)) out[c.custom_id] = c.values;
      else if (typeof c.value === 'string') out[c.custom_id] = c.value;
    }
    walk(c.components);
    walk(c.component);
  };
  walk(i.data && i.data.components);
  return out;
}

async function onNewsSubmit(i, g) {
  await defer(i);
  const v = modalValues(i);
  const chosen = Array.isArray(v.channel) ? g.channels.get(v.channel[0]) : channelByName(g, v.channel);
  if (!chosen || (chosen.type !== 0 && chosen.type !== 5)) return finish(i, card('I cannot find that channel.'));
  const title = String(v.title || '').trim(), text = String(v.text || '').trim();
  let link = String(v.link || '').trim();
  if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
  let host = '';
  if (link) {
    try { host = new URL(link).hostname.replace(/^www\./, ''); }
    catch (e) { return finish(i, card('The link button needs a web address, like https://aibrofist.online.')); }
  }

  // картинки: загруженные в окне — переносим в пост (их ссылки временные),
  // в простом окне — это просто ссылки https
  const images = [], files = [], notes = [];
  if (typeof v.images === 'string') {
    v.images.split(/\s+/).filter(u => /^https:\/\/\S+$/i.test(u)).slice(0, 4).forEach(u => images.push(u));
  } else {
    const res = (i.data.resolved && i.data.resolved.attachments) || {};
    const ids = Array.isArray(v.images) && v.images.length ? v.images : Object.keys(res);
    for (const id of ids.slice(0, 4)) {
      const a = res[id];
      if (!a) continue;
      const shown = String(a.filename || 'image').slice(0, 60);
      // тип — по ответу Discord, а если его нет — по расширению имени
      const ext = ((/\.(png|jpe?g|gif|webp)$/i.exec(a.filename || '') || [])[1] || '').toLowerCase().replace('jpeg', 'jpg');
      const type = /^image\//.test(a.content_type || '') ? a.content_type : ext ? 'image/' + (ext === 'jpg' ? 'jpeg' : ext) : '';
      if (!type) { notes.push({ en: shown + ': not an image', ru: shown + ': это не картинка' }); continue; }
      if ((a.size || 0) > 10 * 1024 * 1024) { notes.push({ en: shown + ': bigger than 10 MB', ru: shown + ': больше 10 МБ' }); continue; }
      // CDN Discord сайту недоступен (так бывает у хостинга) — не ждём таймаута на каждой картинке
      let got = null, why = cdn.ok === false ? 'the site cannot reach the Discord CDN' : '';
      for (const u of cdn.ok === false ? [] : [a.url, a.proxy_url]) {
        if (!u || got) continue;
        try { got = await download(u, 10 * 1024 * 1024); } catch (e) { why = e.message; }
      }
      if (got) {
        const name = 'image' + (files.length + 1) + '.' + (ext || type.split('/')[1].replace('jpeg', 'jpg'));
        files.push({ name, data: got.buf, type });
        images.push('attachment://' + name);
      } else if (a.url) {
        // скачать не вышло — показываем по ссылке Discord, она со временем может пропасть
        images.push(a.url);
        notes.push({ en: shown + ': could not copy it (' + why + '), so it is shown by link and may disappear later',
                     ru: shown + ': не удалось скопировать (' + why + '), показана по ссылке и может со временем пропасть' });
      }
    }
  }
  if (!title && !text && !images.length) return finish(i, card('The post is empty: add a title, text or an image.'));

  // карточка в рамке; упоминания в ней срабатывают (@everyone, @Роль)
  const msg = frame({
    color: R.COLORS.neutral, title, text: linkify(g, text), images,
    footer: 'AIBROFIST  ·  <t:' + Math.floor(Date.now() / 1000) + ':D>',
    button: link ? { label: host, url: link } : null,
    mentions: { parse: ['everyone', 'roles'] }
  });
  const r = await api('POST', '/channels/' + chosen.id + '/messages', msg, files.length ? { files } : undefined);
  if (!ok(r) || !r.body) return finish(i, card('Could not post in <#' + chosen.id + '> (error ' + r.status + '). Check that I can send messages, embeds and files there.'));
  const url = 'https://discord.com/channels/' + g.id + '/' + chosen.id + '/' + r.body.id;
  return finishCard(i, g, 'info', { tag: { en: 'Post', ru: 'Пост' }, color: notes.length ? 'warn' : 'ok', link: { url, en: 'Open the post', ru: 'Открыть пост' },
                                   title: { en: 'Posted in ' + chName(g, chosen.id), ru: 'Опубликовано в ' + chName(g, chosen.id) }, lines: notes },
    'Posted in <#' + chosen.id + '>: ' + url + (notes.length ? '\n\nImages:\n' + notes.map(n => '- ' + n.en).join('\n') : ''));
}

async function onUpdatesSubmit(i, g) {
  await defer(i);
  const v = modalValues(i);
  const list = Array.isArray(v.channels)
    ? v.channels.filter(c => g.channels.has(c))
    : String(v.channels || '').split(',').map(n => channelByName(g, n)).filter(Boolean).map(c => c.id);
  // каналы других серверов (если бот где-то ещё) не трогаем
  state.feed = state.feed.filter(c => !g.channels.has(c)).concat([...new Set(list)]);
  save();
  const names = list.map(c => chName(g, c)).join(', ');
  return finishCard(i, g, 'info', { tag: { en: 'Game updates', ru: 'Новости игры' }, color: 'ok',
    title: list.length ? { en: 'Game updates will be posted in ' + names, ru: 'Новости игры будут в ' + names }
                       : { en: 'Game updates go to the #updates channel', ru: 'Новости игры идут в канал #updates' },
    lines: [{ en: 'New game updates appear there by themselves.', ru: 'Новые обновления игры появляются там сами.' }] },
    list.length ? 'Game updates will be posted in: ' + list.map(c => '<#' + c + '>').join(', ') + '.' : 'No channels chosen: game updates go to the #updates channel.');
}

async function onInteraction(i) {
  if (!i) return;
  const cid = String((i.data && i.data.custom_id) || '');
  const rs = i.type === 3 && /^rules:(me|[a-z]{2})(?::(?:dark|light))?$/.exec(cid);       // «:тема» — кнопки поста прежней версии
  if (rs) return rulesSwitch(i, i.guild_id ? guilds.get(i.guild_id) : guilds.values().next().value, rs[1]);
  if (i.type === 2 && i.data && i.data.name === 'servers') return onServers(i);
  if (i.type === 2 && i.data && i.data.name === 'account') return onAccount(i);
  if (i.type === 4 && i.data && i.data.name === 'account') return onAccountHint(i);
  if (i.type === 3 && /^(sv|ac):/.test(cid)) return onCardButton(i, cid);
  if (i.type === 3 && cid.indexOf('cd:') === 0) return onCardLang(i, cid);
  if (!i.guild_id) return;
  const g = guilds.get(i.guild_id);
  if (!g) return;
  const uid = i.member && i.member.user && i.member.user.id;
  if (i.type !== 3 && i.type !== 5) return;
  if (uid !== g.owner) return reply(i, card('Only the server owner can use this.'));
  if (i.type === 3 && cid.indexOf('panel:') === 0) {
    const id = cid.slice(6), p = panels.get(id);
    if (!p) return reply(i, card('This panel has expired. Type the command again.'));
    closePanel(id);
    if (p.kind === 'news') return showModal(i, newsModal(g, p), newsModalClassic(g, p));
    if (p.kind === 'updates') return showModal(i, updatesModal(g), updatesModalClassic(g));
    if (p.kind === 'rules') return showModal(i, rulesModal(g, p), rulesModalClassic(g, p));
    if (p.kind === 'warn') return showModal(i, warnModal(g, p), warnModalClassic(g, p));
    if (p.kind === 'help') return showCard(i, g, 'help', {}, card(HELP));
    if (p.kind === 'stats') return showCard(i, g, 'stats', {}, card('**Live server stats** (updates every second):\n' + require('./serversInfo.js').link() +
      '\n\nKeep this link private. **' + PREFIX + 'stats new** makes a new one and the old one stops working.'));
    if (p.kind === 'warns') return p.data && p.data.uid ? showCard(i, g, 'warns', p.data) : showCard(i, g, 'warnsAll', {});
    if (p.kind === 'unwarnAll') {
      const members = warnsAllData(g).members, n = clearWarns(g.id), byName = nameOf(i.member.user, i.member);
      if (n) { await modlog(g, { caseNo: ++state.cases, title: 'All warnings removed (' + n + ')', color: R.COLORS.ok, user: g.id, userName: 'All members', by: uid, byName }); save(); }
      return showCard(i, g, 'info', { tag: { en: 'Warnings', ru: 'Предупреждения' }, color: 'ok', at: Date.now(),
        title: n ? { en: 'All warnings removed', ru: 'Все предупреждения сняты' } : { en: 'Nobody had warnings', ru: 'Ни у кого не было предупреждений' },
        lines: n ? [{ en: n + (n === 1 ? ' warning' : ' warnings') + ' of ' + members + (members === 1 ? ' member' : ' members') + '. Everyone starts from zero.',
                      ru: 'Снято: ' + ruCount(n, 'предупреждение', 'предупреждения', 'предупреждений') + ' у ' + ruCount(members, 'участника', 'участников', 'участников') + '. У всех счёт с нуля.' }] : [] },
        card(n ? 'All warnings are removed: ' + n + '.' : 'Nobody had warnings.'));
    }
    if (p.kind === 'clear') {
      await reply(i, card('Deleting all messages' + (p.data.user ? ' of **' + plainName(p.data.userName || p.data.user) + '**' : '') + ' in <#' + p.channel + '>. ' +
                          'Type ' + PREFIX + 'clear stop to stop.'));
      startClear(g, p.channel, Infinity, p.data.user, uid, [p.message], p.data.userName, '');
      return;
    }
    return;
  }
  if (i.type === 5 && cid.indexOf('news:') === 0) return onNewsSubmit(i, g);
  if (i.type === 5 && cid.indexOf('updates:') === 0) return onUpdatesSubmit(i, g);
  if (i.type === 5 && cid.indexOf('rules:') === 0) return onRulesSubmit(i, g);
  if (i.type === 5 && cid.indexOf('warn:') === 0) return onWarnSubmit(i, g);
}

/* ---------- /servers и /account ----------
   Обычные сообщения Discord (discordViews.js) со свежими данными прямо с
   сайта (discordData.js): /servers — комнаты обоих режимов, /account —
   страница игрока (профиль, карты, друзья). Кнопки работают у всех, кто
   видит сообщение: оно просто обновляется. Имена комнат и карт пишут
   игроки — разметка в них экранируется (discordViews.js). */
const cards = require('./discordData.js');
const SITE_URL = require('./discordApi.js').SITE;
const PRESS_GAP_MS = 800;            // чаще одного нажатия от одного человека — не обновляем
const presses = new Map();           // кто -> когда нажимал в последний раз
const userOf = i => ((i.member && i.member.user) || i.user || {}).id || '';
const md = s => String(s || '').replace(/[\\*_`~|>#\[\]()<@:-]/g, c => '\\' + c).slice(0, 60);
const pressedTooFast = i => {
  const u = userOf(i), now = Date.now(), last = presses.get(u) || 0;
  presses.set(u, now);
  if (presses.size > 5000) presses.clear();
  return now - last < PRESS_GAP_MS;
};

// /servers: кнопки — обновить, играть, язык (английский, русский, глобус); id «sv:r:язык»
function serversMessage(lang) {
  lang = V.langOf(lang);
  const rows = [V.row(V.button(V.say(lang, 'refresh'), 'sv:r:' + lang), V.linkButton(V.say(lang, 'playNow'), SITE_URL),
                      ...V.langButtons(l => 'sv:r:' + l, lang, 'sv-lang'))];
  return V.message(V.view('servers', cards.serversData(), lang), rows);
}
// /account: вкладки (профиль, карты, друзья), период монет и очков (на профиле), ссылка, флаги; id «ac:вкладка:период:язык:ник»
const ACCOUNT_PAGES = [{ key: 'p', label: 'tabProfile' }, { key: 'm', label: 'tabMaps' }, { key: 'f', label: 'tabFriends' }];
const PERIODS = [{ key: 'day', label: 'perToday' }, { key: 'week', label: 'perWeek' }, { key: 'all', label: 'perAll' }];
function accountMessage(d, lang, page, period) {
  lang = V.langOf(lang);
  page = ACCOUNT_PAGES.some(x => x.key === page) ? page : 'p';
  period = PERIODS.some(x => x.key === period) ? period : 'all';
  const id = (pg, per, l) => 'ac:' + pg + ':' + per + ':' + (l || lang) + ':' + d.name;
  const rows = [V.row(...V.tabs(ACCOUNT_PAGES.map(x => ({ label: V.say(lang, x.label), id: id(x.key, period), on: x.key === page })), 'ac-page'))];
  if (page === 'p') rows.push(V.row(...V.tabs(PERIODS.map(x => ({ label: V.say(lang, x.label), id: id('p', x.key), on: x.key === period })), 'ac-per')));
  rows.push(V.row(V.button(V.say(lang, 'refresh'), id(page, period)), V.linkButton(V.say(lang, 'openProfile'), SITE_URL + '/users?name=' + encodeURIComponent(d.name)),
                  ...V.langButtons(l => id(page, period, l), lang, 'ac-lang')));
  return V.message(V.view('account', d, lang, { page, period }), rows);
}

const sorry = i => reply(i, { content: 'Could not show this right now. Please try again in a moment.' });
// ответ на команду: новое сообщение (type 4); не собралось или Discord не взял — короткий текст
async function answerCommand(i, make, what) {
  let msg;
  try { msg = make(); }
  catch (e) { once('view:' + what + e.message, 'could not build the ' + what + ' message:', e.message); return sorry(i); }
  const r = await respond(i, { type: 4, data: msg });
  if (r && !ok(r)) { log('Discord did not take the ' + what + ' message:', r.status, JSON.stringify(r.body).slice(0, 200)); return sorry(i); }
  return r;
}

function onServers(i) {
  return answerCommand(i, () => serversMessage(userLang(i)), 'servers');
}
function onAccount(i) {
  const opt = ((i.data && i.data.options) || []).find(o => o.name === 'nick');
  const nick = String((opt && opt.value) || '').trim().slice(0, 40);
  const d = nick && cards.profileData(nick);
  if (d) return answerCommand(i, () => accountMessage(d, userLang(i), 'p', 'all'), 'account');
  const like = nick ? cards.searchNames(nick, 5) : [];
  return reply(i, { content: 'No player named **' + md(nick || '?') + '** on aibrofist.online.' +
                             (like.length ? ' Maybe: ' + like.map(n => '**' + md(n) + '**').join(', ') + '?' : '') });
}
// подсказки ников, пока игрок печатает /account
function onAccountHint(i) {
  const opt = ((i.data && i.data.options) || []).find(o => o.focused) || {};
  const names = cards.searchNames(String(opt.value || ''), 25);
  return respond(i, { type: 8, data: { choices: names.map(n => ({ name: n, value: n })) } });
}
function onCardButton(i, cid) {
  if (pressedTooFast(i)) return respond(i, { type: 6 });
  // «sv:r:язык» (язык — en, ru, другой или me); у сообщений прежних версий (картинки) — «sv:тема[:страница][:язык]»
  const sv = /^sv:(?:r:(me|[a-z]{2})|(?:dark|light)(?::-?\d+)?(?::(en|ru))?)$/.exec(cid);
  if (sv) return langAnswer(i, sv[1] || sv[2] || 'en', lang => serversMessage(lang));
  // «ac:вкладка:период:язык:ник»; прежних версий — «ac:тема:страница[:период][:язык]:ник»
  const m = /^ac:([pmf]):(day|week|all):(me|[a-z]{2}):(.+)$/.exec(cid);
  const old = !m && /^ac:(?:dark|light):(-?\d+):(?:(day|week|all):)?(?:(en|ru):)?([^:]+)$/.exec(cid);
  if (!m && !old) return respond(i, { type: 6 });
  const d = cards.profileData(m ? m[4] : old[4]);
  if (!d) return reply(i, { content: 'This player is no longer on aibrofist.online.' });
  return langAnswer(i, (m ? m[3] : old[3]) || 'en', lang => m ? accountMessage(d, lang, m[1], m[2]) : accountMessage(d, lang, Number(old[1]) === 1 ? 'm' : 'p', old[2]));
}

/* Глобальные слэш-команды приложения: ровно этот список. Запись целиком
   заменяет прежний — так ушла и старая /say. Шлём один раз на версию. */
const GLOBAL_COMMANDS = [
  { name: 'servers', type: 1, description: 'AIBROFIST game rooms and players online right now',
    contexts: [0, 1], integration_types: [0] },
  { name: 'account', type: 1, description: 'Show an AIBROFIST player profile',
    contexts: [0, 1], integration_types: [0],
    options: [{ type: 3, name: 'nick', description: 'Player nickname on aibrofist.online', required: true, autocomplete: true,
                min_length: 1, max_length: 20 }] }
];
const GLOBAL_VER = 'servers-account-1';
async function syncGlobalCommands() {
  if (state.fixes.globalCommands === GLOBAL_VER) return;
  if (!appId) await loadApp().catch(() => null);
  if (!appId) return;
  const r = await api('PUT', '/applications/' + appId + '/commands', GLOBAL_COMMANDS);
  if (ok(r)) { state.fixes.globalCommands = GLOBAL_VER; save(); }
  else log('could not set the /servers and /account commands:', r.status);
}

/* Слэш-команд на сервере у бота нет — все команды секретные, с «!». Если
   прежняя версия успела их зарегистрировать, один раз убираем. */
async function clearSlashCommands(g) {
  const st = gstate(g.id);
  if (!appId || st.slashCleared) return;
  const r = await api('PUT', '/applications/' + appId + '/guilds/' + g.id + '/commands', []);
  if (ok(r)) { st.slashCleared = true; delete st.commands; save(); }
}

/* ---------- без живого подключения: работа запросами ----------
   С хостинга сайта живое подключение к gateway.discord.gg не открывается
   («Opening handshake has timed out»), а обычные запросы к Discord
   проходят. Тогда бот работает так:
   - новые сообщения: раз в секунду по запросу на каждый канал с текстом
     («что нового после последнего прочитанного»), по 10 каналов
     одновременно: обычные каналы, объявления, чаты голосовых каналов и
     сцен, ветки. Каналы, где 10 минут тихо, — раз в 3 секунды: так
     запросов втрое меньше, и Discord не режет бота за перегрузку. Ветки
     ищем раз в 10 секунд. Список каналов и роли —
     раз в минуту и отдельно: этот запрос Discord даёт делать лишь ~10 раз
     за 40 секунд, и когда опрос шёл через него, бот подолгу ждал и не
     видел ни команд, ни нарушений;
   - участники (входы, ники, аватарки) — раз в минуту, баны — раз в 5 минут;
   - кнопки и окна Discord присылает сайту сам (/discord/interactions,
     подпись проверяется ключом приложения).
   В Discord такой бот показан «не в сети», но всё делает. Если живое
   подключение всё-таки откроется, опрос встаёт на паузу. */
const POLL_MS = Number(process.env.DISCORD_POLL_MS) || 1000;
const QUIET_EVERY = 3;               // тихие каналы — каждый третий круг
const HOT_MS = 10 * 60 * 1000;       // «тихий» — без сообщений 10 минут
const THREADS_MS = Number(process.env.DISCORD_THREADS_POLL_MS) || 10000;
// где бывают сообщения: текст, чат голосового, объявления, ветки (3 вида), чат сцены
const TEXT_TYPES = new Set([0, 2, 5, 10, 11, 12, 13]);
const THREAD_TYPES = new Set([10, 11, 12]);
const createdAt = id => Number((BigInt(id) >> 22n) + 1420070400000n);   // время из id Discord
const REST_AFTER_MS = Number(process.env.DISCORD_REST_AFTER_MS) || 45000;
const MEMBERS_MS = Number(process.env.DISCORD_MEMBERS_POLL_MS) || 60000;
const CHANNELS_MS = Number(process.env.DISCORD_CHANNELS_POLL_MS) || 60000;
const BANS_MS = 5 * 60 * 1000;
const BLOCK_MS = 10 * 60 * 1000;     // канал закрыт для бота — заглянем снова через 10 минут
let rest = null, verifyKey = null;
let lastCommandAt = 0;               // для страницы состояния: когда бот последний раз узнал команду владельца
const newer = (a, b) => a.length !== b.length ? a.length > b.length : a > b;   // id сообщений — большие числа строкой

async function loadApp() {
  const r = await api('GET', '/applications/@me');
  if (!ok(r) || !r.body) return null;
  appId = r.body.id;
  verifyKey = r.body.verify_key || verifyKey;
  return r.body;
}

/* Куда Discord присылает команды и нажатия. Пока есть живое подключение,
   пусть шлёт по нему: оно уже открыто, ответ уходит за доли секунды. Путь
   через сайт (Cloudflare -> хостинг) бывает медленным — Discord ждёт
   3 секунды, и команда «не отвечала». Адрес на сайте нужен только в
   режиме запросов, без живого подключения (ensureInteractionsUrl). */
async function useLiveInteractions() {
  const app = await loadApp();
  if (!app || !app.interactions_endpoint_url) return;
  let r = await api('PATCH', '/applications/@me', { interactions_endpoint_url: null });
  if (!ok(r)) r = await api('PATCH', '/applications/@me', { interactions_endpoint_url: '' });
  if (ok(r)) log('commands now come over the live connection');
  else log('could not switch commands to the live connection:', r.status, JSON.stringify(r.body).slice(0, 200));
}

// адрес, куда Discord присылает нажатия кнопок и окна (режим запросов)
async function ensureInteractionsUrl() {
  const app = await loadApp();
  if (!app) return;
  const url = require('./discordApi.js').SITE + '/discord/interactions';
  if (app.interactions_endpoint_url === url) return;
  const r = await api('PATCH', '/applications/@me', { interactions_endpoint_url: url });
  if (!ok(r)) log('could not set the interactions URL:', r.status, JSON.stringify(r.body).slice(0, 200));
}

async function loadGuildRest(id) {
  const [gr, cr] = [await api('GET', '/guilds/' + id), await api('GET', '/guilds/' + id + '/channels')];
  if (!ok(gr) || !gr.body || !ok(cr) || !Array.isArray(cr.body)) return null;
  const g = cacheGuild(Object.assign({}, gr.body, { channels: cr.body }));
  cr.body.forEach(c => { if (c.last_message_id && !rest.last.has(c.id)) rest.last.set(c.id, c.last_message_id); });
  return g;
}

// список каналов и роли сервера — раз в минуту (новые каналы, выданные права);
// упёрлись в лимит Discord — не ждём, обновим в следующий раз
async function refreshGuild(g) {
  const gr = await api('GET', '/guilds/' + g.id, null, { once: true });
  if (ok(gr) && gr.body) {
    g.name = gr.body.name || g.name;
    g.owner = gr.body.owner_id || g.owner;
    g.roles.clear();
    (gr.body.roles || []).forEach(r => g.roles.set(r.id, { perms: BigInt(r.permissions || '0'), name: r.name }));
  }
  const cr = await api('GET', '/guilds/' + g.id + '/channels', null, { once: true });
  if (!ok(cr) || !Array.isArray(cr.body)) return;
  const seen = new Set();
  cr.body.forEach(c => { g.channels.set(c.id, chan(c)); seen.add(c.id); });
  for (const [id, c] of [...g.channels]) if (!seen.has(id) && !THREAD_TYPES.has(c.type)) g.channels.delete(id);   // ветки — ниже
}

// открытые ветки сервера — раз в 10 секунд; в новой ветке проверяем всё с её создания
async function refreshThreads(g, first) {
  const r = await api('GET', '/guilds/' + g.id + '/threads/active', null, { once: true });
  if (!rest || !ok(r) || !r.body || !Array.isArray(r.body.threads)) return;
  const seen = new Set();
  for (const t of r.body.threads) {
    seen.add(t.id);
    if (!g.channels.has(t.id) && !rest.last.has(t.id)) {
      if (first) { if (t.last_message_id) rest.last.set(t.id, t.last_message_id); }
      else rest.from.set(t.id, Math.max(rest.since, createdAt(t.id)));
    }
    g.channels.set(t.id, chan(t));
  }
  for (const [id, c] of [...g.channels]) if (THREAD_TYPES.has(c.type) && !seen.has(id)) g.channels.delete(id);
}

async function startRest() {
  if (rest || !token()) return;
  rest = { last: new Map(), from: new Map(), blocked: new Map(), members: new Map(), hot: new Map(), timers: [], busy: false,
           listing: false, threading: false, since: Date.now(), rounds: 0, lastRound: 0 };
  log('live connection to Discord is not available here, the bot works through requests');
  const u = await api('GET', '/users/@me');
  if (ok(u) && u.body) me = u.body;
  await ensureInteractionsUrl();
  const gl = await api('GET', '/users/@me/guilds');
  for (const g0 of (ok(gl) && Array.isArray(gl.body)) ? gl.body : []) {
    const g = await loadGuildRest(g0.id);
    if (!g) continue;
    await refreshThreads(g, true);
    await setupGuild(g);
    await pollMembers(g, true);
    await pollBans(g);
  }
  const every = (fn, ms) => { const t = setInterval(() => fn().catch(e => once('rest:' + e.message, 'poll failed:', e.message)), ms); if (t.unref) t.unref(); rest.timers.push(t); };
  every(pollMessages, POLL_MS);
  every(async () => {
    if (!rest || rest.listing) return;
    rest.listing = true;
    try { for (const g of guilds.values()) await refreshGuild(g); } finally { if (rest) rest.listing = false; }
  }, CHANNELS_MS);
  every(async () => {
    if (!rest || rest.threading) return;
    rest.threading = true;
    try { for (const g of guilds.values()) await refreshThreads(g, false); } finally { if (rest) rest.threading = false; }
  }, THREADS_MS);
  every(async () => { for (const g of guilds.values()) await pollMembers(g, false); }, MEMBERS_MS);
  every(async () => { for (const g of guilds.values()) await pollBans(g); }, BANS_MS);
}

function stopRest() {
  if (!rest) return;
  rest.timers.forEach(clearInterval);
  rest = null;
}

// новые сообщения одного канала: после последнего прочитанного; в пустом
// канале — последние, но только новее «from» (то, что было до запуска, не трогаем)
async function readChannel(c) {
  const last = rest.last.get(c.id);
  if (!last && !rest.from.has(c.id)) rest.from.set(c.id, Date.now());
  const r = await api('GET', '/channels/' + c.id + '/messages?' + (last ? 'after=' + last + '&' : '') + 'limit=50');
  if (!rest) return [];
  if (r.status === 403 || r.status === 404) {
    // закрыт для бота: заглянем позже и начнём с того места, а не со старого
    rest.blocked.set(c.id, Date.now() + BLOCK_MS);
    rest.last.delete(c.id);
    rest.from.set(c.id, Date.now() + BLOCK_MS);
    return [];
  }
  if (!ok(r) || !Array.isArray(r.body)) return [];
  const list = r.body.slice().sort((a, b) => newer(a.id, b.id) ? 1 : -1);
  if (list.length) rest.hot.set(c.id, Date.now());
  const from = last ? 0 : rest.from.get(c.id);
  let top = last || '0';
  for (const m of list) if (newer(m.id, top)) top = m.id;
  if (top !== '0') { rest.last.set(c.id, top); rest.from.delete(c.id); }
  return last ? list : list.filter(m => Date.parse(m.timestamp) >= from);
}

async function pollMessages() {
  if (!rest || rest.busy || (gw && gw.state === 'ready')) return;     // живое подключение есть — опрос не нужен
  rest.busy = true;
  try {
    for (const g of guilds.values()) {
      // тихие каналы — не каждый круг (см. выше)
      const now = Date.now(), quiet = rest.rounds % QUIET_EVERY === 0;
      const chans = [...g.channels.values()].filter(c => TEXT_TYPES.has(c.type) && !((rest.blocked.get(c.id) || 0) > now) &&
                                                        (quiet || now - (rest.hot.get(c.id) || 0) < HOT_MS));
      // каналы читаем сразу по 10 (у каждого свой лимит в Discord), а разбираем по очереди
      for (let i = 0; i < chans.length; i += 10) {
        const got = await Promise.all(chans.slice(i, i + 10).map(c => readChannel(c).catch(() => [])));
        for (const list of got) for (const m of list) {
          m.guild_id = g.id;
          m.member = (rest.members.get(g.id) || new Map()).get(m.author && m.author.id);
          (m.mentions || []).forEach(u => { if (!u.member) u.member = (rest.members.get(g.id) || new Map()).get(u.id); });
          await onMessage(m, false, 'poll').catch(e => log('message check failed:', e.message));
        }
      }
    }
    rest.rounds++;
    rest.lastRound = Date.now();
  } finally { if (rest) rest.busy = false; }
}

/* ---------- второй канал чтения: ловец сообщений ----------
   Живое подключение (Gateway) — основной и самый быстрый путь, но оно может
   молча оборваться, пока бот переподключается, или потерять событие; пока
   бот перезапускается (выкладка), сообщения вообще никто не читает. Чтобы
   проверялось КАЖДОЕ сообщение, рядом всегда работает второй канал: раз в
   секунду (тихие каналы — раз в 3 секунды) бот спрашивает у Discord, что
   пришло в каждый канал после последнего прочитанного сообщения, и
   разбирает всё, что живое подключение не принесло за 1,5 секунды.
   - одно сообщение разбирается один раз (по номеру): подключение и ловец
     друг другу не мешают;
   - бот помнит, на каком сообщении остановился в каждом канале, и после
     перезапуска доразбирает то, что пришло, пока он был выключен (не старше
     10 минут);
   - если живое подключение «потеряло» сообщение, бот его переподключает;
   - в режиме запросов (см. выше) этим занят опрос, ловец молчит. */
const WATCH = { seen: new Set(), last: new Map(), hot: new Map(), blocked: new Map(), misses: [], members: new Map(),
                since: 0, rounds: 0, lastRound: 0, checked: 0, fromGateway: 0, fromCatchUp: 0, missed: 0, lastMessage: 0,
                lastKick: 0, readyAt: 0, dirty: false, busy: false };
const MSG_GRACE_MS = 1500;                    // столько живому подключению даётся, чтобы принести сообщение самому
const BACKLOG_MS = 10 * 60 * 1000;            // после перезапуска разбираем то, что пришло не раньше 10 минут назад
const SEEN_KEEP = 5000;

function bumpLast(channel, id) {
  const last = WATCH.last.get(channel);
  if (!last || newer(id, last)) { WATCH.last.set(channel, id); WATCH.dirty = true; }
}

function markSeen(m, via) {
  WATCH.seen.add(m.id);
  if (WATCH.seen.size > SEEN_KEEP) {
    let n = SEEN_KEEP / 5;
    for (const id of WATCH.seen) { WATCH.seen.delete(id); if (--n <= 0) break; }
  }
  bumpLast(m.channel_id, m.id);
  WATCH.hot.set(m.channel_id, Date.now());
  WATCH.checked++;
  WATCH.lastMessage = Date.now();
  if (via === 'gateway') WATCH.fromGateway++; else WATCH.fromCatchUp++;
}

// участник сервера для сообщения, которое пришло не по подключению (у него есть роли и мьют — это нужно наказанию)
async function memberOf(gid, uid) {
  const k = gid + ':' + uid, c = WATCH.members.get(k), now = Date.now();
  if (c && now - c.t < 60000) return c.m;
  const r = await api('GET', '/guilds/' + gid + '/members/' + uid);
  const m = ok(r) && r.body ? r.body : null;
  WATCH.members.set(k, { m, t: now });
  if (WATCH.members.size > 500) for (const key of WATCH.members.keys()) { WATCH.members.delete(key); if (WATCH.members.size <= 400) break; }
  return m;
}

// новые сообщения одного канала после последнего прочитанного
async function readNew(c, live) {
  let last = WATCH.last.get(c.id);
  if (!last && c.last) { WATCH.last.set(c.id, c.last); WATCH.dirty = true; return []; }   // первый раз: старое не трогаем
  if (!last) {
    const r0 = await api('GET', '/channels/' + c.id + '/messages?limit=1');
    if (r0.status === 403 || r0.status === 404) { WATCH.blocked.set(c.id, Date.now() + BLOCK_MS); return []; }
    if (ok(r0) && Array.isArray(r0.body)) { WATCH.last.set(c.id, r0.body[0] ? r0.body[0].id : '0'); WATCH.dirty = true; }
    return [];
  }
  const r = await api('GET', '/channels/' + c.id + '/messages?after=' + last + '&limit=50');
  if (r.status === 403 || r.status === 404) { WATCH.blocked.set(c.id, Date.now() + BLOCK_MS); return []; }   // закрыт для бота: загляним позже
  if (!ok(r) || !Array.isArray(r.body)) return [];
  const list = r.body.slice().sort((a, b) => newer(a.id, b.id) ? 1 : -1);
  const out = [], now = Date.now();
  for (const m of list) {
    if (WATCH.seen.has(m.id)) { bumpLast(c.id, m.id); continue; }       // подключение уже принесло
    const age = now - Date.parse(m.timestamp);
    if (live && age < MSG_GRACE_MS) break;                              // пусть подключение принесёт само; спросим в следующий раз
    if (age > BACKLOG_MS) { WATCH.seen.add(m.id); bumpLast(c.id, m.id); continue; }   // слишком старое — после долгого простоя
    out.push(m);
  }
  if (out.length) WATCH.hot.set(c.id, now);
  return out;
}

async function catchUpRound() {
  if (WATCH.busy || rest) return;
  WATCH.busy = true;
  try {
    const now = Date.now(), live = !!(gw && gw.state === 'ready'), quiet = WATCH.rounds % QUIET_EVERY === 0;
    for (const g of guilds.values()) {
      const chans = [...g.channels.values()].filter(c => TEXT_TYPES.has(c.type) && !((WATCH.blocked.get(c.id) || 0) > now) &&
                                                        (quiet || now - (WATCH.hot.get(c.id) || 0) < HOT_MS));
      for (let i = 0; i < chans.length; i += 10) {
        const got = await Promise.all(chans.slice(i, i + 10).map(c => readNew(c, live).catch(() => [])));
        for (const list of got) for (const m of list) {
          m.guild_id = g.id;
          if (m.author && !m.author.bot) m.member = await memberOf(g.id, m.author.id).catch(() => null) || undefined;
          await onMessage(m, false, 'catchup').catch(e => log('message check failed:', e.message));
          // отправлено, когда подключение уже было «в сети», а оно не принесло — потеряно им; то, что пришло, пока бот
          // был выключен или переподключался, — не в счёт
          if (live && Date.parse(m.timestamp) > WATCH.readyAt + 3000) noteMiss(now);
        }
      }
    }
    WATCH.rounds++;
    WATCH.lastRound = Date.now();
  } finally { WATCH.busy = false; }
}

// живое подключение не принесло сообщение, хотя «в сети»: два раза за 10 минут — переподключаем его (не чаще раза в 2 минуты)
function noteMiss(now) {
  WATCH.missed++;
  WATCH.misses = WATCH.misses.filter(t => now - t < 10 * 60 * 1000);
  WATCH.misses.push(now);
  if (WATCH.misses.length >= 2 && gw && now - WATCH.lastKick > 120000) {
    WATCH.lastKick = now;
    log('the live connection missed messages, reconnecting');
    gw.drop(4903, 'messages were missed');
  }
}

// открытые ветки сервера: в них живое подключение сообщения присылает не всегда
async function watchThreads() {
  if (rest) return;
  for (const g of guilds.values()) {
    const r = await api('GET', '/guilds/' + g.id + '/threads/active');
    if (!ok(r) || !r.body || !Array.isArray(r.body.threads)) continue;
    const seen = new Set();
    for (const t of r.body.threads) {
      seen.add(t.id);
      // ветка появилась уже после запуска — проверяем всё с её первого сообщения
      if (!g.channels.has(t.id) && !WATCH.last.has(t.id) && createdAt(t.id) >= WATCH.since) { WATCH.last.set(t.id, '0'); WATCH.dirty = true; }
      g.channels.set(t.id, chan(t));
    }
    for (const [id, c] of [...g.channels]) if (THREAD_TYPES.has(c.type) && !seen.has(id)) g.channels.delete(id);
  }
}

function flushWatch() {
  if (!WATCH.dirty) return;
  WATCH.dirty = false;
  const keep = {};
  for (const [k, v] of WATCH.last) keep[k] = v;
  state.watch = { last: keep };
  save();
}

function watchStart() {
  Object.assign(WATCH, { seen: new Set(), last: new Map(Object.entries((state.watch && state.watch.last) || {})), hot: new Map(), blocked: new Map(),
                         misses: [], members: new Map(), since: Date.now(), rounds: 0, lastRound: 0, checked: 0, fromGateway: 0, fromCatchUp: 0,
                         missed: 0, lastMessage: 0, lastKick: 0, readyAt: 0, dirty: false, busy: false });
}

// участники: кто зашёл (в режиме запросов)
async function pollMembers(g, first) {
  if (!rest || (!first && gw && gw.state === 'ready')) return;
  const all = new Map();
  let after = '0';
  for (let page = 0; page < 20; page++) {
    const r = await api('GET', '/guilds/' + g.id + '/members?limit=1000&after=' + after);
    if (!ok(r) || !Array.isArray(r.body)) return;
    r.body.forEach(m => { if (m.user) all.set(m.user.id, m); });
    if (r.body.length < 1000) break;
    after = r.body[r.body.length - 1].user.id;
  }
  const old = rest.members.get(g.id);
  rest.members.set(g.id, all);
  for (const [uid, m] of all) {
    const d = Object.assign({ guild_id: g.id }, m);
    if (!first && !old.has(uid)) await onMemberAdd(d).catch(() => {});
  }
}

async function pollBans(g) {
  if (!rest) return;
  const r = await api('GET', '/guilds/' + g.id + '/bans?limit=1000');
  if (!ok(r) || !Array.isArray(r.body)) return;
  const known = new Set((state.banned[g.id] || []).map(b => b.id));
  r.body.forEach(b => { if (b.user && !known.has(b.user.id)) rememberBan(g.id, b.user); });
}

// подпись Discord: Ed25519, ключ приложения, «время + тело запроса»
function signedByDiscord(req, body) {
  const sig = String(req.headers['x-signature-ed25519'] || ''), ts = String(req.headers['x-signature-timestamp'] || '');
  if (!verifyKey || !/^[0-9a-f]{128}$/i.test(sig) || !ts) return false;
  try {
    const key = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(verifyKey, 'hex')]),
                                         format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.concat([Buffer.from(ts), body]), key, Buffer.from(sig, 'hex'));
  } catch (e) { return false; }
}

async function onHttpInteraction(req, res) {
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : '');
  if (!verifyKey && token()) await loadApp().catch(() => null);
  if (!signedByDiscord(req, body)) return res.status(401).end('invalid request signature');
  let i;
  try { i = JSON.parse(body.toString('utf8')); } catch (e) { return res.status(400).end(); }
  if (i.type === 1) return res.json({ type: 1 });            // проверка адреса самим Discord
  i._http = res;
  await onInteraction(i).catch(e => log('command failed:', e.message));
  if (!res.headersSent) res.status(204).end();
}

/* ---------- подключение ---------- */
async function setupGuild(g) {
  if (setupDone.has(g.id)) return;
  setupDone.add(g.id);
  try {
    await clearSlashCommands(g);
    await syncGlobalCommands();
    await ensureNativeAutomod(g);
    await postDefaultRules(g);
  } catch (e) { log('setup failed for ' + g.name + ':', e.message); setupDone.delete(g.id); }
}

function onDispatch(t, d) {
  switch (t) {
    case 'READY':
      WATCH.readyAt = Date.now();
      me = d.user;
      appId = d.application && d.application.id;
      log('connected as ' + (me && me.username));
      useLiveInteractions().catch(e => log('could not switch commands to the live connection:', e.message));
      break;
    case 'RESUMED': WATCH.readyAt = Date.now(); break;
    case 'GUILD_CREATE': if (!d.unavailable) setupGuild(cacheGuild(d)); break;
    case 'GUILD_UPDATE': { const g = guilds.get(d.id); if (g) { g.name = d.name; g.owner = d.owner_id; } break; }
    case 'GUILD_DELETE': if (!d.unavailable) { guilds.delete(d.id); setupDone.delete(d.id); } break;
    case 'GUILD_ROLE_CREATE': case 'GUILD_ROLE_UPDATE': {
      const g = guilds.get(d.guild_id);
      if (g && d.role) g.roles.set(d.role.id, { perms: BigInt(d.role.permissions || '0'), name: d.role.name });
      break;
    }
    case 'GUILD_ROLE_DELETE': { const g = guilds.get(d.guild_id); if (g) g.roles.delete(d.role_id); break; }
    case 'CHANNEL_CREATE': case 'CHANNEL_UPDATE': case 'THREAD_CREATE': case 'THREAD_UPDATE': {
      const g = guilds.get(d.guild_id);
      if (g) g.channels.set(d.id, chan(d));
      break;
    }
    case 'CHANNEL_DELETE': case 'THREAD_DELETE': { const g = guilds.get(d.guild_id); if (g) g.channels.delete(d.id); break; }
    case 'MESSAGE_CREATE': onMessage(d, false).catch(e => log('message check failed:', e.message)); break;
    case 'GUILD_MEMBER_ADD': onMemberAdd(d).catch(e => log('member check failed:', e.message)); break;
    case 'GUILD_BAN_ADD': rememberBan(d.guild_id, d.user); break;
    // правка сообщения проверяется так же: иначе нарушение дописали бы позже
    // (без edited_timestamp это Discord дорисовал превью ссылки, а не правка)
    case 'MESSAGE_UPDATE': if (typeof d.content === 'string' && d.author && d.edited_timestamp) onMessage(d, true).catch(() => {}); break;
    case 'AUTO_MODERATION_ACTION_EXECUTION': onAutomodExecution(d).catch(e => log('automod event failed:', e.message)); break;
    case 'INTERACTION_CREATE': onInteraction(d).catch(e => log('command failed:', e.message)); break;
  }
}

function connect(intents) {
  gw = new Gateway({ token: token(), intents, relay: relayOn() ? RELAY : null,
    presence: { since: null, afk: false, status: 'online', activities: [{ name: 'aibrofist.online', type: 3 }] } });
  gw.on('dispatch', onDispatch);
  // ошибки подключения — в журнал хостинга (каждая разная по одному разу),
  // остальное — только с DISCORD_DEBUG
  gw.on('debug', m => {
    if (process.env.DISCORD_DEBUG) log(m);
    else if (/error|closed|failed/i.test(m)) once('gw:' + m.replace(/\d+ ms$/, ''), 'gateway: ' + m);
  });
  gw.on('fatal', (code, why) => log('gateway stopped (' + code + ' ' + why + '): check DISCORD_BOT_TOKEN'));
  gw.on('disallowed', () => {
    // «Message Content Intent» не включён в настройках бота — работаем без
    // чтения текста: встроенная AutoMod, флуд и картинки остаются
    log('Message Content or Server Members Intent is off in the Discord Developer Portal (Bot tab): ' +
        'text and member checks are paused until both are enabled');
    gw.removeAllListeners();
    connect(intents & ~PRIVILEGED);
  });
  gw.connect();
}

function start() {
  if (!token() || gw) return;
  log('starting the bot');
  loadState();
  watchStart();
  checkCdn();                        // заранее знать, можно ли скачивать картинки с CDN Discord
  connect(ALL_INTENTS);
  // живое подключение не открылось — работаем запросами (см. выше)
  const t0 = setTimeout(() => { if (gw && gw.state !== 'ready') startRest().catch(e => log('requests mode failed:', e.message)); }, REST_AFTER_MS);
  if (t0.unref) t0.unref();
  timers.push(t0);
  // второй канал чтения сообщений — всегда, раз в секунду (см. «ловец сообщений» выше)
  const tw = setInterval(() => catchUpRound().catch(e => once('watch:' + e.message, 'message catch-up failed:', e.message)), POLL_MS);
  const tth = setInterval(() => watchThreads().catch(e => once('threads:' + e.message, 'thread check failed:', e.message)), THREADS_MS);
  const tf = setInterval(flushWatch, 5000);
  [tw, tth, tf].forEach(t => { if (t.unref) t.unref(); timers.push(t); });
  const t1 = setInterval(() => {
    flood.sweep();
    const now = Date.now();
    for (const [k, v] of lastHit) if (now - v.t > COOLDOWN) lastHit.delete(k);
    releaseBans().catch(e => log('unban failed:', e.message));
  }, 60000);
  if (t1.unref) t1.unref();
  timers.push(t1);
}

function stop() {
  if (gw) { gw.removeAllListeners(); gw.destroy(); gw = null; }
  timers.forEach(t => { clearInterval(t); clearTimeout(t); }); timers = [];
  stopRest();
  flushWatch();
  saveNow();
  guilds.clear(); setupDone.clear(); lastHit.clear();
}

/* Страница состояния бота: /discord/status. Открыта всем, поэтому в ней
   нет секретов — ни токена, ни начала команд, ни штрафов игроков; только
   задан ли токен, подключён ли бот и что ему мешает (почему «не в сети»
   или не пишет в канал). */
// коротко для страницы статистики серверов (serversInfo.js)
function statusBrief() {
  return { mode: gw && gw.state === 'ready' ? 'live' : rest ? 'requests' : token() ? 'starting' : 'off', guilds: guilds.size };
}

async function status() {
  const out = { token: !!token(), prefix: !!String(process.env.DISCORD_CMD_PREFIX || '').trim(), problems: [] };
  if (!out.token) out.problems.push('DISCORD_BOT_TOKEN is not set on the hosting (or the site was not restarted after setting it).');
  out.mode = gw && gw.state === 'ready' ? 'live' : rest ? 'requests' : 'starting';
  const ago = t => t ? Math.round((Date.now() - t) / 1000) + 's ago' : 'never';
  if (rest) {
    let channels = 0;
    for (const g of guilds.values()) for (const c of g.channels.values()) if (TEXT_TYPES.has(c.type) && !((rest.blocked.get(c.id) || 0) > Date.now())) channels++;
    out.reading = { channels, rounds: rest.rounds, lastRound: ago(rest.lastRound), lastCommand: ago(lastCommandAt) };
    const idle = Date.now() - (rest.lastRound || rest.since);
    if (idle > 90000) out.problems.push('The bot has not read new messages for ' + Math.round(idle / 1000) + ' seconds.');
  }
  if (gw) {
    out.gateway = { state: gw.state, intents: gw.intents, lastClose: gw.lastClose, lastError: gw.lastError };
    if (gw.state !== 'ready' && !rest) out.problems.push('Not connected to Discord yet: ' +
      (gw.lastError ? gw.lastError.message : gw.lastClose ? 'closed with code ' + gw.lastClose.code : 'connecting'));
    if ((gw.intents & PRIVILEGED) !== PRIVILEGED) out.problems.push('Message Content or Server Members Intent is off in the Developer Portal.');
  }
  out.bot = me ? me.username : null;
  // видно, что бот читает сообщения прямо сейчас: сколько разобрано, кем принесено, когда последнее
  out.watching = { messagesChecked: WATCH.checked, fromLiveConnection: WATCH.fromGateway, fromSecondReader: WATCH.fromCatchUp,
                   lostByLiveConnection: WATCH.missed, lastMessage: ago(WATCH.lastMessage), secondReader: rest ? 'requests mode' : ago(WATCH.lastRound),
                   rounds: WATCH.rounds, every: Math.round(POLL_MS / 100) / 10 + 's' };
  if (!rest && guilds.size && WATCH.since && Date.now() - Math.max(WATCH.lastRound, WATCH.since) > 30000)
    out.problems.push('The second message reader has not run for ' + Math.round((Date.now() - Math.max(WATCH.lastRound, WATCH.since)) / 1000) + ' seconds.');
  out.guilds = [...guilds.values()].map(g => ({ id: g.id, name: g.name }));
  const feed = require('./updatesFeed.js');
  out.updates = feed.status();
  if (out.token) out.updates.channels = await feed.channels().catch(() => []);
  if (out.token) {
    checkCdn();
    out.cdn = cdn.ok === null ? 'not checked yet' : cdn.ok ? 'ok' : 'unreachable: ' + cdn.error;
    out.relay = relayOn() ? 'on' : 'off';
    if (cdn.ok === false) out.problems.push(relayOn()
      ? 'The Cloudflare helper does not answer (' + cdn.error + '): check DISCORD_RELAY_URL and DISCORD_RELAY_KEY on the hosting and RELAY_KEY in Cloudflare.'
      : 'The site cannot download images from Discord (' + cdn.error + '): pictures added in the post editor are shown by link ' +
        'and may disappear later, and pictures are not checked. Set up the Cloudflare helper (DISCORD_RELAY_URL, DISCORD_RELAY_KEY).');
  }
  const e = out.updates.lastError;
  if (e && e.status === 403) out.problems.push('The bot cannot write in the updates channel ' + e.channel +
    ': allow it to send messages and embed links there (or give its role Administrator).');
  if (!out.problems.length) out.problems.push('none');
  return out;
}

function register(app) {
  app.post('/discord/interactions', (req, res) => { onHttpInteraction(req, res).catch(() => { if (!res.headersSent) res.status(500).end(); }); });
  app.get('/discord/status', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await status().catch(e => ({ error: e.message })));
  });
}

// каналы для новостей (updatesFeed.js): выбранные командой !updates
function feedChannels() {
  loadState();
  return state.feed.slice();
}

module.exports = { start, stop, feedChannels, register, status, statusBrief, startRest, _test: { state: () => state, guilds, punish, releaseBans, imageVerdict, reload: () => { loaded = false; loadState(); } } };
