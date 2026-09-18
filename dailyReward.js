/* AIBROFIST — ежедневная награда: колесо фортуны.
   Сначала это была кнопка-подарок в шапке (её не замечали), потом
   карточка на главной под режимами — там колесо мешалось выбору режима
   и было тесно. Теперь у награды своя страница, daily.html, ссылка на
   неё стоит в боковом меню, а на главной остались только режимы.
   Приз всё так же выбирает СЕРВЕР — клиент только проигрывает анимацию
   до уже готового ответа (см. dailyRewards.js на сервере). */
(function () {
  'use strict';

  var T = function (k, f) { return (window.I18N && I18N.t(k) !== k) ? I18N.t(k) : (f || k); };

  var SLOT_ID = 'bfDailyWheel';
  var slot = document.getElementById(SLOT_ID);
  if (!slot) return;   // виджет есть только на главной

  /* Колесо живёт на своей странице (daily.html) и стало её главным
     предметом, а не карточкой в углу главной: крупнее, с золотым ободом,
     разделителями секторов, ступицей по центру и стрелкой сверху. Цвета —
     только через переменные темы, чтобы карточка одинаково читалась и в
     светлой, и в тёмной. */
  var css = ''
    /* Карточка выровнена по левому краю, как заголовок страницы над ней
       (margin:0, не auto) — раньше она центрировалась в колонке контента
       и вместе с заголовком не стояла на одной оси. */
    + '#' + SLOT_ID + '{max-width:430px;margin:0;color:var(--ink);'
    + 'font-family:inherit;box-sizing:border-box;text-align:center}'

    + '#' + SLOT_ID + ' .drCard{background:var(--panel);border:1px solid var(--line);'
    + 'border-radius:20px;padding:24px 20px 22px;'
    + 'box-shadow:0 20px 44px -26px rgba(15,23,42,.55)}'

    /* Размер в процентах, а не в пикселях: место под колесо — это ширина
       колонки рядом с боковым меню, а не ширина экрана, и медиа-запросом
       её не угадать. min() держит потолок на больших экранах, aspect-ratio
       делает круг круглым при любой ширине. */
    + '#' + SLOT_ID + ' .drWrap{position:relative;width:min(272px,100%);'
    + 'aspect-ratio:1/1;margin:0 auto 20px}'
    /* обод: конический градиент под золото, он же держит отступ до диска */
    + '#' + SLOT_ID + ' .drRim{position:absolute;inset:0;border-radius:50%;padding:4%;'
    + 'container-type:inline-size;'
    + 'box-sizing:border-box;'
    + 'background:conic-gradient(#f6dc9a,#b0801f,#fdf0c4,#9d6f1c,#f6dc9a,#b0801f,#fdf0c4);'
    + 'box-shadow:0 14px 30px -14px rgba(15,23,42,.6),'
    + 'inset 0 0 0 1px rgba(255,255,255,.45),0 0 0 1px rgba(0,0,0,.18)}'

    + '#' + SLOT_ID + ' .drWheel{width:100%;height:100%;border-radius:50%;position:relative;'
    + 'overflow:hidden;box-sizing:border-box;'
    + 'box-shadow:inset 0 0 0 3px rgba(255,255,255,.9),inset 0 0 26px rgba(0,0,0,.28);'
    + 'transition:transform 4.8s cubic-bezier(.11,.72,.12,1)}'
    /* тонкие лучи между секторами — поверх заливки, крутятся вместе с ней */
    + '#' + SLOT_ID + ' .drLines{position:absolute;inset:0;border-radius:50%;pointer-events:none}'
    /* мягкий объём: свет сверху, тень снизу */
    + '#' + SLOT_ID + ' .drGloss{position:absolute;inset:0;border-radius:50%;pointer-events:none;'
    + 'background:radial-gradient(circle at 32% 24%,rgba(255,255,255,.34),rgba(255,255,255,0) 46%),'
    + 'radial-gradient(circle at 68% 88%,rgba(0,0,0,.26),rgba(0,0,0,0) 52%)}'

    + '#' + SLOT_ID + ' .drLabel{position:absolute;inset:0;pointer-events:none}'
    + '#' + SLOT_ID + ' .drLabel b{position:absolute;left:50%;top:7%;'
    + 'text-align:center;font-size:clamp(11px,4.6cqw,14px);font-weight:800;color:#fff;'
    + 'white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,.55)}'
    + '#' + SLOT_ID + ' .drLabel b .bfCoinIcon{margin-left:3px;vertical-align:-2px}'
    /* Тот же ход, что у диска: подпись доворачивается ровно настолько,
       насколько повернулось колесо, и остаётся горизонтальной всю
       прокрутку. Без этого после остановки все подписи, кроме выигравшей,
       оказывались завалены набок и читались боком. */
    + '#' + SLOT_ID + ' .drLabel b{transition:transform 4.8s cubic-bezier(.11,.72,.12,1)}'

    /* ступица не крутится: отдельный слой поверх диска */
    + '#' + SLOT_ID + ' .drHub{position:absolute;left:38%;top:38%;width:24%;height:24%;'
    + 'border-radius:50%;z-index:3;display:flex;'
    + 'align-items:center;justify-content:center;background:var(--panel);'
    + 'box-shadow:0 5px 16px rgba(15,23,42,.35),inset 0 0 0 3px rgba(176,128,31,.6)}'

    + '#' + SLOT_ID + ' .drPointer{position:absolute;left:50%;top:-3px;'
    + 'transform:translateX(-50%);z-index:4;width:0;height:0;'
    + 'border-left:14px solid transparent;border-right:14px solid transparent;'
    + 'border-top:26px solid #e8ae23;'
    + 'filter:drop-shadow(0 3px 4px rgba(0,0,0,.45))}'

    + '#' + SLOT_ID + ' .drGo{border:none;border-radius:12px;font-size:16px;font-weight:700;'
    + 'padding:14px 0;width:100%;cursor:pointer;color:#3a2600;letter-spacing:.3px;'
    + 'background:linear-gradient(180deg,#ffd964,#e0a020);'
    + 'box-shadow:0 10px 22px -12px rgba(224,160,32,.95)}'
    + '#' + SLOT_ID + ' .drGo:hover{filter:brightness(1.07)}'
    + '#' + SLOT_ID + ' .drGo:active{transform:translateY(1px)}'
    + '#' + SLOT_ID + ' .drGo:disabled{opacity:.55;cursor:default;transform:none;filter:none}'

    + '#' + SLOT_ID + ' .drWait{color:var(--muted);font-size:14.5px;line-height:1.6}'
    + '#' + SLOT_ID + ' .drWait b{color:var(--ink);font-size:17px}'
    + '#' + SLOT_ID + ' .drWin{font-size:19px;font-weight:800;color:var(--gold);'
    + 'margin-top:14px;min-height:26px}'
    + '#' + SLOT_ID + ' .drWin.on{animation:drPop .45s cubic-bezier(.2,1.4,.4,1)}'
    + '@keyframes drPop{from{transform:scale(.5);opacity:0}to{transform:scale(1);opacity:1}}'
    /* выигрышный сектор подсвечиваем свечением по ободу */
    + '#' + SLOT_ID + ' .drRim.won{animation:drGlow 1.1s ease-out 2}'
    + '@keyframes drGlow{0%,100%{filter:none}50%{filter:drop-shadow(0 0 14px rgba(255,196,60,.9))}}'

    + '';

  // сектора: чередуем тёмные и яркие, чтобы соседние не сливались
  var COLORS = ['#2f7ded', '#1b2130', '#e8a317', '#2f9e46', '#d63b3b', '#7d4fe0'];

  function injectCss() {
    var s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  var prizes = [], spinning = false;

  function fmtLeft(ms) {
    var h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? (h + 'h ' + m + 'm') : (m + 'm');
  }

  function buildWheel() {
    var n = prizes.length || 1;
    var slice = 360 / n;
    var gradParts = prizes.map(function (p, i) {
      var c = COLORS[i % COLORS.length];
      return c + ' ' + (i * slice) + 'deg ' + ((i + 1) * slice) + 'deg';
    }).join(', ');
    /* Лучи-разделители: один повторяющийся градиент вместо N элементов.
       Сдвиг на половину толщины линии ставит её ровно на границу
       секторов, а не рядом с ней. */
    var lines = 'repeating-conic-gradient(from -0.75deg,'
      + 'rgba(255,255,255,.95) 0deg 1.5deg, rgba(255,255,255,0) 1.5deg ' + slice + 'deg)';
    var labels = prizes.map(function (p, i) {
      var angle = i * slice + slice / 2;
      var coin = window.BFCoin ? BFCoin.svg(13) : '';
      return '<div class="drLabel" style="transform:rotate(' + angle + 'deg)">'
        + '<b data-a="' + angle + '" style="transform:translateX(-50%) rotate('
        +   (-angle) + 'deg)">+' + p.amount + coin + '</b></div>';
    }).join('');
    return '<div class="drWrap">'
      +   '<div class="drPointer"></div>'
      +   '<div class="drRim" id="drRim">'
      +     '<div class="drWheel" id="drWheel" style="background:conic-gradient(' + gradParts + ')">'
      +       labels
      +       '<div class="drLines" style="background:' + lines + '"></div>'
      +       '<div class="drGloss"></div>'
      +     '</div>'
      +   '</div>'
      +   '<div class="drHub">' + (window.BFCoin ? BFCoin.svg(30) : '') + '</div>'
      + '</div>';
  }

  /* Заголовок и подпись рисует сама страница (daily.html, .bfTitle/.bfSub) —
     как и на остальных разделах сайта. Карточка их не повторяет: два
     одинаковых «Daily Reward» подряд выглядели как ошибка вёрстки. */
  function card(inner) {
    return '<div class="drCard">' + inner + '</div>';
  }

  function render(d) {
    if (d.guest) {
      /* На своей странице пустоту показывать нельзя — гость должен
         понимать, почему колесо не крутится и что делать. */
      slot.innerHTML = card(buildWheel()
        + '<div class="drWait">' + T('dailyRewardGuest', 'Sign in to spin the wheel.') + '</div>');
      return;
    }
    if (!d.available) {
      slot.innerHTML = card(buildWheel()
        + '<div class="drWait">' + T('dailyRewardWait', 'Come back in') + '<br>'
        +   '<b>' + fmtLeft(d.msLeft) + '</b></div>');
      return;
    }
    slot.innerHTML = card(buildWheel()
      // data-sfx — у кнопки свой звук клика (см. spin()), общий клик сайта
      // (sound.js) на неё не срабатывает, чтобы не звучало сразу два клика
      + '<button class="drGo" id="drGo" data-sfx="wheel">' + T('spin', 'Spin') + '</button>'
      + '<div class="drWin" id="drWin"></div>');
    slot.querySelector('#drGo').onclick = spin;
  }

  function spin() {
    if (spinning) return;
    spinning = true;
    if (window.BFSound) BFSound.wheelClick();
    var btn = slot.querySelector('#drGo');
    btn.disabled = true;
    fetch('/dailyReward/claim', { method: 'POST', credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.status !== 'success') {
          slot.querySelector('#drWin').textContent = d.message || T('errorTxt', 'Error');
          spinning = false; btn.disabled = false;
          return;
        }
        var n = prizes.length;
        var slice = 360 / n;
        // центр нужного сектора приводим под неподвижный указатель сверху;
        // несколько полных оборотов — только ради самой анимации
        var target = 360 * 7 - (d.index * slice + slice / 2);
        var wheel = document.getElementById('drWheel');
        wheel.style.transform = 'rotate(' + target + 'deg)';
        if (window.BFSound) BFSound.wheelSpin();
        // подписи доворачиваем на тот же угол в другую сторону — остаются прямыми
        var labels = slot.querySelectorAll('.drLabel b');
        for (var li = 0; li < labels.length; li++) {
          var a = Number(labels[li].getAttribute('data-a')) || 0;
          labels[li].style.transform = 'translateX(-50%) rotate(' + (-(a + target)) + 'deg)';
        }
        // ждём конца прокрутки (4.8s по transition) и только тогда объявляем приз
        setTimeout(function () {
          var win = slot.querySelector('#drWin');
          win.innerHTML = '+' + d.amount + ' ' + (window.BFCoin ? BFCoin.svg(20) : '');
          win.classList.add('on');
          var rim = document.getElementById('drRim');
          if (rim) rim.classList.add('won');
          if (window.BFSound) BFSound.drWin();
          if (window.BFShell) window.BFShell.refreshCoins(d.coins);
        }, 4900);
      })
      .catch(function () {
        slot.querySelector('#drWin').textContent = T('serverDown', 'Server unavailable');
        spinning = false; btn.disabled = false;
      });
  }

  function boot() {
    injectCss();
    fetch('/dailyReward/status', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        // гостю тоже показываем страницу — но с подсказкой войти
        slot.style.display = 'block';
        prizes = d.prizes || [];
        render(d);
      })
      .catch(function () { slot.style.display = 'none'; });
  }

  boot();
})();
