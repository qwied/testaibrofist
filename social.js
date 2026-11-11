/* Общение и профиль (идеи игроков): репутация игрока (лайк/дизлайк профилю), короткий статус под
   ником, «Зал славы» (лучшие авторы карт, гонщики, охотники, уровни) и общий чат на главной —
   короткая лента последних сообщений вошедших в аккаунт, без комнат и истории на диске. */
'use strict';
const low = s => String(s || '').toLowerCase();
const CHAT_MAX = 60, CHAT_GAP = 3000;
const chat = [];
let chatId = 0;
function clean(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n); }

function register(app, acc) {
  const userOf = name => acc.getDb().users[acc.key(name)];
  const repOf = u => Object.keys(u.repVotes || {}).reduce((a, k) => a + (u.repVotes[k] | 0), 0);

  app.get('/profileExtra', (req, res) => {
    const u = userOf(req.query.name), me = acc.currentUser(req);
    if (!u) return res.json(null);
    res.json({ rep: repOf(u), status: u.status || '', link: u.link || '', myVote: me && u.repVotes ? (u.repVotes[low(me.name)] | 0) : 0 });
  });
  app.post('/rep', (req, res) => {
    const me = acc.currentUser(req), u = userOf(req.body.name);
    if (!me) return res.json({ status: 'error', message: 'Sign in first' });
    if (!u || u === me) return res.json({ status: 'error', message: 'No such player' });
    const v = Math.max(-1, Math.min(1, parseInt(req.body.v) || 0));
    if (!u.repVotes || typeof u.repVotes !== 'object') u.repVotes = {};
    if (v) u.repVotes[low(me.name)] = v; else delete u.repVotes[low(me.name)];
    acc.save();
    res.json({ status: 'success', rep: repOf(u), myVote: v });
  });
  app.post('/setStatus', (req, res) => {
    const me = acc.currentUser(req);
    if (!me) return res.json({ status: 'error', message: 'Sign in first' });
    me.status = clean(req.body.status, 60);
    // ссылка в профиле — только http(s)
    const link = clean(req.body.link, 120);
    me.link = /^https?:\/\/[^\s"']+$/i.test(link) ? link : '';
    acc.save();
    res.json({ status: 'success', statusText: me.status, link: me.link });
  });

  // ---------- Зал славы ----------
  app.get('/hallOfFame', (req, res) => {
    const users = Object.values(acc.getDb().users || {});
    const top = (fn) => users.map(u => ({ name: u.name, v: fn(u) | 0 })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 5);
    const likes = {};
    try {
      const maps = require('./maps.js');
      maps.allMaps().forEach(m => { const t = maps.tally(m); likes[low(m.author)] = (likes[low(m.author)] || 0) + (t.likes || 0); });
    } catch (e) {}
    res.json({
      creators: top(u => likes[low(u.name)] || 0),
      racers: top(u => u.rcFin || 0),
      hunters: top(u => u.hsCat || 0),
      levels: top(u => (u.score || 0) + (u.hsScore || 0))
    });
  });

  // ---------- общий чат на главной ----------
  app.get('/lobbyChat', (req, res) => {
    const after = parseInt(req.query.after) || 0;
    res.json({ messages: chat.filter(m => m.id > after) });
  });
  app.post('/lobbyChat', (req, res) => {
    const me = acc.currentUser(req);
    if (!me) return res.json({ status: 'error', message: 'Sign in to chat' });
    if (Date.now() - (me._lobbyAt || 0) < CHAT_GAP) return res.json({ status: 'error', message: 'Not so fast' });
    const text = clean(req.body.text, 140);
    if (!text) return res.json({ status: 'error', message: 'Empty message' });
    me._lobbyAt = Date.now();
    chat.push({ id: ++chatId, name: me.name, text, at: Date.now() });
    while (chat.length > CHAT_MAX) chat.shift();
    res.json({ status: 'success', id: chatId });
  });
}
module.exports = { register };
