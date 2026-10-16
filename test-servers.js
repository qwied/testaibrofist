/* Серверы игры: открытая сводка /api/servers, секретная страница
   владельца, разбор списка серверов brofist.io, «живой» текст на картах
   и встроенная карта ServersInfo от qwied.
   Сеть не нужна: brofist.io выключен (BROFIST_OFF), карты — на копии
   maps.js во временной папке, настоящий data/ тест не трогает.
   Запуск: node test-servers.js */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');

let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-servers-'));
process.env.SERVERS_DATA_DIR = path.join(TMP, 'data');
process.env.BROFIST_OFF = '1';
delete process.env.STATS_KEY;
const S = require('./serversInfo.js');
const live = require('./liveText.js');

(async () => {
  console.log('разбор списка серверов brofist.io (формат нигде не описан):');
  let n = S.normalize([{ name: 'EU #1', players: 12, maxPlayers: 50, mode: 'Sandbox' }, { name: 'US #1', online: 3 }]);
  ok('массив серверов', n && n.online === 15 && n.servers[0].name === 'EU #1' && n.servers[0].max === 50 &&
     n.servers[0].mode === 'Sandbox' && n.servers[1].players === 3, JSON.stringify(n));
  n = S.normalize({ total: 40, servers: [{ title: 'Asia', playerCount: '7' }, { title: 'EU', playerCount: 20 }] });
  ok('объект со списком и общим числом', n && n.online === 40 && n.servers.length === 2 && n.servers[0].players === 7);
  n = S.normalize({ 'EU #1': 5, 'US #2': 9 });
  ok('объект «имя: число»', n && n.online === 14 && n.servers[1].name === 'US #2');
  n = S.normalize({ eu: { region: 'Europe', players: ['a', 'b', 'c'] }, us: { region: 'America', players: [] } });
  ok('игроки списком — считаем длину', n && n.online === 3 && n.servers[0].name === 'Europe');
  ok('мусор — нет данных', S.normalize('<html>') === null && S.normalize({ a: 'x' }) === null && S.normalize(null) === null);

  console.log('\nживой текст на картах:');
  const d = {
    aibrofist: { online: 7, rooms: 2, modes: { race: { players: 3 }, hideAndSeek: { players: 4 } },
                 list: [{ mode: 'hideAndSeek', room: 'room1', players: 4, limit: 40, phase: 'round', secondsLeft: 75, map: 'Forest by qwied' },
                        { mode: 'race', room: 'room2', players: 3, limit: 40, phase: null, secondsLeft: null, map: null }] },
    brofist: { ok: true, online: 55, count: 1, servers: [{ name: 'EU #1', players: 55, max: 100, mode: 'Parkour', region: null }] }
  };
  const t = s => live.render(s, d, new Date(2026, 0, 1, 9, 5, 7));
  ok('числа', t('{online} online, race {race}, hide {hide}, rooms {rooms}') === '7 online, race 3, hide 4, rooms 2');
  ok('строки комнат — самые людные первыми', t('{room1}') === 'Hide and Seek · room1 · 4/40 · hunt 1:15 · Forest by qwied' &&
     t('{room2}') === 'Race · room2 · 3/40' && t('{room3}') === '', t('{room1}'));
  ok('brofist.io', t('{bfonline} / {bfservers} / {bfstatus}') === '55 / 1 / live data' && t('{bf1}') === 'EU #1 · 55/100 online · Parkour');
  ok('время у игрока', t('{time}') === '09:05:07');
  ok('незнакомые метки и обычный текст — как есть', t('{hello} {room99} a{b') === '{hello} {room99} a{b' && t('Plain') === 'Plain');
  ok('пока данных нет — понятные заглушки', live.render('{online} {room1} {bfstatus} {bf1}', null) === '… loading… loading… loading…');
  ok('brofist.io не отвечает — так и пишет', live.render('{bfonline} {bfstatus} {bf1}', { aibrofist: d.aibrofist, brofist: { ok: false, servers: [] } }) ===
     '– no data right now brofist.io is not answering right now');

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

  console.log('\nкарта ServersInfo от qwied:');
  process.env.OWNER_ALIASES = 'qwied';     // как на живом сайте: карты qwied — карты владельца, идут в игру
  const M = path.join(TMP, 'maps');
  fs.mkdirSync(M);
  ['maps.js', 'ranks.js', 'fsAtomic.js', 'accounts.js', 'discordAuth.js'].forEach(f => fs.copyFileSync(path.join(__dirname, f), path.join(M, f)));
  fs.cpSync(path.join(__dirname, 'builtinMaps'), path.join(M, 'builtinMaps'), { recursive: true });
  const maps = require(path.join(M, 'maps.js'));
  const m = maps.find('qwied', 'ServersInfo');
  const data = m && JSON.parse(m.mapData);
  ok('появилась в каталоге от qwied, режим Race, витрина', m && m.author === 'qwied' && m.mapType === 'race' && m.showcase === true);
  ok('на карте старт, финиш и метки живых данных', data && data.objects.some(o => o.type === 'spawn') && data.objects.some(o => o.type === 'finishline') &&
     ['{online}', '{room1}', '{bfonline}', '{bf1}', '{time}'].every(k => data.objects.some(o => o.type === 'text' && o.text.indexOf(k) !== -1)));
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
