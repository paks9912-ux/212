/* Telegram: алерты с кнопками и команды. Отвечает только вашему chat id — остальных игнорирует. */
import { Bot, InlineKeyboard, GrammyError, HttpError } from 'grammy';
import type { SourceContext } from '../sources/base.js';
import type { Opportunity, Scored } from '../types.js';
import { CATEGORY_LABEL } from '../pipeline/rank.js';
import { ingestManual } from '../pipeline/run.js';
import { writeProposals, analyzeReply, describeError } from '../llm.js';
import { textReport } from '../ledger/report.js';
import { calibrationReport } from '../calibrate/index.js';
import { makePlan, makeDelivery, renderPlan } from '../sales/project.js';
import { log } from '../log.js';

const L = log('bot');
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const usd = (v: number) => '$' + Math.round(v).toLocaleString('en-US');

const REJECT_REASONS: Array<[string, string]> = [
  ['budget', 'мало денег'], ['competition', 'много откликов'], ['fit', 'не моя тема'],
  ['client', 'клиент не нравится'], ['scope', 'мутное ТЗ'], ['other', 'другое'],
];

export function card(o: Opportunity, s: Scored): string {
  const risk = { low: 'низкий', medium: 'средний', high: 'высокий' }[s.risk_level];
  const lines = [
    `${CATEGORY_LABEL[s.primary]} · ${esc(o.platform)}${o.postedAt ? ' · ' + esc(ago(o.postedAt)) : ''}`,
    `<b>${esc(o.title)}</b>`,
    `Бюджет ${o.budgetUsd != null ? usd(o.budgetUsd) : '≈ ' + usd(s.budgetUsd) + ' (оценка)'} · ~${s.est_hours} ч` +
      (o.proposals != null ? ` · откликов ${o.proposals}` : ''),
    `Ожидаемые <b>${usd(s.evHourly)}/час</b> · если выиграть — ${usd(s.hourlyIfWon)}/час · шанс ${Math.round(s.pWin * 100)}%`,
    `Score ${s.score} · AI ${Math.round(s.factors.ai_leverage * 100)}% · риск ${risk}`,
    ``,
    `<i>${esc(s.summary)}</i>`,
  ];
  if (s.missing_info.length) lines.push(`Уточнить: ${esc(s.missing_info.slice(0, 3).join('; '))}`);
  if (s.red_flags.length) lines.push(`⚠️ ${esc(s.red_flags.slice(0, 3).join('; '))}`);
  if (o.url) lines.push(``, `<a href="${esc(o.url)}">открыть заказ</a>`);
  lines.push(`<code>${o.id}</code>`);
  return lines.join('\n');
}
function ago(iso: string) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 6e4);
  if (m < 60) return `${m} мин назад`;
  if (m < 1440) return `${Math.round(m / 60)} ч назад`;
  return `${Math.round(m / 1440)} дн назад`;
}
const decisionKb = (id: string) => new InlineKeyboard()
  .text('✍️ Отклик', `a:${id}`).text('🕓 Позже', `l:${id}`).text('✖️ Не моё', `r:${id}`);

export function createBot(ctx: SourceContext) {
  const { botToken, adminChatId } = ctx.config.env;
  if (!botToken || !adminChatId) throw new Error('Нужны TELEGRAM_BOT_TOKEN и TELEGRAM_ADMIN_CHAT_ID в .env');
  const bot = new Bot(botToken);
  const admin = String(adminChatId);

  /* авторизация: чужие сообщения молча игнорируются */
  bot.use(async (c, next) => {
    if (String(c.chat?.id ?? c.from?.id) !== admin) { L.warn(`чужой чат ${c.chat?.id}`); return; }
    await next();
  });

  const send = (text: string, kb?: InlineKeyboard) =>
    bot.api.sendMessage(admin, text, { parse_mode: 'HTML', reply_markup: kb, link_preview_options: { is_disabled: true } });

  bot.command(['start', 'help'], c => c.reply([
    'Команды:',
    '/add <ссылка или текст> — оценить заказ вручную (Upwork, Kwork и т.д.)',
    '/top — лучшие заказы в очереди', '/today — цифры дня и месяца',
    '/pause · /resume — остановить или включить алерты',
    '/won <id> · /lost <id> — исход отклика', '/projects — активные проекты',
    '/time <проект> <минуты> — учесть время', '/paid <проект> <сумма> [валюта] [комиссия]',
    '/status <проект> <STATUS> — сменить статус', '/reply <проект> <текст клиента> — разобрать сообщение',
    '/plan <проект> — разобрать ТЗ в план и задачи', '/tasks <проект> · /done <задача> — список и отметка',
    '/deliver <проект> — сообщение о сдаче и чек-лист', '/calib — что говорят исходы',
  ].join('\n')));

  bot.command('add', async c => {
    const input = c.match?.trim();
    if (!input) return c.reply('Пришлите ссылку или текст заказа после /add');
    const wait = await c.reply('Разбираю…');
    try {
      const { opp, score, note } = await ingestManual(ctx, input);
      await c.api.deleteMessage(c.chat.id, wait.message_id).catch(() => {});
      await send((note ? `<i>${esc(note)}</i>\n` : '') + card(opp, score), decisionKb(opp.id));
    } catch (e) {
      await c.reply('Не вышло: ' + describeError(e));
    }
  });

  bot.command('top', async c => {
    const q = ctx.db.queue(5);
    if (!q.length) return c.reply('Очередь пуста.');
    for (const { opp, score } of q) await send(card(opp, score), decisionKb(opp.id));
  });
  bot.command('today', c => c.reply('<pre>' + esc(textReport(ctx.db, ctx.config)) + '</pre>', { parse_mode: 'HTML' }));
  bot.command('calib', c => c.reply('<pre>' + esc(calibrationReport(ctx.db, ctx.config)) + '</pre>', { parse_mode: 'HTML' }));
  bot.command('plan', async c => {
    const pid = Number((c.match || '').trim());
    if (!pid || !ctx.db.project(pid)) return c.reply('/plan <номер проекта>');
    const wait = await c.reply('Разбираю ТЗ, это минута-две…');
    try {
      const plan = await makePlan(ctx, pid);
      await c.api.deleteMessage(c.chat.id, wait.message_id).catch(() => {});
      await c.reply('<pre>' + esc(renderPlan(plan)) + '</pre>', { parse_mode: 'HTML' });
      if (plan.questions_for_client.length) await c.reply('Вопросы клиенту — скопируйте и отправьте:\n\n' + plan.questions_for_client.map((q, i) => `${i + 1}. ${q}`).join('\n'));
    } catch (e) { await c.reply('Не вышло: ' + describeError(e)); }
  });
  bot.command('tasks', c => {
    const pid = Number((c.match || '').trim());
    const list = pid ? ctx.db.tasks(pid) : [];
    if (!list.length) return c.reply('Задач нет. Сначала /plan <проект>');
    return c.reply(list.map(t => `${t.done ? '✅' : '▫️'} ${t.id}. ${esc(t.title)}${t.estHours != null ? ` · ${t.estHours} ч` : ''}`).join('\n') + '\n\nОтметить: /done <номер задачи>', { parse_mode: 'HTML' });
  });
  bot.command('done', c => {
    const id = Number((c.match || '').trim());
    if (!id) return c.reply('/done <номер задачи>');
    ctx.db.setTaskDone(id, true);
    return c.reply('Отмечено');
  });
  bot.command('deliver', async c => {
    const pid = Number((c.match || '').trim());
    if (!pid || !ctx.db.project(pid)) return c.reply('/deliver <номер проекта>');
    const wait = await c.reply('Пишу сообщение о сдаче…');
    try {
      const d = await makeDelivery(ctx, pid);
      await c.api.deleteMessage(c.chat.id, wait.message_id).catch(() => {});
      await c.reply('<b>Проверить перед отправкой:</b>\n' + d.checklist.map(x => '• ' + esc(x)).join('\n') + (d.upsell ? `\n\n<b>Следующая работа:</b> ${esc(d.upsell)}` : ''), { parse_mode: 'HTML' });
      await c.reply(d.message);
      await c.reply('Отправляете вы. После приёмки: /status ' + pid + ' DELIVERED, после оплаты: /paid ' + pid + ' <сумма>');
    } catch (e) { await c.reply('Не вышло: ' + describeError(e)); }
  });
  bot.command('pause', c => { ctx.db.setSetting('paused', '1'); return c.reply('Алерты остановлены. /resume — включить.'); });
  bot.command('resume', c => { ctx.db.setSetting('paused', '0'); return c.reply('Алерты включены.'); });

  bot.command(['won', 'lost'], async c => {
    const id = c.match?.trim().split(/\s+/)[0];
    const opp = id ? ctx.db.opportunityByPrefix(id) : null;
    if (!opp) return c.reply('Укажите id заказа: /won a1b2c3');
    const won = c.message?.text?.startsWith('/won');
    ctx.db.setProposalOutcome(opp.id, won ? 'won' : 'lost');
    if (!won) return c.reply('Записал: не выиграли. Это тоже данные.');
    const s = ctx.db.score(opp.id);
    const pid = ctx.db.createProject({
      opportunityId: opp.id, clientName: opp.client?.name ?? null, platform: opp.platform, title: opp.title,
      serviceKey: s?.service_key ?? null, budget: opp.budgetUsd ?? s?.budgetUsd ?? null, budgetUsd: opp.budgetUsd ?? s?.budgetUsd ?? null,
      fee: s?.fee ?? 0, requirements: opp.text.slice(0, 4000), estHours: s?.est_hours ?? null,
    });
    ctx.db.setProjectStatus(pid, 'WON');
    return c.reply(`Проект #${pid} создан. Время: /time ${pid} <минуты>, оплата: /paid ${pid} <сумма>, статус: /status ${pid} IN_PROGRESS`);
  });

  bot.command('projects', c => {
    const rows = ctx.db.projects(['NEW', 'NEGOTIATION', 'WON', 'IN_PROGRESS', 'WAITING_CLIENT', 'QA', 'READY_TO_DELIVER', 'DELIVERED']);
    if (!rows.length) return c.reply('Активных проектов нет.');
    return c.reply(rows.map(r => `#${r.id} ${r.status} · ${esc(r.title)} · ${r.budget_usd != null ? usd(Number(r.budget_usd)) : '—'} · ${(ctx.db.projectMinutes(Number(r.id)) / 60).toFixed(1)} ч`).join('\n'), { parse_mode: 'HTML' });
  });
  bot.command('time', c => {
    const [pid, min, ...note] = (c.match || '').trim().split(/\s+/);
    if (!pid || !min) return c.reply('/time <проект> <минуты> [заметка]');
    if (!ctx.db.project(Number(pid))) return c.reply('Нет такого проекта');
    ctx.db.addTime(Number(pid), Number(min), note.join(' ') || undefined);
    return c.reply(`+${min} мин к проекту #${pid}, всего ${(ctx.db.projectMinutes(Number(pid)) / 60).toFixed(1)} ч`);
  });
  bot.command('paid', c => {
    const [pid, amount, cur = 'USD', fee = '0'] = (c.match || '').trim().split(/\s+/);
    if (!pid || !amount) return c.reply('/paid <проект> <сумма> [валюта] [комиссия]');
    const p = ctx.db.project(Number(pid));
    if (!p) return c.reply('Нет такого проекта');
    const rate = ctx.config.filters.usd_rates[cur.toUpperCase()] ?? 1;
    ctx.db.addPayment(Number(pid), Number(amount), cur.toUpperCase(), Number(amount) * rate, Number(fee) * rate);
    ctx.db.setProjectStatus(Number(pid), 'PAID');
    const h = ctx.db.projectMinutes(Number(pid)) / 60;
    const net = Number(amount) * rate - Number(fee) * rate;
    return c.reply(`Оплата записана. ${h > 0 ? `Реальный $/час по проекту: ${usd(net / h)}` : 'Внесите время через /time — тогда посчитаю $/час.'}`);
  });
  bot.command('status', c => {
    const [pid, st] = (c.match || '').trim().split(/\s+/);
    if (!pid || !st) return c.reply('/status <проект> NEW|NEGOTIATION|WON|IN_PROGRESS|WAITING_CLIENT|QA|READY_TO_DELIVER|DELIVERED|COMPLETED|PAID|CANCELLED');
    ctx.db.setProjectStatus(Number(pid), st.toUpperCase() as never);
    return c.reply(`#${pid} → ${st.toUpperCase()}`);
  });
  bot.command('reply', async c => {
    const m = (c.match || '').trim().match(/^(\d+)\s+([\s\S]+)$/);
    if (!m) return c.reply('/reply <проект> <текст сообщения клиента>');
    const p = ctx.db.project(Number(m[1]));
    if (!p) return c.reply('Нет такого проекта');
    const wait = await c.reply('Разбираю…');
    try {
      const { analysis } = await analyzeReply(`${p.title}\nБюджет: ${p.budget_usd ?? '—'}\nСтатус: ${p.status}\nТЗ: ${String(p.requirements || '').slice(0, 2000)}`, m[2], ctx.config);
      ctx.db.saveMessage(Number(m[1]), 'in', m[2], analysis);
      await c.api.deleteMessage(c.chat.id, wait.message_id).catch(() => {});
      const riskIcon = { low: '🟢', medium: '🟡', high: '🔴' }[analysis.risk];
      await c.reply(`<b>Что хочет клиент:</b> ${esc(analysis.intent)}\n<b>Ответить на:</b> ${esc(analysis.needs_answer.join('; ') || '—')}\n<b>Риск:</b> ${riskIcon} ${analysis.risk} — ${esc(analysis.risk_note)}\n\n<b>Предлагаю ответить:</b>\n${esc(analysis.reply)}\n\n<i>Отправляете вы — скопируйте и при желании поправьте.</i>`, { parse_mode: 'HTML' });
    } catch (e) { await c.reply('Не вышло: ' + describeError(e)); }
  });

  /* кнопки под карточкой */
  bot.on('callback_query:data', async c => {
    const [kind, id, extra] = c.callbackQuery.data.split(':');
    const opp = kind === 'p' ? null : ctx.db.opportunityByPrefix(id);
    if (kind !== 'p' && !opp) return c.answerCallbackQuery({ text: 'Заказ не найден' });
    try {
      if (kind === 'l') {
        ctx.db.decide(opp!.id, 'later');
        await c.answerCallbackQuery({ text: 'Отложил' });
        await c.editMessageReplyMarkup({ reply_markup: new InlineKeyboard().text('✍️ Отклик', `a:${opp!.id}`).text('✖️ Не моё', `r:${opp!.id}`) });
      } else if (kind === 'r' && !extra) {
        const kb = new InlineKeyboard();
        REJECT_REASONS.forEach(([k, t], i) => { kb.text(t, `r:${opp!.id}:${k}`); if (i % 2) kb.row(); });
        await c.answerCallbackQuery();
        await c.editMessageReplyMarkup({ reply_markup: kb });
      } else if (kind === 'r' && extra) {
        ctx.db.decide(opp!.id, 'reject', extra);
        await c.answerCallbackQuery({ text: 'Записал причину' });
        await c.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
      } else if (kind === 'a') {
        await c.answerCallbackQuery({ text: 'Пишу три варианта…' });
        await c.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
        const s = ctx.db.score(opp!.id);
        if (!s) return;
        ctx.db.decide(opp!.id, 'apply');
        const { list, costUsd } = await writeProposals(opp!, s, ctx.config);
        ctx.db.saveProposals(opp!.id, list, costUsd);
        const saved = ctx.db.proposals(opp!.id);
        const names = { short: 'Короткий', professional: 'Деловой', conversion: 'Продающий' };
        for (const p of saved) {
          await send(`<b>${names[p.variant]}</b>\n\n${esc(p.text)}`, new InlineKeyboard().text('✅ Отправил этот', `p:${p.id}`));
        }
        await send('Скопируйте выбранный текст и отправьте на площадке сами — автоотправка запрещена правилами. Потом отметьте исход: /won или /lost ' + opp!.id);
      } else if (kind === 'p') {
        ctx.db.chooseProposal(Number(id));
        await c.answerCallbackQuery({ text: 'Отмечен как отправленный' });
        await c.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
      }
    } catch (e) {
      L.error('callback', e);
      await c.answerCallbackQuery({ text: 'Ошибка: ' + describeError(e).slice(0, 180) }).catch(() => {});
    }
  });

  bot.catch(err => {
    const e = err.error;
    if (e instanceof GrammyError) L.error('Telegram API', e.description);
    else if (e instanceof HttpError) L.error('Telegram сеть', e.message);
    else L.error('bot', e);
  });

  /* Уведомление из конвейера: пауза — не шлём, но и статус не меняем, придёт после /resume */
  const notify = async (o: Opportunity, s: Scored) => {
    if (ctx.db.getSetting('paused') === '1') throw new Error('пауза');
    await send(card(o, s), decisionKb(o.id));
  };
  return { bot, notify, send };
}
