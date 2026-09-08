// Проверяем, что аватарка везде рисуется одинаково
const fs=require('fs');
const listeners=new Map();
function mk(tag){
  const e={ tagName:String(tag).toUpperCase(), children:[], dataset:{}, attrs:{},
    style:new Proxy({},{get:(t,k)=>t[k]||'',set:(t,k,v)=>(t[k]=v,true)}),
    classList:{_s:new Set(),add(...c){c.forEach(x=>this._s.add(x))},remove(){},contains(c){return this._s.has(c)},toggle(){}},
    get className(){return [...this.classList._s].join(' ')},
    set className(v){this.classList._s=new Set(String(v).split(/\s+/).filter(Boolean))},
    _html:'', get innerHTML(){return this._html}, set innerHTML(v){this._html=v; this.children=[];},
    appendChild(c){this.children.push(c); c.parentNode=this; return c;},
    querySelector(sel){
      const cls=sel.replace(/^img\./,'');
      return this.children.find(c=>c.tagName==='IMG'&&c.classList.contains(cls))||null;
    },
    querySelectorAll(){return []},
    setAttribute(k,v){this.attrs[k]=v}, getAttribute(k){return this.attrs[k]||null},
    addEventListener(){}, closest(){return null},
    src:'', alt:'' };
  return e;
}
global.document={ createElement:mk, readyState:'complete', addEventListener(){},
  querySelectorAll(){return []}, documentElement:mk('html'), body:mk('body') };
global.window={ addEventListener(){}, BFSkin:null };
global.fetch=()=>Promise.reject(new Error('offline'));
global.MutationObserver=function(){ this.observe=()=>{}; };
global.setInterval=()=>0;

// подсовываем настоящий рисовальщик
const host={};
new Function('window', fs.readFileSync(__dirname+'/skinRender.js','utf8'))(host);
global.window.BFSkin=host.BFSkin;

const src=fs.readFileSync(__dirname+'/skinAvatar.js','utf8');
new Function(src)();
const A=global.window.BFAvatar;

const skin={head:'h_crown',face:'f_none',body:'b_suit',back:'k_cape'};

console.log('--- <img> (профиль, лидеры, друзья) ---');
const im=mk('img'); im.classList.add('profile-picture');
A.paint(im, skin);
console.log('src это картинка:', im.src.slice(0,30)+'…');
console.log('строчной ширины нет:', !im.style.width, '| object-fit:', im.style.objectFit);

console.log('\n--- <div> (аватарка в шапке) ---');
const dv=mk('div'); dv.classList.add('bfAvatar');
dv.innerHTML='<span class="bfBrandMark"><i></i><i></i></span>';
A.paint(dv, skin);
console.log('заглушка убрана :', dv.innerHTML===''); 
console.log('фон не ставится :', dv.style.backgroundImage==='');
console.log('внутри картинка :', dv.children.length===1 && dv.children[0].tagName==='IMG');
console.log('у неё класс bfAva:', dv.children[0].classList.contains('bfAva'));
// у каждого SVG свой id обрезки, поэтому сравниваем без него
const strip = u => decodeURIComponent(u).replace(/bf\d+/g,'ID');
console.log('и та же фигура  :', strip(dv.children[0].src)===strip(im.src));

console.log('\n--- скин-картинка владельца ---');
const dv2=mk('div'); dv2.classList.add('bfAvatar');
A.paint(dv2, { img:'/skinimg/abc.png' });
console.log('берётся сама картинка:', dv2.children[0].src);

console.log('\n--- повторный вызов не плодит картинки ---');
A.paint(dv, skin); A.paint(dv, skin);
console.log('детей внутри:', dv.children.length, '(должно 1)');
