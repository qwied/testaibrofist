/* Картинки бота (discordCards.js): /servers и /account.
   - рисуются настоящие PNG нужного размера, в тёмной и светлой теме;
   - у профиля страницы: главная, карты и друзья кусками;
   - текст без символов, которых нет в шрифте (эмодзи и т.п.);
   - отдельный поток рисования отвечает и сам гаснет;
   - данные профиля — только то, что видно на странице игрока на сайте.
   Данные игроков — выдуманные, во временной папке; настоящий data/ тест не трогает.
   Запуск: node test-cards.js */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { PNG } = require('pngjs');

let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };
const C = require('./discordCards.js');
const png = buf => PNG.sync.read(buf);
const pixel = (img, x, y) => { const i = (img.width * y + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
const bright = p => (p[0] + p[1] + p[2]) / 3;

const now = Date.now();
const servers = { at: now, online: 21, rooms: 3, modes: { race: { players: 16 }, hideAndSeek: { players: 5 } }, list: [
  { mode: 'race', room: 'room1', players: 12, limit: 40, status: 'open', phase: null, secondsLeft: null, map: 'Ледяная гора' },
  { mode: 'race', room: 'room2', players: 4, limit: 40, status: 'freeing', phase: null, secondsLeft: null, map: null },
  { mode: 'hideAndSeek', room: 'room1', players: 5, limit: 40, status: 'open', phase: 'round', secondsLeft: 61, map: 'Forest' }] };
const profile = (maps, friends) => ({ at: now, name: 'qwied', joined: Date.UTC(2026, 1, 3), about: 'Hi! Привет',
  coins: 10, coinsDay: 1, coinsWeek: 2, score: 3, scoreDay: 0, scoreWeek: 1, hsScore: 4, hsScoreDay: 0, hsScoreWeek: 0,
  rank: { race: { rank: 'S' }, hs: null }, maps, mapsCount: maps.length, friends, friendsCount: friends.length });
const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));

(async () => {
  console.log('картинка /servers:');
  for (const th of ['dark', 'light']) {
    const t = Date.now();
    const img = png(await C._test.drawNow('servers', servers, th));
    const bg = bright(pixel(img, 4, 4));
    ok(th + ': PNG шириной 1200, высота по числу комнат, ' + (th === 'dark' ? 'тёмный' : 'светлый') + ' фон',
       img.width === 1200 && img.height === C._test.serversTree(servers, th).height && (th === 'dark' ? bg < 60 : bg > 200),
       img.width + 'x' + img.height + ', ' + (Date.now() - t) + ' мс');
  }
  const big = Object.assign({}, servers, { list: many(15, i => ({ mode: 'race', room: 'room' + i, players: 1, limit: 40, status: 'open' })) });
  const hBig = C._test.serversTree(big, 'dark').height, hEmpty = C._test.serversTree(Object.assign({}, servers, { list: [] }), 'dark').height;
  ok('комнат много — показаны первые, картинка не растёт без конца; пусто — картинка ниже', hBig < 1400 && hEmpty < hBig, hEmpty + ' / ' + hBig);
  ok('пустой сервер тоже рисуется', png(await C._test.drawNow('servers', { at: now, online: 0, rooms: 0, modes: {}, list: [] }, 'light')).width === 1200);

  console.log('\nкартинки /account:');
  const p1 = profile(many(8, i => ({ mapName: 'Map ' + i, mapType: i % 2 ? 'race' : 'hideAndSeek', rating: i - 3, likes: i, dislikes: 3, date: now, inGame: !i })),
                     many(13, i => ({ name: 'Friend' + i, lastSeen: now - i * 3600000 })));
  ok('страницы: главная, карты по 6, друзья по 12', C.pageCount(p1) === 1 + 2 + 2 &&
     C._test.profilePages(p1).map(p => p.kind).join() === 'main,maps,maps,friends,friends');
  ok('без карт и друзей — всё равно три страницы (с пометкой «пусто»)', C.pageCount(profile([], [])) === 3);
  for (let n = 0; n < C.pageCount(p1); n++) {
    const img = png(await C._test.drawNow('account', p1, n % 2 ? 'light' : 'dark', n));
    if (img.width !== 1200 || img.height !== 700) ok('страница ' + (n + 1) + ' размером 1200x700', false, img.width + 'x' + img.height);
  }
  ok('все страницы одного размера 1200x700 — при листании сообщение не прыгает', true);
  const out = png(await C._test.drawNow('account', p1, 'dark', 99));
  ok('номер страницы за пределами — последняя страница, без ошибки', out.width === 1200);

  console.log('\nтекст:');
  ok('эмодзи и прочее, чего нет в шрифте, убирается; кириллица остаётся', C.clean('Привет 😀 мир 你好') === 'Привет мир');
  ok('длинное обрезается многоточием', C.clean('a'.repeat(50), 10) === 'a'.repeat(9) + '…');
  ok('переносы строк — в пробел', C.clean('a\n\nb') === 'a b');

  console.log('\nпоток рисования:');
  let t = Date.now();
  const w1 = png(await C.draw('servers', servers, 'dark'));
  ok('отдельный поток рисует ту же картинку', w1.width === 1200, (Date.now() - t) + ' мс вместе с запуском');
  t = Date.now();
  await C.draw('account', p1, 'light', 1);
  const second = Date.now() - t;
  ok('следующая картинка — быстро (поток уже поднят)', second < 1500, second + ' мс');
  ok('несколько сразу — все дорисовываются', (await Promise.all([0, 1, 2].map(n => C.draw('account', p1, 'dark', n)))).every(b => b.length > 1000));
  C.stop();

  console.log('\nданные профиля (как на странице игрока):');
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-cards-'));
  ['accounts.js', 'fsAtomic.js', 'discordAuth.js', 'maps.js', 'ranks.js', 'skins.js', 'discordCards.js', 'serversInfo.js', 'discordApi.js']
    .forEach(f => fs.copyFileSync(path.join(__dirname, f), path.join(TMP, f)));
  fs.cpSync(path.join(__dirname, 'builtinMaps'), path.join(TMP, 'builtinMaps'), { recursive: true });
  fs.mkdirSync(path.join(TMP, 'data'));
  const day = 24 * 3600 * 1000;
  const user = (name, extra) => Object.assign({ name, joined: now - 30 * day, coins: 0, friends: [], incoming: [], outgoing: [],
                                                passwordHash: 'SECRET-HASH', salt: 'SECRET-SALT', discordId: '123456789' }, extra);
  fs.writeFileSync(path.join(TMP, 'data', 'users.json'), JSON.stringify({ sessions: { s1: 'tester' }, users: {
    tester: user('Tester', { coins: 50, score: 7, hsScore: 2, about: 'About me', friends: ['Ann', 'Ghost'], lastSeen: now }),
    ann: user('Ann', { lastSeen: now - 2 * day }),
    annette: user('Annette'),
    bob: user('Bob') } }));
  fs.writeFileSync(path.join(TMP, 'data', 'coinlog.json'), JSON.stringify([
    { name: 'Tester', amount: 5, at: now - 1000 }, { name: 'tester', amount: 7, at: now - 3 * day }, { name: 'Tester', amount: 100, at: now - 30 * day },
    { name: 'Bob', amount: 9, at: now }]));
  fs.writeFileSync(path.join(TMP, 'data', 'maps.json'), JSON.stringify([
    { author: 'Tester', mapName: 'Old', mapType: 'race', date: now - 10 * day, votes: { a: 1, b: 1, c: -1 }, mapData: '{}' },
    { author: 'tester', mapName: 'New', mapType: 'hideAndSeek', date: now - day, votes: {}, inGame: true, mapData: '{}' },
    { author: 'Bob', mapName: 'Bobs', mapType: 'race', date: now, votes: {}, mapData: '{}' }]));
  const TC = require(path.join(TMP, 'discordCards.js'));
  const d = TC.profileData('TESTER');
  ok('ник без учёта регистра', d && d.name === 'Tester');
  ok('монеты за день и неделю — из журнала, только свои', d && d.coins === 50 && d.coinsDay === 5 && d.coinsWeek === 12, d && [d.coinsDay, d.coinsWeek].join());
  ok('карты игрока: новые первыми, рейтинг = лайки - дизлайки, «в игре»', d && d.maps.map(m => m.mapName).join() === 'New,Old' &&
     d.maps[1].rating === 1 && d.maps[0].inGame === true && d.mapsCount === 2);
  ok('друзья: только существующие аккаунты, недавно бывшие первыми', d && d.friends.map(f => f.name).join() === 'Ann' && d.friendsCount === 1);
  const json = JSON.stringify(d);
  ok('ничего сверх страницы игрока: ни пароля, ни Discord, ни сессий', !/SECRET|123456789|passwordHash|salt|discordId|sessions/.test(json));
  ok('нет такого игрока — null', TC.profileData('nobody') === null && TC.profileData('') === null);
  ok('подсказки ников: начинающиеся с введённого — первыми', TC.searchNames('ann', 5).join() === 'Ann,Annette' &&
     TC.searchNames('e', 5).indexOf('Tester') !== -1 && TC.searchNames('', 2).length === 2);
  const sd = C.serversData();
  ok('сводка серверов — без имён игроков', sd && Array.isArray(sd.list) && !/"names"/.test(JSON.stringify(sd)));

  await new Promise(r => setTimeout(r, 500));          // maps.js/accounts.js сохраняют с задержкой
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('✗ тест упал:', e.stack); process.exit(1); });
