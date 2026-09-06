/* Утилиты: числа, литры, наработка, даты, DOM-хелперы */
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

  /* число с нужной точностью: 12.5 → «12,5» */
  U.dec = function (v, digits) {
    var n = U.num(v);
    if (digits === 2) return nf2.format(n);
    if (digits === 1 || (digits == null && Math.round(n) !== n)) return nf1.format(n);
    return nf0.format(Math.round(n));
  };

  /* ---------- деньги ---------- */
  U.cur = function () {
    return (w.DB && DB.data && DB.data.settings && DB.data.settings.currency) || 'сум';
  };
  U.money = function (v, opt) {
    opt = opt || {};
    var n = U.num(v), sign = n < 0 ? '−' : '', abs = Math.abs(n);
    var body = opt.exact ? nf2.format(abs) : nf0.format(Math.round(abs));
    return sign + body + (opt.noCur ? '' : ' ' + U.cur());
  };
  U.moneyShort = function (v) {
    var n = Math.abs(U.num(v)), s = U.num(v) < 0 ? '−' : '', sym = ' ' + U.cur();
    if (n >= 1e9) return s + nf1.format(n / 1e9) + ' млрд' + sym;
    if (n >= 1e6) return s + nf1.format(n / 1e6) + ' млн' + sym;
    if (n >= 1e5) return s + nf0.format(Math.round(n / 1e3)) + ' тыс' + sym;
    return s + nf0.format(Math.round(n)) + sym;
  };

  /* ---------- топливо и наработка ---------- */
  U.liters = function (v, opt) {
    opt = opt || {};
    var n = U.num(v), sign = n < 0 ? '−' : (opt.sign && n > 0 ? '+' : '');
    return sign + U.dec(Math.abs(n), Math.abs(n) < 100 && Math.round(n) !== n ? 1 : 0) + (opt.noUnit ? '' : ' л');
  };

  /* единица наработки: моточасы или километры */
  U.METER = {
    hours: { unit: 'м·ч', long: 'моточасы', one: 'моточас', few: 'моточаса', many: 'моточасов', norm: 'л/м·ч' },
    km: { unit: 'км', long: 'километры', one: 'километр', few: 'километра', many: 'километров', norm: 'л/100 км' }
  };
  U.meterInfo = function (m) { return U.METER[m] || U.METER.hours; };
  U.work = function (v, meter, opt) {
    opt = opt || {};
    var i = U.meterInfo(meter), n = U.num(v);
    return U.dec(n, meter === 'km' ? 0 : (Math.abs(n) < 1000 && Math.round(n) !== n ? 1 : 0)) +
      (opt.noUnit ? '' : ' ' + i.unit);
  };
  U.normText = function (v, meter) {
    return U.dec(v, 1) + ' ' + U.meterInfo(meter).norm;
  };

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
  U.cnt = function (n, one, few, many) { return n + ' ' + U.plural(n, one, few, many); };

  /* ---------- даты (хранятся как 'YYYY-MM-DD') ---------- */
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
  U.diffDays = function (a, b) {                       // b − a, в днях
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
  U.monthStart = function (s) { return String(s).slice(0, 7) + '-01'; };
  U.monthEnd = function (s) { return U.addDays(U.addMonths(U.monthStart(s), 1), -1); };

  var MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var MONF = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var MONN = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

  U.fmtDate = function (s, full) {
    var t = U.parse(s);
    if (t == null) return '—';
    var d = new Date(t), cy = new Date().getFullYear();
    var out = d.getUTCDate() + ' ' + (full ? MONF : MON)[d.getUTCMonth()];
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
  U.monthName = function (key, short) {
    var p = String(key).split('-');
    var n = MONN[+p[1] - 1] || '';
    n = n.charAt(0).toUpperCase() + n.slice(1);
    return short ? n : n + ' ' + p[0];
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

  /* цвет плашки по названию — стабильный */
  var PALETTE = ['#0a84ff', '#30d158', '#ff9f0a', '#ff453a', '#bf5af2', '#64d2ff', '#ffd60a', '#ff375f', '#5e5ce6', '#66d4cf'];
  U.color = function (str) {
    var h = 0, s = String(str || '?');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  };
  U.initials = function (name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
  };
  U.telHref = function (phone) { return 'tel:' + String(phone || '').replace(/[^\d+]/g, ''); };
  U.waHref = function (phone) {
    var d = String(phone || '').replace(/\D/g, '');
    if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
    return 'https://wa.me/' + d;
  };

  w.U = U;
})(window);
