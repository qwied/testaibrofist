/* AIBROFIST — инструменты владельца сайта.
   Всё, что тут есть, видно и работает ТОЛЬКО для аккаунта-владельца:
   сервер повторно проверяет права на каждый запрос, кнопки — лишь удобная обёртка. */
(function () {
  'use strict';
  if (window.BFOffline) return;

  var me = { owner: false, name: '', ownerName: 'AIBrofist' };
  var inGame = {};          // "автор::карта" -> [режимы]
  // режимов, кроме этих двух, в игре нет
  var MODES = ['hideAndSeek', 'race'];
  var MODE_RU = { hideAndSeek: 'Hide and Seek', race: 'Race' };
  var T = function (k, fallback) {
    return (window.I18N && window.I18N.t(k) !== k) ? I18N.t(k) : (fallback || k);
  };
  var keyOf = function (a, m) {
    return String(a || '').toLowerCase() + '::' + String(m || '').toLowerCase();
  };
  /* Имя карты идёт через cleanText на сервере (см. server.js), а не через
     более строгий cleanName, которым чистятся только ники, — "<", ">",
     "\"" и т.п. из названия карты не вырезаются. Список "в игре" ниже
     рендерит имя карты и автора прямо панели владельца — без экранирования
     это был бы stored XSS с правами владельца сайта при первом же открытии
     панели после того, как такую карту один раз добавили в режим. */
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c];
    });
  };

  /* Та же лестница букв, что и в ranks.js (RANK_ORDER) — своя копия:
     это браузерный скрипт без доступа к серверным модулям. */
  var RANKS = ['S', 'A+', 'A', 'B+', 'B', 'C+', 'C'];
  function ladderInputsHtml(group, label, tiers) {
    var byRank = {}; (tiers || []).forEach(function (t) { byRank[t.rank] = t.ms; });
    var rows = RANKS.map(function (r) {
      var sec = byRank[r] > 0 ? (Math.round(byRank[r] / 100) / 10) : '';
      return '<div class="ow-ladder-row">'
        + '<span class="ow-ladder-rank" data-r="' + esc(r) + '">' + esc(r) + '</span>'
        + '<input class="ow-i" type="number" step="0.1" min="0" '
        +   'data-ladder="' + group + '" data-rank="' + esc(r) + '" value="' + esc(String(sec)) + '" placeholder="seconds">'
        + '</div>';
    }).join('');
    return '<div class="ow-sub" style="margin-top:10px">' + esc(label) + '</div>' + rows;
  }

  function post(url, data) {
    var body = Object.keys(data).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(data[k]);
    }).join('&');
    return fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body
    }).then(function (r) { return r.json(); });
  }
  function get(url) {
    return fetch(url, { credentials: 'same-origin' })
      .then(function (r) { return r.json(); });
  }
  // сеть может отвалиться в любой момент — необработанных отказов быть не должно
  window.addEventListener('unhandledrejection', function (e) {
    if (e && e.reason && /Failed to fetch|NetworkError/.test(String(e.reason))) e.preventDefault();
  });

  /* ---------- стили ---------- */
  var css = ''
    + '.ow-fab{position:fixed;right:18px;bottom:18px;z-index:9997;width:52px;height:52px;border-radius:50%;'
    /* В игре на телефоне внизу лежит панель управления (#pad во всю
       ширину, ~116px), и кнопка вставала ровно на JUMP — нажать прыжок
       в правом углу было нельзя. Поднимаем её над панелью, а заодно над
       парой «чат + Messages», которая теперь стоит в том же углу на
       отметке 150px и занимает 58px в высоту (см. game.js). */
    /* max-width здесь не годится: viewport теперь закреплён на 1280px
       (десктопный вид на телефоне), и innerWidth всегда ~1280 независимо
       от реального экрана. pointer:coarse — признак самого устройства,
       не страницы, и не ломается этим пином. */
    + '@media (pointer:coarse){body.play.mob .ow-fab{bottom:220px}}'
    /* Раньше фон был фиксированным тёмно-серым (#1f2937/#111827) — на
       тёмной теме (фон страницы ~#16181d, см. theme.js) кнопка сливалась
       с подложкой почти целиком, виден был только голый текст без формы.
       Синий — как у Admin Abuse красный: свой цвет, не зависящий от темы,
       поэтому кружок виден всегда одинаково. Строгий дизайн — тот же
       смысл, но чёрный вместо синего: тёмная тема здесь всё равно не
       страница theme.js (см. .ow-fab в theme.js, свой p.dark), а светлая
       разметка редактора/игры, где чёрный на белом читается прекрасно. */
    + 'display:flex;align-items:center;justify-content:center;'
    + 'background:#111827;color:#fff;border:none;cursor:pointer;'
    + 'box-shadow:0 6px 18px rgba(17,24,39,.4);transition:transform .15s,box-shadow .15s}'
    + '.ow-fab svg{width:21px;height:21px;flex:none}'
    + '.ow-fab:hover{transform:translateY(-1px);box-shadow:0 8px 22px rgba(17,24,39,.5)}'
    + '.ow-ov{position:fixed;top:0;right:0;bottom:0;left:0;inset:0;width:100%;height:100%;'
    + 'background:rgba(15,23,42,.55);backdrop-filter:blur(1px);z-index:9998;display:none}'
    + '.ow-box{position:fixed;top:0;right:0;bottom:0;left:0;inset:0;margin:auto;width:360px;max-height:86vh;overflow:auto;height:max-content;'
    + 'background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px 18px 16px;z-index:9999;'
    + 'box-shadow:0 20px 50px rgba(0,0,0,.25);'
    + 'display:none;font-family:sans-serif;color:var(--ink);box-sizing:border-box}'
    + '.ow-x{position:absolute;right:10px;top:10px;width:26px;height:26px;border:none;border-radius:50%;font-size:13px;'
    + 'color:var(--muted);background:rgba(148,163,184,.15);cursor:pointer;line-height:1;'
    + 'display:flex;align-items:center;justify-content:center}'
    + '.ow-x:hover{background:#dc2626;color:#fff}'
    /* Шапка с аватаркой-инициалом владельца — чисто косметика, но сразу
       видно, что это именно его персональная панель, а не общая настройка. */
    + '.ow-h2{display:flex;align-items:center;gap:10px;margin:2px 26px 14px 2px;padding-bottom:12px;border-bottom:1px solid var(--line)}'
    + '.ow-h2-ava{width:36px;height:36px;border-radius:50%;flex:0 0 36px;display:flex;align-items:center;justify-content:center;'
    + 'background:#111827;color:#fff;font-size:15px;font-weight:700;text-transform:uppercase}'
    + '.ow-h2-txt{flex:1;min-width:0;overflow:hidden}'
    + '.ow-h2-title{font-size:14.5px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.ow-h2-sub{font-size:11.5px;color:var(--muted)}'
    + '.ow-sub{font-size:12px;font-weight:700;color:var(--muted);margin:12px 0 6px;text-transform:uppercase;letter-spacing:.03em}'
    + '.ow-i{border:1px solid var(--line);border-radius:8px;font-size:14.5px;padding:9px 11px;margin:6px 0;'
    + 'display:block;width:100%;box-sizing:border-box;background:var(--panel);color:var(--ink);transition:border-color .15s}'
    + '.ow-i:focus{outline:none;border-color:#111827}'
    + '.ow-b{border:1px solid #111827;border-radius:8px;text-align:center;font-size:14.5px;font-weight:600;padding:9px 0;'
    + 'margin:8px 0 4px;display:block;width:100%;background:var(--panel);color:#111827;cursor:pointer;transition:background .15s,color .15s}'
    + '.ow-b:hover{background:#111827;color:#fff}'
    + '.ow-m{text-align:center;font-size:12.5px;min-height:16px;margin-top:2px}'
    + '.ow-row2{display:flex;gap:8px}.ow-row2 .ow-i{margin:6px 0}'
    + '.ow-hint{text-align:left;color:var(--muted);font-size:11.5px;line-height:1.4;margin:0 0 6px}'
    /* Аккордеон: каждый раздел — своя карточка, сворачиваемая по клику на
       заголовок. Разделов стало семь (монеты, дата, оценки, ручной ранг,
       медали карты, добавление в игру, бэкап) — одной длинной лентой
       полей это было прокруткой вслепую, искать нужный раздел приходилось
       по памяти. <details> даёт сворачивание без единой строчки своего JS. */
    + '.ow-acc{border:1px solid var(--line);border-radius:10px;margin:8px 0;overflow:hidden;background:var(--panel)}'
    + '.ow-acc > summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:9px;'
    + 'padding:11px 12px;font-size:13.5px;font-weight:600;color:var(--ink);user-select:none}'
    + '.ow-acc > summary::-webkit-details-marker{display:none}'
    + '.ow-acc > summary:hover{background:rgba(17,24,39,.07)}'
    + '.ow-acc-icon{width:24px;height:24px;flex:0 0 24px;display:flex;align-items:center;justify-content:center;font-size:14px}'
    + '.ow-acc-chev{margin-left:auto;color:var(--muted);font-size:11px;transition:transform .15s}'
    + '.ow-acc[open] .ow-acc-chev{transform:rotate(90deg)}'
    + '.ow-acc[open] > summary{border-bottom:1px solid var(--line)}'
    + '.ow-acc-body{padding:10px 12px 12px}'
    + '.ow-acc-body .ow-sub:first-child{margin-top:0}'
    /* Лестница медалей в разделе "Медали карты": буква цветная, как на
       карточке карты в Maps Browser (.mbMedalPill там) — те же глаза
       узнают тот же цвет сразу, без переучивания. */
    + '.ow-ladder-row{display:flex;gap:8px;align-items:center;margin:4px 0}'
    + '.ow-ladder-rank{width:34px;flex:0 0 34px;height:26px;border-radius:7px;display:flex;align-items:center;'
    + 'justify-content:center;font-size:12px;font-weight:700;border:1px solid var(--line);color:var(--muted)}'
    + '.ow-ladder-rank[data-r="S"]{color:var(--panel,#fff);background:var(--ink,#111827);border-color:var(--ink,#111827)}'
    + '.ow-ladder-rank[data-r="A+"],.ow-ladder-rank[data-r="A"]{color:#fff;background:#111827;border-color:#111827}'
    + '.ow-ladder-rank[data-r="B+"],.ow-ladder-rank[data-r="B"]{color:#111827;border-color:#111827}'
    + '.ow-ladder-row .ow-i{margin:0;flex:1}'
    + '.ow-tag{display:inline-flex;align-items:center;gap:3px;border:1px solid;border-radius:14px;padding:4px 10px;font-size:11.5px;'
    + 'font-weight:600;cursor:pointer;margin-left:5px;background:var(--panel);white-space:nowrap;transition:background .15s,color .15s}'
    + '.ow-tag.add{border-color:#2e9b2e;color:#2e9b2e}.ow-tag.add:hover{background:#2e9b2e;color:#fff}'
    + '.ow-tag.on{border-color:#2e9b2e;background:#2e9b2e;color:#fff}'
    + '.ow-tag.vote{border-color:#d97706;color:#d97706}.ow-tag.vote:hover{background:#d97706;color:#fff}'
    + '.ow-tag.rank{border-color:#7c3aed;color:#7c3aed}.ow-tag.rank:hover{background:#7c3aed;color:#fff}'
    + '.ow-tag.del{border-color:#dc2626;color:#dc2626}.ow-tag.del:hover{background:#dc2626;color:#fff}'
    + '.ow-modes{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;width:100%;align-items:center}'
    + '.ow-mode{border:1px solid #94a3b8;color:#475569;border-radius:12px;padding:4px 9px;'
    + 'font-size:11px;font-weight:600;cursor:pointer;background:var(--panel);white-space:nowrap;transition:background .15s,color .15s}'
    + '.ow-mode:hover{border-color:#111827;color:#111827}'
    + '.ow-mode.on{background:#2e9b2e;border-color:#2e9b2e;color:#fff}'
    + '@media(max-width:640px){.ow-box{width:calc(100vw - 24px)}.ow-fab{right:12px;bottom:78px}}'
    /* Резерв места внизу страницы под обе фиксированные кнопки (эту и
       Admin Abuse) — см. комментарий у classList.add('ow-has-fab') в
       buildPanel(). Без него последние строки длинных списков (таблица
       лидеров, Maps Browser и т.п.) у владельца частично скрывались. */
    // см. комментарий выше про pointer:coarse вместо max-width
    + '@media(pointer:coarse){body.ow-has-fab{padding-bottom:140px}}';

  function injectCss() {
    var s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ---------- панель ---------- */
  var ov, box;

  function buildPanel() {
    ov = document.createElement('div'); ov.className = 'ow-ov';
    box = document.createElement('div'); box.className = 'ow-box';
    document.body.appendChild(ov); document.body.appendChild(box);
    ov.onclick = close;

    var fab = document.createElement('button');
    fab.className = 'ow-fab';
    fab.title = T('ownerTools', 'Инструменты владельца');
    // карандаш вместо голого текста "Ред" — тот же минималистичный стиль
    // линий, что у остальных иконок сайта (см. svg() в shell.js)
    fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
      + 'stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/>'
      + '<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
    fab.onclick = open;
    document.body.appendChild(fab);

    /* Эта кнопка и Admin Abuse (adminAbuse.js) рядом с ней — обе
       position:fixed в правом нижнем углу. На узких экранах любой
       список, доходящий до низа страницы (таблица лидеров, список карт
       и т.п.), оказывался у владельца частично ПОД ними — не прочитать,
       не нажать последние строки. Только у владельца: обычный игрок эту
       панель вообще не получает (см. /whoAmI ниже), так что на игроков
       это не влияет. */
    document.body.classList.add('ow-has-fab');
  }

  function close() { ov.style.display = 'none'; box.style.display = 'none'; }

  /* Иконки разделов — тот же минималистичный стиль линий, что и везде на
     сайте (см. svg() в shell.js), вместо эмодзи: на разных ОС/шрифтах один
     и тот же emoji выглядит по-разному (а где-то — просто квадратом), и
     визуально не вяжется с остальным интерфейсом, который построен на SVG. */
  function ic(paths, fill) {
    return '<svg viewBox="0 0 24 24" width="15" height="15" fill="' + (fill ? 'currentColor' : 'none') + '" '
      + 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  }
  var ICN = {
    coin: ic('<circle cx="12" cy="12" r="9"/><path d="M9.5 15.5c.5 1 1.5 1.5 2.5 1.5 2 0 3-1 3-2.3 0-3-6-1.4-6-4.2 0-1.3 1-2.3 3-2.3 1 0 2 .4 2.5 1.3M12 7v2M12 15v2"/>'),
    calendar: ic('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 9h18"/>'),
    star: ic('<path d="M12 2.5l2.9 6.6 7.1.7-5.4 4.8 1.6 7-6.2-3.7-6.2 3.7 1.6-7-5.4-4.8 7.1-.7z"/>', true),
    starOutline: ic('<path d="M12 2.5l2.9 6.6 7.1.7-5.4 4.8 1.6 7-6.2-3.7-6.2 3.7 1.6-7-5.4-4.8 7.1-.7z"/>'),
    medal: ic('<circle cx="12" cy="15" r="6"/><path d="M9 10.5 7 3h3l2 5"/><path d="M15 10.5 17 3h-3l-2 5"/><path d="M12 12v6"/>'),
    trophy: ic('<path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4a3 3 0 0 0 3 5M17 5h3a3 3 0 0 1-3 5"/>'),
    gamepad: ic('<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v3M5.5 12.5h3M15.5 11.5h.01M18 13h.01"/>'),
    save: ic('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M8 3v5h8V3M7 21v-7h10v7"/>'),
    close: ic('<path d="M18 6 6 18M6 6l12 12"/>')
  };

  /* Каждый раздел — <details class="ow-acc">, open — список открытых по
     id (persistOpen), чтобы повторное открытие панели не сворачивало
     то, с чем владелец только что работал. */
  var openSections = { owAccCoins: true };
  function acc(id, icon, title, bodyHtml) {
    var isOpen = !!openSections[id];
    return '<details class="ow-acc" id="' + id + '"' + (isOpen ? ' open' : '') + '>'
      + '<summary><span class="ow-acc-icon">' + icon + '</span>' + esc(title) + '<span class="ow-acc-chev">▸</span></summary>'
      + '<div class="ow-acc-body">' + bodyHtml + '</div>'
      + '</details>';
  }
  /* Открыть панель С УЖЕ развёрнутым нужным разделом — нужно тегам на
     карточке карты (Оценка/Ранг): раньше open() просто перерисовывал
     панель с тем, что было открыто раньше (обычно только "Give coins"),
     и нужные поля оставались спрятаны внутри свёрнутого <details> —
     клик по тегу визуально ничего не менял. */
  function openWith(id) {
    openSections[id] = true;
    open();
    var el = box.querySelector('#' + id);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  function open() {
    box.innerHTML =
        '<div class="ow-x">' + ICN.close + '</div>'
      + '<div class="ow-h2">'
      +   '<div class="ow-h2-ava">' + esc((me.name || '?').slice(0, 1)) + '</div>'
      +   '<div class="ow-h2-txt">'
      +     '<div class="ow-h2-title">' + esc(me.name) + '</div>'
      +     '<div class="ow-h2-sub">' + T('ownerTools', 'Инструменты владельца') + '</div>'
      +   '</div>'
      + '</div>'

      + acc('owAccCoins', (window.BFCoin ? BFCoin.svg(15) : ICN.coin), T('giveCoins', 'Выдать монеты'),
            '<input class="ow-i" id="owCName" placeholder="' + T('playerName', 'Ник игрока') + '">'
          + '<div class="ow-row2">'
          +   '<input class="ow-i" id="owCAmt" type="number" placeholder="' + T('amount', 'Количество') + '">'
          +   '<select class="ow-i" id="owCMode">'
          +     '<option value="add">+ add</option><option value="set">= set</option>'
          +   '</select>'
          + '</div>'
          + '<div class="ow-b" id="owCGo">' + T('apply', 'Применить') + '</div>'
          + '<div class="ow-m" id="owCMsg"></div>')

      + acc('owAccJoin', ICN.calendar, T('setJoinDate', 'Дата регистрации'),
            '<input class="ow-i" id="owJName" placeholder="' + T('playerName', 'Ник игрока') + '">'
          + '<input class="ow-i" id="owJDate" type="date">'
          + '<div class="ow-b" id="owJGo">' + T('apply', 'Применить') + '</div>'
          + '<div class="ow-m" id="owJMsg"></div>')

      + acc('owAccVotes', ICN.star, T('boostVotes', 'Оценка карты'),
            '<div class="ow-hint">These numbers set the final total on the card, not an increment.</div>'
          + '<input class="ow-i" id="owVAuthor" placeholder="' + T('colAuthor', 'Автор') + '">'
          + '<input class="ow-i" id="owVMap" placeholder="' + T('colName', 'Название карты') + '">'
          + '<div class="ow-row2">'
          +   '<input class="ow-i" id="owVLikes" type="number" min="0" placeholder="' + T('likes', 'Лайки') + '">'
          +   '<input class="ow-i" id="owVDis" type="number" min="0" placeholder="' + T('dislikes', 'Дизлайки') + '">'
          + '</div>'
          + '<div class="ow-b" id="owVGo">' + T('apply', 'Применить') + '</div>'
          + '<div class="ow-m" id="owVMsg"></div>')

      + acc('owAccManualRank', ICN.medal, 'Manual rank',
            '<div class="ow-hint">Overrides the automatic S..C/Declassified rank for this mode. '
          +   'Leave the rank field empty to clear the override and go back to automatic.</div>'
          + '<input class="ow-i" id="owRName" placeholder="' + T('playerName', 'Ник игрока') + '">'
          + '<div class="ow-row2">'
          +   '<select class="ow-i" id="owRMode">'
          +     '<option value="race">Race</option><option value="hs">Hide and Seek</option>'
          +   '</select>'
          +   '<select class="ow-i" id="owRRank">'
          +     '<option value="">— auto (clear) —</option>'
          +     '<option value="S">S</option><option value="A+">A+</option><option value="A">A</option>'
          +     '<option value="B+">B+</option><option value="B">B</option>'
          +     '<option value="C+">C+</option><option value="C">C</option>'
          +     '<option value="Declassified">Declassified</option>'
          +   '</select>'
          + '</div>'
          + '<div class="ow-b" id="owRGo">' + T('apply', 'Применить') + '</div>'
          + '<div class="ow-m" id="owRMsg"></div>')

      + acc('owAccMapRank', ICN.trophy, 'Map rank tiers',
            '<div class="ow-hint">Time thresholds for the per-map time medal shown on its card in Maps '
          +   'Browser (separate from the S..C skill rank above — see ranks.js). Click "' + T('mapRankTag', 'Ранг')
          +   '" on a map row in Maps Browser to load it here; empty a field to remove that letter.</div>'
          + '<input class="ow-i" id="owTAuthor" placeholder="' + T('colAuthor', 'Автор') + '" readonly>'
          + '<input class="ow-i" id="owTMap" placeholder="' + T('colName', 'Название карты') + '" readonly>'
          + '<div id="owTLadders"><span style="color:var(--muted)">' + T('mapRankPick', 'Откройте через карточку карты') + '</span></div>'
          + '<div class="ow-b" id="owTGo">' + T('apply', 'Применить') + '</div>'
          + '<div class="ow-m" id="owTMsg"></div>')

      + acc('owAccAddGame', ICN.gamepad, T('addToGame', 'Добавить в игру'),
            '<div class="ow-m" style="text-align:left;color:var(--muted)" id="owGList">…</div>')

      + acc('owAccBackup', ICN.save, 'Backup',
            '<div class="ow-hint">One file with everything: accounts, coins, skins, maps, news. '
          +   'Download it before moving to another server — and restore it there in this same panel. '
          +   'Show media larger than 25 MB is not included in the file.</div>'
          + '<div class="ow-row2">'
          +   '<div class="ow-b" id="owBkDl" style="margin:0">Download</div>'
          +   '<div class="ow-b" id="owBkRs" style="margin:0">Restore</div>'
          + '</div>'
          + '<div class="ow-m" id="owBkMsg"></div>'
          + '<input type="file" id="owBkFile" accept=".json,application/json" style="display:none">');

    // сворачивание/разворачивание запоминаем только на время, пока панель открыта в этой вкладке
    box.querySelectorAll('details.ow-acc').forEach(function (d) {
      d.addEventListener('toggle', function () { openSections[d.id] = d.open; });
    });

    box.querySelector('.ow-x').onclick = close;

    box.querySelector('#owCGo').onclick = function () {
      var m = box.querySelector('#owCMsg');
      post('/owner/giveCoins', {
        name: box.querySelector('#owCName').value.trim(),
        coins: box.querySelector('#owCAmt').value.trim(),
        mode: box.querySelector('#owCMode').value
      }).then(function (r) {
        m.style.color = r.status === 'success' ? '#2e9b2e' : 'red';
        m.textContent = r.message || '';
      }).catch(function () { m.style.color = 'red'; m.textContent = T('serverDown', 'Сервер недоступен'); });
    };

    box.querySelector('#owJGo').onclick = function () {
      var m = box.querySelector('#owJMsg');
      post('/owner/setJoinDate', {
        name: box.querySelector('#owJName').value.trim(),
        date: box.querySelector('#owJDate').value
      }).then(function (r) {
        m.style.color = r.status === 'success' ? '#2e9b2e' : 'red';
        m.textContent = r.message || '';
      }).catch(function () { m.style.color = 'red'; m.textContent = T('serverDown', 'Сервер недоступен'); });
    };

    box.querySelector('#owVGo').onclick = function () {
      var m = box.querySelector('#owVMsg');
      post('/owner/setVotes', {
        author: box.querySelector('#owVAuthor').value.trim(),
        mapName: box.querySelector('#owVMap').value.trim(),
        likes: box.querySelector('#owVLikes').value.trim(),
        dislikes: box.querySelector('#owVDis').value.trim()
      }).then(function (r) {
        m.style.color = r.status === 'success' ? '#2e9b2e' : 'red';
        m.textContent = r.status === 'success'
          ? 'Likes: ' + r.likes + '   Dislikes: ' + r.dislikes + '   Rating: ' + r.rating
          : (r.message || T('errorTxt', 'Ошибка'));
      }).catch(function () { m.style.color = 'red'; m.textContent = T('serverDown', 'Сервер недоступен'); });
    };

    box.querySelector('#owRGo').onclick = function () {
      var m = box.querySelector('#owRMsg');
      post('/owner/setRank', {
        name: box.querySelector('#owRName').value.trim(),
        mode: box.querySelector('#owRMode').value,
        rank: box.querySelector('#owRRank').value
      }).then(function (r) {
        m.style.color = r.status === 'success' ? '#2e9b2e' : 'red';
        m.textContent = r.message || '';
      }).catch(function () { m.style.color = 'red'; m.textContent = T('serverDown', 'Сервер недоступен'); });
    };

    box.querySelector('#owTGo').onclick = function () {
      var m = box.querySelector('#owTMsg');
      var author = box.querySelector('#owTAuthor').value, mapName = box.querySelector('#owTMap').value;
      if (!author || !mapName) { m.style.color = 'red'; m.textContent = T('mapRankPick', 'Откройте через карточку карты'); return; }
      var tiers = {};
      box.querySelectorAll('#owTLadders input[data-ladder]').forEach(function (inp) {
        var g = inp.dataset.ladder, r = inp.dataset.rank, v = inp.value.trim();
        if (!v) return;
        (tiers[g] || (tiers[g] = {}))[r] = v;
      });
      post('/owner/setMapRankTiers', { author: author, mapName: mapName, tiers: JSON.stringify(tiers) })
        .then(function (r) {
          m.style.color = r.status === 'success' ? '#2e9b2e' : 'red';
          m.textContent = r.message || (r.status === 'success' ? T('saved', 'Сохранено') : '');
        }).catch(function () { m.style.color = 'red'; m.textContent = T('serverDown', 'Сервер недоступен'); });
    };

    /* ---------- резервная копия: скачать / восстановить ---------- */
    box.querySelector('#owBkDl').onclick = function () {
      var m = box.querySelector('#owBkMsg');
      m.style.color = '#6b7280'; m.textContent = 'Preparing file…';
      fetch('/owner/backup', { credentials: 'same-origin' }).then(function (r) {
        if (!r.ok) throw new Error('bad status');
        var mm = /filename="?([^";]+)"?/.exec(r.headers.get('Content-Disposition') || '');
        return r.blob().then(function (b) { return { blob: b, name: mm && mm[1] }; });
      }).then(function (x) {
        var url = URL.createObjectURL(x.blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = x.name || 'aibrofist-backup.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
        m.style.color = '#2e9b2e';
        m.textContent = 'Downloaded. Keep the file until you\'ve verified the new server.';
      }).catch(function () {
        m.style.color = 'red'; m.textContent = 'Failed to download the backup';
      });
    };

    box.querySelector('#owBkRs').onclick = function () {
      box.querySelector('#owBkFile').click();
    };
    box.querySelector('#owBkFile').onchange = function (e) {
      var f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (!confirm('Restore «' + f.name + '»? Accounts, maps, skins and news ' +
                   'will be replaced with the data from this file. Sign in afterward with an account from the backup.'))
        return;
      var m = box.querySelector('#owBkMsg');
      m.style.color = '#6b7280'; m.textContent = 'Reading file…';
      var rd = new FileReader();
      rd.onload = function () {
        m.textContent = 'Uploading and restoring — don\'t close this page…';
        post('/owner/restore', { data: rd.result }).then(function (r) {
          m.style.color = r.status === 'success' ? '#2e9b2e' : 'red';
          m.textContent = r.message || (r.status === 'success' ? 'Done' : 'Error');
          if (r.status === 'success') setTimeout(function () { location.reload(); }, 1500);
        }).catch(function () {
          m.style.color = 'red';
          m.textContent = 'Failed — the file may be larger than the server\'s limit';
        });
      };
      rd.onerror = function () {
        m.style.color = 'red'; m.textContent = 'Failed to read the file';
      };
      rd.readAsText(f);
    };

    get('/owner/inGame').then(function (r) {
      var el = box.querySelector('#owGList');
      var list = (r && r.maps) || [];
      el.innerHTML = list.length
        ? list.map(function (x) {
            var m = (x.modes || []).map(function (k) { return MODE_RU[k] || k; }).join(', ');
            return '· ' + esc(x.mapName) + ' <span style="color:#9aa3ad">(' + esc(x.author) + ')</span> → ' + esc(m);
          }).join('<br>')
        : '<span style="color:#9aa3ad">nothing added yet</span>';
    }).catch(function () {});

    ov.style.display = 'block';
    box.style.display = 'block';
  }

  /* ---------- кнопки прямо в Maps Browser ---------- */
  /* Страница переписана на нашу разметку: у каждой строки есть
     data-map и data-author, поэтому ничего угадывать не нужно. */
  function decorate(row) {
    if (!row || row.__owWired) return;
    var info = { mapName: row.dataset.map, author: row.dataset.author, mapType: row.dataset.type };
    if (!info.mapName) return;
    row.__owWired = true;

    var host = row.querySelector('.mbExtra');
    if (!host) {
      host = document.createElement('div');
      host.className = 'mbExtra';
      row.appendChild(host);
    }

    var current = inGame[keyOf(info.author, info.mapName)] || [];

    var vote = document.createElement('span');
    vote.className = 'ow-tag vote';
    vote.innerHTML = ICN.star + ' ' + esc(T('boostVotes', 'Оценка'));
    vote.onclick = function (e) {
      e.stopPropagation();
      openWith('owAccVotes');
      box.querySelector('#owVAuthor').value = info.author;
      box.querySelector('#owVMap').value = info.mapName;
      box.querySelector('#owVLikes').focus();
    };

    var rankTag = document.createElement('span');
    rankTag.className = 'ow-tag rank';
    rankTag.innerHTML = ICN.trophy + ' ' + esc(T('mapRankTag', 'Ранг'));
    rankTag.onclick = function (e) {
      e.stopPropagation();
      openWith('owAccMapRank');
      box.querySelector('#owTAuthor').value = info.author;
      box.querySelector('#owTMap').value = info.mapName;
      var laddersEl = box.querySelector('#owTLadders');
      laddersEl.innerHTML = '<span style="color:#9aa3ad">' + T('loading', 'Загрузка…') + '</span>';
      get('/owner/getMapRankTiers?author=' + encodeURIComponent(info.author)
            + '&mapName=' + encodeURIComponent(info.mapName)).then(function (r) {
        if (!r || r.status !== 'success') { laddersEl.innerHTML = '<span style="color:red">' + T('errorTxt', 'Ошибка') + '</span>'; return; }
        var tiers = r.rankTiers || {};
        laddersEl.innerHTML = r.mapType === 'race'
          ? ladderInputsHtml('race', T('mapRankRaceHint', 'Время финиша (меньше — лучше)'), tiers.race)
          : ladderInputsHtml('hider', T('mapRankHiderHint', 'Хайдер: сколько прожил (больше — лучше)'), tiers.hider)
            + ladderInputsHtml('seeker', T('mapRankSeekerHint', 'Искатель: поймать всех (меньше — лучше)'), tiers.seeker);
      }).catch(function () {
        laddersEl.innerHTML = '<span style="color:red">' + T('errorTxt', 'Ошибка') + '</span>';
      });
    };

    var del = document.createElement('span');
    del.className = 'ow-tag del';
    del.textContent = T('removeTxt', 'Удалить');
    del.onclick = function (e) {
      e.stopPropagation();
      if (del.dataset.armed !== '1') {
        del.dataset.armed = '1';
        del.textContent = T('confirmDel', 'Точно удалить?');
        setTimeout(function () {
          if (del.dataset.armed === '1') {
            del.dataset.armed = '';
            del.textContent = T('removeTxt', 'Удалить');
          }
        }, 4000);
        return;
      }
      del.textContent = '…';
      /* Ошибка раньше навсегда оставалась текстом кнопки («Not available»
         и т.п.) — выглядело так, будто удалять карту вообще нельзя,
         хотя повторный клик (armed остался '1') на самом деле просто
         отправил бы запрос заново. Теперь текст и armed откатываются
         сами через пару секунд, и видно, что это кнопка, а не ярлык. */
      function fail(text) {
        del.textContent = text;
        del.dataset.armed = '';
        setTimeout(function () { del.textContent = T('removeTxt', 'Удалить'); }, 2500);
      }
      post('/owner/removeMap', { author: info.author, mapName: info.mapName })
        .then(function (r) {
          if (r.status !== 'success') { fail(r.message || T('errorTxt', 'Ошибка')); return; }
          /* Раньше строка просто тускнела (opacity .35) и оставалась в
             списке — карта на сервере уже удалена, но в Maps Browser
             выглядит как будто нет: легко решить, что удаление не
             сработало. Теперь строку убираем по-настоящему. */
          row.style.opacity = '.35';
          row.style.pointerEvents = 'none';
          del.textContent = T('deleted', 'Удалена');
          setTimeout(function () { row.remove(); }, 600);
        })
        .catch(function () { fail(T('errorTxt', 'Ошибка')); });
    };

    // по кнопке на каждый режим: клик добавляет, повторный убирает
    var modes = document.createElement('div');
    modes.className = 'ow-modes';
    var label = document.createElement('span');
    label.style.cssText = 'font-size:11.5px;color:#6b7280;width:100%';
    label.textContent = T('addToGame', 'Добавить в игру') + ':';
    modes.appendChild(label);

    MODES.forEach(function (mode) {
      var b2 = document.createElement('span');
      b2.className = 'ow-mode' + (current.indexOf(mode) !== -1 ? ' on' : '');
      b2.textContent = MODE_RU[mode];
      b2.onclick = function (e) {
        e.stopPropagation();
        var next = !b2.classList.contains('on');
        var prev = b2.textContent;
        b2.textContent = '…';
        post('/owner/mapInGame', {
          author: info.author, mapName: info.mapName, mode: mode, on: String(next)
        }).then(function (r) {
          b2.textContent = prev;
          if (r.status !== 'success') { b2.textContent = T('errorTxt', 'Ошибка'); return; }
          inGame[keyOf(info.author, info.mapName)] = r.modes;
          b2.classList.toggle('on', r.modes.indexOf(mode) !== -1);
        }).catch(function () { b2.textContent = T('errorTxt', 'Ошибка'); });
      };
      modes.appendChild(b2);
    });

    host.appendChild(vote);
    host.appendChild(rankTag);
    host.appendChild(del);
    host.appendChild(modes);
  }

  function scan() {
    var rows = document.querySelectorAll('.mbRow');
    for (var i = 0; i < rows.length; i++) decorate(rows[i]);
  }

  function watchBrowser() {
    get('/owner/inGame').then(function (r) {
      ((r && r.maps) || []).forEach(function (x) {
        inGame[keyOf(x.author, x.mapName)] = x.modes || [];
      });
      scan();
    }).catch(scan);

    window.addEventListener('bf-maps-drawn', function () { setTimeout(scan, 0); });
  }

  /* ---------- старт ---------- */
  get('/whoAmI').then(function (r) {
    if (!r || !r.owner) return;      // не владелец — ничего не показываем
    me = r;
    injectCss();
    buildPanel();
    if (/mapsBrowser/i.test(location.pathname)) watchBrowser();
  }).catch(function () {});

  /* Панель Admin Abuse подключаем отсюда. В разметке страниц её тега нет
     вообще: у обычного игрока owner.js пустой, значит он и не узнает,
     что такой файл существует, и запроса за ним не будет. */
  (function () {
    if (/\/?game(\.html)?/i.test(location.pathname)) return;
    if (document.getElementById('aaScript')) return;
    var sc = document.createElement('script');
    sc.id = 'aaScript';
    sc.src = 'adminAbuse.js?v=189';
    sc.defer = true;
    document.head.appendChild(sc);
  })();
})();
