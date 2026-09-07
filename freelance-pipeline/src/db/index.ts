/* База на встроенном SQLite Node 22. Один файл, копия — это бэкап. */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Opportunity, Scored, Proposal, OppStatus, ProjectStatus, ClientInfo } from '../types.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export type Row = Record<string, unknown>;
export const now = () => new Date().toISOString();

export class DB {
  readonly db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
  }

  /* ---------- заказы ---------- */
  /* Вставка с защитой от дублей: тот же источник+id или тот же dedup_key за сутки */
  insertOpportunity(o: Opportunity, raw?: unknown): 'inserted' | 'duplicate' {
    const dup = this.db.prepare(
      `SELECT id FROM opportunities WHERE (source = ? AND external_id = ?)
         OR (dedup_key = ? AND fetched_at > ?) LIMIT 1`
    ).get(o.source, o.externalId, o.dedupKey, new Date(Date.now() - 86400e3).toISOString());
    if (dup) return 'duplicate';
    this.db.prepare(`INSERT INTO opportunities
      (id, source, platform, external_id, url, title, text, lang, posted_at, fetched_at,
       budget_min, budget_max, currency, budget_usd, budget_type, proposals, skills, client,
       status, filter_reason, dedup_key, raw)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      o.id, o.source, o.platform, o.externalId, o.url, o.title, o.text, o.lang, o.postedAt, o.fetchedAt,
      o.budgetMin, o.budgetMax, o.currency, o.budgetUsd, o.budgetType, o.proposals,
      JSON.stringify(o.skills), o.client ? JSON.stringify(o.client) : null,
      o.status, o.filterReason, o.dedupKey, raw === undefined ? null : JSON.stringify(raw).slice(0, 20000));
    return 'inserted';
  }

  opportunity(id: string): Opportunity | null {
    const r = this.db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id) as Row | undefined;
    return r ? rowToOpp(r) : null;
  }

  /* короткий id из Telegram-кнопки — первые символы */
  opportunityByPrefix(prefix: string): Opportunity | null {
    const r = this.db.prepare('SELECT * FROM opportunities WHERE id LIKE ? LIMIT 1').get(prefix + '%') as Row | undefined;
    return r ? rowToOpp(r) : null;
  }

  opportunitiesByStatus(status: OppStatus, limit = 100): Opportunity[] {
    return (this.db.prepare('SELECT * FROM opportunities WHERE status = ? ORDER BY fetched_at DESC LIMIT ?')
      .all(status, limit) as Row[]).map(rowToOpp);
  }

  setStatus(id: string, status: OppStatus, reason?: string | null) {
    this.db.prepare('UPDATE opportunities SET status = ?, filter_reason = COALESCE(?, filter_reason) WHERE id = ?')
      .run(status, reason ?? null, id);
  }

  /* ---------- оценки ---------- */
  saveScore(s: Scored) {
    this.db.prepare(`INSERT OR REPLACE INTO scores
      (opportunity_id, model, score, factors, est_hours, budget_usd, p_win, ev_hourly, hourly_if_won, fee,
       service_key, categories, primary_cat, show, summary, rationale, missing_info, red_flags, risk_level, cost_usd, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      s.opportunityId, s.model, s.score, JSON.stringify(s.factors), s.est_hours, s.budgetUsd, s.pWin, s.evHourly,
      s.hourlyIfWon, s.fee, s.service_key, JSON.stringify(s.categories), s.primary, s.show ? 1 : 0,
      s.summary, s.rationale, JSON.stringify(s.missing_info), JSON.stringify(s.red_flags), s.risk_level,
      s.costUsd, s.createdAt);
  }

  score(opportunityId: string): Scored | null {
    const r = this.db.prepare('SELECT * FROM scores WHERE opportunity_id = ?').get(opportunityId) as Row | undefined;
    return r ? rowToScore(r) : null;
  }

  /* Очередь: оценённые, показанные, отложенные — по ожидаемым $/час */
  queue(limit = 20, statuses: OppStatus[] = ['scored', 'shown', 'later']): Array<{ opp: Opportunity; score: Scored }> {
    const q = statuses.map(() => '?').join(',');
    const rows = this.db.prepare(`SELECT o.*, s.opportunity_id AS s_opportunity_id, s.model AS s_model, s.score AS s_score,
        s.factors AS s_factors, s.est_hours AS s_est_hours, s.budget_usd AS s_budget_usd, s.p_win AS s_p_win,
        s.ev_hourly AS s_ev_hourly, s.hourly_if_won AS s_hourly_if_won, s.fee AS s_fee, s.service_key AS s_service_key,
        s.categories AS s_categories, s.primary_cat AS s_primary_cat, s.show AS s_show, s.summary AS s_summary,
        s.rationale AS s_rationale, s.missing_info AS s_missing_info, s.red_flags AS s_red_flags,
        s.risk_level AS s_risk_level, s.cost_usd AS s_cost_usd, s.created_at AS s_created_at
      FROM opportunities o JOIN scores s ON s.opportunity_id = o.id
      WHERE o.status IN (${q}) AND s.show = 1
      ORDER BY s.ev_hourly DESC LIMIT ?`).all(...statuses, limit) as Row[];
    return rows.map(r => ({ opp: rowToOpp(r), score: rowToScore(prefixed(r, 's_')) }));
  }

  /* ---------- решения и отклики ---------- */
  decide(opportunityId: string, decision: 'apply' | 'later' | 'reject', reason?: string) {
    this.db.prepare('INSERT INTO decisions (opportunity_id, decision, reason, made_at) VALUES (?,?,?,?)')
      .run(opportunityId, decision, reason ?? null, now());
    this.setStatus(opportunityId, decision === 'apply' ? 'applied' : decision === 'later' ? 'later' : 'rejected');
    this.event('decision', { opportunityId, decision, reason });
  }

  saveProposals(opportunityId: string, list: Proposal[], costUsd: number) {
    const ins = this.db.prepare('INSERT INTO proposals (opportunity_id, variant, text, created_at, cost_usd) VALUES (?,?,?,?,?)');
    for (const p of list) ins.run(opportunityId, p.variant, p.text, now(), costUsd / list.length);
  }
  proposals(opportunityId: string): Array<Proposal & { id: number; chosen: boolean }> {
    return (this.db.prepare('SELECT id, variant, text, chosen FROM proposals WHERE opportunity_id = ? ORDER BY id')
      .all(opportunityId) as Row[]).map(r => ({ id: r.id as number, variant: r.variant as Proposal['variant'], text: r.text as string, chosen: !!r.chosen }));
  }
  chooseProposal(id: number) {
    const r = this.db.prepare('SELECT opportunity_id FROM proposals WHERE id = ?').get(id) as Row | undefined;
    if (!r) return;
    this.db.prepare('UPDATE proposals SET chosen = 0 WHERE opportunity_id = ?').run(String(r.opportunity_id));
    this.db.prepare('UPDATE proposals SET chosen = 1, sent_at = ? WHERE id = ?').run(now(), id);
    this.event('proposal_sent', { proposalId: id, opportunityId: r.opportunity_id });
  }
  setProposalOutcome(opportunityId: string, outcome: 'won' | 'lost' | 'no_reply') {
    this.db.prepare('UPDATE proposals SET outcome = ? WHERE opportunity_id = ? AND chosen = 1').run(outcome, opportunityId);
    this.setStatus(opportunityId, outcome === 'won' ? 'won' : 'lost');
    this.event('outcome', { opportunityId, outcome });
  }

  /* ---------- проекты, время, деньги ---------- */
  createProject(p: { opportunityId?: string | null; clientName?: string | null; platform: string; title: string;
    serviceKey?: string | null; budget?: number | null; currency?: string; budgetUsd?: number | null; fee?: number;
    deadline?: string | null; requirements?: string | null; estHours?: number | null }): number {
    const t = now();
    const r = this.db.prepare(`INSERT INTO projects (opportunity_id, client_name, platform, title, service_key, budget, currency,
      budget_usd, fee, deadline, status, requirements, est_hours, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'NEW',?,?,?,?)`).run(
      p.opportunityId ?? null, p.clientName ?? null, p.platform, p.title, p.serviceKey ?? null, p.budget ?? null,
      p.currency ?? 'USD', p.budgetUsd ?? p.budget ?? null, p.fee ?? 0, p.deadline ?? null, p.requirements ?? null,
      p.estHours ?? null, t, t);
    return Number(r.lastInsertRowid);
  }
  setProjectStatus(id: number, status: ProjectStatus) {
    this.db.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id);
    this.event('project_status', { id, status });
  }
  updateProject(id: number, patch: Record<string, unknown>) {
    const keys = Object.keys(patch).filter(k => /^[a-z_]+$/.test(k));
    if (!keys.length) return;
    const set = keys.map(k => `${k} = ?`).join(', ');
    this.db.prepare(`UPDATE projects SET ${set}, updated_at = ? WHERE id = ?`).run(...keys.map(k => patch[k] as never), now(), id);
  }
  addTime(projectId: number, minutes: number, note?: string) {
    this.db.prepare('INSERT INTO time_entries (project_id, minutes, note, at) VALUES (?,?,?,?)').run(projectId, minutes, note ?? null, now());
  }
  addPayment(projectId: number, amount: number, currency: string, amountUsd: number, feeUsd = 0, note?: string) {
    this.db.prepare('INSERT INTO payments (project_id, amount, currency, amount_usd, fee_usd, at, note) VALUES (?,?,?,?,?,?,?)')
      .run(projectId, amount, currency, amountUsd, feeUsd, now(), note ?? null);
    this.event('payment', { projectId, amountUsd });
  }
  projects(statuses?: ProjectStatus[]): Row[] {
    if (!statuses?.length) return this.db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as Row[];
    const q = statuses.map(() => '?').join(',');
    return this.db.prepare(`SELECT * FROM projects WHERE status IN (${q}) ORDER BY updated_at DESC`).all(...statuses) as Row[];
  }
  project(id: number): Row | null { return (this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Row) ?? null; }
  projectMinutes(id: number): number {
    return Number((this.db.prepare('SELECT COALESCE(SUM(minutes),0) m FROM time_entries WHERE project_id = ?').get(id) as Row).m);
  }
  projectPaidUsd(id: number): { gross: number; fee: number } {
    const r = this.db.prepare('SELECT COALESCE(SUM(amount_usd),0) g, COALESCE(SUM(fee_usd),0) f FROM payments WHERE project_id = ?').get(id) as Row;
    return { gross: Number(r.g), fee: Number(r.f) };
  }
  saveMessage(projectId: number | null, direction: 'in' | 'out', text: string, analysis?: unknown) {
    this.db.prepare('INSERT INTO messages (project_id, direction, text, analysis, at) VALUES (?,?,?,?,?)')
      .run(projectId, direction, text, analysis ? JSON.stringify(analysis) : null, now());
  }

  /* ---------- служебное ---------- */
  event(kind: string, payload?: unknown) {
    this.db.prepare('INSERT INTO events (kind, payload, at) VALUES (?,?,?)').run(kind, payload ? JSON.stringify(payload) : null, now());
  }
  getState(key: string): string | null {
    const r = this.db.prepare('SELECT value FROM source_state WHERE key = ?').get(key) as Row | undefined;
    return r ? String(r.value) : null;
  }
  setState(key: string, value: string) {
    this.db.prepare('INSERT OR REPLACE INTO source_state (key, value) VALUES (?,?)').run(key, value);
  }
  getSetting(key: string): string | null {
    const r = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as Row | undefined;
    return r ? String(r.value) : null;
  }
  setSetting(key: string, value: string) {
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run(key, value);
  }
  count(sql: string, ...args: unknown[]): number {
    return Number((this.db.prepare(sql).get(...(args as never[])) as Row).c ?? 0);
  }
  all(sql: string, ...args: unknown[]): Row[] { return this.db.prepare(sql).all(...(args as never[])) as Row[]; }
  get(sql: string, ...args: unknown[]): Row | null { return (this.db.prepare(sql).get(...(args as never[])) as Row) ?? null; }

  /* Копия базы одним файлом. Вызывается раз в сутки из демона. */
  backup(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `app-${new Date().toISOString().slice(0, 10)}.db`);
    this.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    return file;
  }
  close() { this.db.close(); }
}

function prefixed(r: Row, p: string): Row {
  const out: Row = {};
  for (const k of Object.keys(r)) if (k.startsWith(p)) out[k.slice(p.length)] = r[k];
  return out;
}
function rowToOpp(r: Row): Opportunity {
  return {
    id: String(r.id), source: r.source as Opportunity['source'], platform: r.platform as Opportunity['platform'],
    externalId: String(r.external_id), url: (r.url as string) ?? null, title: String(r.title), text: String(r.text),
    lang: r.lang as Opportunity['lang'], postedAt: (r.posted_at as string) ?? null, fetchedAt: String(r.fetched_at),
    budgetMin: r.budget_min as number | null, budgetMax: r.budget_max as number | null, currency: (r.currency as string) ?? null,
    budgetUsd: r.budget_usd as number | null, budgetType: (r.budget_type as Opportunity['budgetType']) ?? null,
    proposals: r.proposals as number | null, skills: JSON.parse(String(r.skills || '[]')),
    client: r.client ? (JSON.parse(String(r.client)) as ClientInfo) : null,
    status: r.status as OppStatus, filterReason: (r.filter_reason as string) ?? null, dedupKey: String(r.dedup_key),
  };
}
function rowToScore(r: Row): Scored {
  return {
    opportunityId: String(r.opportunity_id), model: String(r.model), score: Number(r.score),
    factors: JSON.parse(String(r.factors)), est_hours: Number(r.est_hours), budgetUsd: Number(r.budget_usd),
    budget_usd_estimate: Number(r.budget_usd), pWin: Number(r.p_win), evHourly: Number(r.ev_hourly),
    hourlyIfWon: Number(r.hourly_if_won), fee: Number(r.fee), service_key: String(r.service_key ?? ''),
    categories: JSON.parse(String(r.categories)), primary: r.primary_cat as Scored['primary'], show: !!r.show,
    summary: String(r.summary ?? ''), rationale: String(r.rationale ?? ''),
    missing_info: JSON.parse(String(r.missing_info || '[]')), red_flags: JSON.parse(String(r.red_flags || '[]')),
    risk_level: (r.risk_level as Scored['risk_level']) ?? 'medium', costUsd: Number(r.cost_usd), createdAt: String(r.created_at),
  };
}
