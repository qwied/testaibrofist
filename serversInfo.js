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
//
// Заодно — серверы оригинального brofist.io (их /getGamingServersInfo):
// тянем не чаще раза в секунду и только пока кто-то смотрит; не ответил —
// следующая попытка через 30 секунд. Формат их ответа нигде не описан,
// поэтому разбор понимает любой разумный вид списка серверов (normalize).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const crypto = require('crypto');
const { atomicWriteFileSync } = require('./fsAtomic.js');

const DATA_DIR = process.env.SERVERS_DATA_DIR || path.join(__dirname, 'data');
const KEY_FILE = path.join(DATA_DIR, 'serverStats.json');
const PAGE_FILE = path.join(__dirname, 'stats.html');
const BF_URL = process.env.BROFIST_SERVERS_URL || 'https://brofist.io/getGamingServersInfo';
const BF_FRESH_MS = 1000;            // данные brofist.io свежие секунду
const BF_RETRY_MS = 30000;           // не ответил — следующая попытка не раньше
const BF_MAX_BYTES = 512 * 1024;
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

/* ---------- brofist.io ---------- */
const NUM_KEYS = ['players', 'online', 'playerCount', 'playersCount', 'numPlayers', 'playersOnline', 'onlinePlayers',
                  'count', 'users', 'current', 'clients', 'population', 'connected', 'total'];
const MAX_KEYS = ['maxPlayers', 'max', 'capacity', 'limit', 'slots', 'maxClients', 'max_players', 'playersMax'];
const NAME_KEYS = ['name', 'title', 'serverName', 'label', 'region', 'id', 'host', 'ip', 'address', 'url'];
const MODE_KEYS = ['mode', 'gameMode', 'game', 'type'];
const REGION_KEYS = ['region', 'location', 'country', 'continent'];
const TOTAL_KEYS = ['total', 'online', 'players', 'totalPlayers', 'playersOnline', 'count'];

function num(v) {
  if (typeof v === 'number' && isFinite(v)) return Math.max(0, Math.round(v));
  if (typeof v === 'string' && /^\s*\d{1,7}\s*$/.test(v)) return Number(v);
  if (Array.isArray(v)) return v.length;              // список игроков — считаем его длину
  return null;
}
const str = v => (typeof v === 'string' || typeof v === 'number') && String(v).trim() ? String(v).trim().slice(0, 40) : null;
function pick(o, keys, conv) {
  const own = Object.keys(o);
  for (const k of keys) {
    const real = own.find(x => x.toLowerCase() === k.toLowerCase());
    if (real === undefined) continue;
    const v = conv(o[real]);
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

// любой разумный вид ответа -> { online, servers: [{ name, players, max, mode, region }] }
function normalize(raw) {
  let entries = null, total = null;
  if (Array.isArray(raw)) entries = raw.map((x, i) => [String(i + 1), x]);
  else if (raw && typeof raw === 'object') {
    const arrKey = Object.keys(raw).find(k => Array.isArray(raw[k]) && raw[k].some(x => x && typeof x === 'object'));
    if (arrKey) {
      entries = raw[arrKey].map((x, i) => [String(i + 1), x]);
      total = pick(raw, TOTAL_KEYS, v => (typeof v === 'number' || typeof v === 'string') ? num(v) : null);
    } else entries = Object.entries(raw);             // { "EU #1": 12, ... } или { "EU": {...} }
  }
  if (!entries) return null;
  const servers = [];
  for (const [k, v] of entries) {
    if (typeof v === 'number' || typeof v === 'string') {
      const n = num(v);
      if (n !== null) servers.push({ name: str(k) || '?', players: n, max: null, mode: null, region: null });
      continue;
    }
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const players = pick(v, NUM_KEYS, num);
    const name = pick(v, NAME_KEYS, str) || str(k) || '?';
    if (players === null && !pick(v, NAME_KEYS, str)) continue;
    servers.push({
      name, players: players || 0,
      max: pick(v, MAX_KEYS, v2 => (typeof v2 === 'number' || typeof v2 === 'string') ? num(v2) : null),
      mode: pick(v, MODE_KEYS, str), region: pick(v, REGION_KEYS, str)
    });
    if (servers.length >= 50) break;
  }
  if (!servers.length) return null;
  const sum = servers.reduce((n, s) => n + s.players, 0);
  return { online: total !== null && total >= sum ? total : sum, servers };
}

let bf = { ok: false, online: null, servers: [], at: 0, error: 'not loaded yet', via: null };
let bfBusy = null, bfTryAt = 0;

function get(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, family: 4, timeout: 4000 }, res => {
      let size = 0; const chunks = [];
      res.on('data', c => { size += c.length; if (size > BF_MAX_BYTES) req.destroy(new Error('too big')); else chunks.push(c); });
      res.on('end', () => resolve({ status: res.statusCode, type: String(res.headers['content-type'] || ''), body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function fetchVia(url, headers) {
  const r = await get(url, headers);
  if (r.status !== 200) throw new Error(r.status === 403 || r.status === 503 ? 'blocked (' + r.status + ')' : 'HTTP ' + r.status);
  let data;
  try { data = JSON.parse(r.body); } catch (e) { throw new Error(/<html/i.test(r.body) ? 'blocked (page instead of data)' : 'not JSON'); }
  const n = normalize(data);
  if (!n) throw new Error('unknown format');
  return n;
}

const UA = 'Mozilla/5.0 (compatible; AIBROFIST-servers/1.0; +' + SITE + ')';
async function loadBrofist() {
  const tries = [{ via: 'direct', url: BF_URL, headers: { 'user-agent': UA, accept: 'application/json' } }];
  // с хостинга сайт может быть закрыт — тогда через наш посредник в Cloudflare (cloudflare/discord-relay.mjs)
  const relay = String(process.env.DISCORD_RELAY_URL || '').replace(/\/+$/, ''), rkey = process.env.DISCORD_RELAY_KEY;
  if (relay && rkey) tries.push({ via: 'relay', url: relay + '/brofist', headers: { 'x-relay-key': rkey, accept: 'application/json' } });
  // сначала тот путь, что сработал в прошлый раз
  if (bf.via === 'relay' && tries.length > 1) tries.reverse();
  const errors = [];                                   // все причины — на странице видно, что именно мешает
  for (const t of tries) {
    try {
      const n = await fetchVia(t.url, t.headers);
      bf = { ok: true, online: n.online, servers: n.servers, at: Date.now(), error: null, via: t.via };
      return;
    } catch (e) { errors.push(t.via + ': ' + e.message); }
  }
  bf = Object.assign({}, bf, { ok: bf.ok && Date.now() - bf.at < 60000, error: errors.join('; ') });
  bfTryAt = Date.now() + BF_RETRY_MS;
}

// освежить в фоне, если пора; ответ отдаём сразу из того, что есть
function touchBrofist() {
  if (bfBusy || process.env.BROFIST_OFF === '1') return bfBusy;
  const now = Date.now();
  if (now < bfTryAt || (bf.ok && now - bf.at < BF_FRESH_MS)) return null;
  bfTryAt = now + BF_FRESH_MS;
  bfBusy = loadBrofist().catch(() => {}).finally(() => { bfBusy = null; });
  return bfBusy;
}
const bfView = () => ({ ok: bf.ok, online: bf.online, count: bf.servers.length, servers: bf.servers.slice(0, 30),
                        at: bf.at || null, error: bf.ok ? null : bf.error });

/* ---------- наша игра ---------- */
const MODE_NAME = { race: 'Race', hideAndSeek: 'Hide and Seek' };
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
  touchBrofist();
  return { at: Date.now(), aibrofist: ours(false), brofist: bfView() };
}

function details() {
  touchBrofist();
  const s = snapshot() || {};
  const mem = process.memoryUsage();
  return {
    at: Date.now(), aibrofist: ours(true), brofist: bfView(),
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

module.exports = { register, summary, details, link, rotate, normalize, _test: { touchBrofist, reset: () => { bf = { ok: false, online: null, servers: [], at: 0, error: 'not loaded yet', via: null }; bfTryAt = 0; key = null; } } };
