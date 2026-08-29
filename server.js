/* =====================================================
   KYOTO — сайт + сбор аналитики + админка

   Запуск:  ADMIN_TOKEN=ваш-пароль node server.js
   Админка: http://адрес:8080/admin?key=ваш-пароль

   Зависимостей нет — только встроенные модули Node.
   Данные лежат в data/analytics/ГГГГ-ММ-ДД.jsonl, по строке на событие.
===================================================== */

const http = require("http");
const fs   = require("fs");
const path = require("path");

const PORT        = Number(process.env.SITE_PORT || 8080);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const DATA_DIR    = path.join(__dirname, "data", "analytics");

/* Ташкент — UTC+5 круглый год. Считаем сутки по местному времени,
   иначе «сегодня» на сервере в UTC начиналось бы в 5 утра. */
const TZ_OFFSET_MS = 5 * 60 * 60 * 1000;

const MAX_BODY   = 16 * 1024;   // событие больше 16 КБ — заведомо мусор
const RATE_LIMIT = 120;         // событий с одного IP в минуту

fs.mkdirSync(DATA_DIR, { recursive: true });

if (!ADMIN_TOKEN) {
    console.warn("[!] ADMIN_TOKEN не задан — админка и статистика отключены.");
    console.warn("    Запускайте так:  ADMIN_TOKEN=длинный-пароль node server.js");
}

/* ---------- вспомогательное ---------- */

function dateKey(ts) {
    return new Date(ts + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

function clientIp(req) {
    if (TRUST_PROXY) {
        const fwd = req.headers["x-forwarded-for"];
        if (fwd) return String(fwd).split(",")[0].trim();
    }
    return req.socket.remoteAddress || "?";
}

const rate = new Map();

function rateLimited(ip) {
    const now = Date.now();
    const slot = rate.get(ip);
    if (!slot || now > slot.resetAt) {
        rate.set(ip, { count: 1, resetAt: now + 60000 });
        return false;
    }
    slot.count += 1;
    return slot.count > RATE_LIMIT;
}

setInterval(() => {
    const now = Date.now();
    for (const [ip, slot] of rate) if (now > slot.resetAt) rate.delete(ip);
}, 300000).unref();

function authorized(url) {
    if (!ADMIN_TOKEN) return false;
    const key = url.searchParams.get("key") || "";
    // сравнение фиксированной длины, чтобы пароль нельзя было подобрать по времени ответа
    if (key.length !== ADMIN_TOKEN.length) return false;
    let diff = 0;
    for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ ADMIN_TOKEN.charCodeAt(i);
    return diff === 0;
}

function json(res, code, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(code, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });
    res.end(body);
}

function serveFile(res, file) {
    const types = {
        ".html": "text/html; charset=utf-8",
        ".js":   "text/javascript; charset=utf-8",
        ".css":  "text/css; charset=utf-8"
    };
    fs.readFile(path.join(__dirname, file), (err, data) => {
        if (err) { res.writeHead(404); res.end("Не найдено"); return; }
        res.writeHead(200, { "Content-Type": types[path.extname(file)] || "text/plain" });
        res.end(data);
    });
}

/* ---------- приём событий ---------- */

function readBody(req, limit) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on("data", chunk => {
            size += chunk.length;
            if (size > limit) { reject(new Error("too large")); req.destroy(); return; }
            chunks.push(chunk);
        });
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}

const ALLOWED_TYPES = new Set(["visit", "stage", "exit", "fail"]);

async function handleTrack(req, res) {
    const ip = clientIp(req);
    if (rateLimited(ip)) { res.writeHead(429); res.end(); return; }

    let event;
    try {
        event = JSON.parse(await readBody(req, MAX_BODY));
    } catch (error) {
        res.writeHead(400); res.end(); return;
    }

    if (!event || typeof event.sid !== "string" || !ALLOWED_TYPES.has(event.type)) {
        res.writeHead(400); res.end(); return;
    }

    // IP не сохраняем — он нужен только для ограничения частоты
    event.sid = event.sid.slice(0, 40);
    event.ts  = Date.now();

    const file = path.join(DATA_DIR, dateKey(event.ts) + ".jsonl");
    fs.appendFile(file, JSON.stringify(event) + "\n", () => {});

    res.writeHead(204); res.end();
}

/* ---------- разбор дня в сессии ---------- */

const STAGE_NAMES = [
    "Зашёл на сайт",
    "Дошёл до меню",
    "Положил в корзину",
    "Открыл корзину",
    "Нажал «оформить»",
    "Оформил заказ"
];

/* Почему ушёл — восстанавливаем по самому дальнему шагу.
   Это не догадка о мыслях гостя, а факт: где именно оборвался путь. */
function exitReason(session) {
    if (session.stage >= 5) return null;
    if (session.stage === 4) return "checkout_failed";
    if (session.stage === 3) return "cart_abandoned";
    if (session.stage === 2) return "added_forgot";
    if (session.stage === 1) return "menu_no_pick";
    return session.duration < 5000 ? "instant_bounce" : "never_reached_menu";
}

const REASONS = {
    checkout_failed:    { label: "Нажал «оформить» — заказ не ушёл", hint: "Техническая поломка. Каждый такой случай — потерянные деньги при готовом решении купить." },
    cart_abandoned:     { label: "Открыл корзину и передумал",       hint: "Увидел итоговую сумму или не нашёл условий доставки." },
    added_forgot:       { label: "Положил в корзину и отвлёкся",     hint: "Решение почти принято. Такие возвращаются — их и догоняет ретаргет." },
    menu_no_pick:       { label: "Посмотрел меню, ничего не выбрал", hint: "Не нашёл нужного блюда или не устроила цена." },
    never_reached_menu: { label: "Не долистал до меню",              hint: "Заставка перед меню длиной в шесть экранов. Если причина в топе — её надо укоротить." },
    instant_bounce:     { label: "Закрыл сразу (до 5 секунд)",       hint: "Не то, чего ждал по рекламе, либо сайт долго грузился." }
};

function loadSessions(date) {
    const file = path.join(DATA_DIR, date + ".jsonl");
    if (!fs.existsSync(file)) return [];

    const sessions = new Map();

    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        if (!line) continue;

        let event;
        try { event = JSON.parse(line); } catch (error) { continue; }

        let session = sessions.get(event.sid);
        if (!session) {
            session = {
                sid: event.sid, stage: 0, duration: 0, scroll: 0,
                device: null, source: null, campaign: null, creative: null,
                hour: null, cart_value: 0, cart_items: 0, cart_names: [],
                categories: [], failed: null, first: event.ts
            };
            sessions.set(event.sid, session);
        }

        if (event.type === "visit") {
            session.device   = event.device || null;
            session.source   = event.source || null;
            session.campaign = event.campaign || null;
            session.creative = event.creative || null;
            session.hour     = typeof event.hour === "number" ? event.hour : null;
        }

        if (event.type === "stage" && typeof event.stage === "number") {
            session.stage = Math.max(session.stage, Math.min(5, event.stage));
        }

        if (event.type === "fail") session.failed = event.where || "unknown";

        if (event.type === "exit") {
            session.stage      = Math.max(session.stage, Math.min(5, event.stage || 0));
            session.duration   = Math.max(session.duration, event.duration || 0);
            session.scroll     = Math.max(session.scroll, event.scroll || 0);
            session.cart_value = event.cart_value || 0;
            session.cart_items = event.cart_items || 0;
            session.cart_names = Array.isArray(event.cart_names) ? event.cart_names : [];
            session.categories = Array.isArray(event.categories) ? event.categories : [];
        }
    }

    return [...sessions.values()];
}

function buildStats(date) {
    const sessions = loadSessions(date);
    const visitors = sessions.length;
    const orders   = sessions.filter(s => s.stage >= 5).length;

    const funnel = STAGE_NAMES.map((label, i) => {
        const reached = sessions.filter(s => s.stage >= i).length;
        return {
            step: i, label, reached,
            share: visitors ? Math.round(reached / visitors * 100) : 0
        };
    });

    // на каком шаге теряем больше всего
    let worst = null;
    for (let i = 1; i < funnel.length; i++) {
        const lost = funnel[i - 1].reached - funnel[i].reached;
        if (!worst || lost > worst.lost) {
            worst = { lost, from: funnel[i - 1].label, to: funnel[i].label };
        }
    }

    const reasons = new Map();
    let lostCartValue = 0;

    for (const s of sessions) {
        const key = exitReason(s);
        if (!key) continue;
        const row = reasons.get(key) || { key, count: 0, lost_value: 0, ...REASONS[key] };
        row.count += 1;
        row.lost_value += s.cart_value || 0;
        lostCartValue += s.cart_value || 0;
        reasons.set(key, row);
    }

    function group(field) {
        const map = new Map();
        for (const s of sessions) {
            const name = s[field] || "прямой заход";
            const row = map.get(name) || { name, visits: 0, orders: 0 };
            row.visits += 1;
            if (s.stage >= 5) row.orders += 1;
            map.set(name, row);
        }
        return [...map.values()].sort((a, b) => b.visits - a.visits);
    }

    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, visits: 0, orders: 0 }));
    for (const s of sessions) {
        const h = s.hour;
        if (h === null || h < 0 || h > 23) continue;
        hours[h].visits += 1;
        if (s.stage >= 5) hours[h].orders += 1;
    }

    const abandoned = sessions
        .filter(s => s.stage < 5 && s.cart_value > 0)
        .sort((a, b) => b.cart_value - a.cart_value)
        .slice(0, 15)
        .map(s => ({
            value: s.cart_value, items: s.cart_items, names: s.cart_names,
            stage: s.stage, stage_label: STAGE_NAMES[s.stage],
            minutes: Math.round(s.duration / 60000 * 10) / 10
        }));

    const missed = sessions.filter(s => s.stage === 0);

    return {
        date, visitors, orders,
        conversion: visitors ? Math.round(orders / visitors * 1000) / 10 : 0,
        funnel, worst,
        reasons: [...reasons.values()].sort((a, b) => b.count - a.count),
        lost_cart_value: lostCartValue,
        sources: group("source"),
        devices: group("device"),
        hours,
        abandoned,
        never_scrolled: {
            count: missed.length,
            avg_scroll: missed.length
                ? Math.round(missed.reduce((sum, s) => sum + s.scroll, 0) / missed.length)
                : 0,
            avg_seconds: missed.length
                ? Math.round(missed.reduce((sum, s) => sum + s.duration, 0) / missed.length / 1000)
                : 0
        },
        failures: sessions.filter(s => s.failed).length
    };
}

function availableDates() {
    try {
        return fs.readdirSync(DATA_DIR)
            .filter(f => f.endsWith(".jsonl"))
            .map(f => f.replace(".jsonl", ""))
            .sort().reverse().slice(0, 60);
    } catch (error) { return []; }
}

/* ---------- маршруты ---------- */

const server = http.createServer(async (req, res) => {

    const url = new URL(req.url, "http://localhost");

    if (req.method === "POST" && url.pathname === "/api/track") {
        return handleTrack(req, res);
    }

    if (url.pathname === "/api/stats") {
        if (!authorized(url)) return json(res, 401, { error: "Неверный ключ доступа" });
        const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("date") || "")
            ? url.searchParams.get("date")
            : dateKey(Date.now());
        try {
            return json(res, 200, { ...buildStats(date), dates: availableDates() });
        } catch (error) {
            return json(res, 500, { error: "Не удалось прочитать данные" });
        }
    }

    if (url.pathname === "/admin") {
        if (!authorized(url)) {
            res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
            return res.end("<h1>401</h1><p>Добавьте ключ: /admin?key=ВАШ_КЛЮЧ</p>");
        }
        return serveFile(res, "admin.html");
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
        return serveFile(res, "index.html");
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Не найдено");
});

server.listen(PORT, () => {
    console.log(`KYOTO — сайт на http://localhost:${PORT}`);
    if (ADMIN_TOKEN) console.log(`Админка   http://localhost:${PORT}/admin?key=${ADMIN_TOKEN}`);
});
