/* Определение устройства AIBrofist
   Ставит на <html> классы is-mobile / is-tablet / is-desktop и is-touch / is-mouse,
   а также атрибут data-device. Пересчитывается при повороте экрана. */
(function () {
  'use strict';

  var root = document.documentElement;

  function detect() {
    var w = Math.min(window.innerWidth || 0, window.screen ? window.screen.width : 99999);
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    var uaPhone = /Android|iPhone|iPod|Windows Phone|IEMobile|Opera Mini/i.test(navigator.userAgent);
    var uaTablet = /iPad|Tablet|PlayBook|Silk/i.test(navigator.userAgent) ||
                   (/Android/i.test(navigator.userAgent) && !/Mobile/i.test(navigator.userAgent)) ||
                   (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    var type;
    if (uaPhone || (touch && coarse && w <= 820)) type = 'mobile';
    else if (uaTablet || (touch && coarse && w <= 1180)) type = 'tablet';
    else type = 'desktop';

    return { type: type, touch: !!touch, width: w };
  }

  function apply() {
    var d = detect();
    root.classList.remove('is-mobile', 'is-tablet', 'is-desktop', 'is-touch', 'is-mouse');
    root.classList.add('is-' + d.type);
    root.classList.add(d.touch ? 'is-touch' : 'is-mouse');
    root.setAttribute('data-device', d.type);
    window.BF_DEVICE = d;
    window.isMobile = (d.type === 'mobile');
    return d;
  }

  var d = apply();

  // на телефоне и планшете страница не должна прыгать при повороте
  window.addEventListener('orientationchange', function () { setTimeout(apply, 250); });
  window.addEventListener('resize', function () {
    clearTimeout(window.__bfResize);
    window.__bfResize = setTimeout(apply, 200);
  });

  // на сенсорных экранах убираем задержку 300 мс и залипание :hover
  if (d.touch) {
    var m = document.querySelector('meta[name="viewport"]');
    if (!m) {
      m = document.createElement('meta');
      m.name = 'viewport';
      document.head.appendChild(m);
    }
    // в редакторе свой viewport с запретом зума — его не трогаем
    if (m.content.indexOf('user-scalable=no') === -1)
      m.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
  }
})();
