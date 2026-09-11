// ============ ОБЩЕЕ ШОУ ВЛАДЕЛЬЦА ============
// Владелец задаёт погоду, летающее медиа и музыку — видят все игроки на
// всех страницах. Состояние живёт на сервере, клиенты его опрашивают.
//
// Ставить может только владелец, читать — любой.

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE_DIR = path.join(DATA_DIR, 'abuse');
const STATE = path.join(DATA_DIR, 'abuse.json');

const MAX_MEDIA = 30;                 // столько летающих штук одновременно
const MAX_GRAB  = 50;                 // столько монет можно поймать за одно шоу
const MAX_BYTES = 40 * 1024 * 1024;   // 40 МБ на файл

let state = { v: 1, weather: 'none', until: 0, count: 1, reward: false, media: [], song: null };

function load() {
  try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); }
  catch (e) { /* первый запуск — остаёмся с пустым шоу */ }
  if (!state || typeof state !== 'object')
    state = { v: 1, weather: 'none', until: 0, count: 1, media: [], song: null };
  if (!Array.isArray(state.media)) state.media = [];
}
function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify(state));
  } catch (e) { console.error('abuse.json:', e.message); }
}
function bump() { state.v = (state.v || 0) + 1; save(); }

// data:video/mp4;base64,.... -> буфер
function decode(raw) {
  const m = /^data:([\w/+.-]+);base64,([\s\S]+)$/.exec(String(raw || '').trim());
  if (!m) return { bad: 'File cannot be read' };
  let buf;
  try { buf = Buffer.from(m[2], 'base64'); }
  catch (e) { return { bad: 'File cannot be read' }; }
  if (!buf.length) return { bad: 'File is empty' };
  if (buf.length > MAX_BYTES)
    return { bad: 'File is larger than ' + Math.round(MAX_BYTES / 1048576) + ' MB' };
  return { buf, mime: m[1] };
}

// когда медиа выкидывают из шоу (лимит, очистка), файл на диске должен
// уйти вместе с ним — иначе data/abuse/ растёт вечно без предела
function unlinkAbuseFile(url) {
  if (typeof url !== 'string' || url.indexOf('/abusefile/') !== 0) return;
  const name = url.slice('/abusefile/'.length);
  if (!/^[A-Za-z0-9]+\.[A-Za-z0-9]+$/.test(name)) return;   // чужая/внешняя ссылка — не трогаем
  try { fs.unlinkSync(path.join(FILE_DIR, name)); } catch (e) {}
}

const EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/mp4': 'm4a'
};

function register(app, acc) {
  const { currentUser, isOwner } = acc;
  load();

  const guard = (req, res) => {
    if (isOwner(currentUser(req))) return true;
    res.json({ status: 'error', message: 'Owner only' });
    return false;
  };

  // читают все: шоу должно быть видно каждому игроку
  app.get('/abuse/state', (req, res) => res.json(state));

  app.post('/abuse/upload', (req, res) => {
    if (!guard(req, res)) return;
    const d = decode(req.body.data);
    if (d.bad) return res.json({ status: 'error', message: d.bad });
    const ext = EXT[d.mime] || 'bin';
    const name = Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.' + ext;
    try {
      fs.mkdirSync(FILE_DIR, { recursive: true });
      fs.writeFileSync(path.join(FILE_DIR, name), d.buf);
    } catch (e) {
      return res.json({ status: 'error', message: 'Failed to save: ' + e.message });
    }
    res.json({ status: 'success', url: '/abusefile/' + name, mime: d.mime });
  });

  /* Поймал монету — получил настоящую. Считаем на сервере: клиент может
     врать сколько угодно, поэтому проверяем, что шоу монет вообще идёт,
     и держим потолок на игрока за одно шоу. */
  const grabbed = {};        // "имя::шоу" -> сколько уже поймал
  app.post('/abuse/coin', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Account required' });
    if (state.weather !== 'coins' || !state.reward)
      return res.json({ status: 'error', message: 'No coins are being given out right now' });
    // шоу живёт минуту: дольше монеты всё равно не летят
    if (!state.shotAt || Date.now() - state.shotAt > 60000)
      return res.json({ status: 'error', message: 'The show is already over' });

    const key = String(u.name).toLowerCase() + '::' + state.shotAt;
    const cap = Math.min(MAX_GRAB, state.count || 1);
    grabbed[key] = grabbed[key] || 0;
    if (grabbed[key] >= cap)
      return res.json({ status: 'error', message: 'That\'s enough for you' });

    grabbed[key]++;
    u.coins = (u.coins || 0) + 1;
    if (typeof acc.save === 'function') acc.save();
    res.json({ status: 'success', coins: u.coins, left: cap - grabbed[key] });
  });

  app.post('/abuse/set', (req, res) => {
    if (!guard(req, res)) return;
    const what = String(req.body.what || '');

    if (what === 'weather') {
      const w = String(req.body.weather || 'none');
      // раздавать ли настоящие монеты за пойманные
      state.reward = String(req.body.reward) === 'true';
      const known = ['none', 'rain', 'hail', 'snow', 'sun', 'nuke', 'coins'];
      state.weather = known.indexOf(w) === -1 ? 'none' : w;

      // сколько штук: взрывов или монет
      state.count = Math.max(1, Math.min(300, parseInt(req.body.count, 10) || 1));

      /* Сколько секунд держать. Ноль — до ручного выключения. Взрыв и
         монеты идут пачкой и гаснут сами, им длительность не нужна. */
      const secs = Math.max(0, Math.min(3600, parseInt(req.body.secs, 10) || 0));
      state.until = (secs && state.weather !== 'none') ? Date.now() + secs * 1000 : 0;

      // одноразовые помечаем временем: клиент отыграет их ровно один раз
      if (state.weather === 'nuke' || state.weather === 'coins') {
        state.shotAt = Date.now();
        /* Счётчик пойманных монет хранится по ключу «имя::шоу» —
           при старте нового шоу ключи прошлых шоу больше не нужны:
           без чистки карта росла бы месяцами. */
        const cur = String(state.shotAt);
        Object.keys(grabbed).forEach(k => {
          if (k.slice(k.lastIndexOf('::') + 2) !== cur) delete grabbed[k];
        });
      }
      bump();
      return res.json({ status: 'success', state });
    }

    if (what === 'media') {
      const url = String(req.body.url || '').trim();
      if (!url) return res.json({ status: 'error', message: 'No URL provided' });
      state.media.push({
        url,
        kind: String(req.body.kind || 'image'),
        dir: ['up', 'down', 'left', 'right'].indexOf(req.body.dir) === -1 ? 'right' : req.body.dir,
        v: Math.max(0.5, Math.min(60, parseFloat(req.body.v) || 4)),
        s: Math.max(20, Math.min(4000, parseFloat(req.body.s) || 120)),
        // размер во весь экран каждый игрок считает по своему окну
        full: String(req.body.full) === 'true',
        sound: String(req.body.sound) === 'true'
      });
      while (state.media.length > MAX_MEDIA) unlinkAbuseFile(state.media.shift().url);
      bump();
      return res.json({ status: 'success', count: state.media.length });
    }

    if (what === 'mediaClear') {
      state.media.forEach(m => unlinkAbuseFile(m.url));
      state.media = []; bump(); return res.json({ status: 'success' });
    }

    if (what === 'song') {
      const url = String(req.body.url || '').trim();
      state.song = url ? { url, vol: Math.max(0, Math.min(1, parseFloat(req.body.vol) || 0.7)) } : null;
      bump();
      return res.json({ status: 'success' });
    }

    if (what === 'clear') {
      state.media.forEach(m => unlinkAbuseFile(m.url));
      state = { v: (state.v || 0) + 1, weather: 'none', until: 0, count: 1,
                media: [], song: null };
      save();
      return res.json({ status: 'success' });
    }

    res.json({ status: 'error', message: 'Unknown action' });
  });
}

module.exports = { register, reload: load, FILE_DIR };
