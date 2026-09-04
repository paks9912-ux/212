#!/usr/bin/env node
/* Собирает приложение в один HTML-файл: стили и скрипты встраиваются внутрь.
   node tools/build-standalone.js [--artifact путь]   */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const JS = ['util', 'store', 'calc', 'views', 'detail', 'app'].map(n => read('js/' + n + '.js'));
let css = read('css/app.css');

// сервис-воркера в одном файле нет — регистрировать нечего
JS[5] = JS[5].replace(
  /\s*\/\* офлайн-кэш \*\/[\s\S]*?navigator\.serviceWorker\.register\('sw\.js'\)\.catch\(function \(\) \{ \}\);\s*\}/,
  ''
);

const tabs = `
<nav class="tabbar">
  <a href="#/"        data-tab="home"><span id="i-home"></span><span>Обзор</span></a>
  <a href="#/loans"   data-tab="loans"><span id="i-loans"></span><span>Займы</span></a>
  <a href="#/clients" data-tab="clients"><span id="i-clients"></span><span>Клиенты</span></a>
  <a href="#/more"    data-tab="more"><span id="i-more"></span><span>Ещё</span></a>
</nav>`;

const body = `<main id="screen"></main>${tabs}
<div id="toast"></div>

<style>
${css}</style>

<script>
${JS.join('\n')}
['home','loans','clients','more'].forEach(function(k){
  document.getElementById('i-'+k).innerHTML = V.ICON[k];
});
</script>`;

const artifactIdx = process.argv.indexOf('--artifact');
if (artifactIdx >= 0) {
  // для Artifact: без <html>/<head>/<body> — оболочку добавляет площадка
  const out = process.argv[artifactIdx + 1];
  fs.writeFileSync(out, `<title>Капитал</title>\n${body}\n`);
  console.log('собрано для Artifact →', out, (fs.statSync(out).size / 1024).toFixed(0) + ' КБ');
} else {
  const out = path.join(root, 'kapital-standalone.html');
  fs.writeFileSync(out, `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<title>Капитал — учёт займов</title>
<meta name="theme-color" content="#f2f2f7" id="theme-color">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Капитал">
<meta name="format-detection" content="telephone=no">
</head>
<body>
${body}
</body>
</html>
`);
  console.log('собрано →', out, (fs.statSync(out).size / 1024).toFixed(0) + ' КБ');
}
