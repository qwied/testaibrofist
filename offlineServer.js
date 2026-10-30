/* AIBrofist local runtime, часть 3: настоящие серверные модули — в браузере.
   В песочнице (offline.js, GitHub Pages) сервера нет, и раньше всё, что отвечает сервер, было
   переписано вручную и не целиком: смена ника, цвета, темы, друзья, папки карт, логи и т.д.
   просто не работали. Здесь те же файлы, что на сервере (accounts.js, maps.js, extras.js…),
   запускаются прямо на странице: файлы data/*.json живут в localStorage (поддельный fs),
   маршруты app.get/app.post отвечают на fetch страницы (поддельный express). Игрок песочницы —
   обычный аккаунт «Local Tester» с сессией, как после входа на настоящем сайте.
   Тут же панель песочницы: монеты, очки, боты в комнатах, права владельца, сброс. */
(function () {
  'use strict';
  if (window.BFOfflineServer || !window.BFOffline || !BFOffline.raw) return;
  var raw = BFOffline.raw;
  var LS = 'aibrofist.local.v2.';
  var ROOT = '/srv';
  var ME = 'Local Tester';

  function lsGet(k) { try { return localStorage.getItem(LS + k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(LS + k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(LS + k); } catch (e) {} }
  function sandbox() { try { return JSON.parse(lsGet('sandbox') || '{}') || {}; } catch (e) { return {}; } }
  function setSandbox(o) { lsSet('sandbox', JSON.stringify(o)); }

  /* ---------- Buffer: только то, что зовут модули (hex/base64/utf8) ---------- */
  function Buf(bytes) { var b = new Uint8Array(bytes); b.toString = bufToString; return b; }
  function bufToString(enc) {
    var s = '', i;
    if (enc === 'hex') { for (i = 0; i < this.length; i++) s += (this[i] < 16 ? '0' : '') + this[i].toString(16); return s; }
    for (i = 0; i < this.length; i++) s += String.fromCharCode(this[i]);
    if (enc === 'base64') return btoa(s);
    try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
  }
  var Buffer = {
    from: function (v, enc) {
      var s = String(v), out = [], i;
      if (v && v.length !== undefined && typeof v !== 'string') return Buf(v);
      if (enc === 'hex') { for (i = 0; i + 1 < s.length; i += 2) out.push(parseInt(s.substr(i, 2), 16)); return Buf(out); }
      if (enc === 'base64') { var b = atob(s); for (i = 0; i < b.length; i++) out.push(b.charCodeAt(i)); return Buf(out); }
      var u = unescape(encodeURIComponent(s)); for (i = 0; i < u.length; i++) out.push(u.charCodeAt(i));
      return Buf(out);
    },
    isBuffer: function (b) { return b instanceof Uint8Array; },
    byteLength: function (s) { return Buffer.from(s).length; }
  };

  /* ---------- fs: файлы — ключи localStorage «vfs:<путь>» ---------- */
  function enoent(p) { var e = new Error('ENOENT: no such file ' + p); e.code = 'ENOENT'; return e; }
  function vfsKeys(prefix) {
    var out = [];
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf(LS + 'vfs:' + prefix) === 0) out.push(k.slice((LS + 'vfs:').length)); } } catch (e) {}
    return out;
  }
  var fs = {
    existsSync: function (p) { return lsGet('vfs:' + p) !== null || vfsKeys(p + '/').length > 0 || /\/(data|builtinMaps|logimg|abusefile)$/.test(p); },
    mkdirSync: function () {},
    readFileSync: function (p, enc) {
      var v = lsGet('vfs:' + p);
      if (v === null) throw enoent(p);
      if (v.indexOf('b64:') === 0) { var b = Buffer.from(v.slice(4), 'base64'); return enc ? b.toString(enc) : b; }
      return enc ? v : Buffer.from(v);
    },
    writeFileSync: function (p, data) {
      lsSet('vfs:' + p, data instanceof Uint8Array ? 'b64:' + bufToString.call(data, 'base64') : String(data));
    },
    renameSync: function (a, b) { var v = lsGet('vfs:' + a); if (v === null) throw enoent(a); lsSet('vfs:' + b, v); lsDel('vfs:' + a); },
    unlinkSync: function (p) { lsDel('vfs:' + p); },
    readdirSync: function (d) {
      var seen = {};
      vfsKeys(d + '/').forEach(function (k) { seen[k.slice(d.length + 1).split('/')[0]] = 1; });
      return Object.keys(seen);
    },
    statSync: function (p) { return { mtimeMs: Date.now(), size: (lsGet('vfs:' + p) || '').length, isDirectory: function () { return false; }, isFile: function () { return true; } }; }
  };
  var pathMod = {
    sep: '/',
    join: function () {
      var parts = [].slice.call(arguments).join('/').split('/'), out = [];
      parts.forEach(function (s, i) { if (s === '..') out.pop(); else if (s && s !== '.') out.push(s); else if (i === 0 && s === '') out.push(''); });
      var r = out.join('/'); return r.charAt(0) === '/' ? r : (r ? r : '.');
    },
    dirname: function (p) { return String(p).replace(/\/[^/]*$/, '') || '/'; },
    basename: function (p, ext) { var b = String(p).split('/').pop(); return ext && b.slice(-ext.length) === ext ? b.slice(0, -ext.length) : b; },
    extname: function (p) { var m = /\.[^./]*$/.exec(String(p)); return m ? m[0] : ''; },
    resolve: function () { return pathMod.join.apply(null, arguments); }
  };
  function rnd(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return Buf(a); }
  // пароли в песочнице не нужны всерьёз: стойкий scrypt заменён простой свёрткой той же длины
  function fakeScrypt(pw, salt, len) {
    var s = String(pw) + '|' + String(salt), out = [], h = 2166136261;
    for (var i = 0; i < (len || 32); i++) { for (var j = 0; j < s.length; j++) h = Math.imul(h ^ s.charCodeAt(j) ^ i, 16777619); out.push(h & 255); }
    return Buf(out);
  }
  var cryptoMod = {
    randomBytes: rnd,
    scryptSync: fakeScrypt,
    timingSafeEqual: function (a, b) { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; },
    createHash: function () { var s = ''; var h = { update: function (v) { s += String(v); return h; }, digest: function (enc) { return fakeScrypt(s, 'h', 32).toString(enc || 'hex'); } }; return h; },
    randomUUID: function () { return rnd(16).toString('hex'); }
  };
  var osMod = { loadavg: function () { return [0, 0, 0]; }, cpus: function () { return [{}]; }, totalmem: function () { return 1e9; }, freemem: function () { return 5e8; }, uptime: function () { return 1; } };

  /* ---------- таймеры модулей: .unref() как в node, и отложенные сохранения не теряются при уходе ---------- */
  var pending = {};
  function tm(id) { return { _id: id, unref: function () { return this; }, ref: function () { return this; }, hasRef: function () { return false; } }; }
  function mSetTimeout(fn, ms) {
    var args = [].slice.call(arguments, 2), id = setTimeout(function () { delete pending[id]; fn.apply(null, args); }, ms);
    pending[id] = function () { fn.apply(null, args); };
    return tm(id);
  }
  function mClearTimeout(t) { var id = t && t._id !== undefined ? t._id : t; clearTimeout(id); delete pending[id]; }
  function mSetInterval(fn, ms) { return tm(setInterval(fn, ms)); }
  function mClearInterval(t) { clearInterval(t && t._id !== undefined ? t._id : t); }
  function flush() { Object.keys(pending).forEach(function (id) { var f = pending[id]; delete pending[id]; clearTimeout(+id); try { f(); } catch (e) {} }); }
  addEventListener('pagehide', flush);
  addEventListener('beforeunload', flush);

  /* ---------- express: маршруты по методу и пути (с :параметрами) ---------- */
  var routes = [];
  function addRoute(method) {
    return function (p) {
      var fns = [].slice.call(arguments, 1);
      if (typeof p !== 'string') return;
      var names = [], re = new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/:(\w+)/g, function (_, n) { names.push(n); return '([^/]+)'; }) + '$');
      routes.push({ method: method, re: re, names: names, fns: fns.filter(function (f) { return typeof f === 'function'; }) });
    };
  }
  var app = { get: addRoute('GET'), post: addRoute('POST'), all: addRoute('ALL'), put: addRoute('PUT'), delete: addRoute('DELETE'),
    use: function () {}, set: function () {}, locals: {} };

  function sid() { return lsGet('sid') || ''; }
  function handle(path, sp, method, data) {
    for (var i = 0; i < routes.length; i++) {
      var r = routes[i], m = (r.method === method || r.method === 'ALL') && r.re.exec(path);
      if (m) return run(r, m, path, sp, method, data);
    }
    return null;
  }
  function run(r, m, path, sp, method, data) {
    return new Promise(function (resolve) {
      var params = {}; r.names.forEach(function (n, i) { params[n] = decodeURIComponent(m[i + 1]); });
      var query = {}; sp.forEach(function (v, k) { query[k] = v; });
      var headers = { cookie: sid() ? 'sid=' + sid() : '', host: location.host, 'user-agent': navigator.userAgent };
      var req = { method: method, path: path, url: path + (sp.toString() ? '?' + sp : ''), originalUrl: path, query: query, body: data || {}, params: params,
        headers: headers, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' }, connection: { remoteAddress: '127.0.0.1' },
        get: function (h) { return headers[String(h).toLowerCase()]; } };
      var hdr = {}, status = 200, done = false;
      function finish(body, type) {
        if (done) return; done = true;
        var c = hdr['set-cookie']; (Array.isArray(c) ? c : c ? [c] : []).forEach(function (s) {
          var mm = /^sid=([^;]*)/.exec(s); if (!mm) return;
          if (!mm[1] || /Max-Age=0/i.test(s)) lsDel('sid'); else lsSet('sid', mm[1]);
        });
        // картинки Logs лежат в «файлах» localStorage — статики /logimg/ на хостинге нет, отдаём их прямо в ответе
        if (typeof body === 'string' && body.indexOf('/logimg/') !== -1) body = body.replace(/\/logimg\/([A-Za-z0-9._-]+)/g, function (all, f) {
          var v = lsGet('vfs:' + ROOT + '/data/logimg/' + f); if (v === null) return all;
          var ext = (/\.(\w+)$/.exec(f) || [0, 'png'])[1].toLowerCase(), mime = ext === 'jpg' ? 'image/jpeg' : 'image/' + ext;
          return 'data:' + mime + ';base64,' + (v.indexOf('b64:') === 0 ? v.slice(4) : btoa(v));
        });
        resolve(new Response(body, { status: status, headers: { 'Content-Type': type || 'application/json' } }));
      }
      var res = { req: req, locals: {},
        status: function (c) { status = c; return res; }, sendStatus: function (c) { status = c; finish(''); return res; },
        set: function (k, v) { if (typeof k === 'object') Object.keys(k).forEach(function (x) { hdr[x.toLowerCase()] = k[x]; }); else hdr[String(k).toLowerCase()] = v; return res; },
        setHeader: function (k, v) { hdr[String(k).toLowerCase()] = v; return res; }, header: function (k, v) { return res.set(k, v); },
        getHeader: function (k) { return hdr[String(k).toLowerCase()]; }, type: function () { return res; }, cookie: function () { return res; },
        json: function (d) { finish(JSON.stringify(d === undefined ? null : d)); return res; },
        send: function (d) { if (d && typeof d === 'object') return res.json(d); finish(String(d == null ? '' : d), 'text/plain'); return res; },
        end: function (d) { finish(d == null ? '' : String(d), 'text/plain'); return res; },
        redirect: function (a, b) { var to = b || a; finish(JSON.stringify({ status: 'redirect', url: to })); return res; },
        sendFile: function () { status = 404; finish('Not found', 'text/plain'); return res; } };
      var k = 0;
      function next(err) {
        if (err) { status = 500; return finish(JSON.stringify({ status: 'error', message: String(err.message || err) })); }
        var f = r.fns[k++]; if (!f) return finish(JSON.stringify({ status: 'error', message: 'Not found' }));
        try { f(req, res, next); } catch (e) { console.error('[offline server]', path, e); next(e); }
      }
      next();
    });
  }

  /* ---------- модули сервера: исходники грузим разом, require — синхронно из кэша ---------- */
  var FILES = ['accounts', 'maps', 'ranks', 'quests', 'themes', 'extras', 'messages', 'notifications', 'clans',
               'userSkins', 'skins', 'dailyRewards', 'serversInfo', 'fsAtomic'];
  var BUILTIN = ['serversinfo', 'piratebay', 'spybase', 'brotower', 'crystaldefense', 'broarena'];
  var src = {}, cache = {};
  function env() {
    var sb = sandbox();
    return { OWNER_NAME: 'System', OWNER_ALIASES: 'System,AIBrofist' + (sb.owner ? ',' + ME : ''), NODE_ENV: 'sandbox', PASSWORD_AUTH: '1' };
  }
  var proc = { env: env(), cwd: function () { return ROOT; }, on: function () {}, nextTick: function (f) { Promise.resolve().then(f); }, platform: 'browser', memoryUsage: function () { return { rss: 0, heapUsed: 0 }; }, uptime: function () { return 1; } };
  var STUB = {
    './discordAuth.js': { exchangeCode: function () { return Promise.reject(new Error('Discord is not available in the sandbox')); }, fetchProfile: function () { return Promise.reject(new Error('Discord is not available in the sandbox')); } },
    './discordApi.js': { api: function () { return Promise.reject(new Error('offline')); } },
    './discordBot.js': {}
  };
  function req(name) {
    if (name === 'fs') return fs; if (name === 'path') return pathMod; if (name === 'crypto') return cryptoMod; if (name === 'os') return osMod;
    if (STUB[name]) return STUB[name];
    var n = String(name).replace(/^\.\//, '').replace(/\.js$/, '');
    if (cache[n]) return cache[n].exports;
    if (!src[n]) throw new Error('offline server: no module ' + name);
    var m = { exports: {} }; cache[n] = m;
    new Function('module', 'exports', 'require', 'process', '__dirname', '__filename', 'Buffer', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'global',   // eslint-disable-line no-new-func
      src[n] + '\n//# sourceURL=offline-server/' + n + '.js')(m, m.exports, req, proc, ROOT, ROOT + '/' + n + '.js', Buffer, mSetTimeout, mClearTimeout, mSetInterval, mClearInterval, function (f) { return mSetTimeout(f, 0); }, window);
    return m.exports;
  }
  function fetchText(f) { return raw(f, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(f + ' ' + r.status); return r.text(); }); }

  var acc = null;
  /* первая загрузка: игрок песочницы (монеты и очки из прежней песочницы), пара соседей для друзей
     и поиска, карты прежней песочницы — в каталог настоящего maps.js */
  function seed() {
    var usersFile = ROOT + '/data/users.json';
    var legacy = BFOffline.legacyUser ? BFOffline.legacyUser() : {};
    if (lsGet('vfs:' + usersFile) === null) {
      var t = Date.now(), users = {}, s = rnd(32).toString('hex');
      var mk = function (name, o) { users[name.toLowerCase()] = Object.assign({ name: name, joined: t - 864e5 * 30, coins: 0, score: 0, hsScore: 0, friends: [], incoming: [], outgoing: [], avatar: '0', about: '' }, o || {}); };
      mk(ME, { joined: t, coins: Number(legacy.coins) || 0, score: Number(legacy.score) || 0, hsScore: Number(legacy.hsScore) || 0, about: legacy.bio || '' });
      mk('Local Bot', { coins: 340, score: 120, hsScore: 60, about: 'A sample player of the sandbox.' });
      mk('Test Pilot', { coins: 90, score: 45, about: 'Another sample player.' });
      mk('Sample Boss', { coins: 800, score: 80, hsScore: 200 });
      var sessions = {}; sessions[s] = { name: ME, created: t, seen: t };
      fs.writeFileSync(usersFile, JSON.stringify({ users: users, sessions: sessions }));
      lsSet('sid', s);
    }
    var mapsFile = ROOT + '/data/maps.json';
    if (lsGet('vfs:' + mapsFile) === null) {
      var old = (BFOffline.legacyMaps ? BFOffline.legacyMaps() : []).map(function (m) {
        return { mapName: m.mapName, author: m.author === 'Local Test' ? ME : m.author, mapType: m.mapType, date: m.date || Date.now(), created: m.date || Date.now(),
          mapData: typeof m.mapData === 'string' ? m.mapData : JSON.stringify(m.mapData), rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: [] };
      });
      fs.writeFileSync(mapsFile, JSON.stringify(old));
    }
  }

  function boot() {
    seed();
    acc = req('accounts');
    var cleanText = function (v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f​-‏‪-‮]/g, '').slice(0, max); };
    acc.register(app);
    req('maps').register(app, acc.currentUser, acc, cleanText);
    req('ranks').register(app, acc.currentUser, acc);
    req('userSkins').register(app, acc);
    req('messages').register(app, acc);
    req('clans').register(app, acc);
    req('themes').register(app, acc);
    req('notifications').register(app, acc);
    req('extras').register(app, acc);
    req('dailyRewards').register(app, acc);
    req('quests').register(app, acc);
    req('serversInfo').register(app, { snapshot: snapshot, extra: function () { return { maps: req('maps').allMaps().length, accounts: Object.keys(acc.getDb().users).length, discord: null }; } });
    // сессия потерялась (вышел из аккаунта и т.п.) — песочница всегда играет за своего игрока
    if (!acc.currentUser({ headers: { cookie: 'sid=' + sid() } })) login();
  }
  // входим под последним ником игрока песочницы (после смены ника — под новым), иначе — Local Tester
  function login() {
    var db = acc.getDb(), s = rnd(32).toString('hex'), t = Date.now(), last = lsGet('meName');
    var name = last && db.users[last.toLowerCase()] ? db.users[last.toLowerCase()].name : ME;
    if (!db.users[name.toLowerCase()]) db.users[name.toLowerCase()] = { name: name, joined: t, coins: 0, score: 0, hsScore: 0, friends: [], incoming: [], outgoing: [], avatar: '0' };
    db.sessions[s] = { name: name, created: t, seen: t };
    lsSet('sid', s); acc.save(); flush();
  }
  // Servers и Discord: в песочнице одна комната — та, где сейчас идёт игра на этой странице
  function snapshot() {
    var r = window.BFOffline && BFOffline.liveRoom && BFOffline.liveRoom();
    return { rooms: r ? [r] : [], sockets: r ? r.players : 0 };
  }

  var ready = Promise.all(FILES.map(function (f) { return fetchText(f + '.js').then(function (t) { src[f] = t; }); })
    .concat(BUILTIN.map(function (b) { return fetchText('builtinMaps/' + b + '.json').then(function (t) { fs.writeFileSync(ROOT + '/builtinMaps/' + b + '.json', t); }, function () {}); })))
    .then(boot)
    .then(function () { return true; }, function (e) { console.warn('[offline server] not started, using the simple local API:', e && e.message); routes = []; return false; });

  var lastName = null;
  function me() {
    if (!acc) return null;
    var u = acc.currentUser({ headers: { cookie: 'sid=' + sid() } });
    if (u && u.name !== lastName) { lastName = u.name; lsSet('meName', u.name); }
    return u || null;
  }

  window.BFOfflineServer = {
    ready: ready,
    handle: handle,
    me: me,
    acc: function () { return acc; },
    maps: function () { return acc ? req('maps') : null; },
    save: function () { if (acc) acc.save(); flush(); },
    login: login,
    sandbox: sandbox,
    setSandbox: setSandbox
  };

  /* ---------- панель песочницы ---------- */
  function panel() {
    if (document.getElementById('bfSandboxBtn') || !document.body) return;
    var css = document.createElement('style');
    css.textContent =
      '#bfSandboxBtn{position:fixed;left:50%;transform:translateX(-50%);bottom:10px;z-index:2147483000;background:#111827;color:#fff;border:0;border-radius:999px;' +
      'padding:8px 13px;font:600 12px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);opacity:.85}' +
      '#bfSandboxBtn:hover{opacity:1}' +
      '#bfSandbox{position:fixed;left:50%;transform:translateX(-50%);bottom:50px;z-index:2147483000;width:330px;max-width:calc(100vw - 24px);max-height:calc(100vh - 70px);overflow:auto;' +
      'background:#fff;color:#111827;border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.25);padding:14px;font:13px/1.35 system-ui,sans-serif;display:none}' +
      '#bfSandbox.open{display:block}#bfSandbox h4{margin:0 0 4px;font-size:14px}#bfSandbox .sbHint{color:#6b7280;font-size:11.5px;margin-bottom:10px}' +
      '#bfSandbox .sbRow{display:flex;gap:6px;align-items:center;margin:6px 0;flex-wrap:wrap}#bfSandbox label{min-width:86px;font-weight:600;font-size:12px}' +
      '#bfSandbox input[type=number]{width:96px;padding:5px 7px;border:1px solid #d1d5db;border-radius:7px;font:inherit}' +
      '#bfSandbox button{padding:5px 9px;border:1px solid #d1d5db;background:#f9fafb;border-radius:7px;cursor:pointer;font:600 12px system-ui,sans-serif;color:#111827}' +
      '#bfSandbox button:hover{background:#eef2f7}#bfSandbox button.go{background:#111827;color:#fff;border-color:#111827}' +
      '#bfSandbox .sbSep{border-top:1px solid #eef0f3;margin:10px 0}#bfSandbox .sbMsg{color:#16a34a;font-size:12px;min-height:16px;margin-top:6px}';
    document.head.appendChild(css);
    var btn = document.createElement('button'); btn.id = 'bfSandboxBtn'; btn.textContent = 'Sandbox'; btn.title = 'Drag to move';
    var box = document.createElement('div'); box.id = 'bfSandbox';
    document.body.appendChild(btn); document.body.appendChild(box);
    /* кнопку можно утащить в любое место (запоминается); в игре по умолчанию — над кнопкой сообщений,
       чтобы не закрывать полоску здоровья и подпись карты внизу */
    function putBtn(x, y) {
      x = Math.max(4, Math.min(innerWidth - btn.offsetWidth - 4, x)); y = Math.max(4, Math.min(innerHeight - btn.offsetHeight - 4, y));
      btn.style.left = x + 'px'; btn.style.top = y + 'px'; btn.style.bottom = 'auto'; btn.style.transform = 'none';
    }
    var saved = null; try { saved = JSON.parse(lsGet('sandboxBtn') || 'null'); } catch (e) {}
    if (saved) putBtn(saved.x * innerWidth, saved.y * innerHeight);
    else if (/\/game(\.html)?$/.test(location.pathname)) putBtn(12, innerHeight - 106);
    var drag = null, moved = false;
    btn.addEventListener('pointerdown', function (e) { drag = { dx: e.clientX - btn.getBoundingClientRect().left, dy: e.clientY - btn.getBoundingClientRect().top, x: e.clientX, y: e.clientY }; moved = false; btn.setPointerCapture(e.pointerId); });
    btn.addEventListener('pointermove', function (e) {
      if (!drag) return;
      if (!moved && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 5) return;
      moved = true; putBtn(e.clientX - drag.dx, e.clientY - drag.dy);
    });
    btn.addEventListener('pointerup', function () {
      if (drag && moved) { var r = btn.getBoundingClientRect(); lsSet('sandboxBtn', JSON.stringify({ x: r.left / innerWidth, y: r.top / innerHeight })); }
      drag = null;
    });
    btn.onclick = function () { if (moved) { moved = false; return; } box.classList.toggle('open'); if (box.classList.contains('open')) draw(); };
    function num(id) { return Math.max(0, Math.floor(Number(document.getElementById(id).value) || 0)); }
    function msg(t) { var m = document.getElementById('sbMsg'); if (m) m.textContent = t; }
    function changed(t) {
      BFOfflineServer.save(); draw(); msg(t);
      var u = me(); if (u && window.BFShell && BFShell.refreshCoins) try { BFShell.refreshCoins(u.coins); } catch (e) {}
    }
    function draw() {
      var u = me() || {}, sb = sandbox();
      box.innerHTML =
        '<h4>Sandbox</h4><div class="sbHint">Test site only. Everything is stored in this browser.</div>' +
        '<div class="sbRow"><label>Coins</label><input type="number" id="sbCoins" value="' + (u.coins || 0) + '"><button class="go" data-a="coins">Set</button></div>' +
        '<div class="sbRow"><button data-add="100">+100</button><button data-add="1000">+1 000</button><button data-add="100000">+100 000</button><button data-add="1000000">+1 000 000</button></div>' +
        '<div class="sbRow"><label>Race score</label><input type="number" id="sbScore" value="' + (u.score || 0) + '"><button class="go" data-a="score">Set</button></div>' +
        '<div class="sbRow"><label>H&amp;S score</label><input type="number" id="sbHs" value="' + (u.hsScore || 0) + '"><button class="go" data-a="hs">Set</button></div>' +
        '<div class="sbSep"></div>' +
        '<div class="sbRow"><label>Bots in rooms</label><input type="number" id="sbBots" min="0" max="39" value="' + (sb.bots === undefined ? 3 : sb.bots) + '"><button class="go" data-a="bots">Set</button></div>' +
        '<div class="sbHint">Every mode: rivals in Race, players in Hide and Seek, Murder Mystery, Team Battle, War and Party, allies in Adventure. Applies when you join a room.</div>' +
        '<div class="sbSep"></div>' +
        '<div class="sbRow"><button data-a="unlock">Unlock everything</button><button data-a="limits">Reset daily limits</button></div>' +
        '<div class="sbRow"><button data-a="owner">' + (sb.owner ? 'Owner rights: on' : 'Owner rights: off') + '</button><button data-a="login">Sign in again</button></div>' +
        '<div class="sbRow"><button data-a="reset">Reset sandbox</button></div>' +
        '<div class="sbMsg" id="sbMsg"></div>';
    }
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var u = me(), sb = sandbox(), a = b.dataset.a;
      if (b.dataset.add) { if (!u) return; u.coins = (u.coins || 0) + Number(b.dataset.add); return changed('Coins: ' + u.coins); }
      if (a === 'coins' && u) { u.coins = num('sbCoins'); return changed('Coins: ' + u.coins); }
      if (a === 'score' && u) { u.score = num('sbScore'); return changed('Race score: ' + u.score); }
      if (a === 'hs' && u) { u.hsScore = num('sbHs'); return changed('Hide and Seek score: ' + u.hsScore); }
      if (a === 'bots') { sb.bots = Math.min(39, num('sbBots')); setSandbox(sb); draw(); return msg('Bots: ' + sb.bots + ' (rejoin a room)'); }
      if (a === 'unlock' && u) { u.themeUnlocked = true; u.chatColorUnlocked = true; return changed('Themes and colors unlocked'); }
      if (a === 'limits' && u) { u.rewardDay = ''; u.mapDay = 0; u.mapCount = 0; u.questDay = ''; u.coinWin = 0; u.scoreWin = 0; u.hsWin = 0; return changed('Daily reward, quests, map uploads and earning limits reset'); }
      if (a === 'owner') { sb.owner = !sb.owner; setSandbox(sb); flush(); return location.reload(); }
      if (a === 'login') { login(); return location.reload(); }
      if (a === 'reset') {
        if (!confirm('Delete all sandbox data in this browser (account, maps, clans, messages)?')) return;
        try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf(LS) === 0) localStorage.removeItem(k); }); } catch (e2) {}
        pending = {}; return location.reload();
      }
    });
  }
  ready.then(function (ok) { if (!ok) return; if (document.body) panel(); else addEventListener('DOMContentLoaded', panel); });
})();
