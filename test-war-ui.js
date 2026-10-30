/* Война в браузере (см. блок «война и жетоны» в game.js): нижняя панель со здоровьем, оружием
   и жетонами; удар клавишей F не уводит в чат и попадает по стоящему рядом сопернику; чужой удар
   отнимает здоровье и отбрасывает; жетон подбирается касанием; магазин (B) продаёт рогатку,
   и её камень долетает до соперника; нокаут — бледный и стоит, потом возвращается. На телефоне —
   красная кнопка удара. Соперник — бот на сокете. Свой сервер на копии репозитория: 3247. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const { chromium, devices } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
const OWNER = 'waruitestowner';
const SHOTS = process.env.SHOTS_DIR || '';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(60); } return null; };

const SPOTS = [400, 1400, 2400].map(x => ({ x, y: 460, w: 80, h: 100 }));
function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-warui-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git|builtinMaps)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const objects = [{ id: 1, type: 'spawn', x: 900, y: 450, w: 30, h: 100 }, { id: 2, type: 'rect', x: 0, y: 560, w: 3000, h: 80 },
    { id: 3, type: 'rect', x: -20, y: 0, w: 20, h: 640 }, { id: 4, type: 'rect', x: 3000, y: 0, w: 20, h: 640 }]
    .concat(SPOTS.map((s, i) => Object.assign({ id: 10 + i, type: 'rect', hideSpot: true }, s)));
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([{ mapName: 'Arena', mapType: 'hideAndSeek',
    mapData: JSON.stringify({ mode: 'hideAndSeek', objects }), author: OWNER, date: Date.now(), created: Date.now(),
    rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: [] }]));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), OWNER_ALIASES: OWNER, HS_VARIANT: 'ffa', HS_LOBBY_MS: '2500', HS_ROUND_MS: '60000',
      WAR_RESPAWN_MS: '1500', TOK_EVERY_MS: '900' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
function bot(base, name, room) {
  const s = io(base, { transports: ['websocket'], forceNew: true, extraHeaders: { 'CF-Connecting-IP': '10.47.0.2' } });
  const p = { s, name, ev: [], x: 900, y: 486, sid: 1 };
  ['hsPhase', 'warHp', 'warDown', 'warUp', 'warShot', 'toks', 'tokAdd', 'tokGone'].forEach(e => s.on(e, d => p.ev.push({ e, d, t: Date.now() })));
  p.join = () => s.emit('join', { playerName: name, gameMode: 'hideAndSeek', room });
  p.at = (x, y) => { p.x = x; p.y = y === undefined ? 486 : y; s.emit('movePlayer', { position: { x: p.x, y: p.y, w: 30, h: 100 } }); };
  const hb = setInterval(() => s.connected && s.emit('movePlayer', { position: { x: p.x, y: p.y, w: 30, h: 100 } }), 300);
  s.on('disconnect', () => clearInterval(hb));
  p.last = (e, f, after) => { const x = p.ev.filter(v => v.e === e && v.t > (after || 0) && (!f || f(v.d))).pop(); return x && x.d; };
  p.punch = async (targetId) => { const sid = p.sid++; s.emit('warShot', { w: 'fist', sid, x: p.x, y: p.y, vx: 0, vy: 0, dir: 1 }); await sleep(30); s.emit('warHit', { t: targetId, sid }); await sleep(380); };
  return p;
}

(async () => {
  const S = server(3247);
  process.on('exit', () => S.kill());
  if (!await until(() => fetch(S.base + '/').then(r => r.ok).catch(() => false), 20000)) throw new Error('сервер не поднялся');
  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'CF-Connecting-IP': '10.47.0.1' } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bfConsent', '1'); } catch (e) {} });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message.slice(0, 160)));

  console.log('Страница режима:');
  await page.goto(S.base + '/', { waitUntil: 'domcontentloaded' });
  const modes = await page.evaluate(() => [...document.querySelectorAll('.card')].map(c => c.dataset.mode));
  ok(modes.indexOf('war') !== -1, 'на главной есть карточка «War»', modes.join(','));
  await page.click('.card[data-mode="war"]');
  await page.waitForURL(/\/war$/, { timeout: 8000 }).catch(() => {});
  const rules = await until(() => page.evaluate(() => { const li = [...document.querySelectorAll('#mdList li')]; return li.length === 7 && li.every(x => x.textContent.trim()) ? document.getElementById('mdName').textContent : null; }), 6000);
  ok(rules === 'War', 'страница /war: название и семь правил', rules);
  await page.click('#mdPlay');
  await page.waitForURL(/mode=war/, { timeout: 8000 }).catch(() => {});
  const room = await until(async () => { const r = await fetch(S.base + '/getRoomList?mode=hideAndSeek&variant=war').then(r => r.json()); return r.rooms[0] && r.rooms[0].room; }, 8000);
  ok(!!room, 'браузер в комнате войны', room);
  const B = bot(S.base, 'bot_b', room);
  await new Promise(r => B.s.once('connect', r)); B.join();

  console.log('Бой:');
  ok(!!await until(() => B.last('hsPhase', d => d.phase === 'round' && d.variant === 'ffa'), 15000), 'начался раунд «все против всех»');
  const me = await until(() => page.evaluate(() => window.GAME && window.GAME.playing && window.GAME.pl ? { x: window.GAME.pl.x, y: window.GAME.pl.y } : null), 6000);
  const hud = await until(() => page.evaluate(() => { const b = document.getElementById('gWar'); return b && b.style.display !== 'none' && /HP 100/.test(b.textContent) ? b.textContent : null; }), 6000);
  ok(!!hud && /Fist/.test(hud) && /Sling/.test(hud) && /Tokens: 2/.test(hud) && /Shop/.test(hud), 'внизу панель: здоровье 100, оружие, 2 жетона, магазин', hud);
  // встаём рядом и смотрим вправо
  await page.evaluate(() => window.GAME.teleportTo(1000, 460));
  await page.keyboard.down('ArrowRight'); await sleep(60); await page.keyboard.up('ArrowRight');
  await sleep(300);
  const pl = await page.evaluate(() => ({ x: window.GAME.pl.x, y: window.GAME.pl.y, f: window.GAME.pl.face }));
  B.at(pl.x + 45, pl.y);
  await sleep(500);
  const tA = Date.now();
  await page.keyboard.press('f');
  ok(!!await until(() => B.last('warHp', d => d.id === B.s.id && d.hp === 80, tA), 3000), 'F — удар кулаком попал: у бота 80', JSON.stringify(B.last('warHp')));
  ok(await page.evaluate(() => document.activeElement !== document.getElementById('gMsg')), 'F не открыл чат');
  // бот бьёт в ответ
  const myId = await page.evaluate(() => { const r = [...document.querySelectorAll('#gWar')]; return null; });
  const tB = Date.now();
  const bId = B.s.id;
  const meId = await until(() => { const h = B.ev.find(v => v.e === 'hsPhase' && v.d.war); return h && Object.keys(h.d.war.hp).find(id => id !== bId); }, 3000);
  B.at(pl.x + 40, pl.y);
  await sleep(150);
  await B.punch(meId);
  const hit = await until(() => page.evaluate(() => { const e = document.querySelector('#gWar .wHp em'); return e && /HP 80/.test(e.textContent) ? e.textContent : null; }), 3000);
  ok(!!hit, 'удар бота: на панели HP 80', hit);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'war-fight.png') });
  // жетон: встаём на ближайший
  const tl = await until(() => { const t = B.last('toks', d => d.list.length); return t && t.list; }, 3000);
  if (tl && tl.length) {
    const it = tl[0];
    await page.evaluate((t) => window.GAME.teleportTo(t.x - 15, t.y - 50), it);
    const got = await until(() => page.evaluate(() => /Tokens: 3/.test(document.getElementById('gWar').textContent)), 3000);
    ok(!!got, 'подобрал жетон касанием — 3 жетона');
  } else ok(false, 'на карте нет жетонов');
  // магазин: рогатка
  await page.keyboard.press('b');
  const shop = await until(() => page.evaluate(() => { const s = document.getElementById('gShop'); return s && s.style.display !== 'none' ? s.textContent : null; }), 2000);
  ok(!!shop && /Sling ×10/.test(shop) && /Medkit/.test(shop) && !/Invisibility/.test(shop), 'B — магазин войны: рогатка, аптечка; невидимости нет', shop && shop.slice(0, 80));
  ok(await page.evaluate(() => !document.querySelector('.shBuy[data-item="sling"]').disabled && document.querySelector('.shBuy[data-item="magic"]').disabled),
    'хватает только на то, что по карману');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'war-shop.png') });
  await page.click('.shBuy[data-item="sling"]');
  const bought = await until(() => page.evaluate(() => /Sling\s*10/.test(document.getElementById('gWar').textContent) && document.querySelector('.wSlot.on').dataset.w === 'sling'), 3000);
  ok(!!bought, 'купил рогатку — 10 камней, рогатка в руке');
  await page.click('.shX');
  // стреляем издалека
  await page.evaluate(() => window.GAME.teleportTo(1000, 460));
  await page.keyboard.down('ArrowRight'); await sleep(60); await page.keyboard.up('ArrowRight');
  await sleep(300);
  const pl2 = await page.evaluate(() => ({ x: window.GAME.pl.x, y: window.GAME.pl.y }));
  B.at(pl2.x + 350, pl2.y); await sleep(400);
  const tS = Date.now();
  await page.keyboard.press('f');
  ok(!!await until(() => B.last('warHp', d => d.id === bId && d.by && d.hp < 80, tS), 3000), 'камень из рогатки долетел до бота', JSON.stringify(B.last('warHp', null, tS)));
  ok(await page.evaluate(() => /Sling\s*9/.test(document.getElementById('gWar').textContent)), 'камней стало 9');
  // нокаут браузера
  await page.keyboard.press('1');
  const tK = Date.now();
  // удар отбрасывает — бот каждый раз подходит заново
  for (let i = 0; i < 10 && !B.last('warDown', d => d.id === meId, tK); i++) {
    const pl3 = await page.evaluate(() => ({ x: window.GAME.pl.x, y: window.GAME.pl.y }));
    B.at(pl3.x + 40, pl3.y); await sleep(120); await B.punch(meId);
  }
  const down = await until(() => page.evaluate(() => window.GAME.frozen === true && window.GAME.myAlpha < 1 && /knocked you out/.test(document.body.innerText)), 3000);
  ok(!!down, 'выбит: бледный, стоит, в ленте «… knocked you out»');
  const up = await until(() => page.evaluate(() => window.GAME.frozen === false && window.GAME.myAlpha === 1 && /HP 100/.test(document.getElementById('gWar').textContent)), 5000);
  ok(!!up, 'через пару секунд снова в бою с полным здоровьем');
  ok(errs.length === 0, 'без ошибок на странице', errs.join(' | '));

  console.log('Телефон:');
  const mctx = await browser.newContext({ ...devices['iPhone 13'], extraHTTPHeaders: { 'CF-Connecting-IP': '10.47.0.3' } });
  await mctx.addInitScript(() => { try { localStorage.setItem('bfConsent', '1'); } catch (e) {} });
  const mp = await mctx.newPage();
  mp.on('pageerror', e => errs.push('phone: ' + e.message.slice(0, 160)));
  await mp.goto(S.base + '/game?mode=hideAndSeek&variant=war&room=' + room, { waitUntil: 'domcontentloaded' });
  const atk = await until(() => mp.evaluate(() => { const b = document.getElementById('gAtk'); return b && getComputedStyle(b).display !== 'none' ? b.getBoundingClientRect().toJSON() : null; }), 10000);
  ok(!!atk && atk.right <= 390 && atk.bottom <= 844, 'на телефоне видна красная кнопка удара', JSON.stringify(atk));
  const mhud = await mp.evaluate(() => { const b = document.getElementById('gWar').getBoundingClientRect(); return { l: b.left, r: b.right, w: innerWidth }; });
  ok(mhud.l >= 0 && mhud.r <= mhud.w, 'панель войны не вылезает за края экрана', JSON.stringify(mhud));
  if (SHOTS) await mp.screenshot({ path: path.join(SHOTS, 'war-phone.png') });
  ok(errs.length === 0, 'без ошибок и на телефоне', errs.join(' | '));
  await browser.close();
  B.s.close();
  console.log(`\n${pass} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
