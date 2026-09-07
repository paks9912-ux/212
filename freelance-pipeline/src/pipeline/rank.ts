/* Этаж 2, арифметика: балл для показа и ожидаемые $/час для очереди. Модель сюда не ходит. */
import type { Opportunity, LlmScore, Scored, Category, ScoreFactors } from '../types.js';
import type { Config } from '../config.js';

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

export function effectiveWeights(cfg: Config) {
  const w = { ...cfg.weights };
  if (cfg.profile.mode === 'reviews') Object.assign(w, cfg.weights.reviews_mode_overrides);
  return w;
}

export function scoreFrom(factors: ScoreFactors, cfg: Config): number {
  const w = effectiveWeights(cfg);
  const pos = w.fit * factors.fit + w.money * factors.money + w.ai_leverage * factors.ai_leverage +
    w.client * factors.client + w.speed * factors.speed + w.competition * factors.competition + w.repeat * factors.repeat;
  const sumPos = w.fit + w.money + w.ai_leverage + w.client + w.speed + w.competition + w.repeat;
  return Math.round(clamp(pos / sumPos - w.risk_penalty * factors.risk) * 100);
}

/* Вероятность победы: априорная по источнику × конкуренция × попадание × свежесть.
   Первые 50 откликов это оценка «на глаз», дальше её заменяет калибровка по исходам. */
export function pWin(o: Opportunity, s: LlmScore, cfg: Config, nowMs = Date.now()): number {
  const prior = cfg.weights.p_win_prior[o.source] ?? 0.2;
  const n = o.proposals ?? Math.round((1 - s.factors.competition) * 20);
  const comp = 1 / (1 + n / 8);
  const fit = 0.5 + 0.5 * s.factors.fit;
  const ageMin = o.postedAt ? (nowMs - Date.parse(o.postedAt)) / 6e4 : 60;
  const fresh = ageMin < 30 ? 1 : ageMin < 120 ? 0.85 : ageMin < 1440 ? 0.6 : 0.4;
  const risk = 1 - 0.5 * s.factors.risk;
  return clamp(prior * comp * fit * fresh * risk, 0.02, 0.6);
}

export function feeFor(platform: string, cfg: Config): number {
  return cfg.weights.fees[platform] ?? cfg.weights.fees.other ?? 0.1;
}

export function rank(o: Opportunity, s: LlmScore, cfg: Config, meta: { model: string; costUsd: number }, nowMs = Date.now()): Scored {
  const fee = feeFor(o.platform, cfg);
  const budgetUsd = o.budgetUsd ?? s.budget_usd_estimate;
  const hours = Math.max(0.25, s.est_hours);
  const p = pWin(o, s, cfg, nowMs);
  const net = budgetUsd * (1 - fee);
  const evHourly = (net * p) / (hours + cfg.profile.apply_overhead_hours);
  const hourlyIfWon = net / hours;
  const score = scoreFrom(s.factors, cfg);

  const c = cfg.weights.categories, target = cfg.profile.target_hourly_usd;
  const ageMin = o.postedAt ? (nowMs - Date.parse(o.postedAt)) / 6e4 : 9999;
  const cats: Category[] = [];
  /* HOT — три условия сразу: платят щедро, шанс реальный, окно на отклик ещё открыто */
  if (hourlyIfWon >= target * c.hot_hourly_multiplier && p >= c.hot_min_p_win && ageMin <= c.hot_max_age_minutes && score >= c.show_min_score) cats.push('HOT');
  if (budgetUsd >= c.high_profit_min_budget && hourlyIfWon >= target && score >= c.show_min_score) cats.push('HIGH_PROFIT');
  if (hours <= c.quick_win_max_hours && hourlyIfWon >= target && score >= c.show_min_score) cats.push('QUICK_WIN');
  if (s.factors.ai_leverage >= c.high_ai_min && score >= c.show_min_score) cats.push('HIGH_AI');
  if (s.factors.client >= c.good_client_min && score >= c.show_min_score) cats.push('GOOD_CLIENT');
  if (!cats.length) cats.push(score >= c.maybe_min_score && hourlyIfWon >= target * 0.7 ? 'MAYBE' : 'REJECT');

  /* в режиме «набрать отзывы» показываем и середнячки, если они быстрые и без риска */
  const reviewsOk = cfg.profile.mode === 'reviews' && score >= c.maybe_min_score && s.factors.risk < 0.4 && hours <= cfg.profile.max_hours_per_order;
  const show = cats[0] !== 'REJECT' && (cats[0] !== 'MAYBE' || reviewsOk);

  return {
    ...s, opportunityId: o.id, model: meta.model, score, pWin: p, evHourly: round2(evHourly), hourlyIfWon: round2(hourlyIfWon),
    fee, budgetUsd, categories: cats, primary: cats[0], show, costUsd: meta.costUsd, createdAt: new Date().toISOString(),
  };
}
const round2 = (v: number) => Math.round(v * 100) / 100;

export const CATEGORY_LABEL: Record<Category, string> = {
  HOT: '🔥 HOT', HIGH_PROFIT: '💰 HIGH PROFIT', QUICK_WIN: '⚡ QUICK WIN', HIGH_AI: '🤖 HIGH AI',
  GOOD_CLIENT: '⭐ GOOD CLIENT', MAYBE: '🟡 MAYBE', REJECT: '🔴 REJECT',
};
