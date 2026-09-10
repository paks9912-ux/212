#!/usr/bin/env node
/* Собирает страницу в один HTML-файл: стили, скрипт и картинки встраиваются внутрь.
   Нужно для публикации артефактом, где внешних файлов нет.
   node tools/build-standalone.js [исходник] [файл-назначения]   */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const src = path.resolve(root, process.argv[2] || 'index.html');
const out = path.resolve(root, process.argv[3] || 'concept-standalone.html');
const dir = path.dirname(src);

const mime = ext => ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm' }[ext] || 'application/octet-stream');
const local = rel => path.resolve(dir, rel.split('?')[0]);

let html = fs.readFileSync(src, 'utf8');
let images = 0, bytes = 0;

// стили и скрипт — текстом
html = html.replace(/<link rel="stylesheet" href="((?:\.\.\/)*assets\/[^"]+\.css)">/g, (all, rel) => {
  if (!fs.existsSync(local(rel))) return all;
  let css = fs.readFileSync(local(rel), 'utf8');
  // шрифты лежат рядом со стилями — в одном файле их нужно встроить
  css = css.replace(/url\((fonts\/[^)]+\.woff2)\)/g, (m, f) => {
    const file = path.resolve(path.dirname(local(rel)), f);
    return fs.existsSync(file) ? 'url(data:font/woff2;base64,' + fs.readFileSync(file).toString('base64') + ')' : m;
  });
  return '<style>\n' + css + '</style>';
});
html = html.replace(/<script src="((?:\.\.\/)*assets\/[^"]+\.js)"><\/script>/g,
  (all, rel) => fs.existsSync(local(rel)) ? '<script>\n' + fs.readFileSync(local(rel), 'utf8') + '</script>' : all);

// картинки, постеры и видео — data: URI
html = html.replace(/((?:src|poster|data-mp4|data-webm)=")((?:\.\.\/)*assets\/[^"]+)(")/g, (all, a, rel, b) => {
  const file = local(rel);
  if (!fs.existsSync(file)) return all;
  const data = fs.readFileSync(file);
  images++; bytes += data.length;
  return a + 'data:' + mime(path.extname(file)) + ';base64,' + data.toString('base64') + b;
});

// Внутри одного файла соседних страниц нет. Ссылки на них переводим на
// опубликованные адреса — иначе переходы по сайту молча не работают.
const published = JSON.parse(fs.readFileSync(path.join(root, 'data/artifacts.json'), 'utf8'));
const pageKey = path.relative(root, src).split(path.sep).join('/');
let linked = 0, stubbed = 0;

html = html.replace(/href="((?:\.\.\/)*[A-Za-z0-9_\-./]*\.html)(#[^"]*)?"/g, (all, rel, hash = '') => {
  const abs = path.posix.normalize(path.posix.join(path.posix.dirname(pageKey), rel));
  if (abs === pageKey) return `href="${hash || '#top'}"`;        // ссылка на саму себя
  const url = published[abs];
  if (url) { linked++; return `href="${url}${hash}" target="_top"`; }
  stubbed++; return 'href="#" data-placeholder-link';
});
console.log('ссылок на другие страницы: ' + linked + ' переведено на опубликованные, ' + stubbed + ' заглушено');

fs.writeFileSync(out, html);
console.log('встроено картинок: ' + images + ' (' + (bytes / 1e6).toFixed(1) + ' МБ)');
console.log('результат: ' + path.relative(root, out) + ' — ' + (fs.statSync(out).size / 1e6).toFixed(1) + ' МБ');
