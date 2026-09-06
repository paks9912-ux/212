/* Экраны: Обзор, Техника, Топливо, Ещё */
(function (w) {
  'use strict';

  var esc = U.esc, V = {};

  V.unitsQuery = '';
  V.unitsFilter = 'all';

  /* ============ иконки ============ */
  V.ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 11 12 4l8.5 7"/><path d="M6 10v9.5h12V10"/><path d="M10 19.5V14h4v5.5"/></svg>',
    units: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 16.2V7.6h11v8.6"/><path d="M13.5 10.6h4l3 3.2v2.4"/><circle cx="7" cy="16.8" r="2.1"/><circle cx="17" cy="16.8" r="2.1"/></svg>',
    tank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.4s5.4 5.9 5.4 9.4a5.4 5.4 0 0 1-10.8 0C6.6 9.3 12 3.4 12 3.4Z"/><path d="M9.7 13.3a2.5 2.5 0 0 0 2.5 2.5"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4 7 12l8 8"/></svg>'
  };

  /* ============ мелкие детали ============ */
  V.topbar = function (title, right, back) {
    return '<div class="topbar" id="topbar">' +
      (back ? '<button class="tb-btn" data-act="back">' + V.ICON.back + '</button>'
        : '<span class="tb-btn" style="visibility:hidden">' + V.ICON.back + '</span>') +
      '<span class="tb-t">' + esc(title) + '</span>' +
      '<span class="tb-btn right">' + (right || '') + '</span></div>';
  };

  V.hdr = function (eyebrow, title) {
    return '<div class="hdr"><div class="eyebrow">' + esc(eyebrow) + '</div><h1>' + esc(title) + '</h1></div>';
  };

  V.empty = function (ic, t, d, btn) {
    return '<div class="empty"><div class="ic">' + ic + '</div><div class="t">' + esc(t) + '</div>' +
      '<div class="d">' + d + '</div>' + (btn || '') + '</div>';
  };

  /* уровень отклонения от нормы: 0 — норма, ±50% — края шкалы */
  V.devbar = function (dev) {
    if (dev == null) return '';
    var lim = U.num(DB.data.settings.overrun) || 10;
    var v = Math.max(-50, Math.min(50, dev));
    var wpc = Math.abs(v) / 50 * 50;
    var cls = dev > lim ? 'bad' : dev > 0.5 ? 'over' : '';
    var side = v >= 0 ? 'left:50%' : 'right:50%';
    return '<span class="devbar"><b></b><i class="' + cls + '" style="' + side + ';width:' + wpc.toFixed(1) + '%"></i></span>';
  };

  V.devPill = function (s) {
    if (!s || s.avg == null) return '<span class="pill">Мало данных</span>';
    if (s.dev == null) return '<span class="pill">Нет нормы</span>';
    var lim = U.num(DB.data.settings.overrun) || 10;
    if (s.dev > lim) return '<span class="pill bad">Перерасход ' + U.pct(s.dev, true) + '</span>';
    if (s.dev > 0.5) return '<span class="pill warn">' + U.pct(s.dev, true) + ' к норме</span>';
    return '<span class="pill ok">В норме</span>';
  };

  /* шкала бочки */
  V.gauge = function (t) {
    var cap = 0;
    t.supplies.forEach(function (s) { cap = Math.max(cap, U.num(s.liters)); });
    cap = Math.max(cap, t.balance);
    var pct = cap > 0 ? Math.max(0, Math.min(100, t.balance / cap * 100)) : 0;
    var low = U.num(DB.data.settings.lowDays) || 5;
    var cls = t.balance <= 0 ? 'low' : (t.daysLeft != null && t.daysLeft <= low ? 'low' : '');
    return '<div class="gauge ' + cls + '"><i style="width:' + pct.toFixed(1) + '%"></i><u></u></div>' +
      '<div class="gauge-x"><span>пусто</span><span>' + U.liters(cap) + '</span></div>';
  };

  /* ============ карточки-строки ============ */
  V.unitTicket = function (u) {
    var s = CALC.unit(u);
    var lim = U.num(DB.data.settings.overrun) || 10;
    var cls = s.dev == null ? '' : s.dev > lim ? 'bad' : s.dev > 0.5 ? 'warn' : 'ok';
    var sub = [];
    if (u.plate) sub.push(u.plate);
    sub.push(u.norm > 0 ? 'норма ' + U.rate(u.norm, u.meter, true) : 'без нормы');
    if (s.service && s.service.due) sub.push('ТО просрочено');

    return '<button class="ticket ' + cls + '" data-act="unit" data-id="' + u.id + '">' +
      '<span class="t-ic">' + U.kind(u.kind).ic + '</span>' +
      '<span class="t-main"><span class="t-title">' + esc(u.name) + '</span>' +
      '<span class="t-sub">' + esc(sub.join(' · ')) + '</span>' +
      V.devbar(s.dev) + '</span>' +
      '<span class="t-val"><b class="' + (s.dev != null && s.dev > lim ? 'bad' : '') + '">' +
      (s.avg != null ? U.rate(s.avg, u.meter, true) : '—') + '</b>' +
      '<span>' + U.rateUnit(u.meter) + '</span></span></button>';
  };

  V.fillTicket = function (f, opt) {
    opt = opt || {};
    var u = DB.unit(f.unitId) || { id: '', name: 'Техника удалена', kind: 'other', meter: 'km', norm: 0 };
    var seg = CALC.segmentOf(u, f.id);
    var flags = CALC.fillFlags(u, f);
    var hard = flags.filter(function (x) { return !x.soft; }).length;
    var cls = hard ? 'bad' : flags.length ? 'warn' : '';

    var sub = U.fmtDate(f.date) + ' · ' + (f.source === 'station' ? 'АЗС' : 'из бочки') +
      (f.full === false ? ' · не до полного' : '') +
      (f.meter ? ' · ' + U.meter(f.meter, u.meter) : '');

    return '<button class="ticket ' + cls + '" data-act="edit-fill" data-id="' + f.id + '">' +
      (opt.noIcon ? '' : '<span class="t-ic">' + U.kind(u.kind).ic + '</span>') +
      '<span class="t-main">' +
      '<span class="t-title">' + (opt.noIcon ? U.liters(f.liters) + ' · ' + U.money(f.cost) : esc(u.name)) + '</span>' +
      '<span class="t-sub">' + esc(sub) + '</span>' +
      flags.map(function (x) {
        return '<span class="t-flag' + (x.soft ? '' : ' bad') + '">' + esc(x.text) + '</span>';
      }).join('') +
      '</span>' +
      '<span class="t-val">' +
      (opt.noIcon
        ? '<b>' + (seg && seg.rate != null ? U.rate(seg.rate, u.meter, true) : '—') + '</b><span>' + U.rateUnit(u.meter) + '</span>'
        : '<b>' + U.liters(f.liters) + '</b><span>' +
          (seg && seg.rate != null ? U.rate(seg.rate, u.meter) : U.money(f.cost)) + '</span>') +
      '</span></button>';
  };

  V.alertTicket = function (a) {
    var hard = ['overrun', 'service', 'shortage', 'over-tank', 'meter-back', 'tank-negative'].indexOf(a.type) >= 0;
    var ic = { overrun: '⛽', service: '🔧', 'service-soon': '🔧', shortage: '📉', 'low-fuel': '🛢️',
      'over-tank': '❗', 'meter-back': '↩️', 'no-run': '⏸️', 'tank-negative': '❗' }[a.type] || '⚠️';
    var head = a.unit ? a.unit.name : ({
      'low-fuel': 'Топливо заканчивается', shortage: 'Недостача при замере',
      'tank-negative': 'Учёт бочки не сходится'
    }[a.type] || 'Внимание');
    var tag = a.unit ? 'button' : 'div';
    return '<' + tag + ' class="ticket ' + (hard ? 'bad' : 'warn') + '"' +
      (a.unit ? ' data-act="unit" data-id="' + a.unit.id + '"' : '') + '>' +
      '<span class="t-ic">' + ic + '</span>' +
      '<span class="t-main"><span class="t-title">' + esc(head) + '</span>' +
      '<span class="t-sub" style="white-space:normal">' + esc(a.text) + '</span></span>' +
      (a.money > 0 ? '<span class="t-val"><b class="bad">' + U.moneyShort(a.money) + '</b></span>' : '') +
      '</' + tag + '>';
  };

  V.demoNote = function () {
    if (!DB.data.isDemo) return '';
    return '<div class="panel" style="border-color:var(--amber);background:var(--amber-soft);margin-bottom:10px">' +
      '<div class="eyebrow" style="color:var(--amber)">Пример</div>' +
      '<div style="font-size:14.5px;line-height:1.5;margin-top:7px">Вымышленный парк из пяти единиц с заправками за два месяца — чтобы посмотреть, как всё считается. Очистите перед тем, как заносить своё.</div>' +
      '<button class="btn sec sm" style="margin-top:12px" data-act="demo-off">Очистить и начать с нуля</button></div>';
  };

  /* ============ ОБЗОР ============ */
  V.home = function () {
    var units = DB.units(), mk = U.monthKey(U.today());
    var m = CALC.month(mk), fleet = CALC.fleet();

    var h = V.topbar('Обзор');
    h += '<div class="wrap">' + V.hdr(U.fmtDateFull(U.today()), 'Обзор') + V.demoNote();

    if (!units.length) {
      h += V.empty('⛽', 'Техники пока нет',
        'Заведите машину или агрегат — дальше приложение само посчитает расход, сравнит его с нормой и покажет, где топливо уходит мимо.',
        '<div style="margin-top:20px;display:flex;flex-direction:column;gap:8px">' +
        '<button class="btn" data-act="new-unit">Добавить технику</button>' +
        '<button class="btn sec" data-act="demo">Посмотреть на примере</button>' +
        '<button class="btn ghost" data-act="import">Загрузить свою базу</button></div>');
      return h + '</div>';
    }

    /* деньги за месяц */
    h += '<div class="panel">' +
      '<div class="eyebrow">Топливо за ' + esc(U.monthName(mk).split(' ')[0].toLowerCase()) + '</div>' +
      '<div class="metric num">' + U.money(m.cost, { noCur: true }) + '<small>' + esc(U.sym()) + '</small></div>' +
      '<div class="sub">' + U.liters(m.liters) + ' · ' + m.count + ' ' +
      U.plural(m.count, 'заправка', 'заправки', 'заправок') + '</div>' +
      (m.extraCost > 0
        ? '<div class="pills"><span class="pill bad">Перерасход ' + U.moneyShort(m.extraCost) + '</span>' +
          '<span class="pill">' + fleet.overrun + ' из ' + units.length + ' с перерасходом</span></div>'
        : '<div class="pills"><span class="pill ok">Все в норме</span></div>') +
      '</div>';

    /* бочка */
    var fuels = CALC.tankFuels();
    var tk = fuels.length ? CALC.tank(fuels[0]) : null;
    if (tk) {
      h += '<button class="panel" style="display:block;text-align:left;width:100%" data-act="go-tank">' +
        '<div class="panel-hd"><span class="eyebrow">' + esc(U.fuel(tk.fuel).name) + ' в бочке</span>' +
        '<span class="num" style="font-size:22px;font-weight:800;letter-spacing:-.02em">' + U.liters(tk.balance) + '</span></div>' +
        V.gauge(tk) +
        '<div class="sub' + (tk.daysLeft != null && tk.daysLeft <= (U.num(DB.data.settings.lowDays) || 5) ? ' bad' : '') + '">' +
        (tk.daysLeft != null
          ? 'расход ' + U.liters(tk.perDay) + ' в день — хватит примерно на ' + U.days(tk.daysLeft)
          : 'выдач пока не было') + '</div></button>';
    }

    /* плитки */
    h += '<div class="grid-2">';
    h += tile('Средняя цена литра', U.money(m.liters > 0 ? m.cost / m.liters : DB.price(DB.data.settings.fuel)), 'в этом месяце');
    h += tile('Залито из бочки', U.liters(m.tank), 'с АЗС ' + U.liters(m.station));
    var due = nearestService(units);
    h += tile('Ближайшее ТО', due ? U.meter(Math.abs(due.left), due.unit.meter) : '—',
      due ? (due.left <= 0 ? 'просрочено: ' : '') + due.unit.name : 'не настроено',
      due && due.left <= 0 ? 'bad' : due && due.soon ? 'warn' : '');
    h += tile('Всего заправок', String(m.count), 'за месяц');
    h += '</div>';

    /* сигналы */
    if (fleet.alerts.length) {
      h += '<h2 class="sec"><span>Требует внимания</span><span class="act">' + fleet.alerts.length + '</span></h2>';
      h += '<div class="stack">';
      fleet.alerts.slice(0, 6).forEach(function (a) { h += V.alertTicket(a); });
      h += '</div>';
    }

    /* последние заправки */
    var last = DB.fills().slice().sort(DB.byDate).reverse().slice(0, 5);
    if (last.length) {
      h += '<h2 class="sec"><span>Последние заправки</span><a class="act" href="#/units">вся техника</a></h2>';
      h += '<div class="stack">';
      last.forEach(function (f) { h += V.fillTicket(f); });
      h += '</div>';
    }

    return h + '</div>';

    function tile(k, v, n, cls) {
      return '<div class="tile"><div class="k">' + esc(k) + '</div>' +
        '<div class="v num ' + (cls || '') + '">' + v + '</div>' +
        (n ? '<div class="n">' + esc(n) + '</div>' : '') + '</div>';
    }
    function nearestService(list) {
      var best = null;
      list.forEach(function (u) {
        var s = CALC.unit(u);
        if (!s.service) return;
        if (!best || s.service.left < best.left) best = { left: s.service.left, soon: s.service.soon, unit: u };
      });
      return best;
    }
  };

  /* ============ ТЕХНИКА ============ */
  V.units = function () {
    var all = DB.units(), q = (V.unitsQuery || '').trim().toLowerCase();
    var lim = U.num(DB.data.settings.overrun) || 10;

    var list = all.filter(function (u) {
      if (q && (u.name + ' ' + (u.plate || '') + ' ' + (u.note || '')).toLowerCase().indexOf(q) < 0) return false;
      var s = CALC.unit(u);
      if (V.unitsFilter === 'over') return s.dev != null && s.dev > lim;
      if (V.unitsFilter === 'service') return s.service && (s.service.due || s.service.soon);
      return true;
    });
    var over = all.filter(function (u) { var s = CALC.unit(u); return s.dev != null && s.dev > lim; }).length;
    var svc = all.filter(function (u) { var s = CALC.unit(u); return s.service && (s.service.due || s.service.soon); }).length;

    var h = V.topbar('Техника', '<button data-act="new-unit">Добавить</button>');
    h += '<div class="wrap">' + V.hdr(U.unitsWord(all.length) + ' в парке', 'Техника');

    if (!all.length) {
      h += V.empty('🚛', 'Список пуст',
        'Добавьте самосвал, экскаватор или генератор — у каждого свой счётчик и своя норма расхода.',
        '<div style="margin-top:20px"><button class="btn" data-act="new-unit">Добавить технику</button></div>');
      return h + '</div>';
    }

    if (all.length > 4) {
      h += '<div class="search">' + V.ICON.search +
        '<input id="qu" placeholder="Название или госномер" value="' + esc(V.unitsQuery) + '" autocomplete="off"></div>';
    }
    h += '<div class="seg">' + seg('all', 'Все', all.length) + seg('over', 'Перерасход', over) + seg('service', 'К ТО', svc) + '</div>';

    if (!list.length) {
      h += V.empty('🔍', 'Ничего не нашлось', 'Попробуйте другой запрос или снимите фильтр.');
    } else {
      h += '<div class="stack">';
      list.forEach(function (u) { h += V.unitTicket(u); });
      h += '</div>';
      var m = CALC.month(U.monthKey(U.today())), lit = 0, cost = 0;
      list.forEach(function (u) {
        var b = m.byUnit[u.id];
        if (b) { lit += b.liters; cost += b.cost; }
      });
      h += '<div class="note">За месяц по этому списку — ' + U.liters(lit) + ' на ' + U.money(cost) + '.</div>';
    }
    return h + '</div>';

    function seg(k, t, n) {
      return '<button data-act="filter" data-f="' + k + '" class="' + (V.unitsFilter === k ? 'on' : '') + '">' +
        t + (n ? '<span class="cnt">' + n + '</span>' : '') + '</button>';
    }
  };

  /* ============ ТОПЛИВО ============ */
  V.tank = function () {
    var fuels = CALC.tankFuels();
    var h = V.topbar('Топливо', '<button data-act="new-supply">Приход</button>');
    h += '<div class="wrap">' + V.hdr('Своя ёмкость', 'Топливо');

    if (!fuels.length) {
      h += V.empty('🛢️', 'Бочка не ведётся',
        'Внесите приход топлива — и приложение начнёт само списывать из бочки каждую заправку, показывать остаток и сколько дней его хватит.',
        '<div style="margin-top:20px"><button class="btn" data-act="new-supply">Внести приход</button></div>');
      return h + '</div>';
    }

    fuels.forEach(function (fuel) {
      var t = CALC.tank(fuel);
      var low = U.num(DB.data.settings.lowDays) || 5;
      h += '<div class="panel">' +
        '<div class="eyebrow">' + esc(U.fuel(fuel).name) + ' в бочке</div>' +
        '<div class="metric num">' + U.liters(t.balance, true) + '<small>л</small></div>' +
        '<div class="sub' + (t.daysLeft != null && t.daysLeft <= low ? ' bad' : '') + '">' +
        (t.daysLeft != null
          ? 'расход ' + U.liters(t.perDay) + ' в день — хватит примерно на ' + U.days(t.daysLeft)
          : 'выдач пока не было') + '</div>' +
        V.gauge(t) +
        '<div style="margin-top:12px">' +
        '<div class="kv"><span class="k">Всего заведено</span><span class="v num">' + U.liters(t.gotTotal) + '</span></div>' +
        '<div class="kv"><span class="k">Выдано технике</span><span class="v num">' + U.liters(t.usedTotal) + '</span></div>' +
        (t.diff
          ? '<div class="kv"><span class="k">Замер ' + U.fmtDate(t.diff.date) + '</span><span class="v num ' +
            (t.diff.delta < -0.5 ? 'bad' : 'good') + '">' +
            (t.diff.delta < -0.5 ? 'недостача ' + U.liters(-t.diff.delta)
              : t.diff.delta > 0.5 ? 'излишек ' + U.liters(t.diff.delta) : 'сошёлся') + '</span></div>'
          : '') +
        '</div></div>';
    });

    h += '<div class="btn-row"><button class="btn sec" data-act="new-supply">Приход</button>' +
      '<button class="btn sec" data-act="new-check">Замер остатка</button></div>';

    var ops = [];
    DB.data.supplies.forEach(function (s) { ops.push({ kind: 'in', date: s.date, obj: s }); });
    DB.data.checks.forEach(function (c) { ops.push({ kind: 'check', date: c.date, obj: c }); });
    DB.data.fills.filter(function (f) { return f.source === 'tank'; })
      .forEach(function (f) { ops.push({ kind: 'out', date: f.date, obj: f }); });
    ops.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });

    if (ops.length) {
      h += '<h2 class="sec"><span>Движение</span></h2><div class="stack">';
      ops.slice(0, 20).forEach(function (o) {
        if (o.kind === 'in') {
          h += '<button class="ticket ok" data-act="del-supply" data-id="' + o.obj.id + '">' +
            '<span class="t-ic">＋</span><span class="t-main">' +
            '<span class="t-title">Приход · ' + esc(U.fuel(o.obj.fuel).short) + '</span>' +
            '<span class="t-sub">' + U.fmtDate(o.date) + (o.obj.note ? ' · ' + esc(o.obj.note) : '') + '</span></span>' +
            '<span class="t-val"><b class="good">+' + U.liters(o.obj.liters) + '</b><span>' + U.money(o.obj.cost) + '</span></span></button>';
        } else if (o.kind === 'check') {
          h += '<button class="ticket" data-act="del-check" data-id="' + o.obj.id + '">' +
            '<span class="t-ic">📏</span><span class="t-main">' +
            '<span class="t-title">Замер остатка</span>' +
            '<span class="t-sub">' + U.fmtDate(o.date) + (o.obj.note ? ' · ' + esc(o.obj.note) : '') + '</span></span>' +
            '<span class="t-val"><b>' + U.liters(o.obj.liters) + '</b></span></button>';
        } else {
          var u = DB.unit(o.obj.unitId) || { name: 'Техника удалена', kind: 'other' };
          h += '<button class="ticket" data-act="edit-fill" data-id="' + o.obj.id + '">' +
            '<span class="t-ic">' + U.kind(u.kind).ic + '</span><span class="t-main">' +
            '<span class="t-title">' + esc(u.name) + '</span>' +
            '<span class="t-sub">' + U.fmtDate(o.date) + ' · выдача</span></span>' +
            '<span class="t-val"><b>−' + U.liters(o.obj.liters) + '</b><span>' + U.money(o.obj.cost) + '</span></span></button>';
        }
      });
      h += '</div><div class="note">Заправка «из бочки» списывается автоматически — отдельно проводить расход не нужно. Нажмите на строку, чтобы изменить или удалить её.</div>';
    }
    return h + '</div>';
  };

  /* ============ ЕЩЁ ============ */
  V.more = function () {
    var st = DB.data.settings;
    var months = {};
    DB.fills().forEach(function (f) { months[U.monthKey(f.date)] = 1; });
    DB.data.supplies.forEach(function (s) { months[U.monthKey(s.date)] = 1; });
    var list = Object.keys(months).sort().reverse().slice(0, 6);

    var totalL = 0, totalC = 0, extra = 0;
    DB.fills().forEach(function (f) { totalL += U.num(f.liters); totalC += U.num(f.cost); });
    DB.units(true).forEach(function (u) {
      var s = CALC.unit(u);
      if (s.extraLiters > 0) extra += s.extraCost;
    });

    var h = V.topbar('Ещё');
    h += '<div class="wrap">' + V.hdr('Итоги и настройки', 'Ещё');

    h += '<div class="panel">' +
      '<div class="kv"><span class="k">Залито за всё время</span><span class="v num">' + U.liters(totalL) + '</span></div>' +
      '<div class="kv"><span class="k">Потрачено на топливо</span><span class="v num">' + U.money(totalC) + '</span></div>' +
      '<div class="kv"><span class="k">Перерасход к норме</span><span class="v num ' + (extra > 0 ? 'bad' : '') + '">' +
      U.moneyShort(extra) + '</span></div>' +
      '<div class="kv"><span class="k">Техника</span><span class="v num">' + U.unitsWord(DB.units().length) + '</span></div>' +
      '</div>';

    if (list.length) {
      h += '<h2 class="sec"><span>По месяцам</span><span class="act">отчёт</span></h2><div class="rows">';
      list.forEach(function (k) {
        var m = CALC.month(k);
        h += '<button class="row" data-act="report" data-m="' + k + '">' +
          '<span class="r-main"><span class="r-t">' + esc(U.monthName(k)) + '</span>' +
          '<span class="r-s">' + U.liters(m.liters) + ' · ' + m.count + ' ' +
          U.plural(m.count, 'заправка', 'заправки', 'заправок') +
          (m.extraCost > 0 ? ' · перерасход ' + U.moneyShort(m.extraCost) : '') + '</span></span>' +
          '<span class="r-v">' + U.moneyShort(m.cost) + '<small>открыть</small></span></button>';
      });
      h += '</div><div class="note">Нажмите на месяц — приложение соберёт короткий отчёт, который отправляется в мессенджер одной кнопкой.</div>';
    }

    h += '<h2 class="sec"><span>Настройки</span></h2><div class="form">';
    h += fldSelect('Валюта', 'currency', U.CUR.map(function (c) { return [c.code, c.name + ' · ' + c.sym]; }), st.currency);
    h += fldSelect('Топливо', 'fuel', U.FUELS.map(function (f) { return [f.code, f.name]; }), st.fuel);
    h += fldSelect('Заправляют', 'source', [['tank', 'из своей бочки'], ['station', 'на АЗС']], st.source);
    h += '<div class="fld"><label>Перерасход от</label><input type="number" inputmode="decimal" value="' +
      st.overrun + '" data-act="set" data-k="overrun"><span class="unit">% к норме</span></div>';
    h += '<div class="fld"><label>Предупредить за</label><input type="number" inputmode="numeric" value="' +
      st.lowDays + '" data-act="set" data-k="lowDays"><span class="unit">дней</span></div>';
    h += fldSelect('Оформление', 'theme', [['auto', 'Как в системе'], ['dark', 'Тёмное'], ['light', 'Светлое']], st.theme);
    h += '</div><div class="note">«Перерасход от» — с какого отклонения техника попадает в список прожорливых. «Предупредить за» — за сколько дней до пустой бочки напомнить.</div>';

    h += '<h2 class="sec"><span>Данные</span></h2><div class="rows">' +
      row('export-json', 'Сохранить резервную копию', st.lastExport ? 'последняя: ' + U.fmtDate(st.lastExport) : 'ещё ни разу') +
      row('export-csv', 'Выгрузить таблицу CSV', 'заправки и приход — для Excel и бухгалтерии') +
      row('import', 'Загрузить базу', 'копия приложения или таблица CSV') +
      row('pin', 'Код-пароль', st.pin ? 'включён — спрашивается при запуске' : 'выключен') +
      (st.pin ? '<button class="row danger" data-act="pin-off"><span class="r-main"><span class="r-t">Отключить код</span></span></button>' : '') +
      '<button class="row danger" data-act="wipe"><span class="r-main"><span class="r-t">Стереть все данные</span>' +
      '<span class="r-s">без резервной копии не вернуть</span></span></button>' +
      '</div>';
    h += '<div class="note">Всё хранится <b>только на этом телефоне</b>, без сервера и интернета. Делайте копию хотя бы раз в месяц.</div>';

    if (st.lastExport && U.diffDays(st.lastExport, U.today()) > 14) {
      h += '<div class="panel" style="margin-top:10px;border-color:var(--amber);background:var(--amber-soft);font-size:14px;line-height:1.5">' +
        'Резервной копии не было ' + U.days(U.diffDays(st.lastExport, U.today())) + '. Сохраните — это одна кнопка.</div>';
    }

    h += '<h2 class="sec"><span>Установка на iPhone</span></h2>' +
      '<div class="panel" style="font-size:14.5px;line-height:1.6;color:var(--text-2)">' +
      '1. Откройте эту страницу в Safari.<br>2. Нажмите «Поделиться» — квадрат со стрелкой.<br>' +
      '3. Выберите «На экран „Домой“».<br>4. Запускайте с иконки — интернет не нужен.</div>';

    h += '<div style="text-align:center;color:var(--text-3);font-size:12px;margin:24px 0 8px;letter-spacing:.08em;text-transform:uppercase">Топливо · версия 1.0</div>';
    return h + '</div>';

    function row(act, t, sub) {
      return '<button class="row" data-act="' + act + '"><span class="r-main"><span class="r-t">' + esc(t) + '</span>' +
        (sub ? '<span class="r-s">' + esc(sub) + '</span>' : '') + '</span></button>';
    }
    function fldSelect(label, key, opts, val) {
      return '<div class="fld"><label>' + esc(label) + '</label><select data-act="set" data-k="' + key + '">' +
        opts.map(function (o) {
          return '<option value="' + o[0] + '"' + (val === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
        }).join('') + '</select></div>';
    }
  };

  w.V = V;
})(window);
