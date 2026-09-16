/* Разбор сообщения гостя: даты, гости, бюджет, требования, сигналы.
   Всё, что удалось понять, попадает в слоты; всё, что не удалось —
   в missing, и агент задаёт вопрос вместо того, чтобы придумывать. */
(function (w) {
  'use strict';

  var U = w.U || (typeof require !== 'undefined' ? require('./util.js') : null);
  var KB = w.KB || (typeof require !== 'undefined' ? require('./knowledge.js') : null);

  var NLU = {};

  /* Основы короткие: гости пишут «12-14 нояб» не реже, чем «14 ноября» */
  var MONTHS = ['янв', 'фев', 'мар', 'апр', 'ма[йя]', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var MONTH_RE = '(' + MONTHS.concat(MONTHS_EN).join('|') + ')';

  var WORD_NUM = {
    'один': 1, 'одна': 1, 'одного': 1, 'одну': 1, 'пара': 2, 'пары': 2, 'пару': 2, 'два': 2, 'две': 2, 'двое': 2, 'двоем': 2, 'вдвоем': 2,
    'три': 3, 'трое': 3, 'троем': 3, 'втроем': 3, 'четыре': 4, 'четверо': 4, 'вчетвером': 4, 'пять': 5, 'пятеро': 5, 'впятером': 5,
    'шесть': 6, 'шестеро': 6, 'вшестером': 6, 'семь': 7, 'семеро': 7, 'восемь': 8, 'девять': 9, 'десять': 10
  };

  var WEEKDAYS = { 'воскресен': 0, 'понедельник': 1, 'вторник': 2, 'сред': 3, 'четверг': 4, 'пятниц': 5, 'суббот': 6 };

  function num(token) {
    if (token === undefined || token === null) return null;
    token = String(token).trim();
    if (/^\d+$/.test(token)) return parseInt(token, 10);
    for (var k in WORD_NUM) if (token.indexOf(k) === 0) return WORD_NUM[k];
    return null;
  }

  var NUM_RE = '(\\d{1,2}|' + Object.keys(WORD_NUM).join('|') + ')';

  /* ---------- даты ---------- */

  function monthIndex(stem) {
    var i;
    for (i = 0; i < MONTHS.length; i++) if (new RegExp('^' + MONTHS[i]).test(stem)) return i + 1;
    for (i = 0; i < MONTHS_EN.length; i++) if (stem.indexOf(MONTHS_EN[i]) === 0) return i + 1;
    return null;
  }

  /* Ставит год так, чтобы дата не оказалась в прошлом */
  function resolve(day, month, year) {
    var today = U.today(), y = year;
    if (y && y < 100) y += 2000;
    if (!y) {
      y = +today.slice(0, 4);
      var iso = U.make(y, month, day);
      if (U.diffDays(today, iso) < -2) y++;
    }
    var out = U.make(y, month, day);
    return U.valid(out) ? out : null;
  }

  /* Все точки-даты в тексте: 12.03, 3 марта, «5 числа» */
  function points(t) {
    var out = [], m, re;

    re = /(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?/g;
    while ((m = re.exec(t))) {
      var iso = resolve(+m[1], +m[2], m[3] ? +m[3] : null);
      if (iso) out.push({ iso: iso, idx: m.index, exact: true });
    }

    re = new RegExp('(\\d{1,2})\\s*(?:-?(?:го|е|ое|ым)\\s*)?' + MONTH_RE + '[а-я]*(?:\\s*(\\d{4}))?', 'g');
    while ((m = re.exec(t))) {
      var mi = monthIndex(m[2]);
      var iso2 = mi ? resolve(+m[1], mi, m[3] ? +m[3] : null) : null;
      if (iso2) out.push({ iso: iso2, idx: m.index, exact: true, withMonth: true });
    }

    /* «с 5 числа», «по 9 число» — месяц берём текущий или следующий */
    re = /(\d{1,2})\s*(?:-?(?:го)?\s*)?числ/g;
    while ((m = re.exec(t))) {
      var today = U.today(), d = +m[1];
      var cand = U.make(+today.slice(0, 4), +today.slice(5, 7), Math.min(d, 28));
      if (U.diffDays(today, cand) < 0) cand = U.addMonths(cand, 1);
      out.push({ iso: cand, idx: m.index, exact: false, approx: true });
    }

    out.sort(function (a, b) { return a.idx - b.idx; });
    return U.uniq(out);
  }

  /* «с 3 по 7 марта» — у левой границы месяца нет, берём у правой */
  function pairedRange(t) {
    var re = new RegExp('(?:^|[^\\d])(?:с|со)?\\s*(\\d{1,2})\\s*(?:' + MONTH_RE + '[а-я]*)?\\s*(?:по|до|-|–|—)\\s*(\\d{1,2})\\s*' + MONTH_RE + '?[а-я]*\\s*(?:(\\d{4})\\s*(?:год|г)?)?', 'i');
    var m = re.exec(t);
    if (!m) return null;
    var d1 = +m[1], m1 = m[2] ? monthIndex(m[2]) : null;
    var d2 = +m[3], m2 = m[4] ? monthIndex(m[4]) : null;
    if (!m1 && !m2) {
      /* «с 10 по 12», «на 10-12» — месяц не назван, берём ближайший подходящий */
      if (d1 < 1 || d1 > 31 || d2 < 1 || d2 > 31) return null;
      if (/[.\/]/.test(m[0])) return null;                      // «12.03 - 15.03» разберут points()
      if (/(?:человек|гост|чел|ноч|сут|дн|лет|год|тыс|000)/.test(t.slice(m.index, m.index + 40))) return null;
      var today = U.today(), ym = +today.slice(0, 4), mm0 = +today.slice(5, 7);
      var f = U.make(ym, mm0, Math.min(d1, 28));
      if (U.diffDays(today, f) < 0) { f = U.addMonths(f, 1); mm0 = +f.slice(5, 7); ym = +f.slice(0, 4); }
      var t2 = U.make(ym, mm0, Math.min(d2, 28));
      if (t2 <= f) t2 = U.addMonths(t2, 1);
      return { from: f, to: t2, vague: true };
    }
    if (!m1) m1 = (d1 > d2 && m2 > 1) ? m2 - 1 : m2;   // «с 30 по 2 апреля» → март
    if (!m2) m2 = (d2 < d1) ? (m1 % 12) + 1 : m1;
    var year = m[5] ? +m[5] : null;
    var from = resolve(d1, m1, year), to = resolve(d2, m2, year);
    if (year && from && U.diffDays(U.today(), from) < 0) return { from: from, to: to, past: true };
    if (!from || !to) return null;
    if (to <= from) {
      if (m[4]) return { from: from, to: to, invalid: true };   // месяц назван явно — это опечатка гостя
      to = U.addMonths(to, 1);                                  // «с 30 по 2» — следующий месяц
    }
    return { from: from, to: to };
  }

  function duration(t) {
    var m;
    m = new RegExp('(?:на|ещ?е на|продлить на)\\s*' + NUM_RE + '?\\s*(?:календарн[а-яa-z]*\\s*)?(ноч|сут|дн[еяю]|день|дней)').exec(t);
    if (m) return { nights: num(m[1]) || 1, unit: /ноч|сут/.test(m[2]) ? 'night' : 'day' };
    m = new RegExp('(?:на|ещ?е на)\\s*' + NUM_RE + '?\\s*недел').exec(t);
    if (m) return { nights: 7 * (num(m[1]) || 1), unit: 'week' };
    m = new RegExp('(?:на|ещ?е на)\\s*' + NUM_RE + '?\\s*месяц').exec(t);
    if (m) return { nights: 30 * (num(m[1]) || 1), unit: 'month' };
    m = /(\d+)\s*(?:nights?|days?)/.exec(t);
    if (m) return { nights: +m[1], unit: 'night' };
    if (/на пару (дней|суток|ноч)/.test(t)) return { nights: 2, unit: 'night' };
    if (/на выходн/.test(t)) return { nights: 2, unit: 'weekend' };
    if (/переночевать|одну ночь|на ночь\b|на ночевку/.test(t)) return { nights: 1, unit: 'night' };
    return null;
  }

  function relative(t) {
    var today = U.today();
    if (/послезавтра/.test(t)) return { from: U.addDays(today, 2), why: 'послезавтра' };
    if (/завтра/.test(t)) return { from: U.addDays(today, 1), why: 'завтра' };
    if (/сегодня|сейчас|прямо сейчас|срочно|через час|уже в городе|вечером|ночью/.test(t)) return { from: today, why: 'сегодня' };
    for (var k in WEEKDAYS) {
      if (new RegExp('(?:с|со|в|во|на)\\s*' + k).test(t)) {
        var target = WEEKDAYS[k], cur = U.dow(today), add = (target - cur + 7) % 7;
        if (add === 0) add = 7;
        return { from: U.addDays(today, add), why: 'ближайш' + (target === 0 ? 'ее воскресенье' : 'ий день недели') };
      }
    }
    if (/новы[йм] год|нг\b|31 декабр/.test(t)) {
      var y = +today.slice(0, 4);
      var ny = U.make(y, 12, 30);
      if (U.diffDays(today, ny) < 0) ny = U.make(y + 1, 12, 30);
      return { from: ny, to: U.addDays(ny, 4), why: 'новогодние даты', assumed: true };
    }
    if (/на выходн/.test(t)) {
      var cur2 = U.dow(today), add2 = (5 - cur2 + 7) % 7;
      if (add2 === 0) add2 = 7;
      var fri = U.addDays(today, add2);
      return { from: fri, to: U.addDays(fri, 2), why: 'ближайшие выходные', assumed: true };
    }
    var mm = new RegExp('(?:в|на)\\s*(начал|серед|конц)[а-яa-z]*\\s*' + MONTH_RE).exec(t);
    if (mm) {
      var mi = monthIndex(mm[2]);
      var day = mm[1] === 'начал' ? 5 : (mm[1] === 'серед' ? 15 : 25);
      return { from: resolve(day, mi, null), why: 'примерно ' + mm[1] + 'о месяца', vague: true };
    }
    var m3 = new RegExp('(?:^|\\s)(?:в|на)\\s*' + MONTH_RE + '[а-я]*').exec(t);
    if (m3) {
      var mi3 = monthIndex(m3[1]);
      return { from: resolve(1, mi3, null), why: 'месяц назван без чисел', vague: true };
    }
    return null;
  }

  function parseDates(t) {
    var d = { from: null, to: null, nights: null, flexible: false, assumed: [], issues: [], source: null };
    var dur = duration(t);
    var pr = pairedRange(t);
    var pts = points(t);
    var rel = relative(t);

    if (pr) {
      d.from = pr.from; d.to = pr.to; d.source = 'диапазон с датами';
      if (pr.invalid) { d.issues.push('выезд не позже заезда'); d.to = null; }
      if (pr.past) d.issues.push('дата заезда уже прошла');
      if (pr.vague) d.assumed.push('месяц не назван — взяли ближайший, подтвердите');
    } else if (pts.length >= 2 && /\b(с|со)\b|по|до|-|–/.test(t)) {
      d.from = pts[0].iso; d.to = pts[1].iso; d.source = 'две даты в тексте';
      if (d.to <= d.from) { d.to = null; d.issues.push('вторая дата не позже первой'); }
    } else if (pts.length === 1) {
      d.from = pts[0].iso; d.source = 'одна дата в тексте';
      if (pts[0].approx) d.assumed.push('число без месяца — взяли ближайшее');
    } else if (rel) {
      d.from = rel.from; d.to = rel.to || null;
      d.source = rel.why;
      if (rel.assumed) d.assumed.push('даты «' + rel.why + '» — нужно подтвердить');
      if (rel.vague) { d.flexible = true; d.from = null; d.monthHint = rel.from; d.assumed.push(rel.why); }
    }

    if (dur && !d.to && d.from) {
      d.to = U.addDays(d.from, dur.nights);
      if (dur.unit === 'day') d.assumed.push('«дни» посчитали как ночи');
      d.source = (d.source || '') + ' + срок';
    }
    if (dur && !d.from && !d.to) { d.nights = dur.nights; d.flexible = true; }
    if (d.from && d.to) d.nights = U.diffDays(d.from, d.to);
    else if (dur) d.nights = dur.nights;

    if (d.from && U.diffDays(U.today(), d.from) < 0) d.issues.push('дата заезда уже прошла');
    if (d.from && KB && KB.settings.bookingHorizonDays &&
        U.diffDays(U.today(), d.from) > KB.settings.bookingHorizonDays) {
      d.issues.push('до этой даты календарь ещё не открыт');
    }
    if (d.nights !== null && d.nights <= 0) d.issues.push('выезд не позже заезда');
    if (d.nights > 180) d.issues.push('срок больше полугода — это уже долгосрочная аренда');
    if (/гибк|любые даты|плюс-минус|примерно|ориентировочно|пока не точно/.test(t)) d.flexible = true;
    return d;
  }

  /* ---------- гости ---------- */

  function parseGuests(t) {
    var g = { adults: null, children: null, childAges: [], total: null, stated: false, assumed: [] };
    var m;

    m = new RegExp(NUM_RE + '\\s*(?:взросл[а-яa-z]*)').exec(t);
    if (m) { g.adults = num(m[1]); g.stated = true; }

    m = new RegExp(NUM_RE + '\\s*(?:дет[а-яa-z]*|ребен[а-яa-z]*|реб\\b|малыш[а-яa-z]*)').exec(t);
    if (m) { g.children = num(m[1]); g.stated = true; }
    else if (/с ребенком|с малышом|с дочк|с сыном|с грудничком|с младенцем/.test(t)) { g.children = 1; g.stated = true; }
    else if (/с детьми/.test(t)) { g.children = 2; g.stated = true; g.assumed.push('«с детьми» — считаем, что двое'); }

    var age = /(?:ребен[а-яa-z]*|дочк[а-яa-z]*|сын[а-яa-z]*|малыш[а-яa-z]*|ем[уy])\D{0,12}?(\d{1,2})\s*(год|года|лет|месяц|мес)/.exec(t) ||
              /(\d{1,2})\s*(год|года|лет|месяц|мес)\D{0,12}?(?:ребен|дочк|сын|малыш)/.exec(t);
    if (age) g.childAges.push(/мес/.test(age[2]) ? 0 : +age[1]);
    if (/грудничк|младенц|новорожден/.test(t)) g.childAges.push(0);

    var notDate = '(?!\\s*(?:' + MONTHS.join('|') + '|числ|\\.|/|:|ноч|сут|дн|недел|месяц))';
    m = new RegExp('(?:нас|приедем|будем|будет|заселя[а-яa-z]*|размест[а-яa-z]*)\\s*(?:всего\\s*)?' + NUM_RE + notDate).exec(t);
    if (m) { g.total = num(m[1]); g.stated = true; }
    if (g.total === null) {
      m = new RegExp(NUM_RE + '\\s*(?:человек[а-яa-z]*|чел\\b|гост[а-яa-z]*|персон[а-яa-z]*|мужчин[а-яa-z]*|женщин[а-яa-z]*|студент[а-яa-z]*|парн[а-яa-z]*|девуш[а-яa-z]*|друз[а-яa-z]*|коллег[а-яa-z]*|сотрудник[а-яa-z]*)').exec(t);
      if (m) { g.total = num(m[1]); g.stated = true; }
    }
    if (g.total === null) {
      m = /(?:for|we are|party of)\s*(\d+)|(\d+)\s*(?:guests?|people|persons?|adults?|pax)/.exec(t);
      if (m) { g.total = +(m[1] || m[2]); g.stated = true; }
    }
    if (g.total === null) {
      m = /семь[яи] из (\d+)/.exec(t);
      if (m) { g.total = +m[1]; g.stated = true; }
    }
    if (g.total === null) {
      if (/вдвоем|с женой|с мужем|с девушкой|с парнем|с супруг|с подругой|с другом/.test(t)) { g.total = 2; g.stated = true; }
      else if (/втроем/.test(t)) { g.total = 3; g.stated = true; }
      else if (/вчетвером/.test(t)) { g.total = 4; g.stated = true; }
      else if (/впятером/.test(t)) { g.total = 5; g.stated = true; }
      else if (/(^|[^а-я])(один|одна|сам|соло)([^а-я]|$)|для себя|только я/.test(t)) { g.total = 1; g.stated = true; }
    }

    if (g.children === null && g.childAges.length) g.children = g.childAges.length;
    if (/(?:^|[\s,]|и )ребен(?:ок|ка|очек)/.test(t) && !g.children) { g.children = 1; g.stated = true; }
    if (g.adults !== null && g.children) {          // «двое взрослых и ребёнок» — сумма важнее «нас двое»
      var sum = g.adults + g.children;
      if (g.total === null || g.total < sum) g.total = sum;
    }
    if (g.total === null && (g.adults || g.children)) g.total = (g.adults || 0) + (g.children || 0);
    if (g.total !== null && g.adults === null) g.adults = Math.max(0, g.total - (g.children || 0));
    if (g.total !== null && g.children === null) g.children = 0;
    if (g.total > 20) g.total = null;                  // явно не про гостей
    return g;
  }

  /* ---------- бюджет ---------- */

  function parseBudget(t) {
    var b = { amount: null, per: null, currency: null, assumed: [] };
    var m = new RegExp('(?:до|не (?:более|дороже|больше)|бюджет[а-яa-z]*|в пределах|максимум|макс(?![а-яa-z])|около|порядка|за)\\s*(\\d[\\d\\s]{0,11})\\s*(к(?![а-яa-z])|тыс[а-яa-z]*|млн|000)?\\s*(сум[а-яa-z]*|сом[а-яa-z]*|руб[а-яa-z]*|\\$|долл[а-яa-z]*|usd|у\\.?е\\.?)?').exec(t);
    if (!m) m = /(\$\s?\d[\d\s]{0,6}|\d[\d\s]{0,6}\s?\$)/.exec(t);
    if (!m) return b;

    /* «до 3 января», «до 12 числа», «до 5 ночей» — это срок, а не деньги */
    var tail = t.slice((m.index || 0) + m[0].length, (m.index || 0) + m[0].length + 12);
    if (new RegExp('^\\s*(?:' + MONTHS.concat(MONTHS_EN).join('|') + '|числ|ноч|сут|дн|человек|гост|лет)').test(tail)) return b;

    var raw = (m[1] || m[0]).replace(/[^\d]/g, '');
    if (!raw) return b;
    var amount = parseInt(raw, 10);
    var mult = m[2] || '';
    if (/^к|тыс/.test(mult)) amount *= 1000;
    if (/млн/.test(mult)) amount *= 1000000;

    var cur = (m[3] || m[0] || '').toString();
    if (/\$|долл|usd|у\.?е/.test(cur)) { b.currency = 'USD'; b.assumed.push('бюджет в долларах, пересчитаем по курсу'); }
    else if (/сом/.test(cur)) b.currency = 'KGS';
    else if (/руб/.test(cur)) b.currency = 'RUB';
    else b.currency = 'UZS';

    /* Без валюты и без «тысяч/к/млн» маленькое число — это не бюджет, а что-то другое */
    if (!m[3] && !mult && amount < 1000) return { amount: null, per: null, currency: null, assumed: [] };
    if (b.currency === 'UZS' && amount < 1000) { amount *= 1000; b.assumed.push('сумму меньше тысячи прочитали как тысячи'); }
    b.amount = amount;

    if (/(за|в)\s*(ночь|сутк|день)|ночь|сутк/.test(t)) b.per = 'night';
    else if (/за вс[её]|всего|на весь срок|итого/.test(t)) b.per = 'total';
    else { b.per = 'night'; b.assumed.push('считаем, что бюджет за ночь'); }
    return b;
  }

  /* ---------- требования и предпочтения ---------- */

  function parsePrefs(t) {
    var p = { rooms: null, district: null, features: [], needElevator: false, needParking: false, needCrib: false, needWorkspace: false, quiet: false };
    var m = /(\d)\s*-?\s*комн/.exec(t);
    if (m) p.rooms = +m[1];
    else if (/студи/.test(t)) p.rooms = 0;
    else if (/однушк|одноком/.test(t)) p.rooms = 1;
    else if (/двушк|двухком/.test(t)) p.rooms = 2;
    else if (/трешк|трехком/.test(t)) p.rooms = 3;

    var districts = [
      ['центр', /центр|амира темура|мустакиллик|сквер/],
      ['юнусабад', /юнусабад/],
      ['мирабад', /мирабад|ойбек|ташкент-сити|ташкент сити/],
      ['чиланзар', /чиланзар|новза/],
      ['сергели', /сергели/],
      ['вокзал', /вокзал/],
      ['аэропорт', /аэропорт/]
    ];
    districts.forEach(function (d) { if (!p.district && d[1].test(t)) p.district = d[0]; });

    if (/лифт/.test(t)) p.needElevator = true;
    if (/коляск|инвалид|не могу по лестниц|ходунк|костыл/.test(t)) { p.needElevator = true; p.accessible = true; }
    if (/парковк|машин|авто\b|на машине/.test(t)) p.needParking = true;
    if (/кроватк|манеж|стульчик для кормлен/.test(t)) p.needCrib = true;
    if (/рабоч[а-яa-z]* мест|поработать|ноутбук|созвон|зум|zoom/.test(t)) p.needWorkspace = true;
    if (/тих|без шума|выспаться/.test(t)) p.quiet = true;

    [['wi-fi', /wi-?fi|вайфай|интернет/], ['стиральная машина', /стиральн|постирать/],
     ['посудомойка', /посудомой/], ['кондиционер', /кондиционер|сплит|жарко/],
     ['две ванные', /две ванн|два санузл/], ['проектор', /проектор/],
     ['балкон', /балкон/], ['вид', /вид из окна|панорам|вид на/]].forEach(function (f) {
      if (f[1].test(t)) p.features.push(f[0]);
    });
    return p;
  }

  /* ---------- сигналы: что именно человек просит и о чём предупреждает ---------- */

  var SIGNALS = {
    greeting:       /^(здравств[а-яa-z]*|добрый (день|вечер|утро)|привет[а-яa-z]*|салам[а-яa-z]*|ассалом[а-яa-z]*|assalom[а-яa-z]*|hi|hello)[\s!,.)]*$/,
    price:          /цен[аыу]|сколько стоит|стоимость|почем|тариф|прайс|за сутки сколько|сколько за ночь/,
    otherDates:     /на другие даты|другие даты|а когда (?:свободно|есть|будет)|когда освобод|ближайш\w* свободн|любые даты подойдут/,
    availability:   /свободн|есть ли|наличие|доступн|занят|остал(о|и)сь|можно ли заселиться|есть что-нибудь/,
    book:           /заброн[а-яa-z]*|бронь|забронируй|беру|берем|оформ[а-яa-z]*|подтвержд[а-яa-z]*|давайте|согласен|согласна|хочу эту|подходит/,
    photos:         /фото|фотк|снимк|видео|как выглядит|посмотреть квартиру/,
    address:        /адрес|где находится|как добраться|геолокац|локац|куда ехать|точка на карте/,
    checkinTime:    /во сколько (?:заезд|выезд|заселение)|время заезда|время выезда|когда можно заселиться|до скольки выезд/,
    earlyCheckIn:   /можно (?:ли )?(?:заехать )?(?:по)?раньше|заезд пораньше|ранн[а-яa-z]* заезд|заехать раньше|заселиться в \d{1,2}[:.]?\d{0,2}\s*(утра)?|заезд в \d{1,2}\s*утра|приедем утром|прилет утром/,
    lateCheckOut:   /попозже (?:выехать|съехать)|выехать попозже|поздн[а-яa-z]* выезд|выехать позже|выезд в \d{1,2}|попозже съехать|вылет вечером/,
    lateArrival:    /приед[а-я]* (?:в|около) 2[0-3][:.]\d{2}|заезд в 2[0-3][:.]\d{2}|в 23[:.]\d{2}|в 00[:.]\d{2}|поздно вечером|поздно приедем|ночью приедем|заезд ночью|в 2 ночи|в 3 ночи|поезд ночью|рейс ночью|прилет в \d{1,2} ночи/,
    extend:         /продлить|продлеваем|остаться ещ?е|еще на [\dа-я]+ ?(ноч|сут|дн)/,
    changeDates:    /перенес|сдвин|на неделю (?:позже|раньше)|поменять даты|изменить даты|другие даты вместо/,
    cancel:         /отмен[а-яa-z]*|не приедем|отказыва[а-яa-z]*|верните деньги|возврат/,
    discount:       /скидк|дешевл|подешевле|уступ|торг|последняя цена|а меньше|сделайте|снизьте|акци/,
    pets:           /(?:^|[^а-я])кот[аыуо]?м?(?:[^а-я]|$)|кошк|собак|животн|питомц|щенк|котенк|померан|хорьк|попуга/,
    smoking:        /курить|курящ|сигарет|вейп|кальян/,
    party:          /вечеринк|отметить|отмечать|днюх|день рожден|тусов|караоке|банкет|гуля[а-яa-z]*|шумн|компани[яей] друзей|мальчишник|девичник|выпить|алкогол|музык[а-яa-z]* погромче/,
    hourly:         /на час\b|на пару часов|почасов|на \d{1,2} часа|на 2-3 часа|дневной отдых|на несколько часов/,
    docsNo:         /без паспорт|без документ|без регистрац|не хочу светить|не даю паспорт|анонимн/,
    registration:   /регистрац|прописк|миграционн|учет|виза|для мвд|справк[а-яa-z]* о прожив/,
    fakeReg:        /только для прописк|жить не буду|фиктивн|прописаться без прожив|нужна прописка на год/,
    invoice:        /документ[а-я]* (?:для|от) (?:компани|фирм|бухгалтер|организац)|для отчетност|счет|счет-фактур|безнал|договор|акт выполненных|командиров[а-яa-z]*|юрлиц|ооо|компани[яи] оплат|отчетн[а-яa-z]* документ|закрывающ/,
    longStay:       /на месяц|на полгода|длительн|долгосрочн|на год|помесячн/,
    group:          /групп|командой|делегац|нас много|несколько квартир|две квартиры|автобус|свадьб/,
    transfer:       /встретить|трансфер|такси от аэропорт|заберите нас|подать машину/,
    selfCheckIn:    /самозаселен|ключи без встречи|сейф-бокс|кодовый замок|бескон[а-яa-z]* заселен/,
    complaint:      /конде[йи]|не морозит|не холодит|не греет|перестал работать|воня|накурено|курят соседи|духота|сверл|шумят|не дают спать|не работает|сломал|не включается|нет воды|нет света|холодно|жарко|грязн|не убрано|запах|шум[а-яa-z]* соседи|тараканы|клопы|не могу попасть|не открывается дверь|плохо пахнет/,
    damage:         /разбил|сломал|залил|затопил|испортил|пятно|порвал/,
    keys:           /не могу (?:открыть|зайти)|код не подход|стою (?:на улице|у двери|под дверью)|потерял ключ|захлопнул|ключи внутри|не могу открыть замок|забыл ключ/,
    paid:           /оплатил|оплатила|перевел(?:а)?(?! лишн)|перечислил|отправил[а]? деньги|скинул[а]? (?:деньги|оплату|чек|скрин)|кинул[а]? на карт|оплата прошла|деньги ушли|чек скинул/,
    thanks:         /спасибо|благодар|мерси|рахмат|thank/,
    later:          /подума|посовет|обсужу|напишу позже|напишу потом|дам знать|определ[ию]мся|перезвоню|вернусь к вам/,
    installment:    /рассрочк|частями|половину (?:сейчас|сразу)|по частям|двумя платежами|разбить оплату/,
    payment:        /номер карты|реквизит|как оплатить|оплата|перевод|карта|наличк|наличными|click|payme|humo|uzcard|реквизит/,
    prepayNo:       /без предоплат|оплачу на месте|предоплату не делаю|сначала посмотрю|не буду платить заранее/,
    fraud:          /карт[уые] (?:вашего|вашей|директора|хозяина|владельца|сотрудник)|переведу туда|на личную карту|переведи на друг[а-яa-z]* карт|карта не моя|оплатит друг|я вышлю чек|скрин оплаты|верните излишек|ошибочно перевел|перевел лишн|лишн[а-яё]* (?:перевод|сумм|деньг)|верн(?:ите|уть) (?:на )?(?:друг|иную|мою) |на другую карту|на другой счет|отправьте на мою карту|пришлите фото вашего паспорта|дайте данные карты|3d-код|смс-код|код из смс/,
    sublease:       /пересда(?:ть|вать|м|ю)|субаренд|буду селить|сдавать дальше|для своих гостей|под посуточную|оформлю на себя и сдам/,
    illegal:        /интим|досуг|девочк[а-яa-z]* по вызову|эскорт|для встреч на час|18\+ съемк|порн|для съемок для взрослых|закладк|вещества/,
    storage:        /склад|хранить товар|поставить коробки|сложить вещи на месяц/,
    aggression:     /хамств|вы охренел|обман[а-яa-z]*|(?:^|[^а-я])кинул[аи]? (?:меня|нас|деньги)|мошенник|в суд подам|напишу жалобу|верните немедленно|бред|дурак|идиот|позор/,
    human:          /позовите|соедините|свяжите (?:меня )?с (?:менеджер|человек)|оператор|с живым человеком|менеджер|вы бот|это бот|не бот/,
    spam:           /реклам|продвижен|сотрудничеств|seo|накрутк|инвестиц|заработок|подпишись|перейди по ссылке|http/,
    minor:          /мне 16|мне 17|нам по 16|нам по 17|школьник|несовершеннолетн/,
    repeat:         /я у вас уже|в прошлый раз|прошлый раз жил|снова к вам|постоянн[а-яa-z]* клиент|как обычно/,
    media:          /^(голосовое|войс|фото|картинка|\[фото\]|\[голосовое\])/,
    purposeBusiness:/командиров|по работе|конференц|деловая поездка|переговор|тренинг|выставк/,
    purposeMed:     /лечен|клиник|больниц|операц|обследован/,
    purposeMove:    /переезд|ищу жилье надолго|пока ищу квартиру|релокац/
  };

  function parseSignals(t) {
    var out = {}, matched = [];
    for (var k in SIGNALS) {
      if (SIGNALS[k].test(t)) { out[k] = true; matched.push(k); }
      else out[k] = false;
    }
    out._matched = matched;
    return out;
  }

  /* ---------- контакты и язык ---------- */

  function parseContacts(t, raw) {
    var c = { phone: null, name: null };
    var m = /(\+?\d[\d\s\-()]{8,15}\d)/.exec(raw || t);
    if (m) c.phone = m[1].replace(/[^\d+]/g, '');
    var n = /(?:меня зовут|это|я)\s+([А-ЯЁ][а-яё]{2,15})/.exec(raw || '');
    if (!n) n = /(?:^|\n)\s*([А-ЯЁ][а-яё]{2,15})\s*(?:,|\s+\+?\d)/.exec(raw || '');   // «Азиз, +998…»
    if (n && !/^(Здравств|Привет|Добрый|Нужна|Хочу|Можно|Есть|Спасибо|Квартир)/.test(n[1])) c.name = n[1];
    return c;
  }

  function detectLang(t, raw) {
    var lat = (raw.match(/[a-z]/gi) || []).length, cyr = (raw.match(/[а-яё]/gi) || []).length;
    if (/\b(kvartira|kerak|narx|nechchi|bormi|bor mi|salom|qancha|kun|kecha)\b/.test(t)) return 'uz';
    if (lat > cyr && lat > 4) return 'en';
    return 'ru';
  }

  /* ---------- сборка ---------- */

  NLU.parse = function (raw) {
    var t = U.norm(raw);
    var s = parseSignals(t);
    var dates = parseDates(t);
    var guests = parseGuests(t);

    /* «на 2 часа» — это не ночи, обнуляем срок, чтобы не считать цену */
    if (s.hourly) { dates.nights = dates.nights || 0; dates.hourly = true; }

    var purpose = 'unknown';
    if (s.purposeBusiness || s.invoice) purpose = 'business';
    else if (s.purposeMed) purpose = 'medical';
    else if (s.purposeMove || s.longStay) purpose = 'relocation';
    else if (s.party) purpose = 'event';
    else if (dates.nights && dates.nights <= 4 && guests.total) purpose = 'tourism';

    return {
      raw: String(raw || ''),
      norm: t,
      lang: detectLang(t, String(raw || '')),
      empty: t.length === 0,
      dates: dates,
      guests: guests,
      budget: parseBudget(t),
      prefs: parsePrefs(t),
      signals: s,
      contacts: parseContacts(t, String(raw || '')),
      purpose: purpose,
      length: t.length
    };
  };

  NLU.SIGNALS = SIGNALS;
  if (typeof module !== 'undefined' && module.exports) module.exports = NLU;
  w.NLU = NLU;
})(typeof window !== 'undefined' ? window : globalThis);
