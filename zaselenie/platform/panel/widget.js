/* Чат-виджет для сайта. Подключение одной строкой:
   <script src="https://ваш-сервер/widget.js" data-title="Ключи 24"></script>
   Ни фреймворков, ни куки — только localStorage для номера диалога. */
(function () {
  'use strict';

  var script = document.currentScript;
  var base = script ? new URL(script.src).origin : '';
  var title = (script && script.dataset.title) || 'Бронирование';
  var hello = (script && script.dataset.hello) ||
    'Здравствуйте! Напишите даты и сколько гостей — подберу квартиру с ценами.';

  var KEY = 'zaselenie.widget.chat';
  var chatId = localStorage.getItem(KEY);
  if (!chatId) {
    chatId = 'web-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(KEY, chatId);
  }

  var css = document.createElement('style');
  css.textContent = [
    '.zsl-btn{position:fixed;right:20px;bottom:20px;z-index:99998;background:#c9a227;color:#15130a;border:0;',
    'border-radius:999px;padding:14px 20px;font:600 15px/1 Manrope,-apple-system,sans-serif;cursor:pointer;',
    'box-shadow:0 8px 28px rgba(0,0,0,.3);}',
    '.zsl-box{position:fixed;right:20px;bottom:20px;z-index:99999;width:min(380px,calc(100vw - 32px));',
    'height:min(560px,calc(100vh - 40px));background:#0d0f12;color:#eceef3;border:1px solid rgba(236,238,243,.12);',
    'border-radius:16px;display:none;flex-direction:column;overflow:hidden;font:14px/1.5 Manrope,-apple-system,sans-serif;',
    'box-shadow:0 20px 60px rgba(0,0,0,.45);}',
    '.zsl-box.on{display:flex;}',
    '.zsl-head{padding:13px 16px;border-bottom:1px solid rgba(236,238,243,.1);display:flex;align-items:center;gap:8px;}',
    '.zsl-head b{font-weight:600;flex:1;}',
    '.zsl-head button{background:none;border:0;color:rgba(236,238,243,.5);font-size:20px;cursor:pointer;line-height:1;}',
    '.zsl-thread{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:9px;}',
    '.zsl-msg{max-width:85%;padding:9px 12px;border-radius:12px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13.5px;}',
    '.zsl-msg.me{align-self:flex-end;background:#1b2027;}',
    '.zsl-msg.bot{align-self:flex-start;background:#111419;border:1px solid rgba(236,238,243,.1);}',
    '.zsl-msg.sys{align-self:center;color:rgba(236,238,243,.45);font-size:12px;}',
    '.zsl-form{display:flex;gap:8px;padding:12px;border-top:1px solid rgba(236,238,243,.1);}',
    '.zsl-form input{flex:1;background:#111419;border:1px solid rgba(236,238,243,.12);border-radius:10px;',
    'padding:10px 12px;color:inherit;font:inherit;outline:none;}',
    '.zsl-form button{background:#c9a227;border:0;border-radius:10px;padding:10px 14px;color:#15130a;font-weight:600;cursor:pointer;}'
  ].join('');
  document.head.appendChild(css);

  var btn = document.createElement('button');
  btn.className = 'zsl-btn';
  btn.textContent = 'Забронировать квартиру';

  var box = document.createElement('div');
  box.className = 'zsl-box';
  box.innerHTML =
    '<div class="zsl-head"><b>' + title + '</b><button type="button" aria-label="Закрыть">×</button></div>' +
    '<div class="zsl-thread"></div>' +
    '<form class="zsl-form"><input placeholder="Например: 12–15 ноября, нас трое" autocomplete="off"><button>→</button></form>';

  document.body.appendChild(btn);
  document.body.appendChild(box);

  var pullToken = sessionStorage.getItem('zaselenie.pull') || '';
  var seen = {}, poller = null;                 // какие сообщения уже показаны

  var thread = box.querySelector('.zsl-thread');
  var form = box.querySelector('.zsl-form');
  var input = box.querySelector('input');

  function add(text, who) {
    var el = document.createElement('div');
    el.className = 'zsl-msg ' + who;
    el.textContent = text;
    thread.appendChild(el);
    thread.scrollTop = thread.scrollHeight;
    return el;
  }

  /* Пока окно открыто, забираем то, что написали нам между нашими сообщениями:
     ответы менеджера приходят не в ответ на запрос гостя */
  function pull() {
    if (!pullToken) return;
    fetch(base + '/api/pull?chatId=' + encodeURIComponent(chatId) +
          '&token=' + encodeURIComponent(pullToken))
      .then(function (r) { return r.json(); })
      .then(function (out) {
        (out.messages || []).forEach(function (m) {
          if (seen[m.id]) return;
          seen[m.id] = true;
          add((m.from === 'manager' ? 'Менеджер: ' : '') + m.text, 'bot');
        });
      })
      .catch(function () {});
  }

  btn.onclick = function () {
    box.classList.add('on');
    btn.style.display = 'none';
    if (!thread.children.length) add(hello, 'bot');
    input.focus();
    if (!poller) poller = setInterval(pull, 4000);
    pull();
  };
  box.querySelector('.zsl-head button').onclick = function () {
    box.classList.remove('on');
    btn.style.display = '';
    if (poller) { clearInterval(poller); poller = null; }
  };

  form.onsubmit = function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    add(text, 'me');
    var wait = add('печатает…', 'sys');

    fetch(base + '/api/message', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'web', chatId: chatId, text: text })
    })
      .then(function (r) { return r.json(); })
      .then(function (out) {
        wait.remove();
        if (out.pullToken && out.pullToken !== pullToken) {
          pullToken = out.pullToken;
          sessionStorage.setItem('zaselenie.pull', pullToken);
        }
        if (out.messageId) seen[out.messageId] = true;
        if (out.reply) add(out.reply, 'bot');
        else if (out.silent) add('Менеджер подключился к диалогу и ответит здесь же.', 'sys');
        else if (out.error) add('Не смог ответить: ' + out.error, 'sys');
      })
      .catch(function () {
        wait.remove();
        add('Связь пропала. Попробуйте ещё раз или напишите нам в Telegram.', 'sys');
      });
  };
})();
