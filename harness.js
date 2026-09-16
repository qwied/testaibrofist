/* Тестовый стенд физики AIBROFIST: вырезает секцию физики из game.html,
   подставляет заглушки DOM и возвращает фабрику изолированных движков.
   Используется test-movers.js и test-objects.js. */
'use strict';
const fs = require('fs');
const vm = require('vm');

function extractPhysics(htmlPath){
  const src = fs.readFileSync(htmlPath, 'utf8');
  const a = src.indexOf('var ALL = "hideAndSeek race";');
  const m = src.match(/function stepAlways\(\)\{[\s\S]*?\n\}/);
  if(a < 0 || !m) throw new Error('не найдена секция физики в ' + htmlPath);
  return src.slice(a, m.index + m[0].length);
}

const STUBS = `
var __els = {};
function __el(){ return { textContent:'', style:{}, classList:{add(){},remove(){}},
  appendChild(){}, setAttribute(){}, innerHTML:'', width:1280, height:800 }; }
var document = {
  getElementById: function(id){ return __els[id] || (__els[id] = __el()); },
  createElement: function(){ return __el(); },
  body: { classList:{add(){},remove(){},toggle(){}} }
};
var window = { GAME: { others: function(){ return []; } } };
var cv = { width:1280, height:800, getContext:function(){ return __ctx; }, style:{} };
var __ctx = {};
var ctx = __ctx, DPR = 1;
var VW = function(){ return 1280; }, VH = function(){ return 800; };
var dialog = function(){};
var inspect = function(){};
var figure = function(){};
var grad = function(){ return ''; };
var COIN_IMG = { complete:false, naturalWidth:0 };
var requestAnimationFrame = function(){};
var setTimeout_real = setTimeout;
var setTimeout = function(fn,ms){ return 0; };  // в тестах смерть не вызываем
var clearTimeout = function(){};
`;

// возвращает управление в тест: все top-level var/function попадают в sandbox
const EXPORT = `
;
__export({ objects: function(){return objects;}, setObjects: function(a){objects=a;},
  pl: function(){return pl;}, keys: function(){return keys;},
  step: function(){return step();}, respawn: function(){return respawn();},
  spawnPt: function(){return spawnPt;}, setSpawn: function(x,y){spawnPt={x:x,y:y};},
  indexMovers: function(){return indexMovers();}, jumpV: function(){return jumpV();},
  G: function(){return G();}, gravityScale: function(){return gravityScale;},
  playing: function(){return playing;}, setPlaying: function(v){playing=v;},
  done: function(){return done;}, pushFromMovers: function(){return typeof pushFromMovers==='function';},
  JUMP_H: function(){return JUMP_H;}, coy: function(){return coy;}, buf: function(){return buf;},
  startRun: function(){
    playing = true; done = false; parts.length = 0;
    indexMovers(); markDirty();
    pl.w = SIZES.spawn[0]; pl.h = SIZES.spawn[1];
    objects.forEach(function(o){
      o._hx = o.x; o._hy = o.y; o._t = 0; o._act = !!o.startsOpen;
      o._got = false; o._reached = false; o._spin = 0; o._squash = 0;
    });
    respawn();
  }
});
`;

function makeEngine(htmlPath){
  const code = STUBS + extractPhysics(htmlPath) + EXPORT;
  const sandbox = { __export: null, console, Math, setTimeout: ()=>0, clearTimeout: ()=>{} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  let api = null;
  sandbox.__export = function(e){ api = e; };
  vm.runInContext(code, sandbox, { filename: htmlPath });
  if(!api) throw new Error('export не сработал');
  return api;
}

// удобный конструктор объекта карты (как mk в движке)
function obj(type,x,y,w,h,props){
  return Object.assign({ id:0, type:type, x:x, y:y, w:w, h:h, rot:0, fill:'', deadly:false }, props||{});
}

module.exports = { makeEngine, obj };
