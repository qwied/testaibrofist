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

const W = 600;                 // ширина в точках; рисуется вдвое чётче (SCALE) — Discord показывает картинку примерно такой ширины
const SCALE = 2;
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
    onlineNow: 'Online now', rooms: 'Rooms', race: 'Race', hns: 'Hide and Seek', peak: 'Peak online', players: 'Players',
    maps: 'Maps', uptime: 'Uptime', memory: 'Memory', sockets: 'Connections', inGame: 'players in the game', upTo40: 'up to 40 players each',
    roomsN: '{n} rooms', roomN: '1 room', keepPrivate: 'Keep the stats link private', at: 'at {d}', playersN: '{n} players', playerN: '1 player',
    warnsNow: 'Warnings',
    warnsAddShort: 'Warnings add up: the 3rd within 30 days gives a 1-hour mute.',
    helpNoteShort: 'Only you can use these. Write names without @.',
    warnsNoteShort: 'Active for 30 days. The 3rd gives a 1-hour mute.'
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
    onlineNow: 'Сейчас в игре', rooms: 'Комнаты', race: 'Гонка', hns: 'Прятки', peak: 'Пик онлайна', players: 'Игроков',
    maps: 'Карт', uptime: 'Работает', memory: 'Память', sockets: 'Подключений', inGame: 'игроков в игре', upTo40: 'до 40 игроков в каждой',
    roomsN: '{n} комн.', roomN: '1 комната', keepPrivate: 'Ссылку на статистику никому не давайте', at: '{d}', playersN: '{n} игр.', playerN: '1 игрок',
    warnsNow: 'Предупреждений',
    warnsAddShort: 'Предупреждения копятся: 3-е за 30 дней — мьют на 1 час.',
    helpNoteShort: 'Работают только у вас. Имена — без @.',
    warnsNoteShort: 'Действует 30 дней. 3-е даёт мьют на 1 час.'
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
// «Oct 22» (год — только если он не текущий)
function dshort(ms, lang) {
  const d = new Date(Number(ms) || 0), l = langOf(lang), m = MON[l][d.getUTCMonth()];
  const y = d.getUTCFullYear() === new Date().getUTCFullYear() ? '' : (l === 'ru' ? ' ' : ', ') + d.getUTCFullYear();
  return (l === 'ru' ? d.getUTCDate() + ' ' + m : m + ' ' + d.getUTCDate()) + y;
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

/* ---------- общие части ----------
   Карточки компактные: 600 точек в ширину (рисуются вдвое чётче, см. SCALE) — в Discord
   картинка показывается примерно такой ширины, поэтому текст читается без увеличения.
   Оформление — как у игры: плоский фон, панели с тонкой рамкой, мелкие подписи
   заглавными, крупные жирные числа; цвет — только у наказаний. */
function kit(ui, lang) {
  const { el, txt, clean } = ui;
  const t = ui.THEMES[THEME] || ui.THEMES.dark;
  const L = (k, v) => say(lang, k, v);
  const page = (...kids) => el('div', { width: W, flexDirection: 'column', padding: '18px 20px 16px', fontFamily: ui.FONT_FAMILY, color: t.ink, backgroundColor: t.bg }, ...kids);
  // шапка: значок и имя игры слева, что за карточка — справа (tag: текст или [текст, цвет])
  const head = tag => el('div', { alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    el('div', { alignItems: 'center' }, ui.logo(t.ink, 20), txt({ fontSize: 15, fontWeight: 800, marginLeft: 8, letterSpacing: 2 }, 'AIBROFIST')),
    tag ? el('div', { alignItems: 'center' }, [].concat(tag).map((x, i) => txt({ fontSize: 12, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase',
      color: Array.isArray(x) ? x[1] : t.muted, marginLeft: i ? 8 : 0 }, Array.isArray(x) ? x[0] : x))) : null);
  const foot = (left, right) => el('div', { marginTop: 12, justifyContent: 'space-between', alignItems: 'center', color: t.muted, fontSize: 12 },
    txt({ fontWeight: 600, flexShrink: 1, marginRight: 10 }, left || 'aibrofist.online'), txt({ flexShrink: 0 }, right || ''));
  const box = (style, ...kids) => el('div', Object.assign({ backgroundColor: t.panel, border: '1px solid ' + t.line, borderRadius: 12 }, style), ...kids);
  const label = (s, c) => txt({ fontSize: 10, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: c || t.muted }, s);
  const pill = (s, c) => txt({ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, padding: '3px 8px', borderRadius: 999, border: '1px solid ' + c, color: c, flexShrink: 0 }, s);
  const dots = (n, limit, c, size) => el('div', { alignItems: 'center' },
    Array.from({ length: limit }, (x, i) => el('div', { width: size || 12, height: size || 12, borderRadius: 12, marginRight: 5,
      backgroundColor: i < n ? c : 'transparent', border: '2px solid ' + (i < n ? c : t.line) })));
  const avatar = (src, size) => src
    ? { type: 'img', props: { src, width: size, height: size, style: { width: size, height: size, borderRadius: size, flexShrink: 0 } } }
    : el('div', { width: size, height: size, borderRadius: size, backgroundColor: t.raised, border: '1px solid ' + t.line, alignItems: 'center',
                  justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }, ui.figure(t.ink, Math.round(size * 0.7)));
  const tile = (k, v, sub, c, width) => box({ flexDirection: 'column', padding: '8px 12px', width },
    label(k), txt({ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, marginTop: 2, color: c || t.ink }, v),
    sub ? txt({ fontSize: 11, color: t.muted, marginTop: 1 }, sub) : null);
  // человек: аватарка Discord (нет — стандартная её, нет и той — фигурка) и имя
  const who = (d, size) => el('div', { alignItems: 'center', flexGrow: 1, minWidth: 0 },
    avatar(d.avatar, size),
    el('div', { flexDirection: 'column', marginLeft: 12, minWidth: 0, flexShrink: 1 },
      txt({ fontSize: size > 50 ? 22 : 17, fontWeight: 800, letterSpacing: -0.3 }, clean(d.name, 24) || clean(d.user, 24) || 'member'),
      d.user && clean(d.user, 32) && clean(d.user, 32) !== clean(d.name, 24) ? txt({ fontSize: 12, color: t.muted, marginTop: 1 }, '@' + clean(d.user, 32)) : null));
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
  const hasRule = d.rule !== undefined && d.rule !== null && type !== 'unwarn' && type !== 'unmute' && type !== 'unban';
  const reason = d.reason || d.kind ? k.clean(reasonText(d, lang), 200) : '';
  // что дальше: шкала предупреждений, срок мьюта или бана, что снято
  let after = null;
  if (type === 'warn' && d.limit) {
    const line = d.escalated ? (d.blocked || !d.escalated.ms ? L('escalatedBlocked', { n: d.limit }) : L('escalated', { n: d.limit, d: duration(d.escalated.ms, lang) }))
                             : L('nextMute', { nth: ordinal(d.limit, lang) });
    after = el('div', { alignItems: 'center' }, k.dots(Math.min(d.n, d.limit), d.limit, d.escalated ? ACCENT.mute : c, 10),
      txt({ fontSize: 12, color: d.escalated ? ACCENT.mute : t.muted, marginLeft: 3 }, line));
  } else if (type === 'mute' && d.ms && !d.blocked && !d.failed) {
    after = txt({ fontSize: 12, color: t.muted }, L('until', { d: date((d.at || Date.now()) + d.ms, lang, true) }));
  } else if (type === 'ban' && !d.blocked && !d.failed) {
    after = txt({ fontSize: 12, color: t.muted }, d.ms ? L('liftsAt', { d: date((d.at || Date.now()) + d.ms, lang) }) : L('permanent'));
  } else if (type === 'unmute' || type === 'unban' || type === 'unwarn') {
    after = txt({ fontSize: 12, color: ACCENT.ok }, L(type === 'unmute' ? 'canTalk' : type === 'unban' ? 'backIn' : 'clean'));
  }
  const warnLine = d.failed ? L('failed') : d.blocked ? L('notApplied', { why: L(d.blocked === 'owner' ? 'ownerBlocked' : 'adminBlocked') }) : '';
  // наказал бот сам — как оспорить (в самом низу, мелко)
  const appeal = !d.by && ['warn', 'mute', 'ban', 'none'].indexOf(type) !== -1;
  const details = [hasRule ? txt({ fontSize: 15, fontWeight: 800, lineHeight: 1.3 }, ruleText(d, lang)) : null,
                   reason ? txt({ fontSize: 14, color: t.muted, marginTop: hasRule ? 2 : 0, lineHeight: 1.35, display: 'block', lineClamp: 2 }, reason) : null,
                   after ? el('div', { marginTop: 8 }, after) : null,
                   warnLine ? txt({ fontSize: 12, color: ACCENT.warn, marginTop: 6 }, warnLine) : null].filter(Boolean);
  return k.page(
    k.head([[title, c]].concat(d.caseNo ? [L('caseN', { n: d.caseNo })] : [])),
    k.box({ flexDirection: 'column', padding: '14px 16px', borderLeft: '4px solid ' + c },
      el('div', { alignItems: 'center' }, k.who(d, 52),
        big ? el('div', { flexDirection: 'column', alignItems: 'flex-end', marginLeft: 12, flexShrink: 0 },
          txt({ fontSize: 28, fontWeight: 800, color: c, letterSpacing: -0.5 }, big), txt({ fontSize: 11, color: t.muted }, small)) : null),
      details.length ? el('div', { flexDirection: 'column', marginTop: 12, paddingTop: 10, borderTop: '1px solid ' + t.line }, details) : null),
    k.foot(d.by ? L('by', { who: k.clean(d.by, 30) || '?' }) : appeal ? L('mistake') : L('byBot'), date(d.at || Date.now(), lang)));
}

/* ---------- предупреждения одного участника ---------- */
function warnsTree(d, lang, ui) {
  const k = kit(ui, lang), { t, el, txt, L } = k;
  const list = (d.list || []).slice(0, 6);
  const limit = d.limit || 3;
  const status = w => w.status === 'used' ? [L('statusUsed'), ACCENT.mute] : w.status === 'expired' ? [L('statusExpired'), t.muted] : [L('statusActive'), ACCENT.warn];
  const row = (w, i) => el('div', { alignItems: 'center', padding: '8px 0', borderTop: i ? '1px solid ' + t.line : 'none' },
    txt({ width: 62, flexShrink: 0, fontSize: 12, color: t.muted }, dshort(w.at, lang)),
    el('div', { flexDirection: 'column', flexGrow: 1, flexShrink: 1, minWidth: 0, marginRight: 8 },
      txt({ fontSize: 14, fontWeight: 800 }, ruleText(w, lang)),
      txt({ fontSize: 12, color: t.muted, marginTop: 1, display: 'block', lineClamp: 1 }, k.clean(reasonText(w, lang), 80))),
    k.pill(...status(w)));
  return k.page(
    k.head(L('warnings')),
    k.box({ flexDirection: 'column', padding: '14px 16px' },
      el('div', { alignItems: 'center' }, k.who(d, 52),
        el('div', { flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, marginLeft: 12 },
          txt({ fontSize: 28, fontWeight: 800, color: d.active ? ACCENT.warn : ACCENT.ok, letterSpacing: -0.5 }, L('ofLimit', { n: d.active || 0, limit })),
          el('div', { marginTop: 4 }, k.dots(d.active || 0, limit, ACCENT.warn, 11)))),
      list.length ? el('div', { flexDirection: 'column', marginTop: 10, paddingTop: 2, borderTop: '1px solid ' + t.line }, list.map(row))
        : txt({ fontSize: 14, color: ACCENT.ok, marginTop: 12 }, L('noWarns'))),
    (d.total || 0) > list.length ? txt({ fontSize: 12, color: t.muted, marginTop: 8 }, L('moreN', { n: d.total - list.length })) : null,
    k.foot(L('warnsNoteShort'), L('allTime') + ': ' + (d.total || 0)));
}

/* ---------- у кого есть предупреждения (команда warns без имени) ---------- */
function warnsAllTree(d, lang, ui) {
  const k = kit(ui, lang), { t, el, txt, L } = k;
  const list = (d.list || []).slice(0, 8), limit = d.limit || 3;
  const row = (m, i) => el('div', { alignItems: 'center', padding: '7px 0', borderTop: i ? '1px solid ' + t.line : 'none' },
    k.avatar(m.avatar, 30),
    el('div', { flexDirection: 'column', flexGrow: 1, minWidth: 0, marginLeft: 10 },
      txt({ fontSize: 15, fontWeight: 800 }, k.clean(m.name, 26) || 'member'),
      txt({ fontSize: 11, color: t.muted, marginTop: 1 }, L('last') + ': ' + dshort(m.last, lang) + '  ·  ' + L('allTime') + ': ' + m.total)),
    k.dots(m.active, limit, ACCENT.warn, 10),
    txt({ fontSize: 15, fontWeight: 800, color: m.active ? ACCENT.warn : t.muted, width: 46, justifyContent: 'flex-end' }, m.active + '/' + limit));
  return k.page(
    k.head([[L('overviewTitle'), t.ink]]),
    list.length ? k.box({ flexDirection: 'column', padding: '4px 14px' }, list.map(row))
      : k.box({ padding: '18px', justifyContent: 'center', color: ACCENT.ok, fontSize: 14 }, L('nobody')),
    (d.members || 0) > list.length ? txt({ fontSize: 12, color: t.muted, marginTop: 8 }, L('moreN', { n: d.members - list.length })) : null,
    k.foot(L('membersWarned') + ': ' + (d.members || 0) + '  ·  ' + L('activeWarns') + ': ' + (d.active || 0), L('allWarns') + ': ' + (d.total || 0)));
}

/* ---------- правила ----------
   Стандартные правила (d.std) — из discordRules.js: номер, название, одна короткая
   строка и наказание плашкой справа (полный текст — в подписи картинки и на сайте).
   Свой текст владельца (команда rules) разбирается построчно: «**1. Название.** пояснение» —
   правило, остальное — абзацы. Разметку Discord (**, __, ` и т.п.) на картинке не рисуем. */
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
// короткая строка под названием правила на картинке
const SHORT = {
  1: ['More than 3 messages in 2 seconds. Mute on the 5th time.', 'Больше 3 сообщений за 2 секунды. Мьют на 5-й раз.'],
  2: ['Message deleted, you get a warning.', 'Сообщение удаляется, предупреждение.'],
  3: ['Images, links and text.', 'Картинки, ссылки и текст.'],
  4: ['Slurs, and telling anyone to hurt themselves.', 'Оскорбления и призывы навредить себе.'],
  5: ['Phishing, fake Nitro, IP grabbers, .exe. The only ban.', 'Фишинг, фейк-Nitro, IP-логгеры, exe. Единственный бан.'],
  6: ['Message deleted, you get a warning.', 'Сообщение удаляется, предупреждение.'],
  7: ['Message deleted, no punishment.', 'Сообщение удаляется, без наказания.']
};
function rulesTree(d, lang, ui) {
  const k = kit(ui, lang), { t, el, txt, L } = k;
  const ru = langOf(lang) === 'ru';
  const items = d.std
    ? R.RULES.map(r => ({ n: r.id, title: ru ? r.ru[0] : r.title, text: SHORT[r.id][ru ? 1 : 0], act: r.act }))
    : parseRules(d.text).filter(x => x.n || x.p);
  const rule = (r, i) => el('div', { alignItems: 'center', padding: '9px 0', borderTop: i ? '1px solid ' + t.line : 'none' },
    txt({ width: 26, height: 26, borderRadius: 26, backgroundColor: t.raised, border: '1px solid ' + t.line, alignItems: 'center',
          justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }, String(r.n)),
    el('div', { flexDirection: 'column', flexGrow: 1, flexShrink: 1, minWidth: 0, marginLeft: 12, marginRight: r.act ? 10 : 0 },
      txt({ fontSize: 16, fontWeight: 800, lineHeight: 1.2 }, k.clean(r.title, 80)),
      r.text ? txt({ fontSize: 12, color: t.muted, marginTop: 2, lineHeight: 1.3, display: 'block', lineClamp: 3 }, k.clean(r.text, 300)) : null),
    r.act ? k.pill(actLabel(r.act, lang), actColor(r.act)) : null);
  let i = 0;
  const body = items.map(x => x.n ? rule(x, i++) : txt({ fontSize: 12, color: t.muted, marginTop: 8, lineHeight: 1.35 }, k.clean(x.p, 500)));
  return k.page(
    k.head(L('rulesTag')),
    txt({ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, marginBottom: 8 }, k.clean(d.title, 60) || (ru ? 'Правила сервера' : 'Server Rules')),
    k.box({ flexDirection: 'column', padding: '2px 14px' }, body),
    d.std ? el('div', { alignItems: 'center', marginTop: 10, padding: '9px 12px', borderRadius: 10, border: '1px dashed ' + ACCENT.warn },
      k.dots(3, 3, ACCENT.warn, 10),
      txt({ fontSize: 12, color: t.muted, marginLeft: 3, flexShrink: 1 }, L('warnsAddShort'))) : null,
    k.foot(d.std ? L('mistake') : null, d.at ? L('updated', { d: date(d.at, lang) }) : ''));
}

/* ---------- справка по командам владельца ---------- */
// [команда, описание (en), описание (ru), коротко (en), коротко (ru)]: коротко — на картинке, полное — в подписи к ней
const HELP = [
  ['secPosts', [['news', 'Write a post: channel, title, text, up to 4 images and a link button', 'Пост: канал, заголовок, текст, до 4 картинок и кнопка-ссылка', 'Write a post', 'Написать пост'],
                ['updates', 'Choose the channels for automatic game updates', 'Каналы для автоматических новостей игры', 'Channels for game updates', 'Каналы новостей игры'],
                ['rules', 'Edit and post the server rules, set extra banned words', 'Изменить и выложить правила, свои запрещённые слова', 'Edit the rules and banned words', 'Правила и запрещённые слова']]],
  ['secMod', [['warn [name]', 'Warning form: member, rule and reason are required', 'Форма предупреждения: участник, правило и причина обязательны', 'Warning form (all fields required)', 'Форма предупреждения'],
              ['warns [name]', 'Warnings of a member, or everyone who has them', 'Предупреждения участника или всех, у кого они есть', 'Warnings of a member or of all', 'Предупреждения участника или всех'],
              ['unwarn name', 'Remove all warnings of a member (unwarn all: of everyone)', 'Снять все предупреждения участника (unwarn all — у всех)', 'Remove warnings (unwarn all: everyone)', 'Снять предупреждения (unwarn all — у всех)'],
              ['mute name 1h reason', 'Mute for 10m, 1h, 6h, 1d, 3d or 7d', 'Мьют на 10m, 1h, 6h, 1d, 3d или 7d', 'Mute: 10m, 1h, 6h, 1d, 3d, 7d', 'Мьют: 10m, 1h, 6h, 1d, 3d, 7d'],
              ['unmute name', 'Lift a mute', 'Снять мьют', 'Lift a mute', 'Снять мьют'],
              ['ban name 7d reason', 'Ban for 1d, 3d, 7d or 30d, without a duration: forever', 'Бан на 1d, 3d, 7d или 30d, без срока — навсегда', 'Ban: 1d, 3d, 7d, 30d or forever', 'Бан: 1d, 3d, 7d, 30d или навсегда'],
              ['unban name', 'Lift a ban', 'Снять бан', 'Lift a ban', 'Снять бан']]],
  ['secChannel', [['clear 50', 'Delete the last 50 messages here (clear all, clear 20 name, clear stop)', 'Удалить 50 последних сообщений (clear all, clear 20 имя, clear stop)', 'Delete messages (all, 20 name, stop)', 'Удалить сообщения (all, 20 имя, stop)'],
                  ['modlog', 'Send moderation logs to this channel (modlog off: stop)', 'Журнал модерации в этот канал (modlog off — выключить)', 'Moderation log here (modlog off)', 'Журнал модерации сюда (modlog off)']]],
  ['secInfo', [['stats', 'Live server stats and your secret link (stats new: new link)', 'Статистика сервера и секретная ссылка (stats new — новая)', 'Live stats and secret link', 'Статистика и секретная ссылка'],
               ['help', 'This card', 'Эта карточка', 'This card', 'Эта карточка']]]
];
function helpTree(d, lang, ui) {
  const k = kit(ui, lang), { t, el, txt, L } = k;
  const ru = langOf(lang) === 'ru';
  const prefix = k.clean(d.prefix || '!', 12);
  const rows = [].concat(...HELP.map(sec => sec[1]));
  // состояние бота — одной строкой из четырёх цифр
  const stat = (key, value, c) => el('div', { flexDirection: 'column', flexGrow: 1 }, k.label(key), txt({ fontSize: 18, fontWeight: 800, marginTop: 1, color: c || t.ink }, value));
  return k.page(
    k.head(L('helpTag')),
    k.box({ padding: '10px 14px', marginBottom: 8 },
      stat(L('botOnline'), d.online ? L('online') : L('offline'), d.online ? ACCENT.ok : ACCENT.warn),
      stat(L('checked'), ui.num(d.checked)),
      stat(L('warnsNow'), ui.num(d.activeWarns), d.activeWarns ? ACCENT.warn : null),
      stat(L('cases'), ui.num(d.cases))),
    k.box({ flexDirection: 'column', padding: '2px 14px' }, rows.map((r, i) =>
      el('div', { alignItems: 'center', padding: '6px 0', borderTop: i ? '1px solid ' + t.line : 'none' },
        txt({ width: 196, flexShrink: 0, fontSize: 13, fontWeight: 800 }, prefix + r[0]),
        txt({ fontSize: 12, color: t.muted, flexShrink: 1 }, ru ? r[4] : r[3])))),
    k.foot(L('helpNoteShort'), date(d.at || Date.now(), lang)));
}

/* ---------- живая статистика (команда stats) ---------- */
function statsTree(d, lang, ui) {
  const k = kit(ui, lang), { t, el, txt, L } = k;
  const tw = (W - 40 - 3 * 8) / 4;
  const rooms = n => n === 1 ? L('roomN') : L('roomsN', { n });
  const up = s => { s = Math.max(0, Number(s) || 0); const dd = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
                    const r = langOf(lang) === 'ru';
                    return (dd ? dd + (r ? 'д ' : 'd ') : '') + h + (r ? 'ч ' : 'h ') + m + (r ? 'м' : 'm'); };
  const m = d.modes || {};
  return k.page(
    k.head(L('statsTag')),
    el('div', { justifyContent: 'space-between' },
      k.tile(L('onlineNow'), ui.num(d.online), L('inGame'), ACCENT.ok, tw),
      k.tile(L('rooms'), ui.num(d.rooms), null, null, tw),
      k.tile(L('race'), ui.num((m.race || {}).players), rooms((m.race || {}).rooms || 0), null, tw),
      k.tile(L('hns'), ui.num((m.hideAndSeek || {}).players), rooms((m.hideAndSeek || {}).rooms || 0), null, tw)),
    el('div', { justifyContent: 'space-between', marginTop: 8 },
      k.tile(L('peak'), ui.num(d.peak), d.peakAt ? short(d.peakAt, lang) : null, null, tw),
      k.tile(L('players'), ui.num(d.accounts), null, null, tw),
      k.tile(L('maps'), ui.num(d.maps), null, null, tw),
      k.tile(L('uptime'), up(d.uptime), null, null, tw)),
    k.foot((d.botOnline ? L('online') : L('offline')) + '  ·  ' + L('checked') + ': ' + ui.num(d.checked) + '  ·  ' + ui.num(d.memory) + ' MB', date(d.at || Date.now(), lang)));
}

/* ---------- короткий итог команды ----------
   d: { tag: {en, ru}, title: {en, ru}, lines: [{en, ru}], color: 'ok' | 'warn' | 'info' }
   Тексты обоих языков бот кладёт сам: на картинке — нужный. */
function infoTree(d, lang, ui) {
  const k = kit(ui, lang), { t, el, txt } = k;
  const pick = x => x && typeof x === 'object' ? (x[langOf(lang)] || x.en || '') : String(x || '');
  const c = ACCENT[d.color] || ACCENT.info;
  return k.page(
    k.head([[pick(d.tag), c]]),
    k.box({ flexDirection: 'column', padding: '14px 16px', borderLeft: '4px solid ' + c },
      txt({ fontSize: 20, fontWeight: 800, letterSpacing: -0.3, lineHeight: 1.25 }, k.clean(pick(d.title), 120)),
      (d.lines || []).map(l => txt({ fontSize: 13, color: t.muted, marginTop: 6, lineHeight: 1.35 }, k.clean(pick(l), 300)))),
    k.foot(null, date(d.at || Date.now(), lang)));
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

module.exports = { tree, alt, KINDS, W, SCALE, say, duration, date, parseRules, NOTE_RU, ruleText, reasonText };
