/* Каждый ключ перевода — и через data-i18n/-ph/-title в HTML, и через
   T(...)/TR(...) в инлайн-скриптах и game.js — должен быть в словаре
   i18n.js на ОБОИХ языках. Если ключа нет вовсе, applyTo()/T() тихо
   оставляют висеть исходный (обычно английский, кое-где по ошибке
   русский — см. favToggle) текст независимо от выбранного языка.
   Так застряли storyHint (hide-and-seek.html, race.html), заголовок и
   подзаголовок Quests и Daily Reward (data-i18n), и Claim/Claimed/
   «New quests in»/бонус на самой странице Quests (T()) — ключи были
   размечены, но ни разу не добавлены в словарь ни на одном языке. */
'use strict';
const fs = require('fs');

const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.html') || f === 'game.js');
const i18nSrc = fs.readFileSync(__dirname + '/i18n.js', 'utf8');
const definedKeys = new Set(
  (i18nSrc.match(/^\s{4}(\w+):/gm) || []).map(s => s.trim().replace(':', ''))
);

const usages = [];
files.forEach(f => {
  const src = fs.readFileSync(__dirname + '/' + f, 'utf8');
  const reAttr = /data-i18n(?:-ph|-title)?="([^"]+)"/g;
  const reCall = /\b(?:TR|T)\(\s*['"]([A-Za-z0-9_]+)['"]/g;
  let m;
  while ((m = reAttr.exec(src))) usages.push({ key: m[1], file: f });
  while ((m = reCall.exec(src))) usages.push({ key: m[1], file: f });
});

let fail = 0;
const missing = usages.filter(u => !definedKeys.has(u.key));
const uniqMissing = [...new Map(missing.map(m => [m.key + '|' + m.file, m])).values()];
console.log('всего меток перевода: ' + usages.length + ' (data-i18n + T()/TR(), файлов: ' + files.length + ')');
if (uniqMissing.length) {
  fail = uniqMissing.length;
  uniqMissing.forEach(m => console.log('  ✗ нет ключа "' + m.key + '" в словаре (используется в ' + m.file + ')'));
} else {
  console.log('  ✓ у всех меток перевода есть ключ в словаре');
}

console.log(fail ? ('\n' + fail + ' ошибок') : '\nвсё чисто');
process.exit(fail ? 1 : 0);
