// ====== Новости, монеты, таблица лидеров и инструменты владельца ======
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');
const IMG_DIR = path.join(DATA_DIR, 'logimg');

/* Картинки новостей.
   Файл лежит на диске, в logs.json попадает только адрес и размеры —
   так лента остаётся лёгкой, а браузер заранее знает пропорции и не
   дёргает вёрстку, пока картинка грузится. */
const IMG_MAX_BYTES = 12 * 1024 * 1024;   // 12 МБ на картинку
const IMG_PER_LOG = 8;                    // столько картинок на одну новость
const IMG_URL = '/logimg/';

// тип берём из самих байтов: расширение и заголовок клиента могут врать
const SIGNS = [
  { ext: 'png',  mime: 'image/png',  test: b => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 },
  { ext: 'jpg',  mime: 'image/jpeg', test: b => b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  { ext: 'gif',  mime: 'image/gif',  test: b => b.slice(0, 6).toString('latin1').indexOf('GIF8') === 0 },
  { ext: 'webp', mime: 'image/webp', test: b => b.length > 12 && b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP' },
  { ext: 'bmp',  mime: 'image/bmp',  test: b => b.length > 2 && b[0] === 0x42 && b[1] === 0x4D },
  { ext: 'avif', mime: 'image/avif', test: b => b.length > 12 && b.slice(4, 8).toString('latin1') === 'ftyp' && /avif|avis/.test(b.slice(8, 12).toString('latin1')) },
  { ext: 'svg',  mime: 'image/svg+xml', test: b => /^\s*(<\?xml[\s\S]{0,200}?)?<svg[\s>]/i.test(b.slice(0, 400).toString('utf8')) }
];

function sniff(buf) {
  for (let i = 0; i < SIGNS.length; i++) if (SIGNS[i].test(buf)) return SIGNS[i];
  return null;
}

// "data:image/png;base64,...." -> буфер
function decodeImage(raw) {
  const m = /^data:([\w/+.-]+);base64,([\s\S]+)$/.exec(String(raw || '').trim());
  if (!m) return { bad: 'Файл не читается' };
  let buf;
  try { buf = Buffer.from(m[2], 'base64'); }
  catch (e) { return { bad: 'Файл не читается' }; }
  if (!buf.length) return { bad: 'Пустой файл' };
  if (buf.length > IMG_MAX_BYTES)
    return { bad: 'Картинка больше ' + Math.round(IMG_MAX_BYTES / 1048576) + ' МБ' };
  const s = sniff(buf);
  if (!s) return { bad: 'Это не картинка' };
  return { buf, ext: s.ext, mime: s.mime };
}

// только собственные файлы: чужой адрес в ленту не попадёт
const IMG_NAME = /^[a-z0-9]{6,40}\.(png|jpg|gif|webp|bmp|avif|svg)$/;
function imgFile(url) {
  const u = String(url || '').trim();
  if (u.indexOf(IMG_URL) !== 0) return null;
  const name = u.slice(IMG_URL.length);
  if (!IMG_NAME.test(name)) return null;
  return { name, file: path.join(IMG_DIR, name) };
}

function saveImage(buf, ext) {
  const name = Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.' + ext;
  fs.mkdirSync(IMG_DIR, { recursive: true });
  fs.writeFileSync(path.join(IMG_DIR, name), buf);
  return IMG_URL + name;
}

let logs = [];

// адреса всех картинок, на которые ссылается лента
function usedImages() {
  const set = new Set();
  logs.forEach(l => (l.images || []).forEach(i => set.add(i.u)));
  return set;
}

/* Уборка. Картинка живёт, пока на неё ссылается новость. Всё, что
   загрузили и не опубликовали (владелец передумал, закрыл вкладку),
   удаляем через два часа — иначе диск копит мусор. */
function sweepImages() {
  let used;
  try { used = usedImages(); } catch (e) { return; }
  let names = [];
  try { names = fs.readdirSync(IMG_DIR); } catch (e) { return; }   // папки ещё нет — уборка не нужна
  const now = Date.now();
  names.forEach(n => {
    if (used.has(IMG_URL + n)) return;
    const f = path.join(IMG_DIR, n);
    try {
      if (now - fs.statSync(f).mtimeMs > 2 * 60 * 60 * 1000) fs.unlinkSync(f);
    } catch (e) { /* уже удалили — не страшно */ }
  });
}

/* Номер новости. Раньше это было просто Date.now(): две записи, созданные
   в одну миллисекунду, получали одинаковый номер — и «Удалить» стирало
   не ту. Теперь номер всегда больше предыдущего. */
function nextId() {
  let id = Date.now();
  logs.forEach(l => { if (l.id >= id) id = l.id + 1; });
  return id;
}

function dropImages(list) {
  const used = usedImages();
  (list || []).forEach(i => {
    if (used.has(i.u)) return;                 // ту же картинку держит другая новость
    const f = imgFile(i.u);
    if (!f) return;
    try { fs.unlinkSync(f.file); } catch (e) { /* уже нет */ }
  });
}

function load() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(LOGS_FILE)) logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
  } catch (e) { console.log('logs.json не прочитан'); }
  if (!Array.isArray(logs)) logs = [];
  /* Старые новости писались без картинок. Приводим все записи к одному
     виду сразу при чтении: дальше по коду `l.images` — всегда массив. */
  logs.forEach(l => {
    if (!Array.isArray(l.images)) l.images = [];
    l.images = l.images
      .map(i => (i && typeof i === 'object') ? i : { u: i })
      .filter(i => imgFile(i.u))
      .map(i => ({ u: i.u, w: parseInt(i.w, 10) || 0, h: parseInt(i.h, 10) || 0 }))
      .slice(0, IMG_PER_LOG);
  });
}
let t = null;
function save() {
  clearTimeout(t);
  t = setTimeout(() => {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));
    } catch (e) { console.log('не смог сохранить logs.json:', e.message); }
  }, 300);
}
load();
sweepImages();
setInterval(sweepImages, 30 * 60 * 1000).unref();

function register(app, acc) {
  const { currentUser, isOwner, getDb, save: saveUsers, newSession, verifyPassword, key, checkName } = acc;

  const ownerOnly = (req, res) => {
    const u = currentUser(req);
    if (!isOwner(u)) { res.json({ status: 'error', message: 'Недоступно' }); return null; }
    return u;
  };

  // ---------- новости ----------
  app.get('/getLogs', (req, res) => {
    const u = currentUser(req);
    res.json({ owner: isOwner(u), logs: logs.slice().sort((a, b) => b.date - a.date).slice(0, 100) });
  });

  /* Картинка уходит на сервер отдельно от текста: в новость попадает
     только короткий адрес. Так /addLog остаётся маленьким запросом,
     а одна тяжёлая картинка не роняет всю публикацию. */
  app.post('/log/upload', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const d = decodeImage(req.body.data);
    if (d.bad) return res.json({ status: 'error', message: d.bad });
    let url;
    try { url = saveImage(d.buf, d.ext); }
    catch (e) { return res.json({ status: 'error', message: 'Не удалось сохранить: ' + e.message }); }
    res.json({
      status: 'success', url, mime: d.mime,
      w: Math.max(0, Math.min(20000, parseInt(req.body.w, 10) || 0)),
      h: Math.max(0, Math.min(20000, parseInt(req.body.h, 10) || 0))
    });
  });

  // адреса картинок из тела запроса -> проверенный список для ленты
  function takeImages(raw) {
    let arr = raw;
    if (typeof raw === 'string') {
      try { arr = JSON.parse(raw); } catch (e) { arr = []; }
    }
    if (!Array.isArray(arr)) return [];
    return arr
      .map(i => (i && typeof i === 'object') ? i : { u: i })
      .map(i => ({
        u: String(i.u || '').trim(),
        w: Math.max(0, Math.min(20000, parseInt(i.w, 10) || 0)),
        h: Math.max(0, Math.min(20000, parseInt(i.h, 10) || 0))
      }))
      // адрес должен быть нашим и файл должен существовать: битых
      // картинок в ленте не будет никогда
      .filter(i => { const f = imgFile(i.u); return f && fs.existsSync(f.file); })
      .slice(0, IMG_PER_LOG);
  }

  app.post('/addLog', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const title = String(req.body.title || '').trim().slice(0, 120);
    const text = String(req.body.text || '').trim().slice(0, 4000);
    const images = takeImages(req.body.images);
    if (!title && !text && !images.length)
      return res.json({ status: 'error', message: 'Пустая запись' });
    logs.push({ id: nextId(), title, text, images, date: Date.now() });
    save();
    res.json({ status: 'success', images: images.length });
  });

  /* Правка уже выложенной новости: можно дописать текст и добавить или
     убрать картинки, не удаляя запись и не теряя дату. */
  app.post('/editLog', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const l = logs.find(x => x.id === parseInt(req.body.id, 10));
    if (!l) return res.json({ status: 'error', message: 'Новость не найдена' });
    const title = String(req.body.title || '').trim().slice(0, 120);
    const text = String(req.body.text || '').trim().slice(0, 4000);
    const images = takeImages(req.body.images);
    if (!title && !text && !images.length)
      return res.json({ status: 'error', message: 'Пустая запись' });
    const was = l.images || [];
    l.title = title; l.text = text; l.images = images;
    save();
    dropImages(was.filter(i => !images.some(n => n.u === i.u)));   // отцепленные файлы убираем
    res.json({ status: 'success' });
  });

  app.post('/deleteLog', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const id = parseInt(req.body.id);
    const i = logs.findIndex(l => l.id === id);
    if (i > -1) {
      const gone = logs[i].images || [];
      logs.splice(i, 1);
      save();
      dropImages(gone);      // файлы удалённой новости на диске не остаются
    }
    res.json({ status: 'success' });
  });

  // ---------- монеты ----------
  /* Монеты за игру капают маленькими порциями, поэтому окно жёсткое:
   * спам запросами больше не поднимет баланс — за час максимум 120. */
  const COIN_WINDOW = 60 * 60 * 1000;   // час
  const COIN_MAX = 120;                 // максимум монет из игры за час
  app.post('/addCoins', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'guest', coins: 0 });
    let n = parseInt(req.body.coins) || 0;
    if (n <= 0) return res.json({ status: 'success', coins: u.coins || 0 });
    if (n > 50) n = 50;                       // защита от накрутки за один заход
    if (!u.coinWin || Date.now() - u.coinWin > COIN_WINDOW) {
      u.coinWin = Date.now();
      u.coinSum = 0;
    }
    if ((u.coinSum || 0) >= COIN_MAX)
      return res.json({ status: 'success', coins: u.coins || 0 });
    if ((u.coinSum || 0) + n > COIN_MAX) n = COIN_MAX - (u.coinSum || 0);
    u.coinSum = (u.coinSum || 0) + n;
    u.coins = (u.coins || 0) + n;
    saveUsers();
    res.json({ status: 'success', coins: u.coins });
  });

  // ---------- таблица лидеров ----------
  app.get('/getLeaderboard', (req, res) => {
    const db = getDb();
    const top = Object.values(db.users)
      .map(u => ({ name: u.name, coins: u.coins || 0 }))
      .sort((a, b) => b.coins - a.coins || a.name.localeCompare(b.name))
      .slice(0, 10);
    const me = currentUser(req);
    let myPlace = 0;
    if (me) {
      const all = Object.values(db.users).sort((a, b) => (b.coins || 0) - (a.coins || 0));
      myPlace = all.findIndex(u => key(u.name) === key(me.name)) + 1;
    }
    res.json({ top, me: me ? { name: me.name, coins: me.coins || 0, place: myPlace } : null });
  });

  // ---------- смена ника: только владелец ----------
  app.post('/renameUser', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const db = getDb();
    const from = String(req.body.from || '').trim();
    const to = String(req.body.to || '').trim();
    const err = checkName(to);
    if (err) return res.json({ status: 'error', message: err });
    const u = db.users[key(from)];
    if (!u) return res.json({ status: 'error', message: 'Игрок «' + from + '» не найден' });
    if (db.users[key(to)] && key(to) !== key(from))
      return res.json({ status: 'error', message: 'Логин «' + to + '» уже занят' });

    const old = u.name;
    u.name = to;
    if (key(to) !== key(from)) {
      delete db.users[key(from)];
      db.users[key(to)] = u;
    }
    // чиним связи в друзьях
    const fix = list => (list || []).map(n => (key(n) === key(old) ? to : n));
    Object.values(db.users).forEach(x => {
      x.friends = fix(x.friends); x.incoming = fix(x.incoming); x.outgoing = fix(x.outgoing);
    });
    Object.keys(db.sessions).forEach(sid => {
      if (key(db.sessions[sid]) === key(old)) db.sessions[sid] = to;
    });
    saveUsers();
    res.json({ status: 'success', message: '«' + old + '» теперь «' + to + '»' });
  });

  // ---------- монеты в любой профиль (только владелец) ----------
  app.post('/owner/giveCoins', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const db = getDb();
    const name = String(req.body.name || '').trim();
    const target = db.users[key(name)];
    if (!target) return res.json({ status: 'error', message: 'Игрок «' + name + '» не найден' });

    const raw = String(req.body.coins || '').trim();
    const n = parseInt(raw, 10);
    if (!isFinite(n) || isNaN(n))
      return res.json({ status: 'error', message: 'Введите число' });

    const mode = String(req.body.mode || 'add');   // add | set
    if (mode === 'set') target.coins = Math.max(0, n);
    else target.coins = Math.max(0, (target.coins || 0) + n);

    saveUsers();
    res.json({
      status: 'success',
      coins: target.coins,
      message: '«' + target.name + '» — теперь ' + target.coins + ' монет'
    });
  });

  // ---------- накрутка лайков и дизлайков (только владелец) ----------
  const mapsApi = require('./maps.js');

  app.post('/owner/setVotes', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const author = String(req.body.author || '').trim();
    const mapName = String(req.body.mapName || '').trim();
    const likes = req.body.likes === undefined || req.body.likes === '' ? null : req.body.likes;
    const dislikes = req.body.dislikes === undefined || req.body.dislikes === '' ? null : req.body.dislikes;

    const t = mapsApi.setBoost(author, mapName, likes, dislikes);
    if (!t) return res.json({ status: 'error', message: 'Карта не найдена' });
    res.json({ status: 'success', likes: t.likes, dislikes: t.dislikes, rating: t.rating });
  });

  // ---------- добавить карту в игровые режимы (только владелец) ----------
  app.post('/owner/mapInGame', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const author = String(req.body.author || '').trim();
    const mapName = String(req.body.mapName || '').trim();
    const mode = String(req.body.mode || '').trim();
    const on = String(req.body.on || 'true') === 'true';

    const r = mapsApi.setInGame(author, mapName, mode, on);
    if (!r) return res.json({ status: 'error', message: 'Карта не найдена' });
    if (r.bad) return res.json({ status: 'error', message: 'Неизвестный режим: ' + mode });

    res.json({
      status: 'success', modes: r.modes,
      message: r.on
        ? '«' + r.mapName + '» добавлена в режим ' + mode
        : '«' + r.mapName + '» убрана из режима ' + mode
    });
  });

  app.get('/owner/inGame', (req, res) => {
    const u = currentUser(req);
    if (!isOwner(u)) return res.json({ status: 'error', maps: [] });
    res.json({ status: 'success', maps: mapsApi.inGameList() });
  });

  // ---------- связанные аккаунты владельца ----------
  app.get('/owner/accounts', (req, res) => {
    const u = currentUser(req);
    if (!isOwner(u)) return res.json({ status: 'error' });
    const db = getDb();
    const linked = (u.linked || []).map(n => {
      const x = db.users[key(n)];
      return x ? { name: x.name, coins: x.coins || 0 } : null;
    }).filter(Boolean);
    res.json({ status: 'success', linked });
  });

  app.post('/owner/link', (req, res) => {
    const u = ownerOnly(req, res); if (!u) return;
    const db = getDb();
    const name = String(req.body.name || '').trim();
    const pass = String(req.body.password || '');
    const target = db.users[key(name)];
    if (!target) return res.json({ status: 'error', message: 'Аккаунт не найден' });
    if (!verifyPassword(pass, target.salt, target.hash))
      return res.json({ status: 'error', message: 'Неверный пароль от этого аккаунта' });
    u.linked = u.linked || [];
    if (!u.linked.some(n => key(n) === key(target.name))) u.linked.push(target.name);
    saveUsers();
    res.json({ status: 'success', message: '«' + target.name + '» привязан' });
  });

  app.post('/owner/unlink', (req, res) => {
    const u = ownerOnly(req, res); if (!u) return;
    u.linked = (u.linked || []).filter(n => key(n) !== key(String(req.body.name || '')));
    saveUsers();
    res.json({ status: 'success' });
  });

  app.post('/owner/switch', (req, res) => {
    const u = ownerOnly(req, res); if (!u) return;
    const db = getDb();
    const name = String(req.body.name || '').trim();
    if (!(u.linked || []).some(n => key(n) === key(name)))
      return res.json({ status: 'error', message: 'Этот аккаунт не привязан' });
    const target = db.users[key(name)];
    if (!target) return res.json({ status: 'error', message: 'Аккаунт не найден' });
    newSession(res, target.name);
    res.json({ status: 'success', message: 'Вошли как ' + target.name });
  });
}

module.exports = { register, reload: load, IMG_DIR };
