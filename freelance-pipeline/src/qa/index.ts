/* QA перед сдачей сайта: прогоняет страницу в трёх размерах экрана и находит то,
   что заказчик заметит первым. Запуск: npm run qa -- <url | путь к html> [--external]
   Отчёт: qa-reports/<дата>.md и .json. Код выхода 1, если есть критичные проблемы. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium, type Browser, type Page } from 'playwright';

type Severity = 'critical' | 'major' | 'minor';
interface Finding { severity: Severity; area: string; viewport?: string; message: string; hint?: string }

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812, isMobile: true },
  { name: 'tablet', width: 820, height: 1180, isMobile: true },
  { name: 'desktop', width: 1440, height: 900, isMobile: false },
];

export async function runQa(target: string, opts: { external?: boolean; browserPath?: string } = {}): Promise<{ findings: Finding[]; url: string; report: string }> {
  const { url, close } = await serveIfLocal(target);
  const browser = await chromium.launch({ executablePath: opts.browserPath || process.env.QA_BROWSER_PATH || undefined });
  const findings: Finding[] = [];
  try {
    for (const vp of VIEWPORTS) await checkViewport(browser, url, vp, findings, opts.external ?? false);
  } finally {
    await browser.close();
    await close();
  }
  dedupe(findings);
  findings.sort((a, b) => rank(a.severity) - rank(b.severity));
  return { findings, url, report: render(target, findings) };
}

async function checkViewport(browser: Browser, url: string, vp: typeof VIEWPORTS[number], out: Finding[], external: boolean) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile, deviceScaleFactor: vp.isMobile ? 2 : 1 });
  const page = await ctx.newPage();
  const consoleErrors: string[] = [], pageErrors: string[] = [], failed: string[] = [];
  let bytes = 0, requests = 0;
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('requestfailed', r => failed.push(`${r.url()} — ${r.failure()?.errorText ?? 'failed'}`));
  page.on('response', async r => {
    requests++;
    if (r.status() >= 400) failed.push(`${r.url()} — HTTP ${r.status()}`);
    try { const b = await r.body(); bytes += b.length; } catch { /* потоковые ответы не считаем */ }
  });

  const t0 = Date.now();
  try { await page.goto(url, { waitUntil: 'load', timeout: 30000 }); }
  catch (e) { out.push({ severity: 'critical', area: 'загрузка', viewport: vp.name, message: 'страница не загрузилась: ' + (e instanceof Error ? e.message : e) }); await ctx.close(); return; }
  const loadMs = Date.now() - t0;
  await page.waitForTimeout(600);

  const v = vp.name;
  for (const e of pageErrors) out.push({ severity: 'critical', area: 'JS', viewport: v, message: 'ошибка скрипта: ' + e.slice(0, 200) });
  for (const e of consoleErrors) out.push({ severity: 'major', area: 'консоль', viewport: v, message: e.slice(0, 200) });
  for (const f of failed) out.push({ severity: /HTTP 4|HTTP 5/.test(f) ? 'major' : 'minor', area: 'запросы', viewport: v, message: f.slice(0, 200) });

  /* только на первом размере: метаданные, ссылки, картинки, формы, производительность */
  if (vp.name === 'mobile') {
    const meta = await page.evaluate(() => ({
      title: document.title, lang: document.documentElement.lang,
      description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      viewport: !!document.querySelector('meta[name="viewport"]'),
      favicon: !!document.querySelector('link[rel*="icon"]'),
      h1: document.querySelectorAll('h1').length,
      imgs: [...document.images].map(i => ({ src: i.currentSrc || i.src, alt: i.alt, w: i.naturalWidth, lazy: i.loading })),
      links: [...document.querySelectorAll('a[href]')].map(a => (a as HTMLAnchorElement).href),
      forms: [...document.forms].map(f => ({ action: f.getAttribute('action') || f.getAttribute('data-endpoint') || '', method: f.method, inputs: f.querySelectorAll('input,textarea,select').length,
        required: f.querySelectorAll('[required]').length, submit: !!f.querySelector('button[type=submit],input[type=submit],button:not([type])') })),
      unnamedButtons: [...document.querySelectorAll('button, a[role=button]')].filter(b => !(b.textContent || '').trim() && !b.getAttribute('aria-label') && !b.querySelector('img[alt]')).length,
    }));
    if (!meta.title) out.push({ severity: 'major', area: 'мета', message: 'нет <title>' });
    if (!meta.description) out.push({ severity: 'minor', area: 'мета', message: 'нет meta description', hint: 'важно для превью в мессенджерах и поиске' });
    if (!meta.viewport) out.push({ severity: 'critical', area: 'мобильная версия', message: 'нет meta viewport — страница не масштабируется на телефоне' });
    if (!meta.lang) out.push({ severity: 'minor', area: 'мета', message: 'у <html> нет атрибута lang' });
    if (!meta.favicon) out.push({ severity: 'minor', area: 'мета', message: 'нет favicon' });
    if (meta.h1 !== 1) out.push({ severity: 'minor', area: 'структура', message: `заголовков h1: ${meta.h1}, должен быть один` });
    if (meta.unnamedButtons) out.push({ severity: 'minor', area: 'доступность', message: `кнопок без текста и aria-label: ${meta.unnamedButtons}` });

    for (const img of meta.imgs) {
      if (img.w === 0) out.push({ severity: 'major', area: 'картинки', message: 'битая картинка: ' + short(img.src) });
      if (!img.alt) out.push({ severity: 'minor', area: 'картинки', message: 'без alt: ' + short(img.src) });
    }
    for (const f of meta.forms) {
      if (!f.submit) out.push({ severity: 'major', area: 'формы', message: 'у формы нет кнопки отправки' });
      if (!f.action) out.push({ severity: 'major', area: 'формы', message: 'у формы не задан action или data-endpoint — заявки никуда не уйдут', hint: 'укажите вебхук n8n или обработчик' });
      if (f.inputs && !f.required) out.push({ severity: 'minor', area: 'формы', message: 'в форме нет обязательных полей — придут пустые заявки' });
    }

    /* ссылки: якоря и внутренние проверяем всегда, внешние — по флагу */
    const seen = new Set<string>();
    const origin = new URL(url).origin;
    for (const href of meta.links) {
      if (seen.has(href) || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;
      seen.add(href);
      if (href.includes('#')) {
        const id = href.split('#')[1];
        if (id.startsWith('/') || id.startsWith('!')) continue;              // маршрут hash-роутера, не якорь
        if (id && href.split('#')[0].replace(/\/$/, '') === url.split('#')[0].replace(/\/$/, '')) {
          const exists = await page.evaluate(i => !!document.getElementById(i) || !!document.querySelector(`[name="${i}"]`), id);
          if (!exists) out.push({ severity: 'major', area: 'ссылки', message: `якорь #${id} никуда не ведёт` });
          continue;
        }
      }
      const internal = href.startsWith(origin);
      if (!internal && !external) continue;
      try {
        const r = await page.request.fetch(href, { method: 'GET', maxRedirects: 5, timeout: 10000 });
        if (r.status() >= 400) out.push({ severity: internal ? 'major' : 'minor', area: 'ссылки', message: `${r.status()} на ${short(href)}` });
      } catch { out.push({ severity: internal ? 'major' : 'minor', area: 'ссылки', message: 'не открывается: ' + short(href) }); }
    }

    if (loadMs > 3000) out.push({ severity: 'major', area: 'скорость', message: `загрузка ${(loadMs / 1000).toFixed(1)} с`, hint: 'сожмите картинки, уберите лишние скрипты' });
    if (bytes > 3e6) out.push({ severity: 'major', area: 'скорость', message: `страница весит ${(bytes / 1e6).toFixed(1)} МБ` });
    else if (bytes > 1.5e6) out.push({ severity: 'minor', area: 'скорость', message: `страница весит ${(bytes / 1e6).toFixed(1)} МБ` });
    if (requests > 60) out.push({ severity: 'minor', area: 'скорость', message: `${requests} запросов при загрузке` });
    const heavy = await page.evaluate(() => performance.getEntriesByType('resource').filter(r => (r as PerformanceResourceTiming).transferSize > 500_000).map(r => r.name));
    for (const h of heavy) out.push({ severity: 'minor', area: 'скорость', message: 'тяжёлый файл: ' + short(h) });
  }

  /* на каждом размере: горизонтальный скролл, мелкий текст, мелкие кнопки, обрезанный текст */
  const layout = await page.evaluate((mobile) => {
    const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
    const wideEls = overflow ? [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > window.innerWidth + 1 && el.getBoundingClientRect().width > 40)
      .slice(0, 3).map(el => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '')) : [];
    const small = [...document.querySelectorAll('p, li, a, span, td, label')].filter(el => {
      const cs = getComputedStyle(el); const t = (el.textContent || '').trim();
      return t.length > 20 && parseFloat(cs.fontSize) < 13 && cs.display !== 'none';
    }).length;
    const tinyTaps = mobile ? [...document.querySelectorAll('a, button, input[type=submit]')].filter(el => {
      const r = el.getBoundingClientRect(); return r.width > 0 && (r.width < 40 || r.height < 32);
    }).length : 0;
    const clipped = [...document.querySelectorAll('h1,h2,h3,p,a,button')].filter(el => {
      const cs = getComputedStyle(el);
      return cs.overflow === 'hidden' && cs.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 2;
    }).length;
    return { overflow, wideEls, small, tinyTaps, clipped };
  }, vp.isMobile);
  if (layout.overflow) out.push({ severity: 'critical', area: 'адаптив', viewport: v, message: 'горизонтальный скролл — что-то шире экрана' + (layout.wideEls.length ? ': ' + layout.wideEls.join(', ') : '') });
  if (layout.small > 3) out.push({ severity: 'minor', area: 'типографика', viewport: v, message: `${layout.small} блоков текста мельче 13px` });
  if (layout.tinyTaps > 2) out.push({ severity: 'major', area: 'мобильная версия', viewport: v, message: `${layout.tinyTaps} кнопок или ссылок меньше 40×32 — по ним трудно попасть пальцем` });
  if (layout.clipped) out.push({ severity: 'major', area: 'типографика', viewport: v, message: `${layout.clipped} элементов с обрезанным текстом` });

  await ctx.close();
}

function short(u: string) { return u.length > 90 ? u.slice(0, 60) + '…' + u.slice(-25) : u; }
function rank(s: Severity) { return s === 'critical' ? 0 : s === 'major' ? 1 : 2; }
function dedupe(list: Finding[]) {
  const seen = new Set<string>();
  for (let i = list.length - 1; i >= 0; i--) {
    const k = list[i].area + '|' + list[i].message;
    if (seen.has(k) && !list[i].viewport) list.splice(i, 1); else seen.add(k);
  }
}

/* локальный файл или папка → поднимаем статический сервер на случайном порту */
async function serveIfLocal(target: string): Promise<{ url: string; close: () => Promise<void> }> {
  if (/^https?:\/\//.test(target)) return { url: target, close: async () => {} };
  const abs = path.resolve(target);
  const isDir = fs.statSync(abs).isDirectory();
  const root = isDir ? abs : path.dirname(abs);
  const entry = isDir ? 'index.html' : path.basename(abs);
  const MIME: Record<string, string> = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.woff2': 'font/woff2' };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/' + entry;
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  });
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()));
  const port = (srv.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}/`, close: () => new Promise(r => srv.close(() => r())) };
}

function render(target: string, f: Finding[]): string {
  const n = (s: Severity) => f.filter(x => x.severity === s).length;
  const lines = [`# QA: ${target}`, ``, `${new Date().toLocaleString('ru-RU')} · критичных ${n('critical')} · серьёзных ${n('major')} · мелких ${n('minor')}`, ``];
  if (!f.length) lines.push('Проблем не найдено. Проверьте руками то, что скрипт не видит: смысл текстов, реальную отправку формы, поведение на настоящем телефоне.');
  for (const s of ['critical', 'major', 'minor'] as Severity[]) {
    const list = f.filter(x => x.severity === s);
    if (!list.length) continue;
    lines.push(`## ${s === 'critical' ? '🔴 Критично — не сдавать' : s === 'major' ? '🟠 Серьёзно — исправить' : '🟡 Мелочи — по возможности'}`);
    for (const x of list) lines.push(`- **${x.area}**${x.viewport ? ` (${x.viewport})` : ''}: ${x.message}${x.hint ? ` — _${x.hint}_` : ''}`);
    lines.push('');
  }
  lines.push('## Проверить руками', '- Форма реально доставляет заявку (отправьте тестовую)', '- Тексты без опечаток и «lorem ipsum»', '- Телефон и почта кликабельны и верные',
    '- На настоящем телефоне: клавиатура не ломает форму, шапка не прыгает', '- Все ссылки на соцсети ведут на аккаунты клиента', '');
  return lines.join('\n');
}

/* CLI */
const isMain = process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join('qa', 'index.ts'));
if (isMain) {
  const args = process.argv.slice(2);
  const target = args.find(a => !a.startsWith('--'));
  if (!target) { console.error('Использование: npm run qa -- <url | путь к html или папке> [--external]'); process.exit(2); }
  runQa(target, { external: args.includes('--external') }).then(({ findings, report }) => {
    const dir = path.resolve('qa-reports'); fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    fs.writeFileSync(path.join(dir, `${stamp}.md`), report);
    fs.writeFileSync(path.join(dir, `${stamp}.json`), JSON.stringify({ target, findings }, null, 2));
    console.log(report);
    console.log(`Отчёт: qa-reports/${stamp}.md`);
    process.exit(findings.some(f => f.severity === 'critical') ? 1 : 0);
  }).catch(e => { console.error('QA не удался:', e instanceof Error ? e.message : e); process.exit(2); });
}
