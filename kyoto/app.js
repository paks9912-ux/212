/* ============================================================
   KYOTO — общая логика магазина
   Меню, корзина, оформление заказа.

   Важно: суммы, скидки и подарки считает СЕРВЕР.
   Браузер только показывает — подделать цену нельзя.
   ============================================================ */

window.KYOTO = (function () {

    var MENU = null, RULES = null;

    var cart = {}, quote = null, step = "cart", view = "cart";
    var listeners = [];

    function $(id) { return document.getElementById(id); }

    function money(n) {
        return Math.round(n || 0).toLocaleString("ru-RU");
    }

    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
        });
    }

    // Маяк воронки: считаем визиты и «дошёл до корзины» анонимно
    // на своём сервере — Пиксель шлёт то же самое Фейсбуку, а нам
    // цифры нужны в собственной админке.
    // Чем человек занят прямо сейчас — для строки в админке.
    // Ничего личного: раздел, поисковый запрос, размер корзины.
    function activity() {
        var a = {
            p: location.pathname.indexOf("menu") >= 0 ? "меню" : "главная",
            s: "смотрит"
        };
        try {
            if (isOpen()) {
                a.s = step === "done" ? "заказ оформлен"
                    : step === "form" ? "заполняет форму"
                    : "смотрит корзину";
            }
            var n = count();
            if (n) {
                a.n = n;
                if (quote && quote.total) a.v = quote.total;
                // Корзину собрали сейчас или она осталась с прошлого раза?
                // Метка живёт в sessionStorage и умирает вместе с вкладкой,
                // а сама корзина — в localStorage и переживает закрытие.
                try {
                    a.c = sessionStorage.getItem("kyoto_cart_seen") ? 1 : 0;
                } catch (e) {}
            }
            var q = $("q");
            if (q && q.value.trim()) a.q = q.value.trim().slice(0, 24);
            // Раздел меню, если открыт конкретный
            var chip = document.querySelector(".chip.on, .side-item.on, .sd-item.on");
            if (chip && chip.textContent.trim()) a.g = chip.textContent.trim().slice(0, 22);
        } catch (e) {}
        return a;
    }

    // Событие с названием: поиск, добавление блюда, выбор раздела.
    // trail — человеческая строка для ленты визитов в админке.
    function ev(name, detail, trail) {
        try {
            if (TEST) return;
            var u = "/api/t?e=" + name;
            if (detail) u += "&d=" + encodeURIComponent(String(detail).slice(0, 40));
            if (trail) u += "&t=" + encodeURIComponent(String(trail).slice(0, 46));
            var a = activity();
            if (a.p) u += "&p=" + encodeURIComponent(a.p);
            if (a.s) u += "&s=" + encodeURIComponent(a.s);
            if (a.n) u += "&n=" + a.n;
            if (navigator.sendBeacon) navigator.sendBeacon(u);
            else fetch(u).catch(function () {});
        } catch (e) {}
    }

    /* Откуда человек пришёл: «paid» — переход по рекламе, «own» — сам.
       Сначала смотрим адрес страницы: saveUTM сохраняет метки ниже по
       файлу и на первый визит ещё не успевает. Потом — сохранённые
       метки, чтобы возврат в течение 30 дней тоже считался рекламным.
       Ровно так же приписываются к рекламе заказы. */
    function visitSource() {
        try {
            var q = new URLSearchParams(location.search);
            var med = String(q.get("utm_medium") || "").toLowerCase();
            if (q.get("fbclid") || med === "paid" || med === "cpc") return "paid";

            var u = utmData();
            if (u) {
                var old = String(u.utm_medium || "").toLowerCase();
                if (u.fbclid || old === "paid" || old === "cpc") return "paid";
            }
        } catch (e) {}
        return "own";
    }

    function beacon(ev) {
        try {
            if (TEST) return;
            var a = activity();
            var u = "/api/t?e=" + ev;
            for (var k in a) {
                if (a[k] !== undefined && a[k] !== "") {
                    u += "&" + k + "=" + encodeURIComponent(a[k]);
                }
            }
            u += "&src=" + visitSource();
            if (navigator.sendBeacon) navigator.sendBeacon(u);
            else fetch(u).catch(function () {});
        } catch (e) {}
    }

    // «Я тут» раз в 30 секунд, пока вкладка открыта и видима —
    // из этого админка считает, сколько человек сейчас на сайте.
    // В фоне не шлём: свёрнутая вкладка это не посетитель.
    function heartbeat() {
        try {
            if (TEST) return;
            setInterval(function () {
                if (!document.hidden) beacon("ping");
            }, 30000);
            document.addEventListener("visibilitychange", function () {
                if (!document.hidden) beacon("ping");
            });
        } catch (e) {}
    }

    // Копирование там, где нет navigator.clipboard: телефонные браузеры
    // без https отдают его как undefined, а номер карты скопировать надо.
    function fallbackCopy(text) {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch (e) {}
        document.body.removeChild(ta);
    }

    /* ---- красивое имя блюда (только для показа) ----
       Названия в Poster набраны вразнобой: «сет Love» и «Сет Киото»,
       «Кук- си», «Гункан-Суши с Крабом» и «Гункан -суши с тунцом».
       Приводим к единому виду: каждое слово с большой буквы, предлоги —
       с маленькой. Причёсываем ТОЛЬКО отображение: ключ корзины,
       стоп-лист и касса работают с исходным именем из Poster. */
    var SMALL_WORDS = " с со в во и на по из от под для без к за о у ".split(/\s+/)
        .reduce(function (m, w) { if (w) m[w] = 1; return m; }, {});

    function capWord(w, isFirstWord) {
        var parts = w.split("-");
        return parts.map(function (part, i) {
            if (!part) return part;
            // Аббревиатуры целиком капсом («ЖБ») не трогаем
            if (part.length >= 2 && part === part.toUpperCase() && /[А-ЯЁA-Z]/.test(part)) return part;
            var low = part.toLowerCase();
            // Предлог внутри слова остаётся строчным: «по-Деревенски», «Кимчи-тиге» нет —
            // строчим только настоящие предлоги, не первое слово названия
            if (SMALL_WORDS[low] && (i > 0 || (parts.length > 1 && !isFirstWord))) return low;
            return low.charAt(0).toUpperCase() + low.slice(1);
        }).join("-");
    }

    function displayName(raw) {
        if (raw == null) return "";
        var s = String(raw).replace(/\s+/g, " ").trim();
        s = s.replace(/\s*-\s*/g, "-");                     // «Кук- си» → «Кук-си»
        s = s.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")"); // «(Жар-рол )» → «(Жар-рол)»
        s = s.replace(/по деревенски/gi, "по-деревенски")   // \b в JS не знает кириллицы
             .replace(/по домашнему/gi, "по-домашнему");

        var first = true;
        s = s.replace(/[^\s()]+/g, function (word) {
            // числа и единицы («1л», «0.5») оставляем как есть
            if (/^[\d.,]+[а-яёa-z]?$/i.test(word)) { first = false; return word; }
            var wasFirst = first; first = false;
            var low = word.toLowerCase();
            if (!wasFirst && SMALL_WORDS[low]) return low;
            return capWord(word, wasFirst);
        });
        return s;
    }

    // Язык. Русский — причёсанное имя из Poster, узбекский — из словаря.
    var I18N = window.I18N;
    function t(key) { return I18N ? I18N.t(key) : key; }
    function nameOf(raw) {
        var pretty = displayName(raw);
        return I18N ? I18N.dish(raw, pretty) : pretty;
    }
    function catOf(title) { return I18N ? I18N.cat(title) : title; }

    /* Заглушка без фото: нейтральный градиент и марка заведения.
       Раньше здесь был цветной градиент по хэшу названия — он давал
       случайный цвет в каждой карточке и ломал чёрно-бело-красную схему. */

    function phHTML(name, size) {
        return '<div class="ph">' +
            '<b' + (size ? ' style="font-size:' + size + '"' : '') + '>KYOTO</b></div>';
    }

    /* Фото товара: /photos/<id>.jpg.
       Рисуем заглушку ВСЕГДА, фото — поверх неё:
       - пока грузится, гость видит аккуратный градиент, а не дыру;
       - загрузилось — мягко проявляется (класс ok);
       - файл битый — просто исчезает, заглушка остаётся. */
    function mediaHTML(item, size) {
        var name = item && item.name ? item.name : String(item);
        var html = phHTML(name, size);
        if (item && item.photo) {
            html += '<img class="pic" src="' + esc(item.photo) + '" alt="' + esc(name) +
                '" loading="lazy" onload="this.classList.add(\'ok\')" onerror="this.remove()">';
        }
        return html;
    }

    function plural(n, a, b, c) {
        var m = n % 100; if (m >= 11 && m <= 14) return c;
        m = n % 10; if (m === 1) return a; if (m >= 2 && m <= 4) return b; return c;
    }

    // -------------------- корзина --------------------

    try { cart = JSON.parse(localStorage.getItem("kyoto_cart") || "{}"); } catch (e) { cart = {}; }

    function save() { try { localStorage.setItem("kyoto_cart", JSON.stringify(cart)); } catch (e) {} }

    // Комментарий к позиции: «без лука», «острый», «нарезать пополам»
    var notes = {};
    try { notes = JSON.parse(localStorage.getItem("kyoto_notes") || "{}"); } catch (e) { notes = {}; }

    function saveNotes() {
        try { localStorage.setItem("kyoto_notes", JSON.stringify(notes)); } catch (e) {}
    }
    function noteOf(name) { return notes[name] || ""; }
    function setNote(name, text) {
        text = String(text || "").trim().slice(0, 120);
        if (text) notes[name] = text; else delete notes[name];
        saveNotes();
    }

    function items() {
        return Object.keys(cart)
            .map(function (n) {
                var i = { name: n, qty: cart[n] };
                if (notes[n]) i.note = notes[n];
                return i;
            })
            .filter(function (i) { return i.qty > 0; });
    }

    function count() {
        return items().reduce(function (s, i) { return s + i.qty; }, 0);
    }

    var quoteTimer = null;

    function refreshQuote(cb) {
        var list = items();
        if (!list.length) { quote = null; if (cb) cb(); return; }
        fetch("/api/quote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                items: list,
                // Телефон берём откуда знаем: из формы, из аккаунта,
                // из сохранённого профиля — чтобы скидка считалась
                // сразу, а не только на шаге оформления
                phone: form.phone || (AUTH && AUTH.phone) || profile().phone || "",
                // Этот браузер уже заказывал? Если нет — считаем заказ
                // первым и показываем скидку сразу. Телефон всё равно
                // перепроверится на сервере при отправке.
                newHere: orders().length === 0
            })
        })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                quote = d;
                // Сумма в липкой полосе живёт здесь: без этого после
                // перезагрузки страницы там было пусто
                try { paintCartBar(); } catch (e) {}
                if (cb) cb();
            })
            .catch(function () { quote = null; if (cb) cb(); });
    }

    function setQty(name, n) {
        var isAdd = n > (cart[name] || 0);
        var prevTier = giftTier();               // уровень до добавления
        if (n <= 0) { delete cart[name]; delete notes[name]; saveNotes(); } else cart[name] = n;
        save();
        if (isAdd) {
            var added = MENU && MENU.items.filter(function (x) { return x.name === name; })[0];
            track("AddToCart", { content_name: name, value: (added && added.price) || 0, currency: "UZS" });
            // В воронку — только первый раз за визит: нас интересует
            // «дошёл до корзины», а не каждый плюсик
            try {
                if (!sessionStorage.getItem("kyoto_cart_seen")) {
                    sessionStorage.setItem("kyoto_cart_seen", "1");
                    beacon("cart");
                }
            } catch (e) { beacon("cart"); }
            // А вот КАКОЕ блюдо положили — считаем каждый раз
            ev("add", name, "положил в корзину: " + name);
        }
        var badge = $("count");
        if (badge) badge.textContent = count();
        var btn = $("cartBtn");
        if (btn) { btn.classList.remove("bump"); void btn.offsetWidth; btn.classList.add("bump"); }
        paintCartBar();
        // На телефоне шапка с корзиной уже уехала вверх — её «bump» не виден.
        // Подтверждение даёт липкая полоса внизу: короткий подскок.
        if (isAdd) {
            var cbar = $("cartBar");
            if (cbar) { cbar.classList.remove("bump"); void cbar.offsetWidth; cbar.classList.add("bump"); }
        }
        clearTimeout(quoteTimer);
        quoteTimer = setTimeout(function () {
            refreshQuote(function () {
                paintCartBar();
                if (isOpen()) renderDrawer();
                else if (isAdd) {
                    // Перешагнули второй порог — отдельное окно. Иначе обычное табло.
                    if (giftTier() >= 2 && prevTier < 2) showGiftModal();
                    else showGiftToast();
                }
            });
        }, 150);
        listeners.forEach(function (fn) { fn(); });
    }

    // -------------------- липкая корзина на телефоне --------------------
    //
    // Главная потеря заказов была здесь: человек набирал еду, листая
    // 24 000 пикселей меню, и не видел ни суммы, ни кнопки перехода
    // к заказу — корзина жила только в шапке иконкой со счётчиком.
    // Полоса появляется, как только в корзине что-то есть, и исчезает
    // вместе с последним товаром.

    function cartBar() {
        var el = $("cartBar");
        if (el) return el;
        el = document.createElement("button");
        el.id = "cartBar";
        el.className = "cart-bar";
        el.type = "button";
        el.addEventListener("click", function () { open("cart"); });
        document.body.appendChild(el);
        return el;
    }

    function paintCartBar() {
        var n = count();
        var bar = cartBar();

        if (!n) {
            bar.classList.remove("on");
            document.body.classList.remove("has-cart-bar");
            return;
        }

        // Пока сервер не пересчитал — показываем число позиций,
        // сумму дописываем, когда придёт ответ. Лучше без суммы,
        // чем с неверной.
        var sum = quote && quote.total ? money(quote.total) + " " + t("sum") : "";

        bar.innerHTML =
            '<span class="cb-left">' +
                '<span class="cb-count">' + n + '</span>' +
                '<span class="cb-txt">' + t("cart.btn") +
                    (sum ? '<b>' + sum + '</b>' : '') +
                '</span>' +
            '</span>' +
            '<span class="cb-go">' + t("cart.goto") + '</span>';

        bar.classList.add("on");
        document.body.classList.add("has-cart-bar");
    }

    function qtyOf(name) { return cart[name] || 0; }

    // -------------------- прогресс подарка --------------------

    // Один и тот же блок и в корзине, и во всплывающем табло на странице.
    // Считает сервер (quote.subtotal), браузер только рисует.
    function giftBarHTML() {
        if (!quote || !RULES) return "";
        // Подарки выключены на сервере — табло не показываем вовсе
        if (!RULES.gift1 || !RULES.gift2) return "";
        var s = quote.subtotal, T1 = RULES.gift1.threshold, T2 = RULES.gift2.threshold;
        var target = s < T1 ? T1 : T2, pct = Math.min(100, s / target * 100);
        var msg, cls = "gift-msg";
        var n1 = esc(nameOf(RULES.gift1.name)), n2 = esc(nameOf(RULES.gift2.name));
        function giftMsg(key, need) {
            return t(key).replace("{n1}", n1).replace("{n2}", n2)
                .replace("{s}", money(need)).replace("{sum}", t("sum"));
        }
        if (s >= T2) { cls += " win"; msg = giftMsg("gift.both", 0); }
        else if (s >= T1) { cls += " win"; msg = giftMsg("gift.first", T2 - s); }
        else { msg = giftMsg("gift.toGo", T1 - s); }
        return '<div class="gift"><div class="gift-top"><b>' + t("gift.title") + '</b>' +
            '<span class="num">' + money(s) + ' ' + t("sum") + '</span></div>' +
            '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
            '<div class="' + cls + '">' + msg + '</div></div>';
    }

    // Всплывающее табло: показывается при добавлении товара, когда корзина
    // закрыта. Клик — открыть корзину. Само прячется через несколько секунд.
    var toastTimer = null;
    function showGiftToast() {
        var inner = giftBarHTML();
        if (!inner) return;
        var el = $("giftToast");
        if (!el) {
            el = document.createElement("div");
            el.id = "giftToast";
            el.className = "gift-toast";
            el.setAttribute("role", "status");
            el.setAttribute("aria-live", "polite");
            el.addEventListener("click", function () { hideGiftToast(); open("cart"); });
            document.body.appendChild(el);
        }
        el.innerHTML = inner;
        el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(hideGiftToast, 4000);
    }
    function hideGiftToast() {
        var el = $("giftToast");
        if (el) el.classList.remove("on");
        clearTimeout(toastTimer);
    }

    // Уровень подарка по сумме: 0 — ничего, 1 — первый, 2 — оба.
    function giftTier() {
        if (!quote || !RULES) return 0;
        if (!RULES.gift1 || !RULES.gift2) return 0;
        var s = quote.subtotal;
        if (s >= RULES.gift2.threshold) return 2;
        if (s >= RULES.gift1.threshold) return 1;
        return 0;
    }

    // Отдельное окно на момент разблокировки ВТОРОГО подарка.
    // Показывается один раз при переходе через второй порог.
    var gmKeyHandler = null;
    function showGiftModal() {
        if (!RULES || !RULES.gift1 || !RULES.gift2) return;
        hideGiftToast();
        var g1 = RULES.gift1.name, g2 = RULES.gift2.name;
        var el = $("giftModalScrim");
        if (!el) {
            el = document.createElement("div");
            el.id = "giftModalScrim";
            el.className = "gm-scrim";
            document.body.appendChild(el);
            el.addEventListener("click", function (e) { if (e.target === el) hideGiftModal(); });
        }
        el.innerHTML =
            '<div class="gm-modal" role="dialog" aria-modal="true" aria-labelledby="gmTitle">' +
            '<button class="gm-close" type="button" aria-label="' + t("close") + '">×</button>' +
            '<div class="gm-burst" aria-hidden="true">🎁</div>' +
            '<div class="gm-eyebrow">' + t("gift.secondEyebrow") + '</div>' +
            '<h2 id="gmTitle">' + esc(nameOf(g2)) + t("gift.secondTitle") + '</h2>' +
            '<p class="gm-text">' + t("gift.secondText") + '</p>' +
            '<div class="gm-gifts"><span class="gm-chip">🎁 ' + esc(nameOf(g1)) + '</span>' +
            '<span class="gm-chip">🎁 ' + esc(nameOf(g2)) + '</span></div>' +
            '<button class="gm-cta" type="button">' + t("gift.toCart") + '</button>' +
            '<button class="gm-more" type="button">' + t("gift.keepShopping") + '</button>' +
            '</div>';
        el.querySelector(".gm-close").onclick = hideGiftModal;
        el.querySelector(".gm-more").onclick = hideGiftModal;
        el.querySelector(".gm-cta").onclick = function () { hideGiftModal(); open("cart"); };
        document.body.style.overflow = "hidden";
        el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
        gmKeyHandler = function (e) { if (e.key === "Escape") hideGiftModal(); };
        document.addEventListener("keydown", gmKeyHandler);
    }
    function hideGiftModal() {
        var el = $("giftModalScrim");
        if (el) el.classList.remove("on");
        document.body.style.overflow = "";
        if (gmKeyHandler) { document.removeEventListener("keydown", gmKeyHandler); gmKeyHandler = null; }
    }

    // -------------------- ящик корзины --------------------

    /* Корзина живёт в двух видах:
       — ящик, выезжающий справа (телефон, планшет);
       — колонка, пристыкованная к странице (широкий десктоп).
       Разметка и вся логика одни и те же, отличается только CSS.
       Признак стыковки ставит сама вёрстка — классом на <body>. */
    function isDocked() {
        return document.body.classList.contains("cart-docked");
    }

    function isOpen() {
        if (isDocked()) return true;          // пристыкованная всегда «открыта»
        var d = $("drawer");
        return d && d.classList.contains("on");
    }

    function open(mode) {
        hideGiftToast();
        // Полоса живёт под ящиком корзины — на время прячем
        var cb = $("cartBar"); if (cb) cb.classList.add("hidden");
        view = mode === "account" ? "account" : "cart";
        // Пристыкованную корзину не выдвигаем и прокрутку страницы не блокируем
        if (!isDocked()) {
            $("drawer").classList.add("on");
            $("scrim").classList.add("on");
            document.body.style.overflow = "hidden";
        }
        renderDrawer();
        refreshQuote(renderDrawer);
    }

    function close() {
        var cbEl = $("cartBar"); if (cbEl) cbEl.classList.remove("hidden");
        // Пристыкованная корзина не закрывается — возвращаем её к списку товаров
        if (isDocked()) {
            if (step === "done") {
                step = "cart"; cart = {}; save();
                var badge0 = $("count"); if (badge0) badge0.textContent = 0;
                listeners.forEach(function (fn) { fn(); });
            }
            view = "cart";
            renderDrawer();
            return;
        }
        $("drawer").classList.remove("on");
        $("scrim").classList.remove("on");
        document.body.style.overflow = "";
        if (step === "done") {
            step = "cart"; cart = {}; save();
            var badge = $("count"); if (badge) badge.textContent = 0;
            listeners.forEach(function (fn) { fn(); });
        }
    }

    // Что предлагаем добрать к заказу. Выбор владельца (27.08.2026):
    // три ролла вместо прежних напитков и закусок — они и дороже,
    // и тянут заказ к порогу скидки первого заказа.
    // ⚠️ Имена ТОЧНО как в Poster, иначе позиция молча не найдётся
    // (у «Калифорния С крабом» большая «С» — так в кассе).
    var UPSELL = [
        "Филадельфия Классическая",
        "(Зап-Рол) с Курицей",
        "Калифорния С крабом"
    ];

    // Эти позиции в корзине не предлагаем вообще — решение владельца
    var NO_SUGGEST = ["Фри", "Пегодя"];

    function upsellHTML() {
        if (!MENU) return "";
        var gifts = (quote && quote.gifts) || [];
        var picks = UPSELL
            .map(function (n) {
                return MENU.items.filter(function (i) { return i.name === n; })[0];
            })
            .filter(function (i) {
                return i && i.available && !cart[i.name] &&
                    gifts.indexOf(i.name) === -1;   // подарок не предлагаем купить
            })
            .slice(0, 5);
        if (!picks.length) return "";
        return '<div class="up-title">' + t("cart.upsell") + '</div><div class="up">' +
            picks.map(function (i) {
                return '<button class="upc" data-inc="' + esc(i.name) + '">' +
                    '<span class="upc-m">' + mediaHTML(i, "20px") + '</span>' +
                    '<b>' + esc(nameOf(i.name)) + '</b>' +
                    '<em class="num">+ ' + money(i.price) + '</em></button>';
            }).join("") + '</div>';
    }

    // Пустая корзина не должна быть тупиком — предлагаем то же, что
    // и в допродаже. Раньше список строился по продажам, и первыми
    // шли Пегодя, Окрошка и рис — дешёвая еда, с которой заказ не
    // растёт. Владелец выбрал показывать три ролла.
    function renderEmptyCart() {
        var picks = [];
        if (MENU) {
            picks = UPSELL
                .map(function (n) {
                    return MENU.items.filter(function (i) { return i.name === n; })[0];
                })
                .filter(function (i) { return i && i.available !== false; });

            // Если выбранных позиций нет в меню (сняли, переименовали) —
            // не оставляем корзину пустой, показываем ходовое
            if (!picks.length) picks = MENU.items.filter(function (i) {
                return i.available !== false && i.sold &&
                    NO_SUGGEST.indexOf(i.name) === -1;
            }).sort(function (a, b) { return (b.sold || 0) - (a.sold || 0); }).slice(0, 6);
        }

        var html = '<div class="empty-top"><b>' + t("cart.empty") + '</b>' +
            '<span>' + t("cart.emptyHint") + '</span></div>';

        if (picks.length) {
            html += '<div class="sug-grid">' + picks.map(function (i) {
                return '<button class="sug-card" data-inc="' + esc(i.name) + '" type="button">' +
                    '<span class="sug-card-m">' + mediaHTML(i) + '</span>' +
                    '<span class="sug-card-n">' + esc(nameOf(i.name)) + '</span>' +
                    '<span class="sug-card-p num">' + money(i.price) + '</span></button>';
            }).join("") + '</div>';
        }

        $("drBody").innerHTML = html;
        $("drTitle").textContent = t("cart.title");
        $("drFoot").innerHTML =
            '<a class="btn-main" id="toMenu" href="/menu.html" style="display:block;text-align:center;text-decoration:none">' +
            t("cart.openMenu") + '</a>';
    }


    // -------------------- быстрые пометки к блюду --------------------

    /* Готовые варианты под тип блюда: гостю проще тапнуть,
       чем печатать. Свободный текст тоже остаётся. */

    var NOTE_CHIPS = {
        sushi:  ["меньше сыра", "без имбиря", "без васаби", "соус отдельно", "нарезать мельче"],
        sets:   ["меньше сыра", "без имбиря", "без васаби", "соус отдельно", "приборы на 2"],
        hot:    ["меньше остроты", "поострее", "без лука", "без кинзы", "хорошо прожарить"],
        soups:  ["меньше остроты", "без кинзы", "без лука", "бульон отдельно", "погорячее"],
        salads: ["без лука", "без кинзы", "заправка отдельно", "меньше соли"],
        sides:  ["без соли", "поострее", "хорошо прожарить"],
        poke:   ["меньше остроты", "соус отдельно", "без лука"],
        drinks: ["безо льда", "побольше льда", "без сахара"]
    };

    var UNIVERSAL = ["без лука", "меньше соли", "упаковать отдельно"];

    function chipsFor(name) {
        var it = MENU && MENU.items.filter(function (i) { return i.name === name; })[0];
        var list = (it && NOTE_CHIPS[it.group]) || UNIVERSAL;
        return list.slice(0, 5);
    }

    // Заметка хранится строкой; разбираем её на выбранные чипсы и остаток
    function splitNote(name) {
        var raw = noteOf(name);
        if (!raw) return { picked: [], free: "" };
        var chips = chipsFor(name), picked = [], rest = raw;
        chips.forEach(function (c) {
            var re = new RegExp("(^|,\\s*)" + c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?=,|$)", "i");
            if (re.test(rest)) { picked.push(c); rest = rest.replace(re, ""); }
        });
        return { picked: picked, free: rest.replace(/^[,\s]+|[,\s]+$/g, "") };
    }

    function joinNote(picked, free) {
        var parts = picked.slice();
        free = String(free || "").trim();
        if (free) parts.push(free);
        return parts.join(", ").slice(0, 120);
    }

    var noteOpen = null;   // имя блюда, у которого раскрыта панель

    function notePanelHTML(name) {
        var st = splitNote(name);
        return '<div class="note-panel" data-panel="' + esc(name) + '">' +
            '<div class="note-chips">' +
            chipsFor(name).map(function (c) {
                var on = st.picked.indexOf(c) !== -1;
                return '<button class="note-chip' + (on ? " on" : "") + '" type="button" ' +
                    'data-chip="' + esc(c) + '">' + esc(c) + '</button>';
            }).join("") + '</div>' +
            '<input class="note-free" type="text" maxlength="120" ' +
            'placeholder="' + t("note.free") + '" value="' + esc(st.free) + '">' +
            '<div class="note-acts">' +
            '<button class="note-save" type="button">' + t("note.save") + '</button>' +
            '<button class="note-cancel" type="button">' + t("note.cancel") + '</button>' +
            '</div></div>';
    }

    function bindNotePanel() {
        var panel = $("drBody").querySelector(".note-panel");
        if (!panel) return;
        var name = panel.dataset.panel;

        panel.querySelectorAll(".note-chip").forEach(function (b) {
            b.onclick = function () { b.classList.toggle("on"); };
        });
        panel.querySelector(".note-cancel").onclick = function () {
            noteOpen = null; renderDrawer();
        };
        panel.querySelector(".note-save").onclick = function () {
            var picked = [].map.call(
                panel.querySelectorAll(".note-chip.on"),
                function (b) { return b.dataset.chip; }
            );
            setNote(name, joinNote(picked, panel.querySelector(".note-free").value));
            noteOpen = null; renderDrawer();
        };
        panel.querySelector(".note-free").focus();
    }

    function renderDrawer() {
        if (step === "done") return;
        if (view === "account") { renderAccount(); return; }
        var list = items();
        $("drTitle").textContent = step === "form" ? t("form.title") : t("cart.title");

        if (!list.length) { renderEmptyCart(); return; }
        if (!quote) {
            $("drBody").innerHTML = '<div class="empty">' + t("cart.counting") + '</div>';
            $("drFoot").innerHTML = "";
            return;
        }
        if (step === "form") { noteOpen = null; renderForm(); return; }

        var html = giftBarHTML();

        quote.lines.forEach(function (l) {
            var li = MENU && MENU.items.filter(function(x){return x.name===l.name;})[0];
            var nt = noteOf(l.name);
            html += '<div class="line-wrap">' +
                '<div class="line"><div class="thumb">' + mediaHTML(li||{name:l.name}) + '</div>' +
                '<div class="line-i"><div class="line-n">' + esc(nameOf(l.name)) + '</div>' +
                '<div class="line-m">' + esc(catOf(l.category)) + '</div>' +
                (l.warn ? '<span class="warn-tag">' + t("warn.stock") + '</span>' : '') + '</div>' +
                '<span class="inq"><button data-dec="' + esc(l.name) + '">−</button>' +
                '<span class="num">' + l.qty + '</span>' +
                '<button data-inc="' + esc(l.name) + '">+</button></span>' +
                '<div class="line-p num">' + money(l.sum) + '</div></div>' +
                (noteOpen === l.name
                    ? notePanelHTML(l.name)
                    : nt
                        ? '<button class="note-has" data-note="' + esc(l.name) + '" type="button">' +
                          '<span>💬 ' + esc(nt) + '</span><em>' + t("note.change") + '</em></button>'
                        : '<button class="note-add" data-note="' + esc(l.name) + '" type="button">' +
                          t("note.add") + '</button>') +
                '</div>';
        });

        quote.gifts.forEach(function (g) {
            html += '<div class="line"><div class="thumb">' + phHTML(g) + '</div>' +
                '<div class="line-i"><div class="line-n">' + esc(nameOf(g)) + '</div>' +
                '<span class="gift-tag">' + t("gift.tag") + '</span></div>' +
                '<div class="line-p num">0</div></div>';
        });

        if (quote.problems && quote.problems.length)
            html += '<div class="msg bad on">' + t("cart.removed") + quote.problems.map(esc).join(", ") + '</div>';

        html += upsellHTML();
        $("drBody").innerHTML = html;

        $("drBody").querySelectorAll("[data-note]").forEach(function (b) {
            b.onclick = function () { noteOpen = b.dataset.note; renderDrawer(); };
        });

        bindNotePanel();

        // Расчёт — в прокрутку, под блюда. Внизу закреплены только
        // полоска до скидки и кнопка с суммой: раньше подвал из шести
        // строк занимал полэкрана телефона и сжимал сами блюда.
        var SUM = t("sum");
        var s = '<div class="sum-box"><div class="sline"><span>' + t("cart.dishes") + '</span><span class="num">' + money(quote.subtotal) + ' ' + SUM + '</span></div>';
        if (quote.firstOff)
            s += '<div class="sline disc"><span>🎉 ' + t("cart.first") +
                 (quote.firstAssumed ? ' <em class="cap">' + t("cart.firstCheck") + '</em>' : '') +
                 '</span><span class="num">−' + money(quote.firstOff) + ' ' + SUM + '</span></div>';
        else if (quote.firstPromise && !quote.firstGap)
            s += '<div class="sline disc"><span>🎉 ' + t("cart.first") + '</span><span>' + t("cart.firstWait") + '</span></div>';
        if (quote.discount)
            s += '<div class="sline disc"><span>' + t("cart.discount") + '</span><span class="num">−' + money(quote.discount) + ' ' + SUM + '</span></div>';
        quote.gifts.forEach(function (g) {
            s += '<div class="sline disc"><span>🎁 ' + esc(nameOf(g)) + '</span><span>0 ' + SUM + '</span></div>';
        });
        if (quote.gifts.length && quote.discountRaw)
            s += '<div class="note-small">' + t("cart.giftNoStack") + '</div>';
        s += '<div class="sline"><span>' + t("cart.delivery") + '</span><span>' + t("cart.deliveryByYandex") + '</span></div>' +
            '<div class="total"><span>' + t("cart.total") + '</span><b class="num">' + money(quote.total) + ' ' + SUM + '</b></div>' +
            '<div class="dnote"><b>' + t("cart.delivery") + '</b>' + t("cart.deliveryNote") + '</div></div>';
        $("drBody").insertAdjacentHTML("beforeend", s);

        var f = "";
        if (!quote.firstOff && quote.firstGap) {
            // Подсказка «добавьте ещё» — и клиенту польза, и чек выше
            var need = quote.subtotal + quote.firstGap;
            var pct = Math.max(4, Math.min(100, Math.round(quote.subtotal / need * 100)));
            f += '<div class="gap-bar"><div class="gap-t"><span>🎉 ' + t("cart.firstGap1") + ' ' + money(quote.firstAmount) + ' ' + SUM +
                 '</span><b>' + t("cart.firstGap2") + ' ' + money(quote.firstGap) + ' ' + SUM + '</b></div>' +
                 '<div class="bar"><i style="width:' + pct + '%"></i></div></div>';
        }
        f += '<button class="btn-main btn-sum" id="toForm"><span>' + t("cart.checkout") + '</span>' +
            '<b class="num">' + money(quote.total) + ' ' + SUM + '</b></button>';
        $("drFoot").innerHTML = f;
        $("toForm").onclick = function () {
            track("InitiateCheckout", { value: quote.total, currency: "UZS" });
            step = "form"; renderDrawer(); $("drBody").scrollTop = 0;
            ev("checkout", "", "перешёл к оформлению");
        };
    }

    var form = { name: "", phone: "", address: "", when: "Как можно скорее", pay: "Наличные", comment: "" };

    // Способы оплаты — видимыми кнопками, а не выпадающим списком:
    // в списке Click видели только те, кто его открывал.
    // ⚠️ value остаётся русским («Наличные», «Click») — его читают
    // кухня в Telegram и касса Poster, переводится только подпись.
    function payOptionsHTML() {

        var list = [];

        // Click первым: оплата вперёд, без сдачи и без невыкупа
        if (MENU && MENU.click)
            list.push({ v: "Click", k: "form.click", d: "form.clickNote", i: "📱", hot: true });

        list.push({ v: "Наличные", k: "form.cash", d: "form.cashNote", i: "💵" });
        // «Карта курьеру» убрана владельцем 27.08.2026 — терминала
        // с курьером нет. Вернуть = добавить строку сюда
        // ({ v: "Карта", k: "form.card", d: "form.cardNote", i: "💳" }).

        if (MENU && MENU.transfer)
            list.push({ v: "Перевод на карту", k: "form.transfer", d: "form.transferNote", i: "🏦" });

        return list.map(function (o) {
            var on = form.pay === o.v;
            return '<button type="button" class="payopt' + (on ? " on" : "") +
                (o.hot ? " hot" : "") + '" data-pay="' + esc(o.v) + '"' +
                ' role="radio" aria-checked="' + (on ? "true" : "false") + '">' +
                '<span class="payopt-i" aria-hidden="true">' + o.i + '</span>' +
                '<span class="payopt-t"><b>' + esc(t(o.k)) + '</b>' +
                '<em>' + esc(t(o.d)) + '</em></span>' +
                (o.hot ? '<span class="payopt-b">' + esc(t("form.payFast")) + '</span>' : '') +
                '</button>';
        }).join("");
    }

    function renderForm() {
        // Подставляем сохранённое, чтобы не заполнять заново.
        // У вошедшего приоритет — данные аккаунта.
        var pr = profile(), act = activeAddress();
        var name0 = (AUTH && AUTH.name) || pr.name;
        var phone0 = (AUTH && AUTH.phone) || pr.phone;
        if (!form.name && name0) form.name = name0;
        if (!form.phone && phone0) form.phone = phone0;
        if (!form.address && act) form.address = act.text;

        $("drBody").innerHTML =
            '<div class="msg bad" id="err"></div>' +
            '<div class="field"><label for="f-name">' + t("form.name") + '</label>' +
            '<input id="f-name" autocomplete="name" value="' + esc(form.name) + '" placeholder="' + t("form.namePh") + '"></div>' +
            '<div class="field"><label for="f-phone">' + t("form.phone") + '</label>' +
            '<input id="f-phone" type="tel" autocomplete="tel" inputmode="tel" value="' + esc(form.phone) + '" placeholder="+998 __ ___-__-__">' +
            '<div class="hint">' + t("form.phoneHint") + '</div></div>' +
            '<div class="field"><label for="f-adr">' + t("form.addr") + '</label>' +
            '<input id="f-adr" autocomplete="street-address" value="' + esc(form.address) + '" placeholder="' + t("form.addrPh") + '"></div>' +
            '<div class="field"><label for="f-when">' + t("form.when") + '</label><select id="f-when">' +
            '<option value="Как можно скорее">' + t("form.asap") + '</option>' +
            '<option value="Ко времени">' + t("form.onTime") + '</option></select></div>' +
            '<div class="field"><label>' + t("form.pay") + '</label>' +
            '<div class="paylist" id="payList" role="radiogroup" aria-label="' + esc(t("form.pay")) + '">' +
            payOptionsHTML() + '</div></div>' +
            '<div class="field"><label for="f-note">' + t("form.comment") + '</label>' +
            '<textarea id="f-note" placeholder="' + t("form.commentPh") + '">' + esc(form.comment) + '</textarea></div>';
        if ($("f-when")) $("f-when").value = form.when;
        // Телефон меняет итог: скидка первого заказа даётся один раз
        // на номер, поэтому пересчитываем, когда его дописали
        var phoneTimer = null;
        var phoneEl = $("f-phone");
        if (phoneEl) {
            phoneEl.addEventListener("input", function () {
                clearTimeout(phoneTimer);
                phoneTimer = setTimeout(function () {
                    if (String(form.phone || "").replace(/\D/g, "").length >= 9) {
                        refreshQuote(function () { renderDrawer(); });
                    }
                }, 700);
            });
        }

        // В зале полей адреса и времени нет — подписываемся только
        // на те, что реально отрисованы, иначе форма падала на null
        // и кнопка «Отправить» не появлялась вовсе.
        ["name", "phone", "adr", "when", "note"].forEach(function (k) {
            var el = $("f-" + k);
            if (!el) return;
            el.addEventListener("input", collect);
            el.addEventListener("change", collect);
        });

        // Выбор оплаты: перерисовываем только сами кнопки, чтобы
        // не терять фокус и уже введённый текст в полях формы
        var payBox = $("payList");
        if (payBox) {
            payBox.addEventListener("click", function (e) {
                var b = e.target.closest(".payopt");
                if (!b) return;
                collect();
                form.pay = b.dataset.pay;
                payBox.innerHTML = payOptionsHTML();
            });
        }
        $("drFoot").innerHTML =
            '<button class="btn-main btn-sum" id="send"><span>' + t("form.send") + '</span>' +
            '<b class="num">' + money(quote.total) + ' ' + t("sum") + '</b></button>' +
            '<button class="back-link" id="back" type="button">← ' + t("form.back") + '</button>';
        $("back").onclick = function () { step = "cart"; renderDrawer(); $("drBody").scrollTop = 0; };
        $("send").onclick = send;
    }

    function collect() {
        form.name = $("f-name").value;
        form.phone = $("f-phone") ? $("f-phone").value : "";
        // В зале полей адреса и времени нет — форма их не рисует
        form.address = $("f-adr") ? $("f-adr").value : "";
        form.when = $("f-when") ? $("f-when").value : "";
        form.comment = $("f-note").value;   // оплату хранит сам form.pay
    }

    function showErr(t) {
        var e = $("err"); if (!e) return;
        e.textContent = t; e.classList.add("on");
        $("drBody").scrollTop = 0;
    }

    function send() {
        collect();
        if (form.phone.replace(/\D/g, "").length < 9) {
            showErr(t("form.errPhone"));
            $("f-phone").classList.add("err"); return;
        }
        if (form.address.trim().length < 5) {
            showErr(t("form.errAddr"));
            $("f-adr").classList.add("err"); return;
        }
        var btn = $("send"), btnHTML = btn.innerHTML; btn.disabled = true; btn.textContent = t("form.sending");
        fetch("/api/order", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                items: items(), name: form.name, phone: form.phone, address: form.address,
                when: form.when, pay: form.pay, comment: form.comment, test: TEST,
                source: utmData()
            })
        })
            .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
            .then(function (res) {
                if (!res.ok || !res.d.ok) {
                    showErr(res.d.error || t("form.errSend"));
                    btn.disabled = false; btn.innerHTML = btnHTML; return;
                }
                saveProfile({ name: form.name, phone: form.phone });
                addAddress(form.address);
                rememberOrder({
                    number: res.d.number,
                    total: res.d.total,
                    date: new Date().toLocaleDateString("ru-RU", {
                        day: "2-digit", month: "2-digit", year: "numeric"
                    }),
                    items: items()
                });
                // Вошедшему заказ уже записан на сервере — обновим историю
                if (AUTH) serverOrders = null;

                track("Purchase", { value: quote.total, currency: "UZS" });

                step = "done";
                $("drTitle").textContent = t("done.title");
                // При переводе заказ ждёт денег: реквизиты и номер
                // показываем сразу, иначе человек уйдёт со страницы
                // и платить будет некуда.
                var pay = "";
                if (form.pay === "Перевод на карту" && MENU && MENU.transfer) {
                    pay =
                        '<div class="paybox">' +
                        '<div class="paybox-t">' + t("done.payTitle") + '</div>' +
                        '<div class="paybox-card" id="payCard">' + esc(MENU.transfer.number) + '</div>' +
                        (MENU.transfer.holder
                            ? '<div class="paybox-h">' + esc(MENU.transfer.holder) +
                              (MENU.transfer.bank ? ' · ' + esc(MENU.transfer.bank) : '') + '</div>'
                            : '') +
                        '<button class="paybox-copy" id="payCopy">' + t("done.payCopy") + '</button>' +
                        '<div class="paybox-n">' + t("done.payNote") + '</div>' +
                        '</div>';
                }

                // Оплата через Click. Кнопка перехода — ВСЕГДА и первой,
                // на любом экране: раньше на широком её не было вовсе,
                // и человек упирался в код, который нечем отсканировать.
                // Код остаётся ниже запасным путём — платить может другой
                // человек со своего телефона.
                var payBlock = "";
                if (form.pay === "Click" && MENU && MENU.click) {
                    var isPhone = matchMedia("(max-width: 820px)").matches;
                    var qrSize = isPhone ? 180 : 220;
                    // Ссылка на оплату ИМЕННО этого заказа приходит с
                    // сервера, когда в .env заданы реквизиты Click: там
                    // уже проставлены сумма и номер, и открывается она в
                    // любом браузере. Иначе — код терминала, где сумму
                    // человек вводит сам.
                    var own = res.d.payUrl || "";
                    payBlock =
                        '<div class="paybox">' +
                        '<div class="pay-sum">' + money(res.d.total) + ' ' + t("sum") + '</div>' +
                        '<div class="pay-note">' + t(own ? "pay.readySum" : "pay.enterSum") + '</div>' +
                        // Новой вкладкой: экран с номером заказа должен
                        // остаться на месте, к нему ещё возвращаться
                        // Своя ссылка на заказ (когда есть реквизиты)
                        // открывается в любом браузере — она и главная,
                        // код терминала рядом с ней только путает.
                        (own
                            ? '<a class="btn-main pay-go" href="' + esc(own) + '"' +
                              ' target="_blank" rel="noopener">' + t("pay.open") + '</a>'
                            // Код терминала понимает ТОЛЬКО приложение
                            // Click, браузер отдаёт на него 404. Поэтому
                            // на компьютере первым идёт код (навёл телефон
                            // и оплатил), а на телефоне — кнопка: свой
                            // экран не отсканируешь, приложение открывает
                            // ссылку само.
                            : isPhone
                                ? '<a class="btn-main pay-go" href="' + esc(MENU.click.link) + '">' +
                                  t("pay.openApp") + '</a>' +
                                  '<div class="pay-note">' + t("pay.appOnly") + '</div>' +
                                  '<div class="pay-or">' + t("pay.or") + '</div>' +
                                  '<img class="pay-qr" src="' + esc(MENU.click.qr) + '" alt="Click QR"' +
                                  ' width="' + qrSize + '" height="' + qrSize + '">' +
                                  '<div class="pay-note">' + t("pay.scanOther") + '</div>'
                                : '<img class="pay-qr" src="' + esc(MENU.click.qr) + '" alt="Click QR"' +
                                  ' width="' + qrSize + '" height="' + qrSize + '">' +
                                  '<div class="pay-note">' + t("pay.scan") + '</div>') +
                        '<div class="pay-after">' + t(own ? "pay.afterOwn" : "pay.after") + '</div>' +
                        '</div>';
                }

                $("drBody").innerHTML = '<div class="done"><div class="done-i">✓</div>' +
                    '<h2>' + t("done.thanks") + '</h2><p>' + t("done.cooking") + '</p>' +
                    '<div class="no">№ ' + esc(res.d.number) + '</div>' +
                    pay +
                    '<p>' + t("done.callYou") + '<b>' + esc(form.phone) + '</b>' + t("done.callYouTail") + '</p>' +
                    '<p style="margin-top:10px">' +
                    // При Click деньги уже уходят через приложение —
                    // «оплата курьеру при получении» тут врала
                    t(form.pay === "Click" ? "done.courierClick" : "done.courier") +
                    '</p>' + payBlock + '</div>';

                if ($("payCopy")) {
                    $("payCopy").onclick = function () {
                        var btn = this;
                        var num = String(MENU.transfer.number).replace(/\s/g, "");
                        var done = function () {
                            btn.textContent = t("done.payCopied");
                            setTimeout(function () { btn.textContent = t("done.payCopy"); }, 1600);
                        };
                        if (navigator.clipboard) {
                            navigator.clipboard.writeText(num).then(done).catch(function () {
                                fallbackCopy(num); done();
                            });
                        } else { fallbackCopy(num); done(); }
                    };
                }
                $("drFoot").innerHTML = '<button class="btn-main" id="fin">' + t("done.ok") + '</button>';
                $("fin").onclick = close;
            })
            .catch(function () {
                showErr(t("form.errNet"));
                btn.disabled = false; btn.innerHTML = btnHTML;
            });
    }


    // ==================== ХРАНИЛИЩЕ ПОЛЬЗОВАТЕЛЯ ====================

    /* Профиль, адреса и история заказов живут в браузере гостя.
       Сервер их не хранит: паролей нет, регистрации нет — данные
       нужны только чтобы не заполнять форму заново. */

    // Тестовый режим: /?test=1 включить, /?test=0 выключить.
    // Заказы уходят в Telegram с пометкой, но не идут на кассу.
    var TEST = false, GLOBAL_TEST = false;
    try {
        var qp = new URLSearchParams(location.search).get("test");
        if (qp === "1") localStorage.setItem("kyoto_test", "1");
        if (qp === "0") localStorage.removeItem("kyoto_test");
        TEST = localStorage.getItem("kyoto_test") === "1";
    } catch (e) { TEST = false; }

    function showTestBar() {
        if (!TEST || document.getElementById("testBar")) return;
        var bar = document.createElement("div");
        bar.id = "testBar";
        bar.className = "test-bar";
        // Общий режим (SITE_TEST_MODE на сервере) посетитель выключить
        // не может — прячем ссылку, иначе она обманывает.
        bar.innerHTML = '<b>' + t("test.title") + '</b>' +
            '<span>' + t("test.text") + '</span>' +
            (GLOBAL_TEST ? '' : '<a href="?test=0">' + t("test.off") + '</a>');
        document.body.appendChild(bar);
        document.body.classList.add("has-test-bar");
    }

    function readLS(key, def) {
        try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }
        catch (e) { return def; }
    }
    function writeLS(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
    }

    // -------------------- реклама: Meta Pixel и UTM --------------------

    /* Пиксель включается, только если сервер прислал его id (FB_PIXEL_ID
       в .env) и сайт не в тестовом режиме. Без id и в тесте track() —
       пустышка, ничего никуда не уходит. */
    beacon("visit");
    heartbeat();
    // Корзина переживает перезагрузку — полосу рисуем сразу,
    // а сумму подтягиваем расчётом с сервера
    try {
        paintCartBar();
        if (count()) refreshQuote(function () { paintCartBar(); });
    } catch (e) {}

    function initPixel(id) {
        if (!id || TEST || window.fbq) return;
        var n = window.fbq = function () {
            n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if (!window._fbq) window._fbq = n;
        n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
        var sc = document.createElement("script");
        sc.async = true;
        sc.src = "https://connect.facebook.net/en_US/fbevents.js";
        document.head.appendChild(sc);
        window.fbq("init", id);
        window.fbq("track", "PageView");
    }

    function track(event, params) {
        if (window.fbq) window.fbq("track", event, params || {});
    }

    /* Метки из рекламной ссылки живут 30 дней: заказ через неделю
       после клика всё равно припишется кампании. */
    (function saveUTM() {
        try {
            var q = new URLSearchParams(location.search), u = {}, got = false;
            ["utm_source", "utm_medium", "utm_campaign", "utm_content", "fbclid"]
                .forEach(function (k) {
                    var v = q.get(k);
                    if (v) { u[k] = String(v).slice(0, 120); got = true; }
                });
            if (got) { u.ts = Date.now(); writeLS("kyoto_utm", u); }
        } catch (e) {}
    })();

    function utmData() {
        var u = readLS("kyoto_utm", null);
        if (u && u.ts && Date.now() - u.ts < 30 * 864e5) return u;
        return null;
    }

    function profile() { return readLS("kyoto_profile", { name: "", phone: "" }); }
    function saveProfile(p) { writeLS("kyoto_profile", p); }

    function addresses() { return readLS("kyoto_addresses", []); }
    function saveAddresses(a) { writeLS("kyoto_addresses", a); paintAddrBtn(); }

    function activeAddress() {
        var a = addresses();
        for (var i = 0; i < a.length; i++) { if (a[i].on) return a[i]; }
        return a[0] || null;
    }

    function addAddress(text) {
        text = String(text || "").trim();
        if (text.length < 5) return false;
        var a = addresses(), low = text.toLowerCase(), found = false;
        a.forEach(function (x) {
            var same = x.text.toLowerCase() === low;
            if (same) found = true;
            x.on = same;
        });
        if (!found) a.push({ id: String(Date.now()), text: text, on: true });
        saveAddresses(a);
        return true;
    }
    function pickAddress(id) {
        var a = addresses();
        a.forEach(function (x) { x.on = x.id === id; });
        saveAddresses(a);
    }
    function dropAddress(id) {
        var a = addresses().filter(function (x) { return x.id !== id; });
        if (a.length && !a.some(function (x) { return x.on; })) a[0].on = true;
        saveAddresses(a);
    }

    function orders() { return readLS("kyoto_orders", []); }
    function rememberOrder(o) {
        var list = orders();
        list.unshift(o);
        writeLS("kyoto_orders", list.slice(0, 20));
    }

    // ==================== АККАУНТ (сервер) ====================

    /* Регистрация по телефону+паролю. История заказов хранится на
       сервере и следует за пользователем на любом устройстве.
       Гость по-прежнему заказывает без регистрации. */

    var AUTH = null;          // { id, name, phone } или null
    var serverOrders = null;  // кэш истории с сервера

    function paintAccBtn() {
        var b = $("accBtn");
        if (!b) return;
        b.classList.toggle("in", !!AUTH);
        b.setAttribute("aria-label", AUTH ? t("acc.aria") : t("acc.ariaGuest"));
    }

    function fetchMe() {
        return fetch("/api/auth/me", { credentials: "same-origin" })
            .then(function (r) { return r.json(); })
            .then(function (d) { AUTH = (d && d.user) || null; paintAccBtn(); return AUTH; })
            .catch(function () { AUTH = null; return null; });
    }

    function postJSON(path, data) {
        return fetch(path, {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data || {})
        }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); });
    }

    function doLogout() {
        return fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
            .then(function () { AUTH = null; serverOrders = null; paintAccBtn(); });
    }

    function fetchOrders() {
        return fetch("/api/auth/orders", { credentials: "same-origin" })
            .then(function (r) { return r.ok ? r.json() : { orders: [] }; })
            .then(function (d) { serverOrders = (d && d.orders) || []; return serverOrders; })
            .catch(function () { serverOrders = []; return serverOrders; });
    }

    // ==================== ПОДСКАЗКИ ПОИСКА ====================

    function findItems(q, limit) {
        if (!MENU) return [];
        q = String(q || "").trim().toLowerCase();
        if (q.length < 2) return [];
        var head = [], tail = [];
        MENU.items.forEach(function (i) {
            if (i.available === false) return;
            // Ищем и по исходному имени, и по показанному (узбекскому)
            var n = i.name.toLowerCase(), shown = nameOf(i.name).toLowerCase();
            var at = n.indexOf(q), atShown = shown.indexOf(q);
            if (at === 0 || atShown === 0) head.push(i);
            else if (at > 0 || atShown > 0) tail.push(i);
            else if (i.category && i.category.toLowerCase().indexOf(q) >= 0) tail.push(i);
        });
        return head.concat(tail).slice(0, limit || 8);
    }

    var sugList = [], sugAt = -1;

    function sugBox() { return $("sug"); }

    function closeSug() {
        var b = sugBox();
        if (b) { b.classList.remove("on"); b.innerHTML = ""; }
        sugList = []; sugAt = -1;
    }

    function paintSug() {
        var b = sugBox(), input = $("q");
        if (!b || !input) return;
        sugList = findItems(input.value, 8);
        if (!sugList.length) { closeSug(); return; }
        b.innerHTML = sugList.map(function (i, n) {
            return '<button class="sug-row' + (n === sugAt ? " at" : "") + '" data-sug="' + n + '" type="button">' +
                '<span class="sug-i">' + esc(nameOf(i.name)) + '<em>' + esc(catOf(i.category || "")) + '</em></span>' +
                '<span class="sug-p num">' + money(i.price) + '</span></button>';
        }).join("");
        b.classList.add("on");
    }

    function takeSug(n) {
        var i = sugList[n];
        if (!i) return;
        setQty(i.name, qtyOf(i.name) + 1);
        var input = $("q");
        if (input) { input.value = ""; input.blur(); }
        closeSug();
        open();
    }

    // Поисковый запрос отправляем через секунду после последней
    // буквы: иначе «филадельфия» превратится в 11 событий
    var searchTimer = null;
    function noteSearch(text) {
        clearTimeout(searchTimer);
        var q = String(text || "").trim();
        if (q.length < 3) return;
        searchTimer = setTimeout(function () {
            ev("search", q, "искал: " + q);
        }, 1000);
    }

    function initSearch() {
        var input = $("q");
        if (!input) return;

        var box = document.createElement("div");
        box.className = "sug";
        box.id = "sug";
        input.parentNode.appendChild(box);

        var t;
        input.addEventListener("input", function () {
            noteSearch(input.value);
            clearTimeout(t); sugAt = -1;
            t = setTimeout(paintSug, 90);
        });

        input.addEventListener("keydown", function (e) {
            if (!sugList.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); sugAt = (sugAt + 1) % sugList.length; paintSug(); }
            else if (e.key === "ArrowUp") { e.preventDefault(); sugAt = (sugAt - 1 + sugList.length) % sugList.length; paintSug(); }
            else if (e.key === "Enter" && sugAt >= 0) { e.preventDefault(); takeSug(sugAt); }
            else if (e.key === "Escape") { closeSug(); }
        });

        box.addEventListener("mousedown", function (e) {
            var b = e.target.closest("[data-sug]");
            if (!b) return;
            e.preventDefault();
            takeSug(Number(b.dataset.sug));
        });

        document.addEventListener("click", function (e) {
            if (!e.target.closest(".search")) closeSug();
        });
    }

    // ==================== ВЫБОР АДРЕСА ====================

    function paintAddrBtn() {
        var b = $("addrBtn");
        if (!b) return;
        var a = activeAddress();
        b.querySelector(".addr-t").textContent = a ? a.text : t("addr.ask");
        b.classList.toggle("empty", !a);
    }

    function paintAddrMenu() {
        var m = $("addrMenu");
        if (!m) return;
        m.innerHTML =
            '<button class="addr-new" id="addrNew" type="button">' +
            '<span>' + t("addr.new") + '</span><span>›</span></button>' +
            addresses().map(function (a) {
                return '<div class="addr-row' + (a.on ? " on" : "") + '">' +
                    '<button class="addr-pick" data-addr="' + esc(a.id) + '" type="button">' +
                    '<span class="addr-pin">◎</span>' + esc(a.text) + '</button>' +
                    '<button class="addr-del" data-addrdel="' + esc(a.id) + '" type="button" ' +
                    'aria-label="' + t("addr.del") + '">✕</button></div>';
            }).join("") +
            (addresses().length ? "" : '<div class="addr-hint">' + t("addr.hint") + '</div>');

        $("addrNew").onclick = function () {
            var text = window.prompt(t("addr.prompt"));
            if (text && addAddress(text)) { paintAddrMenu(); closeAddr(); }
            else if (text !== null) { window.alert(t("addr.short")); }
        };
        m.querySelectorAll("[data-addr]").forEach(function (b) {
            b.onclick = function () { pickAddress(b.dataset.addr); paintAddrMenu(); closeAddr(); };
        });
        m.querySelectorAll("[data-addrdel]").forEach(function (b) {
            b.onclick = function () { dropAddress(b.dataset.addrdel); paintAddrMenu(); };
        });
    }

    function closeAddr() {
        var m = $("addrMenu");
        if (m) m.classList.remove("on");
    }

    function initAddr() {
        var b = $("addrBtn");
        if (!b) return;
        paintAddrBtn();
        b.onclick = function (e) {
            e.stopPropagation();
            var m = $("addrMenu");
            paintAddrMenu();
            m.classList.toggle("on");
        };
        document.addEventListener("click", function (e) {
            if (!e.target.closest(".addr")) closeAddr();
        });
    }

    // ==================== ЛИЧНЫЙ КАБИНЕТ ====================

    // Один заказ в истории. Работает и для серверной записи (ts),
    // и для локальной (date) — форма items одинакова: [{name,qty}].
    function historyItemHTML(o) {
        var date = o.date || (o.ts
            ? new Date(o.ts).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
            : "");
        return '<div class="ord"><div class="ord-top"><b>№ ' + esc(o.number) + '</b>' +
            '<span class="num">' + money(o.total) + ' ' + t("sum") + '</span></div>' +
            '<div class="ord-d">' + esc(date) + '</div>' +
            '<div class="ord-i">' + o.items.map(function (i) {
                return esc(nameOf(i.name)) + ' × ' + i.qty;
            }).join(", ") + '</div>' +
            '<button class="btn-ghost3" data-again=\'' + esc(JSON.stringify(o.items)) + '\' type="button">' +
            t("acc.repeat") + '</button></div>';
    }

    function addressesBlockHTML() {
        var a = addresses();
        return '<div class="acc-sec">' + t("acc.addresses") + '</div>' +
            (a.length
                ? '<div class="acc-addr">' + a.map(function (x) {
                    return '<div class="addr-row' + (x.on ? " on" : "") + '">' +
                        '<button class="addr-pick" data-addr="' + esc(x.id) + '" type="button">' +
                        '<span class="addr-pin">◎</span>' + esc(x.text) + '</button>' +
                        '<button class="addr-del" data-addrdel="' + esc(x.id) + '" type="button" aria-label="' + t("addr.del") + '">✕</button>' +
                        '</div>';
                }).join("") + '</div>'
                : '<div class="acc-empty">' + t("acc.noAddresses") + '</div>') +
            '<button class="btn-ghost3" id="a-add" type="button">' + t("acc.addAddress") + '</button>';
    }

    // Общие обработчики кабинета: адреса и «повторить заказ».
    function bindAccountCommon() {
        var add = $("a-add");
        if (add) add.onclick = function () {
            var text = window.prompt(t("addr.prompt"));
            if (text && addAddress(text)) renderAccount();
            else if (text !== null) window.alert(t("addr.short"));
        };
        $("drBody").querySelectorAll("[data-addr]").forEach(function (b) {
            b.onclick = function () { pickAddress(b.dataset.addr); renderAccount(); };
        });
        $("drBody").querySelectorAll("[data-addrdel]").forEach(function (b) {
            b.onclick = function () { dropAddress(b.dataset.addrdel); renderAccount(); };
        });
        $("drBody").querySelectorAll("[data-again]").forEach(function (b) {
            b.onclick = function () {
                var its = JSON.parse(b.dataset.again);
                its.forEach(function (i) { setQty(i.name, qtyOf(i.name) + i.qty); });
                view = "cart"; step = "cart"; renderDrawer();
            };
        });
        $("drFoot").innerHTML = '<button class="btn-main" id="a-shop" type="button">' + t("acc.shop") + '</button>';
        $("a-shop").onclick = function () { view = "cart"; renderDrawer(); };
    }

    function renderAccount() {
        $("drTitle").textContent = t("acc.title");
        if (AUTH) renderAccountUser();
        else renderAccountGuest();
    }

    // --- вошедший пользователь: профиль, адреса, история с сервера ---
    function renderAccountUser() {
        var histHTML;
        if (serverOrders === null) {
            histHTML = '<div class="acc-empty">' + t("acc.historyLoading") + '</div>';
        } else if (serverOrders.length) {
            histHTML = serverOrders.map(historyItemHTML).join("");
        } else {
            histHTML = '<div class="acc-empty">' + t("acc.noHistory") + '</div>';
        }

        $("drBody").innerHTML =
            '<div class="acc-user"><div class="acc-user-i">' +
            '<b>' + esc(AUTH.name) + '</b><span>' + esc(fmtPhone(AUTH.phone)) + '</span></div>' +
            '<button class="acc-logout" id="a-logout" type="button">' + t("acc.logout") + '</button></div>' +
            addressesBlockHTML() +
            '<div class="acc-sec">' + t("acc.history") + '</div>' + histHTML;

        $("a-logout").onclick = function () {
            doLogout().then(function () { renderAccount(); });
        };
        bindAccountCommon();

        // Историю тянем один раз, потом перерисовываем
        if (serverOrders === null) fetchOrders().then(function () {
            if (view === "account" && AUTH) renderAccount();
        });
    }

    // --- гость: вход/регистрация + локальные данные для заказа ---
    var authMode = "login";

    function authFieldsHTML() {
        var pr = profile();
        var name = authMode === "reg"
            ? '<div class="field"><label for="au-name">' + t("form.name") + '</label>' +
              '<input id="au-name" value="' + esc(pr.name || "") + '" placeholder="' + t("form.namePh") + '" autocomplete="name"></div>'
            : '';
        return name +
            '<div class="field"><label for="au-phone">' + t("form.phone") + '</label>' +
            '<input id="au-phone" type="tel" value="' + esc(pr.phone || "") + '" placeholder="+998 __ ___-__-__" autocomplete="tel"></div>' +
            '<div class="field"><label for="au-pass">' + t("acc.pass") + '</label>' +
            '<input id="au-pass" type="password" placeholder="' + (authMode === "reg" ? t("acc.passNewPh") : t("acc.passPh")) + '" ' +
            'autocomplete="' + (authMode === "reg" ? "new-password" : "current-password") + '"></div>';
    }

    function paintAuth() {
        $("auth-fields").innerHTML = authFieldsHTML();
        $("auth-submit").textContent = authMode === "reg" ? t("acc.doRegister") : t("acc.doLogin");
        $("drBody").querySelectorAll(".auth-tab").forEach(function (t) {
            t.classList.toggle("on", t.dataset.tab === authMode);
        });
        var f = $("au-name") || $("au-phone");
        if (f) f.focus();
    }

    function renderAccountGuest() {
        var list = orders();

        $("drBody").innerHTML =
            '<div class="acc-sec">' + t("acc.section") + '</div>' +
            '<div class="auth">' +
            '<div class="auth-tabs">' +
            '<button class="auth-tab on" data-tab="login" type="button">' + t("acc.login") + '</button>' +
            '<button class="auth-tab" data-tab="reg" type="button">' + t("acc.register") + '</button>' +
            '</div>' +
            '<div class="msg bad" id="auth-err"></div>' +
            '<div id="auth-fields"></div>' +
            '<button class="btn-main" id="auth-submit" type="button">' + t("acc.doLogin") + '</button>' +
            '<div class="auth-note">' + t("acc.note") + '</div>' +
            '</div>' +
            addressesBlockHTML() +
            '<div class="acc-sec">' + t("acc.history") + '</div>' +
            (list.length
                ? list.map(historyItemHTML).join("")
                : '<div class="acc-empty">' + t("acc.noHistoryGuest") + '</div>');

        authMode = "login";
        paintAuth();

        $("drBody").querySelectorAll(".auth-tab").forEach(function (t) {
            t.onclick = function () { authMode = t.dataset.tab; hideAuthErr(); paintAuth(); };
        });
        $("auth-submit").onclick = submitAuth;
        $("drBody").addEventListener("keydown", function (e) {
            if (e.key === "Enter" && e.target.closest(".auth")) { e.preventDefault(); submitAuth(); }
        });

        bindAccountCommon();
    }

    function showAuthErr(t) {
        var e = $("auth-err"); if (!e) return;
        e.textContent = t; e.classList.add("on");
    }
    function hideAuthErr() {
        var e = $("auth-err"); if (e) e.classList.remove("on");
    }

    function submitAuth() {
        hideAuthErr();
        var phone = ($("au-phone") || {}).value || "";
        var pass = ($("au-pass") || {}).value || "";
        var name = ($("au-name") || {}).value || "";

        if (phone.replace(/\D/g, "").length < 9) return showAuthErr(t("acc.errPhone"));
        if (authMode === "reg" && name.trim().length < 2) return showAuthErr(t("acc.errName"));
        if (pass.length < (authMode === "reg" ? 6 : 1))
            return showAuthErr(authMode === "reg" ? t("acc.errPassShort") : t("acc.errPassEmpty"));

        var btn = $("auth-submit");
        btn.disabled = true; btn.textContent = t("acc.wait");

        var req = authMode === "reg"
            ? postJSON("/api/auth/register", { name: name, phone: phone, password: pass })
            : postJSON("/api/auth/login", { phone: phone, password: pass });

        req.then(function (res) {
            if (!res.ok || !res.d.user) {
                btn.disabled = false; btn.textContent = authMode === "reg" ? t("acc.doRegister") : t("acc.doLogin");
                return showAuthErr(res.d.error || t("acc.errLogin"));
            }
            AUTH = res.d.user;
            serverOrders = null;
            // Подставим имя/телефон в данные заказа
            saveProfile({ name: AUTH.name, phone: AUTH.phone });
            form.name = AUTH.name; form.phone = AUTH.phone;
            paintAccBtn();
            renderAccount();
        }).catch(function () {
            btn.disabled = false; btn.textContent = authMode === "reg" ? t("acc.doRegister") : t("acc.doLogin");
            showAuthErr(t("acc.errNet"));
        });
    }

    // Красиво показать телефон 998XXXXXXXXX как +998 XX XXX-XX-XX
    function fmtPhone(p) {
        var d = String(p || "").replace(/\D/g, "");
        if (d.length === 12 && d.slice(0, 3) === "998") {
            return "+998 " + d.slice(3, 5) + " " + d.slice(5, 8) + "-" + d.slice(8, 10) + "-" + d.slice(10, 12);
        }
        return p;
    }

    // -------------------- тема: день / ночь --------------------

    /* Выбор хранится в localStorage. Если пользователь не выбирал —
       следуем настройке системы и переключаемся вместе с ней. */

    function applyTheme(mode) {
        if (mode === "light" || mode === "dark") {
            document.documentElement.setAttribute("data-theme", mode);
        } else {
            document.documentElement.removeAttribute("data-theme");
        }
    }

    function currentTheme() {
        var saved = null;
        try { saved = localStorage.getItem("kyoto_theme"); } catch (e) {}
        if (saved === "light" || saved === "dark") return saved;
        return window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark" : "light";
    }

    function initTheme() {
        var btn = $("themeBtn");
        if (!btn) return;

        btn.onclick = function () {
            var next = currentTheme() === "dark" ? "light" : "dark";
            try { localStorage.setItem("kyoto_theme", next); } catch (e) {}
            applyTheme(next);
        };

        // Пока выбора нет — идём за системой
        if (window.matchMedia) {
            var mq = window.matchMedia("(prefers-color-scheme: dark)");
            var follow = function () {
                var saved = null;
                try { saved = localStorage.getItem("kyoto_theme"); } catch (e) {}
                if (!saved) applyTheme(null);
            };
            if (mq.addEventListener) mq.addEventListener("change", follow);
            else if (mq.addListener) mq.addListener(follow);
        }
    }

    // -------------------- инициализация --------------------

    function init(onReady) {
        var badge = $("count");
        if (badge) badge.textContent = count();

        showTestBar();
        initTheme();
        initLang();
        initSide();
        initSearch();
        initAddr();
        fetchMe();   // узнаём, вошёл ли пользователь (кука)

        $("cartBtn").onclick = function () { open("cart"); };
        var acc = $("accBtn");
        if (acc) acc.onclick = function () { open("account"); };
        $("drClose").onclick = close;
        $("scrim").onclick = function () { closeSide(); close(); };
        document.addEventListener("keydown", function (e) {
            if (e.key !== "Escape") return;
            var sd = $("sideDrawer");
            if (sd && sd.classList.contains("on")) { closeSide(); return; }
            if (isOpen() && !isDocked()) close();
        });
        $("drBody").addEventListener("click", clickQty);

        initToTop();
        foldControls();
        matchMedia("(max-width:700px)").addEventListener("change", foldControls);

        // Узбекский словарь названий должен приехать до первой отрисовки,
        // иначе меню моргнёт русскими именами
        var ready = I18N ? I18N.ready() : Promise.resolve();

        return ready
            .then(function () { return fetch("/api/menu"); })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (d.error) throw new Error(d.error);
                MENU = d; RULES = d.rules;
                // Сервер может объявить общий тестовый режим для всех
                if (d.testMode) { GLOBAL_TEST = true; TEST = true; showTestBar(); }
                initPixel(d.pixel);
                if (I18N) I18N.apply();
                if (onReady) onReady(d);
                // Пристыкованная корзина видна сразу — рисуем её без клика
                if (isDocked()) { renderDrawer(); refreshQuote(renderDrawer); }
                else refreshQuote();
                return d;
            });
    }

    // Кнопка «наверх»: страница меню — больше 24 000 пикселей,
    // а поиск и категории живут только в шапке.
    function initToTop() {

        if ($("toTop")) return;

        var b = document.createElement("button");
        b.id = "toTop";
        b.className = "totop";
        b.type = "button";
        b.setAttribute("aria-label", t("toTop") || "Наверх");
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M12 19V5M5 12l7-7 7 7"/></svg>';
        b.onclick = function () {
            window.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" });
        };
        document.body.appendChild(b);

        var shown = false;
        function check() {
            var need = window.scrollY > window.innerHeight * 1.5;
            if (need !== shown) { shown = need; b.classList.toggle("on", need); }
        }
        window.addEventListener("scroll", check, { passive: true });
        check();
    }

    function reduceMotion() {
        try { return matchMedia("(prefers-reduced-motion:reduce)").matches; }
        catch (e) { return false; }
    }

    // На телефоне язык и тема занимали место в самом дорогом экране,
    // а пользуются ими один раз. Переносим их в бургер-панель —
    // элементы переезжают целиком, вместе с обработчиками.
    var folded = null;   // где они лежали изначально

    function foldControls() {

        var drawer = $("sideDrawer");
        var lang = document.querySelector(".lang");
        var theme = $("themeBtn");
        if (!drawer || !lang || !theme) return;

        if (!folded) {
            folded = {
                langParent: lang.parentNode, langNext: lang.nextSibling,
                themeParent: theme.parentNode, themeNext: theme.nextSibling
            };
        }

        var foot = drawer.querySelector(".sd-foot");
        if (!foot) {
            foot = document.createElement("div");
            foot.className = "sd-foot";
            drawer.appendChild(foot);
        }

        if (matchMedia("(max-width:700px)").matches) {
            if (lang.parentNode !== foot) { foot.appendChild(lang); foot.appendChild(theme); }
        } else if (lang.parentNode === foot) {
            folded.langParent.insertBefore(lang, folded.langNext);
            folded.themeParent.insertBefore(theme, folded.themeNext);
        }
    }

    // -------------------- панель разделов (бургер) --------------------

    function openSide() {
        var d = $("sideDrawer"); if (!d) return;
        d.classList.add("on");
        $("scrim").classList.add("on");
        document.body.style.overflow = "hidden";
        var b = $("burgerBtn"); if (b) b.setAttribute("aria-expanded", "true");
    }
    function closeSide() {
        var d = $("sideDrawer"); if (!d) return;
        d.classList.remove("on");
        // затемнение общее с корзиной — гасим только если корзина не открыта
        if (!isOpen() || isDocked()) $("scrim").classList.remove("on");
        if (!isOpen() || isDocked()) document.body.style.overflow = "";
        var b = $("burgerBtn"); if (b) b.setAttribute("aria-expanded", "false");
    }
    function initSide() {
        var b = $("burgerBtn");
        if (b) b.onclick = function () {
            var d = $("sideDrawer");
            if (d && d.classList.contains("on")) closeSide(); else openSide();
        };
        var c = $("sdClose"); if (c) c.onclick = closeSide;
    }

    // -------------------- язык --------------------

    function paintLangBtn() {
        var btn = $("langBtn");
        if (!btn || !I18N) return;
        var cur = I18N.info(I18N.lang());
        btn.querySelector(".flag").innerHTML = cur.flag;
        var label = btn.querySelector(".lang-name");
        if (label) label.textContent = cur.name;
        btn.setAttribute("aria-label", cur.name);
    }

    function paintLangMenu() {
        var m = $("langMenu");
        if (!m || !I18N) return;
        var cur = I18N.lang();
        m.innerHTML = I18N.langs.map(function (l) {
            return '<button class="lang-row' + (l.code === cur ? " on" : "") + '" type="button" ' +
                'data-lang="' + l.code + '"' + (l.code === cur ? ' aria-current="true"' : '') + '>' +
                '<span class="flag">' + l.flag + '</span><span>' + esc(l.name) + '</span>' +
                (l.code === cur ? '<span class="lang-ok">✓</span>' : '') + '</button>';
        }).join("");
        m.querySelectorAll("[data-lang]").forEach(function (b) {
            b.onclick = function () {
                closeLang();
                if (b.dataset.lang === I18N.lang()) return;
                // У каждого языка свой адрес — переключение это переход,
                // иначе узбекская версия жила бы на русском адресе и
                // поисковик её не видел
                var p = location.pathname.replace(/^\/uz(?=\/|$)/, "") || "/";
                location.href =
                    (b.dataset.lang === "uz" ? "/uz" + (p === "/" ? "/" : p) : p) +
                    location.search + location.hash;
            };
        });
    }

    function closeLang() {
        var m = $("langMenu");
        if (m) m.classList.remove("on");
        var btn = $("langBtn");
        if (btn) btn.setAttribute("aria-expanded", "false");
    }

    function initLang() {
        if (!I18N) return;
        var btn = $("langBtn");
        if (btn) {
            paintLangBtn();
            btn.onclick = function (e) {
                e.stopPropagation();
                var m = $("langMenu");
                paintLangMenu();
                var open = m.classList.toggle("on");
                btn.setAttribute("aria-expanded", open ? "true" : "false");
            };
            document.addEventListener("click", function (e) {
                if (!e.target.closest(".lang")) closeLang();
            });
            document.addEventListener("keydown", function (e) {
                if (e.key === "Escape") closeLang();
            });
        }
        // При смене языка перерисовываем всё, что нарисовано скриптом
        I18N.onChange(function () {
            paintLangBtn();
            paintAddrBtn();
            paintAccBtn();
            var bar = $("testBar");
            if (bar) { bar.remove(); document.body.classList.remove("has-test-bar"); showTestBar(); }
            if (isOpen()) renderDrawer();
            listeners.forEach(function (fn) { fn(); });
        });
    }

    function clickQty(e) {
        // Один клик — одно изменение. На главной этот обработчик висит
        // на всём документе, а внутри корзины ещё и на её теле: клик по
        // подсказке в корзине всплывал через оба, и товар добавлялся
        // сразу по два. Минус тоже срабатывал дважды — до единицы было
        // не дойти вовсе.
        if (e.kyotoQtyDone) return;

        var inc = e.target.closest("[data-inc]"), dec = e.target.closest("[data-dec]");
        if (!inc && !dec) return;

        e.kyotoQtyDone = true;

        if (inc) setQty(inc.dataset.inc, qtyOf(inc.dataset.inc) + 1);
        else setQty(dec.dataset.dec, qtyOf(dec.dataset.dec) - 1);
    }

    /* Низ карточки: пока товара нет — широкая кнопка «в корзину» с ценой,
       как только появился — счётчик на всю ширину. Общая функция, потому
       что главная перерисовывает низ карточек, не трогая остальное. */
    function cardFootHTML(name, price) {
        var q = qtyOf(name);
        // Цена — отдельной строкой, а не надписью на кнопке. Раньше она
        // жила внутри «купить» и после добавления пропадала совсем:
        // человек набирал корзину, не видя, почём каждое блюдо.
        var priceRow = '<div class="card-price">' + money(price) +
            ' <span>' + t("sum") + '</span></div>';
        if (!q) {
            return priceRow +
                '<button class="card-buy" data-inc="' + esc(name) + '">' +
                '<svg class="buy-ico" viewBox="0 0 24 24" aria-hidden="true">' +
                '<path d="M3 4h2.2l2.3 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.5L21 8H6.3"/>' +
                '<circle cx="10" cy="20" r="1.3"/><circle cx="17.5" cy="20" r="1.3"/></svg>' +
                '<span class="buy-txt">' + t("card.buy") + '</span></button>';
        }
        return priceRow + '<div class="card-qty">' +
            '<button data-dec="' + esc(name) + '" aria-label="−">−</button>' +
            '<span class="num">' + q + '</span>' +
            '<button data-inc="' + esc(name) + '" aria-label="+">+</button></div>';
    }

    function cardHTML(it, badgeText) {
        return '<article class="card" data-name="' + esc(it.name) + '" data-price="' + it.price + '">' +
            '<div class="card-media">' +
            (badgeText ? '<span class="badge' + (badgeText === "signature" ? ' gold' : '') + '">' +
                t(badgeText === "signature" ? "badge.signature" : "badge.hit") + '</span>'
                : (it.sold >= 15 ? '<span class="badge">' + t("badge.hit") + ' · ' + it.sold + '</span>' : '')) +
            mediaHTML(it) + '</div>' +
            '<div class="card-body"><div class="card-name">' + esc(nameOf(it.name)) + '</div>' +
            // Описание в плитке не показываем — оно живёт в подробной
            // карточке, которая открывается по клику. В сетке из 158
            // блюд текст под каждым названием только удлинял список.
            // Порция: сколько штук и сколько граммов
            '<div class="card-meta">' +
                (it.pieces ? esc(it.pieces) + (it.weight ? ' · ' : '') : '') +
                (it.weight ? it.weight + ' ' + t("unit.g") : '') +
                (!it.pieces && !it.weight ? esc(catOf(it.category)) : '') +
            '</div>' +
            '<div class="card-foot">' + cardFootHTML(it.name, it.price) + '</div>' +
            '</div></article>';
    }

    return {
        init: init, open: open, close: close,
        setQty: setQty, qtyOf: qtyOf, clickQty: clickQty,
        cardHTML: cardHTML, cardFootHTML: cardFootHTML, phHTML: phHTML, mediaHTML: mediaHTML,
        money: money, esc: esc, plural: plural,
        t: t, nameOf: nameOf,
        group: function (title) { return I18N ? I18N.group(title) : title; },
        cat: catOf,
        lang: function () { return I18N ? I18N.lang() : "ru"; },
        account: function () { open("account"); },
        openSide: openSide, closeSide: closeSide,
        isTest: function () { return TEST; },
        ev: ev,
        addresses: addresses, profile: profile, orders: orders,
        menu: function () { return MENU; },
        onChange: function (fn) { listeners.push(fn); }
    };
})();
