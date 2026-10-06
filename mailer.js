// ============ ПИСЬМА С КОДОМ ВХОДА ============
// Через Resend (api.resend.com) — чистый HTTPS-запрос, без новой зависимости
// в package.json. Пока RESEND_API_KEY не задан (например, при локальной
// разработке), письмо не отправляется, а код просто печатается в консоль —
// так весь флоу входа по коду можно проверить до появления реального ключа.
const https = require('https');

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const MAIL_FROM = process.env.MAIL_FROM || 'AIBROFIST <onboarding@resend.dev>';
// как в discordAuth.js — без таймаута при недоступности api.resend.com
// запрос висел бы вечно, и мы бы никогда не узнали, что письмо не ушло
const TIMEOUT_MS = 10000;

function sendCode(email, code) {
  return new Promise(resolve => {
    if (!RESEND_API_KEY) {
      console.log('[mailer] RESEND_API_KEY не задан — код для ' + email + ': ' + code);
      return resolve(true);
    }
    const payload = JSON.stringify({
      from: MAIL_FROM,
      to: [email],
      subject: 'Your AIBROFIST code: ' + code,
      html: '<p>Your sign-in code is <b>' + code + '</b>.</p><p>It expires in 10 minutes. '
          + 'If you didn’t request this, you can ignore this email.</p>'
    });
    const req = https.request('https://api.resend.com/emails', {
      method: 'POST', family: 4,
      headers: {
        'Authorization': 'Bearer ' + RESEND_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        if (!ok) console.error('[mailer] Resend rejected, status', res.statusCode, '-', data.slice(0, 300));
        else console.log('[mailer] sent to ' + email);
        resolve(ok);
      });
    });
    const t0 = Date.now();
    req.on('socket', socket => {
      console.log('[mailer] socket assigned +' + (Date.now() - t0) + 'ms');
      socket.on('lookup', (err, address, family) => {
        console.log('[mailer] dns lookup +' + (Date.now() - t0) + 'ms ->',
          err ? ('error: ' + err.message) : (address + ' (IPv' + family + ')'));
      });
      socket.on('connect', () => console.log('[mailer] tcp connected +' + (Date.now() - t0) + 'ms'));
    });
    req.on('error', e => { console.error('[mailer] request error:', e.message); resolve(false); });
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('Resend request timed out')));
    req.write(payload);
    req.end();
  });
}

module.exports = { sendCode };
