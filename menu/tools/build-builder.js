/* Собирает конструктор в один файл: внутрь зашиты шаблон сайта и парсер меню. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(ROOT, 'template.html'), 'utf8');
const parser = fs.readFileSync(path.join(ROOT, 'tools', 'parse-menu.js'), 'utf8')
  .replace(/if \(typeof module[^\n]*\n?/, '');
const src = fs.readFileSync(path.join(ROOT, 'tools', 'builder.src.html'), 'utf8');
const safe = JSON.stringify(tpl).replace(/<\/script/gi, '<\\/script');
const out = src.replace('__TEMPLATE__', safe).replace('__PARSER__', parser);
fs.writeFileSync(path.join(ROOT, 'builder.html'), out);
console.log('builder.html — ' + (Buffer.byteLength(out) / 1024).toFixed(0) + ' KB');
