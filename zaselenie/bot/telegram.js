/* Телеграм-бот поверх агента заселения.
   Запуск:  node zaselenie/bot/telegram.js
   Зависимостей нет: только встроенные fetch и http. */
'use strict';

var http = require('http');
var cfg = require('./config.js');
var Store = require('./sessions.js');

/* Модули агента кладутся в глобальную область — так же, как в браузере */
['util', 'knowledge', 'holds', 'nlu', 'policy', 'reply', 'risk', 'scenarios', 'agent', 'facts']
  .forEach(function (m) { require('../js/' + m + '.js'); });

var claude = require('./claude.js');
var HOLDS = global.HOLDS;

var LIMIT = 4000;                                   // телеграм режет на 4096
var PICK = ['первый', 'второй', 'третий'];

/* ---------- транспорт ---------- */

function call(method, params) {
  return fetch('https://api.telegram.org/bot' + cfg.token + '/' + method, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params || {})
  }).then(function (r) {
    return r.json().then(function (data) {
      if (!data.ok) {
        /* 429 — просят подождать; отдаём наверх, там решат про повтор */
        var err = new Error(data.description || ('telegram ' + r.status));
        err.retryAfter = data.parameters && data.parameters.retry_after;
        throw err;
      }
      return data.result;
    });
  });
}

/* ---------- разбор апдейта ---------- */

function parse(update) {
  if (update.callback_query) {
    var cq = update.callback_query;
    return {
      kind: 'callback',
      chatId: cq.message && cq.message.chat.id,
      user: cq.from,
      data: cq.data,
      callbackId: cq.id
    };
  }

  var msg = update.message || update.edited_message;
  if (!msg) return { kind: 'skip' };

  var base = { chatId: msg.chat.id, user: msg.from, messageId: msg.message_id, chatType: msg.chat.type };

  if (msg.contact) {
    var c = msg.contact;
    return Object.assign(base, {
      kind: 'contact',
      text: 'Меня зовут ' + [c.first_name, c.last_name].filter(Boolean).join(' ') +
            ', телефон ' + (c.phone_number[0] === '+' ? c.phone_number : '+' + c.phone_number)
    });
  }
  if (msg.location) return Object.assign(base, { kind: 'location', text: 'Прислал геопозицию' });

  var text = msg.text || msg.caption || '';
  if (!text) {
    if (msg.voice || msg.video_note || msg.audio) return Object.assign(base, { kind: 'media', text: '[голосовое]' });
    if (msg.photo) return Object.assign(base, { kind: 'media', text: '[фото]' });
    if (msg.document) return Object.assign(base, { kind: 'media', text: '[файл]' });
    if (msg.sticker) return Object.assign(base, { kind: 'media', text: '[стикер]' });
    return Object.assign(base, { kind: 'skip' });
  }

  if (text[0] === '/') {
    return Object.assign(base, { kind: 'command', text: text, command: text.split(/[\s@]/)[0].toLowerCase() });
  }
  return Object.assign(base, { kind: 'text', text: text });
}

/* ---------- клавиатуры ---------- */

function keyboard(res) {
  var offers = res.analysis.match ? res.analysis.match.offers.slice(0, 3) : [];

  if (res.action === 'offer' && offers.length) {
    var rows = offers.map(function (o, i) {
      return [{ text: 'Беру: ' + o.object.title, callback_data: 'pick:' + i }];
    });
    rows.push([{ text: 'Другие даты', callback_data: 'dates' },
               { text: 'Позвать менеджера', callback_data: 'human' }]);
    return { inline_keyboard: rows };
  }

  if (res.action === 'hold') {
    return {
      keyboard: [[{ text: 'Отправить мой номер', request_contact: true }]],
      resize_keyboard: true, one_time_keyboard: true
    };
  }

  if (res.action === 'decline' || res.escalate) {
    return { inline_keyboard: [[{ text: 'Позвать менеджера', callback_data: 'human' }]] };
  }

  if (res.action === 'ask' && res.analysis.missing.indexOf('даты') >= 0) {
    return {
      inline_keyboard: [[
        { text: 'На сегодня', callback_data: 'q:сегодня на 1 ночь' },
        { text: 'На завтра', callback_data: 'q:завтра на 2 ночи' },
        { text: 'На выходные', callback_data: 'q:на выходные' }
      ]]
    };
  }
  return null;
}

/* ---------- отправка ---------- */

function chunks(text) {
  var out = [], rest = String(text);
  while (rest.length > LIMIT) {
    var cut = rest.lastIndexOf('\n', LIMIT);
    if (cut < LIMIT / 2) cut = LIMIT;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, '');
  }
  out.push(rest);
  return out;
}

function createBot(io) {
  io = io || {};
  var send = io.call || call;
  var sessions = io.sessions;
  var llm = io.claude || claude;
  var log = io.log || function (s) { console.log(new Date().toISOString().slice(0, 19) + ' ' + s); };
  var rate = new Map();

  function reply(chatId, text, markup) {
    var parts = chunks(text);
    return parts.reduce(function (p, part, i) {
      return p.then(function () {
        return send('sendMessage', {
          chat_id: chatId,
          text: part,
          reply_markup: (i === parts.length - 1 && markup) ? markup : undefined,
          disable_web_page_preview: true
        });
      });
    }, Promise.resolve());
  }

  /* Не больше N сообщений в минуту от одного чата */
  function overLimit(chatId) {
    var now = Date.now(), e = rate.get(chatId);
    if (!e || now - e.start > 60000) { rate.set(chatId, { start: now, n: 1 }); return false; }
    e.n++;
    return e.n > cfg.rateLimit;
  }

  function notifyManager(res, incoming) {
    if (!cfg.managerChat) return Promise.resolve();
    var a = res.analysis;
    var u = incoming.user || {};
    var who = [u.first_name, u.last_name].filter(Boolean).join(' ') + (u.username ? ' @' + u.username : '');
    var text = [
      'Нужен человек — ' + res.scenarioTitle,
      'Гость: ' + (who || 'без имени') + ' · chat id ' + incoming.chatId,
      'Сообщение: «' + String(incoming.text).slice(0, 300) + '»',
      'Сценарий: ' + res.scenario + ' · решение: ' + res.action + ' · риск ' + a.risk.score + ' (' + a.risk.level + ')',
      a.risk.flags.length ? 'Флаги: ' + a.risk.flags.map(function (f) { return f.why; }).join('; ') : null,
      res.internal ? 'Заметка: ' + res.internal : null,
      a.req.from ? 'Даты: ' + U.range(a.req.from, a.req.to || a.req.from) + ', гостей ' + (a.req.guests || '?') : null,
      'Ответ бота: ' + String(res.reply).slice(0, 400)
    ].filter(Boolean).join('\n');
    return reply(cfg.managerChat, text).catch(function (e) { log('не смог уведомить менеджера: ' + e.message); });
  }

  /* Одно сообщение гостя: движок считает, модель (если включена) формулирует */
  function answer(incoming) {
    var chatId = incoming.chatId;
    var ctx = sessions.get(chatId, incoming.user);
    var res = AGENT.respond(incoming.text, ctx);

    log('chat ' + chatId + ' · «' + incoming.text.slice(0, 60) + '» → ' + res.scenario + '/' + res.action +
        ' · риск ' + res.analysis.risk.score);

    if (res.action === 'ignore') return Promise.resolve(res);      // спам не кормим ответами

    /* Для модели восстанавливаем диалог парами: вопрос гостя — что ответили.
       Последний ход — текущее сообщение, его модель получит отдельно. */
    var history = ctx.history.slice(-5, -1).reduce(function (acc, h) {
      acc.push({ role: 'user', text: h.in });
      if (h.out) acc.push({ role: 'assistant', text: h.out });
      return acc;
    }, []);

    var textPromise = llm.ready()
      ? send('sendChatAction', { chat_id: chatId, action: 'typing' })
          .catch(function () {})
          .then(function () { return llm.ask(incoming.text, res, history); })
          .then(function (out) { return { text: out.reply, note: out.note }; })
          .catch(function (e) {
            log('модель недоступна (' + e.message + '), отвечаю движком');
            return { text: res.reply, note: null };
          })
      : Promise.resolve({ text: res.reply, note: null });

    return textPromise.then(function (out) {
      /* В историю кладём то, что гость реально увидел */
      if (ctx.history.length) ctx.history[ctx.history.length - 1].out = out.text;
      return reply(chatId, out.text, keyboard(res)).then(function () {
        if (res.escalate) {
          res.modelNote = out.note;
          return notifyManager(res, incoming);
        }
      });
    }).then(function () { return res; });
  }

  function command(incoming) {
    var chatId = incoming.chatId;
    switch (incoming.command) {
      case '/start':
        sessions.reset(chatId);
        return reply(chatId, [
          'Здравствуйте! ' + KB.settings.brand + ' — ' + KB.settings.business + ' в ' + KB.settings.cityIn + '.',
          'Напишите даты и сколько гостей — подберу варианты с ценами.',
          'Например: «с 12 по 15 ноября, нас трое, с ребёнком 4 года».'
        ].join('\n'));
      case '/help':
        return reply(chatId, [
          'Что я умею:',
          '· подобрать квартиру по датам, числу гостей и бюджету',
          '· посчитать цену, депозит и предоплату',
          '· забронировать и прислать инструкцию по заселению',
          '· ответить про питомцев, парковку, регистрацию и документы',
          '',
          '/reset — начать подбор заново',
          'Нужен живой менеджер — напишите «позовите человека».'
        ].join('\n'));
      case '/reset':
        sessions.reset(chatId);
        return reply(chatId, 'Начинаем заново. Напишите даты и число гостей.');
      case '/stats':
        if (String(chatId) !== String(cfg.managerChat)) return reply(chatId, 'Эта команда для менеджера.');
        var s = sessions.stats();
        return reply(chatId, 'Диалогов: ' + s.всего + '\nАктивных за час: ' + s.активных_за_час +
                             '\nС бронью: ' + s.с_бронью + '\nУдержаний сейчас: ' + HOLDS.count());
      default:
        return reply(chatId, 'Такой команды нет. Напишите даты и число гостей — подберу квартиру.');
    }
  }

  function callback(incoming) {
    var data = incoming.data || '';
    var text;
    if (data.indexOf('pick:') === 0) text = 'беру ' + (PICK[+data.slice(5)] || 'первый');
    else if (data === 'dates') text = 'подберите другие даты';
    else if (data === 'human') text = 'позовите человека';
    else if (data.indexOf('q:') === 0) text = data.slice(2);
    else text = data;

    return send('answerCallbackQuery', { callback_query_id: incoming.callbackId })
      .catch(function () {})
      .then(function () { return answer({ chatId: incoming.chatId, user: incoming.user, text: text }); });
  }

  function handleUpdate(update) {
    var incoming = parse(update);
    if (incoming.kind === 'skip' || !incoming.chatId) return Promise.resolve(null);
    if (incoming.chatType && incoming.chatType !== 'private' &&
        String(incoming.chatId) !== String(cfg.managerChat)) {
      return Promise.resolve(null);                                 // в чужих группах молчим
    }
    if (overLimit(incoming.chatId)) {
      return reply(incoming.chatId, 'Слишком много сообщений подряд — отвечу через минуту.').catch(function () {});
    }

    var run = incoming.kind === 'command' ? command(incoming)
            : incoming.kind === 'callback' ? callback(incoming)
            : answer(incoming);

    return run.catch(function (e) {
      log('ошибка обработки: ' + (e && e.stack || e));
      return reply(incoming.chatId,
        'Что-то сломалось на моей стороне. Напишите ещё раз или позвоните: ' + KB.settings.manager.phone
      ).catch(function () {});
    });
  }

  return { handleUpdate: handleUpdate, parse: parse, keyboard: keyboard, chunks: chunks, reply: reply, answer: answer };
}

/* ---------- режимы работы ---------- */

function startPolling(bot, log) {
  var offset = 0, running = true, fails = 0;

  function loop() {
    if (!running) return;
    call('getUpdates', { offset: offset, timeout: 30, allowed_updates: ['message', 'callback_query'] })
      .then(function (updates) {
        fails = 0;
        var chain = Promise.resolve();
        updates.forEach(function (u) {
          offset = Math.max(offset, u.update_id + 1);
          chain = chain.then(function () { return bot.handleUpdate(u); });
        });
        return chain;
      })
      .catch(function (e) {
        fails++;
        var wait = e.retryAfter ? e.retryAfter * 1000 : Math.min(30000, 1000 * Math.pow(2, fails));
        log('сбой опроса (' + e.message + '), повтор через ' + Math.round(wait / 1000) + ' с');
        return new Promise(function (ok) { setTimeout(ok, wait); });
      })
      /* Пауза между циклами: при обычном long polling Telegram держит запрос
         до 30 секунд, но если ответ приходит мгновенно (прокси, сбой), без
         паузы цикл раскрутится вхолостую и съест процессор */
      .then(function () { return new Promise(function (ok) { setTimeout(ok, 300); }); })
      .then(loop);
  }

  call('deleteWebhook', { drop_pending_updates: false })
    .catch(function () {})
    .then(loop);

  return function stop() { running = false; };
}

function startWebhook(bot, log) {
  var server = http.createServer(function (req, res) {
    if (req.method !== 'POST') { res.writeHead(404); return res.end(); }
    if (cfg.webhookSecret && req.headers['x-telegram-bot-api-secret-token'] !== cfg.webhookSecret) {
      res.writeHead(403); return res.end();
    }
    var body = '';
    req.on('data', function (c) {
      body += c;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', function () {
      res.writeHead(200); res.end('ok');                            // отвечаем сразу, работаем следом
      try { bot.handleUpdate(JSON.parse(body)); } catch (e) { log('битый апдейт: ' + e.message); }
    });
  });

  server.listen(cfg.port, function () { log('вебхук слушает порт ' + cfg.port); });

  call('setWebhook', {
    url: cfg.webhookUrl,
    secret_token: cfg.webhookSecret,
    allowed_updates: ['message', 'callback_query']
  }).then(function () { log('вебхук зарегистрирован: ' + cfg.webhookUrl); })
    .catch(function (e) { log('не смог зарегистрировать вебхук: ' + e.message); });

  return function stop() { server.close(); };
}

function start() {
  var log = function (s) { console.log(new Date().toISOString().slice(0, 19) + ' ' + s); };
  var errs = cfg.check();
  if (errs.length) { errs.forEach(function (e) { console.error('✗ ' + e); }); process.exit(1); }

  /* Календарь чаще всего приезжает выгрузкой из чужой системы — проверяем его,
     иначе битая бронь молча означает «квартира свободна» */
  var problems = KB.validate();
  if (problems.length) {
    log('в календаре ' + problems.length + ' проблем(ы), эти квартиры могут продаться дважды:');
    problems.forEach(function (x) { log('  ! ' + x); });
  }

  var sessions = new Store(cfg.sessionsFile, cfg.sessionTtlHours).holds(HOLDS).attach(KB, AGENT).autosave(15000);
  var bot = createBot({ sessions: sessions, log: log });

  call('getMe').then(function (me) {
    log('бот @' + me.username + ' запущен в режиме ' + cfg.mode +
        (claude.ready() ? ', ответы формулирует ' + cfg.model : ', ответы формулирует движок') +
        (cfg.managerChat ? ', эскалации → ' + cfg.managerChat : ', менеджер не задан'));
  }).catch(function (e) {
    console.error('✗ Телеграм не принял токен: ' + e.message);
    process.exit(1);
  });

  var stop = cfg.mode === 'webhook' ? startWebhook(bot, log) : startPolling(bot, log);

  ['SIGINT', 'SIGTERM'].forEach(function (sig) {
    process.on(sig, function () {
      log('останавливаюсь, сохраняю сессии');
      stop();
      sessions.stop();
      process.exit(0);
    });
  });
}

module.exports = { createBot: createBot, parse: parse, keyboard: keyboard, chunks: chunks, call: call, start: start };

if (require.main === module) start();
