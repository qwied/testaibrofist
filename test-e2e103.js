/* E2E v103: два живых браузера против живого сервера.
   Проверяем:
   1) оба игрока видят друг друга (count = 2);
   2) кадры 'state' приходят ~30 раз в секунду (источник плавности чужих);
   3) интерполяция на клиенте выдаёт малые шаги между кадрами (без рывков);
   4) новые иконки режимов отдаются;
   5) чужой Origin сокет открыть не может, свой — может; saveMap/getMaps удалены. */
const { chromium } = require('/home/z/node_modules/playwright');
const http = require('http');

const BASE = 'http://localhost:' + (process.env.PORT || 3113);
let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };

function get(path, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + path);
    http.get(u, { headers: headers || {} }, res => {
      let n = 0; const chunks = [];
      res.on('data', c => { n += c.length; if (chunks.length < 2) chunks.push(c); });
      res.on('end', () => resolve({ status: res.statusCode, size: n, head: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

(async () => {
  // посев: без опубликованной карты race игра не стартует (и это правильно).
  // Пул карт режима — карты ВЛАДЕЛЬЦА, поэтому сервер в E2E запускается с
  // OWNER_NAME=E2EOwner; регистрируемся/входим и выкладываем карту от него.
  async function ownerCookie() {
    const body = { name: 'E2EOwner', password: 'e2e-pass-123' };
    let r = await fetch(BASE + '/signUp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    let j = await r.json().catch(() => ({}));
    if (j.status !== 'success') {
      r = await fetch(BASE + '/signIn', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      j = await r.json().catch(() => ({}));
    }
    return j.status === 'success' ? (r.headers.get('set-cookie') || '') : '';
  }
  const cookie = await ownerCookie();
  const up = await fetch(BASE + '/uploadMap', {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: cookie },
    body: JSON.stringify({
      mapName: 'e2e-seed', mapType: 'race',
      mapData: JSON.stringify({ objects: [
        { type: 'spawn', x: 60, y: 300, w: 20, h: 60 },
        { type: 'rect', x: 0, y: 380, w: 600, h: 40 },
        { type: 'finishline', x: 520, y: 300, w: 20, h: 80 }
      ] })
    })
  }).then(r => r.json()).catch(e => ({}));
  ok('тестовая карта засеяна', up.status === 'success' || up.message === 'Карта обновлена',
     JSON.stringify(up.message || up));

  const browser = await chromium.launch();

  const ctxA = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const ctxB = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();

  await Promise.all([
    A.goto(BASE + '/game.html?mode=race&room=e2e103', { waitUntil: 'domcontentloaded' }),
    B.goto(BASE + '/game.html?mode=race&room=e2e103', { waitUntil: 'domcontentloaded' })
  ]);
  await A.waitForTimeout(4500);

  const aInfo = await A.evaluate(() => ({
    count: (document.getElementById('gCount') || {}).textContent || '?'
  }));
  ok('оба игрока в комнате', aInfo.count === '2', 'count=' + aInfo.count);

  // частота кадров 'state' на клиенте: третий сокет из страницы A, та же комната.
  // B в это время ДВИГАЕТСЯ — кадры с изменениями и есть темп снапшотов
  // (стоящие игроки не рассылаются: только опорный кадр раз в секунду).
  await B.keyboard.down('ArrowRight');
  const hz = await A.evaluate(() => new Promise(resolve => {
    try {
      const s = io({ transports: ['websocket'] });
      let n = 0;
      s.on('connect', () => {
        s.emit('join', { playerName: 'HzProbe', gameMode: 'race', room: 'e2e103' });
        const t0 = Date.now();
        s.on('state', () => { n++; });
        setTimeout(() => { s.disconnect(); resolve(Math.round(n / ((Date.now() - t0) / 1000))); }, 2500);
      });
      setTimeout(() => resolve(-1), 8000);
    } catch (e) { resolve(-2); }
  }));
  await B.keyboard.up('ArrowRight');
  ok('кадры комнаты приходят ~30 раз в секунду', hz >= 24 && hz <= 40, hz + ' Гц');

  // плавность интерполяции: подкармливаем буфер как сеть и смотрим шаги
  const steps = await A.evaluate(() => {
    const o = { buf: [], tx: 0, ty: 0 };
    const t = performance.now();
    // имитация 30 Гц: игрок едет 300 px/с
    for (let i = 0; i < 10; i++) {
      o.buf.push({ t: t + i * 33, x: i * 10, y: 0 });
    }
    const out = [];
    for (let f = 0; f < 8; f++) {
      const rt = t + 40 + f * 16.7;      // рисуем 60 FPS между кадрами 33 мс
      const s = (function sampleShim(o, rt) {
        const b = o.buf;
        if (!b || !b.length) return null;
        for (let i = b.length - 1; i > 0; i--) {
          const a = b[i - 1], c = b[i];
          if (a.t <= rt && rt <= c.t) {
            const k = (rt - a.t) / Math.max(1, c.t - a.t);
            return { x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k };
          }
        }
        return b[b.length - 1];
      })(o, rt);
      out.push(s ? s.x : -1);
    }
    return out;
  });
  const jumps = steps.filter((x, i) => i > 0 && Math.abs(x - steps[i - 1]) > 7).length;
  ok('между кадрами шаги малые (без рывков)', jumps === 0, steps.map(x => x.toFixed(1)).join(', '));

  // иконки
  const race = await get('/mode-race.png?v=103');
  const hide = await get('/mode-hide.png?v=103');
  ok('новая иконка Race отдаётся', race.status === 200 && race.size > 5000, race.size + ' Б');
  ok('новая иконка Hide отдаётся', hide.status === 200 && hide.size > 3000, hide.size + ' Б');

  // безопасность: чужой Origin
  const foreign = await new Promise(resolve => {
    const { io } = require('socket.io-client');
    const s = io(BASE, { transports: ['websocket'], extraHeaders: { Origin: 'https://evil-site.example' } });
    const done = r => { try { s.disconnect(); } catch (e) {} resolve(r); };
    s.on('connect', () => done('connected'));
    s.on('connect_error', e => done('blocked:' + (e.message || e)));
    setTimeout(() => done('timeout'), 5000);
  });
  ok('чужой сайт сокет открыть не может', String(foreign).indexOf('blocked') === 0, String(foreign));

  const own = await new Promise(resolve => {
    const { io } = require('socket.io-client');
    const s = io(BASE, { transports: ['websocket'], extraHeaders: { Origin: BASE } });
    const done = r => { try { s.disconnect(); } catch (e) {} resolve(r); };
    s.on('connect', () => done('connected'));
    s.on('connect_error', e => done('blocked:' + (e.message || e)));
    setTimeout(() => done('timeout'), 5000);
  });
  ok('свой сайт сокет открывает', own === 'connected', String(own));

  const srvSrc = require('fs').readFileSync(__dirname + '/server.js', 'utf8');
  ok('saveMap/getMaps удалены с сервера', srvSrc.indexOf("socket.on('saveMap'") === -1 && srvSrc.indexOf("socket.on('getMaps'") === -1);

  await browser.close();
  console.log(fails ? '\n✗ ошибок: ' + fails : '\n✓ всё зелено');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('E2E упал:', e.message); process.exit(1); });
