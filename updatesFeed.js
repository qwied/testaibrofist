// ============ ОБНОВЛЕНИЯ ИГРЫ -> Logs и Discord #updates ============
// Список обновлений ведётся в updates.json в корне репозитория aibrofist
// (в testaibrofist такого файла нет — там этой части нечего делать).
// Новость выходит сразу в двух местах: бот Discord публикует её в канале
// #updates, и только после этого она появляется в ленте Logs. Пока бота
// нет, в Logs не пишется ничего (так попросил владелец), а то, что туда
// успело попасть раньше, при запуске убирается. Что уже опубликовано,
// помним в data/updatesFeed.json — перезапуск ничего не дублирует.
//
// То, что владелец пишет в Logs прямо в игре, бот тоже выкладывает в
// Discord, а правку и удаление такой записи повторяет там же.
//
// Боту нужна переменная окружения DISCORD_BOT_TOKEN. Каналы для новостей:
// заданные командой /updates в Discord (см. discordBot.js) и в
// DISCORD_UPDATES_CHANNEL_ID (можно несколько через запятую); если нет ни
// тех, ни других, бот сам находит канал #updates.
const fs = require('fs');
const path = require('path');
const { atomicWriteFileSync } = require('./fsAtomic.js');
const { api, ok, token, SITE } = require('./discordApi.js');

const SRC_FILE = path.join(__dirname, 'updates.json');
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = process.env.UPDATES_FEED_STATE || path.join(DATA_DIR, 'updatesFeed.json');
/* Публикуются только свежие записи: если data/ вдруг потеряется или бот
   появится не сразу, в канал не вывалится вся история разом. */
const DISCORD_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const RETRY_MS = 15 * 60 * 1000;     // Discord не ответил — пробуем снова позже
const COLOR = 0x99A1AE;

// эмодзи, флаги, тона кожи и склейки — в новостях их быть не должно
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}️‍⃣]/gu;
const clean = s => String(s || '').replace(EMOJI, '').replace(/[ \t]{2,}/g, ' ').trim();

// msgs: какие сообщения Discord соответствуют записи — чтобы править и удалять их
let state = { logged: [], posted: [], channel: '', msgs: {} };
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
      channel: typeof s.channel === 'string' ? s.channel : '',
      msgs: s.msgs && typeof s.msgs === 'object' ? s.msgs : {}
    };
  } catch (e) { /* первый запуск — состояния ещё нет */ }
}

function saveState() {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    atomicWriteFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) { console.log('[updates] не смог сохранить состояние:', e.message); }
}

// канал #updates на сервере, куда приглашён бот — если другие не заданы
async function findUpdatesChannel() {
  if (state.channel) return state.channel;
  const g = await api('GET', '/users/@me/guilds');
  if (g.status !== 200 || !Array.isArray(g.body)) {
    console.log('[updates] Discord не принял токен бота:', g.status);
    return null;
  }
  for (const guild of g.body) {
    const r = await api('GET', '/guilds/' + guild.id + '/channels');
    if (r.status !== 200 || !Array.isArray(r.body)) continue;
    // 0 — текстовый канал, 5 — канал объявлений
    const text = r.body.filter(c => c && (c.type === 0 || c.type === 5) && typeof c.name === 'string');
    const c = text.find(c => /^[^a-z]*updates$/i.test(c.name)) || text.find(c => /updates/i.test(c.name));
    if (c) { state.channel = c.id; saveState(); return c.id; }
  }
  console.log('[updates] бот не видит канал #updates — пригласите его на сервер Discord');
  return null;
}

async function channels() {
  const set = String(process.env.DISCORD_UPDATES_CHANNEL_ID || '').split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s));
  require('./discordBot.js').feedChannels().forEach(c => { if (set.indexOf(c) === -1) set.push(c); });
  if (set.length) return set;
  const c = await findUpdatesChannel();
  return c ? [c] : [];
}

// карточка новости: заголовок, текст списком, ссылка на Logs, дата
function card(u) {
  const e = {
    color: COLOR,
    title: (u.title || 'Update').slice(0, 256),
    url: SITE + '/logs',
    description: clean(u.text).slice(0, 4000) || undefined,
    footer: { text: 'AIBROFIST' },
    timestamp: new Date(u.date || Date.now()).toISOString()
  };
  const img = (u.images || []).map(i => String(i && i.u || '')).find(s => s.charAt(0) === '/');
  if (img) e.image = { url: SITE + img };
  return { allowed_mentions: { parse: [] }, embeds: [e] };   // никаких @everyone из текста новости
}

// во все каналы новостей; true — если хоть в один вышло
async function postEverywhere(key, u) {
  const sent = [];
  for (const channel of await channels()) {
    const r = await api('POST', '/channels/' + channel + '/messages', card(u));
    if (ok(r) && r.body) { sent.push({ c: channel, m: r.body.id }); continue; }
    if (r.status === 403)
      console.log('[updates] боту нельзя писать в канал ' + channel + ' — разрешите ему отправку сообщений и ссылок');
    else
      console.log('[updates] Discord не принял новость:', r.status, JSON.stringify(r.body).slice(0, 200));
    // найденный сам канал удалили или бота убрали — в следующий раз ищем заново
    if ((r.status === 403 || r.status === 404) && channel === state.channel) { state.channel = ''; saveState(); }
  }
  if (sent.length) { state.msgs[key] = sent; saveState(); }
  return sent.length > 0;
}

async function publish() {
  if (!token() || busy) return;
  const now = Date.now();
  const fresh = list.filter(u => state.posted.indexOf(u.id) === -1 && now - u.date < DISCORD_MAX_AGE);
  if (!fresh.length) return;
  busy = true;
  try {
    let i = 0;
    for (const u of fresh) {                 // по порядку файла: в канале читается сверху вниз
      if (!(await postEverywhere('upd:' + u.id, u))) break;
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

/* Запись Logs, которую владелец добавил, исправил или удалил в игре. */
async function onLogChange(type, entry) {
  if (!token() || !entry) return;
  const key = entry.src || ('log:' + entry.id);
  try {
    if (type === 'add' && !entry.src) await postEverywhere(key, entry);
    else if (type === 'edit') {
      for (const s of state.msgs[key] || []) await api('PATCH', '/channels/' + s.c + '/messages/' + s.m, card(entry));
    } else if (type === 'delete') {
      for (const s of state.msgs[key] || []) await api('DELETE', '/channels/' + s.c + '/messages/' + s.m);
      if (state.msgs[key]) { delete state.msgs[key]; saveState(); }
    }
  } catch (e) {
    console.log('[updates] Discord недоступен:', e.message);
  }
}

function start(ex) {
  extras = ex;
  loadState();
  if (typeof ex.onLogChange === 'function') ex.onLogChange((type, entry) => { onLogChange(type, entry); });
  list = readUpdates();
  if (!list.length) return;
  if (!token()) {
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

module.exports = { start, readUpdates, clean, card };
