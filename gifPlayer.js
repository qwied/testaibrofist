/* AIBROFIST — проигрывание анимированных GIF-скинов на canvas игры.
   Обычный ctx.drawImage(img,...) для GIF всегда рисует только первый кадр —
   браузер не двигает анимацию картинки для таких вызовов, даже если сам
   <img> где-то на странице анимируется (проверено: смена кадра НЕ зависит
   от того, вставлен ли Image() в DOM и виден ли он). Поэтому GIF-скин в игре
   декодируется на отдельные кадры заранее (см. gifuct.bundle.js), а дальше
   каждый кадр — свой canvas; на экран каждый раз рисуется тот, чьё время
   сейчас, по тому же принципу, что и обычный HTML <img> — по кругу.

   Способ очистки (disposalType) между кадрами: 2 — очистить область под
   кадром перед следующим; всё остальное (0, 1 и редкий 3 — восстановить
   предыдущий) — просто не трогать холст. У большинства GIF (в духе фото/
   коротких анимаций, а не сложной покадровой графики) этого достаточно;
   способ 3 в реальности почти не встречается. */
(function () {
  'use strict';

  var cache = {};   // url -> { width, height, frames: [{canvas, delay}]|null, totalDuration, failed }

  function buildFrames(gif, rawFrames) {
    var w = gif.lsd.width, h = gif.lsd.height;
    var buffer = document.createElement('canvas');
    buffer.width = w; buffer.height = h;
    var bctx = buffer.getContext('2d');
    var out = [];
    rawFrames.forEach(function (f) {
      var patchCanvas = document.createElement('canvas');
      patchCanvas.width = f.dims.width; patchCanvas.height = f.dims.height;
      var pctx = patchCanvas.getContext('2d');
      pctx.putImageData(new ImageData(f.patch, f.dims.width, f.dims.height), 0, 0);
      bctx.drawImage(patchCanvas, f.dims.left, f.dims.top);

      var snap = document.createElement('canvas');
      snap.width = w; snap.height = h;
      snap.getContext('2d').drawImage(buffer, 0, 0);
      out.push({ canvas: snap, delay: Math.max(20, f.delay || 100) });

      if (f.disposalType === 2) bctx.clearRect(f.dims.left, f.dims.top, f.dims.width, f.dims.height);
    });
    return out;
  }

  function load(url) {
    var entry = cache[url];
    if (entry) return entry;
    entry = cache[url] = { width: 0, height: 0, frames: null, totalDuration: 0, failed: false };
    if (!window.GifuctJS) { entry.failed = true; return entry; }
    fetch(url, { credentials: 'same-origin' })
      .then(function (r) { return r.arrayBuffer(); })
      .then(function (buf) {
        var gif = window.GifuctJS.parseGIF(buf);
        var rawFrames = window.GifuctJS.decompressFrames(gif, true);
        entry.width = gif.lsd.width; entry.height = gif.lsd.height;
        entry.frames = buildFrames(gif, rawFrames);
        entry.totalDuration = entry.frames.reduce(function (s, f) { return s + f.delay; }, 0) || 1;
      })
      .catch(function () { entry.failed = true; });
    return entry;
  }

  /** Канвас текущего кадра для этого времени, или null, пока не загрузился/не GIF. */
  function frameAt(url, nowMs) {
    var entry = load(url);
    if (!entry.frames || !entry.frames.length) return null;
    var t = nowMs % entry.totalDuration, acc = 0;
    for (var i = 0; i < entry.frames.length; i++) {
      acc += entry.frames[i].delay;
      if (t < acc) return entry.frames[i].canvas;
    }
    return entry.frames[entry.frames.length - 1].canvas;
  }

  function dims(url) {
    var entry = cache[url];
    return (entry && entry.frames) ? { width: entry.width, height: entry.height } : null;
  }

  window.GifPlayer = { frameAt: frameAt, dims: dims };
})();
