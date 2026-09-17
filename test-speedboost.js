/* Бустеры (множитель скорости платформы, см. platBoost() в game.html/
   editor.html). Проверяем, что стоя на платформе с speedMul игрок реально
   бежит быстрее/медленнее базовой скорости, а без speedMul — как обычно,
   и что множитель применяется одинаково в игре и в редакторе. */
'use strict';
const { makeEngine, obj } = require('./harness.js');

const MAXVX = 5.2 * Math.sqrt(9 * 0.062 / 0.62);   // ~4.93 базовый бег
const GY = 520;

function topSpeed(target, speedMul, frames) {
  const ground = obj('rect', -600, GY, 4000, 80, speedMul !== undefined ? { speedMul } : {});
  const E = makeEngine(target);
  E.setObjects([ground]);
  E.setSpawn(120, GY - 80);
  E.startRun();
  for (let i = 0; i < 6; i++) E.step();
  E.keys().r = true;
  let vx = 0;
  for (let f = 0; f < (frames || 20); f++) { E.step(); vx = E.pl().vx; }
  return vx;
}

let fail = 0;
function ok(label, cond) { console.log((cond ? '✓ ' : '✗ ') + label); if (!cond) fail++; }

// Буст-полоса, наложенная поверх обычного пола (тот же прямоугольник в
// том же месте) — обычный способ сделать «бустер» в редакторе, не вырезая
// дыру в существующем полу. Раньше первая же платформа, какую разбирал
// цикл столкновений, «съедала» пересечение — вторая с той же гранью
// больше не проходила проверку bbox, и до pl.rideOn/pl.standPlat она не
// доходила никогда, независимо от того, что реально видно на экране.
function overlayTop(target, plainFirst) {
  const plain = obj('rect', -600, GY, 4000, 80, { id: 1 });
  const boost = obj('rect', -600, GY, 4000, 80, { id: 2, speedMul: 2 });
  const E = makeEngine(target);
  E.setObjects(plainFirst ? [plain, boost] : [boost, plain]);
  E.setSpawn(120, GY - 80);
  E.startRun();
  for (let i = 0; i < 6; i++) E.step();
  E.keys().r = true;
  let vx = 0;
  for (let f = 0; f < 12; f++) { E.step(); vx = E.pl().vx; }   // широкая платформа — с неё не убежать за 12 кадров
  return vx;
}

for (const target of [__dirname + '/game.html', __dirname + '/editor.html']) {
  const engine = target.endsWith('editor.html') ? 'editor.html' : 'game.html';

  const base = topSpeed(target, undefined);
  ok(engine + ': без speedMul — обычная скорость', Math.abs(base - MAXVX) < 0.05);

  const boosted = topSpeed(target, 2);   // x2 -> множитель 1+2 = 3
  ok(engine + ': speedMul=2 (x2) утраивает скорость', Math.abs(boosted - MAXVX * 3) < 0.05);

  const slowed = topSpeed(target, -0.5);   // -x0.5 -> множитель 1-0.5 = 0.5
  ok(engine + ': speedMul=-0.5 (-x0.5) вдвое медленнее', Math.abs(slowed - MAXVX * 0.5) < 0.05);

  const floored = topSpeed(target, -5);   // 1-5 = -4, должно быть зажато полом 0.05
  ok(engine + ': сильное замедление не разворачивает игрока', floored > 0 && floored < MAXVX * 0.1);

  // z-порядок — по позиции в objects[], а не по id: последний в массиве
  // (визуально верхний слой) всегда решает, что чувствует игрок под ногами.
  ok(engine + ': буст-полоса, добавленная поверх пола (в конце массива), работает',
      Math.abs(overlayTop(target, true) - MAXVX * 3) < 0.05);
  ok(engine + ': пол, отправленный «На перед» поверх буст-полосы, гасит буст',
      Math.abs(overlayTop(target, false) - MAXVX) < 0.05);
}

console.log(fail ? ('\n' + fail + ' ошибок') : '\nвсё чисто');
process.exit(fail ? 1 : 0);
