import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.ts';
import { rank, scoreFrom, pWin } from '../src/pipeline/rank.ts';
import type { LlmScore, Opportunity } from '../src/types.ts';

const cfg = loadConfig();
cfg.profile.target_hourly_usd = 40;
cfg.profile.mode = 'money';

const opp = (over: Partial<Opportunity> = {}): Opportunity => ({
  id: 'abc', source: 'freelancer', platform: 'freelancer', externalId: '1', url: null, title: 'Landing', text: 'x', lang: 'en',
  postedAt: new Date(Date.now() - 5 * 6e4).toISOString(), fetchedAt: new Date().toISOString(),
  budgetMin: 450, budgetMax: null, currency: 'USD', budgetUsd: 450, budgetType: 'fixed', proposals: 3, skills: [], client: null,
  status: 'new', filterReason: null, dedupKey: 'k', ...over,
});
const llm = (over: Partial<LlmScore['factors']> = {}, est = 5): LlmScore => ({
  factors: { fit: 0.95, money: 0.8, ai_leverage: 0.9, client: 0.7, speed: 0.8, competition: 0.8, repeat: 0.6, risk: 0.1, ...over },
  est_hours: est, budget_usd_estimate: 450, service_key: 'landing', summary: 'лендинг', missing_info: [], red_flags: [], risk_level: 'low', rationale: '',
});

test('score в диапазоне и растёт с факторами', () => {
  const hi = scoreFrom(llm().factors, cfg), lo = scoreFrom(llm({ fit: 0.2, money: 0.2, ai_leverage: 0.3, risk: 0.8 }).factors, cfg);
  assert.ok(hi >= 75 && hi <= 100, `hi=${hi}`);
  assert.ok(lo < 30, `lo=${lo}`);
});
test('ожидаемые $/час = бюджет × шанс × (1 − комиссия) / (часы + накладные)', () => {
  const r = rank(opp(), llm(), cfg, { model: 'test', costUsd: 0 });
  const expected = 450 * r.pWin * 0.9 / (5 + 0.5);
  assert.ok(Math.abs(r.evHourly - expected) < 0.05);
  assert.equal(r.hourlyIfWon, 81);
  assert.equal(r.fee, 0.1);
});
test('много откликов роняет шанс и ожидаемые $/час', () => {
  const few = rank(opp({ proposals: 2 }), llm(), cfg, { model: 't', costUsd: 0 });
  const many = rank(opp({ proposals: 45 }), llm(), cfg, { model: 't', costUsd: 0 });
  assert.ok(few.pWin > many.pWin * 2);
  assert.ok(few.evHourly > many.evHourly);
});
test('score 74 с четырьмя откликами бьёт score 91 с шестьюдесятью', () => {
  const a = rank(opp({ proposals: 4 }), llm({ fit: 0.75, money: 0.6, client: 0.5 }), cfg, { model: 't', costUsd: 0 });
  const b = rank(opp({ proposals: 60 }), llm(), cfg, { model: 't', costUsd: 0 });
  assert.ok(a.score < b.score, `${a.score} < ${b.score}`);
  assert.ok(a.evHourly > b.evHourly, `${a.evHourly} > ${b.evHourly}`);
});
test('свежий выгодный заказ — HOT; быстрый — QUICK WIN', () => {
  const hot = rank(opp(), llm(), cfg, { model: 't', costUsd: 0 });
  assert.equal(hot.primary, 'HOT');
  assert.ok(hot.show);
  const quick = rank(opp({ budgetUsd: 200, budgetMin: 200, postedAt: new Date(Date.now() - 5 * 3.6e6).toISOString() }), llm({}, 2), cfg, { model: 't', costUsd: 0 });
  assert.ok(quick.categories.includes('QUICK_WIN'));
});
test('слабый заказ — REJECT и не показывается', () => {
  const r = rank(opp({ budgetUsd: 120, budgetMin: 120 }), llm({ fit: 0.3, money: 0.2, ai_leverage: 0.3, client: 0.3, competition: 0.2, risk: 0.7 }, 12), cfg, { model: 't', costUsd: 0 });
  assert.equal(r.primary, 'REJECT');
  assert.equal(r.show, false);
});
test('без бюджета берём оценку модели', () => {
  const r = rank(opp({ budgetUsd: null, budgetMin: null }), llm(), cfg, { model: 't', costUsd: 0 });
  assert.equal(r.budgetUsd, 450);
});
test('режим «отзывы» показывает средние, но чистые заказы', () => {
  const c2 = loadConfig(true); c2.profile.mode = 'reviews'; c2.profile.target_hourly_usd = 40;
  const r = rank(opp({ budgetUsd: 200, budgetMin: 200, postedAt: new Date(Date.now() - 6 * 3.6e6).toISOString(), proposals: 10 }),
    llm({ fit: 0.7, money: 0.4, client: 0.5, competition: 0.5, repeat: 0.4 }, 4), c2, { model: 't', costUsd: 0 });
  assert.ok(r.score >= 55 && r.score < 75, `score=${r.score}`);
  assert.ok(r.show);
  loadConfig(true);
});
test('шанс ограничен снизу и сверху', () => {
  assert.ok(pWin(opp({ proposals: 500 }), llm({ fit: 0, risk: 1 }), cfg) >= 0.02);
  assert.ok(pWin(opp({ proposals: 0 }), llm(), cfg) <= 0.6);
});
