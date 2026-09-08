// Единый фикс верхнего меню для ВСЕХ страниц.
// Вендорные страницы (mapsBrowser, users, avatar…) рисуют шапку изнутри своих
// бандлов со старыми путями и без Leaderboard. Этот скрипт после загрузки
// правит ссылки на реальные файлы и добавляет пункт Leaderboard.
(function () {
  'use strict';

  // куда реально ведут разделы в нашей сборке
  // (Skin Editor и Skins Browser переехали на страницу Avatar)
  var MAP = {
    'editor':        'editor.html',
    'map editor':    'editor.html',
    'skin editor':   'avatar.html',
    'редактор скинов':'avatar.html',
    'maps browser':  'mapsBrowser.html',
    'browser':       'mapsBrowser.html',
    'skins browser': 'avatar.html',
    'avatar':        'avatar.html',
    'shop':          'avatar.html',
    'магазин':       'avatar.html',
    'supporters':    'leaderboard.html',
    'editor tutorial':'editor.html',
    'leaderboard':   'leaderboard.html',
    'leaderboards':  'leaderboard.html',
    'logs':          'logs.html'
  };

  // Menu не ведёт на страницу — им управляет сам вендорный код
  var MENU_LABELS = ['menu', 'меню', 'menü', 'menú', '菜单'];

  function label(el) {
    return (el.textContent || '').trim().toLowerCase();
  }

  // навесить правильный переход на элемент меню
  function wire(el) {
    if (MENU_LABELS.indexOf(label(el)) !== -1) return;   // Menu не трогаем
    // кнопка с подменю открывает список, а не ведёт на страницу
    if (el.classList && el.classList.contains('header-link-item-button') &&
        el.parentNode && el.parentNode.querySelector &&
        el.parentNode.querySelector('.header-link-item-sub-menu')) return;
    var dest = MAP[label(el)];
    if (!dest) return;
    if (el.tagName === 'A') el.setAttribute('href', dest);
    el.style.cursor = 'pointer';
    if (el.__wired) return;
    el.__wired = true;
    el.addEventListener('click', function (e) {
      e.preventDefault();
      location.href = dest;
    });
  }

  // добавить кнопку Leaderboard в верхнюю панель, если её там нет.
  // Проверяем по data-i18n, а не по тексту: текст к этому моменту уже
  // мог быть переведён, и сравнение со словом leaderboard давало дубль.
  function addLeaderboardButton(header) {
    if (header.querySelector('[data-i18n="leaderboard"]')) return;
    var buttons = header.querySelectorAll('.header-link-item-button');
    for (var i = 0; i < buttons.length; i++) {
      var t = label(buttons[i]);
      if (t === 'leaderboard' || t === 'leaderboards' || MAP[t] === 'leaderboard.html') return;
    }
    // берём любой существующий пункт как образец разметки
    var sample = header.querySelector('.header-link-item');
    if (!sample) return;
    var item = sample.cloneNode(true);
    // очистить клон от подменю и лишнего
    var sub = item.querySelector('.header-link-item-sub-menu');
    if (sub) sub.parentNode.removeChild(sub);
    var btn = item.querySelector('.header-link-item-button') || item;
    btn.textContent = 'Leaderboard';
    btn.setAttribute('data-i18n', 'leaderboard');
    btn.removeAttribute('href');
    // вставляем первым в контейнере ссылок
    var container = sample.parentNode;
    container.insertBefore(item, container.firstChild);
    wire(btn);
  }

  // подменю по клику — на телефоне наведения мышью нет
  function wireSubMenus(header) {
    Array.prototype.forEach.call(header.querySelectorAll('.header-link-item'), function (item) {
      var sub = item.querySelector('.header-link-item-sub-menu');
      var btn = item.querySelector('.header-link-item-button');
      if (!sub || !btn || item.__subWired) return;
      item.__subWired = true;
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = sub.style.display === 'block';
        Array.prototype.forEach.call(
          document.querySelectorAll('.header-link-item-sub-menu'),
          function (x) { x.style.display = 'none'; });
        sub.style.display = open ? 'none' : 'block';
      }, true);
      sub.addEventListener('click', function (e) { e.stopPropagation(); });
    });
    if (!document.__subCloser2) {
      document.__subCloser2 = true;
      document.addEventListener('click', function () {
        Array.prototype.forEach.call(
          document.querySelectorAll('.header-link-item-sub-menu'),
          function (x) { x.style.display = 'none'; });
      });
    }
  }

  function fix() {
    var header = document.querySelector('.header');
    if (!header) return false;
    wireSubMenus(header);

    // 1) починить все существующие пункты
    var items = header.querySelectorAll(
      '.header-link-item-button, .header-link-a, .header-link-item-sub-menu a, .header-more-link-button'
    );
    for (var i = 0; i < items.length; i++) wire(items[i]);

    // 2) добавить Leaderboard в верхнюю панель
    addLeaderboardButton(header);
    // 3) Menu должен быть виден всем, даже на узком экране
    var items = header.querySelectorAll('.header-link-item');
    for (var m = 0; m < items.length; m++) {
      var btn = items[m].querySelector('.header-link-item-button');
      if (btn && MENU_LABELS.indexOf(label(btn)) !== -1) items[m].style.display = 'inherit';
    }
    return true;
  }

  // шапка вендора появляется не сразу — подождём её
  function boot() {
    if (fix()) return;
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (fix() || tries > 40) clearInterval(t);   // максимум ~10 секунд
    }, 250);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
