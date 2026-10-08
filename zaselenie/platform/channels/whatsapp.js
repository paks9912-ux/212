/* Канал: WhatsApp через официальный Cloud API (Meta). Сообщения приходят
   вебхуком, ответы уходим запросами в graph.facebook.com. Кнопки под
   вариантами — интерактивные reply-кнопки (WhatsApp разрешает не больше трёх),
   остальное — текст. Разговор, как и везде, ведёт ядро платформы. */
'use strict';

var crypto = require('crypto');

var API = 'https://graph.facebook.com/v21.0/';
var LIMIT = 4096;                                   // лимит текста в WhatsApp
var PICK = ['первый', 'второй', 'третий'];

/* ---------- вызовы API ---------- */

function call(cfg, path, payload) {
  return fetch(API + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.token },
    body: JSON.stringify(payload)
  }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (data) {
      if (!r.ok || data.error) {
        var err = new Error((data.error && data.error.message) || ('HTTP ' + r.status));
        err.code = data.error && data.error.code;
        throw err;
      }
      return data;
    });
  });
}

function chunks(text) {
  var out = [], rest = String(text);
  while (rest.length > LIMIT) {
    var cut = rest.lastIndexOf('\n', LIMIT);
    if (cut < LIMIT / 2) cut = LIMIT;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, '');
  }
  out.push(rest);
  return out;
}

/* Подпись вебхука: Meta шлёт sha256 от тела с секретом приложения */
function verifySignature(appSecret, rawBody, header) {
  if (!appSecret) return true;
  if (!header || header.indexOf('sha256=') !== 0) return false;
  var expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  var got = header.slice(7);
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

/* ---------- кнопки ---------- */

/* Названия кнопок в WhatsApp — до 20 символов, иначе API откажет */
function short(s, n) {
  s = String(s);
  return s.length <= n ? s : s.slice(0, n - 1).trim() + '…';
}

/* Возвращает список кнопок [{id, title}] или null; логика та же, что в Telegram */
function buttons(res) {
  var offers = res.analysis.match ? res.analysis.match.offers.slice(0, 3) : [];
  if (res.action === 'offer' && offers.length) {
    var list = offers.map(function (o, i) { return { id: 'pick:' + i, title: short('Беру: ' + o.object.title, 20) }; });
    if (list.length < 3) list.push({ id: 'human', title: 'Позвать менеджера' });
    return list;
  }
  if (res.action === 'hold') {
    return [{ id: 'q:мой номер — это номер этого WhatsApp', title: 'Писать на этот номер' },
            { id: 'human', title: 'Позвать менеджера' }];
  }
  if (res.action === 'decline' || res.escalate) return [{ id: 'human', title: 'Позвать менеджера' }];
  if (res.action === 'ask' && res.analysis.missing.indexOf('даты') >= 0) {
    return [{ id: 'q:сегодня на 1 ночь', title: 'На сегодня' },
            { id: 'q:завтра на 2 ночи', title: 'На завтра' },
            { id: 'q:на выходные', title: 'На выходные' }];
  }
  return null;
}

function textMessage(to, text) {
  return { messaging_product: 'whatsapp', to: to, type: 'text', text: { body: text, preview_url: false } };
}

function buttonMessage(to, text, list) {
  return {
    messaging_product: 'whatsapp', to: to, type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: text.slice(0, 1024) },             // у интерактивного сообщения тело короче
      action: { buttons: list.map(function (b) { return { type: 'reply', reply: { id: b.id, title: b.title } }; }) }
    }
  };
}

/* ---------- разбор вебхука ---------- */

/* Из одного вебхука может прийти несколько сообщений; статусы доставки пропускаем */
function parse(update) {
  var out = [];
  var entries = (update && update.entry) || [];
  entries.forEach(function (entry) {
    (entry.changes || []).forEach(function (change) {
      var v = change.value || {};
      if (v.messaging_product !== 'whatsapp') return;
      var names = {};
      (v.contacts || []).forEach(function (c) { names[c.wa_id] = c.profile && c.profile.name; });
      (v.messages || []).forEach(function (m) {
        var base = { chatId: m.from, messageId: m.id, user: { name: names[m.from] || null, phone: '+' + m.from } };
        switch (m.type) {
          case 'text':
            out.push(Object.assign(base, { kind: 'text', text: m.text.body }));
            break;
          case 'interactive':
            var r = m.interactive.button_reply || m.interactive.list_reply || {};
            out.push(Object.assign(base, { kind: 'callback', data: r.id || '', title: r.title || '' }));
            break;
          case 'button':                              // ответ на шаблонную кнопку
            out.push(Object.assign(base, { kind: 'callback', data: m.button.payload || m.button.text, title: m.button.text }));
            break;
          case 'contacts':
            var c = (m.contacts || [])[0] || {};
            var phone = ((c.phones || [])[0] || {}).phone || '';
            var name = (c.name && (c.name.formatted_name || c.name.first_name)) || '';
            out.push(Object.assign(base, { kind: 'contact', text: 'Меня зовут ' + name + ', телефон ' + phone }));
            break;
          case 'location':
            out.push(Object.assign(base, { kind: 'location', text: 'Прислал геопозицию' }));
            break;
          case 'image': case 'video': case 'document': case 'audio': case 'voice': case 'sticker':
            var caption = m[m.type] && m[m.type].caption;
            out.push(Object.assign(base, { kind: caption ? 'text' : 'media', text: caption || ('[' + m.type + ']') }));
            break;
          default:
            out.push(Object.assign(base, { kind: 'skip' }));
        }
      });
    });
  });
  return out;
}

/* Нажатие кнопки превращаем в реплику — те же фразы, что в Telegram */
function callbackText(data) {
  if (data.indexOf('pick:') === 0) return 'беру ' + (PICK[+data.slice(5)] || 'первый');
  if (data === 'dates') return 'подберите другие даты';
  if (data === 'human') return 'позовите человека';
  if (data.indexOf('q:') === 0) return data.slice(2);
  return data;
}

/* ---------- установка ---------- */

exports.install = function (core, opts) {
  var cfg = opts.cfg, log = opts.log || function () {};
  var wa = cfg.whatsapp || {};
  if (!wa.token || !wa.phoneId) { log('канал whatsapp выключен: нет WHATSAPP_TOKEN или WHATSAPP_PHONE_ID'); return null; }

  var seen = [];                                       // Meta может прислать одно сообщение дважды
  function duplicate(id) {
    if (!id) return false;
    if (seen.indexOf(id) >= 0) return true;
    seen.push(id);
    if (seen.length > 500) seen.shift();
    return false;
  }

  var adapter = {
    name: 'whatsapp',

    send: function (chatId, text, meta) {
      var list = meta && meta.res ? buttons(meta.res) : null;
      var parts = chunks(text);
      return parts.reduce(function (p, part, i) {
        return p.then(function () {
          var last = i === parts.length - 1;
          var payload = (last && list && part.length <= 1024) ? buttonMessage(chatId, part, list) : textMessage(chatId, part);
          return call(wa, wa.phoneId + '/messages', payload).then(function (r) {
            /* Кнопки не влезли в тело — шлём их отдельным коротким сообщением */
            if (last && list && part.length > 1024) {
              return call(wa, wa.phoneId + '/messages', buttonMessage(chatId, 'Выберите:', list));
            }
            return r;
          });
        });
      }, Promise.resolve());
    },

    /* Прочитано — гость видит две синие галочки */
    markRead: function (messageId) {
      return call(wa, wa.phoneId + '/messages', { messaging_product: 'whatsapp', status: 'read', message_id: messageId })
        .catch(function () {});
    },

    update: function (update) {
      var items = parse(update);
      var chain = Promise.resolve();
      items.forEach(function (incoming) {
        if (incoming.kind === 'skip' || !incoming.chatId || duplicate(incoming.messageId)) return;
        chain = chain.then(function () {
          adapter.markRead(incoming.messageId);
          var text = incoming.kind === 'callback' ? callbackText(incoming.data) : incoming.text;
          if (/^(здравствуйте|привет|салем|сәлем|hi|hello|start)[!. ]*$/i.test(text || '')) {
            core.contexts.delete('whatsapp:' + incoming.chatId);
          }
          return core.incoming({
            channel: 'whatsapp', chatId: incoming.chatId, text: text,
            user: { name: incoming.user.name, phone: incoming.user.phone }
          }).catch(function (e) { log('whatsapp: ' + e.message); });
        });
      });
      return chain;
    }
  };

  core.channel(adapter);
  log('whatsapp: канал подключен, номер ' + wa.phoneId);
  return adapter;
};

exports.parse = parse;
exports.buttons = buttons;
exports.chunks = chunks;
exports.callbackText = callbackText;
exports.verifySignature = verifySignature;
exports.buttonMessage = buttonMessage;
exports.textMessage = textMessage;
