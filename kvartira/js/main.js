/* Лендинг студии: скролл-анимация по кадрам, заголовок по словам,
   счётчики, параллакс, прогресс прокрутки, появление блоков, шапка. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Год в подвале */
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  /* Заголовок первого экрана выезжает по словам */
  var title = document.querySelector('[data-words]');
  if (title) {
    title.innerHTML = title.innerHTML.split(/(<br\s*\/?>)/i).map(function (part) {
      if (/^<br/i.test(part)) return part;
      return part.split(' ').filter(Boolean).map(function (w, i) {
        return '<span class="w"><span style="transition-delay:' + (i * 70) + 'ms">' + w + '</span></span>';
      }).join(' ');
    }).join('');
    requestAnimationFrame(function () { requestAnimationFrame(function () { title.classList.add('is-in'); }); });
  }

  /* Шапка и прогресс прокрутки */
  var nav = document.getElementById('nav');
  var bar = document.querySelector('#progress span');
  function onChrome() {
    nav.classList.toggle('is-solid', window.scrollY > window.innerHeight * 0.7);
    if (bar) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? window.scrollY / max : 0) + ')';
    }
  }

  /* Появление блоков и счётчики */
  var reveals = document.querySelectorAll('.reveal');
  var counters = document.querySelectorAll('[data-count]');
  function countUp(el) {
    var to = parseInt(el.dataset.count, 10), t0 = performance.now(), dur = 1400;
    function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
    (function frame(now) {
      var k = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(Math.round(to * e));
      if (k < 1) requestAnimationFrame(frame);
    })(t0);
  }
  if ('IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        if (e.target.hasAttribute('data-count')) countUp(e.target); else e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });
    reveals.forEach(function (el) { io.observe(el); });
    counters.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
    counters.forEach(function (el) { el.textContent = String(el.dataset.count).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); });
  }

  /* Параллакс фона в блоке брони */
  var ctaImg = document.getElementById('ctaImg');
  function parallax() {
    if (!ctaImg || reduced) return;
    var r = ctaImg.parentNode.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    var k = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight; // -1..1
    ctaImg.style.transform = 'translateY(' + (-10 - k * 10) + '%)';
  }

  /* Скролл-секвенция: кадры проезда «день → ночь» рисуются на canvas
     в зависимости от того, насколько прокручен блок .seq */
  var seq = document.getElementById('seq');
  var canvas = document.getElementById('seqCanvas');
  var ctx = canvas && canvas.getContext && canvas.getContext('2d');
  var caps = seq ? Array.prototype.slice.call(seq.querySelectorAll('.seq__cap')) : [];
  var rail = document.getElementById('seqRail');

  var FRAMES = 160;                      // media/frames/0001.jpg … 0160.jpg
  var PATH = 'media/frames/';
  var images = new Array(FRAMES);
  var current = 0, target = 0, drawn = -1;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var seqOn = !!(seq && ctx) && !reduced;

  if (seq && !seqOn) { seq.classList.add('no-canvas'); setCaptions(1); }

  function src(i) { return PATH + ('000' + (i + 1)).slice(-4) + '.jpg'; }
  function load(i, cb) {
    if (images[i]) { cb && cb(); return; }
    var img = new Image();
    img.decoding = 'async';
    img.onload = img.onerror = function () { cb && cb(); };
    img.src = src(i);
    images[i] = img;
  }

  if (seqOn) {
    /* Сначала первый кадр, потом каждый восьмой, потом остальные */
    load(0, function () { drawn = -1; draw(); });
    var order = [];
    for (var step = 8; step >= 1; step = step / 2) {
      for (var k = 0; k < FRAMES; k += step) if (order.indexOf(k) < 0 && k !== 0) order.push(k);
    }
    var queue = order.slice();
    var pump = function () { if (queue.length) load(queue.shift(), pump); };
    pump(); pump(); pump(); pump();

    window.addEventListener('resize', resize);
    resize();
  }

  function resize() {
    canvas.width = Math.round(seq.clientWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    drawn = -1;
    draw();
  }

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
    caps.forEach(function (c) {
      var on = p >= parseFloat(c.dataset.at) && p < parseFloat(c.dataset.to);
      c.classList.toggle('is-on', on);
    });
    if (rail) rail.style.transform = 'scaleY(' + p + ')';
  }

  var ticking = false;
  function onScroll() {
    onChrome();
    parallax();
    if (!seqOn) return;
    var p = progress();
    target = p * (FRAMES - 1);
    setCaptions(p);
    if (!ticking) { ticking = true; requestAnimationFrame(tick); }
  }
  function tick() {
    current += (target - current) * 0.2;
    if (Math.abs(target - current) < 0.05) current = target;
    draw();
    if (current !== target) requestAnimationFrame(tick); else ticking = false;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
