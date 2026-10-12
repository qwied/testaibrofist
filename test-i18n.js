/* Словарь интерфейса: два языка, оба переведены целиком.
   Старая версия теста проверяла массивы переводов на десять языков —
   той схемы больше нет, ключ хранит строку, а русский лежит отдельной
   таблицей RU рядом с английской D. */
'use strict';
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/i18n.js', 'utf8');
let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };

const cut = src.indexOf('var RU = {');
ok('русская таблица на месте', cut > 0);
const enPart = src.slice(0, cut);
const ruPart = src.slice(cut);

function keys(block) {
  const out = new Map();
  const re = /^    ([A-Za-z0-9_]+): ("(?:[^"\\]|\\.)*")/gm;
  let m;
  while ((m = re.exec(block))) out.set(m[1], JSON.parse(m[2]));
  return out;
}
const EN = keys(enPart), RU = keys(ruPart);
console.log('ключей: английских ' + EN.size + ', русских ' + RU.size);

ok('язык по умолчанию английский', /var lang = 'en';/.test(src));
ok('русский берётся только при lang === ru', /if \(lang === 'ru' && RU\[key\]\) return RU\[key\];/.test(src));
ok('чего нет по-русски — падает в английский', /return D\[key\] \|\| key;/.test(src));

const noRu = [...EN.keys()].filter(k => !RU.has(k));
ok('у каждого ключа есть русский', noRu.length === 0, noRu.slice(0, 8).join(', '));
const noEn = [...RU.keys()].filter(k => !EN.has(k));
ok('лишних русских ключей нет', noEn.length === 0, noEn.slice(0, 8).join(', '));

const empty = [...EN.entries()].filter(([, v]) => !String(v).trim())
  .concat([...RU.entries()].filter(([, v]) => !String(v).trim()));
ok('пустых строк нет', empty.length === 0, empty.map(e => e[0]).join(', '));

// одинаковый ключ дважды в одном объекте — тихая потеря перевода
function dups(block) {
  const c = {}; const re = /^    ([A-Za-z0-9_]+): /gm; let m;
  while ((m = re.exec(block))) c[m[1]] = (c[m[1]] || 0) + 1;
  return Object.keys(c).filter(k => c[k] > 1);
}
ok('дублей ключей в английской таблице нет', dups(enPart).length === 0, dups(enPart).join(', '));
ok('дублей ключей в русской таблице нет', dups(ruPart).length === 0, dups(ruPart).join(', '));

// подстановки вида {n}/{t} должны совпадать, иначе в одном языке пропадёт число
const holes = s => (String(s).match(/\{[a-z]+\}/g) || []).sort().join(',');
const mism = [...EN.entries()].filter(([k, v]) => RU.has(k) && holes(v) !== holes(RU.get(k)));
ok('подстановки совпадают в обоих языках', mism.length === 0,
   mism.map(e => e[0] + ' (' + holes(e[1]) + ' vs ' + holes(RU.get(e[0])) + ')').join('; '));

// AUTO ведёт на существующие ключи
const auto = {};
const am = src.match(/var AUTO = \{[\s\S]*?\n  \};/);
if (am) { const re = /'([^']+)':\s*'([A-Za-z0-9_]+)'/g; let m; while ((m = re.exec(am[0]))) auto[m[1]] = m[2]; }
const badAuto = Object.entries(auto).filter(([, k]) => !EN.has(k));
ok('подмены ведут на существующие ключи', badAuto.length === 0, badAuto.map(e => e[1]).join(', '));

// ключи, которыми пользуются страницы
const files = fs.readdirSync(__dirname).filter(f => /\.(js|html)$/.test(f) && !/^test-|^i18n\.js$/.test(f));
const missing = new Set();
for (const f of files) {
  const t = fs.readFileSync(__dirname + '/' + f, 'utf8');
  const re = /\bTR\(\s*["']([A-Za-z0-9_]+)["']/g; let m;
  while ((m = re.exec(t))) if (!EN.has(m[1])) missing.add(m[1] + ' (' + f + ')');
}
ok('все TR()-ключи страниц есть в словаре', missing.size === 0, [...missing].slice(0, 6).join(', '));

console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
process.exit(fails ? 1 : 0);
