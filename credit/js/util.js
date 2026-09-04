/* Утилиты: форматирование, даты, DOM-хелперы */
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

  /* ---------- числа и деньги ---------- */
  U.num = function (v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = String(v == null ? '' : v).replace(/\s| /g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  };

  var nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  var nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* U.money(1000) — в базовой валюте
     U.money(1000, 'USD') — в указанной
     U.money(1000, {cur:'USD', exact:true, noCur:true})                */
  U.money = function (v, opt) {
    if (typeof opt === 'string') opt = { cur: opt };
    opt = opt || {};
    var code = opt.cur || (w.FX ? FX.base() : 'UZS');
    var info = w.FX ? FX.byCode(code) : { sym: '', dec: 0 };
    var n = U.num(v), sign = n < 0 ? '−' : '', abs = Math.abs(n);
    var frac = opt.exact || (info.dec === 2 && abs > 0 && abs < 1000 && Math.round(abs) !== abs);
    var body = frac ? nf2.format(abs) : nf0.format(Math.round(abs));
    return sign + body + (opt.noCur ? '' : ' ' + info.sym);
  };

  U.moneyShort = function (v, cur) {
    var code = cur || (w.FX ? FX.base() : 'UZS');
    var sym = ' ' + (w.FX ? FX.sym(code) : '');
    var n = Math.abs(U.num(v)), s = U.num(v) < 0 ? '−' : '';
    if (n >= 1e9) return s + (n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace('.', ',') + ' млрд' + sym;
    if (n >= 1e6) return s + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + ' млн' + sym;
    if (n >= 1e5) return s + nf0.format(Math.round(n / 1e3)) + ' тыс' + sym;
    return s + nf0.format(Math.round(n)) + sym;
  };

  U.pct = function (v) {
    var n = U.num(v);
    return (Math.round(n * 100) / 100).toString().replace('.', ',') + '%';
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

  /* ---------- даты (хранятся как 'YYYY-MM-DD') ---------- */
  U.today = function () {
    var d = new Date();
    return U.iso(d);
  };
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
  U.diffDays = function (a, b) {                       // b - a, в днях
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
    if (d.getUTCDate() < day) d.setUTCDate(0);          // 31 янв + 1 мес → 28/29 фев
    return d.getUTCFullYear() + '-' +
      String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(d.getUTCDate()).padStart(2, '0');
  };

  var MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var MONF = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  U.fmtDate = function (s, full) {
    var t = U.parse(s);
    if (t == null) return '—';
    var d = new Date(t), cy = new Date().getFullYear();
    var arr = full ? MONF : MON;
    var out = d.getUTCDate() + ' ' + arr[d.getUTCMonth()];
    if (d.getUTCFullYear() !== cy) out += ' ' + d.getUTCFullYear();
    return out;
  };
  U.fmtDateFull = function (s) {
    var t = U.parse(s);
    if (t == null) return '—';
    var d = new Date(t);
    return d.getUTCDate() + ' ' + MONF[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  };
  /* «сегодня», «завтра», «через 5 дней», «просрочка 3 дня» */
  U.relDate = function (s) {
    var n = U.diffDays(U.today(), s);
    if (n === 0) return 'сегодня';
    if (n === 1) return 'завтра';
    if (n === -1) return 'вчера';
    if (n > 1 && n < 30) return 'через ' + U.days(n);
    if (n < -1) return U.days(-n) + ' назад';
    return U.fmtDate(s);
  };
  U.monthKey = function (s) { return String(s).slice(0, 7); };
  var MONN = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
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

  /* цвет аватара по имени — стабильный */
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
