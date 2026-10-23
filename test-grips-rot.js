/* Ручки (шарики) выделенного объекта в редакторе. У повёрнутого объекта
   они оставались в углах НЕповёрнутого прямоугольника и висели в пустоте
   рядом с фигурой (при 90° — рамкой с переставленными шириной и высотой).
   Проверяем на настоящих функциях из editor.html:
   - ручки стоят в углах фигуры при любом повороте (и у круга/треугольника —
     на их силуэте, как раньше);
   - тянем ручку повёрнутого объекта: она идёт за мышью, противоположный
     угол стоит на месте;
   - у ровного объекта всё как раньше.
   Запуск: node test-grips-rot.js */
'use strict';
const fs = require('fs'), vm = require('vm');

let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };
const near = (a, b) => Math.abs(a - b) < 0.01;

const src = fs.readFileSync(__dirname + '/editor.html', 'utf8');
const fn = name => {
  const m = src.match(new RegExp('\\nfunction ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}'));
  if (!m) throw new Error('нет функции ' + name + ' в editor.html');
  return m[0];
};
const ctx = vm.createContext({ Math, Object });
vm.runInContext(`
  var CIRCLE_SIDES = 24, PULSE_DEF_MIN = 0.78, playing = false, grid = false, GRID = 10, drag = null, sel = null, objects = [];
  var snapN = function(v){ return grid ? Math.round(v/GRID)*GRID : v; };
  var inspect = function(){}, liftEnsurePath = function(){}, liftHome = function(){ return [0,0]; }, liftSync = function(){};
  ${fn('rawPoly')}
  ${fn('pulseScale')}
  ${fn('polyOf')}
  ${fn('grips')}
  ${fn('move')}
  function api(){ return { grips: grips, polyOf: polyOf, move: move,
    set: function(k, v){ if(k === 'drag') drag = v; if(k === 'sel') sel = v; if(k === 'grid') grid = v; } }; }
`, ctx);
const E = vm.runInContext('api()', ctx);
const at = (o, n) => E.grips(o).find(h => h.n === n);
const OPP = { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' };

console.log('ручки на фигуре:');
for (const rot of [0, 30, 90, 180, -45, 270]) {
  const o = { type: 'rect', x: 100, y: 100, w: 200, h: 50, rot };
  const poly = E.polyOf(o);
  ok('прямоугольник, поворот ' + rot + '° — каждая ручка в углу фигуры',
     E.grips(o).every(h => poly.some(q => near(q[0], h.x) && near(q[1], h.y))));
}
const r90 = { type: 'rect', x: 100, y: 100, w: 200, h: 50, rot: 90 };
const xs = E.grips(r90).map(h => h.x), ys = E.grips(r90).map(h => h.y);
ok('при 90° рамка ручек 50 в ширину и 200 в высоту — как сама фигура, а не наоборот',
   near(Math.max(...xs) - Math.min(...xs), 50) && near(Math.max(...ys) - Math.min(...ys), 200));
const tri = { type: 'triangle', x: 0, y: 0, w: 60, h: 60, rot: 90 };
const triPoly = E.polyOf(tri);
ok('треугольник 90° — нижние ручки в его нижних вершинах', ['sw', 'se'].every(n =>
   triPoly.some(q => near(q[0], at(tri, n).x) && near(q[1], at(tri, n).y))));
const circ = { type: 'circle', x: 0, y: 0, w: 80, h: 40, rot: 60 };
ok('эллипс 60° — ручки на его контуре', E.grips(circ).every(h => {
  const a = -60 * Math.PI / 180, dx = h.x - 40, dy = h.y - 20;
  const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
  return near((lx / 40) ** 2 + (ly / 20) ** 2, 1);
}));

console.log('\nтянем ручку повёрнутого объекта:');
for (const rot of [90, 30, -120]) {
  const res = ['nw', 'ne', 'sw', 'se'].map(n => {
    const o = { type: 'rect', x: 300, y: 200, w: 120, h: 60, rot };
    E.set('sel', o);
    const a = at(o, n), f = at(o, OPP[n]);
    E.set('drag', { m: 'size', g: n, ox: a.x, oy: a.y, o: Object.assign({}, o) });
    E.move(a.x + 17, a.y - 9);
    E.set('drag', null);
    const a1 = at(o, n), f1 = at(o, OPP[n]);
    return near(f.x, f1.x) && near(f.y, f1.y) && near(a1.x, a.x + 17) && near(a1.y, a.y - 9);
  });
  ok('поворот ' + rot + '°: каждая ручка идёт за мышью, угол напротив стоит', res.every(Boolean), res.join());
}
const o90 = { type: 'rect', x: 100, y: 100, w: 200, h: 50, rot: 90 };
E.set('sel', o90);
const se = at(o90, 'se');
E.set('drag', { m: 'size', g: 'se', ox: se.x, oy: se.y, o: Object.assign({}, o90) });
E.move(se.x, se.y + 30);
ok('при 90° тянем вниз — растёт длина фигуры (её w), а не толщина', near(o90.w, 230) && near(o90.h, 50), o90.w + 'x' + o90.h);
E.move(se.x - 1000, se.y - 1000);
ok('сжать в ноль нельзя — не меньше 4', o90.w >= 4 && o90.h >= 4, o90.w + 'x' + o90.h);
E.set('drag', null);
E.set('grid', true);
const og = { type: 'rect', x: 100, y: 100, w: 200, h: 50, rot: 45 };
E.set('sel', og);
const gse = at(og, 'se');
E.set('drag', { m: 'size', g: 'se', ox: gse.x, oy: gse.y, o: Object.assign({}, og) });
E.move(gse.x + 13, gse.y + 4);
ok('с сеткой — размеры по шагу сетки', og.w % 10 === 0 && og.h % 10 === 0, og.w + 'x' + og.h);
E.set('drag', null);

console.log('\nровный объект — как раньше:');
const flat = { type: 'rect', x: 500, y: 300, w: 80, h: 40, rot: 0 };
E.set('sel', flat);
E.set('drag', { m: 'size', g: 'nw', ox: 500, oy: 300, o: Object.assign({}, flat) });
E.move(490, 310);
ok('nw: x/y сдвигаются, w/h меняются, всё по сетке', [flat.x, flat.y, flat.w, flat.h].join() === '490,310,90,30', [flat.x, flat.y, flat.w, flat.h].join());
ok('ручки ровного — в углах рамки', E.grips(flat).map(h => h.x + ':' + h.y).join() === '490:310,580:310,490:340,580:340');

console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
process.exit(fails ? 1 : 0);
