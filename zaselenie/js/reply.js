/* Сборка текста ответа: карточки вариантов, расчёты, вопросы.
   Тон: коротко, по делу, без канцелярита, одна мысль — одна строка. */
(function (w) {
  'use strict';

  var U = w.U || (typeof require !== 'undefined' ? require('./util.js') : null);
  var KB = w.KB || (typeof require !== 'undefined' ? require('./knowledge.js') : null);
  var PO = w.PO || (typeof require !== 'undefined' ? require('./policy.js') : null);

  var R = {};

  R.lines = function (arr) {
    return arr.filter(function (x) { return x !== null && x !== undefined && x !== ''; }).join('\n');
  };

  R.objLine = function (o) {
    var bits = [o.district];
    if (o.metro) bits.push(o.metro);
    bits.push(U.guests(o.capacity) + (o.extraBeds ? ' + ' + o.extraBeds + ' ' + U.plural(o.extraBeds, 'доп. место', 'доп. места', 'доп. мест') : ''));
    if (!o.elevator) bits.push(o.floor + '-й этаж без лифта');
    return bits.join(' · ');
  };

  R.offer = function (item, i) {
    var o = item.object, q = item.quote;
    var head = (i ? i + ') ' : '') + o.title;
    var price = U.money(q.perNightStay) + '/ночь · за ' + U.nights(q.nights) + ' — ' + U.money(q.total) +
                (q.total !== q.perNightStay * q.nights ? ' с доплатами' : '');
    var note = item.notes && item.notes.length ? '   ' + item.notes.join(', ') : null;
    return R.lines(['' + head, '   ' + R.objLine(o), '   ' + price, note]);
  };

  R.offers = function (list, max) {
    return list.slice(0, max || 2).map(function (it, i) { return R.offer(it, i + 1); }).join('\n\n');
  };

  R.breakdown = function (q) {
    var rows = q.lines.map(function (l) {
      return '· ' + l.title + ' — ' + (l.sum < 0 ? '−' + U.money(-l.sum) : U.money(l.sum));
    });
    rows.push('Итого: ' + U.money(q.total));
    rows.push('Предоплата ' + Math.round(q.prepayPart * 100) + '% — ' + U.money(q.prepay) +
              (q.rest > 0 ? ', остаток ' + U.money(q.rest) + ' при заезде' : ''));
    rows.push('Депозит ' + U.money(q.deposit) + ' — возвращаем при выезде');
    return rows.join('\n');
  };

  R.terms = function (q) {
    var S = KB.settings;
    return R.lines([
      'В цене: уборка, постель, полотенца, Wi-Fi.',
      'Заезд с ' + S.checkIn + ', выезд до ' + S.checkOut + '.',
      q ? 'Предоплата ' + Math.round(q.prepayPart * 100) + '% — ' + U.money(q.prepay) +
          ', депозит ' + U.money(q.deposit) + ' возвращается при выезде.' : null
    ]);
  };

  /* Условия, когда вариантов несколько и депозит у них разный */
  R.termsMulti = function (offers) {
    var S = KB.settings;
    var deps = offers.map(function (o) { return o.quote.deposit; });
    var min = Math.min.apply(null, deps), max = Math.max.apply(null, deps);
    var peak = offers.some(function (o) { return o.quote.peak; });
    return R.lines([
      'В цене: уборка, постель, полотенца, Wi-Fi.',
      'Заезд с ' + S.checkIn + ', выезд до ' + S.checkOut + '.',
      'Предоплата ' + Math.round((peak ? S.peakPrepay : S.prepay) * 100) + '%, депозит ' +
        (min === max ? U.money(min) : U.money(min, '') + '–' + U.money(max)) + ' — возвращаем при выезде.'
    ]);
  };

  R.hold = function () {
    return 'Даты держу ' + KB.settings.holdMinutes + ' минут без предоплаты.';
  };

  R.ask = function (questions, max) {
    var qs = questions.slice(0, max || 3);
    if (!qs.length) return '';
    if (qs.length === 1) return qs[0];
    return qs.map(function (q) { return '— ' + q; }).join('\n');
  };

  R.human = function (reason) {
    var m = KB.settings.manager;
    return 'Подключаю ' + m.name + ' — ' + (reason || 'здесь нужно решение человека') +
           '. Он на связи ' + m.hours + ', телефон ' + m.phone + '.';
  };

  R.dates = function (a) {
    if (a.dates.from && a.dates.to) return U.fmtFull(a.dates.from) + ' — ' + U.fmtFull(a.dates.to) + ' (' + U.nights(a.dates.nights) + ')';
    if (a.dates.from) return 'с ' + U.fmtFull(a.dates.from);
    return 'даты не названы';
  };

  R.alternatives = function (match) {
    if (!match.alternatives || !match.alternatives.length) return null;
    return match.alternatives.map(function (alt) {
      return '· ' + alt.object.title + ' — свободна ' + U.range(alt.from, alt.to);
    }).join('\n');
  };

  R.priceFrom = function () {
    var p = PO.priceRange();
    return 'Цены от ' + U.money(p.min) + ' за ночь (эконом у вокзала) до ' + U.money(p.max) + ' (премиум в Мирабаде).';
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
  w.R = R;
})(typeof window !== 'undefined' ? window : globalThis);
