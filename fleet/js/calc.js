/* Расчёты: наработка, норма расхода, остаток в баке, недостача, ТО */
(function (w) {
  'use strict';

  var CALC = {};
  var cache = {};

  CALC.clearCache = function () { cache = {}; };

  /* ---------- мелочи ---------- */

  /* наработка смены: по показаниям счётчика, а если их нет — введённая руками */
  CALC.shiftWork = function (s) {
    if (!s) return 0;
    if (s.start != null && s.end != null && s.end !== '' && s.start !== '') {
      var v = U.num(s.end) - U.num(s.start);
      if (v > 0) return v;
    }
    return Math.max(0, U.num(s.work));
  };

  /* сколько литров положено по норме на такую наработку */
  CALC.normFor = function (u, work) {
    if (!u) return 0;
    var n = U.num(u.norm), v = U.num(work);
    return u.meter === 'km' ? v / 100 * n : v * n;
  };

  /* обратное: фактический расход при такой наработке */
  CALC.rateOf = function (u, liters, work) {
    var v = U.num(work);
    if (v <= 0) return null;
    return u.meter === 'km' ? U.num(liters) / v * 100 : U.num(liters) / v;
  };

  CALC.inRange = function (date, from, to) {
    return (!from || date >= from) && (!to || date <= to);
  };

  /* ---------- журналы одной единицы техники ---------- */
  CALC.shiftsOf = function (unitId, from, to) {
    return DB.data.shifts.filter(function (s) {
      return s.unitId === unitId && CALC.inRange(s.date, from, to);
    });
  };
  CALC.fuelOf = function (unitId, from, to, type) {
    return DB.data.fuel.filter(function (f) {
      return f.unitId === unitId && (!type || f.type === type) && CALC.inRange(f.date, from, to);
    });
  };
  CALC.servicesOf = function (unitId, from, to) {
    return DB.data.services.filter(function (s) {
      return s.unitId === unitId && CALC.inRange(s.date, from, to);
    });
  };

  /* показания счётчика сейчас — максимум из всего, что было записано */
  CALC.meterNow = function (u) {
    if (!u) return 0;
    var k = 'm' + u.id;
    if (cache[k] != null) return cache[k];
    var m = U.num(u.meterStart);
    CALC.shiftsOf(u.id).forEach(function (s) {
      if (s.end != null && s.end !== '') m = Math.max(m, U.num(s.end));
    });
    CALC.fuelOf(u.id).forEach(function (f) {
      if (f.meter != null && f.meter !== '') m = Math.max(m, U.num(f.meter));
    });
    CALC.servicesOf(u.id).forEach(function (s) {
      if (s.meter != null && s.meter !== '') m = Math.max(m, U.num(s.meter));
    });
    /* смены без показаний счётчика тоже наматывают наработку */
    var loose = 0;
    CALC.shiftsOf(u.id).forEach(function (s) {
      if (s.end == null || s.end === '') loose += CALC.shiftWork(s);
    });
    cache[k] = m + loose;
    return cache[k];
  };

  /* ---------- топливо в баке ----------
     Замер бака — это точка опоры: он обнуляет все прошлые догадки.
     Дальше остаток = замер + заправки − списание по норме.
     Операции того же дня, что и замер, считаются сделанными до него.      */
  CALC.baseline = function (u, upto) {
    var checks = CALC.fuelOf(u.id, null, upto, 'check');
    var last = checks[checks.length - 1] || null;
    return last
      ? { date: last.date, liters: U.num(last.liters), fromCheck: true }
      : { date: null, liters: U.num(u.tankStart), fromCheck: false };
  };

  /* расчётный остаток в баке на дату (по умолчанию — сегодня) */
  CALC.tankLeft = function (u, upto) {
    var base = CALC.baseline(u, upto);
    var left = base.liters, filled = 0, burned = 0, drained = 0;
    CALC.fuelOf(u.id, null, upto, 'fill').forEach(function (f) {
      if (base.date && f.date <= base.date) return;
      filled += U.num(f.liters);
    });
    /* зафиксированный слив — топливо ушло, но не на работу */
    CALC.fuelOf(u.id, null, upto, 'drain').forEach(function (f) {
      if (base.date && f.date <= base.date) return;
      drained += U.num(f.liters);
    });
    CALC.shiftsOf(u.id, null, upto).forEach(function (s) {
      if (base.date && s.date <= base.date) return;
      burned += CALC.normFor(u, CALC.shiftWork(s));
    });
    left += filled - burned - drained;
    return { left: left, base: base, filled: filled, burned: burned, drained: drained };
  };

  /* все замеры бака с отклонением: сколько было по расчёту и сколько нашли */
  CALC.checks = function (u, from, to) {
    var all = CALC.fuelOf(u.id, null, null, 'check');
    var out = [];
    all.forEach(function (c, i) {
      var prev = i > 0 ? all[i - 1] : null;
      var start = prev ? { date: prev.date, liters: U.num(prev.liters) }
        : { date: null, liters: U.num(u.tankStart) };
      var filled = 0, burned = 0, drained = 0;
      CALC.fuelOf(u.id, null, c.date, 'fill').forEach(function (f) {
        if (start.date && f.date <= start.date) return;
        filled += U.num(f.liters);
      });
      CALC.fuelOf(u.id, null, c.date, 'drain').forEach(function (f) {
        if (start.date && f.date <= start.date) return;
        drained += U.num(f.liters);
      });
      CALC.shiftsOf(u.id, null, c.date).forEach(function (s) {
        if (start.date && s.date <= start.date) return;
        burned += CALC.normFor(u, CALC.shiftWork(s));
      });
      var expected = start.liters + filled - burned - drained;
      out.push({
        id: c.id, date: c.date, found: U.num(c.liters), expected: expected,
        deviation: U.num(c.liters) - expected,       // минус — недостача
        hasBase: !!prev || U.num(u.tankStart) > 0,
        sinceDate: start.date, filled: filled, burned: burned, drained: drained,
        src: c.src || null, note: c.note || ''
      });
    });
    return out.filter(function (c) { return CALC.inRange(c.date, from, to); });
  };

  /* ---------- регламенты обслуживания ----------
     У единицы может быть несколько работ: ТО по моточасам, замена масла,
     техосмотр раз в год. Срок наступает по тому, что придёт раньше —
     наработка или календарь.                                            */
  CALC.serviceStates = function (u, meterNow) {
    if (!u) return [];
    meterNow = meterNow == null ? CALC.meterNow(u) : meterNow;
    var warn = (U.num(DB.data.settings.serviceWarnPct) || 10) / 100;
    var all = CALC.servicesOf(u.id);

    return DB.programs(u).map(function (pr) {
      var done = all.filter(function (s) {
        return s.kind !== 'repair' && (s.programId === pr.id || (!s.programId && pr.id === 'to'));
      });
      var last = done[done.length - 1] || null;
      var st = { program: pr, name: pr.name, last: last };
      var everyWork = U.num(pr.everyWork), everyDays = U.num(pr.everyDays);

      if (everyWork > 0) {
        st.sinceWork = meterNow - (last && last.meter != null ? U.num(last.meter) : U.num(u.meterStart));
        st.leftWork = everyWork - st.sinceWork;
      }
      if (everyDays > 0) {
        st.sinceDays = U.diffDays(last ? last.date : (u.createdAt || DB.data.createdAt || U.today()), U.today());
        st.leftDays = everyDays - st.sinceDays;
      }

      /* что ближе к сроку в долях интервала, то и показываем */
      var wShare = st.leftWork != null ? st.leftWork / everyWork : Infinity;
      var dShare = st.leftDays != null ? st.leftDays / everyDays : Infinity;
      if (st.leftWork != null && wShare <= dShare) {
        st.by = 'work'; st.left = st.leftWork; st.every = everyWork; st.since = st.sinceWork;
      } else if (st.leftDays != null) {
        st.by = 'days'; st.left = st.leftDays; st.every = everyDays; st.since = st.sinceDays;
      } else {
        st.by = 'none'; st.left = null; st.every = 0; st.since = 0;
      }
      st.pct = st.every > 0 ? Math.max(0, Math.min(1, st.since / st.every)) : null;
      st.overdue = st.left != null && st.left < 0;
      st.soon = st.left != null && st.left >= 0 && st.left <= st.every * warn;
      st.urgency = st.left != null && st.every > 0 ? st.left / st.every : 99;
      return st;
    }).sort(function (a, b) { return a.urgency - b.urgency; });
  };

  var NO_SERVICE = { none: true, overdue: false, soon: false, left: null,
    every: 0, since: 0, pct: null, by: 'none', last: null, name: '' };

  /* ---------- уровень топлива по дням: ряд для графика ----------
     Ровно та «пила», которую рисуют системы мониторинга: заправка —
     скачок вверх, работа — плавный спуск, замер — точка проверки.      */
  CALC.tankSeries = function (u, from, to) {
    var days = U.diffDays(from, to);
    if (!u || days < 0) return [];
    if (days > 400) from = U.addDays(to, -400), days = 400;

    var level = CALC.tankLeft(u, U.addDays(from, -1)).left;
    var out = [];
    for (var i = 0; i <= days; i++) {
      var d = U.addDays(from, i);
      var fill = 0, drain = 0, burn = 0, check = null;
      CALC.fuelOf(u.id, d, d).forEach(function (f) {
        if (f.type === 'fill') fill += U.num(f.liters);
        else if (f.type === 'drain') drain += U.num(f.liters);
        else if (f.type === 'check') check = f;
      });
      CALC.shiftsOf(u.id, d, d).forEach(function (s) { burn += CALC.normFor(u, CALC.shiftWork(s)); });

      level = level + fill - drain - burn;
      var expected = level, dev = null;
      if (check) { dev = U.num(check.liters) - expected; level = U.num(check.liters); }
      out.push({ date: d, level: level, expected: expected, fill: fill, drain: drain,
        burn: burn, check: check ? U.num(check.liters) : null, deviation: dev });
    }
    return out;
  };

  /* ---------- утечки: зафиксированные сливы и провалы на замерах ---------- */
  CALC.leaks = function (u, from, to) {
    var out = [];
    CALC.fuelOf(u.id, from, to, 'drain').forEach(function (f) {
      out.push({ id: f.id, date: f.date, liters: U.num(f.liters), kind: 'drain',
        src: f.src || null, note: f.note || '' });
    });
    CALC.checks(u, from, to).forEach(function (c) {
      if (!c.hasBase) return;
      var limit = Math.max(15, c.burned * 0.05);
      if (c.deviation < -limit) {
        out.push({ id: c.id, date: c.date, liters: -c.deviation, kind: 'check',
          src: c.src || null, note: c.note || '' });
      }
    });
    return out.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  };

  /* ---------- состояние единицы техники ---------- */
  CALC.unitState = function (u) {
    if (!u) return null;
    var k = 'u' + u.id;
    if (cache[k]) return cache[k];

    var meterNow = CALC.meterNow(u);
    var tank = CALC.tankLeft(u);
    var checks = CALC.checks(u);
    var lastCheck = checks[checks.length - 1] || null;

    var shifts = CALC.shiftsOf(u.id);
    var fills = CALC.fuelOf(u.id, null, null, 'fill');
    var lastShift = shifts[shifts.length - 1] || null;
    var lastFill = fills[fills.length - 1] || null;

    var svc = CALC.serviceStates(u, meterNow);

    var st = {
      unit: u,
      meterNow: meterNow,
      tankLeft: tank.left,
      tankBase: tank.base,
      tankPct: U.num(u.tank) > 0 ? Math.max(0, Math.min(1, tank.left / U.num(u.tank))) : null,
      /* залито больше, чем физически влезает, — топливо ушло мимо бака */
      tankOverflow: U.num(u.tank) > 0 && tank.left > U.num(u.tank) * 1.03,
      tankNegative: tank.left < -1,
      checks: checks,
      lastCheck: lastCheck,
      deviationTotal: checks.reduce(function (a, c) { return a + (c.hasBase ? c.deviation : 0); }, 0),
      shiftCount: shifts.length,
      lastShift: lastShift,
      lastFill: lastFill,
      idleDays: lastShift ? U.diffDays(lastShift.date, U.today()) : null,
      services: svc,
      service: svc[0] || NO_SERVICE,
      leaks: CALC.leaks(u)
    };
    cache[k] = st;
    return st;
  };

  /* ---------- единица техники за период ---------- */
  CALC.unitPeriod = function (u, from, to) {
    var k = 'p' + u.id + (from || '') + (to || '');
    if (cache[k]) return cache[k];

    var work = 0, days = {};
    CALC.shiftsOf(u.id, from, to).forEach(function (s) {
      work += CALC.shiftWork(s);
      days[s.date] = 1;
    });
    var filled = 0, filledTank = 0, filledAzs = 0, money = 0, fillCount = 0;
    CALC.fuelOf(u.id, from, to, 'fill').forEach(function (f) {
      filled += U.num(f.liters);
      money += U.num(f.sum);
      fillCount++;
      if (f.source === 'tank') filledTank += U.num(f.liters); else filledAzs += U.num(f.liters);
    });
    var drained = 0;
    CALC.fuelOf(u.id, from, to, 'drain').forEach(function (f) { drained += U.num(f.liters); });

    var checks = CALC.checks(u, from, to).filter(function (c) { return c.hasBase; });
    var deviation = checks.reduce(function (a, c) { return a + c.deviation; }, 0);

    var norm = CALC.normFor(u, work);
    var serviceCost = 0;
    CALC.servicesOf(u.id, from, to).forEach(function (s) { serviceCost += U.num(s.sum); });

    var r = {
      unit: u, from: from, to: to,
      work: work, days: Object.keys(days).length,
      norm: norm, filled: filled, filledTank: filledTank, filledAzs: filledAzs,
      fillCount: fillCount, money: money, serviceCost: serviceCost,
      over: filled - norm,                       // залито сверх нормы
      deviation: deviation,                      // недостача по замерам (минус — плохо)
      drained: drained,                          // зафиксированные сливы
      checkCount: checks.length,
      actualRate: CALC.rateOf(u, filled, work),  // фактический расход
      normRate: U.num(u.norm)
    };
    r.rateDiff = r.actualRate != null ? r.actualRate - r.normRate : null;
    /* во что обошёлся моточас (километр): топливо плюс ремонты */
    r.costTotal = money + serviceCost;
    r.costPerWork = work > 0 ? r.costTotal / work : null;
    /* потеряно всего: явные сливы плюс необъяснённая недостача по замерам */
    r.lost = drained + (checks.length ? Math.max(0, -deviation) : 0);
    /* «перерасход» — то, что подсвечиваем красным.
       Мелкие расхождения — это погрешность замера, а не воровство:
       считаем проблемой недостачу больше 3% нормы и больше 15 литров. */
    var limit = Math.max(15, norm * 0.03);
    r.problem = drained > 0 ||
      (r.checkCount ? (-r.deviation > limit) : (work > 0 && r.over > Math.max(25, norm * 0.08)));
    r.problemLiters = (r.checkCount || drained) ? r.lost : r.over;
    r.problemLimit = limit;
    cache[k] = r;
    return r;
  };

  /* ---------- склад ГСМ ---------- */
  CALC.tankState = function (upto) {
    var checks = DB.data.fuel.filter(function (f) {
      return f.type === 'tankcheck' && CALC.inRange(f.date, null, upto);
    });
    var last = checks[checks.length - 1] || null;
    var base = last ? { date: last.date, liters: U.num(last.liters) } : { date: null, liters: 0 };
    var intake = 0, out = 0, drained = 0;
    DB.data.fuel.forEach(function (f) {
      if (!CALC.inRange(f.date, null, upto)) return;
      if (base.date && f.date <= base.date) return;
      if (f.type === 'intake') intake += U.num(f.liters);
      if (f.type === 'fill' && f.source === 'tank') out += U.num(f.liters);
      if (f.type === 'drain' && !f.unitId) drained += U.num(f.liters);
    });
    var vol = U.num(DB.data.settings.tankVolume);
    var left = base.liters + intake - out - drained;

    /* отклонения по всем замерам склада */
    var all = DB.data.fuel.filter(function (f) { return f.type === 'tankcheck'; });
    var rows = [];
    all.forEach(function (c, i) {
      var prev = i > 0 ? all[i - 1] : null;
      var start = prev ? { date: prev.date, liters: U.num(prev.liters) } : { date: null, liters: 0 };
      var inn = 0, o = 0, dr = 0;
      DB.data.fuel.forEach(function (f) {
        if (f.date > c.date) return;
        if (start.date && f.date <= start.date) return;
        if (f.type === 'intake') inn += U.num(f.liters);
        if (f.type === 'fill' && f.source === 'tank') o += U.num(f.liters);
        if (f.type === 'drain' && !f.unitId) dr += U.num(f.liters);
      });
      var expected = start.liters + inn - o - dr;
      rows.push({ id: c.id, date: c.date, found: U.num(c.liters), expected: expected,
        deviation: U.num(c.liters) - expected, hasBase: !!prev, note: c.note || '' });
    });

    return {
      left: left, base: base, intake: intake, out: out, drained: drained,
      volume: vol, pct: vol > 0 ? Math.max(0, Math.min(1, left / vol)) : null,
      checks: rows, lastCheck: rows[rows.length - 1] || null,
      deviationTotal: rows.reduce(function (a, c) { return a + (c.hasBase ? c.deviation : 0); }, 0)
    };
  };

  /* ---------- весь парк за период ---------- */
  CALC.fleet = function (from, to) {
    var units = DB.data.units;
    var res = {
      from: from, to: to,
      filled: 0, money: 0, norm: 0, over: 0, deviation: 0, drained: 0, lost: 0,
      workHours: 0, workKm: 0, shiftDays: 0, fillCount: 0,
      intake: 0, intakeMoney: 0, serviceCost: 0,
      rows: [], problems: [], serviceSoon: [], serviceOverdue: [], idle: [], leaks: []
    };
    units.forEach(function (u) {
      var p = CALC.unitPeriod(u, from, to);
      res.rows.push(p);
      res.filled += p.filled;
      res.money += p.money;
      res.norm += p.norm;
      res.deviation += p.deviation;
      res.drained += p.drained;
      res.lost += p.lost;
      res.fillCount += p.fillCount;
      CALC.leaks(u, from, to).forEach(function (l) {
        res.leaks.push({ unit: u, leak: l });
      });
      res.shiftDays += p.days;
      res.serviceCost += p.serviceCost;
      if (u.meter === 'km') res.workKm += p.work; else res.workHours += p.work;
      if (p.problem) res.problems.push(p);

      var st = CALC.unitState(u);
      if (u.active !== false) {
        if (st.service.overdue) res.serviceOverdue.push(st);
        else if (st.service.soon) res.serviceSoon.push(st);
        if (st.idleDays != null && st.idleDays > 7) res.idle.push(st);
      }
    });
    res.over = res.filled - res.norm;
    DB.data.fuel.forEach(function (f) {
      if (f.type === 'intake' && CALC.inRange(f.date, from, to)) {
        res.intake += U.num(f.liters);
        res.intakeMoney += U.num(f.sum);
      }
    });
    res.leaks.sort(function (a, b) { return a.leak.date < b.leak.date ? 1 : -1; });
    res.problems.sort(function (a, b) { return b.problemLiters - a.problemLiters; });
    res.serviceOverdue.sort(function (a, b) { return a.service.left - b.service.left; });
    res.serviceSoon.sort(function (a, b) { return a.service.left - b.service.left; });
    return res;
  };

  /* ---------- помесячно ---------- */
  CALC.byMonth = function () {
    var m = {};
    var get = function (k) {
      return m[k] || (m[k] = { filled: 0, money: 0, intake: 0, intakeMoney: 0,
        workHours: 0, workKm: 0, norm: 0, deviation: 0, drained: 0, serviceCost: 0 });
    };
    DB.data.fuel.forEach(function (f) {
      var k = U.monthKey(f.date);
      if (f.type === 'fill') { get(k).filled += U.num(f.liters); get(k).money += U.num(f.sum); }
      if (f.type === 'intake') { get(k).intake += U.num(f.liters); get(k).intakeMoney += U.num(f.sum); }
      if (f.type === 'drain') get(k).drained += U.num(f.liters);
    });
    DB.data.shifts.forEach(function (s) {
      var u = DB.unit(s.unitId);
      if (!u) return;
      var k = U.monthKey(s.date), wk = CALC.shiftWork(s);
      if (u.meter === 'km') get(k).workKm += wk; else get(k).workHours += wk;
      get(k).norm += CALC.normFor(u, wk);
    });
    DB.data.units.forEach(function (u) {
      CALC.checks(u).forEach(function (c) {
        if (c.hasBase) get(U.monthKey(c.date)).deviation += c.deviation;
      });
    });
    DB.data.services.forEach(function (s) { get(U.monthKey(s.date)).serviceCost += U.num(s.sum); });
    return m;
  };

  /* ---------- по водителям ---------- */
  CALC.byDriver = function (from, to) {
    var map = {};
    var get = function (id) {
      return map[id] || (map[id] = { id: id, shifts: 0, workHours: 0, workKm: 0,
        norm: 0, filled: 0, money: 0, units: {} });
    };
    DB.data.shifts.forEach(function (s) {
      if (!CALC.inRange(s.date, from, to)) return;
      var u = DB.unit(s.unitId);
      if (!u) return;
      var r = get(s.driverId || '—'), wk = CALC.shiftWork(s);
      r.shifts++;
      if (u.meter === 'km') r.workKm += wk; else r.workHours += wk;
      r.norm += CALC.normFor(u, wk);
      r.units[u.id] = 1;
    });
    DB.data.fuel.forEach(function (f) {
      if (f.type !== 'fill' || !CALC.inRange(f.date, from, to)) return;
      var r = get(f.driverId || '—');
      r.filled += U.num(f.liters);
      r.money += U.num(f.sum);
    });
    return Object.keys(map).map(function (id) {
      var r = map[id];
      r.over = r.filled - r.norm;
      r.unitCount = Object.keys(r.units).length;
      r.name = id === '—' ? 'Без водителя' : (DB.driverName(id) || 'Удалён');
      return r;
    }).sort(function (a, b) { return b.norm - a.norm; });
  };

  /* ---------- по объектам ---------- */
  CALC.bySite = function (from, to) {
    var map = {};
    DB.data.shifts.forEach(function (s) {
      if (!CALC.inRange(s.date, from, to)) return;
      var u = DB.unit(s.unitId);
      if (!u) return;
      var name = String(s.site || '').trim() || 'Без объекта';
      var r = map[name] || (map[name] = { name: name, shifts: 0, workHours: 0, workKm: 0, norm: 0, units: {} });
      var wk = CALC.shiftWork(s);
      r.shifts++;
      if (u.meter === 'km') r.workKm += wk; else r.workHours += wk;
      r.norm += CALC.normFor(u, wk);
      r.units[u.id] = 1;
    });
    return Object.keys(map).map(function (k) {
      map[k].unitCount = Object.keys(map[k].units).length;
      return map[k];
    }).sort(function (a, b) { return b.norm - a.norm; });
  };

  /* ---------- лента операций ---------- */
  CALC.feed = function (limit, unitId) {
    var out = [];
    DB.data.fuel.forEach(function (f) {
      if (unitId && f.unitId !== unitId) return;
      out.push({ kind: 'fuel', date: f.date, op: f });
    });
    DB.data.shifts.forEach(function (s) {
      if (unitId && s.unitId !== unitId) return;
      out.push({ kind: 'shift', date: s.date, op: s });
    });
    DB.data.services.forEach(function (s) {
      if (unitId && s.unitId !== unitId) return;
      out.push({ kind: 'service', date: s.date, op: s });
    });
    out.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.op.id || '') < (a.op.id || '') ? -1 : 1;
    });
    return limit ? out.slice(0, limit) : out;
  };

  w.CALC = CALC;
})(window);
