'use strict';
/* ================== ПРИКЛЮЧЕНИЕ ==================
   Идеи 2019 года «Adventure» (командный PvE: оружие, классы, магия, 5 этажей, босс, «dubstep»),
   «RPG mode» (классы) и «Tower defence» — отдельный режим «Adventure» (комнаты «adventure-N», см.
   hsFixedOf в server.js). Играется и в одиночку. Карты — встроенные (builtinMaps/, only: 'adventure'):
   в их JSON есть описание приключения (adv), которого нет в редакторе:
     quest   — «Башня»: этажи снизу вверх; на каждом враги, путь наверх закрыт люком (объект карты с
               customId из gate), пока все враги этажа не выбиты; на последнем — босс. Выбили босса —
               победа; выбыли все игроки разом — поражение;
     defense — «Оборона кристалла»: враги волнами идут с краёв к кристаллу; дошедший бьёт кристалл и
               пропадает; выстояли все волны — победа, кристалл разбит — поражение.
   Классы (выбирают в лобби): воин — меч, здоровья больше; лучник — лук издалека; маг — огненный шар
   с брызгами и лечение тех, кто рядом (Q). Враги ходят только вдоль своего этажа, без прыжков (летучая
   мышь — на высоте головы), их двигает сервер 10 раз в секунду. Попадания по ним считает клиент, а
   сервер проверяет оружие класса, перезарядку и дальность — как в войне (см. war.js). Выбитый игрок
   возвращается через ADV.respawn в начале текущего этажа (в обороне — у кристалла). */

const KINDS = {
  slime:    { hp: 40,  dmg: 8,  spd: 60,  w: 44, h: 32,  reach: 26, core: 1, fly: 0 },
  skeleton: { hp: 60,  dmg: 12, spd: 85,  w: 30, h: 96,  reach: 36, core: 2, fly: 0 },
  bat:      { hp: 28,  dmg: 7,  spd: 150, w: 40, h: 26,  reach: 30, core: 1, fly: 62 },
  knight:   { hp: 130, dmg: 18, spd: 60,  w: 38, h: 104, reach: 46, core: 3, fly: 0 },
  ogre:     { hp: 320, dmg: 22, spd: 45,  w: 70, h: 150, reach: 60, core: 6, fly: 0 },
  boss:     { hp: 520, dmg: 26, spd: 70,  w: 90, h: 200, reach: 70, core: 10, fly: 0 }
};
const CLASSES = { warrior: { hp: 170, w: 'sword' }, archer: { hp: 110, w: 'bow' }, mage: { hp: 95, w: 'fire' } };
const CLASS_ORDER = ['warrior', 'archer', 'mage'];
// урон, перезарядка (мс), докуда достаёт (px); у огненного шара — брызги по соседям
const WPN = { sword: { dmg: 30, cd: 420, reach: 150 }, bow: { dmg: 22, cd: 480, reach: 1250 }, fire: { dmg: 34, cd: 720, reach: 1300, splash: 95 } };
const HEAL = { amt: 35, r: 280, cd: 8000 };
const ADV = {
  tick: 100, atkCd: 1000, spawnGap: 1100,
  respawn: Number(process.env.ADV_RESPAWN_MS) || 5000,
  waveGap: Number(process.env.ADV_WAVE_GAP_MS) || 6000,
  waves: Number(process.env.ADV_WAVES_N) || 0,          // для тестов: сколько волн играть (0 — все)
  round: Number(process.env.ADV_ROUND_MS) || 0,         // для тестов: длина раунда
  dmgMul: Number(process.env.ADV_DMG_MUL) || 1,         // для тестов: во сколько раз сильнее бьют враги
  slamEvery: 5500, slamWarn: 800, slamR: 320, slamDmg: 22
};
const VARIANTS = ['quest', 'defense'];
function isAdv(v) { return VARIANTS.indexOf(v) !== -1; }

const fin = (v, lo, hi, d) => Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : d;
/* Описание приключения из JSON встроенной карты — с проверкой: числа в разумных пределах, враги —
   только известных видов. Ничего подходящего — null (карта для приключения не годится). */
function parseMap(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = raw.kind === 'defense' ? 'defense' : raw.kind === 'quest' ? 'quest' : null;
  if (!kind) return null;
  const pt = (p) => ({ x: fin(p && p.x, -1e5, 1e5, 0), y: fin(p && p.y, -1e5, 1e5, 0) });
  const kindsOk = (list) => (Array.isArray(list) ? list : []).filter(k => Object.prototype.hasOwnProperty.call(KINDS, k)).slice(0, 30);
  if (kind === 'quest') {
    const floors = (Array.isArray(raw.floors) ? raw.floors : []).slice(0, 8).map(f => ({
      y: fin(f.y, -1e5, 1e5, 0), x0: fin(f.x0, -1e5, 1e5, 0), x1: fin(f.x1, -1e5, 1e5, 0), start: pt(f.start),
      gate: typeof f.gate === 'string' ? f.gate.slice(0, 40) : null,
      enemies: (Array.isArray(f.enemies) ? f.enemies : []).filter(e => e && KINDS[e.k]).slice(0, 20).map(e => ({ k: e.k, x: fin(e.x, -1e5, 1e5, 0) }))
    })).filter(f => f.x1 > f.x0 && f.enemies.length);
    return floors.length ? { kind, floors } : null;
  }
  const g = raw.ground || {};
  const ground = { y: fin(g.y, -1e5, 1e5, 0), x0: fin(g.x0, -1e5, 1e5, 0), x1: fin(g.x1, -1e5, 1e5, 0) };
  const c = raw.core || {};
  const waves = (Array.isArray(raw.waves) ? raw.waves : []).slice(0, 12).map(kindsOk).filter(w => w.length);
  if (ground.x1 <= ground.x0 || !waves.length) return null;
  return { kind, ground, core: { x: fin(c.x, -1e5, 1e5, 0), w: fin(c.w, 20, 400, 100), hp: fin(c.hp, 1, 500, 30) },
           spawns: (Array.isArray(raw.spawns) ? raw.spawns : []).slice(0, 4).map(x => fin(x, -1e5, 1e5, 0)), start: pt(raw.start), waves };
}

module.exports = function createAdventure(d) {
  const { io, gameState, hsMembers, sessionName, credit, creditScore, endEarly } = d;
  const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
  const nameOf = (id) => { const p = gameState.players.get(id); return p ? p.name : ''; };
  const posOf = (id) => { const p = gameState.players.get(id); return p && p.position ? p.position : null; };

  // какой раунд: на карте приключения он записан в самой карте
  function pick(st) { return st.advMap ? st.advMap.kind : 'classic'; }
  function roundMs(st) { return ADV.round || (st.variant === 'defense' ? 330000 : 360000); }
  // класс игрока: свой выбор, иначе — по кругу, чтобы в команде были разные
  function classOf(st, id) {
    if (!st.advClass) st.advClass = new Map();
    if (!st.advClass.has(id)) st.advClass.set(id, CLASS_ORDER[st.advClass.size % CLASS_ORDER.length]);
    return st.advClass.get(id);
  }
  function classes(st, members) { const o = {}; members.forEach(m => { o[m.id] = classOf(st, m.id); }); return o; }
  function pickClass(st, room, id, data) {
    const c = data && CLASSES[data.c] ? data.c : null;
    if (!c || st.fixedVariant !== 'adventure' || st.phase === 'round') return;
    classOf(st, id);
    st.advClass.set(id, c);
    io.to(room).emit('advClass', { id, c });
  }

  function clearTimers(st) {
    const a = st.adv;
    if (!a) return;
    clearInterval(a.tickT);
    a.timers.forEach(t => clearTimeout(t));
  }
  function later(st, ms, fn) {
    const a = st.adv;
    const t = setTimeout(() => { a.timers.delete(t); if (st.adv === a && st.phase === 'round' && !a.over) fn(); }, ms);
    a.timers.add(t);
  }
  // сколько здоровья у врагов: на команду больше — их тоже крепче
  function scale(a, k) { return k === 'boss' ? 1 + 0.6 * (a.n - 1) : 1 + 0.4 * (a.n - 1); }
  function spawn(st, k, x, y, x0, x1) {
    const a = st.adv, K = KINDS[k];
    const max = Math.round(K.hp * scale(a, k));
    const e = { id: a.next++, k, x, y: y - K.fly, floorY: y, home: x, x0, x1, hp: max, max, dir: -1, atk: 0, dmg: Math.round(K.dmg * ADV.dmgMul) };
    a.en.push(e);
    return e;
  }
  function spawnFloor(st, i) {
    const a = st.adv, f = a.meta.floors[i];
    f.enemies.forEach(e => spawn(st, e.k, Math.max(f.x0, Math.min(f.x1, e.x)), f.y, f.x0, f.x1));
    a.bossHalf = false;
  }

  function start(st, room) {
    clearTimers(st);
    if (!isAdv(st.variant) || !st.advMap || st.advMap.kind !== st.variant) { st.adv = null; return; }
    const members = hsMembers(room);
    const a = st.adv = { v: st.variant, meta: st.advMap, n: Math.max(1, members.length), hp: new Map(), max: new Map(), down: new Map(),
                         kills: new Map(), last: new Map(), healAt: new Map(), shots: new Map(), en: [], next: 1, floor: 0, gates: [],
                         core: null, wave: -1, queue: [], timers: new Set(), tickT: null, over: false, win: null, slam: null };
    members.forEach(m => addPlayer(st, m.id));
    if (a.v === 'quest') spawnFloor(st, 0);
    else {
      a.core = { x: a.meta.core.x, w: a.meta.core.w, hp: a.meta.core.hp, max: a.meta.core.hp, y: a.meta.ground.y };
      a.waves = ADV.waves ? a.meta.waves.slice(0, ADV.waves) : a.meta.waves;
      later(st, 2500, () => startWave(st, room, 0));
    }
    a.tickT = setInterval(() => tick(st, room), ADV.tick);
  }
  function addPlayer(st, id) {
    const a = st.adv, c = CLASSES[classOf(st, id)];
    a.max.set(id, c.hp); a.hp.set(id, c.hp);
    if (!a.kills.has(id)) a.kills.set(id, 0);
  }
  function lobby(st) { clearTimers(st); st.adv = null; }

  /* ---------- волны обороны ---------- */
  function startWave(st, room, w) {
    const a = st.adv;
    a.wave = w;
    a.queue = a.waves[w].slice();
    io.to(room).emit('advWave', { n: w + 1, of: a.waves.length });
    const g = a.meta.ground, sp = a.meta.spawns.length ? a.meta.spawns : [g.x0, g.x1];
    let i = 0;
    const next = () => {
      if (!a.queue.length) return;
      const k = a.queue.shift();
      spawn(st, k, sp[i++ % sp.length], g.y, g.x0, g.x1);
      if (a.queue.length) later(st, ADV.spawnGap, next);
    };
    next();
  }

  /* ---------- ход врагов ---------- */
  function players(st, room) {
    const a = st.adv;
    return hsMembers(room).filter(m => !a.down.has(m.id) && (a.hp.get(m.id) || 0) > 0).map((m) => {
      const p = posOf(m.id);
      return p ? { id: m.id, x: p.x + (p.w || 30) / 2, feet: p.y + (p.h || 100) } : null;
    }).filter(Boolean);
  }
  function tick(st, room) {
    const a = st.adv;
    if (!a || st.phase !== 'round' || a.over) return;
    const now = Date.now(), dt = ADV.tick / 1000, ps = players(st, room);
    a.en.forEach((e) => {
      if (e.hp <= 0) return;
      const K = KINDS[e.k];
      // ближайший игрок на этом же этаже (ноги не выше ступенек и не ниже пола)
      let t = null, best = Infinity;
      ps.forEach((p) => {
        if (p.feet < e.floorY - 230 || p.feet > e.floorY + 12) return;
        const dd = Math.abs(p.x - e.x);
        if (dd < best) { best = dd; t = p; }
      });
      let goal;
      if (a.v === 'defense') goal = t && best < 140 && Math.abs(t.feet - e.floorY) < 120 ? t.x : a.core.x;
      else goal = t ? t.x : e.home + Math.sin(now / 1500 + e.id) * 120;
      const chase = !!t && goal === t.x;
      const dx = goal - e.x;
      if (Math.abs(dx) > (chase ? K.reach * 0.6 : 4)) {
        e.x = Math.max(e.x0, Math.min(e.x1, e.x + Math.sign(dx) * Math.min(Math.abs(dx), K.spd * dt)));
        e.dir = dx > 0 ? 1 : -1;
      }
      if (chase && Math.abs(t.x - e.x) <= K.reach + (K.w + 30) / 2 && Math.abs(t.feet - e.floorY) < 120 && now - e.atk >= ADV.atkCd) {
        e.atk = now;
        io.to(room).emit('advAtk', { e: e.id, t: t.id });
        hurt(st, room, t.id, e.dmg, t.x >= e.x ? 1 : -1);
      }
      // оборона: дошёл до кристалла — бьёт его и пропадает
      if (a.v === 'defense' && Math.abs(e.x - a.core.x) < a.core.w / 2 + 10) {
        a.core.hp = Math.max(0, a.core.hp - K.core);
        e.hp = 0;
        io.to(room).emit('advCore', { hp: a.core.hp, max: a.core.max, e: e.id });
        if (a.core.hp <= 0) return finish(st, room, false);
      }
    });
    if (a.over) return;
    bossTick(st, room, ps, now);
    a.en = a.en.filter(e => e.hp > 0);
    io.to(room).emit('advEn', { list: a.en.map(e => [e.id, e.k, Math.round(e.x), Math.round(e.y), e.dir, e.hp, e.max]) });
    // выбитые возвращаются
    a.down.forEach((t, id) => { if (now >= t) revive(st, room, id); });
    if (a.v === 'defense') waveCheck(st, room);
  }
  /* Босс: каждые ADV.slamEvery бьёт о землю — через ADV.slamWarn задевает всех на полу рядом
     (кто в прыжке — цел); на половине здоровья зовёт на помощь двух скелетов. */
  function bossTick(st, room, ps, now) {
    const a = st.adv, b = a.en.find(e => e.k === 'boss' && e.hp > 0);
    if (!b) return;
    if (!a.bossHalf && b.hp <= b.max / 2) {
      a.bossHalf = true;
      [-160, 160].forEach(o => spawn(st, 'skeleton', Math.max(b.x0, Math.min(b.x1, b.x + o)), b.floorY, b.x0, b.x1));
      io.to(room).emit('advBossCall', { e: b.id });
    }
    if (!a.slam && (!b.slamAt || now - b.slamAt >= ADV.slamEvery) && ps.some(p => Math.abs(p.feet - b.floorY) < 240)) {
      b.slamAt = now;
      a.slam = { x: b.x, at: now + ADV.slamWarn, y: b.floorY };
      io.to(room).emit('advSlam', { e: b.id, x: Math.round(b.x), ms: ADV.slamWarn, r: ADV.slamR });
    }
    if (a.slam && now >= a.slam.at) {
      const s = a.slam;
      a.slam = null;
      players(st, room).forEach((p) => {
        if (Math.abs(p.x - s.x) <= ADV.slamR && Math.abs(p.feet - s.y) < 10) hurt(st, room, p.id, ADV.slamDmg, p.x >= s.x ? 1 : -1);
      });
    }
  }
  function hurt(st, room, id, dmg, dir) {
    const a = st.adv;
    if (a.down.has(id) || a.over) return;
    const hp = Math.max(0, (a.hp.get(id) || 0) - dmg);
    a.hp.set(id, hp);
    io.to(room).emit('advHp', { id, hp, kx: dir * 8, ky: -5 });
    if (hp > 0) return;
    a.down.set(id, Date.now() + ADV.respawn);
    io.to(room).emit('advDown', { id, name: nameOf(id), ms: ADV.respawn });
    // в башне выбыли все разом — поражение
    if (a.v === 'quest' && hsMembers(room).every(m => a.down.has(m.id))) finish(st, room, false);
  }
  function startPoint(st) {
    const a = st.adv;
    return a.v === 'quest' ? a.meta.floors[a.floor].start : a.meta.start;
  }
  function revive(st, room, id) {
    const a = st.adv;
    a.down.delete(id);
    a.hp.set(id, a.max.get(id) || 100);
    io.to(room).emit('advUp', { id, hp: a.hp.get(id), at: startPoint(st) });
  }

  /* ---------- атаки игроков ---------- */
  function alive(st, id) { const a = st.adv; return !!a && !a.down.has(id) && (a.hp.get(id) || 0) > 0; }
  // выстрел — только картинка для остальных (стрела, огненный шар); урон — в hit
  function shot(st, room, socket, data) {
    const a = st.adv, id = socket.id;
    if (!a || st.phase !== 'round' || a.over || !alive(st, id) || !data) return;
    const w = CLASSES[classOf(st, id)].w;
    if (data.w !== w || w === 'sword') return;
    socket.to(room).emit('advShot', { id, w, x: num(data.x, -1e5, 1e5), y: num(data.y, -1e5, 1e5), vx: num(data.vx, -3, 3), vy: num(data.vy, -3, 3) });
  }
  function hit(st, room, id, data) {
    const a = st.adv;
    if (!a || st.phase !== 'round' || a.over || !alive(st, id) || !data) return;
    const w = CLASSES[classOf(st, id)].w, W = WPN[w];
    if (data.w !== w) return;                                   // оружие только своего класса
    const e = a.en.find(x => x.id === Math.floor(num(data.e, 0, 1e9)) && x.hp > 0);
    const p = posOf(id);
    if (!e || !p) return;
    // одна перезарядка на выстрел/взмах: меч задевает всех рядом, стрела и шар — одного
    const sid = Math.floor(num(data.sid, 0, 1e9)), now = Date.now();
    let s = a.shots.get(id);
    if (!s || s.sid !== sid) {
      if (now - (a.last.get(id) || 0) < W.cd * 0.8) return;
      a.last.set(id, now);
      s = { sid, hit: new Set() };
      a.shots.set(id, s);
    }
    if (s.hit.has(e.id) || (w !== 'sword' && s.hit.size)) return;
    const K = KINDS[e.k], cx = p.x + (p.w || 30) / 2, cy = p.y + (p.h || 100) / 2;
    const ex = e.x, ey = e.y - K.h / 2;
    if (Math.abs(cx - ex) > W.reach + K.w / 2 + 40 || Math.abs(cy - ey) > (w === 'sword' ? 140 + K.h / 2 : W.reach)) return;
    s.hit.add(e.id);
    damage(st, room, e, W.dmg, id);
    if (w === 'fire') a.en.forEach((o) => {
      if (o !== e && o.hp > 0 && Math.abs(o.x - e.x) < W.splash && Math.abs(o.y - e.y) < W.splash) damage(st, room, o, Math.round(W.dmg / 2), id);
    });
  }
  function damage(st, room, e, dmg, by) {
    e.hp = Math.max(0, e.hp - dmg);
    io.to(room).emit('advEnHp', { e: e.id, hp: e.hp, by });
    if (e.hp > 0) return;
    const a = st.adv;
    a.kills.set(by, (a.kills.get(by) || 0) + 1);
    io.to(room).emit('advDie', { e: e.id, k: e.k, by, name: nameOf(by) });
    if (a.v === 'quest' && a.en.every(x => x.hp <= 0)) floorClear(st, room);
  }
  // этаж зачищен: люк наверх открыт, следующий этаж заселён; последний — победа
  function floorClear(st, room) {
    const a = st.adv, f = a.meta.floors[a.floor];
    if (a.floor >= a.meta.floors.length - 1) return finish(st, room, true);
    if (f.gate) a.gates.push(f.gate);
    a.floor++;
    io.to(room).emit('advGate', { gate: f.gate, floor: a.floor + 1, of: a.meta.floors.length });
    a.en = a.en.filter(e => e.hp > 0);
    spawnFloor(st, a.floor);
  }
  function waveCheck(st, room) {
    const a = st.adv;
    if (a.wave < 0 || a.queue.length || a.en.some(e => e.hp > 0) || a.waitWave) return;
    if (a.wave >= a.waves.length - 1) return finish(st, room, true);
    a.waitWave = true;
    io.to(room).emit('advWaveClear', { n: a.wave + 1, of: a.waves.length, ms: ADV.waveGap });
    later(st, ADV.waveGap, () => { a.waitWave = false; startWave(st, room, a.wave + 1); });
  }
  // маг лечит всех рядом с собой (и себя)
  function heal(st, room, id) {
    const a = st.adv;
    if (!a || st.phase !== 'round' || a.over || !alive(st, id) || classOf(st, id) !== 'mage') return;
    const now = Date.now();
    if (now - (a.healAt.get(id) || 0) < HEAL.cd * 0.9) return;
    a.healAt.set(id, now);
    const me = posOf(id);
    if (!me) return;
    io.to(room).emit('advHeal', { id, r: HEAL.r });
    hsMembers(room).forEach((m) => {
      const p = posOf(m.id);
      if (!p || !alive(st, m.id) || Math.hypot(p.x - me.x, p.y - me.y) > HEAL.r) return;
      const hp = Math.min(a.max.get(m.id), a.hp.get(m.id) + HEAL.amt);
      a.hp.set(m.id, hp);
      io.to(room).emit('advHp', { id: m.id, hp, heal: true });
    });
  }

  /* ---------- итог ---------- */
  function finish(st, room, win) {
    const a = st.adv;
    if (a.over) return;
    a.over = true; a.win = win;
    clearInterval(a.tickT);
    io.to(room).emit('advEnd', { win });
    endEarly(room, st);
  }
  function reveal(st, room) {
    const a = st.adv;
    if (!a) return false;
    const kills = Array.from(a.kills.entries()).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([id, k]) => ({ name: nameOf(id), k }));
    io.to(room).emit('hsReveal', { variant: a.v, win: !!a.win, floor: a.floor + 1, floors: a.meta.floors ? a.meta.floors.length : 0,
      wave: a.wave + 1, waves: a.waves ? a.waves.length : 0, core: a.core ? a.core.hp : 0, kills });
    return true;
  }
  // победа — монеты и очко режима всем, кто был в команде до конца
  function award(st, room) {
    const a = st.adv;
    if (!a || !a.win) return;
    hsMembers(room).forEach((m) => {
      if (!a.hp.has(m.id)) return;
      const sock = io.sockets.sockets.get(m.id);
      const acct = sock && sessionName(sock.handshake.headers.cookie);
      if (!acct) return;
      credit(sock, acct, 2 + Math.floor(Math.random() * 5), 'hsWin');
      creditScore(acct);
    });
  }
  function join(st, room, id) {
    const a = st.adv;
    if (!a || st.phase !== 'round') return;
    addPlayer(st, id);
    io.to(room).emit('advHp', { id, hp: a.hp.get(id), max: a.max.get(id) });
    io.to(id).emit('advUp', { id, hp: a.hp.get(id), at: startPoint(st) });
  }
  function leave(st, room, id) {
    const a = st.adv;
    if (!a) return;
    a.hp.delete(id); a.max.delete(id); a.down.delete(id);
  }
  // всё, что нужно клиенту: при старте раунда (hsPhase) и вошедшему посреди (hsState)
  function state(st) {
    const a = st.adv;
    if (!a) return null;
    const obj = (m) => { const o = {}; m.forEach((v, k) => { o[k] = v; }); return o; };
    return { v: a.v, hp: obj(a.hp), max: obj(a.max), down: Array.from(a.down.keys()), kills: obj(a.kills),
             en: a.en.filter(e => e.hp > 0).map(e => [e.id, e.k, Math.round(e.x), Math.round(e.y), e.dir, e.hp, e.max]),
             floor: a.floor + 1, floors: a.meta.floors ? a.meta.floors.length : 0, gates: a.gates.slice(),
             allGates: a.meta.floors ? a.meta.floors.map(f => f.gate).filter(Boolean) : [],
             core: a.core, wave: a.wave + 1, waves: a.waves ? a.waves.length : 0, cls: obj(st.advClass || new Map()) };
  }
  return { isAdv, parseMap, pick, roundMs, classes, classOf, pickClass, start, lobby, tick, shot, hit, heal, reveal, award, join, leave,
           state, KINDS, CLASSES, WPN, HEAL };
};
module.exports.isAdv = isAdv;
module.exports.parseMap = parseMap;
