/* «Отпрыгивание от бока»: прыгая в бок блока, нельзя оказаться на нём, если прыжком до его верха
   не достать (раньше это давал захват кромки — повис и залез). Настоящий движок в браузере (game.html
   и editor.html — одна физика), кадр за кадром через GAME.step(). Запуск: node test-sidejump.js */
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
(async () => {
  const srv = await start(3389); const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto('http://localhost:3389/testaibrofist/editor'); await p.waitForFunction(() => window.GAME && GAME.loadMap, null, { timeout: 20000 });
  const res = await p.evaluate(() => {
    const out = [];
    for (const [h, T] of [[28, 395], [60, 395], [300, 395], [28, 380], [28, 360], [28, 470], [60, 440]]) {
      for (const side of ['L', 'R']) {
        const floor = { id: 1, type: 'rect', x: 0, y: 560, w: 2000, h: 80, rot: 0 };
        const plat = { id: 2, type: 'rect', x: 600, y: T, w: 200, h, rot: 0 };
        const spawn = { id: 3, type: 'spawn', x: side === 'L' ? 520 : 840, y: 450 };
        GAME.loadMap({ mode: 'race', objects: [floor, plat, spawn] });
        GAME.play();
        for (let i = 0; i < 30; i++) GAME.step();
        GAME.keys.u = true; GAME.keys[side === 'L' ? 'r' : 'l'] = true;
        let minFeet = 1e9, onTop = false, grab = false;
        for (let i = 0; i < 400; i++) { GAME.step(); const pl = GAME.pl; minFeet = Math.min(minFeet, pl.y + pl.h); if (pl.ground && Math.abs(pl.y + pl.h - T) < 2) onTop = true; if (pl.grab || pl.climb) grab = true; }
        GAME.keys.u = false; GAME.keys.r = false; GAME.keys.l = false;
        out.push({ h, T, side, apexFeet: Math.round(minFeet), reachable: 560 - 155 <= T, onTop, grab });
        GAME.stop();
      }
    }
    return out;
  });
  let fail = 0;
  res.forEach(r => {
    // недостижимый прыжком блок — наверху оказаться нельзя; достижимый — можно
    const good = r.reachable ? r.onTop : (!r.onTop && !r.grab);
    if (!good) fail++;
    console.log((good ? '  ✓ ' : '  ✗ ') + 'блок ' + r.h + ' px, верх ' + r.T + ', ' + (r.side === 'L' ? 'слева' : 'справа') + ': ' + (r.onTop ? 'наверху' : 'внизу') + ' (высота прыжка до ' + r.apexFeet + ')');
  });
  console.log('\n' + (res.length - fail) + ' ok, ' + fail + ' fail');
  await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
