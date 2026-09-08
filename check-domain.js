#!/usr/bin/env node
/* Проверка домена перед подключением к Railway.
   Запуск:  node check-domain.js aibrofist.pp.ua

   Смотрит ровно то, что требует Railway:
     · CNAME с домена на *.up.railway.app
     · TXT-запись подтверждения владения
     · отвечает ли сайт по HTTPS
   и объясняет, что делать, если чего-то нет. */

const dns = require('dns').promises;
const https = require('https');

const domain = (process.argv[2] || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

if (!domain) {
  console.log('Укажите домен:  node check-domain.js aibrofist.pp.ua');
  process.exit(1);
}

const ok = s => '  \u2713 ' + s;
const no = s => '  \u2717 ' + s;
const hm = s => '  ? ' + s;

async function cname(name) {
  try { return await dns.resolveCname(name); }
  catch (e) { return { err: e.code || e.message }; }
}
async function txt(name) {
  try { return (await dns.resolveTxt(name)).map(a => a.join('')); }
  catch (e) { return { err: e.code || e.message }; }
}
async function a(name) {
  try { return await dns.resolve4(name); }
  catch (e) { return { err: e.code || e.message }; }
}

function head(url) {
  return new Promise(res => {
    const r = https.request(url, { method: 'GET', timeout: 12000 }, resp => {
      let body = '';
      resp.on('data', c => { if (body.length < 400) body += c; });
      resp.on('end', () => res({ status: resp.statusCode, headers: resp.headers, body }));
    });
    r.on('error', e => res({ err: e.code || e.message }));
    r.on('timeout', () => { r.destroy(); res({ err: 'timeout' }); });
    r.end();
  });
}

(async () => {
  console.log('\nДомен: ' + domain + '\n');

  // ---------- 1. CNAME ----------
  console.log('1. CNAME (куда идёт трафик)');
  const c = await cname(domain);
  if (c.err === 'ENOTFOUND' || c.err === 'ENODATA') {
    const ip = await a(domain);
    if (Array.isArray(ip)) {
      console.log(no('стоит A-запись на ' + ip.join(', ') + ', а Railway нужен CNAME'));
      console.log('    Замените A-запись на CNAME — у Railway плавающий адрес,');
      console.log('    привязка к IP рано или поздно отвалится.');
    } else {
      console.log(no('CNAME не найден (' + c.err + ')'));
      console.log('    В панели nic.ua добавьте: тип CNAME, имя @ или поддомен,');
      console.log('    значение — адрес из Railway вида xxxx.up.railway.app');
    }
  } else if (c.err) {
    console.log(no('не удалось проверить: ' + c.err));
  } else {
    const target = c.join(', ');
    if (/railway\.app\.?$/.test(c[0])) console.log(ok('CNAME → ' + target));
    else {
      console.log(hm('CNAME → ' + target));
      console.log('    Это не похоже на адрес Railway (*.up.railway.app).');
    }
  }

  // ---------- 2. TXT подтверждения ----------
  console.log('\n2. TXT (подтверждение владения — без него Railway отдаёт 404)');
  const roots = [domain, '_acme-challenge.' + domain];
  let found = false;
  for (const n of roots) {
    const t = await txt(n);
    if (Array.isArray(t) && t.length) {
      found = true;
      t.forEach(v => console.log(ok(n + '  →  ' + (v.length > 60 ? v.slice(0, 57) + '…' : v))));
    }
  }
  if (!found) {
    console.log(no('TXT-записей не найдено'));
    console.log('    Railway показывает TXT рядом с CNAME при добавлении домена.');
    console.log('    Добавьте её тем же способом в панели nic.ua.');
  }

  // ---------- 3. сам сайт ----------
  console.log('\n3. Ответ сайта по HTTPS');
  const r = await head('https://' + domain + '/');
  if (r.err) {
    console.log(no('не отвечает: ' + r.err));
    console.log('    После добавления записей подождите: DNS расходится');
    console.log('    обычно за 10–30 минут, изредка дольше. Сертификат');
    console.log('    Railway выпустит сам, когда увидит TXT.');
  } else if (r.status === 404) {
    console.log(no('404 — домен добавлен, но владение ещё не подтверждено'));
    console.log('    Почти всегда это отсутствующая или неверная TXT-запись.');
  } else if (r.status >= 300 && r.status < 400) {
    console.log(hm('редирект ' + r.status + ' → ' + (r.headers.location || '?')));
  } else if (r.status === 200) {
    const game = /AIBROFIST|brofist/i.test(r.body);
    console.log(ok('200 OK' + (game ? ' — это ваша игра' : '')));
    if (!game) console.log('    Страница открылась, но на игру не похожа — проверьте сервис в Railway.');
  } else {
    console.log(hm('код ответа ' + r.status));
  }

  console.log('\nГотово. Если всё с галочками — домен подключён.\n');
})();
