// ============ СПИСОК КОМНАТ СО СВЕТОФОРОМ (hide-and-seek.html, race.html, variant.html) ============
// Красный — комната полна, жёлтый — кто-то только что вышел (см. /getRoomList
// на сервере), зелёный — свободно. Клик по строке ведёт в конкретную комнату:
// game.html?mode=...&room=... уже умеет заходить в заданную комнату напрямую
// (см. ROOM в game.js), кнопка «Играть» на странице режима никак не трогается —
// список это просто ещё один, необязательный способ попасть в игру.
(function () {
  'use strict';

  var POLL_MS = 4000;
  var NAMES_SHOWN = 10;   // остальные сворачиваются в "+ ещё N"
  var COLOR = { red: '#dc2626', yellow: '#f59e0b', green: '#16a34a' };

  function T(k, f) {
    return (window.I18N && I18N.t(k) !== k) ? I18N.t(k) : f;
  }

  function render(el, mode, data) {
    var rooms = (data && data.rooms) || [];
    el.innerHTML = '';
    if (!rooms.length) {
      var empty = document.createElement('div');
      empty.className = 'rlEmpty';
      empty.textContent = T('roomListEmpty', 'Пока никто не играет — жми «Играть», откроется новая комната.');
      el.appendChild(empty);
      return;
    }
    rooms.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'rlRow';
      row.dataset.room = r.room;

      var head = document.createElement('div');
      head.className = 'rlHead';

      var dot = document.createElement('span');
      dot.className = 'rlDot';
      dot.style.background = COLOR[r.status] || COLOR.green;

      var name = document.createElement('span');
      name.className = 'rlName';
      name.textContent = r.room;

      var count = document.createElement('span');
      count.className = 'rlCount';
      count.textContent = r.players + ' / ' + (data.limit || 40);

      head.appendChild(dot); head.appendChild(name); head.appendChild(count);
      row.appendChild(head);

      // кто сейчас в комнате — теми же именами, что и в самой игре над головой
      var names = r.names || [];
      if (names.length) {
        var who = document.createElement('div');
        who.className = 'rlWho';
        var shown = names.slice(0, NAMES_SHOWN).join(', ');
        var extra = names.length - NAMES_SHOWN;
        who.textContent = extra > 0
          ? shown + ' ' + T('roomListMore', '+ ещё {n}').replace('{n}', extra)
          : shown;
        row.appendChild(who);
      }

      el.appendChild(row);
    });
  }

  // variant — отдельный режим пряток (murder, cops, ctf, dom): только его комнаты
  function refresh(el, mode, variant) {
    fetch('/getRoomList?mode=' + encodeURIComponent(mode) + (variant ? '&variant=' + encodeURIComponent(variant) : ''), { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) { render(el, mode, d); })
      .catch(function () {});
  }

  function init(el, mode, variant) {
    if (!el) return;
    refresh(el, mode, variant);
    var timer = setInterval(function () {
      // страницу покинули (SPA-переход или просто ушли) — таймер сам себя гасит
      if (!document.body.contains(el)) { clearInterval(timer); return; }
      refresh(el, mode, variant);
    }, POLL_MS);

    el.addEventListener('click', function (e) {
      var row = e.target.closest ? e.target.closest('.rlRow') : null;
      if (!row || !row.dataset.room) return;
      // отдельный режим — сам в ссылке: game?mode=murder&room=murder-1
      location.href = 'game?mode=' + encodeURIComponent(variant || mode) + '&room=' + encodeURIComponent(row.dataset.room);
    });
  }

  /* ---------- приватные комнаты по коду (см. isPrivateRoom в server.js) ----------
     Под списком комнат: «Создать приватную комнату» — придумывает код и сразу заводит в комнату,
     которой нет ни в списке, ни в подборе; друзья входят по коду из шести знаков или по ссылке. */
  var ABC = 'abcdefghjkmnpqrstuvwxyz23456789';      // без похожих знаков: 0/o, 1/l/i
  function newCode() {
    var c = '', rnd = new Uint32Array(6);
    (window.crypto || window.msCrypto).getRandomValues(rnd);
    for (var i = 0; i < 6; i++) c += ABC[rnd[i] % ABC.length];
    return c;
  }
  function roomOf(code, variant) { return (variant ? variant + '-' : '') + 'p' + code; }
  function go(mode, variant, code) {
    location.href = 'game?mode=' + encodeURIComponent(variant || mode) + '&room=' + encodeURIComponent(roomOf(code, variant));
  }
  function privateUi(el, mode, variant) {
    if (!el || !el.parentNode || el.parentNode.querySelector('.rlPriv')) return;
    var box = document.createElement('div');
    box.className = 'rlPriv';
    box.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:-8px 0 18px';
    var mk = document.createElement('button');
    mk.type = 'button'; mk.className = 'rlPrivNew';
    mk.textContent = T('privCreate', 'Создать приватную комнату');
    var inp = document.createElement('input');
    inp.className = 'rlPrivCode'; inp.maxLength = 12; inp.autocomplete = 'off'; inp.spellcheck = false;
    inp.placeholder = T('privCodePh', 'Код комнаты');
    var join = document.createElement('button');
    join.type = 'button'; join.className = 'rlPrivJoin';
    join.textContent = T('privJoin', 'Войти по коду');
    var msg = document.createElement('div');
    msg.className = 'rlPrivMsg'; msg.style.cssText = 'flex-basis:100%;font-size:13px;color:#b91c1c;min-height:0';
    [mk, join].forEach(function (b) {
      b.style.cssText = 'padding:9px 14px;border-radius:10px;border:1px solid var(--line,#d7dee7);background:var(--card,#fff);'
        + 'color:inherit;font:600 14px inherit;cursor:pointer';
    });
    inp.style.cssText = 'padding:9px 12px;border-radius:10px;border:1px solid var(--line,#d7dee7);background:var(--card,#fff);'
      + 'color:inherit;font:600 14px ui-monospace,monospace;width:150px;text-transform:uppercase;letter-spacing:1px';
    box.appendChild(mk); box.appendChild(inp); box.appendChild(join);
    // дуэль 1 на 1 — только в гонке: ждёт соперника в комнате на двоих (см. /getDuelRoom)
    if (mode === 'race' && !variant) {
      var du = document.createElement('button');
      du.type = 'button'; du.className = 'rlDuel';
      du.textContent = T('duelBtn', 'Дуэль 1 на 1');
      du.style.cssText = mk.style.cssText;
      du.addEventListener('click', function () {
        fetch('/getDuelRoom', { credentials: 'same-origin' }).then(function (r) { return r.json(); })
          .then(function (d) { location.href = 'game?mode=race&room=' + encodeURIComponent(d.room); })
          .catch(function () { location.href = 'game?mode=race&room=duel-1'; });
      });
      box.appendChild(du);
    }
    box.appendChild(msg);
    el.parentNode.insertBefore(box, el.nextSibling);

    mk.addEventListener('click', function () { go(mode, variant, newCode()); });
    function tryJoin() {
      // код можно вставить и целиком со ссылкой или с «p» в начале — берём последние шесть знаков
      var code = inp.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(-6);
      if (code.length !== 6) { msg.textContent = T('privBadCode', 'В коде шесть букв и цифр'); return; }
      msg.textContent = '';
      fetch('/getPrivateRoom?mode=' + encodeURIComponent(mode) + '&room=' + encodeURIComponent(roomOf(code, variant)), { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || !d.exists) { msg.textContent = T('privNoRoom', 'Комнаты с таким кодом сейчас нет'); return; }
          if (d.players >= d.limit) { msg.textContent = T('privFull', 'Комната заполнена'); return; }
          go(mode, variant, code);
        })
        .catch(function () { go(mode, variant, code); });      // без сервера (песочница) — просто входим
    }
    join.addEventListener('click', tryJoin);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryJoin(); });
  }

  window.BFRoomList = { init: function (el, mode, variant) { init(el, mode, variant); privateUi(el, mode, variant); } };
})();
