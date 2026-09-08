// ============ СКИНЫ: каталог деталей, цены и экипировка ============
// У каждого аксессуара своя цена: от 5 монет за простые до 30 за
// самые крутые. «Ничего» и базовые мелочи бесплатны, остальное
// покупается за монеты один раз и остаётся навсегда.

// Цвет персонажа задаёт игра (в прятках он показывает роль),
// поэтому в редакторе только аксессуары.
const SLOTS = ['head', 'face', 'body', 'back'];

const CATALOG = [
  // ---------- голова ----------
  { id: 'h_none',     slot: 'head', price: 0,  name: 'Ничего' },
  { id: 'h_cap',      slot: 'head', price: 7, name: 'Кепка',        v: '#e04141' },
  { id: 'h_beanie',   slot: 'head', price: 8, name: 'Шапка',        v: '#8b5cf6' },
  { id: 'h_bandana',  slot: 'head', price: 7, name: 'Бандана',      v: '#f08a24' },
  { id: 'h_helmet',   slot: 'head', price: 15, name: 'Шлем',         v: '#5b6673' },
  { id: 'h_cowboy',   slot: 'head', price: 13, name: 'Шляпа',        v: '#8b5a2b' },
  { id: 'h_tophat',   slot: 'head', price: 19, name: 'Цилиндр',      v: '#1f2937' },
  { id: 'h_horns',    slot: 'head', price: 16, name: 'Рога',         v: '#c2410c' },
  { id: 'h_halo',     slot: 'head', price: 26, name: 'Нимб',         v: '#ffd83d' },
  { id: 'h_crown',    slot: 'head', price: 30, name: 'Корона',      v: '#d4a017' },
  { id: 'h_ears',     slot: 'head', price: 10, name: 'Ушки',         v: '#f472b6' },
  { id: 'h_antenna',  slot: 'head', price: 12, name: 'Антенна',      v: '#06b6d4' },
  { id: 'h_hair',     slot: 'head', price: 8, name: 'Причёска',     v: '#4b2e1e' },
  { id: 'h_bowler',   slot: 'head', price: 13, name: 'Котелок',      v: '#1f2937' },
  { id: 'h_straw',    slot: 'head', price: 10, name: 'Соломенная шляпа', v: '#eab308' },
  { id: 'h_pirate',   slot: 'head', price: 23, name: 'Пиратская шляпа',  v: '#111827' },
  { id: 'h_wizard',   slot: 'head', price: 27, name: 'Шляпа волшебника', v: '#6d28d9' },
  { id: 'h_army',     slot: 'head', price: 16, name: 'Армейская каска',  v: '#4d7c0f' },
  { id: 'h_hardhat',  slot: 'head', price: 13, name: 'Строительная каска', v: '#f59e0b' },
  { id: 'h_chef',     slot: 'head', price: 12, name: 'Колпак повара',    v: '#f8fafc' },
  { id: 'h_police',   slot: 'head', price: 18, name: 'Фуражка',      v: '#1e3a8a' },
  { id: 'h_viking',   slot: 'head', price: 25, name: 'Шлем викинга', v: '#6b7280' },
  { id: 'h_ushanka',  slot: 'head', price: 15, name: 'Ушанка',       v: '#8b5a2b' },
  { id: 'h_santa',    slot: 'head', price: 28, name: 'Шапка Деда Мороза', v: '#e04141' },
  { id: 'h_bucket',   slot: 'head', price: 10, name: 'Панама',       v: '#22a45d' },
  { id: 'h_mohawk',   slot: 'head', price: 18, name: 'Ирокез',       v: '#ec4899' },
  { id: 'h_headphones', slot: 'head', price: 19, name: 'Наушники',   v: '#111827' },
  { id: 'h_headband', slot: 'head', price: 8, name: 'Спортивная повязка', v: '#2563eb' },
  { id: 'h_bow',      slot: 'head', price: 7, name: 'Бантик',       v: '#f472b6' },
  { id: 'h_flower',   slot: 'head', price: 8, name: 'Цветок',       v: '#fb7185' },
  { id: 'h_propeller', slot: 'head', price: 20, name: 'Пропеллер',   v: '#06b6d4' },
  { id: 'h_unicorn',  slot: 'head', price: 22, name: 'Рог единорога', v: '#fbbf24' },

  // ---------- лицо ----------
  { id: 'f_none',     slot: 'face', price: 0,  name: 'Ничего' },
  { id: 'f_glasses',  slot: 'face', price: 8, name: 'Очки',        v: '#374151' },
  { id: 'f_shades',   slot: 'face', price: 15, name: 'Тёмные очки', v: '#111827' },
  { id: 'f_visor',    slot: 'face', price: 16, name: 'Визор',       v: '#06b6d4' },
  { id: 'f_mask',     slot: 'face', price: 10, name: 'Маска',       v: '#22a45d' },
  { id: 'f_eyepatch', slot: 'face', price: 12, name: 'Повязка',     v: '#111827' },
  { id: 'f_scarf',    slot: 'face', price: 10, name: 'Шарф',        v: '#b91c1c' },
  { id: 'f_snorkel',  slot: 'face', price: 15, name: 'Маска для ныряния', v: '#f59e0b' },
  { id: 'f_round',    slot: 'face', price: 10, name: 'Круглые очки', v: '#374151' },
  { id: 'f_monocle',  slot: 'face', price: 18, name: 'Монокль',      v: '#d4a017' },
  { id: 'f_ninja',    slot: 'face', price: 16, name: 'Маска ниндзя', v: '#111827' },
  { id: 'f_war',      slot: 'face', price: 7, name: 'Боевая раскраска', v: '#16a34a' },
  { id: 'f_freckles', slot: 'face', price: 5, name: 'Веснушки',     v: '#b45309' },
  { id: 'f_blush',    slot: 'face', price: 5, name: 'Румянец',      v: '#fb7185' },
  { id: 'f_beard',    slot: 'face', price: 12, name: 'Борода',       v: '#4b2e1e' },
  { id: 'f_mustache', slot: 'face', price: 8, name: 'Усы',          v: '#4b2e1e' },
  { id: 'f_pipe',     slot: 'face', price: 13, name: 'Трубка',       v: '#8b5a2b' },
  { id: 'f_lolli',    slot: 'face', price: 10, name: 'Леденец',      v: '#e04141' },
  { id: 'f_bandage',  slot: 'face', price: 5, name: 'Пластырь',     v: '#fde68a' },
  { id: 'f_gas',      slot: 'face', price: 20, name: 'Противогаз',   v: '#5b6673' },

  // ---------- тело ----------
  { id: 'b_none',     slot: 'body', price: 0,  name: 'Ничего' },
  { id: 'b_tie',      slot: 'body', price: 8, name: 'Галстук',      v: '#b91c1c' },
  { id: 'b_belt',     slot: 'body', price: 7, name: 'Ремень',       v: '#3f3f46' },
  { id: 'b_stripes',  slot: 'body', price: 5, name: 'Полоски',      v: '#e5e7eb' },
  { id: 'b_vest',     slot: 'body', price: 12, name: 'Жилет',        v: '#f59e0b' },
  { id: 'b_number',   slot: 'body', price: 10, name: 'Номер',        v: '#2563eb' },
  { id: 'b_hoodie',   slot: 'body', price: 18, name: 'Худи',         v: '#374151' },
  { id: 'b_armor',    slot: 'body', price: 23, name: 'Броня',        v: '#94a3b8' },
  { id: 'b_suit',     slot: 'body', price: 22, name: 'Костюм',       v: '#1f2937' },
  { id: 'b_overall',  slot: 'body', price: 15, name: 'Комбинезон',   v: '#3b5bdb' },
  { id: 'b_bowtie',   slot: 'body', price: 8, name: 'Бабочка',      v: '#111827' },
  { id: 'b_button',   slot: 'body', price: 5, name: 'Пуговицы',     v: '#f8fafc' },
  { id: 'b_zip',      slot: 'body', price: 7, name: 'Молния',       v: '#e5e7eb' },
  { id: 'b_star',     slot: 'body', price: 13, name: 'Звезда',       v: '#fbbf24' },
  { id: 'b_heart',    slot: 'body', price: 13, name: 'Сердце',       v: '#e04141' },
  { id: 'b_skull',    slot: 'body', price: 19, name: 'Череп',        v: '#f8fafc' },
  { id: 'b_bolt',     slot: 'body', price: 10, name: 'Молния-шрам',  v: '#fde047' },
  { id: 'b_pocket',   slot: 'body', price: 7, name: 'Карманы',      v: '#e5e7eb' },
  { id: 'b_splash',   slot: 'body', price: 8, name: 'Кляксы',       v: '#22a45d' },
  { id: 'b_camo',     slot: 'body', price: 16, name: 'Камуфляж',     v: '#4d7c0f' },
  { id: 'b_suspenders', slot: 'body', price: 10, name: 'Подтяжки',   v: '#111827' },
  { id: 'b_sash',     slot: 'body', price: 12, name: 'Лента',        v: '#b91c1c' },
  { id: 'b_medal',    slot: 'body', price: 16, name: 'Медаль',       v: '#d4a017' },
  { id: 'b_bandolier', slot: 'body', price: 15, name: 'Патронташ',  v: '#8b5a2b' },
  { id: 'b_chain',    slot: 'body', price: 20, name: 'Цепь',         v: '#d4a017' },

  // ---------- за спиной ----------
  { id: 'k_none',     slot: 'back', price: 0,  name: 'Ничего' },
  { id: 'k_cape',     slot: 'back', price: 25, name: 'Плащ',         v: '#b91c1c' },
  { id: 'k_wings',    slot: 'back', price: 29, name: 'Крылья',       v: '#f8fafc' },
  { id: 'k_jetpack',  slot: 'back', price: 30, name: 'Джетпак',     v: '#5b6673' },
  { id: 'k_bag',      slot: 'back', price: 12, name: 'Рюкзак',       v: '#22a45d' },
  { id: 'k_tail',     slot: 'back', price: 13, name: 'Хвост',        v: '#f97316' },
  { id: 'k_shell',    slot: 'back', price: 18, name: 'Панцирь',      v: '#16a34a' },
  { id: 'k_butterfly', slot: 'back', price: 22, name: 'Крылья бабочки', v: '#f472b6' },
  { id: 'k_bat',      slot: 'back', price: 20, name: 'Крылья мыши',  v: '#374151' },
  { id: 'k_quiver',   slot: 'back', price: 16, name: 'Колчан',       v: '#8b5a2b' },
  { id: 'k_sword',    slot: 'back', price: 26, name: 'Меч',          v: '#94a3b8' },
  { id: 'k_shield',   slot: 'back', price: 19, name: 'Щит',          v: '#2563eb' },
  { id: 'k_axe',      slot: 'back', price: 23, name: 'Топор',        v: '#94a3b8' },
  { id: 'k_balloon',  slot: 'back', price: 15, name: 'Воздушный шар', v: '#e04141' },
  { id: 'k_parrot',   slot: 'back', price: 27, name: 'Попугай',      v: '#22a45d' },
  { id: 'k_fairy',    slot: 'back', price: 28, name: 'Крылья феи',   v: '#a5f3fc' },
  { id: 'k_skateboard', slot: 'back', price: 18, name: 'Скейтборд', v: '#f59e0b' }
];

const BY_ID = {};
CATALOG.forEach(i => { BY_ID[i.id] = i; });

const DEFAULT_SKIN = { head: 'h_none', face: 'f_none', body: 'b_none', back: 'k_none' };

// что игрок может надеть прямо сейчас: всё бесплатное + купленное
function ownedList(u) {
  const own = CATALOG.filter(i => !i.price).map(i => i.id);
  if (u && Array.isArray(u.items)) own.push(...u.items);
  return own;
}
function isOwned(u, id) {
  const it = BY_ID[id];
  if (!it) return false;
  if (!it.price) return true;
  return !!(u && Array.isArray(u.items) && u.items.indexOf(id) !== -1);
}

function normalize(raw) {
  const s = Object.assign({}, DEFAULT_SKIN, raw || {});
  SLOTS.forEach(sl => {
    if (!BY_ID[s[sl]] || BY_ID[s[sl]].slot !== sl) s[sl] = DEFAULT_SKIN[sl];
  });
  // лишние слоты из старых версий выкидываем
  const out = {};
  SLOTS.forEach(sl => { out[sl] = s[sl]; });
  return out;
}

function skinOf(u) { return normalize(u && u.skin); }

// подпись комплекта — по ней ловим повторы при публикации
function signature(skin) {
  const s = normalize(skin);
  return SLOTS.map(sl => s[sl]).join('|');
}

/* Одноразовая миграция: всё, что игрок уже носит, становится его вещью.
   Никто не теряет надетое из-за ввода цен — покупать нужно только новое. */
function grantWorn(u) {
  if (!u || u.itemsGranted) return;
  u.items = Array.isArray(u.items) ? u.items : [];
  const s = skinOf(u);
  SLOTS.forEach(sl => {
    const it = BY_ID[s[sl]];
    if (it && it.price && u.items.indexOf(it.id) === -1) u.items.push(it.id);
  });
  u.itemsGranted = 1;
}

function register(app, acc) {
  const { currentUser, getDb, save, key } = acc;

  app.get('/skin/catalog', (req, res) => {
    const u = currentUser(req);
    if (u) { grantWorn(u); save(); }
    res.json({
      slots: SLOTS,
      items: CATALOG,
      owned: ownedList(u),
      skin: skinOf(u),
      img: (u && u.skinImg) || '',
      coins: u ? (u.coins || 0) : 0,
      guest: !u
    });
  });

  app.get('/skin/of', (req, res) => {
    const db = getDb();
    const u = db.users[key(req.query.name)];
    res.json({ skin: skinOf(u), img: (u && u.skinImg) || '', name: u ? u.name : '' });
  });

  // скины сразу нескольких игроков — для списков друзей и таблиц
  app.get('/skins/many', (req, res) => {
    const db = getDb();
    const names = String(req.query.names || '')
      .split(',').map(n => n.trim()).filter(Boolean).slice(0, 60);
    const out = {};
    names.forEach(n => {
      const u = db.users[key(n)];
      if (!u) return;
      const sk = skinOf(u);
      if (u.skinImg) sk.img = u.skinImg;   // скин-картинка от владельца
      out[n] = sk;
    });
    res.json({ skins: out });
  });

  // надеть деталь. Дорогая — только если куплена
  app.post('/skin/equip', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', code: 'guest' });
    grantWorn(u);
    const item = BY_ID[String(req.body.id || '')];
    const slot = String(req.body.slot || '');
    if (!item || item.slot !== slot) return res.json({ status: 'error', code: 'noitem' });

    if (!isOwned(u, item.id))
      return res.json({ status: 'error', code: 'buy', price: item.price,
                        message: 'Сначала купите эту вещь за ' + item.price + ' монет' });

    u.skin = skinOf(u);
    u.skin[slot] = item.id;
    u.wearing = ''; delete u.skinImg;   // сняли готовый скин из Avatar
    save();
    res.json({ status: 'success', skin: u.skin });
  });

  // купить деталь: монеты списываются, вещь остаётся навсегда и сразу надевается
  app.post('/skin/buy', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', code: 'guest',
                              message: 'Сначала войдите в аккаунт' });
    grantWorn(u);
    const item = BY_ID[String(req.body.id || '')];
    if (!item) return res.json({ status: 'error', message: 'Вещь не найдена' });
    if (!item.price) return res.json({ status: 'error', message: 'Эта вещь бесплатна' });

    u.items = Array.isArray(u.items) ? u.items : [];
    if (u.items.indexOf(item.id) !== -1)
      return res.json({ status: 'error', message: 'Эта вещь уже ваша' });

    if ((u.coins || 0) < item.price)
      return res.json({ status: 'error', code: 'coins',
                        message: 'Не хватает ' + (item.price - (u.coins || 0)) + ' монет' });

    u.coins = (u.coins || 0) - item.price;
    u.items.push(item.id);
    // купили — сразу надели
    u.skin = skinOf(u);
    u.skin[item.slot] = item.id;
    u.wearing = ''; delete u.skinImg;
    save();
    res.json({ status: 'success', coins: u.coins, skin: u.skin, owned: ownedList(u) });
  });

  app.post('/skin/save', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'error', code: 'guest' });
    grantWorn(u);
    let want = {};
    try { want = JSON.parse(String(req.body.skin || '{}')); } catch (e) {}
    const s = normalize(want);
    // незакупленные дорогие детали в сохранённый комплект не попадают
    SLOTS.forEach(sl => {
      if (!isOwned(u, s[sl])) s[sl] = DEFAULT_SKIN[sl];
    });
    u.skin = s;
    u.wearing = ''; delete u.skinImg;
    save();
    res.json({ status: 'success', skin: u.skin });
  });
}

module.exports = {
  register, CATALOG, SLOTS, DEFAULT_SKIN, BY_ID,
  skinOf, ownedList, isOwned, normalize, signature, grantWorn
};
