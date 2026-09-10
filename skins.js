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
  { id: 'h_wizard', slot: 'head', price: 22, name: 'Колпак звездочёта', img: 's1_r1_00_head.webp', x: -0.69, y: -53.29, w: 100.92, h: 161.29 },
  { id: 'h_viking', slot: 'head', price: 20, name: 'Рогатый шлем', img: 's1_r1_01_head.webp', x: -25.35, y: -35.78, w: 151.15, h: 143.78 },
  { id: 'h_king', slot: 'head', price: 28, name: 'Золотая корона', img: 's1_r1_02_head.webp', x: -34.1, y: -28.87, w: 135.02, h: 136.87 },
  { id: 'h_pharaoh', slot: 'head', price: 26, name: 'Убор фараона', img: 's1_r1_03_head.webp', x: -35.94, y: -40.39, w: 169.59, h: 148.39 },
  { id: 'h_dots', slot: 'head', price: 14, name: 'Бант в горошек', img: 's1_r1_04_head.webp', x: -41.01, y: -47.76, w: 183.87, h: 155.76 },
  { id: 'h_phoenix', slot: 'head', price: 26, name: 'Голова феникса', img: 's1_r1_05_head.webp', x: -37.56, y: -6.29, w: 188.94, h: 114.29 },
  { id: 'h_lepre', slot: 'head', price: 24, name: 'Цилиндр лепрекона', img: 's1_r1_06_head.webp', x: -23.04, y: -52.83, w: 139.63, h: 160.83 },
  { id: 'h_skater', slot: 'head', price: 18, name: 'Патлы и очки', img: 's1_r1_07_head.webp', x: -19.59, y: 8.46, w: 147, h: 99.54 },
  { id: 'h_artist', slot: 'head', price: 12, name: 'Берет художника', img: 's1_r1_08_head.webp', x: 0.69, y: -12.74, w: 108.29, h: 120.74 },
  { id: 'h_emerald', slot: 'head', price: 16, name: 'Зелёная шляпа', img: 's1_r1_09_head.webp', x: -18.89, y: -26.56, w: 136.87, h: 134.56 },
  { id: 'h_candle', slot: 'head', price: 16, name: 'Огонёк свечи', img: 's1_r2_11_head.webp', x: -3.23, y: -57.9, w: 107.37, h: 165.9 },
  { id: 'h_paint', slot: 'head', price: 10, name: 'Мазки краски', img: 's1_r2_12_head.webp', x: -2.3, y: 6.16, w: 104.15, h: 101.84 },
  { id: 'h_shade', slot: 'head', price: 20, name: 'Рогатая тень', img: 's1_r2_13_head.webp', x: -49.31, y: -53.75, w: 195.39, h: 161.75 },
  { id: 'h_smile', slot: 'head', price: 10, name: 'Смайлик в очках', img: 's1_r2_14_head.webp', x: -1.38, y: 5.24, w: 103.23, h: 102.76 },
  { id: 'h_green_pl', slot: 'head', price: 22, name: 'Зелёная кепка', img: 's1_r2_15_head.webp', x: -3.69, y: -12.74, w: 105.99, h: 120.74 },
  { id: 'h_lady', slot: 'head', price: 22, name: 'Шляпка с цветами', img: 's1_r2_16_head.webp', x: -44.7, y: -6.75, w: 170.51, h: 114.75 },
  { id: 'h_bunnyhd', slot: 'head', price: 20, name: 'Капюшон-зайчик', img: 's1_r2_17_head.webp', x: -27.19, y: -37.16, w: 151.15, h: 145.16 },
  { id: 'h_red_pl', slot: 'head', price: 22, name: 'Красная кепка', img: 's1_r2_18_head.webp', x: -1.38, y: 10.3, w: 105.99, h: 97.7 },
  { id: 'h_deer', slot: 'head', price: 24, name: 'Глаз с рогами', img: 's1_r2_19_head.webp', x: -39.17, y: -52.37, w: 179.26, h: 160.37 },
  { id: 'h_skier', slot: 'head', price: 14, name: 'Лыжная маска', img: 's1_r2_20_head.webp', x: -1.38, y: 7.54, w: 101.84, h: 100.46 },
  { id: 'h_crimson', slot: 'head', price: 500, name: 'Багровая голова', img: 's1_r2_21_head.webp', x: -0.92, y: 7.08, w: 100.92, h: 100.92 },
  { id: 'h_frost', slot: 'head', price: 26, name: 'Шлем ледяного стража', img: 's2_r1_00_head.webp', x: -0.46, y: -27.48, w: 100.92, h: 135.48 },
  { id: 'h_totem', slot: 'head', price: 22, name: 'Деревянный тотем', img: 's2_r1_01_head.webp', x: -12.67, y: -62.51, w: 125.35, h: 170.51 },
  { id: 'h_azure', slot: 'head', price: 24, name: 'Голова лазурного зверя', img: 's2_r1_02_head.webp', x: 9.45, y: -30.25, w: 110.6, h: 138.25 },
  { id: 'h_nomad', slot: 'head', price: 18, name: 'Красная повязка', img: 's2_r1_03_head.webp', x: -20.05, y: -39.47, w: 121.2, h: 147.47 },
  { id: 'h_elkwar', slot: 'head', price: 26, name: 'Шлем с рогами лося', img: 's2_r1_04_head.webp', x: -35.71, y: -41.77, w: 171.43, h: 149.77 },
  { id: 'h_chief', slot: 'head', price: 24, name: 'Маска вождя', img: 's2_r1_05_head.webp', x: -17.05, y: 3.39, w: 130.88, h: 104.61 },
  { id: 'h_owl', slot: 'head', price: 22, name: 'Морда совы', img: 's2_r1_06_head.webp', x: -8.99, y: 7.08, w: 117.97, h: 100.92 },
  { id: 'h_furry', slot: 'head', price: 20, name: 'Мохнатая маска', img: 's2_r1_07_head.webp', x: -15.67, y: -49.6, w: 144.7, h: 157.6 },
  { id: 'h_moth1', slot: 'head', price: 24, name: 'Голова мотылька', img: 's2_r1_08_head.webp', x: -30.18, y: -50.06, w: 159.91, h: 158.06 },
  { id: 'h_rabbit', slot: 'head', price: 14, name: 'Мордочка кролика', img: 's2_r1_09_head.webp', x: -14.75, y: -54.67, w: 129.03, h: 162.67 },
  { id: 'h_puppy', slot: 'head', price: 14, name: 'Мордочка пёсика', img: 's2_r1_10_head.webp', x: -6.91, y: -5.36, w: 113.82, h: 113.36 },
  { id: 'h_catninja', slot: 'head', price: 24, name: 'Шлем кота-ниндзя', img: 's2_r1_11_head.webp', x: -19.12, y: -39.47, w: 138.71, h: 147.47 },
  { id: 'h_reaper', slot: 'head', price: 24, name: 'Маска белого жнеца', img: 's2_r1_12_head.webp', x: -44.01, y: -12.74, w: 187.1, h: 120.74 },
  { id: 'h_moth2', slot: 'head', price: 22, name: 'Усики мотылька', img: 's2_r2_13_head.webp', x: -46.31, y: -31.63, w: 192.63, h: 139.63 },
  { id: 'h_bluewolf', slot: 'head', price: 24, name: 'Голова синего волка', img: 's2_r2_14_head.webp', x: -23.96, y: -41.31, w: 149.31, h: 149.31 },
  { id: 'h_raven', slot: 'head', price: 22, name: 'Морда ворона', img: 's2_r2_15_head.webp', x: -26.5, y: -31.17, w: 154.84, h: 139.17 },
  { id: 'h_sailor', slot: 'head', price: 14, name: 'Красная бандана', img: 's2_r2_16_head.webp', x: -11.75, y: 1.55, w: 111.98, h: 106.45 },
  { id: 'h_pirate', slot: 'head', price: 24, name: 'Пиратская треуголка', img: 's2_r2_17_head.webp', x: -18.2, y: -21.95, w: 136.87, h: 129.95 },
  { id: 'h_bonedrag', slot: 'head', price: 28, name: 'Череп дракона', img: 's2_r2_18_head.webp', x: -46.77, y: -31.17, w: 162.21, h: 139.17 },
  { id: 'h_prince', slot: 'head', price: 24, name: 'Золотая диадема', img: 's2_r2_20_head.webp', x: -13.59, y: 7.54, w: 118.89, h: 100.46 },
  { id: 'h_clown', slot: 'head', price: 20, name: 'Клоунский парик', img: 's2_r2_21_head.webp', x: -26.04, y: -17.35, w: 146.54, h: 125.35 },
  { id: 'h_vampire', slot: 'head', price: 20, name: 'Чёрный цилиндр', img: 's2_r2_22_head.webp', x: -14.29, y: -51.91, w: 124.88, h: 159.91 },
  { id: 'h_priest', slot: 'head', price: 16, name: 'Венок жреца', img: 's2_r2_23_head.webp', x: -6.68, y: 7.54, w: 113.36, h: 100.46 },
  { id: 'h_forest', slot: 'head', price: 22, name: 'Багряная корона', img: 's2_r2_24_head.webp', x: -16.82, y: -50.99, w: 133.64, h: 158.99 },
  { id: 'h_glitch', slot: 'head', price: 18, name: 'Глитч-голова', img: 's3_r1_00_head.webp', x: -21.2, y: 30.12, w: 137.79, h: 77.88 },
  { id: 'h_sunset', slot: 'head', price: 8, name: 'Оранжевый шар', img: 's3_r1_01_head.webp', x: 1.38, y: 9.38, w: 99.08, h: 98.62 },
  { id: 'h_popit', slot: 'head', price: 14, name: 'Радужный поп-ит', img: 's3_r1_02_head.webp', x: -3.46, y: 1.09, w: 106.91, h: 106.91 },
  { id: 'h_toxic', slot: 'head', price: 16, name: 'Знак радиации', img: 's3_r1_03_head.webp', x: 1.61, y: 18.14, w: 95.39, h: 89.86 },
  { id: 'h_nerd', slot: 'head', price: 12, name: 'Смайлик-ботаник', img: 's3_r1_04_head.webp', x: 0.46, y: 9.38, w: 113.36, h: 98.62 },
  { id: 'h_shards', slot: 'head', price: 14, name: 'Осколки стекла', img: 's3_r1_05_head.webp', x: 5.76, y: -1.68, w: 94.47, h: 109.68 },
  { id: 'h_aqua', slot: 'head', price: 16, name: 'Крышка аквариума', img: 's3_r1_06_head.webp', x: 1.15, y: 10.3, w: 97.7, h: 97.7 },
  { id: 'h_wire', slot: 'head', price: 14, name: 'Каркас головы', img: 's3_r1_07_head.webp', x: -6.68, y: -30.71, w: 146.54, h: 138.71 },
  { id: 'h_dashed', slot: 'head', price: 8, name: 'Пунктирная голова', img: 's3_r1_08_head.webp', x: 1.61, y: 48.09, w: 95.39, h: 59.91 },
  { id: 'h_gray', slot: 'head', price: 5, name: 'Серая голова', img: 's3_r1_10_head.webp', x: 2.07, y: 11.23, w: 96.31, h: 96.77 },
  { id: 'h_pastel', slot: 'head', price: 24, name: 'Пастельные цветы', img: 's3_r2_11_head.webp', x: -29.95, y: -39.47, w: 158.53, h: 147.47 },
  { id: 'h_fox', slot: 'head', price: 20, name: 'Мордочка лиса', img: 's3_r2_12_head.webp', x: -18.66, y: -39.93, w: 158.06, h: 147.93 },
  { id: 'h_slasher', slot: 'head', price: 20, name: 'Хоккейная маска', img: 's3_r2_13_head.webp', x: -36.18, y: -0.29, w: 137.79, h: 108.29 },
  { id: 'h_beach', slot: 'head', price: 10, name: 'Соломенная макушка', img: 's3_r2_14_head.webp', x: 3.46, y: 14.45, w: 93.09, h: 93.55 },
  { id: 'h_cat', slot: 'head', price: 18, name: 'Мордочка кота', img: 's3_r2_16_head.webp', x: -3.46, y: 7.08, w: 106.91, h: 100.92 },
  { id: 'h_zombie', slot: 'head', price: 20, name: 'Голова зомби', img: 's3_r2_17_head.webp', x: 0.69, y: 10.76, w: 98.16, h: 97.24 },
  { id: 'h_mummy', slot: 'head', price: 16, name: 'Бинты на голове', img: 's3_r2_18_head.webp', x: -4.15, y: -3.52, w: 108.29, h: 111.52 },
  { id: 'h_crest_r', slot: 'head', price: 14, name: 'Багровый герб', img: 's3_r2_19_head.webp', x: -1.38, y: 6.16, w: 102.76, h: 101.84 },
  { id: 'h_crest_f', slot: 'head', price: 16, name: 'Огненный герб', img: 's3_r2_20_head.webp', x: -13.36, y: -18.27, w: 126.27, h: 126.27 },
  { id: 'h_check', slot: 'head', price: 10, name: 'Зелёная галочка', img: 's3_r2_21_head.webp', x: -1.38, y: 5.24, w: 103.23, h: 102.76 },
  // ---------- тело ----------
  { id: 'b_none', slot: 'body', price: 0, name: 'Ничего' },
  { id: 'b_wizard', slot: 'body', price: 24, name: 'Звёздная мантия', img: 's1_r1_00_body.webp', x: 0.23, y: 122.29, w: 99.54, h: 214.75 },
  { id: 'b_viking', slot: 'body', price: 22, name: 'Боевая секира', img: 's1_r1_01_body.webp', x: -35.02, y: 108, w: 181.11, h: 229.03 },
  { id: 'b_king', slot: 'body', price: 30, name: 'Королевская мантия', img: 's1_r1_02_body.webp', x: -57.14, y: 108, w: 214.29, h: 243.32 },
  { id: 'b_pharaoh', slot: 'body', price: 20, name: 'Пояс фараона', img: 's1_r1_03_body.webp', x: -5.07, y: 108, w: 111.52, h: 218.89 },
  { id: 'b_dots', slot: 'body', price: 16, name: 'Сумочка в горошек', img: 's1_r1_04_body.webp', x: -47.93, y: 117.68, w: 147.47, h: 219.35 },
  { id: 'b_phoenix', slot: 'body', price: 26, name: 'Огненное оперение', img: 's1_r1_05_body.webp', x: -41.71, y: 114.45, w: 156.22, h: 222.58 },
  { id: 'b_lepre', slot: 'body', price: 22, name: 'Костюм лепрекона', img: 's1_r1_06_body.webp', x: -0.46, y: 122.75, w: 100.46, h: 215.21 },
  { id: 'b_skater', slot: 'body', price: 18, name: 'Белое худи', img: 's1_r1_07_body.webp', x: -8.53, y: 108, w: 118.89, h: 246.54 },
  { id: 'b_artist', slot: 'body', price: 14, name: 'Синий жилет', img: 's1_r1_08_body.webp', x: -0.23, y: 122.75, w: 100.46, h: 215.67 },
  { id: 'b_emerald', slot: 'body', price: 18, name: 'Изумрудный смокинг', img: 's1_r1_09_body.webp', x: 0, y: 121.82, w: 100, h: 215.67 },
  { id: 'b_baker', slot: 'body', price: 12, name: 'Фартук пекаря', img: 's1_r1_10_body.webp', x: 0, y: 115.83, w: 99.54, h: 222.12 },
  { id: 'b_candle', slot: 'body', price: 16, name: 'Восковая свеча', img: 's1_r2_11_body.webp', x: -1.38, y: 108, w: 101.84, h: 226.73 },
  { id: 'b_paint', slot: 'body', price: 12, name: 'Холст художника', img: 's1_r2_12_body.webp', x: 0.46, y: 122.75, w: 99.08, h: 214.29 },
  { id: 'b_shade', slot: 'body', price: 20, name: 'Лохмотья тени', img: 's1_r2_13_body.webp', x: -46.08, y: 117.22, w: 190.78, h: 220.28 },
  { id: 'b_smile', slot: 'body', price: 8, name: 'Жёлтый корпус', img: 's1_r2_14_body.webp', x: 0.46, y: 121.36, w: 99.08, h: 214.75 },
  { id: 'b_green_pl', slot: 'body', price: 22, name: 'Зелёный комбинезон', img: 's1_r2_15_body.webp', x: -9.68, y: 122.29, w: 123.04, h: 223.96 },
  { id: 'b_lady', slot: 'body', price: 24, name: 'Жёлтое платье', img: 's1_r2_16_body.webp', x: -24.88, y: 128.74, w: 149.31, h: 208.29 },
  { id: 'b_bunnyhd', slot: 'body', price: 14, name: 'Морковка за спиной', img: 's1_r2_17_body.webp', x: -3.23, y: 108, w: 117.05, h: 185.25 },
  { id: 'b_red_pl', slot: 'body', price: 22, name: 'Синий комбинезон', img: 's1_r2_18_body.webp', x: -11.06, y: 108, w: 122.12, h: 185.25 },
  { id: 'b_deer', slot: 'body', price: 18, name: 'Белая грива', img: 's1_r2_19_body.webp', x: -13.36, y: 114.91, w: 130.41, h: 222.12 },
  { id: 'b_skier', slot: 'body', price: 10, name: 'Красный воротник', img: 's1_r2_20_body.webp', x: -2.76, y: 118.14, w: 105.07, h: 218.89 },
  { id: 'b_crimson', slot: 'body', price: 500, name: 'Багровое тело', img: 's1_r2_21_body.webp', x: 0, y: 122.29, w: 100, h: 215.21 },
  { id: 'b_frost', slot: 'body', price: 28, name: 'Доспех ледяного стража', img: 's2_r1_00_body.webp', x: -15.21, y: 108, w: 128.11, h: 217.05 },
  { id: 'b_totem', slot: 'body', price: 22, name: 'Тотемный доспех', img: 's2_r1_01_body.webp', x: -17.74, y: 108, w: 135.48, h: 224.42 },
  { id: 'b_azure', slot: 'body', price: 24, name: 'Шкура лазурного зверя', img: 's2_r1_02_body.webp', x: -33.41, y: 108, w: 166.82, h: 238.25 },
  { id: 'b_nomad', slot: 'body', price: 22, name: 'Меховая накидка', img: 's2_r1_03_body.webp', x: -9.91, y: 114.45, w: 129.95, h: 222.58 },
  { id: 'b_elkwar', slot: 'body', price: 26, name: 'Меховые доспехи', img: 's2_r1_04_body.webp', x: -26.04, y: 108, w: 152.53, h: 222.58 },
  { id: 'b_chief', slot: 'body', price: 26, name: 'Багровая броня', img: 's2_r1_05_body.webp', x: -12.44, y: 108, w: 122.12, h: 229.03 },
  { id: 'b_owl', slot: 'body', price: 24, name: 'Совиные крылья', img: 's2_r1_06_body.webp', x: -24.19, y: 113.99, w: 147.93, h: 222.58 },
  { id: 'b_furry', slot: 'body', price: 22, name: 'Мохнатая шуба', img: 's2_r1_07_body.webp', x: -39.17, y: 108, w: 176.5, h: 228.57 },
  { id: 'b_moth1', slot: 'body', price: 24, name: 'Крылья мотылька', img: 's2_r1_08_body.webp', x: -1.61, y: 121.36, w: 104.15, h: 215.67 },
  { id: 'b_rabbit', slot: 'body', price: 12, name: 'Белый корпус', img: 's2_r1_09_body.webp', x: 0, y: 122.29, w: 100, h: 214.75 },
  { id: 'b_puppy', slot: 'body', price: 12, name: 'Светлый корпус', img: 's2_r1_10_body.webp', x: 0, y: 122.29, w: 100, h: 214.75 },
  { id: 'b_catninja', slot: 'body', price: 22, name: 'Сине-белое кимоно', img: 's2_r1_11_body.webp', x: -3, y: 121.82, w: 105.53, h: 215.21 },
  { id: 'b_reaper', slot: 'body', price: 24, name: 'Белый плащ', img: 's2_r1_12_body.webp', x: -20.51, y: 113.07, w: 141.47, h: 222.12 },
  { id: 'b_moth2', slot: 'body', price: 24, name: 'Крылья императора', img: 's2_r2_13_body.webp', x: -48.16, y: 108, w: 196.31, h: 231.8 },
  { id: 'b_bluewolf', slot: 'body', price: 24, name: 'Шкура синего волка', img: 's2_r2_14_body.webp', x: -45.62, y: 108.92, w: 191.71, h: 216.13 },
  { id: 'b_raven', slot: 'body', price: 22, name: 'Перья ворона', img: 's2_r2_15_body.webp', x: -56.91, y: 108, w: 182.49, h: 229.03 },
  { id: 'b_sailor', slot: 'body', price: 14, name: 'Тельняшка', img: 's2_r2_16_body.webp', x: 0.23, y: 116.29, w: 99.54, h: 214.75 },
  { id: 'b_pirate', slot: 'body', price: 22, name: 'Пиратский камзол', img: 's2_r2_17_body.webp', x: -14.52, y: 117.22, w: 129.03, h: 219.82 },
  { id: 'b_bonedrag', slot: 'body', price: 26, name: 'Плащ дракона', img: 's2_r2_18_body.webp', x: -32.03, y: 109.38, w: 152.07, h: 223.5 },
  { id: 'b_judo', slot: 'body', price: 14, name: 'Белое кимоно', img: 's2_r2_19_body.webp', x: -4.38, y: 119.06, w: 108.29, h: 217.97 },
  { id: 'b_prince', slot: 'body', price: 26, name: 'Парадный мундир', img: 's2_r2_20_body.webp', x: -40.78, y: 108, w: 181.57, h: 229.03 },
  { id: 'b_clown', slot: 'body', price: 22, name: 'Клоунский костюм', img: 's2_r2_21_body.webp', x: -5.76, y: 108, w: 111.06, h: 233.64 },
  { id: 'b_vampire', slot: 'body', price: 24, name: 'Бордовый плащ', img: 's2_r2_22_body.webp', x: -35.02, y: 117.68, w: 170.05, h: 219.35 },
  { id: 'b_priest', slot: 'body', price: 18, name: 'Белая тога', img: 's2_r2_23_body.webp', x: 0.23, y: 122.29, w: 99.54, h: 214.75 },
  { id: 'b_forest', slot: 'body', price: 22, name: 'Зелёная накидка', img: 's2_r2_24_body.webp', x: -40.32, y: 108, w: 159.91, h: 235.94 },
  { id: 'b_glitch', slot: 'body', price: 18, name: 'Глитч-корпус', img: 's3_r1_00_body.webp', x: -26.27, y: 124.13, w: 152.53, h: 235.48 },
  { id: 'b_sunset', slot: 'body', price: 10, name: 'Градиент заката', img: 's3_r1_01_body.webp', x: 0, y: 119.98, w: 100, h: 217.51 },
  { id: 'b_popit', slot: 'body', price: 16, name: 'Поп-ит корпус', img: 's3_r1_02_body.webp', x: -8.99, y: 113.99, w: 118.43, h: 218.89 },
  { id: 'b_toxic', slot: 'body', price: 18, name: 'Токсичный корпус', img: 's3_r1_03_body.webp', x: 3, y: 109.38, w: 94.01, h: 237.79 },
  { id: 'b_nerd', slot: 'body', price: 14, name: 'Корпус с книгой', img: 's3_r1_04_body.webp', x: -27.19, y: 108, w: 160.37, h: 230.41 },
  { id: 'b_shards', slot: 'body', price: 16, name: 'Витраж', img: 's3_r1_05_body.webp', x: -13.59, y: 121.36, w: 127.19, h: 211.06 },
  { id: 'b_aqua', slot: 'body', price: 20, name: 'Аквариум', img: 's3_r1_06_body.webp', x: 0.23, y: 133.35, w: 99.54, h: 205.07 },
  { id: 'b_wire', slot: 'body', price: 16, name: 'Каркас тела', img: 's3_r1_07_body.webp', x: -28.34, y: 108, w: 161.75, h: 229.03 },
  { id: 'b_dashed', slot: 'body', price: 8, name: 'Пунктирное тело', img: 's3_r1_08_body.webp', x: 0.69, y: 116.76, w: 98.62, h: 259.45 },
  { id: 'b_black', slot: 'body', price: 5, name: 'Чёрный силуэт', img: 's3_r1_09_body.webp', x: 0.46, y: 108, w: 99.08, h: 229.03 },
  { id: 'b_gray', slot: 'body', price: 5, name: 'Серое тело', img: 's3_r1_10_body.webp', x: 2.53, y: 125.97, w: 94.93, h: 211.98 },
  { id: 'b_pastel', slot: 'body', price: 26, name: 'Пастельное платье', img: 's3_r2_11_body.webp', x: -37.33, y: 108, w: 164.52, h: 209.22 },
  { id: 'b_fox', slot: 'body', price: 18, name: 'Лисьи лапы', img: 's3_r2_12_body.webp', x: -31.57, y: 108, w: 175.12, h: 231.8 },
  { id: 'b_slasher', slot: 'body', price: 18, name: 'Мачете', img: 's3_r2_13_body.webp', x: -39.86, y: 108, w: 139.63, h: 229.49 },
  { id: 'b_beach', slot: 'body', price: 10, name: 'Пляжный корпус', img: 's3_r2_14_body.webp', x: -0.69, y: 111.69, w: 101.38, h: 229.95 },
  { id: 'b_cat', slot: 'body', price: 18, name: 'Кошачий корпус', img: 's3_r2_16_body.webp', x: -0.23, y: 108, w: 147.93, h: 239.63 },
  { id: 'b_zombie', slot: 'body', price: 20, name: 'Разодранный корпус', img: 's3_r2_17_body.webp', x: 0.69, y: 129.2, w: 97.7, h: 208.76 },
  { id: 'b_mummy', slot: 'body', price: 16, name: 'Бинты на теле', img: 's3_r2_18_body.webp', x: -3.23, y: 120.9, w: 115.21, h: 217.05 },
  { id: 'b_crest_r', slot: 'body', price: 12, name: 'Багровый корпус', img: 's3_r2_19_body.webp', x: 0.46, y: 122.29, w: 99.08, h: 214.75 },
  { id: 'b_crest_f', slot: 'body', price: 14, name: 'Тлеющий корпус', img: 's3_r2_20_body.webp', x: 0.46, y: 111.23, w: 99.08, h: 214.75 },
  { id: 'b_check', slot: 'body', price: 8, name: 'Зелёный корпус', img: 's3_r2_21_body.webp', x: 0.46, y: 121.82, w: 99.08, h: 214.75 },
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
