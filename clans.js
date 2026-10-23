// ============ КЛАНЫ ============
/* Клан — группа игроков с общим тегом, который виден в игре рядом с ником.
   Один игрок состоит максимум в одном клане. Роли: лидер (один), офицеры
   (принимают заявки и исключают рядовых) и участники. Вступить можно сразу
   (открытый клан) или по заявке (закрытый — её принимает лидер или офицер).

   Хранилище — свой файл data/clans.json, на аккаунтах ничего не дублируем:
   кто в каком клане, знает только он сам. Участники записаны по нику, поэтому
   при смене ника (accounts.js /changeNickname, extras.js /renameUser) туда
   вызывается renameMember — иначе игрок «выпал» бы из клана.

   Очки клана — сумма очков его участников в Race и Hide and Seek за всё
   время (поля score и hsScore на аккаунте): отдельной накопительной
   статистики у клана нет, значит, ей не с чем разъехаться. */
'use strict';
const fs = require('fs');
const path = require('path');
const { atomicWriteFileSync } = require('./fsAtomic.js');

const NAME_MIN = 3, NAME_MAX = 20;
const TAG_RE = /^[A-Za-z0-9]{2,5}$/;
const DESC_MAX = 200;
const MAX_MEMBERS = 30;
const MAX_OFFICERS = 5;
const MAX_REQUESTS = 50;        // заявок в один клан
const MAX_MY_REQUESTS = 3;      // заявок от одного игрока одновременно
const PAGE_SIZE = 12;
const HEX = /^#[0-9a-f]{6}$/i;
const DEFAULT_COLOR = '#111827';

// управляющие и невидимые символы (в том числе переворачивающие строку) не нужны ни в названии, ни в описании
const BAD_CHARS = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g;
const clean = (v, max) => String(v == null ? '' : v).replace(BAD_CHARS, '').replace(/\s+/g, ' ').trim().slice(0, max);
const low = s => String(s || '').toLowerCase();
// название без пробелов и знаков: «Cool Clan», «cool-clan» и «CoolClan» — один и тот же клан
const squash = s => low(s).replace(/[\s._-]+/g, '');

function make(file) {
  let db = { next: 1, clans: [] };
  const byMember = new Map();          // ник в нижнем регистре -> клан

  function reindex() {
    byMember.clear();
    db.clans.forEach(c => c.members.forEach(n => byMember.set(low(n), c)));
  }
  function load() {
    db = { next: 1, clans: [] };
    try {
      if (fs.existsSync(file)) db = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) { console.log('clans.json не прочитан, начинаю с нуля'); }
    if (!db || !Array.isArray(db.clans)) db = { next: 1, clans: [] };
    db.next = Math.max(parseInt(db.next, 10) || 1, db.clans.reduce((m, c) => Math.max(m, parseInt(c.id, 10) || 0), 0) + 1);
    db.clans.forEach(c => {
      c.members = Array.isArray(c.members) ? c.members : [];
      c.officers = Array.isArray(c.officers) ? c.officers : [];
      c.requests = Array.isArray(c.requests) ? c.requests : [];
    });
    reindex();
  }
  let timer = null;
  function writeNow() {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      atomicWriteFileSync(file, JSON.stringify(db, null, 2));
    } catch (e) { console.log('не смог сохранить clans.json:', e.message); }
  }
  function save() {
    reindex();
    clearTimeout(timer);
    timer = setTimeout(writeNow, 300);
  }
  load();

  const byId = id => db.clans.find(c => c.id === String(id || '')) || null;
  const roleOf = (c, name) => low(c.leader) === low(name) ? 'leader'
    : (c.officers.some(n => low(n) === low(name)) ? 'officer' : (c.members.some(n => low(n) === low(name)) ? 'member' : null));
  const canManage = role => role === 'leader' || role === 'officer';
  const has = (list, name) => list.some(n => low(n) === low(name));
  const drop = (list, name) => { const i = list.findIndex(n => low(n) === low(name)); if (i !== -1) list.splice(i, 1); return i !== -1; };

  function clearRequests(name) { db.clans.forEach(c => drop(c.requests, name)); }

  function disband(c) {
    db.clans = db.clans.filter(x => x !== c);
    save();
  }

  /* ---------- публичные вещи для остального сервера ---------- */
  function clanOf(name) {
    const c = byMember.get(low(name));
    return c ? { id: c.id, name: c.name, tag: c.tag, color: c.color } : null;
  }
  // игрок сменил ник — клан должен узнать его под новым
  function renameMember(from, to) {
    let touched = false;
    db.clans.forEach(c => {
      ['members', 'officers', 'requests'].forEach(k => {
        c[k] = c[k].map(n => { if (low(n) === low(from)) { touched = true; return to; } return n; });
      });
      if (low(c.leader) === low(from)) { c.leader = to; touched = true; }
    });
    if (touched) save();
  }
  // сколько заявок ждут решения у того, кто может их принимать
  function pendingFor(name) {
    const c = byMember.get(low(name));
    return c && canManage(roleOf(c, name)) ? c.requests.length : 0;
  }

  function register(app, acc) {
    const { currentUser } = acc;
    const accUser = name => acc.getDb().users[acc.key(name)] || null;
    const points = name => { const u = accUser(name); return u ? (u.score || 0) + (u.hsScore || 0) : 0; };
    const clanPoints = c => c.members.reduce((s, n) => s + points(n), 0);
    // чужим ником владельца («System», «AIBrofist team») клан не назвать
    const reserved = s => (acc.OWNER_ALIASES || []).some(a => a && squash(s).indexOf(squash(a)) === 0);
    const err = message => ({ status: 'error', message });

    const summary = c => ({
      id: c.id, name: c.name, tag: c.tag, color: c.color, desc: c.desc || '', open: !!c.open,
      members: c.members.length, max: MAX_MEMBERS, points: clanPoints(c), created: c.created || 0
    });

    /* Всё, что меняет клан, начинается одинаково: кто спрашивает, в каком он клане и какая у него там роль. */
    function actor(req, res) {
      const u = currentUser(req);
      if (!u) { res.json(err('Sign in first')); return null; }
      const c = byMember.get(low(u.name)) || null;
      return { u, c, role: c ? roleOf(c, u.name) : null };
    }

    // ---------- список и поиск ----------
    // адрес /clans занят самой страницей (server.js, PAGE_FILES), поэтому список — /clan/list
    app.get('/clan/list', (req, res) => {
      const q = low(clean(req.query.q, 30));
      let list = db.clans.filter(c => !q || low(c.name).indexOf(q) !== -1 || low(c.tag).indexOf(q) !== -1).map(summary);
      const sort = req.query.sort === 'members' ? 'members' : req.query.sort === 'new' ? 'new' : 'points';
      list.sort((a, b) => sort === 'members' ? b.members - a.members || b.points - a.points
        : sort === 'new' ? b.created - a.created
        : b.points - a.points || b.members - a.members);
      const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
      const page = Math.min(pages, Math.max(1, parseInt(req.query.page, 10) || 1));
      const slice = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      const me = currentUser(req);
      const mine = me ? byMember.get(low(me.name)) : null;
      res.json({ clans: slice, page, pages, total: list.length, sort, mine: mine ? mine.id : null });
    });

    // ---------- карточка клана ----------
    app.get('/clan', (req, res) => {
      const c = byId(req.query.id);
      if (!c) return res.json(err('Clan not found'));
      const me = currentUser(req);
      const myRole = me ? roleOf(c, me.name) : null;
      const rank = { leader: 0, officer: 1, member: 2 };
      const members = c.members.map(n => ({ name: n, role: roleOf(c, n), points: points(n) }))
        .sort((a, b) => rank[a.role] - rank[b.role] || b.points - a.points || a.name.localeCompare(b.name));
      const out = Object.assign(summary(c), {
        status: 'success', leader: c.leader, memberList: members,
        myRole, myRequest: !!me && has(c.requests, me.name),
        myOtherClan: !!me && !myRole && byMember.has(low(me.name)),
        isOwner: !!me && !!acc.isOwner(me)
      });
      if (canManage(myRole)) out.requests = c.requests.slice();
      res.json(out);
    });

    // клан любого игрока: на странице профиля
    app.get('/clanOf', (req, res) => res.json({ clan: clanOf(String(req.query.name || '')) }));

    // свой клан и число заявок, ждущих решения
    app.get('/myClan', (req, res) => {
      const me = currentUser(req);
      if (!me) return res.json({ clan: null, role: null, pending: 0 });
      const c = byMember.get(low(me.name));
      res.json({ clan: c ? clanOf(me.name) : null, role: c ? roleOf(c, me.name) : null, pending: pendingFor(me.name) });
    });

    // ---------- создать ----------
    app.post('/clan/create', (req, res) => {
      const a = actor(req, res); if (!a) return;
      if (a.c) return res.json(err('Leave your current clan first'));
      const name = clean(req.body.name, NAME_MAX + 5);
      const tag = String(req.body.tag == null ? '' : req.body.tag).trim().toUpperCase();
      if (name.length < NAME_MIN || name.length > NAME_MAX)
        return res.json(err('Clan name must be ' + NAME_MIN + ' to ' + NAME_MAX + ' characters'));
      if (!/^[A-Za-zА-Яа-яЁё0-9][A-Za-zА-Яа-яЁё0-9 ._-]*[A-Za-zА-Яа-яЁё0-9]$/.test(name))
        return res.json(err('Clan name may only contain letters, digits, spaces and - _ .'));
      if (!TAG_RE.test(tag)) return res.json(err('Tag must be 2 to 5 letters or digits'));
      if (reserved(name) || reserved(tag)) return res.json(err('This name is reserved'));
      if (db.clans.some(c => squash(c.name) === squash(name))) return res.json(err('A clan with this name already exists'));
      if (db.clans.some(c => low(c.tag) === low(tag))) return res.json(err('This tag is already taken'));
      const color = HEX.test(String(req.body.color || '')) ? String(req.body.color).toLowerCase() : DEFAULT_COLOR;
      const open = !(req.body.open === false || req.body.open === 'false' || req.body.open === '0');
      const c = { id: String(db.next++), name, tag, desc: clean(req.body.desc, DESC_MAX), color, open,
                  created: Date.now(), leader: a.u.name, officers: [], members: [a.u.name], requests: [] };
      clearRequests(a.u.name);
      db.clans.push(c);
      save();
      res.json({ status: 'success', message: 'Clan created', clan: summary(c) });
    });

    // ---------- вступить / заявка ----------
    app.post('/clan/join', (req, res) => {
      const a = actor(req, res); if (!a) return;
      if (a.c) return res.json(err('Leave your current clan first'));
      const c = byId(req.body.id);
      if (!c) return res.json(err('Clan not found'));
      if (c.members.length >= MAX_MEMBERS) return res.json(err('This clan is full'));
      if (c.open) {
        c.members.push(a.u.name);
        clearRequests(a.u.name);
        save();
        return res.json({ status: 'success', joined: true, message: 'You joined ' + c.name });
      }
      if (has(c.requests, a.u.name)) return res.json(err('Request already sent'));
      if (db.clans.filter(x => has(x.requests, a.u.name)).length >= MAX_MY_REQUESTS)
        return res.json(err('You have too many pending requests'));
      if (c.requests.length >= MAX_REQUESTS) return res.json(err('This clan has too many pending requests'));
      c.requests.push(a.u.name);
      save();
      res.json({ status: 'success', joined: false, message: 'Request sent' });
    });

    app.post('/clan/cancelRequest', (req, res) => {
      const a = actor(req, res); if (!a) return;
      const c = byId(req.body.id);
      if (!c || !drop(c.requests, a.u.name)) return res.json(err('No such request'));
      save();
      res.json({ status: 'success' });
    });

    // ---------- решения по заявкам ----------
    app.post('/clan/accept', (req, res) => {
      const a = actor(req, res); if (!a) return;
      if (!canManage(a.role)) return res.json(err('Only the leader or an officer can do this'));
      const name = String(req.body.name || '');
      if (!has(a.c.requests, name)) return res.json(err('No such request'));
      const who = accUser(name);
      if (byMember.has(low(name))) { drop(a.c.requests, name); save(); return res.json(err('This player is already in a clan')); }
      if (a.c.members.length >= MAX_MEMBERS) return res.json(err('This clan is full'));
      a.c.members.push(who ? who.name : name);
      clearRequests(name);
      save();
      res.json({ status: 'success' });
    });
    app.post('/clan/decline', (req, res) => {
      const a = actor(req, res); if (!a) return;
      if (!canManage(a.role)) return res.json(err('Only the leader or an officer can do this'));
      if (!drop(a.c.requests, String(req.body.name || ''))) return res.json(err('No such request'));
      save();
      res.json({ status: 'success' });
    });

    // ---------- выйти / исключить ----------
    app.post('/clan/leave', (req, res) => {
      const a = actor(req, res); if (!a) return;
      if (!a.c) return res.json(err('You are not in a clan'));
      if (a.role === 'leader') {
        if (a.c.members.length > 1) return res.json(err('Make someone else the leader first, or disband the clan'));
        disband(a.c);
        return res.json({ status: 'success', disbanded: true });
      }
      drop(a.c.members, a.u.name); drop(a.c.officers, a.u.name);
      save();
      res.json({ status: 'success' });
    });

    app.post('/clan/kick', (req, res) => {
      const a = actor(req, res); if (!a) return;
      if (!canManage(a.role)) return res.json(err('Only the leader or an officer can do this'));
      const name = String(req.body.name || '');
      const role = roleOf(a.c, name);
      if (!role) return res.json(err('This player is not in your clan'));
      if (role === 'leader' || low(name) === low(a.u.name)) return res.json(err('You cannot remove this player'));
      if (role === 'officer' && a.role !== 'leader') return res.json(err('Only the leader can remove an officer'));
      drop(a.c.members, name); drop(a.c.officers, name);
      save();
      res.json({ status: 'success' });
    });

    // ---------- роли (только лидер) ----------
    function leaderOnly(req, res) {
      const a = actor(req, res); if (!a) return null;
      if (a.role !== 'leader') { res.json(err('Only the leader can do this')); return null; }
      return a;
    }
    app.post('/clan/promote', (req, res) => {
      const a = leaderOnly(req, res); if (!a) return;
      const name = String(req.body.name || '');
      if (roleOf(a.c, name) !== 'member') return res.json(err('Only a regular member can become an officer'));
      if (a.c.officers.length >= MAX_OFFICERS) return res.json(err('At most ' + MAX_OFFICERS + ' officers'));
      a.c.officers.push(a.c.members.find(n => low(n) === low(name)));
      save();
      res.json({ status: 'success' });
    });
    app.post('/clan/demote', (req, res) => {
      const a = leaderOnly(req, res); if (!a) return;
      if (!drop(a.c.officers, String(req.body.name || ''))) return res.json(err('This player is not an officer'));
      save();
      res.json({ status: 'success' });
    });
    app.post('/clan/transfer', (req, res) => {
      const a = leaderOnly(req, res); if (!a) return;
      const name = String(req.body.name || '');
      if (low(name) === low(a.u.name) || !roleOf(a.c, name)) return res.json(err('Pick another member of your clan'));
      const target = a.c.members.find(n => low(n) === low(name));
      drop(a.c.officers, target);
      if (a.c.officers.length < MAX_OFFICERS) a.c.officers.push(a.c.leader);
      a.c.leader = target;
      save();
      res.json({ status: 'success' });
    });

    app.post('/clan/edit', (req, res) => {
      const a = leaderOnly(req, res); if (!a) return;
      if (req.body.desc !== undefined) a.c.desc = clean(req.body.desc, DESC_MAX);
      if (req.body.color !== undefined) {
        if (!HEX.test(String(req.body.color))) return res.json(err('Bad color'));
        a.c.color = String(req.body.color).toLowerCase();
      }
      if (req.body.open !== undefined) a.c.open = !(req.body.open === false || req.body.open === 'false' || req.body.open === '0');
      save();
      res.json({ status: 'success', clan: summary(a.c) });
    });

    /* Распустить может лидер свой клан, а владелец сайта — любой (например,
       с оскорбительным названием): тот же приём, что у удаления чужих карт. */
    app.post('/clan/disband', (req, res) => {
      const a = actor(req, res); if (!a) return;
      let c = a.role === 'leader' ? a.c : null;
      if (!c && req.body.id !== undefined && acc.isOwner(a.u)) c = byId(req.body.id);
      if (!c) return res.json(err('Only the leader can disband the clan'));
      disband(c);
      res.json({ status: 'success' });
    });
  }

  return { register, reload: load, clanOf, renameMember, pendingFor, flush: writeNow,
           _db: () => db, LIMITS: { NAME_MIN, NAME_MAX, MAX_MEMBERS, MAX_OFFICERS, MAX_REQUESTS, DESC_MAX } };
}

module.exports = make(path.join(__dirname, 'data', 'clans.json'));
module.exports.make = make;
