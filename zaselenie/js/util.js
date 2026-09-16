/* Утилиты: даты, числа, текст. Даты везде — строки 'ГГГГ-ММ-ДД' */
(function (w) {
  'use strict';

  var U = {};

  U.MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
              'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  U.WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

  U.pad = function (n) { return (n < 10 ? '0' : '') + n; };

  /* Сегодня — можно подменить для тестов и демо: U.NOW = '2026-03-01' */
  U.NOW = null;
  U.today = function () {
    if (U.NOW) return U.NOW;
    var d = new Date();
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate());
  };

  U.date = function (iso) {
    var p = String(iso).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  };

  U.iso = function (d) {
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate());
  };

  U.make = function (y, m, day) { return U.iso(new Date(y, m - 1, day)); };

  U.valid = function (iso) {
    return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) && U.iso(U.date(iso)) === iso;
  };

  U.addDays = function (iso, n) {
    var d = U.date(iso);
    d.setDate(d.getDate() + n);
    return U.iso(d);
  };

  U.addMonths = function (iso, n) {
    var d = U.date(iso), day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return U.iso(d);
  };

  U.diffDays = function (a, b) {
    return Math.round((U.date(b) - U.date(a)) / 86400000);
  };

  U.dow = function (iso) { return U.date(iso).getDay(); };          // 0 — воскресенье
  U.isWeekend = function (iso) { var d = U.dow(iso); return d === 5 || d === 6; };  // ночи пт и сб

  U.fmt = function (iso) {
    if (!U.valid(iso)) return '—';
    var d = U.date(iso);
    return d.getDate() + ' ' + U.MONTHS[d.getMonth()];
  };

  U.fmtFull = function (iso) {
    if (!U.valid(iso)) return '—';
    var d = U.date(iso);
    return U.WEEKDAYS[d.getDay()] + ', ' + d.getDate() + ' ' + U.MONTHS[d.getMonth()] +
           (d.getFullYear() !== U.date(U.today()).getFullYear() ? ' ' + d.getFullYear() : '');
  };

  U.range = function (from, to) { return U.fmt(from) + ' — ' + U.fmt(to); };

  /* Пересекаются ли интервалы [a1;a2) и [b1;b2) */
  U.overlap = function (a1, a2, b1, b2) { return a1 < b2 && b1 < a2; };

  /* Каждая ночь отрезка [from; to) — это дата ночёвки */
  U.nightsList = function (from, to) {
    var out = [], cur = from;
    while (cur < to) { out.push(cur); cur = U.addDays(cur, 1); }
    return out;
  };

  U.plural = function (n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  };

  U.nights = function (n) { return n + ' ' + U.plural(n, 'ночь', 'ночи', 'ночей'); };
  U.guests = function (n) { return n + ' ' + U.plural(n, 'гость', 'гостя', 'гостей'); };
  U.guestsUpTo = function (n) { return n + ' ' + U.plural(n, 'гостя', 'гостей', 'гостей'); };   // «вмещает до N гостей»

  U.money = function (n, cur) {
    var s = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return s + (cur === undefined ? ' сум' : (cur ? ' ' + cur : ''));
  };

  /* Нормализация сообщения: регистр, ё, лишние пробелы, латинские двойники */
  U.norm = function (s) {
    return String(s || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[   ]/g, ' ')
      .replace(/[«»"'`]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  U.has = function (text, words) {
    for (var i = 0; i < words.length; i++) if (text.indexOf(words[i]) >= 0) return true;
    return false;
  };

  U.hits = function (text, words) {
    var out = [];
    for (var i = 0; i < words.length; i++) if (text.indexOf(words[i]) >= 0) out.push(words[i]);
    return out;
  };

  U.uniq = function (arr) {
    var seen = {}, out = [];
    arr.forEach(function (x) { var k = JSON.stringify(x); if (!seen[k]) { seen[k] = 1; out.push(x); } });
    return out;
  };

  U.clamp = function (n, a, b) { return Math.max(a, Math.min(b, n)); };

  if (typeof module !== 'undefined' && module.exports) module.exports = U;
  w.U = U;
})(typeof window !== 'undefined' ? window : globalThis);
