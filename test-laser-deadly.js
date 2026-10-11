/* «Яд» на лазере-излучателе (см. laserFeeds() в game.html/editor.html):
   раньше галочка «Яд (убивает)» на лазере ловила игрока только впритык
   к самому блоку-излучателю — протяжённая трасса луча смерть не считала
   вовсе. Проверяем: луч без «Яда» просто активирует связанные объекты
   (игрок жив), а с «Ядом» — убивает игрока, стоящего в любой точке
   трассы, не только у самого блока. */
'use strict';
const { makeEngine, obj } = require('./harness.js');

const GY = 520;

function settledPos(target) {
  const ground = obj('rect', -600, GY, 4000, 80, { id: 1 });
  const E = makeEngine(target);
  E.setObjects([ground]);
  E.setSpawn(400, GY - 200);
  E.startRun();
  for (let i = 0; i < 20; i++) E.step();
  const p = E.pl();
  return { x: p.x, y: p.y, w: p.w, h: p.h };
}

// излучатель далеко слева от игрока на той же высоте (rot=0 — луч идёт
// вправо) — проверяем именно трассу луча, а не касание самого блока
function runLaser(target, deadly, pos) {
  const ground = obj('rect', -600, GY, 4000, 80, { id: 1 });
  const beamY = pos.y + pos.h / 2 - 5;   // середина игрока по высоте, блок 10px
  const emitter = obj('rect', pos.x - 400, beamY, 10, 10,
    { id: 2, laser: true, range: 900, rot: 0, deadly: deadly, fill: '#111' });
  const E = makeEngine(target);
  E.setMode('race');   // в прятках умереть нельзя вообще (см. die()) — тестируем на гонке
  E.setObjects([ground, emitter]);
  E.setSpawn(pos.x, pos.y);
  E.startRun();
  for (let i = 0; i < 10; i++) E.step();
  return E.pl();
}

let fail = 0;
function ok(label, cond, extra) {
  console.log((cond ? '✓ ' : '✗ ') + label + (extra !== undefined ? '  ' + extra : ''));
  if (!cond) fail++;
}

for (const target of [__dirname + '/game.html', __dirname + '/editor.html']) {
  const engine = target.endsWith('editor.html') ? 'editor.html' : 'game.html';
  const pos = settledPos(target);

  const safe = runLaser(target, false, pos);
  ok(engine + ': луч без «Яда» не убивает', safe.dead !== true, JSON.stringify({ dead: safe.dead }));

  const dead = runLaser(target, true, pos);
  ok(engine + ': луч с «Ядом» убивает стоящего в трассе игрока', dead.dead === true, JSON.stringify({ dead: dead.dead }));
}

console.log(fail ? ('\n' + fail + ' ошибок') : '\nвсё чисто');
process.exit(fail ? 1 : 0);
