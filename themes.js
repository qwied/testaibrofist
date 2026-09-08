// ============ ТЕМЫ ОФОРМЛЕНИЯ ============
// Тем всего две — светлая и тёмная. Доступ к переключателю открывается
// один раз за монеты и есть у любого игрока: покупка разовая.
// Выбора произвольных цветов больше нет.

const UNLOCK_PRICE = 100;

const MODES = ['light', 'dark'];

function modeOf(u) {
  return (u && MODES.indexOf(u.themeMode) !== -1) ? u.themeMode : 'light';
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
      return res.json({ status: 'error', message: 'Неизвестная тема' });

    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', code: 'guest',
                              message: 'Сначала войдите в аккаунт' });
    if (!unlockedFor(u))
      return res.json({ status: 'error', code: 'locked',
                        message: 'Темы ещё не открыты — нужно ' + UNLOCK_PRICE + ' монет' });

    u.themeMode = want;
    save();
    res.json({ status: 'success', mode: want, saved: true });
  });

  app.post('/theme/unlock', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Сначала войдите в аккаунт' });
    if (u.themeUnlocked)
      return res.json({ status: 'success', unlocked: true, coins: u.coins || 0 });

    const coins = u.coins || 0;
    if (coins < UNLOCK_PRICE)
      return res.json({
        status: 'error',
        message: 'Не хватает ' + (UNLOCK_PRICE - coins) + ' монет из ' + UNLOCK_PRICE
      });

    u.coins = coins - UNLOCK_PRICE;
    u.themeUnlocked = true;
    // цвета из старой версии больше не используются
    delete u.themeColors;
    save();
    res.json({ status: 'success', unlocked: true, coins: u.coins,
               message: 'Темы открыты' });
  });
}

module.exports = { register, UNLOCK_PRICE, MODES, modeOf };
