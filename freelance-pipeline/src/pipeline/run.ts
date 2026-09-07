/* Оркестровка одного прохода: собрать → нормализовать → отфильтровать → оценить → показать лучшие */
import type { SourceContext } from '../sources/base.js';
import { SOURCES } from '../sources/index.js';
import { normalize } from './normalize.js';
import { prefilter } from './prefilter.js';
import { rank } from './rank.js';
import { scoreWithLlm, describeError } from '../llm.js';
import { itemFromInput } from '../sources/manual.js';
import type { Opportunity, Scored } from '../types.js';
import { log } from '../log.js';

const L = log('run');
export type Notify = (opp: Opportunity, score: Scored) => Promise<void>;

export interface CollectStats { fetched: number; inserted: number; filtered: number; errors: string[] }

export async function collect(ctx: SourceContext): Promise<CollectStats> {
  const st: CollectStats = { fetched: 0, inserted: 0, filtered: 0, errors: [] };
  const rates = ctx.config.filters.usd_rates;
  for (const src of SOURCES) {
    if (!src.enabled(ctx)) continue;
    let items;
    try { items = await src.fetch(ctx); }
    catch (e) { const m = `${src.id}: ${e instanceof Error ? e.message : e}`; st.errors.push(m); L.warn(m); continue; }
    st.fetched += items.length;
    for (const it of items) {
      const opp = normalize(it, rates);
      if (ctx.db.insertOpportunity(opp, it.raw) !== 'inserted') continue;
      st.inserted++;
      const f = prefilter(opp, ctx.config);
      if (!f.pass) { ctx.db.setStatus(opp.id, 'filtered', f.reason); st.filtered++; }
    }
    L.info(`${src.id}: получено ${items.length}`);
  }
  return st;
}

/* Оценка новых. Неудачные попытки считаем: после трёх — откладываем, чтобы не крутиться вечно */
export async function scorePending(ctx: SourceContext, limit = 40): Promise<{ scored: number; shown: number; costUsd: number; errors: string[] }> {
  const res = { scored: 0, shown: 0, costUsd: 0, errors: [] as string[] };
  const pending = ctx.db.opportunitiesByStatus('new', limit);
  for (const opp of pending) {
    const key = `score:fail:${opp.id}`;
    try {
      const s = await scoreOne(ctx, opp);
      res.scored++; res.costUsd += s.costUsd; if (s.show) res.shown++;
    } catch (e) {
      const n = Number(ctx.db.getState(key) || 0) + 1;
      ctx.db.setState(key, String(n));
      const msg = describeError(e);
      res.errors.push(`${opp.id}: ${msg}`);
      L.warn(`оценка ${opp.id} не удалась (${n}): ${msg}`);
      if (n >= 3) ctx.db.setStatus(opp.id, 'expired', 'оценка не удалась трижды');
      if (e instanceof Error && /API-ключ|лимит/.test(msg)) break;        // дальше бессмысленно
    }
  }
  return res;
}

export async function scoreOne(ctx: SourceContext, opp: Opportunity): Promise<Scored> {
  const { score, costUsd, model } = await scoreWithLlm(opp, ctx.config);
  const ranked = rank(opp, score, ctx.config, { model, costUsd });
  ctx.db.saveScore(ranked);
  ctx.db.setStatus(opp.id, 'scored');
  ctx.db.event('scored', { id: opp.id, score: ranked.score, ev: ranked.evHourly, cat: ranked.primary, cost: costUsd });
  return ranked;
}

/* Показать то, что ещё не показывали, — в порядке ожидаемых $/час, не больше лимита в час */
export async function notifyNew(ctx: SourceContext, notify: Notify): Promise<number> {
  const hourAgo = new Date(Date.now() - 3.6e6).toISOString();
  const sentLastHour = ctx.db.count(`SELECT COUNT(*) c FROM events WHERE kind = 'alert' AND at > ?`, hourAgo);
  const room = Math.max(0, ctx.config.filters.max_alerts_per_hour - sentLastHour);
  if (!room) return 0;
  const queue = ctx.db.queue(room, ['scored']);
  let n = 0;
  for (const { opp, score } of queue) {
    try {
      await notify(opp, score);
      ctx.db.setStatus(opp.id, 'shown');
      ctx.db.event('alert', { id: opp.id, cat: score.primary, ev: score.evHourly });
      n++;
    } catch (e) { L.warn(`алерт ${opp.id}: ${e instanceof Error ? e.message : e}`); }
  }
  return n;
}

export async function runOnce(ctx: SourceContext, notify?: Notify) {
  const c = await collect(ctx);
  const s = await scorePending(ctx);
  const shown = notify ? await notifyNew(ctx, notify) : 0;
  const summary = { ...c, ...s, alerts: shown, errors: [...c.errors, ...s.errors] };
  L.info(`проход: получено ${c.fetched}, новых ${c.inserted}, отсеяно ${c.filtered}, оценено ${s.scored} ($${s.costUsd.toFixed(3)}), алертов ${shown}`);
  ctx.db.event('run', summary);
  return summary;
}

/* Ручная вставка: оценивается сразу, фильтр правил только помечает, но не отбрасывает — вы кинули её осознанно */
export async function ingestManual(ctx: SourceContext, input: string): Promise<{ opp: Opportunity; score: Scored; note: string | null }> {
  const item = await itemFromInput(input, ctx.fetch);
  const opp = normalize(item, ctx.config.filters.usd_rates);
  const existing = ctx.db.opportunity(opp.id);
  if (existing) {
    const s = ctx.db.score(existing.id);
    if (s) return { opp: existing, score: s, note: 'уже был в базе' };
  } else {
    ctx.db.insertOpportunity(opp, item.raw);
  }
  const f = prefilter(opp, ctx.config);
  const note = f.pass ? null : `фильтр правил: ${f.reason}`;
  const score = await scoreOne(ctx, ctx.db.opportunity(opp.id)!);
  return { opp: ctx.db.opportunity(opp.id)!, score, note };
}
