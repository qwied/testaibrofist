// ============ ТЕМЫ ОФОРМЛЕНИЯ ============
// Тем всего две — светлая и тёмная. Доступ к переключателю открывается
// один раз за монеты и есть у любого игрока: покупка разовая.
// Выбора произвольных цветов больше нет.

const UNLOCK_PRICE = 100;

const MODES = ['light', 'dark'];

// языков два, и оба переведены целиком (словарь в i18n.js)
const LANGS = ['en', 'ru'];

function modeOf(u) {
  return (u && MODES.indexOf(u.themeMode) !== -1) ? u.themeMode : 'light';
}

function langOf(u) {
  return (u && LANGS.indexOf(u.lang) !== -1) ? u.lang : 'en';
}

function unlockedFor(u) {
  return !!(u && u.themeUnlocked);
}

function register(app, acc) {
  const { currentUser, save } = acc;

  app.get('/theme/get', (req, res) => {
    const u = currentUser(req);
    res.json({
      guest: !u,
      unlocked: unlockedFor(u),
      price: UNLOCK_PRICE,
      coins: u ? (u.coins || 0) : 0,
      // тему показываем только тем, кто её открыл, иначе всегда светлая
      mode: unlockedFor(u) ? modeOf(u) : 'light',
      modes: MODES
    });
  });

  /* Переключить тему может только тот, кто её открыл. */
  app.post('/theme/mode', (req, res) => {
    const want = String(req.body.mode || '').toLowerCase();
    if (MODES.indexOf(want) === -1)
      return res.json({ status: 'error', message: 'Unknown theme' });

    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', code: 'guest',
                              message: 'Sign in first' });
    if (!unlockedFor(u))
      return res.json({ status: 'error', code: 'locked',
                        message: 'Themes are not unlocked yet — needs ' + UNLOCK_PRICE + ' coins' });

    u.themeMode = want;
    save();
    res.json({ status: 'success', mode: want, saved: true });
  });

  app.post('/theme/unlock', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Sign in first' });
    if (u.themeUnlocked)
      return res.json({ status: 'success', unlocked: true, coins: u.coins || 0 });

    const coins = u.coins || 0;
    if (coins < UNLOCK_PRICE)
      return res.json({
        status: 'error',
        message: 'You need ' + (UNLOCK_PRICE - coins) + ' more of ' + UNLOCK_PRICE + ' coins'
      });

    u.coins = coins - UNLOCK_PRICE;
    u.themeUnlocked = true;
    // цвета из старой версии больше не используются
    delete u.themeColors;
    save();
    res.json({ status: 'success', unlocked: true, coins: u.coins,
               message: 'Themes unlocked' });
  });

  /* ---------- язык интерфейса ----------
     Живёт рядом с темой, потому что это то же самое: настройка вида,
     которую игрок выбирает в Settings. Браузер помнит выбор сам
     (localStorage в i18n.js), аккаунт нужен, чтобы выбор уехал за
     игроком на другое устройство. Гостю просто отвечаем английским —
     его браузерная память и так работает. */
  app.get('/i18n/get', (req, res) => {
    const u = currentUser(req);
    res.json({ lang: langOf(u), guest: !u, langs: LANGS });
  });

  app.post('/i18n/set', (req, res) => {
    const want = String(req.body.lang || '').toLowerCase();
    if (LANGS.indexOf(want) === -1)
      return res.json({ status: 'error', message: 'Unknown language' });
    const u = currentUser(req);
    // гостю сохранять некуда, но и ошибкой это не считаем: язык у него
    // уже переключился в браузере, сервер тут ничего не решает
    if (!u) return res.json({ status: 'success', lang: want, saved: false });
    u.lang = want;
    save();
    res.json({ status: 'success', lang: want, saved: true });
  });
}

module.exports = { register, UNLOCK_PRICE, MODES, modeOf, LANGS, langOf };
