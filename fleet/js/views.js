/* Экраны: Обзор, Техника, Журнал, Ещё, Отчёты, Водители, Склад */
(function (w) {
  'use strict';

  var esc = U.esc, V = {};

  /* ============ иконки ============ */
  V.ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4.2-5.4"/><path d="M4 18h16"/></svg>',
    units: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 16V7.5h10V16"/><path d="M12.5 10.5H16l3.5 3.2V16"/><circle cx="7" cy="16.6" r="1.9"/><circle cx="16.5" cy="16.6" r="1.9"/><path d="M8.9 16.6h5.7"/></svg>',
    log: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 3.5h9a1 1 0 0 1 1 1v16h-10a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z"/><path d="M14.5 9h3.2l2.3 2.3V19a1.5 1.5 0 0 1-3 0v-1.5"/><path d="M7 7.5h4M7 11h4M7 14.5h4"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.2"/><path d="M8 12h.01M12 12h.01M16 12h.01"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4 7 12l8 8"/></svg>',
    chev: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4l8 8-8 8"/></svg>'
  };

  /* ============ общие кусочки ============ */
  V.unitIcon = function (u) {
    var k = DB.kind(u.kind);
    return '<div class="avatar sq" style="background:' + U.color(u.name) + '">' + k.ic + '</div>';
  };
  V.avatar = function (name) {
    return '<div class="avatar" style="background:' + U.color(name) + '">' + esc(U.initials(name)) + '</div>';
  };

  V.empty = function (ic, t, d, btn) {
    return '<div class="empty"><div class="ic">' + ic + '</div><div class="t">' + esc(t) + '</div>' +
      '<div class="d">' + d + '</div>' + (btn || '') + '</div>';
  };

  V.topbar = function (title, right) {
    return '<div class="topbar" id="topbar"><span class="tb-btn" style="visibility:hidden">' + V.ICON.back + '</span>' +
      '<span class="tb-title">' + esc(title) + '</span>' +
      '<span class="tb-btn right">' + (right || '') + '</span></div>';
  };
  V.topbarBack = function (title, right) {
    return '<div class="topbar" id="topbar"><button class="tb-btn" data-act="back">' + V.ICON.back + '</button>' +
      '<span class="tb-title">' + esc(title) + '</span>' +
      '<span class="tb-btn right">' + (right || '') + '</span></div>';
  };

  V.kv = function (k, v, cls) {
    return '<div class="kv' + (cls ? ' ' + cls : '') + '"><span class="k">' + k +
      '</span><span class="v num">' + v + '</span></div>';
  };

  /* бейдж состояния техники */
  V.unitBadge = function (u, p) {
    var st = CALC.unitState(u);
    if (u.active === false) return '<span class="badge">В простое</span>';
    if (p && p.problem) return '<span class="badge bad">Недостача ' + U.liters(p.problemLiters) + '</span>';
    if (st.service.overdue) return '<span class="badge bad">ТО просрочено</span>';
    if (st.service.soon) return '<span class="badge warn">ТО через ' + U.work(st.service.left, u.meter) + '</span>';
    if (st.tankOverflow) return '<span class="badge warn">Залито больше бака</span>';
    if (st.tankNegative) return '<span class="badge warn">Топливо не проведено</span>';
    if (st.idleDays != null && st.idleDays > 7) return '<span class="badge">Без смен ' + U.days(st.idleDays) + '</span>';
    return '';
  };

  V.unitRow = function (u, from, to) {
    var p = CALC.unitPeriod(u, from, to);
    var st = CALC.unitState(u);
    var b = V.unitBadge(u, p);
    var sub = (u.plate ? esc(u.plate) + ' · ' : '') + U.work(p.work, u.meter) + ' за месяц';
    return '<button class="row tap" data-act="unit" data-id="' + u.id + '">' +
      V.unitIcon(u) +
      '<span class="grow"><span class="ttl">' + esc(u.name) + '</span>' +
      '<span class="sub">' + (b ? b + ' ' : '') + sub + '</span></span>' +
      '<span class="val"><span class="v1 num">' + U.liters(p.filled) + '</span>' +
      '<span class="v2">' + (U.num(u.tank) > 0 ? 'в баке ' + U.liters(st.tankLeft) : 'залито за месяц') + '</span></span>' +
      '<span class="chev">' + V.ICON.chev + '</span></button>';
  };

  /* строка операции в журнале */
  V.opRow = function (x, opt) {
    opt = opt || {};
    var op = x.op, u = DB.unit(op.unitId);
    var name = u ? u.name : (x.kind === 'fuel' && op.type === 'intake' ? 'Приход на склад'
      : x.kind === 'fuel' && op.type === 'tankcheck' ? 'Замер склада' : 'Техника удалена');
    var act = 'op-' + x.kind, right = '', sub = '', ttl = name, ic = '';

    if (x.kind === 'fuel') {
      if (op.type === 'fill') {
        ic = '⛽';
        sub = 'заправка · ' + (op.source === 'tank' ? esc(DB.data.settings.tankName) : 'АЗС') +
          (op.driverId ? ' · ' + esc(DB.driverName(op.driverId)) : '');
        right = '<span class="v1 num">' + U.liters(op.liters) + '</span>' +
          '<span class="v2">' + (U.num(op.sum) ? U.moneyShort(op.sum) : U.fmtDate(op.date)) + '</span>';
      } else if (op.type === 'intake') {
        ic = '🛢️';
        ttl = 'Приход топлива';
        sub = 'на склад' + (op.note ? ' · ' + esc(op.note) : '');
        right = '<span class="v1 num" style="color:var(--accent)">+' + U.liters(op.liters) + '</span>' +
          '<span class="v2">' + (U.num(op.sum) ? U.moneyShort(op.sum) : U.fmtDate(op.date)) + '</span>';
      } else if (op.type === 'check') {
        ic = '📏';
        var c = null;
        if (u) c = CALC.checks(u).filter(function (z) { return z.id === op.id; })[0];
        sub = 'замер бака' + (c && c.hasBase
          ? ' · ' + (c.deviation < 0 ? '<b style="color:var(--red)">недостача ' + U.liters(-c.deviation) + '</b>'
            : 'сходится') : ' · точка отсчёта');
        right = '<span class="v1 num">' + U.liters(op.liters) + '</span><span class="v2">в баке</span>';
      } else {
        ic = '📏';
        ttl = 'Замер склада';
        var tc = CALC.tankState().checks.filter(function (z) { return z.id === op.id; })[0];
        sub = tc && tc.hasBase
          ? (tc.deviation < -0.5 ? '<b style="color:var(--red)">недостача ' + U.liters(-tc.deviation) + '</b>' : 'сходится')
          : 'точка отсчёта';
        right = '<span class="v1 num">' + U.liters(op.liters) + '</span><span class="v2">в ёмкости</span>';
      }
    } else if (x.kind === 'shift') {
      ic = '🕒';
      var wk = CALC.shiftWork(op);
      sub = 'смена' + (op.site ? ' · ' + esc(op.site) : '') +
        (op.driverId ? ' · ' + esc(DB.driverName(op.driverId)) : '');
      right = '<span class="v1 num">' + U.work(wk, u ? u.meter : 'hours') + '</span>' +
        '<span class="v2">по норме ' + U.liters(u ? CALC.normFor(u, wk) : 0) + '</span>';
    } else {
      ic = op.kind === 'to' ? '🔧' : '🛠️';
      sub = (op.kind === 'to' ? 'ТО' : 'ремонт') + (op.note ? ' · ' + esc(op.note) : '');
      right = '<span class="v1 num">' + (U.num(op.sum) ? U.moneyShort(op.sum) : '—') + '</span>' +
        '<span class="v2">' + (op.meter != null ? U.work(op.meter, u ? u.meter : 'hours') : '') + '</span>';
    }

    return '<button class="row tap" data-act="' + act + '" data-id="' + op.id + '">' +
      '<span class="op-ic">' + ic + '</span>' +
      '<span class="grow"><span class="ttl">' + (opt.hideUnit ? U.fmtDate(op.date, true) : esc(ttl)) + '</span>' +
      '<span class="sub">' + (opt.hideUnit ? sub : U.fmtDate(op.date) + ' · ' + sub) + '</span></span>' +
      '<span class="val">' + right + '</span></button>';
  };

  /* ============ ОБЗОР ============ */
  V.home = function () {
    var units = DB.units();
    var from = U.monthStart(U.today()), to = U.today();
    var f = CALC.fleet(from, to);
    var tank = CALC.tankState();
    var st = DB.data.settings;

    var h = V.topbar('Обзор', '<button data-act="add-menu" style="font-size:26px;font-weight:300">＋</button>');
    h += '<div class="wrap"><h1 class="big">Обзор</h1>';

    if (DB.data.isDemo && units.length) {
      h += '<div class="card pad warnbox">' +
        '<div class="t">Это демонстрационные данные</div>' +
        '<div class="d">Вымышленная техника, смены и заправки — чтобы посмотреть, как всё считается. ' +
        'Очистите их перед тем, как заносить своё.</div>' +
        '<button class="btn sec sm full" data-act="demo-off">Очистить и начать с нуля</button></div>';
    }

    if (!units.length) {
      h += V.empty('🚜', 'Автопарк пока пуст',
        'Заведите технику — и приложение начнёт считать расход топлива по норме, ловить перерасход и напоминать про ТО.',
        '<div style="margin-top:18px"><button class="btn" data-act="new-unit">Добавить технику</button>' +
        '<button class="btn sec" style="margin-top:8px" data-act="import">Загрузить из таблицы</button>' +
        '<button class="btn ghost" style="margin-top:8px" data-act="demo">Посмотреть на примере</button></div>');
      return h + '</div>';
    }

    h += '<div class="hero">' +
      '<div class="lbl">Топливо за ' + U.monthName(U.monthKey(to), true).toLowerCase() + '</div>' +
      '<div class="amt num">' + U.liters(f.filled) + '</div>' +
      '<div class="delta">' + U.money(f.money) + ' · ' +
      U.cnt(f.fillCount, 'заправка', 'заправки', 'заправок') + '</div>' +
      '<div class="delta">по норме ' + U.liters(f.norm) + ' на ' +
      (f.workHours ? U.work(f.workHours, 'hours') : '') +
      (f.workHours && f.workKm ? ' и ' : '') + (f.workKm ? U.work(f.workKm, 'km') : '') +
      (!f.workHours && !f.workKm ? 'нулевой наработке' : ' наработки') + '</div>' +
      '</div>';

    /* перерасход — главная причина, ради которой всё это заводится */
    if (f.problems.length) {
      var lost = f.problems.reduce(function (a, p) { return a + p.problemLiters; }, 0);
      var price = st.price || 0;
      h += '<div class="card pad badbox">' +
        '<div class="t">Перерасход: ' + U.liters(lost) + '</div>' +
        '<div class="d">' + U.cnt(f.problems.length, 'единица', 'единицы', 'единиц') + ' техники расходует больше нормы' +
        (price ? '. Это примерно <b>' + U.money(lost * price) + '</b> за месяц' : '') + '.</div>' +
        '<div class="minilist">' +
        f.problems.slice(0, 4).map(function (p) {
          return '<button class="mini tap" data-act="unit" data-id="' + p.unit.id + '">' +
            '<span>' + esc(p.unit.name) + '</span><b>' + U.liters(p.problemLiters) + '</b></button>';
        }).join('') + '</div></div>';
    }

    h += '<div class="stats">' +
      '<div class="stat"><div class="k"><span class="dot" style="background:var(--blue)"></span>Наработка</div>' +
      '<div class="v num">' + (f.workHours ? U.work(f.workHours, 'hours') : U.work(f.workKm, 'km')) + '</div>' +
      '<div class="k" style="margin-top:2px">' +
      (f.workHours && f.workKm ? 'и ' + U.work(f.workKm, 'km') : U.cnt(f.shiftDays, 'смена', 'смены', 'смен')) + '</div></div>' +

      '<div class="stat"><div class="k"><span class="dot" style="background:' + (f.deviation < -1 ? 'var(--red)' : 'var(--accent)') + '"></span>' +
      (f.deviation ? 'По замерам' : 'Сверх нормы') + '</div>' +
      '<div class="v num" style="color:' + ((f.deviation < -1 || (!f.deviation && f.over > 0)) ? 'var(--red)' : 'var(--accent)') + '">' +
      (f.deviation ? U.liters(f.deviation, { sign: true }) : U.liters(f.over, { sign: true })) + '</div>' +
      '<div class="k" style="margin-top:2px">' + (f.deviation ? 'недостача в баках' : 'залито минус норма') + '</div></div>' +

      '<div class="stat"><div class="k"><span class="dot" style="background:var(--violet)"></span>Склад ГСМ</div>' +
      '<div class="v num">' + U.liters(tank.left) + '</div>' +
      '<div class="k" style="margin-top:2px">' + (tank.volume > 0
        ? Math.round(tank.left / tank.volume * 100) + '% ёмкости' : 'остаток в ёмкости') + '</div></div>' +

      '<div class="stat"><div class="k"><span class="dot" style="background:var(--orange)"></span>Нужно ТО</div>' +
      '<div class="v num" style="color:' + (f.serviceOverdue.length ? 'var(--red)' : 'inherit') + '">' +
      (f.serviceOverdue.length + f.serviceSoon.length || '—') + '</div>' +
      '<div class="k" style="margin-top:2px">' + (f.serviceOverdue.length ? f.serviceOverdue.length + ' просрочено' : 'из ' + units.length + ' единиц') + '</div></div>' +
      '</div>';

    h += '<div class="btn-row"><button class="btn" data-act="new-fill">⛽ Заправка</button>' +
      '<button class="btn sec" data-act="new-shift">🕒 Смена</button></div>';

    if (f.serviceOverdue.length || f.serviceSoon.length) {
      h += '<h2 class="sec">Обслуживание</h2><div class="list">';
      f.serviceOverdue.concat(f.serviceSoon).slice(0, 6).forEach(function (s) {
        var u = s.unit;
        h += '<button class="row tap" data-act="unit" data-id="' + u.id + '">' + V.unitIcon(u) +
          '<span class="grow"><span class="ttl">' + esc(u.name) + '</span>' +
          '<span class="sub">' + (s.service.overdue
            ? '<b style="color:var(--red)">переработано ' + U.work(-s.service.left, u.meter) + '</b>'
            : 'осталось ' + U.work(s.service.left, u.meter)) +
          ' · каждые ' + U.work(s.service.every, u.meter) + '</span></span>' +
          '<span class="val"><span class="v1 num">' + U.work(s.meterNow, u.meter) + '</span>' +
          '<span class="v2">счётчик</span></span>' +
          '<span class="chev">' + V.ICON.chev + '</span></button>';
      });
      h += '</div>';
    }

    var feed = CALC.feed(6);
    if (feed.length) {
      h += '<h2 class="sec">Последние записи<button class="act" data-act="go-log">Весь журнал</button></h2><div class="list">';
      feed.forEach(function (x) { h += V.opRow(x); });
      h += '</div>';
    }

    if (!st.lastExport || U.diffDays(st.lastExport, U.today()) > 14) {
      h += '<div class="card pad" style="margin-top:22px">' +
        '<div style="font-weight:600;margin-bottom:4px">Сделайте резервную копию</div>' +
        '<div style="font-size:14px;color:var(--text-2);line-height:1.4">База хранится только на этом телефоне. ' +
        'Сохраните файл копии в «Файлы» или отправьте себе — тогда данные не пропадут при смене телефона.</div>' +
        '<button class="btn sec sm full" style="margin-top:12px" data-act="export-json">Сохранить копию</button></div>';
    }

    return h + '</div>';
  };

  /* ============ ТЕХНИКА ============ */
  V.unitsFilter = 'all';
  V.unitsQuery = '';

  V.units = function () {
    var all = DB.units();
    var from = U.monthStart(U.today()), to = U.today();
    var over = all.filter(function (u) { return CALC.unitPeriod(u, from, to).problem; });
    var serv = all.filter(function (u) {
      var s = CALC.unitState(u).service;
      return s.overdue || s.soon;
    });
    var work = all.filter(function (u) { return u.active !== false; });

    var list = V.unitsFilter === 'over' ? over : V.unitsFilter === 'service' ? serv :
      V.unitsFilter === 'work' ? work : all;

    var q = V.unitsQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(function (u) {
        return (u.name + ' ' + (u.plate || '') + ' ' + (u.note || '')).toLowerCase().indexOf(q) >= 0;
      });
    }
    list = list.slice().sort(function (a, b) {
      var pa = CALC.unitPeriod(a, from, to), pb = CALC.unitPeriod(b, from, to);
      if (pa.problem !== pb.problem) return pa.problem ? -1 : 1;
      return a.name.localeCompare(b.name, 'ru');
    });

    var h = V.topbar('Техника', '<button data-act="new-unit" style="font-size:26px;font-weight:300">＋</button>');
    h += '<div class="wrap"><h1 class="big">Техника</h1>';

    if (!all.length) {
      h += V.empty('🚜', 'Техники пока нет',
        'Добавьте первую единицу: название, норма расхода и объём бака — этого достаточно, чтобы начать.',
        '<div style="margin-top:18px"><button class="btn" data-act="new-unit">Добавить технику</button></div>');
      return h + '</div>';
    }

    if (all.length > 5) {
      h += '<div class="search">' + V.ICON.search +
        '<input id="qu" type="search" placeholder="Название, госномер" value="' + esc(V.unitsQuery) + '" autocomplete="off"></div>';
    }
    h += '<div class="seg">' +
      seg('all', 'Вся', all.length) +
      seg('work', 'В работе', work.length) +
      seg('over', 'Перерасход', over.length) +
      seg('service', 'ТО', serv.length) + '</div>';

    if (!list.length) {
      h += V.empty('🔍', 'Ничего не найдено', q ? 'Попробуйте другой запрос.' : 'В этой вкладке пусто — и это хорошо.');
    } else {
      h += '<div class="list">';
      list.forEach(function (u) { h += V.unitRow(u, from, to); });
      h += '</div>';
      h += '<div class="hint">Цифра справа — сколько залито за ' + U.monthName(U.monthKey(to), true).toLowerCase() + '.</div>';
    }
    return h + '</div>';

    function seg(k, t, n) {
      return '<button data-act="ufilter" data-f="' + k + '" class="' + (V.unitsFilter === k ? 'on' : '') + '">' +
        t + (n ? ' <span class="cnt">' + n + '</span>' : '') + '</button>';
    }
  };

  /* ============ ЖУРНАЛ ============ */
  V.logFilter = 'all';
  V.logQuery = '';
  V.logLimit = 60;

  V.log = function () {
    var feed = CALC.feed();
    var f = V.logFilter;
    if (f !== 'all') {
      feed = feed.filter(function (x) {
        if (f === 'fill') return x.kind === 'fuel' && (x.op.type === 'fill');
        if (f === 'shift') return x.kind === 'shift';
        if (f === 'tank') return x.kind === 'fuel' && (x.op.type === 'intake' || x.op.type === 'tankcheck');
        if (f === 'service') return x.kind === 'service';
        return true;
      });
    }
    var q = V.logQuery.trim().toLowerCase();
    if (q) {
      feed = feed.filter(function (x) {
        var u = DB.unit(x.op.unitId);
        var s = [u ? u.name : '', u ? u.plate : '', DB.driverName(x.op.driverId),
          x.op.note || '', x.op.site || '', x.op.date].join(' ').toLowerCase();
        return s.indexOf(q) >= 0;
      });
    }

    var h = V.topbar('Журнал', '<button data-act="add-menu" style="font-size:26px;font-weight:300">＋</button>');
    h += '<div class="wrap"><h1 class="big">Журнал</h1>';
    h += '<div class="search">' + V.ICON.search +
      '<input id="ql" type="search" placeholder="Техника, водитель, объект" value="' + esc(V.logQuery) + '" autocomplete="off"></div>';
    h += '<div class="seg">' + sg('all', 'Всё') + sg('fill', 'Заправки') + sg('shift', 'Смены') +
      sg('tank', 'Склад') + sg('service', 'ТО') + '</div>';

    if (!feed.length) {
      h += V.empty('📋', 'Записей нет',
        q ? 'Попробуйте другой запрос.' : 'Внесите первую заправку или смену — они появятся здесь.',
        q ? '' : '<div style="margin-top:18px"><button class="btn" data-act="new-fill">Внести заправку</button>' +
        '<button class="btn sec" style="margin-top:8px" data-act="new-shift">Внести смену</button></div>');
      return h + '</div>';
    }

    /* группировка по месяцам с итогом сверху */
    var groups = {}, order = [];
    feed.slice(0, V.logLimit).forEach(function (x) {
      var k = U.monthKey(x.date);
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(x);
    });
    var byM = CALC.byMonth();
    order.forEach(function (k) {
      var m = byM[k] || {};
      var parts = [];
      if (m.filled) parts.push('залито ' + U.liters(m.filled));
      if (m.workHours) parts.push(U.work(m.workHours, 'hours'));
      if (m.workKm) parts.push(U.work(m.workKm, 'km'));
      h += '<h2 class="sec">' + esc(U.monthName(k)) +
        (parts.length ? '<span class="act" style="color:var(--text-2)">' + parts.join(' · ') + '</span>' : '') + '</h2>';
      h += '<div class="list">';
      groups[k].forEach(function (x) { h += V.opRow(x); });
      h += '</div>';
    });
    if (feed.length > V.logLimit) {
      h += '<button class="btn sec" style="margin-top:14px" data-act="log-more">Показать ещё · осталось ' +
        (feed.length - V.logLimit) + '</button>';
    }
    return h + '</div>';

    function sg(k, t) {
      return '<button data-act="lfilter" data-f="' + k + '" class="' + (V.logFilter === k ? 'on' : '') + '">' + t + '</button>';
    }
  };

  /* ============ СКЛАД ГСМ ============ */
  V.tank = function () {
    var st = DB.data.settings;
    var t = CALC.tankState();
    var from = U.monthStart(U.today()), to = U.today();
    var f = CALC.fleet(from, to);

    var h = V.topbarBack('Склад ГСМ');
    h += '<div class="wrap"><h1 class="big">Склад ГСМ</h1>';
    h += '<div class="hero">' +
      '<div class="lbl">' + esc(st.tankName || 'Ёмкость') + ' · остаток по расчёту</div>' +
      '<div class="amt num">' + U.liters(t.left) + '</div>' +
      (t.volume > 0 ? '<div class="delta">' + Math.round(t.left / t.volume * 100) + '% от ' + U.liters(t.volume) + '</div>' +
        '<div class="bar"><i style="width:' + Math.round((t.pct || 0) * 100) + '%"></i></div>' : '') +
      '</div>';

    h += '<div class="btn-row"><button class="btn" data-act="new-intake">Приход топлива</button>' +
      '<button class="btn sec" data-act="new-tankcheck">Замер остатка</button></div>';

    h += '<h2 class="sec">За ' + U.monthName(U.monthKey(to), true).toLowerCase() + '</h2><div class="card pad">' +
      V.kv('Пришло на склад', U.liters(f.intake)) +
      V.kv('Выдано в технику', U.liters(f.rows.reduce(function (a, r) { return a + r.filledTank; }, 0))) +
      V.kv('Заправлено на АЗС', U.liters(f.rows.reduce(function (a, r) { return a + r.filledAzs; }, 0))) +
      V.kv('Куплено топлива на', U.money(f.intakeMoney)) +
      '</div>';

    if (t.checks.length) {
      h += '<h2 class="sec">Замеры в ёмкости</h2><div class="list">';
      t.checks.slice().reverse().forEach(function (c) {
        h += '<button class="row tap" data-act="op-fuel" data-id="' + c.id + '">' +
          '<span class="op-ic">📏</span><span class="grow"><span class="ttl">' + U.fmtDate(c.date, true) + '</span>' +
          '<span class="sub">' + (c.hasBase
            ? (c.deviation < -0.5 ? '<b style="color:var(--red)">недостача ' + U.liters(-c.deviation) + '</b>'
              : c.deviation > 0.5 ? 'излишек ' + U.liters(c.deviation) : 'сходится')
            : 'точка отсчёта') + '</span></span>' +
          '<span class="val"><span class="v1 num">' + U.liters(c.found) + '</span>' +
          '<span class="v2">по расчёту ' + U.liters(c.expected) + '</span></span></button>';
      });
      h += '</div>';
      h += '<div class="hint">Замер — это точка опоры: после него расчёт начинается заново от реального остатка. ' +
        'Разница между замером и расчётом и есть недостача.</div>';
    } else {
      h += '<div class="hint">Сделайте замер остатка в ёмкости — тогда приложение сможет показывать недостачу на складе.</div>';
    }

    var ops = CALC.feed().filter(function (x) {
      return x.kind === 'fuel' && (x.op.type === 'intake' || x.op.type === 'tankcheck' ||
        (x.op.type === 'fill' && x.op.source === 'tank'));
    }).slice(0, 30);
    if (ops.length) {
      h += '<h2 class="sec">Движение топлива</h2><div class="list">';
      ops.forEach(function (x) { h += V.opRow(x); });
      h += '</div>';
    }
    return h + '</div>';
  };

  /* ============ ВОДИТЕЛИ ============ */
  V.drivers = function () {
    var from = U.monthStart(U.today()), to = U.today();
    var rows = CALC.byDriver(from, to);
    var map = {};
    rows.forEach(function (r) { map[r.id] = r; });

    var h = V.topbarBack('Водители', '<button data-act="new-driver" style="font-size:26px;font-weight:300">＋</button>');
    h += '<div class="wrap"><h1 class="big">Водители</h1>';
    var list = DB.drivers();
    if (!list.length) {
      h += V.empty('👷', 'Список пуст',
        'Водитель создаётся сам, когда вы вписываете его в смену или заправку — или добавьте вручную.',
        '<div style="margin-top:18px"><button class="btn" data-act="new-driver">Добавить водителя</button></div>');
      return h + '</div>';
    }
    h += '<div class="list">';
    list.slice().sort(function (a, b) {
      var ra = map[a.id] || { norm: 0 }, rb = map[b.id] || { norm: 0 };
      return rb.norm - ra.norm;
    }).forEach(function (d) {
      var r = map[d.id] || { shifts: 0, workHours: 0, workKm: 0, filled: 0 };
      var wk = [];
      if (r.workHours) wk.push(U.work(r.workHours, 'hours'));
      if (r.workKm) wk.push(U.work(r.workKm, 'km'));
      h += '<button class="row tap" data-act="driver" data-id="' + d.id + '">' + V.avatar(d.name) +
        '<span class="grow"><span class="ttl">' + esc(d.name) + '</span>' +
        '<span class="sub">' + (r.shifts ? U.cnt(r.shifts, 'смена', 'смены', 'смен') + ' за месяц' +
          (wk.length ? ' · ' + wk.join(' · ') : '') : (d.phone ? esc(d.phone) : 'смен за месяц нет')) + '</span></span>' +
        '<span class="val"><span class="v1 num">' + U.liters(r.filled) + '</span><span class="v2">залито</span></span>' +
        '<span class="chev">' + V.ICON.chev + '</span></button>';
    });
    h += '</div>';
    return h + '</div>';
  };

  /* ============ ОТЧЁТЫ ============ */
  V.reportMonth = null;
  V.reportTab = 'units';

  V.report = function () {
    var mk = V.reportMonth || U.monthKey(U.today());
    var from = mk + '-01', to = U.monthEnd(from);
    var f = CALC.fleet(from, to);
    var byM = CALC.byMonth();

    var h = V.topbarBack('Отчёт');
    h += '<div class="wrap"><h1 class="big">Отчёт</h1>';

    h += '<div class="monthnav"><button data-act="rep-month" data-d="-1">‹</button>' +
      '<span>' + esc(U.monthName(mk)) + '</span>' +
      '<button data-act="rep-month" data-d="1"' + (mk >= U.monthKey(U.today()) ? ' disabled' : '') + '>›</button></div>';

    h += '<div class="card pad">' +
      V.kv('Залито в технику', U.liters(f.filled), 'big') +
      V.kv('Потрачено на топливо', U.money(f.money)) +
      V.kv('По норме положено', U.liters(f.norm)) +
      V.kv('Недостача по замерам', (f.deviation < -0.5
        ? '<span style="color:var(--red)">' + U.liters(-f.deviation) + '</span>' : '—')) +
      (f.workHours ? V.kv('Наработка, моточасы', U.work(f.workHours, 'hours')) : '') +
      (f.workKm ? V.kv('Пробег', U.work(f.workKm, 'km')) : '') +
      V.kv('Пришло на склад', U.liters(f.intake)) +
      V.kv('ТО и ремонты', U.money(f.serviceCost)) +
      '</div>';

    h += '<div class="seg" style="margin-top:14px">' +
      rt('units', 'Техника') + rt('drivers', 'Водители') + rt('sites', 'Объекты') + rt('months', 'Месяцы') + '</div>';

    if (V.reportTab === 'units') {
      var rows = f.rows.slice().filter(function (r) { return r.work > 0 || r.filled > 0; })
        .sort(function (a, b) { return b.filled - a.filled; });
      if (!rows.length) h += V.empty('📊', 'За этот месяц записей нет', 'Выберите другой месяц.');
      else {
        h += '<div class="list">';
        rows.forEach(function (r) {
          var u = r.unit;
          var dev = r.checkCount ? r.deviation : null;
          h += '<button class="row tap" data-act="unit" data-id="' + u.id + '">' + V.unitIcon(u) +
            '<span class="grow"><span class="ttl">' + esc(u.name) + '</span>' +
            '<span class="sub">' + U.work(r.work, u.meter) +
            (r.actualRate ? ' · факт ' + U.normText(r.actualRate, u.meter) : ' · норма ' + U.liters(r.norm)) +
            '</span></span>' +
            '<span class="val"><span class="v1 num">' + U.liters(r.filled) + '</span>' +
            '<span class="v2"' + (r.problem ? ' style="color:var(--red)"' : '') + '>' +
            (dev != null ? (dev < -0.5 ? 'недостача ' + U.liters(-dev) : 'сходится') : U.moneyShort(r.money)) +
            '</span></span><span class="chev">' + V.ICON.chev + '</span></button>';
        });
        h += '</div>';
      }
    } else if (V.reportTab === 'drivers') {
      var dr = CALC.byDriver(from, to);
      if (!dr.length) h += V.empty('👷', 'Смен за месяц нет', 'Выберите другой месяц.');
      else {
        h += '<div class="list">';
        dr.forEach(function (r) {
          var wk = [];
          if (r.workHours) wk.push(U.work(r.workHours, 'hours'));
          if (r.workKm) wk.push(U.work(r.workKm, 'km'));
          h += '<div class="row">' + V.avatar(r.name) +
            '<span class="grow"><span class="ttl">' + esc(r.name) + '</span>' +
            '<span class="sub">' + U.cnt(r.shifts, 'смена', 'смены', 'смен') +
            (wk.length ? ' · ' + wk.join(' · ') : '') + ' · норма ' + U.liters(r.norm) + '</span></span>' +
            '<span class="val"><span class="v1 num">' + U.liters(r.filled) + '</span>' +
            '<span class="v2"' + (r.over > Math.max(15, r.norm * 0.03) ? ' style="color:var(--red)"' : '') + '>' +
            (r.filled ? U.liters(r.over, { sign: true }) + ' к норме' : 'заправок нет') + '</span></span></div>';
        });
        h += '</div>';
        h += '<div class="hint">«К норме» — разница между тем, что водитель залил, и тем, что положено по его сменам. ' +
          'Небольшой разброс — это остаток в баке, устойчивый плюс — повод проверить.</div>';
      }
    } else if (V.reportTab === 'sites') {
      var si = CALC.bySite(from, to);
      if (!si.length) h += V.empty('📍', 'Смен за месяц нет', 'Выберите другой месяц.');
      else {
        h += '<div class="list">';
        si.forEach(function (r) {
          var wk = [];
          if (r.workHours) wk.push(U.work(r.workHours, 'hours'));
          if (r.workKm) wk.push(U.work(r.workKm, 'km'));
          h += '<div class="row"><span class="op-ic">📍</span>' +
            '<span class="grow"><span class="ttl">' + esc(r.name) + '</span>' +
            '<span class="sub">' + U.cnt(r.shifts, 'смена', 'смены', 'смен') + ' · ' +
            U.cnt(r.unitCount, 'единица', 'единицы', 'единиц') + ' техники' +
            (wk.length ? ' · ' + wk.join(' · ') : '') + '</span></span>' +
            '<span class="val"><span class="v1 num">' + U.liters(r.norm) + '</span>' +
            '<span class="v2">топлива по норме</span></span></div>';
        });
        h += '</div>';
        h += '<div class="hint">Топливо распределяется по объектам пропорционально наработке техники на них — ' +
          'это готовая цифра для списания на объект.</div>';
      }
    } else {
      var keys = Object.keys(byM).sort().reverse().slice(0, 14);
      if (!keys.length) h += V.empty('📅', 'Данных пока нет', 'Внесите заправки и смены.');
      else {
        h += '<div class="list">';
        keys.forEach(function (k) {
          var m = byM[k];
          var wk = [];
          if (m.workHours) wk.push(U.work(m.workHours, 'hours'));
          if (m.workKm) wk.push(U.work(m.workKm, 'km'));
          h += '<button class="row tap" data-act="rep-goto" data-m="' + k + '">' +
            '<span class="grow"><span class="ttl">' + esc(U.monthName(k)) + '</span>' +
            '<span class="sub">' + (wk.join(' · ') || 'смен не было') +
            (m.deviation < -0.5 ? ' · <b style="color:var(--red)">недостача ' + U.liters(-m.deviation) + '</b>' : '') +
            '</span></span>' +
            '<span class="val"><span class="v1 num">' + U.liters(m.filled) + '</span>' +
            '<span class="v2">' + U.moneyShort(m.money) + '</span></span></button>';
        });
        h += '</div>';
      }
    }

    h += '<div class="btn-row" style="margin-top:16px">' +
      '<button class="btn sec" data-act="export-report" data-from="' + from + '" data-to="' + to + '">Выгрузить в Excel</button></div>';
    return h + '</div>';

    function rt(k, t) {
      return '<button data-act="rep-tab" data-t="' + k + '" class="' + (V.reportTab === k ? 'on' : '') + '">' + t + '</button>';
    }
  };

  /* ============ ЕЩЁ ============ */
  V.more = function () {
    var st = DB.data.settings;
    var from = U.monthStart(U.today()), to = U.today();
    var f = CALC.fleet(from, to);

    var h = V.topbar('Ещё');
    h += '<div class="wrap"><h1 class="big">Ещё</h1>';

    h += '<div class="card pad">' +
      V.kv('Топлива за месяц', U.liters(f.filled), 'big') +
      V.kv('Денег за месяц', U.money(f.money)) +
      V.kv('Единиц техники', String(DB.units().length)) +
      V.kv('Водителей', String(DB.drivers().length)) +
      '</div>';

    h += '<h2 class="sec">Разделы</h2><div class="list">' +
      rowBtn('go-report', '📊', 'Отчёты', 'по технике, водителям, объектам и месяцам') +
      rowBtn('go-tank', '🛢️', 'Склад ГСМ', 'приход, выдача, замеры остатка') +
      rowBtn('go-drivers', '👷', 'Водители', U.cnt(DB.drivers().length, 'человек', 'человека', 'человек')) +
      '</div>';

    h += '<h2 class="sec">Настройки</h2><div class="list">' +
      '<div class="field"><label>Валюта</label><input type="text" value="' + esc(st.currency) +
      '" data-act="set" data-k="currency" maxlength="6"></div>' +
      '<div class="field"><label>Цена литра</label><input type="text" inputmode="decimal" value="' +
      (st.price || '') + '" placeholder="0" data-act="set" data-k="price"><span class="unit">' + esc(st.currency) + '</span></div>' +
      '<div class="field"><label>Топливо</label><select data-act="set" data-k="fuel">' +
      DB.FUELS.map(function (x) {
        return '<option value="' + esc(x) + '"' + (st.fuel === x ? ' selected' : '') + '>' + esc(x) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>Ёмкость</label><input type="text" value="' + esc(st.tankName) +
      '" data-act="set" data-k="tankName"></div>' +
      '<div class="field"><label>Объём ёмкости</label><input type="text" inputmode="decimal" value="' +
      (st.tankVolume || '') + '" placeholder="0" data-act="set" data-k="tankVolume"><span class="unit">л</span></div>' +
      '<div class="field"><label>Предупредить о ТО</label><input type="text" inputmode="decimal" value="' +
      st.serviceWarnPct + '" data-act="set" data-k="serviceWarnPct"><span class="unit">% до срока</span></div>' +
      '<div class="field"><label>Оформление</label><select data-act="set" data-k="theme">' +
      [['auto', 'Как в системе'], ['light', 'Светлое'], ['dark', 'Тёмное']].map(function (t) {
        return '<option value="' + t[0] + '"' + (st.theme === t[0] ? ' selected' : '') + '>' + t[1] + '</option>';
      }).join('') + '</select></div>' +
      '</div><div class="hint">Цена литра и вид топлива подставляются в новую заправку — в самой заправке их можно поменять.</div>';

    h += '<h2 class="sec">Защита</h2><div class="list">' +
      '<button class="row tap" data-act="pin">' +
      '<span class="grow"><span class="ttl">Код-пароль</span><span class="sub">' +
      (st.pin ? 'включён — спрашивается при запуске' : 'выключен') + '</span></span>' +
      '<span class="val"><span class="v1" style="color:var(--accent);font-size:15px">' +
      (st.pin ? 'Изменить' : 'Включить') + '</span></span></button>' +
      (st.pin ? '<button class="row tap" data-act="pin-off"><span class="grow"><span class="ttl" style="color:var(--red)">Отключить код</span></span></button>' : '') +
      '</div>';

    h += '<h2 class="sec">Данные</h2><div class="list">' +
      rowBtn('export-json', '💾', 'Сохранить резервную копию',
        st.lastExport ? 'последняя: ' + U.fmtDate(st.lastExport) : 'ещё ни разу') +
      rowBtn('export-csv', '📄', 'Выгрузить журнал топлива', 'таблица CSV для Excel') +
      rowBtn('export-shifts', '📄', 'Выгрузить смены', 'таблица CSV для Excel') +
      rowBtn('import', '📥', 'Загрузить базу', 'копия приложения или таблица CSV') +
      '<button class="row tap" data-act="wipe"><span class="op-ic">🗑️</span>' +
      '<span class="grow"><span class="ttl" style="color:var(--red)">Стереть все данные</span></span></button>' +
      '</div>';
    h += '<div class="hint">Всё хранится <b>только на этом телефоне</b>, без сервера и интернета. ' +
      'Делайте копию хотя бы раз в месяц.</div>';

    if (!DB.data.isDemo && !DB.units().length) {
      h += '<div class="btn-row"><button class="btn sec" data-act="demo">Посмотреть на примере</button></div>';
    }
    if (DB.data.isDemo) {
      h += '<div class="btn-row"><button class="btn danger" data-act="demo-off">Очистить демо-данные</button></div>';
    }

    h += '<h2 class="sec">Установка на iPhone</h2><div class="card pad" style="font-size:15px;line-height:1.5;color:var(--text-2)">' +
      '1. Откройте эту страницу в Safari.<br>2. Нажмите «Поделиться» (квадрат со стрелкой).<br>' +
      '3. Выберите «На экран «Домой»».<br>4. Запускайте с иконки — приложение работает без интернета.</div>';

    h += '<div style="text-align:center;color:var(--text-3);font-size:13px;margin:26px 0 10px">Автопарк · версия 1.0</div>';
    return h + '</div>';

    function rowBtn(act, ic, t, sub) {
      return '<button class="row tap" data-act="' + act + '"><span class="op-ic">' + ic + '</span>' +
        '<span class="grow"><span class="ttl">' + t + '</span>' +
        (sub ? '<span class="sub">' + esc(sub) + '</span>' : '') + '</span>' +
        '<span class="chev">' + V.ICON.chev + '</span></button>';
    }
  };

  w.V = V;
})(window);
