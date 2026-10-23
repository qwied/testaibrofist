/* Папки карт в профиле: создать, переименовать, сменить цвет, положить карту, удалить. */
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3210';  // сервер: PASSWORD_AUTH=1 PORT=3210 node server.js
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch();
  const ip = '10.' + (1 + Math.floor(Math.random() * 250)) + '.9.4';
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { 'CF-Connecting-IP': ip } });
  const errs = [];
  ctx.on('page', p => p.on('pageerror', e => errs.push(e.message.slice(0, 120))));
  const p = await ctx.newPage();
  const name = 'fld' + Math.floor(Math.random() * 1e6);
  const post = (url, body) => p.evaluate(async ([u, d]) => {
    const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d), credentials: 'same-origin' });
    return r.json();
  }, [url, body]);

  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.evaluate(() => { const c = document.getElementById('bfConsent'); if (c) c.remove(); });
  ok((await post('/signUp', { name, password: 'Passw0rd!x' })).status === 'success', 'аккаунт создан');

  // карта из 100 блоков — минимум для публикации
  const objs = [{ type: 'spawn', x: 0, y: 0, w: 30, h: 60 }];
  for (let i = 0; i < 120; i++) objs.push({ type: 'rect', x: i * 40, y: 200, w: 30, h: 30 });
  const up = await post('/uploadMap', { mapName: 'Folder map', mapType: 'hideAndSeek', mapData: JSON.stringify(objs) });
  ok(up.status === 'success', 'карта опубликована', up.message);

  await p.goto(BASE + '/users?name=' + name, { waitUntil: 'networkidle' });
  await p.evaluate(() => { const c = document.getElementById('bfConsent'); if (c) c.remove(); });
  await sleep(800);
  await p.click('.bfTab[data-tab="maps"]');
  await sleep(900);
  ok(!!(await p.$('#upFolderNew')), 'у своего профиля есть кнопка «+ Папка»');

  // создать
  await p.click('#upFolderNew');
  await p.fill('#upFolderName', 'Races');
  await p.evaluate(() => { const c = document.getElementById('upFolderColor'); c.value = '#ef4444'; c.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.click('#upFolderSave');
  await sleep(900);
  let list = await p.evaluate(n => fetch('/mapFolders?name=' + n).then(r => r.json()), name);
  ok(list.folders.length === 1 && list.folders[0].name === 'Races' && list.folders[0].color === '#ef4444',
     'папка создана с именем и цветом', JSON.stringify(list.folders));
  ok(!!(await p.$('.upFolderChip[data-folder="' + list.folders[0].id + '"]')), 'папка появилась в панели');

  // переименовать и перекрасить
  await p.click('[data-edit-folder]');
  await sleep(300);
  ok((await p.inputValue('#upFolderName')) === 'Races', 'форма открылась с текущим именем');
  await p.fill('#upFolderName', 'Speedruns');
  await p.evaluate(() => { const c = document.getElementById('upFolderColor'); c.value = '#16a34a'; c.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.click('#upFolderSave');
  await sleep(900);
  list = await p.evaluate(n => fetch('/mapFolders?name=' + n).then(r => r.json()), name);
  ok(list.folders[0].name === 'Speedruns' && list.folders[0].color === '#16a34a',
     'имя и цвет папки меняются', JSON.stringify(list.folders));
  const chip = await p.evaluate(() => {
    const c = document.querySelector('.upFolderChip[data-folder]:not([data-folder=""]):not([data-folder="__none__"])');
    return c && { text: c.textContent, fc: c.style.getPropertyValue('--fc') };
  });
  ok(chip && /Speedruns/.test(chip.text) && /16a34a/i.test(chip.fc), 'в панели новое имя и цвет', JSON.stringify(chip));

  // положить карту и отфильтровать
  await p.selectOption('.upFolderAssign', list.folders[0].id);
  await sleep(900);
  list = await p.evaluate(n => fetch('/mapFolders?name=' + n).then(r => r.json()), name);
  ok(Object.values(list.mapFolderOf).indexOf(list.folders[0].id) !== -1, 'карта лежит в папке', JSON.stringify(list.mapFolderOf));
  await p.click('.upFolderChip[data-folder="__none__"]');
  await sleep(300);
  ok((await p.$$('[data-assign-map]')).length === 0, 'фильтр «Без папки» прячет карту из папки');

  // чужой не может менять
  const other = await b.newContext({ extraHTTPHeaders: { 'CF-Connecting-IP': '10.' + (1 + Math.floor(Math.random() * 250)) + '.9.5' } });
  const op = await other.newPage();
  await op.goto(BASE + '/', { waitUntil: 'networkidle' });
  const bad = await op.evaluate(async () => (await fetch('/mapFolders/edit', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: '1', name: 'hack' }) })).json());
  ok(bad.status === 'error', 'без входа менять папки нельзя', bad.message);

  // удалить
  await p.click('.upFolderChip[data-folder=""]');
  await sleep(300);
  await p.click('[data-edit-folder]');
  p.once('dialog', d => d.accept());
  await p.click('#upFolderDelete');
  await sleep(900);
  list = await p.evaluate(n => fetch('/mapFolders?name=' + n).then(r => r.json()), name);
  ok(list.folders.length === 0 && Object.keys(list.mapFolderOf).length === 0, 'папка удалена, карта осталась без папки');

  ok(errs.length === 0, 'ошибок скриптов нет', errs.join(' | '));
  await b.close();
  console.log(pass + ' ok, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
