/* Ручная вставка: ссылка или текст заказа от вас — для Upwork, Kwork и всего, где API нет.
   По ссылке пробуем забрать страницу; если площадка не отдаёт без входа — просим текст. */
import crypto from 'node:crypto';
import type { RawItem } from '../types.js';
import { getText, stripHtml } from './base.js';

export async function itemFromInput(input: string, f: typeof fetch): Promise<RawItem> {
  const s = input.trim();
  const urlMatch = s.match(/https?:\/\/\S+/);
  const url = urlMatch ? urlMatch[0].replace(/[),.]+$/, '') : null;
  let text = s.replace(url || '', '').trim();
  let title = '';

  if (url && text.length < 40) {
    try {
      const html = await getText(f, url, { headers: { accept: 'text/html' } });
      const t = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
      const og = html.match(/property="og:description" content="([^"]*)"/i)?.[1];
      const body = stripHtml(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ''));
      title = stripHtml(t || '').slice(0, 140);
      text = [og ? stripHtml(og) : '', body.slice(0, 6000)].filter(Boolean).join('\n\n');
    } catch {
      /* закрытая страница — оставляем то, что есть; скоринг попросит текст */
    }
  }
  if (!title) title = text.split('\n').map(x => x.trim()).find(Boolean)?.slice(0, 120) || url || 'Заказ';
  const externalId = url ? crypto.createHash('sha1').update(url).digest('hex').slice(0, 16)
    : crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);
  return { source: 'manual', externalId, url, title, text: text || title, postedAt: new Date().toISOString() };
}
