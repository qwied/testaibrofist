/* AIBROFIST — ежедневная награда: колесо фортуны в шапке сайта.
   Кнопка-подарок (🎁) уже вставлена в шапку самим shell.js — этот файл
   только оживляет её: проверяет доступность приза, рисует колесо и
   крутит его до результата, который решил СЕРВЕР (см. dailyReward.js
   на сервере — клиент не выбирает приз сам, только проигрывает анимацию
   до уже готового ответа). */
(function () {
  'use strict';

  var T = function (k, f) { return (window.I18N && I18N.t(k) !== k) ? I18N.t(k) : (f || k); };

  var css = ''
    + '.drOv{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;display:none}'
    + '.drOv.open{display:block}'
    + '.drBox{position:fixed;inset:0;margin:auto;width:320px;height:max-content;max-height:90vh;'
    + 'background:#fff;border:3px solid #c5c5c5;border-radius:10px;padding:22px 24px 20px;'
    + 'color:#2d2d2d;z-index:9999;display:none;font-family:sans-serif;box-sizing:border-box;'
    + 'text-align:center}'
    + '.drBox.open{display:block}'
    + '.drX{position:absolute;right:6px;top:5px;border:1px solid;border-radius:30px;font-size:14px;'
    + 'padding:3px 8px;color:red;background:#fff;cursor:pointer;line-height:1}'
    + '.drT{font-size:17px;font-weight:800;margin-bottom:14px}'
    + '.drWrap{position:relative;width:220px;height:220px;margin:0 auto 16px}'
    + '.drWheel{width:220px;height:220px;border-radius:50%;position:relative;'
    + 'border:5px solid #111827;box-sizing:border-box;'
    + 'transition:transform 3.2s cubic-bezier(.17,.89,.32,1.1)}'
    + '.drLabel{position:absolute;left:50%;top:50%;width:0;height:0}'
    + '.drLabel b{position:absolute;left:-20px;top:-72px;width:40px;text-align:center;'
    + 'font-size:14px;font-weight:800;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.35)}'
    + '.drPointer{position:absolute;left:50%;top:-6px;transform:translateX(-50%);'
    + 'width:0;height:0;border-left:11px solid transparent;border-right:11px solid transparent;'
    + 'border-top:18px solid #111827;z-index:2}'
    + '.drGo{border:1px solid #2196F3;border-radius:6px;font-size:16px;padding:11px 0;width:100%;'
    + 'background:#fff;color:#2196F3;cursor:pointer;margin-top:4px}'
    + '.drGo:hover{background:#2196F3;color:#fff}'
    + '.drGo:disabled{opacity:.5;cursor:default;background:#fff;color:#2196F3}'
    + '.drWait{color:#6b7280;font-size:14.5px;line-height:1.5}'
    + '.drWin{font-size:18px;font-weight:800;color:#2e9b2e;margin-top:6px;min-height:24px}';

  var COLORS = ['#2196F3', '#111827', '#e2a600', '#2e9b2e', '#dc2626', '#7c3aed'];

  function injectCss() {
    var s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  var ov, box, prizes = [], spinning = false;

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

  function open() {
    fetch('/dailyReward/status', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        prizes = d.prizes || [];
        render(d);
        ov.classList.add('open');
        box.classList.add('open');
      })
      .catch(function () {});
  }
  function close() { ov.classList.remove('open'); box.classList.remove('open'); }

  function render(d) {
    if (!d.available) {
      box.innerHTML =
          '<div class="drX">X</div>'
        + '<div class="drT">' + T('dailyReward', 'Daily Reward') + '</div>'
        + '<div class="drWait">' + T('dailyRewardWait', 'Come back in') + ' '
        +   '<b>' + fmtLeft(d.msLeft) + '</b></div>';
      box.querySelector('.drX').onclick = close;
      return;
    }
    box.innerHTML =
        '<div class="drX">X</div>'
      + '<div class="drT">' + T('dailyReward', 'Daily Reward') + '</div>'
      + buildWheel()
      + '<button class="drGo" id="drGo">' + T('spin', 'Spin') + '</button>'
      + '<div class="drWin" id="drWin"></div>';
    box.querySelector('.drX').onclick = close;
    box.querySelector('#drGo').onclick = spin;
  }

  function spin() {
    if (spinning) return;
    spinning = true;
    var btn = box.querySelector('#drGo');
    btn.disabled = true;
    fetch('/dailyReward/claim', { method: 'POST', credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.status !== 'success') {
          box.querySelector('#drWin').textContent = d.message || T('errorTxt', 'Error');
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
          box.querySelector('#drWin').textContent = '+' + d.amount + ' 🪙';
          setDot(false);
          if (window.BFShell) window.BFShell.refreshCoins(d.coins);
        }, 3300);
      })
      .catch(function () {
        box.querySelector('#drWin').textContent = T('serverDown', 'Server unavailable');
        spinning = false; btn.disabled = false;
      });
  }

  function setDot(on) {
    var dot = document.getElementById('bfGiftDot');
    if (dot) dot.style.display = on ? 'block' : 'none';
  }

  function boot() {
    injectCss();
    ov = document.createElement('div'); ov.className = 'drOv';
    box = document.createElement('div'); box.className = 'drBox';
    document.body.appendChild(ov); document.body.appendChild(box);
    ov.onclick = close;
    box.addEventListener('click', function (e) { e.stopPropagation(); });

    var btn = document.getElementById('bfGiftBtn');
    if (btn) btn.onclick = open;

    fetch('/dailyReward/status', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) { setDot(!!d.available); })
      .catch(function () {});
  }

  // кнопка-подарок появляется в шапке чуть позже (shell.js рисует её
  // только после /whoAmI) — ждём готовности шапки, а не просто DOMContentLoaded
  if (document.getElementById('bfGiftBtn')) boot();
  else window.addEventListener('bf-shell-ready', boot, { once: true });
})();
