// ============ СТРАНЫ МИРА И ЯЗЫКИ ДЛЯ КОМАНДЫ /language ============
// Человек вводит страну или язык (подсказки Discord — автодополнение), бот запоминает
// его язык и дальше отвечает на нём во всех командах. Страны и их названия — не списком
// в коде, а средствами самой системы (Intl.DisplayNames): названия сразу на языке
// самого человека. Здесь только таблица «страна -> языки» (первый — основной).
// Языки — только те, что есть в discordLang.js (en и ru встроены): тест следит, чтобы
// каждый язык таблицы существовал и у каждой страны был хотя бы один.
// Страна, чей язык не переведён, получает самый распространённый в ней из переведённых
// (например, Казахстан — казахский и русский, Мьянма — английский).
'use strict';
const { PACKS } = require('./discordLang.js');

const TABLE = `
AD es fr
AE ar en
AF fa
AG en
AL sq
AM hy ru
AO pt
AR es
AT de
AU en
AZ az ru
BA hr sr
BB en
BD bn
BE nl fr de
BF fr
BG bg
BH ar
BI fr sw
BJ fr
BN ms
BO es
BR pt
BS en
BT en
BW en
BY ru
BZ en es
CA en fr
CD fr sw
CF fr
CG fr
CH de fr it
CI fr
CL es
CM fr en
CN zh
CO es
CR es
CU es
CV pt
CY el tr
CZ cs
DE de
DJ fr ar
DK da
DM en
DO es
DZ ar fr
EC es
EE et
EG ar
ER ar en
ES es
ET en
FI fi sv
FJ en
FM en
FR fr
GA fr
GB en
GD en
GE ka ru
GH en
GM en
GN fr
GQ es fr pt
GR el
GT es
GW pt
GY en
HK zt en
HN es
HR hr
HT fr
HU hu
ID id
IE en
IL he ar
IN hi en bn ta ur
IQ ar
IR fa
IS is
IT it
JM en
JO ar
JP ja
KE sw en
KG ru
KH en
KI en
KM ar fr
KN en
KP ko
KR ko
KW ar
KZ kk ru
LA en
LB ar fr
LC en
LI de
LK en ta
LR en
LS en
LT lt
LU fr de
LV lv
LY ar
MA ar fr
MC fr
MD ro ru
ME sr hr
MG fr
MH en
MK mk
ML fr
MM en
MN en
MO zt pt
MR ar fr
MT en
MU en fr
MV en
MW en
MX es
MY ms en zh ta
MZ pt
NA en af
NE fr
NG en
NI es
NL nl
NO no
NP hi en
NR en
NZ en
OM ar
PA es
PE es
PG en
PH fil en
PK ur en
PL pl
PR es en
PS ar
PT pt
PW en
PY es
QA ar
RO ro
RS sr
RU ru
RW fr en sw
SA ar
SB en
SC en fr
SD ar
SE sv
SG en zh ms ta
SI sl
SK sk
SL en
SM it
SN fr
SO ar en
SR nl
SS en
ST pt
SV es
SY ar
SZ en
TD fr ar
TG fr
TH th
TJ ru
TL pt
TM ru
TN ar fr
TO en
TR tr
TT en
TV en
TW zt
TZ sw en
UA uk ru
UG en sw
US en es
UY es
UZ ru
VA it
VC en
VE es
VN vi
VU en fr
WS en
XK sq
YE ar
ZA en af
ZM en
ZW en`;

// язык -> название на английском (для поиска) по коду ICU; китайский — два письма
const ICU = { zh: 'zh-Hans', zt: 'zh-Hant' };
const SPECIAL_NATIVE = { en: 'English', ru: 'Русский' };
const knownLang = l => l === 'en' || l === 'ru' || Object.prototype.hasOwnProperty.call(PACKS, l);
const nativeOf = l => SPECIAL_NATIVE[l] || (PACKS[l] && PACKS[l].name) || l;

const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim();

// безопасная обёртка над Intl.DisplayNames: не вышло — запасное значение
const displayCache = new Map();
const CACHE_MAX = 100;                  // Discord присылает около 32 языков; чужой ввод кэш не раздувает
function displayNames(locale, type) {
  const key = type + ':' + locale;
  if (displayCache.has(key)) return displayCache.get(key);
  let dn = null;
  try { dn = new Intl.DisplayNames([locale], { type, fallback: 'none' }); } catch (e) { dn = null; }
  if (displayCache.size < CACHE_MAX) displayCache.set(key, dn);
  return dn;
}
function regionName(cc, locale) {
  const dn = displayNames(locale || 'en', 'region');
  let n = null;
  try { n = dn && dn.of(cc); } catch (e) { n = null; }
  if (n) return n;
  const en = displayNames('en', 'region');
  try { n = en && en.of(cc); } catch (e) { n = null; }
  return n || cc;
}
function langEnglish(l) {
  const dn = displayNames('en', 'language');
  let n = null;
  try { n = dn && dn.of(ICU[l] || l); } catch (e) { n = null; }
  return n || nativeOf(l);
}

// все пары «страна + язык» в порядке таблицы; primary — основной язык страны
const ENTRIES = [];
const SKIPPED = [];
for (const line of TABLE.trim().split('\n')) {
  const [cc, ...langs] = line.trim().split(/\s+/);
  const ok = langs.filter(l => { if (knownLang(l)) return true; SKIPPED.push(cc + '-' + l); return false; });
  (ok.length ? ok : ['en']).forEach((lang, n) => ENTRIES.push({ cc, lang, primary: n === 0, value: cc + '-' + lang }));
}
const BY_VALUE = new Map(ENTRIES.map(e => [e.value, e]));
// ключи поиска, не зависящие от языка человека: название страны и языка по-английски и на самом языке, коды
for (const e of ENTRIES) {
  e.keys = [regionName(e.cc, 'en'), regionName(e.cc, e.lang === 'zt' ? 'zh-Hant' : e.lang), langEnglish(e.lang), nativeOf(e.lang), e.cc, e.lang].map(norm).filter(Boolean);
}

/* Подпись пункта: страна на языке человека — язык на нём самом: «Германия — Deutsch». В поле Discord — до 100 знаков. */
function label(e, locale) {
  const name = regionName(e.cc, locale) + ' — ' + nativeOf(e.lang);
  return name.length > 100 ? name.slice(0, 99) + '…' : name;
}
function describe(e, locale) { return nativeOf(e.lang) + ' · ' + regionName(e.cc, locale); }

// самые распространённые языки — их показывает пустое поле
const TOP = ['US-en', 'ES-es', 'RU-ru', 'BR-pt', 'DE-de', 'FR-fr', 'TR-tr', 'PL-pl', 'UA-uk', 'IT-it', 'CN-zh', 'JP-ja', 'ID-id', 'IN-hi', 'KR-ko',
  'SA-ar', 'NL-nl', 'VN-vi', 'TH-th', 'IR-fa', 'IL-he', 'GR-el', 'SE-sv', 'CZ-cs'];

const topRank = e => { const n = TOP.indexOf(e.value); return n < 0 ? 99 : n; };

// на сколько запрос подходит записи: 3 — совпадает целиком, 2 — начало слова, 1 — внутри; 0 — нет
function score(e, q, callerKey) {
  let best = 0;
  const keys = callerKey ? e.keys.concat(callerKey) : e.keys;
  for (const k of keys) {
    if (k === q) return 3;
    if (k.startsWith(q) || k.indexOf(' ' + q) >= 0) best = Math.max(best, 2);
    else if (q.length >= 3 && k.indexOf(q) >= 0) best = Math.max(best, 1);
  }
  return best;
}
const callerNames = new Map();
function callerKey(e, locale) {
  const base = String(locale || 'en');
  let m = callerNames.get(base);
  if (!m) {
    if (callerNames.size >= CACHE_MAX) return '';
    callerNames.set(base, m = new Map());
  }
  if (!m.has(e.cc)) m.set(e.cc, norm(regionName(e.cc, base)));
  return m.get(e.cc);
}

/* Поиск по тому, что человек уже напечатал: страна или язык (по-английски, на языке самого человека, на родном языке страны),
   код страны или языка. Пустой запрос — самые распространённые. */
function search(query, locale, limit) {
  const max = Math.max(1, Math.min(25, limit || 25));
  const q = norm(query);
  if (!q) return TOP.map(v => BY_VALUE.get(v)).filter(Boolean).slice(0, max);
  const hits = [];
  ENTRIES.forEach((e, n) => {
    const s = score(e, q, callerKey(e, locale));
    if (s) hits.push({ e, s, n });
  });
  hits.sort((a, b) => b.s - a.s || topRank(a.e) - topRank(b.e) || (b.e.primary - a.e.primary) || a.n - b.n);
  return hits.slice(0, max).map(h => h.e);
}

/* Выбранное в подсказке — «DE-de»; напечатанное вручную — по названию: берём самое подходящее, если оно одно или
   все лучшие совпадения на одном языке (Deutsch — Германия, не Австрия); иначе — null и бот предложит варианты. */
function find(value, locale) {
  const v = String(value == null ? '' : value).trim();
  const m = /^([A-Za-z]{2})-([A-Za-z]{2,3})$/.exec(v);
  if (m) return BY_VALUE.get(m[1].toUpperCase() + '-' + m[2].toLowerCase()) || null;
  const q = norm(v);
  if (!q) return null;
  const hits = [];
  ENTRIES.forEach((e, n) => { const s = score(e, q, callerKey(e, locale)); if (s >= 2) hits.push({ e, s, n }); });
  if (!hits.length) return null;
  const top = Math.max(...hits.map(h => h.s)), best = hits.filter(h => h.s === top);
  if (best.length === 1) return best[0].e;
  const langs = new Set(best.map(h => h.e.lang)), ccs = new Set(best.map(h => h.e.cc));
  if (langs.size === 1) return best.slice().sort((a, b) => topRank(a.e) - topRank(b.e) || b.e.primary - a.e.primary || a.n - b.n)[0].e;
  if (ccs.size === 1) return (best.find(h => h.e.primary) || best[0]).e;      // одна страна, несколько языков: основной
  return null;
}

module.exports = { ENTRIES, SKIPPED, TOP, search, find, label, describe, regionName, langEnglish, nativeOf, norm };
