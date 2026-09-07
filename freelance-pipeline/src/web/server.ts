/* Панель: одна страница, только чтение, слушает localhost. Для операций — бот. */
import http from 'node:http';
import type { SourceContext } from '../sources/base.js';
import { today, money, byService } from '../ledger/report.js';
import { CATEGORY_LABEL } from '../pipeline/rank.js';

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const usd = (v: number | null | undefined) => v == null ? '—' : '$' + Math.round(v).toLocaleString('en-US');

export function page(ctx: SourceContext): string {
  const t = today(ctx.db), m = money(ctx.db), s = byService(ctx.db, ctx.config);
  const q = ctx.db.queue(12);
  const projects = ctx.db.projects(['WON', 'IN_PROGRESS', 'WAITING_CLIENT', 'QA', 'READY_TO_DELIVER', 'DELIVERED']);
  const target = ctx.config.profile.target_hourly_usd;
  const cell = (k: string, v: string, note = '') => `<div class="c"><div class="k">${k}</div><div class="v">${v}</div>${note ? `<div class="n">${note}</div>` : ''}</div>`;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="120"><title>Конвейер заказов</title>
<style>
:root{--bg:#F4F5F7;--s:#fff;--ink:#12181F;--m:#5A6672;--l:#DCE0E6;--a:#8A6A15;--g:#1B6B45;--r:#A32219}
@media(prefers-color-scheme:dark){:root{--bg:#0D1116;--s:#141A21;--ink:#E7EBF0;--m:#A3AEBA;--l:#252E38;--a:#DCB65A;--g:#5CC28C;--r:#EC7268}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 "IBM Plex Sans",system-ui,sans-serif}
.w{max-width:1080px;margin:0 auto;padding:28px 20px 60px}h1{font-size:26px;margin:0 0 4px}h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--m);margin:30px 0 10px}
.sub{color:var(--m);margin:0 0 20px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:1px;background:var(--l);border:1px solid var(--l)}
.c{background:var(--s);padding:14px 16px}.k{font-size:12px;color:var(--m)}.v{font-size:24px;font-weight:600;font-variant-numeric:tabular-nums}.n{font-size:12px;color:var(--m)}
table{width:100%;border-collapse:collapse;background:var(--s);border:1px solid var(--l);font-size:14px}th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--l);vertical-align:top}th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--m)}
td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.hot{color:var(--r);font-weight:600}.ok{color:var(--g)}.mono{font-family:ui-monospace,monospace;font-size:12px;color:var(--m)}a{color:var(--a)}
.tw{overflow-x:auto}
</style></head><body><div class="w">
<h1>Конвейер заказов</h1><p class="sub">${new Date().toLocaleString('ru-RU')} · цель ${usd(target)}/час · режим: ${ctx.config.profile.mode === 'reviews' ? 'набрать отзывы' : 'прибыль за час'}</p>
<h2>Сегодня</h2><div class="grid">
${cell('Найдено', String(t.fetched), `отсеяно правилами ${t.filtered}`)}${cell('Оценено моделью', String(t.scored), `показано ${t.shown} · $${t.llmCostUsd.toFixed(2)}`)}
${cell('🔥 HOT', String(t.hot))}${cell('💰 HIGH PROFIT', String(t.highProfit))}${cell('⚡ QUICK WIN', String(t.quickWin))}
${cell('Ждут решения', String(t.pendingDecision))}${cell('Активных проектов', String(t.activeProjects))}</div>
<h2>Месяц</h2><div class="grid">
${cell('Получено', usd(m.grossUsd), `чистыми ${usd(m.netUsd)}`)}${cell('Ожидается', usd(m.expectedUsd), 'проекты + отклики × шанс')}
${cell('Реальный $/час', m.hourlyUsd == null ? '—' : usd(m.hourlyUsd), m.hourlyUsd == null ? 'нужны оплаченные проекты с учётом времени' : m.hourlyUsd >= target ? 'выше цели' : 'ниже цели')}
${cell('Отклики → победы', `${m.applications} → ${m.won}`, m.winRate != null ? `конверсия ${Math.round(m.winRate * 100)}%` : '')}
${cell('Средний заказ', usd(m.avgOrderUsd))}${cell('Часов на проект', m.avgProjectHours?.toFixed(1) ?? '—')}${cell('Доля AI', m.aiShare != null ? Math.round(m.aiShare * 100) + '%' : '—')}</div>
<h2>Очередь по ожидаемым $/час</h2><div class="tw"><table><tr><th>Категория</th><th>Заказ</th><th>Бюджет</th><th>Часы</th><th>Шанс</th><th>Ожид. $/ч</th><th>Если выиграть</th><th>Score</th></tr>
${q.map(({ opp, score }) => `<tr><td class="${score.primary === 'HOT' ? 'hot' : ''}">${CATEGORY_LABEL[score.primary]}</td><td>${opp.url ? `<a href="${esc(opp.url)}" target="_blank" rel="noopener">${esc(opp.title)}</a>` : esc(opp.title)}<div class="mono">${esc(opp.platform)} · ${esc(score.summary).slice(0, 120)}</div></td><td class="n">${usd(score.budgetUsd)}</td><td class="n">${score.est_hours}</td><td class="n">${Math.round(score.pWin * 100)}%</td><td class="n"><b>${usd(score.evHourly)}</b></td><td class="n">${usd(score.hourlyIfWon)}</td><td class="n">${score.score}</td></tr>`).join('') || '<tr><td colspan="8">Пусто — запустите проход или добавьте заказ через бота</td></tr>'}
</table></div>
<h2>Активные проекты</h2><div class="tw"><table><tr><th>#</th><th>Проект</th><th>Статус</th><th>Бюджет</th><th>Часов</th><th>Оценка</th></tr>
${projects.map(p => `<tr><td class="mono">${p.id}</td><td>${esc(p.title)}<div class="mono">${esc(p.platform)}${p.client_name ? ' · ' + esc(p.client_name) : ''}</div></td><td>${esc(p.status)}</td><td class="n">${usd(p.budget_usd as number)}</td><td class="n">${(ctx.db.projectMinutes(Number(p.id)) / 60).toFixed(1)}</td><td class="n">${p.est_hours ?? '—'}</td></tr>`).join('') || '<tr><td colspan="6">Нет активных проектов</td></tr>'}
</table></div>
<h2>Что приносит деньги</h2><div class="tw"><table><tr><th>Услуга</th><th>Проектов</th><th>Чистыми</th><th>Часов</th><th>$/час</th></tr>
${s.map(l => `<tr><td>${esc(l.service)}</td><td class="n">${l.projects}</td><td class="n">${usd(l.netUsd)}</td><td class="n">${l.hours.toFixed(1)}</td><td class="n ${l.hourlyUsd != null && l.hourlyUsd >= target ? 'ok' : ''}">${usd(l.hourlyUsd)}</td></tr>`).join('') || '<tr><td colspan="5">Появится после первых оплат с учётом времени</td></tr>'}
</table></div>
</div></body></html>`;
}

export function startWeb(ctx: SourceContext) {
  const { webHost, webPort } = ctx.config.env;
  const srv = http.createServer((req, res) => {
    try {
      if (req.url === '/api/stats') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ today: today(ctx.db), month: money(ctx.db), byService: byService(ctx.db, ctx.config) }));
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(page(ctx));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Ошибка: ' + (e instanceof Error ? e.message : e));
    }
  });
  srv.listen(webPort, webHost);
  return srv;
}
