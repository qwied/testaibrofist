/* Детектор телепорта: перебирает сценарии «платформа наезжает на игрока»
   и ищет любой сдвиг игрока за кадр больше, чем ход платформы + максимум
   собственного бега. Такой сдвиг глаз видит как телепорт.
   Запуск: node test-teleport-sweep.js [v92|v93] */
'use strict';
const { makeEngine, obj } = require('./harness.js');

const TARGET = process.argv[2] === 'v92' ? 'game.v92.bak.html' : (process.argv[2] === 'editor' ? 'editor.html' : 'game.html');
const GROUND_Y = 520;
const ground = () => obj('rect', -400, GROUND_Y, 3600, 80);

// максимум собственного бега/падения игрока (gravity 9)
const MAXVX = 5.2 * Math.sqrt(9 * 0.062 / 0.62);      // ≈ 4.93
const MAXFALL = 12 + 9 * 0.8;                          // 19.2

function platDX(o, frames){      // максимальный ход платформы по X за кадр
  let m = 0;
  for(let f = 1; f < frames; f++){
    const t1 = (f - 1) * 0.012 * (o.speed || 1), t2 = f * 0.012 * (o.speed || 1);
    const k1 = (Math.sin(t1) + 1) / 2, k2 = (Math.sin(t2) + 1) / 2;
    m = Math.max(m, Math.abs((o.moveX || 0) * (k2 - k1)), Math.abs((o.moveY || 0) * (k2 - k1)));
  }
  return m;
}

let violations = [];
function scenario(name, mkMap, spawn, input, frames){
  const E = makeEngine(TARGET);
  const objs = mkMap();
  objs.forEach((o, i) => { o.id = i + 1; });
  E.setObjects(objs);
  E.setSpawn(spawn[0], spawn[1]);
  E.startRun();
  for(let i = 0; i < 6; i++) E.step();
  const mover = objs.find(o => o.moves);
  /* Предел за кадр: ход платформы + собственный бег + одна законная
     поправка выталкивания (|vx| + 8, см. capX в game.html). Поправку
     стали учитывать с тех пор, как скорость берётся сразу в первом
     кадре: раньше на кадре 0 игрок ещё только разгонялся, и её запас
     прятался внутри +2.5. */
  const FIX = MAXVX + 8;
  const lim = mover ? platDX(mover, frames + 10) + MAXVX + FIX + 2.5 : 1e9;
  let worst = 0, wf = 0;
  for(let f = 0; f < frames; f++){
    if(input) input(f, E);
    const px = E.pl().x, py = E.pl().y;
    E.step();
    const p = E.pl();
    const dx = Math.abs(p.x - px), dy = Math.abs(p.y - py);
    if(p.dead || E.done()) break;
    if(dx > worst){ worst = dx; wf = f; }
    if(dy > worst + 60){ /* падение — не телепорт по X */ }
    if(dx > lim){ violations.push({ name, f, dx, dy, lim, x: p.x, y: p.y }); break; }
  }
  return { worst, wf, lim };
}

/* ═══ Перебор ═══ */
const SPEEDS = [1, 2, 3, 4, 5, 6, 8, 10];
const AMPS = [100, 200, 300, 400, 600, 800, 1200];
const THICK = [16, 24, 30, 60, 120];
console.log('Движок: ' + TARGET);

// 1) горизонтальная платформа наезжает на стоящего игрока (сцена из видео)
for(const sp of SPEEDS) for(const amp of AMPS) for(const th of THICK){
  const px = 900;
  scenario(`H-наезд sp=${sp} amp=${amp} th=${th}`,
    () => [ground(), obj('rect', 560, GROUND_Y - 50 - th + 10, 300, th, { moves: true, moveX: amp, speed: sp })],
    [px, GROUND_Y - 60], null, 150);
}

// 2) то же, навстречу (moveX отрицательный, платформа справа)
for(const sp of [4, 6, 8, 10]) for(const amp of [400, 800, 1200]){
  scenario(`H-наезд обратный sp=${sp} amp=${amp}`,
    () => [ground(), obj('rect', 1100, GROUND_Y - 50, 300, 30, { moves: true, moveX: -amp, speed: sp })],
    [860, GROUND_Y - 60], null, 150);
}

// 3) игрок идёт навстречу платформе / от неё
for(const sp of [4, 6, 8, 10]) for(const amp of [400, 800, 1200]){
  scenario(`H-игрок идёт вправо sp=${sp} amp=${amp}`,
    () => [ground(), obj('rect', 560, GROUND_Y - 50, 300, 30, { moves: true, moveX: amp, speed: sp })],
    [820, GROUND_Y - 60], (f, E) => { E.keys().r = true; }, 150);
  scenario(`H-игрок идёт влево sp=${sp} amp=${amp}`,
    () => [ground(), obj('rect', 560, GROUND_Y - 50, 300, 30, { moves: true, moveX: amp, speed: sp })],
    [1100, GROUND_Y - 60], (f, E) => { E.keys().l = true; }, 150);
}

// 4) диагональные платформы
for(const sp of [2, 4, 6, 8]) for(const amp of [200, 400, 800]){
  scenario(`диагональ вниз-вправо sp=${sp} amp=${amp}`,
    () => [ground(), obj('rect', 700, GROUND_Y - 210, 260, 24, { moves: true, moveX: amp, moveY: amp, speed: sp })],
    [880, GROUND_Y - 60], null, 170);
  scenario(`диагональ вверх-влево sp=${sp} amp=${amp}`,
    () => [ground(), obj('rect', 1100, GROUND_Y - 210, 260, 24, { moves: true, moveX: -amp, moveY: -amp, speed: sp })],
    [880, GROUND_Y - 60], null, 170);
}

// 5) вертикальные: опускается сверху / поднимается снизу, игрок прыгает
for(const sp of [2, 4, 6, 8]) for(const amp of [200, 400, 800]){
  scenario(`V-опускается sp=${sp} amp=${amp}`,
    () => [ground(), obj('rect', 820, GROUND_Y - 300, 300, 24, { moves: true, moveY: amp, speed: sp })],
    [900, GROUND_Y - 60], (f, E) => { E.keys().u = (f === 20 || f === 40); }, 170);
  scenario(`V-поднимается sp=${sp} amp=${amp}`,
    () => [ground(), obj('rect', 820, GROUND_Y - 24, 300, 24, { moves: true, moveY: -amp, speed: sp })],
    [900, GROUND_Y - 200], (f, E) => { E.keys().u = (f === 30); }, 170);
}

// 6) длинная платформа (ход за кадр больше ширины игрока — «швартующий» случай)
for(const sp of [6, 8, 10]) for(const w of [600, 900]){
  scenario(`широкая ${w} sp=${sp}`,
    () => [ground(), obj('rect', 300, GROUND_Y - 50, w, 24, { moves: true, moveX: 1200, speed: sp })],
    [900, GROUND_Y - 60], null, 160);
}

// 7) игрок стоит НА платформе, платформа резко меняет направление — не должно рвать
for(const sp of [6, 10]){
  scenario(`езда сверху sp=${sp}`,
    () => [ground(), obj('rect', 700, 400, 220, 24, { moves: true, moveX: 900, speed: sp })],
    [790, 340], null, 200);
}

// 8) зажатие между двумя встречными платформами
for(const sp of [4, 6, 8]){
  scenario(`тиски sp=${sp}`,
    () => [ground(),
      obj('rect', 500, GROUND_Y - 50, 200, 24, { moves: true, moveX: 500, speed: sp }),
      obj('rect', 1300, GROUND_Y - 50, 200, 24, { moves: true, moveX: -500, speed: sp })],
    [1000, GROUND_Y - 60], null, 200);
}

console.log('сценариев: ' + (violations.length ? '' : 'все чисто, ') + '');
if(violations.length){
  console.log('ТЕЛЕПОРТЫ НАЙДЕНЫ: ' + violations.length);
  for(const v of violations.slice(0, 30))
    console.log(`  ✗ ${v.name}: кадр ${v.f}, сдвиг ${v.dx.toFixed(1)} px (лимит ${v.lim.toFixed(1)}), игрок в (${v.x.toFixed(0)}, ${v.y.toFixed(0)})`);
  process.exit(1);
} else {
  console.log('✓ телепортов не найдено');
}
