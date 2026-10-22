// ============ НАСТОЯЩИЕ СНИМКИ СТРАНИЦ ДЛЯ БОТА ============
// /servers и /account присылают настоящий снимок экрана сайта — то же, что
// видит игрок в браузере: страницы режимов со списком комнат и страницу
// игрока (вкладки Friends и Maps). Снимает их браузер без окна (Chromium из
// @sparticuz/chromium — в пакете сам браузер, нужные ему библиотеки и
// шрифты, ставить на хостинг ничего не надо), страницы он открывает у себя
// же, на 127.0.0.1 — мимо Cloudflare, быстро.
//
// Браузер берёт ~250 МБ памяти, поэтому:
//   - запускается, только если свободной памяти хватает (NEED_MB), иначе бот
//     отвечает прежней нарисованной картинкой (discordCards.js);
//   - после SHOT_IDLE_MS без снимков закрывается.
// Снимки — как у гостя: без входа в аккаунт, без личных данных; страницы
// грузят только сам сайт, любые запросы наружу отклоняются.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const VIEW = { width: 1280, height: 860 };
const MAX_H = 1700;                                   // длинные списки — не выше этого
const NEED_MB = Number(process.env.DISCORD_SHOTS_NEED_MB) || 350;
// распакованный браузер ~190 МБ во временной папке; диск не забиваем — на нём же сохранения игры
const NEED_DISK_MB = Number(process.env.DISCORD_SHOTS_NEED_DISK_MB) || 700;
const SHOT_IDLE_MS = 3 * 60 * 1000;
const PAGE_MS = 9000;                                 // страница грузится дольше — снимаем как есть
const MAX_PAGES = 2;                                  // одновременно открытых страниц

let base = 'http://127.0.0.1:' + (process.env.PORT || 3000);
let browser = null, launching = null, prepared = null, idle = null, busy = 0;
const waiting = [];
let status = { state: 'not started', reason: null, at: 0, ms: null };
const off = () => /^(0|off|no|false)$/i.test(String(process.env.DISCORD_SHOTS || ''));

// согласие с правилами сайта браузер «уже дал» — иначе окно соглашения на снимке
const CONSENT = (() => {
  try { return (/var VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(__dirname, 'consent.js'), 'utf8')) || [])[1] || '1'; }
  catch (e) { return '1'; }
})();

/* ---------- память ----------
   Сколько ещё можно занять: предел контейнера (cgroup v2/v1) минус занятое
   без кэша файлов, и не больше свободного у самой машины (MemAvailable). */
function freeMb() {
  const read = f => { try { return fs.readFileSync(f, 'utf8').trim(); } catch (e) { return null; } };
  const stat = (text, key) => { const m = new RegExp('^' + key + ' (\\d+)$', 'm').exec(text || ''); return m ? Number(m[1]) : 0; };
  let room = Infinity;
  const v2max = read('/sys/fs/cgroup/memory.max');
  if (v2max && v2max !== 'max') {
    const used = Number(read('/sys/fs/cgroup/memory.current')) - stat(read('/sys/fs/cgroup/memory.stat'), 'inactive_file');
    room = Number(v2max) - used;
  } else {
    const v1max = Number(read('/sys/fs/cgroup/memory/memory.limit_in_bytes'));
    if (v1max && v1max < 1e15) {
      const used = Number(read('/sys/fs/cgroup/memory/memory.usage_in_bytes')) - stat(read('/sys/fs/cgroup/memory/memory.stat'), 'total_inactive_file');
      room = v1max - used;
    }
  }
  const avail = /MemAvailable:\s+(\d+) kB/.exec(read('/proc/meminfo') || '');
  const host = avail ? Number(avail[1]) * 1024 : os.freemem();
  return Math.round(Math.min(room, host) / 1048576);
}

function freeDiskMb(dir) {
  try { const st = fs.statfsSync(dir); return Math.round(st.bavail * st.bsize / 1048576); } catch (e) { return -1; }
}

/* ---------- браузер ---------- */
function libDir() {
  return path.join(path.dirname(require.resolve('@sparticuz/chromium')), '..', '..', 'bin');
}
// распаковать браузер, его библиотеки и шрифты (один раз, в папку временных файлов)
function prepare() {
  if (!prepared) {
    prepared = (async () => {
      if (!fs.existsSync(path.join(os.tmpdir(), 'chromium'))) {
        const disk = freeDiskMb(os.tmpdir());
        if (disk < NEED_DISK_MB) throw new Error('not enough free disk space for the browser (' + disk + ' MB, need ' + NEED_DISK_MB + ')');
      }
      const chromium = require('@sparticuz/chromium');
      const { inflate } = require(path.join(path.dirname(require.resolve('@sparticuz/chromium')), 'lambdafs.cjs'));
      const exe = await chromium.executablePath();
      const libs = await inflate(path.join(libDir(), 'al2023.tar.br'));
      return { exe, args: chromium.args.concat(['--hide-scrollbars', '--mute-audio']), libs: path.join(libs, 'lib'),
               fonts: path.join(os.tmpdir(), 'fonts') };
    })();
    prepared.catch(() => { prepared = null; });
  }
  return prepared;
}
async function launch() {
  const room = freeMb();
  if (room < NEED_MB) throw new Error('not enough free memory for the browser (' + room + ' MB, need ' + NEED_MB + ')');
  const p = await prepare();
  const puppeteer = require('puppeteer-core');
  const opts = env => ({ executablePath: p.exe, headless: 'shell', args: p.args, defaultViewport: VIEW, timeout: 20000,
                         env: Object.assign({}, process.env, { FONTCONFIG_PATH: p.fonts }, env) });
  let b;
  // сначала с библиотеками из пакета (на хостинге своих может не быть), не вышло — с системными
  try { b = await puppeteer.launch(opts({ LD_LIBRARY_PATH: p.libs })); }
  catch (e) { b = await puppeteer.launch(opts({})); }
  b.on('disconnected', () => { if (browser === b) browser = null; });
  return b;
}
function getBrowser() {
  if (browser) return Promise.resolve(browser);
  if (!launching) {
    launching = launch()
      .then(b => { browser = b; status = Object.assign(status, { state: 'ready', reason: null, at: Date.now() }); return b; })
      .catch(e => { status = Object.assign(status, { state: 'off', reason: String(e.message || e).slice(0, 200), at: Date.now() }); throw e; })
      .finally(() => { launching = null; });
  }
  return launching;
}
function closeSoon() {
  clearTimeout(idle);
  idle = setTimeout(() => { if (!busy) close(); }, SHOT_IDLE_MS);
  if (idle.unref) idle.unref();
}
function close() {
  clearTimeout(idle);
  const b = browser;
  browser = null;
  if (b) b.close().catch(() => {});
}

// не больше MAX_PAGES страниц сразу — остальные ждут очереди
function slot() {
  if (busy < MAX_PAGES) { busy++; return Promise.resolve(); }
  return new Promise(ok => waiting.push(ok));
}
function release() {
  const next = waiting.shift();
  if (next) next(); else busy--;
}

const CROP_PAD = 16;                                  // поле вокруг вырезанного блока
const boxOf = async (page, sel) => { const el = await page.$(sel); return el ? el.boundingBox() : null; };

/* Снимок страницы сайта. where — путь ('/servers', '/users?name=…'),
   theme — 'dark' | 'light'. opts (необязательно):
     tab   — селектор вкладки, на которую нажать перед снимком (или список —
             нажимаются по очереди: период Today/This Week, потом Maps);
     crop  — селектор блока: снимок только его (с небольшим полем вокруг),
             без бокового меню и шапки сайта;
     ready — селектор, который появляется, когда страница загрузила данные;
     lang  — 'en' | 'ru': язык сайта (i18n.js), по умолчанию английский;
     width — ширина окна браузера (по умолчанию 1280): уже окно — страница
             перестраивается компактнее, и текст на снимке крупнее;
     scale — плотность пикселей (по умолчанию 1; 2 — вдвое чётче, размер картинки вдвое больше). */
async function shoot(where, theme, opts) {
  opts = typeof opts === 'string' ? { tab: opts } : (opts || {});
  if (off()) throw new Error('screenshots are off (DISCORD_SHOTS=off)');
  await slot();
  const t0 = Date.now();
  let page = null;
  try {
    const b = await getBrowser();
    page = await b.newPage();
    const vw = Math.max(320, Math.min(VIEW.width, Math.round(opts.width) || VIEW.width)), dpr = opts.scale === 2 ? 2 : 1;
    if (vw !== VIEW.width || dpr !== 1) await page.setViewport({ width: vw, height: VIEW.height, deviceScaleFactor: dpr });
    await page.setCacheEnabled(false);                // каждый снимок — свежие данные, без кэша браузера
    const mode = theme === 'light' ? 'light' : 'dark';
    const lang = opts.lang === 'ru' ? 'ru' : 'en';
    await page.setRequestInterception(true);
    page.on('request', r => {
      const u = r.url();
      if (u.indexOf(base + '/') !== 0 && u.indexOf('data:') !== 0) return r.abort().catch(() => {});   // только сам сайт
      // тему гостю сайт не даёт выбрать — для снимка говорим, что выбрана нужная
      if (/\/theme\/get(\?|$)/.test(u)) return r.respond({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ unlocked: true, mode, guest: true, price: 0, coins: 0 }) }).catch(() => {});
      // и язык: гостю сайт отвечает английским — для снимка говорим, что выбран нужный
      if (/\/i18n\/get(\?|$)/.test(u)) return r.respond({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ lang, guest: true, langs: ['en', 'ru'] }) }).catch(() => {});
      r.continue().catch(() => {});
    });
    await page.evaluateOnNewDocument((m, c, l) => {
      try { localStorage.setItem('bfThemeMode', m); localStorage.setItem('bfConsent', c); localStorage.setItem('bfLang', l); } catch (e) { /* без памяти — тоже снимем */ }
    }, mode, CONSENT, lang);
    // страница не открылась (сервер не ответил, 404/500) — это не снимок, а ошибка:
    // вызвавший ответит запасной картинкой
    const res = await page.goto(base + where, { waitUntil: 'domcontentloaded', timeout: PAGE_MS });
    if (!res || res.status() >= 400) throw new Error('page ' + where.split('?')[0] + ' answered ' + (res ? res.status() : 'nothing'));
    // данные страница догружает сама (комнаты, профиль) — ждём, пока запросы утихнут
    await page.waitForNetworkIdle({ idleTime: 150, timeout: PAGE_MS }).catch(() => {});
    if (opts.ready) await page.waitForSelector(opts.ready, { timeout: 4000 }).catch(() => {});
    for (const tab of [].concat(opts.tab || [])) {
      await page.click(tab).catch(() => {});
      await page.waitForNetworkIdle({ idleTime: 150, timeout: 4000 }).catch(() => {});
    }
    // только нужный блок: окно браузера вытягиваем под него, снимаем рамку вокруг блока;
    // край бокового меню и его кнопка сворачивания в рамку не попадают
    if (opts.crop) await page.addStyleTag({ content: '#bfSideToggle,.bfHead{visibility:hidden!important}' }).catch(() => {});
    let box = opts.crop ? await boxOf(page, opts.crop) : null;
    if (box && box.width > 0 && box.height > 0) {
      const need = Math.min(Math.ceil(box.y) + MAX_H, Math.ceil(box.y + box.height + CROP_PAD));
      if (need > VIEW.height) { await page.setViewport({ width: vw, height: need, deviceScaleFactor: dpr }); box = (await boxOf(page, opts.crop)) || box; }
      const x = Math.max(0, Math.floor(box.x - CROP_PAD)), y = Math.max(0, Math.floor(box.y - CROP_PAD));
      const clip = { x, y, width: Math.min(vw - x, Math.ceil(box.width + CROP_PAD * 2)),
                     height: Math.min(MAX_H, Math.ceil(box.height + CROP_PAD * 2)) };
      const cut = Buffer.from(await page.screenshot({ type: 'png', clip }));
      status.ms = Date.now() - t0;
      return cut;
    }
    // длинная страница — снимаем целиком, но не выше MAX_H
    const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)).catch(() => VIEW.height);
    const height = Math.max(VIEW.height, Math.min(MAX_H, Math.ceil(h)));
    if (height !== VIEW.height) await page.setViewport({ width: vw, height, deviceScaleFactor: dpr });
    const png = Buffer.from(await page.screenshot({ type: 'png' }));
    status.ms = Date.now() - t0;
    return png;
  } finally {
    if (page) page.close().catch(() => {});
    release();
    closeSoon();
  }
}

/* Проверка при запуске бота: распаковать браузер заранее и один раз его
   открыть — чтобы первая команда не ждала, а на странице состояния бота
   было видно, работают ли снимки. Браузер сразу закрываем: память. */
async function selfTest() {
  if (off()) { status.state = 'off'; status.reason = 'DISCORD_SHOTS=off'; return false; }
  try {
    await prepare();
    const b = await getBrowser();
    const p = await b.newPage();
    await p.close();
    close();
    return true;
  } catch (e) {
    status = Object.assign(status, { state: 'off', reason: String(e.message || e).slice(0, 200), at: Date.now() });
    return false;
  }
}

function info() {
  return { state: status.state, reason: status.reason, lastShotMs: status.ms, freeMb: freeMb(), freeDiskMb: freeDiskMb(os.tmpdir()), open: !!browser };
}
function setBase(url) { base = String(url).replace(/\/+$/, ''); }

module.exports = { shoot, selfTest, info, close, setBase, freeMb, VIEW, MAX_H };
