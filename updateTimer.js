// ============ ТАЙМЕР ДО ОБНОВЛЕНИЯ ============
// Владелец ставит время, игроки видят обратный отсчёт в углу экрана.
// Ставить может только владелец, читать — все.

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'update.json');

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch (e) { return { at: 0 }; }
}
function save(v) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(v));
  } catch (e) { console.error('update.json:', e.message); }
}

function register(app, acc) {
  const { currentUser, isOwner } = acc;

  // читают все: отсчёт видят игроки, а не только владелец
  app.get('/update/get', (req, res) => {
    const d = load();
    const left = d.at ? d.at - Date.now() : 0;
    res.json({ at: d.at || 0, left: left > 0 ? left : 0 });
  });

  app.post('/update/set', (req, res) => {
    const u = currentUser(req);
    if (!isOwner(u)) return res.json({ status: 'error', message: 'Только для владельца' });

    /* Принимаем и секунды, и минуты: панель шлёт секунды, но старые
       вызовы с минутами тоже должны работать. */
    let secs = parseInt(req.body.seconds, 10);
    if (!Number.isFinite(secs)) secs = (parseInt(req.body.minutes, 10) || 0) * 60;
    secs = Math.max(0, Math.min(60 * 60 * 24 * 30, secs || 0));
    const at = secs ? Date.now() + secs * 1000 : 0;
    save({ at: at });
    res.json({ status: 'success', at: at });
  });
}

module.exports = { register };
