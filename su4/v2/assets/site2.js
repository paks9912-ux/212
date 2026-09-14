/* СУ №4 — вариант дизайна 2. Без зависимостей. */
(function () {
  'use strict';

  var d = document, w = window;
  var reduce = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var supportsIO = 'IntersectionObserver' in w;

  /* ---------- год в подвале ---------- */
  var y = d.getElementById('yearNow');
  if (y) y.textContent = new Date().getFullYear();

  /* ---------- шапка: тень при скролле + скрытие на мобильном ---------- */
  var header = d.getElementById('header');
  var lastY = w.scrollY, ticking = false;

  function onScroll() {
    var cy = w.scrollY;
    if (header) {
      header.classList.toggle('scrolled', cy > 12);
      var mobile = w.innerWidth <= 980;
      if (mobile && !d.body.classList.contains('menu-open')) {
        header.classList.toggle('hide', cy > lastY && cy > 360);
      } else {
        header.classList.remove('hide');
      }
    }
    var bar = d.getElementById('callbar');
    if (bar) bar.classList.toggle('show', cy > 620);
    var top = d.getElementById('toTop');
    if (top) top.classList.toggle('show', cy > 1200);
    lastY = cy;
    ticking = false;
  }
  w.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; w.requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  var toTop = d.getElementById('toTop');
  if (toTop) toTop.addEventListener('click', function () {
    w.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  });

  /* ---------- мобильное меню ---------- */
  var burger = d.getElementById('burger');
  var menu = d.getElementById('mobileMenu');
  var closeBtn = d.getElementById('mobileClose');

  function setMenu(open) {
    if (!menu || !burger) return;
    menu.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    d.body.classList.toggle('menu-open', open);
  }
  if (burger) burger.addEventListener('click', function () {
    setMenu(!menu.classList.contains('open'));
  });
  if (closeBtn) closeBtn.addEventListener('click', function () { setMenu(false); });
  if (menu) menu.addEventListener('click', function (e) {
    if (e.target.closest('a')) setMenu(false);
  });
  d.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setMenu(false);
  });

  /* ---------- появление блоков при скролле ---------- */
  var revealItems = [].slice.call(d.querySelectorAll('.reveal'));
  if (reduce || !supportsIO) {
    revealItems.forEach(function (el) { el.classList.add('in'); });
  } else {
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); ro.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    revealItems.forEach(function (el) { ro.observe(el); });
  }

  /* ---------- счётчики ---------- */
  function fmt(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  function runCount(el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    if (isNaN(target)) return;
    if (el.hasAttribute('data-plain')) { el.textContent = String(target); return; }
    if (reduce) { el.textContent = fmt(target); return; }
    var dur = 1500, start = null;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(target * eased));
      if (p < 1) w.requestAnimationFrame(step);
    }
    w.requestAnimationFrame(step);
  }
  var counters = [].slice.call(d.querySelectorAll('[data-count]'));
  if (!supportsIO) {
    counters.forEach(runCount);
  } else {
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { runCount(en.target); co.unobserve(en.target); }
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { co.observe(el); });
  }

  /* ---------- бесконечная лента логотипов ---------- */
  var track = d.getElementById('marquee');
  if (track && !reduce) {
    track.innerHTML += track.innerHTML;
    [].slice.call(track.children).forEach(function (el, i) {
      if (i >= track.children.length / 2) el.setAttribute('aria-hidden', 'true');
    });
  }

  /* ---------- «эйфелевы башни» ---------- */
  var towers = d.getElementById('towers');
  if (towers && supportsIO) {
    var to = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        [].slice.call(towers.children).forEach(function (svg, i) {
          setTimeout(function () { svg.classList.add('on'); }, reduce ? 0 : i * 160);
        });
        to.unobserve(en.target);
      });
    }, { threshold: 0.4 });
    to.observe(towers);
  }

  /* ---------- фильтр объектов ---------- */
  var gallery = d.getElementById('gallery');
  var filterBtns = [].slice.call(d.querySelectorAll('.filters button'));
  if (gallery) {
    var cards = [].slice.call(gallery.querySelectorAll('.gcard'));
    function showCards(list) {
      list.forEach(function (c, i) {
        setTimeout(function () { c.classList.add('show'); }, reduce ? 0 : i * 45);
      });
    }
    if (supportsIO && !reduce) {
      var go = new IntersectionObserver(function (entries) {
        if (entries.some(function (en) { return en.isIntersecting; })) {
          showCards(cards.filter(function (c) { return c.style.display !== 'none'; }));
          go.disconnect();
        }
      }, { threshold: 0.05 });
      go.observe(gallery);
    } else {
      cards.forEach(function (c) { c.classList.add('show'); });
    }

    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var f = btn.getAttribute('data-f');
        filterBtns.forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
        var shown = [];
        cards.forEach(function (c) {
          var match = f === 'all' || (c.getAttribute('data-cat') || '').indexOf(f) !== -1;
          c.classList.remove('show');
          c.style.display = match ? '' : 'none';
          if (match) shown.push(c);
        });
        showCards(shown);
      });
    });
  }

  /* ---------- видео в шапке: грузим, когда экран виден ---------- */
  var video = d.getElementById('heroVideo');
  var heroImg = d.getElementById('heroImg');
  var saveData = navigator.connection && navigator.connection.saveData;
  if (video && !reduce && !saveData) {
    var loadVideo = function () {
      if (video.dataset.loaded) return;
      video.dataset.loaded = '1';
      var webm = d.createElement('source');
      webm.src = video.getAttribute('data-webm'); webm.type = 'video/webm';
      var mp4 = d.createElement('source');
      mp4.src = video.getAttribute('data-mp4'); mp4.type = 'video/mp4';
      video.appendChild(webm); video.appendChild(mp4);
      video.load();
      var p = video.play();
      if (p && p.then) p.then(function () { video.classList.add('ready'); }).catch(function () {});
      video.addEventListener('playing', function () { video.classList.add('ready'); }, { once: true });
    };
    if (supportsIO) {
      var vo = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { loadVideo(); vo.disconnect(); }
        });
      }, { threshold: 0.2 });
      vo.observe(video);
    } else {
      loadVideo();
    }
  }

  /* ---------- лёгкий параллакс первого экрана ---------- */
  if (!reduce && heroImg && w.innerWidth > 720) {
    var pTicking = false;
    w.addEventListener('scroll', function () {
      if (pTicking) return;
      pTicking = true;
      w.requestAnimationFrame(function () {
        var off = Math.min(w.scrollY, 700);
        var shift = off * 0.14;
        heroImg.style.transform = 'scale(1.06) translateY(' + shift + 'px)';
        if (video) video.style.transform = 'scale(1.06) translateY(' + shift + 'px)';
        pTicking = false;
      });
    }, { passive: true });
  }

  /* ---------- активный пункт меню ---------- */
  var navLinks = [].slice.call(d.querySelectorAll('.nav a[href^="#"]'));
  var sections = navLinks.map(function (a) { return d.querySelector(a.getAttribute('href')); });
  if (supportsIO && sections.filter(Boolean).length) {
    var so = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        navLinks.forEach(function (a) {
          a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { if (s) so.observe(s); });
  }

  /* ---------- форма заявки (демо-режим концепта) ---------- */
  var form = d.getElementById('leadForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var invalid = null;
      [].slice.call(form.querySelectorAll('[required]')).forEach(function (el) {
        var bad = !el.value.trim();
        el.style.borderColor = bad ? '#D64545' : '';
        if (bad && !invalid) invalid = el;
      });
      if (invalid) { invalid.focus(); return; }
      var ok = d.getElementById('formOk');
      if (ok) ok.classList.add('show');
      form.querySelector('button[type="submit"]').disabled = true;
      form.querySelector('button[type="submit"]').style.opacity = '.6';
    });
  }
})();
