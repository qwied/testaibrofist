// ============ DISCORD-БОТ: правила, автомодерация, команды ============
// Работает, только если на хостинге задан DISCORD_BOT_TOKEN; без него
// модуль ничего не делает. Что умеет:
//   - выкладывает правила сервера в #rules и правит то же сообщение, когда
//     текст правил меняется (не постит заново при каждом перезапуске);
//   - автомодерация: проверяет каждое сообщение (discordAutomod.js),
//     удаляет нарушения, даёт штрафные баллы и наказывает по лестнице из
//     discordRules.js — предупреждение, мьюты, бан только в крайнем случае;
//     дополнительно включает встроенную AutoMod Discord, которая не даёт
//     отправить оскорбления и спам упоминаниями вовсе;
//   - пишет игроку в личку, за что и как он наказан, а модераторам — в
//     канал mod-log (если он есть);
//   - команды — только для владельца сервера: /post (сообщение в любой
//     канал), /updates (в какие каналы идут новости), /relay, /rules,
//     /modlog, /warn, /mute, /unmute, /warnings, /pardon;
//   - пишет от своего имени то, что владелец прислал ему в личку: в канал
//     по умолчанию или в «#канал» в начале сообщения, с картинками;
//     правка и удаление сообщения в личке повторяются в канале.
// Новости в #updates публикует updatesFeed.js — каналы для них берёт отсюда.
// Состояние — data/discordBot.json.
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { api, ok, token } = require('./discordApi.js');
const { Gateway } = require('./discordGateway.js');
const R = require('./discordRules.js');
const A = require('./discordAutomod.js');
const { atomicWriteFileSync } = require('./fsAtomic.js');

const STATE_FILE = process.env.DISCORD_BOT_STATE || path.join(__dirname, 'data', 'discordBot.json');
const SCAN_IMAGES = process.env.DISCORD_SCAN_IMAGES !== '0';

const INTENT = { GUILDS: 1, GUILD_MESSAGES: 1 << 9, DIRECT_MESSAGES: 1 << 12, MESSAGE_CONTENT: 1 << 15,
                 AUTOMOD_EXECUTION: 1 << 21 };
const ALL_INTENTS = INTENT.GUILDS | INTENT.GUILD_MESSAGES | INTENT.DIRECT_MESSAGES | INTENT.MESSAGE_CONTENT |
                    INTENT.AUTOMOD_EXECUTION;

const PERM = { KICK: 1n << 1n, BAN: 1n << 2n, ADMIN: 1n << 3n, MANAGE_GUILD: 1n << 5n,
               MANAGE_MESSAGES: 1n << 13n, MODERATE: 1n << 40n };
const ALL_PERMS = (1n << 64n) - 1n;
const STAFF = PERM.ADMIN | PERM.MANAGE_GUILD | PERM.MANAGE_MESSAGES | PERM.MODERATE | PERM.KICK | PERM.BAN;

const COOLDOWN = 30 * 1000;      // за одну волну спама — одно наказание, а не восемь
const NOTICE_MS = 10 * 1000;     // короткое предупреждение в канале исчезает само

// relay — куда идут сообщения владельца из лички; relayed — что во что переслано
let state = { feed: [], guilds: {}, strikes: {}, cases: 0, relay: {}, relayed: {} };
let loaded = false, saveTimer = null;
const guilds = new Map();        // id -> { id, name, owner, roles: Map, channels: Map }
const setupDone = new Set();
const lastHit = new Map();       // guild:user -> { t, weight }
const inviteCache = new Map();   // код приглашения -> { guild, t }
const dmChannels = new Map();
const said = new Set();          // какие подсказки владельцу уже были в журнале
const flood = new A.FloodWatch();
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
      relay: s.relay && typeof s.relay === 'object' ? s.relay : {},
      relayed: s.relayed && typeof s.relayed === 'object' ? s.relayed : {}
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
  if (!g.rules) g.rules = { channel: '', msgs: [], hash: '' };
  if (!g.automod) g.automod = {};
  return g;
}

const hash = v => crypto.createHash('sha1').update(JSON.stringify(v)).digest('hex');

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
  if (entry.rule !== undefined) fields.push({ name: 'Rule', value: ruleLine(entry.rule), inline: true });
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
  const action = R.describe(step);
  const why = f.note + (f.detail ? ' (' + f.detail + ')' : '');
  const reason = 'Case ' + caseNo + ': ' + (rule ? 'rule ' + rule.id + ', ' : '') + why;

  // личное сообщение — до бана, иначе оно уже не дойдёт
  await dm(user.id, { embeds: [{
    color: color(step),
    title: step.type === 'ban' ? 'You have been banned' : step.type === 'mute' ? 'You have been muted' : 'Warning',
    description: (ctx.by ? 'A moderator of **' : 'Your message in **') + g.name + (ctx.by ? '** gave you a strike.' : '** was removed.'),
    fields: [
      { name: 'Rule', value: rule ? rule.id + '. ' + rule.title : 'Moderator decision', inline: true },
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
  else if (step.type === 'ban') done = await ban(g, user.id, reason);

  if (ctx.channel && !ctx.silent && step.type !== 'ban') {
    const what = ctx.by ? 'you received a strike' : 'your message was removed';
    await notice(ctx.channel, user.id, what + (rule ? ': rule ' + rule.id + ', ' + rule.title.toLowerCase() : '') +
                 '. ' + action + ', ' + R.strikes(total) + '.').catch(() => {});
  }
  await modlog(g, { caseNo, title: action + (done ? '' : ' (failed: no permission)'), color: color(step),
                    user: user.id, by: ctx.by, rule: f.rule || 0, reason: why, strikes: total,
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

function queueImages(g, m) {
  const pics = (m.attachments || []).filter(a => a && /^image\/(png|jpeg|gif)/.test(a.content_type || '') && (a.size || 0) <= 10 * 1024 * 1024);
  if (!pics.length || imgQueue.length > 10) return;
  imgQueue.push({ g, m, pics: pics.slice(0, 4) });
  pumpImages();
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
          const s = await img.nsfwScores(decoded);
          const porn = s.Porn || 0, hentai = s.Hentai || 0;
          if (porn >= 0.85 || hentai >= 0.85 || porn + hentai >= 0.92) {
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
  if (!m || !m.author || m.author.bot || m.webhook_id) return;
  if (!m.guild_id) return onDirect(m, edited);
  if (m.type !== undefined && m.type !== 0 && m.type !== 19) return;   // обычное сообщение и ответ
  if (edited && !(m.member && m.member.roles)) return;   // без ролей не отличить модератора
  const g = guilds.get(m.guild_id);
  if (!g) return;
  if (memberPerms(g, m.author.id, m.member && m.member.roles) & STAFF) return;   // модераторов не трогаем
  const ch = channelInfo(g, m.channel_id);
  const allowAds = /promo|advert|реклам|самопиар/i.test(ch.name);

  const found = A.inspect(m, { nsfw: ch.nsfw });
  if (!edited) {
    const fl = flood.add(m.guild_id + ':' + m.author.id, m);
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

/* ---------- сообщения от имени бота ----------
   Владелец пишет боту в личку — бот публикует это в канале как своё
   сообщение. Куда: «#канал» в начале сообщения (запоминается для
   следующих), иначе канал из /relay, иначе #general/#chat. В тексте
   «#имя-канала» и «@роль» превращаются в настоящие ссылку и упоминание;
   @everyone и @here работают. Картинки и файлы из лички переносятся.
   Чужие сообщения в личку бот не пересылает и на них не отвечает. */
const RELAY_HELP = 'Send me a message and I will post it as the bot. Start it with #channel-name to choose ' +
  'the channel (it is remembered for the next messages). Files and images are posted too. Edit or delete your ' +
  'message here and I will do the same in the channel.';

function ownedGuilds(uid) { return [...guilds.values()].filter(g => g.owner === uid); }

const textChannels = g => [...g.channels.values()].filter(c => c.type === 0 || c.type === 5);
function channelByName(list, name) {
  name = String(name || '').toLowerCase();
  for (const g of list) {
    const c = textChannels(g).find(c => c.name.toLowerCase() === name || c.id === name);
    if (c) return { g, c };
  }
  return null;
}

// «#news» -> <#id>, «@Players» -> <@&id>; чего на сервере нет — остаётся текстом
function linkify(g, text) {
  return text
    .replace(/(^|[^<\w])#([\w-]{1,100})/g, (all, pre, name) => {
      const c = textChannels(g).find(c => c.name.toLowerCase() === name.toLowerCase());
      return c ? pre + '<#' + c.id + '>' : all;
    })
    .replace(/(^|[^<\w])@([\w-]{1,100})/g, (all, pre, name) => {
      if (/^(everyone|here)$/i.test(name)) return all;
      const r = [...g.roles.entries()].find(([id, r]) => id !== g.id && r.name.toLowerCase() === name.toLowerCase());
      return r ? pre + '<@&' + r[0] + '>' : all;
    });
}

async function dmReply(m, text) {
  await api('POST', '/channels/' + m.channel_id + '/messages',
            { content: text, allowed_mentions: { parse: [] }, message_reference: { message_id: m.id, fail_if_not_exists: false } });
}

async function onDirect(m, edited) {
  const mine = ownedGuilds(m.author.id);
  if (!mine.length) return;                                // не владелец — молчим
  let text = String(m.content || '');

  if (edited) {
    const done = state.relayed[m.id];
    if (!done) return;
    const g = guilds.get(done.g);
    await api('PATCH', '/channels/' + done.c + '/messages/' + done.m, { content: linkify(g || mine[0], text.replace(/^\s*(?:<#(\d+)>|#([\w-]+))\s*/, '')) });
    return;
  }
  if (/^\s*(help|помощь|\?)\s*$/i.test(text)) return dmReply(m, RELAY_HELP);

  // куда: «#канал» или <#id> в начале
  let target = null;
  const head = /^\s*(?:<#(\d+)>|#([\w-]+))\s*/.exec(text);
  if (head) {
    target = channelByName(mine, head[1] || head[2]);
    if (!target) return dmReply(m, 'I cannot find the channel #' + (head[2] || head[1]) + '.');
    text = text.slice(head[0].length);
    state.relay[m.author.id] = target.c.id;
    save();
  } else {
    const saved = state.relay[m.author.id] || String(process.env.DISCORD_RELAY_CHANNEL_ID || '').trim();
    target = saved ? channelByName(mine, saved) : null;
    if (!target) {
      for (const g of mine) {
        const id = findChannel(g, /^(?:[^a-zа-я]*)(?:general|chat|main|общий|основной|чат)$/i);
        if (id) { target = { g, c: g.channels.get(id) }; break; }
      }
    }
    if (!target) return dmReply(m, 'Where should I post it? Start your message with #channel-name.');
  }

  // файлы из лички: ссылки на них временные, поэтому загружаем заново
  const files = [], skipped = [];
  for (const a of (m.attachments || []).slice(0, 10)) {
    if ((a.size || 0) > 10 * 1024 * 1024) { skipped.push(a.filename); continue; }
    try {
      const f = await download(a.url, 10 * 1024 * 1024);
      files.push({ name: a.filename || 'file', data: f.buf, type: a.content_type || f.type });
    } catch (e) { skipped.push(a.filename); }
  }
  text = linkify(target.g, text.trim()).slice(0, 2000);
  if (!text && !files.length) {
    return dmReply(m, 'Next messages go to <#' + target.c.id + '>.');
  }
  const body = { content: text || undefined, allowed_mentions: { parse: ['users', 'roles', 'everyone'] } };
  const r = await api('POST', '/channels/' + target.c.id + '/messages', body, files.length ? { files } : undefined);
  if (!ok(r) || !r.body) {
    return dmReply(m, 'Could not post in <#' + target.c.id + '> (error ' + r.status + '). Check that I can send messages there.');
  }
  state.relayed[m.id] = { g: target.g.id, c: target.c.id, m: r.body.id };
  const keys = Object.keys(state.relayed);
  if (keys.length > 300) keys.slice(0, keys.length - 300).forEach(k => { delete state.relayed[k]; });
  save();
  await dmReply(m, 'Posted in <#' + target.c.id + '>.' + (skipped.length ? ' Not attached (too big or unavailable): ' + skipped.join(', ') + '.' : ''));
}

async function onDirectDelete(d) {
  const done = state.relayed[d.id];
  if (!done) return;
  await api('DELETE', '/channels/' + done.c + '/messages/' + done.m);
  delete state.relayed[d.id];
  save();
}

/* ---------- правила в #rules ---------- */
async function ensureRules(g, opts) {
  opts = opts || {};
  const st = gstate(g.id);
  const env = String(process.env.DISCORD_RULES_CHANNEL_ID || '').trim();
  const channel = opts.channel || st.rules.channel || env ||
                  findChannel(g, /^(?:[^a-zа-я]*)(?:rules|правила)$/i, /rules|правила/i);
  if (!channel) {
    once('norules:' + g.id, 'no #rules channel in ' + g.name + ': create one or use /rules');
    return { status: 'no-channel' };
  }
  const body = R.rulesMessage();
  const h = hash(body);
  if (st.rules.msgs.length && st.rules.channel !== channel) {
    // правила переехали в другой канал — старое сообщение убираем
    for (const id of st.rules.msgs) await api('DELETE', '/channels/' + st.rules.channel + '/messages/' + id).catch(() => {});
    st.rules.msgs = [];
  }
  if (st.rules.msgs.length && st.rules.hash === h && !opts.force) return { status: 'same', channel };
  if (st.rules.msgs.length) {
    const r = await api('PATCH', '/channels/' + channel + '/messages/' + st.rules.msgs[0], body);
    if (ok(r)) { st.rules.hash = h; save(); return { status: 'updated', channel }; }
    if (r.status !== 404) return { status: 'error', channel, code: r.status };
  }
  const r = await sendMessage(channel, body);
  if (!ok(r) || !r.body) return { status: 'error', channel, code: r.status };
  st.rules = { channel, msgs: [r.body.id], hash: h };
  save();
  return { status: 'posted', channel };
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

/* ---------- команды ---------- */
/* Командами пользуется только владелец сервера. «0» прячет их от всех,
   кроме администраторов, а остальное проверяет сам бот (ownerOnly). */
const OWNER_ONLY = '0';
const USER = (desc) => ({ type: 6, name: 'user', description: desc, required: true });
const DURATIONS = [['10 minutes', 10 * R.MIN], ['1 hour', R.HOUR], ['6 hours', 6 * R.HOUR],
                   ['1 day', R.DAY], ['3 days', 3 * R.DAY], ['7 days', 7 * R.DAY]];

function commandDefs() {
  return [
    { name: 'post', description: 'Post a formatted message to any channel', default_member_permissions: OWNER_ONLY,
      options: [{ type: 7, name: 'channel', description: 'Where to post', required: true, channel_types: [0, 5] },
                { type: 3, name: 'style', description: 'Card (default) or plain text', required: false,
                  choices: [{ name: 'card', value: 'embed' }, { name: 'plain text', value: 'plain' }] }] },
    { name: 'updates', description: 'Choose the channels that receive game updates', default_member_permissions: OWNER_ONLY,
      options: [
        { type: 1, name: 'add', description: 'Post game updates in this channel too',
          options: [{ type: 7, name: 'channel', description: 'Channel', required: true, channel_types: [0, 5] }] },
        { type: 1, name: 'remove', description: 'Stop posting game updates in this channel',
          options: [{ type: 7, name: 'channel', description: 'Channel', required: true, channel_types: [0, 5] }] },
        { type: 1, name: 'list', description: 'Show the channels that receive game updates' }] },
    { name: 'relay', description: 'Choose where the messages you send me in DMs are posted', default_member_permissions: OWNER_ONLY,
      options: [{ type: 7, name: 'channel', description: 'Channel', required: true, channel_types: [0, 5] }] },
    { name: 'rules', description: 'Post or refresh the server rules', default_member_permissions: OWNER_ONLY,
      options: [{ type: 7, name: 'channel', description: 'Rules channel (default: #rules)', required: false, channel_types: [0, 5] }] },
    { name: 'modlog', description: 'Set the channel for moderation logs, or turn them off', default_member_permissions: OWNER_ONLY,
      options: [{ type: 7, name: 'channel', description: 'Leave empty to turn logs off', required: false, channel_types: [0, 5] }] },
    { name: 'warn', description: 'Give a member a strike', default_member_permissions: OWNER_ONLY,
      options: [USER('Member to warn'),
                { type: 4, name: 'rule', description: 'Broken rule', required: false,
                  choices: R.RULES.map(r => ({ name: r.id + '. ' + r.title, value: r.id })) },
                { type: 3, name: 'reason', description: 'Reason the member will see', required: false, max_length: 300 }] },
    { name: 'mute', description: 'Mute a member for a while', default_member_permissions: OWNER_ONLY,
      options: [USER('Member to mute'),
                { type: 3, name: 'duration', description: 'How long', required: true,
                  choices: DURATIONS.map(([n]) => ({ name: n, value: n })) },
                { type: 3, name: 'reason', description: 'Reason the member will see', required: false, max_length: 300 }] },
    { name: 'unmute', description: 'Lift a mute', default_member_permissions: OWNER_ONLY,
      options: [USER('Member to unmute')] },
    { name: 'warnings', description: 'Show the active strikes of a member', default_member_permissions: OWNER_ONLY,
      options: [USER('Member')] },
    { name: 'pardon', description: 'Remove all strikes of a member', default_member_permissions: OWNER_ONLY,
      options: [USER('Member')] }
  ];
}

async function registerCommands(g) {
  if (!appId) return;
  const st = gstate(g.id);
  const defs = commandDefs(), h = hash(defs);
  if (st.commands === h) return;
  const r = await api('PUT', '/applications/' + appId + '/guilds/' + g.id + '/commands', defs);
  if (ok(r)) { st.commands = h; save(); }
  else log('slash commands not registered in ' + g.name + ':', r.status, JSON.stringify(r.body).slice(0, 200));
}

const reply = (i, data) => api('POST', '/interactions/' + i.id + '/' + i.token + '/callback', { type: 4, data: Object.assign({ flags: 64, allowed_mentions: { parse: [] } }, data) });
const defer = i => api('POST', '/interactions/' + i.id + '/' + i.token + '/callback', { type: 5, data: { flags: 64 } });
const finish = (i, data) => api('PATCH', '/webhooks/' + appId + '/' + i.token + '/messages/@original', Object.assign({ allowed_mentions: { parse: [] } }, data));
const card = (text, c) => ({ embeds: [{ color: c || R.COLORS.neutral, description: text }] });

const opt = (list, name) => { const o = (list || []).find(x => x.name === name); return o ? o.value : undefined; };

async function onInteraction(i) {
  if (!i || !i.guild_id) return;
  const g = guilds.get(i.guild_id);
  if (!g) return;
  const mod = i.member && i.member.user && i.member.user.id;
  if (mod !== g.owner) return reply(i, card('Only the server owner can use this bot.'));
  if (i.type === 5) return onModal(i, g);
  if (i.type !== 2 || !i.data) return;
  const name = i.data.name, o = i.data.options || [];
  const resolvedUser = id => (i.data.resolved && i.data.resolved.users && i.data.resolved.users[id]) || { id };

  if (name === 'post') {
    const channel = opt(o, 'channel'), style = opt(o, 'style') || 'embed';
    if (!g.channels.has(channel)) return reply(i, card('I cannot see that channel.'));
    return api('POST', '/interactions/' + i.id + '/' + i.token + '/callback', { type: 9, data: {
      custom_id: 'post:' + channel + ':' + style, title: 'Post a message',
      components: [
        { type: 1, components: [{ type: 4, custom_id: 'title', label: 'Title (optional)', style: 1, required: false, max_length: 256 }] },
        { type: 1, components: [{ type: 4, custom_id: 'text', label: 'Message', style: 2, required: true, max_length: style === 'plain' ? 1900 : 4000 }] }
      ] } });
  }

  await defer(i);
  if (name === 'updates') {
    const sub = o[0] || {}, channel = opt(sub.options, 'channel');
    if (sub.name === 'add' && state.feed.indexOf(channel) === -1) state.feed.push(channel);
    if (sub.name === 'remove') state.feed = state.feed.filter(c => c !== channel);
    save();
    const list = state.feed.length ? state.feed.map(c => '<#' + c + '>').join(', ')
                                   : 'none set, updates go to the #updates channel';
    return finish(i, card('Game updates are posted in: ' + list + '.'));
  }
  if (name === 'rules') {
    const r = await ensureRules(g, { channel: opt(o, 'channel'), force: true });
    const text = r.status === 'posted' ? 'Rules posted in <#' + r.channel + '>.'
               : r.status === 'updated' || r.status === 'same' ? 'Rules updated in <#' + r.channel + '>.'
               : r.status === 'no-channel' ? 'There is no #rules channel. Create one or choose a channel.'
               : 'Could not post the rules (error ' + r.code + '). Check that I can send messages and embeds there.';
    return finish(i, card(text));
  }
  if (name === 'relay') {
    const channel = opt(o, 'channel');
    state.relay[mod] = channel;
    save();
    return finish(i, card('Messages you send me in DMs will be posted in <#' + channel + '>. ' +
                          'Start a message with #channel-name to post somewhere else.'));
  }
  if (name === 'modlog') {
    const channel = opt(o, 'channel');
    gstate(g.id).modlog = channel || '';
    save();
    return finish(i, card(channel ? 'Moderation logs go to <#' + channel + '>.' : 'Moderation logs are off.'));
  }

  const target = resolvedUser(opt(o, 'user'));
  const targetMember = i.data.resolved && i.data.resolved.members && i.data.resolved.members[target.id];
  if (name === 'warnings') {
    const list = activeStrikes(g.id, target.id);
    if (!list.length) return finish(i, card('<@' + target.id + '> has no active strikes.'));
    const lines = list.map(s => '<t:' + Math.floor(s.t / 1000) + ':R> ' + s.p + (s.p === 1 ? ' strike' : ' strikes') +
      (s.r ? ', rule ' + s.r : '') + ', ' + ((A.KIND[s.k] && A.KIND[s.k].note) || (s.k === 'manual' ? 'warned by a moderator' : s.k)) +
      (s.by && s.by !== 'auto' ? ', by <@' + s.by + '>' : ''));
    return finish(i, card('**<@' + target.id + '> has ' + R.strikes(points(list)) + ':**\n' + lines.join('\n')));
  }
  if (name === 'pardon') {
    delete state.strikes[g.id + ':' + target.id];
    const caseNo = ++state.cases;
    save();
    await modlog(g, { caseNo, title: 'Strikes removed', color: R.COLORS.ok, user: target.id, by: mod });
    return finish(i, card('All strikes of <@' + target.id + '> are removed.'));
  }
  // Discord не даёт мьютить администраторов, а себя владелец наказывать не станет
  if (target.id === g.owner || (targetMember && memberPerms(g, target.id, targetMember.roles) & PERM.ADMIN))
    return finish(i, card('Administrators cannot be punished.'));
  if (target.id === (me && me.id)) return finish(i, card('That is me.'));

  if (name === 'warn') {
    const rule = opt(o, 'rule'), reason = opt(o, 'reason');
    const f = { kind: 'manual', rule: rule || 0, weight: 1, note: reason || (rule ? R.ruleById(rule).title : 'Warned by a moderator') };
    const res = await punish(g, target, f, { by: mod,
      until: Date.parse(targetMember && targetMember.communication_disabled_until) || 0 });
    return finish(i, card('<@' + target.id + '> now has ' + R.strikes(res.total) + '. Action: ' + R.describe(res.step).toLowerCase() +
                          (res.done ? '.' : ' (failed: I lack permission).'), color(res.step)));
  }
  if (name === 'mute') {
    const d = DURATIONS.find(([n]) => n === opt(o, 'duration')) || DURATIONS[0];
    const reason = opt(o, 'reason') || 'Muted by a moderator';
    const caseNo = ++state.cases;
    save();
    const done = await timeout(g, target.id, d[1], 'Case ' + caseNo + ': ' + reason);
    if (done) {
      await dm(target.id, { embeds: [{ color: R.COLORS.mute, title: 'You have been muted',
        description: 'A moderator of **' + g.name + '** muted you for ' + d[0] + '.',
        fields: [{ name: 'Reason', value: reason.slice(0, 1000) }],
        footer: { text: 'If you think this is a mistake, message a moderator.' } }] }).catch(() => {});
      await modlog(g, { caseNo, title: 'Mute for ' + d[0], color: R.COLORS.mute, user: target.id, by: mod, reason });
    }
    return finish(i, card(done ? '<@' + target.id + '> is muted for ' + d[0] + '.' : 'I could not mute them. My role must be above theirs and have Timeout Members.'));
  }
  if (name === 'unmute') {
    const done = await timeout(g, target.id, 0, 'Unmuted by a moderator');
    if (done) await modlog(g, { caseNo: ++state.cases, title: 'Mute lifted', color: R.COLORS.ok, user: target.id, by: mod });
    save();
    return finish(i, card(done ? '<@' + target.id + '> can talk again.' : 'I could not unmute them.'));
  }
}

async function onModal(i, g) {
  const id = String(i.data && i.data.custom_id || '');
  const m = /^post:(\d+):(embed|plain)$/.exec(id);
  if (!m) return;
  const values = {};
  (i.data.components || []).forEach(row => (row.components || []).forEach(c => { values[c.custom_id] = String(c.value || ''); }));
  const title = (values.title || '').trim(), text = (values.text || '').trim();
  await defer(i);
  const body = m[2] === 'plain'
    ? { content: (title ? '**' + title + '**\n' : '') + text, allowed_mentions: { parse: ['users', 'roles', 'everyone'] } }
    : { embeds: [{ color: R.COLORS.neutral, title: title || undefined, description: text }], allowed_mentions: { parse: [] } };
  const r = await sendMessage(m[1], body);
  if (!ok(r)) return finish(i, card('Could not post in <#' + m[1] + '> (error ' + r.status + '). Check that I can send messages and embeds there.'));
  return finish(i, card('Posted in <#' + m[1] + '>: https://discord.com/channels/' + g.id + '/' + m[1] + '/' + r.body.id));
}

/* ---------- подключение ---------- */
async function setupGuild(g) {
  if (setupDone.has(g.id)) return;
  setupDone.add(g.id);
  try {
    await registerCommands(g);
    await ensureRules(g);
    await ensureNativeAutomod(g);
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
    // правка сообщения проверяется так же: иначе нарушение дописали бы позже
    // (без edited_timestamp это Discord дорисовал превью ссылки, а не правка)
    case 'MESSAGE_UPDATE': if (typeof d.content === 'string' && d.author && d.edited_timestamp) onMessage(d, true).catch(() => {}); break;
    case 'MESSAGE_DELETE': if (!d.guild_id) onDirectDelete(d).catch(() => {}); break;
    case 'AUTO_MODERATION_ACTION_EXECUTION': onAutomodExecution(d).catch(e => log('automod event failed:', e.message)); break;
    case 'INTERACTION_CREATE': onInteraction(d).catch(e => log('command failed:', e.message)); break;
  }
}

function connect(intents) {
  gw = new Gateway({ token: token(), intents,
    presence: { since: null, afk: false, status: 'online', activities: [{ name: 'aibrofist.online', type: 3 }] } });
  gw.on('dispatch', onDispatch);
  gw.on('debug', m => { if (process.env.DISCORD_DEBUG) log(m); });
  gw.on('fatal', (code, why) => log('gateway stopped (' + code + ' ' + why + '): check DISCORD_BOT_TOKEN'));
  gw.on('disallowed', () => {
    // «Message Content Intent» не включён в настройках бота — работаем без
    // чтения текста: встроенная AutoMod, флуд и картинки остаются
    log('Message Content Intent is off in the Discord Developer Portal (Bot tab): text checks are paused until it is enabled');
    gw.removeAllListeners();
    connect(intents & ~INTENT.MESSAGE_CONTENT);
  });
  gw.connect();
}

function start() {
  if (!token() || gw) return;
  loadState();
  connect(ALL_INTENTS);
  const t1 = setInterval(() => {
    flood.sweep();
    const now = Date.now();
    for (const [k, v] of lastHit) if (now - v.t > COOLDOWN) lastHit.delete(k);
  }, 60000);
  if (t1.unref) t1.unref();
  timers.push(t1);
}

function stop() {
  if (gw) { gw.removeAllListeners(); gw.destroy(); gw = null; }
  timers.forEach(clearInterval); timers = [];
  saveNow();
  guilds.clear(); setupDone.clear(); lastHit.clear();
}

// каналы для новостей (updatesFeed.js): заданные командой /updates
function feedChannels() {
  loadState();
  return state.feed.slice();
}

module.exports = { start, stop, feedChannels, commandDefs, _test: { state: () => state, guilds, ensureRules, punish, reload: () => { loaded = false; loadState(); } } };
