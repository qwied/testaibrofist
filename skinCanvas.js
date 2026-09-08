/* AIBROFIST — отрисовка аксессуаров скина на canvas.
   Берёт те же фигуры, что и SVG (BFSkin.parts), поэтому в игре
   персонаж выглядит ровно так же, как в редакторе скинов. */
(function () {
  'use strict';

  var cache = {};   // строка пути -> Path2D

  function path(d) {
    if (!cache[d]) {
      try { cache[d] = new Path2D(d); } catch (e) { cache[d] = null; }
    }
    return cache[d];
  }

  function draw(ctx, list) {
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      ctx.beginPath();
      switch (s.t) {
        case 'path':
          var p = path(s.d);
          if (!p) continue;
          if (s.fill) { ctx.fillStyle = s.fill; ctx.fill(p); }
          if (s.stroke) { ctx.strokeStyle = s.stroke; ctx.lineWidth = s.sw || 4; ctx.stroke(p); }
          continue;
        case 'rect':
          if (s.rx > 0) round(ctx, s.x, s.y, s.w, s.h, s.rx);
          else ctx.rect(s.x, s.y, s.w, s.h);
          break;
        case 'circle':
          ctx.arc(s.cx, s.cy, s.r, 0, 6.2832);
          break;
        case 'ellipse':
          ctx.ellipse(s.cx, s.cy, s.rx, s.ry, 0, 0, 6.2832);
          break;
        case 'line':
          ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2);
          break;
        case 'text':
          ctx.fillStyle = s.fill;
          ctx.font = '800 ' + s.size + 'px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(s.s, s.x, s.y);
          continue;
      }
      if (s.fill) { ctx.fillStyle = s.fill; ctx.fill(); }
      if (s.stroke) { ctx.strokeStyle = s.stroke; ctx.lineWidth = s.sw || 4; ctx.stroke(); }
    }
  }

  function round(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  }

  /**
   * Нарисовать аксессуары поверх уже нарисованного силуэта.
   * Вызывается из editor.html -> figure(), система координат — локальная (0,0 → w,h).
   */
  function overlay(ctx, w, h, skin, byId) {
    if (!skin || !window.BFSkin) return;
    var S = window.BFSkin;
    var p = S.parts(skin, byId || window.BF_SKIN_ITEMS || {}, null);
    if (!p.back.length && !p.body.length && !p.face.length && !p.head.length) return;

    var kx = w / S.W, ky = h / S.H;
    ctx.save();
    ctx.scale(kx, ky);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    draw(ctx, p.back);

    if (p.body.length) {
      ctx.save();
      ctx.beginPath();
      round(ctx, 0, S.BODY_TOP, S.W, S.BODY_H, S.BODY_RX);
      ctx.clip();
      draw(ctx, p.body);
      ctx.restore();
    }

    draw(ctx, p.face);
    draw(ctx, p.head);
    ctx.restore();
  }

  // «за спиной» рисуется под силуэтом — отдельный проход
  function behind(ctx, w, h, skin, byId) {
    if (!skin || !window.BFSkin) return;
    var S = window.BFSkin;
    var p = S.parts(skin, byId || window.BF_SKIN_ITEMS || {}, null);
    if (!p.back.length) return;
    ctx.save();
    ctx.scale(w / S.W, h / S.H);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    draw(ctx, p.back);
    ctx.restore();
  }

  // всё, кроме «за спиной» — поверх силуэта
  function front(ctx, w, h, skin, byId) {
    if (!skin || !window.BFSkin) return;
    var S = window.BFSkin;
    var p = S.parts(skin, byId || window.BF_SKIN_ITEMS || {}, null);
    var kx = w / S.W, ky = h / S.H;
    ctx.save();
    ctx.scale(kx, ky);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (p.body.length) {
      ctx.save();
      ctx.beginPath();
      round(ctx, 0, S.BODY_TOP, S.W, S.BODY_H, S.BODY_RX);
      ctx.clip();
      draw(ctx, p.body);
      ctx.restore();
    }
    draw(ctx, p.face);
    draw(ctx, p.head);
    ctx.restore();
  }

  // скины-картинки: держим загруженные изображения в памяти
  var imgs = {};
  function image(url) {
    if (!url) return null;
    if (!imgs[url]) {
      var im = new Image();
      im.src = url;
      imgs[url] = im;
    }
    var i = imgs[url];
    return (i.complete && i.naturalWidth) ? i : null;
  }

  // если у скина есть картинка — она заменяет фигуру целиком
  function picture(ctx, w, h, skin) {
    if (!skin || !skin.img) return false;
    var im = image(skin.img);
    if (!im) return false;
    ctx.save();
    // вписываем по ширине игрока, низом на землю
    var k = w / im.naturalWidth;
    var ih = im.naturalHeight * k;
    ctx.drawImage(im, 0, h - ih, w, ih);
    ctx.restore();
    return true;
  }

  window.BFSkinCanvas = { overlay: overlay, behind: behind, front: front,
                          picture: picture, image: image };
})();
