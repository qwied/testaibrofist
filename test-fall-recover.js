/* Провал сквозь карту (дыра в полу, край без пола и т.п.): pl.y > 5000
   раньше всегда звал die(). В прятках die() — намеренный no-op («умереть
   нельзя», см. её собственный комментарий), так что respawn() там не
   вызывался НИКЕМ — упавший искатель или прячущийся падал бесконечно,
   без единого шанса выбраться, пока не перезайдёт в комнату. Race такой
   провал по-прежнему решает через die()->respawn() на чекпоинте — это
   не трогаем. */
'use strict';
const fs = require('fs');
let fails = 0;
const ok = (n, c) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n); };

['game.html', 'editor.html'].forEach(f => {
  const src = fs.readFileSync(__dirname + '/' + f, 'utf8');
  console.log(f + ':');
  ok('в прятках провал за карту зовёт respawn(), а не молчащий die()',
      /if\(pl\.y > 5000\)\{\s*\/\*[\s\S]{0,600}?\*\/\s*if\(mode === "hideAndSeek"\) respawn\(\);\s*else die\(\);\s*\}/.test(src));
  // die() для гонки не трогали — она по-прежнему единственная точка входа
  // для смерти от шипов и остаётся no-op в прятках
  ok('die() для гонки не тронута (шипы всё ещё звук+respawn через неё)',
      /function die\(\)\{\s*\/\/[^\n]*\n\s*if\(mode === "hideAndSeek"\) return;\s*\n\s*if\(pl\.dead \|\| done\) return;/.test(src));
});

console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
process.exit(fails ? 1 : 0);
