/* Звук в игре отключён полностью по просьбе (см. sound.js): модуль —
   заглушка, все функции которой ничего не делают. Но по всему сайту
   остаются вызовы BFSound.xxx() — и если хоть одной такой функции в
   заглушке нет, вызов бросит TypeError и уронит тот обработчик, где он
   стоит (чат, начало раунда, финиш, прыжок...). Этот тест следит, чтобы
   каждая вызываемая функция в заглушке была и вызывалась без ошибок. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };

// все клиентские файлы сайта, кроме тестов и служебных скриптов
const files = fs.readdirSync(__dirname).filter(f =>
  /\.(js|html)$/.test(f) && !/^(test-|verify-|audit-|repro-|harness|server|accounts|maps|extras)/.test(f));
const called = new Set();
files.forEach(f => {
  const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
  const re = /BFSound\.([A-Za-z_]\w*)\s*\(/g; let m;
  while ((m = re.exec(src))) called.add(m[1]);
});
called.delete('xxx');   // упоминание в комментарии sound.js, не вызов

// заглушку исполняем как в браузере
const sandbox = { window: {}, localStorage: { getItem: () => null, setItem: () => {} } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'sound.js'), 'utf8'), sandbox);
const S = sandbox.window.BFSound;
ok('sound.js выставляет window.BFSound', !!S && typeof S === 'object');

const missing = [...called].filter(n => !S || typeof S[n] !== 'function');
ok('в заглушке есть все вызываемые функции (' + called.size + ')', missing.length === 0, missing.join(', '));

let threw = [];
[...called].forEach(n => { try { S[n](); } catch (e) { threw.push(n + ': ' + e.message); } });
ok('каждая вызывается без ошибок', threw.length === 0, threw.join('; '));

ok('звук выключен — функции ничего не играют (нет Audio/AudioContext)',
   !/new\s+(Audio|AudioContext|webkitAudioContext)\b/.test(fs.readFileSync(path.join(__dirname, 'sound.js'), 'utf8')));

console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
process.exit(fails ? 1 : 0);
