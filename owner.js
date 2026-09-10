/* AIBROFIST — инструменты владельца сайта.
   Всё, что тут есть, видно и работает ТОЛЬКО для аккаунта-владельца:
   сервер повторно проверяет права на каждый запрос, кнопки — лишь удобная обёртка. */
(function () {
  'use strict';

  var me = { owner: false, name: '', ownerName: 'AIBrofist' };
  var inGame = {};          // "автор::карта" -> [режимы]
  // режимов, кроме этих двух, в игре нет
  var MODES = ['hideAndSeek', 'race'];
  var MODE_RU = { hideAndSeek: 'Прятки', race: 'Гонка' };
  var T = function (k, fallback) {
    return (window.I18N && window.I18N.t(k) !== k) ? I18N.t(k) : (fallback || k);
  };
  var keyOf = function (a, m) {
    return String(a || '').toLowerCase() + '::' + String(m || '').toLowerCase();
  };

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
    + 'background:#111827;color:#fff;border:none;font-size:22px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.32)}'
    + '.ow-fab:hover{background:#2196F3}'
    + '.ow-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;display:none}'
    + '.ow-box{position:fixed;inset:0;margin:auto;width:340px;max-height:86vh;overflow:auto;height:max-content;'
    + 'background:#fff;border:3px solid #c5c5c5;border-radius:10px;padding:22px 24px 18px;z-index:9999;'
    + 'display:none;font-family:sans-serif;color:#2d2d2d;box-sizing:border-box}'
    + '.ow-x{position:absolute;right:6px;top:5px;border:1px solid;border-radius:30px;font-size:14px;'
    + 'padding:3px 8px;color:red;background:#fff;cursor:pointer;line-height:1}'
    + '.ow-h{text-align:center;font-size:16px;color:#5b5b5b;margin:2px 0 10px}'
    + '.ow-sub{font-size:13px;font-weight:bold;color:#374151;margin:14px 0 6px;'
    + 'border-top:1px solid #e6ebf0;padding-top:12px}'
    + '.ow-i{border:1px solid #2b2b2b;border-radius:4px;font-size:15px;padding:9px 10px;margin:6px 0;'
    + 'display:block;width:100%;box-sizing:border-box}'
    + '.ow-b{border:1px solid #2196F3;border-radius:4px;text-align:center;font-size:15px;padding:9px 0;'
    + 'margin:7px 0;display:block;width:100%;background:#fff;color:#2196F3;cursor:pointer}'
    + '.ow-b:hover{background:#2196F3;color:#fff}'
    + '.ow-m{text-align:center;font-size:12.5px;min-height:16px;margin-top:2px}'
    + '.ow-row2{display:flex;gap:8px}.ow-row2 .ow-i{margin:6px 0}'
    + '.ow-tag{display:inline-block;border:1px solid;border-radius:5px;padding:3px 8px;font-size:12px;'
    + 'cursor:pointer;margin-left:5px;background:#fff;white-space:nowrap}'
    + '.ow-tag.add{border-color:#2e9b2e;color:#2e9b2e}.ow-tag.add:hover{background:#2e9b2e;color:#fff}'
    + '.ow-tag.on{border-color:#2e9b2e;background:#2e9b2e;color:#fff}'
    + '.ow-tag.vote{border-color:#d97706;color:#d97706}.ow-tag.vote:hover{background:#d97706;color:#fff}'
    + '.ow-tag.del{border-color:#dc2626;color:#dc2626}.ow-tag.del:hover{background:#dc2626;color:#fff}'
    + '.ow-modes{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;width:100%}'
    + '.ow-mode{border:1px solid #94a3b8;color:#475569;border-radius:5px;padding:3px 7px;'
    + 'font-size:11.5px;cursor:pointer;background:#fff;white-space:nowrap}'
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

  function open() {
    box.innerHTML =
        '<div class="ow-x">X</div>'
      + '<div class="ow-h">' + T('ownerTools', 'Инструменты владельца') + ' · ' + me.name + '</div>'

      + '<div class="ow-sub">' + (window.BFCoin ? BFCoin.svg(15) : '') + ' ' +
        T('giveCoins', 'Выдать монеты') + '</div>'
      + '<input class="ow-i" id="owCName" placeholder="' + T('playerName', 'Ник игрока') + '">'
      + '<div class="ow-row2">'
      +   '<input class="ow-i" id="owCAmt" type="number" placeholder="' + T('amount', 'Количество') + '">'
      +   '<select class="ow-i" id="owCMode">'
      +     '<option value="add">+ добавить</option><option value="set">= установить</option>'
      +   '</select>'
      + '</div>'
      + '<div class="ow-b" id="owCGo">' + T('apply', 'Применить') + '</div>'
      + '<div class="ow-m" id="owCMsg"></div>'

      + '<div class="ow-sub">' + T('boostVotes', 'Оценка карты') + '</div>'
      + '<div class="ow-m" style="text-align:left;color:#6b7280;margin-bottom:4px">'
      +   'Числа задают итог на карточке, а не прибавку.</div>'
      + '<input class="ow-i" id="owVAuthor" placeholder="' + T('colAuthor', 'Автор') + '">'
      + '<input class="ow-i" id="owVMap" placeholder="' + T('colName', 'Название карты') + '">'
      + '<div class="ow-row2">'
      +   '<input class="ow-i" id="owVLikes" type="number" min="0" placeholder="' + T('likes', 'Лайки') + '">'
      +   '<input class="ow-i" id="owVDis" type="number" min="0" placeholder="' + T('dislikes', 'Дизлайки') + '">'
      + '</div>'
      + '<div class="ow-b" id="owVGo">' + T('apply', 'Применить') + '</div>'
      + '<div class="ow-m" id="owVMsg"></div>'

      + '<div class="ow-sub">' + T('addToGame', 'Добавить в игру') + '</div>'
      + '<div class="ow-m" style="text-align:left;color:#6b7280" id="owGList">…</div>'

      + '<div class="ow-sub">Резервная копия</div>'
      + '<div class="ow-m" style="text-align:left;color:#6b7280;margin-bottom:4px">'
      +   'Один файл со всем: аккаунты, монеты, скины, карты, новости. '
      +   'Скачайте перед переездом на другой сервер — и восстановите там же в этой панели. '
      +   'Медиа шоу тяжелее 25 МБ в файл не входят.'
      + '</div>'
      + '<div class="ow-row2">'
      +   '<div class="ow-b" id="owBkDl" style="margin:0">Скачать</div>'
      +   '<div class="ow-b" id="owBkRs" style="margin:0">Восстановить</div>'
      + '</div>'
      + '<div class="ow-m" id="owBkMsg"></div>'
      + '<input type="file" id="owBkFile" accept=".json,application/json" style="display:none">'

      + '<div class="ow-sub">' + T('avatar', 'Avatar') + '</div>'
      + '<div class="ow-m" style="text-align:left;color:#6b7280">'
      +   'Накрутка оценок, цена и загрузка скина из картинки — на странице Avatar.'
      + '</div>'
      + '<div class="ow-b" id="owGoSkins">' + T('openAvatar', 'Открыть Avatar') + '</div>';

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
          ? '👍 ' + r.likes + '   👎 ' + r.dislikes + '   → ' + r.rating
          : (r.message || T('errorTxt', 'Ошибка'));
      }).catch(function () { m.style.color = 'red'; m.textContent = T('serverDown', 'Сервер недоступен'); });
    };

    box.querySelector('#owGoSkins').onclick = function () {
      location.href = '/avatar.html';
    };

    /* ---------- резервная копия: скачать / восстановить ---------- */
    box.querySelector('#owBkDl').onclick = function () {
      var m = box.querySelector('#owBkMsg');
      m.style.color = '#6b7280'; m.textContent = 'Готовлю файл…';
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
        m.textContent = 'Скачано. Храните файл, пока не проверите новый сервер.';
      }).catch(function () {
        m.style.color = 'red'; m.textContent = 'Не удалось скачать бэкап';
      });
    };

    box.querySelector('#owBkRs').onclick = function () {
      box.querySelector('#owBkFile').click();
    };
    box.querySelector('#owBkFile').onchange = function (e) {
      var f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (!confirm('Восстановить «' + f.name + '»? Аккаунты, карты, скины и новости ' +
                   'будут заменены данными из файла. Входите потом под аккаунтом из бэкапа.'))
        return;
      var m = box.querySelector('#owBkMsg');
      m.style.color = '#6b7280'; m.textContent = 'Читаю файл…';
      var rd = new FileReader();
      rd.onload = function () {
        m.textContent = 'Загружаю и восстанавливаю — не закрывайте страницу…';
        post('/owner/restore', { data: rd.result }).then(function (r) {
          m.style.color = r.status === 'success' ? '#2e9b2e' : 'red';
          m.textContent = r.message || (r.status === 'success' ? 'Готово' : 'Ошибка');
          if (r.status === 'success') setTimeout(function () { location.reload(); }, 1500);
        }).catch(function () {
          m.style.color = 'red';
          m.textContent = 'Не вышло — возможно, файл тяжелее лимита сервера';
        });
      };
      rd.onerror = function () {
        m.style.color = 'red'; m.textContent = 'Не удалось прочитать файл';
      };
      rd.readAsText(f);
    };

    get('/owner/inGame').then(function (r) {
      var el = box.querySelector('#owGList');
      var list = (r && r.maps) || [];
      el.innerHTML = list.length
        ? list.map(function (x) {
            var m = (x.modes || []).map(function (k) { return MODE_RU[k] || k; }).join(', ');
            return '· ' + x.mapName + ' <span style="color:#9aa3ad">(' + x.author + ')</span> → ' + m;
          }).join('<br>')
        : '<span style="color:#9aa3ad">пока ничего не добавлено</span>';
    }).catch(function () {});

    ov.style.display = 'block';
    box.style.display = 'block';
  }

  /* ---------- кнопки прямо в Maps Browser ---------- */
  /* Страница переписана на нашу разметку: у каждой строки есть
     data-map и data-author, поэтому ничего угадывать не нужно. */
  function decorate(row) {
    if (!row || row.__owWired) return;
    var info = { mapName: row.dataset.map, author: row.dataset.author };
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
    vote.textContent = T('boostVotes', 'Оценка');
    vote.onclick = function (e) {
      e.stopPropagation();
      open();
      box.querySelector('#owVAuthor').value = info.author;
      box.querySelector('#owVMap').value = info.mapName;
      box.querySelector('#owVLikes').focus();
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
      post('/owner/removeMap', { author: info.author, mapName: info.mapName })
        .then(function (r) {
          if (r.status !== 'success') { del.textContent = r.message || T('errorTxt', 'Ошибка'); return; }
          row.style.opacity = '.35';
          row.style.pointerEvents = 'none';
          del.textContent = T('deleted', 'Удалена');
        })
        .catch(function () { del.textContent = T('errorTxt', 'Ошибка'); });
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

  /* ══════════════════════════════════════════════
     SKINS BROWSER — только для владельца
     Накрутка оценок, цена и выкладывание в Avatar, а также
     загрузка скина из любой картинки: файлом или по ссылке.
     Этот код приходит только владельцу — сервер отдаёт owner.js
     остальным пустым файлом.
     ══════════════════════════════════════════════ */
  var skinsCss = ''
    + '.ow-bar{border:1px dashed #cbd5e1;border-radius:12px;padding:12px;margin:12px 0;background:#fbfcfd}'
    + '.ow-bar h4{margin:0 0 9px;font-size:14px;color:#6b7280}'
    + '.ow-bar-row{display:grid;grid-template-columns:1fr 1.4fr auto auto;gap:8px;align-items:start}'
    + '.ow-bar input{font-size:15px;padding:11px 12px;border:1px solid #cfd6de;border-radius:10px;width:100%;box-sizing:border-box}'
    + '.ow-bar button{font-size:15px;padding:11px 16px;border-radius:10px;border:1px solid #2196F3;'
    + 'background:#fff;color:#2196F3;cursor:pointer;white-space:nowrap}'
    + '.ow-bar button.go{background:#2196F3;color:#fff}'
    + '.ow-bar button.picked{background:#2196F3;color:#fff;border-color:#2196F3}'
    + '.ow-bar .ow-note{font-size:12.5px;color:#6b7280;margin-top:8px}'
    + '.ow-bar .ow-note.ok{color:#2e9b2e}'
    + '.ow-bar button:active{transform:translateY(1px)}'
    + '.ow-sk{border-top:1px dashed #e5e7eb;margin-top:9px;padding-top:9px;display:flex;'
    + 'flex-direction:column;gap:6px}'
    + '.ow-sk input{width:100%;box-sizing:border-box;font-size:13px;padding:7px 9px;'
    + 'border:1px solid #cfd6de;border-radius:8px}'
    + '.ow-sk .pair{display:grid;grid-template-columns:1fr 1fr;gap:6px}'
    + '.ow-sk button{font-size:13px;padding:8px 0;border-radius:8px;border:1px solid #2196F3;'
    + 'background:#fff;color:#2196F3;cursor:pointer;min-height:38px}'
    + '.ow-sk button.on{border-color:#2e9b2e;background:#2e9b2e;color:#fff}'
    + '@media(max-width:640px){'
    + '.ow-bar-row{grid-template-columns:1fr 1fr}'
    + '.ow-bar-row input{grid-column:1/-1}'
    + '.ow-bar button{width:100%}}';

  function page() { return window.BFSkinsPage; }
  function say(t, ok) { var P = page(); if (P) P.msg(t, ok); }
  function reload() { var P = page(); if (P) P.reload(); }

  function buildBar() {
    if (document.getElementById('owSkinBar')) return;
    var host = document.getElementById('sbList');
    if (!host) return;

    if (!document.getElementById('owSkinsCss')) {
      var st = document.createElement('style');
      st.id = 'owSkinsCss';
      st.textContent = skinsCss;
      document.head.appendChild(st);
    }

    var bar = document.createElement('div');
    bar.className = 'ow-bar';
    bar.id = 'owSkinBar';
    bar.innerHTML =
        '<h4>' + T('ownerTools', 'Инструменты владельца') + '</h4>'
      + '<div class="ow-bar-row">'
      +   '<input id="owSkName" placeholder="' + T('colName', 'Название скина') + '">'
      +   '<input id="owSkUrl" placeholder="https://… ссылка на картинку">'
      +   '<button class="go" id="owSkUrlGo">' + T('addFromUrl', 'Из ссылки') + '</button>'
      +   '<button id="owSkFileGo">' + T('addFromFile', 'Из файла') + '</button>'
      + '</div>'
      + '<input type="file" id="owSkFile" accept="image/*" style="display:none">';
    host.parentNode.insertBefore(bar, host);

    bar.querySelector('#owSkUrlGo').onclick = function () {
      var u = bar.querySelector('#owSkUrl').value.trim();
      if (!u) { say(T('needUrl', 'Вставьте ссылку на картинку')); return; }
      publish(u);
    };
    bar.querySelector('#owSkFileGo').onclick = function () {
      bar.querySelector('#owSkFile').click();
    };
    bar.querySelector('#owSkFile').onchange = function (e) {
      var f = e.target.files[0];
      e.target.value = '';
      if (f) shrink(f, publish);
    };
  }

  // Уменьшаем картинку прямо в браузере: на сервер не должна лететь
  // фотография на несколько мегабайт.
  function shrink(file, done) {
    var rd = new FileReader();
    rd.onload = function () {
      var im = new Image();
      im.onload = function () {
        var MAX_W = 300, MAX_H = 450;
        var k = Math.min(MAX_W / im.width, MAX_H / im.height, 1);
        var cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(im.width * k));
        cv.height = Math.max(1, Math.round(im.height * k));
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        var out = cv.toDataURL('image/png');
        if (out.length > 700 * 1024) out = cv.toDataURL('image/jpeg', 0.82);
        if (out.length > 900 * 1024) { say(T('imgTooBig', 'Картинка слишком тяжёлая')); return; }
        done(out);
      };
      im.onerror = function () { say(T('imgBad', 'Не удалось прочитать картинку')); };
      im.src = rd.result;
    };
    rd.onerror = function () { say(T('imgBad', 'Не удалось прочитать файл')); };
    rd.readAsDataURL(file);
  }

  function publish(src) {
    var nameEl = document.getElementById('owSkName');
    var name = nameEl ? nameEl.value.trim() : '';
    if (name.length < 2) { say(T('skinNameShort', 'Слишком короткое название')); return; }
    post('/owner/publishImageSkin', { skinName: name, img: src })
      .then(function (r) {
        if (r.status !== 'success') { say(r.message || T('errorTxt')); return; }
        say(r.message, true);
        nameEl.value = '';
        var u = document.getElementById('owSkUrl'); if (u) u.value = '';
        reload();
      })
      .catch(function () { say(T('serverDown', 'Сервер недоступен')); });
  }

  // кнопки владельца на каждой карточке скина
  function decorateSkins(skins) {
    buildBar();
    var map = {};
    (skins || []).forEach(function (s) { map[s.id] = s; });

    var cards = document.querySelectorAll('.sbCard');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.querySelector('.ow-sk')) continue;
      var id = card.dataset.id;
      var s = map[id];
      if (!s) continue;

      var box = document.createElement('div');
      box.className = 'ow-sk';
      box.innerHTML =
          '<div class="pair">'
        +   '<input type="number" min="0" placeholder="' + T('likes','Лайки') + '" data-lk value="' + s.likes + '">'
        +   '<input type="number" min="0" placeholder="' + T('dislikes','Дизлайки') + '" data-dk value="' + s.dislikes + '">'
        + '</div>'
        + '<button data-votes>' + T('boostVotes', 'Накрутка оценок') + '</button>'
        + '<input type="number" min="0" placeholder="' + T('priceCoins', 'Цена в монетах') +
          '" data-price value="' + (s.price || 0) + '">'
        + '<button data-avatar' + (s.inAvatar ? ' class="on"' : '') + '>'
        +   (s.inAvatar ? T('removeAvatar', 'Убрать из Avatar') : T('toAvatar', 'В Avatar'))
        + '</button>'
        + '<button data-img>' +
            (s.img ? T('changeImage', 'Сменить картинку') : T('setImage', 'Задать картинку')) +
          '</button>'
        + '<button data-drop>' + T('removeTxt', 'Удалить') + '</button>';
      card.appendChild(box);

      (function (card, id) {
        var q = function (sel) { return card.querySelector(sel); };

        q('[data-votes]').onclick = function () {
          post('/owner/skinVotes', {
            id: id, likes: q('[data-lk]').value, dislikes: q('[data-dk]').value
          }).then(function (r) {
            if (r.status !== 'success') { say(r.message || T('errorTxt')); return; }
            say('👍 ' + r.likes + '   👎 ' + r.dislikes + '   → ' + r.rating, true);
            reload();
          }).catch(function () { say(T('serverDown', 'Сервер недоступен')); });
        };

        q('[data-avatar]').onclick = function () {
          var on = this.classList.contains('on') ? 'false' : 'true';
          post('/owner/skinToAvatar', { id: id, on: on, price: q('[data-price]').value })
            .then(function (r) {
              if (r.status !== 'success') { say(r.message); return; }
              say(r.message, true); reload();
            }).catch(function () { say(T('serverDown', 'Сервер недоступен')); });
        };

        q('[data-img]').onclick = function () {
          var inp = document.createElement('input');
          inp.type = 'file'; inp.accept = 'image/*';
          inp.onchange = function () {
            var f = inp.files[0];
            if (!f) return;
            shrink(f, function (src) {
              post('/owner/skinImage', { id: id, img: src })
                .then(function (r) { r.status === 'success' ? reload() : say(r.message); })
                .catch(function () { say(T('serverDown', 'Сервер недоступен')); });
            });
          };
          inp.click();
        };

        q('[data-drop]').onclick = function () {
          post('/skins/remove', { id: id })
            .then(function (r) { r.status === 'success' ? reload() : say(r.message); })
            .catch(function () { say(T('serverDown', 'Сервер недоступен')); });
        };
      })(card, id);
    }
  }

  /* ══════════════════════════════════════════════
     SKIN EDITOR — загрузка картинки прямо в редакторе.
     Панель приходит только владельцу: сервер отдаёт owner.js
     остальным пустым файлом, поэтому у игроков её нет вовсе.
     ══════════════════════════════════════════════ */
  function buildEditorPanel() {
    if (document.getElementById('owImgPanel')) return;
    var stage = document.getElementById('seStage');
    if (!stage || !window.BFSkinEditor) return;

    if (!document.getElementById('owSkinsCss')) {
      var st = document.createElement('style');
      st.id = 'owSkinsCss';
      st.textContent = skinsCss;
      document.head.appendChild(st);
    }

    var box = document.createElement('div');
    box.className = 'ow-bar';
    box.id = 'owImgPanel';
    box.innerHTML =
        '<h4>' + T('ownerTools', 'Инструменты владельца') + ' — скин из картинки</h4>'
      + '<input id="owEdName" placeholder="' + T('colName', 'Название скина') + '" style="margin-bottom:8px">'
      + '<input id="owEdUrl" placeholder="https://… ссылка на картинку" style="margin-bottom:8px">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'
      +   '<button id="owEdFile">' + T('addFromFile', 'Выбрать файл') + '</button>'
      +   '<button id="owEdUrlGo">' + T('addFromUrl', 'Взять по ссылке') + '</button>'
      + '</div>'
      + '<button class="go" id="owEdPublish" style="width:100%">'
      +   T('publishSkin', 'Опубликовать') + '</button>'
      + '<div id="owEdHint" class="ow-note">'
      +   'Выберите файл или вставьте ссылку — картинка сразу встанет на превью.'
      + '</div>'
      + '<input type="file" id="owEdFileInput" accept="image/*" style="display:none">';

    // панель прямо под превью, чтобы результат был виден сразу
    stage.parentNode.insertBefore(box, stage.nextSibling);

    var $ = function (id) { return document.getElementById(id); };
    var E = window.BFSkinEditor;

    // подсветка выбранного источника: раньше по кнопкам было не понять,
    // нажались они или нет
    function pick(which) {
      $('owEdFile').classList.toggle('picked', which === 'file');
      $('owEdUrlGo').classList.toggle('picked', which === 'url');
    }
    function note(text, ok) {
      var n = $('owEdHint');
      n.textContent = text;
      n.className = 'ow-note' + (ok ? ' ok' : '');
    }

    $('owEdFile').onclick = function () {
      pick('file');
      $('owEdFileInput').click();
    };
    $('owEdFileInput').onchange = function (e) {
      var f = e.target.files[0];
      e.target.value = '';
      if (!f) { pick(''); return; }
      note('Читаю файл…');
      shrink(f, function (src) {
        E.setImage(src);                       // видно на превью немедленно
        note('Файл загружен: ' + f.name + '. Дайте название и нажмите «Выложить».', true);
        E.msg('Картинка на превью', true);
      });
    };

    $('owEdUrlGo').onclick = function () {
      var u = $('owEdUrl').value.trim();
      if (!u) { E.msg('Вставьте ссылку на картинку'); note('Поле ссылки пустое'); return; }
      pick('url');
      E.setImage(u);
      note('Ссылка принята. Картинку скачаю при публикации.', true);
      E.msg('Картинка на превью', true);
    };

    $('owEdPublish').onclick = function () {
      var name = $('owEdName').value.trim();
      var src = E.getImage();
      if (!src) { E.msg('Сначала выберите файл или укажите ссылку'); return; }
      if (name.length < 2) { E.msg('Название: хотя бы 2 символа'); return; }

      var btn = this;
      btn.disabled = true;
      var was = btn.textContent;
      btn.textContent = '…';
      post('/owner/publishImageSkin', { skinName: name, img: src })
        .then(function (r) {
          btn.disabled = false; btn.textContent = was;
          if (r.status !== 'success') { E.msg(r.message || 'Ошибка'); return; }
          E.msg(r.message, true);
          if (r.img) E.setImage(r.img);        // дальше показываем сохранённый файл
          note('Готово — скин добавлен в Avatar.', true);
          pick('');
          $('owEdName').value = ''; $('owEdUrl').value = '';
          E.refreshLimit();
        })
        .catch(function () {
          btn.disabled = false; btn.textContent = was;
          E.msg(T('serverDown', 'Сервер недоступен'));
        });
    };
  }

  function watchEditor() {
    if (window.BFSkinEditor) buildEditorPanel();
    else window.addEventListener('bf-skineditor-ready', buildEditorPanel);
    // страница могла успеть инициализироваться раньше owner.js
    setTimeout(buildEditorPanel, 400);
  }

  function watchSkins() {
    window.addEventListener('bf-skins-drawn', function (e) {
      decorateSkins(e.detail && e.detail.skins);
    });
    // если список успел отрисоваться до загрузки owner.js
    if (document.querySelector('.sbCard')) decorateSkins([]);
    buildBar();
  }

  /* ---------- старт ---------- */
  get('/whoAmI').then(function (r) {
    if (!r || !r.owner) return;      // не владелец — ничего не показываем
    me = r;
    injectCss();
    buildPanel();
    if (/mapsBrowser/i.test(location.pathname)) watchBrowser();
    // Skin Editor и Skins Browser объединены в страницу Avatar
    if (/avatar/i.test(location.pathname)) { watchSkins(); watchEditor(); }
  }).catch(function () {});

  /* Панель Admin Abuse подключаем отсюда. В разметке страниц её тега нет
     вообще: у обычного игрока owner.js пустой, значит он и не узнает,
     что такой файл существует, и запроса за ним не будет. */
  (function () {
    if (document.getElementById('aaScript')) return;
    var sc = document.createElement('script');
    sc.id = 'aaScript';
    sc.src = 'adminAbuse.js';
    sc.defer = true;
    document.head.appendChild(sc);
  })();
})();
