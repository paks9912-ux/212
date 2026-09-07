/* Калибровка по исходам. Пока данных мало — только отчёт; автоправка весов после 50 откликов. */
import type { DB } from '../db/index.js';

export const MIN_APPLICATIONS = 50;

export function pWinBySource(db: DB): Array<{ source: string; applied: number; won: number; pWin: number }> {
  const rows = db.all(`SELECT o.source, COUNT(*) applied,
      SUM(CASE WHEN o.status = 'won' THEN 1 ELSE 0 END) won
    FROM decisions d JOIN opportunities o ON o.id = d.opportunity_id
    WHERE d.decision = 'apply' GROUP BY o.source`);
  /* сглаживание Лапласа: при малом числе откликов оценка тянется к 1/5, а не к 0 или 1 */
  return rows.map(r => ({ source: String(r.source), applied: Number(r.applied), won: Number(r.won),
    pWin: (Number(r.won) + 1) / (Number(r.applied) + 5) }));
}

export function rejectReasons(db: DB): Array<{ reason: string; n: number }> {
  return db.all(`SELECT COALESCE(reason,'без причины') reason, COUNT(*) n FROM decisions WHERE decision = 'reject' GROUP BY reason ORDER BY n DESC`)
    .map(r => ({ reason: String(r.reason), n: Number(r.n) }));
}

export function calibrationReport(db: DB): string {
  const applied = db.count(`SELECT COUNT(*) c FROM decisions WHERE decision = 'apply'`);
  const lines = [`Откликов: ${applied} из ${MIN_APPLICATIONS}, нужных для автокалибровки`];
  const bySrc = pWinBySource(db);
  if (bySrc.length) {
    lines.push('Вероятность победы по источникам (сглаженная):');
    for (const s of bySrc) lines.push(`  ${s.source.padEnd(11)} ${s.won}/${s.applied} → ${(s.pWin * 100).toFixed(0)}%`);
  }
  const rr = rejectReasons(db);
  if (rr.length) {
    lines.push('Почему отказывались:');
    for (const r of rr) lines.push(`  ${r.reason}: ${r.n}`);
  }
  if (applied < MIN_APPLICATIONS) lines.push('Веса пока правятся руками в config/weights.yml.');
  return lines.join('\n');
}
