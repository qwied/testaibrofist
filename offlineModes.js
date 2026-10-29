/* AIBrofist local runtime, часть 2: отдельные режимы «Война», «Вечеринка» и «Приключение» в песочнице
   (offline.js), где нет сервера — например, на GitHub Pages. Настоящие модули war.js, party.js и
   adventure.js — те же файлы, что на сервере, — запускаются здесь же, в браузере, с поддельным io:
   всё, что они «рассылают», доходит до единственного игрока, а соперников изображают боты.
   Круг раунда тот же, что в server.js: лобби с рулеткой → раунд → итог → снова лобби (hsStartLobby,
   hsStartRound). Подключается со страницы игры после offline.js. */
(function () {
  'use strict';
  if (window.BFOfflineModes) return;

  var MIN_PLAYERS = { war: 2, party: 2, adventure: 1 };
  var BOTS = { war: ['Bot A', 'Bot B', 'Bot C'], party: ['Bot A', 'Bot B', 'Bot C'], adventure: [] };
  var BUILTIN = { war: ['piratebay.json'], party: ['broarena.json'], adventure: ['brotower.json', 'crystaldefense.json'] };
  var LOBBY_MS = 9000, ROULETTE_MS = 3500;

  var modsP = null;
  function loadMods(raw) {
    if (modsP) return modsP;
    var cache = {};
    var req = function (name) { if (name === './party.js') return cache.party; throw new Error('require ' + name); };
    var run = function (file) {
      return raw(file).then(function (r) { if (!r.ok) throw new Error(file + ' ' + r.status); return r.text(); }).then(function (src) {
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
    var room = 'hideAndSeek:' + variant + '-1';
    var gameState = { players: new Map(), rooms: new Map() };
    var members = new Set();
    gameState.rooms.set(room, members);
    var nidK = 1;
    var me = { id: sock.id, name: o.name, nid: nidK++, position: null, odo: 0, room: room, bot: false };
    gameState.players.set(me.id, me); members.add(me.id);
    var bots = BOTS[variant].map(function (n, i) {
      var b = { id: 'local-bot-' + (i + 1), name: n, nid: nidK++, position: { x: 0, y: 0, w: 30, h: 100 }, odo: 0, room: room, bot: true, k: '' };
      gameState.players.set(b.id, b); members.add(b.id);
      return b;
    });

    var st = { phase: 'lobby', roundNum: 0, variant: 'classic', fixedVariant: variant, endsAt: 0, map: null, mapData: null,
      spots: [], cannons: [], advMap: null, apoc: false, hasPoison: false, caughtSet: new Set(), caughtSent: false,
      seekerIds: new Set(), seekerId: null, seekerName: '', teams: null, teamList: null, bases: null, domPoints: null, timer: null };

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
    var deps = { io: io, gameState: gameState, hsMembers: hsMembers, hsTeamOf: hsTeamOf, sessionName: function () { return null; },
      credit: function () {}, creditScore: function () {}, endEarly: endEarly };
    var party = mods.party(deps), adventure = mods.adventure(deps), war = mods.war(deps);
    var map = function () { return st.map ? { author: st.map.author, mapName: st.map.mapName } : null; };

    /* ---- карты: встроенные уровни режима (builtinMaps/) кладём в карты песочницы ---- */
    function loadMaps() {
      return Promise.all(BUILTIN[variant].map(function (f) {
        return o.raw('builtinMaps/' + f).then(function (r) { return r.json(); }).then(function (data) {
          var name = { 'piratebay.json': 'Pirate Bay', 'broarena.json': 'Bro Arena', 'brotower.json': 'Bro Tower', 'crystaldefense.json': 'Crystal Defense' }[f];
          var rec = api.findMap('qwied', name);
          if (!rec) { rec = { mapName: name, author: 'qwied', mapType: 'hideAndSeek', date: Date.now(), rating: 5, likes: 0, dislikes: 0, commentCount: 0,
            comments: [], votes: {}, favorites: {}, inGameModes: [], mapData: data }; api.maps.push(rec); }
          return rec;
        });
      }));
    }
    var recs = [], mapK = 0;
    function pickMap() {
      var pool = recs.filter(function (r) { return variant !== 'adventure' || adventure.parseMap(r.mapData && r.mapData.adv); });
      var rec = pool[mapK++ % pool.length];
      st.map = { author: rec.author, mapName: rec.mapName };
      var list = (rec.mapData && rec.mapData.objects) || [];
      st.mapData = rec.mapData;
      st.spots = list.filter(function (x) { return x && x.hideSpot === true; }).slice(0, 60).map(function (x) { return { x: +x.x, y: +x.y, w: +x.w || 1, h: +x.h || 1 }; });
      st.cannons = list.filter(function (x) { return x && x.type === 'cannon'; }).slice(0, 24).map(function (x) { return { x: +x.x, y: +x.y, w: 72, h: 44, aim: +x.aim || 0 }; });
      st.advMap = adventure.parseMap(rec.mapData && rec.mapData.adv);
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
    function teamsObj() { var t = {}; if (st.teams) st.teams.forEach(function (v, id) { t[id] = v; }); return t; }

    /* ---- круг раунда ---- */
    function pickVariant() {
      if (variant === 'war') return war.pick(st, 2);          // 2, чтобы в круг не попали варианты, которым нужны 4 игрока
      if (variant === 'adventure') return adventure.pick(st);
      st.partyLive = true;
      return party.pick(st, members.size, function () { return 'quiz'; });
    }
    function startLobby() {
      if (st.phase === 'round') { award(); reveal(); }
      war.lobby(st, room); party.lobby(st, room); adventure.lobby(st, room);
      st.phase = 'lobby'; st.roundNum++; st.caughtSent = false; st.endsAt = Date.now() + LOBBY_MS;
      st.teams = null; st.bases = null;
      pickMap();
      st.variant = pickVariant();
      if (war.isWar(st.variant) && st.variant === 'pirate') pirateSetup();
      bots.forEach(function (b) { place(b, st.bases && st.teams ? st.bases[st.teams.get(b.id)] : null); });
      deliver('hsRoulette', { players: [], winnerId: null, teams: st.teams ? teamsObj() : null, bases: st.bases, points: null,
        variant: st.variant, fixed: variant, need: MIN_PLAYERS[variant], wait: null, cops: null, duration: ROULETTE_MS,
        msLeft: st.endsAt - Date.now(), roundNum: st.roundNum, apoc: false, shop: war.tokensOn(st),
        advCls: variant === 'adventure' ? adventure.classes(st, hsMembers(room)) : null });
      deliver('hsPhase', { phase: 'lobby', msLeft: LOBBY_MS, roundNum: st.roundNum, map: map(), apoc: false, voted: false, variant: st.variant });
      clearTimeout(st.timer); st.timer = setTimeout(startRound, LOBBY_MS);
    }
    function roundMs() {
      return party.isGame(st.variant) ? party.roundMs(st, members.size) : adventure.isAdv(st.variant) ? adventure.roundMs(st) : 120000;
    }
    function startRound() {
      st.phase = 'round';
      var ms = roundMs();
      st.endsAt = Date.now() + ms; st.roundStartedAt = Date.now();
      st.roundMembers = hsMembers(room).map(function (m) { var p = gameState.players.get(m.id); m.odo = p ? p.odo : 0; return m; });
      st.caughtSet = new Set(); st.seekerIds = new Set();
      war.start(st, room); adventure.start(st, room);
      deliver('hsPhase', { phase: 'round', msLeft: ms, seekerId: null, seekerName: '', seekerIds: [], variant: st.variant, map: map(), apoc: false,
        teams: st.teams ? teamsObj() : null, bases: st.bases, points: null, ctf: null, dom: null, grace: 0, war: war.state(st), adv: adventure.state(st) });
      war.spawnAll(st, room); war.tokRoundStart(st, room, members.size);
      party.start(st, room);
      clearTimeout(st.timer); st.timer = setTimeout(startLobby, ms);
    }
    function award() {
      if (party.isGame(st.variant)) { party.award(st, room); return; }
      if (adventure.isAdv(st.variant)) { adventure.award(st, room); return; }
      if (war.isWar(st.variant) && st.war) war.award(st, room, function () { return true; });
    }
    function reveal() {
      if (war.isWar(st.variant) && war.reveal(st, room)) return;
      if (party.isGame(st.variant) && party.reveal(st, room)) return;
      if (adventure.isAdv(st.variant) && adventure.reveal(st, room)) return;
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
        fixed: variant, need: MIN_PLAYERS[variant], wait: null, advCls: variant === 'adventure' ? adventure.classes(st, hsMembers(room)) : null });
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
    function stop() { clearTimeout(st.timer); clearInterval(snapT); party.lobby(st, room); adventure.lobby(st, room); war.lobby(st, room); }
    return loadMaps().then(function (r) { recs = r; return { join: join, on: on, stop: stop }; });
  }

  /* o: { sock, fire, name, variant, api: BFOffline, raw: настоящий fetch } — обещание с контроллером комнаты */
  window.BFOfflineModes = {
    has: function (variant) { return Object.prototype.hasOwnProperty.call(MIN_PLAYERS, variant); },
    start: function (o) { return loadMods(o.raw).then(function (mods) { return create(o, mods); }); }
  };
})();
