/* Кнопки в игре на телефоне: где стоят и не наезжают ли друг на друга.
   Правый нижний угол — самый тесный: пэд управления, над ним чат, выше
   кнопки владельца (Edit и Admin Abuse). Messages живёт слева именно
   поэтому. */
'use strict';
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3210';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x === undefined ? '' : '  ' + x)); };

const SCREENS = [[430, 932, 'iPhone 430x932'], [390, 844, 'iPhone 390x844'], [360, 780, 'Android 360x780']];

/* Файлы владельца сервер отдаёт только ему, поэтому его кнопки
   подставляем сами — вместе с их собственными правилами из
   owner.js/adminAbuse.js. Проверяем раскладку, а не права. */
const FAKE_OWNER = () => {
  const st = document.createElement('style');
  st.textContent =
      '.ow-fab{position:fixed;right:18px;bottom:18px;z-index:9997;width:52px;height:52px;border-radius:50%;'
    + 'background:#111827;color:#fff;border:none}'
    + '@media (max-width:860px){body.play.mob .ow-fab{bottom:220px}}'
    + '#aaFab{position:fixed;right:14px;bottom:80px;z-index:10000;display:flex;align-items:center;'
    + 'padding:11px 16px;border-radius:999px;border:none;white-space:nowrap;background:#b91c1c;color:#fff;'
    + 'font:700 12.5px system-ui,sans-serif}'
    + '@media (max-width:860px){body.play.mob #aaFab{bottom:282px}}';
  document.head.appendChild(st);
  const f = document.createElement('button'); f.className = 'ow-fab'; f.textContent = 'Edit';
  document.body.appendChild(f);
  const a = document.createElement('button'); a.id = 'aaFab'; a.textContent = 'Admin Abuse';
  document.body.appendChild(a);
};

(async () => {
  const b = await chromium.launch();
  for (const [w, h, tag] of SCREENS) {
    const ip = '10.' + (1 + Math.floor(Math.random() * 250)) + '.' + (1 + Math.floor(Math.random() * 250)) + '.4';
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true,
      extraHTTPHeaders: { 'CF-Connecting-IP': ip } });
    const p = await ctx.newPage();
    const name = 'lay' + Math.floor(Math.random() * 1e6);
    await p.goto(BASE + '/', { waitUntil: 'networkidle' });
    await p.evaluate(() => { const c = document.getElementById('bfConsent'); if (c) c.remove(); });
    await p.evaluate(async n => {
      await fetch('/signUp', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n, password: 'Passw0rd!x' }), credentials: 'same-origin' });
    }, name);
    await p.goto(BASE + '/game.html?mode=race', { waitUntil: 'domcontentloaded' });
    await sleep(8000);
    await p.evaluate(FAKE_OWNER);
    await sleep(500);

    const r = await p.evaluate(() => {
      const out = {};
      const add = (k, el) => {
        if (!el) { out[k] = null; return; }
        const cs = getComputedStyle(el), bb = el.getBoundingClientRect();
        out[k] = (cs.display === 'none' || cs.visibility === 'hidden' || bb.width === 0) ? null
          : { x: Math.round(bb.x), y: Math.round(bb.y), w: Math.round(bb.width), h: Math.round(bb.height),
              right: Math.round(innerWidth - bb.right), left: Math.round(bb.x),
              bottom: Math.round(innerHeight - bb.bottom) };
      };
      add('gTalk', document.getElementById('gTalk'));
      add('gMsgsBtn', document.getElementById('gMsgsBtn'));
      add('owFab', document.querySelector('.ow-fab'));
      add('aaFab', document.getElementById('aaFab'));
      add('pad', document.getElementById('pad'));
      out.playing = document.body.classList.contains('play');
      return out;
    });

    /* Без карт режима в базе движок не стартует: нет ни класса play, ни
       пэда, и правила «в игре» не применяются. Это пустая база, а не
       сломанная раскладка — пропускаем экран. */
    if (!r.playing) {
      console.log('\n' + tag + ': игра не началась (карт этого режима в базе нет), пропускаем');
      await ctx.close();
      continue;
    }

    console.log('\n' + tag);
    for (const k of Object.keys(r)) {
      if (k === 'playing') continue;
      const v = r[k];
      console.log('  ' + k.padEnd(10) + (v ? v.w + 'x' + v.h + '  слева ' + v.left + ', справа ' + v.right
        + ', снизу ' + v.bottom : 'нет'));
    }
    ok(!!r.gTalk && r.gTalk.right < r.gTalk.left, 'чат в правом нижнем углу',
       r.gTalk ? 'справа ' + r.gTalk.right : '—');
    ok(!!r.gMsgsBtn && r.gMsgsBtn.left < r.gMsgsBtn.right, 'Messages в левом нижнем углу',
       r.gMsgsBtn ? 'слева ' + r.gMsgsBtn.left : '—');
    ok(!!r.pad && !!r.gTalk && r.gTalk.bottom >= r.pad.h, 'чат выше пэда управления',
       r.gTalk && r.pad ? r.gTalk.bottom + ' против ' + r.pad.h : '—');

    const boxes = Object.keys(r).filter(k => r[k] && k !== 'pad' && k !== 'playing').map(k => [k, r[k]]);
    const hits = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i][1], c = boxes[j][1];
        if (!(a.x + a.w <= c.x || c.x + c.w <= a.x || a.y + a.h <= c.y || c.y + c.h <= a.y))
          hits.push(boxes[i][0] + '+' + boxes[j][0]);
      }
    ok(hits.length === 0, 'кнопки не наезжают друг на друга', hits.join(', '));
    await ctx.close();
  }
  await b.close();
  console.log('\nитог: ' + pass + ' ок, ' + fail + ' провалов');
  process.exit(fail ? 1 : 0);
})();
