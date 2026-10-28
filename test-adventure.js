/* «Приключение» (идеи 2019 года «Adventure», «RPG mode», «Tower defence», см. adventure.js): комнаты
   «adventure-N», встроенные карты «Bro Tower» и «Crystal Defense». Сокетами: класс выбирают в лобби;
   бьют только оружием своего класса и только в досягаемости; огненный шар задевает соседей; маг
   лечит рядом стоящих; зачищен этаж — люк наверх открыт и заселён следующий; босс бьёт о землю —
   стоящих на полу задевает, прыгнувших нет; босс выбит — победа; выбыли все разом — поражение;
   оборона: враги волнами идут к кристаллу, дошедший бьёт его, все волны отбиты — победа.
   Браузером: выбор класса в лобби, наряд класса, выстрел по врагу кликом, люк открывается и у
   браузера. Свои серверы: 3251 (башня), 3252 (оборона), 3253 (поражение). */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const ROOT = __dirname;
const SHOTS = process.env.SHOTS_DIR || '';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(60); } return null; };
const tower = JSON.parse(fs.readFileSync(path.join(ROOT, 'builtinMaps', 'brotower.json'), 'utf8')).adv;

function server(port, env) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-adv-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), OWNER_ALIASES: 'advtestowner', HS_LOBBY_MS: '2000', ADV_RESPAWN_MS: '1500', ...env } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
const up = (S) => until(() => fetch(S.base + '/').then(r => r.ok).catch(() => false), 20000);
let ipN = 0;
function bot(base, name, room) {
  const s = io(base, { transports: ['websocket'], forceNew: true, extraHeaders: { 'CF-Connecting-IP': '10.51.' + (++ipN) + '.1' } });
  const p = { s, name, ev: [], x: 90, y: 2100, sid: 1, en: [] };
  ['hsRoulette', 'hsPhase', 'hsReveal', 'advEn', 'advEnHp', 'advDie', 'advGate', 'advHp', 'advDown', 'advUp', 'advSlam', 'advClass',
   'advWave', 'advWaveClear', 'advCore', 'advEnd', 'advHeal'].forEach(e => s.on(e, d => p.ev.push({ e, d, t: Date.now() })));
  s.on('advEn', d => { p.en = d.list; });
  p.join = () => s.emit('join', { playerName: name, gameMode: 'hideAndSeek', room });
  p.at = (x, y) => { p.x = x; p.y = y; s.emit('movePlayer', { position: { x, y, w: 30, h: 100 } }); };
  const hb = setInterval(() => s.connected && s.emit('movePlayer', { position: { x: p.x, y: p.y, w: 30, h: 100 } }), 150);
  s.on('disconnect', () => clearInterval(hb));
  p.last = (e, f, after) => { const x = p.ev.filter(v => v.e === e && v.t > (after || 0) && (!f || f(v.d))).pop(); return x && x.d; };
  p.hit = (e, w) => s.emit('advHit', { e, w, sid: p.sid++ });
  return p;
}
const connected = (ps) => Promise.all(ps.map(p => new Promise(r => p.s.connected ? r() : p.s.once('connect', r))));
// выбить всех врагов на полу feetY: воин встаёт рядом и бьёт мечом, маг стреляет огнём с места
async function clearFloor(W, M, feetY, ms = 30000, gap = 200) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const list = W.en.filter(e => Math.abs(e[3] - feetY) < 80 || (e[1] === 'bat' && Math.abs(e[3] + 62 - feetY) < 80));
    if (!list.length) return true;
    const e = list[0];
    W.at(e[2] - 15, feetY - 100);
    if (M) M.at(e[2] - gap, feetY - 100);
    await sleep(120);
    W.hit(e[0], 'sword');
    if (M) { M.hit(e[0], 'fire'); M.s.emit('advHeal'); }
    await sleep(360);
  }
  return false;
}

(async () => {
  // проверяем механику, а не баланс: враги бьют вполсилы, чтобы двое ботов, стоящих на месте, не выбыли разом
  const S = server(3251, { HS_VARIANT: 'quest', ADV_DMG_MUL: '0.5' });
  const S2 = server(3252, { HS_VARIANT: 'defense', ADV_WAVES_N: '2', ADV_WAVE_GAP_MS: '1500' });
  const S3 = server(3253, { HS_VARIANT: 'quest', ADV_DMG_MUL: '30' });
  process.on('exit', () => { S.kill(); S2.kill(); S3.kill(); });
  if (!await up(S) || !await up(S2) || !await up(S3)) throw new Error('сервер не поднялся');

  console.log('Страница и комнаты:');
  ok(/mdList/.test(await fetch(S.base + '/adventure').then(r => r.text())), 'страница /adventure открывается');
  ok(/\/adventure</.test(await fetch(S.base + '/sitemap.xml').then(r => r.text())), 'в sitemap есть /adventure');
  const best = await fetch(S.base + '/getBestRoom?mode=hideAndSeek&variant=adventure').then(r => r.json());
  ok(/^adventure-\d+$/.test(best.room), 'комната режима — adventure-N', best.room);

  console.log('Башня:');
  const room = 'adventure-' + Math.floor(Math.random() * 1e6);
  const A = bot(S.base, 'av_w', room), B = bot(S.base, 'av_m', room);
  await connected([A, B]);
  A.join(); await sleep(150); B.join();
  const r1 = await until(() => A.last('hsRoulette', d => d.variant === 'quest'), 12000);
  ok(!!r1 && r1.advCls && Object.keys(r1.advCls).length >= 1, 'лобби: раунд «Башня», у игроков классы', r1 && JSON.stringify(r1.advCls));
  A.s.emit('advClass', { c: 'warrior' }); B.s.emit('advClass', { c: 'mage' });
  const cl = await until(() => A.last('advClass', d => d.id === B.s.id && d.c === 'mage'), 3000);
  ok(!!cl, 'класс выбран — видят все');
  const rd = await until(() => A.last('hsPhase', d => d.phase === 'round' && d.adv), 20000);
  const adv = rd && rd.adv;
  ok(!!adv && adv.v === 'quest' && adv.floors === 5 && adv.en.length === 3 && adv.gates.length === 0 && adv.allGates.length === 4,
    'раунд: этаж 1 из 5, три врага, люки закрыты', adv && JSON.stringify({ f: adv.floor, en: adv.en.length, g: adv.allGates }));
  ok(!!adv && adv.en[0][6] === Math.round(40 * 1.4), 'вдвоём враги крепче (слизень 40 → 56)', adv && adv.en[0][6]);
  ok(!!adv && adv.max[A.s.id] === 170 && adv.max[B.s.id] === 95, 'здоровье по классу: воин 170, маг 95');
  A.en = adv ? adv.en : [];
  const F1 = tower.floors[0].y;
  // чужое оружие и вне досягаемости — мимо
  const t0 = Date.now(), e1 = A.en[0];
  A.at(e1[2] - 15, F1 - 100); await sleep(250);
  A.hit(e1[0], 'bow'); await sleep(400);
  ok(!A.last('advEnHp', null, t0), 'воин луком не стреляет — у него меч');
  A.at(e1[2] + 900, F1 - 100); await sleep(250);
  A.hit(e1[0], 'sword'); await sleep(400);
  ok(!A.last('advEnHp', null, t0), 'меч не достаёт через полэтажа');
  // огненный шар: попал — и брызги по соседу
  const pair = A.en.find((e, i) => A.en.some((o, j) => j !== i && Math.abs(o[2] - e[2]) < 95)) || A.en[0];
  B.at(pair[2] - 300, F1 - 100); await sleep(250);
  const t1 = Date.now();
  B.hit(pair[0], 'fire');
  const fh = await until(() => A.last('advEnHp', d => d.e === pair[0] && d.by === B.s.id, t1), 2000);
  ok(!!fh && fh.hp === pair[6] - 34, 'огненный шар мага — 34 урона', fh && JSON.stringify(fh));
  // зачистка этажа 1 — люк наверх и враги второго этажа
  ok(await clearFloor(A, B, F1), 'этаж 1 зачищен');
  const g1 = await until(() => A.last('advGate', d => d.gate === 'gate1'), 3000);
  ok(!!g1 && g1.floor === 2, 'открыт люк gate1 — на этаж 2', g1 && JSON.stringify(g1));
  await sleep(300);
  ok(A.en.length === 4 && A.en.every(e => Math.abs(e[3] - tower.floors[1].y) < 80), 'на этаже 2 — четыре врага', JSON.stringify(A.en.map(e => e[1])));
  // лечение: маг в бою лечит (Q) — раненый воин в двухстах пикселях от него здоровеет
  const hpA = A.ev.filter(v => v.e === 'advHp' && v.d.id === A.s.id);
  const healed = hpA.find((v, i) => v.d.heal && i > 0 && v.d.hp > hpA[i - 1].d.hp);
  ok(!!healed, 'маг лечит раненого рядом', healed && JSON.stringify(healed.d));
  // этажи 2–4
  for (let k = 1; k < 4; k++) {
    const F = tower.floors[k].y;
    const done = await clearFloor(A, B, F);
    const gg = await until(() => A.last('advGate', d => d.gate === 'gate' + (k + 1)), 3000);
    ok(done && !!gg, 'этаж ' + (k + 1) + ' зачищен — люк gate' + (k + 1) + ' открыт');
  }
  // босс
  const F5 = tower.floors[4].y;
  await sleep(300);
  const boss = A.en.find(e => e[1] === 'boss');
  ok(!!boss && boss[6] === Math.round(520 * 1.6), 'наверху босс (вдвоём — 832 здоровья)', boss && boss[6]);
  // удар о землю: A стоит на полу у босса, B «в прыжке» над полом (дальше, чем бьёт рукой босс)
  A.at(boss[2] - 100, F5 - 100); B.at(boss[2] + 250, F5 - 180);
  const sl = await until(() => A.last('advSlam'), 9000);
  ok(!!sl, 'босс бьёт о землю — предупреждение заранее', sl && JSON.stringify(sl));
  const t3 = Date.now();
  await sleep(1100);
  const hitA = A.ev.some(v => v.e === 'advHp' && v.t > t3 - 50 && v.d.id === A.s.id && !v.d.heal);
  const hitB = A.ev.some(v => v.e === 'advHp' && v.t > t3 - 50 && v.d.id === B.s.id && !v.d.heal);
  ok(hitA && !hitB, 'удар задел стоявшего на полу, прыгнувшего — нет', JSON.stringify({ hitA, hitB }));
  ok(await clearFloor(A, B, F5, 40000, 350), 'босс и его помощники выбиты');
  const end = await until(() => A.last('advEnd'), 3000);
  ok(!!end && end.win === true, 'победа');
  const rev = await until(() => A.last('hsReveal', d => d.variant === 'quest'), 5000);
  ok(!!rev && rev.win && rev.floor === 5 && rev.kills.length === 2, 'итог: победа на 5-м этаже, счёт нокаутов', rev && JSON.stringify(rev));
  A.s.close(); B.s.close();

  console.log('Поражение:');
  const L = bot(S3.base, 'av_solo', 'adventure-' + Math.floor(Math.random() * 1e6));
  await connected([L]); L.join();
  const lr = await until(() => L.last('hsPhase', d => d.phase === 'round' && d.adv), 20000);
  const sl1 = lr && lr.adv.en[0];
  if (sl1) L.at(sl1[2] - 15, tower.floors[0].y - 100);
  const dn = await until(() => L.last('advDown', d => d.id === L.s.id), 8000);
  ok(!!dn, 'одного выбили');
  const lend = await until(() => L.last('advEnd'), 3000);
  ok(!!lend && lend.win === false, 'выбыли все разом — поражение');
  L.s.close();

  console.log('Оборона:');
  const D = bot(S2.base, 'av_a', 'adventure-' + Math.floor(Math.random() * 1e6));
  await connected([D]); D.join();
  D.s.emit('advClass', { c: 'archer' });
  const dr = await until(() => D.last('hsPhase', d => d.phase === 'round' && d.adv), 20000);
  ok(!!dr && dr.adv.v === 'defense' && dr.adv.core && dr.adv.core.hp === 30 && dr.adv.waves === 2, 'раунд обороны: кристалл 30, две волны',
    dr && JSON.stringify({ core: dr.adv.core, waves: dr.adv.waves }));
  D.at(1485, 540);
  const w1 = await until(() => D.last('advWave', d => d.n === 1), 5000);
  ok(!!w1, 'первая волна пошла');
  // первую волну не трогаем — слизни доходят до кристалла
  const core = await until(() => D.last('advCore', d => d.hp < 30), 40000);
  ok(!!core, 'дошедший до кристалла враг бьёт его', core && JSON.stringify(core));
  const wc = await until(() => D.last('advWaveClear', d => d.n === 1), 40000);
  ok(!!wc, 'волна кончилась — пауза до следующей');
  // вторую — отстреливаем из лука
  const tw = Date.now();
  let shotOk = false;
  while (Date.now() - tw < 60000 && !D.last('advEnd')) {
    const e = D.en[0];
    if (e) { D.at(Math.max(60, e[2] + (e[2] < 1500 ? 300 : -300)), 800); await sleep(120); D.hit(e[0], 'bow'); if (D.last('advEnHp', d => d.by === D.s.id, tw)) shotOk = true; }
    await sleep(420);
  }
  ok(shotOk, 'лучник попадает издалека');
  const dend = D.last('advEnd');
  ok(!!dend && dend.win === true, 'обе волны отбиты — победа');
  const drev = await until(() => D.last('hsReveal', d => d.variant === 'defense'), 5000);
  ok(!!drev && drev.win && drev.core < 30 && drev.core > 0, 'итог: кристалл цел, но побит', drev && JSON.stringify({ core: drev.core, wave: drev.wave }));
  D.s.close();

  console.log('В браузере:');
  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'CF-Connecting-IP': '10.51.99.1' } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bfConsent', '1'); } catch (e) {} });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  await page.goto(S.base + '/', { waitUntil: 'domcontentloaded' });
  const modes = await page.evaluate(() => [...document.querySelectorAll('.card')].map(c => c.dataset.mode));
  ok(modes.join() === 'hideAndSeek,race,murder,team,war,party,adventure', 'на главной семь режимов, «Adventure» последним', modes.join());
  const room3 = 'adventure-' + Math.floor(Math.random() * 1e6);
  await page.goto(S.base + '/game.html?mode=hideAndSeek&room=' + room3, { waitUntil: 'domcontentloaded' });
  const pick = await until(() => page.evaluate(() => document.querySelectorAll('#gAdvPick .apCls').length === 3), 10000);
  ok(!!pick, 'в лобби — выбор из трёх классов');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'adv-pick.png') });
  const O = bot(S.base, 'av_obs', room3);
  await connected([O]); O.join();
  await sleep(200);
  O.s.emit('advClass', { c: 'warrior' });
  await page.click('#gAdvPick .apCls[data-c="archer"]');
  ok(!!await until(() => O.last('advClass', d => d.c === 'archer'), 3000), 'клик по классу — сервер принял');
  const br = await until(() => O.last('hsPhase', d => d.phase === 'round' && d.adv), 20000);
  ok(!!br, 'раунд начался');
  await until(() => page.evaluate(() => document.getElementById('gAdv').style.display !== 'none'), 5000);
  const fit = await page.evaluate(() => GAME.myOutfit && GAME.myOutfit.kind);
  const role = await page.evaluate(() => document.getElementById('gRole').textContent);
  ok(fit === 'archer' && role === 'Archer', 'наряд и роль — лучник', fit + ' / ' + role);
  // встаём у первого врага и стреляем кликом по нему
  const F1b = tower.floors[0].y;
  const tgt = (O.en.length ? O.en : br.adv.en)[0];
  await page.evaluate(([x, y]) => GAME.teleportTo(x, y), [tgt[2] - 260, F1b - 100]);
  O.at(90, F1b - 100);
  await sleep(500);
  let shot = null;
  for (let k = 0; k < 6 && !shot; k++) {
    const e = O.en.find(v => v[0] === tgt[0]) || tgt;
    const pt = await page.evaluate(([x, y]) => { const r = document.getElementById('c').getBoundingClientRect(), v = GAME.view; return { x: r.left + x * v.s + v.x, y: r.top + y * v.s + v.y }; }, [e[2], e[3] - 16]);
    await page.mouse.click(pt.x, pt.y);
    shot = await until(() => O.last('advEnHp', d => d.e === tgt[0]), 1500);
  }
  ok(!!shot, 'клик — стрела летит в цель и попадает', shot && JSON.stringify(shot));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'adv-shot.png') });
  // бот-воин зачищает этаж — у браузера открывается люк
  const okClear = await clearFloor(O, null, F1b);
  const gateOpen = await until(() => page.evaluate(() => { const g = GAME.objects.find(o => o.customId === 'gate1'); return g && g._act === true; }), 4000);
  ok(okClear && !!gateOpen, 'этаж зачищен — люк открыт и в браузере');
  const top = await page.evaluate(() => document.getElementById('gTeamBox').textContent);
  ok(/Floor 2\/5/.test(top), 'в шапке — этаж 2 из 5', top);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'adv-floor2.png') });
  ok(errs.length === 0, 'ошибок скриптов нет', errs.join(' | '));
  await browser.close();
  O.s.close();
  console.log(`\n${pass} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
