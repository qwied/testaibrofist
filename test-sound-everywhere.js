/* sound.js подключён был только в game.html и editor.html — на всех
   остальных 11 страницах сайта (главная, прятки/гонка-лобби, квесты,
   награда дня, лидерборд, логи, maps browser, сообщения, story, users)
   window.BFSound не существовал вовсе, и ни один делегированный
   обработчик (клик/печать) там физически не мог сработать — не то что
   «звук не на всех виджетах», а звука не было на странице целиком. */
'use strict';
const fs = require('fs');
let fails = 0;
const ok = (n, c) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n); };

const pages = fs.readdirSync(__dirname).filter(f => f.endsWith('.html'));
console.log('страниц найдено: ' + pages.length);
pages.forEach(f => {
  const src = fs.readFileSync(__dirname + '/' + f, 'utf8');
  ok(f + ' подключает sound.js', /<script src="sound\.js\?v=\d+"><\/script>/.test(src));
});

console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсё чисто');
process.exit(fails ? 1 : 0);
