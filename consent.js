/* AIBROFIST — пользовательское соглашение.
   Показывается один раз на устройство при первом заходе на главную.
   Согласие хранится в браузере; если игрок вошёл в аккаунт, отметка
   уходит и на сервер, чтобы не спрашивать снова на другом устройстве. */
(function () {
  'use strict';

  var KEY = 'bfConsent';
  var VERSION = '1';          // поднять, если текст соглашения изменится

  function already() {
    try { return localStorage.getItem(KEY) === VERSION; } catch (e) { return false; }
  }
  function remember() {
    try { localStorage.setItem(KEY, VERSION); } catch (e) {}
    fetch('/consent/accept', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'version=' + VERSION
    }).catch(function () {});
  }

  var CSS = ''
    + '#bfConsent{position:fixed;inset:0;z-index:9998;display:flex;align-items:center;'
    + 'justify-content:center;padding:16px;background:rgba(9,12,18,.62);backdrop-filter:blur(3px)}'
    + '#bfConsentBox{background:var(--panel,#fff);color:var(--ink,#111827);'
    + 'border:1px solid var(--line,#e5e7eb);border-radius:16px;max-width:560px;width:100%;'
    + 'max-height:88vh;overflow:auto;padding:24px 24px 20px;'
    + 'box-shadow:0 24px 60px -20px rgba(9,12,18,.65);'
    + 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}'
    + '#bfConsentBox h2{margin:0 0 6px;font-size:21px}'
    + '#bfConsentBox .sub{color:var(--muted,#6b7280);font-size:14px;margin-bottom:16px}'
    + '#bfConsentBox h3{margin:16px 0 6px;font-size:15px}'
    + '#bfConsentBox p,#bfConsentBox li{font-size:14.5px;line-height:1.6;margin:0 0 8px}'
    + '#bfConsentBox ul{margin:0 0 8px;padding-left:20px}'
    + '#bfConsentBox .note{font-size:13px;color:var(--muted,#6b7280);margin-top:14px}'
    + '#bfConsentBox .acts{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}'
    + '#bfConsentBox button{flex:1 1 180px;min-height:46px;padding:12px 18px;border-radius:11px;'
    + 'font-size:15px;font-weight:600;cursor:pointer;border:1px solid var(--line,#e5e7eb);'
    + 'background:var(--panel,#fff);color:var(--ink,#111827)}'
    + '#bfConsentBox button.go{background:var(--bf-grad,var(--blue,#2196F3));color:#fff;border-color:transparent}'
    + '#bfConsentBox button.go:hover{filter:brightness(.95)}'
    + '#bfConsentBox button.no:hover{background:#f1f3f7}'
    + '@media(max-width:520px){#bfConsentBox{padding:18px 16px 16px}#bfConsentBox h2{font-size:19px}}';

  var TEXT = {
    ru: {
      title: 'Пользовательское соглашение',
      sub: 'Перед началом игры, пожалуйста, ознакомьтесь.',
      whatH: 'Какие данные мы обрабатываем',
      what: [
        'Ник и пароль — чтобы вы могли войти в аккаунт. Пароль хранится в зашифрованном виде.',
        'Игровой прогресс: монеты, скины, созданные карты, оценки и список друзей.',
        'Дата регистрации и время последнего входа.',
        'IP-адрес — только чтобы ограничить создание аккаунтов и подобрать язык интерфейса.',
        'Настройки: выбранный язык и тема оформления.'
      ],
      whyH: 'Зачем это нужно',
      why: 'Всё перечисленное используется только для работы самой игры: вход в аккаунт, '
         + 'сохранение прогресса, таблица лидеров и защита от накруток. Мы не продаём эти '
         + 'данные, не передаём их третьим лицам и не показываем рекламу.',
      cookieH: 'Файлы в браузере',
      cookie: 'Мы сохраняем в вашем браузере ключ сессии (чтобы не входить заново) '
            + 'и настройки языка и темы. Это нужно для работы сайта.',
      rightsH: 'Ваши права',
      rights: 'Вы можете удалить свои карты и скины в любой момент. Чтобы удалить аккаунт '
            + 'целиком, напишите в Telegram — контакт есть в меню.',
      note: 'Нажимая «Принимаю», вы соглашаетесь с обработкой перечисленных данных. '
          + 'Мы спросим об этом один раз на этом устройстве.',
      yes: 'Принимаю',
      no: 'Не согласен'
    },
    en: {
      title: 'Terms of use',
      sub: 'Please read this before you start playing.',
      whatH: 'What data we process',
      what: [
        'Username and password, so you can sign in. The password is stored encrypted.',
        'Game progress: coins, skins, maps you made, ratings and your friends list.',
        'Sign-up date and last seen time.',
        'IP address — only to limit account creation and pick the interface language.',
        'Settings: chosen language and colour theme.'
      ],
      whyH: 'Why we need it',
      why: 'All of it is used only to run the game itself: signing in, saving progress, '
         + 'the leaderboard and protection against vote rigging. We do not sell this data, '
         + 'do not share it with third parties and show no ads.',
      cookieH: 'Browser storage',
      cookie: 'We keep a session key in your browser so you stay signed in, plus your '
            + 'language and theme settings. This is needed for the site to work.',
      rightsH: 'Your rights',
      rights: 'You can delete your maps and skins at any time. To delete the account '
            + 'entirely, write to us on Telegram — the link is in the menu.',
      note: 'By pressing “I agree” you consent to the processing of the data listed above. '
          + 'We ask this once per device.',
      yes: 'I agree',
      no: 'I do not agree'
    }
  };

  function pick() {
    var lang = (window.I18N && I18N.current) || document.documentElement.lang || 'ru';
    return TEXT[lang] || (lang === 'uk' ? TEXT.ru : TEXT.en);
  }

  function show() {
    var t = pick();
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    var wrap = document.createElement('div');
    wrap.id = 'bfConsent';
    wrap.innerHTML =
        '<div id="bfConsentBox" role="dialog" aria-modal="true">'
      +   '<h2>' + t.title + '</h2>'
      +   '<div class="sub">' + t.sub + '</div>'
      +   '<h3>' + t.whatH + '</h3><ul>'
      +     t.what.map(function (x) { return '<li>' + x + '</li>'; }).join('')
      +   '</ul>'
      +   '<h3>' + t.whyH + '</h3><p>' + t.why + '</p>'
      +   '<h3>' + t.cookieH + '</h3><p>' + t.cookie + '</p>'
      +   '<h3>' + t.rightsH + '</h3><p>' + t.rights + '</p>'
      +   '<div class="note">' + t.note + '</div>'
      +   '<div class="acts">'
      +     '<button class="no" id="bfConsentNo">' + t.no + '</button>'
      +     '<button class="go" id="bfConsentYes">' + t.yes + '</button>'
      +   '</div>'
      + '</div>';
    document.body.appendChild(wrap);

    // пока не ответили, страницу не листаем
    var prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    document.getElementById('bfConsentYes').onclick = function () {
      remember();
      wrap.remove();
      document.body.style.overflow = prev;
    };
    document.getElementById('bfConsentNo').onclick = function () {
      // без согласия играть нельзя — уводим со страницы
      location.href = 'https://t.me/aibrofist';
    };
  }

  function boot() {
    if (already()) return;
    // спрашиваем только на главной: остальные страницы открываются уже после
    var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (here !== '' && here !== 'index.html') return;

    // ждём язык, чтобы показать соглашение на понятном игроку
    if (window.I18N) setTimeout(show, 220);
    else show();
  }

  window.BFConsent = {
    show: show,
    reset: function () { try { localStorage.removeItem(KEY); } catch (e) {} }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
