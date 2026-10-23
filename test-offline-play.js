/* Офлайн-песочница testaibrofist (game.html без сервера): управление работает — идёт, прыгает,
   экранные кнопки тоже, в обоих режимах; карта с испорченным полем «Цели» не ломает физику.
   Запуск: node test-offline-play.js (сервер не нужен — страницы отдаются как обычные файлы). */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.json': 'application/json', '.webmanifest': 'application/json' };

(async () => {
  // обычная раздача файлов: так сайт открывают без Node-сервера (как file:// или статический хостинг)
  const srv = http.createServer((req, res) => {
    let p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!fs.existsSync(p) && fs.existsSync(p + '.html')) p += '.html';           // адреса без .html, как у меню сайта
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  const errs = [];

  async function open(url, opts) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 800 } }, opts || {}));
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(url + ': ' + e.message.slice(0, 140)));
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    await page.evaluate(() => { const c = document.getElementById('bfConsent'); if (c) c.remove(); });
    await page.waitForFunction(() => window.GAME && window.GAME.playing && window.GAME.objects.length > 0, null, { timeout: 15000 });
    await page.waitForTimeout(1200);
    return { page, ctx };
  }
  async function openPage(url) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(url + ': ' + e.message.slice(0, 140)));
    page.on('dialog', d => d.accept());                      // «Распустить клан?», «Выйти из клана?»
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    await page.evaluate(() => { const c = document.getElementById('bfConsent'); if (c) c.remove(); });
    return { page, ctx };
  }
  const pageEval = (page, fn) => page.evaluate(fn);
  const pos = page => page.evaluate(() => ({ x: window.GAME.pl.x, y: window.GAME.pl.y, ground: window.GAME.pl.ground }));

  for (const [name, url] of [['Race', '/game.html?mode=race'], ['Hide and Seek', '/game.html?mode=hideAndSeek&role=seeker']]) {
    console.log('\n' + name + ':');
    const { page, ctx } = await open(url);
    const a = await pos(page);
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(700); await page.keyboard.up('ArrowRight');
    const b = await pos(page);
    ok(b.x > a.x + 80, 'стрелка вправо двигает игрока', Math.round(a.x) + ' → ' + Math.round(b.x));
    await page.keyboard.down('a'); await page.waitForTimeout(450); await page.keyboard.up('a');
    const c = await pos(page);
    ok(c.x < b.x - 30, 'клавиша A двигает влево', Math.round(b.x) + ' → ' + Math.round(c.x));
    await page.keyboard.down('d'); await page.waitForTimeout(300); await page.keyboard.up('d');
    ok((await pos(page)).x > c.x + 30, 'клавиша D двигает вправо');
    await page.waitForTimeout(600);
    const g = await pos(page);
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(200);
    const j = await pos(page);
    await page.keyboard.up('ArrowUp');
    ok(j.y < g.y - 20, 'прыжок отрывает от земли', Math.round(g.y) + ' → ' + Math.round(j.y));
    await ctx.close();
  }

  console.log('\nЭкранные кнопки (телефон):');
  {
    const { page, ctx } = await open('/game.html?mode=race', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
    ok(await page.isVisible('#pRight'), 'кнопки управления видны на телефоне');
    const hold = async (sel, ms) => {
      await page.dispatchEvent(sel, 'touchstart'); await page.waitForTimeout(ms); await page.dispatchEvent(sel, 'touchend');
    };
    const a = await pos(page);
    await hold('#pRight', 700);
    const b = await pos(page);
    ok(b.x > a.x + 60, 'кнопка «вправо» двигает игрока', Math.round(a.x) + ' → ' + Math.round(b.x));
    await hold('#pLeft', 500);
    ok((await pos(page)).x < b.x - 30, 'кнопка «влево» двигает назад');
    await page.waitForTimeout(500);
    const g = await pos(page);
    await page.dispatchEvent('#pJump', 'touchstart'); await page.waitForTimeout(200);
    const j = await pos(page);
    await page.dispatchEvent('#pJump', 'touchend');
    ok(j.y < g.y - 20, 'кнопка JUMP прыгает', Math.round(g.y) + ' → ' + Math.round(j.y));
    await ctx.close();
  }

  console.log('\nИспорченное поле «Цели» у объекта карты:');
  {
    const { page, ctx } = await open('/game.html?mode=race');
    const r = await page.evaluate(() => {
      const G = window.GAME;
      const mk = (id, extra) => Object.assign({ id, type: 'rect', x: 100 + id * 50, y: 560, w: 40, h: 20 }, extra);
      G.loadMap(JSON.stringify({ mode: 'race', objects: [
        { id: 1, type: 'spawn', x: 90, y: 440 }, { id: 2, type: 'rect', x: 0, y: 560, w: 2000, h: 80 },
        mk(3, { type: 'button', targetIds: ['a', 'b'] }), mk(4, { type: 'lever', targetIds: 5 }), mk(5, { type: 'teleport', targetIds: { x: 1 } }),
        mk(6, { type: 'rect', targetIds: null }), mk(7, { type: 'rect', targetIds: [] }), { id: 8, type: 'finishline', x: 1900, y: 500 }] }));
      const types = G.objects.map(o => typeof o.targetIds);
      let thrown = null;
      try { G.play(); for (let i = 0; i < 60; i++) G.step(); } catch (e) { thrown = String(e); }
      return { types: types.filter(t => t !== 'undefined' && t !== 'string').length, thrown, ids: G.objects.filter(o => o.id === 3)[0].targetIds };
    });
    ok(r.types === 0, 'массив, число, объект и null приводятся к строке', 'ids=' + JSON.stringify(r.ids));
    ok(r.thrown === null, 'физика идёт дальше без ошибок', r.thrown || '');
    await ctx.close();
  }

  console.log('\nКланы в офлайн-песочнице (бесплатно):');
  {
    const { page, ctx } = await openPage('/clans');
    await page.waitForSelector('#clList .clRow', { timeout: 10000 });
    ok((await page.$$('#clList .clRow')).length === 2, 'в списке два учебных клана');
    ok(await page.isVisible('#clNew'), 'кнопка «Create a clan» видна');
    ok(/Free/i.test(await page.textContent('#clNew')), 'на кнопке написано «Free»');
    await page.click('#clNew');
    ok(/free/i.test(await page.textContent('#clForm')), 'в форме сказано, что создание бесплатно');
    ok((await pageEval(page, () => window.BFOffline.user().coins)) === 0, 'у игрока 0 монет — и клан всё равно создаётся');
    await page.fill('#clfName', 'My Local Clan'); await page.fill('#clfTag', 'mlc'); await page.fill('#clfDesc', 'Made offline');
    await page.evaluate(() => { const c = document.getElementById('clfColor'); c.value = '#e11d48'; c.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click('#clfGo');
    await page.waitForURL(/clans\?id=3/, { timeout: 8000 });
    await page.waitForSelector('h1');
    ok(/My Local Clan/.test(await page.textContent('h1')) && (await page.textContent('.clTag')) === 'MLC', 'клан создан: название и тег MLC');
    ok((await pageEval(page, () => window.BFOffline.user().coins)) === 0, 'монеты не списались');
    ok(!!(await page.$('[data-act="disband"]')) && !!(await page.$('[data-act="save"]')), 'создатель — лидер: роспуск и настройки на месте');
    ok(!!(await page.$('[data-act="leave"]')), 'одинокий лидер может выйти (клан тогда распускается)');
    await page.fill('#cleDesc', 'Changed'); await page.click('[data-act="save"]');
    await page.waitForTimeout(500);
    ok(await pageEval(page, () => JSON.parse(localStorage.getItem('aibrofist.local.v2.clans')).find(c => c.id === '3').desc === 'Changed'), 'настройки сохраняются');
    await page.goto(BASE + '/clans'); await page.waitForSelector('#clMine .clMine');
    ok(/My Local Clan/.test(await page.textContent('#clMine')), 'на странице списка виден «Your clan»');
    ok(!(await page.isVisible('#clNew')), 'кнопки создания у члена клана нет');
    await page.goto(BASE + '/clans?id=3'); await page.waitForSelector('[data-act="disband"]');
    await page.click('[data-act="disband"]');
    await page.waitForURL(/\/clans$/, { timeout: 8000 });
    await page.waitForSelector('#clNew', { state: 'visible', timeout: 8000 });
    ok(true, 'после роспуска кнопка создания снова на месте');
    await page.goto(BASE + '/clans?id=1'); await page.waitForSelector('[data-act="join"]');
    await page.click('[data-act="join"]'); await page.waitForSelector('[data-act="leave"]');
    ok(true, 'в открытый учебный клан можно вступить');
    await page.click('[data-act="leave"]'); await page.waitForURL(/\/clans$/, { timeout: 8000 });
    await page.goto(BASE + '/clans?id=2'); await page.waitForSelector('[data-act="join"]');
    ok(/Request/i.test(await page.textContent('[data-act="join"]')), 'в закрытый — «Request to join»');
    await page.click('[data-act="join"]'); await page.waitForSelector('[data-act="cancel"]');
    ok(true, 'заявка отправлена, можно отменить');
    await ctx.close();
  }

  ok(errs.length === 0, 'ошибок скриптов нет', errs.join(' | '));
  await browser.close(); srv.close();
  console.log('\n' + pass + ' ok, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
