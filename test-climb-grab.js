/* Захват уступа и сторож застревания: игрока не должны «телепортировать»
   и подбрасывать обычные объекты.
   - Хвататься можно только за настоящую кромку (ровно стоящий
     неподвижный блок) — не за круг, треугольник, наклонный или
     вращающийся блок: у них «верх» был верхом описанного прямоугольника.
   - Залезание идёт плавно, а не переносом на всю высоту игрока за кадр.
   - После залезания зажатая кнопка прыжка не подбрасывает игрока сразу.
   - Если над кромкой нет места — не хватаемся (иначе выталкивало).
   - Сторож застревания не уносит на спавн игрока, который прыгает на
     высокий блок со стрелкой, но по-прежнему спасает того, кто держит
     только прыжок на месте.
   Запуск: node test-climb-grab.js [editor] */
'use strict';
const { makeEngine, obj } = require('./harness.js');
const TARGET = process.argv[2] === 'editor' ? 'editor.html' : 'game.html';
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

// 1. Ровный блок 150 высотой: прыжок со стрелкой у стены — хватается и залезает
{
  let grabbed = false, maxStep = 0, climbFrames = 0, climbed = false;
  run([floor(), obj('rect', 600, GROUND - 150, 200, 150)], [560, GROUND - 100], 200,
    () => ({ r: true, u: true, l: false }),
    (f, pl, x0, y0) => {
      if (pl.grab) grabbed = true;
      if (pl.climb) { climbFrames++; maxStep = Math.max(maxStep, Math.abs(pl.y - y0)); }
      if (!climbed && pl.ground && pl.y + pl.h <= GROUND - 150 + 0.5) climbed = true;
    });
  ok('за кромку ровного блока хватается', grabbed);
  ok('залезание плавное: несколько кадров, не больше 14 px за кадр', climbFrames >= 5 && maxStep <= 14.01, climbFrames + ' кадров, шаг ' + maxStep.toFixed(1));
  ok('в итоге стоит на блоке', climbed);
}

// 2. После залезания зажатый прыжок не подбрасывает, после отпускания — прыгает
{
  let doneAt = -1, rejump = false, jumpedAfterRelease = false;
  run([floor(), obj('rect', 600, GROUND - 150, 200, 150)], [560, GROUND - 100], 160,
    (f) => ({ r: doneAt < 0, l: false, u: doneAt < 0 || f < doneAt + 30 || f >= doneAt + 32 }),
    (f, pl) => {
      if (doneAt < 0 && pl.ground && pl.y + pl.h <= GROUND - 150 + 0.5) doneAt = f;
      else if (doneAt >= 0 && f < doneAt + 30 && pl.vy < -5) rejump = true;
      else if (doneAt >= 0 && f >= doneAt + 32 && pl.vy < -5) jumpedAfterRelease = true;
    });
  ok('после залезания зажатый прыжок сам не подбрасывает', doneAt >= 0 && !rejump);
  ok('отпустил и нажал снова — прыгает как обычно', jumpedAfterRelease);
}

// 3. Не настоящая кромка: круг, треугольник, наклонный и вращающийся блок
[['circle', {}], ['triangle', {}], ['rect', { rot: 30 }], ['rect', { spins: true, spin: 2 }], ['rect', { moves: true, moveX: 0, moveY: 40 }]].forEach(([type, props]) => {
  let grabbed = false, maxDy = 0;
  run([floor(), obj(type, 600, GROUND - 150, 150, 150, props)], [560, GROUND - 100], 240,
    (f) => ({ r: f % 90 < 60, l: f % 90 >= 60, u: true }),
    (f, pl, x0, y0) => { if (pl.grab) grabbed = true; maxDy = Math.max(maxDy, Math.abs(pl.y - y0)); });
  ok('не хватается за ' + type + (props.rot ? ' rot' + props.rot : props.spins ? ' вращающийся' : props.moves ? ' движущийся' : '') + ', рывков по Y > 45 px нет', !grabbed && maxDy <= 45, 'макс. сдвиг ' + maxDy.toFixed(1));
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
