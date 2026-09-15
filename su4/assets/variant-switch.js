/* Переключатель концептов: ссылки на оба варианта сайта и на презентацию.
   Подключается одной строкой на любой странице любого варианта. */
(function () {
  'use strict';
  var d = document;
  var script = d.currentScript;
  if (!script) return;

  // база — папка su4/, вычисляется из адреса самого скрипта
  var base = script.src.replace(/assets\/variant-switch\.js.*$/, '');
  var isV2 = /\/v2\//.test(location.pathname);

  var css = [
    '.vsw{position:fixed;left:12px;bottom:12px;z-index:70;display:flex;align-items:center;gap:6px;',
    'padding:6px;border-radius:8px;background:rgba(11,21,32,.86);backdrop-filter:blur(10px);',
    'border:1px solid rgba(255,255,255,.16);box-shadow:0 10px 30px -12px rgba(0,0,0,.6);',
    'font-family:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;transition:opacity .25s,transform .25s}',
    '.vsw.tuck{opacity:0;pointer-events:none;transform:translateY(12px)}',
    '.vsw a{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:5px;',
    'font-size:11px;font-weight:600;letter-spacing:.04em;color:#D6E3F0;text-decoration:none;white-space:nowrap;transition:background .2s,color .2s}',
    '.vsw a:hover{background:rgba(255,255,255,.12);color:#fff}',
    '.vsw a.on{background:#0B72C4;color:#fff}',
    '.vsw .sep{width:1px;height:18px;background:rgba(255,255,255,.18)}',
    '.vsw .lbl{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#8FA3B8;padding:0 4px 0 6px}',
    '.vsw .short{display:none}',
    '@media (max-width:760px){.vsw{left:10px;bottom:76px;padding:5px;gap:4px}.vsw a{padding:6px 8px;font-size:10px}',
    '.vsw .lbl{display:none}.vsw .full{display:none}.vsw .short{display:inline}}',
    '@media print{.vsw{display:none}}'
  ].join('');

  var style = d.createElement('style');
  style.textContent = css;
  d.head.appendChild(style);

  var box = d.createElement('div');
  box.className = 'vsw';
  box.setAttribute('aria-label', 'Варианты дизайна');
  box.innerHTML =
    '<span class="lbl">Концепт</span>' +
    '<a href="' + base + 'index.html"' + (isV2 ? '' : ' class="on" aria-current="page"') + '>' +
      '<span class="full">Вариант 1</span><span class="short">В1</span></a>' +
    '<a href="' + base + 'v2/index.html"' + (isV2 ? ' class="on" aria-current="page"' : '') + '>' +
      '<span class="full">Вариант 2</span><span class="short">В2</span></a>' +
    '<span class="sep"></span>' +
    '<a href="' + base + 'varianty.html">Презентация</a>';
  d.body.appendChild(box);

  /* не мешаем чтению: прячем на время прокрутки вниз, возвращаем при остановке */
  var hideTimer = null, lastY = window.scrollY;
  window.addEventListener('scroll', function () {
    var y = window.scrollY;
    if (y > lastY + 4) box.classList.add('tuck');
    lastY = y;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { box.classList.remove('tuck'); }, 450);
  }, { passive: true });
})();
