/* AIBROFIST — инструменты владельца сайта.
   Всё, что тут есть, видно и работает ТОЛЬКО для аккаунта-владельца:
   сервер повторно проверяет права на каждый запрос, кнопки — лишь удобная обёртка. */
(function () {
  'use strict';

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
      +     '<option value="add">+ add</option><option value="set">= set</option>'
      +   '</select>'
      + '</div>'
      + '<div class="ow-b" id="owCGo">' + T('apply', 'Применить') + '</div>'
      + '<div class="ow-m" id="owCMsg"></div>'

      + '<div class="ow-sub">' + T('boostVotes', 'Оценка карты') + '</div>'
      + '<div class="ow-m" style="text-align:left;color:#6b7280;margin-bottom:4px">'
      +   'These numbers set the final total on the card, not an increment.</div>'
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

      + '<div class="ow-sub">Backup</div>'
      + '<div class="ow-m" style="text-align:left;color:#6b7280;margin-bottom:4px">'
      +   'One file with everything: accounts, coins, skins, maps, news. '
      +   'Download it before moving to another server — and restore it there in this same panel. '
      +   'Show media larger than 25 MB is not included in the file.'
      + '</div>'
      + '<div class="ow-row2">'
      +   '<div class="ow-b" id="owBkDl" style="margin:0">Download</div>'
      +   '<div class="ow-b" id="owBkRs" style="margin:0">Restore</div>'
      + '</div>'
      + '<div class="ow-m" id="owBkMsg"></div>'
      + '<input type="file" id="owBkFile" accept=".json,application/json" style="display:none">';

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
          ? 'Likes: ' + r.likes + '   Dislikes: ' + r.dislikes + '   Rating: ' + r.rating
          : (r.message || T('errorTxt', 'Ошибка'));
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
            return '· ' + x.mapName + ' <span style="color:#9aa3ad">(' + x.author + ')</span> → ' + m;
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
    if (document.getElementById('aaScript')) return;
    var sc = document.createElement('script');
    sc.id = 'aaScript';
    sc.src = 'adminAbuse.js';
    sc.defer = true;
    document.head.appendChild(sc);
  })();
})();
