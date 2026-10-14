/* Без включённого «Рикошета» объекты игрока не отбрасывают.
   - Упирается со стрелкой в крутой наклон или стену — стоит, а не
     отлетает назад против нажатой стрелки.
   - Стоит на наклоне без нажатий — его не сносит вбок.
   - Падает на обычный блок — не подпрыгивает вверх сам.
   - С включённым рикошетом отскок по-прежнему работает.
   Запуск: node test-no-bounce.js [editor] */
'use strict';
const { makeEngine, obj } = require('./harness.js');
const TARGET = process.argv[2] === 'editor' ? 'editor.html' : 'game.html';
const GROUND = 520;
let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };
const floor = () => obj('rect', -2000, GROUND, 6000, 80);
function engine(objs, spawn) {
  const E = makeEngine(TARGET);
  objs.forEach((o, i) => { o.id = i + 1; });
  E.setObjects(objs); E.setSpawn(spawn[0], spawn[1]); E.startRun();
  return E;
}
console.log(TARGET + ':');

// 1. Упор со стрелкой в крутые наклоны и стену: ни одного кадра движения назад
const shapes = [
  ['triangle 240 rot10', obj('triangle', 480, GROUND - 240, 240, 240, { rot: 10 })],
  ['triangle 240 rot70', obj('triangle', 480, GROUND - 240, 240, 240, { rot: 70 })],
  ['rect 160x40 rot60',  obj('rect', 520, GROUND - 120, 160, 40, { rot: 60 })],
  ['circle 160x40 rot70', obj('circle', 520, GROUND - 120, 160, 40, { rot: 70 })],
  ['circle 240',         obj('circle', 480, GROUND - 240, 240, 240)],
  ['стена',              obj('rect', 600, GROUND - 300, 40, 300)]
];
shapes.forEach(([name, o]) => {
  [['справа налево', 900, 'l'], ['слева направо', 300, 'r']].forEach(([side, sx, key]) => {
    const E = engine([floor(), Object.assign({}, o)], [sx, GROUND - 100]);
    const pl = E.pl(), keys = E.keys(); keys[key] = true;
    let back = 0;
    for (let f = 0; f < 300; f++) {
      const x0 = pl.x; E.step();
      const dx = pl.x - x0;
      if (pl.ground && (key === 'l' ? dx > 0.01 : dx < -0.01)) back = Math.max(back, Math.abs(dx));
    }
    ok(name + ', ' + side + ': не отбрасывает назад против стрелки', back === 0, back ? 'назад на ' + back.toFixed(2) + ' px' : '');
  });
});

// 2. Стоит на наклоне без нажатий: не сносит вбок
[['triangle 240 rot10', obj('triangle', 480, GROUND - 240, 240, 240, { rot: 10 })],
 ['rect 400x30 rot20', obj('rect', 400, GROUND - 120, 400, 30, { rot: 20 })]].forEach(([name, o]) => {
  const E = engine([floor(), o], [560, GROUND - 400]);
  const pl = E.pl(); let landedAt = -1, drift = 0, x1 = 0;
  for (let f = 0; f < 240; f++) {
    E.step();
    if (landedAt < 0 && pl.ground) { landedAt = f; x1 = pl.x; }
    if (landedAt >= 0 && pl.ground) drift = Math.max(drift, Math.abs(pl.x - x1));
  }
  ok(name + ': встал без нажатий — не сносит вбок', landedAt >= 0 && drift < 0.5, 'сдвиг ' + drift.toFixed(2) + ' px');
});

// 3. Падение на обычный блок — не подпрыгивает
{
  const E = engine([floor(), obj('rect', 400, GROUND - 60, 300, 60)], [520, GROUND - 400]);
  const pl = E.pl(); let up = false;
  for (let f = 0; f < 120; f++) { E.step(); if (pl.vy < -0.5) up = true; }
  ok('падение на обычный блок — без подброса вверх', !up && pl.ground);
}

// 4. Уголок фигуры задевает голову стоящего игрока — он не дрожит вверх-вниз
{
  const E = engine([floor(), obj('circle', 344, 395, 105, 37, { rot: 24 })], [430.9, GROUND - 100]);
  const pl = E.pl(); for (let f = 0; f < 5; f++) E.step();
  let jitter = 0, y0 = pl.y;
  for (let f = 0; f < 60; f++) { E.step(); jitter = Math.max(jitter, Math.abs(pl.y - y0)); }
  ok('уголок фигуры над головой — без дрожи', jitter < 0.5, 'размах ' + jitter.toFixed(1) + ' px');
}

// 5. С рикошетом — отскакивает (функция работает)
{
  const E = engine([floor(), obj('rect', 400, GROUND - 60, 300, 60, { ricochet: true })], [520, GROUND - 400]);
  const pl = E.pl(); let up = false;
  for (let f = 0; f < 120; f++) { E.step(); if (pl.vy < -3) up = true; }
  ok('с включённым рикошетом — отскакивает', up);
}

console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
process.exit(fails ? 1 : 0);
