'use strict';
/* ================== ВОЙНА И ЖЕТОНЫ ==================
   Идеи 2019 года, разложенные по режимам:
     «War 2Team / 4Team / FFA», «Control points (weapons: melee, ranged, bombs, magic)»,
     «Hunger games», «Bro RED mode» — отдельный режим «Война» (комнаты «war-N», см. hsFixedOf
     в server.js), раунды по очереди:
       ffa    — все против всех: кто первым выбьет WAR_FFA_WIN, тот и победил;
       tdm    — команды (две, а с 8 игроков — четыре, как в Team Battle): очко команде за выбитого;
       hunger — Голодные игры: одна жизнь, жетонов на карте больше, побеждает последний живой;
       cp     — контрольные точки с оружием: Domination (до пяти точек), выбитый не держит точку;
       bro    — Bro RED: рулетка выбирает одного огромного красного бойца с большим запасом
                здоровья и тяжёлым ударом, остальные — против него; выбили его — победа бойцов,
                продержался до конца раунда — победа Bro RED.
     «Add tokens in the map and shopping area where can buy boosts» — жетоны: появляются на
       карте во время раунда (там, где игроки уже ходили, — значит, туда точно можно дойти,
       и на укрытиях), за них в магазине покупаются бусты в прятках и оружие в войне.

   Бой считает клиент атакующего (он видит, куда попал), а сервер проверяет: что выстрел этим
   оружием был (и патрон на него был), что не сработала перезарядка, что цель жива, она враг и
   стоит не дальше, чем достаёт оружие, — по своим координатам игроков. Так же устроены поимка в
   прятках и флаг (см. hsCatch/ctfTouch). */

const WAR_VARIANTS = ['ffa', 'tdm', 'hunger', 'cp', 'bro'];
function isWar(v) { return WAR_VARIANTS.indexOf(v) !== -1; }

// урон, перезарядка (мс), докуда достаёт от точки выстрела (px), сколько летит снаряд (мс)
const WEAPONS = {
  fist:  { dmg: 20, cd: 350, reach: 130, life: 600 },
  sling: { dmg: 15, cd: 500, reach: 1000, life: 2500 },
  bomb:  { dmg: 55, cd: 800, reach: 800, life: 3200, radius: 130 },
  magic: { dmg: 32, cd: 650, reach: 1300, life: 2500 }
};
const AMMO = ['sling', 'bomb', 'magic'];
const AMMO_PACK = { sling: 10, bomb: 3, magic: 5 };
const HP = 100;
const RESPAWN_MS = Number(process.env.WAR_RESPAWN_MS) || 3000;
const WAR_FFA_WIN = Number(process.env.WAR_FFA_WIN) || 10;
const WAR_TDM_WIN = Number(process.env.WAR_TDM_WIN) || 15;
const BRO_HP_PER = 120, BRO_HP_CAP = 900, BRO_DMG = 1.6;
const KILL_TOKENS = 2, START_TOKENS = 2;

/* Магазин. hs — продаётся в прятках (Classic, Zombie, Cops & Robbers), war — в войне.
   hider/seeker — только прячущемуся или только охотнику. ms — сколько держится буст. */
const SHOP = {
  speed:  { price: 2, ms: 10000, hs: true, war: true },
  jump:   { price: 2, ms: 10000, hs: true, war: true },
  invis:  { price: 4, ms: 6000, hs: true, hider: true },
  radar:  { price: 3, ms: 8000, hs: true, seeker: true },
  sling:  { price: 3, war: true },
  bomb:   { price: 4, war: true },
  magic:  { price: 5, war: true },
  heal:   { price: 3, war: true },
  shield: { price: 4, ms: 10000, war: true }
};

// жетоны на карте: сколько в начале раунда, сколько максимум, как часто подкладываются
const TOK = { start: 4, max: 14, hungerStart: 10, every: Number(process.env.TOK_EVERY_MS) || 8000,
              pick: 90, apart: 120, trailGap: 1500, trailStep: 80, trailMax: 300 };

module.exports = function createWar(d) {
  const { io, gameState, hsMembers, hsTeamOf, sessionName, credit, creditScore, endEarly } = d;
  const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
  const posOf = (id) => { const p = gameState.players.get(id); return p && p.position ? p.position : null; };
  const nameOf = (id) => { const p = gameState.players.get(id); return p ? p.name : ''; };
  const center = (p) => ({ x: p.x + (p.w || 30) / 2, y: p.y + (p.h || 74) / 2 });

  /* ---------- жетоны ---------- */
  // где жетоны есть: обычные прятки и война; в Story, Murder Mystery и Team Battle — нет
  function tokensOn(st) { return !st.storyMap && (!st.fixedVariant || st.fixedVariant === 'war'); }
  function tok(st) {
    if (!st.tok) st.tok = { bank: new Map(), items: [], next: 1, trail: [], trailMap: '', lastAt: new Map(), timer: null };
    return st.tok;
  }
  function bankOf(st, id) { return tok(st).bank.get(id) || 0; }
  function addBank(st, id, n) {
    const t = tok(st);
    t.bank.set(id, Math.max(0, (t.bank.get(id) || 0) + n));
    io.to(id).emit('tokBank', { n: t.bank.get(id) });
  }
  const mapKey = (st) => st.map ? st.map.author + '|' + st.map.mapName : '';
  // путь игроков по этой карте — точки, куда точно можно дойти (см. movePlayer в server.js)
  function track(st, id, pos) {
    if (!tokensOn(st) || st.phase !== 'round' || !pos) return;
    const t = tok(st), now = Date.now();
    if (t.trailMap !== mapKey(st)) { t.trailMap = mapKey(st); t.trail = []; }
    const last = t.lastAt.get(id);
    if (last && (now - last.t < TOK.trailGap || Math.hypot(pos.x - last.x, pos.y - last.y) < TOK.trailStep)) return;
    t.lastAt.set(id, { t: now, x: pos.x, y: pos.y });
    t.trail.push({ x: pos.x + (pos.w || 30) / 2, y: pos.y + (pos.h || 74) / 2 });
    if (t.trail.length > TOK.trailMax) t.trail.splice(Math.floor(Math.random() * t.trail.length), 1);
  }
  function spawnToken(st, room) {
    const t = tok(st);
    if (t.items.length >= TOK.max) return null;
    const cand = t.trailMap === mapKey(st) ? t.trail.slice() : [];
    (st.spots || []).forEach(s => cand.push({ x: s.x + s.w / 2, y: s.y + s.h - 50 }));
    const free = cand.filter(c => t.items.every(it => Math.hypot(it.x - c.x, it.y - c.y) > TOK.apart));
    if (!free.length) return null;
    const c = free[Math.floor(Math.random() * free.length)];
    const it = { id: t.next++, x: Math.round(c.x), y: Math.round(c.y) };
    t.items.push(it);
    if (room) io.to(room).emit('tokAdd', it);
    return it;
  }
  function tokRoundStart(st, room, n) {
    if (!tokensOn(st)) return;
    const t = tok(st);
    t.items = [];
    const want = Math.min(TOK.max, (st.variant === 'hunger' ? TOK.hungerStart : TOK.start) + n);
    for (let i = 0; i < want; i++) if (!spawnToken(st, null)) break;
    io.to(room).emit('toks', { list: t.items });
    clearInterval(t.timer);
    t.timer = setInterval(() => {
      if (st.phase !== 'round') return;
      spawnToken(st, room);
    }, TOK.every);
  }
  function tokLobby(st, room) {
    if (!st.tok) return;
    clearInterval(st.tok.timer);
    st.tok.items = [];
    io.to(room).emit('toks', { list: [] });
  }
  function take(st, room, id, data) {
    if (!tokensOn(st) || st.phase !== 'round') return;
    const t = tok(st), tid = Number(data && data.id);
    const i = t.items.findIndex(it => it.id === tid);
    const p = posOf(id);
    if (i === -1 || !p) return;
    if (st.war && !alive(st, id)) return;
    const c = center(p);
    if (Math.abs(c.x - t.items[i].x) > TOK.pick || Math.abs(c.y - t.items[i].y) > TOK.pick + 30) return;
    t.items.splice(i, 1);
    io.to(room).emit('tokGone', { id: tid, by: id });
    addBank(st, id, 1);
  }

  /* ---------- магазин ---------- */
  function buy(st, room, id, data) {
    const item = data && Object.prototype.hasOwnProperty.call(SHOP, data.item) ? data.item : null;
    const no = (why) => io.to(id).emit('shopNo', { item, why });
    if (!item || !tokensOn(st)) return no('closed');
    const it = SHOP[item], war = st.fixedVariant === 'war';
    if (war ? !it.war : !it.hs) return no('closed');
    if (st.phase !== 'round' && st.phase !== 'lobby') return no('phase');
    // кто сейчас охотник: в охоте — заражённые/копы, в лобби — тот, кого выбрала рулетка
    const hunter = st.phase === 'round' ? !!(st.seekerIds && st.seekerIds.has(id))
      : (st.variant === 'cops' ? !!(st.copIds && st.copIds.indexOf(id) !== -1) : st.seekerId === id);
    if (it.hider && hunter) return no('role');
    if (it.seeker && !hunter) return no('role');
    if (it.hider && st.caughtSet && st.caughtSet.has(id)) return no('role');
    if (war && st.war && st.phase === 'round' && !alive(st, id)) return no('dead');
    if (item === 'heal' && !(st.war && st.phase === 'round' && st.war.hp.get(id) < st.war.max.get(id))) return no('full');
    if (bankOf(st, id) < it.price) return no('tokens');
    addBank(st, id, -it.price);
    const out = { item, ms: it.ms || 0 };
    if (AMMO.indexOf(item) !== -1) {
      const a = ammoOf(st, id);
      a[item] += AMMO_PACK[item];
      out.ammo = Object.assign({}, a);
    } else if (item === 'heal') {
      const hp = Math.min(st.war.max.get(id), st.war.hp.get(id) + 50);
      st.war.hp.set(id, hp);
      io.to(room).emit('warHp', { id, hp, heal: true });
    } else if (item === 'shield') {
      warAmmoState(st).shield.set(id, Date.now() + it.ms);
      io.to(room).emit('boost', { id, item, ms: it.ms });
    } else if (item === 'invis') {
      // невидимость — другие перестают его рисовать (сам он видит себя бледным)
      io.to(room).emit('boost', { id, item, ms: it.ms });
    }
    io.to(id).emit('shopOk', out);
  }

  /* ---------- война ---------- */
  // патроны и щит живут от лобби до конца раунда: купленное в лобби пригодится в бою
  function warAmmoState(st) {
    if (!st.warAmmo) st.warAmmo = { ammo: new Map(), shield: new Map() };
    return st.warAmmo;
  }
  function ammoOf(st, id) {
    const s = warAmmoState(st);
    if (!s.ammo.has(id)) s.ammo.set(id, { sling: 0, bomb: 0, magic: 0 });
    return s.ammo.get(id);
  }
  function alive(st, id) { return !!(st.war && st.war.hp.get(id) > 0 && !st.war.out.has(id)); }
  const teamWar = (v) => v === 'tdm' || v === 'cp';
  function enemies(st, a, b) {
    const v = st.war.v;
    if (teamWar(v)) { const ta = hsTeamOf(st, a), tb = hsTeamOf(st, b); return !!ta && !!tb && ta !== tb; }
    if (v === 'bro') return (a === st.war.bro) !== (b === st.war.bro);
    return true;
  }
  function feasible(v, n, spots) {
    if (v === 'tdm') return n >= 4;
    if (v === 'cp') return n >= 4 && spots >= 2;
    if (v === 'bro') return n >= 3;
    return n >= 2;
  }
  // раунды войны по очереди; что не подходит по числу игроков или карте — пропускаем
  function pick(st, n) {
    const spots = (st.spots || []).length;
    const forced = process.env.HS_VARIANT;
    if (isWar(forced) && feasible(forced, n, spots)) return forced;
    const i0 = WAR_VARIANTS.indexOf(st.warLast);
    for (let k = 1; k <= WAR_VARIANTS.length; k++) {
      const v = WAR_VARIANTS[(i0 + k) % WAR_VARIANTS.length];
      if (feasible(v, n, spots)) { st.warLast = v; return v; }
    }
    return 'ffa';
  }
  // где появляется боец: у команды — её база, у остальных — случайное укрытие или старт карты
  function spawnFor(st, id) {
    if (teamWar(st.war.v) && st.bases) { const t = hsTeamOf(st, id); if (t && st.bases[t]) return st.bases[t]; }
    const pts = [null].concat(st.spots || []);
    return pts[Math.floor(Math.random() * pts.length)];
  }
  function state(st) {
    const w = st.war;
    if (!w) return null;
    const obj = (m) => { const o = {}; m.forEach((v, k) => { o[k] = v; }); return o; };
    return { v: w.v, hp: obj(w.hp), max: obj(w.max), kills: obj(w.kills), score: w.score, out: Array.from(w.out), bro: w.bro };
  }
  function start(st, room) {
    clearTimers(st);
    if (!isWar(st.variant)) { st.war = null; return; }
    const members = hsMembers(room);
    const w = st.war = { v: st.variant, hp: new Map(), max: new Map(), kills: new Map(), out: new Set(),
                         shots: new Map(), last: new Map(), timers: new Set(), score: {},
                         bro: st.variant === 'bro' ? st.seekerId : null };
    if (teamWar(w.v)) (st.teamList || []).forEach((t) => { w.score[t] = 0; });
    if (w.v === 'bro') w.score = { bro: 0, fighters: 0 };
    members.forEach((m) => {
      const max = m.id === w.bro ? Math.min(BRO_HP_CAP, HP + BRO_HP_PER * (members.length - 1)) : HP;
      w.max.set(m.id, max); w.hp.set(m.id, max); w.kills.set(m.id, 0);
      addBank(st, m.id, START_TOKENS);
    });
  }
  // после hsPhase('round'): каждому — где он начинает (команды уже стоят на своих базах с лобби)
  function spawnAll(st, room) {
    if (!st.war) return;
    hsMembers(room).forEach((m) => {
      if (teamWar(st.war.v)) return;
      io.to(m.id).emit('warSpawn', { at: spawnFor(st, m.id) });
    });
  }
  function clearTimers(st) {
    if (st.war && st.war.timers) st.war.timers.forEach(t => clearTimeout(t));
  }
  function lobby(st, room) {
    clearTimers(st);
    st.war = null;
    st.warAmmo = null;                 // патроны и щиты — на один раунд (с его лобби)
    tokLobby(st, room);
  }
  function shot(st, room, socket, data) {
    const id = socket.id, w = st.war;
    if (!w || st.phase !== 'round' || st.caughtSent || !alive(st, id)) return;
    const kind = data && Object.prototype.hasOwnProperty.call(WEAPONS, data.w) ? data.w : null;
    const p = posOf(id);
    if (!kind || !p) return;
    const now = Date.now(), last = w.last.get(id) || {};
    if (now - (last[kind] || 0) < WEAPONS[kind].cd * 0.8) return;
    if (kind !== 'fist') {
      const a = ammoOf(st, id);
      if (a[kind] <= 0) { io.to(id).emit('warAmmo', { ammo: Object.assign({}, a) }); return; }
      a[kind]--;
    }
    last[kind] = now; w.last.set(id, last);
    const sid = Math.floor(num(data.sid, 0, 1e9));
    w.shots.set(id + ':' + sid, { w: kind, t: now, x: p.x + (p.w || 30) / 2, y: p.y + (p.h || 74) / 2, hit: new Set() });
    if (w.shots.size > 400) w.shots.forEach((s, k) => { if (now - s.t > 6000) w.shots.delete(k); });
    socket.to(room).emit('warShot', { id, w: kind, sid, dir: data.dir === -1 ? -1 : 1,
      x: num(data.x, -1e5, 1e5), y: num(data.y, -1e5, 1e5), vx: num(data.vx, -60, 60), vy: num(data.vy, -60, 60) });
  }
  function hit(st, room, id, data) {
    const w = st.war;
    if (!w || st.phase !== 'round' || st.caughtSent || !data) return;
    const t = String(data.t || '');
    if (!t || t === id) return;
    const s = w.shots.get(id + ':' + Math.floor(num(data.sid, 0, 1e9)));
    if (!s || Date.now() - s.t > WEAPONS[s.w].life + 1500) return;
    if (s.hit.has(t) || ((s.w === 'sling' || s.w === 'magic') && s.hit.size)) return;
    if (s.w === 'fist' && !alive(st, id)) return;
    const target = gameState.players.get(t);
    if (!target || target.room !== room || !alive(st, t) || !enemies(st, id, t)) return;
    const tp = posOf(t), ap = posOf(id);
    if (!tp) return;
    const tc = center(tp);
    let dmg = WEAPONS[s.w].dmg;
    if (s.w === 'fist') {
      if (!ap) return;
      const ac = center(ap);
      if (Math.abs(ac.x - tc.x) > WEAPONS.fist.reach || Math.abs(ac.y - tc.y) > 140) return;
    } else if (s.w === 'bomb') {
      const ex = num(data.x, -1e5, 1e5), ey = num(data.y, -1e5, 1e5);
      if (Math.hypot(ex - s.x, ey - s.y) > WEAPONS.bomb.reach + 200) return;
      const dd = Math.hypot(tc.x - ex, tc.y - ey);
      if (dd > WEAPONS.bomb.radius + 80) return;
      dmg = Math.round(dmg * (1 - 0.5 * Math.min(1, dd / WEAPONS.bomb.radius)));
    } else if (Math.hypot(tc.x - s.x, tc.y - s.y) > WEAPONS[s.w].reach + 200) return;
    s.hit.add(t);
    if (id === w.bro) dmg = Math.round(dmg * BRO_DMG);
    const sh = st.warAmmo && st.warAmmo.shield.get(t);
    if (sh && sh > Date.now()) dmg = Math.round(dmg / 2);
    const dir = tc.x >= s.x ? 1 : -1;
    const k = (s.w === 'bomb' ? 13 : s.w === 'fist' ? 9 : 6) * (id === w.bro ? 1.5 : 1);
    damage(st, room, t, dmg, id, dir * k, s.w === 'bomb' ? -9 : -6);
  }
  function damage(st, room, t, dmg, by, kx, ky) {
    const w = st.war;
    const hp = Math.max(0, (w.hp.get(t) || 0) - dmg);
    w.hp.set(t, hp);
    io.to(room).emit('warHp', { id: t, hp, by: by || null, kx: kx || 0, ky: ky || 0 });
    if (hp <= 0) down(st, room, t, by);
  }
  // касание яда (см. onHazard в game.js): выбивает сразу, как в гонке
  function hazard(st, room, id) {
    if (!st.war || st.phase !== 'round' || st.caughtSent || !alive(st, id)) return;
    damage(st, room, id, 1e6, null, 0, 0);
  }
  function down(st, room, t, by) {
    const w = st.war;
    if (by && by !== t) {
      w.kills.set(by, (w.kills.get(by) || 0) + 1);
      addBank(st, by, KILL_TOKENS);
    }
    if (by && w.v === 'tdm') { const bt = hsTeamOf(st, by); if (bt && w.score[bt] !== undefined) w.score[bt]++; }
    if (by && w.v === 'bro') { if (by === w.bro) w.score.bro++; else if (t === w.bro) w.score.fighters++; }
    io.to(room).emit('warDown', { id: t, by: by || null, name: nameOf(t), byName: by ? nameOf(by) : '', kills: by ? w.kills.get(by) : 0, score: w.score });
    if (w.v === 'hunger') w.out.add(t);
    else if (!(w.v === 'bro' && t === w.bro)) {
      const timer = setTimeout(() => {
        w.timers.delete(timer);
        if (st.war !== w || st.phase !== 'round' || !gameState.players.get(t)) return;
        w.hp.set(t, w.max.get(t) || HP);
        io.to(room).emit('warUp', { id: t, hp: w.hp.get(t), at: spawnFor(st, t) });
      }, RESPAWN_MS);
      w.timers.add(timer);
    }
    checkEnd(st, room);
  }
  function checkEnd(st, room) {
    const w = st.war;
    if (!w || st.caughtSent) return;
    let end = false;
    if (w.v === 'ffa') end = Array.from(w.kills.values()).some(k => k >= WAR_FFA_WIN);
    else if (w.v === 'tdm') end = Object.keys(w.score).some(t => w.score[t] >= WAR_TDM_WIN);
    else if (w.v === 'hunger') end = hsMembers(room).filter(m => alive(st, m.id)).length <= 1;
    else if (w.v === 'bro') end = !alive(st, w.bro);
    if (end) endEarly(room, st);
  }
  // итог раунда: кто победил (имя игрока, команда или bro/fighters)
  function result(st, room) {
    const w = st.war;
    if (!w) return null;
    const top = (m) => { let best = null, k = -1, tie = false;
      m.forEach((v, id) => { if (v > k) { k = v; best = id; tie = false; } else if (v === k) tie = true; });
      return tie || k <= 0 ? null : best; };
    let winner = null, winnerId = null;
    if (w.v === 'ffa') { winnerId = top(w.kills); }
    else if (w.v === 'hunger') {
      const left = hsMembers(room).filter(m => alive(st, m.id));
      winnerId = left.length === 1 ? left[0].id : top(w.kills);
    } else if (w.v === 'tdm') {
      const ts = Object.keys(w.score), best = Math.max.apply(null, ts.map(t => w.score[t]));
      const lead = ts.filter(t => w.score[t] === best);
      winner = lead.length === 1 && best > 0 ? lead[0] : null;
    } else if (w.v === 'cp') {
      const sc = st.dom ? st.dom.score : {}, ts = Object.keys(sc), best = Math.max.apply(null, ts.map(t => sc[t]));
      const lead = ts.filter(t => sc[t] === best);
      winner = lead.length === 1 && best > 0 ? lead[0] : null;
    } else if (w.v === 'bro') winner = alive(st, w.bro) ? 'bro' : 'fighters';
    return { winner, winnerId, winnerName: winnerId ? nameOf(winnerId) : '' };
  }
  function reveal(st, room) {
    const r = result(st, room);
    if (!r) return false;
    const w = st.war;
    const kills = Array.from(w.kills.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id, k]) => ({ name: nameOf(id), k }));
    io.to(room).emit('hsReveal', { variant: w.v, winner: r.winner, winnerName: r.winnerName, score: st.dom && w.v === 'cp' ? st.dom.score : w.score,
      kills, bro: w.bro ? nameOf(w.bro) : '' });
    return true;
  }
  // монеты и очки режима — победителям (кто в бою двигался: см. HS_MIN_DIST в server.js)
  function award(st, room, played) {
    const r = result(st, room);
    if (!r) return;
    const w = st.war;
    hsMembers(room).forEach((m) => {
      const won = r.winnerId ? m.id === r.winnerId
        : r.winner === 'bro' ? m.id === w.bro
        : r.winner === 'fighters' ? m.id !== w.bro
        : r.winner ? hsTeamOf(st, m.id) === r.winner : false;
      if (!won || !played(m.id)) return;
      const sock = io.sockets.sockets.get(m.id);
      const acct = sock && sessionName(sock.handshake.headers.cookie);
      if (!acct) return;
      credit(sock, acct, 1 + Math.floor(Math.random() * 5), 'hsWin');
      creditScore(acct);
    });
  }
  // вошёл посреди раунда: в Голодных играх — зрителем, иначе — со свежим здоровьем
  function join(st, room, id) {
    const w = st.war;
    if (!w || st.phase !== 'round') return;
    w.max.set(id, HP); w.kills.set(id, w.kills.get(id) || 0);
    if (w.v === 'hunger') { w.hp.set(id, 0); w.out.add(id); }
    else w.hp.set(id, HP);
    io.to(room).emit('warHp', { id, hp: w.hp.get(id), max: HP });
  }
  function leave(st, room, id) {
    if (st.tok) { st.tok.bank.delete(id); st.tok.lastAt.delete(id); }
    if (st.warAmmo) { st.warAmmo.ammo.delete(id); st.warAmmo.shield.delete(id); }
    const w = st.war;
    if (!w) return;
    w.hp.delete(id); w.out.delete(id);
    if (st.phase === 'round') checkEnd(st, room);
  }
  // что нужно вошедшему: его жетоны, жетоны на карте, состояние боя и патроны
  function joinState(st, id) {
    return { bank: st.tok ? bankOf(st, id) : 0, toks: st.tok && st.phase === 'round' ? st.tok.items : [],
             war: state(st), ammo: st.warAmmo && st.warAmmo.ammo.get(id) ? Object.assign({}, st.warAmmo.ammo.get(id)) : null,
             shop: tokensOn(st) };
  }
  return { isWar, pick, start, spawnAll, lobby, state, shot, hit, hazard, reveal, award, join, leave, joinState,
           take, buy, track, tokRoundStart, tokensOn, alive, WEAPONS, SHOP, AMMO_PACK };
};
