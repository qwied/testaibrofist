// ============ ОТВЕТЫ БОТА: аккуратные «внутренние» сообщения Discord ============
// Ответы на команды — не картинки, а настоящие компоненты Discord (новый вид
// сообщений): рамка-контейнер с цветной полоской, текст, аватарка участника
// справа, кнопки. Минималистично и компактно: без логотипа, без шапок.
// Язык — английский, русский или один из discordLang.js: его бот берёт у самого
// Discord (язык человека в команде или нажатии) или тот, что человек выбрал
// командой /language; кнопок выбора языка нет.
// Кнопки у Discord бывают синие, серые, зелёные, красные и ссылки;
// чёрных нет, ближе всего серая («secondary», тёмная в тёмной теме) — все
// кнопки бота только такие, выбранная показывается неактивной.
// Здесь только разметка: данные собирает бот (discordBot.js).
'use strict';
const R = require('./discordRules.js');
const { COMPONENTS_V2 } = require('./discordApi.js');
const { PACKS } = require('./discordLang.js');      // переводы на остальные языки

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
    status: 'Status', lifts: 'Lifts', untilLabel: 'Until', tally: 'Count', checkedShort: 'Checked',
    warnsAddShort: 'Warnings add up: the 3rd within 30 days gives a 1-hour mute.',
    helpNoteShort: 'Only you can use these. Write names without @.',
    warnsNoteShort: 'Active for 30 days. The 3rd gives a 1-hour mute.',
    serversTitle: 'Servers', onlineN: '{n} online', noRoomsNow: 'No rooms right now. Press Play and a new room opens.',
    stOpen: 'open', stFull: 'full', stFreeing: 'a spot is freeing up', phHiding: 'Hiding', phHunt: 'Hunt', phStory: 'Story ended',
    leftT: '{t} left', mapN: 'map {m}', moreRooms: '+ {n} more rooms', refresh: 'Refresh', playNow: 'Play now', openProfile: 'Open profile',
    openStats: 'Open live stats', tabProfile: 'Profile', tabMaps: 'Maps', tabFriends: 'Friends', perToday: 'Today', perWeek: 'This week', perAll: 'All time',
    joined: 'Joined {d}', coinsL: 'Coins', raceScores: 'Race scores', hsScores: 'Hide and Seek scores', noRank: 'no rank', aboutL: 'About',
    nothingWritten: 'Nothing written yet', todayWord: 'today', weekWord: 'this week', noMapsYet: 'No maps published yet', noFriendsYet: 'No friends yet',
    published: 'Published {d}', inGameTag: 'in game', likesN: 'likes {a} · dislikes {b}', onlineNowTag: 'online now', minAgo: '{n} min ago', hAgo: '{n} h ago',
    dAgo: '{n} days ago', longAgo: 'long ago', friendsL: 'Friends', mapsL: 'Maps', moreN2: '+ {n} more',
    gRaceMode: 'Race', gHnsMode: 'Hide and Seek', userWord: 'Player', tipDark: '', rulesTitle: 'AIBROFIST Server Rules',
    langTitle: 'Language', langNow: 'The bot now answers every command in this language.', langAutoName: 'Automatic',
    langAutoText: 'The bot follows your Discord language: {lang}.', langHow: 'To change it, type a country or a language after /language.',
    langNone: 'Nothing found for “{q}”. Type a country or a language.'
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
    status: 'Статус', lifts: 'Снимется', untilLabel: 'До', tally: 'Счёт', checkedShort: 'Проверено',
    warnsAddShort: 'Предупреждения копятся: 3-е за 30 дней — мьют на 1 час.',
    helpNoteShort: 'Работают только у вас. Имена — без @.',
    warnsNoteShort: 'Действует 30 дней. 3-е даёт мьют на 1 час.',
    serversTitle: 'Серверы', onlineN: 'онлайн: {n}', noRoomsNow: 'Сейчас комнат нет. Нажмите «Играть» — откроется новая.',
    stOpen: 'открыта', stFull: 'полная', stFreeing: 'освобождается место', phHiding: 'Прячутся', phHunt: 'Охота', phStory: 'Сюжет окончен',
    leftT: 'осталось {t}', mapN: 'карта {m}', moreRooms: '+ ещё комнат: {n}', refresh: 'Обновить', playNow: 'Играть', openProfile: 'Открыть профиль',
    openStats: 'Открыть живую статистику', tabProfile: 'Профиль', tabMaps: 'Карты', tabFriends: 'Друзья', perToday: 'Сегодня', perWeek: 'За неделю', perAll: 'За всё время',
    joined: 'Регистрация: {d}', coinsL: 'Монеты', raceScores: 'Очки гонки', hsScores: 'Очки пряток', noRank: 'нет ранга', aboutL: 'О себе',
    nothingWritten: 'Ничего не написано', todayWord: 'сегодня', weekWord: 'за неделю', noMapsYet: 'Карт пока нет', noFriendsYet: 'Друзей пока нет',
    published: 'Опубликована {d}', inGameTag: 'в игре', likesN: 'нравится {a} · не нравится {b}', onlineNowTag: 'в сети', minAgo: '{n} мин назад', hAgo: '{n} ч назад',
    dAgo: '{n} дн. назад', longAgo: 'давно', friendsL: 'Друзья', mapsL: 'Карты', moreN2: '+ ещё {n}',
    gRaceMode: 'Гонка', gHnsMode: 'Прятки', userWord: 'Игрок', tipDark: '', rulesTitle: 'Правила сервера AIBROFIST',
    langTitle: 'Язык', langNow: 'Теперь бот отвечает на все команды на этом языке.', langAutoName: 'Автоматически',
    langAutoText: 'Бот следует языку вашего Discord: {lang}.', langHow: 'Чтобы сменить, введите страну или язык после /language.',
    langNone: 'По запросу «{q}» ничего не найдено. Введите страну или язык.'
  }
};
/* Язык ответа: en, ru или один из PACKS. Язык человека бот берёт у Discord (locale в нажатии или команде):
   ru-… -> ru, de -> de, pt-BR -> pt, zh-CN и zh-TW -> zh; чего нет в списке — английский. */
const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);     // только свои ключи: не «constructor», не «__proto__»
const langOf = l => l === 'ru' ? 'ru' : has(PACKS, l) ? l : 'en';
/* Языки Discord (locale): id, da, de, en-GB, en-US, es-ES, es-419, fr, hr, it, lt, hu, nl, no, pl, pt-BR, ro, fi, sv-SE, vi, tr, cs,
   el, bg, ru, uk, hi, th, zh-CN, ja, zh-TW, ko — других он не присылает. Код языка — первые буквы до дефиса; исключения ниже:
   китайский традиционный (zh-TW и Гонконг) — отдельный перевод «zt», норвежские nb и nn — «no». */
const LOCALES = { 'zh-tw': 'zt', 'zh-hk': 'zt', 'zh-mo': 'zt', 'zh-hant': 'zt', nb: 'no', nn: 'no' };
function fromLocale(locale) {
  const l = String(locale || '').toLowerCase().replace(/_/g, '-'), first = l.split('-')[0];
  return langOf(has(LOCALES, l) ? LOCALES[l] : has(LOCALES, first) && first !== 'zh' ? LOCALES[first] : first);
}
// строки языка; чего в переводе нет — английская (так владельцу достаются его английские карточки на любом языке)
function say(lang, key, vars) {
  const l = langOf(lang), own = l === 'en' || l === 'ru' ? S[l] : PACKS[l].s;
  let s = (own[key] !== undefined ? own[key] : S.en[key]) || '';
  for (const k of Object.keys(vars || {})) s = s.split('{' + k + '}').join(String(vars[k]));
  return s;
}

// русские числа: 1 час, 2 часа, 5 часов
const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};
// слово в нужной форме по правилу языка: one — «1 / много», slavic — русское, pl — польское, cs — чешское, lt — литовское,
// ro — румынское (после 19 — «de»), ends1 — латышское и исландское (1, 21, 31, но не 11), sl — словенское (1, 2, 3–4, остальное),
// ar — арабское (1, 2, 3–10, остальное), one — «1 / много», none — без форм
function pluralForm(kind, n, forms) {
  if (kind === 'none') return forms[0];
  if (kind === 'one') return n === 1 ? forms[0] : forms[1];
  if (kind === 'cs') return n === 1 ? forms[0] : n >= 2 && n <= 4 ? forms[1] : forms[2];
  if (kind === 'lt') {
    const a = n % 100, b = n % 10, teen = a >= 11 && a <= 19;
    return b === 1 && !teen ? forms[0] : b >= 2 && b <= 9 && !teen ? forms[1] : forms[2];
  }
  if (kind === 'ends1') return n % 10 === 1 && n % 100 !== 11 ? forms[0] : forms[1];             // латышский, исландский
  if (kind === 'sl') { const a = n % 100; return a === 1 ? forms[0] : a === 2 ? forms[1] : a === 3 || a === 4 ? forms[2] : forms[3]; }
  if (kind === 'ar') { const a = n % 100; return n === 1 ? forms[0] : n === 2 ? forms[1] : a >= 3 && a <= 10 ? forms[2] : forms[3]; }
  if (kind === 'ro') return n === 1 ? forms[0] : n === 0 || (n % 100 >= 1 && n % 100 <= 19) ? forms[1] : forms[2];
  if (kind === 'pl') {
    const a = n % 100, b = n % 10;
    return n === 1 ? forms[0] : b >= 2 && b <= 4 && !(a >= 12 && a <= 14) ? forms[1] : forms[2];
  }
  return plural(n, forms[0], forms[1], forms[2]);
}
function duration(ms, lang) {
  lang = langOf(lang);
  if (lang === 'en') return R.duration(ms);
  const MIN = R.MIN, HOUR = R.HOUR, DAY = R.DAY;
  if (lang === 'ru') {
    if (ms >= DAY) { const d = Math.round(ms / DAY); return d + ' ' + plural(d, 'день', 'дня', 'дней'); }
    if (ms >= HOUR) { const h = Math.round(ms / HOUR); return h + ' ' + plural(h, 'час', 'часа', 'часов'); }
    const m = Math.max(1, Math.round(ms / MIN));
    return m + ' ' + plural(m, 'минута', 'минуты', 'минут');
  }
  const u = PACKS[lang].units, sep = u.sep === undefined ? ' ' : u.sep;
  const num = ms >= DAY ? Math.round(ms / DAY) : ms >= HOUR ? Math.round(ms / HOUR) : Math.max(1, Math.round(ms / MIN));
  return num + sep + pluralForm(u.plural, num, ms >= DAY ? u.day : ms >= HOUR ? u.hour : u.min);
}
const MON = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
              ru: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'] };
const two = n => (n < 10 ? '0' : '') + n;
// дата средствами самой системы (Intl) для языков из PACKS; не вышло — английская запись
function intlDate(ms, lang, opts) {
  try { return new Intl.DateTimeFormat(PACKS[lang].locale, Object.assign({ timeZone: 'UTC' }, opts)).format(new Date(Number(ms) || 0)); }
  catch (e) { return null; }
}
function date(ms, lang, withTime) {
  const d = new Date(Number(ms) || 0);
  if (isNaN(d.getTime()) || !ms) return '';
  if (langOf(lang) !== 'en' && langOf(lang) !== 'ru') {
    const t = intlDate(ms, langOf(lang), withTime ? { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
                                                  : { year: 'numeric', month: 'short', day: 'numeric' });
    if (t) return withTime ? t + ' UTC' : t;
    lang = 'en';
  }
  const l = langOf(lang), m = MON[l][d.getUTCMonth()];
  const day = l === 'ru' ? d.getUTCDate() + ' ' + m + ' ' + d.getUTCFullYear() : m + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
  return withTime ? day + ', ' + two(d.getUTCHours()) + ':' + two(d.getUTCMinutes()) + ' UTC' : day;
}
// «Oct 22» (год — только если он не текущий)
function dshort(ms, lang) {
  if (langOf(lang) !== 'en' && langOf(lang) !== 'ru') {
    const cur = new Date(Number(ms) || 0).getUTCFullYear() === new Date().getUTCFullYear();
    const t = intlDate(ms, langOf(lang), cur ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' });
    if (t) return t;
    lang = 'en';
  }
  const d = new Date(Number(ms) || 0), l = langOf(lang), m = MON[l][d.getUTCMonth()];
  const y = d.getUTCFullYear() === new Date().getUTCFullYear() ? '' : (l === 'ru' ? ' ' : ', ') + d.getUTCFullYear();
  return (l === 'ru' ? d.getUTCDate() + ' ' + m : m + ' ' + d.getUTCDate()) + y;
}
const ordinal = (n, lang) => langOf(lang) === 'ru' ? n + '-е' : langOf(lang) !== 'en' ? String(n) : n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');

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
  const l = langOf(lang), note = l === 'ru' ? NOTE_RU[d.kind] : l === 'en' ? null : PACKS[l].notes[d.kind];
  if (d.kind && note) return note + (d.detail ? ' (' + d.detail + ')' : '');
  return d.reason || say(lang, 'noReason');
}
// название стандартного правила на языке
const ruleTitle = (r, lang) => { const l = langOf(lang); return l === 'ru' ? r.ru[0] : l === 'en' ? r.title : PACKS[l].rules[r.id - 1] || r.title; };
function ruleText(d, lang) {
  const r = R.ruleById(Number(d.rule));
  if (r) return r.id + '. ' + ruleTitle(r, lang);
  if (d.kind === 'custom') return say(lang, 'customWords');
  if (d.kind === 'native-word') return say(lang, 'nativeWord');
  return say(lang, 'other');
}
// ПРОПИСНЫМИ по правилам языка (в турецком «dakika» -> «DAKİKA», а не «DAKIKA»)
const up = (s, lang) => {
  const l = langOf(lang);
  try { return String(s).toLocaleUpperCase(l === 'en' || l === 'ru' ? undefined : PACKS[l].locale); } catch (e) { return String(s).toUpperCase(); }
};
const actLabel = (act, lang) => !act || act.type === 'none' ? say(lang, 'actNone') : act.type === 'warn' ? say(lang, 'actWarn')
  : say(lang, act.type === 'ban' ? 'actBan' : 'actMute', { d: up(act.ms ? duration(act.ms, lang) : say(lang, 'forever'), lang) });

/* ---------- кирпичики ---------- */
// имя игрока в тексте: без разметки и без упоминания
const esc = s => String(s == null ? '' : s).replace(/[\\*_`~|>#\[\]()<@:-]/g, c => '\\' + c);
const code = s => '`' + String(s).replace(/`/g, "'") + '`';
const dots = (n, limit) => '●'.repeat(Math.max(0, Math.min(n, limit))) + '○'.repeat(Math.max(0, limit - Math.min(n, limit)));
// пустой текст Discord не принимает — такой кусок просто пропускается (message() убирает null)
const txt = s => String(s == null ? '' : s).trim() ? { type: 10, content: String(s).slice(0, 3800) } : null;
// заголовок: строки текста и аватарка справа (если есть)
const head = (lines, url) => {
  const t = lines.map(txt).filter(Boolean);
  return url && t.length ? [{ type: 9, components: t, accessory: { type: 11, media: { url } } }] : t;
};
const who = (d) => '**' + esc(d.name || d.user || 'member') + '**' + (d.user && String(d.user) !== String(d.name) ? '  @' + esc(d.user) : '');
const small = (...a) => a.filter(Boolean).map(x => '-# ' + x).join('\n');

// у всех текстов сообщения вместе предел 4000 знаков: лишнее срезаем с самого длинного
function fit(parts, limit) {
  const texts = [];
  const walk = n => { if (Array.isArray(n)) n.forEach(walk); else if (n) { if (n.type === 10) texts.push(n); walk(n.components); } };
  walk(parts);
  let total = texts.reduce((a, t) => a + t.content.length, 0);
  for (let guard = 0; total > limit && guard < 50; guard++) {
    const t = texts.reduce((a, b) => b.content.length > a.content.length ? b : a);
    const keep = Math.max(1, t.content.length - (total - limit) - 1);
    total -= t.content.length - keep - 1;
    t.content = t.content.slice(0, keep) + '…';
  }
}
// сообщение: контейнер с полоской цвета, внутри — части и ряды кнопок
function message(view, rows, o) {
  o = o || {};
  const inner = [].concat(view.parts).filter(Boolean).concat((rows || []).filter(Boolean));
  fit(inner, 3900);
  return { flags: COMPONENTS_V2 | (o.ephemeral ? 64 : 0), allowed_mentions: { parse: [] },
           components: [{ type: 17, accent_color: view.color === undefined ? R.COLORS.neutral : view.color, components: inner }] };
}
// кнопки: все серые (secondary); выбранная — неактивная, с постоянным id
const button = (label, id, o) => Object.assign({ type: 2, style: 2, label: String(label).slice(0, 80), custom_id: id }, o || {});
const linkButton = (label, url) => ({ type: 2, style: 5, label: String(label).slice(0, 80), url });
const row = (...b) => ({ type: 1, components: b.filter(Boolean) });
// набор кнопок-вкладок: items [{ label, id, on }] — выбранная неактивная
const tabs = (items, current) => items.map(x => x.on ? button(x.label, current, { disabled: true }) : button(x.label, x.id));

/* ---------- наказание и снятие: warn, mute, ban, unmute, unban, unwarn ---------- */
function action(d, lang) {
  const L = (k, v) => say(lang, k, v);
  const type = d.type;
  const color = type === 'warn' ? R.COLORS.warn : type === 'mute' ? R.COLORS.mute : type === 'ban' ? R.COLORS.ban : type === 'none' ? R.COLORS.neutral : R.COLORS.ok;
  const title = { warn: L('warn'), mute: L('mute'), ban: L('ban'), unmute: L('unmute'), unban: L('unban'), unwarn: L('unwarn'), none: L('removed') }[type] || L('moderation');
  let tail = '';
  if (type === 'warn' && d.limit) tail = L('ofLimit', { n: d.n, limit: d.limit });
  else if (type === 'mute' && d.ms) tail = duration(d.ms, lang);
  else if (type === 'ban') tail = d.ms ? duration(d.ms, lang) : L('forever');
  else if (type === 'unwarn') tail = String(d.count || 0);
  const hasRule = d.rule !== undefined && d.rule !== null && ['unwarn', 'unmute', 'unban'].indexOf(type) === -1;
  const lines = [];
  if (hasRule) lines.push('**' + L('rule') + ':** ' + ruleText(d, lang));
  if (d.reason || d.kind) lines.push('**' + L('reason') + ':** ' + esc(reasonText(d, lang).slice(0, 300)));
  if (type === 'warn' && d.limit) {
    const text = d.escalated ? (d.blocked || !d.escalated.ms ? L('escalatedBlocked', { n: d.limit }) : L('escalated', { n: d.limit, d: duration(d.escalated.ms, lang) }))
                             : L('nextMute', { nth: ordinal(d.limit, lang), limit: d.limit });
    lines.push('**' + L('tally') + ':** ' + dots(Math.min(d.n, d.limit), d.limit) + '  ' + text);
  } else if (type === 'mute' && d.ms && !d.blocked && !d.failed) {
    lines.push('**' + L('untilLabel') + ':** ' + date((d.at || Date.now()) + d.ms, lang, true));
  } else if (type === 'ban' && !d.blocked && !d.failed) {
    lines.push('**' + (d.ms ? L('lifts') : L('banWord')) + ':** ' + (d.ms ? date((d.at || Date.now()) + d.ms, lang) : L('permanent')));
  } else if (type === 'unmute' || type === 'unban' || type === 'unwarn') {
    lines.push('**' + L('status') + ':** ' + L(type === 'unmute' ? 'canTalk' : type === 'unban' ? 'backIn' : 'clean'));
  }
  if (d.failed) lines.push('**' + L('status') + ':** ' + L('failed'));
  else if (d.blocked) lines.push('**' + L('status') + ':** ' + L('notApplied', { why: L(d.blocked === 'owner' ? 'ownerBlocked' : 'adminBlocked') }));
  const appeal = !d.by && ['warn', 'mute', 'ban', 'none'].indexOf(type) !== -1;
  const foot = small((d.by ? L('by', { who: esc(d.by) }) : L('byBot')) + (d.caseNo ? '  ·  ' + L('caseN', { n: d.caseNo }) : '') + '  ·  ' + date(d.at || Date.now(), lang),
                     appeal ? L('mistake') : '');
  return { color, parts: head(['### ' + title + (tail ? '  ·  ' + tail : ''), who(d)], d.avatarUrl).concat([txt(lines.concat(['', foot]).join('\n'))]) };
}

/* ---------- предупреждения одного участника ---------- */
function warns(d, lang) {
  const L = (k, v) => say(lang, k, v);
  const limit = d.limit || 3, list = (d.list || []).slice(0, 6);
  const status = w => w.status === 'used' ? L('statusUsed') : w.status === 'expired' ? L('statusExpired') : L('statusActive');
  const body = list.length
    ? list.map(w => '**' + ruleText(w, lang) + '**  ' + code(status(w)) + '\n' + small(dshort(w.at, lang) + ' · ' + esc(reasonText(w, lang).slice(0, 80)) + (w.by ? ' · ' + esc(w.by) : ''))).join('\n')
    : L('noWarns');
  return { color: d.active ? R.COLORS.warn : R.COLORS.ok, parts: head(['### ' + L('warnings') + '  ·  ' + L('ofLimit', { n: d.active || 0, limit }) + '   ' + dots(d.active || 0, limit), who(d)], d.avatarUrl)
    .concat([txt(body + ((d.total || 0) > list.length ? '\n' + small(L('moreN', { n: d.total - list.length })) : '')),
             txt(small(L('warnsNoteShort') + '  ·  ' + L('allTime') + ': ' + (d.total || 0)))]) };
}

/* ---------- у кого есть предупреждения (команда warns без имени) ---------- */
function warnsAll(d, lang) {
  const L = (k, v) => say(lang, k, v);
  const limit = d.limit || 3, list = (d.list || []).slice(0, 8);
  const body = list.length
    ? list.map(m => '**' + esc(m.name || 'member') + '**  ' + dots(m.active, limit) + '  ' + m.active + '/' + limit + '\n' +
                    small(L('last') + ': ' + dshort(m.last, lang) + ' · ' + L('allTime') + ': ' + m.total)).join('\n')
    : L('nobody');
  return { color: R.COLORS.warn, parts: [txt('### ' + L('overviewTitle')), txt(body + ((d.members || 0) > list.length ? '\n' + small(L('moreN', { n: d.members - list.length })) : '')),
    txt(small(L('membersWarned') + ': ' + (d.members || 0) + '  ·  ' + L('activeWarns') + ': ' + (d.active || 0) + '  ·  ' + L('allWarns') + ': ' + (d.total || 0)))] };
}

/* ---------- правила ----------
   Стандартные — из discordRules.js: номер, название, наказание и короткая строка под ним.
   Свой текст владельца (команда rules) показывается как он написан (разметка Discord работает). */
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
// короткая строка под названием правила на языке
const shortOf = (id, lang) => { const l = langOf(lang); return l === 'ru' ? SHORT[id][1] : l === 'en' ? SHORT[id][0] : PACKS[l].short[id - 1] || SHORT[id][0]; };
function rules(d, lang) {
  const L = (k, v) => say(lang, k, v);
  const ru = langOf(lang) === 'ru';
  const title = esc(d.title || (ru ? 'Правила сервера' : 'Server Rules'));
  if (!d.std) {
    return { color: R.COLORS.neutral, parts: [txt('## ' + String(d.title || (ru ? 'Правила сервера' : 'Server Rules')).slice(0, 200)), txt(String(d.text || '').slice(0, 3600)),
      txt(small(d.at ? L('updated', { d: date(d.at, lang) }) : ''))] };
  }
  const body = R.RULES.map(r => '**' + r.id + '  ' + ruleTitle(r, lang) + '**  ' + code(actLabel(r.act, lang)) + '\n' + small(shortOf(r.id, lang))).join('\n');
  return { color: R.COLORS.neutral, parts: [txt('## ' + title), txt(body), txt(dots(3, 3) + '  ' + L('warnsAddShort')),
    txt(small(L('mistake') + (d.at ? '  ·  ' + L('updated', { d: date(d.at, lang) }) : '')))] };
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
function help(d, lang) {
  const L = (k, v) => say(lang, k, v);
  const ru = langOf(lang) === 'ru';
  const prefix = d.prefix || '!';
  const num = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const groups = HELP.map(sec => small(L(sec[0]).toUpperCase()) + '\n' + sec[1].map(r => code(prefix + r[0]) + '  ' + (ru ? r[4] : r[3])).join('\n'));
  return { color: R.COLORS.neutral, parts: [txt('### ' + L('helpTag')),
    txt(code(d.online ? L('online') : L('offline')) + '  ·  ' + num(d.checked) + ' ' + L('checkedShort').toLowerCase() + '  ·  ' + num(d.activeWarns) + ' ' + L('warnsNow').toLowerCase() + '  ·  ' + num(d.cases) + ' ' + L('cases').toLowerCase()),
    txt(groups.join('\n')), txt(small(L('helpNoteShort')))] };
}

/* ---------- живая статистика (команда stats) ---------- */
function stats(d, lang) {
  const L = (k, v) => say(lang, k, v);
  const num = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const r = langOf(lang) === 'ru';
  const up = s => { s = Math.max(0, Number(s) || 0); const dd = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
                    return dd ? dd + (r ? 'д ' : 'd ') + h + (r ? 'ч' : 'h') : h + (r ? 'ч ' : 'h ') + m + (r ? 'м' : 'm'); };
  const m = d.modes || {};
  const rooms = n => n === 1 ? L('roomN') : L('roomsN', { n });
  return { color: R.COLORS.neutral, parts: [txt('### ' + L('statsTag')),
    txt('**' + num(d.online) + '** ' + L('inGame') + '  ·  **' + num(d.rooms) + '** ' + L('rooms').toLowerCase() + '\n' +
        L('race') + ' **' + num((m.race || {}).players) + '** (' + rooms((m.race || {}).rooms || 0) + ')  ·  ' + L('hns') + ' **' + num((m.hideAndSeek || {}).players) + '** (' + rooms((m.hideAndSeek || {}).rooms || 0) + ')\n' +
        L('peak') + ' **' + num(d.peak) + '**  ·  ' + L('players') + ' **' + num(d.accounts) + '**  ·  ' + L('maps') + ' **' + num(d.maps) + '**  ·  ' + L('uptime') + ' **' + up(d.uptime) + '**'),
    txt(small((d.botOnline ? L('online') : L('offline')) + '  ·  ' + num(d.checked) + ' ' + L('checkedShort').toLowerCase() + '  ·  ' + num(d.memory) + ' MB  ·  ' + date(d.at || Date.now(), lang)))] };
}

/* ---------- короткий итог команды ----------
   d: { tag: {en, ru}, title: {en, ru}, lines: [{en, ru}], color: 'ok' | 'warn' | 'info' } */
function info(d, lang) {
  const pick = x => x && typeof x === 'object' ? (x[langOf(lang)] || x.en || '') : String(x || '');
  const color = d.color === 'ok' ? R.COLORS.ok : d.color === 'warn' ? R.COLORS.warn : R.COLORS.neutral;
  return { color, parts: [txt(small(pick(d.tag)) + '\n### ' + pick(d.title).slice(0, 200)),
    (d.lines || []).length ? txt((d.lines || []).map(l => pick(l)).join('\n')) : null,
    txt(small(date(d.at || Date.now(), lang)))].filter(Boolean) };
}

/* ---------- /language: выбранный язык ----------
   d: { mode: 'set' | 'auto' | 'view' | 'none', label — «Deutsch · Германия», discord — язык Discord человека, q — что искали, suggest — подсказки } */
function language(d, lang) {
  const L = (k, v) => say(lang, k, v);
  if (d.mode === 'none') {
    const alt = (d.suggest || []).slice(0, 5).map(x => '• ' + esc(x)).join('\n');
    return { color: R.COLORS.neutral, parts: [txt('### ' + L('langTitle')), txt(L('langNone', { q: esc(String(d.q || '').slice(0, 60)) }) + (alt ? '\n' + alt : '')), txt(small(L('langHow')))] };
  }
  const auto = d.mode === 'auto' || !d.label;
  return { color: R.COLORS.neutral, parts: [txt('### ' + L('langTitle')),
    txt('**' + (auto ? L('langAutoName') : esc(d.label)) + '**\n' + (auto ? L('langAutoText', { lang: esc(d.discord || '') }) : L('langNow'))),
    d.mode === 'view' ? txt(small(L('langHow'))) : null].filter(Boolean) };
}

/* ---------- /servers: комнаты обоих режимов ---------- */
const PHASE_KEY = { lobby: 'phHiding', round: 'phHunt', storyEnd: 'phStory' };
const STATUS_KEY = { open: 'stOpen', full: 'stFull', freeing: 'stFreeing' };
const mmss = s => Math.floor(s / 60) + ':' + two(s % 60);
function servers(d, lang) {
  const L = (k, v) => say(lang, k, v);
  const list = d.list || [], m = d.modes || {};
  const players = n => n === 1 ? L('playerN') : L('playersN', { n });
  const rooms = n => n === 1 ? L('roomN') : L('roomsN', { n });
  const mode = (key, name) => {
    const rs = list.filter(r => r.mode === key), info_ = m[key] || { players: 0 };
    const shown = rs.slice(0, 8);
    const body = shown.length
      ? shown.map(r => '**' + esc(r.room) + '**  ' + r.players + '/' + (r.limit || 40) + '  ' + code(up(L(STATUS_KEY[r.status] || 'stOpen'), lang)) +
          (r.phase || r.map ? '\n' + small([r.phase ? L(PHASE_KEY[r.phase] || 'phHunt') + (r.secondsLeft !== null && r.secondsLeft !== undefined ? ' · ' + L('leftT', { t: mmss(r.secondsLeft) }) : '') : '',
                                              r.map ? L('mapN', { m: esc(r.map) }) : ''].filter(Boolean).join(' · ')) : '')).join('\n') +
        (rs.length > shown.length ? '\n' + small(L('moreRooms', { n: rs.length - shown.length })) : '')
      : small(L('noRoomsNow'));
    return txt('**' + name + '**  ·  ' + players(info_.players) + ' · ' + rooms(rs.length) + '\n' + body);
  };
  return { color: R.COLORS.neutral, parts: [txt('### ' + L('serversTitle') + '  ·  ' + L('onlineN', { n: d.online || 0 })),
    mode('race', L('gRaceMode')), mode('hideAndSeek', L('gHnsMode')),
    txt(small(L('upTo40') + '  ·  ' + clock(d.at || Date.now())))] };
}
const clock = ms => { const d = new Date(ms); return two(d.getUTCHours()) + ':' + two(d.getUTCMinutes()) + ':' + two(d.getUTCSeconds()) + ' UTC'; };

/* ---------- /account: профиль игрока (страницы p — профиль, m — карты, f — друзья) ---------- */
const plus = n => (n > 0 ? '+' : '') + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const nfmt = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
function ago(ms, now, lang) {
  const L = (k, v) => say(lang, k, v);
  if (!ms) return L('longAgo');
  const m = Math.floor(Math.max(0, now - ms) / 60000);
  if (m < 2) return L('onlineNowTag');
  if (m < 60) return L('minAgo', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return L('hAgo', { n: h });
  return L('dAgo', { n: Math.floor(h / 24) });
}
function account(d, lang, page, period) {
  const L = (k, v) => say(lang, k, v);
  const now = d.at || Date.now();
  const rankOf = r => r && r.rank ? esc(r.rank) + (r.manual ? ' *' : '') : L('noRank');
  const sub = small(L('joined', { d: date(d.joined, lang) || L('longAgo') }) + '  ·  ' + L('race') + ': ' + rankOf(d.rank && d.rank.race) + '  ·  ' + L('hns') + ': ' + rankOf(d.rank && d.rank.hs));
  const title = '### ' + esc(d.name);
  if (page === 'm') {
    const maps = (d.maps || []).slice(0, 8);
    const body = maps.length ? maps.map(x => '**' + esc(x.mapName || 'Untitled') + '**  ' + code(up(x.mapType === 'hideAndSeek' ? L('gHnsMode') : L('gRaceMode'), lang)) +
        (x.inGame ? '  ' + code(up(L('inGameTag'), lang)) : '') + '  **' + plus(x.rating) + '**\n' +
        small((x.date ? L('published', { d: dshort(x.date, lang) }) : L('longAgo')) + ' · ' + L('likesN', { a: nfmt(x.likes), b: nfmt(x.dislikes) }))).join('\n') : L('noMapsYet');
    return { color: R.COLORS.neutral, parts: [txt(title + '\n' + sub), txt(body + ((d.mapsCount || 0) > maps.length ? '\n' + small(L('moreN2', { n: d.mapsCount - maps.length })) : ''))] };
  }
  if (page === 'f') {
    const fr = (d.friends || []).slice(0, 15);
    const body = fr.length ? fr.map(f => '**' + esc(f.name) + '**  ·  ' + ago(f.lastSeen, now, lang)).join('\n') : L('noFriendsYet');
    return { color: R.COLORS.neutral, parts: [txt(title + '\n' + sub), txt(body + ((d.friendsCount || 0) > fr.length ? '\n' + small(L('moreN2', { n: d.friendsCount - fr.length })) : ''))] };
  }
  const per = period === 'day' ? 'day' : period === 'week' ? 'week' : 'all';
  const val = (all, day, week) => per === 'day' ? plus(day) + ' ' + L('todayWord') : per === 'week' ? plus(week) + ' ' + L('weekWord') : nfmt(all);
  const lines = ['**' + L('coinsL') + '**  ' + val(d.coins, d.coinsDay, d.coinsWeek),
                 '**' + L('raceScores') + '**  ' + val(d.score, d.scoreDay, d.scoreWeek),
                 '**' + L('hsScores') + '**  ' + val(d.hsScore, d.hsScoreDay, d.hsScoreWeek),
                 '**' + L('mapsL') + '** ' + nfmt(d.mapsCount) + '  ·  **' + L('friendsL') + '** ' + nfmt(d.friendsCount)];
  const about = String(d.about || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  return { color: R.COLORS.neutral, parts: [txt(title + '\n' + sub), txt(lines.join('\n')),
    txt(about ? '**' + L('aboutL') + '**  ' + esc(about) : small(L('nothingWritten')))] };
}

const VIEWS = { action, warns, warnsAll, rules, help, stats, info, servers, account, language };
function view(kind, data, lang, extra) {
  const fn = VIEWS[kind];
  if (!fn) throw new Error('unknown view ' + kind);
  return fn(data || {}, langOf(lang), extra && extra.page, extra && extra.period);
}

module.exports = { view, message, button, linkButton, row, tabs, say, langOf, fromLocale, duration, date, dshort, ruleText, reasonText, esc, code, small, txt, SHORT, HELP, NOTE_RU, VIEWS };
