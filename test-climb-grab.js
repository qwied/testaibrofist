/* Захват уступа (выключен) и сторож застревания: игрока не должны «телепортировать»
   и подбрасывать обычные объекты.
   - За кромку не хватаются вообще: от бока объекта нельзя ни оттолкнуться, ни залезть
     по нему (LEDGE_GRAB = false в game.html) — на блок только запрыгивают.
   - Тем более не за круг, треугольник, наклонный или вращающийся блок.
   - Если над кромкой нет места — не хватаемся (иначе выталкивало).
   - Сторож застревания не уносит на спавн игрока, который прыгает на
     высокий блок со стрелкой, но по-прежнему спасает того, кто держит
     только прыжок на месте.
   Запуск: node test-climb-grab.js [editor] */
'use strict';
const { makeEngine, obj } = require('./harness.js');
const TARGET = process.argv[2] === 'editor' ? 'editor.html' : 'game.html';
// темп движения (TEMPO в game.html): подъём и прыжок быстрее во столько же раз
const TEMPO = +((require('fs').readFileSync(__dirname + '/' + TARGET, 'utf8').match(/var TEMPO = ([\d.]+);/) || [0, 1])[1]);
const GROUND = 520;
let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };

function run(objs, spawn, frames, input, onFrame) {
  const E = makeEngine(TARGET);
  objs.forEach((o, i) => { o.id = i + 1; });
  E.setObjects(objs);
  E.setSpawn(spawn[0], spawn[1]);
  E.startRun();
  const pl = E.pl(), keys = E.keys();
  for (let f = 0; f < frames; f++) {
    Object.assign(keys, input(f));
    const x0 = pl.x, y0 = pl.y;
    E.step();
    if (onFrame) onFrame(f, pl, x0, y0, E);
  }
  return { E, pl };
}
const floor = () => obj('rect', -2000, GROUND, 6000, 80);

console.log(TARGET + ':');

// 1. Ровный блок 150 высотой (выше прыжка): прыжки в его бок не дают ни повиснуть на кромке,
//    ни залезть — от бока объекта нельзя оттолкнуться или подняться по нему (так попросили)
{
  let grabbed = false, climbed = false, onTop = false;
  run([floor(), obj('rect', 600, GROUND - 150, 200, 150)], [560, GROUND - 100], 300,
    () => ({ r: true, u: true, l: false }),
    (f, pl) => {
      if (pl.grab) grabbed = true;
      if (pl.climb) climbed = true;
      if (pl.ground && pl.y + pl.h <= GROUND - 150 + 0.5) onTop = true;
    });
  ok('за кромку не хватается', !grabbed);
  ok('по боку не залезает', !climbed);
  ok('на блок выше прыжка из-под бока не попасть', !onTop);
}

// 2. Обычный прыжок с пола у стены работает как всегда
{
  let jumped = false;
  run([floor(), obj('rect', 600, GROUND - 150, 200, 150)], [560, GROUND - 100], 60,
    (f) => ({ r: true, l: false, u: f > 20 && f < 24 }),
    (f, pl) => { if (pl.vy < -5) jumped = true; });
  ok('с пола у стены прыгает как обычно', jumped);
}

// 3. Не настоящая кромка: круг, треугольник, наклонный и вращающийся блок
[['circle', {}], ['triangle', {}], ['rect', { rot: 30 }], ['rect', { spins: true, spin: 2 }], ['rect', { moves: true, moveX: 0, moveY: 40 }]].forEach(([type, props]) => {
  let grabbed = false, maxDy = 0;
  run([floor(), obj(type, 600, GROUND - 150, 150, 150, props)], [560, GROUND - 100], 240,
    (f) => ({ r: f % 90 < 60, l: f % 90 >= 60, u: true }),
    (f, pl, x0, y0) => { if (pl.grab) grabbed = true; maxDy = Math.max(maxDy, Math.abs(pl.y - y0)); });
  ok('не хватается за ' + type + (props.rot ? ' rot' + props.rot : props.spins ? ' вращающийся' : props.moves ? ' движущийся' : '') + ', рывков по Y > ' + Math.round(45 * TEMPO) + ' px нет', !grabbed && maxDy <= 45 * TEMPO, 'макс. сдвиг ' + maxDy.toFixed(1));
});

// 4. Над кромкой занято (низкий потолок) — не хватаемся
{
  let grabbed = false;
  run([floor(), obj('rect', 600, GROUND - 150, 200, 150), obj('rect', 560, GROUND - 230, 300, 20)], [560, GROUND - 100], 160,
    () => ({ r: true, u: true, l: false }),
    (f, pl) => { if (pl.grab || pl.climb) grabbed = true; });
  ok('над кромкой нет места — не хватается и не залезает', !grabbed);
}

// 5. Сторож застревания (прятки)
{
  // высокий блок, на который не допрыгнуть: прыжок + стрелка 7 секунд
  let respawned = false;
  const r = run([floor(), obj('rect', 600, GROUND - 300, 200, 300)], [400, GROUND - 100], 20, () => ({ r: true, u: true, l: false }));
  r.E.setSpawn(100, GROUND - 100);        // если сторож сработает — улетит сюда
  for (let f = 0; f < 420; f++) { const x0 = r.pl.x; r.E.step(); if (r.pl.x < 300 && x0 > 500) respawned = true; }
  ok('прыгает на высокий блок со стрелкой — сторож не уносит на спавн', !respawned && r.pl.x > 500, 'x=' + r.pl.x.toFixed(1));

  // прежний случай (v1): держит только прыжок на месте — сторож спасает, как и раньше
  let rescued = false;
  const q = run([floor()], [700, GROUND - 100], 5, () => ({ u: true, l: false, r: false }));
  q.E.setSpawn(100, GROUND - 100);
  for (let f = 0; f < 420; f++) { q.E.step(); if (q.pl.x < 200) rescued = true; }
  ok('держит только прыжок на месте 7 с — сторож по-прежнему возвращает', rescued);
}

console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
process.exit(fails ? 1 : 0);
