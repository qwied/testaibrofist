/* ======= AIBROFIST — Admin Abuse =======
   Панель владельца. Сама ничего не рисует: она только отдаёт команды
   серверу, а показывает шоу общий файл abuseShow.js, который грузят все
   игроки. Поэтому погоду, летающее медиа и музыку видят все и везде.

   Файл отдаётся сервером ТОЛЬКО владельцу, а подключается из owner.js —
   в разметке страниц его тега нет вообще. Права на каждое действие
   сервер проверяет отдельно: кнопки здесь лишь удобная обёртка. */
(function () {
  'use strict';

  var panel = null, fab = null;

  function post(url, data) {
    var body = Object.keys(data || {}).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(data[k]);
    }).join('&');
    return fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body
    }).then(function (r) { return r.json(); });
  }

  /* Файл шлём как JSON, а не формой. В форме base64 приходится
     процентно кодировать, и сорокамегабайтное видео разбухает втрое —
     запрос отбивался лимитом, поэтому несколько файлов не проходили. */
  function postJSON(url, data) {
    return fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (r) { return r.json(); });
  }
  function say(t) {
    var m = document.getElementById('aaMsg');
    if (m) m.textContent = t;
  }
  function done(r, good) {
    if (r && r.status === 'success') { say(good); if (window.BFShow) BFShow.pull(); }
    else say((r && r.message) || 'Ошибка');
  }

  // по расширению или типу файла решаем, это видео, звук или картинка
  function kindOf(name, type) {
    if (/^video\//.test(type || '') || /\.(mp4|webm|mov|m4v|ogv)$/i.test(name)) return 'video';
    if (/^audio\//.test(type || '') || /\.(mp3|ogg|wav|m4a|flac)$/i.test(name)) return 'audio';
    return 'image';
  }

  var CSS = ''
    + '#aaFab{position:fixed;right:14px;bottom:14px;z-index:10000;display:flex;align-items:center;gap:7px;'
    + 'padding:11px 16px;border-radius:999px;border:none;'
    + 'background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;font:700 12.5px system-ui,sans-serif;'
    + 'letter-spacing:.3px;cursor:pointer;box-shadow:0 8px 22px rgba(185,28,28,.38);user-select:none;'
    + 'transition:transform .15s,box-shadow .15s}'
    + '#aaFab:hover{transform:translateY(-1px);box-shadow:0 10px 26px rgba(185,28,28,.46)}'
    + '#aaFab svg{width:16px;height:16px;flex:none}'
    + '#aaFab.on{border-radius:12px}'
    + '#aaPanel{position:fixed;right:14px;bottom:64px;z-index:10000;width:308px;max-width:calc(100vw - 28px);'
    + 'max-height:78vh;overflow:auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;'
    + 'display:none;box-shadow:0 16px 40px rgba(15,23,42,.28);font:13px system-ui,sans-serif;color:#0f172a}'
    + '#aaPanel.on{display:block}'
    + '#aaHead{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;'
    + 'padding:12px 14px;background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;'
    + 'border-radius:16px 16px 0 0}'
    + '#aaHead b{font-size:13px;letter-spacing:.3px}'
    + '#aaClose{width:24px;height:24px;border-radius:50%;border:none;background:rgba(255,255,255,.2);'
    + 'color:#fff;font:16px/1 system-ui,sans-serif;cursor:pointer;display:flex;align-items:center;'
    + 'justify-content:center;padding:0}'
    + '#aaClose:hover{background:rgba(255,255,255,.32)}'
    + '#aaBody{padding:12px 14px 14px}'
    + '.aaH{font-weight:700;font-size:11px;letter-spacing:.5px;text-transform:uppercase;'
    + 'color:#b91c1c;margin:14px 0 6px;padding-top:10px;border-top:1px solid #f1f5f9}'
    + '.aaH:first-child{margin-top:0;padding-top:0;border-top:none}'
    + '#aaPanel input,#aaPanel select{width:100%;box-sizing:border-box;padding:8px 9px;margin-bottom:6px;'
    + 'border:1px solid #e2e8f0;border-radius:9px;font:inherit;font-size:12.5px;background:#f8fafc;'
    + 'transition:border-color .15s}'
    + '#aaPanel input:focus,#aaPanel select:focus{outline:none;border-color:#b91c1c}'
    + '.aaRow{display:flex;gap:6px}.aaRow input{margin-bottom:0}'
    + '#aaPanel button{padding:7px 11px;border-radius:9px;border:1px solid #e2e8f0;background:#fff;'
    + 'font:inherit;font-size:12px;font-weight:600;cursor:pointer;margin:0 5px 5px 0;'
    + 'transition:border-color .15s,color .15s,background .15s}'
    + '#aaPanel button:hover{border-color:#b91c1c;color:#b91c1c}'
    + '#aaPanel button.go{background:#b91c1c;border-color:#b91c1c;color:#fff}'
    + '#aaPanel button.go:hover{background:#dc2626;border-color:#dc2626;color:#fff}'
    + '#aaPanel button.danger{color:#b91c1c}'
    + '#aaPanel button.danger:hover{background:#fef2f2}'
    + '#aaMsg{font-size:11.5px;color:#334155;min-height:15px;margin-top:6px;line-height:1.5;font-weight:600}'
    + '#aaNote{font-size:11px;color:#94a3b8;line-height:1.5;margin-top:8px}';

  function build() {
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    fab = document.createElement('div');
    fab.id = 'aaFab';
    fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
      + 'stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 3 7v6c0 5 4 8.5 9 9 5-.5 9-4 9-9V7z"/>'
      + '<path d="M9 12l2 2 4-4"/></svg><span>Admin Abuse</span>';
    document.body.appendChild(fab);

    panel = document.createElement('div');
    panel.id = 'aaPanel';
    panel.innerHTML =
        '<div id="aaHead"><b>Admin Abuse</b><button id="aaClose" type="button" aria-label="Закрыть">&times;</button></div>'
      + '<div id="aaBody">'
      + '<div class="aaH">Летающее медиа</div>'
      + '<input id="aaUrl" placeholder="ссылка на картинку, гифку или видео">'
      + '<input id="aaFile" type="file" multiple accept="image/*,video/*,audio/*">'
      + '<label style="display:block;font-size:12px;margin:2px 0 6px">'
      +   '<input id="aaSound" type="checkbox" checked style="width:auto;margin-right:6px">'
      +   'видео со звуком</label>'
      + '<div class="aaRow">'
      +   '<select id="aaDir">'
      +     '<option value="right">вправо</option><option value="left">влево</option>'
      +     '<option value="up">вверх</option><option value="down">вниз</option>'
      +   '</select>'
      +   '<input id="aaSpeed" type="number" value="4" min="1" max="40" title="скорость">'
      +   '<input id="aaSize" type="number" value="120" min="20" max="3000" title="размер, px">'
      + '</div>'
      + '<label style="display:block;font-size:12px;margin:2px 0 6px">'
      +   '<input id="aaFull" type="checkbox" style="width:auto;margin-right:6px">'
      +   'во весь экран</label>'
      + '<button class="go" id="aaGo">Запустить всем</button>'
      + '<button class="danger" id="aaClr">Убрать медиа</button>'

      + '<div class="aaH">Музыка</div>'
      + '<input id="aaSong" placeholder="ссылка на mp3">'
      + '<input id="aaVol" type="range" min="0" max="1" step="0.05" value="0.7">'
      + '<button class="go" id="aaSongGo">Играть всем</button>'
      + '<button id="aaSongStop">Стоп</button>'

      + '<div class="aaH">Погода и эффекты</div>'
      + '<div class="aaRow">'
      +   '<input id="aaSecs" type="number" value="0" min="0" max="3600" '
      +     'title="сколько секунд держать, 0 — до выключения вручную">'
      +   '<input id="aaCount" type="number" value="1" min="1" max="300" '
      +     'title="сколько штук: взрывов или монет">'
      + '</div>'
      + '<div id="aaW">'
      +   '<button data-w="rain">Дождь</button><button data-w="hail">Град</button>'
      +   '<button data-w="snow">Снег</button><button data-w="sun">Солнце</button>'
      +   '<button data-w="nuke">Взрывы</button><button data-w="coins">Монеты</button>'
      +   '<button data-w="none">Выключить</button>'
      + '</div>'
      + '<label style="display:block;font-size:12px;margin:4px 0 6px">'
      +   '<input id="aaReward" type="checkbox" style="width:auto;margin-right:6px">'
      +   'за пойманные монеты давать настоящие</label>'
      + '<div id="aaNote2" style="font-size:11px;color:#94a3b8;line-height:1.5;margin-top:2px">'
      +   'Секунды — для дождя, града, снега и солнца. Количество — для взрывов и монет: '
      +   'они летят пачкой и гаснут сами. Монеты игроки ловят пальцем; если галочка '
      +   'снята, это просто украшение.</div>'

      + '<div class="aaH">Таймер до обновления</div>'
      + '<div class="aaRow">'
      +   '<input id="aaHrs" type="number" value="3" min="0" max="999" title="часы">'
      +   '<input id="aaMin" type="number" value="0" min="0" max="59" title="минуты">'
      +   '<input id="aaSec" type="number" value="0" min="0" max="59" title="секунды">'
      + '</div>'
      + '<button class="go" id="aaTimeGo">Запустить таймер до обновления</button>'
      + '<button id="aaTimeOff">Убрать таймер</button>'

      + '<div class="aaH">Разное</div>'
      + '<button class="danger" id="aaAll">Убрать всё шоу</button>'
      + '<div id="aaMsg"></div>'
      + '<div id="aaNote">Всё, что тут включено, видят все игроки на всех '
      +   'страницах. Обновляется у них в течение трёх секунд. Файлов за раз — '
      +   'сколько выберешь, в полёте держится до тридцати.</div>'
      + '</div>';
    document.body.appendChild(panel);

    function togglePanel(on) {
      var next = typeof on === 'boolean' ? on : !panel.classList.contains('on');
      panel.classList.toggle('on', next);
      fab.classList.toggle('on', next);
    }
    fab.onclick = function () { togglePanel(); };
    document.getElementById('aaClose').onclick = function () { togglePanel(false); };

    function opts() {
      return {
        dir: document.getElementById('aaDir').value,
        v: document.getElementById('aaSpeed').value,
        s: document.getElementById('aaSize').value,
        full: document.getElementById('aaFull').checked,
        sound: document.getElementById('aaSound').checked
      };
    }
    function send(url, kind) {
      var o = opts();
      if (kind === 'audio')
        return post('/abuse/set', { what: 'song', url: url,
                                    vol: document.getElementById('aaVol').value })
               .then(function (r) { done(r, 'Играет у всех'); });
      return post('/abuse/set', { what: 'media', url: url, kind: kind,
                                  dir: o.dir, v: o.v, s: o.s,
                                  full: o.full, sound: o.sound })
             .then(function (r) { done(r, 'Запущено у всех: ' + (r.count || '')); });
    }

    document.getElementById('aaGo').onclick = function () {
      var url = document.getElementById('aaUrl').value.trim();
      if (!url) { say('Дай ссылку или выбери файл'); return; }
      send(url, kindOf(url, ''));
    };

    /* Файл с устройства уходит на сервер, иначе его увидишь только ты:
       у чужого браузера ссылки на твой файл нет. */
    document.getElementById('aaFile').onchange = function () {
      var list = this.files || [], i = 0, okCount = 0, total = list.length;
      var self = this;
      if (!total) return;
      say('Загружаю 0 из ' + total + '…');
      /* Файлы идут по очереди, а не разом: десяток видео одновременно
         забьёт и канал, и память телефона. */
      function next() {
        if (i >= total) {
          self.value = '';
          say('Загружено ' + okCount + ' из ' + total);
          return;
        }
        var f = list[i++], kind = kindOf(f.name, f.type);
        var fr = new FileReader();
        fr.onload = function () {
          postJSON('/abuse/upload', { data: fr.result }).then(function (r) {
            if (r.status !== 'success') {
              say(f.name + ': ' + (r.message || 'не загрузилось'));
              next();               // остальные всё равно грузим
              return;
            }
            okCount++;
            say('Загружаю ' + okCount + ' из ' + total + '…');
            send(r.url, kind).then(next);
          }).catch(function () { say(f.name + ': сервер не ответил'); next(); });
        };
        fr.onerror = function () { say(f.name + ': файл не прочитался'); next(); };
        fr.readAsDataURL(f);
      }
      next();
    };

    document.getElementById('aaClr').onclick = function () {
      post('/abuse/set', { what: 'mediaClear' }).then(function (r) { done(r, 'Медиа убрано у всех'); });
    };

    document.getElementById('aaSongGo').onclick = function () {
      post('/abuse/set', { what: 'song',
                           url: document.getElementById('aaSong').value.trim(),
                           vol: document.getElementById('aaVol').value })
        .then(function (r) { done(r, 'Играет у всех'); });
    };
    document.getElementById('aaSongStop').onclick = function () {
      post('/abuse/set', { what: 'song', url: '' }).then(function (r) { done(r, 'Тишина'); });
    };

    document.getElementById('aaW').onclick = function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      post('/abuse/set', {
        what: 'weather', weather: b.dataset.w,
        secs: document.getElementById('aaSecs').value,
        count: document.getElementById('aaCount').value,
        reward: document.getElementById('aaReward').checked
      }).then(function (r) { done(r, 'У всех: ' + b.textContent); });
    };



    document.getElementById('aaTimeGo').onclick = function () {
      var h = parseInt(document.getElementById('aaHrs').value, 10) || 0;
      var m = parseInt(document.getElementById('aaMin').value, 10) || 0;
      var sc = parseInt(document.getElementById('aaSec').value, 10) || 0;
      post('/update/set', { seconds: h * 3600 + m * 60 + sc }).then(function (r) {
        say(r.status === 'success' ? 'Таймер поставлен' : (r.message || 'Ошибка'));
        if (window.BFUpdate) BFUpdate.refresh();
      });
    };
    document.getElementById('aaTimeOff').onclick = function () {
      post('/update/set', { seconds: 0 }).then(function () {
        say('Таймер убран');
        if (window.BFUpdate) BFUpdate.refresh();
      });
    };

    document.getElementById('aaAll').onclick = function () {
      post('/abuse/set', { what: 'clear' }).then(function (r) { done(r, 'Шоу выключено у всех'); });
    };
  }

  /* Проверять права здесь незачем: сервер отдаёт этот файл только
     владельцу. Права на действия он проверяет отдельно, на каждый запрос. */
  window.BFAdminAbuse = true;     // редактор по этому флагу снимает лимит монет
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', build);
  else build();
})();
