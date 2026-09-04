/* Валюты и курсы.
   Курсы хранятся как «сколько единиц валюты за 1 доллар».
   Пока курс не задан — приложение не выдумывает его, а считает
   итоги отдельно по каждой валюте.                                  */
(function (w) {
  'use strict';

  var FX = {};

  FX.LIST = [
    { code: 'UZS', sym: 'сум', name: 'Узбекский сум', dec: 0, step: 1000 },
    { code: 'KGS', sym: 'сом', name: 'Киргизский сом', dec: 0, step: 100 },
    { code: 'USD', sym: '$', name: 'Доллар США', dec: 2, step: 100 },
    { code: 'RUB', sym: '₽', name: 'Российский рубль', dec: 0, step: 1000 },
    { code: 'KZT', sym: '₸', name: 'Казахский тенге', dec: 0, step: 1000 },
    { code: 'EUR', sym: '€', name: 'Евро', dec: 2, step: 100 }
  ];

  FX.byCode = function (c) {
    for (var i = 0; i < FX.LIST.length; i++) if (FX.LIST[i].code === c) return FX.LIST[i];
    return FX.LIST[0];
  };
  FX.sym = function (c) { return FX.byCode(c).sym; };
  FX.base = function () { return (DB.data && DB.data.settings.currency) || 'UZS'; };

  /* старые записи хранили символ валюты — переводим в код */
  FX.fromSymbol = function (s) {
    var map = { '₽': 'RUB', '$': 'USD', '€': 'EUR', '₸': 'KZT', 'сум': 'UZS', 'сом': 'KGS', '₴': 'UAH', '£': 'GBP' };
    if (map[s]) return map[s];
    for (var i = 0; i < FX.LIST.length; i++) if (FX.LIST[i].code === s) return s;
    return 'UZS';
  };

  /* ---------- пересчёт ---------- */
  FX.rate = function (code) {
    var r = DB.data.settings.rates || {};
    if (code === 'USD') return 1;
    return U.num(r[code]) || 0;
  };
  FX.can = function (from, to) {
    if (from === to) return true;
    return FX.rate(from) > 0 && FX.rate(to) > 0;
  };
  FX.conv = function (amount, from, to) {
    if (from === to) return amount;
    var a = FX.rate(from), b = FX.rate(to);
    if (!a || !b) return null;
    return amount / a * b;
  };

  /* Собрать суммы по валютам в базовую, если это возможно.
     Возвращает {ok:true, value} либо {ok:false, parts:{код:сумма}}      */
  FX.total = function (parts, to) {
    to = to || FX.base();
    var sum = 0, ok = true, left = {};
    for (var c in parts) {
      if (!parts.hasOwnProperty(c) || !parts[c]) continue;
      var v = FX.conv(parts[c], c, to);
      if (v == null) { ok = false; left[c] = parts[c]; } else sum += v;
    }
    return ok ? { ok: true, value: sum } : { ok: false, parts: parts, partial: sum, missing: left };
  };

  /* ---------- обновление курсов из открытых источников ----------
     Проверить эти запросы в среде разработки не удалось (нет выхода в сеть),
     поэтому источники перебираются по очереди, а при любой неудаче остаётся
     последний сохранённый или введённый вручную курс.                */
  FX.SOURCES = {
    cbu: {
      name: 'ЦБ Узбекистана',
      url: 'https://cbu.uz/ru/arkhiv-kursov-valyut/json/',
      parse: function (text) {
        var arr = JSON.parse(text);
        if (!Array.isArray(arr) || !arr.length) throw new Error('пустой ответ');
        var perUzs = {}, date = null;                 // сумов за 1 единицу валюты
        arr.forEach(function (x) {
          var code = x.Ccy || x.ccy, val = U.num(String(x.Rate || x.rate).replace(',', '.'));
          var nom = U.num(x.Nominal || x.nominal) || 1;
          if (code && val) perUzs[code] = val / nom;
          if (!date && (x.Date || x.date)) date = String(x.Date || x.date);
        });
        if (!perUzs.USD) throw new Error('нет курса доллара');
        var out = { USD: 1, UZS: perUzs.USD };        // сумов за доллар
        FX.LIST.forEach(function (c) {
          if (c.code === 'USD' || c.code === 'UZS') return;
          if (perUzs[c.code]) out[c.code] = perUzs.USD / perUzs[c.code];
        });
        return { rates: out, date: date };
      }
    },
    nbkr: {
      name: 'Нацбанк Кыргызстана',
      url: 'https://www.nbkr.kg/XML/daily.xml',
      parse: function (text) {
        var doc = new DOMParser().parseFromString(text, 'text/xml');
        var nodes = doc.getElementsByTagName('Currency');
        if (!nodes.length) throw new Error('пустой ответ');
        var perKgs = {};                               // сомов за 1 единицу
        for (var i = 0; i < nodes.length; i++) {
          var code = nodes[i].getAttribute('ISOCode');
          var vEl = nodes[i].getElementsByTagName('Value')[0];
          var nEl = nodes[i].getElementsByTagName('Nominal')[0];
          var val = vEl ? U.num(vEl.textContent.replace(',', '.')) : 0;
          var nom = nEl ? U.num(nEl.textContent) || 1 : 1;
          if (code && val) perKgs[code] = val / nom;
        }
        if (!perKgs.USD) throw new Error('нет курса доллара');
        var out = { USD: 1, KGS: perKgs.USD };
        FX.LIST.forEach(function (c) {
          if (c.code === 'USD' || c.code === 'KGS') return;
          if (perKgs[c.code]) out[c.code] = perKgs.USD / perKgs[c.code];
        });
        var d = doc.documentElement.getAttribute('Date');
        return { rates: out, date: d };
      }
    },
    world: {
      name: 'Открытый справочник курсов',
      url: 'https://open.er-api.com/v6/latest/USD',
      parse: function (text) {
        var j = JSON.parse(text);
        if (!j || !j.rates || !j.rates.UZS) throw new Error('пустой ответ');
        var out = { USD: 1 };
        FX.LIST.forEach(function (c) { if (j.rates[c.code]) out[c.code] = j.rates[c.code]; });
        return { rates: out, date: j.time_last_update_utc ? String(j.time_last_update_utc).slice(5, 16) : null };
      }
    }
  };

  /* pref: 'cbu' | 'nbkr' | 'world' | 'auto' */
  FX.update = function (pref, cb) {
    var order = pref && pref !== 'auto' ? [pref] : ['cbu', 'nbkr', 'world'];
    if (pref && pref !== 'auto') {
      ['cbu', 'nbkr', 'world'].forEach(function (k) { if (k !== pref) order.push(k); });
    }
    var i = 0;
    (function next() {
      if (i >= order.length) { cb(null, 'Не удалось получить курс ни из одного источника'); return; }
      var key = order[i++], src = FX.SOURCES[key];
      var done = false;
      var to = setTimeout(function () { if (!done) { done = true; next(); } }, 9000);
      fetch(src.url, { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(function (t) {
          if (done) return;
          done = true; clearTimeout(to);
          var res = src.parse(t);
          var st = DB.data.settings;
          st.rates = Object.assign({}, st.rates || {}, res.rates);
          st.ratesDate = U.today();
          st.ratesSource = src.name + (res.date ? ', курс на ' + res.date : '');
          DB.save();
          cb(res.rates, null, src.name);
        })
        .catch(function () { if (!done) { done = true; clearTimeout(to); next(); } });
    })();
  };

  w.FX = FX;
})(window);
