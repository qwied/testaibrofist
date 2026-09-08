/* AIBROFIST — надетый скин виден везде, где показывают игрока:
   в шапке, в профиле, в списках друзей, в таблице лидеров, у авторов карт.
   Картинка-аватар подменяется на ту же фигуру, что рисуется в игре. */
(function () {
  'use strict';

  var cache = {};        // ник -> скин
  var pending = {};      // ник -> [элементы, ждущие скин]
  var byId = null;       // каталог деталей
  var meName = null;
  var timer = null;

  function catalog() {
    if (byId) return Promise.resolve(byId);
    return fetch('/skin/catalog', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        byId = {};
        (d.items || []).forEach(function (i) { byId[i.id] = i; });
        return byId;
      });
  }

  /* Везде показываем ФИГУРУ ЦЕЛИКОМ, просто разного размера.
     Портретная обрезка показывала одну голову — по ней было не понять,
     что за скин. Вписывание делает object-fit: contain. */
  function dataUri(skin) {
    if (skin && skin.img) return skin.img;   // скин-картинка от владельца
    if (!window.BFSkin) return null;
    var svg = window.BFSkin.svg(skin, byId, { height: 300 });
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* Один и тот же приём во всех местах: скин всегда рисуется КАРТИНКОЙ.
     Раньше для не-<img> элементов он ставился фоном, а внутри оставалась
     чёрная заглушка-фигурка — поверх скина, отчего иконка выглядела
     сломанной. Теперь у такого элемента создаётся <img class="bfAva">,
     а остальное содержимое убирается. */
  function paint(el, skin) {
    var uri = (skin && skin.img) ? skin.img : dataUri(skin);
    if (!uri) return;

    var img = el;
    if (el.tagName !== 'IMG') {
      img = el.querySelector('img.bfAva');
      if (!img) {
        el.innerHTML = '';                      // убираем заглушку
        img = document.createElement('img');
        img.className = 'bfAva';
        img.alt = '';
        el.appendChild(img);
      }
      // на случай, если раньше скин ставился фоном
      el.style.backgroundImage = '';
    }

    img.src = uri;
    img.style.objectFit = 'contain';
    img.dataset.bfSkin = '1';
    el.dataset.bfSkin = '1';
  }

  // накапливаем ники и запрашиваем пачкой — по одному запросу на список
  function want(name, el) {
    if (!name) return;
    if (cache[name]) { paint(el, cache[name]); return; }
    (pending[name] = pending[name] || []).push(el);
    clearTimeout(timer);
    timer = setTimeout(flush, 60);
  }

  function flush() {
    var names = Object.keys(pending).filter(function (n) { return !cache[n]; });
    if (!names.length) return;
    catalog().then(function () {
      return fetch('/skins/many?names=' + encodeURIComponent(names.join(',')),
                   { credentials: 'same-origin' })
        .then(function (r) { return r.json(); });
    }).then(function (d) {
      var got = (d && d.skins) || {};
      names.forEach(function (n) {
        if (got[n]) cache[n] = got[n];
        (pending[n] || []).forEach(function (el) {
          if (cache[n]) paint(el, cache[n]);
        });
        delete pending[n];
      });
    }).catch(function () { pending = {}; });
  }

  function txt(el) { return el ? (el.textContent || '').trim() : ''; }

  // кому принадлежит эта картинка
  function nameFor(el) {
    // 1) явно проставленный ник
    if (el.dataset && el.dataset.bfName) return el.dataset.bfName;

    // 2) строка списка друзей / таблицы: ник рядом
    var row = el.closest && el.closest('.user-item, .maps-row, .lbRow, .bfCard, .sbCard');
    if (row) {
      var n = row.querySelector('.user-name, .map-author-row, .lbName, .sbAuthor a, a[href*="users.html?name="]');
      if (n) {
        var href = n.getAttribute && n.getAttribute('href');
        if (href && href.indexOf('name=') !== -1)
          return decodeURIComponent(href.split('name=')[1].split('&')[0]);
        if (txt(n)) return txt(n);
      }
    }

    // 3) большая аватарка в профиле — ник берём из адреса страницы
    if (el.classList && el.classList.contains('profile-picture')) {
      var m = location.search.match(/[?&]name=([^&]*)/);
      if (m) return decodeURIComponent(m[1]);
    }

    // 4) иконка в шапке — текущий игрок
    if (el.classList && (el.classList.contains('profile-image') ||
                         el.classList.contains('bfAvatar'))) return meName;

    return '';
  }

  function scan(root) {
    root = root || document;
    if (!root.querySelectorAll) return;
    /* Здесь был пропуск: у строк списка друзей картинка не имеет ни
       класса, ни адреса — только data-bf-name, и сканер её не находил,
       поэтому аватарки друзей оставались пустыми. */
    var list = root.querySelectorAll(
      '[data-bf-name], img.profile-image, img.profile-picture, ' +
      '.user-avatar img, img[src*="/avatar/"], .bfAvatar'
    );
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      // перерисовываем, если скин ещё не поставлен
      if (el.dataset.bfSkin && (el.tagName === 'IMG' || el.querySelector('img.bfAva'))) continue;
      var n = nameFor(el);
      if (n) want(n, el);
    }
  }

  function boot() {
    fetch('/whoAmI', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        meName = (d && !d.guest) ? d.name : null;
        scan(document);
      })
      .catch(function () { scan(document); });

    // списки друзей и карт дорисовываются позже
    try {
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++)
          for (var j = 0; j < muts[i].addedNodes.length; j++) {
            var n = muts[i].addedNodes[j];
            if (n.nodeType === 1) scan(n);
          }
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}

    // на всякий случай — редкий добор
    setInterval(function () { scan(document); }, 2500);
  }

  window.BFAvatar = { scan: scan, paint: paint, uri: dataUri };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
