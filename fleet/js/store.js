/* Хранилище: всё лежит на телефоне (localStorage), ничего не уходит в сеть */
(function (w) {
  'use strict';

  var KEY = 'fleet.db.v1';
  var BAK = 'fleet.autobackup';

  var DB = {
    data: null,
    listeners: [],

    /* виды топлива и типы техники — справочники */
    FUELS: ['ДТ', 'АИ-80', 'АИ-92', 'АИ-95', 'газ'],
    KINDS: [
      { k: 'excavator', n: 'Экскаватор', ic: '🚜', meter: 'hours' },
      { k: 'loader', n: 'Погрузчик', ic: '🚜', meter: 'hours' },
      { k: 'dozer', n: 'Бульдозер', ic: '🚜', meter: 'hours' },
      { k: 'crane', n: 'Кран', ic: '🏗️', meter: 'km' },
      { k: 'truck', n: 'Самосвал', ic: '🚛', meter: 'km' },
      { k: 'car', n: 'Легковая', ic: '🚙', meter: 'km' },
      { k: 'genset', n: 'Генератор', ic: '⚡', meter: 'hours' },
      { k: 'other', n: 'Другое', ic: '🔧', meter: 'hours' }
    ],
    kind: function (k) {
      var f = this.KINDS.filter(function (x) { return x.k === k; })[0];
      return f || this.KINDS[this.KINDS.length - 1];
    },

    empty: function () {
      return {
        version: 2,
        createdAt: U.today(),
        isDemo: false,
        settings: {
          currency: 'сум',
          theme: 'auto',
          fuel: 'ДТ',              // вид топлива по умолчанию
          price: 0,                // последняя цена за литр — подставляется в форму
          tankName: 'Топливозаправщик',
          tankVolume: 0,           // объём ёмкости склада, л (0 — не задан)
          serviceWarnPct: 10,      // предупреждать, когда до ТО осталось меньше этой доли
          pin: null,
          lastExport: null
        },
        units: [],      // техника
        drivers: [],    // водители и машинисты
        shifts: [],     // смены (путевые листы)
        fuel: [],       // журнал топлива: приход, выдача, замеры
        services: []    // ТО и ремонты
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
      d.isDemo = !!d.isDemo;
      ['units', 'drivers', 'shifts', 'fuel', 'services'].forEach(function (k) {
        d[k] = Array.isArray(d[k]) ? d[k] : [];
      });
      d.units.forEach(function (u) { DB.normUnit(u); });
      d.services.forEach(function (s) {
        if (s.kind === 'to' && !s.programId) s.programId = 'to';
      });
      d.fuel.forEach(function (f) {
        if (!f.type) f.type = 'fill';
        f.liters = U.num(f.liters);
        if (f.sum == null) f.sum = U.num(f.liters) * U.num(f.price);
      });
      d.version = 2;
      return d;
    },

    /* Приводим единицу техники в порядок: числа числами, регламент списком.
       Поле «ТО каждые N» в форме — это первая работа регламента с id 'to',
       поэтому держим их синхронными в обе стороны.                        */
    normUnit: function (u) {
      if (!u) return u;
      if (!u.meter) u.meter = 'hours';
      if (u.active == null) u.active = true;
      u.norm = U.num(u.norm);
      u.tank = U.num(u.tank);
      if (!Array.isArray(u.programs)) u.programs = [];
      u.programs.forEach(function (pr) {
        pr.id = pr.id || U.uid();
        pr.everyWork = U.num(pr.everyWork);
        pr.everyDays = U.num(pr.everyDays);
      });
      var every = U.num(u.serviceEvery);
      var to = u.programs.filter(function (p) { return p.id === 'to'; })[0];
      if (every > 0) {
        if (to) to.everyWork = every;
        else u.programs.unshift({ id: 'to', name: 'ТО по регламенту', everyWork: every, everyDays: 0 });
      } else if (to && !to.everyDays) {
        u.programs = u.programs.filter(function (p) { return p.id !== 'to'; });
      }
      return u;
    },

    /* ---------- регламенты обслуживания ---------- */
    programs: function (u) { return (u && u.programs) || []; },
    program: function (u, id) {
      return this.programs(u).filter(function (p) { return p.id === id; })[0] || null;
    },
    addProgram: function (unitId, pr) {
      var u = this.unit(unitId);
      if (!u) return null;
      if (!Array.isArray(u.programs)) u.programs = [];
      pr.id = pr.id || U.uid();
      pr.everyWork = U.num(pr.everyWork);
      pr.everyDays = U.num(pr.everyDays);
      u.programs.push(pr);
      this.syncEvery(u);
      this.save();
      return pr;
    },
    updProgram: function (unitId, id, patch) {
      var pr = this.program(this.unit(unitId), id);
      if (pr) {
        Object.assign(pr, patch);
        pr.everyWork = U.num(pr.everyWork);
        pr.everyDays = U.num(pr.everyDays);
        this.syncEvery(this.unit(unitId));
        this.save();
      }
      return pr;
    },
    delProgram: function (unitId, id) {
      var u = this.unit(unitId);
      if (!u) return;
      u.programs = this.programs(u).filter(function (p) { return p.id !== id; });
      this.data.services.forEach(function (s) { if (s.programId === id) s.programId = null; });
      this.syncEvery(u);
      this.save();
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
    units: function () { return this.data.units; },
    unit: function (id) { return this.data.units.filter(function (u) { return u.id === id; })[0] || null; },
    unitByName: function (name) {
      var n = String(name || '').trim().toLowerCase();
      return this.data.units.filter(function (u) {
        return u.name.trim().toLowerCase() === n || String(u.plate || '').trim().toLowerCase() === n;
      })[0] || null;
    },
    addUnit: function (u) {
      u.id = u.id || U.uid();
      u.createdAt = u.createdAt || U.today();
      this.normUnit(u);
      this.data.units.push(u);
      this.save();
      return u;
    },
    updUnit: function (id, patch) {
      var u = this.unit(id);
      if (u) { Object.assign(u, patch); this.normUnit(u); this.save(); }
      return u;
    },
    delUnit: function (id) {
      this.data.units = this.data.units.filter(function (u) { return u.id !== id; });
      this.data.shifts = this.data.shifts.filter(function (s) { return s.unitId !== id; });
      this.data.fuel = this.data.fuel.filter(function (f) { return f.unitId !== id; });
      this.data.services = this.data.services.filter(function (s) { return s.unitId !== id; });
      this.save();
    },

    syncEvery: function (u) {
      if (!u) return;
      var to = this.programs(u).filter(function (p) { return p.id === 'to'; })[0];
      u.serviceEvery = to ? U.num(to.everyWork) : 0;
    },

    /* ---------- водители ---------- */
    drivers: function () { return this.data.drivers; },
    driver: function (id) { return this.data.drivers.filter(function (d) { return d.id === id; })[0] || null; },
    driverName: function (id) { var d = this.driver(id); return d ? d.name : ''; },
    driverByName: function (name) {
      var n = String(name || '').trim().toLowerCase();
      return this.data.drivers.filter(function (d) { return d.name.trim().toLowerCase() === n; })[0] || null;
    },
    addDriver: function (d) {
      d.id = d.id || U.uid();
      d.createdAt = d.createdAt || U.today();
      this.data.drivers.push(d);
      this.save();
      return d;
    },
    updDriver: function (id, patch) {
      var d = this.driver(id);
      if (d) { Object.assign(d, patch); this.save(); }
      return d;
    },
    delDriver: function (id) {
      this.data.drivers = this.data.drivers.filter(function (d) { return d.id !== id; });
      this.data.shifts.forEach(function (s) { if (s.driverId === id) s.driverId = null; });
      this.data.fuel.forEach(function (f) { if (f.driverId === id) f.driverId = null; });
      this.save();
    },

    /* ---------- смены ---------- */
    shifts: function () { return this.data.shifts; },
    shift: function (id) { return this.data.shifts.filter(function (s) { return s.id === id; })[0] || null; },
    addShift: function (s) {
      s.id = s.id || U.uid();
      s.date = s.date || U.today();
      this.data.shifts.push(s);
      this.sortAll();
      this.save();
      return s;
    },
    updShift: function (id, patch) {
      var s = this.shift(id);
      if (s) { Object.assign(s, patch); this.sortAll(); this.save(); }
      return s;
    },
    delShift: function (id) {
      this.data.shifts = this.data.shifts.filter(function (s) { return s.id !== id; });
      this.save();
    },

    /* ---------- топливо ---------- */
    fuelOps: function () { return this.data.fuel; },
    fuelOp: function (id) { return this.data.fuel.filter(function (f) { return f.id === id; })[0] || null; },
    addFuel: function (f) {
      f.id = f.id || U.uid();
      f.date = f.date || U.today();
      f.type = f.type || 'fill';
      f.liters = U.num(f.liters);
      f.sum = f.sum != null ? U.num(f.sum) : U.num(f.liters) * U.num(f.price);
      this.data.fuel.push(f);
      this.sortAll();
      if (f.type === 'fill' && U.num(f.price) > 0) this.data.settings.price = U.num(f.price);
      this.save();
      return f;
    },
    updFuel: function (id, patch) {
      var f = this.fuelOp(id);
      if (f) {
        Object.assign(f, patch);
        f.sum = patch.sum != null ? U.num(patch.sum) : U.num(f.liters) * U.num(f.price);
        this.sortAll();
        this.save();
      }
      return f;
    },
    delFuel: function (id) {
      this.data.fuel = this.data.fuel.filter(function (f) { return f.id !== id; });
      this.save();
    },

    /* ---------- ТО и ремонты ---------- */
    services: function () { return this.data.services; },
    service: function (id) { return this.data.services.filter(function (s) { return s.id === id; })[0] || null; },
    addService: function (s) {
      s.id = s.id || U.uid();
      s.date = s.date || U.today();
      s.kind = s.kind || 'to';
      this.data.services.push(s);
      this.sortAll();
      this.save();
      return s;
    },
    updService: function (id, patch) {
      var s = this.service(id);
      if (s) { Object.assign(s, patch); this.sortAll(); this.save(); }
      return s;
    },
    delService: function (id) {
      this.data.services = this.data.services.filter(function (s) { return s.id !== id; });
      this.save();
    },

    /* журналы держим отсортированными по дате — на них опираются расчёты */
    sortAll: function () {
      var by = function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return (a.id || '') < (b.id || '') ? -1 : 1;
      };
      this.data.shifts.sort(by);
      this.data.fuel.sort(by);
      this.data.services.sort(by);
    },

    /* объекты, которые уже встречались — для подсказок в форме */
    sites: function () {
      var seen = {}, out = [];
      this.data.shifts.forEach(function (s) {
        var v = String(s.site || '').trim();
        if (v && !seen[v.toLowerCase()]) { seen[v.toLowerCase()] = 1; out.push(v); }
      });
      return out.sort(function (a, b) { return a.localeCompare(b, 'ru'); });
    },

    /* ---------- экспорт / импорт ---------- */
    exportJSON: function () { return JSON.stringify(this.data, null, 2); },

    importJSON: function (text, mode) {
      var d = JSON.parse(text);
      if (!d || !Array.isArray(d.units)) throw new Error('Не похоже на резервную копию «Автопарка»');
      d = this.migrate(d);
      if (mode === 'replace') {
        this.data = d;
      } else {
        var self = this, umap = {}, dmap = {};
        d.drivers.forEach(function (dr) {
          var ex = self.driverByName(dr.name);
          if (ex) { dmap[dr.id] = ex.id; return; }
          var nid = U.uid();
          dmap[dr.id] = nid;
          self.data.drivers.push(Object.assign({}, dr, { id: nid }));
        });
        d.units.forEach(function (u) {
          var ex = self.unitByName(u.plate || u.name) || self.unitByName(u.name);
          if (ex) { umap[u.id] = ex.id; return; }
          var nid = U.uid();
          umap[u.id] = nid;
          self.data.units.push(Object.assign({}, u, { id: nid, driverId: dmap[u.driverId] || null }));
        });
        var have = {};
        var key = function (x, extra) { return x.date + '|' + (umap[x.unitId] || x.unitId) + '|' + extra; };
        this.data.shifts.forEach(function (s) { have['s' + key(s, s.work || (s.end - s.start))] = 1; });
        this.data.fuel.forEach(function (f) { have['f' + key(f, f.type + f.liters)] = 1; });
        this.data.services.forEach(function (s) { have['t' + key(s, s.kind + s.meter)] = 1; });

        d.shifts.forEach(function (s) {
          if (have['s' + key(s, s.work || (s.end - s.start))]) return;
          self.data.shifts.push(Object.assign({}, s, { id: U.uid(), unitId: umap[s.unitId] || s.unitId, driverId: dmap[s.driverId] || null }));
        });
        d.fuel.forEach(function (f) {
          if (have['f' + key(f, f.type + f.liters)]) return;
          self.data.fuel.push(Object.assign({}, f, { id: U.uid(), unitId: umap[f.unitId] || f.unitId, driverId: dmap[f.driverId] || null }));
        });
        d.services.forEach(function (s) {
          if (have['t' + key(s, s.kind + s.meter)]) return;
          self.data.services.push(Object.assign({}, s, { id: U.uid(), unitId: umap[s.unitId] || s.unitId }));
        });
      }
      this.sortAll();
      this.save();
      return { units: this.data.units.length, fuel: this.data.fuel.length, shifts: this.data.shifts.length };
    },

    /* ---------- выгрузка из телематики ----------
       Wialon, Omnicomm, заводские КОМТРАКС/LiveLink и прочие отдают отчёт
       «по дням»: счётчик, уровень в баке, заправки, сливы. Колонки у всех
       называются по-разному, поэтому ищем их по смыслу заголовка.        */
    TELEMETRY_COLS: [
      ['date', /дата|date|сутки|день|период/],
      ['unit', /техник|машин|объект|транспорт|unit|name|наименован|госномер|номер/],
      ['meter', /моточас|мото.?час|пробег|наработ|счётчик|счетчик|odometer|mileage|hours|engine/],
      ['level', /уровень|остаток|конец.*бак|бак.*конец|level|fuel.?end/],
      ['fill', /заправ|залито|fill|refuel/],
      ['drain', /слив|слито|утечк|хищен|drain|theft/]
    ],

    /* какая колонка за что отвечает — по заголовку таблицы */
    telemetryMap: function (head) {
      var map = {};
      this.TELEMETRY_COLS.forEach(function (pair) {
        head.forEach(function (h, i) {
          if (map[pair[0]] != null) return;
          if (pair[1].test(String(h).toLowerCase())) map[pair[0]] = i;
        });
      });
      return map;
    },

    /* rows — уже разобранные строки, map — результат telemetryMap */
    importTelemetry: function (rows, map, opt) {
      opt = opt || {};
      var self = this;
      var res = { kind: 'telemetry', units: 0, shifts: 0, fills: 0, checks: 0, drains: 0, skipped: 0 };
      if (map.date == null || map.unit == null) throw new Error('Не нашёл колонки «Дата» и «Техника»');

      /* сначала по технике и датам, иначе наработка посчитается задом наперёд */
      var parsed = [];
      rows.forEach(function (c) {
        var date = self.parseDate(c[map.date]);
        var name = String(c[map.unit] || '').trim();
        if (!date || !name) { res.skipped++; return; }
        parsed.push({ date: date, name: name, row: c });
      });
      parsed.sort(function (a, b) {
        if (a.name !== b.name) return a.name < b.name ? -1 : 1;
        return a.date < b.date ? -1 : 1;
      });

      /* что уже есть — чтобы повторная загрузка того же файла не плодила дубли */
      var have = {};
      this.data.shifts.forEach(function (x) { have['s' + x.unitId + x.date] = 1; });
      this.data.fuel.forEach(function (x) { have[x.type[0] + x.unitId + x.date] = 1; });

      var prevMeter = {};
      parsed.forEach(function (p) {
        var c = p.row;
        var u = self.unitByName(p.name);
        if (!u) {
          u = self.addUnit({
            name: p.name, meter: opt.meter || 'hours', norm: 0, kind: 'other',
            fuel: self.data.settings.fuel, meterStart: map.meter != null ? U.num(c[map.meter]) : 0
          });
          res.units++;
        }
        var num = function (i) { return i != null && c[i] != null && c[i] !== '' ? U.num(c[i]) : null; };

        /* наработка — разница показаний счётчика между строками */
        var meter = num(map.meter);
        if (meter != null) {
          var prev = prevMeter[u.id];
          if (prev == null) prev = U.num(u.meterStart) || meter;
          var work = meter - prev;
          if (work > 0 && !have['s' + u.id + p.date]) {
            self.data.shifts.push({
              id: U.uid(), unitId: u.id, driverId: u.driverId || null, date: p.date,
              start: prev, end: meter, site: '', note: 'из телематики', src: 'telemetry'
            });
            have['s' + u.id + p.date] = 1;
            res.shifts++;
          }
          prevMeter[u.id] = meter;
        }

        var lit = num(map.fill);
        if (lit && lit > 0 && !have['f' + u.id + p.date]) {
          self.data.fuel.push({
            id: U.uid(), type: 'fill', unitId: u.id, driverId: u.driverId || null, date: p.date,
            liters: lit, price: U.num(self.data.settings.price),
            sum: lit * U.num(self.data.settings.price),
            source: opt.source === 'azs' ? 'azs' : 'tank',
            meter: meter, fuel: u.fuel || self.data.settings.fuel,
            note: 'из телематики', src: 'telemetry'
          });
          have['f' + u.id + p.date] = 1;
          res.fills++;
        }

        var dr = num(map.drain);
        if (dr && dr > 0 && !have['d' + u.id + p.date]) {
          self.data.fuel.push({
            id: U.uid(), type: 'drain', unitId: u.id, date: p.date,
            liters: dr, price: 0, sum: 0, note: 'слив по датчику', src: 'telemetry'
          });
          have['d' + u.id + p.date] = 1;
          res.drains++;
        }

        /* уровень в баке — это тот же замер, только его снял датчик, а не человек */
        var lvl = num(map.level);
        if (lvl != null && !have['c' + u.id + p.date]) {
          self.data.fuel.push({
            id: U.uid(), type: 'check', unitId: u.id, date: p.date,
            liters: lvl, price: 0, sum: 0, meter: meter,
            note: 'уровень по датчику', src: 'telemetry'
          });
          have['c' + u.id + p.date] = 1;
          res.checks++;
        }
      });

      this.sortAll();
      this.save();
      return res;
    },

    /* CSV: две таблицы, различаются по заголовку.
       Техника:  Название;Госномер;Тип;Счётчик;Норма;Бак;Топливо;ТО через
       Заправки: Дата;Техника;Водитель;Литры;Цена;Счётчик;Заметка          */
    importCSV: function (text, opt) {
      var lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter(function (s) { return s.trim(); });
      if (!lines.length) throw new Error('Пустой файл');
      var sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
      var head = lines[0].toLowerCase();
      var cut = function (line) {
        return line.split(sep).map(function (s) { return s.trim().replace(/^"|"$/g, ''); });
      };

      /* выгрузка из телематики: там есть уровень в баке, слив или счётчик по дням */
      if (/уровень|остаток|слив|моточас|пробег|наработ/.test(head) && !/норма/.test(head)) {
        var map = this.telemetryMap(cut(lines[0]));
        if (map.date != null && map.unit != null && (map.meter != null || map.level != null)) {
          return this.importTelemetry(lines.slice(1).map(cut), map, opt);
        }
      }

      var isFuel = /литр|дата|заправ/.test(head) && !/норма/.test(head);
      var start = /назван|госномер|дата|литр|техник/.test(head) ? 1 : 0;
      var self = this, added = 0;

      for (var i = start; i < lines.length; i++) {
        var c = cut(lines[i]);
        if (!c[0]) continue;

        if (isFuel) {
          /* Дата;Техника;Водитель;Литров;Цена;Счётчик;Заметка */
          var date = self.parseDate(c[0]);
          if (!date) continue;
          var un = self.unitByName(c[1]);
          if (!un) {
            if (!c[1]) continue;
            un = self.addUnit({ name: c[1], meter: 'hours', norm: 0, kind: 'other', fuel: self.data.settings.fuel });
          }
          var dr = null;
          if (c[2]) dr = self.driverByName(c[2]) || self.addDriver({ name: c[2], phone: '' });
          var lit = U.num(c[3]);
          if (!lit) continue;
          self.addFuel({
            type: 'fill', date: date, unitId: un.id, driverId: dr ? dr.id : null,
            liters: lit, price: U.num(c[4]), meter: c[5] ? U.num(c[5]) : null,
            source: 'azs', fuel: un.fuel || self.data.settings.fuel, note: c[6] || ''
          });
          added++;
        } else {
          /* Название;Госномер;Тип;Счётчик;Норма;Бак;Топливо;ТО через */
          if (self.unitByName(c[0])) continue;
          var meter = /км|km|пробег/i.test(c[3] || '') ? 'km' : 'hours';
          var kind = self.KINDS.filter(function (k) {
            return c[2] && k.n.toLowerCase().indexOf(String(c[2]).toLowerCase().slice(0, 5)) === 0;
          })[0];
          self.addUnit({
            name: c[0], plate: c[1] || '', kind: kind ? kind.k : 'other',
            meter: meter, norm: U.num(c[4]), tank: U.num(c[5]),
            fuel: c[6] || self.data.settings.fuel,
            serviceEvery: U.num(c[7]), meterStart: 0
          });
          added++;
        }
      }
      return { added: added, kind: isFuel ? 'fuel' : 'units' };
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

    csvRows: function (rows) {
      return '﻿' + rows.map(function (r) {
        return r.map(function (x) { return '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"'; }).join(';');
      }).join('\n');
    },

    /* журнал топлива одной таблицей */
    exportCSV: function () {
      var self = this;
      var TYPE = { fill: 'заправка', intake: 'приход на склад', check: 'замер бака',
        tankcheck: 'замер склада', drain: 'слив' };
      var rows = [['Дата', 'Операция', 'Техника', 'Госномер', 'Водитель', 'Литров', 'Цена за литр', 'Сумма', 'Откуда', 'Счётчик', 'Топливо', 'Заметка']];
      this.data.fuel.forEach(function (f) {
        var u = self.unit(f.unitId);
        rows.push([
          f.date, TYPE[f.type] || f.type, u ? u.name : '', u ? u.plate || '' : '',
          self.driverName(f.driverId), U.dec(f.liters, 1), f.price || '', Math.round(U.num(f.sum)),
          f.type === 'fill' ? (f.source === 'tank' ? self.data.settings.tankName : 'АЗС') : '',
          f.meter != null ? f.meter : '', f.fuel || '', f.note || ''
        ]);
      });
      return this.csvRows(rows);
    },

    /* смены отдельной таблицей */
    exportShiftsCSV: function () {
      var self = this;
      var rows = [['Дата', 'Техника', 'Госномер', 'Водитель', 'Объект', 'Начало', 'Конец', 'Наработка', 'Единица', 'Норма расхода, л', 'Заметка']];
      this.data.shifts.forEach(function (s) {
        var u = self.unit(s.unitId) || { name: '', plate: '', meter: 'hours', norm: 0 };
        var wk = CALC.shiftWork(s);
        rows.push([
          s.date, u.name, u.plate || '', self.driverName(s.driverId), s.site || '',
          s.start != null ? s.start : '', s.end != null ? s.end : '',
          U.dec(wk, 1), U.meterInfo(u.meter).unit, U.dec(CALC.normFor(u, wk), 1), s.note || ''
        ]);
      });
      return this.csvRows(rows);
    },

    /* сводка по технике за период */
    exportReportCSV: function (from, to) {
      var self = this;
      var rows = [['Техника', 'Госномер', 'Наработка', 'Единица', 'Норма расхода, л', 'Залито, л',
        'Отклонение по замерам, л', 'Слито, л', 'Потеряно всего, л', 'Средний расход',
        'Топливо, деньги', 'ТО и ремонты', 'Себестоимость наработки']];
      this.data.units.forEach(function (u) {
        var r = CALC.unitPeriod(u, from, to);
        rows.push([
          u.name, u.plate || '', U.dec(r.work, 1), U.meterInfo(u.meter).unit,
          U.dec(r.norm, 1), U.dec(r.filled, 1), U.dec(r.deviation, 1),
          U.dec(r.drained, 1), U.dec(r.lost, 1),
          r.actualRate != null ? U.dec(r.actualRate, 1) : '', Math.round(r.money),
          Math.round(r.serviceCost), r.costPerWork != null ? Math.round(r.costPerWork) : ''
        ]);
      });
      return this.csvRows(rows);
    },

    /* ---------- демонстрационный набор ---------- */
    demo: function () {
      var db = this.empty();
      db.isDemo = true;
      db.settings.price = 9800;
      db.settings.tankVolume = 10000;

      var t = U.today(), d = U.addDays;
      var seed = 20260101;
      var rnd = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

      db.drivers = [
        { id: 'dr1', name: 'Рустам Хайдаров', phone: '+998 90 123-45-67', note: 'Экскаваторщик, 12 лет стажа' },
        { id: 'dr2', name: 'Азиз Каримов', phone: '+998 91 222-33-44', note: '' },
        { id: 'dr3', name: 'Сергей Волков', phone: '+998 93 555-66-77', note: '' },
        { id: 'dr4', name: 'Бахтиёр Юсупов', phone: '+998 94 777-88-99', note: 'Стажёр' },
        { id: 'dr5', name: 'Дилшод Рахимов', phone: '+998 97 111-22-33', note: '' }
      ];

      db.units = [
        { id: 'u1', name: 'Экскаватор Hitachi ZX200', plate: 'EX 2201', kind: 'excavator', meter: 'hours',
          norm: 14.5, tank: 400, fuel: 'ДТ', serviceEvery: 250, driverId: 'dr1', meterStart: 4820,
          tankStart: 320, active: true, note: '', telemetry: true,
          programs: [
            { id: 'to', name: 'ТО по регламенту', everyWork: 250, everyDays: 0 },
            { id: 'p11', name: 'Замена гидромасла', everyWork: 1000, everyDays: 0 },
            { id: 'p12', name: 'Страховка', everyWork: 0, everyDays: 365 }
          ] },
        { id: 'u2', name: 'Погрузчик SDLG LG956', plate: 'LD 3310', kind: 'loader', meter: 'hours',
          norm: 11, tank: 300, fuel: 'ДТ', serviceEvery: 250, driverId: 'dr2', meterStart: 2610,
          tankStart: 230, active: true, note: '' },
        { id: 'u3', name: 'Самосвал Howo №1', plate: '01 A 123 BA', kind: 'truck', meter: 'km',
          norm: 38, tank: 400, fuel: 'ДТ', serviceEvery: 10000, driverId: 'dr3', meterStart: 184300,
          tankStart: 300, active: true, note: '',
          programs: [
            { id: 'to', name: 'ТО по регламенту', everyWork: 10000, everyDays: 0 },
            { id: 'p31', name: 'Техосмотр', everyWork: 0, everyDays: 365 }
          ] },
        { id: 'u4', name: 'Самосвал Howo №2', plate: '01 A 456 BA', kind: 'truck', meter: 'km',
          norm: 38, tank: 400, fuel: 'ДТ', serviceEvery: 10000, driverId: 'dr4', meterStart: 96150,
          tankStart: 300, active: true, note: '' },
        { id: 'u5', name: 'Бульдозер Shantui SD16', plate: 'BD 1601', kind: 'dozer', meter: 'hours',
          norm: 16, tank: 380, fuel: 'ДТ', serviceEvery: 250, driverId: 'dr5', meterStart: 7305,
          tankStart: 300, active: true, note: '' },
        { id: 'u6', name: 'Автокран XCMG 25 т', plate: '01 B 777 CA', kind: 'crane', meter: 'km',
          norm: 32, tank: 350, fuel: 'ДТ', serviceEvery: 12000, driverId: null, meterStart: 41200,
          tankStart: 250, active: true, note: 'Работает по заявкам',
          programs: [
            { id: 'to', name: 'ТО по регламенту', everyWork: 12000, everyDays: 0 },
            { id: 'p61', name: 'Освидетельствование крана', everyWork: 0, everyDays: 365 }
          ] }
      ];

      var sites = ['ЖК «Северный»', 'Карьер', 'Трасса М-39', 'База'];
      var meters = {}, tankLeft = {}, stock = 0, n = 0;
      db.units.forEach(function (u) { meters[u.id] = u.meterStart; tankLeft[u.id] = u.tankStart; });
      var id = function (p) { return p + (++n); };

      /* замеры баков делаем месяц назад и вчера — как на реальной инвентаризации */
      var checkDays = [31, 1];

      /* последние 60 дней: смены, заправки, приход топлива на склад */
      for (var day = 60; day >= 0; day--) {
        var date = d(t, -day);
        var dow = new Date(U.parse(date)).getUTCDay();

        /* приход топлива на склад раз в 10 дней */
        if (day % 10 === 3) {
          db.fuel.push({ id: id('i'), type: 'intake', date: date, liters: 5000, price: 9800,
            sum: 5000 * 9800, fuel: 'ДТ', note: 'бензовоз, накладная' });
          stock += 5000;
        }

        if (dow !== 0) {                                            // воскресенье — выходной
          db.units.forEach(function (u) {
            if (u.id === 'u6' && day % 3 !== 0) return;              // кран работает по заявкам
            var work = u.meter === 'km'
              ? Math.round(120 + rnd() * 110)                        // 120–230 км
              : Math.round((6 + rnd() * 3.5) * 10) / 10;             // 6–9,5 моточаса

            meters[u.id] += work;
            db.shifts.push({
              id: id('s'), date: date, unitId: u.id, driverId: u.driverId,
              start: Math.round((meters[u.id] - work) * 10) / 10,
              end: Math.round(meters[u.id] * 10) / 10,
              site: sites[Math.floor(rnd() * sites.length)], note: ''
            });

            /* реальный расход слегка гуляет вокруг нормы; там, где стоит
               датчик, разброс меньше — меряет прибор, а не линейка */
            var spread = u.telemetry ? 0.015 : 0.04;
            var spent = (u.meter === 'km' ? work / 100 * u.norm : work * u.norm) *
              (1 - spread + rnd() * spread * 2);
            /* самосвал №1 — с него сливают: расход стабильно выше нормы */
            if (u.id === 'u3') spent *= 1.22;
            tankLeft[u.id] -= spent;

            /* заправляем, когда в баке остаётся меньше трети */
            if (tankLeft[u.id] < u.tank * 0.34) {
              var lit = Math.round((u.tank * 0.9 - tankLeft[u.id]) / 10) * 10;
              var fromTank = !(u.meter === 'km' && rnd() < 0.4);     // самосвалы иногда заправляют на АЗС
              tankLeft[u.id] += lit;
              if (fromTank) stock -= lit;
              db.fuel.push({
                id: id('f'), type: 'fill', date: date, unitId: u.id, driverId: u.driverId,
                liters: lit, price: 9800, sum: lit * 9800,
                source: fromTank ? 'tank' : 'azs',
                meter: Math.round(meters[u.id] * 10) / 10, fuel: 'ДТ', note: ''
              });
            }
          });
        }

        /* на технике с датчиком уровень приезжает каждый день сам */
        if (dow !== 0 && day <= 30) {
          db.units.forEach(function (u) {
            if (!u.telemetry) return;
            db.fuel.push({
              id: id('t'), type: 'check', unitId: u.id, date: date,
              liters: Math.max(0, Math.round(tankLeft[u.id])),
              meter: Math.round(meters[u.id] * 10) / 10, fuel: 'ДТ',
              src: 'telemetry', note: 'уровень по датчику'
            });
          });
        }

        /* пойманный слив: топливо ушло мимо работы, и это зафиксировано */
        if (day === 3) {
          tankLeft.u2 -= 120;
          db.fuel.push({
            id: id('dr'), type: 'drain', unitId: 'u2', date: date, liters: 120,
            price: 0, sum: 0, note: 'слив зафиксирован на стоянке, составлен акт'
          });
        }

        /* инвентаризация: замеряем баки техники и остаток в ёмкости */
        if (checkDays.indexOf(day) >= 0) {
          db.units.forEach(function (u) {
            db.fuel.push({
              id: id('c'), type: 'check', date: date, unitId: u.id,
              liters: Math.max(0, Math.round(tankLeft[u.id])),
              meter: Math.round(meters[u.id] * 10) / 10, fuel: 'ДТ',
              note: u.id === 'u3' && day === 1 ? 'замер комиссией' : ''
            });
          });
          /* со склада тоже понемногу утекает */
          stock -= day === 1 ? 180 : 60;
          db.fuel.push({ id: id('tc'), type: 'tankcheck', date: date,
            liters: Math.max(0, Math.round(stock)), fuel: 'ДТ', note: 'замер в ёмкости' });
        }
      }

      /* ТО: одно свежее, одно давнее — чтобы было видно и «скоро», и «просрочено» */
      db.services = [
        { id: 'sv1', date: d(t, -34), unitId: 'u1', kind: 'to', meter: meters.u1 - 210, sum: 2400000, note: 'ТО-2, масло и фильтры' },
        { id: 'sv2', date: d(t, -18), unitId: 'u2', kind: 'to', meter: meters.u2 - 95, sum: 1750000, note: 'ТО-1' },
        { id: 'sv3', date: d(t, -50), unitId: 'u3', kind: 'to', meter: meters.u3 - 9600, sum: 3100000, note: 'ТО, замена масла' },
        { id: 'sv4', date: d(t, -12), unitId: 'u4', kind: 'to', meter: meters.u4 - 1200, sum: 2900000, note: 'ТО' },
        { id: 'sv5', date: d(t, -40), unitId: 'u5', kind: 'to', meter: meters.u5 - 265, sum: 2600000, note: 'ТО-2' },
        { id: 'sv6', date: d(t, -7), unitId: 'u5', kind: 'repair', meter: meters.u5 - 40, sum: 4200000, note: 'Ремонт гидроцилиндра отвала' },
        { id: 'sv7', date: d(t, -3), unitId: 'u3', kind: 'repair', meter: meters.u3 - 300, sum: 900000, note: 'Замена двух колёс' },
        { id: 'sv8', date: d(t, -60), unitId: 'u6', kind: 'to', meter: meters.u6 - 3200, sum: 2200000, note: 'ТО' }
      ];

      var by = function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; };
      db.shifts.sort(by); db.fuel.sort(by); db.services.sort(by);
      db.units.forEach(function (u) { DB.normUnit(u); });
      return db;
    }
  };

  w.DB = DB;
})(window);
