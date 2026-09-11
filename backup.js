// ============ РЕЗЕРВНОЕ КОПИРОВАНИЕ ============
// Владелец скачивает всё содержимое папки data одним JSON-файлом и
// восстанавливает его на другом сервере: аккаунты, монеты, скины, карты,
// новости и медиа шоу. Без этого файла новый сервер всегда стартует
// с пустыми данными — переезжать было бы не на что.
//
// Права: оба маршрута только для владельца, сервер проверяет это на
// каждый запрос (как у adminAbuse.js — чужому «Not found», чтобы о
// существовании маршрута никто не узнал).
//
// Почему восстановление перечитывает данные сразу, без перезапуска:
// на Railway диск без Volume стирается при каждом деплое, поэтому
// схема «загрузил файл и перезапусти сервис» там теряла бы данные
// обратно. reloadAll() заставляет модули перечитать свои JSON с диска.

const fs = require('fs');
const path = require('path');
const express = require('express');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

/* Лимиты. Обычного режима хватает почти всегда: картинки скинов и новостей
   по 12 МБ максимум, JSON-ы — килобайты. ?full=1 нужен, только если в шоу
   лежат большие видео (самое большое шоу-файл — 40 МБ). Тотал подобран так,
   чтобы разбор запроса не съел память контейнера на 1 ГБ. */
const CAPS = {
  std:  { file: 25 * 1024 * 1024, total: 120 * 1024 * 1024 },
  full: { file: 65 * 1024 * 1024, total: 150 * 1024 * 1024 }
};
const MAX_FILES = 5000;

function walk(dir, base, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (e) { return; }                      // data/ ещё не создана — бэкап пустой
  entries.forEach(e => {
    const full = path.join(dir, e.name);
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) walk(full, rel, out);
    else if (e.isFile()) out.push({ name: rel, file: full });
  });
}

function collect(mode) {
  const cap = CAPS[mode] || CAPS.std;
  const files = [];
  walk(DATA_DIR, '', files);
  const out = { files: [], skipped: [], total: 0 };
  files.forEach(f => {
    let size = 0;
    try { size = fs.statSync(f.file).size; } catch (e) { return; }
    if (out.files.length >= MAX_FILES || size > cap.file || out.total + size > cap.total) {
      out.skipped.push({ name: f.name, size: size });
      return;
    }
    try {
      out.files.push({ name: f.name, size: size,
                       data: fs.readFileSync(f.file).toString('base64') });
      out.total += size;
    } catch (e) { out.skipped.push({ name: f.name, size: size }); }
  });
  return out;
}

/* Защита пути: имя файла из бэкапа не имеет права выйти из data/.
   Проверяем строку и уже готовый абсолютный путь — двойная страховка
   от «../», абсолютных путей и обратных слэшей Windows. */
function safePath(name) {
  if (typeof name !== 'string' || !name.length || name.length > 200) return null;
  if (name.indexOf('\\') !== -1 || name.indexOf('..') !== -1) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._\/-]*$/.test(name)) return null;
  const full = path.join(DATA_DIR, name);
  const norm = path.normalize(DATA_DIR + path.sep);
  return full.indexOf(norm) === 0 ? full : null;
}

function register(app, hooks) {
  const acc = () => (hooks && hooks.acc ? hooks.acc() : null);

  const owner = (req, res) => {
    const a = acc();
    let u = null;
    try { u = a && a.currentUser(req); } catch (e) { u = null; }
    if (u && a.isOwner(u)) return true;
    res.status(404).send('Not found');
    return false;
  };

  // ---------- скачать всё содержимое data/ одним файлом ----------
  app.get('/owner/backup', (req, res) => {
    if (!owner(req, res)) return;
    const mode = req.query.full === '1' ? 'full' : 'std';
    const c = collect(mode);
    const stamp = new Date().toISOString().slice(0, 10);
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.set('Content-Disposition',
            'attachment; filename="aibrofist-backup-' + stamp + '.json"');
    res.set('Cache-Control', 'no-store');
    res.json({
      app: 'AIBROFIST', backup: 1, mode: mode,
      created: new Date().toISOString(),
      counts: { files: c.files.length, skipped: c.skipped.length },
      files: c.files, skipped: c.skipped
    });
  });

  // ---------- залить бэкап на этот сервер ----------
  /* Тело здесь большое (файл бэкапа целиком), поэтому свой лимит
     вешаем ДО скромных глобальных — маршрут регистрируется раньше них
     в server.js, как /abuse/upload. */
  app.post('/owner/restore',
    express.urlencoded({ extended: false, limit: '260mb' }),
    (req, res) => {
      if (!owner(req, res)) return;

      let pack;
      try { pack = JSON.parse(String((req.body && req.body.data) || '')); }
      catch (e) {
        return res.json({ status: 'error', message: 'File cannot be read — this is not an AIBROFIST backup' });
      }
      if (!pack || pack.app !== 'AIBROFIST' || !pack.backup || !Array.isArray(pack.files))
        return res.json({ status: 'error', message: 'This is not an AIBROFIST backup file' });
      if (pack.files.length > MAX_FILES)
        return res.json({ status: 'error', message: 'The backup has too many files' });

      let restored = 0;
      try {
        pack.files.forEach(f => {
          const full = safePath(f && f.name);
          if (!full) throw new Error('unsafe path in backup: ' + (f && f.name));
          const buf = Buffer.from(String(f.data || ''), 'base64');
          fs.mkdirSync(path.dirname(full), { recursive: true });
          fs.writeFileSync(full, buf);
          restored++;
        });
      } catch (e) {
        return res.json({ status: 'error', message: 'Restore interrupted: ' + e.message });
      }

      /* Сессии, созданные уже на этом сервере, должны пережить подмену
         users.json: иначе владелец вылетел бы из аккаунта посередине
         восстановления. Снимок живых сессий вливается обратно после
         перечитывания данных. */
      const a = acc();
      let kept = 0;
      try {
        const live = Object.assign({}, (a.getDb() && a.getDb().sessions) || {});
        if (hooks && hooks.reloadAll) hooks.reloadAll();
        const fresh = a.getDb();
        fresh.sessions = Object.assign(fresh.sessions || {}, live);
        if (a.save) a.save();
        kept = Object.keys(live).length;
      } catch (e) {
        // перечитать в памяти не вышло — на диске данные всё равно восстановлены
      }

      const skipped = Array.isArray(pack.skipped) ? pack.skipped.length : 0;
      res.json({
        status: 'success', restored: restored, keptSessions: kept,
        message: 'Files restored: ' + restored +
          (skipped ? ' (' + skipped + ' large files were not in the backup yet)' : '') +
          '. Data is now live.'
      });
    });
}

module.exports = { register, collect, safePath, DATA_DIR };
