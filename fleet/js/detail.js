/* Карточка техники, карточка водителя и все формы ввода */
(function (w) {
  'use strict';
  var esc = U.esc;

  /* ============ КАРТОЧКА ТЕХНИКИ ============ */
  V.unitDetail = function (id) {
    var u = DB.unit(id);
    if (!u) return V.topbarBack('Техника') + '<div class="wrap">' +
      V.empty('🤷', 'Техника не найдена', 'Возможно, её удалили.') + '</div>';

    var st = CALC.unitState(u);
    var from = U.monthStart(U.today()), to = U.today();
    var p = CALC.unitPeriod(u, from, to);
    var mi = U.meterInfo(u.meter);
    var kind = DB.kind(u.kind);

    var h = V.topbarBack(u.name, '<button data-act="edit-unit" data-id="' + u.id + '">Изменить</button>');
    h += '<div class="wrap">';

    h += '<div class="unit-head">' + V.unitIcon(u) +
      '<div style="min-width:0"><div class="unit-name">' + esc(u.name) + '</div>' +
      '<div class="unit-sub">' + esc(kind.n) + (u.plate ? ' · ' + esc(u.plate) : '') + '</div></div></div>';

    /* остаток в баке */
    h += '<div class="hero">' +
      '<div class="lbl">Расчётный остаток в баке</div>' +
      '<div class="amt num"' + (st.tankNegative ? ' style="color:var(--red)"' : '') + '>' + U.liters(st.tankLeft) + '</div>' +
      (U.num(u.tank) > 0 ? '<div class="delta">из ' + U.liters(u.tank) + '</div>' +
        '<div class="bar"><i style="width:' + Math.round((st.tankPct || 0) * 100) + '%"></i></div>' : '') +
      '<div class="delta" style="margin-top:8px">' +
      (p.problem ? '<span class="badge bad">Перерасход</span>'
        : (V.unitBadge(u, p) || '<span class="badge ok">В норме</span>')) + '</div>' +
      (st.tankBase.fromCheck
        ? '<div class="delta">от замера ' + U.fmtDate(st.tankBase.date, true) + '</div>'
        : '<div class="delta">замеров ещё не было — расчёт от стартового остатка</div>') +
      '</div>';

    if (p.problem) {
      h += '<div class="card pad badbox">' +
        '<div class="t">Перерасход ' + U.liters(p.problemLiters) + ' за месяц</div>' +
        '<div class="d">' + (p.checkCount
          ? 'Замер показал в баке меньше, чем должно быть по норме и заправкам. ' +
            'Причины обычно три: слив, занижённая норма или приписки в наработке.'
          : 'Залито заметно больше, чем положено по наработке. Сделайте замер бака — он покажет точную недостачу.') +
        '</div>' +
        (DB.data.settings.price ? '<div class="d">В деньгах это примерно <b>' +
          U.money(p.problemLiters * DB.data.settings.price) + '</b>.</div>' : '') +
        '<button class="btn sec sm full" data-act="new-check" data-id="' + u.id + '">Сделать замер бака</button></div>';
    }

    h += '<div class="btn-row"><button class="btn" data-act="new-fill" data-id="' + u.id + '">⛽ Заправка</button>' +
      '<button class="btn sec" data-act="new-shift" data-id="' + u.id + '">🕒 Смена</button></div>' +
      '<div class="btn-row"><button class="btn sec" data-act="new-check" data-id="' + u.id + '">📏 Замер бака</button>' +
      '<button class="btn sec" data-act="new-service" data-id="' + u.id + '">🔧 ТО / ремонт</button></div>';

    /* месяц */
    h += '<h2 class="sec">За ' + U.monthName(U.monthKey(to), true).toLowerCase() + '</h2><div class="card pad">' +
      V.kv('Наработка', U.work(p.work, u.meter) + ' <span style="color:var(--text-2);font-weight:400">за ' +
        U.cnt(p.days, 'смену', 'смены', 'смен') + '</span>') +
      V.kv('Положено по норме', U.liters(p.norm)) +
      V.kv('Залито фактически', U.liters(p.filled)) +
      (p.checkCount
        ? V.kv('Недостача по замерам', p.deviation < -0.5
          ? '<span style="color:var(--red)">' + U.liters(-p.deviation) + '</span>'
          : '<span style="color:var(--accent)">нет</span>')
        : V.kv('Залито сверх нормы', p.over > 0
          ? '<span style="color:' + (p.problem ? 'var(--red)' : 'inherit') + '">' + U.liters(p.over) + '</span>'
          : U.liters(p.over))) +
      (p.actualRate ? V.kv('Фактический расход', U.normText(p.actualRate, u.meter) +
        ' <span style="color:var(--text-2);font-weight:400">норма ' + U.dec(u.norm, 1) + '</span>') : '') +
      V.kv('Потрачено на топливо', U.money(p.money)) +
      (p.serviceCost ? V.kv('ТО и ремонты', U.money(p.serviceCost)) : '') +
      '</div>';

    /* ТО */
    if (U.num(u.serviceEvery) > 0) {
      var s = st.service;
      h += '<h2 class="sec">Обслуживание</h2><div class="card pad">' +
        '<div class="kv big"><span class="k">' + (s.overdue ? 'ТО просрочено на' : 'До ТО осталось') + '</span>' +
        '<span class="v num"' + (s.overdue ? ' style="color:var(--red)"' : s.soon ? ' style="color:var(--orange)"' : '') + '>' +
        U.work(Math.abs(s.left), u.meter) + '</span></div>' +
        '<div class="bar"><i style="width:' + Math.round((s.pct || 0) * 100) + '%;background:' +
        (s.overdue ? 'var(--red)' : s.soon ? 'var(--orange)' : 'var(--accent)') + '"></i></div>' +
        V.kv('Наработка после ТО', U.work(s.since, u.meter)) +
        V.kv('Периодичность', 'каждые ' + U.work(s.every, u.meter)) +
        (s.last ? V.kv('Последнее ТО', U.fmtDate(s.last.date, true) +
          (s.last.meter != null ? ' <span style="color:var(--text-2);font-weight:400">на ' + U.work(s.last.meter, u.meter) + '</span>' : '')) : '') +
        '</div>';
    }

    /* замеры */
    if (st.checks.length) {
      h += '<h2 class="sec">Замеры бака</h2><div class="list">';
      st.checks.slice().reverse().slice(0, 8).forEach(function (c) {
        h += '<button class="row tap" data-act="op-fuel" data-id="' + c.id + '">' +
          '<span class="op-ic">📏</span>' +
          '<span class="grow"><span class="ttl">' + U.fmtDate(c.date, true) + '</span>' +
          '<span class="sub">' + (c.hasBase
            ? (c.deviation < -0.5 ? '<b style="color:var(--red)">недостача ' + U.liters(-c.deviation) + '</b>'
              : c.deviation > 0.5 ? 'излишек ' + U.liters(c.deviation) : 'сходится')
            : 'точка отсчёта') + '</span></span>' +
          '<span class="val"><span class="v1 num">' + U.liters(c.found) + '</span>' +
          '<span class="v2">по расчёту ' + U.liters(c.expected) + '</span></span></button>';
      });
      h += '</div>';
    } else {
      h += '<div class="hint" style="margin-top:14px">Пока не было ни одного замера бака. ' +
        'Замер — единственный способ узнать <b>настоящую</b> недостачу: приложение сравнит его со своим расчётом.</div>';
    }

    /* паспорт */
    h += '<h2 class="sec">Паспорт</h2><div class="card pad">' +
      V.kv('Тип', esc(kind.n)) +
      (u.plate ? V.kv('Госномер', esc(u.plate)) : '') +
      V.kv('Счётчик', U.work(st.meterNow, u.meter) + ' <span style="color:var(--text-2);font-weight:400">' + esc(mi.long) + '</span>') +
      V.kv('Норма расхода', U.normText(u.norm, u.meter)) +
      (U.num(u.tank) ? V.kv('Объём бака', U.liters(u.tank)) : '') +
      V.kv('Топливо', esc(u.fuel || DB.data.settings.fuel)) +
      (u.driverId ? V.kv('Закреплён', esc(DB.driverName(u.driverId))) : '') +
      (u.note ? V.kv('Заметка', esc(u.note)) : '') +
      '</div>';

    /* история */
    var feed = CALC.feed(20, u.id);
    if (feed.length) {
      h += '<h2 class="sec">История</h2><div class="list">';
      feed.forEach(function (x) { h += V.opRow(x, { hideUnit: true }); });
      h += '</div>';
    }

    h += '<div class="btn-row" style="margin-top:18px">' +
      '<button class="btn danger" data-act="del-unit" data-id="' + u.id + '">Удалить технику</button></div>';
    return h + '</div>';
  };

  /* ============ КАРТОЧКА ВОДИТЕЛЯ ============ */
  V.driverDetail = function (id) {
    var d = DB.driver(id);
    if (!d) return V.topbarBack('Водитель') + '<div class="wrap">' +
      V.empty('🤷', 'Водитель не найден', 'Возможно, его удалили.') + '</div>';

    var from = U.monthStart(U.today()), to = U.today();
    var rows = CALC.byDriver(from, to).filter(function (r) { return r.id === d.id; });
    var r = rows[0] || { shifts: 0, workHours: 0, workKm: 0, norm: 0, filled: 0, money: 0, over: 0, units: {} };

    var h = V.topbarBack(d.name, '<button data-act="edit-driver" data-id="' + d.id + '">Изменить</button>');
    h += '<div class="wrap">';
    h += '<div class="unit-head">' + V.avatar(d.name) +
      '<div style="min-width:0"><div class="unit-name">' + esc(d.name) + '</div>' +
      '<div class="unit-sub">' + (d.phone ? esc(d.phone) : 'телефон не указан') + '</div></div></div>';

    if (d.phone) {
      h += '<div class="btn-row"><a class="btn sec" href="' + U.telHref(d.phone) + '">Позвонить</a>' +
        '<a class="btn sec" href="' + U.waHref(d.phone) + '" target="_blank" rel="noopener">WhatsApp</a></div>';
    }

    h += '<h2 class="sec">За ' + U.monthName(U.monthKey(to), true).toLowerCase() + '</h2><div class="card pad">' +
      V.kv('Смен отработано', String(r.shifts), 'big') +
      (r.workHours ? V.kv('Моточасы', U.work(r.workHours, 'hours')) : '') +
      (r.workKm ? V.kv('Пробег', U.work(r.workKm, 'km')) : '') +
      V.kv('Положено топлива', U.liters(r.norm)) +
      V.kv('Залито', U.liters(r.filled)) +
      V.kv('Разница', (r.filled
        ? '<span style="color:' + (r.over > Math.max(15, r.norm * 0.03) ? 'var(--red)' : 'var(--accent)') + '">' +
          U.liters(r.over, { sign: true }) + '</span>' : '—')) +
      '</div>';
    h += '<div class="hint">Разница гуляет из-за остатка в баке: важен не один месяц, а устойчивый плюс.</div>';

    var units = DB.units().filter(function (u) {
      return u.driverId === d.id || Object.keys(r.units || {}).indexOf(u.id) >= 0;
    });
    if (units.length) {
      h += '<h2 class="sec">Работает на технике</h2><div class="list">';
      units.forEach(function (u) { h += V.unitRow(u, from, to); });
      h += '</div>';
    }

    var feed = CALC.feed().filter(function (x) { return x.op.driverId === d.id; }).slice(0, 20);
    if (feed.length) {
      h += '<h2 class="sec">Последние записи</h2><div class="list">';
      feed.forEach(function (x) { h += V.opRow(x); });
      h += '</div>';
    }
    if (d.note) h += '<div class="hint">' + esc(d.note) + '</div>';

    h += '<div class="btn-row" style="margin-top:18px">' +
      '<button class="btn danger" data-act="del-driver" data-id="' + d.id + '">Удалить водителя</button></div>';
    return h + '</div>';
  };

  /* ============================================================
     ФОРМЫ
     ============================================================ */
  var F = {};

  /* общий кусок: выбор техники */
  function unitSelect(sel, id) {
    var list = DB.units();
    return '<div class="field"><label>Техника</label><select id="' + (id || 'f-unit') + '">' +
      list.map(function (u) {
        return '<option value="' + u.id + '"' + (sel === u.id ? ' selected' : '') + '>' +
          esc(u.name) + (u.plate ? ' · ' + esc(u.plate) : '') + '</option>';
      }).join('') + '</select></div>';
  }
  /* общий кусок: выбор водителя */
  function driverSelect(sel) {
    return '<div class="field"><label>Водитель</label><select id="f-driver">' +
      '<option value="">— не указан —</option>' +
      DB.drivers().map(function (d) {
        return '<option value="' + d.id + '"' + (sel === d.id ? ' selected' : '') + '>' + esc(d.name) + '</option>';
      }).join('') +
      '<option value="__new">＋ Новый водитель</option></select></div>' +
      '<div id="new-driver-fields" style="display:none">' +
      '<div class="field"><label>Имя</label><input id="f-dname" placeholder="Рустам Хайдаров" autocomplete="off"></div>' +
      '<div class="field"><label>Телефон</label><input id="f-dphone" type="tel" inputmode="tel" placeholder="+998 90 000-00-00"></div>' +
      '</div>';
  }
  /* если выбран «новый водитель» — создать и вернуть id */
  function resolveDriver(bd) {
    var sel = bd.querySelector('#f-driver');
    if (!sel) return null;
    if (sel.value !== '__new') return sel.value || null;
    var nm = bd.querySelector('#f-dname').value.trim();
    if (!nm) return '__error';
    var ex = DB.driverByName(nm);
    return ex ? ex.id : DB.addDriver({ name: nm, phone: bd.querySelector('#f-dphone').value.trim() }).id;
  }
  function watchDriverSelect(bd) {
    var sel = bd.querySelector('#f-driver');
    if (!sel) return;
    var box = bd.querySelector('#new-driver-fields');
    var upd = function () { box.style.display = sel.value === '__new' ? '' : 'none'; };
    sel.addEventListener('change', upd);
    upd();
  }

  /* ---------- меню «＋» ---------- */
  F.addMenu = function () {
    var items = [
      ['new-fill', '⛽', 'Заправка', 'выдать топливо в технику'],
      ['new-shift', '🕒', 'Смена', 'наработка за день, путевой лист'],
      ['new-check', '📏', 'Замер бака', 'сколько топлива реально в баке'],
      ['new-service', '🔧', 'ТО или ремонт', 'с показаниями счётчика'],
      ['new-intake', '🛢️', 'Приход на склад', 'привезли топливо в ёмкость'],
      ['new-tankcheck', '📐', 'Замер склада', 'сколько осталось в ёмкости'],
      ['new-unit', '🚜', 'Техника', 'новая единица в парке'],
      ['new-driver', '👷', 'Водитель', 'новый человек']
    ];
    App.sheet({
      title: 'Что добавить',
      html: '<div class="list">' + items.map(function (x) {
        return '<button class="row tap" data-menu="' + x[0] + '"><span class="op-ic">' + x[1] + '</span>' +
          '<span class="grow"><span class="ttl">' + x[2] + '</span><span class="sub">' + x[3] + '</span></span>' +
          '<span class="chev">' + V.ICON.chev + '</span></button>';
      }).join('') + '</div>',
      onOpen: function (bd) {
        bd.addEventListener('click', function (e) {
          var b = e.target.closest('[data-menu]');
          if (!b) return;
          var act = b.dataset.menu;
          App.closeSheet();
          setTimeout(function () { App.run(act, {}); }, 320);
        });
      }
    });
  };

  /* ---------- ТЕХНИКА ---------- */
  F.unitForm = function (unitId) {
    var u = unitId ? DB.unit(unitId) : null;
    var st = DB.data.settings;
    var d = u || {
      name: '', plate: '', kind: 'excavator', meter: 'hours', norm: '', tank: '',
      tankStart: '', fuel: st.fuel, driverId: '', serviceEvery: '', meterStart: '', note: '', active: true
    };
    var meterNow = u ? CALC.meterNow(u) : 0;

    var h = '<div class="list">' +
      '<div class="field"><label>Название</label><input id="f-name" placeholder="Экскаватор Hitachi" value="' +
      esc(d.name) + '" autocomplete="off"></div>' +
      '<div class="field"><label>Госномер</label><input id="f-plate" placeholder="01 A 123 BA" value="' +
      esc(d.plate || '') + '" autocomplete="off"></div>' +
      '<div class="field"><label>Тип</label><select id="f-kind">' +
      DB.KINDS.map(function (k) {
        return '<option value="' + k.k + '"' + (d.kind === k.k ? ' selected' : '') + '>' + k.ic + ' ' + esc(k.n) + '</option>';
      }).join('') + '</select></div>' +
      '</div>';

    h += '<h2 class="sec">Счётчик и норма</h2>' +
      '<div class="seg" id="f-meter">' +
      '<button data-m="hours" class="' + (d.meter !== 'km' ? 'on' : '') + '">Моточасы</button>' +
      '<button data-m="km" class="' + (d.meter === 'km' ? 'on' : '') + '">Километры</button></div>' +
      '<div class="list">' +
      '<div class="field"><label>Показания</label><input id="f-meterstart" type="text" inputmode="decimal" placeholder="0" value="' +
      (u ? U.dec(meterNow, 1) : '') + '"><span class="unit" id="u-meter">' + U.meterInfo(d.meter).unit + '</span></div>' +
      '<div class="field"><label>Норма</label><input id="f-norm" type="text" inputmode="decimal" placeholder="0" value="' +
      (d.norm || '') + '"><span class="unit" id="u-norm">' + U.meterInfo(d.meter).norm + '</span></div>' +
      '<div class="field"><label>ТО каждые</label><input id="f-every" type="text" inputmode="decimal" placeholder="не следить" value="' +
      (d.serviceEvery || '') + '"><span class="unit" id="u-every">' + U.meterInfo(d.meter).unit + '</span></div>' +
      '</div><div class="hint" id="norm-hint"></div>';

    h += '<h2 class="sec">Топливо</h2><div class="list">' +
      '<div class="field"><label>Вид</label><select id="f-fuel">' +
      DB.FUELS.map(function (x) {
        return '<option value="' + esc(x) + '"' + ((d.fuel || st.fuel) === x ? ' selected' : '') + '>' + esc(x) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>Объём бака</label><input id="f-tank" type="text" inputmode="decimal" placeholder="0" value="' +
      (d.tank || '') + '"><span class="unit">л</span></div>' +
      (u ? '' : '<div class="field"><label>Сейчас в баке</label><input id="f-tankstart" type="text" inputmode="decimal" placeholder="0" value="' +
        (d.tankStart || '') + '"><span class="unit">л</span></div>') +
      '</div>' +
      (u ? '' : '<div class="hint">«Сейчас в баке» — сколько топлива в машине на момент начала учёта. ' +
        'Это точка отсчёта: от неё пойдёт расчёт остатка.</div>');

    h += '<h2 class="sec">Прочее</h2><div class="list">' +
      '<div class="field"><label>Закрепить за</label><select id="f-driver2">' +
      '<option value="">— никем —</option>' +
      DB.drivers().map(function (x) {
        return '<option value="' + x.id + '"' + (d.driverId === x.id ? ' selected' : '') + '>' + esc(x.name) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label style="min-width:auto;flex:1;font-size:16px">Техника в работе</label>' +
      '<input id="f-active" type="checkbox" class="cb"' + (d.active !== false ? ' checked' : '') + '></div>' +
      '<div class="field col"><label>Заметка</label><textarea id="f-note" placeholder="Год, серийный номер, особенности…">' +
      esc(d.note || '') + '</textarea></div></div>';

    App.sheet({
      title: u ? 'Изменить технику' : 'Новая техника',
      html: h, save: 'Сохранить',
      onOpen: function (bd) {
        function meter() { var b = bd.querySelector('#f-meter .on'); return b ? b.dataset.m : 'hours'; }
        function sync() {
          var mi = U.meterInfo(meter());
          bd.querySelector('#u-meter').textContent = mi.unit;
          bd.querySelector('#u-norm').textContent = mi.norm;
          bd.querySelector('#u-every').textContent = mi.unit;
          var n = U.num(bd.querySelector('#f-norm').value);
          var hint = bd.querySelector('#norm-hint');
          if (!n) hint.innerHTML = 'Норма — сколько литров машина тратит на единицу наработки. ' +
            'Возьмите её из паспорта техники или посчитайте по прошлым месяцам.';
          else if (meter() === 'km') hint.innerHTML = 'При таком расходе смена в 200 км съедает <b>' +
            U.liters(2 * n) + '</b>.';
          else hint.innerHTML = 'При таком расходе смена в 8 моточасов съедает <b>' + U.liters(8 * n) + '</b>.';
        }
        bd.addEventListener('click', function (e) {
          var b = e.target.closest('#f-meter [data-m]');
          if (!b) return;
          U.$$('#f-meter button', bd).forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          sync();
        });
        bd.addEventListener('input', sync);
        sync();
        if (!u) setTimeout(function () { bd.querySelector('#f-name').focus(); }, 380);
      },
      onSave: function (bd) {
        var $ = function (x) { return bd.querySelector(x); };
        var name = $('#f-name').value.trim();
        if (!name) { U.toast('Введите название техники'); return false; }
        var mb = bd.querySelector('#f-meter .on');
        var patch = {
          name: name,
          plate: $('#f-plate').value.trim(),
          kind: $('#f-kind').value,
          meter: mb ? mb.dataset.m : 'hours',
          norm: U.num($('#f-norm').value),
          tank: U.num($('#f-tank').value),
          fuel: $('#f-fuel').value,
          driverId: $('#f-driver2').value || null,
          serviceEvery: U.num($('#f-every').value),
          meterStart: U.num($('#f-meterstart').value),
          active: $('#f-active').checked,
          note: $('#f-note').value.trim()
        };
        if (!u) patch.tankStart = U.num($('#f-tankstart').value);
        if (u) {
          /* показания могли исправить вручную — не даём им уехать назад из-за смен */
          DB.updUnit(u.id, patch);
          U.toast('Сохранено');
          App.render();
        } else {
          var nu = DB.addUnit(patch);
          U.toast('Техника добавлена');
          App.go('#/unit/' + nu.id);
        }
        return true;
      }
    });
  };

  /* ---------- ВОДИТЕЛЬ ---------- */
  F.driverForm = function (driverId) {
    var d = driverId ? DB.driver(driverId) : null;
    var h = '<div class="list">' +
      '<div class="field"><label>Имя</label><input id="d-name" placeholder="Рустам Хайдаров" value="' +
      esc(d ? d.name : '') + '" autocomplete="off"></div>' +
      '<div class="field"><label>Телефон</label><input id="d-phone" type="tel" inputmode="tel" placeholder="+998 90 000-00-00" value="' +
      esc(d ? d.phone || '' : '') + '"></div>' +
      '<div class="field col"><label>Заметка</label><textarea id="d-note" placeholder="Категория прав, стаж, на какой технике работает…">' +
      esc(d ? d.note || '' : '') + '</textarea></div></div>';
    App.sheet({
      title: d ? 'Изменить водителя' : 'Новый водитель',
      html: h, save: 'Сохранить',
      onOpen: function (bd) { setTimeout(function () { bd.querySelector('#d-name').focus(); }, 380); },
      onSave: function (bd) {
        var name = bd.querySelector('#d-name').value.trim();
        if (!name) { U.toast('Введите имя'); return false; }
        var patch = {
          name: name,
          phone: bd.querySelector('#d-phone').value.trim(),
          note: bd.querySelector('#d-note').value.trim()
        };
        if (d) { DB.updDriver(d.id, patch); U.toast('Сохранено'); App.render(); }
        else { var nd = DB.addDriver(patch); U.toast('Водитель добавлен'); App.go('#/driver/' + nd.id); }
        return true;
      }
    });
  };

  /* ---------- ЗАПРАВКА ---------- */
  F.fillForm = function (opId, unitId) {
    if (!DB.units().length) { U.toast('Сначала добавьте технику'); return F.unitForm(); }
    var op = opId ? DB.fuelOp(opId) : null;
    var st = DB.data.settings;
    var d = op || {
      unitId: unitId || DB.units()[0].id, driverId: null, date: U.today(),
      liters: '', price: st.price || '', source: 'tank', meter: '', fuel: st.fuel, note: ''
    };
    if (!op && d.unitId) {
      var uu = DB.unit(d.unitId);
      if (uu) { d.driverId = uu.driverId; d.fuel = uu.fuel || st.fuel; }
    }

    var h = '<div class="list">' + unitSelect(d.unitId) + driverSelect(d.driverId) +
      '<div class="field"><label>Дата</label><input id="f-date" type="date" value="' + esc(d.date) + '"></div>' +
      '</div>';

    h += '<h2 class="sec">Топливо</h2><div class="list">' +
      '<div class="field"><label>Литров</label><input id="f-liters" type="text" inputmode="decimal" placeholder="0" value="' +
      (d.liters || '') + '"><span class="unit">л</span></div>' +
      '<div class="field"><label>Цена за литр</label><input id="f-price" type="text" inputmode="decimal" placeholder="0" value="' +
      (d.price || '') + '"><span class="unit">' + esc(st.currency) + '</span></div>' +
      '<div class="field"><label>Вид</label><select id="f-fuel">' +
      DB.FUELS.map(function (x) {
        return '<option value="' + esc(x) + '"' + ((d.fuel || st.fuel) === x ? ' selected' : '') + '>' + esc(x) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>Счётчик</label><input id="f-meter" type="text" inputmode="decimal" placeholder="необязательно" value="' +
      (d.meter != null && d.meter !== '' ? d.meter : '') + '"><span class="unit" id="u-m">м·ч</span></div>' +
      '</div>';

    h += '<div class="seg" id="f-source" style="margin-top:12px">' +
      '<button data-s="tank" class="' + (d.source !== 'azs' ? 'on' : '') + '">Со склада</button>' +
      '<button data-s="azs" class="' + (d.source === 'azs' ? 'on' : '') + '">На АЗС</button></div>';

    h += '<div class="list"><div class="field col"><label>Заметка</label>' +
      '<textarea id="f-note" placeholder="Номер талона, чек, кто выдал…">' + esc(d.note || '') + '</textarea></div></div>';

    h += '<div class="card pad" id="preview" style="margin-top:16px"></div>';

    App.sheet({
      title: op ? 'Изменить заправку' : 'Заправка',
      html: h, save: op ? 'Сохранить' : 'Записать',
      onOpen: function (bd) {
        var $ = function (x) { return bd.querySelector(x); };
        watchDriverSelect(bd);
        function source() { var b = bd.querySelector('#f-source .on'); return b ? b.dataset.s : 'tank'; }
        function preview() {
          var u = DB.unit($('#f-unit').value);
          if (!u) return;
          $('#u-m').textContent = U.meterInfo(u.meter).unit;
          var lit = U.num($('#f-liters').value), price = U.num($('#f-price').value);
          var before = CALC.tankLeft(u, $('#f-date').value).left;
          if (op) before -= U.num(op.liters);            // при правке не считаем саму себя дважды
          var after = before + lit;
          var over = U.num(u.tank) > 0 && after > U.num(u.tank) * 1.03;
          var tank = CALC.tankState();
          var html = V.kv('Сумма', U.money(lit * price), 'big') +
            V.kv('В баке было', U.liters(before)) +
            V.kv('Станет', (over ? '<span style="color:var(--orange)">' + U.liters(after) + '</span>' : U.liters(after)) +
              (U.num(u.tank) ? ' <span style="color:var(--text-2);font-weight:400">из ' + U.liters(u.tank) + '</span>' : ''));
          if (source() === 'tank') html += V.kv('Останется на складе', U.liters(tank.left - lit + (op && op.source === 'tank' ? U.num(op.liters) : 0)));
          if (over) html += '<div class="hint" style="padding:8px 0 0"><b>В бак столько не влезет.</b> ' +
            'Либо в баке было меньше, чем считает приложение, либо часть топлива уходит мимо — стоит сделать замер.</div>';
          $('#preview').innerHTML = html;
        }
        bd.addEventListener('input', preview);
        bd.addEventListener('change', function (e) {
          if (e.target.id === 'f-unit') {
            var u = DB.unit(e.target.value);
            if (u && !op) {
              if (u.driverId) $('#f-driver').value = u.driverId;
              if (u.fuel) $('#f-fuel').value = u.fuel;
            }
          }
          preview();
        });
        bd.addEventListener('click', function (e) {
          var b = e.target.closest('#f-source [data-s]');
          if (!b) return;
          U.$$('#f-source button', bd).forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          preview();
        });
        preview();
        if (!op) setTimeout(function () { $('#f-liters').focus(); }, 380);
      },
      onSave: function (bd) {
        var $ = function (x) { return bd.querySelector(x); };
        var lit = U.num($('#f-liters').value);
        if (lit <= 0) { U.toast('Сколько литров залили?'); return false; }
        var drv = resolveDriver(bd);
        if (drv === '__error') { U.toast('Введите имя водителя'); return false; }
        var sb = bd.querySelector('#f-source .on');
        var rec = {
          type: 'fill', unitId: $('#f-unit').value, driverId: drv,
          date: $('#f-date').value || U.today(),
          liters: lit, price: U.num($('#f-price').value),
          sum: lit * U.num($('#f-price').value),
          source: sb ? sb.dataset.s : 'tank',
          meter: $('#f-meter').value !== '' ? U.num($('#f-meter').value) : null,
          fuel: $('#f-fuel').value, note: $('#f-note').value.trim()
        };
        if (op) { DB.updFuel(op.id, rec); U.toast('Заправка изменена'); }
        else { DB.addFuel(rec); U.toast('Записано: ' + U.liters(lit)); }
        App.render();
        return true;
      }
    });
  };

  /* ---------- СМЕНА ---------- */
  F.shiftForm = function (opId, unitId) {
    if (!DB.units().length) { U.toast('Сначала добавьте технику'); return F.unitForm(); }
    var op = opId ? DB.shift(opId) : null;
    var d = op || {
      unitId: unitId || DB.units()[0].id, driverId: null, date: U.today(),
      start: '', end: '', work: '', site: '', note: ''
    };
    if (!op) {
      var uu = DB.unit(d.unitId);
      if (uu) { d.driverId = uu.driverId; d.start = U.dec(CALC.meterNow(uu), 1); }
    }
    var mode = op ? (op.start != null && op.start !== '' ? 'meter' : 'work') : 'meter';

    var h = '<div class="list">' + unitSelect(d.unitId) + driverSelect(d.driverId) +
      '<div class="field"><label>Дата</label><input id="f-date" type="date" value="' + esc(d.date) + '"></div>' +
      '<div class="field"><label>Объект</label><input id="f-site" list="sites" placeholder="Карьер, ЖК, трасса…" value="' +
      esc(d.site || '') + '" autocomplete="off"></div></div>' +
      '<datalist id="sites">' + DB.sites().map(function (s) {
        return '<option value="' + esc(s) + '"></option>';
      }).join('') + '</datalist>';

    h += '<h2 class="sec">Наработка</h2>' +
      '<div class="seg" id="f-mode">' +
      '<button data-m="meter" class="' + (mode === 'meter' ? 'on' : '') + '">По счётчику</button>' +
      '<button data-m="work" class="' + (mode === 'work' ? 'on' : '') + '">Сразу итогом</button></div>' +
      '<div class="list" id="box-meter"' + (mode !== 'meter' ? ' style="display:none"' : '') + '>' +
      '<div class="field"><label>На начало</label><input id="f-start" type="text" inputmode="decimal" placeholder="0" value="' +
      (d.start != null ? d.start : '') + '"><span class="unit mu">м·ч</span></div>' +
      '<div class="field"><label>На конец</label><input id="f-end" type="text" inputmode="decimal" placeholder="0" value="' +
      (d.end != null ? d.end : '') + '"><span class="unit mu">м·ч</span></div></div>' +
      '<div class="list" id="box-work"' + (mode === 'meter' ? ' style="display:none"' : '') + '>' +
      '<div class="field"><label>Отработано</label><input id="f-work" type="text" inputmode="decimal" placeholder="0" value="' +
      (d.work || '') + '"><span class="unit mu">м·ч</span></div></div>';

    h += '<div class="list" style="margin-top:12px"><div class="field col"><label>Заметка</label>' +
      '<textarea id="f-note" placeholder="Что делали, простои, поломки…">' + esc(d.note || '') + '</textarea></div></div>';
    h += '<div class="card pad" id="preview" style="margin-top:16px"></div>';

    App.sheet({
      title: op ? 'Изменить смену' : 'Смена',
      html: h, save: op ? 'Сохранить' : 'Записать',
      onOpen: function (bd) {
        var $ = function (x) { return bd.querySelector(x); };
        watchDriverSelect(bd);
        function mode2() { var b = bd.querySelector('#f-mode .on'); return b ? b.dataset.m : 'meter'; }
        function draft() {
          return { start: $('#f-start').value, end: $('#f-end').value, work: $('#f-work').value };
        }
        function preview() {
          var u = DB.unit($('#f-unit').value);
          if (!u) return;
          U.$$('.mu', bd).forEach(function (x) { x.textContent = U.meterInfo(u.meter).unit; });
          $('#box-meter').style.display = mode2() === 'meter' ? '' : 'none';
          $('#box-work').style.display = mode2() === 'work' ? '' : 'none';
          var s = draft();
          var wk = mode2() === 'meter'
            ? Math.max(0, U.num(s.end) - U.num(s.start))
            : Math.max(0, U.num(s.work));
          var norm = CALC.normFor(u, wk);
          var left = CALC.tankLeft(u, $('#f-date').value).left;
          if (op) left += CALC.normFor(u, CALC.shiftWork(op));
          var html = V.kv('Наработка', U.work(wk, u.meter), 'big') +
            V.kv('Спишется по норме', U.liters(norm)) +
            V.kv('Останется в баке', (left - norm < 0
              ? '<span style="color:var(--orange)">' + U.liters(left - norm) + '</span>'
              : U.liters(left - norm)));
          if (left - norm < 0) html += '<div class="hint" style="padding:8px 0 0">Расчётный остаток уходит в минус: ' +
            'скорее всего, какие-то заправки ещё не внесены.</div>';
          $('#preview').innerHTML = html;
        }
        bd.addEventListener('input', preview);
        bd.addEventListener('change', function (e) {
          if (e.target.id === 'f-unit' && !op) {
            var u = DB.unit(e.target.value);
            if (u) {
              $('#f-start').value = U.dec(CALC.meterNow(u), 1);
              if (u.driverId) $('#f-driver').value = u.driverId;
            }
          }
          preview();
        });
        bd.addEventListener('click', function (e) {
          var b = e.target.closest('#f-mode [data-m]');
          if (!b) return;
          U.$$('#f-mode button', bd).forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          preview();
        });
        preview();
        if (!op) setTimeout(function () { $('#f-end').focus(); }, 380);
      },
      onSave: function (bd) {
        var $ = function (x) { return bd.querySelector(x); };
        var mb = bd.querySelector('#f-mode .on');
        var byMeter = (mb ? mb.dataset.m : 'meter') === 'meter';
        var wk = byMeter ? U.num($('#f-end').value) - U.num($('#f-start').value) : U.num($('#f-work').value);
        if (!(wk > 0)) { U.toast(byMeter ? 'Показания на конец должны быть больше' : 'Укажите наработку'); return false; }
        var drv = resolveDriver(bd);
        if (drv === '__error') { U.toast('Введите имя водителя'); return false; }
        var rec = {
          unitId: $('#f-unit').value, driverId: drv, date: $('#f-date').value || U.today(),
          start: byMeter ? U.num($('#f-start').value) : null,
          end: byMeter ? U.num($('#f-end').value) : null,
          work: byMeter ? null : wk,
          site: $('#f-site').value.trim(), note: $('#f-note').value.trim()
        };
        if (op) { DB.updShift(op.id, rec); U.toast('Смена изменена'); }
        else { DB.addShift(rec); U.toast('Смена записана'); }
        App.render();
        return true;
      }
    });
  };

  /* ---------- ЗАМЕР БАКА ---------- */
  F.checkForm = function (opId, unitId) {
    if (!DB.units().length) { U.toast('Сначала добавьте технику'); return F.unitForm(); }
    var op = opId ? DB.fuelOp(opId) : null;
    var d = op || { unitId: unitId || DB.units()[0].id, date: U.today(), liters: '', meter: '', note: '' };

    var h = '<div class="hint" style="padding:0 4px 12px">Замер — точка опоры. Приложение сравнит его со своим расчётом ' +
      'и покажет недостачу, а дальше начнёт считать остаток заново от реальной цифры.</div>' +
      '<div class="list">' + unitSelect(d.unitId) +
      '<div class="field"><label>Дата</label><input id="f-date" type="date" value="' + esc(d.date) + '"></div>' +
      '<div class="field"><label>В баке</label><input id="f-liters" type="text" inputmode="decimal" placeholder="0" value="' +
      (d.liters !== '' && d.liters != null ? d.liters : '') + '"><span class="unit">л</span></div>' +
      '<div class="field"><label>Счётчик</label><input id="f-meter" type="text" inputmode="decimal" placeholder="необязательно" value="' +
      (d.meter != null && d.meter !== '' ? d.meter : '') + '"><span class="unit" id="u-m">м·ч</span></div>' +
      '<div class="field col"><label>Заметка</label><textarea id="f-note" placeholder="Кто замерял, чем…">' +
      esc(d.note || '') + '</textarea></div></div>' +
      '<div class="card pad" id="preview" style="margin-top:16px"></div>';

    App.sheet({
      title: op ? 'Изменить замер' : 'Замер бака',
      html: h, save: op ? 'Сохранить' : 'Записать',
      onOpen: function (bd) {
        var $ = function (x) { return bd.querySelector(x); };
        function preview() {
          var u = DB.unit($('#f-unit').value);
          if (!u) return;
          $('#u-m').textContent = U.meterInfo(u.meter).unit;
          var expected = CALC.tankLeft(u, $('#f-date').value).left;
          var found = U.num($('#f-liters').value);
          var dev = found - expected;
          var html = V.kv('По расчёту должно быть', U.liters(expected), 'big');
          if ($('#f-liters').value !== '') {
            html += V.kv('Разница', (dev < -0.5
              ? '<span style="color:var(--red)">недостача ' + U.liters(-dev) + '</span>'
              : dev > 0.5 ? '<span style="color:var(--accent)">излишек ' + U.liters(dev) + '</span>'
                : 'сходится'));
            if (dev < -0.5 && DB.data.settings.price) {
              html += V.kv('В деньгах', U.money(-dev * DB.data.settings.price));
            }
          }
          $('#preview').innerHTML = html;
        }
        bd.addEventListener('input', preview);
        bd.addEventListener('change', preview);
        preview();
        if (!op) setTimeout(function () { $('#f-liters').focus(); }, 380);
      },
      onSave: function (bd) {
        var $ = function (x) { return bd.querySelector(x); };
        if ($('#f-liters').value === '') { U.toast('Сколько литров в баке?'); return false; }
        var rec = {
          type: 'check', unitId: $('#f-unit').value, date: $('#f-date').value || U.today(),
          liters: U.num($('#f-liters').value), price: 0, sum: 0,
          meter: $('#f-meter').value !== '' ? U.num($('#f-meter').value) : null,
          note: $('#f-note').value.trim()
        };
        if (op) { DB.updFuel(op.id, rec); U.toast('Замер изменён'); }
        else { DB.addFuel(rec); U.toast('Замер записан'); }
        App.render();
        return true;
      }
    });
  };

  /* ---------- ПРИХОД НА СКЛАД ---------- */
  F.intakeForm = function (opId) {
    var op = opId ? DB.fuelOp(opId) : null;
    var st = DB.data.settings;
    var d = op || { date: U.today(), liters: '', price: st.price || '', fuel: st.fuel, note: '' };

    var h = '<div class="list">' +
      '<div class="field"><label>Дата</label><input id="f-date" type="date" value="' + esc(d.date) + '"></div>' +
      '<div class="field"><label>Литров</label><input id="f-liters" type="text" inputmode="decimal" placeholder="0" value="' +
      (d.liters || '') + '"><span class="unit">л</span></div>' +
      '<div class="field"><label>Цена за литр</label><input id="f-price" type="text" inputmode="decimal" placeholder="0" value="' +
      (d.price || '') + '"><span class="unit">' + esc(st.currency) + '</span></div>' +
      '<div class="field"><label>Вид</label><select id="f-fuel">' +
      DB.FUELS.map(function (x) {
        return '<option value="' + esc(x) + '"' + ((d.fuel || st.fuel) === x ? ' selected' : '') + '>' + esc(x) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field col"><label>Заметка</label><textarea id="f-note" placeholder="Поставщик, номер накладной…">' +
      esc(d.note || '') + '</textarea></div></div>' +
      '<div class="card pad" id="preview" style="margin-top:16px"></div>';

    App.sheet({
      title: op ? 'Изменить приход' : 'Приход топлива',
      html: h, save: op ? 'Сохранить' : 'Записать',
      onOpen: function (bd) {
        var $ = function (x) { return bd.querySelector(x); };
        function preview() {
          var lit = U.num($('#f-liters').value), price = U.num($('#f-price').value);
          var t = CALC.tankState();
          var was = t.left - (op ? U.num(op.liters) : 0);
          $('#preview').innerHTML = V.kv('Сумма', U.money(lit * price), 'big') +
            V.kv('На складе было', U.liters(was)) +
            V.kv('Станет', U.liters(was + lit) +
              (U.num(DB.data.settings.tankVolume) ? ' <span style="color:var(--text-2);font-weight:400">из ' +
                U.liters(DB.data.settings.tankVolume) + '</span>' : ''));
        }
        bd.addEventListener('input', preview);
        preview();
        if (!op) setTimeout(function () { $('#f-liters').focus(); }, 380);
      },
      onSave: function (bd) {
        var $ = function (x) { return bd.querySelector(x); };
        var lit = U.num($('#f-liters').value);
        if (lit <= 0) { U.toast('Сколько литров привезли?'); return false; }
        var rec = {
          type: 'intake', unitId: null, date: $('#f-date').value || U.today(),
          liters: lit, price: U.num($('#f-price').value), sum: lit * U.num($('#f-price').value),
          fuel: $('#f-fuel').value, note: $('#f-note').value.trim()
        };
        if (op) { DB.updFuel(op.id, rec); U.toast('Приход изменён'); }
        else { DB.addFuel(rec); U.toast('Принято ' + U.liters(lit)); }
        App.render();
        return true;
      }
    });
  };

  /* ---------- ЗАМЕР СКЛАДА ---------- */
  F.tankCheckForm = function (opId) {
    var op = opId ? DB.fuelOp(opId) : null;
    var d = op || { date: U.today(), liters: '', note: '' };
    var h = '<div class="hint" style="padding:0 4px 12px">Сколько топлива реально осталось в ёмкости. ' +
      'Приложение сравнит с расчётом и покажет, не утекло ли что-то мимо учёта.</div>' +
      '<div class="list">' +
      '<div class="field"><label>Дата</label><input id="f-date" type="date" value="' + esc(d.date) + '"></div>' +
      '<div class="field"><label>В ёмкости</label><input id="f-liters" type="text" inputmode="decimal" placeholder="0" value="' +
      (d.liters !== '' && d.liters != null ? d.liters : '') + '"><span class="unit">л</span></div>' +
      '<div class="field col"><label>Заметка</label><textarea id="f-note" placeholder="Кто замерял…">' +
      esc(d.note || '') + '</textarea></div></div>' +
      '<div class="card pad" id="preview" style="margin-top:16px"></div>';

    App.sheet({
      title: op ? 'Изменить замер' : 'Замер склада',
      html: h, save: op ? 'Сохранить' : 'Записать',
      onOpen: function (bd) {
        var $ = function (x) { return bd.querySelector(x); };
        function preview() {
          var t = CALC.tankState($('#f-date').value);
          var found = U.num($('#f-liters').value), dev = found - t.left;
          var html = V.kv('По расчёту должно быть', U.liters(t.left), 'big');
          if ($('#f-liters').value !== '') {
            html += V.kv('Разница', dev < -0.5
              ? '<span style="color:var(--red)">недостача ' + U.liters(-dev) + '</span>'
              : dev > 0.5 ? '<span style="color:var(--accent)">излишек ' + U.liters(dev) + '</span>' : 'сходится');
          }
          $('#preview').innerHTML = html;
        }
        bd.addEventListener('input', preview);
        bd.addEventListener('change', preview);
        preview();
        if (!op) setTimeout(function () { $('#f-liters').focus(); }, 380);
      },
      onSave: function (bd) {
        var $ = function (x) { return bd.querySelector(x); };
        if ($('#f-liters').value === '') { U.toast('Сколько литров в ёмкости?'); return false; }
        var rec = {
          type: 'tankcheck', unitId: null, date: $('#f-date').value || U.today(),
          liters: U.num($('#f-liters').value), price: 0, sum: 0, note: $('#f-note').value.trim()
        };
        if (op) { DB.updFuel(op.id, rec); U.toast('Замер изменён'); }
        else { DB.addFuel(rec); U.toast('Замер записан'); }
        App.render();
        return true;
      }
    });
  };

  /* ---------- ТО И РЕМОНТ ---------- */
  F.serviceForm = function (opId, unitId) {
    if (!DB.units().length) { U.toast('Сначала добавьте технику'); return F.unitForm(); }
    var op = opId ? DB.service(opId) : null;
    var d = op || { unitId: unitId || DB.units()[0].id, date: U.today(), kind: 'to', meter: '', sum: '', note: '' };
    if (!op) {
      var uu = DB.unit(d.unitId);
      if (uu) d.meter = U.dec(CALC.meterNow(uu), 1);
    }

    var h = '<div class="seg" id="f-kind">' +
      '<button data-k="to" class="' + (d.kind !== 'repair' ? 'on' : '') + '">ТО по регламенту</button>' +
      '<button data-k="repair" class="' + (d.kind === 'repair' ? 'on' : '') + '">Ремонт</button></div>' +
      '<div class="list">' + unitSelect(d.unitId) +
      '<div class="field"><label>Дата</label><input id="f-date" type="date" value="' + esc(d.date) + '"></div>' +
      '<div class="field"><label>Счётчик</label><input id="f-meter" type="text" inputmode="decimal" placeholder="0" value="' +
      (d.meter != null ? d.meter : '') + '"><span class="unit" id="u-m">м·ч</span></div>' +
      '<div class="field"><label>Стоимость</label><input id="f-sum" type="text" inputmode="decimal" placeholder="0" value="' +
      (d.sum || '') + '"><span class="unit">' + esc(DB.data.settings.currency) + '</span></div>' +
      '<div class="field col"><label>Что делали</label><textarea id="f-note" placeholder="Масло, фильтры, замена шланга…">' +
      esc(d.note || '') + '</textarea></div></div>' +
      '<div class="card pad" id="preview" style="margin-top:16px"></div>';

    App.sheet({
      title: op ? 'Изменить запись' : 'ТО или ремонт',
      html: h, save: op ? 'Сохранить' : 'Записать',
      onOpen: function (bd) {
        var $ = function (x) { return bd.querySelector(x); };
        function kind() { var b = bd.querySelector('#f-kind .on'); return b ? b.dataset.k : 'to'; }
        function preview() {
          var u = DB.unit($('#f-unit').value);
          if (!u) return;
          $('#u-m').textContent = U.meterInfo(u.meter).unit;
          var html = '';
          if (kind() === 'to' && U.num(u.serviceEvery) > 0) {
            var next = U.num($('#f-meter').value) + U.num(u.serviceEvery);
            html = V.kv('Следующее ТО на', U.work(next, u.meter), 'big') +
              V.kv('Периодичность', 'каждые ' + U.work(u.serviceEvery, u.meter));
          } else if (kind() === 'to') {
            html = '<div class="hint" style="padding:0">У этой техники не задана периодичность ТО — ' +
              'укажите её в карточке, тогда приложение начнёт напоминать.</div>';
          } else {
            html = V.kv('Ремонт', 'счётчик ТО не сбрасывается', 'big');
          }
          $('#preview').innerHTML = html;
        }
        bd.addEventListener('input', preview);
        bd.addEventListener('change', function (e) {
          if (e.target.id === 'f-unit' && !op) {
            var u = DB.unit(e.target.value);
            if (u) $('#f-meter').value = U.dec(CALC.meterNow(u), 1);
          }
          preview();
        });
        bd.addEventListener('click', function (e) {
          var b = e.target.closest('#f-kind [data-k]');
          if (!b) return;
          U.$$('#f-kind button', bd).forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          preview();
        });
        preview();
      },
      onSave: function (bd) {
        var $ = function (x) { return bd.querySelector(x); };
        var kb = bd.querySelector('#f-kind .on');
        var rec = {
          unitId: $('#f-unit').value, date: $('#f-date').value || U.today(),
          kind: kb ? kb.dataset.k : 'to',
          meter: $('#f-meter').value !== '' ? U.num($('#f-meter').value) : null,
          sum: U.num($('#f-sum').value), note: $('#f-note').value.trim()
        };
        if (op) { DB.updService(op.id, rec); U.toast('Запись изменена'); }
        else { DB.addService(rec); U.toast(rec.kind === 'to' ? 'ТО записано' : 'Ремонт записан'); }
        App.render();
        return true;
      }
    });
  };

  /* ---------- ИМПОРТ ---------- */
  F.importSheet = function () {
    var h = '<div class="hint" style="padding:0 4px 14px">Выберите файл резервной копии <b>.json</b> ' +
      'или таблицу <b>.csv</b>. Можно вставить текст прямо в поле ниже.</div>' +
      '<div class="list">' +
      '<button class="row tap" id="pick"><span class="op-ic">📁</span><span class="grow">' +
      '<span class="ttl" style="color:var(--accent)">Выбрать файл</span>' +
      '<span class="sub">.json или .csv</span></span></button></div>' +
      '<input type="file" id="file" accept=".json,.csv,.txt,application/json,text/csv" style="display:none">' +
      '<h2 class="sec">Или вставьте текст</h2>' +
      '<div class="list"><div class="field col"><textarea id="paste" style="min-height:130px;font-size:14px" ' +
      'placeholder="Экскаватор Hitachi;EX 2201;Экскаватор;моточасы;14,5;400;ДТ;250"></textarea></div></div>' +
      '<div class="hint">Таблица техники: <b>Название;Госномер;Тип;Счётчик;Норма;Бак;Топливо;ТО через</b>.<br>' +
      'Таблица заправок: <b>Дата;Техника;Водитель;Литров;Цена;Счётчик;Заметка</b>.<br>' +
      'Разделитель — точка с запятой, строка заголовков не обязательна. ' +
      'Технику загружайте первой: заправки привяжутся к ней по названию или госномеру.</div>' +
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
          var m = e.target.closest('#mode [data-m]');
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
              U.toast('Загружено: ' + res.units + ' единиц техники');
            } else {
              if (mode === 'replace') { DB.data = DB.empty(); DB.save(); }
              var r = DB.importCSV(text);
              DB.save();
              U.toast(r.added
                ? (r.kind === 'fuel' ? 'Добавлено заправок: ' : 'Добавлено техники: ') + r.added
                : 'Ни одной строки не распознано');
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
            text: 'Техника, смены, заправки и ТО будут стёрты и заменены загружаемыми.',
            ok: 'Заменить', danger: true, onOk: run
          });
        } else run();
        return false;
      }
    });
  };

  /* ---------- КОД-ПАРОЛЬ ---------- */
  F.pinSheet = function () {
    var h = '<div class="hint" style="padding:0 4px 14px">Код из 4 цифр будет спрашиваться при каждом запуске.</div>' +
      '<div class="list"><div class="field"><label>Новый код</label>' +
      '<input id="pin1" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]*" placeholder="••••" style="letter-spacing:6px"></div>' +
      '<div class="field"><label>Ещё раз</label>' +
      '<input id="pin2" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]*" placeholder="••••" style="letter-spacing:6px"></div></div>' +
      '<div class="hint">Код закрывает вход от чужих глаз, но не шифрует базу — это защита от случайного взгляда, ' +
      'а не от специалиста с доступом к телефону.</div>';
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
