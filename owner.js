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
    + '@media (max-width:860px){body.play.mob .ow-fab{bottom:220px}}'
    + 'background:linear-gradient(135deg,#1f2937,#111827);color:#fff;border:none;font-size:22px;cursor:pointer;'
    + 'box-shadow:0 6px 18px rgba(0,0,0,.32);transition:transform .15s,box-shadow .15s}'
    + '.ow-fab:hover{background:linear-gradient(135deg,#2196F3,#1976d2);transform:translateY(-1px);box-shadow:0 8px 22px rgba(33,150,243,.35)}'
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
    + 'background:linear-gradient(135deg,#7c3aed,#2196F3);color:#fff;font-size:15px;font-weight:700;text-transform:uppercase}'
    + '.ow-h2-txt{flex:1;min-width:0;overflow:hidden}'
    + '.ow-h2-title{font-size:14.5px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.ow-h2-sub{font-size:11.5px;color:var(--muted)}'
    + '.ow-sub{font-size:12px;font-weight:700;color:var(--muted);margin:12px 0 6px;text-transform:uppercase;letter-spacing:.03em}'
    + '.ow-i{border:1px solid var(--line);border-radius:8px;font-size:14.5px;padding:9px 11px;margin:6px 0;'
    + 'display:block;width:100%;box-sizing:border-box;background:var(--panel);color:var(--ink);transition:border-color .15s}'
    + '.ow-i:focus{outline:none;border-color:#2196F3}'
    + '.ow-b{border:1px solid #2196F3;border-radius:8px;text-align:center;font-size:14.5px;font-weight:600;padding:9px 0;'
    + 'margin:8px 0 4px;display:block;width:100%;background:var(--panel);color:#2196F3;cursor:pointer;transition:background .15s,color .15s}'
    + '.ow-b:hover{background:#2196F3;color:#fff}'
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
    + '.ow-acc > summary:hover{background:rgba(33,150,243,.07)}'
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
    + '.ow-ladder-rank[data-r="A+"],.ow-ladder-rank[data-r="A"]{color:#fff;background:#2196F3;border-color:#2196F3}'
    + '.ow-ladder-rank[data-r="B+"],.ow-ladder-rank[data-r="B"]{color:#2196F3;border-color:#2196F3}'
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
    + '.ow-mode:hover{border-color:#2196F3;color:#2196F3}'
    + '.ow-mode.on{background:#2e9b2e;border-color:#2e9b2e;color:#fff}'
    + '@media(max-width:640px){.ow-box{width:calc(100vw - 24px)}.ow-fab{right:12px;bottom:78px}}';

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
    fab.textContent = T('ownerFab', 'Ред');
    fab.onclick = open;
    document.body.appendChild(fab);
  }

  function close() { ov.style.display = 'none'; box.style.display = 'none'; }

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
        '<div class="ow-x">X</div>'
      + '<div class="ow-h2">'
      +   '<div class="ow-h2-ava">' + esc((me.name || '?').slice(0, 1)) + '</div>'
      +   '<div class="ow-h2-txt">'
      +     '<div class="ow-h2-title">' + esc(me.name) + '</div>'
      +     '<div class="ow-h2-sub">' + T('ownerTools', 'Инструменты владельца') + '</div>'
      +   '</div>'
      + '</div>'

      + acc('owAccCoins', (window.BFCoin ? BFCoin.svg(15) : '🪙'), T('giveCoins', 'Выдать монеты'),
            '<input class="ow-i" id="owCName" placeholder="' + T('playerName', 'Ник игрока') + '">'
          + '<div class="ow-row2">'
          +   '<input class="ow-i" id="owCAmt" type="number" placeholder="' + T('amount', 'Количество') + '">'
          +   '<select class="ow-i" id="owCMode">'
          +     '<option value="add">+ add</option><option value="set">= set</option>'
          +   '</select>'
          + '</div>'
          + '<div class="ow-b" id="owCGo">' + T('apply', 'Применить') + '</div>'
          + '<div class="ow-m" id="owCMsg"></div>')

      + acc('owAccJoin', '📅', T('setJoinDate', 'Дата регистрации'),
            '<input class="ow-i" id="owJName" placeholder="' + T('playerName', 'Ник игрока') + '">'
          + '<input class="ow-i" id="owJDate" type="date">'
          + '<div class="ow-b" id="owJGo">' + T('apply', 'Применить') + '</div>'
          + '<div class="ow-m" id="owJMsg"></div>')

      + acc('owAccVotes', '⭐', T('boostVotes', 'Оценка карты'),
            '<div class="ow-hint">These numbers set the final total on the card, not an increment.</div>'
          + '<input class="ow-i" id="owVAuthor" placeholder="' + T('colAuthor', 'Автор') + '">'
          + '<input class="ow-i" id="owVMap" placeholder="' + T('colName', 'Название карты') + '">'
          + '<div class="ow-row2">'
          +   '<input class="ow-i" id="owVLikes" type="number" min="0" placeholder="' + T('likes', 'Лайки') + '">'
          +   '<input class="ow-i" id="owVDis" type="number" min="0" placeholder="' + T('dislikes', 'Дизлайки') + '">'
          + '</div>'
          + '<div class="ow-b" id="owVGo">' + T('apply', 'Применить') + '</div>'
          + '<div class="ow-m" id="owVMsg"></div>')

      + acc('owAccManualRank', '🏅', 'Manual rank',
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

      + acc('owAccMapRank', '🏆', 'Map rank tiers',
            '<div class="ow-hint">Time thresholds for the per-map time medal shown on its card in Maps '
          +   'Browser (separate from the S..C skill rank above — see ranks.js). Click "' + T('mapRankTag', 'Ранг')
          +   '" on a map row in Maps Browser to load it here; empty a field to remove that letter.</div>'
          + '<input class="ow-i" id="owTAuthor" placeholder="' + T('colAuthor', 'Автор') + '" readonly>'
          + '<input class="ow-i" id="owTMap" placeholder="' + T('colName', 'Название карты') + '" readonly>'
          + '<div id="owTLadders"><span style="color:var(--muted)">' + T('mapRankPick', 'Откройте через карточку карты') + '</span></div>'
          + '<div class="ow-b" id="owTGo">' + T('apply', 'Применить') + '</div>'
          + '<div class="ow-m" id="owTMsg"></div>')

      + acc('owAccAddGame', '🎮', T('addToGame', 'Добавить в игру'),
            '<div class="ow-m" style="text-align:left;color:var(--muted)" id="owGList">…</div>')

      + acc('owAccBackup', '💾', 'Backup',
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
    vote.textContent = '⭐ ' + T('boostVotes', 'Оценка');
    vote.onclick = function (e) {
      e.stopPropagation();
      openWith('owAccVotes');
      box.querySelector('#owVAuthor').value = info.author;
      box.querySelector('#owVMap').value = info.mapName;
      box.querySelector('#owVLikes').focus();
    };

    var rankTag = document.createElement('span');
    rankTag.className = 'ow-tag rank';
    rankTag.textContent = '🏆 ' + T('mapRankTag', 'Ранг');
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
    if (/game\.html/i.test(location.pathname)) return;
    if (document.getElementById('aaScript')) return;
    var sc = document.createElement('script');
    sc.id = 'aaScript';
    sc.src = 'adminAbuse.js';
    sc.defer = true;
    document.head.appendChild(sc);
  })();
})();
