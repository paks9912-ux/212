/* Калибровка по исходам. Пока откликов мало — только отчёт.
   После 50 откликов и 5 побед считаем свои вероятности победы по источникам
   и подкручиваем веса факторов: те, что отличают выигранные от проигранных, весят больше. */
import type { DB } from '../db/index.js';
import type { Config } from '../config.js';
import type { ScoreFactors } from '../types.js';

export const MIN_APPLICATIONS = 50;
export const MIN_WINS = 5;
const FACTORS: Array<keyof ScoreFactors> = ['fit', 'money', 'ai_leverage', 'client', 'speed', 'competition', 'repeat', 'risk'];

export interface Calibration {
  pWinPrior: Record<string, number>;
  weightScale: Partial<Record<keyof ScoreFactors, number>>;
  basedOn: { applied: number; won: number; lost: number };
  updatedAt: string;
}

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

/* Отклики с известным исходом и факторами модели */
function outcomes(db: DB): Array<{ won: boolean; factors: ScoreFactors; source: string }> {
  return db.all(`SELECT o.source, o.status, s.factors FROM decisions d
      JOIN opportunities o ON o.id = d.opportunity_id JOIN scores s ON s.opportunity_id = o.id
      WHERE d.decision = 'apply' AND o.status IN ('won','lost')`)
    .map(r => ({ won: r.status === 'won', factors: JSON.parse(String(r.factors)) as ScoreFactors, source: String(r.source) }));
}

/* Чему научились. null — данных ещё мало */
export function learn(db: DB, cfg: Config): Calibration | null {
  const applied = db.count(`SELECT COUNT(*) c FROM decisions WHERE decision = 'apply'`);
  const rows = outcomes(db);
  const won = rows.filter(r => r.won).length, lost = rows.length - won;
  if (applied < MIN_APPLICATIONS || won < MIN_WINS) return null;

  /* вероятности по источникам: своя статистика, сглаженная к априорной */
  const pWinPrior: Record<string, number> = { ...cfg.weights.p_win_prior };
  for (const s of pWinBySource(db)) {
    const prior = cfg.weights.p_win_prior[s.source] ?? 0.2;
    pWinPrior[s.source] = Math.max(0.02, Math.min(0.6, (s.won + prior * 10) / (s.applied + 10)));
  }

  /* веса: разница средних факторов у выигранных и проигранных, ограниченная, чтобы не раскачать систему */
  const weightScale: Calibration['weightScale'] = {};
  for (const f of FACTORS) {
    const mean = (list: typeof rows) => list.length ? list.reduce((a, r) => a + (r.factors[f] ?? 0), 0) / list.length : 0;
    const d = mean(rows.filter(r => r.won)) - mean(rows.filter(r => !r.won));
    /* для риска логика обратная: у выигранных он должен быть ниже */
    const signed = f === 'risk' ? -d : d;
    weightScale[f] = Math.max(0.7, Math.min(1.4, 1 + signed));
  }
  return { pWinPrior, weightScale, basedOn: { applied, won, lost }, updatedAt: new Date().toISOString() };
}

export function saveCalibration(db: DB, cal: Calibration) { db.setSetting('calibration', JSON.stringify(cal)); db.event('calibration', cal.basedOn); }
export function loadCalibration(db: DB): Calibration | null {
  const raw = db.getSetting('calibration');
  if (!raw) return null;
  try { return JSON.parse(raw) as Calibration; } catch { return null; }
}

export function calibrationReport(db: DB, cfg?: Config): string {
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
  const cal = loadCalibration(db);
  if (cal) {
    lines.push(`Калибровка применена ${cal.updatedAt.slice(0, 10)} по ${cal.basedOn.applied} откликам (${cal.basedOn.won} побед):`);
    for (const f of FACTORS) { const v = cal.weightScale[f]; if (v && Math.abs(v - 1) > 0.05) lines.push(`  вес «${f}» × ${v.toFixed(2)}`); }
  } else if (cfg && applied >= MIN_APPLICATIONS) lines.push('Данных хватает — npm run calibrate применит.');
  else lines.push('Веса пока правятся руками в config/weights.yml.');
  return lines.join('\n');
}
