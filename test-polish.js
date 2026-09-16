/* Мелкие правки внешнего вида по всей игре: единая ширина колонки
   контента, карточки режимов на всю колонку, карточка Daily Reward на
   одной оси с заголовком, без дубля "Rating" в шапке Maps Browser. */
'use strict';
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3210';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };

(async () => {
  const b = await chromium.launch();
  const ip = '10.' + (1 + Math.floor(Math.random() * 250)) + '.' + (1 + Math.floor(Math.random() * 250)) + '.3';
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { 'CF-Connecting-IP': ip } });
  const errs = [];
  ctx.on('page', p => p.on('pageerror', e => errs.push(e.message.slice(0, 100))));
  const p = await ctx.newPage();
  const name = 'po' + Math.floor(Math.random() * 1e6);

  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.evaluate(() => { const c = document.getElementById('bfConsent'); if (c) c.remove(); });
  await p.evaluate(async n => {
    await fetch('/signUp', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: n, password: 'Passw0rd!x' }), credentials: 'same-origin' });
  }, name);

  // ---- единая колонка контента ----
  const PAGES = ['/leaderboard.html', '/mapsBrowser.html', '/quests.html', '/daily.html',
                 '/messages.html', '/logs.html', '/story.html'];
  const edges = [];
  for (const path of PAGES) {
    await p.goto(BASE + path, { waitUntil: 'networkidle' }).catch(() => {});
    await p.evaluate(() => { const c = document.getElementById('bfConsent'); if (c) c.remove(); });
    await sleep(1200);
    const r = await p.evaluate(() => {
      const w = document.querySelector('.bfWrap');
      if (!w) return null;
      const b = w.getBoundingClientRect();
      return { left: Math.round(b.left), width: Math.round(b.width) };
    });
    edges.push([path, r]);
  }
  const known = edges.filter(([, r]) => r);
  ok(known.length === PAGES.length, 'у каждой страницы есть .bfWrap', known.length + ' из ' + PAGES.length);
  const lefts = new Set(known.map(([, r]) => r.left));
  const widths = new Set(known.map(([, r]) => r.width));
  ok(lefts.size === 1, 'левый край колонки одинаковый на всех страницах',
     known.map(([p, r]) => p + '=' + r.left).join(', '));
  ok(widths.size === 1, 'ширина колонки одинаковая на всех страницах',
     known.map(([p, r]) => p + '=' + r.width).join(', '));

  // ---- Daily Reward: карточка на одной оси с заголовком ----
  await p.goto(BASE + '/daily.html', { waitUntil: 'networkidle' });
  await p.evaluate(() => { const c = document.getElementById('bfConsent'); if (c) c.remove(); });
  await sleep(1500);
  const dr = await p.evaluate(() => {
    const title = document.querySelector('.bfTitle');
    const wheel = document.getElementById('bfDailyWheel');
    if (!title || !wheel) return null;
    return { titleLeft: Math.round(title.getBoundingClientRect().left),
             wheelLeft: Math.round(wheel.getBoundingClientRect().left) };
  });
  ok(!!dr && Math.abs(dr.titleLeft - dr.wheelLeft) <= 1, 'колесо Daily Reward под заголовком, не по центру',
     dr ? ('заголовок=' + dr.titleLeft + ' колесо=' + dr.wheelLeft) : 'нет данных');

  // ---- Maps Browser: без дубля "Rating" в шапке ----
  await p.goto(BASE + '/mapsBrowser.html', { waitUntil: 'networkidle' });
  await p.evaluate(() => { const c = document.getElementById('bfConsent'); if (c) c.remove(); });
  await sleep(1500);
  const head = await p.evaluate(() => [...document.querySelectorAll('.mbHead > div')].map(d => d.textContent.trim()));
  const dups = head.filter((t, i) => t && head.indexOf(t) !== i);
  ok(dups.length === 0, 'в шапке Maps Browser нет повторяющихся подписей', head.join(' | '));

  // ---- звезда и чекбокс избранного — площадь нажатия не меньше 26px ----
  const tap = await p.evaluate(() => {
    const star = document.querySelector('.mbFav');
    const chk = document.getElementById('mbFavOnly');
    const r = el => { const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
    return { star: star ? r(star) : null, chk: chk ? r(chk) : null };
  });
  ok(!!tap.star && tap.star.w >= 26 && tap.star.h >= 26, 'звезда избранного не мельче 26px', JSON.stringify(tap.star));
  ok(!!tap.chk && tap.chk.w >= 18 && tap.chk.h >= 18, 'чекбокс "Favorites only" не мельче 18px', JSON.stringify(tap.chk));

  // ---- главная: карточки режимов заполняют колонку, а не треть экрана ----
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.evaluate(() => { const c = document.getElementById('bfConsent'); if (c) c.remove(); });
  await sleep(1200);
  const cards = await p.evaluate(() => {
    const el = document.querySelector('.cards');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { display: cs.display, width: Math.round(el.getBoundingClientRect().width) };
  });
  ok(!!cards && cards.display === 'grid', 'карточки режимов — грид, не float', cards && cards.display);
  ok(!!cards && cards.width >= 600, 'карточки заполняют колонку, а не треть экрана', cards && cards.width + 'px');

  console.log('\nошибки в консоли: ' + (errs.length ? errs.join(' | ') : 'нет'));
  console.log('итог: ' + pass + ' ок, ' + fail + ' провалов');
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
