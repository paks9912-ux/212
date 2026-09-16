/* Канал: Telegram. Транспорт и клавиатуры берём из bot/telegram.js,
   а весь разговор ведёт ядро платформы. */
'use strict';

var TG = require('../../bot/telegram.js');

exports.install = function (core, opts) {
  var cfg = opts.cfg, log = opts.log || function () {};
  if (!cfg.token) { log('канал telegram выключен: нет TELEGRAM_BOT_TOKEN'); return null; }

  var adapter = {
    name: 'telegram',

    send: function (chatId, text, meta) {
      var markup = meta && meta.res ? TG.keyboard(meta.res) : undefined;
      var parts = TG.chunks(text);
      return parts.reduce(function (p, part, i) {
        return p.then(function () {
          return TG.call('sendMessage', {
            chat_id: chatId, text: part,
            reply_markup: (i === parts.length - 1 && markup) ? markup : undefined,
            disable_web_page_preview: true
          });
        });
      }, Promise.resolve());
    },

    /* Разбор апдейта — общий с автономным ботом */
    update: function (update) {
      var incoming = TG.parse(update);
      if (incoming.kind === 'skip' || !incoming.chatId) return Promise.resolve(null);
      if (incoming.chatType && incoming.chatType !== 'private' &&
          String(incoming.chatId) !== String(cfg.managerChat)) return Promise.resolve(null);

      var text = incoming.text;
      if (incoming.kind === 'callback') {
        var data = incoming.data || '';
        text = data.indexOf('pick:') === 0 ? 'беру ' + (['первый', 'второй', 'третий'][+data.slice(5)] || 'первый')
             : data === 'dates' ? 'подберите другие даты'
             : data === 'human' ? 'позовите человека'
             : data.indexOf('q:') === 0 ? data.slice(2) : data;
        TG.call('answerCallbackQuery', { callback_query_id: incoming.callbackId }).catch(function () {});
      }
      if (incoming.kind === 'command') {
        if (incoming.command === '/start' || incoming.command === '/reset') {
          core.contexts.delete('telegram:' + incoming.chatId);
        }
        text = { '/start': 'здравствуйте', '/help': 'что вы умеете?', '/reset': 'начнём заново' }[incoming.command] || text;
      }

      var u = incoming.user || {};
      return core.incoming({
        channel: 'telegram', chatId: incoming.chatId, text: text,
        user: { name: [u.first_name, u.last_name].filter(Boolean).join(' ') || null, username: u.username || null }
      });
    },

    /* Опрос — когда вебхук не настроен */
    poll: function () {
      var offset = 0, fails = 0, running = true;
      function loop() {
        if (!running) return;
        TG.call('getUpdates', { offset: offset, timeout: 30, allowed_updates: ['message', 'callback_query'] })
          .then(function (updates) {
            fails = 0;
            var chain = Promise.resolve();
            updates.forEach(function (u) {
              offset = Math.max(offset, u.update_id + 1);
              chain = chain.then(function () { return adapter.update(u).catch(function (e) { log('telegram: ' + e.message); }); });
            });
            return chain;
          })
          .catch(function (e) {
            fails++;
            var wait = e.retryAfter ? e.retryAfter * 1000 : Math.min(30000, 1000 * Math.pow(2, fails));
            log('telegram: сбой опроса (' + e.message + '), повтор через ' + Math.round(wait / 1000) + ' с');
            return new Promise(function (ok) { setTimeout(ok, wait); });
          })
          .then(function () { return new Promise(function (ok) { setTimeout(ok, 300); }); })
          .then(loop);
      }
      loop();
      return function stop() { running = false; };
    }
  };

  core.channel(adapter);

  if (cfg.mode === 'webhook' && cfg.webhookUrl) {
    TG.call('setWebhook', {
      url: cfg.webhookUrl, secret_token: cfg.webhookSecret,
      allowed_updates: ['message', 'callback_query']
    }).then(function () { log('telegram: вебхук зарегистрирован'); })
      .catch(function (e) { log('telegram: вебхук не зарегистрирован — ' + e.message); });
  } else {
    TG.call('deleteWebhook', {}).catch(function () {}).then(function () {
      adapter.poll();
      log('telegram: опрос запущен');
    });
  }

  return adapter;
};
