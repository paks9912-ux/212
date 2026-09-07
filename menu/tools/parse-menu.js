/* Разбор меню, скопированного из Instagram / Excel / сообщения в Telegram.
   Понимает строки вида:
     Категория:            "== Роллы ==", "Роллы:", строка без цены
     Позиция:              "Филадельфия — 68 000"
                           "Филадельфия | лосось, сыр | 260 г | 68000"
                           "2. Калифорния 59000 сум"                        */
'use strict';
function parseMenu(text) {
  const lines = String(text).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const cats = [];
  let cur = null;
  /* цена — отдельный токен в конце строки: "68 000", "59000", "68.000" */
  const priceRe = /(?:^|[\s—–\-:|,])((?:\d{1,3}(?:[\s  .]\d{3})+)|\d{3,9})\s*(?:сум|so'?m|uzs|₸|руб|\$)?\s*$/i;
  const isWeight = p => /^[\d.,]+\s*(?:г|гр|мл|шт|кг|л)\.?$/i.test(p);

  for (let raw of lines) {
    let line = raw.replace(/^[-•*]\s*/, '').replace(/^\d+[.)]\s*/, '');
    const head = line.match(/^[=#]+\s*(.+?)\s*[=#]*$/);
    if (head) { cur = { name: head[1].replace(/:$/, ''), items: [] }; cats.push(cur); continue; }

    const parts = line.split('|').map(s => s.trim());
    let name = parts[0], desc = '', weight = '', priceStr = null;

    if (parts.length > 1) {
      priceStr = parts[parts.length - 1];
      const mid = parts.slice(1, -1);
      mid.forEach(p => { if (isWeight(p)) weight = p; else desc = desc ? desc + ', ' + p : p; });
    } else {
      const m = line.match(priceRe);
      if (m) { priceStr = m[1]; name = line.slice(0, m.index).replace(/[—–\-:|,.\s]+$/, '').trim(); }
    }

    const price = priceStr ? Number(String(priceStr).replace(/[^\d]/g, '')) : NaN;
    if (!priceStr || !isFinite(price) || price <= 0 || !name) {
      // строка без цены — считаем заголовком категории
      if (line.length <= 40) { cur = { name: line.replace(/:$/, ''), items: [] }; cats.push(cur); }
      continue;
    }
    const wm = name.match(/([\d.,]+\s*(?:г|гр|мл|шт|кг|л)\.?)\s*$/i);
    if (wm && !weight) { weight = wm[1]; name = name.slice(0, wm.index).trim(); }
    if (!cur) { cur = { name: 'Меню', items: [] }; cats.push(cur); }
    cur.items.push({ name, desc: desc || undefined, weight: weight || undefined, price });
  }
  return cats.filter(c => c.items.length);
}
if (typeof module !== 'undefined') module.exports = { parseMenu };
