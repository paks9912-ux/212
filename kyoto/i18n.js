/* ============================================================
   KYOTO — два языка: русский и узбекский (латиница).

   Как работает:
     • статический текст в HTML помечен data-i18n="ключ";
     • динамический текст в app.js берётся через K.t("ключ");
     • названия блюд переводит names-uz.json (ключ — имя из Poster);
     • выбор языка живёт в localStorage и в <html lang>.

   Ключи именуем по смыслу, а не по тексту: cart.title, а не «Корзина».
   ============================================================ */

window.I18N = (function () {

    var DICT = {

        ru: {
            "nav.menu": "Меню", "nav.sets": "Сеты", "nav.delivery": "Доставка",
            "search.ph": "Поиск по меню…", "search.aria": "Поиск по меню",
            "addr.ask": "Куда везём?", "addr.aria": "Адрес доставки",
            "addr.new": "＋ Добавить новый адрес",
            "addr.hint": "Адрес сохранится после первого заказа",
            "addr.prompt": "Новый адрес доставки\nУлица, дом, квартира:",
            "addr.short": "Адрес слишком короткий — укажите улицу и дом",
            "addr.del": "Удалить адрес",
            "cart.btn": "Корзина", "cart.goto": "Оформить", "cart.title": "Корзина",
            "cart.empty": "Корзина пуста",
            "cart.emptyHint": "Начните с того, что берут чаще всего",
            "cart.openMenu": "Открыть всё меню",
            "cart.counting": "Считаем…",
            "cart.dishes": "Блюда", "cart.discount": "Второй ролл −20%", "cart.first": "Скидка на первый заказ", "cart.firstGap1": "До скидки", "cart.firstGap2": "не хватает", "cart.firstWait": "посчитаем после ввода телефона", "cart.firstCap": "достигнут максимум 30 000", "cart.firstCheck": "проверим номер при оформлении",
            "cart.delivery": "Доставка", "cart.deliveryByYandex": "по тарифу Яндекса",
            "cart.total": "К оплате", "cart.checkout": "Оформить заказ",
            "cart.removed": "Убрали из заказа: ",
            "cart.giftNoStack": "Скидка на второй ролл не суммируется с подарком — выбрали подарок, он выгоднее",
            "toTop": "Наверх", "toTop": "Yuqoriga", "cart.upsell": "К этому часто берут",
            "cart.deliveryNote": "Считает Яндекс по вашему адресу. Оплачиваете курьеру при получении — отдельно от заказа.",
            "gift.title": "Подарок к заказу",
            "gift.tag": "🎁 Подарок",
            "gift.both": "Оба подарка ваши — {n1} и {n2}",
            "gift.first": "{n1} ваша. До <b>{n2}</b> не хватает <b>{s} {sum}</b>",
            "gift.toGo": "До подарка <b>{n1}</b> не хватает <b>{s} {sum}</b>",
            "gift.secondEyebrow": "Второй подарок ваш",
            "gift.secondTitle": " — в подарок!",
            "gift.secondText": "Вы набрали на оба подарка. Добавим их к заказу бесплатно — доплачивать ничего не нужно.",
            "gift.toCart": "Перейти в корзину", "gift.keepShopping": "Продолжить выбор",
            "note.add": "＋ Пожелание к блюду", "note.change": "изменить",
            "note.free": "Своими словами…",
            "note.save": "Сохранить", "note.cancel": "Отмена",
            "form.title": "Оформление",
            "form.name": "Имя", "form.namePh": "Как к вам обращаться",
            "form.phone": "Телефон", "form.phoneHint": "Позвоним, чтобы подтвердить заказ",
            "form.addr": "Адрес доставки", "form.addrPh": "Улица, дом, квартира",
            "form.when": "Когда", "form.asap": "Как можно скорее", "form.onTime": "Ко времени",
            "form.pay": "Оплата", "form.cash": "Наличные", "form.card": "Карта",
            "form.click": "Click (по QR)", "form.clickNote": "Оплата в приложении — без сдачи", "form.cashNote": "Курьеру при вручении", "form.cardNote": "Картой курьеру, терминал с собой", "form.transferNote": "Перевод по номеру карты", "form.payFast": "Быстро",
            "pay.enterSum": "Введите эту сумму в приложении Click", "pay.readySum": "Сумма и номер заказа уже подставлены",
            "pay.open": "Открыть Click и оплатить", "pay.openApp": "Открыть в приложении Click", "pay.appOnly": "Откроется приложение Click. Если оно не установлено — оплатите этим кодом с другого телефона",
            "pay.scan": "Отсканируйте код приложением Click с телефона",
            "pay.or": "или",
            "pay.scanOther": "Этот код может отсканировать тот, кто платит с другого телефона",
            "pay.after": "После оплаты пришлите скриншот в Telegram или покажите курьеру. Мы подтвердим и начнём готовить.", "pay.afterOwn": "После оплаты возвращайтесь на эту страницу — мы увидим платёж и начнём готовить.",
            "form.transfer": "Перевод на карту",
            "form.comment": "Комментарий", "form.commentPh": "Домофон, этаж, пожелания",
            "form.send": "Отправить заказ", "form.sending": "Отправляем…",
            "form.back": "Назад в корзину",
            "form.errPhone": "Укажите телефон — без него курьер не приедет",
            "form.errAddr": "Укажите адрес доставки",
            "form.errSend": "Не удалось отправить заказ",
            "form.errNet": "Нет связи с сервером. Попробуйте ещё раз или позвоните нам.",
            "done.title": "Заказ принят", "done.thanks": "Спасибо!",
            "done.cooking": "Мы уже готовим ваш заказ",
            "done.callYou": "Позвоним на ", "done.callYouTail": " для подтверждения.",
            "done.courier": "Доставку привезёт курьер Яндекса — оплата ему при получении.", "done.courierClick": "Доставку привезёт курьер Яндекса. Оплата — через Click, по кнопке ниже.",
            "done.payTitle": "Переведите на карту",
            "done.payCopy": "Скопировать номер",
            "done.payCopied": "Скопировано ✓",
            "done.payNote": "В комментарии к переводу укажите номер заказа. Пришлите чек в ответ на звонок — и мы сразу начнём готовить.",
            "done.ok": "Готово",
            "acc.title": "Мой кабинет", "acc.aria": "Мой кабинет",
            "acc.ariaGuest": "Войти или зарегистрироваться",
            "acc.section": "Аккаунт",
            "acc.login": "Вход", "acc.register": "Регистрация",
            "acc.doLogin": "Войти", "acc.doRegister": "Зарегистрироваться",
            "acc.wait": "Секунду…",
            "acc.pass": "Пароль", "acc.passPh": "Ваш пароль",
            "acc.passNewPh": "Минимум 6 символов",
            "acc.note": "Войдите, чтобы история заказов и адреса были на всех ваших устройствах.",
            "acc.logout": "Выйти",
            "acc.addresses": "Адреса", "acc.noAddresses": "Пока не сохранено ни одного адреса",
            "acc.addAddress": "＋ Добавить адрес",
            "acc.history": "История заказов", "acc.historyLoading": "Загружаем историю…",
            "acc.noHistory": "Здесь появятся ваши заказы",
            "acc.noHistoryGuest": "Здесь появятся ваши заказы. Войдите — и они сохранятся навсегда.",
            "acc.repeat": "Повторить заказ", "acc.shop": "За покупками",
            "acc.errPhone": "Проверьте номер телефона", "acc.errName": "Укажите имя",
            "acc.errPassShort": "Пароль — минимум 6 символов", "acc.errPassEmpty": "Введите пароль",
            "acc.errLogin": "Не удалось войти",
            "acc.errNet": "Нет связи с сервером. Попробуйте ещё раз.",
            "menu.title": "Меню", "menu.dishes": "блюд", "menu.positions": "позиций",
            "menu.toSets": "Смотреть сеты",
            "menu.toDiscount": "Собрать заказ со скидкой",
            "menu.offerHint": "Обычно это два ролла",
            "menu.all": "Всё меню", "menu.nothing": "Ничего не нашли",
            "menu.tryOther": "Попробуйте другое название",
            "menu.searchPh": "Поиск — филадельфия, сет, кола…",
            "err.serverDown": "Сервер недоступен",
            "err.serverHint": "Проверьте, что запущен site-server.js",
            "err.loading": "Загружаем…",
            "warn.stock": "⚠️ уточним наличие при звонке",
            "test.title": "🧪 Тестовый режим",
            "test.text": "Заказы не идут на кассу и не списывают продукты",
            "test.off": "выключить",
            "theme.aria": "Переключить тему", "theme.title": "День / ночь",
            "hero.eyebrow": "Суши-бар в Ташкенте",
            "hero.sub": "— роллы, сеты и горячее с доставкой по городу",
            "hero.desc": "До Киото в Японии — полдня самолётом. До нашего — пара кликов: готовим под заказ на Кары-Ниязи 11 и передаём Яндекс-курьеру.", "hero.descShort": "Готовим под заказ на Кары-Ниязи 11 и везём Яндекс-курьером.",
            "hero.cta": "Заказать со скидкой",
            "offer.badge": "Только на сайте",
            "offer.title": "−30 000 сум",
            "offer.sub": "на первый заказ от 70 000 сум", "hero.cta2": "Фирменный сет", "hero.aria": "Киото — суши-бар в Ташкенте",
            "strip.any": "Заказ от любой суммы", "strip.anySub": "минимума нет",
            "strip.yandex": "Доставка Яндексом", "strip.yandexSub": "оплачивается курьеру отдельно",
            "strip.kinds": "видов", "strip.kindsSub": "роллов и суши",
            "strip.hours": "10:00–23:00", "strip.hoursSub": "ежедневно, без выходных",
            "sec.hits": "хиты месяца", "sec.hitsTitle": "Роллы, которые берут чаще всего",
            "sec.hitsSub": "По реальным заказам за последние 30 дней",
            "sec.allMenu": "Всё меню →",
            "sec.sets": "готовые наборы", "sec.setsTitle": "Сеты",
            "sec.setsSub": "Готовый набор выгоднее, чем собирать роллы по одному",
            "sec.allSets": "Все сеты →",
            "sec.catalog": "каталог", "sec.catalogTitle": "Всё меню",
            "sec.catalogSub": "Суши и роллы — основа. Плюс корейская и европейская кухня",
            "sec.world": "кухня мира", "sec.worldTitle": "Не только суши",
            "sec.worldSub": "Эти блюда заказывают наравне с роллами",
            "sec.allKitchen": "Вся кухня →",
            "sec.how": "как это работает", "sec.howTitle": "Доставка и оплата",
            "how.1": "Собираете заказ", "how.1s": "На любую сумму — минимума нет",
            "how.2": "Оставляете телефон и адрес", "how.2s": "Без регистрации — только то, что нужно курьеру",
            "how.3": "Подтверждаем звонком и готовим", "how.3s": "Заказ сразу поступает на кухню",
            "how.4": "Вызываем Яндекс Доставку", "how.4s": "Передаём заказ курьеру, как только он готов",
            "how.5": "Встречаете курьера", "how.5s": "Доставку оплачиваете курьеру по тарифу Яндекса",
            "cond.title": "Условия",
            "cond.min": "Минимальный заказ", "cond.minV": "Любая сумма",
            "cond.pay": "Оплата заказа", "cond.payV": "Наличные курьеру или Click",
            "cond.hours": "Время работы", "cond.addr": "Адрес кухни",
            "cond.addrV": "Кары-Ниязи 11",
            "cond.note": "Как считается доставка",
            "cond.noteText": "Мы вызываем Яндекс Доставку. Стоимость зависит от вашего адреса и рассчитывается Яндексом — вы оплачиваете её курьеру напрямую при получении.",
            "foot.about": "Суши и роллы с доставкой",
            "foot.hours": "Доставляем Яндексом ежедневно 10:00–23:00",
            "foot.social": "Мы в сетях", "foot.contacts": "Контакты", "foot.address": "г. Ташкент, ул. Кары-Ниязи 11",
            "foot.menu": "Меню", "foot.menu1": "Роллы и суши · Сеты",
            "foot.menu2": "Горячее · Салаты · Супы",
            "foot.menuAll": "Всё меню",
            "page.title": "KYOTO — суши и роллы с доставкой в Ташкенте",
            "page.menuTitle": "Меню — KYOTO",
            "page.desc": "Доставка суши, роллов и сетов в Ташкенте. Заказ от любой суммы, доставка Яндексом. Кары-Ниязи 11. Тел. +998 88 119-88-78",
            "sum": "сум", "close": "Закрыть", "added": "Добавлено ✓", "card.buy": "В корзину", "cart.p1": "позиция", "cart.p2": "позиции", "cart.p5": "позиций", "pd.desc": "Описание", "pd.add": "Добавить в корзину",
            "badge.hit": "Хит", "badge.signature": "Фирменный", "unit.g": "г"
        },

        uz: {
            "nav.menu": "Menyu", "nav.sets": "Setlar", "nav.delivery": "Yetkazib berish",
            "search.ph": "Menyudan qidirish…", "search.aria": "Menyudan qidirish",
            "addr.ask": "Qayerga yetkazamiz?", "addr.aria": "Yetkazib berish manzili",
            "addr.new": "＋ Yangi manzil qo'shish",
            "addr.hint": "Manzil birinchi buyurtmadan keyin saqlanadi",
            "addr.prompt": "Yangi yetkazib berish manzili\nKo'cha, uy, xonadon:",
            "addr.short": "Manzil juda qisqa — ko'cha va uyni ko'rsating",
            "addr.del": "Manzilni o'chirish",
            "cart.btn": "Savat", "cart.goto": "Rasmiylashtirish", "cart.title": "Savat",
            "cart.empty": "Savat bo'sh",
            "cart.emptyHint": "Eng ko'p buyurtma qilinadiganidan boshlang",
            "cart.openMenu": "Butun menyuni ochish",
            "cart.counting": "Hisoblanmoqda…",
            "cart.dishes": "Taomlar", "cart.discount": "Ikkinchi roll −20%", "cart.first": "Birinchi buyurtmaga chegirma", "cart.firstGap1": "Chegirmagacha", "cart.firstGap2": "yetmayapti", "cart.firstWait": "raqam bo'yicha hisoblanadi", "cart.firstCap": "maksimum 30 000 ga yetdi", "cart.firstCheck": "raqamni buyurtmada tekshiramiz",
            "cart.delivery": "Yetkazib berish", "cart.deliveryByYandex": "Yandeks tarifi bo'yicha",
            "cart.total": "To'lovga", "cart.checkout": "Buyurtma berish",
            "cart.removed": "Buyurtmadan olib tashlandi: ",
            "cart.giftNoStack": "Ikkinchi rollga chegirma sovg'a bilan qo'shilmaydi — sovg'ani tanladik, u foydaliroq",
            "cart.upsell": "Bunga ko'pincha qo'shib olishadi",
            "cart.deliveryNote": "Yandeks manzilingiz bo'yicha hisoblaydi. Qabul qilishda kuryerga to'laysiz — buyurtmadan alohida.",
            "gift.title": "Buyurtmaga sovg'a",
            "gift.tag": "🎁 Sovg'a",
            "gift.both": "Ikkala sovg'a sizniki — {n1} va {n2}",
            "gift.first": "{n1} sizniki. <b>{n2}</b> uchun <b>{s} {sum}</b> yetmayapti",
            "gift.toGo": "<b>{n1}</b> sovg'asiga <b>{s} {sum}</b> yetmayapti",
            "gift.secondEyebrow": "Ikkinchi sovg'a sizniki",
            "gift.secondTitle": " — sovg'aga!",
            "gift.secondText": "Siz ikkala sovg'aga yetdingiz. Ularni buyurtmangizga bepul qo'shamiz — hech narsa to'lash shart emas.",
            "gift.toCart": "Savatga o'tish", "gift.keepShopping": "Tanlashni davom ettirish",
            "note.add": "＋ Taomga izoh", "note.change": "o'zgartirish",
            "note.free": "O'z so'zlaringiz bilan…",
            "note.save": "Saqlash", "note.cancel": "Bekor qilish",
            "form.title": "Rasmiylashtirish",
            "form.name": "Ism", "form.namePh": "Sizga qanday murojaat qilaylik",
            "form.phone": "Telefon", "form.phoneHint": "Buyurtmani tasdiqlash uchun qo'ng'iroq qilamiz",
            "form.addr": "Yetkazib berish manzili", "form.addrPh": "Ko'cha, uy, xonadon",
            "form.when": "Qachon", "form.asap": "Imkon qadar tezroq", "form.onTime": "Belgilangan vaqtga",
            "form.pay": "To'lov", "form.cash": "Naqd pul", "form.card": "Karta",
            "form.click": "Click (QR orqali)", "form.clickNote": "Ilovada to'lov — qaytimsiz", "form.cashNote": "Kuryerga topshirishda", "form.cardNote": "Kuryerga karta bilan, terminal o'zida", "form.transferNote": "Karta raqamiga o'tkazma", "form.payFast": "Tez",
            "pay.enterSum": "Click ilovasida shu summani kiriting", "pay.readySum": "Summa va buyurtma raqami allaqachon qo'yilgan",
            "pay.open": "Click'ni ochish va to'lash", "pay.openApp": "Click ilovasida ochish", "pay.appOnly": "Click ilovasi ochiladi. O'rnatilmagan bo'lsa — bu kodni boshqa telefondan skanerlang",
            "pay.scan": "Kodni telefondagi Click ilovasi bilan skanerlang",
            "pay.or": "yoki",
            "pay.scanOther": "Bu kodni boshqa telefondan to'lovchi odam skanerlashi mumkin",
            "pay.after": "To'lovdan keyin skrinshotni Telegram'ga yuboring yoki kuryerga ko'rsating. Biz tasdiqlaymiz va tayyorlashni boshlaymiz.", "pay.afterOwn": "To'lovdan keyin shu sahifaga qayting — to'lovni ko'ramiz va tayyorlashni boshlaymiz.",
            "form.transfer": "Kartaga o'tkazma",
            "form.comment": "Izoh", "form.commentPh": "Domofon, qavat, istaklar",
            "form.send": "Buyurtmani yuborish", "form.sending": "Yuborilmoqda…",
            "form.back": "Savatga qaytish",
            "form.errPhone": "Telefon raqamini kiriting — usiz kuryer yetib bormaydi",
            "form.errAddr": "Yetkazib berish manzilini kiriting",
            "form.errSend": "Buyurtmani yuborib bo'lmadi",
            "form.errNet": "Server bilan aloqa yo'q. Qayta urinib ko'ring yoki qo'ng'iroq qiling.",
            "done.title": "Buyurtma qabul qilindi", "done.thanks": "Rahmat!",
            "done.cooking": "Buyurtmangizni tayyorlayapmiz",
            "done.callYou": "Tasdiqlash uchun ", "done.callYouTail": " raqamiga qo'ng'iroq qilamiz.",
            "done.courier": "Buyurtmani Yandeks kuryeri yetkazadi — to'lov qabul qilishda unga.", "done.courierClick": "Buyurtmani Yandeks kuryeri yetkazadi. To'lov — Click orqali, quyidagi tugma bilan.",
            "done.payTitle": "Kartaga o'tkazing",
            "done.payCopy": "Raqamdan nusxa olish",
            "done.payCopied": "Nusxa olindi ✓",
            "done.payNote": "O'tkazma izohida buyurtma raqamini ko'rsating. Chekni qo'ng'iroqqa javoban yuboring — va biz darhol tayyorlashni boshlaymiz.",
            "done.ok": "Tayyor",
            "acc.title": "Mening kabinetim", "acc.aria": "Mening kabinetim",
            "acc.ariaGuest": "Kirish yoki ro'yxatdan o'tish",
            "acc.section": "Akkaunt",
            "acc.login": "Kirish", "acc.register": "Ro'yxatdan o'tish",
            "acc.doLogin": "Kirish", "acc.doRegister": "Ro'yxatdan o'tish",
            "acc.wait": "Bir soniya…",
            "acc.pass": "Parol", "acc.passPh": "Parolingiz",
            "acc.passNewPh": "Kamida 6 ta belgi",
            "acc.note": "Buyurtmalar tarixi va manzillar barcha qurilmalaringizda bo'lishi uchun kiring.",
            "acc.logout": "Chiqish",
            "acc.addresses": "Manzillar", "acc.noAddresses": "Hali birorta manzil saqlanmagan",
            "acc.addAddress": "＋ Manzil qo'shish",
            "acc.history": "Buyurtmalar tarixi", "acc.historyLoading": "Tarix yuklanmoqda…",
            "acc.noHistory": "Bu yerda buyurtmalaringiz paydo bo'ladi",
            "acc.noHistoryGuest": "Bu yerda buyurtmalaringiz paydo bo'ladi. Kiring — va ular abadiy saqlanadi.",
            "acc.repeat": "Buyurtmani takrorlash", "acc.shop": "Xaridga",
            "acc.errPhone": "Telefon raqamini tekshiring", "acc.errName": "Ismingizni kiriting",
            "acc.errPassShort": "Parol — kamida 6 ta belgi", "acc.errPassEmpty": "Parolni kiriting",
            "acc.errLogin": "Kirib bo'lmadi",
            "acc.errNet": "Server bilan aloqa yo'q. Qayta urinib ko'ring.",
            "menu.title": "Menyu", "menu.dishes": "taom", "menu.positions": "pozitsiya",
            "menu.toSets": "Setlarni ko'rish",
            "menu.toDiscount": "Chegirma bilan buyurtma yig'ish",
            "menu.offerHint": "Odatda bu ikkita roll",
            "menu.all": "Butun menyu", "menu.nothing": "Hech narsa topilmadi",
            "menu.tryOther": "Boshqa nom bilan urinib ko'ring",
            "menu.searchPh": "Qidiruv — filadelfiya, set, kola…",
            "err.serverDown": "Server ishlamayapti",
            "err.serverHint": "site-server.js ishga tushganini tekshiring",
            "err.loading": "Yuklanmoqda…",
            "warn.stock": "⚠️ qo'ng'iroqda mavjudligini aniqlaymiz",
            "test.title": "🧪 Sinov rejimi",
            "test.text": "Buyurtmalar kassaga tushmaydi va mahsulot yechilmaydi",
            "test.off": "o'chirish",
            "theme.aria": "Mavzuni almashtirish", "theme.title": "Kunduz / tun",
            "hero.eyebrow": "Toshkentdagi sushi-bar",
            "hero.sub": "— rollar, setlar va issiq taomlar shahar bo'ylab yetkazib berish bilan",
            "hero.desc": "Yaponiyadagi Kiotogacha — samolyotda yarim kun. Biznikigacha — bir necha bosish: Qori Niyoziy 11 da buyurtmaga tayyorlaymiz va Yandeks kuryeriga topshiramiz.", "hero.descShort": "Qori Niyoziy 11 da buyurtmaga tayyorlaymiz, Yandeks kuryeri yetkazadi.",
            "hero.cta": "Chegirma bilan buyurtma", "hero.cta2": "Firma seti", "offer.badge": "Faqat saytda",
            "offer.title": "−30 000 so'm",
            "offer.sub": "70 000 so'mdan birinchi buyurtmaga",
            "hero.aria": "Kioto — Toshkentdagi sushi-bar",
            "strip.any": "Istalgan summadan buyurtma", "strip.anySub": "minimal summa yo'q",
            "strip.yandex": "Yandeks yetkazib beradi", "strip.yandexSub": "kuryerga alohida to'lanadi",
            "strip.kinds": "xil", "strip.kindsSub": "roll va sushi",
            "strip.hours": "10:00–23:00", "strip.hoursSub": "har kuni, dam olishsiz",
            "sec.hits": "oyning xitlari", "sec.hitsTitle": "Eng ko'p buyurtma qilinadigan rollar",
            "sec.hitsSub": "So'nggi 30 kundagi haqiqiy buyurtmalar bo'yicha",
            "sec.allMenu": "Butun menyu →",
            "sec.sets": "tayyor to'plamlar", "sec.setsTitle": "Setlar",
            "sec.setsSub": "Tayyor to'plam rollarni yakka yig'ishdan foydaliroq",
            "sec.allSets": "Barcha setlar →",
            "sec.catalog": "katalog", "sec.catalogTitle": "Butun menyu",
            "sec.catalogSub": "Sushi va rollar — asosi. Ustiga koreys va yevropa taomlari",
            "sec.world": "jahon taomlari", "sec.worldTitle": "Faqat sushi emas",
            "sec.worldSub": "Bu taomlar rollar bilan barobar buyurtma qilinadi",
            "sec.allKitchen": "Barcha taomlar →",
            "sec.how": "bu qanday ishlaydi", "sec.howTitle": "Yetkazib berish va to'lov",
            "how.1": "Buyurtmani yig'asiz", "how.1s": "Istalgan summaga — minimal summa yo'q",
            "how.2": "Telefon va manzil qoldirasiz", "how.2s": "Ro'yxatdan o'tmasdan — faqat kuryerga kerak bo'lgani",
            "how.3": "Qo'ng'iroq bilan tasdiqlaymiz va tayyorlaymiz", "how.3s": "Buyurtma darhol oshxonaga tushadi",
            "how.4": "Yandeks Yetkazib berishni chaqiramiz", "how.4s": "Tayyor bo'lishi bilan kuryerga topshiramiz",
            "how.5": "Kuryerni kutib olasiz", "how.5s": "Yetkazishni kuryerga Yandeks tarifi bo'yicha to'laysiz",
            "cond.title": "Shartlar",
            "cond.min": "Minimal buyurtma", "cond.minV": "Istalgan summa",
            "cond.pay": "Buyurtma to'lovi", "cond.payV": "Kuryerga naqd yoki Click",
            "cond.hours": "Ish vaqti", "cond.addr": "Oshxona manzili",
            "cond.addrV": "Qori Niyoziy 11",
            "cond.note": "Yetkazib berish qanday hisoblanadi",
            "cond.noteText": "Biz Yandeks Yetkazib berishni chaqiramiz. Narxi manzilingizga bog'liq va Yandeks tomonidan hisoblanadi — uni qabul qilishda to'g'ridan-to'g'ri kuryerga to'laysiz.",
            "foot.about": "Sushi va rollar yetkazib berish bilan",
            "foot.hours": "Yandeks orqali har kuni 10:00–23:00 yetkazamiz",
            "foot.social": "Biz ijtimoiy tarmoqlarda", "foot.contacts": "Kontaktlar", "foot.address": "Toshkent sh., Qori Niyoziy ko'chasi 11",
            "foot.menu": "Menyu", "foot.menu1": "Rollar va sushi · Setlar",
            "foot.menu2": "Issiq taomlar · Salatlar · Sho'rvalar",
            "foot.menuAll": "Butun menyu",
            "page.title": "KYOTO — Toshkentda sushi va rollar yetkazib berish",
            "page.menuTitle": "Menyu — KYOTO",
            "page.desc": "Toshkentda sushi, roll va setlar yetkazib berish. Istalgan summadan buyurtma, Yandeks yetkazib beradi. Qori Niyoziy 11. Tel. +998 88 119-88-78",
            "sum": "so'm", "close": "Yopish", "added": "Qo'shildi ✓", "card.buy": "Savatga", "cart.p1": "pozitsiya", "cart.p2": "pozitsiya", "cart.p5": "pozitsiya", "pd.desc": "Tavsif", "pd.add": "Savatga qo'shish",
            "badge.hit": "Xit", "badge.signature": "Firma", "unit.g": "g"
        }
    };

    // Названия разделов меню
    var GROUPS = {
        uz: {
            "Роллы и суши": "Rollar va sushi", "Сеты": "Setlar", "Горячее": "Issiq taomlar",
            "Салаты": "Salatlar", "Супы": "Sho'rvalar", "Гарниры": "Garnirlar",
            "Поке и паста": "Poke va pasta", "Напитки": "Ichimliklar"
        }
    };

    // Категории как они заведены в Poster — показываются под названием блюда.
    // В самом Poster они с опечатками («Сэты», «Ролы») и без разделителей —
    // переименовывать там нельзя (сломается учёт), поэтому чиним при показе.
    var CATS = {
        ru: {
            "Сэты": "Сеты",
            "Ролы": "Роллы",
            "Запеченные роллы": "Запечённые роллы",
            "Гункан суши": "Гункан-суши",
            "Вторые блюда Европа": "Вторые блюда · Европа",
            "Вторые блюда Корея": "Вторые блюда · Корея",
            "Салаты Европа": "Салаты · Европа",
            "Салаты Корея": "Салаты · Корея",
            "Супы Европа": "Супы · Европа",
            "Супы Корея": "Супы · Корея",
            "Чикен": "Курица"
        },
        uz: {
            "Вторые блюда Европа": "Yevropa ikkinchi taomlari",
            "Вторые блюда Корея": "Koreys ikkinchi taomlari",
            "Гарниры": "Garnirlar", "Гункан суши": "Gunkan sushi",
            "Жареные роллы": "Qovurilgan rollar", "Запеченные роллы": "Pishirilgan rollar",
            "Коктейли": "Kokteyllar", "Кофе": "Qahva", "Лимонады": "Limonadlar",
            "Милкшейки": "Milksheyklar", "Мини роллы": "Mini rollar",
            "Напитки": "Ichimliklar", "Паста": "Pasta", "Поке": "Poke",
            "Ролы": "Rollar", "Салаты Европа": "Yevropa salatlari",
            "Салаты Корея": "Koreys salatlari", "Супы Европа": "Yevropa sho'rvalari",
            "Супы Корея": "Koreys sho'rvalari", "Суши": "Sushi", "Сэты": "Setlar",
            "Чай": "Choy", "Чикен": "Chiken"
        }
    };

    // Языки списком: флаг + самоназвание. Флаги — инлайн-SVG, а не эмодзи:
    // на Windows и части Android флаговые эмодзи не рисуются вовсе.
    var LANGS = [
        {
            code: "ru",
            name: "Русский",
            flag: '<svg viewBox="0 0 24 24" aria-hidden="true">' +
                '<rect width="24" height="8" fill="#FFF"/>' +
                '<rect y="8" width="24" height="8" fill="#0039A6"/>' +
                '<rect y="16" width="24" height="8" fill="#D52B1E"/></svg>'
        },
        {
            code: "uz",
            name: "O‘zbekcha",
            flag: '<svg viewBox="0 0 24 24" aria-hidden="true">' +
                '<rect width="24" height="7.4" fill="#0099B5"/>' +
                '<rect y="7.4" width="24" height="1" fill="#CE1126"/>' +
                '<rect y="8.4" width="24" height="7.2" fill="#FFF"/>' +
                '<rect y="15.6" width="24" height="1" fill="#CE1126"/>' +
                '<rect y="16.6" width="24" height="7.4" fill="#1EB53A"/>' +
                '<circle cx="5.4" cy="3.7" r="2.6" fill="#FFF"/>' +
                '<circle cx="6.6" cy="3.7" r="2.6" fill="#0099B5"/>' +
                '<circle cx="10.2" cy="2.1" r=".55" fill="#FFF"/>' +
                '<circle cx="10.2" cy="4.2" r=".55" fill="#FFF"/>' +
                '<circle cx="12.4" cy="2.1" r=".55" fill="#FFF"/>' +
                '<circle cx="12.4" cy="4.2" r=".55" fill="#FFF"/>' +
                '<circle cx="12.4" cy="6.3" r=".55" fill="#FFF"/></svg>'
        }
    ];

    function langInfo(code) {
        return LANGS.filter(function (l) { return l.code === code; })[0] || LANGS[0];
    }

    var LS = "kyoto_lang";
    var lang = "ru";
    var names = null;   // словарь названий блюд из names-uz.json

    try {
        var saved = localStorage.getItem(LS);
        if (saved === "ru" || saved === "uz") lang = saved;
    } catch (e) {}

    // Язык страницы важнее сохранённого выбора: если человек пришёл
    // из поиска на /uz/, он должен увидеть узбекский, даже если
    // когда-то переключался на русский
    try {
        var pageLang = document.body && document.body.dataset.lang;
        if (pageLang === "uz" || pageLang === "ru") lang = pageLang;
    } catch (e) {}

    function t(key) {
        var d = DICT[lang] || DICT.ru;
        return (d[key] !== undefined) ? d[key] : (DICT.ru[key] !== undefined ? DICT.ru[key] : key);
    }

    // Ключ для поиска, устойчивый к пробелам и регистру: в правилах сервера
    // подарок записан «Морковь-ча», а в Poster — «Морковь- ча».
    function normKey(s) {
        return String(s).replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
    }

    var nameIndex = null;
    function buildIndex() {
        nameIndex = {};
        Object.keys(names || {}).forEach(function (k) {
            var v = names[k];
            if (v && v.uz) nameIndex[normKey(k)] = v.uz;
        });
    }

    // Название блюда на текущем языке. Русский — как в Poster.
    function dish(rawName, ruPretty) {
        if (lang !== "uz" || !names) return ruPretty;
        var exact = names[rawName];
        if (exact && exact.uz) return exact.uz;
        if (!nameIndex) buildIndex();
        return nameIndex[normKey(rawName)] || ruPretty;
    }

    function group(title) {
        if (lang === "uz" && GROUPS.uz[title]) return GROUPS.uz[title];
        return title;
    }

    function cat(title) {
        var map = CATS[lang];
        return (map && map[title]) || title;
    }

    // Проставляем статический текст в разметке
    function apply() {
        document.documentElement.setAttribute("lang", lang === "uz" ? "uz" : "ru");
        document.querySelectorAll("[data-i18n]").forEach(function (el) {
            el.textContent = t(el.getAttribute("data-i18n"));
        });
        document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
            el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph")));
        });
        document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
            el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
        });
        document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
            el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
        });
        var titleKey = document.body && document.body.getAttribute("data-title-key");
        if (titleKey) document.title = t(titleKey);
    }

    // Узбекские названия блюд подгружаем один раз
    function loadNames() {
        if (names) return Promise.resolve(names);
        return fetch("/names-uz.json")
            .then(function (r) { return r.ok ? r.json() : {}; })
            .then(function (d) { names = d; nameIndex = null; return names; })
            .catch(function () { names = {}; nameIndex = null; return names; });
    }

    function setLang(next) {
        if (next !== "ru" && next !== "uz") return;
        lang = next;
        try { localStorage.setItem(LS, lang); } catch (e) {}
        var done = lang === "uz" ? loadNames() : Promise.resolve();
        return done.then(function () {
            apply();
            (listeners || []).forEach(function (fn) { fn(lang); });
        });
    }

    var listeners = [];

    return {
        t: t, dish: dish, group: group, cat: cat, apply: apply,
        langs: LANGS, info: langInfo,
        lang: function () { return lang; },
        setLang: setLang,
        loadNames: loadNames,
        onChange: function (fn) { listeners.push(fn); },
        ready: function () { return lang === "uz" ? loadNames() : Promise.resolve(); }
    };
})();
