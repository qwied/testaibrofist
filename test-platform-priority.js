/* Игрок должен физически стоять на той платформе, которую видит на
   экране, — не на случайной другой, если под ногами наложены две
   платформы. Баг-репорт: "опять я летаю на другой платформе, когда я
   на другой" — игрока переносило по движению НЕ той платформы, на
   которой он визуально стоит.

   Причина: если две платформы занимают одно и то же место (частый
   способ сделать буст-полосу — положить её ПОВЕРХ обычного пола, не
   вырезая под неё дыру), цикл столкновений в step() отдаёт pl.rideOn/
   pl.standPlat первой платформе, какую случайно разберёт, — а не той,
   что реально сверху по z-порядку (см. platform-priority-фикс в step():
   пересчёт после цикла по objects.indexOf). Здесь гоняем именно сценарий
   с движущейся платформой под/над статичной. */
'use strict';
const { makeEngine, obj } = require('./harness.js');

const GY = 520;

// Двигающаяся платформа ниже статичной по z-порядку (индекс в objects[]
// меньше) — статичная должна перекрывать её: игрок остаётся на месте.
function ridesStaticOnTop(target) {
  const mover = obj('rect', -600, GY, 4000, 80, { id: 1, moves: true, moveX: 300, moveY: 0, speed: 4 });
  const still = obj('rect', -600, GY, 4000, 80, { id: 2 });
  const E = makeEngine(target);
  E.setObjects([mover, still]);   // still — последний в массиве, значит визуально сверху
  E.setSpawn(120, GY - 80);
  E.startRun();
  for (let i = 0; i < 10; i++) E.step();
  const x0 = E.pl().x;
  for (let i = 0; i < 40; i++) E.step();
  return Math.abs(E.pl().x - x0);
}

// Та же пара, но движущаяся платформа теперь сверху по z-порядку —
// игрок должен поехать вместе с ней.
function ridesMoverOnTop(target) {
  const still = obj('rect', -600, GY, 4000, 80, { id: 1 });
  const mover = obj('rect', -600, GY, 4000, 80, { id: 2, moves: true, moveX: 300, moveY: 0, speed: 4 });
  const E = makeEngine(target);
  E.setObjects([still, mover]);   // mover — последний в массиве, значит визуально сверху
  E.setSpawn(120, GY - 80);
  E.startRun();
  for (let i = 0; i < 10; i++) E.step();
  const x0 = E.pl().x;
  for (let i = 0; i < 40; i++) E.step();
  return Math.abs(E.pl().x - x0);
}

let fail = 0;
function ok(label, cond) { console.log((cond ? '✓ ' : '✗ ') + label); if (!cond) fail++; }

for (const target of [__dirname + '/game.html', __dirname + '/editor.html']) {
  const engine = target.endsWith('editor.html') ? 'editor.html' : 'game.html';
  ok(engine + ': статичная платформа сверху перекрывает движущуюся под ней',
      ridesStaticOnTop(target) < 1);
  ok(engine + ': движущаяся платформа сверху реально катает игрока',
      ridesMoverOnTop(target) > 20);
}

console.log(fail ? ('\n' + fail + ' ошибок') : '\nвсё чисто');
process.exit(fail ? 1 : 0);
