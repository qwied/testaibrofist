/* Аккаунты AIBrofist — вход, регистрация, меню профиля */
(function () {
  'use strict';

  // корень сайта относительно текущей страницы
  var BASE = '';

  var css = ''
    + '.bf-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;display:none}'
    + '.bf-box{position:fixed;inset:0;margin:auto;width:320px;height:max-content;max-height:90vh;background:#fff;'
    + 'border:3px solid #c5c5c5;border-radius:8px;padding:26px 30px 22px;color:#2d2d2d;z-index:9999;display:none;'
    + 'font-family:sans-serif;box-sizing:border-box}'
    + '.bf-x{position:absolute;right:5px;top:4px;border:1px solid;border-radius:31px;font-size:14px;'
    + 'padding:4px 8px;color:red;background:#fff;cursor:pointer;line-height:1}'
    + '.bf-t{text-align:center;font-size:16px;color:#5b5b5b;margin-bottom:6px}'
    + '.bf-b{border:1px solid #2196F3;border-radius:3px;text-align:center;font-size:17px;padding:11px 0;'
    + 'margin:11px 0;box-shadow:0 6px 1px -5px #ccc;display:block;color:#000;background:#fff;cursor:pointer}'
    + '.bf-b:hover{background:#2196F3;color:#fff}'
    + '.bf-i{border:1px solid #2b2b2b;border-radius:3px;text-align:center;font-size:17px;padding:11px 0;'
    + 'margin:10px 0;display:block;color:#000;width:100%;box-sizing:border-box}'
    + '.bf-e{text-align:center;font-size:12px;color:red;min-height:15px;margin-bottom:4px}'
    + '.bf-h{text-align:center;font-size:11px;color:#8a8a8a;margin-top:-4px}'
    + '.bf-back{position:absolute;left:5px;top:4px;border:1px solid;border-radius:28px;font-size:14px;'
    + 'padding:4px 9px;color:#000;background:#fff;cursor:pointer;line-height:1}';

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
       + '<div class="bf-t">Вход или регистрация</div>'
       + '<div class="bf-b" id="bfLogin">Войти в аккаунт</div>'
       + '<div class="bf-b" id="bfReg">Создать аккаунт</div>');
    box.querySelector('#bfLogin').onclick = screenLogin;
    box.querySelector('#bfReg').onclick = screenRegister;
  }

  function screenLogin() {
    open('<div class="bf-x">X</div><div class="bf-back">&lt;</div>'
       + '<div class="bf-t">Вход</div>'
       + '<input class="bf-i" id="bfName" type="text" maxlength="20" placeholder="Логин">'
       + '<input class="bf-i" id="bfPass" type="password" placeholder="Пароль">'
       + '<div class="bf-e" id="bfErr"></div>'
       + '<div class="bf-b" id="bfGo">Войти</div>');
    box.querySelector('.bf-back').onclick = screenChoice;
    var go = box.querySelector('#bfGo');
    go.onclick = function () {
      var n = box.querySelector('#bfName').value.trim();
      var p = box.querySelector('#bfPass').value;
      var err = box.querySelector('#bfErr');
      if (!n) { err.textContent = 'Введите логин'; return; }
      if (!p) { err.textContent = 'Введите пароль'; return; }
      go.textContent = 'Проверяю...';
      post('/login/password', { username: n, password: p }, function (r) {
        if (r && r.status === 'success') location.reload();
        else { err.textContent = (r && r.message) || 'Ошибка входа'; go.textContent = 'Войти'; }
      });
    };
    enterKey(screenLoginSubmit);
    function screenLoginSubmit() { go.click(); }
  }

  function screenRegister() {
    open('<div class="bf-x">X</div><div class="bf-back">&lt;</div>'
       + '<div class="bf-t">Регистрация</div>'
       + '<input class="bf-i" id="bfName" type="text" maxlength="20" placeholder="Логин">'
       + '<div class="bf-h">до 20 символов, русские и английские буквы</div>'
       + '<input class="bf-i" id="bfPass" type="password" placeholder="Пароль">'
       + '<div class="bf-h">пароль — минимум 4 символа</div>'
       + '<div class="bf-e" id="bfErr"></div>'
       + '<div class="bf-b" id="bfGo">Создать аккаунт</div>');
    box.querySelector('.bf-back').onclick = screenChoice;
    var go = box.querySelector('#bfGo');
    go.onclick = function () {
      var n = box.querySelector('#bfName').value.trim();
      var p = box.querySelector('#bfPass').value;
      var err = box.querySelector('#bfErr');
      if (!n) { err.textContent = 'Введите логин'; return; }
      if (n.length > 20) { err.textContent = 'Логин не длиннее 20 символов'; return; }
      if (!p) { err.textContent = 'Введите пароль'; return; }
      go.textContent = 'Создаю...';
      post('/signUp', { name: n, password: p }, function (r) {
        if (r && r.status === 'success') location.reload();
        else { err.textContent = (r && r.message) || 'Ошибка регистрации'; go.textContent = 'Создать аккаунт'; }
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
      .catch(function () { cb({ status: 'error', message: 'Сервер недоступен. Запусти npm start' }); });
  }
  function get(url, cb) {
    fetch(url, { credentials: 'same-origin' })
      .then(function (r) { return r.json(); }).then(cb).catch(function () { cb(null); });
  }

  // ---------- настройки аккаунта ----------
  function settings(name) {
    var T = function (k, f) {
      return (window.I18N && I18N.t(k) !== k) ? I18N.t(k) : (f || k);
    };
    var langOpts = '<option value="auto">' + T('langAuto', 'Автоматически (по стране)') + '</option>';
    if (window.I18N) {
      I18N.langs.forEach(function (l) {
        langOpts += '<option value="' + l + '">' + I18N.names[l] + '</option>';
      });
    }

    open('<div class="bf-x">X</div>'
       + '<div class="bf-t">' + T('settings', 'Настройки') + '</div>'
       + '<div style="text-align:center;font-size:13px;color:#6b7280;margin-bottom:4px">' + name + '</div>'
       + '<div class="bf-b" id="bfProfile">' + T('viewProfile', 'Мой профиль') + '</div>'
       + '<div class="bf-b" id="bfSkin">' + T('avatar', 'Аватар') + '</div>'
       + '<div class="bf-t" style="font-size:14px;margin-top:12px">' + T('language', 'Язык') + '</div>'
       + '<select class="bf-i" id="bfLang" style="text-align-last:center">' + langOpts + '</select>'
       + '<div class="bf-h">' + T('langHint', 'Интерфейс переводится сам по стране игрока.') + '</div>'
       + '<div class="bf-b" id="bfPassBtn">' + T('changePass', 'Сменить пароль') + '</div>'
       + '<div id="bfPassBox" style="display:none">'
       +   '<input class="bf-i" id="bfOldPass" type="password" placeholder="' + T('curPass', 'Текущий пароль') + '">'
       +   '<input class="bf-i" id="bfNewPass" type="password" placeholder="' + T('newPass', 'Новый пароль (от 4 символов)') + '">'
       +   '<div class="bf-e" id="bfPassErr"></div>'
       +   '<div class="bf-b" id="bfPassGo">' + T('changePass', 'Сменить пароль') + '</div>'
       + '</div>'
       + '<div class="bf-b ghost2" id="bfLogoutAll" style="border-color:#dc2626;color:#dc2626">'
       +   T('logoutAll', 'Выйти на всех устройствах') + '</div>'
       + '<div class="bf-h" id="bfSecNote">' + T('secNote',
           'Пароль хранится в зашифрованном виде — его не видно даже администратору.') + '</div>'
       + '<div class="bf-b" id="bfGoogle">Привязать Google аккаунт</div>'
       + '<div class="bf-h" id="bfGoogleNote"></div>'
       + '<div id="bfOwner"></div>');
    box.querySelector('#bfProfile').onclick = function () {
      location.href = BASE + 'users.html?name=' + encodeURIComponent(name);
    };
    box.querySelector('#bfSkin').onclick = function () { location.href = BASE + 'avatar.html'; };

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
          passErr.textContent = r.message || 'Пароль изменён';
          box.querySelector('#bfOldPass').value = '';
          box.querySelector('#bfNewPass').value = '';
        } else passErr.textContent = (r && r.message) || 'Ошибка';
      });
    };
    box.querySelector('#bfLogoutAll').onclick = function () {
      post('/logOutAll', {}, function () { location.reload(); });
    };

    var langSel = box.querySelector('#bfLang');
    get('/i18n/detect', function (d) {
      if (!d) return;
      langSel.value = d.saved ? d.lang : 'auto';
    });
    langSel.onchange = function () {
      if (window.I18N) I18N.set(this.value);
    };
    box.querySelector('#bfGoogle').onclick = function () {
      box.querySelector('#bfGoogleNote').innerHTML =
        'Привязка пока недоступна: для неё нужен ключ приложения Google ' +
        'и почтовый сервис для отправки кодов. Сейчас вход только по логину и паролю.';
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
