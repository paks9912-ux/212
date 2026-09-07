/* Общий контракт адаптера: отдаёт сырые заказы, ничего не пишет в базу сам */
import type { RawItem } from '../types.js';
import type { Config } from '../config.js';
import type { DB } from '../db/index.js';

export interface SourceContext { config: Config; db: DB; fetch: typeof fetch }
export interface Source {
  id: RawItem['source'];
  enabled(ctx: SourceContext): boolean;
  fetch(ctx: SourceContext): Promise<RawItem[]>;
}

export const UA = 'freelance-pipeline/0.1 (personal job feed; contact via profile)';

export async function getJson<T>(f: typeof fetch, url: string, init?: RequestInit): Promise<T> {
  const r = await f(url, { ...init, headers: { 'user-agent': UA, accept: 'application/json', ...(init?.headers || {}) }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json() as Promise<T>;
}
export async function getText(f: typeof fetch, url: string, init?: RequestInit): Promise<string> {
  const r = await f(url, { ...init, headers: { 'user-agent': UA, ...(init?.headers || {}) }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.text();
}
/* HTML → текст без библиотек: хватает для описаний заказов */
export function stripHtml(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#x2F;/g, '/').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
