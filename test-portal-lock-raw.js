/* Портал зафиксирован по размеру игрока (30×100) и его нельзя растянуть
   ни постановкой (драг при создании), ни ручками изменения размера после —
   трижды по прямой просьбе («нельзя сделать больше или меньше или вообще
   растягивать»). */
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

function startServer() {
  return spawn(process.execPath, ['server.js'], {
    cwd: __dirname, env: Object.assign({}, process.env, { PORT: String(PORT), PASSWORD_AUTH: '1' }),
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
function cleanupUsers(names) {
  try {
    const USERS_FILE = path.join(__dirname, 'data', 'users.json');
    const db = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    names.forEach(n => delete db.users[n.toLowerCase()]);
    fs.writeFileSync(USERS_FILE, JSON.stringify(db, null, 2));
  } catch (e) {}
}

(async () => {
  const child = startServer();
  let childErr = '';
  child.stderr.on('data', d => { childErr += d.toString(); });
  let browser = null;
  const testUsers = [];

  try {
    ok(await waitUp(), 'тестовый сервер поднялся на ' + PORT);
    browser = await chromium.launch();

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

  } finally {
    if (browser) await browser.close();
    child.kill();
    if (testUsers.length) cleanupUsers(testUsers);
    if (childErr) console.log('  (stderr сервера: ' + childErr.slice(0, 400) + ')');
  }

  console.log(fail ? ('\n' + fail + ' ошибок') : '\nвсё чисто');
  process.exit(fail ? 1 : 0);
})();
