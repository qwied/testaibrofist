/* ======= Игровой слой AIBrofist =======
   Работает поверх движка редактора (window.GAME).
   Режимы: hideAndSeek, race. */
(function () {
  'use strict';

  /* Мост движка забираем один раз при загрузке. Из window его убирают
     сразу после load, чтобы объекты карты нельзя было менять из консоли
     браузера — сюда ссылка уже попала и работает как раньше. */
  var GAME = window.GAME;
  if (!GAME) return;

  var q      = new URLSearchParams(location.search);
  var MODE   = q.get('mode') || 'hideAndSeek';
  var ROOM   = q.get('room') || null;
  var VIEW   = q.get('view');                 // просмотр одной карты из Maps Browser
  var VAUTH  = q.get('author');

  var ROUND_MS  = 120000;   // раунд — 2 минуты
  var LOBBY_MS  = 30000;    // ожидание в Hide and Seek — 30 секунд

  var COLOR_NORMAL = '#111827';
  var COLOR_SEEKER = '#1e6fe0';   // искатель — синий
  var COLOR_CAUGHT = '#f97316';   // пойманный — оранжевый

  var me = { name: '', role: 'hider', caught: false };

  // гостю выдаётся постоянный на сессию ник вида Bro_7K
  function guestName() {
    var n = sessionStorage.getItem('bfGuest');
    if (n) return n;
    var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    n = 'Bro_' + A[Math.floor(Math.random() * A.length)] + A[Math.floor(Math.random() * A.length)];
    sessionStorage.setItem('bfGuest', n);
    return n;
  }
  var others = {};

  /* ---------- сглаживание чужих игроков ----------
     Сервер шлёт один кадр на комнату 20 раз в секунду. Позицию не
     применяем сразу: складываем в буфер с меткой времени, а рисуем чуть
     «в прошлом», интерполируя между двумя соседними кадрами. Именно это
     убирает рывки: между пакетами игрок не догоняет цель скачком, а едет
     по прямой между двумя известными точками. */
  var byNid = {};                 // короткий номер игрока -> запись в others
  var INTERP_MIN = 32, INTERP_MAX = 150;
  var interp = 60;                // насколько отстаём от последнего кадра, мс
  var lastSnapAt = 0, gapAvg = 50, gapPeak = 50;
  var pingMs = 0;

  function nowMs() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function bindNid(o) { if (o && o.nid !== undefined) byNid[o.nid] = o; }

  // картинка скина весит сотни килобайт, по сети её не гоняем — берём
  // адрес и вид (kind) из кеша по нику (см. imgOf/askImgs выше)
  function patchSkinFromCache(o) {
    if (!o || !o.skin) return;
    var pic = imgOf(o.name);
    if (pic) o.skin.img = pic;
    o.skin.kind = kindCache[o.name] || o.skin.kind || 'full';
  }

  /* Что сервер уже знает об игроке — берём сразу из списка комнаты, не
     дожидаясь кадра: и позицию (иначе новичок увидел бы всех в левом
     верхнем углу), и скин, и размер с цветом. */
  function applyKnown(o, pos) {
    if (!o || !pos) return;
    if (!o.buf) {
      o.x = o.tx = pos.x || 0;
      o.y = o.ty = pos.y || 0;
    }
    if (pos.w) { o.w = pos.w; o.h = pos.h; }
    if (pos.color) o.color = pos.color;
    if (pos.fin !== undefined) o.fin = !!pos.fin;
    if (pos.hid !== undefined) o.hid = !!pos.hid;
    if (pos.sk) {
      o.skin = strToSkin(pos.sk);
      patchSkinFromCache(o);
    }
  }

  /* Буфер подстраивается под сеть: на ровном канале сжимается почти до
     интервала кадров, на дёрганом растягивается, чтобы движение осталось
     гладким. Отставание всегда минимальное из возможных для этой связи.
     Сервер шлёт 30 кадров/с, поэтому даже минимум (32 мс) — уже между
     соседними кадрами: чужие едут практически без задержки. */
  function noteSnapshot(t) {
    if (lastSnapAt) {
      var gap = t - lastSnapAt;
      if (gap < 2000) {
        gapAvg = gapAvg * 0.85 + gap * 0.15;
        /* Пик забывается быстрее, чем в v99: после единого рывка сети
           отставание чужих игроков возвращается к минимуму за секунду,
           а не тянется несколько секунд. */
        gapPeak = Math.max(gapAvg, gapPeak * 0.9, gap);
        interp = Math.max(INTERP_MIN, Math.min(INTERP_MAX, gapPeak + 12));
      }
    }
    lastSnapAt = t;
  }

  function pushSnap(o, t, x, y) {
    o.buf = o.buf || [];
    o.buf.push({ t: t, x: x, y: y });
    if (o.buf.length > 10) o.buf.shift();
    o.tx = x; o.ty = y;
  }

  /* Где игрок находится в момент rt. Между двумя кадрами — прямая; если
     следующий кадр опоздал, коротко продолжаем по последней скорости (не
     больше 120 мс), чтобы движение не замирало из-за одного потерянного
     пакета. */
  function sample(o, rt) {
    var b = o.buf;
    if (!b || !b.length) return null;
    if (b.length === 1) return b[0];
    var last = b[b.length - 1];
    // вкладка была свёрнута — не доигрываем старое, показываем как есть
    if (rt - last.t > 500) return last;
    for (var i = b.length - 1; i > 0; i--) {
      var a = b[i - 1], c = b[i];
      if (a.t <= rt && rt <= c.t) {
        var k = (rt - a.t) / Math.max(1, c.t - a.t);
        return { x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k };
      }
    }
    if (rt > last.t) {
      var prevS = b[b.length - 2];
      var span = Math.max(1, last.t - prevS.t);
      var d = Math.min(rt - last.t, 120);
      return { x: last.x + (last.x - prevS.x) * d / span,
               y: last.y + (last.y - prevS.y) * d / span };
    }
    return b[0];
  }

  var currentMap = null;
  var socket = null;
  var phase = 'loading';        // loading | lobby | round | over | dev
  var phaseEnds = 0;

  // ---------- разметка поверх движка ----------
  var css = ''
    + '#gTop{position:fixed;top:0;left:0;right:0;z-index:60;display:flex;gap:12px;align-items:center;'
    + 'padding:7px 12px;background:rgba(255,255,255,.9);font:13px sans-serif;flex-wrap:wrap}'
    + '#gTop b{color:#2196F3}'
    + '#gExit{margin-left:auto;background:#fff;color:#111827;border:1px solid #d7dee7;padding:7px 13px;'
    + 'border-radius:8px;cursor:pointer;font-weight:bold;box-shadow:0 8px 20px -12px rgba(15,23,42,.35)}'
    + '#gExit:active{background:#f2f7fd}'
    + '#gSound{background:#fff;color:#111827;border:1px solid #d7dee7;width:32px;height:32px;'
    + 'border-radius:8px;cursor:pointer;font-size:15px;line-height:1;padding:0;'
    + 'display:flex;align-items:center;justify-content:center}'
    + '#gSound svg{width:17px;height:17px;display:block;pointer-events:none}'
    + '#gSound:active{background:#f2f7fd}'
    + '#gMap{position:fixed;right:12px;bottom:12px;z-index:60;background:rgba(255,255,255,.92);'
    + 'border:1px solid #d7dee7;border-radius:9px;padding:8px 13px;font:12.5px sans-serif;max-width:46vw}'
    + '#gMap .n{font-weight:bold;color:#111827;word-break:break-word}'
    + '#gMap .a{color:#6b7280;margin-top:2px}'
    + '#gMap .rate{margin-top:7px;display:flex;gap:6px;align-items:center}'
    + '#gMap .rate button{border:1px solid #2196F3;background:#fff;color:#2196F3;border-radius:5px;'
    + 'padding:4px 11px;cursor:pointer;font-size:13px}'
    + '#gBanner{position:fixed;inset:0;z-index:70;display:none;align-items:center;justify-content:center;'
    + 'flex-direction:column;gap:9px;background:rgba(255,255,255,.93);font:16px sans-serif;text-align:center;padding:24px}'
    + '#gBanner h2{margin:0;font-size:25px}'
    + '#gBanner p{margin:0;color:#6b7280;max-width:420px}'
    + '#gChat{position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0}'
    + '#gMsg{width:1px}'
    + '#gTalk{display:none;position:fixed;right:14px;top:50%;transform:translateY(-50%);z-index:61;'
    + 'width:52px;height:52px;border-radius:50%;border:1px solid #d7dee7;background:#fff;'
    + 'color:#2196F3;cursor:pointer;padding:0;align-items:center;justify-content:center;'
    + 'box-shadow:0 8px 20px -10px rgba(15,23,42,.45)}'
    + '#gTalk:active{background:#f2f7fd}'
    + '#gTalk svg{width:24px;height:24px;display:block;pointer-events:none}'
    + 'html.is-mobile #gTalk,html.is-tablet #gTalk{display:flex}'
    + 'html.is-mobile #gTalk,html.is-tablet #gTalk{width:58px;height:58px;touch-action:manipulation}'
    + 'html.is-mobile #gTalk svg,html.is-tablet #gTalk svg{width:26px;height:26px}'
    // на телефоне: шапка компактнее, карточка карты уходит наверх, чтобы не мешать кнопкам
    + 'html.is-mobile #gTop,html.is-tablet #gTop{padding:5px 9px;gap:8px;font-size:12px}'
    + 'html.is-mobile #gExit,html.is-tablet #gExit{padding:9px 14px;font-size:13px}'
    + 'html.is-mobile #gMap,html.is-tablet #gMap{bottom:auto;top:46px;right:8px;max-width:56vw;'
    + 'padding:6px 10px;font-size:11.5px}'
    /* твой шанс стать искателем — плашка в правом верхнем углу */
    + '#gChance{position:fixed;top:52px;z-index:61;display:none;pointer-events:none;'
    + 'background:rgba(15,23,42,.86);color:#dbe6f7;border-radius:9px;padding:6px 11px;'
    + 'font:600 12.5px sans-serif;box-shadow:0 8px 20px -12px rgba(0,0,0,.7);'
    + 'right:calc(12px + env(safe-area-inset-right,0px))}'
    + '#gChance b{color:#60a5fa;font-size:14.5px;margin-left:5px}'
    + 'html.is-mobile #gChance,html.is-tablet #gChance{top:44px;font-size:11.5px;'
    + 'padding:5px 9px;right:calc(8px + env(safe-area-inset-right,0px))}'
    + 'html.is-mobile #gChance b,html.is-tablet #gChance b{font-size:13px}'
    + 'html.is-mobile #gBanner h2,html.is-tablet #gBanner h2{font-size:20px}'
    + 'html.is-mobile #gBanner p,html.is-tablet #gBanner p{font-size:14px}'
    /* безопасные зоны iPhone (чёлка/жесты): в альбомной панели прижимаются
       к краям, env() не поддерживается — строка игнорируется, остаётся базовая */
    + '#gTop{padding-left:calc(12px + env(safe-area-inset-left,0px));'
    + 'padding-right:calc(12px + env(safe-area-inset-right,0px))}'
    + '#gTalk{right:calc(14px + env(safe-area-inset-right,0px));touch-action:manipulation}'
    + '#gMap{right:calc(12px + env(safe-area-inset-right,0px))}'
    + 'html.is-mobile #gMap,html.is-tablet #gMap{right:calc(8px + env(safe-area-inset-right,0px))}'
    // у мобильной шапки падинг компактнее — безопасные зоны добавляем к нему же
    + 'html.is-mobile #gTop,html.is-tablet #gTop{padding-left:calc(9px + env(safe-area-inset-left,0px));'
    + 'padding-right:calc(9px + env(safe-area-inset-right,0px))}'
    /* --- рулетка искателя (прятки): компактная плашка в правом верхнем
           углу — там же, где потом встанет «Твой шанс». Лента ников едет
           под ней и тормозит на победителе; карточек и скинов больше нет.
           Плашка не ловит нажатия — кнопки игры под ней работают. --- */
    + '#gRoul{position:fixed;top:52px;z-index:200;display:none;pointer-events:none;'
    + 'right:calc(12px + env(safe-area-inset-right,0px));'
    + 'background:rgba(15,23,42,.86);border-radius:9px;padding:8px 0;'
    + 'box-shadow:0 8px 20px -12px rgba(0,0,0,.7);width:150px;overflow:hidden;'
    + 'text-align:center;-webkit-user-select:none;user-select:none;'
    + '-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 14%,#000 86%,transparent 100%);'
    + 'mask-image:linear-gradient(90deg,transparent 0,#000 14%,#000 86%,transparent 100%)}'
    + '#gRoul.on{display:block}'
    + '#gRoulTrack{display:flex;align-items:center;will-change:transform}'
    + '.rName{flex:0 0 auto;width:150px;padding:2px 10px;white-space:nowrap;overflow:hidden;'
    + 'text-overflow:ellipsis;color:#dbe6f7;font:700 14px/1.3 sans-serif}'
    + '.rName.rWin{color:#60a5fa}'
    + '#gRoulRes{margin-top:4px;text-align:center;color:#fff;font:700 12.5px sans-serif;'
    + 'min-height:1.3em;opacity:0;transition:opacity .3s}'
    + '#gRoulRes.on{opacity:1}'
    // стопка плашек друг под другом и под шапкой считается в JS (relayoutCorner) —
    // шапка сама может перенестись на вторую строку, фиксированный отступ её не учитывал
    + 'html.is-mobile #gRoul,html.is-tablet #gRoul{top:44px;width:130px;'
    + 'right:calc(8px + env(safe-area-inset-right,0px))}'
    + 'html.is-mobile .rName,html.is-tablet .rName{width:130px;font-size:12.5px}'
    /* --- табличка очков забега (Race), левый верхний угол: кнопка-иконка
           раскрывает список всех в комнате, кто выше в Scores — тот выше
           в списке. Только для режима Race, вне редактора. --- */
    + '#gScoresBtn{display:none;position:fixed;top:52px;left:12px;z-index:61;'
    + 'height:38px;padding:0 14px;background:rgba(255,255,255,.92);color:#111827;'
    + 'border:1px solid #d7dee7;border-radius:9px;cursor:pointer;font:700 12.5px sans-serif;'
    + 'line-height:38px;white-space:nowrap;'
    + 'box-shadow:0 8px 20px -12px rgba(15,23,42,.35)}'
    + '#gScoresBtn:active{background:#f2f7fd}'
    + '#gScoresPanel{display:none;position:fixed;top:96px;left:12px;z-index:61;min-width:150px;'
    + 'max-width:200px;max-height:27vh;overflow-y:auto;background:rgba(255,255,255,.96);'
    + 'border:1px solid #d7dee7;border-radius:9px;padding:8px 10px;font:12px sans-serif;'
    + 'box-shadow:0 8px 20px -12px rgba(15,23,42,.45)}'
    + '#gScoresPanel.on{display:block}'
    + '#gScoresPanel h4{margin:0 0 6px;font-size:11px;color:#8b93a1;text-transform:uppercase;letter-spacing:.03em}'
    + '.gScoreRow{display:flex;justify-content:space-between;gap:12px;padding:3px 0;color:#191919}'
    + '.gScoreRow.me{font-weight:bold;color:#2196F3}'
    + '.gScoreRow b{color:#e2a600;flex:0 0 auto}'
    + '.gScoreN{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '#gScoresEmpty{color:#8b93a1}'
    + 'html.is-mobile #gScoresBtn,html.is-tablet #gScoresBtn{top:44px}'
    + 'html.is-mobile #gScoresPanel,html.is-tablet #gScoresPanel{top:88px}'
    /* --- личные сообщения (Messages) прямо в игре, левый нижний угол:
           та же переписка, что и на messages.html, чтобы не выходить
           из матча ради ответа. Во всех режимах, не только в Race. --- */
    + '#gMsgsBtn{display:none;position:fixed;bottom:14px;left:12px;z-index:61;'
    + 'width:44px;height:44px;padding:0;background:rgba(255,255,255,.92);color:#2196F3;'
    + 'border:1px solid #d7dee7;border-radius:50%;cursor:pointer;line-height:1;'
    + 'align-items:center;justify-content:center;'
    + 'box-shadow:0 8px 20px -12px rgba(15,23,42,.4)}'
    + '#gMsgsBtn svg{width:20px;height:20px;display:block;pointer-events:none}'
    + '#gMsgsBtn:active{background:#f2f7fd}'
    + '#gMsgsBadge{display:none;position:fixed;bottom:41px;left:39px;z-index:62;min-width:16px;'
    + 'height:16px;padding:0 3px;border-radius:9px;background:#ef4444;color:#fff;'
    + 'font:700 10px/16px sans-serif;text-align:center;pointer-events:none}'
    + '#gMsgsBadge.on{display:block}'
    + '#gMsgsPanel{display:none;flex-direction:column;position:fixed;bottom:64px;left:12px;z-index:61;'
    + 'width:280px;max-width:calc(100vw - 24px);height:360px;max-height:60vh;'
    + 'background:rgba(255,255,255,.98);border:1px solid #d7dee7;border-radius:12px;overflow:hidden;'
    + 'box-shadow:0 10px 30px -12px rgba(15,23,42,.5);font:13px sans-serif}'
    + '#gMsgsPanel.on{display:flex}'
    + '#gMsgsHead{display:flex;align-items:center;gap:6px;padding:9px 11px;'
    + 'border-bottom:1px solid #eef1f5;font-weight:700;color:#191919;flex:0 0 auto}'
    + '#gMsgsBack{display:none;border:none;background:none;color:#2196F3;cursor:pointer;'
    + 'font-size:14px;font-weight:700;padding:0}'
    + '#gMsgsBack.on{display:inline}'
    + '#gMsgsTitle{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}'
    + '#gMsgsNewBtn{border:none;background:none;color:#2196F3;cursor:pointer;font-size:18px;'
    + 'line-height:1;padding:0 2px}'
    + '#gMsgsList{flex:1;overflow-y:auto}'
    + '.gMsgsRow{display:block;width:100%;text-align:left;padding:8px 11px;border:none;'
    + 'background:none;cursor:pointer;border-bottom:1px solid #f3f5f8;color:#191919}'
    + '.gMsgsRow:active{background:#f7f9fb}'
    + '.gMsgsRowName{font-weight:700;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.gMsgsRowPrev{font-size:11.5px;color:#8b93a1;overflow:hidden;text-overflow:ellipsis;'
    + 'white-space:nowrap;margin-top:1px}'
    + '.gMsgsDot{display:inline-block;min-width:15px;height:15px;border-radius:8px;background:#2196F3;'
    + 'color:#fff;font:700 10px/15px sans-serif;text-align:center;margin-left:5px;padding:0 3px}'
    + '#gMsgsEmpty{padding:16px 11px;color:#8b93a1;text-align:center;font-size:12.5px}'
    + '#gMsgsThread{display:none;flex-direction:column;flex:1;min-height:0}'
    + '#gMsgsThread.on{display:flex}'
    + '#gMsgsBody{flex:1;overflow-y:auto;padding:9px 11px;display:flex;flex-direction:column;gap:6px}'
    + '.gMsgsBubble{max-width:82%;padding:6px 10px;border-radius:12px;font-size:12.5px;'
    + 'line-height:1.3;word-break:break-word}'
    + '.gMsgsBubble.me{align-self:flex-end;background:#2196F3;color:#fff;border-bottom-right-radius:3px}'
    + '.gMsgsBubble.them{align-self:flex-start;background:#f0f3f7;color:#191919;border-bottom-left-radius:3px}'
    + '#gMsgsSend{display:flex;gap:6px;padding:8px;border-top:1px solid #eef1f5;flex:0 0 auto}'
    + '#gMsgsInput{flex:1;font-size:13px;padding:7px 9px;border:1px solid #d7dee7;border-radius:8px;min-width:0}'
    + '#gMsgsSendBtn{padding:7px 12px;border-radius:8px;border:1px solid #2196F3;background:#2196F3;'
    + 'color:#fff;cursor:pointer;font-weight:700;font-size:12.5px}'
    + '#gMsgsNewRow{display:none;gap:6px;padding:8px 11px;border-bottom:1px solid #eef1f5;flex:0 0 auto}'
    + '#gMsgsNewRow.on{display:flex}'
    + '#gMsgsNewInput{flex:1;font-size:13px;padding:7px 9px;border:1px solid #d7dee7;border-radius:8px;min-width:0}'
    + '#gMsgsNewOk{padding:7px 12px;border-radius:8px;border:1px solid #2196F3;background:#2196F3;'
    + 'color:#fff;cursor:pointer;font-weight:700;font-size:12.5px}'
    /* На телефоне (тач-пад для движения снизу, #pad в game.html) прежний
       отступ 100px оказался МЕНЬШЕ реальной высоты пэда (74px кнопки +
       нижний паддинг с учётом safe-area — проверено на живом мобильном
       вьюпорте: пэд был больше 100px, и конверт частично перекрывал
       кнопку ◀). 150px даёт запас даже на телефонах с домашней чертой. */
    + 'html.is-mobile #gMsgsBtn,html.is-tablet #gMsgsBtn{'
    + 'bottom:calc(150px + env(safe-area-inset-bottom,0px));left:calc(12px + env(safe-area-inset-left,0px))}'
    + 'html.is-mobile #gMsgsBadge,html.is-tablet #gMsgsBadge{'
    + 'bottom:calc(177px + env(safe-area-inset-bottom,0px));left:calc(39px + env(safe-area-inset-left,0px))}'
    + 'html.is-mobile #gMsgsPanel,html.is-tablet #gMsgsPanel{'
    + 'bottom:calc(200px + env(safe-area-inset-bottom,0px));left:calc(12px + env(safe-area-inset-left,0px));'
    + 'width:calc(100vw - 24px)}'
    ;

  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  document.body.insertAdjacentHTML('beforeend',
      '<div id="gTop"><span id="gRoleBox" style="display:none"><span id="gLblRole">Роль</span>: <b id="gRole"></b></span>'
    + '<span><span id="gLblPlayers">Игроков</span>: <b id="gCount">1</b></span>'
    + '<span><span id="gLblPing">Пинг</span>: <b id="gPing">—</b></span>'
    + '<span id="gTimeBox"><span id="gLblTime">Время</span>: <b id="gTime">—</b></span>'
    + '<button id="gSound" aria-label="Звук"></button>'
    + '<button id="gExit">Меню</button></div>'
    + '<div id="gMap"><div class="n" id="gMapName">Loading map…</div>'
    + '<div class="a" id="gMapAuthor"></div><div class="rate" id="gRate" style="display:none">'
    + '<button data-v="1"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" '
    + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px">'
    + '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg></button>'
    + '<button data-v="-1"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" '
    + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px">'
    + '<path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg></button>'
    + '<span id="gRating" style="color:#6b7280"></span></div></div>'
    + '<div id="gBanner"><h2 id="gbT"></h2><p id="gbP"></p></div>'
    + '<div id="gRoul"><div id="gRoulView"><div id="gRoulTrack"></div></div>'
    + '<div id="gRoulRes"></div></div>'
    + '<div id="gChance"><span id="gChanceL">Твой шанс</span><b id="gChanceV">—</b></div>'
    + '<div id="gChat"><input id="gMsg" maxlength="90"></div>'
    + '<button id="gTalk" aria-label="Чат"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 '
    + '8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg></button>'
    + '<button id="gScoresBtn" aria-label="Scores">Scores</button>'
    + '<div id="gScoresPanel"><h4 id="gScoresTitle">Scores</h4><div id="gScoresList"></div></div>'
    + '<button id="gMsgsBtn" aria-label="Messages"><svg viewBox="0 0 24 24" fill="none" '
    + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 6l10 7 10-7"/></svg></button>'
    + '<span id="gMsgsBadge"></span>'
    + '<div id="gMsgsPanel">'
    +   '<div id="gMsgsHead"><button id="gMsgsBack">&larr;</button>'
    +     '<span id="gMsgsTitle">Messages</span>'
    +     '<button id="gMsgsNewBtn" aria-label="New chat" title="New chat">+</button></div>'
    +   '<div id="gMsgsNewRow"><input id="gMsgsNewInput" maxlength="200">'
    +     '<button id="gMsgsNewOk">OK</button></div>'
    +   '<div id="gMsgsList"></div>'
    +   '<div id="gMsgsThread"><div id="gMsgsBody"></div>'
    +     '<div id="gMsgsSend"><input id="gMsgsInput" maxlength="400">'
    +       '<button id="gMsgsSendBtn">Send</button></div></div>'
    + '</div>'
);

  /* надписи верхней панели обновляются при смене языка */
  function refreshGameLabels() {
    $('gLblPlayers').textContent = TR('gPlayers', 'Игроков');
    $('gLblPing').textContent = TR('gPing', 'Пинг');
    $('gLblTime').textContent = TR('gTimeLbl', 'Время');
    $('gLblRole').textContent = TR('roleLbl', 'Роль');
    $('gExit').textContent = TR('menu', 'Меню');
    var cl = $('gChanceL');                      // подпись плашки шанса
    if (cl) cl.textContent = TR('chanceLbl', 'Твой шанс');
    var tk = $('gTalk');                          // кнопка чата — теперь иконка, подпись только для скринридера
    if (tk) tk.setAttribute('aria-label', TR('chatBtn', 'Чат'));
    var sb2 = $('gScoresBtn');
    if (sb2) sb2.setAttribute('aria-label', TR('raceScoresTitle', 'Scores'));
    var st2 = $('gScoresTitle');
    if (st2) st2.textContent = TR('raceScoresTitle', 'Scores');
    var mb2 = $('gMsgsBtn');
    if (mb2) mb2.setAttribute('aria-label', TR('messagesTitle', 'Messages'));
    var mn2 = $('gMsgsNewBtn');
    if (mn2) mn2.title = TR('msNewChat', 'New chat');
    var msb2 = $('gMsgsSendBtn');
    if (msb2) msb2.textContent = TR('msSend', 'Send');
    var mi2 = $('gMsgsInput');
    if (mi2) mi2.placeholder = TR('msTypeHint', 'Message');
    var mni2 = $('gMsgsNewInput');
    if (mni2) mni2.placeholder = TR('msNewAsk', 'Player name(s), comma-separated');
    var mno2 = $('gMsgsNewOk');
    if (mno2) mno2.textContent = TR('ok', 'OK');
    paintSoundBtn();
  }
  window.addEventListener('bf-lang', refreshGameLabels);

  var $ = function (id) { return document.getElementById(id); };
  /* переводы игрового экрана; i18n.js подгружается позже — поэтому запасной вариант */
  var TR = function (k, f) {
    return (window.I18N && window.I18N.t(k) !== k) ? window.I18N.t(k) : (f || k);
  };
  $('gExit').onclick = function () { location.href = 'index.html'; };

  // ---------- звук: включён по умолчанию, состояние живёт в localStorage ----------
  var SOUND_ON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>'
    + '<path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
  var SOUND_OFF_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>'
    + '<line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
  function paintSoundBtn() {
    var b = $('gSound');
    if (!b || !window.BFSound) return;
    b.innerHTML = BFSound.isOn() ? SOUND_ON_SVG : SOUND_OFF_SVG;
    b.setAttribute('aria-label', TR('soundBtn', 'Sound'));
  }
  if (window.BFSound) {
    paintSoundBtn();
    $('gSound').onclick = function () { BFSound.setOn(!BFSound.isOn()); paintSoundBtn(); };
  } else {
    var sb = $('gSound'); if (sb) sb.style.display = 'none';
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------- табличка очков забега (Race), левый верхний угол ----------
  var scoresBtn = $('gScoresBtn'), scoresPanel = $('gScoresPanel');
  if (scoresBtn) scoresBtn.addEventListener('click', function () {
    scoresPanel.classList.toggle('on');
  });
  function renderRaceScores(list) {
    if (!scoresPanel) return;
    var box = $('gScoresList');
    box.innerHTML = (list && list.length)
      ? list.map(function (r) {
          var mine = r.name === me.name;
          return '<div class="gScoreRow' + (mine ? ' me' : '') + '">'
            + '<span class="gScoreN">' + esc(r.name) + '</span><b>' + (r.score || 0) + '</b></div>';
        }).join('')
      : '<div id="gScoresEmpty">' + TR('topScoresEmpty', 'No scores yet') + '</div>';
  }

  /* ---------- личные сообщения (Messages) прямо в игре, левый нижний
     угол ---------- та же переписка, что и на messages.html: одни и те
     же /messages/* эндпоинты, чтобы отвечать не выходя из матча.
     Только для аккаунта (у гостя переписок нет — кнопка скрыта). */
  var msgsBtn = $('gMsgsBtn'), msgsPanel = $('gMsgsPanel'), msgsBadge = $('gMsgsBadge');
  var msgsList = $('gMsgsList'), msgsThreadBox = $('gMsgsThread'), msgsBack = $('gMsgsBack');
  var msgsTitle = $('gMsgsTitle'), msgsBody = $('gMsgsBody'), msgsInput = $('gMsgsInput');
  var msgsThreads = [], msgsActiveId = null, msgsPollTimer = null;

  function msgsPost(url, data) {
    var body = Object.keys(data).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(data[k]);
    }).join('&');
    return fetch(url, { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body })
      .then(function (r) { return r.json(); });
  }
  function msgsGet(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (r) { return r.json(); });
  }

  function msgsRenderList() {
    msgsThreadBox.classList.remove('on');
    msgsBack.classList.remove('on');
    msgsTitle.textContent = TR('messagesTitle', 'Messages');
    msgsList.style.display = '';
    msgsList.innerHTML = msgsThreads.length
      ? msgsThreads.map(function (t) {
          var names = (t.members || []).join(', ') || TR('guest', 'Guest');
          var prev = t.lastText
            ? (t.lastFrom && t.lastFrom !== me.name ? esc(t.lastFrom) + ': ' : '') + esc(t.lastText) : '';
          return '<button class="gMsgsRow" data-id="' + t.id + '">'
            + '<div class="gMsgsRowName">' + esc(names)
            +   (t.unread ? '<span class="gMsgsDot">' + t.unread + '</span>' : '') + '</div>'
            + '<div class="gMsgsRowPrev">' + prev + '</div></button>';
        }).join('')
      : '<div id="gMsgsEmpty">' + TR('msNone', 'No chats yet.') + '</div>';
  }

  function msgsLoadThreads() {
    msgsGet('/messages/threads').then(function (d) {
      msgsThreads = d.threads || [];
      var unread = msgsThreads.reduce(function (s, t) { return s + (t.unread || 0); }, 0);
      msgsBadge.textContent = unread > 9 ? '9+' : String(unread);
      msgsBadge.classList.toggle('on', unread > 0);
      if (!msgsActiveId) msgsRenderList();
    }).catch(function () {});
  }

  function msgsDrawMessages(list) {
    var atBottom = msgsBody.scrollTop + msgsBody.clientHeight >= msgsBody.scrollHeight - 30;
    msgsBody.innerHTML = list.map(function (m) {
      var mine = m.from === me.name;
      return '<div class="gMsgsBubble ' + (mine ? 'me' : 'them') + '">' + esc(m.text) + '</div>';
    }).join('');
    if (atBottom || !list.length) msgsBody.scrollTop = msgsBody.scrollHeight;
  }

  function msgsFetchThread() {
    if (!msgsActiveId) return;
    msgsGet('/messages/thread?id=' + encodeURIComponent(msgsActiveId)).then(function (d) {
      if (d.status !== 'success') return;
      msgsTitle.textContent = (d.members || []).join(', ') || TR('guest', 'Guest');
      msgsDrawMessages(d.messages || []);
      msgsLoadThreads();
    }).catch(function () {});
  }

  function msgsOpenThread(id) {
    msgsActiveId = id;
    msgsList.style.display = 'none';
    msgsThreadBox.classList.add('on');
    msgsBack.classList.add('on');
    msgsFetchThread();
  }

  function msgsSend() {
    var text = msgsInput.value.trim();
    if (!text || !msgsActiveId) return;
    msgsInput.value = '';
    msgsPost('/messages/send', { id: msgsActiveId, text: text }).then(function (r) {
      if (r.status === 'success') msgsFetchThread(); else msgsInput.value = text;
    }).catch(function () { msgsInput.value = text; });
  }

  if (msgsBtn) {
    msgsBtn.addEventListener('click', function () {
      var open = msgsPanel.classList.toggle('on');
      if (open) { msgsActiveId = null; msgsLoadThreads(); }
    });
    msgsBack.addEventListener('click', function () { msgsActiveId = null; msgsRenderList(); });
    msgsList.addEventListener('click', function (e) {
      var row = e.target.closest ? e.target.closest('.gMsgsRow') : null;
      if (row) msgsOpenThread(row.dataset.id);
    });
    var msgsNewRow = $('gMsgsNewRow'), msgsNewInput = $('gMsgsNewInput');
    function msgsStartChat() {
      var names = msgsNewInput.value.trim();
      if (!names) return;
      msgsNewRow.classList.remove('on');
      msgsNewInput.value = '';
      msgsPost('/messages/start', { names: names }).then(function (r) {
        if (r.status !== 'success') { log(esc(r.message || TR('errorTxt', 'Error'))); return; }
        msgsLoadThreads();
        msgsOpenThread(r.id);
      }).catch(function () {});
    }
    // не-блокирующее поле вместо prompt() — иначе физика/сеть/детект
    // поимки замирают на всё время, пока открыт системный диалог
    $('gMsgsNewBtn').addEventListener('click', function () {
      var open = msgsNewRow.classList.toggle('on');
      if (open) setTimeout(function () { msgsNewInput.focus(); }, 0);
      else msgsNewInput.value = '';
    });
    $('gMsgsNewOk').addEventListener('click', msgsStartChat);
    msgsNewInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); msgsStartChat(); }
      if (e.key === 'Escape') { msgsNewRow.classList.remove('on'); msgsNewInput.value = ''; }
    });
    $('gMsgsSendBtn').addEventListener('click', msgsSend);
    msgsInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); msgsSend(); }
    });
  }

  // кнопка скрыта у гостя — своих переписок у него нет (см. messages.js)
  function msgsSetup() {
    fetch('/whoAmI', { credentials: 'same-origin' }).then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || d.guest || !msgsBtn) return;
        msgsBtn.style.display = 'flex';
        msgsLoadThreads();
        clearInterval(msgsPollTimer);
        msgsPollTimer = setInterval(msgsLoadThreads, 8000);
      }).catch(function () {});
  }

  // системные сообщения — короткой плашкой, история не хранится
  function log(html) {
    var d = document.createElement('div');
    d.innerHTML = html;
    d.style.cssText = 'position:fixed;left:50%;top:52px;transform:translateX(-50%);z-index:62;' +
      'background:rgba(0,0,0,.62);color:#fff;padding:7px 15px;border-radius:16px;' +
      'font:12.5px sans-serif;pointer-events:none';
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 2600);
  }

  /* Шапка (#gTop) переносится на вторую строку, когда роль/игроки/пинг/время
     не влезают в одну — на телефоне так почти всегда, как только появляется
     «Роль: …». Плашки в углу (рулетка, шанс, карточка карты) раньше стояли
     на фиксированном отступе, рассчитанном на шапку в одну строку, и
     наезжали на неё, когда она разъезжалась на две. Теперь отступ каждый
     раз меряется по факту вместо того, чтобы угадываться числом в CSS. */
  function relayoutCorner() {
    var top = $('gTop');
    if (!top) return;
    var mobile = document.documentElement.classList.contains('is-mobile') ||
                 document.documentElement.classList.contains('is-tablet');
    var gap = mobile ? 6 : 8;
    var y = Math.ceil(top.getBoundingClientRect().bottom) + gap;

    var roul = $('gRoul');
    if (roul && roul.classList.contains('on')) {
      roul.style.top = y + 'px';
      y += roul.offsetHeight + gap;
    }
    var chance = $('gChance');
    if (chance && chance.style.display === 'block') {
      chance.style.top = y + 'px';
      y += chance.offsetHeight + gap;
    }
    // на телефоне карточка карты тоже стоит в углу сверху; на десктопе она снизу — не мешает
    if (mobile) {
      var map = $('gMap');
      if (map) map.style.top = y + 'px';
    }
  }
  window.addEventListener('resize', relayoutCorner);
  window.addEventListener('orientationchange', relayoutCorner);
  window.addEventListener('bf-lang', relayoutCorner);      // другой язык — другая ширина подписей
  try {
    // «Роль: …» появляется/пропадает — это и есть типичный триггер переноса строки
    new MutationObserver(relayoutCorner)
      .observe($('gRoleBox'), { attributes: true, attributeFilter: ['style'] });
  } catch (e) {}
  relayoutCorner();

  // сказанные реплики: 2 секунды плавно уплывают вверх и тают
  // ---------- скины ----------
  var mySkinStr = '';                 // компактная запись для передачи по сети

  /* Кеш скинов-картинок по нику. Запрашиваем пачкой и только один раз
     на игрока: сама картинка может быть на сотни килобайт. kindCache
     хранит, как её рисовать: 'accessory' — рисунок из Skin Editor,
     аксессуары поверх обычной фигуры; 'full' (или ничего) — готовая
     картинка от владельца, заменяет фигуру целиком. */
  // Object.create(null) — без прototype: ник "__proto__"/"constructor" не
  // должен резолвиться в унаследованный объект вместо реального значения
  var imgCache = Object.create(null);   // ник -> url ('' если картинки нет)
  var kindCache = Object.create(null);  // ник -> 'accessory' | 'full'
  var imgWanted = Object.create(null);
  var imgTimer = null;
  function imgOf(name) {
    if (!name) return '';
    if (imgCache[name] !== undefined) return imgCache[name];
    if (!imgWanted[name]) {
      imgWanted[name] = 1;
      clearTimeout(imgTimer);
      imgTimer = setTimeout(askImgs, 120);
    }
    return '';
  }
  function askImgs() {
    var names = Object.keys(imgWanted);
    if (!names.length) return;
    imgWanted = Object.create(null);
    fetch('/skins/many?names=' + encodeURIComponent(names.join(',')), { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var got = (d && d.skins) || {};
        names.forEach(function (n) {
          imgCache[n] = (got[n] && got[n].img) || '';
          kindCache[n] = (got[n] && got[n].kind) || 'full';
        });
        /* Картинка приехала позже скина — донавешиваем её тем, кто уже
           на экране. Раньше адрес доставался только в момент разбора
           сетевого пакета, и скин-картинка так и оставалась голой фигурой. */
        Object.keys(others).forEach(function (id) {
          var o = others[id];
          if (o && o.skin && !o.skin.img && imgCache[o.name]) {
            o.skin.img = imgCache[o.name];
            o.skin.kind = kindCache[o.name];
          }
        });
      })
      .catch(function () { names.forEach(function (n) { imgCache[n] = ''; }); });
  }
  // компактная запись для сети — несёт только «есть картинка / нет»,
  // сама картинка и её вид (kind) едут отдельно через /skins/many
  function skinToStr(sk) { return (sk && sk.img) ? 'i:' + sk.img : ''; }
  function strToSkin(v) {
    if (!v) return null;
    var str = String(v);
    if (str.indexOf('i:') === 0) return { img: str.slice(2) };
    return null;
  }
  function loadMySkin() {
    fetch('/skin/my', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        GAME.mySkin = d.img ? { img: d.img, kind: d.kind || 'full' } : null;
        mySkinStr = skinToStr(GAME.mySkin);
        if (GAME.myName) { imgCache[GAME.myName] = d.img || ''; kindCache[GAME.myName] = d.kind || 'full'; }
      })
      .catch(function () {});
  }
  loadMySkin();

  // Дверь засчитывается, когда в ней все игроки — движок спрашивает список здесь
  {
    GAME.netSample = sample;            // тесты гоняют ту же функцию, что и игра
    GAME.others = function () {
      var out = [];
      for (var k in others) {
        var o = others[k];
        if (o && !o.gone) out.push({ x: o.x, y: o.y, w: o.w, h: o.h, gone: o.gone });
      }
      return out;
    };
  }

  var SAY_FADE = 2600;
  var SAY_MAX = 4;
  var SAY_OUT = 500;            // сколько миллисекунд длится растворение
  /* Реплики копятся стопкой: новая не стирает предыдущую, а встаёт под
     ней. Раньше здесь лежала одна запись на игрока, поэтому второе
     сообщение затирало первое ещё до того, как его успевали прочитать. */
  // Object.create(null): игрок по имени "__proto__" не должен получать
  // унаследованный Object.prototype вместо своего личного массива реплик
  var spoken = Object.create(null);
  function speak(who, text) {
    if (!text) return;
    text = cleanSay(text);   // невидимые bidi-символы не переворачивают слова на экране
    var list = spoken[who] || (spoken[who] = []);
    list.push({ text: text, born: Date.now() });
    /* Лишние не выкидываем разом: при частой отправке реплики пропадали
       рывком прямо на глазах. Вместо этого состариваем самую старую —
       она доживает свои полсекунды и растворяется как обычно. */
    for (var i = 0; i < list.length - SAY_MAX; i++) {
      var old = list[i], age = Date.now() - old.born;
      if (age < SAY_FADE - SAY_OUT) old.born = Date.now() - (SAY_FADE - SAY_OUT);
    }
    // совсем уж отжившие убираем, чтобы список не рос без конца
    while (list.length > SAY_MAX + 3) list.shift();
  }

  function banner(title, text, show) {
    $('gbT').textContent = title || '';
    $('gbP').textContent = text || '';
    $('gBanner').style.display = show ? 'flex' : 'none';
  }

  // ---------- загрузка карт ----------
  function showMap(m) {
    currentMap = m;
    if (!m) {
      $('gMapName').textContent = TR('noMapsYet', 'Карт пока нет');
      $('gMapAuthor').textContent = TR('publishHint', 'Опубликуй карту в Map Editor');
      GAME.clear();                       // убираем демо-сцену редактора
      banner(TR('emptyTitle', 'Здесь пока пусто'), TR('emptyText', 'Никто ещё не опубликовал карту для этого режима. Открой Map Editor и выложи свою.'), true);
      return;
    }
    banner('', '', false);
    $('gMapName').textContent = m.mapName;
    $('gMapAuthor').textContent = TR('mapBy', 'автор: ') + m.author;
    try {
      GAME.loadMap(m.mapData);
      GAME.startPlay();
      finSent = false;
      applyColor();
      /* Сервер должен знать, что забег начался, ДО того как придёт
         raceFinish — иначе финиш без старта ничем не подтверждён и
         монет не будет (см. server.js). Но join() ещё может быть не
         подтверждён сервером: он идёт через Promise.all с двумя fetch,
         а getRandomMap — одиночный fetch и почти всегда успевает первым.
         Раньше raceStart уходил сразу и до подтверждения join не долетал
         до gameState.players — сервер тихо его игнорировал, а потом так
         же тихо отклонял честный raceFinish. Теперь запрос откладывается
         до joined и досылается, как только вход подтверждён. */
      if (MODE === 'race' && !VIEW) {
        pendingRaceStart = { author: m.author, mapName: m.mapName };
        flushPendingRaceStart();
      }
    } catch (e) {
      $('gMapAuthor').textContent = TR('brokenMap', 'карта повреждена');
    }
  }

  function nextMap(cb) {
    var u = '/getRandomMap?mapType=' + encodeURIComponent(MODE)
          + (currentMap ? '&not=' + encodeURIComponent(currentMap.mapName) : '');
    fetch(u).then(function (r) { return r.json(); }).then(function (m) {
      showMap(m);
      if (m) log(TR('mapLog', 'Карта: ') + '<b>' + esc(m.mapName) + '</b>' + TR('byWord', ' от ') + esc(m.author), 's');
      if (cb) cb(m);
    }).catch(function () { showMap(null); if (cb) cb(null); });
  }

  // ---------- роли ----------
  function applyColor() {
    GAME.myColor = (me.role === 'seeker') ? COLOR_SEEKER
                 : (me.caught ? COLOR_CAUGHT : COLOR_NORMAL);
  }
  /* Пойманность живёт ровно один раунд. Раньше её снимали только у себя
     и только при уходе в лобби, поэтому чужие фигуры оставались серыми
     навсегда, а искатель не мог поймать их снова. */
  function clearCaught() {
    me.caught = false;
    Object.keys(others).forEach(function (id) { others[id].caught = false; });
    caughtNames = {};
    applyColor();
  }
  var caughtNames = {};

  function setRole(role) {
    me.role = role; me.caught = false;
    $('gRoleBox').style.display = 'inline';
    $('gRole').textContent = role === 'seeker' ? TR('roleSeeker', 'Искатель') : TR('roleHider', 'Прячется');
    applyColor();
  }

  /* ---------- рулетка искателя (прятки) ----------
     Роль больше не берётся «по первому id»: искателя выбирает сервер,
     все клиенты комнаты показывают одну и ту же рулетку — прямоугольную
     панель по центру с карточками (скин + ник), по которым прыгает
     серое полосатое выделение-куб. Итог один у всех, крутился кто как. */
  var hsSync = false;          // фазами пряток управляет сервер
  var hsEver = false;          // сервер уже присылал события пряток
  var hsWinnerId = null;       // кто искатель в текущем раунде
  var roulTimers = [];

  function roulStop() {
    roulTimers.forEach(clearTimeout);
    roulTimers = [];
    var r = $('gRoul');   if (r)  r.classList.remove('on');
    var s = $('gRoulRes');   if (s) { s.classList.remove('on'); s.textContent = ''; }
    document.body.classList.remove('hasRoulette');
    relayoutCorner();
  }

  function nameOfId(id, list) {
    if (id === socket.id) return me.name;
    var o = others[id];
    if (o && o.name) return o.name;
    if (list) for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name;
    return '';
  }

  function applySeeker(id) {
    hsWinnerId = id;
    setRole(id === socket.id ? 'seeker' : 'hider');
  }

  /* Твой шанс стать искателем в этом раунде — плашка в правом верхнем углу.
     Числа приходят от сервера вместе с составом рулетки и каждый раунд новые. */
  function showChance(list) {
    var box = $('gChance');
    if (!box || !socket) return;
    var mine = null;
    for (var i = 0; i < list.length; i++)
      if (list[i].id === socket.id && list[i].chance != null) mine = list[i].chance;
    if (mine === null) { hideChance(); return; }
    $('gChanceL').textContent = TR('chanceLbl', 'Твой шанс');
    $('gChanceV').textContent = mine + '%';
    box.style.display = 'block';
    relayoutCorner();
  }
  function hideChance() {
    var box = $('gChance');
    if (box) box.style.display = 'none';
    relayoutCorner();
  }

  function runRoulette(d) {
    roulStop();
    var list = (d && d.players) || [];
    var box = $('gRoul'), view = $('gRoulView'), track = $('gRoulTrack');
    var res = $('gRoulRes');
    var winIdx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === d.winnerId) { winIdx = i; break; }
    // Если состав рассинхронизирован и победителя вообще нет в списке —
    // анимацию не показать, но роль всё равно нужно назначить: иначе раунд
    // проходит без искателя вообще ни у кого.
    if (!list.length || winIdx < 0) { applySeeker(d.winnerId); return; }

    banner('', '', false);            // рулетка вместо плашки ожидания
    document.body.classList.add('hasRoulette');   // плашка шанса уступает место рулетке

    /* Лента — несколько кругов подряд, победитель в дальнем круге.
       Поэтому лента едет только вперёд и плавно тормозит, без прыжков
       туда-сюда, как было раньше. */
    var seq = [], edge = 3;
    while (seq.length < edge) seq = seq.concat(list);
    var startIdx = seq.length;                        // с неё стартуем
    var pass = 20 + Math.floor(Math.random() * 7);    // сколько ников проедет
    while (seq.length < startIdx + pass) seq = seq.concat(list);
    var target = seq.length + winIdx;                 // на ней остановимся
    seq = seq.concat(list);
    while (seq.length < target + edge + 1) seq = seq.concat(list);

    track.innerHTML = '';
    var pills = seq.map(function (p) {
      var el = document.createElement('div');
      el.className = 'rName';
      el.textContent = p.name || '';
      track.appendChild(el);
      return el;
    });

    res.classList.remove('on'); res.textContent = '';
    box.classList.add('on');
    relayoutCorner();

    // ширину плашки берём у реально вставленного элемента — синхронизации
    // с шириной в CSS вручную не требуется
    var step = (pills[0] && pills[0].getBoundingClientRect().width) || 150;
    var W = view.getBoundingClientRect().width || step;
    function posOf(k) { return Math.round(W / 2 - (k * step + step / 2)); }

    // длительность подгоняем под остаток лобби: рулетка не оборвётся
    var dur  = (d && d.duration) || 6800;
    var left = (d && d.msLeft)   || (dur + 2000);
    var spin = Math.min(dur - 1100, left - 2400);
    spin = Math.max(left < 2600 ? 600 : 2200, spin);

    track.style.transition = 'none';
    track.style.transform  = 'translateX(' + posOf(startIdx) + 'px)';
    void track.offsetWidth;                     // старт применяется до анимации
    track.style.transition = 'transform ' + spin + 'ms cubic-bezier(.09,.66,.14,1)';
    track.style.transform  = 'translateX(' + posOf(target) + 'px)';

    roulTimers.push(setTimeout(function () {
      pills[target].classList.add('rWin');      // ник искателя становится синим
      applySeeker(d.winnerId);
      if (d.winnerId === socket.id) {
        res.textContent = TR('roulYouSeek', 'Ты — искатель!');
        res.classList.add('on');
      }
      roulTimers.push(setTimeout(roulStop, 2300));
    }, spin + 120));
  }

  // ---------- таймер и фазы ----------
  function fmt(ms) {
    if (ms < 0) ms = 0;
    var s = Math.ceil(ms / 1000);
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  var lastTickSec = -1;   // последняя озвученная секунда обратного отсчёта
  setInterval(function () {
    if (phase === 'dev' || phase === 'loading') return;
    var left = phaseEnds - Date.now();
    $('gTime').textContent = fmt(left);
    if (window.BFSound) {
      var secLeft = Math.ceil(left / 1000);
      if (secLeft !== lastTickSec) {
        lastTickSec = secLeft;
        if (secLeft > 0 && secLeft <= 3) BFSound.tick();
      }
    }
    if (left <= 0) {
      // фазами пряток управляет сервер: ждём его событие, а не переключаемся сами
      if (hsSync && MODE === 'hideAndSeek' && socket && socket.connected) {
        if (Date.now() - phaseEnds > 10000) hsSync = false;   // сервер молчит — вернёмся к своим таймерам
        return;
      }
      /* checkAllCaught/checkAllFinished уже решили сменить фазу и сами
         вызовут advance() по своему таймеру — если естественный конец
         времени совпадает с этим моментом, второй, параллельный advance()
         отсюда даёт двойную смену карты. */
      if (switching) return;
      advance();
    }
  }, 250);

  function advance() {
    if (MODE === 'hideAndSeek') {
      if (phase === 'lobby') {
        phase = 'round'; phaseEnds = Date.now() + ROUND_MS;
        clearCaught();               // новый раунд — все снова не пойманы
        banner('', '', false);
        log(TR('roundStart', 'Раунд начался! 2 минуты'));
        if (window.BFSound) BFSound.go();
      } else {
        // дожил до конца раунда прячущимся — свой личный успех, даже
        // если искатель кого-то и поймал. Пойманного искатель уже
        // озвучил через checkAllCaught() выше
        if (window.BFSound && me.role === 'hider' && !me.caught) BFSound.win();
        phase = 'lobby'; phaseEnds = Date.now() + LOBBY_MS;
        clearCaught();
        nextMap();
        banner(TR('roundOver', 'Раунд окончен'), TR('newMapText', 'Новая карта. До старта 30 секунд.'), true);
        setTimeout(function () { banner('', '', false); }, 3000);
      }
    } else {
      phaseEnds = Date.now() + ROUND_MS;
      nextMap();
      log(TR('timeUp', 'Время вышло — следующая карта'));
    }
  }

  // ---------- запуск по режимам ----------
  var bootAt = 0;
  function boot() {
    GAME.setGrid(false);
    bootAt = Date.now();

    if (VIEW) {                       // просмотр карты из Maps Browser
      phase = 'dev';
      $('gTimeBox').style.display = 'none';
        $('gChat').style.display = 'none';
      $('gRate').style.display = 'flex';
      fetch('/getMapData?author=' + encodeURIComponent(VAUTH || '') + '&mapName=' + encodeURIComponent(VIEW))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          showMap(d ? { mapName: VIEW, author: VAUTH, mapData: d } : null);
        })
        .catch(function () { showMap(null); });
      return;
    }

    connect();

    // сразу видна, кликать незачем — кнопка теперь только сворачивает её
    if (MODE === 'race' && scoresBtn) { scoresBtn.style.display = 'flex'; if (scoresPanel) scoresPanel.classList.add('on'); }
    msgsSetup();

    if (MODE === 'hideAndSeek') {
      /* Раньше тут висел свой баннер «роли распределятся через 30 секунд» —
         неверный, если в итоге играть не с кем, и всё равно почти сразу
         гас от nextMap() ниже. Реальное состояние (лобби/раунд) сервер
         пришлёт через hsPhase/hsState через мгновение после join. */
      phase = 'lobby'; phaseEnds = Date.now() + LOBBY_MS;
    } else {
      phase = 'round'; phaseEnds = Date.now() + ROUND_MS;
    }
    nextMap();
  }

  /* ---------- монеты на аккаунт ----------
     Раньше клиент сам считал собранные на карте монеты и присылал их
     число серверу — значит, мог прислать любое. Теперь сервер сам решает,
     сколько начислить (за финиш забега, за поимку, за победу в раунде
     пряток — см. raceStart/raceFinish/hsCatch и конец раунда в server.js)
     и просто уведомляет об этом клиента для тоста в лог. */
  var finSent = false;   // раз за забег: чтобы не слать raceFinish на каждый кадр, пока GAME.done держится
  var pendingRaceStart = null;   // {author, mapName} карты, ждущей отправки raceStart, пока не подтверждён join
  function flushPendingRaceStart() {
    if (!joined || !pendingRaceStart || !socket) return;
    socket.emit('raceStart', pendingRaceStart);
    pendingRaceStart = null;
  }
  function checkRaceFinish() {
    if (VIEW || MODE !== 'race' || !socket || !GAME.playing || !GAME.done || finSent) return;
    finSent = true;
    if (window.BFSound) BFSound.win();
    socket.emit('raceFinish', currentMap ? { author: currentMap.author, mapName: currentMap.mapName } : {});
  }

  // ---------- сеть ----------
  /* БЫСТРЫЙ СЕРВЕР: адрес игрового воркера на Cloudflare Workers —
     пинг 10–60 мс вместо 150 до далёкого дата-центра. Впиши сюда свой
     адрес (README воркера, шаг 5) или оставь пустым, чтобы играть через
     прежний сервер Railway. Можно проверить и без правки файла:
     game.html?mode=race&ws=wss://адрес-воркера/ws */
  var DEFAULT_WS_URL = '';
  var wsGaveUp = false;          // воркер недоступен — вернулись на старый сервер
  var wsActive = false;          // сейчас подключаемся через воркер
  var sendGap = 33;              // интервал отправки движения, мс
  var pingTimer = null;

  /* Шим socket.io поверх чистого WebSocket: Workers не поддерживает
     socket.io, поэтому сервер на воркере говорит простым JSON.
     Шим повторяет нужную часть его API — .on, .emit, .id, .connected,
     события connect/disconnect, автопереподключение. */
  function makeSocket(url, onDead) {
    var sock = { id: null, connected: false, _ls: {} };
    var ws = null, tries = 0, retryT = null, dead = false;

    function fire(ev, d) {
      var l = sock._ls[ev];
      if (!l) return;
      for (var i = 0; i < l.length; i++) { try { l[i](d); } catch (e) {} }
    }
    sock.on = function (ev, f) { (sock._ls[ev] = sock._ls[ev] || []).push(f); };
    sock.emit = function (ev, d) {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ ev: ev, data: d === undefined ? null : d }));
    };
    sock.disconnect = function () {
      dead = true;
      if (retryT) clearTimeout(retryT);
      if (ws) { try { ws.close(); } catch (e) {} }
    };

    function open() {
      if (dead) return;
      if (retryT) { clearTimeout(retryT); retryT = null; }
      var thisWs;
      try { ws = new WebSocket(url); } catch (e) { fail(); return; }
      thisWs = ws;
      ws.onopen = function () { tries = 0; };          // связь есть — счётчик неудач в ноль
      ws.onmessage = function (e) {
        var m; try { m = JSON.parse(e.data); } catch (err) { return; }
        if (!m || typeof m.ev !== 'string') return;
        if (m.ev === 'init') {                        // воркер выдал наш id
          sock.id = m.data.id;
          sock.connected = true;
          fire('connect');
          return;
        }
        fire(m.ev, m.data);
      };
      ws.onclose = function () {
        if (sock.connected) { sock.connected = false; sock.id = null; fire('disconnect'); }
        schedule();
      };
      ws.onerror = function () { try { ws.close(); } catch (err) {} };
      /* Открылось, но init не пришёл: канал бесполезен (исчерпанный лимит
         воркера часто выглядит именно так) — закрываем, это неудача. */
      setTimeout(function () {
        if (ws === thisWs && !sock.connected && ws.readyState === 1) {
          try { ws.close(); } catch (err) {}
        }
      }, 5000);
    }

    function schedule() {
      if (dead) return;
      tries++;
      if (tries >= 3 && onDead) { dead = true; onDead(); return; }  // сдались — старый сервер
      retryT = setTimeout(open, Math.min(2000 * tries, 5000));
    }
    function fail() { if (!dead) schedule(); }

    open();
    return sock;
  }

  function connect() {
    var wsUrl = (q.get('ws') || DEFAULT_WS_URL || '').trim();
    wsActive = !!wsUrl && !wsGaveUp;
    sendGap = wsActive ? 50 : 33;   // воркер считает каждое сообщение: 20 Гц бережёт лимит
    if (wsActive) {
      /* Воркер не отвечает (не задеплоен, лимит исчерпан, провайдер
         блокирует): после трёх неудач игра автоматически вернётся на
         прежний сервер — никто не остаётся без мультиплеера. */
      socket = makeSocket(wsUrl, function () {
        wsGaveUp = true;
        setTimeout(connect, 0);
      });
    } else {
      /* Сначала websocket: долгий опрос (polling) добавляет к каждому
         пакету десятки миллисекунд, а на части сетей апгрейд до websocket
         вовсе не проходит — и игрок навсегда оставался на медленном
         транспорте. websocket первый, polling — запасной на случай
         его полного запрета (tryAllTransports пробует по очереди). */
      socket = io({ transports: ['websocket', 'polling'], tryAllTransports: true });
    }
    bindNet();
  }

  /* Все подписи на события сокета — отдельной функцией: при переходе
     с воркера на старый сервер сокет пересоздаётся, и обработчики
     навешиваются на новый экземпляр без дублирования. */
  function bindNet() {

    socket.on('connect', function () {
      // сервер завёл нас заново: пусть первый же пакет несёт всё, включая скин
      lastSk = null;
      prev.x = prev.y = prev.w = prev.h = null;
      prev.c = prev.s = prev.f = prev.d = null;
      dupBlocked = false;      // новое соединение — даём серверу решить заново

      Promise.all([
        fetch('/iSigned', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).catch(function () { return null; }),
        ROOM ? Promise.resolve({ room: ROOM })
             : fetch('/getBestRoom?mode=' + encodeURIComponent(MODE)).then(function (r) { return r.json(); })
                 .catch(function () { return { room: 'room1' }; })
      ]).then(function (res) {
        var signed = res[0], pick = res[1];
        me.name = (signed && signed.data && !signed.data.guest) ? signed.data.name : guestName();
        ROOM = pick.room || 'room1';
        socket.emit('join', { playerName: me.name, gameMode: MODE, room: ROOM });

        // запасной путь: старый сервер ничего о рулетке не знает — тогда,
        // как и раньше, искателем становится игрок с наименьшим id
        setTimeout(function () {
          if (hsEver || dupBlocked || MODE !== 'hideAndSeek' || VIEW || !socket.connected) return;
          var lowest = socket.id;
          Object.keys(others).forEach(function (id) { if (id < lowest) lowest = id; });
          applySeeker(lowest);
        }, 5000);
      });
    });

    // при обрыве связи серверные фазы недоступны — действуем по своим таймерам
    socket.on('disconnect', function () { hsSync = false; joined = false; });

    // сервер мог поправить имя: сессия сильнее присланного, а гостю
    // нельзя сидеть под чужим зарегистрированным ником
    socket.on('nameFixed', function (d) {
      if (d && d.name) me.name = d.name;
      joined = true;                        // вход подтверждён — можно слать движение
      flushPendingRaceStart();
    });

    /* Один аккаунт уже играет в другой вкладке или на другом устройстве:
       сервер отказал во входе и не добавил нас в комнату — join больше не
       подтвердится, поэтому просто показываем причину и ничего не шлём. */
    socket.on('joinDenied', function (d) {
      if (!d || d.reason !== 'duplicateAccount') return;
      dupBlocked = true;
      joined = false;
      var rb = $('gRoleBox'); if (rb) rb.style.display = 'none';
      var tb = $('gTimeBox'); if (tb) tb.style.display = 'none';
      hideChance();
      banner(TR('dupTitle', 'Аккаунт уже в игре'),
             TR('dupText', 'Этот аккаунт уже открыт в другой вкладке или на другом устройстве. Закрой её и обнови эту страницу.'), true);
    });

    socket.on('state', function (list) {
      if (!list || !list.length) return;
      var t = nowMs();
      noteSnapshot(t);

      for (var i = 0; i < list.length; i++) {
        var e = list[i], o = byNid[e.n];
        if (!o) continue;                       // о новичке ещё не рассказали
        pushSnap(o, t, e.x, e.y);
        if (e.w !== undefined) { o.w = e.w; o.h = e.h; }
        if (e.c !== undefined) o.color = e.c || COLOR_NORMAL;
        if (e.s !== undefined) o.say = e.s || '';
        if (e.f !== undefined) o.fin = !!e.f;
        if (e.d !== undefined) o.hid = !!e.d;
        if (e.k !== undefined) {
          o.skin = strToSkin(e.k);
          patchSkinFromCache(o);
        }
      }
    });

    /* ---------- задержка до сервера ---------- */
    if (pingTimer) clearInterval(pingTimer);      // переподключение не плодит таймеры
    pingTimer = setInterval(function () {
      if (socket && socket.connected) socket.emit('pingCheck', Date.now());
    }, 2000);
    socket.on('pongCheck', function (t) {
      var ms = Math.max(0, Date.now() - t);
      pingMs = pingMs ? Math.round(pingMs * 0.6 + ms * 0.4) : ms;
      var el = $('gPing');
      if (el) el.textContent = pingMs + ' ' + TR('gPingMs', 'мс');
    });

    socket.on('playersList', function (list) {
      joined = true;                        // запасное подтверждение входа
      flushPendingRaceStart();
      var seen = {};
      byNid = {};
      list.forEach(function (p) {
        if (p.id === socket.id) return;
        seen[p.id] = 1;
        var o = others[p.id] || (others[p.id] = { x: 0, y: 0, tx: 0, ty: 0 });
        o.name = p.name;
        o.nid = p.nid;
        applyKnown(o, p.position);
        bindNid(o);
      });
      Object.keys(others).forEach(function (id) { if (!seen[id]) delete others[id]; });
      $('gCount').textContent = Object.keys(others).length + 1;
      // роль приходит из рулетки (hsRoulette/hsState) — здесь её больше не считаем
    });

    socket.on('playerJoined', function (p) {
      if (p.id === socket.id) return;
      others[p.id] = { x: 0, y: 0, tx: 0, ty: 0, name: p.name, nid: p.nid };
      applyKnown(others[p.id], p.position);
      bindNid(others[p.id]);
      /* Как на старом сервере (сброс «что уже отправлено» при входе):
         следующий же наш пакет несёт всё — размер, цвет, реплику и скин,
         чтобы новичок увидел каждого оформленным, а не голой фигурой. */
      prev.x = prev.y = prev.w = prev.h = null;
      prev.c = prev.s = prev.f = prev.d = null;
      lastSk = null;
      lastForce = 0;
      log(esc(p.name) + TR('joinedWord', ' зашёл'), 's');
      $('gCount').textContent = Object.keys(others).length + 1;
    });

    socket.on('playerLeft', function (d) {
      var gone = others[d.playerId];
      if (gone) {
        log(esc(gone.name) + TR('leftWord', ' вышел'), 's');
        if (gone.nid !== undefined) delete byNid[gone.nid];
      }
      delete others[d.playerId];
      $('gCount').textContent = Object.keys(others).length + 1;
    });

    /* Запасной путь для старого сервера, который ещё не умеет снапшоты:
       одиночные пакеты движения тоже кладём в буфер, чтобы сглаживание
       работало одинаково в обоих случаях. */
    socket.on('playerMoved', function (d) {
      var o = others[d.playerId]; if (!o) return;
      o.buf = o.buf || [];
      o.buf.push({ t: nowMs(), x: d.position.x, y: d.position.y });
      if (o.buf.length > 8) o.buf.shift();
      o.tx = d.position.x; o.ty = d.position.y;
      if (d.position.w) { o.w = d.position.w; o.h = d.position.h; }
      o.color = d.position.color || COLOR_NORMAL;
      if (d.position.sk !== undefined) o.skin = strToSkin(d.position.sk);
      patchSkinFromCache(o);
      o.say = d.position.say || '';
      o.fin = !!d.position.fin;
      o.hid = !!d.position.hid;
    });

    socket.on('chatMessage', function (m) {
      if (m.playerName !== me.name) {
        speak(m.playerName, m.text);
        if (window.BFSound) BFSound.chat();
      }
      watchCaught(m.playerId, m.text);
    });

    /* ---------- прятки: серверные события ---------- */

    // новый раунд: сервер выбрал искателя и разослал состав рулетки
    socket.on('hsRoulette', function (d) {
      hsSync = true; hsEver = true;
      if (MODE !== 'hideAndSeek' || !d) return;
      phase = 'lobby';
      if (d.msLeft) phaseEnds = Date.now() + (Number(d.msLeft) || 0);
      hsWinnerId = null;                 // пока крутится — ролей нет, никого не видно
      me.role = 'hider';
      $('gRoleBox').style.display = 'none';
      clearCaught();
      runRoulette(d);
      showChance((d.players) || []);
    });

    // смена фазы: конец рулетки/прятаний — начало охоты и обратно
    socket.on('hsPhase', function (d) {
      hsSync = true; hsEver = true;
      if (MODE !== 'hideAndSeek' || !d || !d.phase) return;
      banner('', '', false);        // предыдущее состояние уже не актуально
      $('gTimeBox').style.display = '';
      if (d.phase === 'round') {
        roulStop();
        phase = 'round';
        phaseEnds = Date.now() + (Number(d.msLeft) || ROUND_MS);
        clearCaught();
        if (d.seekerId) applySeeker(d.seekerId);
        log(TR('roundStart', 'Раунд начался! 2 минуты'));
        if (window.BFSound) BFSound.go();
      } else if (d.phase === 'lobby') {
        // дожил до конца раунда прячущимся — личный успех (значения ещё
        // не сброшены нижеидущими строками). Пойманного искатель уже
        // озвучил через checkAllCaught() выше
        if (window.BFSound && phase === 'round' && me.role === 'hider' && !me.caught) BFSound.win();
        phase = 'lobby';
        phaseEnds = Date.now() + (Number(d.msLeft) || LOBBY_MS);
        hsWinnerId = null;
        me.role = 'hider';
        $('gRoleBox').style.display = 'none';
        clearCaught();
        // свою первую карту уже загрузили в boot — не грузим вторую подряд
        if (Date.now() - bootAt > 5000) nextMap();
      }
    });

    // подключились посреди раунда/лобби: сервер сразу говорит, кто искатель
    socket.on('hsState', function (d) {
      hsSync = true; hsEver = true;
      if (MODE !== 'hideAndSeek' || !d || !d.phase) return;
      $('gTimeBox').style.display = '';
      phase = d.phase;
      phaseEnds = Date.now() + (Number(d.msLeft) || (d.phase === 'round' ? ROUND_MS : LOBBY_MS));
      if (d.phase === 'round') {
        roulStop();
        if (d.seekerId) applySeeker(d.seekerId);
      } else {
        clearCaught();
        if (d.seekerId) {
          applySeeker(d.seekerId);
          log(TR('roulSeekerIs', 'Искатель: ') + '<b>' + esc(nameOfId(d.seekerId)) + '</b>');
        }
      }
    });

    /* Сервер сам решает, сколько начислить (см. accounts.creditCoins) —
       этот пакет только уведомляет, что и сколько упало на счёт. */
    socket.on('coinsAwarded', function (d) {
      if (!d || !(d.amount > 0)) return;
      log(TR('coinsGain', '+{n} coins ({t} in total)').replace('{n}', d.amount).replace('{t}', d.coins));
    });

    // табличка очков забега: сервер шлёт полный снимок комнаты при входе,
    // выходе и каждом финише — просто перерисовываем
    socket.on('raceScores', function (list) { renderRaceScores(list); });
  }

  // ---------- отправка позиции и ловля ----------
  /* Шлём 30 раз в секунду — ровно в темпе серверных кадров, чтобы между
     двумя снапшотами всегда было что интерполировать: чужой игрок едет
     по экрану так же плавно, как свой. Но только когда что-то изменилось:
     стоящий игрок не занимает ни канала, ни процессора. Раз в секунду
     уходит контрольный пакет — на случай потерянного. */
  var lastSent = 0, lastForce = 0, lastSk = null;
  var prev = { x: null, y: null, w: null, h: null, c: null, s: null, f: null, d: null };
  /* Пока сервер не подтвердил вход, слать движение нельзя: пакет уйдёт
     раньше «join» и сервер молча выбросит его — вместе со скином. А клиент
     уже пометит скин отправленным и больше не повторит его. Раньше из-за
     этой гонки на пинге 100+ мс чужие скины пропадали почти всегда. */
  var joined = false;
  var dupBlocked = false;      // сервер отказал: аккаунт уже играет в другой вкладке
  setInterval(function () {
    if (!socket || !joined || !GAME.playing) return;
    var p = GAME.pl;
    var now = Date.now();

    var pos = {
      x: Math.round(p.x), y: Math.round(p.y), w: p.w, h: p.h,
      color: GAME.myColor || COLOR_NORMAL, say: typing || '', fin: !!GAME.done,
      hid: !!GAME.hidden          // сижу в укрытии — меня не рисуют у других
    };
    var moved = pos.x !== prev.x || pos.y !== prev.y || pos.w !== prev.w || pos.h !== prev.h
      || pos.color !== prev.c || pos.say !== prev.s || pos.fin !== prev.f || pos.hid !== prev.d;
    var force = now - lastForce > 1000;

    /* Один в комнате — канал не тратим: контрольный пакет раз в секунду.
       Через воркер шлём 20 раз в секунду: каждое сообщение у него
       считается запросом, а разницу до 30 Гц добирает интерполяция.

       Раньше этот троттлинг обрывал функцию целиком — вместе с отправкой
       пакета внутри него же пропускались проверка «все пойманы»/«все
       финишировали». Если искатель ловил последнего игрока и в этот же
       момент останавливался, раунд не заканчивался до секундного
       контрольного пакета. Теперь отправка на сервер троттлится, а проверки
       ниже выполняются каждый тик — они чисто локальные, сеть не грузят. */
    var alone = true;
    for (var k in others) { alone = false; break; }
    var minGap = alone ? 1000 : sendGap;
    if (now - lastSent >= minGap && (moved || force)) {
      lastSent = now;
      if (force) lastForce = now;
      prev.x = pos.x; prev.y = pos.y; prev.w = pos.w; prev.h = pos.h;
      prev.c = pos.color; prev.s = pos.say; prev.f = pos.fin; prev.d = pos.hid;

      // скин — строка до 120 символов, менять её незачем каждый пакет
      if (mySkinStr !== lastSk) { pos.sk = mySkinStr; lastSk = mySkinStr; }

      socket.emit('movePlayer', { position: pos });
    }

    checkAllFinished();
    checkRaceFinish();

    // искатель ловит прячущихся касанием
    if (MODE === 'hideAndSeek' && me.role === 'seeker' && phase === 'round') {
      Object.keys(others).forEach(function (id) {
        var o = others[id];
        // в охоте укрытие уже не спасает — иначе поймать было бы некого
        if (o.caught) return;
        /* Сверяем по o.tx/o.ty — последней РЕАЛЬНОЙ полученной позиции,
           а не по o.x/o.y: те нарочно отрисовываются с задержкой (interp,
           32-150мс — см. sample()), чтобы чужие двигались плавно. Пока
           прячущийся не стоит на месте, эта задержка сама по себе даёт
           разрыв в десятки юнитов (при 150мс — почти 47 при максимальной
           скорости), и искатель, вплотную подойдя к тому, что видит на
           экране, на самом деле всё ещё гонится за точкой, где жертва
           была мгновение назад — поймать так нельзя было в принципе,
           сколько бы игрок ни старался. */
        if (Math.abs(o.tx - p.x) < 34 && Math.abs(o.ty - p.y) < 60) {
          o.caught = true;
          caughtNames[o.name] = 1;
          socket.emit('sendChat', { text: o.name + ' caught!' });
          // монету за поимку начисляет сервер сам, проверив дистанцию
          // по своим же координатам — этому emit он не верит на слово
          socket.emit('hsCatch', { targetId: id });
        }
      });
      checkAllCaught();
    }
  }, 33);

  /* Раунд заканчивается, как только пойманы все. Таймер после этого
     дотикивал впустую: искать было уже некого. */
  function checkAllCaught() {
    if (switching || phase !== 'round' || VIEW) return;
    var ids = Object.keys(others);
    if (!ids.length) return;                  // один в комнате — ловить некого
    for (var i = 0; i < ids.length; i++) if (!others[ids[i]].caught) return;

    switching = true;
    log(TR('allCaughtT', 'Everyone caught — round over!'));
    if (window.BFSound) BFSound.win();
    if (socket) {
      // при серверных фазах досрочно завершает раунд сервер —
      // сообщение принимается только от текущего искателя
      if (hsSync) socket.emit('hsCaught');
      else socket.emit('sendChat', { text: 'Everyone caught' });
    }
    setTimeout(function () { switching = false; if (!hsSync) advance(); }, 1200);
  }

  // пойманным считает тот, кого назвали в чате
  function watchCaught(fromId, text) {
    if (MODE !== 'hideAndSeek' || me.role === 'seeker') return;
    /* Сообщение о поимке — обычный чат, а чат может отправить кто угодно.
       Раньше любой игрок мог прислать «Чужое-имя поймана!» и подделать
       чужой статус (вплоть до подставного «Все пойманы», досрочно
       обрывающего раунд). Доверяем только тому, кто сейчас реально
       искатель — его id сервер уже сообщил через hsPhase/hsRoulette. */
    if (!hsWinnerId || fromId !== hsWinnerId) return;
    /* Сообщение о поимке имеет вид «Имя caught!». Сверяем именно эту
       форму: искать имя подстрокой нельзя — игрока с коротким именем
       помечало бы пойманным от любой чужой реплики. */
    var m = /^(.+?) caught/.exec(text);
    if (!m) return;
    var who = m[1];
    if (who === me.name) { me.caught = true; applyColor(); if (window.BFSound) BFSound.death(); }
    // чужие поимки тоже слышны: у прячущихся фигуры красятся синхронно
    Object.keys(others).forEach(function (id) {
      if (others[id].name === who) others[id].caught = true;
    });
  }

  // все дошли до финиша — не ждём таймер, ставим новую карту
  var switching = false;
  function checkAllFinished() {
    if (switching || phase !== 'round' || VIEW) return;
    if (MODE === 'hideAndSeek' && hsSync) return;   // в прятках фазами правит сервер
    if (!GAME.done) return;
    var ids = Object.keys(others);
    for (var i = 0; i < ids.length; i++) if (!others[ids[i]].fin) return;

    switching = true;
    log(ids.length ? TR('allFinished', 'Все на финише — новая карта!') : TR('finishSolo', 'Финиш! Новая карта'));
    setTimeout(function () {
      nextMap(function () {
        phaseEnds = Date.now() + ROUND_MS;
        switching = false;
      });
    }, 1400);
  }

  // ---------- отрисовка чужих игроков ----------
  GAME.onDraw = function (ctx) {
    /* Правила видимости пряток: пока крутится рулетка и пока прячутся,
       прячущиеся не видят искателя, а искатель не видит прячущихся.
       После начала раунда (охота) видно всех. */
    var hsWait = MODE === 'hideAndSeek' && !VIEW && phase === 'lobby';
    var rt = nowMs() - interp;      // рисуем чуть в прошлом — там есть оба кадра
    Object.keys(others).forEach(function (id) {
      var o = others[id];
      var s = sample(o, rt);
      if (s) { o.x = s.x; o.y = s.y; }
      else { o.x += (o.tx - o.x) * 0.3; o.y += (o.ty - o.y) * 0.3; }
      if (hsWait) {
        if (!hsWinnerId) return;                 // рулетка ещё не ответила — никого не рисуем
        if (id === hsWinnerId) return;           // искатель скрыт от прячущихся
        if (me.role === 'seeker') return;        // искатель не видит прячущихся
      }
      /* Укрытие прячет только на время пряток. После начала раунда
         видно всех — иначе искателю некого искать: сидящих в укрытиях
         не было видно вообще весь раунд. */
      if (o.hid && hsWait) return;
      if (o.hid && MODE !== 'hideAndSeek') return;
      var w = o.w || 22, h = o.h || 74;
      ctx.save();
      ctx.translate(o.x, o.y);
      GAME.figure(w, h, o.caught ? COLOR_CAUGHT : (o.color || COLOR_NORMAL), true, o.skin || null);
      ctx.restore();
      drawTag(ctx, o.name || '', o.say, o.x + w / 2, o.y, (o.h || 74));
    });
    var p = GAME.pl;
    if (GAME.playing && me.name) {
      // свой ник в укрытии показываем бледным — напоминание, что тебя не видно
      ctx.save();
      if (GAME.hidden) ctx.globalAlpha = 0.35;
      drawTag(ctx, me.name, typing, p.x + p.w / 2, p.y, p.h);
      ctx.restore();
    }
  };

  /* Ник теперь белый с лёгкой серой обводкой (просится и на светлый,
     и на тёмный фон карты). Реплики рисуются стопкой с переносом строк:
     раньше длинное сообщение шло одной строкой через весь экран, а размер
     текста зависел от зума — на телефоне при наезде пальцем реплика
     превращалась в плакат во всю ширину. На сенсорных экранах текст
     живёт в экранных пикселях и от масштаба карты не меняется. */
  var BIDI_RE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;  // невидимые символы-перевороты
  function cleanSay(t) { return String(t == null ? '' : t).replace(BIDI_RE, ''); }

  function wrapSay(text, maxChars) {
    var words = cleanSay(text).split(/\s+/).filter(Boolean);
    var lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var t = cur ? cur + ' ' + words[i] : words[i];
      if (t.length > maxChars && cur) { lines.push(cur); cur = words[i]; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // тёмный текст со светлым ореолом: читается и на светлом, и на тёмном фоне
  function paintSay(ctx, t, x, y, tk, color) {
    ctx.lineWidth = 3 * tk;
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.strokeText(t, x, y);
    ctx.fillStyle = color || '#3a3a3a';
    ctx.fillText(t, x, y);
  }

  function drawTag(ctx, name, say, cx, topY, h) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.direction = 'ltr';               // чужие bidi-символы не переворачивают строку
    // на сенсорных экранах текст — постоянного экранного размера, независимо от зума
    var touch = document.documentElement.classList.contains('is-touch');
    var tk = touch ? 1 / Math.max(0.25, (GAME && GAME.viewScale) || 1) : 1;

    ctx.font = (15 * tk) + 'px sans-serif';
    // имя — под игроком: белый с чуть серой обводкой
    ctx.lineWidth = 3 * tk;
    ctx.strokeStyle = 'rgba(122,130,142,.85)';
    ctx.strokeText(name, cx, topY + h + 17 * tk);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, cx, topY + h + 17 * tk);

    // отправленная реплика плавно уплывает вверх и тает —
    // и не пропадает от того, что игрок уже набирает следующую
    var list = spoken[name];
    if (list && list.length) {
      var now = Date.now();
      // отжившие убираем с головы: они самые старые
      while (list.length && now - list[0].born >= SAY_FADE) list.shift();
      if (!list.length) delete spoken[name];
      for (var si = 0; si < list.length; si++) {
        var sp = list[si];
        var k = (now - sp.born) / SAY_FADE;        // 0 → 1
        // каждая следующая реплика висит ниже предыдущей и не наезжает
        var lift = (list.length - 1 - si) * 15 * tk;
        /* Растворение занимает последние полсекунды жизни, а не четверть
           срока: так оно одинаково плавное и у долгих, и у состаренных
           досрочно реплик. */
        var outFrom = 1 - SAY_OUT / SAY_FADE;
        ctx.globalAlpha = k < outFrom ? 1 : Math.max(0, 1 - (k - outFrom) / (1 - outFrom));
        ctx.font = (15 * tk) + 'px sans-serif';
        var lines = wrapSay(sp.text, touch ? 24 : 34);
        for (var li = 0; li < lines.length; li++) {
          var ly = topY - (16 + (lines.length - 1 - li) * 16) * tk - lift - k * 46 * tk;
          paintSay(ctx, lines[li], cx, ly, tk);
        }
      }
      ctx.globalAlpha = 1;
    }

    // то, что печатают прямо сейчас — ниже уплывающей реплики, чтобы не наложились
    if (say) {
      ctx.font = (15 * tk) + 'px sans-serif';
      paintSay(ctx, cleanSay(say), cx, topY - 14 * tk, tk, '#6b7280');
    }
    ctx.restore();
  }

  // ---------- чат ----------
  // текст виден над головой прямо во время набора и пропадает по Enter
  var typing = '';
  var inp = $('gMsg');

  // Enter только отправляет: поле остаётся в фокусе, чтобы можно было
  // сразу писать дальше, а на телефоне не закрывалась клавиатура
  function clearTyping() {
    typing = ''; inp.value = '';
  }
  function stopTyping() {
    clearTyping(); inp.blur();
  }
  /* Одна дорога для всех способов отправки: Enter, кнопка и «Готово» на
     клавиатуре айфона. Раньше «Готово» просто снимало фокус, текст молча
     пропадал, а поле после этого не принимало ввод. */
  function sendTyped() {
    var v = cleanSay(inp.value).trim();    // чистим от символов-переворотов ещё на отправке
    clearTyping();
    if (!v) return false;
    speak(me.name, v);                      // своя реплика сразу уплывает
    if (socket) socket.emit('sendChat', { text: v });
    return true;
  }
  // крестик/Escape — единственный способ выбросить черновик

  inp.addEventListener('input', function () { typing = inp.value; });

  // Касание по полю не должно уходить в игровые обработчики,
  // иначе они гасят событие и поле теряет фокус.
  ['touchstart', 'touchend', 'mousedown', 'pointerdown'].forEach(function (t) {
    inp.addEventListener(t, function (e) { e.stopPropagation(); }, true);
  });
  inp.addEventListener('keydown', function (e) {
    // стрелки пропускаем дальше — ими игрок ходит прямо во время набора
    var move = e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp';
    if (!move) e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      sendTyped();                          // гасим набор, но фокус не теряем
    } else if (e.key === 'Escape') {
      e.preventDefault();
      stopTyping();
    }
  });
  /* Здесь был баг: по blur поле очищалось целиком. На телефоне фокус
     теряется от любого касания по экрану и от появления клавиатуры,
     поэтому набранное сообщение пропадало прямо во время печати.
     Теперь черновик сохраняется: над головой он просто перестаёт
     показываться, пока игрок не вернётся в поле. Стереть — Escape. */
  /* «Готово» на айфоне не даёт ни Enter, ни submit — только blur. Поэтому
     на blur отправляем то, что набрано: иначе текст исчезал бесследно.
     Escape и крестик перед уходом чистят поле сами, так что случайно
     отправить пустой черновик нельзя. */
  inp.addEventListener('blur', function () {
    if (inp.value.trim()) sendTyped();
    typing = '';
  });
  inp.addEventListener('focus', function () { typing = inp.value; });

  /* На айфоне поле в форме реагирует на «Готово» ещё и submit — гасим
     его, чтобы страница не перезагрузилась и ввод не залипал. */
  if (inp.form) inp.form.addEventListener('submit', function (e) {
    e.preventDefault(); sendTyped();
  });

  // на телефоне клавиатуры нет — вызываем её кнопкой
  var talk = $('gTalk');
  if (talk) talk.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    inp.focus();
    var v = inp.value;
    try { inp.setSelectionRange(v.length, v.length); } catch (err) {}
    typing = v;
  });

  // ввод в любое другое текстовое поле (например, ответ в Messages) не должен
  // перехватываться публичным чатом — иначе символы утекают в него
  function isTypingElsewhere() {
    var el = document.activeElement;
    if (!el || el === inp) return false;
    var tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
  }

  // любая печатная клавиша начинает реплику
  document.addEventListener('keydown', function (e) {
    if (document.activeElement === inp) return;
    if (isTypingElsewhere()) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key.length !== 1) return;
    if (e.key === ' ') return;                  // пробел — прыжок
    inp.focus();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && document.activeElement !== $('gMsg')) {
      if (isTypingElsewhere()) return;
      e.preventDefault(); $('gMsg').focus();
    }
  });

  // ---------- оценка карты (только просмотр из Maps Browser) ----------
  $('gRate').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || !currentMap) return;
    fetch('/uploadVote', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'author=' + encodeURIComponent(currentMap.author) +
            '&mapName=' + encodeURIComponent(currentMap.mapName) +
            '&vote=' + b.dataset.v
    }).then(function (r) { return r.json(); }).then(function (r) {
      $('gRating').textContent = (r.status === 'success')
        ? (TR('ratingLbl', 'рейтинг: ') + r.rating)
        : (r.message || TR('errorTxt', 'ошибка'));
    }).catch(function () { $('gRating').textContent = TR('serverDown', 'сервер недоступен'); });
  });

  // сенсорное управление берёт на себя движок:
  // при касании он сам показывает кнопки ◀ ▶ JUMP внизу экрана

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  refreshGameLabels();
})();
