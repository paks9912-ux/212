/* Цифры: воронка дня, деньги месяца, реальный $/час, прибыльность по услугам */
import type { DB, Row } from '../db/index.js';
import type { Config } from '../config.js';

const dayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const monthStart = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.toISOString(); };

export interface Today {
  fetched: number; filtered: number; scored: number; shown: number;
  hot: number; highProfit: number; quickWin: number; pendingDecision: number; activeProjects: number; llmCostUsd: number;
}
export interface Money {
  grossUsd: number; feesUsd: number; netUsd: number; projectsPaid: number; avgOrderUsd: number;
  hours: number; hourlyUsd: number | null; applications: number; won: number; winRate: number | null;
  avgProjectHours: number | null; aiShare: number | null; expectedUsd: number;
}
export interface ServiceLine { service: string; projects: number; netUsd: number; hours: number; hourlyUsd: number | null }

export function today(db: DB): Today {
  const t = dayStart();
  const cat = (c: string) => db.count(`SELECT COUNT(*) c FROM scores s JOIN opportunities o ON o.id = s.opportunity_id WHERE s.created_at > ? AND s.categories LIKE ?`, t, `%"${c}"%`);
  return {
    fetched: db.count('SELECT COUNT(*) c FROM opportunities WHERE fetched_at > ?', t),
    filtered: db.count(`SELECT COUNT(*) c FROM opportunities WHERE fetched_at > ? AND status = 'filtered'`, t),
    scored: db.count('SELECT COUNT(*) c FROM scores WHERE created_at > ?', t),
    shown: db.count('SELECT COUNT(*) c FROM scores WHERE created_at > ? AND show = 1', t),
    hot: cat('HOT'), highProfit: cat('HIGH_PROFIT'), quickWin: cat('QUICK_WIN'),
    pendingDecision: db.count(`SELECT COUNT(*) c FROM opportunities WHERE status IN ('shown','later')`),
    activeProjects: db.count(`SELECT COUNT(*) c FROM projects WHERE status IN ('WON','IN_PROGRESS','WAITING_CLIENT','QA','READY_TO_DELIVER','DELIVERED')`),
    llmCostUsd: Number(db.get('SELECT COALESCE(SUM(cost_usd),0) s FROM scores WHERE created_at > ?', t)?.s ?? 0) +
      Number(db.get('SELECT COALESCE(SUM(cost_usd),0) s FROM proposals WHERE created_at > ?', t)?.s ?? 0),
  };
}

export function money(db: DB, since = monthStart()): Money {
  const pay = db.get('SELECT COALESCE(SUM(amount_usd),0) g, COALESCE(SUM(fee_usd),0) f, COUNT(DISTINCT project_id) n FROM payments WHERE at > ?', since)!;
  const gross = Number(pay.g), fees = Number(pay.f), n = Number(pay.n);
  const paidIds = db.all('SELECT DISTINCT project_id id FROM payments WHERE at > ?', since).map(r => Number(r.id));
  let minutes = 0, aiSum = 0, aiN = 0;
  for (const id of paidIds) {
    minutes += db.projectMinutes(id);
    const p = db.project(id);
    if (p?.ai_share != null) { aiSum += Number(p.ai_share); aiN++; }
  }
  const hours = minutes / 60;
  const applications = db.count(`SELECT COUNT(*) c FROM decisions WHERE decision = 'apply' AND made_at > ?`, since);
  const won = db.count(`SELECT COUNT(*) c FROM opportunities WHERE status = 'won' AND fetched_at > ?`, since);
  const expected = Number(db.get(`SELECT COALESCE(SUM(COALESCE(budget_usd,0) * (1 - fee)),0) s FROM projects WHERE status IN ('WON','IN_PROGRESS','WAITING_CLIENT','QA','READY_TO_DELIVER','DELIVERED','COMPLETED')`)?.s ?? 0)
    + Number(db.get(`SELECT COALESCE(SUM(s.budget_usd * (1 - s.fee) * s.p_win),0) s FROM scores s JOIN opportunities o ON o.id = s.opportunity_id WHERE o.status = 'applied'`)?.s ?? 0);
  return {
    grossUsd: gross, feesUsd: fees, netUsd: gross - fees, projectsPaid: n, avgOrderUsd: n ? gross / n : 0,
    hours, hourlyUsd: hours > 0 ? (gross - fees) / hours : null,
    applications, won, winRate: applications ? won / applications : null,
    avgProjectHours: n ? hours / n : null, aiShare: aiN ? aiSum / aiN : null, expectedUsd: expected,
  };
}

export function byService(db: DB, cfg: Config, since = '1970-01-01'): ServiceLine[] {
  const rows = db.all(`SELECT p.id, p.service_key, COALESCE(SUM(pay.amount_usd),0) g, COALESCE(SUM(pay.fee_usd),0) f
    FROM projects p JOIN payments pay ON pay.project_id = p.id WHERE pay.at > ? GROUP BY p.id`, since);
  const acc = new Map<string, ServiceLine>();
  for (const r of rows) {
    const key = String(r.service_key || 'other');
    const line = acc.get(key) ?? { service: cfg.profile.services.find(s => s.key === key)?.name ?? key, projects: 0, netUsd: 0, hours: 0, hourlyUsd: null };
    line.projects++; line.netUsd += Number(r.g) - Number(r.f); line.hours += db.projectMinutes(Number(r.id)) / 60;
    acc.set(key, line);
  }
  return [...acc.values()].map(l => ({ ...l, hourlyUsd: l.hours > 0 ? l.netUsd / l.hours : null }))
    .sort((a, b) => (b.hourlyUsd ?? 0) - (a.hourlyUsd ?? 0));
}

export function textReport(db: DB, cfg: Config): string {
  const t = today(db), m = money(db), s = byService(db, cfg);
  const usd = (v: number | null) => v == null ? '—' : '$' + Math.round(v).toLocaleString('en-US');
  const lines = [
    `СЕГОДНЯ`,
    `  Найдено ${t.fetched} · отсеяно правилами ${t.filtered} · оценено моделью ${t.scored} · показано ${t.shown}`,
    `  🔥 HOT ${t.hot} · 💰 HIGH PROFIT ${t.highProfit} · ⚡ QUICK WIN ${t.quickWin}`,
    `  Ждут решения ${t.pendingDecision} · активных проектов ${t.activeProjects} · модель за день $${t.llmCostUsd.toFixed(2)}`,
    ``,
    `МЕСЯЦ`,
    `  Получено ${usd(m.grossUsd)} (чистыми ${usd(m.netUsd)}) · ожидается ${usd(m.expectedUsd)}`,
    `  Реальный $/час ${m.hourlyUsd == null ? '— (нет закрытых проектов с учётом времени)' : usd(m.hourlyUsd)} · цель ${usd(cfg.profile.target_hourly_usd)}`,
    `  Откликов ${m.applications} → побед ${m.won}${m.winRate != null ? ` · конверсия ${Math.round(m.winRate * 100)}%` : ''}`,
    `  Средний заказ ${usd(m.avgOrderUsd)} · часов на проект ${m.avgProjectHours?.toFixed(1) ?? '—'} · доля AI ${m.aiShare != null ? Math.round(m.aiShare * 100) + '%' : '—'}`,
  ];
  if (s.length) {
    lines.push('', 'ЧТО ПРИНОСИТ ДЕНЬГИ');
    for (const l of s) lines.push(`  ${l.service.padEnd(28)} ${usd(l.hourlyUsd).padStart(8)}/час · ${l.projects} ${l.projects === 1 ? 'проект' : 'проектов'}`);
  }
  return lines.join('\n');
}
