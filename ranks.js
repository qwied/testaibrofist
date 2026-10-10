'use strict';
/* ══════════════════════════════════════════════════
   АВТОМАТИЧЕСКИЕ РАНГИ НАВЫКА (C … S и Declassified)
   ══════════════════════════════════════════════════

   Ранг должен отвечать на вопрос «насколько человек хорош», а не «сколько
   он наиграл». Поэтому в расчёт не идёт ни один накопительный счётчик:
   ни монеты, ни очки, ни число забегов. Всё, из чего складывается оценка,
   — это ДОЛИ и ОТНОШЕНИЯ, у которых есть потолок и которые нельзя поднять
   простым просиживанием.

   Рангов два, по одному на режим: в гонке и в прятках нужны совершенно
   разные умения, и сводить их в одно число нечестно к обоим.

   ── RACE ──────────────────────────────────────────
   Два сигнала, ровно те же, что в описании рангов у людей:

   1. СКОРОСТЬ — «спидранит», «проходит быстро». Меряем не секундами (они
      несравнимы между лёгкой и адской картой) и НЕ долей от рекорда, а
      МЕСТОМ среди всех, кто проходил ту же карту: обогнал всех — 1.0,
      оказался последним — 0. Так короткая карта и длинная весят одинаково.

      Почему именно место, а не доля от рекорда, — важно. Клиент считает
      физику сам, поэтому подделать один быстрый финиш можно всегда, и
      раньше такой финиш становился «рекордом карты». Это било не столько
      по самому обманщику, сколько по всем остальным: их время начинало
      делиться на полторы секунды, и вся карта обнулялась в ранге у
      честных игроков. Место так испортить нельзя — лишний быстрый
      результат сдвигает каждого ровно на одну позицию из N, и чем больше
      народу прошло карту, тем меньше он значит.

   2. ОХВАТ — «способен пройти 85% всех карт в игре». Сколько РАЗНЫХ карт
      человек довёл до финиша — но считаются только те, где есть с кем
      сравниваться (MIN_RUNNERS). Иначе охват набивался бы своими же
      картами, которые никто, кроме автора, не открывал. Потолок намеренно
      низкий (BREADTH_FULL): двух десятков разных карт достаточно, чтобы
      показать, что игрок не сидит на одной заученной трассе.

   ── HIDE AND SEEK ─────────────────────────────────
   Тоже два, и тоже прямо из описания:

   1. ВЫЖИВАЕМОСТЬ хайдером — доля раундов, которые человек дожил до конца.
      Это и есть «поймать такого игрока крайне трудно».

   2. ОХОТА сикером — сколько пойманных за раунд в роли искателя. По
      описанию игрок ранга B и выше «играя за сикера представляет угрозу
      даже профессионалу». Три поимки за раунд считаем отличным результатом
      и принимаем за потолок.

      Кто ни разу не был искателем, оценивается по одной выживаемости —
      роль в прятках выдаёт рулетка, и наказывать за то, что она не выпала,
      было бы нелепо.

   ── КАК ИЗ ЧИСЛА ПОЛУЧАЕТСЯ БУКВА ─────────────────
   Не фиксированными порогами, а МЕСТОМ СРЕДИ ОСТАЛЬНЫХ: S — это «лучшие
   несколько процентов», и такой ранг обязан оставаться редким сам по себе,
   без ручной подкрутки порогов каждый сезон.

   Но у чистых процентилей есть известная беда: в маленьком или слабом
   сообществе кто-то всё равно окажется «лучшим», даже если объективно он
   играет средне. Поэтому у каждой ступени есть ещё и АБСОЛЮТНЫЙ ПОЛ: не
   дотянул по самой оценке — опускаешься на ту ступень, чей пол проходишь,
   каким бы высоким ни было место. Ранг так нельзя получить просто потому,
   что рядом никого нет.

   Declassified — не «последнее место», а отдельный случай из описания:
   человек наиграл достаточно, чтобы о нём можно было судить, но не
   понимает игру настолько, что не проходит даже элементарное. Это
   абсолютное условие, а не процентиль.

   Пока сыграно слишком мало — ранга нет вовсе (unranked), а не C: выдавать
   оценку по двум раундам нечестно в обе стороны.
   ══════════════════════════════════════════════════ */

const BREADTH_FULL = 20;        // столько разных пройденных карт — полный охват
const CATCH_FULL = 3;           // поимок за раунд сикером — отличный результат
const RACE_MIN_FIN = 5;         // меньше — судить не о чем
const RACE_MIN_TRY = 15;        // столько начатых забегов — уже видно, доходит человек до финиша или нет
const RACE_DEAD_RATE = 0.1;     // доводит до конца меньше десятой части начатого
const HS_MIN_ROUNDS = 6;
const HS_MIN_SEEK = 3;          // меньше раундов охотником — считаем только выживаемость
const HS_DEAD_RATE = 0.05;      // переживает меньше двадцатой части раундов

/* Ступени сверху вниз: процентиль (доля игроков строго ниже) и абсолютный
   пол оценки. Первая ступень, где проходят ОБА условия, и есть ранг. */
const BANDS = [
  { rank: 'S',  pct: 0.98, floor: 0.80 },
  { rank: 'A+', pct: 0.93, floor: 0.70 },
  { rank: 'A',  pct: 0.83, floor: 0.60 },
  { rank: 'B+', pct: 0.65, floor: 0.48 },
  { rank: 'B',  pct: 0.40, floor: 0.35 },
  { rank: 'C+', pct: 0.15, floor: 0.20 },
  { rank: 'C',  pct: 0,    floor: 0 }
];

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/* ── МЕДАЛИ ЗА ВРЕМЯ НА КОНКРЕТНОЙ КАРТЕ ──────────────
   Это ВТОРАЯ, отдельная система поверх описанной выше: не процентиль среди
   игроков, а буква, которую сам разработчик назначает конкретной карте за
   конкретное время (см. /owner/setMapRankTiers в maps.js и панель в
   owner.js). В Race время — это время финиша (то же rcBest, которое уже
   хранится для процентиля). В Hide and Seek у карты нет единого «времени
   прохождения» — вместо этого считаются ДВЕ раздельные лестницы: сколько
   хайдер провёл живым за раунд (дольше — лучше) и сколько искателю
   потребовалось, чтобы поймать всех (быстрее — лучше); обе ведут к одной и
   той же букве и при расчёте общего ранга усредняются вместе, без разницы
   роли (см. medalAvgHs).

   Эти медали — не самостоятельный ранг, а ДОБАВКА к формуле процентиля
   выше: пока разработчик не расставил пороги ни на одной карте, которую
   человек проходил, добавка отсутствует и ранг считается ровно как раньше. */
const RANK_ORDER = BANDS.map((b) => b.rank);               // ['S','A+','A','B+','B','C+','C']
const MEDAL_WEIGHT = {}; BANDS.forEach((b) => { MEDAL_WEIGHT[b.rank] = b.floor; });

/* dir 'min' — чем МЕНЬШЕ время, тем лучше (финиш гонки, поймать всех
   искателем); dir 'max' — чем БОЛЬШЕ, тем лучше (прожил хайдером раунд).
   Идём от S к C — первый порог, который выполняется, и есть медаль;
   порядок, в котором пороги заданы в tiers, не важен. Ни один порог не
   выполнен (или лестница для этой роли не задана) — null: карту прошли,
   но на медаль не наиграли, это не ошибка. */
function rankForTime(tiers, ms, dir) {
  if (!Array.isArray(tiers) || !(ms >= 0)) return null;
  const byRank = {};
  tiers.forEach((t) => {
    if (t && RANK_ORDER.indexOf(t.rank) !== -1 && t.ms > 0) byRank[t.rank] = t.ms;
  });
  for (let i = 0; i < RANK_ORDER.length; i++) {
    const r = RANK_ORDER[i], cutoff = byRank[r];
    if (cutoff === undefined) continue;
    if (dir === 'max' ? ms >= cutoff : ms <= cutoff) return r;
  }
  return null;
}

// mapsByKey: Map("автор|имя карты" -> m.rankTiers), построенная один раз в build()
function medalAvgRace(u, mapsByKey) {
  const rcBest = (u.rcBest && typeof u.rcBest === 'object') ? u.rcBest : {};
  let sum = 0, n = 0;
  Object.keys(rcBest).forEach((mapKey) => {
    const ms = rcBest[mapKey];
    if (!(ms > 0)) return;
    const tiers = mapsByKey.get(mapKey);
    const raceTiers = tiers && tiers.race;
    if (!Array.isArray(raceTiers) || !raceTiers.length) return;
    const r = rankForTime(raceTiers, ms, 'min');
    if (!r) return;
    sum += MEDAL_WEIGHT[r]; n++;
  });
  return n ? sum / n : null;
}

function medalAvgHs(u, mapsByKey) {
  const best = (u.hsMapBest && typeof u.hsMapBest === 'object') ? u.hsMapBest : {};
  let sum = 0, n = 0;
  Object.keys(best).forEach((mapKey) => {
    const e = best[mapKey];
    const tiers = mapsByKey.get(mapKey);
    if (!e || !tiers) return;
    if (Array.isArray(tiers.hider) && tiers.hider.length && e.hiderMs > 0) {
      const r = rankForTime(tiers.hider, e.hiderMs, 'max');
      if (r) { sum += MEDAL_WEIGHT[r]; n++; }
    }
    if (Array.isArray(tiers.seeker) && tiers.seeker.length && e.seekerMs > 0) {
      const r = rankForTime(tiers.seeker, e.seekerMs, 'min');
      if (r) { sum += MEDAL_WEIGHT[r]; n++; }
    }
  });
  return n ? sum / n : null;
}

/* Все лучшие времена по каждой карте — поле, среди которого считается
   место. Карта идёт в зачёт, только если её прошло хотя бы MIN_RUNNERS
   человек: на карте, которую открывал один автор, «первое место» не
   значит ничего, и раньше именно так набивался ранг. */
const MIN_RUNNERS = 3;
function mapField(users) {
  const field = new Map();
  users.forEach((u) => {
    const r = u.rcBest;
    if (!r || typeof r !== 'object') return;
    Object.keys(r).forEach((k) => {
      const ms = r[k];
      if (!(ms > 0)) return;
      const list = field.get(k);
      if (list) list.push(ms); else field.set(k, [ms]);
    });
  });
  return field;
}

/* Declassified в гонке — это не «медленно», а «не доходит». Человек,
   прошедший десяток карт пусть и черепахой, игру всё-таки понимает, и
   описанию ранга («неспособен пройти даже самые элементарные уровни») не
   отвечает. Отвечает ему другой: карту за картой начинает и почти ни одну
   не доводит до финиша. Отличить одно от другого позволяет только счётчик
   попыток (см. raceTryStat в server.js). */
function raceDeclassified(u) {
  const tries = u.rcTry || 0;
  if (tries < RACE_MIN_TRY) return false;
  return ((u.rcFin || 0) / tries) < RACE_DEAD_RATE;
}

// оценка навыка в гонке, 0..1; null — сыграно слишком мало
function raceScore(u, field, mapsByKey) {
  /* Медали за время (см. выше) — про КОНКРЕТНЫЕ карты, которые разметил
     владелец, а не про то, сколько всего карт человек прошёл. Если общего
     опыта мало (ниже RACE_MIN_FIN/MIN_RUNNERS), это не должно прятать уже
     заработанную медаль: ранг тогда и есть сама медаль, без примеси
     процентиля. Раньше медаль пропадала целиком, пока человек не набегает
     общий минимум, — противоречило самому смыслу разметки "ранг даётся за
     определённые карты". */
  const medalAvg = mapsByKey ? medalAvgRace(u, mapsByKey) : null;
  if ((u.rcFin || 0) < RACE_MIN_FIN) return medalAvg;
  const r = (u.rcBest && typeof u.rcBest === 'object') ? u.rcBest : {};

  let sum = 0, n = 0;
  Object.keys(r).forEach((k) => {
    const mine = r[k], times = field.get(k);
    if (!(mine > 0) || !times || times.length < MIN_RUNNERS) return;
    // место среди прошедших ту же карту: 1 — быстрее всех, 0 — медленнее всех
    let slower = 0;
    for (let i = 0; i < times.length; i++) if (times[i] > mine) slower++;
    sum += slower / (times.length - 1);
    n++;
  });
  /* Ни одной карты, на которой есть с кем сравниться, — судить не о чем
     по процентилю. Но медаль за конкретную карту — это не процентиль,
     ей сравнение с другими не нужно, так что рангом остаётся она. */
  if (!n) return medalAvg;
  const base = clamp01(0.65 * (sum / n) + 0.35 * clamp01(n / BREADTH_FULL));
  // медали — добавка сверху, а не замена; нет медалей ни на одной
  // пройденной карте — оценка не меняется ни на сотую
  return medalAvg === null ? base : clamp01(0.75 * base + 0.25 * medalAvg);
}

/* Declassified в прятках: раундов сыграно достаточно, а не пережил
   практически ни одного — то самое «не понимает основных принципов». */
function hsDeclassified(u) {
  const hide = u.hsHide || 0;
  if (hide < HS_MIN_ROUNDS) return false;
  return ((u.hsSurv || 0) / hide) < HS_DEAD_RATE;
}

// оценка навыка в прятках, 0..1; null — сыграно слишком мало
function hsScore(u, mapsByKey) {
  // та же логика, что в raceScore: медаль за конкретную карту не должна
  // ждать общего минимума раундов — см. комментарий там
  const medalAvg = mapsByKey ? medalAvgHs(u, mapsByKey) : null;
  const hide = u.hsHide || 0;
  if (hide < HS_MIN_ROUNDS) return medalAvg;
  const surv = clamp01((u.hsSurv || 0) / hide);
  const seek = u.hsSeek || 0;
  const base = seek < HS_MIN_SEEK ? surv
    : clamp01(0.6 * surv + 0.4 * clamp01(((u.hsCat || 0) / seek) / CATCH_FULL));
  return medalAvg === null ? base : clamp01(0.75 * base + 0.25 * medalAvg);
}

/* Declassified НЕ выводится из самой оценки. Это отдельное условие на
   каждый режим (см. raceDeclassified и hsDeclassified): «наиграл, но
   элементарного не делает». Раньше сюда попадал любой, у кого оценка
   вышла около нуля, и медленный, но исправно доходящий до финиша игрок
   получал ранг «игру не понимает» — хотя он её как раз проходит. */
function bandFor(pct, score) {
  for (let i = 0; i < BANDS.length; i++) {
    const b = BANDS[i];
    if (pct >= b.pct && score >= b.floor) return b.rank;
  }
  return 'C';
}

/* Место среди всех, у кого вообще есть оценка в этом режиме: доля игроков
   строго ниже. У единственного игрока место лучшее, и уберечь его от
   незаслуженной «S» — работа абсолютного пола. */
function placeIn(sorted, score) {
  if (sorted.length < 2) return 1;
  let below = 0;
  for (let i = 0; i < sorted.length; i++) if (sorted[i] < score) below++;
  return below / (sorted.length - 1);
}

/* Ранги считаются по всей базе сразу (иначе не узнать ни рекордов карт, ни
   мест), поэтому результат держим минуту: страницы профиля и таблицы
   лидеров дёргают его часто, а меняется он медленно. */
let cache = null, cacheAt = 0;
const CACHE_MS = 60 * 1000;

function build(db) {
  const users = Object.values(db.users || {});
  const field = mapField(users);

  // карты с хоть одной лестницей порогов — ключ тот же "автор|имя карты",
  // которым уже адресуются rcBest/hsMapBest (см. maps.js/server.js)
  const mapsByKey = new Map();
  try {
    require('./maps.js').allMaps().forEach((m) => {
      if (m.rankTiers) mapsByKey.set(m.author + '|' + m.mapName, m.rankTiers);
    });
  } catch (e) { /* maps.js недоступен — считаем ранг без медалей */ }

  const race = new Map(), hs = new Map();
  users.forEach((u) => {
    const rs = raceScore(u, field, mapsByKey);
    if (rs !== null) race.set(u.name, rs);
    const hss = hsScore(u, mapsByKey);
    if (hss !== null) hs.set(u.name, hss);
  });

  const raceSorted = Array.from(race.values()).sort((a, b) => a - b);
  const hsSorted = Array.from(hs.values()).sort((a, b) => a - b);

  const out = new Map();
  users.forEach((u) => {
    const rs = race.get(u.name), hss = hs.get(u.name);
    const rDec = raceDeclassified(u), hDec = hsDeclassified(u);
    /* Ручная буква владельца (см. /owner/setRank в extras.js) подменяет
       только САМ ранг — счётчики (score/finishes/rounds/...) под ней
       остаются настоящими, не выдуманными, так что видно, что реально
       наиграно, даже если букву выставили руками. Если игр ещё нет совсем
       (rs/hss оба undefined, не declassified), ручная буква всё равно
       действует — это и есть «поставить ранг тому, кто внизу формулы не
       наберёт», прямая просьба, из-за которой эта подмена тут и есть. */
    const rOv = u.rankOverride && u.rankOverride.race;
    const hOv = u.rankOverride && u.rankOverride.hs;
    out.set(u.name.toLowerCase(), {
      race: (rs === undefined && !rDec && !rOv) ? null
        : { rank: rOv || (rDec ? 'Declassified' : bandFor(placeIn(raceSorted, rs), rs)),
            score: Math.round((rs || 0) * 100),
            finishes: u.rcFin || 0, maps: Object.keys(u.rcBest || {}).length,
            manual: !!rOv },
      raceProgress: { have: u.rcFin || 0, need: RACE_MIN_FIN },
      hs: (hss === undefined && !hDec && !hOv) ? null
        : { rank: hOv || (hDec ? 'Declassified' : bandFor(placeIn(hsSorted, hss), hss)),
            score: Math.round((hss || 0) * 100),
            rounds: u.hsHide || 0, survived: u.hsSurv || 0,
            seekRounds: u.hsSeek || 0, caught: u.hsCat || 0,
            manual: !!hOv },
      hsProgress: { have: u.hsHide || 0, need: HS_MIN_ROUNDS }
    });
  });
  return out;
}

function all(db) {
  if (cache && Date.now() - cacheAt < CACHE_MS) return cache;
  cache = build(db);
  cacheAt = Date.now();
  return cache;
}
function forName(db, name) {
  return all(db).get(String(name || '').toLowerCase())
    || { race: null, hs: null, raceProgress: { have: 0, need: RACE_MIN_FIN }, hsProgress: { have: 0, need: HS_MIN_ROUNDS } };
}
function invalidate() { cache = null; }

function register(app, currentUser, acc) {
  app.get('/getRank', (req, res) => {
    const name = String(req.query.name || '').trim();
    const u = name ? acc.getDb().users[acc.key(name)] : currentUser(req);
    if (!u) return res.json({ race: null, hs: null });
    const r = forName(acc.getDb(), u.name);
    res.json({ name: u.name, race: r.race, hs: r.hs, raceProgress: r.raceProgress, hsProgress: r.hsProgress });
  });
}

module.exports = { register, forName, all, invalidate,
                   raceScore, hsScore, bandFor, mapField,
                   raceDeclassified, hsDeclassified, BANDS,
                   RANK_ORDER, MEDAL_WEIGHT, rankForTime, medalAvgRace, medalAvgHs };
