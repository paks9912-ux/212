/* Канал: чат на сайте. Ответ отдаётся синхронно в HTTP-ответе,
   поэтому send() только запоминает последнюю реплику для истории. */
'use strict';

exports.install = function (core, opts) {
  var log = (opts && opts.log) || function () {};
  var adapter = {
    name: 'web',
    last: new Map(),
    send: function (chatId, text) {
      adapter.last.set(String(chatId), { text: text, at: Date.now() });
      return true;
    },
    /* Панель отвечает гостю на сайте — забирает виджет при следующем опросе */
    pending: function (chatId) {
      return adapter.last.get(String(chatId)) || null;
    }
  };
  core.channel(adapter);
  log('канал web подключён');
  return adapter;
};
