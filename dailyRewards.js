// ============ ЕЖЕДНЕВНАЯ НАГРАДА: КОЛЕСО ФОРТУНЫ ============
/* Раз в 24 часа игрок может крутить колесо и получить случайное число
   монет. Приз выбирает сервер (клиент только проигрывает анимацию до
   уже решённого результата — иначе колесо было бы легко подделать в
   консоли браузера). Монеты начисляются напрямую (как REWARD за
   публикацию карты в maps.js), а не через accounts.js creditCoins() —
   этот приз и так ограничен раз в сутки самим механизмом, часовой
   лимит creditCoins() тут ни при чём и мог бы срезать честный приз,
   если игрок уже что-то заработал в игре в этот же час. */
'use strict';

// вес — относительная частота выпадения, не проценты; больше вес — чаще приз
const PRIZES = [
  { amount: 1,  weight: 30 },
  { amount: 2,  weight: 25 },
  { amount: 5,  weight: 20 },
  { amount: 10, weight: 15 },
  { amount: 20, weight: 7 },
  { amount: 50, weight: 3 }
];
const TOTAL_WEIGHT = PRIZES.reduce((s, p) => s + p.weight, 0);
const WINDOW = 24 * 60 * 60 * 1000;   // 24 часа, как и остальные daily-лимиты в проекте

function pickPrizeIndex() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (let i = 0; i < PRIZES.length; i++) {
    r -= PRIZES[i].weight;
    if (r <= 0) return i;
  }
  return PRIZES.length - 1;
}

function register(app, acc) {
  const { currentUser, save } = acc;

  function msLeft(u) {
    return Math.max(0, (u.rewardDay || 0) + WINDOW - Date.now());
  }

  app.get('/dailyReward/status', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ available: false, guest: true, msLeft: 0, prizes: PRIZES });
    const left = msLeft(u);
    res.json({ available: left <= 0, guest: false, msLeft: left, prizes: PRIZES });
  });

  app.post('/dailyReward/claim', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Sign in first' });
    const left = msLeft(u);
    if (left > 0) return res.json({ status: 'error', message: 'Already claimed — come back later', msLeft: left });
    const index = pickPrizeIndex();
    const amount = PRIZES[index].amount;
    u.coins = (u.coins || 0) + amount;
    u.rewardDay = Date.now();
    save();
    res.json({ status: 'success', index, amount, coins: u.coins });
  });
}

module.exports = { register, reload: () => {} };
