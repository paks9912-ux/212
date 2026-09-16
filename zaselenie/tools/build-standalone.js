#!/usr/bin/env node
/* Собирает демо в один HTML-файл: стили и скрипты внутрь, шрифт системный.
   Такой файл можно переслать в мессенджере — откроется на любом телефоне
   без интернета и без установки.

   node zaselenie/tools/build-standalone.js            — обе страницы
   node zaselenie/tools/build-standalone.js --demo     — только «как это работает»  */
'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var read = function (f) { return fs.readFileSync(path.join(root, f), 'utf8'); };

var PAGES = {
  demo: {
    html: 'demo.html',
    css: ['css/demo.css'],
    js: ['js/util.js', 'js/knowledge.js', 'js/holds.js', 'js/nlu.js', 'js/policy.js',
         'js/reply.js', 'js/risk.js', 'js/scenarios.js', 'js/agent.js', 'js/demo-platform.js'],
    out: 'kluchi-demo.html'
  },
  chat: {
    html: 'index.html',
    css: ['css/app.css'],
    js: ['js/util.js', 'js/knowledge.js', 'js/holds.js', 'js/nlu.js', 'js/policy.js',
         'js/reply.js', 'js/risk.js', 'js/scenarios.js', 'js/agent.js', 'js/facts.js',
         'js/api.js', 'js/ui.js'],
    out: 'kluchi-chat.html'
  }
};

function build(name) {
  var page = PAGES[name];
  var html = read(page.html);

  var css = page.css.map(read).join('\n');
  var js = page.js.map(function (f) {
    return '/* ' + f + ' */\n' + read(f);
  }).join('\n;\n');

  /* Вставляем код только через функцию-заменитель: иначе «$» внутри кода
     превратится в спецпоследовательность замены и файл сломается */
  html = html
    .replace(/<link rel="preconnect"[^>]*>\s*/g, '')
    .replace(/<link href="https:\/\/fonts\.googleapis[^>]*>\s*/g, '')
    .replace(/<link rel="stylesheet"[^>]*>\s*/g, function () { return '<style>\n' + css + '\n</style>'; })
    .replace(/<script src="[^"]*"><\/script>\s*/g, '')
    .replace('</body>', function () { return '<script>\n' + js + '\n</script>\n</body>'; });

  /* Закрывающий тег внутри строки кода разорвал бы <script> */
  html = html.replace(/<\/script>/g, function (m, i) {
    return i > html.indexOf('<script>') && i < html.lastIndexOf('</script>') ? '<\\/script>' : m;
  });

  /* Manrope недоступен офлайн — берём системный шрифт */
  html = html.replace(/"Manrope",?\s*/g, '');

  var out = path.join(root, page.out);
  fs.writeFileSync(out, html);
  var kb = Math.round(html.length / 1024);
  console.log('✓ ' + page.out + ' — ' + kb + ' КБ, открывается двойным кликом');
  return out;
}

var which = process.argv[2];
if (which === '--demo') build('demo');
else if (which === '--chat') build('chat');
else { build('demo'); build('chat'); }
