#!/usr/bin/env node
/* Собирает концепт в один HTML-файл: картинки встраиваются как data: URI.
   Нужно для публикации артефактом, где внешних файлов нет.
   node tools/build-standalone.js [файл-назначения]   */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const out = process.argv[2] || path.join(root, 'concept-standalone.html');

const mime = ext => ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[ext] || 'application/octet-stream');

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let inlined = 0, bytes = 0;

html = html.replace(/(src=")(assets\/[^"]+)(")/g, (all, a, rel, b) => {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return all;
  const data = fs.readFileSync(file);
  inlined++; bytes += data.length;
  return a + 'data:' + mime(path.extname(rel)) + ';base64,' + data.toString('base64') + b;
});

fs.writeFileSync(out, html);
console.log('встроено файлов: ' + inlined + ' (' + (bytes / 1e6).toFixed(1) + ' МБ)');
console.log('результат: ' + path.relative(root, out) + ' — ' + (fs.statSync(out).size / 1e6).toFixed(1) + ' МБ');
