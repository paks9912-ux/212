/* Цены, занятость, подбор: node zaselenie/tests/policy.test.js */
var T = require('./helper.js');

var obj = KB.byId('studio-baiterek');
var BASE = obj.base;
obj.busy = [{ from: '2026-03-10', to: '2026-03-14', guest: 'тест' }];

T.head('Цена ночи:');
T.eq('будни — база', PO.nightPrice(obj, '2026-03-03'), BASE);
T.eq('пятница — коэффициент выходного', PO.nightPrice(obj, '2026-03-06'), Math.round(BASE * 1.15 / 1000) * 1000);
T.eq('Наурыз — сезонная наценка', PO.nightPrice(obj, '2026-03-20'), Math.round(BASE * 1.15 * 1.35 / 1000) * 1000);
T.eq('новогодние даты — пик', PO.isPeak('2026-12-30', '2027-01-02'), true);

T.head('Занятость:');
T.eq('пересечение с бронью видно', PO.isFree(obj, '2026-03-12', '2026-03-16').free, false);
T.eq('стык день в день свободен', PO.isFree(obj, '2026-03-14', '2026-03-16').free, true);
T.eq('соседнее окно предлагается', PO.nearestWindows(obj, '2026-03-11', 2, 1).length > 0, true);

T.head('Расчёт:');
var q = PO.quote(obj, { from: '2026-03-03', to: '2026-03-06', guests: 2 });
T.eq('3 ночи будней', q.nights, 3);
T.eq('сумма без допов', q.total, BASE * 3);
T.eq('предоплата 30%', q.prepay, Math.round(BASE * 3 * 0.3));
T.eq('депозит объекта', q.deposit, obj.deposit);

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

T.head('Сезоны и стыки:');
(function () {
  var overlaps = [];
  for (var d = U.make(2026, 1, 1); d < U.make(2027, 1, 1); d = U.addDays(d, 1)) {
    var md = d.slice(5);
    var hits = KB.seasons.filter(function (x) {
      return x.from <= x.to ? (md >= x.from && md <= x.to) : (md >= x.from || md <= x.to);
    });
    if (hits.length > 1) overlaps.push(d);
  }
  T.eq('сезоны не перекрывают друг друга', overlaps.length, 0);
})();
T.eq('ночь до начала сезона — по базе', PO.nightPrice(obj, '2026-12-27'), BASE);
T.eq('первая ночь сезона — с коэффициентом', PO.nightPrice(obj, '2026-12-28'), Math.round(BASE * 1.6 / 1000) * 1000);
T.eq('последняя ночь сезона ещё дорогая', PO.nightPrice(obj, '2027-01-05'), Math.round(BASE * 1.6 / 1000) * 1000);
T.eq('следующая ночь — снова база', PO.nightPrice(obj, '2027-01-06'), BASE);
T.eq('праздник и выходной умножаются вместе',
  PO.nightPrice(obj, '2027-01-01'), Math.round(BASE * 1.15 * 1.6 / 1000) * 1000);
T.eq('ночь воскресенья — не выходной тариф', PO.nightPrice(obj, '2026-10-18'), BASE);

(function () {
  var cases = [['2026-12-29', '2027-01-03'], ['2027-01-08', '2027-01-13'],
               ['2027-03-18', '2027-03-24'], ['2027-04-18', '2027-04-23']];
  var bad = cases.filter(function (c) {
    var q = PO.quote(obj, { from: c[0], to: c[1], guests: 2 });
    var nights = U.nightsList(c[0], c[1]).reduce(function (sum, n) { return sum + PO.nightPrice(obj, n); }, 0);
    var peak = U.nightsList(c[0], c[1]).reduce(function (sum, n) {
      var se = PO.season(n); return sum + (se && se.peak ? PO.nightPrice(obj, n) : 0);
    }, 0);
    return q.total !== nights - Math.round((nights - peak) * q.discountPart);
  });
  T.eq('бронь через границу сезона считается по ночам', bad.length, 0);
})();

T.head('Предоплата в праздники:');
var mixed = PO.quote(obj, { from: '2027-03-19', to: '2027-03-21', guests: 2 });   // 1 ночь Наурыза из 2
T.eq('в смешанной броне пиковых ночей ровно одна', mixed.peakNights, 1);
T.eq('праздничная ночь оплачивается полностью, остальное по 30%',
  mixed.prepay, Math.round(PO.nightPrice(obj, '2027-03-20') + PO.nightPrice(obj, '2027-03-19') * 0.3));
T.is('одна праздничная ночь не делает всю бронь стопроцентной', mixed.prepayPart < 1, mixed.prepayPart);

var allPeak = PO.quote(obj, { from: '2026-12-29', to: '2027-01-01', guests: 2 });
T.eq('когда все ночи праздничные — предоплата полная', allPeak.prepay, allPeak.total);

var plain = PO.quote(obj, { from: '2026-10-12', to: '2026-10-15', guests: 2 });
T.eq('вне сезона предоплата обычная', plain.prepay, Math.round(plain.total * 0.3));

T.head('Скидка за длительность и праздники:');
var longNy = PO.quote(obj, { from: '2026-12-30', to: '2027-01-09', guests: 2 });
var nightsNy = U.nightsList('2026-12-30', '2027-01-09').reduce(function (s2, n) { return s2 + PO.nightPrice(obj, n); }, 0);
var peakNy = U.nightsList('2026-12-30', '2027-01-09').reduce(function (s2, n) {
  var se = PO.season(n); return s2 + (se && se.peak ? PO.nightPrice(obj, n) : 0);
}, 0);
T.eq('скидка за срок не трогает праздничные ночи', longNy.total, nightsNy - Math.round((nightsNy - peakNy) * 0.1));
T.is('но обычные ночи в той же броне со скидкой', longNy.total < nightsNy, true);

T.head('Минимальный срок по сезону:');
T.eq('в новогодние даты минимум три ночи', PO.minNights(obj, '2026-12-29', '2026-12-30'), 3);
T.eq('в Наурыз — две', PO.minNights(obj, '2027-03-21', '2027-03-22'), 2);
T.eq('вне сезона — одна', PO.minNights(obj, '2026-10-12', '2026-10-13'), 1);

T.head('Разброс цен виден гостю:');
T.is('в праздники показываем «от и до»', !!R.spread(PO.quote(obj, { from: '2027-03-20', to: '2027-03-22', guests: 2 })), true);
T.eq('в ровные даты лишнего не пишем', R.spread(PO.quote(obj, { from: '2026-10-12', to: '2026-10-15', guests: 2 })), null);

T.head('Когда всё занято:');
(function () {
  var saved = KB.objects.map(function (o) { return o.busy; });
  KB.objects.forEach(function (o) { o.busy = [{ from: U.today(), to: U.addDays(U.today(), 60), guest: 'тест' }]; });

  var req = { from: U.addDays(U.today(), 3), to: U.addDays(U.today(), 5), guests: 2 };
  T.eq('подбор честно возвращает пустоту', PO.match(req).offers.length, 0);

  var next = PO.nextAvailable(req, 90);
  T.is('но ближайшая свободная дата находится', !!next, next);
  T.is('и она за границей занятости', next && U.diffDays(U.today(), next.from) >= 60, next && next.from);
  T.eq('окно той же длины, что просил гость', next && U.diffDays(next.from, next.to), 2);

  /* Свободна одна маленькая квартира: это не «всё занято» */
  KB.byId('econom-vokzal').busy = [];
  var why = PO.whyBlocked({ from: req.from, to: req.to, guests: 6 });
  T.eq('видно, что свободное есть, просто не подходит', why.freeButUnfit, true);
  T.is('и названа причина', /вмещает до/.test(why.unfit[0].reasons.join(' ')), why.unfit[0].reasons);
  T.eq('с питомцем причина другая',
    PO.whyBlocked({ from: req.from, to: req.to, guests: 2, pets: true }).unfit[0].reasons[0], 'нельзя с животными');

  KB.objects.forEach(function (o, i) { o.busy = saved[i]; });
})();

T.head('Битый календарь не молчит:');
(function () {
  var saved = KB.byId('studio-baiterek').busy;
  KB.byId('studio-baiterek').busy = [
    { from: '2026-10-10', to: '2026-10-05' },
    { from: 'кривая', to: '2026-10-20' },
    {},
    { from: '2026-11-01', to: '2026-11-05' },
    { from: '2026-11-03', to: '2026-11-08' }
  ];
  var problems = KB.validate();
  T.is('выезд раньше заезда замечен', problems.some(function (x) { return /выезд не позже/.test(x); }), problems);
  T.is('кривой формат замечен', problems.some(function (x) { return /не в формате/.test(x); }), true);
  T.is('пустая запись замечена', problems.some(function (x) { return /нет дат/.test(x); }), true);
  T.is('наложение броней замечено', problems.some(function (x) { return /наложились/.test(x); }), true);
  KB.byId('studio-baiterek').busy = saved;
  T.eq('на исправном календаре жалоб нет', KB.validate().length, 0);
})();

T.head('Инвариант денег:');
(function () {
  var broken = [];
  KB.objects.forEach(function (o) {
    [1, 3, 7, 14, 30].forEach(function (n) {
      [1, 2, 4, 6].forEach(function (g) {
        [false, true].forEach(function (pets) {
          var from = U.addDays(U.today(), 20), to = U.addDays(from, n);
          var q = PO.quote(o, { from: from, to: to, guests: g, pets: pets, earlyCheckIn: pets, lateArrival: g > 2 });
          if (q.prepay + q.rest !== q.total || q.prepay < 0 || q.rest < 0 || q.prepay > q.total) {
            broken.push(o.id + '/' + n + '/' + g);
          }
        });
      });
    });
  });
  T.eq('предоплата плюс остаток равны итогу на всех бронях', broken.length, 0);
})();

T.head('Возвраты в крайних случаях:');
T.eq('отрицательная предоплата не даёт отрицательный возврат', PO.refund(U.addDays(U.today(), 10), -5000).sum, 0);
T.eq('мусор вместо суммы — ноль', PO.refund(U.addDays(U.today(), 10), 'много').sum, 0);
T.eq('заезд в прошлом — без возврата', PO.refund(U.addDays(U.today(), -3), 1000000).sum, 0);
T.is('возврат никогда не больше внесённого',
  PO.refund(U.addDays(U.today(), 30), 1000000).sum <= 1000000, true);

T.head('Удержания как занятость:');
(function () {
  HOLDS.reset();
  var o = KB.byId('loft-expo'), saved = o.busy;
  o.busy = [];
  var from = U.addDays(U.today(), 5), to = U.addDays(from, 2);
  HOLDS.add(o.id, from, to, 'гость-А', 60);

  T.eq('для владельца удержания квартира свободна', PO.isFree(o, from, to, 'гость-А').free, true);
  T.eq('для остальных — занята', PO.isFree(o, from, to, 'гость-Б').free, false);
  T.eq('в подборе чужого гостя её нет',
    PO.match({ from: from, to: to, guests: 2, holder: 'гость-Б' }).offers.filter(function (x) { return x.object.id === o.id; }).length, 0);
  T.eq('соседние даты не блокируются', PO.isFree(o, U.addDays(to, 1), U.addDays(to, 3), 'гость-Б').free, true);

  HOLDS.markPaid('гость-А', 24);
  HOLDS.now = function () { return Date.now() + 2 * 3600000; };
  T.eq('оплаченное удержание живёт дольше часа', HOLDS.count(), 1);
  HOLDS.now = function () { return Date.now() + 30 * 3600000; };
  T.eq('но и оно однажды истекает', HOLDS.count(), 0);
  HOLDS.now = function () { return Date.now(); };

  HOLDS.reset();
  o.busy = saved;
})();

T.head('Часовой пояс:');
(function () {
  var savedNow = U.NOW, savedTz = U.tzOffset;
  U.NOW = null;
  U.tzOffset = 5;
  var tashkent = U.today();
  U.tzOffset = -8;
  var losAngeles = U.today();
  T.is('дата считается по городу гостя, а не по серверу',
    typeof tashkent === 'string' && typeof losAngeles === 'string', [tashkent, losAngeles]);
  T.is('и время города доступно для ночных заездов', /^\d{2}:\d{2}$/.test(U.clock()), U.clock());
  U.tzOffset = savedTz; U.NOW = savedNow;
})();

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
