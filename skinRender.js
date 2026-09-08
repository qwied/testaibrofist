/* AIBROFIST — геометрия персонажа и аксессуаров.
   Один набор фигур используют и SVG (страницы сайта), и canvas (сама игра),
   поэтому скин выглядит одинаково везде.

   Базовая модель ровно та же, что в игре (editor.html -> figure()):
   круглая голова диаметром w, зазор h*0.049, дальше капсула-тело.
   Цвет тела задаёт игра (роль в прятках), игрок его не меняет. */
(function () {
  'use strict';

  var W = 100, H = 336;
  var HEAD_R = W / 2;
  var BODY_TOP = W + H * 0.049;          // 116.46
  var BODY_H = H - BODY_TOP;             // 219.54
  var BODY_RX = Math.min(W * 0.22, BODY_H / 2);
  var T = BODY_TOP;
  var uid = 0;

  function shade(hex, amt) {
    if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return '#374151';
    var n = parseInt(hex.slice(1), 16);
    var r = Math.max(0, Math.min(255, (n >> 16) + amt));
    var g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    var b = Math.max(0, Math.min(255, (n & 255) + amt));
    return '#' + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);
  }

  // короткие конструкторы фигур
  var P = function (d, fill, stroke, sw) { return { t:'path', d:d, fill:fill, stroke:stroke, sw:sw }; };
  var R = function (x, y, w, h, rx, fill) { return { t:'rect', x:x, y:y, w:w, h:h, rx:rx||0, fill:fill }; };
  var C = function (cx, cy, r, fill, stroke, sw) {
    return { t:'circle', cx:cx, cy:cy, r:r, fill:fill, stroke:stroke, sw:sw };
  };
  var E = function (cx, cy, rx, ry, fill, stroke, sw) {
    return { t:'ellipse', cx:cx, cy:cy, rx:rx, ry:ry, fill:fill, stroke:stroke, sw:sw };
  };
  var L = function (x1, y1, x2, y2, stroke, sw) {
    return { t:'line', x1:x1, y1:y1, x2:x2, y2:y2, stroke:stroke, sw:sw };
  };
  var TX = function (x, y, s, size, fill) { return { t:'text', x:x, y:y, s:s, size:size, fill:fill }; };

  /* ---------- голова ---------- */
  function head(id, c) {
    var d = shade(c, -38), l = shade(c, 44), o = shade(c, -70);
    switch (id) {
      case 'h_cap':
        return [P('M1 42 A49 50 0 0 1 99 42 L99 50 L1 50 Z', c),
                P('M93 38 q28 4 27 15 q-15 5 -28 -1 z', d),
                P('M12 28 A44 44 0 0 1 48 3', null, l, 5)];
      case 'h_beanie':
        return [P('M2 44 A48 46 0 0 1 98 44 Z', c),
                R(0, 36, 100, 16, 8, l),
                C(50, -12, 13, l), C(50, -12, 6, c)];
      case 'h_bandana':
        return [P('M1 40 A49 48 0 0 1 99 40 L99 52 L1 52 Z', c),
                P('M91 48 q28 4 36 22 q-20 6 -38 -8 z', d),
                C(26, 45, 4, l), C(48, 42, 4, l), C(70, 45, 4, l)];
      case 'h_helmet':
        return [P('M-3 56 A53 57 0 0 1 103 56 L103 63 L-3 63 Z', c),
                P('M-3 56 A53 57 0 0 1 50 -1 L50 63 L-3 63 Z', d),
                R(43, -20, 14, 34, 6, o), C(50, -24, 10, l)];
      case 'h_cowboy':
        return [E(50, 40, 72, 12, d), E(50, 38, 72, 9, c),
                P('M16 38 A36 44 0 0 1 84 38 Z', c),
                P('M16 34 q34 -8 68 0 l0 6 q-34 -6 -68 0 z', o)];
      case 'h_tophat':
        return [E(50, 35, 64, 11, d), E(50, 33, 64, 9, c),
                R(19, -46, 62, 80, 5, c),
                R(19, 12, 62, 16, 0, o),
                P('M19 -46 q31 -8 62 0 l0 10 q-31 -7 -62 0 z', l)];
      case 'h_horns':
        return [P('M16 32 q-28 -34 -2 -50 q20 16 24 40 z', c),
                P('M84 32 q28 -34 2 -50 q-20 16 -24 40 z', c),
                P('M18 26 q-18 -24 -6 -36 q10 12 14 30 z', l),
                P('M82 26 q18 -24 6 -36 q-10 12 -14 30 z', l)];
      case 'h_halo':
        return [E(50, -18, 38, 12, null, o, 11), E(50, -18, 38, 12, null, c, 7)];
      case 'h_crown':
        return [P('M8 38 L8 -18 L30 6 L50 -26 L70 6 L92 -18 L92 38 Z', c),
                R(8, 22, 84, 16, 3, d),
                C(50, 12, 8, l), C(24, 20, 5, l), C(76, 20, 5, l)];
      case 'h_ears':
        return [P('M10 32 L2 -22 L46 8 Z', c), P('M90 32 L98 -22 L54 8 Z', c),
                P('M17 25 L13 -7 L36 11 Z', l), P('M83 25 L87 -7 L64 11 Z', l)];
      case 'h_antenna':
        return [P('M50 2 q6 -36 24 -44', null, o, 9),
                P('M50 2 q6 -36 24 -44', null, c, 5),
                C(74, -42, 12, o), C(74, -42, 9, l)];
      case 'h_hair':
        return [P('M0 44 A50 48 0 0 1 100 44 L100 30 q-13 14 -25 2 q-12 15 -25 2 ' +
                  'q-13 15 -25 0 q-12 12 -25 -2 z', c),
                P('M10 26 A44 44 0 0 1 44 2', null, l, 5)];
      case 'h_bowler':
        return [E(50, 46, 52, 10, d), E(50, 44, 52, 8, c),
                P('M18 45 A32 46 0 0 1 82 45 Z', c),
                P('M18 45 A32 46 0 0 1 82 45', null, d, 3),
                P('M24 34 A28 28 0 0 1 44 12', null, l, 5)];
      case 'h_straw':
        return [E(50, 42, 74, 13, d), E(50, 40, 74, 11, c),
                P('M20 40 A30 42 0 0 1 80 40 Z', c),
                P('M20 38 q30 -10 60 0 l0 8 q-30 -8 -60 0 z', d),
                P('M4 38 q46 14 92 0', null, l, 3)];
      case 'h_pirate':
        return [P('M-2 46 q10 -44 52 -44 q42 0 52 44 q-18 8 -52 8 q-34 0 -52 -8 z', c),
                P('M-2 46 q20 14 52 14 q32 0 52 -14 l0 9 q-22 12 -52 12 q-30 0 -52 -12 z', d),
                C(50, 22, 9, '#f8fafc'), C(46, 20, 2.5, c), C(54, 20, 2.5, c),
                R(45, 28, 10, 5, 2, '#f8fafc')];
      case 'h_wizard':
        return [E(50, 44, 56, 11, d), E(50, 42, 56, 9, c),
                P('M24 44 Q42 -22 54 -18 Q64 -14 78 44 Z', c),
                P('M28 36 q22 -8 44 0', null, o, 6),
                P('M52 10 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 z', '#fde047')];
      case 'h_army':
        return [P('M-4 50 A54 54 0 0 1 104 50 L104 56 L-4 56 Z', c),
                R(-4, 50, 108, 10, 4, d),
                C(30, 32, 6, d), C(66, 26, 5, d), C(50, 44, 5, d),
                P('M8 32 A46 46 0 0 1 40 8', null, l, 5)];
      case 'h_hardhat':
        return [P('M-6 48 q56 18 112 0 l0 9 q-56 16 -112 0 z', d),
                P('M2 48 A48 48 0 0 1 98 48 Z', c),
                R(43, -4, 14, 30, 6, d),
                P('M14 34 A38 38 0 0 1 40 10', null, l, 5)];
      case 'h_chef':
        return [C(28, 16, 20, c), C(50, 4, 24, c), C(72, 16, 20, c),
                R(24, 14, 52, 24, 8, c), R(12, 34, 76, 16, 8, c),
                P('M12 48 q38 8 76 0', null, d, 3),
                L(38, 20, 38, 48, d, 3), L(62, 22, 62, 48, d, 3)];
      case 'h_police':
        return [R(14, 12, 72, 30, 6, c), E(50, 12, 37, 12, c),
                R(14, 34, 72, 12, 4, d),
                P('M10 46 q40 14 80 0 l2 7 q-42 16 -84 0 z', '#0f172a'),
                C(50, 28, 8, '#d4a017'), C(50, 28, 4, '#fbbf24')];
      case 'h_viking':
        return [P('M14 42 Q-14 16 -10 -18 Q8 -6 26 26 z', '#f8fafc'),
                P('M12 38 Q-8 16 -5 -12 Q6 -4 20 24 z', '#cbd5e1'),
                P('M86 42 Q114 16 110 -18 Q92 -6 74 26 z', '#f8fafc'),
                P('M88 38 Q108 16 105 -12 Q94 -4 80 24 z', '#cbd5e1'),
                P('M0 48 A50 50 0 0 1 100 48 L100 56 L0 56 Z', c),
                R(44, -2, 12, 58, 5, d),
                C(20, 44, 3, o), C(80, 44, 3, o)];
      case 'h_ushanka':
        return [P('M4 46 q-10 26 4 40 q10 -4 12 -18 z', c),
                P('M96 46 q10 26 -4 40 q-10 -4 -12 -18 z', c),
                P('M4 46 A46 46 0 0 1 96 46 L96 54 L4 54 Z', c),
                R(4, 44, 92, 14, 7, d),
                C(20, 51, 3, l), C(50, 51, 3, l), C(80, 51, 3, l),
                P('M14 26 A40 40 0 0 1 40 8', null, l, 5)];
      case 'h_santa':
        return [P('M10 40 Q20 -8 58 -18 Q88 -24 78 -2 Q70 16 58 28 L54 40 Z', c),
                R(4, 38, 92, 18, 9, '#f8fafc'),
                P('M4 50 q46 10 92 0', null, '#cbd5e1', 3),
                C(80, -6, 13, '#f8fafc')];
      case 'h_bucket':
        return [P('M12 40 A38 38 0 0 1 88 40 Z', c),
                P('M4 40 q46 20 92 0 l0 9 q-46 18 -92 0 z', d),
                P('M8 45 q42 16 84 0', null, l, 3)];
      case 'h_mohawk':
        return [P('M14 30 L20 -8 L30 22 L38 -14 L48 18 L58 -12 L66 22 L76 -6 L84 30 ' +
                  'q-35 12 -70 0 z', c)];
      case 'h_headphones':
        return [P('M8 50 A42 42 0 0 1 92 50', null, c, 10),
                P('M8 50 A42 42 0 0 1 92 50', null, '#3f3f46', 4),
                R(-2, 40, 20, 34, 9, c), R(82, 40, 20, 34, 9, c),
                R(2, 46, 12, 22, 6, '#3f3f46'), R(86, 46, 12, 22, 6, '#3f3f46')];
      case 'h_headband':
        return [P('M90 42 q18 4 22 18 q-14 2 -24 -6 z', d),
                P('M88 46 q10 10 10 22 q-12 -4 -16 -14 z', d),
                R(2, 32, 96, 14, 7, c),
                P('M6 39 h88', null, l, 4)];
      case 'h_bow':
        return [P('M62 8 q-6 16 -14 22 l10 4 q8 -10 10 -20 z', d),
                P('M66 2 q-26 -22 -34 -2 q-4 12 14 12 q14 0 20 -10 z', c),
                P('M66 2 q26 -22 34 -2 q4 12 -14 12 q-14 0 -20 -10 z', c),
                C(66, 2, 7, d)];
      case 'h_flower':
        return [P('M34 6 q-2 -12 2 -20', null, '#16a34a', 4),
                C(33, -26, 7, c), C(41, -20, 7, c), C(33, -12, 7, c), C(25, -20, 7, c),
                C(33, -20, 5, '#fde047')];
      case 'h_propeller':
        return [P('M18 32 A32 32 0 0 1 82 32 Z', c),
                R(16, 28, 68, 10, 5, d),
                R(47, -12, 6, 22, 3, o),
                P('M50 -12 q-44 -20 -54 2 q-6 14 22 11 q19 -2 32 -13 z', c),
                P('M50 -12 q44 -20 54 2 q6 14 -22 11 q-19 -2 -32 -13 z', d),
                C(50, -12, 7, l)];
      case 'h_unicorn':
        return [P('M42 10 L60 -48 L64 4 Z', c),
                P('M46 -2 L62 -8', null, o, 3),
                P('M49 -16 L63 -20', null, o, 3),
                P('M53 -30 L63 -32', null, o, 3)];
      default: return [];
    }
  }

  /* ---------- лицо ---------- */
  function face(id, c) {
    var d = shade(c, -42), l = shade(c, 52);
    switch (id) {
      case 'f_glasses':
        return [E(29, 52, 18, 16, '#ffffff', null, 0),
                E(71, 52, 18, 16, '#ffffff', null, 0),
                E(29, 52, 18, 16, null, c, 6), E(71, 52, 18, 16, null, c, 6),
                L(47, 52, 53, 52, c, 6), L(11, 50, 2, 46, c, 5), L(89, 50, 98, 46, c, 5)];
      case 'f_shades':
        return [R(6, 40, 88, 26, 11, c),
                P('M12 44 q14 -3 22 2 l-4 8 q-10 -4 -18 -2 z', l),
                R(46, 48, 8, 9, 2, d)];
      case 'f_visor':
        return [P('M0 40 q50 -16 100 0 l0 26 q-50 18 -100 0 z', c),
                P('M8 46 q42 -10 84 0', null, l, 5),
                P('M0 40 q50 -16 100 0 l0 26 q-50 18 -100 0 z', null, d, 3)];
      case 'f_mask':
        return [P('M8 54 Q50 64 92 54 L92 68 Q50 80 8 68 Z', c),
                P('M8 61 Q50 72 92 61', null, d, 3),
                L(8, 56, -5, 48, d, 4), L(92, 56, 105, 48, d, 4)];
      case 'f_eyepatch':
        return [L(2, 28, 98, 60, c, 8),
                R(14, 34, 38, 32, 10, c), R(14, 34, 38, 32, 10, null, d, 3)];
      case 'f_scarf':
        return [R(2, 94, 96, 34, 15, c),
                P('M2 108 q48 14 96 0', null, d, 4),
                P('M64 120 q26 30 22 62 l-24 4 q6 -34 -6 -60 z', d)];
      case 'f_snorkel':
        return [E(50, 54, 40, 17, null, c, 8),
                E(50, 54, 40, 17, '#dbeafe'),
                E(50, 54, 40, 17, null, c, 8),
                P('M88 44 q26 -8 24 -40', null, c, 8)];
      case 'f_round':
        return [E(29, 52, 15, 15, '#ffffff'), E(71, 52, 15, 15, '#ffffff'),
                C(29, 52, 15, null, c, 5), C(71, 52, 15, null, c, 5),
                P('M43 50 q7 -8 14 0', null, c, 5),
                L(14, 50, 2, 46, c, 4), L(86, 50, 98, 46, c, 4)];
      case 'f_monocle':
        return [E(68, 52, 17, 17, '#ffffff'), C(68, 52, 17, null, c, 6),
                P('M82 64 q14 22 2 44', null, c, 3)];
      case 'f_ninja':
        return [P('M0 36 q50 -14 100 0 l0 28 q-50 14 -100 0 z', c),
                P('M14 46 q14 -8 30 -2 l-2 12 q-16 -2 -28 -2 z', '#f8fafc'),
                P('M86 46 q-14 -8 -30 -2 l2 12 q16 -2 28 -2 z', '#f8fafc'),
                P('M98 42 q14 6 18 18 q-12 2 -20 -6 z', d)];
      case 'f_war':
        return [P('M20 22 q10 14 0 24', null, c, 7),
                P('M36 18 q10 16 0 30', null, c, 7),
                P('M64 18 q10 16 0 30', null, c, 7),
                P('M80 22 q10 14 0 24', null, c, 7)];
      case 'f_freckles':
        return [C(20, 64, 3, c), C(29, 60, 3, c), C(26, 68, 3, c),
                C(71, 64, 3, c), C(80, 60, 3, c), C(74, 68, 3, c),
                C(33, 67, 2.5, c), C(67, 67, 2.5, c)];
      case 'f_blush':
        return [E(22, 62, 11, 7, c), E(78, 62, 11, 7, c)];
      case 'f_beard':
        return [P('M8 54 q0 46 42 46 q42 0 42 -46 q-12 16 -42 16 q-30 0 -42 -16 z', c),
                P('M30 66 q20 -12 40 0 q-6 10 -20 8 q-14 2 -20 -8 z', d)];
      case 'f_mustache':
        return [P('M50 68 q-10 -8 -22 -4 q-12 4 -14 12 q14 4 24 -2 q8 -4 12 -6 ' +
                  'q4 2 12 6 q10 6 24 2 q-2 -8 -14 -12 q-12 -4 -22 4 z', c)];
      case 'f_pipe':
        return [P('M54 72 q20 6 32 10', null, c, 6),
                E(90, 86, 10, 9, c),
                C(99, 62, 4, '#cbd5e1'), C(95, 52, 3, '#e5e7eb')];
      case 'f_lolli':
        return [L(58, 78, 80, 64, '#e5e7eb', 4),
                C(86, 56, 13, c), C(86, 56, 13, null, d, 3),
                P('M86 46 q10 4 8 12 q-2 6 -8 6 q-6 0 -6 -6 q0 -5 6 -4', null, '#f8fafc', 3)];
      case 'f_bandage':
        return [P('M14 66 L36 76 L32 86 L10 76 Z', c),
                P('M14 66 L36 76 L32 86 L10 76 Z', null, d, 3),
                C(20, 73, 2, d), C(26, 76, 2, d), C(23, 79, 2, d)];
      case 'f_gas':
        return [L(6, 44, 32, 62, c, 6), L(94, 44, 68, 62, c, 6),
                C(50, 80, 17, c), C(50, 80, 17, null, d, 4),
                C(50, 80, 9, null, l, 4), C(50, 80, 4, d)];
      default: return [];
    }
  }

  /* ---------- рисунок на теле (обрезается по капсуле) ---------- */
  function body(id, c) {
    var d = shade(c, -38), l = shade(c, 46), out;
    switch (id) {
      case 'b_tie':
        out = [P('M34 ' + T + ' L50 ' + (T+30) + ' L66 ' + T + ' Z', l),
               P('M50 ' + (T+28) + ' l-13 20 l6 44 l7 10 l7 -10 l6 -44 z', c),
               R(41, T+26, 18, 12, 3, d)]; break;
      case 'b_belt':
        out = [R(0, T+94, 100, 28, 0, c),
               R(0, T+94, 100, 5, 0, d),
               R(36, T+92, 28, 32, 5, l), R(44, T+102, 12, 12, 2, d)]; break;
      case 'b_stripes':
        out = [];
        for (var i = 0; i < 5; i++) out.push(R(0, T+16+i*40, 100, 20, 0, c));
        break;
      case 'b_vest':
        out = [R(0, T, 28, BODY_H, 0, c), R(72, T, 28, BODY_H, 0, c),
               R(24, T, 5, BODY_H, 0, d), R(71, T, 5, BODY_H, 0, d),
               C(14, T+56, 6, l), C(86, T+56, 6, l)]; break;
      case 'b_number':
        out = [C(50, T+64, 32, c), C(50, T+64, 32, null, l, 4),
               TX(50, T+79, '1', 44, l)]; break;
      case 'b_hoodie':
        out = [P('M-2 ' + T + ' q52 46 104 0 l0 -20 l-104 0 z', c),
               P('M-2 ' + (T+2) + ' q52 44 104 0', null, d, 4),
               P('M33 ' + (T+30) + ' q-6 26 -4 48', null, l, 7),
               P('M67 ' + (T+30) + ' q6 26 4 48', null, l, 7),
               C(33, T+80, 5, l), C(71, T+80, 5, l),
               R(24, T+112, 52, 32, 10, d)]; break;
      case 'b_armor':
        out = [R(0, T, 100, BODY_H*0.66, 0, c),
               R(0, T+44, 100, 9, 0, d), R(0, T+96, 100, 9, 0, d),
               P('M0 ' + (T+BODY_H*0.66) + ' q50 22 100 0 l0 -10 l-100 0 z', d),
               C(50, T+26, 15, d), C(50, T+26, 9, l)]; break;
      case 'b_suit':
        out = [R(0, T, 100, 160, 0, c),
               P('M50 ' + (T+66) + ' L20 ' + T + ' L50 ' + T + ' Z', l),
               P('M50 ' + (T+66) + ' L80 ' + T + ' L50 ' + T + ' Z', l),
               P('M50 ' + (T+66) + ' l-11 16 l11 42 l11 -42 z', '#b91c1c'),
               C(50, T+130, 5, l)]; break;
      case 'b_overall':
        out = [R(0, T+56, 100, BODY_H-56, 0, c),
               R(12, T, 18, 62, 4, c), R(70, T, 18, 62, 4, c),
               C(21, T+60, 8, l), C(79, T+60, 8, l),
               R(30, T+82, 40, 34, 6, d)]; break;
      case 'b_bowtie':
        out = [P('M50 ' + (T+14) + ' L20 ' + (T+2) + ' Q14 ' + (T+14) + ' 20 ' + (T+26) + ' Z', c),
               P('M50 ' + (T+14) + ' L80 ' + (T+2) + ' Q86 ' + (T+14) + ' 80 ' + (T+26) + ' Z', c),
               R(45, T+9, 10, 10, 3, d)]; break;
      case 'b_button':
        out = [C(50, T+30, 7, c), C(50, T+54, 7, c), C(50, T+78, 7, c), C(50, T+102, 7, c),
               L(46, T+27, 54, 33, d, 2), L(54, T+27, 46, 33, d, 2),
               L(46, T+51, 54, 57, d, 2), L(54, T+51, 46, 57, d, 2),
               L(46, T+75, 54, 81, d, 2), L(54, T+75, 46, 81, d, 2),
               L(46, T+99, 54, 105, d, 2), L(54, T+99, 46, 105, d, 2)]; break;
      case 'b_zip':
        out = [L(46, T+6, 46, T+118, c, 4), L(54, T+6, 54, T+118, c, 4),
               L(46, T+16, 54, T+16, c, 4), L(46, T+34, 54, T+34, c, 4),
               L(46, T+52, 54, T+52, c, 4),
               R(44, T+118, 12, 20, 4, d), C(50, T+126, 3, l)]; break;
      case 'b_star':
        out = [P('M50 ' + (T+16) + ' L60 ' + (T+44) + ' L90 ' + (T+46) + ' L66 ' + (T+64) +
                 ' L74 ' + (T+94) + ' L50 ' + (T+76) + ' L26 ' + (T+94) + ' L34 ' + (T+64) +
                 ' L10 ' + (T+46) + ' L40 ' + (T+44) + ' Z', c),
               P('M50 ' + (T+16) + ' L60 ' + (T+44) + ' L90 ' + (T+46) + ' L66 ' + (T+64) +
                 ' L74 ' + (T+94) + ' L50 ' + (T+76) + ' L26 ' + (T+94) + ' L34 ' + (T+64) +
                 ' L10 ' + (T+46) + ' L40 ' + (T+44) + ' Z', null, d, 3)]; break;
      case 'b_heart':
        out = [P('M50 ' + (T+88) + ' C20 ' + (T+64) + ' 16 ' + (T+34) + ' 38 ' + (T+30) +
                 ' C46 ' + (T+28) + ' 50 ' + (T+36) + ' 50 ' + (T+40) +
                 ' C50 ' + (T+36) + ' 54 ' + (T+28) + ' 62 ' + (T+30) +
                 ' C84 ' + (T+34) + ' 80 ' + (T+64) + ' 50 ' + (T+88) + ' Z', c),
               C(34, T+44, 5, l)]; break;
      case 'b_skull':
        out = [C(50, T+52, 24, c), R(38, T+64, 24, 16, 6, c),
               C(42, T+48, 5, d), C(58, T+48, 5, d),
               P('M50 ' + (T+56) + ' l-4 8 l8 0 z', d),
               L(44, T+74, 44, T+80, d, 2), L(50, T+76, 50, T+82, d, 2),
               L(56, T+74, 56, T+80, d, 2)]; break;
      case 'b_bolt':
        out = [P('M56 ' + (T+14) + ' L30 ' + (T+58) + ' L46 ' + (T+58) + ' L40 ' + (T+96) +
                 ' L72 ' + (T+48) + ' L54 ' + (T+48) + ' Z', c),
               P('M56 ' + (T+14) + ' L30 ' + (T+58) + ' L46 ' + (T+58) + ' L40 ' + (T+96) +
                 ' L72 ' + (T+48) + ' L54 ' + (T+48) + ' Z', null, d, 3)]; break;
      case 'b_pocket':
        out = [R(12, T+44, 26, 26, 4, c), R(62, T+44, 26, 26, 4, c),
               P('M12 ' + (T+52) + ' h26', null, d, 3), P('M62 ' + (T+52) + ' h26', null, d, 3),
               C(25, T+58, 2.5, d), C(75, T+58, 2.5, d)]; break;
      case 'b_splash':
        out = [C(30, T+40, 10, c), C(66, T+70, 13, c), C(36, T+100, 7, c), C(72, T+26, 6, c),
               C(48, T+58, 4, c), C(24, T+74, 4, c)]; break;
      case 'b_camo':
        out = [C(20, T+30, 14, c), C(78, T+44, 16, c), C(30, T+86, 15, c),
               C(70, T+110, 13, c), C(50, T+60, 11, d), C(10, T+122, 10, d), C(90, T+84, 10, l)]; break;
      case 'b_suspenders':
        out = [R(22, T, 16, 112, 3, c), R(62, T, 16, 112, 3, c),
               C(30, T+104, 5, '#fbbf24'), C(70, T+104, 5, '#fbbf24')]; break;
      case 'b_sash':
        out = [P('M-6 ' + (T+18) + ' L106 ' + (T+86) + ' L106 ' + (T+110) + ' L-6 ' + (T+42) + ' Z', c),
               P('M-6 ' + (T+30) + ' L106 ' + (T+98), null, d, 4)]; break;
      case 'b_medal':
        out = [P('M38 ' + (T+16) + ' l12 36 l-9 2 z', '#b91c1c'),
               P('M62 ' + (T+16) + ' l-12 36 l9 2 z', '#b91c1c'),
               C(50, T+60, 13, c), C(50, T+60, 13, null, d, 3), C(45, T+55, 3, l)]; break;
      case 'b_bandolier':
        out = [P('M-6 ' + (T+84) + ' L106 ' + (T+12) + ' L106 ' + (T+30) + ' L-6 ' + (T+102) + ' Z', c),
               C(20, T+92, 5, '#fbbf24'), C(40, T+78, 5, '#fbbf24'),
               C(60, T+64, 5, '#fbbf24'), C(80, T+50, 5, '#fbbf24')]; break;
      case 'b_chain':
        out = [P('M18 ' + (T+6) + ' q32 44 64 0', null, c, 6),
               C(50, T+52, 9, c), C(50, T+52, 9, null, d, 3), C(50, T+52, 3, l)]; break;
      default: return [];
    }
    out.forEach(function (s) { s.clip = true; });
    return out;
  }

  /* ---------- за спиной ---------- */
  function back(id, c) {
    var d = shade(c, -38), l = shade(c, 44);
    switch (id) {
      case 'k_cape':
        return [P('M4 ' + (T+2) + ' L96 ' + (T+2) + ' L134 ' + (H+6) +
                  ' Q50 ' + (H-34) + ' -34 ' + (H+6) + ' Z', c),
                P('M50 ' + (T+2) + ' L50 ' + (H-28) + ' Q6 ' + (H-16) + ' -34 ' + (H+6) + ' Z', d),
                R(2, T-2, 96, 16, 8, l)];
      case 'k_wings':
        return [P('M14 ' + (T+16) + ' q-58 -44 -104 26 q-14 46 12 62 q28 -44 92 -22 z', c, d, 5),
                P('M86 ' + (T+16) + ' q58 -44 104 26 q14 46 -12 62 q-28 -44 -92 -22 z', c, d, 5),
                P('M12 ' + (T+50) + ' q-40 -12 -70 14', null, d, 4),
                P('M88 ' + (T+50) + ' q40 -12 70 14', null, d, 4)];
      case 'k_jetpack':
        return [R(-26, T+14, 36, 118, 17, c), R(90, T+14, 36, 118, 17, c),
                R(-26, T+14, 36, 22, 11, d), R(90, T+14, 36, 22, 11, d),
                P('M-18 ' + (T+134) + ' q10 46 20 0 z', '#fbbf24'),
                P('M98 ' + (T+134) + ' q10 46 20 0 z', '#fbbf24'),
                P('M-14 ' + (T+134) + ' q6 26 12 0 z', '#f97316'),
                P('M102 ' + (T+134) + ' q6 26 12 0 z', '#f97316')];
      case 'k_bag':
        return [R(-20, T+22, 140, 112, 22, c),
                R(-20, T+22, 140, 22, 11, d),
                R(20, T+52, 60, 40, 10, d), R(44, T+64, 12, 16, 3, l)];
      case 'k_tail':
        return [P('M74 ' + (H-34) + ' q86 16 66 -88 q-20 70 -66 58 z', c),
                P('M92 ' + (H-42) + ' q52 6 44 -54', null, l, 5)];
      case 'k_shell':
        return [E(50, T+BODY_H*0.55, 80, BODY_H*0.44, c),
                E(50, T+BODY_H*0.55, 80, BODY_H*0.44, null, d, 6),
                E(50, T+BODY_H*0.55, 54, BODY_H*0.29, null, d, 5),
                E(50, T+BODY_H*0.55, 28, BODY_H*0.15, null, d, 5)];
      case 'k_butterfly':
        return [P('M22 ' + (T+16) + ' q-56 -36 -74 8 q-8 26 24 26 q32 0 50 -20 z', c, d, 5),
                P('M78 ' + (T+16) + ' q56 -36 74 8 q8 26 -24 26 q-32 0 -50 -20 z', c, d, 5),
                P('M26 ' + (T+50) + ' q-44 -4 -54 26 q-6 24 20 22 q26 -4 34 -32 z', d),
                P('M74 ' + (T+50) + ' q44 -4 54 26 q6 24 -20 22 q-26 -4 -34 -32 z', d),
                C(-14, T+34, 6, l), C(114, T+34, 6, l),
                C(-8, T+66, 4, l), C(108, T+66, 4, l)];
      case 'k_bat':
        return [P('M18 ' + (T+12) + ' q-46 -26 -78 8 l12 4 l-9 11 l15 2 l-7 13 l16 -2 ' +
                  'l-2 12 q30 -6 36 -34 z', c),
                P('M82 ' + (T+12) + ' q46 -26 78 8 l-12 4 l9 11 l-15 2 l7 13 l-16 -2 ' +
                  'l2 12 q-30 -6 -36 -34 z', c)];
      case 'k_quiver':
        return [P('M78 ' + (T+64) + ' q-40 -34 -44 -70', null, d, 7),
                L(90, T+40, 90, 34, '#d4a017', 4),
                L(104, T+40, 104, 28, '#d4a017', 4),
                L(118, T+40, 118, 40, '#d4a017', 4),
                P('M86 38 L90 26 L94 38 Z', '#94a3b8'),
                P('M100 32 L104 20 L108 32 Z', '#94a3b8'),
                P('M114 44 L118 32 L122 44 Z', '#94a3b8'),
                R(74, T+44, 36, 104, 12, c), R(74, T+44, 36, 18, 8, d)];
      case 'k_sword':
        return [C(134, 18, 8, '#d4a017'),
                R(127, 24, 14, 46, 7, '#8b5a2b'),
                P('M112 72 L156 72 L154 84 L114 84 Z', '#d4a017'),
                P('M127 86 L141 86 L130 ' + (T+116) + ' L118 ' + (T+100) + ' Z', c),
                P('M134 90 L127 ' + (T+104), null, l, 3)];
      case 'k_shield':
        return [C(50, T+90, 78, c), C(50, T+90, 78, null, d, 6),
                C(50, T+90, 54, null, l, 4), C(50, T+90, 12, d), C(46, T+84, 4, l)];
      case 'k_axe':
        return [P('M148 ' + (T-38) + ' L96 ' + (T+124), null, '#8b5a2b', 12),
                P('M116 ' + (T-60) + ' q48 -12 54 32 q4 30 -18 42 ' +
                  'q-26 -8 -34 -36 q-8 -24 -2 -38 z', c),
                P('M158 ' + (T-42) + ' q12 20 3 44', null, l, 5),
                R(138, T-54, 14, 14, 4, '#8b5a2b')];
      case 'k_balloon':
        return [P('M120 ' + (T-28) + ' q10 40 2 84 q-4 18 -18 26', null, d, 3),
                E(122, T-70, 27, 34, c),
                E(131, T-82, 7, 11, l),
                P('M116 ' + (T-38) + ' l12 0 l-6 9 z', d)];
      case 'k_parrot':
        return [P('M96 ' + (T+10) + ' l-12 44 l14 2 l10 -40 z', '#b91c1c'),
                E(124, T-30, 20, 30, '#e04141'),
                E(124, T-26, 11, 20, '#16a34a'),
                C(124, T-52, 11, '#e04141'),
                P('M133 ' + (T-56) + ' q12 2 10 10 q-6 4 -12 0 z', '#fbbf24'),
                C(126, T-54, 2.5, '#111827')];
      case 'k_fairy':
        return [E(10, T+30, 32, 17, c, d, 4), E(90, T+30, 32, 17, c, d, 4),
                E(6, T+64, 24, 13, c, d, 3), E(94, T+64, 24, 13, c, d, 3),
                E(12, T+28, 19, 9, l), E(88, T+28, 19, 9, l)];
      case 'k_skateboard':
        return [C(36, T+150, 8, '#f8fafc'), C(138, T+88, 8, '#f8fafc'),
                C(36, T+150, 3.5, d), C(138, T+88, 3.5, d),
                P('M10 ' + (T+142) + ' L152 ' + (T+68) + ' L158 ' + (T+86) +
                  ' L16 ' + (T+160) + ' Z', c),
                P('M16 ' + (T+148) + ' L154 ' + (T+74), null, d, 3)];
      default: return [];
    }
  }

  var DEF = { head:'#e04141', face:'#374151', body:'#2196F3', back:'#b91c1c' };

  /** Полный набор фигур скина. bodyColor — цвет силуэта, его задаёт игра. */
  function parts(skin, byId, bodyColor) {
    skin = skin || {}; byId = byId || {};
    var col = function (slot) {
      var it = byId[skin[slot]];
      return (it && it.v) ? it.v : DEF[slot];
    };
    var base = bodyColor || '#111827';
    return {
      base: base,
      back: back(skin.back, col('back')),
      body: body(skin.body, col('body')),
      face: face(skin.face, col('face')),
      head: head(skin.head, col('head'))
    };
  }

  /* ---------- вывод в SVG ---------- */
  function shape(s) {
    var a = (s.fill ? ' fill="' + s.fill + '"' : ' fill="none"') +
            (s.stroke ? ' stroke="' + s.stroke + '" stroke-width="' + (s.sw || 4) + '"' : '');
    switch (s.t) {
      case 'path':    return '<path d="' + s.d + '"' + a + '/>';
      case 'rect':    return '<rect x="' + s.x + '" y="' + s.y + '" width="' + s.w +
                             '" height="' + s.h + '" rx="' + s.rx + '"' + a + '/>';
      case 'circle':  return '<circle cx="' + s.cx + '" cy="' + s.cy + '" r="' + s.r + '"' + a + '/>';
      case 'ellipse': return '<ellipse cx="' + s.cx + '" cy="' + s.cy + '" rx="' + s.rx +
                             '" ry="' + s.ry + '"' + a + '/>';
      case 'line':    return '<line x1="' + s.x1 + '" y1="' + s.y1 + '" x2="' + s.x2 +
                             '" y2="' + s.y2 + '"' + a + ' stroke-linecap="round"/>';
      case 'text':    return '<text x="' + s.x + '" y="' + s.y + '" text-anchor="middle" font-size="' +
                             s.size + '" font-weight="800" font-family="sans-serif" fill="' + s.fill +
                             '">' + s.s + '</text>';
      default: return '';
    }
  }

  function svg(skin, byId, opt) {
    opt = opt || {};
    // скин-картинка: рисуем её вместо векторной фигуры
    if (skin && skin.img) {
      var ih = opt.height || 260;
      var iw = opt.width || Math.round(ih * 0.55);
      return '<svg viewBox="0 0 100 182" width="' + iw + '" height="' + ih + '" ' +
             'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
             '<image href="' + String(skin.img).replace(/"/g, '&quot;') + '" ' +
             'xlink:href="' + String(skin.img).replace(/"/g, '&quot;') + '" ' +
             'x="0" y="0" width="100" height="182" preserveAspectRatio="xMidYMid meet"/></svg>';
    }
    var p = parts(skin, byId, opt.color);
    var id = 'bf' + (++uid);
    var out = [];

    out.push(p.back.map(shape).join(''));
    out.push('<g fill="' + p.base + '"><circle cx="' + HEAD_R + '" cy="' + HEAD_R + '" r="' + HEAD_R +
             '"/><rect x="0" y="' + T + '" width="' + W + '" height="' + BODY_H +
             '" rx="' + BODY_RX + '"/></g>');
    if (p.body.length) {
      out.push('<clipPath id="' + id + '"><rect x="0" y="' + T + '" width="' + W +
               '" height="' + BODY_H + '" rx="' + BODY_RX + '"/></clipPath>' +
               '<g clip-path="url(#' + id + ')">' + p.body.map(shape).join('') + '</g>');
    }
    out.push(p.face.map(shape).join(''));
    out.push(p.head.map(shape).join(''));

    // Одна рамка на все случаи: фигура целиком с запасом на плащ и крылья.
    // Раньше для круглых иконок была отдельная «портретная» обрезка,
    // но она показывала только голову — по ней было не узнать скин.
    var PAD = 62;
    var vb = (-PAD) + ' ' + (-PAD) + ' ' + (W + PAD*2) + ' ' + (H + PAD*2);
    var vw = W + PAD*2, vh = H + PAD*2;
    var h = opt.height || 260;
    var w = opt.width || Math.round(h * vw / vh);
    return '<svg viewBox="' + vb + '" width="' + w + '" height="' + h +
           '" xmlns="http://www.w3.org/2000/svg">' + out.join('') + '</svg>';
  }

  /* Карточка магазина: выбранная вещь на светлом силуэте — тёмные
     аксессуары (очки, бабочка, крылья мыши) на нём хорошо видны. */
  function preview(item, byId, current, size) {
    var s = { head:'h_none', face:'f_none', body:'b_none', back:'k_none' };
    s[item.slot] = item.id;
    return svg(s, byId, { height: size || 92, color: '#c9d4de' });
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    W: W, H: H, BODY_TOP: T, BODY_H: BODY_H, BODY_RX: BODY_RX, HEAD_R: HEAD_R
  };
})();
