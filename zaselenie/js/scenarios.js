/* Библиотека сценариев. Порядок важен: выигрывает первое совпадение,
   но агент сохраняет все сработавшие — чтобы видеть, что ещё было в запросе.
   Каждый сценарий отвечает на три вопроса: что это, что делаем, что пишем. */
(function (w) {
  'use strict';

  var U  = w.U  || (typeof require !== 'undefined' ? require('./util.js') : null);
  var KB = w.KB || (typeof require !== 'undefined' ? require('./knowledge.js') : null);
  var PO = w.PO || (typeof require !== 'undefined' ? require('./policy.js') : null);
  var R  = w.R  || (typeof require !== 'undefined' ? require('./reply.js') : null);

  var S = {};
  var Set = KB.settings;

  /* ---------- общие куски ответа ---------- */

  /* Всё, что гость упомянул дополнительно: питомец, ранний заезд, документы… */
  function addons(a, obj) {
    var s = a.signals, out = [];
    if (s.pets) {
      out.push(obj && !obj.pets
        ? 'С питомцем в эту квартиру нельзя, но можно на Юнусабад, Чиланзар или Сергели: +' + U.money(Set.petFee) + '/ночь и депозит +' + U.money(Set.petDeposit) + '.'
        : 'С питомцем можно: +' + U.money(Set.petFee) + '/ночь, депозит +' + U.money(Set.petDeposit) + '.');
    }
    if (s.earlyCheckIn) out.push('Ранний заезд — 50% суток, подтверждаю накануне вечером, если ночь до вас свободна.');
    if (s.lateCheckOut) out.push('Поздний выезд — 50% суток, подтверждаю за сутки.');
    if (s.lateArrival) out.push('Ночной заезд после ' + Set.lateCheckInFrom + ' — ' + U.money(Set.lateCheckInFee) + ', код от сейф-бокса придёт сюда же.');
    if (s.registration && !s.fakeReg) out.push(KB.faq.registration);
    if (s.invoice) out.push(KB.faq.invoice);
    if (a.guests.children || a.prefs.needCrib) out.push(KB.faq.kids);
    if (s.transfer) out.push(KB.faq.transfer);
    if (s.photos) out.push('Фото и планировку пришлю следующим сообщением.');
    if (s.address) out.push(KB.faq.address);
    if (s.payment) out.push(KB.faq.payment);
    if (s.prepayNo) out.push('Без предоплаты даты держу ' + Set.holdMinutes + ' минут — дальше квартира снова в продаже.');
    if (s.smoking) out.push(KB.faq.smoking + ' Курение в квартире — штраф ' + U.money(Set.smokingFine) + '.');
    if (s.selfCheckIn) out.push(KB.faq.selfCheckIn);
    if (a.prefs.needParking && obj) out.push('Парковка: ' + obj.parking + '.');
    if (s.docsNo === false && a.lang === 'ru' && a.foreigner) out.push(KB.faq.docs);
    return out;
  }

  /* «беру ближайшие выходные», «месяц не назван» — гость должен это увидеть */
  function assumptions(a) {
    var list = (a.dates.assumed || []).concat(a.guests.assumed || []).concat(a.budget.assumed || [])
      .filter(function (x) { return !/бюджет за ночь|по курсу/.test(x); });
    return list.length ? 'Уточню, как понял: ' + list.join('; ') + '. Поправьте, если не так.' : null;
  }

  function offersReply(a, head) {
    var m = a.match;
    var best = m.offers[0];
    var body = R.offers(m.offers, 2);
    var extra = addons(a, best.object);
    var discount = a.signals.discount && a.dates.nights < Set.weekDiscountFrom
      ? 'Скидку могу дать 5%, если оплачиваете сразу все ночи.' : null;
    if (a.req.repeatGuest) extra.unshift('Как постоянному гостю скидка ' + Math.round(Set.repeatGuestDiscount * 100) + '% уже в цене.');
    return R.lines([
      head,
      assumptions(a),
      '',
      body,
      '',
      m.offers.length > 1 ? R.termsMulti(m.offers.slice(0, 2)) : R.terms(best.quote),
      extra.length ? '' : null,
      extra.length ? extra.join('\n') : null,
      discount ? '' : null,
      discount,
      '',
      m.offers.length > 1 ? 'Какой вариант берём? ' + R.hold() : R.hold()
    ]);
  }

  function ask(a, head, questions) {
    return R.lines([head, questions.length ? '' : null, R.ask(questions)]);
  }

  /* ---------- сценарии ---------- */

  S.list = [

    /* ===== 0. Мусор и границы разговора ===== */
    {
      id: 'empty', title: 'Пустое сообщение', group: 'служебные',
      when: function (a) { return a.empty; },
      build: function () {
        return { action: 'ask', reason: 'нет текста',
          reply: 'Кажется, сообщение пустое. Напишите даты и число гостей — подберу квартиру.' };
      }
    },
    {
      id: 'media-only', title: 'Голосовое или фото без текста', group: 'служебные',
      when: function (a) { return a.signals.media && a.length < 40; },
      build: function () {
        return { action: 'ask', reason: 'вложение без текста',
          reply: 'Я разбираю текст. Напишите, пожалуйста, коротко: даты, сколько гостей и район — отвечу сразу.' };
      }
    },
    {
      id: 'spam', title: 'Реклама и рассылки', group: 'служебные',
      when: function (a) { return a.signals.spam && !a.dates.from && !a.signals.book; },
      build: function () {
        return { action: 'ignore', reason: 'рассылка, не заявка',
          reply: 'Спасибо, предложение не по адресу. Этот чат — про бронирование квартир.',
          internal: 'Помечено как спам, менеджеру не передаю.' };
      }
    },
    {
      id: 'lang-en', title: 'Гость пишет на английском', group: 'служебные',
      when: function (a) { return a.lang === 'en' && !a.risk.hard; },
      build: function (a) {
        var S = Set;
        if (a.match && a.match.offers.length) {
          var list = a.match.offers.slice(0, 2).map(function (o, i) {
            return (i + 1) + ') ' + o.object.title + ' — ' + o.object.district +
                   ', up to ' + (o.object.capacity + o.object.extraBeds) + ' guests\n' +
                   '   ' + U.money(o.quote.perNightStay, 'UZS') + ' per night · ' +
                   U.money(o.quote.total, 'UZS') + ' total · deposit ' + U.money(o.quote.deposit, 'UZS');
          }).join('\n');
          return { action: 'offer', reason: 'заявка на английском разобрана',
            reply: R.lines([
              'Available for ' + a.dates.from + ' — ' + a.dates.to + ', ' + a.guests.total + ' guest(s):',
              '', list, '',
              'Cleaning, linen and Wi-Fi included. Check-in ' + S.checkIn + ', check-out ' + S.checkOut + '.',
              'Prepayment ' + Math.round(S.prepay * 100) + '%, the rest on arrival. Passport needed at check-in.',
              a.signals.pets ? 'Pets are allowed in these apartments for an extra fee.' : null,
              'Which one works for you? I can hold the dates for ' + S.holdMinutes + ' minutes.'
            ]) };
        }
        return { action: 'ask', reason: 'нужны даты, гость пишет по-английски',
          reply: R.lines([
            'Hi! Yes, we rent apartments in ' + (S.cityEn || S.city) + ' by the day.',
            'Tell me the dates and the number of guests — I will send options with exact prices.',
            'Example: "20-23 Nov for 2 people".',
            'Check-in ' + S.checkIn + ', check-out ' + S.checkOut + '. Parking is free at most of our apartments.',
            '',
            '(Отвечаю и по-русски — как удобнее.)'
          ]) };
      }
    },
    {
      id: 'lang-uz', title: 'Гость пишет по-узбекски', group: 'служебные',
      when: function (a) { return a.lang === 'uz' && !a.risk.hard; },
      build: function () {
        return { action: 'ask', reason: 'узбекский язык',
          reply: R.lines([
            'Assalomu alaykum! ' + Set.brand + ' — ' + Set.cityEn + 'da kunlik kvartiralar.',
            'Sanalarni va nechta mehmon ekanini yozing — narxlari bilan variantlarni yuboraman.',
            'Masalan: «12-15 noyabr, 3 kishi».',
            'Kirish ' + Set.checkIn + ', chiqish ' + Set.checkOut + '. Pasport kerak.',
            '',
            '(Rus tilida ham yozishingiz mumkin.)'
          ]) };
      }
    },

    /* ===== 1. Стоп-сценарии: отказ или человек ===== */
    {
      id: 'illegal', title: 'Незаконное использование', group: 'стоп',
      when: function (a) { return a.signals.illegal; },
      build: function () {
        return { action: 'decline', reason: 'запрещённое использование квартиры', escalate: true,
          reply: 'Такие запросы не обслуживаем. Квартиры сдаются только для проживания.',
          internal: 'Стоп-лист. Контакт передан менеджеру, диалог закрыт.' };
      }
    },
    {
      id: 'fraud', title: 'Мошенническая схема с оплатой', group: 'стоп',
      when: function (a) { return a.signals.fraud; },
      build: function () {
        return { action: 'escalate', reason: 'признаки мошенничества с платежом',
          reply: R.lines([
            'По оплате работаем только так: перевод на карту компании или наличные при заселении, реквизиты приходят из этого чата.',
            'Мы не просим коды из СМС, не принимаем оплату с чужих карт и не возвращаем «ошибочные» переводы на другие реквизиты.',
            R.human('нужно проверить платёж вручную')
          ]),
          internal: 'Возможная схема с возвратом «лишнего» платежа. Никаких переводов до проверки менеджером.' };
      }
    },
    {
      id: 'sublease', title: 'Пересдача и субаренда', group: 'стоп',
      when: function (a) { return a.signals.sublease; },
      build: function () {
        return { action: 'decline', reason: 'субаренда запрещена',
          reply: 'Пересдавать квартиру дальше нельзя — сдаём только тем, кто сам живёт. Если нужна квартира для себя, напишите даты, подберу.' };
      }
    },
    {
      id: 'fake-registration', title: 'Прописка без проживания', group: 'стоп',
      when: function (a) { return a.signals.fakeReg; },
      build: function () {
        return { action: 'decline', reason: 'фиктивная регистрация',
          reply: R.lines([
            'Регистрацию без фактического проживания не оформляем.',
            'Если вы реально живёте в квартире — временную регистрацию и миграционный учёт делаем сами, бесплатно, в течение ' + Set.registrationDays + ' суток после заезда.'
          ]) };
      }
    },
    {
      id: 'minor', title: 'Несовершеннолетний гость', group: 'стоп',
      when: function (a) { return a.signals.minor; },
      build: function () {
        return { action: 'decline', reason: 'возраст меньше ' + Set.minAge,
          reply: 'Заселяем с ' + Set.minAge + ' лет: договор и депозит оформляются на совершеннолетнего. Если кто-то из взрослых готов заселиться и быть ответственным — оформим на него.' };
      }
    },
    {
      id: 'no-docs', title: 'Отказ показывать документы', group: 'стоп',
      when: function (a) { return a.signals.docsNo; },
      build: function () {
        return { action: 'decline', reason: 'заселение без паспорта невозможно',
          reply: R.lines([
            'Без документов заселить не можем: ' + KB.faq.docs.toLowerCase() + ' — этого требует закон, мы подаём данные на учёт.',
            'Копии храним только для регистрации и никуда не передаём.'
          ]) };
      }
    },
    {
      id: 'storage', title: 'Квартира под склад', group: 'стоп',
      when: function (a) { return a.signals.storage; },
      build: function () {
        return { action: 'decline', reason: 'нежилое использование',
          reply: 'Под хранение товара квартиры не сдаём — только для проживания.' };
      }
    },
    {
      id: 'party', title: 'Вечеринка, день рождения, шумная компания', group: 'стоп',
      when: function (a) { return a.signals.party; },
      build: function (a) {
        var many = a.guests.total && a.guests.total >= 6;
        return { action: 'decline', reason: 'мероприятие в жилом доме',
          reply: R.lines([
            'Вечеринки и празднования в квартирах запрещены: дома жилые, после ' + Set.quietFrom + ' действует режим тишины, штраф ' + U.money(Set.partyFine) + ' и выселение без возврата.',
            many ? 'Для компании ' + U.guests(a.guests.total) + ' могу предложить проживание без мероприятия — например, две квартиры рядом.' : 'Если это спокойное проживание без гостей и музыки — подберу вариант, напишите даты.',
            'Под праздник лучше искать загородный дом или кафе — с этим не помогу.'
          ]),
          internal: 'Отказ по признакам мероприятия: ' + a.signals._matched.join(', ') + '. Если гость подтвердит спокойное проживание — можно вернуться к подбору с депозитом ×2.' };
      }
    },
    {
      id: 'hourly', title: 'Аренда на несколько часов', group: 'стоп',
      when: function (a) { return a.signals.hourly; },
      build: function () {
        return { action: 'decline', reason: 'минимальный срок — сутки',
          reply: 'Почасово не сдаём, минимальный срок — сутки: заезд с ' + Set.checkIn + ', выезд до ' + Set.checkOut + '. Если нужно переночевать одну ночь — подберу.' };
      }
    },
    {
      id: 'aggression', title: 'Конфликт и угрозы', group: 'стоп',
      when: function (a) { return a.signals.aggression; },
      build: function () {
        return { action: 'escalate', reason: 'конфликтный разговор',
          reply: R.lines([
            'Понимаю, что вы недовольны, и не буду спорить в переписке.',
            'Опишите одним сообщением, что произошло и какое решение вас устроит — передам сразу.',
            R.human('разбор спорной ситуации')
          ]) };
      }
    },
    {
      id: 'human', title: 'Просит живого человека', group: 'служебные',
      when: function (a) { return a.signals.human; },
      build: function () {
        return { action: 'handoff', reason: 'запрос оператора',
          reply: R.lines(['Да, я бот — отвечаю мгновенно и считаю цены.', R.human('вы просили человека')]) };
      }
    },

    /* ===== 2. Гость уже живёт: проблемы и просьбы ===== */
    {
      id: 'emergency', title: 'Авария или не может попасть в квартиру', group: 'проживание',
      when: function (a) {
        return a.signals.complaint && /нет воды|нет света|нет отоплен|не могу попасть|не открывается|затоп|залив|газ|дым|пожар|прорвал/.test(a.norm);
      },
      build: function (a) {
        var lock = /не могу попасть|не открывается|замок|код не подход/.test(a.norm);
        return { action: 'escalate', reason: 'срочная проблема у живущего гостя', priority: 'срочно',
          reply: R.lines([
            lock ? 'Сейчас решим. Пришлите, пожалуйста, адрес квартиры и что именно не открывается — дверь подъезда, сейф-бокс или сама дверь.'
                 : 'Принял, это срочно. Напишите адрес квартиры и что именно не работает — передаю мастеру прямо сейчас.',
            'Если проблема не решится за час — переселим в свободную квартиру того же класса без доплаты.',
            'Телефон дежурного: ' + Set.escalationPhone + ', звоните в любое время.'
          ]),
          internal: 'Срочная эскалация: живущий гость. SLA — ответ мастера 15 минут, решение час, иначе переселение.' };
      }
    },
    {
      id: 'damage', title: 'Гость сообщает об ущербе', group: 'проживание',
      when: function (a) { return a.signals.damage; },
      build: function () {
        return { action: 'escalate', reason: 'ущерб и депозит',
          reply: R.lines([
            'Спасибо, что сказали сами — так проще. Пришлите фото повреждения.',
            'Мелочи вроде разбитой чашки не считаем. Если нужен ремонт или замена, стоимость удержим из депозита и покажем чек, остаток вернём в тот же день.'
          ]) };
      }
    },
    {
      id: 'complaint', title: 'Жалоба на квартиру или сервис', group: 'проживание',
      when: function (a) { return a.signals.complaint; },
      build: function (a) {
        return { action: 'escalate', reason: 'жалоба по качеству',
          reply: R.lines([
            'Извините, так быть не должно. Пришлите фото и адрес — отправлю мастера или клинера сегодня.',
            'Если поправить быстро не получится, предложу переселение или пересчитаю стоимость за эти сутки.'
          ]),
          internal: 'Жалоба: «' + a.raw.slice(0, 120) + '». Проверить объект перед следующим заездом.' };
      }
    },
    {
      id: 'keys', title: 'Потерял ключи, захлопнул дверь', group: 'проживание',
      when: function (a) { return a.signals.keys; },
      build: function () {
        return { action: 'escalate', reason: 'доступ в квартиру', priority: 'срочно',
          reply: R.lines([
            'Не переживайте. Напишите адрес — привезу дубликат, обычно это 30–40 минут.',
            'Если замок захлопнулся и дубликат не подойдёт, вызовем мастера: вскрытие 250 000 сум, новый комплект ключей 150 000 сум.',
            'Дежурный телефон: ' + Set.escalationPhone + '.'
          ]) };
      }
    },

    /* ===== 3. Изменения брони ===== */
    {
      id: 'cancel', title: 'Отмена брони', group: 'изменения',
      when: function (a) { return a.signals.cancel; },
      build: function (a) {
        var b = a.ctx.booking;
        if (!b) {
          return { action: 'ask', reason: 'нет данных о брони',
            reply: 'Отменю. Напишите, пожалуйста, даты брони и на чьё имя она оформлена — посчитаю возврат по условиям.' };
        }
        var r = PO.refund(b.from, b.prepay);
        return { action: 'confirm', reason: 'отмена по правилам',
          reply: R.lines([
            'Бронь ' + U.range(b.from, b.to) + ' отменяю.',
            'До заезда ' + U.plural(r.days, 'остался', 'осталось', 'осталось') + ' ' + r.days + ' ' + U.plural(r.days, 'день', 'дня', 'дней') + ', поэтому ' + r.note + ': ' + U.money(r.sum) + ' вернём на карту оплаты за 1–3 рабочих дня.',
            'Если планы сдвинулись, а не отменились — могу перенести даты без потери предоплаты.'
          ]),
          internal: 'Возврат ' + U.money(r.sum) + ' из ' + U.money(b.prepay) + '. Освободить календарь.' };
      }
    },
    {
      id: 'change-dates', title: 'Перенос дат', group: 'изменения',
      when: function (a) { return a.signals.changeDates; },
      build: function (a) {
        var b = a.ctx.booking;
        if (!a.dates.from) {
          return { action: 'ask', reason: 'нет новых дат',
            reply: 'Перенесём. На какие даты сдвигаем? Проверю, свободна ли та же квартира, и посчитаю разницу в цене.' };
        }
        if (b) {
          var obj = KB.byId(b.objectId), nights = a.dates.nights || U.diffDays(b.from, b.to);
          var to = a.dates.to || U.addDays(a.dates.from, nights);
          var free = PO.isFree(obj, a.dates.from, to);
          if (free.free) {
            var q = PO.quote(obj, { from: a.dates.from, to: to, guests: b.guests });
            var diff = q.total - (b.total || 0);
            return { action: 'confirm', reason: 'новые даты свободны',
              reply: R.lines([
                obj.title + ' на ' + U.range(a.dates.from, to) + ' свободна — переношу.',
                'Новая сумма ' + U.money(q.total) + (diff ? (diff > 0 ? ', доплата ' + U.money(diff) : ', вернём разницу ' + U.money(-diff)) : ', цена та же') + '.',
                'Предоплата переходит на новые даты.'
              ]) };
          }
          var win = PO.nearestWindows(obj, a.dates.from, nights, 2);
          return { action: 'offer', reason: 'даты заняты, есть соседние',
            reply: R.lines([
              'На ' + U.range(a.dates.from, to) + ' эта квартира занята.',
              win.length ? 'Свободна ' + win.map(function (x) { return U.range(x.from, x.to); }).join(' или ') + '.' : null,
              'Либо перенесу в другую квартиру на ваши даты — скажите, что удобнее.'
            ]) };
        }
        return { action: 'ask', reason: 'нет исходной брони',
          reply: 'Напишите, какая бронь переносится (даты и имя), и на какие даты — проверю и пересчитаю.' };
      }
    },
    {
      id: 'extend', title: 'Продление проживания', group: 'изменения',
      when: function (a) { return a.signals.extend; },
      build: function (a) {
        var b = a.ctx.booking;
        var addNights = a.dates.nights || 1;
        if (!b) {
          return { action: 'ask', reason: 'нет текущей брони',
            reply: 'Продлим. Напишите адрес квартиры и до какого числа хотите остаться — проверю, свободна ли она дальше.' };
        }
        var obj = KB.byId(b.objectId);
        var newTo = U.addDays(b.to, addNights);
        var free = PO.isFree(obj, b.to, newTo);
        if (free.free) {
          var q = PO.quote(obj, { from: b.to, to: newTo, guests: b.guests });
          return { action: 'confirm', reason: 'квартира свободна дальше',
            reply: R.lines([
              'Можно остаться до ' + U.fmtFull(newTo) + ' — квартира свободна.',
              'Доплата ' + U.money(q.total) + ' за ' + U.nights(addNights) + '. Переезжать не нужно, уборку сделаем по вашему графику.'
            ]) };
        }
        var alt = PO.freeOn(b.to, newTo);
        return { action: 'offer', reason: 'после выезда квартира занята',
          reply: R.lines([
            'В этой квартире после ' + U.fmtFull(b.to) + ' уже заезжают другие гости.',
            alt.length ? 'Могу переселить рядом: ' + alt.slice(0, 2).map(function (o) { return o.title + ' — ' + U.money(PO.nightPrice(o, b.to)) + '/ночь'; }).join('; ') + '. Переезд поможем организовать.' : 'На эти даты всё занято — подскажу, как только что-то освободится.'
          ]) };
      }
    },

    /* ===== 4. Особые типы заявок ===== */
    {
      id: 'group', title: 'Большая группа, нужно несколько квартир', group: 'заявка',
      when: function (a) { return (a.guests.total && a.guests.total > KB.capacityMax()) || (a.signals.group && a.guests.total > 6); },
      build: function (a) {
        if (!a.dates.from || !a.dates.to) {
          return { action: 'ask', reason: 'группа без дат',
            reply: ask(a, 'Разместим ' + U.guests(a.guests.total || 0) + ' в двух-трёх квартирах рядом — так дешевле, чем отель.', ['На какие даты?', 'Сколько мужчин и женщин, нужны ли раздельные квартиры?']) };
        }
        var c = PO.combo({ from: a.dates.from, to: a.dates.to, guests: a.guests.total, pets: a.signals.pets });
        if (!c) {
          return { action: 'escalate', reason: 'не хватает свободных квартир',
            reply: R.lines(['На ' + U.range(a.dates.from, a.dates.to) + ' столько мест сразу нет.', R.human('подберём варианты у партнёров')]) };
        }
        return { action: 'offer', reason: 'групповое размещение',
          reply: R.lines([
            'На ' + U.guests(a.guests.total) + ', ' + U.range(a.dates.from, a.dates.to) + ' собрал комплект:',
            '',
            c.parts.map(function (p, i) { return (i + 1) + ') ' + p.object.title + ' — ' + R.objLine(p.object) + ' → ' + U.guests(p.guests) + ', ' + U.money(p.quote.total); }).join('\n'),
            '',
            'Итого ' + U.money(c.total) + ' за ' + U.nights(U.diffDays(a.dates.from, a.dates.to)) + ' на всех.',
            'Оформляем одной бронью, предоплата ' + Math.round(Set.prepay * 100) + '%. Для компании сделаем договор и закрывающие документы.',
            R.hold()
          ]),
          internal: 'Групповая заявка. Проверить у менеджера скидку от 3 квартир.' };
      }
    },
    {
      id: 'long-stay', title: 'Длительная аренда от месяца', group: 'заявка',
      when: function (a) { return a.signals.longStay || (a.dates.nights && a.dates.nights >= Set.longStayFrom); },
      build: function (a) {
        var nights = a.dates.nights || 30;
        var from = a.dates.from || U.addDays(U.today(), 1);
        var to = a.dates.to || U.addDays(from, nights);
        var m = PO.match({ from: from, to: to, guests: a.guests.total || 2, pets: a.signals.pets, rooms: a.prefs.rooms });
        var head = 'На ' + U.nights(nights) + ' работает длительный тариф: скидка ' + Math.round(Set.longStayDiscount * 100) + '%, договор, оплата помесячно.';
        if (m.offers.length) {
          return { action: 'offer', reason: 'длительное проживание',
            reply: R.lines([
              head, '',
              R.offers(m.offers, 2), '',
              'Депозит один раз, коммунальные включены. Регистрацию оформляем сразу.',
              'Нужен паспорт и предоплата за первый месяц. Подойдёт — закреплю квартиру за вами.'
            ]),
            internal: 'Длительная аренда: передать менеджеру для договора.' };
        }
        var starts = [];
        KB.objects.forEach(function (o) {
          PO.nearestWindows(o, from, Math.min(nights, 30), 1).forEach(function (win) {
            if (win.shift > 0) starts.push({ object: o, from: win.from, to: win.to });
          });
        });
        starts.sort(function (x, y) { return x.from < y.from ? -1 : 1; });
        if (starts.length) {
          return { action: 'offer', reason: 'сдвигаем старт длительной брони',
            reply: R.lines([
              head,
              'Ровно с ' + U.fmt(from) + ' на такой срок всё занято, но освобождается:',
              starts.slice(0, 2).map(function (x) {
                return '· ' + x.object.title + ' — с ' + U.fmtFull(x.from) + ', ' + U.money(PO.nightPrice(x.object, x.from)) + '/ночь до скидки';
              }).join('\n'),
              'Могу закрепить за вами дату освобождения — предоплата за первый месяц вносится ближе к заезду.'
            ]),
            internal: 'Длительная аренда со сдвигом старта. Проверить, не съедет ли текущий гость раньше.' };
        }
        return { action: 'escalate', reason: 'нет подходящих на длинный срок',
          reply: R.lines([head, 'На эти даты свободных под длительное проживание нет.', R.human('подберём из ближайших освобождающихся')]) };
      }
    },
    {
      id: 'corporate', title: 'Командировка и документы для юрлица', group: 'заявка',
      when: function (a) {
        /* Если заявка полная, её ведёт основной сценарий, а документы попадают в дополнения */
        return a.signals.invoice && !(a.match && a.match.offers.length && a.dates.from && a.guests.total);
      },
      build: function (a) {
        var base = R.lines([
          'С юрлицами работаем: договор, счёт, акт и счёт-фактура, оплата по безналу (обычно 1–2 рабочих дня).',
          'Для счёта нужны реквизиты компании, ФИО гостей и даты.'
        ]);
        if (a.match && a.match.offers.length) {
          var sorted = a.match.offers.slice().sort(function (x, y) {
            var wx = x.object.features.indexOf('рабочее место') >= 0 ? 1 : 0;
            var wy = y.object.features.indexOf('рабочее место') >= 0 ? 1 : 0;
            return wy - wx || y.score - x.score;
          });
          a.match = { offers: sorted, rejected: a.match.rejected, alternatives: a.match.alternatives, status: a.match.status };
          return { action: 'offer', reason: 'корпоративная бронь',
            reply: R.lines([base, '', R.offers(a.match.offers, 2), '', 'Для командировок чаще берут Мирабад — там рабочее место и тихо. Выставить счёт?']),
            internal: 'Корпоратив: запросить реквизиты, счёт готовит бухгалтерия.' };
        }
        return { action: 'ask', reason: 'корпоративная заявка без дат',
          reply: ask(a, base, ['На какие даты и сколько сотрудников?', 'Нужны отдельные квартиры или можно вместе?']) };
      }
    },
    {
      id: 'registration', title: 'Вопрос про регистрацию и миграционный учёт', group: 'инфо',
      when: function (a) { return a.signals.registration && !a.dates.from; },
      build: function () {
        return { action: 'info', reason: 'вопрос про учёт',
          reply: R.lines([KB.faq.registration, KB.faq.docs, 'Напишите даты — подберу квартиру и всё оформим вместе с заездом.']) };
      }
    },

    /* ===== 5. Проблемы с датами ===== */
    {
      id: 'dates-invalid', title: 'Даты в прошлом или перепутаны', group: 'заявка',
      when: function (a) { return a.dates.issues.length > 0; },
      build: function (a) {
        var issue = a.dates.issues[0];
        return { action: 'ask', reason: issue,
          reply: R.lines([
            /прошла/.test(issue) ? 'Кажется, дата заезда уже прошла — уточните, пожалуйста, какой месяц имеется в виду.'
              : /не позже/.test(issue) ? 'Похоже, выезд получился раньше заезда. Напишите даты ещё раз: с какого по какое?'
              : 'Уточню по срокам: ' + issue + '.',
            'Например: «с 12 по 15 ноября» или «с 3 числа на 4 ночи».'
          ]) };
      }
    },
    {
      id: 'next-free', title: 'Когда ближайшее свободное', group: 'заявка',
      when: function (a) { return a.signals.otherDates && a.matchReq; },
      build: function (a) {
        var next = PO.nextAvailable(a.matchReq, 90);
        if (!next) {
          return { action: 'escalate', reason: 'на горизонте трёх месяцев свободного нет',
            reply: R.lines([
              'Честно: на ближайшие три месяца под ваш запрос свободного нет.',
              R.human('подскажет, что освобождается раньше, и предложит партнёрские квартиры')
            ]) };
        }
        var q = next.offer.quote;
        return { action: 'offer', reason: 'ближайшая доступная дата',
          reply: R.lines([
            'Ближайшее, что подходит под ваш запрос: ' + U.range(next.from, next.to) + '.',
            next.offer.object.title + ' — ' + U.money(q.perNightStay) + '/ночь, за ' + U.nights(q.nights) + ' ' + U.money(q.total) + '.',
            'Если эти даты не подходят, напишите свои — проверю по всему фонду.'
          ]) };
      }
    },
    {
      id: 'no-availability', title: 'На эти даты нет подходящего', group: 'заявка',
      when: function (a) { return a.match && a.match.status === 'none'; },
      build: function (a) {
        var alt = R.alternatives(a.match);
        var tooShort = a.match.rejected.every(function (r) { return r.reasons.some(function (x) { return /минимум/.test(x); }); });
        if (tooShort) {
          /* Берём самый мягкий минимум: гостю важно, с какого срока хоть что-то
             доступно, а не сколько просит квартира под длительную аренду */
          var min = a.match.rejected.reduce(function (m, r) {
            return Math.min(m, PO.minNights(r.object, a.dates.from, a.dates.to));
          }, Infinity);
          var add = min - a.dates.nights;
          var season = PO.seasonsOf(a.dates.from, a.dates.to).map(function (x) { return x.name; }).join(', ');
          return { action: 'ask', reason: 'меньше минимального срока',
            reply: R.lines([
              'На эти даты минимум ' + U.nights(min) + (season ? ' — это ' + season : '') + ', а у вас ' + U.nights(a.dates.nights) + '.',
              'Добавьте ' + U.nights(add) + ' — например, ' + U.range(a.dates.from, U.addDays(a.dates.from, min)) +
                ' — или сдвиньте даты за пределы праздников, там минимума нет.'
            ]) };
        }

        var why = PO.whyBlocked(a.matchReq);
        var next = PO.nextAvailable(a.matchReq, 90);
        var nextLine = next
          ? 'Ближайшее подходящее — ' + U.range(next.from, next.to) + ': ' + next.offer.object.title +
            ', ' + U.money(next.offer.quote.perNightStay) + '/ночь.'
          : null;

        /* Свободные квартиры есть, просто не подходят — говорить «всё занято» нечестно */
        if (why.freeButUnfit) {
          var u = why.unfit[0];
          var group = a.guests.total && a.guests.total > u.object.capacity + u.object.extraBeds;
          var combo = group ? PO.combo({ from: a.dates.from, to: a.dates.to, guests: a.guests.total, pets: a.req.pets }) : null;
          return { action: 'offer', reason: 'свободное есть, но не под запрос',
            reply: R.lines([
              'Свободное на ' + U.range(a.dates.from, a.dates.to) + ' есть, но под ваш запрос не подходит:',
              why.unfit.slice(0, 3).map(function (x) {
                return '· ' + x.object.title + ' — ' + x.reasons.join(', ');
              }).join('\n'),
              '',
              combo ? 'Могу разместить вас в двух квартирах на эти же даты — вместе выйдет ' + U.money(combo.total) + '.' : null,
              nextLine,
              'Скажите, что удобнее: другие даты, несколько квартир или лист ожидания.'
            ]),
            internal: 'Свободные есть, но не подходят: ' + why.unfit.map(function (x) { return x.object.id; }).join(', ') + '.' };
        }

        return { action: 'offer', reason: 'нет свободных на запрошенные даты',
          reply: R.lines([
            'На ' + U.range(a.dates.from, a.dates.to) + ' всё занято — не буду обещать того, чего нет.',
            alt ? '' : null,
            alt ? 'Ближайшее свободное:' : null,
            alt,
            !alt && nextLine ? nextLine : null,
            !alt && !nextLine ? 'Свободного под ваш запрос нет и в ближайшие три месяца — это редкость, передам менеджеру, он посмотрит партнёрские квартиры.' : null,
            '',
            'Могу поставить вас первым в лист ожидания: если освободится, напишу сразу. Или подберу на другие даты — скажите, насколько они гибкие.'
          ]),
          escalate: !alt && !nextLine,
          internal: 'Лист ожидания на ' + U.range(a.dates.from, a.dates.to) + '.' };
      }
    },

    /* ===== 6. Основной путь брони ===== */
    {
      id: 'booking-payment', title: 'Гость прислал контакты по удержанной брони', group: 'бронь',
      when: function (a) { return a.ctx.booking && a.ctx.booking.status === 'удержание' && (a.contacts.phone || a.signals.book || a.signals.payment); },
      build: function (a) {
        var b = a.ctx.booking, o = KB.byId(b.objectId);
        return { action: 'confirm', reason: 'бронь оформляется',
          reply: R.lines([
            'Записал' + (a.contacts.name ? ': ' + a.contacts.name : '') + (a.contacts.phone ? ', ' + a.contacts.phone : '') + '.',
            'Бронь: ' + o.title + ', ' + U.range(b.from, b.to) + ', ' + U.guests(b.guests) + '.',
            '',
            'Предоплата ' + U.money(b.prepay) + ' — ' + Set.companyCard + '. Реквизиты отправлю следующим сообщением.',
            'Как только увижу оплату: пришлю точный адрес, код от подъезда и контакт встречающего.',
            'Остаток ' + U.money(b.total - b.prepay) + ' — при заезде, наличными или переводом.'
          ]),
          internal: 'Ждём предоплату ' + U.money(b.prepay) + ' по брони ' + b.objectId + '. Через ' + Set.holdMinutes + ' минут без оплаты — снять удержание.' };
      }
    },
    {
      id: 'payment-claimed', title: 'Гость говорит, что оплатил', group: 'бронь',
      when: function (a) { return a.signals.paid; },
      build: function (a) {
        var b = a.ctx.booking;
        if (b) {
          var o = KB.byId(b.objectId);
          return { action: 'escalate', reason: 'заявлена оплата, нужна сверка', priority: 'важно',
            reply: R.lines([
              'Спасибо, проверяю поступление — обычно перевод виден в течение 10–15 минут.',
              'Как только увижу оплату, пришлю точный адрес, код от подъезда и контакт встречающего по брони: ' +
                o.title + ', ' + U.range(b.from, b.to) + '.',
              'Если оплата была с чужой карты или другим способом — напишите, с какого номера и на какую сумму, так найду быстрее.'
            ]),
            internal: 'Гость заявил оплату ' + U.money(b.prepay) + ' по брони ' + b.objectId + '. Сверить поступление до отправки адреса.' };
        }
        return { action: 'escalate', reason: 'оплата без брони в системе', priority: 'важно',
          reply: R.lines([
            'Проверю платёж. Напишите, пожалуйста: сумму, время перевода и на какие даты бронь — по этим данным найду оплату.',
            'Адрес отправляю только после того, как вижу деньги на счёте, — так безопаснее для обеих сторон.'
          ]),
          internal: 'Гость заявил оплату, но брони в диалоге нет. Проверить поступление вручную.' };
      }
    },
    {
      id: 'booking-confirm', title: 'Гость выбрал вариант', group: 'бронь',
      when: function (a) { return a.selected; },
      build: function (a) {
        var o = a.selected.object, q = a.selected.quote;
        return { action: 'hold', reason: 'подтверждение брони',
          reply: R.lines([
            'Отлично, держу ' + o.title + ', ' + U.range(q.from, q.to) + ', ' + U.guests(q.guests) + '.',
            '',
            R.breakdown(q),
            '',
            'Чтобы закрепить, пришлите: ФИО, номер телефона и фото паспорта (нужно для регистрации).',
            'После предоплаты отправлю точный адрес, код от подъезда и инструкцию по заселению.',
            R.hold()
          ]),
          internal: 'Бронь-удержание ' + o.id + ' ' + q.from + '→' + q.to + ', предоплата ' + U.money(q.prepay) + '.' };
      }
    },
    {
      id: 'full-request', title: 'Полная заявка: даты, гости, всё считается', group: 'бронь',
      when: function (a) {
        if (!(a.match && a.match.offers.length > 0 && a.dates.from && a.dates.to && a.guests.total)) return false;
        /* Варианты уже на экране и ничего не изменилось — пусть отвечает
           справочный сценарий, а не второй раз тот же список */
        return !a.ctx.offers.length || a.freshChanged || a.signals.book;
      },
      build: function (a) {
        var head = 'Смотрю на ' + U.range(a.dates.from, a.dates.to) + ', ' + U.nights(a.dates.nights) + ', ' + U.guests(a.guests.total) +
                   (a.guests.children ? ' (из них ' + a.guests.children + ' ' + U.plural(a.guests.children, 'ребёнок', 'детей', 'детей') + ')' : '') + ' — свободно:';
        var over = a.budget.amount && a.match.offers[0].quote.perNight > a.budget.amount && a.budget.per === 'night';
        var reply = offersReply(a, head);
        if (over) {
          reply = R.lines([reply, '', 'В ваш бюджет ' + U.money(a.budget.amount) + '/ночь на эти даты попадает только эконом у вокзала — если интересно, пришлю.']);
        }
        return { action: 'offer', reason: 'заявка разобрана полностью', reply: reply,
          internal: 'Готово к брони. Осталось получить выбор варианта и контакты.' };
      }
    },
    {
      id: 'partial-request', title: 'Заявка неполная — уточняем', group: 'бронь',
      when: function (a) { return a.missing.length > 0 && (a.dates.from || a.guests.total || a.budget.amount || a.prefs.district || a.prefs.rooms !== null); },
      build: function (a) {
        var known = [];
        if (a.dates.from) known.push('даты: ' + R.dates(a));
        else if (a.dates.nights) known.push('срок: ' + U.nights(a.dates.nights));
        if (a.guests.total) known.push('гостей: ' + a.guests.total);
        if (a.prefs.rooms !== null && a.prefs.rooms !== undefined) {
          known.push(a.prefs.rooms ? a.prefs.rooms + '-комнатная' : 'студия');
        }
        if (a.budget.amount) known.push('бюджет: ' + U.money(a.budget.amount) + (a.budget.per === 'night' ? '/ночь' : ' всего'));
        if (a.prefs.district) known.push('район: ' + a.prefs.district);
        var head = known.length ? 'Записал: ' + known.join(', ') + '.' : 'Помогу подобрать квартиру.';
        var teaser = null;
        if (a.dates.from && a.dates.to && !a.guests.total) {
          var free = PO.freeOn(a.dates.from, a.dates.to);
          teaser = free.length ? 'На эти даты свободно ' + free.length + ' ' + U.plural(free.length, 'квартира', 'квартиры', 'квартир') + ', от ' + U.money(Math.min.apply(null, free.map(function (o) { return PO.nightPrice(o, a.dates.from); }))) + '/ночь.' : null;
        }
        if (!a.dates.from && !a.guests.total) teaser = R.priceFrom();
        var extra = addons(a, null);
        return { action: 'ask', reason: 'не хватает данных: ' + a.missing.join(', '),
          reply: R.lines([head, assumptions(a), teaser ? teaser : null,
                          extra.length ? '' : null, extra.length ? extra.join('\n') : null,
                          '', R.ask(a.questions)]),
          internal: 'Ждём: ' + a.missing.join(', ') + '.' };
      }
    },

    /* ===== 7. Вопросы без заявки ===== */
    {
      id: 'faq', title: 'Быт: Wi-Fi, кухня, стирка, парковка', group: 'вопросы',
      when: function (a) {
        /* Коляска и ограниченная подвижность — не бытовой вопрос, там свой сценарий */
        if (a.prefs.accessible) return false;
        return /wi-?fi|вайфай|интернет|кухн|готовить|стиральн|постирать|полотенц|бель[еёя]|убор|парковк|трансфер|фото|лифт|этаж/.test(a.norm);
      },
      build: function (a) {
        var t = a.norm, out = [];
        var shown = a.ctx.offers.map(function (o) { return o.object; });
        if (/парковк/.test(t) && shown.length) {
          out.push(shown.map(function (o) { return o.title + ' — парковка: ' + o.parking + '.'; }).join('\n'));
        }
        if (/лифт|этаж/.test(t) && shown.length) {
          out.push(shown.map(function (o) {
            return o.title + ' — ' + o.floor + '-й этаж, ' + (o.elevator ? 'лифт есть' : 'лифта нет') + '.';
          }).join('\n'));
        }
        if (/wi-?fi|вайфай|интернет/.test(t)) out.push(KB.faq.wifi);
        if (/кухн|готовить/.test(t)) out.push(KB.faq.kitchen);
        if (/стиральн|постирать/.test(t)) out.push(KB.faq.laundry);
        if (/полотенц|бель[еёя]/.test(t)) out.push(KB.faq.towels);
        if (/убор/.test(t)) out.push(KB.faq.cleaning);
        if (/парковк/.test(t) && !shown.length) out.push(KB.faq.parking);
        if (/трансфер/.test(t)) out.push(KB.faq.transfer);
        if (/фото/.test(t)) out.push('Фото и планировки пришлю следующим сообщением — скажите, какой район интересует.');
        out.push(a.ctx.offers.length ? 'Ещё вопросы — или бронируем?' : 'Что-то ещё уточнить, или подбираем даты?');
        return { action: 'info', reason: 'справочный вопрос', reply: R.lines(out) };
      }
    },
    {
      id: 'discount', title: 'Просят скидку', group: 'вопросы',
      when: function (a) { return a.signals.discount; },
      build: function (a) {
        var lines = [
          'Цены держим без наценки за переписку, но скидки есть:',
          '· от ' + Set.weekDiscountFrom + ' ночей — ' + Math.round(Set.weekDiscount * 100) + '%',
          '· от ' + Set.longStayFrom + ' ночей — ' + Math.round(Set.longStayDiscount * 100) + '%',
          '· постоянным гостям — ' + Math.round(Set.repeatGuestDiscount * 100) + '%'
        ];
        if (a.dates.nights && a.dates.nights < Set.weekDiscountFrom) {
          lines.push('На ваш срок могу дать 5% при оплате сразу за все ночи — это максимум, что решаю сам.');
        }
        if (a.match && a.match.offers.length) {
          lines.push('', 'С учётом этого: ' + a.match.offers[0].object.title + ' — ' + U.money(Math.round(a.match.offers[0].quote.total * 0.95)) + ' вместо ' + U.money(a.match.offers[0].quote.total) + '.');
        }
        return { action: 'offer', reason: 'торг в пределах полномочий', reply: R.lines(lines),
          internal: 'Скидка больше 10% — только через менеджера.' };
      }
    },
    {
      id: 'price', title: 'Вопрос о цене без дат', group: 'вопросы',
      when: function (a) { return a.signals.price; },
      build: function (a) {
        return { action: 'ask', reason: 'цена зависит от дат',
          reply: R.lines([
            R.priceFrom(),
            'В выходные и в праздники дороже, от ' + Set.weekDiscountFrom + ' ночей — скидка ' + Math.round(Set.weekDiscount * 100) + '%.',
            'Назовите даты и число гостей — посчитаю точно, с депозитом и предоплатой.'
          ]) };
      }
    },
    {
      id: 'availability', title: 'Есть ли свободные — без дат', group: 'вопросы',
      when: function (a) { return a.signals.availability || a.signals.book; },
      build: function () {
        return { action: 'ask', reason: 'нужны даты',
          reply: 'Свободные есть почти всегда — вопрос в датах. Напишите: с какого по какое и сколько гостей?' };
      }
    },
    {
      id: 'address', title: 'Просят точный адрес до брони', group: 'вопросы',
      when: function (a) { return a.signals.address; },
      build: function () {
        return { action: 'info', reason: 'политика адреса',
          reply: R.lines([
            KB.faq.address,
            'Районы: центр (Амира Темура), Мирабад, Юнусабад, Чиланзар, Сергели и у Северного вокзала — от каждого до метро 3–10 минут.',
            'Скажите, какой район удобнее, и я пришлю ориентиры и фото двора.'
          ]) };
      }
    },
    {
      id: 'payment', title: 'Как оплатить', group: 'вопросы',
      when: function (a) { return a.signals.payment || a.signals.prepayNo; },
      build: function (a) {
        var lines = [KB.faq.payment];
        if (a.signals.prepayNo) {
          lines.push('Без предоплаты даты держу ' + Set.holdMinutes + ' минут — дальше квартира снова в продаже, брони не будет.',
                     'Если не хотите платить заранее — можно приехать и заселиться в свободную квартиру в тот же день, но выбор будет из того, что останется.');
        }
        return { action: 'info', reason: 'вопрос по оплате', reply: R.lines(lines) };
      }
    },
    {
      id: 'pets', title: 'Вопрос про животных', group: 'вопросы',
      when: function (a) { return a.signals.pets; },
      build: function () {
        var ok = KB.objects.filter(function (o) { return o.pets; }).map(function (o) { return o.title; });
        return { action: 'info', reason: 'pet policy',
          reply: R.lines([
            'С питомцем можно в: ' + ok.join(', ') + '.',
            'Доплата ' + U.money(Set.petFee) + '/ночь, депозит +' + U.money(Set.petDeposit) + ' — возвращаем, если всё цело.',
            'Одного оставлять в квартире нельзя. Напишите даты и породу — подберу.'
          ]) };
      }
    },
    {
      id: 'accessibility', title: 'Доступность: лифт, коляска', group: 'вопросы',
      when: function (a) { return a.prefs.accessible; },
      build: function () {
        var ok = KB.objects.filter(function (o) { return o.elevator && o.accessible; });
        return { action: 'info', reason: 'доступность',
          reply: R.lines([
            'С лифтом и без ступеней на входе: ' + ok.map(function (o) { return o.title + ' (' + o.floor + '-й этаж)'; }).join(', ') + '.',
            'В Мирабаде широкие двери и большая ванная — там удобнее всего с коляской.',
            'Напишите даты — проверю, свободна ли.'
          ]) };
      }
    },
    {
      id: 'checkin-time', title: 'Время заезда и выезда', group: 'вопросы',
      when: function (a) { return a.signals.checkinTime || a.signals.earlyCheckIn || a.signals.lateCheckOut || a.signals.lateArrival || a.signals.selfCheckIn; },
      build: function (a) {
        return { action: 'info', reason: 'вопрос по заезду',
          reply: R.lines([KB.faq.checkin].concat(addons(a, null)).concat([
            a.dates.from ? 'Во сколько планируете быть на месте? Подстроим заселение под ваше время.'
                         : 'Напишите даты и время прилёта — подстроим заселение под вас.'
          ])) };
      }
    },
    {
      id: 'thanks', title: 'Благодарность', group: 'служебные',
      when: function (a) { return a.signals.thanks && a.length < 60 && !a.dates.from; },
      build: function (a) {
        var b = a.ctx.booking;
        return { action: 'info', reason: 'вежливый обмен',
          reply: b
            ? 'Пожалуйста! Бронь на месте: ' + U.range(b.from, b.to) + '. Напишите за день до заезда — пришлю адрес и инструкцию.'
            : 'Пожалуйста! Появятся даты — напишите, подберу и посчитаю.' };
      }
    },
    {
      id: 'later', title: 'Гость взял паузу подумать', group: 'служебные',
      when: function (a) { return a.signals.later; },
      build: function (a) {
        var hold = a.ctx.offers.length;
        return { action: 'info', reason: 'пауза на решение',
          reply: R.lines([
            'Хорошо, не тороплю.',
            hold ? 'Эти даты держу ' + Set.holdMinutes + ' минут, дальше квартира снова в продаже — если решите позже, просто напишите, проверю заново.'
                 : 'Напишите, когда определитесь с датами, — подберу по наличию на тот момент.',
            'Цены на выходные и праздники растут, так что раннее бронирование обычно дешевле.'
          ]) };
      }
    },
    {
      id: 'greeting', title: 'Просто поздоровались', group: 'служебные',
      when: function (a) { return a.signals.greeting; },
      build: function () {
        return { action: 'ask', reason: 'начало диалога',
          reply: R.lines([
            'Здравствуйте! ' + Set.brand + ' — ' + Set.business + ' в ' + (Set.cityIn || Set.city) + '.',
            'Напишите даты и сколько гостей — подберу варианты с ценами.'
          ]) };
      }
    },
    {
      id: 'fallback', title: 'Не понял запрос', group: 'служебные',
      when: function () { return true; },
      build: function (a) {
        return { action: 'ask', reason: 'запрос не распознан',
          reply: R.lines([
            'Хочу ответить точно, поэтому уточню.',
            'Напишите, пожалуйста: даты заезда и выезда, сколько гостей и в каком районе искать.',
            'Если вопрос не про бронь — опишите одной фразой, что нужно, и я подключу менеджера.'
          ]),
          internal: 'Нераспознанный запрос: «' + a.raw.slice(0, 120) + '». Стоит посмотреть, не пропущен ли сценарий.' };
      }
    }
  ];

  S.byId = function (id) {
    for (var i = 0; i < S.list.length; i++) if (S.list[i].id === id) return S.list[i];
    return null;
  };

  S.addons = addons;

  if (typeof module !== 'undefined' && module.exports) module.exports = S;
  w.SCEN = S;
})(typeof window !== 'undefined' ? window : globalThis);
