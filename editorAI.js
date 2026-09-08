/* ======= Помощник редактора =======
   Панель с чатом: спрашиваешь про редактор — отвечает. Работает офлайн
   по своей базе знаний (editorHelp.js), ничего не стоит и никуда
   не ходит по сети. Карты он не строит: это дело рук самого игрока. */
(function () {
  'use strict';

  var chat = [];

  /* ---------- стили ---------- */
  var css = ''
    + '#genBox{position:fixed;top:64px;left:50%;transform:translateX(-50%);width:390px;max-width:94vw;'
    + 'z-index:40;display:none;flex-direction:column;padding:0;overflow:hidden}'
    + '#genBox.on{display:flex}'
    + '#genHead{display:flex;align-items:center;gap:8px;padding:11px 13px;border-bottom:1px solid var(--line);'
    + 'font-weight:700;font-size:13px;letter-spacing:.3px;text-transform:uppercase;color:var(--accent)}'
    + '#genHead .x{margin-left:auto;color:#94a3b8;cursor:pointer;font-size:15px;line-height:1;padding:2px 6px}'
    + '#genHead .x:hover{color:#ef4444}'
    + '#genBody{padding:12px 13px;font-size:12.5px;color:var(--ink)}'
    + '#chatLog{max-height:42vh;overflow-y:auto;display:flex;flex-direction:column;gap:7px;'
    + 'padding:2px 1px 4px}'
    + '.chatMsg{padding:8px 10px;border-radius:10px;font-size:12.5px;line-height:1.6;white-space:pre-wrap}'
    + '.chatMsg.me{background:var(--accent);color:#fff;align-self:flex-end;max-width:85%}'
    + '.chatMsg.bot{background:#f4f6fa;color:var(--ink);align-self:flex-start;border:1px solid var(--line)}'
    + '#chatRow{display:flex;gap:6px;margin-top:9px}'
    + '#chatIn{flex:1;padding:9px 10px;border:1px solid var(--line);border-radius:9px;font:inherit;'
    + 'font-size:12.5px;background:#fafbfd;color:var(--ink);outline:none}'
    + '#chatIn:focus{border-color:var(--accent);background:#fff}'
    + '#chatSend{padding:0 14px;border-radius:9px;border:none;background:var(--accent);color:#fff;'
    + 'font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}'
    + '#genChips{display:flex;flex-wrap:wrap;gap:5px;margin:9px 0 0}'
    + '.genChip{font-size:11px;padding:4px 9px;border:1px solid var(--line);border-radius:20px;'
    + 'cursor:pointer;color:#5b6673;background:#f6f8fb;white-space:nowrap}'
    + '.genChip:hover{border-color:var(--accent);color:var(--accent)}'
    + '@media (max-width:860px){#genBox{top:auto;bottom:88px;width:94vw}}';

  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  /* ---------- разметка ---------- */
  var box = document.createElement('div');
  box.id = 'genBox';
  box.className = 'panel';
  box.innerHTML =
      '<div id="genHead">Помощник<div class="x" id="genClose">✕</div></div>'
    + '<div id="genBody"></div>';
  document.body.appendChild(box);

  var body = box.querySelector('#genBody');
  document.getElementById('genClose').onclick = function () { box.classList.remove('on'); };

  var ASKS = [
    'какие горячие клавиши?',
    'как сделать укрытие для пряток?',
    'как связать кнопку с блоком?',
    'какой максимальный разрыв прыжка?'
  ];

  /* ---------- кнопка в панели редактора ---------- */
  var SPARK = '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/>'
            + '<path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z"/>';

  function addButton() {
    var scene = document.getElementById('scene');
    if (!scene || document.getElementById('bGen')) return;
    var sep = document.createElement('div');
    sep.className = 'sep';
    var b = document.createElement('div');
    b.className = 'sBtn';
    b.id = 'bGen';
    b.setAttribute('data-tip', 'Помощник по редактору');
    b.innerHTML = '<svg viewBox="0 0 24 24">' + SPARK + '</svg>';
    b.onclick = toggle;
    var play = document.getElementById('bPlay');
    if (play) { scene.insertBefore(sep, play); scene.insertBefore(b, play); }
    else { scene.appendChild(sep); scene.appendChild(b); }
  }

  function toggle() {
    if (box.classList.contains('on')) { box.classList.remove('on'); return; }
    box.classList.add('on');
    draw();
    var el = document.getElementById('chatIn');
    if (el) el.focus();
  }

  /* ---------- чат ---------- */
  function draw() {
    body.innerHTML =
        '<div id="chatLog"></div>'
      + '<div id="chatRow">'
      +   '<input id="chatIn" placeholder="Спроси про редактор">'
      +   '<button id="chatSend">→</button>'
      + '</div>'
      + '<div id="genChips"></div>';

    if (!chat.length)
      chat.push({ who: 'bot', text:
        'Спрашивай про редактор: горячие клавиши, укрытия, связи '
        + 'кнопок, пределы прыжка, публикация карт. Отвечаю без интернета.' });

    renderChat();

    var chips = document.getElementById('genChips');
    ASKS.forEach(function (q) {
      var c = document.createElement('div');
      c.className = 'genChip';
      c.textContent = q;
      c.onclick = function () { ask(q); };
      chips.appendChild(c);
    });

    document.getElementById('chatSend').onclick = send;
    document.getElementById('chatIn').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); send(); }
    });
  }

  function renderChat() {
    var log = document.getElementById('chatLog');
    if (!log) return;
    log.innerHTML = '';
    chat.forEach(function (m) {
      var d = document.createElement('div');
      d.className = 'chatMsg ' + (m.who === 'me' ? 'me' : 'bot');
      d.textContent = m.text;
      log.appendChild(d);
    });
    log.scrollTop = log.scrollHeight;
  }

  function ask(q) {
    chat.push({ who: 'me', text: q });
    var a = window.BFHelp ? BFHelp.ask(q) : null;
    chat.push({ who: 'bot', text: a ? a.answer : 'Справка не загрузилась — обнови страницу.' });
    renderChat();
  }

  function send() {
    var el = document.getElementById('chatIn');
    var q = (el.value || '').trim();
    if (!q) return;
    el.value = '';
    ask(q);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', addButton);
  else addButton();

  window.BFHelpUI = { open: toggle, ask: ask };
})();
