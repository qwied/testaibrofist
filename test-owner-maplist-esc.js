/* owner.js рендерил список карт "в игре" (панель владельца, список под
   "Добавить в игру") прямо в innerHTML без экранирования: x.mapName и
   x.author шли в HTML как есть. Имя карты чистится только cleanText на
   сервере (не cleanName, как ники) — "<", ">", "\"" из названия НЕ
   вырезаются, так что карта с именем вроде
   <img src=x onerror="..."> один раз добавленная в режим превращалась
   в stored XSS с правами владельца при каждом открытии его панели.

   Полноценный Playwright-тест тут избыточен — это чистая функция плюс
   два места её вызова. Вытаскиваем esc() и сам рендер-код прямо из
   owner.js (как test-objects.js делает с editor.html) и проверяем и то,
   и то: (1) esc() действительно экранирует опасные символы, (2) оба
   места, где раньше шли голые x.mapName/x.author, теперь оборачивают их
   в esc(). Второе — чтобы будущая правка этого блока не тихо вернула
   голую интерполяцию, пройдя мимо (1). */
'use strict';
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };

const src = fs.readFileSync(__dirname + '/owner.js', 'utf8');

// esc() — чистая функция, вытаскиваем её исходник и прогоняем сам
const escMatch = src.match(/var esc = function \(s\) \{[\s\S]*?\n  \};/);
ok(!!escMatch, 'esc() определена в owner.js');
if (escMatch) {
  const escSrc = escMatch[0].replace(/^var esc = /, '').replace(/;\s*$/, '');
  const esc = eval('(' + escSrc + ')');
  ok(esc('<img src=x onerror="alert(1)">') === '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
     'esc() экранирует < > "', esc('<img src=x onerror="alert(1)">'));
  ok(esc('O\'Brien') === 'O&#39;Brien', 'esc() экранирует одинарную кавычку');
  ok(esc('a & b') === 'a &amp; b', 'esc() экранирует &');
  ok(esc(null) === '' && esc(undefined) === '', 'esc(null/undefined) — пустая строка, не "null"/"undefined"');
}

// места использования — именно те, что рендерят список карт "в игре"
const siteMatch = src.match(/return '· ' \+ [^;]+;/);
ok(!!siteMatch, 'нашли строку рендера списка карт "в игре"');
if (siteMatch) {
  const site = siteMatch[0];
  ok(/esc\(x\.mapName\)/.test(site), 'x.mapName оборачивается в esc()', site);
  ok(/esc\(x\.author\)/.test(site), 'x.author оборачивается в esc()', site);
}

console.log(fail ? ('\n' + fail + ' ошибок') : '\nвсё чисто');
process.exit(fail ? 1 : 0);
