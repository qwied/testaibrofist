// ============ ОБНОВЛЕНИЯ ИГРЫ -> Logs и Discord #updates ============
// Список обновлений ведётся в updates.json в корне репозитория aibrofist
// (в testaibrofist такого файла нет — там модуль ничего не делает).
// Новость выходит сразу в двух местах: бот Discord публикует её в канале
// #updates, и только после этого она появляется в ленте Logs. Пока бота
// нет, в Logs не пишется ничего (так попросил владелец), а то, что туда
// успело попасть раньше, при запуске убирается. Что уже опубликовано,
// помним в data/updatesFeed.json — перезапуск ничего не дублирует.
//
// Боту нужна переменная окружения DISCORD_BOT_TOKEN. Канал он находит
// сам по имени (updates) на сервере, куда приглашён; можно задать и
// явно — DISCORD_UPDATES_CHANNEL_ID.
// Отправка — обычный HTTPS-запрос к API Discord, как в discordAuth.js:
// постоянное подключение к Discord и новая npm-зависимость не нужны.
const fs = require('fs');
const path = require('path');
const https = require('https');
const { atomicWriteFileSync } = require('./fsAtomic.js');

const SRC_FILE = path.join(__dirname, 'updates.json');
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'updatesFeed.json');
/* Публикуются только свежие записи: если data/ вдруг потеряется или бот
   появится не сразу, в канал не вывалится вся история разом. */
const DISCORD_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const RETRY_MS = 15 * 60 * 1000;     // Discord не ответил — пробуем снова позже
const TIMEOUT_MS = 10000;
const SITE = 'https://' + (String(process.env.PRIMARY_HOST || '').trim() || 'aibrofist.online');

// эмодзи, флаги, тона кожи и склейки — в новостях их быть не должно
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}️‍⃣]/gu;
const clean = s => String(s || '').replace(EMOJI, '').replace(/[ \t]{2,}/g, ' ').trim();

let state = { logged: [], posted: [], channel: '' };
let list = [];
let busy = false, extras = null;

function readUpdates() {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(SRC_FILE, 'utf8')); }
  catch (e) {
    if (e.code !== 'ENOENT') console.log('[updates] updates.json не прочитан:', e.message);
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(u => u && typeof u.id === 'string' && u.id.trim() && (u.title || u.text))
    .map(u => ({
      id: u.id.trim(),
      title: clean(u.title).slice(0, 120),
      text: clean(u.text).slice(0, 4000),
      date: Date.parse(u.date) || Date.now()
    }));
}

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    state = {
      logged: Array.isArray(s.logged) ? s.logged : [],
      posted: Array.isArray(s.posted) ? s.posted : [],
      channel: typeof s.channel === 'string' ? s.channel : ''
    };
  } catch (e) { /* первый запуск — состояния ещё нет */ }
}

function saveState() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    atomicWriteFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) { console.log('[updates] не смог сохранить состояние:', e.message); }
}

function api(token, method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      'Authorization': 'Bot ' + token,
      'User-Agent': 'DiscordBot (' + SITE + ', 1.0)'
    };
    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    // family:4 — по той же причине, что в discordAuth.js (битый IPv6 на хостинге)
    const req = https.request('https://discord.com/api/v10' + p, { method, family: 4, headers }, res => {
      let s = '';
      res.on('data', c => { s += c; });
      res.on('end', () => {
        let b = null;
        try { b = JSON.parse(s || 'null'); } catch (e) { /* не JSON — оставим null */ }
        resolve({ status: res.statusCode, body: b });
      });
    });
    req.on('error', reject);
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('Discord request timed out')));
    if (data) req.write(data);
    req.end();
  });
}

// канал #updates на сервере, куда приглашён бот
async function findChannel(token) {
  const fixed = String(process.env.DISCORD_UPDATES_CHANNEL_ID || '').trim();
  if (fixed) return fixed;
  if (state.channel) return state.channel;
  const g = await api(token, 'GET', '/users/@me/guilds');
  if (g.status !== 200 || !Array.isArray(g.body)) {
    console.log('[updates] Discord не принял токен бота:', g.status);
    return null;
  }
  for (const guild of g.body) {
    const r = await api(token, 'GET', '/guilds/' + guild.id + '/channels');
    if (r.status !== 200 || !Array.isArray(r.body)) continue;
    // 0 — текстовый канал, 5 — канал объявлений
    const text = r.body.filter(c => c && (c.type === 0 || c.type === 5) && typeof c.name === 'string');
    const c = text.find(c => c.name.toLowerCase() === 'updates') ||
              text.find(c => /updates/i.test(c.name));
    if (c) { state.channel = c.id; saveState(); return c.id; }
  }
  console.log('[updates] бот не видит канал #updates — пригласите его на сервер Discord');
  return null;
}

async function post(token, channel, u) {
  const body = {
    allowed_mentions: { parse: [] },         // никаких @everyone из текста новости
    embeds: [{
      title: (u.title || 'Update').slice(0, 256),
      description: u.text.slice(0, 4000) || undefined,
      url: SITE + '/logs',
      color: 0x111111
    }]
  };
  let r = await api(token, 'POST', '/channels/' + channel + '/messages', body);
  if (r.status === 429) {
    const wait = Math.min(60, Number(r.body && r.body.retry_after) || 5);
    await new Promise(ok => setTimeout(ok, wait * 1000));
    r = await api(token, 'POST', '/channels/' + channel + '/messages', body);
  }
  if (r.status >= 200 && r.status < 300) return true;
  if (r.status === 403)
    console.log('[updates] боту нельзя писать в #updates — разрешите ему отправку сообщений и ссылок в настройках канала');
  else
    console.log('[updates] Discord не принял новость:', r.status, JSON.stringify(r.body).slice(0, 200));
  // канал удалили или бота убрали — в следующий раз ищем канал заново
  if (r.status === 403 || r.status === 404) { state.channel = ''; saveState(); }
  return false;
}

const botToken = () => String(process.env.DISCORD_BOT_TOKEN || '').trim();

async function publish() {
  const token = botToken();
  if (!token || busy) return;
  const now = Date.now();
  const fresh = list.filter(u => state.posted.indexOf(u.id) === -1 && now - u.date < DISCORD_MAX_AGE);
  if (!fresh.length) return;
  busy = true;
  try {
    const channel = await findChannel(token);
    if (!channel) return;
    let i = 0;
    for (const u of fresh) {                 // по порядку файла: в канале читается сверху вниз
      if (!(await post(token, channel, u))) break;
      // в Logs — только то, что бот уже выложил; +i держит порядок файла
      extras.addAutoLog('upd:' + u.id, u.title, u.text, Date.now() + i++);
      state.posted.push(u.id);
      if (state.logged.indexOf(u.id) === -1) state.logged.push(u.id);
      saveState();
    }
  } catch (e) {
    console.log('[updates] Discord недоступен:', e.message);
  } finally {
    busy = false;
  }
}

function start(ex) {
  extras = ex;
  list = readUpdates();
  if (!list.length) return;
  loadState();
  if (!botToken()) {
    // бота нет — лента Logs без новостей; выложенное раньше убираем
    const gone = extras.removeAutoLogs();
    if (gone || state.logged.length) { state.logged = []; saveState(); }
    console.log('[updates] DISCORD_BOT_TOKEN не задан — новости ждут бота, в Logs ничего не пишем'
                + (gone ? ' (убрано из Logs: ' + gone + ')' : ''));
    return;
  }
  publish();
  setInterval(publish, RETRY_MS).unref();
}

module.exports = { start, readUpdates, clean };
