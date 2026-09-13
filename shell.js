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

  var ICONS = {
    leaderboard: svg('<path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z"/>'
      + '<path d="M7 5H4a1 1 0 0 0-1 1c0 2 1 4 4 4M17 5h3a1 1 0 0 1 1 1c0 2-1 4-4 4"/>'),
    mapEditor: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
    mapsBrowser: svg('<path d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2Z"/><path d="M9 3v16M15 5v16"/>'),
    quests: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.2"/>'
      + '<circle cx="12" cy="12" r=".6" fill="currentColor" stroke="none"/>'),
    story: svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z"/>'
      + '<path d="M4 20.5V5.5"/><path d="M20 18H6.5A2.5 2.5 0 0 0 4 20.5"/>'),
    themes: svg('<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.4-.3-.4-.5-.8-.5-1.3 '
      + '0-1.1.9-2 2-2h2.3c1.5 0 2.7-1.2 2.7-2.7C20 6.6 16.4 3 12 3Z"/>'
      + '<circle cx="7.6" cy="10.6" r="1.1" fill="currentColor" stroke="none"/>'
      + '<circle cx="11" cy="7.2" r="1.1" fill="currentColor" stroke="none"/>'
      + '<circle cx="15.4" cy="8.6" r="1.1" fill="currentColor" stroke="none"/>'),
    logs: svg('<path d="M7 3h7l5 5v13H7Z"/><path d="M14 3v5h5"/><path d="M9.5 13h6M9.5 16.5h6"/>'),
    gift: svg('<rect x="4" y="9" width="16" height="11" rx="1.2"/><path d="M4 13h16M12 9v11"/>'
      + '<path d="M12 9C9.5 9 8 7.8 8 6.2 8 4.9 9 4 10.2 4 11.6 4 12 6 12 9Z'
      + 'M12 9c2.5 0 4-1.2 4-2.8C16 4.9 15 4 13.8 4 12.4 4 12 6 12 9Z"/>'),
    telegram: svg('<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/>'),
    discord: svg('<rect x="2" y="8" width="20" height="10" rx="5"/><path d="M7 11.2v3.6M5.2 13h3.6"/>'
      + '<circle cx="16" cy="11.6" r="1" fill="currentColor" stroke="none"/>'
      + '<circle cx="18.4" cy="14" r="1" fill="currentColor" stroke="none"/>'),
    messages: svg('<path d="M21 12c0 4.4-4 8-9 8-1.1 0-2.2-.2-3.2-.5L4 21l1.4-3.8C4.5 15.9 4 14 4 12'
      + 'c0-4.4 4-8 9-8s8 3.6 8 8Z"/>'),
    chevron: svg('<path d="m9 6 6 6-6 6"/>', ' width="14" height="14"'),
    menuLines: svg('<path d="M4 7h16M4 12h16M4 17h16"/>')
  };

  var NAV = [
    { key: 'leaderboard', href: 'leaderboard.html', txt: 'Leaderboard',  icon: ICONS.leaderboard },
    { key: 'mapEditor',   href: 'editor.html',      txt: 'Map Editor',   icon: ICONS.mapEditor },
    { key: 'mapsBrowser', href: 'mapsBrowser.html', txt: 'Maps Browser', icon: ICONS.mapsBrowser },
    { key: 'quests',      href: 'quests.html',      txt: 'Quests',       icon: ICONS.quests },
    { key: 'story',       href: 'story.html',       txt: 'Story Mode',   icon: ICONS.story },
    { key: 'themes',      href: 'themes.html',      txt: 'Themes',       icon: ICONS.themes },
    { key: 'logs',        href: 'logs.html',        txt: 'Logs',         icon: ICONS.logs }
  ];

  var SOCIAL = [
    { txt: 'Telegram', href: 'https://t.me/aibrofist',           icon: ICONS.telegram },
    { txt: 'Discord',  href: 'https://discord.gg/Rah4FvcXDw',    icon: ICONS.discord }
  ];

  var MARK = '<span class="bfBrandMark"><i></i><i></i></span>';
  var me = null;
  var dailyLeftMs = null;

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
    a.innerHTML = l.icon;
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

    // гамбургер — виден только на мобильном, раскрывает сайдбар поверх страницы
    var menuBtn = el('button', 'bfMenuBtn', ICONS.menuLines);
    menuBtn.type = 'button';
    menuBtn.setAttribute('aria-label', 'Menu');
    head.appendChild(menuBtn);

    var brand = el('a', 'bfBrand', MARK + '<b>AIBROFIST</b>');
    brand.href = '/';
    head.appendChild(brand);

    var nav = el('nav', 'bfNav');
    NAV.forEach(function (l) { nav.appendChild(navItem(l, here)); });
    head.appendChild(nav);

    // карточка ежедневной награды — само колесо теперь на главной (см.
    // dailyReward.js), тут только напоминание с обратным отсчётом и
    // ссылка туда; видна только вошедшим (см. loadDailyStatus)
    var daily = el('a', 'bfDailyCard');
    daily.id = 'bfDailyCard';
    daily.href = '/';
    daily.style.display = 'none';
    daily.innerHTML =
        '<span class="bfDailyIcon">' + ICONS.gift + '</span>'
      + '<span class="bfDailyText"><b data-i18n="dailyReward">Daily Reward</b>'
      +   '<small id="bfDailyLeft"></small></span>'
      + '<span class="bfChev">' + ICONS.chevron + '</span>';
    head.appendChild(daily);

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

    // ---------- мобильная выдвижная панель ----------
    var overlay = el('div', 'bfSideOverlay');
    overlay.id = 'bfSideOverlay';
    document.body.appendChild(overlay);
    function closeDrawer() { head.classList.remove('open'); overlay.classList.remove('open'); }
    menuBtn.onclick = function (e) {
      e.stopPropagation();
      head.classList.toggle('open');
      overlay.classList.toggle('open');
    };
    overlay.onclick = closeDrawer;
    // клик по любой ссылке в панели — закрыть выезжающий сайдбар (на
    // десктопе классы .open ни на что не влияют, лишний toggle безвреден)
    head.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) closeDrawer();
    });

    // плавающая кнопка «Messages» — отдельно от сайдбара, видна везде
    var msgFab = el('a', 'bfMsgFab', ICONS.messages + '<span data-i18n="messages">Messages</span>');
    msgFab.href = 'messages.html';
    document.body.appendChild(msgFab);

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

  // ---------- карточка ежедневной награды: обратный отсчёт ----------
  function fmtLeft(ms) {
    var h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? (h + 'h ' + m + 'm') : (m + 'm');
  }
  function paintDaily() {
    var card = document.getElementById('bfDailyCard');
    var lbl = document.getElementById('bfDailyLeft');
    if (!card || !lbl || dailyLeftMs === null) return;
    card.style.display = 'flex';
    lbl.textContent = dailyLeftMs <= 0
      ? T('dailyRewardReady', 'Available now')
      : T('dailyRewardWait', 'Come back in') + ' ' + fmtLeft(dailyLeftMs);
  }
  function loadDailyStatus() {
    fetch('/dailyReward/status', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        dailyLeftMs = d.guest ? null : Math.max(0, d.msLeft || 0);
        paintDaily();
      })
      .catch(function () {});
  }
  // между сверками с сервером просто досчитываем локально — точная
  // сверка на каждой новой странице и так подгружает свежее значение
  setInterval(function () {
    if (dailyLeftMs === null) return;
    dailyLeftMs = Math.max(0, dailyLeftMs - 60000);
    paintDaily();
  }, 60000);

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
          loadDailyStatus();
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
    snd.src = 'sound.js?v=103';
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
