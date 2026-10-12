/* Платформа не должна протаскивать игрока сквозь соседние объекты.
   Баг-репорт: "платформа может выносить/уносить игрока за объекты".

   Сдвиг от поездки на платформе применяется одним присваиванием
   (pl.x += platform._dx) — обычный разбор столкновений после этого видит
   только итоговую позицию, а не путь до неё. Быстрая или размашистая
   платформа перепрыгивала тонкую стену на пути насквозь, ни разу не
   пересёкшись с ней ни «до», ни «после». Проверяем через clampRideDelta
   (см. game.html/editor.html): игрока, которого платформа тащит прямо в
   стену, должно остановить у стены, а не перенести на другую сторону. */
'use strict';
const { makeEngine, obj } = require('./harness.js');

const GY = 520;

// Платформа стартует у x=200 и на первом же кадре сдвигается к середине
// своего хода (синусоида: k=0.5 при t=0) — большой прыжок сквозь стену,
// если её не резать на шаги.
function ridesIntoWall(target) {
  const floor = obj('rect', -600, GY, 4000, 80, { id: 1 });
  const platform = obj('rect', 200, GY - 20, 80, 20, { id: 2, moves: true, moveX: 900, moveY: 0, speed: 10 });
  const wall = obj('rect', 400, GY - 300, 6, 300, { id: 3 });   // тонкая стена между стартом и целью прыжка
  const E = makeEngine(target);
  E.setObjects([floor, platform, wall]);
  E.setSpawn(0, 0);
  E.startRun();
  const p = E.pl();
  // сажаем игрока на платформу в её текущей позиции — как будто уже стоял,
  // когда качели вот-вот пошли вперёд
  p.x = platform.x + 30; p.y = platform.y - p.h; p.vx = 0; p.vy = 0;
  p.ground = true; p.rideOn = platform; p.standPlat = platform;
  let crossed = false;
  for (let i = 0; i < 40; i++) {
    const before = p.x;
    E.step();
    if (before < 400 && p.x > 406) crossed = true;
  }
  return { crossed, finalX: p.x, embedded: p.x + p.w > 400 && p.x < 406 };
}

let fail = 0;
function ok(label, cond) { console.log((cond ? '✓ ' : '✗ ') + label); if (!cond) fail++; }

for (const target of [__dirname + '/game.html', __dirname + '/editor.html']) {
  const engine = target.endsWith('editor.html') ? 'editor.html' : 'game.html';
  const r = ridesIntoWall(target);
  ok(engine + ': платформа не протаскивает игрока сквозь тонкую стену', !r.crossed, 'finalX=' + r.finalX.toFixed(1));
  ok(engine + ': игрока не заклинивает внутри стены', !r.embedded, 'finalX=' + r.finalX.toFixed(1));
}

console.log(fail ? ('\n' + fail + ' ошибок') : '\nвсё чисто');
process.exit(fail ? 1 : 0);
