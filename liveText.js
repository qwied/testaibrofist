/* ======= Живой текст на картах =======
   Текстовый объект карты может содержать метки в фигурных скобках — в
   игре вместо них видны данные, которые обновляются каждую секунду
   (берутся из /api/servers, см. serversInfo.js):
     {online} {race} {hide} {rooms}       — игроки и комнаты AIBROFIST
     {room1} … {room20}                   — комнаты, самые людные первыми
     {time}                               — время у игрока
   Метки без скобок или с опечаткой остаются как есть. Данные спрашиваем,
   только пока на экране есть хоть одна метка и вкладка видна. */
(function (root) {
  'use strict';

  var data = null, timer = null, usedAt = 0;
  var MODE = { race: 'Race', hideAndSeek: 'Hide and Seek' };
  var PHASE = { lobby: 'hiding', round: 'hunt', storyEnd: 'ended' };

  function poll() {
    // метки давно не рисовались (ушёл с карты) или вкладка скрыта — не спрашиваем
    if (Date.now() - usedAt > 5000) { clearInterval(timer); timer = null; return; }
    if (typeof document !== 'undefined' && document.hidden) return;
    fetch('/api/servers', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.aibrofist) data = d; })
      .catch(function () {});
  }
  function ensure() {
    usedAt = Date.now();
    if (timer || typeof fetch === 'undefined') return;
    poll();
    timer = setInterval(poll, 1000);
  }

  function two(n) { return (n < 10 ? '0' : '') + n; }
  function left(sec) { return Math.floor(sec / 60) + ':' + two(sec % 60); }

  function roomLine(r) {
    var s = (MODE[r.mode] || r.mode) + ' · ' + r.room + ' · ' + r.players + '/' + r.limit;
    if (r.phase) s += ' · ' + (PHASE[r.phase] || r.phase) + (r.secondsLeft !== null && r.secondsLeft !== undefined ? ' ' + left(r.secondsLeft) : '');
    if (r.map) s += ' · ' + r.map;
    return s;
  }
  // одна метка -> текст; null — метка не наша, оставить как есть
  function value(d, name, n, now) {
    var k = name.toLowerCase(), i = n ? parseInt(n, 10) : 0;
    if (k === 'time' && !n) { var t = now || new Date(); return two(t.getHours()) + ':' + two(t.getMinutes()) + ':' + two(t.getSeconds()); }
    var a = d && d.aibrofist;
    if (k === 'online' && !n) return a ? String(a.online) : '…';
    if (k === 'rooms' && !n) return a ? String(a.rooms) : '…';
    if (k === 'race' && !n) return a ? String(a.modes.race.players) : '…';
    if (k === 'hide' && !n) return a ? String(a.modes.hideAndSeek.players) : '…';
    if (k === 'room' && i >= 1 && i <= 20) {
      if (!a) return i === 1 ? 'loading…' : '';
      var r = a.list[i - 1];
      return r ? roomLine(r) : (i === 1 && !a.list.length ? 'No rooms right now' : '');
    }
    return null;
  }

  // d и now — для проверки без сети; в игре берутся живые данные
  function render(text, d, now) {
    return String(text).replace(/\{([a-zA-Z]+)(\d{0,2})\}/g, function (all, name, n) {
      var v = value(d, name, n, now);
      return v === null ? all : v;
    });
  }

  var api = {
    fill: function (text) {
      if (String(text).indexOf('{') === -1) return text;
      ensure();
      return render(text, data);
    },
    render: render
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BFLive = api;
})(this);
