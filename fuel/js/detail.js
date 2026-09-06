/* Карточка техники и формы: заправка, техника, приход, замер */
(function (w) {
  'use strict';

  var esc = U.esc;

  /* ============ столбики расхода по участкам ============ */
  V.spark = function (u, segs) {
    var good = segs.filter(function (s) { return s.rate != null; }).slice(-12);
    if (good.length < 2) return '';
    /* шкала не от нуля: около нормы разница в 5% иначе не видна */
    var hi = u.norm > 0 ? u.norm : 0, lo = u.norm > 0 ? u.norm : Infinity;
    good.forEach(function (s) { hi = Math.max(hi, s.rate); lo = Math.min(lo, s.rate); });
    lo = Math.max(0, lo - (hi - lo) * 0.6 - hi * 0.02);
    var span = (hi * 1.04 - lo) || 1;
    var pos = function (v) { return Math.max(4, Math.min(100, (v - lo) / span * 100)); };
    var lim = U.num(DB.data.settings.overrun) || 10;

    var bars = good.map(function (s) {
      var over = u.norm > 0 && s.rate > u.norm * (1 + lim / 100);
      return '<div class="b' + (over ? ' over' : '') + '" style="height:' + pos(s.rate).toFixed(1) + '%" ' +
        'title="' + U.rate(s.rate, u.meter) + '"><i style="height:100%"></i></div>';
    }).join('');

    var normLine = u.norm > 0
      ? '<div style="position:absolute;left:0;right:0;bottom:' + pos(u.norm).toFixed(1) + '%;' +
        'border-top:1.5px dashed var(--text-2);pointer-events:none;z-index:2"></div>'
      : '';

    return '<div style="position:relative"><div class="spark">' + bars + '</div>' + normLine + '</div>' +
      '<div class="spark-x"><span>' + U.fmtDate(good[0].to.date) + '</span>' +
      (u.norm > 0 ? '<span>пунктир — норма ' + U.rate(u.norm, u.meter) + '</span>' : '') +
      '<span>' + U.fmtDate(good[good.length - 1].to.date) + '</span></div>';
  };

  /* ============ КАРТОЧКА ТЕХНИКИ ============ */
  V.unitDetail = function (id) {
    var u = DB.unit(id);
    if (!u) return V.topbarBack('Техника') + '<div class="wrap">' +
      V.empty('🤷', 'Техника не найдена', 'Возможно, она была удалена.') + '</div>';

    var s = CALC.unit(u);
    var mk = U.monthKey(U.today());
    var m = CALC.month(mk).byUnit[u.id] || { liters: 0, cost: 0, run: 0 };

    var h = V.topbarBack(u.name, '<button data-act="edit-unit" data-id="' + u.id + '" style="font-size:16px">Изменить</button>');
    h += '<div class="wrap">';
    h += '<h1 class="big" style="margin-bottom:6px">' + esc(u.name) + '</h1>';
    h += '<div style="margin-bottom:14px">' + V.devBadge(s) + ' ' +
      '<span class="badge">' + esc(U.kind(u.kind).name) + '</span> ' +
      (u.plate ? '<span class="badge">' + esc(u.plate) + '</span> ' : '') +
      '<span class="badge">' + esc(U.fuel(u.fuel).short) + '</span></div>';

    /* главное число — фактический расход */
    h += '<div class="hero">' +
      '<div class="lbl">Средний расход</div>' +
      '<div class="amt num">' + (s.avg != null ? U.rate(s.avg, u.meter) : '—') + '</div>' +
      '<div class="delta">' +
      (u.norm > 0 ? 'норма ' + U.rate(u.norm, u.meter) : 'норма не задана') +
      (s.dev != null ? ' · отклонение ' + U.pct(s.dev, true) : '') + '</div>' +
      (s.extraLiters > 0.5
        ? '<div class="delta" style="color:var(--red);font-weight:600">лишних ' + U.liters(s.extraLiters) +
          ' ≈ ' + U.moneyShort(s.extraCost) + ' за всё время наблюдений</div>'
        : (s.extraLiters < -0.5 && s.avg != null
          ? '<div class="delta" style="color:var(--accent);font-weight:600">экономия ' + U.liters(-s.extraLiters) +
            ' ≈ ' + U.moneyShort(-s.extraCost) + '</div>' : '')) +
      V.spark(u, s.segments) +
      '</div>';

    h += '<div class="btn-row">' +
      '<button class="btn" data-act="new-fill" data-unit="' + u.id + '">Заправка</button>' +
      (s.last ? '<button class="btn sec" data-act="repeat-fill" data-unit="' + u.id + '">Как в прошлый раз</button>' : '') +
      '</div>';

    h += '<div class="stats">' +
      '<div class="stat"><div class="k">За этот месяц</div><div class="v num">' + U.liters(m.liters) + '</div>' +
      '<div class="k" style="margin-top:3px">' + U.money(m.cost) + '</div></div>' +
      '<div class="stat"><div class="k">Счётчик</div><div class="v num sm">' + U.meter(s.meterNow, u.meter) + '</div>' +
      '<div class="k" style="margin-top:3px">' + (s.perDay > 0 ? U.dec(s.perDay, 1) + ' ' + U.meterUnit(u.meter) + ' в день' : 'нет данных') + '</div></div>' +
      '<div class="stat"><div class="k">Всего залито</div><div class="v num sm">' + U.liters(s.totalLiters) + '</div>' +
      '<div class="k" style="margin-top:3px">' + U.money(s.totalCost) + '</div></div>' +
      '<div class="stat"><div class="k">Последняя заправка</div><div class="v num sm">' +
      (s.last ? U.fmtDate(s.last.date) : '—') + '</div>' +
      '<div class="k" style="margin-top:3px">' + (s.idleDays != null ? U.days(s.idleDays) + ' назад' : '') + '</div></div>' +
      '</div>';

    /* обслуживание */
    if (s.service) {
      var sv = s.service;
      var pct = Math.max(0, Math.min(100, sv.since / sv.every * 100));
      h += '<h2 class="sec">Обслуживание</h2><div class="card pad">' +
        '<div class="kv big"><span class="k">' + (sv.due ? 'ТО просрочено' : 'До ТО') + '</span>' +
        '<span class="v num" style="color:' + (sv.due ? 'var(--red)' : sv.soon ? 'var(--orange)' : 'var(--text)') + '">' +
        U.meter(Math.abs(sv.left), u.meter) + '</span></div>' +
        '<div class="bar ' + (sv.due ? 'bad' : sv.soon ? 'warn' : '') + '"><i style="width:' + pct.toFixed(0) + '%"></i></div>' +
        '<div class="hint" style="padding:10px 0 0">Наработка с последнего ТО — ' + U.meter(sv.since, u.meter) +
        ' из ' + U.meter(sv.every, u.meter) +
        (sv.days != null && !sv.due ? '. При нынешнем темпе это примерно ' + U.days(sv.days) + '.' : '.') + '</div>' +
        '<button class="btn sec sm" style="width:100%;margin-top:12px" data-act="service-done" data-id="' + u.id + '">Отметить ТО сегодня</button>' +
        '</div>';
    }

    /* сигналы по этой единице */
    if (s.alerts.length) {
      h += '<h2 class="sec">Замечания</h2><div class="list">';
      s.alerts.forEach(function (a) {
        h += '<div class="alert' + (a.type === 'overrun' || a.type === 'service' ? ' bad' : '') + '">' +
          '<span class="ic">⚠️</span><span class="tx"><span>' + esc(a.text) + '</span></span></div>';
      });
      h += '</div>';
    }

    /* история заправок */
    h += '<h2 class="sec">Заправки<span class="act">' + s.count + '</span></h2>';
    if (!s.count) {
      h += V.empty('⛽', 'Заправок ещё не было',
        'Первая заправка задаёт точку отсчёта — расход посчитается со второй.',
        '<div style="margin-top:16px"><button class="btn" data-act="new-fill" data-unit="' + u.id + '">Записать заправку</button></div>');
    } else {
      h += '<div class="list">';
      s.fills.slice().reverse().slice(0, 40).forEach(function (f) {
        h += V.fillRow(f, { noIcon: true });
      });
      h += '</div>';
      h += '<div class="hint">Расход считается от полной заправки до полной. Строки без расхода — те, где счётчик не рос или бак заливали не до полного.</div>';
    }

    if (u.note) {
      h += '<h2 class="sec">Заметка</h2><div class="card pad" style="font-size:15px;color:var(--text-2)">' + esc(u.note) + '</div>';
    }

    h += '<div class="btn-row" style="margin-top:22px">' +
      '<button class="btn sec" data-act="edit-unit" data-id="' + u.id + '">Изменить</button>' +
      '<button class="btn danger" data-act="del-unit" data-id="' + u.id + '">Удалить</button></div>';

    return h + '</div>';
  };

  var F = {};

  /* предыдущая заправка этой же техники */
  function prevFill(u, f) {
    var list = DB.fillsOf(u.id);
    var i = -1;
    for (var k = 0; k < list.length; k++) if (list[k].id === f.id) i = k;
    return i > 0 ? list[i - 1] : null;
  }

  /* ============ ФОРМА ЗАПРАВКИ ============ */
  F.fillForm = function (opt) {
    opt = opt || {};
    var units = DB.units();
    if (!units.length) { U.toast('Сначала добавьте технику'); return F.unitForm(); }

    var st = DB.data.settings;
    var f = opt.id ? DB.fill(opt.id) : null;
    var preset = opt.preset || null;
    var unitId = f ? f.unitId : (opt.unitId || (preset && preset.unitId) || (DB.lastFill() || {}).unitId || units[0].id);
    var u = DB.unit(unitId) || units[0];

    var s = CALC.unit(u);
    var prev = f ? prevFill(u, f) : s.last;
    var fuel = f ? f.fuel : (u.fuel || st.fuel);
    var price = f ? f.price : (preset ? preset.price : DB.price(fuel));
    var source = f ? f.source : (preset ? preset.source : st.source);
    var full = f ? f.full !== false : true;

    /* прогноз счётчика: сколько накатали с прошлой заправки при обычном темпе */
    var forecast = null;
    if (!f && prev && s.perDay > 0) {
      var days = Math.max(1, U.diffDays(prev.date, U.today()));
      forecast = Math.round(U.num(prev.meter) + s.perDay * days);
    }

    var h = '<div class="list">';
    h += '<div class="field"><label>Техника</label><select id="f-unit">' +
      units.map(function (x) {
        return '<option value="' + x.id + '"' + (x.id === u.id ? ' selected' : '') + '>' + esc(x.name) + '</option>';
      }).join('') + '</select></div>';
    h += '<div class="field"><label>Литры</label>' +
      '<input id="f-lit" type="text" inputmode="decimal" placeholder="0" style="font-size:22px;font-weight:600" value="' +
      (f ? String(f.liters).replace('.', ',') : (preset ? String(preset.liters).replace('.', ',') : '')) + '"><span class="unit">л</span></div>';
    h += '<div class="field"><label>Цена за литр</label><input id="f-price" type="text" inputmode="decimal" value="' +
      (price ? String(price).replace('.', ',') : '') + '"><span class="unit">' + esc(U.sym()) + '</span></div>';
    h += '<div class="field"><label>Сумма</label><input id="f-cost" type="text" inputmode="decimal" placeholder="0"><span class="unit">' + esc(U.sym()) + '</span></div>';
    h += '<div class="field"><label>Счётчик</label><input id="f-meter" type="text" inputmode="numeric" placeholder="' +
      (prev ? 'было ' + U.int(prev.meter) : U.meterName(u.meter)) + '" value="' +
      (f && f.meter ? U.num(f.meter) : '') + '"><span class="unit" id="f-mu">' + U.meterUnit(u.meter) + '</span></div>';
    h += '<div class="field"><label>Дата</label><input id="f-date" type="date" value="' + (f ? f.date : U.today()) + '"></div>';
    h += '</div>';

    h += '<div class="chips" style="margin-top:12px;border-radius:var(--radius)">' +
      '<button class="chip' + (source === 'tank' ? ' on' : '') + '" data-src="tank">Из бочки</button>' +
      '<button class="chip' + (source === 'station' ? ' on' : '') + '" data-src="station">АЗС</button>' +
      '<button class="chip' + (full ? ' on' : '') + '" data-full="1">До полного бака</button>' +
      (forecast ? '<button class="chip" data-meter="' + forecast + '">Счётчик ≈ ' + U.int(forecast) + '</button>' : '') +
      (prev && prev.liters ? '<button class="chip" data-lit="' + prev.liters + '">Как в прошлый раз · ' + U.liters(prev.liters) + '</button>' : '') +
      '</div>';

    h += '<div class="list" style="margin-top:12px">' +
      '<div class="field"><label>Заправлял</label><input id="f-op" type="text" placeholder="имя водителя" value="' +
      esc(f ? f.operator || '' : (preset ? preset.operator || '' : '')) + '"></div>' +
      '<div class="field col"><label>Заметка</label><textarea id="f-note" style="min-height:44px" placeholder="объект, смена, номер чека…">' +
      esc(f ? f.note || '' : '') + '</textarea></div></div>';

    h += '<div class="card pad" id="f-prev" style="margin-top:14px"></div>';

    if (f) {
      h += '<button class="btn danger" style="margin-top:14px" data-del="' + f.id + '">Удалить заправку</button>';
    }

    App.sheet({
      title: f ? 'Заправка' : 'Новая заправка',
      html: h, save: f ? 'Сохранить' : 'Записать',
      onOpen: function (bd) {
        var $ = function (sel) { return bd.querySelector(sel); };
        var litEl = $('#f-lit'), priceEl = $('#f-price'), costEl = $('#f-cost'), meterEl = $('#f-meter');
        var srcEl = 'tank', fullEl = full;
        srcEl = source;

        function cur() { return DB.unit($('#f-unit').value) || u; }

        function money() {
          var lit = U.num(litEl.value), pr = U.num(priceEl.value);
          if (lit > 0 && pr > 0) costEl.value = U.int(lit * pr);
        }
        money();

        function draw() {
          var cu = cur(), lit = U.num(litEl.value), meter = U.num(meterEl.value);
          var cs = CALC.unit(cu);
          var pv = f ? prevFill(cu, f) : cs.last;
          var out = [];

          /* расход на участке */
          if (lit > 0 && meter > 0 && pv && U.num(pv.meter) > 0) {
            var run = meter - U.num(pv.meter);
            if (run > 0) {
              var rate = lit / run * U.rateBase(cu.meter);
              var txt = 'Расход на участке: <b>' + U.rate(rate, cu.meter) + '</b> за ' + U.meter(run, cu.meter);
              if (cu.norm > 0) {
                var dev = (rate - cu.norm) / cu.norm * 100;
                txt += '<br>Норма ' + U.rate(cu.norm, cu.meter) + ' — ' +
                  (dev > 0.5 ? '<b style="color:var(--red)">перерасход ' + U.pct(dev, true) + '</b>'
                    : dev < -0.5 ? '<b style="color:var(--accent)">экономия ' + U.pct(-dev) + '</b>' : 'ровно по норме');
              }
              out.push(txt);
            } else if (run < 0) {
              out.push('<b style="color:var(--red)">Счётчик меньше прошлого показания (' + U.int(pv.meter) + ')</b> — проверьте цифру');
            } else {
              out.push('<b style="color:var(--orange)">Счётчик не изменился с прошлой заправки</b>');
            }
          } else if (lit > 0 && !meter) {
            out.push('Без показания счётчика расход посчитать не получится — запись сохранится, но в статистику не войдёт.');
          }

          if (cu.tank > 0 && lit > cu.tank * 1.03) {
            out.push('<b style="color:var(--red)">Залито больше объёма бака (' + U.liters(cu.tank) + ')</b>');
          }
          if (srcEl === 'tank' && lit > 0) {
            var tk = CALC.tank(cu.fuel);
            var left = tk.balance - lit + (f && f.source === 'tank' ? U.num(f.liters) : 0);
            out.push('В бочке останется <b>' + U.liters(left) + '</b>' + (left < 0 ? ' — учёт уйдёт в минус' : ''));
          }
          if (!fullEl) out.push('Заправка не до полного — расход посчитается на следующей полной.');

          $('#f-prev').innerHTML = out.length
            ? '<div style="font-size:14px;line-height:1.5;color:var(--text-2)">' + out.join('<br><br>') + '</div>'
            : '<div style="font-size:14px;color:var(--text-2)">Введите литры и показание счётчика — приложение сразу покажет расход.</div>';
        }
        draw();

        litEl.addEventListener('input', function () { money(); draw(); });
        priceEl.addEventListener('input', function () { money(); draw(); });
        costEl.addEventListener('input', function () {
          var c = U.num(costEl.value), lit = U.num(litEl.value), pr = U.num(priceEl.value);
          if (lit > 0) priceEl.value = U.int(c / lit);
          else if (pr > 0) litEl.value = U.dec(c / pr, 1);
          draw();
        });
        meterEl.addEventListener('input', draw);
        $('#f-unit').addEventListener('change', function () {
          var cu = cur();
          $('#f-mu').textContent = U.meterUnit(cu.meter);
          var cs = CALC.unit(cu);
          meterEl.placeholder = cs.last ? 'было ' + U.int(cs.last.meter) : U.meterName(cu.meter);
          if (!priceEl.value) priceEl.value = DB.price(cu.fuel) || '';
          draw();
        });

        bd.addEventListener('click', function (e) {
          var c = e.target.closest('.chip');
          if (c) {
            if (c.dataset.src) {
              srcEl = c.dataset.src;
              U.$$('[data-src]', bd).forEach(function (b) { b.classList.toggle('on', b.dataset.src === srcEl); });
            } else if (c.dataset.full) {
              fullEl = !fullEl;
              c.classList.toggle('on', fullEl);
            } else if (c.dataset.meter) {
              meterEl.value = c.dataset.meter;
            } else if (c.dataset.lit) {
              litEl.value = String(c.dataset.lit).replace('.', ',');
              money();
            }
            draw();
            return;
          }
          var d = e.target.closest('[data-del]');
          if (d) {
            App.closeSheet();
            App.ask({
              title: 'Удалить заправку?',
              text: 'Расход и остаток в бочке пересчитаются заново.',
              ok: 'Удалить', danger: true,
              onOk: function () { DB.delFill(d.dataset.del); U.toast('Заправка удалена'); App.render(); }
            });
          }
        });

        setTimeout(function () { litEl.focus(); }, 380);
        F._fillState = function () { return { source: srcEl, full: fullEl }; };
      },
      onSave: function (bd) {
        var stt = F._fillState();
        var cu = DB.unit(bd.querySelector('#f-unit').value);
        var lit = U.num(bd.querySelector('#f-lit').value);
        if (!cu) { U.toast('Выберите технику'); return false; }
        if (lit <= 0) { U.toast('Введите литры'); return false; }
        var pr = U.num(bd.querySelector('#f-price').value);
        var patch = {
          unitId: cu.id,
          date: bd.querySelector('#f-date').value || U.today(),
          liters: lit,
          price: pr,
          cost: U.num(bd.querySelector('#f-cost').value) || lit * pr,
          meter: U.num(bd.querySelector('#f-meter').value),
          fuel: cu.fuel,
          source: stt.source,
          full: stt.full,
          operator: bd.querySelector('#f-op').value.trim(),
          note: bd.querySelector('#f-note').value.trim()
        };
        if (f) { DB.updFill(f.id, patch); U.toast('Сохранено'); }
        else {
          DB.addFill(patch);
          var seg = CALC.segmentOf(cu, DB.lastFill(cu.id).id);
          U.toast(seg && seg.rate != null
            ? 'Записано · расход ' + U.rate(seg.rate, cu.meter)
            : 'Заправка записана');
        }
        App.render();
        return true;
      }
    });
  };

  /* ============ ФОРМА ТЕХНИКИ ============ */
  F.unitForm = function (id) {
    var u = id ? DB.unit(id) : null;
    var st = DB.data.settings;
    var kind = u ? u.kind : 'truck';
    var meter = u ? u.meter : U.kind(kind).meter;
    var sv = (u && u.service) || {};
    var cur = u ? CALC.unit(u) : null;

    var h = '<div class="list">' +
      '<div class="field"><label>Название</label><input id="u-name" placeholder="Самосвал №1" value="' + esc(u ? u.name : '') + '" autocomplete="off"></div>' +
      '<div class="field"><label>Вид</label><select id="u-kind">' +
      U.KINDS.map(function (k) {
        return '<option value="' + k.code + '"' + (kind === k.code ? ' selected' : '') + '>' + k.ic + ' ' + esc(k.name) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>Счётчик</label><select id="u-meter">' +
      [['km', 'Пробег, км'], ['mh', 'Моточасы']].map(function (t) {
        return '<option value="' + t[0] + '"' + (meter === t[0] ? ' selected' : '') + '>' + t[1] + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>Госномер</label><input id="u-plate" placeholder="не обязательно" value="' + esc(u ? u.plate || '' : '') + '"></div>' +
      '<div class="field"><label>Топливо</label><select id="u-fuel">' +
      U.FUELS.map(function (x) {
        return '<option value="' + x.code + '"' + ((u ? u.fuel : st.fuel) === x.code ? ' selected' : '') + '>' + esc(x.name) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>Норма</label><input id="u-norm" type="text" inputmode="decimal" placeholder="0" value="' +
      (u && u.norm ? String(u.norm).replace('.', ',') : '') + '"><span class="unit" id="u-nu">' + U.rateUnit(meter) + '</span></div>' +
      '<div class="field"><label>Объём бака</label><input id="u-tank" type="text" inputmode="decimal" placeholder="не обязательно" value="' +
      (u && u.tank ? U.num(u.tank) : '') + '"><span class="unit">л</span></div>' +
      '</div>' +
      '<div class="hint">Норма — паспортный или ваш собственный расход. По ней приложение считает перерасход в литрах и деньгах. Объём бака нужен, чтобы ловить заправки «больше, чем влезает».</div>';

    h += '<h2 class="sec">Обслуживание</h2><div class="list">' +
      '<div class="field"><label>ТО каждые</label><input id="u-svc" type="text" inputmode="numeric" placeholder="не следить" value="' +
      (sv.every ? U.num(sv.every) : '') + '"><span class="unit" id="u-su">' + U.meterUnit(meter) + '</span></div>' +
      '<div class="field"><label>Последнее ТО</label><input id="u-svcm" type="text" inputmode="numeric" placeholder="' +
      (cur && cur.meterNow ? 'сейчас ' + U.int(cur.meterNow) : 'показание счётчика') + '" value="' +
      (sv.lastMeter ? U.num(sv.lastMeter) : '') + '"><span class="unit" id="u-su2">' + U.meterUnit(meter) + '</span></div>' +
      '</div><div class="hint">Приложение посчитает наработку с этого показания и предупредит заранее — с запасом в 15%.</div>';

    h += '<div class="list" style="margin-top:12px"><div class="field col"><label>Заметка</label>' +
      '<textarea id="u-note" placeholder="объект, водитель, особенности…">' + esc(u ? u.note || '' : '') + '</textarea></div></div>';

    App.sheet({
      title: u ? 'Изменить технику' : 'Новая техника',
      html: h, save: 'Сохранить',
      onOpen: function (bd) {
        var kindEl = bd.querySelector('#u-kind'), meterEl = bd.querySelector('#u-meter');
        function units() {
          var m = meterEl.value;
          bd.querySelector('#u-nu').textContent = U.rateUnit(m);
          bd.querySelector('#u-su').textContent = U.meterUnit(m);
          bd.querySelector('#u-su2').textContent = U.meterUnit(m);
        }
        kindEl.addEventListener('change', function () {
          meterEl.value = U.kind(kindEl.value).meter;
          units();
        });
        meterEl.addEventListener('change', units);
        if (!u) setTimeout(function () { bd.querySelector('#u-name').focus(); }, 380);
      },
      onSave: function (bd) {
        var name = bd.querySelector('#u-name').value.trim();
        if (!name) { U.toast('Введите название'); return false; }
        var every = U.num(bd.querySelector('#u-svc').value);
        var patch = {
          name: name,
          kind: bd.querySelector('#u-kind').value,
          meter: bd.querySelector('#u-meter').value,
          plate: bd.querySelector('#u-plate').value.trim(),
          fuel: bd.querySelector('#u-fuel').value,
          norm: U.num(bd.querySelector('#u-norm').value),
          tank: U.num(bd.querySelector('#u-tank').value),
          note: bd.querySelector('#u-note').value.trim(),
          service: every > 0 ? {
            every: every,
            lastMeter: U.num(bd.querySelector('#u-svcm').value),
            lastDate: (u && u.service && u.service.lastDate) || U.today()
          } : null
        };
        if (u) { DB.updUnit(u.id, patch); U.toast('Сохранено'); App.render(); }
        else { var nu = DB.addUnit(patch); U.toast('Техника добавлена'); App.go('#/unit/' + nu.id); }
        return true;
      }
    });
  };

  /* ============ ПРИХОД ТОПЛИВА ============ */
  F.supplyForm = function () {
    var st = DB.data.settings;
    var h = '<div class="list">' +
      '<div class="field"><label>Топливо</label><select id="s-fuel">' +
      U.FUELS.map(function (x) {
        return '<option value="' + x.code + '"' + (st.fuel === x.code ? ' selected' : '') + '>' + esc(x.name) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>Литры</label><input id="s-lit" type="text" inputmode="decimal" placeholder="0" style="font-size:22px;font-weight:600"><span class="unit">л</span></div>' +
      '<div class="field"><label>Цена за литр</label><input id="s-price" type="text" inputmode="decimal" value="' +
      (DB.price(st.fuel) || '') + '"><span class="unit">' + esc(U.sym()) + '</span></div>' +
      '<div class="field"><label>Сумма</label><input id="s-cost" type="text" inputmode="decimal" placeholder="0"><span class="unit">' + esc(U.sym()) + '</span></div>' +
      '<div class="field"><label>Дата</label><input id="s-date" type="date" value="' + U.today() + '"></div>' +
      '<div class="field"><label>Поставщик</label><input id="s-note" placeholder="не обязательно"></div>' +
      '</div><div class="card pad" id="s-prev" style="margin-top:14px"></div>';

    App.sheet({
      title: 'Приход топлива', html: h, save: 'Внести',
      onOpen: function (bd) {
        var lit = bd.querySelector('#s-lit'), pr = bd.querySelector('#s-price'), cost = bd.querySelector('#s-cost');
        function draw() {
          var l = U.num(lit.value), p = U.num(pr.value);
          if (l > 0 && p > 0) cost.value = U.int(l * p);
          var t = CALC.tank(bd.querySelector('#s-fuel').value);
          bd.querySelector('#s-prev').innerHTML = '<div style="font-size:14px;line-height:1.5;color:var(--text-2)">' +
            'Сейчас в бочке <b>' + U.liters(t.balance) + '</b>' +
            (l > 0 ? '<br>После прихода станет <b>' + U.liters(t.balance + l) + '</b>' +
              (t.perDay > 0 ? ' — примерно на ' + U.days((t.balance + l) / t.perDay) : '') : '') +
            '</div>';
        }
        draw();
        lit.addEventListener('input', draw);
        pr.addEventListener('input', draw);
        cost.addEventListener('input', function () {
          var c = U.num(cost.value), l = U.num(lit.value);
          if (l > 0) pr.value = U.int(c / l);
          draw();
        });
        bd.querySelector('#s-fuel').addEventListener('change', draw);
        setTimeout(function () { lit.focus(); }, 380);
      },
      onSave: function (bd) {
        var l = U.num(bd.querySelector('#s-lit').value);
        if (l <= 0) { U.toast('Введите литры'); return false; }
        var p = U.num(bd.querySelector('#s-price').value);
        DB.addSupply({
          date: bd.querySelector('#s-date').value || U.today(),
          fuel: bd.querySelector('#s-fuel').value,
          liters: l, price: p,
          cost: U.num(bd.querySelector('#s-cost').value) || l * p,
          note: bd.querySelector('#s-note').value.trim()
        });
        U.toast('Приход внесён: ' + U.liters(l));
        App.render();
        return true;
      }
    });
  };

  /* ============ ЗАМЕР ОСТАТКА ============ */
  F.checkForm = function () {
    var st = DB.data.settings;
    var fuels = CALC.tankFuels();
    var fuel = fuels.length ? fuels[0] : st.fuel;

    var h = '<div class="hint" style="padding:0 4px 14px">Замерьте остаток в бочке щупом или счётчиком и впишите фактическое число. Приложение сравнит его с учётом и покажет недостачу.</div>' +
      '<div class="list">' +
      '<div class="field"><label>Топливо</label><select id="k-fuel">' +
      U.FUELS.map(function (x) {
        return '<option value="' + x.code + '"' + (fuel === x.code ? ' selected' : '') + '>' + esc(x.name) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>По факту</label><input id="k-lit" type="text" inputmode="decimal" placeholder="0" style="font-size:22px;font-weight:600"><span class="unit">л</span></div>' +
      '<div class="field"><label>Дата</label><input id="k-date" type="date" value="' + U.today() + '"></div>' +
      '<div class="field col"><label>Заметка</label><textarea id="k-note" style="min-height:44px" placeholder="кто замерял, чем…"></textarea></div>' +
      '</div><div class="card pad" id="k-prev" style="margin-top:14px"></div>';

    App.sheet({
      title: 'Замер остатка', html: h, save: 'Записать',
      onOpen: function (bd) {
        var lit = bd.querySelector('#k-lit');
        function draw() {
          var t = CALC.tank(bd.querySelector('#k-fuel').value);
          var l = U.num(lit.value), d = l - t.balance;
          var txt = 'По учёту в бочке должно быть <b>' + U.liters(t.balance) + '</b>';
          if (lit.value.trim() !== '') {
            txt += Math.abs(d) < 0.5
              ? '<br>Сходится — расхождения нет.'
              : (d < 0
                ? '<br><b style="color:var(--red)">Недостача ' + U.liters(-d) + '</b> ≈ ' +
                  U.money(-d * DB.price(bd.querySelector('#k-fuel').value))
                : '<br><b style="color:var(--accent)">Излишек ' + U.liters(d) + '</b> — возможно, забыли внести приход');
          }
          bd.querySelector('#k-prev').innerHTML = '<div style="font-size:14px;line-height:1.5;color:var(--text-2)">' + txt + '</div>';
        }
        draw();
        lit.addEventListener('input', draw);
        bd.querySelector('#k-fuel').addEventListener('change', draw);
        setTimeout(function () { lit.focus(); }, 380);
      },
      onSave: function (bd) {
        var v = bd.querySelector('#k-lit').value.trim();
        if (v === '') { U.toast('Впишите фактический остаток'); return false; }
        DB.addCheck({
          date: bd.querySelector('#k-date').value || U.today(),
          fuel: bd.querySelector('#k-fuel').value,
          liters: U.num(v),
          note: bd.querySelector('#k-note').value.trim()
        });
        U.toast('Замер записан — дальше учёт считается от него');
        App.render();
        return true;
      }
    });
  };

  /* ============ ОТЧЁТ ЗА МЕСЯЦ ============ */
  F.reportSheet = function (key) {
    var text = CALC.report(key);
    var h = '<div class="hint" style="padding:0 4px 12px">Короткая сводка за месяц — можно отправить в мессенджер или скопировать в отчёт.</div>' +
      '<button class="btn" id="r-send">Отправить</button>' +
      '<button class="btn sec" style="margin-top:8px" id="r-csv">Выгрузить CSV за всё время</button>' +
      '<div class="list" style="margin-top:12px"><div class="field col">' +
      '<textarea id="r-text" readonly style="min-height:260px;font-size:13px;line-height:1.5"></textarea></div></div>';
    App.sheet({
      title: U.monthName(key), html: h, save: null,
      onOpen: function (bd) {
        bd.querySelector('#r-text').value = text;
        bd.querySelector('#r-send').addEventListener('click', function () { App.shareText(text); });
        bd.querySelector('#r-csv').addEventListener('click', function () {
          App.saveFile('toplivo-' + U.today() + '.csv', DB.exportCSV(), 'text/csv;charset=utf-8',
            function (ok) { if (ok) U.toast('Таблица сохранена'); });
        });
      }
    });
  };

  /* ============ ЗАГРУЗКА БАЗЫ ============ */
  F.importSheet = function () {
    var h = '<div class="hint" style="padding:0 4px 14px">Выберите резервную копию <b>.json</b> или таблицу <b>.csv</b> с заправками. Можно вставить текст ниже.</div>' +
      '<div class="list">' +
      '<button class="row tap" id="pick"><span class="grow"><span class="ttl" style="color:var(--accent)">Выбрать файл</span>' +
      '<span class="sub">.json или .csv</span></span></button></div>' +
      '<input type="file" id="file" accept=".json,.csv,.txt,application/json,text/csv" style="display:none">' +
      '<h2 class="sec">Или вставьте текст</h2>' +
      '<div class="list"><div class="field col"><textarea id="paste" style="min-height:130px;font-size:14px" ' +
      'placeholder="Самосвал №1;01.09.2026;180;12300;190500;ДТ;бочка;до полного;объект Восток"></textarea></div></div>' +
      '<div class="hint">Столбцы CSV: <b>Техника;Дата;Литры;Цена;Счётчик;Топливо;Источник;До полного;Заметка</b>. ' +
      'Разделитель — точка с запятой, строка заголовков не обязательна. Техника создаётся автоматически, если её ещё нет.</div>' +
      '<h2 class="sec">Как загружать</h2>' +
      '<div class="seg" id="mode"><button data-m="merge" class="on">Добавить к текущим</button>' +
      '<button data-m="replace">Заменить всё</button></div>';

    App.sheet({
      title: 'Загрузка базы', html: h, save: 'Загрузить',
      onOpen: function (bd) {
        bd.querySelector('#pick').addEventListener('click', function () { bd.querySelector('#file').click(); });
        bd.querySelector('#file').addEventListener('change', function (e) {
          var file = e.target.files[0];
          if (!file) return;
          var fr = new FileReader();
          fr.onload = function () { bd.querySelector('#paste').value = fr.result; U.toast('Файл прочитан: ' + file.name); };
          fr.readAsText(file);
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
              U.toast('Загружено: ' + U.unitsWord(res.units) + ', заправок ' + res.fills);
            } else {
              if (mode === 'replace') { DB.data = DB.empty(); DB.save(); }
              var n = DB.importCSV(text);
              U.toast(n ? 'Добавлено заправок: ' + n : 'Ни одной строки не распознано');
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
            text: 'Техника, заправки и приход топлива будут стёрты и заменены загружаемыми.',
            ok: 'Заменить', danger: true, onOk: run
          });
        } else run();
        return false;
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
      '<div class="hint">Код закрывает вход от чужих глаз, но не шифрует базу. Не отменяет резервную копию.</div>';
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
