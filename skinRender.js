/* AIBROFIST — фигура персонажа и детали скина.
   Один набор деталей используют и SVG (страницы сайта), и canvas (сама игра),
   поэтому скин выглядит одинаково везде.

   Базовая модель ровно та же, что в игре (editor.html -> figure()):
   круглая голова диаметром w, зазор h*0.049, дальше капсула-тело.
   Цвет тела задаёт игра (роль в прятках), игрок его не меняет.

   Детали каталога — картинки: у каждой в каталоге лежат готовые координаты
   в системе фигуры (x, y, w, h), поэтому голова одного костюма и тело
   другого всегда сходятся по линии шеи. */
(function () {
  'use strict';

  var W = 100, H = 336;
  var HEAD_R = W / 2;
  var BODY_TOP = W + H * 0.049;          // 116.46
  var BODY_H = H - BODY_TOP;             // 219.54
  var BODY_RX = Math.min(W * 0.22, BODY_H / 2);
  var T = BODY_TOP;
  var NECK = 108;                        // середина зазора между головой и телом
  var BASE = '/skinparts/';              // где лежат картинки деталей
  var uid = 0;

  function shade(hex, amt) {
    if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return '#374151';
    var n = parseInt(hex.slice(1), 16);
    var r = Math.max(0, Math.min(255, (n >> 16) + amt));
    var g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    var b = Math.max(0, Math.min(255, (n & 255) + amt));
    return '#' + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);
  }

  /* Деталь каталога -> список фигур. Сейчас деталь всегда одна картинка,
     но список оставлен: так у canvas и SVG общий код обхода. */
  function piece(item, thumb) {
    if (!item || !item.img) return [];
    return [{ t: 'img', href: (thumb ? BASE + 't/' : BASE) + item.img,
              x: item.x, y: item.y, w: item.w, h: item.h }];
  }

  /** Полный набор деталей скина. bodyColor — цвет силуэта, его задаёт игра. */
  function parts(skin, byId, bodyColor, thumb) {
    skin = skin || {}; byId = byId || {};
    return {
      base: bodyColor || '#111827',
      back: [],
      body: piece(byId[skin.body], thumb),
      face: [],
      head: piece(byId[skin.head], thumb)
    };
  }

  /* ---------- вывод в SVG ---------- */
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function shape(s) {
    if (s.t !== 'img') return '';
    return '<image href="' + esc(s.href) + '" xlink:href="' + esc(s.href) + '"'
      + ' x="' + s.x + '" y="' + s.y + '" width="' + s.w + '" height="' + s.h + '"'
      + ' preserveAspectRatio="none"/>';
  }

  function svg(skin, byId, opt) {
    opt = opt || {};
    // скин-картинка: рисуем её вместо фигуры
    if (skin && skin.img) {
      var ih = opt.height || 260;
      var iw = opt.width || Math.round(ih * 0.55);
      return '<svg viewBox="0 0 100 182" width="' + iw + '" height="' + ih + '" ' +
             'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
             '<image href="' + esc(skin.img) + '" xlink:href="' + esc(skin.img) + '" ' +
             'x="0" y="0" width="100" height="182" preserveAspectRatio="xMidYMid meet"/></svg>';
    }
    var p = parts(skin, byId, opt.color, opt.thumb);
    var out = [];

    // силуэт: его цвет задаёт игра, детали ложатся поверх
    out.push('<g fill="' + p.base + '"><circle cx="' + HEAD_R + '" cy="' + HEAD_R + '" r="' + HEAD_R +
             '"/><rect x="0" y="' + T + '" width="' + W + '" height="' + BODY_H +
             '" rx="' + BODY_RX + '"/></g>');
    out.push(p.body.map(shape).join(''));
    out.push(p.head.map(shape).join(''));

    // Рамка с запасом: детали выходят за фигуру — шляпы вверх, плащи и
    // крылья вбок, скейтборд вниз. Витрина магазина просит рамку поуже
    // (opt.crop), чтобы вещь на карточке было видно крупно.
    var PAD = 70, vx = -PAD, vy = -PAD, vw = W + PAD*2, vh = H + PAD*2;
    if (opt.crop) { vx = opt.crop.x; vy = opt.crop.y; vw = opt.crop.w; vh = opt.crop.h; }
    var vb = vx + ' ' + vy + ' ' + vw + ' ' + vh;
    var h = opt.height || 260;
    var w = opt.width || Math.round(h * vw / vh);
    return '<svg viewBox="' + vb + '" width="' + w + '" height="' + h +
           '" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
           out.join('') + '</svg>';
  }

  /* Карточка магазина: одна вещь на светлом силуэте — тёмные детали
     на нём хорошо видны. Берём уменьшенную копию картинки. */
  function preview(item, byId, current, size) {
    var s = { head: 'h_none', body: 'b_none' };
    if (item) s[item.slot] = item.id;
    // рамка по самой вещи вместе с её частью фигуры — иначе на карточке
    // вещь оказывалась крохотной рядом с фигурой в полный рост
    var body = !item || item.slot === 'body';
    var x0 = 0, y0 = body ? T : 0, x1 = W, y1 = body ? H : W;
    if (item && item.img) {
      x0 = Math.min(x0, item.x); y0 = Math.min(y0, item.y);
      x1 = Math.max(x1, item.x + item.w); y1 = Math.max(y1, item.y + item.h);
    }
    var m = 8;
    return svg(s, byId, { height: size || 92, color: '#c9d4de', thumb: true,
      crop: { x: x0 - m, y: y0 - m, w: (x1 - x0) + m * 2, h: (y1 - y0) + m * 2 } });
  }

  /* Скин может быть не набором деталей, а готовой картинкой — такие
     добавляет владелец сайта. Внешняя ссылка внутри data-URI SVG не
     загрузится (это изолированный контекст), поэтому отдаём обычный <img>. */
  function render(skin, byId, opt) {
    opt = opt || {};
    var img = skin && skin.img;
    if (!img) return svg(skin, byId, opt);
    var h = opt.height || 260;
    return '<img src="' + esc(img) + '" alt="" ' +
           'style="height:' + h + 'px;width:auto;max-width:100%;object-fit:contain;display:block;' +
           'margin:0 auto" loading="lazy">';
  }

  window.BFSkin = {
    svg: svg, render: render, preview: preview, parts: parts, shade: shade,
    W: W, H: H, BODY_TOP: T, BODY_H: BODY_H, BODY_RX: BODY_RX, HEAD_R: HEAD_R,
    NECK: NECK, BASE: BASE
  };
})();
