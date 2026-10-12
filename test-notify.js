/* Уведомления: красный счётчик у Messages, метки у отправителей и
   плашка про новые карты друзей в Maps Browser. */
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3210';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function makeUser(b, tag) {
  const ip = '10.' + (1 + Math.floor(Math.random() * 250)) + '.' + (1 + Math.floor(Math.random() * 250)) + '.2';
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { 'CF-Connecting-IP': ip } });
  const p = await ctx.newPage();
  const name = tag + Math.floor(Math.random() * 1e6);
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.evaluate(() => { const c = document.getElementById('bfConsent'); if (c) c.remove(); });
  const st = await p.evaluate(async n => {
    const r = await fetch('/signUp', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: n, password: 'Passw0rd!x' }), credentials: 'same-origin' });
    return (await r.json()).status;
  }, name);
  if (st !== 'success') throw new Error('регистрация ' + name + ': ' + st);
  return { ctx, p, name };
}
const post = (p, url, data) => p.evaluate(async a => {
  const body = Object.keys(a.d).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(a.d[k])).join('&');
  const r = await fetch(a.u, { method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  return r.json();
}, { u: url, d: data });

(async () => {
  const b = await chromium.launch();
  const errs = [];
  const A = await makeUser(b, 'na');
  const B = await makeUser(b, 'nb');
  A.ctx.on('page', pg => pg.on('pageerror', e => errs.push('A: ' + e.message.slice(0, 90))));
  B.ctx.on('page', pg => pg.on('pageerror', e => errs.push('B: ' + e.message.slice(0, 90))));

  // дружим
  await post(B.p, '/friendRequest', { name: A.name });
  await post(A.p, '/acceptFriendRequest', { name: B.name });
  const fr = await A.p.evaluate(n => fetch('/getFriendsList?name=' + encodeURIComponent(n) + '&type=friends',
    { credentials: 'same-origin' }).then(r => r.json()), A.name);
  ok((fr.relation || []).length === 1, 'аккаунты подружились', (fr.relation || []).map(x => x.name).join(','));

  // A открывает Maps Browser — с этого момента новые карты считаются
  await A.p.goto(BASE + '/mapsBrowser.html', { waitUntil: 'networkidle' });
  await sleep(1800);

  // --- сообщение от B к A ---
  const th = await post(B.p, '/messages/start', { names: A.name });
  ok(th.status === 'success', 'переписка создана', JSON.stringify(th).slice(0, 60));
  await post(B.p, '/messages/send', { id: th.id, text: 'Привет!' });
  await sleep(400);
  await post(B.p, '/messages/send', { id: th.id, text: 'Как дела?' });
  await sleep(600);

  const nt = await A.p.evaluate(() => fetch('/notifications', { credentials: 'same-origin' }).then(r => r.json()));
  ok(nt.messages.total === 2, 'сервер видит 2 непрочитанных', String(nt.messages.total));
  ok((nt.messages.from || [])[0] === B.name, 'знает, кто написал', (nt.messages.from || []).join(','));

  // значок в боковом меню
  await A.p.goto(BASE + '/quests.html', { waitUntil: 'networkidle' });
  await sleep(2200);
  const dot = await A.p.evaluate(() => {
    const d = document.getElementById('bfDot_messages');
    return d ? { on: d.classList.contains('on'), text: d.textContent, title: d.getAttribute('title') || '' } : null;
  });
  ok(dot && dot.on, 'красный кружок у Messages виден');
  ok(dot && dot.text === '2', 'в кружке общее число непрочитанных', dot && dot.text);
  ok(dot && dot.title.indexOf(B.name) !== -1, 'в подсказке — кто написал', dot && dot.title);

  // метка рядом с отправителем в самом Messages
  await A.p.goto(BASE + '/messages.html', { waitUntil: 'networkidle' });
  await sleep(2000);
  const rows = await A.p.evaluate(() => [...document.querySelectorAll('.msRow')].map(r => ({
    name: (r.querySelector('.msRowName') || {}).textContent || '',
    badge: (r.querySelector('.msBadge') || {}).textContent || ''
  })));
  ok(rows.length === 1 && rows[0].badge === '2', 'метка у отправителя в списке переписок',
     JSON.stringify(rows[0] || {}));
  ok(rows[0] && rows[0].name.indexOf(B.name) !== -1, 'метка стоит именно у него', rows[0] && rows[0].name);

  // открыли переписку — значок гаснет
  await A.p.click('.msRow');
  await sleep(2000);
  const after = await A.p.evaluate(() => fetch('/notifications', { credentials: 'same-origin' }).then(r => r.json()));
  ok(after.messages.total === 0, 'после прочтения счётчик обнулился', String(after.messages.total));

  // --- новая карта от друга ---
  // сервер требует не меньше OBJ_MIN объектов на карту — строим настоящую
  const mapData = JSON.stringify({ mode: 'race', gravity: 9, objects: Array.from({ length: 130 }, (_, i) => ({
    id: i + 1, type: i === 0 ? 'spawn' : (i === 1 ? 'finishline' : 'rect'),
    x: (i % 20) * 40, y: 300 + Math.floor(i / 20) * 60, w: 40, h: 40, rot: 0, fill: '#111827' })) });
  const up = await post(B.p, '/uploadMap', { mapName: 'FriendMap' + Math.floor(Math.random() * 1e5),
    mapType: 'race', mapData: mapData });
  ok(up.status === 'success', 'друг опубликовал карту', JSON.stringify(up).slice(0, 80));

  const nm = await A.p.evaluate(() => fetch('/notifications', { credentials: 'same-origin' }).then(r => r.json()));
  ok(nm.maps.count === 1, 'сервер видит 1 новую карту друга', String(nm.maps.count));
  ok((nm.maps.authors || [])[0] === B.name, 'знает автора', (nm.maps.authors || []).join(','));

  await A.p.goto(BASE + '/logs.html', { waitUntil: 'networkidle' });
  await sleep(2200);
  const mdot = await A.p.evaluate(() => {
    const d = document.getElementById('bfDot_mapsBrowser');
    return d ? { on: d.classList.contains('on'), text: d.textContent } : null;
  });
  ok(mdot && mdot.on && mdot.text === '1', 'кружок у Maps Browser виден', JSON.stringify(mdot));

  // заходим в Maps Browser — плашка есть, потом значок гаснет
  await A.p.goto(BASE + '/mapsBrowser.html', { waitUntil: 'networkidle' });
  await sleep(2500);
  const banner = await A.p.evaluate(() => {
    const e = document.getElementById('mbNew');
    return { on: e.classList.contains('on'), text: e.textContent.trim() };
  });
  ok(banner.on && banner.text.indexOf(B.name) !== -1, 'плашка про новые карты друга', banner.text);

  const cleared = await A.p.evaluate(() => fetch('/notifications', { credentials: 'same-origin' }).then(r => r.json()));
  ok(cleared.maps.count === 0, 'после захода в Maps Browser счётчик обнулился', String(cleared.maps.count));

  // чужие карты не считаются: C не друг
  const C = await makeUser(b, 'nc');
  await post(C.p, '/uploadMap', { mapName: 'StrangerMap' + Math.floor(Math.random() * 1e5),
    mapType: 'race', mapData: mapData });
  await sleep(500);
  const strange = await A.p.evaluate(() => fetch('/notifications', { credentials: 'same-origin' }).then(r => r.json()));
  ok(strange.maps.count === 0, 'карта не-друга уведомления не даёт', String(strange.maps.count));

  console.log('\nошибки в консоли: ' + (errs.length ? errs.join(' | ') : 'нет'));
  console.log('итог: ' + pass + ' ок, ' + fail + ' провалов');
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
