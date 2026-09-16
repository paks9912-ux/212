/* Факты для модели: всё, что посчитал движок, в одном объекте.
   Общий модуль для браузера (js/api.js) и телеграм-бота (bot/claude.js) —
   чтобы модель в обоих режимах видела ровно одни и те же данные. */
(function (w) {
  'use strict';

  var U  = w.U  || (typeof require !== 'undefined' ? require('./util.js') : null);
  var KB = w.KB || (typeof require !== 'undefined' ? require('./knowledge.js') : null);

  var FACTS = {};

  FACTS.SHORT = [
    'Ты менеджер по заселению «Ключи 24», посуточные квартиры в Ташкенте.',
    'Все цены, свободные даты и правила берёшь строго из блока <факты> — ничего не выдумываешь.',
    'Пишешь коротко, по-человечески, без канцелярита, одна мысль — одна строка.',
    'Отвечаешь на все темы сообщения, заканчиваешь понятным следующим шагом,',
    'задаёшь не больше трёх вопросов. Отказ оформляешь как: правило, причина, альтернатива.',
    'Формат ответа: блок <ответ> для гостя и блок <заметка> для менеджера.'
  ].join(' ');

  /* Факты для модели: решение движка, слоты, варианты с ценами, риск */
  FACTS.build = function (res) {
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

  if (typeof module !== 'undefined' && module.exports) module.exports = FACTS;
  w.FACTS = FACTS;
})(typeof window !== 'undefined' ? window : globalThis);
