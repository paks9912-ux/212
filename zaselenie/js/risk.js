/* Оценка риска заявки. Отдельный слой: он не решает, что ответить,
   а собирает флаги с весами и объясняет каждый — чтобы менеджер видел,
   почему агент отказал или позвал человека. */
(function (w) {
  'use strict';

  var U = w.U || (typeof require !== 'undefined' ? require('./util.js') : null);
  var KB = w.KB || (typeof require !== 'undefined' ? require('./knowledge.js') : null);

  var RISK = {};

  /* id, вес, объяснение для менеджера, что делать */
  var RULES = [
    { id: 'illegal', w: 100, when: function (a) { return a.signals.illegal; },
      why: 'запрос на использование квартиры для незаконных услуг', act: 'отказ и стоп-лист' },
    { id: 'fraud', w: 80, when: function (a) { return a.signals.fraud; },
      why: 'схема с чужой картой, «лишним переводом» или кодом из СМС', act: 'ничего не переводить, позвать человека' },
    { id: 'sublease', w: 70, when: function (a) { return a.signals.sublease; },
      why: 'квартиру хотят пересдавать', act: 'отказ' },
    { id: 'fake-registration', w: 70, when: function (a) { return a.signals.fakeReg; },
      why: 'просят прописку без проживания', act: 'отказ' },
    { id: 'minor', w: 70, when: function (a) { return a.signals.minor; },
      why: 'гостю меньше ' + KB.settings.minAge, act: 'отказ, нужен совершеннолетний ответственный' },
    { id: 'party', w: 55, when: function (a) { return a.signals.party; },
      why: 'признаки вечеринки или шумного мероприятия', act: 'отказ либо письменное согласие на тишину и депозит ×2' },
    { id: 'hourly', w: 45, when: function (a) { return a.signals.hourly; },
      why: 'просят на несколько часов', act: 'минимум сутки' },
    { id: 'no-docs', w: 45, when: function (a) { return a.signals.docsNo; },
      why: 'отказ показывать документы', act: 'заселение без паспорта невозможно' },
    { id: 'storage', w: 35, when: function (a) { return a.signals.storage; },
      why: 'квартиру хотят под склад', act: 'отказ' },
    { id: 'crowd', w: 30, when: function (a) {
        return a.guests.total && a.guests.total > KB.capacityMax();
      },
      why: 'гостей больше, чем вмещает самая большая квартира', act: 'предложить несколько квартир' },
    { id: 'aggression', w: 30, when: function (a) { return a.signals.aggression; },
      why: 'конфликтный тон, угрозы жалобой или судом', act: 'не спорить, передать человеку' },
    { id: 'no-prepay', w: 20, when: function (a) { return a.signals.prepayNo; },
      why: 'отказ от предоплаты', act: 'даты держим час без оплаты, дальше снимаем' },
    { id: 'rush', w: 10, when: function (a) {
        return a.dates.from && U.diffDays(U.today(), a.dates.from) === 0 && !a.guests.stated;
      },
      why: 'заезд сегодня и почти нет данных о гостях', act: 'уточнить состав и документы до выезда ключей' },
    { id: 'spam', w: 15, when: function (a) { return a.signals.spam && !a.dates.from; },
      why: 'похоже на рассылку или рекламу', act: 'не отвечать развёрнуто' },
    { id: 'big-money', w: 15, when: function (a) { return a.quoteTotal && a.quoteTotal > 10000000; },
      why: 'сумма брони больше 10 млн', act: 'подтверждает человек' },
    { id: 'long', w: 10, when: function (a) { return a.dates.nights && a.dates.nights > KB.settings.longStayFrom; },
      why: 'долгий срок — нужен договор', act: 'передать в отдел длительной аренды' }
  ];

  RISK.assess = function (a) {
    var flags = [], score = 0;
    RULES.forEach(function (r) {
      var hit = false;
      try { hit = !!r.when(a); } catch (e) { hit = false; }
      if (hit) { flags.push({ id: r.id, weight: r.w, why: r.why, action: r.act }); score += r.w; }
    });
    score = U.clamp(score, 0, 100);
    var level = score >= 70 ? 'критический' : score >= 45 ? 'высокий' : score >= 20 ? 'средний' : 'низкий';
    return {
      score: score,
      level: level,
      flags: flags,
      hard: flags.some(function (f) { return f.weight >= 70; }),
      needsHuman: flags.some(function (f) { return /fraud|aggression|big-money|illegal/.test(f.id); })
    };
  };

  RISK.RULES = RULES;
  if (typeof module !== 'undefined' && module.exports) module.exports = RISK;
  w.RISK = RISK;
})(typeof window !== 'undefined' ? window : globalThis);
