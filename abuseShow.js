/* ======= AIBROFIST — показ шоу владельца =======
   Этот файл грузят все страницы и все игроки. Он ничего не умеет
   включать: только берёт с сервера текущее состояние шоу и показывает
   его. Управление живёт в панели владельца, которая обычному игроку не
   отдаётся вовсе.

   Наружу: window.BFShow.pull() — обновиться прямо сейчас. */
(function () {
  'use strict';

  var POLL = 3000;              // как часто сверяемся с сервером
  var ver = -1;                 // версия состояния, чтобы не пересобирать зря
  var weather = 'none', until = 0, lastShot = 0;
  var booms = [];               // сколько взрывов идёт прямо сейчас
  var coins = [];               // монеты, которые сыплются
  var media = [], layer = null;
  var audio = null, songUrl = null;
  var cv = null, cx = null, raf = 0, tick = 0;

  /* ---------- слои ----------
     Погода рисуется на холсте, а медиа — обычными элементами: холст
     берёт у гифки только первый кадр и глушит звук у видео. Оба слоя
     не ловят нажатия, поэтому играть во время шоу можно. */
  function ensureCanvas() {
    if (cv) return;
    cv = document.createElement('canvas');
    cv.style.cssText = 'position:fixed;inset:0;z-index:9998;pointer-events:none';
    document.body.appendChild(cv);
    cx = cv.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    if (!cv) return;
    var d = window.devicePixelRatio || 1;
    cv.width = Math.round(innerWidth * d);
    cv.height = Math.round(innerHeight * d);
    cv.style.width = innerWidth + 'px';
    cv.style.height = innerHeight + 'px';
    cx.setTransform(d, 0, 0, d, 0, 0);
  }
  function ensureLayer() {
    if (layer) return layer;
    layer = document.createElement('div');
    layer.style.cssText = 'position:fixed;inset:0;z-index:9997;pointer-events:none;overflow:hidden';
    document.body.appendChild(layer);
    return layer;
  }

  /* ---------- погода ---------- */
  var drops = [];
  function seed(n, kind) {
    drops.length = 0;
    for (var i = 0; i < n; i++)
      drops.push({
        x: Math.random() * innerWidth,
        y: Math.random() * innerHeight,
        v: kind === 'hail' ? 9 + Math.random() * 7
         : kind === 'snow' ? 0.7 + Math.random() * 1.1
         : 12 + Math.random() * 9,
        s: 0.6 + Math.random() * 0.9,
        d: Math.random() * 6.28
      });
  }
  function setWeather(kind, shotAt, count, till) {
    ensureCanvas();
    until = till || 0;
    count = Math.max(1, count || 1);

    if (kind === 'nuke' || kind === 'coins') {
      /* Пачка одноразовая: отыгрываем только новую, а не на каждый опрос.
         Иначе взрывы начинались бы заново каждые три секунды. */
      if (!shotAt || shotAt === lastShot) return;
      lastShot = shotAt;
      if (kind === 'nuke') fireNukes(count);
      else fireCoins(count);
      start();
      return;
    }

    weather = kind;
    if (kind === 'rain') seed(320, 'rain');
    else if (kind === 'hail') seed(190, 'hail');
    else if (kind === 'snow') seed(240, 'snow');
    else drops.length = 0;

    if (kind === 'rain' || kind === 'hail') { if (unlocked) rainOn(kind); else hint(true); }
    else rainOff();
    start();
  }

  /* Взрывы идут вразнобой по всей ширине и с разбегом по времени:
     сотня одновременных вспышек в одной точке — просто белый экран. */
  function fireNukes(n) {
    for (var i = 0; i < n; i++)
      booms.push({
        // первая всегда крупная и по центру: это атомная бомба, а не салют
        t: i === 0 ? 0 : -Math.round(20 + Math.random() * Math.min(300, n * 8)),
        x: i === 0 ? 0.5 : 0.1 + Math.random() * 0.8,
        y: i === 0 ? 0.82 : 0.66 + Math.random() * 0.2,
        s: i === 0 ? 1.35 : 0.5 + Math.random() * 0.7
      });
  }

  /* Дождь из монет. Монета рисуется так же, как в игре: золотой кружок
     со светлой каймой, и «переворачивается» по ширине. */
  /* Монету берём прямо из игры — coin.png, тот же файл, что лежит на
     карте. Рисованный кружок рядом с настоящей монетой смотрелся чужим. */
  var coinImg = null;
  function coinSprite() {
    if (coinImg) return coinImg;
    coinImg = new Image();
    coinImg.src = 'coin.png';
    return coinImg;
  }

  /* Тучки, из которых сыплются монеты. Монеты рождаются под ними, а не
     по всей ширине: так видно, откуда именно идёт дождь. */
  var clouds = [];
  function fireCoins(n) {
    coinSprite();
    var W = innerWidth;
    var cn = Math.max(1, Math.min(6, Math.round(n / 12) || 1));
    clouds.length = 0;
    for (var c = 0; c < cn; c++)
      clouds.push({
        x: W * (c + 0.5) / cn + (Math.random() - 0.5) * W * 0.12,
        y: 40 + Math.random() * 60,
        s: 0.8 + Math.random() * 0.6,
        life: 0
      });

    for (var i = 0; i < n; i++) {
      var cl = clouds[i % clouds.length];
      coins.push({
        x: cl.x + (Math.random() - 0.5) * 150 * cl.s,
        y: cl.y - Math.random() * 40 - i * 6,
        v: 3 + Math.random() * 4,
        r: 11 + Math.random() * 7,
        p: Math.random() * 6.28,
        sp: 0.06 + Math.random() * 0.08
      });
    }
  }

  function drawClouds() {
    if (!clouds.length) return;
    var alive = coins.length > 0;
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      c.life++;
      // появились, повисели и растаяли вместе с монетами
      var a = Math.min(1, c.life / 40) * (alive ? 1 : Math.max(0, 1 - (c.life % 1000) / 60));
      if (!alive && c.life > 60) continue;
      cx.globalAlpha = 0.85 * a;
      cx.fillStyle = '#e8eef7';
      var s = c.s;
      cx.beginPath();
      cx.ellipse(c.x, c.y, 70 * s, 26 * s, 0, 0, 6.2832);
      cx.ellipse(c.x - 42 * s, c.y + 6 * s, 40 * s, 20 * s, 0, 0, 6.2832);
      cx.ellipse(c.x + 44 * s, c.y + 5 * s, 44 * s, 21 * s, 0, 0, 6.2832);
      cx.ellipse(c.x + 6 * s, c.y - 16 * s, 44 * s, 24 * s, 0, 0, 6.2832);
      cx.fill();
      cx.globalAlpha = 0.5 * a;
      cx.fillStyle = '#c9d6e8';
      cx.beginPath();
      cx.ellipse(c.x, c.y + 16 * s, 74 * s, 12 * s, 0, 0, 6.2832);
      cx.fill();
    }
    cx.globalAlpha = 1;
    if (!alive && clouds.length && clouds[0].life > 60) clouds.length = 0;
  }

  function drawWeather() {
    var W = innerWidth, H = innerHeight, i, p;

    if (weather === 'rain' || weather === 'hail' || weather === 'snow') {
      for (i = 0; i < drops.length; i++) {
        p = drops[i];
        p.y += p.v;
        p.x += weather === 'snow' ? Math.sin(tick * 0.02 + p.d) * 0.8 : 1.2;
        if (p.y > H + 20) { p.y = -20; p.x = Math.random() * W; }
        if (p.x > W + 20) p.x = -20;
      }
    }

    if (weather === 'rain') {
      cx.strokeStyle = 'rgba(120,170,235,.55)';
      cx.lineWidth = 1.4;
      cx.beginPath();
      for (i = 0; i < drops.length; i++) {
        p = drops[i];
        cx.moveTo(p.x, p.y); cx.lineTo(p.x - 2, p.y + 14 * p.s);
      }
      cx.stroke();
      cx.fillStyle = 'rgba(40,70,110,.10)'; cx.fillRect(0, 0, W, H);
    }
    if (weather === 'hail') {
      cx.fillStyle = 'rgba(226,242,255,.92)';
      for (i = 0; i < drops.length; i++) {
        p = drops[i];
        cx.beginPath(); cx.arc(p.x, p.y, 2.4 * p.s + 1, 0, 6.2832); cx.fill();
      }
      cx.fillStyle = 'rgba(60,80,110,.12)'; cx.fillRect(0, 0, W, H);
    }
    if (weather === 'snow') {
      cx.fillStyle = 'rgba(255,255,255,.9)';
      for (i = 0; i < drops.length; i++) {
        p = drops[i];
        cx.beginPath(); cx.arc(p.x, p.y, 1.6 * p.s + 1, 0, 6.2832); cx.fill();
      }
    }
    if (weather === 'sun') {
      var g = cx.createRadialGradient(W * 0.8, H * 0.16, 10, W * 0.8, H * 0.16, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(255,236,160,.75)');
      g.addColorStop(0.35, 'rgba(255,214,110,.22)');
      g.addColorStop(1, 'rgba(255,200,90,0)');
      cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      cx.save();
      cx.translate(W * 0.8, H * 0.16);
      cx.rotate(tick * 0.002);
      cx.fillStyle = 'rgba(255,240,170,.16)';
      for (i = 0; i < 12; i++) {
        cx.rotate(6.2832 / 12);
        cx.beginPath(); cx.moveTo(0, 0);
        cx.lineTo(Math.max(W, H), -26); cx.lineTo(Math.max(W, H), 26);
        cx.closePath(); cx.fill();
      }
      cx.restore();
    }
    // взрывы: у каждого свой центр, размер и время жизни
    for (i = booms.length - 1; i >= 0; i--) {
      var b = booms[i];
      b.t++;
      if (b.t <= 0) continue;                 // ещё не начался
      if (b.t === 1) boomSound(Math.min(1, b.s));   // грохот ровно в момент вспышки
      if (b.t > 260) { booms.splice(i, 1); continue; }
      var t = b.t / 260;
      var ox = W * b.x, oy = H * b.y, k = b.s;

      if (t < 0.12) {
        cx.fillStyle = 'rgba(255,255,255,' + ((1 - t / 0.12) * k).toFixed(3) + ')';
        cx.fillRect(0, 0, W, H);
      }
      var r = t * Math.max(W, H) * 1.3 * k;
      cx.strokeStyle = 'rgba(255,190,90,' + Math.max(0, 0.7 - t).toFixed(3) + ')';
      cx.lineWidth = (10 * (1 - t) + 2) * k;
      cx.beginPath(); cx.arc(ox, oy, r, 0, 6.2832); cx.stroke();

      var gh = Math.min(1, t * 2.2), top = oy - gh * H * 0.6 * k;
      cx.fillStyle = 'rgba(255,150,60,' + Math.max(0, 0.85 - t * 0.7).toFixed(3) + ')';
      cx.beginPath();
      cx.moveTo(ox - 34 * k, oy); cx.lineTo(ox - 16 * k, top + 40 * k);
      cx.lineTo(ox + 16 * k, top + 40 * k); cx.lineTo(ox + 34 * k, oy);
      cx.closePath(); cx.fill();
      cx.beginPath();
      cx.ellipse(ox, top, (120 * gh + 20) * k, (58 * gh + 12) * k, 0, 0, 6.2832); cx.fill();
      cx.fillStyle = 'rgba(255,220,120,' + Math.max(0, 0.5 - t).toFixed(3) + ')';
      cx.beginPath();
      cx.ellipse(ox, top - 8 * k, (80 * gh + 10) * k, (34 * gh + 8) * k, 0, 0, 6.2832); cx.fill();
      cx.fillStyle = 'rgba(120,60,30,' + Math.max(0, (0.28 - t * 0.28) * k * 0.6).toFixed(3) + ')';
      cx.fillRect(0, 0, W, H);
    }

    drawClouds();

    // монеты: падают, покачиваются и пропадают за нижним краем
    var img = coins.length ? coinSprite() : null;
    var ready = img && img.complete && img.naturalWidth;
    for (i = coins.length - 1; i >= 0; i--) {
      var c = coins[i];
      c.y += c.v;
      c.p += c.sp;
      if (c.y > H + 40) { coins.splice(i, 1); continue; }
      var w = Math.abs(Math.cos(c.p)) * c.r + 2;     // «переворот» по ширине
      if (ready) {
        cx.drawImage(img, c.x - w, c.y - c.r, w * 2, c.r * 2);
      } else {
        // картинка ещё не загрузилась — рисуем кружок, чтобы не мигало
        cx.fillStyle = '#f5b62b';
        cx.beginPath(); cx.ellipse(c.x, c.y, w, c.r, 0, 0, 6.2832); cx.fill();
      }
    }
  }

  /* ---------- летающее медиа ---------- */
  function rebuildMedia(list) {
    for (var i = 0; i < media.length; i++) {
      try { if (media[i].el.pause) media[i].el.pause(); } catch (e) {}
      media[i].el.remove();
    }
    media.length = 0;
    if (!list || !list.length) return;
    ensureLayer();
    for (i = 0; i < list.length; i++) add(list[i]);
    start();
  }
  function add(m) {
    var el;
    if (m.kind === 'video') {
      el = document.createElement('video');
      el.autoplay = true; el.loop = true; el.playsInline = true;
      el.muted = !m.sound;
      el.src = m.url;
      el.play().catch(function () {
        /* Со звуком не пустили. Показываем немым, чтобы картинка всё же
           шла, и включаем звук, как только игрок коснётся страницы. */
        el.muted = true;
        el.play().catch(function () {});
        if (m.sound) waitForGesture(el);
      });
    } else {
      el = document.createElement('img');
      el.src = m.url;
    }
    /* Не загрузилось — выбрасываем. Иначе на экране висел бы пустой
       прямоугольник, а цикл двигал бы его до конца шоу. */
    el.onerror = function () { drop(el); };
    /* «Во весь экран» считает каждый игрок у себя: ширина окна у всех
       разная, и подставлять сюда число с экрана владельца бессмысленно. */
    var size = m.full ? Math.max(innerWidth, innerHeight) : m.s;
    el.style.cssText = 'position:absolute;left:0;top:0;width:' + size + 'px;height:auto;'
      + 'will-change:transform' + (m.full ? ';object-fit:cover' : '');
    layer.appendChild(el);

    var W = innerWidth, H = innerHeight;
    var o = { el: el, dir: m.dir, v: m.v, s: size, x: 0, y: 0 };
    m = { dir: m.dir, s: size };
    if (m.dir === 'right') { o.x = -m.s; o.y = Math.random() * Math.max(1, H - m.s); }
    if (m.dir === 'left')  { o.x = W;    o.y = Math.random() * Math.max(1, H - m.s); }
    if (m.dir === 'down')  { o.y = -m.s; o.x = Math.random() * Math.max(1, W - m.s); }
    if (m.dir === 'up')    { o.y = H;    o.x = Math.random() * Math.max(1, W - m.s); }
    media.push(o);
  }
  /* Монеты можно ловить пальцем или мышью. Слой не перехватывает
     нажатия, поэтому слушаем на документе: попал по монете — она
     исчезает, не попал — нажатие уходит игре как обычно. */
  var reward = false;
  function catchCoin(ev) {
    if (!coins.length) return;
    var x = ev.clientX, y = ev.clientY;
    for (var i = coins.length - 1; i >= 0; i--) {
      var c = coins[i];
      var dx = x - c.x, dy = y - c.y;
      if (dx * dx + dy * dy > (c.r + 14) * (c.r + 14)) continue;
      coins.splice(i, 1);
      coinSound();
      if (reward) {
        fetch('/abuse/coin', { method: 'POST', credentials: 'same-origin' })
          .then(function (r) { return r.json(); })
          .then(function (r) {
            if (r.status === 'success' && window.BFShell && BFShell.refreshCoins)
              BFShell.refreshCoins(r.coins);
          })
          .catch(function () {});
      }
      return;
    }
  }

  function drop(el) {
    for (var i = media.length - 1; i >= 0; i--)
      if (media[i].el === el) { media.splice(i, 1); break; }
    el.remove();
  }

  function moveMedia() {
    var W = innerWidth, H = innerHeight;
    for (var i = 0; i < media.length; i++) {
      var o = media[i];
      if (o.dir === 'right') o.x += o.v;
      if (o.dir === 'left')  o.x -= o.v;
      if (o.dir === 'down')  o.y += o.v;
      if (o.dir === 'up')    o.y -= o.v;
      var h = o.el.offsetHeight || o.s;
      if (o.x > W)    o.x = -o.s;
      if (o.x < -o.s) o.x = W;
      if (o.y > H)    o.y = -h;
      if (o.y < -h)   o.y = H;
      o.el.style.transform = 'translate(' + Math.round(o.x) + 'px,' + Math.round(o.y) + 'px)';
    }
  }

  /* ---------- звуки погоды ----------
     Файлов нет и не нужно: шум дождя и грохот взрыва собираются прямо в
     браузере из белого шума и низкого тона. Так ничего не грузится и
     звук не зависит от связи. */
  var actx = null, rainNode = null, rainGain = null, noiseBuf = null;

  /* Контекст, созданный до первого касания, засыпает и сам не
     просыпается. Раньше его будили только в момент касания: если звук
     понадобился позже, контекст создавался уже спящим и оставался
     немым — отсюда «звуков нет». Теперь будим при каждом обращении. */
  function audioCtx() {
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    if (!actx) actx = new C();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function noise() {
    var a = audioCtx();
    if (!a) return null;
    if (noiseBuf) return noiseBuf;
    var n = a.sampleRate * 2;
    noiseBuf = a.createBuffer(1, n, a.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  /* Дождь и град: тот же шум, разный фильтр. У града срез выше, поэтому
     он звучит колко, а дождь глухо. */
  function rainOn(kind) {
    var a = audioCtx();
    if (!a || rainNode) return;
    var src = a.createBufferSource();
    src.buffer = noise();
    src.loop = true;
    var flt = a.createBiquadFilter();
    flt.type = kind === 'hail' ? 'highpass' : 'lowpass';
    flt.frequency.value = kind === 'hail' ? 2600 : 1100;
    rainGain = a.createGain();
    rainGain.gain.value = 0;
    src.connect(flt); flt.connect(rainGain); rainGain.connect(a.destination);
    src.start();
    rainNode = src;
    rainGain.gain.linearRampToValueAtTime(kind === 'hail' ? 0.10 : 0.14, a.currentTime + 1.2);
  }
  function rainOff() {
    if (!rainNode || !actx) return;
    var g = rainGain, n = rainNode;
    rainNode = null; rainGain = null;
    try {
      g.gain.linearRampToValueAtTime(0, actx.currentTime + 0.7);
      setTimeout(function () { try { n.stop(); } catch (e) {} }, 900);
    } catch (e) {}
  }

  /* Взрыв: короткий удар шумом с быстрым спадом плюс низкий тон,
     съезжающий вниз. Громкость зависит от размера конкретного взрыва. */
  /* Взрыв атомной бомбы: резкий удар, за ним долгий раскат, который
     уезжает в инфразвук. Крупный взрыв звучит дольше и ниже мелкого. */
  function boomSound(scale) {
    var a = audioCtx();
    if (!a) return;
    var t = a.currentTime;
    var len = 1.4 + 1.6 * scale;

    // удар: шум с быстрым спадом и опускающимся срезом
    var src = a.createBufferSource();
    src.buffer = noise();
    var flt = a.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(2600, t);
    flt.frequency.exponentialRampToValueAtTime(90, t + len * 0.8);
    var g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6 * scale, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(flt); flt.connect(g); g.connect(a.destination);
    src.start(t); src.stop(t + len + 0.1);

    // раскат: низкий тон, съезжающий почти в инфразвук
    var osc = a.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(22, t + len * 0.75);
    var og = a.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.5 * scale, t + 0.04);
    og.gain.exponentialRampToValueAtTime(0.0001, t + len * 0.9);
    osc.connect(og); og.connect(a.destination);
    osc.start(t); osc.stop(t + len);

    // эхо: тот же шум тише и позже, отсюда ощущение простора
    var e = a.createBufferSource();
    e.buffer = noise();
    var ef = a.createBiquadFilter();
    ef.type = 'lowpass'; ef.frequency.value = 400;
    var eg = a.createGain();
    eg.gain.setValueAtTime(0.0001, t + 0.35);
    eg.gain.exponentialRampToValueAtTime(0.2 * scale, t + 0.45);
    eg.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.6);
    e.connect(ef); ef.connect(eg); eg.connect(a.destination);
    e.start(t + 0.35); e.stop(t + len + 0.7);
  }

  // короткий звонкий блик, когда поймал монету
  function coinSound() {
    var a = audioCtx();
    if (!a) return;
    var t = a.currentTime;
    var o = a.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(1760, t + 0.09);
    var g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + 0.25);
  }

  /* ---------- звук ----------
     Браузер не даёт включить звук, пока игрок хоть раз не нажал на
     страницу. Поэтому всё, что не запустилось, копится здесь и
     доигрывается с первого же касания или нажатия клавиши. Ждать
     приходится и музыке, и видео: раньше видео просто уходило в немой
     режим навсегда, и звука у игрока не было вообще. */
  var waiting = [], unlocked = false;

  /* Разрешение на звук берём заранее, на первом же действии игрока —
     не дожидаясь, пока шоу включат. Игрок и так постоянно жмёт: заходит
     в комнату, трогает управление. К моменту, когда владелец врубит
     музыку, звук обычно уже разрешён, и она заиграет сразу. */
  function armUnlock() {
    ['pointerdown', 'touchstart', 'keydown', 'click'].forEach(function (ev) {
      document.addEventListener(ev, kick, { capture: true, passive: true });
    });
  }
  function disarm() {
    ['pointerdown', 'touchstart', 'keydown', 'click'].forEach(function (ev) {
      document.removeEventListener(ev, kick, { capture: true });
    });
  }

  function waitForGesture(el) {
    if (waiting.indexOf(el) === -1) waiting.push(el);
    if (unlocked) { kick(); return; }
    hint(true);
  }

  function kick() {
    unlocked = true;
    disarm();
    hint(false);
    // WebAudio тоже спит до первого действия — будим вместе с остальным
    var a = audioCtx();
    if (a && a.state === 'suspended') a.resume();
    if (weather === 'rain' || weather === 'hail') rainOn(weather);
    var list = waiting.slice();
    waiting.length = 0;
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      el.muted = false;
      el.play().catch(function () {});
    }
  }

  /* Если звук всё-таки ждёт, честно говорим об этом одной строкой в углу.
     Исчезает от любого касания — того самого, которое и включает звук. */
  var hintBox = null;
  function hint(on) {
    if (!on) { if (hintBox) { hintBox.remove(); hintBox = null; } return; }
    if (hintBox) return;
    hintBox = document.createElement('div');
    hintBox.textContent = 'Нажмите на экран, чтобы включить звук';
    hintBox.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);'
      + 'z-index:10001;padding:8px 14px;border-radius:20px;background:rgba(15,23,42,.88);'
      + 'color:#fff;font:600 12.5px system-ui,sans-serif;pointer-events:none;'
      + 'box-shadow:0 4px 16px rgba(0,0,0,.2)';
    document.body.appendChild(hintBox);
  }
  function setSong(song) {
    var url = song ? song.url : null;
    if (url === songUrl) { if (audio && song) audio.volume = song.vol; return; }
    songUrl = url;
    if (audio) { try { audio.pause(); } catch (e) {} audio = null; }
    if (!url) return;
    audio = new Audio(url);
    audio.loop = true;
    audio.volume = song.vol;
    audio.play().catch(function () { waitForGesture(audio); });
  }

  /* ---------- цикл ---------- */
  function loop() {
    raf = 0;
    tick++;
    if (document.hidden) { setTimeout(start, 400); return; }   // вкладка не видна — не рисуем
    // время вышло — гасим сами, не дожидаясь команды
    if (until && Date.now() > until) {
      weather = 'none'; until = 0; drops.length = 0; rainOff();
    }
    if (cx) { cx.clearRect(0, 0, innerWidth, innerHeight); drawWeather(); }
    moveMedia();
    if (weather !== 'none' || media.length || booms.length || coins.length || clouds.length) start();
  }
  function start() { if (!raf) raf = requestAnimationFrame(loop); }

  /* ---------- опрос сервера ---------- */
  function apply(d) {
    if (!d || d.v === ver) return;
    ver = d.v;
    reward = !!d.reward;
    setWeather(d.weather || 'none', d.shotAt || 0, d.count || 1, d.until || 0);
    rebuildMedia(d.media);
    setSong(d.song || null);
  }
  function pull() {
    fetch('/abuse/state', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(apply)
      .catch(function () {});
  }

  function boot() {
    armUnlock();
    document.addEventListener('pointerdown', catchCoin, { passive: true });
    pull();
    setInterval(pull, POLL);
    /* Вернулся на вкладку — сверяемся сразу, а не ждём следующий опрос:
       иначе игрок несколько секунд смотрел бы на прошлое шоу. */
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { pull(); start(); }
    });
    window.addEventListener('focus', pull);
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.BFShow = { pull: pull };
})();
