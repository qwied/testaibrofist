// ============ СКИНЫ ИГРОКОВ: загруженные картинки, оценки, витрина Avatar ============
/* Скин — это картинка, которую игрок сам ЗАГРУЖАЕТ в Skin Editor (см.
   /skins/publish — выложить в Skins Browser на оценку всем). Раньше тут
   был холст, по которому рисовали пикселями; его убрали целиком —
   рисунок по пикселям выглядел грубо рядом с гладкой фигурой персонажа,
   и не было никакой защиты от неприемлемых картинок, потому что автор
   рисовал их прямо в браузере. Загруженный файл вместо этого реально
   декодируется и проверяется автомодерацией (см. imgModeration.js)
   ДО того, как попасть на диск и в список — сама картинка целиком
   заменяет фигуру персонажа (как раньше только у владельца через
   /owner/publishImageSkin, теперь и у обычных игроков).

   Носить загруженный скин нельзя, пока владелец не выложит его в Avatar
   (/owner/skinToAvatar, может ещё и оценки подкрутить — /owner/skinVotes);
   если скин платный, то и купить, как любому игроку, — автору рисунка
   тут никаких особых прав, публикация и ношение — два разных шага (см.
   /skins/wear). Старый каталог покупных деталей (голова+тело из готовых
   картинок) убран — см. skins.js. */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const dns = require('dns').promises;
const { decodeImage, scanForBlockedContent, MIN_DIM, MAX_DIM, MAX_GIF_DIM, MAX_GIF_FRAMES } = require('./imgModeration.js');

const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'userskins.json');

const MINE_LIMIT = 20;      // сколько своих образов можно держать в «Мои скины» одновременно
const SKIN_DAILY_LIMIT = 5; // сколько НОВЫХ скинов можно опубликовать за сутки
const IMG_DIR = path.join(DATA_DIR, 'skinimg');
const IMG_MAX = 6 * 1024 * 1024;   // 6 МБ — с запасом под фото с телефона
/* SVG не принимаем нигде: внутри него может лежать скрипт. WEBP — тоже
   нет, но только для игроков (см. PLAYER_IMG_TYPES ниже): его декодер
   (imgModeration.js) не умеет разбирать, а без разбора по пикселям
   нечего было бы прогонять через автомодерацию. GIF же декодировать
   умеет (см. imgModeration.js — там свои, более строгие пределы
   разрешения и числа кадров: разворачивать все кадры анимации в память
   для проверки куда затратнее одной картинки). У владельца
   (/owner/publishImageSkin) автомодерации нет и не нужна — там шире,
   весь IMG_TYPES. */
const IMG_TYPES = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/gif': 'gif', 'image/webp': 'webp'
};
const PLAYER_IMG_TYPES = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif'
};

/* Тот же приём, что и в maps.js (публикация карт): считаем не по списку
   скинов, а по счётчику в аккаунте — иначе лимит обходился бы публикацией
   и немедленным удалением. */
function publishedToday(u) {
  if (!u || !u.skinDay || Date.now() - u.skinDay > 864e5) return 0;
  return u.skinCount || 0;
}
function countSkinPublish(u) {
  if (!u.skinDay || Date.now() - u.skinDay > 864e5) { u.skinDay = Date.now(); u.skinCount = 0; }
  u.skinCount = (u.skinCount || 0) + 1;
}
function publishWait(u) {
  return Math.max(0, (u.skinDay || Date.now()) + 864e5 - Date.now());
}

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

// без картинки скин ничем не отличим от пустышки — такие (из старого
// каталога деталей, которого больше нет) в списках не показываем
const isPublic = s => !!s.img;
function mineOf(name) { return list.filter(s => low(s.author) === low(name)); }

function pub(s, me) {
  const t = tally(s);
  return {
    id: s.id, skinName: s.skinName, author: s.author,
    date: s.date, likes: t.likes, dislikes: t.dislikes, rating: t.rating,
    inAvatar: !!s.inAvatar, price: s.price || 0,
    img: s.img || '', kind: s.kind || 'full',
    myVote: me ? (s.votes || {})[low(me)] || 0 : 0
  };
}

// отпечаток картинки скина — по нему ловим повторные публикации рисунка
function imgSig(buf) {
  return 'img:' + crypto.createHash('md5').update(buf).digest('hex');
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
function fromDataUrl(raw, types) {
  const m = /^data:([\w/+.-]+);base64,([\s\S]+)$/.exec(String(raw || '').trim());
  if (!m) return null;
  const ext = (types || IMG_TYPES)[m[1].toLowerCase()];
  if (!ext) return { bad: 'This image format is not supported' };
  let buf;
  try { buf = Buffer.from(m[2], 'base64'); } catch (e) { return { bad: 'Image cannot be read' }; }
  if (!buf.length) return { bad: 'Image is empty' };
  if (buf.length > IMG_MAX) return { bad: 'Image is larger than ' + Math.round(IMG_MAX / (1024 * 1024)) + ' MB' };
  return { buf, ext };
}

// адрес в интернете. Забираем сами, но с ограничениями: только http(s),
// стандартный порт, не локальная сеть — причём проверяется УЖЕ разрешённый
// адрес, а не только имя: подмену DNS в локальную сеть так не провести.
const PRIVATE_HOST = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1)|^172\.(1[6-9]|2\d|3[01])\./i;
const PRIVATE_IP = /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/;

async function assertPublicHost(hostname) {
  if (PRIVATE_HOST.test(hostname)) throw new Error('local network addresses are not allowed');
  // имя хоста разрешаем и проверяем все полученные адреса
  const addrs = await dns.lookup(hostname, { all: true, verbatim: true });
  addrs.forEach(a => {
    if (PRIVATE_IP.test(a.address) || a.address === '::1')
      throw new Error('this address leads to a local network');
  });
}

async function fromUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch (e) { return { bad: 'That is not a valid URL' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:')
    return { bad: 'The URL must use http or https' };
  if (u.port && u.port !== '80' && u.port !== '443')
    return { bad: 'Non-standard ports are not allowed in the URL' };
  if (u.username || u.password)
    return { bad: 'Credentials are not allowed in the URL' };
  try { await assertPublicHost(u.hostname); }
  catch (e) { return { bad: 'Links to a local network are not allowed' }; }

  let r;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 12000);
    r = await fetch(u.href, { redirect: 'follow', signal: ctl.signal });
    clearTimeout(t);
  } catch (e) { return { bad: 'Failed to download: ' + (e.message || e) }; }

  // после редиректов адрес мог переехать в локальную сеть — проверяем ещё раз
  try { await assertPublicHost(new URL(r.url).hostname); }
  catch (e) { return { bad: 'Links to a local network are not allowed' }; }

  if (!r.ok) return { bad: 'Image server responded ' + r.status };
  const ct = String(r.headers.get('content-type') || '').split(';')[0].toLowerCase();
  const ext = IMG_TYPES[ct];
  if (!ext) return { bad: 'That URL is not an image (' + (ct || 'no type') + ')' };
  const len = parseInt(r.headers.get('content-length') || '0', 10);
  if (len > IMG_MAX) return { bad: 'Image is larger than 3 MB' };

  /* Content-Length — это то, что СКАЗАЛ чужой сервер, а не факт. При
     chunked-ответе заголовка может не быть вовсе (len тогда 0, проверка
     выше молча проходит), и раньше весь ответ грузился в память ЦЕЛИКОМ
     ещё до проверки размера — чужой сервер мог стримить гигабайты и
     положить процесс. Теперь режем поток сами, как только он превысил лимит. */
  const buf = await readLimited(r.body, IMG_MAX);
  if (buf === null) return { bad: 'Image is larger than 3 MB' };
  if (!buf.length) return { bad: 'Empty response' };
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

function register(app, acc) {
  const { currentUser, isOwner, save: saveUsers, getDb, key } = acc;
  const ownerOnly = (req, res) => {
    const u = currentUser(req);
    if (!isOwner(u)) { res.json({ status: 'error', message: 'Not available' }); return null; }
    return u;
  };

  // ---------- текущий образ игрока (шапка, профиль, списки друзей) ----------
  app.get('/skin/of', (req, res) => {
    const db = getDb();
    const u = db.users[key(req.query.name)];
    res.json({ img: (u && u.skinImg) || '', kind: (u && u.skinKind) || 'full', name: u ? u.name : '' });
  });

  // скины сразу нескольких игроков — для списков друзей и таблиц
  app.get('/skins/many', (req, res) => {
    const db = getDb();
    const names = String(req.query.names || '')
      .split(',').map(n => n.trim()).filter(Boolean).slice(0, 60);
    const out = {};
    names.forEach(n => {
      const u = db.users[key(n)];
      if (u && u.skinImg) out[n] = { img: u.skinImg, kind: u.skinKind || 'full' };
    });
    res.json({ skins: out });
  });

  // свой собственный надетый образ — использует сама игра (см. game.js)
  app.get('/skin/my', (req, res) => {
    const u = currentUser(req);
    res.json({ img: (u && u.skinImg) || '', kind: (u && u.skinKind) || 'full' });
  });

  // ---------- снять надетый скин — вернуться к обычной фигуре ----------
  app.post('/skins/reset', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Sign in first' });
    delete u.skin;
    delete u.skinImg;
    delete u.skinKind;
    u.wearing = '';
    saveUsers();
    res.json({ status: 'success' });
  });

  // ---------- выложить загруженную картинку в Skins Browser ----------
  /* Публикация открыта всем: загруженная картинка (или GIF — тогда ещё и
     анимированная, см. gifPlayer.js) идёт на оценку в Skins Browser.
     Владелец решает, что достойно попасть в Avatar за монеты (см.
     /owner/skinToAvatar). Перед сохранением на диск картинка (1)
     проверяется по счётчикам (сколько всего своих скинов и сколько
     опубликовано за сутки — см. SKIN_DAILY_LIMIT), (2) реально
     декодируется и проверяется на разрешение (у GIF — ещё и на число
     кадров), (3) прогоняется через нейросеть + эвристику на кровь
     (imgModeration.js, все кадры для GIF) — если что-то из этого не
     пройдёт, на диск ничего не попадает вовсе. */
  app.post('/skins/publish', async (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Sign in first' });

    const skinName = cleanText(req.body.skinName, 30);
    if (skinName.length < 2 || skinName.length > 30)
      return res.json({ status: 'error', message: 'Skin name: 2 to 30 characters' });

    const raw = String(req.body.img || '').trim();
    if (!raw) return res.json({ status: 'error', message: 'No image provided' });

    const mine = mineOf(u.name);
    if (mine.some(s => low(s.skinName) === low(skinName)))
      return res.json({ status: 'error', message: 'You already have a skin with this name' });
    if (mine.length >= MINE_LIMIT)
      return res.json({ status: 'error',
                        message: 'The Skins Browser holds up to ' + MINE_LIMIT +
                                 ' of your skins. Delete some to make room.' });

    const usedToday = publishedToday(u);
    if (usedToday >= SKIN_DAILY_LIMIT) {
      const mins = Math.ceil(publishWait(u) / 60000);
      const h = Math.floor(mins / 60), mn = mins % 60;
      return res.json({
        status: 'error',
        message: 'Daily limit of ' + SKIN_DAILY_LIMIT + ' skins reached. You can publish the next one in '
                 + (h > 0 ? h + 'h ' + mn + 'm' : mn + 'm') + '.'
      });
    }

    // только реальные PNG/JPEG/GIF — единственные форматы, которые умеет
    // разобрать imgModeration.js; без разбора по пикселям автомодерации
    // было бы нечего проверять
    const got = fromDataUrl(raw, PLAYER_IMG_TYPES);
    if (!got) return res.json({ status: 'error', message: 'Image not recognized' });
    if (got.bad) return res.json({ status: 'error', message: got.bad });

    // настоящее декодирование (а не просто доверие заявленному
    // Content-Type) — заодно отсекает битые файлы и переименованные
    // не-картинки
    const decoded = decodeImage(got.buf, got.ext);
    if (!decoded)
      return res.json({ status: 'error',
                        message: 'Could not read this image — please upload a plain PNG, JPEG or GIF' });
    const isGif = got.ext === 'gif';
    const maxDim = isGif ? MAX_GIF_DIM : MAX_DIM;
    if (decoded.width < MIN_DIM || decoded.height < MIN_DIM)
      return res.json({ status: 'error',
                        message: 'Image is too small — at least ' + MIN_DIM + '×' + MIN_DIM + ' pixels required' });
    if (decoded.width > maxDim || decoded.height > maxDim)
      return res.json({ status: 'error',
                        message: (isGif ? 'GIF' : 'Image') + ' is too large — at most ' +
                                 maxDim + '×' + maxDim + ' pixels allowed' });
    if (decoded.tooManyFrames)
      return res.json({ status: 'error',
                        message: 'GIF has too many frames — at most ' + MAX_GIF_FRAMES + ' allowed' });
    if (!decoded.frames)
      return res.json({ status: 'error', message: 'Could not read this image' });

    let flagged;
    try { flagged = await scanForBlockedContent(decoded); }
    catch (e) {
      console.log('[skin-moderation] проверка недоступна:', e.message);
      return res.json({ status: 'error',
                        message: 'Content moderation is temporarily unavailable — please try again in a bit' });
    }
    if (flagged) {
      console.log('[skin-moderation] blocked upload from', u.name, '- reason:', flagged.reason,
                  flagged.ratio !== undefined ? 'ratio: ' + flagged.ratio.toFixed(2) : JSON.stringify(flagged.classes));
      return res.json({
        status: 'error',
        message: 'This image was blocked by automatic content moderation (looks like it may contain explicit ' +
                 'or graphic content). If you think this is a mistake, contact the owner.'
      });
    }

    // проверяем совпадение у ВСЕХ опубликованных скинов, не только своих —
    // иначе одну и ту же картинку можно раздать по кругу под разными именами
    const sig = imgSig(got.buf);
    const twin = list.find(s => s.sig === sig);
    if (twin)
      return res.json({ status: 'error',
                        message: low(twin.author) === low(u.name)
                          ? 'This exact image is already published — «' + twin.skinName + '»'
                          : 'This exact image is already published by «' + twin.author + '» — «' + twin.skinName + '»' });

    const id = 's' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    let img;
    try { img = saveImage(got.buf, got.ext, id); }
    catch (e) { return res.json({ status: 'error', message: 'Failed to save: ' + e.message }); }

    const item = {
      id, skinName, author: u.name, img, sig,
      date: Date.now(), created: Date.now(),
      votes: {}, boostLikes: 0, boostDislikes: 0, rating: 0,
      inAvatar: false, price: 0
    };
    list.push(item);
    countSkinPublish(u);
    saveUsers();
    save();

    /* Публикация не надевает скин сама: до того как владелец выложит его
       в Avatar (и его купят, если он платный), носить нельзя — даже
       автору. См. /skins/wear. */
    const left = Math.max(0, MINE_LIMIT - mineOf(u.name).length);
    const leftToday = Math.max(0, SKIN_DAILY_LIMIT - publishedToday(u));
    res.json({
      status: 'success', id, left, limit: MINE_LIMIT, leftToday, dailyLimit: SKIN_DAILY_LIMIT,
      message: 'Skin «' + skinName + '» published to Skins Browser  ·  today: ' +
               leftToday + ' of ' + SKIN_DAILY_LIMIT + ' left'
    });
  });

  // ---------- скин из картинки (только владелец) ----------
  app.post('/owner/publishImageSkin', async (req, res) => {
    if (!ownerOnly(req, res)) return;
    const u = currentUser(req);

    const skinName = cleanText(req.body.skinName, 30);
    if (skinName.length < 2 || skinName.length > 30)
      return res.json({ status: 'error', message: 'Skin name: 2 to 30 characters' });

    if (list.some(s => low(s.skinName) === low(skinName) && low(s.author) === low(u.name)))
      return res.json({ status: 'error', message: 'You already have a skin with this name' });

    const raw = String(req.body.img || '').trim();
    if (!raw) return res.json({ status: 'error', message: 'No image provided' });

    const id = 's' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);

    // Файл с телефона приходит как data:image/..., ссылка из интернета —
    // как обычный адрес. Во втором случае скачиваем сами: иначе картинка
    // держалась бы на чужом сервере и пропала бы вместе с ним.
    let got = /^data:/i.test(raw) ? fromDataUrl(raw) : await fromUrl(raw);
    if (!got) return res.json({ status: 'error', message: 'Image not recognized' });
    if (got.bad) return res.json({ status: 'error', message: got.bad });

    let img;
    try { img = saveImage(got.buf, got.ext, id); }
    catch (e) { return res.json({ status: 'error', message: 'Failed to save: ' + e.message }); }

    const item = {
      id: id,
      skinName, author: u.name,
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
               message: 'Skin added from image: «' + skinName + '»' });
  });

  // заменить картинку у существующего скина
  app.post('/owner/skinImage', async (req, res) => {
    if (!ownerOnly(req, res)) return;
    const s = list.find(x => x.id === String(req.body.id || ''));
    if (!s) return res.json({ status: 'error', message: 'Skin not found' });
    const raw = String(req.body.img || '').trim();
    if (!raw) {
      const had = s.img;
      delete s.img; save();
      unlinkSkinImg(had);
      return res.json({ status: 'success', img: '' });
    }

    let got = /^data:/i.test(raw) ? fromDataUrl(raw) : await fromUrl(raw);
    if (!got) return res.json({ status: 'error', message: 'Image not recognized' });
    if (got.bad) return res.json({ status: 'error', message: got.bad });
    const oldImg = s.img;
    try { s.img = saveImage(got.buf, got.ext, s.id); }
    catch (e) { return res.json({ status: 'error', message: 'Failed to save: ' + e.message }); }
    // владелец подставляет произвольную картинку — она снова заменяет
    // фигуру целиком, а не ложится аксессуаром поверх тела
    delete s.kind;
    save();
    if (oldImg && oldImg !== s.img) unlinkSkinImg(oldImg);
    res.json({ status: 'success', img: s.img || '' });
  });

  // сколько свободных мест осталось в «Мои скины»
  app.get('/skins/limit', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({
      limit: MINE_LIMIT, left: MINE_LIMIT, dailyLimit: SKIN_DAILY_LIMIT, leftToday: SKIN_DAILY_LIMIT, guest: true
    });
    res.json({
      limit: MINE_LIMIT, guest: false,
      left: Math.max(0, MINE_LIMIT - mineOf(u.name).length),
      dailyLimit: SKIN_DAILY_LIMIT,
      leftToday: Math.max(0, SKIN_DAILY_LIMIT - publishedToday(u))
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
    out.sort((a, b) => {
      if (sortBy === 'rating') return (tally(b).rating - tally(a).rating) || (b.date - a.date);
      if (sortBy === 'dislikes') return (tally(b).dislikes - tally(a).dislikes) || (b.date - a.date);
      if (sortBy === 'oldest') return a.date - b.date;
      return b.date - a.date;
    });

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
    if (!u) return res.json({ status: 'error', message: 'Sign in first' });
    const s = list.find(x => x.id === String(req.body.id || ''));
    if (!s) return res.json({ status: 'error', message: 'Skin not found' });
    if (low(s.author) === low(u.name))
      return res.json({ status: 'error', message: 'You can\'t vote on your own skin' });

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
    if (!u) return res.json({ status: 'error', message: 'Sign in first' });
    const i = list.findIndex(x => x.id === String(req.body.id || ''));
    if (i === -1) return res.json({ status: 'error', message: 'Skin not found' });
    if (low(list[i].author) !== low(u.name) && !isOwner(u))
      return res.json({ status: 'error', message: 'You can only delete your own skins' });
    unlinkSkinImg(list[i].img);
    list.splice(i, 1);
    save();
    res.json({ status: 'success' });
  });

  // ---------- примерить чужой скин ----------
  app.post('/skins/wear', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Sign in first' });
    const s = list.find(x => x.id === String(req.body.id || ''));
    if (!s) return res.json({ status: 'error', message: 'Skin not found' });

    /* Надеть можно только то, что владелец выложил в витрину Avatar —
       и купленное, если оно платное. Своё же имя автора здесь больше
       никаких прав не даёт: опубликовать рисунок и получить скин на
       персонажа — теперь два разных шага, между ними стоит витрина. */
    u.boughtSkins = Array.isArray(u.boughtSkins) ? u.boughtSkins : [];
    const bought = u.boughtSkins.indexOf(s.id) !== -1;
    if (!bought && !s.inAvatar)
      return res.json({ status: 'error',
                        message: 'This skin isn\'t in Avatar yet — you can\'t wear it' });

    // скины из витрины Avatar с ценой нужно сначала купить
    if (s.inAvatar && (s.price || 0) > 0 && !bought)
      return res.json({ status: 'error', code: 'buy', price: s.price,
                        message: 'Buy this skin first for ' + s.price + ' coins' });

    delete u.skin;
    u.wearing = s.id;
    if (s.img) { u.skinImg = s.img; u.skinKind = s.kind || 'full'; }
    else { delete u.skinImg; delete u.skinKind; }
    saveUsers();
    res.json({ status: 'success', img: s.img || '', kind: s.kind || 'full',
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
          o.owned = bought.has(s.id) || !(s.price || 0);
          return o;
        })
    });
  });

  app.post('/skins/buy', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Sign in first' });
    const s = list.find(x => x.id === String(req.body.id || ''));
    if (!s || !s.inAvatar) return res.json({ status: 'error', message: 'This skin is not for sale' });

    // автор своего скина покупает его на общих основаниях — см. /skins/wear
    u.boughtSkins = Array.isArray(u.boughtSkins) ? u.boughtSkins : [];
    if (u.boughtSkins.indexOf(s.id) !== -1)
      return res.json({ status: 'error', message: 'You already own this skin' });

    const price = s.price || 0;
    if ((u.coins || 0) < price)
      return res.json({ status: 'error', message: 'You need ' + (price - (u.coins || 0)) + ' more coins' });

    u.coins = (u.coins || 0) - price;
    u.boughtSkins.push(s.id);
    saveUsers();
    res.json({ status: 'success', coins: u.coins });
  });

  // ---------- владелец: выложить скин в Avatar и назначить цену ----------
  app.post('/owner/skinToAvatar', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const s = list.find(x => x.id === String(req.body.id || ''));
    if (!s) return res.json({ status: 'error', message: 'Skin not found' });

    const on = String(req.body.on || 'true') === 'true';
    s.inAvatar = on;
    if (on) s.price = Math.max(0, parseInt(req.body.price) || 0);
    save();
    res.json({
      status: 'success', inAvatar: s.inAvatar, price: s.price || 0,
      message: on
        ? '«' + s.skinName + '» in Avatar for ' + (s.price || 0) + ' coins'
        : '«' + s.skinName + '» removed from Avatar'
    });
  });

  // ---------- владелец: накрутка оценок скина ----------
  app.post('/owner/skinVotes', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const s = list.find(x => x.id === String(req.body.id || ''));
    if (!s) return res.json({ status: 'error', message: 'Skin not found' });
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
    res.status(404).send('not found');
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
    if (!s) return res.json({ code: 2, val: 'Skin not found' });
    if (low(s.author) === low(u.name)) return res.json({ code: 2, val: 'You can\'t vote on your own skin' });
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
