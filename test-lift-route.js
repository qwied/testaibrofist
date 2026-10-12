/* Лифт с маршрутом из нескольких точек и задержкой старта (см. liftPts/
   liftK/liftOffset в game.html и editor.html). Проверяем: старый лифт без
   path ездит точь-в-точь по прежней формуле (опубликованные карты не
   меняют тайминг), новый проходит точки строго по порядку и обратно,
   задержка держит его на месте установки, на нём по-прежнему можно ехать,
   а призраки маршрута есть только в редакторе. */
'use strict';
const fs = require('fs');
const { makeEngine, obj } = require('./harness.js');

const GY = 520;
let fail = 0;
function ok(label, cond, extra) {
  console.log((cond ? '✓ ' : '✗ ') + label + (extra !== undefined ? '  ' + extra : ''));
  if (!cond) fail++;
}
const near = (a, b, eps) => Math.abs(a - b) <= (eps || 0.5);

function engineWith(target, objs, sx, sy) {
  const E = makeEngine(target);
  E.setMode('race');
  E.setObjects(objs);
  E.setSpawn(sx === undefined ? -400 : sx, sy === undefined ? GY - 120 : sy);
  E.startRun();
  return E;
}

for (const target of [__dirname + '/game.html', __dirname + '/editor.html']) {
  const name = target.endsWith('editor.html') ? 'editor.html' : 'game.html';

  // 1) старый лифт: та же формула, та же фаза (с середины хода)
  {
    const lift = obj('rect', 200, 300, 60, 20, { id: 2, moves: true, moveX: 200, moveY: -40, speed: 1.3 });
    const E = engineWith(target, [obj('rect', -600, GY, 4000, 80, { id: 1 }), lift]);
    let maxErr = 0;
    for (let f = 1; f <= 600; f++) {
      E.step();
      const t = 0.012 * 1.3 * f, k = (Math.sin(t) + 1) / 2;
      maxErr = Math.max(maxErr, Math.abs(lift.x - (200 + 200 * k)), Math.abs(lift.y - (300 - 40 * k)));
    }
    ok(name + ': старый лифт ездит как раньше', maxErr < 1e-9, 'макс. расхождение ' + maxErr);
  }

  // 2) маршрут из трёх точек — по порядку туда и обратно, старт с места установки
  {
    const lift = obj('rect', 200, 300, 60, 20, { id: 2, moves: true, speed: 2,
      path: [[100, 0], [100, -100], [0, -100]] });
    const E = engineWith(target, [obj('rect', -600, GY, 4000, 80, { id: 1 }), lift]);
    E.step();
    ok(name + ': маршрут стартует с места установки', near(lift.x, 200, 0.2) && near(lift.y, 300, 0.2),
       JSON.stringify({ x: +lift.x.toFixed(2), y: +lift.y.toFixed(2) }));
    const hit = [[300, 300], [300, 200], [200, 200]].map(() => -1);
    const wps = [[300, 300], [300, 200], [200, 200]];
    let back = -1;
    for (let f = 2; f <= 600; f++) {
      E.step();
      wps.forEach((w, i) => { if (hit[i] < 0 && near(lift.x, w[0], 2) && near(lift.y, w[1], 2)) hit[i] = f; });
      if (hit[2] > 0 && back < 0 && near(lift.x, 300, 2) && near(lift.y, 300, 2)) back = f;
    }
    ok(name + ': точки проходятся строго по порядку', hit[0] > 0 && hit[0] < hit[1] && hit[1] < hit[2],
       JSON.stringify(hit));
    ok(name + ': после конца маршрута лифт идёт обратно тем же путём', back > hit[2], 'обратно в т.1 на кадре ' + back);
    // между точками — строго на отрезке (ломаная, а не срезание углов)
    const E2 = engineWith(target, [obj('rect', -600, GY, 4000, 80, { id: 1 }),
      Object.assign(lift, { x: 200, y: 300 })]);
    let offPath = 0;
    for (let f = 1; f <= 300; f++) {
      E2.step();
      const x = lift.x, y = lift.y;
      const onA = near(y, 300, 0.01) && x >= 199.99 && x <= 300.01;
      const onB = near(x, 300, 0.01) && y >= 199.99 && y <= 300.01;
      const onC = near(y, 200, 0.01) && x >= 199.99 && x <= 300.01;
      if (!(onA || onB || onC)) offPath++;
    }
    ok(name + ': лифт всё время на ломаной маршрута', offPath === 0, 'вне ломаной кадров: ' + offPath);
  }

  // 3) задержка: стоит на месте установки delay секунд, потом едет
  {
    const lift = obj('rect', 200, 300, 60, 20, { id: 2, moves: true, speed: 1, delay: 1.5, path: [[200, 0]] });
    const E = engineWith(target, [obj('rect', -600, GY, 4000, 80, { id: 1 }), lift]);
    let still = true;
    for (let f = 1; f <= 90; f++) { E.step(); if (lift.x !== 200 || lift.y !== 300) still = false; }
    for (let f = 91; f <= 140; f++) E.step();
    ok(name + ': задержка 1.5 с — 90 кадров на месте', still);
    ok(name + ': после задержки поехал', lift.x > 200.5, 'x=' + lift.x.toFixed(2));
    // без задержки — поехал сразу
    const lift0 = obj('rect', 200, 300, 60, 20, { id: 2, moves: true, speed: 1, path: [[200, 0]] });
    const E0 = engineWith(target, [obj('rect', -600, GY, 4000, 80, { id: 1 }), lift0]);
    for (let f = 1; f <= 30; f++) E0.step();
    ok(name + ': без задержки едет сразу', lift0.x > 200.1, 'x=' + lift0.x.toFixed(3));
  }

  // 4) на лифте с маршрутом можно ехать
  {
    const lift = obj('rect', 300, GY - 140, 120, 20, { id: 2, moves: true, speed: 2, path: [[300, 0], [300, -100]] });
    const E = engineWith(target, [obj('rect', -600, GY, 4000, 80, { id: 1 }), lift], 340, GY - 140 - 102);
    for (let f = 0; f < 20; f++) E.step();
    const x0 = E.pl().x;
    let rode = 0;
    for (let f = 0; f < 120; f++) { E.step(); if (E.pl().y + E.pl().h <= lift.y + 1.5 && E.pl().y + E.pl().h >= lift.y - 1.5) rode++; }
    ok(name + ': игрок едет на лифте с маршрутом', E.pl().x - x0 > 100 && rode > 100,
       'сдвиг ' + (E.pl().x - x0).toFixed(1) + ', кадров на лифте ' + rode);
  }
}

// 5) призраки маршрута — только картинка редактора
{
  const ed = fs.readFileSync(__dirname + '/editor.html', 'utf8');
  const gm = fs.readFileSync(__dirname + '/game.html', 'utf8');
  ok('призраки рисует только редактор', /function drawRoute\(o\)/.test(ed) && !/drawRoute\(/.test(gm));
  ok('в редакторе призраки — только вне игры', /if\(!playing && liftRouted\(sel\)\) drawRoute\(sel\);/.test(ed));
  ok('призраки не попадают в objects', !/objects\.push\([^)]*ghost/i.test(ed));
}

console.log(fail ? ('\n' + fail + ' ошибок') : '\nвсё чисто');
process.exit(fail ? 1 : 0);
