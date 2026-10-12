/* Рикошет должен отталкивать с любой стороны, а не только сверху/снизу.
   Раньше боковой удар отражал pl.vx, но уже следующий кадр ставил
   pl.vx = dir*maxVX() по зажатой стрелке — отскок стирался, игрок просто
   упирался в блок. У низкого блока ещё и нормаль грани бралась от центра
   игрока, который выше крышки, — боковой удар считался ударом сверху. */
'use strict';
const { makeEngine, obj } = require('./harness.js');

const GY = 520;
let fail = 0;
function ok(label, cond, extra) {
  console.log((cond ? '✓ ' : '✗ ') + label + (extra !== undefined ? '  ' + extra : ''));
  if (!cond) fail++;
}

function run(target, objs, spawnX, spawnY, frames, keysFn) {
  const E = makeEngine(target);
  E.setMode('race');
  E.setObjects(objs);
  E.setSpawn(spawnX, spawnY);
  E.startRun();
  const trace = [];
  for (let i = 0; i < frames; i++) {
    const k = E.keys();
    const want = keysFn ? keysFn(i) : {};
    k.l = !!want.l; k.r = !!want.r; k.u = !!want.u;
    E.step();
    const p = E.pl();
    trace.push({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, w: p.w, h: p.h });
  }
  return trace;
}
const ground = () => obj('rect', -600, GY, 4000, 80, { id: 1 });

for (const target of [__dirname + '/game.html', __dirname + '/editor.html']) {
  const name = target.endsWith('editor.html') ? 'editor.html' : 'game.html';

  // высокая стена справа: игрок держит «вправо» и всё равно отлетает назад
  {
    const wall = obj('rect', 700, GY - 200, 40, 200, { id: 2, ricochet: true });
    const t = run(target, [ground(), wall], 400, GY - 120, 140, i => ({ r: i > 20 }));
    const touch = t.findIndex(s => s.x + s.w >= 699);
    const after = t.slice(touch);
    const back = touch < 0 ? 0 : Math.max.apply(null, after.map(s => 700 - (s.x + s.w)));
    ok(name + ': правый бок высокой стены отталкивает', touch >= 0 && back > 30, 'отлёт ' + back.toFixed(1) + 'px');
  }
  // то же слева
  {
    const wall = obj('rect', 60, GY - 200, 40, 200, { id: 2, ricochet: true });
    const t = run(target, [ground(), wall], 400, GY - 120, 140, i => ({ l: i > 20 }));
    const touch = t.findIndex(s => s.x <= 101);
    const after = t.slice(touch);
    const back = touch < 0 ? 0 : Math.max.apply(null, after.map(s => s.x - 100));
    ok(name + ': левый бок высокой стены отталкивает', touch >= 0 && back > 30, 'отлёт ' + back.toFixed(1) + 'px');
  }
  // низкий блок (ниже центра игрока, но выше STEP_UP) — раньше считался ударом сверху
  {
    const low = obj('rect', 700, GY - 40, 60, 40, { id: 2, ricochet: true });
    const t = run(target, [ground(), low], 400, GY - 120, 140, i => ({ r: i > 20 }));
    const touch = t.findIndex(s => s.x + s.w >= 699);
    const after = t.slice(touch);
    const back = touch < 0 ? 0 : Math.max.apply(null, after.map(s => 700 - (s.x + s.w)));
    const climbed = after.some(s => s.y + s.h <= GY - 40 + 0.5 && s.x + s.w > 705);
    ok(name + ': низкий рикошет отталкивает сбоку, а не пускает внутрь/наверх', back > 30 && !climbed,
       'отлёт ' + back.toFixed(1) + 'px');
  }
  // едущий рикошет сам наезжает на стоящего игрока — отбрасывает быстрее, чем едет
  {
    const mover = obj('rect', 500, GY - 200, 40, 200, { id: 2, ricochet: true, moves: true, moveX: -400, moveY: 0, speed: 3 });
    const t = run(target, [ground(), mover], 100, GY - 120, 120);
    const minVx = Math.min.apply(null, t.map(s => s.vx));
    ok(name + ': едущий рикошет отбрасывает стоящего', minVx < -5, 'min vx ' + minVx.toFixed(2));
  }
  // обычная стена (без рикошета) — как раньше: упёрся и стоит
  {
    const wall = obj('rect', 700, GY - 200, 40, 200, { id: 2 });
    const t = run(target, [ground(), wall], 400, GY - 120, 140, i => ({ r: i > 20 }));
    const touch = t.findIndex(s => s.x + s.w >= 699);
    const back = touch < 0 ? 99 : Math.max.apply(null, t.slice(touch).map(s => 700 - (s.x + s.w)));
    ok(name + ': обычная стена не отталкивает', touch >= 0 && back < 1, 'отлёт ' + back.toFixed(2) + 'px');
  }
  // отскок сверху не сломан
  {
    const pad = obj('rect', 380, GY - 40, 120, 40, { id: 2, ricochet: true });
    const t = run(target, [ground(), pad], 420, GY - 400, 120);
    const minVy = Math.min.apply(null, t.slice(5).map(s => s.vy));
    ok(name + ': рикошет сверху подбрасывает', minVy < -5, 'min vy ' + minVy.toFixed(2));
  }
}

console.log(fail ? ('\n' + fail + ' ошибок') : '\nвсё чисто');
process.exit(fail ? 1 : 0);
