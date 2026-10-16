/* Серверы игры: открытая сводка /api/servers, секретная страница
   владельца, «живой» текст на картах и встроенная карта ServersInfo от
   qwied. Карты — на копии maps.js во временной папке, настоящий data/
   тест не трогает.
   Запуск: node test-servers.js */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');

let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-servers-'));
process.env.SERVERS_DATA_DIR = path.join(TMP, 'data');
delete process.env.STATS_KEY;
const S = require('./serversInfo.js');
const live = require('./liveText.js');

(async () => {
  console.log('живой текст на картах:');
  const d = {
    aibrofist: { online: 7, rooms: 2, modes: { race: { players: 3 }, hideAndSeek: { players: 4 } },
                 list: [{ mode: 'hideAndSeek', room: 'room1', players: 4, limit: 40, phase: 'round', secondsLeft: 75, map: 'Forest by qwied' },
                        { mode: 'race', room: 'room2', players: 3, limit: 40, phase: null, secondsLeft: null, map: null }] }
  };
  const t = s => live.render(s, d, new Date(2026, 0, 1, 9, 5, 7));
  ok('числа', t('{online} online, race {race}, hide {hide}, rooms {rooms}') === '7 online, race 3, hide 4, rooms 2');
  ok('строки комнат — самые людные первыми', t('{room1}') === 'Hide and Seek · room1 · 4/40 · hunt 1:15 · Forest by qwied' &&
     t('{room2}') === 'Race · room2 · 3/40' && t('{room3}') === '', t('{room1}'));
  ok('время у игрока', t('{time}') === '09:05:07');
  ok('незнакомые метки и обычный текст — как есть', t('{hello} {room99} {bf1} a{b') === '{hello} {room99} {bf1} a{b' && t('Plain') === 'Plain');
  ok('пока данных нет — понятные заглушки', live.render('{online} {room1} {room2}', null) === '… loading… ');

  console.log('\nсводка и секретная страница:');
  const routes = {};
  const app = { get: (p, h) => { routes[p] = h; } };
  S.register(app, {
    snapshot: () => ({ sockets: 9, rooms: [
      { mode: 'race', room: 'room1', players: 2, limit: 40, status: 'open', names: ['Ann', 'Bob'], map: 'Hills by qwied' },
      { mode: 'hideAndSeek', room: 'room1', players: 5, limit: 40, status: 'open', names: ['C', 'D', 'E', 'F', 'G'],
        phase: 'round', endsAt: Date.now() + 61000, seeker: 'C', caught: 1 }] }),
    extra: () => ({ maps: 3, accounts: 10 })
  });
  const call = (route, params) => new Promise(resolve => {
    const res = { headers: {}, code: 200, set(k, v) { this.headers[k] = v; return this; }, status(c) { this.code = c; return this; },
                  json(b) { resolve({ code: this.code, body: b, headers: this.headers }); },
                  send(b) { resolve({ code: this.code, body: b, headers: this.headers }); },
                  sendFile(f) { resolve({ code: this.code, file: f, headers: this.headers }); } };
    routes[route]({ params: params || {}, query: {} }, res);
  });
  const pub = await call('/api/servers');
  const a = pub.body.aibrofist;
  ok('открытая сводка: игроки, комнаты, самые людные первыми', a.online === 7 && a.rooms === 2 && a.list[0].room === 'room1' &&
     a.list[0].mode === 'hideAndSeek' && a.list[0].secondsLeft >= 59 && a.modes.race.players === 2);
  ok('в открытой сводке нет имён игроков', !JSON.stringify(pub.body).includes('Ann') && !JSON.stringify(pub.body).includes('"names"'));
  ok('и не кэшируется', pub.headers['Cache-Control'] === 'no-store');
  const link = S.link(), key = link.split('/stats/')[1];
  ok('ссылка — длинный случайный ключ', /^https:\/\/[^/]+\/stats\/[\w-]{24,}$/.test(link), link.replace(key, '<key>'));
  ok('ключ хранится в data/, а не в коде', JSON.parse(fs.readFileSync(path.join(TMP, 'data', 'serverStats.json'), 'utf8')).key === key);
  ok('чужой ключ — 404', (await call('/stats/:key', { key: 'guess' })).code === 404 && (await call('/stats/:key/data', { key: key.slice(0, -1) + (key.slice(-1) === 'x' ? 'y' : 'x') })).code === 404);
  const page = await call('/stats/:key', { key });
  ok('свой ключ — страница, без индексации и без утечки ссылки', page.file === path.join(__dirname, 'stats.html') &&
     page.headers['X-Robots-Tag'] && page.headers['Referrer-Policy'] === 'no-referrer');
  const full = await call('/stats/:key/data', { key });
  ok('подробно: имена, искатель, сервер, карты и аккаунты', full.body.aibrofist.list[0].names.length === 5 &&
     full.body.aibrofist.list[0].seeker === 'C' && full.body.server.sockets === 9 && full.body.extra.accounts === 10 &&
     full.body.server.peak.n >= 7 && full.body.server.memoryMb.rss > 0);
  S.rotate();
  ok('новая ссылка — старая сразу перестаёт работать', (await call('/stats/:key/data', { key })).code === 404 &&
     (await call('/stats/:key/data', { key: S.link().split('/stats/')[1] })).code === 200);
  const html = fs.readFileSync(path.join(__dirname, 'stats.html'), 'utf8');
  ok('страница: обновление каждую секунду, имена выводятся как текст', /setInterval\(tick, 1000\)/.test(html) &&
     /textContent/.test(html) && !/innerHTML/.test(html));
  const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  ok('stats.html напрямую не отдаётся', /PRIVATE_PREFIX = \[[^\]]*'\/stats\.html'/.test(srv));
  ok('liveText.js разрешён сайту и подключён к игре', /'livetext\.js'/.test(srv) &&
     /<script src="liveText\.js\?v=\d+"><\/script>/.test(fs.readFileSync(path.join(__dirname, 'game.html'), 'utf8')) &&
     /BFLive\.fill\(o\.text/.test(fs.readFileSync(path.join(__dirname, 'game.html'), 'utf8')));

  console.log('\nстраница Servers (её снимает бот по /servers):');
  const sp = fs.readFileSync(path.join(__dirname, 'servers.html'), 'utf8');
  ok('открывается по адресу /servers, как остальные страницы', /PAGE_FILES = \[[^\]]*'servers'/.test(srv));
  ok('данные — каждую секунду, без кэша', /setInterval\(function \(\) \{ if \(!document\.hidden\) tick\(\); \}, 1000\)/.test(sp) && /cache: 'no-store'/.test(sp) &&
     /\/api\/servers/.test(sp) && /\/getRoomList\?mode=race/.test(sp) && /\/getRoomList\?mode=hideAndSeek/.test(sp));
  ok('в стиле игры: тот же список комнат, что на страницах режимов (rlBox/rlRow), общая обвязка сайта',
     /class="rlBox"/.test(sp) && /\.rlRow\{/.test(sp) && /ui\.css\?v=\d+/.test(sp) && /shell\.js\?v=\d+/.test(sp));
  ok('ники игроков выводятся как текст, не как разметка', /textContent/.test(sp) && !/innerHTML/.test(sp));
  ok('блок для снимка и отметка «данные загружены»', /id="svShot"/.test(sp) && /setAttribute\('data-ready', '1'\)/.test(sp));
  ok('наверху только «Online now» и «Rooms» — режимы со своими игроками ниже, в списках', /id="kOnline"/.test(sp) && /id="kRooms"/.test(sp) &&
     !/id="kRace"|id="kHide"/.test(sp) && /\.svKpis\{[^}]*repeat\(2,/.test(sp));

  console.log('\nкарта ServersInfo от qwied:');
  process.env.OWNER_ALIASES = 'qwied';     // как на живом сайте: карты qwied — карты владельца, идут в игру
  const M = path.join(TMP, 'maps');
  fs.mkdirSync(M);
  ['maps.js', 'ranks.js', 'fsAtomic.js', 'accounts.js', 'discordAuth.js'].forEach(f => fs.copyFileSync(path.join(__dirname, f), path.join(M, f)));
  fs.cpSync(path.join(__dirname, 'builtinMaps'), path.join(M, 'builtinMaps'), { recursive: true });
  const maps = require(path.join(M, 'maps.js'));
  const m = maps.find('qwied', 'ServersInfo');
  const data = m && JSON.parse(m.mapData);
  ok('появилась в каталоге от qwied, режим Race, витрина', m && m.author === 'qwied' && m.mapType === 'race' && m.showcase === true && m.builtinVer >= 2);
  ok('на карте старт, финиш и метки живых данных', data && data.objects.some(o => o.type === 'spawn') && data.objects.some(o => o.type === 'finishline') &&
     ['{online}', '{race}', '{hide}', '{rooms}', '{room1}', '{time}'].every(k => data.objects.some(o => o.type === 'text' && o.text.indexOf(k) !== -1)));
  ok('только данные AIBROFIST, без чужих сайтов', !/brofist\.io|\{bf/i.test(m.mapData));
  ok('табло не прозрачные и висят над головой игрока', data.objects.filter(o => o.type === 'rect' && o.w === 780).every(o => !o.ghost && o.y + o.h <= 760 - 100 - 10));
  let hit = false;
  for (let i = 0; i < 200; i++) { const r = maps.randomFor('race'); if (r && r.mapName === 'ServersInfo') hit = true; }
  for (let i = 0; i < 50; i++) { const r = maps.randomFor(); if (r && r.mapName === 'ServersInfo') hit = true; }
  ok('в случайный подбор комнат не попадает', !hit);
  maps.setInGame('qwied', 'ServersInfo', 'race', true);
  let got = false;
  for (let i = 0; i < 200 && !got; i++) { const r = maps.randomFor('race'); if (r && r.mapName === 'ServersInfo') got = true; }
  ok('но владелец может сам добавить её в игру', got);

  await new Promise(r => setTimeout(r, 400));          // maps.js сохраняет с задержкой
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('✗ тест упал:', e.stack); process.exit(1); });
