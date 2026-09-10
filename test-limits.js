/* Лимиты публикаций и награда за них. Главное, что проверяем: удаление
   уже выложенного не возвращает ни попытку, ни право на монеты. */
const path = require('path');
const os = require('os');
const fs = require('fs');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-'));

let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log('  ', c ? '✓' : '✗', n, x === undefined ? '' : x); };

function harness(mod, extra, userName) {
  const routes = {};
  const app = {
    get: (p, h) => routes['GET ' + p] = h,
    post: (p, h) => routes['POST ' + p] = h
  };
  const user = { name: userName || 'tester', coins: 0 };
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
  const objs100 = [{ type: 'spawn', x: 0, y: 0, w: 20, h: 60 }];
  for (let i = 1; i < 100; i++) objs100.push({ type: 'rect', x: i * 25, y: 0, w: 20, h: 20 });
  const map = n => ({ mapName: n, mapType: 'hideAndSeek',
                      mapData: JSON.stringify({ objects: objs100 }) });

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
  // голосует другой игрок — на своей карте оценка не считается (см. ниже)
  const Voter = harness('./maps.js', {}, 'voter1');
  r = await Voter.call('POST /uploadVote', { author: 'tester', mapName: 'voted', vote: '1' });
  ok('лайк засчитан', r.likes === 1, JSON.stringify(r));
  r = await Voter.call('POST /uploadVote', { author: 'tester', mapName: 'voted', vote: '1' });
  ok('повторный клик снимает', r.likes === 0);
  r = await Voter.call('POST /uploadVote', { author: 'tester', mapName: 'voted', vote: 'абв' });
  ok('мусор не считается дизлайком', r.status === 'error', JSON.stringify(r));
  r = await Voter.call('POST /uploadVote', { author: 'tester', mapName: 'voted', vote: '0' });
  ok('ноль тоже отклоняется', r.status === 'error');
  r = await V.call('POST /uploadVote', { author: 'tester', mapName: 'voted', vote: '1' });
  ok('автору за свою карту не засчитать', r.status === 'error', JSON.stringify(r));

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

  console.log('\nминимум объектов и доля текста:');
  const O = harness('./maps.js');
  const withText = (total, textFrac, name) => {
    const objs = [{ type: 'spawn', x: 0, y: 0, w: 20, h: 60 }];
    const textCount = Math.round(total * textFrac);
    for (let i = 1; i < total; i++)
      objs.push({ type: i <= textCount ? 'text' : 'rect', x: i * 25, y: 0, w: 20, h: 20 });
    return { mapName: name, mapType: 'hideAndSeek', mapData: JSON.stringify({ objects: objs }) };
  };
  r = await O.call('POST /uploadMap', withText(42, 0, 'tooSmall'));
  ok('меньше 100 объектов отклоняется', r.status === 'error', r.message);
  r = await O.call('POST /uploadMap', withText(100, 0, 'exactlyMin'));
  ok('ровно 100 объектов проходит', r.status === 'success', r.message);
  r = await O.call('POST /uploadMap', withText(120, 0.35, 'tooMuchText'));
  ok('больше 30% текста отклоняется', r.status === 'error', r.message);
  r = await O.call('POST /uploadMap', withText(120, 0.25, 'okText'));
  ok('меньше 30% текста проходит', r.status === 'success', r.message);
  // maps.js считает владельцем по имени аккаунта (System по умолчанию),
  // а не по флагу из acc — берём ровно то имя, что isOwnerName примет
  const Owner = harness('./maps.js', {}, 'System');
  r = await Owner.call('POST /uploadMap', withText(5, 0, 'ownerTiny'));
  ok('владельцу минимум объектов не мешает', r.status === 'success', r.message);

  console.log(fails ? '\nПРОВАЛЕНО проверок: ' + fails : '\nвсе проверки пройдены ✓');
  process.exit(fails ? 1 : 0);
})();
