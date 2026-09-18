/* Клик озвучивался только у элементов из жёстко перечисленного списка
   классов (CLICK_SEL) — на сайте десятки кастомных кнопок/карточек/вкладок
   с собственными классами, и список вечно отставал от новых виджетов.
   Второй проход по клику ловит ЛЮБОЙ элемент с cursor:pointer (тот же
   сигнал «это кликабельно», что CSS сайта и так использует везде) —
   проверено живьём через Playwright: клики по .modeBtn/.sBtn в редакторе
   и по вложенным SVG-иконкам внутри них теперь дают ровно один звук, как
   и обычная <button>, без задвоения. */
'use strict';
const fs = require('fs');
let fails = 0;
const ok = (n, c) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n); };

const src = fs.readFileSync(__dirname + '/sound.js', 'utf8');
console.log('sound.js:');
ok('явный список классов остался как быстрый путь',
    /var CLICK_SEL = 'button, a, \[role="button"\], \.bfDropItem, \.msRow, \.bfTab, \.bfChip';/.test(src));
ok('при промахе по CLICK_SEL идёт проверка cursor:pointer вверх по дереву',
    /while \(el && el\.nodeType === 1 && el !== document\.body && depth < 4\) \{/.test(src) &&
    /getComputedStyle\(el\)\.cursor === 'pointer'/.test(src));
ok('попадание по CLICK_SEL не даёт второго срабатывания (return после click)',
    /if \(t\) \{ if \(!t\.disabled\) click\(\); return; \}/.test(src));

console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
process.exit(fails ? 1 : 0);
