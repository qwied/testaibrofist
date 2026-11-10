/* Двенадцатая волна идей игроков: призрак лучшего забега в гонке, «Разрезать пополам»,
   картинка-подложка и разрешение копировать карту (кнопка в Maps Browser, копия в редакторе).
   Свой сервер: 3274. Запуск: node test-wave12.js */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + String(x).slice(0, 220))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(80); } return null; };
const objs = [{ type: 'rect', x: 0, y: 600, w: 1400, h: 40 }, { type: 'spawn', x: 60, y: 500, w: 30, h: 100 }, { type: 'finishline', x: 600, y: 474, w: 52, h: 126 }];
function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave12-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const now = Date.now();
  const map = (n, copy) => ({ mapName: n, mapType: 'race', author: 'w12', date: now, created: now, rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: [],
    mapData: JSON.stringify(Object.assign({ mode: 'race', gravity: 9, objects: objs }, copy ? { copyable: 1 } : {})) });
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([map('Short Run', true), map('Closed Map', false)]));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), OWNER_ALIASES: 'w12' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
(async () => {
  const S = server(3274);
  await until(() => fetch(S.base + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    console.log('Призрак лучшего забега:');
    const g = await ctx.newPage(); g.on('pageerror', e => errs.push('game: ' + e.message.slice(0, 200)));
    await g.goto(S.base + '/game.html?mode=race&view=Short%20Run&author=w12');
    await until(() => g.evaluate(() => window.GAME && GAME.playing && GAME.objects.some(o => o.type === 'finishline')), 15000);
    await g.keyboard.down('ArrowRight');
    await until(() => g.evaluate(() => GAME.done), 8000);
    await g.keyboard.up('ArrowRight');
    const gh = await until(() => g.evaluate(() => window.__bfGhost && __bfGhost()), 3000);
    ok(gh && gh.n > 5, 'после финиша сохранён призрак забега', JSON.stringify(gh));
    await until(() => g.evaluate(() => !GAME.done), 5000);
    await sleep(600);
    await g.screenshot({ path: path.join(os.tmpdir(), 'wave12-ghost.png') });
    ok(await g.evaluate(() => !!localStorage.getItem('bfGhost:w12|Short Run')), 'призрак лежит в браузере для этой карты');
    console.log('Копирование карт:');
    const mb = await ctx.newPage(); mb.on('pageerror', e => errs.push('maps: ' + e.message.slice(0, 200)));
    await mb.goto(S.base + '/mapsBrowser');
    await until(() => mb.evaluate(() => document.querySelectorAll('.mbRow').length >= 2), 8000);
    const links = await mb.evaluate(() => [...document.querySelectorAll('.mbRow')].map(r => r.dataset.map + ':' + !!r.querySelector('a[href*="copy=1"]')).join(','));
    ok(/Short Run:true/.test(links) && /Closed Map:false/.test(links), '«Копировать в редактор» — только у карт, где автор разрешил', links);
    const ed = await ctx.newPage(); ed.on('pageerror', e => errs.push('editor: ' + e.message.slice(0, 200)));
    await ed.goto(S.base + '/editor?editMap=Short%20Run&editAuthor=w12&copy=1');
    await until(() => ed.evaluate(() => window.GAME && GAME.objects.length >= 3), 10000);
    ok(await ed.evaluate(() => GAME.objects.length === 3 && !GAME.editingMapName && /copy/.test(document.title)), 'копия открылась в редакторе как новая карта');
    await ed.click('#bCopyable');
    ok(await ed.evaluate(() => !JSON.parse(window.getEditorMap().data).copyable), 'кнопка «Разрешить копировать» переключается');
    await ed.click('#bCopyable');
    ok(await ed.evaluate(() => JSON.parse(window.getEditorMap().data).copyable === 1), 'разрешение копировать сохраняется в карте');
    console.log('Разрезать пополам:');
    const cut = await ed.evaluate(() => {
      const r = GAME.objects.find(o => o.type === 'rect');
      GAME.setSel(r);
      const btn = document.querySelector('#insp [data-cut="v"]');
      if (!btn) return null;
      const n0 = GAME.objects.length; btn.click();
      const parts = GAME.objects.filter(o => o.type === 'rect');
      return { n: GAME.objects.length - n0, w: parts.map(p => p.w).join(','), x: parts.map(p => p.x).join(',') };
    });
    ok(cut && cut.n === 1 && cut.w === '700,700' && cut.x === '0,700', 'блок 1400 разрезан на два по 700 встык', JSON.stringify(cut));
    ok(await ed.evaluate(() => !!document.getElementById('bUnder')), 'есть кнопка картинки-подложки');
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); S.kill(); process.exit(fail ? 1 : 0);
})();
