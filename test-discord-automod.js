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

console.log('\nлестница наказаний (мягкая, бан только в крайнем случае):');
const want = [[1, 'Warning'], [2, 'Mute for 10 minutes'], [3, 'Mute for 1 hour'], [4, 'Mute for 6 hours'],
              [5, 'Mute for 1 day'], [6, 'Mute for 3 days'], [7, 'Mute for 3 days'], [8, 'Ban'], [12, 'Ban']];
want.forEach(([n, d]) => ok(n + ' -> ' + d, R.describe(R.punishmentFor(n)) === d, R.describe(R.punishmentFor(n))));
ok('баллы сгорают через 30 дней', R.STRIKE_TTL === 30 * R.DAY);

console.log('\nправила (для названий в уведомлениях):');
ok('12 правил по порядку, у каждого название', R.RULES.length === 12 && R.RULES.every((r, i) => r.id === i + 1 && r.title));
ok('без эмодзи', !/\p{Extended_Pictographic}/u.test(JSON.stringify(R.RULES)));

console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
process.exit(fails ? 1 : 0);
