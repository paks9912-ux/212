/* Оркестратор: разбор → накопление слотов → подбор → риск → сценарий → ответ.
   Возвращает не только текст, но и весь разбор: что понял, что предположил,
   чего не хватает и почему принято такое решение. */
(function (w) {
  'use strict';

  var U    = w.U    || (typeof require !== 'undefined' ? require('./util.js') : null);
  var KB   = w.KB   || (typeof require !== 'undefined' ? require('./knowledge.js') : null);
  var NLU  = w.NLU  || (typeof require !== 'undefined' ? require('./nlu.js') : null);
  var PO   = w.PO   || (typeof require !== 'undefined' ? require('./policy.js') : null);
  var RISK = w.RISK || (typeof require !== 'undefined' ? require('./risk.js') : null);
  var SCEN = w.SCEN || (typeof require !== 'undefined' ? require('./scenarios.js') : null);
  var R    = w.R    || (typeof require !== 'undefined' ? require('./reply.js') : null);

  var AGENT = {};

  AGENT.newContext = function (init) {
    var c = {
      channel: (init && init.channel) || 'чат',
      turns: 0,
      guest: { name: null, phone: null, repeat: false, lang: 'ru' },
      request: { from: null, to: null, nights: null, guests: null, adults: null, children: null,
                 childAges: [], budget: null, budgetPer: null, district: null, rooms: null,
                 features: [], pets: false, needElevator: false, needParking: false,
                 needCrib: false, needWorkspace: false, quiet: false, selfCheckIn: false,
                 earlyCheckIn: false, lateCheckOut: false, lateArrival: false, repeatGuest: false },
      offers: [],
      booking: (init && init.booking) || null,
      history: [],
      unresolved: 0
    };
    return c;
  };

  /* Слоты копятся: «нас четверо» из первого сообщения работает и в пятом */
  function merge(ctx, p) {
    var r = ctx.request;
    if (p.dates.from) { r.from = p.dates.from; r.to = p.dates.to || null; }
    if (p.dates.to) r.to = p.dates.to;
    if (p.dates.nights) r.nights = p.dates.nights;
    if (r.from && !r.to && r.nights) r.to = U.addDays(r.from, r.nights);
    if (r.from && r.to) r.nights = U.diffDays(r.from, r.to);

    if (p.guests.total) { r.guests = p.guests.total; r.adults = p.guests.adults; r.children = p.guests.children; }
    if (p.guests.childAges.length) r.childAges = p.guests.childAges;
    if (p.budget.amount) { r.budget = p.budget.amount; r.budgetPer = p.budget.per; }
    if (p.prefs.district) r.district = p.prefs.district;
    if (p.prefs.rooms !== null) r.rooms = p.prefs.rooms;
    if (p.prefs.features.length) r.features = U.uniq(r.features.concat(p.prefs.features));
    ['needElevator', 'needParking', 'needCrib', 'needWorkspace', 'quiet'].forEach(function (k) {
      if (p.prefs[k]) r[k] = true;
    });
    if (p.prefs.accessible) r.accessible = true;
    if (p.signals.pets) r.pets = true;
    if (p.signals.earlyCheckIn) r.earlyCheckIn = true;
    if (p.signals.lateCheckOut) r.lateCheckOut = true;
    if (p.signals.lateArrival) r.lateArrival = true;
    if (p.signals.selfCheckIn) r.selfCheckIn = true;
    if (p.signals.repeat) { r.repeatGuest = true; ctx.guest.repeat = true; }
    if (p.contacts.phone) ctx.guest.phone = p.contacts.phone;
    if (p.contacts.name) ctx.guest.name = p.contacts.name;
    ctx.guest.lang = p.lang;
    return r;
  }

  /* Чего не хватает и как об этом спросить */
  function gaps(a) {
    var r = a.req, missing = [], questions = [];
    if (!r.from) { missing.push('даты'); questions.push('На какие даты? Например: «с 12 по 15 ноября».'); }
    else if (!r.to) { missing.push('срок'); questions.push('Сколько ночей — с ' + U.fmt(r.from) + ' по какое число?'); }
    if (!r.guests) { missing.push('гости'); questions.push('Сколько гостей, есть ли дети?'); }
    else if (r.children && !r.childAges.length) { missing.push('возраст детей'); questions.push('Сколько лет ребёнку — нужна ли кроватка?'); }
    if (r.guests && r.from && r.to && !r.budget && !a.signals.book) {
      questions.push('Есть бюджет за ночь, чтобы не показывать лишнее?');
    }
    if (a.selected && !a.ctx.guest.phone) { missing.push('контакты'); questions.push('Оставьте телефон и ФИО — закреплю бронь.'); }
    return { missing: missing, questions: questions };
  }

  /* Выбор варианта из прошлого сообщения: «беру второй», «давайте лофт» */
  function selection(ctx, p) {
    if (!ctx.offers.length) return null;
    var t = p.norm;
    if (/(^|[^а-я])(перв|перв|1-?й|1\))/.test(t)) return ctx.offers[0];
    if (/(^|[^а-я])(втор|2-?й|2\))/.test(t)) return ctx.offers[1] || null;
    if (/(^|[^а-я])(трет|3-?й|3\))/.test(t)) return ctx.offers[2] || null;
    for (var i = 0; i < ctx.offers.length; i++) {
      var title = U.norm(ctx.offers[i].object.title);
      var words = title.split(' ').filter(function (x) { return x.length > 4; });
      for (var j = 0; j < words.length; j++) {
        if (t.indexOf(words[j].slice(0, 6)) >= 0) return ctx.offers[i];
      }
    }
    if (p.signals.book && ctx.offers.length === 1) return ctx.offers[0];
    if (/(^|[^а-я])(беру|берем|подходит|оформля|давайте|согласен|согласна)/.test(t) && ctx.offers.length) return ctx.offers[0];
    /* «да», «ок», «давай» сразу после вариантов — это согласие на первый */
    if (t.length <= 14 && /^(да|ок|окей|ok|хорошо|ага|угу|давай|годится|\+)/.test(t)) return ctx.offers[0];
    return null;
  }

  function intents(a) {
    var s = a.signals, list = [];
    function add(id, score) { list.push({ id: id, score: score }); }
    if (a.req.from && a.req.guests) add('бронирование', 90);
    else if (s.availability || s.book) add('бронирование', 60);
    if (s.price || a.budget.amount) add('цена', 55);
    if (s.cancel) add('отмена', 85);
    if (s.changeDates) add('перенос', 85);
    if (s.extend) add('продление', 85);
    if (s.complaint || s.damage || s.keys) add('проблема у гостя', 95);
    if (s.invoice) add('документы для юрлица', 70);
    if (s.registration) add('регистрация', 65);
    if (s.party || s.hourly || s.illegal || s.sublease) add('нежелательное использование', 95);
    if (s.fraud) add('подозрительный платёж', 99);
    if (s.human) add('нужен человек', 80);
    if (!list.length) add('вопрос', 30);
    list.sort(function (x, y) { return y.score - x.score; });
    return list;
  }

  function confidence(a) {
    var c = 0.4;
    if (a.req.from) c += 0.2;
    if (a.req.to) c += 0.1;
    if (a.req.guests) c += 0.15;
    if (a.dates.assumed.length) c -= 0.1;
    if (a.dates.issues.length) c -= 0.15;
    if (a.scenario === 'fallback') c = 0.25;
    if (a.signals._matched.length === 0 && !a.req.from) c -= 0.1;
    return Math.round(U.clamp(c, 0.1, 0.99) * 100) / 100;
  }

  AGENT.analyze = function (text, ctx) {
    ctx = ctx || AGENT.newContext();
    var p = NLU.parse(text);
    var req = merge(ctx, p);

    var a = {
      raw: p.raw, norm: p.norm, lang: p.lang, empty: p.empty, length: p.length,
      dates: { from: req.from, to: req.to, nights: req.nights,
               flexible: p.dates.flexible, assumed: p.dates.assumed, issues: p.dates.issues,
               source: p.dates.source, monthHint: p.dates.monthHint || null, hourly: !!p.dates.hourly },
      guests: { total: req.guests, adults: req.adults, children: req.children, childAges: req.childAges, stated: p.guests.stated, assumed: p.guests.assumed },
      budget: { amount: req.budget, per: req.budgetPer, currency: p.budget.currency, assumed: p.budget.assumed },
      prefs: { rooms: req.rooms, district: req.district, features: req.features,
               needElevator: req.needElevator, needParking: req.needParking, needCrib: req.needCrib,
               needWorkspace: req.needWorkspace, quiet: req.quiet, accessible: req.accessible || false },
      signals: p.signals,
      contacts: { phone: ctx.guest.phone, name: ctx.guest.name },
      purpose: p.purpose,
      req: req, ctx: ctx, turn: ctx.turns + 1
    };

    a.selected = selection(ctx, p);

    /* Что нового принесло именно это сообщение: если ничего, а варианты уже
       показаны, значит гость задал уточняющий вопрос — оффер повторять не надо */
    a.fresh = {
      dates: !!p.dates.from || !!p.dates.nights,
      guests: p.guests.stated,
      budget: !!p.budget.amount,
      pets: p.signals.pets,
      district: !!p.prefs.district,
      rooms: p.prefs.rooms !== null,
      extras: !!(p.signals.earlyCheckIn || p.signals.lateCheckOut || p.signals.lateArrival)
    };
    a.freshChanged = Object.keys(a.fresh).some(function (k) { return a.fresh[k]; });

    /* Подбор считаем, только когда есть даты и срок */
    if (req.from && req.to && req.nights > 0 && !p.dates.hourly) {
      a.matchReq = {
        from: req.from, to: req.to,
        guests: req.guests || 1,
        pets: req.pets, rooms: req.rooms, district: req.district,
        features: req.features, needElevator: req.needElevator, needParking: req.needParking,
        needCrib: req.needCrib, needWorkspace: req.needWorkspace, quiet: req.quiet,
        selfCheckIn: req.selfCheckIn, budget: req.budget, budgetPer: req.budgetPer,
        earlyCheckIn: req.earlyCheckIn, lateCheckOut: req.lateCheckOut, lateArrival: req.lateArrival,
        repeatGuest: req.repeatGuest
      };
      a.match = PO.match(a.matchReq);
      a.quoteTotal = a.match.offers.length ? a.match.offers[0].quote.total : null;
    } else {
      a.match = null;
    }

    var g = gaps(a);
    a.missing = g.missing;
    a.questions = g.questions;
    a.risk = RISK.assess(a);
    a.intents = intents(a);
    return a;
  };

  AGENT.respond = function (text, ctx) {
    ctx = ctx || AGENT.newContext();
    var a = AGENT.analyze(text, ctx);

    var candidates = [];
    var chosen = null, out = null;
    for (var i = 0; i < SCEN.list.length; i++) {
      var sc = SCEN.list[i], hit = false;
      try { hit = !!sc.when(a); } catch (e) { hit = false; }
      if (hit) {
        candidates.push({ id: sc.id, title: sc.title, group: sc.group });
        if (!chosen) { chosen = sc; out = sc.build(a); }
      }
    }

    a.scenario = chosen.id;
    a.confidence = confidence(a);

    var result = {
      scenario: chosen.id,
      scenarioTitle: chosen.title,
      group: chosen.group,
      candidates: candidates,
      action: out.action,
      reason: out.reason,
      reply: out.reply,
      internal: out.internal || null,
      priority: out.priority || (a.risk.needsHuman ? 'важно' : 'обычный'),
      escalate: !!out.escalate || out.action === 'escalate' || a.risk.needsHuman,
      analysis: a,
      crm: AGENT.crm(a, out)
    };

    /* Память диалога */
    ctx.turns++;
    ctx.history.push({ in: text, out: out.reply, scenario: chosen.id, action: out.action });
    if (a.match && a.match.offers.length && /offer|hold/.test(out.action)) ctx.offers = a.match.offers.slice(0, 3);
    if (a.selected && out.action === 'hold') {
      ctx.booking = {
        objectId: a.selected.object.id, from: a.selected.quote.from, to: a.selected.quote.to,
        guests: a.selected.quote.guests, total: a.selected.quote.total, prepay: a.selected.quote.prepay,
        status: 'удержание'
      };
    }
    if (out.action === 'ask') ctx.unresolved++; else ctx.unresolved = 0;
    if (ctx.unresolved >= 3) {
      /* Третий раз спрашиваем одно и то же — это уже не диалог, зовём человека */
      result.escalate = true;
      result.action = 'handoff';
      result.reply = R.lines([
        'Кажется, по переписке мы ходим по кругу — так быстрее не станет.',
        R.human('поможет подобрать голосом за пару минут'),
        'Если удобнее здесь — напишите одной строкой: даты, сколько гостей и до какой суммы за ночь.'
      ]);
      result.crm.status = 'handoff';
      result.crm.nextStep = 'передано менеджеру';
      result.internal = (result.internal ? result.internal + ' ' : '') + 'Третий уточняющий вопрос подряд — подключить человека.';
    }
    return result;
  };

  /* Заявка в том виде, в котором её удобно класть в CRM или таблицу */
  AGENT.crm = function (a, out) {
    var r = a.req;
    return {
      createdAt: U.today(),
      channel: a.ctx.channel,
      status: out.action,
      scenario: a.scenario || null,
      guest: { name: a.contacts.name, phone: a.contacts.phone, lang: a.lang, repeat: r.repeatGuest },
      stay: {
        from: r.from, to: r.to, nights: r.nights,
        guests: r.guests, adults: r.adults, children: r.children, childAges: r.childAges,
        flexible: a.dates.flexible
      },
      needs: {
        district: r.district, rooms: r.rooms, features: r.features,
        pets: r.pets, elevator: r.needElevator, parking: r.needParking, crib: r.needCrib,
        earlyCheckIn: r.earlyCheckIn, lateCheckOut: r.lateCheckOut, lateArrival: r.lateArrival,
        registration: !!a.signals.registration, invoice: !!a.signals.invoice
      },
      budget: { amount: r.budget, per: r.budgetPer },
      purpose: a.purpose,
      offers: a.match ? a.match.offers.slice(0, 3).map(function (o) {
        return { id: o.object.id, title: o.object.title, total: o.quote.total, perNight: o.quote.perNight, prepay: o.quote.prepay };
      }) : [],
      risk: { score: a.risk.score, level: a.risk.level, flags: a.risk.flags.map(function (f) { return f.id; }) },
      missing: a.missing,
      confidence: a.confidence,
      nextStep: out.action === 'hold' ? 'получить предоплату' :
                out.action === 'offer' ? 'ждём выбор варианта' :
                out.action === 'ask' ? 'ждём ответ гостя' :
                out.action === 'escalate' ? 'передано менеджеру' :
                out.action === 'decline' ? 'отказ по правилам' : 'информирование'
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AGENT;
  w.AGENT = AGENT;
})(typeof window !== 'undefined' ? window : globalThis);
