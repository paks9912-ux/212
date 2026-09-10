#!/usr/bin/env node
/* Собирает внутренние страницы из data/site.js: шесть услуг и список объектов.
   Разметка одна на все страницы — правка шаблона расходится по всему разделу.
   node tools/build-pages.js   */
const fs = require('fs'), path = require('path');
const { services, projects, filters } = require('../data/site.js');
const root = path.join(__dirname, '..');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* размеры картинки в разметке: без них страница прыгает при загрузке.
   Читаем заголовки JPEG и PNG сами — зависимостей у проекта нет и не нужно. */
const measure = buf => {
  if (buf[0] === 0x89 && buf[1] === 0x50) {                       // PNG: IHDR
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {                        // JPEG: маркер SOF
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
};
const dims = rel => {
  try {
    const d = measure(fs.readFileSync(path.join(root, 'assets/img', rel)));
    return d ? ` width="${d.w}" height="${d.h}"` : '';
  } catch { return ''; }
};

/* глубина текущей страницы: пути к картинкам считаются от неё */
let UP = '../../';
const img = (rel, alt, extra = '') =>
  `<img src="${UP}assets/img/${rel}" alt="${esc(alt)}"${extra}${dims(rel)} onerror="this.parentElement.classList.add('ph')">`;

const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const corner = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M8 7h9v9"/></svg>';

const head = (title, meta, depth) => {
  const up = '../'.repeat(depth);
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(meta)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${up}assets/site.css">
</head>
<body>

<a class="skip" href="#top">К содержимому</a>
`;
};

const header = (up, cta, parent) => `
<header class="header" id="header">
  <div class="wrap">
    <button class="backbtn" type="button" data-parent="${parent || up + 'index.html'}" aria-label="Вернуться назад">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>
      <span>Назад</span>
    </button>
    <a class="logo" href="${up}index.html" aria-label="СУ №4 — на главную">
      <img class="logo-img" src="${up}assets/logo-white@2x.png" alt="ЗАО «Строительное управление №4»" width="120" height="120" data-logo>
      <span class="logo-mark" aria-hidden="true">4</span>
      <span class="logo-text">СУ №4<small>Строительное управление · 1952</small></span>
    </a>
    <span class="concept-badge">Концепт · v0.1</span>
    <nav class="nav" aria-label="Основная навигация">
      <a href="${up}projects/index.html">Проекты</a>
      <a href="${up}services/index.html">Услуги</a>
      <a href="${up}index.html#production">Производство</a>
      <a href="${up}index.html#about">О компании</a>
      <a href="${up}index.html#contacts">Контакты</a>
    </nav>
    <a class="btn btn-primary header-cta" href="#${cta}">Запросить расчёт</a>
    <button class="burger" id="burger" aria-label="Открыть меню" aria-expanded="false" aria-controls="mobileMenu"><span></span></button>
  </div>
</header>
<div class="mobile-menu" id="mobileMenu" aria-hidden="true">
  <button class="mobile-close" id="mobileClose" aria-label="Закрыть меню">×</button>
  <a class="item" href="${up}projects/index.html">Проекты <span class="mono">01</span></a>
  <a class="item" href="${up}services/index.html">Услуги <span class="mono">02</span></a>
  <a class="item" href="${up}index.html#production">Производство <span class="mono">03</span></a>
  <a class="item" href="${up}index.html#about">О компании <span class="mono">04</span></a>
  <a class="item" href="${up}index.html#contacts">Контакты <span class="mono">05</span></a>
  <a class="btn btn-primary" href="#${cta}">Запросить расчёт</a>
</div>
`;

const footer = up => `
<footer class="footer">
  <div class="wrap">
    <div class="footer-grid">
      <div>
        <a class="logo" href="${up}index.html" style="margin-bottom:16px;--logo-h:64px"><img class="logo-img" src="${up}assets/logo-white@2x.png" alt="ЗАО «Строительное управление №4»" width="120" height="120" loading="lazy" data-logo><span class="logo-mark" aria-hidden="true">4</span><span class="logo-text">СУ №4<small>Строительное управление · 1952</small></span></a>
        <p style="max-width:30em">ЗАО «Строительное управление №4». Промышленное строительство, металлоконструкции, резервуары, железобетон и дороги. Кыргызстан.</p>
      </div>
      <div><h3 class="h3">Услуги</h3><ul>${services.map(s => `<li><a href="${up}services/${s.slug}/index.html">${esc(s.nav)}</a></li>`).join('')}<li><a href="${up}services/index.html"><b>Все направления →</b></a></li></ul></div>
      <div><h3 class="h3">Контакты</h3><ul class="num"><li><a href="tel:+996704141522">+996 704 141 522</a> <span class="mono muted" style="font-size:.62rem">продажи</span></li><li><a href="tel:+996550114459">+996 550 114 459</a> <span class="mono muted" style="font-size:.62rem">снабжение</span></li><li><a href="https://go.2gis.com/DDprr" target="_blank" rel="noopener">Кара-Балта, ул. Кожомбердиева 2<br>Жайылский р-н, Чуйская обл.</a></li></ul></div>
      <div><h3 class="h3">Соцсети</h3><ul><li><a href="https://www.instagram.com/su4.kg" target="_blank" rel="noopener">Instagram</a></li><li><a href="https://youtube.com/@su4kg" target="_blank" rel="noopener">YouTube</a></li><li><a href="https://tiktok.com/@su4.kg" target="_blank" rel="noopener">TikTok</a></li><li><a href="https://t.me/+996704141522" target="_blank" rel="noopener">Telegram</a></li></ul></div>
    </div>
    <div class="footer-bottom">
      <span>© <span id="yearNow3">2026</span> ЗАО «Строительное управление №4»</span>
      <span class="mono">Кыргызстан · с 1952 года</span>
    </div>
  </div>
</footer>

<div class="callbar" id="callbar" aria-label="Быстрая связь">
  <a href="tel:+996704141522"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.7a2 2 0 0 1 1.7 2z"/></svg>Позвонить</a>
  <a class="wa" href="https://wa.me/996704141522"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 1-13.4 7.8L3 21l1.2-4.6A9 9 0 1 1 21 12z"/></svg>WhatsApp</a>
</div>

<script src="${up}assets/site.js"></script>
</body>
</html>
`;

/* Карточка кликабельна только там, где есть страница кейса:
   стрелка и ссылка обещают переход, которого иначе не существует. */
const projectCard = (p, up) => {
  const link = p.ready
    ? `\n        <span class="go" aria-hidden="true">${corner}</span>` +
      `\n        <a class="cover" href="${up}projects/${p.slug}/index.html" aria-label="Открыть кейс: ${esc(p.title)}"></a>`
    : '';
  return `      <article class="proj reveal${p.ready ? '' : ' proj--flat'}" data-cat="${p.tags.join(' ')}">
        <div class="ph-frame">${img(p.img, p.title, ' loading="lazy"')}</div>
        <div class="proj-body">
          <div class="proj-meta"><span class="cat">${esc(p.cat)}</span><span>Год · —</span></div>
          <h3 class="h3">${esc(p.title)}</h3>
          <p>${esc(p.text)}</p>
        </div>${link}
      </article>`;
};

/* ---------- страница услуги ---------- */
function servicePage(s) {
  const up = UP = '../../';
  let n = 0;
  const sec = () => String(++n).padStart(2, '0');
  const others = services.filter(o => o.slug !== s.slug);
  const cases = s.cases.map(sl => projects.find(p => p.slug === sl)).filter(Boolean);

  const offerSec = `
<section class="sec paper" aria-labelledby="h-offer">
  <div class="wrap">
    <div class="sec-head">
      <div class="sec-index">${sec()} / Состав направления</div>
      <h2 class="display h2" id="h-offer">${esc(s.offer.title)}</h2>
      <p class="lead muted" style="font-size:1rem">${esc(s.offer.note)}</p>
    </div>
    <div class="offer">
${s.offer.items.map((it, i) => `      <article class="reveal">
        <div class="ph-frame">${img(it.img, it.t, ' loading="lazy"')}</div>
        <div class="body">
          <span class="mono">${String(i + 1).padStart(2, '0')}</span>
          <h3 class="h3">${esc(it.t)}</h3>
          <p>${esc(it.p)}</p>
          <div class="chips">${it.c.map(c => `<span>${esc(c)}</span>`).join('')}</div>
        </div>
      </article>`).join('\n')}
    </div>
  </div>
</section>`;

  const processSec = !s.process ? '' : `
<section class="sec" aria-labelledby="h-prod">
  <div class="wrap">
    <div class="sec-head">
      <div class="sec-index">${sec()} / Как это делается</div>
      <h2 class="display h2" id="h-prod">${esc(s.process.title)}</h2>
      <p class="lead muted" style="font-size:1rem">${esc(s.process.note)}</p>
    </div>
    <div class="prod-hero">
      <div class="ph-frame reveal">${img(s.process.img, s.process.imgAlt, ' loading="lazy"')}</div>
      <aside class="spec-card reveal num" aria-label="${esc(s.process.specTitle)}">
        <span class="mono">${esc(s.process.specTitle)}</span>
        <ul class="spec-list">
${s.process.specs.map(([k, v]) => `          <li><span>${esc(k)}</span><span>${esc(v)}</span></li>`).join('\n')}
        </ul>
      </aside>
    </div>
    <div class="prod-steps">
${s.process.steps.map((st, i) => `      <div class="step reveal"><span class="mono">Этап ${String(i + 1).padStart(2, '0')}</span><h3 class="h3">${esc(st.t)}</h3><p>${esc(st.p)}</p></div>`).join('\n')}
    </div>
  </div>
</section>`;

  const gallerySec = `
<section class="sec" aria-labelledby="h-gal"${s.process ? ' style="padding-top:0"' : ''}>
  <div class="wrap">
    ${s.process ? '<hr class="hr" style="margin-bottom:var(--sec-y)">' : ''}
    <div class="sec-head">
      <div class="sec-index">${sec()} / Объекты в работе</div>
      <h2 class="display h2" id="h-gal">${esc(s.gallery.title)}</h2>
      <p class="lead muted" style="font-size:1rem">${esc(s.gallery.note)}</p>
    </div>
    <div class="gallery">
${s.gallery.items.map(([f, alt, cap]) => `      <figure class="reveal"><div class="ph-frame">${img(f, alt, ' loading="lazy"')}</div><figcaption>${esc(cap)}</figcaption></figure>`).join('\n')}
    </div>
  </div>
</section>`;

  const casesSec = `
<section class="sec paper" aria-labelledby="h-cases">
  <div class="wrap">
    <div class="sec-head">
      <div class="sec-index">${sec()} / Где это уже сделано</div>
      <h2 class="display h2" id="h-cases">Объекты направления.</h2>
      <a class="link-arrow" href="${up}projects/index.html">Все проекты ${arrow}</a>
    </div>
    <div class="more-projects">
${cases.map(p => projectCard(p, up)).join('\n')}
    </div>
  </div>
</section>`;

  const askSec = `
<section class="sec" id="ask" aria-labelledby="h-ask">
  <div class="wrap ask">
    <div>
      <div class="sec-index" style="margin-bottom:20px">${sec()} / Запрос</div>
      <h2 class="display h2" id="h-ask">${esc(s.ask.title)}</h2>
      <p class="muted" style="max-width:32em;margin-top:16px">${esc(s.ask.note)}</p>
      <div class="channels num">
        <a href="https://wa.me/996704141522"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 1-13.4 7.8L3 21l1.2-4.6A9 9 0 1 1 21 12z"/></svg><span><b>WhatsApp</b></span><span class="mono">быстрый ответ</span></a>
        <a href="tel:+996704141522"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.7a2 2 0 0 1 1.7 2z"/></svg><span><b>+996 704 141 522</b></span><span class="mono">отдел продаж</span></a>
        <a href="mailto:info@su4.kg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M4 6l8 6 8-6"/></svg><span><b>info@su4.kg</b></span><span class="mono">почта · уточнить адрес</span></a>
      </div>
    </div>
    <form class="form" id="leadForm" novalidate>
      <div class="form-row">
        <div class="field"><label for="f-name">Имя</label><input id="f-name" name="name" type="text" autocomplete="name" required placeholder="Как к вам обращаться"></div>
        <div class="field"><label for="f-company">Компания</label><input id="f-company" name="company" type="text" autocomplete="organization" placeholder="Название организации"></div>
      </div>
      <div class="form-row">
        <div class="field"><label for="f-phone">Телефон</label><input id="f-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required placeholder="+996"></div>
        <div class="field"><label for="f-email">Email</label><input id="f-email" name="email" type="email" autocomplete="email" placeholder="для отправки КП"></div>
      </div>
      <div class="field"><label for="f-type">Что требуется</label>
        <select id="f-type" name="type" required>
          <option value="">Выберите из списка</option>
${s.formOptions.map(o => `          <option>${esc(o)}</option>`).join('\n')}
        </select></div>
      <div class="field"><label for="f-msg">Параметры <span style="text-transform:none;letter-spacing:0">(необязательно)</span></label><textarea id="f-msg" name="message" placeholder="Объём, габариты, локация, сроки"></textarea></div>
      <div class="field"><label for="f-file">Чертёж или техзадание <span style="text-transform:none;letter-spacing:0">(до 25 МБ)</span></label><input id="f-file" name="file" type="file" accept=".pdf,.dwg,.dxf,.doc,.docx,.xls,.xlsx,.jpg,.png,.zip,.rar"></div>
      <button class="btn btn-primary" type="submit">Отправить запрос ${arrow}</button>
      <p class="form-note"><b style="color:var(--white)">Отвечаем в течение рабочего дня.</b> Заявка уходит в отдел продаж СУ №4. Отправляя форму, вы соглашаетесь с <a href="#" data-placeholder-link style="border-bottom:1px solid currentColor">обработкой персональных данных</a>.</p>
      <div class="form-ok" role="status">Запрос отправлен. Мы свяжемся с вами в рабочее время — обычно в течение одного дня.</div>
    </form>
  </div>
</section>`;

  const idx = services.findIndex(o => o.slug === s.slug);
  const prev = services[(idx - 1 + services.length) % services.length];
  const next = services[(idx + 1) % services.length];
  const alsoSec = `
<section class="sec" aria-labelledby="h-also" style="padding-top:0">
  <div class="wrap">
    <hr class="hr" style="margin-bottom:var(--sec-y)">
    <div class="sec-head">
      <div class="sec-index">Соседние направления</div>
      <h2 class="display h2" id="h-also">Компания закрывает весь цикл.</h2>
      <a class="link-arrow" href="${up}services/index.html">Все направления ${arrow}</a>
    </div>
    <nav class="pager" aria-label="Переход между направлениями">
      <a class="pager-prev" href="${up}services/${prev.slug}/index.html">
        <span class="mono">Предыдущее</span>
        <span class="ttl">${esc(prev.nav)}</span>
      </a>
      <a class="pager-next" href="${up}services/${next.slug}/index.html">
        <span class="mono">Следующее</span>
        <span class="ttl">${esc(next.nav)}</span>
      </a>
    </nav>
  </div>
</section>`;

  return head(`${s.title} — СУ №4`, s.meta, 2) + header(up, 'ask', up + 'services/index.html') + `
<main id="top">

<section class="case-hero" aria-labelledby="h1">
  <div class="hero-media" aria-hidden="true">
    <div class="ph-frame">${img(s.hero, '', ' fetchpriority="high"')}</div>
    <div class="hero-grid"></div>
  </div>
  <div class="wrap case-hero-body">
    <nav class="crumbs" aria-label="Хлебные крошки">
      <a href="${up}index.html">Главная</a><span>/</span>
      <a href="${up}services/index.html">Услуги</a><span>/</span>
      <b aria-current="page">${esc(s.nav)}</b>
    </nav>
    <h1 class="display h1" id="h1">${esc(s.title)}</h1>
    <p class="lead">${esc(s.lead)}</p>
    <div class="case-stamp">
${s.stamp.map(([k, v]) => `      <div><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('\n')}
    </div>
  </div>
</section>
${offerSec}${processSec}${gallerySec}${casesSec}${askSec}${alsoSec}
</main>
` + footer(up);
}

/* ---------- список объектов ---------- */
function projectsPage() {
  const up = UP = '../';
  return head('Проекты СУ №4 — построенные объекты', 'Объекты ЗАО «Строительное управление №4»: промышленные здания, металлоконструкции и резервуары, дороги и инфраструктура, бескаркасные сооружения.', 1) + header(up, 'ask') + `
<main id="top">

<section class="sec" style="padding-top:130px" aria-labelledby="h1">
  <div class="wrap">
    <nav class="crumbs" aria-label="Хлебные крошки" style="margin-bottom:26px">
      <a href="${up}index.html">Главная</a><span>/</span><b aria-current="page">Проекты</b>
    </nav>
    <div class="sec-head">
      <div class="sec-index">Объекты</div>
      <h1 class="display h2" id="h1">Двенадцать объектов из 4500.</h1>
      <p class="lead muted" style="font-size:1rem">Отобранные работы последних лет. Год, локация и параметры по каждому объекту заполняются по мере подтверждения компанией.</p>
    </div>
    <div class="filters" role="group" aria-label="Фильтр проектов">
${filters.map((f, i) => `      <button type="button" aria-pressed="${i === 0}" data-f="${f.key}">${esc(f.label)}</button>`).join('\n')}
    </div>
    <div class="projects" id="projectGrid" style="margin-top:26px">
${projects.map(p => projectCard(p, up)).join('\n')}
    </div>
    <p class="muted" style="font-size:.9rem;margin-top:30px;max-width:46em">Открывается кейс месторождения «Джамгыр». Остальные объекты получат страницы по мере сбора данных: год, локация, объём работ и роль компании.</p>
  </div>
</section>

<section class="sec paper" id="ask" aria-labelledby="h-ask">
  <div class="wrap">
    <div class="case-cta" style="background:transparent;border-color:var(--line-l2);color:var(--ink-on-paper)">
      <div>
        <div class="sec-index" style="margin-bottom:16px">Похожая задача</div>
        <h2 class="display h2" id="h-ask">Нужен объект такого же класса?</h2>
        <p style="color:var(--steel-on-paper)">Расскажите, что нужно построить и где. Вернёмся с коммерческим предложением: составом работ, распределением затрат и сроками.</p>
      </div>
      <div class="actions">
        <a class="btn btn-primary" href="${up}index.html#contacts">Обсудить проект ${arrow}</a>
        <a class="btn btn-ghost" href="https://wa.me/996704141522">WhatsApp</a>
      </div>
    </div>
  </div>
</section>

</main>
` + footer(up);
}


/* ---------- раздел услуг ---------- */
function servicesIndex() {
  const up = UP = '../';
  return head('Услуги СУ №4 — шесть направлений', 'Направления ЗАО «Строительное управление №4»: каркасное строительство, металлоконструкции и резервуары, бескаркасные сооружения, дорожное строительство, бетон и ЖБИ, проектирование.', 1) + header(up, 'ask') + `
<main id="top">

<section class="sec" style="padding-top:130px" aria-labelledby="h1">
  <div class="wrap">
    <nav class="crumbs" aria-label="Хлебные крошки" style="margin-bottom:26px">
      <a href="${up}index.html">Главная</a><span>/</span><b aria-current="page">Услуги</b>
    </nav>
    <div class="sec-head">
      <div class="sec-index">Направления</div>
      <h1 class="display h2" id="h1">Шесть направлений, одна производственная база.</h1>
      <p class="lead muted" style="font-size:1rem">Компания проектирует, производит и монтирует — заказчику не нужно сводить между собой проектировщика, завод и монтажников.</p>
    </div>
    <div class="offer" style="margin-top:8px">
${services.map((s, i) => `      <article class="reveal">
        <div class="ph-frame">${img(s.hero, s.title, ' loading="lazy"')}</div>
        <div class="body">
          <span class="mono">${String(i + 1).padStart(2, '0')}</span>
          <h2 class="h3">${esc(s.nav)}</h2>
          <p>${esc(s.lead)}</p>
          <div class="chips">${s.stamp.slice(0, 2).map(([k, v]) => `<span>${esc(v)}</span>`).join('')}</div>
          <a class="link-arrow" href="${up}services/${s.slug}/index.html" style="align-self:flex-start;margin-top:14px">Подробнее ${arrow}</a>
        </div>
      </article>`).join('\n')}
    </div>
  </div>
</section>

<section class="sec paper" id="ask" aria-labelledby="h-ask">
  <div class="wrap">
    <div class="case-cta" style="background:transparent;border-color:var(--line-l2);color:var(--ink-on-paper)">
      <div>
        <div class="sec-index" style="margin-bottom:16px">Не нашли своё</div>
        <h2 class="display h2" id="h-ask">Опишите задачу — подскажем направление.</h2>
        <p style="color:var(--steel-on-paper)">Часть объектов закрывается сразу несколькими направлениями: каркас, металл и дороги на одной площадке.</p>
      </div>
      <div class="actions">
        <a class="btn btn-primary" href="${up}index.html#contacts">Обсудить проект ${arrow}</a>
        <a class="btn btn-ghost" href="https://wa.me/996704141522">WhatsApp</a>
      </div>
    </div>
  </div>
</section>

</main>
` + footer(up);
}

let made = 0;
for (const s of services) {
  const dir = path.join(root, 'services', s.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), servicePage(s));
  console.log('  услуга: services/' + s.slug + '/index.html');
  made++;
}
fs.writeFileSync(path.join(root, 'services/index.html'), servicesIndex());
console.log('  раздел: services/index.html');
fs.mkdirSync(path.join(root, 'projects'), { recursive: true });
fs.writeFileSync(path.join(root, 'projects/index.html'), projectsPage());
console.log('  список: projects/index.html');
console.log('готово: страниц ' + (made + 1));
