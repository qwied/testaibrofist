// ============ ЯЗЫК ИНТЕРФЕЙСА ============
// Определяем язык бесплатно, без внешних сервисов:
//   1) выбор игрока в Settings (сохраняется в аккаунт и в cookie)
//   2) страна из заголовка прокси (Cloudflare / Vercel / Railway edge)
//   3) Accept-Language браузера
// Клиент дополнительно уточняет по часовому поясу, если сервер вернул auto.

const SUPPORTED = ['ru', 'en', 'uk', 'de', 'fr', 'es', 'pt', 'pl', 'tr', 'zh'];

// страна -> язык интерфейса
const COUNTRY_LANG = {
  RU: 'ru', BY: 'ru', KZ: 'ru', KG: 'ru', TJ: 'ru', UZ: 'ru', AM: 'ru', AZ: 'ru', MD: 'ru',
  UA: 'uk',
  DE: 'de', AT: 'de', CH: 'de', LI: 'de',
  FR: 'fr', BE: 'fr', LU: 'fr', MC: 'fr', SN: 'fr', CI: 'fr', CM: 'fr',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es', EC: 'es',
  GT: 'es', CU: 'es', BO: 'es', DO: 'es', HN: 'es', PY: 'es', SV: 'es', NI: 'es',
  CR: 'es', PA: 'es', UY: 'es',
  PT: 'pt', BR: 'pt', AO: 'pt', MZ: 'pt',
  PL: 'pl',
  TR: 'tr',
  CN: 'zh', TW: 'zh', HK: 'zh', MO: 'zh', SG: 'zh'
};

const COUNTRY_HEADERS = [
  'cf-ipcountry',            // Cloudflare
  'x-vercel-ip-country',     // Vercel
  'x-country-code',
  'x-geo-country',
  'x-appengine-country',     // Google
  'fastly-client-country'
];

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function countryOf(req) {
  for (let i = 0; i < COUNTRY_HEADERS.length; i++) {
    const v = req.headers[COUNTRY_HEADERS[i]];
    if (v && /^[A-Za-z]{2}$/.test(String(v))) return String(v).toUpperCase();
  }
  return '';
}

function fromAcceptLanguage(req) {
  const raw = String(req.headers['accept-language'] || '');
  if (!raw) return '';
  const parts = raw.split(',').map(p => {
    const [tag, q] = p.trim().split(';q=');
    return { tag: tag.trim().toLowerCase(), q: q ? parseFloat(q) : 1 };
  }).sort((a, b) => b.q - a.q);

  for (const p of parts) {
    const base = p.tag.split('-')[0];
    if (SUPPORTED.indexOf(base) !== -1) return base;
    // белорусский, казахский и т.п. -> русский интерфейс
    if (['be', 'kk', 'ky', 'tg', 'uz', 'hy', 'az', 'mo'].indexOf(base) !== -1) return 'ru';
    const region = (p.tag.split('-')[1] || '').toUpperCase();
    if (region && COUNTRY_LANG[region]) return COUNTRY_LANG[region];
  }
  return '';
}

function detect(req, user) {
  // 1) явный выбор игрока
  if (user && SUPPORTED.indexOf(user.lang) !== -1)
    return { lang: user.lang, source: 'account' };

  const ck = parseCookies(req).lang;
  if (SUPPORTED.indexOf(ck) !== -1) return { lang: ck, source: 'cookie' };

  // 2) страна по IP (заголовок от прокси)
  const c = countryOf(req);
  if (c && COUNTRY_LANG[c]) return { lang: COUNTRY_LANG[c], source: 'ip', country: c };

  // 3) язык браузера
  const al = fromAcceptLanguage(req);
  if (al) return { lang: al, source: 'browser' };

  // 4) пусть клиент уточнит по часовому поясу
  return { lang: 'en', source: 'auto', country: c || '' };
}

function register(app, acc) {
  const { currentUser, save } = acc;

  app.get('/i18n/detect', (req, res) => {
    const u = currentUser(req);
    const d = detect(req, u);
    res.json({
      lang: d.lang,
      source: d.source,
      country: d.country || '',
      supported: SUPPORTED,
      saved: !!(u && SUPPORTED.indexOf(u.lang) !== -1)
    });
  });

  app.post('/i18n/set', (req, res) => {
    const want = String(req.body.lang || '').toLowerCase();
    if (want !== 'auto' && SUPPORTED.indexOf(want) === -1)
      return res.json({ status: 'error', message: 'Unknown language' });

    const u = currentUser(req);
    if (u) {
      if (want === 'auto') delete u.lang; else u.lang = want;
      save();
    }
    if (want === 'auto') res.setHeader('Set-Cookie', 'lang=; Path=/; Max-Age=0; SameSite=Lax');
    else res.setHeader('Set-Cookie', 'lang=' + want + '; Path=/; Max-Age=31536000; SameSite=Lax');

    res.json({ status: 'success', lang: want });
  });
}

module.exports = { register, detect, SUPPORTED, COUNTRY_LANG };
