/* Хранилище: всё лежит на телефоне (localStorage), ничего не уходит в сеть */
(function (w) {
  'use strict';

  var KEY = 'kapital.db.v1';
  var BAK = 'kapital.autobackup';

  var DB = {
    data: null,
    listeners: [],

    empty: function () {
      return {
        version: 1,
        createdAt: U.today(),
        settings: {
          currency: '₽',
          theme: 'auto',
          defaultRate: 10,
          defaultPeriod: 'month',
          defaultTerm: 30,
          penaltyRate: 0,
          pin: null,
          lastExport: null
        },
        clients: [],
        loans: []
      };
    },

    load: function () {
      var raw = null;
      try { raw = localStorage.getItem(KEY); } catch (e) { }
      if (!raw) { this.data = this.empty(); return false; }
      try {
        var d = JSON.parse(raw);
        this.data = this.migrate(d);
        return true;
      } catch (e) {
        // повреждённые данные не затираем — пробуем автобэкап
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
      d.version = 1;
      d.settings = Object.assign(base.settings, d.settings || {});
      d.clients = Array.isArray(d.clients) ? d.clients : [];
      d.loans = Array.isArray(d.loans) ? d.loans : [];
      d.loans.forEach(function (l) {
        l.payments = Array.isArray(l.payments) ? l.payments : [];
        if (!l.model) l.model = 'simple';
        if (!l.status) l.status = 'active';
      });
      return d;
    },

    save: function () {
      try {
        var json = JSON.stringify(this.data);
        localStorage.setItem(KEY, json);
        // страховочная копия на случай сбоя записи основной
        try { localStorage.setItem(BAK, json); } catch (e) { }
      } catch (e) {
        U.toast('Не удалось сохранить: нет места в памяти');
        return false;
      }
      this.listeners.forEach(function (f) { try { f(); } catch (e) { } });
      return true;
    },

    onChange: function (f) { this.listeners.push(f); },

    /* ---------- клиенты ---------- */
    clients: function () { return this.data.clients; },
    client: function (id) { return this.data.clients.filter(function (c) { return c.id === id; })[0] || null; },
    addClient: function (c) {
      c.id = c.id || U.uid();
      c.createdAt = c.createdAt || U.today();
      this.data.clients.push(c);
      this.save();
      return c;
    },
    updClient: function (id, patch) {
      var c = this.client(id);
      if (c) { Object.assign(c, patch); this.save(); }
      return c;
    },
    delClient: function (id) {
      this.data.loans = this.data.loans.filter(function (l) { return l.clientId !== id; });
      this.data.clients = this.data.clients.filter(function (c) { return c.id !== id; });
      this.save();
    },
    /* найти по имени или создать */
    clientByName: function (name) {
      var n = String(name || '').trim().toLowerCase();
      return this.data.clients.filter(function (c) { return c.name.trim().toLowerCase() === n; })[0] || null;
    },

    /* ---------- займы ---------- */
    loans: function () { return this.data.loans; },
    loan: function (id) { return this.data.loans.filter(function (l) { return l.id === id; })[0] || null; },
    loansOf: function (clientId) {
      return this.data.loans.filter(function (l) { return l.clientId === clientId; });
    },
    addLoan: function (l) {
      l.id = l.id || U.uid();
      l.createdAt = l.createdAt || U.today();
      l.payments = l.payments || [];
      l.status = l.status || 'active';
      this.data.loans.push(l);
      this.save();
      return l;
    },
    updLoan: function (id, patch) {
      var l = this.loan(id);
      if (l) { Object.assign(l, patch); this.save(); }
      return l;
    },
    delLoan: function (id) {
      this.data.loans = this.data.loans.filter(function (l) { return l.id !== id; });
      this.save();
    },

    /* ---------- платежи ---------- */
    addPayment: function (loanId, p) {
      var l = this.loan(loanId);
      if (!l) return null;
      p.id = p.id || U.uid();
      p.date = p.date || U.today();
      p.amount = U.num(p.amount);
      l.payments.push(p);
      l.payments.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      // автозакрытие при полном погашении
      var r = CALC.loan(l);
      if (l.status === 'active' && r.totalDue <= 0.49) {
        l.status = 'closed';
        l.closedAt = p.date;
      }
      this.save();
      return p;
    },
    delPayment: function (loanId, payId) {
      var l = this.loan(loanId);
      if (!l) return;
      l.payments = l.payments.filter(function (p) { return p.id !== payId; });
      if (l.status === 'closed' && CALC.loan(l).totalDue > 0.49) { l.status = 'active'; l.closedAt = null; }
      this.save();
    },

    /* ---------- экспорт / импорт ---------- */
    exportJSON: function () {
      return JSON.stringify(this.data, null, 2);
    },
    importJSON: function (text, mode) {
      var d = JSON.parse(text);
      if (!d || !Array.isArray(d.loans) || !Array.isArray(d.clients)) throw new Error('Не похоже на резервную копию приложения');
      d = this.migrate(d);
      if (mode === 'replace') {
        this.data = d;
      } else {
        var self = this, idmap = {};
        d.clients.forEach(function (c) {
          var ex = self.clientByName(c.name);
          if (ex) { idmap[c.id] = ex.id; return; }
          var nid = U.uid();
          idmap[c.id] = nid;
          self.data.clients.push(Object.assign({}, c, { id: nid }));
        });
        var have = {};
        this.data.loans.forEach(function (l) { have[l.clientId + '|' + l.issuedAt + '|' + l.principal] = 1; });
        d.loans.forEach(function (l) {
          var cid = idmap[l.clientId] || l.clientId;
          if (have[cid + '|' + l.issuedAt + '|' + l.principal]) return;   // дубль
          self.data.loans.push(Object.assign({}, l, { id: U.uid(), clientId: cid }));
        });
      }
      this.save();
      return { clients: this.data.clients.length, loans: this.data.loans.length };
    },

    /* CSV: Клиент;Телефон;Сумма;Дата выдачи;Ставка %;Период;Срок дней;Заметка */
    importCSV: function (text) {
      var lines = String(text).split(/\r?\n/).filter(function (s) { return s.trim(); });
      if (!lines.length) throw new Error('Пустой файл');
      var sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
      var head = lines[0].toLowerCase();
      var start = /клиент|имя|name|фио/.test(head) ? 1 : 0;
      var per = { 'день': 'day', 'дн': 'day', 'day': 'day', 'неделя': 'week', 'нед': 'week', 'week': 'week', 'месяц': 'month', 'мес': 'month', 'month': 'month', 'год': 'year', 'year': 'year' };
      var added = 0, self = this;
      for (var i = start; i < lines.length; i++) {
        var c = lines[i].split(sep).map(function (s) { return s.trim().replace(/^"|"$/g, ''); });
        if (!c[0]) continue;
        var cl = self.clientByName(c[0]) || self.addClient({ name: c[0], phone: c[1] || '' });
        if (c[1] && !cl.phone) cl.phone = c[1];
        var principal = U.num(c[2]);
        if (!principal) continue;
        var issued = self.parseDate(c[3]) || U.today();
        var rate = c[4] != null && c[4] !== '' ? U.num(c[4]) : self.data.settings.defaultRate;
        var pk = per[String(c[5] || '').toLowerCase().slice(0, 6)] || per[String(c[5] || '').toLowerCase().slice(0, 3)] || self.data.settings.defaultPeriod;
        var term = c[6] ? U.num(c[6]) : self.data.settings.defaultTerm;
        self.addLoan({
          clientId: cl.id, principal: principal, issuedAt: issued,
          model: 'simple', rate: rate, ratePeriod: pk,
          dueAt: U.addDays(issued, term || 30),
          penaltyRate: self.data.settings.penaltyRate || 0,
          note: c[7] || ''
        });
        added++;
      }
      return added;
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
      var rows = [['Клиент', 'Телефон', 'Сумма', 'Дата выдачи', 'Ставка', 'Период', 'Вернуть до', 'Выплачено', 'Остаток долга', 'Статус']];
      this.data.loans.forEach(function (l) {
        var c = self.client(l.clientId) || { name: '—', phone: '' };
        var r = CALC.loan(l);
        rows.push([
          c.name, c.phone || '', l.principal, l.issuedAt,
          l.model === 'fixed' ? '' : l.rate,
          l.model === 'fixed' ? 'фикс' : CALC.PERIOD_NAME[l.ratePeriod],
          l.dueAt || '', Math.round(r.paidTotal), Math.round(r.totalDue),
          l.status === 'closed' ? 'закрыт' : (r.isOverdue ? 'просрочка' : 'активен')
        ]);
      });
      return '﻿' + rows.map(function (r) {
        return r.map(function (x) { return '"' + String(x).replace(/"/g, '""') + '"'; }).join(';');
      }).join('\n');
    }
  };

  w.DB = DB;
})(window);
