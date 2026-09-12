const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
app.disable('x-powered-by');
const server = http.createServer(app);
/* TCP_NODELAY: каждый пакет уходит в сеть сразу, без копейки «на отправку
   пачкой». Для игры, где каждое сообщение — позиция на 30 кадров в секунду,
   даже лишние 10–20 мс от алгоритма Нейгла заметны глазу. */
server.on('connection', (tcp) => { try { tcp.setNoDelay(true); } catch (e) {} });
const io = socketIo(server, {
  cors: { origin: true, credentials: true },   // только собственный домен: куки идут вместе с рукопожатием
  /* Сокеты разрешены только «своим» страницам: источник рукопожатия
     должен сидеть на том же хосте, к которому подключается. Чужой сайт
     больше не может даже открыть сокет — ни websocket, ни polling.
     Одинаково работает на своём домене, на *.railway.app и на localhost. */
  allowRequest: (handshake, cb) => {
    try {
      const origin = String(handshake.headers.origin || '');
      if (!origin) return cb(null, true);            // клиент без заголовка — пустят гостем
      const oh = new URL(origin).host.toLowerCase().split(':')[0];
      const host = String(handshake.headers.host || '').toLowerCase().split(':')[0];
      const ok = (oh && oh === host) || oh === "localhost" || oh === "127.0.0.1";
      /* Первый аргумент cb — СТРОКА ошибки (не объект Error!): движок
         вставляет её прямо в заголовок ответа, и объект Error роняет
         abort соединения — блокировка превращалась в тыкву. */
      cb(ok ? null : 'foreign origin', ok);
    } catch (e) { cb(null, true); }                  // разобрать не смогли — не баним
  },
  maxHttpBufferSize: 1e6,
  /* Сжатие на мелких частых пакетах позиции — чистые потери процессорного
     времени на обеих сторонах: выигрыш в байтах копеечный, а задержка
     добавляется каждому сообщению. */
  perMessageDeflate: false,
  pingInterval: 5000,
  pingTimeout: 12000,
  transports: ['websocket', 'polling']
});

let accountsRef = null;   // заполняется ниже, нужен для проверки прав на owner.js

/* Свой домен.
   Задайте переменную окружения PRIMARY_HOST (например aibrofist.pp.ua), и
   старый адрес *.up.railway.app будет отправлять на него постоянным
   редиректом — старые ссылки, закладки и поисковая выдача не потеряются.
   Если переменная не задана, ничего не меняется. */
const PRIMARY_HOST = String(process.env.PRIMARY_HOST || '').trim().toLowerCase();
app.use((req, res, next) => {
  if (!PRIMARY_HOST) return next();
  const host = String(req.headers.host || '').toLowerCase().split(':')[0];
  if (!host || host === PRIMARY_HOST) return next();
  // localhost при разработке не трогаем
  if (host === 'localhost' || host === '127.0.0.1') return next();
  res.redirect(301, 'https://' + PRIMARY_HOST + req.originalUrl);
});

/* Служебные файлы наружу не отдаём. Список был поимённым и отставал от
   репозитория: новый тест или свежий readme оказывались доступны по
   прямой ссылке. Теперь закрыты и целые семейства по префиксу. */
const PRIVATE = ['/server.js','/accounts.js','/maps.js','/skins.js','/userskins.js','/updatetimer.js','/abuse.js',
                 '/themes.js','/extras.js','/check-domain.js','/backup.js',
                 '/package.json','/package-lock.json'];
const PRIVATE_PREFIX = ['/test-', '/audit-', '/readme', '/domain', '/patch_', '/data', '/node_modules'];
app.use((req, res, next) => {
  const p = req.path.toLowerCase();
  if (PRIVATE.indexOf(p) !== -1) return res.status(404).send('Not found');
  for (let i = 0; i < PRIVATE_PREFIX.length; i++)
    if (p.indexOf(PRIVATE_PREFIX[i]) === 0) return res.status(404).send('Not found');
  next();
});

/* ================== БЕЗОПАСНОСТЬ ================== */

/* Заголовки защиты: чужие сайты не встраивают игру в iframe,
   браузеру запрещено «догадываться» о типе файла, а посторонние
   скрипты и стили не исполняются — даже если их вписали в поле ввода. */
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.set('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob: https:; " +
    "media-src 'self' data: blob:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' ws: wss:; " +
    "frame-src 'self'; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "frame-ancestors 'self'");
  next();
});

/* Мини-лимитер запросов: без него один скрипт способен забомбить сервер
   тысячами обращений. Обычному игроку лимит не виден никогда. */
const RL_BUCKETS = new Map();
setInterval(() => {
  const now = Date.now();
  RL_BUCKETS.forEach((b, k) => { if (now - b.start > 120000) RL_BUCKETS.delete(k); });
}, 60000).unref();
/* За Cloudflare реальный адрес приходит в CF-Connecting-IP — но эти
   заголовки шлёт КЛИЕНТ, и если перед Node в моменте нет прокси, который
   их сам перезаписывает (например, прямой заход на *.up.railway.app без
   Cloudflare), любой запрос может подставить туда что угодно и на каждый
   запрос менять "свой IP" — лимитер и защита от брутфорса тогда не значат
   ничего. Доверяем этим заголовкам только если оператор явно подтвердил,
   что перед сервером всегда стоит такой прокси. */
const TRUST_PROXY_IP = /^(1|true|yes)$/i.test(String(process.env.TRUST_PROXY_IP || ''));
function clientKey(req) {
  if (TRUST_PROXY_IP) {
    const cf = String(req.headers['cf-connecting-ip'] || '').trim();
    if (cf) return cf;
    // крайний левый элемент X-Forwarded-For подделывается клиентом
    const xff = String(req.headers['x-forwarded-for'] || '');
    if (xff) return xff.split(',').pop().trim();
  }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}
/* Статику (весь каталог сайта отдаётся через express.static ниже —
   html/js/css/картинки) лимитер раньше тоже считал, наравне с «живыми»
   запросами. Один переход по страницам — это уже десяток-другой файлов
   разом, а за последние сессии на сайте прибавилось поллинга (Messages
   каждые 5-8 сек, Leaderboard каждые 15 сек) — в сумме лимит стал
   реально ловить обычных игроков, а не только скрипты-бомбардировщики.
   Хуже того: получив 429 на sound.js, браузер получал JSON вместо
   скрипта и ронял его с ошибкой MIME — сайт частично ломался.
   Статика ничего не считает и не пишет на диск, лимитировать её незачем —
   и так есть Cache-Control на этих файлах (см. ниже). */
const STATIC_EXT = /\.(js|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|map|xml|txt|webmanifest|mp3|mp4)$/i;
function rateLimit(limit, windowMs) {
  return (req, res, next) => {
    if (req.method === 'GET' && STATIC_EXT.test(req.path)) return next();
    const k = clientKey(req);
    const now = Date.now();
    let b = RL_BUCKETS.get(k);
    if (!b || now - b.start > windowMs) { b = { start: now, n: 0 }; RL_BUCKETS.set(k, b); }
    b.n++;
    if (b.n > limit) return res.status(429).json({ status: 'error', message: 'Too many requests, try again later' });
    next();
  };
}
// было 240 — с ростом поллинга (Messages/Leaderboard) стало тесно и для
// динамических запросов настоящего активного игрока в нескольких вкладках
app.use(rateLimit(500, 60000));   // 500 запросов в минуту с одного адреса

/* CSRF: POST-запросы принимаем только со своего сайта.
   Кука и так SameSite=Lax, это вторая линия обороны. */
app.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  const host = String(req.headers.host || '').toLowerCase();      // хост с портом
  const src = String(req.headers.origin || req.headers.referer || '').toLowerCase();
  if (!src) return next();            // старые клиенты без заголовков — пропускаем
  let hostOrigin = '';
  try { hostOrigin = new URL(src).host || ''; } catch (e) { return res.status(403).json({ status: 'error', message: 'Forbidden' }); }
  if (hostOrigin && hostOrigin !== host)
    return res.status(403).json({ status: 'error', message: 'Forbidden' });
  next();
});

// owner.js отдаём ТОЛЬКО владельцу. Обычный игрок получает пустой файл,
// поэтому у него нет ни кнопок, ни разметки, ни адресов служебных запросов.
app.get('/owner.js', (req, res) => {
  res.set('Content-Type', 'application/javascript; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  let allowed = false;
  try { allowed = accountsRef && accountsRef.isOwner(accountsRef.currentUser(req)); }
  catch (e) { allowed = false; }
  if (!allowed) return res.send('/* */');
  res.sendFile(path.join(__dirname, 'owner.js'));
});

/* adminAbuse.js — то же правило, что и у owner.js: обычный игрок получает
   пустышку, поэтому у него нет ни кнопки, ни адресов служебных запросов. */
app.get('/adminAbuse.js', (req, res) => {
  res.set('Content-Type', 'application/javascript; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  let allowed = false;
  try { allowed = accountsRef && accountsRef.isOwner(accountsRef.currentUser(req)); }
  catch (e) { allowed = false; }
  // чужому — обычное «нет такого файла», а не пустышка: так о панели
  // вообще ничего не узнать
  if (!allowed) return res.status(404).send('Not found');
  res.sendFile(path.join(__dirname, 'adminAbuse.js'));
});

// картинки скинов лежат в data/skinimg — отдаём только их.
// sandbox+CSP: даже подложенный в картинку SVG-скрипт не исполнится никогда.
app.use('/skinimg', (req, res, next) => {
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.set('X-Content-Type-Options', 'nosniff');
  next();
}, express.static(path.join(__dirname, 'data', 'skinimg'), {
  maxAge: '7d', fallthrough: true
}));

/* Картинки новостей: лежат в data/logimg, отдаём только их.
   Имя файла случайное и больше не меняется, поэтому кэш ставим годовой —
   один раз скачал и больше не дёргает сервер. Песочница та же, что у
   скинов: даже SVG со скриптом внутри ничего не выполнит. */
app.use('/logimg', (req, res, next) => {
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.set('X-Content-Type-Options', 'nosniff');
  next();
}, express.static(require('./extras.js').IMG_DIR, {
  maxAge: '365d', immutable: true, fallthrough: true
}));

/* Поисковикам: что можно обходить и где карта сайта.
   Хост берём из запроса — тогда файл верен и на своём домене, и на
   railway.app, и на localhost, без правок в коде. */
function siteOrigin(req) {
  const host = PRIMARY_HOST || String(req.headers.host || 'aibrofist.online');
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  return proto + '://' + host;
}

app.get('/robots.txt', (req, res) => {
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send([
    'User-agent: *',
    'Allow: /',
    // игровые комнаты и профили в выдаче не нужны: их бесконечно много
    'Disallow: /game.html',
    'Sitemap: ' + siteOrigin(req) + '/sitemap.xml',
    ''
  ].join('\n'));
});

app.get('/sitemap.xml', (req, res) => {
  const base = siteOrigin(req);
  const pages = ['/', '/hide-and-seek.html', '/race.html', '/mapsBrowser.html',
                 '/editor.html', '/leaderboard.html', '/logs.html', '/themes.html', '/users.html'];
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send('<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + pages.map(p => '  <url><loc>' + base + p + '</loc></url>').join('\n')
    + '\n</urlset>\n');
});

// иконки сайта: браузер запрашивает /favicon.ico ещё до загрузки страницы
app.get('/favicon.ico', (req, res) => {
  res.set('Cache-Control', 'public, max-age=604800');
  res.sendFile(path.join(__dirname, 'favicon.ico'));
});

/* Страницы и скрипты приложения (.html/.js в корне) без явного
   Cache-Control браузер вправе показывать из кэша часами без единого
   обращения к серверу (эвристическое кэширование по Last-Modified) —
   после каждого деплоя часть игроков продолжает видеть старую версию,
   пока не очистят кэш сами. no-cache не запрещает хранить копию —
   только требует сперва спросить сервер, не устарела ли она (дешёвая
   проверка по ETag, без повторной скачки, если файл не менялся). */
app.use((req, res, next) => {
  if (req.path === '/' || /\.(html|js|css)$/i.test(req.path)) res.set('Cache-Control', 'no-cache');
  next();
});
app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

/* Режимов Two Player Adventure и Sandbox в игре нет: страницы удалены,
   остались только Hide and Seek и Race. Старые ссылки и закладки уводим
   на главную, чтобы вместо них не выпадала 404. */
app.get('/two-player.html', (req, res) => res.redirect(301, '/'));
app.get('/sandbox.html', (req, res) => res.redirect(301, '/'));

/* Резервные копии: бэкап приходит одним большим POST-запросом, поэтому
   маршрут надо зарегистрировать ДО скромных глобальных лимитов тела
   (тот же приём, что у /abuse/upload ниже). Права перепроверяются на
   каждый запрос внутри backup.js — обычному игроку маршруты невидимы. */
require('./backup.js').register(app, {
  acc: () => accountsRef,
  reloadAll: () => {
    require('./accounts.js').reload();
    require('./maps.js').reload();
    require('./userSkins.js').reload();
    require('./messages.js').reload();
    require('./extras.js').reload();
    require('./abuse.js').reload();
  }
});

/* Владелец грузит видео и гифки для общего шоу — они приходят в base64,
   поэтому для ЭТОГО маршрута тело должно вмещать десятки мегабайт.
   Остальные маршруты получают скромный лимит: огромные тела —
   это лазейка для забивания памяти. */
// клиент шлёт этот запрос как JSON (adminAbuse.js: form-urlencoded раздувал
// бы 40-мегабайтное видео втрое из-за процентного кодирования base64) —
// увеличенный лимит должен висеть именно на json-парсере, иначе тело режет
// глобальный express.json({limit:'512kb'}) ниже, и загрузка молча падает.
app.post('/abuse/upload', express.json({ limit: '60mb' }));
// картинка новости приходит тем же способом — base64 в теле запроса
app.post('/log/upload', express.urlencoded({ extended: false, limit: '20mb' }));
app.use(express.urlencoded({ extended: false, limit: '512kb' }));
app.use(express.json({ limit: '512kb' }));

// система аккаунтов, друзей и профилей
const accounts = require('./accounts.js');
accountsRef = accounts;
accounts.register(app);
require('./maps.js').register(app, accounts.currentUser, accounts);
require('./userSkins.js').register(app, accounts);
require('./messages.js').register(app, accounts);
require('./themes.js').register(app, accounts);
require('./updateTimer.js').register(app, accounts);
require('./abuse.js').register(app, accounts);
// файлы шоу владельца отдаём как статику: сами по себе они безобидны
app.use('/abusefile', express.static(require('./abuse.js').FILE_DIR,
        { maxAge: '1h', fallthrough: true }));
require('./extras.js').register(app, accounts);

// адреса, на которые ссылается шапка сайта
// автоподбор комнаты: та, где сейчас больше всего игроков этого режима
// аватарка игрока: одна картинка на всех, отдаётся прямо из кода
const AVATAR_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACtWK6eAAACxElEQVR4nO3dQVIbQRAAQdn//7N996HAaHa3GzLPRKhjp2ukA4jXCwAAAAAAAAAAAAAAAAAAAAAAAAAAAH6WX08PwOvPJ37GOT3Eg7/fZ4L4iHO7iQd9nxNh/Mv5XcwDvt4VYfzLOV7k99MDfHN3xHHn6/w4bp5rPLmwzvQg7yDnPX2bP/3634pAzpqynFPmWE8g50xbymnzrCSQM6Yu49S51hAIBIG8b/otPX2+0QTyni3Lt2XOcQQCQSBft+1W3jbvCAKBIJCv2Xobb537MQKBIBAIAoEgkP+3/XP89vlvJRAIAoEgEAgCgSAQCAKBIBAIAoEgkP+3/Xunts9/K4FAEAgEgUAQyNds/Ry/de7HCASCQL5u2228bd4RBAJBIO/ZcitvmXMcgbxv+vJNn280gUAQyBlTb+mpc60hkHOmLeO0eVYSyFlTlnLKHOsJ5Lynl/Pp1/9WPMxr3fkdVM7yAt5BrnXX0orjIh7sfa54N3F+F/OA73ciFOd2Ew/6eZ8JxjkBAAAAAAAAAMBsfsfnvAn/h9y5HuLvQc6aEMfrNWeO9QRyzrSlnDbPSgI5Y+oyTp1rDYG8b/oSTp9vNIFAEAgEgUAQCASBQBAIBIFAEAgEgUAQCASBQBAIBIFAEAgEgUAQCASBQBAIBIFAEAgEgUAQCASBQBAIBIFAEAgEgUAQCASBQBAIBIFAEAgEgUAQCASBQBAIBIFAEAgEgUAQCASBQBAIBIFAEAgEgUAQCASBQBAIBIFAEAgEgUAQCASBQBAIBIFAEAgEgUAQCASBQBAIBIFAEAgEgUAQCASBQBAIBIFAEAgEgUAQCASBQBAIBIFAEAgEgUAQCASBQBAIBIFAEAgEgUAQCASBvO/X0wN8YPp8ownkjKlLOHWuNQRyzrRlnDbPSgI5a8pSTpkDAAAAAAAAAAAAAAAAAAAAgJ/oL9ICJw+67ArWAAAAAElFTkSuQmCC', 'base64');
app.get(/^\/avatar\//, (req, res) => {
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(AVATAR_PNG);
});

app.get('/getBestRoom', (req, res) => {
  // чистим как имя комнаты в join: мусор в mode не заводит лишние ключи
  const mode = cleanName(req.query.mode) || 'hideAndSeek';
  const LIMIT = 40;                      // больше — заводим новую комнату
  let best = null, bestCount = -1;
  gameState.rooms.forEach((set, key) => {
    if (key.indexOf(mode + ':') !== 0) return;
    const n = set.size;
    if (n >= LIMIT) return;
    if (n > bestCount) { bestCount = n; best = key.slice(mode.length + 1); }
  });
  if (!best) {
    // свободных нет — создаём следующую по счёту
    let i = 1;
    while (gameState.rooms.has(mode + ':room' + i)) i++;
    best = 'room' + i;
    bestCount = 0;
  }
  res.json({ room: best, players: Math.max(0, bestCount) });
});

/* Публичный список того, кто сейчас в игре: те же имя/режим/комната,
   что и так видны любому зрителю прямо в самой игре — просто в одном
   JSON, а не по одному сокету на комнату. Используется, например,
   Discord-ботом для команды /online. Список режимов ограничен явно:
   join() принимает gameMode от клиента почти без проверки, и без
   фильтра сюда попадал бы любой мусорный "режим", которым кто-то
   решил бы подключиться. */
const PUBLIC_MODES = ['hideAndSeek', 'race'];
app.get('/api/online', (req, res) => {
  const modes = {};
  let total = 0;
  gameState.rooms.forEach((set, key) => {
    const i = key.indexOf(':');
    if (i === -1) return;
    const mode = key.slice(0, i), roomName = key.slice(i + 1);
    if (PUBLIC_MODES.indexOf(mode) === -1) return;
    const names = Array.from(set)
      .map(id => gameState.players.get(id))
      .filter(Boolean)
      .map(p => p.name);
    if (!names.length) return;
    if (!modes[mode]) modes[mode] = {};
    modes[mode][roomName] = names;
    total += names.length;
  });
  res.json({ modes, total });
});

app.get('/editor/index.html', (req, res) => res.redirect('/editor.html'));
app.get('/supporters/index.html', (req, res) => res.redirect('/leaderboard.html'));
app.get('/users/index.html', (req, res) => res.redirect('/users.html' + (req.originalUrl.split('?')[1] ? '?' + req.originalUrl.split('?')[1] : '')));
app.get('/mapsBrowser/index.html', (req, res) => res.redirect('/mapsBrowser.html'));
app.get('/editor/tutorial.html', (req, res) => res.redirect('/editor.html'));

// если аватарка не найдена — отдаём стандартную


// Оптимизированное состояние для 2000+ игроков
/* Короткий номер игрока. В снапшоте позиция едет 30 раз в секунду, и
   socket.id длиной в 20 символов занимал бы там больше места, чем сами
   координаты. Номер выдаётся при входе и живёт до выхода. */
let nidSeq = 0;

const gameState = {
  players: new Map(),
  chatMessages: new Map(),
  rooms: new Map(),
  activeAccounts: new Map(),   // ключ аккаунта -> socket.id, который сейчас им играет
  stats: {
    totalPlayers: 0,
    totalRooms: 0
  }
};

/* ================== ПРЯТКИ: ФАЗЫ И РУЛЕТКА ИСКАТЕЛЯ ==================
   Комнаты hideAndSeek живут по фазам, которые задаёт сервер: лобби с
   рулеткой (30 сек: пока крутится рулетка и пока прячутся) и раунд охоты
   (2 минуты). Победителя рулетки выбирает сервер один раз — все клиенты
   комнаты показывают одинаковую рулетку и приходят к одному искателю.
   Шансы НЕ равны и меняются каждый раунд: у каждого свой случайный вес,
   недавние искатели получают вес поменьше — вчерашний «счастливчик»
   почти наверняка уступит очередь. */
const HS_LOBBY_MS    = 30000;   // рулетка + время спрятаться
const HS_ROUND_MS    = Number(process.env.HS_ROUND_MS) || 120000;  // охота — 2 минуты
const HS_ROULETTE_MS = 6800;    // клиентская анимация укладывается в 10 секунд
const hsRooms = new Map();      // 'hideAndSeek:roomN' -> состояние раунда

/* Начислить монеты игроку (по аккаунту) и уведомить его сокет, если он
   ещё на связи. accountsRef.creditCoins сам держит общий часовой лимит —
   тут только считаем сумму до нуля, если лимит уже выбран, и не шлём
   пустое уведомление. */
function hsCreditAndNotify(socket, name, amount, reason) {
  const credited = accountsRef.creditCoins(name, amount);
  if (credited <= 0) return;
  const u = accountsRef.getDb().users[accountsRef.key(name)];
  socket.emit('coinsAwarded', { amount: credited, coins: u ? (u.coins || 0) : 0, reason: reason });
}

/* ================== ГОНКА: ОЧКИ ЗА ФИНИШ ==================
   Табличка «Scores» в углу экрана во время Race — снимок текущей
   комнаты, не привязан к аккаунту (гость тоже видит себя в списке,
   просто его очки нигде не сохраняются). Обнуляется, когда игрок
   выходит из комнаты или переподключается новым сокетом. */
function raceScoreboard(room) {
  const set = gameState.rooms.get(room);
  if (!set) return [];
  return Array.from(set)
    .map(id => gameState.players.get(id))
    .filter(Boolean)
    .map(p => ({ name: p.name, score: p.raceLiveScore || 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
function broadcastRaceScores(io, room) {
  io.to(room).emit('raceScores', raceScoreboard(room));
}

function hsMembers(room) {
  const set = gameState.rooms.get(room);
  if (!set) return [];
  return Array.from(set)
    .map(id => gameState.players.get(id))
    .filter(Boolean)
    .map(p => ({ id: p.id, name: p.name }));
}

/* Шансы: у каждого свой, каждый раунд новые. Возвращаем доли (сумма 1),
   чтобы те же числа ушли клиентам и показывались в углу экрана. */
function hsChances(members, st) {
  if (members.length <= 1) return members.map(() => 1);
  const w = members.map(m => {
    let x = 1 + Math.random() * 9;                // базовый вес 1..10, свой у каждого
    if (m.id === st.lastSeeker) x *= 0.25;        // был искателем в прошлом раунде — вчетверо меньше
    else if (m.id === st.prevSeeker) x *= 0.5;    // позапрошлый — вдвое меньше
    return x;
  });
  const total = w.reduce((a, b) => a + b, 0) || 1;
  return w.map(x => x / total);
}

/* Взвешенный жребий по готовым долям. */
function hsPick(members, chances) {
  if (members.length <= 1) return members.length ? members[0].id : null;
  let r = Math.random();
  for (let i = 0; i < members.length; i++) { r -= chances[i]; if (r <= 0) return members[i].id; }
  return members[members.length - 1].id;
}

/* Крутить рулетку: выбрать искателя и разослать комнате состав карточек.
   Если до конца лобби осталось меньше, чем длится анимация, лобби
   удлиняется — рулетка никогда не обрывается на середине. */
function hsSpin(io, room, st) {
  const members = hsMembers(room);
  if (!members.length) return;
  const chances = hsChances(members, st);
  const winner = members.find(m => m.id === hsPick(members, chances)) || members[0];
  st.prevSeeker = st.lastSeeker;
  st.lastSeeker = winner.id;
  st.seekerId = winner.id;
  st.seekerName = winner.name;
  const left = st.endsAt - Date.now();
  if (left < HS_ROULETTE_MS + 2000) {
    st.endsAt = Date.now() + HS_ROULETTE_MS + 2000;
    clearTimeout(st.timer);
    st.timer = setTimeout(() => hsStartRound(io, room, st), st.endsAt - Date.now());
  }
  io.to(room).emit('hsRoulette', {
    // шанс уходит вместе с составом — клиент рисует его в углу и на карточках
    players: members.map((m, i) => ({ id: m.id, name: m.name,
                                      chance: Math.round(chances[i] * 1000) / 10 })),
    winnerId: st.seekerId,
    duration: HS_ROULETTE_MS,
    msLeft: st.endsAt - Date.now(),
    roundNum: st.roundNum
  });
}

/* Раунд закончился — начисляем прячущимся, которых так и не поймали.
   Считаем только тех, кто был в комнате С НАЧАЛА раунда (st.roundMembers,
   снятый в hsStartRound): иначе можно было бы забежать в комнату за
   секунду до конца и получить монеты ни за что. Досрочный конец через
   hsOnCaught сюда тоже заходит, но там пойманы все — наградивших не
   найдётся, и цикл просто ничего не сделает. */
function hsAwardRoundEnd(io, room, st) {
  const members = st.roundMembers || [];
  const caught = st.caughtSet || new Set();
  members.forEach((m) => {
    if (caught.has(m.id)) return;
    const sock = io.sockets.sockets.get(m.id);
    if (!sock) return;                    // отключился — эту сессию уже не найти
    const acct = sessionName(sock.handshake.headers.cookie);
    if (!acct) return;                    // гость
    hsCreditAndNotify(sock, acct, 1 + Math.floor(Math.random() * 5), 'hsWin');
  });
}

function hsStartLobby(io, room, st) {
  if (st.phase === 'round') hsAwardRoundEnd(io, room, st);
  // Одному тоже можно: hsPick/hsChances сами ставят единственного игрока
  // искателем без жеребьёвки. Ловить в комнате некого — монеты за поимку
  // и за «дожил до конца» не начисляются, roundMembers/caughtSet это уже
  // обеспечивают, так что здесь достаточно просто не блокировать раунд.
  st.phase = 'lobby';
  st.roundNum++;
  st.caughtSent = false;
  st.endsAt = Date.now() + HS_LOBBY_MS;
  hsSpin(io, room, st);
  io.to(room).emit('hsPhase', { phase: 'lobby', msLeft: HS_LOBBY_MS, roundNum: st.roundNum });
  clearTimeout(st.timer);
  st.timer = setTimeout(() => hsStartRound(io, room, st), st.endsAt - Date.now());
}

function hsStartRound(io, room, st) {
  st.phase = 'round';
  st.endsAt = Date.now() + HS_ROUND_MS;
  // снимок пряток на момент старта — только они и только если не пойманы, получат награду в конце
  st.roundMembers = hsMembers(room).filter((m) => m.id !== st.seekerId);
  st.caughtSet = new Set();
  io.to(room).emit('hsPhase', { phase: 'round', msLeft: HS_ROUND_MS,
    seekerId: st.seekerId, seekerName: st.seekerName });
  clearTimeout(st.timer);
  st.timer = setTimeout(() => hsStartLobby(io, room, st), HS_ROUND_MS);
}

/* Досрочный конец раунда: искатель сообщил, что все пойманы. Верим только
   текущему искателю и не больше одного раза за раунд — иначе спамом
   сообщений можно было бы перескакивать раунды. */
function hsOnCaught(room, socketId) {
  const st = hsRooms.get(room);
  if (!st || st.phase !== 'round' || st.caughtSent) return;
  if (socketId !== st.seekerId) return;
  st.caughtSent = true;
  clearTimeout(st.timer);
  st.timer = setTimeout(() => hsStartLobby(io, room, st), 1400);
}

/* Ушёл игрок: комната опустела — состояние долой; в лобби ушёл сам
   искатель — крутим рулетку заново на оставшихся (в том числе если
   остался один — тогда искателем станет он же). */
function hsOnLeave(io, room, leftId) {
  const st = hsRooms.get(room);
  if (!st) return;
  const set = gameState.rooms.get(room);
  if (!set || set.size === 0) {
    clearTimeout(st.timer);
    hsRooms.delete(room);
    return;
  }
  if (leftId && leftId === st.seekerId && st.phase === 'lobby') hsSpin(io, room, st);
}

/* ================== ЗАЩИТА СОКЕТОВ ==================
   Гость мог назвать себя любым ником — в том числе чужим или ником
   владельца. Теперь имя подтверждённой сессии сильнее присланного,
   а гостю, замахнувшимся на чужой ник, сервер его меняет. */
const CLEAN = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;
function cleanText(v, max) {
  return String(v == null ? '' : v).replace(CLEAN, '').slice(0, max);
}
function cleanName(v) {
  return cleanText(v, 20).replace(/[<>"'&]/g, '').trim();
}
function sessionName(cookieHeader) {
  try {
    const out = {};
    String(cookieHeader || '').split(';').forEach(p => {
      const i = p.indexOf('=');
      if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
    });
    return out.sid ? accountsRef.sessionNameBySid(out.sid) : null;
  } catch (e) { return null; }
}

// простые лимиты событий на соединение: чат-флуд и спам позицией невозможны
function socketLimiter(perSecond, perTenSec) {
  const st = { sec: 0, secAt: Date.now(), win: 0, winAt: Date.now() };
  return function () {
    const now = Date.now();
    if (now - st.secAt >= 1000) { st.secAt = now; st.sec = 0; }
    if (now - st.winAt >= 10000) { st.winAt = now; st.win = 0; }
    st.sec++; st.win++;
    return st.sec > perSecond || st.win > perTenSec;
  };
}

// Инициализация
io.on('connection', (socket) => {
  gameState.stats.totalPlayers++;

  const account = sessionName(socket.handshake.headers.cookie);  // подтверждённый ник или null
  const limMove = socketLimiter(90, 700);    // движение идёт 30 раз/сек, запас на всплески
  const limChat = socketLimiter(4, 8);       // чат: не чаще 4 в секунду и 8 в 10 сек
  const limCaught = socketLimiter(1, 2);     // «все пойманы» — не чаще раза в раунд
  const limPing = socketLimiter(2, 12);      // замер задержки — раз в пару секунд
  const limHsCatch = socketLimiter(8, 30);   // индивидуальных поимок в комнате в раунде немного, но с запасом
  const limRace = socketLimiter(3, 10);      // старт/финиш забега — не гоночный протокол сам по себе
  let joinedAt = 0;

  /* Замер задержки: клиент присылает свою метку времени, сервер возвращает
     её обратно. Никакой синхронизации часов — считаем разницу по одним и
     тем же локальным часам клиента. */
  socket.on('pingCheck', (t) => {
    if (limPing()) return;
    socket.emit('pongCheck', t);
  });

  socket.on('join', (data) => {
    if (Date.now() - joinedAt < 1500) return;   // без повторных join подряд
    joinedAt = Date.now();
    data = data || {};
    const mode = cleanName(data.gameMode) || 'main';
    const roomName = cleanName(data.room) || 'main';
    // режим входит в ключ комнаты, поэтому режимы не пересекаются
    const room = mode + ':' + roomName;
    let name = cleanName(data.playerName);
    if (account) {
      name = account;                            // сессия сильнее присланного имени

      /* Один аккаунт — один активный игрок. Иначе вторая вкладка или
         другое устройство под тем же логином заходит в игру отдельным
         "клоном": оба сокета создают свой player, и оба видны в комнате
         как два разных персонажа с одним именем. Второй заход, пока
         первый ещё на связи, просто не пускаем — очередь эмитит клиенту
         причину, а сама заявка на join отклоняется целиком. */
      const acctKey = accountsRef.key(account);
      const ownerId = gameState.activeAccounts.get(acctKey);
      if (ownerId && ownerId !== socket.id && io.sockets.sockets.has(ownerId)) {
        socket.emit('joinDenied', { reason: 'duplicateAccount' });
        return;
      }
      gameState.activeAccounts.set(acctKey, socket.id);
    } else if (name && accountsRef.nameIsTaken(name)) {
      name = 'Guest' + Math.floor(100 + Math.random() * 900);   // чужой ник гостю не достанется
    }
    if (!name) name = 'Guest' + Math.floor(100 + Math.random() * 900);

    /* Повторный join на том же сокете (другой режим/комната) иначе
       оставляет сокет висеть в старой комнате навсегда: старый Set
       никогда не пустеет, таймеры hsRooms для неё не гаснут, а игрок
       продолжает получать кадры и получать HS-награды за раунд, из
       которого он фактически ушёл. */
    const prevPlayer = gameState.players.get(socket.id);
    if (prevPlayer && prevPlayer.room) {
      const prevRoom = prevPlayer.room;
      socket.leave(prevRoom);
      const prevSet = gameState.rooms.get(prevRoom);
      if (prevSet) {
        prevSet.delete(socket.id);
        if (prevSet.size === 0) {
          gameState.rooms.delete(prevRoom);
          gameState.stats.totalRooms--;
        }
      }
      io.to(prevRoom).emit('playerLeft', { playerId: socket.id });
      if (prevRoom.indexOf('hideAndSeek:') === 0) hsOnLeave(io, prevRoom, socket.id);
      if (prevRoom.indexOf('race:') === 0) broadcastRaceScores(io, prevRoom);
    }

    const player = {
      id: socket.id,
      nid: (nidSeq = (nidSeq + 1) % 1000000000),
      name: name,
      gameMode: mode,
      room: room,
      position: { x: Math.random() * 800, y: Math.random() * 600 },
      joinedAt: Date.now()
    };

    gameState.players.set(socket.id, player);

    if (!gameState.rooms.has(room)) {
      gameState.rooms.set(room, new Set());
      gameState.stats.totalRooms++;
    }

    gameState.rooms.get(room).add(socket.id);
    socket.join(room);

    const roomPlayers = Array.from(gameState.rooms.get(room))
      .map(id => gameState.players.get(id))
      .filter(p => p);

    /* Новичку нужно полное состояние всех: скин, размер, цвет. В обычных
       кадрах редкие поля не повторяются — они уходят только при
       изменении. Поэтому на вход сбрасываем «что уже отправлено» у всей
       комнаты: ближайший кадр придёт полным.

       Именно из-за этого чужие скины пропадали: тот, кто прислал свой
       скин до твоего прихода, больше его не повторял. */
    roomPlayers.forEach(p => { p.sent = {}; p.dirty = true; });

    io.to(room).emit('playersList', roomPlayers);
    io.to(room).emit('playerJoined', player);
    socket.emit('nameFixed', { name: name });    // игрок показывает себе ровно то, что решил сервер

    /* Прятки: фазы и рулетку задаёт сервер. Первому игроку комнаты —
       сразу новая рулетка (она уйдёт и ему, и всем кто в комнате;
       одному играть можно — см. hsStartLobby), остальные получают
       текущее состояние, чтобы не остаться без роли. */
    if (mode === 'hideAndSeek') {
      let st = hsRooms.get(room);
      if (!st) {
        st = { phase: 'lobby', roundNum: 0, endsAt: 0, timer: null,
               lastSeeker: null, prevSeeker: null,
               seekerId: null, seekerName: '', caughtSent: false };
        hsRooms.set(room, st);
        hsStartLobby(io, room, st);
      } else {
        // искатель мог переподключиться с новым сокетом — возвращаем ему роль
        if (st.phase === 'round' && st.seekerName && st.seekerName === name
            && st.seekerId !== socket.id) {
          st.seekerId = socket.id;
          io.to(room).emit('hsPhase', { phase: 'round',
            msLeft: Math.max(0, st.endsAt - Date.now()),
            seekerId: st.seekerId, seekerName: st.seekerName });
        }
        socket.emit('hsState', { phase: st.phase,
          msLeft: Math.max(0, st.endsAt - Date.now()),
          roundNum: st.roundNum,
          seekerId: st.seekerId, seekerName: st.seekerName });
      }
    }

    // Гонка: новичку и всей комнате — актуальная табличка очков (новый участник входит в неё с нулём)
    if (mode === 'race') broadcastRaceScores(io, room);
  });

  socket.on('movePlayer', (data) => {
    if (limMove()) return;
    const player = gameState.players.get(socket.id);
    if (player && data && data.position) {
      player.seen = Date.now();
      const p = data.position;
      const say = cleanText(p.say, 80);
      const pos = {
        x: Math.max(-99999, Math.min(99999, Number(p.x) || 0)),
        y: Math.max(-99999, Math.min(99999, Number(p.y) || 0)),
        w: Math.max(0, Math.min(999, Number(p.w) || 0)),
        h: Math.max(0, Math.min(999, Number(p.h) || 0)),
        color: cleanText(p.color, 20),
        say: say,
        fin: !!p.fin,
        hid: !!p.hid
      };
      if (p.sk !== undefined) pos.sk = cleanText(p.sk, 120);
      else if (player.position) pos.sk = player.position.sk;   // не прислали — значит не менялся
      player.position = pos;
      /* Ничего не рассылаем прямо здесь. Раньше каждый пакет движения
         уходил каждому в комнате отдельным сообщением: 40 игроков по
         14 пакетов в секунду давали ~22 000 сообщений в секунду на одну
         комнату. Теперь позиция просто помечается изменённой, а комната
         получает один общий кадр 30 раз в секунду (см. снапшоты ниже). */
      player.dirty = true;
    }
  });

  /* saveMap/getMaps удалены в v103: эти сокет-обработчики были мёртвым
     кодом (ни одна страница игры их не вызывает), но позволяли любому
     игроку забить до 400 МБ памяти сервера спамом «карт» по 400 КБ. */

  socket.on('sendChat', (data) => {
    if (limChat()) return;
    const player = gameState.players.get(socket.id);
    if (player && data) {
      const room = player.room;
      const message = {
        playerId: socket.id,
        playerName: player.name,
        text: cleanText(data.text, 200),
        timestamp: Date.now(),
        room: room
      };

      if (!gameState.chatMessages.has(room)) {
        gameState.chatMessages.set(room, []);
      }

      const roomChat = gameState.chatMessages.get(room);
      roomChat.push(message);

      if (roomChat.length > 200) {
        roomChat.shift();
      }

      io.to(room).emit('chatMessage', message);
    }
  });

  socket.on('getChatHistory', () => {
    /* История только СВОЕЙ комнаты: раньше в запросе можно было указать
       любую — и подглядывать чаты, к которым ты не присоединён. */
    const player = gameState.players.get(socket.id);
    const room = player ? player.room : 'main';
    const messages = gameState.chatMessages.get(room) || [];
    socket.emit('chatHistory', messages);
  });

  // прятки: искатель сообщил, что поймал всех — раунд можно заканчивать досрочно
  socket.on('hsCaught', () => {
    if (limCaught()) return;
    const player = gameState.players.get(socket.id);
    if (!player || String(player.room).indexOf('hideAndSeek:') !== 0) return;
    hsOnCaught(player.room, socket.id);
  });

  /* Прятки: искатель поймал конкретного игрока — монету за это начисляем
     только раз на цель за раунд и только если сервер сам видит их рядом
     по своим же последним координатам (см. movePlayer). Клиентский
     hsCatch — заявка, а не факт: подделать «поймал», не подойдя к цели
     или переиграв в уже пойманного, не выйдет. */
  socket.on('hsCatch', (data) => {
    if (limHsCatch()) return;
    const player = gameState.players.get(socket.id);
    if (!player || String(player.room).indexOf('hideAndSeek:') !== 0) return;
    const room = player.room;
    const st = hsRooms.get(room);
    if (!st || st.phase !== 'round' || st.seekerId !== socket.id) return;
    const targetId = String((data && data.targetId) || '');
    if (!targetId || targetId === socket.id) return;
    if (!st.caughtSet) st.caughtSet = new Set();
    if (st.caughtSet.has(targetId)) return;
    const target = gameState.players.get(targetId);
    if (!target || target.room !== room) return;
    const sp = player.position, tp = target.position;
    if (!sp || !tp) return;
    // запас сверх клиентского порога (34x60) — под сетевую задержку между кадрами
    if (Math.abs(sp.x - tp.x) > 80 || Math.abs(sp.y - tp.y) > 120) return;
    st.caughtSet.add(targetId);
    if (!account) return;   // гостю монеты не копим — как и раньше в addCoins
    hsCreditAndNotify(socket, account, 1, 'hsCatch');
  });

  /* Race: старт запоминаем, финиш проверяем на его существование, ту же
     карту и минимальное правдоподобное время — иначе можно было бы слать
     raceFinish без единого движения и получать монеты по кругу. Сумму
     монет (1–5) и очки за скорость решает сервер, а не клиент. */
  const RACE_MIN_MS = 1500;
  // очки за забег: чем быстрее финиш, тем больше — 120 сек и дольше не
  // приносят ничего, секунда почти сразу после старта — почти максимум
  const RACE_SCORE_CAP_S = 120;
  socket.on('raceStart', (data) => {
    if (limRace()) return;
    const player = gameState.players.get(socket.id);
    if (!player || String(player.room).indexOf('race:') !== 0) return;
    const author = cleanText(data && data.author, 40);
    const mapName = cleanText(data && data.mapName, 40);
    if (!author || !mapName) return;
    player.raceStart = { key: author + '|' + mapName, at: Date.now() };
  });
  socket.on('raceFinish', (data) => {
    if (limRace()) return;
    const player = gameState.players.get(socket.id);
    if (!player || String(player.room).indexOf('race:') !== 0) return;
    const rs = player.raceStart;
    player.raceStart = null;   // разово: тот же старт дважды не засчитать
    if (!rs) return;
    const author = cleanText(data && data.author, 40);
    const mapName = cleanText(data && data.mapName, 40);
    if (rs.key !== author + '|' + mapName) return;
    const elapsedMs = Date.now() - rs.at;
    if (elapsedMs < RACE_MIN_MS) return;

    // табличка «Scores» в углу — снимок комнаты, видна и гостям, копится
    // за все забеги подряд, пока игрок в комнате (см. raceScoreboard)
    const points = Math.max(0, Math.round(RACE_SCORE_CAP_S - elapsedMs / 1000));
    player.raceLiveScore = (player.raceLiveScore || 0) + points;
    broadcastRaceScores(io, player.room);

    if (!account) return;
    hsCreditAndNotify(socket, account, 1 + Math.floor(Math.random() * 5), 'raceFinish');
    if (points > 0) accountsRef.creditScore(account, points);
  });

  socket.on('disconnect', () => {
    const player = gameState.players.get(socket.id);
    if (player) {
      const room = player.room;
      gameState.players.delete(socket.id);
      gameState.stats.totalPlayers--;

      // освобождаем слот аккаунта, только если он всё ещё держится этим сокетом
      if (account) {
        const acctKey = accountsRef.key(account);
        if (gameState.activeAccounts.get(acctKey) === socket.id) {
          gameState.activeAccounts.delete(acctKey);
        }
      }

      const roomPlayers = gameState.rooms.get(room);
      if (roomPlayers) {
        roomPlayers.delete(socket.id);

        if (roomPlayers.size === 0) {
          gameState.rooms.delete(room);
          gameState.stats.totalRooms--;
        }
      }

      io.to(room).emit('playerLeft', { playerId: socket.id });
      if (room.indexOf('hideAndSeek:') === 0) hsOnLeave(io, room, socket.id);
      if (room.indexOf('race:') === 0) broadcastRaceScores(io, room);
      console.log(`${player.name} | Осталось: ${gameState.stats.totalPlayers}`);
    }
  });
});

// раздела нет — показываем понятную страницу, а НЕ редирект
// (редирект ломал кнопку "Назад": браузер возвращался и его снова перекидывало)
app.get('*', (req, res) => {
  if (!path.extname(req.path) || req.path.endsWith('.html')) {
    return res.status(404).send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AIBrofist</title><style>body{font-family:sans-serif;display:flex;height:100vh;margin:0;
align-items:center;justify-content:center;flex-direction:column;gap:14px;color:#191919;text-align:center;padding:20px}
a,button{border:1px solid #2196F3;border-radius:4px;padding:11px 22px;background:#fff;color:#000;
text-decoration:none;font-size:16px;cursor:pointer}</style></head><body>
<h2>This section isn't ready yet</h2>
<p style="color:#777;margin:0">There's no such page in the game yet.</p>
<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
<button onclick="history.back()">&larr; Back</button>
<a href="/">Main menu</a></div></body></html>`);
  }
  res.status(404).send('Not found');
});

/* ================== СНАПШОТЫ КОМНАТ ==================
   Комната получает один общий кадр 30 раз в секунду вместо отдельного
   сообщения на каждый пакет каждого игрока. Сообщений стало N вместо
   N², и приходят они ровным темпом — клиенту есть между чем сглаживать.
   30 Гц вместо прежних 20: чем чаще кадры, тем ровнее интерполяция на
   клиенте — чужие игроки движутся так же плавно, как свой (v103).

   В кадр попадают только те, у кого что-то изменилось: стоящие на месте
   не занимают ни байта. Редкие поля (размер, цвет, скин, реплика) едут
   лишь в тот кадр, где они реально поменялись.

   emit помечен volatile: если у кого-то соединение подвисло, старый кадр
   выбрасывается, а не копится в очереди — лучше пропустить один кадр,
   чем потом проигрывать пачку устаревших. */
const SNAP_MS = 33;
const KEY_EVERY = 30;            // раз в секунду — опорный кадр
let snapTick = 0;
setInterval(() => {
  /* Обычный кадр несёт только изменившихся и уходит volatile — его
     не жалко потерять. Но если потерялся последний кадр перед тем, как
     игрок остановился, у остальных он так и застынет на старом месте.
     Поэтому раз в секунду уходит опорный кадр: позиции всех в комнате,
     уже обычной (гарантированной) доставкой. Он же лечит и любую другую
     потерю — «зависших» и «пропавших» игроков больше нет.

     Опорный кадр несёт и редкие поля (скин, размер, цвет, реплика):
     раньше скин уезжал одним volatile-кадром, и на телефоне, где вкладка
     на секунду подвисает, этот кадр терялся навсегда — чужие скины
     пропадали до следующей смены образа. Теперь опорный кадр каждый
     раз полный, так что любая потеря долечивается максимум за секунду. */
  const key = (++snapTick % KEY_EVERY) === 0;
  gameState.rooms.forEach((set, room) => {
    if (!set.size) return;
    const frame = [];
    set.forEach(id => {
      const p = gameState.players.get(id);
      if (!p) return;
      if (!p.dirty && !key) return;
      p.dirty = false;
      const pos = p.position || {};
      /* В опорном кадре «что уже отправлено» сбрасывается: все редкие
         поля едут заново, гарантированной доставкой. */
      if (key) p.sent = {};
      const last = p.sent || (p.sent = {});
      const e = { n: p.nid, x: Math.round(pos.x || 0), y: Math.round(pos.y || 0) };
      if (pos.w !== last.w || pos.h !== last.h) { e.w = pos.w; e.h = pos.h; last.w = pos.w; last.h = pos.h; }
      if (pos.color !== last.color) { e.c = pos.color; last.color = pos.color; }
      if (pos.sk !== last.sk) { e.k = pos.sk || ''; last.sk = pos.sk; }
      if (pos.say !== last.say) { e.s = pos.say || ''; last.say = pos.say; }
      if (!!pos.fin !== !!last.fin) { e.f = pos.fin ? 1 : 0; last.fin = !!pos.fin; }
      if (!!pos.hid !== !!last.hid) { e.d = pos.hid ? 1 : 0; last.hid = !!pos.hid; }
      frame.push(e);
    });
    if (!frame.length) return;
    if (key) io.to(room).emit('state', frame);            // опорный — доставить обязательно
    else io.to(room).volatile.emit('state', frame);       // обычный — можно и потерять
  });
}, SNAP_MS);

// подчистка «призраков»: если вкладку закрыли жёстко, игрок мог зависнуть в комнате
setInterval(() => {
  const now = Date.now();
  gameState.players.forEach((p, id) => {
    const alive = io.sockets.sockets.get(id);
    if (alive && now - (p.seen || p.joinedAt) < 45000) return;
    gameState.players.delete(id);
    gameState.stats.totalPlayers--;
    const rp = gameState.rooms.get(p.room);
    if (rp) {
      rp.delete(id);
      if (!rp.size) { gameState.rooms.delete(p.room); gameState.stats.totalRooms--; }
    }
    io.to(p.room).emit('playerLeft', { playerId: id });
    if (String(p.room).indexOf('hideAndSeek:') === 0) hsOnLeave(io, p.room, id);
    console.log('убран зависший игрок', p.name);
  });
}, 20000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════════════════════════╗
  ║   AIBROFIST MULTIPLAYER SERVER                        ║
  ║   Запущен на http://localhost:${PORT}                   ║
  ║   До 2000+ игроков одновременно                         ║
  ║   Map Editor + Hide and Seek + Race                     ║
  ║   Оптимизирован для экстремальных нагрузок              ║
  ╚════════════════════════════════════════════════════════════╝
  `);
});
