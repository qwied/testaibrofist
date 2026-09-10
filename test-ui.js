/* Прогон интерфейса редактора на самодельном DOM.
   Настоящего браузера здесь нет, поэтому поднимаем минимальный DOM
   с canvas-заглушкой, грузим весь inline-скрипт редактора и жмём кнопки —
   включая касания на телефоне. Если хоть один обработчик упадёт, будет видно. */
const fs = require('fs');

const listeners = new Map();
const byId = {};
const all = [];

function mkEl(tag) {
  const el = {
    tagName: String(tag).toUpperCase(),
    style: new Proxy({}, { get: (t, k) => t[k] || '', set: (t, k, v) => (t[k] = v, true) }),
    dataset: {}, children: [], attrs: {}, _text: '',
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, on) { on === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (on ? this._s.add(c) : this._s.delete(c)); },
      contains(c) { return this._s.has(c); }
    },
    get className() { return [...this.classList._s].join(' '); },
    set className(v) { this.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); },
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); },
    get innerHTML() { return this._text; },
    set innerHTML(v) { this._text = String(v); this.children = []; },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    append(...c) { c.forEach(x => this.appendChild(x)); },
    insertBefore(c) { this.children.unshift(c); return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); },
    remove() {},
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = v; },
    getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
    removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(t, fn) {
      if (!listeners.has(this)) listeners.set(this, {});
      (listeners.get(this)[t] = listeners.get(this)[t] || []).push(fn);
    },
    removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 900, height: 600 }; },
    closest(sel) {
      const cls = sel.replace(/^\./, '');
      let n = this;
      while (n) { if (n.classList && n.classList.contains(cls)) return n; n = n.parentNode; }
      return null;
    },
    // разметку внутри элементов харнесс не строит целиком,
    // поэтому отдаём заглушку — важно, что цепочка вызовов не падает
    querySelector(sel) {
      this._stubs = this._stubs || {};
      if (!this._stubs[sel]) { const e = mkEl('div'); all.push(e); this._stubs[sel] = e; }
      return this._stubs[sel];
    },
    querySelectorAll() { return []; },
    focus() {}, select() {}, blur() {}, click() { fire(this, 'click', {}); },
    getContext() { return ctx2d; },
    width: 900, height: 600, value: '', checked: false, files: []
  };
  // элементы, созданные скриптом, тоже должны находиться по id
  let _id = '';
  Object.defineProperty(el, 'id', {
    get() { return _id; },
    set(v) { _id = String(v); byId[_id] = el; },
    configurable: true
  });
  return el;
}

// canvas-контекст: считает вызовы, ничего не рисует
const ctx2d = new Proxy({}, {
  get(t, k) {
    if (k === 'canvas') return { width: 900, height: 600 };
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient')
      return () => ({ addColorStop() {} });
    if (typeof t[k] === 'undefined') return () => {};
    return t[k];
  },
  set(t, k, v) { t[k] = v; return true; }
});

function fire(el, type, ev) {
  const ls = (listeners.get(el) || {})[type] || [];
  const e = Object.assign({
    target: el, currentTarget: el, preventDefault() {}, stopPropagation() {},
    button: 0, offsetX: 100, offsetY: 100, clientX: 100, clientY: 100,
    touches: [], key: '', code: '', deltaY: 0
  }, ev);
  ls.forEach(fn => fn.call(el, e));
  return ls.length;
}

const doc = {
  readyState: 'complete',
  documentElement: mkEl('html'),
  head: mkEl('head'),
  body: mkEl('body'),
  createElement(t) { const e = mkEl(t); all.push(e); return e; },
  createElementNS(_, t) { return this.createElement(t); },
  createTextNode(t) { const e = mkEl('#text'); e._text = t; return e; },
  createTreeWalker() { return { nextNode: () => null }; },
  getElementById(id) { return byId[id] || null; },
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
  querySelectorAll(sel) {
    if (sel.startsWith('.')) {
      const c = sel.slice(1).split('[')[0];
      return all.filter(e => e.classList.contains(c));
    }
    const m = sel.match(/\[data-tool="([^"]+)"\]/);
    if (m) return all.filter(e => e.dataset.tool === m[1]);
    return [];
  },
  addEventListener(t, fn) { doc._l = doc._l || {}; (doc._l[t] = doc._l[t] || []).push(fn); },
  removeEventListener() {},
  activeElement: null
};
doc.documentElement.appendChild(doc.body);

// разбираем разметку страницы: нам нужны только элементы с id
function collectIds(html) {
  for (const m of html.matchAll(/<(\w+)([^>]*\sid="([\w-]+)")[^>]*>/g)) {
    const el = mkEl(m[1]);
    el.id = m[3];
    for (const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g)) {
      if (a[1].startsWith('data-')) el.dataset[a[1].slice(5).replace(/-(\w)/g, (x, c) => c.toUpperCase())] = a[2];
      else el.setAttribute(a[1], a[2]);
    }
    for (const c of (m[0].match(/class="([^"]*)"/) || [, ''])[1].split(/\s+/)) if (c) el.classList.add(c);
    byId[el.id] = el;
    all.push(el);
    doc.body.appendChild(el);
  }
}

const html = fs.readFileSync(__dirname+'/editor.html', 'utf8');
collectIds(html);

global.document = doc;
global.window = {
  addEventListener(t, fn) { global.window._l = global.window._l || {}; (global.window._l[t] = global.window._l[t] || []).push(fn); },
  removeEventListener() {}, matchMedia: () => ({ matches: false, addListener() {} }),
  innerWidth: 900, innerHeight: 600, devicePixelRatio: 1,
  requestAnimationFrame() { return 1; }, cancelAnimationFrame() {},
  location: { href: '', pathname: '/editor.html', search: '' },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  Image: function () { return { src: '', complete: false, naturalWidth: 0 }; },
  fetch: () => Promise.reject(new Error('offline')),
  navigator: { language: 'ru', languages: ['ru'] },
  Path2D: function () { this.rect = () => {}; this.arc = () => {}; this.moveTo = () => {}; }, TextDecoder: function () { this.decode = () => ''; }
};
const G = {
  addEventListener: global.window.addEventListener,
  requestAnimationFrame: global.window.requestAnimationFrame,
  localStorage: global.window.localStorage,
  matchMedia: global.window.matchMedia,
  innerWidth: 900, innerHeight: 600, devicePixelRatio: 1,
  Image: global.window.Image, Path2D: global.window.Path2D,
  fetch: global.window.fetch, navigator: global.window.navigator,
  location: global.window.location, alert: () => {}, prompt: () => null,
  confirm: () => true, FileReader: function () { this.readAsText = () => {}; },
  Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL() {} },
  CompressionStream: undefined, DecompressionStream: undefined,
  // socket.io на сервере подключается отдельным файлом — заглушаем
  io: () => ({ on() {}, emit() {}, connected: false }),
  URLSearchParams: global.URLSearchParams,
  BFSkinCanvas: undefined, BFSkin: undefined
};
for (const k of Object.keys(G)) {
  try { Object.defineProperty(global, k, { value: G[k], writable: true, configurable: true }); }
  catch (e) {}
}

const code = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).join('\n');

let bootError = null;
try {
  new Function(code)();
} catch (e) { bootError = e; }

console.log(bootError
  ? '✗ Редактор упал при загрузке: ' + bootError.message
  : '✓ Редактор загрузился без ошибок');
if (bootError) { console.log(bootError.stack.split('\n').slice(0, 4).join('\n')); process.exit(1); }

// ---- жмём каждую кнопку ----
const buttons = ['bSave', 'bOpen', 'bJson', 'bPlay', 'bUndo', 'bRedo',
                 'bCopy', 'bDel', 'bGrid', 'zIn', 'zOut', 'inspClose', 'dOk', 'dNo'];
// эти кнопки обрабатываются делегированием на родителе (в браузере — всплытие)
const DELEGATED = { inspClose: 'inspHead' };
let clicked = 0, failed = 0, missing = 0;
for (const id of buttons) {
  const el = byId[id];
  if (!el) { console.log(`  ? ${id}: нет на странице`); missing++; continue; }
  const host = DELEGATED[id] ? byId[DELEGATED[id]] : el;
  try {
    const n = fire(host, 'click', { target: el });
    if (n === 0) { console.log(`  ✗ ${id}: обработчик не назначен`); failed++; }
    else clicked++;
  } catch (e) { console.log(`  ✗ ${id}: ${e.message}`); failed++; }
}
console.log(`\nКнопки панелей: нажато ${clicked}, без обработчика ${failed}, отсутствует ${missing}`);

// ---- инструменты ----
const toolsEl = byId['tools'];
let tools = 0, toolFail = 0;
if (toolsEl) {
  for (const t of toolsEl.children) {
    try { fire(toolsEl, 'click', { target: t }); tools++; }
    catch (e) { console.log(`  ✗ инструмент ${t.dataset.tool}: ${e.message}`); toolFail++; }
  }
}
console.log(`Инструментов в палитре: ${tools}, ошибок ${toolFail}`);

// ---- режимы ----
const modesEl = byId['modes'];
let modes = 0;
if (modesEl) {
  for (const b of modesEl.children) {
    try { fire(modesEl, 'click', { target: b }); modes++; } catch (e) { console.log('  ✗ режим:', e.message); }
  }
}
console.log(`Кнопок режимов: ${modes}`);

// ---- касания по холсту: рисование и панорамирование ----
const cv = byId['c'];
let touchOk = 0;
try {
  fire(cv, 'touchstart', { touches: [{ clientX: 120, clientY: 140 }] }); touchOk++;
  fire(cv, 'touchmove', { touches: [{ clientX: 260, clientY: 210 }] }); touchOk++;
  fire(cv, 'touchend', { touches: [] }); touchOk++;
  fire(cv, 'mousedown', { button: 0, offsetX: 120, offsetY: 140 }); touchOk++;
  fire(cv, 'mousemove', { offsetX: 300, offsetY: 260 }); touchOk++;
  fire(cv, 'mousedown', { button: 2, offsetX: 120, offsetY: 140 }); touchOk++;
  fire(cv, 'wheel', { offsetX: 100, offsetY: 100, deltaY: -100 }); touchOk++;
  console.log(`Холст: касание, перетаскивание и колесо — ${touchOk}/7 событий прошли`);
} catch (e) {
  console.log('  ✗ холст:', e.message); failed++;
}

/* ---- физика вживую ----
   Строим маленькую сцену через мост GAME и крутим настоящий шаг физики:
   так проверяется не текст исходника, а поведение. */
const GAME = global.window && global.window.GAME;
let phys = 0, physFail = 0;
// harness жал все кнопки подряд, включая пад — снимаем зажатое управление
function clearKeys() {
  if (!GAME) return;
  GAME.keys.l = GAME.keys.r = GAME.keys.u = false;
  GAME.pl.vx = 0;
}
function check(name, cond) {
  if (cond) phys++;
  else { physFail++; console.log('  ✗', name); }
}
if (!GAME) { console.log('  ✗ мост GAME недоступен'); physFail++; }
else {
  const floor = { id: 1, type: 'rect', x: 0, y: 400, w: 600, h: 40, rot: 0, fill: '#111827' };
  const spawn = { id: 2, type: 'spawn', x: 60, y: 340, w: 20, h: 60, rot: 0, fill: '#111827' };

  // 1. падение и приземление на пол
  GAME.loadMap({ mode: 'hideAndSeek', objects: [floor, spawn] });
  GAME.startPlay();
  clearKeys();
  for (let i = 0; i < 120; i++) GAME.step();
  check('игрок встаёт на пол', GAME.pl.ground && Math.abs(GAME.pl.y + GAME.pl.h - 400) < 2);
  check('размер игрока 20x60', GAME.pl.w === 20 && GAME.pl.h === 60);

  // 8. рикошет: падение на отражающий блок отбрасывает вверх
  const rico = { id: 3, type: 'rect', x: 0, y: 400, w: 600, h: 40, rot: 0,
                 fill: '#a855f7', ricochet: true };
  GAME.loadMap({ mode: 'hideAndSeek', objects: [rico, spawn] });
  GAME.startPlay();
  clearKeys();
  GAME.pl.x = 300; GAME.pl.y = 200; GAME.pl.vy = 8;
  let bounced = false;
  for (let i = 0; i < 60; i++) { GAME.step(); if (GAME.pl.vy < -3) bounced = true; }
  check('рикошет отбрасывает вверх', bounced);

  // 7. по стене не забраться, но по ней сползают
  const wall = { id: 4, type: 'rect', x: 320, y: 100, w: 40, h: 300, rot: 0, fill: '#111827' };
  GAME.loadMap({ mode: 'hideAndSeek', objects: [floor, spawn, wall] });
  GAME.startPlay();
  clearKeys();
  GAME.pl.x = 296; GAME.pl.y = 150; GAME.pl.vy = 0;
  GAME.keys.r = true; GAME.keys.u = true;          // жмём в стену и вверх
  let topY = GAME.pl.y, freeFall = 0;
  for (let i = 0; i < 60; i++) { GAME.step(); if (GAME.pl.y < topY) topY = GAME.pl.y; }
  check('по стене не забраться', topY >= 149);
  const slideVY = GAME.pl.vy;
  clearKeys();
  // то же падение, но в стороне от стены — для сравнения скорости
  GAME.pl.x = 100; GAME.pl.y = 150; GAME.pl.vy = 0;
  for (let i = 0; i < 60; i++) { GAME.pl.y = 150; GAME.step(); freeFall = GAME.pl.vy; }
  check('у стены падение медленнее', slideVY < freeFall, slideVY.toFixed(2) + ' против ' + freeFall.toFixed(2));

  // 11. сила батута и наклонный отскок
  function bounceTop(power, rot) {
    // батут поднят над полом: иначе игрок гасит скорость о пол, а не о него
    const pad = { id: 3, type: 'rect', x: 200, y: 340, w: 200, h: 40, rot: rot || 0,
                  fill: '#a855f7', ricochet: true, power: power };
    GAME.loadMap({ mode: 'hideAndSeek', objects: [floor, spawn, pad] });
    GAME.startPlay();
    clearKeys();
    GAME.pl.x = 290; GAME.pl.y = 180; GAME.pl.vx = 0; GAME.pl.vy = 9;
    let best = 0, sideways = 0;
    for (let i = 0; i < 90; i++) {
      GAME.step();
      if (-GAME.pl.vy > best) best = -GAME.pl.vy;
      if (Math.abs(GAME.pl.vx) > sideways) sideways = Math.abs(GAME.pl.vx);
    }
    clearKeys();
    return { up: best, side: sideways };
  }
  const weak = bounceTop(0.5), strong = bounceTop(2.5);
  check('сила батута работает', strong.up > weak.up * 1.6,
        'слабый ' + weak.up.toFixed(1) + ', сильный ' + strong.up.toFixed(1));
  const tilted = bounceTop(1.6, 35);
  check('наклонный батут кидает вбок', tilted.side > 2, tilted.side.toFixed(1));

  // 12. вода удалена: старые карты с водой грузятся без неё, игрок падает нормально
  const poolFloor = { id: 5, type: 'rect', x: 0, y: 560, w: 600, h: 20, rot: 0, fill: '#111827' };
  const pool = { id: 6, type: 'water', x: 0, y: 420, w: 600, h: 140, rot: 0, fill: '#38bdf8' };
  GAME.loadMap({ mode: 'hideAndSeek', objects: [poolFloor, spawn, pool] });
  check('вода из старой карты выброшена', GAME.objects.length === 2,
        GAME.objects.map(o => o.type).join(','));
  GAME.startPlay();
  clearKeys();
  GAME.pl.x = 300; GAME.pl.y = 300; GAME.pl.vy = 6;
  let landed = false;
  for (let i = 0; i < 120; i++) { GAME.step(); if (GAME.pl.ground) landed = true; }
  check('где была вода — игрок свободно падает на пол', landed, GAME.pl.y.toFixed(0));

  // 13. угол стены: игрока сбоку от блока отталкивает вбок, а не телепортирует наверх
  //     именно эту дыру ловил пользователь: платформа прижала игрока к стене —
  //     и его выбросило на верх соседнего объекта. Теперь угол отталкивает вбок.
  const floorC = { id: 1, type: 'rect', x: 0, y: 400, w: 600, h: 40, rot: 0, fill: '#111827' };
  const wallC  = { id: 2, type: 'rect', x: 400, y: 100, w: 40, h: 300, rot: 0, fill: '#111827' };
  const spawnC = { id: 3, type: 'spawn', x: 395, y: 200, w: 20, h: 60, rot: 0, fill: '#111827' };
  GAME.loadMap({ mode: 'hideAndSeek', objects: [floorC, wallC, spawnC] });
  GAME.startPlay();
  clearKeys();
  // игрок заспавнен сбоку от стены, чуть внутри (15 px) — как после толчка платформой
  const yBeforeCorner = GAME.pl.y;
  GAME.step();
  // без фикса: pl.y стало бы 40 (телепорт на верх стены y=100)
  // с фиксом: pl.y остаётся ~200 (игрока оттолкнуло вбок)
  check('угол стены не телепортирует наверх', GAME.pl.y > 150,
        'pl.y=' + GAME.pl.y.toFixed(0) + ' (было ' + yBeforeCorner.toFixed(0) + ')');
  check('игрока оттолкнуло вбок от стены', GAME.pl.x + GAME.pl.w <= 400,
        'pl.x=' + GAME.pl.x.toFixed(0) + ' правый край=' + (GAME.pl.x + GAME.pl.w));
  GAME.stop();

  // 14. глубокий провал по-прежнему поднимает наверх — регресс на v95
  //     игрока, продавленного в середину широкого пола, нельзя выталкивать вбок:
  //     из блока шириной 600 это швыряло бы на 300 px. Его поднимает вертикальный проход.
  const floorD = { id: 1, type: 'rect', x: 0, y: 400, w: 600, h: 40, rot: 0, fill: '#111827' };
  const spawnD = { id: 2, type: 'spawn', x: 300, y: 380, w: 20, h: 60, rot: 0, fill: '#111827' };
  GAME.loadMap({ mode: 'hideAndSeek', objects: [floorD, spawnD] });
  GAME.startPlay();
  clearKeys();
  GAME.step();
  check('глубокий провал поднимает наверх', Math.abs(GAME.pl.y + GAME.pl.h - 400) < 5,
        'pl.y=' + GAME.pl.y.toFixed(0));
  GAME.stop();

  // 15. угол работает с обеих сторон: игрок зашёл справа — оттолкнёт вправо
  const wallE  = { id: 2, type: 'rect', x: 400, y: 100, w: 40, h: 300, rot: 0, fill: '#111827' };
  const spawnE = { id: 3, type: 'spawn', x: 425, y: 200, w: 20, h: 60, rot: 0, fill: '#111827' };
  GAME.loadMap({ mode: 'hideAndSeek', objects: [floorC, wallE, spawnE] });
  GAME.startPlay();
  clearKeys();
  GAME.step();
  check('угол с правой стороны отталкивает вправо', GAME.pl.x >= 440,
        'pl.x=' + GAME.pl.x.toFixed(0));
  check('и тоже не телепортирует наверх', GAME.pl.y > 150,
        'pl.y=' + GAME.pl.y.toFixed(0));
  GAME.stop();

  // 16. высота прыжка: значения зафиксированы, чтобы не уползали правками
  const floorJ = { id: 1, type: 'rect', x: 0, y: 400, w: 900, h: 40, rot: 0, fill: '#111827' };
  const spawnJ = { id: 2, type: 'spawn', x: 60, y: 340, w: 20, h: 60, rot: 0, fill: '#111827' };
  function jumpHeight(holdFrames) {
    GAME.loadMap({ mode: 'hideAndSeek', objects: [floorJ, spawnJ] });
    GAME.startPlay(); clearKeys();
    for (let i = 0; i < 60; i++) GAME.step();            // встали на пол
    const y0 = GAME.pl.y;
    GAME.keys.u = true;
    let top = y0;
    for (let i = 0; i < 200; i++) {
      if (i === holdFrames) GAME.keys.u = false;
      GAME.step();
      if (GAME.pl.y < top) top = GAME.pl.y;
    }
    GAME.stop();
    return y0 - top;
  }
  const tapH = jumpHeight(2), holdH = jumpHeight(60);
  check('тап поднимает на 121 px', Math.abs(tapH - 121) <= 2, tapH.toFixed(0));
  check('зажатый прыжок — 146 px', Math.abs(holdH - 146) <= 2, holdH.toFixed(0));
  check('зажатый выше тапа', holdH - tapH > 15, (holdH - tapH).toFixed(0));

  // 17. глубоко вдавленный в стену угол — тоже вбок, а не наверх
  //     ровно то, что оставалось после v96: платформа стыкуется с объектом
  //     вплотную и успевает вдавить игрока глубже старого порога в 32 px.
  const wideWall = { id: 2, type: 'rect', x: 400, y: 100, w: 100, h: 300, rot: 0, fill: '#111827' };
  const spawnG   = { id: 3, type: 'spawn', x: 425, y: 200, w: 20, h: 60, rot: 0, fill: '#111827' };
  GAME.loadMap({ mode: 'hideAndSeek', objects: [floorC, wideWall, spawnG] });
  GAME.startPlay();
  clearKeys();
  GAME.step();
  check('вдавленного на 45 px не выбрасывает наверх', GAME.pl.y > 150,
        'pl.y=' + GAME.pl.y.toFixed(0));
  check('его отодвигает вбок к ближней грани', GAME.pl.x + GAME.pl.w <= 401,
        'правый край=' + (GAME.pl.x + GAME.pl.w).toFixed(0));
  GAME.stop();

  // 18. платформа прижимает игрока к стене вплотную — и держит, не подбрасывая
  const floorH = { id: 1, type: 'rect', x: 0, y: 400, w: 900, h: 40, rot: 0, fill: '#111827' };
  const wallH  = { id: 2, type: 'rect', x: 500, y: 200, w: 60, h: 200, rot: 0, fill: '#111827' };
  const platH  = { id: 3, type: 'rect', x: 300, y: 340, w: 60, h: 60, rot: 0, fill: '#2f8bff',
                   moves: true, moveX: 260, moveY: 0, speed: 1.6 };
  const spawnH = { id: 4, type: 'spawn', x: 460, y: 340, w: 20, h: 60, rot: 0, fill: '#111827' };
  GAME.loadMap({ mode: 'hideAndSeek', objects: [floorH, wallH, platH, spawnH] });
  GAME.startPlay();
  clearKeys();
  let topMost = GAME.pl.y;
  for (let i = 0; i < 400; i++) { GAME.step(); if (GAME.pl.y < topMost) topMost = GAME.pl.y; }
  check('платформа у стены не забрасывает наверх', topMost > 220,
        'самая высокая точка y=' + topMost.toFixed(0));
}
if (GAME && GAME.restartRun) {
  const floorF = { id: 1, type: 'rect', x: 0, y: 400, w: 1400, h: 40, rot: 0, fill: '#111827' };
  const spawnF = { id: 2, type: 'spawn', x: 60, y: 340, w: 20, h: 60, rot: 0, fill: '#111827' };
  const finF = { id: 3, type: 'finishline', x: 1200, y: 314, w: 42, h: 86, rot: 0, fill: '' };
  const coinF = { id: 4, type: 'coin', x: 300, y: 360, w: 22, h: 22, rot: 0, fill: '' };

  GAME.loadMap({ mode: 'race', objects: [floorF, spawnF, finF, coinF] });
  check('старт далеко от финиша — можно играть', GAME.spawnTooClose() === null);
  GAME.startPlay();
  clearKeys();
  // добираемся до финиша
  GAME.pl.x = 1190; GAME.pl.y = 340;
  for (let i = 0; i < 10; i++) GAME.step();
  check('финиш засчитан', GAME.done);

  // новый забег без перезагрузки и без кнопок
  GAME.pl.x = 300; GAME.pl.y = 340;
  for (let i = 0; i < 5; i++) GAME.step();
  const gotCoin = GAME.coins;
  GAME.restartRun();
  check('после перезапуска можно играть снова', !GAME.done);
  check('монеты обнулены', GAME.coins === 0, 'было ' + gotCoin);
  check('игрок вернулся на старт', Math.abs(GAME.pl.x - 60) < 2, GAME.pl.x.toFixed(0));
  // собранная монета вернулась на карту
  GAME.pl.x = 300; GAME.pl.y = 340;
  for (let i = 0; i < 5; i++) GAME.step();
  check('монеты собираются заново', GAME.coins === 1, GAME.coins);
  GAME.stop();

  // вода и «жидкости» из старых карт выбрасываются при загрузке
  GAME.loadMap({ mode: 'race', objects: [
    floorF, spawnF, finF,
    { id: 90, type: 'liquid', liq: 'water', x: 300, y: 360, w: 20, h: 20, rot: 0 },
    { id: 91, type: 'water', x: 340, y: 360, w: 20, h: 20, rot: 0, fill: '#38bdf8' }
  ]});
  check('старой воды в карте нет',
        !GAME.objects.some(o => o.type === 'water' || o.type === 'liquid'),
        GAME.objects.map(o => o.type).join(','));
  check('остальное на месте', GAME.objects.length === 3, GAME.objects.length);
  GAME.startPlay();
  clearKeys();
  GAME.pl.x = 300; GAME.pl.y = 200; GAME.pl.vy = 4;
  let fell = false;
  for (let i = 0; i < 120 && !fell; i++) { GAME.step(); if (GAME.pl.ground) fell = true; }
  check('игрок проходит карту без воды', fell);
  GAME.stop();

  // старт вплотную к финишу карту не пускает
  const finNear = { id: 5, type: 'finishline', x: 140, y: 314, w: 42, h: 86, rot: 0, fill: '' };
  GAME.loadMap({ mode: 'race', objects: [floorF, spawnF, finNear] });
  check('старт рядом с финишем ловится', GAME.spawnTooClose() !== null,
        'расстояние ' + GAME.spawnTooClose());
}

console.log(`Физика: пройдено ${phys}, ошибок ${physFail}`);

process.exit(failed || toolFail || physFail ? 1 : 0);
