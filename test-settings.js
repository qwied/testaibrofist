/* Окно Settings: тема и язык внутри него, страница Themes убрана. */
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3210';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch();
  const ip = '10.' + (1 + Math.floor(Math.random() * 250)) + '.7.3';
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { 'CF-Connecting-IP': ip } });
  const errs = [];
  ctx.on('page', p => p.on('pageerror', e => errs.push(e.message.slice(0, 120))));
  const p = await ctx.newPage();
  const name = 'set' + Math.floor(Math.random() * 1e6);

  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.evaluate(() => { const c = document.getElementById('bfConsent'); if (c) c.remove(); });
  const reg = await p.evaluate(async n => {
    const r = await fetch('/signUp', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: n, password: 'Passw0rd!x' }), credentials: 'same-origin' });
    return (await r.json()).status;
  }, name);
  ok(reg === 'success', 'аккаунт создан', reg);

  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.evaluate(() => { const c = document.getElementById('bfConsent'); if (c) c.remove(); });
  await sleep(1400);

  ok(!(await p.$('a[href="themes.html"]')), 'пункт Themes из бокового меню убран');
  ok((await p.evaluate(() => fetch('/themes.html').then(r => r.status))) === 404,
     'страница themes.html больше не отдаётся');

  await p.evaluate(() => window.bfOpenSettings());
  await sleep(1200);
  ok(!!(await p.$('#bfThemeBox')), 'в Settings появилась секция темы');
  ok(!!(await p.$('#bfLangRow')), 'в Settings появилась секция языка');

  const langs = await p.evaluate(() => [...document.querySelectorAll('#bfLangRow .bf-opt')].map(e => e.textContent.trim()));
  ok(langs.length === 2 && langs.includes('English') && langs.includes('Русский'), 'два языка', langs.join(' / '));
  ok(await p.evaluate(() => {
    const on = document.querySelector('#bfLangRow .bf-opt.on');
    return on && on.getAttribute('data-lang') === 'en';
  }), 'по умолчанию английский');

  // тема закрыта у нового аккаунта — должен быть замок с ценой
  ok(!!(await p.$('#bfThemeBuy')), 'тема закрыта — показан замок с покупкой');

  // переключаем язык
  await p.click('#bfLangRow .bf-opt[data-lang="ru"]');
  await sleep(1400);
  const ru = await p.evaluate(() => ({
    html: document.documentElement.getAttribute('lang'),
    stored: localStorage.getItem('bfLang'),
    nav: [...document.querySelectorAll('.bfNavItem')].map(e => e.textContent.trim()).slice(0, 4)
  }));
  ok(ru.html === 'ru', 'атрибут lang стал ru', ru.html);
  ok(ru.stored === 'ru', 'выбор записан в браузер', String(ru.stored));
  ok(ru.nav.some(t => /[А-Яа-я]/.test(t)), 'боковое меню перевелось', ru.nav.join(' | '));

  ok((await p.evaluate(() => fetch('/i18n/get', { credentials: 'same-origin' }).then(r => r.json()).then(d => d.lang)))
     === 'ru', 'выбор сохранён в аккаунте');

  // новая вкладка того же аккаунта — язык должен подняться сам
  const p2 = await ctx.newPage();
  await p2.goto(BASE + '/quests.html', { waitUntil: 'networkidle' });
  await sleep(1600);
  ok(await p2.evaluate(() => document.documentElement.getAttribute('lang') === 'ru'),
     'на другой странице язык подхватился');

  // и обратно на английский
  await p.evaluate(() => window.bfOpenSettings());
  await sleep(1000);
  await p.click('#bfLangRow .bf-opt[data-lang="en"]');
  await sleep(1400);
  ok(await p.evaluate(() => document.documentElement.getAttribute('lang') === 'en'), 'переключается обратно на английский');

  console.log('\nошибки в консоли: ' + (errs.length ? errs.join(' | ') : 'нет'));
  console.log('итог: ' + pass + ' ок, ' + fail + ' провалов');
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
