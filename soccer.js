/* Футбол (идеи игроков «Soccer mode», «футбол с мячом-физикой») — вариант Team Battle: две
   команды, ворота — их базы (укрытия карты, см. hsTeamSetup в server.js), мяч считает сервер,
   чтобы у всех он был в одном месте. Мяч падает, отскакивает от блоков карты (прямоугольники без
   поворота), игрок, коснувшийся мяча, пинает его от себя. Мяч в чужих воротах — гол; кто первым
   забил SOC_WIN — победил (или у кого больше голов к концу раунда). */
'use strict';
const R = 18, G = 0.55, BOUNCE = 0.62, AIR = 0.995, GROUND = 0.94, KICK_CD = 280, TICK = 33;
const SOC_WIN = 3;

// твёрдые прямоугольники карты (без поворота, не декорации) — от них мяч отскакивает
function solidsOf(list) {
  const out = [];
  for (const o of list || []) {
    if (!o || o.type !== 'rect' || o.ghost || o.deadly || o.hideSpot || o.parallax || o.moves || o.spins) continue;
    if (((+o.rot || 0) % 360) !== 0) continue;
    const x = +o.x, y = +o.y, w = +o.w, h = +o.h;
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) continue;
    out.push({ x, y, w, h });
    if (out.length >= 600) break;
  }
  return out;
}
function center(b) { return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }

function start(st) {
  const teams = st.teamList || [];
  const b0 = st.bases && st.bases[teams[0]], b1 = st.bases && st.bases[teams[1]];
  if (!b0 || !b1) { st.soc = null; return; }
  const c0 = center(b0), c1 = center(b1);
  const home = { x: (c0.x + c1.x) / 2, y: Math.min(b0.y, b1.y) - 240 };
  const score = {}; teams.forEach(t => { score[t] = 0; });
  st.soc = { home, ball: { x: home.x, y: home.y, vx: 0, vy: 0 }, score, kicks: new Map(), last: new Map(), freezeUntil: 0, maxY: Math.max(b0.y + b0.h, b1.y + b1.h) + 2500 };
}
function resetBall(soc, now) {
  soc.ball.x = soc.home.x; soc.ball.y = soc.home.y; soc.ball.vx = 0; soc.ball.vy = 0;
  soc.freezeUntil = now + 1200;
}
/* Один такт: физика мяча, пинки игроков, голы. players — [{id, team, pos:{x,y,w,h}}].
   Возвращает команду, которая только что забила, или null. */
function tick(st, players, now) {
  const soc = st.soc;
  if (!soc) return null;
  const b = soc.ball;
  if (now < soc.freezeUntil) return null;
  // пинки: касание фигуры игрока — мяч летит от него, сильнее, если игрок бежал
  for (const p of players) {
    const q = p.pos; if (!q) continue;
    const prev = soc.last.get(p.id); soc.last.set(p.id, { x: q.x, y: q.y });
    const near = b.x + R > q.x && b.x - R < q.x + (q.w || 30) && b.y + R > q.y && b.y - R < q.y + (q.h || 100);
    if (!near || now - (soc.kicks.get(p.id) || 0) < KICK_CD) continue;
    soc.kicks.set(p.id, now);
    const dir = b.x >= q.x + (q.w || 30) / 2 ? 1 : -1, run = prev ? Math.max(-14, Math.min(14, q.x - prev.x)) : 0;
    b.vx = Math.max(-16, Math.min(16, dir * 9 + run * 0.9));
    // подбрасывает только мяч у земли; летящий мяч пинок лишь отбивает вбок — иначе его
    // можно было бы «жонглировать» в воздухе бесконечно
    b.vy = b.vy >= 0 && b.y + R > q.y + (q.h || 100) * 0.55 ? Math.min(b.vy, -5 - Math.abs(run) * 0.15) : Math.max(b.vy, -2);
    soc.lastTouch = p.team;
  }
  b.vy += G; b.vx *= AIR;
  b.x += b.vx; b.y += b.vy;
  let onGround = false;
  for (const s of st.socSolids || []) {
    if (b.x + R <= s.x || b.x - R >= s.x + s.w || b.y + R <= s.y || b.y - R >= s.y + s.h) continue;
    const pushL = b.x + R - s.x, pushR = s.x + s.w - (b.x - R), pushU = b.y + R - s.y, pushD = s.y + s.h - (b.y - R);
    const m = Math.min(pushL, pushR, pushU, pushD);
    if (m === pushU) { b.y = s.y - R; if (b.vy > 0) b.vy = -b.vy * BOUNCE; if (Math.abs(b.vy) < 1.2) b.vy = 0; onGround = true; }
    else if (m === pushD) { b.y = s.y + s.h + R; if (b.vy < 0) b.vy = -b.vy * BOUNCE; }
    else if (m === pushL) { b.x = s.x - R; if (b.vx > 0) b.vx = -b.vx * BOUNCE; }
    else { b.x = s.x + s.w + R; if (b.vx < 0) b.vx = -b.vx * BOUNCE; }
  }
  if (onGround) b.vx *= GROUND;
  if (b.y > soc.maxY || Math.abs(b.x - soc.home.x) > 6000) { resetBall(soc, now); return null; }
  // гол: мяч в воротах (базе) команды — очко другой команде
  const teams = st.teamList || [];
  for (const t of teams) {
    const g = st.bases[t];
    if (b.x > g.x && b.x < g.x + g.w && b.y > g.y && b.y < g.y + g.h) {
      const scorer = teams.find(x => x !== t);
      if (scorer) soc.score[scorer]++;
      resetBall(soc, now);
      return scorer || null;
    }
  }
  return null;
}
function state(st) {
  const soc = st.soc;
  return soc ? { x: Math.round(soc.ball.x), y: Math.round(soc.ball.y), r: R, score: Object.assign({}, soc.score) } : null;
}
module.exports = { start, tick, state, solidsOf, TICK, SOC_WIN, R };
