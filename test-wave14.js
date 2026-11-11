/* Четырнадцатая волна идей игроков — футбол в Team Battle: мяч считает сервер, падает на блоки,
   касание игрока пинает его; мяч в воротах (базе) соперника — гол, счёт в шапке, «ГОЛ!» крупно.
   Свой сервер: 3278. Запуск: node test-wave14.js */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const { io } = require('socket.io-client');
const ROOT = __dirname;
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + String(x).slice(0, 220))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(60); } return null; };
const pitch = [
  { type: 'rect', x: 0, y: 600, w: 2000, h: 40 },
  { type: 'spawn', x: 900, y: 500, w: 30, h: 100 },
  { type: 'rect', x: 40, y: 420, w: 140, h: 180, hideSpot: true },
  { type: 'rect', x: 1820, y: 420, w: 140, h: 180, hideSpot: true }
];
function server(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-wave14-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: x => {
    const r = path.relative(ROOT, x);
    return !(/^(node_modules|data|\.git|builtinMaps)(\/|$)/.test(r) || /^(dbg_|shot_)/.test(r));
  } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const now = Date.now();
  fs.writeFileSync(path.join(tmp, 'data', 'maps.json'), JSON.stringify([{ mapName: 'Pitch', mapType: 'hideAndSeek', author: 'w14', date: now, created: now, rating: 0, votes: {},
    boostLikes: 0, boostDislikes: 0, inGameModes: ['hideAndSeek'], mapData: JSON.stringify({ mode: 'hideAndSeek', gravity: 9, objects: pitch }) }]));
  const proc = spawn('node', ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), OWNER_ALIASES: 'w14', HS_VARIANT: 'soccer', HS_LOBBY_MS: '2500', HS_ROUND_MS: '90000' } });
  return { base: 'http://127.0.0.1:' + port, kill: () => { try { proc.kill(); } catch (e) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} } };
}
(async () => {
  const S = server(3278);
  await until(() => fetch(S.base + '/getRoomList?mode=race').then(r => r.ok).catch(() => false), 15000);
  const b = await chromium.launch();
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const g = await ctx.newPage(); g.on('pageerror', e => errs.push('game: ' + e.message.slice(0, 200)));
    await g.goto(S.base + '/game.html?mode=team&room=team-1');
    await until(() => g.evaluate(() => window.GAME && GAME.playing), 15000);
    const k = io(S.base, { transports: ['websocket'], forceNew: true });
    let ball = null, round = null; const goals = [];
    k.on('hsPhase', d => { if (d.phase === 'round') round = d; });
    k.on('soccerState', d => { ball = d; if (d.goal) goals.push(d.goal); });
    await new Promise(r => k.on('connect', r));
    k.emit('join', { playerName: 'Kicker', gameMode: 'hideAndSeek', room: 'team-1' });
    k.emit('movePlayer', { position: { x: 300, y: 500, w: 30, h: 100 } });
    await until(() => round && round.variant === 'soccer', 30000);
    ok(round && round.variant === 'soccer', 'Team Battle: раунд «Футбол»');
    const b0 = await until(() => ball, 4000);
    ok(!!b0, 'сервер присылает мяч', JSON.stringify(b0));
    // мяч падает и несколько раз отскакивает, пока не ляжет
    ok(!!await until(() => ball && Math.abs(ball.y - (600 - ball.r)) < 3, 6000), 'мяч упал и лежит на поле', ball && ball.y);
    console.log('Пинки и гол:');
    const x0 = ball.x;
    // игрок раз за разом подбегает к мячу слева и толкает его вправо — к правым воротам
    for (let i = 0; i < 160 && !goals.length; i++) {
      // бегает по полю: подходит к мячу слева, пока тот у земли
      k.emit('movePlayer', { position: { x: Math.round(ball.x) - (ball.y > 450 ? 40 : 90), y: 500, w: 30, h: 100 } });
      if (i === 10) ok(ball.x > x0 + 20, 'касание пинает мяч от игрока', Math.round(x0) + ' → ' + Math.round(ball.x));
      await sleep(70);
    }
    ok(goals.length >= 1, 'мяч в воротах — гол', JSON.stringify(goals));
    ok(ball && Object.values(ball.score).reduce((a, c) => a + c, 0) >= 1, 'счёт вырос', JSON.stringify(ball && ball.score));
    const hud = await until(() => g.evaluate(() => { const e = document.getElementById('gTeamBox'); return e && e.style.display !== 'none' && /1/.test(e.textContent) ? e.textContent : null; }), 4000);
    ok(!!hud, 'счёт виден в шапке', hud);
    await g.screenshot({ path: path.join(os.tmpdir(), 'wave14-soccer.png') });
    k.close();
    ok(!errs.length, 'без ошибок на страницах', errs.join(' | '));
  } catch (e) { fail++; console.log('  ✗ тест упал: ' + (e && e.stack || e)); }
  console.log(`\n${pass} ok, ${fail} fail`);
  await b.close(); S.kill(); process.exit(fail ? 1 : 0);
})();
