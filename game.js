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
  /* Дальше везде — только эта ссылка. В window после load моста уже нет (см. выше), и условие
     «а есть ли он в window» молча отключало зомби-скин, телепорт искателя на старт раунда и место
     ожидания на настоящем сайте — на localhost мост остаётся, и тесты этого не замечали
     (см. test-zombie-prod.js). */

  var q      = new URLSearchParams(location.search);
  var STORY  = q.get('story') === '1';        // приватная комната по приглашению — см. story.html
  /* Отдельные режимы — прямо в ссылке: game?mode=murder (а не mode=hideAndSeek&variant=murder). Внутри игры
     это те же прятки со своей комнатой (см. hsFixedOf в server.js), поэтому MODE остаётся hideAndSeek, а сам
     режим — VARIANT. Старые ссылки с variant= работают и переписываются в адресной строке на новый вид. */
  var KIND_RE = /^(murder|team|war|party|adventure)$/;
  var MODE_Q = q.get('mode') || 'hideAndSeek';
  var MODE   = KIND_RE.test(MODE_Q) ? 'hideAndSeek' : MODE_Q;   // Story работает и в Race, и в Hide and Seek — режим решает сама ссылка
  var ROOM   = q.get('room') || null;
  var VIEW   = q.get('view');                 // просмотр одной карты из Maps Browser
  var VAUTH  = q.get('author');
  var PRACTICE = q.get('practice') === '1';   // Practice Mode — см. Maps Browser
  // отдельный режим с главной (Murder Mystery, Team Battle) — свои комнаты «murder-1», «team-1» (см. hsFixedOf в server.js)
  var VARIANT = KIND_RE.test(MODE_Q) ? MODE_Q : KIND_RE.test(q.get('variant') || '') ? q.get('variant') : null;
  if (VARIANT && q.get('variant') && window.history && history.replaceState) {
    try {
      var q2 = new URLSearchParams(location.search);
      q2.set('mode', VARIANT); q2.delete('variant');
      history.replaceState(null, '', location.pathname + '?' + q2.toString() + location.hash);
    } catch (e) {}
  }
  var GOD  = PRACTICE && q.get('god') === '1';   // неуязвимость — подопция Practice, ставится там же
  var FLY  = PRACTICE && q.get('fly') === '1';   // полёт — подопция Practice, ставится там же

  /* Заголовок вкладки — по режиму, а не унаследованное от редактора
     «Map Editor» (страница game.html — это сама игра, а не редактор).
     Интерфейс сайта только на английском (см. i18n.js), поэтому здесь
     без словаря — те же строки, что и в нём (hideAndSeek/race). */
  document.title = 'AIBrofist — ' + (MODE === 'race' ? 'Race'
    : ({ murder: 'Murder Mystery', team: 'Team Battle', war: 'War', party: 'Party', adventure: 'Adventure' })[VARIANT] || 'Hide and Seek');

  var ROUND_MS  = 120000;   // раунд — 2 минуты
  var LOBBY_MS  = 30000;    // ожидание в Hide and Seek — 30 секунд

  var COLOR_NORMAL = '#000000';
  var COLOR_SEEKER = '#1e6fe0';   // цвет модели искателя в классике (см. applyColor)
  var COLOR_CAUGHT = '#f97316';   // цвет модели пойманного в классике (см. applyColor)
  var COLOR_OUT    = '#9ca3af';   // гонка Last bro standing: выбывший до конца раунда
  var COLOR_TEAM   = { red: '#dc2626', blue: '#2563eb', green: '#16a34a', yellow: '#ca8a04' };   // команды Team Battle
  var TEAM_ORDER   = ['red', 'blue', 'green', 'yellow'];

  /* Общие раунды гонки (см. raceRooms в server.js): карту, отсчёт перед стартом и конец раунда
     задаёт сервер — вся комната бежит одно и то же. raceSync — сервер прислал фазу; без неё
     (старый сервер) гонка, как раньше, идёт сама по себе. raceGoal — цель раунда из правил
     карты: '' — финишируют все, 'first' — побеждает первый, 'last' — Last bro standing. */
  var raceSync = false, raceGoal = '', raceOutMe = false;

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
    + '#gTop b{color:#111827}'
    + '#gPracticeBadge{background:#f5f3ff;color:#7c3aed;border:1px solid #ddd6fe;border-radius:14px;'
    + 'padding:3px 10px;font-weight:700;font-size:11px;white-space:nowrap}'
    + '#gExit{margin-left:auto;background:#fff;color:#111827;border:1px solid #d7dee7;padding:7px 13px;'
    + 'border-radius:8px;cursor:pointer;font-weight:bold;box-shadow:0 8px 20px -12px rgba(15,23,42,.35)}'
    + '#gExit:active{background:#f2f7fd}'
    + '#gDraw{background:#fff;color:#111827;border:1px solid #d7dee7;width:32px;height:32px;'
    + 'border-radius:8px;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center}'
    + '#gDraw svg{width:17px;height:17px;display:block;pointer-events:none}'
    + '#gDraw:active{background:#f2f7fd}'
    + '#gDraw.on{background:#111827;color:#fff;border-color:#111827}'
    + '#gDraw.limit{opacity:.4;cursor:default}'
    + '#gDraw.spam{background:#fee2e2;color:#ef4444;border-color:#fca5a5;cursor:default;'
    + 'font:700 9.5px sans-serif;letter-spacing:-.02em}'
    + '#gDrawTarget{height:32px;max-width:110px;border:1px solid #d7dee7;border-radius:8px;'
    + 'background:#fff;color:#111827;font:12px sans-serif;padding:0 4px}'
    + '#gMap{position:fixed;right:12px;bottom:12px;z-index:60;background:rgba(255,255,255,.92);'
    + 'border:1px solid #d7dee7;border-radius:9px;padding:8px 13px;font:12.5px sans-serif;max-width:46vw}'
    + '#gMap .n{font-weight:bold;color:#111827;word-break:break-word}'
    + '#gMap .a{color:#6b7280;margin-top:2px}'
    + '#gMap .rate{margin-top:7px;display:flex;gap:6px;align-items:center}'
    + '#gMap .rate button{border:1px solid #111827;background:#fff;color:#111827;border-radius:5px;'
    + 'padding:4px 11px;cursor:pointer;font-size:13px}'
    /* голосование за следующую карту — прямо в карточке карты, только во время охоты */
    + '#gVote{margin-top:8px;padding-top:7px;border-top:1px solid #e5e7eb}'
    + '#gVote .t{color:#6b7280;margin-bottom:5px}'
    + '#gVote button{display:flex;align-items:center;gap:8px;width:100%;margin-top:4px;border:1px solid #d7dee7;'
    + 'background:#fff;color:#111827;border-radius:6px;padding:4px 8px;cursor:pointer;font:12px sans-serif;text-align:left}'
    + '#gVote button .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '#gVote button .c{font-weight:bold;color:#6b7280}'
    + '#gVote button.on{background:#111827;border-color:#111827;color:#fff}'
    + '#gVote button.on .c{color:#e5e7eb}'
    // на телефоне общая высота кнопок 44px съела бы полэкрана на весь раунд — здесь пониже
    + 'html.is-mobile #gVote button,html.is-tablet #gVote button{min-height:30px;padding:3px 8px;margin-top:3px}'
    + '#gBanner{position:fixed;top:0;right:0;bottom:0;left:0;inset:0;width:100%;height:100%;z-index:70;display:none;align-items:center;justify-content:center;'
    + 'flex-direction:column;gap:9px;background:rgba(255,255,255,.93);font:16px sans-serif;text-align:center;padding:24px}'
    + '#gBanner h2{margin:0;font-size:25px}'
    + '#gBanner p{margin:0;color:#6b7280;max-width:420px}'
    + '#gChat{position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0}'
    + '#gMsg{width:1px}'
    /* Чат и Messages стоят парой в правом нижнем углу, над тач-пэдом:
       большой палец правой руки и так лежит рядом с JUMP, тянуться к
       середине правого края или в противоположный угол не нужно.
       Отступ снизу 150px — высота пэда с запасом (см. #gMsgsBtn ниже). */
    + '#gTalk{display:none;position:fixed;right:14px;bottom:150px;z-index:61;'
    + 'width:52px;height:52px;border-radius:50%;border:1px solid #d7dee7;background:#fff;'
    + 'color:#111827;cursor:pointer;padding:0;align-items:center;justify-content:center;'
    + 'box-shadow:0 8px 20px -10px rgba(15,23,42,.45)}'
    + '#gTalk:active{background:#f2f7fd}'
    + '#gTalk svg{width:24px;height:24px;display:block;pointer-events:none}'
    + 'html.is-mobile #gTalk,html.is-tablet #gTalk{display:flex}'
    + 'html.is-mobile #gTalk,html.is-tablet #gTalk{width:58px;height:58px;touch-action:manipulation}'
    + 'html.is-mobile #gTalk svg,html.is-tablet #gTalk svg{width:26px;height:26px}'
    // на телефоне: шапка компактнее, карточка карты уходит наверх, чтобы не мешать кнопкам
    + 'html.is-mobile #gTop,html.is-tablet #gTop{padding:5px 9px;gap:8px;font-size:12px}'
    + 'html.is-mobile #gExit,html.is-tablet #gExit{padding:9px 14px;font-size:13px}'
    // рисование — квадратный значок 32px: под палец нужно 44
    + 'html.is-mobile #gDraw,html.is-tablet #gDraw{min-width:44px;min-height:44px}'
    + 'html.is-mobile #gMap,html.is-tablet #gMap{bottom:auto;top:46px;right:8px;max-width:56vw;'
    + 'padding:6px 10px;font-size:11.5px}'
    /* твой шанс стать искателем — плашка в правом верхнем углу */
    + '#gChance{position:fixed;top:52px;z-index:61;display:none;pointer-events:none;'
    + 'background:rgba(15,23,42,.86);color:#e5e7eb;border-radius:9px;padding:6px 11px;'
    + 'font:600 12.5px sans-serif;box-shadow:0 8px 20px -12px rgba(0,0,0,.7);'
    + 'right:calc(12px + env(safe-area-inset-right,0px))}'
    + '#gChance b{color:#ffffff;font-size:14.5px;margin-left:5px}'
    + 'html.is-mobile #gChance,html.is-tablet #gChance{top:44px;font-size:11.5px;'
    + 'padding:5px 9px;right:calc(8px + env(safe-area-inset-right,0px))}'
    + 'html.is-mobile #gChance b,html.is-tablet #gChance b{font-size:13px}'
    + 'html.is-mobile #gBanner h2,html.is-tablet #gBanner h2{font-size:20px}'
    + 'html.is-mobile #gBanner p,html.is-tablet #gBanner p{font-size:14px}'
    /* безопасные зоны iPhone (чёлка/жесты): в альбомной панели прижимаются
       к краям, env() не поддерживается — строка игнорируется, остаётся базовая */
    + '#gTop{padding-left:calc(12px + env(safe-area-inset-left,0px));'
    + 'padding-right:calc(12px + env(safe-area-inset-right,0px));'
    + 'padding-top:calc(7px + env(safe-area-inset-top,0px))}'
    /* всё, что висит под шапкой (карточка карты, шанс, рулетка, очки),
       ставит relayoutCorner() — по фактическому низу шапки, в который
       верхний вырез уже входит (отдельный margin-top его удваивал: на
       iPhone стоя карточка карты висела на 47px ниже, чем боком); очки
       ещё отступают от левого выреза в альбомной */
    + '#gScoresBox{margin-left:env(safe-area-inset-left,0px)}'
    + '#gTalk{right:calc(14px + env(safe-area-inset-right,0px));touch-action:manipulation}'
    + '#gMap{right:calc(12px + env(safe-area-inset-right,0px))}'
    + 'html.is-mobile #gMap,html.is-tablet #gMap{right:calc(8px + env(safe-area-inset-right,0px))}'
    // у мобильной шапки падинг компактнее — безопасные зоны добавляем к нему же
    + 'html.is-mobile #gTop,html.is-tablet #gTop{padding-left:calc(9px + env(safe-area-inset-left,0px));'
    + 'padding-right:calc(9px + env(safe-area-inset-right,0px));'
    + 'padding-top:calc(5px + env(safe-area-inset-top,0px))}'
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
    + 'text-overflow:ellipsis;color:#e5e7eb;font:700 14px/1.3 sans-serif}'
    + '.rName.rWin{color:#ffffff}'
    + '#gRoulRes{margin-top:4px;text-align:center;color:#fff;font:700 12.5px sans-serif;'
    + 'min-height:1.3em;opacity:0;transition:opacity .3s}'
    + '#gRoulRes.on{opacity:1}'
    // стопка плашек друг под другом и под шапкой считается в JS (relayoutCorner) —
    // шапка сама может перенестись на вторую строку, фиксированный отступ её не учитывал
    + 'html.is-mobile #gRoul,html.is-tablet #gRoul{top:44px;width:130px;'
    + 'right:calc(8px + env(safe-area-inset-right,0px))}'
    + 'html.is-mobile .rName,html.is-tablet .rName{width:130px;font-size:12.5px}'
    /* --- табличка очков забега (Race), левый верхний угол: кнопка-шапка
           «Scores» раскрывает список всех в комнате прямо под собой —
           одна карточка, а не кнопка + отдельная всплывающая панель со
           своим же повторным заголовком «SCORES». Пока список закрыт,
           кнопка — компактный синий овал (тот же приём, что и у бейджа
           «Scores» на profile/.upScoreBadge и активной вкладки на
           leaderboard.html — .lbTab.on/.upStatTab.on), а не во всю
           ширину прямоугольник; при открытии овал расширяется в шапку
           той же карточки со списком под ней. Только для режима Race,
           вне редактора. --- */
    + '#gScoresBox{display:none;position:fixed;top:52px;left:12px;z-index:61;min-width:150px;'
    + 'max-width:200px}'
    + '#gScoresBtn{display:inline-block;padding:7px 16px;background:#111827;color:#fff;'
    + 'border:none;border-radius:20px;cursor:pointer;font:700 12.5px sans-serif;'
    + 'white-space:nowrap;box-shadow:0 8px 20px -12px rgba(15,23,42,.4)}'
    + '#gScoresBtn:active{background:#000000}'
    + '#gScoresBox.open #gScoresBtn{display:block;width:100%;border-radius:14px 14px 0 0}'
    + '#gScoresList{display:none;max-height:24vh;overflow-y:auto;padding:8px 10px;font:12px sans-serif;'
    + 'background:rgba(255,255,255,.96);border-radius:0 0 12px 12px;'
    + 'box-shadow:0 8px 20px -12px rgba(15,23,42,.4)}'
    + '#gScoresBox.open #gScoresList{display:block}'
    + '.gScoreRow{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:3px 0;color:#191919}'
    + '.gScoreRow.me{font-weight:bold;color:#111827}'
    + '.gScoreRow b{color:#e2a600;flex:0 0 auto}'
    + '.gScoreN{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.gScoreAmt{display:flex;align-items:center;gap:5px;flex:0 0 auto}'
    /* тот же приём, что и .upScoreBadge на profile — «Scores» не отдельным
       заголовком над списком, а прямо рядом с числом, у каждой строки и
       у собственного счёта в самой кнопке-шапке */
    + '.gScoreBadge{display:inline-block;padding:2px 8px;border-radius:14px;font-size:9px;'
    + 'font-weight:700;color:#fff;background:#111827;text-transform:uppercase;letter-spacing:.02em}'
    + '.gScoreRow.me .gScoreBadge{background:#111827}'
    + '#gScoresBtn .gScoreBadge{background:rgba(255,255,255,.25)}'
    + '#gScoresBtn b{color:#fff}'
    + '#gScoresEmpty{color:#8b93a1}'
    + 'html.is-mobile #gScoresBox,html.is-tablet #gScoresBox{top:44px}'
    /* --- личные сообщения (Messages) прямо в игре, левый нижний угол:
           та же переписка, что и на messages.html, чтобы не выходить
           из матча ради ответа. Во всех режимах, не только в Race. --- */
    + '#gMsgsBtn{display:none;position:fixed;bottom:14px;left:12px;z-index:61;'
    + 'width:44px;height:44px;padding:0;background:rgba(255,255,255,.92);color:#111827;'
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
    + '#gMsgsBack{display:none;border:none;background:none;color:#111827;cursor:pointer;'
    + 'font-size:14px;font-weight:700;padding:0}'
    + '#gMsgsBack.on{display:inline}'
    + '#gMsgsTitle{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}'
    + '#gMsgsNewBtn{border:none;background:none;color:#111827;cursor:pointer;font-size:18px;'
    + 'line-height:1;padding:0 2px}'
    + '#gMsgsList{flex:1;overflow-y:auto}'
    + '.gMsgsRow{display:block;width:100%;text-align:left;padding:8px 11px;border:none;'
    + 'background:none;cursor:pointer;border-bottom:1px solid #f3f5f8;color:#191919}'
    + '.gMsgsRow:active{background:#f7f9fb}'
    + '.gMsgsRowName{font-weight:700;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.gMsgsRowPrev{font-size:11.5px;color:#8b93a1;overflow:hidden;text-overflow:ellipsis;'
    + 'white-space:nowrap;margin-top:1px}'
    + '.gMsgsDot{display:inline-block;min-width:15px;height:15px;border-radius:8px;background:#111827;'
    + 'color:#fff;font:700 10px/15px sans-serif;text-align:center;margin-left:5px;padding:0 3px}'
    + '#gMsgsEmpty{padding:16px 11px;color:#8b93a1;text-align:center;font-size:12.5px}'
    + '#gMsgsThread{display:none;flex-direction:column;flex:1;min-height:0}'
    + '#gMsgsThread.on{display:flex}'
    + '#gMsgsBody{flex:1;overflow-y:auto;padding:9px 11px;display:flex;flex-direction:column;gap:6px}'
    + '.gMsgsBubble{max-width:82%;padding:6px 10px;border-radius:12px;font-size:12.5px;'
    + 'line-height:1.3;word-break:break-word}'
    + '.gMsgsBubble.me{align-self:flex-end;background:#111827;color:#fff;border-bottom-right-radius:3px}'
    + '.gMsgsBubble.them{align-self:flex-start;background:#f0f3f7;color:#191919;border-bottom-left-radius:3px}'
    + '.gMsgsWhen{display:block;margin-top:2px;font-size:10px;opacity:.65;text-align:right}'
    + '#gMsgsSend{display:flex;gap:6px;padding:8px;border-top:1px solid #eef1f5;flex:0 0 auto}'
    + '#gMsgsInput{flex:1;font-size:13px;padding:7px 9px;border:1px solid #d7dee7;border-radius:8px;min-width:0}'
    + '#gMsgsSendBtn{padding:7px 12px;border-radius:8px;border:1px solid #111827;background:#111827;'
    + 'color:#fff;cursor:pointer;font-weight:700;font-size:12.5px}'
    + '#gMsgsNewRow{display:none;gap:6px;padding:8px 11px;border-bottom:1px solid #eef1f5;flex:0 0 auto}'
    + '#gMsgsNewRow.on{display:flex}'
    + '#gMsgsNewInput{flex:1;font-size:13px;padding:7px 9px;border:1px solid #d7dee7;border-radius:8px;min-width:0}'
    + '#gMsgsNewOk{padding:7px 12px;border-radius:8px;border:1px solid #111827;background:#111827;'
    + 'color:#fff;cursor:pointer;font-weight:700;font-size:12.5px}'
    /* На телефоне (тач-пад для движения снизу, #pad в game.html) прежний
       отступ 100px оказался МЕНЬШЕ реальной высоты пэда (74px кнопки +
       нижний паддинг с учётом safe-area — проверено на живом мобильном
       вьюпорте: пэд был больше 100px, и конверт частично перекрывал
       кнопку ◀). 150px даёт запас даже на телефонах с домашней чертой.

       Чат стоит в правом нижнем углу над пэдом — под большим пальцем,
       который и так лежит там ради JUMP. Messages живёт в ЛЕВОМ нижнем
       углу: справа над пэдом и без него тесно — туда же приходят кнопки
       владельца (Edit и Admin Abuse), и вчетвером они налезали друг на
       друга. */
    + 'html.is-mobile #gTalk,html.is-tablet #gTalk{'
    + 'bottom:calc(150px + env(safe-area-inset-bottom,0px));'
    + 'right:calc(14px + env(safe-area-inset-right,0px))}'
    + 'html.is-mobile #gMsgsBtn,html.is-tablet #gMsgsBtn{'
    + 'bottom:calc(150px + env(safe-area-inset-bottom,0px));left:calc(12px + env(safe-area-inset-left,0px))}'
    + 'html.is-mobile #gMsgsBadge,html.is-tablet #gMsgsBadge{'
    + 'bottom:calc(177px + env(safe-area-inset-bottom,0px));left:calc(39px + env(safe-area-inset-left,0px))}'
    + 'html.is-mobile #gMsgsPanel,html.is-tablet #gMsgsPanel{'
    + 'bottom:calc(200px + env(safe-area-inset-bottom,0px));left:calc(12px + env(safe-area-inset-left,0px));'
    + 'width:calc(100vw - 24px)}'
    /* война и жетоны: панель внизу по центру (на телефоне — над кнопками движения) */
    // по центру через margin:auto и max-content, а не left:50% — иначе ширину режет половина экрана
    + '#gWar,#gAdv{position:fixed;left:0;right:0;margin:0 auto;width:max-content;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:60;'
    + 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 24px);'
    + 'background:rgba(255,255,255,.94);border:1px solid #d7dee7;border-radius:12px;padding:6px 8px;'
    + 'box-shadow:0 8px 20px -12px rgba(15,23,42,.45);font:13px sans-serif;color:#111827}'
    + 'html.is-mobile #gWar,html.is-tablet #gWar,html.is-mobile #gAdv,html.is-tablet #gAdv{bottom:calc(122px + env(safe-area-inset-bottom,0px));font-size:11px;gap:3px;'
    + 'padding:4px 5px;flex-wrap:nowrap}'
    + 'html.is-mobile #gWar .wName,html.is-tablet #gWar .wName,html.is-mobile #gWar .wKey,html.is-tablet #gWar .wKey{display:none}'
    + 'html.is-mobile .wHp,html.is-tablet .wHp{width:54px;height:24px}'
    + 'html.is-mobile .wHp em,html.is-tablet .wHp em{line-height:24px;font-size:10px}'
    + 'html.is-mobile .wSlot,html.is-tablet .wSlot{padding:2px 5px;min-height:30px;display:inline-flex;align-items:center;gap:2px}'
    + '.wIco{width:15px;height:15px;vertical-align:-3px;margin-right:3px}'
    + 'html.is-mobile .wIco,html.is-tablet .wIco{margin-right:1px}'
    + '.wCoin{display:inline-block;width:12px;height:12px;border-radius:50%;background:#fbbf24;border:2px solid #b45309;'
    + 'vertical-align:-3px;margin-right:4px;box-sizing:border-box}'
    + '.wHp{position:relative;display:inline-block;width:120px;height:20px;border-radius:6px;background:#e5e7eb;overflow:hidden}'
    + '.wHp i{position:absolute;left:0;top:0;bottom:0;background:#22c55e;transition:width .15s}'
    + '.wHp em{position:relative;display:block;text-align:center;font-style:normal;font-weight:700;line-height:20px;font-size:12px}'
    + '.wSlot{border:1px solid #d7dee7;background:#fff;border-radius:8px;padding:4px 8px;cursor:pointer;font:inherit;color:#111827;'
    + 'min-height:30px;touch-action:manipulation}'
    + '.wSlot small{color:#6b7280;margin-right:3px}'
    + '.wSlot.on{background:#111827;color:#fff;border-color:#111827}'
    + '.wSlot.on small{color:#d1d5db}'
    + '.wSlot.empty{opacity:.5}'
    + '.wTok{white-space:nowrap}.wTok b{color:#b45309}'
    + '.wShop{border:none;background:#111827;color:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit;font-weight:700;'
    + 'min-height:30px;touch-action:manipulation}'
    + '.wShop small{opacity:.7;font-weight:400}'
    + '#gShop{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:70;width:min(380px,calc(100vw - 24px));'
    + 'max-height:calc(100vh - 40px);overflow:auto;background:#fff;border:1px solid #d7dee7;border-radius:14px;'
    + 'box-shadow:0 20px 50px -20px rgba(15,23,42,.6);font:14px sans-serif;color:#111827;padding:12px}'
    + '.shHead{display:flex;align-items:center;gap:10px;margin-bottom:8px}'
    + '.shHead b{font-size:17px}.shHead span{color:#b45309;font-weight:700;margin-left:auto}'
    + '.shX{border:none;background:#f3f4f6;border-radius:8px;width:32px;height:32px;font-size:20px;cursor:pointer;color:#111827}'
    + '.shRow{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #eef0f3}'
    + '.shTxt{flex:1;min-width:0}.shTxt b{display:block}.shTxt span{display:block;color:#6b7280;font-size:12.5px}'
    + '.shBuy{border:none;background:#111827;color:#fff;border-radius:8px;padding:8px 12px;cursor:pointer;font:inherit;font-weight:700;white-space:nowrap}'
    + '.shBuy:disabled{background:#d1d5db;color:#6b7280;cursor:default}'
    + '.shHint{color:#6b7280;font-size:12px;margin-top:6px}'
    /* кнопка удара — между стрелками и прыжком, под большой палец правой руки */
    + '#gAtk{position:fixed;right:calc(122px + env(safe-area-inset-right,0px));bottom:calc(30px + env(safe-area-inset-bottom,0px));'
    + 'z-index:61;width:64px;height:64px;border-radius:50%;border:none;'
    + 'background:#dc2626;color:#fff;align-items:center;justify-content:center;box-shadow:0 8px 20px -10px rgba(15,23,42,.5);'
    + 'touch-action:none;-webkit-tap-highlight-color:transparent;padding:0}'
    + '#gAtk svg{width:30px;height:30px;display:block;pointer-events:none}'
    + '#gAtk:active{transform:scale(.93)}'
    + 'html:not(.is-mobile):not(.is-tablet) #gAtk{display:none!important}'
    /* «Приключение»: класс на нижней панели и выбор класса в лобби (см. renderAdvPick) */
    + '.advCls{font-weight:700;padding:0 4px}#gAdvHeal:disabled{background:#9ca3af}'
    // панель приключения узкая — на телефоне ей место внизу между стрелками и кнопками, а не поверх бойца
    + 'html.is-mobile #gAdv,html.is-tablet #gAdv{bottom:calc(14px + env(safe-area-inset-bottom,0px))}'
    + '#gAdvPick{position:fixed;left:0;right:0;margin:0 auto;width:min(560px,calc(100vw - 24px));bottom:calc(16px + env(safe-area-inset-bottom,0px));'
    + 'z-index:61;background:#fff;border:1px solid #d7dee7;border-radius:14px;box-shadow:0 20px 50px -20px rgba(15,23,42,.55);'
    + 'font:14px sans-serif;color:#111827;padding:10px 12px;box-sizing:border-box}'
    + 'html.is-mobile #gAdvPick{bottom:calc(122px + env(safe-area-inset-bottom,0px))}'
    + '.apHead{font-weight:700;margin-bottom:8px}.apRow{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}'
    + '.apCls{text-align:left;border:1px solid #d7dee7;background:#f8fafc;border-radius:10px;padding:8px;cursor:pointer;font:inherit;color:#111827;'
    + 'display:flex;flex-direction:column;gap:3px;touch-action:manipulation}'
    + '.apCls span{font-size:12px;color:#4b5563;line-height:1.3}.apCls small{font-size:11.5px;color:#6b7280}'
    + '.apCls.on{border-color:#111827;box-shadow:inset 0 0 0 1px #111827;background:#fff}'
    /* «Вечеринка»: панель мини-игры поверх карты (см. partySet) */
    // слева, ниже полосы сообщений под шапкой — они её не перекрывают; на телефоне — по центру
    + '#gParty{position:fixed;left:12px;top:122px;z-index:62;width:min(420px,calc(100vw - 24px));'
    + 'max-height:calc(100vh - 210px);overflow:auto;background:#fff;border:1px solid #d7dee7;border-radius:14px;'
    + 'box-shadow:0 20px 50px -20px rgba(15,23,42,.55);font:14px sans-serif;color:#111827;padding:10px 12px;box-sizing:border-box}'
    + '@media (max-width:900px){#gParty{left:0;right:0;margin:0 auto}}'
    + 'html.is-mobile #gParty{left:0;right:0;margin:0 auto;top:50px;width:min(480px,calc(100vw - 24px))}'
    + '.pHead{display:flex;align-items:baseline;gap:10px}.pHead b{font-size:16px}#gPSub{color:#6b7280;font-size:13px}'
    + '.pT{margin-left:auto;font-weight:700;font-variant-numeric:tabular-nums}'
    + '.pBar{height:4px;background:#eef0f3;border-radius:4px;margin:6px 0 8px;overflow:hidden}'
    + '.pBar i{display:block;height:100%;width:100%;background:#111827;transition:width .25s linear}'
    + '.pQ{font-weight:700;font-size:16px;margin:4px 0 10px;line-height:1.3}'
    + '.pOpts{display:grid;grid-template-columns:1fr 1fr;gap:8px}'
    + '.pOpt{display:flex;align-items:center;gap:8px;text-align:left;border:1px solid #d7dee7;background:#f8fafc;border-radius:10px;'
    + 'padding:10px;cursor:pointer;font:inherit;color:#111827;min-height:46px;touch-action:manipulation}'
    + '.pOpt small{flex:none;width:22px;height:22px;border-radius:6px;background:#111827;color:#fff;display:flex;align-items:center;'
    + 'justify-content:center;font-size:12px;font-weight:700}'
    + '.pOpt.mine{border-color:#111827;box-shadow:inset 0 0 0 1px #111827}.pOpt.ok{background:#dcfce7;border-color:#16a34a}'
    + '.pOpt.bad{background:#fee2e2;border-color:#dc2626}.pOpt:disabled{cursor:default;color:#111827}'
    + '.pWord{margin:2px 0 8px}.pHint{font-family:monospace;font-size:18px;letter-spacing:2px}'
    // в game.html любой canvas растянут поверх страницы (это поле игры) — доске и модели место в панели
    + '#gParty canvas{position:static;inset:auto}'
    + '#gPBoard{display:block;width:100%;aspect-ratio:480/300;background:#fff;border:1px solid #d7dee7;border-radius:10px;touch-action:none}'
    + '#gPGrid{display:block;width:min(240px,60vw);aspect-ratio:1;margin:0 auto;border:1px solid #d7dee7;border-radius:8px;'
    + 'touch-action:none;image-rendering:pixelated}'
    + '.pTools{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px;justify-content:center}'
    + '.pSw{width:26px;height:26px;border-radius:50%;border:2px solid #d7dee7;cursor:pointer;padding:0}'
    + '.pSw.on{border-color:#111827;box-shadow:inset 0 0 0 2px #fff}.pErase{background:#fff;font-weight:700;color:#6b7280}'
    + '.pBtn{border:none;background:#111827;color:#fff;border-radius:8px;padding:7px 12px;cursor:pointer;font:inherit;font-weight:700}'
    + '.pBtn.on{background:#4b5563}'
    + '.pGuess{display:flex;gap:8px;margin-top:8px}.pGuess input{flex:1;min-width:0;border:1px solid #d7dee7;border-radius:8px;'
    + 'padding:8px 10px;font:inherit;color:#111827;background:#fff}'
    + '.pMsg{color:#6b7280;font-size:13px;margin-top:6px;min-height:16px;text-align:center}'
    + '.pStars{display:flex;gap:6px;justify-content:center;margin-top:8px}'
    + '.pStar{width:40px;height:40px;border-radius:10px;border:1px solid #d7dee7;background:#f8fafc;color:#cbd5e1;font-size:22px;cursor:pointer}'
    + '.pStar.on{color:#f59e0b;border-color:#f59e0b}.pStar:disabled{opacity:.5;cursor:default}'
    + '.pScore{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:8px;padding-top:8px;border-top:1px solid #eef0f3;font-size:12.5px;color:#4b5563}'
    + '.pScore .me{color:#111827;font-weight:700}'
    ;

  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  document.body.insertAdjacentHTML('beforeend',
      '<div id="gTop">'
    + (PRACTICE ? '<span id="gPracticeBadge"><span id="gPracticeBadgeTxt">Режим практики</span><span id="gPracticeMods"></span></span>' : '')
    + '<span id="gRoleBox" style="display:none"><span id="gLblRole">Роль</span>: <b id="gRole"></b></span>'
    + '<span><span id="gLblPlayers">Игроков</span>: <b id="gCount">1</b></span>'
    + '<span><span id="gLblPing">Пинг</span>: <b id="gPing">—</b></span>'
    + '<span id="gTimeBox"><span id="gLblTime">Время</span>: <b id="gTime">—</b></span>'
    // счёт команд в Capture the Flag и Domination (см. renderTeamHud)
    + '<span id="gTeamBox" style="display:none"></span>'
    // жизни на карте гонки (см. raceLives в движке) — только если карта их задаёт
    + '<span id="gLivesBox" style="display:none"><span id="gLblLives">Жизни</span>: <b id="gLives"></b></span>'
    + '<button id="gDraw" aria-label="Draw" title="Draw an arrow for others to see"><svg viewBox="0 0 24 24" '
    + 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg></button>'
    + '<select id="gDrawTarget" title="Кому показать стрелку" style="display:none"><option value="all">Все</option></select>'
    + '<button id="gExit">Меню</button></div>'
    + '<div id="gMap"><div class="n" id="gMapName">Loading map…</div>'
    + '<div class="a" id="gMapAuthor"></div><div class="rate" id="gRate" style="display:none">'
    + '<button data-v="1"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" '
    + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px">'
    + '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg></button>'
    + '<button data-v="-1"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" '
    + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px">'
    + '<path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg></button>'
    + '<span id="gRating" style="color:#6b7280"></span></div>'
    + '<div id="gVote" style="display:none"><div class="t" id="gVoteT">Next map</div><div id="gVoteOpts"></div></div></div>'
    + '<div id="gBanner"><h2 id="gbT"></h2><p id="gbP"></p></div>'
    + '<div id="gRoul"><div id="gRoulView"><div id="gRoulTrack"></div></div>'
    + '<div id="gRoulRes"></div></div>'
    + '<div id="gChance"><span id="gChanceL">Твой шанс</span><b id="gChanceV">—</b></div>'
    + '<div id="gChat"><input id="gMsg" maxlength="90"></div>'
    + '<button id="gTalk" aria-label="Чат"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 '
    + '8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg></button>'
    + '<div id="gScoresBox"><button id="gScoresBtn" aria-label="Scores"></button>'
    + '<div id="gScoresList"></div></div>'
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
    // война и жетоны: нижняя панель (здоровье, оружие, жетоны), магазин, кнопка удара на телефоне
    + '<div id="gWar" style="display:none"></div>'
    + '<div id="gShop" style="display:none"></div>'
    + '<div id="gParty" style="display:none"></div>'
    + '<div id="gAdv" style="display:none"></div><div id="gAdvPick" style="display:none"></div>'
    + '<button id="gAtk" style="display:none" aria-label="Attack"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5 3 6V3h3l11.5 11.5"/>'
    + '<path d="m13 19 6-6"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/></svg></button>'
);

  /* надписи верхней панели обновляются при смене языка */
  function refreshGameLabels() {
    if (typeof renderWarHud === 'function') { renderWarHud(); renderShop(); }
    if (typeof partySet === 'function' && party) { partyKey = ''; partySet(party); }
    if (typeof renderAdvHud === 'function') { renderAdvHud(); renderAdvTop(); renderAdvPick(); }
    $('gLblPlayers').textContent = TR('gPlayers', 'Игроков');
    $('gLblPing').textContent = TR('gPing', 'Пинг');
    $('gLblTime').textContent = TR('gTimeLbl', 'Время');
    $('gLblLives').textContent = TR('gLivesLbl', 'Жизни');
    $('gLblRole').textContent = TR('roleLbl', 'Роль');
    $('gExit').textContent = TR('menu', 'Меню');
    if (PRACTICE) {
      $('gPracticeBadgeTxt').textContent = TR('practiceModeBadge', 'Режим практики');
      var mods = [];
      if (GOD) mods.push(TR('godTxt', 'Неуязвимость'));
      if (FLY) mods.push(TR('flyTxt', 'Полёт'));
      $('gPracticeMods').textContent = mods.length ? ' · ' + mods.join(' + ') : '';
    }
    var cl = $('gChanceL');                      // подпись плашки шанса
    if (cl) cl.textContent = TR('chanceLbl', 'Твой шанс');
    var tk = $('gTalk');                          // кнопка чата — теперь иконка, подпись только для скринридера
    if (tk) tk.setAttribute('aria-label', TR('chatBtn', 'Чат'));
    var sb2 = $('gScoresBtn');
    if (sb2) { sb2.setAttribute('aria-label', TR('raceScoresTitle', 'Scores')); paintScoresBtn(lastMyScore); }
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
  }
  window.addEventListener('bf-lang', refreshGameLabels);

  var $ = function (id) { return document.getElementById(id); };
  /* переводы игрового экрана; i18n.js подгружается позже — поэтому запасной вариант */
  var TR = function (k, f) {
    return (window.I18N && window.I18N.t(k) !== k) ? window.I18N.t(k) : (f || k);
  };
  $('gExit').onclick = function () {
    // просмотр карты из Maps Browser идёt внутри её iframe (см. VIEW выше) —
    // там некуда уходить своей навигацией, просто просим родителя закрыть окно
    if (VIEW && window.parent !== window) { window.parent.postMessage({ type: 'bfClosePractice' }, location.origin); return; }
    // главная — рядом с игрой, а не корень сайта (см. homeUrl в shell.js: тестовый сайт лежит в подпапке)
    location.href = location.protocol === 'file:' ? 'index.html' : './';
  };


  /* ---------- стрелка на карте: показать дорогу другим ----------
     Кнопка включает режим рисования — зажатие мыши/пальца на канвасе
     ставит хвост, отпускание — остриё; между ними всегда прямая линия
     с наконечником (см. drawLineStroke), а не путь за курсором. Точки —
     в мировых координатах (переводим через GAME.view — тот же x/y/s,
     которым движок сам двигает камеру).
     Готовая стрелка сразу видна себе (не ждём круга через сервер — тот
     же приём, что у своей реплики в чате), остальным — как только
     долетит drawLine. Гаснет через DRAW_FADE мс, отдельно рисовать не
     нужно — onDraw просто выкидывает устаревшие перед каждым кадром. */
  var DRAW_FADE = 3000;
  var drawMode = false, curLine = null, lines = [];
  var canvasEl = $('c');
  function toWorld(clientX, clientY) {
    var r = canvasEl.getBoundingClientRect();
    var v = GAME.view;
    return { x: (clientX - r.left - v.x) / v.s, y: (clientY - r.top - v.y) / v.s };
  }
  var gDraw = $('gDraw');

  /* кому показать линию: по умолчанию всем в комнате, но можно выбрать
     конкретного игрока — тогда линию увидит только он (и сам рисующий,
     тому она видна всегда локально). Список в селекте живёт от othersа,
     который сервер обновляет через playersList/playerJoined/playerLeft. */
  var gDrawTarget = $('gDrawTarget');
  var drawTargetId = 'all';
  function refreshDrawTargets() {
    if (!gDrawTarget) return;
    var keep = drawTargetId;
    gDrawTarget.innerHTML = '<option value="all">' + TR('drawAll', 'Все') + '</option>';
    Object.keys(others).forEach(function (id) {
      var o = others[id];
      var opt = document.createElement('option');
      opt.value = id;
      opt.textContent = o.name || id;
      gDrawTarget.appendChild(opt);
    });
    gDrawTarget.value = (keep !== 'all' && others[keep]) ? keep : 'all';
    drawTargetId = gDrawTarget.value;
  }
  if (gDrawTarget) {
    gDrawTarget.onchange = function () { drawTargetId = gDrawTarget.value; };
  }

  /* антиспам кнопки рисования: если суммарно рисовали почти без пауз
     DRAW_SPAM_LIMIT мс из последних DRAW_SPAM_WINDOW — считаем, что
     спамят, и прячем кнопку под таймер на DRAW_LOCK_MS. Переживает
     перезагрузку страницы (localStorage), как список замьюченных выше. */
  var DRAW_SPAM_WINDOW = 5000;
  var DRAW_SPAM_LIMIT = 5000;
  var DRAW_LOCK_MS = 5 * 60 * 1000;
  var DRAW_LOCK_KEY = 'bf_drawLockUntil';
  var drawActivity = []; // {end, dur} — завершённые штрихи за последнее окно
  var drawLockUntil = 0;
  var drawLockTimer = null;
  var drawBtnHtml = gDraw ? gDraw.innerHTML : '';
  try { drawLockUntil = parseInt(localStorage.getItem(DRAW_LOCK_KEY), 10) || 0; } catch (e) {}

  function fmtLockLeft(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var m = Math.floor(s / 60); s = s % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function drawUnlock() {
    if (drawLockTimer) { clearInterval(drawLockTimer); drawLockTimer = null; }
    drawLockUntil = 0;
    try { localStorage.removeItem(DRAW_LOCK_KEY); } catch (e) {}
    if (gDraw) {
      gDraw.classList.remove('spam');
      gDraw.innerHTML = drawBtnHtml;
      gDraw.title = 'Draw an arrow for others to see';
    }
  }
  function drawLockTick() {
    var left = drawLockUntil - Date.now();
    if (left <= 0) { drawUnlock(); return; }
    if (gDraw) gDraw.textContent = fmtLockLeft(left);
  }
  function drawLock() {
    drawActivity = [];
    drawLockUntil = Date.now() + DRAW_LOCK_MS;
    try { localStorage.setItem(DRAW_LOCK_KEY, String(drawLockUntil)); } catch (e) {}
    drawMode = false;
    curLine = null;
    if (gDraw) {
      gDraw.classList.remove('on');
      gDraw.classList.add('spam');
      gDraw.title = 'Drawing locked for spamming — wait it out';
    }
    if (gDrawTarget) gDrawTarget.style.display = 'none';
    if (canvasEl) canvasEl.style.touchAction = '';
    if (drawLockTimer) clearInterval(drawLockTimer);
    drawLockTimer = setInterval(drawLockTick, 1000);
    drawLockTick();
  }
  if (drawLockUntil > Date.now()) {
    if (gDraw) { gDraw.classList.add('spam'); gDraw.title = 'Drawing locked for spamming — wait it out'; }
    drawLockTimer = setInterval(drawLockTick, 1000);
    drawLockTick();
  } else if (drawLockUntil) {
    drawLockUntil = 0;
    try { localStorage.removeItem(DRAW_LOCK_KEY); } catch (e) {}
  }

  if (gDraw && canvasEl) {
    gDraw.onclick = function () {
      if (Date.now() < drawLockUntil) return;
      drawMode = !drawMode;
      gDraw.classList.toggle('on', drawMode);
      canvasEl.style.touchAction = drawMode ? 'none' : '';
      if (gDrawTarget) {
        gDrawTarget.style.display = drawMode ? '' : 'none';
        if (drawMode) refreshDrawTargets();
      }
    };
    // война: клик мышью по полю — удар/выстрел (стрелку рисуют только в режиме рисования)
    canvasEl.addEventListener('pointerdown', function (e) {
      if (drawMode) return;
      // приключение: клик мышью — удар/выстрел туда, куда кликнули
      if (advOn()) {
        if (e.pointerType === 'mouse' && e.button === 0) { aimPt = toWorld(e.clientX, e.clientY); aimAt = Date.now(); e.preventDefault(); advAttack(); }
        return;
      }
      if (!warOn()) return;
      // клик мышью: у пушки — выстрел туда, куда кликнули; касание по карте у пушки — то же самое
      if (e.pointerType === 'mouse' ? e.button === 0 : nearGun() !== -1) {
        aimPt = toWorld(e.clientX, e.clientY); aimAt = Date.now();
        e.preventDefault(); attack();
      }
    });
    // прицел пушки идёт за мышью (см. gunVel)
    canvasEl.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'mouse' && (warOn() || advOn())) { aimPt = toWorld(e.clientX, e.clientY); aimAt = Date.now(); }
    });
    canvasEl.addEventListener('pointerdown', function (e) {
      if (!drawMode || gDraw.classList.contains('limit') || Date.now() < drawLockUntil) return;
      var p = toWorld(e.clientX, e.clientY);
      // прямая стрелка: только хвост и остриё, без промежуточных точек пути
      curLine = { points: [p, p], born: 0, started: Date.now() };
      e.preventDefault();
    });
    canvasEl.addEventListener('pointermove', function (e) {
      if (!curLine) return;
      curLine.points[1] = toWorld(e.clientX, e.clientY);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) {
      canvasEl.addEventListener(t, function () {
        if (!curLine) return;
        var a = curLine.points[0], b = curLine.points[1];
        // короче минимального рывка — считаем случайным тапом, не стрелка
        if (Math.hypot(b.x - a.x, b.y - a.y) > 8) {
          curLine.born = Date.now();
          lines.push(curLine);
          if (socket) socket.emit('drawLine', { points: curLine.points, target: drawTargetId !== 'all' ? drawTargetId : undefined });

          var now = curLine.born;
          drawActivity.push({ end: now, dur: now - (curLine.started || now) });
          drawActivity = drawActivity.filter(function (act) { return now - act.end < DRAW_SPAM_WINDOW; });
          var total = 0;
          for (var i = 0; i < drawActivity.length; i++) total += drawActivity[i].dur;
          if (total >= DRAW_SPAM_LIMIT) drawLock();
        }
        curLine = null;
      });
    });
  }

  // мост для автотестов — тем же приёмом, что __bfChatDebug выше.
  // get lines() — не сырая ссылка: onDraw пересоздаёт массив на filter()
  // каждый кадр, старая ссылка иначе тут же устареет
  if (/^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(location.hostname)) {
    window.__bfDrawDebug = { get lines() { return lines; }, toWorld: toWorld, setDrawMode: function (v) {
      drawMode = !!v; if (gDraw) gDraw.classList.toggle('on', drawMode);
    }, get lockUntil() { return drawLockUntil; }, forceSpamLock: drawLock,
    get target() { return drawTargetId; }, setTarget: function (id) { drawTargetId = id; },
    refreshTargets: refreshDrawTargets, get myId() { return socket && socket.id; } };
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------- табличка очков забега (Race), левый верхний угол ----------
  // «Scores» — бейдж рядом с числом (тот же приём, что .upScoreBadge на
  // profile), а не заголовок отдельной строкой над списком: у самой
  // кнопки-шапки (свёрнутый вид) и у каждой строки списка (развёрнутый).
  var scoresBox = $('gScoresBox'), scoresBtn = $('gScoresBtn');
  var lastMyScore = 0;
  function paintScoresBtn(myScore) {
    if (!scoresBtn) return;
    scoresBtn.innerHTML = '<span class="gScoreBadge">' + TR('raceScoresTitle', 'Scores') + '</span> <b>' + (myScore || 0) + '</b>';
  }
  paintScoresBtn(0);
  if (scoresBtn) scoresBtn.addEventListener('click', function () {
    scoresBox.classList.toggle('open');
  });
  function renderRaceScores(list) {
    if (!scoresBox) return;
    var box = $('gScoresList');
    box.innerHTML = (list && list.length)
      ? list.map(function (r) {
          var mine = r.name === me.name;
          return '<div class="gScoreRow' + (mine ? ' me' : '') + '">'
            + '<span class="gScoreN">' + esc(r.name) + '</span>'
            + '<span class="gScoreAmt"><span class="gScoreBadge">' + TR('raceScoresTitle', 'Scores') + '</span><b>' + (r.score || 0) + '</b></span></div>';
        }).join('')
      : '<div id="gScoresEmpty">' + TR('topScoresEmpty', 'No scores yet') + '</div>';
    var mine = list && list.filter(function (r) { return r.name === me.name; })[0];
    lastMyScore = mine ? (mine.score || 0) : 0;
    paintScoresBtn(lastMyScore);
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
      // тот же счётчик держит и значок в боковом меню на остальных страницах
      if (window.BFShell && BFShell.refreshNotifications) BFShell.refreshNotifications();
      if (!msgsActiveId) msgsRenderList();
    }).catch(function () {});
  }

  // тот же формат, что на странице Messages: «Sep 13, 08:41»
  function msgsFmtTime(ms) {
    var d = new Date(ms);
    return isNaN(d.getTime()) ? '' : d.toLocaleString('en-US',
      { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function msgsDrawMessages(list) {
    var atBottom = msgsBody.scrollTop + msgsBody.clientHeight >= msgsBody.scrollHeight - 30;
    msgsBody.innerHTML = list.map(function (m) {
      var mine = m.from === me.name;
      /* Время отправки было только на странице Messages, а в игровой
         панели — нет: в переписке из нескольких реплик подряд нельзя
         было понять, это ответ минуту назад или вчерашний. */
      // у старых сообщений времени нет — пустую строку под текстом не рисуем
      var when = msgsFmtTime(m.at);
      return '<div class="gMsgsBubble ' + (mine ? 'me' : 'them') + '">' + esc(m.text)
        + (when ? '<span class="gMsgsWhen">' + when + '</span>' : '') + '</div>';
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
        if (!d || d.guest || !msgsBtn || hideChatPref) return;
        msgsBtn.style.display = 'flex';
        msgsLoadThreads();
        clearInterval(msgsPollTimer);
        msgsPollTimer = setInterval(msgsLoadThreads, 8000);
      }).catch(function () {});
  }

  /* «Скрыть чат» из Settings (см. accounts.js /getMySettings): game.html
     не грузит shell.js вообще (это голый игровой экран, без сайдбара), так
     что общий window.BF_HIDE_CHAT оттуда сюда не долетает — спрашиваем
     сервер сами, тем же приёмом, что и msgsSetup() чуть выше. Пока ответ
     не пришёл, chatMessage/бегущая строка не режется — реплика-другая до
     ответа сервера ничем не грозит, а вот держать чат в подвешенном
     состоянии до первого сетевого запроса не стоит. */
  var hideChatPref = false;
  fetch('/getMySettings', { credentials: 'same-origin' }).then(function (r) { return r.json(); })
    .then(function (d) {
      hideChatPref = !!(d && d.data && d.data.hideChat);
      if (hideChatPref && msgsBtn) msgsBtn.style.display = 'none';
    }).catch(function () {});

  /* Комната отдельного режима (murder-1 и т.п.), а режим ещё не начался: игроков мало, на карте
     нет укрытий для команд или раунд уже шёл, когда пришёл второй, — говорим, почему пока
     обычные прятки (см. hsFixedWait в server.js). */
  function fixedWaitLog(d) {
    if (!d || !d.fixed || !d.wait) return;
    var m = '<b>' + esc(variantName(d.fixed)) + '</b>';
    if (d.wait === 'players') log(TR('fixedWaitPlayers', '{m} начнётся, когда игроков будет {n}. Пока — обычные прятки.')
      .replace('{m}', m).replace('{n}', String(d.need || 2)));
    else if (d.wait === 'map') log(TR('fixedWaitMap', 'На этой карте нет укрытий для режима {m}. Этот раунд — обычные прятки.').replace('{m}', m));
    else if (d.wait === 'next') log(TR('fixedWaitNext', '{m} начнётся со следующего раунда.').replace('{m}', m));
  }

  // системные сообщения — короткой плашкой, история не хранится
  /* Сообщения стопкой сразу под шапкой: раньше каждое появлялось в одной и той же точке, и
     события подряд (карта, флаг, очко) наезжали друг на друга. Одновременно — не больше четырёх. */
  function log(html) {
    var box = $('gLog');
    if (!box) {
      box = document.createElement('div');
      box.id = 'gLog';
      box.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);z-index:62;display:flex;' +
        'flex-direction:column;align-items:center;gap:5px;pointer-events:none;max-width:calc(100vw - 24px)';
      document.body.appendChild(box);
    }
    var bar = $('gTop');
    box.style.top = (bar ? Math.round(bar.getBoundingClientRect().bottom) + 6 : 52) + 'px';
    var d = document.createElement('div');
    d.innerHTML = html;
    d.style.cssText = 'background:rgba(0,0,0,.62);color:#fff;padding:7px 15px;border-radius:16px;' +
      'font:12.5px sans-serif;text-align:center';
    box.appendChild(d);
    while (box.children.length > 4) box.removeChild(box.firstChild);
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
    // очки — слева, своей колонкой: тоже сразу под шапкой (на телефоне
    // фиксированные 44px были ниже шапки в 54px — табличка налезала на неё)
    var scores = $('gScoresBox');
    if (scores) scores.style.top = y + 'px';

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
  try {
    // и любое другое изменение высоты шапки (время, пинг, перенос строки)
    new ResizeObserver(relayoutCorner).observe($('gTop'));
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
  /* Отступ реплики от темени — облачко текста должно стоять отдельно над
     головой, не приклеиваясь к ней (было 14-16px, вплотную к модели). */
  var SAY_GAP = 38;
  /* Реплики копятся стопкой: новая не стирает предыдущую, а встаёт под
     ней. Раньше здесь лежала одна запись на игрока, поэтому второе
     сообщение затирало первое ещё до того, как его успевали прочитать. */
  // Object.create(null): игрок по имени "__proto__" не должен получать
  // унаследованный Object.prototype вместо своего личного массива реплик
  var spoken = Object.create(null);
  /* Купленные цвета: реплик (chatColor) и ника под фигурой (nickColor) — два
     отдельных. Сервер присылает оба в списке игроков, цвет реплики ещё и в
     каждой реплике (см. server.js), здесь они копятся по нику. */
  var chatColors = Object.create(null);
  function setChatColor(name, c) {
    if (!name) return;
    if (/^#[0-9a-f]{6}$/i.test(c || '')) chatColors[name] = c; else delete chatColors[name];
  }
  var nickColors = Object.create(null);
  function setNickColor(name, c) {
    if (!name) return;
    if (/^#[0-9a-f]{6}$/i.test(c || '')) nickColors[name] = c; else delete nickColors[name];
  }
  /* Тег клана перед ником (см. clans.js): сервер присылает его в списке игроков. */
  var clanTags = Object.create(null);
  function setClan(name, tag, color) {
    if (!name) return;
    if (/^[A-Za-z0-9]{2,5}$/.test(tag || '') && /^#[0-9a-f]{6}$/i.test(color || '')) clanTags[name] = { tag: tag, color: color };
    else delete clanTags[name];
  }
  /* Подпись поверх карты: одна и та же мягкая серая обводка у любого цвета текста — ника, тега
     клана, реплик. Раньше цвет обводки зависел от цвета букв, и у красных и зелёных она была
     почти белой и пропадала на светлом фоне, а у белых и жёлтых — серой.
     Единственное исключение — серый, почти совпадающий с самой обводкой: он растворялся бы в ней
     (так пропадал набираемый текст чата). Для него обводка светлая или тёмная — смотря по тому,
     светлее серый обводки или темнее. */
  var INK_EDGE = [107, 114, 128];          // #6b7280
  function inkEdgeFor(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return '#6b7280';
    var n = parseInt(color.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    var d = Math.sqrt(Math.pow(r - INK_EDGE[0], 2) + Math.pow(g - INK_EDGE[1], 2) + Math.pow(b - INK_EDGE[2], 2));
    if (d >= 60) return '#6b7280';
    return 0.299 * r + 0.587 * g + 0.114 * b < 113 ? '#e5e7eb' : '#1f2937';
  }
  function inkText(ctx, t, x, y, tk, color) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.4 * tk;
    ctx.strokeStyle = inkEdgeFor(color);
    ctx.strokeText(t, x, y);
    ctx.fillStyle = color;
    ctx.fillText(t, x, y);
  }
  /* Мьют чата — только локально у себя: сам заглушённый ничего не
     замечает, его сообщения как ни в чём не бывало доходят до всех
     остальных, просто эта вкладка их не рисует. Живёт в localStorage,
     как и тема (см. theme.js) — чисто клиентская настройка. */
  var MUTE_KEY = 'bfMutedPlayers';
  var muted = (function () {
    try { return JSON.parse(localStorage.getItem(MUTE_KEY) || '[]'); } catch (e) { return []; }
  })();
  function saveMuted() {
    try { localStorage.setItem(MUTE_KEY, JSON.stringify(muted)); } catch (e) {}
  }
  function isMuted(name) { return muted.indexOf(String(name || '').toLowerCase()) !== -1; }
  function muteName(name) {
    var k = String(name || '').trim().toLowerCase();
    if (!k || isMuted(k)) return false;
    muted.push(k); saveMuted(); return true;
  }
  function unmuteName(name) {
    var k = String(name || '').trim().toLowerCase();
    var i = muted.indexOf(k);
    if (i === -1) return false;
    muted.splice(i, 1); saveMuted(); return true;
  }
  // мост для автотестов — тем же приёмом, что window.GAME в game.html
  // (см. hideBridge() там): реплики рисуются на canvas, без него снаружи
  // нечем проверить, что заглушённый действительно не долетает до экрана
  if (/^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(location.hostname)) {
    window.__bfChatDebug = { spoken: spoken, isMuted: isMuted, chatColors: chatColors, nickColors: nickColors, clanTags: clanTags };
  }
  function speak(who, text) {
    if (!text) return;
    text = cleanSay(text);   // невидимые bidi-символы не переворачивают слова на экране
    var list = spoken[who] || (spoken[who] = []);
    list.push({ text: text, born: Date.now(), color: chatColors[who] || '' });
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
      GAME.practice = PRACTICE;
      GAME.godMode = GOD;
      GAME.flying = FLY;
      GAME.startPlay();
      finSent = false;
      applyColor();
      // время на карту гонки задаёт сама карта (лабиринту — 5 или 10 минут, см. raceTimeMin)
      if (MODE === 'race' && !STORY && !VIEW && !raceSync) phaseEnds = Date.now() + (GAME.raceTimeMin ? GAME.raceTimeMin * 60000 : ROUND_MS);
      /* Сервер должен знать, что забег начался, ДО того как придёт
         raceFinish — иначе финиш без старта ничем не подтверждён и
         монет не будет (см. server.js). Но join() ещё может быть не
         подтверждён сервером: он идёт через Promise.all с двумя fetch,
         а getRandomMap — одиночный fetch и почти всегда успевает первым.
         Раньше raceStart уходил сразу и до подтверждения join не долетал
         до gameState.players — сервер тихо его игнорировал, а потом так
         же тихо отклонял честный raceFinish. Теперь запрос откладывается
         до joined и досылается, как только вход подтверждён. */
      // в общей гонке забег начинается не с загрузки карты, а со старта раунда (racePhase)
      if (MODE === 'race' && !VIEW && !raceSync) {
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
  /* Классика красит саму модель по роли — синий искатель, оранжевый
     пойманный — силуэт должен быть виден издалека, а не только у ника
     вблизи. figure() уже умеет это (см. drawSkinTinted в game.html —
     перекрашивает даже свой скин-фото), тут только выбор цвета. В apoc
     цвет модели не играет роли вообще — заражённые рисуются отдельной
     моделью зомби (см. meIsZombie/figureZombie), поэтому там всегда
     обычный цвет. */
  function applyColor() {
    if (MODE === 'hideAndSeek' && teamVariant() && myTeam()) { GAME.myColor = COLOR_TEAM[myTeam()]; return; }
    if (MODE === 'hideAndSeek' && !hsApocRound) {
      // убийца в Murder Mystery выглядит как все — его роль тайная
      if (me.role === 'seeker' && hsVariant !== 'murder') { GAME.myColor = COLOR_SEEKER; return; }
      if (me.caught) { GAME.myColor = COLOR_CAUGHT; return; }
    }
    GAME.myColor = MODE === 'race' && raceOutMe ? COLOR_OUT : COLOR_NORMAL;
  }
  /* Заражение (см. applyInfected) живёт ровно один раунд — новый раунд
     обнуляет и список охотящихся, и пометки «уже был целью». Раньше её
     снимали только у себя и только при уходе в лобби, поэтому чужие
     фигуры оставались помеченными навсегда, а искатель не мог поймать
     их снова. */
  function clearCaught() {
    me.caught = false;
    GAME.frozen = false;          // Cops and Robbers: новый раунд — из тюрьмы все выходят
    Object.keys(others).forEach(function (id) { others[id].caught = false; });
    caughtNames = {};
    hsSeekerIds = {};
    applyColor();
  }
  var caughtNames = {};
  // все, кто сейчас охотится в этом раунде — искатель, выбранный рулеткой,
  // плюс каждый, кого заразили по ходу охоты (см. applyInfected)
  var hsSeekerIds = {};

  // текущий раунд — apoc (см. d.apoc в hsPhase/hsState): пока он идёт,
  // заражённые (искатели) выглядят зомби, а не обычной фигуркой —
  // см. syncMeIsZombie() и GAME.figureZombie в GAME.onDraw ниже
  var hsApocRound = false;
  /* Вариант раунда (см. hsPickVariant в server.js): classic | zombie | murder | cops.
     В Murder Mystery роль у каждого своя и тайная — её присылает только сервер (hsSecret). */
  var hsVariant = 'classic';
  var hsSecret = null;            // murderer | sheriff | innocent
  var hsSecretAt = null;          // Murder Mystery: укрытие, у которого я появляюсь (см. hsSecret)
  var mmGraceUntil = 0;           // Murder Mystery: до этого момента убийца никого не трогает
  /* Командные варианты (Capture the Flag, Domination): команда каждого (id -> red|blue), базы —
     укрытия карты, точки захвата и счёт присылает сервер (hsRoulette/hsPhase/ctfState/domState). */
  var hsTeams = {}, hsBases = null, hsPoints = null, ctfState = null, domState = null;
  function teamVariant() { return hsVariant === 'ctf' || hsVariant === 'dom' || hsVariant === 'tdm' || hsVariant === 'cp' || hsVariant === 'pirate'; }
  function myTeam() { return socket ? hsTeams[socket.id] || null : null; }
  function resetTeams() { applyTeamState({}); }
  // состав команд, базы, точки и счёт — целиком из hsState (вошедший посреди игры)
  function applyTeamState(d) {
    hsTeams = d.teams || {}; hsBases = d.bases || null; hsPoints = d.points || null;
    ctfState = d.ctf || null; domState = d.dom || null;
    renderTeamHud();
  }
  // на базе стоят внизу укрытия, по центру
  function hsTeamSpawn() {
    var t = myTeam(), b = t && hsBases && hsBases[t], p = GAME.pl;
    if (!b || !p || !GAME.teleportTo) return;
    GAME.teleportTo(b.x + b.w / 2 - p.w / 2, b.y + b.h - p.h);
  }
  function teamName(t) {
    return t === 'blue' ? TR('teamBlue', 'Синие') : t === 'green' ? TR('teamGreen', 'Зелёные')
      : t === 'yellow' ? TR('teamYellow', 'Жёлтые') : TR('teamRed', 'Красные');
  }
  // команды этого раунда по порядку (две или четыре) — по счёту или по базам
  function teamsInPlay(sc) {
    var src = sc || hsBases || {};
    return TEAM_ORDER.filter(function (t) { return src[t] !== undefined; });
  }
  // счёт цифрами через двоеточие: «2 : 1» или «2 : 1 : 0 : 3»
  function scoreLine(sc) {
    return teamsInPlay(sc).map(function (t) { return sc[t] | 0; }).join(' : ');
  }
  function teamTag(t) { return '<b style="color:' + COLOR_TEAM[t] + '">' + esc(teamName(t)) + '</b>'; }
  /* Наряд роли (см. OUTFIT в game.html): копы, грабители и игроки команд видны всем; убийца и
     шериф Murder Mystery видят свой наряд только у себя — остальным он не показывается и по сети
     не уходит. Роли известны, когда рулетка уже назначила их (hsWinnerId) или идёт охота. */
  function rolesKnown() { return MODE === 'hideAndSeek' && !VIEW && (phase === 'round' || !!hsWinnerId); }
  function outfitFor(id) {
    if (!rolesKnown()) return null;
    if (advV(hsVariant) && advCls[id]) return { kind: advCls[id] };      // класс приключения
    if (hsVariant === 'bro' && broId && id === broId) return { kind: 'bro' };
    if (hsVariant === 'cops') return hsSeekerIds[id] ? { kind: 'cop' } : { kind: 'robber', arg: !!(others[id] && others[id].caught) };
    if (teamVariant() && hsTeams[id]) return { kind: 'team', arg: COLOR_TEAM[hsTeams[id]] };
    return null;
  }
  function syncMyOutfit() {
    var o = null;
    if (rolesKnown() && socket) {
      if (hsVariant === 'cops') o = me.role === 'seeker' ? { kind: 'cop' } : { kind: 'robber', arg: !!me.caught };
      else if (teamVariant() && myTeam()) o = { kind: 'team', arg: COLOR_TEAM[myTeam()] };
      else if (hsVariant === 'murder' && !me.caught && (hsSecret === 'murderer' || hsSecret === 'sheriff')) o = { kind: hsSecret };
      else if (hsVariant === 'bro' && broId && socket.id === broId) o = { kind: 'bro' };
      else if (advV(hsVariant)) o = { kind: myCls() };
    }
    GAME.myOutfit = o;
  }
  // счёт в шапке: «Red 1 : 0 Blue», у четырёх команд — «Red 1 · Blue 0 · Green 2 · Yellow 0»
  function renderTeamHud() {
    var box = $('gTeamBox');
    if (!box) return;
    if (advOn()) { renderAdvTop(); return; }       // приключение: этаж или волна (см. renderAdvTop)
    // война без команд: лидер по нокаутам и мои; Bro RED — его здоровье
    if (war && (war.v === 'ffa' || war.v === 'hunger' || war.v === 'bro') && socket) {
      box.style.display = '';
      if (war.v === 'bro') {
        box.innerHTML = '<b style="color:#dc2626">' + esc(TR('modeBro', 'Bro RED')) + ' ' + Math.max(0, war.hp[war.bro] | 0) + '</b>';
        return;
      }
      var lead = null, lk = 0;
      Object.keys(war.kills).forEach(function (id) { if ((war.kills[id] | 0) > lk) { lk = war.kills[id] | 0; lead = id; } });
      box.innerHTML = esc(TR('warKillsLbl', 'Нокауты')) + ': <b>' + (war.kills[socket.id] | 0) + '</b>'
        + (lead ? ' · ' + esc(TR('warLeadLbl', 'Лидер')) + ': <b>' + esc(nameOfId(lead)) + ' ' + lk + '</b>' : '');
      return;
    }
    var sc = (war && (war.v === 'tdm' || war.v === 'pirate') ? war.score : null) || (ctfState && ctfState.score) || (domState && domState.score);
    if (!teamVariant() || !sc) { box.style.display = 'none'; return; }
    box.style.display = '';
    var ts = teamsInPlay(sc);
    if (ts.length === 2) {
      box.innerHTML = '<b style="color:' + COLOR_TEAM[ts[0]] + '">' + esc(teamName(ts[0])) + ' ' + (sc[ts[0]] | 0) + '</b> : '
        + '<b style="color:' + COLOR_TEAM[ts[1]] + '">' + (sc[ts[1]] | 0) + ' ' + esc(teamName(ts[1])) + '</b>';
    } else {
      box.innerHTML = ts.map(function (t) {
        return '<b style="color:' + COLOR_TEAM[t] + '">' + esc(teamName(t)) + ' ' + (sc[t] | 0) + '</b>';
      }).join(' · ');
    }
  }
  function syncMeIsZombie() {
    GAME.meIsZombie = !!(hsApocRound && me.role === 'seeker');
  }

  function setRole(role) {
    me.role = role; me.caught = false;
    $('gRoleBox').style.display = 'inline';
    // apoc-раунд называет охотника зомби, а не искателем — та же роль
    // внутри (seeker), просто другая тема (см. hsApocRound/syncMeIsZombie)
    $('gRole').textContent = role === 'seeker'
      ? (hsApocRound ? TR('roleZombie', 'Зомби')
        : hsVariant === 'murder' ? TR('roleMurderer', 'Убийца')
        : hsVariant === 'cops' ? TR('roleCop', 'Коп') : TR('roleSeeker', 'Искатель'))
      : teamVariant() ? (myTeam() ? teamName(myTeam()) : '—')
      : hsVariant === 'bro' ? (socket && socket.id === broId ? TR('roleBro', 'Bro RED') : TR('roleFighter', 'Боец'))
      : partyGame(hsVariant) || hsVariant === 'wait' ? TR('rolePlayer', 'Игрок')
      : advV(hsVariant) ? clsName(myCls())
      : isWarV(hsVariant) ? TR('roleFighter', 'Боец')
      : (hsVariant === 'murder' ? (hsSecret === 'sheriff' ? TR('roleSheriff', 'Шериф') : TR('roleInnocent', 'Невиновный'))
        : hsVariant === 'cops' ? TR('roleRobber', 'Грабитель') : TR('roleHider', 'Прячется'));
    applyColor();
    syncMeIsZombie();
  }

  /* Классика: пойманный выходит из игры — не присоединяется к охоте, роль
     не меняется. Видно по оранжевой полосе под ником (см. drawTag), а не
     по синей, как у искателя/зомби. Событие приходит от сервера (hsOut) —
     решает только он (см. hsDoInfect в server.js). */
  function applyOut(id, name, d) {
    d = d || {};
    if (id === socket.id) {
      me.caught = true;
      /* Cops and Robbers: пойманный замирает, пока его не освободят (см. frz в game.html), — в тюрьме:
         на метке «Место искателя», если она есть на карте (идея 2019 года: «robber teleports to jail») */
      if (d.jail) { GAME.frozen = true; if (GAME.seekerWaitSpot) GAME.seekerWaitSpot(); }
      applyColor();
      if (window.BFSound) BFSound.death();
    } else if (others[id]) {
      others[id].caught = true;
    }
    var n = esc(name || nameOfId(id));
    log(d.murderer ? TR('mmCaught', 'Шериф поймал убийцу — это {n}!').replace('{n}', '<b>' + n + '</b>')
      : d.jail ? TR('hsJailed', '{n} арестован — коснись его, чтобы освободить').replace('{n}', n)
      : TR('hsOut', '{n} пойман и выходит из игры').replace('{n}', n));
  }

  /* Роли Murder Mystery и Cops and Robbers: рулетки игроков нет — кто убийца, знать нельзя,
     а копов сразу несколько. Роль приходит вместе с вариантом (hsRoulette/hsSecret/hsState);
     эта функция только раскладывает её по hsSeekerIds и подписи. */
  function fixVariantRole() {
    if (teamVariant()) { setRole('hider'); return; }
    if (hsVariant === 'murder') {
      if (hsSecret === 'murderer') hsSeekerIds[socket.id] = true;
      setRole(hsSecret === 'murderer' ? 'seeker' : 'hider');
    } else if (hsVariant === 'cops') {
      setRole(hsSeekerIds[socket.id] ? 'seeker' : 'hider');
    }
  }
  function variantRoleText() {
    if (hsVariant === 'wait') return TR('roulWait', 'Ждём игроков — пока можно побегать по карте.');
    if (hsVariant === 'quest') return TR('roulQuest', 'Поднимись на вершину башни и победи босса!');
    if (hsVariant === 'defense') return TR('roulDefense', 'Защити кристалл от волн врагов!');
    if (hsVariant === 'quiz') return TR('roulQuiz', 'Викторина об игре — отвечай быстрее всех!');
    if (hsVariant === 'guess') return TR('roulGuess', 'Один рисует — остальные угадывают!');
    if (hsVariant === 'build') return TR('roulBuild', 'Построй модель на тему!');
    if (hsVariant === 'ffa') return TR('roulFfa', 'Все против всех!');
    if (hsVariant === 'hunger') return TR('roulHunger', 'Одна жизнь — останься последним!');
    if (teamVariant()) {
      var mt = myTeam();
      return mt === 'blue' ? TR('roulYouBlue', 'Ты в синей команде!') : mt === 'green' ? TR('roulYouGreen', 'Ты в зелёной команде!')
        : mt === 'yellow' ? TR('roulYouYellow', 'Ты в жёлтой команде!') : TR('roulYouRed', 'Ты в красной команде!');
    }
    if (hsVariant === 'cops') return me.role === 'seeker' ? TR('roulYouCop', 'Ты коп!') : TR('roulYouRobber', 'Ты грабитель!');
    return hsSecret === 'murderer' ? TR('roulYouMurderer', 'Ты убийца!')
      : hsSecret === 'sheriff' ? TR('roulYouSheriff', 'Ты шериф!') : TR('roulYouInnocent', 'Ты невиновный!');
  }
  function variantHint() {
    if (hsVariant === 'wait') return TR('hintWait', 'Режим начнётся, когда игроков хватит. Пока — свободная пробежка по карте.');
    if (hsVariant === 'quest') return TR('hintQuest', 'Выбей всех врагов этажа — откроется люк наверх. F или клик — удар, у мага Q — лечение.');
    if (hsVariant === 'defense') return TR('hintDefense', 'Враги идут волнами с обоих краёв — не пускай их к кристаллу. F или клик — удар.');
    if (hsVariant === 'quiz') return TR('hintQuiz', 'Отвечай кнопками или клавишами 1–4: чем быстрее верный ответ, тем больше очков.');
    if (hsVariant === 'guess') return TR('hintGuess', 'Один рисует слово, остальные пишут догадки: чем быстрее угадал, тем больше очков.');
    if (hsVariant === 'build') return TR('hintBuild', 'Построй модель на тему по клеткам, потом оцени чужие от 1 до 5 звёзд.');
    if (hsVariant === 'ffa') return TR('hintFfa', 'Выбивай всех: F или клик — удар, 1–4 — оружие, B — магазин. Жетоны лежат на карте.');
    if (hsVariant === 'tdm') return TR('hintTdm', 'Выбивай соперников — каждое очко идёт твоей команде. F — удар, B — магазин.');
    if (hsVariant === 'pirate') return TR('hintPirate', 'Твоя команда — на своём корабле. Встань у пушки и жми F или клик: ядро летит туда, куда целишься. Ядовитая вода выбивает.');
    if (hsVariant === 'hunger') return TR('hintHunger', 'Одна жизнь на раунд. Собирай жетоны, покупай оружие и останься последним.');
    if (hsVariant === 'cp') return TR('hintCp', 'Держи точки с командой; выбитые соперники точку не держат. F — удар, B — магазин.');
    if (hsVariant === 'bro') return socket && socket.id === broId ? TR('hintBro', 'Ты Bro RED: здоровья много, удар тяжёлый. Продержись до конца раунда!')
      : TR('hintBroFighter', 'Все вместе против Bro RED — выбейте его до конца раунда!');
    if (hsVariant === 'ctf') return TR('hintCtf', 'Принеси вражеский флаг к своему. Коснись врага с вашим флагом — флаг вернётся домой.');
    if (hsVariant === 'dom') return TR('hintDom', 'Стой на точках с командой, чтобы захватить их. Каждая точка приносит очки каждую секунду.');
    if (hsVariant === 'cops') return me.role === 'seeker' ? TR('hintCop', 'Лови грабителей — пойманные замирают на месте.')
      : TR('hintRobber', 'Прячься от копов и касанием освобождай пойманных.');
    return hsSecret === 'murderer' ? TR('hintMurderer', 'Касанием выбивай игроков. Берегись шерифа — его касание тебя поймает!')
      : hsSecret === 'sheriff' ? TR('hintSheriff', 'Найди убийцу и коснись его. Невиновным твоё касание не вредит.')
      : TR('hintInnocent', 'Прячься и выживи. Кто убийца — неизвестно никому.');
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
  var roulRAF = null;          // тики рулетки — см. runRoulette()

  function roulStop() {
    roulTimers.forEach(clearTimeout);
    roulTimers = [];
    if (roulRAF) { cancelAnimationFrame(roulRAF); roulRAF = null; }
    var r = $('gRoul');   if (r)  r.classList.remove('on');
    var s = $('gRoulRes');   if (s) { s.classList.remove('on'); s.textContent = ''; }
    document.body.classList.remove('hasRoulette');
    relayoutCorner();
  }

  /* Живое значение translateX ленты рулетки во время CSS-transition:
     track.style.transform хранит целевое значение, не текущее — во время
     анимации его отдаёт только getComputedStyle(). */
  function currentTrackX(el) {
    var m = getComputedStyle(el).transform;
    if (!m || m === 'none') return 0;
    var mm = /matrix\(([^)]+)\)/.exec(m);
    if (!mm) return 0;
    var parts = mm[1].split(',');
    return parseFloat(parts[4]) || 0;
  }

  function nameOfId(id, list) {
    if (id === socket.id) return me.name;
    var o = others[id];
    if (o && o.name) return o.name;
    if (list) for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name;
    return '';
  }

  // Bro RED (война): выпавший на рулетке — Bro RED; искателя нет, все — бойцы
  function landBro(d, res) {
    broId = d.winnerId;
    hsWinnerId = d.winnerId;
    setRole('hider');
    if (res) {
      res.textContent = broId === socket.id ? TR('roulYouBro', 'Ты — Bro RED!')
        : TR('roulBroIs', '{n} — Bro RED!').replace('{n}', nameOfId(broId));
      res.classList.add('on');
    }
    if (window.BFSound) BFSound.roulLand();
    log(variantHint());
    roulTimers.push(setTimeout(roulStop, 2300));
  }
  function applySeeker(id) {
    hsWinnerId = id;
    hsSeekerIds[id] = true;
    setRole(id === socket.id ? 'seeker' : 'hider');
  }

  /* Заражение: пойманный не выбывает, а сам становится искателем.
     Событие приходит от сервера (hsInfected) — только он решает, кого
     поймали (см. hsCatch в server.js), клиент тут ничего не проверяет. */
  function applyInfected(id, name) {
    hsSeekerIds[id] = true;
    if (id === socket.id) {
      setRole('seeker');
      if (window.BFSound) BFSound.death();
    } else if (others[id]) {
      others[id].caught = true;
    }
    log(TR('hsInfected', '{n} заражён и теперь тоже охотится').replace('{n}', esc(name || nameOfId(id))));
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
    if (!list.length || winIdx < 0) { if (d.variant === 'bro') landBro(d, $('gRoulRes')); else applySeeker(d.winnerId); return; }

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

    /* Тики рулетки: не пытаемся сами повторить кривую cubic-bezier
       анимации (разгон-торможение уже считает браузер) — просто читаем
       текущий сдвиг ленты каждый кадр и звеним, когда под центром
       сменилось имя. Звук сам получается быстрым в начале и медленным
       к концу, синхронно с тем, что видно на экране. */
    if (window.BFSound) {
      BFSound.roulSpin();
      var tickIdx = startIdx;
      var tickUntil = Date.now() + spin;
      (function tickFrame() {
        if (Date.now() >= tickUntil) { roulRAF = null; return; }
        var idx = Math.round((W / 2 - step / 2 - currentTrackX(track)) / step);
        if (idx !== tickIdx) { tickIdx = idx; BFSound.roulTick(); }
        roulRAF = requestAnimationFrame(tickFrame);
      })();
    }

    roulTimers.push(setTimeout(function () {
      pills[target].classList.add('rWin');      // ник искателя выделяется (.rWin)
      if (d.variant === 'bro') { landBro(d, res); return; }
      applySeeker(d.winnerId);
      if (window.BFSound) BFSound.roulLand();
      if (d.winnerId === socket.id) {
        res.textContent = d.apoc ? TR('roulYouZombie', 'Ты заражён первым!') : TR('roulYouSeek', 'Ты — искатель!');
        res.classList.add('on');
        // классика: сразу на отмеченное место ожидания, если оно есть на
        // карте (см. teleportToSeekerSpot в game.html) — apoc его не знает
        if (!d.apoc && GAME.seekerWaitSpot) GAME.seekerWaitSpot();
      }
      /* С этого мгновения комната пропадает с экрана (см. hsHiding в
         onDraw). Без строчки-подсказки это читается как поломка: только
         что все были на виду — и вдруг пустая карта. */
      log(d.winnerId === socket.id
            ? TR('hideNowSeeker', 'Hiders are invisible until the round starts.')
            : TR('hideNow', 'Go hide! Nobody is visible until the round starts.'));
      roulTimers.push(setTimeout(roulStop, 2300));
    }, spin + 120));
  }

  /* Рулетка режима раунда: та же лента и тот же визуальный механизм, что
     у выбора искателя (см. runRoulette выше), только крутит 2 карточки —
     Classic/Zombie Apocalypse — и останавливается на РЕЖИМЕ этого раунда,
     а не на игроке. Раньше apoc-раунд не показывал в лобби вообще
     ничего — единственным намёком была строчка в логе при старте охоты;
     классический раунд тоже никак не называл себя режимом, хотя рулетка
     искателя и так на него намекала. Короткая — только объявляет режим,
     не отнимает заметную часть времени на прятки (см. onDone ниже: для
     классики за ней сразу следует обычная рулетка искателя). */
  /* Рулетка режима крутит только то, что бывает в этой комнате: в прятках — Classic, Zombie
     Apocalypse и Cops & Robbers, в Team Battle — Capture the Flag и Domination, в Murder
     Mystery — он сам (пока игроков мало — «Ждём игроков», wait: без искателя и поимок, см. hsFixedWait в server.js). */
  var VARIANTS = { hs: ['classic', 'zombie', 'cops'], murder: ['wait', 'murder'], team: ['wait', 'ctf', 'dom'],
                   war: ['wait', 'ffa', 'tdm', 'hunger', 'cp', 'bro', 'pirate'],
                   party: ['wait', 'quiz', 'guess', 'build', 'ffa', 'murder', 'zombie', 'cops'],
                   adventure: ['quest', 'defense'] };
  var hsFixed = null;                    // отдельный режим комнаты: 'murder' | 'team' | null
  function variantName(v) {
    return v === 'zombie' ? TR('modeApoc', 'Zombie Apocalypse') : v === 'murder' ? TR('modeMurder', 'Murder Mystery')
      : v === 'cops' ? TR('modeCops', 'Cops & Robbers') : v === 'ctf' ? TR('modeCtf', 'Capture the Flag')
      : v === 'dom' ? TR('modeDom', 'Domination') : v === 'team' ? TR('modeTeam', 'Team Battle')
      : v === 'war' ? TR('modeWar', 'War') : v === 'ffa' ? TR('modeFfa', 'Free for All') : v === 'tdm' ? TR('modeTdm', 'Team War')
      : v === 'hunger' ? TR('modeHunger', 'Hunger Games') : v === 'cp' ? TR('modeCp', 'Control Points') : v === 'bro' ? TR('modeBro', 'Bro RED')
      : v === 'pirate' ? TR('modePirate', 'Pirate War')
      : v === 'party' ? TR('modeParty', 'Вечеринка') : v === 'quiz' ? TR('modeQuiz', 'Викторина')
      : v === 'guess' ? TR('modeGuess', 'Угадай слово') : v === 'build' ? TR('modeBuild', 'Строительная битва')
      : v === 'adventure' ? TR('modeAdventure', 'Приключение') : v === 'quest' ? TR('modeQuest', 'Башня')
      : v === 'defense' ? TR('modeDefense', 'Оборона кристалла')
      : v === 'wait' ? TR('modeWait', 'Ждём игроков')
      : TR('modeClassic', 'Classic');
  }
  function runModeRoulette(variant, onDone) {
    roulStop();
    var box = $('gRoul'), view = $('gRoulView'), track = $('gRoulTrack');
    var res = $('gRoulRes');
    var kinds = (VARIANTS[hsFixed] || VARIANTS.hs).slice();
    if (kinds.indexOf(variant) === -1) kinds.push(variant);
    var list = kinds.map(function (v) { return { name: variantName(v) }; });
    var winIdx = kinds.indexOf(variant);
    var special = variant === 'murder' || variant === 'cops' || variant === 'ctf' || variant === 'dom';

    banner('', '', false);
    document.body.classList.add('hasRoulette');

    var seq = [], edge = 3;
    while (seq.length < edge) seq = seq.concat(list);
    var startIdx = seq.length;
    var pass = 6 + Math.floor(Math.random() * 3);   // короче, чем у искателя — исходов всего два-три
    while (seq.length < startIdx + pass) seq = seq.concat(list);
    var target = seq.length + winIdx;
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

    var step = (pills[0] && pills[0].getBoundingClientRect().width) || 150;
    var W = view.getBoundingClientRect().width || step;
    function posOf(k) { return Math.round(W / 2 - (k * step + step / 2)); }

    var spin = 1700;   // короткая: только объявить режим, не отнять время пряток

    track.style.transition = 'none';
    track.style.transform  = 'translateX(' + posOf(startIdx) + 'px)';
    void track.offsetWidth;
    track.style.transition = 'transform ' + spin + 'ms cubic-bezier(.09,.66,.14,1)';
    track.style.transform  = 'translateX(' + posOf(target) + 'px)';

    if (window.BFSound) {
      BFSound.roulSpin();
      var tickIdx = startIdx;
      var tickUntil = Date.now() + spin;
      (function tickFrame() {
        if (Date.now() >= tickUntil) { roulRAF = null; return; }
        var idx = Math.round((W / 2 - step / 2 - currentTrackX(track)) / step);
        if (idx !== tickIdx) { tickIdx = idx; BFSound.roulTick(); }
        roulRAF = requestAnimationFrame(tickFrame);
      })();
    }

    roulTimers.push(setTimeout(function () {
      pills[target].classList.add('rWin');
      if (window.BFSound) BFSound.roulLand();
      res.textContent = variantName(variant);
      res.classList.add('on');
      roulTimers.push(setTimeout(function () {
        // Murder Mystery и Cops and Robbers: рулетки игроков нет — под режимом сразу своя роль
        if (special) {
          var t = onDone ? onDone() : '';
          if (t) res.textContent = t;
          roulTimers.push(setTimeout(roulStop, 2400));
          return;
        }
        roulStop();
        if (onDone) onDone();
      }, 1100));
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
    if (MODE === 'race' && raceSync && !STORY) return;   // следующий раунд начнёт сервер (racePhase)
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
        // карту сменит сервер и пришлёт всем разом (hsPhase) — сами не тянем
        banner(TR('roundOver', 'Раунд окончен'), TR('newMapText', 'Новая карта. До старта 30 секунд.'), true);
        setTimeout(function () { banner('', '', false); }, 3000);
      }
    } else if (STORY) {
      /* Одна карта на приглашение — по истечении лимита сессия просто
         заканчивается, а не грузит случайную новую (как обычный Race).
         phaseEnds уносим далеко вперёд, иначе таймер каждые 250мс снова
         звал бы advance() и заново показывал баннер. */
      phaseEnds = Date.now() + 1e12;
      banner(TR('storyTimeUpTitle', 'Time is up'), TR('storyTimeUpText', 'This Story session has ended.'), true);
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
    if (MODE === 'race' && scoresBox) { scoresBox.style.display = 'block'; scoresBox.classList.add('open'); }
    msgsSetup();

    if (STORY && MODE === 'hideAndSeek') {
      /* Одна конкретная карта из приглашения вместо случайной, но фазами
         (лобби/рулетка/охота) по-прежнему управляет сервер — как в обычных
         прятках. Лимит на всю сессию тоже держит сервер (hsRooms, см.
         server.js) и присылает в конце фазой hsPhase: 'storyEnd'. */
      phase = 'lobby'; phaseEnds = Date.now() + LOBBY_MS;
      loadStoryMap();
    } else if (STORY) {
      /* Race: одна конкретная карта из приглашения, не случайная — и свой
         лимит времени вместо ROUND_MS. Пока код комнаты не подтверждён
         сервером, держим таймер на дефолте, чтобы полоска времени не была
         пустой. */
      phase = 'round'; phaseEnds = Date.now() + ROUND_MS;
      loadStoryMap();
    } else if (MODE === 'hideAndSeek') {
      /* Раньше тут висел свой баннер «роли распределятся через 30 секунд» —
         неверный, если в итоге играть не с кем, и всё равно почти сразу
         гас от nextMap() ниже. Реальное состояние (лобби/раунд) сервер
         пришлёт через hsPhase/hsState через мгновение после join. */
      /* Карту не выбираем сами: её назначит сервер и пришлёт в
         hsPhase/hsState сразу после join (см. loadServerMap). */
      phase = 'lobby'; phaseEnds = Date.now() + LOBBY_MS;
    } else {
      /* Гонка: карту комнаты и отсчёт до старта пришлёт сервер (racePhase/raceState) — вся
         комната бежит одно и то же. Старый сервер их не шлёт — тогда через несколько секунд
         после join карту берём сами (см. запасной путь в connect). */
      phase = 'round'; phaseEnds = Date.now() + ROUND_MS;
    }
  }

  /* Story Mode: карта и лимит времени приходят с сервера по коду комнаты
     (сама ссылка другу несёт только код — см. story.html), а не выбираются
     случайно, как в обычном Race через nextMap()/getRandomMap. */
  /* Карта, назначенная сервером комнате (прятки). Раньше каждый клиент
     звал nextMap() -> /getRandomMap сам, и игроки одной комнаты могли
     оказаться на РАЗНЫХ картах: чужие координаты приходили верные, но
     ложились на другую геометрию — у одного игрока персонаж стоял на
     платформе, у другого «парил в воздухе» посреди пустоты. Теперь
     карту выбирает сервер и присылает её в hsPhase/hsState. */
  /* cb зовётся, как только карта точно готова (и spawnPt в ней настоящий) —
     синхронно, если карта уже та же самая, и после fetch, если пришлось
     грузить новую. Без этого «телепорт сикера на спавн» в hsPhase иногда
     стрелял ДО того, как первая карта комнаты вообще успевала прийти по
     сети: GAME.respawn() отрабатывал по ещё пустому/старому spawnPt, и
     сикер оставался на месте как ни в чём не бывало. */
  function loadServerMap(m, cb) {
    /* Карты режима на сервере может не быть вовсе (владелец ни одной не
       добавил в игру). Показываем то же «нет карты», что показывал
       nextMap() раньше, а не оставляем вечное «Loading map…». */
    if (!m || !m.mapName) { if (!currentMap) showMap(null); if (cb) cb(); return; }
    if (currentMap && currentMap.mapName === m.mapName && currentMap.author === m.author) { if (cb) cb(); return; }
    fetch('/getMapData?author=' + encodeURIComponent(m.author || '')
        + '&mapName=' + encodeURIComponent(m.mapName))
      .then(function (r) { return r.json(); })
      .then(function (md) {
        showMap(md ? { mapName: m.mapName, author: m.author, mapData: md } : null);
        if (md) log(TR('mapLog', 'Карта: ') + '<b>' + esc(m.mapName) + '</b>'
                    + TR('byWord', ' от ') + esc(m.author), 's');
        if (cb) cb();
      })
      .catch(function () { if (cb) cb(); });
  }

  function loadStoryMap() {
    fetch('/story/roomInfo?room=' + encodeURIComponent(ROOM || ''))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || d.status !== 'success') {
          showMap(null);
          banner(TR('storyExpiredTitle', 'Story link expired'),
                 TR('storyExpiredText', 'Ask your friend to send a new invite from the Story Mode page.'), true);
          return;
        }
        // в Hide and Seek лимит на всю сессию держит и досчитывает сервер
        // (hsRooms) — здесь только карта; в Race таймер клиентский
        if (MODE !== 'hideAndSeek') phaseEnds = Date.now() + d.limitMs;
        fetch('/getMapData?author=' + encodeURIComponent(d.author) + '&mapName=' + encodeURIComponent(d.mapName))
          .then(function (r2) { return r2.json(); })
          .then(function (md) {
            showMap(md ? { mapName: d.mapName, author: d.author, mapData: md } : null);
          })
          .catch(function () { showMap(null); });
      })
      .catch(function () { showMap(null); });
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
  /* Жизни карты кончились: движок уже вернул игрока на старт и сбросил время и чекпоинты
     (см. die() в game.html) — для сервера это новый забег. */
  GAME.onOutOfLives = function () {
    // Last bro standing: выбыл до конца раунда — стоит на месте серым, ждёт следующую карту
    if (MODE === 'race' && raceSync && raceGoal === 'last' && phase === 'round') {
      raceOutMe = true; GAME.frozen = true; applyColor();
      if (socket) socket.emit('raceOut');
      log(TR('raceOutMe', 'Жизни кончились — ты выбыл до конца раунда'));
      return 'out';
    }
    log(TR('outOfLives', 'Жизни кончились — забег заново с начала'));
    if (MODE !== 'race' || VIEW || !currentMap) return;
    finSent = false;
    pendingRaceStart = { author: currentMap.author, mapName: currentMap.mapName };
    flushPendingRaceStart();
  };
  function livesTick() {
    var box = $('gLivesBox');
    if (!box) return;
    var n = MODE === 'race' && !PRACTICE && GAME.playing ? GAME.raceLives : 0;
    box.style.display = n ? '' : 'none';
    if (n) $('gLives').textContent = Math.max(0, n - GAME.deaths) + '/' + n;
  }
  setInterval(livesTick, 200);
  /* Общая гонка: в лобби все стоят на старте (GAME.frozen), со стартом раунда забег у всех
     начинается заново с самого старта — время, смерти и чекпоинты сброшены. */
  function raceLobby(d) {
    raceOutMe = false; applyColor();
    GAME.frozen = true;
    loadServerMap(d.map, function () { GAME.frozen = true; if (GAME.restartRun) GAME.restartRun(); });
    if (d.goal === 'first') log(TR('raceGoalFirstHint', 'Побеждает тот, кто финиширует первым!'));
    else if (d.goal === 'last') log(TR('raceGoalLastHint', 'Last bro standing: не потеряй все жизни!'));
  }
  function raceGo(d, late) {
    loadServerMap(d.map, function () {
      if (!raceOutMe) GAME.frozen = false;
      if (GAME.restartRun) GAME.restartRun();
      finSent = false;
      if (currentMap) { pendingRaceStart = { author: currentMap.author, mapName: currentMap.mapName }; flushPendingRaceStart(); }
    });
    if (!late) { log(TR('raceGo', 'Старт!')); if (window.BFSound) BFSound.go(); }
  }
  function racePhaseIn(d, late) {
    if (MODE !== 'race' || STORY || VIEW || !d) return;
    raceSync = true;
    raceGoal = d.goal || '';
    phase = d.phase === 'lobby' ? 'lobby' : 'round';
    phaseEnds = Date.now() + (Number(d.msLeft) || 0);
    if (phase === 'lobby') raceLobby(d); else raceGo(d, late);
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
      socket = openIo();
    }
    bindNet();
  }

  /* Сеть, где вебсокет не обрывается, а молча «подвисает» (школьные и
     офисные прокси): соединение будто открыто, но данных нет, и клиент
     socket.io раз за разом пробует тот же вебсокет — до polling дело не
     доходит, игра навсегда остаётся на «Loading map…» с пингом «—».
     Поэтому: не подключились за WS_WAIT мс — пересоздаём сокет «сначала
     polling, потом апгрейд до websocket» (так socket.io проходит через
     любой прокси, а где вебсокет жив — всё равно на него переходит) и на
     POLL_DAYS дней запоминаем, что в этой сети так и надо начинать. */
  var WS_WAIT = 6000, POLL_KEY = 'bf_pollFirst', POLL_DAYS = 3;
  function pollFirst() {
    try { return Date.now() - (Number(localStorage.getItem(POLL_KEY)) || 0) < POLL_DAYS * 864e5; }
    catch (e) { return false; }
  }
  function openIo() {
    if (pollFirst()) return io({ transports: ['polling', 'websocket'], forceNew: true });
    var s = io({ transports: ['websocket', 'polling'], tryAllTransports: true });
    setTimeout(function () {
      if (socket !== s || s.connected) return;
      try { localStorage.setItem(POLL_KEY, String(Date.now())); } catch (e) {}
      s.off();
      s.close();
      socket = io({ transports: ['polling', 'websocket'], forceNew: true });
      bindNet();
    }, WS_WAIT);
    return s;
  }

  /* Все подписи на события сокета — отдельной функцией: при переходе
     с воркера на старый сервер сокет пересоздаётся, и обработчики
     навешиваются на новый экземпляр без дублирования. */
  function bindNet() {
    bindWar();                         // война и жетоны (см. bindWar)
    bindParty();                       // «Вечеринка»: мини-игры (см. bindParty)
    bindAdv();                         // «Приключение»: враги, классы (см. bindAdv)

    socket.on('connect', function () {
      // сервер завёл нас заново: пусть первый же пакет несёт всё, включая скин
      lastSk = null;
      prev.x = prev.y = prev.w = prev.h = null;
      prev.c = prev.s = prev.f = prev.d = null;
      dupBlocked = false;      // новое соединение — даём серверу решить заново

      Promise.all([
        fetch('/iSigned', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).catch(function () { return null; }),
        ROOM ? Promise.resolve({ room: ROOM })
             : fetch('/getBestRoom?mode=' + encodeURIComponent(MODE) + (VARIANT ? '&variant=' + VARIANT : '')).then(function (r) { return r.json(); })
                 .catch(function () { return { room: 'room1' }; })
      ]).then(function (res) {
        var signed = res[0], pick = res[1];
        me.name = (signed && signed.data && !signed.data.guest) ? signed.data.name : guestName();
        ROOM = pick.room || 'room1';
        socket.emit('join', { playerName: me.name, gameMode: MODE, room: ROOM });
        // старый сервер общих раундов гонки не ведёт — тогда, как раньше, карту берём сами
        setTimeout(function () {
          if (MODE === 'race' && !STORY && !VIEW && !raceSync && !currentMap && socket.connected) nextMap();
        }, 4000);

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
    socket.on('disconnect', function () {
      hsSync = false; joined = false;
      hsApocRound = false; syncMeIsZombie();   // не застыть зомби-скином до реконнекта
    });

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
      if (!d) return;
      if (d.reason === 'roomFull') {
        joined = false;
        banner(TR('roomFullTitle', 'Комната заполнена'),
               TR('roomFullText', 'Выбери другую комнату и попробуй снова.'), true);
        return;
      }
      if (d.reason === 'invalidMode') {
        joined = false;
        banner(TR('modeErrorTitle', 'Недоступный режим'),
               TR('modeErrorText', 'Эта игровая комната больше не поддерживается.'), true);
        return;
      }
      if (d.reason === 'serverBusy') {
        joined = false;
        banner(TR('serverBusyTitle', 'Сервер занят'),
               TR('serverBusyText', 'Сейчас слишком много активных комнат. Попробуй позже.'), true);
        return;
      }
      if (d.reason !== 'duplicateAccount') return;
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
        setChatColor(p.name, p.chatColor);
        setNickColor(p.name, p.nickColor);
        setClan(p.name, p.clanTag, p.clanColor);
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
      if (drawMode) refreshDrawTargets();
      // роль приходит из рулетки (hsRoulette/hsState) — здесь её больше не считаем
    });

    socket.on('playerJoined', function (p) {
      setChatColor(p.name, p.chatColor);
      setNickColor(p.name, p.nickColor);
      setClan(p.name, p.clanTag, p.clanColor);
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
      if (drawMode) refreshDrawTargets();
    });

    socket.on('playerLeft', function (d) {
      var gone = others[d.playerId];
      if (gone) {
        log(esc(gone.name) + TR('leftWord', ' вышел'), 's');
        if (gone.nid !== undefined) delete byNid[gone.nid];
      }
      delete others[d.playerId];
      $('gCount').textContent = Object.keys(others).length + 1;
      if (drawMode) refreshDrawTargets();
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
      setChatColor(m.playerName, m.color);
      if (m.playerName !== me.name && !isMuted(m.playerName) && !hideChatPref) {
        speak(m.playerName, m.text);
        if (window.BFSound) BFSound.chat();
      }
    });

    // своя линия уже нарисована локально на pointerup — этот же ID
    // просто эхо с сервера, было бы вдвойне
    socket.on('drawLine', function (d) {
      if (!d || d.playerId === socket.id || !Array.isArray(d.points) || d.points.length < 2) return;
      lines.push({ points: d.points, born: Date.now() });
    });
    socket.on('drawLineQuota', function (d) {
      if (gDraw) gDraw.classList.toggle('limit', !!(d && d.left <= 0));
    });

    // заражение подтверждает только сервер (см. hsCatch) — не чат
    socket.on('hsInfected', function (d) {
      if (MODE !== 'hideAndSeek' || !d || !d.id) return;
      applyInfected(d.id, d.name);
      if (d.poison && d.id === socket.id) log(TR('hsPoisonedMe', 'Ты коснулся яда и стал зомби!'));
    });

    /* Яд на зомби-карте: движок сообщает о касании (смерти в прятках нет — см. die() в
       game.html), а заражает сервер (hsPoisoned). Шлём только прячущийся и только в
       зомби-раунде; повтор не чаще раза в секунду — пока сервер не ответил. */
    /* Гонка-«шпион» (см. spyTick в game.html): камера заметила, флаг взят, сохранён, потерян или
       без флага пришёл к финишу — коротким сообщением, а не табличкой на весь экран. */
    GAME.onSpy = function (kind) {
      var M = { flag: TR('spyGotFlag', 'Флаг у тебя! Неси его к финишу.'), need: TR('spyNeedFlag', 'Сначала возьми флаг шпиона — без него финиш не засчитают.'),
                seen: TR('spySeen', 'Тебя заметила камера!'), saved: TR('spySaved', 'Флаг сохранён на чекпоинте.'),
                lost: TR('spyFlagBack', 'Флаг вернулся на место.') };
      if (M[kind]) log(M[kind]);
    };
    var poisonSentAt = 0;
    GAME.onHazard = function () {
      // война: яд выбивает (решает сервер, см. hazard в war.js)
      if (warOn() && socket && warAlive(socket.id)) {
        if (Date.now() - hazardSentAt < 1000) return;
        hazardSentAt = Date.now();
        socket.emit('warHazard');
        return;
      }
      if (MODE !== 'hideAndSeek' || phase !== 'round' || !hsApocRound) return;
      if (me.role === 'seeker' || me.caught) return;
      if (Date.now() - poisonSentAt < 1000) return;
      poisonSentAt = Date.now();
      socket.emit('hsPoisoned');
    };

    // Классика: пойманный просто выходит из игры (см. applyOut/hsDoInfect)
    socket.on('hsOut', function (d) {
      if (MODE !== 'hideAndSeek' || !d || !d.id) return;
      applyOut(d.id, d.name, d);
    });

    /* ---------- прятки: серверные события ---------- */

    // новый раунд: сервер выбрал искателя и разослал состав рулетки
    socket.on('hsRoulette', function (d) {
      hsSync = true; hsEver = true;
      if (MODE !== 'hideAndSeek' || !d) return;
      phase = 'lobby';
      if (d.msLeft) phaseEnds = Date.now() + (Number(d.msLeft) || 0);
      hsWinnerId = null;                 // пока крутится — ролей нет, никого не видно
      /* d.apoc уже известен на этом самом событии (см. hsSpin в server.js) —
         выставляем сразу, а не ждём hsPhase('round'): иначе "пациент ноль"
         после приземления рулетки на секунды превращался в обычного
         искателя (синяя полоса/подпись "Искатель" вместо зомби-скина),
         пока не придёт отдельное событие старта раунда. Преждевременно
         никого зомби не красит: роль/hsSeekerIds ниже всё равно сброшены
         на время самого вращения (см. setRole('hider')/clearCaught()). */
      hsApocRound = !!d.apoc;
      hsVariant = d.variant || (d.apoc ? 'zombie' : 'classic');
      hsSecret = null; hsSecretAt = null;   // тайная роль придёт следом (hsSecret)
      hsFixed = d.fixed || null;
      broId = null;
      shopOn = !!d.shop;
      if (d.advCls) Object.keys(d.advCls).forEach(function (id) { advCls[id] = d.advCls[id]; });
      renderWarHud();
      renderAdvPick();
      fixedWaitLog(d);
      setRole('hider');
      $('gRoleBox').style.display = 'none';
      clearCaught();
      // сначала короткая рулетка режима (Classic/Zombie Apocalypse) — потом
      // та же рулетка искателя, что в apoc-раунде выбирает "пациента ноль"
      // (см. d.apoc — теперь приходит для обоих режимов, см. hsSpin в
      // server.js). msLeft пересчитываем на момент фактического запуска —
      // от phaseEnds, а не берём д.msLeft как есть: он успел устареть на
      // время показа рулетки режима
      runModeRoulette(hsVariant, function () {
        if (teamVariant()) {
          // команды раздал сервер; стоим на своей базе до начала раунда. Пока крутилась рулетка,
          // мог прийти состав новее (кто-то вошёл — hsTeams) — его не затираем
          if (!Object.keys(hsTeams).length) hsTeams = d.teams || {};
          hsBases = d.bases || null; hsPoints = d.points || null;
          hsWinnerId = 'variant';
          fixVariantRole(); applyColor();
          hsTeamSpawn(); GAME.frozen = true;
          log(variantHint());
          if (window.BFSound) BFSound.roulLand();
          return variantRoleText();
        }
        if (hsVariant === 'ffa' || hsVariant === 'hunger') {
          hsWinnerId = 'variant';
          setRole('hider');
          log(variantHint());
          if (window.BFSound) BFSound.roulLand();
          return variantRoleText();
        }
        if (hsVariant === 'murder' || hsVariant === 'cops') {
          // роли раздал сервер: копы — всем (d.cops), убийца и шериф — каждому свою (hsSecret)
          (d.cops || []).forEach(function (c) { hsSeekerIds[c.id] = true; });
          hsWinnerId = 'variant';        // прятки начались — никого не видно (см. hsHiding в onDraw)
          fixVariantRole();
          if (hsVariant === 'cops' && d.cops && d.cops.length)
            log(TR('copsAre', 'Копы: {n}').replace('{n}', d.cops.map(function (c) { return '<b>' + esc(c.name) + '</b>'; }).join(', ')));
          else log(variantHint());
          // коп ждёт на метке искателя, как в классике; убийце туда нельзя — выдаст себя
          if (hsVariant === 'cops' && me.role === 'seeker' && GAME.seekerWaitSpot) GAME.seekerWaitSpot();
          // Murder Mystery: каждый — в своей случайной точке карты (её выбрал сервер, см. hsSecret)
          if (hsVariant === 'murder' && hsSecretAt && GAME.teleportTo) {
            var pp = GAME.pl;
            GAME.teleportTo(hsSecretAt.x + hsSecretAt.w / 2 - pp.w / 2, hsSecretAt.y + hsSecretAt.h - pp.h);
          }
          if (window.BFSound) BFSound.roulLand();
          return variantRoleText();
        }
        d.msLeft = phaseEnds - Date.now();
        runRoulette(d);
        showChance((d.players) || []);
      });
    });

    // ---------- общая гонка: фазы, финиши, выбывшие, итог (см. raceRooms в server.js) ----------
    socket.on('racePhase', function (d) { racePhaseIn(d, false); });
    socket.on('raceState', function (d) { racePhaseIn(d, true); });
    socket.on('raceFinished', function (d) {
      if (MODE !== 'race' || !d) return;
      log(d.id === socket.id ? TR('raceFinMe', 'Ты финишировал {p}-м!').replace('{p}', d.place)
        : TR('raceFinOther', '{n} финишировал {p}-м').replace('{n}', '<b>' + esc(d.name || '') + '</b>').replace('{p}', d.place));
    });
    socket.on('raceOut', function (d) {
      if (MODE !== 'race' || !d || d.id === socket.id) return;
      log(TR('raceOutOther', '{n} выбыл').replace('{n}', '<b>' + esc(d.name || '') + '</b>'));
    });
    socket.on('raceResult', function (d) {
      if (MODE !== 'race' || !d) return;
      if (d.winner) log(TR('raceWinner', '{n} победил!').replace('{n}', '<b>' + esc(d.winner) + '</b>'));
      else log(TR('roundOver', 'Раунд окончен'));
    });

    // ---------- командные варианты: состав команд, флаги, точки захвата ----------
    socket.on('hsTeams', function (d) {
      if (MODE !== 'hideAndSeek' || !d || !teamVariant()) return;
      var had = myTeam();
      hsTeams = d.teams || {};
      if (myTeam() !== had) { fixVariantRole(); applyColor(); }
    });
    socket.on('ctfState', function (d) {
      if (MODE !== 'hideAndSeek' || !d) return;
      ctfState = d;
      renderTeamHud();
      var e = d.ev, sc = d.score || {};
      if (!e) return;
      var who = '<b>' + esc(e.name || '') + '</b>', tn = teamTag(e.team);
      if (e.ev === 'take') log(TR('ctfTaken', '{n} схватил флаг: {t}!').replace('{n}', who).replace('{t}', tn));
      else if (e.ev === 'capture') {
        log(TR('ctfScored', 'Очко команде {t}! {s}').replace('{t}', tn).replace('{s}', scoreLine(sc)));
        if (window.BFSound) BFSound.win();
      } else if (e.ev === 'return') log(TR('ctfReturned', 'Флаг вернулся на базу: {t}').replace('{t}', tn));
    });
    socket.on('domState', function (d) {
      if (MODE !== 'hideAndSeek' || !d) return;
      var before = domState && domState.points ? domState.points.map(function (p) { return p.owner; }).join() : '';
      domState = d;
      renderTeamHud();
      var now = (d.points || []).map(function (p) { return p.owner; });
      if (before && before !== now.join()) now.forEach(function (o, i) {
        if (o && before.split(',')[i] !== o) log(TR('domTaken', 'Точка {p} — у команды {t}!').replace('{p}', 'ABCDE'.charAt(i))
          .replace('{t}', teamTag(o)));
      });
    });

    // Murder Mystery: своя тайная роль — приходит только этому игроку
    socket.on('hsSecret', function (d) {
      if (MODE !== 'hideAndSeek' || !d) return;
      hsSecret = d.role === 'murderer' || d.role === 'sheriff' ? d.role : 'innocent';
      hsSecretAt = d.at || null;
    });

    // Cops and Robbers: пойманного освободили
    socket.on('hsFreed', function (d) {
      if (MODE !== 'hideAndSeek' || !d || !d.id) return;
      if (d.id === socket.id) { me.caught = false; GAME.frozen = false; applyColor(); }
      else if (others[d.id]) others[d.id].caught = false;
      log(TR('hsFreed', '{b} освободил {n}!').replace('{b}', '<b>' + esc(d.by || '') + '</b>').replace('{n}', '<b>' + esc(d.name || nameOfId(d.id)) + '</b>'));
    });

    // итог раунда Murder Mystery и Cops and Robbers (см. hsRevealRound в server.js)
    socket.on('hsReveal', function (d) {
      if (MODE !== 'hideAndSeek' || !d) return;
      var m = '<b>' + esc(d.murderer || '') + '</b>';
      if (d.variant === 'murder') {
        log(d.winner === 'murderer' ? TR('mmWinMurderer', 'Убийца {m} выбил всех!').replace('{m}', m)
          : d.winner === 'sheriff' ? TR('mmWinSheriff', 'Невиновные победили — шериф поймал убийцу {m}!').replace('{m}', m)
          : TR('mmWinTime', 'Время вышло — невиновные выжили! Убийцей был {m}.').replace('{m}', m));
      } else if (d.variant === 'bro') {
        var bn = '<b>' + esc(d.bro || '') + '</b>';
        log(d.winner === 'bro' ? TR('broWin', 'Bro RED {n} продержался до конца раунда!').replace('{n}', bn)
          : TR('broLose', 'Бойцы выбили Bro RED {n}!').replace('{n}', bn));
      } else if (advV(d.variant)) {
        // приключение: победа или поражение, докуда дошли и кто выбил больше всех
        var best = d.kills && d.kills[0] ? ' ' + TR('advBest', 'Больше всех выбил {n}: {k}.').replace('{n}', '<b>' + esc(d.kills[0].name) + '</b>').replace('{k}', d.kills[0].k) : '';
        log((d.variant === 'quest'
          ? (d.win ? TR('advQuestWin', 'Победа! Босс башни повержен.') : TR('advQuestLose', 'Поражение — дошли до этажа {n} из {of}.').replace('{n}', d.floor).replace('{of}', d.floors))
          : (d.win ? TR('advDefWin', 'Победа! Кристалл выстоял все волны.') : TR('advDefLose', 'Поражение — кристалл разбит на волне {n}.').replace('{n}', d.wave))) + best);
        if (d.win && window.BFSound && BFSound.win) BFSound.win();
      } else if (partyGame(d.variant)) {
        // мини-игра «Вечеринки»: победитель, слово или лучшая модель
        if (d.variant === 'guess' && d.word) log(TR('partyWordWas', 'Слово: {w}').replace('{w}', '<b>' + esc(inLang(d.word)) + '</b>'));
        log(d.winnerName ? TR('partyWin', 'Победил {n}!').replace('{n}', '<b>' + esc(d.winnerName) + '</b>')
          + (d.top && d.top[0] ? ' (' + d.top[0].pts + ')' : '') : TR('warDraw', 'В этом раунде без победителя.'));
        if (window.BFSound && d.winnerName && d.winnerName === me.name) BFSound.win();
      } else if (d.variant === 'ffa' || d.variant === 'hunger') {
        log(d.winnerName ? TR('warWin', 'Раунд выиграл {n}!').replace('{n}', '<b>' + esc(d.winnerName) + '</b>') : TR('warDraw', 'В этом раунде без победителя.'));
        if (window.BFSound && d.winnerName && d.winnerName === me.name) BFSound.win();
      } else if (d.variant === 'ctf' || d.variant === 'dom' || d.variant === 'tdm' || d.variant === 'cp' || d.variant === 'pirate') {
        var sc = d.score || {};
        log(d.winner ? TR('teamWins', 'Победила команда {t}! {s}').replace('{t}', teamTag(d.winner)).replace('{s}', scoreLine(sc))
          : TR('teamDraw', 'Ничья! {s}').replace('{s}', scoreLine(sc)));
        if (window.BFSound && d.winner && d.winner === myTeam()) BFSound.win();
      } else if (d.variant === 'cops') {
        log(d.winner === 'cops' ? TR('copsWin', 'Копы победили — все грабители пойманы!')
          : TR('robbersWin', 'Грабители победили — на свободе: {n}').replace('{n}', String(d.free || 0)));
      }
    });

    // смена фазы: конец рулетки/прятаний — начало охоты и обратно
    /* ---------- голосование за следующую карту (см. hsOpenVote в server.js) ----------
       Во время охоты сервер предлагает до трёх карт; голос можно поменять. Победившая
       карта загрузится в следующем лобби. */
    var voteState = null, myVote = -1;
    function renderVote() {
      var box = $('gVote'), opts = $('gVoteOpts');
      if (!voteState || !voteState.options || voteState.options.length < 2 || MODE !== 'hideAndSeek') { box.style.display = 'none'; return; }
      $('gVoteT').textContent = TR('hsVoteTitle', 'Следующая карта');
      opts.innerHTML = voteState.options.map(function (o, i) {
        var c = (voteState.counts && voteState.counts[i]) || 0;
        return '<button data-i="' + i + '"' + (i === myVote ? ' class="on"' : '') + ' title="' + esc(o.mapName + ' — ' + o.author) + '">'
          + '<span class="nm">' + esc(o.mapName) + '</span><span class="c">' + c + '</span></button>';
      }).join('');
      box.style.display = 'block';
    }
    function setVote(v) { voteState = v || null; myVote = -1; renderVote(); }
    $('gVoteOpts').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-i]') : null;
      if (!b || !voteState) return;
      myVote = Number(b.getAttribute('data-i'));
      socket.emit('hsVote', { i: myVote });
      renderVote();
    });
    socket.on('hsVote', function (v) { if (MODE === 'hideAndSeek') setVote(v); });
    socket.on('hsVoteTally', function (d) {
      if (!voteState || !d || !Array.isArray(d.counts)) return;
      voteState.counts = d.counts;
      renderVote();
    });

    socket.on('hsPhase', function (d) {
      hsSync = true; hsEver = true;
      if (MODE !== 'hideAndSeek' || !d || !d.phase) return;
      banner('', '', false);        // предыдущее состояние уже не актуально
      $('gTimeBox').style.display = '';
      if (d.phase === 'round') {
        roulStop();
        // «Твой шанс» был про уже прошедшую рулетку — весь раунд эта
        // цифра ничего не значит и не должна висеть поверх охоты
        hideChance();
        partyReset();                // мини-игра пришлёт свою панель следом (событие party)
        phase = 'round';
        phaseEnds = Date.now() + (Number(d.msLeft) || ROUND_MS);
        clearCaught();
        // apoc-раунд: заражённые выглядят зомби (см. syncMeIsZombie) —
        // у apoc нет искателя-человека, applySeeker ниже не позовут вовсе
        hsApocRound = !!d.apoc;
        if (d.variant) hsVariant = d.variant;
        warSet(isWarV(hsVariant) ? d.war : null);
        advSet(advV(hsVariant) ? d.adv : null);
        if (war && war.bro) broId = war.bro;
        syncMeIsZombie();
        if (d.seekerId) applySeeker(d.seekerId);
        // копы — все сразу; убийца тайный: его знает только он сам (fixVariantRole)
        (d.seekerIds || []).forEach(function (id) { hsSeekerIds[id] = true; });
        if (teamVariant()) {
          hsTeams = d.teams || hsTeams; hsBases = d.bases || hsBases; hsPoints = d.points || hsPoints;
          ctfState = d.ctf || null; domState = d.dom || null;
          renderTeamHud();
        }
        fixVariantRole(); applyColor();
        /* Охота начинается — искатель стартует со своей точки старта, а
           не там, где стоял во время подготовки (мог сам уйти прятаться
           заранее и подсмотреть, куда бегут остальные). Ждём, пока карта
           точно готова (см. loadServerMap) — на первом раунде свежей
           комнаты она ещё грузится по сети, и respawn() до этого момента
           работал по пустому/старому spawnPt и никуда не телепортировал. */
        var teleportSeeker = function () {
          // убийцу не переносим: появиться у старта на глазах у всех — выдать себя
          if (me.role === 'seeker' && hsVariant !== 'murder' && GAME.respawn) GAME.respawn();
        };
        if (!STORY) loadServerMap(d.map, teleportSeeker); else teleportSeeker();
        log(d.apoc ? TR('roundStartApoc', 'Раунд начался! Зомби уже идёт за кем-то...')
          : hsVariant === 'wait' || hsVariant === 'murder' || hsVariant === 'cops' || isWarV(hsVariant) || partyGame(hsVariant) || advV(hsVariant) ? variantHint()
          : TR('roundStart', 'Раунд начался! 2 минуты'));
        // Murder Mystery: первые секунды охоты убийца никого не трогает (см. HS_MURDER_GRACE_MS)
        mmGraceUntil = hsVariant === 'murder' ? Date.now() + (Number(d.grace) || 0) : 0;
        if (hsVariant === 'murder' && hsSecret === 'murderer' && d.grace) {
          log(TR('mmGrace', 'Первые {n} секунд ты никого не можешь выбить.').replace('{n}', String(Math.round(d.grace / 1000))));
          setTimeout(function () {
            if (phase === 'round' && hsVariant === 'murder' && hsSecret === 'murderer' && !me.caught) log(TR('mmGraceOver', 'Теперь можно выбивать!'));
          }, Number(d.grace));
        }
        if (window.BFSound) BFSound.go();
      } else if (d.phase === 'lobby') {
        setVote(null);
        if (d.voted && d.map) log(TR('hsVoteDone', 'Голосованием выбрана карта: {m}').replace('{m}', '<b>' + esc(d.map.mapName) + '</b>'));
        // дожил до конца раунда прячущимся — личный успех (значения ещё
        // не сброшены нижеидущими строками). Пойманного искатель уже
        // озвучил через checkAllCaught() выше
        if (window.BFSound && phase === 'round' && me.role === 'hider' && !me.caught) BFSound.win();
        phase = 'lobby';
        phaseEnds = Date.now() + (Number(d.msLeft) || LOBBY_MS);
        hsWinnerId = null;
        // бой и жетоны раунда кончились; патроны сервер обнуляет с началом лобби
        toks = []; ammo = { sling: 0, bomb: 0, magic: 0 }; weapon = 'fist';
        warSet(null);
        partyReset();
        advSet(null);
        /* d.apoc уже известен здесь же (этот hsPhase приходит сразу вслед
           за hsRoulette из той же hsStartLobby на сервере) — выставляем
           сразу, тем же приёмом и по той же причине, что и в обработчике
           hsRoulette выше: иначе этот же hardcoded false, придя следом,
           перетирал бы уже правильно выставленное там значение, пока
           рулетка ещё крутится, и "пациент ноль" на приземлении рулетки
           опять получал бы ярлык обычного искателя вместо зомби. */
        hsApocRound = !!d.apoc;
        if (d.variant) hsVariant = d.variant;
        resetTeams();
        setRole('hider');
        $('gRoleBox').style.display = 'none';
        clearCaught();
        // карту комнаты назначает сервер: у всех в комнате она одна
        if (!STORY) loadServerMap(d.map);
      } else if (d.phase === 'storyEnd') {
        // общий лимит времени Story-сессии вышел — сервер обрывает цикл
        // лобби/раунд насовсем (см. hsEndStory в server.js)
        roulStop();
        hideChance();
        phaseEnds = Date.now() + 1e12;
        banner(TR('storyTimeUpTitle', 'Time is up'), TR('storyTimeUpText', 'This Story session has ended.'), true);
      }
    });

    // в комнате отдельного режима сменилась причина, по которой пока идут обычные прятки
    socket.on('hsFixedWait', function (d) { if (MODE === 'hideAndSeek') fixedWaitLog(d); });
    // подключились посреди раунда/лобби: сервер сразу говорит, кто искатель
    socket.on('hsState', function (d) {
      hsSync = true; hsEver = true;
      if (MODE !== 'hideAndSeek' || !d || !d.phase) return;
      hsFixed = d.fixed || null;
      fixedWaitLog(d);
      $('gTimeBox').style.display = '';
      // друг открыл ссылку Story уже после того, как лимит сессии вышел
      if (d.phase === 'storyEnd') {
        phaseEnds = Date.now() + 1e12;
        banner(TR('storyTimeUpTitle', 'Time is up'), TR('storyTimeUpText', 'This Story session has ended.'), true);
        return;
      }
      phase = d.phase;
      phaseEnds = Date.now() + (Number(d.msLeft) || (d.phase === 'round' ? ROUND_MS : LOBBY_MS));
      // зашли посреди игры — сразу на ту же карту, что у остальных
      if (!STORY) loadServerMap(d.map);
      hsVariant = d.variant || (d.apoc ? 'zombie' : 'classic');
      hsSecret = d.role || null;
      applyTeamState(d);
      // жетоны, магазин и бой (см. joinState в war.js)
      shopOn = !!d.shop; tokBank = d.bank | 0; toks = d.toks || [];
      if (d.ammo) ammo = d.ammo;
      broId = d.broId || (d.war && d.war.bro) || null;
      warSet(d.phase === 'round' && isWarV(hsVariant) ? d.war : null);
      partyReset();                  // идущая мини-игра придёт следом событием party
      if (d.advCls) Object.keys(d.advCls).forEach(function (id) { advCls[id] = d.advCls[id]; });
      advSet(d.phase === 'round' && advV(hsVariant) ? d.adv : null);
      if (d.phase === 'round') {
        roulStop();
        // зашли посреди уже идущей охоты — рулетку не видели и не увидим,
        // шансу тут показывать нечего
        hideChance();
        hsApocRound = !!d.apoc;
        if (d.seekerId) applySeeker(d.seekerId);
        // догоняем заражённых, добавленных уже после старта раунда —
        // applySeeker выше знает только про исходного искателя рулетки
        (d.seekerIds || []).forEach(function (id) {
          hsSeekerIds[id] = true;
          if (id === socket.id) setRole('seeker');
        });
        fixVariantRole();
        // кто уже пойман: выбыл, убит или сидит в тюрьме (Cops and Robbers — и сам замирает)
        (d.out || []).forEach(function (id) {
          if (id === socket.id) { me.caught = true; if (hsVariant === 'cops') GAME.frozen = true; }
          else if (others[id]) others[id].caught = true;
        });
        applyColor();
        syncMeIsZombie();
        setVote(d.vote);
      } else {
        setVote(null);
        // d.apoc здесь тоже уже известен (см. тот же фикс в hsRoulette/
        // hsPhase('lobby') выше) — догоняющему во время apoc-лобби иначе
        // ненадолго показывало бы обычного искателя вместо зомби
        hsApocRound = !!d.apoc;
        clearCaught();
        if (teamVariant()) {
          hsWinnerId = 'variant';
          fixVariantRole(); applyColor();
          hsTeamSpawn(); GAME.frozen = true;
        } else if (hsVariant === 'murder' || hsVariant === 'cops') {
          (d.seekerIds || []).forEach(function (id) { hsSeekerIds[id] = true; });
          hsWinnerId = 'variant';
          fixVariantRole();
        } else if (isWarV(hsVariant)) {
          // война: искателя нет, Bro RED известен из broId
          hsWinnerId = broId || 'variant';
          setRole('hider');
        } else if (d.seekerId) {
          applySeeker(d.seekerId);
          log(TR('roulSeekerIs', 'Искатель: ') + '<b>' + esc(nameOfId(d.seekerId)) + '</b>');
          // классика: догоняем и ожидание на метке, если она есть на карте
          if (d.seekerId === socket.id && !hsApocRound && GAME.seekerWaitSpot) GAME.seekerWaitSpot();
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

    /* Murder Mystery и Cops and Robbers: решает только сервер — заранее никого не помечаем
       и в чат «caught!» не пишем (выдало бы убийцу). Повтор по той же цели — не чаще раза
       в 1.2 с: пока сервер не ответил, касание длится десятки кадров. */
    var special = hsVariant === 'murder' || hsVariant === 'cops';
    function touching(o) { return Math.abs(o.tx - p.x) < 34 && Math.abs(o.ty - p.y) < 60; }
    function sendOnce(ev, id) {
      var now = Date.now();
      if (now - (touchSentAt[ev + id] || 0) < 1200) return;
      touchSentAt[ev + id] = now;
      socket.emit(ev, { targetId: id });
    }
    if (MODE === 'hideAndSeek' && phase === 'round' && special && !me.caught && me.role !== 'seeker') {
      Object.keys(others).forEach(function (id) {
        var o = others[id];
        if (!touching(o)) return;
        // шериф: касание проверяет сервер — убийцу поймает, невиновному ничего не будет
        if (hsVariant === 'murder' && hsSecret === 'sheriff' && !o.caught) sendOnce('hsCatch', id);
        // грабитель освобождает пойманного своего
        if (hsVariant === 'cops' && o.caught && !hsSeekerIds[id]) sendOnce('hsFree', id);
      });
    }
    /* Capture the Flag: взять вражеский флаг, донести до своего, вернуть свой у соперника —
       решает сервер по своим координатам (ctfTouch/ctfTag), здесь только заметить касание. */
    if (MODE === 'hideAndSeek' && phase === 'round' && hsVariant === 'ctf' && ctfState && hsBases && !GAME.frozen && myTeam()) {
      var mt = myTeam(), fl = ctfState.flags || {};
      var nearSpot = function (b) { return b && p.x + p.w > b.x - 20 && p.x < b.x + b.w + 20 && p.y + p.h > b.y - 30 && p.y < b.y + b.h + 30; };
      // несут по одному вражескому флагу: какой уже у меня
      var carry = teamsInPlay(fl).filter(function (t) { return fl[t] === socket.id; })[0];
      if (!carry) teamsInPlay(fl).forEach(function (et) {
        if (et !== mt && !fl[et] && nearSpot(hsBases[et])) ctfSend('ctfTouch', { team: et }, et);
      });
      else if (!fl[mt] && nearSpot(hsBases[mt])) ctfSend('ctfTouch', { team: mt }, mt);
      if (fl[mt] && fl[mt] !== socket.id && others[fl[mt]] && touching(others[fl[mt]])) ctfSend('ctfTag', { targetId: fl[mt] }, 'tag');
    }
    // искатель ловит прячущихся касанием
    if (MODE === 'hideAndSeek' && me.role === 'seeker' && phase === 'round' && special && !me.caught
        && !(hsVariant === 'murder' && Date.now() < mmGraceUntil)) {
      Object.keys(others).forEach(function (id) {
        var o = others[id];
        if (o.caught || hsSeekerIds[id] || !touching(o)) return;
        sendOnce('hsCatch', id);
      });
    }
    if (MODE === 'hideAndSeek' && me.role === 'seeker' && phase === 'round' && !special) {
      Object.keys(others).forEach(function (id) {
        var o = others[id];
        // в охоте укрытие уже не спасает — иначе поймать было бы некого;
        // уже заражённых (в т.ч. исходного искателя) тоже не трогаем —
        // они .caught не выставляют себе, но входят в hsSeekerIds
        if (o.caught || hsSeekerIds[id]) return;
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

  var touchSentAt = {};
  function ctfSend(ev, payload, key) {
    var now = Date.now();
    if (now - (touchSentAt[ev + key] || 0) < 600) return;
    touchSentAt[ev + key] = now;
    socket.emit(ev, payload);
  }

  /* ---------- командные варианты на карте: базы и флаги (CTF), точки захвата (Domination) ---------- */
  // флаг: подставка, древко с шариком, полотнище волной и белая эмблема; x,y — низ древка
  function drawFlag(ctx, x, y, color, k) {
    var H = 72 * k, fw = 34 * k, fh = 22 * k, top = y - H + 3 * k;
    var wv = Math.sin(Date.now() / 220) * 3 * k;
    ctx.fillStyle = '#4b5563';
    ctx.fillRect(x - 9 * k, y - 4 * k, 18 * k, 4 * k);
    ctx.fillStyle = '#6b7280';
    ctx.fillRect(x - 1.5 * k, y - H, 3 * k, H);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.arc(x, y - H, 3.2 * k, 0, 6.2832); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + 1.5 * k, top);
    ctx.quadraticCurveTo(x + fw * 0.5, top - wv, x + fw, top + wv * 0.5);
    ctx.lineTo(x + fw, top + fh + wv * 0.5);
    ctx.quadraticCurveTo(x + fw * 0.5, top + fh - wv, x + 1.5 * k, top + fh);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.beginPath(); ctx.arc(x + fw * 0.52, top + fh / 2, 4.6 * k, 0, 6.2832); ctx.fill();
  }
  function drawTeamObjects(ctx) {
    if (MODE !== 'hideAndSeek' || !teamVariant() || !hsBases) return;
    ctx.save();
    if (hsVariant === 'ctf') {
      teamsInPlay().forEach(function (t) {
        var b = hsBases[t];
        if (!b) return;
        // база — цветная площадка на земле под укрытием
        ctx.globalAlpha = 0.14; ctx.fillStyle = COLOR_TEAM[t]; ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.ellipse(b.x + b.w / 2, b.y + b.h, b.w / 2 + 14, 7, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
        var c = ctfState && ctfState.flags ? ctfState.flags[t] : null;
        var who = c && socket && c === socket.id ? GAME.pl : (c ? others[c] : null);
        // у несущего флаг над головой, иначе — на базе
        if (who) drawFlag(ctx, who.x + (who.w || 22) / 2, who.y - 4, COLOR_TEAM[t], 0.55);
        else drawFlag(ctx, b.x + b.w / 2, b.y + b.h, COLOR_TEAM[t], 1);
      });
    } else if (hsPoints) {
      hsPoints.forEach(function (b, i) {
        var pt = domState && domState.points ? domState.points[i] : null;
        var col = pt && pt.owner ? COLOR_TEAM[pt.owner] : '#6b7280', cx = b.x + b.w / 2, cy = b.y - 30;
        ctx.globalAlpha = 0.14; ctx.fillStyle = col; ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.ellipse(cx, b.y + b.h, b.w / 2 + 14, 7, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        ctx.beginPath(); ctx.arc(cx, cy, 18, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(cx, cy, 18, 0, 6.2832); ctx.stroke();
        if (pt && pt.by && pt.prog) {                // захват идёт — дуга цветом захватчиков
          ctx.strokeStyle = COLOR_TEAM[pt.by]; ctx.lineWidth = 6;
          ctx.beginPath(); ctx.arc(cx, cy, 18, -1.5708, -1.5708 + 6.2832 * Math.min(1, pt.prog / 3)); ctx.stroke();
        }
        ctx.fillStyle = col; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('ABCDE'.charAt(i), cx, cy + 1);
      });
    }
    ctx.restore();
  }

  /* Раунд заканчивается, как только пойманы все. Таймер после этого
     дотикивал впустую: искать было уже некого. */
  function checkAllCaught() {
    if (switching || phase !== 'round' || VIEW) return;
    var ids = Object.keys(others);
    if (!ids.length) return;                  // один в комнате — ловить некого
    // заражённые (искатели) в счёт не идут — важны только оставшиеся прячущиеся
    for (var i = 0; i < ids.length; i++) if (!hsSeekerIds[ids[i]] && !others[ids[i]].caught) return;

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

  // все дошли до финиша — не ждём таймер, ставим новую карту
  var switching = false;
  function checkAllFinished() {
    if (switching || phase !== 'round' || VIEW) return;
    if (MODE === 'hideAndSeek' && hsSync) return;   // в прятках фазами правит сервер
    if (MODE === 'race' && raceSync && !STORY) return;   // и в общей гонке тоже (raceRooms)
    if (!GAME.done) return;
    var ids = Object.keys(others);
    for (var i = 0; i < ids.length; i++) if (!others[ids[i]].fin) return;

    switching = true;
    if (STORY) {
      // одна карта на сессию — обычная автосмена карты тут не нужна,
      // оба друга финишировали, значит сессия успешно завершена
      phaseEnds = Date.now() + 1e12;
      banner(TR('storyDoneTitle', 'Finished!'), TR('storyDoneText', 'Everyone reached the finish.'), true);
      return;
    }
    log(ids.length ? TR('allFinished', 'Все на финише — новая карта!') : TR('finishSolo', 'Финиш! Новая карта'));
    setTimeout(function () {
      nextMap(function () {
        phaseEnds = Date.now() + ROUND_MS;
        switching = false;
      });
    }, 1400);
  }

  /* ---------- война и жетоны (см. war.js на сервере) ----------
     Бой считает этот клиент: удар кулаком и снаряды (рогатка, бомба, магия) летят здесь, и
     если попали во врага — сервер получает warHit и сам проверяет, было ли это возможно.
     Чужие выстрелы приходят как warShot и просто рисуются. Жетоны лежат на карте (toks),
     подбираются касанием, тратятся в магазине (B): в прятках — бусты, в войне — оружие. */
  var WPN = {
    fist:  { cd: 360, key: 'wpnFist', ru: 'Кулак' },
    sling: { cd: 520, key: 'wpnSling', ru: 'Рогатка', v: 0.95, g: 0.0011, life: 2500, r: 6, color: '#6b7280' },
    bomb:  { cd: 820, key: 'wpnBomb', ru: 'Бомба', v: 0.5, vy: -0.62, g: 0.0019, life: 1400, r: 8, color: '#111827', boom: 130 },
    magic: { cd: 670, key: 'wpnMagic', ru: 'Магия', v: 1.15, g: 0, life: 2000, r: 9, color: '#f97316' },
    // ядро пушки (см. fireCannon): летит по дуге, взрывается облаком яда
    cannon: { cd: 2500, key: 'wpnCannon', ru: 'Пушка', v: 1.45, g: 0.0011, life: 4500, r: 11, color: '#3f6212', boom: 110 }
  };
  var WPN_ORDER = ['fist', 'sling', 'bomb', 'magic'];
  // значки оружия на панели (на телефоне — только значок и число, без подписи)
  var WPN_ICON = {
    fist: '<path d="M7 12V9a2 2 0 0 1 4 0v2M11 11V8a2 2 0 0 1 4 0v3M15 11a2 2 0 0 1 4 0v2a7 7 0 0 1-7 7h-1a6 6 0 0 1-6-6v-1a2 2 0 0 1 4 0"/>',
    sling: '<path d="M12 21v-8M12 13 6 4M12 13l6-9M6 4c2 3 10 3 12 0"/>',
    bomb: '<circle cx="11" cy="14" r="7"/><path d="M15.5 9.5 19 6M19 3v2M21 5h-2"/>',
    magic: '<path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-4 5-4 7-2-1-3-3-3-3-2 3-2 5-2 8 0 4 3 7 7 7z"/>'
  };
  function wIcon(w) {
    return '<svg class="wIco" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + WPN_ICON[w] + '</svg>';
  }
  var SHOP_ITEMS = {
    speed:  { price: 2, key: 'shopSpeed', ru: 'Скорость', dKey: 'shopSpeedD', dRu: 'Бегаешь на треть быстрее 10 секунд' },
    jump:   { price: 2, key: 'shopJump', ru: 'Суперпрыжок', dKey: 'shopJumpD', dRu: 'Прыгаешь на треть выше 10 секунд' },
    invis:  { price: 4, key: 'shopInvis', ru: 'Невидимость', dKey: 'shopInvisD', dRu: 'Тебя не видно 6 секунд (только прячущимся)', hider: true },
    radar:  { price: 3, key: 'shopRadar', ru: 'Радар', dKey: 'shopRadarD', dRu: 'Стрелка к ближнему прячущемуся 8 секунд (только искателю)', seeker: true },
    sling:  { price: 3, key: 'shopSling', ru: 'Рогатка ×10', dKey: 'shopSlingD', dRu: '10 камней: летят далеко, 15 урона' },
    bomb:   { price: 4, key: 'shopBomb', ru: 'Бомба ×3', dKey: 'shopBombD', dRu: '3 бомбы: взрыв задевает всех рядом' },
    magic:  { price: 5, key: 'shopMagic', ru: 'Магия ×5', dKey: 'shopMagicD', dRu: '5 огненных шаров: быстрые, 32 урона' },
    heal:   { price: 3, key: 'shopHeal', ru: 'Аптечка', dKey: 'shopHealD', dRu: '+50 здоровья' },
    shield: { price: 4, key: 'shopShield', ru: 'Щит', dKey: 'shopShieldD', dRu: 'Вдвое меньше урона 10 секунд' }
  };
  var SHOP_HS = ['speed', 'jump', 'invis', 'radar'];
  var SHOP_WAR = ['sling', 'bomb', 'magic', 'heal', 'shield', 'speed', 'jump'];
  var war = null;                 // состояние боя раунда: { v, hp, max, kills, score, out, bro }
  var weapon = 'fist', ammo = { sling: 0, bomb: 0, magic: 0 }, lastFire = {}, shotSeq = 1;
  var shots = [];                 // снаряды в полёте (свои и чужие)
  var swings = {};                // кто когда махнул кулаком — для анимации
  var booms = [];                 // вспышки взрывов
  var toks = [], tokBank = 0, shopOn = false, tokSentAt = {};
  var myBoost = {};               // мои бусты: item -> до какого времени
  var boostOf = {};               // видимые всем бусты (невидимость, щит): id -> { item: until }
  var hazardSentAt = 0;
  var broId = null;               // Bro RED этого раунда (рулетка в лобби, war.bro в бою)

  function isWarV(v) { return v === 'ffa' || v === 'tdm' || v === 'hunger' || v === 'cp' || v === 'bro' || v === 'pirate'; }
  function warOn() { return MODE === 'hideAndSeek' && !!war && phase === 'round' && isWarV(hsVariant); }
  function warAlive(id) { return !!war && (war.hp[id] | 0) > 0 && (war.out || []).indexOf(id) === -1; }
  function warEnemy(id) {
    if (!war || !socket || id === socket.id) return false;
    if (war.v === 'tdm' || war.v === 'cp' || war.v === 'pirate') return !!hsTeams[id] && hsTeams[id] !== myTeam();
    if (war.v === 'bro') return (id === war.bro) !== (socket.id === war.bro);
    return true;
  }
  function boostOn(id, item) { var b = boostOf[id]; return !!(b && b[item] && b[item] > Date.now()); }
  function myBoostOn(item) { return !!(myBoost[item] && myBoost[item] > Date.now()); }
  function wName(w) { return TR(WPN[w].key, WPN[w].ru); }

  // состояние боя целиком: начало раунда (hsPhase), вход посреди раунда (hsState)
  function warSet(d) {
    war = d ? { v: d.v, hp: d.hp || {}, max: d.max || {}, kills: d.kills || {}, score: d.score || {}, out: d.out || [], bro: d.bro || null,
                guns: d.guns || [] } : null;
    shots = []; booms = []; gunFired = {}; gunAimA = {};
    if (!war) { GAME.myAlpha = 1; weapon = 'fist'; }
    syncWarMe();
    renderWarHud();
    renderTeamHud();
  }
  // свой вид: выбит — бледный и стоит; иначе — как обычно (невидимость — отдельно, см. tickBoosts)
  function syncWarMe() {
    if (!socket) return;
    var dead = !!war && phase === 'round' && !warAlive(socket.id);
    GAME.myAlpha = dead ? 0.3 : myBoostOn('invis') ? 0.35 : 1;
    if (war && phase === 'round') GAME.frozen = dead;
  }

  /* ---------- атака ---------- */
  function attack() {
    if (!warOn() || !socket || !warAlive(socket.id) || GAME.frozen) return;
    // у заряженной пушки — выстрел из неё; пока она заряжается — обычный удар
    var gi = nearGun();
    if (gi !== -1 && gunReady(gi)) { fireCannon(gi); return; }
    var now = Date.now(), w = weapon;
    if (now - (lastFire[w] || 0) < WPN[w].cd) return;
    if (w !== 'fist' && !(ammo[w] > 0)) {
      log(TR('noAmmo', 'Нет патронов — купи в магазине (B)'));
      weapon = 'fist'; renderWarHud();
      return;
    }
    lastFire[w] = now;
    var p = GAME.pl, face = p.face || 1;
    var cx = p.x + p.w / 2, cy = p.y + p.h * 0.38;
    var sid = shotSeq++;
    var vx = 0, vy = 0;
    if (w === 'fist') swings[socket.id] = { t: now, dir: face };
    else {
      ammo[w]--;
      vx = face * WPN[w].v; vy = WPN[w].vy || (w === 'sling' ? -0.12 : 0);
    }
    socket.emit('warShot', { w: w, sid: sid, x: Math.round(cx), y: Math.round(cy), vx: vx, vy: vy, dir: face });
    if (window.BFSound && BFSound.step) BFSound.step();
    if (w === 'fist') {
      // кулак: по врагам прямо перед собой (по последним реальным координатам, см. touching)
      Object.keys(others).forEach(function (id) {
        var o = others[id];
        if (!warEnemy(id) || !warAlive(id)) return;
        var ox = o.tx + (o.w || 30) / 2, oy = o.ty + (o.h || 100) / 2;
        var dx = ox - cx, dy = oy - (p.y + p.h / 2);
        if (dx * face >= -12 && Math.abs(dx) <= 78 && Math.abs(dy) <= 80) socket.emit('warHit', { t: id, sid: sid });
      });
    } else shots.push({ own: true, sid: sid, w: w, x: cx, y: cy, vx: vx, vy: vy, born: now, hit: {} });
    renderWarHud();
  }
  function pickWeapon(w) {
    if (!WPN[w] || !war) return;
    weapon = w; renderWarHud();
  }
  function cycleWeapon() {
    var i = WPN_ORDER.indexOf(weapon);
    for (var k = 1; k <= WPN_ORDER.length; k++) {
      var w = WPN_ORDER[(i + k) % WPN_ORDER.length];
      if (w === 'fist' || ammo[w] > 0) { pickWeapon(w); return; }
    }
  }

  /* ---------- снаряды ---------- */
  var lastShotStep = 0;
  function stepShots() {
    var now = Date.now(), dt = Math.min(50, now - (lastShotStep || now));
    lastShotStep = now;
    if (!shots.length) return;
    shots = shots.filter(function (s) {
      var W = WPN[s.w];
      if (now - s.born > W.life) { if (W.boom) explode(s); return false; }
      // шагами не длиннее 8 px — тонкая стена не пропускает снаряд насквозь
      var steps = Math.max(1, Math.ceil(Math.hypot(s.vx * dt, s.vy * dt) / 8));
      for (var k = 0; k < steps; k++) {
        var h = dt / steps;
        s.vy += W.g * h; s.x += s.vx * h; s.y += s.vy * h;
        if (GAME.solidAt && GAME.solidAt(s.x, s.y)) { if (W.boom) explode(s); return false; }
        if (s.own && hitPlayer(s)) return false;
      }
      return true;
    });
  }
  // свой снаряд задел врага — сообщаем серверу (бомба — взрывается)
  function hitPlayer(s) {
    var ids = Object.keys(others), r = WPN[s.w].r;
    for (var i = 0; i < ids.length; i++) {
      var o = others[ids[i]], id = ids[i];
      if (!warEnemy(id) || !warAlive(id)) continue;
      var w = o.w || 30, h = o.h || 100;
      if (s.x + r > o.tx && s.x - r < o.tx + w && s.y + r > o.ty && s.y - r < o.ty + h) {
        if (WPN[s.w].boom) { explode(s); return true; }
        socket.emit('warHit', { t: id, sid: s.sid });
        return true;
      }
    }
    return false;
  }
  function explode(s) {
    booms.push({ x: s.x, y: s.y, t: Date.now(), w: s.w });
    if (window.BFSound && BFSound.death) BFSound.death();
    if (!s.own || !socket) return;
    var R = WPN[s.w].boom;
    Object.keys(others).forEach(function (id) {
      var o = others[id];
      if (!warEnemy(id) || !warAlive(id)) return;
      var ox = o.tx + (o.w || 30) / 2, oy = o.ty + (o.h || 100) / 2;
      if (Math.hypot(ox - s.x, oy - s.y) <= R) socket.emit('warHit', { t: id, sid: s.sid, x: Math.round(s.x), y: Math.round(s.y) });
    });
  }

  /* ---------- пушки (идея 2019 года «Missile war», см. cannonShot в war.js) ----------
     Встал у пушки — F, клик или кнопка удара стреляют ядовитым ядром. Целятся мышью, а на
     телефоне — касанием по карте у пушки (касание сразу и стреляет): ядро летит по дуге туда,
     куда указали, а если туда не долетает — под 45° в ту сторону. Пока не целились — туда,
     куда смотрит ствол на карте (прицел пушки в редакторе). Номер пушки — её место среди пушек
     карты, как у сервера (см. hsApplyApoc в server.js). */
  var GUN = { near: 90, nearY: 110, barrel: 0.58, aimMs: 15000 };
  var gunFired = {};             // номер пушки -> когда из неё стреляли (свои и чужие выстрелы)
  var gunAimA = {};              // номер пушки -> куда смотрел ствол при выстреле
  var aimPt = null, aimAt = 0;   // куда целятся (мир) и когда целились
  function gunObjs() {
    var list = GAME.objects || [], out = [];
    for (var i = 0; i < list.length && out.length < 24; i++) if (list[i].type === 'cannon') out.push(list[i]);
    return out;
  }
  function guns() { return (war && war.guns) || []; }
  // пушка, у которой стоишь (ближняя по x), или -1
  function nearGun() {
    var p = GAME.pl, gs = guns();
    if (!p || !gs.length) return -1;
    var cx = p.x + p.w / 2, cy = p.y + p.h / 2, best = -1, bd = Infinity;
    gs.forEach(function (g, i) {
      var dx = Math.abs(cx - (g.x + g.w / 2)), dy = Math.abs(cy - (g.y + g.h / 2));
      if (dx <= GUN.near && dy <= GUN.nearY && dx < bd) { bd = dx; best = i; }
    });
    return best;
  }
  function gunPivot(g) { return { x: g.x + g.w * 0.5, y: g.y + g.h * 0.4 }; }
  function gunReady(i) { return Date.now() - (gunFired[i] || 0) >= WPN.cannon.cd; }
  // скорость ядра: низкой дугой точно в точку прицела, а если не долетит — под 45° в её сторону
  function gunVel(i) {
    var W = WPN.cannon, g = guns()[i], pv = gunPivot(g), o = gunObjs()[i];
    var t = aimPt && Date.now() - aimAt < GUN.aimMs ? aimPt : null;
    if (!t) { var a0 = ((o && +o.aim) || 0) * Math.PI / 180; return { vx: Math.cos(a0) * W.v, vy: Math.sin(a0) * W.v }; }
    var dx = t.x - pv.x, up = pv.y - t.y, v = W.v, gr = W.g, side = dx < 0 ? -1 : 1;
    var x = Math.max(1, Math.abs(dx)), disc = v * v * v * v - gr * (gr * x * x + 2 * up * v * v);
    var th = disc >= 0 ? Math.atan((v * v - Math.sqrt(disc)) / (gr * x)) : Math.PI / 4;
    return { vx: side * Math.cos(th) * v, vy: -Math.sin(th) * v };
  }
  function fireCannon(i) {
    var now = Date.now(), g = guns()[i];
    if (!g || !gunReady(i)) return;
    gunFired[i] = now;
    var vel = gunVel(i), pv = gunPivot(g), a = Math.atan2(vel.vy, vel.vx), sid = shotSeq++;
    gunAimA[i] = a;
    socket.emit('warShot', { w: 'cannon', c: i, sid: sid, vx: vel.vx, vy: vel.vy });
    shots.push({ own: true, sid: sid, w: 'cannon', x: pv.x + Math.cos(a) * g.w * GUN.barrel, y: pv.y + Math.sin(a) * g.w * GUN.barrel,
                 vx: vel.vx, vy: vel.vy, born: now, hit: {} });
    if (window.BFSound && BFSound.bounce) BFSound.bounce();
  }
  // стволы смотрят туда, куда целятся (своя пушка) или куда только что выстрелили (любая)
  function syncGuns() {
    var objs = gunObjs(), now = Date.now(), mine = warOn() && socket && warAlive(socket.id) ? nearGun() : -1;
    objs.forEach(function (o, i) {
      if (!war) { delete o._aim; delete o._ready; return; }
      if (i === mine && aimPt && now - aimAt < GUN.aimMs && guns()[i]) { var v = gunVel(i); o._aim = Math.atan2(v.vy, v.vx); }
      else if (gunAimA[i] !== undefined && now - (gunFired[i] || 0) < 4000) o._aim = gunAimA[i];
      else delete o._aim;
      o._ready = gunReady(i);
    });
  }
  // у своей пушки: подсказка, перезарядка и пунктир дуги
  function drawGunAim(ctx) {
    var i = warOn() && socket && warAlive(socket.id) ? nearGun() : -1;
    if (i === -1) return;
    var g = guns()[i], now = Date.now(), ready = gunReady(i);
    var lx = g.x + g.w / 2, ly = g.y + g.h - 142;     // над полоской здоровья бойца у пушки
    ctx.save();
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var touch = /(^| )is-(mobile|tablet)( |$)/.test(document.documentElement.className);
    var txt = ready ? (touch ? TR('cannonFireTouch', 'Коснись цели или жми удар') : TR('cannonFire', 'F или клик — огонь'))
      : TR('cannonLoading', 'Заряжается…');
    var tw = ctx.measureText(txt).width + 16;
    ctx.fillStyle = 'rgba(17,24,39,.78)';
    ctx.fillRect(lx - tw / 2, ly - 11, tw, 22);
    if (!ready) {
      ctx.fillStyle = '#84cc16';
      ctx.fillRect(lx - tw / 2, ly + 9, tw * Math.min(1, (now - (gunFired[i] || 0)) / WPN.cannon.cd), 2);
    }
    ctx.fillStyle = '#fff'; ctx.fillText(txt, lx, ly);
    if (ready && aimPt && now - aimAt < GUN.aimMs) {
      var vel = gunVel(i), pv = gunPivot(g), a = Math.atan2(vel.vy, vel.vx);
      var x = pv.x + Math.cos(a) * g.w * GUN.barrel, y = pv.y + Math.sin(a) * g.w * GUN.barrel, vx = vel.vx, vy = vel.vy;
      ctx.fillStyle = 'rgba(101,163,13,.75)';
      for (var k = 0; k < 40; k++) {
        for (var j = 0; j < 4; j++) { vy += WPN.cannon.g * 12; x += vx * 12; y += vy * 12; }
        if (GAME.solidAt && GAME.solidAt(x, y)) break;
        ctx.beginPath(); ctx.arc(x, y, 3, 0, 6.2832); ctx.fill();
      }
    }
    ctx.restore();
  }

  /* ---------- жетоны и бусты ---------- */
  function tickWar() {
    if (!socket || MODE !== 'hideAndSeek') return;
    var now = Date.now(), p = GAME.pl;
    // подобрать жетон касанием
    if (phase === 'round' && toks.length && p && GAME.playing && !(war && !warAlive(socket.id)) && !me.caught) {
      var cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      toks.forEach(function (t) {
        if (Math.abs(cx - t.x) < 32 && Math.abs(cy - t.y) < 60 && now - (tokSentAt[t.id] || 0) > 800) {
          tokSentAt[t.id] = now;
          socket.emit('tokTake', { id: t.id });
        }
      });
    }
    // бусты кончаются сами
    GAME.speedMul = myBoostOn('speed') ? 1.35 : 1;
    GAME.jumpMul = myBoostOn('jump') ? 1.3 : 1;
    if (war || myBoost.invis) syncWarMe();
  }

  /* ---------- магазин ---------- */
  function shopList() { return hsFixed === 'war' || isWarV(hsVariant) ? SHOP_WAR : SHOP_HS; }
  function amHunter() { return me.role === 'seeker'; }
  function renderShop() {
    var box = $('gShop');
    if (!box || box.style.display === 'none') return;
    var rows = shopList().map(function (k) {
      var it = SHOP_ITEMS[k];
      var roleNo = (it.hider && amHunter()) || (it.seeker && !amHunter());
      var off = roleNo || tokBank < it.price;
      return '<div class="shRow"><div class="shTxt"><b>' + esc(TR(it.key, it.ru)) + '</b><span>' + esc(TR(it.dKey, it.dRu)) + '</span></div>'
        + '<button class="shBuy" data-item="' + k + '"' + (off ? ' disabled' : '') + '>' + it.price + ' ' + esc(TR('tokShort', 'жет.')) + '</button></div>';
    }).join('');
    box.innerHTML = '<div class="shHead"><b>' + esc(TR('shopTitle', 'Магазин')) + '</b><span>' + esc(TR('tokLbl', 'Жетоны')) + ': ' + tokBank
      + '</span><button class="shX" aria-label="Close">×</button></div>' + rows
      + '<div class="shHint">' + esc(TR('shopHint', 'Жетоны лежат на карте — подбирай касанием.')) + '</div>';
  }
  function toggleShop(force) {
    var box = $('gShop');
    if (!box || !shopOn) return;
    var show = force === undefined ? box.style.display === 'none' : !!force;
    box.style.display = show ? '' : 'none';
    renderShop();
  }

  /* ---------- нижняя панель: здоровье, оружие, жетоны ---------- */
  function renderWarHud() {
    var bar = $('gWar');
    if (!bar) return;
    var inWar = MODE === 'hideAndSeek' && (hsFixed === 'war' || isWarV(hsVariant)) && !!war;
    if (!shopOn && !inWar) { bar.style.display = 'none'; var a0 = $('gAtk'); if (a0) a0.style.display = advOn() ? '' : 'none'; return; }
    bar.style.display = '';
    var html = '';
    if (inWar && socket) {
      var hp = war.hp[socket.id] | 0, max = war.max[socket.id] || 100;
      html += '<span class="wHp"><i style="width:' + Math.round(100 * Math.max(0, hp) / max) + '%"></i><em>'
        + esc(TR('hpLbl', 'Здоровье')) + ' ' + Math.max(0, hp) + '</em></span>';
      html += WPN_ORDER.map(function (w, i) {
        var n = w === 'fist' ? '∞' : String(ammo[w] | 0);
        return '<button class="wSlot' + (w === weapon ? ' on' : '') + (w !== 'fist' && !(ammo[w] > 0) ? ' empty' : '') + '" data-w="' + w + '" title="' + esc(wName(w)) + '">'
          + '<small class="wKey">' + (i + 1) + '</small>' + wIcon(w) + '<span class="wName">' + esc(wName(w)) + '</span> <b>' + n + '</b></button>';
      }).join('');
    }
    html += '<span class="wTok"><i class="wCoin"></i><span class="wName">' + esc(TR('tokLbl', 'Жетоны')) + ': </span><b>' + tokBank + '</b></span>';
    if (shopOn) html += '<button class="wShop" id="gShopBtn">' + esc(TR('shopBtn', 'Магазин')) + ' <small class="wKey">B</small></button>';
    bar.innerHTML = html;
    var atk = $('gAtk');
    if (atk) atk.style.display = inWar ? '' : 'none';
  }

  /* ---------- рисование ---------- */
  function drawHpBar(ctx, x, y, w, hp, max) {
    var W = 36, H = 5, k = Math.max(0, Math.min(1, hp / (max || 100)));
    ctx.fillStyle = 'rgba(17,24,39,.55)'; ctx.fillRect(x + w / 2 - W / 2 - 1, y - 1, W + 2, H + 2);
    ctx.fillStyle = k > 0.5 ? '#22c55e' : k > 0.25 ? '#eab308' : '#ef4444';
    ctx.fillRect(x + w / 2 - W / 2, y, W * k, H);
  }
  function drawSwing(ctx, x, y, w, h, sw) {
    var age = Date.now() - sw.t;
    if (age > 160) return;
    var k = Math.sin(Math.PI * age / 160), fx = sw.dir > 0 ? x + w + 4 + 24 * k : x - 4 - 24 * k, fy = y + h * 0.42;
    ctx.fillStyle = '#111827';
    ctx.beginPath(); ctx.arc(fx, fy, 9, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.stroke();
  }
  function drawWar(ctx) {
    stepShots();
    syncGuns();
    var now = Date.now();
    // жетоны на карте — золотые монетки со звездой
    toks.forEach(function (t) {
      var bob = Math.sin(now / 260 + t.id) * 3;
      ctx.save();
      ctx.translate(t.x, t.y + bob);
      ctx.fillStyle = '#fbbf24'; ctx.strokeStyle = '#b45309'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, 6.2832); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff7d6';
      ctx.beginPath();
      for (var i = 0; i < 10; i++) { var a = -1.5708 + i * 0.6283, r = i % 2 ? 2.6 : 6.2; ctx[i ? 'lineTo' : 'moveTo'](r * Math.cos(a), r * Math.sin(a)); }
      ctx.closePath(); ctx.fill();
      ctx.restore();
    });
    // снаряды
    shots.forEach(function (s) {
      var W = WPN[s.w];
      ctx.save();
      if (s.w === 'magic') { ctx.shadowColor = '#fb923c'; ctx.shadowBlur = 14; }
      if (s.w === 'cannon') { ctx.shadowColor = '#84cc16'; ctx.shadowBlur = 12; }
      ctx.fillStyle = W.color;
      ctx.beginPath(); ctx.arc(s.x, s.y, W.r, 0, 6.2832); ctx.fill();
      if (s.w === 'bomb') { ctx.fillStyle = (now / 90 | 0) % 2 ? '#f97316' : '#fde047'; ctx.beginPath(); ctx.arc(s.x + 3, s.y - W.r - 2, 3, 0, 6.2832); ctx.fill(); }
      if (s.w === 'cannon') { ctx.fillStyle = '#a3e635'; ctx.beginPath(); ctx.arc(s.x - 3, s.y - 3, 3.5, 0, 6.2832); ctx.fill(); }
      ctx.restore();
    });
    booms = booms.filter(function (b) {
      var age = now - b.t;
      if (age > 380) return false;
      var k = age / 380;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      // ядро пушки — зелёное облако яда, бомба — оранжевая вспышка
      ctx.fillStyle = b.w === 'cannon' ? '#65a30d' : '#f97316';
      ctx.beginPath(); ctx.arc(b.x, b.y, WPN[b.w === 'cannon' ? 'cannon' : 'bomb'].boom * (0.35 + 0.65 * k), 0, 6.2832); ctx.fill();
      ctx.restore();
      return true;
    });
    drawGunAim(ctx);
    if (!war || phase !== 'round' || !socket) return;
    // полоски здоровья, удары и щиты
    var p = GAME.pl;
    Object.keys(others).forEach(function (id) {
      var o = others[id];
      if (!warAlive(id) || boostOn(id, 'invis')) return;
      drawHpBar(ctx, o.x, o.y - 20, o.w || 30, war.hp[id] | 0, war.max[id] || 100);
      if (swings[id]) drawSwing(ctx, o.x, o.y, o.w || 30, o.h || 100, swings[id]);
      if (boostOn(id, 'shield')) drawShield(ctx, o.x, o.y, o.w || 30, o.h || 100);
    });
    if (p && warAlive(socket.id)) {
      drawHpBar(ctx, p.x, p.y - 20, p.w, war.hp[socket.id] | 0, war.max[socket.id] || 100);
      if (swings[socket.id]) drawSwing(ctx, p.x, p.y, p.w, p.h, swings[socket.id]);
      if (boostOn(socket.id, 'shield')) drawShield(ctx, p.x, p.y, p.w, p.h);
    }
  }
  function drawShield(ctx, x, y, w, h) {
    ctx.save();
    ctx.strokeStyle = 'rgba(56,189,248,.85)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w * 1.1, h * 0.62, 0, 0, 6.2832); ctx.stroke();
    ctx.restore();
  }
  // радар искателя: стрелка от себя к ближнему непойманному прячущемуся
  function drawRadar(ctx) {
    if (!myBoostOn('radar') || phase !== 'round' || !GAME.pl) return;
    var p = GAME.pl, cx = p.x + p.w / 2, cy = p.y + p.h / 2, best = null, bd = Infinity;
    Object.keys(others).forEach(function (id) {
      var o = others[id];
      if (o.caught || hsSeekerIds[id]) return;
      var d = Math.hypot(o.tx - cx, o.ty - cy);
      if (d < bd) { bd = d; best = o; }
    });
    if (!best) return;
    var a = Math.atan2(best.ty + 50 - cy, best.tx + 15 - cx);
    ctx.save();
    ctx.translate(cx + Math.cos(a) * 70, cy + Math.sin(a) * 70);
    ctx.rotate(a);
    ctx.fillStyle = '#2563eb';
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -10); ctx.lineTo(-3, 0); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* ---------- сетевые события ---------- */
  function bindWar() {
    socket.on('warShot', function (d) {
      if (!d || !d.id || !isWarV(hsVariant)) return;
      if (d.w === 'fist') { swings[d.id] = { t: Date.now(), dir: d.dir || ((d.vx || 0) >= 0 ? 1 : -1) }; return; }
      if (!WPN[d.w]) return;
      if (d.w === 'cannon') {
        // сервер шлёт выстрел из пушки всем, и стрелявшему тоже: ему — только перезарядка пушки
        var gi = d.c | 0, g = guns()[gi];
        gunFired[gi] = Date.now(); gunAimA[gi] = Math.atan2(+d.vy || 0, +d.vx || 1);
        if (d.id === socket.id || !g) return;
        var pv = gunPivot(g), a = gunAimA[gi];
        shots.push({ own: false, id: d.id, sid: d.sid, w: 'cannon', x: pv.x + Math.cos(a) * g.w * GUN.barrel, y: pv.y + Math.sin(a) * g.w * GUN.barrel,
                     vx: +d.vx || 0, vy: +d.vy || 0, born: Date.now(), hit: {} });
        if (window.BFSound && BFSound.bounce) BFSound.bounce();
        return;
      }
      shots.push({ own: false, id: d.id, sid: d.sid, w: d.w, x: +d.x || 0, y: +d.y || 0, vx: +d.vx || 0, vy: +d.vy || 0, born: Date.now(), hit: {} });
    });
    socket.on('warHp', function (d) {
      if (!d || !d.id || !war) return;
      war.hp[d.id] = d.hp | 0;
      if (d.max) war.max[d.id] = d.max;
      if (d.id === socket.id) {
        if ((d.kx || d.ky) && GAME.knock) GAME.knock(d.kx || 0, d.ky || 0);
        if (d.by && window.BFSound && BFSound.death) BFSound.death();
        renderWarHud();
      }
    });
    socket.on('warDown', function (d) {
      if (!d || !d.id || !war) return;
      war.hp[d.id] = 0;
      if (d.score) war.score = d.score;
      if (d.by) war.kills[d.by] = d.kills | 0;
      if (war.v === 'hunger' && war.out.indexOf(d.id) === -1) war.out.push(d.id);
      var a = '<b>' + esc(d.byName || '') + '</b>', b = '<b>' + esc(d.name || nameOfId(d.id)) + '</b>';
      if (d.id === socket.id) {
        log(war.v === 'hunger' ? TR('warOutMe', 'Тебя выбили — ты выбываешь до следующего раунда.')
          : war.v === 'bro' && socket.id === war.bro ? TR('warBroDownMe', 'Тебя выбили — бойцы победили.')
          : d.by ? TR('warDownMe', '{n} выбил тебя. Сейчас вернёшься.').replace('{n}', a)
          : TR('warDownHazard', 'Яд выбил тебя. Сейчас вернёшься.'));
        if (window.BFSound && BFSound.death) BFSound.death();
      } else log(d.by ? TR('warKill', '{a} выбил {b}').replace('{a}', a).replace('{b}', b) : TR('warKillHazard', '{b} выбит ядом').replace('{b}', b));
      syncWarMe(); renderWarHud(); renderTeamHud();
    });
    socket.on('warUp', function (d) {
      if (!d || !d.id || !war) return;
      war.hp[d.id] = d.hp | 0;
      if (d.id === socket.id) {
        GAME.frozen = false;
        warSpawnAt(d.at);
        syncWarMe(); renderWarHud();
      }
    });
    socket.on('warSpawn', function (d) { if (d && war) warSpawnAt(d.at); });
    socket.on('warAmmo', function (d) { if (d && d.ammo) { ammo = d.ammo; renderWarHud(); } });
    socket.on('toks', function (d) { toks = (d && d.list) || []; });
    socket.on('tokAdd', function (t) { if (t && t.id) toks.push(t); });
    socket.on('tokGone', function (d) {
      if (!d) return;
      toks = toks.filter(function (t) { return t.id !== d.id; });
      if (d.by === socket.id && window.BFSound && BFSound.roulTick) BFSound.roulTick();
    });
    socket.on('tokBank', function (d) { if (d) { tokBank = d.n | 0; renderWarHud(); renderShop(); } });
    socket.on('shopOk', function (d) {
      if (!d || !SHOP_ITEMS[d.item]) return;
      if (d.ammo) ammo = d.ammo;
      if (d.ms) myBoost[d.item] = Date.now() + d.ms;
      if (d.item === 'sling' || d.item === 'bomb' || d.item === 'magic') weapon = d.item;
      log(TR('shopBought', 'Куплено: {i}').replace('{i}', '<b>' + esc(TR(SHOP_ITEMS[d.item].key, SHOP_ITEMS[d.item].ru)) + '</b>'));
      if (window.BFSound && BFSound.win) BFSound.win();
      tickWar(); renderWarHud(); renderShop();
    });
    socket.on('shopNo', function (d) {
      if (!d) return;
      log(d.why === 'tokens' ? TR('shopNoTokens', 'Не хватает жетонов') : d.why === 'role' ? TR('shopNoRole', 'Это не для твоей роли')
        : TR('shopNoNow', 'Сейчас это купить нельзя'));
    });
    socket.on('boost', function (d) {
      if (!d || !d.id || !d.item) return;
      (boostOf[d.id] = boostOf[d.id] || {})[d.item] = Date.now() + (d.ms | 0);
    });
  }
  // где появиться: у укрытия (снизу, по центру) или на обычном старте карты
  function warSpawnAt(at) {
    var p = GAME.pl;
    if (at && GAME.teleportTo && p) GAME.teleportTo(at.x + at.w / 2 - p.w / 2, at.y + at.h - p.h);
    else if (GAME.respawn) GAME.respawn();
  }

  /* ---------- «Вечеринка» (см. party.js на сервере) ----------
     Мини-игры идут в панели #gParty поверх карты (по карте при этом можно бегать): викторина —
     кнопки или клавиши 1–4; угадай слово — рисующий рисует на доске, остальные пишут догадки в поле
     панели (печать сама уходит туда, а не в чат); строительная битва — поле 12×12 и палитра, потом
     чужие модели по очереди и оценка звёздами. Всё состояние присылает сервер событием party —
     панель перерисовывается по нему; доска и поле модели живут отдельно, чтобы не терять рисунок
     и ввод при каждом обновлении. */
  var BOARD_COLORS = ['#111827', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ffffff'];
  var BUILD_COLORS = ['#111827', '#ffffff', '#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#92400e', '#9ca3af'];
  var party = null, partyAt = 0, partyKey = '';
  var board = { strokes: [], c: 0, w: 0, down: false, buf: null, bufNew: false, last: null };
  var myBuild = '', buildColor = 2, buildSendT = null, buildDown = false;
  function partyGame(v) { return v === 'quiz' || v === 'guess' || v === 'build'; }
  function partyOn() { return MODE === 'hideAndSeek' && phase === 'round' && !!party && partyGame(hsVariant); }
  function inLang(o) { return !o ? '' : (window.I18N && I18N.current === 'ru' ? o.ru : o.en) || o.en || ''; }
  function partyLeft() { return party ? Math.max(0, party.ms - (Date.now() - partyAt)) : 0; }
  function amDrawer() { return !!party && party.g === 'guess' && !!socket && party.drawer === socket.id; }
  // поле догадки — сюда уходит печать во время «Угадай слово» (см. обработчик чата)
  function partyInput() {
    if (!partyOn() || party.g !== 'guess' || party.stage !== 'draw' || amDrawer() || party.done) return null;
    return $('gPGuess');
  }

  function partySet(d) {
    party = d || null; partyAt = Date.now();
    var box = $('gParty');
    if (!party || !partyGame(hsVariant)) { box.style.display = 'none'; box.innerHTML = ''; partyKey = ''; return; }
    box.style.display = '';
    // каркас панели меняется только при смене игры, этапа или роли — иначе обновляем надписи
    var key = party.g + ':' + party.stage + ':' + (party.g === 'guess' ? (amDrawer() ? 'd' : party.done ? 'ok' : 'g') : '')
      + (party.g === 'build' ? ':' + party.k : '') + (party.g === 'quiz' ? ':' + party.n : '');
    if (key !== partyKey) { partyKey = key; partySkeleton(); }
    partyFill();
  }
  function scoreHtml() {
    return (party.score || []).slice(0, 5).map(function (x, i) {
      return '<span' + (socket && x.id === socket.id ? ' class="me"' : '') + '>' + (i + 1) + '. ' + esc(x.name) + ' <b>' + x.pts + '</b></span>';
    }).join('');
  }
  function gameTitle(g) {
    return g === 'quiz' ? TR('modeQuiz', 'Викторина') : g === 'guess' ? TR('modeGuess', 'Угадай слово') : TR('modeBuild', 'Строительная битва');
  }
  function partySkeleton() {
    var box = $('gParty'), g = party.g, h = '';
    h += '<div class="pHead"><b>' + esc(gameTitle(g)) + '</b><span id="gPSub"></span><span class="pT" id="gPT"></span></div>'
      + '<div class="pBar"><i id="gPBar"></i></div>';
    if (g === 'quiz') {
      h += '<div class="pQ" id="gPQ"></div><div class="pOpts">';
      for (var i = 0; i < 4; i++) h += '<button class="pOpt" data-i="' + i + '"><small>' + (i + 1) + '</small><span></span></button>';
      h += '</div>';
    } else if (g === 'guess') {
      h += '<div class="pWord" id="gPWord"></div><canvas id="gPBoard" width="480" height="300"></canvas>';
      if (amDrawer() && party.stage === 'draw') {
        h += '<div class="pTools">' + BOARD_COLORS.map(function (c, i) {
          return '<button class="pSw' + (i === board.c ? ' on' : '') + '" data-c="' + i + '" style="background:' + c + '"></button>';
        }).join('') + '<button class="pBtn" id="gPSize">' + esc(TR('partyThick', 'Толще')) + '</button>'
          + '<button class="pBtn" id="gPClear">' + esc(TR('partyClear', 'Стереть всё')) + '</button></div>';
      } else if (party.stage === 'draw' && !party.done) {
        h += '<form class="pGuess" id="gPForm"><input id="gPGuess" maxlength="40" autocomplete="off" placeholder="'
          + esc(TR('partyGuessPh', 'Твоя догадка…')) + '"><button class="pBtn">' + esc(TR('partyGuessBtn', 'Ответить')) + '</button></form>';
      }
      h += '<div class="pMsg" id="gPMsg"></div>';
    } else {
      h += '<div class="pWord" id="gPWord"></div><canvas id="gPGrid" width="240" height="240"></canvas>';
      if (party.stage === 'build') {
        h += '<div class="pTools">' + BUILD_COLORS.map(function (c, i) {
          return '<button class="pSw' + (i === buildColor ? ' on' : '') + '" data-b="' + i + '" style="background:' + c + '"></button>';
        }).join('') + '<button class="pSw pErase' + (buildColor === -1 ? ' on' : '') + '" data-b="-1" title="' + esc(TR('partyErase', 'Ластик')) + '">×</button></div>';
      } else if (party.stage === 'vote') {
        h += '<div class="pStars" id="gPStars">';
        for (var s = 1; s <= 5; s++) h += '<button class="pStar" data-s="' + s + '">★</button>';
        h += '</div>';
      }
      h += '<div class="pMsg" id="gPMsg"></div>';
    }
    h += '<div class="pScore" id="gPScore"></div>';
    box.innerHTML = h;
    if (g === 'guess') { board.last = null; redrawBoard(); }
    if (g === 'build' && party.stage === 'build' && !myBuild) myBuild = party.mine || '';
  }
  function partyFill() {
    var g = party.g, sub = $('gPSub'), word = $('gPWord'), msg = $('gPMsg');
    if (g === 'quiz') {
      sub.textContent = TR('partyQOf', 'Вопрос {n} из {of}').replace('{n}', party.n).replace('{of}', party.of);
      $('gPQ').textContent = inLang(party.q);
      var opts = document.querySelectorAll('#gParty .pOpt');
      for (var i = 0; i < opts.length; i++) {
        opts[i].querySelector('span').textContent = inLang((party.a || [])[i]);
        opts[i].className = 'pOpt' + (party.mine === i ? ' mine' : '') + (party.right === i ? ' ok' : '')
          + (party.right !== -1 && party.mine === i && party.right !== i ? ' bad' : '');
        opts[i].disabled = party.stage !== 'q' || party.mine !== -1;
      }
    } else if (g === 'guess') {
      if (party.stage === 'end') {
        sub.textContent = '';
        word.innerHTML = esc(TR('partyWordWas', 'Слово: {w}').replace('{w}', inLang(party.word)));
      } else if (amDrawer()) {
        sub.textContent = TR('partyYouDraw', 'Ты рисуешь');
        word.innerHTML = esc(TR('partyDrawThis', 'Нарисуй:')) + ' <b>' + esc(inLang(party.word)) + '</b>';
      } else {
        sub.textContent = TR('partyDraws', 'Рисует {n}').replace('{n}', party.drawerName || '');
        word.innerHTML = party.done ? esc(TR('partyGotIt', 'Угадал! Слово:')) + ' <b>' + esc(inLang(party.word)) + '</b>'
          : '<span class="pHint">' + esc(inLang(party.hint)) + '</span>';
      }
    } else {
      sub.textContent = party.stage === 'vote' ? TR('partyModelOf', 'Модель {k} из {of}').replace('{k}', party.k).replace('{of}', party.of)
        : party.stage === 'end' ? TR('partyBuildEnd', 'Итог') : '';
      word.innerHTML = esc(TR('partyTheme', 'Тема:')) + ' <b>' + esc(inLang(party.theme)) + '</b>';
      if (party.stage === 'vote') {
        msg.textContent = party.own ? TR('partyOwn', 'Это твоя модель — её оценивают другие') : TR('partyRate', 'Оцени модель от 1 до 5 звёзд');
        var st = document.querySelectorAll('#gParty .pStar');
        for (var s = 0; s < st.length; s++) { st[s].disabled = !!party.own; st[s].className = 'pStar' + (party.myVote >= s + 1 ? ' on' : ''); }
      } else if (party.stage === 'end') {
        msg.innerHTML = party.win ? TR('partyBestModel', 'Лучшая модель — {n}: {p} звёзд').replace('{n}', '<b>' + esc(party.win.name) + '</b>').replace('{p}', party.win.pts)
          : esc(TR('partyNoModels', 'Моделей не построили'));
      } else msg.textContent = TR('partyBuildHint', 'Рисуй по клеткам, × — ластик. Модель сохраняется сама.');
      drawGrid();
    }
    $('gPScore').innerHTML = scoreHtml();
    partyTick();
  }
  // таймер и полоса времени этапа
  function partyTick() {
    if (!party || !$('gPT')) return;
    var left = partyLeft(), total = party.g === 'quiz' ? (party.stage === 'q' ? 12000 : 3500) : party.g === 'guess' ? 80000 : party.stage === 'build' ? 60000 : 6000;
    $('gPT').textContent = Math.ceil(left / 1000) + TR('secShort', ' с');
    $('gPBar').style.width = Math.max(0, Math.min(100, 100 * left / Math.max(total, party.ms || 1))) + '%';
  }

  /* --- викторина --- */
  function partyAnswer(i) {
    if (!partyOn() || party.g !== 'quiz' || party.stage !== 'q' || party.mine !== -1) return;
    party.mine = i;
    socket.emit('partyAns', { i: i });
    partyFill();
  }

  /* --- угадай слово: доска --- */
  function drawSeg(ctx, s, from) {
    var p = s.p;
    ctx.strokeStyle = BOARD_COLORS[s.c] || '#111827';
    ctx.lineWidth = s.c === 7 ? 18 : s.w ? 9 : 4;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (from && !s.n) { ctx.moveTo(from[0], from[1]); ctx.lineTo(p[0], p[1]); } else { ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + 0.01, p[1]); }
    for (var i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.stroke();
    return [p[p.length - 2], p[p.length - 1]];
  }
  function redrawBoard() {
    var cv = $('gPBoard');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
    board.last = null;
    board.strokes.forEach(function (s) { board.last = drawSeg(ctx, s, board.last); });
  }
  function addStroke(s) {
    board.strokes.push(s);
    var cv = $('gPBoard');
    if (cv) board.last = drawSeg(cv.getContext('2d'), s, board.last);
  }
  function boardPt(e) {
    var cv = $('gPBoard'), r = cv.getBoundingClientRect();
    return [Math.round((e.clientX - r.left) * cv.width / r.width), Math.round((e.clientY - r.top) * cv.height / r.height)];
  }
  function flushStroke() {
    // первый кусок линии может быть и точкой, дальше — только если к перенесённой точке добавились новые
    if (!board.buf || board.buf.length < (board.bufNew ? 2 : 4)) return;
    var s = { n: board.bufNew, c: board.c, w: board.w, p: board.buf };
    socket.emit('partyDraw', s);
    board.bufNew = false;
    board.buf = [board.buf[board.buf.length - 2], board.buf[board.buf.length - 1]];
  }
  // новый раунд или лобби: панель убираем, доску и модель — с чистого листа
  function partyReset() { board.strokes = []; board.last = null; board.down = false; myBuild = ''; partySet(null); }

  /* --- строительная битва: поле модели --- */
  function gridPx() {
    var n = 144;
    if (party.stage === 'build') return myBuild && myBuild.length === n ? myBuild : new Array(n + 1).join('.');
    if (party.stage === 'vote') return party.show || '';
    return party.win ? party.win.px : '';
  }
  function drawGrid() {
    var cv = $('gPGrid');
    if (!cv) return;
    var ctx = cv.getContext('2d'), px = gridPx(), c = 20;
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, 240, 240);
    for (var i = 0; i < 144; i++) {
      var ch = px[i];
      if (ch && ch !== '.') { ctx.fillStyle = BUILD_COLORS[+ch] || '#111827'; ctx.fillRect((i % 12) * c, Math.floor(i / 12) * c, c, c); }
    }
    if (party.stage === 'build') {
      ctx.strokeStyle = 'rgba(15,23,42,.12)'; ctx.lineWidth = 1;
      for (var k = 1; k < 12; k++) { ctx.beginPath(); ctx.moveTo(k * c + 0.5, 0); ctx.lineTo(k * c + 0.5, 240); ctx.moveTo(0, k * c + 0.5); ctx.lineTo(240, k * c + 0.5); ctx.stroke(); }
    }
  }
  function paintCell(e) {
    var cv = $('gPGrid'), r = cv.getBoundingClientRect();
    var x = Math.floor((e.clientX - r.left) * 12 / r.width), y = Math.floor((e.clientY - r.top) * 12 / r.height);
    if (x < 0 || y < 0 || x > 11 || y > 11) return;
    var px = gridPx().split(''), ch = buildColor === -1 ? '.' : String(buildColor);
    if (px[y * 12 + x] === ch) return;
    px[y * 12 + x] = ch;
    myBuild = px.join('');
    drawGrid();
    clearTimeout(buildSendT);
    buildSendT = setTimeout(function () { if (partyOn() && party.stage === 'build') socket.emit('partyBuild', { px: myBuild }); }, 250);
  }

  function bindPartyUi() {
    var box = $('gParty');
    box.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t || !party) return;
      if (t.classList.contains('pOpt')) partyAnswer(+t.dataset.i);
      else if (t.dataset.c !== undefined) { board.c = +t.dataset.c; partyKey = ''; partySet(party); }
      else if (t.id === 'gPSize') { board.w = board.w ? 0 : 1; t.classList.toggle('on', !!board.w); }
      else if (t.id === 'gPClear') { socket.emit('partyClear'); }
      else if (t.dataset.b !== undefined) { buildColor = +t.dataset.b; partyKey = ''; partySet(party); }
      else if (t.classList.contains('pStar') && party.stage === 'vote' && !party.own) {
        party.myVote = +t.dataset.s; socket.emit('partyVote', { s: +t.dataset.s }); partyFill();
      }
    });
    box.addEventListener('submit', function (e) {
      e.preventDefault();
      var inpG = $('gPGuess');
      if (!inpG || !inpG.value.trim()) return;
      socket.emit('partyGuess', { t: inpG.value.trim() });
      inpG.value = '';
    });
    box.addEventListener('pointerdown', function (e) {
      if (!party) return;
      if (e.target.id === 'gPBoard' && amDrawer() && party.stage === 'draw') {
        e.preventDefault();
        board.down = true; board.bufNew = true;
        var p = boardPt(e);
        board.buf = [p[0], p[1]];
        addStroke({ n: true, c: board.c, w: board.w, p: [p[0], p[1]] });
        try { e.target.setPointerCapture(e.pointerId); } catch (x) {}
      } else if (e.target.id === 'gPGrid' && party.stage === 'build') {
        e.preventDefault(); buildDown = true; paintCell(e);
        try { e.target.setPointerCapture(e.pointerId); } catch (x) {}
      }
    });
    box.addEventListener('pointermove', function (e) {
      if (board.down && e.target.id === 'gPBoard') {
        var p = boardPt(e);
        board.buf.push(p[0], p[1]);
        addStroke({ n: false, c: board.c, w: board.w, p: [p[0], p[1]] });
        if (board.buf.length >= 70) flushStroke();
      } else if (buildDown && e.target.id === 'gPGrid') paintCell(e);
    });
    var up = function () { if (board.down) { board.down = false; flushStroke(); } buildDown = false; };
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
    // кусок линии уходит на сервер раз в 50 мс, пока ведёшь
    setInterval(function () { if (board.down) flushStroke(); }, 50);
    setInterval(partyTick, 250);
  }
  function bindParty() {
    socket.on('party', function (d) {
      if (!d || MODE !== 'hideAndSeek') return;
      partySet(d);
    });
    socket.on('partyAnswered', function (d) {
      if (party && party.g === 'quiz' && d) { party.answered = d.n | 0; }
    });
    socket.on('partyStroke', function (s) { if (s && s.p && party && party.g === 'guess') addStroke(s); });
    socket.on('partyStrokes', function (d) { if (d && d.list && party && party.g === 'guess') { board.strokes = d.list.slice(); redrawBoard(); } });
    socket.on('partyClear', function () { board.strokes = []; redrawBoard(); });
    socket.on('partyGuessed', function (d) {
      if (!d) return;
      log(socket && d.id === socket.id ? TR('partyYouGuessed', 'Ты угадал слово!')
        : TR('partyGuessedLog', '{n} угадал слово!').replace('{n}', '<b>' + esc(d.name || '') + '</b>'));
      if (socket && d.id === socket.id && window.BFSound && BFSound.win) BFSound.win();
    });
    socket.on('partyNo', function (d) {
      var m = $('gPMsg');
      if (m) m.textContent = d && d.close ? TR('partyClose', 'Почти! Проверь буквы.') : TR('partyNotIt', 'Не то слово — пробуй ещё.');
    });
  }

  /* ---------- «Приключение» (см. adventure.js на сервере) ----------
     Командный PvE: врагов двигает сервер (advEn, 10 раз в секунду), здесь они только рисуются и
     плавно догоняют свои места. Удар (F, клик, кнопка на телефоне) — оружием своего класса: меч
     задевает всех врагов перед собой, стрела и огненный шар летят к мыши (или вперёд) и попадают в
     первого на пути; о попадании узнаёт сервер (advHit) и сам его проверяет. Q — лечение мага.
     Класс выбирают в лобби в панели #gAdvPick. Люки башни открываются у всех по advGate. */
  var ADV_CLS = {
    warrior: { w: 'sword', hp: 170, key: 'clsWarrior', ru: 'Воин', dKey: 'clsWarriorD', dRu: 'Меч бьёт всех врагов рядом. Здоровья больше всех.' },
    archer:  { w: 'bow',   hp: 110, key: 'clsArcher',  ru: 'Лучник', dKey: 'clsArcherD', dRu: 'Лук стреляет далеко — целься мышью.' },
    mage:    { w: 'fire',  hp: 95,  key: 'clsMage',    ru: 'Маг', dKey: 'clsMageD', dRu: 'Огненный шар задевает соседей. Q — лечит всех рядом.' }
  };
  var ADV_WPN = {
    sword: { cd: 420, reach: 120 },
    bow:   { cd: 480, v: 1.3, g: 0.0007, life: 1600, r: 5, color: '#78350f' },
    fire:  { cd: 720, v: 0.95, g: 0, life: 1600, r: 10, color: '#f97316', boom: 95 }
  };
  // размеры — те же, что KINDS в adventure.js (по ним считаются попадания)
  var ADV_KIND = { slime: { w: 40, h: 46 }, skeleton: { w: 34, h: 96 }, bat: { w: 56, h: 30 }, knight: { w: 44, h: 100 },
                   ogre: { w: 52, h: 116 }, boss: { w: 72, h: 190 } };
  var ADV_HEAL_CD = 8000;
  var adv = null;                // состояние раунда: { v, hp, max, down, kills, en, floor, floors, gates, allGates, core, wave, waves }
  var advCls = {};               // у кого какой класс (лобби и раунд)
  var advShots = [], advFx = [], advLastFire = 0, advHealAt = 0, advSeq = 1, advSlam = null, advSlamTold = false;
  function advV(v) { return v === 'quest' || v === 'defense'; }
  function advOn() { return MODE === 'hideAndSeek' && phase === 'round' && !!adv && advV(hsVariant); }
  function myCls() { return (socket && advCls[socket.id]) || 'warrior'; }
  function advAlive(id) { return !!adv && (adv.hp[id] | 0) > 0 && adv.down.indexOf(id) === -1; }
  function clsName(c) { return ADV_CLS[c] ? TR(ADV_CLS[c].key, ADV_CLS[c].ru) : ''; }

  function advSet(d) {
    adv = d ? { v: d.v, hp: d.hp || {}, max: d.max || {}, down: d.down || [], kills: d.kills || {}, en: {}, floor: d.floor | 0, floors: d.floors | 0,
                gates: d.gates || [], allGates: d.allGates || [], core: d.core || null, wave: d.wave | 0, waves: d.waves | 0 } : null;
    if (d && d.cls) Object.keys(d.cls).forEach(function (id) { advCls[id] = d.cls[id]; });
    if (adv) (d.en || []).forEach(advPutEnemy);
    advShots = []; advFx = []; advSlam = null; advSlamTold = false;
    advSyncGates();
    if (!adv) { dubStop(); if (GAME.frozen && !war) GAME.frozen = false; }
    advSyncMe(); renderAdvHud(); renderAdvTop(); renderAdvPick();
  }
  function advPutEnemy(a) {
    var id = a[0], e = adv.en[id];
    if (!e) e = adv.en[id] = { id: id, k: a[1], x: a[2], y: a[3] };
    e.tx = a[2]; e.ty = a[3]; e.dir = a[4]; e.hp = a[5]; e.max = a[6]; e.seen = Date.now();
  }
  // люки башни: закрыты все, кроме уже открытых (у карты — свой customId на каждом)
  function advSyncGates() {
    var all = adv ? adv.allGates : [], open = adv ? adv.gates : [];
    (GAME.objects || []).forEach(function (o) {
      if (o.customId && all.indexOf(o.customId) !== -1) o._act = open.indexOf(o.customId) !== -1;
    });
  }
  function advSyncMe() {
    if (!socket || !adv || phase !== 'round') return;
    var dead = !advAlive(socket.id);
    GAME.frozen = dead;
    GAME.myAlpha = dead ? 0.3 : 1;
  }

  /* --- атака --- */
  function advAim(cx, cy, v) {
    if (aimPt && Date.now() - aimAt < GUN.aimMs) {
      var dx = aimPt.x - cx, dy = aimPt.y - cy, l = Math.hypot(dx, dy) || 1;
      return { vx: dx / l * v, vy: dy / l * v };
    }
    return { vx: (GAME.pl.face || 1) * v, vy: -0.05 };
  }
  function advAttack() {
    if (!advOn() || !socket || !advAlive(socket.id) || GAME.frozen) return;
    var c = myCls(), w = ADV_CLS[c].w, W = ADV_WPN[w], now = Date.now();
    if (now - advLastFire < W.cd) return;
    advLastFire = now;
    var p = GAME.pl, face = p.face || 1, cx = p.x + p.w / 2, cy = p.y + p.h * 0.4, sid = advSeq++;
    if (w === 'sword') {
      swings[socket.id] = { t: now, dir: face, sword: true };
      Object.keys(adv.en).forEach(function (id) {
        var e = adv.en[id], K = ADV_KIND[e.k], dx = e.x - cx, ey = e.y - K.h / 2;
        if (dx * face >= -K.w / 2 - 10 && Math.abs(dx) <= W.reach + K.w / 2 && Math.abs(ey - (p.y + p.h / 2)) <= 70 + K.h / 2)
          socket.emit('advHit', { e: +id, w: 'sword', sid: sid });
      });
    } else {
      var vel = advAim(cx, cy, W.v);
      advShots.push({ own: true, w: w, sid: sid, x: cx, y: cy, vx: vel.vx, vy: vel.vy, born: now });
      socket.emit('advShot', { w: w, x: Math.round(cx), y: Math.round(cy), vx: vel.vx, vy: vel.vy });
    }
    if (window.BFSound && BFSound.step) BFSound.step();
    renderAdvHud();
  }
  function advHealCast() {
    if (!advOn() || myCls() !== 'mage' || !advAlive(socket.id) || Date.now() - advHealAt < ADV_HEAL_CD) return;
    advHealAt = Date.now();
    socket.emit('advHeal');
    renderAdvHud();
  }
  var advLastStep = 0;
  function advStepShots() {
    var now = Date.now(), dt = Math.min(50, now - (advLastStep || now));
    advLastStep = now;
    advShots = advShots.filter(function (s) {
      var W = ADV_WPN[s.w];
      if (now - s.born > W.life) return false;
      var steps = Math.max(1, Math.ceil(Math.hypot(s.vx * dt, s.vy * dt) / 8));
      for (var k = 0; k < steps; k++) {
        var h = dt / steps;
        s.vy += (W.g || 0) * h; s.x += s.vx * h; s.y += s.vy * h;
        if (GAME.solidAt && GAME.solidAt(s.x, s.y)) { if (W.boom) advFx.push({ t: now, x: s.x, y: s.y, k: 'boom' }); return false; }
        if (!adv) return false;
        var ids = Object.keys(adv.en);
        for (var i = 0; i < ids.length; i++) {
          var e = adv.en[ids[i]], K = ADV_KIND[e.k];
          if (s.x + W.r > e.x - K.w / 2 && s.x - W.r < e.x + K.w / 2 && s.y + W.r > e.y - K.h && s.y - W.r < e.y) {
            if (s.own) socket.emit('advHit', { e: +ids[i], w: s.w, sid: s.sid });
            if (W.boom) advFx.push({ t: now, x: s.x, y: s.y, k: 'boom' });
            return false;
          }
        }
      }
      return true;
    });
  }

  /* --- рисование врагов --- */
  function advDrawEnemy(ctx, e, now) {
    var K = ADV_KIND[e.k], w = K.w, h = K.h, x = e.x - w / 2, y = e.y - h, hit = e.hitAt && now - e.hitAt < 140;
    ctx.save();
    ctx.translate(x, y);
    if (e.dir < 0) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    var lunge = e.atkAt && now - e.atkAt < 220 ? Math.sin(Math.PI * (now - e.atkAt) / 220) * 10 : 0;
    ctx.translate(lunge, 0);
    /* Враги — плоские фигурки с гранями (светлая и тёмная сторона), как на рисунке режима: слизень-капля,
       скелет с мечом, летучая мышь, рыцарь со щитом, орк с топором и босс в плаще с короной и посохом.
       Рисуются в своём хитбоксе w×h (лицом вправо, разворот — выше). Ударили — на миг весь светлеет. */
    var P = hit ? function () { return '#fecaca'; } : function (c) { return c; };
    var R = function (c, x0, y0, ww, hh) { ctx.fillStyle = P(c); ctx.fillRect(x0, y0, ww, hh); };
    var rr = function (x0, y0, ww, hh, r) {
      r = Math.min(r, ww / 2, hh / 2);
      ctx.beginPath(); ctx.moveTo(x0 + r, y0); ctx.arcTo(x0 + ww, y0, x0 + ww, y0 + hh, r); ctx.arcTo(x0 + ww, y0 + hh, x0, y0 + hh, r);
      ctx.arcTo(x0, y0 + hh, x0, y0, r); ctx.arcTo(x0, y0, x0 + ww, y0, r); ctx.closePath();
    };
    var poly = function (c, pts) { ctx.fillStyle = P(c); ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); ctx.fill(); };
    if (e.k === 'slime') {
      var sq = 1 + Math.sin(now / 160 + e.id) * 0.05, top = h * (1 - sq);
      ctx.fillStyle = P('#2f8f3a');
      ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, h * 0.5); ctx.quadraticCurveTo(0, top, w / 2, top); ctx.quadraticCurveTo(w, top, w, h * 0.5); ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
      R('#23702c', 0, h * 0.86, w, h * 0.14);
      ctx.fillStyle = P('rgba(255,255,255,.28)'); ctx.beginPath(); ctx.ellipse(w * 0.26, top + h * 0.22, w * 0.08, h * 0.1, 0, 0, 6.2832); ctx.fill();
      R('#0f2a14', w * 0.3, h * 0.42, w * 0.12, h * 0.2); R('#0f2a14', w * 0.58, h * 0.42, w * 0.12, h * 0.2);
    } else if (e.k === 'skeleton') {
      var B = '#e5e7eb', S = '#c4c8cf', D = '#374151';
      R(S, w * 0.3, h * 0.66, w * 0.14, h * 0.32); R(S, w * 0.56, h * 0.66, w * 0.14, h * 0.32);          // ноги
      R(B, w * 0.26, h * 0.6, w * 0.48, h * 0.08);                                                    // таз
      R(B, w * 0.47, h * 0.3, w * 0.06, h * 0.32);                                                    // позвоночник
      for (var rb = 0; rb < 3; rb++) R(B, w * 0.22, h * (0.32 + rb * 0.08), w * 0.56, h * 0.045);     // рёбра
      R(S, w * 0.1, h * 0.32, w * 0.1, h * 0.26); R(S, w * 0.8, h * 0.32, w * 0.1, h * 0.24);          // руки
      ctx.fillStyle = P(B); rr(w * 0.14, 0, w * 0.72, h * 0.27, w * 0.12); ctx.fill();                // череп
      R(D, w * 0.28, h * 0.08, w * 0.14, h * 0.09); R(D, w * 0.58, h * 0.08, w * 0.14, h * 0.09);
      R(D, w * 0.47, h * 0.19, w * 0.06, h * 0.04);
      poly('#9ca3af', [w * 0.86, h * 0.56, w * 1.28, h * 0.12, w * 1.36, h * 0.16, w * 0.94, h * 0.6]);  // меч
      R('#1f2937', w * 0.78, h * 0.54, w * 0.24, h * 0.04);
    } else if (e.k === 'bat') {
      var flap = Math.sin(now / 80 + e.id) * h * 0.35;
      poly('#3b2a5c', [w * 0.4, h * 0.3, 0, h * 0.5 - flap, w * 0.1, h * 0.62, w * 0.2, h * 0.56, w * 0.28, h * 0.72, w * 0.4, h * 0.6]);
      poly('#3b2a5c', [w * 0.6, h * 0.3, w, h * 0.5 - flap, w * 0.9, h * 0.62, w * 0.8, h * 0.56, w * 0.72, h * 0.72, w * 0.6, h * 0.6]);
      poly('#1f1630', [w * 0.36, h * 0.18, w * 0.4, 0, w * 0.46, h * 0.16, w * 0.54, h * 0.16, w * 0.6, 0, w * 0.64, h * 0.18, w * 0.64, h * 0.8, w * 0.5, h, w * 0.36, h * 0.8]);
      R('#ef4444', w * 0.42, h * 0.36, w * 0.05, h * 0.18); R('#ef4444', w * 0.53, h * 0.36, w * 0.05, h * 0.18);
    } else if (e.k === 'knight') {
      var A = '#8b929e', AD = '#6b7280';
      R('#374151', w * 0.22, h * 0.68, w * 0.22, h * 0.32); R('#374151', w * 0.52, h * 0.68, w * 0.22, h * 0.32);   // ноги
      R(AD, w * 0.2, h * 0.3, w * 0.56, h * 0.4); R(A, w * 0.2, h * 0.3, w * 0.28, h * 0.4);              // латы
      R('#374151', w * 0.2, h * 0.62, w * 0.56, h * 0.05);                                            // пояс
      ctx.fillStyle = P(A); rr(w * 0.18, 0, w * 0.6, h * 0.3, w * 0.14); ctx.fill();                // шлем
      R('#1f2937', w * 0.24, h * 0.1, w * 0.48, h * 0.1);
      R(A, w * 0.34, h * 0.1, w * 0.04, h * 0.1); R(A, w * 0.46, h * 0.1, w * 0.04, h * 0.1); R(A, w * 0.58, h * 0.1, w * 0.04, h * 0.1);
      poly('#9ca3af', [w * 0.04, h * 0.95, w * -0.06, h * 0.9, w * 0.14, h * 0.58, w * 0.22, h * 0.62]);   // меч
      poly('#9ca3af', [w * 0.58, h * 0.36, w * 1.08, h * 0.36, w * 1.08, h * 0.6, w * 0.83, h * 0.78, w * 0.58, h * 0.6]);   // щит
      poly('#4b5563', [w * 0.64, h * 0.4, w * 1.02, h * 0.4, w * 1.02, h * 0.58, w * 0.83, h * 0.72, w * 0.64, h * 0.58]);
    } else if (e.k === 'ogre') {
      var G = '#6aa84f', GD = '#4f8a3a';
      R('#3f2e22', w * 0.22, h * 0.7, w * 0.22, h * 0.22); R('#3f2e22', w * 0.54, h * 0.7, w * 0.22, h * 0.22);    // штаны
      R('#2d2018', w * 0.2, h * 0.92, w * 0.26, h * 0.08); R('#2d2018', w * 0.52, h * 0.92, w * 0.26, h * 0.08);   // сапоги
      R(GD, w * 0.04, h * 0.36, w * 0.14, h * 0.3); R(GD, w * 0.82, h * 0.36, w * 0.14, h * 0.3);          // руки
      R('#6b4f3a', w * 0.16, h * 0.34, w * 0.68, h * 0.38);                                          // рубаха
      poly('#4a3527', [w * 0.18, h * 0.36, w * 0.28, h * 0.36, w * 0.84, h * 0.66, w * 0.84, h * 0.72, w * 0.74, h * 0.72, w * 0.18, h * 0.44]);   // перевязь
      R('#3f2e22', w * 0.16, h * 0.64, w * 0.68, h * 0.06); R('#d6c7a1', w * 0.44, h * 0.645, w * 0.1, h * 0.05);
      poly(G, [w * 0.22, h * 0.08, 0, h * 0.02, w * 0.18, h * 0.2]); poly(G, [w * 0.78, h * 0.08, w, h * 0.02, w * 0.82, h * 0.2]);   // уши
      ctx.fillStyle = P(G); rr(w * 0.2, 0, w * 0.6, h * 0.32, w * 0.12); ctx.fill();               // голова
      poly('#1a2e12', [w * 0.3, h * 0.12, w * 0.44, h * 0.15, w * 0.44, h * 0.19, w * 0.3, h * 0.17]);
      poly('#1a2e12', [w * 0.7, h * 0.12, w * 0.56, h * 0.15, w * 0.56, h * 0.19, w * 0.7, h * 0.17]);
      poly('#f3f4f6', [w * 0.34, h * 0.27, w * 0.38, h * 0.21, w * 0.42, h * 0.27]); poly('#f3f4f6', [w * 0.58, h * 0.27, w * 0.62, h * 0.21, w * 0.66, h * 0.27]);
      R('#5b3a1e', w * 0.92, h * 0.12, w * 0.07, h * 0.6);                                          // топор
      poly('#9ca3af', [w * 0.99, h * 0.12, w * 1.26, h * 0.04, w * 1.3, h * 0.32, w * 0.99, h * 0.26]);
    } else if (e.k === 'boss') {
      var C1 = '#241d36', C2 = '#6d28d9', Gd = '#d4a017';
      R('#5b3a1e', w * 0.94, h * 0.14, w * 0.06, h * 0.86);                                        // посох
      poly('#8b5cf6', [w * 0.97, 0, w * 1.08, h * 0.07, w * 0.97, h * 0.14, w * 0.86, h * 0.07]);
      R(Gd, w * 0.9, h * 0.14, w * 0.14, h * 0.02);
      poly(C1, [w * 0.18, h * 0.3, w * 0.82, h * 0.3, w * 0.96, h, w * 0.04, h]);                   // плащ
      poly(C2, [w * 0.38, h * 0.34, w * 0.62, h * 0.34, w * 0.66, h, w * 0.34, h]);                 // фиолетовая полоса
      poly(Gd, [w * 0.18, h * 0.3, w * 0.82, h * 0.3, w * 0.5, h * 0.4]);                           // золотой воротник
      poly(C1, [w * 0.26, h * 0.3, w * 0.74, h * 0.3, w * 0.5, h * 0.36]);
      ctx.fillStyle = P(C1); rr(w * 0.26, h * 0.08, w * 0.48, h * 0.22, w * 0.1); ctx.fill();    // голова в капюшоне
      poly(Gd, [w * 0.3, h * 0.17, w * 0.44, h * 0.19, w * 0.44, h * 0.22, w * 0.32, h * 0.21]);   // глаза
      poly(Gd, [w * 0.7, h * 0.17, w * 0.56, h * 0.19, w * 0.56, h * 0.22, w * 0.68, h * 0.21]);
      poly(Gd, [w * 0.28, h * 0.12, w * 0.04, h * 0.02, w * 0.1, h * 0.13, w * 0.26, h * 0.18]);   // рога
      poly(Gd, [w * 0.72, h * 0.12, w * 0.96, h * 0.02, w * 0.9, h * 0.13, w * 0.74, h * 0.18]);
      poly(Gd, [w * 0.32, h * 0.1, w * 0.32, h * 0.03, w * 0.41, h * 0.07, w * 0.5, h * 0.01, w * 0.59, h * 0.07, w * 0.68, h * 0.03, w * 0.68, h * 0.1]);   // корона
      poly('#8b5cf6', [w * 0.5, h * 0.035, w * 0.54, h * 0.065, w * 0.5, h * 0.095, w * 0.46, h * 0.065]);
    }
    ctx.restore();
    // полоска здоровья над врагом
    var bw = Math.max(30, Math.min(90, w)), k = Math.max(0, Math.min(1, e.hp / (e.max || 1)));
    ctx.fillStyle = 'rgba(17,24,39,.6)'; ctx.fillRect(e.x - bw / 2 - 1, y - 13, bw + 2, 7);
    ctx.fillStyle = e.k === 'boss' ? '#a855f7' : k > 0.5 ? '#22c55e' : '#ef4444'; ctx.fillRect(e.x - bw / 2, y - 12, bw * k, 5);
  }
  function drawAdv(ctx) {
    if (!adv) return;
    advStepShots();
    var now = Date.now();
    Object.keys(adv.en).forEach(function (id) {
      var e = adv.en[id];
      e.x += (e.tx - e.x) * 0.25; e.y += (e.ty - e.y) * 0.25;
      advDrawEnemy(ctx, e, now);
    });
    advShots.forEach(function (s) {
      var W = ADV_WPN[s.w];
      ctx.save();
      if (s.w === 'bow') {
        var a = Math.atan2(s.vy, s.vx);
        ctx.translate(s.x, s.y); ctx.rotate(a);
        ctx.strokeStyle = W.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(6, 0); ctx.stroke();
        ctx.fillStyle = '#9ca3af'; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(4, -4); ctx.lineTo(4, 4); ctx.fill();
      } else {
        ctx.shadowColor = '#fb923c'; ctx.shadowBlur = 16; ctx.fillStyle = W.color;
        ctx.beginPath(); ctx.arc(s.x, s.y, W.r, 0, 6.2832); ctx.fill();
      }
      ctx.restore();
    });
    advFx = advFx.filter(function (f) {
      var age = now - f.t, life = f.k === 'heal' ? 600 : 380;
      if (age > life) return false;
      var k = age / life;
      ctx.save(); ctx.globalAlpha = 1 - k;
      if (f.k === 'boom') { ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.arc(f.x, f.y, ADV_WPN.fire.boom * (0.3 + 0.7 * k), 0, 6.2832); ctx.fill(); }
      else if (f.k === 'heal') { ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * k, 0, 6.2832); ctx.stroke(); }
      else if (f.k === 'die') { ctx.fillStyle = '#9ca3af'; for (var i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(f.x + Math.cos(i) * 30 * k, f.y - 20 - Math.sin(i * 2) * 30 * k, 5, 0, 6.2832); ctx.fill(); } }
      ctx.restore();
      return true;
    });
    // удар босса о землю: красная полоса на полу, пока он замахивается
    if (advSlam) {
      var left = advSlam.until - now;
      if (left < -300) advSlam = null;
      else {
        ctx.save(); ctx.globalAlpha = left > 0 ? 0.25 + 0.25 * Math.sin(now / 60) : 0.7 * (1 + left / 300);
        ctx.fillStyle = '#ef4444'; ctx.fillRect(advSlam.x - advSlam.r, advSlam.y - 14, advSlam.r * 2, 14);
        ctx.restore();
      }
    }
    // кристалл обороны: полоса прочности над ним
    if (adv.core) {
      var c = adv.core, kk = Math.max(0, c.hp / (c.max || 1));
      ctx.fillStyle = 'rgba(17,24,39,.6)'; ctx.fillRect(c.x - 61, c.y - 262, 122, 12);
      ctx.fillStyle = '#a855f7'; ctx.fillRect(c.x - 60, c.y - 261, 120 * kk, 10);
    }
    // полоски здоровья игроков команды
    if (phase === 'round' && socket) {
      Object.keys(others).forEach(function (id) {
        var o = others[id];
        if (adv.hp[id] !== undefined && advAlive(id)) drawHpBar(ctx, o.x, o.y - 20, o.w || 30, adv.hp[id] | 0, adv.max[id] || 100);
        if (swings[id] && swings[id].sword) drawSword(ctx, o.x, o.y, o.w || 30, o.h || 100, swings[id]);
      });
      var p = GAME.pl;
      if (p && advAlive(socket.id)) {
        drawHpBar(ctx, p.x, p.y - 20, p.w, adv.hp[socket.id] | 0, adv.max[socket.id] || 100);
        if (swings[socket.id] && swings[socket.id].sword) drawSword(ctx, p.x, p.y, p.w, p.h, swings[socket.id]);
      }
    }
  }
  function drawSword(ctx, x, y, w, h, sw) {
    var age = Date.now() - sw.t;
    if (age > 200) return;
    var k = age / 200, a = (-1.2 + 2.2 * k) * sw.dir, px = sw.dir > 0 ? x + w - 4 : x + 4, py = y + h * 0.42;
    ctx.save(); ctx.translate(px, py); ctx.rotate(a);
    ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sw.dir * 70, 0); ctx.stroke();
    ctx.strokeStyle = '#78350f'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sw.dir * 12, 0); ctx.stroke();
    ctx.restore();
  }

  /* --- панели --- */
  function renderAdvHud() {
    var bar = $('gAdv');
    if (!bar) return;
    if (!advOn() || !socket) { bar.style.display = 'none'; return; }
    bar.style.display = '';
    var c = myCls(), hp = adv.hp[socket.id] | 0, max = adv.max[socket.id] || ADV_CLS[c].hp;
    var html = '<span class="wHp"><i style="width:' + Math.round(100 * Math.max(0, hp) / max) + '%"></i><em>'
      + esc(TR('hpLbl', 'Здоровье')) + ' ' + Math.max(0, hp) + '</em></span>'
      + '<span class="advCls">' + esc(clsName(c)) + '</span>'
      + '<span class="wTok">' + esc(TR('warKillsLbl', 'Нокауты')) + ': <b>' + (adv.kills[socket.id] | 0) + '</b></span>';
    if (c === 'mage') {
      var left = Math.max(0, ADV_HEAL_CD - (Date.now() - advHealAt));
      html += '<button class="wShop" id="gAdvHeal"' + (left ? ' disabled' : '') + '>' + esc(TR('advHealBtn', 'Лечение')) + ' <small class="wKey">Q</small>'
        + (left ? ' ' + Math.ceil(left / 1000) : '') + '</button>';
    }
    bar.innerHTML = html;
    var atk = $('gAtk');
    if (atk) atk.style.display = '';
  }
  function renderAdvTop() {
    var box = $('gTeamBox');
    if (!box || !advOn()) return;
    box.style.display = '';
    var alive = Object.keys(adv.en).length;
    box.innerHTML = adv.v === 'quest'
      ? esc(TR('advFloorLbl', 'Этаж')) + ' <b>' + adv.floor + '/' + adv.floors + '</b> · ' + esc(TR('advEnemiesLbl', 'Враги')) + ': <b>' + alive + '</b>'
      : esc(TR('advWaveLbl', 'Волна')) + ' <b>' + Math.max(1, adv.wave) + '/' + adv.waves + '</b> · ' + esc(TR('advCoreLbl', 'Кристалл'))
        + ': <b style="color:#7c3aed">' + (adv.core ? adv.core.hp + '/' + adv.core.max : '—') + '</b>';
  }
  // лобби приключения: выбор класса и состав команды
  function renderAdvPick() {
    var box = $('gAdvPick');
    if (!box) return;
    if (MODE !== 'hideAndSeek' || hsFixed !== 'adventure' || phase !== 'lobby' || !socket) { box.style.display = 'none'; return; }
    box.style.display = '';
    var mine = myCls(), count = {};
    Object.keys(advCls).forEach(function (id) { if (id === socket.id || others[id]) count[advCls[id]] = (count[advCls[id]] || 0) + 1; });
    box.innerHTML = '<div class="apHead">' + esc(TR('advPickTitle', 'Выбери класс')) + '</div><div class="apRow">'
      + Object.keys(ADV_CLS).map(function (c) {
        var C = ADV_CLS[c];
        return '<button class="apCls' + (c === mine ? ' on' : '') + '" data-c="' + c + '"><b>' + esc(clsName(c)) + '</b><span>'
          + esc(TR(C.dKey, C.dRu)) + '</span><small>' + esc(TR('hpLbl', 'Здоровье')) + ' ' + C.hp + (count[c] ? ' · ×' + count[c] : '') + '</small></button>';
      }).join('') + '</div>';
  }

  /* --- музыка босса: синтезированный «дабстеп» (идея 2019 года), только со включённым звуком --- */
  var dub = null;
  function dubStart() {
    if (dub || !window.BFSound || !BFSound.isOn || !BFSound.isOn()) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext, ac = new AC();
      var out = ac.createGain(); out.gain.value = 0.09; out.connect(ac.destination);
      var bass = ac.createOscillator(); bass.type = 'sawtooth'; bass.frequency.value = 55;
      var filt = ac.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 400; filt.Q.value = 8;
      var lfo = ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 140 / 60 * 2;      // «вобл» — восьмыми при 140 bpm
      var lfoAmp = ac.createGain(); lfoAmp.gain.value = 700;
      lfo.connect(lfoAmp); lfoAmp.connect(filt.frequency);
      bass.connect(filt); filt.connect(out);
      bass.start(); lfo.start();
      var notes = [55, 55, 49, 41.2], bar = 0, beat = 0;
      var t = setInterval(function () {
        // бочка на каждую долю, раз в такт — следующая нота баса
        var kick = ac.createOscillator(), kg = ac.createGain(), now = ac.currentTime;
        kick.frequency.setValueAtTime(140, now); kick.frequency.exponentialRampToValueAtTime(40, now + 0.12);
        kg.gain.setValueAtTime(0.9, now); kg.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        kick.connect(kg); kg.connect(out); kick.start(now); kick.stop(now + 0.22);
        if (++beat % 4 === 0) { bar++; bass.frequency.setValueAtTime(notes[bar % notes.length], now); lfo.frequency.setValueAtTime(bar % 2 ? 140 / 60 * 3 : 140 / 60 * 2, now); }
      }, 60000 / 140);
      dub = { ac: ac, t: t };
    } catch (e) { dub = null; }
  }
  function dubStop() {
    if (!dub) return;
    clearInterval(dub.t);
    try { dub.ac.close(); } catch (e) {}
    dub = null;
  }
  function advBossCheck() {
    var boss = adv && Object.keys(adv.en).some(function (id) { return adv.en[id].k === 'boss'; });
    if (boss && advOn()) dubStart(); else dubStop();
  }

  function bindAdv() {
    socket.on('advEn', function (d) {
      if (!d || !adv) return;
      var seen = {};
      (d.list || []).forEach(function (a) { seen[a[0]] = 1; advPutEnemy(a); });
      Object.keys(adv.en).forEach(function (id) { if (!seen[id]) delete adv.en[id]; });
      advBossCheck(); renderAdvTop();
    });
    socket.on('advEnHp', function (d) { if (d && adv && adv.en[d.e]) { adv.en[d.e].hp = d.hp; adv.en[d.e].hitAt = Date.now(); } });
    socket.on('advDie', function (d) {
      if (!d || !adv) return;
      var e = adv.en[d.e];
      if (e) advFx.push({ t: Date.now(), x: e.x, y: e.y, k: 'die' });
      delete adv.en[d.e];
      if (d.by) adv.kills[d.by] = (adv.kills[d.by] | 0) + 1;
      if (d.k === 'boss') log(TR('advBossDown', '{n} победил босса!').replace('{n}', '<b>' + esc(d.name || '') + '</b>'));
      renderAdvHud(); renderAdvTop(); advBossCheck();
    });
    socket.on('advAtk', function (d) { if (d && adv && adv.en[d.e]) adv.en[d.e].atkAt = Date.now(); });
    socket.on('advHp', function (d) {
      if (!d || !adv) return;
      adv.hp[d.id] = d.hp | 0;
      if (d.max) adv.max[d.id] = d.max;
      if (socket && d.id === socket.id) {
        if ((d.kx || d.ky) && GAME.knock) GAME.knock(d.kx, d.ky);
        if (!d.heal && window.BFSound && BFSound.death) BFSound.death();
        renderAdvHud();
      }
    });
    socket.on('advDown', function (d) {
      if (!d || !adv) return;
      if (adv.down.indexOf(d.id) === -1) adv.down.push(d.id);
      adv.hp[d.id] = 0;
      if (socket && d.id === socket.id) log(TR('advDownMe', 'Тебя выбили — вернёшься через {n} с.').replace('{n}', String(Math.round((d.ms || 5000) / 1000))));
      else log(TR('advDownOther', '{n} выбит').replace('{n}', '<b>' + esc(d.name || '') + '</b>'));
      advSyncMe(); renderAdvHud();
    });
    socket.on('advUp', function (d) {
      if (!d || !adv) return;
      adv.down = adv.down.filter(function (id) { return id !== d.id; });
      adv.hp[d.id] = d.hp | 0;
      if (socket && d.id === socket.id) {
        if (d.at && GAME.teleportTo) GAME.teleportTo(d.at.x, d.at.y);
        advSyncMe();
      }
      renderAdvHud();
    });
    socket.on('advGate', function (d) {
      if (!d || !adv) return;
      if (d.gate && adv.gates.indexOf(d.gate) === -1) adv.gates.push(d.gate);
      adv.floor = d.floor | 0;
      advSyncGates();
      log(TR('advGateOpen', 'Этаж зачищен! Люк наверх открыт — этаж {n} из {of}.').replace('{n}', d.floor).replace('{of}', d.of));
      if (window.BFSound && BFSound.win) BFSound.win();
      renderAdvTop();
    });
    socket.on('advWave', function (d) {
      if (!d || !adv) return;
      adv.wave = d.n | 0;
      log(TR('advWaveStart', 'Волна {n} из {of}!').replace('{n}', d.n).replace('{of}', d.of));
      renderAdvTop();
    });
    socket.on('advWaveClear', function (d) {
      if (d) log(TR('advWaveClear', 'Волна отбита! Следующая через {s} с.').replace('{s}', String(Math.round((d.ms || 6000) / 1000))));
    });
    socket.on('advCore', function (d) {
      if (!d || !adv || !adv.core) return;
      adv.core.hp = d.hp | 0;
      if (d.e && adv.en[d.e]) delete adv.en[d.e];
      renderAdvTop();
    });
    socket.on('advSlam', function (d) {
      if (!d || !adv) return;
      var e = adv.en[d.e];
      advSlam = { x: d.x, y: e ? e.ty : 0, r: d.r || 320, until: Date.now() + (d.ms || 800) };
      if (!advSlamTold) { advSlamTold = true; log(TR('advSlam', 'Босс бьёт о землю — подпрыгни!')); }
    });
    socket.on('advBossCall', function () { log(TR('advBossCall', 'Босс зовёт на помощь скелетов!')); });
    socket.on('advHeal', function (d) {
      if (!d) return;
      var o = socket && d.id === socket.id ? GAME.pl : others[d.id];
      if (o) advFx.push({ t: Date.now(), x: o.x + (o.w || 30) / 2, y: o.y + (o.h || 100) / 2, k: 'heal', r: d.r || 280 });
    });
    socket.on('advShot', function (d) {
      if (!d || !adv || !ADV_WPN[d.w]) return;
      advShots.push({ own: false, w: d.w, x: +d.x || 0, y: +d.y || 0, vx: +d.vx || 0, vy: +d.vy || 0, born: Date.now() });
    });
    socket.on('advEnd', function (d) { dubStop(); });
    socket.on('advClass', function (d) {
      if (!d || !ADV_CLS[d.c]) return;
      advCls[d.id] = d.c;
      renderAdvPick();
    });
  }
  function bindAdvUi() {
    $('gAdvPick').addEventListener('click', function (e) {
      var b = e.target.closest('.apCls');
      if (!b || !socket) return;
      advCls[socket.id] = b.dataset.c;          // сразу видно выбранным; сервер подтвердит всем
      socket.emit('advClass', { c: b.dataset.c });
      renderAdvPick();
    });
    $('gAdv').addEventListener('click', function (e) { if (e.target.closest('#gAdvHeal')) advHealCast(); });
    setInterval(function () { if (advOn() && myCls() === 'mage') renderAdvHud(); }, 500);
  }

  // ---------- отрисовка чужих игроков ----------
  GAME.onDraw = function (ctx) {
    syncMyOutfit();
    /* Правила видимости пряток в лобби завязаны на рулетку:

       пока она крутится — видно ВСЕХ. Это единственный момент, когда
       комната видит друг друга целиком: раньше здесь не рисовали никого,
       и лобби выглядело пустым полем до самого начала охоты.

       как только выпал искатель — не видно НИКОГО до конца лобби. Это и
       есть время прятаться: никто не подсматривает, кто куда побежал, —
       ни искатель за прячущимися, ни прячущиеся друг за другом.

       После начала раунда (охота) видно всех. */
    var hsWait = MODE === 'hideAndSeek' && !VIEW && phase === 'lobby';
    // hsWinnerId появляется ровно в тот миг, когда лента рулетки
    // останавливается (см. applySeeker в runRoulette), — по нему и делим
    // лобби на «крутится» и «прячемся»
    var hsHiding = hsWait && !!hsWinnerId;
    var rt = nowMs() - interp;      // рисуем чуть в прошлом — там есть оба кадра
    Object.keys(others).forEach(function (id) {
      var o = others[id];
      var s = sample(o, rt);
      if (s) { o.x = s.x; o.y = s.y; }
      else { o.x += (o.tx - o.x) * 0.3; o.y += (o.ty - o.y) * 0.3; }
      if (hsHiding) return;                      // искатель выбран — прячемся, никого не видно
      /* Укрытие прячет только на время пряток. После начала раунда
         видно всех — иначе искателю некого искать: сидящих в укрытиях
         не было видно вообще весь раунд. */
      if (o.hid && hsWait) return;
      if (o.hid && MODE !== 'hideAndSeek') return;
      if (boostOn(id, 'invis')) return;            // невидимость из магазина
      var w = o.w || 22, h = o.h || 74;
      ctx.save();
      ctx.translate(o.x, o.y);
      if (war && phase === 'round' && !warAlive(id)) ctx.globalAlpha = 0.25;   // выбит — бледный, пока не вернётся
      if (adv && phase === 'round' && adv.hp[id] !== undefined && !advAlive(id)) ctx.globalAlpha = 0.25;
      // заражён в apoc-раунде — выглядит зомби, а не обычной фигуркой
      // (см. hsApocRound/hsSeekerIds — тот же набор, что красит полосу под ником)
      var fit = outfitFor(id);
      if (hsApocRound && hsSeekerIds[id] && GAME.figureZombie) GAME.figureZombie(w, h);
      else if (fit && GAME.figureOutfit) GAME.figureOutfit(fit.kind, w, h, fit.arg);   // наряд роли варианта
      else GAME.figure(w, h, o.color || COLOR_NORMAL, true, o.skin || null);
      ctx.restore();
      drawTag(ctx, o.name || '', hideChatPref ? '' : o.say, o.x + w / 2, o.y, (o.h || 74));
    });
    drawTeamObjects(ctx);
    drawWar(ctx);
    drawAdv(ctx);
    drawRadar(ctx);
    var p = GAME.pl;
    if (GAME.playing && me.name) {
      // свой ник в укрытии показываем бледным — напоминание, что тебя не видно
      ctx.save();
      if (GAME.hidden) ctx.globalAlpha = 0.35;
      drawTag(ctx, me.name, typing, p.x + p.w / 2, p.y, p.h);
      ctx.restore();
    }

    // линии от игроков — гаснут через DRAW_FADE, старые просто выкидываем
    var now = Date.now();
    lines = lines.filter(function (ln) { return now - ln.born < DRAW_FADE; });
    if (curLine && curLine.points.length > 1) drawLineStroke(ctx, curLine.points, 1);
    lines.forEach(function (ln) {
      drawLineStroke(ctx, ln.points, Math.max(0, 1 - (now - ln.born) / DRAW_FADE));
    });
  };
  // прямая стрелка: хвост points[0] -> остриё points[1], наконечник —
  // треугольник фиксированного (в мировых координатах) размера на конце
  function drawLineStroke(ctx, points, alpha) {
    var a = points[0], b = points[points.length - 1];
    var s = GAME.view.s || 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#ef4444';
    ctx.fillStyle = '#ef4444';
    ctx.lineWidth = 4 / s;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    var ang = Math.atan2(b.y - a.y, b.x - a.x);
    var headLen = 16 / s, headAngle = Math.PI / 7;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - headLen * Math.cos(ang - headAngle), b.y - headLen * Math.sin(ang - headAngle));
    ctx.lineTo(b.x - headLen * Math.cos(ang + headAngle), b.y - headLen * Math.sin(ang + headAngle));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

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

  /* Реплика с серой обводкой (см. inkText). Своего цвета нет — белая, как ник по умолчанию: на серой
     обводке белый читается на любом фоне. Раньше тут был тёмно-серый #3a3a3a, а у набираемого
     текста — #6b7280, ровно цвет обводки, и буквы сливались в серую полосу. */
  function paintSay(ctx, t, x, y, tk, color) {
    inkText(ctx, t, x, y, tk, color || '#ffffff');
  }

  /* Роль раньше показывала короткая полоса прямо под ником (синяя —
     искатель/зомби, оранжевая — пойман и вышел из игры в классике) —
     убрана по прямой просьбе: саму роль теперь и так видно по модели
     целиком (цвет фигуры в классике, см. applyColor; модель зомби в
     apoc, см. figureZombie/meIsZombie) — полоса стала лишним дублем,
     вдобавок бессмысленно синей поверх уже зелёной модели зомби. */
  function drawTag(ctx, name, say, cx, topY, h) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.direction = 'ltr';               // чужие bidi-символы не переворачивают строку
    // на сенсорных экранах текст — постоянного экранного размера, независимо от зума
    var touch = document.documentElement.classList.contains('is-touch');
    var tk = touch ? 1 / Math.max(0.25, (GAME && GAME.viewScale) || 1) : 1;

    ctx.font = (15 * tk) + 'px sans-serif';
    // имя — под игроком: белое, а у купившего цвет ника — этим цветом (цвет реплик на ник не влияет)
    var tagColor = nickColors[name] || '';
    var nameY = topY + h + 17 * tk;
    var clan = clanTags[name];
    var nameX = cx;
    if (clan) {
      // «[ТЕГ] ник» одной строкой по центру: тег цветом клана, ник — как обычно
      var tagText = '[' + clan.tag + '] ';
      var wTag = ctx.measureText(tagText).width, wName = ctx.measureText(name).width;
      var x0 = cx - (wTag + wName) / 2;
      ctx.textAlign = 'left';
      inkText(ctx, tagText, x0, nameY, tk, clan.color);
      nameX = x0 + wTag;
    }
    ctx.textAlign = clan ? 'left' : 'center';
    inkText(ctx, name, nameX, nameY, tk, tagColor || '#ffffff');
    ctx.textAlign = 'center';

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
        /* Снимок позиции на момент первого показа: раньше реплика рисовалась
           по ЖИВОЙ позиции игрока каждый кадр и ездила вместе с ним, пока он
           бежал дальше. Теперь — приклеена к месту, где была сказана: один
           раз запомнили (sp.x/sp.y), дальше игрок может уйти куда угодно,
           облачко никуда не едет, просто всплывает и тает на месте. */
        if (sp.x === undefined) { sp.x = cx; sp.y = topY; }
        var k = (now - sp.born) / SAY_FADE;        // 0 → 1
        // каждая следующая реплика висит ниже предыдущей и не наезжает
        var lift = (list.length - 1 - si) * 15 * tk;
        /* Растворение занимает последние полсекунды жизни, а не четверть
           срока: так оно одинаково плавное и у состаренных досрочно реплик. */
        var outFrom = 1 - SAY_OUT / SAY_FADE;
        ctx.globalAlpha = k < outFrom ? 1 : Math.max(0, 1 - (k - outFrom) / (1 - outFrom));
        ctx.font = (15 * tk) + 'px sans-serif';
        var lines = wrapSay(sp.text, touch ? 24 : 34);
        for (var li = 0; li < lines.length; li++) {
          // SAY_GAP — облачко стоит отдельно над головой, а не сразу над
          // теменем; всплытие при растворении (k*46) добавляется поверх.
          var ly = sp.y - (SAY_GAP + (lines.length - 1 - li) * 16) * tk - lift - k * 46 * tk;
          paintSay(ctx, lines[li], sp.x, ly, tk, sp.color);
        }
      }
      ctx.globalAlpha = 1;
    }

    // то, что печатают прямо сейчас — ниже уплывающей реплики, чтобы не наложились
    if (say) {
      ctx.font = (15 * tk) + 'px sans-serif';
      paintSay(ctx, cleanSay(say), cx, topY - SAY_GAP * tk, tk, '#d1d5db');   // набираемое — светло-серым, чтобы отличалось от отправленного
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
  /* /mute и /unmute — локальные команды, никуда не отправляются: заглушённый
     игрок про это не узнаёт, остальные видят его сообщения как обычно. */
  function sendTyped() {
    var v = cleanSay(inp.value).trim();    // чистим от символов-переворотов ещё на отправке
    clearTyping();
    if (!v) return false;
    var mm = /^\/(mute|unmute)\s+(.+)$/i.exec(v);
    if (mm) {
      var name = mm[2].trim();
      if (mm[1].toLowerCase() === 'mute') {
        speak(me.name, muteName(name)
          ? TR('chatMutedYou', 'Заглушил {n}').replace('{n}', name)
          : TR('chatAlreadyMuted', '{n} уже заглушён у тебя').replace('{n}', name));
      } else {
        speak(me.name, unmuteName(name)
          ? TR('chatUnmutedYou', 'Снял заглушение с {n}').replace('{n}', name)
          : TR('chatNotMuted', '{n} и не был заглушён').replace('{n}', name));
      }
      return true;
    }
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
    /* Стрелки и WASD пропускаем дальше — ими игрок ходит прямо во время
       набора (см. movementKey() в физике). W/A/D при этом — буквы, и
       блокировать их вставку (как со стрелками, которые и так не
       печатаются) нельзя: первая же попытка написать «world» или «away»
       молча теряла бы w/a/d из слова. Пусть буква печатается как обычно
       И игрок при этом шагнёт — это гораздо безобиднее, чем портить
       обычный текст. */
    var move = e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' ||
               e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyD';
    if (!move) e.stopPropagation();
    /* Держать W/A/D — это ходьба, а не печать: ОС повторяет keydown
       десятки раз в секунду, пока клавиша зажата (e.repeat), и без этой
       проверки за пару секунд в черновик набивалась стена из одной и той
       же буквы под завязку maxlength — экран закрывало текстом, хотя сам
       игрок продолжал идти нормально. Один настоящий тап всё ещё
       печатается как обычно — блокируем только повторы. */
    if (e.repeat && (e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyD')) e.preventDefault();
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

  /* любая печатная клавиша начинает реплику — КРОМЕ W/A/D: это ходьба и
     прыжок (см. movementKey()/"KeyA"/"KeyD"/"KeyW" в физике), не буквы.
     Раньше первое же нажатие WASD само уводило фокус в чат — и, так как
     внутри чата буквы (в отличие от стрелок) намеренно уходят в текст, а
     не игроку, игрок на WASD-раскладке мгновенно и незаметно (поле шириной
     1px) терял управление насовсем, до первого Escape или клика мышью.
     Проверяем по e.code, а не e.key: на русской раскладке физическая W
     даёт e.key 'ц', а не 'w' — только code не зависит от раскладки. */
  document.addEventListener('keydown', function (e) {
    if (document.activeElement === inp) return;
    if (isTypingElsewhere()) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key.length !== 1) return;
    if (e.key === ' ') return;                  // пробел — прыжок
    if (e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyD') return;
    if (combatKey(e)) return;                  // F/J, Q, 1–4, B — бой и магазин, а не чат
    var pg = partyInput();                     // «Угадай слово»: печать — это догадка, а не реплика в чат
    if (pg) { pg.focus(); return; }
    inp.focus();
  });
  // война и магазин жетонов: клавиши
  function combatKey(e) {
    if (MODE !== 'hideAndSeek') return false;
    if (partyOn() && party.g === 'quiz' && /^Digit[1-4]$/.test(e.code)) return true;     // ответ викторины
    if (advOn() && /^(KeyF|KeyJ|KeyQ)$/.test(e.code)) return true;                        // приключение: удар и лечение
    if (e.code === 'KeyB') return shopOn;
    return !!war && /^(KeyF|KeyJ|KeyQ|Digit[1-4])$/.test(e.code);
  }
  document.addEventListener('keydown', function (e) {
    if (document.activeElement === inp || isTypingElsewhere() || e.ctrlKey || e.altKey || e.metaKey) return;
    if (!combatKey(e) || e.repeat && e.code === 'KeyB') return;
    e.preventDefault();
    if (partyOn() && party.g === 'quiz' && /^Digit[1-4]$/.test(e.code)) partyAnswer(+e.code.slice(5) - 1);
    else if (advOn()) { if (e.code === 'KeyQ') advHealCast(); else advAttack(); }
    else if (e.code === 'KeyB') toggleShop();
    else if (e.code === 'KeyF' || e.code === 'KeyJ') attack();
    else if (e.code === 'KeyQ') cycleWeapon();
    else pickWeapon(WPN_ORDER[+e.code.slice(5) - 1]);
  });
  $('gWar').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.w) pickWeapon(b.dataset.w);
    else if (b.id === 'gShopBtn') toggleShop();
  });
  $('gShop').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('shX')) toggleShop(false);
    else if (b.dataset.item && socket) socket.emit('shopBuy', { item: b.dataset.item });
  });
  // телефон: кнопка удара (касание не уходит в пад и не открывает чат)
  $('gAtk').addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); if (advOn()) advAttack(); else attack(); }, { passive: false });
  $('gAtk').addEventListener('click', function (e) { e.preventDefault(); if (advOn()) advAttack(); else attack(); });
  setInterval(tickWar, 100);
  bindPartyUi();
  bindAdvUi();
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
