/* Восьмая волна идей игроков — косметика за монеты: магазин на странице Avatar (купить, надеть,
   снять), шляпа/плащ/крылья/свечение на фигурке, след и питомец, эффект смерти; надетое видят
   другие игроки. Свой сервер: 3270. Запуск: node test-wave8.js */
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
let TMP = '';
function server(port) {
  const tmp = TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave8-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), PASSWORD_AUTH: '1' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
async function signUp(S, ctx, name) {
  const p = await ctx.newPage();
  await p.goto(S.base + '/index.html');
  const r = await p.evaluate(n => fetch('/signUp', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'name=' + n + '&password=secret12345' }).then(r => r.json()), name);
  await p.close();
  return r;
}
(async () => {
  const S = server(3270);
  await until(() => fetch(S.base + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [];
  try {
    const ca = await b.newContext({ viewport: { width: 1280, height: 900 } }), cb = await b.newContext({ viewport: { width: 1280, height: 800 } });
    ok((await signUp(S, ca, 'Fancy8')).status === 'success' && (await signUp(S, cb, 'Watch8')).status === 'success', 'два игрока зарегистрированы');
    console.log('Магазин:');
    const av = await ca.newPage(); av.on('pageerror', e => errs.push('avatar: ' + e.message.slice(0, 200)));
    await av.goto(S.base + '/avatar');
    await until(() => av.evaluate(() => document.querySelectorAll('.avCosmItem').length > 10), 8000);
    ok(await av.evaluate(() => document.querySelectorAll('.avCosmItem').length) === 18, 'в магазине 18 вещей в 6 разделах');
    await av.click('[data-buy="hat_crown"]');
    ok(/coins/i.test(await until(() => av.evaluate(() => document.getElementById('avCosmErr').textContent), 3000) || ''), 'без монет купить нельзя');
    await av.screenshot({ path: path.join(os.tmpdir(), 'wave8-shop.png'), fullPage: true });
    console.log('Покупка и надевание (с монетами):');
    // покупка с монетами — сам модуль магазина с подставной базой (у новых аккаунтов монет нет)
    const { execFileSync } = require('child_process');
    const out = execFileSync('node', ['-e', `
      const routes = {}; const app = { get: (p, f) => routes['GET ' + p] = f, post: (p, f) => routes['POST ' + p] = f };
      const u = { name: 'X', coins: 500 }; const acc = { currentUser: () => u, getDb: () => ({ users: { x: u } }), key: n => String(n).toLowerCase(), save: () => {} };
      require('./cosmShop.js').register(app, acc);
      const call = (k, body) => { let r; routes[k]({ body: body || {}, query: body || {} }, { json: v => r = v }); return r; };
      const a = call('POST /cosm/buy', { id: 'hat_crown' }), b2 = call('POST /cosm/buy', { id: 'pet_cat' }), c = call('POST /cosm/buy', { id: 'hat_crown' });
      const d = call('POST /cosm/equip', { slot: 'hat', id: '' }), e = call('POST /cosm/equip', { slot: 'hat', id: 'hat_top' });
      const f = call('POST /cosm/equip', { slot: 'hat', id: 'hat_crown' }), m = call('GET /cosm/many', { names: 'X' });
      process.stdout.write(JSON.stringify({ a: a.status, coins: b2.coins, eq: b2.equipped, again: c.status, off: d.equipped.hat || '', notOwned: e.status, on: f.equipped.hat, many: m.cosm }));`], { cwd: TMP }).toString();
    const o = JSON.parse(out);
    ok(o.a === 'success' && o.coins === 100 && o.eq.hat === 'hat_crown' && o.eq.pet === 'pet_cat', 'купил корону и котика: монеты списаны, вещи надеты', out);
    ok(o.again === 'error' && o.notOwned === 'error', 'повторно не купить, чужое не надеть');
    ok(o.off === '' && o.on === 'hat_crown' && o.many.X && o.many.X.pet === 'pet_cat', 'снять и надеть снова; другие видят надетое', JSON.stringify(o.many));

    console.log('В игре:');
    // отрисовка в игре: ответы /cosm/my и /cosm/many подменяем — вещи «надеты» без покупки
    const cosm = { hat: 'hat_crown', back: 'wings_angel', trail: 'trail_rainbow', pet: 'pet_dog', glow: 'glow_rgb', death: 'death_confetti' };
    for (const c of [ca, cb]) {
      await c.route('**/cosm/my', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(cosm) }));
      await c.route('**/cosm/many*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ cosm: { Fancy8: cosm } }) }));
    }
    const g1 = await ca.newPage(); g1.on('pageerror', e => errs.push('g1: ' + e.message.slice(0, 200)));
    await g1.goto(S.base + '/game.html?mode=race&room=c8');
    await until(() => g1.evaluate(() => window.GAME && GAME.playing && !!GAME.myCosm), 15000);
    ok(await g1.evaluate(() => GAME.myCosm && GAME.myCosm.hat === 'hat_crown'), 'своя косметика загружена в игру');
    const g2 = await cb.newPage(); g2.on('pageerror', e => errs.push('g2: ' + e.message.slice(0, 200)));
    await g2.goto(S.base + '/game.html?mode=race&room=c8');
    await until(() => g2.evaluate(() => window.GAME && GAME.playing), 15000);
    await sleep(2500);
    await g1.evaluate(() => { GAME.pl.x += 120; });
    await sleep(1200);
    await g1.screenshot({ path: path.join(os.tmpdir(), 'wave8-me.png') });
    await g2.screenshot({ path: path.join(os.tmpdir(), 'wave8-other.png') });
    await g1.evaluate(() => { GAME.pl.y = 6000; }); await sleep(400);
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); S.kill(); process.exit(fail ? 1 : 0);
})();
