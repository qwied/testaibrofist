/* AIBROFIST — отрисовка деталей скина на canvas.
   Берёт те же детали, что и SVG (BFSkin.parts), поэтому в игре
   персонаж выглядит ровно так же, как в редакторе скинов. */
(function () {
  'use strict';

  // загруженные картинки деталей держим в памяти: одна деталь — одна <img>
  var imgs = {};
  function image(url) {
    if (!url) return null;
    if (!imgs[url]) { var im = new Image(); im.src = url; imgs[url] = im; }
    var i = imgs[url];
    return (i.complete && i.naturalWidth) ? i : null;
  }

  function draw(ctx, list) {
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (s.t !== 'img') continue;
      var im = image(s.href);
      if (!im) continue;                       // ещё грузится — в следующем кадре будет
      ctx.drawImage(im, s.x, s.y, s.w, s.h);
    }
  }

  /**
   * Нарисовать детали поверх уже нарисованного силуэта.
   * Вызывается из editor.html -> figure(), система координат — локальная (0,0 → w,h).
   */
  function overlay(ctx, w, h, skin, byId) {
    if (!skin || !window.BFSkin) return;
    var S = window.BFSkin;
    var p = S.parts(skin, byId || window.BF_SKIN_ITEMS || {}, null);
    if (!p.body.length && !p.head.length) return;
    ctx.save();
    ctx.scale(w / S.W, h / S.H);
    draw(ctx, p.body);
    draw(ctx, p.head);
    ctx.restore();
  }

  // «за спиной» рисуется под силуэтом. Детали каталога рисуются поверх,
  // поэтому здесь рисовать нечего — вызов оставлен ради старого кода.
  function behind() {}

  // всё поверх силуэта
  function front(ctx, w, h, skin, byId) { overlay(ctx, w, h, skin, byId); }

  window.BFSkinCanvas = { overlay: overlay, behind: behind, front: front, image: image };
})();
