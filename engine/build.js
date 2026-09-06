#!/usr/bin/env node
/**
 * QORA site engine.
 * Читает engine/clients/*.json → собирает готовый одностраничный сайт в demo/<slug>/index.html.
 *
 * Принцип: в собранном файле нет ни одного секрета. Заказ уходит deep-link'ом
 * в мессенджер заведения (wa.me / t.me), поэтому сайту не нужен ни сервер, ни токен.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TPL = fs.readFileSync(path.join(__dirname, "template.html"), "utf8");
const CLIENTS = path.join(__dirname, "clients");
const OUT = path.join(ROOT, "demo");

const e = s => String(s ?? "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
/* hex → HSL: нужен, чтобы плейсхолдеры и свечения жили в фирменном тоне */
function hexToHsl(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
  if (!m) return { h: 42, s: 60, l: 55 };
  const [r, g, bl] = m.slice(1).map(v => parseInt(v, 16) / 255);
  const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - bl) / d + (g < bl ? 6 : 0)) : mx === g ? (bl - r) / d + 2 : (r - g) / d + 4;
  const l = (mx + mn) / 2;
  return { h: Math.round(h * 60), s: Math.round((d ? d / (1 - Math.abs(2 * l - 1)) : 0) * 100), l: Math.round(l * 100) };
}
const money = (n, cur) => new Intl.NumberFormat("ru-RU").format(n) + " " + cur;

function build(c) {
  const cur = c.currency || "сум";
  const A = hexToHsl(c.accent || "#c9a227");
  const tel = "tel:" + (c.contacts?.phone || "").replace(/[^\d+]/g, "");

  /* ---------- head ---------- */
  const title = c.seo?.title || `${c.name} — ${c.tagline || ""} в ${c.city || ""}`.trim();
  const desc = c.seo?.desc || `${c.name}: меню, цены, доставка и бронь. ${c.city || ""}.`;
  const head = [
    `<title>${e(title)}</title>`,
    `<meta name="description" content="${e(desc)}">`,
    `<meta name="theme-color" content="#08080a">`,
    `<meta property="og:type" content="restaurant.restaurant">`,
    `<meta property="og:title" content="${e(title)}">`,
    `<meta property="og:description" content="${e(desc)}">`,
    c.hero?.img ? `<meta property="og:image" content="${e(c.hero.img)}">` : "",
    `<meta name="twitter:card" content="summary_large_image">`,
    `<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='${encodeURIComponent(c.accent || "#c9a227")}'/></svg>">`,
    // Schema.org — чтобы заведение появлялось в Google/Яндекс с адресом и телефоном
    `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org", "@type": "Restaurant",
      name: c.name, description: desc,
      image: c.hero?.img, telephone: c.contacts?.phone,
      servesCuisine: c.cuisine, priceRange: c.priceRange || "$$",
      address: { "@type": "PostalAddress", streetAddress: c.contacts?.address, addressLocality: c.city, addressCountry: "UZ" },
      openingHours: c.contacts?.hours, url: c.siteUrl,
    })}</script>`,
  ].filter(Boolean).join("\n");

  /* ---------- hero ---------- */
  const hh = A.h;
  const heroImg = c.hero?.img
    ? `<img src="${e(c.hero.img)}" alt="${e(c.name)}" fetchpriority="high">`
    : `<div class="hero-ph" style="--p1:hsl(${hh} 26% 19%);--p2:hsl(${(hh + 22) % 360} 20% 12%)"></div>`;
  const heroMeta = (c.hero?.meta || []).map(m => `<div>${e(m.k)}<b>${e(m.v)}</b></div>`).join("");
  const hero = [
    c.hero?.eyebrow ? `<span class="eyebrow">${e(c.hero.eyebrow)}</span>` : "",
    `<h1>${e(c.hero?.title || c.name)}</h1>`,
    c.hero?.sub ? `<p class="hero-sub">${e(c.hero.sub)}</p>` : "",
    `<div class="hero-cta"><a class="btn btn-p" href="#menu">Смотреть меню</a><a class="btn btn-g" href="${e(tel)}">Позвонить</a></div>`,
    heroMeta ? `<div class="hero-meta">${heroMeta}</div>` : "",
  ].join("\n");

  /* ---------- features ---------- */
  const feats = (c.feats || []).length
    ? `<section style="padding:0"><div class="feats reveal">${c.feats.map(f => `<div class="feat"><b>${e(f.t)}</b><span>${e(f.d)}</span></div>`).join("")}</div></section>`
    : "";

  /* ---------- menu ---------- */
  const tabs = (c.categories || []).map((k, i) =>
    `<button class="tab${i === 0 ? " on" : ""}" data-cat="${e(k.id)}">${e(k.name)}</button>`).join("");

  /* ---------- about ---------- */
  const about = c.about ? `
<section id="about">
  <div class="wrap about-g">
    <div class="about reveal">
      <span class="eyebrow">${e(c.about.eyebrow || "О нас")}</span>
      <h2 class="sec">${e(c.about.title || "")}</h2>
      ${(c.about.text || []).map(p => `<p>${e(p)}</p>`).join("")}
      ${(c.about.stats || []).length ? `<div class="stats">${c.about.stats.map(s => `<div class="stat"><b>${e(s.v)}</b><span>${e(s.l)}</span></div>`).join("")}</div>` : ""}
    </div>
    <div class="about-img reveal">${c.about.img ? `<img src="${e(c.about.img)}" alt="${e(c.name)}" loading="lazy">` : `<div class="ph" style="--p1:hsl(${(hh + 12) % 360} 22% 25%);--p2:hsl(${(hh + 28) % 360} 16% 11%)"><b>${e((c.brand || c.name)[0])}</b></div>`}</div>
  </div>
</section>` : "";

  /* ---------- contacts ---------- */
  const ct = c.contacts || {};
  const contacts = [
    ct.address ? `<div class="ct"><span class="eyebrow">Адрес</span><b>${e(ct.address)}</b>${ct.mapUrl ? `<span><a href="${e(ct.mapUrl)}" target="_blank" rel="noopener">Открыть на карте →</a></span>` : ""}</div>` : "",
    ct.hours ? `<div class="ct"><span class="eyebrow">Часы работы</span><b>${e(ct.hours)}</b>${ct.hoursNote ? `<span>${e(ct.hoursNote)}</span>` : ""}</div>` : "",
    ct.phone ? `<div class="ct"><span class="eyebrow">Телефон</span><b><a href="${e(tel)}">${e(ct.phone)}</a></b><span>Заказ и бронь стола</span></div>` : "",
  ].filter(Boolean).join("");
  const socials = (c.socials || []).map(s => `<a class="btn btn-g" href="${e(s.url)}" target="_blank" rel="noopener">${e(s.label)}</a>`).join("");

  /* ---------- nav ---------- */
  const navLinks = [["#menu", "Меню"], c.about && ["#about", "О нас"], ["#contacts", "Контакты"]]
    .filter(Boolean).map(([h, t]) => `<a href="${h}">${t}</a>`).join("");

  /* ---------- footer ---------- */
  const year = new Date().getFullYear();
  const footer = `<span>© ${year} ${e(c.name)}${c.city ? " · " + e(c.city) : ""}</span>`
    + `<span>Сайт — <a href="${e(c.builtByUrl || "../../qora/")}" target="_blank" rel="noopener">QORA</a></span>`;

  /* ---------- demo ribbon: спец-сайт не должен выдавать себя за официальный ---------- */
  const demoBar = c.demo
    ? `<div class="demo-bar">${c.demoText || "Демо-концепт сайта, подготовлен студией QORA. Это не официальный сайт заведения — блюда и цены показаны как образец вёрстки."} <a href="${e(c.builtByUrl || "../../qora/")}" target="_blank" rel="noopener">QORA →</a></div>`
    : "";

  /* ---------- data for the cart ---------- */
  const data = {
    slug: c.slug, name: c.name, currency: cur,
    categories: c.categories || [],
    items: (c.items || []).map(i => ({ id: i.id, cat: i.cat, name: i.name, desc: i.desc, price: i.price, img: i.img, unit: i.unit })),
    hue: A.h,
    order: c.order || { channel: "whatsapp", handle: (ct.phone || "").replace(/\D/g, "") },
  };

  return TPL
    .replace("<body>", c.demo ? '<body class="has-demo">' : "<body>")
    .replace("<!--SSR:DEMOBAR-->", demoBar)
    .replace("<!--SSR:HEAD-->", head)
    .replace(/<!--SSR:ACCENT-->/g, c.accent || "#c9a227")
    .replace("<!--SSR:SOFT-->", `hsl(${A.h} ${A.s}% ${A.l}% / .14)`)
    .replace("<!--SSR:GLOW-->", `hsl(${A.h} ${A.s}% ${A.l}% / .20)`)
    .replace(/<!--SSR:BRAND-->/g, e(c.brand || c.name))
    .replace("<!--SSR:NAVLINKS-->", navLinks)
    .replace(/<!--SSR:TELHREF-->/g, e(tel))
    .replace("<!--SSR:HEROIMG-->", heroImg)
    .replace("<!--SSR:HERO-->", hero)
    .replace("<!--SSR:FEATS-->", feats)
    .replace("<!--SSR:FEATCOLS-->", String((c.feats || []).length || 3))
    .replace("<!--SSR:MENUTITLE-->", e(c.menuTitle || "Что у нас есть"))
    .replace("<!--SSR:MENUSUB-->", e(c.menuSub || "Выберите блюда — заказ уйдёт нам в мессенджер за пару секунд."))
    .replace("<!--SSR:TABS-->", tabs)
    .replace("<!--SSR:ABOUT-->", about)
    .replace("<!--SSR:CTTITLE-->", e(c.ctTitle || "Как нас найти"))
    .replace("<!--SSR:CONTACTS-->", contacts)
    .replace("<!--SSR:SOCIALS-->", socials)
    .replace("<!--SSR:FOOTER-->", footer)
    .replace("/*__DATA__*/{}", JSON.stringify(data));
}

/* ---------------- run ---------------- */
const only = process.argv[2];
const files = fs.readdirSync(CLIENTS).filter(f => f.endsWith(".json")).filter(f => !only || f.startsWith(only));
if (!files.length) { console.error("Нет клиентов в engine/clients/"); process.exit(1); }

let total = 0;
for (const f of files) {
  const c = JSON.parse(fs.readFileSync(path.join(CLIENTS, f), "utf8"));
  const html = build(c);
  const dir = path.join(OUT, c.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
  total += html.length;
  console.log(`  ✓ demo/${c.slug}/index.html  ${(html.length / 1024).toFixed(1)} КБ  ·  ${(c.items || []).length} позиций`);
}
console.log(`\nСобрано сайтов: ${files.length}, общий вес ${(total / 1024).toFixed(1)} КБ`);
