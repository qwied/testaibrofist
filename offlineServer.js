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
    existsSync: function (p) { return lsGet('vfs:' + p) !== null || vfsKeys(p + '/').length > 0 || /\/(data|builtinMaps|logimg|abuse)$/.test(p); },
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
        // картинки Logs и файлы Admin Abuse лежат в «файлах» localStorage — статики /logimg/ и /abusefile/
        // на хостинге нет, отдаём их прямо в ответе
        if (typeof body === 'string' && /\/(logimg|abusefile)\//.test(body)) body = body.replace(/\/(logimg|abusefile)\/([A-Za-z0-9._-]+)/g, function (all, dir, f) {
          var v = lsGet('vfs:' + ROOT + '/data/' + (dir === 'logimg' ? 'logimg' : 'abuse') + '/' + f); if (v === null) return all;
          var ext = (/\.(\w+)$/.exec(f) || [0, 'png'])[1].toLowerCase();
          var mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4' }[ext] || 'image/' + ext;
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
               'userSkins', 'skins', 'dailyRewards', 'serversInfo', 'fsAtomic', 'abuse'];
  var BUILTIN = ['serversinfo', 'piratebay', 'spybase', 'brotower', 'crystaldefense', 'broarena'];
  var src = {}, cache = {};
  function env() {
    var sb = sandbox();
    // права владельца — у того аккаунта песочницы, за который сейчас играешь
    return { OWNER_NAME: 'System', OWNER_ALIASES: 'System,AIBrofist' + (sb.owner ? ',' + (lsGet('meName') || ME) : ''), NODE_ENV: 'sandbox', PASSWORD_AUTH: '1' };
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
    req('abuse').register(app, acc);                 // Admin Abuse владельца: погода, монеты с неба, картинки и музыка
    req('extras').register(app, acc);
    req('dailyRewards').register(app, acc);
    req('quests').register(app, acc);
    req('serversInfo').register(app, { snapshot: snapshot, extra: function () { return { maps: req('maps').allMaps().length, accounts: Object.keys(acc.getDb().users).length, discord: null }; } });
    // вышел из аккаунта — остаёшься гостем, как на сайте; войти снова — окно входа (account.js) или TestPanel
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
    routes: function () { return routes.map(function (r) { return r.method + ' ' + r.re.source; }); },
    me: me,
    acc: function () { return acc; },
    maps: function () { return acc ? req('maps') : null; },
    save: function () { if (acc) acc.save(); flush(); },
    login: login,
    playAs: function (n) { return playAs(n); },
    createAccount: function (n) { return createAccount(n); },
    sandbox: sandbox,
    setSandbox: setSandbox
  };

  /* ---------- аккаунты песочницы: сколько угодно, вход за любой ---------- */
  function playAs(name) {
    var db = acc.getDb(), u = db.users[String(name).toLowerCase()];
    if (!u) return false;
    var s2 = rnd(32).toString('hex'), t = Date.now();
    db.sessions[s2] = { name: u.name, created: t, seen: t };
    lsSet('sid', s2); lsSet('meName', u.name); acc.save(); flush();
    return true;
  }
  function createAccount(name) {
    name = String(name || '').trim();
    var bad = acc.checkName(name);
    if (bad) return bad;
    var db = acc.getDb();
    if (db.users[name.toLowerCase()]) return 'Username «' + name + '» is already taken';
    db.users[name.toLowerCase()] = { name: name, joined: Date.now(), coins: 0, score: 0, hsScore: 0, friends: [], incoming: [], outgoing: [], avatar: '0', about: '' };
    acc.save(); flush();
    return null;
  }
  function deleteAccount(name) {
    var db = acc.getDb(), k = String(name).toLowerCase();
    delete db.users[k];
    Object.keys(db.sessions).forEach(function (sid2) { var x = db.sessions[sid2]; if (String(x && x.name || x).toLowerCase() === k) delete db.sessions[sid2]; });
    Object.values(db.users).forEach(function (u) { ['friends', 'incoming', 'outgoing'].forEach(function (f) { u[f] = (u[f] || []).filter(function (n) { return String(n).toLowerCase() !== k; }); }); });
    acc.save(); flush();
  }

  /* ---------- панель песочницы: три вкладки — аккаунт, игра, владелец ---------- */
  function panel() {
    if (document.getElementById('bfSandboxBtn') || !document.body) return;
    var css = document.createElement('style');
    css.textContent =
      '#bfSandboxBtn{position:fixed;left:50%;transform:translateX(-50%);bottom:10px;z-index:2147483000;background:#111827;color:#fff;border:0;border-radius:999px;' +
      'padding:8px 14px;font:600 12px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);opacity:.88;touch-action:none}' +
      '#bfSandboxBtn:hover{opacity:1}' +
      '#bfSandbox{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483001;width:380px;max-width:calc(100vw - 24px);max-height:calc(100vh - 40px);' +
      'display:none;flex-direction:column;background:#fff;color:#111827;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.3);font:13px/1.35 system-ui,sans-serif}' +
      '#bfSandbox.open{display:flex}' +
      '#bfSandbox .sbHead{display:flex;align-items:center;gap:8px;padding:14px 16px 0}#bfSandbox .sbHead b{font-size:15px;flex:1}' +
      '#bfSandbox .sbX{border:0;background:#f3f4f6;width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:16px;line-height:1;color:#374151}' +
      '#bfSandbox .sbTabs{display:flex;gap:4px;padding:10px 16px 0}' +
      '#bfSandbox .sbTab{flex:1;border:0;background:#f3f4f6;color:#4b5563;padding:7px 0;border-radius:8px;cursor:pointer;font:600 12.5px system-ui,sans-serif}' +
      '#bfSandbox .sbTab.on{background:#111827;color:#fff}' +
      '#bfSandbox .sbBody{padding:12px 16px 16px;overflow:auto}' +
      '#bfSandbox .sbCard{border:1px solid #eef0f3;border-radius:12px;padding:10px 12px;margin-bottom:10px}' +
      '#bfSandbox .sbTitle{font-weight:700;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px}' +
      '#bfSandbox .sbRow{display:flex;gap:6px;align-items:center;margin:6px 0}#bfSandbox .sbRow>span{min-width:92px;font-weight:600}' +
      '#bfSandbox input[type=number],#bfSandbox input[type=text]{flex:1;min-width:0;padding:7px 9px;border:1px solid #d1d5db;border-radius:8px;font:inherit;background:#fff;color:#111827}' +
      '#bfSandbox input[type=range]{flex:1}' +
      '#bfSandbox button.b{padding:7px 11px;border:1px solid #d1d5db;background:#f9fafb;border-radius:8px;cursor:pointer;font:600 12px system-ui,sans-serif;color:#111827;white-space:nowrap}' +
      '#bfSandbox button.b:hover{background:#eef2f7}#bfSandbox button.go{background:#111827;color:#fff;border-color:#111827}' +
      '#bfSandbox button.bad{color:#b91c1c;border-color:#fecaca;background:#fff5f5}' +
      '#bfSandbox .sbChips{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}' +
      '#bfSandbox .sbAcc{display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid #f3f4f6}#bfSandbox .sbAcc:first-child{border-top:0}' +
      '#bfSandbox .sbAcc .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}#bfSandbox .sbAcc .c{color:#6b7280;font-size:12px}' +
      '#bfSandbox .sbList{max-height:180px;overflow:auto}' +
      '#bfSandbox .sbHint{color:#6b7280;font-size:12px;margin-top:4px}' +
      '#bfSandbox .sbMsg{min-height:16px;font-size:12px;color:#16a34a;padding:0 16px 12px}#bfSandbox .sbMsg.err{color:#b91c1c}' +
      '#bfSandbox .sbSwitch{display:flex;align-items:center;justify-content:space-between;gap:10px}';
    document.head.appendChild(css);
    var btn = document.createElement('button'); btn.id = 'bfSandboxBtn'; btn.textContent = 'TestPanel'; btn.title = 'Drag to move';
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
    btn.addEventListener('pointerdown', function (e) { var r = btn.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, x: e.clientX, y: e.clientY }; moved = false; btn.setPointerCapture(e.pointerId); });
    btn.addEventListener('pointermove', function (e) {
      if (!drag) return;
      if (!moved && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 5) return;
      moved = true; putBtn(e.clientX - drag.dx, e.clientY - drag.dy);
    });
    btn.addEventListener('pointerup', function () {
      if (drag && moved) { var r = btn.getBoundingClientRect(); lsSet('sandboxBtn', JSON.stringify({ x: r.left / innerWidth, y: r.top / innerHeight })); }
      drag = null;
    });
    function toggle(open) { box.classList.toggle('open', open); if (open) draw(); }
    btn.onclick = function () { if (moved) { moved = false; return; } toggle(!box.classList.contains('open')); };
    addEventListener('keydown', function (e) { if (e.key === 'Escape' && box.classList.contains('open')) toggle(false); });

    var tab = lsGet('sandboxTab') || 'account', note = '', noteErr = false;
    function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
    function fmt(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
    function num(id) { var e = document.getElementById(id); return Math.max(0, Math.floor(Number(e && e.value) || 0)); }
    function say(t, err) { note = t; noteErr = !!err; var m = document.getElementById('sbMsg'); if (m) { m.textContent = t; m.className = 'sbMsg' + (err ? ' err' : ''); } }
    function changed(t) {
      BFOfflineServer.save(); draw(); say(t);
      var u = me(); if (u && window.BFShell && BFShell.refreshCoins) try { BFShell.refreshCoins(u.coins); } catch (e) {}
    }
    function draw() {
      var u = me() || {}, sb = sandbox(), bots = sb.bots === undefined ? 3 : sb.bots, html = '';
      if (tab === 'account') {
        var users = Object.values(acc.getDb().users).sort(function (a, b) { return a.name === u.name ? -1 : b.name === u.name ? 1 : a.name.localeCompare(b.name); });
        html =
          '<div class="sbCard"><div class="sbTitle">Playing as ' + esc(u.name || '—') + '</div>' +
          '<div class="sbRow"><span>Coins</span><input type="number" id="sbCoins" value="' + (u.coins || 0) + '"><button class="b go" data-a="coins">Set</button></div>' +
          '<div class="sbChips"><button class="b" data-add="100">+100</button><button class="b" data-add="1000">+1K</button><button class="b" data-add="100000">+100K</button><button class="b" data-add="1000000">+1M</button></div>' +
          '<div class="sbRow"><span>Race score</span><input type="number" id="sbScore" value="' + (u.score || 0) + '"><button class="b go" data-a="score">Set</button></div>' +
          '<div class="sbRow"><span>H&amp;S score</span><input type="number" id="sbHs" value="' + (u.hsScore || 0) + '"><button class="b go" data-a="hs">Set</button></div></div>' +
          '<div class="sbCard"><div class="sbTitle">Accounts · ' + users.length + '</div>' +
          '<div class="sbRow"><input type="text" id="sbNew" maxlength="20" placeholder="New account name"><button class="b go" data-a="create">Create</button></div>' +
          '<div class="sbList">' + users.map(function (x) {
            var mine = x.name === u.name;
            return '<div class="sbAcc"><div class="n">' + esc(x.name) + '</div><div class="c">' + fmt(x.coins) + ' coins</div>' +
              (mine ? '<button class="b" disabled>You</button>' : '<button class="b go" data-play="' + esc(x.name) + '">Play as</button><button class="b bad" data-del="' + esc(x.name) + '" title="Delete">×</button>') + '</div>';
          }).join('') + '</div></div>';
      } else if (tab === 'game') {
        html =
          '<div class="sbCard"><div class="sbTitle">Bots in rooms</div>' +
          '<div class="sbRow"><input type="range" id="sbBotsR" min="0" max="39" value="' + bots + '"><input type="number" id="sbBots" min="0" max="39" value="' + bots + '" style="flex:0 0 64px"><button class="b go" data-a="bots">Set</button></div>' +
          '<div class="sbHint">Rivals in Race, players in Hide and Seek, Murder Mystery, Team Battle, War and Party, allies in Adventure. Applies when you join a room.</div></div>' +
          '<div class="sbCard"><div class="sbTitle">Shortcuts</div>' +
          '<div class="sbRow"><button class="b" data-a="unlock" style="flex:1">Unlock all themes and colors</button></div>' +
          '<div class="sbRow"><button class="b" data-a="limits" style="flex:1">Reset daily reward, quests and limits</button></div></div>';
      } else {
        html =
          '<div class="sbCard"><div class="sbSwitch"><div><b>Owner rights</b><div class="sbHint">For ' + esc(u.name || '—') + ': owner panel, Edit and Admin Abuse.</div></div>' +
          '<button class="b ' + (sb.owner ? 'go' : '') + '" data-a="owner">' + (sb.owner ? 'On' : 'Off') + '</button></div></div>' +
          '<div class="sbCard"><div class="sbTitle">Danger zone</div><button class="b bad" data-a="reset" style="width:100%">Reset sandbox (all accounts, maps, clans)</button></div>';
      }
      box.innerHTML =
        '<div class="sbHead"><b>TestPanel</b><button class="sbX" data-a="close" title="Close">×</button></div>' +
        '<div class="sbTabs">' + [['account', 'Account'], ['game', 'Game'], ['admin', 'Admin']].map(function (t) {
          return '<button class="sbTab' + (tab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
        '<div class="sbBody">' + html + '</div><div class="sbMsg' + (noteErr ? ' err' : '') + '" id="sbMsg">' + esc(note) + '</div>';
      var r = document.getElementById('sbBotsR'), n = document.getElementById('sbBots');
      if (r && n) { r.oninput = function () { n.value = r.value; }; n.oninput = function () { r.value = n.value; }; }
      var nw = document.getElementById('sbNew'); if (nw) nw.onkeydown = function (e) { if (e.key === 'Enter') box.querySelector('[data-a="create"]').click(); };
    }
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || b.disabled) return;
      var u = me(), sb = sandbox(), a = b.dataset.a;
      note = '';
      if (b.dataset.tab) { tab = b.dataset.tab; lsSet('sandboxTab', tab); return draw(); }
      if (a === 'close') return toggle(false);
      if (b.dataset.add) { if (!u) return; u.coins = (u.coins || 0) + Number(b.dataset.add); return changed('Coins: ' + fmt(u.coins)); }
      if (b.dataset.play) { playAs(b.dataset.play); return location.reload(); }
      if (b.dataset.del) {
        if (!confirm('Delete the account «' + b.dataset.del + '»?')) return;
        deleteAccount(b.dataset.del); draw(); return say('Account deleted');
      }
      if (a === 'create') {
        var nm = (document.getElementById('sbNew').value || '').trim(), err = createAccount(nm);
        if (err) return say(err, true);
        draw(); return say('Created «' + nm + '» — press Play as to switch');
      }
      if (a === 'coins' && u) { u.coins = num('sbCoins'); return changed('Coins: ' + fmt(u.coins)); }
      if (a === 'score' && u) { u.score = num('sbScore'); return changed('Race score: ' + fmt(u.score)); }
      if (a === 'hs' && u) { u.hsScore = num('sbHs'); return changed('Hide and Seek score: ' + fmt(u.hsScore)); }
      if (a === 'bots') { sb.bots = Math.min(39, num('sbBots')); setSandbox(sb); draw(); return say('Bots: ' + sb.bots + ' — rejoin a room to apply'); }
      if (a === 'unlock' && u) { u.themeUnlocked = true; u.chatColorUnlocked = true; return changed('Themes and colors unlocked'); }
      if (a === 'limits' && u) { u.rewardDay = ''; u.mapDay = 0; u.mapCount = 0; u.questDay = ''; u.coinWin = 0; u.scoreWin = 0; u.hsWin = 0; return changed('Daily reward, quests, map uploads and earning limits reset'); }
      if (a === 'owner') { sb.owner = !sb.owner; setSandbox(sb); flush(); return location.reload(); }
      if (a === 'reset') {
        if (!confirm('Delete all sandbox data in this browser (accounts, maps, clans, messages)?')) return;
        try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf(LS) === 0) localStorage.removeItem(k); }); } catch (e2) {}
        pending = {}; return location.reload();
      }
    });
  }
  ready.then(function (ok) { if (!ok) return; if (document.body) panel(); else addEventListener('DOMContentLoaded', panel); });
})();
