#!/usr/bin/env node
/* Собирает страницу в один HTML-файл: стили, скрипт и картинки встраиваются внутрь.
   Нужно для публикации артефактом, где внешних файлов нет.
   node tools/build-standalone.js [исходник] [файл-назначения]   */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const src = path.resolve(root, process.argv[2] || 'index.html');
const out = path.resolve(root, process.argv[3] || 'concept-standalone.html');
const dir = path.dirname(src);

const mime = ext => ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[ext] || 'application/octet-stream');
const local = rel => path.resolve(dir, rel.split('?')[0]);

let html = fs.readFileSync(src, 'utf8');
let images = 0, bytes = 0;

// стили и скрипт — текстом
html = html.replace(/<link rel="stylesheet" href="((?:\.\.\/)*assets\/[^"]+\.css)">/g,
  (all, rel) => fs.existsSync(local(rel)) ? '<style>\n' + fs.readFileSync(local(rel), 'utf8') + '</style>' : all);
html = html.replace(/<script src="((?:\.\.\/)*assets\/[^"]+\.js)"><\/script>/g,
  (all, rel) => fs.existsSync(local(rel)) ? '<script>\n' + fs.readFileSync(local(rel), 'utf8') + '</script>' : all);

// картинки — data: URI
html = html.replace(/(src=")((?:\.\.\/)*assets\/[^"]+)(")/g, (all, a, rel, b) => {
  const file = local(rel);
  if (!fs.existsSync(file)) return all;
  const data = fs.readFileSync(file);
  images++; bytes += data.length;
  return a + 'data:' + mime(path.extname(file)) + ';base64,' + data.toString('base64') + b;
});

// внутренние ссылки между страницами в одном файле не работают — гасим
html = html.replace(/href="(?:\.\.\/)*(?:index\.html|projects\/[^"]*)"/g, 'href="#" data-placeholder-link');
html = html.replace(/href="(?:\.\.\/)+index\.html#[^"]*"/g, 'href="#" data-placeholder-link');

fs.writeFileSync(out, html);
console.log('встроено картинок: ' + images + ' (' + (bytes / 1e6).toFixed(1) + ' МБ)');
console.log('результат: ' + path.relative(root, out) + ' — ' + (fs.statSync(out).size / 1e6).toFixed(1) + ' МБ');
