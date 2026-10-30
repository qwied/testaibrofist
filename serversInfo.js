// ============ СЕРВЕРЫ ИГРЫ: статистика для карты, бота и владельца ============
// «Серверы» игры — это комнаты режимов (race:room1, hideAndSeek:room2…),
// в каждой до ROOM_FULL игроков. Здесь три выхода к одним и тем же данным:
//   GET /api/servers          — открытая сводка без имён игроков: её раз в
//                               секунду читает «живой» текст на картах
//                               (liveText.js) и команда /servers бота;
//   GET /stats/<ключ>         — секретная страница владельца (stats.html);
//   GET /stats/<ключ>/data    — всё подробно: имена, карты, фазы, память.
// Ключ случайный, лежит в data/serverStats.json; ссылку владелец получает
// секретной командой бота (stats), там же может выпустить новую.

'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { atomicWriteFileSync } = require('./fsAtomic.js');

const DATA_DIR = process.env.SERVERS_DATA_DIR || path.join(__dirname, 'data');
const KEY_FILE = path.join(DATA_DIR, 'serverStats.json');
const PAGE_FILE = path.join(__dirname, 'stats.html');
const { SITE } = require('./discordApi.js');          // адрес сайта (PRIMARY_HOST на хостинге)

let snapshot = () => ({ rooms: [], sockets: 0 });   // задаёт server.js (см. register)
let extra = () => ({});
const startedAt = Date.now();
let peak = { n: 0, at: Date.now() };

/* ---------- секретный ключ страницы ---------- */
let key = null;
function secret() {
  if (process.env.STATS_KEY) return process.env.STATS_KEY;
  if (key) return key;
  try { key = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8')).key || null; } catch (e) { key = null; }
  if (!key || !/^[\w-]{20,}$/.test(key)) rotate();
  return key;
}
function rotate() {
  key = crypto.randomBytes(18).toString('base64url');
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    atomicWriteFileSync(KEY_FILE, JSON.stringify({ key, at: Date.now() }));
  } catch (e) { console.log('[servers] ключ страницы не сохранён:', e.message); }
  return key;
}
const link = () => SITE + '/stats/' + secret();
function keyOk(k) {
  const a = Buffer.from(String(k || '')), b = Buffer.from(secret());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- наша игра ---------- */
const MODE_NAME = { race: 'Race', hideAndSeek: 'Hide and Seek', murder: 'Murder Mystery', team: 'Team Battle', war: 'War', party: 'Party', adventure: 'Adventure' };
function ours(full) {
  const s = snapshot() || {};
  const rooms = (s.rooms || []).slice().sort((a, b) => b.players - a.players || String(a.room).localeCompare(String(b.room)));
  const online = rooms.reduce((n, r) => n + r.players, 0);
  if (online > peak.n) peak = { n: online, at: Date.now() };
  const modes = {};
  Object.keys(MODE_NAME).forEach(m => {
    const rs = rooms.filter(r => r.mode === m);
    modes[m] = { name: MODE_NAME[m], players: rs.reduce((n, r) => n + r.players, 0), rooms: rs.length };
  });
  const list = rooms.map(r => {
    const o = { mode: r.mode, modeName: MODE_NAME[r.mode] || r.mode, room: r.room, players: r.players, limit: r.limit,
                status: r.status, phase: r.phase || null, secondsLeft: r.endsAt ? Math.max(0, Math.round((r.endsAt - Date.now()) / 1000)) : null,
                map: r.map || null };
    if (full) Object.assign(o, { names: r.names || [], seeker: r.seeker || null, caught: r.caught || 0, story: !!r.story });
    return o;
  });
  return { online, rooms: rooms.length, modes, list };
}

function summary() {
  return { at: Date.now(), aibrofist: ours(false) };
}

function details() {
  const s = snapshot() || {};
  const mem = process.memoryUsage();
  return {
    at: Date.now(), aibrofist: ours(true),
    server: {
      startedAt, uptimeSec: Math.round(process.uptime()), node: process.version,
      memoryMb: { rss: Math.round(mem.rss / 1048576), heap: Math.round(mem.heapUsed / 1048576) },
      load: os.loadavg().map(x => Math.round(x * 100) / 100), cpus: os.cpus().length,
      sockets: s.sockets || 0, peak
    },
    extra: (() => { try { return extra() || {}; } catch (e) { return {}; } })()
  };
}

function register(app, opts) {
  if (opts && typeof opts.snapshot === 'function') snapshot = opts.snapshot;
  if (opts && typeof opts.extra === 'function') extra = opts.extra;
  app.get('/api/servers', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(summary());
  });
  app.get('/stats/:key/data', (req, res) => {
    if (!keyOk(req.params.key)) return res.status(404).send('Not found');
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.json(details());
  });
  app.get('/stats/:key', (req, res) => {
    if (!keyOk(req.params.key)) return res.status(404).send('Not found');
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.set('Referrer-Policy', 'no-referrer');     // ссылка с ключом не уйдёт на чужие сайты
    res.sendFile(PAGE_FILE);
  });
}

module.exports = { register, summary, details, link, rotate };
