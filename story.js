// ============ STORY MODE: приватная комната на двоих по коду ссылки ============
/* Пригласить друга сыграть вместе на конкретной (не случайной) карте с
   настраиваемым лимитом времени — community-запрос. Ограничено картами
   режима Race: у Race уже есть готовая, проверенная логика финиша по
   времени без ролей искателя/прячущегося — то, что и нужно для игры
   вдвоём по-дружески, без переделки состояния Hide and Seek (лобби,
   рулетка искателя) под двух конкретных людей.

   Приватная комната сама по себе не новая возможность — game.js уже
   умеет войти в комнату по ?room=<код> в обход обычного подбора
   /getBestRoom (см. game.js, ROOM). Этот файл только: 1) создаёт
   комнату с конкретной картой и лимитом времени по запросу владельца,
   2) отдаёт эти же данные любому, кто пришёл по ссылке с этим кодом —
   так оба игрока получают одну и ту же карту, даже если сама ссылка,
   разосланная другу, короче (несёт только код комнаты). */
'use strict';

const crypto = require('crypto');

const MIN_LIMIT_MIN = 1, MAX_LIMIT_MIN = 60;
const ROOM_TTL = 6 * 60 * 60 * 1000;   // старые ссылки-приглашения не нужны вечно

const rooms = new Map();   // код -> { author, mapName, limitMs, owner, createdAt }

function cleanup() {
  const now = Date.now();
  for (const [code, r] of rooms) if (now - r.createdAt > ROOM_TTL) rooms.delete(code);
}

function register(app, acc) {
  const { currentUser } = acc;
  const maps = require('./maps.js');

  app.post('/story/create', (req, res) => {
    cleanup();
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Sign in first' });

    const author = String(req.body.author || '').trim();
    const mapName = String(req.body.mapName || '').trim();
    const m = maps.find(author, mapName);
    if (!m) return res.json({ status: 'error', message: 'Map not found' });
    if (m.mapType !== 'race')
      return res.json({ status: 'error', message: 'Story Mode currently supports Race maps only' });

    let limitMin = parseInt(req.body.limitMin, 10);
    if (!Number.isFinite(limitMin)) limitMin = 10;
    limitMin = Math.max(MIN_LIMIT_MIN, Math.min(MAX_LIMIT_MIN, limitMin));

    const code = 'story_' + crypto.randomBytes(5).toString('hex');
    rooms.set(code, {
      author: m.author, mapName: m.mapName, limitMs: limitMin * 60000,
      owner: u.name, createdAt: Date.now()
    });
    res.json({ status: 'success', room: code });
  });

  // читает кто угодно, у кого есть код комнаты — сам код уже секрет
  // (случайные 10 hex-символов), отдельной проверки прав тут не нужно,
  // как и у обычных публичных комнат Hide and Seek/Race
  app.get('/story/roomInfo', (req, res) => {
    const r = rooms.get(String(req.query.room || ''));
    if (!r) return res.json({ status: 'error', message: 'This Story link expired or does not exist' });
    res.json({ status: 'success', author: r.author, mapName: r.mapName, limitMs: r.limitMs });
  });
}

module.exports = { register, reload: () => {} };
