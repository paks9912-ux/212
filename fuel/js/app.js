/* Запуск, навигация, модальные листы, действия */
(function (w) {
  'use strict';

  var App = { route: '#/', lastRoute: null };

  /* ---------- простая хэш-функция для кода-пароля ---------- */
  App.hash = function (s) {
    var h = 5381, str = 'toplivo.' + s;
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

    if (r.indexOf('#/unit/') === 0) html = V.unitDetail(r.slice(7));
    else if (r === '#/units') html = V.units();
    else if (r === '#/tank') html = V.tank();
    else if (r === '#/more') html = V.more();
    else html = V.home();

    scr.innerHTML = html;
    var wrap = scr.querySelector('.wrap');
    if (wrap) wrap.classList.add('fade');

    /* панель действия внизу — главное действие экрана всегда под большим пальцем */
    var action = null;
    if (r === '#/' || r === '#/units') action = ['new-fill', 'Записать заправку'];
    else if (r === '#/tank') action = ['new-supply', 'Внести приход'];
    else if (r.indexOf('#/unit/') === 0) action = ['new-fill', 'Записать заправку'];
    if (action && DB.units().length) {
      var bar = document.createElement('div');
      bar.className = 'actionbar';
      bar.innerHTML = '<button class="btn big" data-act="' + action[0] + '"' +
        (r.indexOf('#/unit/') === 0 ? ' data-unit="' + r.slice(7) + '"' : '') + '>＋ ' + action[1] + '</button>';
      scr.appendChild(bar);
    }

    U.$$('.nav a').forEach(function (a) {
      var base = r.indexOf('#/unit/') === 0 ? '#/units' : r;
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
    sh.innerHTML = '<div class="grab"></div>' +
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

  /* ---------- диалог подтверждения (вместо системного confirm) ---------- */
  App.ask = function (opt) {
    var bg = document.createElement('div');
    bg.className = 'ask-bg';
    bg.innerHTML = '<div class="ask"><div class="ask-t">' + U.esc(opt.title) + '</div>' +
      (opt.text ? '<div class="ask-d">' + U.esc(opt.text) + '</div>' : '<div style="height:16px"></div>') +
      '<div class="ask-btns"><button data-a="no">' + U.esc(opt.cancel || 'Отмена') + '</button>' +
      '<button data-a="yes" class="' + (opt.danger ? 'danger' : 'go') + '">' + U.esc(opt.ok || 'Да') + '</button></div></div>';
    document.body.appendChild(bg);
    requestAnimationFrame(function () { bg.classList.add('in'); });

    function close(yes) {
      bg.classList.remove('in');
      setTimeout(function () { bg.remove(); }, 220);
      if (yes && opt.onOk) opt.onOk();
      if (!yes && opt.onCancel) opt.onCancel();
    }
    bg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]');
      if (b) return close(b.dataset.a === 'yes');
      if (e.target === bg) close(false);
    });
  };

  /* ---------- отправить текст ---------- */
  App.shareText = function (text) {
    if (navigator.share) {
      navigator.share({ text: text }).catch(function () { });
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { U.toast('Отчёт скопирован'); })
        .catch(function () { U.toast('Скопируйте текст вручную'); });
      return;
    }
    U.toast('Скопируйте текст вручную');
  };

  /* ---------- сохранение файла ----------
     Порядок попыток: среда Artifact (claude.use) → «Поделиться» на iOS →
     обычное скачивание → показать текст для копирования вручную.     */
  App.saveFile = function (name, text, mime, done) {
    done = done || function () { };

    if (w.claude && typeof w.claude.use === 'function') {
      App._dlp = App._dlp || w.claude.use('downloads');
      App._dlp.then(function (dl) {
        if (!dl) return App.copyFallback(name, text, done);
        dl.save({ filename: name, data: text })
          .then(function () { done(true); })
          .catch(function (e) {
            if (e && e.code === 'declined') { done(false); return; }
            App.copyFallback(name, text, done);
          });
      }, function () { App.copyFallback(name, text, done); });
      return;
    }

    try {
      if (w.File && navigator.canShare) {
        var f = new File([text], name, { type: mime });
        if (navigator.canShare({ files: [f] })) {
          navigator.share({ files: [f], title: name })
            .then(function () { done(true); })
            .catch(function () { done(false); });
          return;
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
      done(true);
      return;
    } catch (e) { }

    App.copyFallback(name, text, done);
  };

  App.copyFallback = function (name, text, done) {
    App.sheet({
      title: 'Скопируйте копию',
      save: null,
      html: '<div class="note" style="padding:0 2px 12px">Здесь сохранить файл нельзя. Скопируйте текст и вставьте его в заметку или мессенджер — из него база восстанавливается целиком через «Загрузить базу».</div>' +
        '<button class="btn" id="cp">Скопировать всё</button>' +
        '<div class="form" style="margin-top:12px"><div class="fld col">' +
        '<label>' + U.esc(name) + '</label>' +
        '<textarea id="dump" readonly style="min-height:220px;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace"></textarea>' +
        '</div></div>',
      onOpen: function (bd) {
        var ta = bd.querySelector('#dump');
        ta.value = text;
        bd.querySelector('#cp').addEventListener('click', function () {
          ta.focus(); ta.setSelectionRange(0, ta.value.length);
          var ok = false;
          try { ok = document.execCommand('copy'); } catch (e) { }
          if (ok) { U.toast('Скопировано'); done(true); return; }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text)
              .then(function () { U.toast('Скопировано'); done(true); })
              .catch(function () { U.toast('Скопируйте выделенный текст вручную'); });
          } else {
            U.toast('Скопируйте выделенный текст вручную');
          }
        });
      }
    });
  };

  /* ---------- действия ---------- */
  var ACTIONS = {
    back: function () { history.length > 1 ? history.back() : App.go('#/'); },
    unit: function (d) { App.go('#/unit/' + d.id); },
    'go-tank': function () { App.go('#/tank'); },
    filter: function (d) { V.unitsFilter = d.f; App.render(); },

    'new-fill': function (d) { F.fillForm({ unitId: d.unit || null }); },
    'edit-fill': function (d) { F.fillForm({ id: d.id }); },
    'repeat-fill': function (d) {
      var last = DB.lastFill(d.unit);
      if (!last) return F.fillForm({ unitId: d.unit });
      F.fillForm({ unitId: d.unit, preset: last });
    },

    'new-unit': function () { F.unitForm(); },
    'edit-unit': function (d) { F.unitForm(d.id); },
    'del-unit': function (d) {
      var u = DB.unit(d.id);
      if (!u) return;
      var n = DB.fillsOf(d.id).length;
      App.ask({
        title: 'Удалить ' + u.name + '?',
        text: n ? 'Вместе со всеми заправками (' + n + '). Остаток в бочке пересчитается. Отменить это будет нельзя.'
          : 'Отменить это будет нельзя.',
        ok: 'Удалить', danger: true,
        onOk: function () { DB.delUnit(d.id); U.toast('Техника удалена'); App.go('#/units'); }
      });
    },
    'service-done': function (d) {
      var u = DB.unit(d.id);
      if (!u || !u.service) return;
      var s = CALC.unit(u);
      App.ask({
        title: 'Отметить ТО?',
        text: 'Отсчёт до следующего пойдёт от текущего показания — ' + U.meter(s.meterNow, u.meter) + '.',
        ok: 'Отметить',
        onOk: function () {
          DB.updUnit(u.id, { service: Object.assign({}, u.service, { lastMeter: s.meterNow, lastDate: U.today() }) });
          U.toast('ТО отмечено');
          App.render();
        }
      });
    },

    'new-supply': function () { F.supplyForm(); },
    'del-supply': function (d) {
      var s = DB.data.supplies.filter(function (x) { return x.id === d.id; })[0];
      if (!s) return;
      App.ask({
        title: 'Удалить приход?',
        text: U.liters(s.liters) + ' от ' + U.fmtDateFull(s.date) + '. Остаток в бочке пересчитается.',
        ok: 'Удалить', danger: true,
        onOk: function () { DB.delSupply(d.id); U.toast('Приход удалён'); App.render(); }
      });
    },
    'new-check': function () { F.checkForm(); },
    'del-check': function (d) {
      App.ask({
        title: 'Удалить замер?',
        text: 'Остаток снова будет считаться от прихода и выдач.',
        ok: 'Удалить', danger: true,
        onOk: function () { DB.delCheck(d.id); U.toast('Замер удалён'); App.render(); }
      });
    },

    report: function (d) { F.reportSheet(d.m || U.monthKey(U.today())); },
    import: function () { F.importSheet(); },

    demo: function () {
      DB.data = DB.demo(); DB.save();
      U.toast('Загружен пример: 5 единиц техники, заправки за 2 месяца');
      App.go('#/');
    },
    'demo-off': function () {
      App.ask({
        title: 'Очистить пример?',
        text: 'Демонстрационная техника и заправки будут удалены, приложение станет пустым.',
        ok: 'Очистить',
        onOk: function () { DB.data = DB.empty(); DB.save(); U.toast('Готово — можно заносить своё'); App.go('#/'); }
      });
    },

    'export-json': function () {
      var name = 'toplivo-' + U.today() + '.json';
      App.saveFile(name, DB.exportJSON(), 'application/json', function (ok) {
        if (!ok) return;
        DB.data.settings.lastExport = U.today(); DB.save();
        U.toast('Копия сохранена: ' + name);
        if (App.route === '#/more') App.render();
      });
    },
    'export-csv': function () {
      App.saveFile('toplivo-' + U.today() + '.csv', DB.exportCSV(), 'text/csv;charset=utf-8',
        function (ok) { if (ok) U.toast('Таблица сохранена'); });
    },
    wipe: function () {
      App.ask({
        title: 'Стереть все данные?',
        text: 'Техника, заправки и приход топлива будут удалены. Восстановить их можно будет только из резервной копии.',
        ok: 'Стереть', danger: true,
        onOk: function () {
          App.ask({
            title: 'Точно стереть?', text: 'Последнее предупреждение.',
            ok: 'Да, стереть', danger: true,
            onOk: function () { DB.data = DB.empty(); DB.save(); U.toast('Все данные стёрты'); App.go('#/'); }
          });
        }
      });
    },
    pin: function () { F.pinSheet(); },
    'pin-off': function () {
      App.ask({
        title: 'Отключить код-пароль?',
        text: 'Приложение будет открываться без кода.',
        ok: 'Отключить',
        onOk: function () { DB.data.settings.pin = null; DB.save(); U.toast('Код отключён'); App.render(); }
      });
    }
  };

  /* ---------- тема ---------- */
  App.applyTheme = function () {
    var t = DB.data.settings.theme || 'auto';
    document.documentElement.setAttribute('data-theme', t);
    var meta = U.$('#theme-color');
    if (meta) {
      var light = t === 'light' || (t === 'auto' && w.matchMedia('(prefers-color-scheme:light)').matches);
      meta.setAttribute('content', light ? '#eceef1' : '#0c0e11');
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

    document.addEventListener('click', function (e) {
      if (e.target.closest('.sheet')) return;
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = ACTIONS[b.dataset.act];
      if (act) { e.preventDefault(); act(b.dataset, b); }
    });

    var tmr;
    document.addEventListener('input', function (e) {
      if (e.target.closest('.sheet')) return;
      if (e.target.id !== 'qu') return;
      V.unitsQuery = e.target.value;
      clearTimeout(tmr);
      tmr = setTimeout(function () {
        App.render();
        var i = U.$('#qu');
        if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
      }, 160);
    });

    document.addEventListener('change', function (e) {
      if (e.target.closest('.sheet')) return;
      var t = e.target;
      if (t.dataset && t.dataset.act === 'set') {
        var k = t.dataset.k;
        var v = ['overrun', 'lowDays'].indexOf(k) >= 0 ? U.num(t.value) : t.value;
        DB.data.settings[k] = v;
        DB.save();
        if (k === 'theme') App.applyTheme();
        App.render();
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
