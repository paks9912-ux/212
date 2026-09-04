/* Карточка займа, карточка клиента и формы ввода */
(function (w) {
  'use strict';
  var esc = U.esc;

  /* ============ КАРТОЧКА ЗАЙМА ============ */
  V.loanDetail = function (id) {
    var l = DB.loan(id);
    if (!l) return V.topbarBack('Заём') + '<div class="wrap">' + V.empty('🤷', 'Заём не найден', 'Возможно, он был удалён.') + '</div>';
    var c = DB.client(l.clientId) || { name: 'Без клиента', phone: '' };
    var r = CALC.loan(l), plan = CALC.plan(l);
    var cur = l.currency || FX.base(), base = FX.base();
    var m = function (v, o) { o = o || {}; o.cur = cur; return U.money(v, o); };

    var h = V.topbarBack(c.name, '<button data-act="edit-loan" data-id="' + l.id + '">Изменить</button>');
    h += '<div class="wrap">';

    h += '<div style="display:flex;align-items:center;gap:12px;margin:2px 0 14px">' + V.avatar(c.name) +
      '<div style="min-width:0"><div style="font-size:22px;font-weight:700;letter-spacing:-.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(c.name) + '</div>' +
      '<div style="font-size:13px;color:var(--text-2)">Заём от ' + U.fmtDateFull(l.issuedAt) + '</div></div></div>';

    var alt = (cur !== base && FX.can(cur, base)) ? FX.conv(r.totalDue, cur, base) : null;
    /* если ниже будет красная карточка про пропуски — бейдж в шапке не дублируем */
    var missedCard = !r.isClosed && l.payMode === 'monthly' && l.model !== 'fixed' && r.missed > 0;
    h += '<div class="hero">' +
      '<div class="lbl">' + (r.isClosed ? 'Заём закрыт' : r.isPaidOff ? 'Долг погашен' : 'Долг на сегодня') + '</div>' +
      '<div class="amt num"' + (r.isOverdue ? ' style="color:var(--red)"' : '') + '>' + m(r.isClosed ? 0 : r.totalDue) + '</div>' +
      (alt != null ? '<div class="delta">≈ ' + U.money(alt) + '</div>' : '') +
      '<div class="delta" style="margin-top:8px">' +
      (missedCard ? '<span class="badge bad">Просрочка</span>' : (V.badge(l, r) || '<span class="badge ok">Активен</span>')) + '</div>' +
      (!r.isClosed && r.dailyAccrual > 0 ? '<div class="delta">капает ' + m(r.dailyAccrual, { exact: r.dailyAccrual < 100 }) + ' в день</div>' : '') +
      progress(r) + '</div>';

    /* ---- ежемесячные проценты: главное на экране ---- */
    if (!r.isClosed && l.payMode === 'monthly' && l.model !== 'fixed') {
      var perM = CALC.perMonth(l, r.balance);
      if (r.missed) {
        h += '<div class="card pad" style="margin-top:12px;background:var(--danger-soft)">' +
          '<div style="font-size:13px;color:var(--red);font-weight:600">Не заплатил за ' + r.missed + ' ' +
          U.plural(r.missed, 'месяц', 'месяца', 'месяцев') + '</div>' +
          '<div style="font-size:28px;font-weight:700;letter-spacing:-.5px;margin-top:3px" class="num">' +
          m(r.interestDue + r.penaltyDue) + '</div>' +
          '<div style="font-size:13px;color:var(--text-2);margin-top:2px">нужно получить, чтобы выйти в график</div></div>';
      } else if (r.nextPay) {
        h += '<div class="card pad" style="margin-top:12px">' +
          '<div style="font-size:13px;color:var(--text-2)">Следующий платёж процентов</div>' +
          '<div style="font-size:28px;font-weight:700;letter-spacing:-.5px;margin-top:3px" class="num">' + m(r.nextPay.due) + '</div>' +
          '<div style="font-size:13px;color:var(--text-2);margin-top:2px">' +
          U.fmtDateFull(r.nextPay.date) + ' · ' + U.relDate(r.nextPay.date) + '</div></div>';
      }
      h += '<div style="font-size:13px;color:var(--text-2);margin:8px 4px 0">' +
        'Каждый месяц: <b style="color:var(--text)">' + m(perM) + '</b> процентами. ' +
        (l.dueAt ? 'Тело ' + m(r.balance) + ' — до ' + U.fmtDate(l.dueAt) + '.' : 'Тело возвращается, когда договоритесь.') +
        '</div>';
    }

    if (!r.isClosed) {
      h += '<div class="btn-row"><button class="btn" data-act="pay" data-id="' + l.id + '">Принять платёж</button></div>';
    }
    if (c.phone) {
      h += '<div class="btn-row"><a class="btn sec" href="' + U.telHref(c.phone) + '">Позвонить</a>' +
        '<a class="btn sec" href="' + U.waHref(c.phone) + '" target="_blank" rel="noopener">WhatsApp</a></div>';
    }

    /* ---- график ---- */
    if (r.schedule && r.schedule.length) {
      var shown = r.schedule.filter(function (p) { return p.status !== 'future'; });
      var future = r.schedule.filter(function (p) { return p.status === 'future'; });
      if (future.length) shown = shown.concat(future.slice(0, 3));
      h += '<h2 class="sec">График процентов</h2><div class="list">';
      shown.forEach(function (p) {
        var mark = p.status === 'paid' ? '<span class="badge ok">оплачен</span>'
          : p.status === 'overdue' ? '<span class="badge bad">не оплачен</span>'
            : p.status === 'soon' ? '<span class="badge warn">' + U.relDate(p.date) + '</span>'
              : '<span class="badge">' + U.relDate(p.date) + '</span>';
        h += '<div class="row"><span class="grow"><span class="ttl">' + U.fmtDate(p.date, true) + '</span>' +
          '<span class="sub">' + mark + ' месяц ' + p.n + '</span></span>' +
          '<span class="val"><span class="v1 num"' + (p.status === 'overdue' ? ' style="color:var(--red)"' : p.status === 'paid' ? ' style="color:var(--text-3)"' : '') + '>' +
          m(p.due) + '</span></span></div>';
      });
      if (l.dueAt) {
        h += '<div class="row"><span class="grow"><span class="ttl">' + U.fmtDate(l.dueAt, true) + '</span>' +
          '<span class="sub">возврат тела</span></span>' +
          '<span class="val"><span class="v1 num">' + m(r.balance) + '</span></span></div>';
      }
      h += '</div>';
      if (future.length > 3) h += '<div class="hint">Дальше — ещё ' + (future.length - 3) + ' ' +
        U.plural(future.length - 3, 'платёж', 'платежа', 'платежей') + ' по такому же графику.</div>';
    }

    h += '<h2 class="sec">Условия</h2><div class="card pad">' +
      kv('Выдано на руки', m(l.principal)) +
      (l.model === 'fixed'
        ? kv('Фиксированный возврат', m(l.returnAmount))
        : kv('Ставка', U.pct(l.rate) + ' ' + CALC.PERIOD_NAME[l.ratePeriod])) +
      (l.model !== 'fixed' ? kv('Проценты платит', l.payMode === 'monthly' ? 'каждый месяц' : 'в конце срока') : '') +
      kv('Валюта', esc(FX.byCode(cur).name)) +
      kv('Вернуть тело', l.dueAt ? U.fmtDateFull(l.dueAt) + '<span style="color:var(--text-2);font-weight:400"> · ' + U.relDate(l.dueAt) + '</span>' : 'срок не назначен') +
      (U.num(l.penaltyRate) > 0 ? kv('Пеня за просрочку', U.pct(l.penaltyRate) + ' в день') : '') +
      (l.stopAccrual ? kv('После срока', 'проценты не растут') : '') +
      (l.note ? kv('Заметка', esc(l.note)) : '') +
      '</div>';

    h += '<h2 class="sec">Расчёт на сегодня</h2><div class="card pad">' +
      kv('Остаток основного долга', m(r.balance)) +
      kv('Начислено процентов', m(r.interestAccrued)) +
      (r.penaltyAccrued > 0 ? kv('Пеня', '<span style="color:var(--red)">' + m(r.penaltyAccrued) + '</span>') : '') +
      kv('Уже выплачено', m(r.paidTotal)) +
      kv('Из них проценты', '<span style="color:var(--accent)">' + m(r.profit) + '</span>') +
      (r.overpay > 0 ? kv('Переплата', m(r.overpay)) : '') +
      '<div class="kv big"><span class="k">Итого к возврату</span><span class="v num">' + m(r.isClosed ? 0 : r.totalDue) + '</span></div>' +
      (!r.isClosed && l.dueAt && r.daysLeft > 0
        ? '<div class="kv"><span class="k">Всего заработаете к сроку</span><span class="v num" style="color:var(--accent)">' +
        m(plan.interestDue + plan.penaltyDue + r.profit) + '</span></div>' : '') +
      '</div>';

    var pays = (l.payments || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    h += '<h2 class="sec">Платежи' + (pays.length ? ' · ' + pays.length : '') + '</h2>';
    if (!pays.length) {
      h += '<div class="card pad" style="color:var(--text-2);font-size:15px">Платежей ещё не было.</div>';
    } else {
      var amap = {}; r.alloc.forEach(function (a) { amap[a.id] = a; });
      h += '<div class="list">';
      pays.forEach(function (p) {
        var a = amap[p.id], parts = [];
        if (a) {
          if (a.pen > 0.5) parts.push('пеня ' + m(a.pen));
          if (a.int > 0.5) parts.push('проценты ' + m(a.int));
          if (a.prin > 0.5) parts.push('тело ' + m(a.prin));
        }
        h += '<button class="row tap" data-act="del-pay" data-id="' + l.id + '" data-pid="' + p.id + '">' +
          '<span class="grow"><span class="ttl">' + U.fmtDate(p.date, true) + '</span>' +
          '<span class="sub">' + (parts.join(' · ') || 'зачтено') + (p.note ? ' · ' + esc(p.note) : '') + '</span></span>' +
          '<span class="val"><span class="v1 num" style="color:var(--accent)">+' + m(p.amount) + '</span></span></button>';
      });
      h += '</div><div class="hint">Нажмите на платёж, чтобы удалить его.</div>';
    }

    h += '<div style="margin:26px 0 10px">';
    if (!r.isClosed) h += '<button class="btn sec" data-act="close-loan" data-id="' + l.id + '">Закрыть заём вручную</button>';
    else h += '<button class="btn sec" data-act="reopen-loan" data-id="' + l.id + '">Вернуть в активные</button>';
    h += '<button class="btn danger" style="margin-top:10px" data-act="del-loan" data-id="' + l.id + '">Удалить заём</button></div>';

    return h + '</div>';

    function kv(k, v) { return '<div class="kv"><span class="k">' + k + '</span><span class="v num">' + v + '</span></div>'; }
    function progress(r) {
      if (l.payMode === 'monthly' && !l.dueAt) return '';
      var total = r.principal + r.interestAccrued + r.penaltyAccrued;
      if (!total) return '';
      var pc = Math.max(0, Math.min(100, r.paidTotal / total * 100));
      return '<div class="bar"><i style="width:' + pc.toFixed(1) + '%"></i></div>' +
        '<div class="delta">выплачено ' + Math.round(pc) + '% от ' + m(total) + '</div>';
    }
  };

  /* ============ КАРТОЧКА КЛИЕНТА ============ */
  V.clientDetail = function (id) {
    var c = DB.client(id);
    if (!c) return V.topbarBack('Клиент') + '<div class="wrap">' + V.empty('🤷', 'Клиент не найден', '') + '</div>';
    var loans = DB.loansOf(c.id), s = CALC.portfolio(loans);

    var h = V.topbarBack(c.name, '<button data-act="edit-client" data-id="' + c.id + '">Изменить</button>');
    h += '<div class="wrap">';
    h += '<div style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:6px 0 18px">' +
      '<div class="avatar" style="width:76px;height:76px;font-size:28px;background:' + U.color(c.name) + '">' + esc(U.initials(c.name)) + '</div>' +
      '<div style="font-size:24px;font-weight:700;margin-top:10px;letter-spacing:-.3px">' + esc(c.name) + '</div>' +
      (c.phone ? '<div style="font-size:15px;color:var(--text-2);margin-top:2px">' + esc(c.phone) + '</div>' : '') +
      (c.note ? '<div style="font-size:14px;color:var(--text-2);margin-top:6px;max-width:420px">' + esc(c.note) + '</div>' : '') +
      '</div>';

    if (c.phone) {
      h += '<div class="btn-row" style="margin-top:0"><a class="btn sec" href="' + U.telHref(c.phone) + '">Позвонить</a>' +
        '<a class="btn sec" href="' + U.waHref(c.phone) + '" target="_blank" rel="noopener">WhatsApp</a></div>';
    }

    h += '<div class="stats" style="margin-top:12px">' +
      '<div class="stat"><div class="k">Текущий долг</div><div class="v num"' + (s.overdueCount ? ' style="color:var(--red)"' : '') + '>' + U.money(s.totalDue) + '</div></div>' +
      '<div class="stat"><div class="k">Заработано</div><div class="v num" style="color:var(--accent)">' + U.money(s.profitRealized) + '</div></div>' +
      '<div class="stat"><div class="k">Выдано за всё время</div><div class="v num sm">' + U.money(s.issuedTotal) + '</div></div>' +
      '<div class="stat"><div class="k">Займов</div><div class="v num sm">' + s.count + (s.overdueCount ? ' · ' + s.overdueCount + ' просроч.' : '') + '</div></div>' +
      '</div>';

    h += '<div class="btn-row"><button class="btn" data-act="new-loan" data-client="' + c.id + '">＋ Новый заём</button></div>';

    h += '<h2 class="sec">История займов</h2>';
    if (!loans.length) {
      h += '<div class="card pad" style="color:var(--text-2);font-size:15px">Займов ещё не было.</div>';
    } else {
      h += '<div class="list">';
      loans.slice().sort(function (a, b) { return a.issuedAt < b.issuedAt ? 1 : -1; })
        .forEach(function (l) { h += V.loanRow(l); });
      h += '</div>';
    }

    h += '<div style="margin:26px 0 10px"><button class="btn danger" data-act="del-client" data-id="' + c.id + '">Удалить клиента и его займы</button></div>';
    return h + '</div>';
  };

  /* ============ ФОРМА ЗАЙМА ============ */
  var F = {};

  F.loanForm = function (loanId, presetClient) {
    var l = loanId ? DB.loan(loanId) : null;
    var st = DB.data.settings;
    var d = l || {
      clientId: presetClient || (DB.clients()[0] ? DB.clients()[0].id : '__new'),
      principal: '', currency: st.currency, model: 'simple',
      rate: st.defaultRate, ratePeriod: st.defaultPeriod, rateMode: 'percent',
      payMode: st.defaultPayMode || 'monthly',
      issuedAt: U.today(), dueAt: U.addDays(U.today(), st.defaultTerm || 30),
      penaltyRate: st.penaltyRate || 0, stopAccrual: false, note: ''
    };

    var opts = DB.clients().map(function (c) {
      return '<option value="' + c.id + '"' + (d.clientId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');

    var h = '';
    h += '<div class="list"><div class="field"><label>Клиент</label><select id="f-client">' + opts +
      '<option value="__new"' + (d.clientId === '__new' ? ' selected' : '') + '>＋ Новый клиент</option></select></div>' +
      '<div id="new-client-fields" style="display:none">' +
      '<div class="field"><label>Имя</label><input id="f-cname" placeholder="Иван Петров" autocomplete="off"></div>' +
      '<div class="field"><label>Телефон</label><input id="f-cphone" type="tel" inputmode="tel" placeholder="+998 90 000-00-00"></div>' +
      '</div></div>';

    h += '<h2 class="sec">Деньги</h2><div class="list">' +
      '<div class="field"><label>Сумма</label><input id="f-principal" type="text" inputmode="decimal" placeholder="0" value="' + (d.principal || '') + '"></div>' +
      '<div class="field"><label>Валюта</label><select id="f-cur">' +
      FX.LIST.map(function (c) {
        return '<option value="' + c.code + '"' + ((d.currency || st.currency) === c.code ? ' selected' : '') + '>' + esc(c.name) + ' · ' + esc(c.sym) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>Выдан</label><input id="f-issued" type="date" value="' + esc(d.issuedAt) + '"></div>' +
      '<div class="field"><label>Вернуть тело</label><input id="f-due" type="date" value="' + esc(d.dueAt || '') + '"></div>' +
      '</div>';
    h += '<div class="chips" style="border-radius:0 0 var(--radius) var(--radius);margin-top:-1px">' +
      [30, 60, 90, 180, 365].map(function (n) {
        return '<button class="chip" data-term="' + n + '">' + (n === 365 ? 'год' : n + ' дн') + '</button>';
      }).join('') +
      '<button class="chip' + (d.dueAt ? '' : ' on') + '" data-term="0">Без срока</button></div>';
    h += '<div class="hint">«Без срока» — тело лежит у клиента, пока он платит проценты.</div>';

    h += '<h2 class="sec">Проценты</h2><div class="seg" id="f-model">' +
      '<button data-model="simple" class="' + (d.model === 'simple' ? 'on' : '') + '">На остаток долга</button>' +
      '<button data-model="fixed" class="' + (d.model === 'fixed' ? 'on' : '') + '">Фикс. сумма</button></div>';

    h += '<div id="box-simple"' + (d.model === 'fixed' ? ' style="display:none"' : '') + '>' +
      '<div class="seg" id="f-ratemode">' +
      '<button data-rm="percent" class="' + (d.rateMode !== 'amount' ? 'on' : '') + '">Ставкой в %</button>' +
      '<button data-rm="amount" class="' + (d.rateMode === 'amount' ? 'on' : '') + '">Суммой в месяц</button></div>' +
      '<div class="list">' +
      '<div class="field" id="row-pct"><label>Ставка</label><input id="f-rate" type="text" inputmode="decimal" value="' + (d.rate != null ? d.rate : '') + '"><span class="unit">%</span></div>' +
      '<div class="field" id="row-per"><label>Период</label><select id="f-period">' +
      [['day', 'в день'], ['week', 'в неделю'], ['month', 'в месяц'], ['year', 'в год']].map(function (t) {
        return '<option value="' + t[0] + '"' + (d.ratePeriod === t[0] ? ' selected' : '') + '>' + t[1] + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field" id="row-amt"><label>Платёж</label><input id="f-rateamt" type="text" inputmode="decimal" placeholder="0" value="' + (d.rateAmount || '') + '"><span class="unit" id="u-amt">в месяц</span></div>' +
      '</div>' +
      '<div class="chips" id="rate-chips">' + [2, 3, 5, 8, 10, 15, 20].map(function (n) {
        return '<button class="chip" data-rate="' + n + '">' + n + '%</button>';
      }).join('') + '</div>' +
      '<h2 class="sec">Как платит проценты</h2>' +
      '<div class="seg" id="f-paymode">' +
      '<button data-pm="monthly" class="' + (d.payMode !== 'end' ? 'on' : '') + '">Каждый месяц</button>' +
      '<button data-pm="end" class="' + (d.payMode === 'end' ? 'on' : '') + '">В конце срока</button></div>' +
      '</div>';

    h += '<div class="list" id="box-fixed"' + (d.model !== 'fixed' ? ' style="display:none"' : '') + '>' +
      '<div class="field"><label>Вернёт всего</label><input id="f-return" type="text" inputmode="decimal" placeholder="0" value="' + (d.returnAmount || '') + '"></div></div>';

    h += '<div class="list" style="margin-top:12px">' +
      '<div class="field"><label>Пеня</label><input id="f-penalty" type="text" inputmode="decimal" value="' + (d.penaltyRate || 0) + '"><span class="unit">% в день</span></div>' +
      '<div class="field"><label style="min-width:auto;flex:1;font-size:16px">После срока проценты не растут</label>' +
      '<input id="f-stop" type="checkbox" style="flex:none;width:auto;-webkit-appearance:checkbox;appearance:checkbox;transform:scale(1.3)"' + (d.stopAccrual ? ' checked' : '') + '></div>' +
      '<div class="field col"><label>Заметка</label><textarea id="f-note" placeholder="Залог, поручитель, договорённости…">' + esc(d.note || '') + '</textarea></div>' +
      '</div>';

    h += '<div class="card pad" id="preview" style="margin-top:16px"></div>';

    App.sheet({
      title: l ? 'Изменить заём' : 'Новый заём',
      html: h,
      save: l ? 'Сохранить' : 'Выдать',
      onOpen: function (bd) {
        var $ = function (x) { return bd.querySelector(x); };
        function seg(id) { var b = bd.querySelector('#' + id + ' .on'); return b ? b.dataset : {}; }
        function model() { return seg('f-model').model || 'simple'; }
        function rateMode() { return seg('f-ratemode').rm || 'percent'; }
        function payMode() { return seg('f-paymode').pm || 'monthly'; }

        function draft() {
          var principal = U.num($('#f-principal').value);
          var rm = rateMode(), rate, period;
          if (rm === 'amount') {
            rate = CALC.rateFromAmount(principal, U.num($('#f-rateamt').value));
            period = 'month';
          } else {
            rate = U.num($('#f-rate').value);
            period = $('#f-period').value;
          }
          return {
            principal: principal,
            currency: $('#f-cur').value,
            model: model(),
            rate: rate, ratePeriod: period, rateMode: rm,
            rateAmount: U.num($('#f-rateamt').value),
            payMode: payMode(),
            returnAmount: U.num($('#f-return').value),
            issuedAt: $('#f-issued').value || U.today(),
            dueAt: $('#f-due').value || null,
            penaltyRate: U.num($('#f-penalty').value),
            stopAccrual: $('#f-stop').checked,
            note: $('#f-note').value.trim()
          };
        }

        function sync() {
          $('#new-client-fields').style.display = $('#f-client').value === '__new' ? '' : 'none';
          var am = rateMode() === 'amount';
          $('#row-pct').style.display = am ? 'none' : '';
          $('#row-per').style.display = am ? 'none' : '';
          $('#row-amt').style.display = am ? '' : 'none';
          $('#rate-chips').style.display = am ? 'none' : '';
          $('#u-amt').textContent = FX.sym($('#f-cur').value) + ' в месяц';
        }

        function preview() {
          var dr = draft(), box = $('#preview'), cur = dr.currency;
          var mm = function (v, o) { o = o || {}; o.cur = cur; return U.money(v, o); };
          if (!dr.principal) { box.innerHTML = '<div style="color:var(--text-2);font-size:15px">Введите сумму — покажу платёж и доход.</div>'; return; }

          if (dr.model === 'fixed') {
            var pr = Math.max(0, dr.returnAmount - dr.principal);
            box.innerHTML =
              '<div class="kv"><span class="k">Выдаёте</span><span class="v num">' + mm(dr.principal) + '</span></div>' +
              '<div class="kv big"><span class="k">Вернёт всего</span><span class="v num">' + mm(dr.returnAmount) + '</span></div>' +
              '<div class="kv big"><span class="k">Ваш доход</span><span class="v num" style="color:var(--accent)">+' + mm(pr) + '</span></div>';
            return;
          }

          var perM = CALC.perMonth(dr, dr.principal);
          var days = dr.dueAt ? U.diffDays(dr.issuedAt, dr.dueAt) : 0;
          var p = CALC.plan(Object.assign({ payments: [], status: 'active' }, dr));
          var out = '<div class="kv"><span class="k">Выдаёте</span><span class="v num">' + mm(dr.principal) + '</span></div>';

          if (dr.payMode === 'monthly') {
            out += '<div class="kv big"><span class="k">Каждый месяц</span><span class="v num" style="color:var(--accent)">' + mm(perM) + '</span></div>' +
              '<div class="kv"><span class="k">Тело вернёт</span><span class="v num">' +
              (dr.dueAt ? U.fmtDate(dr.dueAt, true) : 'когда договоритесь') + '</span></div>';
            if (days > 0) {
              out += '<div class="kv big"><span class="k">Доход за ' + U.days(days) + '</span><span class="v num" style="color:var(--accent)">+' +
                mm(p.interestDue + p.penaltyDue) + '</span></div>';
            } else {
              out += '<div class="kv"><span class="k">За год получится</span><span class="v num" style="color:var(--accent)">+' + mm(perM * 12) + '</span></div>';
            }
          } else {
            out += '<div class="kv"><span class="k">Срок</span><span class="v num">' + (days > 0 ? U.days(days) : 'не указан') + '</span></div>' +
              '<div class="kv big"><span class="k">Вернёт всего</span><span class="v num">' + mm(p.balance + p.interestDue + p.penaltyDue) + '</span></div>' +
              '<div class="kv big"><span class="k">Ваш доход</span><span class="v num" style="color:var(--accent)">+' + mm(p.interestDue + p.penaltyDue) + '</span></div>';
          }
          if (rateMode() === 'amount' && dr.principal) {
            out += '<div class="kv"><span class="k">Это ставка</span><span class="v num">' + U.pct(dr.rate) + ' в месяц</span></div>';
          }
          box.innerHTML = out;
        }

        bd.addEventListener('input', function () { sync(); preview(); });
        bd.addEventListener('change', function () { sync(); preview(); });
        bd.addEventListener('click', function (e) {
          var t = e.target.closest('[data-term]');
          if (t) {
            var n = +t.dataset.term;
            $('#f-due').value = n ? U.addDays($('#f-issued').value || U.today(), n) : '';
            U.$$('[data-term]', bd).forEach(function (c) { c.classList.remove('on'); });
            t.classList.add('on'); preview(); return;
          }
          var rc = e.target.closest('[data-rate]');
          if (rc) {
            $('#f-rate').value = rc.dataset.rate;
            U.$$('[data-rate]', bd).forEach(function (c) { c.classList.remove('on'); });
            rc.classList.add('on'); preview(); return;
          }
          var g = e.target.closest('[data-model],[data-rm],[data-pm]');
          if (g) {
            var box = g.closest('.seg');
            U.$$('button', box).forEach(function (b) { b.classList.remove('on'); });
            g.classList.add('on');
            if (g.dataset.model) {
              $('#box-simple').style.display = g.dataset.model === 'simple' ? '' : 'none';
              $('#box-fixed').style.display = g.dataset.model === 'fixed' ? '' : 'none';
            }
            sync(); preview();
          }
        });
        sync(); preview();
        if (!l) setTimeout(function () { $('#f-principal').focus(); }, 380);
      },

      onSave: function (bd) {
        var $ = function (x) { return bd.querySelector(x); };
        var segOn = function (id) { var b = bd.querySelector('#' + id + ' .on'); return b ? b.dataset : {}; };
        var rm = segOn('f-ratemode').rm || 'percent';
        var principal = U.num($('#f-principal').value);
        var dr = {
          principal: principal,
          currency: $('#f-cur').value,
          model: segOn('f-model').model || 'simple',
          rate: rm === 'amount' ? CALC.rateFromAmount(principal, U.num($('#f-rateamt').value)) : U.num($('#f-rate').value),
          ratePeriod: rm === 'amount' ? 'month' : $('#f-period').value,
          rateMode: rm,
          rateAmount: U.num($('#f-rateamt').value),
          payMode: segOn('f-paymode').pm || 'monthly',
          returnAmount: U.num($('#f-return').value),
          issuedAt: $('#f-issued').value || U.today(),
          dueAt: $('#f-due').value || null,
          penaltyRate: U.num($('#f-penalty').value),
          stopAccrual: $('#f-stop').checked,
          note: $('#f-note').value.trim()
        };
        if (!dr.principal || dr.principal <= 0) { U.toast('Укажите сумму займа'); return false; }
        if (dr.model === 'fixed' && dr.returnAmount < dr.principal) { U.toast('Сумма возврата меньше выданной'); return false; }
        if (dr.model === 'simple' && rm === 'amount' && !U.num($('#f-rateamt').value)) { U.toast('Укажите месячный платёж'); return false; }

        var cid = $('#f-client').value;
        if (cid === '__new') {
          var nm = $('#f-cname').value.trim();
          if (!nm) { U.toast('Введите имя клиента'); return false; }
          var ex = DB.clientByName(nm);
          cid = ex ? ex.id : DB.addClient({ name: nm, phone: $('#f-cphone').value.trim() }).id;
        }
        dr.clientId = cid;

        if (l) { DB.updLoan(l.id, dr); U.toast('Изменения сохранены'); App.go('#/loan/' + l.id); }
        else { var nl = DB.addLoan(dr); U.toast('Заём выдан'); App.go('#/loan/' + nl.id); }
        return true;
      }
    });
  };

  /* ============ ФОРМА КЛИЕНТА ============ */
  F.clientForm = function (clientId) {
    var c = clientId ? DB.client(clientId) : null;
    var h = '<div class="list">' +
      '<div class="field"><label>Имя</label><input id="c-name" placeholder="Иван Петров" value="' + esc(c ? c.name : '') + '" autocomplete="off"></div>' +
      '<div class="field"><label>Телефон</label><input id="c-phone" type="tel" inputmode="tel" placeholder="+7 900 000-00-00" value="' + esc(c ? c.phone || '' : '') + '"></div>' +
      '<div class="field col"><label>Заметка</label><textarea id="c-note" placeholder="Где работает, кто поручитель, как платит…">' + esc(c ? c.note || '' : '') + '</textarea></div>' +
      '</div>';
    App.sheet({
      title: c ? 'Изменить клиента' : 'Новый клиент',
      html: h, save: 'Сохранить',
      onOpen: function (bd) { setTimeout(function () { bd.querySelector('#c-name').focus(); }, 380); },
      onSave: function (bd) {
        var name = bd.querySelector('#c-name').value.trim();
        if (!name) { U.toast('Введите имя'); return false; }
        var patch = { name: name, phone: bd.querySelector('#c-phone').value.trim(), note: bd.querySelector('#c-note').value.trim() };
        if (c) { DB.updClient(c.id, patch); U.toast('Сохранено'); App.render(); }
        else { var nc = DB.addClient(patch); U.toast('Клиент добавлен'); App.go('#/client/' + nc.id); }
        return true;
      }
    });
  };

  /* ============ ФОРМА ПЛАТЕЖА ============ */
  F.paymentForm = function (loanId) {
    var l = DB.loan(loanId);
    if (!l) return;
    var c = DB.client(l.clientId) || { name: '—' };
    var r = CALC.loan(l);
    var cur = l.currency || FX.base();
    var m = function (v, o) { o = o || {}; o.cur = cur; return U.money(v, o); };

    var perM = l.model === 'fixed' ? 0 : CALC.perMonth(l, r.balance);
    var owed = Math.round(r.interestDue + r.penaltyDue);      // всё, что накопилось процентами
    var all = Math.round(r.totalDue);

    var h = '<div style="text-align:center;margin-bottom:14px">' +
      '<div style="font-size:13px;color:var(--text-2)">' + esc(c.name) + ' · долг на сегодня</div>' +
      '<div style="font-size:30px;font-weight:700;letter-spacing:-.6px" class="num">' + m(r.totalDue) + '</div>' +
      (l.payMode === 'monthly' && r.missed
        ? '<div style="font-size:13px;color:var(--red);font-weight:600;margin-top:3px">не платил ' + r.missed + ' ' +
        U.plural(r.missed, 'месяц', 'месяца', 'месяцев') + '</div>' : '') +
      '</div>';

    h += '<div class="list">' +
      '<div class="field"><label>Сумма</label><input id="p-amount" type="text" inputmode="decimal" placeholder="0" style="font-size:22px;font-weight:600"><span class="unit">' + esc(FX.sym(cur)) + '</span></div>' +
      '<div class="field"><label>Дата</label><input id="p-date" type="date" value="' + U.today() + '"></div>' +
      '<div class="field col"><label>Заметка</label><textarea id="p-note" placeholder="Наличные, перевод…" style="min-height:44px"></textarea></div>' +
      '</div>';

    h += '<div class="chips" style="margin-top:12px;border-radius:var(--radius)">';
    if (perM > 0.5) h += '<button class="chip" data-amt="' + Math.round(perM) + '">Проценты за месяц · ' + m(perM) + '</button>';
    if (owed > 0.5 && Math.abs(owed - Math.round(perM)) > 0.5) h += '<button class="chip" data-amt="' + owed + '">Все накопленные проценты · ' + m(owed) + '</button>';
    if (all > 0.5) h += '<button class="chip" data-amt="' + all + '">Закрыть весь долг · ' + m(all) + '</button>';
    h += '</div>';

    h += '<div class="card pad" id="p-prev" style="margin-top:14px"></div>';

    App.sheet({
      title: 'Платёж', html: h, save: 'Принять',
      onOpen: function (bd) {
        var inp = bd.querySelector('#p-amount');
        function prev() {
          var amt = U.num(inp.value), box = bd.querySelector('#p-prev');
          if (!amt) { box.innerHTML = '<div style="color:var(--text-2);font-size:15px">Введите сумму — покажу, как она распределится.</div>'; return; }
          var left = amt, pen = Math.min(left, r.penaltyDue); left -= pen;
          var int = Math.min(left, r.interestDue); left -= int;
          var prin = Math.min(left, r.balance); left -= prin;
          var rest = r.totalDue - (pen + int + prin);
          box.innerHTML =
            (pen > 0.5 ? kvv('Погасит пеню', m(pen)) : '') +
            kvv('Погасит проценты', m(int)) +
            kvv('Уйдёт в тело долга', m(prin)) +
            (left > 0.5 ? kvv('Переплата', m(left)) : '') +
            '<div class="kv big"><span class="k">Останется долга</span><span class="v num"' + (rest < 0.5 ? ' style="color:var(--accent)"' : '') + '>' +
            (rest < 0.5 ? 'ноль — заём закроется' : m(rest)) + '</span></div>';
        }
        bd.addEventListener('input', prev);
        bd.addEventListener('click', function (e) {
          var t = e.target.closest('[data-amt]');
          if (t) { inp.value = t.dataset.amt; prev(); }
        });
        prev();
        setTimeout(function () { inp.focus(); }, 380);
      },
      onSave: function (bd) {
        var amt = U.num(bd.querySelector('#p-amount').value);
        if (amt <= 0) { U.toast('Укажите сумму платежа'); return false; }
        DB.addPayment(l.id, {
          amount: amt,
          date: bd.querySelector('#p-date').value || U.today(),
          note: bd.querySelector('#p-note').value.trim()
        });
        var after = CALC.loan(DB.loan(l.id));
        U.toast(after.isClosed ? 'Платёж принят, заём закрыт' : 'Платёж принят · осталось ' + m(after.totalDue));
        App.render();
        return true;
      }
    });

    function kvv(k, v) { return '<div class="kv"><span class="k">' + k + '</span><span class="v num">' + v + '</span></div>'; }
  };

  /* ============ БЫСТРЫЙ ПЛАТЁЖ: выбор займа ============ */
  F.quickPay = function () {
    var act = DB.loans().filter(function (l) { return l.status !== 'closed'; });
    if (!act.length) { U.toast('Нет активных займов'); return; }
    if (act.length === 1) { F.paymentForm(act[0].id); return; }
    var h = '<div class="list">' + act.map(function (l) { return V.loanRow(l); }).join('') + '</div>';
    App.sheet({
      title: 'Кто платит?', html: h, save: null,
      onOpen: function (bd) {
        bd.addEventListener('click', function (e) {
          var b = e.target.closest('[data-act="loan"]');
          if (b) { App.closeSheet(); setTimeout(function () { F.paymentForm(b.dataset.id); }, 340); }
        });
      }
    });
  };

  /* ============ ИМПОРТ ============ */
  F.importSheet = function () {
    var h = '<div class="hint" style="padding:0 4px 14px">Выберите файл резервной копии <b>.json</b> или таблицу <b>.csv</b>. Можно также вставить текст ниже.</div>' +
      '<div class="list">' +
      '<button class="row tap" id="pick"><span class="grow"><span class="ttl" style="color:var(--accent)">Выбрать файл</span>' +
      '<span class="sub">.json или .csv</span></span></button></div>' +
      '<input type="file" id="file" accept=".json,.csv,.txt,application/json,text/csv" style="display:none">' +
      '<h2 class="sec">Или вставьте текст</h2>' +
      '<div class="list"><div class="field col"><textarea id="paste" style="min-height:130px;font-size:14px" ' +
      'placeholder="Иван Петров;+79000000000;50000;01.09.2026;10;месяц;30;залог — телефон"></textarea></div></div>' +
      '<div class="hint">Столбцы CSV: <b>Имя;Телефон;Сумма;Дата выдачи;Ставка;Период;Срок в днях;Заметка</b>. ' +
      'Разделитель — точка с запятой. Первая строка с заголовками не обязательна.</div>' +
      '<h2 class="sec">Как загружать</h2>' +
      '<div class="seg" id="mode"><button data-m="merge" class="on">Добавить к текущим</button>' +
      '<button data-m="replace">Заменить всё</button></div>';

    App.sheet({
      title: 'Загрузка базы', html: h, save: 'Загрузить',
      onOpen: function (bd) {
        bd.querySelector('#pick').addEventListener('click', function () { bd.querySelector('#file').click(); });
        bd.querySelector('#file').addEventListener('change', function (e) {
          var f = e.target.files[0];
          if (!f) return;
          var fr = new FileReader();
          fr.onload = function () { bd.querySelector('#paste').value = fr.result; U.toast('Файл прочитан: ' + f.name); };
          fr.readAsText(f);
        });
        bd.addEventListener('click', function (e) {
          var m = e.target.closest('[data-m]');
          if (m) { U.$$('#mode button', bd).forEach(function (b) { b.classList.remove('on'); }); m.classList.add('on'); }
        });
      },
      onSave: function (bd) {
        var text = bd.querySelector('#paste').value.trim();
        if (!text) { U.toast('Не выбран файл и не вставлен текст'); return false; }
        var mode = bd.querySelector('#mode .on').dataset.m;

        function run() {
          try {
            if (text[0] === '{') {
              var res = DB.importJSON(text, mode);
              U.toast('Загружено: ' + res.clients + ' клиентов, ' + res.loans + ' займов');
            } else {
              if (mode === 'replace') { DB.data = DB.empty(); DB.save(); }
              var n = DB.importCSV(text);
              U.toast(n ? 'Добавлено займов: ' + n : 'Ни одной строки не распознано');
            }
            App.closeSheet();
            App.go('#/');
          } catch (err) {
            U.toast('Ошибка: ' + err.message);
          }
        }

        if (mode === 'replace') {
          App.ask({
            title: 'Заменить всю базу?',
            text: 'Текущие клиенты, займы и платежи будут стёрты и заменены загружаемыми.',
            ok: 'Заменить', danger: true, onOk: run
          });
        } else {
          run();
        }
        return false;   // лист закрывается внутри run()
      }
    });
  };

  /* ============ КОД-ПАРОЛЬ ============ */
  F.pinSheet = function () {
    var h = '<div class="hint" style="padding:0 4px 14px">Код из 4 цифр будет спрашиваться при каждом запуске приложения.</div>' +
      '<div class="list"><div class="field"><label>Новый код</label>' +
      '<input id="pin1" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]*" placeholder="••••" style="letter-spacing:6px"></div>' +
      '<div class="field"><label>Ещё раз</label>' +
      '<input id="pin2" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]*" placeholder="••••" style="letter-spacing:6px"></div></div>' +
      '<div class="hint">Код защищает от чужих глаз, но не шифрует базу — на компьютере данные можно прочитать. Не храните здесь то, что нельзя потерять без копии.</div>';
    App.sheet({
      title: 'Код-пароль', html: h, save: 'Включить',
      onOpen: function (bd) { setTimeout(function () { bd.querySelector('#pin1').focus(); }, 380); },
      onSave: function (bd) {
        var a = bd.querySelector('#pin1').value.trim(), b = bd.querySelector('#pin2').value.trim();
        if (!/^\d{4}$/.test(a)) { U.toast('Нужен код из 4 цифр'); return false; }
        if (a !== b) { U.toast('Коды не совпадают'); return false; }
        DB.data.settings.pin = App.hash(a);
        DB.save(); U.toast('Код включён'); App.render();
        return true;
      }
    });
  };

  w.F = F;
})(window);
