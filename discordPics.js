// ============ КАРТИНКИ БОТА: правила, наказания, предупреждения, справка ============
// Ответы бота в Discord — не текст, а карточка-картинка в стиле сайта: та
// же тёмная тема и шрифт Inter, что у страниц, логотип и цветная полоса
// сверху, как на превью сайта. Каждая карточка — на английском или русском
// (кнопки с флагами под ней перерисовывают её на другом языке).
// Здесь только разметка: данные собирает бот (discordBot.js), рисует поток
// рисования из discordCards.js (satori -> resvg), он же передаёт сюда
// общие кирпичики (ui). Высоту картинки satori считает сам по содержимому.
'use strict';
const R = require('./discordRules.js');

const W = 1000;
const STRIPE = ['#3b82f6', '#8b5cf6', '#10b981', '#ec4899'];      // полоса с превью сайта (preview.png)
// цвета наказаний: на светлом фоне темнее, чтобы читались
const ACCENTS = {
  dark: { warn: '#eaa94a', mute: '#f0883e', ban: '#f26b6b', ok: '#3ccf7a', info: '#a3acba', none: '#a3acba' },
  light: { warn: '#b97706', mute: '#d9560b', ban: '#dc2626', ok: '#16a34a', info: '#6b7280', none: '#6b7280' }
};
// тема текущей карточки: tree() ставит её перед тем, как собрать разметку (сборка синхронная, до рисования)
let ACCENT = ACCENTS.dark, THEME = 'dark';

/* ---------- тексты ---------- */
const S = {
  en: {
    moderation: 'Moderation', caseN: 'Case {n}', warnings: 'Warnings', rulesTag: 'Server rules', helpTag: 'Owner commands',
    statsTag: 'Live stats', updated: 'Updated {d}',
    warn: 'Warning', mute: 'Muted', ban: 'Banned', unmute: 'Mute lifted', unban: 'Ban lifted', unwarn: 'Warnings removed',
    removed: 'Message removed', rule: 'Rule', reason: 'Reason', other: 'Other', customWords: 'Words banned on this server',
    nativeWord: 'Server AutoMod rule', noReason: 'No reason given', by: 'Issued by {who}', byBot: 'Automatic, by the bot',
    ofLimit: '{n} of {limit}', warnWord: 'warning', warnsWord: 'warnings', removedWord: 'removed', muteWord: 'mute', banWord: 'ban',
    forever: 'Forever', until: 'Until {d}', liftsAt: 'The bot lifts it by itself on {d}', permanent: 'Permanent ban',
    nextMute: 'The {nth} warning within 30 days gives a 1-hour mute.', escalated: 'Warning {n} of {n}: muted for {d}. The count starts over.',
    escalatedBlocked: 'Warning {n} of {n}. The count starts over.',
    notApplied: 'Not applied: {why}', ownerBlocked: 'the server owner cannot be muted or banned', adminBlocked: 'administrators cannot be muted',
    failed: 'Failed: the bot has no permission', canTalk: 'Can talk again', backIn: 'Can join the server again', clean: 'Clean record now',
    active: 'Active', allTime: 'All time', last: 'Last', none: 'None', statusActive: 'ACTIVE', statusExpired: 'EXPIRED', statusUsed: 'GAVE A MUTE',
    noWarns: 'No warnings. Clean record.', warnsNote: 'Warnings count for 30 days. The 3rd one gives a 1-hour mute, then the count starts over.',
    overviewTitle: 'Members with warnings', membersWarned: 'Members warned', activeWarns: 'Active warnings', allWarns: 'All warnings',
    nobody: 'Nobody has warnings right now.', moreN: 'and {n} more',
    rulesSub: 'Checked by the bot automatically. There are no human moderators.', warnsAdd: 'Warnings add up',
    warnsAddText: 'The 3rd warning within 30 days gives a 1-hour mute, then the count starts over.',
    mistake: 'Think the bot made a mistake? Message the owner.',
    actNone: 'REMOVED', actWarn: 'WARNING', actMute: 'MUTE {d}', actBan: 'BAN {d}',
    botOnline: 'Bot', online: 'Online', offline: 'Reconnecting', checked: 'Messages checked', cases: 'Cases', helpNote:
      'Only you can use these commands, and the message with a command is removed at once. Write names without @: the bot never pings anyone.',
    secPosts: 'Posts', secMod: 'Moderation', secChannel: 'Channel', secInfo: 'Info',
    onlineNow: 'Online now', rooms: 'Rooms', race: 'Race', hns: 'Hide and Seek', peak: 'Peak since restart', players: 'Registered players',
    maps: 'Maps', uptime: 'Server uptime', memory: 'Memory', sockets: 'Connections', inGame: 'players in the game', upTo40: 'up to 40 players each',
    roomsN: '{n} rooms', roomN: '1 room', keepPrivate: 'Keep the stats link private', at: 'at {d}', playersN: '{n} players', playerN: '1 player',
    warnsNow: 'Active warnings'
  },
  ru: {
    moderation: 'Модерация', caseN: 'Случай {n}', warnings: 'Предупреждения', rulesTag: 'Правила сервера', helpTag: 'Команды владельца',
    statsTag: 'Статистика', updated: 'Обновлено {d}',
    warn: 'Предупреждение', mute: 'Мьют', ban: 'Бан', unmute: 'Мьют снят', unban: 'Бан снят', unwarn: 'Предупреждения сняты',
    removed: 'Сообщение удалено', rule: 'Правило', reason: 'Причина', other: 'Другое', customWords: 'Слова, запрещённые на сервере',
    nativeWord: 'Правило AutoMod сервера', noReason: 'Причина не указана', by: 'Выдал {who}', byBot: 'Автоматически, ботом',
    ofLimit: '{n} из {limit}', warnWord: 'предупреждение', warnsWord: 'предупреждения', removedWord: 'снято', muteWord: 'мьют', banWord: 'бан',
    forever: 'Навсегда', until: 'До {d}', liftsAt: 'Бот снимет его сам {d}', permanent: 'Бан навсегда',
    nextMute: '{nth} предупреждение за 30 дней — мьют на 1 час.', escalated: 'Предупреждение {n} из {n}: мьют на {d}. Счёт начинается заново.',
    escalatedBlocked: 'Предупреждение {n} из {n}. Счёт начинается заново.',
    notApplied: 'Не применено: {why}', ownerBlocked: 'владельца сервера нельзя замьютить или забанить', adminBlocked: 'администраторов нельзя замьютить',
    failed: 'Не вышло: у бота нет прав', canTalk: 'Снова может писать', backIn: 'Снова может зайти на сервер', clean: 'Теперь без предупреждений',
    active: 'Действуют', allTime: 'Всего', last: 'Последнее', none: 'Нет', statusActive: 'ДЕЙСТВУЕТ', statusExpired: 'ИСТЕКЛО', statusUsed: 'ДАЛО МЬЮТ',
    noWarns: 'Предупреждений нет. Чистая история.', warnsNote: 'Предупреждение действует 30 дней. 3-е даёт мьют на 1 час, после него счёт начинается заново.',
    overviewTitle: 'Участники с предупреждениями', membersWarned: 'Участников', activeWarns: 'Действуют', allWarns: 'Всего',
    nobody: 'Сейчас ни у кого нет предупреждений.', moreN: 'и ещё {n}',
    rulesSub: 'Правила проверяет бот автоматически. Модераторов нет.', warnsAdd: 'Предупреждения копятся',
    warnsAddText: '3-е предупреждение за 30 дней — мьют на 1 час, после него счёт начинается заново.',
    mistake: 'Бот ошибся? Напишите владельцу.',
    actNone: 'УДАЛЯЕТСЯ', actWarn: 'ПРЕДУПРЕЖДЕНИЕ', actMute: 'МЬЮТ {d}', actBan: 'БАН {d}',
    botOnline: 'Бот', online: 'В сети', offline: 'Подключается', checked: 'Проверено сообщений', cases: 'Случаев', helpNote:
      'Команды работают только у вас, сообщение с командой сразу удаляется. Имена пишите без @: бот никого не пингует.',
    secPosts: 'Посты', secMod: 'Модерация', secChannel: 'Канал', secInfo: 'Сведения',
    onlineNow: 'Сейчас в игре', rooms: 'Комнаты', race: 'Гонка', hns: 'Прятки', peak: 'Пик с перезапуска', players: 'Игроков всего',
    maps: 'Карт', uptime: 'Сервер работает', memory: 'Память', sockets: 'Подключений', inGame: 'игроков в игре', upTo40: 'до 40 игроков в каждой',
    roomsN: '{n} комн.', roomN: '1 комната', keepPrivate: 'Ссылку на статистику никому не давайте', at: '{d}', playersN: '{n} игр.', playerN: '1 игрок',
    warnsNow: 'Предупреждений'
  }
};
const langOf = l => l === 'ru' ? 'ru' : 'en';
function say(lang, key, vars) {
  let s = (S[langOf(lang)][key] !== undefined ? S[langOf(lang)][key] : S.en[key]) || '';
  for (const k of Object.keys(vars || {})) s = s.split('{' + k + '}').join(String(vars[k]));
  return s;
}

// русские числа: 1 час, 2 часа, 5 часов
const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};
function duration(ms, lang) {
  if (langOf(lang) === 'en') return R.duration(ms);
  const MIN = R.MIN, HOUR = R.HOUR, DAY = R.DAY;
  if (ms >= DAY) { const d = Math.round(ms / DAY); return d + ' ' + plural(d, 'день', 'дня', 'дней'); }
  if (ms >= HOUR) { const h = Math.round(ms / HOUR); return h + ' ' + plural(h, 'час', 'часа', 'часов'); }
  const m = Math.max(1, Math.round(ms / MIN));
  return m + ' ' + plural(m, 'минута', 'минуты', 'минут');
}
const MON = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
              ru: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'] };
const two = n => (n < 10 ? '0' : '') + n;
function date(ms, lang, withTime) {
  const d = new Date(Number(ms) || 0);
  if (isNaN(d.getTime()) || !ms) return '';
  const l = langOf(lang), m = MON[l][d.getUTCMonth()];
  const day = l === 'ru' ? d.getUTCDate() + ' ' + m + ' ' + d.getUTCFullYear() : m + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
  return withTime ? day + ', ' + two(d.getUTCHours()) + ':' + two(d.getUTCMinutes()) + ' UTC' : day;
}
// без года: «Oct 21, 16:34 UTC»
function short(ms, lang) {
  const d = new Date(Number(ms) || 0), l = langOf(lang), m = MON[l][d.getUTCMonth()];
  const t = two(d.getUTCHours()) + ':' + two(d.getUTCMinutes()) + ' UTC';
  return (l === 'ru' ? d.getUTCDate() + ' ' + m : m + ' ' + d.getUTCDate()) + ', ' + t;
}
const ordinal = (n, lang) => langOf(lang) === 'ru' ? n + '-е' : n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');

// что нашёл автомод — по-русски (по-английски это note самой находки)
const NOTE_RU = {
  flood: 'Больше 3 сообщений за 2 секунды', invite: 'Приглашение на другой сервер', 'nsfw-link': 'Ссылка на сайт 18+',
  'nsfw-image': 'Картинка 18+', slur: 'Оскорбление или язык вражды', selfharm: 'Призыв навредить себе',
  'scam-text': 'Известное мошенническое сообщение', 'everyone-link': 'Массовый пинг со ссылкой', badfile: 'Исполняемый файл',
  scam: 'Мошенническая или фишинговая ссылка', grabber: 'Ссылка, крадущая IP-адрес', cheat: 'Торговля за реальные деньги',
  custom: 'Слово, запрещённое на этом сервере', 'native-word': 'Заблокировано правилом AutoMod сервера',
  warns: '3 предупреждения за 30 дней'
};
function reasonText(d, lang) {
  if (d.kind && langOf(lang) === 'ru' && NOTE_RU[d.kind]) return NOTE_RU[d.kind] + (d.detail ? ' (' + d.detail + ')' : '');
  return d.reason || say(lang, 'noReason');
}
function ruleText(d, lang) {
  const r = R.ruleById(Number(d.rule));
  if (r) return r.id + '. ' + (langOf(lang) === 'ru' ? r.ru[0] : r.title);
  if (d.kind === 'custom') return say(lang, 'customWords');
  if (d.kind === 'native-word') return say(lang, 'nativeWord');
  return say(lang, 'other');
}
const actLabel = (act, lang) => !act || act.type === 'none' ? say(lang, 'actNone') : act.type === 'warn' ? say(lang, 'actWarn')
  : say(lang, act.type === 'ban' ? 'actBan' : 'actMute', { d: act.ms ? duration(act.ms, lang).toUpperCase() : say(lang, 'forever').toUpperCase() });
const actColor = act => !act || act.type === 'none' ? ACCENT.none : ACCENT[act.type] || ACCENT.info;

/* ---------- общие части ---------- */
function kit(ui, lang) {
  const { el, txt, clean } = ui;
  const t = ui.THEMES[THEME] || ui.THEMES.dark;
  const L = (k, v) => say(lang, k, v);
  const stripe = () => el('div', { width: W, height: 8, flexShrink: 0 }, STRIPE.map(c => el('div', { flexGrow: 1, height: 8, backgroundColor: c })));
  const page = (...kids) => el('div', { width: W, flexDirection: 'column', fontFamily: ui.FONT_FAMILY, color: t.ink, backgroundColor: t.bg,
                                        backgroundImage: 'linear-gradient(160deg, ' + t.bg2 + ' 0%, ' + t.bg + ' 100%)' },
    stripe(), el('div', { flexDirection: 'column', padding: '30px 40px 28px' }, ...kids));
  const tag = (s, c) => txt({ fontSize: 15, fontWeight: 800, letterSpacing: 1.6, textTransform: 'uppercase', color: c || t.muted,
                              border: '1px solid ' + (c || t.line), borderRadius: 999, padding: '5px 14px' }, s);
  const head = right => el('div', { alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
    el('div', { alignItems: 'center' }, ui.logo(t.ink, 30), txt({ fontSize: 26, fontWeight: 800, marginLeft: 12, letterSpacing: 1.5 }, 'AIBROFIST')),
    right ? tag(right) : null);
  const foot = (left, right) => el('div', { marginTop: 24, paddingTop: 16, borderTop: '1px solid ' + t.line, justifyContent: 'space-between',
                                            alignItems: 'center', color: t.muted, fontSize: 17 },
    txt({ fontWeight: 600 }, left || 'aibrofist.online'), txt({}, right || ''));
  const box = (style, ...kids) => el('div', Object.assign({ backgroundColor: t.panel, border: '1px solid ' + t.line, borderRadius: 16 }, style), ...kids);
  const label = (s, c) => txt({ fontSize: 14, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', color: c || t.muted }, s);
  const pill = (s, c) => txt({ fontSize: 13, fontWeight: 800, letterSpacing: 0.8, padding: '4px 11px', borderRadius: 999, border: '1px solid ' + c, color: c, flexShrink: 0 }, s);
  const dots = (n, limit, c) => el('div', { alignItems: 'center' },
    Array.from({ length: limit }, (x, i) => el('div', { width: 18, height: 18, borderRadius: 18, marginRight: 8,
      backgroundColor: i < n ? c : 'transparent', border: '2px solid ' + (i < n ? c : t.line) })));
  const avatar = (src, size) => src
    ? { type: 'img', props: { src, width: size, height: size, style: { width: size, height: size, borderRadius: size, border: '2px solid ' + t.line, flexShrink: 0 } } }
    : el('div', { width: size, height: size, borderRadius: size, backgroundColor: t.raised, border: '2px solid ' + t.line, alignItems: 'center',
                  justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }, ui.figure(t.ink, Math.round(size * 0.7)));
  const tile = (k, v, sub, c, width) => box({ flexDirection: 'column', padding: '14px 18px', width },
    label(k), txt({ fontSize: 36, fontWeight: 800, letterSpacing: -0.5, marginTop: 4, color: c || t.ink }, v),
    sub ? txt({ fontSize: 15, color: t.muted, marginTop: 2 }, sub) : null);
  const who = (d, size) => el('div', { alignItems: 'center', flexGrow: 1, minWidth: 0 },
    avatar(d.avatar, size),
    el('div', { flexDirection: 'column', marginLeft: 22, minWidth: 0, flexShrink: 1 },
      txt({ fontSize: size > 90 ? 44 : 30, fontWeight: 800, letterSpacing: -0.5 }, clean(d.name, 26) || clean(d.user, 26) || 'member'),
      d.user && clean(d.user, 32) && clean(d.user, 32) !== clean(d.name, 26) ? txt({ fontSize: 19, color: t.muted, marginTop: 2 }, '@' + clean(d.user, 32)) : null));
  return { t, el, txt, clean, L, page, head, foot, box, label, pill, dots, avatar, tile, who };
}

/* ---------- наказание и снятие: warn, mute, ban, unmute, unban, unwarn ---------- */
function actionTree(d, lang, ui) {
  const k = kit(ui, lang), { t, el, txt, L } = k;
  const type = d.type;
  const c = type === 'warn' ? ACCENT.warn : type === 'mute' ? ACCENT.mute : type === 'ban' ? ACCENT.ban : type === 'none' ? ACCENT.info : ACCENT.ok;
  const title = { warn: L('warn'), mute: L('mute'), ban: L('ban'), unmute: L('unmute'), unban: L('unban'), unwarn: L('unwarn'), none: L('removed') }[type] || L('moderation');
  // крупно справа: сколько предупреждений, на сколько мьют/бан, сколько снято
  let big = null, small = null;
  if (type === 'warn' && d.limit) { big = L('ofLimit', { n: d.n, limit: d.limit }); small = L('warnsWord'); }
  else if (type === 'mute' && d.ms) { big = duration(d.ms, lang); small = L('muteWord'); }
  else if (type === 'ban') { big = d.ms ? duration(d.ms, lang) : L('forever'); small = L('banWord'); }
  else if (type === 'unwarn') { big = String(d.count || 0); small = L('removedWord'); }
  const hero = k.box({ alignItems: 'center', padding: '22px 26px', borderLeft: '8px solid ' + c },
    el('div', { flexDirection: 'column', flexGrow: 1, minWidth: 0 },
      txt({ fontSize: 22, fontWeight: 800, letterSpacing: 2.5, textTransform: 'uppercase', color: c, marginBottom: 12 }, title),
      k.who(d, 112)),
    big ? el('div', { flexDirection: 'column', alignItems: 'flex-end', marginLeft: 20, flexShrink: 0 },
      txt({ fontSize: 46, fontWeight: 800, color: c, letterSpacing: -1 }, big), txt({ fontSize: 17, color: t.muted, marginTop: 2 }, small)) : null);
  const rows = [];
  const field = (key, value, color) => el('div', { flexDirection: 'column', marginTop: 18 },
    k.label(key), txt({ fontSize: 24, fontWeight: 600, marginTop: 6, lineHeight: 1.35, color: color || t.ink, display: 'block', lineClamp: 4 }, value));
  if (d.rule !== undefined && d.rule !== null && type !== 'unwarn' && type !== 'unmute' && type !== 'unban') rows.push(field(L('rule'), ruleText(d, lang)));
  if (d.reason || d.kind) rows.push(field(L('reason'), k.clean(reasonText(d, lang), 300)));
  // что дальше: шкала предупреждений, срок мьюта или бана
  let after = null;
  if (type === 'warn' && d.limit) {
    const line = d.escalated ? (d.blocked || !d.escalated.ms ? L('escalatedBlocked', { n: d.limit }) : L('escalated', { n: d.limit, d: duration(d.escalated.ms, lang) }))
                             : L('nextMute', { nth: ordinal(d.limit, lang) });
    after = el('div', { alignItems: 'center', marginTop: 22, padding: '14px 18px', borderRadius: 14, border: '1px dashed ' + t.line },
      k.dots(Math.min(d.n, d.limit), d.limit, d.escalated ? ACCENT.mute : c), txt({ fontSize: 19, color: d.escalated ? ACCENT.mute : t.muted, marginLeft: 8 }, line));
  } else if (type === 'mute' && d.ms && !d.blocked && !d.failed) {
    after = txt({ fontSize: 19, color: t.muted, marginTop: 20 }, L('until', { d: date((d.at || Date.now()) + d.ms, lang, true) }));
  } else if (type === 'ban' && !d.blocked && !d.failed) {
    after = txt({ fontSize: 19, color: t.muted, marginTop: 20 }, d.ms ? L('liftsAt', { d: date((d.at || Date.now()) + d.ms, lang) }) : L('permanent'));
  } else if (type === 'unmute' || type === 'unban' || type === 'unwarn') {
    after = txt({ fontSize: 19, color: ACCENT.ok, marginTop: 20 }, L(type === 'unmute' ? 'canTalk' : type === 'unban' ? 'backIn' : 'clean'));
  }
  const warnLine = d.failed ? L('failed') : d.blocked ? L('notApplied', { why: L(d.blocked === 'owner' ? 'ownerBlocked' : 'adminBlocked') }) : '';
  // наказал бот сам — как оспорить
  const appeal = !d.by && ['warn', 'mute', 'ban', 'none'].indexOf(type) !== -1;
  return k.page(
    k.head(L('moderation') + (d.caseNo ? '  ·  ' + L('caseN', { n: d.caseNo }) : '')),
    hero,
    el('div', { flexDirection: 'column', padding: '0 4px' }, rows, after,
       warnLine ? txt({ fontSize: 18, color: ACCENT.warn, marginTop: 14 }, warnLine) : null,
       appeal ? txt({ fontSize: 17, color: t.muted, marginTop: 14 }, L('mistake')) : null),
    k.foot(d.by ? L('by', { who: k.clean(d.by, 30) || '?' }) : L('byBot'), date(d.at || Date.now(), lang, true)));
}

/* ---------- предупреждения одного участника ---------- */
function warnsTree(d, lang, ui) {
  const k = kit(ui, lang), { t, el, txt, L } = k;
  const list = (d.list || []).slice(0, 8);
  const limit = d.limit || 3;
  const status = w => w.status === 'used' ? [L('statusUsed'), ACCENT.mute] : w.status === 'expired' ? [L('statusExpired'), t.muted] : [L('statusActive'), ACCENT.warn];
  const row = (w, i) => el('div', { alignItems: 'center', backgroundColor: t.panel, border: '1px solid ' + t.line, borderRadius: 12,
                                    padding: '12px 16px', marginTop: i ? 10 : 0 },
    el('div', { flexDirection: 'column', width: 150, flexShrink: 0 },
      txt({ fontSize: 16, fontWeight: 700 }, date(w.at, lang)), txt({ fontSize: 14, color: t.muted, marginTop: 2 }, w.by ? k.clean(w.by, 16) : L('byBot'))),
    el('div', { flexDirection: 'column', flexGrow: 1, flexShrink: 1, minWidth: 0, marginLeft: 10 },
      txt({ fontSize: 18, fontWeight: 800 }, ruleText(w, lang)),
      txt({ fontSize: 16, color: t.muted, marginTop: 3, display: 'block', lineClamp: 1 }, k.clean(reasonText(w, lang), 90))),
    k.pill(...status(w)));
  return k.page(
    k.head(L('warnings')),
    k.box({ alignItems: 'center', padding: '20px 24px' },
      k.who(d, 96),
      el('div', { flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, marginLeft: 16 },
        txt({ fontSize: 44, fontWeight: 800, color: d.active ? ACCENT.warn : ACCENT.ok }, L('ofLimit', { n: d.active || 0, limit })),
        el('div', { marginTop: 8 }, k.dots(d.active || 0, limit, ACCENT.warn)))),
    el('div', { justifyContent: 'space-between', marginTop: 16, marginBottom: 16 },
      k.tile(L('active'), String(d.active || 0), null, d.active ? ACCENT.warn : null, 296),
      k.tile(L('allTime'), String(d.total || 0), null, null, 296),
      k.tile(L('last'), d.last ? date(d.last, lang) : L('none'), null, null, 296)),
    list.length ? el('div', { flexDirection: 'column' }, list.map(row))
      : el('div', { height: 120, border: '2px dashed ' + t.line, borderRadius: 14, alignItems: 'center', justifyContent: 'center', color: ACCENT.ok, fontSize: 22 }, L('noWarns')),
    (d.total || 0) > list.length ? txt({ fontSize: 16, color: t.muted, marginTop: 10 }, L('moreN', { n: d.total - list.length })) : null,
    txt({ fontSize: 17, color: t.muted, marginTop: 16, lineHeight: 1.4 }, L('warnsNote')),
    k.foot(null, date(d.at || Date.now(), lang, true)));
}

/* ---------- у кого есть предупреждения (команда warns без имени) ---------- */
function warnsAllTree(d, lang, ui) {
  const k = kit(ui, lang), { t, el, txt, L } = k;
  const list = (d.list || []).slice(0, 10), limit = d.limit || 3;
  const row = (m, i) => el('div', { alignItems: 'center', backgroundColor: t.panel, border: '1px solid ' + t.line, borderRadius: 12,
                                    padding: '10px 16px', marginTop: i ? 8 : 0 },
    k.avatar(m.avatar, 44),
    el('div', { flexDirection: 'column', flexGrow: 1, minWidth: 0, marginLeft: 14 },
      txt({ fontSize: 20, fontWeight: 800 }, k.clean(m.name, 26) || 'member'),
      txt({ fontSize: 15, color: t.muted, marginTop: 2 }, L('last') + ': ' + date(m.last, lang) + '  ·  ' + L('allTime') + ': ' + m.total)),
    k.dots(m.active, limit, ACCENT.warn),
    txt({ fontSize: 22, fontWeight: 800, color: m.active ? ACCENT.warn : t.muted, width: 90, justifyContent: 'flex-end' }, m.active + ' / ' + limit));
  return k.page(
    k.head(L('warnings')),
    txt({ fontSize: 36, fontWeight: 800, letterSpacing: -0.5, marginBottom: 16 }, L('overviewTitle')),
    el('div', { justifyContent: 'space-between', marginBottom: 16 },
      k.tile(L('membersWarned'), String(d.members || 0), null, null, 296),
      k.tile(L('activeWarns'), String(d.active || 0), null, d.active ? ACCENT.warn : null, 296),
      k.tile(L('allWarns'), String(d.total || 0), null, null, 296)),
    list.length ? el('div', { flexDirection: 'column' }, list.map(row))
      : el('div', { height: 120, border: '2px dashed ' + t.line, borderRadius: 14, alignItems: 'center', justifyContent: 'center', color: ACCENT.ok, fontSize: 22 }, L('nobody')),
    (d.members || 0) > list.length ? txt({ fontSize: 16, color: t.muted, marginTop: 10 }, L('moreN', { n: d.members - list.length })) : null,
    txt({ fontSize: 17, color: t.muted, marginTop: 16, lineHeight: 1.4 }, L('warnsNote')),
    k.foot(null, date(d.at || Date.now(), lang, true)));
}

/* ---------- правила ----------
   Стандартные правила (d.std) — из discordRules.js: у каждого номер, название,
   пояснение и наказание плашкой справа. Свой текст владельца (команда rules)
   разбирается построчно: «**1. Название.** пояснение» — правило, остальное —
   абзацы. Разметку Discord (**, __, ` и т.п.) на картинке не рисуем. */
const plain = s => String(s || '').replace(/<#\d+>/g, '#channel').replace(/<@&?\d+>/g, '@').replace(/\*\*|__|~~|`|^>+\s?|^#+\s/gm, '').replace(/-#\s/g, '').trim();
function parseRules(text) {
  const out = [];
  for (const raw of String(text || '').split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^\**\s*(\d{1,2})[.)]\s*([^*]+?)\**\s*[.:]?\**\s*(.*)$/.exec(line);
    if (m && /^\*\*/.test(line)) out.push({ n: Number(m[1]), title: plain(m[2]).replace(/[.:]$/, ''), text: plain(m[3]) });
    else out.push({ p: plain(line) });
  }
  return out;
}
function rulesTree(d, lang, ui) {
  const k = kit(ui, lang), { t, el, txt, L } = k;
  const ru = langOf(lang) === 'ru';
  const items = d.std
    ? R.RULES.map(r => ({ n: r.id, title: ru ? r.ru[0] : r.title, text: ru ? r.ru[1] : r.en, act: r.act }))
    : parseRules(d.text).filter(x => x.n || x.p);
  const rule = (r, i) => el('div', { alignItems: 'flex-start', backgroundColor: t.panel, border: '1px solid ' + t.line, borderRadius: 14,
                                     padding: '16px 18px', marginTop: i ? 10 : 0 },
    txt({ width: 46, height: 46, borderRadius: 46, backgroundColor: t.raised, border: '1px solid ' + t.line, alignItems: 'center',
          justifyContent: 'center', fontSize: 22, fontWeight: 800, flexShrink: 0 }, String(r.n)),
    el('div', { flexDirection: 'column', flexGrow: 1, flexShrink: 1, minWidth: 0, marginLeft: 16, marginRight: r.act ? 14 : 0 },
      txt({ fontSize: 24, fontWeight: 800, lineHeight: 1.25 }, k.clean(r.title, 80)),
      r.text ? txt({ fontSize: 19, color: t.muted, marginTop: 5, lineHeight: 1.4 }, k.clean(r.text, 400)) : null),
    r.act ? k.pill(actLabel(r.act, lang), actColor(r.act)) : null);
  let i = 0;
  const body = items.map(x => x.n ? rule(x, i++) : txt({ fontSize: 19, color: t.muted, marginTop: 12, lineHeight: 1.4 }, k.clean(x.p, 500)));
  return k.page(
    k.head(L('rulesTag')),
    txt({ fontSize: 42, fontWeight: 800, letterSpacing: -0.8 }, k.clean(d.title, 60) || (ru ? 'Правила сервера' : 'Server Rules')),
    d.std ? txt({ fontSize: 19, color: t.muted, marginTop: 6, marginBottom: 20 }, L('rulesSub')) : el('div', { height: 18 }),
    el('div', { flexDirection: 'column' }, body),
    d.std ? el('div', { alignItems: 'center', marginTop: 16, padding: '16px 20px', borderRadius: 14, border: '1px dashed ' + ACCENT.warn },
      k.dots(3, 3, ACCENT.warn),
      el('div', { flexDirection: 'column', marginLeft: 8, flexShrink: 1 },
        txt({ fontSize: 21, fontWeight: 800, color: ACCENT.warn }, L('warnsAdd')),
        txt({ fontSize: 18, color: t.muted, marginTop: 3, lineHeight: 1.35 }, L('warnsAddText')))) : null,
    k.foot(d.std ? L('mistake') : null, d.at ? L('updated', { d: date(d.at, lang) }) : ''));
}

/* ---------- справка по командам владельца ---------- */
const HELP = [
  ['secPosts', [['news', 'Write a post: channel, title, text, up to 4 images and a link button', 'Пост: канал, заголовок, текст, до 4 картинок и кнопка-ссылка'],
                ['updates', 'Choose the channels for automatic game updates', 'Каналы для автоматических новостей игры'],
                ['rules', 'Edit and post the server rules, set extra banned words', 'Изменить и выложить правила, свои запрещённые слова']]],
  ['secMod', [['warn [name]', 'Warning form: member, rule and reason are required', 'Форма предупреждения: участник, правило и причина обязательны'],
              ['warns [name]', 'Warnings of a member, or everyone who has them', 'Предупреждения участника или всех, у кого они есть'],
              ['unwarn name', 'Remove all warnings of a member (unwarn all: of everyone)', 'Снять все предупреждения участника (unwarn all — у всех)'],
              ['mute name 1h reason', 'Mute for 10m, 1h, 6h, 1d, 3d or 7d', 'Мьют на 10m, 1h, 6h, 1d, 3d или 7d'],
              ['unmute name', 'Lift a mute', 'Снять мьют'],
              ['ban name 7d reason', 'Ban for 1d, 3d, 7d or 30d, without a duration: forever', 'Бан на 1d, 3d, 7d или 30d, без срока — навсегда'],
              ['unban name', 'Lift a ban', 'Снять бан']]],
  ['secChannel', [['clear 50', 'Delete the last 50 messages here (clear all, clear 20 name, clear stop)', 'Удалить 50 последних сообщений (clear all, clear 20 имя, clear stop)'],
                  ['modlog', 'Send moderation logs to this channel (modlog off: stop)', 'Журнал модерации в этот канал (modlog off — выключить)']]],
  ['secInfo', [['stats', 'Live server stats and your secret link (stats new: new link)', 'Статистика сервера и секретная ссылка (stats new — новая)'],
               ['help', 'This card', 'Эта карточка']]]
];
function helpTree(d, lang, ui) {
  const k = kit(ui, lang), { t, el, txt, L } = k;
  const ru = langOf(lang) === 'ru';
  const prefix = k.clean(d.prefix || '!', 12);
  const tw = (W - 80 - 3 * 12) / 4;
  const section = ([key, rows]) => el('div', { flexDirection: 'column', marginTop: 18 },
    k.label(L(key)),
    k.box({ flexDirection: 'column', padding: '6px 18px', marginTop: 8 },
      rows.map((r, i) => el('div', { alignItems: 'center', padding: '10px 0', borderTop: i ? '1px solid ' + t.line : 'none' },
        txt({ width: 330, flexShrink: 0, fontSize: 20, fontWeight: 800 }, prefix + r[0]),
        txt({ fontSize: 18, color: t.muted, flexShrink: 1, lineHeight: 1.35 }, ru ? r[2] : r[1])))));
  return k.page(
    k.head(L('helpTag')),
    el('div', { justifyContent: 'space-between' },
      k.tile(L('botOnline'), d.online ? L('online') : L('offline'), d.mode || null, d.online ? ACCENT.ok : ACCENT.warn, tw),
      k.tile(L('checked'), ui.num(d.checked), null, null, tw),
      k.tile(L('warnsNow'), ui.num(d.activeWarns), null, d.activeWarns ? ACCENT.warn : null, tw),
      k.tile(L('cases'), ui.num(d.cases), null, null, tw)),
    HELP.map(section),
    txt({ fontSize: 17, color: t.muted, marginTop: 18, lineHeight: 1.45 }, L('helpNote')),
    k.foot(null, date(d.at || Date.now(), lang, true)));
}

/* ---------- живая статистика (команда stats) ---------- */
function statsTree(d, lang, ui) {
  const k = kit(ui, lang), { t, el, txt, L } = k;
  const tw = (W - 80 - 3 * 12) / 4;
  const rooms = n => n === 1 ? L('roomN') : L('roomsN', { n });
  const players = n => n === 1 ? L('playerN') : L('playersN', { n: ui.num(n) });
  const up = s => { s = Math.max(0, Number(s) || 0); const dd = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
                    return (dd ? dd + (langOf(lang) === 'ru' ? 'д ' : 'd ') : '') + h + (langOf(lang) === 'ru' ? 'ч ' : 'h ') + m + (langOf(lang) === 'ru' ? 'м' : 'm'); };
  const m = d.modes || {};
  return k.page(
    k.head(L('statsTag')),
    el('div', { justifyContent: 'space-between' },
      k.tile(L('onlineNow'), ui.num(d.online), L('inGame'), ACCENT.ok, tw),
      k.tile(L('rooms'), ui.num(d.rooms), L('upTo40'), null, tw),
      k.tile(L('race'), ui.num((m.race || {}).players), rooms((m.race || {}).rooms || 0), null, tw),
      k.tile(L('hns'), ui.num((m.hideAndSeek || {}).players), rooms((m.hideAndSeek || {}).rooms || 0), null, tw)),
    el('div', { justifyContent: 'space-between', marginTop: 12 },
      k.tile(L('peak'), ui.num(d.peak), d.peakAt ? L('at', { d: short(d.peakAt, lang) }) : null, null, tw),
      k.tile(L('players'), ui.num(d.accounts), null, null, tw),
      k.tile(L('maps'), ui.num(d.maps), null, null, tw),
      k.tile(L('uptime'), up(d.uptime), null, null, tw)),
    el('div', { justifyContent: 'space-between', marginTop: 12 },
      k.tile(L('botOnline'), d.botOnline ? L('online') : L('offline'), d.botMode || null, d.botOnline ? ACCENT.ok : ACCENT.warn, tw),
      k.tile(L('checked'), ui.num(d.checked), null, null, tw),
      k.tile(L('memory'), ui.num(d.memory) + ' MB', null, null, tw),
      k.tile(L('sockets'), ui.num(d.sockets), players(d.online || 0), null, tw)),
    k.foot(L('keepPrivate'), date(d.at || Date.now(), lang, true)));
}

/* ---------- короткий итог команды ----------
   d: { tag: {en, ru}, title: {en, ru}, lines: [{en, ru}], color: 'ok' | 'warn' | 'info' }
   Тексты обоих языков бот кладёт сам: на картинке — нужный. */
function infoTree(d, lang, ui) {
  const k = kit(ui, lang), { t, el, txt } = k;
  const pick = x => x && typeof x === 'object' ? (x[langOf(lang)] || x.en || '') : String(x || '');
  const c = ACCENT[d.color] || ACCENT.info;
  return k.page(
    k.head(pick(d.tag)),
    k.box({ flexDirection: 'column', padding: '24px 28px', borderLeft: '8px solid ' + c },
      txt({ fontSize: 34, fontWeight: 800, letterSpacing: -0.5, color: t.ink, lineHeight: 1.2 }, k.clean(pick(d.title), 120)),
      (d.lines || []).map(l => txt({ fontSize: 21, color: t.muted, marginTop: 10, lineHeight: 1.4 }, k.clean(pick(l), 300)))),
    k.foot(null, date(d.at || Date.now(), lang, true)));
}

/* ---------- то же текстом ----------
   Подпись к картинке (alt): её читают программы для незрячих, и она же —
   запасной текст, если картинку нарисовать не вышло. */
function alt(kind, d, lang) {
  d = d || {};
  const L = (k, v) => say(lang, k, v);
  const ru = langOf(lang) === 'ru';
  const name = String(d.name || d.user || 'member');
  if (kind === 'action') {
    const head = { warn: L('warn'), mute: L('mute'), ban: L('ban'), unmute: L('unmute'), unban: L('unban'), unwarn: L('unwarn'), none: L('removed') }[d.type] || L('moderation');
    const bits = [head + ': ' + name + '.'];
    if (d.rule !== undefined && d.rule !== null && ['warn', 'mute', 'ban', 'none'].indexOf(d.type) !== -1) bits.push(L('rule') + ': ' + ruleText(d, lang) + '.');
    if (d.reason || d.kind) bits.push(L('reason') + ': ' + reasonText(d, lang).replace(/[.!?\s]+$/, '') + '.');
    if (d.type === 'warn' && d.limit) bits.push(d.escalated ? (d.blocked || !d.escalated.ms ? L('escalatedBlocked', { n: d.limit }) : L('escalated', { n: d.limit, d: duration(d.escalated.ms, lang) }))
                                                            : L('warnsWord').replace(/^./, c => c.toUpperCase()) + ': ' + L('ofLimit', { n: d.n, limit: d.limit }) + '. ' + L('nextMute', { nth: ordinal(d.limit, lang) }));
    if (d.type === 'mute' && d.ms) bits.push((ru ? 'Срок: ' : 'Duration: ') + duration(d.ms, lang) + '.');
    if (d.type === 'ban') bits.push(d.ms ? (ru ? 'Срок: ' : 'Duration: ') + duration(d.ms, lang) + '.' : L('permanent') + '.');
    if (d.type === 'unwarn') bits.push(L('allWarns') + ' ' + L('removedWord') + ': ' + (d.count || 0) + '.');
    if (d.blocked) bits.push(L('notApplied', { why: L(d.blocked === 'owner' ? 'ownerBlocked' : 'adminBlocked') }) + '.');
    if (d.failed) bits.push(L('failed') + '.');
    bits.push(d.by ? L('by', { who: d.by }) + '.' : L('byBot') + '.');
    if (!d.by && ['warn', 'mute', 'ban', 'none'].indexOf(d.type) !== -1) bits.push(L('mistake'));
    if (d.caseNo) bits.push(L('caseN', { n: d.caseNo }) + '.');
    return bits.join(' ');
  }
  if (kind === 'warns') return L('warnings') + ': ' + name + ' — ' + L('ofLimit', { n: d.active || 0, limit: d.limit || 3 }) + ', ' +
    L('allTime').toLowerCase() + ' ' + (d.total || 0) + '. ' + (d.list || []).slice(0, 5).map(w => date(w.at, lang) + ' ' + ruleText(w, lang) + ': ' + reasonText(w, lang)).join('; ');
  if (kind === 'warnsAll') return L('overviewTitle') + ': ' + (d.list || []).slice(0, 10).map(m => m.name + ' ' + m.active + '/' + (d.limit || 3)).join(', ') + (d.list && d.list.length ? '' : L('nobody'));
  if (kind === 'rules') {
    if (!d.std) return String(d.title || '') + '. ' + plain(d.text);
    // коротко (у подписи предел 1000 знаков): правило и наказание
    return String(d.title || '') + '. ' + R.RULES.map(r => r.id + '. ' + (ru ? r.ru[0] : r.title) + ' — ' + actLabel(r.act, lang).toLowerCase() + '.').join(' ') +
      ' ' + L('warnsAdd') + ': ' + L('warnsAddText') + ' ' + L('mistake');
  }
  if (kind === 'help') return L('helpTag') + ': ' + HELP.map(sec => sec[1].map(r => (d.prefix || '!') + r[0] + ' - ' + (ru ? r[2] : r[1])).join('; ')).join('; ');
  if (kind === 'stats') return L('statsTag') + ': ' + L('onlineNow') + ' ' + (d.online || 0) + ', ' + L('rooms') + ' ' + (d.rooms || 0) + ', ' + L('players') + ' ' + (d.accounts || 0) + '.';
  if (kind === 'info') {
    const pick = x => x && typeof x === 'object' ? (x[langOf(lang)] || x.en || '') : String(x || '');
    return [pick(d.title)].concat((d.lines || []).map(pick)).join(' ');
  }
  return '';
}

const TREES = { action: actionTree, warns: warnsTree, warnsAll: warnsAllTree, rules: rulesTree, help: helpTree, stats: statsTree, info: infoTree };
const KINDS = Object.keys(TREES);
function tree(kind, data, ui, theme) {
  const fn = TREES[kind];
  if (!fn) throw new Error('unknown card ' + kind);
  THEME = theme === 'light' ? 'light' : 'dark';
  ACCENT = ACCENTS[THEME];
  return fn(data || {}, langOf(data && data.lang), ui);
}

module.exports = { tree, alt, KINDS, W, say, duration, date, parseRules, NOTE_RU, ruleText, reasonText };
