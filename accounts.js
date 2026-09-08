// ============ СИСТЕМА АККАУНТОВ AIBROFIST ============
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    } catch (e) { console.log('не смог сохранить users.json:', e.message); }
  }, 300);
}
load();

const key = n => String(n || '').toLowerCase();

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
  if (typeof name !== 'string') return 'Введите логин';
  name = name.trim();
  if (name.length < 2) return 'Логин должен быть не короче 2 символов';
  if (name.length > 20) return 'Логин должен быть не длиннее 20 символов';
  if (!/^[A-Za-zА-Яа-яЁё0-9._-]+$/.test(name))
    return 'В логине можно использовать русские и английские буквы, цифры, а также - _ .';
  if (!/^[A-Za-zА-Яа-яЁё0-9]/.test(name)) return 'Логин должен начинаться с буквы или цифры';
  return '';
}
function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length === 0) return 'Введите пароль';
  return '';
}
// для новой регистрации пароль не пустой и не короче 4 символов
function checkNewPassword(pw) {
  let err = checkPassword(pw);
  if (err) return err;
  if (pw.length < 4) return 'Пароль должен быть не короче 4 символов';
  if (pw.length > 100) return 'Пароль должен быть не длиннее 100 символов';
  return '';
}

// реальный адрес игрока за прокси: Cloudflare отдаёт его в CF-Connecting-IP,
// а первый элемент X-Forwarded-For клиент рисует себе сам
function clientIp(req) {
  const cf = String(req.headers['cf-connecting-ip'] || '').trim();
  if (cf) return cf;
  const xff = String(req.headers['x-forwarded-for'] || '');
  if (xff) return xff.split(',').pop().trim();
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
  const https = String((src.headers || {})['x-forwarded-proto'] || '') === 'https';
  res.setHeader('Set-Cookie',
    `sid=${sid}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly` + (https ? '; Secure' : ''));
  save();
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
    if (db.users[key(name)]) return res.json({ status: 'error', message: 'Такой логин уже занят' });

    const ip = ipKey(req);
    if (ip) {
      const owned = Object.values(db.users).some(u => u.ip === ip && isOwner(u));
      const taken = Object.values(db.users).find(u => u.ip === ip);
      if (taken && !owned)
        return res.json({ status: 'error', message: 'С этого устройства уже создан аккаунт «' + taken.name + '»' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    db.users[key(name)] = {
      name, salt, hash: hashNew(password, salt),
      joined: Date.now(), lastSeen: Date.now(), ip: ip,
      coins: 0, about: '', avatar: '0',
      items: [], skin: {}, lang: '',
      friends: [], incoming: [], outgoing: []
    };
    newSession(res, name, req);
    save();
    res.json({ status: 'success', message: 'Аккаунт создан' });
  });

  const doLogin = (req, res) => {
    const name = String(req.body.username || req.body.name || '').trim();
    const password = String(req.body.password || '');
    const k = ipKey(req) + '|' + key(name);
    const blocked = loginBlocked(k);
    if (blocked)
      return res.json({ status: 'error',
                        message: 'Слишком много попыток. Подождите ' +
                                 Math.ceil((blocked - Date.now()) / 60000) + ' мин' });
    const u = db.users[key(name)];
    if (!u || !verifyPassword(password, u.salt, u.hash)) {
      loginFail(k);
      return res.json({ status: 'error', message: 'Неверный логин или пароль' });
    }
    loginOk(k);
    rehashIfNeeded(u, password);       // старый хеш тихо заменяется стойким
    u.lastSeen = Date.now();
    newSession(res, u.name, req);
    save();
    res.json({ status: 'success', message: 'Вход выполнен' });
  };
  app.post('/login/password', doLogin);
  app.post('/signIn', doLogin);

  // ---------- смена пароля ----------
  app.post('/changePassword', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Войдите в аккаунт' });
    const oldPw = String(req.body.oldPassword || '');
    const newPw = String(req.body.newPassword || '');
    if (!verifyPassword(oldPw, u.salt, u.hash))
      return res.json({ status: 'error', message: 'Текущий пароль неверный' });
    const err = checkNewPassword(newPw);
    if (err) return res.json({ status: 'error', message: err });
    u.salt = crypto.randomBytes(16).toString('hex');
    u.hash = hashNew(newPw, u.salt);
    // на всех других устройствах выкидываем: после смены пароля там придётся войти заново
    const sid = parseCookies(req).sid;
    dropUserSessions(u.name, sid);
    save();
    res.json({ status: 'success', message: 'Пароль изменён' });
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
    res.json(u ? u.coins : 0);
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
    if (!u) return res.json({ name: '', avatar: '0', chatColor: '#000000', whatBro: 'none' });
    res.json({
      name: u.name,
      avatar: u.avatar || '0',
      chatColor: u.chatColor || '#000000',
      whatBro: u.whatBro || 'none'
    });
  });

  // сохранение аватара и цвета чата
  app.post('/setMyBio', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Войдите в аккаунт' });
    const avatar = String(req.body.avatar || '').trim();
    const chatColor = String(req.body.chatColor || '').trim();
    if (avatar) u.avatar = avatar.slice(0, 40);
    if (/^#[0-9a-fA-F]{6}$/.test(chatColor)) u.chatColor = chatColor;
    save();
    res.json({ status: 'success' });
  });
  app.get('/getMySettings', (req, res) => res.json({ data: {} }));
  app.get('/getMyOldMapsLink', (req, res) => res.json({ link: '' }));

  // ---------- поиск ----------
  app.get('/searchUser', (req, res) => {
    const q = key(req.query.name);
    if (!q) return res.json([]);
    res.json(Object.values(db.users)
      .filter(u => key(u.name).indexOf(q) !== -1)
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
    const owner = isOwner(u);
    const out = { guest: !u, name: u ? u.name : '', owner: owner, coins: u ? (u.coins || 0) : 0 };
    if (owner) out.ownerName = OWNER;   // посторонним ник владельца не раскрываем
    res.json(out);
  });

  // ---------- заглушки вендорных страниц ----------
  // /getSkins и /getSkinsForList теперь отдаёт userSkins.js — настоящими скинами
  app.get('/getStoreCosmetics', (req, res) => {
    // старый магазин вендора: отдаём наш каталог в его формате
    const skins = require('./skins.js');
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const per = 12;
    const all = skins.CATALOG.filter(i => i.price > 0);
    res.json({ page: page, cosmetics: all.slice((page - 1) * per, page * per)
      .map(i => ({ name: i.name, id: i.id, price: i.price, slot: i.slot })) });
  });
  app.get('/getMyAssets', (req, res) => {
    const skins = require('./skins.js');
    const u = currentUser(req);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const per = 12;
    const mine = skins.ownedList(u);
    res.json({ page: page, skins: mine.slice((page - 1) * per, page * per)
      .map(id => ({ assetName: id, name: (skins.BY_ID[id] || {}).name || id })) });
  });
  app.post('/buyStoreItem', (req, res) => {
    // вендорная кнопка покупки — переиспользуем нашу логику
    const u = currentUser(req);
    if (!u) return res.json({ code: 0 });
    const skins = require('./skins.js');
    const item = skins.BY_ID[String(req.body.id || '')];
    if (!item) return res.json({ code: 1 });
    u.items = Array.isArray(u.items) ? u.items : [];
    if (item.price === 0 || u.items.indexOf(item.id) !== -1) return res.json({ code: 3 });
    if ((u.coins || 0) < item.price) return res.json({ code: 2 });
    u.coins = (u.coins || 0) - item.price;
    u.items.push(item.id);
    save();
    res.json({ code: 4, coins: u.coins });
  });
  app.get('/getAllSupporters', (req, res) => res.json([]));
  app.get('/getGamingServersInfo', (req, res) => res.json([]));
  app.post('/reportUser', (req, res) => res.json({ code: 2 }));
  app.get('/captcha/getCaptcha', (req, res) => res.json({}));
}

module.exports = { register, reload: load, currentUser, isOwner, OWNER, OWNER_ALIASES, getDb: () => db, save, newSession, hash, hashNew, verifyPassword, sessionNameBySid, nameIsTaken, dropUserSessions, key, checkName, clientIp };
