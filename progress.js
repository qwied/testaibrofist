/* Прогресс игрока (идеи игроков): уровень и опыт, значки профиля, промокоды от владельца
   и подарок монет другу. Опыт — это уже накопленные очки Race и Hide and Seek (u.score +
   u.hsScore), отдельного счётчика нет: уровень растёт сам от обычной игры. */
'use strict';
const fs = require('fs');
const path = require('path');
const { atomicWriteFileSync } = require('./fsAtomic.js');

const DATA_DIR = path.join(__dirname, 'data');
const PROMO_FILE = path.join(DATA_DIR, 'promos.json');
const GIFT_DAY_MAX = 200;        // сколько монет можно подарить за сутки
const low = s => String(s || '').toLowerCase();

// уровень N начинается с 100·(N−1)² опыта: 1 → 0, 2 → 100, 3 → 400, 4 → 900 …
function levelOf(xp) {
  xp = Math.max(0, Number(xp) || 0);
  const lvl = Math.floor(Math.sqrt(xp / 100)) + 1;
  return { level: lvl, xp, from: 100 * (lvl - 1) * (lvl - 1), to: 100 * lvl * lvl };
}

function badgesOf(u, acc, mapsCount) {
  const out = [];
  const years = Math.floor((Date.now() - (Number(u.joined) || Date.now())) / (365.25 * 864e5));
  if (acc.isOwner(u)) out.push({ id: 'creator', t: 'Game creator' });
  if (years >= 1) out.push({ id: 'veteran', t: 'Veteran · ' + years + (years === 1 ? ' year' : ' years') });
  if (mapsCount >= 10) out.push({ id: 'builder2', t: 'Master builder' });
  else if (mapsCount >= 1) out.push({ id: 'builder', t: 'Map creator' });
  if ((u.rcFin || 0) >= 50) out.push({ id: 'racer', t: 'Racer' });
  if ((u.hsCat || 0) >= 50) out.push({ id: 'hunter', t: 'Hunter' });
  if ((u.hsSurv || 0) >= 50) out.push({ id: 'survivor', t: 'Survivor' });
  if ((u.dailyStreak || 0) >= 7) out.push({ id: 'streak', t: 'Daily streak · ' + u.dailyStreak });
  return out;
}

let promos = {};
function loadPromos() {
  try { if (fs.existsSync(PROMO_FILE)) promos = JSON.parse(fs.readFileSync(PROMO_FILE, 'utf8')) || {}; } catch (e) { promos = {}; }
  if (typeof promos !== 'object' || Array.isArray(promos)) promos = {};
}
function savePromos() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    atomicWriteFileSync(PROMO_FILE, JSON.stringify(promos, null, 2));
  } catch (e) { console.log('не смог сохранить promos.json:', e.message); }
}
loadPromos();
const cleanCode = c => String(c || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);

function register(app, acc) {
  const db = () => acc.getDb();
  const userOf = name => db().users[acc.key(name)];

  app.get('/getProgress', (req, res) => {
    const u = req.query.name ? userOf(req.query.name) : acc.currentUser(req);
    if (!u) return res.json(null);
    let mapsCount = 0;
    try { mapsCount = require('./maps.js').allMaps().filter(m => low(m.author) === low(u.name)).length; } catch (e) {}
    const lv = levelOf((u.score || 0) + (u.hsScore || 0));
    res.json(Object.assign(lv, {
      name: u.name,
      badges: badgesOf(u, acc, mapsCount),
      stars: Math.floor((u.rcFin || 0) / 50),     // звезда у ника за каждые 50 пройденных карт
      finished: u.rcFin || 0,
      streak: u.dailyStreak || 0
    }));
  });

  // ---------- промокоды: создаёт владелец, игрок вводит в «Настройках» ----------
  app.post('/owner/promo/create', (req, res) => {
    const u = acc.currentUser(req);
    if (!acc.isOwner(u)) return res.json({ status: 'error', message: 'Owner only' });
    const code = cleanCode(req.body.code);
    const coins = Math.max(1, Math.min(10000, parseInt(req.body.coins) || 0));
    const uses = Math.max(1, Math.min(100000, parseInt(req.body.uses) || 1));
    if (code.length < 3) return res.json({ status: 'error', message: 'Code is too short' });
    promos[code] = { coins, uses, used: 0, by: [], at: Date.now() };
    savePromos();
    res.json({ status: 'success', code, coins, uses });
  });
  app.get('/owner/promo/list', (req, res) => {
    if (!acc.isOwner(acc.currentUser(req))) return res.json([]);
    res.json(Object.keys(promos).map(c => ({ code: c, coins: promos[c].coins, uses: promos[c].uses, used: promos[c].used })));
  });
  app.post('/promo/redeem', (req, res) => {
    const u = acc.currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Sign in first' });
    const code = cleanCode(req.body.code), p = promos[code];
    if (!p) return res.json({ status: 'error', message: 'No such code' });
    if ((p.by || []).indexOf(low(u.name)) !== -1) return res.json({ status: 'error', message: 'You already used this code' });
    if (p.used >= p.uses) return res.json({ status: 'error', message: 'This code has run out' });
    p.used++; (p.by = p.by || []).push(low(u.name));
    savePromos();
    u.coins = (u.coins || 0) + p.coins;
    acc.save(); acc.logCoins(u.name, p.coins);
    res.json({ status: 'success', coins: u.coins, got: p.coins, message: '+' + p.coins + ' coins' });
  });

  // ---------- подарить монеты другу ----------
  app.post('/giftCoins', (req, res) => {
    const u = acc.currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Sign in first' });
    const to = userOf(req.body.to);
    const n = parseInt(req.body.amount) || 0;
    if (!to) return res.json({ status: 'error', message: 'No such player' });
    if (to === u) return res.json({ status: 'error', message: 'You cannot gift yourself' });
    if (n < 1) return res.json({ status: 'error', message: 'Enter how many coins' });
    const day = new Date().toISOString().slice(0, 10);
    if (u.giftDay !== day) { u.giftDay = day; u.giftSum = 0; }
    if ((u.giftSum || 0) + n > GIFT_DAY_MAX) return res.json({ status: 'error', message: 'You can gift up to ' + GIFT_DAY_MAX + ' coins a day' });
    if ((u.coins || 0) < n) return res.json({ status: 'error', message: 'Not enough coins' });
    u.coins -= n; u.giftSum = (u.giftSum || 0) + n;
    to.coins = (to.coins || 0) + n;
    acc.save(); acc.logCoins(to.name, n);
    res.json({ status: 'success', coins: u.coins, message: 'Gifted ' + n + ' coins to ' + to.name });
  });
}

module.exports = { register, levelOf, badgesOf };
