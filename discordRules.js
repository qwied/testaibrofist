// ============ DISCORD: правила сервера и лестница наказаний ============
// Правила в #rules выкладывает команда rules (текст можно поправить в её
// окне) — здесь те же 12 правил в том же порядке: по ним бот называет
// игроку номер и название нарушенного правила («rule 2, No spam»).
// Поменялся порядок в #rules — поменять и тут.
'use strict';

const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;

const RULES = [
  { id: 1, title: 'Be respectful',
    text: 'Treat everyone kindly. No harassment, bullying, threats or personal attacks. ' +
          'No hate speech or slurs about race, ethnicity, nationality, religion, gender, sexual ' +
          'orientation, disability or age. Telling someone to hurt or kill themselves is never okay, ' +
          'even as a joke. Disagree with ideas, not with people.' },
  { id: 2, title: 'No spam',
    text: 'Do not flood the chat: no repeated or copy-pasted messages, walls of text, long rows of ' +
          'the same character, messages in all caps, emoji spam or mass mentions. Do not ping ' +
          'people or roles without a real reason.' },
  { id: 3, title: 'No advertising',
    text: 'Do not post invites to other Discord servers or promote your channel, stream, social ' +
          'media or shop without permission from the staff. Sending ads to members in DMs counts too.' },
  { id: 4, title: 'Keep it safe for work',
    text: 'No sexual, pornographic, gory or shocking content in messages, images, links, names or ' +
          'avatars. Players from 13 years old are welcome here, so keep everything suitable for them.' },
  { id: 5, title: 'No scams or harmful links',
    text: 'No phishing, fake giveaways, "free Nitro" offers, IP grabbers, malware or suspicious files. ' +
          'Never ask anyone for their password or account. If your account was hacked and posted links, ' +
          'change your password and tell a moderator.' },
  { id: 6, title: 'Respect privacy',
    text: 'Do not share anyone\'s personal information without their consent: real names, addresses, ' +
          'phone numbers, IP addresses, photos or private messages.' },
  { id: 7, title: 'Play fair',
    text: 'No cheats, hacks, exploits or tools that give an unfair advantage, and no guides on how to use ' +
          'them. No buying, selling or trading accounts or coins for real money. Found a bug? Report it ' +
          'to the staff instead of abusing it.' },
  { id: 8, title: 'Use the right channels',
    text: 'Keep each conversation in the channel it belongs to. Read the channel descriptions and pinned ' +
          'messages before posting.' },
  { id: 9, title: 'Keep names and profiles clean',
    text: 'Usernames, nicknames, avatars and statuses must be readable and appropriate. Do not ' +
          'impersonate the staff, other players or the bot.' },
  { id: 10, title: 'Avoid heated topics',
    text: 'Stay away from politics, religion and other topics that usually turn into fights. If a ' +
          'conversation gets heated, drop it and move on.' },
  { id: 11, title: 'Listen to the staff',
    text: 'Follow moderator instructions. Do not argue about a punishment in public chat, message a ' +
          'moderator instead. Using another account to get around a mute or a ban leads to a ban.' },
  { id: 12, title: 'Follow Discord\'s rules',
    text: 'Follow the Discord Terms of Service (https://discord.com/terms) and Community Guidelines ' +
          '(https://discord.com/guidelines). You must be at least 13 years old to use Discord.' }
];

const ruleById = id => RULES.find(r => r.id === id) || null;

/* Штрафные баллы: обычное нарушение — 1, слово-оскорбление по признаку,
   18+ и чужие личные данные — 2, мошенничество и вредные ссылки — 3.
   Баллы сгорают через 30 дней. Наказание — по сумме действующих баллов
   после нарушения: сначала предупреждение, дальше мьюты растут, с семи
   баллов за месяц — бан на неделю (бот сам снимает его), с девяти — бан
   навсегда. */
const STRIKE_TTL = 30 * DAY;
const LADDER = [
  { at: 1, type: 'warn' },
  { at: 2, type: 'mute', ms: 10 * MIN },
  { at: 3, type: 'mute', ms: HOUR },
  { at: 4, type: 'mute', ms: 6 * HOUR },
  { at: 5, type: 'mute', ms: DAY },
  { at: 6, type: 'mute', ms: 3 * DAY },
  { at: 7, type: 'ban', ms: 7 * DAY },
  { at: 9, type: 'ban' }
];

function punishmentFor(points) {
  let p = null;
  for (const step of LADDER) if (points >= step.at) p = step;
  return p;
}

function duration(ms) {
  if (ms >= DAY) { const d = Math.round(ms / DAY); return d + (d === 1 ? ' day' : ' days'); }
  if (ms >= HOUR) { const h = Math.round(ms / HOUR); return h + (h === 1 ? ' hour' : ' hours'); }
  const m = Math.max(1, Math.round(ms / MIN));
  return m + (m === 1 ? ' minute' : ' minutes');
}

function describe(p) {
  if (!p) return 'No action';
  if (p.type === 'warn') return 'Warning';
  if (p.type === 'ban') return p.ms ? 'Ban for ' + duration(p.ms) : 'Permanent ban';
  return 'Mute for ' + duration(p.ms);
}

// то же по-русски — для русской версии правил
function durationRu(ms) {
  const n = ms >= DAY ? Math.round(ms / DAY) : ms >= HOUR ? Math.round(ms / HOUR) : Math.max(1, Math.round(ms / MIN));
  const forms = ms >= DAY ? ['день', 'дня', 'дней'] : ms >= HOUR ? ['час', 'часа', 'часов'] : ['минуту', 'минуты', 'минут'];
  const k = n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2;
  return n + ' ' + forms[k];
}
function describeRu(p) {
  if (!p) return 'Без наказания';
  if (p.type === 'warn') return 'Предупреждение';
  if (p.type === 'ban') return p.ms ? 'Бан на ' + durationRu(p.ms) : 'Бан навсегда';
  return 'Мьют на ' + durationRu(p.ms);
}

const strikes = n => n + (n === 1 ? ' strike' : ' strikes');

/* Готовый текст правил для #rules (команда rules): те же 12 правил коротко
   и лестница наказаний — по-английски и по-русски. Владелец может его
   поправить в окне, но номера правил лучше не менять: бот пишет
   нарушителю номер и название правила. */
const SHORT_EN = [
  'No harassment, insults, threats or hate speech. No slurs about race, nationality, religion, gender, sexuality or disability. Never tell anyone to hurt themselves, even as a joke.',
  'No flooding, copy-paste, walls of text, all caps, emoji spam or mass mentions.',
  'No invites to other servers and no self-promotion without staff permission, in chat or in DMs. (Invites are removed by the bot, other ads are checked by moderators.)',
  'No sexual, gory or shocking content in messages, images, links, names or avatars.',
  'No phishing, fake giveaways, "free Nitro", IP grabbers, malware or suspicious files. Never ask for anyone\'s password or account.',
  'Do not share anyone\'s personal information: real names, addresses, phone numbers, IP addresses or photos. (Checked by moderators.)',
  'No cheats, hacks or exploits. No buying or selling accounts or coins for real money. Found a bug? Report it to the staff.',
  'Keep each topic in its channel and read the pinned messages. (Checked by moderators.)',
  'Usernames, nicknames, avatars and statuses must be appropriate. Do not impersonate the staff or other players. (Statuses are checked by moderators.)',
  'No politics or religion debates. If a talk gets heated, drop it.',
  'Follow moderator instructions. Do not argue about punishments in chat, message a moderator instead. Using another account to avoid a mute or ban leads to a ban. (Checked by moderators.)',
  'Follow the Discord Terms of Service and Community Guidelines. You must be at least 13 years old. (Checked by moderators.)'
];
const RULES_RU = [
  ['Уважайте друг друга', 'Без травли, оскорблений, угроз и ненависти, в том числе по расе, национальности, религии, полу, ориентации или инвалидности. Никогда не желайте никому навредить себе, даже в шутку.'],
  ['Без спама', 'Без флуда, копипасты, простыней текста, капса, спама эмодзи и массовых упоминаний.'],
  ['Без рекламы', 'Без приглашений на другие серверы и самопиара без разрешения администрации, ни в чате, ни в личке. (Приглашения удаляет бот, остальную рекламу проверяют модераторы.)'],
  ['Без контента 18+', 'Без сексуального, жестокого или шокирующего контента в сообщениях, картинках, ссылках, никах и аватарках.'],
  ['Без мошенничества и опасных ссылок', 'Без фишинга, фейковых розыгрышей, «бесплатного Nitro», IP-логгеров, вирусов и подозрительных файлов. Не просите чужие пароли и аккаунты.'],
  ['Уважайте личные данные', 'Не публикуйте чужую личную информацию: настоящие имена, адреса, номера телефонов, IP-адреса и фото. (Проверяют модераторы.)'],
  ['Играйте честно', 'Без читов, взломов и эксплойтов. Никакой покупки и продажи аккаунтов или монет за реальные деньги. Нашли баг? Сообщите администрации.'],
  ['Пишите в нужные каналы', 'Каждая тема — в своём канале, читайте закреплённые сообщения. (Проверяют модераторы.)'],
  ['Приличные ники и профили', 'Имена, ники, аватарки и статусы должны быть приличными. Не выдавайте себя за администрацию или других игроков. (Статусы проверяют модераторы.)'],
  ['Без острых тем', 'Без споров о политике и религии. Если разговор накаляется, закончите его.'],
  ['Слушайте администрацию', 'Выполняйте указания модераторов. Не спорьте о наказаниях в чате, напишите модератору. Обход мьюта или бана с другого аккаунта ведёт к бану. (Проверяют модераторы.)'],
  ['Соблюдайте правила Discord', 'Соблюдайте условия использования и правила сообщества Discord. Вам должно быть не меньше 13 лет. (Проверяют модераторы.)']
];

// «1 strike: Warning», «7-8 strikes: Ban for 7 days», «9+ strikes: Permanent ban»
function ladderLines(word, say) {
  return LADDER.map((step, i) => {
    const next = LADDER[i + 1];
    const range = !next ? step.at + '+' : next.at - 1 > step.at ? step.at + '-' + (next.at - 1) : String(step.at);
    return '- ' + range + ' ' + word(step.at, !next) + ': ' + say(step);
  });
}
const ruWord = (n, more) => { const k = n % 10 === 1 && n % 100 !== 11 && !more ? 0 : n % 10 >= 2 && n % 10 <= 4 && !more ? 1 : 2;
                               return ['балл', 'балла', 'баллов'][k]; };

function rulesText(lang) {
  if (lang === 'ru') {
    return RULES_RU.map((r, i) => '**' + (i + 1) + '. ' + r[0] + '.** ' + r[1]).join('\n') +
      '\n\nПравила действуют для всех, в том числе для модераторов и владельца. Правила без пометки бот проверяет сам, круглосуточно.' +
      '\n\n**Наказания**\nЗа нарушение даются штрафные баллы, они сгорают через 30 дней. Мошенничество и опасные ' +
      'ссылки дают сразу 3 балла; оскорбления по признаку, 18+ и чужие личные данные — 2.\n' +
      ladderLines(ruWord, describeRu).join('\n') + '\nВременный бан бот снимает сам, когда срок выйдет.';
  }
  return RULES.map((r, i) => '**' + r.id + '. ' + r.title + '.** ' + SHORT_EN[i]).join('\n') +
    '\n\nThe rules apply to everyone, including moderators and the owner. Rules without a note are checked by the bot automatically, around the clock.' +
    '\n\n**Punishments**\nBreaking a rule gives strikes, which expire after 30 days. Scams and harmful links give ' +
    '3 strikes at once; slurs, adult content and personal information give 2.\n' +
    ladderLines((n, more) => n === 1 && !more ? 'strike' : 'strikes', describe).join('\n') +
    '\nA temporary ban is lifted automatically when it ends.';
}

// цвета полосы слева у сообщений бота: без эмодзи, но с понятным оттенком
const COLORS = { neutral: 0x99A1AE, warn: 0xE0A100, mute: 0xE67E22, ban: 0xE04141, ok: 0x3BA55D };

module.exports = {
  RULES, ruleById, LADDER, STRIKE_TTL, punishmentFor, describe, describeRu, duration, strikes, rulesText,
  COLORS, MIN, HOUR, DAY
};
