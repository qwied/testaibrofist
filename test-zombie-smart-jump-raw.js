/* Живая проверка двух конкретных багов, найденных по видео живого теста:

   1. Зомби прямо под игроком на возвышении (toward ~ 0, горизонтального
      сноса нет) раньше вообще не пробовал прыгнуть: решение «прыгать?»
      раньше жило ВНУТРИ «если есть dx», так что без горизонтального сноса
      прыжок не проверялся вовсе — зомби просто стоял под уступом и
      выглядел «тупым»/«привязанным» к игроку, хотя мог бы влезть к нему.
      Проверяем: зомби действительно забирается на реалистичную по высоте
      платформу и реально догоняет/ловит игрока (респавн — единственный
      внешне видимый результат зомби-поимки в прятках).

   2. Портал теперь зафиксирован по размеру игрока (30×100) и его нельзя
      растянуть ни постановкой (драг при создании), ни ручками изменения
      размера после — трижды по прямой просьбе («нельзя сделать больше
      или меньше или вообще растягивать»). */
'use strict';
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PORT = Number(process.env.PORT) || 3275;
const BASE = 'http://127.0.0.1:' + PORT;
const MAP_NAME = 'ZombieClimbTestMap';
const AUTHOR = 'zombieClimbTester';
const MAPS_FILE = path.join(__dirname, 'data', 'maps.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

function seedMap() {
  fs.mkdirSync(path.dirname(MAPS_FILE), { recursive: true });
  let maps = [];
  if (fs.existsSync(MAPS_FILE)) { try { maps = JSON.parse(fs.readFileSync(MAPS_FILE, 'utf8')); } catch (e) {} }
  if (!Array.isArray(maps)) maps = [];
  const objects = [
    { id: 1, type: 'rect', x: 0, y: 900, w: 2000, h: 60 },     // земля
    { id: 2, type: 'rect', x: 400, y: 830, w: 300, h: 40 },    // реалистичная приступка (~70px подъём)
    { id: 3, type: 'spawn', x: 30, y: 800, w: 30, h: 100 },
    { id: 4, type: 'zombie', x: 50, y: 800, w: 30, h: 100 }
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
  } catch (e) {}
}
function cleanupUsers(names) {
  try {
    const db = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    names.forEach(n => delete db.users[n.toLowerCase()]);
    fs.writeFileSync(USERS_FILE, JSON.stringify(db, null, 2));
  } catch (e) {}
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
  const testUsers = [];

  try {
    ok(await waitUp(), 'тестовый сервер поднялся на ' + PORT);
    browser = await chromium.launch();

    // ---------- 1. зомби под игроком на возвышении действительно влезает и ловит ----------
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(BASE + '/game.html?view=' + encodeURIComponent(MAP_NAME) + '&author=' + encodeURIComponent(AUTHOR),
        { waitUntil: 'load' });
      await page.waitForFunction(() => window.GAME && window.GAME.playing, { timeout: 15000 });
      // игрок на приступке (пол 830, рост 100 -> стоять на ней = y:730), ровно над зомби
      await page.evaluate(() => { GAME.pl.x = 560; GAME.pl.y = 730; GAME.pl.vx = 0; GAME.pl.vy = 0; });

      let climbed = false, caughtRespawn = false;
      const spawnX = 30;
      for (let i = 0; i < 50 && !caughtRespawn; i++) {
        await page.waitForTimeout(150);
        const z = await page.evaluate(() => {
          const o = GAME.objects.find(o => o.type === 'zombie');
          const p = GAME.pl;
          return { zx: o.x, zy: o.y, px: Math.round(p.x) };
        });
        if (z.zy <= 740 && z.zx > 350 && z.zx < 750) climbed = true;
        if (Math.abs(z.px - spawnX) < 5) caughtRespawn = true;
      }
      ok(climbed, 'зомби залез на приступку (решение прыгнуть больше не заперто за "есть ли dx")');
      ok(caughtRespawn, 'зомби реально поймал игрока — тот отброшен на спавн, а не просто стоит рядом бесконечно');
      await page.close();
    }

    // ---------- 2. портал зафиксирован по размеру игрока (30x100), не растягивается ----------
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(BASE + '/', { waitUntil: 'load' });
      await page.evaluate(() => { const c = document.getElementById('bfConsent'); if (c) c.remove(); });
      const name = 'portalLock' + Math.floor(Math.random() * 1e6);
      testUsers.push(name);
      await page.evaluate(async (n) => {
        await fetch('/signUp', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: n, password: 'Passw0rd!x' }), credentials: 'same-origin' });
      }, name);
      await page.goto(BASE + '/editor.html', { waitUntil: 'load' });
      await page.waitForSelector('.tool[data-tool="teleport"]', { timeout: 10000 });

      // (a) растянуть драгом при постановке
      await page.click('.tool[data-tool="teleport"]');
      const box = await page.locator('#c').boundingBox();
      await page.mouse.move(box.x + 300, box.y + 300);
      await page.mouse.down();
      await page.mouse.move(box.x + 700, box.y + 600, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(200);
      let map = await page.evaluate(() => window.getEditorMap());
      let tp = JSON.parse(map.data).objects.find(o => o.type === 'teleport');
      ok(!!tp && tp.w === 30 && tp.h === 100, 'портал нельзя растянуть драгом при постановке',
         tp ? (tp.w + 'x' + tp.h) : 'не создан');

      // (b) растянуть ручкой после выделения
      await page.click('.tool[data-tool="select"]');
      await page.mouse.click(box.x + 650, box.y + 610);
      await page.waitForTimeout(150);
      await page.mouse.move(box.x + 650 + 15, box.y + 610 + 50);
      await page.mouse.down();
      await page.mouse.move(box.x + 1000, box.y + 900, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(200);
      map = await page.evaluate(() => window.getEditorMap());
      tp = JSON.parse(map.data).objects.find(o => o.type === 'teleport');
      ok(!!tp && tp.w === 30 && tp.h === 100, 'портал нельзя растянуть ручкой после выделения',
         tp ? (tp.w + 'x' + tp.h) : 'не создан');

      // (c) в инспекторе нет полей Ширина/Высота для портала
      const noSizeFields = await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('label')).map(l => l.textContent);
        return !labels.some(t => t.includes('Ширина') || t.includes('Высота'));
      });
      ok(noSizeFields, 'в инспекторе нет редактируемых полей размера для портала');

      await page.close();
    }

  } finally {
    if (browser) await browser.close();
    child.kill();
    unseedMap();
    if (testUsers.length) cleanupUsers(testUsers);
    if (childErr) console.log('  (stderr сервера: ' + childErr.slice(0, 400) + ')');
  }

  console.log(fail ? ('\n' + fail + ' ошибок') : '\nвсё чисто');
  process.exit(fail ? 1 : 0);
})();
