import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DB } from '../src/db/index.ts';
import { loadConfig } from '../src/config.ts';
import { learn, saveCalibration, loadCalibration, MIN_APPLICATIONS } from '../src/calibrate/index.ts';
import { rank, effectiveWeights } from '../src/pipeline/rank.ts';
import { normalize } from '../src/pipeline/normalize.ts';
import type { LlmScore } from '../src/types.ts';

const cfg = loadConfig(true);
cfg.calibration = null;

/* 60 откликов: выигрывают те, у кого высокий fit, HN приносит победы чаще Reddit */
function seed(db: DB) {
  let n = 0;
  for (let i = 0; i < 60; i++) {
    const source = i % 2 ? 'hn' : 'reddit';
    const fit = i % 3 === 0 ? 0.95 : 0.5;
    const o = normalize({ source: source as 'hn', externalId: 'x' + i, url: null, title: 'Landing page for client' + i + 'corp', text: 'Need a landing page for client' + i + 'corp, $400', postedAt: new Date().toISOString() }, cfg.filters.usd_rates);
    db.insertOpportunity(o);
    db.saveScore({ opportunityId: o.id, model: 't', score: 70, factors: { fit, money: 0.6, ai_leverage: 0.8, client: 0.5, speed: 0.6, competition: 0.5, repeat: 0.5, risk: fit > 0.9 ? 0.1 : 0.4 },
      est_hours: 4, budget_usd_estimate: 400, budgetUsd: 400, pWin: 0.2, evHourly: 10, hourlyIfWon: 90, fee: 0, service_key: 'landing',
      categories: ['MAYBE'], primary: 'MAYBE', show: true, summary: '', rationale: '', missing_info: [], red_flags: [], risk_level: 'low', costUsd: 0, createdAt: new Date().toISOString() });
    db.decide(o.id, 'apply');
    const won = fit > 0.9 && (source === 'hn' || i % 12 === 0);   // HN выигрывает чаще
    if (won) n++;
    db.setProposalOutcome(o.id, won ? 'won' : 'lost');
  }
  return n;
}

test('пока откликов мало — калибровки нет', () => {
  const db = new DB(':memory:');
  const o = normalize({ source: 'hn', externalId: 'a', url: null, title: 't', text: 'x', postedAt: null }, cfg.filters.usd_rates);
  db.insertOpportunity(o); db.decide(o.id, 'apply');
  assert.equal(learn(db, cfg), null);
});

test('после 60 откликов: HN весит больше Reddit, fit усиливается, risk штрафует сильнее', () => {
  const db = new DB(':memory:');
  const wins = seed(db);
  assert.ok(wins >= 5, 'в синтетике должно быть хотя бы 5 побед');
  const cal = learn(db, cfg)!;
  assert.ok(cal, 'калибровка должна появиться');
  assert.equal(cal.basedOn.applied, 60);
  assert.ok(cal.basedOn.applied >= MIN_APPLICATIONS);
  assert.ok(cal.pWinPrior.hn > cal.pWinPrior.reddit, `hn ${cal.pWinPrior.hn} > reddit ${cal.pWinPrior.reddit}`);
  assert.ok(cal.weightScale.fit! > 1.1, `fit ${cal.weightScale.fit}`);
  assert.ok(cal.weightScale.risk! > 1.05, `risk ${cal.weightScale.risk}`);
  assert.ok(Math.abs(cal.weightScale.money! - 1) < 0.01, 'money не отличает — вес не трогаем');
  for (const v of Object.values(cal.weightScale)) assert.ok(v! >= 0.7 && v! <= 1.4);
});

test('калибровка сохраняется и меняет ранжирование', () => {
  const db = new DB(':memory:');
  seed(db);
  const cal = learn(db, cfg)!;
  saveCalibration(db, cal);
  assert.deepEqual(loadCalibration(db)?.basedOn, cal.basedOn);

  const opp = db.opportunitiesByStatus('won', 1)[0] ?? db.opportunitiesByStatus('lost', 1)[0];
  const hnOpp = { ...opp, source: 'hn' as const, platform: 'hn' as const, proposals: 5 };
  const llm: LlmScore = { factors: { fit: 0.95, money: 0.6, ai_leverage: 0.8, client: 0.5, speed: 0.6, competition: 0.6, repeat: 0.5, risk: 0.1 },
    est_hours: 4, budget_usd_estimate: 400, service_key: 'landing', summary: '', missing_info: [], red_flags: [], risk_level: 'low', rationale: '' };
  cfg.calibration = null;
  const before = rank(hnOpp, llm, cfg, { model: 't', costUsd: 0 });
  cfg.calibration = cal;
  const after = rank(hnOpp, llm, cfg, { model: 't', costUsd: 0 });
  assert.notEqual(before.pWin, after.pWin, 'вероятность по источнику должна измениться');
  assert.ok(effectiveWeights(cfg).fit > cfg.weights.fit);
  cfg.calibration = null;
});
