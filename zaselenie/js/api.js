/* Режим «движок + модель»: факты считает движок, формулирует ответ Claude.
   Ключ хранится только в браузере. Для продакшена вызов выносится на сервер —
   ключ в браузере виден всем, у кого есть доступ к странице. */
(function (w) {
  'use strict';

  var U  = w.U, KB = w.KB;
  var API = {};
  var KEY = 'zaselenie.api';

  API.MODELS = [
    { id: 'claude-sonnet-5', title: 'Sonnet 5 — быстрый' },
    { id: 'claude-opus-5', title: 'Opus 5 — самый сильный' },
    { id: 'claude-haiku-4-5-20251001', title: 'Haiku 4.5 — дешёвый' }
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
      .catch(function () { return API.SHORT; })
      .then(function (t) { systemCache = t; return t; });
  };

  API.SHORT = [
    'Ты менеджер по заселению «Ключи 24», посуточные квартиры в Ташкенте.',
    'Все цены, свободные даты и правила берёшь строго из блока <факты> — ничего не выдумываешь.',
    'Пишешь коротко, по-человечески, без канцелярита, одна мысль — одна строка.',
    'Отвечаешь на все темы сообщения, заканчиваешь понятным следующим шагом,',
    'задаёшь не больше трёх вопросов. Отказ оформляешь как: правило, причина, альтернатива.',
    'Формат ответа: блок <ответ> для гостя и блок <заметка> для менеджера.'
  ].join(' ');

  /* Факты для модели: решение движка, слоты, варианты с ценами, риск */
  API.facts = function (res) {
    var a = res.analysis;
    return {
      сегодня: U.today(),
      компания: { бренд: KB.settings.brand, город: KB.settings.city,
                  заезд: KB.settings.checkIn, выезд: KB.settings.checkOut,
                  предоплата: KB.settings.prepay, удержание_минут: KB.settings.holdMinutes,
                  менеджер: KB.settings.manager },
      сценарий: { id: res.scenario, название: res.scenarioTitle, решение: res.action, причина: res.reason },
      слоты: a.crm ? a.crm.stay : null,
      заявка: res.crm,
      варианты: a.match ? a.match.offers.slice(0, 3).map(function (o) {
        return {
          квартира: o.object.title, район: o.object.district, метро: o.object.metro,
          вмещает: o.object.capacity + ' + ' + o.object.extraBeds,
          за_ночь: o.quote.perNight, итого: o.quote.total,
          предоплата: o.quote.prepay, депозит: o.quote.deposit,
          можно_с_животными: o.object.pets, лифт: o.object.elevator, парковка: o.object.parking,
          удобства: o.object.features
        };
      }) : [],
      занято: a.match ? a.match.rejected.map(function (r) {
        return { квартира: r.object.title, причины: r.reasons };
      }) : [],
      альтернативные_даты: a.match ? (a.match.alternatives || []).map(function (x) {
        return { квартира: x.object.title, с: x.from, по: x.to };
      }) : [],
      риск: { балл: a.risk.score, уровень: a.risk.level,
              флаги: a.risk.flags.map(function (f) { return f.id + ': ' + f.why; }) },
      не_хватает: a.missing,
      допущения: a.dates.assumed.concat(a.guests.assumed || []).concat(a.budget.assumed || []),
      противоречия: a.dates.issues,
      подсказка_движка: res.reply
    };
  };

  API.ask = function (text, res, history) {
    var cfg = API.load();
    if (!cfg.key) return Promise.reject(new Error('Не указан ключ API'));

    var msgs = (history || []).slice(-8).map(function (h) {
      return { role: h.role, content: h.text };
    });
    msgs.push({
      role: 'user',
      content: '<факты>\n' + JSON.stringify(API.facts(res), null, 1) + '\n</факты>\n' +
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
          model: cfg.model || 'claude-sonnet-5',
          max_tokens: 1200,
          system: sys,
          messages: msgs
        })
      });
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error((data.error && data.error.message) || ('Ошибка ' + r.status));
        return data;
      });
    }).then(function (data) {
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
