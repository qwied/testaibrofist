/* Лимиты публикаций и награда за них. Главное, что проверяем: удаление
   уже выложенного не возвращает ни попытку, ни право на монеты. */
const path = require('path');
const os = require('os');
const fs = require('fs');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-'));

let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };

function harness(mod, extra) {
  const routes = {};
  const app = {
    get: (p, h) => routes['GET ' + p] = h,
    post: (p, h) => routes['POST ' + p] = h
  };
  const user = { name: 'tester', coins: 0 };
  const acc = Object.assign({
    currentUser: () => user,
    save: () => {},
    isOwner: () => false,
    isOwnerName: () => false
  }, extra || {});
  // maps.js принимает getUser отдельным аргументом, скины — весь acc
  const m = require(mod);
  if (m.register.length >= 3) m.register(app, () => user, acc);
  else m.register(app, acc);
  const call = (k, body, query) => new Promise(r => {
    const h = routes[k];
    if (!h) return r({ status: 'error', message: 'нет маршрута ' + k });
    h({ body: body || {}, query: query || {}, headers: {}, path: '/' },
      { json: d => r(d), status: () => ({ send: () => r({}) }), send: () => r({}) });
  });
  return { call, user, routes };
}

(async () => {
  console.log('карты:');
  const M = harness('./maps.js');
  const map = n => ({ mapName: n, mapType: 'hideAndSeek',
                      mapData: JSON.stringify({ objects: [{ type: 'spawn', x: 0, y: 0, w: 20, h: 60 }] }) });

  let r = await M.call('POST /uploadMap', map('one'));
  ok('первая карта публикуется', r.status === 'success', r.message);
  const afterFirst = M.user.coins;
  ok('монеты начислены', afterFirst > 0, afterFirst);

  await M.call('POST /uploadMap', map('two'));
  await M.call('POST /uploadMap', map('three'));
  r = await M.call('POST /uploadMap', map('four'));
  ok('лимит трёх карт в сутки', r.status === 'error', r.message);

  // удаляем все карты и пробуем снова — счётчик не должен обнулиться
  await M.call('POST /removeMap', { mapName: 'one' });
  await M.call('POST /removeMap', { mapName: 'two' });
  await M.call('POST /removeMap', { mapName: 'three' });
  const before = M.user.coins;
  r = await M.call('POST /uploadMap', map('again'));
  ok('удаление не возвращает попытку', r.status === 'error', r.message);
  ok('монеты не накрутить удалением', M.user.coins === before, M.user.coins + ' было ' + before);

  console.log('\nоценки:');
  const V = harness('./maps.js');
  await V.call('POST /uploadMap', map('voted'));
  r = await V.call('POST /uploadVote', { author: 'tester', mapName: 'voted', vote: '1' });
  ok('лайк засчитан', r.likes === 1, JSON.stringify(r));
  r = await V.call('POST /uploadVote', { author: 'tester', mapName: 'voted', vote: '1' });
  ok('повторный клик снимает', r.likes === 0);
  r = await V.call('POST /uploadVote', { author: 'tester', mapName: 'voted', vote: 'абв' });
  ok('мусор не считается дизлайком', r.status === 'error', JSON.stringify(r));
  r = await V.call('POST /uploadVote', { author: 'tester', mapName: 'voted', vote: '0' });
  ok('ноль тоже отклоняется', r.status === 'error');

  console.log('\nлимит объектов:');
  const L = harness('./maps.js');
  const many = (hard, wet) => {
    const objs = [{ type: 'spawn', x: 0, y: 0, w: 20, h: 60 }];
    for (let i = 1; i < hard; i++) objs.push({ type: 'rect', x: i, y: 0, w: 20, h: 20 });
    return { mapName: 'big' + hard + '_' + wet, mapType: 'hideAndSeek',
             mapData: JSON.stringify({ objects: objs }) };
  };
  r = await L.call('POST /uploadMap', many(2500, 0));
  ok('лимит обычных объектов держится', r.status === 'error', r.message);

  console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
  process.exit(fails ? 1 : 0);
})();
