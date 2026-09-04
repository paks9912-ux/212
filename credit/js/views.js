/* Экраны: Обзор, Займы, Клиенты, Ещё */
(function (w) {
  'use strict';

  var esc = U.esc, V = {};

  /* ============ иконки ============ */
  V.ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-5.5h5V20"/></svg>',
    loans: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.01M18 12h.01"/></svg>',
    clients: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.4"/><path d="M2.8 19c.6-3.3 3.2-5 6.2-5s5.6 1.7 6.2 5"/><path d="M16.5 5.6a3 3 0 0 1 0 5.6"/><path d="M18 14.4c2 .6 3.3 2.2 3.7 4.6"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.2"/><path d="M8 12h.01M12 12h.01M16 12h.01"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4 7 12l8 8"/></svg>',
    chev: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4l8 8-8 8"/></svg>'
  };

  /* ============ общие кусочки ============ */
  V.avatar = function (name) {
    return '<div class="avatar" style="background:' + U.color(name) + '">' + esc(U.initials(name)) + '</div>';
  };

  /* Итог, который может не сводиться в базовую валюту */
  V.sum = function (value, bag) {
    if (value != null) return U.money(value);
    var parts = [];
    for (var c in bag) if (bag[c]) parts.push(U.money(bag[c], c));
    return parts.length ? parts.join(' + ') : U.money(0);
  };
  V.hasMoney = function (value, bag) {
    if (value != null) return value > 0.5;
    for (var c in bag) if (bag[c] > 0.5) return true;
    return false;
  };

  V.badge = function (l, r) {
    if (r.isClosed) return '<span class="badge">Закрыт</span>';
    if (r.isPaidOff) return '<span class="badge ok">Погашен</span>';
    if (r.missed) return '<span class="badge bad">Не заплатил ' + r.missed + ' ' +
      U.plural(r.missed, 'месяц', 'месяца', 'месяцев') + '</span>';
    if (r.isOverdue) return '<span class="badge bad">Просрочка ' + U.days(r.overdueDays) + '</span>';
    if (r.nextPay && U.diffDays(U.today(), r.nextPay.date) <= 3)
      return '<span class="badge warn">Проценты ' + U.relDate(r.nextPay.date) + '</span>';
    if (r.daysLeft != null && r.daysLeft <= 3) return '<span class="badge warn">Возврат ' + U.relDate(l.dueAt) + '</span>';
    return '';
  };

  V.rateText = function (l, r) {
    if (l.model === 'fixed') return 'фикс. возврат ' + U.money(l.returnAmount, l.currency);
    var txt = U.pct(l.rate) + CALC.PERIOD_SHORT[l.ratePeriod];
    if (l.payMode === 'monthly') {
      var bal = r ? r.balance : U.num(l.principal);
      txt += ' · ' + U.money(CALC.perMonth(l, bal), l.currency) + '/мес';
    }
    return txt;
  };

  V.loanRow = function (l) {
    var c = DB.client(l.clientId) || { name: 'Без клиента' };
    var r = CALC.loan(l);
    var b = V.badge(l, r);
    var meta = V.rateText(l, r);
    var v2 = r.isClosed ? 'закрыт'
      : r.nextPay ? 'платёж ' + U.fmtDate(r.nextPay.date)
        : l.dueAt ? 'до ' + U.fmtDate(l.dueAt) : 'без срока';
    return '<button class="row tap" data-act="loan" data-id="' + l.id + '">' +
      V.avatar(c.name) +
      '<span class="grow"><span class="ttl">' + esc(c.name) + '</span>' +
      '<span class="sub">' + (b ? b + ' ' : '') + esc(meta) + '</span></span>' +
      '<span class="val"><span class="v1 num">' + U.money(r.isClosed ? r.principal : r.totalDue, l.currency) + '</span>' +
      '<span class="v2">' + v2 + '</span></span>' +
      '<span class="chev">' + V.ICON.chev + '</span></button>';
  };

  V.clientRow = function (c) {
    var loans = DB.loansOf(c.id);
    var p = CALC.portfolio(loans);
    var active = loans.filter(function (l) { return l.status !== 'closed'; }).length;
    var sub = active ? active + ' ' + U.plural(active, 'активный заём', 'активных займа', 'активных займов')
      : (loans.length ? 'нет активных займов' : (c.phone ? esc(c.phone) : 'без займов'));
    return '<button class="row tap" data-act="client" data-id="' + c.id + '">' +
      V.avatar(c.name) +
      '<span class="grow"><span class="ttl">' + esc(c.name) + '</span><span class="sub">' + sub +
      (p.overdueCount ? ' · <b style="color:var(--red)">просрочка</b>' : '') + '</span></span>' +
      '<span class="val"><span class="v1 num">' + V.sum(p.totalDue, p.cur.totalDue) + '</span>' +
      (V.hasMoney(p.profitRealized, p.cur.profit) ? '<span class="v2">заработано ' + V.sum(p.profitRealized, p.cur.profit) + '</span>' : '') +
      '</span><span class="chev">' + V.ICON.chev + '</span></button>';
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

  /* ============ ОБЗОР ============ */
  V.home = function () {
    var loans = DB.loans(), s = CALC.portfolio(loans);
    var mk = U.monthKey(U.today());
    var byM = CALC.byMonth(loans), issued = CALC.issuedByMonth(loans);
    var mProfit = (byM[mk] || {}).interest || 0;
    var mIssued = issued[mk] || 0;

    var h = V.topbar('Обзор', '<button data-act="new-loan" style="font-size:26px;font-weight:300">＋</button>');
    h += '<div class="wrap"><h1 class="big">Обзор</h1>';

    if (DB.data.isDemo && loans.length) {
      h += '<div class="card pad" style="margin-bottom:12px;background:var(--warn-soft)">' +
        '<div style="font-weight:600;margin-bottom:3px">Это демонстрационные данные</div>' +
        '<div style="font-size:14px;color:var(--text-2);line-height:1.4">Вымышленные клиенты и займы, чтобы посмотреть, как всё работает. Очистите их перед тем, как заносить своё.</div>' +
        '<button class="btn sec sm" style="margin-top:12px;width:100%" data-act="demo-off">Очистить и начать с нуля</button></div>';
    }

    if (!loans.length) {
      h += V.empty('💰', 'Пока нет ни одного займа',
        'Добавьте первый заём — приложение само посчитает проценты, месячные платежи и просрочку.',
        '<div style="margin-top:18px"><button class="btn" data-act="new-loan">Выдать заём</button>' +
        '<button class="btn sec" style="margin-top:8px" data-act="go-import">Загрузить свою базу</button>' +
        '<button class="btn ghost" style="margin-top:8px" data-act="demo">Посмотреть на примере</button></div>');
      return h + '</div>';
    }

    h += '<div class="hero">' +
      '<div class="lbl">Должны вернуть</div>' +
      '<div class="amt num">' + V.sum(s.totalDue, s.cur.totalDue) + '</div>' +
      '<div class="delta">тело ' + V.sum(s.outstanding, s.cur.outstanding) +
      ' · проценты ' + V.sum(s.interestDue, s.cur.interestDue) + '</div>' +
      (V.hasMoney(s.dailyAccrual, s.cur.daily)
        ? '<div class="delta" style="color:var(--accent);font-weight:600">+' + V.sum(s.dailyAccrual, s.cur.daily) + ' каждый день</div>' : '') +
      '</div>';

    if (s.mixed) {
      h += '<div class="card pad" style="margin-top:12px;background:var(--warn-soft)">' +
        '<div style="font-weight:600;margin-bottom:3px">Займы в разных валютах</div>' +
        '<div style="font-size:14px;color:var(--text-2);line-height:1.4">Чтобы видеть один общий итог, задайте курс валют — вручную или обновите из банка.</div>' +
        '<button class="btn sec sm" style="margin-top:12px;width:100%" data-act="go-rates">Задать курс</button></div>';
    }

    /* главное для ежемесячных процентов */
    var expects = V.hasMoney(s.monthDue, s.cur.monthDue);
    if (expects || mProfit) {
      h += '<h2 class="sec">Проценты за ' + U.monthName(mk).toLowerCase().replace(/ \d+$/, '') + '</h2>' +
        '<div class="card pad">' +
        '<div class="kv big"><span class="k">Уже получено</span><span class="v num" style="color:var(--accent)">' +
        (mProfit ? U.money(mProfit) : '—') + '</span></div>' +
        '<div class="kv big"><span class="k">Ещё ждём</span><span class="v num">' +
        (expects ? V.sum(s.monthDue, s.cur.monthDue) : '—') + '</span></div>' +
        '</div>';
    }

    h += '<div class="stats">' +
      '<div class="stat"><div class="k"><span class="dot" style="background:var(--red)"></span>Просрочено</div>' +
      '<div class="v num" style="color:' + (s.overdueCount ? 'var(--red)' : 'inherit') + '">' +
      (s.overdueCount ? V.sum(s.overdueSum, s.cur.overdueSum) : '—') + '</div>' +
      '<div class="k" style="margin-top:2px">' + (s.overdueCount ? s.overdueCount + ' ' + U.plural(s.overdueCount, 'заём', 'займа', 'займов') : 'всё по графику') + '</div></div>' +

      '<div class="stat"><div class="k"><span class="dot" style="background:var(--violet)"></span>Ожидаю всего</div>' +
      '<div class="v num">' + V.sum(s.profitExpected, s.cur.expected) + '</div>' +
      '<div class="k" style="margin-top:2px">процентов по активным</div></div>' +

      '<div class="stat"><div class="k"><span class="dot" style="background:var(--blue)"></span>Выдано за месяц</div>' +
      '<div class="v num">' + (mIssued ? U.money(mIssued) : '—') + '</div>' +
      '<div class="k" style="margin-top:2px">' + U.monthName(mk) + '</div></div>' +

      '<div class="stat"><div class="k"><span class="dot" style="background:var(--accent)"></span>В работе</div>' +
      '<div class="v num">' + V.sum(s.outstanding, s.cur.outstanding) + '</div>' +
      '<div class="k" style="margin-top:2px">' + s.activeCount + ' ' + U.plural(s.activeCount, 'активный заём', 'активных займа', 'активных займов') + '</div></div>' +
      '</div>';

    h += '<div class="btn-row"><button class="btn" data-act="new-loan">＋ Выдать заём</button>' +
      '<button class="btn sec" data-act="quick-pay">Принять платёж</button></div>';

    if (s.overdue.length) {
      h += '<h2 class="sec" style="color:var(--red)">Просрочено · ' + s.overdue.length + '</h2><div class="list">';
      s.overdue.slice(0, 8).forEach(function (x) { h += V.loanRow(x.loan); });
      h += '</div>';
    }
    if (s.dueSoon.length) {
      h += '<h2 class="sec">Ближайшие платежи</h2><div class="list">';
      s.dueSoon.slice(0, 8).forEach(function (x) { h += V.loanRow(x.loan); });
      h += '</div>';
    }

    var recent = [];
    loans.forEach(function (l) {
      (l.payments || []).forEach(function (p) { recent.push({ l: l, p: p }); });
    });
    recent.sort(function (a, b) { return a.p.date < b.p.date ? 1 : -1; });
    if (recent.length) {
      h += '<h2 class="sec">Последние платежи</h2><div class="list">';
      recent.slice(0, 5).forEach(function (x) {
        var c = DB.client(x.l.clientId) || { name: '—' };
        h += '<button class="row tap" data-act="loan" data-id="' + x.l.id + '">' + V.avatar(c.name) +
          '<span class="grow"><span class="ttl">' + esc(c.name) + '</span>' +
          '<span class="sub">' + U.relDate(x.p.date) + (x.p.note ? ' · ' + esc(x.p.note) : '') + '</span></span>' +
          '<span class="val"><span class="v1 num" style="color:var(--accent)">+' + U.money(x.p.amount, x.l.currency) + '</span></span>' +
          '<span class="chev">' + V.ICON.chev + '</span></button>';
      });
      h += '</div>';
    }

    if (!DB.data.settings.lastExport || U.diffDays(DB.data.settings.lastExport, U.today()) > 14) {
      h += '<div class="card pad" style="margin-top:22px">' +
        '<div style="font-weight:600;margin-bottom:4px">Сделайте резервную копию</div>' +
        '<div style="font-size:14px;color:var(--text-2);line-height:1.4">База хранится только на этом телефоне. Сохраните файл копии в «Файлы» или отправьте себе — тогда данные не пропадут при смене телефона.</div>' +
        '<button class="btn sec sm" style="margin-top:12px;width:100%" data-act="export-json">Сохранить копию</button></div>';
    }

    return h + '</div>';
  };

  /* ============ ЗАЙМЫ ============ */
  V.loansFilter = 'active';
  V.loansQuery = '';

  V.loans = function () {
    var all = DB.loans();
    var act = all.filter(function (l) { return l.status !== 'closed'; });
    var over = act.filter(function (l) { return CALC.loan(l).isOverdue; });
    var cl = all.filter(function (l) { return l.status === 'closed'; });

    var list = V.loansFilter === 'active' ? act : V.loansFilter === 'overdue' ? over :
      V.loansFilter === 'closed' ? cl : all;

    var q = V.loansQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(function (l) {
        var c = DB.client(l.clientId) || { name: '', phone: '' };
        return (c.name + ' ' + (c.phone || '') + ' ' + (l.note || '')).toLowerCase().indexOf(q) >= 0;
      });
    }
    list = list.slice().sort(function (a, b) {
      var ra = CALC.loan(a), rb = CALC.loan(b);
      if (ra.isOverdue !== rb.isOverdue) return ra.isOverdue ? -1 : 1;
      var da = a.dueAt || '9999', db = b.dueAt || '9999';
      return da < db ? -1 : da > db ? 1 : 0;
    });

    var sum = list.reduce(function (a, l) { var r = CALC.loan(l); return a + (r.isClosed ? 0 : r.totalDue); }, 0);

    var h = V.topbar('Займы', '<button data-act="new-loan" style="font-size:26px;font-weight:300">＋</button>');
    h += '<div class="wrap"><h1 class="big">Займы</h1>';
    h += '<div class="search">' + V.ICON.search +
      '<input id="q" type="search" placeholder="Имя, телефон, заметка" value="' + esc(V.loansQuery) + '" autocomplete="off"></div>';
    h += '<div class="seg">' +
      seg('active', 'Активные', act.length) +
      seg('overdue', 'Просрочка', over.length) +
      seg('closed', 'Закрытые', cl.length) +
      seg('all', 'Все', all.length) + '</div>';

    if (!list.length) {
      h += V.empty('🔍', 'Ничего не найдено', q ? 'Попробуйте другой запрос.' : 'В этой вкладке пока пусто.');
    } else {
      if (V.loansFilter !== 'closed' && sum > 0) {
        h += '<div style="font-size:13px;color:var(--text-2);margin:0 4px 8px">' +
          list.length + ' ' + U.plural(list.length, 'заём', 'займа', 'займов') + ' · к возврату <b class="num" style="color:var(--text)">' + U.money(sum) + '</b></div>';
      }
      h += '<div class="list">';
      list.forEach(function (l) { h += V.loanRow(l); });
      h += '</div>';
    }
    return h + '</div>';

    function seg(k, t, n) {
      return '<button data-act="filter" data-f="' + k + '" class="' + (V.loansFilter === k ? 'on' : '') + '">' +
        t + (n ? ' <span class="cnt">' + n + '</span>' : '') + '</button>';
    }
  };

  /* ============ КЛИЕНТЫ ============ */
  V.clientsQuery = '';

  V.clients = function () {
    var list = DB.clients().slice();
    var q = V.clientsQuery.trim().toLowerCase();
    if (q) list = list.filter(function (c) { return (c.name + ' ' + (c.phone || '') + ' ' + (c.note || '')).toLowerCase().indexOf(q) >= 0; });

    list.sort(function (a, b) {
      var pa = CALC.portfolio(DB.loansOf(a.id)), pb = CALC.portfolio(DB.loansOf(b.id));
      if (!!pa.overdueCount !== !!pb.overdueCount) return pa.overdueCount ? -1 : 1;
      if (pb.totalDue !== pa.totalDue) return pb.totalDue - pa.totalDue;
      return a.name.localeCompare(b.name, 'ru');
    });

    var h = V.topbar('Клиенты', '<button data-act="new-client" style="font-size:26px;font-weight:300">＋</button>');
    h += '<div class="wrap"><h1 class="big">Клиенты</h1>';
    if (DB.clients().length > 6) {
      h += '<div class="search">' + V.ICON.search +
        '<input id="qc" type="search" placeholder="Поиск по имени или телефону" value="' + esc(V.clientsQuery) + '" autocomplete="off"></div>';
    }
    if (!list.length) {
      h += V.empty('👤', q ? 'Никого не нашлось' : 'Список клиентов пуст',
        q ? 'Попробуйте другой запрос.' : 'Клиент создаётся автоматически при выдаче займа — или добавьте вручную.',
        q ? '' : '<div style="margin-top:18px"><button class="btn" data-act="new-client">Добавить клиента</button></div>');
    } else {
      h += '<div class="list">';
      list.forEach(function (c) { h += V.clientRow(c); });
      h += '</div>';
      h += '<div style="font-size:13px;color:var(--text-2);margin:10px 4px">Всего ' + list.length + ' ' +
        U.plural(list.length, 'клиент', 'клиента', 'клиентов') + '</div>';
    }
    return h + '</div>';
  };

  /* ============ ЕЩЁ ============ */
  V.more = function () {
    var st = DB.data.settings;
    var loans = DB.loans(), s = CALC.portfolio(loans);
    var byM = CALC.byMonth(loans), issued = CALC.issuedByMonth(loans);
    var months = Object.keys(byM).concat(Object.keys(issued))
      .filter(function (v, i, a) { return a.indexOf(v) === i; }).sort().reverse().slice(0, 6);

    var h = V.topbar('Ещё');
    h += '<div class="wrap"><h1 class="big">Ещё</h1>';

    h += '<div class="card pad">' +
      '<div class="kv big"><span class="k">Выдано за всё время</span><span class="v num">' + V.sum(s.issuedTotal, s.cur.issued) + '</span></div>' +
      '<div class="kv big"><span class="k">Заработано процентов</span><span class="v num" style="color:var(--accent)">' + V.sum(s.profitRealized, s.cur.profit) + '</span></div>' +
      '<div class="kv"><span class="k">Сейчас в работе</span><span class="v num">' + V.sum(s.outstanding, s.cur.outstanding) + '</span></div>' +
      '<div class="kv"><span class="k">Активных займов</span><span class="v num">' + s.activeCount + ' из ' + s.count + '</span></div>' +
      '</div>';

    if (months.length) {
      h += '<h2 class="sec">По месяцам</h2><div class="list">';
      months.forEach(function (m) {
        var got = (byM[m] || {}).interest || 0, tot = (byM[m] || {}).total || 0, out = issued[m] || 0;
        h += '<div class="row"><span class="grow"><span class="ttl">' + esc(U.monthName(m)) + '</span>' +
          '<span class="sub">выдано ' + U.money(out) + ' · принято ' + U.money(tot) + '</span></span>' +
          '<span class="val"><span class="v1 num" style="color:' + (got ? 'var(--accent)' : 'var(--text-3)') + '">' +
          (got ? '+' + U.money(got) : '—') + '</span><span class="v2">процентов</span></span></div>';
      });
      h += '</div>';
      if (s.mixed) h += '<div class="hint">Займы в валютах без курса в эти суммы не вошли.</div>';
    }

    h += '<h2 class="sec">Условия по умолчанию</h2><div class="list">';
    h += '<div class="field"><label>Основная валюта</label><select data-act="set" data-k="currency">' +
      FX.LIST.map(function (c) {
        return '<option value="' + c.code + '"' + (st.currency === c.code ? ' selected' : '') + '>' + esc(c.name) + ' · ' + esc(c.sym) + '</option>';
      }).join('') + '</select></div>';
    h += '<div class="field"><label>Ставка</label><input type="number" inputmode="decimal" step="0.1" value="' + st.defaultRate + '" data-act="set" data-k="defaultRate"><span class="unit">%</span></div>';
    h += '<div class="field"><label>Период</label><select data-act="set" data-k="defaultPeriod">' +
      [['day', 'в день'], ['week', 'в неделю'], ['month', 'в месяц'], ['year', 'в год']].map(function (t) {
        return '<option value="' + t[0] + '"' + (st.defaultPeriod === t[0] ? ' selected' : '') + '>' + t[1] + '</option>';
      }).join('') + '</select></div>';
    h += '<div class="field"><label>Проценты платят</label><select data-act="set" data-k="defaultPayMode">' +
      [['monthly', 'каждый месяц'], ['end', 'в конце срока']].map(function (t) {
        return '<option value="' + t[0] + '"' + (st.defaultPayMode === t[0] ? ' selected' : '') + '>' + t[1] + '</option>';
      }).join('') + '</select></div>';
    h += '<div class="field"><label>Срок</label><input type="number" inputmode="numeric" value="' + st.defaultTerm + '" data-act="set" data-k="defaultTerm"><span class="unit">дней</span></div>';
    h += '<div class="field"><label>Пеня</label><input type="number" inputmode="decimal" step="0.1" value="' + st.penaltyRate + '" data-act="set" data-k="penaltyRate"><span class="unit">% в день</span></div>';
    h += '<div class="field"><label>Оформление</label><select data-act="set" data-k="theme">' +
      [['auto', 'Как в системе'], ['light', 'Светлое'], ['dark', 'Тёмное']].map(function (t) {
        return '<option value="' + t[0] + '"' + (st.theme === t[0] ? ' selected' : '') + '>' + t[1] + '</option>';
      }).join('') + '</select></div>';
    h += '</div><div class="hint">Эти значения подставляются в новый заём — в каждом займе их можно поменять.</div>';

    /* ---------- курсы ---------- */
    var used = {};
    loans.forEach(function (l) { used[l.currency || st.currency] = 1; });
    used[st.currency] = 1;

    h += '<h2 class="sec" id="rates">Курс валют</h2>';
    h += '<div class="list">' +
      '<div class="field"><label>Источник</label><select data-act="set" data-k="ratesPref">' +
      [['auto', 'Любой доступный'], ['cbu', 'ЦБ Узбекистана'], ['nbkr', 'Нацбанк Кыргызстана'], ['world', 'Мировой справочник']]
        .map(function (t) { return '<option value="' + t[0] + '"' + (st.ratesPref === t[0] ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') +
      '</select></div>' +
      '<button class="row tap" data-act="rates-update"><span class="grow">' +
      '<span class="ttl" style="color:var(--accent)">Обновить курс из интернета</span>' +
      '<span class="sub">' + (st.ratesDate ? esc(st.ratesSource || '') + ' · ' + U.fmtDate(st.ratesDate) : 'ещё не обновлялся') + '</span>' +
      '</span></button></div>';

    h += '<div class="list" style="margin-top:12px">';
    FX.LIST.forEach(function (c) {
      if (c.code === 'USD') return;
      var v = (st.rates || {})[c.code];
      h += '<div class="field"><label>1 $ =</label>' +
        '<input type="text" inputmode="decimal" placeholder="не задан" value="' + (v ? String(v).replace('.', ',') : '') + '" ' +
        'data-act="set-rate" data-c="' + c.code + '"><span class="unit">' + esc(c.sym) + '</span></div>';
    });
    h += '</div><div class="hint">Курс нужен, только если вы даёте деньги <b>в разных валютах</b> — чтобы свести всё в один итог. ' +
      'Можно вписать вручную: так надёжнее всего, и интернет не нужен.</div>';

    h += '<h2 class="sec">Защита</h2><div class="list">' +
      '<button class="row tap" data-act="pin">' +
      '<span class="grow"><span class="ttl">Код-пароль</span><span class="sub">' +
      (st.pin ? 'включён — спрашивается при запуске' : 'выключен') + '</span></span>' +
      '<span class="val"><span class="v1" style="color:var(--accent);font-size:15px">' + (st.pin ? 'Изменить' : 'Включить') + '</span></span></button>' +
      (st.pin ? '<button class="row tap" data-act="pin-off"><span class="grow"><span class="ttl" style="color:var(--red)">Отключить код</span></span></button>' : '') +
      '</div>';

    h += '<h2 class="sec">Данные</h2><div class="list">' +
      rowBtn('export-json', 'Сохранить резервную копию', st.lastExport ? 'последняя: ' + U.fmtDate(st.lastExport) : 'ещё ни разу') +
      rowBtn('export-csv', 'Выгрузить таблицу CSV', 'для Excel и Numbers') +
      rowBtn('import', 'Загрузить базу', 'копия приложения или таблица CSV') +
      '<button class="row tap" data-act="wipe"><span class="grow"><span class="ttl" style="color:var(--red)">Стереть все данные</span></span></button>' +
      '</div>';
    h += '<div class="hint">Всё хранится <b>только на этом телефоне</b>, без сервера и интернета. Делайте копию хотя бы раз в месяц.</div>';

    h += '<h2 class="sec">Установка на iPhone</h2><div class="card pad" style="font-size:15px;line-height:1.5;color:var(--text-2)">' +
      '1. Откройте эту страницу в Safari.<br>2. Нажмите кнопку «Поделиться» (квадрат со стрелкой).<br>' +
      '3. Выберите «На экран «Домой»».<br>4. Запускайте с иконки — приложение работает без интернета.</div>';

    h += '<div style="text-align:center;color:var(--text-3);font-size:13px;margin:26px 0 10px">Капитал · версия 1.1</div>';
    return h + '</div>';

    function rowBtn(act, t, sub) {
      return '<button class="row tap" data-act="' + act + '"><span class="grow"><span class="ttl">' + t + '</span>' +
        (sub ? '<span class="sub">' + esc(sub) + '</span>' : '') + '</span><span class="chev">' + V.ICON.chev + '</span></button>';
    }
  };

  w.V = V;
})(window);
