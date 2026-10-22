/* Ответы бота: данные (discordData.js) и сообщения Discord (discordViews.js).
   - /servers и /account: комнаты, страницы игрока, много комнат/карт/друзей — показано
     первых, остальное числом; пусто — понятная строка; чужие слова (имена комнат, карт, «о себе»)
     не превращаются ни в разметку, ни в упоминание;
   - сообщение целиком: рамка, не больше 4000 знаков текста, пустых кусков нет, кнопки серые,
     выбранная не нажимается, id не повторяются, лимиты Discord (ряд — до 5 кнопок, надпись — до 80);
   - все виды на всех языках (английский, русский и переводы из discordLang.js) собираются без «undefined», «NaN» и неподставленных {скобок};
   - переводы полные: все ключи на месте, подстановки ({n}, {d}...) те же, что в английском, 7 правил, находки автомода;
   - язык человека берётся из языка Discord (de, pt-BR, es-419, zh-TW...), неизвестный — английский;
   - данные профиля — только то, что видно на странице игрока на сайте.
   Данные игроков — выдуманные, во временной папке; настоящий data/ тест не трогает.
   Запуск: node test-discord-views.js */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');

let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };
const V = require('./discordViews.js');
const R = require('./discordRules.js');
const { PACKS, KEYS, NOTE_KEYS } = require('./discordLang.js');
const ALL = ['en', 'ru'].concat(Object.keys(PACKS));

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
  ok('кнопок выбора языка нет вообще: в модуле нет langButtons, а кнопки вкладок выбранная — неактивная, с постоянным id, серые', typeof V.langButtons === 'undefined' &&
     (function () { const b = V.tabs([{ label: 'A', id: 'x:a', on: true }, { label: 'B', id: 'x:b', on: false }], 'x-cur'); return b.length === 2 && b[0].disabled && b[0].custom_id === 'x-cur' && b[1].custom_id === 'x:b' && b.every(x => x.style === 2); })());
  ok('ссылка — кнопка со ссылкой без id; надпись длиннее 80 знаков обрезается', V.linkButton('x'.repeat(100), 'https://aibrofist.online').label.length === 80 && !('custom_id' in V.linkButton('a', 'https://aibrofist.online')));

  console.log('\nпереводы (discordLang.js):');
  const holes = [], marks = [];
  const slots = t => (String(t).replace(/\{nth\}/g, '{limit}').match(/\{[a-zA-Z0-9]+\}/g) || []).sort().join();      // {nth} («3-е») в переводах заменено числом {limit}
  for (const [code, pack] of Object.entries(PACKS)) {
    for (const k of KEYS) {
      const own = pack.s[k], en = V.say('en', k);
      if (typeof own !== 'string' || !own.trim()) holes.push(code + '.' + k + ' нет');
      else if (slots(own) !== slots(en)) marks.push(code + '.' + k + ': ' + slots(own) + ' вместо ' + slots(en));
    }
    for (const k of Object.keys(pack.s)) if (KEYS.indexOf(k) === -1) holes.push(code + '.' + k + ' лишний ключ');
    if (!pack.name || !pack.locale || !pack.units) holes.push(code + ': нет name/locale/units');
    if ((pack.rules || []).length !== 7 || pack.rules.some(x => !String(x).trim())) holes.push(code + ': правил не 7');
    if ((pack.short || []).length !== 7 || pack.short.some(x => !String(x).trim())) holes.push(code + ': коротких строк не 7');
    for (const k of NOTE_KEYS) if (!pack.notes || !String(pack.notes[k] || '').trim()) holes.push(code + '.notes.' + k + ' нет');
    for (const u of ['min', 'hour', 'day']) if (!pack.units[u] || !pack.units[u].length) holes.push(code + '.units.' + u + ' нет');
  }
  ok('у каждого языка (' + Object.keys(PACKS).length + ') есть все ключи, 7 правил, 7 коротких строк, все находки автомода, единицы времени; лишнего нет', holes.length === 0, holes.slice(0, 5).join(' | '));
  ok('подстановки в переводах те же, что в английском ({n}, {d}, {limit}...): бот ставит их по имени', marks.length === 0, marks.slice(0, 5).join(' | '));
  const sameAsEn = Object.entries(PACKS).map(([c, p]) => [c, KEYS.filter(k => p.s[k] === V.say('en', k)).length]).filter(([, n]) => n > 12);
  ok('перевод не копия английского (не больше 12 общих строк с английским у языка)', sameAsEn.length === 0, JSON.stringify(sameAsEn));
  ok('язык Discord -> язык ответа: de, pt-BR, es-ES и es-419, zh-CN (упрощённый) и zh-TW (традиционный), no/nb/nn, регион после дефиса не важен', [['de', 'de'], ['de-AT', 'de'], ['pt-BR', 'pt'], ['es-ES', 'es'], ['es-419', 'es'],
     ['zh-CN', 'zh'], ['zh-TW', 'zt'], ['zh-HK', 'zt'], ['zh', 'zh'], ['no', 'no'], ['nb', 'no'], ['nn-NO', 'no'], ['sv-SE', 'sv'], ['pt_BR', 'pt'], ['EN-us', 'en'], ['uk', 'uk'], ['ru', 'ru'], ['ja', 'ja'], ['fr', 'fr'], ['tr', 'tr'], ['pl', 'pl'], ['it', 'it'], ['en-US', 'en'], ['en-GB', 'en']].every(([l, w]) => V.fromLocale(l) === w));
  ok('неизвестный или пустой язык — английский (арабский, иврит, суахили, пусто, мусор)', ['ar', 'he', 'sw', '', undefined, null, 'zz-ZZ', '123', 'constructor', '__proto__'].every(l => V.fromLocale(l) === 'en'));
  ok('langOf не принимает чужие ключи (constructor и т. п.) — иначе из имени языка в кнопке получилось бы что угодно', ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'de ', 'DE'].every(l => V.langOf(l) === 'en'));
  const DISCORD_LOCALES = { id: 'id', da: 'da', de: 'de', 'en-GB': 'en', 'en-US': 'en', 'es-ES': 'es', 'es-419': 'es', fr: 'fr', hr: 'hr', it: 'it', lt: 'lt', hu: 'hu', nl: 'nl',
    no: 'no', pl: 'pl', 'pt-BR': 'pt', ro: 'ro', fi: 'fi', 'sv-SE': 'sv', vi: 'vi', tr: 'tr', cs: 'cs', el: 'el', bg: 'bg', ru: 'ru', uk: 'uk', hi: 'hi', th: 'th', 'zh-CN': 'zh',
    ja: 'ja', 'zh-TW': 'zt', ko: 'ko' };
  ok('все 32 locale, которые умеет присылать Discord, определяются и ведёт к своему языку ответа (' + Object.keys(DISCORD_LOCALES).length + ' locale, ' + new Set(Object.values(DISCORD_LOCALES)).size + ' языков)',
     Object.keys(DISCORD_LOCALES).length === 32 && Object.entries(DISCORD_LOCALES).every(([l, w]) => V.fromLocale(l) === w) && ALL.length === new Set(Object.values(DISCORD_LOCALES)).size &&
     ALL.every(l => Object.values(DISCORD_LOCALES).indexOf(l) !== -1), Object.entries(DISCORD_LOCALES).filter(([l, w]) => V.fromLocale(l) !== w).join());
  const dur = (ms, l) => V.duration(ms, l), H = 3600000, D = 86400000;
  ok('длительности по правилам языка: польский 1 godzina / 2 dni / 5 dni / 22 dni, украинский 2 дні / 5 днів, немецкий 1 Stunde / 6 Stunden, китайский 1小时, турецкий 1 saat',
     dur(H, 'pl') === '1 godzina' && dur(2 * D, 'pl') === '2 dni' && dur(5 * D, 'pl') === '5 dni' && dur(22 * D, 'pl') === '22 dni' && dur(2 * H, 'pl') === '2 godziny' && dur(5 * H, 'pl') === '5 godzin' &&
     dur(2 * D, 'uk') === '2 дні' && dur(5 * D, 'uk') === '5 днів' && dur(H, 'de') === '1 Stunde' && dur(6 * H, 'de') === '6 Stunden' && dur(H, 'zh') === '1小时' && dur(H, 'tr') === '1 saat' &&
     dur(600000, 'es') === '10 minutos' && dur(7 * D, 'fr') === '7 jours' && dur(H, 'ja') === '1時間' &&
     dur(2 * H, 'lt') === '2 valandos' && dur(11 * H, 'lt') === '11 valandų' && dur(21 * H, 'lt') === '21 valanda' && dur(2 * H, 'cs') === '2 hodiny' && dur(5 * H, 'cs') === '5 hodin' &&
     dur(20 * H, 'ro') === '20 de ore' && dur(5 * H, 'ro') === '5 ore' && dur(1 * H, 'ro') === '1 oră' && dur(2 * D, 'hr') === '2 dana' && dur(5 * D, 'hr') === '5 dana' &&
     dur(H, 'zt') === '1小時' && dur(7 * D, 'ko') === '7일' && dur(H, 'th') === '1 ชั่วโมง' && dur(3 * D, 'nl') === '3 dagen' && dur(2 * H, 'hi') === '2 घंटे' && dur(2 * D, 'bg') === '2 дни', [dur(H, 'pl'), dur(22 * D, 'pl'), dur(5 * D, 'uk')].join(' / '));
  ok('даты делает сама система по языку (Intl): немецкая, японская, русская и английская', /^\d{1,2}\. .* 2026$/.test(V.date(Date.UTC(2026, 1, 3), 'de')) && /^2026年2月3日$/.test(V.date(Date.UTC(2026, 1, 3), 'ja')) &&
     V.date(Date.UTC(2026, 1, 3), 'ru') === '3 фев 2026' && V.date(Date.UTC(2026, 1, 3), 'en') === 'Feb 3, 2026' && /07:05 UTC$/.test(V.date(Date.UTC(2026, 1, 3, 7, 5), 'fr', true)), V.date(Date.UTC(2026, 1, 3), 'de'));
  const warn = lang => allText(V.message(V.view('action', { type: 'warn', name: 'Bob', rule: 6, kind: 'cheat', reason: 'x', n: 1, limit: 3, by: '', caseNo: 4, at: now }, lang), []));
  ok('наказание на другом языке: правило, причина-находка автомода (kind) и «обычная» причина переводятся; ник и написанный человеком текст — как есть',
     /Regel:\*\* 6\. Kein Verkauf von Konten/.test(warn('de')) && /Grund:\*\* Verkauf für echtes Geld/.test(warn('de')) && /Raison:\*\* Vente contre de l’argent réel/.test(warn('fr')) &&
     /\*\*Bob\*\*/.test(warn('ja')) && /Auto/.test(warn('en')));
  const up = (r, l) => allText(V.message(V.view('rules', { std: true, title: 'x', text: '', at: now }, l), [])).match(r) ? 1 : 0;
  ok('ПРОПИСНЫЕ по правилам языка: турецкое «DAKİKA» с точкой, греческое без ударений', up(/SUSTURMA 10 DAKİKA/, 'tr') && up(/ΣΙΓΑΣΗ 10 ΛΕΠΤΑ/, 'el') && up(/MUTE 10 MINUTES/, 'en') && up(/МЬЮТ 10 МИНУТ/, 'ru'));
  const own = allText(V.message(V.view('action', { type: 'warn', name: 'Bob', rule: 0, reason: 'свой текст человека', n: 1, limit: 3, by: 'owner', at: now }, 'es'), []));
  ok('причина, написанная владельцем, не переводится (её нет в переводах) — показана как написана', /Motivo:\*\* свой текст человека/.test(own) && /Regla:\*\* Otro/.test(own));

  console.log('\nвсе виды на всех языках:');
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
  for (const kind of Object.keys(samples)) for (const lang of ALL) for (const [i, d] of samples[kind].entries()) {
    const pages = kind === 'account' ? [['p', 'all'], ['p', 'day'], ['p', 'week'], ['m'], ['f']] : [[]];
    for (const [page, period] of pages) {
      let m;
      try { m = V.message(V.view(kind, d, lang, { page, period }), [V.row(V.button('x', 'x:1'))]); } catch (e) { bad.push(kind + '/' + lang + '/' + i + ': ' + e.message); continue; }
      const all = allText(m);
      if (/undefined|NaN|\[object|null|\{[a-zA-Z0-9]+\}/.test(all) || !all.trim()) bad.push(kind + '/' + lang + '/' + i + ': ' + all.replace(/\s+/g, ' ').slice(0, 100));
      if (all.length > 4000 || count(m) > 40 || m.components[0].components.some(c => c.type === 10 && !c.content.trim())) bad.push(kind + '/' + lang + '/' + i + ': пределы');
    }
  }
  ok('каждый вид и каждая страница на каждом языке (' + ALL.join(', ') + '): без «undefined»/«NaN»/неподставленных скобок, не длиннее 4000 знаков, не больше 40 частей', bad.length === 0, bad.slice(0, 4).join(' | '));
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
