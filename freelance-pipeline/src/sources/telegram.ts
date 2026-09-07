/* Telegram: чтение публичных каналов пользовательским клиентом (MTProto).
   Нужны api_id/api_hash с my.telegram.org и сессия из npm run tg:login.
   Читаем только историю каналов из списка, ничего не пишем и никуда не вступаем. */
import type { Source, SourceContext } from './base.js';
import type { RawItem } from '../types.js';

export function itemFromMessage(channel: string, msg: { id: number; message?: string; date?: number }): RawItem | null {
  const text = (msg.message || '').trim();
  if (text.length < 30) return null;
  const first = text.split('\n').map(s => s.trim()).find(Boolean) || '';
  return {
    source: 'telegram', externalId: `${channel}:${msg.id}`, url: `https://t.me/${channel}/${msg.id}`,
    title: first.replace(/^#\S+\s*/g, '').slice(0, 120), text,
    postedAt: msg.date ? new Date(msg.date * 1000).toISOString() : null, raw: { channel },
  };
}

/* Ищем признаки заказа, а не болтовни: канал может быть смешанным */
export function looksLikeJob(text: string): boolean {
  const t = text.toLowerCase();
  const job = /(#(заказ|вакансия|ищу|нужен|нужна|задача|работа|job|hiring)|\bищу\b|\bнужен\b|\bнужна\b|\bтребуется\b|\bищем\b|\bбюджет\b|\boплата\b|\bhiring\b|\blooking for\b|\bneed (a|an)\b|\bbudget\b)/;
  const notJob = /(#резюме|#ищуработу|#resume|ищу работу|ищу заказы|готов взять|предлагаю услуги|#услуги|for hire\b)/;
  return job.test(t) && !notJob.test(t);
}

export const telegram: Source = {
  id: 'telegram',
  enabled: ctx => ctx.config.sources.telegram.enabled && !!ctx.config.env.tgApiId && !!ctx.config.env.tgApiHash && !!ctx.config.env.tgSession,
  async fetch(ctx: SourceContext) {
    const { TelegramClient } = await import('teleproto');
    const { StringSession } = await import('teleproto/sessions/index.js');
    const { env, sources } = ctx.config;
    const client = new TelegramClient(new StringSession(env.tgSession!), env.tgApiId!, env.tgApiHash!, { connectionRetries: 3 });
    await client.connect();
    const out: RawItem[] = [];
    try {
      for (const ch of sources.telegram.channels) {
        const key = `tg:last:${ch}`;
        const minId = Number(ctx.db.getState(key) || 0);
        const msgs = await client.getMessages(ch, { limit: sources.telegram.messages_per_channel, minId });
        let maxId = minId;
        for (const m of msgs) {
          maxId = Math.max(maxId, m.id);
          const item = itemFromMessage(ch, { id: m.id, message: m.message, date: m.date });
          if (item && looksLikeJob(item.text)) out.push(item);
        }
        if (maxId > minId) ctx.db.setState(key, String(maxId));
        await new Promise(r => setTimeout(r, 800));      // не долбим API
      }
    } finally {
      await client.disconnect();
    }
    return out;
  },
};
