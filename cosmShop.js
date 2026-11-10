/* Косметика за монеты (идеи игроков: шляпы, плащи, крылья, след за игроком, питомец, эффект
   смерти, радужное свечение). Покупается навсегда, надевается по одной вещи на слот; что надето,
   видят все — игра спрашивает /cosm/many по никам (как скины, см. /skins/many). Рисует cosmDraw.js. */
'use strict';
const CATALOG = [
  { id: 'hat_party',     slot: 'hat',   price: 30 },
  { id: 'hat_cap',       slot: 'hat',   price: 40 },
  { id: 'hat_beanie',    slot: 'hat',   price: 40 },
  { id: 'hat_top',       slot: 'hat',   price: 80 },
  { id: 'hat_crown',     slot: 'hat',   price: 250 },
  { id: 'cape_red',      slot: 'back',  price: 60 },
  { id: 'cape_blue',     slot: 'back',  price: 60 },
  { id: 'wings_bat',     slot: 'back',  price: 150 },
  { id: 'wings_angel',   slot: 'back',  price: 200 },
  { id: 'trail_spark',   slot: 'trail', price: 80 },
  { id: 'trail_fire',    slot: 'trail', price: 120 },
  { id: 'trail_rainbow', slot: 'trail', price: 200 },
  { id: 'pet_slime',     slot: 'pet',   price: 100 },
  { id: 'pet_cat',       slot: 'pet',   price: 150 },
  { id: 'pet_dog',       slot: 'pet',   price: 150 },
  { id: 'death_confetti',slot: 'death', price: 60 },
  { id: 'death_ghost',   slot: 'death', price: 80 },
  { id: 'glow_rgb',      slot: 'glow',  price: 300 }
];
const BY_ID = {};
CATALOG.forEach(c => { BY_ID[c.id] = c; });
const SLOTS = ['hat', 'back', 'trail', 'pet', 'death', 'glow'];

function equippedOf(u) {
  const out = {};
  const c = u && u.cosm && typeof u.cosm === 'object' ? u.cosm : {};
  SLOTS.forEach(s => { if (c[s] && BY_ID[c[s]] && BY_ID[c[s]].slot === s) out[s] = c[s]; });
  return out;
}

function register(app, acc) {
  const userOf = name => acc.getDb().users[acc.key(name)];
  app.get('/cosm/shop', (req, res) => {
    const u = acc.currentUser(req);
    res.json({ items: CATALOG, owned: u && Array.isArray(u.cosmOwned) ? u.cosmOwned : [], equipped: equippedOf(u), coins: u ? u.coins || 0 : 0, signed: !!u });
  });
  app.get('/cosm/my', (req, res) => res.json(equippedOf(acc.currentUser(req))));
  app.get('/cosm/many', (req, res) => {
    const names = String(req.query.names || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 60);
    const out = {};
    names.forEach(n => { const u = userOf(n); if (u) { const e = equippedOf(u); if (Object.keys(e).length) out[n] = e; } });
    res.json({ cosm: out });
  });
  app.post('/cosm/buy', (req, res) => {
    const u = acc.currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Sign in first' });
    const it = BY_ID[String(req.body.id || '')];
    if (!it) return res.json({ status: 'error', message: 'No such item' });
    if (!Array.isArray(u.cosmOwned)) u.cosmOwned = [];
    if (u.cosmOwned.indexOf(it.id) !== -1) return res.json({ status: 'error', message: 'You already have it' });
    if ((u.coins || 0) < it.price) return res.json({ status: 'error', message: 'You need ' + (it.price - (u.coins || 0)) + ' more coins' });
    u.coins -= it.price;
    u.cosmOwned.push(it.id);
    if (!u.cosm || typeof u.cosm !== 'object') u.cosm = {};
    u.cosm[it.slot] = it.id;                 // купил — сразу надето
    acc.save();
    res.json({ status: 'success', coins: u.coins, owned: u.cosmOwned, equipped: equippedOf(u) });
  });
  app.post('/cosm/equip', (req, res) => {
    const u = acc.currentUser(req);
    if (!u) return res.json({ status: 'error', message: 'Sign in first' });
    const slot = String(req.body.slot || ''), id = String(req.body.id || '');
    if (SLOTS.indexOf(slot) === -1) return res.json({ status: 'error', message: 'No such slot' });
    if (!u.cosm || typeof u.cosm !== 'object') u.cosm = {};
    if (!id) delete u.cosm[slot];
    else {
      const it = BY_ID[id];
      if (!it || it.slot !== slot || !Array.isArray(u.cosmOwned) || u.cosmOwned.indexOf(id) === -1)
        return res.json({ status: 'error', message: 'Buy it first' });
      u.cosm[slot] = id;
    }
    acc.save();
    res.json({ status: 'success', equipped: equippedOf(u) });
  });
}

module.exports = { register, CATALOG, equippedOf };
