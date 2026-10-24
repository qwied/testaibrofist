/* Текст в игре (ник, тег клана, реплики, набираемый текст) обведён одной серой обводкой, и буквы никогда
   не должны сливаться с ней. Раньше набираемый текст был ровно цвета обводки (#6b7280) и превращался в
   серую полосу, а реплика по умолчанию (#3a3a3a) терялась на сером. Проверяем саму функцию из game.js
   на записывающем холсте: для любого оттенка серого цвет букв и цвет обводки заметно различаются; цвета
   по умолчанию у реплики и набираемого текста — не серые, близкие к обводке. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };

const src = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
const a = src.indexOf('  var INK_EDGE'), b = src.indexOf('  /* Мьют чата');
ok(a > 0 && b > a, 'в game.js найдена функция обводки');
if (!(a > 0 && b > a)) { console.log(pass + ' ok, ' + fail + ' fail'); process.exit(1); }
const sb = {};
vm.createContext(sb);
vm.runInContext(src.slice(a, b) + ';this.inkText = inkText; this.inkEdgeFor = inkEdgeFor;', sb);
const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const dist = (x, y) => { const p = rgb(x), q = rgb(y); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const hex = g => '#' + [g, g, g].map(v => v.toString(16).padStart(2, '0')).join('');

// оттенки серого: от чёрного до белого
let worst = 999, worstAt = '';
for (let g = 0; g < 256; g++) {
  const c = hex(g), d = dist(c, sb.inkEdgeFor(c));
  if (d < worst) { worst = d; worstAt = c; }
}
ok(worst >= 60, 'ни один серый не сливается со своей обводкой', 'худший ' + worstAt + ': разница ' + Math.round(worst));

// цвета, которые выбирают игроки: у всех обычных обводка — одна и та же серая
const same = ['#e11d48', '#16a34a', '#2563eb', '#facc15', '#ffffff', '#000000', '#3a3a3a'].every(c => sb.inkEdgeFor(c) === '#6b7280');
ok(same, 'у красного, зелёного, синего, жёлтого, белого, чёрного обводка одна и та же серая #6b7280');
ok(sb.inkEdgeFor('#6b7280') !== '#6b7280', 'у серого цвета обводки обводка другая (светлая или тёмная)', sb.inkEdgeFor('#6b7280'));
ok(sb.inkEdgeFor('#xyz') === '#6b7280' && sb.inkEdgeFor(undefined) === '#6b7280', 'мусорный цвет не ломает отрисовку');

// запись на холст: контур рисуется до заливки, заливка — цветом букв
const calls = [];
const ctx = { fillStyle: '', strokeStyle: '', lineWidth: 0, lineJoin: '', strokeText() { calls.push(['stroke', this.strokeStyle, this.lineWidth]); }, fillText() { calls.push(['fill', this.fillStyle]); } };
sb.inkText(ctx, 'hi', 0, 0, 1, '#16a34a');
ok(calls.length === 2 && calls[0][0] === 'stroke' && calls[1][0] === 'fill' && calls[1][1] === '#16a34a', 'сначала контур, потом заливка цветом букв');
ctx.lineWidth = 0; sb.inkText(ctx, 'hi', 0, 0, 2, '#16a34a');
ok(ctx.lineWidth === 6.8, 'толщина контура растёт вместе с масштабом на телефоне', String(ctx.lineWidth));

// цвета по умолчанию в самой игре
const say = /function paintSay\([^)]*\)\s*\{\s*inkText\(ctx, t, x, y, tk, color \|\| '(#[0-9a-f]{6})'\)/i.exec(src);
const typing = /paintSay\(ctx, cleanSay\(say\), cx, topY - SAY_GAP \* tk, tk, '(#[0-9a-f]{6})'\)/i.exec(src);
ok(!!say && dist(say[1], '#6b7280') >= 100, 'реплика по умолчанию заметно отличается от серой обводки', say && say[1]);
ok(!!typing && dist(typing[1], '#6b7280') >= 100, 'набираемый текст заметно отличается от серой обводки', typing && typing[1]);
ok(!!say && !!typing && say[1].toLowerCase() !== typing[1].toLowerCase(), 'набираемое и отправленное выглядят по-разному');

console.log(pass + ' ok, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
