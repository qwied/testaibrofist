/* Картинки в новостях: кто может грузить, что принимает сервер,
   что видит игрок и остаётся ли мусор на диске.

   Работаем на копии extras.js во временной папке — настоящий data/
   с живыми новостями тест не трогает. */
const fs = require('fs'), os = require('os'), path = require('path');

let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-logs-'));
fs.mkdirSync(path.join(TMP, 'data'));
// старая новость без поля images — проверим, что чтение её не сломает
fs.writeFileSync(path.join(TMP, 'data', 'logs.json'),
  JSON.stringify([{ id: 1, title: 'старая', text: 'без картинок', date: 1 }]));
['extras.js', 'maps.js'].forEach(f => fs.copyFileSync(path.join(__dirname, f), path.join(TMP, f)));

const extras = require(path.join(TMP, 'extras.js'));
const IMG_DIR = extras.IMG_DIR;

/* ---------- заглушка express ---------- */
const routes = {};
const app = { get: (p, h) => routes['GET ' + p] = h, post: (p, h) => routes['POST ' + p] = h };
let owner = true;
const acc = {
  currentUser: () => ({ name: 'System', coins: 0 }),
  isOwner: () => owner,
  isOwnerName: () => owner,
  getDb: () => ({ users: {}, sessions: {} }),
  save: () => {},
  newSession: () => {},
  verifyPassword: () => true,
  key: n => String(n).toLowerCase(),
  checkName: () => null
};
extras.register(app, acc);

const call = (k, body, query) => new Promise(r => {
  const h = routes[k];
  if (!h) return r({ status: 'error', message: 'нет маршрута ' + k });
  h({ body: body || {}, query: query || {}, headers: {}, path: '/' },
    { json: d => r(d), status: () => ({ send: () => r({}), json: d => r(d) }), send: () => r({}) });
});

/* ---------- настоящие файлы ---------- */
// 1x1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const GIF = 'data:image/gif;base64,' + Buffer.from('GIF89a' + '\u0001\u0000\u0001\u0000\u0000\u0000\u0000!', 'latin1').toString('base64');
const SVG = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="9" height="9"/></svg>').toString('base64');
const TXT = 'data:image/png;base64,' + Buffer.from('это просто текст, а не картинка').toString('base64');
const EXE = 'data:image/png;base64,' + Buffer.from('MZ\u0090\u0000\u0003').toString('base64');

const files = () => { try { return fs.readdirSync(IMG_DIR); } catch (e) { return []; } };

(async () => {
  console.log('старые новости:');
  let d = await call('GET /getLogs');
  ok('читаются без поля images', d.logs.length === 1);
  ok('images всегда массив', Array.isArray(d.logs[0].images) && d.logs[0].images.length === 0);

  console.log('\nкто может грузить:');
  owner = false;
  ok('гостю загрузка запрещена', (await call('POST /log/upload', { data: PNG })).status === 'error');
  ok('гость не публикует', (await call('POST /addLog', { title: 'взлом' })).status === 'error');
  ok('гость не правит', (await call('POST /editLog', { id: 1, title: 'взлом' })).status === 'error');
  owner = true;

  console.log('\nчто принимает сервер:');
  const up = await call('POST /log/upload', { data: PNG, w: 1, h: 1 });
  ok('PNG принят', up.status === 'success', up.message);
  ok('адрес свой и предсказуемый', /^\/logimg\/[a-z0-9]+\.png$/.test(up.url || ''), up.url);
  ok('файл лёг на диск', fs.existsSync(path.join(IMG_DIR, path.basename(up.url || 'нет'))));
  ok('GIF принят',  (await call('POST /log/upload', { data: GIF })).status === 'success');
  ok('SVG принят',  (await call('POST /log/upload', { data: SVG })).status === 'success');
  ok('текст под видом PNG отбит', (await call('POST /log/upload', { data: TXT })).status === 'error');
  ok('программа под видом PNG отбита', (await call('POST /log/upload', { data: EXE })).status === 'error');
  ok('мусор вместо файла отбит', (await call('POST /log/upload', { data: 'привет' })).status === 'error');
  const big = 'data:image/png;base64,' + Buffer.alloc(13 * 1024 * 1024).toString('base64');
  ok('больше 12 МБ отбито', (await call('POST /log/upload', { data: big })).status === 'error');

  console.log('\nпубликация:');
  const a = await call('POST /log/upload', { data: PNG });
  const b = await call('POST /log/upload', { data: PNG });
  let r = await call('POST /addLog', {
    title: 'с картинками', text: 'текст',
    images: JSON.stringify([{ u: a.url, w: 800, h: 600 }, { u: b.url, w: 100, h: 400 }])
  });
  ok('новость с картинками создана', r.status === 'success' && r.images === 2, r.message);
  d = await call('GET /getLogs');
  const withImgs = d.logs.find(l => l.title === 'с картинками');
  ok('картинки видны всем в ленте', withImgs.images.length === 2);
  ok('размеры сохранены', withImgs.images[0].w === 800 && withImgs.images[0].h === 600);

  r = await call('POST /addLog', { title: 'чужие', images: JSON.stringify(['/evil.png', 'https://site/x.png']) });
  d = await call('GET /getLogs');
  ok('чужие адреса выброшены', d.logs.find(l => l.title === 'чужие').images.length === 0);
  r = await call('POST /addLog', { title: 'выход', images: JSON.stringify(['/logimg/../data/logs.json']) });
  d = await call('GET /getLogs');
  ok('выход из папки не проходит', d.logs.find(l => l.title === 'выход').images.length === 0);
  r = await call('POST /addLog', { title: 'нет файла', images: JSON.stringify(['/logimg/aaaaaaaa.png']) });
  d = await call('GET /getLogs');
  ok('несуществующий файл не попадает в ленту', d.logs.find(l => l.title === 'нет файла').images.length === 0);

  const many = [];
  for (let i = 0; i < 12; i++) many.push((await call('POST /log/upload', { data: PNG })).url);
  await call('POST /addLog', { title: 'много', images: JSON.stringify(many) });
  d = await call('GET /getLogs');
  ok('на новость не больше восьми', d.logs.find(l => l.title === 'много').images.length === 8);

  ok('пустая новость без картинок не проходит', (await call('POST /addLog', {})).status === 'error');
  ok('новость из одних картинок можно',
     (await call('POST /addLog', { images: JSON.stringify([(await call('POST /log/upload', { data: PNG })).url]) })).status === 'success');

  console.log('\nномера новостей:');
  await call('POST /addLog', { title: 'подряд 1' });
  await call('POST /addLog', { title: 'подряд 2' });
  await call('POST /addLog', { title: 'подряд 3' });
  d = await call('GET /getLogs');
  const ids = d.logs.map(l => l.id);
  ok('номера не повторяются', new Set(ids).size === ids.length);

  console.log('\nправка:');
  const one = await call('POST /log/upload', { data: PNG });
  const two = await call('POST /log/upload', { data: PNG });
  await call('POST /addLog', { title: 'правка', images: JSON.stringify([one.url, two.url]) });
  d = await call('GET /getLogs');
  const ed = d.logs.find(l => l.title === 'правка');
  r = await call('POST /editLog', { id: ed.id, title: 'правка', text: 'дописал', images: JSON.stringify([one.url]) });
  ok('правка сохраняется', r.status === 'success', r.message);
  d = await call('GET /getLogs');
  const ed2 = d.logs.find(l => l.id === ed.id);
  ok('дата не сбилась', ed2.date === ed.date);
  ok('текст дописан', ed2.text === 'дописал');
  ok('оставленная картинка на месте', ed2.images.length === 1 && ed2.images[0].u === one.url);
  ok('убранный файл удалён с диска', !fs.existsSync(path.join(IMG_DIR, path.basename(two.url))));
  ok('оставленный файл на диске цел', fs.existsSync(path.join(IMG_DIR, path.basename(one.url))));
  ok('чужой id не правится', (await call('POST /editLog', { id: 999999, title: 'x' })).status === 'error');

  console.log('\nудаление:');
  const del = await call('POST /log/upload', { data: PNG });
  await call('POST /addLog', { title: 'на удаление', images: JSON.stringify([del.url]) });
  d = await call('GET /getLogs');
  const victim = d.logs.find(l => l.title === 'на удаление');
  await call('POST /deleteLog', { id: victim.id });
  ok('файл удалённой новости стёрт', !fs.existsSync(path.join(IMG_DIR, path.basename(del.url))));

  const shared = await call('POST /log/upload', { data: PNG });
  await call('POST /addLog', { title: 'общая 1', images: JSON.stringify([shared.url]) });
  await call('POST /addLog', { title: 'общая 2', images: JSON.stringify([shared.url]) });
  d = await call('GET /getLogs');
  await call('POST /deleteLog', { id: d.logs.find(l => l.title === 'общая 1').id });
  ok('картинку второй новости не забрали', fs.existsSync(path.join(IMG_DIR, path.basename(shared.url))));

  console.log('\nсервер и страница:');
  const srv = fs.readFileSync(__dirname + '/server.js', 'utf8');
  ok('картинки раздаются из data/logimg', /app\.use\('\/logimg'/.test(srv) && /extras\.js'\)\.IMG_DIR/.test(srv));
  ok('песочница и nosniff на раздаче',
     /'\/logimg'[\s\S]{0,320}sandbox/.test(srv) && /'\/logimg'[\s\S]{0,320}X-Content-Type-Options/.test(srv));
  ok('годовой кэш: имя файла не меняется', /'\/logimg'[\s\S]{0,420}immutable: true/.test(srv));
  ok('для загрузки поднят лимит тела', /app\.post\('\/log\/upload', express\.urlencoded\(\{ extended: false, limit: '20mb' \}\)\)/.test(srv));
  ok('общий лимит тела не тронут', /express\.urlencoded\(\{ extended: false, limit: '512kb' \}\)/.test(srv));

  const html = fs.readFileSync(__dirname + '/logs.html', 'utf8');
  ok('пропорции заданы заранее',  /aspect-ratio:/.test(html));
  ok('картинки грузятся лениво',  /loading="lazy"/.test(html) && /decoding="async"/.test(html));
  ok('битая картинка не ломает вёрстку', /classList\.add\('bad'\)/.test(html) && /Изображение недоступно/.test(html));
  ok('просмотр во весь экран',    /id="lbox"/.test(html) && /function openBox/.test(html));
  ok('Esc закрывает просмотр',    /e\.key === 'Escape'/.test(html));
  ok('выбор файлов',              /id="lFile"/.test(html) && /accept="image\/\*"/.test(html));
  ok('перетаскивание',            /dragover/.test(html) && /dataTransfer/.test(html));
  ok('вставка из буфера',         /'paste'/.test(html) && /clipboardData/.test(html));
  ok('тяжёлое ужимается в браузере', /function shrink/.test(html) && /toDataURL\('image\/webp'/.test(html));
  ok('гифки не пережимаются',     /mime === 'image\/gif'/.test(html));
  ok('прозрачность не чернеет',   /fillStyle = '#fff'/.test(html));
  ok('загрузка по одной картинке', /function uploadAll/.test(html) && /Загружаю '/.test(html));
  ok('можно править новость',     /'\/editLog'/.test(html) && /logEdit/.test(html));
  ok('обновление не стирает черновик', /if \(!editing && !addBtn\.disabled\) load\(\)/.test(html));
  ok('цвета берутся из темы',     /var\(--ink/.test(html) && /var\(--line/.test(html));

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(fails ? '\n✗ ошибок: ' + fails : '\n✓ всё зелено');
  process.exit(fails ? 1 : 0);
})();
