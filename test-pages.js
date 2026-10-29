/* Тестовый сайт на GitHub Pages — статика без сервера: страниц режимов там нет как маршрутов (раньше «404»),
   а играть одному нужно с ботами (offline.js + offlineModes.js гоняют настоящие war.js/party.js/adventure.js
   в браузере). Свой статический сервер без server.js: 3255. */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(80); } return null; };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

// как Pages: /war -> war.html, остального нет — 404
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  let f = path.join(ROOT, p);
  if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => srv.listen(3255, r));
  const base = 'http://127.0.0.1:3255';
  const variant = fs.readFileSync(path.join(ROOT, 'variant.html'), 'utf8');
  for (const p of ['murder-mystery', 'team-battle', 'war', 'party', 'adventure']) {
    ok(fs.readFileSync(path.join(ROOT, p + '.html'), 'utf8') === variant, p + '.html — копия variant.html (правишь variant.html — обнови и её)');
    const r = await fetch(base + '/' + p);
    ok(r.status === 200, 'страница /' + p + ' открывается, а не 404', r.status);
  }

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bfConsent', '1'); } catch (e) {} });
  const errs = [];
  const open = async (url) => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(url + ': ' + e.message.slice(0, 140)));
    await p.goto(base + url, { waitUntil: 'domcontentloaded' });
    return p;
  };
  const text = (p) => p.evaluate(() => (document.body ? document.body.innerText : ''));

  console.log('Страница режима:');
  const pg = await open('/party');
  await until(async () => /Party/i.test(await pg.evaluate(() => (document.getElementById('mdName') || {}).textContent || '')), 5000);
  ok(/Party/i.test(await pg.evaluate(() => (document.getElementById('mdName') || {}).textContent || '')), '/party показывает «Party», а не Murder Mystery');
  await pg.close();

  console.log('Murder Mystery:');
  const mu = await open('/game.html?mode=hideAndSeek&variant=murder');
  ok(!!await until(async () => /Bro Arena/.test(await text(mu)) && /Players: 4/.test(await text(mu)), 20000), 'карта «Bro Arena», с тремя ботами');
  ok(!!await until(async () => /Murderer|Sheriff|Innocent/i.test(await text(mu)), 20000), 'тайная роль выдана (убийца, шериф или невиновный)');
  // поимка: делаем игрока убийцей, ждём конца «20 секунд мира», подводим к боту — тот выбывает; шериф-бот, тронув убийцу, выигрывает
  await until(() => mu.evaluate(() => window.BFOfflineModes.room && BFOfflineModes.room.st.phase === 'round'), 25000);
  const caught = await mu.evaluate(async () => {
    const c = BFOfflineModes.room, st = c.st, me = c.me, b = c.bots[0], sl = (ms) => new Promise(r => setTimeout(r, ms));
    st.seekerId = me.id; st.seekerName = me.name; st.sheriffId = c.bots[1].id; st.sheriffName = c.bots[1].name;
    st.seekerIds = new Set([me.id]); st.roundMembers = st.roundMembers.filter(m => m.id !== me.id);
    st.roundStartedAt -= 25000; me.odo += 500;
    me.position = { x: b.position.x + 10, y: b.position.y, w: 30, h: 100 };
    c.on('hsCatch', { targetId: b.id });
    await sl(50);
    return { out: st.caughtSet.has(b.id), over: st.caughtSent };
  });
  ok(caught.out && !caught.over, 'убийца касается бота — тот выбывает, раунд идёт дальше');
  const sheriff = await mu.evaluate(async () => {
    const c = BFOfflineModes.room, st = c.st, me = c.me, sh = c.bots[1], sl = (ms) => new Promise(r => setTimeout(r, ms));
    me.position = { x: sh.position.x + 5, y: sh.position.y, w: 30, h: 100 };
    await sl(900);
    return { caught: st.murderCaught, over: st.caughtSent };
  });
  ok(sheriff.caught && sheriff.over, 'бот-шериф дотянулся до убийцы — убийца пойман, раунд кончился');
  await mu.close();

  console.log('Team Battle:');
  const tb = await open('/game.html?mode=hideAndSeek&variant=team');
  ok(!!await until(async () => /Bro Arena/.test(await text(tb)) && /Players: 4/.test(await text(tb)), 20000), 'карта «Bro Arena», с тремя ботами');
  ok(!!await until(async () => /Red[^\n]*Blue|Red \d+ : \d+ Blue/.test(await text(tb)), 25000), 'две команды, счёт на экране');
  // захват флага: берём вражеский флаг у его базы, несём к своей — очко
  await until(() => tb.evaluate(() => window.BFOfflineModes.room && BFOfflineModes.room.st.phase === 'round' && !!BFOfflineModes.room.st.ctf), 60000);
  const hasCtf = await tb.evaluate(() => !!BFOfflineModes.room.st.ctf);
  if (hasCtf) {
    const cap = await tb.evaluate(async () => {
      const c = BFOfflineModes.room, st = c.st, me = c.me, sl = (ms) => new Promise(r => setTimeout(r, ms));
      const my = st.teams.get(me.id), foe = st.teamList.find(t => t !== my);
      me.odo += 500;
      const at = (b) => { me.position = { x: b.x + b.w / 2 - 15, y: b.y + b.h - 100, w: 30, h: 100 }; };
      at(st.bases[foe]); c.on('ctfTouch', { team: foe }); await sl(30);
      const took = st.ctf.flags[foe] === me.id;
      at(st.bases[my]); c.on('ctfTouch', { team: my }); await sl(30);
      return { took, score: st.ctf.score[my] };
    });
    ok(cap.took && cap.score === 1, 'флаг врага взят и принесён на свою базу — очко');
  } else ok(true, 'раунд Domination — флаг пропущен');
  await tb.close();

  console.log('Война:');
  const w = await open('/game.html?mode=hideAndSeek&variant=war');
  ok(!!await until(async () => /Pirate Bay/.test(await text(w)) && /HP \d+/.test(await text(w)), 20000), 'карта «Pirate Bay», полоска здоровья — бой идёт');
  ok(/Players: 4/.test(await text(w)), 'в комнате трое ботов (Players: 4)');
  await w.close();

  console.log('Вечеринка:');
  const pa = await open('/game.html?mode=hideAndSeek&variant=party');
  ok(!!await until(async () => /Question 1 of/.test(await text(pa)), 20000), 'пошла викторина');
  ok(/Bot A/.test(await text(pa)) && /Players: 4/.test(await text(pa)), 'боты в таблице очков');
  const ans = await until(async () => /Bot [ABC] [1-9]\d{2}/.test(await text(pa)), 16000);
  ok(!!ans, 'боты отвечают на вопросы и получают очки');
  await pa.close();

  console.log('Приключение:');
  const ad = await open('/game.html?mode=hideAndSeek&variant=adventure');
  ok(!!await until(async () => /Floor 1\/5|Wave/.test(await text(ad)) && /Bro Tower|Crystal Defense/.test(await text(ad)), 25000), 'башня или оборона: идёт приключение, враги на этаже');
  ok(/HP \d+/.test(await text(ad)), 'здоровье класса на экране');
  await ad.close();

  ok(errs.length === 0, 'ошибок скриптов нет', errs.join(' | '));
  await browser.close();
  srv.close();
  console.log(`\n${pass} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
