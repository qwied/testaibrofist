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
        { id: 9, type: 'teleport', x: 880, y: 520, targetIds: 'exit' },
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
    // настоящий аккаунт из offlineServer.js, когда он запущен; иначе — простой игрок песочницы
    var real = window.BFOfflineServer && BFOfflineServer.me();
    if (real) return real;
    var user = read('user', null);
    if (!user) user = write('user', { name: 'Local Tester', guest: false, coins: 0, score: 0, hsScore: 0, mapDay: '', mapCount: 0, favoriteMaps: [], mapFolders: {}, settings: {} });
    return user;
  }
  function saveUser(user) {
    if (window.BFOfflineServer && BFOfflineServer.me() === user) { BFOfflineServer.save(); return user; }
    return write('user', user);
  }
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

  /* ---------- кланы: та же логика, что в clans.js на сервере, но на данных браузера ---------- */
  var CLAN_PTS = { 'Local Bot': 120, 'Test Pilot': 45, 'Sample Boss': 80 };    // очки выдуманных участников
  function readClans() {
    var c = read('clans', null);
    if (!Array.isArray(c)) c = write('clans', [
      { id: '1', name: 'Local Test Crew', tag: 'LTC', color: '#2563eb', desc: 'Sample clan: anyone can join.', open: true, created: now() - 86400000,
        leader: 'Local Bot', officers: [], members: ['Local Bot', 'Test Pilot'], requests: [] },
      { id: '2', name: 'Closed Sample', tag: 'CLS', color: '#16a34a', desc: 'Sample clan that takes join requests.', open: false, created: now() - 3600000,
        leader: 'Sample Boss', officers: [], members: ['Sample Boss'], requests: [] }
    ]);
    return c;
  }
  function clanSquash(s) { return String(s || '').toLowerCase().replace(/[\s._-]+/g, ''); }
  function clanRole(c, name) { return c.leader === name ? 'leader' : (c.officers.indexOf(name) !== -1 ? 'officer' : (c.members.indexOf(name) !== -1 ? 'member' : null)); }
  function clansApi(path, sp, method, data, user) {
    if (path.indexOf('/clan/') !== 0 && path !== '/clan' && path !== '/myClan' && path !== '/clanOf') return null;
    var clans = readClans(), me = user.name;
    var mineOf = function (name) { return clans.filter(function (c) { return c.members.indexOf(name) !== -1; })[0] || null; };
    var mine = mineOf(me);
    var pts = function (c) { return c.members.reduce(function (s, n) { return s + (n === me ? (user.score || 0) + (user.hsScore || 0) : (CLAN_PTS[n] || 0)); }, 0); };
    var summary = function (c) { return { id: c.id, name: c.name, tag: c.tag, color: c.color, desc: c.desc || '', open: !!c.open, members: c.members.length, max: 30, points: pts(c), created: c.created }; };
    var err = function (m) { return Promise.resolve(response({ status: 'error', message: m })); };
    var ok = function (extra) { return Promise.resolve(response(Object.assign({ status: 'success' }, extra || {}))); };
    var save = function () { write('clans', clans); };
    var byId = function (id) { return clans.filter(function (c) { return c.id === String(id || ''); })[0] || null; };
    var drop = function (list, name) { var i = list.indexOf(name); if (i !== -1) list.splice(i, 1); return i !== -1; };
    var yes = function (v) { return !(v === false || v === 'false' || v === '0'); };
    var role = mine ? clanRole(mine, me) : null, manage = role === 'leader' || role === 'officer';

    if (path === '/clan/list') {
      var q = String(sp.get('q') || '').toLowerCase(), sort = sp.get('sort') === 'members' ? 'members' : (sp.get('sort') === 'new' ? 'new' : 'points');
      var list = clans.filter(function (c) { return !q || c.name.toLowerCase().indexOf(q) !== -1 || c.tag.toLowerCase().indexOf(q) !== -1; }).map(summary);
      list.sort(function (a, b) { return sort === 'members' ? b.members - a.members || b.points - a.points : (sort === 'new' ? b.created - a.created : b.points - a.points || b.members - a.members); });
      var pages = Math.max(1, Math.ceil(list.length / 12)), page = Math.min(pages, Math.max(1, Number(sp.get('page')) || 1));
      return Promise.resolve(response({ clans: list.slice((page - 1) * 12, page * 12), page: page, pages: pages, total: list.length, sort: sort, mine: mine ? mine.id : null }));
    }
    if (path === '/myClan') return Promise.resolve(response({ clan: mine ? { id: mine.id, name: mine.name, tag: mine.tag, color: mine.color } : null, role: role, pending: manage ? mine.requests.length : 0 }));
    if (path === '/clanOf') { var oc = mineOf(String(sp.get('name') || '')); return Promise.resolve(response({ clan: oc ? { id: oc.id, name: oc.name, tag: oc.tag, color: oc.color } : null })); }
    if (path === '/clan') {
      var c = byId(sp.get('id'));
      if (!c) return err('Clan not found');
      var rank = { leader: 0, officer: 1, member: 2 };
      var out = Object.assign(summary(c), { status: 'success', leader: c.leader, myRole: clanRole(c, me), myRequest: c.requests.indexOf(me) !== -1,
        myOtherClan: !!mine && !clanRole(c, me), isOwner: false,
        memberList: c.members.map(function (n) { return { name: n, role: clanRole(c, n), points: n === me ? (user.score || 0) + (user.hsScore || 0) : (CLAN_PTS[n] || 0) }; })
          .sort(function (a, b) { return rank[a.role] - rank[b.role] || b.points - a.points; }) });
      var cr = clanRole(c, me); if (cr === 'leader' || cr === 'officer') out.requests = c.requests.slice();
      return Promise.resolve(response(out));
    }
    if (method !== 'POST') return null;

    if (path === '/clan/create') {
      if (mine) return err('Leave your current clan first');
      var name = String(data.name || '').replace(/\s+/g, ' ').trim(), tag = String(data.tag || '').trim().toUpperCase();
      if (name.length < 3 || name.length > 20) return err('Clan name must be 3 to 20 characters');
      if (!/^[A-Za-zА-Яа-яЁё0-9][A-Za-zА-Яа-яЁё0-9 ._-]*[A-Za-zА-Яа-яЁё0-9]$/.test(name)) return err('Clan name may only contain letters, digits, spaces and - _ .');
      if (!/^[A-Za-z0-9]{2,5}$/.test(tag)) return err('Tag must be 2 to 5 letters or digits');
      if (clans.some(function (x) { return clanSquash(x.name) === clanSquash(name); })) return err('A clan with this name already exists');
      if (clans.some(function (x) { return x.tag.toLowerCase() === tag.toLowerCase(); })) return err('This tag is already taken');
      var nid = String(clans.reduce(function (m, x) { return Math.max(m, parseInt(x.id, 10) || 0); }, 0) + 1);
      var nc = { id: nid, name: name, tag: tag, desc: String(data.desc || '').trim().slice(0, 200), color: /^#[0-9a-f]{6}$/i.test(data.color || '') ? String(data.color).toLowerCase() : '#111827',
        open: yes(data.open), created: now(), leader: me, officers: [], members: [me], requests: [] };
      clans.push(nc); save();
      return ok({ message: 'Clan created', clan: summary(nc) });
    }
    if (path === '/clan/join') {
      var jc = byId(data.id);
      if (mine) return err('Leave your current clan first');
      if (!jc) return err('Clan not found');
      if (jc.members.length >= 30) return err('This clan is full');
      if (jc.open) { jc.members.push(me); save(); return ok({ joined: true, message: 'You joined ' + jc.name }); }
      if (jc.requests.indexOf(me) !== -1) return err('Request already sent');
      jc.requests.push(me); save();
      return ok({ joined: false, message: 'Request sent' });
    }
    if (path === '/clan/cancelRequest') { var cc = byId(data.id); if (!cc || !drop(cc.requests, me)) return err('No such request'); save(); return ok(); }
    if (path === '/clan/leave') {
      if (!mine) return err('You are not in a clan');
      if (role === 'leader') {
        if (mine.members.length > 1) return err('Make someone else the leader first, or disband the clan');
        clans.splice(clans.indexOf(mine), 1); save(); return ok({ disbanded: true });
      }
      drop(mine.members, me); drop(mine.officers, me); save(); return ok();
    }
    if (path === '/clan/disband') {
      if (role !== 'leader') return err('Only the leader can disband the clan');
      clans.splice(clans.indexOf(mine), 1); save(); return ok();
    }
    if (path === '/clan/edit') {
      if (role !== 'leader') return err('Only the leader can do this');
      if (data.desc !== undefined) mine.desc = String(data.desc).trim().slice(0, 200);
      if (data.color !== undefined) { if (!/^#[0-9a-f]{6}$/i.test(data.color)) return err('Bad color'); mine.color = String(data.color).toLowerCase(); }
      if (data.open !== undefined) mine.open = yes(data.open);
      save(); return ok({ clan: summary(mine) });
    }
    if (!mine) return err('You are not in a clan');
    var who = String(data.name || ''), wr = clanRole(mine, who);
    if (path === '/clan/accept' || path === '/clan/decline') {
      if (!manage) return err('Only the leader or an officer can do this');
      if (mine.requests.indexOf(who) === -1) return err('No such request');
      if (path === '/clan/accept') { if (mine.members.length >= 30) return err('This clan is full'); mine.members.push(who); }
      drop(mine.requests, who); save(); return ok();
    }
    if (path === '/clan/kick') {
      if (!manage) return err('Only the leader or an officer can do this');
      if (!wr) return err('This player is not in your clan');
      if (wr === 'leader' || who === me) return err('You cannot remove this player');
      if (wr === 'officer' && role !== 'leader') return err('Only the leader can remove an officer');
      drop(mine.members, who); drop(mine.officers, who); save(); return ok();
    }
    if (role !== 'leader') return err('Only the leader can do this');
    if (path === '/clan/promote') {
      if (wr !== 'member') return err('Only a regular member can become an officer');
      if (mine.officers.length >= 5) return err('At most 5 officers');
      mine.officers.push(who); save(); return ok();
    }
    if (path === '/clan/demote') { if (!drop(mine.officers, who)) return err('This player is not an officer'); save(); return ok(); }
    if (path === '/clan/transfer') {
      if (who === me || !wr) return err('Pick another member of your clan');
      drop(mine.officers, who); if (mine.officers.length < 5) mine.officers.push(mine.leader);
      mine.leader = who; save(); return ok();
    }
    return null;
  }

  /* Сначала — настоящие маршруты сервера (offlineServer.js), если они загрузились;
     то, чего у них нет (комнаты, сюжет, Admin Abuse…), отвечает простой API ниже. */
  function localApi(input, init) {
    if (!window.BFOfflineServer) return simpleApi(input, init);
    return BFOfflineServer.ready.then(function () {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var u = new URL(url, location.href);
      return BFOfflineServer.handle(u.pathname, u.searchParams, (init && init.method || 'GET').toUpperCase(), bodyData(init)) || simpleApi(input, init);
    });
  }
  function simpleApi(input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var path = new URL(url, location.href).pathname;
    var sp = query(url), method = (init && init.method || 'GET').toUpperCase(), data = bodyData(init);
    var user = currentUser();
    var clanRes = clansApi(path, sp, method, data, user);
    if (clanRes) return clanRes;
    if (path === '/whoAmI' || path === '/iSigned') return Promise.resolve(response({ name: user.name, guest: false, data: user, owner: false }));
    if (path === '/getMySettings') return Promise.resolve(response({ status: 'success', data: user.settings || {} }));
    if (path === '/getMyProfile') return Promise.resolve(response({ status: 'success', data: user }));
    if (path === '/getBestRoom' || path === '/getRoomList') {
      // отдельные режимы (Война, Вечеринка, Приключение) живут в комнатах «war-1» и т.п. — см. offlineModes.js
      var vr = /^(murder|team|war|party|adventure)$/.test(sp.get('variant') || '') ? sp.get('variant') + '-1' : 'local-room-' + (sp.get('mode') || 'race');
      return Promise.resolve(response(path === '/getBestRoom' ? { room: vr } : { rooms: [{ room: vr, players: 1, names: [user.name], status: 'green' }], limit: 40 }));
    }
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
    try { console.warn('[offline] no local endpoint: ' + path); } catch (e) {}
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
    // общая гонка в песочнице: раунд за раундом по картам песочницы (см. raceRooms в server.js)
    var raceK = 0, raceT = null;
    function raceRound() {
      clearTimeout(raceT);
      var list = (window.BFOffline && BFOffline.getMaps('race')) || [];
      fire('racePhase', { phase: 'round', map: list.length ? list[raceK % list.length] : null, msLeft: 120000, goal: '', roundNum: ++raceK });
      raceT = setTimeout(raceRound, 120000);
    }
    var modeCtl = null;      // комната отдельного режима из offlineModes.js (Война, Вечеринка, Приключение)
    sock.emit = function (ev, data) {
      if (modeCtl && ev !== 'join' && modeCtl.on(ev, data)) return sock;
      if (ev === 'join') {
        // аккаунт и карты — из offlineServer.js: ждём, пока он поднимется
        if (window.BFOfflineServer && !sock._srvReady) {
          BFOfflineServer.ready.then(function () { sock._srvReady = true; sock.emit('join', data); });
          return sock;
        }
        var user = currentUser();
        var vm = /^(murder|team|war|party|adventure)-\d+$/.exec(String(data && data.room || ''));
        // обычные прятки — тоже настоящий круг раунда с ботами (offlineModes.js), кроме сюжета
        if (!vm && data && data.gameMode === 'hideAndSeek' && !/[?&]story=1/.test(location.search) && window.BFOfflineModes && BFOfflineModes.has('classic')) vm = [null, 'classic'];
        if (vm && window.BFOfflineModes && BFOfflineModes.has(vm[1]) && originalFetch) {
          BFOfflineModes.start({ sock: sock, fire: fire, name: user.name, variant: vm[1], api: window.BFOffline, raw: originalFetch })
            .then(function (c) { modeCtl = c; c.join(); }, function () { sock.emit('join', Object.assign({}, data, { room: 'local-room-hideAndSeek' })); });
          return sock;
        }
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
          // гонка: общий раунд ведёт сервер (racePhase) — песочница одиночная, сразу старт без отсчёта
          if (data && data.gameMode === 'race' && !/[?&]story=1/.test(location.search)) raceRound();
        }, 0);
      } else if (ev === 'pingCheck') {
        fire('pongCheck', data);
      } else if (ev === 'raceFinish') {
        fire('raceFinished', { id: sock.id, name: currentUser().name, place: 1 });
        clearTimeout(raceT);
        raceT = setTimeout(raceRound, 1400);            // финишировал — следующая карта, как на сервере
        sock.localCoins += 1;
        // монета и очко — на настоящий аккаунт песочницы, если offlineServer.js запущен
        var A = window.BFOfflineServer && BFOfflineServer.acc(), got = A ? A.creditCoins(currentUser().name, 1) : 1;
        if (A && A.creditScore) A.creditScore(currentUser().name, 1);
        fire('coinsAwarded', { amount: got, coins: A ? currentUser().coins : sock.localCoins, reason: 'offlineRaceFinish' });
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

  /* карты: из настоящего maps.js (offlineServer.js), когда он запущен — с данными карты уже объектом */
  function realMaps() {
    var M = window.BFOfflineServer && BFOfflineServer.maps();
    if (!M) return null;
    return M.allMaps().filter(function (m) { return !m.showcase; }).map(function (m) {
      var d = m.mapData; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
      return Object.assign({}, m, { mapData: d });
    });
  }
  // идущая на этой странице комната — для Servers в другой вкладке (см. snapshot в offlineServer.js)
  setInterval(function () {
    var c = window.BFOfflineModes && BFOfflineModes.room;
    if (!c || !c.gameState) return;
    var names = []; c.gameState.players.forEach(function (p) { names.push(p.name); });
    write('liveRoom', { at: now(), mode: c.st.fixedVariant === 'classic' ? 'hideAndSeek' : c.st.fixedVariant, room: c.st.fixedVariant === 'classic' ? 'local-room' : c.st.fixedVariant + '-1',
      players: names.length, limit: 40, status: 'open', names: names, map: c.st.map ? c.st.map.mapName + ' by ' + c.st.map.author : null,
      phase: c.st.phase, endsAt: c.st.endsAt });
  }, 3000);
  window.BFOffline = {
    enabled: true,
    maps: maps,
    raw: originalFetch,
    user: currentUser,
    saveUser: saveUser,
    legacyUser: function () { return read('user', {}) || {}; },
    legacyMaps: function () { return maps; },
    liveRoom: function () { var r = read('liveRoom', null); return r && now() - r.at < 10000 ? r : null; },
    getMaps: function (mode) { var all = realMaps() || maps; return all.filter(function (m) { return !mode || m.mapType === mode; }); },
    findMap: function (author, name) {
      var all = realMaps(); if (!all) return findMap(author, name);
      var lc = function (v) { return String(v || '').toLowerCase(); };
      return all.filter(function (m) { return lc(m.author) === lc(author) && lc(m.mapName) === lc(name); })[0] || null;
    },
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
