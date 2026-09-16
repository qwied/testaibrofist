/* AIBROFIST — единая боковая панель для всех страниц.
   Раньше шапок было две: собственная на моих страницах и вендорная на
   остальных. Они выглядели по-разному, а на части страниц ещё и
   дорисовывались скриптами — оттого меню то появлялось, то исчезало.
   Теперь панель одна и строится здесь, а вендорная прячется.

   С этой правки панель — не верхняя строка, а левый сайдбар (по образцу
   присланного пользователем макета): пункты меню видны сразу, без
   выпадающего «More». На мобильном сайдбар прячется за гамбургер и
   выезжает поверх страницы. */
(function () {
  'use strict';

  function svg(paths, extra) {
    return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" '
      + 'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"' + (extra || '') + '>'
      + paths + '</svg>';
  }

  // иконки — только у Telegram/Discord (внешние ссылки на соцсети,
  // не эмодзи); у пунктов меню и карточки награды иконок больше нет,
  // просто подписи
  var ICONS = {
    telegram: svg('<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/>'),
    // официальный знак Discord (заливка, не обводка) — узнаваемый «блоб»
    // с лапками и глазами, а не абстрактная фигура, как раньше
    // мелкая деталировка (глаза/лапки) смазывается при 18px — иконке нужно
    // чуть больше места, чем простым линиям Telegram/остальных
    discord: '<svg viewBox="0 0 24 24" width="21" height="21" fill="currentColor">'
      + '<path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>',
    chevron: svg('<path d="m9 6 6 6-6 6"/>', ' width="14" height="14"')
  };

  var NAV = [
    { key: 'leaderboard', href: 'leaderboard.html', txt: 'Leaderboard' },
    { key: 'mapEditor',   href: 'editor.html',      txt: 'Map Editor' },
    { key: 'mapsBrowser', href: 'mapsBrowser.html', txt: 'Maps Browser' },
    { key: 'quests',      href: 'quests.html',      txt: 'Quests' },
    { key: 'daily',       href: 'daily.html',       txt: 'Daily Reward' },
    { key: 'story',       href: 'story.html',       txt: 'Story Mode' },
    { key: 'themes',      href: 'themes.html',      txt: 'Themes' },
    { key: 'logs',        href: 'logs.html',        txt: 'Logs' },
    { key: 'messages',    href: 'messages.html',    txt: 'Messages' }
  ];

  var SOCIAL = [
    { txt: 'Telegram', href: 'https://t.me/aibrofist',           icon: ICONS.telegram },
    { txt: 'Discord',  href: 'https://discord.gg/mTnybcXZsM',    icon: ICONS.discord }
  ];

  var MARK = '<span class="bfBrandMark"><i></i><i></i></span>';
  var me = null;

  // пустая фигура — пока не подгрузился настоящий скин
  function defaultFace() {
    if (!window.BFSkin) return 'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>');
    var svgFace = window.BFSkin.svg({ head: 'h_none', body: 'b_none' },
                         {}, { height: 300 });
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgFace);
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function navItem(l, here) {
    var a = el('a', 'bfNavItem');
    a.href = l.href;
    if (l.ext) { a.target = '_blank'; a.rel = 'noopener'; }
    if (l.href.toLowerCase() === here) a.classList.add('on');
    var label = document.createElement('span');
    label.textContent = l.txt;
    if (l.key) label.setAttribute('data-i18n', l.key);
    if (l.icon) a.innerHTML = l.icon;
    a.appendChild(label);
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
    NAV.forEach(function (l) { nav.appendChild(navItem(l, here)); });
    head.appendChild(nav);

    /* Карточки Daily Reward в меню больше нет: само колесо и так стоит на
       главной (dailyReward.js), а напоминание с отсчётом только занимало
       место посреди списка разделов. Сама награда никуда не делась. */

    var social = el('div', 'bfSocial');
    SOCIAL.forEach(function (l) {
      social.appendChild(navItem({ href: l.href, txt: l.txt, icon: l.icon, ext: true }, here));
    });
    head.appendChild(social);

    var bottom = el('div', 'bfBottom');
    bottom.innerHTML =
      '<div class="bfCoin" id="bfHeadCoins" style="display:none">'
        + (window.BFCoin ? BFCoin.svg(16) : '') + ' <span>0</span>' + ICONS.chevron
      + '</div>';
    var ava = el('div', 'bfProfileRow');
    ava.id = 'bfHeadAvatar';
    // .bfAvatar остаётся отдельным вложенным кружком — этот класс уже
    // означает «маленький круглый аватар» по всему сайту (mobile.css),
    // а bfProfileRow — только раскладка всей строки (аватар+ник+стрелка)
    var avaBox = el('div', 'bfAvatar');
    var avaImg = document.createElement('img');
    avaImg.className = 'bfAva';
    avaImg.alt = '';
    avaImg.src = defaultFace();
    avaBox.appendChild(avaImg);
    ava.appendChild(avaBox);
    var nameSpan = document.createElement('span');
    nameSpan.className = 'bfProfileName';
    nameSpan.id = 'bfProfileName';
    nameSpan.textContent = T('signin', 'Sign in');
    ava.appendChild(nameSpan);
    ava.insertAdjacentHTML('beforeend', '<span class="bfChev">' + ICONS.chevron + '</span>');
    bottom.appendChild(ava);
    head.appendChild(bottom);

    document.body.insertBefore(head, document.body.firstChild);
    document.body.classList.add('bfHasSidebar');

    /* Выдвижной панели с гамбургером больше нет. На телефоне сайдбар
       стоит на месте узкой колонкой и виден сразу — как на компьютере,
       только уже (см. --sbw-m в ui.css). Прятать его за кнопкой значило
       прятать от игрока половину игры. */

    /* Плавающей кнопки «Messages» больше нет: она висела в правом нижнем
       углу поверх страницы и на телефоне закрывала то, что под ней, —
       кнопку Story Mode на странице Race, PLAY и оценки в Maps Browser,
       стрелку листания в таблице лидеров. Раздел переехал в боковое
       меню, которое теперь и так всегда на экране. */

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
    prof.addEventListener('click', function (e) { e.stopPropagation(); });

    return head;
  }

  function closeAll(except) {
    var open = document.querySelectorAll('.bfDrop.open');
    for (var i = 0; i < open.length; i++) {
      if (open[i] !== except) open[i].classList.remove('open');
    }
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
    // el() кладёт третий аргумент в innerHTML — для чужого текста (имени
    // аккаунта) это неверно, ставим textContent явно
    var name = el('div', 'bfDropName');
    name.textContent = me.name;
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
        var nameEl = document.getElementById('bfProfileName');
        if (nameEl) nameEl.textContent = me.guest ? T('signin', 'Sign in') : me.name;
        if (!me.guest) {
          var c = document.getElementById('bfHeadCoins');
          if (c) {
            c.style.display = 'flex';
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
      if (c) { c.style.display = 'flex'; c.querySelector('span').textContent = n; }
    }
  };

  /* Тихие звуки нажатий и т.п. нужны на любой странице, а не только в
     игре — sound.js сам решает, играть звук или нет (настройка в
     localStorage), здесь только подгружаем его, если ещё не подключён
     явно (как на game.html/editor.html). */
  if (!document.querySelector('script[src*="sound.js"]')) {
    var snd = document.createElement('script');
    snd.src = 'sound.js?v=123';
    document.head.appendChild(snd);
  }
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
    if (h) return h + 'h ' + two(m) + 'm ' + two(sec) + 's';
    if (m) return m + 'm ' + two(sec) + 's';
    return sec + 's';
  }

  function paint() {
    // время вышло — плашка убирается сама, отдельной команды не нужно
    if (left <= 0) {
      if (box) { box.remove(); box = null; }
      return;
    }
    chip().textContent = 'Update in: ' + human(left);
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
