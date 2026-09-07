/* Меню на телефоне и отправка формы. Без библиотек. */
(function () {
  'use strict';

  /* бургер */
  var burger = document.querySelector('[data-burger]');
  var nav = document.getElementById('nav');
  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) { nav.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); }
    });
  }

  /* форма: проверка, защита от ботов, отправка JSON на data-endpoint */
  var form = document.querySelector('.form');
  if (!form) return;
  var status = form.querySelector('.form__status');
  var endpoint = form.getAttribute('data-endpoint') || '';

  function say(text, cls) { status.textContent = text; status.className = 'form__status ' + (cls || ''); }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var bad = false;
    form.querySelectorAll('[required]').forEach(function (el) {
      var ok = el.value.trim().length > 0 && (el.type !== 'tel' || el.value.replace(/\D/g, '').length >= 9);
      el.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if (!ok) bad = true;
    });
    if (bad) { say('Проверьте имя и телефон', 'err'); return; }
    if (form.website && form.website.value) { say('Спасибо, заявка принята', 'ok'); return; }   // бот заполнил ловушку
    if (!endpoint) { say('Форма не подключена: укажите data-endpoint', 'err'); return; }

    var btn = form.querySelector('button[type=submit]');
    btn.disabled = true; say('Отправляем…');
    var data = { name: form.name.value.trim(), phone: form.phone.value.trim(), message: (form.message && form.message.value.trim()) || '', page: location.href, at: new Date().toISOString() };
    fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); say('Спасибо, перезвоним в течение 15 минут', 'ok'); form.reset(); })
      .catch(function () { say('Не отправилось. Позвоните нам или напишите в Telegram', 'err'); })
      .then(function () { btn.disabled = false; });
  });
})();
