/* Два реально немых места, подтверждённых живым тестом (Playwright +
   window.GAME для шагов, реальная комната прятки для рулетки):

   1) Шаги. Порог был `Math.abs(pl.vx) > 30`, а pl.vx тут — пиксели на
      физическом шаге (см. maxVX() = MAX_VX*gk(), MAX_VX = 5.2), не на
      секунду. 30 недостижимо ни при какой ходьбе ни на одной карте —
      BFSound.step() не срабатывал вообще никогда. Проверено: 5 секунд
      симулированной ходьбы по ровному полу — 0 вызовов step() до фикса,
      20 после (по одному на каждые 250мс кулдауна).

   2) Рулетка искателя (runRoulette в game.js) была совсем без звука:
      ни в начале прокрутки, ни по ходу, ни при остановке на победителе.
      Добавлены roulSpin() (старт), roulTick() (тик на каждое проехавшее
      имя — считается не по времени, а по live-значению translateX через
      getComputedStyle, поэтому темп тиков сам замедляется вместе с
      cubic-bezier анимацией без ручного подбора кривой) и roulLand()
      (остановка). Проверено в реальной комнате: roulSpin один раз,
      ~23 roulTick с ускоряющимся интервалом от ~30мс до ~1с, один
      roulLand — секунда в секунду с остановкой ленты на экране. */
'use strict';
const fs = require('fs');
let fails = 0;
const ok = (n, c) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n); };

const snd = fs.readFileSync(__dirname + '/sound.js', 'utf8');
console.log('sound.js:');
['roulSpin', 'roulTick', 'roulLand'].forEach(fn => {
  ok('функция ' + fn + '() определена', new RegExp('function ' + fn + '\\(').test(snd));
  ok(fn + ' экспортирован в window.BFSound', new RegExp(fn + ':\\s*' + fn).test(snd));
});

['game.html', 'editor.html'].forEach(f => {
  const src = fs.readFileSync(__dirname + '/' + f, 'utf8');
  console.log(f + ':');
  ok('порог шагов больше не мёртвый (не > 30)', !/Math\.abs\(pl\.vx\) > 30/.test(src));
  ok('шаги озвучены при реальном сдвиге (> 0.5)',
      /pl\.ground && !pl\.dead && Math\.abs\(pl\.vx\) > 0\.5 && timeMs - lastStepAt > 250/.test(src));
});

const gjs = fs.readFileSync(__dirname + '/game.js', 'utf8');
console.log('game.js:');
ok('свист на старте прокрутки (roulSpin)', /if \(window\.BFSound\) \{\s*BFSound\.roulSpin\(\);/.test(gjs));
ok('тик считается по живому transform, не по времени',
    /function currentTrackX\(el\) \{/.test(gjs) && /getComputedStyle\(el\)\.transform/.test(gjs));
ok('тик звучит на смену имени под центром ленты',
    /if \(idx !== tickIdx\) \{ tickIdx = idx; BFSound\.roulTick\(\); \}/.test(gjs));
ok('остановка на победителе озвучена (roulLand)',
    /applySeeker\(d\.winnerId\);\s*\n\s*if \(window\.BFSound\) BFSound\.roulLand\(\);/.test(gjs));
ok('петля тиков останавливается через roulStop() (нет утечки rAF)',
    /function roulStop\(\) \{[\s\S]{0,200}if \(roulRAF\) \{ cancelAnimationFrame\(roulRAF\); roulRAF = null; \}/.test(gjs));

console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
process.exit(fails ? 1 : 0);
