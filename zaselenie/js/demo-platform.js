/* Демонстрация платформы целиком в браузере: гость слева, пульт справа.
   Тот же движок, что и на сервере, — здесь только хранилище в памяти. */
(function (w, d) {
  'use strict';

  /* ---------- хранилище ---------- */

  var state = {
    guest: 'g1',
    tab: 'dialogs',
    current: null,
    dialogs: {},
    order: []
  };

  var NAMES = { g1: 'Айгерим', g2: 'Ержан' };

  var SAMPLES = [
    'нужна квартира с 10 по 13 марта, нас трое',
    'аптека и магазин рядом есть?',
    'беру первый',
    'Айгерим, +7 701 555 44 33',
    'оплатил, скинул на Kaspi',
    'можно с котом?',
    'как добраться из аэропорта?',
    'хотим отметить день рождения, нас 12',
    'я перевёл лишнее, верните на другую карту',
    'позовите человека'
  ];

  function dialog(id) {
    if (!state.dialogs[id]) {
      state.dialogs[id] = {
        id: id, name: NAMES[id] || id, mode: 'бот',
        ctx: AGENT.newContext({ channel: 'сайт', id: id }),
        messages: [], escalated: false, risk: 0, scenario: null, lastAt: Date.now(),
        booking: null
      };
      state.order.push(id);
    }
    return state.dialogs[id];
  }

  function push(dlg, from, text, meta) {
    dlg.messages.push({ from: from, text: text, at: Date.now(), meta: meta || null });
    dlg.lastAt = Date.now();
  }

  /* ---------- обработка сообщения гостя ---------- */

  function incoming(id, text) {
    var dlg = dialog(id);
    push(dlg, 'guest', text);

    if (dlg.mode === 'менеджер') {          // диалог у человека — бот молчит
      dlg.escalated = true;
      render();
      return;
    }

    var res = AGENT.respond(text, dlg.ctx);
    dlg.scenario = res.scenario;
    dlg.risk = res.analysis.risk.score;
    if (res.escalate) dlg.escalated = true;

    /* бронь идёт следом за состоянием диалога */
    var b = dlg.ctx.booking;
    if (b) {
      var obj = KB.byId(b.objectId);
      dlg.booking = {
        object: obj ? obj.title : b.objectId, from: b.from, to: b.to,
        guests: b.guests, total: b.total, prepay: b.prepay,
        status: res.scenario === 'payment-claimed' ? 'оплата заявлена'
              : res.scenario === 'booking-payment' ? 'ждёт оплату' : 'удержание'
      };
    }
    if (res.scenario === 'cancel' && res.action === 'confirm') { if (dlg.booking) dlg.booking.status = 'отменена'; }
    if (res.scenario === 'hold-expired' && dlg.booking) dlg.booking.status = 'снята';

    if (res.action !== 'ignore') {
      setTimeout(function () {
        push(dlg, 'agent', res.reply, { scenario: res.scenario, action: res.action });
        render();
      }, 220);
    }
    render();
  }

  /* ---------- отрисовка: гость ---------- */

  function renderGuest() {
    var dlg = dialog(state.guest);
    var thread = d.getElementById('thread');
    thread.innerHTML = dlg.messages.map(function (m) {
      var who = m.from === 'guest' ? 'me' : m.from === 'manager' ? 'manager' : 'bot';
      var label = m.from === 'manager' ? '<span class="who">менеджер Арман</span>' : '';
      return '<div class="msg ' + who + '">' + label + esc(m.text) + '</div>';
    }).join('') || '<div class="msg bot">Здравствуйте! ' + KB.settings.brand + ' — ' + KB.settings.business +
      ' в ' + KB.settings.cityIn + '. Напишите даты и сколько гостей.</div>';
    thread.scrollTop = thread.scrollHeight;
  }

  /* ---------- отрисовка: пульт ---------- */

  function renderPanel() {
    var dialogs = state.order.map(function (id) { return state.dialogs[id]; })
      .sort(function (a, b) { return b.lastAt - a.lastAt; });

    var active = dialogs.filter(function (x) { return x.booking && ['удержание', 'ждёт оплату', 'оплата заявлена'].indexOf(x.booking.status) >= 0; });
    d.getElementById('stats').innerHTML = [
      ['диалогов', dialogs.length],
      ['нужен человек', dialogs.filter(function (x) { return x.escalated; }).length],
      ['активных броней', active.length],
      ['на сумму', U.money(active.reduce(function (s, x) { return s + (x.booking.total || 0); }, 0))],
      ['удержаний', HOLDS.count()]
    ].map(function (x) { return x[0] + ': <b>' + x[1] + '</b>'; }).join('');

    d.getElementById('queue').innerHTML = dialogs.map(function (x) {
      var marks = [];
      if (x.escalated) marks.push('<span class="tag bad">нужен человек</span>');
      if (x.mode === 'менеджер') marks.push('<span class="tag warn">у менеджера</span>');
      if (x.risk >= 45) marks.push('<span class="tag bad">риск ' + x.risk + '</span>');
      if (x.booking) marks.push('<span class="tag ok">' + esc(x.booking.status) + '</span>');
      if (x.scenario) marks.push('<span class="tag">' + esc(x.scenario) + '</span>');
      var last = x.messages.length ? x.messages[x.messages.length - 1].text : '';
      return '<div class="item' + (state.current === x.id ? ' on' : '') + '" data-open="' + x.id + '">' +
        '<div class="line"><b>' + esc(x.name) + '</b><span>сайт</span></div>' +
        '<div class="last">' + esc(last.slice(0, 60)) + '</div>' +
        '<div class="marks">' + marks.join('') + '</div></div>';
    }).join('') || '<div class="empty" style="padding:12px">Пока пусто — напишите что-нибудь слева</div>';

    var work = d.getElementById('work');
    if (state.tab === 'bookings') return renderBookings(work, dialogs);
    if (state.tab === 'holds') return renderHolds(work);

    var cur = state.current && state.dialogs[state.current];
    if (!cur) { work.innerHTML = '<div class="empty">Выберите диалог в очереди</div>'; return; }

    var r = cur.ctx.request;
    work.innerHTML =
      '<div class="block"><h3>Переписка · ведёт ' + esc(cur.mode) + '</h3>' +
        '<div class="talk">' + cur.messages.map(function (m) {
          var who = m.from === 'guest' ? 'guest' : m.from === 'manager' ? 'manager' : 'agent';
          var label = m.from === 'guest' ? 'Гость' : m.from === 'manager' ? 'Менеджер' : 'Агент';
          var meta = m.meta && m.meta.scenario ? ' · ' + m.meta.scenario : '';
          return '<div class="msg ' + who + '"><span class="who">' + label + meta + '</span>' + esc(m.text) + '</div>';
        }).join('') + '</div>' +
        '<div class="acts">' +
          (cur.mode === 'бот'
            ? '<button class="primary" data-act="takeover">Взять диалог на себя</button>'
            : '<button data-act="release">Вернуть боту</button>') +
        '</div>' +
        (cur.mode === 'менеджер'
          ? '<div class="reply-row" style="margin-top:10px">' +
            '<input id="mreply" placeholder="Ответить гостю от своего имени…">' +
            '<button data-act="send">Отправить</button></div>'
          : '') +
      '</div>' +

      '<div class="block"><h3>Что понял агент</h3>' +
        kv('Даты', r.from ? U.fmtFull(r.from) + (r.to ? ' → ' + U.fmtFull(r.to) : '') : '—') +
        kv('Ночей', r.nights) + kv('Гостей', r.guests) +
        kv('Бюджет', r.budget ? U.money(r.budget) + (r.budgetPer === 'night' ? '/ночь' : '') : '—') +
        kv('Особое', [r.pets ? 'питомец' : '', r.needElevator ? 'лифт' : '', r.needParking ? 'парковка' : '',
                      r.lateArrival ? 'ночной заезд' : ''].filter(Boolean).join(', ') || '—') +
        kv('Сценарий', cur.scenario) + kv('Риск', cur.risk + ' из 100') +
      '</div>' +

      (cur.booking
        ? '<div class="block"><h3>Бронь</h3>' +
          kv('Квартира', cur.booking.object) +
          kv('Даты', U.range(cur.booking.from, cur.booking.to)) +
          kv('Гостей', cur.booking.guests) +
          kv('Сумма', U.money(cur.booking.total)) +
          kv('Предоплата', U.money(cur.booking.prepay)) +
          kv('Статус', cur.booking.status) +
          '<div class="acts">' +
          ['подтверждена', 'гость заселился', 'завершена', 'отменена'].map(function (s) {
            return '<button data-status="' + s + '">' + s + '</button>';
          }).join('') + '</div></div>'
        : '');
  }

  function renderBookings(work, dialogs) {
    var rows = dialogs.filter(function (x) { return x.booking; });
    work.innerHTML = rows.length
      ? '<table><thead><tr><th>Гость</th><th>Квартира</th><th>Даты</th><th>Сумма</th><th>Статус</th></tr></thead><tbody>' +
        rows.map(function (x) {
          return '<tr><td>' + esc(x.name) + '</td><td>' + esc(x.booking.object) + '</td>' +
            '<td>' + esc(U.range(x.booking.from, x.booking.to)) + '</td>' +
            '<td>' + U.money(x.booking.total) + '<br><span class="empty">предоплата ' + U.money(x.booking.prepay) + '</span></td>' +
            '<td>' + esc(x.booking.status) + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<div class="empty">Броней пока нет. Попросите слева квартиру и нажмите «беру первый».</div>';
  }

  function renderHolds(work) {
    var list = HOLDS.all();
    work.innerHTML = list.length
      ? '<table><thead><tr><th>Квартира</th><th>Даты</th><th>Кто держит</th><th>Истекает</th></tr></thead><tbody>' +
        list.map(function (h) {
          var o = KB.byId(h.objectId);
          return '<tr><td>' + esc(o ? o.title : h.objectId) + '</td>' +
            '<td>' + esc(U.range(h.from, h.to)) + '</td>' +
            '<td>' + esc(NAMES[h.holder] || h.holder) + '</td>' +
            '<td>' + new Date(h.until).toTimeString().slice(0, 5) + (h.paid ? ' · оплачено' : '') + '</td></tr>';
        }).join('') + '</tbody></table>' +
        '<div class="empty" style="margin-top:10px">Пока квартира удержана, второй гость её не увидит — попробуйте спросить те же даты от второго гостя.</div>'
      : '<div class="empty">Удержаний нет. Они появляются, когда гость выбирает вариант.</div>';
  }

  /* ---------- вспомогательное ---------- */

  function kv(k, v) {
    return (v === null || v === undefined || v === '') ? '' :
      '<div class="kv"><span>' + esc(k) + '</span><span>' + esc(v) + '</span></div>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }

  function render() { renderGuest(); renderPanel(); }

  /* ---------- события ---------- */

  function sendGuest() {
    var input = d.getElementById('input');
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    if (!state.current) state.current = state.guest;
    incoming(state.guest, text);
  }

  d.getElementById('send').onclick = sendGuest;
  d.getElementById('input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendGuest(); }
  });

  d.getElementById('who').onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    state.guest = b.dataset.guest;
    [].forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); });
    render();
  };

  d.getElementById('tabs').onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    state.tab = b.dataset.tab;
    [].forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); });
    renderPanel();
  };

  d.body.addEventListener('click', function (e) {
    var t = e.target;
    var open = t.closest('[data-open]');
    if (open) { state.current = open.dataset.open; renderPanel(); return; }

    var cur = state.current && state.dialogs[state.current];
    if (!cur) return;

    if (t.dataset.act === 'takeover') { cur.mode = 'менеджер'; cur.escalated = false; renderPanel(); }
    if (t.dataset.act === 'release') { cur.mode = 'бот'; renderPanel(); }
    if (t.dataset.act === 'send') {
      var input = d.getElementById('mreply');
      var text = input && input.value.trim();
      if (!text) return;
      push(cur, 'manager', text);
      render();
    }
    if (t.dataset.status) { if (cur.booking) cur.booking.status = t.dataset.status; renderPanel(); }
  });

  d.getElementById('reset').onclick = function () {
    HOLDS.reset();
    state.dialogs = {}; state.order = []; state.current = null;
    render();
  };

  /* ---------- старт ---------- */

  (function init() {
    var chips = d.getElementById('chips');
    SAMPLES.forEach(function (s) {
      var b = d.createElement('button');
      b.textContent = s.length > 34 ? s.slice(0, 32) + '…' : s;
      b.title = s;
      b.onclick = function () {
        if (!state.current) state.current = state.guest;
        incoming(state.guest, s);
      };
      chips.appendChild(b);
    });
    render();
  })();

})(window, document);
