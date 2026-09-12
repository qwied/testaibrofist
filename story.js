// ============ STORY MODE: приватная комната на двоих по коду ссылки ============
/* Пригласить друга сыграть вместе на конкретной (не случайной) карте с
   настраиваемым лимитом времени — community-запрос. Поддерживает Race и
   Hide and Seek: у обоих режимов уже есть готовая, проверенная логика
   раунда (у Race — индивидуальный финиш по времени, у Hide and Seek —
   серверные фазы лобби/охоты в hsRooms из server.js), Story только
   переиспользует её с фиксированной картой вместо случайной и с общим
   лимитом времени на всю сессию вместо стандартного.

   Приватная комната сама по себе не новая возможность — game.js уже
   умеет войти в комнату по ?room=<код> в обход обычного подбора
   /getBestRoom (см. game.js, ROOM). Этот файл только: 1) создаёт
   комнату с конкретной картой, режимом и лимитом времени по запросу
   владельца, 2) отдаёт эти же данные любому, кто пришёл по ссылке с
   этим кодом — так оба игрока получают одну и ту же карту, даже если
   сама ссылка, разосланная другу, короче (несёт только код комнаты).
   Лимит времени для Hide and Seek применяет server.js (hsRooms) —
   отдельным таймером на всю сессию, см. hsEndStory там. */
'use strict';

const crypto = require('crypto');

const MIN_LIMIT_MIN = 1, MAX_LIMIT_MIN = 60;
const ROOM_TTL = 6 * 60 * 60 * 1000;   // старые ссылки-приглашения не нужны вечно
const ALLOWED_MODES = ['race', 'hideAndSeek'];

const rooms = new Map();   // код -> { author, mapName, mode, limitMs, owner, createdAt }

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

    const mode = ALLOWED_MODES.indexOf(req.body.mode) !== -1 ? req.body.mode : 'race';
    const author = String(req.body.author || '').trim();
    const mapName = String(req.body.mapName || '').trim();
    const m = maps.find(author, mapName);
    if (!m) return res.json({ status: 'error', message: 'Map not found' });
    if (m.mapType !== mode)
      return res.json({ status: 'error', message: 'This map does not match the selected mode' });

    let limitMin = parseInt(req.body.limitMin, 10);
    if (!Number.isFinite(limitMin)) limitMin = 10;
    limitMin = Math.max(MIN_LIMIT_MIN, Math.min(MAX_LIMIT_MIN, limitMin));

    const code = 'story_' + crypto.randomBytes(5).toString('hex');
    rooms.set(code, {
      author: m.author, mapName: m.mapName, mode, limitMs: limitMin * 60000,
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
    res.json({ status: 'success', author: r.author, mapName: r.mapName, mode: r.mode || 'race', limitMs: r.limitMs });
  });
}

// server.js спрашивает лимит времени комнаты для hsRooms — без удаления
// и без сброса TTL, это просто чтение
function getRoom(code) {
  cleanup();
  return rooms.get(String(code || '')) || null;
}

module.exports = { register, reload: () => {}, getRoom };
