'use strict';
/* ================== ВЕЧЕРИНКА ==================
   Идеи 2019 года «Quiz mode», «Guess the word», «Build battle» и «Mixed mode» — отдельный режим
   «Party» (комнаты «party-N», см. hsFixedOf в server.js). Раунды по кругу (CYCLE):
     quiz  — викторина о самой игре: QUIZ.n вопросов, четыре ответа, QUIZ.ms на каждый; верно —
             100 очков и до 100 за скорость;
     guess — угадай слово: один рисует (по очереди — кто дольше всех не рисовал), остальные пишут
             догадки; угадал — 100 и до 100 за скорость, рисующему — 50 за каждого угадавшего;
     build — строительная битва: тема, у каждого поле BUILD.n×BUILD.n клеток и минута; потом модели
             по очереди, каждый ставит чужой от 1 до 5 звёзд — очки модели = сумма звёзд;
     mix   — Mixed: между мини-играми — случайный раунд других режимов на случайной карте (см.
             hsMixPick в server.js), он идёт своим обычным порядком.
   Мини-игры не про карту: по ней можно бегать, но искателя и боя нет. Ответы, догадки и оценки
   считает сервер — клиент присылает только свой выбор. Чужие неверные догадки не видит никто,
   кроме самого игрока: иначе поле догадок стало бы чатом без фильтра. Вопросы — только о правилах
   этой игры (числа сверены с кодом режимов), без выдуманной истории. */

const GAMES = ['quiz', 'guess', 'build'];
const CYCLE = ['quiz', 'mix', 'guess', 'mix', 'build', 'mix'];
function isGame(v) { return GAMES.indexOf(v) !== -1; }

const QUIZ = { n: Number(process.env.PARTY_QUIZ_N) || 7, ms: Number(process.env.PARTY_Q_MS) || 12000, show: Number(process.env.PARTY_SHOW_MS) || 3500 };
const GUESS = { ms: Number(process.env.PARTY_GUESS_MS) || 80000, show: Number(process.env.PARTY_SHOW_MS) || 4000, w: 480, h: 300,
                maxPts: 6000, colors: 8 };
const BUILD = { ms: Number(process.env.PARTY_BUILD_MS) || 60000, show: Number(process.env.PARTY_VOTE_MS) || 6000, n: 12, colors: 10,
                maxShow: 8, end: 4500 };

const L = (en, ru) => ({ en, ru });
/* Вопрос: текст и ответы, первый ответ — верный (порядок перемешивается при каждом вопросе). */
const QUESTIONS = [
  [L('How many players does Murder Mystery need to start?', 'Со скольких игроков начинается Murder Mystery?'), [L('3', '3'), L('2', '2'), L('4', '4'), L('5', '5')]],
  [L('For how long can the murderer not knock anyone out at the start of Murder Mystery?', 'Сколько секунд в начале Murder Mystery убийца не может никого выбить?'),
    [L('20 seconds', '20 секунд'), L('5 seconds', '5 секунд'), L('10 seconds', '10 секунд'), L('60 seconds', '60 секунд')]],
  [L('Who catches the murderer in Murder Mystery?', 'Кто ловит убийцу в Murder Mystery?'), [L('The sheriff', 'Шериф'), L('The seeker', 'Искатель'), L('A zombie', 'Зомби'), L('Bro RED', 'Bro RED')]],
  [L('How long does the hunt last in Hide and Seek?', 'Сколько длится охота в Hide and Seek?'), [L('2 minutes', '2 минуты'), L('1 minute', '1 минуту'), L('5 minutes', '5 минут'), L('30 seconds', '30 секунд')]],
  [L('What happens in the last 30 seconds of a Hide and Seek round?', 'Что происходит в последние 30 секунд раунда Hide and Seek?'),
    [L('The seeker sees everyone', 'Искатель видит всех'), L('Hiders get speed', 'Прячущиеся ускоряются'), L('The map changes', 'Меняется карта'), L('A second seeker joins', 'Появляется второй искатель')]],
  [L('What color is the seeker in classic Hide and Seek?', 'Какого цвета искатель в классических прятках?'), [L('Blue', 'Синий'), L('Red', 'Красный'), L('Green', 'Зелёный'), L('Orange', 'Оранжевый')]],
  [L('What happens to a hider who touches poison in Zombie Apocalypse?', 'Что будет с прячущимся, который коснулся яда в Zombie Apocalypse?'),
    [L('They become a zombie', 'Он становится зомби'), L('Nothing', 'Ничего'), L('They respawn at the start', 'Он возвращается на старт'), L('They win the round', 'Он выигрывает раунд')]],
  [L('What happens to a caught robber in Cops and Robbers?', 'Что происходит с пойманным грабителем в «Копах и грабителях»?'),
    [L('Goes to jail until another robber frees them', 'Сидит в тюрьме, пока его не освободит другой грабитель'), L('Becomes a cop', 'Становится копом'),
     L('Leaves the room', 'Выходит из комнаты'), L('Becomes a zombie', 'Становится зомби')]],
  [L('From how many players can a Hide and Seek room play Cops and Robbers?', 'Со скольких игроков в комнате пряток бывают «Копы и грабители»?'), [L('6', '6'), L('3', '3'), L('4', '4'), L('10', '10')]],
  [L('How many captures win Capture the Flag?', 'Сколько доставленных флагов приносят победу в Capture the Flag?'), [L('3', '3'), L('1', '1'), L('5', '5'), L('10', '10')]],
  [L('How many points win Domination?', 'Сколько очков нужно для победы в Domination?'), [L('120', '120'), L('50', '50'), L('100', '100'), L('300', '300')]],
  [L('From how many players does Team Battle split into four teams?', 'Со скольких игроков Team Battle делится на четыре команды?'), [L('8', '8'), L('4', '4'), L('6', '6'), L('12', '12')]],
  [L('Which colors do the third and fourth teams have?', 'Какого цвета третья и четвёртая команды?'),
    [L('Green and yellow', 'Зелёные и жёлтые'), L('Purple and orange', 'Фиолетовые и оранжевые'), L('Black and white', 'Чёрные и белые'), L('Pink and gray', 'Розовые и серые')]],
  [L('How many knockouts win Free for All in War?', 'Сколько нокаутов нужно для победы в «Все против всех» в «Войне»?'), [L('10', '10'), L('5', '5'), L('15', '15'), L('20', '20')]],
  [L('How many knockouts win Team War?', 'Сколько нокаутов нужно для победы в «Командной войне»?'), [L('15', '15'), L('10', '10'), L('20', '20'), L('30', '30')]],
  [L('How many lives does a fighter have in Hunger Games?', 'Сколько жизней у бойца в «Голодных играх»?'), [L('One', 'Одна'), L('Three', 'Три'), L('Five', 'Пять'), L('Unlimited', 'Сколько угодно')]],
  [L('Who is Bro RED?', 'Кто такой Bro RED?'),
    [L('A huge red fighter against everyone', 'Огромный красный боец против всех'), L('The seeker of Zombie Apocalypse', 'Искатель в Zombie Apocalypse'),
     L('The red team flag', 'Флаг красной команды'), L('A race map', 'Карта для гонки')]],
  [L('Which key opens the shop?', 'Какая клавиша открывает магазин?'), [L('B', 'B'), L('F', 'F'), L('Q', 'Q'), L('E', 'E')]],
  [L('Which key attacks in War?', 'Какой клавишей бить в «Войне»?'), [L('F', 'F'), L('B', 'B'), L('Space', 'Пробел'), L('Shift', 'Shift')]],
  [L('How many tokens does a knockout give in War?', 'Сколько жетонов дают за нокаут в «Войне»?'), [L('2', '2'), L('1', '1'), L('5', '5'), L('10', '10')]],
  [L('What does the medkit from the shop do?', 'Что даёт аптечка из магазина?'),
    [L('+50 health', '+50 здоровья'), L('Full health', 'Полное здоровье'), L('+10 health', '+10 здоровья'), L('An extra life', 'Дополнительную жизнь')]],
  [L('What does the shield from the shop do?', 'Что делает щит из магазина?'),
    [L('Halves damage for 10 seconds', 'Вдвое меньше урона 10 секунд'), L('Blocks all damage', 'Не пропускает урон совсем'), L('Makes you invisible', 'Делает невидимым'), L('Doubles your speed', 'Удваивает скорость')]],
  [L('Who can buy invisibility in Hide and Seek?', 'Кто может купить невидимость в прятках?'),
    [L('Only hiders', 'Только прячущиеся'), L('Only the seeker', 'Только искатель'), L('Everyone', 'Все'), L('Nobody', 'Никто')]],
  [L('What do the cannons shoot in Pirate War?', 'Чем стреляют пушки в «Пиратской войне»?'),
    [L('Poison balls', 'Ядовитыми ядрами'), L('Fireworks', 'Фейерверками'), L('Coins', 'Монетами'), L('Water', 'Водой')]],
  [L('How long does a cannon take to reload?', 'Сколько перезаряжается пушка?'), [L('2.5 seconds', '2,5 секунды'), L('1 second', '1 секунду'), L('5 seconds', '5 секунд'), L('10 seconds', '10 секунд')]],
  [L('How long does a knocked out fighter wait to come back in War?', 'Сколько ждёт выбитый боец, чтобы вернуться в «Войне»?'),
    [L('3 seconds', '3 секунды'), L('10 seconds', '10 секунд'), L('Until the next round', 'До следующего раунда'), L('1 second', '1 секунду')]],
  [L('How many coins does reaching the finish in Race pay?', 'Сколько монет дают за финиш в гонке?'),
    [L('1 to 5 at random', 'От 1 до 5 случайно'), L('Always 10', 'Всегда 10'), L('None', 'Нисколько'), L('100', '100')]],
  [L('Where do spikes and poison send you in Race?', 'Куда возвращают шипы и яд в гонке?'),
    [L('To the last checkpoint', 'На последний чекпоинт'), L('To the very start', 'В самое начало'), L('To the finish', 'К финишу'), L('Nowhere', 'Никуда')]],
  [L('How big is a player in the map editor?', 'Какого размера игрок в редакторе карт?'), [L('30 x 100', '30 x 100'), L('20 x 20', '20 x 20'), L('50 x 50', '50 x 50'), L('100 x 30', '100 x 30')]],
  [L('Which editor object lets players hide inside it?', 'Какой объект в редакторе позволяет спрятаться внутри?'),
    [L('A hide spot', 'Укрытие'), L('A checkpoint', 'Чекпоинт'), L('A cannon', 'Пушка'), L('A lever', 'Рычаг')]],
  [L('How many points does a correct quiz answer give before the speed bonus?', 'Сколько очков даёт верный ответ в викторине без бонуса за скорость?'),
    [L('100', '100'), L('10', '10'), L('50', '50'), L('1000', '1000')]]
].map(([q, a]) => ({ q, a }));

/* Слова для «Угадай слово»: то, что можно нарисовать. Засчитывается любая форма на любом из двух
   языков; первая — та, что показывают. */
const WORDS = [
  [['cat', 'kitten', 'kitty'], ['кот', 'кошка', 'котик']], [['dog', 'puppy'], ['собака', 'пес', 'щенок']], [['house', 'home'], ['дом', 'домик']],
  [['tree'], ['дерево']], [['sun'], ['солнце']], [['car'], ['машина', 'автомобиль']], [['fish'], ['рыба', 'рыбка']], [['star'], ['звезда']],
  [['apple'], ['яблоко']], [['flower'], ['цветок']], [['boat', 'ship'], ['лодка', 'корабль']], [['rocket'], ['ракета']], [['moon'], ['луна', 'месяц']],
  [['key'], ['ключ']], [['hat'], ['шляпа']], [['cake'], ['торт']], [['ghost'], ['призрак', 'привидение']], [['crown'], ['корона']],
  [['sword'], ['меч']], [['heart'], ['сердце']], [['cloud'], ['облако', 'туча']], [['snake'], ['змея']], [['ball'], ['мяч']],
  [['clock', 'watch'], ['часы']], [['bridge'], ['мост']], [['pizza'], ['пицца']], [['robot'], ['робот']], [['castle'], ['замок']],
  [['mushroom'], ['гриб']], [['bird'], ['птица']], [['cannon'], ['пушка']], [['flag'], ['флаг']], [['zombie'], ['зомби']],
  [['ladder'], ['лестница']], [['umbrella'], ['зонт', 'зонтик']], [['guitar'], ['гитара']], [['banana'], ['банан']], [['spider'], ['паук']],
  [['glasses'], ['очки']], [['snowman'], ['снеговик']], [['rainbow'], ['радуга']], [['airplane', 'plane'], ['самолет']]
].map(([en, ru]) => ({ en, ru }));

// темы строительной битвы
const THEMES = [L('House', 'Дом'), L('Tree', 'Дерево'), L('Cat', 'Кот'), L('Car', 'Машина'), L('Rocket', 'Ракета'), L('Fish', 'Рыба'),
  L('Flower', 'Цветок'), L('Robot', 'Робот'), L('Pizza', 'Пицца'), L('Castle', 'Замок'), L('Ghost', 'Призрак'), L('Boat', 'Лодка'),
  L('Sun', 'Солнце'), L('Heart', 'Сердце'), L('Dragon', 'Дракон'), L('Mushroom', 'Гриб'), L('Crown', 'Корона'), L('Cake', 'Торт'),
  L('Snowman', 'Снеговик'), L('Zombie', 'Зомби'), L('Bro RED', 'Bro RED'), L('Pirate ship', 'Пиратский корабль'), L('Sword', 'Меч'), L('Rainbow', 'Радуга')];

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/g, '');
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
// случайный из списка, по возможности не из недавних (recent — номера, что уже были)
function fresh(n, recent) {
  const all = Array.from({ length: n }, (_, i) => i), ok = all.filter(i => recent.indexOf(i) === -1);
  const pool = ok.length ? ok : all;
  return pool[Math.floor(Math.random() * pool.length)];
}
// одна правка (лишняя, пропущенная или другая буква) — «почти угадал»
function nearly(a, b) {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false;
  let i = 0, j = 0, d = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++d > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return d + (a.length - i) + (b.length - j) <= 1;
}

module.exports = function createParty(d) {
  const { io, gameState, hsMembers, sessionName, credit, creditScore, endEarly } = d;
  const nameOf = (id) => { const p = gameState.players.get(id); return p ? p.name : ''; };
  const num = (v) => Math.floor(Number(v) || 0);

  /* Порядок раундов «Вечеринки»: мини-игры через одну с Mixed. HS_VARIANT задаёт мини-игру
     принудительно (для тестов). */
  function pick(st, n, mix) {
    const forced = process.env.HS_VARIANT;
    if (isGame(forced)) return forced;
    st.partyStep = ((st.partyStep === undefined ? -1 : st.partyStep) + 1) % CYCLE.length;
    const g = CYCLE[st.partyStep];
    return g === 'mix' ? mix(st, n) : g;
  }
  // сколько длится раунд мини-игры: она сама кончается раньше (см. finish), это — запас
  function roundMs(st, n) {
    if (st.variant === 'quiz') return QUIZ.n * (QUIZ.ms + QUIZ.show) + 3000;
    if (st.variant === 'guess') return GUESS.ms + GUESS.show + 3000;
    return BUILD.ms + Math.min(BUILD.maxShow, n) * BUILD.show + BUILD.end + 3000;
  }

  function clear(st) {
    const p = st.party;
    if (!p) return;
    clearTimeout(p.stageTimer);
    p.timers.forEach(t => clearTimeout(t));
  }
  // таймер этого раунда: если раунд уже другой (или кончился) — ничего не делает
  function later(st, ms, fn) {
    const p = st.party;
    const t = setTimeout(() => { p.timers.delete(t); if (st.party === p && st.phase === 'round') fn(); }, ms);
    p.timers.add(t);
    return t;
  }
  function stage(st, ms, fn) {
    const p = st.party;
    clearTimeout(p.stageTimer);
    p.until = Date.now() + ms;
    p.stageTimer = later(st, ms, fn);
  }
  function scoreList(st, room) {
    const p = st.party;
    return hsMembers(room).map(m => ({ id: m.id, name: m.name, pts: p.score.get(m.id) || 0 })).sort((a, b) => b.pts - a.pts);
  }
  // что видит игрок id прямо сейчас — одно событие на всё (новый вопрос, ответ, очередь моделей)
  function snap(st, room, id) {
    const p = st.party;
    if (!p) return null;
    const out = { g: p.g, stage: p.stage, ms: Math.max(0, p.until - Date.now()), score: scoreList(st, room).slice(0, 8), me: p.score.get(id) || 0 };
    if (p.g === 'quiz' && p.cur) {
      const end = p.stage === 'qEnd';
      Object.assign(out, { n: p.qi + 1, of: p.qs.length, q: p.cur.q, a: p.cur.opts.map(o => o.t),
        mine: p.ans.has(id) ? p.ans.get(id).i : -1, answered: p.ans.size, right: end ? p.cur.right : -1,
        rightIds: end ? Array.from(p.ans).filter(([, v]) => v.i === p.cur.right).map(([k]) => k) : [] });
    } else if (p.g === 'guess' && p.word) {
      const see = id === p.drawer || p.stage === 'end' || p.guessed.has(id);
      Object.assign(out, { drawer: p.drawer, drawerName: nameOf(p.drawer), word: see ? { en: p.word.en[0], ru: p.word.ru[0] } : null,
        hint: p.hint, guessed: Array.from(p.guessed), done: p.guessed.has(id) });
    } else if (p.g === 'build') {
      const owner = p.stage === 'vote' ? p.order[p.vi] : null;
      Object.assign(out, { theme: p.theme, size: BUILD.n, mine: p.builds.get(id) || '',
        k: p.vi + 1, of: p.order ? p.order.length : 0, show: owner ? p.builds.get(owner) : null, own: owner === id,
        myVote: owner && p.votes.get(owner) ? p.votes.get(owner).get(id) || 0 : 0,
        win: p.stage === 'end' && p.win ? { name: nameOf(p.win), px: p.builds.get(p.win), pts: p.score.get(p.win) || 0 } : null });
    }
    return out;
  }
  function push(st, room) {
    hsMembers(room).forEach(m => io.to(m.id).emit('party', snap(st, room, m.id)));
  }
  function finish(st, room) { endEarly(room, st); }

  function start(st, room) {
    clear(st);
    if (!isGame(st.variant)) { st.party = null; return; }
    const p = st.party = { g: st.variant, stage: '', score: new Map(), timers: new Set(), until: 0, stageTimer: null };
    hsMembers(room).forEach(m => p.score.set(m.id, 0));
    if (p.g === 'quiz') quizStart(st, room);
    else if (p.g === 'guess') guessStart(st, room);
    else buildStart(st, room);
  }
  function lobby(st) { clear(st); st.party = null; }

  /* ---------- викторина ---------- */
  function quizStart(st, room) {
    const p = st.party;
    st.partyAsked = st.partyAsked || [];
    p.qs = [];
    for (let i = 0; i < Math.min(QUIZ.n, QUESTIONS.length); i++) {
      const k = fresh(QUESTIONS.length, st.partyAsked.concat(p.qs));
      p.qs.push(k);
    }
    st.partyAsked = st.partyAsked.concat(p.qs).slice(-Math.floor(QUESTIONS.length * 0.6));
    p.qi = -1;
    quizNext(st, room);
  }
  function quizNext(st, room) {
    const p = st.party;
    p.qi++;
    if (p.qi >= p.qs.length) return finish(st, room);
    const Q = QUESTIONS[p.qs[p.qi]];
    const opts = shuffle(Q.a.map((t, i) => ({ t, ok: i === 0 })));
    p.cur = { q: Q.q, opts, right: opts.findIndex(o => o.ok) };
    p.ans = new Map();
    p.stage = 'q';
    p.t0 = Date.now();
    stage(st, QUIZ.ms, () => quizReveal(st, room));
    push(st, room);
  }
  function quizReveal(st, room) {
    const p = st.party;
    p.ans.forEach((v, id) => { if (v.i === p.cur.right) p.score.set(id, (p.score.get(id) || 0) + v.pts); });
    p.stage = 'qEnd';
    stage(st, QUIZ.show, () => quizNext(st, room));
    push(st, room);
  }
  function answer(st, room, id, data) {
    const p = st.party;
    if (!p || p.g !== 'quiz' || p.stage !== 'q' || p.ans.has(id) || !data) return;
    const i = num(data.i);
    if (i < 0 || i > 3) return;
    const left = Math.max(0, p.until - Date.now());
    p.ans.set(id, { i, pts: 100 + Math.round(100 * left / QUIZ.ms) });
    p.active = true;
    // ответили все — не ждём конца времени
    if (hsMembers(room).every(m => p.ans.has(m.id))) stage(st, 600, () => quizReveal(st, room));
    io.to(room).emit('partyAnswered', { n: p.ans.size });
    io.to(id).emit('party', snap(st, room, id));
  }

  /* ---------- угадай слово ---------- */
  function hintOf(word, open) {
    const h = (w) => w.split('').map((c, i) => (open && i === 0 ? c : '_')).join(' ');
    return { en: h(word.en[0]), ru: h(word.ru[0]) };
  }
  function guessStart(st, room) {
    const p = st.party;
    const ids = shuffle(hsMembers(room).map(m => m.id));
    st.partyDrew = st.partyDrew || new Map();
    ids.sort((a, b) => (st.partyDrew.get(a) || 0) - (st.partyDrew.get(b) || 0));
    p.drawer = ids[0];
    st.partyDrew.set(p.drawer, Date.now());
    st.partyWords = st.partyWords || [];
    const wi = fresh(WORDS.length, st.partyWords);
    st.partyWords = st.partyWords.concat([wi]).slice(-Math.floor(WORDS.length / 2));
    p.word = WORDS[wi];
    p.alts = p.word.en.concat(p.word.ru).map(norm);
    p.strokes = []; p.npts = 0;
    p.guessed = new Set();
    p.hint = hintOf(p.word, false);
    p.stage = 'draw';
    p.t0 = Date.now();
    stage(st, GUESS.ms, () => guessEnd(st, room));
    later(st, GUESS.ms / 2, () => { if (p.stage === 'draw') { p.hint = hintOf(p.word, true); push(st, room); } });
    push(st, room);
  }
  function guessEnd(st, room) {
    const p = st.party;
    if (p.stage !== 'draw') return;
    p.stage = 'end';
    stage(st, GUESS.show, () => finish(st, room));
    push(st, room);
  }
  function guess(st, room, id, data) {
    const p = st.party;
    if (!p || p.g !== 'guess' || p.stage !== 'draw' || id === p.drawer || p.guessed.has(id) || !data) return;
    const t = norm(String(data.t || '').slice(0, 60));
    if (!t) return;
    if (p.alts.indexOf(t) === -1) {
      io.to(id).emit('partyNo', { close: t.length >= 3 && p.alts.some(a => a.length >= 4 && nearly(t, a)) });
      return;
    }
    const left = Math.max(0, p.until - Date.now());
    p.guessed.add(id);
    p.score.set(id, (p.score.get(id) || 0) + 100 + Math.round(100 * left / GUESS.ms));
    p.score.set(p.drawer, (p.score.get(p.drawer) || 0) + 50);
    io.to(room).emit('partyGuessed', { id, name: nameOf(id) });
    // угадали все, кроме рисующего, — слово открываем сразу
    if (hsMembers(room).every(m => m.id === p.drawer || p.guessed.has(m.id))) guessEnd(st, room);
    else push(st, room);
  }
  // штрих рисующего: n — начало новой линии, c — цвет, w — толщина, p — точки x,y,x,y…
  function draw(st, room, socket, data) {
    const p = st.party;
    if (!p || p.g !== 'guess' || p.stage !== 'draw' || socket.id !== p.drawer || !data || !Array.isArray(data.p)) return;
    const pts = data.p.slice(0, 80);
    if (pts.length < 2 || pts.length % 2) return;
    const s = { n: !!data.n, c: Math.max(0, Math.min(GUESS.colors - 1, num(data.c))), w: data.w === 1 ? 1 : 0,
                p: pts.map((v, i) => Math.max(0, Math.min(i % 2 ? GUESS.h : GUESS.w, num(v)))) };
    if (p.npts + s.p.length / 2 > GUESS.maxPts) return;
    p.npts += s.p.length / 2;
    p.strokes.push(s);
    socket.to(room).emit('partyStroke', s);
  }
  function clearBoard(st, room, id) {
    const p = st.party;
    if (!p || p.g !== 'guess' || p.stage !== 'draw' || id !== p.drawer) return;
    p.strokes = []; p.npts = 0;
    io.to(room).emit('partyClear');
  }

  /* ---------- строительная битва ---------- */
  function buildStart(st, room) {
    const p = st.party;
    st.partyThemes = st.partyThemes || [];
    const ti = fresh(THEMES.length, st.partyThemes);
    st.partyThemes = st.partyThemes.concat([ti]).slice(-Math.floor(THEMES.length / 2));
    p.theme = THEMES[ti];
    p.builds = new Map();
    p.order = [];
    p.vi = -1;
    p.votes = new Map();
    p.stage = 'build';
    stage(st, BUILD.ms, () => buildVote(st, room));
    push(st, room);
  }
  // своя модель целиком: строка BUILD.n² символов — номер цвета 0–9 или «.» (пусто)
  const PX = new RegExp('^[0-9.]{' + (BUILD.n * BUILD.n) + '}$');
  function build(st, room, id, data) {
    const p = st.party;
    if (!p || p.g !== 'build' || p.stage !== 'build' || !data || typeof data.px !== 'string' || !PX.test(data.px)) return;
    if (/[0-9]/.test(data.px)) p.builds.set(id, data.px); else p.builds.delete(id);
  }
  function buildVote(st, room) {
    const p = st.party;
    const here = new Set(hsMembers(room).map(m => m.id));
    p.order = shuffle(Array.from(p.builds.keys()).filter(id => here.has(id))).slice(0, BUILD.maxShow);
    p.order.forEach(id => p.votes.set(id, new Map()));
    p.vi = -1;
    showNext(st, room);
  }
  function showNext(st, room) {
    const p = st.party;
    p.vi++;
    if (p.vi >= p.order.length) return buildEnd(st, room);
    p.stage = 'vote';
    stage(st, BUILD.show, () => showNext(st, room));
    push(st, room);
  }
  function vote(st, room, id, data) {
    const p = st.party;
    if (!p || p.g !== 'build' || p.stage !== 'vote' || !data) return;
    const owner = p.order[p.vi], s = num(data.s);
    if (!owner || owner === id || s < 1 || s > 5) return;
    const v = p.votes.get(owner);
    v.set(id, s);
    io.to(id).emit('party', snap(st, room, id));
    // оценили все, кроме автора, — к следующей модели, не дожидаясь конца времени
    if (hsMembers(room).every(m => m.id === owner || v.has(m.id))) stage(st, 1500, () => showNext(st, room));
  }
  function buildEnd(st, room) {
    const p = st.party;
    p.votes.forEach((v, owner) => { let s = 0; v.forEach((x) => { s += x; }); p.score.set(owner, (p.score.get(owner) || 0) + s); });
    p.win = top(st, room);
    p.stage = 'end';
    p.vi = p.order.length;
    stage(st, BUILD.end, () => finish(st, room));
    push(st, room);
  }

  /* ---------- итог ---------- */
  // лучший по очкам среди тех, кто в комнате; ничья или ноль — без победителя
  function top(st, room) {
    const p = st.party;
    let best = null, k = 0, tie = false;
    hsMembers(room).forEach((m) => {
      const v = p.score.get(m.id) || 0;
      if (v > k) { k = v; best = m.id; tie = false; } else if (v === k && v > 0) tie = true;
    });
    return tie ? null : best;
  }
  function reveal(st, room) {
    const p = st.party;
    if (!p) return false;
    const w = top(st, room);
    io.to(room).emit('hsReveal', { variant: p.g, winnerName: w ? nameOf(w) : '',
      top: scoreList(st, room).slice(0, 5).map(x => ({ name: x.name, pts: x.pts })),
      word: p.word ? { en: p.word.en[0], ru: p.word.ru[0] } : null, theme: p.theme || null,
      px: p.g === 'build' && w ? p.builds.get(w) || null : null });
    return true;
  }
  // монеты и очко режима — победителю мини-игры (очки он мог набрать только играя)
  function award(st, room) {
    const p = st.party;
    const w = p && top(st, room);
    if (!w) return;
    const sock = io.sockets.sockets.get(w);
    const acct = sock && sessionName(sock.handshake.headers.cookie);
    if (!acct) return;
    credit(sock, acct, 1 + Math.floor(Math.random() * 5), 'hsWin');
    creditScore(acct);
  }
  // вошёл посреди мини-игры: с нулём очков, сразу видит, что идёт (и уже нарисованное)
  function join(st, room, id) {
    const p = st.party;
    if (!p || st.phase !== 'round') return;
    if (!p.score.has(id)) p.score.set(id, 0);
    io.to(id).emit('party', snap(st, room, id));
    if (p.g === 'guess' && p.strokes.length) io.to(id).emit('partyStrokes', { list: p.strokes });
  }
  // ушёл рисующий — слово открываем, раунд идёт к концу
  function leave(st, room, id) {
    const p = st.party;
    if (!p || st.phase !== 'round') return;
    if (p.g === 'guess' && p.stage === 'draw' && id === p.drawer) guessEnd(st, room);
  }
  return { GAMES, isGame, pick, roundMs, start, lobby, answer, guess, draw, clearBoard, build, vote, reveal, award, join, leave,
           QUESTIONS, WORDS, THEMES, BUILD, GUESS, QUIZ };
};
module.exports.isGame = isGame;
module.exports.QUESTIONS = QUESTIONS;
