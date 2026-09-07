/* Приведение сырого заказа к общей схеме: язык, бюджет в долларах, ключ дедупликации */
import crypto from 'node:crypto';
import type { RawItem, Opportunity, Platform } from '../types.js';

export function detectLang(text: string): 'ru' | 'en' | 'other' {
  const letters = (text.match(/[A-Za-zА-Яа-яЁё]/g) || []).length;
  if (letters < 10) return 'other';
  const cyr = (text.match(/[А-Яа-яЁё]/g) || []).length;
  const share = cyr / letters;
  if (share > 0.4) return 'ru';
  if (share < 0.1) return 'en';
  return 'other';
}

/* Ищем деньги в тексте: «$300», «300$», «до 20 000 руб», «бюджет 500 USD», «€250», «15k» */
const CUR: Array<[RegExp, string]> = [
  [/\$|usd|доллар|бакс/i, 'USD'], [/€|eur|евро/i, 'EUR'], [/£|gbp/i, 'GBP'],
  [/₽|руб|rub|р\.|тыс\.?\s*руб/i, 'RUB'], [/сум|uzs/i, 'UZS'], [/₸|тенге|kzt/i, 'KZT'],
  [/₴|грн|uah/i, 'UAH'], [/₹|inr|rupee/i, 'INR'],
];
export function parseBudget(text: string): { min: number | null; max: number | null; currency: string | null } {
  const t = text.replace(/\u00a0/g, ' ');
  const re = /([$€£₽₴₸₹])?\s?(\d{1,3}(?:[ ,]\d{3})+|\d+(?:[.,]\d+)?)\s?(k|к|тыс\.?)?(?![a-zа-яё\d])\s?(\$|€|£|₽|₴|₸|₹|usd|eur|gbp|rub|руб\w*|сум\w*|uzs|kzt|тенге|uah|грн\w*|inr|долл\w*|евро|бакс\w*|р\.)?/gi;
  const found: Array<{ v: number; cur: string | null; idx: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const sym = (m[1] || m[4] || '').trim();
    if (!sym) continue;                                  // голое число — не бюджет
    let v = parseFloat(m[2].replace(/[ ,]/g, '').replace(/\.(?=\d{3}$)/, ''));
    if (!isFinite(v)) continue;
    if (m[3]) v *= 1000;
    if (v < 5 || v > 5e8) continue;
    const cur = CUR.find(([r]) => r.test(sym))?.[1] ?? null;
    found.push({ v, cur, idx: m.index });
  }
  if (!found.length) return { min: null, max: null, currency: null };
  const cur = found.find(f => f.cur)?.cur ?? null;
  const vals = found.filter(f => !f.cur || f.cur === cur).map(f => f.v);
  const min = Math.min(...vals), max = Math.max(...vals);
  return { min, max: max === min ? null : max, currency: cur };
}

export function toUsd(amount: number | null, currency: string | null, rates: Record<string, number>): number | null {
  if (amount == null) return null;
  const r = rates[(currency || 'USD').toUpperCase()];
  return r ? Math.round(amount * r) : null;
}

/* Ключ дедупликации: те же слова заголовка в другом порядке — тот же заказ */
export function dedupKey(title: string, text: string): string {
  const base = (title + ' ' + text.slice(0, 200)).toLowerCase()
    .replace(/[^a-zа-яё0-9 ]/gi, ' ').split(/\s+/).filter(w => w.length > 3).sort().slice(0, 24).join(' ');
  return crypto.createHash('sha1').update(base).digest('hex').slice(0, 16);
}

export function platformOf(item: RawItem): Platform {
  if (item.platform) return item.platform;
  if (item.source === 'manual' && item.url) {
    const h = safeHost(item.url);
    if (/upwork\.com$/.test(h)) return 'upwork';
    if (/freelancer\.com$/.test(h)) return 'freelancer';
    if (/kwork\.(ru|com)$/.test(h)) return 'kwork';
    if (/fl\.ru$/.test(h)) return 'fl';
    if (/t\.me$/.test(h)) return 'telegram';
    return 'other';
  }
  return item.source as Platform;
}
function safeHost(u: string) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }

export function normalize(item: RawItem, rates: Record<string, number>): Opportunity {
  const text = item.text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const title = item.title.replace(/\s+/g, ' ').trim().slice(0, 160) || text.split('\n')[0].slice(0, 120);
  let { budgetMin = null, budgetMax = null, currency = null } = item;
  if (budgetMin == null && budgetMax == null) {
    const p = parseBudget(title + '\n' + text);
    budgetMin = p.min; budgetMax = p.max; currency = p.currency;
  }
  const mid = budgetMin != null && budgetMax != null ? (budgetMin + budgetMax) / 2 : (budgetMax ?? budgetMin);
  const id = crypto.createHash('sha1').update(item.source + ':' + item.externalId).digest('hex').slice(0, 12);
  return {
    id, source: item.source, platform: platformOf(item), externalId: item.externalId, url: item.url,
    title, text, lang: detectLang(title + ' ' + text), postedAt: item.postedAt, fetchedAt: new Date().toISOString(),
    budgetMin, budgetMax, currency, budgetUsd: toUsd(mid, currency, rates),
    budgetType: item.budgetType ?? null, proposals: item.proposals ?? null, skills: item.skills ?? [],
    client: item.client ?? null, status: 'new', filterReason: null, dedupKey: dedupKey(title, text),
  };
}
