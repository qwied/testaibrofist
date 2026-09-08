// ============ СКИНЫ ИГРОКОВ: свои образы, оценки, витрина Avatar ============
/* Публикация в Skins Browser убрана. Готовый образ, собранный из купленных
   вещей, игрок сохраняет к себе — во вкладку «Мои скины». Такие образы
   личные: в общий обзор скинов они не попадают. */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const dns = require('dns').promises;

const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'userskins.json');

const MINE_LIMIT = 20;      // сколько своих образов можно держать в «Мои скины»
const IMG_DIR = path.join(DATA_DIR, 'skinimg');
const IMG_MAX = 3 * 1024 * 1024;   // 3 МБ на картинку
/* SVG больше не принимаем: внутри него может лежать скрипт.
   Остальные форматы безопасны — это растровые картинки. */
const IMG_TYPES = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/gif': 'gif', 'image/webp': 'webp'
};

// управляющие и невидимые символы в названиях недопустимы
const BAD_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;
const cleanText = (v, max) => String(v == null ? '' : v).replace(BAD_CHARS, '').trim().slice(0, max);

// Картинку принимаем только как ссылку http(s) или как data:image/*.
// Всё остальное отбрасываем, чтобы в базу не попало что попало.
let list = [];

function load() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(FILE)) list = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) { console.log('userskins.json не прочитан'); }
  if (!Array.isArray(list)) list = [];
}
let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
    } catch (e) { console.log('не смог сохранить userskins.json:', e.message); }
  }, 300);
}
load();

const low = s => String(s || '').toLowerCase();

function tally(s) {
  const votes = Object.values(s.votes || {});
  const likes = votes.filter(v => v > 0).length + (s.boostLikes || 0);
  const dislikes = votes.filter(v => v < 0).length + (s.boostDislikes || 0);
  return { likes, dislikes, rating: likes - dislikes };
}
function retally(s) { const t = tally(s); s.rating = t.rating; return t; }

// личные образы игрока не попадают в общий обзор скинов
const isPublic = s => !s.personal;
function mineOf(name) { return list.filter(s => low(s.author) === low(name)); }

function pub(s, me) {
  const t = tally(s);
  return {
    id: s.id, skinName: s.skinName, author: s.author, skin: s.skin,
    date: s.date, likes: t.likes, dislikes: t.dislikes, rating: t.rating,
    inAvatar: !!s.inAvatar, price: s.price || 0,
    personal: !!s.personal,
    img: s.img || '',
    myVote: me ? (s.votes || {})[low(me)] || 0 : 0
  };
}

// отпечаток картинки скина — по нему ловим повторные публикации рисунка
function imgSig(buf) {
  return 'img:' + crypto.createHash('md5').update(buf).digest('hex');
}

// отрисовка скина на сервере — нужна, чтобы отдавать картинку по ссылке
let RENDER = null;
function renderer() {
  if (RENDER) return RENDER;
  try {
    const host = {};
    const code = fs.readFileSync(path.join(__dirname, 'skinRender.js'), 'utf8');
    new Function('window', code)(host);
    RENDER = host.BFSkin;
  } catch (e) { RENDER = null; }
  return RENDER;
}

// ---------- картинки для скинов владельца ----------
function saveImage(buf, ext, id) {
  if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });
  const name = id + '.' + ext;
  fs.writeFileSync(path.join(IMG_DIR, name), buf);
  return '/skinimg/' + name;
}

/* Удаляет старую картинку скина с диска. Имя файла всегда генерирует сам
   сервер, но раз путь берётся из сохранённых данных — формат проверяем
   жёстко, чтобы даже гипотетическая подстановка «../» не унесла чужой файл. */
function unlinkSkinImg(url) {
  const m = /^\/skinimg\/([a-z0-9]+\.(?:png|jpg|gif|webp))$/.exec(String(url || ''));
  if (!m) return;
  try { fs.unlinkSync(path.join(IMG_DIR, m[1])); } catch (e) {}
}

// data:image/png;base64,.... -> буфер
function fromDataUrl(raw) {
  const m = /^data:([\w/+.-]+);base64,([\s\S]+)$/.exec(String(raw || '').trim());
  if (!m) return null;
  const ext = IMG_TYPES[m[1].toLowerCase()];
  if (!ext) return { bad: 'Такой формат картинки не поддерживается' };
  let buf;
  try { buf = Buffer.from(m[2], 'base64'); } catch (e) { return { bad: 'Картинка не читается' }; }
  if (!buf.length) return { bad: 'Пустая картинка' };
  if (buf.length > IMG_MAX) return { bad: 'Картинка больше 3 МБ' };
  return { buf, ext };
}

// адрес в интернете. Забираем сами, но с ограничениями: только http(s),
// стандартный порт, не локальная сеть — причём проверяется УЖЕ разрешённый
// адрес, а не только имя: подмену DNS в локальную сеть так не провести.
const PRIVATE_HOST = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1)|^172\.(1[6-9]|2\d|3[01])\./i;
const PRIVATE_IP = /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/;

async function assertPublicHost(hostname) {
  if (PRIVATE_HOST.test(hostname)) throw new Error('локальная сеть запрещена');
  // имя хоста разрешаем и проверяем все полученные адреса
  const addrs = await dns.lookup(hostname, { all: true, verbatim: true });
  addrs.forEach(a => {
    if (PRIVATE_IP.test(a.address) || a.address === '::1')
      throw new Error('этот адрес ведёт в локальную сеть');
  });
}

async function fromUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch (e) { return { bad: 'Это не адрес' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:')
    return { bad: 'Нужна ссылка http или https' };
  if (u.port && u.port !== '80' && u.port !== '443')
    return { bad: 'Нестандартный порт в ссылке запрещён' };
  if (u.username || u.password)
    return { bad: 'Логины и пароли в ссылке запрещены' };
  try { await assertPublicHost(u.hostname); }
  catch (e) { return { bad: 'Ссылки на локальную сеть запрещены' }; }

  let r;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 12000);
    r = await fetch(u.href, { redirect: 'follow', signal: ctl.signal });
    clearTimeout(t);
  } catch (e) { return { bad: 'Не удалось скачать: ' + (e.message || e) }; }

  // после редиректов адрес мог переехать в локальную сеть — проверяем ещё раз
  try { await assertPublicHost(new URL(r.url).hostname); }
  catch (e) { return { bad: 'Ссылки на локальную сеть запрещены' }; }

  if (!r.ok) return { bad: 'Сервер картинки ответил ' + r.status };
  const ct = String(r.headers.get('content-type') || '').split(';')[0].toLowerCase();
  const ext = IMG_TYPES[ct];
  if (!ext) return { bad: 'По ссылке не картинка (' + (ct || 'без типа') + ')' };
  const len = parseInt(r.headers.get('content-length') || '0', 10);
  if (len > IMG_MAX) return { bad: 'Картинка больше 3 МБ' };

  /* Content-Length — это то, что СКАЗАЛ чужой сервер, а не факт. При
     chunked-ответе заголовка может не быть вовсе (len тогда 0, проверка
     выше молча проходит), и раньше весь ответ грузился в память ЦЕЛИКОМ
     ещё до проверки размера — чужой сервер мог стримить гигабайты и
     положить процесс. Теперь режем поток сами, как только он превысил лимит. */
  const buf = await readLimited(r.body, IMG_MAX);
  if (buf === null) return { bad: 'Картинка больше 3 МБ' };
  if (!buf.length) return { bad: 'Пустой ответ' };
  return { buf, ext };
}

// читает поток не больше max байт; вернёт null, если лимит превышен
async function readLimited(stream, max) {
  if (!stream || typeof stream.getReader !== 'function') {
    // окружение без поддержки потокового Response.body — fallback на разовое чтение
    return null;
  }
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    let step;
    try { step = await reader.read(); }
    catch (e) { return null; }
    if (step.done) break;
    total += step.value.length;
    if (total > max) { try { reader.cancel(); } catch (e) {} return null; }
    chunks.push(Buffer.from(step.value));
  }
  return Buffer.concat(chunks);
}

function register(app, acc, skinsApi) {
  const { currentUser, isOwner, save: saveUsers, getDb, key } = acc;
  const ownerOnly = (req, res) => {
    const u = currentUser(req);
    if (!isOwner(u)) { res.json({ status: 'error', message: 'Недоступно' }); return null; }
    return u;
  };

  // ---------- скин, нарисованный в редакторе: сразу надеваем на игрока ----------
  app.post('/skin/drawing', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Сначала войдите в аккаунт' });

    const raw = String(req.body.img || '').trim();
    if (!raw) return res.json({ status: 'error', message: 'Картинка не передана' });

    const got = fromDataUrl(raw);
    if (!got) return res.json({ status: 'error', message: 'Картинка не распознана' });
    if (got.bad) return res.json({ status: 'error', message: got.bad });

    const id = 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    let img;
    try { img = saveImage(got.buf, got.ext, id); }
    catch (e) { return res.json({ status: 'error', message: 'Не удалось сохранить: ' + e.message }); }

    const oldImg = u.skinImg;
    u.skin = skinsApi.normalize(null);
    u.skinImg = img;
    u.wearing = '';
    saveUsers();
    if (oldImg && oldImg !== img) unlinkSkinImg(oldImg);
    res.json({ status: 'success', img, message: 'Скин сохранён' });
  });

  // ---------- сохранить образ в «Мои скины» ----------
  /* Раньше здесь была публикация в Skins Browser. Теперь собранный образ
     просто ложится в личную коллекцию игрока: чужим он не показывается,
     монет за него не дают, надеть его можно в любой момент. */
  app.post('/skins/save', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Сначала войдите в аккаунт' });

    const skinName = cleanText(req.body.skinName, 30);
    if (skinName.length < 2 || skinName.length > 30)
      return res.json({ status: 'error', message: 'Название скина: от 2 до 30 символов' });

    let raw = null;
    try { raw = JSON.parse(String(req.body.skin || 'null')); } catch (e) {}
    const skin = skinsApi.normalize(raw || skinsApi.skinOf(u));

    // в образ идут только бесплатные и уже купленные вещи
    const notMine = skinsApi.SLOTS.filter(sl => !skinsApi.isOwned(u, skin[sl]));
    if (notMine.length)
      return res.json({ status: 'error',
                        message: 'В образе есть вещи, которые вы ещё не купили' });

    const mine = mineOf(u.name);
    if (mine.some(s => low(s.skinName) === low(skinName)))
      return res.json({ status: 'error', message: 'У вас уже есть скин с таким названием' });
    if (mine.length >= MINE_LIMIT)
      return res.json({ status: 'error',
                        message: 'В «Мои скины» помещается ' + MINE_LIMIT +
                                 ' образов. Удалите лишние.' });

    const sig = skinsApi.signature(skin);
    const twin = mine.find(s => !s.img && skinsApi.signature(s.skin) === sig);
    if (twin)
      return res.json({ status: 'error',
                        message: 'Такой же образ уже сохранён — «' + twin.skinName + '»' });

    const item = {
      id: 's' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
      skinName, author: u.name, skin,
      date: Date.now(), created: Date.now(),
      votes: {}, boostLikes: 0, boostDislikes: 0, rating: 0,
      inAvatar: false, price: 0, personal: true
    };
    list.push(item);
    save();

    const left = Math.max(0, MINE_LIMIT - mineOf(u.name).length);
    res.json({
      status: 'success', id: item.id, left, limit: MINE_LIMIT,
      message: 'Образ «' + skinName + '» сохранён в «Мои скины»  ·  осталось мест: ' +
               left + ' из ' + MINE_LIMIT
    });
  });

  // старый адрес публикации больше не работает
  app.post('/skins/publish', (req, res) =>
    res.json({ status: 'error',
               message: 'Публикация в Skins Browser отключена. Образ можно сохранить в «Мои скины».' }));

  // ---------- скин из картинки (только владелец) ----------
  app.post('/owner/publishImageSkin', async (req, res) => {
    if (!ownerOnly(req, res)) return;
    const u = currentUser(req);

    const skinName = cleanText(req.body.skinName, 30);
    if (skinName.length < 2 || skinName.length > 30)
      return res.json({ status: 'error', message: 'Название скина: от 2 до 30 символов' });

    if (list.some(s => low(s.skinName) === low(skinName) && low(s.author) === low(u.name)))
      return res.json({ status: 'error', message: 'У вас уже есть скин с таким названием' });

    const raw = String(req.body.img || '').trim();
    if (!raw) return res.json({ status: 'error', message: 'Картинка не передана' });

    const id = 's' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);

    // Файл с телефона приходит как data:image/..., ссылка из интернета —
    // как обычный адрес. Во втором случае скачиваем сами: иначе картинка
    // держалась бы на чужом сервере и пропала бы вместе с ним.
    let got = /^data:/i.test(raw) ? fromDataUrl(raw) : await fromUrl(raw);
    if (!got) return res.json({ status: 'error', message: 'Картинка не распознана' });
    if (got.bad) return res.json({ status: 'error', message: got.bad });

    let img;
    try { img = saveImage(got.buf, got.ext, id); }
    catch (e) { return res.json({ status: 'error', message: 'Не удалось сохранить: ' + e.message }); }

    const item = {
      id: id,
      skinName, author: u.name,
      skin: skinsApi.normalize(null),
      img: img,
      date: Date.now(), created: Date.now(),
      votes: {}, boostLikes: 0, boostDislikes: 0, rating: 0,
      inAvatar: false, price: 0
    };
    list.push(item);
    save();
    // суточный лимит и награда сюда не применяются: это инструмент владельца,
    // а не обычная публикация игрока
    res.json({ status: 'success', id: item.id, img: item.img,
               message: 'Скин из картинки добавлен: «' + skinName + '»' });
  });

  // заменить картинку у существующего скина
  app.post('/owner/skinImage', async (req, res) => {
    if (!ownerOnly(req, res)) return;
    const s = list.find(x => x.id === String(req.body.id || ''));
    if (!s) return res.json({ status: 'error', message: 'Скин не найден' });
    const raw = String(req.body.img || '').trim();
    if (!raw) {
      const had = s.img;
      delete s.img; save();
      unlinkSkinImg(had);
      return res.json({ status: 'success', img: '' });
    }

    let got = /^data:/i.test(raw) ? fromDataUrl(raw) : await fromUrl(raw);
    if (!got) return res.json({ status: 'error', message: 'Картинка не распознана' });
    if (got.bad) return res.json({ status: 'error', message: got.bad });
    const oldImg = s.img;
    try { s.img = saveImage(got.buf, got.ext, s.id); }
    catch (e) { return res.json({ status: 'error', message: 'Не удалось сохранить: ' + e.message }); }
    save();
    if (oldImg && oldImg !== s.img) unlinkSkinImg(oldImg);
    res.json({ status: 'success', img: s.img || '' });
  });

  // сколько свободных мест осталось в «Мои скины»
  app.get('/skins/limit', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ limit: MINE_LIMIT, left: MINE_LIMIT, guest: true });
    res.json({
      limit: MINE_LIMIT, guest: false,
      left: Math.max(0, MINE_LIMIT - mineOf(u.name).length)
    });
  });

  // ---------- список для Skins Browser (только общие скины) ----------
  app.get('/skins/list', (req, res) => {
    const me = currentUser(req);
    const author = low(req.query.author || '');
    const nameQ = low(req.query.skinName || '');
    const sortBy = String(req.query.sortBy || 'date');
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const per = 12;

    let out = list.filter(isPublic);
    if (author) out = out.filter(s => low(s.author).indexOf(author) !== -1);
    if (nameQ) out = out.filter(s => low(s.skinName).indexOf(nameQ) !== -1);
    out.sort((a, b) => sortBy === 'rating'
      ? (tally(b).rating - tally(a).rating) || (b.date - a.date)
      : b.date - a.date);

    const total = Math.max(1, Math.ceil(out.length / per));
    res.json({
      page: Math.min(page, total), pages: total, count: out.length,
      owner: isOwner(me),
      skins: out.slice((Math.min(page, total) - 1) * per, Math.min(page, total) * per)
                .map(s => pub(s, me && me.name))
    });
  });

  // ---------- оценка ----------
  app.post('/skins/vote', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Сначала войдите в аккаунт' });
    const s = list.find(x => x.id === String(req.body.id || ''));
    if (!s || s.personal) return res.json({ status: 'error', message: 'Скин не найден' });
    if (low(s.author) === low(u.name))
      return res.json({ status: 'error', message: 'Свой скин оценивать нельзя' });

    const v = parseInt(req.body.vote) > 0 ? 1 : -1;
    s.votes = s.votes || {};
    if (s.votes[low(u.name)] === v) delete s.votes[low(u.name)];   // повторный клик снимает оценку
    else s.votes[low(u.name)] = v;
    const t = retally(s);
    save();
    res.json({ status: 'success', likes: t.likes, dislikes: t.dislikes, rating: t.rating,
               myVote: s.votes[low(u.name)] || 0 });
  });

  // ---------- удаление ----------
  app.post('/skins/remove', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Сначала войдите в аккаунт' });
    const i = list.findIndex(x => x.id === String(req.body.id || ''));
    if (i === -1) return res.json({ status: 'error', message: 'Скин не найден' });
    if (low(list[i].author) !== low(u.name) && !isOwner(u))
      return res.json({ status: 'error', message: 'Можно удалять только свои скины' });
    unlinkSkinImg(list[i].img);
    list.splice(i, 1);
    save();
    res.json({ status: 'success' });
  });

  // ---------- примерить чужой скин ----------
  app.post('/skins/wear', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Сначала войдите в аккаунт' });
    const s = list.find(x => x.id === String(req.body.id || ''));
    if (!s) return res.json({ status: 'error', message: 'Скин не найден' });

    // Надеть можно только свой образ, купленный или выставленный в витрине
    // Avatar. Раньше через Skins Browser надевался любой чужой скин даром.
    u.boughtSkins = Array.isArray(u.boughtSkins) ? u.boughtSkins : [];
    const mine   = low(s.author) === low(u.name);
    const bought = u.boughtSkins.indexOf(s.id) !== -1;
    if (!mine && !bought && !s.inAvatar)
      return res.json({ status: 'error',
                        message: 'Этот скин не ваш — надеть его нельзя' });

    // скины из витрины Avatar с ценой нужно сначала купить
    if (s.inAvatar && (s.price || 0) > 0 && !mine && !bought)
      return res.json({ status: 'error', code: 'buy', price: s.price,
                        message: 'Сначала купите этот скин за ' + s.price + ' монет' });

    u.skin = skinsApi.normalize(s.skin);
    u.wearing = s.id;
    if (s.img) u.skinImg = s.img; else delete u.skinImg;
    saveUsers();
    res.json({ status: 'success', skin: u.skin, img: s.img || '',
               author: s.author, skinName: s.skinName });
  });

  // ---------- витрина Avatar ----------
  app.get('/skins/avatar', (req, res) => {
    const u = currentUser(req);
    const bought = new Set((u && u.boughtSkins) || []);
    res.json({
      owner: isOwner(u),
      coins: u ? (u.coins || 0) : 0,
      wearing: (u && u.wearing) || '',
      skins: list.filter(s => s.inAvatar)
        .sort((a, b) => (a.price || 0) - (b.price || 0) || b.date - a.date)
        .map(s => {
          const o = pub(s, u && u.name);
          o.owned = bought.has(s.id) || (u && low(s.author) === low(u.name));
          return o;
        })
    });
  });

  app.post('/skins/buy', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Сначала войдите в аккаунт' });
    const s = list.find(x => x.id === String(req.body.id || ''));
    if (!s || !s.inAvatar) return res.json({ status: 'error', message: 'Скин не продаётся' });

    u.boughtSkins = Array.isArray(u.boughtSkins) ? u.boughtSkins : [];
    if (u.boughtSkins.indexOf(s.id) !== -1 || low(s.author) === low(u.name))
      return res.json({ status: 'error', message: 'Этот скин уже ваш' });

    const price = s.price || 0;
    if ((u.coins || 0) < price)
      return res.json({ status: 'error', message: 'Не хватает ' + (price - (u.coins || 0)) + ' монет' });

    u.coins = (u.coins || 0) - price;
    u.boughtSkins.push(s.id);
    saveUsers();
    res.json({ status: 'success', coins: u.coins });
  });

  // ---------- владелец: выложить скин в Avatar и назначить цену ----------
  app.post('/owner/skinToAvatar', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const s = list.find(x => x.id === String(req.body.id || ''));
    if (!s) return res.json({ status: 'error', message: 'Скин не найден' });
    if (s.personal) return res.json({ status: 'error', message: 'Это личный образ игрока' });

    const on = String(req.body.on || 'true') === 'true';
    s.inAvatar = on;
    if (on) s.price = Math.max(0, parseInt(req.body.price) || 0);
    save();
    res.json({
      status: 'success', inAvatar: s.inAvatar, price: s.price || 0,
      message: on
        ? '«' + s.skinName + '» в Avatar за ' + (s.price || 0) + ' монет'
        : '«' + s.skinName + '» убран из Avatar'
    });
  });

  // ---------- владелец: накрутка оценок скина ----------
  app.post('/owner/skinVotes', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const s = list.find(x => x.id === String(req.body.id || ''));
    if (!s) return res.json({ status: 'error', message: 'Скин не найден' });
    if (req.body.likes !== undefined && req.body.likes !== '')
      s.boostLikes = Math.max(0, parseInt(req.body.likes) || 0);
    if (req.body.dislikes !== undefined && req.body.dislikes !== '')
      s.boostDislikes = Math.max(0, parseInt(req.body.dislikes) || 0);
    const t = retally(s);
    save();
    res.json({ status: 'success', likes: t.likes, dislikes: t.dislikes, rating: t.rating });
  });

  // ---------- вендорные страницы ждут именно этот формат ----------
  const vendorList = (req, res) => {
    const me = currentUser(req);
    const author = low(req.query.author || '');
    const nameQ = low(req.query.skinName || '');
    const sortBy = String(req.query.sortBy || 'date');
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const per = 12;

    let out = list.filter(isPublic);
    if (author) out = out.filter(s => low(s.author).indexOf(author) !== -1);
    if (nameQ) out = out.filter(s => low(s.skinName).indexOf(nameQ) !== -1);
    out.sort((a, b) => sortBy === 'rating'
      ? (tally(b).rating - tally(a).rating) || (b.date - a.date)
      : b.date - a.date);

    const pages = Math.max(1, Math.ceil(out.length / per));
    const p = Math.min(page, pages);
    res.json({
      page: p + '/' + pages,
      count: out.length,
      skins: out.slice((p - 1) * per, p * per).map(s => ({
        skinName: s.skinName, author: s.author,
        rating: tally(s).rating, skinId: s.id, date: s.date
      }))
    });
  };
  app.get('/getSkins', vendorList);
  app.get('/getSkinsForList', vendorList);

  // картинка скина по ссылке из профиля
  app.get('/usersSkins/:id.png', (req, res) => {
    const s = list.find(x => x.id === String(req.params.id || ''));
    if (s && s.img) return res.redirect(s.img);
    const R = renderer();
    if (!s || !R) return res.status(404).send('not found');
    const byId = {};
    skinsApi.CATALOG.forEach(i => { byId[i.id] = i; });
    res.set('Content-Type', 'image/svg+xml; charset=utf-8');
    res.set('Cache-Control', 'no-cache');
    res.send(R.svg(s.skin, byId, { height: 420 }));
  });

  // вендорные кнопки удаления и оценки
  app.post('/removeSkin', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ code: 0 });
    const i = list.findIndex(x => low(x.skinName) === low(req.body.skinName) &&
                                  low(x.author) === low(u.name));
    if (i === -1) return res.json({ code: 1 });
    list.splice(i, 1); save();
    res.json({ code: 2 });
  });

  app.post('/uploadSkinVote', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ code: 1 });
    const s = list.find(x => low(x.skinName) === low(req.body.skinName) &&
                             low(x.author) === low(req.body.author));
    if (!s) return res.json({ code: 2, val: 'Скин не найден' });
    if (low(s.author) === low(u.name)) return res.json({ code: 2, val: 'Свой скин оценивать нельзя' });
    const v = parseInt(req.body.vote) > 0 ? 1 : -1;
    s.votes = s.votes || {};
    if (s.votes[low(u.name)] === v) delete s.votes[low(u.name)];
    else s.votes[low(u.name)] = v;
    retally(s); save();
    res.json({ code: 0 });
  });

  // ---------- скины игрока (вкладка Skins в профиле) ----------
  app.get('/userSkins', (req, res) => {
    const me = currentUser(req);
    const self = me && low(me.name) === low(req.query.name);
    const mine = mineOf(req.query.name).filter(s => self || isPublic(s));
    res.json({ count: mine.length, skins: mine.map(s => pub(s, me && me.name)) });
  });

  // автор надетого скина — для страницы Avatar и профиля
  app.get('/skins/wornBy', (req, res) => {
    const db = getDb();
    const u = db.users[key(req.query.name)];
    if (!u || !u.wearing) return res.json({ author: '', skinName: '' });
    const s = list.find(x => x.id === u.wearing);
    res.json(s ? { author: s.author, skinName: s.skinName, id: s.id } : { author: '', skinName: '' });
  });
}

module.exports = { register, reload: load, MINE_LIMIT };
