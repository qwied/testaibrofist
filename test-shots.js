/* Настоящие снимки страниц для бота (discordShots.js) — с настоящим
   браузером из @sparticuz/chromium, против маленького сайта на localhost:
   - тема для снимка подменяется (тёмная/светлая), окно соглашения не мешает;
   - язык сайта для снимка — английский или русский (гостю сайт отвечает английским);
   - страница грузит только сам сайт: запрос наружу до чужого сервера не доходит;
   - вкладка нажимается, длинная страница снимается целиком, но не выше MAX_H;
   - страница с ошибкой (404, сервер не отвечает) — ошибка, а не снимок ошибки;
   - мало памяти — браузер не запускается.
   Запуск: node test-shots.js */
'use strict';
const http = require('http');
const { execFileSync } = require('child_process');
const { PNG } = require('pngjs');

let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };
const listen = srv => new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
const bright = (img, x, y) => { const i = (img.width * y + x) * 4; return (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3; };

let outsideHits = 0;
const outside = http.createServer((req, res) => { outsideHits++; res.end('x'); });

const PAGE = outsidePort => `<!doctype html><html><head><style>
  body{margin:0;font:20px sans-serif} #box{padding:20px}
  #mark{position:fixed;left:0;top:0;width:100px;height:100px;background:#f00}
</style></head><body><div id="mark"></div><div id="box">loading</div>
<img src="http://127.0.0.1:${outsidePort}/track.png">
<script>
  fetch('/theme/get').then(r => r.json()).then(d => {
    document.body.style.background = d.mode === 'dark' ? '#000' : '#fff';
    document.body.style.color = d.mode === 'dark' ? '#fff' : '#000';
    // зелёный квадрат — соглашение «принято» и тема записана, как у живого игрока
    var good = localStorage.getItem('bfConsent') === '1' && localStorage.getItem('bfThemeMode') === d.mode;
    document.getElementById('mark').style.background = good ? '#0f0' : '#f00';
    document.title = 'ready';
  });
</script></body></html>`;
const TAB = `<!doctype html><body style="margin:0;background:#fff">
<button id="t" style="width:200px;height:60px" onclick="document.body.style.background='#000';window.first=1">Maps</button>
<button id="u" style="width:200px;height:60px" onclick="if(window.first)document.body.style.background='#00f'">Week</button></body>`;
// язык: и браузерная память (bfLang), и ответ сайта (/i18n/get) — как в i18n.js; русский — синий фон, английский — жёлтый
const LANG = `<!doctype html><body style="margin:0;background:#888"><script>
  fetch('/i18n/get').then(r => r.json()).then(d => {
    var l = localStorage.getItem('bfLang');
    document.body.style.background = l === d.lang ? (l === 'ru' ? '#00f' : '#ff0') : '#f00';
  });
</script></body>`;
const TALL = `<!doctype html><body style="margin:0"><div style="height:3000px;background:#888"></div></body>`;
// блок для обрезки: 400x300 на позиции (300, 120); слева «боковое меню» сайта (.bfHead) красным;
// данные приходят с задержкой — до них блок серый, после — зелёный и с отметкой data-ready
const CROP = `<!doctype html><body style="margin:0;background:#fff">
<div class="bfHead" style="position:fixed;left:0;top:0;bottom:0;width:290px;background:#f00"></div>
<div id="blk" style="position:absolute;left:300px;top:120px;width:400px;height:300px;background:#888"></div>
<script>setTimeout(function () { document.getElementById('blk').style.background = '#0a0'; document.body.setAttribute('data-ready', '1'); }, 400);</script>
</body>`;

(async () => {
  const outsidePort = await listen(outside);
  const site = http.createServer((req, res) => {
    if (req.url === '/theme/get') { res.setHeader('Content-Type', 'application/json'); return res.end('{"unlocked":false,"mode":"light","guest":true}'); }
    if (req.url === '/page') return res.end(PAGE(outsidePort));
    if (req.url === '/tab') return res.end(TAB);
    if (req.url === '/tall') return res.end(TALL);
    if (req.url === '/lang') return res.end(LANG);
    if (req.url === '/i18n/get') { res.setHeader('Content-Type', 'application/json'); return res.end('{"lang":"en","guest":true,"langs":["en","ru"]}'); }
    if (req.url === '/crop') return res.end(CROP);
    res.statusCode = 404; res.end('not found');
  });
  const port = await listen(site);
  delete process.env.DISCORD_SHOTS;
  const S = require('./discordShots.js');
  S.setBase('http://127.0.0.1:' + port);

  console.log('браузер:');
  let t = Date.now();
  ok('запускается (самопроверка), свободная память видна', await S.selfTest() && S.info().state === 'ready' && S.freeMb() > 0,
     (Date.now() - t) + ' мс, свободно ' + S.freeMb() + ' МБ');

  console.log('\nснимки:');
  t = Date.now();
  const dark = PNG.sync.read(await S.shoot('/page', 'dark'));
  ok('снимок 1280 в ширину; тёмная тема, хотя гостю сайт даёт только светлую', dark.width === 1280 && dark.height === 860 &&
     bright(dark, 600, 600) < 30, (Date.now() - t) + ' мс');
  t = Date.now();
  const light = PNG.sync.read(await S.shoot('/page', 'light'));
  ok('светлая тема', bright(light, 600, 600) > 225, (Date.now() - t) + ' мс');
  ok('запрос на чужой сервер со страницы до него не дошёл', outsideHits === 0, outsideHits);
  const tab = PNG.sync.read(await S.shoot('/tab', 'light', { tab: '#t' }));
  ok('вкладка нажимается перед снимком', bright(tab, 600, 600) < 30);
  const two = PNG.sync.read(await S.shoot('/tab', 'light', { tab: ['#t', '#u'] }));
  const bi = (two.width * 600 + 600) * 4;
  ok('несколько вкладок — по очереди (период, потом Maps)', two.data[bi + 2] > 200 && two.data[bi] < 40, [two.data[bi], two.data[bi + 1], two.data[bi + 2]].join());
  const rgb = (img, x, y) => { const i = (img.width * y + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]].join(); };
  const ru = PNG.sync.read(await S.shoot('/lang', 'dark', { lang: 'ru' })), en = PNG.sync.read(await S.shoot('/lang', 'dark'));
  ok('язык сайта на снимке — русский по флагу «Русский», иначе английский (гостю сайт отвечает английским)',
     rgb(ru, 600, 600) === '0,0,255' && rgb(en, 600, 600) === '255,255,0', rgb(ru, 600, 600) + ' / ' + rgb(en, 600, 600));
  const cut2 = PNG.sync.read(await S.shoot('/crop', 'light', { crop: '#blk', ready: 'body[data-ready]', width: 800, scale: 2 }));
  ok('узкое окно и вдвое чётче: блок тот же, в картинке вдвое больше точек', cut2.width === (400 + 32) * 2 && cut2.height === (300 + 32) * 2, cut2.width + 'x' + cut2.height);
  const tall = PNG.sync.read(await S.shoot('/tall', 'light'));
  ok('длинная страница — целиком, но не выше ' + S.MAX_H, tall.height === S.MAX_H, tall.height);
  const green = (img, x, y) => { const i = (img.width * y + x) * 4; return img.data[i] < 60 && img.data[i + 1] > 200 && img.data[i + 2] < 60; };
  ok('окно соглашения «уже принято», выбранная тема записана — в обеих темах', green(dark, 50, 50) && green(light, 50, 50));
  const cut = PNG.sync.read(await S.shoot('/crop', 'light', { crop: '#blk', ready: 'body[data-ready]' }));
  const px = (img, x, y) => { const i = (img.width * y + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
  let red = 0;
  for (let y = 0; y < cut.height; y += 4) for (let x = 0; x < cut.width; x += 4) { const c = px(cut, x, y); if (c[0] > 200 && c[1] < 60 && c[2] < 60) red++; }
  ok('обрезка: только нужный блок с полем 16 пикселей вокруг', cut.width === 400 + 32 && cut.height === 300 + 32, cut.width + 'x' + cut.height);
  ok('боковое меню сайта в рамку не попадает', red === 0, red);
  const mid = px(cut, 216, 166);
  ok('снимок — после того, как страница загрузила данные', mid[1] > 120 && mid[0] < 60, mid.join());
  t = Date.now();
  const many = await Promise.all([S.shoot('/page', 'dark'), S.shoot('/tab', 'dark'), S.shoot('/tall', 'dark')]);
  ok('несколько снимков сразу — все готовы', many.every(b => b.length > 500), (Date.now() - t) + ' мс');

  console.log('\nошибки:');
  let err = null;
  try { await S.shoot('/missing', 'dark'); } catch (e) { err = e.message; }
  ok('страница 404 — ошибка, а не снимок страницы ошибки', /answered 404/.test(err || ''), err);
  S.setBase('http://127.0.0.1:1');
  err = null;
  try { await S.shoot('/page', 'dark'); } catch (e) { err = e.message; }
  ok('сайт не отвечает — тоже ошибка', !!err && /ERR_CONNECTION_REFUSED|ERR_ADDRESS|ERR_/.test(err), err && err.slice(0, 60));
  S.close();

  const lowMem = execFileSync(process.execPath, ['-e',
    "const S=require('./discordShots.js');S.shoot('/x','dark').then(()=>console.log('shot'),e=>console.log(e.message))"],
    { cwd: __dirname, env: Object.assign({}, process.env, { DISCORD_SHOTS_NEED_MB: '99999999' }) }).toString().trim();
  ok('мало свободной памяти — браузер не запускается', /not enough free memory/.test(lowMem), lowMem);
  const offed = execFileSync(process.execPath, ['-e',
    "const S=require('./discordShots.js');S.shoot('/x','dark').then(()=>console.log('shot'),e=>console.log(e.message))"],
    { cwd: __dirname, env: Object.assign({}, process.env, { DISCORD_SHOTS: 'off' }) }).toString().trim();
  ok('DISCORD_SHOTS=off — снимки выключены', /off/.test(offed), offed);
  const emptyTmp = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'bf-no-disk-'));   // браузер ещё не распакован
  const noDisk = execFileSync(process.execPath, ['-e',
    "const S=require('./discordShots.js');S.selfTest().then(()=>console.log(S.info().reason||'ok'))"],
    { cwd: __dirname, env: Object.assign({}, process.env, { DISCORD_SHOTS_NEED_DISK_MB: '999999999', TMPDIR: emptyTmp }) }).toString().trim();
  require('fs').rmSync(emptyTmp, { recursive: true, force: true });
  ok('мало места на диске — браузер не распаковывается', /not enough free disk space/.test(noDisk), noDisk);

  site.close(); outside.close();
  console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
  setTimeout(() => process.exit(fails ? 1 : 0), 300);
})().catch(e => { console.log('✗ тест упал:', e.stack); process.exit(1); });
