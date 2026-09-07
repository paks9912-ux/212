/* Точка входа. Команды: run | daemon | bot | web | add | report | calib | score | decide */
import path from 'node:path';
import { loadConfig, ROOT } from './config.js';
import { DB } from './db/index.js';
import type { SourceContext } from './sources/base.js';
import { runOnce, ingestManual, scoreOne } from './pipeline/run.js';
import { textReport } from './ledger/report.js';
import { calibrationReport } from './calibrate/index.js';
import { CATEGORY_LABEL } from './pipeline/rank.js';
import { log } from './log.js';

const L = log('main');
const [cmd = 'help', ...rest] = process.argv.slice(2);

async function main() {
  const config = loadConfig();
  const db = new DB(config.env.dbPath);
  const ctx: SourceContext = { config, db, fetch: globalThis.fetch };

  switch (cmd) {
    case 'run': {
      const r = await runOnce(ctx);
      if (r.errors.length) console.log('Ошибки:\n  ' + r.errors.join('\n  '));
      console.log('\n' + textReport(db, config));
      break;
    }
    case 'add': {
      const input = rest.join(' ');
      if (!input) throw new Error('Укажите ссылку или текст: npm run add -- "https://..."');
      const { opp, score, note } = await ingestManual(ctx, input);
      if (note) console.log('(' + note + ')');
      console.log(`${CATEGORY_LABEL[score.primary]}  ${opp.title}\nScore ${score.score} · ожидаемые $${score.evHourly}/час · если выиграть $${score.hourlyIfWon}/час · ${score.est_hours} ч · шанс ${Math.round(score.pWin * 100)}%\n${score.summary}\n${score.rationale}\nid: ${opp.id}`);
      break;
    }
    case 'score': {
      const opp = db.opportunityByPrefix(rest[0] || '');
      if (!opp) throw new Error('Нет такого заказа');
      const s = await scoreOne(ctx, opp);
      console.log(JSON.stringify(s, null, 2));
      break;
    }
    case 'decide': {
      const opp = db.opportunityByPrefix(rest[0] || '');
      const d = rest[1] as 'apply' | 'later' | 'reject';
      if (!opp || !['apply', 'later', 'reject'].includes(d)) throw new Error('decide <id> apply|later|reject [причина]');
      db.decide(opp.id, d, rest.slice(2).join(' ') || undefined);
      console.log('Записано');
      break;
    }
    case 'report': console.log(textReport(db, config)); break;
    case 'calib': console.log(calibrationReport(db)); break;
    case 'web': {
      const { startWeb } = await import('./web/server.js');
      startWeb(ctx);
      console.log(`Панель: http://${config.env.webHost}:${config.env.webPort}`);
      break;
    }
    case 'bot': {
      const { createBot } = await import('./bot/index.js');
      const { bot } = createBot(ctx);
      console.log('Бот запущен. Напишите ему /help');
      await bot.start();
      break;
    }
    case 'daemon': {
      const { createBot } = await import('./bot/index.js');
      const { startWeb } = await import('./web/server.js');
      const { bot, notify } = createBot(ctx);
      startWeb(ctx);
      const every = config.sources.poll_interval_minutes * 60e3;
      L.info(`демон: опрос каждые ${config.sources.poll_interval_minutes} мин, панель http://${config.env.webHost}:${config.env.webPort}`);
      let busy = false, lastBackup = '';
      const tick = async () => {
        if (busy) return;
        busy = true;
        try {
          await runOnce(ctx, notify);
          const day = new Date().toISOString().slice(0, 10);
          if (day !== lastBackup) { db.backup(path.join(ROOT, 'data', 'backups')); lastBackup = day; }
        } catch (e) { L.error('проход', e); }
        finally { busy = false; }
      };
      void tick();
      setInterval(tick, every);
      await bot.start();
      break;
    }
    default:
      console.log(`Команды:
  npm run run        один проход: собрать, оценить, показать отчёт
  npm run daemon     бот + панель + опрос по расписанию
  npm run bot        только бот
  npm run web        только панель
  npm run add -- "…" оценить заказ вручную (ссылка или текст)
  npm run report     цифры дня и месяца
  npm test           проверки`);
  }
}

main().catch(e => { L.error('фатально', e); process.exit(1); });
