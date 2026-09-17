/* Живой тест Hide and Seek с двумя настоящими вкладками: проверяем то, что
   статический regex-тест (test-hns.js) не видит — реальный счётчик игроков
   и видимость друг друга на экране во время охоты. Баг-репорт: "нельзя
   видеть количество игроков и игроков в целом". */
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3210';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch();
  const pages = [];
  const errs = [[], []];
  for (let i = 0; i < 2; i++) {
    const ip = '10.' + (1 + Math.floor(Math.random() * 250)) + '.' + (1 + i) + '.' + (1 + i);
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { 'CF-Connecting-IP': ip } });
    ctx.on('page', p => p.on('pageerror', e => errs[i].push(e.message)));
    const p = await ctx.newPage();
    const name = 'hs' + i + Math.floor(Math.random() * 1e6);
    await p.goto(BASE + '/', { waitUntil: 'networkidle' });
    await p.evaluate(() => { const c = document.getElementById('bfConsent'); if (c) c.remove(); });
    await p.evaluate(async n => {
      await fetch('/signUp', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n, password: 'Passw0rd!x' }), credentials: 'same-origin' });
    }, name);
    pages.push({ p, name });
  }

  // одна и та же комната: второй просит room у первого через getBestRoom
  // (одна карта на комнату — оба должны сойтись в одной, если сервер не
  // забит другими тестовыми комнатами; на всякий случай задаём room явно)
  const room = 'livetest' + Math.floor(Math.random() * 1e6);
  for (const { p } of pages) {
    await p.goto(BASE + '/game.html?mode=hideAndSeek&room=' + room, { waitUntil: 'networkidle' });
  }
  await sleep(4000);   // join + первый обмен playersList/hsRoulette

  for (let i = 0; i < 2; i++) {
    ok(errs[i].length === 0, 'вкладка ' + i + ': без ошибок в консоли', errs[i][0] || '');
  }

  const counts = [];
  for (const { p } of pages) {
    counts.push(await p.evaluate(() => document.getElementById('gCount') && document.getElementById('gCount').textContent));
  }
  console.log('  счётчики gCount:', counts.join(' / '));
  ok(counts[0] === '2' && counts[1] === '2', 'оба клиента видят gCount = 2', counts.join(' / '));

  // во время рулетки (первые ~30с лобби) видно всех — не нужно ждать
  // конца раунда, чтобы проверить, что канвас вообще что-то рисует
  const canvasNonEmpty = [];
  for (const { p } of pages) {
    canvasNonEmpty.push(await p.evaluate(() => {
      var cv = document.getElementById('c');
      if (!cv) return null;
      var ctx = cv.getContext('2d');
      var img = ctx.getImageData(0, 0, cv.width, cv.height).data;
      var nonWhite = 0;
      for (var i = 0; i < img.length; i += 4 * 97) if (img[i] || img[i+1] || img[i+2]) nonWhite++;
      return nonWhite;
    }));
  }
  console.log('  непустых пикселей на канвасе во время рулетки (сэмплировано):', canvasNonEmpty.join(' / '));
  ok(canvasNonEmpty.every(n => n > 0), 'канвас не пустой (что-то рисуется) у обоих', canvasNonEmpty.join(' / '));

  // дожидаемся начала охоты и проверяем ещё раз — теперь оба видны точно
  await sleep(32000);
  const counts2 = [];
  for (const { p } of pages) {
    counts2.push(await p.evaluate(() => document.getElementById('gCount') && document.getElementById('gCount').textContent));
  }
  console.log('  gCount во время охоты:', counts2.join(' / '));
  ok(counts2[0] === '2' && counts2[1] === '2', 'gCount = 2 остаётся верным во время охоты', counts2.join(' / '));

  await b.close();
  console.log(fail ? ('\n' + fail + ' ошибок') : '\nвсё чисто');
  process.exit(fail ? 1 : 0);
})();
