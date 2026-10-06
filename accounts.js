// ============ СИСТЕМА АККАУНТОВ AIBROFIST ============
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { atomicWriteFileSync } = require('./fsAtomic.js');
const { sendCode } = require('./mailer.js');
const { exchangeCode, fetchProfile } = require('./discordAuth.js');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'users.json');

const OWNER = process.env.OWNER_NAME || 'System';
// ссылка в задаче вела на профиль System — считаем оба ника владельцем,
// чтобы права не потерялись при переименовании аккаунта
const OWNER_ALIASES = String(process.env.OWNER_ALIASES || 'System,AIBrofist')
  .split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
if (OWNER_ALIASES.indexOf(OWNER.toLowerCase()) === -1) OWNER_ALIASES.push(OWNER.toLowerCase());

const isOwner = u => !!u && OWNER_ALIASES.indexOf(String(u.name).toLowerCase()) !== -1;

let db = { users: {}, sessions: {} };

function load() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) { console.log('users.json не прочитан, начинаю с нуля'); }
  if (!db.users) db.users = {};
  if (!db.sessions) db.sessions = {};
  // раньше на каждом аккаунте хранился IP регистрации для лимита «один
  // аккаунт на устройство» — лимит убран, адреса чужих людей из базы
  // больше не нужны и не должны в ней оставаться
  Object.values(db.users).forEach(u => { delete u.ip; });
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      atomicWriteFileSync(DB_FILE, JSON.stringify(db, null, 2));
    } catch (e) { console.log('не смог сохранить users.json:', e.message); }
  }, 300);
}
load();

const key = n => String(n || '').toLowerCase();

// самостоятельная смена ника — фиксированная цена в монетах
const NICK_CHANGE_PRICE = 1500;
// свой цвет чата — разовое открытие, как темы (см. themes.js): дальше меняй сколько угодно
const CHAT_COLOR_PRICE = 500;

/* Пароли: scrypt с повышенной стойкостью (N=2^15). Старые хеши
   проверяются по прежним параметрам и молча пересохраняются новыми
   при первом же удачном входе — никто не разлогинивается. */
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64, maxmem: 96 * 1024 * 1024 };
function hashNew(password, salt) {
  const h = crypto.scryptSync(String(password), salt, SCRYPT.keylen,
                              { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem });
  return 'v2$' + h.toString('hex');
}
function hash(password, salt) {   // старый формат — только для проверки унаследованных хешей
  return crypto.scryptSync(String(password), salt, 32).toString('hex');
}
function verifyPassword(password, salt, stored) {
  try {
    if (typeof stored === 'string' && stored.indexOf('v2$') === 0) {
      const want = Buffer.from(stored.slice(3), 'hex');
      const got = crypto.scryptSync(String(password), salt, want.length,
                                    { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem });
      return want.length === got.length && crypto.timingSafeEqual(want, got);
    }
    const want = Buffer.from(stored, 'hex');
    const got = crypto.scryptSync(String(password), salt, want.length);
    return crypto.timingSafeEqual(want, got);
  } catch (e) { return false; }
}
function rehashIfNeeded(u, password) {
  if (typeof u.hash === 'string' && u.hash.indexOf('v2$') !== 0) {
    u.hash = hashNew(password, u.salt);
  }
}

// логин: 2-20 символов, русские и английские буквы, цифры, - _ .
function checkName(name) {
  if (typeof name !== 'string') return 'Enter a username';
  name = name.trim();
  if (name.length < 2) return 'Username must be at least 2 characters';
  if (name.length > 20) return 'Username must be 20 characters or fewer';
  if (!/^[A-Za-zА-Яа-яЁё0-9._-]+$/.test(name))
    return 'Username may only contain letters, digits, and - _ .';
  if (!/^[A-Za-zА-Яа-яЁё0-9]/.test(name)) return 'Username must start with a letter or digit';
  return '';
}
function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length === 0) return 'Enter a password';
  return '';
}
// для новой регистрации пароль не пустой и не короче 4 символов
function checkNewPassword(pw) {
  let err = checkPassword(pw);
  if (err) return err;
  if (pw.length < 4) return 'Password must be at least 4 characters';
  if (pw.length > 100) return 'Password must be 100 characters or fewer';
  return '';
}

/* Реальный адрес игрока за прокси: Cloudflare отдаёт его в CF-Connecting-IP.
   Но это обычный заголовок запроса — если сервер доступен и без такого
   прокси перед собой (например, напрямую по *.up.railway.app), любой
   клиент подставляет туда что хочет и на каждый запрос выглядит новым
   устройством: обходится и лимит попыток входа, и «один аккаунт на IP».
   Доверяем заголовку только когда оператор явно подтвердил переменной
   окружения, что прокси перед сервером есть всегда (см. server.js). */
const TRUST_PROXY_IP = /^(1|true|yes)$/i.test(String(process.env.TRUST_PROXY_IP || ''));
function clientIp(req) {
  if (TRUST_PROXY_IP) {
    const cf = String(req.headers['cf-connecting-ip'] || '').trim();
    if (cf) return cf;
    // первый элемент X-Forwarded-For клиент рисует себе сам
    const xff = String(req.headers['x-forwarded-for'] || '');
    if (xff) return xff.split(',').pop().trim();
  }
  return (req.socket && req.socket.remoteAddress) || '';
}

// один аккаунт на устройство: IP храним хешем, сам адрес не сохраняем
function ipKey(req) {
  const raw = clientIp(req);
  return raw ? crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24) : '';
}

/* ---------- защита от брутфорса ----------
   После серии неудачных попыток вход на аккаунт и с адреса
   временно закрыт. Блокировка копится отдельно по нику и по IP. */
const LOCK_WINDOW = 15 * 60 * 1000;   // окно 15 минут
const LOCK_MAX = 8;                   // столько неудач подряд терпим
const LOCK_TIME = 15 * 60 * 1000;     // само запирание — 15 минут
const loginTries = new Map();         // "ip|name" -> {n, until}
function loginBlocked(k) {
  const t = loginTries.get(k);
  return t && t.until > Date.now() ? t.until : 0;
}
function loginFail(k) {
  const t = loginTries.get(k) || { n: 0, until: 0 };
  t.n++;
  if (t.n >= LOCK_MAX) { t.until = Date.now() + LOCK_TIME; t.n = 0; }
  loginTries.set(k, t);
}
function loginOk(k) { loginTries.delete(k); }
setInterval(() => {
  const now = Date.now();
  loginTries.forEach((t, k) => { if (t.until && t.until < now) loginTries.delete(k); });
  if (loginTries.size > 5000) loginTries.clear();
}, 60000).unref();

/* ---------- вход по коду на почту ----------
   Код живёт только в памяти, как loginTries, — сам адрес нигде не
   сохраняется, пока человек не подтвердит его кодом. kind определяет,
   что произойдёт после верного кода:
     'login'  — почта уже привязана к аккаунту, код просто пускает в него
     'signup' — почта новая, после кода ещё нужно выбрать ник
     'link'   — почта привязывается к уже вошедшему аккаунту с паролем */
const CODE_TTL = 10 * 60 * 1000;        // код годен 10 минут
const CODE_RESEND_WAIT = 60 * 1000;     // не чаще одного письма в минуту на адрес
const CODE_MAX_TRIES = 6;               // столько неверных попыток терпим
const emailCodes = new Map();           // email -> {code, expires, attempts, kind, forName, verified, sentAt}

function emailKey(e) { return String(e || '').trim().toLowerCase(); }
function validEmail(e) { return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/.test(String(e || '').trim()); }
function userByEmail(e) {
  const k = emailKey(e);
  return k ? Object.values(db.users).find(u => emailKey(u.email) === k) || null : null;
}
function genCode() { return String(crypto.randomInt(100000, 1000000)); }

setInterval(() => {
  const now = Date.now();
  emailCodes.forEach((v, k) => { if (v.expires < now) emailCodes.delete(k); });
}, 60000).unref();

/* ---------- вход через Discord ----------
   OAuth2: /auth/discord отправляет на Discord, тот возвращает на
   /auth/discord/callback с кодом. Для новой учётки колбэк не может сразу
   спросить ник (это редирект, а не XHR-форма) — поэтому заводит короткую
   «отложенную» запись в pendingDiscord и шлёт браузер на
   /?authSignup=discord, где фронт уже обычным POST-ом довершает
   регистрацию через /auth/discord/completeSignup. */
const DISCORD_PENDING_TTL = 10 * 60 * 1000;
const pendingDiscord = new Map();   // token -> {discordId, discordName, expires}

function userByDiscordId(id) {
  const k = String(id || '');
  return k ? Object.values(db.users).find(u => String(u.discordId) === k) || null : null;
}
function isHttps(req) {
  return String((req && req.headers || {})['x-forwarded-proto'] || '') === 'https';
}
// res.setHeader('Set-Cookie', x) ЗАМЕНЯЕТ предыдущее значение целиком —
// если на один ответ нужно несколько Set-Cookie (например, свою куку и ту,
// что ставит newSession), добавлять нужно именно так, а не повторным setHeader
function addCookie(res, cookieStr) {
  const existing = res.getHeader('Set-Cookie');
  const arr = existing ? (Array.isArray(existing) ? existing.slice() : [existing]) : [];
  arr.push(cookieStr);
  res.setHeader('Set-Cookie', arr);
}
function discordRedirectUri(req) {
  if (process.env.DISCORD_REDIRECT_URI) return process.env.DISCORD_REDIRECT_URI;
  const proto = isHttps(req) ? 'https' : 'http';
  return proto + '://' + req.headers.host + '/auth/discord/callback';
}

setInterval(() => {
  const now = Date.now();
  pendingDiscord.forEach((v, k) => { if (v.expires < now) pendingDiscord.delete(k); });
}, 60000).unref();

function parseCookies(req) {
  const out = {};
  const src = (req && req.headers && req.headers.cookie) || req || '';
  String(src).split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

/* Сессии: срок 90 дней, при каждом заходе продлевается.
   Старые записи (строка "ник") мигрируют в новый формат при чтении. */
const SESSION_TTL = 90 * 864e5;
function sessionOf(sid) {
  let s = db.sessions[sid];
  if (!s) return null;
  if (typeof s === 'string') { s = { name: s, created: Date.now(), seen: Date.now() }; db.sessions[sid] = s; }
  if (!s.name) return null;
  const now = Date.now();
  if (s.created && now - s.created > SESSION_TTL) { delete db.sessions[sid]; return null; }
  s.seen = now;
  return s;
}
function dropUserSessions(name, exceptSid) {
  Object.keys(db.sessions).forEach(sid => {
    const s = db.sessions[sid];
    const n = typeof s === 'string' ? s : s.name;
    if (key(n) === key(name) && sid !== exceptSid) delete db.sessions[sid];
  });
}
function currentUser(req) {
  const sid = parseCookies(req).sid;
  if (!sid) return null;
  const s = sessionOf(sid);
  if (!s) return null;
  return db.users[key(s.name)] || null;
}
function sessionNameBySid(sid) {           // для сокетов: ник из куки рукопожатия
  const s = sessionOf(sid);
  return s ? s.name : null;
}
const nameIsTaken = n => !!db.users[key(n)];
function newSession(res, name, req) {
  const sid = crypto.randomBytes(32).toString('hex');
  // старую куку гасим: фиксация сессии через подсунутый sid невозможна
  const old = parseCookies(req).sid;
  if (old) delete db.sessions[old];
  db.sessions[sid] = { name: name, created: Date.now(), seen: Date.now() };
  // На своём домене сайт работает по HTTPS — помечаем куку Secure,
  // иначе браузер может отдать её по незащищённому соединению.
  const src = req || res.req || {};
  addCookie(res,
    `sid=${sid}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly` + (isHttps(src) ? '; Secure' : ''));
  save();
}

/* Единая точка начисления монет за игру (забег в Race, поимка/победа
   в Hide and Seek — см. server.js). Раньше клиент сам присылал число
   монет через /addCoins, и это можно было просто подделать. Теперь
   сумму всегда считает сервер и передаёт сюда — но лимит в час общий
   для ВСЕХ источников заработка, а не отдельный на каждый: иначе можно
   было бы накрутить кап Race, кап поимок и кап побед по отдельности. */
const COIN_WINDOW = 60 * 60 * 1000;   // час
const COIN_MAX = 120;                 // максимум монет из игры за час

/* Журнал заработка — отдельно от users.json: только для витрины
   «лучшие сегодня / за неделю» на главной странице, не связан с самим
   балансом. Храним только последние 8 дней, этого хватает на неделю
   с запасом на часовые пояса. */
const COINLOG_FILE = path.join(DATA_DIR, 'coinlog.json');
const COINLOG_KEEP = 8 * 24 * 60 * 60 * 1000;
let coinLog = [];
function loadCoinLog() {
  try {
    if (fs.existsSync(COINLOG_FILE)) coinLog = JSON.parse(fs.readFileSync(COINLOG_FILE, 'utf8'));
  } catch (e) { console.log('coinlog.json не прочитан'); }
  if (!Array.isArray(coinLog)) coinLog = [];
}
let coinLogSaveTimer = null;
function saveCoinLog() {
  clearTimeout(coinLogSaveTimer);
  coinLogSaveTimer = setTimeout(() => {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      atomicWriteFileSync(COINLOG_FILE, JSON.stringify(coinLog, null, 2));
    } catch (e) { console.log('не смог сохранить coinlog.json:', e.message); }
  }, 300);
}
loadCoinLog();

function creditCoins(name, amount) {
  const u = db.users[key(name)];
  if (!u || !(amount > 0)) return 0;
  if (!u.coinWin || Date.now() - u.coinWin > COIN_WINDOW) {
    u.coinWin = Date.now();
    u.coinSum = 0;
  }
  if ((u.coinSum || 0) >= COIN_MAX) return 0;
  let n = Math.min(amount, COIN_MAX - (u.coinSum || 0));
  u.coinSum = (u.coinSum || 0) + n;
  u.coins = (u.coins || 0) + n;
  save();

  const now = Date.now();
  coinLog.push({ name: u.name, amount: n, at: now });
  // старое обрезаем не каждый раз — только когда список ощутимо разросся
  if (coinLog.length % 200 === 0) coinLog = coinLog.filter(e => now - e.at < COINLOG_KEEP);
  saveCoinLog();
  return n;
}

// суммы по журналу (coinLog/scoreLog) за окно времени — общий счётчик для
// «лучшие сегодня/за неделю» и для таблицы лидеров, sinceMs=0 — весь журнал
function sumLog(log, sinceMs) {
  const since = sinceMs ? Date.now() - sinceMs : 0;
  const sums = new Map();
  log.forEach(e => {
    if (sinceMs && e.at < since) return;
    sums.set(e.name, (sums.get(e.name) || 0) + e.amount);
  });
  return Array.from(sums, ([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}
// сумма одного игрока по журналу за окно — для профиля (монеты/очки за день/неделю)
function sumOne(log, name, sinceMs) {
  const since = Date.now() - sinceMs;
  const k = key(name);
  let sum = 0;
  log.forEach(e => { if (e.at >= since && key(e.name) === k) sum += e.amount; });
  return sum;
}
/* Журнал очков забега (Race) — тем же приёмом, что и coinLog: не часть
   баланса, только для витрин «день/неделя» и живой таблички в самой
   гонке. Всё время (all-time) хранится отдельно, в u.score — журнал
   не бессрочный (см. SCORELOG_KEEP). */
const SCORELOG_FILE = path.join(DATA_DIR, 'scorelog.json');
const SCORELOG_KEEP = COINLOG_KEEP;
let scoreLog = [];
function loadScoreLog() {
  try {
    if (fs.existsSync(SCORELOG_FILE)) scoreLog = JSON.parse(fs.readFileSync(SCORELOG_FILE, 'utf8'));
  } catch (e) { console.log('scorelog.json не прочитан'); }
  if (!Array.isArray(scoreLog)) scoreLog = [];
}
let scoreLogSaveTimer = null;
function saveScoreLog() {
  clearTimeout(scoreLogSaveTimer);
  scoreLogSaveTimer = setTimeout(() => {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      atomicWriteFileSync(SCORELOG_FILE, JSON.stringify(scoreLog, null, 2));
    } catch (e) { console.log('не смог сохранить scorelog.json:', e.message); }
  }, 300);
}
loadScoreLog();

/* Очки Race начисляет только сервер — по времени финиша (см. raceFinish
   в server.js), не по заявке клиента.

   Часовой потолок здесь такой же, как у монет. Раньше его не было —
   считалось, что «это игровой счёт, а не валюта, крутить нечего». На
   деле крутить есть что: очки и есть таблица лидеров, а быстрый финиш
   стоит под сотню очков, так что скрипт, гоняющий забеги по кругу,
   забирался на первое место за считанные часы. Живой игрок в этот
   потолок не упирается: он равен примерно двум десяткам идеальных
   забегов подряд без единой паузы. */
const SCORE_WINDOW = 60 * 60 * 1000;   // час
const SCORE_MAX = 2000;                // максимум очков Race за час
function creditScore(name, amount) {
  const u = db.users[key(name)];
  if (!u || !(amount > 0)) return 0;
  if (!u.scoreWin || Date.now() - u.scoreWin > SCORE_WINDOW) {
    u.scoreWin = Date.now();
    u.scoreSum = 0;
  }
  if ((u.scoreSum || 0) >= SCORE_MAX) return 0;
  amount = Math.min(amount, SCORE_MAX - (u.scoreSum || 0));
  u.scoreSum = (u.scoreSum || 0) + amount;
  u.score = (u.score || 0) + amount;
  save();

  const now = Date.now();
  scoreLog.push({ name: u.name, amount: amount, at: now });
  if (scoreLog.length % 200 === 0) scoreLog = scoreLog.filter(e => now - e.at < SCORELOG_KEEP);
  saveScoreLog();
  return amount;
}

/* Очки Hide and Seek — ровно тот же приём, что у Race (см. scoreLog выше):
   всё время копится в u.hsScore, а «за сегодня/за неделю» считается по
   журналу. Своя таблица нужна потому, что в прятках нет времени финиша, по
   которому меряют гонку: там ценно продержаться раунд хайдером и ловить
   сикером, и мерить это очками Race было бы бессмысленно. */
const HSLOG_FILE = path.join(DATA_DIR, 'hslog.json');
const HSLOG_KEEP = COINLOG_KEEP;
let hsLog = [];
function loadHsLog() {
  try {
    if (fs.existsSync(HSLOG_FILE)) hsLog = JSON.parse(fs.readFileSync(HSLOG_FILE, 'utf8'));
  } catch (e) { console.log('hslog.json не прочитан'); }
  if (!Array.isArray(hsLog)) hsLog = [];
}
let hsLogSaveTimer = null;
function saveHsLog() {
  clearTimeout(hsLogSaveTimer);
  hsLogSaveTimer = setTimeout(() => {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      atomicWriteFileSync(HSLOG_FILE, JSON.stringify(hsLog, null, 2));
    } catch (e) { console.log('не смог сохранить hslog.json:', e.message); }
  }, 300);
}
loadHsLog();

// потолок тот же, что у Race: скрипт, крутящий раунды, в таблицу не залезет
const HS_SCORE_WINDOW = 60 * 60 * 1000;
const HS_SCORE_MAX = 600;
function creditHsScore(name, amount) {
  const u = db.users[key(name)];
  if (!u || !(amount > 0)) return 0;
  if (!u.hsWin || Date.now() - u.hsWin > HS_SCORE_WINDOW) {
    u.hsWin = Date.now();
    u.hsSum = 0;
  }
  if ((u.hsSum || 0) >= HS_SCORE_MAX) return 0;
  amount = Math.min(amount, HS_SCORE_MAX - (u.hsSum || 0));
  u.hsSum = (u.hsSum || 0) + amount;
  u.hsScore = (u.hsScore || 0) + amount;
  save();

  const now = Date.now();
  hsLog.push({ name: u.name, amount: amount, at: now });
  if (hsLog.length % 200 === 0) hsLog = hsLog.filter(e => now - e.at < HSLOG_KEEP);
  saveHsLog();
  return amount;
}

function publicUser(u) {
  return { name: u.name, avatar: u.avatar, lastSeen: u.lastSeen };
}
function paginate(list, page) {
  const per = 10;
  page = Math.max(1, parseInt(page) || 1);
  const total = Math.max(1, Math.ceil(list.length / per));
  if (page > total) page = total;
  return { slice: list.slice((page - 1) * per, page * per), label: page + '/' + total };
}

function register(app) {
  // ---------- регистрация / вход ----------
  app.post('/signUp', (req, res) => {
    const name = String(req.body.name || '').trim();
    const password = String(req.body.password || '');
    let err = checkName(name) || checkNewPassword(password);
    if (err) return res.json({ status: 'error', message: err });
    if (db.users[key(name)]) return res.json({ status: 'error', message: 'This username is already taken' });
    // права владельца выдаются по совпадению ника с OWNER_ALIASES (см. isOwner) —
    // без этой проверки самозахват ника «System»/«AIBrofist» через обычную
    // регистрацию давал бы полные права владельца. Сам аккаунт владельца
    // заводится не через публичную форму, а вручную (data/users.json) или
    // через /renameUser существующим владельцем.
    if (OWNER_ALIASES.indexOf(key(name)) !== -1)
      return res.json({ status: 'error', message: 'This username is reserved' });

    const salt = crypto.randomBytes(16).toString('hex');
    db.users[key(name)] = {
      name, salt, hash: hashNew(password, salt),
      joined: Date.now(), lastSeen: Date.now(),
      coins: 0, about: '', avatar: '0',
      items: [], skin: {}, lang: '',
      friends: [], incoming: [], outgoing: []
    };
    newSession(res, name, req);
    save();
    res.json({ status: 'success', message: 'Account created' });
  });

  const doLogin = (req, res) => {
    const name = String(req.body.username || req.body.name || '').trim();
    const password = String(req.body.password || '');
    const k = ipKey(req) + '|' + key(name);
    const blocked = loginBlocked(k);
    if (blocked)
      return res.json({ status: 'error',
                        message: 'Too many attempts. Wait ' +
                                 Math.ceil((blocked - Date.now()) / 60000) + ' min' });
    const u = db.users[key(name)];
    if (!u || !verifyPassword(password, u.salt, u.hash)) {
      loginFail(k);
      return res.json({ status: 'error', message: 'Wrong username or password' });
    }
    loginOk(k);
    rehashIfNeeded(u, password);       // старый хеш тихо заменяется стойким
    u.lastSeen = Date.now();
    newSession(res, u.name, req);
    save();
    res.json({ status: 'success', message: 'Signed in' });
  };
  app.post('/login/password', doLogin);
  app.post('/signIn', doLogin);

  // ---------- вход/регистрация по коду на почту ----------
  app.post('/auth/requestCode', (req, res) => {
    const email = emailKey(req.body.email);
    if (!validEmail(email)) return res.json({ status: 'error', message: 'Enter a valid email address' });

    const prev = emailCodes.get(email);
    if (prev && Date.now() - prev.sentAt < CODE_RESEND_WAIT)
      return res.json({ status: 'error', message: 'Wait ' +
        Math.ceil((CODE_RESEND_WAIT - (Date.now() - prev.sentAt)) / 1000) + 's before requesting another code' });

    const me = currentUser(req);
    const owner = userByEmail(email);
    let kind;
    if (me && (!owner || key(owner.name) === key(me.name))) kind = 'link';
    else if (owner) kind = 'login';
    else if (me) return res.json({ status: 'error', message: 'This email is already linked to another account' });
    else kind = 'signup';

    const code = genCode();
    emailCodes.set(email, {
      code, expires: Date.now() + CODE_TTL, attempts: 0, kind,
      forName: kind === 'link' ? me.name : null, verified: false, sentAt: Date.now()
    });
    sendCode(email, code);
    res.json({ status: 'success', kind });
  });

  app.post('/auth/verifyCode', (req, res) => {
    const email = emailKey(req.body.email);
    const code = String(req.body.code || '').trim();
    const entry = emailCodes.get(email);
    if (!entry || entry.expires < Date.now())
      return res.json({ status: 'error', message: 'Code expired — request a new one' });
    if (entry.attempts >= CODE_MAX_TRIES) {
      emailCodes.delete(email);
      return res.json({ status: 'error', message: 'Too many attempts — request a new code' });
    }
    if (code !== entry.code) {
      entry.attempts++;
      return res.json({ status: 'error', message: 'Wrong code' });
    }

    if (entry.kind === 'login') {
      const u = userByEmail(email);
      emailCodes.delete(email);
      if (!u) return res.json({ status: 'error', message: 'Account not found' });
      u.lastSeen = Date.now();
      newSession(res, u.name, req);
      save();
      return res.json({ status: 'success', mode: 'login' });
    }

    if (entry.kind === 'link') {
      const me = currentUser(req);
      emailCodes.delete(email);
      if (!me || key(me.name) !== key(entry.forName || ''))
        return res.json({ status: 'error', message: 'Sign in again and retry' });
      me.email = email;
      save();
      return res.json({ status: 'success', mode: 'link' });
    }

    // signup: код верный, аккаунта ещё нет — отдельным шагом попросим ник
    entry.verified = true;
    entry.expires = Date.now() + CODE_TTL;
    res.json({ status: 'success', mode: 'needsName' });
  });

  app.post('/auth/completeSignup', (req, res) => {
    const email = emailKey(req.body.email);
    const name = String(req.body.name || '').trim();
    const entry = emailCodes.get(email);
    if (!entry || entry.kind !== 'signup' || !entry.verified || entry.expires < Date.now())
      return res.json({ status: 'error', message: 'Confirm your email code again' });

    let err = checkName(name);
    if (err) return res.json({ status: 'error', message: err });
    if (db.users[key(name)]) return res.json({ status: 'error', message: 'This username is already taken' });
    if (OWNER_ALIASES.indexOf(key(name)) !== -1)
      return res.json({ status: 'error', message: 'This username is reserved' });
    if (userByEmail(email))
      return res.json({ status: 'error', message: 'This email is already linked to another account' });

    emailCodes.delete(email);
    db.users[key(name)] = {
      name, email,
      joined: Date.now(), lastSeen: Date.now(),
      coins: 0, about: '', avatar: '0',
      items: [], skin: {}, lang: '',
      friends: [], incoming: [], outgoing: []
    };
    newSession(res, name, req);
    save();
    res.json({ status: 'success', message: 'Account created' });
  });

  // ---------- вход через Discord ----------
  app.get('/auth/discord', (req, res) => {
    if (!process.env.DISCORD_CLIENT_ID)
      return res.status(503).send('Discord sign-in is not configured yet');
    const state = crypto.randomBytes(16).toString('hex');
    addCookie(res, 'dstate=' + state + '; Path=/; Max-Age=600; SameSite=Lax; HttpOnly' + (isHttps(req) ? '; Secure' : ''));
    const url = 'https://discord.com/api/oauth2/authorize?' + new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      redirect_uri: discordRedirectUri(req),
      response_type: 'code',
      scope: 'identify',
      state: state
    }).toString();
    res.redirect(url);
  });

  app.get('/auth/discord/callback', async (req, res) => {
    try {
      const code = String(req.query.code || '');
      const state = String(req.query.state || '');
      const cookies = parseCookies(req);
      if (!code || !state || state !== cookies.dstate)
        return res.status(400).send('Discord sign-in failed — please try again');

      const token = await exchangeCode(code, discordRedirectUri(req));
      if (!token || !token.access_token)
        return res.status(400).send('Discord sign-in failed — please try again');
      const profile = await fetchProfile(token.access_token);
      if (!profile || !profile.id)
        return res.status(400).send('Discord sign-in failed — please try again');

      const me = currentUser(req);
      const owner = userByDiscordId(profile.id);

      if (me && (!owner || key(owner.name) === key(me.name))) {
        me.discordId = profile.id;
        me.discordName = profile.username || '';
        save();
        addCookie(res, 'dstate=; Path=/; Max-Age=0');
        return res.redirect('/?linked=discord');
      }
      if (owner) {
        owner.lastSeen = Date.now();
        newSession(res, owner.name, req);
        save();
        addCookie(res, 'dstate=; Path=/; Max-Age=0');
        return res.redirect('/');
      }
      if (me) return res.status(400).send('This Discord account is already linked to another user');

      const pendingToken = crypto.randomBytes(24).toString('hex');
      pendingDiscord.set(pendingToken, {
        discordId: profile.id, discordName: profile.username || '',
        expires: Date.now() + DISCORD_PENDING_TTL
      });
      addCookie(res, 'dstate=; Path=/; Max-Age=0');
      addCookie(res, 'pendingAuth=' + pendingToken + '; Path=/; Max-Age=600; SameSite=Lax; HttpOnly' + (isHttps(req) ? '; Secure' : ''));
      res.redirect('/?authSignup=discord');
    } catch (e) {
      console.error('[discord] callback threw:', e && e.stack || e);
      res.status(500).send('Discord sign-in failed — please try again');
    }
  });

  app.post('/auth/discord/completeSignup', (req, res) => {
    const name = String(req.body.name || '').trim();
    const token = parseCookies(req).pendingAuth;
    const entry = token && pendingDiscord.get(token);
    if (!entry || entry.expires < Date.now())
      return res.json({ status: 'error', message: 'Sign in with Discord again' });

    let err = checkName(name);
    if (err) return res.json({ status: 'error', message: err });
    if (db.users[key(name)]) return res.json({ status: 'error', message: 'This username is already taken' });
    if (OWNER_ALIASES.indexOf(key(name)) !== -1)
      return res.json({ status: 'error', message: 'This username is reserved' });
    if (userByDiscordId(entry.discordId))
      return res.json({ status: 'error', message: 'This Discord account is already linked to another user' });

    pendingDiscord.delete(token);
    db.users[key(name)] = {
      name, discordId: entry.discordId, discordName: entry.discordName,
      joined: Date.now(), lastSeen: Date.now(),
      coins: 0, about: '', avatar: '0',
      items: [], skin: {}, lang: '',
      friends: [], incoming: [], outgoing: []
    };
    newSession(res, name, req);
    addCookie(res, 'pendingAuth=; Path=/; Max-Age=0');
    save();
    res.json({ status: 'success', message: 'Account created' });
  });

  // ---------- смена пароля ----------
  app.post('/changePassword', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Sign in first' });
    const oldPw = String(req.body.oldPassword || '');
    const newPw = String(req.body.newPassword || '');
    // аккаунт, заведённый по коду на почту, пароля ещё не имеет — это
    // первая его установка, старый проверять не с чем
    if (u.hash && !verifyPassword(oldPw, u.salt, u.hash))
      return res.json({ status: 'error', message: 'Current password is incorrect' });
    const err = checkNewPassword(newPw);
    if (err) return res.json({ status: 'error', message: err });
    u.salt = crypto.randomBytes(16).toString('hex');
    u.hash = hashNew(newPw, u.salt);
    // на всех других устройствах выкидываем: после смены пароля там придётся войти заново
    const sid = parseCookies(req).sid;
    dropUserSessions(u.name, sid);
    save();
    res.json({ status: 'success', message: 'Password changed' });
  });

  // ---------- смена ника самим игроком: за монеты ----------
  app.post('/changeNickname', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Sign in first' });
    const to = String(req.body.name || '').trim();
    const err = checkName(to);
    if (err) return res.json({ status: 'error', message: err });
    if (key(to) === key(u.name))
      return res.json({ status: 'error', message: 'This is already your username' });
    if (OWNER_ALIASES.indexOf(key(to)) !== -1)
      return res.json({ status: 'error', message: 'This username is reserved' });
    if (db.users[key(to)])
      return res.json({ status: 'error', message: 'Username «' + to + '» is already taken' });

    const coins = u.coins || 0;
    if (coins < NICK_CHANGE_PRICE)
      return res.json({
        status: 'error',
        message: 'You need ' + (NICK_CHANGE_PRICE - coins) + ' more of ' + NICK_CHANGE_PRICE + ' coins'
      });

    const old = u.name;
    u.coins = coins - NICK_CHANGE_PRICE;
    u.name = to;
    delete db.users[key(old)];
    db.users[key(to)] = u;
    // чиним связи в друзьях/сессиях — тот же приём, что и в /renameUser (extras.js)
    const fix = list => (list || []).map(n => (key(n) === key(old) ? to : n));
    Object.values(db.users).forEach(x => {
      x.friends = fix(x.friends); x.incoming = fix(x.incoming); x.outgoing = fix(x.outgoing);
    });
    Object.keys(db.sessions).forEach(sid => {
      const s = db.sessions[sid];
      const n = typeof s === 'string' ? s : (s && s.name);
      if (key(n) !== key(old)) return;
      if (typeof s === 'string') db.sessions[sid] = to;
      else s.name = to;
    });
    save();
    /* Раньше карты оставались подписаны старым именем: не удалялись, но
       и не находились нигде под новым ником — для игрока это выглядело
       так же, как пропажа. renameAuthor переносит авторство самих карт
       и чужие избранное/папки, которые на них ссылаются. */
    require('./maps.js').renameAuthor(old, to);
    res.json({ status: 'success', message: 'Nickname changed to «' + to + '»', name: to, coins: u.coins });
  });

  // ---------- свой цвет чата: разовое открытие за монеты, как темы ----------
  app.post('/chatColor/unlock', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Sign in first' });
    if (u.chatColorUnlocked)
      return res.json({ status: 'success', unlocked: true, coins: u.coins || 0 });

    const coins = u.coins || 0;
    if (coins < CHAT_COLOR_PRICE)
      return res.json({
        status: 'error',
        message: 'You need ' + (CHAT_COLOR_PRICE - coins) + ' more of ' + CHAT_COLOR_PRICE + ' coins'
      });

    u.coins = coins - CHAT_COLOR_PRICE;
    u.chatColorUnlocked = true;
    save();
    res.json({ status: 'success', unlocked: true, coins: u.coins, message: 'Chat color unlocked' });
  });

  app.post('/logOut', (req, res) => {
    const sid = parseCookies(req).sid;
    if (sid) delete db.sessions[sid];
    res.setHeader('Set-Cookie', 'sid=; Path=/; Max-Age=0');
    save();
    res.json({ status: 'success' });
  });

  // выход на всех устройствах сразу
  app.post('/logOutAll', (req, res) => {
    const u = currentUser(req);
    if (u) dropUserSessions(u.name, null);
    res.setHeader('Set-Cookie', 'sid=; Path=/; Max-Age=0');
    save();
    res.json({ status: 'success' });
  });

  // ---------- состояние ----------
  app.get('/iSigned', (req, res) => {
    const u = currentUser(req);
    res.json({ data: u ? { guest: false, name: u.name, nameChange: false }
                       : { guest: true, name: '', nameChange: false } });
  });
  app.get('/amISigned', (req, res) => {
    const u = currentUser(req);
    res.json({ data: { guest: !u, name: u ? u.name : '' } });
  });
  app.get('/getMyName', (req, res) => {
    const u = currentUser(req);
    res.json(u ? u.name : '');
  });
  app.post('/setLastSeenDate', (req, res) => {
    const u = currentUser(req);
    if (u) { u.lastSeen = Date.now(); save(); }
    res.json({ status: 'success' });
  });

  // ---------- профиль ----------
  app.get('/getAvatar', (req, res) => {
    const u = db.users[key(req.query.name)];
    res.json({ avatar: u ? u.avatar : '0' });
  });
  app.get('/getJoinDate', (req, res) => {
    const u = db.users[key(req.query.name)];
    res.json(u ? u.joined : Date.now());
  });
  app.get('/getCoins', (req, res) => {
    const u = db.users[key(req.query.name)];
    if (!u) return res.json({ coins: 0, coinsDay: 0, coinsWeek: 0, score: 0, scoreDay: 0, scoreWeek: 0,
                              hsScore: 0, hsScoreDay: 0, hsScoreWeek: 0 });
    res.json({
      coins: u.coins || 0,
      coinsDay: sumOne(coinLog, u.name, 24 * 60 * 60 * 1000),
      coinsWeek: sumOne(coinLog, u.name, 7 * 24 * 60 * 60 * 1000),
      score: u.score || 0,
      scoreDay: sumOne(scoreLog, u.name, 24 * 60 * 60 * 1000),
      scoreWeek: sumOne(scoreLog, u.name, 7 * 24 * 60 * 60 * 1000),
      hsScore: u.hsScore || 0,
      hsScoreDay: sumOne(hsLog, u.name, 24 * 60 * 60 * 1000),
      hsScoreWeek: sumOne(hsLog, u.name, 7 * 24 * 60 * 60 * 1000)
    });
  });
  app.get('/getAboutMe', (req, res) => {
    const u = db.users[key(req.query.name)];
    res.json(u ? (u.about || '') : '');
  });
  app.post('/setAboutMe', (req, res) => {
    const u = currentUser(req);
    if (u) { u.about = String(req.body.aboutMe || '').slice(0, 300); save(); }
    res.json({ status: 'success' });
  });
  app.get('/getMyBio', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ name: '', avatar: '0', chatColor: '#000000', whatBro: 'none',
                              chatColorUnlocked: false, chatColorPrice: CHAT_COLOR_PRICE,
                              nickPrice: NICK_CHANGE_PRICE, coins: 0 });
    res.json({
      name: u.name,
      avatar: u.avatar || '0',
      chatColor: u.chatColor || '#000000',
      whatBro: u.whatBro || 'none',
      chatColorUnlocked: !!u.chatColorUnlocked,
      chatColorPrice: CHAT_COLOR_PRICE,
      nickPrice: NICK_CHANGE_PRICE,
      coins: u.coins || 0
    });
  });

  // сохранение аватара и цвета чата — свой цвет требует разовой покупки (см. /chatColor/unlock)
  app.post('/setMyBio', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Sign in first' });
    const avatar = String(req.body.avatar || '').trim();
    const chatColor = String(req.body.chatColor || '').trim();
    if (avatar) u.avatar = avatar.slice(0, 40);
    if (/^#[0-9a-fA-F]{6}$/.test(chatColor)) {
      if (!u.chatColorUnlocked)
        return res.json({ status: 'error', code: 'locked',
                          message: 'Chat color is not unlocked yet — needs ' + CHAT_COLOR_PRICE + ' coins' });
      u.chatColor = chatColor;
    }
    save();
    res.json({ status: 'success' });
  });
  /* Один персональный переключатель: скрыть у себя Messages (пункт меню,
     значок непрочитанного, плавающая кнопка в игре) и чужие реплики в
     игровом чате разом — обе половины старого пожелания "выключить чат"
     были одной и той же жалобой (чат отвлекает), поэтому одна галочка
     на обе. Свои сообщения отправлять всё ещё можно — прячется только
     то, что видит сам игрок. Хранится на аккаунте, не в браузере: должно
     работать одинаково на всех устройствах, как тема и язык. */
  app.get('/getMySettings', (req, res) => {
    const u = currentUser(req);
    res.json({ data: { hideChat: !!(u && u.hideChat), email: (u && u.email) || '',
                        discordName: (u && u.discordName) || '' } });
  });
  app.post('/settings/hideChat', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Sign in first' });
    u.hideChat = String(req.body.on) === '1';
    save();
    res.json({ status: 'success', hideChat: u.hideChat });
  });
  app.get('/getMyOldMapsLink', (req, res) => res.json({ link: '' }));

  // ---------- поиск ----------
  app.get('/searchUser', (req, res) => {
    const q = key(req.query.name);
    if (!q) return res.json([]);
    // точный поиск — только совпадающий ник целиком, без похожих аккаунтов
    const exact = String(req.query.exact || '') === '1';
    const match = exact ? (n => key(n) === q) : (n => key(n).indexOf(q) !== -1);
    res.json(Object.values(db.users)
      .filter(u => match(u.name))
      .slice(0, 20)
      .map(u => ({ name: u.name })));
  });

  // ---------- отношения ----------
  // "0" гость | "1" нет такого пользователя | "2" это я
  // {type:"0"} не друзья | {type:"1"} друзья | {type:"2", init} заявка
  function relation(req) {
    const me = currentUser(req);
    const target = db.users[key(req.query.name)];
    if (!target) return '1';
    if (!me) return '0';
    if (key(me.name) === key(target.name)) return '2';
    if (me.friends.some(n => key(n) === key(target.name))) return { type: '1' };
    if (me.outgoing.some(n => key(n) === key(target.name))) return { type: '2', init: me.name };
    if (me.incoming.some(n => key(n) === key(target.name))) return { type: '2', init: target.name };
    return { type: '0' };
  }
  app.get('/getRelation', (req, res) => res.json(relation(req)));
  app.get('/getMyRelation', (req, res) => res.json(relation(req)));
  app.get('/myRelations', (req, res) => res.json(relation(req)));

  const pull = (arr, n) => { const i = arr.findIndex(x => key(x) === key(n)); if (i > -1) arr.splice(i, 1); };
  const push = (arr, n) => { if (!arr.some(x => key(x) === key(n))) arr.push(n); };

  app.post('/friendRequest', (req, res) => {
    const me = currentUser(req);
    const other = db.users[key(req.body.name)];
    if (!me || !other || key(me.name) === key(other.name)) return res.json('1');
    if (me.friends.some(n => key(n) === key(other.name))) return res.json('1');
    push(me.outgoing, other.name);
    push(other.incoming, me.name);
    save();
    res.json('0');
  });
  app.post('/acceptFriendRequest', (req, res) => {
    const me = currentUser(req);
    const other = db.users[key(req.body.name)];
    if (!me || !other) return res.json('1');
    if (!me.incoming.some(n => key(n) === key(other.name))) return res.json('1');
    pull(me.incoming, other.name); pull(other.outgoing, me.name);
    push(me.friends, other.name); push(other.friends, me.name);
    save();
    res.json('0');
  });
  app.post('/cancelFriendRequest', (req, res) => {
    const me = currentUser(req);
    const other = db.users[key(req.body.name)];
    if (!me || !other) return res.json('1');
    pull(me.outgoing, other.name); pull(other.incoming, me.name);
    pull(me.incoming, other.name); pull(other.outgoing, me.name);
    save();
    res.json('0');
  });
  app.post('/unfriend', (req, res) => {
    const me = currentUser(req);
    const other = db.users[key(req.body.name)];
    if (!me || !other) return res.json('1');
    pull(me.friends, other.name); pull(other.friends, me.name);
    save();
    res.json('0');
  });

  app.get('/getFriendsList', (req, res) => {
    const owner = db.users[key(req.query.name)];
    const me = currentUser(req);
    const guest = !me || !owner || key(me.name) !== key(owner.name);
    if (!owner) return res.json({ page: '1/1', count: 0, guest: true, relation: [] });
    const type = req.query.type;
    let names = type === 'requests' ? owner.incoming
              : type === 'pending'  ? owner.outgoing
              : owner.friends;
    if (guest && type !== 'friends') names = [];
    const list = names.map(n => db.users[key(n)]).filter(Boolean).map(publicUser);
    const p = paginate(list, req.query.page);
    res.json({ page: p.label, count: list.length, guest, relation: p.slice });
  });

  // ---------- пользовательское соглашение ----------
  app.post('/consent/accept', (req, res) => {
    const u = currentUser(req);
    if (u) {
      u.consent = { version: String(req.body.version || '1'), at: Date.now() };
      save();
    }
    // гостю согласие хранит браузер — аккаунта, куда записать, ещё нет
    res.json({ status: 'success', saved: !!u });
  });

  app.get('/consent/state', (req, res) => {
    const u = currentUser(req);
    res.json({ accepted: !!(u && u.consent), version: (u && u.consent && u.consent.version) || '' });
  });

  // ---------- кто я (для клиентских инструментов владельца) ----------
  app.get('/whoAmI', (req, res) => {
    const u = currentUser(req);
    // разовый возврат монет за убранный каталог деталей костюма — whoAmI
    // дёргает shell.js на каждой странице, так что доходит до всех быстро
    if (u) { const refunded = !u.catalogRefunded; require('./skins.js').refundCatalog(u); if (refunded) save(); }
    const owner = isOwner(u);
    const out = { guest: !u, name: u ? u.name : '', owner: owner, coins: u ? (u.coins || 0) : 0 };
    if (owner) out.ownerName = OWNER;   // посторонним ник владельца не раскрываем
    res.json(out);
  });

  // ---------- заглушки вендорных страниц ----------
  // /getSkins и /getSkinsForList теперь отдаёт userSkins.js — настоящими скинами
  /* Каталог покупных деталей убран (см. skins.js) — вещей для вендорного
     магазина больше нет, поэтому эти три отдают пустой, но ожидаемой
     формы ответ, а не 404: вендорный SDK всё равно их дёргает. */
  app.get('/getStoreCosmetics', (req, res) => {
    res.json({ page: Math.max(1, parseInt(req.query.page) || 1), cosmetics: [] });
  });
  app.get('/getMyAssets', (req, res) => {
    res.json({ page: Math.max(1, parseInt(req.query.page) || 1), skins: [] });
  });
  app.post('/buyStoreItem', (req, res) => res.json({ code: 1 }));
  app.get('/getAllSupporters', (req, res) => res.json([]));
  app.get('/getGamingServersInfo', (req, res) => res.json([]));
  app.post('/reportUser', (req, res) => res.json({ code: 2 }));
  app.get('/captcha/getCaptcha', (req, res) => res.json({}));
}

module.exports = { register, reload: load, currentUser, isOwner, OWNER, OWNER_ALIASES, getDb: () => db, save, newSession, hash, hashNew, verifyPassword, sessionNameBySid, nameIsTaken, dropUserSessions, key, checkName, clientIp, creditCoins, creditScore, creditHsScore, sumLog, getCoinLog: () => coinLog, getScoreLog: () => scoreLog, getHsLog: () => hsLog, paginate, NICK_CHANGE_PRICE };
