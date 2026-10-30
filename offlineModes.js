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
     В «Приключении» они союзники: сами идут к врагам и бьют их (см. botFight). */
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
          if (target === room || target === me.id) deliver(ev, d);
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
      st.apoc = false;
      var sp = list.filter(function (x) { return x && x.type === 'spawn'; })[0];
      st.spawn = sp ? { x: +sp.x, y: +sp.y } : { x: 100, y: 100 };
    }
    function place(b, at) {
      var base = at && isFinite(+at.x) ? at : st.spawn;
      b.position = { x: +base.x + (at && at.w ? at.w / 2 - 15 : 0) + Math.round((Math.random() - 0.5) * 60), y: +base.y + (at && at.h ? at.h - 100 : 0), w: 30, h: 100 };
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
        Array.from(members).forEach(function (id) { var p = gameState.players.get(id), t = hsTeamOf(st, id); if (p && p.position && t && nearSpot(p.position, s)) here[t]++; });
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
      if (variant === 'war') return war.pick(st, 2);          // 2, чтобы в круг не попали варианты, которым нужны 4 игрока
      if (variant === 'adventure') return adventure.pick(st);
      st.partyLive = true;
      return party.pick(st, members.size, function () { return 'quiz'; });
    }
    function isTeamV() { return st.variant === 'ctf' || st.variant === 'dom'; }
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
      if (isTeamV()) teamSetup();
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
      bots.forEach(function (b, i) { place(b, st.bases && st.teams ? st.bases[st.teams.get(b.id)] : (st.variant === 'murder' || (classic && b.id !== st.seekerId)) ? spots[i % spots.length] : null); });
      var secret = st.variant === 'murder';
      var chance = Math.round(100 / members.size);
      deliver('hsRoulette', { players: classic ? Array.from(members).map(function (id) { return { id: id, name: gameState.players.get(id).name, chance: chance }; }) : [],
        winnerId: classic ? st.seekerId : null, teams: st.teams ? teamsObj() : null, bases: st.bases, points: st.domPoints,
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
      st.dom = teamVar && st.variant === 'dom' ? { points: st.domPoints.map(function () { return { owner: null, prog: 0, by: null }; }), score: perTeam(0) } : null;
      if (st.dom) st.domTimer = setInterval(domTick, 1000);
      war.start(st, room); adventure.start(st, room);
      deliver('hsPhase', { phase: 'round', msLeft: ms, seekerId: classic ? st.seekerId : null, seekerName: classic ? st.seekerName : '', seekerIds: classic ? [st.seekerId] : [], variant: st.variant, map: map(), apoc: false,
        teams: st.teams ? teamsObj() : null, bases: st.bases, points: st.domPoints, ctf: st.ctf ? ctfState() : null, dom: st.dom ? domState() : null,
        grace: secret ? MURDER_GRACE_MS : 0, war: war.state(st), adv: adventure.state(st) });
      war.spawnAll(st, room); war.tokRoundStart(st, room, members.size);
      party.start(st, room);
      if (secret || classic) st.chaseT = setInterval(botChase, 200);
      if (st.adv) st.chaseT = setInterval(botFight, 200);
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
    // бот-убийца и бот-шериф идут по полу к цели (физики у ботов нет — ходят вдоль своей линии) и «касаются»
    function botChase() {
      if (st.phase !== 'round' || st.caughtSent) return;
      bots.forEach(function (b) {
        if (st.caughtSet.has(b.id)) return;
        var targetIds = b.id === st.seekerId ? Array.from(members).filter(function (id) { return id !== b.id && !st.caughtSet.has(id); })
          : b.id === st.sheriffId && !st.caughtSet.has(b.id) ? [st.seekerId] : [];
        if (b.id === st.seekerId && !classic && Date.now() - st.roundStartedAt < MURDER_GRACE_MS) return;
        var best = null, bd = 1e9;
        targetIds.forEach(function (id) { var t = gameState.players.get(id); if (t && t.position) { var d = Math.abs(t.position.x - b.position.x); if (d < bd) { bd = d; best = t; } } });
        if (!best) return;
        b.position.x += Math.max(-36, Math.min(36, best.position.x - b.position.x));
        if (Math.abs(best.position.x - b.position.x) < 50 && Math.abs(best.position.y - b.position.y) < 110) doCatch(b.id, best.id);
      });
    }

    /* ---- «Приключение»: боты-союзники идут к ближайшему врагу (своего этажа — в первую очередь) и бьют его.
       Урон, перезарядку, дальность оружия и «упал — встал» считает сам adventure.js, как для игрока. ---- */
    var WEAPONS = ['sword', 'bow', 'fire'];
    function botFight() {
      var a = st.adv;
      if (st.phase !== 'round' || !a || a.over) return;
      bots.forEach(function (b) {
        if (a.down && a.down.has(b.id)) return;
        var best = null, bd = 1e9;
        a.en.forEach(function (e) {
          if (!(e.hp > 0)) return;
          var d = Math.abs(e.x - (b.position.x + 15)) + Math.abs(e.floorY - (b.position.y + 100)) * 3;
          if (d < bd) { bd = d; best = e; }
        });
        if (!best) return;
        b.position.y = best.floorY - 100;
        var want = best.x - 15 + (b.position.x + 15 < best.x ? -70 : 70);
        b.position.x += Math.max(-26, Math.min(26, want - b.position.x));
        b.sid = (b.sid || 0) + 1;
        WEAPONS.forEach(function (w) { adventure.hit(st, room, b.id, { w: w, e: best.id, sid: b.sid }); });
      });
    }

    /* ---- боты ---- */
    function botSees(id, ev, d) {
      var b = gameState.players.get(id);
      if (!b || !b.bot) return;
      if ((ev === 'warSpawn' || ev === 'warUp') && d && d.at) { place(b, d.at); return; }
      if (ev === 'party' && d) botParty(b, d);
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
    var snapT = setInterval(function () {
      if (!sock.connected) { clearInterval(snapT); return; }
      deliver('state', bots.map(function (b) { return { n: b.nid, x: b.position.x, y: b.position.y, w: 30, h: 100 }; }));
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
    function ctfTouch(d) {
      if (st.phase !== 'round' || !st.ctf || st.caughtSent || !me.position) return;
      var my = hsTeamOf(st, me.id), team = d && st.teamList.indexOf(d.team) !== -1 ? d.team : null;
      if (!my || !team || me.odo - (st.startOdo[me.id] || 0) < MIN_DIST) return;
      var f = st.ctf.flags, carried = st.teamList.filter(function (t) { return f[t] === me.id; })[0] || null;
      if (team !== my) {
        if (f[team] || carried || !nearSpot(me.position, st.bases[team])) return;
        f[team] = me.id; deliver('ctfState', ctfState({ ev: 'take', team: team, name: me.name })); return;
      }
      if (!carried || f[my] || !nearSpot(me.position, st.bases[my])) return;
      f[carried] = null; st.ctf.score[my]++;
      deliver('ctfState', ctfState({ ev: 'capture', team: my, name: me.name }));
      if (st.ctf.score[my] >= CTF_WIN) endEarly(room, st);
    }
    function ctfTag(d) {
      if (st.phase !== 'round' || !st.ctf || st.caughtSent || !me.position) return;
      var my = hsTeamOf(st, me.id), tid = String(d && d.targetId || ''), t = gameState.players.get(tid);
      if (!my || !t || st.ctf.flags[my] !== tid || !t.position) return;
      if (Math.abs(me.position.x - t.position.x) > 80 || Math.abs(me.position.y - t.position.y) > 120) return;
      st.ctf.flags[my] = null; deliver('ctfState', ctfState({ ev: 'return', team: my, name: me.name }));
    }
    function stop() { clearInterval(st.domTimer); clearInterval(st.chaseT); clearTimeout(st.timer); clearInterval(snapT); party.lobby(st, room); adventure.lobby(st, room); war.lobby(st, room); }
    return loadMaps().then(function (r) { recs = r; return { join: join, on: on, stop: stop, st: st, me: me, bots: bots, gameState: gameState }; });
  }

  /* o: { sock, fire, name, variant, api: BFOffline, raw: настоящий fetch } — обещание с контроллером комнаты */
  window.BFOfflineModes = {
    has: function (variant) { return Object.prototype.hasOwnProperty.call(MIN_PLAYERS, variant); },
    start: function (o) { return loadMods(o.raw).then(function (mods) { return create(o, mods); }).then(function (c) { window.BFOfflineModes.room = c; return c; }); }
  };
})();
