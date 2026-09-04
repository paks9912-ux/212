/* Движок расчёта: проценты, пеня, погашение, портфель */
(function (w) {
  'use strict';

  var CALC = {};

  CALC.PERIOD_DAYS = { day: 1, week: 7, month: 30, year: 365 };
  CALC.PERIOD_NAME = { day: 'в день', week: 'в неделю', month: 'в месяц', year: 'в год' };
  CALC.PERIOD_SHORT = { day: '/день', week: '/нед', month: '/мес', year: '/год' };

  /* дневная ставка займа, доля от 1 */
  CALC.daily = function (loan) {
    if (loan.model === 'fixed') return 0;
    var d = CALC.PERIOD_DAYS[loan.ratePeriod] || 30;
    return U.num(loan.rate) / 100 / d;
  };

  /* начисление за отрезок [from; to) на остаток balance */
  function accrue(loan, from, to, balance, acc) {
    if (U.diffDays(from, to) <= 0 || balance <= 0) return;
    var dr = CALC.daily(loan);
    var pen = U.num(loan.penaltyRate) / 100;
    var due = loan.dueAt || null;
    var pts = (due && due > from && due < to) ? [from, due, to] : [from, to];
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], d = U.diffDays(a, b);
      if (d <= 0) continue;
      var overdue = due ? a >= due : false;
      if (!(overdue && loan.stopAccrual)) acc.interest += balance * dr * d;
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
      dailyAccrual: closed ? 0 : balance * CALC.daily(loan) +
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

  CALC.loan = function (loan) { return CALC.at(loan, U.today()); };

  /* Плановое состояние на дату возврата (сколько должно вернуться всего) */
  CALC.plan = function (loan) {
    if (!loan.dueAt) return CALC.loan(loan);
    var t = U.today();
    return CALC.at(loan, loan.dueAt > t ? loan.dueAt : t);
  };

  /* Сколько нужно заплатить, чтобы закрыть только проценты (и пеню) */
  CALC.interestOnly = function (loan) {
    var r = CALC.loan(loan);
    return Math.round((r.interestDue + r.penaltyDue) * 100) / 100;
  };

  /* Сводка по портфелю */
  CALC.portfolio = function (loans) {
    var s = {
      count: 0, activeCount: 0, overdueCount: 0, closedCount: 0,
      issuedTotal: 0, outstanding: 0, interestDue: 0, penaltyDue: 0, totalDue: 0,
      overdueSum: 0, profitRealized: 0, profitExpected: 0, dailyAccrual: 0,
      dueSoon: [], overdue: []
    };
    loans.forEach(function (l) {
      var r = CALC.loan(l);
      s.count++;
      s.issuedTotal += r.principal;
      s.profitRealized += r.profit;
      if (r.isClosed) { s.closedCount++; return; }
      s.activeCount++;
      s.outstanding += r.balance;
      s.interestDue += r.interestDue;
      s.penaltyDue += r.penaltyDue;
      s.totalDue += r.totalDue;
      s.dailyAccrual += r.dailyAccrual;
      var p = CALC.plan(l);
      s.profitExpected += Math.max(0, p.interestDue + p.penaltyDue);
      if (r.isOverdue) { s.overdueCount++; s.overdueSum += r.totalDue; s.overdue.push({ loan: l, r: r }); }
      else if (r.daysLeft != null && r.daysLeft <= 7) s.dueSoon.push({ loan: l, r: r });
    });
    s.overdue.sort(function (a, b) { return b.r.overdueDays - a.r.overdueDays; });
    s.dueSoon.sort(function (a, b) { return a.r.daysLeft - b.r.daysLeft; });
    return s;
  };

  /* Приход денег по месяцам: {'2026-09': {total, interest, principal}} */
  CALC.byMonth = function (loans) {
    var m = {};
    loans.forEach(function (l) {
      CALC.loan(l).alloc.forEach(function (a) {
        var k = U.monthKey(a.date);
        if (!m[k]) m[k] = { total: 0, interest: 0, principal: 0 };
        m[k].total += a.amount;
        m[k].interest += a.int + a.pen;
        m[k].principal += a.prin;
      });
    });
    return m;
  };

  /* Выдано по месяцам */
  CALC.issuedByMonth = function (loans) {
    var m = {};
    loans.forEach(function (l) {
      var k = U.monthKey(l.issuedAt);
      m[k] = (m[k] || 0) + U.num(l.principal);
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
