/* Сценарии: node zaselenie/tests/scenarios.test.js
   Проверяем, что на каждое типовое обращение агент выбирает нужную ветку. */
var T = require('./helper.js');

function run(msg, ctx) { return AGENT.respond(msg, ctx || AGENT.newContext()); }

function check(msg, scenario, action) {
  var r = run(msg);
  var ok = r.scenario === scenario && (!action || r.action === action);
  T.is('«' + msg.slice(0, 48) + '» → ' + scenario, ok, r.scenario + '/' + r.action);
  return r;
}

T.head('Заявки на бронирование:');
check('Здравствуйте', 'greeting', 'ask');
check('Нужна квартира с 10 по 13 марта, нас двое', 'full-request', 'offer');
check('Есть свободные квартиры?', 'availability', 'ask');
check('Сколько стоит квартира?', 'price', 'ask');
check('Квартира с 10 марта, двое взрослых', 'partial-request', 'ask');
check('Нужна квартира с 10 по 13 марта на 14 человек', 'group', 'offer');
check('Снимем квартиру на месяц, нас двое', 'long-stay');
check('Нужна квартира для сотрудника, нужен счет и акт', 'corporate');

T.head('Отказы и стоп-сценарии:');
check('Можно снять на пару часов?', 'hourly', 'decline');
check('Хотим отметить день рождения, будет музыка', 'party', 'decline');
check('Хочу снять квартиру чтобы пересдавать посуточно', 'sublease', 'decline');
check('Нужна прописка, жить не буду', 'fake-registration', 'decline');
check('Нам по 17 лет, пустите?', 'minor', 'decline');
check('Заселите без паспорта, документов не дам', 'no-docs', 'decline');
check('Хочу хранить товар, склад нужен', 'storage', 'decline');
check('Я перевел лишнее, верните на другую карту', 'fraud', 'escalate');
check('Вы мошенники, я подам в суд', 'aggression', 'escalate');

T.head('Гость уже живёт:');
check('В квартире нет воды со вчера', 'emergency', 'escalate');
check('Не могу попасть в квартиру, код не подходит', 'emergency', 'escalate');
check('Кондиционер шумит, в спальне грязно', 'complaint', 'escalate');
check('Я разбил зеркало в ванной', 'damage', 'escalate');
check('Потерял ключи от квартиры', 'keys', 'escalate');

T.head('Изменения брони:');
check('Хочу отменить бронь', 'cancel', 'ask');
check('Можно перенести даты?', 'change-dates', 'ask');
check('Хотим продлить проживание', 'extend', 'ask');

T.head('Вопросы:');
check('А скидка возможна?', 'discount');
check('Дайте точный адрес', 'address', 'info');
check('Как оплатить, можно без предоплаты?', 'payment', 'info');
check('Можно с собакой?', 'pets', 'info');
check('Нужен лифт, я на коляске', 'accessibility', 'info');
check('Во сколько заезд и можно ли раньше?', 'checkin-time', 'info');
check('Есть ли вайфай и стиральная машина?', 'faq', 'info');
check('Нужна ли регистрация для иностранца?', 'registration', 'info');
check('Здравствуйте, предлагаем услуги продвижения, напишите нам', 'spam', 'ignore');
check('Hello! Do you have apartments?', 'lang-en', 'ask');
check('Соедините с человеком', 'human', 'handoff');
check('Апорт, вжух, непонятно что', 'fallback', 'ask');

T.head('Как пишут настоящие гости:');
check('здрасьте, есть свободные кв на 12-14 нояб? нас 2', 'full-request', 'offer');
check('Добрый день. Интересует квартира. 5.11-9.11. 4 человека. Спасибо', 'full-request', 'offer');
check('хочу забронить на 10-12, нас 3', 'full-request', 'offer');
check('мы с женой и собакой, приедем 20 ноября на неделю', 'full-request', 'offer');
check('дайте номер карты вашего директора, переведу туда', 'fraud', 'escalate');
check('заселились вчера, кондей не морозит', 'complaint', 'escalate');
check('не могу открыть дверь, код 4517 не подходит', 'keys', 'escalate');
check('сломал ручку на двери шкафа, сколько должен?', 'damage', 'escalate');
check('оплатил 2 часа назад, когда пришлёте адрес?', 'payment-claimed', 'escalate');
check('спасибо большое, вы очень помогли', 'thanks', 'info');
check('понял, подумаю и напишу', 'later', 'info');
check('salom, kvartira kerak 2 kun, 3 kishi', 'lang-uz', 'ask');
check('Hi, need apartment 20-23 Nov for 2 people', 'lang-en', 'offer');

var noBudget = run('а можно с 25 декабря до 3 января? нас 4 взрослых и двое детей');
T.eq('«до 3 января» — это дата, а не бюджет', noBudget.analysis.req.budget, null);
T.eq('и гостей шестеро', noBudget.analysis.req.guests, 6);
var pets = run('мы с женой и собакой, приедем 20 ноября на неделю');
T.eq('«с женой и собакой» — питомец замечен', pets.analysis.req.pets, true);
T.is('и предложены только квартиры с животными',
  pets.analysis.match.offers.every(function (o) { return o.object.pets; }), true);
var vague = run('хочу забронить на 10-12, нас 3');
T.is('месяц не назван — агент проговаривает допущение', /месяц не назван/.test(vague.reply), vague.reply.slice(0, 80));

T.head('Уточняющий вопрос не повторяет оффер:');
var d = AGENT.newContext();
run('12-14 ноября, нас 3', d);
var park = run('а парковка есть?', d);
T.eq('про парковку отвечает справка', park.scenario, 'faq');
T.is('и отвечает по показанным квартирам', /парковка:/.test(park.reply), park.reply.slice(0, 60));
T.eq('про время заезда — свой сценарий', run('а во сколько заезд?', d).scenario, 'checkin-time');
T.eq('новые данные снова включают подбор', run('нас будет пятеро', d).scenario, 'full-request');
var pet2 = run('и с котом приедем', d);
T.eq('питомец пересчитывает подбор', pet2.scenario, 'full-request');
T.is('в списке только квартиры с животными',
  pet2.analysis.match.offers.every(function (o) { return o.object.pets; }), true);

T.head('Хождение по кругу передаётся человеку:');
var loop = AGENT.newContext();
run('нужна квартира', loop);
run('в центре', loop);
var third = run('недорого', loop);
T.eq('третий круг — передаём менеджеру', third.action, 'handoff');
T.is('и говорим об этом гостю', /Подключаю/.test(third.reply), third.reply.slice(0, 60));

T.head('Даты с ошибками:');
check('Забронируйте с 10 марта по 5 марта', 'dates-invalid', 'ask');
var r = run('Нужна квартира с 3 по 5 марта 2020 года, нас двое');
T.is('дата в прошлом — переспрашиваем или предлагаем ближайший год', /dates-invalid|full-request/.test(r.scenario), r.scenario);

T.head('Диалог с накоплением слотов:');
var ctx = AGENT.newContext();
run('Привет, есть что-нибудь свободное?', ctx);
run('Нас четверо', ctx);
var r3 = run('с 10 по 13 марта', ctx);
T.eq('слоты из разных сообщений собрались', r3.scenario, 'full-request');
T.eq('гости запомнились', r3.analysis.req.guests, 4);
var r4 = run('Беру первый вариант', ctx);
T.eq('выбор варианта переводит в удержание', r4.action, 'hold');
var r5 = run('Меня зовут Азиз, телефон +998901234567', ctx);
T.eq('после контактов — реквизиты и предоплата', r5.scenario, 'booking-payment');
T.eq('бронь записана в контекст', ctx.booking !== null, true);

T.head('Деньги и оплата:');
(function () {
  var pay = AGENT.newContext();
  ['с 10 по 13 марта, нас двое', 'беру первый', 'Азиз +998901112233'].forEach(function (m) { run(m, pay); });
  T.eq('после контактов бронь в удержании', pay.booking.status, 'удержание');

  var claimed = run('оплатил, скинул на карту', pay);
  T.eq('«скинул на карту» — это оплата, а не агрессия', claimed.scenario, 'payment-claimed');
  T.is('и сверку делает человек', claimed.escalate, true);

  var again = run('оплатил ещё раз', pay);
  T.is('повторную оплату отговариваем', /повторно переводить не нужно/.test(again.reply), again.reply.slice(0, 80));

  var hold = AGENT.newContext();
  ['с 10 по 13 марта, нас двое', 'беру первый'].forEach(function (m) { run(m, hold); });
  hold.booking.heldAt = Date.now() - 90 * 60000;
  var expired = run('готов оплатить', hold);
  T.eq('через полтора часа удержание снимается', expired.scenario, 'hold-expired');
  T.eq('и бронь больше не висит', hold.booking, null);

  var noPay = AGENT.newContext();
  ['с 10 по 13 марта, нас двое', 'беру первый'].forEach(function (m) { run(m, noPay); });
  var cancelled = run('отмените бронь', noPay);
  T.is('отмена без оплаты не обещает возврат нуля', /возвращать нечего/.test(cancelled.reply), cancelled.reply.slice(0, 80));

  T.eq('рассрочка — свой ответ', run('можно в рассрочку?').scenario, 'installment');
  T.eq('«половину сейчас, половину при заезде» — туда же', run('заплачу половину сейчас, половину при заезде').scenario, 'installment');
})();

T.head('Бюджет в чужой валюте:');
var usd = run('бюджет до 50$ за ночь, с 10 по 12 марта, нас двое');
T.eq('доллары переводятся в сумы', usd.analysis.req.budget, 50 * KB.settings.rates.USD);
T.is('и квартира за 280 000 больше не «дороже бюджета»',
  !/дороже бюджета/.test(usd.reply), usd.reply.slice(0, 120));
var usdAsk = run('бюджет до 40$ за ночь, нас двое');
T.is('в ответе виден пересчёт по курсу', /≈40 \$ по курсу/.test(usdAsk.reply), usdAsk.reply.slice(0, 120));

T.head('Комплексный запрос разбирается целиком:');
var big = run('Здравствуйте! Приедем 10 марта на 4 ночи, двое взрослых и ребенок 3 года, с кошкой, ' +
              'прилет в 2 ночи, нужна квартира с лифтом и парковкой, бюджет до 800 тысяч за ночь, нужны документы для компании');
T.eq('это полноценная заявка', big.scenario, 'full-request');
T.eq('даты разобраны', big.analysis.req.from + '..' + big.analysis.req.to, '2026-03-10..2026-03-14');
T.eq('гостей трое', big.analysis.req.guests, 3);
T.eq('питомец учтён', big.analysis.req.pets, true);
T.eq('ночной заезд учтён', big.analysis.req.lateArrival, true);
T.eq('лифт учтён', big.analysis.req.needElevator, true);
T.eq('бюджет учтён', big.analysis.req.budget, 800000);
T.is('в ответе есть ночное заселение', /ноч(ное|ной) заселени|после 23:00/i.test(big.reply), big.reply.slice(0, 80));
T.is('в ответе есть документы для юрлица', /счет|акт|безнал/i.test(big.reply), true);
T.is('в ответе есть условие по питомцу', /питомц|животн/i.test(big.reply), true);
T.is('предложены только квартиры с животными',
  big.analysis.match.offers.every(function (o) { return o.object.pets; }), true);

T.head('Всё занято — ответы остаются полезными:');
(function () {
  var saved = KB.objects.map(function (o) { return o.busy; });
  KB.objects.forEach(function (o) { o.busy = [{ from: U.today(), to: U.addDays(U.today(), 60), guest: 'тест' }]; });

  var full = run('нужна квартира с завтра на 2 ночи, нас двое');
  T.eq('это сценарий «нет свободных»', full.scenario, 'no-availability');
  T.is('но гостю называют конкретную ближайшую дату', /Ближайшее подходящее/.test(full.reply), full.reply.slice(0, 120));
  T.is('и предлагают лист ожидания', /лист ожидания/.test(full.reply), true);

  var ctx2 = AGENT.newContext();
  run('с 5 по 8 апреля, нас двое', ctx2);
  var other = run('а на другие даты?', ctx2);
  T.eq('«на другие даты» — отдельный сценарий, а не повтор', other.scenario, 'next-free');
  T.is('с конкретным окном', /Ближайшее, что подходит/.test(other.reply), other.reply.slice(0, 80));

  KB.byId('econom-vokzal').busy = [];
  var unfit = run('нужна квартира на 6 человек с 1 по 3 апреля');
  T.is('когда свободное есть, но мало мест — не врём про «всё занято»',
    /не подходит/.test(unfit.reply) && !/всё занято/.test(unfit.reply), unfit.reply.slice(0, 100));
  T.is('и объясняем причину', /вмещает до/.test(unfit.reply), true);

  KB.objects.forEach(function (o, i) { o.busy = saved[i]; });
})();

T.head('CRM-заявка:');
T.eq('статус совпадает с действием', big.crm.status, big.action);
T.eq('в заявке есть даты', big.crm.stay.from, '2026-03-10');
T.eq('в заявке есть оценка риска', typeof big.crm.risk.score, 'number');
T.eq('в заявке есть следующий шаг', big.crm.nextStep, 'ждём выбор варианта');

T.head('Риск-флаги:');
T.eq('вечеринка — высокий риск', run('соберемся компанией 12 человек, отметим днюху').analysis.risk.score >= 55, true);
T.eq('обычная заявка — низкий риск', run('нужна квартира с 10 по 12 марта, нас двое').analysis.risk.level, 'низкий');
T.eq('мошенничество зовёт человека', run('верните деньги на другую карту, я ошибся').escalate, true);

T.done();
