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
  box.innerHTML = '<button class="lcHead" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg><span class="lcT"></span><b class="lcN"></b><span class="lcX">&times;</span></button>'
    + '<div class="lcBody"><div class="lcList"></div><form class="lcForm"><input maxlength="140" autocomplete="off"><button type="submit">&#10148;</button></form></div>';
  var css = document.createElement('style');
  // свёрнутый — аккуратная «таблетка» со значком, развёрнутый — карточка в стиле сайта
  css.textContent = '#lobbyChat{position:fixed;right:16px;bottom:16px;z-index:40;font-family:inherit;font-size:13.5px;'
    + 'background:var(--card,#fff);color:var(--ink,#111827);border:1px solid var(--line,#e5e7eb);border-radius:999px;box-shadow:0 10px 28px -14px rgba(15,23,42,.45)}'
    + '#lobbyChat.on{width:320px;max-width:calc(100vw - 32px);border-radius:16px;overflow:hidden}'
    + '#lobbyChat .lcHead{display:flex;width:100%;align-items:center;gap:8px;padding:10px 16px;border:0;background:transparent;color:inherit;font:inherit;font-weight:700;cursor:pointer}'
    + '#lobbyChat .lcHead svg{width:17px;height:17px;flex:0 0 auto}'
    + '#lobbyChat.on .lcHead{padding:12px 16px}'
    + '#lobbyChat .lcX{margin-left:auto;color:var(--muted,#6b7280);font-weight:400;font-size:18px;line-height:1}'
    + '#lobbyChat:not(.on) .lcX{display:none}'
    + '#lobbyChat .lcN{background:#ef4444;color:#fff;border-radius:999px;padding:1px 7px;font-size:11px;font-weight:700}'
    + '#lobbyChat .lcN:empty{display:none}#lobbyChat:not(.on) .lcBody{display:none}'
    + '#lobbyChat .lcList{height:240px;overflow:auto;padding:8px 16px;border-top:1px solid var(--line,#e5e7eb)}'
    + '#lobbyChat .lcList:empty::before{content:attr(data-empty);display:block;color:var(--muted,#6b7280);text-align:center;padding-top:90px}'
    + '#lobbyChat .lcMsg{padding:4px 0;line-height:1.4;word-wrap:break-word}#lobbyChat .lcMsg b{margin-right:6px;color:var(--blue,#2563eb)}'
    + '#lobbyChat .lcForm{display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--line,#e5e7eb)}'
    + '#lobbyChat .lcForm input{flex:1;min-width:0;padding:9px 12px;border-radius:10px;border:1px solid var(--line,#d7dee7);background:transparent;color:inherit;font:inherit}'
    + '#lobbyChat .lcForm button{width:40px;border-radius:10px;border:0;background:var(--ink,#111827);color:var(--card,#fff);cursor:pointer;font-size:15px}';
  document.head.appendChild(css);
  document.body.appendChild(box);
  var list = box.querySelector('.lcList'), input = box.querySelector('input');
  function paint() {
    box.classList.toggle('on', open);
    box.querySelector('.lcT').textContent = T('lobbyChatTitle', 'Общий чат');
    box.querySelector('.lcN').textContent = !open && unread ? String(unread) : '';
    input.placeholder = T('lobbyChatPh', 'Написать всем…');
    list.setAttribute('data-empty', T('lobbyChatEmpty', 'Пока тихо — напиши первым!'));
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
