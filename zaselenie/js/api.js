/* Режим «движок + модель»: факты считает движок, формулирует ответ Claude.
   Ключ хранится только в браузере. Для продакшена вызов выносится на сервер —
   ключ в браузере виден всем, у кого есть доступ к странице. */
(function (w) {
  'use strict';

  var FACTS = w.FACTS;
  var API = {};
  var KEY = 'zaselenie.api';

  API.MODELS = [
    { id: 'claude-opus-5', title: 'Opus 5 — по умолчанию' },
    { id: 'claude-sonnet-5', title: 'Sonnet 5 — дешевле' },
    { id: 'claude-haiku-4-5', title: 'Haiku 4.5 — самый дешёвый' }
  ];

  API.load = function () {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  };
  API.save = function (cfg) {
    try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {}
  };
  API.ready = function () { return !!API.load().key; };

  var systemCache = null;

  /* Полный промпт лежит в prompts/system.md — тянем его, если страница открыта
     с сервера; при открытии файлом с диска используем короткую версию. */
  API.system = function () {
    if (systemCache) return Promise.resolve(systemCache);
    return fetch('prompts/system.md')
      .then(function (r) { return r.ok ? r.text() : Promise.reject(); })
      .catch(function () { return FACTS.SHORT; })
      .then(function (t) { systemCache = t; return t; });
  };

  API.ask = function (text, res, history) {
    var cfg = API.load();
    if (!cfg.key) return Promise.reject(new Error('Не указан ключ API'));

    var msgs = (history || []).slice(-8).map(function (h) {
      return { role: h.role, content: h.text };
    });
    msgs.push({
      role: 'user',
      content: '<факты>\n' + JSON.stringify(FACTS.build(res), null, 1) + '\n</факты>\n' +
               '<сообщение>\n' + text + '\n</сообщение>'
    });

    return API.system().then(function (sys) {
      return fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: cfg.model || 'claude-opus-5',
          max_tokens: 1200,                       // ответ в мессенджере короткий
          /* Факты уже посчитаны движком, модели остаётся сформулировать —
             низкое усилие держит ответ быстрым и дешёвым */
          output_config: { effort: 'low' },
          system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }],
          messages: msgs
        })
      });
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error((data.error && data.error.message) || ('Ошибка ' + r.status));
        return data;
      });
    }).then(function (data) {
      /* Модель может отказаться отвечать — тогда работает текст движка */
      if (data.stop_reason === 'refusal') throw new Error('модель отказалась отвечать');
      var text = (data.content || []).map(function (c) { return c.text || ''; }).join('\n');
      var answer = /<ответ>([\s\S]*?)<\/ответ>/.exec(text);
      var note = /<заметка>([\s\S]*?)<\/заметка>/.exec(text);
      return {
        reply: (answer ? answer[1] : text).trim(),
        note: note ? note[1].trim() : null,
        usage: data.usage || null
      };
    });
  };

  w.API = API;
})(window);
