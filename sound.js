/* AIBROFIST — короткие игровые звуки без файлов. Тон-генератор поверх
   Web Audio API, тем же приёмом, что и звук дождя в abuseShow.js: ничего
   не грузится, ничего не зависит от связи, работает на любом устройстве.
   Игрок может выключить звук — настройка живёт в localStorage. */
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
    var vol = opt.volume === undefined ? 0.18 : opt.volume;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain); gain.connect(a.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }

  function jump()  { tone(520, 0.12, { type: 'square',   endFreq: 780, volume: 0.14 }); }
  function tick()  { tone(880, 0.07, { type: 'sine',                   volume: 0.12 }); }
  function go()    { tone(660, 0.18, { type: 'triangle', endFreq: 990, volume: 0.2  }); }
  function death() { tone(220, 0.35, { type: 'sawtooth', endFreq: 55,  volume: 0.2  }); }
  function chat()  { tone(1180, 0.06, { type: 'sine',                  volume: 0.09 }); }
  // короткое восходящее арпеджио из трёх нот
  function win() {
    tone(523, 0.14, { type: 'triangle', volume: 0.2  });
    tone(659, 0.14, { type: 'triangle', volume: 0.2,  delay: 0.11 });
    tone(784, 0.22, { type: 'triangle', volume: 0.22, delay: 0.22 });
  }

  function setOn(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
  }

  window.BFSound = {
    jump: jump, tick: tick, go: go, death: death, chat: chat, win: win,
    isOn: function () { return on; }, setOn: setOn
  };
})();
