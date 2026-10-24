/* Проходимые объекты (без коллизии, «декорации») выглядят так же, как обычные — просто не мешают игроку.
   Раньше paint() делал их полупрозрачными (45%), и декорации выцветали. Проверяем и в игре (по пикселям
   на экране: цвет блока остаётся чистым, а не розовеет), и в редакторе (по коду отрисовки).
   Свой сервер на копии репозитория (порт 3218), как у остальных браузерных тестов: работает одинаково
   в testaibrofist и в aibrofist. */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const PORT = 3218, BASE = 'http://127.0.0.1:' + PORT;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(100); } return null; };

(async () => {
  // код отрисовки: никакой прозрачности из-за ghost ни в игре, ни в редакторе
  for (const f of ['game.html', 'editor.html']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const paintFn = src.slice(src.indexOf('function paint(o, isSel){'), src.indexOf('function paint(o, isSel){') + 1500);
    ok(!/ghost[^\n]*globalAlpha|globalAlpha[^\n]*ghost/.test(paintFn), f + ': paint() не делает проходимые объекты прозрачными');
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-ghost-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const srv = spawn('node', ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  const cleanup = () => { try { srv.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} };
  process.on('exit', cleanup);
  if (!await until(() => fetch(BASE + '/').then(r => r.ok).catch(() => false), 20000)) throw new Error('сервер не поднялся');
  const browser = await chromium.launch();
  const errs = [];

  // чистый красный блок 400x300, один раз обычный, другой раз проходимый: на экране он должен быть одинаково красным
  const RED = '#ff0000';
  const count = png => {
    let pure = 0, pale = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
      if (r > 245 && g < 12 && b < 12) pure++;
      else if (r > 200 && g > 30 && g < 215 && Math.abs(g - b) < 12) pale++;     // розоватый — признак прозрачности
    }
    return { pure, pale };
  };
  async function shot(ghost) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(e.message.slice(0, 140)));
    await page.goto(BASE + '/game.html?mode=race', { waitUntil: 'networkidle' });
    await page.evaluate(() => { const c = document.getElementById('bfConsent'); if (c) c.remove(); });
    await page.waitForFunction(() => !!window.GAME, null, { timeout: 15000 });
    await page.evaluate(([RED, ghost]) => {
      const G = window.GAME;
      const blk = { id: 3, type: 'rect', x: 40, y: 200, w: 400, h: 300, fill: RED };
      if (ghost) blk.ghost = true;
      G.loadMap(JSON.stringify({ mode: 'race', objects: [
        { id: 1, type: 'spawn', x: 700, y: 430 }, { id: 2, type: 'rect', x: 0, y: 560, w: 2000, h: 80, fill: '#ffffff' }, blk,
        { id: 4, type: 'finishline', x: 1900, y: 500 }] }));
      G.play();
    }, [RED, ghost]);
    await page.waitForTimeout(600);
    // на пустом сервере поверх карты висит баннер «Nothing here yet» — прячем, как в остальных браузерных тестах
    await page.evaluate(() => { const b = document.getElementById('gBanner'); if (b) b.style.display = 'none'; });
    await page.waitForTimeout(400);
    const png = PNG.sync.read(await page.screenshot());
    await ctx.close();
    return count(png);
  }
  const solid = await shot(false), ghost = await shot(true);
  console.log('  обычный блок:', JSON.stringify(solid), ' проходимый:', JSON.stringify(ghost));
  ok(solid.pure > 5000, 'обычный красный блок рисуется чистым красным', solid.pure + ' px');
  ok(ghost.pure > 5000, 'проходимый красный блок тоже рисуется чистым красным, без выцветания', ghost.pure + ' px');
  ok(ghost.pale < 300, 'розоватых (прозрачных) пикселей у проходимого нет', ghost.pale + ' px');
  ok(Math.abs(ghost.pure - solid.pure) < solid.pure * 0.03, 'площадь красного у обоих одинакова', solid.pure + ' / ' + ghost.pure);

  ok(errs.length === 0, 'ошибок скриптов нет', errs.join(' | '));
  await browser.close(); cleanup();
  console.log(pass + ' ok, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
