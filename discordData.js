// ============ ДАННЫЕ ДЛЯ ОТВЕТОВ БОТА: /servers и /account ============
// Что видно на странице Servers и на странице игрока — простыми объектами.
// Разметку из них собирает discordViews.js, отправляет discordBot.js; здесь
// ни картинок, ни браузера. Источник можно подменить (setSource) — так
// тесты бота обходятся без настоящей базы игроков.
'use strict';

/* ---------- данные ----------
   Источник можно подменить (setSource) — так тесты бота обходятся без
   настоящей базы игроков. */
function serversData() {
  const a = require('./serversInfo.js').summary();
  const s = a.aibrofist;
  return { at: a.at, online: s.online, rooms: s.rooms, modes: s.modes,
           list: s.list.map(r => ({ mode: r.mode, room: r.room, players: r.players, limit: r.limit, status: r.status,
                                    phase: r.phase, secondsLeft: r.secondsLeft, map: r.map })) };
}

const DAY = 24 * 60 * 60 * 1000;
function sumFor(log, k, key, since) {
  let s = 0;
  for (const e of log || []) if (e.at >= since && key(e.name) === k) s += Number(e.amount) || 0;
  return s;
}
/* Всё, что видно на странице игрока (users.html): ник, дата регистрации,
   монеты и очки за день/неделю/всё время, ранги, «о себе», карты и
   друзья. Ничего сверх страницы — ни почты, ни входов, ни настроек. */
function realProfile(name) {
  const acc = require('./accounts.js');
  const db = acc.getDb();
  const k = acc.key(name);
  const u = k && db.users[k];
  if (!u) return null;
  const now = Date.now();
  let rank = null;
  try { const r = require('./ranks.js').forName(db, u.name); rank = { race: r.race, hs: r.hs }; } catch (e) { rank = null; }
  let maps = [];
  try {
    const M = require('./maps.js');
    maps = M.allMaps().filter(m => acc.key(m.author) === k).map(m => {
      const tl = M.tally(m);
      return { mapName: m.mapName, mapType: m.mapType, rating: tl.rating, likes: tl.likes, dislikes: tl.dislikes,
               date: m.date || 0, inGame: !!m.inGame };
    }).sort((a, b) => (b.date || 0) - (a.date || 0));
  } catch (e) { maps = []; }
  const friends = (u.friends || []).map(n => db.users[acc.key(n)]).filter(Boolean)
    .map(f => ({ name: f.name, lastSeen: f.lastSeen || 0 }))
    .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  const coinLog = acc.getCoinLog ? acc.getCoinLog() : [], scoreLog = acc.getScoreLog ? acc.getScoreLog() : [], hsLog = acc.getHsLog ? acc.getHsLog() : [];
  return {
    at: now, name: u.name, joined: u.joined || 0, about: String(u.about || ''),
    coins: u.coins || 0, coinsDay: sumFor(coinLog, k, acc.key, now - DAY), coinsWeek: sumFor(coinLog, k, acc.key, now - 7 * DAY),
    score: u.score || 0, scoreDay: sumFor(scoreLog, k, acc.key, now - DAY), scoreWeek: sumFor(scoreLog, k, acc.key, now - 7 * DAY),
    hsScore: u.hsScore || 0, hsScoreDay: sumFor(hsLog, k, acc.key, now - DAY), hsScoreWeek: sumFor(hsLog, k, acc.key, now - 7 * DAY),
    rank, maps, mapsCount: maps.length, friends, friendsCount: friends.length
  };
}
// ники для подсказок в /account: сначала начинающиеся с введённого, потом содержащие
function realSearch(q, limit) {
  const acc = require('./accounts.js');
  const s = String(q || '').trim().toLowerCase();
  const names = Object.values(acc.getDb().users).map(u => u.name).filter(Boolean);
  const starts = [], has = [];
  for (const n of names) {
    const l = n.toLowerCase();
    if (!s || l.indexOf(s) === 0) starts.push(n); else if (l.indexOf(s) !== -1) has.push(n);
  }
  starts.sort((a, b) => a.length - b.length || a.localeCompare(b));
  has.sort((a, b) => a.length - b.length || a.localeCompare(b));
  return starts.concat(has).slice(0, limit || 25);
}
let source = { profile: realProfile, search: realSearch };
function setSource(s) { source = Object.assign({ profile: realProfile, search: realSearch }, s || {}); }
const profileData = name => source.profile(name);
const searchNames = (q, limit) => source.search(q, limit);

module.exports = { serversData, profileData, searchNames, setSource, _test: { realProfile, realSearch } };
