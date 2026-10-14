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

function raw(method, p, body, opts) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + p);
    const data = body === undefined || body === null ? null : JSON.stringify(body);
    const headers = {
      'Authorization': 'Bot ' + token(),
      'User-Agent': 'DiscordBot (' + SITE + ', 2.0)'
    };
    if (data !== null) {
      headers['Content-Type'] = 'application/json';
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
   ответы Discord — только на обрыв сети. До трёх повторов при 429. */
async function api(method, p, body, opts) {
  const key = routeKey(method, p);
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = Math.max(globalUntil, waitUntil.get(key) || 0) - Date.now();
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

module.exports = { api, ok, token, SITE, routeKey };
