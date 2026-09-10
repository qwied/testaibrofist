// ============ СКИНЫ: разовый возврат монет за старый каталог деталей ============
/* Раньше здесь жил каталог покупных деталей (шляпы, костюмы — 128 штук)
   и вся система "надень голову + тело". Её убрали: теперь скин — это
   картинка, которую игрок рисует сам в Skin Editor (см. userSkins.js —
   /skin/drawing, /skins/publish). Этот файл остался только для того,
   чтобы один раз вернуть монеты тем, кто успел купить деталь каталога:
   без возврата их покупка просто пропадала бы бесследно.

   LEGACY_PRICES — цены удалённых деталей (id -> монеты), только для
   разового возврата. Сам каталог (картинки, названия, координаты) не
   нужен: игрок получает деньги назад, а не деталь. */
const LEGACY_PRICES = {
  h_wizard:22, h_viking:20, h_king:28, h_pharaoh:26, h_dots:14, h_phoenix:26,
  h_lepre:24, h_skater:18, h_artist:12, h_emerald:16, h_candle:16, h_paint:10,
  h_shade:20, h_smile:10, h_green_pl:22, h_lady:22, h_bunnyhd:20, h_red_pl:22,
  h_deer:24, h_skier:14, h_crimson:500, h_frost:26, h_totem:22, h_azure:24,
  h_nomad:18, h_elkwar:26, h_chief:24, h_owl:22, h_furry:20, h_moth1:24,
  h_rabbit:14, h_puppy:14, h_catninja:24, h_reaper:24, h_moth2:22, h_bluewolf:24,
  h_raven:22, h_sailor:14, h_pirate:24, h_bonedrag:28, h_prince:24, h_clown:20,
  h_vampire:20, h_priest:16, h_forest:22, h_glitch:18, h_sunset:8, h_popit:14,
  h_toxic:16, h_nerd:12, h_shards:14, h_aqua:16, h_wire:14, h_dashed:8,
  h_pastel:24, h_fox:20, h_slasher:20, h_beach:10, h_cat:18, h_zombie:20,
  h_mummy:16, h_crest_r:14, h_crest_f:16, h_check:10,
  b_wizard:24, b_viking:22, b_king:30, b_pharaoh:20, b_dots:16, b_phoenix:26,
  b_lepre:22, b_skater:18, b_artist:14, b_emerald:18, b_baker:12, b_candle:16,
  b_paint:12, b_shade:20, b_smile:8, b_green_pl:22, b_lady:24, b_bunnyhd:14,
  b_red_pl:22, b_deer:18, b_skier:10, b_crimson:500, b_frost:28, b_totem:22,
  b_azure:24, b_nomad:22, b_elkwar:26, b_chief:26, b_owl:24, b_furry:22,
  b_moth1:24, b_catninja:22, b_reaper:24, b_moth2:24, b_bluewolf:24, b_raven:22,
  b_sailor:14, b_pirate:22, b_bonedrag:26, b_judo:14, b_prince:26, b_clown:22,
  b_vampire:24, b_priest:18, b_forest:22, b_glitch:18, b_sunset:10, b_popit:16,
  b_toxic:18, b_nerd:14, b_shards:16, b_aqua:20, b_wire:16, b_dashed:8,
  b_pastel:26, b_fox:18, b_slasher:18, b_beach:10, b_cat:18, b_zombie:20,
  b_mummy:16, b_crest_r:12, b_crest_f:14, b_check:8
};

/* Разовая миграция: суммируем цены всех купленных деталей (u.items) и
   возвращаем монетами, снимаем деталь-костюм с игрока (он больше ничего
   не значит — h_wizard/b_king и т.д. без каталога не отрисуются) и
   помечаем аккаунт, чтобы не вернуть монеты дважды при следующем старте. */
function refundCatalog(u) {
  if (!u || u.catalogRefunded) return;
  u.catalogRefunded = 1;
  const items = Array.isArray(u.items) ? u.items : [];
  let refund = 0;
  items.forEach(id => { if (LEGACY_PRICES[id]) refund += LEGACY_PRICES[id]; });
  if (refund) u.coins = (u.coins || 0) + refund;
  delete u.items;
  // старый скин ссылался на детали каталога — их больше нет, сбрасываем
  if (u.skin && (u.skin.head || u.skin.body)) delete u.skin;
}

module.exports = { refundCatalog, LEGACY_PRICES };
