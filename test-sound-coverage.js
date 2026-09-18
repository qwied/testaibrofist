/* Звук был подключён всего в 3-5 местах игровой физики (прыжок, шаг,
   смерть, финиш) — приземление, пружина/рикошет, чекпоинт и кнопка/рычаг
   были полностью немыми. Держим эти хуки от молчаливого отката, плюс
   проверяем, что sound.js реально экспортирует все нужные функции. */
'use strict';
const fs = require('fs');
let fails = 0;
const ok = (n, c) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n); };

const snd = fs.readFileSync(__dirname + '/sound.js', 'utf8');
console.log('sound.js:');
['land', 'bounce', 'checkpoint', 'toggle'].forEach(fn => {
  ok('функция ' + fn + '() определена', new RegExp('function ' + fn + '\\(').test(snd));
  ok(fn + ' экспортирован в window.BFSound', new RegExp(fn + ':\\s*' + fn).test(snd));
});

['game.html', 'editor.html'].forEach(f => {
  const src = fs.readFileSync(__dirname + '/' + f, 'utf8');
  console.log(f + ':');
  ok('приземление после падения озвучено (BFSound.land)',
      /if\(wasAir && pl\.vy > 6\)\{ puff\(pl\.x\+pl\.w\/2, pl\.y\+pl\.h, 5\); if\(window\.BFSound\) BFSound\.land\(\); \}/.test(src));
  ok('пружина\/рикошет озвучены (BFSound.bounce)',
      /puff\(px - nv\[0\]\*pl\.w\*0\.5, py - nv\[1\]\*pl\.h\*0\.5, 8\);\s*\n\s*if\(window\.BFSound\) BFSound\.bounce\(\);/.test(src));
  ok('чекпоинт озвучен (BFSound.checkpoint)',
      /o\._reached = true; spawnPt = \{x:o\.x, y:o\.y\+o\.h-pl\.h\};\s*\n\s*burst\(o\.x\+o\.w\/2, o\.y\+o\.h\*0\.25, 14, "#4ade80", 2\.6, 30\);\s*\n\s*if\(window\.BFSound\) BFSound\.checkpoint\(\);/.test(src));
  ok('кнопка озвучена (BFSound.toggle)',
      /if\(o\.type === "button" && !o\._act\)\{ o\._act = true; drive\(o\); if\(window\.BFSound\) BFSound\.toggle\(\); \}/.test(src));
  ok('рычаг озвучен (BFSound.toggle)',
      /if\(o\.type === "lever" && !o\._latch\)\{ o\._act = !o\._act; o\._latch = true; drive\(o\); if\(window\.BFSound\) BFSound\.toggle\(\); \}/.test(src));
});

console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
process.exit(fails ? 1 : 0);
