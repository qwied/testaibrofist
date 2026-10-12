/* На телефоне секретные кнопки владельца (.ow-fab из owner.js, #aaFab из
   adminAbuse.js) — position:fixed в правом нижнем углу. Живая проверка
   на users.html (см. скриншоты этой сессии) нашла два реальных бага:
   1) #aaFab с полной подписью "Admin Abuse" (~140px) наезжал на обычные
      элементы страницы, которые дотягиваются до того же угла при
      переносе на всю ширину экрана (кнопка "Edit" под описанием в
      профиле);
   2) без своего нижнего отступа у body последние строки длинных списков
      (таблица лидеров и т.п.) оказывались НАВСЕГДА под этими кнопками —
      прокрутить дальше было некуда, строка нечитаема и некликабельна.

   Полноценный Playwright-тест (сервер, вход, реальный рендер) уже
   прогонялся вручную при живой проверке. Здесь — быстрая статическая
   проверка, что сам фикс (CSS-правила и классы, которые его включают)
   не исчезнет при следующей правке этих файлов. */
'use strict';
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };

const aa = fs.readFileSync(__dirname + '/adminAbuse.js', 'utf8');
const ow = fs.readFileSync(__dirname + '/owner.js', 'utf8');

// (1) на узких экранах #aaFab сжимается в кружок без подписи
ok(/@media \(max-width:860px\)\{#aaFab\{[^}]*width:52px[^}]*height:52px[^}]*border-radius:50%/.test(aa),
   '#aaFab сжимается в кружок 52×52 на узких экранах');
ok(/#aaFab span\{display:none\}/.test(aa),
   'подпись "Admin Abuse" прячется на узких экранах (span display:none)');

// (2) владелец резервирует отступ снизу под обе кнопки
ok(/document\.body\.classList\.add\('ow-has-fab'\)/.test(ow),
   'buildPanel() помечает body классом ow-has-fab');
ok(/@media\(max-width:860px\)\{body\.ow-has-fab\{padding-bottom:\d+px\}\}/.test(ow),
   'есть правило, резервирующее нижний отступ для body.ow-has-fab на узких экранах');

console.log(fail ? ('\n' + fail + ' ошибок') : '\nвсё чисто');
process.exit(fail ? 1 : 0);
