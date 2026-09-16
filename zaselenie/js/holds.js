/* Реестр удержаний: общий на всех гостей.
   Пока один гость думает час, его даты не должны продаваться второму —
   календарь занятости о таких «мягких» бронях ничего не знает. */
(function (w) {
  'use strict';

  var U = w.U || (typeof require !== 'undefined' ? require('./util.js') : null);

  var HOLDS = {};
  var list = [];
  var seq = 1;

  HOLDS.now = function () { return Date.now(); };          // подменяется в тестах

  HOLDS.clean = function () {
    var now = HOLDS.now();
    list = list.filter(function (h) { return h.until > now; });
    return list;
  };

  /* Ставим удержание. Одно удержание на гостя и объект — повторный вызов продлевает */
  HOLDS.add = function (objectId, from, to, holder, minutes) {
    HOLDS.clean();
    var same = list.filter(function (h) {
      return h.objectId === objectId && h.holder === holder && h.from === from && h.to === to;
    })[0];
    if (same) {
      same.until = HOLDS.now() + (minutes || 60) * 60000;
      return same;
    }
    var hold = {
      id: 'h' + (seq++),
      objectId: objectId, from: from, to: to,
      holder: holder || 'аноним',
      created: HOLDS.now(),
      until: HOLDS.now() + (minutes || 60) * 60000,
      paid: false
    };
    list.push(hold);
    return hold;
  };

  /* Чужие удержания на этот объект — для подбора они как занятость */
  HOLDS.busyFor = function (objectId, holder) {
    return HOLDS.clean().filter(function (h) {
      return h.objectId === objectId && h.holder !== holder;
    }).map(function (h) {
      return { from: h.from, to: h.to, guest: 'удержание до ' + new Date(h.until).toISOString().slice(11, 16) };
    });
  };

  /* Оплату подтвердили — держим сутки, пока менеджер сверяет и заводит бронь */
  HOLDS.markPaid = function (holder, hours) {
    var found = null;
    HOLDS.clean().forEach(function (h) {
      if (h.holder === holder) {
        h.paid = true;
        h.until = HOLDS.now() + (hours || 24) * 3600000;
        found = h;
      }
    });
    return found;
  };

  HOLDS.release = function (holder) {
    var before = HOLDS.clean().length;
    list = list.filter(function (h) { return h.holder !== holder; });
    return before - list.length;
  };

  HOLDS.of = function (holder) {
    return HOLDS.clean().filter(function (h) { return h.holder === holder; });
  };

  HOLDS.all = function () { return HOLDS.clean().slice(); };
  HOLDS.count = function () { return HOLDS.clean().length; };
  HOLDS.reset = function () { list = []; seq = 1; };

  /* Для бота: пережить перезапуск вместе с сессиями */
  HOLDS.export = function () { return HOLDS.clean().map(function (h) { return h; }); };
  HOLDS.import = function (arr) {
    if (!arr || !arr.length) return 0;
    list = arr.filter(function (h) { return h && h.until > HOLDS.now(); });
    list.forEach(function (h) { seq = Math.max(seq, (+String(h.id).slice(1) || 0) + 1); });
    return list.length;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = HOLDS;
  w.HOLDS = HOLDS;
})(typeof window !== 'undefined' ? window : globalThis);
