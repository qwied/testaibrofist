// Проверяем палитру объектов, конвертацию старых карт и новые правила движка
const fs=require('fs'), src=fs.readFileSync(__dirname+'/editor.html','utf8');
const game=fs.readFileSync(__dirname+'/game.html','utf8');

// список инструментов
const tools=eval('(function(){var ALL="hideAndSeek race";'+src.match(/var TOOLS = \[[\s\S]*?\];/)[0]+';return TOOLS;})()');
console.log('инструменты:', tools.map(t=>t.t).join(', '));
['poison','spike','bounce','platform','rotator','door','gate','cover'].forEach(t=>{
  console.log('  ', t.padEnd(9), tools.some(x=>x.t===t) ? '✗ ещё в палитре' : '✓ убран');
});

// конвертация старых карт
const conv = src.match(/if\(o\.type === "platform"\)[\s\S]*?if\(o\.type === "door" \|\| o\.type === "gate" \|\| o\.type === "cover"\)\{ o\.type = "rect"; \}/)[0];
function upgrade(o){ eval(conv); return o; }
const cases=[
  {type:'platform', moveX:0, moveY:0},
  {type:'rotator'},
  {type:'bounce'},
  {type:'poison'},
  {type:'spike'},
  {type:'door'},
  {type:'gate'},
  {type:'cover'}
];
console.log('\nстарые карты:');
for(const c of cases){
  const o=Object.assign({},c);
  upgrade(o);
  const props=Object.keys(o).filter(k=>k!=='type'&&o[k]).join(', ');
  console.log('  ', c.type.padEnd(9), '->', o.type.padEnd(6), '|', props||'—');
}

// движение/вращение/батут теперь по свойствам
console.log('\nв движке:');
const ok = (t,c)=>console.log('   '+t.padEnd(24)+':', c ? '✓' : '✗');
ok('движение по свойству',  /if\(o\.moves\)\{/.test(src));
ok('вращение по свойству',  /if\(o\.spins\)/.test(src));
ok('батут по свойству',     /if\(o\.bouncy\)\{/.test(src));
ok('несёт игрока',          /pl\.x \+= pl\.rideOn\._dx\|\|0; pl\.y \+= pl\.rideOn\._dy\|\|0;/.test(src));
ok('сдвиг платформы один раз', !/if\(o\.moves\)\{ pl\.x \+=/.test(src) && /if\(o\.moves\) pl\.rideOn = o;/.test(src));
ok('сторона по «откуда пришёл»', /var fromLeft  = \(xBefore \+ pl\.w\) <= leftWas \+ 2;/.test(src) &&
                                /var xBefore = pl\.x;/.test(src));
ok('толчок в темпе платформы', /var lim  = Math\.abs\(pdx\) \+ Math\.abs\(pl\.vx\) \+ 4;/.test(src) &&
                                /var move = Math\.min\(lim, Math\.abs\(edge - pl\.x\)\);/.test(src));
ok('вбок из глубины не швыряет', /> Math\.abs\(pl\.vx\) \+ 8\) return;/.test(src));
ok('вертикальный вынос в темпе', /var limY = Math\.abs\(pdy\) \+ Math\.abs\(pl\.vy\) \+ 4;/.test(src));
ok('угол отталкивает вбок, не наверх', /var spX = spanX\(P, pl\.y \+ 2, pl\.y \+ pl\.h - 2\);/.test(src) &&
                                /var side = Math\.min\(lPen, rPen\), vert = Math\.min\(uPen, dPen\);/.test(src) &&
                                /if\(side <= vert\)\{/.test(src) &&
                                /pl\.x = spX\[0\] - pl\.w; if\(pl\.vx > 0\) pl\.vx = 0; pl\.wall = 1;/.test(src) &&
                                /pl\.x = spX\[1\];        if\(pl\.vx < 0\) pl\.vx = 0; pl\.wall = -1;/.test(src));
ok('то же в игре',          /var spX = spanX\(P, pl\.y \+ 2, pl\.y \+ pl\.h - 2\);/.test(game) &&
                                /if\(side <= vert\)\{/.test(game) &&
                                !/<= 32\)/.test(game));
ok('глубокий провал всё ещё ставит сверху', /pl\.y = sp\[0\] - pl\.h; pl\.ground = true; coy = COYOTE; pl\.vy = 0; pl\.selfJump = false;/.test(src) &&
                                /pl\.y = sp\[0\] - pl\.h; pl\.ground = true; coy = COYOTE; pl\.vy = 0; pl\.selfJump = false;/.test(game));
ok('прыжок не режется сразу', /MIN_HOLD = 7;/.test(src) && /JUMP_H = 152,/.test(src) &&
                                /pl\.selfJump && hold > MIN_HOLD/.test(src));
ok('посадка по «откуда пришёл»', /var fromTop   = \(yBefore \+ pl\.h\) <= topWas \+ 2;/.test(src) &&
                                /var yBefore = pl\.y;/.test(src));
ok('удар головой по «откуда пришёл»', /pl\.vy < 0 && \(!o\.moves \|\| fromBelow\)/.test(src));
ok('толчок только у движущихся', /var pdx = o\.moves \? \(o\._dx\|\|0\) : 0;/.test(src) &&
                                /var pdy = o\.moves \? \(o\._dy\|\|0\) : 0;/.test(src));
ok('статика ведёт себя как раньше', /if\(pl\.vx !== 0\) pl\.wall = 1;/.test(src));
ok('то же в игре',          /pl\.rideOn/.test(game) && !/if\(o\.moves\)\{ pl\.x \+=/.test(game));
ok('плоская заливка',       /function grad\([^)]*\)\{ return a; \}/.test(src));
ok('блика на игроке нет',   !/rgba\(255,255,255,\.22\)/.test(src));
ok('теней у объектов нет',  !/shadowColor = "rgba\(15,23,42/.test(src));
ok('холст не темнеет',      !/night/.test(src));

// плоские фигуры без бликов и скруглений
console.log('\nмодели фигур:');
const paint = src.match(/var PAINT = \{[\s\S]*?\n\};/);
const three = src.match(/  rect: function[\s\S]*?  text: function/)[0];
ok('rect без скруглений',   /ctx\.fillRect\(0,0,o\.w,o\.h\)/.test(three) && !/rr\(0,0,o\.w,o\.h/.test(three));
ok('без бликов у фигур',    !/rgba\(255,255,255/.test(three));
ok('без градиента у круга', !/createRadialGradient/.test(three));

// хитбоксы
console.log('\nхитбоксы:');
ok('круг многоугольником',  /CIRCLE_SIDES = 32/.test(src));
ok('треугольник по 3 точкам', /o\.type === "triangle"[\s\S]{0,80}\[o\.w\/2,0\],\[o\.w,o\.h\],\[0,o\.h\]/.test(src));
ok('SOLID = 3 фигуры',      /var SOLID  = \["rect","circle","triangle"\];/.test(src));

// прятки
console.log('\nпрятки:');
ok('укрытие без коллизии',  /o\.hideSpot !== true/.test(src));
ok('флаг спрятанности',     /pl\.hidden = true/.test(game));
ok('мост GAME.hidden',      /get hidden\(\)/.test(game));
const gjs=fs.readFileSync(__dirname+'/game.js','utf8');
ok('флаг уходит по сети',   /hid: !!GAME\.hidden/.test(gjs));
ok('укрытие прячет в прятки', /if \(o\.hid && hsWait\) return;/.test(gjs));
ok('в охоте укрытие не спасает', !/o\.caught \|\| o\.hid/.test(gjs));

// размеры и гравитация
console.log('\nразмеры и гравитация:');
ok('префаб 20x20',          /rect:\[20,20\], circle:\[20,20\], triangle:\[20,20\]/.test(src));
ok('игрок 20x60',           /spawn:\[20,60\]/.test(src) && /var pl = \{x:0,y:0,w:20,h:60,/.test(src));
ok('гравитация 9',          /var gravityScale = 9;/.test(src));
ok('ползунка нет',          !/id="grav"/.test(src) && !/id="grav"/.test(game));
ok('размер игрока не правят', /if\(sel\.type !== "spawn"\)/.test(src));

// рикошет вместо батута
console.log('\nрикошет:');
ok('батута нет',            !/chk\("Батут"/.test(src) && !/chk\("Батут"/.test(game));
ok('отражение по X',        /if\(o\.ricochet && Math\.abs\(pl\.vx\) > RICO_MIN\)/.test(src));
ok('отражение сверху',      /if\(o\.ricochet && pl\.vy > RICO_MIN\)/.test(src));
ok('отражение снизу',       /if\(o\.ricochet && Math\.abs\(pl\.vy\) > RICO_MIN\)/.test(src));

console.log('\nдублирование:');
ok('Ctrl+D на месте',       /mod && e\.code === "KeyD"/.test(src));
ok('Alt и потащить',        /down\(p\.x, p\.y, e\.altKey/.test(src) && /if\(alt && !overLimit\(1\)\)/.test(src));

// стены, топление, буфер обмена
console.log('\nстены:');
ok('карабканья нет',        !/pl\.vx = -pl\.wall\*wallVX\(\)/.test(src) && !/pl\.vx = -pl\.wall\*wallVX\(\)/.test(game));
ok('скольжение только в воздухе', /if\(pl\.wall !== 0 && pl\.vy > WALL_SLIDE\)/.test(src) && /if\(pl\.wall !== 0 && pl\.vy > WALL_SLIDE\)/.test(game));

console.log('\nбатут:');
ok('сила настраивается',    /rng\("Сила отскока"/.test(src));
ok('отскок по нормали',     /function faceNormal/.test(src) && /function ricochet\(o\)/.test(src));
ok('наклон учитывается',    /var pts = polyOf\(o\)/.test(src));
ok('сила из свойства',      /o\.power === undefined \? 1 : o\.power/.test(src));
ok('старые батуты мигрируют', src.indexOf('o.power = Math.max(0.2, Math.min(3, (o.power || 17) / 12.3));') !== -1);

console.log('\nгенератора в редакторе нет:');
ok('скриптов нет',          !/mapGen\.js/.test(src) && !/mapNLU\.js/.test(src));
ok('помощник остался',      /editorHelp\.js/.test(src) && /editorAI\.js/.test(src));

console.log('\nфиниш и старт:');
ok('перезапуск одной функцией', /function restartRun\(\)/.test(src) && /function restartRun\(\)/.test(game));
ok('сам стартует после финиша', /finishTimer = setTimeout/.test(src) && /finishTimer = setTimeout/.test(game));
ok('в редакторе R перезапускает пробу', /clearTimeout\(finishTimer\); restartRun\(\);/.test(src));
ok('в игре R ничего не делает',  !/KeyR/.test(game));
ok('старт рядом с финишем',     /function spawnTooClose/.test(src) && /SPAWN_GAP = 320/.test(src));
ok('проверка при запуске',      /var near = spawnTooClose\(\);/.test(src));
ok('проверка при публикации',   /Старт слишком близко к финишу/.test(src));

console.log('\nбуфер обмена:');
ok('Ctrl+C копирует',       /mod && e\.code === "KeyC"/.test(src) && /function copySel/.test(src));
ok('Ctrl+V вставляет',      /mod && e\.code === "KeyV"/.test(src) && /function pasteAt/.test(src));
ok('копия по центру мыши',  /c\.x = snapN\(x - c\.w\/2\)/.test(src));
ok('курсор отслеживается',  /mouseW = p;/.test(src));

console.log('\nинтерфейс:');
ok('отдаление ограничено',  /Math\.min\(4000, Math\.max\(0\.2/.test(src) && /Math\.min\(4000, Math\.max\(0\.2/.test(game));
ok('колесо работает в игре', !/if\(playing\) return; e\.preventDefault\(\);\s*\n\s*zoomAt/.test(src)
   && !/if\(playing\) return; e\.preventDefault\(\);\s*\n\s*zoomAt/.test(game));
ok('в игре панелей нет',    /body\.play #scene/.test(src) && /body\.play #bfPublish/.test(src));
ok('панель помощника тоже', /body\.play #genBox/.test(src));
ok('HUD в правом нижнем',   /#hud\{display:none;position:fixed;right:14px;bottom:14px/.test(src));
ok('HUD компактный',        /padding:6px 7px/.test(src));
ok('кнопка публикации своя', /#bfPublish\{position:fixed/.test(src) && /linear-gradient\(180deg,#2f8bff,#1667e0\)/.test(src));
ok('на кнопке значок',      /<svg viewBox="0 0 24 24"><path d="M12 16V5"/.test(src));

console.log('\nодна модель игрока:');
ok('метка старта скрыта в игре', /if\(playing && ro\.type === "spawn"\) continue;/.test(src));
ok('то же в игре',              /if\(playing && ro\.type === "spawn"\) continue;/.test(game));

// вода удалена полностью: ни инструмента, ни жидкости, ни плавания
console.log('\nвода удалена:');
ok('инструмента «Вода» нет в палитре', tools.every(x => x.t !== 'water' && x.t !== 'liquid'));
ok('иконки-капли нет', !/Иконка инструмента «Вода»/.test(src) && !/Иконка инструмента «Вода»/.test(game));
ok('жидкости-частиц нет в редакторе', !/lqChunks/.test(src) && !/liqStep/.test(src) && !/seedLiquid/.test(src) && !/LQ_CELL_CAP/.test(src));
ok('жидкости-частиц нет в игре',     !/lqChunks/.test(game) && !/liqStep/.test(game) && !/seedLiquid/.test(game) && !/LQ_CELL_CAP/.test(game));
ok('литья из курсора нет', !/startPour/.test(src) && !/startPour/.test(game) && !/pourParts/.test(src) && !/pourParts/.test(game));
ok('плавания нет', !/WTR_/.test(src) && !/WTR_/.test(game) && !/inWater/.test(src) && !/inWater/.test(game));
ok('кисти и localStorage воды нет', !/bfWaterBrush/.test(src) && !/bfWaterBrush/.test(game));
ok('брызги воды убраны', !/function splash\(/.test(src) && !/function splash\(/.test(game));
ok('mk("water") больше не создаётся', !/mk\("water"/.test(src) && !/mk\("water"/.test(game));
ok('старая вода выбрасывается при загрузке', /o\.type !== "water" && o\.type !== "liquid"/.test(src) && /o\.type !== "water" && o\.type !== "liquid"/.test(game));
ok('редактор стартует пустым', /objects = \[\];/.test(src) && !/objects = demo\(\)/.test(src));
ok('галочки «Кислота» больше нет', !/Кислота \(убивает\)/.test(src) && !/Кислота \(убивает\)/.test(game));
ok('сохранение без liquid', !/liquid:liqSer/.test(src) && !/liquid:liqSer/.test(game) && !/liqDe/.test(src) && !/liqDe/.test(game));
const maps=fs.readFileSync(__dirname+'/maps.js','utf8');
ok('сервер принимает старые карты', /water:null/.test(maps));

console.log('\nразмер игрока:');
ok('ручек у старта нет',    /sel\.type === "spawn"\) return null/.test(src));
ok('рамка без ручек',       /isSel && o\.type !== "spawn"/.test(src));

// прыжок с удержанием
console.log('\nиконка и поисковики:');
const srvS = fs.readFileSync(__dirname + '/server.js', 'utf8');
ok('robots.txt отдаётся',   /app\.get\('\/robots\.txt'/.test(srvS) && /Sitemap: '/.test(srvS));
ok('карта сайта отдаётся',  /app\.get\('\/sitemap\.xml'/.test(srvS) && /<urlset/.test(srvS));
ok('хост берётся из запроса', /function siteOrigin\(req\)/.test(srvS));
ok('игровые комнаты не индексируются', /Disallow: \/game\.html/.test(srvS));
const pagesHtml = fs.readdirSync(__dirname).filter(f => f.endsWith('.html'));
ok('canonical на всех страницах', pagesHtml.every(f =>
   /<link rel="canonical" href="https:\/\//.test(fs.readFileSync(__dirname + '/' + f, 'utf8'))));
ok('превью для соцсетей везде', pagesHtml.every(f =>
   /og:image/.test(fs.readFileSync(__dirname + '/' + f, 'utf8'))));
ok('иконка непрозрачная в середине', (() => {
  const ico = fs.readFileSync(__dirname + '/favicon.ico');
  return ico.length > 4000 && ico.readUInt16LE(4) >= 5;      // не меньше пяти размеров внутри
})());
ok('превью-картинка на месте', fs.existsSync(__dirname + '/preview.png'));

console.log('\nпрыжок:');
ok('удержание = повтор',    /if\(keys\.u && !pl\.selfJump && \(pl\.ground \|\| coy > 0\)\) buf = BUFFER;/.test(src));
ok('то же в игре',          /if\(keys\.u && !pl\.selfJump && \(pl\.ground \|\| coy > 0\)\) buf = BUFFER;/.test(game));
