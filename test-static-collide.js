/* Телепорт на НЕПОДВИЖНОЙ геометрии. Существующие детекторы гоняют
   движущиеся платформы; этот перебирает статичные блоки: разные углы
   подхода, скорости, повороты фигур и стыки блоков. Ищем любой сдвиг
   игрока за один кадр больше физически возможного. */
'use strict';
const { makeEngine, obj } = require('./harness.js');
const TARGET = process.argv[2] || (__dirname + '/game.html');

const MAXVX = 5.2 * Math.sqrt(9 * 0.062 / 0.62);   // ~4.93 собственный бег
const MAXFALL = 12 + 9 * 0.8;                      // 19.2 предел падения
const STEP_UP = 16;                                // законный шаг на уступ
const LIMX = MAXVX + MAXVX + 8.5;   // свой шаг за кадр + одна законная поправка выталкивания
const LIMY = MAXFALL + STEP_UP + 2.5;   // падение + законный уступ

const GY = 520;
const ground = () => obj('rect', -600, GY, 4000, 80);

let bad = [], runs = 0;

function run(name, objs, spawn, drive, frames) {
  runs++;
  objs.forEach((o, i) => { o.id = i + 1; });
  const E = makeEngine(TARGET);
  E.setObjects(objs);
  E.setSpawn(spawn[0], spawn[1]);
  E.startRun();
  for (let i = 0; i < 6; i++) E.step();
  let worstX = 0, worstY = 0, wf = -1;
  for (let f = 0; f < frames; f++) {
    if (drive) drive(f, E.keys());
    const x0 = E.pl().x, y0 = E.pl().y;
    E.step();
    const dx = Math.abs(E.pl().x - x0), dy = Math.abs(E.pl().y - y0);
    if (dx > worstX) { worstX = dx; }
    if (dy > worstY) { worstY = dy; }
    if ((dx > LIMX || dy > LIMY) && wf < 0) wf = f;
  }
  if (worstX > LIMX || worstY > LIMY)
    bad.push({ name, worstX: +worstX.toFixed(1), worstY: +worstY.toFixed(1), frame: wf });
  return { worstX, worstY };
}

const hold = (k) => (f, keys) => { keys[k] = true; };
const holdJump = (k) => (f, keys) => { keys[k] = true; keys.u = (f % 18) < 3; };

// 1. бег в стену разной толщины и высоты
for (const w of [10, 20, 60, 200, 900]) {
  for (const h of [10, 20, 40, 120, 400]) {
    run(`бег в блок ${w}x${h}`, [ground(), obj('rect', 300, GY - h, w, h)], [120, GY - 80], hold('r'), 90);
    run(`бег в блок ${w}x${h} слева`, [ground(), obj('rect', 100, GY - h, w, h)], [400, GY - 80], hold('l'), 90);
  }
}
// 2. прыжки в блок под разными углами
for (const h of [20, 60, 140, 300]) {
  run(`прыжки в стену h=${h}`, [ground(), obj('rect', 300, GY - h, 40, h)], [120, GY - 80], holdJump('r'), 140);
  run(`прыжки в потолок h=${h}`, [ground(), obj('rect', 150, GY - 200, 400, h)], [200, GY - 80], holdJump('r'), 140);
}
// 3. повёрнутые фигуры (склоны) — spanX/spanY считаются по полигону
for (const rot of [10, 30, 45, 60, 80, 120, 200, 315]) {
  run(`склон rot=${rot}`, [ground(), obj('rect', 280, GY - 90, 200, 40, { rot })], [120, GY - 80], hold('r'), 120);
  run(`склон rot=${rot} прыжком`, [ground(), obj('rect', 280, GY - 90, 200, 40, { rot })], [120, GY - 80], holdJump('r'), 140);
}
// 4. стык двух блоков вплотную и с микрозазором
for (const gap of [-2, -0.5, 0, 0.5, 2, 6]) {
  run(`стык блоков зазор ${gap}`, [ground(),
    obj('rect', 300, GY - 40, 100, 40), obj('rect', 400 + gap, GY - 40, 100, 40)],
    [120, GY - 80], hold('r'), 120);
  run(`стык колонн зазор ${gap}`, [ground(),
    obj('rect', 300, GY - 300, 60, 300), obj('rect', 360 + gap, GY - 300, 60, 300)],
    [120, GY - 80], hold('r'), 120);
}
// 5. узкая щель между полом и потолком (игрок 20x60)
for (const slot of [40, 58, 60, 62, 70]) {
  run(`щель ${slot}px`, [ground(), obj('rect', 260, GY - 400, 500, 400 - slot)],
    [120, GY - 80], hold('r'), 120);
}
// 6. круги и треугольники
for (const t of ['circle', 'triangle']) {
  for (const s of [30, 80, 240]) {
    run(`${t} ${s}`, [ground(), obj(t, 300, GY - s, s, s)], [120, GY - 80], hold('r'), 110);
    run(`${t} ${s} прыжком`, [ground(), obj(t, 300, GY - s, s, s)], [120, GY - 80], holdJump('r'), 130);
  }
}
// 7. спавн ВНУТРИ статичного блока
for (const s of [40, 120, 400]) {
  run(`спавн внутри блока ${s}`, [ground(), obj('rect', 200, GY - s, s, s)], [200 + s / 2, GY - s / 2], null, 90);
}
// 8. падение с высоты на тонкую платформу и мимо неё
for (const drop of [200, 600, 1500, 4000]) {
  run(`падение ${drop} на плиту`, [ground(), obj('rect', 150, GY - 60, 300, 20)], [220, GY - 60 - drop], null, 200);
  run(`падение ${drop} впритык к краю`, [ground(), obj('rect', 150, GY - 60, 300, 20)], [449, GY - 60 - drop], null, 200);
}
// 9. лестница уступов ровно на STEP_UP и чуть выше
for (const st of [8, 15, 16, 17, 24, 40]) {
  const objs = [ground()];
  for (let i = 0; i < 8; i++) objs.push(obj('rect', 240 + i * 40, GY - st * (i + 1), 40, st * (i + 1)));
  run(`лестница ступень ${st}`, objs, [120, GY - 80], hold('r'), 200);
}

console.log('сценариев: ' + runs);
if (!bad.length) { console.log('✓ телепортов на статичной геометрии не найдено'); process.exit(0); }
console.log('✗ найдено подозрительных: ' + bad.length + '  (предел X ' + LIMX.toFixed(1) + ', Y ' + LIMY.toFixed(1) + ')');
bad.sort((a, b) => (b.worstX + b.worstY) - (a.worstX + a.worstY));
bad.slice(0, 25).forEach(b => console.log('   ' + b.name.padEnd(34) + ' dX=' + String(b.worstX).padStart(7) + '  dY=' + String(b.worstY).padStart(7) + '  кадр ' + b.frame));
process.exit(1);
