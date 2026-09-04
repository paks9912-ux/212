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

    var h = V.topbarBack(c.name, '<button data-act="edit-loan" data-id="' + l.id + '">Изменить</button>');
    h += '<div class="wrap">';

    h += '<div style="display:flex;align-items:center;gap:12px;margin:2px 0 14px">' + V.avatar(c.name) +
      '<div style="min-width:0"><div style="font-size:22px;font-weight:700;letter-spacing:-.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(c.name) + '</div>' +
      '<div style="font-size:13px;color:var(--text-2)">Заём от ' + U.fmtDateFull(l.issuedAt) + '</div></div></div>';

    h += '<div class="hero">' +
      '<div class="lbl">' + (r.isClosed ? 'Заём закрыт' : r.isPaidOff ? 'Долг погашен' : 'К возврату сегодня') + '</div>' +
      '<div class="amt num"' + (r.isOverdue ? ' style="color:var(--red)"' : '') + '>' + U.money(r.isClosed ? 0 : r.totalDue) + '</div>' +
      '<div class="delta" style="margin-top:8px">' + (V.badge(l, r) || '<span class="badge ok">Активен</span>') +
      (l.dueAt && !r.isClosed && !r.isOverdue ? ' <span class="badge">Вернуть ' + U.fmtDate(l.dueAt) + '</span>' : '') + '</div>' +
      (!r.isClosed && r.dailyAccrual > 0 ? '<div class="delta">капает ' + U.money(r.dailyAccrual, { exact: r.dailyAccrual < 100 }) + ' в день</div>' : '') +
      progress(r) + '</div>';

    if (!r.isClosed) {
      h += '<div class="btn-row"><button class="btn" data-act="pay" data-id="' + l.id + '">Принять платёж</button></div>';
    }
    if (c.phone) {
      h += '<div class="btn-row"><a class="btn sec" href="' + U.telHref(c.phone) + '">Позвонить</a>' +
        '<a class="btn sec" href="' + U.waHref(c.phone) + '" target="_blank" rel="noopener">WhatsApp</a></div>';
    }

    h += '<h2 class="sec">Условия</h2><div class="card pad">' +
      kv('Выдано на руки', U.money(l.principal)) +
      (l.model === 'fixed'
        ? kv('Фиксированный возврат', U.money(l.returnAmount))
        : kv('Ставка', U.pct(l.rate) + ' ' + CALC.PERIOD_NAME[l.ratePeriod] +
          '<span style="color:var(--text-2);font-weight:400"> · ' + U.money(U.num(l.principal) * CALC.daily(l), { exact: true }) + '/день</span>')) +
      (l.dueAt ? kv('Вернуть до', U.fmtDateFull(l.dueAt) + '<span style="color:var(--text-2);font-weight:400"> · ' + U.relDate(l.dueAt) + '</span>') : '') +
      (U.num(l.penaltyRate) > 0 ? kv('Пеня за просрочку', U.pct(l.penaltyRate) + ' в день') : '') +
      (l.stopAccrual ? kv('После срока', 'проценты не растут') : '') +
      (l.note ? kv('Заметка', esc(l.note)) : '') +
      '</div>';

    h += '<h2 class="sec">Расчёт на сегодня</h2><div class="card pad">' +
      kv('Остаток основного долга', U.money(r.balance)) +
      kv('Начислено процентов', U.money(r.interestAccrued)) +
      (r.penaltyAccrued > 0 ? kv('Пеня', '<span style="color:var(--red)">' + U.money(r.penaltyAccrued) + '</span>') : '') +
      kv('Уже выплачено', U.money(r.paidTotal)) +
      kv('Из них проценты', '<span style="color:var(--accent)">' + U.money(r.profit) + '</span>') +
      (r.overpay > 0 ? kv('Переплата', U.money(r.overpay)) : '') +
      '<div class="kv big"><span class="k">Итого к возврату</span><span class="v num">' + U.money(r.isClosed ? 0 : r.totalDue) + '</span></div>' +
      (!r.isClosed && l.dueAt && r.daysLeft > 0
        ? '<div class="kv"><span class="k">Если вернёт день в день</span><span class="v num">' + U.money(plan.totalDue) +
        '<span style="color:var(--accent);font-weight:400"> · доход ' + U.money(plan.interestDue + plan.penaltyDue + r.profit) + '</span></span></div>' : '') +
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
          if (a.pen > 0.5) parts.push('пеня ' + U.money(a.pen));
          if (a.int > 0.5) parts.push('проценты ' + U.money(a.int));
          if (a.prin > 0.5) parts.push('тело ' + U.money(a.prin));
        }
        h += '<button class="row tap" data-act="del-pay" data-id="' + l.id + '" data-pid="' + p.id + '">' +
          '<span class="grow"><span class="ttl">' + U.fmtDate(p.date, true) + '</span>' +
          '<span class="sub">' + (parts.join(' · ') || 'зачтено') + (p.note ? ' · ' + esc(p.note) : '') + '</span></span>' +
          '<span class="val"><span class="v1 num" style="color:var(--accent)">+' + U.money(p.amount) + '</span></span></button>';
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
      var total = r.principal + r.interestAccrued + r.penaltyAccrued;
      if (!total) return '';
      var pc = Math.max(0, Math.min(100, r.paidTotal / total * 100));
      return '<div class="bar"><i style="width:' + pc.toFixed(1) + '%"></i></div>' +
        '<div class="delta">выплачено ' + Math.round(pc) + '% от ' + U.money(total) + '</div>';
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
      principal: '', model: 'simple', rate: st.defaultRate, ratePeriod: st.defaultPeriod,
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
      '<div class="field"><label>Телефон</label><input id="f-cphone" type="tel" inputmode="tel" placeholder="+7 900 000-00-00"></div>' +
      '</div></div>';

    h += '<h2 class="sec">Деньги</h2><div class="list">' +
      '<div class="field"><label>Сумма</label><input id="f-principal" type="text" inputmode="decimal" placeholder="0" value="' + (d.principal || '') + '"><span class="unit">' + esc(st.currency) + '</span></div>' +
      '<div class="field"><label>Выдан</label><input id="f-issued" type="date" value="' + esc(d.issuedAt) + '"></div>' +
      '<div class="field"><label>Вернуть до</label><input id="f-due" type="date" value="' + esc(d.dueAt || '') + '"></div>' +
      '</div>';
    h += '<div class="chips" style="border-radius:0 0 var(--radius) var(--radius);margin-top:-1px">' +
      [7, 14, 30, 60, 90, 180].map(function (n) {
        return '<button class="chip" data-term="' + n + '">' + n + ' дн</button>';
      }).join('') + '</div>';

    h += '<h2 class="sec">Проценты</h2><div class="seg" id="f-model">' +
      '<button data-model="simple" class="' + (d.model === 'simple' ? 'on' : '') + '">На остаток долга</button>' +
      '<button data-model="fixed" class="' + (d.model === 'fixed' ? 'on' : '') + '">Фикс. сумма</button></div>';

    h += '<div class="list" id="box-simple"' + (d.model === 'fixed' ? ' style="display:none"' : '') + '>' +
      '<div class="field"><label>Ставка</label><input id="f-rate" type="text" inputmode="decimal" value="' + (d.rate != null ? d.rate : '') + '"><span class="unit">%</span></div>' +
      '<div class="field"><label>Период</label><select id="f-period">' +
      [['day', 'в день'], ['week', 'в неделю'], ['month', 'в месяц (30 дней)'], ['year', 'в год']].map(function (t) {
        return '<option value="' + t[0] + '"' + (d.ratePeriod === t[0] ? ' selected' : '') + '>' + t[1] + '</option>';
      }).join('') + '</select></div></div>';

    h += '<div class="list" id="box-fixed"' + (d.model !== 'fixed' ? ' style="display:none"' : '') + '>' +
      '<div class="field"><label>Вернёт всего</label><input id="f-return" type="text" inputmode="decimal" placeholder="0" value="' + (d.returnAmount || '') + '"><span class="unit">' + esc(st.currency) + '</span></div></div>';

    h += '<div class="list" style="margin-top:12px">' +
      '<div class="field"><label>Пеня</label><input id="f-penalty" type="text" inputmode="decimal" value="' + (d.penaltyRate || 0) + '"><span class="unit">% в день просрочки</span></div>' +
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
        var $ = function (s) { return bd.querySelector(s); };
        function toggleNew() {
          $('#new-client-fields').style.display = $('#f-client').value === '__new' ? '' : 'none';
        }
        function model() { var b = bd.querySelector('#f-model .on'); return b ? b.dataset.model : 'simple'; }
        function draft() {
          return {
            principal: U.num($('#f-principal').value),
            model: model(),
            rate: U.num($('#f-rate').value),
            ratePeriod: $('#f-period').value,
            returnAmount: U.num($('#f-return').value),
            issuedAt: $('#f-issued').value || U.today(),
            dueAt: $('#f-due').value || null,
            penaltyRate: U.num($('#f-penalty').value),
            stopAccrual: $('#f-stop').checked,
            note: $('#f-note').value.trim()
          };
        }
        function preview() {
          var dr = draft(), p = CALC.preview(dr), box = $('#preview');
          if (!dr.principal) { box.innerHTML = '<div style="color:var(--text-2);font-size:15px">Введите сумму — покажу доход и дату возврата.</div>'; return; }
          var days = p.days;
          box.innerHTML =
            '<div class="kv"><span class="k">Выдаёте</span><span class="v num">' + U.money(dr.principal) + '</span></div>' +
            (dr.model === 'simple'
              ? '<div class="kv"><span class="k">Начисление</span><span class="v num">' + U.money(p.perDay, { exact: p.perDay < 100 }) + ' в день</span></div>' : '') +
            '<div class="kv"><span class="k">Срок</span><span class="v num">' + (days > 0 ? U.days(days) : 'не указан') + '</span></div>' +
            '<div class="kv big"><span class="k">Вернёт всего</span><span class="v num">' + U.money(p.total) + '</span></div>' +
            '<div class="kv big"><span class="k">Ваш доход</span><span class="v num" style="color:var(--accent)">+' + U.money(p.profit) + '</span></div>';
        }
        bd.addEventListener('input', preview);
        bd.addEventListener('change', function (e) { toggleNew(); preview(); });
        bd.addEventListener('click', function (e) {
          var t = e.target.closest('[data-term]');
          if (t) {
            $('#f-due').value = U.addDays($('#f-issued').value || U.today(), +t.dataset.term);
            U.$$('.chip', bd).forEach(function (c) { c.classList.remove('on'); });
            t.classList.add('on'); preview(); return;
          }
          var m = e.target.closest('[data-model]');
          if (m) {
            U.$$('#f-model button', bd).forEach(function (b) { b.classList.remove('on'); });
            m.classList.add('on');
            $('#box-simple').style.display = m.dataset.model === 'simple' ? '' : 'none';
            $('#box-fixed').style.display = m.dataset.model === 'fixed' ? '' : 'none';
            preview();
          }
        });
        toggleNew(); preview();
        if (!l) setTimeout(function () { $('#f-principal').focus(); }, 380);
      },
      onSave: function (bd) {
        var $ = function (s) { return bd.querySelector(s); };
        var dr = {
          principal: U.num($('#f-principal').value),
          model: bd.querySelector('#f-model .on').dataset.model,
          rate: U.num($('#f-rate').value),
          ratePeriod: $('#f-period').value,
          returnAmount: U.num($('#f-return').value),
          issuedAt: $('#f-issued').value || U.today(),
          dueAt: $('#f-due').value || null,
          penaltyRate: U.num($('#f-penalty').value),
          stopAccrual: $('#f-stop').checked,
          note: $('#f-note').value.trim()
        };
        if (!dr.principal || dr.principal <= 0) { U.toast('Укажите сумму займа'); return false; }
        if (dr.model === 'fixed' && dr.returnAmount < dr.principal) { U.toast('Сумма возврата меньше выданной'); return false; }

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
    var only = Math.round(r.interestDue + r.penaltyDue);
    var all = Math.round(r.totalDue);

    var h = '<div style="text-align:center;margin-bottom:14px">' +
      '<div style="font-size:13px;color:var(--text-2)">' + esc(c.name) + ' · долг на сегодня</div>' +
      '<div style="font-size:30px;font-weight:700;letter-spacing:-.6px" class="num">' + U.money(r.totalDue) + '</div></div>';

    h += '<div class="list">' +
      '<div class="field"><label>Сумма</label><input id="p-amount" type="text" inputmode="decimal" placeholder="0" style="font-size:22px;font-weight:600"><span class="unit">' + esc(DB.data.settings.currency) + '</span></div>' +
      '<div class="field"><label>Дата</label><input id="p-date" type="date" value="' + U.today() + '"></div>' +
      '<div class="field col"><label>Заметка</label><textarea id="p-note" placeholder="Наличные, перевод…" style="min-height:44px"></textarea></div>' +
      '</div>';

    h += '<div class="chips" style="margin-top:12px;border-radius:var(--radius)">';
    if (only > 0) h += '<button class="chip" data-amt="' + only + '">Только проценты · ' + U.money(only) + '</button>';
    if (all > 0) h += '<button class="chip" data-amt="' + all + '">Весь долг · ' + U.money(all) + '</button>';
    if (all > 1) h += '<button class="chip" data-amt="' + Math.round(all / 2) + '">Половина</button>';
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
            (pen > 0.5 ? kvv('Погасит пеню', U.money(pen)) : '') +
            kvv('Погасит проценты', U.money(int)) +
            kvv('Уйдёт в тело долга', U.money(prin)) +
            (left > 0.5 ? kvv('Переплата', U.money(left)) : '') +
            '<div class="kv big"><span class="k">Останется долга</span><span class="v num"' + (rest < 0.5 ? ' style="color:var(--accent)"' : '') + '>' +
            (rest < 0.5 ? 'ноль — заём закроется' : U.money(rest)) + '</span></div>';
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
        U.toast(after.isClosed ? 'Платёж принят, заём закрыт' : 'Платёж принят · осталось ' + U.money(after.totalDue));
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
