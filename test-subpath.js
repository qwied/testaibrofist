/* Тестовый сайт живёт на GitHub Pages не в корне домена, а в /testaibrofist/ — абсолютные пути
   ('/game', '/skinparts/', href="/") уводят мимо сайта. Здесь своя мини-копия Pages (порт 3388):
   выход и вход за аккаунты песочницы, ссылка сюжета, детали скинов, «На главную», ни одного 404.
   Запуск: node test-subpath.js */
// Мини-копия GitHub Pages: репозиторий под /testaibrofist/, «game» → game.html, остальное 404
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = __dirname, SUB = '/testaibrofist';
const start = (port) => new Promise(ok => {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === SUB) { res.writeHead(301, { Location: SUB + '/' }); return res.end(); }
    if (p.indexOf(SUB + '/') !== 0) { res.writeHead(404); return res.end('404 outside site'); }
    p = p.slice(SUB.length); if (p.endsWith('/')) p += 'index.html';
    let f = path.join(ROOT, p); if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
    const ext = path.extname(f).slice(1);
    res.writeHead(200, { 'Content-Type': ({ html: 'text/html', js: 'application/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', jpg: 'image/jpeg', webp: 'image/webp', mp3: 'audio/mpeg' })[ext] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(port, () => ok(srv));
});

const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
let pass = 0, fail = 0; const ok = (c, n, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + n + (d !== undefined ? '  ' + String(d).slice(0, 200) : '')); };
(async () => {
  const srv = await start(3388); const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const B = 'http://localhost:3388/testaibrofist/';
  const errs = [], nf = new Set();
  const open = async (u) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(u + ': ' + e.message.slice(0, 160)));
    p.on('response', r => { if (r.status() === 404 && !/socket\.io/.test(r.url())) nf.add(r.url()); });
    await p.goto(B + u); await p.waitForFunction(() => window.BFOfflineServer && document.getElementById('bfSandboxBtn'), null, { timeout: 20000 }); return p; };

  console.log('Выход и вход:');
  const p = await open('');
  await p.evaluate(() => fetch('/logOut', { method: 'POST' })); await p.reload(); await p.waitForTimeout(2500);
  ok((await p.evaluate(() => fetch('/whoAmI').then(r => r.json()))).guest === true, 'после выхода — гость');
  { const ag = await p.$('#bfConsent button:last-child, #bfConsent .bfcYes, #bfConsent [data-a="yes"]'); if (ag) await ag.click(); await p.waitForTimeout(400); } await p.click('#bfProfileName'); await p.waitForTimeout(300); await p.click('.bfDropItem'); await p.waitForTimeout(500);
  const t = await p.evaluate(() => document.querySelector('.bf-box') && document.querySelector('.bf-box').innerText);
  ok(/Local Tester/.test(t) && !/Discord/.test(t), 'окно входа: аккаунты песочницы, без Discord', t && t.replace(/\n/g, ' | '));
  await p.fill('#bfSbNew', 'NewGuy'); await p.click('#bfSbCreate'); await p.waitForTimeout(2500);
  ok((await p.evaluate(() => fetch('/whoAmI').then(r => r.json()))).name === 'NewGuy', 'новый аккаунт из окна входа');
  await p.evaluate(() => BFOfflineServer.playAs('Local Tester'));

  console.log('Сюжет:');
  const s = await open('story');
  const sr = await s.evaluate(() => fetch('/story/create', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'author=qwied&mapName=Bro%20Arena&limitMin=10' }).then(r => r.json()));
  const link = await s.evaluate(() => new URL('game?mode=race&story=1&room=x', location.href).href);
  ok(sr.status === 'success' && /\/testaibrofist\/game\?/.test(link), 'ссылка сюжета внутри сайта', link);

  console.log('Скины:');
  const a = await open('avatar');
  const base = await a.evaluate(() => { const sc = [...document.scripts].find(x => /skinRender/.test(x.src)); return sc ? new URL('skinparts/', sc.src).href : null; });
  const r = await ctx.request.get(base + 's1_r1_00_body.webp');
  ok(r.status() === 200, 'детали скинов грузятся из подпапки', base);

  console.log('Ссылки «на главную»:');
  const rc = await open('race');
  const back = await rc.evaluate(() => document.querySelector('.mdBack').href);
  ok(back === B, '«На главную» ведёт в /testaibrofist/', back);

  ok(nf.size === 0, 'нет 404', [...nf].join(' '));
  ok(errs.length === 0, 'нет ошибок скриптов', errs.join(' | '));
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
