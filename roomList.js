// ============ СПИСОК КОМНАТ СО СВЕТОФОРОМ (hide-and-seek.html, race.html) ============
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

  function refresh(el, mode) {
    fetch('/getRoomList?mode=' + encodeURIComponent(mode), { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) { render(el, mode, d); })
      .catch(function () {});
  }

  function init(el, mode) {
    if (!el) return;
    refresh(el, mode);
    var timer = setInterval(function () {
      // страницу покинули (SPA-переход или просто ушли) — таймер сам себя гасит
      if (!document.body.contains(el)) { clearInterval(timer); return; }
      refresh(el, mode);
    }, POLL_MS);

    el.addEventListener('click', function (e) {
      var row = e.target.closest ? e.target.closest('.rlRow') : null;
      if (!row || !row.dataset.room) return;
      location.href = 'game.html?mode=' + encodeURIComponent(mode) + '&room=' + encodeURIComponent(row.dataset.room);
    });
  }

  window.BFRoomList = { init: init };
})();
