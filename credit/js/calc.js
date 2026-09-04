/* Движок расчёта: проценты, пеня, погашение, портфель */
(function (w) {
  'use strict';

  var CALC = {};

  CALC.PERIOD_DAYS = { day: 1, week: 7, month: 30, year: 365 };
  CALC.PERIOD_NAME = { day: 'в день', week: 'в неделю', month: 'в месяц', year: 'в год' };
  CALC.PERIOD_SHORT = { day: '/день', week: '/нед', month: '/мес', year: '/год' };

  /* Сколько месяцев прошло между двумя датами, если месяц отсчитывается
     от даты выдачи. Полный месяц = 1,0 независимо от того, 28 в нём дней
     или 31; неполный — по дням внутри этого месяца.
     Так «10% в месяц» всегда означает ровно 10% за месяц.            */
  CALC.monthFraction = function (anchor, from, to) {
    if (from < anchor) from = anchor;
    if (U.diffDays(from, to) <= 0) return 0;
    var i = Math.max(0, Math.floor(U.diffDays(anchor, from) / 31) - 1);
    while (U.addMonths(anchor, i + 1) <= from) i++;
    var total = 0, cur = from, guard = 0;
    while (cur < to && guard++ < 1200) {
      var a = U.addMonths(anchor, i), b = U.addMonths(anchor, i + 1);
      if (b <= cur) { i++; continue; }
      var end = to < b ? to : b;
      var len = U.diffDays(a, b) || 30;
      total += U.diffDays(cur, end) / len;
      cur = end; i++;
    }
    return total;
  };

  /* Проценты за отрезок [from; to) на остаток balance */
  CALC.interestBetween = function (loan, from, to, balance) {
    if (loan.model === 'fixed' || balance <= 0) return 0;
    var rate = U.num(loan.rate) / 100;
    if (!rate) return 0;
    if (loan.ratePeriod === 'month') {
      return balance * rate * CALC.monthFraction(loan.issuedAt, from, to);
    }
    var d = CALC.PERIOD_DAYS[loan.ratePeriod] || 30;
    return balance * rate / d * U.diffDays(from, to);
  };

  /* Доля ставки за один сегодняшний день — только для показа «капает в день» */
  CALC.daily = function (loan) {
    if (loan.model === 'fixed') return 0;
    if (loan.ratePeriod === 'month') {
      var t = U.today();
      return CALC.interestBetween(loan, t, U.addDays(t, 1), 1);
    }
    return U.num(loan.rate) / 100 / (CALC.PERIOD_DAYS[loan.ratePeriod] || 30);
  };

  /* начисление за отрезок [from; to) на остаток balance */
  function accrue(loan, from, to, balance, acc) {
    if (U.diffDays(from, to) <= 0 || balance <= 0) return;
    var pen = U.num(loan.penaltyRate) / 100;
    var due = loan.dueAt || null;
    var pts = (due && due > from && due < to) ? [from, due, to] : [from, to];
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], d = U.diffDays(a, b);
      if (d <= 0) continue;
      var overdue = due ? a >= due : false;
      if (!(overdue && loan.stopAccrual)) acc.interest += CALC.interestBetween(loan, a, b, balance);
      if (overdue && pen > 0) acc.penalty += balance * pen * d;
    }
  }

  /* Состояние займа на дату asOf */
  CALC.at = function (loan, asOf) {
    asOf = asOf || U.today();
    var principal = U.num(loan.principal);
    var balance = principal;
    var acc = { interest: 0, penalty: 0 };          // всего начислено
    var pool = { interest: 0, penalty: 0 };         // начислено и ещё не оплачено
    var paidInterest = 0, paidPenalty = 0, paidPrincipal = 0, paidTotal = 0, overpay = 0;
    var alloc = [];

    if (loan.model === 'fixed') {                    // фиксированная сумма возврата
      var fx = Math.max(0, U.num(loan.returnAmount) - principal);
      acc.interest = fx; pool.interest = fx;
    }

    var pays = (loan.payments || []).slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
    var cursor = loan.issuedAt;

    for (var i = 0; i < pays.length; i++) {
      var p = pays[i];
      var pd = p.date < loan.issuedAt ? loan.issuedAt : p.date;
      if (pd > asOf) break;                          // будущие платежи не учитываем
      var before = { interest: acc.interest, penalty: acc.penalty };
      accrue(loan, cursor, pd, balance, acc);
      pool.interest += acc.interest - before.interest;
      pool.penalty += acc.penalty - before.penalty;
      cursor = pd;

      var left = U.num(p.amount), a = { id: p.id, date: p.date, amount: left, pen: 0, int: 0, prin: 0 };
      var t = Math.min(left, pool.penalty); pool.penalty -= t; left -= t; paidPenalty += t; a.pen = t;
      t = Math.min(left, pool.interest); pool.interest -= t; left -= t; paidInterest += t; a.int = t;
      t = Math.min(left, balance); balance -= t; left -= t; paidPrincipal += t; a.prin = t;
      overpay += left;
      paidTotal += U.num(p.amount);
      alloc.push(a);
    }

    var b2 = { interest: acc.interest, penalty: acc.penalty };
    accrue(loan, cursor, asOf, balance, acc);
    pool.interest += acc.interest - b2.interest;
    pool.penalty += acc.penalty - b2.penalty;

    var r0 = function (x) { return Math.abs(x) < 0.005 ? 0 : x; };
    var totalDue = r0(balance + pool.interest + pool.penalty);
    var overdueDays = loan.dueAt ? Math.max(0, U.diffDays(loan.dueAt, asOf)) : 0;
    var closed = loan.status === 'closed';

    return {
      principal: principal,
      balance: r0(balance),
      interestAccrued: r0(acc.interest),
      interestDue: r0(pool.interest),
      penaltyAccrued: r0(acc.penalty),
      penaltyDue: r0(pool.penalty),
      totalDue: closed ? 0 : totalDue,
      rawDue: totalDue,
      paidTotal: paidTotal,
      paidInterest: paidInterest,
      paidPenalty: paidPenalty,
      paidPrincipal: paidPrincipal,
      overpay: overpay,
      profit: paidInterest + paidPenalty,                 // деньги, уже полученные сверх тела
      dailyAccrual: closed ? 0 : CALC.interestBetween(loan, asOf, U.addDays(asOf, 1), balance) +
        (loan.dueAt && asOf >= loan.dueAt ? balance * U.num(loan.penaltyRate) / 100 : 0),
      isClosed: closed,
      isPaidOff: totalDue <= 0.49,
      isOverdue: !closed && totalDue > 0.49 && overdueDays > 0,
      overdueDays: overdueDays,
      daysLeft: loan.dueAt ? U.diffDays(asOf, loan.dueAt) : null,
      daysGone: U.diffDays(loan.issuedAt, asOf),
      alloc: alloc,
      asOf: asOf
    };
  };

  /* ---------- график ежемесячных выплат процентов ----------
     Проценты отдаются каждый месяц от даты выдачи, независимо от срока
     займа; тело возвращается в конце (или когда решит владелец денег).  */
  CALC.schedule = function (loan, asOf) {
    asOf = asOf || U.today();
    if (loan.payMode !== 'monthly' || loan.model === 'fixed') return [];
    var out = [], prev = loan.issuedAt;
    var horizon = loan.dueAt || U.addMonths(asOf, 3);
    for (var i = 1; i <= 240; i++) {
      var d = U.addMonths(loan.issuedAt, i);
      if (d > horizon) break;
      var a = CALC.at(loan, prev), b = CALC.at(loan, d);
      var due = (b.interestAccrued - a.interestAccrued) + (b.penaltyAccrued - a.penaltyAccrued);
      var covered = (b.paidInterest + b.paidPenalty) >= (b.interestAccrued + b.penaltyAccrued) - 0.5;
      out.push({
        n: i, from: prev, date: d, due: due, paid: covered,
        status: covered ? 'paid'
          : d > asOf ? (U.diffDays(asOf, d) <= 7 ? 'soon' : 'future') : 'overdue'
      });
      prev = d;
    }
    return out;
  };

  /* Сколько процентов набегает за один месяц при текущем остатке */
  CALC.perMonth = function (loan, balance) {
    if (loan.model === 'fixed') return 0;
    var b = balance != null ? balance : CALC.at(loan, U.today()).balance;
    var rate = U.num(loan.rate) / 100;
    if (loan.ratePeriod === 'month') return b * rate;
    return b * rate * 30 / (CALC.PERIOD_DAYS[loan.ratePeriod] || 30);
  };

  /* ---------- состояние на сегодня (с кэшем на время отрисовки) ---------- */
  CALC._c = {};
  CALC.clearCache = function () { CALC._c = {}; };

  CALC.loan = function (loan) {
    var t = U.today();
    var key = loan.id ? loan.id + '|' + t : null;
    if (key && CALC._c[key]) return CALC._c[key];

    var r = CALC.at(loan, t);
    r.schedule = CALC.schedule(loan, t);
    r.missed = 0;
    r.nextPay = null;
    if (r.schedule.length && !r.isClosed) {
      for (var i = 0; i < r.schedule.length; i++) {
        var p = r.schedule[i];
        if (p.status === 'overdue') r.missed++;
        if (!r.nextPay && !p.paid) r.nextPay = p;
      }
      if (r.missed > 0) r.isOverdue = true;
    }
    if (key) CALC._c[key] = r;
    return r;
  };

  /* Плановое состояние на дату возврата (сколько должно вернуться всего) */
  CALC.plan = function (loan) {
    var t = U.today();
    return CALC.at(loan, loan.dueAt && loan.dueAt > t ? loan.dueAt : t);
  };

  /* Ставка из суммы: «хочу 15 000 в месяц с 100 000» → 15% */
  CALC.rateFromAmount = function (principal, amount, period) {
    var p = U.num(principal);
    if (!p) return 0;
    return U.num(amount) / p * 100;
  };
  CALC.amountFromRate = function (principal, rate) {
    return U.num(principal) * U.num(rate) / 100;
  };

  /* Сколько нужно заплатить, чтобы закрыть только проценты (и пеню) */
  CALC.interestOnly = function (loan) {
    var r = CALC.loan(loan);
    return Math.round((r.interestDue + r.penaltyDue) * 100) / 100;
  };

  /* Сводка по портфелю. Суммы копятся по валютам и сводятся в базовую,
     если курс задан; иначе показываются раздельно.                     */
  CALC.portfolio = function (loans) {
    var cur = {
      issued: {}, outstanding: {}, interestDue: {}, totalDue: {},
      overdueSum: {}, profit: {}, expected: {}, daily: {}, monthDue: {}
    };
    function add(bag, c, v) { if (v) bag[c] = (bag[c] || 0) + v; }

    var s = {
      count: 0, activeCount: 0, overdueCount: 0, closedCount: 0,
      dueSoon: [], overdue: [], cur: cur, mixed: false
    };
    var mk = U.monthKey(U.today());

    loans.forEach(function (l) {
      var c = l.currency || FX.base();
      var r = CALC.loan(l);
      s.count++;
      add(cur.issued, c, r.principal);
      add(cur.profit, c, r.profit);
      if (r.isClosed) { s.closedCount++; return; }
      s.activeCount++;
      add(cur.outstanding, c, r.balance);
      add(cur.interestDue, c, r.interestDue + r.penaltyDue);
      add(cur.totalDue, c, r.totalDue);
      add(cur.daily, c, r.dailyAccrual);

      var p = CALC.plan(l);
      add(cur.expected, c, Math.max(0, p.interestDue + p.penaltyDue));

      /* сколько процентов должно прийти в этом месяце по графику */
      (r.schedule || []).forEach(function (x) {
        if (!x.paid && U.monthKey(x.date) === mk) add(cur.monthDue, c, x.due);
      });

      if (r.isOverdue) {
        s.overdueCount++;
        add(cur.overdueSum, c, r.missed ? (r.interestDue + r.penaltyDue) : r.totalDue);
        s.overdue.push({ loan: l, r: r });
      } else {
        var soonDays = null;
        if (r.nextPay) soonDays = U.diffDays(U.today(), r.nextPay.date);
        if (r.daysLeft != null && (soonDays == null || r.daysLeft < soonDays)) soonDays = r.daysLeft;
        if (soonDays != null && soonDays <= 7) {
          s.dueSoon.push({ loan: l, r: r, days: soonDays });
        }
      }
    });

    s.overdue.sort(function (a, b) { return (b.r.overdueDays + b.r.missed * 30) - (a.r.overdueDays + a.r.missed * 30); });
    s.dueSoon.sort(function (a, b) { return a.days - b.days; });

    /* сведение в базовую валюту */
    ['issued', 'outstanding', 'interestDue', 'totalDue', 'overdueSum', 'profit', 'expected', 'daily', 'monthDue']
      .forEach(function (k) {
        var t = FX.total(cur[k]);
        s[k === 'issued' ? 'issuedTotal' : k === 'profit' ? 'profitRealized' : k === 'expected' ? 'profitExpected' :
          k === 'daily' ? 'dailyAccrual' : k] = t.ok ? t.value : null;
        if (!t.ok) s.mixed = true;
      });
    return s;
  };

  /* Приход денег по месяцам: {'2026-09': {total, interest, principal}} */
  CALC.byMonth = function (loans) {
    var m = {}, base = FX.base();
    loans.forEach(function (l) {
      var c = l.currency || base;
      CALC.loan(l).alloc.forEach(function (a) {
        var k = U.monthKey(a.date);
        if (!m[k]) m[k] = { total: 0, interest: 0, principal: 0, exact: true };
        var f = c === base ? 1 : FX.conv(1, c, base);
        if (f == null) { m[k].exact = false; return; }
        m[k].total += a.amount * f;
        m[k].interest += (a.int + a.pen) * f;
        m[k].principal += a.prin * f;
      });
    });
    return m;
  };

  /* Выдано по месяцам */
  CALC.issuedByMonth = function (loans) {
    var m = {}, base = FX.base();
    loans.forEach(function (l) {
      var k = U.monthKey(l.issuedAt);
      var f = (l.currency || base) === base ? 1 : FX.conv(1, l.currency, base);
      if (f == null) return;
      m[k] = (m[k] || 0) + U.num(l.principal) * f;
    });
    return m;
  };

  /* Предпросмотр условий при создании займа */
  CALC.preview = function (draft) {
    var l = Object.assign({ payments: [], status: 'active' }, draft);
    var p = CALC.plan(l);
    return {
      profit: p.interestDue + p.penaltyDue,
      total: p.balance + p.interestDue + p.penaltyDue,
      perDay: U.num(l.principal) * CALC.daily(l),
      days: l.dueAt ? U.diffDays(l.issuedAt, l.dueAt) : 0
    };
  };

  w.CALC = CALC;
})(window);
