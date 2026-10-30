/* Песочница testaibrofist без сервера (как на GitHub Pages): настоящие серверные модули в браузере
   (offlineServer.js) и панель TestPanel — монеты, права владельца, смена ника, боты в комнатах.
   Свой статический сервер без server.js: 3257. Запуск: node test-sandbox.js */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
let pass = 0, fail = 0; const ok = (c, n, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + n + (d !== undefined ? '  ' + String(d).slice(0, 200) : '')); };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  let f = path.join(ROOT, p); if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  const ext = path.extname(f).slice(1);
  res.writeHead(200, { 'Content-Type': ({ html: 'text/html', js: 'application/javascript', css: 'text/css', json: 'application/json' })[ext] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(3257, async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  const open = async (u) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(u + ': ' + e.message.slice(0, 160))); await p.goto('http://localhost:3257/' + u); await p.waitForFunction(() => window.BFOfflineServer && document.getElementById('bfSandboxBtn'), null, { timeout: 15000 }); return p; };
  const until = async (p, fn, ms = 15000, arg) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await p.evaluate(fn, arg).catch(() => null); if (v) return v; await p.waitForTimeout(250); } return null; };

  console.log('Владелец:');
  { const o = await open('index.html');
    await o.evaluate(() => { const s = JSON.parse(localStorage.getItem('aibrofist.local.v2.sandbox') || '{}'); s.owner = true; localStorage.setItem('aibrofist.local.v2.sandbox', JSON.stringify(s)); });
    await o.reload(); await o.waitForFunction(() => window.BFOfflineServer && document.getElementById('bfSandboxBtn'));
    const w = await o.evaluate(() => fetch('/whoAmI').then(r => r.json()));
    ok(w.owner === true, 'права владельца включаются', JSON.stringify(w));
    const gc = await o.evaluate(() => fetch('/owner/giveCoins', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'name=Local Bot&coins=50&amount=50&delta=50' }).then(r => r.json()));
    ok(gc.status === 'success', 'владелец выдаёт монеты другому', JSON.stringify(gc));
    await o.waitForTimeout(1500);
    ok(await o.evaluate(() => !!document.querySelector('script[src*="owner.js"]')), 'инструменты владельца подключились');
  console.log('Картинка в Logs:');
    const lg = o;
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const up = await lg.evaluate((d) => fetch('/log/upload', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(d) + '&w=1&h=1' }).then(r => r.json()), png);
    ok(up.status === 'success' && /^data:image\/png;base64,/.test(up.url), 'картинка загружается и отдаётся из браузера', JSON.stringify(up).slice(0, 120));
    await o.close(); }
  console.log('Панель песочницы:');
  const a = await open('avatar.html');
  await a.click('#bfSandboxBtn');
  await a.click('#bfSandbox [data-tab="account"]');
  await a.click('#bfSandbox button[data-add="1000000"]');
  ok(/1 000 000/.test(await a.textContent('#sbMsg')), '+1 000 000 монет', await a.textContent('#sbMsg'));
  await a.click('#bfSandbox [data-tab="game"]');
  await a.fill('#sbBots', '7'); await a.click('#bfSandbox button[data-a="bots"]');
  await a.click('#bfSandbox button[data-a="unlock"]');
  console.log('Аккаунты:');
  await a.click('#bfSandbox [data-tab="account"]');
  await a.fill('#sbNew', 'SecondBro'); await a.click('#bfSandbox button[data-a="create"]');
  ok(/Created/.test(await a.textContent('#sbMsg')) && await a.evaluate(() => !!document.querySelector('[data-play="SecondBro"]')), 'новый аккаунт появился в списке', await a.textContent('#sbMsg'));
  await a.click('[data-play="SecondBro"]'); await a.waitForTimeout(2500);
  ok((await a.evaluate(() => fetch('/whoAmI').then(r => r.json()))).name === 'SecondBro', 'вход за новый аккаунт');
  await a.evaluate(() => BFOfflineServer.playAs('Local Tester')); await a.reload(); await a.waitForTimeout(2500);
  const bio = await a.evaluate(() => fetch('/getMyBio').then(r => r.json()));
  ok(bio.coins === 1000000 && bio.chatColorUnlocked, 'монеты и цвета на аккаунте', JSON.stringify({ c: bio.coins, u: bio.chatColorUnlocked }));
  await a.reload(); await a.waitForTimeout(2000);
  ok(await a.evaluate(() => fetch('/getMyBio').then(r => r.json()).then(d => d.coins)) === 1000000, 'после перезагрузки монеты на месте');

  console.log('Смена ника и вход обратно:');
  const nick = await a.evaluate(() => fetch('/changeNickname', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'name=SandboxHero' }).then(r => r.json()));
  ok(nick.status === 'success' && nick.coins === 1000000 - 1500, 'ник сменён за 1500 монет', JSON.stringify(nick));
  ok((await a.evaluate(() => fetch('/whoAmI').then(r => r.json()))).name === 'SandboxHero', 'whoAmI — новый ник');
  const th = await a.evaluate(() => fetch('/theme/mode', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'mode=dark' }).then(r => r.json()));
  ok(th.status === 'success', 'тёмная тема включается (тема открыта)', JSON.stringify(th));
  const fr = await a.evaluate(() => fetch('/friendRequest', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'name=Local Bot' }).then(r => r.json()));
  ok(fr && fr.status !== 'error', 'заявка в друзья', JSON.stringify(fr));
  await a.close();

  console.log('Обычные прятки с ботами:');
  const g = await open('game.html?mode=hideAndSeek');
  const pl = await until(g, () => { const c = window.BFOfflineModes && BFOfflineModes.room; return c && c.st.phase === 'lobby' && c.gameState ? { n: c.gameState.players.size, v: c.st.variant, seeker: c.st.seekerName } : null; });
  ok(pl && pl.n === 8 && pl.v === 'classic' && !!pl.seeker, 'в комнате ты + 7 ботов, искатель выбран', JSON.stringify(pl));
  const rd = await until(g, () => { const c = BFOfflineModes.room; return c.st.phase === 'round' ? { s: [...c.st.seekerIds] } : null; }, 15000);
  ok(!!rd, 'начался раунд', JSON.stringify(rd));
  await g.close();

  console.log('Война с 7 ботами:');
  const w = await open('game.html?mode=war');
  const wn = await until(w, () => { const c = window.BFOfflineModes && BFOfflineModes.room; return c && c.gameState ? c.gameState.players.size : null; });
  ok(wn === 8, 'War: 8 участников', wn);
  await w.close();

  console.log('Гонка — монета на аккаунт:');
  const r = await open('game.html?mode=race');
  await r.waitForTimeout(1500);
  const before = await r.evaluate(() => BFOfflineServer.me().coins);
  const after = await r.evaluate(() => new Promise(res => { const s = io(); s.on('coinsAwarded', d => res(d)); s.emit('raceFinish', {}); }));
  ok(after && after.coins === before + 1, 'финиш гонки: +1 монета на аккаунт', JSON.stringify({ before, after }));
  await r.close();

  console.log('Боты-соперники в Race:');
  const rr = await open('game.html?mode=race');
  const fin = await until(rr, () => { const m = document.body.innerText.match(/Players: (\d+)/); return m && +m[1] > 1 ? m : null; }, 15000);
  ok(fin && +fin[1] === 8, 'в гонке ты + 7 ботов', fin && fin[0]);
  const place = await until(rr, () => /Bot \d+ (finished|финишировал)/.test(document.body.innerText) ? 1 : null, 75000);
  ok(!!place, 'боты добегают до финиша', place);
  await rr.evaluate(() => { localStorage.setItem('aibrofist.local.v2.sandbox', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('aibrofist.local.v2.sandbox') || '{}'), { bots: 3 }))); });
  await rr.close();

  console.log('Боты-союзники в Adventure:');
  const av = await open('game.html?mode=adventure');
  const hits = await until(av, () => { const c = window.BFOfflineModes && BFOfflineModes.room; if (!c || !c.st.adv) return null;
    let by = 0; c.st.adv.kills.forEach((v, k) => { if (/^local-bot-/.test(k)) by += v; });
    const hurt = c.st.adv.en.some(e => e.hp < e.max) || by > 0; return hurt ? { bots: c.bots.length, kills: by } : null; }, 45000);
  ok(!!hits && hits.bots === 3, 'боты ранят и убивают врагов', JSON.stringify(hits));
  await av.close();


  ok(errs.length === 0, 'ошибок скриптов нет', errs.join(' | '));
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); srv.close(); process.exit(fail ? 1 : 0);
});
