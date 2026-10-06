// ============ ПИСЬМА С КОДОМ ВХОДА ============
// Через Resend (api.resend.com) — чистый HTTPS-запрос, без новой зависимости
// в package.json. Пока RESEND_API_KEY не задан (например, при локальной
// разработке), письмо не отправляется, а код просто печатается в консоль —
// так весь флоу входа по коду можно проверить до появления реального ключа.
const https = require('https');

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const MAIL_FROM = process.env.MAIL_FROM || 'AIBROFIST <onboarding@resend.dev>';

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
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + RESEND_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      res.on('data', () => {});
      res.on('end', () => resolve(res.statusCode >= 200 && res.statusCode < 300));
    });
    req.on('error', () => resolve(false));
    req.write(payload);
    req.end();
  });
}

module.exports = { sendCode };
