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
    city: 'Ташкент',
    cityIn: 'Ташкенте',
    cityEn: 'Tashkent',
    currency: 'сум',
    checkIn: '14:00',
    checkOut: '12:00',
    officeFrom: '09:00',
    officeTo: '21:00',
    quietFrom: '23:00',
    quietTo: '08:00',
    minAge: 18,
    docs: 'паспорт или ID-карта на каждого взрослого гостя',
    registration: true,              // делаем временную регистрацию / миграционный учёт
    registrationDays: 3,             // в течение скольких суток оформляем
    registrationFee: 0,
    prepay: 0.3,                     // доля предоплаты от суммы проживания
    holdMinutes: 60,                 // сколько держим даты без предоплаты
    peakPrepay: 1,                   // в пиковые даты — 100%
    lateCheckInFrom: '23:00',
    lateCheckInFee: 100000,
    earlyCheckInPart: 0.5,           // доля суток за ранний заезд
    lateCheckOutPart: 0.5,
    extraGuestFee: 60000,            // за гостя сверх базовой вместимости за ночь
    petFee: 100000,                  // за питомца за ночь
    petDeposit: 300000,
    smokingFine: 700000,
    partyFine: 1500000,
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
    payments: ['перевод на карту компании', 'наличные при заселении', 'безналичный расчёт для юрлиц'],
    companyCard: 'карта компании, реквизиты приходят из этого же чата',
    manager: { name: 'Азиз', phone: '+998 90 123-45-67', hours: '09:00–21:00' },
    escalationPhone: '+998 90 123-45-67'
  };

  /* Сезонные коэффициенты к базовой цене. from/to — 'ММ-ДД' включительно */
  KB.seasons = [
    { id: 'ny', name: 'новогодние даты', from: '12-28', to: '01-05', k: 1.6, minNights: 3, peak: true },
    { id: 'navruz', name: 'Навруз', from: '03-19', to: '03-23', k: 1.3, minNights: 2, peak: true },
    { id: 'high', name: 'высокий сезон', from: '04-20', to: '06-10', k: 1.15, minNights: 1, peak: false },
    { id: 'low', name: 'низкий сезон', from: '01-10', to: '02-20', k: 0.85, minNights: 1, peak: false }
  ];

  /* Занятость задаётся сдвигом от сегодня, чтобы демо жило без ручных правок */
  function busy(fromOffset, nights, who) {
    var from = U.addDays(U.today(), fromOffset);
    return { from: from, to: U.addDays(from, nights), guest: who || 'бронь' };
  }

  KB.objects = [
    {
      id: 'studio-amir',
      title: 'Студия на Амира Темура',
      rooms: 0, beds: 'двуспальная кровать',
      capacity: 2, extraBeds: 1,
      district: 'центр, Амира Темура',
      metro: 'Мустакиллик майдони, 5 минут',
      floor: 7, floors: 9, elevator: true,
      base: 420000, weekendK: 1.15,
      minNights: 1,
      deposit: 500000,
      cleaning: 0,
      pets: false,
      smoking: false,
      parking: 'бесплатная во дворе, без шлагбаума',
      selfCheckIn: true,
      features: ['wi-fi 100 мбит', 'кондиционер', 'стиральная машина', 'посудомойка нет', 'вид на парк'],
      accessible: true,
      note: 'тихий дом, много деловых гостей',
      busy: [busy(2, 3), busy(9, 2), busy(21, 5)]
    },
    {
      id: 'two-yunusabad',
      title: '2-комнатная на Юнусабаде',
      rooms: 2, beds: 'двуспальная + два раздельных места',
      capacity: 4, extraBeds: 2,
      district: 'Юнусабад, 4 квартал',
      metro: 'Хабиб Абдуллаев, 10 минут',
      floor: 3, floors: 5, elevator: false,
      base: 620000, weekendK: 1.1,
      minNights: 1,
      deposit: 700000,
      cleaning: 0,
      pets: true,
      smoking: false,
      parking: 'бесплатная',
      selfCheckIn: true,
      features: ['wi-fi 100 мбит', 'два кондиционера', 'стиральная машина', 'детская кроватка по запросу', 'большая кухня'],
      accessible: false,
      note: 'семейный вариант, можно с питомцем',
      busy: [busy(0, 2), busy(5, 4), busy(30, 7)]
    },
    {
      id: 'three-mirabad',
      title: '3-комнатная премиум в Мирабаде',
      rooms: 3, beds: 'две двуспальные + диван',
      capacity: 6, extraBeds: 2,
      district: 'Мирабад, рядом с Ташкент-Сити',
      metro: 'Ойбек, 7 минут',
      floor: 12, floors: 16, elevator: true,
      base: 1100000, weekendK: 1.2,
      minNights: 2,
      deposit: 1500000,
      cleaning: 150000,
      pets: false,
      smoking: false,
      parking: 'подземная, 50 000 сум в сутки',
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
      district: 'Шайхантахур, у Северного вокзала',
      metro: 'Туркистон, 3 минуты',
      floor: 2, floors: 4, elevator: false,
      base: 280000, weekendK: 1.05,
      minNights: 1,
      deposit: 300000,
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
      id: 'loft-chilanzar',
      title: 'Лофт на Чиланзаре',
      rooms: 1, beds: 'двуспальная + два раздельных места',
      capacity: 4, extraBeds: 1,
      district: 'Чиланзар, 9 квартал',
      metro: 'Новза, 8 минут',
      floor: 5, floors: 9, elevator: true,
      base: 540000, weekendK: 1.15,
      minNights: 1,
      deposit: 600000,
      cleaning: 0,
      pets: true,
      smoking: false,
      parking: 'бесплатная',
      selfCheckIn: true,
      features: ['wi-fi 100 мбит', 'высокие потолки', 'стиральная машина', 'проектор'],
      accessible: true,
      note: 'можно с животными, любят молодые пары',
      busy: [busy(4, 2), busy(16, 4)]
    },
    {
      id: 'long-sergeli',
      title: '2-комнатная на Сергели для долгих сроков',
      rooms: 2, beds: 'двуспальная + односпальная',
      capacity: 4, extraBeds: 0,
      district: 'Сергели, новостройка',
      metro: 'Сергели, 6 минут',
      floor: 8, floors: 12, elevator: true,
      base: 380000, weekendK: 1.0,
      minNights: 7,
      deposit: 500000,
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
    cleaning: 'Уборка перед заездом включена в цену. Уборка во время проживания — по запросу, 120 000 сум.',
    kids: 'С детьми можно, детская кроватка и стульчик бесплатно на Юнусабаде и в Мирабаде, нужно предупредить заранее.',
    transfer: 'Встреча в аэропорту или на вокзале — 120 000 сум, заказывать минимум за 6 часов.',
    parking: 'Парковка есть у всех объектов, в Мирабаде подземная за 50 000 сум в сутки.',
    smoking: 'Курить в квартирах нельзя, на балконе тоже. Есть места для курения во дворе.',
    docs: 'Для заселения нужен паспорт или ID-карта на каждого взрослого гостя, гостям 18+.',
    registration: 'Временную регистрацию и миграционный учёт делаем сами в течение 3 суток после заезда, бесплатно. Нужны фото паспортов.',
    payment: 'Оплата: перевод на карту компании, наличные при заселении или безнал для юрлиц. Предоплата 30%, остальное при заезде.',
    invoice: 'Для юрлиц работаем по договору, даём счёт, акт и счёт-фактуру. Оплата по безналу, обычно 1–2 рабочих дня.',
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
    'бронь дороже 10 000 000 сум или дольше 28 ночей',
    'любой случай, где гость уже написал третий раз и вопрос не решён'
  ];

  KB.byId = function (id) {
    for (var i = 0; i < KB.objects.length; i++) if (KB.objects[i].id === id) return KB.objects[i];
    return null;
  };

  KB.capacityMax = function () {
    return KB.objects.reduce(function (m, o) { return Math.max(m, o.capacity + o.extraBeds); }, 0);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = KB;
  w.KB = KB;
})(typeof window !== 'undefined' ? window : globalThis);
