/* Аккаунты AIBrofist — вход, регистрация, меню профиля */
(function () {
  'use strict';

  // корень сайта относительно текущей страницы
  var BASE = '';

  var css = ''
    + '.bf-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;display:none}'
    + '.bf-box{position:fixed;inset:0;margin:auto;width:320px;height:max-content;max-height:90vh;background:var(--panel);'
    + 'border:3px solid var(--line);border-radius:8px;padding:26px 30px 22px;color:var(--ink);z-index:9999;display:none;'
    + 'font-family:sans-serif;box-sizing:border-box}'
    + '.bf-x{position:absolute;right:5px;top:4px;border:1px solid;border-radius:31px;font-size:14px;'
    + 'padding:4px 8px;color:red;background:var(--panel);cursor:pointer;line-height:1}'
    + '.bf-t{text-align:center;font-size:16px;color:var(--muted);margin-bottom:6px}'
    + '.bf-b{border:1px solid #2196F3;border-radius:3px;text-align:center;font-size:17px;padding:11px 0;'
    + 'margin:11px 0;box-shadow:0 6px 1px -5px rgba(15,23,42,.18);display:block;color:var(--ink);background:var(--panel);cursor:pointer}'
    + '.bf-b:hover{background:#2196F3;color:#fff}'
    + '.bf-i{border:1px solid var(--line);border-radius:3px;text-align:center;font-size:17px;padding:11px 0;'
    + 'margin:10px 0;display:block;color:var(--ink);background:var(--panel);width:100%;box-sizing:border-box}'
    + '.bf-e{text-align:center;font-size:12px;color:red;min-height:15px;margin-bottom:4px}'
    + '.bf-h{text-align:center;font-size:11px;color:var(--muted);margin-top:-4px}'
    + '.bf-back{position:absolute;left:5px;top:4px;border:1px solid;border-radius:28px;font-size:14px;'
    + 'padding:4px 9px;color:var(--ink);background:var(--panel);cursor:pointer;line-height:1}'
    /* Тема и язык переехали сюда со страницы Themes: две настройки вида
       в одном окне, а не в отдельных пунктах бокового меню. */
    + '.bf-sec{font-size:11px;letter-spacing:.4px;text-transform:uppercase;color:var(--muted);'
    + 'margin:16px 0 7px;padding-top:13px;border-top:1px solid var(--line)}'
    + '.bf-row{display:flex;gap:8px}'
    + '.bf-opt{flex:1;border:1px solid var(--line);border-radius:6px;text-align:center;font-size:14px;'
    + 'padding:9px 0;color:var(--ink);background:var(--panel);cursor:pointer;box-sizing:border-box}'
    + '.bf-opt:hover{border-color:#2196F3}'
    + '.bf-opt.on{border-color:#2196F3;background:#2196F3;color:#fff;font-weight:700}'
    + '.bf-opt[disabled]{opacity:.5;cursor:default}'
    + '.bf-lock{border:1px dashed var(--line);border-radius:6px;padding:10px 12px;text-align:center;'
    + 'font-size:12px;color:var(--muted);line-height:1.45}'
    + '.bf-lock b{display:block;color:var(--ink);font-size:13px;margin-bottom:3px}'
    + '.bf-lock .bf-b{margin:9px 0 0;font-size:14px;padding:8px 0}';

  var s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);

  var ov = document.createElement('div'); ov.className = 'bf-ov';
  var box = document.createElement('div'); box.className = 'bf-box';
  document.body.appendChild(ov); document.body.appendChild(box);

  function close() { ov.style.display = 'none'; box.style.display = 'none'; }
  ov.onclick = close;

  function open(html) {
    box.innerHTML = html;
    ov.style.display = 'block';
    box.style.display = 'block';
    var x = box.querySelector('.bf-x');
    if (x) x.onclick = close;
  }

  // ---------- экран выбора ----------
  function screenChoice() {
    open('<div class="bf-x">X</div>'
       + '<div class="bf-t">Sign in or sign up</div>'
       + '<div class="bf-b" id="bfLogin">Sign in to account</div>'
       + '<div class="bf-b" id="bfReg">Create account</div>');
    box.querySelector('#bfLogin').onclick = screenLogin;
    box.querySelector('#bfReg').onclick = screenRegister;
  }

  function screenLogin() {
    open('<div class="bf-x">X</div><div class="bf-back">&lt;</div>'
       + '<div class="bf-t">Sign in</div>'
       + '<input class="bf-i" id="bfName" type="text" maxlength="20" placeholder="Username">'
       + '<input class="bf-i" id="bfPass" type="password" placeholder="Password">'
       + '<div class="bf-e" id="bfErr"></div>'
       + '<div class="bf-b" id="bfGo">Sign in</div>');
    box.querySelector('.bf-back').onclick = screenChoice;
    var go = box.querySelector('#bfGo');
    go.onclick = function () {
      var n = box.querySelector('#bfName').value.trim();
      var p = box.querySelector('#bfPass').value;
      var err = box.querySelector('#bfErr');
      if (!n) { err.textContent = 'Enter your username'; return; }
      if (!p) { err.textContent = 'Enter your password'; return; }
      go.textContent = 'Checking...';
      post('/login/password', { username: n, password: p }, function (r) {
        if (r && r.status === 'success') location.reload();
        else { err.textContent = (r && r.message) || 'Sign in failed'; go.textContent = 'Sign in'; }
      });
    };
    enterKey(screenLoginSubmit);
    function screenLoginSubmit() { go.click(); }
  }

  function screenRegister() {
    open('<div class="bf-x">X</div><div class="bf-back">&lt;</div>'
       + '<div class="bf-t">Sign up</div>'
       + '<input class="bf-i" id="bfName" type="text" maxlength="20" placeholder="Username">'
       + '<div class="bf-h">up to 20 characters, Latin or Cyrillic letters</div>'
       + '<input class="bf-i" id="bfPass" type="password" placeholder="Password">'
       + '<div class="bf-h">password — at least 4 characters</div>'
       + '<div class="bf-e" id="bfErr"></div>'
       + '<div class="bf-b" id="bfGo">Create account</div>');
    box.querySelector('.bf-back').onclick = screenChoice;
    var go = box.querySelector('#bfGo');
    go.onclick = function () {
      var n = box.querySelector('#bfName').value.trim();
      var p = box.querySelector('#bfPass').value;
      var err = box.querySelector('#bfErr');
      if (!n) { err.textContent = 'Enter a username'; return; }
      if (n.length > 20) { err.textContent = 'Username must be 20 characters or fewer'; return; }
      if (!p) { err.textContent = 'Enter a password'; return; }
      go.textContent = 'Creating...';
      post('/signUp', { name: n, password: p }, function (r) {
        if (r && r.status === 'success') location.reload();
        else { err.textContent = (r && r.message) || 'Sign up failed'; go.textContent = 'Create account'; }
      });
    };
    enterKey(function () { go.click(); });
  }

  function enterKey(fn) {
    Array.prototype.forEach.call(box.querySelectorAll('input'), function (i) {
      i.onkeydown = function (e) { if (e.key === 'Enter') fn(); };
    });
  }

  // ---------- сеть ----------
  function post(url, data, cb) {
    var body = Object.keys(data)
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(data[k]); })
      .join('&');
    fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    }).then(function (r) { return r.json(); })
      .then(cb)
      .catch(function () { cb({ status: 'error', message: 'Server unavailable' }); });
  }
  function get(url, cb) {
    fetch(url, { credentials: 'same-origin' })
      .then(function (r) { return r.json(); }).then(cb).catch(function () { cb(null); });
  }

  /* ---------- вид: тема и язык ----------
     Раньше это была отдельная страница themes.html в боковом меню.
     Настроек всего две, обе про внешний вид, и обе нужны редко — им
     место в окне Settings рядом с остальным про аккаунт, а не
     отдельным пунктом меню. */
  function drawTheme() {
    var host = box.querySelector('#bfThemeBox');
    if (!host || !window.BFTheme) return;
    var T = function (k, f) {
      return (window.I18N && I18N.t(k) !== k) ? I18N.t(k) : (f || k);
    };

    function paint(st) {
      if (!st.unlocked) {
        /* Замок как был на странице: светлая и тёмная открываются один
           раз за монеты, дальше переключай сколько угодно. */
        host.innerHTML =
            '<div class="bf-lock"><b>' + T('themesLocked', 'Темы пока закрыты') + '</b>'
          + T('themesWhat', 'Открывает светлое и тёмное оформление всего сайта. '
              + 'Покупка разовая — дальше переключайте темы сколько угодно.')
          + '<div class="bf-b" id="bfThemeBuy">' + T('unlockThemes', 'Открыть темы')
          + ' &middot; ' + st.price + '</div>'
          + '<div class="bf-e" id="bfThemeErr"></div></div>';
        var buy = host.querySelector('#bfThemeBuy');
        buy.onclick = function () {
          buy.onclick = null;
          BFTheme.unlock().then(function (r) {
            if (r && r.status === 'success') {
              if (window.BFShell && BFShell.refreshCoins) BFShell.refreshCoins(r.coins);
              paint(BFTheme.state);
              return;
            }
            host.querySelector('#bfThemeErr').textContent =
              (r && r.message) || T('errorTxt', 'Ошибка');
            paint(st);
          }).catch(function () { paint(st); });
        };
        return;
      }
      host.innerHTML = '<div class="bf-row">'
        + '<div class="bf-opt" data-mode="light">' + T('lightTheme', 'Светлая') + '</div>'
        + '<div class="bf-opt" data-mode="dark">' + T('darkTheme', 'Тёмная') + '</div></div>'
        + '<div class="bf-e" id="bfThemeErr"></div>';
      var opts = host.querySelectorAll('.bf-opt');
      function mark(m) {
        for (var i = 0; i < opts.length; i++)
          opts[i].classList.toggle('on', opts[i].getAttribute('data-mode') === m);
      }
      mark(st.mode || 'light');
      for (var i = 0; i < opts.length; i++) {
        opts[i].onclick = function () {
          var m = this.getAttribute('data-mode');
          mark(m);
          BFTheme.setMode(m).then(function (r) {
            if (r && r.status === 'error') {
              host.querySelector('#bfThemeErr').textContent = r.message || T('errorTxt', 'Ошибка');
              mark(BFTheme.state.mode);
            }
          });
        };
      }
    }

    // state уже заполнен: theme.js грузит его при старте страницы
    paint(BFTheme.state);
    BFTheme.load().then(paint).catch(function () {});
  }

  function drawLang(name) {
    var row = box.querySelector('#bfLangRow');
    if (!row || !window.I18N || !I18N.langs) return;
    var html = '';
    for (var i = 0; i < I18N.langs.length; i++) {
      var L = I18N.langs[i];
      html += '<div class="bf-opt' + (L === I18N.current ? ' on' : '') + '" data-lang="' + L + '">'
            + (I18N.names[L] || L) + '</div>';
    }
    row.innerHTML = html;
    var opts = row.querySelectorAll('.bf-opt');
    for (var j = 0; j < opts.length; j++) {
      opts[j].onclick = function () {
        var L = this.getAttribute('data-lang');
        if (L === I18N.current) return;
        I18N.set(L);
        /* Перерисовываем само окно: его текст собран в строках через
           T(), а не размечен data-i18n, поэтому applyTo() до него не
           дотягивается. */
        settings(name);
      };
    }
  }

  // ---------- настройки аккаунта ----------
  function settings(name) {
    var T = function (k, f) {
      return (window.I18N && I18N.t(k) !== k) ? I18N.t(k) : (f || k);
    };

    open('<div class="bf-x">X</div>'
       + '<div class="bf-t">' + T('settings', 'Настройки') + '</div>'
       + '<div style="text-align:center;font-size:13px;color:#6b7280;margin-bottom:4px">' + name + '</div>'
       + '<div class="bf-b" id="bfProfile">' + T('viewProfile', 'Мой профиль') + '</div>'
       + '<div class="bf-b" id="bfPassBtn">' + T('changePass', 'Сменить пароль') + '</div>'
       + '<div id="bfPassBox" style="display:none">'
       +   '<input class="bf-i" id="bfOldPass" type="password" placeholder="' + T('curPass', 'Текущий пароль') + '">'
       +   '<input class="bf-i" id="bfNewPass" type="password" placeholder="' + T('newPass', 'Новый пароль (от 4 символов)') + '">'
       +   '<div class="bf-e" id="bfPassErr"></div>'
       +   '<div class="bf-b" id="bfPassGo">' + T('changePass', 'Сменить пароль') + '</div>'
       + '</div>'
       + '<div class="bf-b" id="bfNickBtn">' + T('changeNickPrice', 'Сменить ник (1000 монет)') + '</div>'
       + '<div id="bfNickBox" style="display:none">'
       +   '<input class="bf-i" id="bfNewNick" type="text" placeholder="' + T('newNick', 'Новый ник') + '">'
       +   '<div class="bf-e" id="bfNickErr"></div>'
       +   '<div class="bf-b" id="bfNickGo">' + T('changeNick', 'Сменить ник') + '</div>'
       + '</div>'
       + '<div class="bf-b ghost2" id="bfLogoutAll" style="border-color:#dc2626;color:#dc2626">'
       +   T('logoutAll', 'Выйти на всех устройствах') + '</div>'
       + '<div class="bf-h" id="bfSecNote">' + T('secNote',
           'Пароль хранится в зашифрованном виде — его не видно даже администратору.') + '</div>'
       + '<div class="bf-b" id="bfGoogle">Link Google account</div>'
       + '<div class="bf-h" id="bfGoogleNote"></div>'
       + '<div id="bfOwner"></div>'
       + '<div class="bf-sec">' + T('themes', 'Темы') + '</div>'
       + '<div id="bfThemeBox"></div>'
       + '<div class="bf-sec">' + T('language', 'Язык') + '</div>'
       + '<div class="bf-row" id="bfLangRow"></div>');
    drawTheme();
    drawLang(name);
    box.querySelector('#bfProfile').onclick = function () {
      location.href = BASE + 'users.html?name=' + encodeURIComponent(name);
    };
    var passBox = box.querySelector('#bfPassBox');
    var passErr = box.querySelector('#bfPassErr');
    box.querySelector('#bfPassBtn').onclick = function () {
      passBox.style.display = passBox.style.display === 'none' ? 'block' : 'none';
      passErr.textContent = '';
    };
    box.querySelector('#bfPassGo').onclick = function () {
      var oldPw = box.querySelector('#bfOldPass').value;
      var newPw = box.querySelector('#bfNewPass').value;
      if (!oldPw || !newPw) { passErr.textContent = T('fillBoth', 'Заполните оба поля'); return; }
      passErr.style.color = 'red';
      passErr.textContent = '…';
      post('/changePassword', { oldPassword: oldPw, newPassword: newPw }, function (r) {
        if (r && r.status === 'success') {
          passErr.style.color = 'green';
          passErr.textContent = r.message || 'Password changed';
          box.querySelector('#bfOldPass').value = '';
          box.querySelector('#bfNewPass').value = '';
        } else passErr.textContent = (r && r.message) || 'Error';
      });
    };
    var nickBox = box.querySelector('#bfNickBox');
    var nickErr = box.querySelector('#bfNickErr');
    box.querySelector('#bfNickBtn').onclick = function () {
      nickBox.style.display = nickBox.style.display === 'none' ? 'block' : 'none';
      nickErr.textContent = '';
    };
    box.querySelector('#bfNickGo').onclick = function () {
      var newNick = box.querySelector('#bfNewNick').value.trim();
      if (!newNick) { nickErr.textContent = T('fillBoth', 'Заполните оба поля'); return; }
      nickErr.style.color = 'red';
      nickErr.textContent = '…';
      post('/changeNickname', { name: newNick }, function (r) {
        if (r && r.status === 'success') {
          nickErr.style.color = 'green';
          nickErr.textContent = r.message || T('nickChanged', 'Ник изменён');
          setTimeout(function () { location.reload(); }, 700);
        } else nickErr.textContent = (r && r.message) || 'Error';
      });
    };
    box.querySelector('#bfLogoutAll').onclick = function () {
      post('/logOutAll', {}, function () { location.reload(); });
    };

    box.querySelector('#bfGoogle').onclick = function () {
      box.querySelector('#bfGoogleNote').innerHTML =
        'Linking is not available yet: it needs a Google app key ' +
        'and an email service to send codes. Sign in is username/password only for now.';
    };
    // панель владельца живёт в owner.js, а этот файл сервер отдаёт
    // только самому владельцу — у остальных её кода нет вообще
    if (typeof window.bfOwnerPanel === 'function') {
      get('/owner/accounts', function (r) {
        if (!r || r.status !== 'success') return;
        window.bfOwnerPanel(box.querySelector('#bfOwner'), r.linked || [], { post: post, get: get });
      });
    }
  }

  // ---------- шапка ----------
  var wired = false;
  function wire() {
    var icon = document.querySelector('.profile-icon');
    var menu = document.querySelector('.profile-menu');
    if (!icon || !menu) return false;

    // если кнопки входа нет в разметке — создаём
    var signIn = document.querySelector('.auth-buttons');
    if (!signIn) {
      signIn = document.createElement('div');
      signIn.className = 'auth-buttons';
      signIn.textContent = 'Sign in';
      signIn.style.cssText = 'float:right;padding:14px 16px;text-align:center;color:#000;cursor:pointer';
      (icon.parentNode || document.body).appendChild(signIn);
    }
    if (wired) return true;
    wired = true;

    // забираем управление у встроенных обработчиков
    var fresh = signIn.cloneNode(true);
    signIn.parentNode.replaceChild(fresh, signIn);
    signIn = fresh;
    signIn.style.cursor = 'pointer';
    signIn.onclick = function (e) { e.stopPropagation(); screenChoice(); };

    var freshIcon = icon.cloneNode(true);
    icon.parentNode.replaceChild(freshIcon, icon);
    icon = freshIcon;
    icon.style.cursor = 'pointer';
    icon.onclick = function (e) {
      e.stopPropagation();
      menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
    };
    document.addEventListener('click', function () { menu.style.display = 'none'; });

    refresh(signIn, icon, menu);
    return true;
  }

  function refresh(signIn, icon, menu) {
    get('/iSigned', function (r) {
      var d = (r && r.data) || { guest: true };
      if (d.guest) {
        signIn.style.display = 'inherit';
        icon.style.display = 'none';
        return;
      }
      signIn.style.display = 'none';
      icon.style.display = 'inherit';
      get('/getAvatar?name=' + encodeURIComponent(d.name), function (a) {
        var img = icon.querySelector('.profile-image');
        if (img) img.src = '/avatar/' + ((a && a.avatar) || '0') + '.png';
      });
      var items = menu.querySelectorAll('.menu-item');
      if (items[0]) {
        items[0].style.cursor = 'pointer';
        items[0].onclick = function () { location.href = BASE + 'users.html?name=' + encodeURIComponent(d.name); };
      }
      if (items[1]) {
        items[1].style.cursor = 'pointer';
        items[1].onclick = function () { settings(d.name); };
      }
      if (items[2]) {
        items[2].style.cursor = 'pointer';
        items[2].onclick = function () { post('/logOut', {}, function () { location.reload(); }); };
      }
      // отмечаемся живым
      post('/setLastSeenDate', {}, function () {});
      setInterval(function () { post('/setLastSeenDate', {}, function () {}); }, 20000);
    });
  }

  // шапка на игровых страницах появляется не сразу — ждём её
  var tries = 0;
  var timer = setInterval(function () {
    if (wire() || ++tries > 60) clearInterval(timer);
  }, 100);
  if (document.readyState !== 'loading') wire();
  else document.addEventListener('DOMContentLoaded', wire);

  // единая шапка (shell.js) открывает эти окна сама
  window.bfOpenAuth = screenChoice;
  window.bfOpenSettings = function () {
    get('/getMyName', function (name) {
      if (name) settings(name); else screenChoice();
    });
  };
})();
