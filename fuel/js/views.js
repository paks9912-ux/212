/* Экраны: Обзор, Техника, Топливо, Ещё */
(function (w) {
  'use strict';

  var esc = U.esc, V = {};

  V.unitsQuery = '';
  V.unitsFilter = 'all';

  /* ============ иконки ============ */
  V.ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-5.5h5V20"/></svg>',
    units: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 16V7.5h11V16"/><path d="M13.5 10.5h4l3 3.2V16"/><circle cx="7" cy="16.5" r="2.2"/><circle cx="17" cy="16.5" r="2.2"/><path d="M9.2 16.5h5.6"/></svg>',
    tank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.2s5.5 6 5.5 9.6a5.5 5.5 0 0 1-11 0C6.5 9.2 12 3.2 12 3.2Z"/><path d="M9.6 13.4a2.6 2.6 0 0 0 2.6 2.6"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.2"/><path d="M8 12h.01M12 12h.01M16 12h.01"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4 7 12l8 8"/></svg>',
    chev: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4l8 8-8 8"/></svg>'
  };

  /* ============ общие кусочки ============ */
  V.unitIcon = function (u) {
    return '<div class="avatar" style="background:' + U.color(u.name) + ';font-size:18px">' +
      U.kind(u.kind).ic + '</div>';
  };

  V.devBadge = function (s) {
    if (!s || s.avg == null) return '<span class="badge">Мало данных</span>';
    if (s.dev == null) return '<span class="badge">Нет нормы</span>';
    var lim = U.num(DB.data.settings.overrun) || 10;
    if (s.dev > lim) return '<span class="badge bad">Перерасход ' + U.pct(s.dev, true) + '</span>';
    if (s.dev > 0) return '<span class="badge warn">' + U.pct(s.dev, true) + ' к норме</span>';
    return '<span class="badge ok">В норме</span>';
  };

  V.unitRow = function (u) {
    var s = CALC.unit(u);
    var sub = [];
    if (u.plate) sub.push(esc(u.plate));
    sub.push(u.norm > 0 ? 'норма ' + U.rate(u.norm, u.meter) : 'норма не задана');
    return '<button class="row tap" data-act="unit" data-id="' + u.id + '">' +
      V.unitIcon(u) +
      '<span class="grow"><span class="ttl">' + esc(u.name) + '</span>' +
      '<span class="sub">' + V.devBadge(s) + ' ' + sub.join(' · ') + '</span></span>' +
      '<span class="val"><span class="v1 num">' + (s.avg != null ? U.rate(s.avg, u.meter, true) : '—') + '</span>' +
      '<span class="v2">' + U.rateUnit(u.meter) + '</span></span>' +
      '<span class="chev">' + V.ICON.chev + '</span></button>';
  };

  V.fillRow = function (f, opt) {
    opt = opt || {};
    var u = DB.unit(f.unitId) || { name: 'Техника удалена', kind: 'other', meter: 'km', norm: 0 };
    var seg = CALC.segmentOf(u, f.id);
    var flags = CALC.fillFlags(u, f);
    var sub = U.fmtDate(f.date) + ' · ' + (f.source === 'station' ? 'АЗС' : 'бочка') +
      (f.full === false ? ' · не до полного' : '') +
      (f.meter ? ' · ' + U.meter(f.meter, u.meter) : '');
    var right = seg && seg.rate != null
      ? '<span class="v2">' + U.rate(seg.rate, u.meter, true) + ' ' + U.rateUnit(u.meter) + '</span>'
      : '<span class="v2">' + U.money(f.cost) + '</span>';

    return '<button class="row tap fill-row" data-act="edit-fill" data-id="' + f.id + '">' +
      (opt.noIcon ? '' : V.unitIcon(u)) +
      '<span class="grow"><span class="ttl">' + (opt.noIcon ? U.liters(f.liters) + ' · ' + U.money(f.cost) : esc(u.name)) + '</span>' +
      '<span class="sub">' + esc(sub) + '</span>' +
      flags.map(function (x) {
        return '<span class="flag' + (x.soft ? '' : ' bad') + '">' + esc(x.text) + '</span>';
      }).join('') +
      '</span>' +
      '<span class="val"><span class="v1 num lit">' + (opt.noIcon ? '' : U.liters(f.liters)) + '</span>' + right + '</span>' +
      '</button>';
  };

  V.alertRow = function (a) {
    var bad = ['overrun', 'service', 'shortage', 'over-tank', 'meter-back', 'tank-negative'].indexOf(a.type) >= 0;
    var ic = { overrun: '⛽', service: '🔧', 'service-soon': '🔧', shortage: '📉', 'low-fuel': '🛢️',
      'over-tank': '❗', 'meter-back': '↩️', 'no-run': '⏸️', 'tank-negative': '❗' }[a.type] || '⚠️';
    var head = a.unit ? esc(a.unit.name) : {
      'low-fuel': 'Топливо заканчивается', shortage: 'Недостача при замере',
      'tank-negative': 'Учёт бочки не сходится'
    }[a.type] || 'Внимание';
    return '<' + (a.unit ? 'button class="alert tap' : 'div class="alert') + (bad ? ' bad' : '') + '"' +
      (a.unit ? ' data-act="unit" data-id="' + a.unit.id + '"' : '') + '>' +
      '<span class="ic">' + ic + '</span>' +
      '<span class="tx"><b>' + head + '</b><span>' + esc(a.text) + '</span></span>' +
      (a.money > 0 ? '<span class="money">' + U.moneyShort(a.money) + '</span>' : '') +
      '</' + (a.unit ? 'button' : 'div') + '>';
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

  V.demoNote = function () {
    if (!DB.data.isDemo) return '';
    return '<div class="card pad" style="margin-bottom:12px;background:var(--warn-soft)">' +
      '<div style="font-weight:600;margin-bottom:3px">Это демонстрационные данные</div>' +
      '<div style="font-size:14px;color:var(--text-2);line-height:1.4">Вымышленный парк из пяти единиц с заправками за два месяца — чтобы посмотреть, как всё считается. Очистите перед тем, как заносить своё.</div>' +
      '<button class="btn sec sm" style="margin-top:12px;width:100%" data-act="demo-off">Очистить и начать с нуля</button></div>';
  };

  /* ============ ОБЗОР ============ */
  V.home = function () {
    var units = DB.units(), mk = U.monthKey(U.today());
    var m = CALC.month(mk), fleet = CALC.fleet();

    var h = V.topbar('Обзор', '<button data-act="new-fill" style="font-size:26px;font-weight:300">＋</button>');
    h += '<div class="wrap"><h1 class="big">Обзор</h1>';
    h += V.demoNote();

    if (!units.length) {
      h += V.empty('⛽', 'Техники пока нет',
        'Заведите машину или агрегат — дальше приложение само посчитает расход, сравнит его с нормой и покажет, где топливо уходит мимо.',
        '<div style="margin-top:18px"><button class="btn" data-act="new-unit">Добавить технику</button>' +
        '<button class="btn ghost" style="margin-top:8px" data-act="demo">Посмотреть на примере</button>' +
        '<button class="btn ghost" style="margin-top:4px" data-act="import">Загрузить свою базу</button></div>');
      return h + '</div>';
    }

    /* сколько денег ушло на топливо в этом месяце */
    h += '<div class="hero">' +
      '<div class="lbl">Топливо за ' + esc(U.monthName(mk).split(' ')[0].toLowerCase()) + '</div>' +
      '<div class="amt num">' + U.money(m.cost) + '</div>' +
      '<div class="delta">' + U.liters(m.liters) + ' · ' + m.count + ' ' +
      U.plural(m.count, 'заправка', 'заправки', 'заправок') + '</div>' +
      (m.extraCost > 0
        ? '<div class="delta" style="color:var(--red);font-weight:600">из них перерасход ' + U.moneyShort(m.extraCost) + '</div>'
        : '') +
      '</div>';

    h += '<button class="btn lg" style="margin-top:12px" data-act="new-fill">＋&nbsp; Заправка</button>';

    /* плитки */
    var fuels = CALC.tankFuels();
    var tk = fuels.length ? CALC.tank(fuels[0]) : null;
    h += '<div class="stats">';
    h += '<button class="stat" data-act="go-tank" style="text-align:left">' +
      '<div class="k">В бочке</div><div class="v num">' + (tk ? U.liters(tk.balance) : '—') + '</div>' +
      '<div class="k" style="margin-top:3px">' +
      (tk && tk.daysLeft != null ? 'хватит на ' + U.days(tk.daysLeft) : 'учёт не ведётся') + '</div></button>';
    h += '<div class="stat"><div class="k">Средняя цена литра</div><div class="v num">' +
      U.money(m.liters > 0 ? m.cost / m.liters : DB.price(DB.data.settings.fuel)) + '</div>' +
      '<div class="k" style="margin-top:3px">за этот месяц</div></div>';
    h += '<div class="stat"><div class="k">Залито из бочки</div><div class="v num">' +
      U.liters(m.tank) + '</div>' +
      '<div class="k" style="margin-top:3px">с АЗС ' + U.liters(m.station) + '</div></div>';
    h += '<div class="stat"><div class="k">Техника с перерасходом</div><div class="v num" style="color:' +
      (fleet.overrun ? 'var(--red)' : 'var(--accent)') + '">' + fleet.overrun + ' из ' + units.length + '</div></div>';
    h += '</div>';

    /* сигналы */
    if (fleet.alerts.length) {
      h += '<h2 class="sec">Требует внимания</h2><div class="list">';
      fleet.alerts.slice(0, 6).forEach(function (a) { h += V.alertRow(a); });
      h += '</div>';
    }

    /* последние заправки */
    var last = DB.fills().slice().sort(DB.byDate).reverse().slice(0, 5);
    if (last.length) {
      h += '<h2 class="sec">Последние заправки<a class="act" href="#/units">вся техника</a></h2><div class="list">';
      last.forEach(function (f) { h += V.fillRow(f); });
      h += '</div>';
    }

    return h + '</div>';
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

    var h = V.topbar('Техника', '<button data-act="new-unit" style="font-size:26px;font-weight:300">＋</button>');
    h += '<div class="wrap"><h1 class="big">Техника</h1>';

    if (!all.length) {
      h += V.empty('🚛', 'Список пуст',
        'Добавьте самосвал, экскаватор или генератор — у каждого свой счётчик и своя норма расхода.',
        '<div style="margin-top:18px"><button class="btn" data-act="new-unit">Добавить технику</button></div>');
      return h + '</div>';
    }

    if (all.length > 4) {
      h += '<div class="search">' + V.ICON.search +
        '<input id="qu" placeholder="Название или госномер" value="' + esc(V.unitsQuery) + '" autocomplete="off"></div>';
    }
    h += '<div class="seg">' +
      seg('all', 'Все', all.length) + seg('over', 'Перерасход', over) + seg('service', 'К ТО', svc) +
      '</div>';

    if (!list.length) {
      h += V.empty('🔍', 'Ничего не нашлось', 'Попробуйте другой запрос или снимите фильтр.');
    } else {
      h += '<div class="list">';
      list.forEach(function (u) { h += V.unitRow(u); });
      h += '</div>';
      var m = CALC.month(U.monthKey(U.today())), lit = 0, cost = 0;
      list.forEach(function (u) {
        var b = m.byUnit[u.id];
        if (b) { lit += b.liters; cost += b.cost; }
      });
      h += '<div style="font-size:13px;color:var(--text-2);margin:10px 4px">' +
        U.unitsWord(list.length) + ' · за месяц ' + U.liters(lit) + ' на ' + U.money(cost) + '</div>';
    }
    return h + '</div>';

    function seg(k, t, n) {
      return '<button data-act="filter" data-f="' + k + '" class="' + (V.unitsFilter === k ? 'on' : '') + '">' +
        t + (n ? ' <span class="cnt">' + n + '</span>' : '') + '</button>';
    }
  };

  /* ============ ТОПЛИВО (бочка) ============ */
  V.tank = function () {
    var fuels = CALC.tankFuels();
    var h = V.topbar('Топливо');
    h += '<div class="wrap"><h1 class="big">Топливо</h1>';

    if (!fuels.length) {
      h += V.empty('🛢️', 'Своя бочка не ведётся',
        'Внесите приход топлива — и приложение начнёт само списывать из бочки каждую заправку, показывать остаток и сколько дней его хватит.',
        '<div style="margin-top:18px"><button class="btn" data-act="new-supply">Внести приход</button></div>');
      return h + '</div>';
    }

    fuels.forEach(function (fuel) {
      var t = CALC.tank(fuel);
      var low = U.num(DB.data.settings.lowDays) || 5;
      var cls = t.balance <= 0 ? 'bad' : (t.daysLeft != null && t.daysLeft <= low ? 'warn' : '');
      var maxIn = 0;
      t.supplies.forEach(function (s) { maxIn = Math.max(maxIn, U.num(s.liters)); });
      var pct = maxIn > 0 ? Math.max(0, Math.min(100, t.balance / maxIn * 100)) : 0;

      h += '<div class="card pad" style="margin-bottom:12px">' +
        '<div class="lbl" style="font-size:13px;color:var(--text-2)">' + esc(U.fuel(fuel).name) + ' в бочке</div>' +
        '<div class="amt num" style="font-size:34px;font-weight:700;letter-spacing:-1px;margin-top:2px">' +
        U.liters(t.balance) + '</div>' +
        '<div class="delta" style="font-size:13px;color:var(--text-2);margin-top:4px">' +
        (t.daysLeft != null
          ? 'расход ' + U.liters(t.perDay) + ' в день — хватит примерно на ' + U.days(t.daysLeft)
          : 'ещё нет выдач, чтобы оценить расход') + '</div>' +
        '<div class="bar ' + cls + '"><i style="width:' + pct.toFixed(0) + '%"></i></div>' +
        '<div class="kv" style="margin-top:10px"><span class="k">Всего заведено</span><span class="v num">' + U.liters(t.gotTotal) + '</span></div>' +
        '<div class="kv"><span class="k">Выдано технике</span><span class="v num">' + U.liters(t.usedTotal) + '</span></div>' +
        (t.diff
          ? '<div class="kv"><span class="k">Замер ' + U.fmtDate(t.diff.date) + '</span><span class="v num" style="color:' +
            (t.diff.delta < -0.5 ? 'var(--red)' : 'var(--accent)') + '">' +
            (t.diff.delta < 0 ? 'недостача ' + U.liters(-t.diff.delta) : t.diff.delta > 0.5 ? 'излишек ' + U.liters(t.diff.delta) : 'сошёлся') +
            '</span></div>'
          : '') +
        '</div>';
    });

    h += '<div class="btn-row"><button class="btn sec" data-act="new-supply">Приход</button>' +
      '<button class="btn sec" data-act="new-check">Замер</button></div>';

    /* движение топлива */
    var ops = [];
    DB.data.supplies.forEach(function (s) { ops.push({ kind: 'in', date: s.date, obj: s }); });
    DB.data.checks.forEach(function (c) { ops.push({ kind: 'check', date: c.date, obj: c }); });
    DB.data.fills.filter(function (f) { return f.source === 'tank'; })
      .forEach(function (f) { ops.push({ kind: 'out', date: f.date, obj: f }); });
    ops.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });

    if (ops.length) {
      h += '<h2 class="sec">Движение</h2><div class="list">';
      ops.slice(0, 20).forEach(function (o) {
        if (o.kind === 'in') {
          h += '<button class="row tap" data-act="del-supply" data-id="' + o.obj.id + '">' +
            '<span class="avatar" style="background:var(--accent-soft);color:var(--accent);font-size:16px">＋</span>' +
            '<span class="grow"><span class="ttl">Приход · ' + esc(U.fuel(o.obj.fuel).short) + '</span>' +
            '<span class="sub">' + U.fmtDate(o.date) + (o.obj.note ? ' · ' + esc(o.obj.note) : '') + '</span></span>' +
            '<span class="val"><span class="v1 num" style="color:var(--accent)">+' + U.liters(o.obj.liters) + '</span>' +
            '<span class="v2">' + U.money(o.obj.cost) + '</span></span></button>';
        } else if (o.kind === 'check') {
          h += '<button class="row tap" data-act="del-check" data-id="' + o.obj.id + '">' +
            '<span class="avatar" style="background:var(--fill);color:var(--text-2);font-size:15px">📏</span>' +
            '<span class="grow"><span class="ttl">Замер остатка</span>' +
            '<span class="sub">' + U.fmtDate(o.date) + (o.obj.note ? ' · ' + esc(o.obj.note) : '') + '</span></span>' +
            '<span class="val"><span class="v1 num">' + U.liters(o.obj.liters) + '</span></span></button>';
        } else {
          var u = DB.unit(o.obj.unitId) || { name: 'Техника удалена', kind: 'other' };
          h += '<button class="row tap" data-act="edit-fill" data-id="' + o.obj.id + '">' + V.unitIcon(u) +
            '<span class="grow"><span class="ttl">' + esc(u.name) + '</span>' +
            '<span class="sub">' + U.fmtDate(o.date) + ' · выдача из бочки</span></span>' +
            '<span class="val"><span class="v1 num">−' + U.liters(o.obj.liters) + '</span>' +
            '<span class="v2">' + U.money(o.obj.cost) + '</span></span></button>';
        }
      });
      h += '</div><div class="hint">Заправка «из бочки» списывается автоматически — отдельно проводить расход не нужно. Нажмите на строку, чтобы изменить или удалить её.</div>';
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
    h += '<div class="wrap"><h1 class="big">Ещё</h1>';

    h += '<div class="card pad">' +
      '<div class="kv big"><span class="k">Залито за всё время</span><span class="v num">' + U.liters(totalL) + '</span></div>' +
      '<div class="kv big"><span class="k">Потрачено на топливо</span><span class="v num">' + U.money(totalC) + '</span></div>' +
      '<div class="kv"><span class="k">Перерасход к норме</span><span class="v num" style="color:' +
      (extra > 0 ? 'var(--red)' : 'var(--text)') + '">' + U.money(extra) + '</span></div>' +
      '<div class="kv"><span class="k">Техника</span><span class="v num">' + U.unitsWord(DB.units().length) + '</span></div>' +
      '</div>';

    if (list.length) {
      h += '<h2 class="sec">По месяцам</h2><div class="list">';
      list.forEach(function (k) {
        var m = CALC.month(k);
        h += '<button class="row tap" data-act="report" data-m="' + k + '">' +
          '<span class="grow"><span class="ttl">' + esc(U.monthName(k)) + '</span>' +
          '<span class="sub">' + U.liters(m.liters) + ' · ' + m.count + ' ' +
          U.plural(m.count, 'заправка', 'заправки', 'заправок') +
          (m.extraCost > 0 ? ' · перерасход ' + U.moneyShort(m.extraCost) : '') + '</span></span>' +
          '<span class="val"><span class="v1 num">' + U.moneyShort(m.cost) + '</span>' +
          '<span class="v2">отчёт</span></span><span class="chev">' + V.ICON.chev + '</span></button>';
      });
      h += '</div><div class="hint">Нажмите на месяц — приложение соберёт короткий отчёт, который можно отправить в мессенджер.</div>';
    }

    h += '<h2 class="sec">Настройки</h2><div class="list">';
    h += '<div class="field"><label>Валюта</label><select data-act="set" data-k="currency">' +
      U.CUR.map(function (c) {
        return '<option value="' + c.code + '"' + (st.currency === c.code ? ' selected' : '') + '>' + esc(c.name) + ' · ' + esc(c.sym) + '</option>';
      }).join('') + '</select></div>';
    h += '<div class="field"><label>Топливо</label><select data-act="set" data-k="fuel">' +
      U.FUELS.map(function (f) {
        return '<option value="' + f.code + '"' + (st.fuel === f.code ? ' selected' : '') + '>' + esc(f.name) + '</option>';
      }).join('') + '</select></div>';
    h += '<div class="field"><label>Заправляют</label><select data-act="set" data-k="source">' +
      [['tank', 'из своей бочки'], ['station', 'на АЗС']].map(function (t) {
        return '<option value="' + t[0] + '"' + (st.source === t[0] ? ' selected' : '') + '>' + t[1] + '</option>';
      }).join('') + '</select></div>';
    h += '<div class="field"><label>Перерасход от</label><input type="number" inputmode="decimal" step="1" value="' +
      st.overrun + '" data-act="set" data-k="overrun"><span class="unit">% к норме</span></div>';
    h += '<div class="field"><label>Предупредить за</label><input type="number" inputmode="numeric" value="' +
      st.lowDays + '" data-act="set" data-k="lowDays"><span class="unit">дней</span></div>';
    h += '<div class="field"><label>Оформление</label><select data-act="set" data-k="theme">' +
      [['auto', 'Как в системе'], ['light', 'Светлое'], ['dark', 'Тёмное']].map(function (t) {
        return '<option value="' + t[0] + '"' + (st.theme === t[0] ? ' selected' : '') + '>' + t[1] + '</option>';
      }).join('') + '</select></div>';
    h += '</div><div class="hint">Топливо и источник подставляются в новую заправку — в каждой записи их можно поменять. ' +
      '«Перерасход от» — с какого отклонения техника считается прожорливой, «предупредить за» — за сколько дней до пустой бочки напомнить.</div>';

    h += '<h2 class="sec">Защита</h2><div class="list">' +
      '<button class="row tap" data-act="pin">' +
      '<span class="grow"><span class="ttl">Код-пароль</span><span class="sub">' +
      (st.pin ? 'включён — спрашивается при запуске' : 'выключен') + '</span></span>' +
      '<span class="val"><span class="v1" style="color:var(--accent);font-size:15px">' + (st.pin ? 'Изменить' : 'Включить') + '</span></span></button>' +
      (st.pin ? '<button class="row tap" data-act="pin-off"><span class="grow"><span class="ttl" style="color:var(--red)">Отключить код</span></span></button>' : '') +
      '</div>';

    h += '<h2 class="sec">Данные</h2><div class="list">' +
      rowBtn('export-json', 'Сохранить резервную копию', st.lastExport ? 'последняя: ' + U.fmtDate(st.lastExport) : 'ещё ни разу') +
      rowBtn('export-csv', 'Выгрузить таблицу CSV', 'заправки и приход — для Excel и бухгалтерии') +
      rowBtn('import', 'Загрузить базу', 'копия приложения или таблица CSV') +
      '<button class="row tap" data-act="wipe"><span class="grow"><span class="ttl" style="color:var(--red)">Стереть все данные</span></span></button>' +
      '</div>';
    h += '<div class="hint">Всё хранится <b>только на этом телефоне</b>, без сервера и интернета. Делайте копию хотя бы раз в месяц.</div>';

    if (st.lastExport && U.diffDays(st.lastExport, U.today()) > 14) {
      h += '<div class="card pad" style="margin-top:12px;background:var(--warn-soft);font-size:14px">' +
        'Резервной копии не было ' + U.days(U.diffDays(st.lastExport, U.today())) + '. Сохраните — это одна кнопка.</div>';
    }

    h += '<h2 class="sec">Установка на iPhone</h2><div class="card pad" style="font-size:15px;line-height:1.5;color:var(--text-2)">' +
      '1. Откройте эту страницу в Safari.<br>2. Нажмите «Поделиться» (квадрат со стрелкой).<br>' +
      '3. Выберите «На экран «Домой»».<br>4. Запускайте с иконки — интернет не нужен.</div>';

    h += '<div style="text-align:center;color:var(--text-3);font-size:13px;margin:26px 0 10px">Топливо · версия 1.0</div>';
    return h + '</div>';

    function rowBtn(act, t, sub) {
      return '<button class="row tap" data-act="' + act + '"><span class="grow"><span class="ttl">' + t + '</span>' +
        (sub ? '<span class="sub">' + esc(sub) + '</span>' : '') + '</span><span class="chev">' + V.ICON.chev + '</span></button>';
    }
  };

  w.V = V;
})(window);
