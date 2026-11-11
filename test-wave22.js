/* Волна 22 — профиль и общение: репутация, статус и ссылка, превью ссылки на профиль, Зал славы,
   общий чат на главной, список скрытых в настройках, золотой/светящийся ник. Свой сервер: 3286. */
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
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(60); } return null; };
function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave22-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git|builtinMaps)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), PASSWORD_AUTH: '1' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
function client(S) {
  let cookie = '';
  const req = (u, body) => fetch(S.base + u, body ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie }, body: new URLSearchParams(body).toString() }
    : { headers: { cookie } }).then(r => { const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0]; return r.headers.get('content-type').indexOf('json') !== -1 ? r.json() : r.text(); });
  return { req, cookie: () => cookie };
}
(async () => {
  const S = server(3286);
  await until(() => fetch(S.base + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [];
  try {
    const a = client(S), c = client(S);
    await a.req('/signUp', { name: 'Alice22', password: 'secret12345' });
    await c.req('/signUp', { name: 'Carl22', password: 'secret12345' });
    console.log('Репутация и статус:');
    ok((await c.req('/rep', { name: 'Alice22', v: 1 })).rep === 1, 'лайк профилю: репутация +1');
    ok((await c.req('/rep', { name: 'Alice22', v: 1 })).rep === 1, 'второй лайк от того же — не копится');
    ok((await a.req('/rep', { name: 'Alice22', v: 1 })).status === 'error', 'себе нельзя');
    const st = await a.req('/setStatus', { status: 'Speedrunner <b>', link: 'javascript:alert(1)' });
    ok(st.statusText === 'Speedrunner b' && st.link === '', 'статус чистится от разметки, плохая ссылка не сохраняется', JSON.stringify(st));
    await a.req('/setStatus', { status: 'Speedrunner', link: 'https://youtube.com/@alice' });
    const ex = await c.req('/profileExtra?name=Alice22');
    ok(ex.rep === 1 && ex.status === 'Speedrunner' && /youtube/.test(ex.link) && ex.myVote === 1, 'профиль отдаёт репутацию, статус и ссылку', JSON.stringify(ex));
    console.log('Превью ссылки:');
    const html = await c.req('/users?name=Alice22');
    ok(/<title>Alice22 — AIBrofist<\/title>/.test(html) && /og:title/.test(html), 'у ссылки на профиль заголовок с ником');
    const evil = await c.req('/users?name=' + encodeURIComponent('<script>x</script>'));
    ok(!/<script>x<\/script>/.test(evil), 'ник в заголовке экранируется');
    console.log('Общий чат:');
    ok((await fetch(S.base + '/lobbyChat', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'text=hi' }).then(r => r.json())).status === 'error', 'гостю писать нельзя');
    ok((await a.req('/lobbyChat', { text: 'Hello all!' })).status === 'success', 'вошедший пишет в общий чат');
    ok((await a.req('/lobbyChat', { text: 'spam' })).status === 'error', 'чаще раза в 3 секунды — нельзя');
    const lc = await c.req('/lobbyChat?after=0');
    ok(lc.messages.length === 1 && lc.messages[0].name === 'Alice22', 'все видят сообщение', JSON.stringify(lc.messages));
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies([{ name: c.cookie().split('=')[0], value: c.cookie().split('=').slice(1).join('='), url: S.base }]);
    await ctx.addInitScript(() => { try { localStorage.setItem('bfMutedPlayers', JSON.stringify(['spammer'])); localStorage.setItem('bfHiddenPlayers', JSON.stringify(['ghosty'])); } catch (e) {} });
    const ix = await ctx.newPage(); ix.on('pageerror', e => errs.push('index: ' + e.message.slice(0, 200)));
    await ix.goto(S.base + '/');
    await ix.waitForSelector('#lobbyChat', { timeout: 8000 });
    await ix.click('#lobbyChat .lcHead');
    ok(!!await until(() => ix.evaluate(() => /Hello all!/.test(document.querySelector('#lobbyChat .lcList').textContent)), 6000), 'на главной окно общего чата с сообщениями');
    console.log('Зал славы и профиль:');
    const lb = await ctx.newPage(); lb.on('pageerror', e => errs.push('lb: ' + e.message.slice(0, 200)));
    await lb.goto(S.base + '/leaderboard');
    ok(!!await until(() => lb.evaluate(() => { const e = document.getElementById('lbHall'); return e && e.querySelectorAll('.lbHallCol').length === 4; }), 8000), 'в лидерах — Зал славы из четырёх колонок');
    const up = await ctx.newPage(); up.on('pageerror', e => errs.push('users: ' + e.message.slice(0, 200)));
    await up.goto(S.base + '/users?name=Alice22');
    const ext = await until(() => up.evaluate(() => { const e = document.getElementById('upExtra'); return e && /Speedrunner/.test(e.textContent) ? e.textContent : null; }), 8000);
    ok(!!ext && /\+1/.test(ext), 'в профиле статус и репутация', ext);
    console.log('Магазин:');
    const shop = await c.req('/cosm/shop');
    ok(shop.items.some(i => i.id === 'nick_glow') && shop.items.some(i => i.id === 'nick_gold'), 'в магазине — золотой и светящийся ник');
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); S.kill(); process.exit(fail ? 1 : 0);
})();
