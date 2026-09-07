/* Reddit: публичные RSS-ленты подразделов. Ключи не нужны, лимиты мягкие при разумной частоте. */
import { XMLParser } from 'fast-xml-parser';
import type { Source, SourceContext } from './base.js';
import { getText, stripHtml } from './base.js';
import type { RawItem } from '../types.js';

export function parseAtom(xml: string, sub: string, titleMustMatch: RegExp): RawItem[] {
  const p = new XMLParser({ ignoreAttributes: false });
  const doc = p.parse(xml);
  const entries = doc?.feed?.entry;
  const list: any[] = Array.isArray(entries) ? entries : entries ? [entries] : [];
  const out: RawItem[] = [];
  for (const e of list) {
    const title = String(e.title ?? '').trim();
    if (!titleMustMatch.test(title)) continue;
    const link = typeof e.link === 'object' ? e.link?.['@_href'] : e.link;
    const content = typeof e.content === 'object' ? e.content?.['#text'] : e.content;
    const text = stripHtml(String(content ?? '')).replace(/submitted by.*$/s, '').trim();
    const id = String(e.id ?? link ?? title);
    out.push({
      source: 'reddit', externalId: id.replace(/^t3_/, ''), url: link ? String(link) : null,
      title: title.replace(/\[hiring\]\s*/i, '').replace(/\[task\]\s*/i, '').trim(), text: text || title,
      postedAt: e.published ? new Date(String(e.published)).toISOString() : null,
      client: e.author?.name ? { name: String(e.author.name) } : null, raw: { sub },
    });
  }
  return out;
}

export const reddit: Source = {
  id: 'reddit',
  enabled: ctx => ctx.config.sources.reddit.enabled,
  async fetch(ctx: SourceContext) {
    const re = new RegExp(ctx.config.sources.reddit.title_must_match, 'i');
    const all: RawItem[] = [];
    for (const sub of ctx.config.sources.reddit.subreddits) {
      const xml = await getText(ctx.fetch, `https://www.reddit.com/r/${sub}/new/.rss?limit=50`);
      all.push(...parseAtom(xml, sub, re));
    }
    return all;
  },
};
