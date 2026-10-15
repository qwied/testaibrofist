/* Автомодерация Discord: что считается нарушением, а что — нет.
   Главное — не наказывать зря: обычный разговор, мат без адресата,
   слова, внутри которых «спрятано» плохое (хачапури, Нигерия, night),
   настоящие сайты Discord и Steam — всё это проходит. А обходы фильтра
   (n1gg3r, «п u дор», dlscord.gift) ловятся.
   Запуск: node test-discord-automod.js */
'use strict';
const A = require('./discordAutomod.js');
const R = require('./discordRules.js');
let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };
const kinds = (content, extra) => A.inspect(Object.assign({ content }, extra || {})).map(f => f.kind);

console.log('чистые сообщения не трогаем:');
[
  'hello everyone, good game!', 'gg wp', 'I love this map, the jumps are hard', 'night niger nigeria snigger',
  'хачапури жидкий хохлома нигерия москалёв', 'блять опять умер на третьем уровне', 'fuck this boss',
  'this level is stupid', 'who wants to play race?', 'check discord.js.org and discords.com',
  'https://steamcommunity.com/id/me', 'https://discord.com/channels/1/2', 'https://www.youtube.com/watch?v=x',
  'visit discogs.com or disboard.org', 'server ip 85.143.20.11', 'version 1.2.3.4', 'my local ip is 192.168.0.5',
  'OK LOL', 'WOW', 'z̷a̷l̷g̷o̷ small', 'https://aibrofist.online/editor', 'ёлка йод зайчик',
  'scunthorpe classic assassin', 'I am a retail worker', 'spice and spicy food', 'the gooker game'
].forEach(t => ok(JSON.stringify(t), kinds(t).length === 0, kinds(t).join(',')));

console.log('\nнарушения ловим:');
[
  ['n1gg3r', 'slur'], ['n i g g e r', 'slur'], ['n.i.g.g.a', 'slur'], ['ты пидор', 'slur'], ['пuдор', 'slur'],
  ['жиды', 'slur'], ['чурка', 'slur'], ['хохлы', 'slur'], ['faggot', 'slur'], ['retarded', 'slur'],
  ['kys', 'selfharm'], ['убейся', 'selfharm'], ['сдохни', 'selfharm'], ['kill yourself', 'selfharm'],
  ['ты дебил', 'insult'], ['you are so stupid', 'insult'], ['u r a idiot', 'insult'], ['fuck you', 'insult'],
  ['иди нахуй', 'insult'], ['ты тупой', 'insult'],
  ['https://dlscord.gift/xyz', 'scam'], ['free nitro https://discord-nitro.ru', 'scam'],
  ['https://steamcommunlty.com/tradeoffer/new', 'scam'], ['https://discord.com.ru/login', 'scam'],
  ['https://disc0rd.com/gift', 'scam'], ['https://dicsord.com', 'scam'], ['steamcommunity.ru/id/x', 'scam'],
  ['https://grabify.link/ABC', 'grabber'], ['iplogger.org/2abc', 'grabber'],
  ['https://pornhub.com/x', 'nsfw-link'], ['site.xxx', 'nsfw-link'],
  ['download https://example.com/game.exe', 'badfile'],
  ['WHY IS THIS GAME SO HARD TODAY', 'caps'], ['aaaaaaaaaaaaaaaaaaaa', 'chars'],
  ['my ip is 85.143.20.11', 'doxx'], ['line\n'.repeat(30), 'lines']
].forEach(([t, want]) => { const k = kinds(t); ok(JSON.stringify(t).slice(0, 50) + ' -> ' + want, k[0] === want, k.join(',')); });

ok('5 упоминаний — спам', kinds('hi', { mentions: [1, 2, 3, 4, 5].map(id => ({ id: String(id) })) })[0] === 'mentions');
ok('эмодзи-спам', kinds('😀'.repeat(13))[0] === 'emoji');
ok('ответ «idiot» — оскорбление', kinds('idiot', { message_reference: {} })[0] === 'insult');
ok('ответ «that was stupid» — нет', kinds('that was stupid', { message_reference: {} }).length === 0);
ok('файл .exe', kinds('look', { attachments: [{ filename: 'cheat.exe' }] })[0] === 'badfile');
ok('в канале 18+ ссылка 18+ не нарушение', A.inspect({ content: 'https://pornhub.com/x' }, { nsfw: true }).length === 0);
ok('приглашения находятся', A.inviteCodes('join discord.gg/abc123 and https://discord.com/invite/XyZ').join() === 'abc123,XyZ');
ok('тяжёлое нарушение первым', kinds('ты дебил https://grabify.link/x')[0] === 'grabber');

console.log('\nправила 5, 7, 10, 12 (мошенничество, читы, политика, возраст):');
[
  ['продам акк за 500 руб', 'cheat'], ['selling account 20$ paypal', 'cheat'], ['кидаю чит бесплатно скачать', 'cheat'],
  ['путин', 'politics'], ['трамп', 'politics'], ['war in ukraine', 'politics'], ['мне 11 лет', 'underage'],
  ['im 12 years old', 'underage'], ['I accidentally reported you', 'scam-text'], ['free nitro, dm me', 'scam-text'],
  ['@everyone https://bit.ly/x', 'everyone-link'], ['русня', 'slur'], ['рашка', 'slur']
].forEach(([t, want]) => { const k = kinds(t); ok(JSON.stringify(t) + ' -> ' + want, k[0] === want, k.join(',')); });
['меняю скин на скин', 'трамплин в карте', 'своё время', 'мне 15 лет', '@everyone hi', 'укроп в салат',
 'hack the level lol', 'I played 12 years ago', 'the war level is hard', 'who sells skins in the shop?']
  .forEach(t => ok('не нарушение: ' + JSON.stringify(t), kinds(t).length === 0, kinds(t).join(',')));

console.log('\nники (правило 9):');
const name = (n, o) => (A.checkName(n, { owner: o || 'qwied' }) || {}).kind || '-';
[['Admin', 'impersonation'], ['[Admin] Bob', 'impersonation'], ['Модератор', 'impersonation'], ['AiBrofist', 'impersonation'],
 ['qwied', 'impersonation'], ['n1gg3r', 'bad-name'], ['discord.gg/xyz', 'bad-name'], ['!!!Bob', 'hoist'],
 ['★★★', 'unreadable'], ['z̷̛̛͓̫a̷l̷g̷o̷', 'unreadable']]
  .forEach(([n, want]) => ok('ник ' + JSON.stringify(n) + ' -> ' + want, name(n) === want, name(n)));
['Bob', 'Modern', 'Vasya_2010', 'Мишка', 'xX_Pro_Xx', 'Administrative Bob'].forEach(n => ok('нормальный ник ' + JSON.stringify(n), name(n) === '-', name(n)));
ok('значки в начале ника просто убираются', A.checkName('!!!Bob').clean === 'Bob');

console.log('\nфлуд и повторы:');
{
  const w = new A.FloodWatch();
  let hit = null, t = 1000;
  for (let i = 0; i < 6; i++) hit = w.add('u', { id: 'm' + i, channel_id: 'c', content: 'msg ' + i, t: t += 500 }) || hit;
  ok('6 сообщений за 3 секунды — флуд, все 6 под удаление', hit && hit.kind === 'flood' && hit.messages.length === 6);
  const next = w.add('u', { id: 'm6', channel_id: 'c', content: 'more', t: t += 300 });
  ok('следующее в той же волне — только оно само', next && next.messages.length === 1 && next.messages[0].id === 'm6');
  const v = new A.FloodWatch();
  let d = null; t = 0;
  for (let i = 0; i < 3; i++) d = v.add('x', { id: 'd' + i, channel_id: 'c' + i, content: 'buy cheap coins here', t: t += 10000 }) || d;
  ok('один текст 3 раза за минуту в разных каналах — повтор', d && d.kind === 'duplicate' && d.messages.length === 3);
  const q = new A.FloodWatch();
  let calm = null; t = 0;
  for (let i = 0; i < 10; i++) calm = q.add('y', { id: 'q' + i, channel_id: 'c', content: 'talk ' + i, t: t += 2000 }) || calm;
  ok('обычная переписка (раз в 2 секунды) — не флуд', calm === null);
}

console.log('\nлестница наказаний (сначала мьюты, потом бан на неделю, бан навсегда — в крайнем случае):');
const want = [[1, 'Warning'], [2, 'Mute for 10 minutes'], [3, 'Mute for 1 hour'], [4, 'Mute for 6 hours'],
              [5, 'Mute for 1 day'], [6, 'Mute for 3 days'], [7, 'Ban for 7 days'], [8, 'Ban for 7 days'],
              [9, 'Permanent ban'], [12, 'Permanent ban']];
want.forEach(([n, d]) => ok(n + ' -> ' + d, R.describe(R.punishmentFor(n)) === d, R.describe(R.punishmentFor(n))));
ok('баллы сгорают через 30 дней', R.STRIKE_TTL === 30 * R.DAY);

console.log('\nправила (для названий в уведомлениях):');
ok('12 правил по порядку, у каждого название', R.RULES.length === 12 && R.RULES.every((r, i) => r.id === i + 1 && r.title));
ok('без эмодзи', !/\p{Extended_Pictographic}/u.test(JSON.stringify(R.RULES)));
const en = R.rulesText('en'), ru = R.rulesText('ru');
ok('готовые правила для #rules: 12 пунктов и лестница наказаний, влезают в окно Discord',
   /^\*\*1\. Be respectful\.\*\*/.test(en) && /\*\*12\. /.test(en) && /- 7-8 strikes: Ban for 7 days/.test(en) &&
   /- 9\+ strikes: Permanent ban/.test(en) && en.length < 3700, en.length);
ok('и по-русски, с той же нумерацией', /^\*\*1\. Уважайте друг друга\.\*\*/.test(ru) && /\*\*12\. /.test(ru) &&
   /- 2 балла: Мьют на 10 минут/.test(ru) && /- 5 баллов: Мьют на 1 день/.test(ru) && /- 9\+ баллов: Бан навсегда/.test(ru) && ru.length < 3700, ru.length);

console.log('\nсвои запрещённые слова сервера:');
const W = ['bananas', 'плохое слово', 'лох'];
const hit = t => (A.checkCustom(t, W) || {}).detail || null;
ok('слово целиком, с обходами (пробелы, цифры вместо букв)', hit('I love bananas') === 'bananas' && hit('b a n a n a s') === 'bananas' &&
   hit('b4n4n4s') === 'bananas' && hit('ты л0х') === 'лох');
ok('фраза из нескольких слов', hit('это плохое  слово') === 'плохое слово');
ok('части других слов и похожие слова не задевает', !hit('banana') && !hit('ох как') && !hit('Лохматый кот') && !hit('плохоеслово'));
ok('находка — по правилам сервера, 1 балл', A.checkCustom('bananas', W).kind === 'custom' && A.checkCustom('bananas', W).weight === 1);
ok('слов нет — проверки нет', A.checkCustom('bananas', []) === null && A.checkCustom('bananas', undefined) === null);

console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
process.exit(fails ? 1 : 0);
