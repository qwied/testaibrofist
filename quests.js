// ============ ЕЖЕДНЕВНЫЕ КВЕСТЫ ============
/* 4 квеста в сутки + бонус за выполнение всех разом. Прогресс копится
   сам собой на уже существующих серверных событиях (см. track() ниже и
   его вызовы в server.js/maps.js) — здесь нет отдельной системы
   отслеживания матчей, только счётчик на аккаунте, тот же приём, что и
   mapDay/mapCount в maps.js: набор квестов и прогресс сбрасываются
   ленивo, при первом обращении после того, как прошли сутки с
   questDay, а не по таймеру. */
'use strict';

const WINDOW = 24 * 60 * 60 * 1000;

const QUESTS = [
  { id: 'hs_hider',  hook: 'hs_survive_hider', target: 3,  reward: 2,
    text: 'Survive 3 rounds as a hider in Hide and Seek' },
  { id: 'hs_seeker', hook: 'hs_catch',         target: 3,  reward: 2,
    text: 'Catch 3 hiders as a seeker in Hide and Seek' },
  { id: 'race',      hook: 'race_finish',      target: 3,  reward: 2,
    text: 'Finish 3 races' },
  { id: 'vote',      hook: 'map_vote',         target: 10, reward: 2,
    text: 'Like or dislike 10 maps in Maps Browser' }
];
const BONUS_REWARD = 3;

let accRef = null;   // проставляет register(); track() дёргают из server.js/maps.js

function rollIfNeeded(u) {
  if (!u.questDay || Date.now() - u.questDay > WINDOW) {
    u.questDay = Date.now();
    u.questProgress = {};
    u.questClaimed = {};
    u.questBonusClaimed = false;
  } else {
    u.questProgress = u.questProgress || {};
    u.questClaimed = u.questClaimed || {};
  }
}

// вызывают другие модули при наступлении события — по имени игрока, не
// по объекту аккаунта, чтобы им не нужно было знать формат db.users
function track(name, hook, amount) {
  if (!accRef) return;
  const u = accRef.getDb().users[accRef.key(name)];
  if (!u) return;
  rollIfNeeded(u);
  const q = QUESTS.find(x => x.hook === hook);
  if (!q) return;
  if ((u.questProgress[q.id] || 0) >= q.target) return;
  u.questProgress[q.id] = Math.min(q.target, (u.questProgress[q.id] || 0) + (amount || 1));
  accRef.save();
}

function view(u) {
  rollIfNeeded(u);
  const list = QUESTS.map(q => ({
    id: q.id, text: q.text, target: q.target, reward: q.reward,
    progress: Math.min(q.target, u.questProgress[q.id] || 0),
    claimed: !!u.questClaimed[q.id]
  }));
  return {
    quests: list,
    bonus: { reward: BONUS_REWARD, available: list.every(x => x.claimed), claimed: !!u.questBonusClaimed },
    msLeft: Math.max(0, u.questDay + WINDOW - Date.now())
  };
}

function register(app, acc) {
  accRef = acc;
  const { currentUser, save } = acc;

  app.get('/quests', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ guest: true, quests: [], bonus: null, msLeft: 0 });
    const v = view(u);
    res.json({ guest: false, quests: v.quests, bonus: v.bonus, msLeft: v.msLeft });
  });

  app.post('/quests/claim', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Sign in first' });
    rollIfNeeded(u);
    const id = String(req.body.id || '');

    if (id === 'bonus') {
      if (!QUESTS.every(q => u.questClaimed[q.id]))
        return res.json({ status: 'error', message: 'Complete every quest first' });
      if (u.questBonusClaimed) return res.json({ status: 'error', message: 'Already claimed' });
      u.questBonusClaimed = true;
      u.coins = (u.coins || 0) + BONUS_REWARD;
      save();
      return res.json({ status: 'success', amount: BONUS_REWARD, coins: u.coins });
    }

    const q = QUESTS.find(x => x.id === id);
    if (!q) return res.json({ status: 'error', message: 'Unknown quest' });
    if (u.questClaimed[id]) return res.json({ status: 'error', message: 'Already claimed' });
    if ((u.questProgress[id] || 0) < q.target) return res.json({ status: 'error', message: 'Not completed yet' });
    u.questClaimed[id] = true;
    u.coins = (u.coins || 0) + q.reward;
    save();
    res.json({ status: 'success', amount: q.reward, coins: u.coins });
  });
}

module.exports = { register, reload: () => {}, track };
