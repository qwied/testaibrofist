/* Живая проверка сетевого зомби apoc-раунда прятками:

   1. Просмотр/практика карты из Maps Browser (game.html?view=...) не
      заходит в настоящую комнату (см. VIEW в boot() в game.js) — сервер
      никогда не пришлёт zombieDriverAssign, и без soloZombie (см.
      stepZombiesLocal() в game.html) зомби-объект так и стоял бы на месте
      спавна. Проверяем живьём: зомби действительно сдвигается.
   2. Зомби теперь прыгает через разрыв пола, а не просто идёт/падает в
      него — тот же приём на подходе к краю, что раньше срабатывал только
      реактивно при ударе о стену.
   3. Портал телепортирует зомби так же, как игрока — раньше зомби сквозь
      портал просто не проходил и терял цель на месте входа.

   Карта сеется прямо в data/maps.json, в обход /uploadMap и редактора —
   им не нужно соответствовать реальной публикации, только отдать те же
   типы объектов, что понимает движок. */
'use strict';
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PORT = Number(process.env.PORT) || 3270;
const BASE = 'http://127.0.0.1:' + PORT;
const MAP_NAME = 'ZombieAiTestMap';
const AUTHOR = 'zombieAiTester';
const MAPS_FILE = path.join(__dirname, 'data', 'maps.json');

/* Зомби-объект (и spawn) движок принудительно приводит к SIZES.zombie
   (30×100 в этой версии) при загрузке карты, независимо от w/h в самом
   JSON — поэтому тут y уже посчитан под итоговую высоту 100, иначе зомби
   стартует наполовину в полу и падает сквозь него навсегда (см. разбор
   в сессии: первая версия этого теста ловила именно это). */
function seedMap() {
  fs.mkdirSync(path.dirname(MAPS_FILE), { recursive: true });
  let maps = [];
  if (fs.existsSync(MAPS_FILE)) {
    try { maps = JSON.parse(fs.readFileSync(MAPS_FILE, 'utf8')); } catch (e) { maps = []; }
    if (!Array.isArray(maps)) maps = [];
  }
  const objects = [
    { id: 1, type: 'rect', x: 0, y: 600, w: 300, h: 60 },      // пол 1
    { id: 2, type: 'rect', x: 370, y: 600, w: 1130, h: 60 },   // пол 2 — разрыв 300..370 (70px)
    { id: 3, type: 'spawn', x: 30, y: 500, w: 30, h: 100 },
    { id: 4, type: 'zombie', x: 90, y: 500, w: 30, h: 100 },
    { id: 5, type: 'teleport', x: 650, y: 540, w: 36, h: 60, customId: 'w5', targetIds: 'w6', teleExit: false },
    { id: 6, type: 'teleport', x: 1350, y: 540, w: 36, h: 60, customId: 'w6', targetIds: '', teleExit: true }
  ];
  const mapData = JSON.stringify({ mode: 'hideAndSeek', apoc: true, objects });
  maps.push({ mapName: MAP_NAME, mapType: 'hideAndSeek', mapData, author: AUTHOR,
    date: Date.now(), created: Date.now(), rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: [] });
  fs.writeFileSync(MAPS_FILE, JSON.stringify(maps, null, 2));
}
function unseedMap() {
  if (!fs.existsSync(MAPS_FILE)) return;
  try {
    let maps = JSON.parse(fs.readFileSync(MAPS_FILE, 'utf8'));
    if (!Array.isArray(maps)) return;
    maps = maps.filter(m => !(m.author === AUTHOR && m.mapName === MAP_NAME));
    fs.writeFileSync(MAPS_FILE, JSON.stringify(maps, null, 2));
  } catch (e) { /* не критично */ }
}

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

(async () => {
  seedMap();
  const child = startServer();
  let childErr = '';
  child.stderr.on('data', d => { childErr += d.toString(); });
  let browser = null;

  try {
    ok(await waitUp(), 'тестовый сервер поднялся на ' + PORT);

    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(BASE + '/game.html?view=' + encodeURIComponent(MAP_NAME) + '&author=' + encodeURIComponent(AUTHOR),
      { waitUntil: 'load' });
    await page.waitForFunction(() => window.GAME && window.GAME.playing, { timeout: 15000 });
    await page.waitForTimeout(300);

    const z0 = await page.evaluate(() => {
      const o = GAME.objects.find(o => o.type === 'zombie');
      return o ? { x: o.x, y: o.y } : null;
    });
    ok(!!z0, 'зомби найден на карте после загрузки view= (Maps Browser)');

    // игрок далеко за порталом — есть за кем гнаться через разрыв и портал
    await page.evaluate(() => { GAME.pl.x = 1400; GAME.pl.y = 530; GAME.pl.vx = 0; GAME.pl.vy = 0; });

    await page.waitForTimeout(1500);
    const z1 = await page.evaluate(() => {
      const o = GAME.objects.find(o => o.type === 'zombie');
      return { x: o.x, y: o.y };
    });
    ok(Math.abs(z1.x - z0.x) > 20, 'зомби сдвинулся за 1.5с в просмотре карты (soloZombie)',
       'x0=' + z0.x.toFixed(0) + ' x1=' + z1.x.toFixed(0));

    let crossedGap = false, landedClean = false, maxYNearGap = -Infinity;
    for (let i = 0; i < 40 && !crossedGap; i++) {
      await page.waitForTimeout(120);
      const z = await page.evaluate(() => {
        const o = GAME.objects.find(o => o.type === 'zombie');
        return { x: o.x, y: o.y };
      });
      if (z.x > 280 && z.x < 400) maxYNearGap = Math.max(maxYNearGap, z.y);
      if (z.x > 400 && z.y <= 505) { crossedGap = true; landedClean = true; }
      else if (z.x > 400) crossedGap = true;
    }
    ok(crossedGap, 'зомби перепрыгнул разрыв пола (70px) вместо того чтобы упасть в него');
    ok(landedClean, 'приземлился чисто на полу 2 (y вернулся к норме), не улетел вниз', 'maxYNearGap=' + maxYNearGap.toFixed(0));

    let sawNearEntry = false, teleported = false, prevX = null;
    for (let i = 0; i < 60 && !teleported; i++) {
      await page.waitForTimeout(150);
      const z = await page.evaluate(() => {
        const o = GAME.objects.find(o => o.type === 'zombie');
        return { x: o.x, y: o.y };
      });
      if (z.x > 600 && z.x < 700) sawNearEntry = true;
      if (prevX !== null && (z.x - prevX) > 300) teleported = true;
      prevX = z.x;
    }
    ok(sawNearEntry, 'зомби дошёл до входа портала (~x650)');
    ok(teleported, 'зомби телепортировался через портал вместо того чтобы идти пешком');

  } finally {
    if (browser) await browser.close();
    child.kill();
    unseedMap();
    if (childErr) console.log('  (stderr сервера: ' + childErr.slice(0, 400) + ')');
  }

  console.log(fail ? ('\n' + fail + ' ошибок') : '\nвсё чисто');
  process.exit(fail ? 1 : 0);
})();
