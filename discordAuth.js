// ============ ВХОД ЧЕРЕЗ DISCORD (OAuth2) ============
// Обмен кода на токен и получение профиля — обычные HTTPS-запросы к API
// Discord, без новой npm-зависимости.
const https = require('https');

function post(url, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(u, {
      method: 'POST',
      headers: Object.assign({ 'Content-Length': Buffer.byteLength(body) }, headers)
    }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data || '{}') }); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function get(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', headers: headers }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data || '{}') }); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

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
  return r.status >= 200 && r.status < 300 ? r.body : null;
}

async function fetchProfile(accessToken) {
  const r = await get('https://discord.com/api/users/@me', { 'Authorization': 'Bearer ' + accessToken });
  return r.status >= 200 && r.status < 300 ? r.body : null;
}

module.exports = { exchangeCode, fetchProfile };
