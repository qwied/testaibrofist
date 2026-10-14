// ============ DISCORD: что считается нарушением ============
// Чистые проверки одного сообщения, без сети: discordBot.js решает, что с
// найденным делать (удалить, дать штрафные баллы, замьютить). Каждая
// находка — { rule, weight, kind, note }: номер правила из discordRules.js,
// штрафные баллы и короткое описание для модераторов.
//
// Главное здесь — не наказывать зря. Поэтому слова-оскорбления ищутся
// целиком (а не кусками: «хачапури», «жидкий», «Нигерия», «night» не
// задевают), обычный мат не наказывается, капс — только у длинных
// сообщений, похожие на discord.com домены — только если это подделка,
// а не просто сайт со словом discord в имени.
'use strict';

const KIND = {
  flood:       { rule: 2, weight: 1, note: 'Sending messages too fast' },
  duplicate:   { rule: 2, weight: 1, note: 'Repeating the same message' },
  caps:        { rule: 2, weight: 1, note: 'Message in all caps' },
  mentions:    { rule: 2, weight: 1, note: 'Mass mentions' },
  emoji:       { rule: 2, weight: 1, note: 'Emoji spam' },
  chars:       { rule: 2, weight: 1, note: 'Long row of the same character' },
  lines:       { rule: 2, weight: 1, note: 'Wall of text' },
  zalgo:       { rule: 2, weight: 1, note: 'Glitch text' },
  invite:      { rule: 3, weight: 1, note: 'Invite to another server' },
  insult:      { rule: 1, weight: 1, note: 'Insulting another member' },
  slur:        { rule: 1, weight: 2, note: 'Slur or hate speech' },
  selfharm:    { rule: 1, weight: 2, note: 'Telling someone to hurt themselves' },
  'nsfw-link': { rule: 4, weight: 2, note: 'Link to an adult website' },
  'nsfw-image':{ rule: 4, weight: 2, note: 'Adult image' },
  'nsfw-text': { rule: 4, weight: 2, note: 'Sexual content' },
  'native-spam': { rule: 2, weight: 1, note: 'Spam blocked by Discord AutoMod' },
  'native-word': { rule: 1, weight: 1, note: 'Blocked by a server AutoMod rule' },
  cheat:       { rule: 7, weight: 1, note: 'Cheats or trading for real money' },
  politics:    { rule: 10, weight: 1, note: 'Politics' },
  'scam-text': { rule: 5, weight: 2, note: 'Known scam message' },
  'everyone-link': { rule: 5, weight: 2, note: 'Mass ping with a link' },
  'bad-name':  { rule: 9, weight: 1, note: 'Inappropriate name' },
  impersonation: { rule: 9, weight: 1, note: 'Pretending to be staff' },
  'nsfw-avatar': { rule: 4, weight: 2, note: 'Adult avatar' },
  evasion:     { rule: 11, weight: 0, note: 'Ban evasion with another account' },
  // без баллов: только сообщить владельцу (Discord запрещает аккаунты младше 13 лет)
  underage:    { rule: 12, weight: 0, note: 'Says they are under 13' },
  doxx:        { rule: 6, weight: 2, note: 'Posting an IP address' },
  badfile:     { rule: 5, weight: 2, note: 'Executable file' },
  scam:        { rule: 5, weight: 3, note: 'Scam or phishing link' },
  grabber:     { rule: 5, weight: 3, note: 'IP grabber link' }
};
const finding = (kind, extra) => Object.assign({ kind }, KIND[kind], extra || {});

/* ---------- нормализация текста ----------
   Обходы фильтров: «n1gg3r», «п1д0р», «n i g g e r», «n.i.g.g.e.r»,
   латинские буквы внутри русского слова и наоборот, «зальго». */
const STRIP = /[​-‏⁠-⁤﻿­]/g;            // невидимые символы
const MARKS = /\p{M}/gu;                                               // диакритика, «зальго»
const LEET_LAT = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b',
                   '@': 'a', '$': 's', '!': 'i', '|': 'i' };
const CYR_LAT = { 'а': 'a', 'в': 'b', 'е': 'e', 'ё': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o',
                  'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j' };
const LAT_CYR = { 'a': 'а', 'b': 'в', 'c': 'с', 'e': 'е', 'h': 'н', 'k': 'к', 'm': 'м', 'o': 'о',
                  'p': 'р', 't': 'т', 'x': 'х', 'y': 'у', 'u': 'и', 'n': 'п', 'r': 'г',
                  '0': 'о', '3': 'з', '4': 'ч', '6': 'б', '@': 'а', 'ё': 'е' };

function base(text) {
  return String(text || '')
    // «й» и «ё» — отдельные буквы, их не разбираем; у латиницы акценты снимаем
    .normalize('NFC').replace(MARKS, '')
    .replace(/[^\u0400-\u04FF]/gu, ch => ch.normalize('NFKD').replace(MARKS, ''))
    .replace(STRIP, '')
    .replace(/<a?:\w+:\d+>/g, ' ')        // свои эмодзи сервера
    .replace(/<[@#][!&]?\d+>/g, ' ')      // упоминания и каналы
    .replace(/https?:\/\/\S+/g, ' ')      // ссылки проверяются отдельно
    .toLowerCase();
}

// «n.i.g.g.e.r» и «n-i-g-g-e-r» -> «nigger»; одиночные буквы через пробел — тоже
function glue(s, letter, join) {
  const sep = new RegExp('(' + letter + ')[.\\-_*~\'`,]+(?=' + letter + ')', 'gu');
  s = s.replace(sep, '$1');
  s = s.replace(new RegExp('[^' + letter.slice(1, -1) + ']+', 'gu'), ' ');
  const words = s.split(' ').filter(Boolean);
  if (!join) return ' ' + words.join(' ') + ' ';
  const out = [];
  for (let i = 0; i < words.length; i++) {
    if (words[i].length === 1) {
      let j = i, run = '';
      while (j < words.length && words[j].length === 1) run += words[j++];
      if (run.length >= 3) { out.push(run); i = j - 1; continue; }
    }
    out.push(words[i]);
  }
  return ' ' + out.join(' ') + ' ';
}

// join=false — без склейки одиночных букв: «u r a idiot» должно остаться словами
function latinForm(text, join) {
  let s = '';
  for (const ch of base(text)) s += LEET_LAT[ch] || CYR_LAT[ch] || ch;
  return glue(s, '[a-z]', join !== false);
}

function cyrForm(text, join) {
  let s = '';
  for (const ch of base(text)) s += LAT_CYR[ch] || ch;
  return glue(s.replace(/ё/g, 'е'), '[а-я]', join !== false);
}

/* ---------- слова ----------
   Латинские шаблоны применяются к latinForm, русские — к cyrForm.
   Границы слов заданы явно: \b в JS не понимает кириллицу. */
const L = src => new RegExp('(?<![a-z])(?:' + src + ')(?![a-z])');
const C = src => new RegExp('(?<![а-я])(?:' + src + ')(?![а-я])', 'u');

const SLURS = [
  L('n+i+g{2,}(?:e+r+|a+h*|u+h*|e+r+z+|a+z+)s*'),
  L('f+a+g{1,2}(?:o+t+|i+t+)?s*'),
  L('r+e+t+a+r+d+(?:s|e+d|o+s?)?'),
  L('t+r+a+n+n+(?:y|i+e+)s*'),
  L('k+i+k+e+s*'),
  L('s+p+i+c+s*'),
  L('w+e+t+b+a+c+k+s*'),
  L('b+e+a+n+e+r+s*'),
  L('t+o+w+e+l+h+e+a+d+s*'),
  L('g+o+o+k+s*'),
  L('p+i+d+[oa]+r+[a-z]*|p+i+d+r+[a-z]*'),                 // транслит
  C('п+и+д+[оаеы]+р+[а-я]*|п+и+д+р+[а-я]*'),
  C('х+а+ч(?:и|ей|ик|ики|ику|ам|ами|ах|у|а|ом)?'),
  C('ч+у+р+к(?:а|и|е|у|ой|ам|ами|ах)?|ч+у+р+о+к'),
  C('ж+и+д(?:ы|ов|ам|ами|ах|у|а|ом|ок|ки|овск[а-я]*|яр[а-я]*)?'),
  C('н+и+г{2,}[еаэ]+р+[а-я]*|н+и+г+е+р(?:ы|ов|ам|ами|а|у|ок|ом)?|н+и+г{2,}а+'),
  C('х+о+х+л(?:ы|ов|ам|ами|ах|а|у|ом|ушк[а-я]*|яцк[а-я]*)?|х+о+х+о+л'),
  C('к+а+ц+а+п[а-я]*'),
  C('м+о+с+к+а+л(?:ь|и|ей|я|ям|ями|ях)?'),
  C('р+у+с+н(?:я|и|ю|ей)|р+а+ш+к(?:а|и|у|е|ой)|у+к+р+о+п(?:ы|ов|ам|ами|ах)|п+и+н+д+о+с[а-я]*')
];

const SELF_HARM = [
  L('kys|k+y+s+'),
  L('kill\\s+(?:your\\s*self|yo\\s*self|ur\\s*self|urself|yourselves)'),
  L('hope\\s+(?:you|u)\\s+die'),
  L('go\\s+(?:hang|kill)\\s+(?:your\\s*self|urself)'),
  C('убей(?:те)?\\s+себя|убейся|убейтесь|повесься|повесьтесь|выпились|выпилитесь|сдохни|сдохните|вскройся')
];

// оскорбление, обращённое к человеку: «ты дебил», «you idiot», «иди нахуй»
const INSULT_EN = 'idiots?|morons?|stupid|dumb|dumbass|retards?|losers?|bitch|whore|slut|cunt|dickhead|asshole|bastard|scum';
const INSULT_RU = 'дебил[а-я]*|идиот[а-я]*|тупой|тупая|тупица|урод[а-я]*|лох|лошар[а-я]*|чмо|мраз[а-я]*|' +
                  'твар[а-я]*|сука|шлюх[а-я]*|даун[а-я]*|дегенерат[а-я]*|долбо[её]б[а-я]*|долба[её]б[а-я]*|' +
                  'еблан[а-я]*|у[её]б[оа][кн][а-я]*|гнид[а-я]*|ничтожеств[а-я]*|кретин[а-я]*';
const DIRECTED = [
  L('(?:you|u|ur|you\\s+re|youre)\\s+(?:are\\s+|r\\s+|a\\s+|an\\s+|such\\s+a\\s+|so\\s+|a\\s+fucking\\s+|fucking\\s+){0,2}(?:' + INSULT_EN + ')'),
  L('f+u+c+k+\\s+(?:you|u|off)'),
  C('(?:ты|вы)\\s+(?:[а-я]+\\s+){0,2}(?:' + INSULT_RU + ')'),
  C('(?:иди|идите|пошел|пошла|пошли|пошёл)\\s+(?:на\\s*)?(?:хуй|хер|нахуй|нахер)|нахуй\\s+(?:иди|пошел|пошла)')
];
// при ответе или упоминании — только явные оскорбления-существительные
const NOUN_INSULT = [
  L('idiot|moron|dumbass|retard|loser|bitch|whore|slut|cunt|dickhead|asshole|bastard'),
  C('дебил|идиот|урод|лох|лошара|чмо|мразь|тварь|шлюха|даун|дегенерат|долбо[её]б|еблан|гнида|кретин')
];

/* ---------- ссылки ---------- */
const OFFICIAL = ['discord.com', 'discord.gg', 'discordapp.com', 'discordapp.net', 'discord.media',
  'discord.me', 'discord.io', 'discord.link', 'dsc.gg',
  'discord.new', 'discord.gift', 'discord.gifts', 'discordstatus.com', 'discord.dev', 'discord.co',
  'discords.com', 'disboard.org', 'discordbotlist.com', 'discord.js.org', 'discordjs.guide', 'discogs.com',
  'steamcommunity.com', 'steampowered.com', 'steamstatic.com', 'steam.tv', 'steamdeck.com',
  'roblox.com', 'rbxcdn.com', 'youtube.com', 'youtu.be', 'twitch.tv', 'github.com', 'tenor.com',
  'giphy.com', 'aibrofist.online', 'epicgames.com', 'minecraft.net', 'x.com', 'twitter.com',
  'reddit.com', 'imgur.com', 'google.com', 'wikipedia.org', 'tiktok.com', 'instagram.com'];
const BRANDS = [
  { name: 'discord', dist: 1 }, { name: 'discordapp', dist: 1 }, { name: 'steamcommunity', dist: 2 },
  { name: 'steampowered', dist: 2 }, { name: 'roblox', dist: 1 }
];
const SCAM_WORDS = /gift|nitro|free|airdrop|drop|promo|claim|giveaway|reward|bonus|event|login|verif|auth|account|trade|offer|skin|case|csgo|cs2|robux/;
const GRABBERS = ['grabify.link', 'iplogger.org', 'iplogger.com', 'iplogger.ru', 'iplogger.co', 'iplogger.info',
  '2no.co', 'yip.su', 'iplis.ru', 'blasze.tk', 'blasze.com', 'ps3cfw.com', 'bmwforum.co', 'leancoding.co',
  'spottyfly.com', 'stopify.co', 'freegiftcards.co', 'joinmy.site', 'curiouscat.club', 'catsnthings.fun',
  'catsnthing.com', 'ezstat.ru', 'lovebird.guru', 'trulove.guru', 'dateing.club', 'otherhalf.life',
  'shrekis.life', 'datasig.io', 'datauth.io', 'headshot.monster', 'gaming-at-my.best',
  'progaming.monster', 'yourmy.monster', 'screenshare.host', 'imageshare.best', 'screenshot.best',
  'gamingfun.me', 'crabrave.pw', 'quickmessage.us', 'sportshub.bar', 'fortnitechat.site',
  'fortnight.space', 'iplogger.one', 'ipgrabber.ru', 'grabify.icu'];
const NSFW_SITES = ['pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'redtube.com', 'youporn.com',
  'onlyfans.com', 'fansly.com', 'rule34.xxx', 'rule34.paheal.net', 'e621.net', 'nhentai.net', 'hanime.tv',
  'hentaihaven.xxx', 'brazzers.com', 'chaturbate.com', 'spankbang.com', 'eporner.com', 'tube8.com',
  'porn.com', 'xxx.com', 'stripchat.com', 'cam4.com', 'motherless.com', 'thisvid.com', 'gelbooru.com',
  'danbooru.donmai.us', 'hentai2read.com', 'pornpics.com', 'erome.com'];
const NSFW_TLD = /\.(?:xxx|porn|sex|adult|sexy)$/;
const BAD_EXT = /\.(?:exe|scr|bat|cmd|com|msi|vbs|vbe|ps1|jar|dll|lnk|hta|cpl|reg|pif|wsf|apk)$/i;
const INVITE = /(?:https?:\/\/)?(?:www\.)?(?:discord(?:app)?\.com\/invite|discord\.gg|dsc\.gg|discord\.me|discord\.io|invite\.gg|discord\.link)\/([a-z0-9-]{2,32})/gi;
const URL_RE = /(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,24})(?::\d+)?(\/[^\s<>"')]*)?/gi;

const onDomain = (host, list) => list.some(d => host === d || host.endsWith('.' + d));

function links(content) {
  const out = [];
  const text = String(content || '').normalize('NFKC').replace(STRIP, '').toLowerCase();
  let m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text))) {
    const host = m[1].replace(/^www\./, '');
    // «hello.world» без схемы — тоже домен; ложных срабатываний это не даёт,
    // потому что дальше хосты сверяются со списками и подделками
    out.push({ host, path: m[2] || '', explicit: /^https?:/.test(m[0]) });
  }
  return out;
}

// Расстояние Дамерау — Левенштейна: перестановка соседних букв считается за одну ошибку
function dist(a, b) {
  const d = [];
  for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    const c = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}

const CONFUSE = [['rn', 'm'], ['vv', 'w'], ['cl', 'd'], ['0', 'o'], ['1', 'i'], ['l', 'i'], ['3', 'e'], ['4', 'a'], ['5', 's']];
const unconfuse = s => CONFUSE.reduce((acc, [a, b]) => acc.split(a).join(b), s);

// подделка под известный сайт: «dlscord.gift», «steamcommunlty.com», «discord-nitro.ru»
function isPhish(host, path, text) {
  if (onDomain(host, OFFICIAL)) return false;
  const labels = host.split('.');
  const sld = labels.length > 1 ? labels[labels.length - 2] : labels[0];
  const joined = sld.replace(/-/g, '');
  const scammy = SCAM_WORDS.test(host) || SCAM_WORDS.test(path) ||
                 /nitro|gift|free|бесплатн|раздач|airdrop|giveaway/i.test(text);
  // discord.com.ru, steamcommunity.com.ua — настоящее имя, а дальше чужой домен
  for (let i = 0; i < labels.length - 2; i++) {
    if (BRANDS.some(b => labels[i].replace(/-/g, '') === b.name) && /^(?:com|net|org|gg|gift|app)$/.test(labels[i + 1]))
      return true;
  }
  for (const b of BRANDS) {
    if (joined === b.name) return true;                                    // steamcommunity.ru
    if (joined.indexOf(b.name) !== -1) { if (scammy) return true; continue; } // discord-nitro.com
    const norm = unconfuse(joined);
    if (norm !== joined && norm.indexOf(unconfuse(b.name)) !== -1) return true;  // dlscord, disc0rd
    for (const part of new Set([joined].concat(sld.split('-')))) {
      if (part.length < 4 || Math.abs(part.length - b.name.length) > b.dist) continue;
      const k = dist(unconfuse(part), unconfuse(b.name));
      if (k > 0 && k <= b.dist) return true;                               // dicsord, steamcommnuity
    }
  }
  return false;
}

function checkLinks(content) {
  const res = [];
  const text = String(content || '').toLowerCase();
  for (const l of links(content)) {
    if (onDomain(l.host, GRABBERS)) res.push(finding('grabber', { detail: l.host }));
    else if (isPhish(l.host, l.path, text)) res.push(finding('scam', { detail: l.host }));
    else if (onDomain(l.host, NSFW_SITES) || NSFW_TLD.test(l.host)) res.push(finding('nsfw-link', { detail: l.host }));
    else if (l.explicit && BAD_EXT.test(l.path)) res.push(finding('badfile', { detail: l.host + l.path.slice(0, 60) }));
  }
  return res;
}

function inviteCodes(content) {
  const codes = [];
  let m;
  INVITE.lastIndex = 0;
  const text = String(content || '').normalize('NFKC').replace(STRIP, '');
  while ((m = INVITE.exec(text))) if (codes.indexOf(m[1]) === -1) codes.push(m[1]);
  return codes;
}

/* ---------- спам в одном сообщении ---------- */
const EMOJI = /\p{Extended_Pictographic}/gu;
const CUSTOM_EMOJI = /<a?:\w+:\d+>/g;

function checkSpam(msg) {
  const content = String(msg.content || '');
  const res = [];
  const plain = content.replace(/```[\s\S]*?```/g, ' ').replace(/https?:\/\/\S+/g, ' ')
                       .replace(/<a?:\w+:\d+>/g, ' ').replace(/<[@#][!&]?\d+>/g, ' ');
  const letters = (plain.match(/\p{L}/gu) || []).length;
  const upper = (plain.match(/\p{Lu}/gu) || []).length;
  if (letters >= 15 && upper / letters >= 0.75) res.push(finding('caps'));
  const people = new Set((msg.mentions || []).map(u => u && u.id).filter(Boolean));
  const roles = new Set(msg.mention_roles || []);
  if (people.size + roles.size >= 5) res.push(finding('mentions'));
  const emoji = (content.match(EMOJI) || []).length + (content.match(CUSTOM_EMOJI) || []).length;
  if (emoji >= 12) res.push(finding('emoji'));
  if (/(\S)\1{14,}/u.test(plain.replace(/\s+/g, ''))) res.push(finding('chars'));
  if ((content.match(/\n/g) || []).length >= 25) res.push(finding('lines'));
  if ((content.match(/\p{Mn}/gu) || []).length >= 12) res.push(finding('zalgo'));
  return res;
}

/* ---------- слова ---------- */
function checkWords(msg) {
  const content = msg.content || '';
  const forms = [latinForm(content), latinForm(content, false), cyrForm(content), cyrForm(content, false)];
  const test = re => forms.some(f => re.test(f));
  const res = [];
  if (SLURS.some(test)) res.push(finding('slur'));
  if (SELF_HARM.some(test)) res.push(finding('selfharm'));
  const aimed = (msg.mentions && msg.mentions.length) || !!msg.message_reference;
  if (DIRECTED.some(test) || (aimed && NOUN_INSULT.some(test))) res.push(finding('insult'));
  return res;
}

/* ---------- личные данные ----------
   IP-адрес чужого компьютера — это деанон. Адрес игрового сервера с
   портом или с пояснением «server/сервер» за нарушение не считаем. */
const IPV4 = /(?<![\d.])((?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3})(?![\d.]|\s*:\s*\d)/g;
function isPrivateIp(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || a >= 224 || (a === 192 && b === 168) ||
         (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}
function checkPrivacy(msg) {
  const content = String(msg.content || '');
  if (/server|сервер|minecraft|\bmc\b|port|порт|vps|dns|host|хост|version|версия|\bv\d/i.test(content)) return [];
  let m;
  IPV4.lastIndex = 0;
  while ((m = IPV4.exec(content))) {
    if (!isPrivateIp(m[1]) && Number(m[1].split('.')[0]) >= 11) return [finding('doxx')];
  }
  return [];
}

/* ---------- вложения ---------- */
function checkFiles(msg) {
  for (const a of msg.attachments || []) {
    if (a && BAD_EXT.test(String(a.filename || ''))) return [finding('badfile', { detail: String(a.filename).slice(0, 80) })];
  }
  return [];
}

/* ---------- правила 5, 7, 10, 12: мошенничество, читы, политика, возраст ----------
   Работают по исходному тексту (знаки денег, цифры возраста важны), с
   границами слов и для кириллицы. */
const B = src => new RegExp('(?<![a-zа-яё0-9])(?:' + src + ')(?![a-zа-яё0-9])', 'iu');
const SELL = B('продам|продаю|продаём|куплю|покупаю|скупаю|обменяю|sell|selling|buy|buying|trade|trading|wts|wtb');
const GOODS = B('акк|акка|акков|аккаунт[а-я]*|монет[а-я]*|коин[а-я]*|account|accounts|acc|accs|coins?');
const MONEY = /(?:руб|₽|грн|\$|usd|долл|евро|€|деньг|реал|paypal|qiwi|киви|сбер|на\s*карт|донат|money|cash|venmo|crypto|btc|usdt)/i;
const CHEAT = B('чит|читы|читов|хак|хаки|взлом[а-я]*|инжектор[а-я]*|аимбот|aimbot|wallhack|speedhack|спидхак|дюп|cheat|cheats|hack|hacks|injector|exploit|dupe');
const SHARE = B('скачать|скачай|ссылк[а-я]*|раздаю|продаю|бесплатн[а-я]*|кидаю|download|free|selling|sell');
const POLITICS = B('путин[а-я]*|зеленск[а-я]*|лукашенк[а-я]*|навальн[а-я]*|байден[а-я]*|трамп(?:а|у|ом|е)?|сво|спецоперац[а-я]*|мобилизац[а-я]*|' +
                   'putin|zelensk[a-z]*|lukashenk[a-z]*|navaln[a-z]*|biden|trump|' +
                   'войн[аеуыо]\\s+(?:с|на|в)\\s+(?:украин[а-я]*|росси[а-я]*)|(?:war\\s+in|war\\s+with)\\s+(?:ukraine|russia)|слава\\s+украине');
const SCAM_TEXT = [
  /(?:accidentally|accidently|mistakenly)\s+report(?:ed)?\s+(?:you|u|your)/i,
  /случайно\s+(?:кинул|отправил|подал|зарепортил|пожаловался)[а-я]*\s+(?:на\s+тебя|репорт|жалоб)/i,
  /(?:free|бесплатн[а-я]*)\s+(?:discord\s+)?(?:nitro|нитро)/i
];
const AGE = [/мне\s+(\d{1,2})\s*(?:лет|год|годик)/i, /(?:i\s+am|i'?m)\s+(\d{1,2})\s*(?:years?\s*old|y\/?o|yrs?\s*old)/i];

function checkRules(msg) {
  const text = String(msg.content || '').normalize('NFKC').replace(STRIP, '').toLowerCase();
  const res = [];
  if (SCAM_TEXT.some(re => re.test(text))) res.push(finding('scam-text'));
  if (/@(?:everyone|here)/.test(text) && links(text).length) res.push(finding('everyone-link'));
  if ((SELL.test(text) && GOODS.test(text) && MONEY.test(text)) || (CHEAT.test(text) && SHARE.test(text))) res.push(finding('cheat'));
  if (POLITICS.test(text)) res.push(finding('politics'));
  for (const re of AGE) {
    const m = re.exec(text);
    if (m && +m[1] >= 5 && +m[1] <= 12) { res.push(finding('underage')); break; }
  }
  return res;
}

/* ---------- имена (правило 9) ----------
   Ник проверяется при входе на сервер и при каждой смене. Оскорбление или
   ссылка в нике и «Admin»/«Модератор» — новый ник и балл; значки в начале
   (чтобы стоять первым в списке) и нечитаемый ник — просто новый ник. */
const STAFF_WORDS = /^(?:admin|administrator|moderator|staff|owner|support|system|aibrofist|админ|администратор|модератор|модер|владелец|поддержка|система)$/;
function checkName(name, opts) {
  opts = opts || {};
  const n = String(name || '');
  if (!n.trim()) return null;
  const words = checkWords({ content: n });
  if (words.some(f => f.kind === 'slur' || f.kind === 'insult' || f.kind === 'selfharm') ||
      inviteCodes(n).length || checkLinks(n).length || /https?:\/\/|discord\.gg/i.test(n))
    return { kind: 'bad-name' };
  const tokens = (latinForm(n, false) + ' ' + cyrForm(n, false)).split(/\s+/).filter(Boolean);
  const flat = latinForm(n).replace(/\s+/g, '');
  const owner = opts.owner ? latinForm(opts.owner).replace(/\s+/g, '') : '';
  if (tokens.some(t => STAFF_WORDS.test(t)) || (owner.length >= 3 && flat === owner)) return { kind: 'impersonation' };
  const marks = (n.match(/\p{M}/gu) || []).length;
  const readable = n.replace(/[^\p{L}\p{N}]/gu, '');
  if (marks >= 5 || !readable.length) return { kind: 'unreadable' };
  if (/^[^\p{L}\p{N}]/u.test(n)) return { kind: 'hoist', clean: n.replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 32) };
  return null;
}

/* Все проверки, которые можно сделать сразу, по одному сообщению.
   opts.allowAds — канал для саморекламы, opts.nsfw — канал 18+.
   Возвращает самые тяжёлые находки первыми. */
function inspect(msg, opts) {
  opts = opts || {};
  let res = [].concat(checkLinks(msg.content), checkFiles(msg), checkWords(msg), checkPrivacy(msg), checkRules(msg), checkSpam(msg));
  if (opts.nsfw) res = res.filter(f => f.rule !== 4);
  return res.sort((a, b) => b.weight - a.weight);
}

/* ---------- флуд и повторы по нескольким сообщениям ----------
   Помним последние сообщения каждого игрока за минуту. Флуд — 6 и больше
   сообщений за 6 секунд; повтор — один и тот же текст 3 раза за минуту,
   в том числе в разных каналах (так обычно пишут взломанные аккаунты). */
class FloodWatch {
  constructor(opts) {
    opts = opts || {};
    this.count = opts.count || 6;
    this.window = opts.window || 6000;
    this.dupCount = opts.dupCount || 3;
    this.dupWindow = opts.dupWindow || 60000;
    this.users = new Map();
  }

  add(key, m) {
    const now = m.t || Date.now();
    let list = (this.users.get(key) || []).filter(x => now - x.t < this.dupWindow);
    const text = String(m.content || '').toLowerCase().replace(/\s+/g, ' ').trim() +
                 (m.attachments || []).map(a => '|' + a.size + ':' + a.filename).join('');
    list.push({ id: m.id, channel: m.channel_id, t: now, text, done: false });
    if (list.length > 30) list = list.slice(-30);
    this.users.set(key, list);
    const recent = list.filter(x => now - x.t < this.window);
    if (recent.length >= this.count) {
      const ids = recent.filter(x => !x.done);
      recent.forEach(x => { x.done = true; });
      return { kind: 'flood', messages: ids.map(x => ({ id: x.id, channel: x.channel })) };
    }
    if (text.length >= 6) {
      const same = list.filter(x => x.text === text);
      if (same.length >= this.dupCount) {
        const ids = same.filter(x => !x.done);
        same.forEach(x => { x.done = true; });
        return { kind: 'duplicate', messages: ids.map(x => ({ id: x.id, channel: x.channel })) };
      }
    }
    return null;
  }

  sweep(now) {
    now = now || Date.now();
    for (const [k, list] of this.users) if (!list.length || now - list[list.length - 1].t > this.dupWindow) this.users.delete(k);
  }
}

module.exports = {
  KIND, finding, inspect, checkLinks, checkSpam, checkWords, checkPrivacy, checkFiles, checkRules, checkName,
  inviteCodes, links, isPhish, latinForm, cyrForm, FloodWatch, dist
};
