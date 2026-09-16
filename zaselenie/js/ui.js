/* Демо-интерфейс: переписка слева, разбор справа. */
(function (w, d) {
  'use strict';

  var chat = d.getElementById('chat');
  var insight = d.getElementById('insight');
  var input = d.getElementById('input');
  var send = d.getElementById('send');
  var modal = d.getElementById('modal');

  var ctx = AGENT.newContext({ channel: 'демо' });
  var mode = 'engine';
  var history = [];

  var SAMPLES = [
    'Здравствуйте! Нужна квартира с 10 по 13 марта, нас трое, с ребёнком 3 года',
    'Есть что-нибудь на завтра? Вдвоём, бюджет до 20 тысяч',
    'Можно на пару часов?',
    'Хотим отметить день рождения, нас 12 человек',
    'Нас 14 человек, 5–7 ноября',
    'Снимем на месяц, семья из четырёх',
    'Нужен счёт и акт для компании, командировка 20–24 октября',
    'Приедем с котом, прилёт в 2 ночи, нужен лифт и парковка',
    'В квартире нет воды со вчера',
    'Я перевёл лишнее, верните на другую карту',
    'Хочу отменить бронь',
    'А скидка будет?',
    'Дайте точный адрес',
    'Заселите без паспорта',
    'Нужна ли регистрация для иностранца?',
    'Hello! Do you have a flat for 3 nights?'
  ];

  /* ---------- переписка ---------- */

  function bubble(who, text, tag) {
    var el = d.createElement('div');
    el.className = 'msg ' + who;
    var label = who === 'guest' ? 'Гость' : who === 'agent' ? 'Агент' : '';
    el.innerHTML = (label ? '<span class="who">' + label + '</span>' : '');
    el.appendChild(d.createTextNode(text));
    if (tag) {
      var t = d.createElement('span');
      t.className = 'tag';
      t.textContent = tag;
      el.appendChild(t);
    }
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
    return el;
  }

  function typing() {
    var el = d.createElement('div');
    el.className = 'typing';
    el.textContent = 'агент печатает…';
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
    return el;
  }

  /* ---------- панель разбора ---------- */

  function badgeFor(action) {
    var map = {
      offer: ['ok', 'предложение'], hold: ['ok', 'удержание'], confirm: ['ok', 'подтверждение'],
      ask: ['warn', 'уточнение'], info: ['warn', 'справка'],
      decline: ['bad', 'отказ'], escalate: ['bad', 'человек'], handoff: ['bad', 'человек'],
      ignore: ['bad', 'без ответа']
    };
    return map[action] || ['warn', action];
  }

  function block(title, inner) {
    return '<div class="block"><h3>' + title + '</h3>' + inner + '</div>';
  }

  function kv(k, v) {
    return v === null || v === undefined || v === '' ? '' :
      '<div class="kv"><span>' + k + '</span><span>' + v + '</span></div>';
  }

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
  }

  function render(res) {
    var a = res.analysis, r = a.req, out = [];
    var b = badgeFor(res.action);

    out.push(block('Решение',
      '<div class="scen"><b>' + esc(res.scenarioTitle) + '</b>' +
      '<span class="badge ' + b[0] + '">' + b[1] + '</span>' +
      '<span class="badge">' + esc(res.scenario) + '</span></div>' +
      '<div class="reason">' + esc(res.reason) + '</div>' +
      kv('Уверенность разбора', Math.round(a.confidence * 100) + '%') +
      kv('Следующий шаг', res.crm.nextStep) +
      (res.escalate ? kv('Эскалация', 'да') : '')));

    out.push(block('Что понял',
      kv('Намерение', a.intents.map(function (i) { return i.id; }).slice(0, 2).join(', ')) +
      kv('Даты', r.from ? (U.fmtFull(r.from) + (r.to ? ' → ' + U.fmtFull(r.to) : '')) : '—') +
      kv('Ночей', r.nights || '—') +
      kv('Гостей', r.guests ? (r.guests + (r.children ? ' (детей: ' + r.children + (r.childAges.length ? ', возраст ' + r.childAges.join(', ') : '') + ')' : '')) : '—') +
      kv('Бюджет', r.budget ? U.money(r.budget) + (r.budgetPer === 'night' ? ' за ночь' : ' за весь срок') : '—') +
      kv('Район', r.district || '—') +
      kv('Цель поездки', a.purpose === 'unknown' ? '—' : a.purpose) +
      kv('Особые условия', [
        r.pets ? 'питомец' : '', r.needElevator ? 'лифт' : '', r.needParking ? 'парковка' : '',
        r.needCrib ? 'кроватка' : '', r.earlyCheckIn ? 'ранний заезд' : '',
        r.lateCheckOut ? 'поздний выезд' : '', r.lateArrival ? 'ночной заезд' : '',
        a.signals.invoice ? 'документы' : '', a.signals.registration ? 'регистрация' : ''
      ].filter(Boolean).join(', ') || '—')));

    var notes = a.dates.assumed.concat(a.dates.issues).concat(a.guests.assumed || []).concat(a.budget.assumed || []);
    if (notes.length || a.missing.length) {
      out.push(block('Допущения и пробелы',
        (notes.length ? '<div class="list">' + notes.map(function (n) { return '<div>' + esc(n) + '</div>'; }).join('') + '</div>' : '') +
        (a.missing.length ? '<div class="kv"><span>Не хватает</span><span>' + esc(a.missing.join(', ')) + '</span></div>' : '')));
    }

    var lvl = a.risk.score >= 45 ? 'bad' : a.risk.score >= 20 ? 'warn' : '';
    out.push(block('Риск',
      '<div class="bar ' + lvl + '"><i style="width:' + a.risk.score + '%"></i></div>' +
      kv('Оценка', a.risk.score + ' из 100 — ' + a.risk.level) +
      (a.risk.flags.length
        ? '<div class="list">' + a.risk.flags.map(function (f) {
            return '<div>' + esc(f.why) + ' → ' + esc(f.action) + '</div>'; }).join('') + '</div>'
        : '<div class="empty">Флагов нет</div>')));

    if (a.match && (a.match.offers.length || a.match.rejected.length)) {
      out.push(block('Подбор по календарю',
        (a.match.offers.length
          ? '<div class="list">' + a.match.offers.slice(0, 3).map(function (o) {
              return '<div>' + esc(o.object.title) + ' — ' + U.money(o.quote.perNight) + '/ночь, итого ' +
                     U.money(o.quote.total) + ' (оценка ' + o.score + ')</div>'; }).join('') + '</div>'
          : '<div class="empty">Свободных под запрос нет</div>') +
        (a.match.rejected.length
          ? '<h3 style="margin-top:12px">Почему отпали</h3><div class="list">' +
            a.match.rejected.map(function (r2) {
              return '<div>' + esc(r2.object.title) + ' — ' + esc(r2.reasons.join('; ')) + '</div>'; }).join('') + '</div>'
          : '')));
    }

    if (res.candidates.length > 1) {
      out.push(block('Сработавшие сценарии',
        '<div class="tagline">' + res.candidates.map(function (c) {
          return '<span>' + esc(c.id) + '</span>'; }).join('') + '</div>'));
    }

    if (res.internal) out.push(block('Заметка менеджеру', '<div class="reason">' + esc(res.internal) + '</div>'));

    out.push(block('Заявка для CRM', '<pre class="json">' + esc(JSON.stringify(res.crm, null, 2)) + '</pre>'));

    insight.innerHTML = out.join('');
    insight.scrollTop = 0;
  }

  /* ---------- обработка сообщения ---------- */

  function handle(text) {
    bubble('guest', text);
    history.push({ role: 'user', text: text });

    var res = AGENT.respond(text, ctx);
    render(res);

    if (mode === 'claude' && API.ready()) {
      var t = typing();
      API.ask(text, res, history).then(function (out) {
        t.remove();
        bubble('agent', out.reply, 'Claude · сценарий: ' + res.scenario + (out.usage ? ' · ' + (out.usage.input_tokens + out.usage.output_tokens) + ' токенов' : ''));
        history.push({ role: 'assistant', text: out.reply });
        if (out.note) {
          var blocks = insight.querySelectorAll('.block');
          var el = d.createElement('div');
          el.className = 'block';
          el.innerHTML = '<h3>Заметка модели</h3><div class="reason">' + esc(out.note) + '</div>';
          insight.insertBefore(el, blocks[blocks.length - 1]);
        }
      }).catch(function (e) {
        t.remove();
        bubble('sys', 'Claude недоступен: ' + e.message + '. Показываю ответ движка.');
        bubble('agent', res.reply, 'сценарий: ' + res.scenario);
        history.push({ role: 'assistant', text: res.reply });
      });
      return;
    }

    setTimeout(function () {
      bubble('agent', res.reply, 'сценарий: ' + res.scenario + ' · решение: ' + badgeFor(res.action)[1]);
      history.push({ role: 'assistant', text: res.reply });
    }, 160);
  }

  /* ---------- события ---------- */

  send.onclick = function () {
    var v = input.value.trim();
    if (!v) return;
    input.value = '';
    input.style.height = 'auto';
    handle(v);
  };

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send.click(); }
  });
  input.addEventListener('input', function () {
    input.style.height = 'auto';
    input.style.height = Math.min(140, input.scrollHeight) + 'px';
  });

  d.getElementById('mode').onclick = function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    mode = btn.dataset.mode;
    [].forEach.call(this.children, function (b) { b.classList.toggle('on', b === btn); });
    if (mode === 'claude' && !API.ready()) modal.classList.add('on');
  };

  d.getElementById('tabs').onclick = function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    [].forEach.call(this.children, function (b) { b.classList.toggle('on', b === btn); });
    d.getElementById('pane-chat').classList.toggle('off', btn.dataset.tab !== 'chat');
    d.getElementById('pane-insight').classList.toggle('off', btn.dataset.tab !== 'insight');
  };

  d.getElementById('reset').onclick = function () {
    ctx = AGENT.newContext({ channel: 'демо' });
    history = [];
    chat.innerHTML = '';
    insight.innerHTML = '<div class="block"><h3>Разбор запроса</h3><div class="empty">Новый диалог. Слоты и бронь очищены.</div></div>';
    hello();
  };

  d.getElementById('settings').onclick = function () { modal.classList.add('on'); };
  d.getElementById('cancel').onclick = function () { modal.classList.remove('on'); };
  d.getElementById('save').onclick = function () {
    API.save({ key: d.getElementById('key').value.trim(), model: d.getElementById('model').value });
    modal.classList.remove('on');
    bubble('sys', API.ready() ? 'Ключ сохранён. Режим «Движок + Claude» готов.' : 'Ключ очищен.');
  };

  /* ---------- старт ---------- */

  /* Свой фонд обычно подставляют выгрузкой — сразу показываем, если она битая */
  function checkCalendar() {
    var problems = KB.validate();
    if (!problems.length) return;
    bubble('sys', 'В календаре ' + problems.length + ' проблем(ы) — такие квартиры могут продаться дважды:\n' +
      problems.slice(0, 5).join('\n'));
  }

  function hello() {
    bubble('sys', 'Демо: слева вы пишете как гость, справа видно, что агент понял и почему так ответил.');
    bubble('agent', 'Здравствуйте! ' + KB.settings.brand + ' — ' + KB.settings.business + ' в ' + KB.settings.cityIn + '.\nНапишите даты и сколько гостей — подберу варианты с ценами.', 'сценарий: greeting');
  }

  (function init() {
    var chips = d.getElementById('chips');
    SAMPLES.forEach(function (s) {
      var b = d.createElement('button');
      b.textContent = s.length > 42 ? s.slice(0, 40) + '…' : s;
      b.title = s;
      b.onclick = function () { handle(s); };
      chips.appendChild(b);
    });

    var sel = d.getElementById('model');
    API.MODELS.forEach(function (m) {
      var o = d.createElement('option');
      o.value = m.id; o.textContent = m.title;
      sel.appendChild(o);
    });
    var cfg = API.load();
    if (cfg.key) d.getElementById('key').value = cfg.key;
    if (cfg.model) sel.value = cfg.model;

    hello();
    checkCalendar();
  })();

})(window, document);
