/* Цены, занятость, подбор: node zaselenie/tests/policy.test.js */
var T = require('./helper.js');

var obj = KB.byId('studio-amir');
obj.busy = [{ from: '2026-03-10', to: '2026-03-14', guest: 'тест' }];

T.head('Цена ночи:');
T.eq('будни — база', PO.nightPrice(obj, '2026-03-03'), 420000);
T.eq('пятница — коэффициент выходного', PO.nightPrice(obj, '2026-03-06'), Math.round(420000 * 1.15 / 1000) * 1000);
T.eq('Навруз — сезонная наценка', PO.nightPrice(obj, '2026-03-20'), Math.round(420000 * 1.15 * 1.3 / 1000) * 1000);
T.eq('новогодние даты — пик', PO.isPeak('2026-12-30', '2027-01-02'), true);

T.head('Занятость:');
T.eq('пересечение с бронью видно', PO.isFree(obj, '2026-03-12', '2026-03-16').free, false);
T.eq('стык день в день свободен', PO.isFree(obj, '2026-03-14', '2026-03-16').free, true);
T.eq('соседнее окно предлагается', PO.nearestWindows(obj, '2026-03-11', 2, 1).length > 0, true);

T.head('Расчёт:');
var q = PO.quote(obj, { from: '2026-03-03', to: '2026-03-06', guests: 2 });
T.eq('3 ночи будней', q.nights, 3);
T.eq('сумма без допов', q.total, 420000 * 3);
T.eq('предоплата 30%', q.prepay, Math.round(420000 * 3 * 0.3));
T.eq('депозит объекта', q.deposit, 500000);

var q2 = PO.quote(obj, { from: '2026-03-03', to: '2026-03-06', guests: 3 });
T.eq('третий гость — доп. место за каждую ночь', q2.total - q.total, KB.settings.extraGuestFee * 3);

var q3 = PO.quote(obj, { from: '2026-03-03', to: '2026-03-06', guests: 2, pets: true });
T.eq('питомец — плата за ночь', q3.total - q.total, KB.settings.petFee * 3);
T.eq('питомец — депозит выше', q3.deposit - q.deposit, KB.settings.petDeposit);

var week = PO.quote(obj, { from: '2026-03-02', to: '2026-03-09', guests: 2 });
T.eq('от 7 ночей включается скидка 10%', week.discountPart, 0.1);
var month = PO.quote(obj, { from: '2026-04-01', to: '2026-05-01', guests: 2 });
T.eq('от 28 ночей — 20%', month.discountPart, 0.2);

var ny = PO.quote(obj, { from: '2026-12-30', to: '2027-01-02', guests: 2 });
T.eq('в пик предоплата 100%', ny.prepayPart, 1);

T.head('Подбор:');
var m = PO.match({ from: '2026-03-03', to: '2026-03-06', guests: 2 });
T.eq('варианты отсортированы по уместности', m.offers.length > 0, true);
T.eq('первый вариант вмещает гостей', m.offers[0].object.capacity + m.offers[0].object.extraBeds >= 2, true);

var mPets = PO.match({ from: '2026-03-03', to: '2026-03-06', guests: 2, pets: true });
T.eq('с питомцем не предлагаем квартиры без животных',
  mPets.offers.every(function (o) { return o.object.pets; }), true);

var mBig = PO.match({ from: '2026-03-03', to: '2026-03-06', guests: 7 });
T.eq('на 7 гостей одну квартиру не навязываем',
  mBig.offers.every(function (o) { return o.object.capacity + o.object.extraBeds >= 7; }), true);

var mShort = PO.match({ from: '2026-03-03', to: '2026-03-04', guests: 2, rooms: 2 });
T.eq('минимальный срок объекта соблюдается',
  mShort.offers.every(function (o) { return o.object.minNights <= 1; }), true);

T.head('Группа и возврат:');
var combo = PO.combo({ from: '2026-03-03', to: '2026-03-05', guests: 9 });
T.eq('группе собирается комплект квартир', combo && combo.capacity >= 9, true);
T.eq('гости распределены по квартирам',
  combo.parts.reduce(function (s, p) { return s + p.guests; }, 0), 9);

U.NOW = '2026-03-02';
T.eq('за 10 дней — полный возврат', PO.refund('2026-03-12', 1000000).sum, 1000000);
T.eq('за 4 дня — половина', PO.refund('2026-03-06', 1000000).sum, 500000);
T.eq('в день заезда — без возврата', PO.refund('2026-03-02', 1000000).sum, 0);

T.done();
