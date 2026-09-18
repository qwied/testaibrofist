/* Поле «Множитель скорости игрока» в редакторе (см. speedMul() в
   editor.html): буква x зафиксирована, минус — необязательный префикс
   перед ней. Раньше sanitize() узнавал минус, только если он стоял
   САМЫМ первым символом строки. Курсор после programmatic i.value=
   встаёт в КОНЕЦ поля, и печатая минус обычным способом — после уже
   набранных цифр, как это делает любой человек с клавиатурой, — на
   самом деле дописываешь его в конец ("x5-"), а не перед x. Минус тихо
   терялся, и набрать замедление было решительно нечем, кроме как
   специально кликать в самое начало поля. */
'use strict';
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/editor.html', 'utf8');
const m = src.match(/function sanitize\(s\)\{[\s\S]*?\n  \}/);
if (!m) { console.log('✗ не нашёл sanitize() в editor.html'); process.exit(1); }
const sanitize = new Function('s', m[0].replace(/^function sanitize\(s\)\{/, '').replace(/\}$/, ''));

let fail = 0;
function ok(input, expected) {
  const got = sanitize(input);
  const pass = got === expected;
  if (!pass) fail++;
  console.log((pass ? '✓ ' : '✗ ') + 'sanitize(' + JSON.stringify(input) + ') = ' + JSON.stringify(got) + ' (ожидалось ' + JSON.stringify(expected) + ')');
}

// x — жёстко зафиксирован
ok('', 'x');
ok('x', 'x');
ok('5', 'x5');

// минус, напечатанный ЕСТЕСТВЕННЫМ образом — после цифр, в конец поля
// (курсор всегда там после i.value=) — именно это было сломано
ok('x-', '-x');
ok('x5-', '-x5');
ok('x0.1-', '-x0.1');

// минус перед x (клик в начало поля) — тоже должен работать
ok('-x5', '-x5');
ok('-5', '-x5');

// дробные значения
ok('x2.5', 'x2.5');
ok('x1.2.3', 'x1.23');   // второй разделитель дробной части просто выпадает

// мусор не ломает x
ok('xx5', 'x5');
ok('x-5', '-x5');    // минус ВНУТРИ уже начатого "x5" — тоже валидный минус
ok('x5-3', '-x53');  // случайный минус где угодно — всё ещё считается минусом

console.log(fail ? ('\n' + fail + ' ошибок') : '\nвсё чисто');
process.exit(fail ? 1 : 0);
