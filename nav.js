/* Навигация главного меню AIBrofist
   В исходном index.html все ссылки заглушены (href="#"), поэтому назначаем их здесь.
   Кнопка Menu открывает список разделов и доступна всем, включая гостей. */
(function () {
  'use strict';

  var ROUTES = {
    'hide and seek':        'hide-and-seek.html',
    'race':                 'race.html',
    'гонка':                'race.html',
    'прятки':               'hide-and-seek.html',
    'map editor':           'editor.html',
    'editor':               'editor.html',
    'skin editor':          'avatar.html',
    'редактор скинов':      'avatar.html',
    'maps browser':         'mapsBrowser.html',
    'browser':              'mapsBrowser.html',
    'skins browser':        'avatar.html',
    'обзор скинов':         'avatar.html',
    'shop':                 'avatar.html',
    'магазин':              'avatar.html',
    'logs':                 'logs.html',
    'новости':              'logs.html',
    'avatar':               'avatar.html',
    'аватар':               'avatar.html',
    'leaderboards':         'leaderboard.html',
    'leaderboard':          'leaderboard.html',
    'таблица лидеров':      'leaderboard.html',
    'supporters':           'leaderboard.html',
    'editor tutorial':      'editor.html',
    'privacy policy':       'logs.html',
    'terms & conditions':   'logs.html'
  };

  var MENU_LABELS = ['menu', 'меню', 'menü', 'menú', '菜单'];

  function go(target) {
    if (typeof target === 'string') { location.href = target; return; }
    if (target && target.play) location.href = 'game.html?mode=' + target.play;
  }

  function toast(text) {
    var t = document.createElement('div');
    t.textContent = text;
    t.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:9999;' +
      'background:rgba(0,0,0,.82);color:#fff;padding:11px 20px;border-radius:20px;font-size:14px;' +
      'font-family:sans-serif;pointer-events:none';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 1800);
  }

  function label(el) {
    return (el.textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  // в списке Menu не хватало Skin Editor, Logs и Leaderboards — добавляем

  // На телефоне нет наведения мышью, поэтому подменю «Editor» и «Browser»
  // не открывались вовсе — их пункты выглядели нерабочими. Открываем по клику.

  function wireCards() {
    Array.prototype.forEach.call(document.querySelectorAll('.card'), function (card) {
      var title = card.querySelector('div');
      var dest = ROUTES[label(title || card)];
      card.style.cursor = 'pointer';
      card.addEventListener('click', function (e) {
        e.preventDefault();
        if (dest) go(dest);
        else toast(window.I18N ? I18N.t('notReady') : 'Этот режим ещё не готов');
      });
    });

  }

  function boot() {
    // Верхнюю панель теперь целиком строит shell.js — одна на все страницы.
    // Здесь остаются только карточки режимов на главной, иначе две
    // системы навигации мешали друг другу и меню мигало.
    wireCards();
    if (window.I18N) I18N.apply(document.body);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
