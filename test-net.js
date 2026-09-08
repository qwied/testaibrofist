/* Сеть: сглаживание чужих игроков. Гоняем НАСТОЯЩИЙ код из game.js —
   функции вырезаются из файла и исполняются здесь, поэтому тест
   проверяет то, что реально работает в игре, а не его пересказ. */
const fs = require('fs');

let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };

const game = fs.readFileSync(__dirname + '/game.js', 'utf8');
const srv = fs.readFileSync(__dirname + '/server.js', 'utf8');

/* ---------- достаём сетевые функции из game.js ---------- */
const from = game.indexOf('  var byNid = {};');
const to = game.indexOf('\n  }', game.indexOf('function sample(o, rt)')) + 4;
if (from < 0 || to < 4) { console.log('не нашёл сетевой блок в game.js'); process.exit(1); }

let clock = 1000;
global.window = { performance: { now: () => clock } };
const net = new Function('return (function () {' + game.slice(from, to)
  + '; return { sample: sample, noteSnapshot: noteSnapshot, pushSnap: pushSnap,'
  + ' interp: function () { return interp; } }; })();')();

const feed = (o, times, xs) => times.forEach((t, i) => { net.noteSnapshot(t); net.pushSnap(o, t, xs[i], 0); });

console.log('интерполяция:');
{
  const o = {};
  feed(o, [1000, 1050], [0, 100]);
  ok('середина между кадрами', Math.round(net.sample(o, 1025).x) === 50, net.sample(o, 1025).x);
  ok('точно на кадре — точное значение', net.sample(o, 1050).x === 100);
  ok('до первого кадра не улетает', net.sample(o, 900).x === 0);
  ok('один кадр не роняет', net.sample({ buf: [{ t: 1000, x: 7, y: 7 }] }, 1200).x === 7);
  ok('пустой буфер отдаёт null', net.sample({}, 1200) === null);
}

console.log('\nровность хода:');
{
  /* Живая симуляция: игрок бежит 300 px/с, кадры приходят раз в 50 мс,
     экран рисует 60 раз в секунду. Смотрим на шаг между соседними
     кадрами отрисовки — именно он и есть «плавность». */
  const o = {};
  const steps = [];
  let prev = null, nextSnap = 1000, frame = 0;
  for (let t = 1000; t <= 2000; t += 16.7) {
    while (nextSnap <= t) {                        // пришёл очередной пакет
      net.noteSnapshot(nextSnap);
      net.pushSnap(o, nextSnap, frame++ * 15, 0);
      nextSnap += 50;
    }
    const s = net.sample(o, t - 100);
    if (prev !== null && t > 1200) steps.push(s.x - prev);
    prev = s.x;
  }
  const min = Math.min.apply(null, steps), max = Math.max.apply(null, steps);
  ok('шаг между кадрами одинаковый', max - min < 0.01, 'разброс ' + (max - min).toFixed(4) + ' px');
  ok('игрок реально движется', min > 4, 'шаг ' + min.toFixed(2) + ' px');

  // как было раньше: догоняние цели с коэффициентом 0.3
  let x = 0, target = 0, k = 0, lag = [];
  for (let i = 0; i < 40; i++) {
    if (i % 3 === 0) { target = ++k * 15; }        // пакет раз в ~50 мс при 60 fps
    x += (target - x) * 0.3;
    lag.push(target - x);
  }
  const oldLag = lag.slice(-10).reduce((a, b) => a + b, 0) / 10;
  ok('старое сглаживание отставало от цели', oldLag > 8, 'на ' + oldLag.toFixed(1) + ' px постоянно');
}

console.log('\nпотери и паузы:');
{
  const o = {};
  feed(o, [1000, 1050, 1100], [0, 50, 100]);
  const ext = net.sample(o, 1160);                 // кадр опоздал на 60 мс
  ok('пропущенный кадр продолжает движение', ext.x > 100 && ext.x < 200, 'x=' + Math.round(ext.x));
  const far = net.sample(o, 1400);                 // связь пропала надолго
  ok('экстраполяция ограничена', far.x <= 100 + 120, 'x=' + Math.round(far.x));
  const back = net.sample(o, 4000);                // вкладку свернули и вернули
  ok('после свёрнутой вкладки без телепорта', back.x === 100);
}

console.log('\nбуфер под сеть:');
{
  clock = 1000;
  const o = {};
  for (let i = 0; i < 40; i++) net.noteSnapshot(1000 + i * 50);
  const even = net.interp();
  ok('на ровной сети буфер маленький', even <= 90, even.toFixed(0) + ' мс');
  for (let i = 0; i < 20; i++) net.noteSnapshot(3000 + i * 170);
  const rough = net.interp();
  ok('на дёрганой сети буфер растёт', rough > even, rough.toFixed(0) + ' мс');
  ok('и не выходит за потолок', rough <= 150, rough.toFixed(0) + ' мс');
}

console.log('\nсервер:');
ok('кадр комнаты 30 раз в секунду', /const SNAP_MS = 33;/.test(srv) && /\}, SNAP_MS\)/.test(srv));
ok('позиция больше не рассылается по пакету', !/emit\('playerMoved'/.test(srv));
ok('вместо рассылки — пометка изменения', /player\.dirty = true;/.test(srv));
ok('в кадр попадают только изменившиеся', /if \(!p\.dirty && !key\) return;/.test(srv));
ok('опорный кадр раз в секунду', /const KEY_EVERY = 30;/.test(srv) &&
   /const key = \(\+\+snapTick % KEY_EVERY\) === 0;/.test(srv));
ok('опорный кадр доставляется гарантированно', /if \(key\) io\.to\(room\)\.emit\('state', frame\);/.test(srv));
ok('на вход в комнату состояние шлётся полностью', /roomPlayers\.forEach\(p => \{ p\.sent = \{\}; p\.dirty = true; \}\);/.test(srv));
ok('кадр уходит одним сообщением', /io\.to\(room\)\.volatile\.emit\('state', frame\)/.test(srv));
ok('подвисший клиент не копит очередь', /\.volatile\./.test(srv));
ok('редкие поля только при изменении', /if \(pos\.color !== last\.color\)/.test(srv) && /if \(pos\.sk !== last\.sk\)/.test(srv));
ok('опорный кадр несёт всё состояние', /if \(key\) p\.sent = \{\};/.test(srv));
ok('короткий номер вместо socket.id', /nid: \(nidSeq = /.test(srv) && /n: p\.nid/.test(srv));
ok('скин не теряется, если его не прислали', /else if \(player\.position\) pos\.sk = player\.position\.sk;/.test(srv));
ok('сжатие мелких пакетов выключено', /perMessageDeflate: false/.test(srv));
ok('замер задержки на сервере', /socket\.on\('pingCheck'/.test(srv) && /socket\.emit\('pongCheck', t\)/.test(srv));
ok('лимит движения поднят под 30 Гц', /socketLimiter\(90, 700\)/.test(srv));
ok('TCP_NODELAY включён', /setNoDelay\(true\)/.test(srv));
ok('чужие сайты сокет открыть не могут', /allowRequest: \(handshake, cb\)/.test(srv));
ok('мёртвые saveMap/getMaps удалены', !/socket\.on\('saveMap'/.test(srv) && !/socket\.on\('getMaps'/.test(srv));
ok('история чата только своей комнаты', !/const room = data\.room \|\| 'main';/.test(srv));

console.log('\nклиент:');
ok('темп отправки: 30 Гц на старом сервере / 20 Гц через воркер / 1 Гц одному',
   /var minGap = alone \? 1000 : sendGap;/.test(game) && /sendGap = wsActive \? 50 : 33;/.test(game) && /now - lastSent >= minGap/.test(game));
ok('быстрый сервер включается одной строкой (DEFAULT_WS_URL)', /var DEFAULT_WS_URL = ''/.test(game));
ok('воркер: шим socket.io на чистом WebSocket', /function makeSocket/.test(game) && /new WebSocket\(url\)/.test(game));
ok('воркер недоступен — авто-возврат на старый сервер', /wsGaveUp = true;/.test(game) && /setTimeout\(connect, 0\)/.test(game));
ok('переподключение не плодит таймеры пинга', /if \(pingTimer\) clearInterval\(pingTimer\);/.test(game));
ok('стоящий игрок не шлёт пакеты', /if \(now - lastSent >= minGap && \(moved \|\| force\)\) \{/.test(game));
ok('контрольный пакет раз в секунду', /now - lastForce > 1000/.test(game));
ok('скин уходит только при смене', /if \(mySkinStr !== lastSk\)/.test(game));
ok('рисуем по буферу, а не догоняем', /var s = sample\(o, rt\);/.test(game));
ok('старое догоняние осталось запасным', /else \{ o\.x \+= \(o\.tx - o\.x\) \* 0\.3;/.test(game));
ok('снапшоты разбираются по номеру', /var e = list\[i\], o = byNid\[e\.n\];/.test(game));
ok('старый сервер тоже поддержан', /socket\.on\('playerMoved'/.test(game));
ok('пинг виден игроку', /id="gPing"/.test(game) && /socket\.emit\('pingCheck'/.test(game));
ok('скин берётся из списка комнаты', /function applyKnown/.test(game) && /applyKnown\(o, p\.position\);/.test(game));
ok('после переподключения скин уходит заново', /lastSk = null;/.test(game) && /prev\.x = prev\.y = prev\.w = prev\.h = null;/.test(game));
ok('вход новичка — скин переотправляется всем (сброс в playerJoined)', /bindNid\(others\[p\.id\]\);[\s\S]{0,400}lastForce = 0;/.test(game));
ok('движение не уходит до подтверждения входа', /var joined = false;/.test(game) &&
   /if \(!socket \|\| !joined \|\| !GAME\.playing\) return;/.test(game) &&
   /joined = true;/.test(game));
ok('палочки в чате больше нет', !/'▏'/.test(game));
ok('websocket первый, polling запасной', /transports: \['websocket', 'polling'\], tryAllTransports: true/.test(game));
ok('пик задержки забывается быстрее', /gapPeak \* 0\.9/.test(game));
ok('потерянная картинка скина донавешивается', /imgCache\[o\.name\]\) o\.skin\.img = imgCache\[o\.name\];/.test(game));

const i18n = fs.readFileSync(__dirname + '/i18n.js', 'utf8');
ok('подпись пинга переводится', /gPing:\s+\[/.test(i18n) && /gPingMs:\s+\[/.test(i18n));

const gameHtml = fs.readFileSync(__dirname + '/game.html', 'utf8');
const editorHtml = fs.readFileSync(__dirname + '/editor.html', 'utf8');
ok('второе соединение из игры убрано', !/const socket = io\(\);/.test(gameHtml));
ok('второе соединение из редактора убрано', !/const socket = io\(\);/.test(editorHtml));

/* v103: плавность */
[gameHtml, editorHtml].forEach((html, i) => {
  const nm = i === 0 ? 'игра' : 'редактор';
  ok('камера не отстаёт от игрока (' + nm + ')',
     /view\.x = VW\(\)\/2 - \(pl\.x\+pl\.w\/2\)\*view\.s; view\.y = VH\(\)\*0\.6/.test(html));
  ok('фон кэшируется (' + nm + ')', /if\(!bgGrad \|\| bgH !== VH\(\)\)/.test(html));
  ok('адаптивное разрешение держит FPS (' + nm + ')',
     /QUALITY = Math\.max\(0\.5, QUALITY - 0\.25\)/.test(html) && /DPR = DPR_BASE \* QUALITY;/.test(html));
});

const logsHtml = fs.readFileSync(__dirname + '/logs.html', 'utf8');
const lbHtml = fs.readFileSync(__dirname + '/leaderboard.html', 'utf8');
ok('кнопки новостей переведены', /T\('removeTxt', 'Удалить'\)/.test(logsHtml) && /T\('editTxt', 'Изменить'\)/.test(logsHtml));
ok('заголовок лидеров переведён', /data-i18n="lbSub"/.test(lbHtml) && /lbSub:\s+\[/.test(i18n));
ok('страницы режимов переведены', /data-i18n="hsRule1"/.test(fs.readFileSync(__dirname + '/hide-and-seek.html', 'utf8')) &&
   /data-i18n="raceRule1"/.test(fs.readFileSync(__dirname + '/race.html', 'utf8')));

console.log(fails ? '\n✗ ошибок: ' + fails : '\n✓ всё зелено');
process.exit(fails ? 1 : 0);
