/* Боты песочницы testaibrofist и прицел оружия «Войны» (без сервера, как на GitHub Pages).
   Проверяет: оружие игрока летит туда, где курсор; пушкари-боты стреляют из пушек; боты-бойцы
   подбирают жетоны, покупают оружие и ранят врагов; в командных раундах войны и в Bro RED боты
   играют; в Capture the Flag боты носят флаг; искатель в прятках видит не сквозь стены.
   Свой статический сервер: 3259. Запуск: node test-bots.js */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
let pass = 0, fail = 0; const ok = (c, n, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + n + (d !== undefined ? '  ' + String(d).slice(0, 220) : '')); };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  let f = path.join(ROOT, p); if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  const ext = path.extname(f).slice(1);
  res.writeHead(200, { 'Content-Type': ({ html: 'text/html', js: 'application/javascript', css: 'text/css', json: 'application/json' })[ext] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(3259, async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  const open = async (u) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(u + ': ' + e.message.slice(0, 200))); await p.goto('http://localhost:3259/' + u); return p; };
  const until = async (p, fn, ms = 20000, arg) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await p.evaluate(fn, arg).catch(() => null); if (v) return v; await p.waitForTimeout(250); } return null; };
  // следим за тем, что игрок шлёт «серверу», и за уроном, что наносят боты
  const spy = (p) => p.evaluate(() => {
    const c = BFOfflineModes.room, orig = c.on;
    window.__sent = []; window.__dmg = [];
    c.on = function (ev, d) { window.__sent.push({ ev, d: JSON.parse(JSON.stringify(d || {})) }); return orig.call(this, ev, d); };
    const W = c.st;
    setInterval(() => {
      if (!W.war) return;
      W.war.hp.forEach((v, id) => { const k = 'hp:' + id; if (window[k] !== undefined && v < window[k]) window.__dmg.push(id); window[k] = v; });
    }, 50);
  });

  console.log('Война: прицел и боты');
  const w = await open('game.html?mode=war');
  await until(w, () => window.BFOfflineModes && BFOfflineModes.room && BFOfflineModes.room.st.phase === 'round', 30000);
  await spy(w);
  const v0 = await w.evaluate(() => BFOfflineModes.room.st.variant);
  ok(v0 === 'pirate', 'первый раунд на карте с пушками — Пиратская война', v0);
  // свой выстрел магией в точку под курсором
  await w.evaluate(() => { const c = BFOfflineModes.room; c.st.tok.bank.set(c.me.id, 30); c.on('shopBuy', { item: 'magic' }); c.on('shopBuy', { item: 'sling' }); });
  await w.waitForTimeout(400);
  await w.keyboard.press('Digit4');
  const aimAt = await w.evaluate(() => { const c = BFOfflineModes.room, p = c.me.position; return { x: p.x + 15, y: p.y + 50 }; });
  // точка экрана слева вверху от игрока: выстрел должен уйти влево и вверх
  await w.mouse.move(200, 150); await w.waitForTimeout(150);
  await w.keyboard.press('KeyF'); await w.waitForTimeout(200);
  let shot = await w.evaluate(() => window.__sent.filter(x => x.ev === 'warShot' && x.d.w === 'magic').pop());
  ok(shot && shot.d.vx < 0 && shot.d.vy < 0, 'магия летит к курсору (влево-вверх)', JSON.stringify(shot && shot.d));
  await w.mouse.move(1150, 700); await w.waitForTimeout(800);
  await w.keyboard.press('KeyF'); await w.waitForTimeout(200);
  shot = await w.evaluate(() => window.__sent.filter(x => x.ev === 'warShot' && x.d.w === 'magic').pop());
  ok(shot && shot.d.vx > 0 && shot.d.vy > 0, 'магия летит к курсору (вправо-вниз)', JSON.stringify(shot && shot.d));
  // дальше боты играют сами: 25 секунд
  await w.waitForTimeout(25000);
  const war1 = await w.evaluate(() => {
    const c = BFOfflineModes.room, st = c.st;
    return { gunners: c.bots.filter(b => b.gun > -1).length, gunShots: [...st.war.guns.values()].length, bank: c.bots.map(b => st.tok.bank.get(b.id) || 0),
             ammo: c.bots.map(b => st.warAmmo && st.warAmmo.ammo.get(b.id)), dmg: window.__dmg.length, kills: [...st.war.kills.values()].reduce((a, k) => a + k, 0) };
  });
  ok(war1.gunners >= 1 && war1.gunShots >= 1, 'боты-пушкари стреляют из пушек', JSON.stringify({ g: war1.gunners, s: war1.gunShots }));
  ok(war1.dmg >= 3, 'боты ранят врагов', JSON.stringify(war1));

  // следующие раунды войны: смотрим ffa / tdm / bro / cp (и что боты там бьют)
  // каждый раунд войны по очереди (как бы следующим в круге): боты дерутся, не прыгают в яд сами
  const seen = {};
  for (const v of ['ffa', 'tdm', 'hunger', 'cp', 'bro']) {
    await w.evaluate((v) => { const c = BFOfflineModes.room, R = ['ffa', 'tdm', 'hunger', 'cp', 'bro'];
      c.st.warLast = R[(R.indexOf(v) + 4) % 5]; c.st.warPrev = 'pirate'; clearTimeout(c.st.timer); c.next(); }, v);
    await until(w, () => BFOfflineModes.room.st.phase === 'round', 15000);
    if (v === 'ffa') {
      // без мыши (как на телефоне) — автоприцел по ближнему врагу: враг справа — магия летит вправо
      await w.evaluate(() => { const c = BFOfflineModes.room; c.st.tok.bank.set(c.me.id, 30); c.on('shopBuy', { item: 'magic' }); });
      await w.waitForTimeout(300); await w.keyboard.press('Digit4');
      await w.evaluate(() => document.getElementById('c').dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' })));
      await w.evaluate(() => { const c = BFOfflineModes.room, P = GAME.pl; P.x = 1630; P.y = 640; P.vx = 0; P.vy = 0;
        c.bots.forEach((b, i) => { b.position = { x: i ? 2600 + i * 200 : 1760, y: 600, w: 30, h: 100 }; b.ph = null; }); });
      await w.waitForTimeout(300);
      const n0 = await w.evaluate(() => window.__sent.length);
      await w.keyboard.press('KeyF'); await w.waitForTimeout(200);
      const auto = await w.evaluate((n0) => { const s = window.__sent.slice(n0).filter(x => x.ev === 'warShot').pop(); return s && s.d; }, n0);
      ok(auto && auto.w === 'magic' && auto.vx > 0, 'без мыши — автоприцел по врагу рядом', JSON.stringify(auto));
    }
    const r = await w.evaluate(() => new Promise(res => {
      const c = BFOfflineModes.room, st = c.st, t0 = Date.now(), prev = {}, hit = {};
      let dmg = 0, selfPoison = 0;
      const iv = setInterval(() => {
        if (!st.war) { clearInterval(iv); return; }
        st.war.hp.forEach((hp, id) => {
          if (st.war.lastHit.get(id)) hit[id] = Date.now();
          if (prev[id] !== undefined && hp < prev[id]) dmg++;
          const b = c.bots.find(x => x.id === id);
          if (b && prev[id] > 0 && hp <= 0 && b.ph && st.phys.touchBad(b.ph) && !(hit[id] && Date.now() - hit[id] < 5000)) selfPoison++;
          prev[id] = hp;
        });
        if (Date.now() - t0 > 12000) { clearInterval(iv); res({ v: st.variant, dmg, selfPoison, dom: st.dom ? st.dom.points.map(p => p.owner) : null, bro: st.war && st.war.bro }); }
      }, 50);
    }));
    seen[v] = r;
    console.log('    ' + JSON.stringify(r));
    ok(r.v === v && r.dmg > 0, 'раунд ' + v + ': боты дерутся', r.dmg);
    ok(r.selfPoison === 0, 'раунд ' + v + ': боты сами не падают в яд', r.selfPoison);
  }
  ok(seen.cp && seen.cp.dom && seen.cp.dom.some(Boolean), 'контрольные точки: боты захватывают точки', JSON.stringify(seen.cp && seen.cp.dom));
  ok(seen.bro && !!seen.bro.bro, 'Bro RED выбран и бьётся', seen.bro && seen.bro.bro);
  await w.close();

  console.log('Телефон: прицел пальцем');
  { const { devices } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
    const pc = await b.newContext(devices['iPhone 13 landscape']); const ph = await pc.newPage();
    ph.on('pageerror', e => errs.push('phone: ' + e.message.slice(0, 200)));
    await ph.goto('http://localhost:3259/game.html?mode=war');
    await until(ph, () => window.BFOfflineModes && BFOfflineModes.room && BFOfflineModes.room.st.phase === 'round', 30000);
    await spy(ph);
    await ph.evaluate(() => { const c = BFOfflineModes.room; c.st.tok.bank.set(c.me.id, 30); c.on('shopBuy', { item: 'magic' }); });
    await ph.waitForTimeout(400);
    await ph.tap('#gWar [data-w="magic"]').catch(() => {});
    await ph.evaluate(() => { const P = GAME.pl; P.x = 1630; P.y = 640; P.vx = 0; P.vy = 0; });
    await ph.waitForTimeout(300);
    // палец ведём по карте влево-вверх и отпускаем — магия летит туда
    const n0 = await ph.evaluate(() => window.__sent.length);
    await ph.evaluate(() => { const c = document.getElementById('c'), o = { pointerType: 'touch', pointerId: 7, bubbles: true, isPrimary: true };
      c.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ clientX: 600, clientY: 200 }, o)));
      c.dispatchEvent(new PointerEvent('pointermove', Object.assign({ clientX: 120, clientY: 90 }, o))); });
    await ph.waitForTimeout(150);
    const mid = await ph.evaluate((n0) => window.__sent.slice(n0).some(x => x.ev === 'warShot'), n0);
    ok(!mid, 'пока палец на карте — только прицел, без выстрела');
    await ph.evaluate(() => document.getElementById('c').dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', pointerId: 7, bubbles: true, clientX: 120, clientY: 90 })));
    await ph.waitForTimeout(200);
    const sh = await ph.evaluate((n0) => { const s = window.__sent.slice(n0).filter(x => x.ev === 'warShot').pop(); return s && s.d; }, n0);
    ok(sh && sh.w === 'magic' && sh.vx < 0 && sh.vy < 0, 'отпустил палец — магия летит туда (влево-вверх)', JSON.stringify(sh));
    const lay = await ph.evaluate(() => { const r = (id) => { const e = document.getElementById(id); return e ? e.getBoundingClientRect() : null; };
      const w = r('gWar'), top = r('gTop'), tp = r('bfSandboxBtn'), btns = [...document.querySelectorAll('#pad .pBtn')].map(e => e.getBoundingClientRect()).filter(q => q.width);
      const hit = (a, q) => a && q && a.left < q.right && a.right > q.left && a.top < q.bottom && a.bottom > q.top;
      return { warTop: w && Math.round(w.top), barBottom: top && Math.round(top.bottom), h: innerHeight, tpOver: btns.some(q => hit(tp, q)) }; });
    ok(lay.warTop >= lay.barBottom && lay.warTop < lay.h / 3, 'на телефоне панель войны сверху, под шапкой', JSON.stringify(lay));
    ok(!lay.tpOver, 'кнопка TestPanel не закрывает кнопки движения', JSON.stringify(lay));
    await pc.close(); }

  console.log('Capture the Flag');
  const t = await open('game.html?mode=team');
  let ctf = null;
  for (let k = 0; k < 3 && !ctf; k++) {
    await until(t, () => window.BFOfflineModes && BFOfflineModes.room && BFOfflineModes.room.st.phase === 'round', 30000);
    if (await t.evaluate(() => !!BFOfflineModes.room.st.ctf)) { ctf = true; break; }
    await t.evaluate(() => { const c = BFOfflineModes.room; clearTimeout(c.st.timer); c.next(); });
  }
  ok(ctf, 'раунд Capture the Flag');
  if (ctf) {
    const got = await until(t, () => { const c = BFOfflineModes.room, f = c.st.ctf; return Object.values(f.flags).some(Boolean) || Object.values(f.score).some(Boolean) ? JSON.stringify(f) : null; }, 60000);
    ok(!!got, 'боты берут флаг соперника', got);
  }
  await t.close();

  console.log('Прятки: искатель-бот');
  const h = await open('game.html?mode=hideAndSeek');
  await until(h, () => window.BFOfflineModes && BFOfflineModes.room && BFOfflineModes.room.st.phase === 'round' && BFOfflineModes.room.st.seekerId !== BFOfflineModes.room.me.id, 60000);
  const hs = await h.evaluate(() => new Promise(r => {
    const c = BFOfflineModes.room, sk = c.bots.find(b => b.id === c.st.seekerId);
    if (!sk) return r({ none: true });
    // игрок стоит далеко за пределами видимости — искатель не бежит прямо к нему, а обходит укрытия
    const m = c.me.position; c.me.position = { x: m.x + 5000, y: m.y, w: 30, h: 100 };
    setTimeout(() => r({ prey: sk.prey ? sk.prey.id : null, me: c.me.id, walk: !!sk.walk }), 1500);
  }));
  ok(hs.none || hs.prey !== hs.me, 'искатель не гонится за тем, кого не видит', JSON.stringify(hs));
  await h.close();

  ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); srv.close(); process.exit(fail ? 1 : 0);
});
