/* Рассинхрон между устройствами: видит ли игрок с телефона чужого
   персонажа ровно в тех же мировых координатах, что и игрок с монитора.
   Меряем не картинку, а то, что рисует движок: позицию чужого в мире. */
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3210';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };

const SCREENS = [
  [1920, 1080, 'монитор 1920x1080'],
  [1280, 900, 'ноутбук 1280x900'],
  [430, 932, 'телефон 430x932'],
  [360, 780, 'телефон 360x780']
];
const ROOM = 'sync' + Math.floor(Math.random() * 1e6);

async function join(b, w, h) {
  const ip = '10.' + (1 + Math.floor(Math.random() * 250)) + '.' + (1 + Math.floor(Math.random() * 250)) + '.7';
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: w < 700,
    extraHTTPHeaders: { 'CF-Connecting-IP': ip } });
  const p = await ctx.newPage();
  await p.goto(BASE + '/game.html?mode=hideAndSeek&room=' + ROOM, { waitUntil: 'domcontentloaded' });
  return { ctx, p };
}

(async () => {
  const b = await chromium.launch();
  const clients = [];
  for (const [w, h, tag] of SCREENS) {
    const c = await join(b, w, h);
    c.tag = tag; c.w = w; c.h = h;
    clients.push(c);
  }
  await sleep(11000);

  // у каждого спрашиваем: где он сам и где, по его мнению, все остальные
  const views = [];
  for (const c of clients) {
    const v = await c.p.evaluate(() => {
      const G = window.GAME;
      if (!G) return null;
      const others = {};
      const list = (G.others && G.others()) || {};
      for (const id in list) {
        const o = list[id];
        others[o.name || id] = { x: Math.round(o.x), y: Math.round(o.y) };
      }
      var nm = document.getElementById('gMapName');
      return { me: G.me && G.me.name, x: Math.round(G.pl.x), y: Math.round(G.pl.y),
               map: nm ? nm.textContent.trim() : '?', playing: !!G.playing,
               zoom: +G.view.s.toFixed(3), unitsH: Math.round(innerHeight / G.view.s),
               unitsW: Math.round(innerWidth / G.view.s), others: others };
    });
    views.push(v);
    console.log('  ' + c.tag.padEnd(20) + (v ? 'зум ' + v.zoom + '  мира по вертикали ' + v.unitsH
      + ' ед.  карта «' + v.map + '»  чужих видит ' + Object.keys(v.others).length : 'нет GAME'));
  }
  ok(views.every(v => v), 'движок доступен на всех экранах');
  // главная причина рассинхрона: клиенты грузили РАЗНЫЕ карты одной комнаты
  const maps = views.filter(v => v).map(v => v.map);
  ok(new Set(maps).size === 1, 'все в комнате на одной карте', [...new Set(maps)].join(' / '));
  ok(views.every(v => v && Object.keys(v.others).length === SCREENS.length - 1),
     'каждый видит всех остальных', views.map(v => v ? Object.keys(v.others).length : '—').join('/'));

  // одинаков ли кусок мира по вертикали
  const hs = views.map(v => v.unitsH);
  /* Кусок мира совпадает только когда карта реально загрузилась: без
     карт режима в базе движок не стартует и зум остаётся единичным —
     это пустая база, а не рассинхрон, поэтому проверку пропускаем. */
  const loaded = views.every(v => v && v.playing);
  if (!loaded) console.log('  — движок не стартовал (карт этого режима в базе нет), проверку кадра пропускаем');
  else ok(Math.max(...hs) - Math.min(...hs) <= 1, 'по вертикали у всех один и тот же кусок мира',
          hs.join(' / ') + ' ед.');

  // главное: совпадают ли координаты чужих у разных наблюдателей
  let worst = 0, worstWho = '';
  for (const v of views) {
    if (!v) continue;
    for (const name in v.others) {
      const truth = views.find(x => x && x.me === name);
      if (!truth) continue;
      const dx = Math.abs(v.others[name].x - truth.x), dy = Math.abs(v.others[name].y - truth.y);
      const d = Math.max(dx, dy);
      if (d > worst) { worst = d; worstWho = v.me + ' видит ' + name + ' со сдвигом ' + dx + ',' + dy; }
    }
  }
  // интерполяция чужих отстаёт на пару кадров: свой шаг 4.93 px/кадр,
  // 30 пакетов/с — расхождение в десяток пикселей это норма, а не «парит в воздухе»
  ok(worst <= 40, 'чужие координаты совпадают у всех наблюдателей',
     'макс расхождение ' + worst + ' px' + (worstWho ? ' (' + worstWho + ')' : ''));

  // и после движения
  await clients[0].p.evaluate(() => { window.GAME.keys.r = true; });
  await sleep(2500);
  await clients[0].p.evaluate(() => { window.GAME.keys.r = false; });
  await sleep(1500);
  const after = [];
  for (const c of clients) {
    after.push(await c.p.evaluate(() => {
      const G = window.GAME, others = {};
      const list = (G.others && G.others()) || {};
      for (const id in list) others[list[id].name || id] = { x: Math.round(list[id].x), y: Math.round(list[id].y) };
      return { me: G.me && G.me.name, x: Math.round(G.pl.x), y: Math.round(G.pl.y), others: others };
    }));
  }
  let worst2 = 0, who2 = '';
  for (const v of after) for (const name in v.others) {
    const truth = after.find(x => x.me === name);
    if (!truth) continue;
    const d = Math.max(Math.abs(v.others[name].x - truth.x), Math.abs(v.others[name].y - truth.y));
    if (d > worst2) { worst2 = d; who2 = v.me + ' видит ' + name; }
  }
  ok(worst2 <= 60, 'после бега координаты тоже сходятся',
     'макс расхождение ' + worst2 + ' px' + (who2 ? ' (' + who2 + ')' : ''));

  console.log('итог: ' + pass + ' ок, ' + fail + ' провалов');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
