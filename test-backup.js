/* Резервное копирование: сбор data/, восстановление, защита путей и прав. */
const fs = require('fs'), os = require('os'), path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-'));
let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };

const backup = require('./backup.js');

console.log('защита путей:');
ok('обычное имя проходит', !!backup.safePath('users.json'));
ok('вложенное проходит', !!backup.safePath('skinimg/abc123.png'));
ok('../ наружу не пускаем', !backup.safePath('../evil.json'));
ok('.. внутри тоже не пускаем', !backup.safePath('skinimg/../users.json'));
ok('абсолютный путь не пускаем', !backup.safePath('/etc/passwd'));
ok('обратный слэш не пускаем', !backup.safePath('skinimg\\x.png'));
ok('точка в начале не пускается', !backup.safePath('.hidden'));
ok('пустое имя не пускается', !backup.safePath(''));
ok('не строка не пускается', !backup.safePath(123));
const resolved = backup.safePath('skinimg/a.png');
ok('путь сходится в data/', resolved.indexOf(backup.DATA_DIR + path.sep) === 0);

/* фальшивый express: собираем маршруты, отдаем последний обработчик */
const R = {};
const app = {
  get: (p, h) => { R['GET ' + p] = h; },
  post: (p, ...xs) => { R['POST ' + p] = xs[xs.length - 1]; }
};

/* фальшивые аккаунты: владелец System, сессии и сохранение считаются */
const st = { user: { name: 'System' }, db: { sessions: {} }, saved: 0, reloads: 0 };
backup.register(app, {
  acc: () => ({
    currentUser: () => st.user,
    isOwner: u => !!u && String(u.name).toLowerCase() === 'system',
    getDb: () => st.db,
    save: () => { st.saved++; }
  }),
  reloadAll: () => { st.reloads++; }        // как accounts.load(): подменяем db
});

function resMock() {
  return {
    headers: {}, code: 200, body: null,
    set(k, v) { this.headers[k] = v; return this; },
    status(c) { this.code = c; return this; },
    json(o) { this.body = o; return this; },
    send(s) { this.body = s; return this; }
  };
}
const call = (k, req) => { const r = resMock(); R[k](req, r); return r; };

const DATA = process.env.DATA_DIR;

console.log('\nправа доступа:');
st.user = { name: 'qwied' };                 // обычный игрок, не владелец
let r = call('GET /owner/backup', { query: {}, headers: {} });
ok('чужому бэкап не отдаётся', r.code === 404 && r.body === 'Not found');
r = call('POST /owner/restore', { body: { data: '{}' }, headers: {} });
ok('чужой не восстанавливает', r.code === 404);
st.user = null;
r = call('GET /owner/backup', { query: {}, headers: {} });
ok('без входа тоже 404', r.code === 404);
st.user = { name: 'System' };

console.log('\nсбор бэкапа:');
fs.writeFileSync(path.join(DATA, 'users.json'), JSON.stringify({ users: { system: { name: 'System', coins: 5 } }, sessions: {} }));
fs.mkdirSync(path.join(DATA, 'skinimg'));
fs.writeFileSync(path.join(DATA, 'skinimg', 'aaa.png'), Buffer.from([0x89, 0x50, 0x4E, 0x47, 1, 2, 3]));
fs.writeFileSync(path.join(DATA, 'maps.json'), '{"maps":[]}');
// тяжёлый файл: в обычный бэкап не влезает, в full входит
fs.writeFileSync(path.join(DATA, 'abuse-big.mp4'), Buffer.alloc(26 * 1024 * 1024, 7));

r = call('GET /owner/backup', { query: {}, headers: {} });
ok('владелец получает бэкап', r.body && r.body.app === 'AIBROFIST' && r.body.backup === 1);
ok('отдаётся как файл', /attachment/.test(r.headers['Content-Disposition'] || ''), r.headers['Content-Disposition']);
ok('имя файла с датой', /aibrofist-backup-\d{4}-\d{2}-\d{2}\.json/.test(r.headers['Content-Disposition'] || ''));
const names = r.body.files.map(f => f.name);
ok('users.json внутри', names.indexOf('users.json') !== -1);
ok('картинка скина внутри', names.indexOf('skinimg/aaa.png') !== -1);
ok('карты внутри', names.indexOf('maps.json') !== -1);
ok('тяжёлый файл пропущен', r.body.skipped.some(s => s.name === 'abuse-big.mp4'));
const png = r.body.files.find(f => f.name === 'skinimg/aaa.png');
ok('картинка едет базой64 и читается обратно',
   Buffer.from(png.data, 'base64').equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 1, 2, 3])));

r = call('GET /owner/backup', { query: { full: '1' }, headers: {} });
ok('в full тяжёлый файл входит', r.body.files.some(f => f.name === 'abuse-big.mp4'));

console.log('\nвосстановление:');
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const goodPack = {
  app: 'AIBROFIST', backup: 1,
  files: [
    { name: 'users.json', data: b64('{"users":{"old":{"name":"Old","coins":77}},"sessions":{"sid_old":"Old"}}') },
    { name: 'maps.json', data: b64('{"maps":[{"mapName":"Стадион"}]}') },
    { name: 'skinimg/restored.png', data: b64('PNGDATA') }
  ]
};
st.db.sessions = { sid_live: 'System' };        // сессия владельца на новом сервере
// reloadAll как настоящий: подменяет базу — так делает accounts.load()
const realReload = () => { st.db = JSON.parse(fs.readFileSync(path.join(DATA, 'users.json'), 'utf8')); };
backup.register({ get: () => {}, post: (p, mid, h) => { R['POST2 ' + p] = h; } }, {
  acc: () => ({
    currentUser: () => st.user,
    isOwner: u => !!u && String(u.name).toLowerCase() === 'system',
    getDb: () => st.db, save: () => { st.saved++; }
  }),
  reloadAll: () => { realReload(); st.reloads++; }
});
r = call('POST2 /owner/restore', { body: { data: JSON.stringify(goodPack) } });
ok('восстановление успешно', r.body.status === 'success', r.body.message);
ok('все три файла легли на диск', r.body.restored === 3);
ok('users.json заменён', JSON.parse(fs.readFileSync(path.join(DATA, 'users.json'), 'utf8')).users.old.coins === 77);
ok('картинка восстановлена', fs.readFileSync(path.join(DATA, 'skinimg', 'restored.png'), 'utf8') === 'PNGDATA');
ok('данные перечитаны без перезапуска', st.reloads === 1);
ok('сессия владельца пережила подмену', !!st.db.sessions.sid_live);
ok('сессия из бэкапа тоже на месте', st.db.sessions.sid_old === 'Old');
ok('база пересохранена со сессиями', st.saved > 0);

console.log('\nотбой плохих файлов:');
r = call('POST2 /owner/restore', { body: { data: 'не json' } });
ok('битый json отклонён', r.body.status === 'error');
r = call('POST2 /owner/restore', { body: { data: JSON.stringify({ app: 'ДРУГОЕ', backup: 1, files: [] }) } });
ok('чужой бэкап отклонён', r.body.status === 'error');
const evil = { app: 'AIBROFIST', backup: 1, files: [{ name: '../outside.txt', data: b64('x') }] };
r = call('POST2 /owner/restore', { body: { data: JSON.stringify(evil) } });
ok('путь ../ останавливает восстановление', r.body.status === 'error', r.body.message);
ok('за пределы data ничего не записано',
   !fs.existsSync(path.join(path.dirname(DATA), 'outside.txt')));
const evil2 = { app: 'AIBROFIST', backup: 1, files: [{ name: 'skinimg\\bad.png', data: b64('x') }] };
r = call('POST2 /owner/restore', { body: { data: JSON.stringify(evil2) } });
ok('обратный слэш останавливает', r.body.status === 'error');
r = call('POST2 /owner/restore', { body: { data: undefined } });
ok('пустое тело отклонено', r.body.status === 'error');

console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
process.exit(fails ? 1 : 0);
