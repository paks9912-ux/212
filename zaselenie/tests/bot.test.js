/* Телеграм-слой: node zaselenie/tests/bot.test.js
   Транспорт подменён — проверяем, что именно бот отправил бы в Telegram. */
var T = require('./helper.js');
var os = require('os');
var path = require('path');
var fs = require('fs');

var cfg = require('../bot/config.js');
cfg.token = 'test';
cfg.managerChat = '777';
cfg.rateLimit = 5;

var Store = require('../bot/sessions.js');
var TG = require('../bot/telegram.js');

var sent = [];
function fakeCall(method, params) {
  sent.push({ method: method, params: params });
  return Promise.resolve({ message_id: sent.length, username: 'test_bot' });
}
var noLlm = { ready: function () { return false; } };

var file = path.join(os.tmpdir(), 'zaselenie-test-sessions.json');
if (fs.existsSync(file)) fs.unlinkSync(file);

function newBot() {
  sent = [];
  var sessions = new Store(file, 48).attach(KB, AGENT);
  return { bot: TG.createBot({ call: fakeCall, sessions: sessions, claude: noLlm, log: function () {} }), sessions: sessions };
}

function msg(chatId, text, extra) {
  return { update_id: Math.random(), message: Object.assign({
    message_id: 1, chat: { id: chatId, type: 'private' },
    from: { id: chatId, first_name: 'Азиз', username: 'aziz' }, text: text
  }, extra || {}) };
}

function texts() { return sent.filter(function (s) { return s.method === 'sendMessage'; }); }
function toGuest(chatId) {
  return texts().filter(function (s) { return String(s.params.chat_id) === String(chatId); });
}

T.head('Разбор апдейтов:');
T.eq('текст', TG.parse(msg(1, 'привет')).kind, 'text');
T.eq('команда', TG.parse(msg(1, '/start')).command, '/start');
T.eq('голосовое без текста', TG.parse(msg(1, '', { text: undefined, voice: { duration: 3 } })).text, '[голосовое]');
T.eq('подпись к фото читается как текст',
  TG.parse(msg(1, '', { text: undefined, photo: [{}], caption: 'нас двое' })).text, 'нас двое');
T.eq('контакт превращается в имя и телефон',
  /Азиз, телефон \+998901234567/.test(TG.parse(msg(1, '', { text: undefined, contact: { first_name: 'Азиз', phone_number: '998901234567' } })).text), true);
T.eq('нажатие кнопки', TG.parse({ callback_query: { id: 'c1', data: 'pick:1', from: { id: 1 }, message: { chat: { id: 1 } } } }).kind, 'callback');

T.head('Длинные сообщения:');
var long = new Array(9000).join('строка ответа\n');
T.eq('режется на части по 4000', TG.chunks(long).every(function (p) { return p.length <= 4000; }), true);
T.eq('ничего не теряется', TG.chunks(long).join('\n').replace(/\n+/g, '\n').length >= long.replace(/\n+/g, '\n').length - 2, true);

T.head('Диалог до брони:');
var b = newBot();
(function () {
  return b.bot.handleUpdate(msg(10, '/start'))
    .then(function () { return b.bot.handleUpdate(msg(10, 'есть что-то свободное?')); })
    .then(function () { return b.bot.handleUpdate(msg(10, 'нас четверо, с 10 по 13 марта')); })
    .then(function () {
      var last = texts()[texts().length - 1].params;
      T.is('на заявку приходят варианты с ценой', /тг/.test(last.text), last.text.slice(0, 60));
      T.is('к вариантам прикручены кнопки выбора',
        !!(last.reply_markup && last.reply_markup.inline_keyboard[0][0].callback_data === 'pick:0'), last.reply_markup);
      return b.bot.handleUpdate({ callback_query: { id: 'c1', data: 'pick:0', from: { id: 10, first_name: 'Азиз' }, message: { chat: { id: 10, type: 'private' } } } });
    })
    .then(function () {
      T.is('нажатие кнопки подтверждается в телеграме',
        sent.some(function (s) { return s.method === 'answerCallbackQuery'; }), true);
      var last = texts()[texts().length - 1].params;
      T.is('после выбора — удержание и запрос данных', /держу|Предоплата/.test(last.text), last.text.slice(0, 60));
      T.is('предлагается кнопка «отправить номер»',
        !!(last.reply_markup && last.reply_markup.keyboard[0][0].request_contact), last.reply_markup);
      return b.bot.handleUpdate(msg(10, '', { text: undefined, contact: { first_name: 'Азиз', phone_number: '998901234567' } }));
    })
    .then(function () {
      var last = texts()[texts().length - 1].params;
      T.is('контакт закрывает бронь реквизитами', /Предоплата/.test(last.text), last.text.slice(0, 80));
      var ctx = b.sessions.get(10);
      T.eq('бронь сохранена в сессии', !!ctx.booking, true);
      T.eq('телефон записан', ctx.guest.phone, '+998901234567');
    })

    .then(function () {
      T.head('Эскалация менеджеру:');
      var b2 = newBot();
      return b2.bot.handleUpdate(msg(20, 'я перевёл лишнее, верните на другую карту')).then(function () {
        T.eq('гость получил ответ', toGuest(20).length > 0, true);
        var toManager = toGuest(777);
        T.eq('менеджеру ушло уведомление', toManager.length, 1);
        T.is('в уведомлении есть чат, сценарий и риск',
          /chat id 20/.test(toManager[0].params.text) && /fraud/.test(toManager[0].params.text) &&
          /риск \d+/.test(toManager[0].params.text), toManager[0].params.text.slice(0, 120));
      });
    })

    .then(function () {
      T.head('Границы:');
      var b3 = newBot();
      return b3.bot.handleUpdate({ update_id: 1, message: { message_id: 1, chat: { id: -100, type: 'supergroup' }, from: { id: 5 }, text: 'привет' } })
        .then(function () { T.eq('в чужой группе бот молчит', texts().length, 0); })
        .then(function () { return b3.bot.handleUpdate(msg(30, 'реклама, предлагаем продвижение, перейди по ссылке')); })
        .then(function () { T.eq('на спам не отвечаем', toGuest(30).length, 0); })
        .then(function () {
          var chain = Promise.resolve();
          for (var i = 0; i < 8; i++) {
            (function () { chain = chain.then(function () { return b3.bot.handleUpdate(msg(40, 'сколько стоит?')); }); })();
          }
          return chain;
        })
        .then(function () {
          var last = toGuest(40).pop().params.text;
          T.eq('флуд притормаживается', /Слишком много сообщений/.test(last), true);
        });
    })

    .then(function () {
      T.head('Команды:');
      var b4 = newBot();
      return b4.bot.handleUpdate(msg(50, '/help'))
        .then(function () { T.is('/help рассказывает про возможности', /подобрать квартиру/.test(toGuest(50)[0].params.text), true); })
        .then(function () { return b4.bot.handleUpdate(msg(50, 'нас двое, с 10 по 13 марта')); })
        .then(function () { return b4.bot.handleUpdate(msg(50, '/reset')); })
        .then(function () {
          T.eq('/reset очищает диалог', b4.sessions.get(50).request.guests, null);
          return b4.bot.handleUpdate(msg(51, '/stats'));
        })
        .then(function () { T.is('/stats закрыт для гостей', /для менеджера/.test(toGuest(51)[0].params.text), true); })
        .then(function () { return b4.bot.handleUpdate(msg(777, '/stats')); })
        .then(function () { T.is('/stats работает у менеджера', /Диалогов/.test(toGuest(777).pop().params.text), true); });
    })

    .then(function () {
      T.head('Диалог для модели:');
      var seen = null;
      var llm = {
        ready: function () { return true; },
        ask: function (t, res, hist) { seen = hist; return Promise.resolve({ reply: 'ответ модели', note: 'заметка модели' }); }
      };
      var sessions = new Store(file + '.3', 48).attach(KB, AGENT);
      var bot = TG.createBot({ call: fakeCall, sessions: sessions, claude: llm, log: function () {} });
      sent = [];
      return bot.handleUpdate(msg(70, 'привет'))
        .then(function () { return bot.handleUpdate(msg(70, 'нас двое')); })
        .then(function () { return bot.handleUpdate(msg(70, 'с 10 по 13 марта')); })
        .then(function () {
          T.eq('роли чередуются', seen.map(function (h) { return h.role; }).join(','), 'user,assistant,user,assistant');
          T.eq('в историю попадает то, что гость видел', seen[1].text, 'ответ модели');
          T.is('гостю уходит текст модели, а не движка',
            /ответ модели/.test(toGuest(70).pop().params.text), true);
        });
    })

    .then(function () {
      T.head('Удержания переживают перезапуск:');
      var hfile = path.join(os.tmpdir(), 'zaselenie-test-holds.json');
      if (fs.existsSync(hfile)) fs.unlinkSync(hfile);
      HOLDS.reset();
      var st = new Store(hfile, 48).holds(HOLDS).attach(KB, AGENT);
      var bot2 = TG.createBot({ call: fakeCall, sessions: st, claude: noLlm, log: function () {} });
      sent = [];
      return bot2.handleUpdate(msg(80, 'с 10 по 13 марта, нас двое'))
        .then(function () { return bot2.handleUpdate(msg(80, 'беру первый')); })
        .then(function () {
          T.eq('чат владеет удержанием', HOLDS.all()[0] && HOLDS.all()[0].holder, '80');
          st.save();
          HOLDS.reset();
          new Store(hfile, 48).holds(HOLDS).attach(KB, AGENT);
          T.eq('после перезапуска удержание на месте', HOLDS.count(), 1);
          T.eq('и остаётся за тем же чатом', HOLDS.all()[0].holder, '80');
          HOLDS.reset();
        })

    .then(function () {
      T.head('Падение модели не рушит ответ:');
      sent = [];
      var broken = { ready: function () { return true; }, ask: function () { return Promise.reject(new Error('таймаут')); } };
      var sessions = new Store(file + '.2', 48).attach(KB, AGENT);
      var bot = TG.createBot({ call: fakeCall, sessions: sessions, claude: broken, log: function () {} });
      return bot.handleUpdate(msg(60, 'нас двое, с 10 по 13 марта')).then(function () {
        T.is('гость всё равно получил ответ движка', /тг/.test(toGuest(60).pop().params.text), true);
      });
    })

      })
    .then(T.done)
    .catch(function (e) { console.error(e); process.exitCode = 1; });
})();
