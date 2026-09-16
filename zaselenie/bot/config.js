/* Настройки бота из переменных окружения. Ничего секретного в коде. */
'use strict';

var fs = require('fs');
var path = require('path');

/* .env рядом с ботом — удобно для запуска руками, в проде переменные задаёт systemd */
(function loadEnv() {
  var file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split('\n').forEach(function (line) {
    var m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
})();

var cfg = {
  token: process.env.TELEGRAM_BOT_TOKEN || '',
  /* Куда падают эскалации: chat id менеджера или группы (у групп id отрицательный) */
  managerChat: process.env.MANAGER_CHAT_ID || '',
  /* Пустой ключ — бот отвечает текстами движка, это рабочий режим, не заглушка */
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  model: process.env.CLAUDE_MODEL || 'claude-opus-5',
  /* polling — ничего не нужно наружу; webhook — нужен домен с https */
  mode: process.env.BOT_MODE === 'webhook' ? 'webhook' : 'polling',
  webhookUrl: process.env.WEBHOOK_URL || '',
  webhookSecret: process.env.WEBHOOK_SECRET || '',
  port: +(process.env.PORT || 8080),
  sessionsFile: process.env.SESSIONS_FILE || path.join(__dirname, 'sessions.json'),
  sessionTtlHours: +(process.env.SESSION_TTL_HOURS || 48),
  /* Защита от флуда: сколько сообщений от одного чата в минуту обрабатываем */
  rateLimit: +(process.env.RATE_LIMIT || 20),
  logFile: process.env.LOG_FILE || ''
};

cfg.check = function () {
  var errs = [];
  if (!cfg.token) errs.push('TELEGRAM_BOT_TOKEN не задан — токен берётся у @BotFather');
  if (cfg.mode === 'webhook' && !cfg.webhookUrl) errs.push('BOT_MODE=webhook требует WEBHOOK_URL');
  if (cfg.mode === 'webhook' && !cfg.webhookSecret) errs.push('BOT_MODE=webhook требует WEBHOOK_SECRET');
  return errs;
};

module.exports = cfg;
