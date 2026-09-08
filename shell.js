/* AIBROFIST — единая верхняя панель для всех страниц.
   Раньше шапок было две: собственная на моих страницах и вендорная на
   остальных. Они выглядели по-разному, а на части страниц ещё и
   дорисовывались скриптами — оттого меню то появлялось, то исчезало.
   Теперь панель одна и строится здесь, а вендорная прячется. */
(function () {
  'use strict';

  var LINKS = [
    { key: 'leaderboard',  href: 'leaderboard.html',  txt: 'Leaderboard' },
    { key: 'mapEditor',    href: 'editor.html',       txt: 'Map Editor' },
    { key: 'avatar',       href: 'avatar.html',       txt: 'Avatar' },
    { key: 'mapsBrowser',  href: 'mapsBrowser.html',  txt: 'Maps Browser' },
    { key: 'logs',         href: 'logs.html',         txt: 'Logs' }
  ];

  // то, что не помещается в строку, уходит в «Меню»
  var MENU = [
    { key: 'hideAndSeek', href: 'hide-and-seek.html',  txt: 'Hide and Seek' },
    { key: 'race',        href: 'race.html',           txt: 'Race' },
    { sep: true },
    { key: 'avatar',      href: 'avatar.html',         txt: 'Avatar' },
    { key: 'themes',      href: 'themes.html',         txt: 'Темы' },
    { key: 'logs',        href: 'logs.html',           txt: 'Logs' },
    { txt: 'Telegram', href: 'https://t.me/aibrofist', ext: true }
  ];

  var MARK = '<span class="bfBrandMark"><i></i><i></i></span>';
  var me = null;

  // пустая фигура — пока не подгрузился настоящий скин
  function defaultFace() {
    if (!window.BFSkin) return 'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>');
    var svg = window.BFSkin.svg({ head: 'h_none', face: 'f_none', body: 'b_none', back: 'k_none' },
                         {}, { height: 300 });
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function link(l, cls) {
    var a = el('a', cls || '');
    a.href = l.href;
    a.textContent = l.txt;
    if (l.key) a.setAttribute('data-i18n', l.key);
    if (l.ext) { a.target = '_blank'; a.rel = 'noopener'; }
    return a;
  }

  function build() {
    // прячем вендорную шапку, чтобы не было двух панелей сразу
    var old = document.querySelector('.header');
    if (old) old.style.display = 'none';

    var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

    var head = el('div', 'bfHead');
    head.id = 'bfHead';

    var brand = el('a', 'bfBrand', MARK + '<b>AIBROFIST</b>');
    brand.href = '/';
    head.appendChild(brand);

    var nav = el('nav', 'bfNav');
    LINKS.forEach(function (l) {
      var a = link(l);
      if (l.href.toLowerCase() === here) a.className = 'on';
      nav.appendChild(a);
    });

    var menuBtn = el('button', 'bfMenuBtn');
    menuBtn.type = 'button';
    menuBtn.textContent = 'Menu';
    menuBtn.setAttribute('data-i18n', 'menu');
    nav.appendChild(menuBtn);
    head.appendChild(nav);

    var right = el('div', 'bfRight');
    right.innerHTML =
      '<span class="bfCoin" id="bfHeadCoins" style="display:none">' +
        (window.BFCoin ? BFCoin.svg(17) : '') + ' <span>0</span></span>';
    var ava = el('div', 'bfAvatar');
    ava.id = 'bfHeadAvatar';
    var avaImg = document.createElement('img');
    avaImg.className = 'bfAva';
    avaImg.alt = '';
    avaImg.src = defaultFace();
    ava.appendChild(avaImg);
    right.appendChild(ava);
    head.appendChild(right);

    document.body.insertBefore(head, document.body.firstChild);

    // ---------- выпадающее «Меню» ----------
    var drop = el('div', 'bfDrop');
    drop.id = 'bfDrop';
    MENU.forEach(function (l) {
      if (l.sep) { drop.appendChild(el('div', 'bfDropSep')); return; }
      drop.appendChild(link(l, 'bfDropItem'));
    });

    // Язык переключается здесь, а не только в настройках аккаунта:
    // выбор применяется сразу ко всему интерфейсу, включая гостей.
    drop.appendChild(el('div', 'bfDropSep'));
    drop.appendChild(el('div', 'bfDropName', T('language', 'Язык')));
    var langBox = el('div', 'bfLangs');
    if (window.I18N) {
      var auto = el('div', 'bfLangItem', T('langAuto', 'Автоматически'));
      auto.onclick = function () { I18N.set('auto'); closeAll(null); };
      langBox.appendChild(auto);
      I18N.langs.forEach(function (code) {
        var it = el('div', 'bfLangItem', I18N.names[code]);
        it.dataset.lang = code;
        if (code === I18N.current) it.classList.add('on');
        it.onclick = function () {
          I18N.set(code);
          Array.prototype.forEach.call(langBox.children, function (x) { x.classList.remove('on'); });
          it.classList.add('on');
          closeAll(null);
        };
        langBox.appendChild(it);
      });
    }
    drop.appendChild(langBox);
    document.body.appendChild(drop);

    menuBtn.onclick = function (e) {
      e.stopPropagation();
      closeAll(drop);
      drop.classList.toggle('open');
    };

    // ---------- меню профиля ----------
    var prof = el('div', 'bfDrop bfProf');
    prof.id = 'bfProf';
    document.body.appendChild(prof);

    ava.onclick = function (e) {
      e.stopPropagation();
      closeAll(prof);
      fillProfile(prof);
      prof.classList.toggle('open');
    };

    document.addEventListener('click', function () { closeAll(null); });
    drop.addEventListener('click', function (e) { e.stopPropagation(); });
    prof.addEventListener('click', function (e) { e.stopPropagation(); });

    return head;
  }

  function closeAll(except) {
    ['bfDrop', 'bfProf'].forEach(function (id) {
      var d = document.getElementById(id);
      if (d && d !== except) d.classList.remove('open');
    });
  }

  function T(k, f) {
    return (window.I18N && I18N.t(k) !== k) ? I18N.t(k) : f;
  }

  function fillProfile(box) {
    box.innerHTML = '';
    if (!me || me.guest) {
      var inBtn = el('div', 'bfDropItem', T('signin', 'Войти'));
      inBtn.onclick = function () {
        closeAll(null);
        if (window.bfOpenAuth) window.bfOpenAuth();
        else if (window.BFAuth && BFAuth.open) BFAuth.open();
        else location.href = '/';
      };
      box.appendChild(inBtn);
      return;
    }
    var name = el('div', 'bfDropName', me.name);
    box.appendChild(name);

    var p = el('div', 'bfDropItem', T('viewProfile', 'Мой профиль'));
    p.onclick = function () { location.href = 'users.html?name=' + encodeURIComponent(me.name); };
    box.appendChild(p);

    var st = el('div', 'bfDropItem', T('settings', 'Настройки'));
    st.onclick = function () {
      closeAll(null);
      if (window.bfOpenSettings) window.bfOpenSettings();
      else if (window.BFAuth && BFAuth.settings) BFAuth.settings();
    };
    box.appendChild(st);

    var out = el('div', 'bfDropItem bfDropOut', T('logout', 'Выйти'));
    out.onclick = function () {
      fetch('/logOut', { method: 'POST', credentials: 'same-origin' })
        .then(function () { location.reload(); })
        .catch(function () { location.reload(); });
    };
    box.appendChild(out);
  }

  function loadMe() {
    fetch('/whoAmI', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        me = d || { guest: true };
        window.BF_ME = me;
        if (!me.guest) {
          var c = document.getElementById('bfHeadCoins');
          if (c) {
            c.style.display = 'inline-flex';
            c.querySelector('span').textContent = me.coins;
          }
        }
        window.dispatchEvent(new CustomEvent('bf-shell-ready', { detail: me }));
      })
      .catch(function () { me = { guest: true }; });
  }

  function boot() {
    if (document.getElementById('bfHead')) return;
    build();
    loadMe();
    if (window.I18N) I18N.apply(document.body);

    // при смене языка перевод должен лечь на всю страницу целиком,
    // включая то, что дорисовали чужие скрипты
    window.addEventListener('bf-lang', function () {
      if (window.I18N) I18N.apply(document.body);
      var p = document.getElementById('bfProf');
      if (p && p.classList.contains('open')) fillProfile(p);
    });
    // вендорный код может дорисовать свою шапку позже — прячем и её
    try {
      new MutationObserver(function () {
        var v = document.querySelector('.header');
        if (v && v.style.display !== 'none') v.style.display = 'none';
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  }

  window.BFShell = {
    refreshCoins: function (n) {
      var c = document.getElementById('bfHeadCoins');
      if (c) { c.style.display = 'inline-flex'; c.querySelector('span').textContent = n; }
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

/* ======= ОБРАТНЫЙ ОТСЧЁТ ДО ОБНОВЛЕНИЯ =======
   Ставит его владелец из своей панели, а видят все: игроку полезно знать,
   что сайт скоро уйдёт на обновление. Пока таймер не поставлен, в углу
   ничего нет. */
(function () {
  'use strict';
  var box = null, left = 0, timer = 0;

  function chip() {
    if (box) return box;
    box = document.createElement('div');
    box.id = 'bfUpd';
    box.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:60;padding:7px 11px;'
      + 'border-radius:10px;background:rgba(15,23,42,.86);color:#fff;'
      + 'font:600 12px system-ui,sans-serif;letter-spacing:.2px;pointer-events:none;'
      + 'box-shadow:0 4px 14px rgba(0,0,0,.18)';
    document.body.appendChild(box);
    return box;
  }

  /* Отсчёт идёт по секундам, поэтому и показываем секунды: без них
     последняя минута выглядела бы застывшей. */
  function human(ms) {
    var t = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(t / 3600);
    var m = Math.floor((t % 3600) / 60);
    var sec = t % 60;
    var two = function (n) { return n < 10 ? '0' + n : String(n); };
    if (h) return h + ' ч ' + two(m) + ' мин ' + two(sec) + ' сек';
    if (m) return m + ' мин ' + two(sec) + ' сек';
    return sec + ' сек';
  }

  function paint() {
    // время вышло — плашка убирается сама, отдельной команды не нужно
    if (left <= 0) {
      if (box) { box.remove(); box = null; }
      return;
    }
    chip().textContent = 'До обновления: ' + human(left);
  }

  function refresh() {
    fetch('/update/get', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) { left = d.left || 0; paint(); })
      .catch(function () {});
  }

  function start() {
    refresh();
    setInterval(refresh, 60000);            // сверяемся с сервером раз в минуту
    clearInterval(timer);
    timer = setInterval(function () {       // между сверками тикаем сами
      if (left > 0) { left -= 1000; paint(); }
    }, 1000);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', start);
  else start();

  window.BFUpdate = { refresh: refresh };
})();
