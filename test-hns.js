/* Прятки: реплики, сброс поимки и досрочный конец раунда.
   Проверяем сам game.js — его логика лежит в одном файле. */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/game.js', 'utf8');
let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };

console.log('реплики:');
ok('копятся стопкой',       /var list = spoken\[who\] \|\| \(spoken\[who\] = \[\]\);/.test(src));
ok('старая не затирается',  !/spoken\[who\] = \{ text: text, born: Date\.now\(\) \};/.test(src));
ok('лимит стопки',          /SAY_MAX/.test(src));
ok('рисуются все',          /for \(var si = 0; si < list\.length; si\+\+\)/.test(src));
ok('не наезжают друг на друга', /var lift = \(list\.length - 1 - si\) \* 15 \* tk;/.test(src));
ok('перенос длинных реплик',  /function wrapSay/.test(src) && /wrapSay\(sp\.text/.test(src));
ok('bidi-символы чистятся',   /BIDI_RE/.test(src) && /cleanSay\(text\)/.test(src));
ok('ник белый с обводкой',    /strokeText\(name/.test(src) && /#ffffff/.test(src));

console.log('\nотправка сообщений:');
ok('одна дорога отправки',  /function sendTyped/.test(src));
ok('Готово на айфоне шлёт', /if \(inp\.value\.trim\(\)\) sendTyped\(\);/.test(src));
ok('submit не перезагружает', /inp\.form\.addEventListener\('submit'/.test(src));
ok('реплики тают, а не рвутся', /old\.born = Date\.now\(\) - \(SAY_FADE - SAY_OUT\)/.test(src));
ok('растворение по времени', /SAY_OUT/.test(src) && /1 - SAY_OUT \/ SAY_FADE/.test(src));

console.log('\nпоимка:');
ok('сбрасывается функцией', /function clearCaught/.test(src));
ok('сброс в начале раунда', /clearCaught\(\);\s*\/\/ новый раунд/.test(src));
ok('сброс при уходе в лобби', (src.match(/clearCaught\(\);/g) || []).length >= 2);
ok('чужие тоже сбрасываются', /others\[id\]\.caught = false/.test(src));
ok('чужие поимки слышны',   /if \(others\[id\]\.name === who\) others\[id\]\.caught = true;/.test(src));
ok('имя сверяется целиком',  /\^\(\.\+\?\) пойман/.test(src));

console.log('\nконец раунда:');
ok('проверка «все пойманы»', /function checkAllCaught/.test(src));
ok('вызов после поимки',    /checkAllCaught\(\);/.test(src));
ok('один в комнате не считается', /if \(!ids\.length\) return;/.test(src));
ok('раунд переключается',   /switching = false; if \(!hsSync\) advance\(\);/.test(src));

console.log('\nрулетка искателя:');
ok('сервер выбирает искателя',  /socket\.on\('hsRoulette'/.test(src));
ok('состояние при входе',       /socket\.on\('hsState'/.test(src));
ok('фазы от сервера',           /socket\.on\('hsPhase'/.test(src));
ok('рулетка рисуется функцией', /function runRoulette/.test(src) && /runRoulette\(d\)/.test(src));
ok('оверлей на весь экран',    /#gRoul\{position:fixed;left:0;top:0;right:0;bottom:0/.test(src));
ok('карточка: скин + ник',      /className = 'rSkin'/.test(src) && /className = 'rName'/.test(src));
ok('рамка обводит победителя',  /frame\.classList\.add\('rwin'\)/.test(src) &&
                                /cards\[target\]\.classList\.add\('rWin'\)/.test(src));
ok('подсветка под рамкой',      /classList\.add\('rOn'\)/.test(src) && /requestAnimationFrame\(tick\)/.test(src));
ok('итог подписывается',        /roulYouSeek/.test(src) && /roulSeekerIs/.test(src) && /res\.classList\.add\('on'\)/.test(src));
ok('обводка синяя, не жёлтая',  /#gRoulFrame\.rwin\{border-color:#38bdf8/.test(src) && !/facc15/.test(src));
ok('цвет фигуры как в игре',    /function colorForCard/.test(src) &&
                                /color: colorForCard\(c\._pid\)/.test(src));
ok('шанс в правом верхнем',     /#gChance\{position:fixed;top:52px/.test(src) &&
                                /function showChance/.test(src) && /showChance\(\(d\.players\)/.test(src));
ok('шанс и на карточках',       /className = 'rPct'/.test(src) && /p\.chance/.test(src));
ok('в охоте видно всех',        /if \(o\.hid && hsWait\) return;/.test(src));
ok('лента едет одним ходом',    /transition = 'transform ' \+ spin \+ 'ms cubic-bezier/.test(src));
ok('стоп ровно на победителе',  /var target = seq\.length \+ winIdx;/.test(src) &&
                                /posOf\(target\)/.test(src));
ok('укладывается в лобби',      /var spin = Math\.min\(dur - 1100, left - 2400\);/.test(src));
ok('роль после остановки',      /applySeeker\(d\.winnerId\)/.test(src));
ok('обрыв связи — свой таймер', /socket\.on\('disconnect', function \(\) \{ hsSync = false; joined = false; \}\)/.test(src));

console.log('\nвидимость в прятках:');
ok('лобби: до результата никого',  /if \(!hsWinnerId\) return;/.test(src));
ok('лобби: искатель скрыт',        /if \(id === hsWinnerId\) return;/.test(src));
ok('лобби: искателю прячущихся не видно', /if \(me\.role === 'seeker'\) return;/.test(src));
ok('в раунде видно всех',          /var hsWait = MODE === 'hideAndSeek' && !VIEW && phase === 'lobby';/.test(src));
ok('все пойманы — сигнал серверу', /if \(hsSync\) socket\.emit\('hsCaught'\);/.test(src));

console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
process.exit(fails ? 1 : 0);
