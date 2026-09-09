/* Напоминания через Календарь iPhone.
   Веб-приложение не может само разбудить телефон по расписанию — для этого
   нужен сервер, который шлёт push. Зато оно может отдать все будущие платежи
   календарным файлом: дальше напоминания показывает сам iOS, без интернета
   и без передачи данных куда-либо.                                        */
(function (w) {
  'use strict';

  var ICS = {};

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }
  /* строки календаря складываются по 60 символов — так требует формат */
  function fold(line) {
    if (line.length <= 60) return line;
    var out = line.slice(0, 60), rest = line.slice(60);
    while (rest.length) { out += '\r\n ' + rest.slice(0, 59); rest = rest.slice(59); }
    return out;
  }
  function stamp(d) {
    return d.getUTCFullYear() +
      String(d.getUTCMonth() + 1).padStart(2, '0') +
      String(d.getUTCDate()).padStart(2, '0') + 'T' +
      String(d.getUTCHours()).padStart(2, '0') +
      String(d.getUTCMinutes()).padStart(2, '0') + '00Z';
  }
  /* местное время без часового пояса — телефон подставит своё */
  function local(day, hour) {
    return String(day).replace(/-/g, '') + 'T' + String(hour).padStart(2, '0') + '0000';
  }

  /* Что напомнить: невыплаченные платежи по графику и возвраты тела */
  ICS.events = function (days) {
    days = days || 365;
    var t = U.today(), limit = U.addDays(t, days), out = [];

    DB.loans().forEach(function (l) {
      var r = CALC.loan(l);
      if (r.isClosed || r.isPaidOff) return;
      var c = DB.client(l.clientId) || { name: 'Без клиента', phone: '' };
      var cur = l.currency || FX.base();

      (r.schedule || []).forEach(function (p) {
        if (p.paid || p.date < t || p.date > limit) return;
        out.push({
          uid: 'p-' + l.id + '-' + p.date,
          date: p.date,
          title: 'Проценты: ' + c.name + ' — ' + U.money(p.due, cur),
          body: 'Платёж процентов за месяц ' + p.n + '.\n' +
            'Заём ' + U.money(l.principal, cur) + ' от ' + U.fmtDateFull(l.issuedAt) +
            ', ставка ' + U.pct(l.rate) + ' ' + CALC.PERIOD_NAME[l.ratePeriod] + '.' +
            (c.phone ? '\nТелефон: ' + c.phone : ''),
          loanId: l.id
        });
      });

      if (l.dueAt && l.dueAt >= t && l.dueAt <= limit) {
        out.push({
          uid: 'd-' + l.id,
          date: l.dueAt,
          title: 'Возврат тела: ' + c.name + ' — ' + U.money(r.balance, cur),
          body: 'Срок возврата основного долга.' + (c.phone ? '\nТелефон: ' + c.phone : ''),
          loanId: l.id
        });
      }
    });

    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  };

  ICS.build = function (opt) {
    opt = opt || {};
    var hour = opt.hour == null ? 10 : opt.hour;
    var events = ICS.events(opt.days);
    var now = stamp(new Date());
    var base = '';
    try { base = location.origin + location.pathname; } catch (e) { }

    var L = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Kapital//Loan reminders//RU',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Капитал — платежи',
      'X-WR-TIMEZONE:' + (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
    ];

    events.forEach(function (e) {
      L.push('BEGIN:VEVENT');
      L.push('UID:kapital-' + e.uid + '@kapital.app');
      L.push('DTSTAMP:' + now);
      L.push('DTSTART:' + local(e.date, hour));
      L.push('DTEND:' + local(e.date, hour + 1));
      L.push('SUMMARY:' + esc(e.title));
      L.push('DESCRIPTION:' + esc(e.body));
      if (base) L.push('URL:' + esc(base + '#/loan/' + e.loanId));
      L.push('TRANSP:TRANSPARENT');
      /* два напоминания: накануне и в сам день */
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(e.title), 'TRIGGER:-P1D', 'END:VALARM');
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(e.title), 'TRIGGER:PT0S', 'END:VALARM');
      L.push('END:VEVENT');
    });

    L.push('END:VCALENDAR');
    return L.map(fold).join('\r\n') + '\r\n';
  };

  w.ICS = ICS;
})(window);
