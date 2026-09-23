/* AIBrofist local runtime: browser-only replacements for the server API. */
(function () {
  'use strict';
  if (window.BFOffline) return;
  var PREFIX = 'aibrofist.local.v2.';
  var originalFetch = window.fetch ? window.fetch.bind(window) : null;

  function read(key, fallback) {
    try { var raw = localStorage.getItem(PREFIX + key); return raw == null ? fallback : JSON.parse(raw); }
    catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) {}
    return value;
  }
  function response(data, status) {
    return new Response(JSON.stringify(data), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  function bodyData(init) {
    var b = init && init.body;
    if (!b) return {};
    if (typeof b === 'string') {
      var type = init.headers && (init.headers['Content-Type'] || init.headers['content-type']);
      if (type && String(type).indexOf('application/json') !== -1) { try { return JSON.parse(b); } catch (e) { return {}; } }
      return Object.fromEntries(new URLSearchParams(b));
    }
    if (typeof URLSearchParams !== 'undefined' && b instanceof URLSearchParams) return Object.fromEntries(b);
    if (typeof FormData !== 'undefined' && b instanceof FormData) return Object.fromEntries(b);
    return {};
  }
  function query(url) { return new URL(url, location.href).searchParams; }
  function safeName(s) { return String(s || '').replace(/[<>"']/g, '').trim().slice(0, 40) || 'Local Tester'; }
  function now() { return Date.now(); }

  function makeMaps() {
    var base = function (mode, name, index) {
      var race = mode === 'race';
      var objects = [
        { id: 1, type: 'spawn', x: 90, y: 440 },
        { id: 2, type: 'rect', x: 0, y: 560, w: 1450, h: 80 },
        { id: 3, type: 'rect', x: 330, y: 455, w: 180, h: 28 },
        { id: 4, type: 'rect', x: 660, y: 390, w: 180, h: 28 },
        { id: 5, type: 'rect', x: 1010, y: 470, w: 220, h: 28 },
        { id: 6, type: 'coin', x: 390, y: 420 },
        { id: 7, type: 'coin', x: 730, y: 355 },
        { id: 8, type: 'bounce', x: 560, y: 535 },
        { id: 9, type: 'teleport', x: 880, y: 520, targetIds: ['exit'] },
        { id: 10, type: 'teleport', customId: 'exit', x: 1160, y: 420 },
        { id: 11, type: 'text', x: 180, y: 510, text: 'LOCAL TEST MAP' }
      ];
      if (race) {
        objects.push({ id: 12, type: 'checkpoint', x: 520, y: 500 });
        objects.push({ id: 13, type: 'superGate', x: 790, y: 500 });
        objects.push({ id: 14, type: 'finishline', x: 1320, y: 500 });
      } else {
        objects.push({ id: 12, type: 'zombie', x: 760, y: 480 });
        objects.push({ id: 13, type: 'cover', x: 1080, y: 500, w: 90, h: 60 });
      }
      return {
        mapName: name,
        author: 'Local Test',
        mapType: mode,
        date: now() - index * 60000,
        rating: 5 - index,
        likes: Math.max(0, 5 - index), dislikes: 0,
        commentCount: 0, comments: [], votes: {}, favorites: {},
        inGameModes: [mode], mapData: { mode: mode, objects: objects }
      };
    };
    return [
      base('race', 'Local Race Lab', 0),
      base('race', 'Local Race Playground', 1),
      base('hideAndSeek', 'Local Hide-and-Seek Lab', 2),
      base('hideAndSeek', 'Local Hide-and-Seek Playground', 3)
    ];
  }
  var maps = read('maps', null);
  if (!Array.isArray(maps) || !maps.length) maps = write('maps', makeMaps());

  function currentUser() {
    var user = read('user', null);
    if (!user) user = write('user', { name: 'Local Tester', guest: false, coins: 0, score: 0, hsScore: 0, mapDay: '', mapCount: 0, favoriteMaps: [], mapFolders: {}, settings: {} });
    return user;
  }
  function saveUser(user) { return write('user', user); }
  function mapKey(author, name) { return String(author) + '\u0000' + String(name); }
  function findMap(author, name) {
    return maps.find(function (m) { return m.author === author && m.mapName === name; }) || null;
  }
  function listMaps(sp) {
    var type = sp.get('mapType') || '';
    var author = (sp.get('author') || '').toLowerCase();
    var favOnly = sp.get('favoritesOnly') === '1';
    var user = currentUser();
    var result = maps.filter(function (m) {
      return (!type || m.mapType === type) && (!author || m.author.toLowerCase().indexOf(author) !== -1) && (!favOnly || (user.favoriteMaps || []).indexOf(mapKey(m.author, m.mapName)) !== -1);
    });
    var sort = sp.get('sortBy') || 'rating';
    result.sort(function (a, b) { return sort === 'date' ? b.date - a.date : (b.rating - a.rating || a.mapName.localeCompare(b.mapName)); });
    var pageSize = 20, page = Math.max(1, Number(sp.get('page') || 1));
    var pages = Math.max(1, Math.ceil(result.length / pageSize));
    page = Math.min(page, pages);
    return { maps: result.slice((page - 1) * pageSize, page * pageSize), page: page + '/' + pages, pages: pages };
  }
  function commentList(m) { return (m && m.comments) || []; }
  function parseJsonMap(data) { try { return typeof data === 'string' ? JSON.parse(data) : data; } catch (e) { return null; } }

  function localApi(input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var path = new URL(url, location.href).pathname;
    var sp = query(url), method = (init && init.method || 'GET').toUpperCase(), data = bodyData(init);
    var user = currentUser();
    if (path === '/whoAmI' || path === '/iSigned') return Promise.resolve(response({ name: user.name, guest: false, data: user, owner: false }));
    if (path === '/getMySettings') return Promise.resolve(response({ status: 'success', data: user.settings || {} }));
    if (path === '/getMyProfile') return Promise.resolve(response({ status: 'success', data: user }));
    if (path === '/getBestRoom' || path === '/getRoomList') return Promise.resolve(response(path === '/getBestRoom' ? { room: 'local-room-' + (sp.get('mode') || 'race') } : { rooms: [{ room: 'local-room-' + (sp.get('mode') || 'race'), players: 1, names: [user.name], status: 'green' }], limit: 40 }));
    if (path === '/getMapsForList' || path === '/getMaps') return Promise.resolve(response(listMaps(sp)));
    if (path === '/getUploadLimit') return Promise.resolve(response({ limit: 3, left: Math.max(0, 3 - Number(user.mapCount || 0)), reward: 10, guest: false }));
    if (path === '/getMapData') {
      var gm = findMap(sp.get('author') || 'Local Test', sp.get('mapName')) || maps[0];
      return Promise.resolve(response(gm ? gm.mapData : null, gm ? 200 : 404));
    }
    if (path === '/getRandomMap') {
      var candidates = maps.filter(function (m) { return !sp.get('mapType') || m.mapType === sp.get('mapType'); });
      var not = sp.get('not');
      var pick = candidates.find(function (m) { return m.mapName !== not; }) || candidates[0];
      return Promise.resolve(response(pick || null, pick ? 200 : 404));
    }
    if (path === '/getFriendsList') return Promise.resolve(response({ relation: [{ name: 'Local Tester' }] }));
    if (path === '/getLeaderboard') return Promise.resolve(response({ status: 'success', list: [{ name: user.name, score: user.score || 0, coins: user.coins || 0 }] }));
    if (path === '/abuse/state') return Promise.resolve(response(read('abuseState', { v: 0, reward: false, weather: 'none', count: 1, until: 0, media: [], song: null })));
    if (path === '/update/get') return Promise.resolve(response(read('updateState', { seconds: 0, at: 0 })));
    if (path === '/getUploadLimit') return Promise.resolve(response({ status: 'success', left: 999, max: 999 }));
    if (path === '/getMyBio') return Promise.resolve(response({ status: 'success', bio: user.bio || '' }));
    if (path === '/getJoinDate') return Promise.resolve(response({ status: 'success', date: user.joinDate || now() }));
    if (path === '/getCoins') return Promise.resolve(response({ status: 'success', coins: user.coins || 0 }));
    if (path === '/getAboutMe') return Promise.resolve(response({ status: 'success', about: user.bio || '' }));
    if (path === '/getRelation') return Promise.resolve(response({ status: 'success', relation: '0' }));
    if (path === '/getRank') return Promise.resolve(response({ status: 'success', rank: 1 }));
    if (path === '/quests') return Promise.resolve(response({ status: 'success', quests: [] }));
    if (path === '/dailyReward/status') return Promise.resolve(response({ guest: false, available: true, msLeft: 0, prizes: [{ amount: 5 }, { amount: 10 }, { amount: 25 }, { amount: 50 }] }));
    if (path === '/getMapComments') {
      var cm = findMap(sp.get('author'), sp.get('mapName'));
      return Promise.resolve(response({ comments: commentList(cm) }));
    }
    if (path === '/story/roomInfo') {
      var rooms = read('storyRooms', {}), room = rooms[sp.get('room')];
      return Promise.resolve(response(room ? { status: 'success', author: room.author, mapName: room.mapName, mode: room.mode, limitMs: room.limitMs } : { status: 'error' }, room ? 200 : 404));
    }
    if (path === '/messages/threads' || path === '/notifications') return Promise.resolve(response({ status: 'success', threads: [], notifications: [] }));
    if (path === '/skins/many' || path === '/skin/my') return Promise.resolve(response({ status: 'success', skins: {}, skin: null }));
    if (method !== 'POST') return Promise.resolve(response({ status: 'error', message: 'Local endpoint not found' }, 404));
    if (path === '/story/create') {
      var roomId = 'local-story-' + now().toString(36), storyRooms = read('storyRooms', {});
      storyRooms[roomId] = { author: safeName(data.author), mapName: safeName(data.mapName), mode: (findMap(data.author, data.mapName) || {}).mapType || 'race', limitMs: Math.max(1, Number(data.limitMin || 10)) * 60000 };
      write('storyRooms', storyRooms);
      return Promise.resolve(response({ status: 'success', room: roomId, mode: storyRooms[roomId].mode }));
    }
    if (path === '/abuse/upload') {
      return Promise.resolve(response({ status: 'success', url: String(data.data || ''), mime: 'image/png' }));
    }
    if (path === '/uploadMap') {
      var uploaded = parseJsonMap(data.mapData);
      if (!uploaded || !Array.isArray(uploaded.objects)) return Promise.resolve(response({ status: 'error', message: 'Invalid map data' }));
      var mapName = safeName(data.mapName).slice(0, 30), mapType = data.mapType === 'race' ? 'race' : 'hideAndSeek';
      var existing = findMap(user.name, mapName);
      var record = { mapName: mapName, author: user.name, mapType: mapType, date: now(), rating: 0, likes: 0, dislikes: 0, commentCount: 0, comments: [], votes: {}, favorites: {}, inGameModes: [mapType], mapData: uploaded };
      if (existing && data.mapOverwrite !== 'true') return Promise.resolve(response({ status: 'exists', message: 'A local map with this name already exists.' }));
      if (existing) maps[maps.indexOf(existing)] = record; else maps.push(record);
      write('maps', maps);
      return Promise.resolve(response({ status: 'success', message: 'Map saved locally.' }));
    }
    if (path === '/dailyReward/claim') {
      var prize = 10, claimUser = currentUser(); claimUser.coins = (claimUser.coins || 0) + prize; saveUser(claimUser);
      return Promise.resolve(response({ status: 'success', amount: prize, index: 1, coins: claimUser.coins }));
    }
    if (path === '/mapFolders') return Promise.resolve(response({ status: 'success', folders: user.mapFolders || [] }));
    if (path === '/mapFavorite') {
      var favKey = mapKey(data.author, data.mapName), favs = user.favoriteMaps || [], fi = favs.indexOf(favKey);
      if (fi < 0) favs.push(favKey); else favs.splice(fi, 1); user.favoriteMaps = favs; saveUser(user);
      return Promise.resolve(response({ status: 'success', myFavorite: fi < 0 }));
    }
    if (path === '/abuse/set') {
      var abuse = read('abuseState', { v: 0, reward: false, weather: 'none', count: 1, until: 0, media: [], song: null });
      abuse.v = Number(abuse.v || 0) + 1;
      if (data.what === 'clear') { abuse.weather = 'none'; abuse.media = []; abuse.song = null; abuse.reward = false; abuse.until = 0; }
      else if (data.what === 'weather') { abuse.weather = String(data.weather || 'none'); abuse.count = Math.max(1, Math.min(300, Number(data.count || 1))); abuse.reward = String(data.reward) === 'true'; abuse.until = Date.now() + Math.max(0, Number(data.secs || 0)) * 1000; }
      else if (data.what === 'mediaClear') abuse.media = [];
      else if (data.what === 'song') abuse.song = String(data.url || '');
      else if (data.what === 'media') { abuse.media = [{ url: String(data.url || ''), kind: String(data.kind || 'image'), dir: String(data.dir || 'down') }]; }
      write('abuseState', abuse); return Promise.resolve(response({ status: 'success', state: abuse }));
    }
    if (path === '/abuse/coin') {
      var coinShow = read('abuseState', { v: 0, reward: false });
      if (!coinShow.reward) return Promise.resolve(response({ status: 'error', message: 'No coins are being given out right now' }));
      user.coins = Number(user.coins || 0) + 1; saveUser(user);
      return Promise.resolve(response({ status: 'success', coins: user.coins, left: 999 }));
    }
    if (path === '/update/set') {
      var seconds = Math.max(0, Math.min(10800, Number(data.seconds || 0)));
      var update = { seconds: seconds, at: Date.now() }; write('updateState', update);
      return Promise.resolve(response({ status: 'success', state: update }));
    }
    if (path === '/uploadVote') {
      var vm = findMap(data.author, data.mapName);
      if (vm) { var vote = Number(data.vote) > 0 ? 1 : -1; vm.votes[user.name] = vote; vm.likes = Object.values(vm.votes).filter(function (v) { return v > 0; }).length; vm.dislikes = Object.values(vm.votes).filter(function (v) { return v < 0; }).length; vm.rating = vm.likes - vm.dislikes; write('maps', maps); }
      return Promise.resolve(response({ status: 'success' }));
    }
    if (path === '/addMapComment') {
      var am = findMap(data.author, data.mapName); if (!am) return Promise.resolve(response({ status: 'error', message: 'Map not found' }));
      var c = { id: String(now()), author: user.name, text: safeName(data.text).slice(0, 300), date: now(), canDelete: true }; am.comments = commentList(am); am.comments.push(c); am.commentCount = am.comments.length; write('maps', maps); return Promise.resolve(response({ status: 'success', comment: c }));
    }
    if (path === '/deleteMapComment') {
      var dm = findMap(data.author, data.mapName); if (dm) dm.comments = commentList(dm).filter(function (c) { return String(c.id) !== String(data.id); }); if (dm) { dm.commentCount = dm.comments.length; write('maps', maps); } return Promise.resolve(response({ status: 'success' }));
    }
    if (path === '/messages/start' || path === '/messages/send' || path === '/quests/claim') return Promise.resolve(response({ status: 'success', id: 'local-thread' }));
    if (path === '/maps/seen' || path === '/uploadVote' || path === '/update/set' || path === '/abuse/set' || path === '/abuse/coin') return Promise.resolve(response({ status: 'success' }));
    if (path === '/story/create') return Promise.resolve(response({ status: 'success', room: 'local-story', mode: 'race' }));
    return Promise.resolve(response({ status: 'error', message: 'Local endpoint not found' }, 404));
  }

  function makeLocalSocket() {
    var sock = { id: 'local-player', connected: true, _ls: {}, localCoins: 0 };
    function fire(ev, data) {
      (sock._ls[ev] || []).slice().forEach(function (fn) { try { fn(data); } catch (e) {} });
    }
    sock.on = function (ev, fn) {
      (sock._ls[ev] = sock._ls[ev] || []).push(fn);
      return sock;
    };
    sock.emit = function (ev, data) {
      if (ev === 'join') {
        var user = currentUser();
        setTimeout(function () {
          fire('nameFixed', { name: user.name });
          fire('playersList', [{ id: sock.id, name: user.name, nid: 1, position: {} }]);
          if (data && data.gameMode === 'hideAndSeek') {
            var bot = { id: 'local-seeker-bot', name: 'Local Seeker Bot', chance: 50 };
            var winner = new URLSearchParams(location.search).get('role') === 'seeker' ? sock.id : bot.id;
            var hsMap = (window.BFOffline && BFOffline.getMaps(data.gameMode)[0]) || null;
            fire('hsRoulette', { players: [{ id: sock.id, name: user.name, chance: 50 }, bot], winnerId: winner, duration: 1400, msLeft: 6000 });
            setTimeout(function () { fire('hsPhase', { phase: 'round', seekerId: winner, msLeft: 120000, map: hsMap }); }, 3900);
          }
        }, 0);
      } else if (ev === 'pingCheck') {
        fire('pongCheck', data);
      } else if (ev === 'raceFinish') {
        sock.localCoins += 1;
        fire('coinsAwarded', { amount: 1, coins: sock.localCoins, reason: 'offlineRaceFinish' });
        fire('raceScores', [{ name: currentUser().name, score: sock.localCoins }]);
      } else if (ev === 'drawLine') {
        fire('drawLineQuota', { left: 999 });
      } else if (ev === 'sendChat') {
        fire('chatMessage', { playerName: currentUser().name, text: String(data && data.text || '') });
      }
      return sock;
    };
    sock.disconnect = function () { sock.connected = false; fire('disconnect'); };
    return sock;
  }
  if (!window.io) window.io = function () { var s = makeLocalSocket(); setTimeout(function () { s._ls.connect && s._ls.connect.forEach(function (fn) { try { fn(); } catch (e) {} }); }, 0); return s; };

  window.BFOffline = {
    enabled: true,
    maps: maps,
    user: currentUser,
    saveUser: saveUser,
    getMaps: function (mode) { return maps.filter(function (m) { return !mode || m.mapType === mode; }); },
    findMap: findMap,
    api: localApi
  };
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var path = new URL(url, location.href).pathname;
    return path.charAt(0) === '/' && !/^\/[^/]+\.(png|jpg|jpeg|gif|webp|svg|css|js|html|json|mp3|wav|woff2?)$/i.test(path)
      ? localApi(input, init)
      : (originalFetch ? originalFetch(input, init) : Promise.reject(new Error('fetch unavailable')));
  };
})();
