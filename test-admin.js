/* Admin Abuse: доступ только владельцу и таймер обновления. */
const fs = require('fs'), os = require('os'), path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-'));
let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };

const src = fs.readFileSync(__dirname + '/adminAbuse.js', 'utf8');
const srv = fs.readFileSync(__dirname + '/server.js', 'utf8');
const shell = fs.readFileSync(__dirname + '/shell.js', 'utf8');
const ed = fs.readFileSync(__dirname + '/editor.html', 'utf8');

console.log('доступ:');
ok('файл отдаётся только владельцу', /app\.get\('\/adminAbuse\.js'/.test(srv) && /isOwner/.test(srv));

const own = fs.readFileSync(__dirname + '/owner.js', 'utf8');
ok('в разметке страниц следа нет',
   fs.readdirSync(__dirname).filter(f => f.endsWith('.html'))
     .every(f => !fs.readFileSync(path.join(__dirname, f), 'utf8').includes('adminAbuse')));
ok('подключается из owner.js', /sc\.src = 'adminAbuse\.js'/.test(own));
ok('чужому 404, а не пустышка', /if \(!allowed\) return res\.status\(404\)\.send\('Not found'\);/.test(srv));

console.log('\nшоу видят все:');
const show = fs.readFileSync(__dirname + '/abuseShow.js', 'utf8');
ok('показ грузят все страницы',
   fs.readdirSync(__dirname).filter(f => f.endsWith('.html'))
     .filter(f => fs.readFileSync(path.join(__dirname, f), 'utf8').includes('abuseShow.js')).length >= 10);
ok('состояние берётся с сервера', /fetch\('\/abuse\/state'/.test(show));
ok('панель только шлёт команды', /post\('\/abuse\/set'/.test(src) && !/requestAnimationFrame/.test(src));
ok('файл уходит на сервер',      /postJSON\('\/abuse\/upload'/.test(src) && /readAsDataURL/.test(src));

console.log('\nвозможности:');
ok('летающее медиа',      /function rebuildMedia/.test(show));
ok('гифки и видео элементами', /createElement\('video'\)/.test(show) && /createElement\('img'\)/.test(show));
ok('видео со звуком',     /el\.muted = !m\.sound/.test(show));
ok('четыре направления',  ['right','left','up','down'].every(d => show.includes("'" + d + "'")));
ok('музыка по кругу',     /audio\.loop = true/.test(show));
ok('звук готовится заранее', /function armUnlock/.test(show) && /capture: true/.test(show));
ok('снимаем слушатели после', /function disarm/.test(show));
ok('подсказка про звук',   /Нажмите на экран, чтобы включить звук/.test(show));
ok('звук ждёт нажатия',   /function waitForGesture/.test(show) && /pointerdown/.test(show));
ok('видео тоже ждёт звука', /if \(m\.sound\) waitForGesture\(el\)/.test(show));
ok('после жеста звук включается', /el\.muted = false;/.test(show));
ok('касание тоже считается', /touchstart/.test(show));
ok('битое медиа выбрасывается', /el\.onerror = function \(\) \{ drop\(el\); \}/.test(show));
ok('скрытая вкладка не рисует', /if \(document\.hidden\)/.test(show));
ok('возврат на вкладку синхронит', /visibilitychange/.test(show));
['rain','hail','snow','sun'].forEach(w =>
  ok('погода ' + w, show.includes("weather === '" + w + "'")));
ok('одноразовое не повторяется', /shotAt === lastShot/.test(show));
ok('много взрывов сразу',  /function fireNukes/.test(show));
ok('дождь из монет',       /function fireCoins/.test(show));
ok('монеты ловятся',       /function catchCoin/.test(show) && /pointerdown', catchCoin/.test(show));
ok('звук дождя',           /function rainOn/.test(show) && /createBiquadFilter/.test(show));
ok('град звучит иначе',    /kind === 'hail' \? 'highpass' : 'lowpass'/.test(show));
ok('грохот взрыва',        /function boomSound/.test(show) && /b\.t === 1\) boomSound/.test(show));
ok('звон монеты',          /function coinSound/.test(show));
ok('звук без файлов',      /createBuffer\(1, n, a\.sampleRate\)/.test(show));
ok('WebAudio будится жестом', /a\.state === 'suspended'\) a\.resume/.test(show));
ok('галочка настоящих монет', /id="aaReward"/.test(src));
ok('погода гаснет по времени', /if \(until && Date\.now\(\) > until\)/.test(show));
ok('в панели есть секунды', /id="aaSecs"/.test(src));
ok('в панели есть количество', /id="aaCount"/.test(src));
ok('галочка во весь экран', /id="aaFull"/.test(src) && /full: o\.full/.test(src));
ok('размер считает игрок',  /m\.full \? Math\.max\(innerWidth, innerHeight\)/.test(show));
ok('файл уходит как JSON',  /function postJSON/.test(src) && /postJSON\('\/abuse\/upload'/.test(src));
ok('монета из coin.png',    /coinImg\.src = 'coin\.png'/.test(show));
ok('тучки над монетами',    /function drawClouds/.test(show) && /clouds\.push/.test(show));
ok('атомная бомба крупнее', /i === 0 \? 1\.35/.test(show));
ok('раскат и эхо',          /эхо: тот же шум тише и позже/.test(show));
ok('контекст будится всегда', /if \(actx\.state === 'suspended'\) actx\.resume\(\);/.test(show));
ok('прогресс загрузки',    /Загружаю ' \+ okCount \+ ' из '/.test(src));
ok('битый файл не рвёт очередь', /остальные всё равно грузим/.test(src));
ok('слои не ловят нажатия', (show.match(/pointer-events:none/g) || []).length >= 2);
ok('монеты без лимита',   /window\.BFAdminAbuse = true/.test(src) && /function coinCapped/.test(ed));

console.log('\nтаймер обновления:');
ok('отсчёт виден всем',   /До обновления: /.test(shell));
ok('часы, минуты, секунды', /' ч ' \+ two\(m\) \+ ' мин ' \+ two\(sec\) \+ ' сек'/.test(shell));
ok('тикает каждую секунду', /if \(left > 0\) \{ left -= 1000; paint\(\); \}/.test(shell) && /\}, 1000\);/.test(shell));
ok('сам гаснет по нулю',   /if \(left <= 0\) \{\s*\n\s*if \(box\) \{ box\.remove\(\); box = null; \}/.test(shell));
ok('кнопка запуска',       /Запустить таймер до обновления/.test(src));
ok('можно убрать вручную', /Убрать таймер/.test(src));
ok('поле секунд',          /id="aaSec"/.test(src));

const routes = {};
const app = { get: (p, h) => routes['GET ' + p] = h, post: (p, h) => routes['POST ' + p] = h };
let user = { name: 'System' };
require('./updateTimer.js').register(app, {
  currentUser: () => user,
  isOwner: u => !!u && String(u.name).toLowerCase() === 'system'
});
const call = (k, body) => new Promise(r => routes[k]({ body: body || {} }, { json: d => r(d) }));

(async () => {
  let r = await call('POST /update/set', { seconds: 180 * 60 });
  ok('владелец ставит таймер', r.status === 'success');
  r = await call('GET /update/get');
  ok('осталось около трёх часов', Math.abs(r.left - 180 * 60000) < 5000, Math.round(r.left / 60000) + ' мин');

  user = { name: 'qwied' };
  r = await call('POST /update/set', { seconds: 999 * 60 });
  ok('чужому ставить нельзя', r.status === 'error', r.message);
  r = await call('GET /update/get');
  ok('читать может любой', r.left > 0);
  ok('чужой не сбил таймер', Math.abs(r.left - 180 * 60000) < 5000);

  user = { name: 'System' };
  await call('POST /update/set', { seconds: 0 });
  r = await call('GET /update/get');
  ok('таймер снимается', r.left === 0);
  r = await call('POST /update/set', { seconds: 45 });
  r = await call('GET /update/get');
  ok('секунды принимаются', Math.abs(r.left - 45000) < 3000, Math.round(r.left / 1000) + ' сек');
  r = await call('POST /update/set', { minutes: 2 });
  r = await call('GET /update/get');
  ok('минуты тоже работают', Math.abs(r.left - 120000) < 3000, Math.round(r.left / 1000) + ' сек');

  console.log('\nправа на шоу:');
  const R2 = {};
  const app2 = { get: (p, h) => R2['GET ' + p] = h, post: (p, h) => R2['POST ' + p] = h,
                 use: () => {} };
  let who = { name: 'System' };
  require('./abuse.js').register(app2, {
    currentUser: () => who,
    isOwner: u => !!u && String(u.name).toLowerCase() === 'system'
  });
  const c2 = (k, body) => new Promise(r => R2[k]({ body: body || {} }, { json: d => r(d) }));

  r = await c2('POST /abuse/set', { what: 'weather', weather: 'rain' });
  ok('владелец включает погоду', r.status === 'success');
  r = await c2('GET /abuse/state');
  ok('погода видна всем', r.weather === 'rain');

  who = { name: 'qwied' };
  r = await c2('POST /abuse/set', { what: 'weather', weather: 'nuke' });
  ok('чужой не включает', r.status === 'error', r.message);
  r = await c2('POST /abuse/upload', { data: 'data:image/png;base64,AAAA' });
  ok('чужой не загружает', r.status === 'error');
  r = await c2('GET /abuse/state');
  ok('чужой не сбил погоду', r.weather === 'rain');
  ok('читать состояние может любой', typeof r.v === 'number');

  who = { name: 'System' };
  r = await c2('POST /abuse/set', { what: 'media', url: '/abusefile/x.gif', kind: 'image', dir: 'up' });
  ok('медиа добавляется', r.status === 'success' && r.count === 1);
  r = await c2('POST /abuse/set', { what: 'clear' });
  r = await c2('GET /abuse/state');
  ok('шоу выключается разом', r.weather === 'none' && r.media.length === 0 && !r.song);

  console.log('\nколичество и длительность:');
  who = { name: 'System' };
  r = await c2('POST /abuse/set', { what: 'weather', weather: 'rain', secs: '30' });
  ok('дождь на 30 секунд', r.state.until > Date.now() + 25000 && r.state.until < Date.now() + 35000);
  r = await c2('POST /abuse/set', { what: 'weather', weather: 'nuke', count: '25' });
  ok('двадцать пять взрывов', r.state.count === 25);
  r = await c2('POST /abuse/set', { what: 'weather', weather: 'coins', count: '300' });
  ok('монеты пачкой', r.state.weather === 'coins' && r.state.count === 300);
  r = await c2('POST /abuse/set', { what: 'weather', weather: 'coins', count: '99999' });
  ok('количество ограничено сверху', r.state.count === 300, r.state.count);
  r = await c2('POST /abuse/set', { what: 'weather', weather: 'rain', secs: '0' });
  ok('ноль секунд — до выключения', r.state.until === 0);

  console.log('\nловля монет:');
  who = { name: 'System' };
  await c2('POST /abuse/set', { what: 'weather', weather: 'coins', count: '5', reward: 'true' });
  let player = { name: 'qwied', coins: 0 };
  who = player;
  r = await c2('POST /abuse/coin');
  ok('монета зачисляется', r.status === 'success' && player.coins === 1, JSON.stringify(r));
  for (let i = 0; i < 10; i++) r = await c2('POST /abuse/coin');
  ok('больше показанных не дадут', player.coins === 5, player.coins + ' монет');
  ok('лишнее отклонено', r.status === 'error', r.message);

  who = { name: 'System' };
  await c2('POST /abuse/set', { what: 'weather', weather: 'coins', count: '5', reward: 'false' });
  who = player;
  r = await c2('POST /abuse/coin');
  ok('без галочки монет не дают', r.status === 'error', r.message);

  who = { name: 'System' };
  await c2('POST /abuse/set', { what: 'weather', weather: 'rain' });
  who = player;
  r = await c2('POST /abuse/coin');
  ok('вне шоу монет не дают', r.status === 'error', r.message);

  console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
  process.exit(fails ? 1 : 0);
})();
