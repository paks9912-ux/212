/* Ядро платформы: одна точка входа для любого канала.
   Канал знает только, как принять и отправить текст; всё остальное здесь. */
'use strict';

var path = require('path');
var jsDir = path.join(__dirname, '..', 'js');
['util', 'knowledge', 'holds', 'nlu', 'policy', 'reply', 'risk', 'scenarios', 'agent', 'facts']
  .forEach(function (m) { require(path.join(jsDir, m + '.js')); });

var U = global.U, KB = global.KB, AGENT = global.AGENT, HOLDS = global.HOLDS;

function Core(opts) {
  this.store = opts.store;
  this.channels = {};                     // имя → адаптер с методом send()
  this.llm = opts.llm || null;            // необязательный слой формулировки
  this.log = opts.log || function () {};
  this.onEscalation = opts.onEscalation || function () {};
  this.contexts = new Map();              // живые контексты агента по диалогам
}

/* Канал регистрирует себя: { name, send(chatId, text, options) } */
Core.prototype.channel = function (adapter) {
  this.channels[adapter.name] = adapter;
  this.log('канал подключён: ' + adapter.name);
  return this;
};

Core.prototype.context = function (dialog) {
  if (this.contexts.has(dialog.id)) return this.contexts.get(dialog.id);
  var ctx = AGENT.newContext({ channel: dialog.channel, id: dialog.id });
  if (dialog.ctx) {                        // восстановление после перезапуска
    ['turns', 'guest', 'request', 'booking', 'unresolved', 'history'].forEach(function (k) {
      if (dialog.ctx[k] !== undefined && dialog.ctx[k] !== null) ctx[k] = dialog.ctx[k];
    });
    ctx.offers = (dialog.ctx.offers || []).map(function (o) {
      var obj = KB.byId(o.id);
      return obj ? { object: obj, quote: o.quote, score: o.score, notes: o.notes || [] } : null;
    }).filter(Boolean);
  }
  this.contexts.set(dialog.id, ctx);
  return ctx;
};

Core.prototype.persistContext = function (dialog, ctx) {
  dialog.ctx = {
    turns: ctx.turns, guest: ctx.guest, request: ctx.request, booking: ctx.booking,
    unresolved: ctx.unresolved, history: ctx.history.slice(-10),
    offers: ctx.offers.map(function (o) {
      return { id: o.object.id, quote: o.quote, score: o.score, notes: o.notes };
    })
  };
  this.store.dirty.dialogs = true;
};

/* Главный вход: сообщение гостя из любого канала */
Core.prototype.incoming = function (input) {
  var self = this;
  var store = this.store;
  var dialog = store.dialog(input.channel, input.chatId, {
    lastAt: Date.now(),
    lastText: String(input.text || '').slice(0, 200)
  });
  if (input.user) {
    dialog.guest.name = dialog.guest.name || input.user.name || null;
    dialog.guest.phone = dialog.guest.phone || input.user.phone || null;
  }
  store.message(dialog.id, 'guest', input.text, { user: input.user || null });

  /* Диалог забрал менеджер — бот молчит, но всё записывает */
  if (dialog.mode === 'менеджер') {
    dialog.unread++;
    store.dirty.dialogs = true;
    store.emit('manager:needed', { dialogId: dialog.id, text: input.text });
    return Promise.resolve({ dialog: dialog, silent: true, reply: null });
  }

  var ctx = this.context(dialog);
  var res = AGENT.respond(input.text, ctx);
  this.persistContext(dialog, ctx);

  dialog.scenario = res.scenario;
  dialog.risk = res.analysis.risk.score;
  dialog.guest.lang = res.analysis.lang;
  if (res.analysis.contacts.phone) dialog.guest.phone = res.analysis.contacts.phone;
  if (res.analysis.contacts.name) dialog.guest.name = res.analysis.contacts.name;
  store.dirty.dialogs = true;

  this.syncBooking(dialog, ctx, res);

  if (res.escalate) {
    dialog.escalated = true;
    dialog.unread++;
    store.emit('escalation', {
      dialogId: dialog.id, scenario: res.scenario, risk: res.analysis.risk.score,
      reason: res.reason, note: res.internal, text: input.text
    });
    this.onEscalation(dialog, res);
  }

  if (res.action === 'ignore') return Promise.resolve({ dialog: dialog, res: res, reply: null });

  return this.phrase(input.text, res, ctx).then(function (text) {
    var saved = store.message(dialog.id, 'agent', text, { scenario: res.scenario, action: res.action });
    return self.send(dialog, text, res).then(function () {
      return { dialog: dialog, res: res, reply: text, messageId: saved.id };
    });
  });
};

/* Формулировка: движок всегда, модель — если подключена */
Core.prototype.phrase = function (text, res, ctx) {
  var self = this;
  if (!this.llm || !this.llm.ready()) return Promise.resolve(res.reply);
  var history = ctx.history.slice(-5, -1).reduce(function (acc, h) {
    acc.push({ role: 'user', text: h.in });
    if (h.out) acc.push({ role: 'assistant', text: h.out });
    return acc;
  }, []);
  return this.llm.ask(text, res, history)
    .then(function (out) {
      if (ctx.history.length) ctx.history[ctx.history.length - 1].out = out.reply;
      return out.reply;
    })
    .catch(function (e) {
      self.log('модель недоступна (' + e.message + '), отвечает движок');
      return res.reply;
    });
};

Core.prototype.send = function (dialog, text, res) {
  var adapter = this.channels[dialog.channel];
  if (!adapter || !adapter.send) return Promise.resolve(null);
  return Promise.resolve(adapter.send(dialog.chatId, text, { res: res, dialog: dialog }))
    .catch(function (e) { return { error: e.message }; });
};

/* Бронь в хранилище идёт за состоянием диалога */
Core.prototype.syncBooking = function (dialog, ctx, res) {
  var store = this.store;
  var b = ctx.booking;
  var scenario = res.scenario;

  if (b && (scenario === 'booking-confirm' || scenario === 'booking-payment' || scenario === 'payment-claimed')) {
    var obj = KB.byId(b.objectId);
    var status = scenario === 'booking-confirm' ? 'удержание'
               : scenario === 'booking-payment' ? 'ждёт оплату' : 'оплата заявлена';
    store.booking(dialog.id, {
      objectId: b.objectId, object: obj ? obj.title : b.objectId,
      from: b.from, to: b.to, nights: U.diffDays(b.from, b.to), guests: b.guests,
      total: b.total, prepay: b.prepay, status: status,
      guest: { name: dialog.guest.name, phone: dialog.guest.phone },
      channel: dialog.channel
    });
  }

  if (scenario === 'cancel' && res.action === 'confirm') {
    var open = store.bookings('активные').filter(function (x) { return x.dialogId === dialog.id; })[0];
    if (open) store.setStatus(open.id, 'отменена', 'агент');
  }
  if (scenario === 'hold-expired') {
    var held = store.bookings('активные').filter(function (x) { return x.dialogId === dialog.id; })[0];
    if (held) store.setStatus(held.id, 'снята', 'таймаут');
  }
};

/* ---------- управление из панели ---------- */

Core.prototype.takeover = function (dialogId, who) {
  var d = this.store.dialogById(dialogId);
  if (!d) return null;
  d.mode = 'менеджер';
  d.unread = 0;
  this.store.dirty.dialogs = true;
  this.store.emit('dialog:mode', { dialogId: dialogId, mode: 'менеджер', who: who || 'менеджер' });
  return d;
};

Core.prototype.release = function (dialogId) {
  var d = this.store.dialogById(dialogId);
  if (!d) return null;
  d.mode = 'бот';
  d.escalated = false;
  this.store.dirty.dialogs = true;
  this.store.emit('dialog:mode', { dialogId: dialogId, mode: 'бот' });
  return d;
};

Core.prototype.managerReply = function (dialogId, text) {
  var d = this.store.dialogById(dialogId);
  if (!d) return Promise.reject(new Error('диалог не найден'));
  this.store.message(dialogId, 'manager', text);
  d.lastAt = Date.now();
  d.unread = 0;
  this.store.dirty.dialogs = true;
  return this.send(d, text, null).then(function () { return d; });
};

/* Сколько удержаний висит прямо сейчас — для панели */
Core.prototype.holds = function () {
  return HOLDS.all().map(function (h) {
    var obj = KB.byId(h.objectId);
    return {
      объект: obj ? obj.title : h.objectId, с: h.from, по: h.to,
      диалог: h.holder, оплачено: h.paid,
      истекает: new Date(h.until).toISOString().slice(11, 16)
    };
  });
};

module.exports = Core;
