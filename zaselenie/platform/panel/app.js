/* Пульт менеджера: очередь диалогов, переписка, брони, удержания.
   Обновляется живьём — сервер шлёт события через SSE. */
(function (w, d) {
  'use strict';

  var token = new URLSearchParams(location.search).get('token') ||
              localStorage.getItem('zaselenie.token') || '';
  if (token) localStorage.setItem('zaselenie.token', token);

  var state = { tab: 'dialogs', filter: '', dialogs: [], bookings: [], holds: [], current: null, messages: [] };

  var QUICK = [
    'Здравствуйте, это менеджер Азиз — подключился к диалогу.',
    'Проверяю оплату, вернусь через пару минут.',
    'Могу предложить другой вариант на эти даты.',
    'Уточните, пожалуйста, точное время заезда.'
  ];

  function api(path, opts) {
    opts = opts || {};
    return fetch(path, {
      method: opts.method || 'GET',
      headers: { 'content-type': 'application/json', 'x-token': token },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (r.status === 401) throw new Error('нужен токен менеджера: добавьте ?token=… в адрес');
      return r.json();
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }

  function when(ts) {
    var diff = (Date.now() - ts) / 1000;
    if (diff < 60) return 'только что';
    if (diff < 3600) return Math.floor(diff / 60) + ' мин';
    if (diff < 86400) return Math.floor(diff / 3600) + ' ч';
    return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  function money(n) {
    return (n == null ? '—' : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' сум');
  }

  /* ---------- загрузка ---------- */

  function refresh() {
    return Promise.all([
      api('/api/dialogs' + (state.filter ? '?filter=' + encodeURIComponent(state.filter) : '')),
      api('/api/bookings'),
      api('/api/holds'),
      api('/api/stats')
    ]).then(function (r) {
      state.dialogs = r[0]; state.bookings = r[1]; state.holds = r[2];
      renderStats(r[3]);
      render();
    }).catch(function (e) {
      d.getElementById('rows').innerHTML = '<div class="empty" style="padding:16px">' + esc(e.message) + '</div>';
    });
  }

  function openDialog(id) {
    return api('/api/dialogs/' + encodeURIComponent(id)).then(function (r) {
      state.current = r.dialog;
      state.messages = r.messages;
      render();
    });
  }

  /* ---------- отрисовка ---------- */

  function renderStats(s) {
    d.getElementById('stats').innerHTML = [
      ['диалогов за сутки', s.заСутки], ['нужен человек', s.эскалаций],
      ['активных броней', s.активныхБроней], ['на сумму', money(s.суммаАктивных)]
    ].map(function (x) { return x[0] + ': <b>' + x[1] + '</b>'; }).join('');
    d.getElementById('count-dialogs').textContent = s.диалогов;
    d.getElementById('count-bookings').textContent = s.активныхБроней;
  }

  function render() {
    d.getElementById('count-holds').textContent = state.holds.length;
    if (state.tab === 'dialogs') renderDialogs(); else renderTable();
  }

  function renderDialogs() {
    d.getElementById('pane-list').hidden = false;
    d.getElementById('pane-talk').classList.remove('full');

    var rows = d.getElementById('rows');
    rows.innerHTML = state.dialogs.map(function (x) {
      var marks = [];
      if (x.escalated) marks.push('<span class="tag bad">нужен человек</span>');
      if (x.mode === 'менеджер') marks.push('<span class="tag warn">у менеджера</span>');
      if (x.risk >= 45) marks.push('<span class="tag bad">риск ' + x.risk + '</span>');
      if (x.unread) marks.push('<span class="tag warn">' + x.unread + ' новых</span>');
      marks.push('<span class="tag">' + esc(x.channel) + '</span>');
      if (x.scenario) marks.push('<span class="tag">' + esc(x.scenario) + '</span>');
      return '<div class="row-item' + (state.current && state.current.id === x.id ? ' on' : '') +
        '" data-id="' + esc(x.id) + '">' +
        '<div class="who"><b>' + esc(x.guest.name || x.chatId) + '</b><span>' + when(x.lastAt) + '</span></div>' +
        '<div class="last">' + esc(x.lastText) + '</div>' +
        '<div class="marks">' + marks.join('') + '</div></div>';
    }).join('') || '<div class="empty" style="padding:16px">Пока пусто</div>';

    renderThread();
    renderSide();
  }

  function renderThread() {
    var head = d.getElementById('talk-head'), thread = d.getElementById('thread');
    var composer = d.getElementById('composer');
    if (!state.current) {
      head.innerHTML = '<span class="empty">Выберите диалог слева</span>';
      thread.innerHTML = '';
      composer.hidden = true;
      return;
    }
    var c = state.current;
    head.innerHTML = '<b>' + esc(c.guest.name || c.chatId) + '</b>' +
      '<span class="tag">' + esc(c.channel) + '</span>' +
      (c.guest.phone ? '<span class="tag">' + esc(c.guest.phone) + '</span>' : '') +
      '<span class="tag' + (c.mode === 'менеджер' ? ' warn' : '') + '">ведёт: ' + esc(c.mode) + '</span>' +
      '<span class="spacer"></span>' +
      (c.mode === 'бот'
        ? '<button class="primary" id="btn-takeover">Взять на себя</button>'
        : '<button id="btn-release">Вернуть боту</button>');

    thread.innerHTML = state.messages.map(function (m) {
      var who = m.from === 'guest' ? 'Гость' : m.from === 'manager' ? 'Менеджер' : 'Агент';
      var meta = who + ' · ' + when(m.at) + (m.meta && m.meta.scenario ? ' · ' + m.meta.scenario : '');
      return '<div class="msg ' + m.from + '"><span class="meta">' + esc(meta) + '</span>' + esc(m.text) + '</div>';
    }).join('');
    thread.scrollTop = thread.scrollHeight;

    composer.hidden = false;
    d.getElementById('quick').innerHTML = QUICK.map(function (q, i) {
      return '<button data-quick="' + i + '">' + esc(q.slice(0, 34)) + '…</button>';
    }).join('');
  }

  function renderSide() {
    var side = d.getElementById('pane-side');
    if (!state.current) { side.innerHTML = '<div class="empty">Карточка гостя появится здесь</div>'; return; }
    var c = state.current;
    var req = (c.ctx && c.ctx.request) || {};
    var booking = state.bookings.filter(function (b) { return b.dialogId === c.id; })[0];

    var html = '<div class="block"><h3>Гость</h3>' +
      kv('Имя', c.guest.name) + kv('Телефон', c.guest.phone) + kv('Язык', c.guest.lang) +
      kv('Канал', c.channel + ' · ' + c.chatId) + kv('Сценарий', c.scenario) + kv('Риск', c.risk) + '</div>';

    html += '<div class="block"><h3>Что он хочет</h3>' +
      kv('Даты', req.from ? req.from + ' → ' + (req.to || '?') : null) +
      kv('Ночей', req.nights) + kv('Гостей', req.guests) +
      kv('Бюджет', req.budget ? money(req.budget) + (req.budgetPer === 'night' ? '/ночь' : '') : null) +
      kv('Район', req.district) +
      kv('Особое', [req.pets ? 'питомец' : '', req.needElevator ? 'лифт' : '', req.needParking ? 'парковка' : '',
                    req.lateArrival ? 'ночной заезд' : ''].filter(Boolean).join(', ')) + '</div>';

    if (booking) {
      html += '<div class="block"><h3>Бронь</h3>' +
        kv('Квартира', booking.object) + kv('Даты', booking.from + ' → ' + booking.to) +
        kv('Гостей', booking.guests) + kv('Сумма', money(booking.total)) +
        kv('Предоплата', money(booking.prepay)) + kv('Статус', booking.status) +
        '<div class="actions">' +
        ['подтверждена', 'гость заселился', 'завершена', 'отменена'].map(function (s) {
          return '<button data-status="' + s + '" data-booking="' + booking.id + '">' + s + '</button>';
        }).join('') + '</div></div>';
    }
    side.innerHTML = html;
  }

  function kv(k, v) {
    return (v === null || v === undefined || v === '') ? '' :
      '<div class="kv"><span>' + esc(k) + '</span><span>' + esc(v) + '</span></div>';
  }

  function renderTable() {
    d.getElementById('pane-list').hidden = true;
    var talk = d.getElementById('pane-talk');
    talk.classList.add('full');
    d.getElementById('composer').hidden = true;
    d.getElementById('talk-head').innerHTML = '<b>' + (state.tab === 'bookings' ? 'Брони' : 'Удержания') + '</b>';

    var thread = d.getElementById('thread');
    if (state.tab === 'bookings') {
      thread.innerHTML = '<table><thead><tr><th>Квартира</th><th>Даты</th><th>Гость</th><th>Сумма</th><th>Статус</th></tr></thead><tbody>' +
        state.bookings.map(function (b) {
          return '<tr><td>' + esc(b.object) + '</td><td>' + esc(b.from + ' → ' + b.to) + '</td>' +
            '<td>' + esc((b.guest && b.guest.name) || '—') + '<br><span class="empty">' + esc((b.guest && b.guest.phone) || '') + '</span></td>' +
            '<td>' + money(b.total) + '<br><span class="empty">предоплата ' + money(b.prepay) + '</span></td>' +
            '<td><select data-booking="' + b.id + '">' +
            ['удержание', 'ждёт оплату', 'оплата заявлена', 'подтверждена', 'гость заселился', 'завершена', 'отменена', 'снята']
              .map(function (s) { return '<option' + (s === b.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
            '</select></td></tr>';
        }).join('') + '</tbody></table>';
    } else {
      thread.innerHTML = '<table><thead><tr><th>Квартира</th><th>Даты</th><th>Диалог</th><th>Истекает</th></tr></thead><tbody>' +
        state.holds.map(function (h) {
          return '<tr><td>' + esc(h.объект) + '</td><td>' + esc(h.с + ' → ' + h.по) + '</td>' +
            '<td>' + esc(h.диалог) + '</td><td>' + esc(h.истекает) + (h.оплачено ? ' · оплачено' : '') + '</td></tr>';
        }).join('') + '</tbody></table>' || '<div class="empty">Удержаний нет</div>';
    }
  }

  /* ---------- события ---------- */

  d.getElementById('rows').onclick = function (e) {
    var item = e.target.closest('.row-item');
    if (item) openDialog(item.dataset.id);
  };

  d.getElementById('tabs').onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    state.tab = b.dataset.tab;
    [].forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); });
    render();
  };

  d.getElementById('filters').onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    state.filter = b.dataset.filter;
    [].forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); });
    refresh();
  };

  d.body.addEventListener('click', function (e) {
    var t = e.target;
    if (t.id === 'btn-takeover' && state.current) {
      api('/api/dialogs/' + encodeURIComponent(state.current.id) + '/takeover', { method: 'POST', body: { who: 'менеджер' } })
        .then(function () { return openDialog(state.current.id); }).then(refresh);
    }
    if (t.id === 'btn-release' && state.current) {
      api('/api/dialogs/' + encodeURIComponent(state.current.id) + '/release', { method: 'POST', body: {} })
        .then(function () { return openDialog(state.current.id); }).then(refresh);
    }
    if (t.dataset && t.dataset.quick !== undefined) {
      d.getElementById('input').value = QUICK[+t.dataset.quick];
      d.getElementById('input').focus();
    }
    if (t.dataset && t.dataset.status && t.dataset.booking) {
      api('/api/bookings/' + t.dataset.booking + '/status', { method: 'POST', body: { status: t.dataset.status } })
        .then(refresh);
    }
  });

  d.body.addEventListener('change', function (e) {
    if (e.target.dataset && e.target.dataset.booking && e.target.tagName === 'SELECT') {
      api('/api/bookings/' + e.target.dataset.booking + '/status', { method: 'POST', body: { status: e.target.value } })
        .then(refresh);
    }
  });

  function sendReply() {
    var input = d.getElementById('input');
    var text = input.value.trim();
    if (!text || !state.current) return;
    input.value = '';
    api('/api/dialogs/' + encodeURIComponent(state.current.id) + '/reply', { method: 'POST', body: { text: text } })
      .then(function () { return openDialog(state.current.id); }).then(refresh);
  }

  d.getElementById('send').onclick = sendReply;
  d.getElementById('input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); }
  });

  /* ---------- живые обновления ---------- */

  function listen() {
    var es = new EventSource('/api/events?token=' + encodeURIComponent(token));
    es.onopen = function () { d.getElementById('conn').textContent = 'события подключены'; };
    es.onerror = function () { d.getElementById('conn').textContent = 'переподключаюсь…'; };
    es.onmessage = function (e) {
      var ev = JSON.parse(e.data);
      refresh();
      if (state.current && ev.payload && ev.payload.dialogId === state.current.id) openDialog(state.current.id);
      if (ev.type === 'escalation') notify(ev.payload);
    };
  }

  function notify(p) {
    d.getElementById('conn').textContent = 'нужен человек: ' + (p.scenario || '');
    if (w.Notification && Notification.permission === 'granted') {
      new Notification('Нужен человек', { body: (p.reason || '') + ' — ' + (p.text || '').slice(0, 80) });
    }
  }

  if (w.Notification && Notification.permission === 'default') Notification.requestPermission();

  refresh().then(listen);
  setInterval(refresh, 20000);
})(window, document);
