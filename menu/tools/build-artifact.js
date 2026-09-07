/* Готовит собранный сайт к публикации как Artifact: снимает внешнюю обёртку
   (doctype/html/head/body) — площадка добавляет её сама. */
'use strict';
const fs = require('fs'), path = require('path');
const src = process.argv[2], out = process.argv[3];
let h = fs.readFileSync(src, 'utf8');
const title = (h.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1];
const style = (h.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
const body = (h.match(/<body>([\s\S]*)<\/body>/) || [, ''])[1];
fs.writeFileSync(out, '<title>' + title + '</title>\n' + style + '\n' + body.trim() + '\n');
console.log(out + ' — ' + (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
