// ============ СКИНЫ: каталог деталей, цены и экипировка ============
// Костюм состоит из двух деталей — голова и тело. У каждой своя цена:
// от 5 монет за самые простые до 30 за самые нарядные. «Ничего»
// бесплатно, остальное покупается за монеты один раз и остаётся навсегда.
// Отдельно стоит багровый комплект — по 500 монет за деталь.

// Цвет персонажа задаёт игра (в прятках он показывает роль),
// поэтому в редакторе только детали костюма.
const SLOTS = ['head', 'body'];

const CATALOG = [
  // ---------- голова ----------
  { id: 'h_none', slot: 'head', price: 0, name: 'Ничего' },
  { id: 'h_wizard', slot: 'head', price: 22, name: 'Колпак звездочёта', img: 's1_r1_00_head.webp', x: -0.93, y: -54.04, w: 101.39, h: 162.04 },
  { id: 'h_viking', slot: 'head', price: 20, name: 'Рогатый шлем', img: 's1_r1_01_head.webp', x: -26.05, y: -37.12, w: 152.56, h: 145.12 },
  { id: 'h_king', slot: 'head', price: 28, name: 'Золотая корона', img: 's1_r1_02_head.webp', x: -34.1, y: -28.87, w: 113.82, h: 80.18 },
  { id: 'h_pharaoh', slot: 'head', price: 26, name: 'Убор фараона', img: 's1_r1_03_head.webp', x: -36.74, y: -41.77, w: 171.16, h: 149.77 },
  { id: 'h_dots', slot: 'head', price: 14, name: 'Бант в горошек', img: 's1_r1_04_head.webp', x: -41.86, y: -49.21, w: 185.58, h: 123.26 },
  { id: 'h_phoenix', slot: 'head', price: 26, name: 'Голова феникса', img: 's1_r1_05_head.webp', x: -33.33, y: -0.77, w: 179.82, h: 108.77 },
  { id: 'h_lepre', slot: 'head', price: 24, name: 'Цилиндр лепрекона', img: 's1_r1_06_head.webp', x: -23.04, y: -52.83, w: 139.63, h: 160.83 },
  { id: 'h_skater', slot: 'head', price: 18, name: 'Патлы и очки', img: 's1_r1_07_head.webp', x: -18.64, y: 9.82, w: 145, h: 98.18 },
  { id: 'h_artist', slot: 'head', price: 12, name: 'Художественный берет', img: 's1_r1_08_head.webp', x: 5.61, y: -14.43, w: 104.21, h: 79.91 },
  { id: 'h_emerald', slot: 'head', price: 16, name: 'Зелёная шляпа', img: 's1_r1_09_head.webp', x: -18.89, y: -26.56, w: 136.87, h: 134.56 },
  { id: 'h_candle', slot: 'head', price: 16, name: 'Огонёк свечи', img: 's1_r2_11_head.webp', x: -3.23, y: -57.9, w: 107.37, h: 165.9 },
  { id: 'h_paint', slot: 'head', price: 10, name: 'Мазки краски', img: 's1_r2_12_head.webp', x: -2.79, y: 17.3, w: 105.12, h: 90.7 },
  { id: 'h_shade', slot: 'head', price: 20, name: 'Рогатая тень', img: 's1_r2_13_head.webp', x: -38.68, y: -36.44, w: 174.49, h: 144.44 },
  { id: 'h_smile', slot: 'head', price: 10, name: 'Смайлик в очках', img: 's1_r2_14_head.webp', x: -1.86, y: 4.28, w: 104.19, h: 103.72 },
  { id: 'h_green_pl', slot: 'head', price: 22, name: 'Зелёная кепка', img: 's1_r2_15_head.webp', x: -3.69, y: -12.74, w: 105.99, h: 120.74 },
  { id: 'h_lady', slot: 'head', price: 22, name: 'Шляпка с цветами', img: 's1_r2_16_head.webp', x: -43.84, y: -5.7, w: 168.95, h: 113.24 },
  { id: 'h_bunnyhd', slot: 'head', price: 20, name: 'Капюшон-зайчик', img: 's1_r2_17_head.webp', x: -26.48, y: -35.84, w: 149.77, h: 143.84 },
  { id: 'h_red_pl', slot: 'head', price: 22, name: 'Красная кепка', img: 's1_r2_18_head.webp', x: -1.38, y: 10.3, w: 105.99, h: 97.7 },
  { id: 'h_deer', slot: 'head', price: 24, name: 'Глаз с рогами', img: 's1_r2_19_head.webp', x: -40, y: -53.86, w: 180.93, h: 161.86 },
  { id: 'h_skier', slot: 'head', price: 14, name: 'Лыжная маска', img: 's1_r2_20_head.webp', x: -1.86, y: 8.93, w: 102.79, h: 99.07 },
  { id: 'h_crimson', slot: 'head', price: 500, name: 'Багровая голова', img: 's1_r2_21_head.webp', x: -0.92, y: 7.08, w: 100.92, h: 100.92 },
  { id: 'h_frost', slot: 'head', price: 26, name: 'Шлем ледяного стража', img: 's2_r1_00_head.webp', x: 2.18, y: -20.38, w: 95.63, h: 128.38 },
  { id: 'h_totem', slot: 'head', price: 22, name: 'Деревянный тотем', img: 's2_r1_01_head.webp', x: -12.96, y: -63.3, w: 125.93, h: 171.3 },
  { id: 'h_azure', slot: 'head', price: 24, name: 'Голова лазурного зверя', img: 's2_r1_02_head.webp', x: 9.45, y: -30.25, w: 110.6, h: 138.25 },
  { id: 'h_nomad', slot: 'head', price: 18, name: 'Красная повязка', img: 's2_r1_03_head.webp', x: -18.47, y: -36.14, w: 118.47, h: 144.14 },
  { id: 'h_elkwar', slot: 'head', price: 26, name: 'Шлем с рогами лося', img: 's2_r1_04_head.webp', x: -36.11, y: -42.46, w: 172.22, h: 150.46 },
  { id: 'h_chief', slot: 'head', price: 24, name: 'Маска вождя', img: 's2_r1_05_head.webp', x: -15.84, y: 5.29, w: 128.51, h: 102.71 },
  { id: 'h_owl', slot: 'head', price: 22, name: 'Морда совы', img: 's2_r1_06_head.webp', x: -9.26, y: 6.61, w: 118.52, h: 101.39 },
  { id: 'h_furry', slot: 'head', price: 20, name: 'Мохнатая маска', img: 's2_r1_07_head.webp', x: -7.23, y: -29.35, w: 126.1, h: 137.35 },
  { id: 'h_moth1', slot: 'head', price: 24, name: 'Голова мотылька', img: 's2_r1_08_head.webp', x: -30.56, y: -50.8, w: 160.65, h: 158.8 },
  { id: 'h_rabbit', slot: 'head', price: 14, name: 'Мордочка кролика', img: 's2_r1_09_head.webp', x: -14.75, y: -54.67, w: 129.03, h: 162.67 },
  { id: 'h_puppy', slot: 'head', price: 14, name: 'Мордочка пёсика', img: 's2_r1_10_head.webp', x: -6.91, y: -5.36, w: 113.82, h: 113.36 },
  { id: 'h_catninja', slot: 'head', price: 24, name: 'Шлем кота-ниндзя', img: 's2_r1_11_head.webp', x: -19.44, y: -40.15, w: 139.35, h: 148.15 },
  { id: 'h_reaper', slot: 'head', price: 24, name: 'Маска белого жнеца', img: 's2_r1_12_head.webp', x: -40.27, y: -7.93, w: 179.65, h: 115.93 },
  { id: 'h_moth2', slot: 'head', price: 22, name: 'Усики мотылька', img: 's2_r2_13_head.webp', x: -30.38, y: -8.54, w: 160.77, h: 116.54 },
  { id: 'h_bluewolf', slot: 'head', price: 24, name: 'Голова синего волка', img: 's2_r2_14_head.webp', x: -23.96, y: -41.31, w: 149.31, h: 149.31 },
  { id: 'h_raven', slot: 'head', price: 22, name: 'Морда ворона', img: 's2_r2_15_head.webp', x: -25.45, y: -29.27, w: 152.73, h: 137.27 },
  { id: 'h_sailor', slot: 'head', price: 14, name: 'Красная бандана', img: 's2_r2_16_head.webp', x: -12.04, y: 1.06, w: 112.5, h: 106.94 },
  { id: 'h_pirate', slot: 'head', price: 24, name: 'Пиратская треуголка', img: 's2_r2_17_head.webp', x: -17.89, y: -21.36, w: 136.24, h: 129.36 },
  { id: 'h_bonedrag', slot: 'head', price: 28, name: 'Череп дракона', img: 's2_r2_18_head.webp', x: -42.11, y: -24.46, w: 154.39, h: 132.46 },
  { id: 'h_prince', slot: 'head', price: 24, name: 'Золотая диадема', img: 's2_r2_20_head.webp', x: -13.59, y: 7.54, w: 113.82, h: 100.46 },
  { id: 'h_clown', slot: 'head', price: 20, name: 'Клоунский парик', img: 's2_r2_21_head.webp', x: -26.39, y: -17.93, w: 147.22, h: 125.93 },
  { id: 'h_vampire', slot: 'head', price: 20, name: 'Чёрный цилиндр', img: 's2_r2_22_head.webp', x: -14.29, y: -51.91, w: 124.88, h: 159.91 },
  { id: 'h_priest', slot: 'head', price: 16, name: 'Венок жреца', img: 's2_r2_23_head.webp', x: -6.94, y: 7.07, w: 113.89, h: 100.93 },
  { id: 'h_forest', slot: 'head', price: 22, name: 'Багряная корона', img: 's2_r2_24_head.webp', x: -17.13, y: -51.72, w: 134.26, h: 159.26 },
  { id: 'h_glitch', slot: 'head', price: 18, name: 'Глитч-голова', img: 's3_r1_00_head.webp', x: -21.2, y: 30.12, w: 137.79, h: 77.88 },
  { id: 'h_sunset', slot: 'head', price: 8, name: 'Оранжевый шар', img: 's3_r1_01_head.webp', x: 1.38, y: 9.38, w: 99.08, h: 98.62 },
  { id: 'h_popit', slot: 'head', price: 14, name: 'Радужный поп-ит', img: 's3_r1_02_head.webp', x: 3.23, y: 14.45, w: 93.55, h: 93.55 },
  { id: 'h_toxic', slot: 'head', price: 16, name: 'Знак радиации', img: 's3_r1_03_head.webp', x: -1.47, y: 12.41, w: 101.47, h: 95.59 },
  { id: 'h_nerd', slot: 'head', price: 12, name: 'Смайлик-ботаник', img: 's3_r1_04_head.webp', x: 0, y: 8.47, w: 114.42, h: 99.53 },
  { id: 'h_shards', slot: 'head', price: 14, name: 'Осколки стекла', img: 's3_r1_05_head.webp', x: 5.76, y: -1.68, w: 94.47, h: 109.68 },
  { id: 'h_aqua', slot: 'head', price: 16, name: 'Крышка аквариума', img: 's3_r1_06_head.webp', x: 0.93, y: 9.85, w: 98.15, h: 98.15 },
  { id: 'h_wire', slot: 'head', price: 14, name: 'Каркас головы', img: 's3_r1_07_head.webp', x: 0.8, y: -12.4, w: 127.2, h: 120.4 },
  { id: 'h_dashed', slot: 'head', price: 8, name: 'Пунктирная голова', img: 's3_r1_08_head.webp', x: 1.61, y: 49.01, w: 95.39, h: 58.99 },
  { id: 'h_pastel', slot: 'head', price: 24, name: 'Пастельные цветы', img: 's3_r2_11_head.webp', x: -30.7, y: -40.84, w: 160, h: 148.84 },
  { id: 'h_fox', slot: 'head', price: 20, name: 'Мордочка лиса', img: 's3_r2_12_head.webp', x: -19.63, y: -42, w: 160.28, h: 150 },
  { id: 'h_slasher', slot: 'head', price: 20, name: 'Хоккейная маска', img: 's3_r2_13_head.webp', x: -37.38, y: -1.81, w: 139.72, h: 109.81 },
  { id: 'h_beach', slot: 'head', price: 10, name: 'Соломенная макушка', img: 's3_r2_14_head.webp', x: 3.67, y: 14.88, w: 92.66, h: 93.12 },
  { id: 'h_cat', slot: 'head', price: 18, name: 'Мордочка кота', img: 's3_r2_16_head.webp', x: -3.21, y: 7.54, w: 106.42, h: 100.46 },
  { id: 'h_zombie', slot: 'head', price: 20, name: 'Голова зомби', img: 's3_r2_17_head.webp', x: -3.5, y: 2.5, w: 106.5, h: 105.5 },
  { id: 'h_mummy', slot: 'head', price: 16, name: 'Бинты на голове', img: 's3_r2_18_head.webp', x: -4.15, y: -3.52, w: 108.29, h: 111.52 },
  { id: 'h_crest_r', slot: 'head', price: 14, name: 'Багровый герб', img: 's3_r2_19_head.webp', x: -1.86, y: 5.21, w: 103.72, h: 102.79 },
  { id: 'h_crest_f', slot: 'head', price: 16, name: 'Огненный герб', img: 's3_r2_20_head.webp', x: -13.95, y: -19.44, w: 127.44, h: 127.44 },
  { id: 'h_check', slot: 'head', price: 10, name: 'Зелёная галочка', img: 's3_r2_21_head.webp', x: -1.86, y: 4.28, w: 104.19, h: 103.72 },
  // ---------- тело ----------
  { id: 'b_none', slot: 'body', price: 0, name: 'Ничего' },
  { id: 'b_wizard', slot: 'body', price: 24, name: 'Звёздная мантия', img: 's1_r1_00_body.webp', x: 0, y: 122.35, w: 100, h: 215.74 },
  { id: 'b_viking', slot: 'body', price: 22, name: 'Боевая секира', img: 's1_r1_01_body.webp', x: -35.81, y: 108, w: 182.79, h: 231.16 },
  { id: 'b_king', slot: 'body', price: 30, name: 'Королевская мантия', img: 's1_r1_02_body.webp', x: -57.14, y: 108, w: 214.29, h: 243.32 },
  { id: 'b_pharaoh', slot: 'body', price: 20, name: 'Пояс фараона', img: 's1_r1_03_body.webp', x: -5.58, y: 108, w: 112.56, h: 220.93 },
  { id: 'b_dots', slot: 'body', price: 16, name: 'Сумочка в горошек', img: 's1_r1_04_body.webp', x: -48.84, y: 117.77, w: 148.84, h: 221.4 },
  { id: 'b_phoenix', slot: 'body', price: 26, name: 'Огненное оперение', img: 's1_r1_05_body.webp', x: -37.28, y: 114.14, w: 148.68, h: 211.84 },
  { id: 'b_lepre', slot: 'body', price: 22, name: 'Костюм лепрекона', img: 's1_r1_06_body.webp', x: -0.46, y: 122.75, w: 100.46, h: 215.21 },
  { id: 'b_skater', slot: 'body', price: 18, name: 'Белое худи', img: 's1_r1_07_body.webp', x: -7.73, y: 108, w: 117.27, h: 243.18 },
  { id: 'b_artist', slot: 'body', price: 14, name: 'Синий жилет', img: 's1_r1_08_body.webp', x: -0.93, y: 122.95, w: 101.87, h: 178.5 },
  { id: 'b_emerald', slot: 'body', price: 18, name: 'Изумрудный смокинг', img: 's1_r1_09_body.webp', x: 0, y: 121.82, w: 100, h: 215.67 },
  { id: 'b_baker', slot: 'body', price: 12, name: 'Фартук пекаря', img: 's1_r1_10_body.webp', x: -0.47, y: 115.91, w: 100.47, h: 224.19 },
  { id: 'b_candle', slot: 'body', price: 16, name: 'Восковая свеча', img: 's1_r2_11_body.webp', x: -1.38, y: 108, w: 101.84, h: 226.73 },
  { id: 'b_paint', slot: 'body', price: 12, name: 'Холст художника', img: 's1_r2_12_body.webp', x: 0, y: 122.88, w: 100, h: 216.28 },
  { id: 'b_shade', slot: 'body', price: 20, name: 'Лохмотья тени', img: 's1_r2_13_body.webp', x: -35.8, y: 116.23, w: 170.37, h: 196.71 },
  { id: 'b_smile', slot: 'body', price: 8, name: 'Жёлтое тело', img: 's1_r2_14_body.webp', x: 0, y: 121.49, w: 100, h: 216.74 },
  { id: 'b_green_pl', slot: 'body', price: 22, name: 'Зелёный комбинезон', img: 's1_r2_15_body.webp', x: -9.68, y: 122.29, w: 123.04, h: 223.96 },
  { id: 'b_lady', slot: 'body', price: 24, name: 'Жёлтое платье', img: 's1_r2_16_body.webp', x: -24.2, y: 128.55, w: 147.95, h: 206.39 },
  { id: 'b_bunnyhd', slot: 'body', price: 14, name: 'Морковка за спиной', img: 's1_r2_17_body.webp', x: -2.74, y: 108, w: 115.98, h: 183.56 },
  { id: 'b_red_pl', slot: 'body', price: 22, name: 'Синий комбинезон', img: 's1_r2_18_body.webp', x: -11.06, y: 108, w: 122.12, h: 185.25 },
  { id: 'b_deer', slot: 'body', price: 18, name: 'Белая грива', img: 's1_r2_19_body.webp', x: -13.95, y: 114.98, w: 131.63, h: 224.19 },
  { id: 'b_skier', slot: 'body', price: 10, name: 'Красный воротник', img: 's1_r2_20_body.webp', x: -3.26, y: 118.23, w: 106.05, h: 220.93 },
  { id: 'b_crimson', slot: 'body', price: 500, name: 'Багровое тело', img: 's1_r2_21_body.webp', x: 0, y: 122.29, w: 100, h: 215.21 },
  { id: 'b_frost', slot: 'body', price: 28, name: 'Доспех ледяного стража', img: 's2_r1_00_body.webp', x: -11.79, y: 108, w: 121.4, h: 205.68 },
  { id: 'b_totem', slot: 'body', price: 22, name: 'Тотемный доспех', img: 's2_r1_01_body.webp', x: -18.06, y: 108, w: 136.11, h: 225.46 },
  { id: 'b_azure', slot: 'body', price: 24, name: 'Шкура лазурного зверя', img: 's2_r1_02_body.webp', x: -33.41, y: 108, w: 166.82, h: 238.25 },
  { id: 'b_nomad', slot: 'body', price: 22, name: 'Меховая накидка', img: 's2_r1_03_body.webp', x: -8.56, y: 114.31, w: 127.03, h: 217.57 },
  { id: 'b_elkwar', slot: 'body', price: 26, name: 'Меховые доспехи', img: 's2_r1_04_body.webp', x: -26.39, y: 108, w: 153.24, h: 223.61 },
  { id: 'b_chief', slot: 'body', price: 26, name: 'Багровая броня', img: 's2_r1_05_body.webp', x: -11.31, y: 108, w: 119.91, h: 224.89 },
  { id: 'b_owl', slot: 'body', price: 24, name: 'Совиные крылья', img: 's2_r1_06_body.webp', x: -24.54, y: 114.02, w: 148.61, h: 223.61 },
  { id: 'b_furry', slot: 'body', price: 22, name: 'Мохнатая шуба', img: 's2_r1_07_body.webp', x: -27.71, y: 108, w: 153.82, h: 199.2 },
  { id: 'b_moth1', slot: 'body', price: 24, name: 'Крылья мотылька', img: 's2_r1_08_body.webp', x: -1.85, y: 121.43, w: 104.63, h: 216.67 },
  { id: 'b_catninja', slot: 'body', price: 22, name: 'Сине-белое кимоно', img: 's2_r1_11_body.webp', x: -3.24, y: 121.89, w: 106.02, h: 216.2 },
  { id: 'b_reaper', slot: 'body', price: 24, name: 'Белый плащ', img: 's2_r1_12_body.webp', x: -17.7, y: 112.87, w: 135.84, h: 213.27 },
  { id: 'b_moth2', slot: 'body', price: 24, name: 'Крылья императора', img: 's2_r2_13_body.webp', x: -31.92, y: 108, w: 163.85, h: 193.46 },
  { id: 'b_bluewolf', slot: 'body', price: 24, name: 'Шкура синего волка', img: 's2_r2_14_body.webp', x: -45.62, y: 108.92, w: 191.71, h: 216.13 },
  { id: 'b_raven', slot: 'body', price: 22, name: 'Перья ворона', img: 's2_r2_15_body.webp', x: -55.45, y: 108.91, w: 180, h: 225 },
  { id: 'b_sailor', slot: 'body', price: 14, name: 'Тельняшка', img: 's2_r2_16_body.webp', x: 0, y: 116.33, w: 100, h: 215.74 },
  { id: 'b_pirate', slot: 'body', price: 22, name: 'Пиратский кафтан', img: 's2_r2_17_body.webp', x: -14.22, y: 117.17, w: 128.44, h: 218.81 },
  { id: 'b_bonedrag', slot: 'body', price: 26, name: 'Плащ дракона', img: 's2_r2_18_body.webp', x: -28.07, y: 109.32, w: 144.74, h: 212.72 },
  { id: 'b_judo', slot: 'body', price: 14, name: 'Белое кимоно', img: 's2_r2_19_body.webp', x: -4.63, y: 119.11, w: 108.8, h: 218.98 },
  { id: 'b_prince', slot: 'body', price: 26, name: 'Парадный мундир', img: 's2_r2_20_body.webp', x: -40.78, y: 108, w: 181.57, h: 229.03 },
  { id: 'b_clown', slot: 'body', price: 22, name: 'Клоунский костюм', img: 's2_r2_21_body.webp', x: -6.02, y: 108, w: 111.57, h: 234.72 },
  { id: 'b_vampire', slot: 'body', price: 24, name: 'Бордовый плащ', img: 's2_r2_22_body.webp', x: -35.02, y: 117.68, w: 170.05, h: 219.35 },
  { id: 'b_priest', slot: 'body', price: 18, name: 'Белая тога', img: 's2_r2_23_body.webp', x: 0, y: 122.35, w: 100, h: 215.74 },
  { id: 'b_forest', slot: 'body', price: 22, name: 'Зелёная накидка', img: 's2_r2_24_body.webp', x: -40.74, y: 108, w: 160.65, h: 237.04 },
  { id: 'b_glitch', slot: 'body', price: 18, name: 'Глитч-тело', img: 's3_r1_00_body.webp', x: -26.27, y: 124.13, w: 152.53, h: 235.48 },
  { id: 'b_sunset', slot: 'body', price: 10, name: 'Градиент заката', img: 's3_r1_01_body.webp', x: 0, y: 119.98, w: 100, h: 217.51 },
  { id: 'b_popit', slot: 'body', price: 16, name: 'Поп-ит тело', img: 's3_r1_02_body.webp', x: -1.61, y: 113.24, w: 103.63, h: 191.53 },
  { id: 'b_toxic', slot: 'body', price: 18, name: 'Токсичное тело', img: 's3_r1_03_body.webp', x: 0, y: 109.47, w: 100, h: 252.94 },
  { id: 'b_nerd', slot: 'body', price: 14, name: 'Тело с книгой', img: 's3_r1_04_body.webp', x: -27.91, y: 108, w: 161.86, h: 232.56 },
  { id: 'b_shards', slot: 'body', price: 16, name: 'Витраж', img: 's3_r1_05_body.webp', x: -13.59, y: 121.36, w: 127.19, h: 211.06 },
  { id: 'b_aqua', slot: 'body', price: 20, name: 'Аквариум', img: 's3_r1_06_body.webp', x: 0, y: 133.46, w: 100, h: 206.02 },
  { id: 'b_wire', slot: 'body', price: 16, name: 'Каркас тела', img: 's3_r1_07_body.webp', x: -18, y: 108, w: 140.4, h: 198.8 },
  { id: 'b_dashed', slot: 'body', price: 8, name: 'Пунктирное тело', img: 's3_r1_08_body.webp', x: 0.69, y: 116.76, w: 98.62, h: 259.45 },
  { id: 'b_pastel', slot: 'body', price: 26, name: 'Пастельное платье', img: 's3_r2_11_body.webp', x: -38.14, y: 108, w: 166.05, h: 211.16 },
  { id: 'b_fox', slot: 'body', price: 18, name: 'Лисьи лапы', img: 's3_r2_12_body.webp', x: -32.71, y: 108, w: 177.57, h: 235.05 },
  { id: 'b_slasher', slot: 'body', price: 18, name: 'Мачете', img: 's3_r2_13_body.webp', x: -41.12, y: 108, w: 37.38, h: 117.29 },
  { id: 'b_beach', slot: 'body', price: 10, name: 'Пляжное тело', img: 's3_r2_14_body.webp', x: -0.46, y: 111.67, w: 100.92, h: 228.9 },
  { id: 'b_cat', slot: 'body', price: 18, name: 'Кошачье тело', img: 's3_r2_16_body.webp', x: 0, y: 108, w: 147.25, h: 238.53 },
  { id: 'b_zombie', slot: 'body', price: 20, name: 'Разодранное тело', img: 's3_r2_17_body.webp', x: -3.5, y: 131, w: 106, h: 226.5 },
  { id: 'b_mummy', slot: 'body', price: 16, name: 'Бинты на теле', img: 's3_r2_18_body.webp', x: -3.23, y: 122.29, w: 114.75, h: 215.67 },
  { id: 'b_crest_r', slot: 'body', price: 12, name: 'Багровый доспех', img: 's3_r2_19_body.webp', x: 0, y: 122.42, w: 100, h: 216.74 },
  { id: 'b_crest_f', slot: 'body', price: 14, name: 'Тлеющий доспех', img: 's3_r2_20_body.webp', x: 0, y: 111.26, w: 100, h: 216.74 },
  { id: 'b_check', slot: 'body', price: 8, name: 'Зелёное тело', img: 's3_r2_21_body.webp', x: 0, y: 121.95, w: 100, h: 216.74 },
];

const BY_ID = {};
CATALOG.forEach(i => { BY_ID[i.id] = i; });

const DEFAULT_SKIN = { head: 'h_none', body: 'b_none' };

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
