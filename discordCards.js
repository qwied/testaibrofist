// ============ КАРТИНКИ ДЛЯ БОТА: /servers и /account ============
// Бот присылает не текст, а готовую «страницу» картинкой — как снимок
// экрана, только рисуем её сами, без браузера: разметку собирает satori
// (флексбокс, тот же вид, что у страниц сайта), в PNG её переводит resvg.
// Обе библиотеки — чистый JS и WebAssembly, ничего ставить на хостинг не
// нужно. Шрифт — Inter (fonts/, лицензия OFL), латиница и кириллица.
//
// Рисование занимает ~0.1 с процессора. Чтобы игра в эти моменты не
// подтормаживала, картинки рисует отдельный поток (worker_threads); он
// поднимается при первой команде и сам гаснет, когда команд долго нет.
//
// Темы — тёмная и светлая, цвета те же, что у сайта (ui.css, theme.js).
// Данные собирает основной поток (serversData, profileData) и передаёт
// в поток рисования простым объектом: сам поток к базе не ходит.
'use strict';
const fs = require('fs');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const FONT_DIR = path.join(__dirname, 'fonts');
const W = 1200;
const PROFILE_H = 700;
const MAPS_PER_PAGE = 6;
const FRIENDS_PER_PAGE = 12;
const SITE = 'aibrofist.online';

/* ---------- темы ---------- */
const THEMES = {
  dark: {
    bg: '#16181d', bg2: '#1b1e25', panel: '#1f232b', raised: '#262b35', line: '#333a46',
    ink: '#e7eaf0', muted: '#a3acba', accent: '#eef1f5', onAccent: '#16181d',
    ok: '#3ccf7a', warn: '#eaa94a', bad: '#f26b6b', gold: '#e2b54a'
  },
  light: {
    bg: '#eef0f4', bg2: '#f7f8fa', panel: '#ffffff', raised: '#f6f8fa', line: '#e2e5ea',
    ink: '#111827', muted: '#6b7280', accent: '#111827', onAccent: '#ffffff',
    ok: '#16a34a', warn: '#c26a04', bad: '#dc2626', gold: '#a87a06'
  }
};
const themeOf = t => THEMES[t] ? t : 'dark';

/* ---------- текст ----------
   В шрифте есть латиница (с расширенной), кириллица и знаки препинания.
   Всё остальное (эмодзи, иероглифы) satori нарисовал бы квадратиками —
   такие символы просто убираем. */
const DRAWABLE = /[^ -~ -ɏЀ-џҐґҰұ‐-‧‰-⁞№™−]/g;
function clean(s, max) {
  const t = String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(DRAWABLE, '').replace(/\s{2,}/g, ' ').trim();
  return max && t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}
const num = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const two = n => (n < 10 ? '0' : '') + n;
const clock = ms => { const d = new Date(ms); return two(d.getUTCHours()) + ':' + two(d.getUTCMinutes()) + ':' + two(d.getUTCSeconds()) + ' UTC'; };
const mmss = s => Math.floor(s / 60) + ':' + two(s % 60);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function day(ms) {
  const d = new Date(Number(ms));
  return isNaN(d.getTime()) ? '' : MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
}
function ago(ms, now) {
  if (!ms) return 'long ago';
  const m = Math.floor(Math.max(0, now - ms) / 60000);
  if (m < 2) return 'online now';
  if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' h ago';
  const d = Math.floor(h / 24);
  if (d < 60) return d === 1 ? '1 day ago' : d + ' days ago';
  return Math.floor(d / 30) + ' months ago';
}

/* ---------- разметка ----------
   el('div', стиль, ...дети) — то же, что <div style>…</div>. У satori у
   блока с несколькими детьми должен быть display:flex — ставим всегда. */
function el(type, style, ...kids) {
  const children = kids.flat().filter(k => k !== null && k !== undefined && k !== false && k !== '');
  return { type, props: { style: Object.assign({ display: 'flex' }, style || {}),
                          children: children.length === 0 ? undefined : children.length === 1 ? children[0] : children } };
}
const txt = (style, s) => el('div', style, String(s));
const svg = (w, h, view, ...shapes) => ({ type: 'svg', props: { width: w, height: h, viewBox: view, children: shapes } });
const shape = (type, attrs) => ({ type, props: attrs });

// фигурка игрока — та же, что на сайте без скина: круг-голова и тело-капсула
function figure(c, size) {
  return svg(size * 0.42, size, '0 0 100 236',
    shape('circle', { cx: 50, cy: 50, r: 50, fill: c }),
    shape('rect', { x: 0, y: 116, width: 100, height: 120, rx: 22, fill: c }));
}
// значок сайта (как на странице статистики)
// значок сайта: круг-голова и высокое прямое тело, как у игрока (пропорции 1 : 1,2 у тела, небольшие скругления)
function logo(c, size) {
  return svg(size * 0.43, size, '0 0 46 108',
    shape('circle', { cx: 23, cy: 21, r: 21, fill: c }),
    shape('rect', { x: 2, y: 48, width: 42, height: 60, rx: 7, fill: c }));
}
function dot(c, size) {
  return svg(size, size, '0 0 10 10', shape('circle', { cx: 5, cy: 5, r: 5, fill: c }));
}

function page(t, height, ...kids) {
  return el('div', { width: W, height, flexDirection: 'column', padding: '36px 40px', fontFamily: FONT_FAMILY,
                     color: t.ink, backgroundColor: t.bg, backgroundImage: 'linear-gradient(160deg, ' + t.bg2 + ' 0%, ' + t.bg + ' 100%)' },
            ...kids);
}
function header(t, title, right) {
  return el('div', { alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, flexShrink: 0 },
    el('div', { alignItems: 'center' }, logo(t.ink, 34), txt({ fontSize: 30, fontWeight: 800, marginLeft: 12, letterSpacing: -0.3 }, title)),
    right);
}
function liveTag(t, at) {
  return el('div', { alignItems: 'center', color: t.muted, fontSize: 18 },
    dot(t.ok, 12), txt({ marginLeft: 9, color: t.ok, fontWeight: 600 }, 'Live'), txt({ marginLeft: 10 }, '· ' + clock(at)));
}
function card(t, style, ...kids) {
  return el('div', Object.assign({ backgroundColor: t.panel, border: '1px solid ' + t.line, borderRadius: 16 }, style), ...kids);
}
function kpi(t, label, value, sub, width) {
  return card(t, { flexDirection: 'column', padding: '16px 20px', width },
    txt({ fontSize: 14, fontWeight: 600, color: t.muted, letterSpacing: 1.2, textTransform: 'uppercase' }, label),
    txt({ fontSize: 46, fontWeight: 800, letterSpacing: -1, marginTop: 4 }, value),
    sub ? txt({ fontSize: 16, color: t.muted, marginTop: 2 }, sub) : null);
}
function pill(t, text, color) {
  return txt({ fontSize: 14, fontWeight: 800, padding: '3px 10px', borderRadius: 999, border: '1px solid ' + color,
               color, marginLeft: 10, letterSpacing: 0.3 }, text);
}
function footer(t, left, right) {
  return el('div', { marginTop: 'auto', paddingTop: 18, justifyContent: 'space-between', alignItems: 'center', color: t.muted, fontSize: 17, flexShrink: 0 },
    txt({ fontWeight: 600 }, left), txt({}, right));
}

/* ---------- /servers ---------- */
const STATUS = { open: 'OPEN', freeing: 'FREEING UP', full: 'FULL' };
const PHASE = { lobby: 'Hiding', round: 'Hunt', storyEnd: 'Story ended' };
const ROOMS_SHOWN = 6;
const ROOM_H = 108;                       // высота карточки комнаты вместе с отступом

function roomCard(t, r) {
  const share = Math.max(0, Math.min(1, r.limit ? r.players / r.limit : 0));
  const status = r.status === 'full' ? t.bad : r.status === 'freeing' ? t.warn : t.ok;
  const meta = [];
  if (r.phase) meta.push((PHASE[r.phase] || clean(r.phase, 20)) + (r.secondsLeft !== null && r.secondsLeft !== undefined ? ' · ' + mmss(r.secondsLeft) + ' left' : ''));
  if (r.map) meta.push('Map: ' + clean(r.map, 40));
  return el('div', { flexDirection: 'column', backgroundColor: t.raised, border: '1px solid ' + t.line, borderRadius: 12,
                     padding: '12px 16px', marginTop: 10, height: ROOM_H - 10, flexShrink: 0 },
    el('div', { alignItems: 'center' },
      txt({ fontSize: 22, fontWeight: 800 }, clean(r.room, 24) || 'room'),
      pill(t, STATUS[r.status] || 'OPEN', status),
      txt({ marginLeft: 'auto', fontSize: 22, fontWeight: 800 }, r.players + ' / ' + r.limit)),
    el('div', { height: 8, borderRadius: 999, backgroundColor: t.line, marginTop: 10, marginBottom: 9 },
      el('div', { width: Math.round(share * 100) + '%', height: 8, borderRadius: 999, backgroundColor: t.accent })),
    txt({ fontSize: 16, color: t.muted }, meta.length ? meta.join('   ·   ') : 'Waiting for players'));
}
function modeColumn(t, title, info, rooms) {
  const shown = rooms.slice(0, ROOMS_SHOWN);
  return card(t, { flexDirection: 'column', width: 552, padding: '18px 20px 20px' },
    el('div', { alignItems: 'center', justifyContent: 'space-between' },
      txt({ fontSize: 17, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: t.muted }, title),
      txt({ fontSize: 17, fontWeight: 600, color: t.muted },
          info.players + (info.players === 1 ? ' player' : ' players') + ' · ' + rooms.length + (rooms.length === 1 ? ' room' : ' rooms'))),
    shown.length ? shown.map(r => roomCard(t, r))
      : el('div', { marginTop: 10, height: ROOM_H - 10, border: '2px dashed ' + t.line, borderRadius: 12, alignItems: 'center',
                    justifyContent: 'center', color: t.muted, fontSize: 18 }, 'No rooms right now'),
    rooms.length > shown.length ? txt({ marginTop: 10, fontSize: 16, color: t.muted }, '+ ' + (rooms.length - shown.length) + ' more rooms') : null);
}
function serversTree(d, theme) {
  const t = THEMES[themeOf(theme)];
  const list = d.list || [];
  const race = list.filter(r => r.mode === 'race'), hide = list.filter(r => r.mode === 'hideAndSeek');
  const modes = d.modes || {};
  const ri = modes.race || { players: 0 }, hi = modes.hideAndSeek || { players: 0 };
  const most = Math.max(1, Math.min(ROOMS_SHOWN, Math.max(race.length, hide.length)));
  const extra = Math.max(race.length, hide.length) > ROOMS_SHOWN ? 30 : 0;
  // отступ, шапка, плитки, колонки комнат, подвал — высота по числу комнат
  const height = 36 + 56 + 132 + 22 + (62 + most * ROOM_H + extra) + 28 + 40 + 36;
  const kw = (W - 80 - 3 * 14) / 4;
  return { height, tree: page(t, height,
    header(t, 'AIBROFIST servers', liveTag(t, d.at || Date.now())),
    el('div', { justifyContent: 'space-between', flexShrink: 0 },
      kpi(t, 'Online now', num(d.online), (d.online === 1 ? 'player' : 'players') + ' in the game', kw),
      kpi(t, 'Rooms', num(d.rooms), 'up to 40 players each', kw),
      kpi(t, 'Race', num(ri.players), race.length + (race.length === 1 ? ' room' : ' rooms'), kw),
      kpi(t, 'Hide and Seek', num(hi.players), hide.length + (hide.length === 1 ? ' room' : ' rooms'), kw)),
    el('div', { justifyContent: 'space-between', marginTop: 22, alignItems: 'flex-start', flexShrink: 0 },
      modeColumn(t, 'Race', ri, race), modeColumn(t, 'Hide and Seek', hi, hide)),
    footer(t, SITE, d.online ? 'Press Play to join them' : 'Nobody is playing right now. Be the first!')) };
}

/* ---------- /account ---------- */
function rankBadge(t, mode, r) {
  const rank = r && r.rank ? clean(r.rank, 14) : '';
  const strong = rank === 'S' || rank === 'A+' || rank === 'A';
  return el('div', { alignItems: 'center', padding: '6px 14px', borderRadius: 999, marginRight: 10,
                     border: '1px solid ' + (rank && rank !== 'Declassified' ? t.accent : t.line),
                     backgroundColor: strong ? t.accent : 'transparent', color: strong ? t.onAccent : rank ? t.ink : t.muted },
    txt({ fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.85 }, mode),
    txt({ fontSize: 18, fontWeight: 800, marginLeft: 8 }, rank ? rank + (r.manual ? ' *' : '') : 'no rank'));
}
function statTile(t, label, value, sub, color, width) {
  return card(t, { flexDirection: 'column', padding: '16px 20px', width },
    txt({ fontSize: 14, fontWeight: 600, color: t.muted, letterSpacing: 1.2, textTransform: 'uppercase' }, label),
    txt({ fontSize: 40, fontWeight: 800, letterSpacing: -1, marginTop: 4, color: color || t.ink }, value),
    txt({ fontSize: 15, color: t.muted, marginTop: 2 }, sub));
}
const plus = n => (n > 0 ? '+' : '') + num(n);
function pageTag(t, p) {
  return txt({ fontSize: 18, fontWeight: 600, color: t.muted }, 'Page ' + p.n + ' / ' + p.of);
}
function avatar(t, size) {
  return el('div', { width: size, height: size, borderRadius: size, backgroundColor: t.raised, border: '1px solid ' + t.line,
                     alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' },
    figure(t.ink, Math.round(size * 0.72)));
}

function profileMain(t, d, p) {
  const tw = (W - 80 - 3 * 14) / 4;
  const about = clean(d.about, 300);
  return page(t, PROFILE_H,
    header(t, 'Player profile', pageTag(t, p)),
    el('div', { alignItems: 'center', flexShrink: 0 },
      avatar(t, 168),
      el('div', { flexDirection: 'column', marginLeft: 28, flexGrow: 1 },
        txt({ fontSize: 54, fontWeight: 800, letterSpacing: -1 }, clean(d.name, 24)),
        txt({ fontSize: 20, color: t.muted, marginTop: 2 }, 'Joined ' + (day(d.joined) || 'long ago')),
        el('div', { marginTop: 14 }, rankBadge(t, 'Race', d.rank && d.rank.race), rankBadge(t, 'Hide and Seek', d.rank && d.rank.hs)))),
    el('div', { justifyContent: 'space-between', marginTop: 26, flexShrink: 0 },
      statTile(t, 'Coins', num(d.coins), plus(d.coinsDay) + ' today · ' + plus(d.coinsWeek) + ' this week', t.gold, tw),
      statTile(t, 'Race scores', num(d.score), plus(d.scoreDay) + ' today · ' + plus(d.scoreWeek) + ' this week', null, tw),
      statTile(t, 'Hide and Seek', num(d.hsScore), plus(d.hsScoreDay) + ' today · ' + plus(d.hsScoreWeek) + ' this week', null, tw),
      statTile(t, 'Community', num(d.mapsCount) + (d.mapsCount === 1 ? ' map' : ' maps'),
               num(d.friendsCount) + (d.friendsCount === 1 ? ' friend' : ' friends'), null, tw)),
    el('div', { flexDirection: 'column', marginTop: 18, padding: '14px 18px', border: '2px dashed ' + t.line, borderRadius: 14, flexShrink: 0 },
      txt({ fontSize: 14, fontWeight: 600, color: t.muted, letterSpacing: 1.2, textTransform: 'uppercase' }, 'About'),
      txt({ fontSize: 19, marginTop: 6, lineHeight: 1.45, color: about ? t.ink : t.muted, maxHeight: 84, overflow: 'hidden' },
          about || 'Nothing written yet')),
    footer(t, SITE + '/users?name=' + clean(d.name, 24), 'Updated ' + clock(d.at || Date.now())));
}

function profileMaps(t, d, p, slice, from) {
  const rows = slice.map((m, i) => el('div', { alignItems: 'center', backgroundColor: t.panel, border: '1px solid ' + t.line,
                                                borderRadius: 12, padding: '12px 18px', marginTop: i ? 10 : 0, height: 70, flexShrink: 0 },
    txt({ fontSize: 18, fontWeight: 800, color: t.muted, width: 46 }, String(from + i + 1)),
    el('div', { flexDirection: 'column', flexGrow: 1, flexShrink: 1, minWidth: 0 },
      el('div', { alignItems: 'center' },
        txt({ fontSize: 22, fontWeight: 800 }, clean(m.mapName, 34) || 'Untitled'),
        pill(t, m.mapType === 'hideAndSeek' ? 'HIDE AND SEEK' : 'RACE', t.muted),
        m.inGame ? pill(t, 'IN GAME', t.ok) : null),
      txt({ fontSize: 15, color: t.muted, marginTop: 3 }, m.date ? 'Published ' + day(m.date) : 'Published long ago')),
    el('div', { flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, marginLeft: 16 },
      txt({ fontSize: 26, fontWeight: 800, color: m.rating > 0 ? t.ok : m.rating < 0 ? t.bad : t.ink }, plus(m.rating)),
      txt({ fontSize: 14, color: t.muted }, num(m.likes) + ' likes · ' + num(m.dislikes) + ' dislikes'))));
  return page(t, PROFILE_H,
    header(t, clean(d.name, 24) + ' · Maps', pageTag(t, p)),
    rows.length ? el('div', { flexDirection: 'column', flexShrink: 0 }, rows)
      : el('div', { height: 300, border: '2px dashed ' + t.line, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                    color: t.muted, fontSize: 22 }, 'No maps published yet'),
    footer(t, num(d.mapsCount) + (d.mapsCount === 1 ? ' map' : ' maps') + ' · rating = likes minus dislikes',
              'Updated ' + clock(d.at || Date.now())));
}

function profileFriends(t, d, p, slice) {
  const col = (W - 80 - 14) / 2;
  const cell = f => el('div', { alignItems: 'center', backgroundColor: t.panel, border: '1px solid ' + t.line, borderRadius: 12,
                               padding: '10px 14px', width: col, height: 74, marginBottom: 12 },
    avatar(t, 50),
    el('div', { flexDirection: 'column', marginLeft: 14 },
      txt({ fontSize: 21, fontWeight: 800 }, clean(f.name, 24)),
      txt({ fontSize: 15, color: f.lastSeen && d.at - f.lastSeen < 120000 ? t.ok : t.muted, marginTop: 2 }, ago(f.lastSeen, d.at))));
  return page(t, PROFILE_H,
    header(t, clean(d.name, 24) + ' · Friends', pageTag(t, p)),
    slice.length ? el('div', { flexWrap: 'wrap', justifyContent: 'space-between', flexShrink: 0 }, slice.map(cell))
      : el('div', { height: 300, border: '2px dashed ' + t.line, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                    color: t.muted, fontSize: 22 }, 'No friends yet'),
    footer(t, num(d.friendsCount) + (d.friendsCount === 1 ? ' friend' : ' friends'), 'Updated ' + clock(d.at || Date.now())));
}

// страницы профиля: сначала главная, потом карты и друзья кусками
function profilePages(d) {
  const maps = d.maps || [], friends = d.friends || [];
  const mapPages = Math.max(1, Math.ceil(maps.length / MAPS_PER_PAGE));
  const friendPages = Math.max(1, Math.ceil(friends.length / FRIENDS_PER_PAGE));
  const list = [{ kind: 'main', title: 'Profile' }];
  for (let i = 0; i < mapPages; i++) list.push({ kind: 'maps', title: 'Maps', i });
  for (let i = 0; i < friendPages; i++) list.push({ kind: 'friends', title: 'Friends', i });
  return list;
}
const pageCount = d => profilePages(d).length;
function profileTree(d, theme, n) {
  const t = THEMES[themeOf(theme)];
  const pages = profilePages(d);
  const i = Math.max(0, Math.min(pages.length - 1, Number(n) || 0));
  const p = Object.assign({ n: i + 1, of: pages.length }, pages[i]);
  if (p.kind === 'maps') return { height: PROFILE_H, tree: profileMaps(t, d, p, (d.maps || []).slice(p.i * MAPS_PER_PAGE, (p.i + 1) * MAPS_PER_PAGE), p.i * MAPS_PER_PAGE) };
  if (p.kind === 'friends') return { height: PROFILE_H, tree: profileFriends(t, d, p, (d.friends || []).slice(p.i * FRIENDS_PER_PAGE, (p.i + 1) * FRIENDS_PER_PAGE)) };
  return { height: PROFILE_H, tree: profileMain(t, d, p) };
}

/* ---------- рисование ---------- */
const SUBSETS = ['latin', 'latin-ext', 'cyrillic'];
const FONT_FAMILY = SUBSETS.map(s => '"Inter ' + s + '"').join(', ');
let engine = null;
function loadEngine() {
  if (!engine) {
    engine = (async () => {
      const satori = require('satori').default;
      const { Resvg, initWasm } = require('@resvg/resvg-wasm');
      await initWasm(fs.readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')));
      const fonts = [];
      for (const w of [400, 600, 800]) for (const s of SUBSETS)
        fonts.push({ name: 'Inter ' + s, weight: w, style: 'normal', data: fs.readFileSync(path.join(FONT_DIR, 'inter-' + s + '-' + w + '-normal.woff')) });
      return { satori, Resvg, fonts };
    })();
    engine.catch(() => { engine = null; });          // не вышло — попробуем снова в следующий раз
  }
  return engine;
}
const UI = { el, txt, svg, shape, figure, logo, dot, clean, num, THEMES, FONT_FAMILY };
async function drawNow(kind, data, theme, n) {
  const { satori, Resvg, fonts } = await loadEngine();
  // карточки бота (правила, наказания, справка...) — discordPics.js, высота по содержимому
  if (kind !== 'account' && kind !== 'servers') {
    const pics = require('./discordPics.js');
    const svgText = await satori(pics.tree(kind, data, UI, theme), { width: pics.W, fonts });
    return Buffer.from(new Resvg(svgText, { fitTo: { mode: 'width', value: pics.W * pics.SCALE } }).render().asPng());
  }
  const { tree, height } = kind === 'account' ? profileTree(data, theme, n) : serversTree(data, theme);
  const svgText = await satori(tree, { width: W, height, fonts });
  const png = new Resvg(svgText, { fitTo: { mode: 'width', value: W } }).render().asPng();
  return Buffer.from(png);
}

/* ---------- поток рисования ---------- */
if (!isMainThread && workerData && workerData.discordCards) {
  parentPort.on('message', job => {
    drawNow(job.kind, job.data, job.theme, job.page)
      .then(png => parentPort.postMessage({ id: job.id, png }))
      .catch(e => parentPort.postMessage({ id: job.id, error: String(e && e.message || e) }));
  });
}

const IDLE_MS = 10 * 60 * 1000;      // без команд 10 минут — поток гасим, его ~80 МБ памяти возвращаются
const JOB_MS = 15000;
let worker = null, seq = 0, idle = null;
const jobs = new Map();
function failAll(e) {
  for (const [id, j] of jobs) { clearTimeout(j.timer); j.reject(e); jobs.delete(id); }
}
function getWorker() {
  if (worker) return worker;
  const w = new Worker(__filename, { workerData: { discordCards: true }, resourceLimits: { maxOldGenerationSizeMb: 192 } });
  w.on('message', m => {
    const j = jobs.get(m.id);
    if (!j) return;
    jobs.delete(m.id);
    clearTimeout(j.timer);
    if (m.error) j.reject(new Error(m.error)); else j.resolve(Buffer.from(m.png));
  });
  w.on('error', e => { if (worker === w) worker = null; failAll(e); });
  w.on('exit', () => { if (worker === w) worker = null; failAll(new Error('image renderer stopped')); });
  w.unref();
  worker = w;
  return w;
}
function keepAlive() {
  clearTimeout(idle);
  idle = setTimeout(() => { if (worker && !jobs.size) worker.terminate().catch(() => {}); }, IDLE_MS);
  if (idle.unref) idle.unref();
}
/* Картинка: kind 'servers' или 'account', data — от serversData()/
   profileData(), theme 'dark' | 'light', page — номер страницы профиля.
   Отдельный поток не поднялся (или DISCORD_CARDS_INLINE=1) — рисуем здесь же. */
function draw(kind, data, theme, page) {
  if (process.env.DISCORD_CARDS_INLINE === '1') return drawNow(kind, data, theme, page);
  return new Promise((resolve, reject) => {
    const id = ++seq;
    let w;
    try { w = getWorker(); } catch (e) { return drawNow(kind, data, theme, page).then(resolve, reject); }
    const timer = setTimeout(() => { jobs.delete(id); reject(new Error('image took too long')); }, JOB_MS);
    jobs.set(id, { resolve, reject, timer });
    w.postMessage({ id, kind, data, theme: themeOf(theme), page: Number(page) || 0 });
    keepAlive();
  });
}
// заранее поднять поток и шрифты — первая команда ответит так же быстро
function warm() {
  if (process.env.DISCORD_CARDS_INLINE === '1') return loadEngine().then(() => true, () => false);
  return draw('servers', { at: Date.now(), online: 0, rooms: 0, modes: {}, list: [] }, 'dark').then(() => true, () => false);
}
function stop() {
  clearTimeout(idle);
  if (worker) { const w = worker; worker = null; w.terminate().catch(() => {}); }
}

/* ---------- данные (только основной поток) ----------
   Источник можно подменить (setSource) — так тесты бота обходятся без
   настоящей базы игроков. */
function serversData() {
  const a = require('./serversInfo.js').summary();
  const s = a.aibrofist;
  return { at: a.at, online: s.online, rooms: s.rooms, modes: s.modes,
           list: s.list.map(r => ({ mode: r.mode, room: r.room, players: r.players, limit: r.limit, status: r.status,
                                    phase: r.phase, secondsLeft: r.secondsLeft, map: r.map })) };
}

const DAY = 24 * 60 * 60 * 1000;
function sumFor(log, k, key, since) {
  let s = 0;
  for (const e of log || []) if (e.at >= since && key(e.name) === k) s += Number(e.amount) || 0;
  return s;
}
/* Всё, что видно на странице игрока (users.html): ник, дата регистрации,
   монеты и очки за день/неделю/всё время, ранги, «о себе», карты и
   друзья. Ничего сверх страницы — ни почты, ни входов, ни настроек. */
function realProfile(name) {
  const acc = require('./accounts.js');
  const db = acc.getDb();
  const k = acc.key(name);
  const u = k && db.users[k];
  if (!u) return null;
  const now = Date.now();
  let rank = null;
  try { const r = require('./ranks.js').forName(db, u.name); rank = { race: r.race, hs: r.hs }; } catch (e) { rank = null; }
  let maps = [];
  try {
    const M = require('./maps.js');
    maps = M.allMaps().filter(m => acc.key(m.author) === k).map(m => {
      const tl = M.tally(m);
      return { mapName: m.mapName, mapType: m.mapType, rating: tl.rating, likes: tl.likes, dislikes: tl.dislikes,
               date: m.date || 0, inGame: !!m.inGame };
    }).sort((a, b) => (b.date || 0) - (a.date || 0));
  } catch (e) { maps = []; }
  const friends = (u.friends || []).map(n => db.users[acc.key(n)]).filter(Boolean)
    .map(f => ({ name: f.name, lastSeen: f.lastSeen || 0 }))
    .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  const coinLog = acc.getCoinLog ? acc.getCoinLog() : [], scoreLog = acc.getScoreLog ? acc.getScoreLog() : [], hsLog = acc.getHsLog ? acc.getHsLog() : [];
  return {
    at: now, name: u.name, joined: u.joined || 0, about: String(u.about || ''),
    coins: u.coins || 0, coinsDay: sumFor(coinLog, k, acc.key, now - DAY), coinsWeek: sumFor(coinLog, k, acc.key, now - 7 * DAY),
    score: u.score || 0, scoreDay: sumFor(scoreLog, k, acc.key, now - DAY), scoreWeek: sumFor(scoreLog, k, acc.key, now - 7 * DAY),
    hsScore: u.hsScore || 0, hsScoreDay: sumFor(hsLog, k, acc.key, now - DAY), hsScoreWeek: sumFor(hsLog, k, acc.key, now - 7 * DAY),
    rank, maps, mapsCount: maps.length, friends, friendsCount: friends.length
  };
}
// ники для подсказок в /account: сначала начинающиеся с введённого, потом содержащие
function realSearch(q, limit) {
  const acc = require('./accounts.js');
  const s = String(q || '').trim().toLowerCase();
  const names = Object.values(acc.getDb().users).map(u => u.name).filter(Boolean);
  const starts = [], has = [];
  for (const n of names) {
    const l = n.toLowerCase();
    if (!s || l.indexOf(s) === 0) starts.push(n); else if (l.indexOf(s) !== -1) has.push(n);
  }
  starts.sort((a, b) => a.length - b.length || a.localeCompare(b));
  has.sort((a, b) => a.length - b.length || a.localeCompare(b));
  return starts.concat(has).slice(0, limit || 25);
}
let source = { profile: realProfile, search: realSearch };
function setSource(s) { source = Object.assign({ profile: realProfile, search: realSearch }, s || {}); }
const profileData = name => source.profile(name);
const searchNames = (q, limit) => source.search(q, limit);

module.exports = { draw, warm, stop, serversData, profileData, searchNames, setSource, pageCount, clean, THEMES, W, PROFILE_H,
                   _test: { serversTree, profileTree, drawNow, profilePages, realProfile, realSearch } };
