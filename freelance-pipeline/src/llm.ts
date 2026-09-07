/* Все обращения к Claude. Стабильный префикс (рубрика + профиль + кейсы) кэшируется:
   при опросе каждые 5 минут почти каждый запрос попадает в кэш. */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { Config } from './config.js';
import type { Opportunity, LlmScore, Proposal, Scored } from './types.js';
import { log } from './log.js';

const L = log('llm');

/* Цены за 1M токенов — для учёта стоимости, не для биллинга */
const PRICE: Record<string, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  'claude-haiku-4-5': { in: 1, out: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  'claude-sonnet-5': { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-opus-5': { in: 5, out: 25, cacheRead: 0.5, cacheWrite: 6.25 },
};
export function costOf(model: string, u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): number {
  const p = PRICE[model] ?? PRICE['claude-opus-5'];
  return (u.input_tokens * p.in + u.output_tokens * p.out + (u.cache_read_input_tokens ?? 0) * p.cacheRead +
    (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) / 1e6;
}

const Factor = z.number().min(0).max(1);
export const LlmScoreSchema = z.object({
  factors: z.object({ fit: Factor, money: Factor, ai_leverage: Factor, client: Factor, speed: Factor, competition: Factor, repeat: Factor, risk: Factor }),
  est_hours: z.number().min(0.25).max(400),
  budget_usd_estimate: z.number().min(0),
  service_key: z.string(),
  summary: z.string(),
  missing_info: z.array(z.string()),
  red_flags: z.array(z.string()),
  risk_level: z.enum(['low', 'medium', 'high']),
  rationale: z.string(),
});
export const ProposalsSchema = z.object({
  short: z.string(), professional: z.string(), conversion: z.string(),
});
export const ReplySchema = z.object({
  intent: z.string(), needs_answer: z.array(z.string()), risk: z.enum(['low', 'medium', 'high']), risk_note: z.string(), reply: z.string(),
});
export type ReplyAnalysis = z.infer<typeof ReplySchema>;

let client: Anthropic | null = null;
function api(cfg: Config): Anthropic {
  if (!cfg.env.anthropicKey) throw new Error('Нет ANTHROPIC_API_KEY в .env');
  return client ??= new Anthropic({ apiKey: cfg.env.anthropicKey });
}

/* Профиль и кейсы одним куском — он не меняется от запроса к запросу, поэтому кэшируется */
export function profileBlock(cfg: Config): string {
  const p = cfg.profile;
  const services = p.services.map(s =>
    `- ${s.key}: ${s.name}; обычно ${s.typical_hours[0]}–${s.typical_hours[1]} ч; доля AI ${Math.round(s.ai_leverage * 100)}%`).join('\n');
  const cases = cfg.cases.length ? cfg.cases.map(c =>
    `### ${c.title}${c.url ? ` (${c.url})` : ''}\nуслуги: ${c.services.join(', ')}${c.budget_usd ? `; бюджет $${c.budget_usd}` : ''}${c.hours ? `; ${c.hours} ч` : ''}\n${c.body}`).join('\n\n')
    : '(кейсов пока нет)';
  return `## Исполнитель
Имя: ${p.name || '(не указано)'}
Языки: ${p.languages.join(', ')}
Целевая ставка: $${p.target_hourly_usd}/час. Потолок на заказ: ${p.max_hours_per_order} ч. Минимальный бюджет: $${p.min_budget_usd}.
Режим: ${p.mode === 'reviews' ? 'набрать первые отзывы — скорость и надёжность важнее цены' : 'максимальная прибыль за час'}.

## Услуги
${services}

## Кейсы
${cases}`;
}

function oppBlock(o: Opportunity): string {
  const c = o.client;
  const client = c ? [c.name && `имя: ${c.name}`, c.country && `страна: ${c.country}`, c.verified != null && `оплата подтверждена: ${c.verified ? 'да' : 'нет'}`,
    c.rating != null && `рейтинг: ${c.rating}`, c.reviews != null && `отзывов: ${c.reviews}`, c.hires != null && `наймов: ${c.hires}`].filter(Boolean).join(', ') : 'нет данных';
  return `## Заказ
Площадка: ${o.platform} (источник ${o.source})
Заголовок: ${o.title}
Опубликован: ${o.postedAt ?? 'неизвестно'}
Бюджет: ${o.budgetMin != null || o.budgetMax != null ? `${o.budgetMin ?? '?'}–${o.budgetMax ?? '?'} ${o.currency ?? ''} (${o.budgetType ?? 'fixed'})` : 'не указан'}${o.budgetUsd != null ? ` ≈ $${o.budgetUsd}` : ''}
Откликов: ${o.proposals ?? 'неизвестно'}
Навыки: ${o.skills.join(', ') || '—'}
Клиент: ${client}
Ссылка: ${o.url ?? '—'}

### Описание
${o.text.slice(0, 6000)}`;
}

export async function scoreWithLlm(o: Opportunity, cfg: Config): Promise<{ score: LlmScore; costUsd: number; model: string }> {
  const model = cfg.models.score;
  const r = await api(cfg).messages.parse({
    model, max_tokens: 1500,
    system: [
      { type: 'text', text: cfg.prompts.score + '\n\n' + profileBlock(cfg), cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: oppBlock(o) }],
    output_config: { format: zodOutputFormat(LlmScoreSchema) },
  });
  if (r.stop_reason === 'refusal') throw new Error('модель отказалась оценивать этот заказ');
  if (!r.parsed_output) throw new Error('модель вернула не JSON');
  const costUsd = costOf(model, r.usage);
  L.debug(`score ${o.id}: cache_read=${r.usage.cache_read_input_tokens ?? 0} in=${r.usage.input_tokens} out=${r.usage.output_tokens} $${costUsd.toFixed(4)}`);
  return { score: r.parsed_output, costUsd, model };
}

/* Отклики — сильная модель, с запасным маршрутом на случай отказа классификатора */
export async function writeProposals(o: Opportunity, s: Scored, cfg: Config): Promise<{ list: Proposal[]; costUsd: number }> {
  const model = cfg.models.proposal;
  const context = `${oppBlock(o)}

## Что уже понятно из оценки
Суть: ${s.summary}
Оценка часов: ${s.est_hours}. Услуга: ${s.service_key}. Риск: ${s.risk_level}.
Чего не хватает в ТЗ: ${s.missing_info.join('; ') || 'всё ясно'}
Язык отклика: ${o.lang === 'ru' ? 'русский' : 'английский'}`;
  const r = await api(cfg).beta.messages.create({
    model, max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: zodOutputFormat(ProposalsSchema) },
    system: [{ type: 'text', text: cfg.prompts.proposal + '\n\n' + profileBlock(cfg), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: context }],
  });
  if (r.stop_reason === 'refusal') throw new Error('модель отказалась писать отклик');
  const text = r.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
  const parsed = ProposalsSchema.parse(JSON.parse(text));
  return {
    list: [{ variant: 'short', text: parsed.short }, { variant: 'professional', text: parsed.professional }, { variant: 'conversion', text: parsed.conversion }],
    costUsd: costOf(model, r.usage),
  };
}

export async function analyzeReply(projectContext: string, clientMessage: string, cfg: Config): Promise<{ analysis: ReplyAnalysis; costUsd: number }> {
  const model = cfg.models.reply;
  const r = await api(cfg).beta.messages.create({
    model, max_tokens: 2500,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: zodOutputFormat(ReplySchema) },
    system: [{ type: 'text', text: cfg.prompts.reply + '\n\n' + profileBlock(cfg), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `## Проект\n${projectContext}\n\n## Сообщение клиента\n${clientMessage}` }],
  });
  if (r.stop_reason === 'refusal') throw new Error('модель отказалась разбирать сообщение');
  const text = r.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
  return { analysis: ReplySchema.parse(JSON.parse(text)), costUsd: costOf(model, r.usage) };
}

/* Ошибки API — понятным языком, без ключей */
export function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'Claude: неверный API-ключ';
  if (e instanceof Anthropic.RateLimitError) return 'Claude: превышен лимит запросов, повторю позже';
  if (e instanceof Anthropic.BadRequestError) return 'Claude: некорректный запрос — ' + e.message;
  if (e instanceof Anthropic.APIConnectionError) return 'Claude: нет связи с API';
  if (e instanceof Anthropic.APIError) return `Claude: ошибка ${e.status} — ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}
