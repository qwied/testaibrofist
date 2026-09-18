/* Второй заход на баг «падает бесконечно» в прятках: pl.y > 5000 (прошлый
   фикс) ловит только сквозное падение за карту. Но держа прыжок над
   неполным уступом без бокового движения, игрок никуда не падает вовсе —
   приземление тут же снимается held-буфером новым прыжком, высоты хватает
   ровно чтобы упасть обратно на тот же уступ, и так кадр в кадр сколько
   угодно долго (подтверждено живой физикой через window.GAME в editor.html:
   игрок стоял на месте (± пара px) 50 секунд подряд, ни разу не коснувшись
   земли дольше одного кадра). Сторож считает окно в 150 кадров (~2.5с) и
   телепортирует на спавн, если почти всё время в воздухе (не «стоит и
   прячется») и пространство, занятое за окно, узкое (не «идёт/скачет по
   карте»). */
'use strict';
const fs = require('fs');
let fails = 0;
const ok = (n, c) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n); };

['game.html', 'editor.html'].forEach(f => {
  const src = fs.readFileSync(__dirname + '/' + f, 'utf8');
  console.log(f + ':');
  ok('константа окна сторожа объявлена', /STUCK_WINDOW = 150/.test(src));
  ok('состояние сторожа объявлено', /var stuckFrames = 0, stuckAir = 0, stuckMinX = 0, stuckMaxX = 0, stuckMinY = 0, stuckMaxY = 0;/.test(src));
  ok('respawn\\(\\) обнуляет окно сторожа',
      /function respawn\(\)\{[\s\S]{0,300}stuckFrames = 0; stuckAir = 0; stuckMinX = stuckMaxX = pl\.x; stuckMinY = stuckMaxY = pl\.y;/.test(src));
  ok('сторож живёт только в прятках, вне их — сбрасывается',
      /if\(mode === "hideAndSeek"\)\{\s*if\(pl\.x < stuckMinX\)/.test(src) && /\} else \{\s*stuckFrames = 0; stuckAir = 0;\s*\}\s*\}\s*function drive/.test(src));
  ok('решение по размаху окна (min\\/max), не по сдвигу начало-конец',
      /stuckAir \/ stuckFrames > 0\.6 && \(stuckMaxX - stuckMinX\) < 200 && \(stuckMaxY - stuckMinY\) < 200/.test(src));
  ok('застрявшего телепортирует на спавн через respawn\\(\\)',
      /\(stuckMaxY - stuckMinY\) < 200\)\{\s*respawn\(\);/.test(src));
});

console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
process.exit(fails ? 1 : 0);
