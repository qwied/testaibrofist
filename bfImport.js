/* AIBROFIST — импорт карт из оригинального brofist.io.
   Оригинал хранит сцену так: массив байтов со знаком в .txt, внутри —
   поток LZMA, внутри — JSON вида
     [{x,y,angle,mass,id,shapes:[{x,y,width,height,angle,radius,alpha,
                                  id,collision,color,fontSize,text,make,type}]}]
   Координаты тела — центр в мире, координаты фигуры — смещение от него.
   Здесь всё это переводится в объекты нашего редактора. */
(function (root) {
  'use strict';

  // Игрок в оригинале 30x100, у нас 22x74 — приводим карту к нашему масштабу,
  // иначе прыжки и проходы не совпадут по ширине персонажа.
  var SCALE = 22 / 30;

  // Расшифровано по реальным картам:
  //   1 прямоугольник, 2 круг, 3 текст (есть fontSize и text), 5 треугольник.
  //   4 в присланных картах не встречался — считаем прямоугольником.
  var TYPE = { 1: 'rect', 2: 'circle', 3: 'text', 4: 'rect', 5: 'triangle' };

  // Части механизмов: оригинал рисует рычаг из палочек и шариков,
  // наш редактор рисует его сам — эти фигуры пропускаем.
  var MECH_PARTS = ['leftstick', 'leftball', 'rightstick', 'rightball'];

  // как называются объекты в оригинале -> что это у нас
  var BY_ID = [
    [/^leaver|^lever|^switch/,           'lever'],
    [/^button|^plate|^pedal/,            'button'],
    [/^spawn|start|player/,              'spawn'],
    [/seeker|hunter|catcher|^it$/,       'seeker'],
    [/finish|goal|end/,                  'finishline'],
    [/checkpoint|^check/,                'checkpoint'],
    [/coin|money|credit|gold/,           'coin'],
    [/spike|lava|poison|acid|death|kill|damage|hurt|deadly/, 'DEADLY'],
    [/bounce|jump|trampolin|spring/,     'bounce'],
    [/platform|mover|moving|elevator/,   'platform'],
    [/rotator|spinner|rotate|blade|saw/, 'rotator'],
    [/^gate/,                            'gate'],
    [/^door/,                            'door'],
    [/cover|hide|bush/,                  'cover']
  ];

  function mapId(id) {
    var s = String(id || '').toLowerCase().trim();
    if (!s) return '';
    for (var i = 0; i < BY_ID.length; i++) if (BY_ID[i][0].test(s)) return BY_ID[i][1];
    return '';
  }

  function colorOf(c) {
    var s = String(c == null ? '' : c);
    var m = s.match(/^0x([0-9a-f]{6})$/i) || s.match(/^#?([0-9a-f]{6})$/i);
    return m ? '#' + m[1].toLowerCase() : '';
  }

  /**
   * Разобрать содержимое .txt из оригинала.
   * @param {string} text содержимое файла
   * @returns {Array} массив тел сцены
   */
  function parseScene(text) {
    var s = String(text).trim();
    var bytes;

    if (s[0] === '[') {
      var arr;
      try { arr = JSON.parse(s); }
      catch (e) { throw new Error('Файл не похож на карту brofist.io: не читается список байтов'); }
      // уже готовый JSON сцены?
      if (arr.length && typeof arr[0] === 'object') return arr;
      bytes = arr;
    } else if (/^[-\d,\s]+$/.test(s)) {
      bytes = s.split(/[,\s]+/).filter(Boolean).map(Number);
    } else {
      // вдруг это просто JSON сцены без обёртки
      try { return JSON.parse(s); }
      catch (e2) { throw new Error('Не понимаю формат файла'); }
    }

    if (!root.BFLZMA) throw new Error('Не загружен распаковщик lzma.js');
    var json = root.BFLZMA.decompressToString(bytes);
    var scene;
    try { scene = JSON.parse(json); }
    catch (e3) { throw new Error('Внутри файла не JSON — возможно, версия карты другая'); }
    if (!Array.isArray(scene)) throw new Error('Ожидался список объектов сцены');
    return scene;
  }

  /**
   * Перевести сцену оригинала в объекты нашего редактора.
   * @param {Array} scene
   * @param {object} opt {mode, objLimit, coinLimit, allowed(type,mode)}
   */
  function convert(scene, opt) {
    opt = opt || {};
    var mode = opt.mode || 'sandbox';
    var objLimit = opt.objLimit || 2000;
    var coinLimit = opt.coinLimit || 3;
    var allowed = opt.allowed || function () { return true; };

    // Углы в оригинале — градусы. Проверено на карте с рычагами:
    // тело повёрнуто на 30, а его фигуры на -30 и 120.
    var toDeg = 1;

    var out = [], id = 1, coins = 0;
    var stats = { total: 0, skipped: 0, spawn: 0, coinsCut: 0, wrongMode: 0, overLimit: 0, ghosts: 0 };
    var spawnDone = false;

    scene.forEach(function (body) {
      var bx = +body.x || 0, by = +body.y || 0;
      var bAng = (+body.angle || 0) * toDeg;
      var rad = bAng * Math.PI / 180;
      var cs = Math.cos(rad), sn = Math.sin(rad);
      var bodyKind = mapId(body.id);

      (body.shapes || []).forEach(function (sh) {
        stats.total++;

        var alpha = sh.alpha === undefined ? 1 : +sh.alpha;
        var rawId = String(sh.id || '').toLowerCase();
        var kind = mapId(sh.id) || bodyKind;

        // палочки и шарики рычага — наш редактор рисует механизм сам
        if (MECH_PARTS.indexOf(rawId) !== -1) { stats.skipped++; return; }

        // невидимые служебные фигуры пропускаем, но у точки старта это
        // габаритная рамка, а у кнопки — её рабочая зона
        if (alpha === 0 && kind !== 'spawn' && kind !== 'button' && kind !== 'lever') {
          stats.skipped++; return;
        }

        var shType = TYPE[sh.type] || 'rect';
        var w = Math.abs(+sh.width || 0) * SCALE;
        var h = Math.abs(+sh.height || 0) * SCALE;
        if (shType === 'circle' && (!w || !h)) {
          var r = Math.abs(+sh.radius || 0) * SCALE;
          w = h = r * 2;
        }
        if (w < 0.5 || h < 0.5) { stats.skipped++; return; }

        // смещение фигуры внутри тела поворачивается вместе с телом
        var ox = (+sh.x || 0) * SCALE, oy = (+sh.y || 0) * SCALE;
        var wx = bx * SCALE + ox * cs - oy * sn;
        var wy = by * SCALE + ox * sn + oy * cs;

        var type = shType, deadly = false, ghost = false;

        if (kind === 'spawn') {
          // у точки старта в оригинале три фигуры: рамка, голова и тело.
          // Нам нужна одна — берём габаритную рамку.
          if (spawnDone || alpha !== 0) { stats.skipped++; return; }
          spawnDone = true; stats.spawn++;
          type = 'spawn';
        } else if (kind === 'DEADLY') {
          deadly = true;
        } else if (kind) {
          type = kind;
        }

        if (sh.text) { type = 'text'; }

        // сквозные декорации: в оригинале это фигуры без столкновений
        if (type !== 'text' && type !== 'spawn' && sh.collision === false &&
            ['coin','checkpoint','finishline','seeker','button','lever'].indexOf(type) === -1) {
          ghost = true; stats.ghosts++;
        }

        if (!allowed(type, mode)) { stats.wrongMode++; return; }

        if (type === 'coin') {
          if (coins >= coinLimit) { stats.coinsCut++; return; }
          coins++;
        }
        if (out.length >= objLimit) { stats.overLimit++; return; }

        var o = {
          id: id++,
          type: type,
          x: wx - w / 2,
          y: wy - h / 2,
          w: w, h: h,
          rot: bAng + (+sh.angle || 0) * toDeg,
          fill: colorOf(sh.color),
          deadly: deadly
        };
        if (ghost) o.ghost = true;

        // «leaver:g1» — часть после двоеточия это цель механизма
        if ((type === 'lever' || type === 'button') && rawId.indexOf(':') !== -1) {
          var link = String(sh.id).slice(String(sh.id).indexOf(':') + 1).trim();
          if (link) o.targets = link;
          o.ghost = false;
        }
        if (type === 'gate' || type === 'door') o.ghost = false;
        if (type === 'text') {
          o.text = String(sh.text || '');
          o.deadly = false; o.ghost = false;
          var fs = parseFloat(sh.fontSize);
          if (fs > 0) o.size = Math.round(fs * SCALE);
        }
        if (type === 'spawn') { o.fill = ''; o.rot = 0; o.deadly = false; }
        out.push(o);
      });
    });

    // если точки старта в карте не было — ставим над самым верхним объектом
    if (!spawnDone && out.length) {
      var minY = Infinity, atX = 0;
      out.forEach(function (o) { if (o.y < minY) { minY = o.y; atX = o.x; } });
      out.unshift({ id: id++, type: 'spawn', x: atX, y: minY - 120,
                    w: 22, h: 74, rot: 0, fill: '', deadly: false });
      // точка старта важнее последнего блока — она не должна выбить лимит
      while (out.length > objLimit) { out.pop(); stats.overLimit++; }
      stats.spawn = 0;
    }

    return { objects: out, stats: stats, coins: coins, degrees: toDeg === 1 };
  }

  /** Какому режиму карта подходит по своим объектам. */
  function suggestMode(scene) {
    var has = {};
    scene.forEach(function (b) {
      (b.shapes || []).forEach(function (sh) {
        var k = mapId(sh.id) || mapId(b.id);
        if (k) has[k] = true;
      });
    });
    if (has.lever || has.button || has.door) return 'twoPlayer';
    if (has.finishline || has.checkpoint) return 'race';
    if (has.seeker || has.cover) return 'hideAndSeek';
    return '';
  }

  function importText(text, opt) {
    return convert(parseScene(text), opt);
  }

  var api = { parseScene: parseScene, convert: convert, importText: importText,
              suggestMode: suggestMode, SCALE: SCALE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BFImport = api;
})(typeof window !== 'undefined' ? window : globalThis);
