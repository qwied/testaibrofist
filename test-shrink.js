/* «Изменение размера» (pulse): блок сжимается до pulseMin и возвращается, хитбокс — вместе с ним.
   Гоняем оба движка: game.html (игра) и editor.html (проба в редакторе). */
'use strict';
const { makeEngine, obj } = require('./harness.js');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };

const GY = 520;
const ground = () => obj('rect', -600, GY, 4000, 80);

function engine(file, objs, spawn) {
  objs.forEach((o, i) => { o.id = i + 1; });
  const E = makeEngine(__dirname + '/' + file);
  E.setObjects(objs);
  E.setSpawn(spawn[0], spawn[1]);
  E.startRun();
  for (let i = 0; i < 8; i++) E.step();
  return E;
}
// фаза «в этот кадр»: step() прибавляет 0.05, поэтому ставим на шаг раньше
const at = (o, t) => { o._pulseT = t - 0.05; };
const near = (a, b, e) => a.every((v, i) => Math.abs(v - b[i]) <= e);

for (const file of ['game.html', 'editor.html']) {
  console.log('\n== ' + file);

  // ---- геометрия: хитбокс сжимается вокруг центра и не выходит за размер из редактора ----
  {
    const b = obj('rect', 1000, 300, 200, 100, { pulse: true, pulseMin: 0.4 });
    const E = engine(file, [ground(), b], [100, 400]);
    const o = E.objects()[1];
    at(o, 0); E.step();
    ok(near(E.bbox(o), [1000, 300, 1200, 400], 0.5), 'в начале блок целый', JSON.stringify(E.bbox(o).map(Math.round)));
    at(o, Math.PI); E.step();
    ok(near(E.bbox(o), [1060, 330, 1140, 370], 0.5), 'на дне блок 40% и в центре', JSON.stringify(E.bbox(o).map(Math.round)));
    let big = false, small = false;
    for (let f = 0; f < 400; f++) {
      E.step();
      const B = E.bbox(o);
      if (B[0] < 1000 - 0.01 || B[2] > 1200 + 0.01 || B[1] < 300 - 0.01 || B[3] > 400 + 0.01) big = true;
      if (B[2] - B[0] < 80 - 0.01 || B[3] - B[1] < 40 - 0.01) small = true;
    }
    ok(!big, 'хитбокс никогда не больше нарисованного');
    ok(!small, 'и не меньше наименьшего размера');
    E.setPlaying(false);
    o._pk = null;
    ok(near(E.bbox(o), [1000, 300, 1200, 400], 0.01), 'вне игры (в редакторе) блок целый');
  }

  // ---- игрок упирается в целый блок и проходит под сжатым ----
  for (const shrunk of [false, true]) {
    const wall = obj('rect', 600, 220, 60, 300, { pulse: true, pulseMin: 0.3 });
    const E = engine(file, [ground(), wall], [450, GY - 80]);
    for (let i = 0; i < 40; i++) E.step();
    const w = E.objects()[1];
    E.keys().r = true;
    let minGap = 1e9;
    for (let f = 0; f < 260; f++) {
      at(w, shrunk ? Math.PI : 0);
      E.step();
    }
    E.keys().r = false;
    const px = E.pl().x;
    if (!shrunk) ok(px + E.pl().w <= 600 + 1, 'целый блок не пускает', 'x=' + px.toFixed(1));
    else ok(px > 660, 'под сжатым блоком можно пройти', 'x=' + px.toFixed(1));
  }

  // ---- стоящий на сжимающемся блоке опускается вместе с ним, без рывков ----
  {
    const top = obj('rect', 900, 400, 200, 100, { pulse: true, pulseMin: 0.3 });
    const E = engine(file, [ground(), top], [940, 400 - 80]);
    const t = E.objects()[1];
    for (let i = 0; i < 30; i++) { at(t, 0); E.step(); }           // пока блок целый
    const y0 = E.pl().y;
    ok(E.pl().ground && y0 + E.pl().h <= 401, 'встал на блок', 'y=' + y0.toFixed(1));
    let worst = 0, last = y0;
    for (let f = 0; f < 70; f++) {
      at(t, Math.PI * Math.min(1, (f + 1) / 60));
      E.step();
      worst = Math.max(worst, Math.abs(E.pl().y - last)); last = E.pl().y;
    }
    ok(E.pl().y > y0 + 20, 'игрок опустился вместе с блоком', (E.pl().y - y0).toFixed(1) + ' px');
    ok(worst <= 19.2 + 16 + 2.5, 'без телепорта при сжатии', 'за кадр до ' + worst.toFixed(1));
  }

  // ---- блок вырастает на игрока — выталкивает, а не застревает ----
  {
    const wall = obj('rect', 1400, 220, 100, 300, { pulse: true, pulseMin: 0.3 });
    const E = engine(file, [ground(), wall], [1402, GY - 80]);
    const w = E.objects()[1];
    at(w, Math.PI);                                   // блок сжат — игрок стоит там, где потом будет блок
    for (let i = 0; i < 20; i++) { at(w, Math.PI); E.step(); }
    ok(Math.abs(E.pl().x - 1402) < 3, 'в сжатом блоке есть место для игрока', 'x=' + E.pl().x.toFixed(1));
    let worstX = 0, lastX = E.pl().x;
    at(w, Math.PI);
    for (let f = 0; f < 120; f++) {
      E.step();
      worstX = Math.max(worstX, Math.abs(E.pl().x - lastX)); lastX = E.pl().x;
    }
    const p = E.pl();
    const inside = p.x < 1500 - 1 && p.x + p.w > 1400 + 1 && p.y < 520 - 1 && p.y + p.h > 220 + 1;
    ok(!inside, 'выросший блок не оставил игрока внутри', 'x=' + p.x.toFixed(1) + ' y=' + p.y.toFixed(1));
    ok(worstX <= 30, 'выталкивание без телепорта', 'за кадр до ' + worstX.toFixed(1));
  }

  // ---- старые карты: без pulseMin — как раньше уходил вниз, 78% ----
  {
    const wall = obj('rect', 600, 220, 60, 300, { pulse: true });
    const E = engine(file, [ground(), wall], [450, GY - 80]);
    const w = E.objects()[1];
    E.keys().r = true;
    for (let f = 0; f < 200; f++) { at(w, Math.PI); E.step(); }
    ok(E.pl().x + E.pl().w <= 600 + 60 * (1 - 0.78) / 2 + 1, 'у старого блока размер уходит не ниже 78%, стена остаётся стеной', 'x=' + E.pl().x.toFixed(1));
  }
}

console.log('\n' + pass + ' ok, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
