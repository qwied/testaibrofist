// ============ АВТОМОДЕРАЦИЯ ЗАГРУЖЕННЫХ КАРТИНОК СКИНОВ ============
/* Skin Editor больше не рисовалка по пикселям — игрок загружает готовую
   картинку/GIF (см. userSkins.js — /skins/publish). Прежде чем она попадёт
   в Skins Browser, здесь она:
   1) декодируется по-настоящему (а не просто проверяется по заголовку
      Content-Type — так отсекаются битые файлы и файл, у которого
      расширение подделано под картинку);
   2) проверяется на разумное разрешение (и для GIF — число кадров);
   3) прогоняется через настоящую нейросеть (nsfwjs, модель MobileNetV2 —
      бесплатная, с открытым кодом, https://github.com/infinitered/nsfwjs),
      которая распознаёт голых людей / порнографию / хентай, и через
      грубый эвристический фильтр на «кровавые» цвета (нейросеть учили не
      на это, а расчленёнка — это в первую очередь именно насыщенный
      красный на большой площади кадра).

   nsfwjs целиком локальная: веса модели лежат прямо в npm-пакете (~3.4 МБ,
   node_modules/nsfwjs/dist/models/mobilenet_v2), сеть наружу не ходит —
   значит это можно спокойно назвать «бесплатной нейросетью» без скрытых
   платных вызовов и без утечки загруженных фото куда-то ещё. Она честно
   ошибается реже, чем прежний чисто цветовой фильтр (тот проверял только
   долю «телесных» тонов пикселей и путал с ней, например, портрет
   крупным планом) — но всё равно не идеальна: возможны и пропуски
   (необычное освещение/стиль), и отказ по ошибке на пограничных фото.
   Владелец по-прежнему может удалить любой скин вручную (/skins/remove) —
   это подстраховка, а не единственный рубеж. */
'use strict';

const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');
const gifuct = require('gifuct-js');
const tf = require('@tensorflow/tfjs');
const nsfwjs = require('nsfwjs');

// разумные пределы разрешения: слишком маленькое — бессмысленно как
// картинка персонажа, слишком большое — трата места на диске и риск
// «decompression bomb» (маленький файл, гигантские заявленные размеры,
// чтобы положить сервер декодированием)
const MIN_DIM = 48;
const MAX_DIM = 2000;
/* У GIF отдельные, куда более строгие пределы: decompressFrames()
   разворачивает ВСЕ кадры в память сразу (библиотека не умеет частично),
   поэтому и площадь кадра, и их число нужно держать в разумных рамках —
   иначе один загруженный файл может занять сотни мегабайт памяти сервера
   на одну проверку. Скину не нужно быть больше персонажа на экране. */
const MAX_GIF_DIM = 600;
const MAX_GIF_FRAMES = 50;
// сколько кадров GIF реально проверяем на 18+/кровь: первый, последний и
// несколько равномерно между ними — ролик, «безопасный» только в начале
// или в конце, всё равно должен попасться
const GIF_SAMPLE_FRAMES = 4;

// сколько пикселей одного кадра реально проверяем на эвристику крови: на
// большой картинке достаточно выборки, не тратим время сервера на каждый
const TARGET_SAMPLES = 200000;
// доля насыщенного красного (от проверенных пикселей), выше которой
// подозреваем «кровь»/расчленёнку — подобрано на глаз, не измерено на
// реальном наборе данных; это единственное, что осталось от старого
// чисто цветового фильтра — нейросеть такое не распознаёт вовсе
const RED_RATIO_LIMIT = 0.22;

// пороги нейросети (вероятность класса 0..1). Porn/Hentai — явная
// порнография/хентай, блокируем при уверенности выше половины. Sexy —
// провокационная, но не обязательно откровенная одежда (купальники и
// т.п.) — с ней нейросеть куда менее точна, поэтому порог намного строже,
// иначе легко словить пляжное фото как нарушение.
const NSFW_PORN_LIMIT = 0.5;
const NSFW_HENTAI_LIMIT = 0.5;
const NSFW_SEXY_LIMIT = 0.85;

// ---------- нейросеть: грузим один раз на весь процесс ----------
let modelPromise = null;
function getModel() {
  if (!modelPromise) {
    modelPromise = nsfwjs.load().catch((e) => {
      console.log('[skin-moderation] не смог загрузить модель nsfwjs:', e.message);
      modelPromise = null;           // следующий вызов попробует снова, а не застрянет навсегда
      throw e;
    });
  }
  return modelPromise;
}
// греем модель сразу при старте сервера, чтобы первая же публикация
// скина не ждала лишние секунды загрузки весов
getModel().catch(() => {});

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

/* То же самое для GIF: подпись "GIF87a"/"GIF89a" (6 байт) + сразу за ней
   2+2 байта ширины/высоты (little-endian) в Logical Screen Descriptor. */
function peekGifDims(buf) {
  if (buf.length < 10) return null;
  const sig = buf.toString('ascii', 0, 6);
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return null;
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}

/* Заготовка кадра под нейросеть/эвристику: последовательно накладывает
   патч каждого кадра на общий холст (тот же приём, что и в gifPlayer.js
   для показа в игре, только без canvas — просто RGBA-буфер и ручной цикл
   по пикселям), сохраняя копию буфера только для нужных индексов —
   остальные кадры всё равно нужно «проиграть» по порядку, иначе холст
   к нужному моменту соберётся неправильно. */
function compositeSampledGifFrames(width, height, rawFrames, sampleIndices) {
  const buf = new Uint8ClampedArray(width * height * 4);
  const want = new Set(sampleIndices);
  const out = [];
  for (let i = 0; i < rawFrames.length; i++) {
    const f = rawFrames[i];
    const fw = f.dims.width, fh = f.dims.height, fx = f.dims.left, fy = f.dims.top;
    for (let y = 0; y < fh; y++) {
      const dstY = fy + y;
      if (dstY < 0 || dstY >= height) continue;
      for (let x = 0; x < fw; x++) {
        const dstX = fx + x;
        if (dstX < 0 || dstX >= width) continue;
        const srcO = (y * fw + x) * 4;
        if (f.patch[srcO + 3] === 0) continue;   // прозрачный пиксель кадра — холст под ним не трогаем
        const dstO = (dstY * width + dstX) * 4;
        buf[dstO] = f.patch[srcO]; buf[dstO + 1] = f.patch[srcO + 1];
        buf[dstO + 2] = f.patch[srcO + 2]; buf[dstO + 3] = 255;
      }
    }
    if (want.has(i)) out.push(buf.slice());
    if (f.disposalType === 2) {
      for (let y = 0; y < fh; y++) {
        const dstY = fy + y;
        if (dstY < 0 || dstY >= height) continue;
        for (let x = 0; x < fw; x++) {
          const dstX = fx + x;
          if (dstX < 0 || dstX >= width) continue;
          const dstO = (dstY * width + dstX) * 4;
          buf[dstO] = 0; buf[dstO + 1] = 0; buf[dstO + 2] = 0; buf[dstO + 3] = 0;
        }
      }
    }
  }
  return out;
}

function evenSpacedIndices(count, n) {
  if (count <= n) return Array.from({ length: count }, (_, i) => i);
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(Math.round((i * (count - 1)) / (n - 1)));
  return Array.from(new Set(idx));
}

/** Декодирует картинку в {width, height, frames}. frames — массив RGBA-буферов
 *  для проверки (для png/jpeg — один элемент, для gif — несколько кадров).
 *  frames === null значит: размеры/число кадров уже вне лимитов — полную
 *  (самую затратную и опасную для decompression bomb) распаковку не делаем,
 *  вызывающий код и так откажет. null целиком — файл не прочитан вовсе. */
function decodeImage(buf, ext) {
  try {
    if (ext === 'png') {
      const dims = peekPngDims(buf);
      if (!dims) return null;
      if (dims.width < MIN_DIM || dims.height < MIN_DIM ||
          dims.width > MAX_DIM || dims.height > MAX_DIM)
        return { width: dims.width, height: dims.height, frames: null };
      const png = PNG.sync.read(buf);
      return { width: png.width, height: png.height, frames: [png.data] };
    }
    if (ext === 'jpg' || ext === 'jpeg') {
      // maxResolutionInMP/maxMemoryUsageInMB — та же защита от «бомбы»,
      // что и peekPngDims выше, но средствами самой библиотеки
      const img = jpeg.decode(buf, {
        useTArray: true, maxResolutionInMP: (MAX_DIM * MAX_DIM) / 1e6 + 2, maxMemoryUsageInMB: 128
      });
      return { width: img.width, height: img.height, frames: [img.data] };
    }
    if (ext === 'gif') {
      const dims = peekGifDims(buf);
      if (!dims) return null;
      if (dims.width < MIN_DIM || dims.height < MIN_DIM ||
          dims.width > MAX_GIF_DIM || dims.height > MAX_GIF_DIM)
        return { width: dims.width, height: dims.height, frames: null };
      const gif = gifuct.parseGIF(buf);
      const imageFrames = gif.frames.filter((f) => f.image);
      if (!imageFrames.length) return null;
      if (imageFrames.length > MAX_GIF_FRAMES)
        return { width: dims.width, height: dims.height, frames: null, tooManyFrames: true };
      const rawFrames = gifuct.decompressFrames(gif, true);
      const sampleIdx = evenSpacedIndices(rawFrames.length, GIF_SAMPLE_FRAMES);
      const frames = compositeSampledGifFrames(gif.lsd.width, gif.lsd.height, rawFrames, sampleIdx);
      return { width: gif.lsd.width, height: gif.lsd.height, frames };
    }
  } catch (e) { return null; }
  return null; // формат не png/jpeg/gif — сюда не должны попадать (см. PLAYER_IMG_TYPES в userSkins.js)
}

// насыщенный тёмно-/ярко-красный, заметно отличный от тонов кожи —
// грубая замена «обнаружению крови»: единственное, что осталось от
// старого чисто цветового фильтра — нейросеть на это не учена
function isGoreRed(r, g, b) {
  return r > 120 && (r - g) > 70 && (r - b) > 70 && g < 110 && b < 110;
}
function scanGoreHeuristic(width, height, data) {
  const total = width * height;
  if (!total) return null;
  const stride = Math.max(1, Math.floor(total / TARGET_SAMPLES));
  let sampled = 0, red = 0;
  for (let p = 0; p < total; p += stride) {
    const o = p * 4;
    sampled++;
    if (isGoreRed(data[o], data[o + 1], data[o + 2])) red++;
  }
  const ratio = red / sampled;
  return ratio > RED_RATIO_LIMIT ? { reason: 'red', ratio } : null;
}

/** RGBA-буфер -> вердикт нейросети или null. Кидает исключение, если модель
 *  недоступна (см. getModel) — вызывающий код должен в этом случае ОТКАЗАТЬ
 *  публикации, а не пропустить её без проверки (отказываем безопасно). */
async function classifyFrame(width, height, data) {
  const model = await getModel();
  const total = width * height;
  const rgb = new Int32Array(total * 3);
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    rgb[i * 3] = data[o]; rgb[i * 3 + 1] = data[o + 1]; rgb[i * 3 + 2] = data[o + 2];
  }
  const tensor = tf.tensor3d(rgb, [height, width, 3], 'int32');
  let predictions;
  try { predictions = await model.classify(tensor); }
  finally { tensor.dispose(); }
  const byClass = {};
  predictions.forEach((p) => { byClass[p.className] = p.probability; });
  const porn = byClass.Porn || 0, hentai = byClass.Hentai || 0, sexy = byClass.Sexy || 0;
  if (porn > NSFW_PORN_LIMIT || hentai > NSFW_HENTAI_LIMIT || sexy > NSFW_SEXY_LIMIT)
    return { reason: 'nsfw-nn', classes: byClass };
  return null;
}

/** Проверяет все переданные кадры (гейм-скин может быть анимированным):
 *  сначала быстрая эвристика на кровь, затем нейросеть. Возвращает null,
 *  если ни один кадр не похож на нарушение, или {reason, ...} на первом
 *  же подозрительном. Кидает исключение, если нейросеть недоступна. */
async function scanForBlockedContent(decoded) {
  const { width, height, frames } = decoded;
  if (!frames || !frames.length) return null;
  for (const data of frames) {
    const gore = scanGoreHeuristic(width, height, data);
    if (gore) return gore;
    const nn = await classifyFrame(width, height, data);
    if (nn) return nn;
  }
  return null;
}

module.exports = {
  decodeImage, scanForBlockedContent, getModel,
  MIN_DIM, MAX_DIM, MAX_GIF_DIM, MAX_GIF_FRAMES
};
