// ============ АВТОМОДЕРАЦИЯ ЗАГРУЖЕННЫХ КАРТИНОК СКИНОВ ============
/* Skin Editor больше не рисовалка по пикселям — игрок загружает готовую
   картинку (см. userSkins.js — /skins/publish). Прежде чем она попадёт
   в Skins Browser, здесь она (1) декодируется по-настоящему (а не просто
   проверяется по заголовку Content-Type — так отсекаются битые файлы и
   файл, у которого расширение подделано под картинку), (2) проверяется
   на разумное разрешение и (3) прогоняется через грубый эвристический
   фильтр на голую кожу и «кровавые» цвета.

   ВАЖНО: это не нейросеть и не готовый сервис вроде AWS Rekognition —
   в проекте нет ни того, ни другого и нет сети наружу для платных API.
   Это статистика по цвету пикселей (доля тонов кожи / доля насыщенного
   красного). Она ловит самые грубые случаи (фото, где голая кожа или
   кровь занимают значительную часть кадра), но: а) может пропустить
   откровенный контент в необычном освещении/цветах, б) может по ошибке
   отклонить нормальное фото крупным планом (лицо, руки, загар на весь
   кадр, оранжевый/красный фон). Ложные срабатывания — плата за то, что
   фильтр вообще что-то ловит без ручной проверки каждого фото. Владелец
   по-прежнему может удалить любой скин вручную (/skins/remove) — это
   первый рубеж, а не единственный. */
'use strict';

const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

// разумные пределы разрешения: слишком маленькое — бессмысленно как
// картинка персонажа, слишком большое — трата места на диске и риск
// «zip/decompression bomb» (маленький файл, гигантские заявленные
// размеры, чтобы положить сервер декодированием)
const MIN_DIM = 48;
const MAX_DIM = 2000;

// сколько пикселей реально проверяем: на большой картинке достаточно
// выборки, чтобы не тратить время сервера на каждый пиксель
const TARGET_SAMPLES = 200000;

// пороги эвристики (доля от проверенных пикселей). Подобраны на глаз,
// а не измерены на реальном наборе данных — если фильтр слишком часто
// блокирует нормальные фото или, наоборот, пропускает лишнее, эти два
// числа и стоит в первую очередь подкрутить.
const SKIN_RATIO_LIMIT = 0.40;
const RED_RATIO_LIMIT = 0.22;

/* Быстрая проверка заявленных PNG-размеров ДО полного декодирования —
   в самой PNG достаточно 8 байт подписи + IHDR, чтобы объявить любое
   разрешение, а само сжатое содержимое (IDAT) может быть крошечным.
   Без этой проверки декодер сам попытался бы выделить память под
   заявленную картинку целиком — то самое decompression bomb. */
function peekPngDims(buf) {
  const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(SIG)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Декодирует картинку в {width, height, data}. data может быть null, если
 *  размеры уже вышли за MIN_DIM/MAX_DIM — тогда полную распаковку (самую
 *  затратную и опасную для decompression bomb часть) просто не делаем,
 *  вызывающий код и так откажет по размеру. null целиком — файл не
 *  прочитан (битый/не картинка/формат не png-jpeg). */
function decodeImage(buf, ext) {
  try {
    if (ext === 'png') {
      const dims = peekPngDims(buf);
      if (!dims) return null;
      if (dims.width < MIN_DIM || dims.height < MIN_DIM ||
          dims.width > MAX_DIM || dims.height > MAX_DIM)
        return { width: dims.width, height: dims.height, data: null };
      const png = PNG.sync.read(buf);
      return { width: png.width, height: png.height, data: png.data };
    }
    if (ext === 'jpg' || ext === 'jpeg') {
      // maxResolutionInMP/maxMemoryUsageInMB — та же защита от «бомбы»,
      // что и peekPngDims выше, но средствами самой библиотеки
      const img = jpeg.decode(buf, {
        useTArray: true, maxResolutionInMP: (MAX_DIM * MAX_DIM) / 1e6 + 2, maxMemoryUsageInMB: 128
      });
      return { width: img.width, height: img.height, data: img.data };
    }
  } catch (e) { return null; }
  return null; // формат не png/jpeg — сюда не должны попадать (см. IMG_TYPES в userSkins.js)
}

// правило Kovac/Peer для «обычной» кожи + отдельное правило для очень
// светлой/засвеченной — простое RGB-правило, без перевода в HSV/YCbCr
function isSkinTone(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (r > 95 && g > 40 && b > 20 && (max - min) > 15 &&
      Math.abs(r - g) > 15 && r > g && r > b) return true;
  if (r > 200 && g > 170 && b > 140 && r >= g && g >= b && (r - b) < 70) return true;
  return false;
}

// насыщенный тёмно-/ярко-красный, заметно отличный от тонов кожи —
// грубая замена «обнаружению крови»
function isGoreRed(r, g, b) {
  return r > 120 && (r - g) > 70 && (r - b) > 70 && g < 110 && b < 110;
}

/** Возвращает null, если картинка похожа на обычную, или {reason, ratio} при подозрении. */
function scanForBlockedContent(decoded) {
  const { width, height, data } = decoded;
  const total = width * height;
  if (!total) return null;
  const stride = Math.max(1, Math.floor(total / TARGET_SAMPLES));

  let sampled = 0, skin = 0, red = 0;
  for (let p = 0; p < total; p += stride) {
    const o = p * 4;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    sampled++;
    if (isSkinTone(r, g, b)) skin++;
    else if (isGoreRed(r, g, b)) red++;
  }
  const skinRatio = skin / sampled, redRatio = red / sampled;
  if (skinRatio > SKIN_RATIO_LIMIT) return { reason: 'skin', ratio: skinRatio };
  if (redRatio > RED_RATIO_LIMIT) return { reason: 'red', ratio: redRatio };
  return null;
}

module.exports = { decodeImage, scanForBlockedContent, MIN_DIM, MAX_DIM };
