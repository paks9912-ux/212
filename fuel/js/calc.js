/* Расчёты: расход между заправками, отклонение от нормы, остаток в бочке,
   наработка до ТО и поиск странных записей.

   Расход считается «от полной до полной»: между двумя заправками до полного
   бака сожжено ровно столько, сколько залито после первой из них.          */
(function (w) {
  'use strict';

  var CALC = {};
  var cache = {};

  CALC.clearCache = function () { cache = {}; };
  function memo(key, fn) {
    if (!Object.prototype.hasOwnProperty.call(cache, key)) cache[key] = fn();
    return cache[key];
  }

  /* ============ сегменты расхода ============ */
  CALC.segments = function (u) {
    if (!u) return [];
    return memo('seg.' + u.id, function () {
      var fills = DB.fillsOf(u.id), base = U.rateBase(u.meter);
      var segs = [], anchor = null, pending = 0;

      fills.forEach(function (f) {
        var m = U.num(f.meter);
        if (!anchor) {
          if (f.full !== false && m > 0) anchor = f;
          return;
        }
        pending += U.num(f.liters);
        if (f.full === false || !(m > 0)) return;      // частичная заправка — копим дальше

        var run = m - U.num(anchor.meter);
        segs.push({
          from: anchor, to: f, run: run, liters: pending,
          days: U.diffDays(anchor.date, f.date),
          rate: run > 0 ? pending / run * base : null,
          extra: run > 0 && u.norm > 0 ? pending - u.norm * run / base : null
        });
        anchor = f;
        pending = 0;
      });
      return segs;
    });
  };

  /* сегмент, который закрывает эта заправка */
  CALC.segmentOf = function (u, fillId) {
    var segs = CALC.segments(u);
    for (var i = 0; i < segs.length; i++) if (segs[i].to.id === fillId) return segs[i];
    return null;
  };

  /* ============ сводка по единице техники ============ */
  CALC.unit = function (u) {
    if (!u) return null;
    return memo('unit.' + u.id, function () {
      var fills = DB.fillsOf(u.id);
      var segs = CALC.segments(u);
      var good = segs.filter(function (s) { return s.rate != null; });
      var base = U.rateBase(u.meter);
      var r = {
        unit: u, fills: fills, segments: segs,
        count: fills.length,
        first: fills[0] || null,
        last: fills.length ? fills[fills.length - 1] : null,
        totalLiters: 0, totalCost: 0,
        monthLiters: 0, monthCost: 0,
        avg: null, lastRate: null, dev: null,
        extraLiters: 0, extraCost: 0,
        run: 0, perDay: 0,
        meterNow: 0, idleDays: null,
        service: null, alerts: []
      };
      var mk = U.monthKey(U.today());
      fills.forEach(function (f) {
        r.totalLiters += U.num(f.liters);
        r.totalCost += U.num(f.cost);
        if (U.monthKey(f.date) === mk) { r.monthLiters += U.num(f.liters); r.monthCost += U.num(f.cost); }
        r.meterNow = Math.max(r.meterNow, U.num(f.meter));
      });
      if (r.last) r.idleDays = U.diffDays(r.last.date, U.today());

      /* средний расход — по последним пяти сегментам, взвешенно по наработке */
      if (good.length) {
        var recent = good.slice(-5), lit = 0, run = 0;
        recent.forEach(function (s) { lit += s.liters; run += s.run; });
        r.avg = run > 0 ? lit / run * base : null;
        r.lastRate = good[good.length - 1].rate;
        if (u.norm > 0 && r.avg != null) r.dev = (r.avg - u.norm) / u.norm * 100;
      }
      /* перерасход в литрах и деньгах — по всем измеренным сегментам */
      good.forEach(function (s) {
        r.run += s.run;
        if (s.extra != null) r.extraLiters += s.extra;
      });
      var price = DB.price(u.fuel) || (r.last ? U.num(r.last.price) : 0);
      r.extraCost = r.extraLiters * price;

      /* наработка в день — по всему периоду наблюдений */
      if (r.first && r.last) {
        var days = U.diffDays(r.first.date, r.last.date);
        var runAll = U.num(r.last.meter) - U.num(r.first.meter);
        if (days > 0 && runAll > 0) r.perDay = runAll / days;
      }

      /* ТО по наработке */
      if (u.service && U.num(u.service.every) > 0) {
        var every = U.num(u.service.every);
        var since = r.meterNow - U.num(u.service.lastMeter);
        var left = every - since;
        r.service = {
          every: every, since: since, left: left,
          days: r.perDay > 0 ? left / r.perDay : null,
          due: left <= 0,
          soon: left > 0 && left <= every * 0.15
        };
      }

      /* сигналы */
      var lim = U.num(DB.data.settings.overrun) || 10;
      if (r.dev != null && r.dev > lim) {
        r.alerts.push({ type: 'overrun', unit: u,
          text: 'Расход выше нормы на ' + U.pct(r.dev) + ' — ' + U.rate(r.avg, u.meter),
          money: r.extraCost > 0 ? r.extraCost : 0 });
      }
      if (r.service && r.service.due) {
        r.alerts.push({ type: 'service', unit: u,
          text: 'ТО просрочено на ' + U.meter(-r.service.left, u.meter) });
      } else if (r.service && r.service.soon) {
        r.alerts.push({ type: 'service-soon', unit: u,
          text: 'До ТО ' + U.meter(r.service.left, u.meter) +
            (r.service.days != null ? ' — примерно ' + U.days(r.service.days) : '') });
      }
      CALC.fillAlerts(u, r).forEach(function (a) { r.alerts.push(a); });
      return r;
    });
  };

  /* ============ странные записи ============ */
  /* Проверки нарочно простые: они подсказывают, а не запрещают вводить. */
  CALC.fillFlags = function (u, f) {
    var out = [];
    var fills = DB.fillsOf(u.id);
    var i = fills.indexOf(f);
    if (i < 0) return out;
    var prev = i > 0 ? fills[i - 1] : null;
    var tank = U.num(u.tank);

    if (tank > 0 && U.num(f.liters) > tank * 1.03) {
      out.push({ type: 'over-tank', text: 'Залито ' + U.liters(f.liters) + ' при баке ' + U.liters(tank) });
    }
    if (prev && U.num(f.meter) > 0 && U.num(prev.meter) > 0) {
      var run = U.num(f.meter) - U.num(prev.meter);
      if (run < 0) {
        out.push({ type: 'meter-back', text: 'Счётчик меньше предыдущего на ' + U.meter(-run, u.meter) });
      } else if (run === 0 && U.diffDays(prev.date, f.date) > 0) {
        out.push({ type: 'no-run', text: 'Заправка без наработки — счётчик не изменился' });
      }
    }
    var seg = CALC.segmentOf(u, f.id);
    var lim = U.num(DB.data.settings.overrun) || 10;
    if (seg && seg.rate != null && u.norm > 0 && seg.rate > u.norm * (1 + lim / 100)) {
      out.push({ type: 'rate-high', soft: true,
        text: 'Расход на этом участке ' + U.rate(seg.rate, u.meter) + ' при норме ' + U.rate(u.norm, u.meter) });
    }
    return out;
  };

  /* сигналы уровня единицы, собранные из последних заправок */
  CALC.fillAlerts = function (u, r) {
    var out = [], fills = r.fills.slice(-6);
    fills.forEach(function (f) {
      CALC.fillFlags(u, f).forEach(function (fl) {
        if (fl.soft) return;                       // мягкие показываем только в карточке
        out.push({ type: fl.type, unit: u, fill: f, text: fl.text + ' · ' + U.fmtDate(f.date) });
      });
    });
    return out;
  };

  /* ============ бочка ============ */
  /* Замер остатка — точка отсчёта: всё, что было до него, уже сведено. */
  CALC.tank = function (fuel) {
    return memo('tank.' + fuel, function () {
      var sup = DB.data.supplies.filter(function (s) { return s.fuel === fuel; }).sort(DB.byDate);
      var out = DB.data.fills.filter(function (f) { return f.source === 'tank' && f.fuel === fuel; }).sort(DB.byDate);
      var checks = DB.data.checks.filter(function (c) { return c.fuel === fuel; }).sort(DB.byDate);
      var last = checks.length ? checks[checks.length - 1] : null;

      function sum(list, after) {
        var s = 0;
        list.forEach(function (x) {
          if (after && U.diffDays(after, x.date) <= 0) return;   // строго после замера
          s += U.num(x.liters);
        });
        return s;
      }
      var since = last ? last.date : null;
      var got = sum(sup, since), used = sum(out, since);
      var balance = (last ? U.num(last.liters) : 0) + got - used;

      /* расход из бочки за последние 30 дней */
      var from = U.addDays(U.today(), -30), used30 = 0, days30 = 0;
      out.forEach(function (f) { if (U.diffDays(from, f.date) >= 0) used30 += U.num(f.liters); });
      if (out.length) {
        var firstDate = out[0].date;
        days30 = Math.min(30, Math.max(1, U.diffDays(firstDate, U.today())));
      }
      var perDay = days30 > 0 ? used30 / days30 : 0;

      /* сходимость последнего замера */
      var diff = null;
      if (last) {
        var prev = checks.length > 1 ? checks[checks.length - 2] : null;
        var expected = (prev ? U.num(prev.liters) : 0);
        sup.forEach(function (s) {
          if (prev && U.diffDays(prev.date, s.date) <= 0) return;
          if (U.diffDays(s.date, last.date) < 0) return;
          expected += U.num(s.liters);
        });
        out.forEach(function (f) {
          if (prev && U.diffDays(prev.date, f.date) <= 0) return;
          if (U.diffDays(f.date, last.date) < 0) return;
          expected -= U.num(f.liters);
        });
        diff = { date: last.date, fact: U.num(last.liters), expected: expected, delta: U.num(last.liters) - expected };
      }

      return {
        fuel: fuel, balance: balance, perDay: perDay,
        daysLeft: perDay > 0 ? balance / perDay : null,
        supplies: sup, fills: out, check: last, diff: diff,
        gotTotal: sum(sup), usedTotal: sum(out)
      };
    });
  };

  /* какие виды топлива вообще заводились в бочку */
  CALC.tankFuels = function () {
    var seen = {};
    DB.data.supplies.forEach(function (s) { seen[s.fuel] = 1; });
    DB.data.fills.forEach(function (f) { if (f.source === 'tank') seen[f.fuel] = 1; });
    return Object.keys(seen);
  };

  /* ============ сводка за месяц ============ */
  CALC.month = function (key) {
    return memo('month.' + key, function () {
      var r = { key: key, liters: 0, cost: 0, station: 0, tank: 0, supplyLiters: 0, supplyCost: 0,
        byUnit: {}, extraCost: 0, count: 0 };
      DB.data.fills.forEach(function (f) {
        if (U.monthKey(f.date) !== key) return;
        r.count++;
        r.liters += U.num(f.liters);
        r.cost += U.num(f.cost);
        if (f.source === 'station') r.station += U.num(f.liters); else r.tank += U.num(f.liters);
        var b = r.byUnit[f.unitId] || (r.byUnit[f.unitId] = { liters: 0, cost: 0, run: 0 });
        b.liters += U.num(f.liters);
        b.cost += U.num(f.cost);
      });
      DB.data.supplies.forEach(function (s) {
        if (U.monthKey(s.date) !== key) return;
        r.supplyLiters += U.num(s.liters);
        r.supplyCost += U.num(s.cost);
      });
      /* перерасход за месяц — по сегментам, закрытым в этом месяце */
      DB.units(true).forEach(function (u) {
        var price = DB.price(u.fuel);
        CALC.segments(u).forEach(function (s) {
          if (s.extra == null || U.monthKey(s.to.date) !== key) return;
          if (s.extra > 0) r.extraCost += s.extra * price;
          var b = r.byUnit[u.id];
          if (b) b.run += s.run;
        });
      });
      return r;
    });
  };

  /* ============ сводка по парку ============ */
  CALC.fleet = function () {
    return memo('fleet', function () {
      var units = DB.units();
      var r = { units: units.length, alerts: [], extraCost: 0, overrun: 0 };
      units.forEach(function (u) {
        var s = CALC.unit(u);
        if (s.extraLiters > 0) r.extraCost += s.extraCost;
        if (s.dev != null && s.dev > (U.num(DB.data.settings.overrun) || 10)) r.overrun++;
        s.alerts.forEach(function (a) { r.alerts.push(a); });
      });
      CALC.tankFuels().forEach(function (fuel) {
        var t = CALC.tank(fuel);
        var low = U.num(DB.data.settings.lowDays) || 5;
        if (t.daysLeft != null && t.daysLeft <= low && t.balance > 0) {
          r.alerts.push({ type: 'low-fuel',
            text: U.fuel(fuel).name + ' в бочке: ' + U.liters(t.balance) + ' — примерно на ' + U.days(t.daysLeft) });
        }
        if (t.balance < 0) {
          r.alerts.push({ type: 'tank-negative',
            text: 'По учёту из бочки выдано больше, чем в неё залито (' + U.liters(t.balance) + '). Внесите приход или сделайте замер.' });
        }
        if (t.diff && Math.abs(t.diff.delta) >= 5) {
          r.alerts.push({ type: 'shortage',
            text: 'Замер ' + U.fmtDate(t.diff.date) + ': ' +
              (t.diff.delta < 0 ? 'недостача ' : 'излишек ') + U.liters(Math.abs(t.diff.delta)),
            money: t.diff.delta < 0 ? Math.abs(t.diff.delta) * DB.price(fuel) : 0 });
        }
      });
      /* сначала деньги, потом остальное */
      r.alerts.sort(function (a, b) { return (U.num(b.money)) - (U.num(a.money)); });
      return r;
    });
  };

  /* ============ отчёт текстом — для отправки в мессенджер ============ */
  CALC.report = function (key) {
    var m = CALC.month(key), lines = [];
    lines.push('Топливо — ' + U.monthName(key));
    lines.push('Всего: ' + U.liters(m.liters) + ' на ' + U.money(m.cost));
    if (m.supplyLiters) lines.push('Закуплено в бочку: ' + U.liters(m.supplyLiters) + ' на ' + U.money(m.supplyCost));
    lines.push('');
    DB.units().forEach(function (u) {
      var b = m.byUnit[u.id];
      if (!b) return;
      var s = CALC.unit(u);
      var dev = s.dev == null ? '' : Math.abs(s.dev) < 0.5 ? ' (в норме)'
        : ' (' + (s.dev > 0 ? '+' : '−') + U.dec(Math.abs(s.dev), 0) + '% к норме)';
      lines.push('• ' + u.name + ': ' + U.liters(b.liters) + ' · ' + U.money(b.cost) +
        (s.avg != null ? ' · ' + U.rate(s.avg, u.meter) + dev : ''));
    });
    if (m.extraCost > 0) {
      lines.push('');
      lines.push('Перерасход к норме: ' + U.money(m.extraCost));
    }
    CALC.tankFuels().forEach(function (fuel) {
      var t = CALC.tank(fuel);
      lines.push('Остаток в бочке (' + U.fuel(fuel).short + '): ' + U.liters(t.balance) +
        (t.daysLeft != null ? ' — на ' + U.days(t.daysLeft) : ''));
    });
    return lines.join('\n');
  };

  w.CALC = CALC;
})(window);
