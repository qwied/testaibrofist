/* AIBROFIST — монета из игры в виде иконки для интерфейса.
   Повторяет PAINT.coin из редактора: золотой градиент и блик. */
(function () {
  'use strict';
  var n = 0;

  // та же монета, что лежит в профиле игрока и в самой игре
  function svg(size) {
    size = size || 18;
    n++;
    return '<img class="bfCoinIcon" src="/coin.png" width="' + size + '" height="' + size +
           '" alt="монета" style="vertical-align:-0.18em">';
  }

  // «123 <знак монеты>» -> «123 <картинка>»
  function amount(v, size) { return v + ' ' + svg(size); }

  /* Ниже знак монеты встречается только как ОБРАЗЕЦ ДЛЯ ПОИСКА:
     если он где-то просочился в текст, мы меняем его на картинку монеты.
     Сам интерфейс эмодзи не выводит. */
  // заменить эмодзи на иконку в готовой строке
  function fix(text, size) {
    return String(text == null ? '' : text).replace(/🪙/g, svg(size));
  }

  // пройтись по DOM и заменить оставшиеся эмодзи (в т.ч. в текстах с сервера)
  /* Раньше весь текст узла целиком уходил в innerHTML — если рядом с монеткой
     в том же узле оказывался чужой текст с «<» или «>» (например, из поля
     "о себе", куда его положили ЧЕРЕЗ textContent и посчитали безопасным),
     он внезапно исполнялся как разметка. Теперь эмодзи вырезается точечно:
     вокруг него остаются обычные текстовые узлы, а картинка — единственный
     новый элемент, который мы создаём сами через createElement. */
  function sweep(root) {
    root = root || document.body;
    if (!root || !root.querySelectorAll) return;
    var w;
    try { w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false); }
    catch (e) { return; }
    var list = [], node;
    while ((node = w.nextNode())) if (node.nodeValue.indexOf('🪙') !== -1) list.push(node);
    list.forEach(function (tn) {
      var parts = tn.nodeValue.split('🪙');
      var frag = document.createDocumentFragment();
      for (var i = 0; i < parts.length; i++) {
        if (parts[i]) frag.appendChild(document.createTextNode(parts[i]));
        if (i < parts.length - 1) {
          var img = document.createElement('img');
          img.className = 'bfCoinIcon';
          img.src = '/coin.png';
          img.width = 16; img.height = 16;
          img.alt = 'монета';
          img.style.verticalAlign = '-0.18em';
          frag.appendChild(img);
        }
      }
      tn.parentNode.replaceChild(frag, tn);
    });
  }

  window.BFCoin = { svg: svg, amount: amount, fix: fix, sweep: sweep };

  function boot() {
    sweep(document.body);
    try {
      new MutationObserver(function (m) {
        for (var i = 0; i < m.length; i++)
          for (var j = 0; j < m[i].addedNodes.length; j++)
            if (m[i].addedNodes[j].nodeType === 1) sweep(m[i].addedNodes[j]);
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
