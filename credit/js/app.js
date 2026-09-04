/* Запуск, навигация, модальные листы, действия */
(function (w) {
  'use strict';

  var App = {
    route: '#/',
    lastRoute: null,
    scrollMemo: {}
  };

  /* ---------- простая хэш-функция для кода-пароля ---------- */
  App.hash = function (s) {
    var h = 5381, str = 'kapital.' + s;
    for (var i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  };

  /* ---------- навигация ---------- */
  App.go = function (hash) {
    if (location.hash === hash) App.render();
    else location.hash = hash;
  };

  App.render = function () {
    var r = location.hash || '#/';
    App.route = r;
    var scr = U.$('#screen'), html = '';

    if (r.indexOf('#/loan/') === 0) html = V.loanDetail(r.slice(7));
    else if (r.indexOf('#/client/') === 0) html = V.clientDetail(r.slice(9));
    else if (r === '#/loans') html = V.loans();
    else if (r === '#/clients') html = V.clients();
    else if (r === '#/more') html = V.more();
    else html = V.home();

    scr.innerHTML = html;
    scr.querySelector('.wrap') && scr.querySelector('.wrap').classList.add('fade');

    if (r === '#/loans') {
      var fab = document.createElement('button');
      fab.className = 'fab'; fab.setAttribute('data-act', 'new-loan'); fab.textContent = '＋';
      scr.appendChild(fab);
    }

    /* активная вкладка */
    U.$$('.tabbar a').forEach(function (a) {
      var base = r.indexOf('#/loan/') === 0 ? '#/loans' : r.indexOf('#/client/') === 0 ? '#/clients' : r;
      a.classList.toggle('on', a.getAttribute('href') === base);
    });

    if (App.lastRoute !== r) { w.scrollTo(0, 0); App.lastRoute = r; }
    App.onScroll();
  };

  App.onScroll = function () {
    var tb = U.$('#topbar');
    if (tb) tb.classList.toggle('solid', w.scrollY > 26);
  };

  /* ---------- модальный лист ---------- */
  App.sheet = function (opt) {
    App.closeSheet(true);
    var bg = document.createElement('div');
    bg.className = 'sheet-bg';
    var sh = document.createElement('div');
    sh.className = 'sheet';
    sh.innerHTML = '<div class="grabber"></div>' +
      '<div class="sheet-hd"><button data-sheet="cancel">Отмена</button>' +
      '<span class="t">' + U.esc(opt.title || '') + '</span>' +
      (opt.save ? '<button class="strong" data-sheet="save">' + U.esc(opt.save) + '</button>'
        : '<span style="min-width:64px"></span>') + '</div>' +
      '<div class="sheet-bd"></div>';
    var bd = sh.querySelector('.sheet-bd');
    bd.innerHTML = opt.html || '';
    document.body.appendChild(bg);
    document.body.appendChild(sh);
    document.body.classList.add('no-scroll');

    requestAnimationFrame(function () { bg.classList.add('in'); sh.classList.add('in'); });

    bg.addEventListener('click', function () { App.closeSheet(); });
    sh.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sheet]');
      if (!b) return;
      if (b.dataset.sheet === 'cancel') return App.closeSheet();
      if (b.dataset.sheet === 'save') {
        if (!opt.onSave || opt.onSave(bd) !== false) App.closeSheet();
      }
    });
    App._sheet = { bg: bg, sh: sh };
    if (opt.onOpen) opt.onOpen(bd);
  };

  App.closeSheet = function (now) {
    var s = App._sheet;
    if (!s) return;
    App._sheet = null;
    document.body.classList.remove('no-scroll');
    if (now) { s.bg.remove(); s.sh.remove(); return; }
    s.bg.classList.remove('in'); s.sh.classList.remove('in');
    setTimeout(function () { s.bg.remove(); s.sh.remove(); }, 340);
  };

  /* ---------- сохранение файла ---------- */
  App.saveFile = function (name, text, mime) {
    try {
      if (w.File && navigator.canShare) {
        var f = new File([text], name, { type: mime });
        if (navigator.canShare({ files: [f] })) {
          navigator.share({ files: [f], title: name }).catch(function () { });
          return true;
        }
      }
    } catch (e) { }
    try {
      var blob = new Blob([text], { type: mime });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      return true;
    } catch (e) {
      U.toast('Не удалось сохранить файл');
      return false;
    }
  };

  /* ---------- действия ---------- */
  var ACTIONS = {
    back: function () { history.length > 1 ? history.back() : App.go('#/'); },
    loan: function (d) { App.go('#/loan/' + d.id); },
    client: function (d) { App.go('#/client/' + d.id); },
    'new-loan': function (d) { F.loanForm(null, d.client || null); },
    'edit-loan': function (d) { F.loanForm(d.id); },
    'new-client': function () { F.clientForm(); },
    'edit-client': function (d) { F.clientForm(d.id); },
    pay: function (d) { F.paymentForm(d.id); },
    'quick-pay': function () { F.quickPay(); },
    'go-import': function () { F.importSheet(); },
    import: function () { F.importSheet(); },

    'del-pay': function (d) {
      var l = DB.loan(d.id); if (!l) return;
      var p = l.payments.filter(function (x) { return x.id === d.pid; })[0];
      if (!p) return;
      if (!confirm('Удалить платёж ' + U.money(p.amount) + ' от ' + U.fmtDate(p.date, true) + '?')) return;
      DB.delPayment(d.id, d.pid); U.toast('Платёж удалён'); App.render();
    },
    'close-loan': function (d) {
      var r = CALC.loan(DB.loan(d.id));
      var msg = r.totalDue > 0.49
        ? 'Долг ещё ' + U.money(r.totalDue) + '. Всё равно закрыть заём (простить остаток)?'
        : 'Закрыть заём?';
      if (!confirm(msg)) return;
      DB.updLoan(d.id, { status: 'closed', closedAt: U.today() });
      U.toast('Заём закрыт'); App.render();
    },
    'reopen-loan': function (d) {
      DB.updLoan(d.id, { status: 'active', closedAt: null });
      U.toast('Заём снова активен'); App.render();
    },
    'del-loan': function (d) {
      if (!confirm('Удалить заём вместе со всеми платежами? Это нельзя отменить.')) return;
      DB.delLoan(d.id); U.toast('Заём удалён'); App.go('#/loans');
    },
    'del-client': function (d) {
      var n = DB.loansOf(d.id).length;
      if (!confirm('Удалить клиента' + (n ? ' и его займы (' + n + ')' : '') + '? Это нельзя отменить.')) return;
      DB.delClient(d.id); U.toast('Клиент удалён'); App.go('#/clients');
    },
    filter: function (d) { V.loansFilter = d.f; App.render(); },

    'export-json': function () {
      var name = 'kapital-' + U.today() + '.json';
      if (App.saveFile(name, DB.exportJSON(), 'application/json')) {
        DB.data.settings.lastExport = U.today(); DB.save();
        U.toast('Копия сохранена: ' + name);
        if (App.route === '#/more' || App.route === '#/') App.render();
      }
    },
    'export-csv': function () {
      var name = 'kapital-' + U.today() + '.csv';
      if (App.saveFile(name, DB.exportCSV(), 'text/csv;charset=utf-8')) U.toast('Таблица сохранена');
    },
    wipe: function () {
      if (!confirm('Стереть ВСЕ данные — клиентов, займы и платежи? Восстановить можно будет только из резервной копии.')) return;
      if (!confirm('Точно стереть? Последнее предупреждение.')) return;
      DB.data = DB.empty(); DB.save(); U.toast('Все данные стёрты'); App.go('#/');
    },
    pin: function () { F.pinSheet(); },
    'pin-off': function () {
      if (!confirm('Отключить код-пароль?')) return;
      DB.data.settings.pin = null; DB.save(); U.toast('Код отключён'); App.render();
    }
  };

  /* ---------- тема ---------- */
  App.applyTheme = function () {
    var t = DB.data.settings.theme || 'auto';
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    var meta = U.$('#theme-color');
    if (meta) {
      var dark = t === 'dark' || (t === 'auto' && w.matchMedia('(prefers-color-scheme:dark)').matches);
      meta.setAttribute('content', dark ? '#000000' : '#f2f2f7');
    }
  };

  /* ---------- экран блокировки ---------- */
  App.lock = function (done) {
    var buf = '';
    var el = document.createElement('div');
    el.className = 'lock';
    el.innerHTML = '<div style="font-size:44px">🔐</div>' +
      '<div style="font-size:19px;font-weight:600">Введите код</div>' +
      '<div class="pin-dots" id="dots"><i></i><i></i><i></i><i></i></div>' +
      '<div class="keypad" style="margin-top:8px">' +
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return '<button data-n="' + n + '">' + n + '</button>'; }).join('') +
      '<button class="blank"></button><button data-n="0">0</button>' +
      '<button data-n="del" style="font-size:20px">⌫</button></div>';
    document.body.appendChild(el);

    function draw() {
      U.$$('#dots i', el).forEach(function (d, i) { d.classList.toggle('on', i < buf.length); });
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-n]');
      if (!b) return;
      if (b.dataset.n === 'del') { buf = buf.slice(0, -1); draw(); return; }
      if (buf.length >= 4) return;
      buf += b.dataset.n;
      draw();
      if (buf.length === 4) {
        if (App.hash(buf) === DB.data.settings.pin) {
          el.style.opacity = '0';
          el.style.transition = 'opacity .25s';
          setTimeout(function () { el.remove(); }, 260);
          done();
        } else {
          el.classList.add('shake');
          setTimeout(function () { el.classList.remove('shake'); buf = ''; draw(); }, 420);
        }
      }
    });
  };

  /* ---------- старт ---------- */
  App.start = function () {
    DB.load();
    App.applyTheme();

    var run = function () {
      App.render();
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () { });
    };

    if (DB.data.settings.pin) App.lock(run);
    else run();

    w.addEventListener('hashchange', App.render);
    w.addEventListener('scroll', App.onScroll, { passive: true });
    w.matchMedia('(prefers-color-scheme:dark)').addEventListener('change', App.applyTheme);

    /* сутки могли смениться, пока приложение висело в фоне */
    var day = U.today();
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && U.today() !== day) { day = U.today(); App.render(); }
    });

    /* делегирование кликов */
    document.addEventListener('click', function (e) {
      if (e.target.closest('.sheet')) return;
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = ACTIONS[b.dataset.act];
      if (act) { e.preventDefault(); act(b.dataset, b); }
    });

    /* поиск и настройки */
    var tmr;
    document.addEventListener('input', function (e) {
      if (e.target.closest('.sheet')) return;
      var t = e.target;
      if (t.id === 'q' || t.id === 'qc') {
        var key = t.id === 'q' ? 'loansQuery' : 'clientsQuery';
        V[key] = t.value;
        clearTimeout(tmr);
        tmr = setTimeout(function () {
          App.render();
          var i = U.$('#' + t.id);
          if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
        }, 160);
      }
    });
    document.addEventListener('change', function (e) {
      if (e.target.closest('.sheet')) return;
      var t = e.target;
      if (t.dataset && t.dataset.act === 'set') {
        var k = t.dataset.k;
        var v = ['defaultRate', 'defaultTerm', 'penaltyRate'].indexOf(k) >= 0 ? U.num(t.value) : t.value;
        DB.data.settings[k] = v;
        DB.save();
        if (k === 'theme') App.applyTheme();
        if (k === 'currency' || k === 'theme') App.render();
        U.toast('Сохранено');
      }
    });

    /* офлайн-кэш */
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(function () { });
    }
  };

  w.App = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', App.start);
  else App.start();
})(window);
