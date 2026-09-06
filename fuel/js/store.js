/* Хранилище: всё лежит на телефоне (localStorage), ничего не уходит в сеть */
(function (w) {
  'use strict';

  var KEY = 'toplivo.db.v1';
  var BAK = 'toplivo.autobackup';

  var DB = {
    data: null,
    listeners: [],

    empty: function () {
      return {
        version: 1,
        createdAt: U.today(),
        isDemo: false,
        settings: {
          currency: 'UZS',
          theme: 'auto',
          fuel: 'dt',             // топливо по умолчанию
          source: 'tank',         // откуда заправляют чаще
          prices: {},             // последняя цена по виду топлива
          overrun: 10,            // порог перерасхода для предупреждения, %
          lowDays: 5,             // «топливо кончается», дней
          pin: null,
          lastExport: null
        },
        units: [],                // техника
        fills: [],                // заправки
        supplies: [],             // приход топлива в бочку
        checks: []                // замеры остатка
      };
    },

    load: function () {
      var raw = null;
      try { raw = localStorage.getItem(KEY); } catch (e) { }
      if (!raw) { this.data = this.empty(); return false; }
      try {
        this.data = this.migrate(JSON.parse(raw));
        return true;
      } catch (e) {
        try {
          var b = localStorage.getItem(BAK);
          if (b) { this.data = this.migrate(JSON.parse(b)); U.toast('Данные восстановлены из копии'); return true; }
        } catch (e2) { }
        this.data = this.empty();
        return false;
      }
    },

    migrate: function (d) {
      d = d || {};
      var base = this.empty();
      d.settings = Object.assign(base.settings, d.settings || {});
      d.settings.prices = d.settings.prices || {};
      d.isDemo = !!d.isDemo;
      ['units', 'fills', 'supplies', 'checks'].forEach(function (k) {
        d[k] = Array.isArray(d[k]) ? d[k] : [];
      });
      d.units.forEach(function (u) {
        if (!u.meter) u.meter = U.kind(u.kind).meter;
        if (!u.fuel) u.fuel = d.settings.fuel;
        u.norm = U.num(u.norm);
        u.service = u.service || null;
        u.archived = !!u.archived;
      });
      d.fills.forEach(function (f) {
        f.liters = U.num(f.liters);
        f.price = U.num(f.price);
        if (!f.cost) f.cost = f.liters * f.price;
        f.full = f.full !== false;
        if (!f.source) f.source = 'tank';
      });
      d.version = 1;
      return d;
    },

    save: function () {
      try {
        var json = JSON.stringify(this.data);
        localStorage.setItem(KEY, json);
        try { localStorage.setItem(BAK, json); } catch (e) { }
        if (w.CALC) CALC.clearCache();
      } catch (e) {
        U.toast('Не удалось сохранить: нет места в памяти');
        return false;
      }
      this.listeners.forEach(function (f) { try { f(); } catch (e) { } });
      return true;
    },

    onChange: function (f) { this.listeners.push(f); },

    /* ---------- техника ---------- */
    units: function (withArchived) {
      return this.data.units.filter(function (u) { return withArchived || !u.archived; });
    },
    unit: function (id) { return this.data.units.filter(function (u) { return u.id === id; })[0] || null; },
    unitByName: function (name) {
      var n = String(name || '').trim().toLowerCase();
      return this.data.units.filter(function (u) { return u.name.trim().toLowerCase() === n; })[0] || null;
    },
    addUnit: function (u) {
      u.id = u.id || U.uid();
      u.createdAt = u.createdAt || U.today();
      if (!u.meter) u.meter = U.kind(u.kind).meter;
      this.data.units.push(u);
      this.save();
      return u;
    },
    updUnit: function (id, patch) {
      var u = this.unit(id);
      if (u) { Object.assign(u, patch); this.save(); }
      return u;
    },
    delUnit: function (id) {
      this.data.fills = this.data.fills.filter(function (f) { return f.unitId !== id; });
      this.data.units = this.data.units.filter(function (u) { return u.id !== id; });
      this.save();
    },

    /* ---------- заправки ---------- */
    fills: function () { return this.data.fills; },
    fill: function (id) { return this.data.fills.filter(function (f) { return f.id === id; })[0] || null; },
    fillsOf: function (unitId) {
      return this.data.fills.filter(function (f) { return f.unitId === unitId; }).sort(DB.byDate);
    },
    byDate: function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return U.num(a.meter) - U.num(b.meter);
    },
    addFill: function (f) {
      f.id = f.id || U.uid();
      f.date = f.date || U.today();
      f.liters = U.num(f.liters);
      f.price = U.num(f.price);
      f.cost = U.num(f.cost) || f.liters * f.price;
      f.createdAt = f.createdAt || U.today();
      this.data.fills.push(f);
      if (f.price > 0) this.data.settings.prices[f.fuel] = f.price;
      this.save();
      return f;
    },
    updFill: function (id, patch) {
      var f = this.fill(id);
      if (f) {
        Object.assign(f, patch);
        f.cost = U.num(f.cost) || U.num(f.liters) * U.num(f.price);
        this.save();
      }
      return f;
    },
    delFill: function (id) {
      this.data.fills = this.data.fills.filter(function (f) { return f.id !== id; });
      this.save();
    },
    /* последняя заправка — из неё подставляются значения в новую */
    lastFill: function (unitId) {
      var list = unitId ? this.fillsOf(unitId) : this.data.fills.slice().sort(DB.byDate);
      return list.length ? list[list.length - 1] : null;
    },
    price: function (fuel) { return U.num(this.data.settings.prices[fuel]); },

    /* ---------- приход топлива ---------- */
    addSupply: function (s) {
      s.id = s.id || U.uid();
      s.date = s.date || U.today();
      s.liters = U.num(s.liters);
      s.price = U.num(s.price);
      s.cost = U.num(s.cost) || s.liters * s.price;
      this.data.supplies.push(s);
      if (s.price > 0) this.data.settings.prices[s.fuel] = s.price;
      this.save();
      return s;
    },
    delSupply: function (id) {
      this.data.supplies = this.data.supplies.filter(function (s) { return s.id !== id; });
      this.save();
    },

    /* ---------- замеры остатка ---------- */
    addCheck: function (c) {
      c.id = c.id || U.uid();
      c.date = c.date || U.today();
      c.liters = U.num(c.liters);
      this.data.checks.push(c);
      this.save();
      return c;
    },
    delCheck: function (id) {
      this.data.checks = this.data.checks.filter(function (c) { return c.id !== id; });
      this.save();
    },

    /* ---------- экспорт / импорт ---------- */
    exportJSON: function () { return JSON.stringify(this.data, null, 2); },

    importJSON: function (text, mode) {
      var d = JSON.parse(text);
      if (!d || !Array.isArray(d.units) || !Array.isArray(d.fills)) {
        throw new Error('Не похоже на резервную копию приложения');
      }
      d = this.migrate(d);
      if (mode === 'replace') {
        this.data = d;
      } else {
        var self = this, idmap = {};
        d.units.forEach(function (u) {
          var ex = self.unitByName(u.name);
          if (ex) { idmap[u.id] = ex.id; return; }
          var nid = U.uid();
          idmap[u.id] = nid;
          self.data.units.push(Object.assign({}, u, { id: nid }));
        });
        var have = {};
        this.data.fills.forEach(function (f) { have[f.unitId + '|' + f.date + '|' + f.liters] = 1; });
        d.fills.forEach(function (f) {
          var uid = idmap[f.unitId] || f.unitId;
          if (have[uid + '|' + f.date + '|' + f.liters]) return;      // дубль
          self.data.fills.push(Object.assign({}, f, { id: U.uid(), unitId: uid }));
        });
        var haveS = {};
        this.data.supplies.forEach(function (s) { haveS[s.date + '|' + s.liters] = 1; });
        d.supplies.forEach(function (s) {
          if (haveS[s.date + '|' + s.liters]) return;
          self.data.supplies.push(Object.assign({}, s, { id: U.uid() }));
        });
      }
      this.save();
      return { units: this.data.units.length, fills: this.data.fills.length };
    },

    /* CSV: Техника;Дата;Литры;Цена;Счётчик;Топливо;Источник;Заметка */
    importCSV: function (text) {
      var lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter(function (s) { return s.trim(); });
      if (!lines.length) throw new Error('Пустой файл');
      var sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
      var head = lines[0].toLowerCase();
      var start = /техник|машин|дата|unit/.test(head) ? 1 : 0;
      var added = 0, self = this, st = this.data.settings;

      for (var i = start; i < lines.length; i++) {
        var c = lines[i].split(sep).map(function (s) { return s.trim().replace(/^"|"$/g, ''); });
        if (!c[0]) continue;
        var liters = U.num(c[2]);
        if (!liters) continue;
        var u = self.unitByName(c[0]);
        if (!u) u = self.addUnit({ name: c[0], kind: 'other', fuel: st.fuel, norm: 0, tank: 0 });
        var price = c[3] ? U.num(c[3]) : self.price(u.fuel);
        self.addFill({
          unitId: u.id,
          date: self.parseDate(c[1]) || U.today(),
          liters: liters,
          price: price,
          cost: liters * price,
          meter: U.num(c[4]),
          fuel: self.fuelCode(c[5]) || u.fuel,
          source: /азс|станц|station/i.test(c[6] || '') ? 'station' : st.source,
          full: !/част|не полн|partial/i.test(c[7] || ''),
          note: c[8] || ''
        });
        added++;
      }
      return added;
    },

    fuelCode: function (s) {
      var v = String(s || '').toLowerCase().replace(/[\s\-]/g, '');
      if (!v) return null;
      if (/дт|диз|солярк|dt|diesel/.test(v)) return 'dt';
      if (/80/.test(v)) return 'ai80';
      if (/92/.test(v)) return 'ai92';
      if (/95|98/.test(v)) return 'ai95';
      if (/газ|метан|пропан|gas|lpg/.test(v)) return 'gas';
      return null;
    },

    /* принимает 01.02.2026 / 2026-02-01 / 1.2.26 */
    parseDate: function (s) {
      s = String(s || '').trim();
      if (!s) return null;
      var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
      m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
      if (m) {
        var y = +m[3]; if (y < 100) y += 2000;
        return y + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
      }
      return null;
    },

    exportCSV: function () {
      var self = this;
      var rows = [['Дата', 'Техника', 'Госномер', 'Топливо', 'Литры', 'Цена', 'Сумма', 'Счётчик', 'Ед. счётчика',
        'Источник', 'До полного', 'Оператор', 'Расход', 'Норма', 'Отклонение %', 'Заметка']];
      this.data.fills.slice().sort(DB.byDate).forEach(function (f) {
        var u = self.unit(f.unitId) || { name: '—', plate: '', meter: 'km', norm: 0 };
        var seg = CALC.segmentOf(u, f.id);
        rows.push([
          f.date, u.name, u.plate || '', U.fuelShort(f.fuel), f.liters, f.price, Math.round(f.cost),
          f.meter || '', U.meterUnit(u.meter),
          f.source === 'station' ? 'АЗС' : 'своя бочка',
          f.full === false ? 'нет' : 'да',
          f.operator || '',
          seg && seg.rate != null ? U.dec(seg.rate, 1) : '',
          u.norm || '',
          seg && seg.rate != null && u.norm ? U.dec((seg.rate - u.norm) / u.norm * 100, 1) : '',
          f.note || ''
        ]);
      });
      rows.push([]);
      rows.push(['Приход топлива']);
      rows.push(['Дата', 'Топливо', 'Литры', 'Цена', 'Сумма', 'Поставщик']);
      this.data.supplies.slice().sort(DB.byDate).forEach(function (s) {
        rows.push([s.date, U.fuelShort(s.fuel), s.liters, s.price, Math.round(s.cost), s.note || '']);
      });
      return '﻿' + rows.map(function (r) {
        return r.map(function (x) { return '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"'; }).join(';');
      }).join('\n');
    },

    /* ---------- демонстрационный набор ----------
       Заправки генерируются по фактическому расходу, а приход топлива
       подбирается под них, чтобы остаток в бочке сходился по-настоящему. */
    demo: function () {
      var t = U.today(), d = U.addDays;
      var db = this.empty();
      db.isDemo = true;
      db.settings.currency = 'UZS';
      db.settings.prices = { dt: 12300 };

      db.units = [
        { id: 'u1', name: 'Самосвал Howo №1', kind: 'truck', plate: '01 A 123 BC', meter: 'km',
          fuel: 'dt', norm: 38, tank: 400, service: { every: 10000, lastMeter: 182400, lastDate: d(t, -70) },
          note: 'Возит щебень с карьера', createdAt: d(t, -90) },
        { id: 'u2', name: 'Самосвал Howo №2', kind: 'truck', plate: '01 A 456 DE', meter: 'km',
          fuel: 'dt', norm: 38, tank: 400, service: { every: 10000, lastMeter: 201000, lastDate: d(t, -40) },
          note: '', createdAt: d(t, -90) },
        { id: 'u3', name: 'Экскаватор Hyundai R220', kind: 'excavator', plate: '', meter: 'mh',
          fuel: 'dt', norm: 14, tank: 340, service: { every: 250, lastMeter: 4180, lastDate: d(t, -35) },
          note: '', createdAt: d(t, -90) },
        { id: 'u4', name: 'Погрузчик XCMG', kind: 'loader', plate: '', meter: 'mh',
          fuel: 'dt', norm: 9, tank: 200, service: { every: 250, lastMeter: 2600, lastDate: d(t, -20) },
          note: '', createdAt: d(t, -90) },
        { id: 'u5', name: 'Генератор 100 кВт', kind: 'gen', plate: '', meter: 'mh',
          fuel: 'dt', norm: 18, tank: 250, service: { every: 500, lastMeter: 900, lastDate: d(t, -60) },
          note: 'Ночная смена на объекте', createdAt: d(t, -90) }
      ];

      var seed = 20260906;
      function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
      function priceAt(date) {
        var ago = -U.diffDays(t, date);
        return ago > 44 ? 11800 : ago > 14 ? 12000 : 12300;
      }

      /* real — фактический расход: у второго самосвала он заметно выше нормы */
      var plan = [
        { u: db.units[0], start: 190200, perDay: 210, real: 39.5, every: 3, svc: 0.68 },
        { u: db.units[1], start: 205600, perDay: 195, real: 46.5, every: 3, svc: 0.88 },
        { u: db.units[2], start: 4290, perDay: 7.5, real: 14.4, every: 2, svc: 1.16 },
        { u: db.units[3], start: 2680, perDay: 5.5, real: 8.8, every: 3, svc: 0.64 },
        { u: db.units[4], start: 1010, perDay: 5, real: 18.6, every: 2, svc: 0.32 }
      ];
      var fills = [], n = 0;
      plan.forEach(function (p) {
        var base = U.rateBase(p.u.meter), meter = p.start;
        for (var day = -60; day <= 0; day += p.every) {
          var date = d(t, day);
          var run = day === -60 ? 0 : p.perDay * p.every * (0.82 + 0.36 * rnd());
          meter += run;
          var liters = Math.round((day === -60 ? p.u.tank * 0.7 : p.real * run / base * (0.94 + 0.12 * rnd())) * 10) / 10;
          var price = priceAt(date);
          fills.push({
            id: 'f' + (++n), unitId: p.u.id, date: date, liters: liters,
            price: price, cost: Math.round(liters * price), meter: Math.round(meter),
            fuel: 'dt', source: rnd() > 0.82 ? 'station' : 'tank', full: true,
            operator: '', note: '', createdAt: date
          });
        }
      });

      /* одна заправка больше объёма бака — приложение это подсветит */
      var f2 = fills.filter(function (f) { return f.unitId === 'u2'; });
      var bad = f2[f2.length - 2];
      bad.liters = 430; bad.cost = Math.round(430 * bad.price); bad.note = 'записано со слов водителя';

      /* последнее ТО отсчитываем от фактического счётчика: у экскаватора просрочено,
         у второго самосвала подходит, у остальных ещё есть запас */
      plan.forEach(function (p) {
        var meterNow = 0;
        fills.forEach(function (f) { if (f.unitId === p.u.id) meterNow = Math.max(meterNow, f.meter); });
        var every = p.u.service.every;
        p.u.service.lastMeter = Math.round(meterNow - every * p.svc);
      });

      fills.sort(DB.byDate);
      db.fills = fills;

      /* приход: три ровные поставки, четвёртая подобрана под фактический расход,
         чтобы сейчас в бочке оставалось примерно на четыре дня работы */
      function tankUsed(untilDate) {
        var s = 0;
        fills.forEach(function (f) {
          if (f.source !== 'tank') return;
          if (untilDate && U.diffDays(f.date, untilDate) < 0) return;
          s += f.liters;
        });
        return s;
      }
      var usedAll = tankUsed(null);
      var last = Math.max(1000, Math.round((usedAll + 1600 - 18000) / 100) * 100);
      db.supplies = [
        { id: 's1', date: d(t, -58), fuel: 'dt', liters: 6000, price: 11800, cost: 6000 * 11800, note: 'Нефтебаза, бензовоз' },
        { id: 's2', date: d(t, -44), fuel: 'dt', liters: 6000, price: 11800, cost: 6000 * 11800, note: 'Нефтебаза, бензовоз' },
        { id: 's3', date: d(t, -30), fuel: 'dt', liters: 6000, price: 12000, cost: 6000 * 12000, note: 'Нефтебаза, бензовоз' },
        { id: 's4', date: d(t, -14), fuel: 'dt', liters: last, price: 12000, cost: last * 12000, note: 'Нефтебаза, бензовоз' }
      ];

      /* замер на день третьей поставки: по учёту вышло на 60 л больше, чем в бочке */
      var at = d(t, -30);
      db.checks = [{ id: 'c1', date: at, fuel: 'dt',
        liters: Math.round(18000 - tankUsed(at) - 60), note: 'Плановая сверка щупом' }];

      return db;
    }
  };

  w.DB = DB;
})(window);
