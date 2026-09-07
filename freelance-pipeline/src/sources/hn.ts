/* Hacker News: ежемесячный тред «Freelancer? Seeking freelancer?».
   Публичный Algolia API, без ключей. Посты нанимателей начинаются с SEEKING FREELANCER. */
import type { Source, SourceContext } from './base.js';
import { getJson } from './base.js';
import type { RawItem } from '../types.js';

interface Hit { objectID: string; title: string; created_at: string }
interface Item { id: number; text?: string | null; author?: string; created_at: string; children?: Item[] }

export async function findLatestThread(f: typeof fetch, query: string): Promise<Hit | null> {
  const q = encodeURIComponent(query);
  const r = await getJson<{ hits: Hit[] }>(f, `https://hn.algolia.com/api/v1/search_by_date?query=${q}&tags=story,author_whoishiring&hitsPerPage=5`);
  const hit = r.hits.find(h => /seeking freelancer/i.test(h.title));
  return hit ?? null;
}

export function itemsFromThread(thread: Item, threadId: string): RawItem[] {
  const out: RawItem[] = [];
  for (const c of thread.children || []) {
    if (!c.text) continue;
    const text = decode(c.text);
    if (!/^\s*seeking\s+freelancer/i.test(text)) continue;         // только наниматели
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
    const title = (lines[0] || '').replace(/^seeking\s+freelancer\s*[|:\-–—]?\s*/i, '').slice(0, 140) || 'Seeking freelancer';
    out.push({
      source: 'hn', externalId: String(c.id), url: `https://news.ycombinator.com/item?id=${c.id}`,
      title, text, postedAt: c.created_at, client: c.author ? { name: c.author } : null,
      raw: { threadId },
    });
  }
  return out;
}
function decode(html: string) {
  return html.replace(/<p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&#x2F;/g, '/').trim();
}

export const hn: Source = {
  id: 'hn',
  enabled: ctx => ctx.config.sources.hn.enabled,
  async fetch(ctx: SourceContext) {
    const thread = await findLatestThread(ctx.fetch, ctx.config.sources.hn.thread_query);
    if (!thread) return [];
    const full = await getJson<Item>(ctx.fetch, `https://hn.algolia.com/api/v1/items/${thread.objectID}`);
    return itemsFromThread(full, thread.objectID);
  },
};
