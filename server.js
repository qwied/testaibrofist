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

/* Служебные файлы наружу не отдаём.

   Раньше здесь был СПИСОК ЗАПРЕЩЁННОГО, и он неизбежно отставал от
   репозитория: каждый новый серверный модуль по умолчанию оказывался
   в интернете, пока кто-нибудь не вспомнит дописать его сюда. Так
   наружу утекли story.js, quests.js, dailyRewards.js, messages.js,
   imgModeration.js, mapGen.js и прочие — то есть ровно та логика, по
   которой удобно писать читы: пороги поимки, веса призов, крючки
   квестов.

   Теперь наоборот — СПИСОК РАЗРЕШЁННОГО: наружу уходят только те .js,
   которые действительно грузит браузер. Ошибиться в безопасную сторону
   так нельзя: забыл вписать новый КЛИЕНТСКИЙ скрипт — страница сразу
   не работает и это видно на первой же проверке; добавил новый
   СЕРВЕРНЫЙ модуль — он закрыт сам, без единой правки здесь. */
const PUBLIC_JS = new Set([
  'abuseshow.js', 'account.js', 'adminabuse.js', 'coin.js', 'consent.js',
  'dailyreward.js', 'device.js', 'editorai.js', 'editorhelp.js', 'game.js',
  'gifplayer.js', 'gifuct.bundle.js', 'i18n.js', 'nav.js', 'owner.js',
  'roomlist.js', 'shell.js', 'skinavatar.js', 'skincanvas.js', 'skinrender.js',
  'sound.js', 'theme.js', 'livetext.js'
]);
// owner.js и adminAbuse.js разрешены здесь только затем, чтобы запрос дошёл
// до своих маршрутов выше — там они проверяют права владельца отдельно.

// исходники и конфиги: в вебе им делать нечего ни под каким именем
const PRIVATE_EXT = /\.(md|py|json|lock|ya?ml|sh|bat|ps1|ini|conf|log|db|sqlite3?|pem|key|crt|env)$/;
// /skinparts сюда НЕ ходит — оттуда клиент грузит детали скинов (skinRender.js)
const PRIVATE_PREFIX = ['/data', '/node_modules', '/stats.html'];   // stats.html — только по секретной ссылке
app.use((req, res, next) => {
  /* Проверяем РАСКОДИРОВАННЫЙ путь — тот же, что потом откроет
     express.static. Иначе %2e вместо точки проходил мимо всех проверок
     ниже: /%2egit/config, /server%2ejs, /CLAUDE%2emd отдавались как есть. */
  let p;
  try { p = decodeURIComponent(req.path).toLowerCase(); }
  catch (e) { return res.status(400).send('Bad request'); }
  if (p.indexOf('\\') !== -1 || p.indexOf('\0') !== -1) return res.status(404).send('Not found');

  /* Точки в начале ЛЮБОГО сегмента пути. Без этого express.static отдавал
     весь каталог .git — /.git/index плюс pack-файлы это полный исходник
     сервера со всей историей, включая каждый «приватный» файл из списка
     выше. (Сам express прячет только dot-ФАЙЛ, dot-КАТАЛОГ проходил
     насквозь: /.gitignore давал 404, а /.git/config — 200.) */
  if (p.indexOf('/.') !== -1) return res.status(404).send('Not found');

  if (PRIVATE_EXT.test(p)) return res.status(404).send('Not found');
  for (let i = 0; i < PRIVATE_PREFIX.length; i++)
    if (p.indexOf(PRIVATE_PREFIX[i]) === 0) return res.status(404).send('Not found');

  // .js только из белого списка и только из корня сайта
  if (p.slice(-3) === '.js' && !PUBLIC_JS.has(p.slice(1)))
    return res.status(404).send('Not found');

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
    'Disallow: /game',
    'Sitemap: ' + siteOrigin(req) + '/sitemap.xml',
    ''
  ].join('\n'));
});

app.get('/sitemap.xml', (req, res) => {
  const base = siteOrigin(req);
  const pages = ['/', '/hide-and-seek', '/race', '/mapsBrowser',
                 '/editor', '/leaderboard', '/logs',
                 '/users', '/quests', '/daily', '/clans'];
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send('<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + pages.map(p => '  <url><loc>' + base + p + '</loc></url>').join('\n')
    + '\n</urlset>\n');
});

/* Версия скриптов и стилей, с которой собраны страницы: число после ?v= у shell.js
   в index.html (его поднимают на каждой выкладке, см. CLAUDE.md). Уже открытая
   вкладка или установленное приложение сверяют с ним свою версию и предлагают
   обновиться (shell.js). Читаем один раз при старте: код внутри контейнера не
   меняется, новая версия — это новый контейнер. */
const ASSET_VERSION = (() => {
  try {
    const m = /shell\.js\?v=(\d+)/.exec(require('fs').readFileSync(path.join(__dirname, 'index.html'), 'utf8'));
    return m ? m[1] : '';
  } catch (e) { return ''; }
})();
app.get('/assetVersion', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ v: ASSET_VERSION });
});

// иконки сайта: браузер запрашивает /favicon.ico ещё до загрузки страницы
app.get('/favicon.ico', (req, res) => {
  res.set('Cache-Control', 'public, max-age=604800');
  res.sendFile(path.join(__dirname, 'favicon.ico'));
});

/* Чистые адреса без .html — index.html сюда не входит, у него отдельный
   маршрут на "/" (см. ниже). Старые прямые ссылки на файл (закладки,
   уже проиндексированные поисковиком страницы) не ломаем — 301 уводит
   на короткий адрес, а не отдаёт 404; query-строка (?mode=.../?room=...
   у game.html, ?name=... у users.html и т.п.) просто едет дальше как
   есть, оба маршрута на неё вообще не смотрят. Сам редирект нужен
   раньше express.static (см. ниже) — иначе static успеет отдать файл
   первым, до того как маршрут до него доберётся. */
const PAGE_FILES = ['avatar', 'clans', 'daily', 'editor', 'game', 'hide-and-seek',
  'leaderboard', 'logs', 'mapsBrowser', 'messages', 'quests', 'race', 'servers', 'story', 'users'];
app.get(PAGE_FILES.map(p => '/' + p + '.html'), (req, res) => {
  const qs = req.originalUrl.split('?')[1];
  res.redirect(301, req.path.slice(0, -5) + (qs ? '?' + qs : ''));
});

/* Страницы и скрипты приложения (.html/.js в корне) без явного
   Cache-Control браузер вправе показывать из кэша часами без единого
   обращения к серверу (эвристическое кэширование по Last-Modified) —
   после каждого деплоя часть игроков продолжает видеть старую версию,
   пока не очистят кэш сами. no-cache не запрещает хранить копию —
   только требует сперва спросить сервер, не устарела ли она (дешёвая
   проверка по ETag, без повторной скачки, если файл не менялся). */
app.use((req, res, next) => {
  if (req.path === '/' || /\.(html|js|css)$/i.test(req.path)
      || PAGE_FILES.indexOf(req.path.slice(1)) !== -1) res.set('Cache-Control', 'no-cache');
  next();
});
app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// те же страницы, но уже по чистому адресу (см. редирект с .html выше)
app.get(PAGE_FILES.map(p => '/' + p), (req, res) => {
  res.sendFile(path.join(__dirname, req.path.slice(1) + '.html'));
});

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
    require('./clans.js').reload();
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
// нажатия кнопок из Discord: подпись проверяется по сырому телу запроса
app.post('/discord/interactions', express.raw({ type: '*/*', limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '512kb' }));
app.use(express.json({ limit: '512kb' }));

// система аккаунтов, друзей и профилей
const accounts = require('./accounts.js');
accountsRef = accounts;
accounts.register(app);
require('./maps.js').register(app, accounts.currentUser, accounts, cleanText);
require('./ranks.js').register(app, accounts.currentUser, accounts);
require('./userSkins.js').register(app, accounts);
require('./messages.js').register(app, accounts);
require('./clans.js').register(app, accounts);
require('./themes.js').register(app, accounts);
require('./notifications.js').register(app, accounts);
require('./updateTimer.js').register(app, accounts);
require('./abuse.js').register(app, accounts);
// файлы шоу владельца отдаём как статику: сами по себе они безобидны
app.use('/abusefile', express.static(require('./abuse.js').FILE_DIR,
        { maxAge: '1h', fallthrough: true }));
require('./extras.js').register(app, accounts);
// новые записи updates.json -> лента Logs и канал #updates в Discord
require('./updatesFeed.js').start(require('./extras.js'));
// бот Discord: правила в #rules, автомодерация и команды (только с DISCORD_BOT_TOKEN)
require('./discordBot.js').start();
require('./discordBot.js').register(app);   // /discord/status — состояние бота, без секретов
require('./dailyRewards.js').register(app, accounts);
require('./quests.js').register(app, accounts);
require('./story.js').register(app, accounts);

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
  let best = null, bestCount = -1;
  gameState.rooms.forEach((set, key) => {
    if (key.indexOf(mode + ':') !== 0) return;
    const n = set.size;
    if (n >= ROOM_FULL) return;
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

/* Список комнат режима для ручного выбора (см. hide-and-seek.html/race.html):
   старая обратная связь просила «светофор» — красный (полна), жёлтый
   (кто-то только что вышел — освобождается место), зелёный (свободно).
   Пустые комнаты тут не появляются вовсе: gameState.rooms не хранит
   комнату без единого игрока (см. join()/disconnect ниже) — свежую
   комнату всё так же даёт кнопка «Играть» через /getBestRoom. */
const ROOM_RECENT_LEFT_MS = 30000;
app.get('/getRoomList', (req, res) => {
  const mode = cleanName(req.query.mode) || 'hideAndSeek';
  const now = Date.now();
  const list = [];
  gameState.rooms.forEach((set, key) => {
    if (key.indexOf(mode + ':') !== 0) return;
    const n = set.size;
    const status = n >= ROOM_FULL ? 'red'
                 : (now - (roomLeftAt.get(key) || 0) < ROOM_RECENT_LEFT_MS) ? 'yellow'
                 : 'green';
    // имена — как в /api/online, чтобы видно было, кто сейчас в комнате
    const names = Array.from(set).map(id => gameState.players.get(id)).filter(Boolean).map(p => p.name);
    list.push({ room: key.slice(mode.length + 1), players: n, status, names });
  });
  list.sort((a, b) => b.players - a.players);
  res.json({ rooms: list, limit: ROOM_FULL });
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

/* Снимок комнат для serversInfo.js: открытая сводка (живой текст на
   картах, /servers в Discord) и секретная страница владельца. Пустых
   комнат в gameState.rooms нет — см. /getRoomList выше. */
function serversSnapshot() {
  const now = Date.now(), rooms = [];
  gameState.rooms.forEach((set, key) => {
    const i = key.indexOf(':');
    if (i === -1) return;
    const mode = key.slice(0, i);
    if (PUBLIC_MODES.indexOf(mode) === -1) return;
    const players = Array.from(set).map(id => gameState.players.get(id)).filter(Boolean);
    if (!players.length) return;
    const st = mode === 'hideAndSeek' ? hsRooms.get(key) : null;
    let map = st && st.map ? st.map.mapName + ' by ' + st.map.author : null;
    if (!map && mode === 'race') {
      // в гонке карту знает каждый игрок сам — берём ту, что бежит больше всего народу
      const count = {};
      players.forEach(p => { if (p.raceStart && p.raceStart.key) count[p.raceStart.key] = (count[p.raceStart.key] || 0) + 1; });
      const top = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
      if (top) { const j = top.indexOf('|'); map = top.slice(j + 1) + ' by ' + top.slice(0, j); }
    }
    const live = st && (st.phase === 'lobby' || st.phase === 'round');
    rooms.push({
      mode, room: key.slice(i + 1), players: players.length, limit: ROOM_FULL,
      status: players.length >= ROOM_FULL ? 'full' : now - (roomLeftAt.get(key) || 0) < ROOM_RECENT_LEFT_MS ? 'freeing' : 'open',
      names: players.map(p => p.name), map,
      phase: st ? st.phase : null, endsAt: live ? st.endsAt : null,
      seeker: st && st.phase === 'round' ? st.seekerName || null : null,
      caught: st && st.caughtSet ? st.caughtSet.size : 0, story: !!(st && st.storyMap)
    });
  });
  return { rooms, sockets: gameState.players.size };
}
require('./serversInfo.js').register(app, {
  snapshot: serversSnapshot,
  extra: () => ({ maps: require('./maps.js').allMaps().length,
                  accounts: Object.keys(accounts.getDb().users || {}).length,
                  discord: require('./discordBot.js').statusBrief ? require('./discordBot.js').statusBrief() : null })
});

app.get('/editor/index.html', (req, res) => res.redirect('/editor'));
app.get('/supporters/index.html', (req, res) => res.redirect('/leaderboard'));
app.get('/users/index.html', (req, res) => res.redirect('/users' + (req.originalUrl.split('?')[1] ? '?' + req.originalUrl.split('?')[1] : '')));
app.get('/mapsBrowser/index.html', (req, res) => res.redirect('/mapsBrowser'));
app.get('/editor/tutorial.html', (req, res) => res.redirect('/editor'));

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

// «Ушёл только что» — для жёлтого статуса в /getRoomList. Ключ — тот же,
// что и в gameState.rooms ("mode:room"). Старые записи не чистим: они
// либо перекрываются следующим выходом, либо просто больше не читаются,
// если комната опустела и удалилась из gameState.rooms.
const roomLeftAt = new Map();
const ROOM_FULL = 40;   // совпадает с LIMIT в /getBestRoom — комната считается полной с этого числа
const ALLOWED_GAME_MODES = new Set(['hideAndSeek', 'race']);
const MAX_ACTIVE_ROOMS = 2000;

/* ================== ПРЯТКИ: ФАЗЫ И РУЛЕТКА ИСКАТЕЛЯ ==================
   Комнаты hideAndSeek живут по фазам, которые задаёт сервер: лобби с
   рулеткой (30 сек: пока крутится рулетка и пока прячутся) и раунд охоты
   (2 минуты). Победителя рулетки выбирает сервер один раз — все клиенты
   комнаты показывают одинаковую рулетку и приходят к одному искателю.
   Шансы НЕ равны и меняются каждый раунд: у каждого свой случайный вес,
   недавние искатели получают вес поменьше — вчерашний «счастливчик»
   почти наверняка уступит очередь. */
const HS_LOBBY_MS    = Number(process.env.HS_LOBBY_MS) || 30000;   // рулетка + время спрятаться
const HS_ROUND_MS    = Number(process.env.HS_ROUND_MS) || 120000;  // охота — 2 минуты
const HS_ROULETTE_MS = 6800;    // клиентская анимация укладывается в 10 секунд
/* Сколько пикселей надо реально пройти, чтобы награда за раунд/поимку
   засчиталась. Порог символический — любой играющий человек набирает
   его за секунды, а стоящий на месте скрипт не наберёт никогда. */
const HS_MIN_DIST = 200;
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
  /* Варианты (см. hsPickVariant): в Murder Mystery победитель жребия — убийца, а шериф —
     случайный из остальных; в Cops and Robbers он первый коп, остальных копов тянем тем же
     жребием, по тем же шансам. */
  st.sheriffId = null; st.sheriffName = ''; st.copIds = null;
  if (st.variant === 'murder') {
    const rest = members.filter(m => m.id !== winner.id);
    if (rest.length >= 2) {
      const s = rest[Math.floor(Math.random() * rest.length)];
      st.sheriffId = s.id; st.sheriffName = s.name;
    }
  } else if (st.variant === 'cops') {
    const k = Math.max(1, Math.floor(members.length / 3));
    const cops = [winner.id];
    const pool = members.map((m, i) => ({ id: m.id, c: chances[i] })).filter(x => x.id !== winner.id);
    while (cops.length < k && pool.length) {
      let r = Math.random() * (pool.reduce((a, x) => a + x.c, 0) || 1), j = 0;
      for (; j < pool.length - 1; j++) { r -= pool[j].c; if (r <= 0) break; }
      cops.push(pool[j].id);
      pool.splice(j, 1);
    }
    st.copIds = cops;
  }
  // убийца тайный: ни рулетки с победителем, ни шансов — каждому только его роль (hsSecret)
  const secret = st.variant === 'murder';
  const left = st.endsAt - Date.now();
  if (left < HS_ROULETTE_MS + 2000) {
    st.endsAt = Date.now() + HS_ROULETTE_MS + 2000;
    clearTimeout(st.timer);
    st.timer = setTimeout(() => hsStartRound(io, room, st), st.endsAt - Date.now());
  }
  io.to(room).emit('hsRoulette', {
    // шанс уходит вместе с составом — клиент рисует его в углу и на карточках
    players: secret ? [] : members.map((m, i) => ({ id: m.id, name: m.name,
                                      chance: Math.round(chances[i] * 1000) / 10 })),
    winnerId: secret ? null : st.seekerId,
    variant: st.variant || 'classic',
    cops: st.copIds ? members.filter(m => st.copIds.indexOf(m.id) !== -1) : null,
    duration: HS_ROULETTE_MS,
    msLeft: st.endsAt - Date.now(),
    roundNum: st.roundNum,
    // apoc-раунд крутит ту же рулетку искателя — победитель в нём "пациент
    // ноль", а не обычный искатель (см. runRoulette/runModeRoulette в game.js)
    apoc: !!st.apoc
  });
  if (secret) members.forEach(m => io.to(m.id).emit('hsSecret', { role: hsSecretRole(st, m.id) }));
}
function hsSecretRole(st, id) {
  return id === st.seekerId ? 'murderer' : id === st.sheriffId ? 'sheriff' : 'innocent';
}

/* Раунд закончился — начисляем прячущимся, которых так и не поймали.
   Считаем только тех, кто был в комнате С НАЧАЛА раунда (st.roundMembers,
   снятый в hsStartRound): иначе можно было бы забежать в комнату за
   секунду до конца и получить монеты ни за что. Досрочный конец через
   hsOnCaught сюда тоже заходит, но там пойманы все — наградивших не
   найдётся, и цикл просто ничего не сделает. */
/* Очки Hide and Seek: продержаться раунд хайдером стоит заметно дороже
   одной поимки, но охотник за раунд ловит нескольких — за вечер у обеих
   ролей выходит сопоставимо, и таблица не превращается в рейтинг одних
   только сикеров. Начисляет их сервер, как и очки Race. */
const HS_PTS_SURVIVE = 10;
const HS_PTS_CATCH = 4;

/* Счётчики для автоматических рангов (см. ranks.js): сколько раундов
   сыграно в каждой роли и сколько из них удачно. Это не награда и не
   валюта — чистая статистика навыка, поэтому живёт прямо в аккаунте и
   никаких журналов под себя не заводит. */
function hsStat(name, fn) {
  try {
    const u = accountsRef.getDb().users[accountsRef.key(name)];
    if (!u) return;
    fn(u);
    accountsRef.save();
  } catch (e) { /* статистика рангов не должна ронять раунд */ }
}

/* Лучшее время на КОНКРЕТНОЙ карте — медали за время (см. rankForTime в
   ranks.js), отдельная система поверх hsHide/hsSurv/hsSeek/hsCat выше: та
   считает ранг по ВСЕЙ игре сразу, эта — даёт букву на одну карту, которую
   расставляет сам владелец (см. /owner/setMapRankTiers в maps.js). Для
   хайдера лучше — дольше (hiderMs), для искателя — быстрее (seekerMs);
   обновляем только если новый результат действительно лучше прежнего. */
function hsCreditMapBest(acct, mapKey, role, ms) {
  if (!acct || !mapKey || !(ms >= 0)) return;
  hsStat(acct, (u) => {
    if (!u.hsMapBest || typeof u.hsMapBest !== 'object') u.hsMapBest = {};
    const e = u.hsMapBest[mapKey] || (u.hsMapBest[mapKey] = {});
    if (role === 'hider') { if (!(e.hiderMs >= ms)) e.hiderMs = ms; }
    else { if (!(e.seekerMs <= ms)) e.seekerMs = ms; }
  });
}

function hsAwardRoundEnd(io, room, st) {
  const members = st.roundMembers || [];
  const caught = st.caughtSet || new Set();
  const mapKey = st.map ? (st.map.author + '|' + st.map.mapName) : null;
  members.forEach((m) => {
    if (caught.has(m.id)) return;
    const sock = io.sockets.sockets.get(m.id);
    if (!sock) return;                    // отключился — эту сессию уже не найти
    /* «Дожил до конца раунда» само по себе наградой быть не может: зайти
       в комнату и не трогать клавиатуру две минуты умеет и скрипт, и это
       была самая дешёвая ферма монет в игре — раунд за раундом, без
       единого действия. Платим только тому, кто по серверному одометру
       (см. movePlayer) действительно двигался в этом раунде. */
    const p = gameState.players.get(m.id);
    if (!p || (p.odo || 0) - (m.odo || 0) < HS_MIN_DIST) return;
    const acct = sessionName(sock.handshake.headers.cookie);
    if (!acct) return;                    // гость
    hsCreditAndNotify(sock, acct, 1 + Math.floor(Math.random() * 5), 'hsWin');
    require('./quests.js').track(acct, 'hs_survive_hider');
    // очки режима — отдельно от монет, для своей таблицы лидеров
    accountsRef.creditHsScore(acct, HS_PTS_SURVIVE);
    hsStat(acct, (s) => { s.hsHide = (s.hsHide || 0) + 1; s.hsSurv = (s.hsSurv || 0) + 1; });
    // дожил до конца раунда без поимки — лучший возможный результат хайдером на этой карте
    hsCreditMapBest(acct, mapKey, 'hider', HS_ROUND_MS);
  });
}

/* Story-сессия Hide and Seek: у комнаты есть общий лимит времени на всю
   игру (а не на раунд), выставленный владельцем приглашения в story.html.
   Таймер st.storyTimer стоит отдельно от обычного st.timer (лобби/раунд)
   и по истечении лимита обрывает цикл лобби↔раунд насовсем — комната не
   удаляется (это делает hsOnLeave), просто больше не переключает фазы. */
function hsEndStory(io, room, st) {
  if (st.phase === 'storyEnd') return;
  clearTimeout(st.timer);
  st.phase = 'storyEnd';
  io.to(room).emit('hsPhase', { phase: 'storyEnd' });
}

/* Карту комнаты выбирает сервер и рассылает всем. Раньше каждый клиент
   сам дёргал /getRandomMap, и в одной комнате игроки оказывались на
   РАЗНЫХ картах: чужие координаты приходили верные, но ложились на
   другую геометрию — отсюда и «персонаж парит в воздухе» у одного, хотя
   у себя он стоит на платформе. Story-комнаты сюда не попадают: там
   карта задана приглашением (см. story.js) и не меняется всю сессию. */
function hsPickMap(st) {
  st.mapVoted = false;
  if (st.storyMap) return;                     // карта из приглашения — не трогаем
  // за следующую карту голосовали во время охоты — берём победившую (см. hsOpenVote)
  const won = hsVoteWinner(st);
  st.vote = null;
  if (won && require('./maps.js').find(won.author, won.mapName)) {
    st.map = { author: won.author, mapName: won.mapName };
    st.mapVoted = true;
    return;
  }
  const prev = st.map ? st.map.mapName : '';
  const m = require('./maps.js').randomFor('hideAndSeek', prev);
  st.map = m ? { author: m.author, mapName: m.mapName } : null;
}

/* Голосование за следующую карту: во время охоты комнате предлагается до
   HS_VOTE_OPTIONS карт, каждый может выбрать одну (и передумать), а в
   начале следующего лобби берётся карта с большинством голосов. Ничья —
   жребий среди лидеров; никто не проголосовал — жребий среди предложенных.
   Если карт для выбора меньше двух, голосования нет — карту, как и раньше,
   выбирает сервер. Story-комнаты не голосуют: их карта задана приглашением. */
const HS_VOTE_OPTIONS = 3;
function hsOpenVote(io, room, st) {
  st.vote = null;
  if (st.storyMap) return;
  const cand = require('./maps.js').candidatesFor('hideAndSeek', st.map ? st.map.mapName : '', HS_VOTE_OPTIONS);
  if (cand.length < 2) return;
  st.vote = { options: cand.map(m => ({ author: m.author, mapName: m.mapName })), votes: new Map() };
  io.to(room).emit('hsVote', hsVoteState(st));
}
function hsVoteCounts(st) {
  const counts = st.vote.options.map(() => 0);
  st.vote.votes.forEach((i) => { if (counts[i] !== undefined) counts[i]++; });
  return counts;
}
function hsVoteState(st) {
  return st && st.vote ? { options: st.vote.options, counts: hsVoteCounts(st) } : null;
}
function hsVoteWinner(st) {
  if (!st.vote || !st.vote.options.length) return null;
  const counts = hsVoteCounts(st);
  const best = Math.max.apply(null, counts);
  const top = st.vote.options.filter((o, i) => counts[i] === best);
  return top[Math.floor(Math.random() * top.length)];
}
// одна и та же подпись карты во всех событиях комнаты
function hsMapOf(st) {
  return st && st.map ? { author: st.map.author, mapName: st.map.mapName } : null;
}

/* Карта раунда может быть Zombie Apocalypse — читаем это прямо из её
   JSON (тот же o.apoc, что выставляет редактор, см. window.getEditorMap)
   и ищем метку зомби (type:"zombie", она одна — см. findZombie() в
   редакторе). Без метки apoc-карта всё равно не ломает раунд: просто
   играется как обычная, с человеком-искателем (см. hsStartLobby) —
   включить модификатор без зомби на карте вполне можно, это не ошибка. */
function hsApplyApoc(st) {
  st.apoc = false;
  st.hasPoison = false;
  if (!st.map) return;
  try {
    const rec = require('./maps.js').find(st.map.author, st.map.mapName);
    const data = rec && rec.mapData && JSON.parse(rec.mapData);
    if (!data || !data.apoc) return;
    const list = (data && (Array.isArray(data) ? data : data.objects)) || [];
    // яд на зомби-карте заражает прячущегося (см. hsPoisoned)
    st.hasPoison = list.some(o => o && o.deadly === true);
    let zb = null;
    for (let i = 0; i < list.length; i++) {
      if (list[i] && list[i].type === 'zombie') { zb = list[i]; break; }
    }
    if (!zb) return;
    st.apoc = true;
  } catch (e) { /* карта повреждена/не найдена — без зомби-режима в этом раунде */ }
}

/* Варианты пряток (идеи 2019 года) — «смешанный режим»: на обычной карте, когда в комнате
   трое и больше, рулетка режима сама выбирает вариант раунда.
     classic — искатель ловит, пойманный выбывает;
     zombie  — карта Zombie Apocalypse (см. hsApplyApoc): пойманный сам охотится;
     murder  — Murder Mystery: роли тайные; убийца выбивает касанием, шериф ловит убийцу
               касанием (невиновному его касание ничего не делает), а убийца, сам тронувший
               шерифа, проигрывает;
     cops    — Cops and Robbers: треть комнаты — копы; пойманный грабитель замирает на месте,
               другой грабитель освобождает его касанием; все пойманы разом — копы победили.
   Classic выпадает чаще, один и тот же особый вариант два раунда подряд — нет. HS_VARIANT
   задаёт вариант принудительно (для тестов), если игроков для него хватает. */
const HS_VARIANT_MIN = 3;
function hsPickVariant(st, n) {
  if (st.apoc) return 'zombie';
  if (st.storyMap || n < HS_VARIANT_MIN) return 'classic';
  const forced = process.env.HS_VARIANT;
  if (forced === 'classic' || forced === 'murder' || forced === 'cops') return forced;
  const w = { classic: 2, murder: 1, cops: 1 };
  if (st.variant === 'murder' || st.variant === 'cops') w[st.variant] = 0;
  let r = Math.random() * (w.classic + w.murder + w.cops);
  for (const k of ['classic', 'murder', 'cops']) { r -= w[k]; if (r < 0) return k; }
  return 'classic';
}

/* Итог раунда Murder Mystery и Cops and Robbers — кто победил и кто был убийцей. */
function hsRevealRound(io, room, st) {
  if (st.variant !== 'murder' && st.variant !== 'cops') return;
  const free = (st.roundMembers || []).filter(m => !st.caughtSet.has(m.id) && gameState.players.get(m.id)).length;
  if (st.variant === 'murder') {
    io.to(room).emit('hsReveal', { variant: 'murder', murderer: st.seekerName, sheriff: st.sheriffName,
      winner: st.murderCaught ? 'sheriff' : free ? 'innocents' : 'murderer' });
  } else {
    io.to(room).emit('hsReveal', { variant: 'cops', winner: free ? 'robbers' : 'cops', free });
  }
}

/* Убийцу поймали: его поймал шериф или он сам тронул шерифа. Раунд кончается сразу. */
function hsMurdererCaught(io, room, st) {
  st.murderCaught = true;
  io.to(room).emit('hsOut', { id: st.seekerId, name: st.seekerName, murderer: true, by: st.sheriffName });
  const sSock = st.sheriffId && io.sockets.sockets.get(st.sheriffId);
  const acct = sSock && sessionName(sSock.handshake.headers.cookie);
  if (acct) {
    hsCreditAndNotify(sSock, acct, 1, 'hsCatch');
    accountsRef.creditHsScore(acct, HS_PTS_CATCH);
  }
  hsEndRoundEarly(room, st);
}

function hsStartLobby(io, room, st) {
  if (st.phase === 'storyEnd') return;   // лимит Story уже вышел — новый раунд не начинаем
  if (st.phase === 'round') { hsAwardRoundEnd(io, room, st); hsRevealRound(io, room, st); }
  // Одному тоже можно: hsPick/hsChances сами ставят единственного игрока
  // искателем без жеребьёвки. Ловить в комнате некого — монеты за поимку
  // и за «дожил до конца» не начисляются, roundMembers/caughtSet это уже
  // обеспечивают, так что здесь достаточно просто не блокировать раунд.
  st.phase = 'lobby';
  st.roundNum++;
  st.caughtSent = false;
  st.endsAt = Date.now() + HS_LOBBY_MS;
  /* Отметка одометра на входе в лобби. Прячутся именно в лобби, а сам
     раунд хороший игрок проводит неподвижно в укрытии — если считать
     путь только с начала раунда, награду за «дожил до конца» получал бы
     тот, кто бегает на виду, а не тот, кто спрятался. Поэтому путь
     считаем с начала лобби (см. hsStartRound и hsAwardRoundEnd). */
  st.lobbyOdo = new Map();
  hsMembers(room).forEach((m) => {
    const p = gameState.players.get(m.id);
    st.lobbyOdo.set(m.id, p ? (p.odo || 0) : 0);
  });
  hsPickMap(st);
  hsApplyApoc(st);
  st.variant = hsPickVariant(st, hsMembers(room).length);
  // apoc-раунд выбирает "пациента ноль" той же рулеткой, что и обычного
  // искателя — дальше он охотится и заражает ровно как человек-искатель
  // (см. hsStartRound/hsDoInfect), просто выглядит зомби (см. game.js)
  hsSpin(io, room, st);
  io.to(room).emit('hsPhase', { phase: 'lobby', msLeft: HS_LOBBY_MS, roundNum: st.roundNum, map: hsMapOf(st), apoc: !!st.apoc,
                                voted: !!st.mapVoted, variant: st.variant });
  clearTimeout(st.timer);
  st.timer = setTimeout(() => hsStartRound(io, room, st), st.endsAt - Date.now());
}

function hsStartRound(io, room, st) {
  if (st.phase === 'storyEnd') return;
  st.phase = 'round';
  st.endsAt = Date.now() + HS_ROUND_MS;
  st.roundStartedAt = Date.now();   // для медалей за время — см. hsDoInfect/hsCreditMapBest
  // снимок пряток на момент старта — только они и только если не пойманы, получат награду в конце
  // odo — отметка одометра на старте ЛОББИ, по ней в конце видно, кто вообще играл
  // охотники: искатель/убийца или все копы, кто ещё в комнате
  const hunters = (st.variant === 'cops' && st.copIds ? st.copIds : [st.seekerId]).filter(id => gameState.players.get(id));
  if (!hunters.length && st.seekerId) hunters.push(st.seekerId);
  st.roundMembers = hsMembers(room).filter((m) => hunters.indexOf(m.id) === -1)
    .map((m) => {
      const p = gameState.players.get(m.id);
      const now = p ? (p.odo || 0) : 0;
      // кто был в комнате с начала лобби — считаем ему и путь до укрытия,
      // кто зашёл посреди лобби — только с этого момента
      m.odo = (st.lobbyOdo && st.lobbyOdo.has(m.id)) ? st.lobbyOdo.get(m.id) : now;
      return m;
    });
  st.caughtSet = new Set();
  /* От этой отметки в hsCatch считается, сколько искатель реально
     пробежал за раунд. Без неё хватало одного честного шага за всю
     сессию, чтобы дальше ловить телепортом в каждом следующем раунде.

     seekerOdo — Map, а не число: заражение (см. hsDoInfect) добавляет
     в неё нового искателя со своей отметкой в момент заражения, поэтому
     каждому нужно набрать честный путь заново, а не с чужого старта.
     В apoc-раунде так же — "пациент ноль" ловит той же hsCatch, что и
     обычный искатель (см. hsDoInfect), просто выглядит зомби. */
  const odoOf = (id) => { const p = gameState.players.get(id); return p ? (p.odo || 0) : 0; };
  st.seekerOdo = new Map(hunters.map(id => [id, odoOf(id)]));
  // шериф ловит убийцу по тем же правилам, что искатель, — и путь ему считаем так же
  if (st.sheriffId) st.seekerOdo.set(st.sheriffId, odoOf(st.sheriffId));
  // раунд в роли охотника — для доли поимок в ранге (см. ranks.js)
  hunters.forEach((id) => {
    const sSock = io.sockets.sockets.get(id);
    const sAcct = sSock && sessionName(sSock.handshake.headers.cookie);
    if (sAcct) hsStat(sAcct, (s) => { s.hsSeek = (s.hsSeek || 0) + 1; });
  });
  // заражение: кто сейчас охотится — сначала только те, кого выбрала рулетка
  st.seekerIds = new Set(hunters);
  st.everCaught = new Set();      // Cops and Robbers: награда только за первый арест каждого
  st.murderCaught = false;
  const secret = st.variant === 'murder';
  io.to(room).emit('hsPhase', { phase: 'round', msLeft: HS_ROUND_MS,
    seekerId: secret ? null : st.seekerId, seekerName: secret ? '' : st.seekerName,
    seekerIds: secret ? [] : hunters, variant: st.variant, map: hsMapOf(st), apoc: !!st.apoc });
  hsOpenVote(io, room, st);
  clearTimeout(st.timer);
  st.timer = setTimeout(() => hsStartLobby(io, room, st), HS_ROUND_MS);
}

/* Досрочный конец раунда — общий путь для двух источников: сервер сам
   замечает, что последнего прячущегося только что заразили (см. hsCatch),
   и это основной путь теперь; клиентский hsCaught (искатель сообщил, что
   все пойманы) остался подстраховкой на случай рассинхрона и просто
   не сработает второй раз — caughtSent уже стоит. */
function hsEndRoundEarly(room, st) {
  if (st.caughtSent) return;
  st.caughtSent = true;
  clearTimeout(st.timer);
  st.timer = setTimeout(() => hsStartLobby(io, room, st), 1400);
}

/* Общий хвост поимки — вызывается из hsCatch, для обеих разновидностей
   Hide and Seek. В apoc-раунде пойманный сам заражается и становится
   охотником, продолжая цепь вместе со всеми, кто уже заражён (включая
   "пациента ноль" — см. hsStartRound). В обычных прятках пойманный просто
   выходит из игры — в охоту не вступает, видно по оранжевой подсветке
   ника (см. applyOut/drawTag в game.js), а не по синей полосе искателя. */
function hsDoInfect(io, room, st, targetId, target, how) {
  st.caughtSet.add(targetId);
  // Cops and Robbers: освобождённого можно арестовать снова — статистика только за первый раз
  const first = !(st.everCaught && st.everCaught.has(targetId));
  if (st.everCaught) st.everCaught.add(targetId);
  const mapKey = st.map ? (st.map.author + '|' + st.map.mapName) : null;
  const roundStartedAt = st.roundStartedAt || Date.now();
  /* Пойманному раунд хайдером засчитываем здесь: в hsAwardRoundEnd его
     уже пропускают, и без этого в статистике оставались бы одни удачные
     раунды, а доля выживаний у всех была бы ровно единицей. */
  (function () {
    const tSock = io.sockets.sockets.get(targetId);
    const tAcct = tSock && sessionName(tSock.handshake.headers.cookie);
    if (!tAcct || !first) return;
    hsStat(tAcct, (s) => { s.hsHide = (s.hsHide || 0) + 1; });
    // сколько прожил хайдером на ЭТОЙ карте до поимки — медаль за время (см. ranks.js)
    hsCreditMapBest(tAcct, mapKey, 'hider', Date.now() - roundStartedAt);
  })();
  if (st.apoc) {
    /* Цепное заражение: пойманный сам становится охотником и дальше ловит
       остальных вместе со всеми, кто уже заражён. Отметку одометра снимаем
       прямо сейчас — считаем ему путь с этого момента, а не всю сессию
       (иначе телепорт-ловля была бы доступна ему сразу же). */
    st.seekerIds.add(targetId);
    if (!st.seekerOdo) st.seekerOdo = new Map();
    st.seekerOdo.set(targetId, target.odo || 0);
    io.to(room).emit('hsInfected', { id: targetId, name: target.name, poison: how === 'poison' });
  } else {
    // Обычные прятки: пойманный выходит из игры — в охоту не вступает.
    // Cops and Robbers: не выбывает, а замирает, пока его не освободят (см. hsFree)
    io.to(room).emit('hsOut', { id: targetId, name: target.name, jail: st.variant === 'cops' });
  }
  // прячущихся не осталось — раунд можно заканчивать, не дожидаясь таймера
  const stillHiding = (st.roundMembers || []).some(m => !st.caughtSet.has(m.id));
  if (!stillHiding) {
    /* Зачистка всей карты — медаль за скорость искателю. Только живому
       охотнику, выбранному рулеткой: в apoc-раунде ловит зомби без
       аккаунта (st.seekerId тогда null), а заразившиеся по пути хайдеры
       эту медаль не получают — как и hsSeek выше, она только у того, кто
       охотился с самого начала раунда. */
    if (st.seekerId) {
      const sSock = io.sockets.sockets.get(st.seekerId);
      const sAcct = sSock && sessionName(sSock.handshake.headers.cookie);
      if (sAcct) hsCreditMapBest(sAcct, mapKey, 'seeker', Date.now() - roundStartedAt);
    }
    hsEndRoundEarly(room, st);
  }
}

/* Клиентский отчёт «все пойманы» — подстраховка на случай рассинхрона,
   основной путь — серверный stillHiding в hsDoInfect. Раньше это было
   голым доверием: любой текущий сикер (в том числе тот, кого заразили
   против его желания минуту назад) мог прислать hsCaught без единой
   реальной поимки и обрывать раунд по требованию — хоть каждый раунд
   подряд, caughtSent ведь сбрасывается в каждом новом лобби. Теперь
   сверяем то же самое условие, что и в hsDoInfect: округляем раунд
   досрочно только если caughtSet и правда покрывает всех roundMembers,
   а не потому что сикер так сказал. */
function hsOnCaught(room, socketId) {
  const st = hsRooms.get(room);
  if (!st || st.phase !== 'round' || st.caughtSent) return;
  if (!st.seekerIds || !st.seekerIds.has(socketId)) return;
  const stillHiding = (st.roundMembers || []).some(m => !st.caughtSet.has(m.id));
  if (stillHiding) return;
  hsEndRoundEarly(room, st);
}

/* Ушёл игрок: комната опустела — состояние долой; в лобби ушёл сам
   искатель — крутим рулетку заново на оставшихся (в том числе если
   остался один — тогда искателем станет он же). */
function hsOnLeave(io, room, leftId) {
  const st = hsRooms.get(room);
  if (!st) return;
  if (leftId && st.vote && st.vote.votes.delete(leftId)) io.to(room).emit('hsVoteTally', { counts: hsVoteCounts(st) });
  const set = gameState.rooms.get(room);
  if (!set || set.size === 0) {
    clearTimeout(st.timer);
    clearTimeout(st.storyTimer);
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

/* Потолок одного шага для одометра (см. movePlayer). С запасом: пакет
   движения уходит раз в 33–50 мс, а игрок в одиночной комнате — раз в
   секунду, и за эту секунду он честно успевает пролететь несколько
   сотен пикселей. Всё, что длиннее, — это телепорт или подставленная
   координата: в путь не засчитываем, но и не блокируем. */
const MAX_STEP = 600;

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
  // временная диагностика для выбора датацентра — см. recordGeoHit в extras.js
  require('./extras.js').recordGeoHit(socket.handshake.headers['cf-ipcountry']);

  const account = sessionName(socket.handshake.headers.cookie);  // подтверждённый ник или null
  const limMove = socketLimiter(90, 700);    // движение идёт 30 раз/сек, запас на всплески
  const limChat = socketLimiter(4, 8);       // чат: не чаще 4 в секунду и 8 в 10 сек
  const limCaught = socketLimiter(1, 2);     // «все пойманы» — не чаще раза в раунд
  const limPing = socketLimiter(2, 12);      // замер задержки — раз в пару секунд
  const limHsCatch = socketLimiter(8, 30);   // индивидуальных поимок в комнате в раунде немного, но с запасом
  const limRace = socketLimiter(3, 10);      // старт/финиш забега — не гоночный протокол сам по себе
  const limDraw = socketLimiter(2, 6);       // линии на карте — не спамить кистью
  const limVote = socketLimiter(3, 12);      // голос за следующую карту — можно передумать, но не спамить
  const limPoison = socketLimiter(2, 6);     // касание яда в зомби-раунде — срабатывает раз, дальше уже зомби
  const limFree = socketLimiter(4, 20);      // Cops and Robbers: освободить пойманного грабителя
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
    if (!ALLOWED_GAME_MODES.has(mode)) {
      socket.emit('joinDenied', { reason: 'invalidMode' });
      return;
    }
    // режим входит в ключ комнаты, поэтому режимы не пересекаются
    const room = mode + ':' + roomName;
    const existingRoom = gameState.rooms.get(room);
    const previousPlayer = gameState.players.get(socket.id);
    if (!existingRoom && gameState.rooms.size >= MAX_ACTIVE_ROOMS) {
      socket.emit('joinDenied', { reason: 'serverBusy' });
      return;
    }
    if (existingRoom && existingRoom.size >= ROOM_FULL
        && (!previousPlayer || previousPlayer.room !== room)) {
      socket.emit('joinDenied', { reason: 'roomFull' });
      return;
    }
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
    const prevPlayer = previousPlayer;
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
      roomLeftAt.set(prevRoom, Date.now());
      io.to(prevRoom).emit('playerLeft', { playerId: socket.id });
      if (prevRoom.indexOf('hideAndSeek:') === 0) hsOnLeave(io, prevRoom, socket.id);
      if (prevRoom.indexOf('race:') === 0) broadcastRaceScores(io, prevRoom);
    }

    const clan = account ? require('./clans.js').clanOf(account) : null;
    const player = {
      id: socket.id,
      nid: (nidSeq = (nidSeq + 1) % 1000000000),
      name: name,
      gameMode: mode,
      room: room,
      position: { x: Math.random() * 800, y: Math.random() * 600 },
      joinedAt: Date.now(),
      chatColor: account ? accountsRef.chatColorOf(account) : '',   // купленный цвет реплик, см. accounts.js
      nickColor: account ? accountsRef.nickColorOf(account) : '',   // купленный цвет ника под фигурой
      clanTag: clan ? clan.tag : '',       // тег и цвет клана рядом с ником, см. clans.js
      clanColor: clan ? clan.color : '',
      linesUsed: 0    // «нарисовать линию» — ограниченное число раз за вход, см. drawLine
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
               seekerId: null, seekerName: '', caughtSent: false, storyTimer: null };
        // Story-приглашение: лимит времени на всю сессию, а не на раунд —
        // отдельный таймер, обрывающий цикл лобби/раунд (см. hsEndStory)
        if (roomName.indexOf('story_') === 0) {
          const storyInfo = require('./story.js').getRoom(roomName);
          if (storyInfo && storyInfo.limitMs)
            st.storyTimer = setTimeout(() => hsEndStory(io, room, st), storyInfo.limitMs);
          /* Карта Story задана приглашением на всю сессию: помечаем её,
             чтобы hsPickMap не подменил её случайной на каждом лобби. */
          if (storyInfo && storyInfo.mapName) {
            st.storyMap = true;
            st.map = { author: storyInfo.author, mapName: storyInfo.mapName };
          }
        }
        hsRooms.set(room, st);
        hsStartLobby(io, room, st);
      } else {
        // искатель мог переподключиться с новым сокетом — возвращаем ему роль
        // Murder Mystery: вернувшийся шериф снова шериф — молча, роль тайная
        if (st.phase === 'round' && st.variant === 'murder' && st.sheriffName && st.sheriffName === name
            && st.sheriffId !== socket.id) {
          if (st.seekerOdo) { st.seekerOdo.delete(st.sheriffId); st.seekerOdo.set(socket.id, player.odo || 0); }
          st.sheriffId = socket.id;
        }
        if (st.phase === 'round' && st.seekerName && st.seekerName === name
            && st.seekerId !== socket.id) {
          const oldId = st.seekerId;
          if (st.seekerIds) { st.seekerIds.delete(oldId); st.seekerIds.add(socket.id); }
          if (st.seekerOdo) st.seekerOdo.delete(oldId);
          if (st.copIds) st.copIds = st.copIds.map(id => id === oldId ? socket.id : id);
          st.seekerId = socket.id;
          // новый сокет — новый одометр с нуля, отметку раунда сдвигаем,
          // иначе искатель после переподключения никого не смог бы поймать
          if (st.seekerOdo) st.seekerOdo.set(socket.id, player.odo || 0);
          // убийцу не объявляем — его роль вернёт ему hsState ниже
          if (st.variant !== 'murder') io.to(room).emit('hsPhase', { phase: 'round',
            msLeft: Math.max(0, st.endsAt - Date.now()),
            seekerId: st.seekerId, seekerName: st.seekerName, map: hsMapOf(st), apoc: !!st.apoc,
            seekerIds: Array.from(st.seekerIds || []), variant: st.variant });
        }
        /* Зашёл, пока идёт лобби, — отметку одометра ставим ему прямо
           сейчас: hsStartLobby снял её только с тех, кто уже был в
           комнате, а путь до укрытия он пробежит после этой строки
           (см. hsStartRound и hsAwardRoundEnd). */
        if (st.phase === 'lobby') {
          if (!st.lobbyOdo) st.lobbyOdo = new Map();
          st.lobbyOdo.set(socket.id, player.odo || 0);
        }
        const secret = st.variant === 'murder';
        socket.emit('hsState', { phase: st.phase,
          msLeft: Math.max(0, st.endsAt - Date.now()),
          roundNum: st.roundNum,
          seekerId: secret ? null : st.seekerId, seekerName: secret ? '' : st.seekerName, map: hsMapOf(st),
          // догоняющему нужен весь список охотящихся — не только исходного
          // искателя, но и всех, кого заразили до его входа (см. hsCatch);
          // в лобби Cops and Robbers — уже вытянутые копы
          seekerIds: secret ? [] : st.phase === 'round' ? Array.from(st.seekerIds || []) : (st.copIds || []),
          // кто уже пойман (выбыл, сидит в тюрьме)
          out: st.phase === 'round' && st.caughtSet ? Array.from(st.caughtSet) : [],
          variant: st.variant || 'classic',
          role: secret ? hsSecretRole(st, socket.id) : null,
          apoc: !!st.apoc,
          vote: st.phase === 'round' ? hsVoteState(st) : null });
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

      /* Одометр: сколько игрок реально прошёл по мнению СЕРВЕРА. Награды
         (финиш забега, поимка в прятках) сверяются с ним — иначе скрипт,
         который не двигается вообще, а только шлёт «я финишировал» или
         «я поймал», получает то же, что и играющий человек.

         Один шаг длиннее MAX_STEP в счёт не идёт: так подставленный
         прыжок через полкарты не накручивает одометр, но и не ломает
         телепорты — сам телепорт работает как работал, просто не
         засчитывается как пройденный путь. */
      const prev = player.position;
      if (prev) {
        const d = Math.hypot(pos.x - prev.x, pos.y - prev.y);
        if (d <= MAX_STEP) player.odo = (player.odo || 0) + d;
      }
      player.moves = (player.moves || 0) + 1;
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
        color: player.chatColor || '',
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

  /* Линия на карте — «покажи дорогу»: рисуется мышью/пальцем поверх игры,
     видна всем в комнате (или только одному выбранному игроку — data.target,
     клиент даёт выбрать в селекте рядом с кнопкой) пару секунд и сама
     гаснет (клиент решает, когда убрать — сервер только разносит точки и
     ограничивает количество линий за вход, чтобы не заспамили карту). */
  const MAX_LINES_PER_JOIN = 8;
  const MAX_LINE_POINTS = 300;
  socket.on('drawLine', (data) => {
    if (limDraw()) return;
    const player = gameState.players.get(socket.id);
    if (!player || !data || !Array.isArray(data.points)) return;
    player.linesUsed = (player.linesUsed || 0) + 1;
    if (player.linesUsed > MAX_LINES_PER_JOIN) {
      socket.emit('drawLineQuota', { left: 0 });
      return;
    }
    const pts = data.points.slice(0, MAX_LINE_POINTS)
      .filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .map(p => ({ x: Math.max(-20000, Math.min(20000, p.x)), y: Math.max(-20000, Math.min(20000, p.y)) }));
    if (pts.length < 2) return;
    // приватная линия — только выбранному игроку из той же комнаты, иначе как раньше всей комнате
    let recipient = io.to(player.room);
    if (typeof data.target === 'string' && data.target !== socket.id) {
      const targetPlayer = gameState.players.get(data.target);
      if (targetPlayer && targetPlayer.room === player.room) recipient = io.to(data.target);
      else return;
    }
    recipient.emit('drawLine', { playerId: socket.id, points: pts });
    socket.emit('drawLineQuota', { left: Math.max(0, MAX_LINES_PER_JOIN - player.linesUsed) });
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
  /* Голос за следующую карту (см. hsOpenVote). Только во время охоты и
     только за одну из предложенных карт; повторный голос заменяет прежний. */
  socket.on('hsVote', (data) => {
    if (limVote()) return;
    const player = gameState.players.get(socket.id);
    if (!player || String(player.room).indexOf('hideAndSeek:') !== 0) return;
    const st = hsRooms.get(player.room);
    if (!st || st.phase !== 'round' || !st.vote) return;
    const i = Number(data && data.i);
    if (!Number.isInteger(i) || i < 0 || i >= st.vote.options.length) return;
    st.vote.votes.set(socket.id, i);
    io.to(player.room).emit('hsVoteTally', { counts: hsVoteCounts(st) });
  });

  /* Прячущийся коснулся яда в зомби-раунде — сам становится зомби, как если бы его поймали
     (см. onHazard в game.js). Заражает только себя, поэтому проверки простые: идёт охота,
     раунд зомби, на карте есть яд, игрок ещё прячется. */
  socket.on('hsPoisoned', () => {
    if (limPoison()) return;
    const player = gameState.players.get(socket.id);
    if (!player || String(player.room).indexOf('hideAndSeek:') !== 0) return;
    const st = hsRooms.get(player.room);
    if (!st || st.phase !== 'round' || !st.apoc || !st.hasPoison) return;
    if (st.seekerIds && st.seekerIds.has(socket.id)) return;
    if (st.caughtSet && st.caughtSet.has(socket.id)) return;
    if (!(st.roundMembers || []).some(m => m.id === socket.id)) return;
    hsDoInfect(io, player.room, st, socket.id, player, 'poison');
  });

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
    if (!st || st.phase !== 'round' || !st.seekerIds || st.caughtSent) return;
    if (!st.caughtSet) st.caughtSet = new Set();
    const targetId = String((data && data.targetId) || '');
    if (!targetId || targetId === socket.id) return;
    // Murder Mystery: шериф ловит только убийцу — касание невиновного ему ничего не делает
    const sheriff = st.variant === 'murder' && socket.id === st.sheriffId && !st.caughtSet.has(socket.id);
    if (sheriff) { if (targetId !== st.seekerId) return; }
    else if (!st.seekerIds.has(socket.id) || st.seekerIds.has(targetId)) return;
    if (st.caughtSet.has(targetId)) return;
    const target = gameState.players.get(targetId);
    if (!target || target.room !== room) return;
    const sp = player.position, tp = target.position;
    if (!sp || !tp) return;
    // запас сверх клиентского порога (34x60) — под сетевую задержку между кадрами
    if (Math.abs(sp.x - tp.x) > 80 || Math.abs(sp.y - tp.y) > 120) return;
    /* Близость считается по координатам, которые прислал сам искатель, —
       значит скрипт мог просто подставлять себе координаты жертвы и
       «ловить» всех, не сходя с места. Чтобы дойти до жертвы по-честному,
       надо пройти путь: требуем реально пройденное расстояние за этот
       раунд (сам телепорт в счёт не идёт, см. MAX_STEP в movePlayer).
       Считаем именно за раунд, от отметки этого конкретного искателя:
       у заражённого она снята в момент заражения (см. ниже), поэтому
       общий пробег за всю сессию тут ни при чём. */
    const base = st.seekerOdo ? (st.seekerOdo.get(socket.id) || 0) : 0;
    if ((player.odo || 0) - base < HS_MIN_DIST) return;
    // шериф вооружён: поймал убийцу или убийца сам тронул шерифа — проиграл убийца
    if (st.variant === 'murder' && (sheriff || targetId === st.sheriffId)) { hsMurdererCaught(io, room, st); return; }
    // Cops and Robbers: освобождённого можно арестовать снова, но монеты и очки — только за первый арест
    const first = !(st.everCaught && st.everCaught.has(targetId));
    // гостю монеты не копим — как и раньше в addCoins, но саму механику
    // заражения это не должно затрагивать: гость-искатель ловит ничуть не
    // хуже, просто без награды (раньше return тут обрывал ВЕСЬ catch —
    // заражение и досрочный конец раунда для гостей-искателей не работали)
    if (account && first) {
      hsCreditAndNotify(socket, account, 1, 'hsCatch');
      require('./quests.js').track(account, 'hs_catch');
      accountsRef.creditHsScore(account, HS_PTS_CATCH);
      hsStat(account, (s) => { s.hsCat = (s.hsCat || 0) + 1; });
    }
    hsDoInfect(io, room, st, targetId, target);
  });

  /* Cops and Robbers: свободный грабитель касанием освобождает пойманного (см. hsDoInfect —
     пойманный замирает на месте). Проверки как у поимки: идёт охота этого варианта, сам он
     грабитель с начала раунда и на свободе, цель поймана и стоит рядом по серверным координатам. */
  socket.on('hsFree', (data) => {
    if (limFree()) return;
    const player = gameState.players.get(socket.id);
    if (!player || String(player.room).indexOf('hideAndSeek:') !== 0) return;
    const room = player.room;
    const st = hsRooms.get(room);
    if (!st || st.phase !== 'round' || st.variant !== 'cops' || st.caughtSent || !st.caughtSet) return;
    if (st.seekerIds.has(socket.id) || st.caughtSet.has(socket.id)) return;
    if (!(st.roundMembers || []).some(m => m.id === socket.id)) return;
    const targetId = String((data && data.targetId) || '');
    if (!st.caughtSet.has(targetId)) return;
    const target = gameState.players.get(targetId);
    if (!target || target.room !== room) return;
    const sp = player.position, tp = target.position;
    if (!sp || !tp || Math.abs(sp.x - tp.x) > 80 || Math.abs(sp.y - tp.y) > 120) return;
    st.caughtSet.delete(targetId);
    io.to(room).emit('hsFreed', { id: targetId, name: target.name, by: player.name });
  });


  /* Race: старт запоминаем, финиш проверяем на его существование, ту же
     карту и минимальное правдоподобное время — иначе можно было бы слать
     raceFinish без единого движения и получать монеты по кругу. Сумму
     монет (1–5) и очки за скорость решает сервер, а не клиент. */
  const RACE_MIN_MS = 1500;
  /* Одного лишь времени мало: пары «raceStart, через 1.5 сек raceFinish»
     хватало, чтобы качать монеты и очки, ни разу не сдвинувшись с места —
     сервер не смотрел, играл ли отправитель вообще. Теперь между стартом
     и финишем он должен и прислать движение, и реально проехать путь по
     серверному одометру (см. movePlayer). Пороги заведомо ниже любого
     настоящего забега: за 1.5 секунды честный игрок шлёт 30–45 пакетов и
     проходит сотни пикселей. */
  const RACE_MIN_MOVES = 8;
  const RACE_MIN_DIST = 200;
  // очки за забег: чем быстрее финиш, тем больше — 120 сек и дольше не
  // приносят ничего, секунда почти сразу после старта — почти максимум
  const RACE_SCORE_CAP_S = 120;

  /* Статистика гонки для автоматических рангов (см. ranks.js). Храним
     ЛУЧШЕЕ время игрока на каждой карте, а не среднее: ранг должен мерить,
     на что человек способен, а не сколько раз он бросил забег на середине.
     Из этого же поля берётся и охват — сколько разных карт он вообще
     прошёл. Рекорд карты нигде отдельно не лежит: при расчёте ранга он
     находится перебором тех же лучших времён у всех игроков, поэтому
     всегда честный и не требует своего файла. */
  /* Физический предел карты. Клиент считает физику сам, поэтому «я
     финишировал» подделывается всегда — но быстрее, чем по ПРЯМОЙ от
     старта до финиша на предельной скорости движка, карту не пройти
     никак. Эту прямую берём из самой карты; стены она не учитывает,
     поэтому оценка заведомо ниже любого честного забега и ложных
     срабатываний не даёт. Всё, что быстрее, — не забег, и ни монет, ни
     очков, ни строчки в статистике за него нет.
     Карту, которой нет в общем списке (story, черновик), не ограничиваем:
     сверяться не с чем. */
  const RACE_TOP_PX_PER_MS = 2.5;   // 2500 px/с — выше рикошетного потолка движка с запасом
  const RACE_SLACK_PX = 150;        // спавн и финиш — объекты со своими размерами, даём им запас
  const raceGateCache = new Map();
  function raceGate(author, mapName) {
    const k = author + '|' + mapName;
    const hit = raceGateCache.get(k);
    if (hit) return hit;
    let gate = { ms: 0, dist: 0 };
    try {
      const rec = require('./maps.js').find(author, mapName);
      const data = rec && rec.mapData && JSON.parse(rec.mapData);
      const list = (data && (Array.isArray(data) ? data : data.objects)) || [];
      let sp = null, fin = null;
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (!o || typeof o.type !== 'string') continue;
        if (!sp && o.type === 'spawn') sp = o;
        if (!fin && o.type === 'finishline') fin = o;
      }
      if (sp && fin) {
        const d = Math.hypot((fin.x || 0) - (sp.x || 0), (fin.y || 0) - (sp.y || 0));
        gate = { ms: d / RACE_TOP_PX_PER_MS, dist: Math.max(0, d - RACE_SLACK_PX) };
      }
    } catch (e) { gate = { ms: 0, dist: 0 }; }
    if (raceGateCache.size > 500) raceGateCache.clear();
    raceGateCache.set(k, gate);
    return gate;
  }

  const RACE_BEST_CAP = 300;    // столько карт на аккаунт хватает с запасом
  /* Число начатых забегов нужно ровно для одного: отличить новичка, про
     которого ещё нечего сказать, от игрока, который карту за картой берёт
     и ни одну не доводит до финиша. Первому ранга просто нет, второй —
     Declassified из описания рангов. Без этого счётчика эти два случая
     выглядят одинаково. */
  function raceTryStat(name) {
    try {
      const u = accountsRef.getDb().users[accountsRef.key(name)];
      if (!u) return;
      u.rcTry = (u.rcTry || 0) + 1;
      accountsRef.save();
    } catch (e) { /* статистика рангов не должна ронять забег */ }
  }
  function raceStat(name, mapKey, ms) {
    try {
      const u = accountsRef.getDb().users[accountsRef.key(name)];
      if (!u || !(ms > 0)) return;
      u.rcFin = (u.rcFin || 0) + 1;
      if (!u.rcBest || typeof u.rcBest !== 'object') u.rcBest = {};
      const had = Object.prototype.hasOwnProperty.call(u.rcBest, mapKey);
      if (!had && Object.keys(u.rcBest).length >= RACE_BEST_CAP) return;
      if (!had || ms < u.rcBest[mapKey]) u.rcBest[mapKey] = ms;
      accountsRef.save();
    } catch (e) { /* статистика рангов не должна ронять забег */ }
  }

  socket.on('raceStart', (data) => {
    if (limRace()) return;
    const player = gameState.players.get(socket.id);
    if (!player || String(player.room).indexOf('race:') !== 0) return;
    const author = cleanText(data && data.author, 40);
    const mapName = cleanText(data && data.mapName, 40);
    if (!author || !mapName) return;
    const map = require('./maps.js').find(author, mapName);
    if (!map || map.mapType !== 'race') return;
    // снимок одометра на старте — на финише сверяем, сколько набежало
    player.raceStart = { key: author + '|' + mapName, at: Date.now(),
                         odo: player.odo || 0, moves: player.moves || 0 };
    if (account) raceTryStat(account);
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
    const map = require('./maps.js').find(author, mapName);
    if (!map || map.mapType !== 'race') return;
    const elapsedMs = Date.now() - rs.at;
    if (elapsedMs < RACE_MIN_MS) return;
    // забег без единого движения — не забег
    if ((player.moves || 0) - rs.moves < RACE_MIN_MOVES) return;
    if ((player.odo || 0) - rs.odo < RACE_MIN_DIST) return;
    /* Два точных предела, которые даёт сама карта: до финиша нельзя
       добраться ни быстрее прямой на предельной скорости движка, ни
       пройдя меньше её длины. Оба заведомо мягче любого честного
       забега (прямая не огибает стены), но отсекают «финиш» скрипта,
       который только что прислал старт. */
    const gate = raceGate(author, mapName);
    if (elapsedMs < gate.ms) return;
    if ((player.odo || 0) - rs.odo < gate.dist) return;

    // табличка «Scores» в углу — снимок комнаты, видна и гостям, копится
    // за все забеги подряд, пока игрок в комнате (см. raceScoreboard)
    const points = Math.max(0, Math.round(RACE_SCORE_CAP_S - elapsedMs / 1000));
    player.raceLiveScore = (player.raceLiveScore || 0) + points;
    broadcastRaceScores(io, player.room);

    if (!account) return;
    hsCreditAndNotify(socket, account, 1 + Math.floor(Math.random() * 5), 'raceFinish');
    require('./quests.js').track(account, 'race_finish');
    if (points > 0) accountsRef.creditScore(account, points);
    raceStat(account, rs.key, elapsedMs);
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

      roomLeftAt.set(room, Date.now());
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
a,button{border:1px solid #111827;border-radius:4px;padding:11px 22px;background:#fff;color:#000;
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
    roomLeftAt.set(p.room, Date.now());
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
