/* База знаний: правила компании, тарифы, квартиры, занятость, FAQ.
   Это единственное место, где меняются цены и политика — движок и промпт
   берут факты отсюда и ничего не выдумывают. */
(function (w) {
  'use strict';

  var U = w.U || (typeof require !== 'undefined' ? require('./util.js') : null);

  var KB = {};

  KB.settings = {
    brand: 'Ключи 24',
    business: 'квартиры посуточно',
    city: 'Астана',
    cityIn: 'Астане',
    cityEn: 'Astana',
    tzOffset: 5,                     // Казахстан живёт по UTC+5
    currency: 'тг',
    /* Сколько сум за единицу валюты. Обновляется руками или выгрузкой из
       вашей системы — агент пересчитывает бюджет гостя по этим числам. */
    rates: { USD: 540, RUB: 5.8, KGS: 6.1, UZS: 0.042 },
    checkIn: '14:00',
    checkOut: '12:00',
    officeFrom: '09:00',
    officeTo: '21:00',
    quietFrom: '23:00',
    quietTo: '08:00',
    minAge: 18,
    docs: 'удостоверение личности или паспорт на каждого взрослого гостя',
    registration: true,              // регистрируем иностранцев через eQonaq
    registrationDays: 3,             // в течение скольких суток оформляем
    registrationFee: 0,
    prepay: 0.3,                     // доля предоплаты от суммы проживания
    holdMinutes: 60,                 // сколько держим даты без предоплаты
    bookingHorizonDays: 365,         // дальше этого календарь ещё не открыт
    peakPrepay: 1,                   // пиковые ночи оплачиваются полностью
    discountInPeak: false,           // скидка за длительность не действует в праздники
    lateCheckInFrom: '23:00',
    lateCheckInFee: 5000,
    earlyCheckInPart: 0.5,           // доля суток за ранний заезд
    lateCheckOutPart: 0.5,
    extraGuestFee: 3000,             // за гостя сверх базовой вместимости за ночь
    petFee: 4000,                    // за питомца за ночь
    petDeposit: 15000,
    smokingFine: 30000,
    lockFee: 12000,                  // вскрытие замка
    keysFee: 7000,                   // новый комплект ключей
    partyFine: 70000,
    weekDiscountFrom: 7,             // от скольких ночей скидка
    weekDiscount: 0.10,
    longStayFrom: 28,
    longStayDiscount: 0.20,
    repeatGuestDiscount: 0.05,
    maxNegotiable: 0.10,             // на сколько агент может подвинуться по цене сам
    cancel: [                        // возврат предоплаты
      { beforeDays: 7, refund: 1.0, note: 'вернём всю предоплату' },
      { beforeDays: 3, refund: 0.5, note: 'вернём половину предоплаты' },
      { beforeDays: 0, refund: 0.0, note: 'предоплата не возвращается' }
    ],
    addressPolicy: 'точный адрес и код от подъезда отправляем после предоплаты',
    payments: ['Kaspi-перевод на счёт компании', 'наличные при заселении', 'безналичный расчёт для юрлиц'],
    companyCard: 'Kaspi-счёт компании, реквизиты приходят из этого же чата',
    manager: { name: 'Арман', phone: '+7 701 123-45-67', hours: '09:00–21:00' },
    escalationPhone: '+7 701 123-45-67'
  };

  /* Сезонные коэффициенты к базовой цене. from/to — 'ММ-ДД' включительно */
  KB.seasons = [
    { id: 'ny', name: 'новогодние даты', from: '12-28', to: '01-05', k: 1.6, minNights: 3, peak: true },
    { id: 'nauryz', name: 'Наурыз', from: '03-20', to: '03-25', k: 1.35, minNights: 2, peak: true },
    { id: 'capital', name: 'День столицы и форумы', from: '07-04', to: '07-08', k: 1.5, minNights: 2, peak: true },
    { id: 'high-1', name: 'высокий сезон', from: '06-01', to: '07-03', k: 1.15, minNights: 1, peak: false },
    { id: 'high-2', name: 'высокий сезон', from: '07-09', to: '08-31', k: 1.15, minNights: 1, peak: false },
    { id: 'low', name: 'морозы, низкий сезон', from: '01-10', to: '02-20', k: 0.8, minNights: 1, peak: false }
  ];

  /* Занятость задаётся сдвигом от сегодня, чтобы демо жило без ручных правок */
  function busy(fromOffset, nights, who) {
    var from = U.addDays(U.today(), fromOffset);
    return { from: from, to: U.addDays(from, nights), guest: who || 'бронь' };
  }

  KB.objects = [
    {
      id: 'studio-baiterek',
      title: 'Студия у Байтерека',
      rooms: 0, beds: 'двуспальная кровать',
      capacity: 2, extraBeds: 1,
      district: 'Есиль, ул. Достык',
      metro: 'Байтерек и Хан Шатыр в пешей доступности',
      floor: 9, floors: 16, elevator: true,
      base: 18000, weekendK: 1.15,
      minNights: 1,
      deposit: 30000,
      cleaning: 0,
      pets: false,
      smoking: false,
      parking: 'бесплатная во дворе',
      selfCheckIn: true,
      features: ['wi-fi 100 мбит', 'кондиционер', 'стиральная машина', 'тёплые полы', 'вид на Байтерек'],
      accessible: true,
      note: 'тихий дом на левом берегу, много деловых гостей',
      busy: [busy(2, 3), busy(9, 2), busy(21, 5)]
    },
    {
      id: 'two-highvill',
      title: '2-комнатная в Highvill',
      rooms: 2, beds: 'двуспальная + два раздельных места',
      capacity: 4, extraBeds: 2,
      district: 'Есиль, ЖК Highvill',
      metro: 'рядом Назарбаев Университет и ТРЦ MEGA Silk Way',
      floor: 5, floors: 12, elevator: true,
      base: 26000, weekendK: 1.1,
      minNights: 1,
      deposit: 40000,
      cleaning: 0,
      pets: true,
      smoking: false,
      parking: 'закрытый двор, бесплатно',
      selfCheckIn: true,
      features: ['wi-fi 100 мбит', 'два кондиционера', 'стиральная машина', 'детская кроватка по запросу', 'большая кухня'],
      accessible: true,
      note: 'семейный вариант, можно с питомцем',
      busy: [busy(0, 2), busy(5, 4), busy(30, 7)]
    },
    {
      id: 'three-triumf',
      title: '3-комнатная премиум в Триумфе Астаны',
      rooms: 3, beds: 'две двуспальные + диван',
      capacity: 6, extraBeds: 2,
      district: 'Алматинский район, Триумф Астаны',
      metro: 'набережная Ишима, 5 минут пешком',
      floor: 14, floors: 22, elevator: true,
      base: 48000, weekendK: 1.2,
      minNights: 2,
      deposit: 80000,
      cleaning: 6000,
      pets: false,
      smoking: false,
      parking: 'подземная, 2 000 тг в сутки',
      selfCheckIn: false,
      features: ['wi-fi 200 мбит', 'панорамные окна', 'посудомойка', 'две ванные', 'рабочее место'],
      accessible: true,
      note: 'подходит под командировки и переговоры, есть закрывающие документы',
      busy: [busy(1, 6), busy(14, 3)]
    },
    {
      id: 'econom-vokzal',
      title: '1-комнатная эконом у вокзала',
      rooms: 1, beds: 'двуспальная кровать',
      capacity: 3, extraBeds: 1,
      district: 'Сарыарка, у вокзала Астана-1',
      metro: 'вокзал и автовокзал Сапаржай — 7 минут',
      floor: 3, floors: 5, elevator: false,
      base: 12000, weekendK: 1.05,
      minNights: 1,
      deposit: 20000,
      cleaning: 0,
      pets: false,
      smoking: false,
      parking: 'на улице',
      selfCheckIn: true,
      features: ['wi-fi 50 мбит', 'кондиционер', 'простой ремонт'],
      accessible: false,
      note: 'самый доступный вариант, хорошо для транзита',
      busy: [busy(3, 1), busy(7, 2), busy(11, 3)]
    },
    {
      id: 'loft-expo',
      title: 'Лофт у EXPO',
      rooms: 1, beds: 'двуспальная + два раздельных места',
      capacity: 4, extraBeds: 1,
      district: 'Есиль, район EXPO',
      metro: 'до конгресс-центра 10 минут пешком',
      floor: 7, floors: 14, elevator: true,
      base: 22000, weekendK: 1.15,
      minNights: 1,
      deposit: 35000,
      cleaning: 0,
      pets: true,
      smoking: false,
      parking: 'бесплатная',
      selfCheckIn: true,
      features: ['wi-fi 100 мбит', 'высокие потолки', 'стиральная машина', 'проектор'],
      accessible: true,
      note: 'можно с животными, удобно на время форумов',
      busy: [busy(4, 2), busy(16, 4)]
    },
    {
      id: 'long-saryarka',
      title: '2-комнатная на Сарыарке для долгих сроков',
      rooms: 2, beds: 'двуспальная + односпальная',
      capacity: 4, extraBeds: 0,
      district: 'Сарыарка, новостройка',
      metro: 'остановка Сарыарка, 6 минут',
      floor: 8, floors: 12, elevator: true,
      base: 15000, weekendK: 1.0,
      minNights: 7,
      deposit: 30000,
      cleaning: 0,
      pets: true,
      smoking: false,
      parking: 'закрытая территория',
      selfCheckIn: false,
      features: ['wi-fi 100 мбит', 'вся техника', 'договор на месяц и больше'],
      accessible: true,
      note: 'берут на месяц и дольше, дешевле всего в пересчёте на сутки',
      busy: [busy(20, 30)]
    }
  ];

  /* Короткие ответы на частые вопросы. Ключ — тема, которую ловит разбор */
  KB.faq = {
    wifi: 'Wi-Fi есть во всех квартирах, 50–200 мбит, пароль на холодильнике.',
    kitchen: 'Кухня полностью оборудована: плита, холодильник, чайник, посуда, в премиум-вариантах есть посудомойка.',
    laundry: 'Стиральная машина есть во всех квартирах, кроме эконома у вокзала.',
    towels: 'Полотенца, постельное бельё, шампунь и гель — включены, меняем раз в 3 дня при долгом проживании.',
    cleaning: 'Уборка перед заездом включена в цену. Уборка во время проживания — по запросу, 5 000 тг.',
    kids: 'С детьми можно, детская кроватка и стульчик бесплатно в Highvill и Триумфе, нужно предупредить заранее.',
    transfer: 'Встреча в аэропорту Нурсултан Назарбаев или на вокзале — 6 000 тг, заказывать минимум за 6 часов.',
    parking: 'Парковка есть у всех объектов, в Триумфе подземная за 2 000 тг в сутки.',
    smoking: 'Курить в квартирах нельзя, на балконе тоже. Есть места для курения во дворе.',
    docs: 'Для заселения нужно удостоверение личности или паспорт на каждого взрослого гостя, гостям 18+.',
    registration: 'Иностранных гостей регистрируем сами через eQonaq в течение 3 суток после заезда, бесплатно. Нужны фото паспортов.',
    payment: 'Оплата: Kaspi-перевод на счёт компании, наличные при заселении или безнал для юрлиц. Предоплата 30%, остальное при заезде.',
    invoice: 'Для юрлиц работаем по договору, даём счёт, акт и ЭСФ. Оплата по безналу, обычно 1–2 рабочих дня.',
    address: 'Точный адрес и код от подъезда отправляем после предоплаты, до этого говорим район и ориентиры.',
    checkin: 'Заезд с 14:00, выезд до 12:00. Ранний заезд и поздний выезд — по наличию, 50% суток.',
    selfCheckIn: 'В большинстве квартир самозаселение: код от сейф-бокса приходит в этот чат в день заезда.'
  };

  /* Сценарии, где агент обязан позвать человека */
  KB.escalation = [
    'ущерб, залив, пожар, полиция, скорая',
    'возврат денег сверх стандартной политики',
    'подозрение на мошенничество с оплатой',
    'угрозы, агрессия, требование жалобной книги или суда',
    'запрос на скидку больше 10%',
    'бронь дороже 700 000 тг или дольше 28 ночей',
    'любой случай, где гость уже написал третий раз и вопрос не решён'
  ];

  /* Дата и время в городе гостя — сервер может стоять в любом поясе */
  KB.applyTimezone = function () {
    if (typeof KB.settings.tzOffset === 'number') U.tzOffset = KB.settings.tzOffset;
    if (KB.settings.currency) U.CURRENCY = KB.settings.currency;
  };

  KB.byId = function (id) {
    for (var i = 0; i < KB.objects.length; i++) if (KB.objects[i].id === id) return KB.objects[i];
    return null;
  };

  /* Проверка календаря: битые брони раньше просто игнорировались,
     а это значит «квартира считается свободной» — худший вид тихой ошибки */
  KB.validate = function () {
    var problems = [];
    KB.objects.forEach(function (o) {
      (o.busy || []).forEach(function (b, i) {
        var where = o.id + ' · бронь №' + (i + 1) + ': ';
        if (!b || !b.from || !b.to) return problems.push(where + 'нет дат');
        if (!U.valid(b.from) || !U.valid(b.to)) return problems.push(where + 'даты не в формате ГГГГ-ММ-ДД (' + b.from + ' → ' + b.to + ')');
        if (b.to <= b.from) return problems.push(where + 'выезд не позже заезда (' + b.from + ' → ' + b.to + ')');
      });
      var sorted = (o.busy || []).filter(function (b) { return b && U.valid(b.from) && U.valid(b.to) && b.to > b.from; })
        .sort(function (a, b) { return a.from < b.from ? -1 : 1; });
      for (var i = 1; i < sorted.length; i++) {
        if (sorted[i].from < sorted[i - 1].to) {
          problems.push(o.id + ': брони наложились — ' + U.range(sorted[i - 1].from, sorted[i - 1].to) +
                        ' и ' + U.range(sorted[i].from, sorted[i].to));
        }
      }
    });
    return problems;
  };

  KB.capacityMax = function () {
    return KB.objects.reduce(function (m, o) { return Math.max(m, o.capacity + o.extraBeds); }, 0);
  };

  KB.applyTimezone();

  if (typeof module !== 'undefined' && module.exports) module.exports = KB;
  w.KB = KB;
})(typeof window !== 'undefined' ? window : globalThis);
