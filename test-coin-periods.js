/* Монеты «за сегодня» и «за неделю» (профиль игрока, /account в Discord,
   таблица лидеров) считаются по журналу заработка. Раньше туда попадали
   только монеты за финиш гонки — награда за день, задания, новая карта,
   «дождь монет» и выдача владельцем шли мимо, и Today/This Week почти
   всегда показывали 0. Проверяем, что теперь любые полученные монеты в
   журнале, а траты — нет.
   Настоящий data/ не трогаем: модули копируются во временную папку.
   Запуск: node test-coin-periods.js */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');

let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };
const DAY = 24 * 3600 * 1000;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-coins-'));
['accounts.js', 'fsAtomic.js', 'discordAuth.js', 'dailyRewards.js', 'quests.js', 'skins.js', 'maps.js', 'ranks.js']
  .forEach(f => fs.copyFileSync(path.join(__dirname, f), path.join(TMP, f)));
fs.mkdirSync(path.join(TMP, 'data'));
fs.writeFileSync(path.join(TMP, 'data', 'users.json'), JSON.stringify({ sessions: {}, users: {
  tester: { name: 'Tester', joined: Date.now(), coins: 0, friends: [], incoming: [], outgoing: [] } } }));

(async () => {
  const acc = require(path.join(TMP, 'accounts.js'));
  const user = acc.getDb().users.tester;
  const mine = since => (acc.sumLog(acc.getCoinLog(), since).find(e => e.name === 'Tester') || { amount: 0 }).amount;
  const routes = {};
  const app = { get: (p, h) => { routes['GET ' + p] = h; }, post: (p, h) => { routes['POST ' + p] = h; } };
  const call = (route, body) => new Promise(resolve => {
    routes[route]({ body: body || {}, query: {}, headers: {} }, { json: resolve, status() { return this; } });
  });
  const viaUser = Object.assign({}, acc, { currentUser: () => user });

  console.log('журнал заработка:');
  acc.creditCoins('Tester', 3);
  ok('монеты за финиш — в журнале, как и раньше', mine(DAY) === 3 && user.coins === 3);

  require(path.join(TMP, 'dailyRewards.js')).register(app, viaUser);
  const daily = await call('POST /dailyReward/claim');
  ok('ежедневная награда — в «за сегодня» и «за неделю»', daily.status === 'success' && mine(DAY) === 3 + daily.amount &&
     mine(7 * DAY) === 3 + daily.amount, daily.amount);

  const Q = require(path.join(TMP, 'quests.js'));
  Q.register(app, viaUser);
  await call('GET /quests/status');
  let rewards = 0;
  for (const q of user.questSet) {
    user.questProgress[q.id] = q.target;
    const r = await call('POST /quests/claim', { id: q.id });
    if (r.status === 'success') rewards += r.amount;
  }
  const bonus = await call('POST /quests/claim', { id: 'bonus' });
  ok('награды за задания и бонус за все задания — тоже', rewards > 0 && bonus.status === 'success' &&
     mine(DAY) === 3 + daily.amount + rewards + bonus.amount, rewards + ' + ' + bonus.amount);

  const before = mine(DAY);
  acc.logCoins('Tester', -500);
  acc.logCoins('Tester', 0);
  ok('траты и нули в заработок не пишутся', mine(DAY) === before);
  ok('баланс и журнал сходятся: всё полученное за сегодня', user.coins === mine(DAY), user.coins + ' / ' + mine(DAY));

  console.log('\nостальные начисления тоже пишут в журнал:');
  const src = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
  ok('новая карта (награда за публикацию)', /u\.coins = balance = balance \+ REWARD;[\s\S]{0,120}acc\.logCoins\(u\.name, REWARD\)/.test(src('maps.js')));
  ok('«дождь монет» владельца', /u\.coins = \(u\.coins \|\| 0\) \+ 1;[\s\S]{0,140}acc\.logCoins\(u\.name, 1\)/.test(src('abuse.js')));
  ok('монеты, выданные владельцем (только прибавка)', /acc\.logCoins\(target\.name, target\.coins - before\)/.test(src('extras.js')));
  const leftovers = ['dailyRewards.js', 'quests.js', 'abuse.js', 'maps.js']
    .filter(f => (src(f).match(/u\.coins = [^;]*\+/g) || []).length > (src(f).match(/logCoins\(/g) || []).length);
  ok('в модулях игры нет начислений мимо журнала', !leftovers.length, leftovers.join());

  console.log('\nнаграды за карты, опубликованные до журнала:');
  const now = Date.now(), HOUR = 3600 * 1000;
  acc.getDb().users.bob = { name: 'Bob', joined: now, coins: 0, friends: [], incoming: [], outgoing: [] };
  acc.logCoins('Bob', 10);                             // карта Bob «после исправления» — уже в журнале
  const bobAt = acc.getCoinLog()[acc.getCoinLog().length - 1].at;
  const map = (author, mapName, created, extra) => Object.assign({ author, mapName, mapType: 'race', mapData: '{}',
    date: created || now, created, votes: {} }, extra);
  fs.writeFileSync(path.join(TMP, 'data', 'maps.json'), JSON.stringify([
    map('tester', 'Early', now - 2 * HOUR),            // до журнала, ник в другом регистре
    map('Tester', 'Twin', now - 2 * HOUR + 1000),      // вторая карта в ту же минуту — своя награда
    map('Tester', 'Older', now - 3 * DAY),
    map('Bob', 'Logged', bobAt - 5),                   // награда уже записана — не дублировать
    map('Tester', 'Ancient', now - 9 * DAY),           // старше журнала — не нужно
    map('Tester', 'NoTime', undefined),                // старая карта без времени публикации
    map('Tester', 'Showcase', now - HOUR, { showcase: true }),
    map('Ghost', 'Gone', now - HOUR)]));               // аккаунта больше нет
  const dayBefore = mine(DAY), weekBefore = mine(7 * DAY), size = acc.getCoinLog().length;
  const M = require(path.join(TMP, 'maps.js'));
  M.register(app, () => null, acc, s => s);
  ok('за сегодня: +10 за каждую из двух карт этого дня', mine(DAY) === dayBefore + 20, mine(DAY) - dayBefore);
  ok('за неделю: ещё +10 за карту трёхдневной давности', mine(7 * DAY) === weekBefore + 30, mine(7 * DAY) - weekBefore);
  ok('время записи — время публикации карты, ник — как у аккаунта',
     acc.getCoinLog().slice(size).every(e => e.name === 'Tester') &&
     acc.getCoinLog().some(e => e.at === now - 2 * HOUR && e.amount === 10));
  ok('уже записанная награда, витрина, старые карты и удалённый аккаунт — не добавлены', acc.getCoinLog().length === size + 3 &&
     acc.sumLog(acc.getCoinLog(), 7 * DAY).every(e => e.name !== 'Ghost') &&
     (acc.sumLog(acc.getCoinLog(), DAY).find(e => e.name === 'Bob') || {}).amount === 10);
  M.register(app, () => null, acc, s => s);
  ok('повторный запуск (перезапуск сервера) ничего не дублирует', acc.getCoinLog().length === size + 3);
  ok('баланс игрока не меняется — только журнал', user.coins === dayBefore);

  await new Promise(r => setTimeout(r, 500));          // сохранение журнала — с задержкой
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('✗ тест упал:', e.stack); process.exit(1); });
