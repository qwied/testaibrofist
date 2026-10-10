/* DoS через карту: objectsOf() в maps.js проверяет только o.type — числовые
   x/y/w/h из чужого JSON раньше долетали на диск как есть. Клиентский
   loadMap() (game.html/editor.html) теперь клэмпит их защитно при загрузке,
   но единственная настоящая граница доверия — здесь, на /uploadMap:
   buildGrid() на клиенте (CELL=260) у объекта шириной 1e9 раскладывает его
   по ~3.8 млн ячеек на одной только оси и намертво вешает вкладку любому,
   кто откроет карту, даже просто посмотреть — это нужно отклонять ДО того,
   как карта попадёт на диск и до кого-то доедет.

   Приём тот же, что и в остальных raw-тестах (test-ranks-raw.js и т.п.):
   поднимаем сервер, сайтовым HTTP прогоняем /uploadMap напрямую. */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const PORT = 3223;
  const BASE = 'http://127.0.0.1:' + PORT;
  const USER = 'maptestuser' + Math.floor(Math.random() * 1e6);

  function startServer() {
    return spawn(process.execPath, ['server.js'], {
      cwd: __dirname, env: Object.assign({}, process.env, { PORT: String(PORT) }),
      stdio: ['ignore', 'pipe', 'pipe']
    });
  }
  async function waitUp() {
    for (let i = 0; i < 50; i++) {
      try { const r = await fetch(BASE + '/'); if (r.ok) return true; } catch (e) {}
      await sleep(200);
    }
    return false;
  }
  function jar() {
    let cookie = '';
    return {
      header() { return cookie ? { Cookie: cookie } : {}; },
      capture(r) { const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; }
    };
  }
  function signUp(name, cookieJar) {
    return fetch(BASE + '/signUp', {
      method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, cookieJar.header()),
      body: JSON.stringify({ name: name, password: 'Passw0rd!x' })
    }).then(r => { cookieJar.capture(r); return r.json(); });
  }
  function post(url, body, cookieJar) {
    return fetch(BASE + url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded' }, cookieJar.header()),
      body: new URLSearchParams(body).toString()
    }).then(r => r.json());
  }

  // 100 валидных объектов (OBJ_MIN=100) + один спойлер с огромным w
  function rectAt(i) { return { id: i + 1, type: 'rect', x: (i % 20) * 40, y: Math.floor(i / 20) * 40, w: 20, h: 20, rot: 0 }; }
  function goodMap() {
    const objs = []; for (let i = 0; i < 100; i++) objs.push(rectAt(i));
    return JSON.stringify({ objects: objs, mode: 'hideAndSeek' });
  }
  function hugeWidthMap() {
    const objs = []; for (let i = 0; i < 100; i++) objs.push(rectAt(i));
    objs[0] = Object.assign({}, objs[0], { w: 1e9 });
    return JSON.stringify({ objects: objs, mode: 'hideAndSeek' });
  }
  function hugeCoordMap() {
    const objs = []; for (let i = 0; i < 100; i++) objs.push(rectAt(i));
    objs[1] = Object.assign({}, objs[1], { x: 1e12 });
    return JSON.stringify({ objects: objs, mode: 'hideAndSeek' });
  }
  function nonFiniteMap() {
    const objs = []; for (let i = 0; i < 100; i++) objs.push(rectAt(i));
    objs[2] = Object.assign({}, objs[2], { w: 'oops' });
    return JSON.stringify({ objects: objs, mode: 'hideAndSeek' });
  }

  let child = startServer();
  let childErr = '';
  child.stderr.on('data', d => { childErr += d.toString(); });
  const publishedNames = [];
  try {
    ok(await waitUp(), 'тестовый сервер поднялся на ' + PORT);

    const userJar = jar();
    const su = await signUp(USER, userJar);
    ok(su.status === 'success', 'тестовый игрок зарегистрирован', JSON.stringify(su));

    const t0 = Date.now();
    const rHuge = await post('/uploadMap', { mapName: 'huge w ' + Date.now(), mapType: 'hideAndSeek', mapData: hugeWidthMap() }, userJar);
    const dt = Date.now() - t0;
    ok(rHuge.status === 'error', 'карта с w:1e9 отклонена на публикации', JSON.stringify(rHuge));
    ok(dt < 3000, 'отклонение быстрое, сервер не завис на валидации (' + dt + 'ms)');

    const rCoord = await post('/uploadMap', { mapName: 'huge x ' + Date.now(), mapType: 'hideAndSeek', mapData: hugeCoordMap() }, userJar);
    ok(rCoord.status === 'error', 'карта с x:1e12 тоже отклонена', JSON.stringify(rCoord));

    const rNonFinite = await post('/uploadMap', { mapName: 'nan w ' + Date.now(), mapType: 'hideAndSeek', mapData: nonFiniteMap() }, userJar);
    ok(rNonFinite.status === 'error', 'нечисловое w отклоняется, а не долетает как NaN', JSON.stringify(rNonFinite));

    const goodName = 'normal map ' + Date.now();
    const rGood = await post('/uploadMap', { mapName: goodName, mapType: 'hideAndSeek', mapData: goodMap() }, userJar);
    ok(rGood.status === 'success', 'обычная валидная карта всё ещё публикуется', JSON.stringify(rGood));
    if (rGood.status === 'success') publishedNames.push(goodName);

    const pong = await fetch(BASE + '/').then(r => r.status);
    ok(pong === 200, 'сервер жив и отвечает после всех попыток');
  } catch (e) {
    console.error('FATAL', e);
    fail++;
  } finally {
    child.kill();
    await sleep(300);
    try {
      const USERS_FILE = path.join(__dirname, 'data', 'users.json');
      const udb = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      delete udb.users[USER.toLowerCase()];
      fs.writeFileSync(USERS_FILE, JSON.stringify(udb, null, 2));
    } catch (e) { /* не критично для теста */ }
    try {
      const MAPS_FILE = path.join(__dirname, 'data', 'maps.json');
      const mdb = JSON.parse(fs.readFileSync(MAPS_FILE, 'utf8'));
      const list = Array.isArray(mdb) ? mdb : mdb.maps;
      if (Array.isArray(list) && publishedNames.length) {
        const kept = list.filter(m => !(String(m.author).toLowerCase() === USER.toLowerCase()));
        if (Array.isArray(mdb)) fs.writeFileSync(MAPS_FILE, JSON.stringify(kept, null, 2));
        else { mdb.maps = kept; fs.writeFileSync(MAPS_FILE, JSON.stringify(mdb, null, 2)); }
      }
    } catch (e) { /* не критично для теста */ }
  }

  console.log(fail ? ('\n' + fail + ' ошибок') : '\nвсё чисто');
  process.exit(fail ? 1 : 0);
})();
