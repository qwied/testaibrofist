/* Общий чат на главной (идея «чат в меню/лобби»): маленькое окно в углу, сворачивается. Пишут
   вошедшие в аккаунт, читают все; сообщения — последние 60 на сервере (см. social.js). */
(function () {
  'use strict';
  var T = function (k, f) { return (window.I18N && I18N.t(k) !== k) ? I18N.t(k) : f; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var last = 0, open = false, unread = 0;
  try { open = localStorage.getItem('bfLobbyChat') === '1'; } catch (e) {}
  var box = document.createElement('div');
  box.id = 'lobbyChat';
  box.innerHTML = '<button class="lcHead" type="button"><span class="lcT"></span><b class="lcN"></b></button>'
    + '<div class="lcBody"><div class="lcList"></div><form class="lcForm"><input maxlength="140" autocomplete="off"><button type="submit">&#10148;</button></form></div>';
  var css = document.createElement('style');
  css.textContent = '#lobbyChat{position:fixed;right:14px;bottom:14px;z-index:40;width:300px;max-width:calc(100vw - 28px);font:13px sans-serif;'
    + 'background:var(--card,#fff);color:var(--ink,#111827);border:1px solid var(--line,#d7dee7);border-radius:14px;box-shadow:0 12px 30px -16px rgba(15,23,42,.5);overflow:hidden}'
    + '#lobbyChat .lcHead{display:flex;width:100%;align-items:center;gap:6px;padding:9px 12px;border:0;background:transparent;color:inherit;font:700 13px sans-serif;cursor:pointer}'
    + '#lobbyChat .lcN{margin-left:auto;background:#ef4444;color:#fff;border-radius:999px;padding:0 6px;font-size:11px}'
    + '#lobbyChat .lcN:empty{display:none}#lobbyChat:not(.on) .lcBody{display:none}'
    + '#lobbyChat .lcList{height:220px;overflow:auto;padding:4px 12px;border-top:1px solid var(--line,#e5e7eb)}'
    + '#lobbyChat .lcMsg{padding:3px 0;word-wrap:break-word}#lobbyChat .lcMsg b{margin-right:4px}'
    + '#lobbyChat .lcForm{display:flex;gap:6px;padding:8px;border-top:1px solid var(--line,#e5e7eb)}'
    + '#lobbyChat .lcForm input{flex:1;min-width:0;padding:7px 9px;border-radius:9px;border:1px solid var(--line,#d7dee7);background:transparent;color:inherit}'
    + '#lobbyChat .lcForm button{padding:6px 10px;border-radius:9px;border:0;background:#111827;color:#fff;cursor:pointer}';
  document.head.appendChild(css);
  document.body.appendChild(box);
  var list = box.querySelector('.lcList'), input = box.querySelector('input');
  function paint() {
    box.classList.toggle('on', open);
    box.querySelector('.lcT').textContent = T('lobbyChatTitle', 'Общий чат');
    box.querySelector('.lcN').textContent = !open && unread ? String(unread) : '';
    input.placeholder = T('lobbyChatPh', 'Написать всем…');
  }
  box.querySelector('.lcHead').onclick = function () {
    open = !open; unread = 0;
    try { localStorage.setItem('bfLobbyChat', open ? '1' : '0'); } catch (e) {}
    paint(); if (open) { list.scrollTop = list.scrollHeight; input.focus(); }
  };
  function poll() {
    fetch('/lobbyChat?after=' + last, { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (d) {
      (d && d.messages || []).forEach(function (m) {
        last = Math.max(last, m.id);
        var el = document.createElement('div'); el.className = 'lcMsg';
        el.innerHTML = '<b>' + esc(m.name) + '</b>' + esc(m.text);
        list.appendChild(el);
        if (!open) unread++;
      });
      while (list.children.length > 60) list.removeChild(list.firstChild);
      if (open) list.scrollTop = list.scrollHeight;
      paint();
    }).catch(function () {});
  }
  box.querySelector('form').onsubmit = function (e) {
    e.preventDefault();
    var text = input.value.trim(); if (!text) return;
    fetch('/lobbyChat', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'text=' + encodeURIComponent(text) })
      .then(function (r) { return r.json(); }).then(function (d) {
        if (d && d.status === 'success') { input.value = ''; poll(); }
        else { input.value = ''; input.placeholder = (d && d.message) || 'Error'; }
      }).catch(function () {});
  };
  paint(); poll(); setInterval(poll, 4000);
  window.__bfLobbyChat = { poll: poll };
})();
