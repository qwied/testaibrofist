/* Проверка кнопок без браузера.
   Ловит самый частый класс поломок: getElementById("X").addEventListener(...)
   при отсутствующем X. Такая строка бросает TypeError, и ВСЕ обработчики
   ниже по файлу не навешиваются — именно так «переставали работать кнопки». */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const pages = fs.readdirSync(DIR).filter(f => f.endsWith('.html'));

let problems = 0;

function inlineJs(html) {
  return [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).join('\n');
}
function externalJs(html) {
  return [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1]);
}
function idsIn(html) {
  const s = new Set();
  for (const m of html.matchAll(/\bid="([^"]+)"/g)) s.add(m[1]);
  return s;
}
function classesIn(html) {
  const s = new Set();
  for (const m of html.matchAll(/\bclass="([^"]+)"/g))
    m[1].split(/\s+/).forEach(c => c && s.add(c));
  return s;
}

for (const page of pages) {
  const html = fs.readFileSync(path.join(DIR, page), 'utf8');
  const ids = idsIn(html);
  const classes = classesIn(html);

  // элементы, которые страница создаёт сама в рантайме
  const created = new Set();
  const all = inlineJs(html);
  for (const m of all.matchAll(/\.id\s*=\s*["']([\w-]+)["']/g)) created.add(m[1]);
  for (const m of all.matchAll(/id="([\w-]+)"/g)) created.add(m[1]);
  // кнопки панелей создаются из списков вида ["bSave", SVG.save, "..."],
  // поэтому имя, встречающееся отдельным литералом, считаем созданным
  for (const m of all.matchAll(/\[\s*["']([\w-]+)["']\s*,/g)) created.add(m[1]);
  // и из вызовов-фабрик вида sBtn("bPlay", ...)
  for (const m of all.matchAll(/\(\s*["']([\w-]+)["']\s*,\s*SVG\./g)) created.add(m[1]);

  const scripts = [['(inline)', all]];
  for (const src of externalJs(html)) {
    const f = path.join(DIR, src.replace(/^\//, ''));
    if (fs.existsSync(f) && !src.includes('ejs')) {
      scripts.push([src, fs.readFileSync(f, 'utf8')]);
    }
  }

  for (const [name, code] of scripts) {
    // 1) getElementById("X").что-то  — без проверки на null
    for (const m of code.matchAll(/getElementById\(\s*["']([\w-]+)["']\s*\)\s*\./g)) {
      const id = m[1];
      if (ids.has(id) || created.has(id)) continue;
      // внешние скрипты работают на многих страницах — там нужна защита
      if (name !== '(inline)') continue;
      console.log(`  ✗ ${page} ${name}: getElementById("${id}") — такого id на странице нет`);
      problems++;
    }
    // 2) querySelector('.cls').что-то
    for (const m of code.matchAll(/querySelector\(\s*["']\.([\w-]+)["']\s*\)\s*\./g)) {
      const cls = m[1];
      if (classes.has(cls)) continue;
      if (name !== '(inline)') continue;
      console.log(`  ✗ ${page} ${name}: querySelector(".${cls}") — такого класса нет`);
      problems++;
    }
  }
}

// 3) внешние скрипты обязаны существовать
for (const page of pages) {
  const html = fs.readFileSync(path.join(DIR, page), 'utf8');
  for (const src of externalJs(html)) {
    if (/^https?:/.test(src)) continue;
    if (src.startsWith('/socket.io/')) continue;   // отдаёт сам socket.io
    const f = path.join(DIR, src.replace(/^\//, ''));
    if (!fs.existsSync(f)) {
      console.log(`  ✗ ${page}: подключён отсутствующий файл ${src}`);
      problems++;
    }
  }
  for (const m of html.matchAll(/<link[^>]*href="([^"]+\.css)"/g)) {
    const f = path.join(DIR, m[1].replace(/^\//, ''));
    if (!/^https?:/.test(m[1]) && !fs.existsSync(f)) {
      console.log(`  ✗ ${page}: подключён отсутствующий стиль ${m[1]}`);
      problems++;
    }
  }
}

// 4) все ссылки в меню ведут на существующие страницы
for (const page of pages) {
  const html = fs.readFileSync(path.join(DIR, page), 'utf8');
  for (const m of html.matchAll(/href="([^"#]+\.html)"/g)) {
    const t = m[1].replace(/^\//, '').split('?')[0];
    if (/^https?:/.test(m[1])) continue;
    // адреса вида /editor/index.html обрабатывает сервер редиректом
    const REDIRECTS = ['editor/index.html','editor/tutorial.html','skinEditor/index.html',
      'skinsBrowser/index.html','shop/index.html','avatar/index.html',
      'settings/index.html','supporters/index.html'];
    if (REDIRECTS.includes(t)) continue;
    if (!fs.existsSync(path.join(DIR, t))) {
      console.log(`  ✗ ${page}: ссылка на несуществующую страницу ${m[1]}`);
      problems++;
    }
  }
}

console.log(problems === 0
  ? '\nПроблем не найдено: все id, классы, скрипты, стили и ссылки на месте.'
  : `\nНайдено проблем: ${problems}`);
process.exit(problems ? 1 : 0);
