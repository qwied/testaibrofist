// ============ DISCORD: HTTP API для бота ============
// Общий для updatesFeed.js и discordBot.js запрос к API Discord от имени
// бота (токен — DISCORD_BOT_TOKEN). Сам ждёт и повторяет при 429 и не
// шлёт запрос в «корзину» лимита, которая уже исчерпана: при чистке спама
// бот удаляет много сообщений подряд, и без этого Discord начал бы
// отвечать отказами.
// DISCORD_API_BASE подменяют только тесты (свой сервер вместо discord.com).
'use strict';
const https = require('https');
const http = require('http');

const BASE = String(process.env.DISCORD_API_BASE || 'https://discord.com/api/v10').replace(/\/+$/, '');
const TIMEOUT_MS = 15000;
const SITE = 'https://' + (String(process.env.PRIMARY_HOST || '').trim() || 'aibrofist.online');

const token = () => String(process.env.DISCORD_BOT_TOKEN || '').trim();

// лимиты Discord считаются по маршруту: /channels/1/messages и
// /channels/2/messages — разные «корзины», а id сообщений внутри — нет
function routeKey(method, p) {
  return method + ' ' + p.split('?')[0]
    .replace(/\/(channels|guilds|webhooks)\/(\d+)/, '/$1/$2')
    .replace(/\/(?!channels|guilds|webhooks)([a-z-]+)\/\d{5,}/g, '/$1/:id')
    .replace(/\/reactions\/.*/, '/reactions');
}
const waitUntil = new Map();      // корзина -> когда снова можно слать
let globalUntil = 0;

const sleep = ms => new Promise(ok => setTimeout(ok, ms));

/* Сообщение с файлами — multipart/form-data: JSON сообщения в поле
   payload_json и сами файлы в files[0], files[1], ... */
function multipart(body, files) {
  const boundary = 'aibrofist' + Date.now().toString(16) + Math.random().toString(16).slice(2);
  const parts = [];
  const head = (name, extra) => Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="' + name + '"' + extra + '\r\n');
  parts.push(head('payload_json', ''), Buffer.from('Content-Type: application/json\r\n\r\n' + JSON.stringify(body) + '\r\n'));
  files.forEach((f, i) => {
    const name = String(f.name || 'file').replace(/["\r\n]/g, '_');
    parts.push(head('files[' + i + ']', '; filename="' + name + '"'),
               Buffer.from('Content-Type: ' + (f.type || 'application/octet-stream') + '\r\n\r\n'), f.data, Buffer.from('\r\n'));
  });
  parts.push(Buffer.from('--' + boundary + '--\r\n'));
  return { data: Buffer.concat(parts), type: 'multipart/form-data; boundary=' + boundary };
}

function raw(method, p, body, opts) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + p);
    let data = null, type = 'application/json';
    if (opts && opts.files && opts.files.length) ({ data, type } = multipart(body || {}, opts.files));
    else if (body !== undefined && body !== null) data = JSON.stringify(body);
    const headers = {
      'Authorization': 'Bot ' + token(),
      'User-Agent': 'DiscordBot (' + SITE + ', 2.0)'
    };
    if (data !== null) {
      headers['Content-Type'] = type;
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    // причина действия видна модераторам в журнале аудита сервера
    if (opts && opts.reason) headers['X-Audit-Log-Reason'] = encodeURIComponent(String(opts.reason).slice(0, 400));
    const lib = url.protocol === 'http:' ? http : https;
    // family:4 — как в discordAuth.js: у хостинга бывает битый IPv6
    const req = lib.request(url, { method, family: 4, headers }, res => {
      let s = '';
      res.setEncoding('utf8');
      res.on('data', c => { s += c; });
      res.on('end', () => {
        let b = null;
        try { b = s ? JSON.parse(s) : null; } catch (e) { b = null; }
        resolve({ status: res.statusCode, body: b, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('Discord request timed out')));
    if (data !== null) req.write(data);
    req.end();
  });
}

/* Запрос к API. Возвращает { status, body } и не бросает исключений на
   ответы Discord — только на обрыв сети. До трёх повторов при 429.
   opts.reason — причина для журнала аудита, opts.files — файлы
   ({ name, data: Buffer, type }) к сообщению, opts.once — без ожидания:
   лимит исчерпан — сразу 429 (для фоновых запросов, которые можно
   повторить в следующий раз). */
async function api(method, p, body, opts) {
  const key = routeKey(method, p);
  const once = !!(opts && opts.once);
  for (let attempt = 0; attempt < (once ? 1 : 4); attempt++) {
    const wait = Math.max(globalUntil, waitUntil.get(key) || 0) - Date.now();
    if (wait > 0 && once) return { status: 429, body: null };
    if (wait > 0) await sleep(Math.min(wait, 60000));
    const r = await raw(method, p, body, opts);
    const h = r.headers || {};
    if (h['x-ratelimit-remaining'] === '0' && h['x-ratelimit-reset-after'])
      waitUntil.set(key, Date.now() + Math.ceil(parseFloat(h['x-ratelimit-reset-after']) * 1000));
    if (r.status !== 429) return { status: r.status, body: r.body };
    const after = Math.min(60, Number(r.body && r.body.retry_after) || Number(h['retry-after']) || 1);
    const until = Date.now() + Math.ceil(after * 1000) + 50;
    if (r.body && r.body.global) globalUntil = until; else waitUntil.set(key, until);
  }
  return { status: 429, body: null };
}

const ok = r => r && r.status >= 200 && r.status < 300;

/* Пост-карточка в рамке (новые компоненты Discord): заголовок, текст,
   картинки сеткой, тонкая линия, мелкая подпись и кнопка-ссылка внизу.
   У такого сообщения нет обычного текста и вставок (embeds), а упоминания
   в тексте карточки срабатывают — кого можно пинговать, решает mentions.
   o: { color, title, text, images: [url или attachment://имя], footer,
        button: { label, url } (ссылка) или { label, id } (кнопка бота), mentions } */
const COMPONENTS_V2 = 1 << 15;
function frame(o) {
  const inner = [];
  const title = String(o.title || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (title) inner.push({ type: 10, content: '## ' + title });
  // у всех текстов карточки вместе предел 4000 знаков
  const footer = o.footer ? String(o.footer).slice(0, 150) : '';
  const text = String(o.text || '').trim().slice(0, 3950 - title.length - footer.length);
  if (text) inner.push({ type: 10, content: text });
  const images = (o.images || []).filter(Boolean).slice(0, 10);
  if (images.length) inner.push({ type: 12, items: images.map(url => ({ media: { url } })) });
  if (footer) inner.push({ type: 14, divider: true, spacing: 1 }, { type: 10, content: '-# ' + footer });
  if (o.button) {
    const label = String(o.button.label).slice(0, 80);
    inner.push({ type: 1, components: [o.button.id ? { type: 2, style: 2, label, custom_id: o.button.id }
                                                   : { type: 2, style: 5, label, url: o.button.url }] });
  }
  if (!inner.length) inner.push({ type: 10, content: '​' });
  return { flags: COMPONENTS_V2, allowed_mentions: o.mentions || { parse: [] },
           components: [{ type: 17, accent_color: o.color, components: inner }] };
}

module.exports = { api, ok, token, SITE, routeKey, frame, COMPONENTS_V2 };
