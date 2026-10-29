/* Встроенная «Bro Arena» (builtinMaps/broarena.json): в чистой копии сайта, где нет ни одной карты игроков,
   Murder Mystery, Team Battle и «Вечеринка» получают карту (раньше стояло «No maps yet»), а обычные
   прятки и гонка её не берут. Свой сервер: 3254. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(60); } return null; };

function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-arena-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), OWNER_ALIASES: 'arenatestowner' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}

(async () => {
  const S = server(3254);
  process.on('exit', () => S.kill());
  if (!await until(() => fetch(S.base + '/').then(r => r.ok).catch(() => false), 20000)) throw new Error('сервер не поднялся');

  console.log('Подбор карт:');
  const hs = await fetch(S.base + '/getRandomMap?mapType=hideAndSeek').then(r => r.json()).catch(() => null);
  ok(!hs || hs.mapName !== 'Bro Arena', 'в обычные прятки арена не попадает', hs && hs.mapName);
  const rc = await fetch(S.base + '/getRandomMap?mapType=race').then(r => r.json()).catch(() => null);
  ok(!rc || rc.mapName !== 'Bro Arena', 'в гонку — тоже', rc && rc.mapName);

  console.log('Вход в режимы:');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bfConsent', '1'); } catch (e) {} });
  for (const [page, name] of [['murder-mystery', 'Bro Arena'], ['team-battle', 'Bro Arena'], ['party', 'Bro Arena'], ['war', 'Pirate Bay'], ['adventure', 'Bro Tower']]) {
    const p = await ctx.newPage();
    await p.goto(S.base + '/' + page, { waitUntil: 'domcontentloaded' });
    await until(() => p.evaluate(() => !!document.getElementById('mdPlay')), 6000);
    await p.click('#mdPlay');
    const got = await until(() => p.evaluate((n) => !!document.body && document.body.innerText.indexOf(n) !== -1, name), 8000);
    const noMaps = await p.evaluate(() => !!document.body && /No maps yet/.test(document.body.innerText));
    ok(!!got && !noMaps, page + ': в комнате карта «' + name + '», а не «No maps yet»');
    await p.close();
  }
  await browser.close();
  console.log(`\n${pass} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
