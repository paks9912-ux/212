/* HTTP-платформа: вход для каналов, API панели, живые события, статика.
   Зависимостей нет — только встроенный http. Запуск: node zaselenie/platform/server.js */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');

var crypto = require('crypto');

var Store = require('./store.js');
var Core = require('./core.js');
var cfg = require('../bot/config.js');
var claude = require('../bot/claude.js');

var PORT = +(process.env.PLATFORM_PORT || cfg.port || 8080);
var MANAGER_TOKEN = process.env.MANAGER_TOKEN || '';
var CHANNEL_TOKEN = process.env.CHANNEL_TOKEN || '';
var DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
var OPEN_CHANNELS = (process.env.OPEN_CHANNELS || 'web').split(',');   // каналы без токена (виджет сайта)

function log(s) { console.log(new Date().toISOString().slice(0, 19) + ' ' + s); }

/* Виджету на сайте нужен обратный канал: ответы менеджера приходят не в ответ
   на его запрос. Подписываем идентификатор диалога, чтобы чужую переписку
   нельзя было прочитать, подобрав chatId. */
var PULL_SECRET = process.env.PULL_SECRET || crypto.randomBytes(24).toString('hex');
function sign(chatId) {
  return crypto.createHmac('sha256', PULL_SECRET).update(String(chatId)).digest('hex').slice(0, 32);
}

var store = new Store(DATA_DIR).autosave(3000);
var core = new Core({ store: store, llm: claude, log: log });

/* ---------- каналы ---------- */

require('./channels/telegram.js').install(core, { log: log, cfg: cfg });
require('./channels/web.js').install(core, { log: log });

/* ---------- утилиты ---------- */

function send(res, code, body, headers) {
  var data = typeof body === 'string' ? body : JSON.stringify(body);
  var h = Object.assign({
    'content-type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type,x-token,x-channel-token',
    'cache-control': 'no-store'
  }, headers || {});
  res.writeHead(code, h);
  res.end(data);
}

function body(req) {
  return new Promise(function (ok, fail) {
    var buf = '';
    req.on('data', function (c) {
      buf += c;
      if (buf.length > 1e6) { req.destroy(); fail(new Error('слишком большой запрос')); }
    });
    req.on('end', function () {
      if (!buf) return ok({});
      try { ok(JSON.parse(buf)); } catch (e) { fail(new Error('тело запроса не JSON')); }
    });
  });
}

function token(req, q) {
  return req.headers['x-token'] || q.token || '';
}

function manager(req, q) {
  return !MANAGER_TOKEN || token(req, q) === MANAGER_TOKEN;
}

var MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
             '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };

function static_(res, file) {
  fs.readFile(file, function (err, data) {
    if (err) return send(res, 404, 'не найдено');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ---------- живые события для панели ---------- */

var sse = [];
store.on(function (event) {
  var line = 'data: ' + JSON.stringify(event) + '\n\n';
  sse.forEach(function (res) {
    try { res.write(line); } catch (e) {}
  });
});

/* ---------- маршруты ---------- */

var server = http.createServer(function (req, res) {
  var parsed = url.parse(req.url, true);
  var p = parsed.pathname.replace(/\/+$/, '') || '/';
  var q = parsed.query;

  if (req.method === 'OPTIONS') return send(res, 204, '');

  /* Здоровье */
  if (p === '/api/health') {
    return send(res, 200, { ok: true, каналы: Object.keys(core.channels), время: new Date().toISOString() });
  }

  /* Универсальный вход канала */
  if (p === '/api/message' && req.method === 'POST') {
    return body(req).then(function (data) {
      var channel = data.channel || 'web';
      var open = OPEN_CHANNELS.indexOf(channel) >= 0;
      if (!open && CHANNEL_TOKEN && req.headers['x-channel-token'] !== CHANNEL_TOKEN) {
        return send(res, 403, { error: 'нужен x-channel-token' });
      }
      if (!data.chatId || !data.text) return send(res, 400, { error: 'нужны chatId и text' });

      return core.incoming({
        channel: channel, chatId: String(data.chatId),
        text: String(data.text).slice(0, 4000), user: data.user || null
      }).then(function (out) {
        send(res, 200, {
          reply: out.reply,
          messageId: out.messageId || null,
          pullToken: channel === 'web' ? sign(data.chatId) : undefined,
          silent: !!out.silent,
          scenario: out.res && out.res.scenario,
          action: out.res && out.res.action,
          escalated: !!(out.res && out.res.escalate),
          booking: out.res && out.res.crm ? out.res.crm : null
        });
      });
    }).catch(function (e) { send(res, 400, { error: e.message }); });
  }

  /* Обратный канал виджета: что написали гостю, пока он молчал */
  if (p === '/api/pull' && req.method === 'GET') {
    if (!q.chatId || q.token !== sign(q.chatId)) return send(res, 403, { error: 'подпись не совпала' });
    var dialog = store.dialogById('web:' + q.chatId);
    if (!dialog) return send(res, 200, { messages: [], mode: 'бот' });
    /* Отдаём по идентификаторам, а не по времени: иначе ответ менеджера
       теряется, если гость успел написать раньше следующего опроса */
    return send(res, 200, {
      mode: dialog.mode,
      messages: store.history(dialog.id, 50)
        .filter(function (m) { return m.from !== 'guest'; })
        .map(function (m) { return { id: m.id, from: m.from, text: m.text, at: m.at }; })
    });
  }

  /* Вебхук телеграма */
  var tg = /^\/webhook\/telegram$/.exec(p);
  if (tg && req.method === 'POST') {
    if (cfg.webhookSecret && req.headers['x-telegram-bot-api-secret-token'] !== cfg.webhookSecret) {
      return send(res, 403, { error: 'секрет не совпал' });
    }
    return body(req).then(function (update) {
      send(res, 200, { ok: true });                   // телеграму отвечаем сразу
      var adapter = core.channels.telegram;
      if (adapter && adapter.update) adapter.update(update);
    }).catch(function () { send(res, 200, { ok: true }); });
  }

  /* Дальше данные — только для менеджера. Разметка и стили панели открыты:
     без токена она просто ничего не покажет, зато грузится без костылей. */
  if (p.indexOf('/api/') === 0 && !manager(req, q)) {
    return send(res, 401, { error: 'нужен токен менеджера' });
  }

  if (p === '/api/dialogs' && req.method === 'GET') {
    return send(res, 200, store.dialogs(q.filter).map(function (d) {
      return {
        id: d.id, channel: d.channel, chatId: d.chatId, guest: d.guest, mode: d.mode,
        lastAt: d.lastAt, lastText: d.lastText, unread: d.unread,
        escalated: d.escalated, risk: d.risk, scenario: d.scenario
      };
    }));
  }

  var dlg = /^\/api\/dialogs\/([^/]+)$/.exec(p);
  if (dlg && req.method === 'GET') {
    var d = store.dialogById(decodeURIComponent(dlg[1]));
    if (!d) return send(res, 404, { error: 'диалог не найден' });
    return send(res, 200, { dialog: d, messages: store.history(d.id, 100) });
  }

  var act = /^\/api\/dialogs\/([^/]+)\/(reply|takeover|release)$/.exec(p);
  if (act && req.method === 'POST') {
    var id = decodeURIComponent(act[1]), what = act[2];
    return body(req).then(function (data) {
      if (what === 'takeover') return send(res, 200, core.takeover(id, data.who) || { error: 'нет диалога' });
      if (what === 'release') return send(res, 200, core.release(id) || { error: 'нет диалога' });
      if (!data.text) return send(res, 400, { error: 'нужен text' });
      return core.managerReply(id, String(data.text))
        .then(function (dd) { send(res, 200, { ok: true, dialog: dd.id }); })
        .catch(function (e) { send(res, 404, { error: e.message }); });
    }).catch(function (e) { send(res, 400, { error: e.message }); });
  }

  if (p === '/api/bookings' && req.method === 'GET') return send(res, 200, store.bookings(q.filter));

  var bk = /^\/api\/bookings\/([^/]+)\/status$/.exec(p);
  if (bk && req.method === 'POST') {
    return body(req).then(function (data) {
      var b = store.setStatus(decodeURIComponent(bk[1]), data.status, data.by || 'менеджер');
      send(res, b ? 200 : 400, b || { error: 'нельзя поставить такой статус', допустимые: store.FLOW });
    }).catch(function (e) { send(res, 400, { error: e.message }); });
  }

  if (p === '/api/holds') return send(res, 200, core.holds());
  if (p === '/api/stats') return send(res, 200, store.stats());
  if (p === '/api/objects') {
    return send(res, 200, global.KB.objects.map(function (o) {
      return { id: o.id, title: o.title, district: o.district, capacity: o.capacity + o.extraBeds, base: o.base, busy: o.busy };
    }));
  }

  if (p === '/api/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache', 'connection': 'keep-alive',
      'access-control-allow-origin': '*'
    });
    res.write('retry: 3000\n\n');
    sse.push(res);
    req.on('close', function () { sse = sse.filter(function (x) { return x !== res; }); });
    return;
  }

  /* Статика: панель менеджера и виджет для сайта */
  if (p === '/' || p === '/panel') return static_(res, path.join(__dirname, 'panel', 'index.html'));
  if (p === '/widget.js') return static_(res, path.join(__dirname, 'panel', 'widget.js'));
  if (p === '/demo') return static_(res, path.join(__dirname, 'panel', 'demo.html'));
  if (/^\/panel\/[\w.-]+$/.test(p)) return static_(res, path.join(__dirname, 'panel', p.slice(7)));

  send(res, 404, { error: 'нет такого маршрута', подсказка: 'GET /api/health' });
});

if (require.main === module) {
  var problems = global.KB.validate();
  if (problems.length) {
    log('в календаре ' + problems.length + ' проблем(ы):');
    problems.forEach(function (x) { log('  ! ' + x); });
  }

  server.listen(PORT, function () {
    log('платформа слушает порт ' + PORT);
    log('панель менеджера: http://localhost:' + PORT + '/panel' + (MANAGER_TOKEN ? '?token=' + MANAGER_TOKEN : ''));
    log('демо-сайт с виджетом: http://localhost:' + PORT + '/demo');
    log('вход для каналов: POST http://localhost:' + PORT + '/api/message');
    if (!MANAGER_TOKEN) log('ВНИМАНИЕ: MANAGER_TOKEN не задан — панель открыта всем, кто знает адрес');
    log(claude.ready() ? 'ответы формулирует ' + cfg.model : 'ответы формулирует движок');
  });

  ['SIGINT', 'SIGTERM'].forEach(function (sig) {
    process.on(sig, function () { log('останавливаюсь, сохраняю данные'); store.stop(); process.exit(0); });
  });
}

module.exports = { server: server, store: store, core: core };
