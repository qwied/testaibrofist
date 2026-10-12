/* ======= Знания помощника редактора =======
   Отвечает офлайн: подбирает тему по словам вопроса и отдаёт готовый совет.
   Никаких запросов в сеть — как и генератор карт.

   Наружу: window.BFHelp.ask(вопрос) -> {answer, topic} | null
   В node подключается через require: на нём держатся тесты. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BFHelp = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var TOPICS = [
    {
      id: 'hotkeys',
      words: ['горяч', 'клавиш', 'сочетан', 'копир', 'скопир', 'дубл', 'отмен', 'ctrl',
              'shortcut', 'hotkey', 'keys', 'copy', 'duplicate', 'undo'],
      answer:
        'Editor hotkeys:\n'
        + '• Ctrl+Z — undo, Ctrl+Y or Ctrl+Shift+Z — redo\n'
        + '• Ctrl+D — duplicate the selection\n'
        + '• Alt + drag — quick copy with the mouse: the original stays in place\n'
        + '• Delete or Backspace — delete\n'
        + '• G — grid, 0 — reset view, + and − — zoom\n'
        + '• Space + left click, or middle/right click — pan the map\n'
        + '• ▶ — play, Esc — exit, R — restart\n'
        + 'In-game: arrows or A/D — run, up/W/space — jump (holdable).'
    },
    {
      id: 'ricochet',
      words: ['рикошет', 'отскок', 'отраж', 'батут', 'пружин', 'ricochet', 'bounce'],
      answer:
        'There\'s no separate trampoline — "Bouncing" replaces it entirely.\n'
        + 'Place any block, circle or triangle, then turn on "Bouncing" in its properties (Active tab).\n'
        + 'The bounce direction is based on which face the player hit: '
        + 'land on top and you bounce up, hit the side and you bounce sideways, hit your head and you bounce down.\n'
        + 'A slow touch doesn\'t bounce — otherwise the player would jitter while standing on the block.'
    },
    {
      id: 'pushable',
      words: ['толка', 'толкается', 'ящик', 'коробк', 'масса объект', 'pushable', 'push', 'crate'],
      answer:
        'The "Physics" checkbox gives an object its own physics, like Bouncing or Lift — available on any '
        + 'block, circle or triangle. Such a shape falls and rests on the ground on its own (same gravity '
        + 'as the player), and a player walking into it pushes it along. "Mass" — the higher it is, the '
        + 'slower it moves when pushed. Incompatible with "Lift"/"Rotation": turning one on switches the '
        + 'others off, since an object can only have one source of motion at a time.'
    },
    {
      id: 'pulse',
      words: ['size changer', 'изменение размера', 'пульс', 'мерца', 'мигает размер', 'changer',
              'дышит', 'пульсир'],
      answer:
        '"Size changer" is a purely visual effect: the shape smoothly pulses on screen, changing size '
        + 'slightly. It never touches the hitbox — the object\'s physical width and height stay exactly '
        + 'the same, so this checkbox can never open up a path that wasn\'t there before, or trap the '
        + 'player in a wall. Works independently of Bouncing, Physics, Lift and Rotation — it doesn\'t '
        + 'switch any of them off, and they don\'t switch it off either.'
    },
    {
      id: 'laser',
      words: ['лазер', 'излучател', 'луч', 'laser', 'beam', 'emitter'],
      answer:
        'A laser is also just a property of a shape (the "Laser (emitter)" checkbox), not a separate '
        + 'object. It works like a button: while the beam, shooting out "Beam range" pixels from the '
        + 'block\'s face, is blocked by the player, objects linked through "Targets" turn on; step away '
        + 'and they turn off. The beam reflects off walls that have "Bouncing" on, and ignores passable/'
        + 'decorative objects.\n'
        + 'By default the beam itself is harmless — it only drives the button logic. Turn on "Dangerous" '
        + '(Automatic tab) on the same block too, and the whole beam becomes deadly, not just the '
        + 'emitter block itself: death anywhere along the beam\'s path, not only from touching the emitter.'
    },
    {
      id: 'ghost',
      words: ['проходим', 'декор', 'ghost', 'сквозь', 'не твёрд', 'без коллиз'],
      answer:
        'The "Collision" checkbox (Automatic tab) is on by default for solid shapes (block, circle, '
        + 'triangle) and keeps them solid. Turn it off and the player passes straight through, like '
        + 'through a picture — handy for decorative backgrounds or labels that shouldn\'t block the '
        + 'way. Don\'t confuse it with "Starts open" on linked objects — there the block is only '
        + 'passable until its button is pressed, not permanently.'
    },
    {
      id: 'speedboost',
      words: ['множитель скорост', 'ускор', 'замедл', 'буст', 'speedmul', 'boost платформ', 'бустер'],
      answer:
        '"Boost" (Automatic tab) is a speed multiplier: while the player STANDS on this platform (any '
        + 'solid one, not necessarily a moving one), their run speed is multiplied. A positive value '
        + 'speeds them up, negative slows them down. 0 or empty — no change. Works independently of '
        + 'Bouncing, Physics, Lift and Rotation — it\'s a separate property any solid platform can have.'
    },
    {
      id: 'no-water',
      words: ['вод', 'water', 'liquid', 'плават', 'плыть', 'бассейн', 'кислот', 'жидкост', 'лить', 'лей', 'струя', 'капл', 'налив'],
      answer:
        'There\'s no water in the game anymore — it was removed entirely, along with the Water tool.\n'
        + 'Puddles, streams, pools and swimming are gone from both the editor and the game, and water '
        + 'is stripped out of old maps on load — the rest of the geometry is left untouched.\n'
        + 'Instead of water, make a spot dangerous with the "Dangerous" checkbox (Automatic tab) on any block.'
    },
    {
      id: 'hide',
      words: ['прятк', 'укрыт', 'спрятат', 'искател', 'hide', 'seek'],
      answer:
        'Hide and Seek: select a solid shape and turn on "Hiding spot" (Passive tab).\n'
        + 'Such an object loses its collision — the player walks inside and disappears for everyone '
        + 'else, nickname and chat bubbles included, and can\'t be caught.\n'
        + 'In the editor, hiding spots are outlined with a green dashed line. The checkbox only shows '
        + 'up in Hide and Seek mode.'
    },
    {
      id: 'links',
      words: ['связ', 'кнопк', 'рычаг', 'механизм', 'id', 'цел', 'открыт сначала', 'button', 'lever'],
      answer:
        'Linking mechanisms:\n'
        + '1. Select the target block and give it an ID, e.g. door1.\n'
        + '2. Select a button or lever and type that same ID into the "Targets" field (Active tab). '
        + 'Comma-separate several.\n'
        + '3. Press ▶ — the block opens when the button is pressed and becomes passable.\n'
        + 'A button only works while a player stands on it; a lever flips permanently. '
        + 'The "Starts open" checkbox (Passive tab) makes the block passable before it\'s triggered.'
    },
    {
      id: 'size',
      words: ['размер', 'префаб', 'клетк', 'сетк', '20x20', 'игрок разм', 'гравитац', 'size', 'grid', 'gravity'],
      answer:
        'The base object is a 20x20 cell — everything else is easy to build from it. '
        + 'Drag with the mouse to set a different size, or edit Width/Height on the Visuals tab.\n'
        + 'The player\'s size is fixed at 20x60, and gravity is fixed at 9. '
        + 'Neither is configurable anymore — otherwise the same map would play differently for different authors.'
    },
    {
      id: 'coins',
      words: ['монет', 'coin', 'наград'],
      answer:
        'A single map can hold at most three coins — a server-side anti-farming limit. '
        + 'Place them somewhere the player won\'t pass through on a straight line: over a gap, on an '
        + 'upper tier, past a dangerous section.'
    },
    {
      id: 'race',
      words: ['гонк', 'финиш', 'чекпоинт', 'race', 'finish', 'checkpoint'],
      answer:
        'Race: you must place a start point and a finish, otherwise the map can\'t be completed. '
        + 'Checkpoints move the respawn point — place one every few hard jumps, otherwise falling '
        + 'sends the player all the way back to the start.'
    },
    {
      id: 'jump',
      words: ['прыж', 'высот', 'разрыв', 'дистанц', 'долет', 'проходим', 'jump', 'gap'],
      answer:
        'Jump limits at gravity 9: height around 122 pixels, distance around 200. '
        + 'Safe gaps: 90 for an easy map, 130 for medium, 170 for hard. '
        + 'Keep the rise over a single jump within 60, 85 and 105 respectively — otherwise the section '
        + 'becomes impassable. You can push off a wall to jump higher.'
    },
    {
      id: 'traps',
      words: ['яд', 'ловуш', 'шип', 'убива', 'опасн', 'смерт', 'trap', 'deadly'],
      answer:
        'Any object can have the "Dangerous" checkbox (Automatic tab) turned on — it then kills on '
        + 'touch. Give such blocks their own distinct color: black-on-black is invisible to the player '
        + 'and just reads as an unfair map. In the editor they\'re outlined with a red dashed line.\n'
        + 'On a laser, the same checkbox makes the whole beam deadly, not just the emitter block — ask '
        + '"laser" for details.\n'
        + 'Don\'t see the checkbox on the selected object? Check the mode at the top: in Hide and Seek '
        + 'dying isn\'t possible at all, so "Dangerous" isn\'t shown there — switch to Race.'
    },
    {
      id: 'move',
      words: ['двигает', 'движ', 'платформ', 'вращ', 'крутит', 'moving', 'rotate', 'spin'],
      answer:
        'Movement and rotation are properties of any block, not separate objects.\n'
        + '• "Lift": Move X and Move Y set the range, Speed sets the pace. The player rides along with the block.\n'
        + '• "Rotation": set the spin speed in its properties. Rotating blocks are usually also made Dangerous.'
    },
    {
      id: 'publish',
      words: ['опубликов', 'вылож', 'сохран', 'публик', 'maps browser', 'publish', 'save'],
      answer:
        'A map publishes in whichever mode is selected in the editor, and lands in Maps Browser. '
        + 'You can publish up to three new maps per day, earning 10 coins each. '
        + 'Object limit is 2000, coin limit is 3. The floppy-disk button saves the map as a .txt file to your computer.'
    },
  ];

  var FALLBACK =
      'I didn\'t catch that. I know about: hotkeys, Bouncing, Physics objects, Size changer, lasers, '
    + 'Collision/decoration, speed Boost, hiding spots, linking buttons and levers, sizes and '
    + 'gravity, coins, Race and the finish, jump limits, Dangerous traps, Lift and Rotation, '
    + 'and publishing maps.\n'
    + 'Try asking, for example: "how do I link a button?" or "what does Size changer do?"';

  /* Тема выбирается по числу совпавших основ: чем больше, тем точнее.
     Это не понимание смысла, а честный поиск по словам — зато мгновенно
     и работает без сети. */
  function ask(question) {
    var q = String(question || '').toLowerCase().trim();
    if (!q) return null;

    var best = null, bestScore = 0;
    for (var i = 0; i < TOPICS.length; i++) {
      var t = TOPICS[i], score = 0;
      for (var w = 0; w < t.words.length; w++)
        if (q.indexOf(t.words[w]) !== -1) score += t.words[w].length;
      if (score > bestScore) { bestScore = score; best = t; }
    }
    if (!best) return { topic: null, answer: FALLBACK };
    return { topic: best.id, answer: best.answer };
  }

  return { ask: ask, TOPICS: TOPICS, FALLBACK: FALLBACK };
});
