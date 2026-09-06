/* Утилиты: деньги, литры, счётчики, даты, склонения, DOM-хелперы */
(function (w) {
  'use strict';

  var U = {};

  /* ---------- id ---------- */
  U.uid = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  /* ---------- экранирование ---------- */
  U.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /* ---------- числа ---------- */
  U.num = function (v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = String(v == null ? '' : v).replace(/\s| /g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  };

  var nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  U.int = function (v) { return nf0.format(Math.round(U.num(v))); };
  U.dec = function (v, n) {
    var x = U.num(v);
    if (n === 2) return nf2.format(x);
    if (n === 0 || Math.abs(x) >= 1000) return nf0.format(Math.round(x));
    return nf1.format(x);
  };

  /* ---------- валюта (одна на всё приложение) ---------- */
  U.CUR = [
    { code: 'UZS', sym: 'сум', name: 'Узбекский сум', dec: 0 },
    { code: 'KGS', sym: 'сом', name: 'Киргизский сом', dec: 0 },
    { code: 'KZT', sym: '₸', name: 'Казахский тенге', dec: 0 },
    { code: 'RUB', sym: '₽', name: 'Российский рубль', dec: 0 },
    { code: 'USD', sym: '$', name: 'Доллар США', dec: 2 },
    { code: 'EUR', sym: '€', name: 'Евро', dec: 2 }
  ];
  U.curCode = function () {
    return (w.DB && DB.data && DB.data.settings && DB.data.settings.currency) || 'UZS';
  };
  U.curInfo = function (code) {
    code = code || U.curCode();
    for (var i = 0; i < U.CUR.length; i++) if (U.CUR[i].code === code) return U.CUR[i];
    return U.CUR[0];
  };
  U.sym = function (code) { return U.curInfo(code).sym; };

  /* U.money(12000) → «12 000 сум»; U.money(x, {noCur:true}) — без символа */
  U.money = function (v, opt) {
    opt = opt || {};
    var info = U.curInfo();
    var n = U.num(v), sign = n < 0 ? '−' : '', abs = Math.abs(n);
    var frac = opt.exact || (info.dec === 2 && abs > 0 && abs < 1000 && Math.round(abs) !== abs);
    var body = frac ? nf2.format(abs) : nf0.format(Math.round(abs));
    return sign + body + (opt.noCur ? '' : ' ' + info.sym);
  };

  U.moneyShort = function (v) {
    var sym = ' ' + U.sym();
    var n = Math.abs(U.num(v)), s = U.num(v) < 0 ? '−' : '';
    if (n >= 1e9) return s + nf1.format(n / 1e9) + ' млрд' + sym;
    if (n >= 1e6) return s + nf1.format(n / 1e6) + ' млн' + sym;
    if (n >= 1e5) return s + nf0.format(Math.round(n / 1e3)) + ' тыс' + sym;
    return s + nf0.format(Math.round(n)) + sym;
  };

  U.pct = function (v, sign) {
    var n = U.num(v);
    var s = (sign && n > 0 ? '+' : '') + U.dec(Math.abs(n) < 10 ? n : Math.round(n), Math.abs(n) < 10 ? 1 : 0);
    return s + '%';
  };

  /* ---------- топливо ---------- */
  U.FUELS = [
    { code: 'dt', name: 'Дизель', short: 'ДТ' },
    { code: 'ai80', name: 'Бензин АИ-80', short: 'АИ-80' },
    { code: 'ai92', name: 'Бензин АИ-92', short: 'АИ-92' },
    { code: 'ai95', name: 'Бензин АИ-95', short: 'АИ-95' },
    { code: 'gas', name: 'Газ', short: 'Газ' }
  ];
  U.fuel = function (code) {
    for (var i = 0; i < U.FUELS.length; i++) if (U.FUELS[i].code === code) return U.FUELS[i];
    return U.FUELS[0];
  };
  U.fuelShort = function (code) { return U.fuel(code).short; };

  /* ---------- виды техники ---------- */
  U.KINDS = [
    { code: 'truck', name: 'Самосвал, грузовик', ic: '🚛', meter: 'km' },
    { code: 'car', name: 'Легковая, пикап', ic: '🚗', meter: 'km' },
    { code: 'excavator', name: 'Экскаватор', ic: '🚜', meter: 'mh' },
    { code: 'loader', name: 'Погрузчик, бульдозер', ic: '🏗️', meter: 'mh' },
    { code: 'tractor', name: 'Трактор', ic: '🌾', meter: 'mh' },
    { code: 'gen', name: 'Генератор, насос', ic: '⚡', meter: 'mh' },
    { code: 'other', name: 'Другое', ic: '🛠️', meter: 'km' }
  ];
  U.kind = function (code) {
    for (var i = 0; i < U.KINDS.length; i++) if (U.KINDS[i].code === code) return U.KINDS[i];
    return U.KINDS[U.KINDS.length - 1];
  };

  /* ---------- литры и счётчики ---------- */
  U.liters = function (v, noUnit) { return U.dec(v, Math.abs(U.num(v)) >= 100 ? 0 : 1) + (noUnit ? '' : ' л'); };
  U.meterUnit = function (m) { return m === 'mh' ? 'мч' : 'км'; };
  U.meterName = function (m) { return m === 'mh' ? 'моточасы' : 'пробег'; };
  U.meter = function (v, m) { return U.int(v) + ' ' + U.meterUnit(m); };
  U.rateUnit = function (m) { return m === 'mh' ? 'л/мч' : 'л/100 км'; };
  U.rate = function (v, m, noUnit) {
    if (v == null) return '—';
    return U.dec(v, 1) + (noUnit ? '' : ' ' + U.rateUnit(m));
  };
  /* наработка, за которую тратится норма: 100 км или 1 моточас */
  U.rateBase = function (m) { return m === 'mh' ? 1 : 100; };

  /* ---------- склонение ---------- */
  U.plural = function (n, one, few, many) {
    n = Math.abs(Math.round(n)) % 100;
    var n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
  };
  U.days = function (n) { return Math.round(n) + ' ' + U.plural(n, 'день', 'дня', 'дней'); };
  U.unitsWord = function (n) { return n + ' ' + U.plural(n, 'единица', 'единицы', 'единиц'); };

  /* ---------- даты ('YYYY-MM-DD') ---------- */
  U.today = function () { return U.iso(new Date()); };
  U.iso = function (d) {
    var m = String(d.getMonth() + 1), day = String(d.getDate());
    return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (day.length < 2 ? '0' + day : day);
  };
  U.parse = function (s) {
    if (!s) return null;
    var p = String(s).slice(0, 10).split('-');
    if (p.length !== 3) return null;
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  };
  U.diffDays = function (a, b) {
    var x = U.parse(a), y = U.parse(b);
    if (x == null || y == null) return 0;
    return Math.round((y - x) / 86400000);
  };
  U.addDays = function (s, n) {
    var t = U.parse(s);
    if (t == null) return s;
    var d = new Date(t + n * 86400000);
    return d.getUTCFullYear() + '-' +
      String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(d.getUTCDate()).padStart(2, '0');
  };
  U.addMonths = function (s, n) {
    var t = U.parse(s);
    if (t == null) return s;
    var d = new Date(t), day = d.getUTCDate();
    d.setUTCMonth(d.getUTCMonth() + n);
    if (d.getUTCDate() < day) d.setUTCDate(0);
    return d.getUTCFullYear() + '-' +
      String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(d.getUTCDate()).padStart(2, '0');
  };

  var MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var MONF = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var MONN = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

  U.fmtDate = function (s) {
    var t = U.parse(s);
    if (t == null) return '—';
    var d = new Date(t), cy = new Date().getFullYear();
    var out = d.getUTCDate() + ' ' + MON[d.getUTCMonth()];
    if (d.getUTCFullYear() !== cy) out += ' ' + d.getUTCFullYear();
    return out;
  };
  U.fmtDateFull = function (s) {
    var t = U.parse(s);
    if (t == null) return '—';
    var d = new Date(t);
    return d.getUTCDate() + ' ' + MONF[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  };
  U.relDate = function (s) {
    var n = U.diffDays(U.today(), s);
    if (n === 0) return 'сегодня';
    if (n === 1) return 'завтра';
    if (n === -1) return 'вчера';
    if (n > 1 && n < 30) return 'через ' + U.days(n);
    if (n < -1 && n > -30) return U.days(-n) + ' назад';
    return U.fmtDate(s);
  };
  U.monthKey = function (s) { return String(s).slice(0, 7); };
  U.monthName = function (key) {
    var p = String(key).split('-');
    var n = MONN[+p[1] - 1] || '';
    return n.charAt(0).toUpperCase() + n.slice(1) + ' ' + p[0];
  };

  /* ---------- DOM ---------- */
  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  U.toast = function (msg) {
    var t = U.$('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('in');
    clearTimeout(U._tt);
    U._tt = setTimeout(function () { t.classList.remove('in'); }, 2300);
  };

  var PALETTE = ['#0a84ff', '#30d158', '#ff9f0a', '#ff453a', '#bf5af2', '#64d2ff', '#ffd60a', '#ff375f', '#5e5ce6', '#66d4cf'];
  U.color = function (str) {
    var h = 0, s = String(str || '?');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  };

  w.U = U;
})(window);
