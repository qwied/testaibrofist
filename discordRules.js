// ============ DISCORD: правила сервера и наказания ============
// Правила в #rules выкладывает команда rules (текст можно поправить в её
// окне) — здесь те же 7 правил в том же порядке: по ним бот называет
// игроку номер и название нарушенного правила («rule 2, No invites»).
// У каждого правила своё наказание (поле act), счёта баллов нет.
// Поменялся порядок в #rules — поменять и тут.
'use strict';

const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;

/* Наказание: none — только убрать сообщение, warn — убрать и предупредить,
   mute — тайм-аут, ban — бан (ms — на сколько; бот снимает его сам).
   Спам (правило 1) особый: каждое срабатывание убирает сообщения, а
   мьют даётся на SPAM.limit-е срабатывание за SPAM.reset (см. discordBot.js). */
const SPAM = { count: 4, window: 2000, limit: 5, reset: HOUR };   // 4 сообщения за 2 секунды — одно срабатывание

const RULES = [
  { id: 1, title: 'No spam', act: { type: 'mute', ms: 10 * MIN },
    en: 'More than 3 messages within 2 seconds. The messages are deleted; the 5th time in a row you get a 10-minute mute (the counter resets after an hour without spam).',
    ru: ['Без спама', 'Больше 3 сообщений за 2 секунды. Сообщения удаляются, на 5-й раз подряд мьют на 10 минут (счётчик сбрасывается, если час не спамить).'] },
  { id: 2, title: 'No invites to other Discord servers', act: { type: 'warn' },
    en: 'The message is deleted and you get a warning.',
    ru: ['Без приглашений на другие Discord-серверы', 'Сообщение удаляется, предупреждение.'] },
  { id: 3, title: 'No adult content', act: { type: 'mute', ms: HOUR },
    en: 'Images, links and text. The message is deleted and you get a 1-hour mute.',
    ru: ['Без контента 18+', 'Картинки, ссылки и текст. Сообщение удаляется, мьют на 1 час.'] },
  { id: 4, title: 'No hate speech', act: { type: 'mute', ms: HOUR },
    en: 'No slurs about nationality, religion, gender or orientation, and never tell anyone to hurt themselves. The message is deleted and you get a 1-hour mute.',
    ru: ['Без языка вражды', 'Без оскорблений по национальности, религии, полу и ориентации, и не желайте никому навредить себе. Сообщение удаляется, мьют на 1 час.'] },
  { id: 5, title: 'No scams or dangerous links', act: { type: 'ban', ms: 7 * DAY },
    en: 'Phishing, fake "free Nitro" and giveaways, IP grabbers, .exe files. The message is deleted and you are banned for 7 days (the bot lifts it by itself). This is the only rule with a ban.',
    ru: ['Без мошенничества и опасных ссылок', 'Фишинг, «бесплатный Nitro» и фейковые розыгрыши, IP-логгеры, exe-файлы. Сообщение удаляется, бан на 7 дней (бот сам снимает). Это единственное правило с баном.'] },
  { id: 6, title: 'No selling accounts or coins for real money', act: { type: 'warn' },
    en: 'The message is deleted and you get a warning.',
    ru: ['Без продажи аккаунтов и монет за реальные деньги', 'Сообщение удаляется, предупреждение.'] },
  { id: 7, title: 'No other people\'s IP addresses', act: { type: 'none' },
    en: 'The message is deleted, no punishment.',
    ru: ['Без чужих IP-адресов', 'Сообщение удаляется, без наказания.'] }
];

const ruleById = id => RULES.find(r => r.id === id) || null;

// наказание за находку: у правила своё, у находки без правила (свои слова сервера, ручное «warn») — предупреждение
const WARN = { type: 'warn' };
const actionFor = f => { const r = ruleById(f && f.rule); return r ? r.act : WARN; };

function duration(ms) {
  if (ms >= DAY) { const d = Math.round(ms / DAY); return d + (d === 1 ? ' day' : ' days'); }
  if (ms >= HOUR) { const h = Math.round(ms / HOUR); return h + (h === 1 ? ' hour' : ' hours'); }
  const m = Math.max(1, Math.round(ms / MIN));
  return m + (m === 1 ? ' minute' : ' minutes');
}

function describe(p) {
  if (!p || p.type === 'none') return 'No punishment';
  if (p.type === 'warn') return 'Warning';
  if (p.type === 'ban') return p.ms ? 'Ban for ' + duration(p.ms) : 'Permanent ban';
  return 'Mute for ' + duration(p.ms);
}

/* Готовый текст правил для #rules (команда rules): по-английски и по-русски.
   Владелец может его поправить в окне, но номера правил лучше не менять:
   бот пишет нарушителю номер и название правила. */
const FOOT_EN = 'Rules are checked by the bot automatically, there are no human moderators. Think the bot made a mistake? Message the owner.';
const FOOT_RU = 'Правила проверяет бот автоматически, модераторов нет. Ошибся бот? Напишите владельцу.';

function rulesText(lang) {
  if (lang === 'ru') return RULES.map(r => '**' + r.id + '. ' + r.ru[0] + '.** ' + r.ru[1]).join('\n') + '\n\n' + FOOT_RU;
  return RULES.map(r => '**' + r.id + '. ' + r.title + '.** ' + r.en).join('\n') + '\n\n' + FOOT_EN;
}

// цвета полосы слева у сообщений бота: без эмодзи, но с понятным оттенком
const COLORS = { neutral: 0x99A1AE, warn: 0xE0A100, mute: 0xE67E22, ban: 0xE04141, ok: 0x3BA55D };

module.exports = {
  RULES, ruleById, actionFor, SPAM, describe, duration, rulesText,
  COLORS, MIN, HOUR, DAY
};
