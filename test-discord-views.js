/* Ответы бота: данные (discordData.js) и сообщения Discord (discordViews.js).
   - /servers и /account: комнаты, страницы игрока, много комнат/карт/друзей — показано
     первых, остальное числом; пусто — понятная строка; чужие слова (имена комнат, карт, «о себе»)
     не превращаются ни в разметку, ни в упоминание;
   - сообщение целиком: рамка, не больше 4000 знаков текста, пустых кусков нет, кнопки серые,
     выбранная не нажимается, id не повторяются, лимиты Discord (ряд — до 5 кнопок, надпись — до 80);
   - все виды по-английски и по-русски собираются без «undefined» и «NaN»;
   - данные профиля — только то, что видно на странице игрока на сайте.
   Данные игроков — выдуманные, во временной папке; настоящий data/ тест не трогает.
   Запуск: node test-discord-views.js */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');

let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };
const V = require('./discordViews.js');
const R = require('./discordRules.js');

const now = Date.now();
const servers = { at: now, online: 21, rooms: 3, modes: { race: { players: 16 }, hideAndSeek: { players: 5 } }, list: [
  { mode: 'race', room: 'room1', players: 12, limit: 40, status: 'open', phase: null, secondsLeft: null, map: 'Ледяная гора' },
  { mode: 'race', room: 'room2', players: 4, limit: 40, status: 'freeing', phase: null, secondsLeft: null, map: null },
  { mode: 'hideAndSeek', room: 'room1', players: 5, limit: 40, status: 'open', phase: 'round', secondsLeft: 61, map: 'Forest' }] };
const profile = (maps, friends, extra) => Object.assign({ at: now, name: 'qwied', joined: Date.UTC(2026, 1, 3), about: 'Hi! Привет',
  coins: 10, coinsDay: 1, coinsWeek: 2, score: 3, scoreDay: 0, scoreWeek: 1, hsScore: 4, hsScoreDay: 0, hsScoreWeek: 0,
  rank: { race: { rank: 'S' }, hs: null }, maps, mapsCount: maps.length, friends, friendsCount: friends.length }, extra || {});
const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));
// всё написанное в сообщении, и вся разметка (для проверок «нет @everyone», «нет <@»)
const texts = m => { const out = []; const w = n => { if (Array.isArray(n)) n.forEach(w); else if (n && typeof n === 'object') { if (n.type === 10) out.push(n.content); w(n.components); } }; w(m.components); return out; };
const allText = m => texts(m).join('\n');
const buttons = m => { const out = []; const w = n => { if (Array.isArray(n)) n.forEach(w); else if (n && typeof n === 'object') { if (n.type === 2) out.push(n); w(n.components); } }; w(m.components); return out; };
const count = m => { let n = 0; const w = x => { if (Array.isArray(x)) x.forEach(w); else if (x && typeof x === 'object') { n++; w(x.components); if (x.accessory) w(x.accessory); } }; w(m.components); return n; };

(async () => {
  console.log('сообщение /servers:');
  const sv = V.message(V.view('servers', servers, 'en'), []);
  const st = allText(sv);
  ok('рамка с цветной полоской, флаг новых компонентов, никого не пингует', sv.flags === 32768 && sv.components[0].type === 17 && sv.components[0].accent_color > 0 && sv.allowed_mentions.parse.length === 0);
  ok('заголовок, оба режима, комнаты: игроки, статус, фаза и время, карта', /### Servers  ·  21 online/.test(st) && /\*\*Race\*\*  ·  16 players · 2 rooms/.test(st) &&
     /\*\*Hide and Seek\*\*  ·  5 players · 1 room/.test(st) && /`OPEN`/.test(st) && /`A SPOT IS FREEING UP`/.test(st) && /Hunt · 1:01 left · map Forest/.test(st), st);
  const big = Object.assign({}, servers, { list: Array.from({ length: 15 }, (_, i) => ({ mode: 'race', room: 'room' + i, players: 1, limit: 40, status: 'open' })) });
  const bt = allText(V.message(V.view('servers', big, 'en'), []));
  ok('комнат много — показаны первые 8, остальное числом; сообщение не растёт без конца', /room7/.test(bt) && !/room8\b/.test(bt) && /\+ 7 more rooms/.test(bt) && bt.length < 2000, bt.length);
  ok('пустой сервер: понятная строка вместо пустоты', /No rooms right now\. Press Play and a new room opens\./.test(allText(V.message(V.view('servers', { at: now, online: 0, rooms: 0, modes: {}, list: [] }, 'en'), []))));
  const evil = Object.assign({}, servers, { list: [{ mode: 'race', room: '@everyone <@123> **x** [a](http://evil)', players: 1, limit: 40, status: 'open', map: '# big `code` ||spoiler||' }] });
  const et = allText(V.message(V.view('servers', evil, 'en'), []));
  ok('имя комнаты и карты пишут игроки: упоминания, ссылки, заголовки и разметка в них обезврежены', !/(^|[^\\])@everyone/.test(et) && !/(^|[^\\])<@123>/.test(et) && !/(^|[^\\])\[a\]\(/.test(et) &&
     !/(^|\n)\s*# big/.test(et) && /\\@everyone/.test(et) && /map \\# big/.test(et), et.split('\n').slice(0, 4).join(' | '));
  ok('по-русски: «Серверы», «онлайн», «комнат», «карта»', /### Серверы  ·  онлайн: 21/.test(allText(V.message(V.view('servers', servers, 'ru'), []))) &&
     /Гонка\*\*  ·  16 игр\. · 2 комн\./.test(allText(V.message(V.view('servers', servers, 'ru'), []))) && /карта Forest/.test(allText(V.message(V.view('servers', servers, 'ru'), []))));

  console.log('\nсообщение /account:');
  const maps = many(12, i => ({ mapName: 'Map ' + i, mapType: i % 2 ? 'race' : 'hideAndSeek', rating: i - 3, likes: i, dislikes: 3, date: now, inGame: !i }));
  const friends = many(20, i => ({ name: 'Friend' + i, lastSeen: now - i * 3600000 }));
  const p1 = profile(maps, friends);
  const pp = allText(V.message(V.view('account', p1, 'en', { page: 'p', period: 'all' }), [])), pm = allText(V.message(V.view('account', p1, 'en', { page: 'm' }), [])),
        pf = allText(V.message(V.view('account', p1, 'en', { page: 'f' }), []));
  ok('профиль: ник, дата, ранги, монеты, очки, число карт и друзей, «о себе»', /### qwied/.test(pp) && /Joined Feb 3, 2026/.test(pp) && /Race: S  ·  Hide and Seek: no rank/.test(pp) &&
     /\*\*Coins\*\*  10/.test(pp) && /\*\*Race scores\*\*  3/.test(pp) && /\*\*Hide and Seek scores\*\*  4/.test(pp) && /\*\*Maps\*\* 12  ·  \*\*Friends\*\* 20/.test(pp) && /Hi! Привет/.test(pp), pp);
  ok('период: за сегодня и за неделю — с плюсом', /\*\*Coins\*\*  \+1 today/.test(allText(V.message(V.view('account', p1, 'en', { page: 'p', period: 'day' }), []))) &&
     /\*\*Coins\*\*  \+2 this week/.test(allText(V.message(V.view('account', p1, 'en', { page: 'p', period: 'week' }), []))));
  ok('карты: первые 8, остальное числом; режим, «in game», рейтинг, лайки', (pm.match(/\*\*Map \d+\*\*/g) || []).length === 8 && /\+ 4 more/.test(pm) && /`IN GAME`/.test(pm) && /likes 0 · dislikes 3/.test(pm), pm.length);
  ok('друзья: первые 15, остальное числом; когда были в игре', (pf.match(/\*\*Friend\d+\*\*/g) || []).length === 15 && /\+ 5 more/.test(pf) && /online now/.test(pf) && /3 h ago/.test(pf));
  const empty = profile([], []);
  ok('без карт и друзей — понятные строки', /No maps published yet/.test(allText(V.message(V.view('account', empty, 'en', { page: 'm' }), []))) &&
     /No friends yet/.test(allText(V.message(V.view('account', empty, 'en', { page: 'f' }), []))));
  const evilP = V.message(V.view('account', profile([{ mapName: '@everyone', mapType: 'race', rating: 1, likes: 1, dislikes: 0, date: now }], [{ name: '<@1>', lastSeen: now }],
                                 { name: 'x_y', about: '@everyone **look** https://evil.example <#1>' }), 'en', { page: 'p' }), []);
  const ept = allText(evilP);
  ok('«о себе», ник, карты и друзья — чужие слова: упоминания и разметка обезврежены', !/(^|[^\\])@everyone/.test(ept) && !/(^|[^\\])<#1>/.test(ept) && /\\@everyone/.test(ept) && /x\\_y/.test(ept) &&
     !/(^|[^\\])<@1>/.test(allText(V.message(V.view('account', profile([], [{ name: '<@1>', lastSeen: now }], {}), 'en', { page: 'f' }), []))), ept);
  ok('длинное «о себе» обрезается', allText(V.message(V.view('account', profile([], [], { about: 'a'.repeat(900) }), 'en', {}), [])).length < 1200);

  console.log('\nсообщение целиком (пределы Discord):');
  const long = V.message({ color: 5, parts: [V.txt('a'.repeat(3800)), V.txt('b'.repeat(3800)), V.txt('c'.repeat(3800)), V.txt('')] }, []);
  ok('текстов много и они длинные — вместе не больше 4000 знаков (лишнее срезано многоточием)', texts(long).join('').length <= 4000 && /…/.test(allText(long)), texts(long).join('').length);
  ok('пустой текст Discord не принимает — такие куски не попадают в сообщение', texts(V.message({ color: 5, parts: [V.txt(''), V.txt('  '), V.txt('ok')] }, [])).join('|') === 'ok');
  const rl = V.message(V.view('rules', { std: false, title: 'T'.repeat(300), text: 'x'.repeat(3900), at: now }, 'en'), []);
  ok('свои правила на 3900 знаков с длинным заголовком — вмещаются в 4000', texts(rl).join('').length <= 4000, texts(rl).join('').length);
  const ru = V.view('rules', { std: true, title: 'AIBROFIST Server Rules', text: '', at: now }, 'en');
  const rm = V.message(ru, [V.row(...V.langButtons(l => 'rules:' + l, 'en', 'rules-lang'))]);
  const rb = buttons(rm);
  ok('кнопки языка: выбранная неактивна, с постоянным id; обе серые, с флагами', rb.length === 2 && rb[0].disabled && rb[0].custom_id === 'rules-lang' && rb[1].custom_id === 'rules:ru' &&
     rb.every(b => b.style === 2) && rb[0].emoji.name === '🇬🇧' && rb[1].emoji.name === '🇷🇺');
  ok('ссылка — кнопка со ссылкой без id; надпись длиннее 80 знаков обрезается', V.linkButton('x'.repeat(100), 'https://aibrofist.online').label.length === 80 && !('custom_id' in V.linkButton('a', 'https://aibrofist.online')));

  console.log('\nвсе виды, английский и русский:');
  const samples = {
    action: [{ type: 'warn', name: 'Alice', user: 'alice', rule: 6, reason: 'sold coins', n: 1, limit: 3, by: 'owner', caseNo: 7, at: now, avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png' },
             { type: 'mute', name: 'Bob', rule: 4, kind: 'slur', reason: 'Hate speech', ms: 3600000, caseNo: 8, at: now },
             { type: 'ban', name: 'Bob', rule: 5, kind: 'scam', ms: 7 * 86400000, caseNo: 9, at: now }, { type: 'ban', name: 'Bob', reason: 'x', ms: 0, by: 'o', at: now },
             { type: 'unmute', name: 'Bob', by: 'o', at: now }, { type: 'unban', name: 'Bob', by: 'o', at: now }, { type: 'unwarn', name: 'Bob', count: 3, by: 'o', at: now },
             { type: 'none', name: 'Bob', rule: 7, kind: 'invite', at: now }, { type: 'warn', name: 'Bob', rule: 2, kind: 'invite', n: 3, limit: 3, escalated: { ms: 3600000 }, at: now },
             { type: 'mute', name: 'Owner', rule: 4, ms: 3600000, blocked: 'owner', at: now }, { type: 'mute', name: 'Bob', rule: 4, ms: 3600000, failed: true, at: now }],
    warns: [{ name: 'Alice', user: 'alice', active: 2, total: 9, limit: 3, list: many(6, i => ({ at: now - i * 1000, rule: 2, reason: 'r' + i, by: 'o', status: ['active', 'expired', 'used'][i % 3] })) }, { name: 'Alice', active: 0, total: 0, list: [] }],
    warnsAll: [{ members: 12, active: 5, total: 30, limit: 3, list: many(8, i => ({ name: 'M' + i, active: i % 4, total: i, last: now })) }, { members: 0, active: 0, total: 0, list: [] }],
    rules: [{ std: true, title: 'Rules', at: now }, { std: false, title: 'My rules', text: '1. one\n2. two', at: now }],
    help: [{ prefix: '!q7', online: true, checked: 1234567, activeWarns: 3, cases: 55 }, { prefix: '!', online: false }],
    stats: [{ online: 5, rooms: 2, modes: { race: { players: 3, rooms: 1 }, hideAndSeek: { players: 2, rooms: 1 } }, peak: 40, accounts: 1200, maps: 300, uptime: 90000, botOnline: true, checked: 99, memory: 120, at: now }, {}],
    info: [{ tag: { en: 'Post', ru: 'Пост' }, color: 'ok', title: { en: 'Posted', ru: 'Опубликовано' }, lines: [{ en: 'a', ru: 'б' }], at: now }, { tag: 'x', title: 'y' }],
    servers: [servers, { at: now, online: 0, rooms: 0, modes: {}, list: [] }],
    account: [p1, empty]
  };
  const bad = [];
  for (const kind of Object.keys(samples)) for (const lang of ['en', 'ru']) for (const [i, d] of samples[kind].entries()) {
    const pages = kind === 'account' ? [['p', 'all'], ['p', 'day'], ['p', 'week'], ['m'], ['f']] : [[]];
    for (const [page, period] of pages) {
      let m;
      try { m = V.message(V.view(kind, d, lang, { page, period }), [V.row(...V.langButtons(l => 'x:' + l, lang, 'x-lang'))]); } catch (e) { bad.push(kind + '/' + lang + '/' + i + ': ' + e.message); continue; }
      const all = allText(m);
      if (/undefined|NaN|\[object|null/.test(all) || !all.trim()) bad.push(kind + '/' + lang + '/' + i + ': ' + all.replace(/\s+/g, ' ').slice(0, 100));
      if (all.length > 4000 || count(m) > 40 || m.components[0].components.some(c => c.type === 10 && !c.content.trim())) bad.push(kind + '/' + lang + '/' + i + ': пределы');
    }
  }
  ok('каждый вид и каждая страница, по-английски и по-русски: без «undefined»/«NaN», не длиннее 4000 знаков, не больше 40 частей', bad.length === 0, bad.slice(0, 4).join(' | '));
  const act = V.message(V.view('action', samples.action[0], 'en'), []);
  ok('аватарка участника — справа в заголовке (раздел с миниатюрой); без неё — просто текст', act.components[0].components[0].type === 9 &&
     act.components[0].components[0].accessory.media.url === 'https://cdn.discordapp.com/embed/avatars/0.png' && V.message(V.view('action', samples.action[1], 'en'), []).components[0].components[0].type === 10);
  ok('в тексте нет эмодзи (флаги — только на кнопках языка)', Object.keys(samples).every(k => samples[k].every(d => !/\p{Extended_Pictographic}/u.test(allText(V.message(V.view(k, d, 'en', { page: 'p' }), []))))));

  console.log('\nданные профиля (как на странице игрока):');
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-cards-'));
  ['accounts.js', 'fsAtomic.js', 'discordAuth.js', 'maps.js', 'ranks.js', 'skins.js', 'discordData.js', 'serversInfo.js', 'discordApi.js']
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
  const TC = require(path.join(TMP, 'discordData.js'));
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
  const sd = TC.serversData();
  ok('сводка серверов — без имён игроков', sd && Array.isArray(sd.list) && !/"names"/.test(JSON.stringify(sd)));

  await new Promise(r => setTimeout(r, 500));          // maps.js/accounts.js сохраняют с задержкой
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('✗ тест упал:', e.stack); process.exit(1); });
