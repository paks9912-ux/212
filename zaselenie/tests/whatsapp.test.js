/* Канал WhatsApp: node zaselenie/tests/whatsapp.test.js
   Разбор вебхука, кнопки, подпись и полный ход до брони — на подставном fetch,
   без обращения к Meta. */
var T = require('./helper.js');
var os = require('os');
var path = require('path');
var crypto = require('crypto');

var Store = require('../platform/store.js');
var Core = require('../platform/core.js');
var WA = require('../platform/channels/whatsapp.js');

/* Подставной Cloud API: запоминает, что отправили */
var sent = [];
global.fetch = function (url, opts) {
  sent.push({ url: url, body: JSON.parse(opts.body) });
  return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ messages: [{ id: 'wamid.out' }] }); } });
};

function webhook(msg, name) {
  return { object: 'whatsapp_business_account', entry: [{ id: '1', changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp', metadata: { phone_number_id: '555' },
    contacts: [{ wa_id: '77015551234', profile: { name: name || 'Айгерим' } }],
    messages: [Object.assign({ from: '77015551234', id: 'wamid.' + Math.random().toString(36).slice(2), timestamp: '1' }, msg)]
  } }] }] };
}

T.head('Разбор вебхука:');
(function () {
  var t = WA.parse(webhook({ type: 'text', text: { body: 'нужна квартира' } }))[0];
  T.eq('текст', t.kind, 'text');
  T.eq('номер гостя становится chatId', t.chatId, '77015551234');
  T.eq('имя из профиля', t.user.name, 'Айгерим');
  T.eq('телефон с плюсом', t.user.phone, '+77015551234');

  var b = WA.parse(webhook({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'pick:1', title: 'Беру: Лофт' } } }))[0];
  T.eq('нажатие кнопки', b.kind, 'callback');
  T.eq('превращается в реплику', WA.callbackText(b.data), 'беру второй');
  T.eq('«позвать менеджера»', WA.callbackText('human'), 'позовите человека');
  T.eq('быстрый ответ', WA.callbackText('q:на выходные'), 'на выходные');

  var c = WA.parse(webhook({ type: 'contacts', contacts: [{ name: { formatted_name: 'Ержан Б.' }, phones: [{ phone: '+7 777 000-00-00' }] }] }))[0];
  T.eq('визитка → имя и телефон', c.text, 'Меня зовут Ержан Б., телефон +7 777 000-00-00');

  var p = WA.parse(webhook({ type: 'image', image: { id: 'x', caption: 'вот паспорт' } }))[0];
  T.eq('подпись к фото читается как текст', p.text, 'вот паспорт');
  var v = WA.parse(webhook({ type: 'audio', audio: { id: 'x' } }))[0];
  T.eq('голосовое без текста — медиа', v.kind, 'media');

  var statuses = WA.parse({ entry: [{ changes: [{ value: { messaging_product: 'whatsapp', statuses: [{ id: 'x', status: 'delivered' }] } }] }] });
  T.eq('статусы доставки не считаются сообщениями', statuses.length, 0);
  T.eq('пустой апдейт не роняет', WA.parse({}).length, 0);
})();

T.head('Подпись и кнопки:');
(function () {
  var raw = '{"a":1}';
  var sig = 'sha256=' + crypto.createHmac('sha256', 'secret').update(raw).digest('hex');
  T.eq('верная подпись проходит', WA.verifySignature('secret', raw, sig), true);
  T.eq('чужая — нет', WA.verifySignature('secret', raw, 'sha256=' + '0'.repeat(64)), false);
  T.eq('без заголовка — нет', WA.verifySignature('secret', raw, undefined), false);
  T.eq('без секрета проверка выключена', WA.verifySignature('', raw, undefined), true);

  var ctx = AGENT.newContext();
  var res = AGENT.respond('с 10 по 13 марта, нас двое', ctx);
  var btns = WA.buttons(res);
  T.is('под вариантами — кнопки', btns && btns.length >= 1, btns);
  T.is('не больше трёх — лимит WhatsApp', btns.length <= 3, btns.length);
  T.is('заголовки до 20 символов', btns.every(function (b) { return b.title.length <= 20; }), btns.map(function (b) { return b.title; }));
  var msg = WA.buttonMessage('77015551234', 'Выберите', btns);
  T.eq('интерактивное сообщение собирается', msg.interactive.type, 'button');
  T.eq('кнопки с reply-id', msg.interactive.action.buttons[0].reply.id, 'pick:0');

  var long = new Array(5000).join('а');
  T.eq('длинный текст режется', WA.chunks(long).length, 2);
  T.eq('без потерь', WA.chunks(long).join('').length, long.length);
})();

T.head('Ход до брони через платформу:');
(function () {
  var store = new Store(path.join(os.tmpdir(), 'zaselenie-wa-' + Date.now()));
  var core = new Core({ store: store, log: function () {} });
  var adapter = WA.install(core, { cfg: { whatsapp: { token: 'tok', phoneId: '555' } } });
  T.is('канал поднялся', !!adapter, adapter);
  T.eq('и зарегистрирован в ядре', core.channels.whatsapp, adapter);

  var none = WA.install(core, { cfg: { whatsapp: {} } });
  T.eq('без токена канал выключен, а не падает', none, null);

  sent.length = 0;
  var u1 = webhook({ type: 'text', text: { body: 'с 10 по 13 марта, нас двое' } });
  return adapter.update(u1).then(function () {
    var outs = sent.filter(function (s) { return !s.body.status; });
    T.is('гость получил ответ', outs.length >= 1, sent.length);
    T.eq('ответ ушёл на номер гостя', outs[0].body.to, '77015551234');
    T.eq('с интерактивными кнопками', outs[outs.length - 1].body.type, 'interactive');
    T.is('входящее помечено прочитанным', sent.some(function (s) { return s.body.status === 'read'; }), true);
    var d = store.dialog('whatsapp', '77015551234');
    T.eq('диалог в хранилище с телефоном', d.guest.phone, '+77015551234');

    sent.length = 0;
    return adapter.update(webhook({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'pick:0', title: 'Беру' } } }));
  }).then(function () {
    var text = sent.filter(function (s) { return !s.body.status; }).map(function (s) {
      return s.body.type === 'interactive' ? s.body.interactive.body.text : s.body.text.body;
    }).join('\n');
    T.is('кнопка «Беру» ведёт к расчёту', /предоплат/i.test(text), text.slice(0, 80));
    T.is('бронь в удержании', store.bookings().length === 1, store.bookings().length);

    /* Одно и то же сообщение дважды — Meta так делает при повторной доставке */
    sent.length = 0;
    var dup = webhook({ type: 'text', text: { body: 'а парковка есть?' } });
    return adapter.update(dup).then(function () { return adapter.update(dup); });
  }).then(function () {
    var replies = sent.filter(function (s) { return !s.body.status; }).length;
    T.eq('повтор того же сообщения не отвечает дважды', replies, 1);
  });
})()

.then(function () { T.done(); process.exit(process.exitCode || 0); })
.catch(function (e) { console.error(e); process.exit(1); });
