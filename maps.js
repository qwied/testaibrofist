// ============ КАРТЫ: публикация из редактора и Maps Browser ============
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const MAPS_FILE = path.join(DATA_DIR, 'maps.json');

const MODES = ['hideAndSeek', 'race'];
// в игровые режимы попадают только карты владельца сайта
// (имя можно поменять переменной окружения OWNER_NAME, без правки кода)
const OWNER = process.env.OWNER_NAME || 'System';
const OWNER_ALIASES = String(process.env.OWNER_ALIASES || 'System,AIBrofist')
  .split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
if (OWNER_ALIASES.indexOf(OWNER.toLowerCase()) === -1) OWNER_ALIASES.push(OWNER.toLowerCase());
const isOwnerName = n => OWNER_ALIASES.indexOf(String(n || '').toLowerCase()) !== -1;

const DAILY_LIMIT = 3;                 // сколько новых карт можно выложить за сутки
const REWARD      = 10;                // монет за каждую новую опубликованную карту
const COIN_LIMIT  = 3;                 // максимум монет в одной карте — защита от накрутки
const OBJ_LIMIT   = 2000;              // максимум объектов в карте, одинаково во всех режимах
const OBJ_MIN     = 100;               // минимум объектов для публикации — иначе награду накрутить проще, чем карту построить
const TEXT_MAX_RATIO = 0.3;            // не больше 30% карты — текстовые объекты, остальное геометрия

// у каждого режима свой набор объектов; общие доступны везде
/* Платформа, ротатор, батут, яд и шипы стали свойствами обычных объектов,
   а дверь — воротами. Типы оставлены в списке, чтобы старые карты
   принимались: редактор превращает их в свойства при загрузке. */
const TOOL_MODES = {
  rect:null, circle:null, triangle:null, text:null, coin:null,
  gate:null, spawn:null, finishline:null,
  button:null, lever:null, water:null,
  cover:['hideAndSeek'],
  checkpoint:['race'],
  // устаревшие типы — принимаем, но в палитре их больше нет
  poison:null, spike:null, bounce:null, platform:null, rotator:null,
  door:null, seeker:null, liquid:null, box:null
};
const TOOL_RU = {
  cover:'Cover', seeker:'Seeker', door:'Door', button:'Button',
  lever:'Lever', checkpoint:'Checkpoint', finishline:'Finish', water:'Water',
  liquid:'Liquid'
};

// объекты карты (mapData — JSON из редактора)
function objectsOf(raw) {
  try {
    const m = JSON.parse(raw);
    const list = Array.isArray(m) ? m : (m && Array.isArray(m.objects) ? m.objects : []);
    return list.filter(o => o && typeof o.type === 'string');
  } catch (e) { return []; }
}

// какие объекты не подходят заявленному режиму
function wrongForMode(list, mode) {
  const bad = new Set();
  list.forEach(o => {
    // o.type — строка из присланного JSON; "constructor"/"toString" и т.п.
    // резолвятся через прототип в обычную функцию Object, а не в undefined,
    // и .indexOf на ней рвёт запрос — hasOwnProperty отсекает это заранее
    if (!Object.prototype.hasOwnProperty.call(TOOL_MODES, o.type)) return;
    const allowed = TOOL_MODES[o.type];
    if (allowed && allowed.indexOf(mode) === -1) bad.add(o.type);
  });
  return Array.from(bad);
}

// сколько монет лежит в карте
function coinsInMap(raw) {
  return objectsOf(raw).filter(o => o.type === 'coin').length;
}

// счётчики оценок: голоса игроков + ручная правка владельца
function tally(m) {
  const votes = Object.values(m.votes || {});
  // boost может быть отрицательным: так владелец способен выставить
  // итог меньше, чем реальных голосов. Ниже нуля не опускаемся.
  const likes = Math.max(0, votes.filter(v => v > 0).length + (m.boostLikes || 0));
  const dislikes = Math.max(0, votes.filter(v => v < 0).length + (m.boostDislikes || 0));
  return { likes, dislikes, rating: likes - dislikes };
}
function retally(m) {
  const t = tally(m);
  m.rating = t.rating;
  return t;
}

/* Сколько новых карт автор выложил за сутки.
   Считаем по счётчику в аккаунте, а не по списку карт: раньше можно
   было выложить карту, получить монеты, удалить её — и счётчик падал,
   так что и лимит, и награда обходились бесконечно. */
function publishedToday(u) {
  if (!u) return 0;
  if (!u.mapDay || Date.now() - u.mapDay > 864e5) return 0;
  return u.mapCount || 0;
}
function countPublish(u) {
  if (!u.mapDay || Date.now() - u.mapDay > 864e5) { u.mapDay = Date.now(); u.mapCount = 0; }
  u.mapCount = (u.mapCount || 0) + 1;
}
function publishWait(u) {
  const left = (u.mapDay || Date.now()) + 864e5 - Date.now();
  return Math.max(0, left);
}

let maps = [];

function load() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(MAPS_FILE)) maps = JSON.parse(fs.readFileSync(MAPS_FILE, 'utf8'));
  } catch (e) { console.log('maps.json не прочитан, начинаю с нуля'); }
  if (!Array.isArray(maps)) maps = [];
}
let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(MAPS_FILE, JSON.stringify(maps, null, 2));
    } catch (e) { console.log('не смог сохранить maps.json:', e.message); }
  }, 300);
}
load();

const low = s => String(s || '').toLowerCase();

function register(app, getUser, acc) {
  // ---------- публикация карты из редактора ----------
  app.post('/uploadMap', (req, res) => {
    const u = getUser(req);
    if (!u) return res.json({ status: 'error', message: 'Sign in first' });

    const mapName = String(req.body.mapName || '').trim();
    const mapType = String(req.body.mapType || 'hideAndSeek');
    const mapData = String(req.body.mapData || '');
    const overwrite = String(req.body.mapOverwrite || '') === 'true';

    if (mapName.length < 2 || mapName.length > 30)
      return res.json({ status: 'error', message: 'Map name: 2 to 30 characters' });
    if (MODES.indexOf(mapType) === -1)
      return res.json({ status: 'error', message: 'Unknown map mode' });
    if (!mapData)
      return res.json({ status: 'error', message: 'Map is empty' });

    const list = objectsOf(mapData);
    // objectsOf молча возвращает [] на любой мусор/битый JSON — без этой
    // проверки такой mapData спокойно проходил все лимиты (0 не больше
    // 2000, 0 монет не больше 3) и приносил полную награду ни за что
    if (!list.length)
      return res.json({ status: 'error', message: 'Map is corrupted or empty' });

    if (list.length > OBJ_LIMIT)
      return res.json({
        status: 'error',
        message: 'The map has ' + list.length + ' objects. No more than ' + OBJ_LIMIT + ' allowed.'
      });

    // за новую карту платим монетами — иначе публиковали бы карту из
    // одного объекта ради награды. Владельцу порог не мешает: его карты
    // для показов, не для заработка.
    if (list.length < OBJ_MIN && !isOwnerName(u.name))
      return res.json({
        status: 'error',
        message: 'The map has ' + list.length + ' objects. At least ' + OBJ_MIN +
                 ' are required to publish.'
      });

    // текстом легче всего накрутить число объектов, не строя саму карту —
    // ограничиваем его долю, а не количество, чтобы большие карты могли
    // позволить себе больше подписей
    const textCount = list.filter(o => o.type === 'text').length;
    if (textCount > 0 && textCount > Math.floor(list.length * TEXT_MAX_RATIO) && !isOwnerName(u.name))
      return res.json({
        status: 'error',
        message: textCount + ' of ' + list.length + ' objects are text — more than ' +
                 Math.round(TEXT_MAX_RATIO * 100) + '% of the map. Add more actual geometry.'
      });

    const coins = list.filter(o => o.type === 'coin').length;
    // владельцу лимит монет не мешает: его карты для показов
    if (coins > COIN_LIMIT && !isOwnerName(u.name))
      return res.json({
        status: 'error',
        message: 'The map has ' + coins + ' coins. No more than ' + COIN_LIMIT +
                 ' allowed — remove the extra ones and try again.'
      });

    const bad = wrongForMode(list, mapType);
    if (bad.length)
      return res.json({
        status: 'error',
        message: 'These objects don\'t work in the «' + mapType + '» mode: ' +
                 bad.map(t => TOOL_RU[t] || t).join(', ') + '. Remove them from the map.'
      });

    const i = maps.findIndex(m => low(m.author) === low(u.name) && low(m.mapName) === low(mapName));

    // лимит считаем только для новых карт — обновлять свои можно свободно
    if (i === -1) {
      const used = publishedToday(u);
      if (used >= DAILY_LIMIT) {
        const mins = Math.ceil(publishWait(u) / 60000);
        const h = Math.floor(mins / 60), mn = mins % 60;
        return res.json({
          status: 'error',
          message: 'Daily limit of ' + DAILY_LIMIT + ' maps reached. You can publish the next one in '
                   + (h > 0 ? h + 'h ' + mn + 'm' : mn + 'm') + '.'
        });
      }
    }

    if (i !== -1) {
      if (!overwrite)
        return res.json({ status: 'exists', message: 'A map with this name already exists. Overwrite it?' });
      maps[i].mapData = mapData;
      maps[i].mapType = mapType;
      maps[i].date = Date.now();
      save();
      return res.json({ status: 'success', message: 'Map updated' });
    }

    maps.push({
      mapName, mapType, mapData,
      author: u.name, date: Date.now(), created: Date.now(),
      rating: 0, votes: {}, boostLikes: 0, boostDislikes: 0, inGameModes: []
    });
    save();

    // за новую карту начисляем монеты; при обновлении старой — нет,
    // иначе можно было бы перезаливать одну и ту же карту без конца
    let balance = u.coins || 0;
    if (acc && typeof acc.save === 'function') {
      u.coins = balance = balance + REWARD;
      countPublish(u);
      acc.save();
    }

    const left = DAILY_LIMIT - publishedToday(u);
    res.json({
      status: 'success',
      reward: REWARD,
      coins: balance,
      left: Math.max(0, left),
      limit: DAILY_LIMIT,
      message: 'Map published. +' + REWARD + ' coins  ·  left today: ' +
               Math.max(0, left) + ' of ' + DAILY_LIMIT
    });
  });

  app.get('/getUploadLimit', (req, res) => {
    const u = getUser(req);
    if (!u) return res.json({ limit: DAILY_LIMIT, left: DAILY_LIMIT, reward: REWARD, guest: true });
    res.json({
      limit: DAILY_LIMIT, reward: REWARD, guest: false,
      left: Math.max(0, DAILY_LIMIT - publishedToday(u))
    });
  });

  // "author::mapName" в нижнем регистре — тот же составной ключ, которым
  // карта адресуется везде (у карт нет отдельного числового id)
  const favKey = (author, mapName) => low(author) + '::' + low(mapName);

  // ---------- список карт для Maps Browser ----------
  function list(req, res) {
    const me = getUser(req);
    const myFavs = me && Array.isArray(me.favoriteMaps) ? me.favoriteMaps : [];
    const mapType = String(req.query.mapType || '');
    const author = low(req.query.author || '');
    const sortBy = String(req.query.sortBy || 'date');
    const favoritesOnly = req.query.favoritesOnly === '1';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const per = 10;

    let out = maps.slice();
    if (mapType) out = out.filter(m => m.mapType === mapType);
    if (author) out = out.filter(m => low(m.author).indexOf(author) !== -1);
    if (favoritesOnly) out = out.filter(m => myFavs.indexOf(favKey(m.author, m.mapName)) !== -1);

    out.sort((a, b) => {
      if (sortBy === 'rating') return (b.rating - a.rating) || (b.date - a.date);
      if (sortBy === 'dislikes') return (tally(b).dislikes - tally(a).dislikes) || (b.date - a.date);
      if (sortBy === 'oldest') return a.date - b.date;
      return b.date - a.date;
    });

    const pages = Math.max(1, Math.ceil(out.length / per));
    const curPage = Math.min(page, pages);
    const slice = out.slice((curPage - 1) * per, curPage * per).map(m => {
      const t = tally(m);
      return {
        mapName: m.mapName, rating: t.rating, likes: t.likes, dislikes: t.dislikes,
        author: m.author, date: m.date, mapType: m.mapType,
        myVote: me ? ((m.votes || {})[low(me.name)] || 0) : 0,
        myFavorite: myFavs.indexOf(favKey(m.author, m.mapName)) !== -1,
        inGameModes: Array.isArray(m.inGameModes) ? m.inGameModes : []
      };
    });

    res.json({ page: String(curPage) + '/' + pages,
               pages, count: out.length, maps: slice });
  }
  app.get('/getMaps', list);
  app.get('/getMapsForList', list);

  // ---------- данные карты ----------
  app.get('/getMapData', (req, res) => {
    const m = maps.find(x => low(x.author) === low(req.query.author) &&
                             low(x.mapName) === low(req.query.mapName));
    res.json(m ? m.mapData : '');
  });

  // ---------- случайная карта режима ----------
  app.get('/getRandomMap', (req, res) => {
    const t = req.query.mapType;
    // без указания режима берём любую карту, иначе — карты владельца
    // плюс те, что он добавил кнопкой «Добавить в игру» в Maps Browser
    const pool = !t
      ? maps.slice()
      : maps.filter(m => {
          if (isOwnerName(m.author) && m.mapType === t) return true;
          // владелец мог вручную добавить чужую карту в конкретный режим
          return Array.isArray(m.inGameModes) && m.inGameModes.indexOf(t) !== -1;
        });
    if (!pool.length) return res.json(null);
    let m = pool[Math.floor(Math.random() * pool.length)];
    // не повторяем ту же карту подряд, если есть выбор
    if (pool.length > 1 && req.query.not) {
      let guard = 0;
      while (m.mapName === req.query.not && guard++ < 8)
        m = pool[Math.floor(Math.random() * pool.length)];
    }
    res.json({ mapName: m.mapName, author: m.author, mapType: m.mapType, mapData: m.mapData });
  });

  // ---------- оценка ----------
  app.post('/uploadVote', (req, res) => {
    const u = getUser(req);
    if (!u) return res.json({ status: 'error', message: 'Sign in first' });
    const m = maps.find(x => low(x.author) === low(req.body.author) &&
                             low(x.mapName) === low(req.body.mapName));
    if (!m) return res.json({ status: 'error', message: 'Map not found' });
    if (low(m.author) === low(u.name))
      return res.json({ status: 'error', message: 'You can\'t vote on your own map' });
    // мусор в запросе не должен молча превращаться в дизлайк
    const raw = parseInt(req.body.vote, 10);
    if (!(raw === 1 || raw === -1))
      return res.json({ status: 'error', message: 'Unknown vote value' });
    const v = raw;
    m.votes = m.votes || {};
    // повторный клик по той же кнопке снимает оценку
    if (m.votes[low(u.name)] === v) delete m.votes[low(u.name)];
    else { m.votes[low(u.name)] = v; require('./quests.js').track(u.name, 'map_vote'); }
    const t = retally(m);
    save();
    res.json({ status: 'success', rating: t.rating, likes: t.likes, dislikes: t.dislikes,
               myVote: m.votes[low(u.name)] || 0 });
  });

  /* Избранное — личный список игрока, а не свойство карты (в отличие от
     оценок): держим его на аккаунте (u.favoriteMaps), как friends/incoming/
     outgoing в accounts.js, а не на самой карте — так «мои избранные»
     не требует сканировать все карты в поиске своего имени. */
  app.post('/mapFavorite', (req, res) => {
    const u = getUser(req);
    if (!u) return res.json({ status: 'error', message: 'Sign in first' });
    const m = maps.find(x => low(x.author) === low(req.body.author) &&
                             low(x.mapName) === low(req.body.mapName));
    if (!m) return res.json({ status: 'error', message: 'Map not found' });
    const key = favKey(m.author, m.mapName);
    u.favoriteMaps = Array.isArray(u.favoriteMaps) ? u.favoriteMaps : [];
    const i = u.favoriteMaps.indexOf(key);
    if (i !== -1) u.favoriteMaps.splice(i, 1);
    else u.favoriteMaps.push(key);
    if (acc && typeof acc.save === 'function') acc.save();
    res.json({ status: 'success', myFavorite: i === -1 });
  });

  // ---------- удаление ----------
  function remove(author, mapName) {
    const i = maps.findIndex(x => low(x.author) === low(author) && low(x.mapName) === low(mapName));
    if (i === -1) return false;
    maps.splice(i, 1);
    save();
    return true;
  }
  // свою карту удаляет автор (вкладка «Карты» в профиле),
  // чужую — только владелец сайта
  function canDelete(u, author) {
    if (!u) return false;
    if (low(u.name) === low(author)) return true;
    return isOwnerName(u.name);
  }

  app.post('/removeMap', (req, res) => {
    const u = getUser(req);
    if (!u) return res.json({ status: 'error', message: 'Sign in first' });
    const author = String(req.body.author || u.name);
    if (!canDelete(u, author))
      return res.json({ status: 'error', message: 'You can only delete your own maps' });
    res.json({ status: remove(author, req.body.mapName) ? 'success' : 'error' });
  });

  app.post('/map/disable', (req, res) => {
    const u = getUser(req);
    if (!canDelete(u, req.body.author_name))
      return res.json({ status: 'error', message: 'You can only delete your own maps' });
    res.json({ status: remove(req.body.author_name, req.body.map_name) ? 'success' : 'error' });
  });

  // отдельный вход для владельца: удалить любую карту из Maps Browser
  app.post('/owner/removeMap', (req, res) => {
    const u = getUser(req);
    if (!u || !isOwnerName(u.name))
      return res.json({ status: 'error', message: 'Not available' });
    const author = String(req.body.author || '').trim();
    const mapName = String(req.body.mapName || '').trim();
    if (!remove(author, mapName))
      return res.json({ status: 'error', message: 'Map not found' });
    res.json({ status: 'success', message: '«' + mapName + '» deleted' });
  });

  // ---------- карты игрока (вкладка Maps в профиле) ----------
  app.get('/userMaps', (req, res) => {
    const mine = maps.filter(m => low(m.author) === low(req.query.name));
    res.json({ count: mine.length, maps: mine.map(m => {
      const t = tally(m);
      return { mapName: m.mapName, mapType: m.mapType, rating: t.rating,
               likes: t.likes, dislikes: t.dislikes, date: m.date, inGame: !!m.inGame };
    }) });
  });
}

// ---------- доступ для инструментов владельца ----------
function find(author, mapName) {
  return maps.find(x => low(x.author) === low(author) && low(x.mapName) === low(mapName));
}
/* Владелец задаёт ИТОГОВОЕ число лайков и дизлайков, а не прибавку.
   Считаем, сколько живых голосов уже есть, и подгоняем поправку так,
   чтобы на карточке вышло ровно запрошенное. Новые голоса игроков
   после этого продолжают учитываться поверх. */
function setBoost(author, mapName, likes, dislikes) {
  const m = find(author, mapName);
  if (!m) return null;

  const votes = Object.values(m.votes || {});
  const realUp = votes.filter(v => v > 0).length;
  const realDown = votes.filter(v => v < 0).length;

  if (likes !== null && likes !== undefined && likes !== '')
    m.boostLikes = Math.max(0, parseInt(likes) || 0) - realUp;
  if (dislikes !== null && dislikes !== undefined && dislikes !== '')
    m.boostDislikes = Math.max(0, parseInt(dislikes) || 0) - realDown;

  const t = retally(m);
  save();
  return t;
}
// добавить/убрать карту в конкретном игровом режиме
function setInGame(author, mapName, mode, on) {
  const m = find(author, mapName);
  if (!m) return null;
  if (MODES.indexOf(mode) === -1) return { bad: true };

  m.inGameModes = Array.isArray(m.inGameModes) ? m.inGameModes : [];
  const i = m.inGameModes.indexOf(mode);
  if (on && i === -1) m.inGameModes.push(mode);
  if (!on && i !== -1) m.inGameModes.splice(i, 1);
  save();
  return {
    modes: m.inGameModes.slice(), mode, on: !!on,
    mapName: m.mapName, author: m.author, mapType: m.mapType
  };
}
function inGameList() {
  return maps.filter(m => Array.isArray(m.inGameModes) && m.inGameModes.length)
             .map(m => ({ mapName: m.mapName, author: m.author,
                          mapType: m.mapType, modes: m.inGameModes.slice() }));
}

module.exports = { register, reload: load, MODES, OWNER, COIN_LIMIT, OBJ_LIMIT, OBJ_MIN, TEXT_MAX_RATIO, REWARD, TOOL_MODES, find, setBoost, setInGame, inGameList, tally };
