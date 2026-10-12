/* AIBROFIST — звук в игре отключён полностью по просьбе. Модуль остаётся
   (а не удалён из HTML), потому что переключатель звука в game.js
   (paintSoundBtn/BFSound.isOn()/setOn()) и вызовы BFSound.xxx() по всему
   сайту продолжают на него ссылаться — здесь просто ничего не проигрывается. */
(function () {
  'use strict';

  var KEY = 'bfSoundOn';
  var on = true;
  try { on = localStorage.getItem(KEY) !== '0'; } catch (e) {}

  function noop() {}

  function setOn(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
  }

  window.BFSound = {
    jump: noop, tick: noop, go: noop, death: noop, chat: noop, win: noop,
    click: noop, place: noop, step: noop, finish: noop, type: noop,
    land: noop, bounce: noop, checkpoint: noop, toggle: noop,
    roulSpin: noop, roulTick: noop, roulLand: noop,
    wheelClick: noop, wheelSpin: noop, coin: noop, drWin: noop,
    isOn: function () { return on; }, setOn: setOn
  };
})();
