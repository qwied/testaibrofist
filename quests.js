// ============ ЕЖЕДНЕВНЫЕ КВЕСТЫ ============
/* 4 квеста в сутки + бонус за выполнение всех разом. Прогресс копится
   сам собой на уже существующих серверных событиях (см. track() ниже и
   его вызовы в server.js/maps.js) — здесь нет отдельной системы
   отслеживания матчей, только счётчик на аккаунте, тот же приём, что и
   mapDay/mapCount в maps.js: набор квестов и прогресс сбрасываются
   ленивo, при первом обращении после того, как прошли сутки с
   questDay, а не по таймеру.

   Раньше набор был жёстко зашит: одни и те же четыре задания с одними и
   теми же числами и по 2 монеты за каждое. Теперь каждый день он
   собирается заново: у каждого задания три уровня сложности, цель растёт
   вместе с уровнем, а награда — 5, 7 или 10 монет. Уровни раздаются
   так, чтобы в наборе всегда встречались все три: день никогда не
   состоит из четырёх одинаково лёгких или четырёх одинаково тяжёлых
   заданий. */
'use strict';

const WINDOW = 24 * 60 * 60 * 1000;

/* Уровни: mul умножает базовую цель задания, reward — плата за него.
   Крайние значения (5 и 10) заданы явно как нижняя и верхняя граница. */
const TIERS = {
  easy:   { mul: 1, reward: 5 },
  medium: { mul: 2, reward: 7 },
  hard:   { mul: 3, reward: 10 }
};
const TIER_NAMES = Object.keys(TIERS);

/* Заготовки заданий: по одной на каждое серверное событие. Крючков
   всего четыре, поэтому разнообразие даёт не выбор заданий, а их
   уровень — от него зависят и цель, и награда. */
const POOL = [
  { hook: 'hs_survive_hider', base: 2,
    text: (n) => 'Survive ' + n + (n === 1 ? ' round' : ' rounds') + ' as a hider in Hide and Seek' },
  { hook: 'hs_catch', base: 2,
    text: (n) => 'Catch ' + n + (n === 1 ? ' hider' : ' hiders') + ' as a seeker in Hide and Seek' },
  { hook: 'race_finish', base: 2,
    text: (n) => 'Finish ' + n + (n === 1 ? ' race' : ' races') },
  { hook: 'map_vote', base: 5,
    text: (n) => 'Rate ' + n + (n === 1 ? ' map' : ' maps') + ' in Maps Browser' }
];
/* Бонус за все четыре задания держим вровень с самым дорогим из них:
   при наградах 5–10 прежние 30 монет за бонус давали бы за него втрое
   больше, чем за самый тяжёлый квест. */
const BONUS_REWARD = 10;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Набор на сутки. Уровни: сначала кладём все три, чтобы «разной
   сложности» выполнялось всегда, четвёртый добираем случайным — и
   перемешиваем, чтобы тяжёлое не оказывалось каждый раз последним. */
function rollSet() {
  const tiers = shuffle(TIER_NAMES.concat(TIER_NAMES[Math.floor(Math.random() * TIER_NAMES.length)]));
  return shuffle(POOL.slice()).map((q, i) => {
    const tier = tiers[i];
    const target = q.base * TIERS[tier].mul;
    /* id — это сам крючок: в наборе он ровно один на задание, поэтому
       прогресс не теряется, даже если завтра у задания сменится уровень
       (а внутри суток уровень и так не меняется). */
    return { id: q.hook, hook: q.hook, tier: tier, target: target,
             reward: TIERS[tier].reward, text: q.text(target) };
  });
}

let accRef = null;   // проставляет register(); track() дёргают из server.js/maps.js

function rollIfNeeded(u) {
  if (!u.questDay || Date.now() - u.questDay > WINDOW) {
    u.questDay = Date.now();
    u.questSet = rollSet();
    u.questProgress = {};
    u.questClaimed = {};
    u.questBonusClaimed = false;
  } else {
    u.questProgress = u.questProgress || {};
    u.questClaimed = u.questClaimed || {};
    /* Аккаунт, заведённый до появления наборов: сутки ещё идут, набора
       нет. Раздаём набор, но прогресс НЕ трогаем — незачем обнулять
       день только потому, что обновилась игра. */
    if (!Array.isArray(u.questSet) || !u.questSet.length) u.questSet = rollSet();
  }
}
// задания текущих суток игрока (после rollIfNeeded всегда непустой)
function setOf(u) { return Array.isArray(u.questSet) ? u.questSet : []; }

// вызывают другие модули при наступлении события — по имени игрока, не
// по объекту аккаунта, чтобы им не нужно было знать формат db.users
function track(name, hook, amount) {
  if (!accRef) return;
  const u = accRef.getDb().users[accRef.key(name)];
  if (!u) return;
  rollIfNeeded(u);
  const q = setOf(u).find(x => x.hook === hook);
  if (!q) return;
  if ((u.questProgress[q.id] || 0) >= q.target) return;
  u.questProgress[q.id] = Math.min(q.target, (u.questProgress[q.id] || 0) + (amount || 1));
  accRef.save();
}

function view(u) {
  rollIfNeeded(u);
  const list = setOf(u).map(q => ({
    id: q.id, text: q.text, target: q.target, reward: q.reward, tier: q.tier,
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
      if (!setOf(u).every(q => u.questClaimed[q.id]))
        return res.json({ status: 'error', message: 'Complete every quest first' });
      if (u.questBonusClaimed) return res.json({ status: 'error', message: 'Already claimed' });
      u.questBonusClaimed = true;
      u.coins = (u.coins || 0) + BONUS_REWARD;
      save();
      return res.json({ status: 'success', amount: BONUS_REWARD, coins: u.coins });
    }

    const q = setOf(u).find(x => x.id === id);
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
