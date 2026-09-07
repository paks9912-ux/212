import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DB } from '../src/db/index.ts';
import { loadConfig } from '../src/config.ts';
import { money, byService, today } from '../src/ledger/report.ts';
import { pWinBySource } from '../src/calibrate/index.ts';
import { normalize } from '../src/pipeline/normalize.ts';

const cfg = loadConfig();

test('реальный $/час = чистые деньги / часы', () => {
  const db = new DB(':memory:');
  const pid = db.createProject({ platform: 'freelancer', title: 'Лендинг', serviceKey: 'landing', budgetUsd: 500, fee: 0.1 });
  db.addTime(pid, 300); db.addTime(pid, 24);
  db.addPayment(pid, 500, 'USD', 500, 50);
  const m = money(db, '1970-01-01');
  assert.equal(m.grossUsd, 500); assert.equal(m.netUsd, 450); assert.equal(m.projectsPaid, 1);
  assert.ok(Math.abs(m.hourlyUsd! - 450 / 5.4) < 0.01);
  const s = byService(db, cfg);
  assert.equal(s[0].service, 'Лендинг'); assert.ok(Math.abs(s[0].hourlyUsd! - 83.33) < 0.01);
});
test('воронка дня и решения', () => {
  const db = new DB(':memory:');
  const o = normalize({ source: 'hn', externalId: '1', url: null, title: 'Landing page', text: 'Need a landing page, $400', postedAt: new Date().toISOString() }, cfg.filters.usd_rates);
  db.insertOpportunity(o);
  db.saveScore({ opportunityId: o.id, model: 't', score: 88, factors: { fit: 1, money: 1, ai_leverage: 1, client: 1, speed: 1, competition: 1, repeat: 1, risk: 0 },
    est_hours: 4, budget_usd_estimate: 400, budgetUsd: 400, pWin: 0.3, evHourly: 24, hourlyIfWon: 90, fee: 0, service_key: 'landing',
    categories: ['HOT'], primary: 'HOT', show: true, summary: '', rationale: '', missing_info: [], red_flags: [], risk_level: 'low', costUsd: 0.002, createdAt: new Date().toISOString() });
  db.setStatus(o.id, 'scored');
  const t = today(db);
  assert.equal(t.fetched, 1); assert.equal(t.scored, 1); assert.equal(t.hot, 1);
  assert.equal(db.queue(5).length, 1);
  db.decide(o.id, 'apply');
  db.setProposalOutcome(o.id, 'won');
  assert.equal(db.opportunity(o.id)!.status, 'won');
  const p = pWinBySource(db);
  assert.equal(p[0].source, 'hn'); assert.equal(p[0].won, 1);
  assert.ok(Math.abs(p[0].pWin - 2 / 6) < 0.001);
});
test('дубли по ключу за сутки не вставляются', () => {
  const db = new DB(':memory:');
  const a = normalize({ source: 'hn', externalId: '1', url: null, title: 'Landing page for dental clinic', text: 'Need it fast, $400 budget', postedAt: null }, cfg.filters.usd_rates);
  const b = normalize({ source: 'reddit', externalId: '2', url: null, title: 'Dental clinic landing page', text: 'Need it fast, $400 budget', postedAt: null }, cfg.filters.usd_rates);
  assert.equal(db.insertOpportunity(a), 'inserted');
  assert.equal(db.insertOpportunity(b), 'duplicate');
});
