/* Правила и арифметика: цена, занятость, подбор, возвраты.
   Всё, что агент говорит про деньги и свободные даты, считается здесь. */
(function (w) {
  'use strict';

  var U = w.U || (typeof require !== 'undefined' ? require('./util.js') : null);
  var KB = w.KB || (typeof require !== 'undefined' ? require('./knowledge.js') : null);

  var PO = {};

  /* ---------- сезон ---------- */

  PO.season = function (iso) {
    var md = iso.slice(5);
    for (var i = 0; i < KB.seasons.length; i++) {
      var s = KB.seasons[i];
      var inside = s.from <= s.to ? (md >= s.from && md <= s.to) : (md >= s.from || md <= s.to);
      if (inside) return s;
    }
    return null;
  };

  PO.nightPrice = function (obj, iso) {
    var p = obj.base;
    if (U.isWeekend(iso)) p *= obj.weekendK;
    var s = PO.season(iso);
    if (s) p *= s.k;
    return Math.round(p / 1000) * 1000;
  };

  PO.seasonsOf = function (from, to) {
    var out = {}, list = U.nightsList(from, to);
    list.forEach(function (n) { var s = PO.season(n); if (s) out[s.id] = s; });
    return Object.keys(out).map(function (k) { return out[k]; });
  };

  PO.minNights = function (obj, from, to) {
    var min = obj.minNights;
    PO.seasonsOf(from || U.today(), to || U.addDays(from || U.today(), 1)).forEach(function (s) {
      if (s.minNights > min) min = s.minNights;
    });
    return min;
  };

  PO.isPeak = function (from, to) {
    return PO.seasonsOf(from, to).some(function (s) { return s.peak; });
  };

  /* ---------- занятость ---------- */

  PO.isFree = function (obj, from, to) {
    var conflicts = (obj.busy || []).filter(function (b) { return U.overlap(from, to, b.from, b.to); });
    return { free: conflicts.length === 0, conflicts: conflicts };
  };

  /* Ближайшие свободные окна той же длины: сдвиг вперёд и назад до 14 дней */
  PO.nearestWindows = function (obj, from, nights, limit) {
    var out = [];
    for (var shift = 1; shift <= 14 && out.length < (limit || 2); shift++) {
      [shift, -shift].forEach(function (d) {
        if (out.length >= (limit || 2)) return;
        var f = U.addDays(from, d);
        if (U.diffDays(U.today(), f) < 0) return;
        var t = U.addDays(f, nights);
        if (PO.isFree(obj, f, t).free) out.push({ from: f, to: t, shift: d });
      });
    }
    return out;
  };

  /* Свободные объекты на даты, независимо от прочих требований */
  PO.freeOn = function (from, to) {
    return KB.objects.filter(function (o) { return PO.isFree(o, from, to).free; });
  };

  /* ---------- расчёт ---------- */

  PO.quote = function (obj, req) {
    var S = KB.settings;
    var from = req.from, to = req.to;
    var nights = U.diffDays(from, to);
    var lines = [], stay = 0, peakSum = 0, peakNights = 0, nightMin = Infinity, nightMax = 0;

    U.nightsList(from, to).forEach(function (n) {
      var price = PO.nightPrice(obj, n), s = PO.season(n);
      stay += price;
      if (s && s.peak) { peakSum += price; peakNights++; }
      if (price < nightMin) nightMin = price;
      if (price > nightMax) nightMax = price;
    });
    lines.push({ title: 'Проживание, ' + U.nights(nights), sum: stay });

    var guests = req.guests || 1;
    var extra = Math.max(0, guests - obj.capacity);
    if (extra > 0) {
      var extraSum = extra * S.extraGuestFee * nights;
      lines.push({ title: 'Доп. место × ' + extra, sum: extraSum });
      stay += 0; // доп. места не участвуют в скидке за длительность
      lines.extra = extraSum;
    }

    var discount = 0, discountTitle = null;
    if (nights >= S.longStayFrom) { discount = S.longStayDiscount; discountTitle = 'Скидка за длительное проживание'; }
    else if (nights >= S.weekDiscountFrom) { discount = S.weekDiscount; discountTitle = 'Скидка за ' + U.nights(nights); }
    if (req.repeatGuest) { discount += S.repeatGuestDiscount; discountTitle = (discountTitle ? discountTitle + ' + постоянный гость' : 'Скидка постоянному гостю'); }
    discount = Math.min(discount, 0.3);

    /* Скидка за длительность не должна съедать праздничный тариф */
    var discountBase = S.discountInPeak ? stay : stay - peakSum;
    var discountSum = Math.round(discountBase * discount);
    if (discountSum) lines.push({ title: discountTitle, sum: -discountSum });

    var total = stay - discountSum + (lines.extra || 0);

    if (obj.cleaning) { lines.push({ title: 'Уборка', sum: obj.cleaning }); total += obj.cleaning; }
    if (req.pets) {
      var petSum = S.petFee * nights;
      lines.push({ title: 'Питомец', sum: petSum }); total += petSum;
    }
    if (req.earlyCheckIn) {
      var e = Math.round(PO.nightPrice(obj, from) * S.earlyCheckInPart);
      lines.push({ title: 'Ранний заезд', sum: e }); total += e;
    }
    if (req.lateCheckOut) {
      var l = Math.round(PO.nightPrice(obj, U.addDays(to, -1)) * S.lateCheckOutPart);
      lines.push({ title: 'Поздний выезд', sum: l }); total += l;
    }
    if (req.lateArrival) { lines.push({ title: 'Ночное заселение', sum: S.lateCheckInFee }); total += S.lateCheckInFee; }

    /* Праздничные ночи вносятся полностью, остальное — обычной долей.
       Одна ночь Навруза не должна делать стопроцентной всю двухнедельную бронь. */
    var peak = peakNights > 0;
    var prepay = Math.min(total, Math.round(peakSum * S.peakPrepay + Math.max(0, total - peakSum) * S.prepay));
    var prepayPart = total ? prepay / total : S.prepay;
    var deposit = obj.deposit + (req.pets ? S.petDeposit : 0);

    return {
      objectId: obj.id,
      from: from, to: to, nights: nights, guests: guests,
      lines: lines,
      total: total,
      perNight: Math.round(total / nights),
      perNightStay: Math.round((stay - discountSum) / nights),   // только проживание, без разовых доплат
      discountPart: discount,
      peak: peak,
      seasons: PO.seasonsOf(from, to).map(function (s) { return s.name; }),
      prepayPart: prepayPart,
      prepay: prepay,
      rest: total - prepay,
      peakNights: peakNights,
      peakSum: peakSum,
      nightMin: nightMin === Infinity ? 0 : nightMin,
      nightMax: nightMax,
      deposit: deposit
    };
  };

  /* ---------- подбор ---------- */

  PO.match = function (req) {
    var out = { offers: [], rejected: [], alternatives: [], status: 'ok' };
    var from = req.from, to = req.to;
    if (!from || !to) { out.status = 'no-dates'; return out; }

    KB.objects.forEach(function (o) {
      var why = [], score = 100, notes = [];
      var guests = req.guests || 1;

      if (guests > o.capacity + o.extraBeds) why.push('вмещает до ' + U.guests(o.capacity + o.extraBeds));
      if (req.pets && !o.pets) why.push('нельзя с животными');
      if (req.needElevator && !o.elevator) why.push('нет лифта, ' + o.floor + '-й этаж');
      if (req.rooms !== null && req.rooms !== undefined && o.rooms < req.rooms) why.push(o.rooms ? o.rooms + '-комнатная' : 'студия');

      var free = PO.isFree(o, from, to);
      if (!free.free) why.push('занята ' + free.conflicts.map(function (c) { return U.range(c.from, c.to); }).join(', '));

      var min = PO.minNights(o, from, to), nights = U.diffDays(from, to);
      if (nights < min) why.push('минимум ' + U.nights(min) + ' на эти даты');

      if (why.length) {
        out.rejected.push({ object: o, reasons: why, freeWindows: free.free ? [] : PO.nearestWindows(o, from, nights, 2) });
        return;
      }

      var q = PO.quote(o, req);

      if (guests > o.capacity) { score -= 10; var ex = guests - o.capacity;
        notes.push('нужно ' + ex + ' ' + U.plural(ex, 'доп. место', 'доп. места', 'доп. мест') + ' — раскладной диван'); }
      if (req.district && o.district.indexOf(req.district) < 0 && (o.metro || '').indexOf(req.district) < 0) score -= 12;
      if (req.rooms !== null && req.rooms !== undefined && o.rooms > req.rooms + 1) score -= 8;
      if (req.needParking && /нет/.test(o.parking || '')) score -= 5;
      if (req.needWorkspace && o.features.indexOf('рабочее место') < 0) score -= 3;
      (req.features || []).forEach(function (f) {
        var found = o.features.some(function (x) { return x.indexOf(f.split(' ')[0]) >= 0; });
        if (!found) score -= 4; else score += 2;
      });
      if (req.budget && req.budgetPer === 'night') {
        if (q.perNight <= req.budget) score += 15;
        else { score -= Math.min(40, Math.round((q.perNight - req.budget) / req.budget * 60)); notes.push('дороже бюджета на ' + U.money(q.perNight - req.budget) + ' за ночь'); }
      }
      if (req.budget && req.budgetPer === 'total') {
        if (q.total <= req.budget) score += 15;
        else { score -= Math.min(40, Math.round((q.total - req.budget) / req.budget * 60)); notes.push('дороже бюджета на ' + U.money(q.total - req.budget)); }
      }
      if (req.needCrib && o.features.some(function (f) { return /кроват/.test(f); })) score += 6;
      if (req.selfCheckIn && o.selfCheckIn) score += 5;
      if (req.quiet && /тих/.test(o.note || '')) score += 5;

      out.offers.push({ object: o, quote: q, score: score, notes: notes });
    });

    out.offers.sort(function (a, b) { return b.score - a.score || a.quote.total - b.quote.total; });

    if (!out.offers.length) {
      out.status = 'none';
      var nights2 = U.diffDays(from, to);
      out.rejected.forEach(function (r) {
        r.freeWindows.forEach(function (win) {
          out.alternatives.push({ object: r.object, from: win.from, to: win.to, shift: win.shift });
        });
      });
      out.alternatives.sort(function (a, b) { return Math.abs(a.shift) - Math.abs(b.shift); });
      out.alternatives = out.alternatives.slice(0, 3);
      out.altNights = nights2;
    }
    return out;
  };

  /* Несколько квартир на большую компанию */
  PO.combo = function (req) {
    var free = PO.freeOn(req.from, req.to).filter(function (o) {
      return U.diffDays(req.from, req.to) >= PO.minNights(o, req.from, req.to) && (!req.pets || o.pets);
    });
    free.sort(function (a, b) { return (b.capacity + b.extraBeds) - (a.capacity + a.extraBeds); });
    var need = req.guests || 1, picked = [], cap = 0;
    for (var i = 0; i < free.length && cap < need; i++) {
      picked.push(free[i]); cap += free[i].capacity + free[i].extraBeds;
    }
    if (cap < need) return null;

    var left = need, total = 0;
    var quotes = picked.map(function (o) {
      var take = Math.min(o.capacity + o.extraBeds, left);
      left -= take;
      var q = PO.quote(o, { from: req.from, to: req.to, guests: take, pets: req.pets });
      total += q.total;
      return { object: o, guests: take, quote: q };
    });
    return { parts: quotes, total: total, capacity: cap, guests: need };
  };

  /* ---------- возвраты ---------- */

  PO.refund = function (checkIn, paid) {
    var days = U.diffDays(U.today(), checkIn);
    var rules = KB.settings.cancel;
    for (var i = 0; i < rules.length; i++) {
      if (days >= rules[i].beforeDays) {
        return { days: days, part: rules[i].refund, sum: Math.round((paid || 0) * rules[i].refund), note: rules[i].note };
      }
    }
    var last = rules[rules.length - 1];
    return { days: days, part: last.refund, sum: 0, note: last.note };
  };

  /* Цена «от» для ответов без дат */
  PO.priceRange = function () {
    var min = Infinity, max = 0;
    KB.objects.forEach(function (o) {
      if (o.base < min) min = o.base;
      if (o.base * o.weekendK > max) max = o.base * o.weekendK;
    });
    return { min: min, max: Math.round(max / 1000) * 1000 };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = PO;
  w.PO = PO;
})(typeof window !== 'undefined' ? window : globalThis);
