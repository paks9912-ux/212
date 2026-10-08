/* Лендинг студии: скролл-анимация по кадрам, появление блоков, шапка. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Год в подвале */
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  /* Шапка: прозрачная над видео, плотная дальше */
  var nav = document.getElementById('nav');
  function onNav() { nav.classList.toggle('is-solid', window.scrollY > window.innerHeight * 0.7); }
  window.addEventListener('scroll', onNav, { passive: true });
  onNav();

  /* Появление блоков */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* Скролл-секвенция: кадры перехода «день → вечер» рисуются на canvas
     в зависимости от того, насколько прокручен блок .seq */
  var seq = document.getElementById('seq');
  var canvas = document.getElementById('seqCanvas');
  if (!seq || !canvas) return;

  var FRAMES = 96;                       // media/frames/0001.jpg … 0096.jpg
  var PATH = 'media/frames/';
  var ctx = canvas.getContext && canvas.getContext('2d');

  if (!ctx || reduced) { seq.classList.add('no-canvas'); setCaptions(1); return; }

  var caps = Array.prototype.slice.call(seq.querySelectorAll('.seq__cap'));
  var images = new Array(FRAMES);
  var loaded = 0;
  var current = 0;     // сглаженный номер кадра
  var target = 0;      // кадр по прокрутке
  var drawn = -1;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  function src(i) { return PATH + ('000' + (i + 1)).slice(-4) + '.jpg'; }

  function load(i, cb) {
    if (images[i]) { cb && cb(); return; }
    var img = new Image();
    img.decoding = 'async';
    img.onload = function () { loaded++; cb && cb(); };
    img.src = src(i);
    images[i] = img;
  }

  /* Сначала первый кадр, потом каждый восьмой, потом остальные —
     чтобы картинка появлялась сразу, а детали догружались */
  load(0, function () { drawn = -1; draw(); });
  var order = [];
  for (var step = 8; step >= 1; step = step / 2) {
    for (var k = 0; k < FRAMES; k += step) if (order.indexOf(k) < 0 && k !== 0) order.push(k);
  }
  var queue = order.slice();
  function pump() {
    if (!queue.length) return;
    var i = queue.shift();
    load(i, pump);
  }
  pump(); pump(); pump();

  function resize() {
    var w = seq.clientWidth, h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    drawn = -1;
    draw();
  }
  window.addEventListener('resize', resize);
  resize();

  /* Ближайший загруженный кадр, чтобы не было пустых промежутков */
  function nearest(i) {
    for (var d = 0; d < FRAMES; d++) {
      var a = images[i - d], b = images[i + d];
      if (a && a.complete && a.naturalWidth) return a;
      if (b && b.complete && b.naturalWidth) return b;
    }
    return null;
  }

  function draw() {
    var i = Math.round(current);
    if (i === drawn) return;
    var img = nearest(i);
    if (!img) return;
    drawn = i;
    var cw = canvas.width, ch = canvas.height;
    var s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    var w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
  }

  function progress() {
    var rect = seq.getBoundingClientRect();
    var total = seq.offsetHeight - window.innerHeight;
    return Math.min(1, Math.max(0, -rect.top / total));
  }

  function setCaptions(p) {
    var active = -1;
    caps.forEach(function (c, i) { if (p >= parseFloat(c.dataset.at)) active = i; });
    caps.forEach(function (c, i) { c.classList.toggle('is-on', i === active); });
  }

  var ticking = false;
  function onScroll() {
    target = progress() * (FRAMES - 1);
    setCaptions(progress());
    if (!ticking) { ticking = true; requestAnimationFrame(tick); }
  }
  function tick() {
    current += (target - current) * 0.18;
    if (Math.abs(target - current) < 0.05) current = target;
    draw();
    if (current !== target) requestAnimationFrame(tick); else ticking = false;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
