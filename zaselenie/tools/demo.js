/* Прогон агента по типовым заявкам в терминале:
   node zaselenie/tools/demo.js            — все примеры
   node zaselenie/tools/demo.js "текст"    — одно сообщение
   Полезно, чтобы посмотреть, как меняются ответы после правок базы знаний. */
var dir = __dirname + '/../js/';
['util', 'knowledge', 'nlu', 'policy', 'reply', 'risk', 'scenarios', 'agent'].forEach(function (m) {
  require(dir + m + '.js');
});

var CASES = [
  'Здравствуйте! Нужна квартира с 10 по 13 марта, нас трое, с ребёнком 3 года',
  'Есть что-нибудь на завтра? Вдвоём, бюджет до 500 тысяч',
  'Можно на пару часов?',
  'Хотим отметить день рождения, нас 12 человек',
  'Нас 14 человек, 5-7 ноября',
  'Снимем на месяц, семья из четырёх',
  'Нужен счёт и акт для компании, командировка 20-24 октября',
  'Приедем с котом, прилёт в 2 ночи, нужен лифт и парковка, 12-14 декабря, двое',
  'В квартире нет воды со вчера',
  'Я перевёл лишнее, верните на другую карту',
  'Хочу отменить бронь',
  'А скидка будет?',
  'Дайте точный адрес',
  'Заселите без паспорта',
  'Нужна ли регистрация для иностранца?',
  'Hello! Do you have a flat for 3 nights?'
];

function show(msg) {
  var ctx = AGENT.newContext({ channel: 'cli' });
  var r = AGENT.respond(msg, ctx);
  console.log('\n\x1b[33m→ ' + msg + '\x1b[0m');
  console.log('\x1b[90m[' + r.scenario + ' · ' + r.action + ' · риск ' + r.analysis.risk.score +
              ' · уверенность ' + Math.round(r.analysis.confidence * 100) + '%]\x1b[0m');
  console.log(r.reply);
  if (r.internal) console.log('\x1b[90mменеджеру: ' + r.internal + '\x1b[0m');
}

var arg = process.argv.slice(2).join(' ');
if (arg) show(arg); else CASES.forEach(show);
