/* AIBROFIST — ежедневная награда: колесо фортуны прямо на главной.
   Раньше это была кнопка-подарок в шапке, открывавшая колесо в модалке —
   на практике игроки её не замечали (маленькая иконка среди прочих).
   Теперь колесо рисуется сразу, без клика, в отведённом месте на
   главной странице под карточками режимов (#bfDailyWheel в index.html).
   Приз всё так же выбирает СЕРВЕР — клиент только проигрывает анимацию
   до уже готового ответа (см. dailyRewards.js на сервере). */
(function () {
  'use strict';

  var T = function (k, f) { return (window.I18N && I18N.t(k) !== k) ? I18N.t(k) : (f || k); };

  var SLOT_ID = 'bfDailyWheel';
  var slot = document.getElementById(SLOT_ID);
  if (!slot) return;   // виджет есть только на главной

  var css = ''
    + '#' + SLOT_ID + '{max-width:280px;margin:18px auto 26px;padding:18px 20px 16px;'
    + 'border:2px solid #e4e4e4;border-radius:8px;box-shadow:0 9px 11px -6px #ccc;'
    + 'color:#2d2d2d;font-family:sans-serif;box-sizing:border-box;text-align:center}'
    + '#' + SLOT_ID + ' .drT{font-size:16px;font-weight:800;margin-bottom:14px}'
    + '#' + SLOT_ID + ' .drWrap{position:relative;width:180px;height:180px;margin:0 auto 16px}'
    + '#' + SLOT_ID + ' .drWheel{width:180px;height:180px;border-radius:50%;position:relative;'
    + 'border:5px solid #111827;box-sizing:border-box;'
    + 'transition:transform 3.2s cubic-bezier(.17,.89,.32,1.1)}'
    + '#' + SLOT_ID + ' .drLabel{position:absolute;left:50%;top:50%;width:0;height:0}'
    + '#' + SLOT_ID + ' .drLabel b{position:absolute;left:-20px;top:-58px;width:40px;text-align:center;'
    + 'font-size:13px;font-weight:800;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.35)}'
    + '#' + SLOT_ID + ' .drPointer{position:absolute;left:50%;top:-6px;transform:translateX(-50%);'
    + 'width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;'
    + 'border-top:15px solid #111827;z-index:2}'
    + '#' + SLOT_ID + ' .drGo{border:1px solid #2196F3;border-radius:6px;font-size:15px;padding:10px 0;'
    + 'width:100%;background:#fff;color:#2196F3;cursor:pointer;margin-top:4px}'
    + '#' + SLOT_ID + ' .drGo:hover{background:#2196F3;color:#fff}'
    + '#' + SLOT_ID + ' .drGo:disabled{opacity:.5;cursor:default;background:#fff;color:#2196F3}'
    + '#' + SLOT_ID + ' .drWait{color:#6b7280;font-size:14px;line-height:1.5}'
    + '#' + SLOT_ID + ' .drWin{font-size:17px;font-weight:800;color:#2e9b2e;margin-top:6px;min-height:22px}';

  var COLORS = ['#2196F3', '#111827', '#e2a600', '#2e9b2e', '#dc2626', '#7c3aed'];

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
    var labels = prizes.map(function (p, i) {
      var angle = i * slice + slice / 2;
      return '<div class="drLabel" style="transform:rotate(' + angle + 'deg)">'
        + '<b style="transform:rotate(' + (-angle) + 'deg)">+' + p.amount + '</b></div>';
    }).join('');
    return '<div class="drWrap"><div class="drPointer"></div>'
      + '<div class="drWheel" id="drWheel" style="background:conic-gradient(' + gradParts + ')">'
      +   labels
      + '</div></div>';
  }

  function render(d) {
    if (!d.available) {
      slot.innerHTML =
          '<div class="drT">' + T('dailyReward', 'Daily Reward') + '</div>'
        + '<div class="drWait">' + T('dailyRewardWait', 'Come back in') + ' '
        +   '<b>' + fmtLeft(d.msLeft) + '</b></div>';
      return;
    }
    slot.innerHTML =
        '<div class="drT">' + T('dailyReward', 'Daily Reward') + '</div>'
      + buildWheel()
      + '<button class="drGo" id="drGo">' + T('spin', 'Spin') + '</button>'
      + '<div class="drWin" id="drWin"></div>';
    slot.querySelector('#drGo').onclick = spin;
  }

  function spin() {
    if (spinning) return;
    spinning = true;
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
        var target = 360 * 5 - (d.index * slice + slice / 2);
        var wheel = document.getElementById('drWheel');
        wheel.style.transform = 'rotate(' + target + 'deg)';
        setTimeout(function () {
          slot.querySelector('#drWin').innerHTML = '+' + d.amount + ' ' + (window.BFCoin ? BFCoin.svg(18) : '');
          if (window.BFShell) window.BFShell.refreshCoins(d.coins);
        }, 3300);
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
        if (d.guest) { slot.style.display = 'none'; return; }
        slot.style.display = 'block';
        prizes = d.prizes || [];
        render(d);
      })
      .catch(function () { slot.style.display = 'none'; });
  }

  boot();
})();
