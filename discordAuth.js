// ============ ВХОД ЧЕРЕЗ DISCORD (OAuth2) ============
// Обмен кода на токен и получение профиля — обычные HTTPS-запросы к API
// Discord, без новой npm-зависимости.
const https = require('https');

// 10 секунд — иначе при недоступности api.discord.com запрос висел бы
// вечно (у https.request нет таймаута по умолчанию), а с ним и весь
// /auth/discord/callback: страница в браузере грузилась бы бесконечно.
const TIMEOUT_MS = 10000;

/* family:4 — на части хостингов исходящий IPv6-маршрут битый (пакеты
   уходят в никуда), а Node по умолчанию пробует его первым. Внешне это
   выглядит как «зависает, потом таймаут» ровно на тех хостах, где
   IPv6-попытка не проваливается мгновенно. IPv4 тут не компромисс —
   он и так единственный реальный путь наружу. */
function instrument(req, label) {
  const t0 = Date.now();
  req.on('socket', socket => {
    console.log('[discordAuth]', label, 'socket assigned +' + (Date.now() - t0) + 'ms');
    socket.on('lookup', (err, address, family) => {
      console.log('[discordAuth]', label, 'dns lookup +' + (Date.now() - t0) + 'ms ->',
        err ? ('error: ' + err.message) : (address + ' (IPv' + family + ')'));
    });
    socket.on('connect', () => {
      console.log('[discordAuth]', label, 'tcp connected +' + (Date.now() - t0) + 'ms');
    });
  });
}

function post(url, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(u, {
      method: 'POST', family: 4,
      headers: Object.assign({ 'Content-Length': Buffer.byteLength(body) }, headers)
    }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data || '{}') }); }
        catch (e) {
          console.error('[discordAuth] non-JSON response, status', res.statusCode, '-', data.slice(0, 300));
          reject(e);
        }
      });
    });
    instrument(req, 'POST ' + u.pathname);
    req.on('error', reject);
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('Discord request timed out')));
    req.write(body);
    req.end();
  });
}

function get(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', family: 4, headers: headers }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data || '{}') }); }
        catch (e) {
          console.error('[discordAuth] non-JSON response, status', res.statusCode, '-', data.slice(0, 300));
          reject(e);
        }
      });
    });
    instrument(req, 'GET ' + url);
    req.on('error', reject);
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('Discord request timed out')));
    req.end();
  });
}

// успех -> тело ответа Discord; неудача -> null, причина уже залогирована
async function exchangeCode(code, redirectUri) {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID || '',
    client_secret: process.env.DISCORD_CLIENT_SECRET || '',
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: redirectUri
  }).toString();
  const r = await post('https://discord.com/api/oauth2/token', params,
    { 'Content-Type': 'application/x-www-form-urlencoded' });
  if (r.status < 200 || r.status >= 300) {
    console.error('[discordAuth] token exchange rejected, status', r.status, '-', JSON.stringify(r.body));
    return null;
  }
  return r.body;
}

async function fetchProfile(accessToken) {
  const r = await get('https://discord.com/api/users/@me', { 'Authorization': 'Bearer ' + accessToken });
  if (r.status < 200 || r.status >= 300) {
    console.error('[discordAuth] profile fetch rejected, status', r.status, '-', JSON.stringify(r.body));
    return null;
  }
  return r.body;
}

module.exports = { exchangeCode, fetchProfile };
