/* Story Mode: выбирается ЛЮБАЯ карта из Maps Browser, режим берётся у карты. */
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3210';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch();
  const ip = '10.' + (1 + Math.floor(Math.random() * 250)) + '.6.6';
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { 'CF-Connecting-IP': ip } });
  const errs = [];
  ctx.on('page', p => p.on('pageerror', e => errs.push(e.message.slice(0, 120))));
  const p = await ctx.newPage();
  const name = 'st' + Math.floor(Math.random() * 1e6);

  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.evaluate(() => { const c = document.getElementById('bfConsent'); if (c) c.remove(); });
  await p.evaluate(async n => {
    await fetch('/signUp', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: n, password: 'Passw0rd!x' }), credentials: 'same-origin' });
  }, name);

  // сколько карт всего и сколько в каждом режиме
  const all = await p.evaluate(() => fetch('/getMapsForList?page=1', { credentials: 'same-origin' }).then(r => r.json()));
  const race = await p.evaluate(() => fetch('/getMapsForList?mapType=race&page=1', { credentials: 'same-origin' }).then(r => r.json()));
  const hns = await p.evaluate(() => fetch('/getMapsForList?mapType=hideAndSeek&page=1', { credentials: 'same-origin' }).then(r => r.json()));
  console.log('  карт всего ' + all.count + ' (race ' + race.count + ', прятки ' + hns.count + ')');

  // страница Story, открытая из Hide and Seek, должна уметь показать ВСЕ
  await p.goto(BASE + '/story.html?mode=hideAndSeek', { waitUntil: 'networkidle' });
  await sleep(1800);
  const filtered = await p.evaluate(() => document.querySelectorAll('.stMap[data-map]').length);
  ok(filtered > 0, 'с фильтром режима список не пуст', 'строк ' + filtered);

  await p.click('#stFilter button[data-type=""]');
  await sleep(1500);
  const shown = await p.evaluate(() => [...document.querySelectorAll('.stMap[data-map]')]
    .map(e => e.dataset.type));
  ok(shown.length >= filtered, 'кнопка «все режимы» показывает не меньше карт', shown.length + ' против ' + filtered);
  ok(new Set(shown).size > 1 || all.count === race.count || all.count === hns.count,
     'в общем списке встречаются оба режима', [...new Set(shown)].join(', '));
  ok(shown.length === Math.min(10, all.count), 'показаны все карты страницы, а не только свой режим',
     shown.length + ' из ' + all.count);

  // у каждой строки подписан режим
  ok(await p.evaluate(() => [...document.querySelectorAll('.stMap[data-map]')].every(e => e.querySelector('.m'))),
     'у каждой карты подписан её режим');

  // берём карту ЧУЖОГО режима относительно ?mode=hideAndSeek и создаём сессию
  const target = await p.evaluate(() => {
    const row = [...document.querySelectorAll('.stMap[data-map]')].find(e => e.dataset.type === 'race');
    if (!row) return null;
    row.click();
    return { author: row.dataset.author, map: row.dataset.map, type: row.dataset.type };
  });
  ok(!!target, 'в списке нашлась карта другого режима', target ? target.map : '—');

  if (target) {
    await sleep(400);
    const r = await p.evaluate(async t => {
      const body = 'author=' + encodeURIComponent(t.author) + '&mapName=' + encodeURIComponent(t.map) + '&limitMin=10';
      const res = await fetch('/story/create', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      return res.json();
    }, target);
    ok(r.status === 'success', 'сессия создана на карте другого режима', JSON.stringify(r).slice(0, 90));
    ok(r.mode === target.type, 'режим сессии взят у карты', r.mode + ' = ' + target.type);

    const info = await p.evaluate(room => fetch('/story/roomInfo?room=' + encodeURIComponent(room),
      { credentials: 'same-origin' }).then(x => x.json()), r.room);
    ok(info.status === 'success' && info.mapName === target.map && info.mode === target.type,
       'приглашение отдаёт ту же карту и режим', info.mapName + ' / ' + info.mode);
  }

  console.log('\nошибки в консоли: ' + (errs.length ? errs.join(' | ') : 'нет'));
  console.log('итог: ' + pass + ' ок, ' + fail + ' провалов');
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
