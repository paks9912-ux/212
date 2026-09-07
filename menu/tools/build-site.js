#!/usr/bin/env node
/* Сборка готового сайта-меню: shops/<id>.json + template.html -> dist/<id>.html
   Один файл, без сервера и без зависимостей. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const TPL = fs.readFileSync(path.join(ROOT, 'template.html'), 'utf8');

function build(shopFile) {
  const shop = JSON.parse(fs.readFileSync(shopFile, 'utf8'));
  if (!shop.id) shop.id = path.basename(shopFile, '.json');

  const errs = [];
  if (!shop.name) errs.push('нет name');
  if (!shop.whatsapp && !shop.telegram && !shop.phone) errs.push('нет ни одного канала связи (whatsapp/telegram/phone)');
  if (!Array.isArray(shop.categories) || !shop.categories.length) errs.push('нет categories');
  const ids = new Set();
  (shop.categories || []).forEach((c, ci) => {
    (c.items || []).forEach((it, ii) => {
      if (!it.id) it.id = 'i' + ci + '_' + ii;
      if (ids.has(it.id)) errs.push('дубль id блюда: ' + it.id);
      ids.add(it.id);
      if (typeof it.price !== 'number' || it.price < 0) errs.push('цена не число: ' + (it.name || it.id));
    });
  });
  if (errs.length) throw new Error(shop.id + ': ' + errs.join('; '));

  const title = shop.name + (shop.tagline ? ' — ' + shop.tagline : '');
  const desc = (shop.tagline || shop.name) + '. Заказ онлайн: ' +
    ((shop.delivery && shop.delivery.zone) ? shop.delivery.zone : 'доставка и самовывоз') + '.';

  const html = TPL
    .replace('__SHOP_JSON__', JSON.stringify(shop, null, 0))
    .replace('__TITLE__', title.replace(/[<>]/g, ''))
    .replace('__DESC__', desc.replace(/["<>]/g, ''))
    .replace('__ACCENT__', shop.accent || '#ff5a3c');

  const outDir = path.join(ROOT, 'dist');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, shop.id + '.html');
  fs.writeFileSync(out, html);

  const n = (shop.categories || []).reduce((s, c) => s + (c.items || []).length, 0);
  return { out, n, kb: (Buffer.byteLength(html) / 1024).toFixed(0) };
}

const args = process.argv.slice(2);
const files = args.length ? args
  : fs.readdirSync(path.join(ROOT, 'shops'))
      .filter(f => f.endsWith('.json') && !f.startsWith('lead-'))   // lead-* — заготовки под демо, собираются по требованию
      .map(f => path.join(ROOT, 'shops', f));
let ok = 0;
for (const f of files) {
  try { const r = build(f); console.log('OK  ' + path.relative(ROOT, r.out) + '  (' + r.n + ' позиций, ' + r.kb + ' KB)'); ok++; }
  catch (e) { console.error('ERR ' + e.message); process.exitCode = 1; }
}
console.log('Собрано сайтов: ' + ok);
