/* Этап после победы: разбор ТЗ в задачи и сообщение о сдаче */
import type { SourceContext } from '../sources/base.js';
import { planProject, deliveryMessage, type Plan, type Delivery } from '../llm.js';

export function projectContext(ctx: SourceContext, pid: number): string {
  const p = ctx.db.project(pid);
  if (!p) throw new Error('Нет проекта #' + pid);
  const opp = p.opportunity_id ? ctx.db.opportunity(String(p.opportunity_id)) : null;
  const tasks = ctx.db.tasks(pid);
  const msgs = ctx.db.all('SELECT direction, text FROM messages WHERE project_id = ? ORDER BY id DESC LIMIT 6', pid).reverse();
  return [
    `Проект #${pid}: ${p.title}`,
    `Площадка: ${p.platform}. Клиент: ${p.client_name || '—'}. Бюджет: ${p.budget_usd != null ? '$' + p.budget_usd : '—'}. Срок: ${p.deadline || 'не задан'}. Статус: ${p.status}.`,
    p.est_hours != null ? `Оценка часов при отклике: ${p.est_hours}.` : '',
    `\n## ТЗ\n${p.requirements || opp?.text || '(текста ТЗ нет — попросите у клиента)'}`,
    p.notes ? `\n## Заметки\n${p.notes}` : '',
    tasks.length ? `\n## Задачи\n${tasks.map(t => `${t.done ? '[x]' : '[ ]'} ${t.title}${t.estHours != null ? ` (${t.estHours} ч)` : ''}`).join('\n')}` : '',
    msgs.length ? `\n## Переписка\n${msgs.map(m => `${m.direction === 'in' ? 'Клиент' : 'Я'}: ${String(m.text).slice(0, 500)}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');
}

export async function makePlan(ctx: SourceContext, pid: number): Promise<Plan> {
  const { plan, costUsd } = await planProject(projectContext(ctx, pid), ctx.config);
  ctx.db.replaceTasks(pid, plan.steps.map(s => ({ title: s.title, estHours: s.est_hours, aiShare: s.ai_share })));
  const est = plan.steps.reduce((a, s) => a + s.est_hours, 0);
  const ai = est ? plan.steps.reduce((a, s) => a + s.est_hours * s.ai_share, 0) / est : null;
  ctx.db.updateProject(pid, { est_hours: est, ai_share: ai, notes: renderPlan(plan) });
  ctx.db.event('plan', { pid, est, costUsd });
  return plan;
}

export function renderPlan(p: Plan): string {
  const est = p.steps.reduce((a, s) => a + s.est_hours, 0);
  const lines = [`Суть: ${p.summary}`, ``, `Подход: ${p.approach}`, ``];
  if (p.missing_info.length) lines.push('Не хватает: ' + p.missing_info.join('; '), '');
  if (p.questions_for_client.length) { lines.push('Вопросы клиенту:'); p.questions_for_client.forEach((q, i) => lines.push(`  ${i + 1}. ${q}`)); lines.push(''); }
  lines.push(`Шаги (всего ~${est.toFixed(1)} ч):`);
  p.steps.forEach((s, i) => lines.push(`  ${i + 1}. ${s.title} — ${s.est_hours} ч, AI ${Math.round(s.ai_share * 100)}%${s.notes ? ' · ' + s.notes : ''}`));
  if (p.risks.length) { lines.push('', 'Риски:'); p.risks.forEach(r => lines.push('  • ' + r)); }
  lines.push('', 'Сдаём: ' + p.deliverables.join('; '));
  lines.push('Принято, если: ' + p.definition_of_done.join('; '));
  return lines.join('\n');
}

export async function makeDelivery(ctx: SourceContext, pid: number): Promise<Delivery> {
  const { delivery, costUsd } = await deliveryMessage(projectContext(ctx, pid), ctx.config);
  ctx.db.saveMessage(pid, 'out', delivery.message, { kind: 'delivery', checklist: delivery.checklist, upsell: delivery.upsell });
  ctx.db.event('delivery_draft', { pid, costUsd });
  return delivery;
}
