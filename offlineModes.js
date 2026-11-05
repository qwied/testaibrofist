/* AIBrofist local runtime, часть 2: отдельные режимы «Война», «Вечеринка» и «Приключение» в песочнице
   (offline.js), где нет сервера — например, на GitHub Pages. Настоящие модули war.js, party.js и
   adventure.js — те же файлы, что на сервере, — запускаются здесь же, в браузере, с поддельным io:
   всё, что они «рассылают», доходит до единственного игрока, а соперников изображают боты.
   Круг раунда тот же, что в server.js: лобби с рулеткой → раунд → итог → снова лобби (hsStartLobby,
   hsStartRound). Подключается со страницы игры после offline.js. */
(function () {
  'use strict';
  if (window.BFOfflineModes) return;

  var MIN_PLAYERS = { classic: 2, murder: 3, team: 2, war: 2, party: 2, adventure: 1 };
  var MURDER_GRACE_MS = 20000, MIN_DIST = 200, CTF_WIN = 3, DOM_WIN = 120, DOM_TICKS = 3;
  /* сколько ботов в комнате — из панели песочницы (offlineServer.js), по умолчанию 3; меньше, чем нужно режиму, не бывает.
     В «Приключении» они союзники: сами идут к врагам и бьют их (см. botTick). */
  function botNames(variant) {
    var n = 3;
    try { var sb = JSON.parse(localStorage.getItem('aibrofist.local.v2.sandbox') || '{}'); if (sb && sb.bots !== undefined) n = Math.floor(+sb.bots) || 0; } catch (e) {}
    n = Math.max(MIN_PLAYERS[variant] - 1, Math.min(39, n));
    var out = []; for (var i = 1; i <= n; i++) out.push('Bot ' + i);
    return out;
  }
  // обычные прятки берут ещё и все карты пряток песочницы (см. loadMaps)
  var BUILTIN = { classic: ['broarena.json'], murder: ['broarena.json'], team: ['broarena.json'], war: ['piratebay.json'], party: ['broarena.json'], adventure: ['brotower.json', 'crystaldefense.json'] };
  var LOBBY_MS = 9000, ROULETTE_MS = 3500;

  /* ---- физика ботов: та же, что у игрока в game.html (скорость бега MAX_VX, гравитация G() при
     gravityScale 9, прыжок на JUMP_H, падение быстрее подъёма FALL_MULT, подъём на ступеньку STEP_UP),
     твёрдые — блок, круг, треугольник (как solid() в game.html) прямоугольником. Боты бегут к цели,
     прыгают у стены, на уступ и через яму; застрял надолго — перебирается ближе к цели, упал за карту — встаёт на старте. ---- */
  var TEMPO = 1.2, MAX_VX = 6.2, GRAV = 9 * 0.062 * TEMPO * TEMPO, JUMP_V = -Math.sqrt(2 * GRAV * 155), FALL_MULT = 1.2, STEP_UP = 16;
  function BotPhys(objects) {
    var sol = (objects || []).filter(function (o) {
      return o && (o.type === 'rect' || o.type === 'circle' || o.type === 'triangle') && o.ghost !== true && o.hideSpot !== true && o.deadly !== true && !(o.w <= 0) && !(o.h <= 0);
    }).map(function (o) { return { x: +o.x, y: +o.y, w: +o.w || 40, h: +o.h || 40 }; });
    // ядовитое (deadly) — не пол: бот перепрыгивает его, как яму, а в «Войне» касание выбивает (см. botTick)
    var bad = (objects || []).filter(function (o) { return o && o.deadly === true && o.ghost !== true && +o.w > 0 && +o.h > 0; })
      .map(function (o) { return { x: +o.x, y: +o.y, w: +o.w, h: +o.h }; });
    function hitBad(x, y, w, h) {
      for (var i = 0; i < bad.length; i++) { var o = bad[i]; if (x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y) return o; }
      return null;
    }
    var bottom = sol.reduce(function (m, o) { return Math.max(m, o.y + o.h); }, 600) + 1500;
    function hitAny(x, y, w, h) {
      for (var i = 0; i < sol.length; i++) { var o = sol[i]; if (x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y) return o; }
      return null;
    }
    // один кадр (1/60 c) для тела b {x,y,w,h,vx,vy,ground}; dir: -1/0/1, jump: хочет прыгнуть
    function frame(b, dir, jump) {
      // отброс от удара (kx) гаснет за несколько кадров поверх бега
      b.vx = dir * MAX_VX + (b.kx || 0);
      if (b.kx) { b.kx *= 0.88; if (Math.abs(b.kx) < 0.3) b.kx = 0; }
      if (jump && b.ground) { b.vy = JUMP_V; b.ground = false; }
      b.vy += b.vy > 0 ? GRAV * FALL_MULT : GRAV;
      if (b.vy > 22) b.vy = 22;
      b.wall = 0;
      if (b.vx) {
        var nx = b.x + b.vx, o = hitAny(nx, b.y, b.w, b.h);
        if (o) {
          // низкий уступ — шагаем на него, как игрок (STEP_UP)
          if (b.ground && o.y >= b.y + b.h - STEP_UP && !hitAny(nx, o.y - b.h, b.w, b.h)) { b.x = nx; b.y = o.y - b.h; }
          else { b.x = b.vx > 0 ? o.x - b.w : o.x + o.w; b.wall = dir; }
        } else b.x = nx;
      }
      var ny = b.y + b.vy, f = hitAny(b.x, ny, b.w, b.h);
      if (f) { if (b.vy > 0) { b.y = f.y - b.h; b.ground = true; } else b.y = f.y + f.h; b.vy = 0; }
      else { b.y = ny; b.ground = false; }
    }
    // есть ли пол впереди (не яма ли)
    function floorAhead(b, dir) {
      var x = b.x + dir * (b.w + 20);
      return !!hitAny(x, b.y + b.h, b.w, 160) && !hitBad(x, b.y + b.h - 30, b.w, 90);
    }
    // самое верхнее из list в столбце [x, x+w] между y0 и y1
    function columnTop(x, w, y0, y1, list) {
      var best = null;
      for (var i = 0; i < list.length; i++) { var o = list[i]; if (x < o.x + o.w && x + w > o.x && o.y + o.h > y0 && o.y < y1 && (!best || o.y < best.y)) best = o; }
      return best;
    }
    // впереди яд: шагнёшь — упадёшь в него (или войдёшь)
    function badAhead(b, dir) {
      var x = b.x + dir * (b.w + 6), feet = b.y + b.h;
      var bd = columnTop(x, b.w, b.y, feet + 500, bad);
      if (!bd) return false;
      var fl = columnTop(x, b.w, feet - STEP_UP, feet + 500, sol);
      return !fl || bd.y <= fl.y + 4;
    }
    // за ядом в пределах прыжка (~230 px) есть безопасный пол
    function landing(b, dir) {
      for (var d = 60; d <= 230; d += 20) {
        var x = b.x + dir * (b.w + d), feet = b.y + b.h;
        var fl = columnTop(x, b.w, feet - 120, feet + 160, sol);   // ниже себя прыгать можно
        if (fl && !columnTop(x, b.w, fl.y - b.h, fl.y + 2, bad) && !hitAny(x, fl.y - b.h, b.w, b.h)) return true;
      }
      return false;
    }
    // под телом в позиции x первым внизу окажется яд (или ничего)
    // пол — только то, чей верх ниже ног: на блок, мимо которого уже падаешь, не встать (в него — стена)
    function floorTop(x, w, y0, y1, list) {
      var best = null;
      for (var i = 0; i < list.length; i++) { var o = list[i]; if (x < o.x + o.w && x + w > o.x && o.y >= y0 && o.y < y1 && (!best || o.y < best.y)) best = o; }
      return best;
    }
    function overBad(b, x) {
      var y0 = b.y + b.h - 2, y1 = b.y + b.h + 700;
      var fl = floorTop(x + 4, b.w - 8, y0, y1, sol), bd = columnTop(x + 4, b.w - 8, y0, y1, bad);
      return !!bd && (!fl || bd.y <= fl.y + 4);
    }
    function overSafe(b, x) {
      var y0 = b.y + b.h - 2, y1 = b.y + b.h + 700;
      var fl = floorTop(x + 8, b.w - 16, y0, y1, sol), bd = columnTop(x + 4, b.w - 8, y0, y1, bad);
      return !!fl && (!bd || fl.y < bd.y);
    }
    // в какую сторону ближе безопасный пол (при равенстве — туда, куда и так бежал)
    function safeSide(b, pref) {
      for (var d = 10; d <= 260; d += 10) {
        var r = overSafe(b, b.x + d), l = overSafe(b, b.x - d);
        if (r && l) return pref || 1;
        if (r) return 1;
        if (l) return -1;
      }
      return 0;
    }
    function solidAt(x, y) { return !!hitAny(x - 1, y - 1, 2, 2); }
    // прямая видимость: на отрезке нет твёрдого (шаг 24 px)
    function los(x1, y1, x2, y2) {
      var n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 24);
      for (var i = 1; i < n; i++) if (solidAt(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n)) return false;
      return true;
    }
    /* тик ИИ: ms мс к цели t {x,y} (верхний левый угол тела цели); home — куда встать после падения */
    function seek(b, t, ms, home) {
      var frames = Math.max(1, Math.round(ms / 16.667));
      for (var i = 0; i < frames; i++) {
        var dx = t ? (t.x - b.x) : 0, dy = t ? (t.y - b.y) : 0;
        var dir = !t || Math.abs(dx) < 8 ? 0 : dx > 0 ? 1 : -1;
        var jump = b.ground && dir !== 0 && (b.wall === dir || !floorAhead(b, dir) || (dy < -60 && Math.abs(dx) < 220));
        if (t && dir === 0 && dy < -60 && b.ground) jump = true;
        // яд впереди: перепрыгнуть, если есть куда, иначе остановиться у края
        b.edge = false;
        if (b.ground) { b.commit = 0; b.steer = 0; }
        if (dir && b.ground && badAhead(b, dir)) { if (landing(b, dir)) { jump = true; b.commit = dir; } else { dir = 0; jump = false; b.edge = true; } }
        else if (!b.ground) {
          // в воздухе — как игрок, рулит: над ядом тянется к ближнему безопасному полу,
          // а в прыжке через яд летит до конца и над полом опускается на него
          jump = false;
          if (b.commit && b.vy <= 0) dir = b.commit;
          else if (!overSafe(b, b.x) && (b.steer || overBad(b, b.x))) { var sd = safeSide(b, dir); if (sd) { dir = sd; b.steer = sd; } }
          else { b.steer = 0; if ((b.commit && b.vy > 0) || (dir && overBad(b, b.x + dir * MAX_VX))) dir = 0; }   // не сходить с пола в яд
        }
        frame(b, dir, jump);
      }
      // сторож застревания: стоит на месте, хотя цель далеко — через 4 с встаёт рядом с целью
      var moved = Math.abs(b.x - (b.lastX === undefined ? b.x : b.lastX)) + Math.abs(b.y - (b.lastY === undefined ? b.y : b.lastY));
      b.lastX = b.x; b.lastY = b.y;
      var far = t && Math.abs(t.x - b.x) + Math.abs(t.y - b.y) > 60;
      b.stuck = moved < 2 && far && !b.edge ? (b.stuck || 0) + ms : 0;   // у края яда — не «застрял»
      if (b.stuck > 4000 && t) {                 // застрял: перебирается на 200 px к цели, выше препятствия (не в яд)
        var ox = b.x, oy = b.y;
        b.x += t.x > b.x ? 200 : -200; b.y -= 120;
        for (var k = 0; k < 20 && hitAny(b.x, b.y, b.w, b.h); k++) b.y -= 40;
        if (columnTop(b.x, b.w, b.y, b.y + b.h + 600, bad)) { b.x = ox; b.y = oy; }
        b.vx = 0; b.vy = 0; b.stuck = 0;
      }
      if (b.y > bottom && home) { b.x = home.x + (Math.random() - 0.5) * 60; b.y = home.y - 10; b.vx = 0; b.vy = 0; }
    }
    return { seek: seek, frame: frame, solids: sol, bottom: bottom, solidAt: solidAt, los: los,
             touchBad: function (b) { return !!hitBad(b.x + 4, b.y + 4, b.w - 8, b.h - 4); } };
  }
  window.BFBotPhys = BotPhys;

  var modsP = null;
  function loadMods(raw) {
    if (modsP) return modsP;
    var cache = {};
    var req = function (name) { if (name === './party.js') return cache.party; throw new Error('require ' + name); };
    var run = function (file) {
      return raw(file, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(file + ' ' + r.status); return r.text(); }).then(function (src) {
        var m = { exports: {} };
        new Function('module', 'exports', 'require', 'process', src)(m, m.exports, req, { env: {} });   // eslint-disable-line no-new-func
        return m.exports;
      });
    };
    modsP = run('party.js').then(function (p) { cache.party = p; return run('adventure.js'); })
      .then(function (a) { cache.adventure = a; return run('war.js'); })
      .then(function (w) { cache.war = w; return cache; });
    return modsP;
  }

  function create(o, mods) {
    var variant = o.variant, sock = o.sock, fire = o.fire, api = o.api;
    var room = 'hideAndSeek:' + variant + '-1', classic = variant === 'classic';
    var gameState = { players: new Map(), rooms: new Map() };
    var members = new Set();
    gameState.rooms.set(room, members);
    var nidK = 1;
    var me = { id: sock.id, name: o.name, nid: nidK++, position: null, odo: 0, room: room, bot: false };
    gameState.players.set(me.id, me); members.add(me.id);
    var bots = botNames(variant).map(function (n, i) {
      var b = { id: 'local-bot-' + (i + 1), name: n, nid: nidK++, position: { x: 0, y: 0, w: 30, h: 100 }, odo: 0, room: room, bot: true, k: '' };
      gameState.players.set(b.id, b); members.add(b.id);
      return b;
    });

    var st = { phase: 'lobby', roundNum: 0, variant: 'classic', fixedVariant: variant, endsAt: 0, map: null, mapData: null,
      spots: [], cannons: [], advMap: null, apoc: false, hasPoison: false, caughtSet: new Set(), caughtSent: false,
      seekerIds: new Set(), seekerId: null, seekerName: '', sheriffId: null, sheriffName: '', ctf: null, dom: null, teams: null, teamList: null, bases: null, domPoints: null, timer: null };

    /* ---- поддельный io: комнате и самому игроку — на экран, ботам — в их «мозги» ---- */
    function deliver(ev, d) { try { fire(ev, d); } catch (e) { /* клиент сам разберётся */ } }
    var io = {
      to: function (target) {
        return { emit: function (ev, d) {
          if (target === room) { deliver(ev, d); roomSees(ev, d); }
          else if (target === me.id) deliver(ev, d);
          else botSees(target, ev, d);
        } };
      },
      sockets: { sockets: { get: function () { return null; } } }
    };
    function sockOf(id) {
      return { id: id, handshake: { headers: {} },
        to: function () { return { emit: function (ev, d) { if (id !== me.id) deliver(ev, d); } }; },
        emit: function (ev, d) { if (id === me.id) deliver(ev, d); } };
    }
    function hsMembers(r) { return r === room ? Array.from(members).map(function (id) { return gameState.players.get(id); }).filter(Boolean).map(function (p) { return { id: p.id, name: p.name }; }) : []; }
    function hsTeamOf(s, id) { return s.teams ? s.teams.get(id) || null : null; }
    function endEarly(r, s) { if (s.caughtSent) return; s.caughtSent = true; clearTimeout(s.timer); s.timer = setTimeout(startLobby, 1400); }
    // монеты и очки за раунд — на настоящий аккаунт песочницы (offlineServer.js), как credit в server.js
    function credit(sock2, acct, n) {
      if (sock2 && sock2.id !== undefined && sock2.id !== me.id) return;
      var A = window.BFOfflineServer && BFOfflineServer.acc(); if (!A) return;
      var got = A.creditCoins(me.name, n), u = BFOfflineServer.me();
      if (got) deliver('coinsAwarded', { amount: got, coins: u ? u.coins : 0, reason: 'hsWin' });
    }
    function creditScore(sock2, acct, n) {
      if (sock2 && sock2.id !== undefined && sock2.id !== me.id) return;
      var A = window.BFOfflineServer && BFOfflineServer.acc(); if (A && A.creditHsScore) A.creditHsScore(me.name, n);
    }
    var deps = { io: io, gameState: gameState, hsMembers: hsMembers, hsTeamOf: hsTeamOf, sessionName: function () { return null; },
      credit: credit, creditScore: creditScore, endEarly: endEarly };
    var party = mods.party(deps), adventure = mods.adventure(deps), war = mods.war(deps);
    var map = function () { return st.map ? { author: st.map.author, mapName: st.map.mapName } : null; };

    /* ---- карты: встроенные уровни режима (builtinMaps/) кладём в карты песочницы ---- */
    function loadMaps() {
      return Promise.all(BUILTIN[variant].map(function (f) {
        return o.raw('builtinMaps/' + f, { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (data) {
          var name = { 'piratebay.json': 'Pirate Bay', 'broarena.json': 'Bro Arena', 'brotower.json': 'Bro Tower', 'crystaldefense.json': 'Crystal Defense' }[f];
          var rec = api.findMap('qwied', name);
          if (!rec) { rec = { mapName: name, author: 'qwied', mapType: 'hideAndSeek', date: Date.now(), rating: 5, likes: 0, dislikes: 0, commentCount: 0,
            comments: [], votes: {}, favorites: {}, inGameModes: [], mapData: data }; api.maps.push(rec); }
          else rec.mapData = data;          // встроенная карта всегда свежая (её могли перерисовать)
          return rec;
        });
      })).then(function (list) {
        if (!classic) return list;
        var own = (api.getMaps('hideAndSeek') || []).filter(function (m) { return !m.only && m.mapData && Array.isArray(m.mapData.objects) && list.indexOf(m) === -1; });
        return list.concat(own);
      });
    }
    var recs = [], mapK = 0;
    function pickMap() {
      var pool = recs.filter(function (r) { return variant !== 'adventure' || adventure.parseMap(r.mapData && r.mapData.adv) || adventure.fromObjects(r.mapData && r.mapData.objects); });
      var rec = pool[mapK++ % pool.length];
      st.map = { author: rec.author, mapName: rec.mapName };
      var list = (rec.mapData && rec.mapData.objects) || [];
      st.mapData = rec.mapData;
      st.spots = list.filter(function (x) { return x && x.hideSpot === true; }).slice(0, 60).map(function (x) { return { x: +x.x, y: +x.y, w: +x.w || 1, h: +x.h || 1 }; });
      st.cannons = list.filter(function (x) { return x && x.type === 'cannon'; }).slice(0, 24).map(function (x) { return { x: +x.x, y: +x.y, w: 72, h: 44, aim: +x.aim || 0 }; });
      st.advMap = adventure.parseMap(rec.mapData && rec.mapData.adv) || adventure.fromObjects(list);
      st.phys = BotPhys(list);
      st.apoc = false;
      var sp = list.filter(function (x) { return x && x.type === 'spawn'; })[0];
      st.spawn = sp ? { x: +sp.x, y: +sp.y } : { x: 100, y: 100 };
    }
    function place(b, at) {
      var base = at && isFinite(+at.x) ? at : st.spawn;
      b.position = { x: +base.x + (at && at.w ? at.w / 2 - 15 : 0) + Math.round((Math.random() - 0.5) * 60), y: +base.y + (at && at.h ? at.h - 100 : 0), w: 30, h: 100 };
      b.ph = null;                         // физика бота начнёт с нового места (см. botTick)
    }

    /* ---- команды «Пиратской войны» (как hsPirateSetup в server.js) ---- */
    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    function center(s) { return { x: s.x + s.w / 2, y: s.y + s.h / 2 }; }
    function pirateSetup() {
      var g = st.cannons.slice().sort(function (a, b) { return a.x - b.x; });
      var cut = 1, gap = -1;
      for (var i = 1; i < g.length; i++) if (g[i].x - g[i - 1].x > gap) { gap = g[i].x - g[i - 1].x; cut = i; }
      st.teamList = ['red', 'blue']; st.bases = {};
      var used = [];
      [g.slice(0, cut), g.slice(cut)].forEach(function (side, k) {
        var mid = { x: side.reduce(function (a, q) { return a + q.x + q.w / 2; }, 0) / side.length, y: side.reduce(function (a, q) { return a + q.y + q.h / 2; }, 0) / side.length };
        var base = null, bd = 700;
        st.spots.forEach(function (s) { var d = dist(center(s), mid); if (d < bd && used.indexOf(s) === -1) { bd = d; base = s; } });
        if (!base) { var q = side[0]; base = { x: q.x + q.w / 2 - 40, y: q.y + q.h - 100, w: 80, h: 100 }; }
        used.push(base); st.bases[st.teamList[k]] = base;
      });
      var ids = Array.from(members); st.teams = new Map();
      ids.forEach(function (id, i) { st.teams.set(id, st.teamList[i % 2]); });
    }
    // две команды: базы — самые далёкие друг от друга укрытия; у Domination ещё центр между ними (как hsTeamSetup)
    function teamSetup() {
      var sp = st.spots, a = 0, b = 1, best = -1;
      for (var i = 0; i < sp.length; i++) for (var j = i + 1; j < sp.length; j++) {
        var d = dist(center(sp[i]), center(sp[j])); if (d > best) { best = d; a = i; b = j; }
      }
      st.teamList = ['red', 'blue']; st.bases = { red: sp[a], blue: sp[b] }; st.domPoints = null;
      if (st.variant === 'cp') {                 // контрольные точки войны: базы и сколько влезет ещё, до пяти
        var pts = [a, b];
        while (pts.length < 5) {
          var n2 = -1, f2 = 150;
          sp.forEach(function (s, k) { if (pts.indexOf(k) !== -1) return; var m = Math.min.apply(null, pts.map(function (j) { return dist(center(s), center(sp[j])); })); if (m > f2) { f2 = m; n2 = k; } });
          if (n2 === -1) break;
          pts.push(n2);
        }
        st.domPoints = pts.map(function (k) { return sp[k]; });
      }
      if (st.variant === 'dom') {
        var c = -1, far = 150;
        sp.forEach(function (s, k) { if (k === a || k === b) return; var f = Math.min(dist(center(s), center(sp[a])), dist(center(s), center(sp[b]))); if (f > far) { far = f; c = k; } });
        st.domPoints = c === -1 ? [sp[a], sp[b]] : [sp[a], sp[c], sp[b]];
      }
      var ids = Array.from(members).sort(function () { return Math.random() - 0.5; }); st.teams = new Map();
      ids.forEach(function (id, k) { st.teams.set(id, st.teamList[k % 2]); });
    }
    function nearSpot(pos, s) {
      var w = pos.w || 30, h = pos.h || 74;
      return pos.x + w > s.x - 30 && pos.x < s.x + s.w + 30 && pos.y + h > s.y - 40 && pos.y < s.y + s.h + 40;
    }
    function ctfState(ev) { return { flags: Object.assign({}, st.ctf.flags), score: st.ctf.score, ev: ev || null }; }
    function domState() { return { points: st.dom.points, score: st.dom.score }; }
    function teamWinner() {
      var sc = st.ctf ? st.ctf.score : st.dom ? st.dom.score : null; if (!sc) return null;
      var top = Math.max.apply(null, Object.keys(sc).map(function (t) { return sc[t]; }));
      var lead = Object.keys(sc).filter(function (t) { return sc[t] === top; });
      return lead.length === 1 ? lead[0] : null;
    }
    function domTick() {
      if (st.phase !== 'round' || !st.dom || st.caughtSent) return;
      st.domPoints.forEach(function (s, i) {
        var pt = st.dom.points[i], here = {};
        st.teamList.forEach(function (t) { here[t] = 0; });
        Array.from(members).forEach(function (id) { var p = gameState.players.get(id), t = hsTeamOf(st, id); if (p && p.position && t && (!st.war || war.alive(st, id)) && nearSpot(p.position, s)) here[t]++; });
        var present = st.teamList.filter(function (t) { return here[t]; }), only = present.length === 1 ? present[0] : null;
        if (only && pt.owner !== only) { if (pt.by !== only) { pt.by = only; pt.prog = 0; } pt.prog++; if (pt.prog >= DOM_TICKS) { pt.owner = only; pt.prog = 0; pt.by = null; } }
        if (pt.owner) st.dom.score[pt.owner]++;
      });
      deliver('domState', domState());
      if (st.teamList.some(function (t) { return st.dom.score[t] >= DOM_WIN; })) endEarly(room, st);
    }
    function teamsObj() { var t = {}; if (st.teams) st.teams.forEach(function (v, id) { t[id] = v; }); return t; }

    /* ---- круг раунда ---- */
    function pickVariant() {
      if (classic) return 'classic';
      if (variant === 'murder') return 'murder';
      if (variant === 'team') return (st.teamLast = st.teamLast === 'ctf' ? 'dom' : 'ctf');
      if (variant === 'war') return war.pick(st, members.size);   // с ботами доступны и командные раунды, и Bro RED
      if (variant === 'adventure') return adventure.pick(st);
      st.partyLive = true;
      return party.pick(st, members.size, function () { return 'quiz'; });
    }
    function isTeamV() { return st.variant === 'ctf' || st.variant === 'dom'; }
    // раунды, где игроки делятся на команды с базами (как hsTeamVariant в server.js, кроме пиратов — у них pirateSetup)
    function basesV() { return isTeamV() || st.variant === 'tdm' || st.variant === 'cp'; }
    function startLobby() {
      if (st.phase === 'round') { award(); reveal(); }
      clearInterval(st.domTimer); clearInterval(st.chaseT);
      war.lobby(st, room); party.lobby(st, room); adventure.lobby(st, room);
      st.phase = 'lobby'; st.roundNum++; st.caughtSent = false; st.endsAt = Date.now() + LOBBY_MS;
      st.teams = null; st.bases = null; st.domPoints = null; st.ctf = null; st.dom = null; st.murderCaught = false;
      st.seekerId = null; st.seekerName = ''; st.sheriffId = null; st.sheriffName = '';
      pickMap();
      st.variant = pickVariant();
      if (st.variant === 'pirate') pirateSetup();
      if (basesV()) teamSetup();
      // Bro RED: рулетка выбирает одного (как hsSpin) — в бою он огромный и красный, остальные против него
      if (st.variant === 'bro') { var all0 = Array.from(members); st.seekerId = all0[Math.floor(Math.random() * all0.length)]; st.seekerName = gameState.players.get(st.seekerId).name; }
      // Murder Mystery: убийца и шериф — по жребию среди всех (как hsSpin), остальные невиновны
      if (st.variant === 'murder') {
        var ids = Array.from(members).sort(function () { return Math.random() - 0.5; });
        st.seekerId = ids[0]; st.sheriffId = ids[1];
        st.seekerName = gameState.players.get(ids[0]).name; st.sheriffName = gameState.players.get(ids[1]).name;
      }
      // обычные прятки: искатель по жребию (?role=seeker — всегда ты), остальные прячутся
      if (classic) {
        var all = Array.from(members), pick = /[?&]role=seeker\b/.test(location.search) ? me.id : all[Math.floor(Math.random() * all.length)];
        st.seekerId = pick; st.seekerName = gameState.players.get(pick).name;
      }
      var spots = [null].concat(st.spots).sort(function () { return Math.random() - 0.5; });
      // боты встают на старт и в лобби бегут каждый к своему укрытию (как игроки, которые прячутся)
      bots.forEach(function (b, i) {
        b.hideAt = (st.variant === 'murder' || classic) && b.id !== st.seekerId ? (spots[i % spots.length] || randomSpot()) : null;
        b.goalK = i;
        place(b, st.bases && st.teams ? st.bases[st.teams.get(b.id)] : null);
      });
      var secret = st.variant === 'murder';
      var chance = Math.round(100 / members.size);
      var pickRole = classic || st.variant === 'bro';
      deliver('hsRoulette', { players: pickRole ? Array.from(members).map(function (id) { return { id: id, name: gameState.players.get(id).name, chance: chance }; }) : [],
        winnerId: pickRole ? st.seekerId : null, teams: st.teams ? teamsObj() : null, bases: st.bases, points: st.domPoints,
        variant: st.variant, fixed: classic ? null : variant, need: classic ? 0 : MIN_PLAYERS[variant], wait: null, cops: null, duration: ROULETTE_MS,
        msLeft: st.endsAt - Date.now(), roundNum: st.roundNum, apoc: false, shop: war.tokensOn(st),
        advCls: variant === 'adventure' ? adventure.classes(st, hsMembers(room)) : null });
      if (secret) deliver('hsSecret', { role: secretRole(me.id), at: spots[spots.length - 1] });
      deliver('hsPhase', { phase: 'lobby', msLeft: LOBBY_MS, roundNum: st.roundNum, map: map(), apoc: false, voted: false, variant: st.variant });
      clearTimeout(st.timer); st.timer = setTimeout(startRound, LOBBY_MS);
    }
    function secretRole(id) { return id === st.seekerId ? 'murderer' : id === st.sheriffId ? 'sheriff' : 'innocent'; }
    function roundMs() {
      return party.isGame(st.variant) ? party.roundMs(st, members.size) : adventure.isAdv(st.variant) ? adventure.roundMs(st) : 120000;
    }
    function startRound() {
      st.phase = 'round';
      var ms = roundMs();
      st.endsAt = Date.now() + ms; st.roundStartedAt = Date.now();
      var secret = st.variant === 'murder', teamVar = isTeamV();
      var hunters = secret || classic ? [st.seekerId] : [];
      st.roundMembers = hsMembers(room).filter(function (m) { return hunters.indexOf(m.id) === -1; })
        .map(function (m) { var p = gameState.players.get(m.id); m.odo = p ? p.odo : 0; return m; });
      st.caughtSet = new Set(); st.seekerIds = new Set(hunters);
      st.startOdo = {}; Array.from(members).forEach(function (id) { st.startOdo[id] = gameState.players.get(id).odo || 0; });
      var perTeam = function (v) { var o = {}; (st.teamList || []).forEach(function (t) { o[t] = v; }); return o; };
      st.ctf = teamVar && st.variant === 'ctf' ? { flags: perTeam(null), score: perTeam(0) } : null;
      st.dom = (teamVar && st.variant === 'dom') || st.variant === 'cp' ? { points: st.domPoints.map(function () { return { owner: null, prog: 0, by: null }; }), score: perTeam(0) } : null;
      if (st.dom) st.domTimer = setInterval(domTick, 1000);
      war.start(st, room); adventure.start(st, room);
      assignGuns();
      deliver('hsPhase', { phase: 'round', msLeft: ms, seekerId: classic ? st.seekerId : null, seekerName: classic ? st.seekerName : '', seekerIds: classic ? [st.seekerId] : [], variant: st.variant, map: map(), apoc: false,
        teams: st.teams ? teamsObj() : null, bases: st.bases, points: st.domPoints, ctf: st.ctf ? ctfState() : null, dom: st.dom ? domState() : null,
        grace: secret ? MURDER_GRACE_MS : 0, war: war.state(st), adv: adventure.state(st) });
      war.spawnAll(st, room); war.tokRoundStart(st, room, members.size);
      party.start(st, room);
      clearTimeout(st.timer); st.timer = setTimeout(startLobby, ms);
    }
    function award() {
      // обычные прятки: не пойманный прячущийся и искатель, поймавший всех, получают монеты (как hsAwardRoundEnd)
      if (classic) {
        var left = (st.roundMembers || []).filter(function (m) { return !st.caughtSet.has(m.id); });
        if (me.id === st.seekerId ? !left.length : !st.caughtSet.has(me.id)) { credit(null, null, 1 + Math.floor(Math.random() * 5)); creditScore(null, null, 1); }
        return;
      }
      if (party.isGame(st.variant)) { party.award(st, room); return; }
      if (adventure.isAdv(st.variant)) { adventure.award(st, room); return; }
      if (war.isWar(st.variant) && st.war) war.award(st, room, function () { return true; });
    }
    function reveal() {
      if (war.isWar(st.variant) && war.reveal(st, room)) return;
      if (party.isGame(st.variant) && party.reveal(st, room)) return;
      if (adventure.isAdv(st.variant) && adventure.reveal(st, room)) return;
      if (isTeamV() && (st.ctf || st.dom)) { deliver('hsReveal', { variant: st.variant, winner: teamWinner(), score: (st.ctf || st.dom).score }); return; }
      if (st.variant === 'murder') {
        var free = (st.roundMembers || []).filter(function (m) { return !st.caughtSet.has(m.id); }).length;
        deliver('hsReveal', { variant: 'murder', murderer: st.seekerName, sheriff: st.sheriffName, winner: st.murderCaught ? 'sheriff' : free ? 'innocents' : 'murderer' });
      }
    }

    /* ---- Murder Mystery: поимка (как hsCatch в server.js) и боты-убийца и шериф ---- */
    function murdererCaught() {
      st.murderCaught = true;
      deliver('hsOut', { id: st.seekerId, name: st.seekerName, murderer: true, by: st.sheriffName });
      endEarly(room, st);
    }
    function doCatch(hunterId, targetId) {
      if (st.phase !== 'round' || (st.variant !== 'murder' && !classic) || st.caughtSent || st.caughtSet.has(targetId) || targetId === hunterId) return;
      if (classic) {
        if (hunterId !== st.seekerId) return;
        var h2 = gameState.players.get(hunterId), t2 = gameState.players.get(targetId);
        if (!h2 || !t2 || !h2.position || !t2.position) return;
        if (Math.abs(h2.position.x - t2.position.x) > 80 || Math.abs(h2.position.y - t2.position.y) > 120) return;
        if (hunterId === me.id && me.odo - (st.startOdo[me.id] || 0) < MIN_DIST) return;
        st.caughtSet.add(targetId);
        deliver('hsOut', { id: targetId, name: t2.name, jail: false });
        if (!(st.roundMembers || []).some(function (m) { return !st.caughtSet.has(m.id); })) endEarly(room, st);
        return;
      }
      if (hunterId === st.seekerId && Date.now() - st.roundStartedAt < MURDER_GRACE_MS) return;
      var sheriff = hunterId === st.sheriffId && !st.caughtSet.has(hunterId);
      if (sheriff) { if (targetId !== st.seekerId) return; }
      else if (hunterId !== st.seekerId) return;
      var hp = gameState.players.get(hunterId), tp = gameState.players.get(targetId);
      if (!hp || !tp || !hp.position || !tp.position) return;
      if (Math.abs(hp.position.x - tp.position.x) > 80 || Math.abs(hp.position.y - tp.position.y) > 120) return;
      if (hunterId === me.id && me.odo - (st.startOdo[me.id] || 0) < MIN_DIST) return;
      if (sheriff || targetId === st.sheriffId) { murdererCaught(); return; }
      st.caughtSet.add(targetId);
      deliver('hsOut', { id: targetId, name: tp.name, jail: false });
      if (!(st.roundMembers || []).some(function (m) { return !st.caughtSet.has(m.id); })) endEarly(room, st);
    }
    /* ---- поведение ботов: цель на каждый тик, а бегут они по физике игрока (BotPhys) ----
       Боты знают только то, что знал бы живой игрок: искатель ходит по укрытиям и гонится за тем,
       кого заметил (близко и в прямой видимости), и бежит туда, где видел его в последний раз.
       В «Войне» бойцы подбирают жетоны, покупают оружие и аптечки, держат дистанцию своего оружия,
       стреляют только по тем, кого видят, — с упреждением и небольшой ошибкой, в живом темпе;
       пираты встают к своим пушкам. В Capture the Flag носят флаг и догоняют похитителя,
       в Domination и контрольных точках идут на чужие точки. */
    var WEAPONS = ['sword', 'bow', 'fire'];
    // оружие войны — те же числа, что у игрока (WPN в game.js); range — на каком расстоянии бот держится
    var BW = {
      fist:   { cd: 360, range: 45 },
      sling:  { cd: 520, v: 0.95, g: 0.0011, life: 2500, r: 6, range: 380 },
      bomb:   { cd: 820, v: Math.hypot(0.5, 0.62), g: 0.0019, life: 1400, r: 8, boom: 130, range: 230 },
      magic:  { cd: 670, v: 1.15, g: 0, life: 2000, r: 9, range: 480 },
      cannon: { cd: 2500, v: 1.45, g: 0.0011, life: 4500, r: 11, boom: 110 }
    };
    var SEE_X = 1100, SEE_Y = 450;       // примерно экран игрока
    function bodyOf(b) {
      if (!b.ph) b.ph = { x: b.position.x, y: b.position.y, w: 30, h: 100, vx: 0, vy: 0, ground: false };
      return b.ph;
    }
    // без укрытия бот убегает в случайное место на какой-нибудь платформе карты — подальше от старта,
    // а не стоит толпой у искателя (иначе его ловят в первую же секунду раунда)
    function randomSpot() {
      var tops = (st.phys ? st.phys.solids : []).filter(function (o) { return o.w >= 40; });
      if (!tops.length) return null;
      var best = null, bd = -1;
      for (var k = 0; k < 6; k++) {
        var o = tops[Math.floor(Math.random() * tops.length)], x = o.x + Math.random() * Math.max(0, o.w - 30);
        var d = st.spawn ? Math.abs(x - st.spawn.x) + Math.abs(o.y - st.spawn.y) : 0;
        if (d > bd) { bd = d; best = { x: x, y: o.y - 100, w: 30, h: 100 }; }
      }
      return best;
    }
    function spotGoal(s2) { return s2 ? { x: s2.x + s2.w / 2 - 15, y: s2.y + s2.h - 100 } : null; }
    function ok(p) { return !!(p && p.position && isFinite(p.position.x)); }
    function posGoal(p) { return ok(p) ? { x: p.position.x, y: p.position.y } : null; }
    function ctr(q) { return { x: q.x + (q.w || 30) / 2, y: q.y + (q.h || 100) / 2 }; }
    // видит ли бот игрока: недалеко и между ними нет твёрдого
    function sees(b, t) {
      if (!ok(t) || !ok(b)) return false;
      var a = ctr(b.position), c = ctr(t.position);
      if (Math.abs(a.x - c.x) > SEE_X || Math.abs(a.y - c.y) > SEE_Y) return false;
      return !st.phys || st.phys.los(a.x, b.position.y + 25, c.x, t.position.y + 25);
    }
    function nearest(b, ids, seenOnly) {
      var best = null, bd = 1e9;
      ids.forEach(function (id) {
        var t = gameState.players.get(id);
        if (!ok(t) || (seenOnly && !sees(b, t))) return;
        var d = Math.abs(t.position.x - b.position.x) + Math.abs(t.position.y - b.position.y);
        if (d < bd) { bd = d; best = t; }
      });
      return best;
    }
    function hunting(b) {
      if (st.phase !== 'round' || st.caughtSent || !st.seekerIds) return false;
      if (b.id === st.seekerId) return classic || Date.now() - st.roundStartedAt >= MURDER_GRACE_MS;
      return st.variant === 'murder' && b.id === st.sheriffId;
    }
    function preyOf(b) {
      if (b.id === st.sheriffId) return st.caughtSet.has(st.seekerId) ? [] : [st.seekerId];
      return Array.from(members).filter(function (id) { return id !== b.id && !st.caughtSet.has(id); });
    }
    // обход: без цели бот бежит от укрытия к укрытию (иногда — на случайную платформу), к каждому — до 8 с
    function patrol(b) {
      var now = Date.now();
      if (!b.walk || now > b.walkUntil || (Math.abs(b.walk.x - b.position.x) < 40 && Math.abs(b.walk.y - b.position.y) < 120)) {
        var s2 = st.spots.length && Math.random() < 0.75 ? st.spots[Math.floor(Math.random() * st.spots.length)] : randomSpot();
        b.walk = spotGoal(s2); b.walkUntil = now + 8000;
      }
      return b.walk;
    }
    // кто кому враг — как enemies() в war.js; вне войны — другая команда
    function enemyOf(a, c) {
      if (a === c) return false;
      var ta = hsTeamOf(st, a), tc = hsTeamOf(st, c);
      if (st.war) {
        var v = st.war.v;
        if (v === 'tdm' || v === 'cp' || v === 'pirate') return !!ta && !!tc && ta !== tc;
        if (v === 'bro') return (a === st.war.bro) !== (c === st.war.bro);
        return true;
      }
      return !!ta && !!tc && ta !== tc;
    }
    function enemyIds(b) {
      return Array.from(members).filter(function (id) { return enemyOf(b.id, id) && (!st.war || war.alive(st, id)); });
    }

    /* --- командный бой --- */
    function ctfGoal(b) {
      var my = st.teams.get(b.id), other = st.teamList.filter(function (x) { return x !== my; })[0], f = st.ctf.flags;
      b.tagT = null;
      if (f[other] === b.id) return spotGoal(st.bases[my]);                      // несу флаг — домой
      if (f[my]) {                                                               // наш флаг унесли — догнать
        var c = gameState.players.get(f[my]);
        // замечает кражу не сразу (как живой игрок): иначе страж у флага отбирал бы его в тот же миг
        if (b.tagFor !== f[my]) { b.tagFor = f[my]; b.tagReady = Date.now() + 600 + Math.random() * 700; }
        if (ok(c)) { b.tagT = c; return posGoal(c); }
      } else b.tagFor = null;
      if (b.goalK % 3 === 2) {                                                   // защитник: у своей базы, гонит чужих
        var foe = nearest(b, enemyIds(b), true);
        if (foe && dist(ctr(foe.position), center(st.bases[my])) < 450) { b.tagT = foe; return posGoal(foe); }
        // стоит не на самом флаге, а чуть впереди базы — к середине карты
        var hb = center(st.bases[my]), ob = center(st.bases[other]);
        return { x: hb.x + (ob.x > hb.x ? 140 : -140) - 15, y: st.bases[my].y + st.bases[my].h - 100 };
      }
      return spotGoal(st.bases[other]);
    }
    // ближняя точка, которая не наша или которую сейчас отбивают; все наши — держит «свою» по номеру
    function domGoal(b) {
      var my = st.teams.get(b.id), pts = st.domPoints, dp = st.dom.points, c = ctr(b.position), best = -1, bd = 1e9;
      pts.forEach(function (s2, i) {
        if (dp[i].owner === my && !dp[i].by) return;
        var d = dist(center(s2), c) - (b.goalK % pts.length === i ? 250 : 0);
        if (d < bd) { bd = d; best = i; }
      });
      return spotGoal(pts[best === -1 ? b.goalK % pts.length : best]);
    }

    /* --- «Война» --- */
    function ammoOf(id) { return (st.warAmmo && st.warAmmo.ammo.get(id)) || { sling: 0, bomb: 0, magic: 0 }; }
    function bankOf(id) { return st.tok ? st.tok.bank.get(id) || 0 : 0; }
    // чем бить на расстоянии d: вплотную — кулаком, иначе тем, что есть (магия дальше и сильнее)
    function botWeapon(b, d) {
      var a = ammoOf(b.id);
      if (d < 55) return 'fist';
      if (a.bomb > 0 && d < 300) return 'bomb';
      if (a.magic > 0) return 'magic';
      if (a.sling > 0) return 'sling';
      return a.bomb > 0 ? 'bomb' : 'fist';
    }
    function botShop(b, now) {
      if (!st.war || st.phase !== 'round' || !war.alive(st, b.id) || now - (b.shopAt || 0) < 1500) return;
      b.shopAt = now;
      var n = bankOf(b.id), a = ammoOf(b.id), hp = st.war.hp.get(b.id), max = st.war.max.get(b.id) || 100;
      var item = hp < max * 0.45 && n >= 3 ? 'heal'
        : !(a.sling + a.bomb + a.magic) ? (n >= 5 ? 'magic' : n >= 3 ? 'sling' : null)
        : n >= 7 ? ['magic', 'bomb', 'shield'][b.goalK % 3] : null;
      if (item) war.buy(st, room, b.id, { item: item });
    }
    function nearToken(b, R) {
      var best = null, bd = R, c = ctr(b.position);
      ((st.tok && st.tok.items) || []).forEach(function (t) { var d = Math.abs(t.x - c.x) + Math.abs(t.y - c.y); if (d < bd) { bd = d; best = t; } });
      return best;
    }
    function botTokens(b) {
      var c = ctr(b.position);
      ((st.tok && st.tok.items) || []).slice().forEach(function (t) {
        if (Math.abs(c.x - t.x) < 80 && Math.abs(c.y - t.y) < 110) war.take(st, room, b.id, { id: t.id });
      });
    }
    function warGoal(b) {
      var w = st.war;
      b.wfoe = null;
      if (!w || st.phase !== 'round' || st.caughtSent || !war.alive(st, b.id)) return null;
      var c = ctr(b.position), foes = enemyIds(b);
      // пушкарь: стоит у своей пушки, пока враг не подошёл вплотную
      var gn = b.gun > -1 ? st.cannons[b.gun] : null;
      if (gn) {
        var close = nearest(b, foes, true);
        if (!close || Math.abs(ctr(close.position).x - c.x) > 220) { b.wfoe = nearest(b, foes, false); return { x: gn.x + gn.w / 2 - 15, y: gn.y + gn.h - 100 }; }
      }
      var foe = nearest(b, foes, true) || nearest(b, foes, false);
      b.wfoe = foe;
      var a = ammoOf(b.id), armed = a.sling + a.bomb + a.magic > 0;
      // без оружия — сначала за жетонами, с оружием — только за теми, что рядом
      var tk = nearToken(b, armed ? 260 : 1600);
      if (tk && (!foe || !armed || !sees(b, foe))) return { x: tk.x - 15, y: tk.y - 50 };
      if (w.v === 'cp' && st.dom && st.domPoints && (!foe || !sees(b, foe) || dist(ctr(foe.position), c) > 450)) return domGoal(b);
      if (!foe) return patrol(b);
      var fc = ctr(foe.position), d = Math.hypot(fc.x - c.x, fc.y - c.y), wpn = botWeapon(b, d);
      var want = BW[wpn].range * (0.85 + (b.goalK % 3) * 0.12);
      if (w.hp.get(b.id) < (w.max.get(b.id) || 100) * 0.3 && wpn !== 'fist') want *= 1.6;   // ранен — держится дальше
      if (b.id === w.bro) want = 30;                                                          // Bro RED — танк, идёт вплотную
      return { x: fc.x + (c.x < fc.x ? -1 : 1) * want - 15, y: foe.position.y };
    }
    // скорость v в точку (dx, dy): без гравитации — прямо, с ней — низкой дугой; не долетает — под 45°
    function lobVel(v, g, dx, dy) {
      if (!g) { var l = Math.hypot(dx, dy) || 1; return { vx: dx / l * v, vy: dy / l * v }; }
      var side = dx < 0 ? -1 : 1, x = Math.max(1, Math.abs(dx)), disc = v * v * v * v - g * (g * x * x - 2 * dy * v * v);
      var th = disc >= 0 ? Math.atan((v * v - Math.sqrt(disc)) / (g * x)) : Math.PI / 4;
      return { vx: side * Math.cos(th) * v, vy: -Math.sin(th) * v };
    }
    // ошибка прицела, как у живого игрока: поворот на случайный угол до ±a
    function jitter(v, a) {
      var r = (Math.random() - 0.5) * 2 * a, cs = Math.cos(r), sn = Math.sin(r);
      return { vx: v.vx * cs - v.vy * sn, vy: v.vx * sn + v.vy * cs };
    }
    var vOf = {};
    // куда стрелять: туда, где цель будет через время полёта (по её скорости бега)
    function lead(t, ms) {
      var c = ctr(t.position), v = vOf[t.id];
      return v ? { x: c.x + v.vx * Math.min(ms, 1500) * 0.8, y: c.y } : c;
    }
    var bshots = [], shotK = 0;
    function botFire(b, now) {
      var w = st.war, foe = b.wfoe;
      if (!w || st.caughtSent || !war.alive(st, b.id) || !ok(foe) || !war.alive(st, foe.id) || now < (b.readyAt || 0)) return;
      var c = ctr(b.position), fc = ctr(foe.position), sx = c.x, sy = b.position.y + 38, sid;
      var gn = b.gun > -1 ? st.cannons[b.gun] : null;
      if (gn) {
        var gx = gn.x + gn.w / 2, gy = gn.y + gn.h / 2;
        if (Math.abs(c.x - gx) <= 95 && Math.abs(c.y - gy) <= 115 && now - (w.guns.get(b.gun) || 0) > BW.cannon.cd + 200) {
          var lc = lead(foe, Math.hypot(fc.x - gx, fc.y - gy) / BW.cannon.v);
          var vc = jitter(lobVel(BW.cannon.v, BW.cannon.g, lc.x - gx, lc.y - gy), 0.04);
          var before = w.guns.get(b.gun) || 0;
          sid = ++shotK;
          war.shot(st, room, sockOf(b.id), { w: 'cannon', c: b.gun, sid: sid, vx: vc.vx, vy: vc.vy });
          if ((w.guns.get(b.gun) || 0) !== before) bshots.push({ by: b.id, sid: sid, w: 'cannon', x: gx, y: gy, vx: vc.vx, vy: vc.vy, age: 0 });
          b.readyAt = now + 500;
          return;
        }
      }
      if (!sees(b, foe)) return;
      var d = Math.hypot(fc.x - c.x, fc.y - c.y), wpn = botWeapon(b, d), W = BW[wpn], dir = fc.x >= c.x ? 1 : -1;
      sid = ++shotK;
      if (wpn === 'fist') {
        if (Math.abs(fc.x - c.x) > 70 || Math.abs(fc.y - c.y) > 80) return;
        war.shot(st, room, sockOf(b.id), { w: 'fist', sid: sid, x: Math.round(sx), y: Math.round(sy), vx: 0, vy: 0, dir: dir });
        war.hit(st, room, b.id, { t: foe.id, sid: sid });
      } else {
        if (d > W.range * 2.6) return;
        var lp = lead(foe, d / W.v), v = jitter(lobVel(W.v, W.g, lp.x - sx, lp.y - sy), 0.07), left = ammoOf(b.id)[wpn];
        war.shot(st, room, sockOf(b.id), { w: wpn, sid: sid, x: Math.round(sx), y: Math.round(sy), vx: v.vx, vy: v.vy, dir: dir });
        if (ammoOf(b.id)[wpn] === left) return;                    // не принят (перезарядка) — снаряда нет
        bshots.push({ by: b.id, sid: sid, w: wpn, x: sx, y: sy, vx: v.vx, vy: v.vy, age: 0 });
      }
      b.readyAt = now + W.cd * 1.25 + 120 + Math.random() * 300;    // живой темп, а не пулемёт
    }
    // снаряды ботов летят здесь (у игрока — в game.js): попали во врага — war.hit, как от клиента
    function victimAt(s, r) {
      var ids = Array.from(members);
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i], p = gameState.players.get(id);
        if (id === s.by || !ok(p) || !war.alive(st, id) || !enemyOf(s.by, id)) continue;
        var q = p.position, qw = q.w || 30, qh = q.h || 100;
        if (s.x + r > q.x && s.x - r < q.x + qw && s.y + r > q.y && s.y - r < q.y + qh) return id;
      }
      return null;
    }
    function boomAt(s) {
      Array.from(members).forEach(function (id) {
        var p = gameState.players.get(id);
        if (id === s.by || !ok(p) || !war.alive(st, id) || !enemyOf(s.by, id)) return;
        var c = ctr(p.position);
        if (Math.hypot(c.x - s.x, c.y - s.y) <= BW[s.w].boom) war.hit(st, room, s.by, { t: id, sid: s.sid, x: Math.round(s.x), y: Math.round(s.y) });
      });
    }
    function stepBotShots(dt) {
      if (!st.war || st.phase !== 'round') { bshots = []; return; }
      bshots = bshots.filter(function (s) {
        var W = BW[s.w], steps = Math.max(1, Math.ceil(Math.hypot(s.vx, s.vy) * dt / 8));
        for (var k = 0; k < steps; k++) {
          var h = dt / steps;
          s.vy += W.g * h; s.x += s.vx * h; s.y += s.vy * h; s.age += h;
          var end = s.age > W.life || st.phys.solidAt(s.x, s.y), t = end ? null : victimAt(s, W.r);
          if (end || t) {
            if (W.boom) boomAt(s); else if (t) war.hit(st, room, s.by, { t: t, sid: s.sid });
            return false;
          }
        }
        return true;
      });
    }
    // «Пиратская война»: у каждой пушки — пушкарь из той команды, к чьей базе пушка ближе (не больше половины команды)
    function assignGuns() {
      bots.forEach(function (b) { b.gun = -1; });
      if (st.variant !== 'pirate' || !st.bases || !st.teams) return;
      st.cannons.forEach(function (g, i) {
        var team = null, bd = 1e9;
        st.teamList.forEach(function (t) { var d = dist(center(st.bases[t]), center(g)); if (d < bd) { bd = d; team = t; } });
        var mine = bots.filter(function (b) { return st.teams.get(b.id) === team; });
        var free = mine.filter(function (b) { return b.gun === -1; });
        if (free.length && mine.length - free.length < Math.ceil(mine.length / 2)) free[0].gun = i;
      });
    }

    function goalOf(b) {
      if (st.adv) {
        var a = st.adv;
        if (st.phase !== 'round' || a.over || (a.down && a.down.has(b.id))) return null;
        var e = null, ed = 1e9;
        a.en.forEach(function (x) { if (x.hp > 0) { var d = Math.abs(x.x - b.position.x) + Math.abs(x.floorY - (b.position.y + 100)) * 3; if (d < ed) { ed = d; e = x; } } });
        b.foe = e;
        return e ? { x: e.x - 15 + (b.position.x + 15 < e.x ? -60 : 60), y: e.floorY - 100 } : null;
      }
      if (st.caughtSet && st.caughtSet.has(b.id) && st.phase === 'round') return null;
      if (st.variant === 'murder' || classic) {
        if (hunting(b)) {
          var t = nearest(b, preyOf(b), true);
          if (t) { b.prey = t; b.lastSeen = posGoal(t); return b.lastSeen; }
          b.prey = null;
          // потерял из виду — бежит туда, где видел в последний раз, потом снова обходит укрытия
          if (b.lastSeen && Math.abs(b.lastSeen.x - b.position.x) + Math.abs(b.lastSeen.y - b.position.y) > 50) return b.lastSeen;
          b.lastSeen = null;
          return patrol(b);
        }
        if (st.phase === 'round' && classic && st.seekerId) {          // искатель заметил — убегаем от него
          var sk = gameState.players.get(st.seekerId);
          if (ok(sk) && Math.abs(sk.position.x - b.position.x) < 420 && Math.abs(sk.position.y - b.position.y) < 200 && sees(b, sk))
            return { x: b.position.x + (b.position.x >= sk.position.x ? 500 : -500), y: b.position.y };
        }
        return spotGoal(b.hideAt);
      }
      if (war.isWar(st.variant)) return warGoal(b);
      if (st.teams && st.bases && st.phase === 'round') {
        if (st.ctf) return ctfGoal(b);
        if (st.dom && st.domPoints && st.domPoints.length) return domGoal(b);
      }
      return null;
    }
    function botTick() {
      if (!st.phys || !sock.connected) return;
      var now = Date.now(), dt = Math.max(16, Math.min(250, now - (st.botAt || now - 100)));
      st.botAt = now;
      // скорость каждого — для упреждения (lead)
      Array.from(members).forEach(function (id) {
        var p = gameState.players.get(id);
        if (!ok(p)) return;
        var c = ctr(p.position), o = vOf[id];
        vOf[id] = { x: c.x, y: c.y, vx: o ? (c.x - o.x) / dt : 0, vy: o ? (c.y - o.y) / dt : 0 };
      });
      var home = st.spawn ? { x: st.spawn.x, y: st.spawn.y } : null, fight = !!st.war && st.phase === 'round';
      bots.forEach(function (b) {
        if (fight && !war.alive(st, b.id)) return;                 // выбит — стоит до warUp
        var ph = bodyOf(b), px = ph.x, py = ph.y;
        if (fight) botShop(b, now);
        st.phys.seek(ph, goalOf(b), dt, home);
        b.position = { x: Math.round(ph.x), y: Math.round(ph.y), w: 30, h: 100 };
        var mv = Math.hypot(ph.x - px, ph.y - py);
        if (mv < 400) b.odo += mv;
        if (fight) {
          war.track(st, b.id, b.position);
          if (st.phys.touchBad(ph)) war.hazard(st, room, b.id);
          botTokens(b);
          botFire(b, now);
        }
        if (st.ctf && st.phase === 'round') {
          st.teamList.forEach(function (t) { ctfTouchFor(b.id, t); });
          if (ok(b.tagT) && Date.now() >= (b.tagReady || 0) && Math.abs(b.tagT.position.x - b.position.x) < 60 && Math.abs(b.tagT.position.y - b.position.y) < 110) ctfTagFor(b.id, b.tagT.id);
        }
        // охотник коснулся цели — поимка по правилам режима (doCatch)
        if (b.prey && hunting(b) && b.prey.position && Math.abs(b.prey.position.x - b.position.x) < 50 && Math.abs(b.prey.position.y - b.position.y) < 110) doCatch(b.id, b.prey.id);
        if (st.adv && b.foe && st.phase === 'round') { b.sid = (b.sid || 0) + 1; WEAPONS.forEach(function (w) { adventure.hit(st, room, b.id, { w: w, e: b.foe.id, sid: b.sid }); }); }
      });
      stepBotShots(dt);
    }
    var botT = setInterval(botTick, 100);

    /* ---- боты ---- */
    function botSees(id, ev, d) {
      var b = gameState.players.get(id);
      if (!b || !b.bot) return;
      if (ev === 'warSpawn' && d) { place(b, d.at); return; }
      if (ev === 'party' && d) botParty(b, d);
    }
    // то, что рассылается всей комнате: бот вернулся в бой (warUp) и отброс от удара (warHp)
    function roomSees(ev, d) {
      var b = d && gameState.players.get(d.id);
      if (!b || !b.bot) return;
      if (ev === 'warUp') place(b, d.at);
      else if (ev === 'warHp' && b.ph && (d.kx || d.ky)) { b.ph.kx = d.kx || 0; b.ph.vy = Math.min(b.ph.vy, d.ky || 0); b.ph.ground = false; }
    }
    function later(b, ms, fn) { setTimeout(function () { if (st.phase === 'round' && st.party) fn(); }, ms); }
    function botParty(b, s) {
      var p = st.party;
      if (!p) return;
      var key = s.g + ':' + s.stage + ':' + (s.n || s.k || 0);
      if (b.k === key) return;
      if (s.g === 'quiz' && s.stage === 'q' && s.mine === -1) {
        b.k = key;
        later(b, 2000 + Math.random() * 6000, function () { party.answer(st, room, b.id, { i: Math.random() < 0.65 ? p.cur.right : Math.floor(Math.random() * 4) }); });
      } else if (s.g === 'guess' && s.stage === 'draw') {
        b.k = key;
        if (s.drawer === b.id) {
          for (var k = 0; k < 5; k++) (function (k) {
            later(b, 1500 + k * 2500, function () {
              var pts = [], x = 40 + Math.random() * 200, y = 40 + Math.random() * 120;
              for (var i = 0; i < 6; i++) { pts.push(Math.round(x), Math.round(y)); x += (Math.random() - 0.5) * 80; y += (Math.random() - 0.5) * 60; }
              party.draw(st, room, sockOf(b.id), { n: true, c: k % 4, w: 0, p: pts });
            });
          })(k);
        } else if (Math.random() < 0.7) {
          later(b, 8000 + Math.random() * 30000, function () { party.guess(st, room, b.id, { t: p.word.en[0] }); });
        }
      } else if (s.g === 'build' && s.stage === 'build') {
        b.k = key;
        later(b, 6000 + Math.random() * 15000, function () {
          var n = (s.size || 12) * (s.size || 12), px = '';
          for (var i = 0; i < n; i++) px += Math.random() < 0.4 ? String(Math.floor(Math.random() * 10)) : '.';
          party.build(st, room, b.id, { px: px.indexOf('.') === 0 && !/[0-9]/.test(px) ? '5' + px.slice(1) : px });
        });
      } else if (s.g === 'build' && s.stage === 'vote' && !s.own && !s.myVote) {
        b.k = key;
        later(b, 1000 + Math.random() * 3000, function () { party.vote(st, room, b.id, { s: 1 + Math.floor(Math.random() * 5) }); });
      }
    }

    /* ---- что видит клиент: бот-«игроки» и их положение ---- */
    function playersList() {
      return Array.from(members).map(function (id) { var p = gameState.players.get(id); return { id: p.id, name: p.name, nid: p.nid, position: p.position || {} }; });
    }
    /* Цвет модели бота — так же, как свой цвет красит себе живой игрок (applyColor в game.js) и
       присылает на сервер: синий искатель и оранжевый пойманный в прятках, цвет команды в командных. */
    var COLOR = { normal: '#000000', seeker: '#1e6fe0', caught: '#f97316', team: { red: '#dc2626', blue: '#2563eb', green: '#16a34a', yellow: '#ca8a04' } };
    function botColor(b) {
      if (st.teams && st.teams.get(b.id) && COLOR.team[st.teams.get(b.id)]) return COLOR.team[st.teams.get(b.id)];
      if (st.phase === 'round' && classic) {
        if (b.id === st.seekerId) return COLOR.seeker;
        if (st.caughtSet && st.caughtSet.has(b.id)) return COLOR.caught;
      }
      return COLOR.normal;
    }
    var snapT = setInterval(function () {
      if (!sock.connected) { clearInterval(snapT); return; }
      deliver('state', bots.map(function (b) { return { n: b.nid, x: b.position.x, y: b.position.y, w: 30, h: 100, c: botColor(b) }; }));
    }, 100);

    function join() {
      deliver('nameFixed', { name: me.name });
      deliver('playersList', playersList());
      deliver('hsState', { phase: 'lobby', msLeft: LOBBY_MS, roundNum: 0, seekerId: null, seekerName: '', map: null, broId: null, seekerIds: [], out: [],
        variant: 'classic', role: null, teams: null, bases: null, points: null, ctf: null, dom: null, apoc: false, vote: null,
        fixed: classic ? null : variant, need: classic ? 0 : MIN_PLAYERS[variant], wait: null, advCls: variant === 'adventure' ? adventure.classes(st, hsMembers(room)) : null });
      startLobby();
    }

    /* ---- события игрока ---- */
    function on(ev, d) {
      switch (ev) {
        case 'movePlayer': {
          var pos = d && d.position; if (!pos) return true;
          if (me.position) { var dd = Math.hypot(pos.x - me.position.x, pos.y - me.position.y); if (dd <= 400) me.odo += dd; }
          me.position = pos; war.track(st, me.id, pos); return true;
        }
        case 'hsCatch': doCatch(me.id, String(d && d.targetId || '')); return true;
        case 'ctfTouch': ctfTouch(d); return true;
        case 'ctfTag': ctfTag(d); return true;
        case 'warShot': war.shot(st, room, sockOf(me.id), d); return true;
        case 'warHit': war.hit(st, room, me.id, d); return true;
        case 'warHazard': war.hazard(st, room, me.id); return true;
        case 'tokTake': war.take(st, room, me.id, d); return true;
        case 'shopBuy': war.buy(st, room, me.id, d); return true;
        case 'partyAns': party.answer(st, room, me.id, d); return true;
        case 'partyGuess': party.guess(st, room, me.id, d); return true;
        case 'partyDraw': party.draw(st, room, sockOf(me.id), d); return true;
        case 'partyClear': party.clearBoard(st, room, me.id); return true;
        case 'partyBuild': party.build(st, room, me.id, d); return true;
        case 'partyVote': party.vote(st, room, me.id, d); return true;
        case 'advHit': adventure.hit(st, room, me.id, d); return true;
        case 'advShot': adventure.shot(st, room, sockOf(me.id), d); return true;
        case 'advHeal': adventure.heal(st, room, me.id); return true;
        case 'advClass': adventure.pickClass(st, room, me.id, d); return true;
        default: return false;
      }
    }
    // флаг: взять чужой у его базы, принести к своей (когда свой дома) — для игрока и ботов
    function ctfTouch(d) { ctfTouchFor(me.id, d && d.team); }
    function ctfTouchFor(id, t0) {
      var p = gameState.players.get(id);
      if (st.phase !== 'round' || !st.ctf || st.caughtSent || !p || !p.position) return;
      var my = hsTeamOf(st, id), team = st.teamList.indexOf(t0) !== -1 ? t0 : null;
      if (!my || !team || p.odo - (st.startOdo[id] || 0) < MIN_DIST) return;
      var f = st.ctf.flags, carried = st.teamList.filter(function (t) { return f[t] === id; })[0] || null;
      if (team !== my) {
        if (f[team] || carried || !nearSpot(p.position, st.bases[team])) return;
        f[team] = id; deliver('ctfState', ctfState({ ev: 'take', team: team, name: p.name })); return;
      }
      if (!carried || f[my] || !nearSpot(p.position, st.bases[my])) return;
      f[carried] = null; st.ctf.score[my]++;
      deliver('ctfState', ctfState({ ev: 'capture', team: my, name: p.name }));
      if (st.ctf.score[my] >= CTF_WIN) endEarly(room, st);
    }
    // догнал того, кто несёт твой флаг, — флаг возвращается домой
    function ctfTag(d) { ctfTagFor(me.id, String(d && d.targetId || '')); }
    function ctfTagFor(id, tid) {
      var p = gameState.players.get(id);
      if (st.phase !== 'round' || !st.ctf || st.caughtSent || !p || !p.position) return;
      var my = hsTeamOf(st, id), t = gameState.players.get(tid);
      if (!my || !t || st.ctf.flags[my] !== tid || !t.position) return;
      if (Math.abs(p.position.x - t.position.x) > 80 || Math.abs(p.position.y - t.position.y) > 120) return;
      st.ctf.flags[my] = null; deliver('ctfState', ctfState({ ev: 'return', team: my, name: p.name }));
    }
    function stop() { clearInterval(st.domTimer); clearInterval(st.chaseT); clearInterval(botT); clearTimeout(st.timer); clearInterval(snapT); party.lobby(st, room); adventure.lobby(st, room); war.lobby(st, room); }
    return loadMaps().then(function (r) { recs = r; return { join: join, on: on, stop: stop, st: st, me: me, bots: bots, gameState: gameState, next: startLobby }; });
  }

  /* o: { sock, fire, name, variant, api: BFOffline, raw: настоящий fetch } — обещание с контроллером комнаты */
  window.BFOfflineModes = {
    has: function (variant) { return Object.prototype.hasOwnProperty.call(MIN_PLAYERS, variant); },
    start: function (o) { return loadMods(o.raw).then(function (mods) { return create(o, mods); }).then(function (c) { window.BFOfflineModes.room = c; return c; }); }
  };
})();
