// Проверяем, что перевод ложится на весь интерфейс и не смешивается
const fs=require('fs');
const src=fs.readFileSync(__dirname+'/i18n.js','utf8');
const D=eval('('+src.match(/var D = (\{[\s\S]*?\n  \});/)[1]+')');
const AUTO=eval('('+src.match(/var AUTO = (\{[\s\S]*?\n  \});/)[1]+')');
const LANGS=eval(src.match(/var LANGS = (\[[^\]]*\]);/)[1]);

console.log('языков:',LANGS.length,'| ключей:',Object.keys(D).length);

// у каждого ключа перевод на все языки, ни одного пустого
let bad=0;
for(const [k,v] of Object.entries(D)){
  if(v.length!==LANGS.length){console.log('  ✗',k,'переводов',v.length);bad++;continue;}
  v.forEach((t,i)=>{ if(!t||!String(t).trim()){console.log('  ✗',k,'пусто для',LANGS[i]);bad++;} });
}
console.log(bad?`пропусков: ${bad}`:'Все ключи переведены на все языки.');

// строки подмены ведут на существующие ключи
let miss=0;
for(const [txt,key] of Object.entries(AUTO)) if(!D[key]){console.log('  ✗ нет ключа',key,'для',txt);miss++;}
console.log(miss?`битых ссылок: ${miss}`:'Все подмены указывают на существующие ключи.');

// смешение: нет ли одинакового текста, ведущего на разные ключи
const seen={};
let dup=0;
for(const [txt,key] of Object.entries(AUTO)){
  if(seen[txt]&&seen[txt]!==key){console.log('  ✗ «'+txt+'» ведёт и на',seen[txt],'и на',key);dup++;}
  seen[txt]=key;
}
console.log(dup?`конфликтов: ${dup}`:'Конфликтов подмены нет.');

// проверяем сам перевод на примере
function t(k,l){ return D[k][LANGS.indexOf(l)]; }
console.log('\nпример «Обзор карт»:');
LANGS.forEach(l=>console.log('  ',l.padEnd(3), t('mapsBrowser',l)));
