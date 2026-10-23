/* Кланы: правила (создание, вступление, заявки, роли, исключение, лидерство, роспуск),
   очки, смена ника и сохранение на диск. Сервер не нужен: маршруты вызываются напрямую. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Clans = require('./clans.js');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-clans-'));
const file = path.join(tmp, 'clans.json');
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} });

// игроки и их очки — как в accounts.js
const users = {};
const addUser = (name, score, hsScore) => { users[name.toLowerCase()] = { name, score: score || 0, hsScore: hsScore || 0 }; return users[name.toLowerCase()]; };
const acc = {
  OWNER_ALIASES: ['system', 'aibrofist'],
  key: n => String(n || '').toLowerCase(),
  getDb: () => ({ users }),
  isOwner: u => !!u && acc.OWNER_ALIASES.indexOf(u.name.toLowerCase()) !== -1,
  currentUser: req => req.user || null
};

function boot() {
  const C = Clans.make(file);
  const routes = {};
  C.register({
    get: (p, h) => { routes['GET ' + p] = h; },
    post: (p, h) => { routes['POST ' + p] = h; }
  }, acc);
  const call = (method, p, user, data) => {
    let out;
    const req = { user: user ? users[user.toLowerCase()] : null, body: method === 'POST' ? (data || {}) : {}, query: method === 'GET' ? (data || {}) : {} };
    routes[method + ' ' + p](req, { json: o => { out = o; } });
    return out;
  };
  return { C, get: (p, u, q) => call('GET', p, u, q), post: (p, u, b) => call('POST', p, u, b) };
}

['Lead', 'Bob', 'Cat', 'Dan', 'Eve', 'Fay'].forEach((n, i) => addUser(n, i === 0 ? 10 : 3, i === 0 ? 5 : 0));
addUser('System');                                  // владелец
let S = boot();
const { get, post } = { get: (...a) => S.get(...a), post: (...a) => S.post(...a) };

// ---------- создание ----------
console.log('создание:');
ok(post('/clan/create', null, { name: 'Wolves', tag: 'WLF' }).status === 'error', 'гостю нельзя');
for (const [name, tag, why] of [
  ['ab', 'AB', 'название короче 3'], ['x'.repeat(21), 'XX', 'название длиннее 20'],
  ['Bad<script>', 'BS', 'опасные символы'], ['-Wolves', 'WW', 'название начинается со знака'],
  ['Wolves', 'A', 'тег из одного знака'], ['Wolves', 'ABCDEF', 'тег длиннее 5'], ['Wolves', 'A-B', 'знаки в теге'],
  ['System', 'SYS', 'зарезервированное название'], ['System Team', 'ST', 'название начинается с ника владельца'],
  ['Wolves', 'System', 'зарезервированный тег']
]) ok(post('/clan/create', 'Lead', { name, tag }).status === 'error', 'не создаётся: ' + why);
let r = post('/clan/create', 'Lead', { name: '  Red   Wolves ', tag: 'rw', desc: 'We run <fast>', color: '#E11D48', open: 'true' });
ok(r.status === 'success' && r.clan.tag === 'RW' && r.clan.name === 'Red Wolves', 'создан: пробелы сжаты, тег в верхнем регистре', JSON.stringify(r.clan));
ok(r.clan.color === '#e11d48' && r.clan.open === true, 'цвет и открытость сохранены');
const id = r.clan.id;
ok(post('/clan/create', 'Lead', { name: 'Other', tag: 'OT' }).message === 'Leave your current clan first', 'второй клан тому же игроку нельзя');
ok(post('/clan/create', 'Bob', { name: 'red-wolves', tag: 'ZZ' }).status === 'error', 'то же название с другими знаками занято');
ok(post('/clan/create', 'Bob', { name: 'Blue Hawks', tag: 'Rw' }).status === 'error', 'тег занят без учёта регистра');
r = post('/clan/create', 'Bob', { name: 'Blue Hawks', tag: 'bh', color: 'red' });
ok(r.status === 'success' && r.clan.color === '#111827', 'неверный цвет заменён на стандартный');
const id2 = r.clan.id;
ok(post('/clan/disband', 'Bob').status === 'success', 'вторая группа распущена');

// ---------- вступление ----------
console.log('вступление:');
ok(post('/clan/join', 'Cat', { id: '999' }).message === 'Clan not found', 'несуществующий клан');
r = post('/clan/join', 'Cat', { id });
ok(r.status === 'success' && r.joined === true, 'в открытый клан входят сразу');
ok(post('/clan/join', 'Cat', { id }).message === 'Leave your current clan first', 'член клана не вступает в другой');
let c = get('/clan', 'Lead', { id });
ok(c.members === 2 && c.points === 10 + 5 + 3, 'очки клана — сумма очков участников', c.points + ' очков, ' + c.members + ' чел.');
ok(c.memberList[0].name === 'Lead' && c.memberList[0].role === 'leader', 'лидер первым в списке');
ok(Array.isArray(c.requests) && c.requests.length === 0, 'лидеру видны заявки (пока их нет)', JSON.stringify(c.requests));

// закрываем
ok(post('/clan/edit', 'Cat', { open: 'false' }).status === 'error', 'рядовой не меняет настройки');
r = post('/clan/edit', 'Lead', { open: 'false', desc: 'x'.repeat(300), color: '#16a34a' });
ok(r.status === 'success' && r.clan.open === false && r.clan.desc.length === 200 && r.clan.color === '#16a34a', 'лидер меняет описание, цвет и доступ');
ok(post('/clan/edit', 'Lead', { color: 'nope' }).message === 'Bad color', 'плохой цвет не принимается');
r = post('/clan/join', 'Dan', { id });
ok(r.status === 'success' && r.joined === false, 'в закрытый клан — заявка');
ok(post('/clan/join', 'Dan', { id }).message === 'Request already sent', 'повторная заявка запрещена');
c = get('/clan', 'Dan', { id });
ok(c.myRequest === true && c.requests === undefined, 'заявитель видит свою заявку, но не чужие');
c = get('/clan', 'Cat', { id });
ok(c.requests === undefined, 'рядовой не видит заявки');
ok(S.C.pendingFor('Lead') === 1 && S.C.pendingFor('Cat') === 0, 'число заявок — у тех, кто может решать');
ok(post('/clan/accept', 'Cat', { name: 'Dan' }).status === 'error', 'рядовой не принимает заявки');
r = post('/clan/cancelRequest', 'Dan', { id });
ok(r.status === 'success' && get('/clan', 'Lead', { id }).requests.length === 0, 'заявку можно отозвать');
post('/clan/join', 'Dan', { id });

// ---------- роли ----------
console.log('роли:');
ok(post('/clan/promote', 'Cat', { name: 'Cat' }).status === 'error', 'рядовой не повышает');
ok(post('/clan/promote', 'Lead', { name: 'Cat' }).status === 'success', 'лидер делает офицера');
ok(post('/clan/promote', 'Lead', { name: 'Cat' }).status === 'error', 'офицера второй раз не повысить');
ok(get('/clan', 'Cat', { id }).requests.length === 1, 'офицер видит заявки');
ok(post('/clan/accept', 'Cat', { name: 'Dan' }).status === 'success', 'офицер принимает заявку');
ok(get('/clan', 'Lead', { id }).members === 3, 'в клане трое');
ok(post('/clan/promote', 'Cat', { name: 'Dan' }).status === 'error', 'офицер не повышает');
ok(post('/clan/transfer', 'Cat', { name: 'Dan' }).status === 'error', 'офицер не передаёт лидерство');
ok(post('/clan/kick', 'Cat', { name: 'Lead' }).status === 'error', 'лидера не исключить');
ok(post('/clan/kick', 'Cat', { name: 'Cat' }).status === 'error', 'себя не исключить');
post('/clan/join', 'Eve', { id }); post('/clan/join', 'Fay', { id });
ok(post('/clan/decline', 'Cat', { name: 'Eve' }).status === 'success', 'офицер отклоняет заявку');
ok(post('/clan/kick', 'Cat', { name: 'Dan' }).status === 'success', 'офицер исключает рядового');
ok(post('/clan/promote', 'Lead', { name: 'Bob' }).status === 'error', 'не из клана — не повысить');
ok(post('/clan/accept', 'Lead', { name: 'Fay' }).status === 'success', 'лидер принимает заявку');
ok(post('/clan/promote', 'Lead', { name: 'Fay' }).status === 'success', 'второй офицер');
ok(post('/clan/kick', 'Cat', { name: 'Fay' }).message === 'Only the leader can remove an officer', 'офицер не исключает офицера');
ok(post('/clan/demote', 'Lead', { name: 'Fay' }).status === 'success', 'лидер снимает с офицеров');
ok(post('/clan/demote', 'Lead', { name: 'Fay' }).status === 'error', 'снять с офицеров можно только офицера');

// ---------- лидерство и выход ----------
console.log('лидерство и выход:');
ok(post('/clan/leave', 'Lead').status === 'error', 'лидер с командой не уходит просто так');
ok(post('/clan/transfer', 'Lead', { name: 'Dan' }).status === 'error', 'передать можно только участнику клана');
ok(post('/clan/transfer', 'Lead', { name: 'Lead' }).status === 'error', 'себе передать нельзя');
ok(post('/clan/transfer', 'Lead', { name: 'Fay' }).status === 'success', 'лидерство передано');
c = get('/clan', 'Fay', { id });
ok(c.leader === 'Fay' && c.memberList.find(m => m.name === 'Lead').role === 'officer', 'прежний лидер стал офицером');
ok(post('/clan/leave', 'Lead').status === 'success', 'теперь он выходит');
ok(get('/myClan', 'Lead').clan === null, 'у вышедшего клана нет');

// ---------- смена ника ----------
console.log('смена ника:');
users.fay.name = 'Fay2'; users.fay2 = users.fay; delete users.fay;
S.C.renameMember('Fay', 'Fay2');
c = get('/clan', 'Fay2', { id });
ok(c.leader === 'Fay2' && c.myRole === 'leader', 'лидер остался лидером под новым ником');
ok(S.C.clanOf('Fay2') && S.C.clanOf('Fay') === null, 'старый ник клана не находит, новый находит');

// ---------- список и поиск ----------
console.log('список:');
r = post('/clan/create', 'Lead', { name: 'Zeta Crew', tag: 'ZC' });
ok(r.status === 'success', 'второй клан создан');
let l = get('/clan/list', null, {});
ok(l.total === 2 && l.clans[0].tag === 'ZC', 'по очкам первым идёт сильнейший (очки — по нынешнему составу)', l.clans.map(x => x.tag + ':' + x.points).join(' '));
ok(get('/clan/list', null, { sort: 'members' }).clans[0].tag === 'RW', 'по числу участников — клан побольше');
ok(get('/clan/list', null, { q: 'zeta' }).total === 1 && get('/clan/list', null, { q: 'zc' }).total === 1 && get('/clan/list', null, { q: 'nope' }).total === 0, 'поиск по названию и тегу');
ok(get('/clan/list', null, { sort: 'new' }).clans[0].tag === 'ZC', 'новые — первыми');
ok(get('/clan/list', 'Lead', {}).mine === r.clan.id, 'список говорит, в каком клане игрок');
for (let i = 0; i < 30; i++) addUser('Mass' + i);
for (let i = 0; i < 30; i++) post('/clan/join', 'Mass' + i, { id: r.clan.id });   // клан закрыт? нет — открыт по умолчанию
c = get('/clan', 'Lead', { id: r.clan.id });
ok(c.members === 30, 'клан вмещает не больше 30', c.members + ' чел.');
ok(post('/clan/join', 'Mass29', { id: r.clan.id }).message === 'This clan is full', 'в полный клан не вступить');

// ---------- роспуск ----------
console.log('роспуск:');
ok(post('/clan/disband', 'Mass3', { id: r.clan.id }).status === 'error', 'рядовой не распускает');
ok(post('/clan/disband', 'System', { id: r.clan.id }).status === 'success', 'владелец сайта распускает любой клан');
ok(get('/myClan', 'Mass3').clan === null && get('/clan/list', null, {}).total === 1, 'после роспуска участники свободны');

// ---------- хранение ----------
console.log('хранение:');
S.C.flush();
const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
ok(saved.clans.length === 1 && saved.clans[0].tag === 'RW', 'клан записан на диск');
S = boot();
ok(get('/clan', 'Fay2', { id }).myRole === 'leader' && get('/clan/list', null, {}).total === 1, 'после перезапуска всё на месте');
const nextId = post('/clan/create', 'Dan', { name: 'Fresh', tag: 'FR' }).clan.id;
ok(nextId !== id && nextId !== id2 && nextId !== r.clan.id, 'номера не повторяются после перезапуска', 'id ' + nextId);
fs.writeFileSync(file, '{ битый json');
S.C.reload();
ok(get('/clan/list', null, {}).total === 0, 'битый файл не роняет модуль');

console.log('\n' + pass + ' ok, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
