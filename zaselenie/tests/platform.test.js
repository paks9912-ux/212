/* Платформа: node zaselenie/tests/platform.test.js
   Хранилище, ядро, HTTP-API и обратный канал виджета — на подставных каналах. */
var T = require('./helper.js');
var os = require('os');
var path = require('path');
var fs = require('fs');

var Store = require('../platform/store.js');
var Core = require('../platform/core.js');

function tmp(name) {
  var dir = path.join(os.tmpdir(), 'zaselenie-test-' + name + '-' + Date.now());
  return dir;
}

T.head('Хранилище:');
(function () {
  var store = new Store(tmp('store'));
  var d = store.dialog('web', 'u1', { lastText: 'привет' });
  T.eq('диалог заводится один раз', store.dialog('web', 'u1').id, d.id);
  T.eq('идентификатор из канала и чата', d.id, 'web:u1');

  store.message(d.id, 'guest', 'нужна квартира');
  store.message(d.id, 'agent', 'на какие даты?');
  T.eq('история пишется', store.history(d.id).length, 2);

  var b = store.booking(d.id, { objectId: 'loft-expo', from: '2026-10-01', to: '2026-10-03', total: 1000000 });
  T.eq('бронь создаётся в удержании', b.status, 'удержание');
  store.booking(d.id, { status: 'ждёт оплату' });
  T.eq('повторный вызов обновляет ту же бронь', store.bookings().length, 1);
  T.eq('и меняет статус', store.bookings()[0].status, 'ждёт оплату');

  T.eq('произвольный статус не проходит', store.setStatus(b.id, 'что-то своё'), null);
  store.setStatus(b.id, 'подтверждена', 'Азиз');
  T.eq('история статусов ведётся', store.bookingById(b.id).history.length, 2);
  T.eq('и хранит, кто менял', store.bookingById(b.id).history[1].by, 'Азиз');

  var got = [];
  store.on(function (e) { got.push(e.type); });
  store.dialog('telegram', '55');
  T.is('подписчики получают события', got.indexOf('dialog:new') >= 0, got);

  store.save();
  var again = new Store(store.dir);
  T.eq('данные переживают перезапуск', again.bookings().length, 1);
  T.eq('и диалоги тоже', again.dialogs().length, 2);
})();

T.head('Ядро: один вход для любого канала:');
(function () {
  var store = new Store(tmp('core'));
  var sent = [];
  var core = new Core({ store: store, log: function () {} });
  core.channel({ name: 'web', send: function (chatId, text) { sent.push([chatId, text]); return true; } });
  core.channel({ name: 'avito', send: function (chatId, text) { sent.push(['avito:' + chatId, text]); return true; } });

  return core.incoming({ channel: 'web', chatId: 'g1', text: 'с 10 по 13 марта, нас двое' })
    .then(function (r) {
      T.eq('заявка разобрана', r.res.scenario, 'full-request');
      T.eq('ответ ушёл в канал гостя', sent.length, 1);
      return core.incoming({ channel: 'web', chatId: 'g1', text: 'беру первый' });
    })
    .then(function (r) {
      T.eq('выбор варианта — удержание', r.res.action, 'hold');
      T.eq('бронь появилась в хранилище', store.bookings().length, 1);
      T.eq('и удержание в общем реестре', core.holds().length, 1);
      return core.incoming({ channel: 'avito', chatId: 'g2', text: 'с 10 по 13 марта, нас двое' });
    })
    .then(function (r) {
      T.eq('гость из другого канала обслуживается тем же ядром', r.res.scenario, 'full-request');
      var heldId = store.bookings()[0].objectId;
      T.is('но удержанную квартиру ему не предлагают',
        r.res.analysis.match.offers.every(function (o) { return o.object.id !== heldId; }), heldId);
      T.eq('диалоги разделены по каналам', store.dialogs().length, 2);
      return core.incoming({ channel: 'web', chatId: 'g3', text: 'я перевёл лишнее, верните на другую карту' });
    })
    .then(function (r) {
      T.is('мошенничество помечает диалог', store.dialogById('web:g3').escalated, true);
      T.eq('и попадает в фильтр эскалаций', store.dialogs('эскалации').length, 1);

      core.takeover('web:g3', 'Азиз');
      T.eq('менеджер забирает диалог', store.dialogById('web:g3').mode, 'менеджер');
      return core.incoming({ channel: 'web', chatId: 'g3', text: 'ну что там?' });
    })
    .then(function (r) {
      T.eq('под менеджером бот молчит', r.silent, true);
      T.eq('но сообщение сохраняется', store.history('web:g3').pop().text, 'ну что там?');
      return core.managerReply('web:g3', 'Это Азиз, проверяю платёж');
    })
    .then(function () {
      T.eq('ответ менеджера в истории', store.history('web:g3').pop().from, 'manager');
      core.release('web:g3');
      T.eq('после возврата боту метка эскалации снята', store.dialogById('web:g3').escalated, false);
    });
})()

.then(function () {
  T.head('HTTP-интерфейс:');
  process.env.MANAGER_TOKEN = 'test-token';
  process.env.DATA_DIR = tmp('http');
  var platform = require('../platform/server.js');
  var srv = platform.server;

  return new Promise(function (ok) { srv.listen(0, ok); }).then(function () {
    var port = srv.address().port;
    var base = 'http://127.0.0.1:' + port;
    function call(method, p, body, token) {
      return fetch(base + p, {
        method: method,
        headers: { 'content-type': 'application/json', 'x-token': token || '' },
        body: body ? JSON.stringify(body) : undefined
      }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
    }

    var pullToken = null;
    return call('GET', '/api/health')
      .then(function (r) { T.eq('проверка здоровья отвечает', r.status, 200); })
      .then(function () { return call('POST', '/api/message', { channel: 'web', chatId: 'w1', text: 'с 10 по 13 марта, нас двое' }); })
      .then(function (r) {
        T.eq('канал пишет без токена менеджера', r.status, 200);
        T.is('и получает ответ', r.body.reply.length > 0, true);
        T.is('вместе с подписью обратного канала', !!r.body.pullToken, true);
        pullToken = r.body.pullToken;
      })
      .then(function () { return call('GET', '/api/dialogs'); })
      .then(function (r) { T.eq('данные без токена закрыты', r.status, 401); })
      .then(function () { return call('GET', '/api/dialogs', null, 'test-token'); })
      .then(function (r) { T.eq('с токеном открыты', r.body.length, 1); })
      .then(function () { return call('POST', '/api/dialogs/' + encodeURIComponent('web:w1') + '/takeover', { who: 'Азиз' }, 'test-token'); })
      .then(function (r) { T.eq('менеджер забирает диалог через API', r.body.mode, 'менеджер'); })
      .then(function () { return call('POST', '/api/dialogs/' + encodeURIComponent('web:w1') + '/reply', { text: 'Это Азиз' }, 'test-token'); })
      .then(function (r) { T.eq('и отвечает гостю', r.body.ok, true); })
      .then(function () { return fetch(base + '/api/pull?chatId=w1&token=' + pullToken).then(function (x) { return x.json(); }); })
      .then(function (r) {
        T.is('гость забирает ответ менеджера обратным каналом',
          r.messages.some(function (m) { return m.from === 'manager' && /Это Азиз/.test(m.text); }), r.messages.length);
        T.is('и каждое сообщение имеет идентификатор',
          r.messages.every(function (m) { return !!m.id; }), true);
      })
      .then(function () { return fetch(base + '/api/pull?chatId=w1&token=подделка').then(function (x) { return x.status; }); })
      .then(function (code) { T.eq('чужую переписку по подобранному chatId не прочитать', code, 403); })
      .then(function () { return call('GET', '/api/bookings', null, 'test-token'); })
      .then(function (r) { T.eq('брони видны менеджеру', r.body.length >= 0, true); })
      .then(function () { return call('POST', '/api/message', { channel: 'avito', chatId: 'a1', text: 'привет' }); })
      .then(function (r) { T.eq('новый канал работает без единой строки кода', r.status, 200); })
      .then(function () { srv.close(); srv.unref && srv.unref(); });
  });
})

.then(function () { T.done(); process.exit(process.exitCode || 0); })
.catch(function (e) { console.error(e); process.exit(1); });
