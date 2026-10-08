/* ============================================================
   ПОДРОБНАЯ КАРТОЧКА БЛЮДА
   ============================================================
   Отдельный файл, чтобы не трогать app.js: работает только через
   публичный API K — K.menu(), K.setQty(), K.qtyOf() и помощники
   вывода. Корзина, оформление и сами карточки в каталоге остаются
   как были; здесь только показ подробностей и добавление обычным
   способом.

   Данные берём ровно те, что уже есть у блюда: фото, название,
   описание, штуки, вес, цена. Чего нет — того не показываем и
   ничего не досочиняем: описание есть у 75 блюд из 158, штуки —
   у 38, вес — у 126.
   ============================================================ */
(function () {
    "use strict";

    if (!window.KYOTO) return;
    var K = window.KYOTO;

    var current = null;   // блюдо, открытое сейчас
    var pickQty = 1;      // сколько добавить (местный выбор, не корзина)
    var lastFocus = null; // куда вернуть фокус после закрытия

    function $(id) { return document.getElementById(id); }

    function find(name) {
        var m = K.menu();
        if (!m || !m.items) return null;
        for (var i = 0; i < m.items.length; i++) {
            if (m.items[i].name === name) return m.items[i];
        }
        return null;
    }

    // -------------------- разметка --------------------

    function bodyHTML(it) {
        var esc = K.esc;

        // Порция: только то, что реально известно про это блюдо
        var portion = [];
        if (it.pieces) portion.push(esc(it.pieces));
        if (it.weight) portion.push(it.weight + " " + K.t("unit.g"));

        return '' +
            '<div class="pd-media">' + K.mediaHTML(it, "clamp(44px,12vw,64px)") + '</div>' +

            '<div class="pd-info">' +
                '<h2 class="pd-name" id="pdName">' + esc(K.nameOf(it.name)) + '</h2>' +
                '<div class="pd-cat">' + esc(K.cat(it.category)) + '</div>' +

                // Описание — строка от ресторана. Нет описания — нет и раздела.
                (it.desc
                    ? '<div class="pd-block">' +
                          '<div class="pd-h">' + K.t("pd.desc") + '</div>' +
                          '<p class="pd-text">' + esc(it.desc) + '</p>' +
                      '</div>'
                    : '') +

                (portion.length
                    ? '<div class="pd-portion">' + portion.join(" · ") + '</div>'
                    : '') +

                '<div class="pd-price">' + K.money(it.price) +
                    ' <span>' + K.t("sum") + '</span></div>' +

                '<div class="pd-foot">' +
                    '<div class="pd-qty">' +
                        '<button type="button" id="pdMinus" aria-label="−">−</button>' +
                        '<span class="num" id="pdNum">' + pickQty + '</span>' +
                        '<button type="button" id="pdPlus" aria-label="+">+</button>' +
                    '</div>' +
                    '<button class="pd-add" type="button" id="pdAdd">' +
                        K.t("pd.add") +
                    '</button>' +
                '</div>' +
            '</div>';
    }

    function ensure() {
        var scrim = $("pdScrim");
        if (scrim) return scrim;

        scrim = document.createElement("div");
        scrim.id = "pdScrim";
        scrim.className = "pd-scrim";
        scrim.innerHTML =
            '<div class="pd-modal" id="pdModal" role="dialog" aria-modal="true" ' +
                'aria-labelledby="pdName">' +
                '<button class="pd-x" type="button" id="pdClose">×</button>' +
                '<div class="pd-body" id="pdBody"></div>' +
            '</div>';
        document.body.appendChild(scrim);

        // Клик мимо окна закрывает — как у корзины
        scrim.addEventListener("click", function (e) {
            if (e.target === scrim) closeProduct();
        });
        return scrim;
    }

    // -------------------- открытие и закрытие --------------------

    function openProduct(name, from) {
        var it = find(name);
        if (!it) return;

        current = it;
        pickQty = 1;
        lastFocus = from || null;

        var scrim = ensure();
        $("pdBody").innerHTML = bodyHTML(it);

        // Клики внутри окна: количество и добавление
        $("pdMinus").onclick = function () { setPick(pickQty - 1); };
        $("pdPlus").onclick = function () { setPick(pickQty + 1); };
        $("pdAdd").onclick = addToCart;
        $("pdClose").onclick = closeProduct;

        scrim.classList.add("on");
        document.body.style.overflow = "hidden";
        document.addEventListener("keydown", onKey);

        // Фокус в окно, чтобы с клавиатуры не остаться на странице позади
        var box = $("pdModal");
        if (box) { box.setAttribute("tabindex", "-1"); box.focus(); }
    }

    function closeProduct() {
        var scrim = $("pdScrim");
        if (!scrim) return;
        scrim.classList.remove("on");
        document.body.style.overflow = "";
        document.removeEventListener("keydown", onKey);
        current = null;
        if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
        lastFocus = null;
    }

    function onKey(e) {
        if (e.key === "Escape") closeProduct();
    }

    function setPick(n) {
        pickQty = Math.max(1, Math.min(99, n));
        var el = $("pdNum");
        if (el) el.textContent = pickQty;
    }

    // Добавление идёт обычным путём: тот же setQty, что и у кнопок в
    // каталоге. Корзина, пересчёт и липкая полоса внизу работают сами.
    function addToCart() {
        if (!current) return;
        var name = current.name;
        K.setQty(name, K.qtyOf(name) + pickQty);
        closeProduct();
    }

    // -------------------- клик по карточке --------------------

    document.addEventListener("click", function (e) {
        // Кнопки внутри карточки работают как раньше: «в корзину»,
        // плюс и минус подробности не открывают.
        if (e.target.closest("[data-inc],[data-dec],a,button")) return;

        var card = e.target.closest(".card");
        if (!card || !card.dataset || !card.dataset.name) return;
        if (card.closest("#pdScrim")) return;

        openProduct(card.dataset.name, card);
    });

    // Карточка кликабельна — показываем это курсором, не трогая её вёрстку
    document.documentElement.classList.add("pd-ready");
})();
