/* Помощник редактора: попадает ли вопрос в нужную тему и отличает ли
   вопрос от просьбы собрать карту. */
const H = require('./editorHelp.js');
let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };

console.log('темы:');
const Q = [
  ['какие горячие клавиши?',            'hotkeys'],
  ['как скопировать объект быстро',     'hotkeys'],
  ['что такое рикошет',                 'ricochet'],
  ['куда делся батут',                  'ricochet'],
  ['как спрятаться от искателя',        'hide'],
  ['как связать кнопку с воротами',     'links'],
  ['какой размер у игрока',             'size'],
  ['можно ли менять гравитацию',        'size'],
  ['сколько монет разрешено',           'coins'],
  ['как сделать финиш в гонке',         'race'],
  ['какой максимальный разрыв прыжка',  'jump'],
  ['как сделать шипы',                  'traps'],
  ['как заставить платформу двигаться', 'move'],
  ['как опубликовать карту',            'publish']
];
for (const [q, want] of Q) {
  const a = H.ask(q);
  ok(q, a && a.topic === want, a ? '→ ' + a.topic : '→ null');
}

console.log('\nустойчивость:');
let crash = 0;
for (const j of [null, undefined, '', '   ', '???', 'a'.repeat(3000), 42, {}])
  { try { H.ask(j); } catch (e) { crash++; console.log('   ✗', e.message); } }
ok('мусор не роняет помощника', crash === 0);
ok('на непонятное есть ответ', H.ask('абракадабра').answer === H.FALLBACK);
ok('пустое даёт null', H.ask('') === null);

console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
process.exit(fails ? 1 : 0);
