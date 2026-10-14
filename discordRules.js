// ============ DISCORD: правила сервера и лестница наказаний ============
// Один источник и для текста в #rules, и для автомодерации: номер правила
// в уведомлении игроку совпадает с тем, что он читает в #rules, а таблица
// наказаний в канале собирается из тех же чисел, по которым бот действует.
// Текст — по-английски, как и весь сайт.
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
   после нарушения: сначала предупреждение, дальше мьюты растут, бан —
   только при восьми баллах за месяц. */
const STRIKE_TTL = 30 * DAY;
const LADDER = [
  { at: 1, type: 'warn' },
  { at: 2, type: 'mute', ms: 10 * MIN },
  { at: 3, type: 'mute', ms: HOUR },
  { at: 4, type: 'mute', ms: 6 * HOUR },
  { at: 5, type: 'mute', ms: DAY },
  { at: 6, type: 'mute', ms: 3 * DAY },
  { at: 8, type: 'ban' }
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
  if (p.type === 'ban') return 'Ban';
  return 'Mute for ' + duration(p.ms);
}

const strikes = n => n + (n === 1 ? ' strike' : ' strikes');

function ladderLines() {
  return LADDER.map((s, i) => {
    const next = LADDER[i + 1];
    const range = next && next.at - s.at > 1 ? s.at + ' to ' + (next.at - 1) + ' strikes' : strikes(s.at);
    return '**' + range + '** - ' + describe(s);
  });
}

// цвета полосы слева у сообщений бота: без эмодзи, но с понятным оттенком
const COLORS = { neutral: 0x99A1AE, warn: 0xE0A100, mute: 0xE67E22, ban: 0xE04141, ok: 0x3BA55D };

/* Сообщение для #rules: три карточки — вступление, правила и как работает
   модерация. Всё вместе укладывается в лимит Discord (6000 знаков). */
function rulesMessage() {
  return {
    allowed_mentions: { parse: [] },
    embeds: [
      { color: COLORS.neutral, title: 'AIBROFIST Server Rules',
        description: 'Welcome to the AIBROFIST community. These rules keep the server friendly and safe ' +
                     'for everyone. By chatting here you agree to follow them.' },
      { color: COLORS.neutral,
        description: RULES.map(r => '**' + r.id + '. ' + r.title + '**\n' + r.text).join('\n\n') },
      { color: COLORS.neutral, title: 'How moderation works',
        description: 'The bot checks messages for spam, slurs, advertising, adult content, scams and ' +
          'harmful files, removes the ones that break the rules and gives strikes. A normal break gives ' +
          '1 strike, slurs, adult content and other people\'s personal data give 2, scams and harmful ' +
          'links give 3. Strikes expire after 30 days. The punishment depends on your active strikes:\n\n' +
          ladderLines().join('\n') +
          '\n\nModerators can also give strikes for anything the bot cannot see. If you think the bot ' +
          'made a mistake, message a moderator: they can remove strikes and lift a mute.' }
    ]
  };
}

module.exports = {
  RULES, ruleById, LADDER, STRIKE_TTL, punishmentFor, describe, duration, strikes,
  ladderLines, rulesMessage, COLORS, MIN, HOUR, DAY
};
