/* Автомодерация Discord: что считается нарушением, а что — нет.
   Главное — не наказывать зря: обычный разговор, мат и оскорбления между
   игроками, капс, эмодзи, слова, внутри которых «спрятано» плохое
   (хачапури, Нигерия, night), настоящие сайты Discord и Steam — всё это
   проходит. А обходы фильтра (f4gg0t, «п u дор», dlscord.gift) ловятся.
   У каждого из 7 правил своё наказание, баллов нет. Политика, ники и расовые
   слова больше не проверяются.
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
  ['f4gg0t', 'slur'], ['f a g g o t', 'slur'], ['f.a.g.g.o.t', 'slur'], ['ты пидор', 'slur'], ['пuдор', 'slur'],
  ['жиды', 'slur'], ['чурка', 'slur'], ['хохлы', 'slur'], ['faggot', 'slur'], ['kike', 'slur'],
  ['kys', 'selfharm'], ['убейся', 'selfharm'], ['повесься', 'selfharm'], ['kill yourself', 'selfharm'],
  ['https://dlscord.gift/xyz', 'scam'], ['free nitro https://discord-nitro.ru', 'scam'],
  ['https://steamcommunlty.com/tradeoffer/new', 'scam'], ['https://discord.com.ru/login', 'scam'],
  ['https://disc0rd.com/gift', 'scam'], ['https://dicsord.com', 'scam'], ['steamcommunity.ru/id/x', 'scam'],
  ['https://grabify.link/ABC', 'grabber'], ['iplogger.org/2abc', 'grabber'],
  ['https://pornhub.com/x', 'nsfw-link'], ['site.xxx', 'nsfw-link'],
  ['download https://example.com/game.exe', 'badfile'],
  ['my ip is 85.143.20.11', 'doxx']
].forEach(([t, want]) => { const k = kinds(t); ok(JSON.stringify(t).slice(0, 50) + ' -> ' + want, k[0] === want, k.join(',')); });

console.log('\nправила, которых больше нет, не проверяются (оскорбления, капс, эмодзи, «простыни», упоминания):');
[
  'ты дебил', 'you are so stupid', 'u r a idiot', 'fuck you', 'иди нахуй', 'ты тупой', 'сдохни', 'WHY IS THIS GAME SO HARD TODAY',
  'aaaaaaaaaaaaaaaaaaaa', 'line\n'.repeat(30), '😀'.repeat(13), 'кидаю чит бесплатно скачать', 'download free hack cheat injector'
].forEach(t => ok(JSON.stringify(t).slice(0, 50) + ' — не нарушение', kinds(t).length === 0, kinds(t).join(',')));
ok('ответ «idiot» — не оскорбление', kinds('idiot', { message_reference: {} }).length === 0);
ok('5 упоминаний — не нарушение', kinds('hi', { mentions: [1, 2, 3, 4, 5].map(id => ({ id: String(id) })) }).length === 0);
ok('только слова вражды: у ника тоже ищутся, у разговора — слова вражды и «убей себя»',
   kinds('you are an idiot, kys')[0] === 'selfharm' && kinds('ты пидор')[0] === 'slur');
ok('файл .exe', kinds('look', { attachments: [{ filename: 'cheat.exe' }] })[0] === 'badfile');
ok('в канале 18+ ссылка 18+ не нарушение', A.inspect({ content: 'https://pornhub.com/x' }, { nsfw: true }).length === 0);
ok('приглашения находятся', A.inviteCodes('join discord.gg/abc123 and https://discord.com/invite/XyZ').join() === 'abc123,XyZ');
ok('тяжёлое нарушение первым', kinds('ты пидор https://grabify.link/x')[0] === 'grabber');

console.log('\nмошенничество, продажа за деньги, политика, возраст:');
[
  ['продам акк за 500 руб', 'cheat'], ['selling account 20$ paypal', 'cheat'],
  ['мне 11 лет', 'underage'],
  ['im 12 years old', 'underage'], ['I accidentally reported you', 'scam-text'], ['free nitro, dm me', 'scam-text'],
  ['@everyone https://bit.ly/x', 'everyone-link'], ['русня', 'slur'], ['рашка', 'slur']
].forEach(([t, want]) => { const k = kinds(t); ok(JSON.stringify(t) + ' -> ' + want, k[0] === want, k.join(',')); });
['меняю скин на скин', 'трамплин в карте', 'своё время', 'мне 15 лет', '@everyone hi', 'укроп в салат',
 'hack the level lol', 'I played 12 years ago', 'the war level is hard', 'who sells skins in the shop?']
  .forEach(t => ok('не нарушение: ' + JSON.stringify(t), kinds(t).length === 0, kinds(t).join(',')));

console.log('\nобычные фразы, на которых бот раньше ошибался:');
['I found this server on discord.Then I joined', 'i play roblox.Do you?', 'see you on discord.ok?', 'i use discordbots.org, the bot is free',
 'у меня взломали аккаунт, скинь ссылку на поддержку', 'can I buy coins with real money?', 'how to buy coins, is it $5?',
 'ты убил тварь?', 'вы видели этого урода в подземелье?', 'ты видел уродливого босса', 'сдохни зомби!', 'ты же не дебил, всё понял',
 'ты не лох, просто не повезло', 'that trump card was great', 'free nitro? no thanks, scam', 'never click free nitro links',
 'бесплатный нитро это скам, не ведитесь', 'download: https://aibrofist.online/app.apk', 'https://web.archive.org/web/2020/https://google.com',
 '@everyone hi all.see you tonight']
  .forEach(t => ok(JSON.stringify(t), kinds(t).length === 0, kinds(t).join(',')));
ok('«@bob the bot is an idiot» — не о человеке', kinds('<@1> the bot is an idiot', { mentions: [{ id: '1' }] }).length === 0);
ok('объявление администрации с @everyone (пинганул на самом деле) — не нарушение',
   kinds('@everyone new update! https://aibrofist.online/news', { mention_everyone: true }).length === 0);
ok('чужой IP скрывается — без наказания', A.KIND.doxx.mode === 'hide' && R.actionFor(A.KIND.doxx).type === 'none');

console.log('\nубрано из правил: политика, ники, раса:');
['путин', 'трамп', 'war in ukraine', 'what do you think about politics?', 'Putin', 'выборы президента']
  .forEach(t => ok('политика — не нарушение: ' + JSON.stringify(t), kinds(t).length === 0, kinds(t).join(',')));
['n1gg3r', 'n i g g e r', 'n.i.g.g.a', 'nigga', 'нигер', 'ниггер', 'gook', 'retarded', 'this level is retarded']
  .forEach(t => ok('расовые слова и «retarded» — не нарушение: ' + JSON.stringify(t), kinds(t).length === 0, kinds(t).join(',')));
ok('вид «политика» и проверка ников из бота убраны', !A.KIND.politics && !A.KIND['bad-name'] && !A.KIND.impersonation && !A.checkName);

console.log('\nфлуд — больше 3 сообщений за 2 секунды:');
{
  const w = new A.FloodWatch();
  const add = (u, i, t) => w.add(u, { id: 'm' + i, channel_id: 'c', content: 'msg ' + i, t });
  ok('3 сообщения за 2 секунды — ещё не спам', !add('a', 0, 1000) && !add('a', 1, 1500) && !add('a', 2, 2000));
  const hit = add('a', 3, 2500);
  ok('4 за 2 секунды — спам, под удаление все 4', hit && hit.kind === 'flood' && hit.messages.length === 4 &&
     hit.messages.map(m => m.id).join() === 'm0,m1,m2,m3');
  ok('пятое в той же пачке — не второе срабатывание', !add('a', 4, 2700));
  let two = null;
  for (let i = 5; i <= 7; i++) two = add('a', i, 2700 + i * 10) || two;
  ok('ещё 3 после неё — вместе с пятым новое срабатывание, считаются только новые', two && two.messages.map(m => m.id).join() === 'm4,m5,m6,m7');
  let slow = null;
  for (let i = 0; i < 10; i++) slow = new A.FloodWatch().add('s', { id: 's' + i, channel_id: 'c', content: 'x', t: 1000 + i * 700 }) || slow;
  const w2 = new A.FloodWatch();
  let slow2 = null;
  for (let i = 0; i < 20; i++) slow2 = w2.add('s', { id: 's' + i, channel_id: 'c', content: 'x', t: 1000 + i * 700 }) || slow2;
  ok('сообщение раз в 0,7 секунды (3 за 2 секунды) — не спам', slow2 === null && slow === null);
  const w3 = new A.FloodWatch();
  let calm = null;
  for (let i = 0; i < 10; i++) calm = w3.add('y', { id: 'q' + i, channel_id: 'c', content: 'talk ' + i, t: 1000 + i * 2000 }) || calm;
  ok('обычная переписка — не спам', calm === null);
  const w4 = new A.FloodWatch();
  let dup = null;
  for (let i = 0; i < 3; i++) dup = w4.add('x', { id: 'd' + i, channel_id: 'c' + i, content: 'buy cheap coins here', t: 1000 + i * 10000 }) || dup;
  ok('один текст 3 раза за минуту — больше не нарушение', dup === null);
  const w5 = new A.FloodWatch();
  const many = [];
  for (const u of ['p', 'q']) for (let i = 0; i < 3; i++) many.push(w5.add(u, { id: u + i, channel_id: 'c', content: 'hi', t: 1000 + i * 100 }));
  ok('у каждого игрока свой счёт', many.every(x => x === null));
}

console.log('\nнаказания — у каждого правила своё:');
const act = id => R.describe(R.ruleById(id).act);
[[1, 'Mute for 10 minutes'], [2, 'Warning'], [3, 'Mute for 1 hour'], [4, 'Mute for 1 hour'], [5, 'Ban for 7 days'],
 [6, 'Warning'], [7, 'No punishment']]
  .forEach(([n, d]) => ok('правило ' + n + ' -> ' + d, act(n) === d, act(n)));
ok('бан — только у одного правила (мошенничество)', R.RULES.filter(r => r.act.type === 'ban').map(r => r.id).join() === '5');
ok('спам: 4 сообщения за 2 секунды, мьют на 5-й раз, счёт сбрасывается через час',
   R.SPAM.count === 4 && R.SPAM.window === 2000 && R.SPAM.limit === 5 && R.SPAM.reset === R.HOUR);
ok('находка без правила (свои слова сервера, «warn» владельца) — предупреждение', R.actionFor(A.finding('custom')).type === 'warn' &&
   R.actionFor({ kind: 'manual', rule: 0 }).type === 'warn');
const found = k => A.KIND[k].rule;
ok('каждая находка ведёт к существующему правилу (или без правила — только сообщение владельцу и свои слова)',
   Object.keys(A.KIND).every(k => !found(k) || R.ruleById(found(k))) &&
   ['evasion', 'underage', 'custom', 'native-word'].every(k => found(k) === 0));
ok('находки по правилам: спам 1, приглашение 2, 18+ 3, вражда 4, мошенничество 5, продажа 6, IP 7',
   found('flood') === 1 && found('invite') === 2 && found('nsfw-image') === 3 && found('slur') === 4 && found('scam') === 5 &&
   found('badfile') === 5 && found('cheat') === 6 && found('doxx') === 7);

console.log('\nправила (для названий в уведомлениях и для #rules):');
ok('7 правил по порядку, у каждого название и наказание', R.RULES.length === 7 && R.RULES.every((r, i) => r.id === i + 1 && r.title && r.act && r.en && r.ru.length === 2));
ok('без эмодзи', !/\p{Extended_Pictographic}/u.test(JSON.stringify(R.RULES)));
const en = R.rulesText('en'), ru = R.rulesText('ru');
ok('по-английски: 7 пунктов с наказанием у каждого, без баллов, влезает в окно Discord',
   /^\*\*1\. No spam\.\*\* More than 3 messages within 2 seconds/.test(en) && /\*\*7\. No other people's IP addresses\.\*\*/.test(en) && !/\*\*8\./.test(en) &&
   /10-minute mute/.test(en) && /banned for 7 days/.test(en) && !/strike/i.test(en) && !/moderator instructions/i.test(en) && en.length < 3700, en.length);
ok('по-русски: те же 7 пунктов, без баллов', /^\*\*1\. Без спама\.\*\* Больше 3 сообщений за 2 секунды/.test(ru) && /\*\*7\. Без чужих IP-адресов\.\*\*/.test(ru) && !/\*\*8\./.test(ru) &&
   /мьют на 10 минут/.test(ru) && /бан на 7 дней/.test(ru) && !/страйк|балл/i.test(ru) && ru.length < 3700, ru.length);
ok('оба текста говорят, что проверяет бот и модераторов нет', /no human moderators/.test(en) && /модераторов нет/.test(ru));
ok('убранных правил в тексте нет: оскорбления, капс, читы, возраст, политика, ники, раса',
   !/insult|caps|cheats|13 years|Terms of Service|politic|nickname|\brace\b/i.test(en) && !/оскорблений(?! по)|капс|читов|13 лет|политик|(?<![а-я])ник(?:и|а|ов|е|ам)?(?![а-я])|(?<![а-я])рас[аеуы](?![а-я])/i.test(ru));

console.log('\nсвои запрещённые слова сервера:');
const W = ['bananas', 'плохое слово', 'лох'];
const hit = t => (A.checkCustom(t, W) || {}).detail || null;
ok('слово целиком, с обходами (пробелы, цифры вместо букв)', hit('I love bananas') === 'bananas' && hit('b a n a n a s') === 'bananas' &&
   hit('b4n4n4s') === 'bananas' && hit('ты л0х') === 'лох');
ok('фраза из нескольких слов', hit('это плохое  слово') === 'плохое слово');
ok('части других слов и похожие слова не задевает', !hit('banana') && !hit('ох как') && !hit('Лохматый кот') && !hit('плохоеслово'));
ok('находка — по правилам сервера, без номера правила', A.checkCustom('bananas', W).kind === 'custom' && A.checkCustom('bananas', W).rule === 0);
ok('слов нет — проверки нет', A.checkCustom('bananas', []) === null && A.checkCustom('bananas', undefined) === null);

console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
process.exit(fails ? 1 : 0);
