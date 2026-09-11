/* AIBROFIST — короткие игровые звуки без файлов. Тон-генератор поверх
   Web Audio API, тем же приёмом, что и звук дождя в abuseShow.js: ничего
   не грузится, ничего не зависит от связи, работает на любом устройстве.
   Игрок может выключить звук — настройка живёт в localStorage.

   Два вида звука:
   - tone()  — музыкальный сигнал (прыжок, победа, отсчёт) через
     osc→lowpass→gain: фильтр срезает резкие верхние обертоны, из-за
     которых 'sine'/'triangle' всё равно могут звучать «пищаще».
   - tap()   — мягкий тактильный «стук»/«шорох» через отфильтрованный
     белый шум (тот же приём, что и дождь в abuseShow.js): звучит куда
     теплее и естественнее чистого тона — им озвучены клики, шаги,
     печать и постановка блока, то есть почти всё, что часто повторяется. */
(function () {
  'use strict';

  var KEY = 'bfSoundOn';
  var on = true;
  try { on = localStorage.getItem(KEY) !== '0'; } catch (e) {}

  var actx = null;
  var noiseBuf = null;
  /* Контекст, созданный до первого касания страницы, засыпает и сам не
     просыпается — будим при каждом обращении (см. abuseShow.js). */
  function audioCtx() {
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    if (!actx) { try { actx = new C(); } catch (e) { return null; } }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function noise(a) {
    if (noiseBuf) return noiseBuf;
    var n = Math.round(a.sampleRate * 0.4);
    noiseBuf = a.createBuffer(1, n, a.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  // музыкальный тон, смягчённый фильтром нижних частот
  function tone(freq, dur, opt) {
    if (!on) return;
    var a = audioCtx();
    if (!a) return;
    opt = opt || {};
    var t0 = a.currentTime + (opt.delay || 0);
    var osc = a.createOscillator();
    var filt = a.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = opt.cutoff || 1800;
    filt.Q.value = 0.4;
    var gain = a.createGain();
    osc.type = opt.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opt.endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opt.endFreq), t0 + dur);
    var vol = opt.volume === undefined ? 0.07 : opt.volume;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(filt); filt.connect(gain); gain.connect(a.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }

  // мягкий тактильный «тап» из отфильтрованного шума — clicks/steps/typing
  function tap(dur, vol, cutoff, opt) {
    if (!on) return;
    var a = audioCtx();
    if (!a) return;
    opt = opt || {};
    var t0 = a.currentTime + (opt.delay || 0);
    var src = a.createBufferSource();
    src.buffer = noise(a);
    var filt = a.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(cutoff, t0);
    var gain = a.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(gain); gain.connect(a.destination);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  // громкость поднята ещё немного (была снижена дважды по прошлым
  // жалобам «слишком громко/резко» — теперь наоборот просили погромче)
  function jump()  { tone(560, 0.1, { type: 'sine', endFreq: 740, volume: 0.08, cutoff: 1400 }); }
  function go()    { tone(560, 0.16, { type: 'triangle', endFreq: 740, volume: 0.1, cutoff: 1600 }); }
  function death() { tone(280, 0.3, { type: 'triangle', endFreq: 100, volume: 0.085, cutoff: 900 }); }
  function tick()  { tone(760, 0.06, { type: 'sine', volume: 0.065, cutoff: 1600 }); }
  function chat()  { tone(880, 0.05, { type: 'sine', volume: 0.05, cutoff: 1800 }); }
  function finish() {
    tone(620, 0.09, { type: 'triangle', volume: 0.085, cutoff: 1600 });
    tone(780, 0.13, { type: 'triangle', volume: 0.09, delay: 0.09, cutoff: 1600 });
  }
  function win() {
    tone(500, 0.11, { type: 'triangle', volume: 0.08, cutoff: 1600 });
    tone(620, 0.11, { type: 'triangle', volume: 0.085, delay: 0.1, cutoff: 1600 });
    tone(740, 0.16, { type: 'triangle', volume: 0.09, delay: 0.2, cutoff: 1600 });
  }

  // клик по кнопке/ссылке — тёплый «тап», не писк
  function click() { tap(0.032, 0.045, 2400 + Math.random() * 400); }
  // печать — самый тихий и короткий, лёгкая случайная вариация как у
  // настоящей клавиатуры, чтобы монотонный текст не звучал как метроном
  function type()  { tap(0.02, 0.03, 2800 + Math.random() * 900); }
  // шаги — ниже и глуше клика, левая/правая нога чуть разной высоты
  var stepFoot = 0;
  function step() {
    stepFoot = 1 - stepFoot;
    tap(0.05, 0.045, stepFoot ? 420 : 360);
  }
  // постановка блока в Map Editor — самый низкий и весомый «тук»
  function place() { tap(0.09, 0.065, 300); }

  function setOn(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
  }

  /* ---------- клик по кнопке/ссылке — сайт целиком ----------
     Один делегированный обработчик на весь документ: работает для любой
     кнопки или ссылки, добавленной хоть сейчас, хоть позже скриптом
     страницы — отдельный слушатель на каждую не нужен. Ссылки — тоже
     button-like: тап должен успеть прозвучать до ухода со страницы. */
  var CLICK_SEL = 'button, a, [role="button"], .bfDropItem, .msRow, .bfTab, .bfChip';
  if (!window.__bfSoundClickBound) {
    window.__bfSoundClickBound = true;
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest(CLICK_SEL) : null;
      if (t && !t.disabled) click();
    }, true);
  }

  /* ---------- печать — любое текстовое поле сайта ---------- */
  if (!window.__bfSoundTypeBound) {
    window.__bfSoundTypeBound = true;
    document.addEventListener('input', function (e) {
      var t = e.target;
      if (!t) return;
      var tag = t.tagName;
      if (tag === 'TEXTAREA' || (tag === 'INPUT' && /^(text|search|password|email|url|tel|number)$/i.test(t.type || 'text'))) {
        type();
      }
    }, true);
  }

  window.BFSound = {
    jump: jump, tick: tick, go: go, death: death, chat: chat, win: win,
    click: click, place: place, step: step, finish: finish, type: type,
    isOn: function () { return on; }, setOn: setOn
  };
})();
