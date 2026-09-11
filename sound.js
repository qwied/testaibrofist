/* AIBROFIST — короткие игровые звуки без файлов. Тон-генератор поверх
   Web Audio API, тем же приёмом, что и звук дождя в abuseShow.js: ничего
   не грузится, ничего не зависит от связи, работает на любом устройстве.
   Игрок может выключить звук — настройка живёт в localStorage.

   Все тона — только 'sine'/'triangle': у них нет резких обертонов, в
   отличие от 'square'/'sawtooth', поэтому звук получается мягким, а не
   жужжащим. Громкость всюду низкая (0.04-0.14) — фон, а не сигнализация. */
(function () {
  'use strict';

  var KEY = 'bfSoundOn';
  var on = true;
  try { on = localStorage.getItem(KEY) !== '0'; } catch (e) {}

  var actx = null;
  /* Контекст, созданный до первого касания страницы, засыпает и сам не
     просыпается — будим при каждом обращении (см. abuseShow.js). */
  function audioCtx() {
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    if (!actx) { try { actx = new C(); } catch (e) { return null; } }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }

  // один короткий тон: opt.endFreq — плавное скольжение частоты, opt.delay — отложенный старт
  function tone(freq, dur, opt) {
    if (!on) return;
    var a = audioCtx();
    if (!a) return;
    opt = opt || {};
    var t0 = a.currentTime + (opt.delay || 0);
    var osc = a.createOscillator();
    var gain = a.createGain();
    osc.type = opt.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opt.endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opt.endFreq), t0 + dur);
    var vol = opt.volume === undefined ? 0.1 : opt.volume;
    // мягкая атака — без щелчка в начале ноты
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain); gain.connect(a.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }

  function jump()   { tone(640, 0.09, { type: 'sine', endFreq: 860, volume: 0.08 }); }
  function tick()   { tone(880, 0.06, { type: 'sine', volume: 0.07 }); }
  function go()     { tone(620, 0.16, { type: 'triangle', endFreq: 840, volume: 0.11 }); }
  function death()  { tone(300, 0.26, { type: 'triangle', endFreq: 110, volume: 0.1 }); }
  function chat()   { tone(980, 0.05, { type: 'sine', volume: 0.055 }); }
  // клик по кнопке — самый тихий и короткий звук из всех, чтобы не
  // надоедать при частом нажатии (палитра в Skin Editor, вкладки и т.п.)
  function click()  { tone(720, 0.032, { type: 'sine', volume: 0.045 }); }
  // постановка блока в Map Editor — короткий мягкий «тук»
  function place()  { tone(190, 0.08, { type: 'triangle', endFreq: 150, volume: 0.075 }); }
  // шаги — левая/правая нога чуть разной высоты, тише всего остального
  var stepFoot = 0;
  function step() {
    stepFoot = 1 - stepFoot;
    tone(stepFoot ? 150 : 132, 0.045, { type: 'triangle', volume: 0.04 });
  }
  // финишная черта — сразу в момент касания (отдельно от общего «win»,
  // который звучит чуть позже, когда сервер подтвердит забег)
  function finish() {
    tone(700, 0.09, { type: 'triangle', volume: 0.1 });
    tone(880, 0.13, { type: 'triangle', volume: 0.1, delay: 0.09 });
  }
  // короткое восходящее арпеджио из трёх нот
  function win() {
    tone(523, 0.12, { type: 'triangle', volume: 0.09 });
    tone(659, 0.12, { type: 'triangle', volume: 0.1, delay: 0.1 });
    tone(784, 0.18, { type: 'triangle', volume: 0.11, delay: 0.2 });
  }

  function setOn(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
  }

  /* ---------- клик по кнопке — сайт целиком ----------
     Один делегированный обработчик на весь документ: работает для любой
     кнопки, добавленной хоть сейчас, хоть позже скриптом страницы —
     отдельный слушатель на каждую не нужен. */
  var CLICK_SEL = 'button, a.bfBtn, .bfDropItem, .msRow, .bfTab, .bfChip, ' +
    '.header-link-item-button, .header-more-link-button, .modeBtn, .card';
  if (!window.__bfSoundClickBound) {
    window.__bfSoundClickBound = true;
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest(CLICK_SEL) : null;
      if (t && !t.disabled) click();
    }, true);
  }

  window.BFSound = {
    jump: jump, tick: tick, go: go, death: death, chat: chat, win: win,
    click: click, place: place, step: step, finish: finish,
    isOn: function () { return on; }, setOn: setOn
  };
})();
