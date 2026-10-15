// ============ DISCORD-БОТ: правила, автомодерация, команды ============
// Работает, только если на хостинге задан DISCORD_BOT_TOKEN; без него
// модуль ничего не делает. Что умеет:
//   - автомодерация: проверяет каждое сообщение (discordAutomod.js),
//     удаляет нарушения, даёт штрафные баллы и наказывает по лестнице из
//     discordRules.js — предупреждение, мьюты, бан только в крайнем случае;
//     следит и за участниками: ники, аватарки 18+, рейды (много входов
//     сразу), обход бана с другого аккаунта, ссылки от только что
//     зашедших новых аккаунтов;
//     дополнительно включает встроенную AutoMod Discord, которая не даёт
//     отправить оскорбления и спам упоминаниями вовсе;
//   - пишет игроку в личку, за что и как он наказан, а модераторам — в
//     канал mod-log (если он есть);
//   - секретные команды владельца сервера прямо в канале (начало команд —
//     DISCORD_CMD_PREFIX на хостинге): news (пост в любой канал с
//     картинками и кнопкой-ссылкой — в окне, которое видит только он),
//     updates (в какие каналы идут новости), warn, mute, unmute, strikes,
//     pardon, modlog, help. Остальным они не видны и не работают.
// Правила сервера владелец пишет в #rules сам; номера правил в
// уведомлениях бота — из discordRules.js.
// Новости в #updates публикует updatesFeed.js — каналы для них берёт отсюда.
// Состояние — data/discordBot.json.
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { api, ok, token, frame } = require('./discordApi.js');
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
const STAFF = PERM.ADMIN | PERM.MANAGE_GUILD | PERM.MANAGE_MESSAGES | PERM.MODERATE | PERM.KICK | PERM.BAN;

const COOLDOWN = 30 * 1000;      // за одну волну спама — одно наказание, а не восемь
const NEWBIE_MS = 10 * 60 * 1000; // новые аккаунты первые 10 минут на сервере не шлют ссылки
const RAID_JOINS = 10;            // столько входов за минуту — рейд
const RAID_MS = 10 * 60 * 1000;
const WEEK = 7 * 24 * 60 * 60 * 1000;
const NOTICE_MS = 10 * 1000;     // короткое предупреждение в канале исчезает само

// banned — приметы забаненных (аватарка, имя): по ним ловим обход бана
let state = { feed: [], guilds: {}, strikes: {}, cases: 0, banned: {}, unbans: {} };
let loaded = false, saveTimer = null;
const guilds = new Map();        // id -> { id, name, owner, roles: Map, channels: Map }
const setupDone = new Set();
const lastHit = new Map();       // guild:user -> { t, weight }
const inviteCache = new Map();   // код приглашения -> { guild, t }
const dmChannels = new Map();
const said = new Set();          // какие подсказки владельцу уже были в журнале
const flood = new A.FloodWatch();
const flaggedAvatars = new Map(); // guild:user -> аватарка 18+, которую ещё не сменили
const avatarSeen = new Map();     // guild:user -> какую аватарку уже проверили
const nameSeen = new Map();       // guild:user -> какой ник уже разобрали
const joins = new Map();          // guild -> времена входов за последнюю минуту
const raidUntil = new Map();
const softHit = new Map();        // guild:user -> когда последний раз писали «подожди»
let gw = null, me = null, appId = null, timers = [];

const log = (...a) => console.log('[discord]', ...a);
const once = (key, ...a) => { if (!said.has(key)) { said.add(key); log(...a); } };

/* ---------- состояние ---------- */
function loadState() {
  if (loaded) return;
  loaded = true;
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    state = {
      feed: Array.isArray(s.feed) ? s.feed.filter(x => /^\d+$/.test(x)) : [],
      guilds: s.guilds && typeof s.guilds === 'object' ? s.guilds : {},
      strikes: s.strikes && typeof s.strikes === 'object' ? s.strikes : {},
      cases: Number(s.cases) || 0,
      banned: s.banned && typeof s.banned === 'object' ? s.banned : {},
      unbans: s.unbans && typeof s.unbans === 'object' ? s.unbans : {}     // «сервер:игрок» -> когда снять бан
    };
  } catch (e) { /* первый запуск */ }
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


/* ---------- штрафные баллы ---------- */
function activeStrikes(gid, uid) {
  const key = gid + ':' + uid, now = Date.now();
  const list = (state.strikes[key] || []).filter(s => now - s.t < R.STRIKE_TTL);
  if (list.length) state.strikes[key] = list; else delete state.strikes[key];
  return list;
}
const points = list => list.reduce((n, s) => n + s.p, 0);

function addStrike(gid, uid, f, by) {
  const list = activeStrikes(gid, uid);
  list.push({ t: Date.now(), p: f.weight, r: f.rule || 0, k: f.kind, by: by || 'auto' });
  state.strikes[gid + ':' + uid] = list;
  save();
  return points(list);
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
const chan = c => ({ id: c.id, name: String(c.name || ''), type: c.type, nsfw: !!c.nsfw, parent: c.parent_id || null });

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

/* ---------- отправка ---------- */
async function sendMessage(channel, body, reason) {
  const r = await api('POST', '/channels/' + channel + '/messages', body, { reason });
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

async function dm(uid, body) {
  let ch = dmChannels.get(uid);
  if (!ch) {
    const r = await api('POST', '/users/@me/channels', { recipient_id: uid });
    if (!ok(r) || !r.body) return false;
    ch = r.body.id;
    dmChannels.set(uid, ch);
  }
  const r = await api('POST', '/channels/' + ch + '/messages', body);
  return ok(r);          // 403 — у игрока закрыты личные сообщения
}

async function notice(channel, uid, text) {
  const r = await sendMessage(channel, { content: '<@' + uid + '>, ' + text, allowed_mentions: { users: [uid] } });
  if (ok(r) && r.body && r.body.id) {
    const t = setTimeout(() => api('DELETE', '/channels/' + channel + '/messages/' + r.body.id).catch(() => {}), NOTICE_MS);
    if (t.unref) t.unref();
  }
}

const quote = s => String(s || '').replace(/```/g, "'''").replace(/\s+\n/g, '\n').slice(0, 300);
const color = step => !step ? R.COLORS.neutral : step.type === 'ban' ? R.COLORS.ban : step.type === 'mute' ? R.COLORS.mute : R.COLORS.warn;
const ruleLine = id => { const r = R.ruleById(id); return r ? r.id + '. ' + r.title : 'Moderator decision'; };

async function modlog(g, entry) {
  const ch = modlogChannel(g);
  if (!ch) return;
  const fields = [
    { name: 'User', value: '<@' + entry.user + '> (' + entry.user + ')', inline: true },
    { name: 'By', value: entry.by ? '<@' + entry.by + '>' : 'Automod', inline: true }
  ];
  if (entry.rule !== undefined) fields.push({ name: 'Rule', value: entry.ruleText || ruleLine(entry.rule), inline: true });
  if (entry.reason) fields.push({ name: 'Reason', value: String(entry.reason).slice(0, 1000) });
  if (entry.strikes !== undefined) fields.push({ name: 'Active strikes', value: String(entry.strikes), inline: true });
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

/* Штраф + наказание по лестнице. f — находка ({rule, weight, kind, note}),
   ctx.by — модератор (для /warn), ctx.channel — где было нарушение,
   ctx.silent — не писать в канал (сообщение и так не появилось),
   ctx.until — до какого времени игрок уже в мьюте (короче не делаем). */
async function punish(g, user, f, ctx) {
  ctx = ctx || {};
  const total = addStrike(g.id, user.id, f, ctx.by);
  const step = R.punishmentFor(total);
  const caseNo = ++state.cases;
  save();
  const rule = R.ruleById(f.rule);
  const ruleText = rule ? rule.id + '. ' + rule.title : f.kind === 'custom' ? 'Server rules' : 'Moderator decision';
  const action = R.describe(step);
  const why = f.note + (f.detail ? ' (' + f.detail + ')' : '');
  const reason = 'Case ' + caseNo + ': ' + (rule ? 'rule ' + rule.id + ', ' : '') + why;

  // личное сообщение — до бана, иначе оно уже не дойдёт
  await dm(user.id, { embeds: [{
    color: color(step),
    title: step.type === 'ban' ? (step.ms ? 'You have been banned for ' + R.duration(step.ms) : 'You have been banned permanently')
         : step.type === 'mute' ? 'You have been muted' : 'Warning',
    description: ctx.dm || ((ctx.by ? 'A moderator of **' : 'Your message in **') + g.name + (ctx.by ? '** gave you a strike.' : '** was removed.')),
    fields: [
      { name: 'Rule', value: ruleText, inline: true },
      { name: 'Action', value: action, inline: true },
      { name: 'Reason', value: why.slice(0, 1000) },
      { name: 'Active strikes', value: total + ' (each strike expires after 30 days)' }
    ],
    footer: { text: 'If you think this is a mistake, message a moderator.' }
  }] }).catch(() => false);

  let done = true;
  if (step.type === 'mute') {
    // уже замьючен дольше (например, модератором на неделю) — не сокращаем
    if (!(ctx.until && ctx.until > Date.now() + step.ms)) done = await timeout(g, user.id, step.ms, reason);
  }
  else if (step.type === 'ban') {
    done = await ban(g, user.id, reason);
    if (done) setUnban(g.id, user.id, step.ms);
  }

  if (ctx.channel && !ctx.silent && step.type !== 'ban') {
    const what = ctx.by ? 'you received a strike' : 'your message was removed';
    await notice(ctx.channel, user.id, what + (rule ? ': rule ' + rule.id + ', ' + rule.title.toLowerCase() : '') +
                 '. ' + action + ', ' + R.strikes(total) + '.').catch(() => {});
  }
  await modlog(g, { caseNo, title: action + (done ? '' : ' (failed: no permission)'), color: color(step),
                    user: user.id, by: ctx.by, rule: f.rule || 0, ruleText, reason: why, strikes: total,
                    channel: ctx.channel, excerpt: ctx.excerpt }).catch(() => {});
  return { step, total, caseNo, done };
}

// нарушение в сообщении: удалить и — если это не та же волна — наказать
async function enforce(g, m, f) {
  // решаем сразу, до ожидания сети: сообщения волны приходят почти разом
  const key = g.id + ':' + m.author.id, now = Date.now();
  const last = lastHit.get(key);
  const repeat = !!(last && now - last.t < COOLDOWN && last.weight >= f.weight);
  if (!repeat) lastHit.set(key, { t: now, weight: f.weight });
  const msgs = f.messages && f.messages.length ? f.messages : [{ id: m.id, channel: m.channel_id }];
  await deleteMessages(msgs, f.note).catch(e => log('delete failed:', e.message));
  if (repeat) return null;
  const until = Date.parse(m.member && m.member.communication_disabled_until) || 0;
  return punish(g, m.author, f, { channel: m.channel_id, excerpt: m.content, until });
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

function download(url, limit) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const test = TEST_CDN && u.protocol === 'http:' && u.host === TEST_CDN;
    if (!test && (u.protocol !== 'https:' || !CDN.test(u.hostname))) return reject(new Error('not a Discord CDN url'));
    const req = (test ? require('http') : https).get(u, { family: 4, timeout: 15000 }, res => {
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
  if (process.env.DISCORD_API_BASE && !TEST_CDN) return;          // тесты без своего CDN
  cdn.at = Date.now();
  const url = TEST_CDN ? 'http://' + TEST_CDN + '/cdn/pic.png' : 'https://cdn.discordapp.com/embed/avatars/0.png';
  download(url, 1024 * 1024).then(() => { cdn.ok = true; cdn.error = ''; }, e => { cdn.ok = false; cdn.error = e.message; });
}

function queueImages(g, m) {
  const pics = (m.attachments || []).filter(a => a && /^image\/(png|jpeg|gif)/.test(a.content_type || '') && (a.size || 0) <= 10 * 1024 * 1024);
  if (!pics.length || imgQueue.length > 10) return;
  imgQueue.push({ g, m, pics: pics.slice(0, 4) });
  pumpImages();
}

const isAdult = s => { const porn = s.Porn || 0, hentai = s.Hentai || 0; return porn >= 0.85 || hentai >= 0.85 || porn + hentai >= 0.92; };

async function pumpImages() {
  if (imgBusy) return;
  imgBusy = true;
  try {
    while (imgQueue.length) {
      const job = imgQueue.shift();
      if (job.avatar) { await checkAvatar(job).catch(e => once('img:' + e.message, 'avatar check skipped:', e.message)); continue; }
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
          if (isAdult(await img.nsfwScores(decoded))) {
            await enforce(job.g, job.m, A.finding('nsfw-image'));
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
async function onMessage(m, edited) {
  if (!m || !m.guild_id || !m.author || m.author.bot || m.webhook_id) return;
  if (m.type !== undefined && m.type !== 0 && m.type !== 19) return;   // обычное сообщение и ответ
  if (edited && !(m.member && m.member.roles)) return;   // без ролей не отличить модератора
  const g = guilds.get(m.guild_id);
  if (!g) return;
  if (!edited && m.author.id === g.owner && /^!/.test(m.content || '') && await onOwnerCommand(g, m)) return;
  if (memberPerms(g, m.author.id, m.member && m.member.roles) & STAFF) return;   // модераторов не трогаем
  const ch = channelInfo(g, m.channel_id);
  const allowAds = /promo|advert|реклам|самопиар/i.test(ch.name);
  const key = g.id + ':' + m.author.id;

  // аватарка 18+ ещё не сменена — писать нельзя, пока не сменит (без новых баллов)
  const avatar = (m.member && m.member.avatar) || m.author.avatar;
  queueAvatar(g, { user: m.author, avatar: m.member && m.member.avatar });   // кто пишет — проверим и аватарку
  if (avatar && flaggedAvatars.get(key) === avatar)
    return softRemove(m, 'please change your avatar first, it breaks rule 4.');
  // совсем новый аккаунт только что зашёл и сразу шлёт ссылку — так пишут спам-боты
  const joined = Date.parse(m.member && m.member.joined_at) || 0;
  if (!edited && joined && Date.now() - joined < NEWBIE_MS && accountAge(m.author.id) < WEEK &&
      A.links(m.content).some(l => l.explicit))
    return softRemove(m, 'new members can post links 10 minutes after joining.');

  const found = A.inspect(m, { nsfw: ch.nsfw });
  const custom = A.checkCustom(m.content, gstate(g.id).words);
  if (custom) found.push(custom);
  // «мне 11 лет» — не наказание, а сообщение владельцу: решать ему
  const young = found.findIndex(f => f.kind === 'underage');
  if (young !== -1) {
    found.splice(young, 1);
    if (!edited) alert(g, 'Possibly under 13', '<@' + m.author.id + '> wrote in <#' + m.channel_id + '>:\n>>> ' + quote(m.content) +
                       '\n\nDiscord does not allow accounts of people under 13.').catch(() => {});
  }
  if (!edited) {
    // время — из самого сообщения: без живого подключения они приходят пачками
    const fl = flood.add(m.guild_id + ':' + m.author.id, Object.assign({}, m, { t: Date.parse(m.timestamp) || Date.now() }));
    if (fl) found.push(A.finding(fl.kind, { messages: fl.messages }));
  }
  found.sort((a, b) => b.weight - a.weight);
  if (found.length) return enforce(g, m, found[0]);

  if (!allowAds) {
    const codes = A.inviteCodes(m.content);
    if (codes.length) {
      const code = await foreignInvite(g, codes).catch(() => null);
      if (code) return enforce(g, m, A.finding('invite', { detail: 'discord.gg/' + code }));
    }
  }
  if (SCAN_IMAGES && !ch.nsfw && !edited) queueImages(g, m);
}

/* Встроенная AutoMod Discord уже не дала отправить сообщение — бот только
   засчитывает нарушение по той же лестнице и пишет игроку, за что. */
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

  let f;
  if (d.rule_trigger_type === 5) f = A.finding('mentions');
  else if (d.rule_trigger_type === 3) f = A.finding('native-spam');
  else if (d.rule_trigger_type === 4) {
    const w = A.checkWords({ content: d.content || d.matched_content || '' });
    f = w.length && w[0].kind === 'slur' ? A.finding('slur') : A.finding('nsfw-text');
  } else f = A.finding('native-word', { detail: d.matched_keyword || undefined });

  const hk = g.id + ':' + d.user_id, last = lastHit.get(hk);
  if (last && now - last.t < COOLDOWN && last.weight >= f.weight) return;
  lastHit.set(hk, { t: now, weight: f.weight });
  await punish(g, { id: d.user_id }, f, { channel: d.channel_id, excerpt: d.content, silent: true });
}

/* ---------- участники: ники, аватарки, рейды, обход бана ---------- */
const DISCORD_EPOCH = 1420070400000n;
// возраст аккаунта по его id (в id зашито время создания)
const accountAge = id => /^\d{15,}$/.test(String(id)) ? Date.now() - Number((BigInt(id) >> 22n) + DISCORD_EPOCH) : Infinity;

// удалить сообщение и коротко объяснить почему — без баллов (раз в 30 секунд)
async function softRemove(m, text) {
  await api('DELETE', '/channels/' + m.channel_id + '/messages/' + m.id).catch(() => {});
  const key = m.guild_id + ':' + m.author.id, now = Date.now();
  if (now - (softHit.get(key) || 0) < COOLDOWN) return;
  softHit.set(key, now);
  await notice(m.channel_id, m.author.id, text).catch(() => {});
}

async function alert(g, title, text) {
  const ch = modlogChannel(g);
  if (!ch) return;
  await sendMessage(ch, { embeds: [{ color: R.COLORS.warn, title: 'Alert | ' + title, description: text,
                                     timestamp: new Date().toISOString() }], allowed_mentions: { parse: [] } });
}

const displayName = d => d.nick || (d.user && (d.user.global_name || d.user.username)) || '';

async function checkName(g, d) {
  const uid = d.user.id, shown = displayName(d), key = g.id + ':' + uid;
  if (nameSeen.get(key) === shown) return;            // этот ник уже разобран
  nameSeen.set(key, shown);
  const v = A.checkName(shown, { owner: g.ownerName });
  if (!v) return;
  const nick = v.kind === 'hoist' && v.clean ? v.clean : 'Player ' + uid.slice(-4);
  const why = v.kind === 'impersonation' ? 'pretending to be staff' : v.kind === 'bad-name' ? 'inappropriate name' : 'unreadable name';
  const r = await api('PATCH', '/guilds/' + g.id + '/members/' + uid, { nick }, { reason: 'Rule 9: ' + why });
  if (r.status === 403) once('nonick:' + g.id, 'cannot change nicknames in ' + g.name + ': give the bot Manage Nicknames and move its role above member roles');
  nameSeen.set(key, nick);
  if (v.kind === 'bad-name' || v.kind === 'impersonation') {
    await punish(g, d.user, A.finding(v.kind, { detail: shown.slice(0, 60) }), { silent: true,
      dm: 'Your name in **' + g.name + '** breaks the rules, so it was changed to "' + nick + '".' });
  }
}

function queueAvatar(g, d) {
  const key = g.id + ':' + d.user.id, hash = d.avatar || d.user.avatar;
  if (!hash) { flaggedAvatars.delete(key); return; }
  if (avatarSeen.get(key) === hash) return;
  if (flaggedAvatars.has(key) && flaggedAvatars.get(key) !== hash) flaggedAvatars.delete(key);   // сменил
  if (SCAN_IMAGES && imgQueue.length > 20) return;     // очередь полна — проверим в другой раз
  avatarSeen.set(key, hash);
  if (!SCAN_IMAGES) return;
  const url = d.avatar ? 'https://cdn.discordapp.com/guilds/' + g.id + '/users/' + d.user.id + '/avatars/' + hash + '.png?size=256'
                       : 'https://cdn.discordapp.com/avatars/' + d.user.id + '/' + hash + '.png?size=256';
  imgQueue.push({ avatar: true, g, user: d.user, hash, url });
  pumpImages();
}

async function checkAvatar(job) {
  const { buf, type } = await download(job.url, 4 * 1024 * 1024);
  if (type !== 'image/png') return;
  const img = require('./imgModeration.js');
  const decoded = img.decodeImage(buf, 'png');
  if (!decoded || !decoded.frames || !isAdult(await img.nsfwScores(decoded))) return;
  flaggedAvatars.set(job.g.id + ':' + job.user.id, job.hash);
  await punish(job.g, job.user, A.finding('nsfw-avatar'), { silent: true,
    dm: 'Your avatar in **' + job.g.name + '** breaks rule 4. Change it: until then your messages there are removed.' });
}

// много входов за минуту — рейд: новые аккаунты на 10 минут получают мьют на час
async function trackJoin(g, d) {
  const now = Date.now();
  const list = (joins.get(g.id) || []).filter(t => now - t < 60000);
  list.push(now);
  joins.set(g.id, list);
  if (list.length >= RAID_JOINS && !((raidUntil.get(g.id) || 0) > now)) {
    raidUntil.set(g.id, now + RAID_MS);
    alert(g, 'Raid', list.length + ' members joined within a minute. For the next 10 minutes accounts younger ' +
                     'than a week are muted for an hour when they join.').catch(() => {});
  }
  if ((raidUntil.get(g.id) || 0) > now && accountAge(d.user.id) < WEEK) await timeout(g, d.user.id, R.HOUR, 'Raid protection');
}

// приметы забаненного: аватарка и имя — по ним узнаём его второй аккаунт
function rememberBan(gid, user) {
  if (!user || (!user.avatar && !user.username)) return;
  const list = (state.banned[gid] || []).filter(b => b.id !== user.id);
  list.push({ id: user.id, a: user.avatar || null, n: String(user.global_name || user.username || '').toLowerCase(), t: Date.now() });
  state.banned[gid] = list.slice(-500);
  save();
}

async function checkEvasion(g, d) {
  const list = state.banned[g.id] || [];
  const u = d.user, name = String(u.global_name || u.username || '').toLowerCase();
  const same = u.avatar && list.find(b => b.a && b.a === u.avatar && b.id !== u.id);
  if (same) {
    // та же картинка аватарки, что у забаненного, — это он
    const caseNo = ++state.cases;
    save();
    const done = await ban(g, u.id, 'Case ' + caseNo + ': rule 11, ban evasion');
    await modlog(g, { caseNo, title: 'Ban (ban evasion)' + (done ? '' : ' (failed: no permission)'), color: R.COLORS.ban,
                      user: u.id, rule: 11, reason: 'Same avatar as banned member <@' + same.id + '>' });
    return true;
  }
  const alike = name.length >= 4 && list.find(b => b.n === name && b.id !== u.id);
  if (alike) alert(g, 'Possible second account', '<@' + u.id + '> has the same name as banned member <@' + alike.id + '>.').catch(() => {});
  return false;
}

async function onMemberAdd(d) {
  const g = guilds.get(d.guild_id);
  if (!g || !d.user || d.user.bot) return;
  await trackJoin(g, d);
  if (await checkEvasion(g, d)) return;
  await onMemberUpdate(d);
}

async function onMemberUpdate(d) {
  const g = guilds.get(d.guild_id);
  if (!g || !d.user || d.user.bot || d.user.id === g.owner) return;
  if (memberPerms(g, d.user.id, d.roles) & STAFF) return;      // модераторов не трогаем
  await checkName(g, d);
  queueAvatar(g, d);
}

/* ---------- встроенная AutoMod Discord ----------
   Создаём свои правила один раз. Если администратор потом удалит какое-то
   из них — не возвращаем: значит, оно серверу не нужно. */
const BLOCK = { type: 1, metadata: { custom_message: 'This message breaks the server rules. Please read #rules.' } };
const NATIVE = [
  { key: 'words', trigger: 4, body: { name: 'AIBROFIST: slurs and sexual content', event_type: 1, trigger_type: 4,
    trigger_metadata: { presets: [2, 3] }, actions: [BLOCK], enabled: true } },
  { key: 'mentions', trigger: 5, body: { name: 'AIBROFIST: mention spam', event_type: 1, trigger_type: 5,
    trigger_metadata: { mention_total_limit: 6, mention_raid_protection_enabled: true }, actions: [BLOCK], enabled: true } },
  { key: 'spam', trigger: 3, body: { name: 'AIBROFIST: suspected spam', event_type: 1, trigger_type: 3,
    actions: [{ type: 1 }], enabled: true } }
];

async function ensureNativeAutomod(g) {
  const st = gstate(g.id);
  if (NATIVE.every(n => st.automod[n.key])) return;
  const list = await api('GET', '/guilds/' + g.id + '/auto-moderation/rules');
  if (list.status === 403) {
    once('noautomod:' + g.id, 'Discord AutoMod not set up in ' + g.name + ': give the bot Manage Server (optional, the bot still moderates on its own)');
    return;
  }
  if (!ok(list) || !Array.isArray(list.body)) return;
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
const COMMANDS = ['news', 'updates', 'rules', 'warn', 'mute', 'unmute', 'ban', 'unban', 'strikes', 'pardon', 'modlog', 'help'];
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
  '**' + PREFIX + 'rules** - post the server rules (English, with a Russian button) and set extra banned words',
  '**' + PREFIX + 'warn @user reason** - give a strike, punished by the same ladder as automod ' +
    '(add a rule number: ' + PREFIX + 'warn @user 2 spam)',
  '**' + PREFIX + 'mute @user 1h reason** - mute for 10m, 1h, 6h, 1d, 3d or 7d',
  '**' + PREFIX + 'unmute @user** - lift a mute',
  '**' + PREFIX + 'ban @user 7d reason** - ban for 1d, 3d, 7d or 30d, without a duration - forever',
  '**' + PREFIX + 'unban @user** - lift a ban (a user ID works too)',
  '**' + PREFIX + 'strikes @user** - show active strikes',
  '**' + PREFIX + 'pardon @user** - remove all strikes',
  '**' + PREFIX + 'modlog** - send moderation logs to this channel, **' + PREFIX + 'modlog off** to stop',
  '',
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
  const label = { news: 'Open the post editor', updates: 'Choose update channels', help: 'Show commands',
                  strikes: 'Show strikes', rules: 'Open the rules editor' }[kind];
  const r = await sendMessage(m.channel_id, { allowed_mentions: { parse: [] },
    components: [{ type: 1, components: [{ type: 2, style: 2, label, custom_id: 'panel:' + id }] }] });
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

function strikesText(g, uid) {
  const list = activeStrikes(g.id, uid);
  if (!list.length) return '<@' + uid + '> has no active strikes.';
  const lines = list.map(s => '<t:' + Math.floor(s.t / 1000) + ':R> ' + R.strikes(s.p) + (s.r ? ', rule ' + s.r : '') + ', ' +
    ((A.KIND[s.k] && A.KIND[s.k].note) || (s.k === 'manual' ? 'warned by the owner' : s.k)) +
    (s.by && s.by !== 'auto' ? ', by <@' + s.by + '>' : ''));
  return '**<@' + uid + '> has ' + R.strikes(points(list)) + ':**\n' + lines.join('\n');
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
  if (cmd === 'modlog') {
    const off = /^off$/i.test(args);
    gstate(g.id).modlog = off ? '' : m.channel_id;
    save();
    await confirm(m.channel_id, off ? 'Moderation logs are off.' : 'Moderation logs will be posted here.');
    return true;
  }

  // дальше — команды над игроком: @упоминание или id
  const idm = /^(?:<@!?(\w+)>|(\d{5,}))\s*([\s\S]*)$/.exec(args);
  if (!idm) { await confirm(m.channel_id, 'Mention the member: ' + PREFIX + cmd + ' @user'); return true; }
  const uid = idm[1] || idm[2], rest = idm[3].trim();
  const mention = (m.mentions || []).find(u => u && u.id === uid);
  const target = mention || { id: uid };
  if (cmd === 'strikes') { await openPanel(g, m, 'strikes', { user: uid }); return true; }
  if (cmd === 'pardon') {
    delete state.strikes[g.id + ':' + uid];
    const caseNo = ++state.cases;
    save();
    await modlog(g, { caseNo, title: 'Strikes removed', color: R.COLORS.ok, user: uid, by: m.author.id });
    await confirm(m.channel_id, 'All strikes of <@' + uid + '> are removed.');
    return true;
  }
  if (cmd === 'unban') {
    const r = await api('DELETE', '/guilds/' + g.id + '/bans/' + uid, null, { reason: 'Unbanned by the owner' });
    if (ok(r) || r.status === 404) forgetBan(g.id, uid);
    if (ok(r)) await modlog(g, { caseNo: ++state.cases, title: 'Ban lifted', color: R.COLORS.ok, user: uid, by: m.author.id });
    await confirm(m.channel_id, ok(r) ? '<@' + uid + '> is unbanned.' : r.status === 404 ? '<@' + uid + '> is not banned.' : 'I could not unban them.');
    return true;
  }
  // Discord не даёт наказывать администраторов, а себя и бота — незачем
  const roles = mention && mention.member && mention.member.roles;
  if (uid === g.owner || (me && uid === me.id) || target.bot || (memberPerms(g, uid, roles) & PERM.ADMIN)) {
    await confirm(m.channel_id, 'Administrators and bots cannot be punished.');
    return true;
  }
  const until = Date.parse(mention && mention.member && mention.member.communication_disabled_until) || 0;

  if (cmd === 'warn') {
    const rm = /^(\d{1,2})\b\s*([\s\S]*)$/.exec(rest);
    const rule = rm && R.ruleById(Number(rm[1])) ? Number(rm[1]) : 0;
    const reason = (rule ? rm[2] : rest).trim().slice(0, 300);
    const f = { kind: 'manual', rule, weight: 1, note: reason || (rule ? R.ruleById(rule).title : 'Warned by the owner') };
    await punish(g, target, f, { by: m.author.id, channel: m.channel_id, until });
    return true;
  }
  if (cmd === 'mute') {
    const dm2 = /^(\S+)\s*([\s\S]*)$/.exec(rest) || [];
    const d = DURATIONS[String(dm2[1] || '').toLowerCase()];
    if (!d) { await confirm(m.channel_id, 'Choose a duration: 10m, 1h, 6h, 1d, 3d or 7d.'); return true; }
    const reason = (dm2[2] || '').trim().slice(0, 300) || 'Muted by the owner';
    const caseNo = ++state.cases;
    save();
    const done = until > Date.now() + d[1] ? true : await timeout(g, uid, d[1], 'Case ' + caseNo + ': ' + reason);
    if (done) {
      await dm(uid, { embeds: [{ color: R.COLORS.mute, title: 'You have been muted',
        description: 'You were muted in **' + g.name + '** for ' + d[0] + '.',
        fields: [{ name: 'Reason', value: reason }],
        footer: { text: 'If you think this is a mistake, message a moderator.' } }] }).catch(() => {});
      await modlog(g, { caseNo, title: 'Mute for ' + d[0], color: R.COLORS.mute, user: uid, by: m.author.id, reason });
    }
    await confirm(m.channel_id, done ? '<@' + uid + '> is muted for ' + d[0] + '.' : 'I could not mute them: my role must be above theirs and have Timeout Members.');
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
    // личное сообщение — до бана, иначе оно уже не дойдёт
    await dm(uid, { embeds: [{ color: R.COLORS.ban, title: ms ? 'You have been banned for ' + R.duration(ms) : 'You have been banned permanently',
      description: 'You were banned from **' + g.name + '**.', fields: [{ name: 'Reason', value: reason }],
      footer: { text: ms ? 'The ban is lifted automatically when it ends.' : 'If you think this is a mistake, message a moderator.' } }] }).catch(() => {});
    const done = await ban(g, uid, 'Case ' + caseNo + ': ' + reason);
    if (done) {
      setUnban(g.id, uid, ms);
      await modlog(g, { caseNo, title: what, color: R.COLORS.ban, user: uid, by: m.author.id, reason });
    }
    await confirm(m.channel_id, done ? '<@' + uid + '> is banned ' + (ms ? 'for ' + R.duration(ms) : 'permanently') + '.'
                                     : 'I could not ban them: my role must be above theirs and have Ban Members.');
    return true;
  }
  if (cmd === 'unmute') {
    const done = await timeout(g, uid, 0, 'Unmuted by the owner');
    if (done) { await modlog(g, { caseNo: ++state.cases, title: 'Mute lifted', color: R.COLORS.ok, user: uid, by: m.author.id }); save(); }
    await confirm(m.channel_id, done ? '<@' + uid + '> can talk again.' : 'I could not unmute them.');
    return true;
  }
  return true;
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

/* Правила сервера (команда rules): канал, заголовок, правила по-английски
   (их видно в посте) и по-русски (по кнопке под постом, видит только
   нажавший), свои запрещённые слова. Сразу вписаны стандартные правила
   и лестница наказаний — бот следит именно за ними. */
const RULES_TITLE = 'AIBROFIST Server Rules';
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
    field('Rules in Russian', 'Shown by the button under the post. Leave empty for no button.',
          { type: 4, custom_id: 'ru', style: 2, required: false, max_length: 3700, value: r.ru.slice(0, 3700) }),
    field('Extra banned words', 'Comma or new line between them. A message with one is removed and gets a strike.',
          Object.assign({ type: 4, custom_id: 'words', style: 2, required: false, max_length: 2000 }, r.words ? { value: r.words } : {}))
  ] };
}
function rulesModalClassic(g, p) {
  const r = rulesNow(g), c = g.channels.get([r.channel, RULES_CHANNEL].find(x => x && g.channels.has(x)) || p.channel);
  return { custom_id: 'rules:' + p.channel, title: 'Server rules', components: [
    row('channel', 'Channel', 1, { required: true, max_length: 100, value: c ? c.name : '' }),
    row('title', 'Title', 1, { required: true, max_length: 100, value: r.title }),
    row('en', 'Rules in English', 2, { required: true, max_length: 3700, value: r.en.slice(0, 3700) }),
    row('ru', 'Rules in Russian (button under the post)', 2, { max_length: 3700, value: r.ru.slice(0, 3700) }),
    row('words', 'Extra banned words (comma between them)', 2, Object.assign({ max_length: 2000 }, r.words ? { value: r.words } : {}))
  ] };
}
const rulesPost = (title, en, ru) => frame({ color: R.COLORS.neutral, title, text: en,
  footer: 'AIBROFIST  ·  Updated <t:' + Math.floor(Date.now() / 1000) + ':D>',
  button: ru ? { label: 'Русский', id: 'rules:ru' } : null });

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
  const msg = rulesPost(title, linkify(g, en), ru);
  // тот же канал — правим прежний пост (он остаётся на месте), иначе — новый, а старый убираем
  let r = null;
  if (old.message && old.channel === chosen.id) r = await api('PATCH', '/channels/' + chosen.id + '/messages/' + old.message, msg);
  if (!r || !ok(r)) {
    r = await api('POST', '/channels/' + chosen.id + '/messages', msg);
    if (ok(r) && old.message && !(old.channel === chosen.id && old.message === r.body.id))
      api('DELETE', '/channels/' + old.channel + '/messages/' + old.message).catch(() => {});
  }
  if (!ok(r) || !r.body) return finish(i, card('Could not post in <#' + chosen.id + '> (error ' + r.status + '). Check that I can send messages there.'));
  st.rules = { channel: chosen.id, message: r.body.id, title, en, ru };
  st.words = words;
  save();
  return finish(i, card('Rules are in <#' + chosen.id + '>: https://discord.com/channels/' + g.id + '/' + chosen.id + '/' + r.body.id +
    '\n' + (ru ? 'The Russian version opens with the button under the post.' : 'No Russian version, so there is no button.') +
    '\n' + (words.length ? 'Extra banned words: ' + words.length + '. Messages with them are removed and get a strike.' : 'No extra banned words.')));
}

/* Правила ещё не выкладывались — бот сам кладёт стандартные в #rules,
   один раз. Дальше их правит владелец командой rules; удалил пост —
   бот его не возвращает. */
async function postDefaultRules(g) {
  const st = gstate(g.id);
  const c = g.channels.get(RULES_CHANNEL);
  if ((st.rules && st.rules.message) || !c) return;
  const r0 = rulesNow(g);
  const r = await api('POST', '/channels/' + c.id + '/messages', rulesPost(r0.title, linkify(g, r0.en), r0.ru));
  if (!ok(r) || !r.body) { log('could not post the rules in #' + c.name + ':', r.status); return; }
  st.rules = { channel: c.id, message: r.body.id, title: r0.title, en: r0.en, ru: r0.ru };
  save();
}

// кнопка «Русский» под правилами — нажать может любой, ответ видит только он
// (и в личке у владельца, где лежит превью: там берём правила сервера бота)
function rulesInRussian(i, g) {
  const r = g && gstate(g.id).rules;
  const text = r && r.ru ? r.ru : R.rulesText('ru');
  const box = frame({ color: R.COLORS.neutral, title: 'Правила сервера', text: g ? linkify(g, text) : text });
  return respond(i, { type: 4, data: Object.assign(box, { flags: box.flags | 64 }) });
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
      if (!type) { notes.push(shown + ': not an image'); continue; }
      if ((a.size || 0) > 10 * 1024 * 1024) { notes.push(shown + ': bigger than 10 MB'); continue; }
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
        notes.push(shown + ': could not copy it (' + why + '), so it is shown by link and may disappear later');
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
  return finish(i, card('Posted in <#' + chosen.id + '>: https://discord.com/channels/' + g.id + '/' + chosen.id + '/' + r.body.id +
                        (notes.length ? '\n\nImages:\n' + notes.map(n => '- ' + n).join('\n') : '')));
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
  return finish(i, card(list.length ? 'Game updates will be posted in: ' + list.map(c => '<#' + c + '>').join(', ') + '.'
                                    : 'No channels chosen: game updates go to the #updates channel.'));
}

async function onInteraction(i) {
  if (!i) return;
  const cid = String((i.data && i.data.custom_id) || '');
  if (i.type === 3 && cid === 'rules:ru') return rulesInRussian(i, i.guild_id ? guilds.get(i.guild_id) : guilds.values().next().value);
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
    if (p.kind === 'help') return reply(i, card(HELP));
    if (p.kind === 'strikes') return reply(i, card(strikesText(g, p.data.user)));
    return;
  }
  if (i.type === 5 && cid.indexOf('news:') === 0) return onNewsSubmit(i, g);
  if (i.type === 5 && cid.indexOf('updates:') === 0) return onUpdatesSubmit(i, g);
  if (i.type === 5 && cid.indexOf('rules:') === 0) return onRulesSubmit(i, g);
}

/* Слэш-команд у бота больше нет — все команды секретные, с «!». Если
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

// адрес, куда Discord присылает нажатия кнопок и окна
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
          await onMessage(m, false).catch(e => log('message check failed:', e.message));
        }
      }
    }
    rest.rounds++;
    rest.lastRound = Date.now();
  } finally { if (rest) rest.busy = false; }
}

// участники: кто зашёл, кто сменил ник или аватарку
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
  const sig = m => [m.nick, m.avatar, m.user.avatar, m.user.global_name, m.user.username, (m.roles || []).join()].join('|');
  for (const [uid, m] of all) {
    const d = Object.assign({ guild_id: g.id }, m);
    if (first) await onMemberUpdate(d).catch(() => {});
    else if (!old.has(uid)) await onMemberAdd(d).catch(() => {});
    else if (sig(old.get(uid)) !== sig(m)) await onMemberUpdate(d).catch(() => {});
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
    await ensureNativeAutomod(g);
    await postDefaultRules(g);
    const o = await api('GET', '/guilds/' + g.id + '/members/' + g.owner);
    if (ok(o) && o.body && o.body.user) g.ownerName = o.body.nick || o.body.user.global_name || o.body.user.username;
    // ники всех, кто уже на сервере, — тоже проверить (ответ придёт пачками)
    if (gw && gw.state === 'ready') gw.send({ op: 8, d: { guild_id: g.id, query: '', limit: 0 } });
  } catch (e) { log('setup failed for ' + g.name + ':', e.message); setupDone.delete(g.id); }
}

function onDispatch(t, d) {
  switch (t) {
    case 'READY':
      me = d.user;
      appId = d.application && d.application.id;
      log('connected as ' + (me && me.username));
      break;
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
    case 'GUILD_MEMBER_UPDATE': onMemberUpdate(d).catch(e => log('member check failed:', e.message)); break;
    case 'GUILD_BAN_ADD': rememberBan(d.guild_id, d.user); break;
    case 'GUILD_MEMBERS_CHUNK':
      (d.members || []).forEach(mb => onMemberUpdate(Object.assign({ guild_id: d.guild_id }, mb)).catch(() => {}));
      break;
    // правка сообщения проверяется так же: иначе нарушение дописали бы позже
    // (без edited_timestamp это Discord дорисовал превью ссылки, а не правка)
    case 'MESSAGE_UPDATE': if (typeof d.content === 'string' && d.author && d.edited_timestamp) onMessage(d, true).catch(() => {}); break;
    case 'AUTO_MODERATION_ACTION_EXECUTION': onAutomodExecution(d).catch(e => log('automod event failed:', e.message)); break;
    case 'INTERACTION_CREATE': onInteraction(d).catch(e => log('command failed:', e.message)); break;
  }
}

function connect(intents) {
  gw = new Gateway({ token: token(), intents,
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
  checkCdn();                        // заранее знать, можно ли скачивать картинки с CDN Discord
  connect(ALL_INTENTS);
  // живое подключение не открылось — работаем запросами (см. выше)
  const t0 = setTimeout(() => { if (gw && gw.state !== 'ready') startRest().catch(e => log('requests mode failed:', e.message)); }, REST_AFTER_MS);
  if (t0.unref) t0.unref();
  timers.push(t0);
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
  saveNow();
  guilds.clear(); setupDone.clear(); lastHit.clear();
}

/* Страница состояния бота: /discord/status. Открыта всем, поэтому в ней
   нет секретов — ни токена, ни начала команд, ни штрафов игроков; только
   задан ли токен, подключён ли бот и что ему мешает (почему «не в сети»
   или не пишет в канал). */
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
  out.guilds = [...guilds.values()].map(g => ({ id: g.id, name: g.name }));
  const feed = require('./updatesFeed.js');
  out.updates = feed.status();
  if (out.token) out.updates.channels = await feed.channels().catch(() => []);
  if (out.token) {
    checkCdn();
    out.cdn = cdn.ok === null ? 'not checked yet' : cdn.ok ? 'ok' : 'unreachable: ' + cdn.error;
    if (cdn.ok === false) out.problems.push('The site cannot download images from Discord (' + cdn.error + '): pictures added ' +
                                            'in the post editor are shown by link and may disappear later.');
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

module.exports = { start, stop, feedChannels, register, status, startRest, _test: { state: () => state, guilds, punish, releaseBans, reload: () => { loaded = false; loadState(); } } };
