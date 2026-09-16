/* Хранилище платформы: диалоги, сообщения, брони, события.
   JSON-файлы с атомарной записью — без зависимостей и без сервера БД.
   Когда броней станут десятки тысяч, меняется только этот файл. */
'use strict';

var fs = require('fs');
var path = require('path');

function Store(dir) {
  this.dir = dir || path.join(__dirname, 'data');
  if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
  this.data = {
    dialogs: this.read('dialogs'),
    messages: this.read('messages'),
    bookings: this.read('bookings'),
    events: this.read('events')
  };
  this.dirty = {};
  this.seq = {};
  this.listeners = [];
  this.timer = null;
}

Store.prototype.read = function (name) {
  var file = path.join(this.dir, name + '.json');
  try {
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  } catch (e) {
    console.error('не смог прочитать ' + name + '.json: ' + e.message);
    return [];
  }
};

Store.prototype.flush = function (name) {
  var file = path.join(this.dir, name + '.json');
  try {
    fs.writeFileSync(file + '.tmp', JSON.stringify(this.data[name]));
    fs.renameSync(file + '.tmp', file);       // атомарно: файл либо старый, либо новый
    delete this.dirty[name];
  } catch (e) {
    console.error('не смог записать ' + name + '.json: ' + e.message);
  }
};

Store.prototype.save = function () {
  var self = this;
  Object.keys(this.dirty).forEach(function (name) { self.flush(name); });
};

Store.prototype.autosave = function (ms) {
  var self = this;
  this.timer = setInterval(function () { self.save(); }, ms || 3000);
  if (this.timer.unref) this.timer.unref();
  return this;
};

Store.prototype.stop = function () {
  if (this.timer) clearInterval(this.timer);
  this.save();
};

Store.prototype.id = function (prefix) {
  this.seq[prefix] = (this.seq[prefix] || 0) + 1;
  return prefix + '-' + Date.now().toString(36) + this.seq[prefix].toString(36);
};

/* Подписка панели на изменения */
Store.prototype.on = function (fn) {
  this.listeners.push(fn);
  var self = this;
  return function () { self.listeners = self.listeners.filter(function (x) { return x !== fn; }); };
};

Store.prototype.emit = function (type, payload) {
  var event = { id: this.id('ev'), type: type, at: Date.now(), payload: payload };
  this.data.events.push(event);
  if (this.data.events.length > 2000) this.data.events = this.data.events.slice(-1000);
  this.dirty.events = true;
  this.listeners.forEach(function (fn) {
    try { fn(event); } catch (e) {}
  });
  return event;
};

/* ---------- диалоги ---------- */

Store.prototype.dialog = function (channel, chatId, patch) {
  var id = channel + ':' + chatId;
  var found = null;
  for (var i = 0; i < this.data.dialogs.length; i++) {
    if (this.data.dialogs[i].id === id) { found = this.data.dialogs[i]; break; }
  }
  if (!found) {
    found = {
      id: id, channel: channel, chatId: String(chatId),
      guest: { name: null, phone: null, lang: 'ru' },
      mode: 'бот',                       // «бот» или «менеджер»
      createdAt: Date.now(), lastAt: Date.now(),
      unread: 0, escalated: false, risk: 0, scenario: null, lastText: '',
      ctx: null                          // контекст агента, чтобы диалог помнил слоты
    };
    this.data.dialogs.push(found);
    this.emit('dialog:new', { id: id, channel: channel });
  }
  if (patch) {
    Object.keys(patch).forEach(function (k) { found[k] = patch[k]; });
  }
  this.dirty.dialogs = true;
  return found;
};

Store.prototype.dialogById = function (id) {
  return this.data.dialogs.filter(function (d) { return d.id === id; })[0] || null;
};

Store.prototype.dialogs = function (filter) {
  var list = this.data.dialogs.slice();
  if (filter === 'эскалации') list = list.filter(function (d) { return d.escalated; });
  if (filter === 'менеджер') list = list.filter(function (d) { return d.mode === 'менеджер'; });
  return list.sort(function (a, b) { return b.lastAt - a.lastAt; });
};

/* ---------- сообщения ---------- */

Store.prototype.message = function (dialogId, from, text, meta) {
  var msg = {
    id: this.id('m'), dialogId: dialogId, from: from, text: String(text || ''),
    at: Date.now(), meta: meta || null
  };
  this.data.messages.push(msg);
  if (this.data.messages.length > 20000) this.data.messages = this.data.messages.slice(-10000);
  this.dirty.messages = true;
  this.emit('message', { dialogId: dialogId, from: from, text: msg.text, meta: msg.meta });
  return msg;
};

Store.prototype.history = function (dialogId, limit) {
  return this.data.messages
    .filter(function (m) { return m.dialogId === dialogId; })
    .slice(-(limit || 50));
};

/* ---------- брони ---------- */

var FLOW = ['удержание', 'ждёт оплату', 'оплата заявлена', 'подтверждена', 'гость заселился', 'завершена', 'отменена', 'снята'];

Store.prototype.booking = function (dialogId, data) {
  var open = this.data.bookings.filter(function (b) {
    return b.dialogId === dialogId && ['удержание', 'ждёт оплату', 'оплата заявлена', 'подтверждена'].indexOf(b.status) >= 0;
  })[0];

  if (open) {
    Object.keys(data || {}).forEach(function (k) { open[k] = data[k]; });
    open.updatedAt = Date.now();
    this.dirty.bookings = true;
    this.emit('booking:update', { id: open.id, status: open.status });
    return open;
  }

  var booking = {
    id: this.id('b'), dialogId: dialogId,
    status: 'удержание', createdAt: Date.now(), updatedAt: Date.now(),
    history: [{ at: Date.now(), status: 'удержание', by: 'агент' }]
  };
  Object.keys(data || {}).forEach(function (k) { booking[k] = data[k]; });
  this.data.bookings.push(booking);
  this.dirty.bookings = true;
  this.emit('booking:new', { id: booking.id, dialogId: dialogId, status: booking.status });
  return booking;
};

Store.prototype.setStatus = function (bookingId, status, by) {
  if (FLOW.indexOf(status) < 0) return null;
  var b = this.data.bookings.filter(function (x) { return x.id === bookingId; })[0];
  if (!b) return null;
  b.status = status;
  b.updatedAt = Date.now();
  b.history.push({ at: Date.now(), status: status, by: by || 'менеджер' });
  this.dirty.bookings = true;
  this.emit('booking:update', { id: b.id, status: status, by: by });
  return b;
};

Store.prototype.bookings = function (filter) {
  var list = this.data.bookings.slice();
  if (filter === 'активные') {
    list = list.filter(function (b) { return ['отменена', 'снята', 'завершена'].indexOf(b.status) < 0; });
  }
  return list.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
};

Store.prototype.bookingById = function (id) {
  return this.data.bookings.filter(function (b) { return b.id === id; })[0] || null;
};

Store.prototype.stats = function () {
  var now = Date.now(), day = 24 * 3600 * 1000;
  var dialogs = this.data.dialogs;
  var active = this.data.bookings.filter(function (b) {
    return ['отменена', 'снята', 'завершена'].indexOf(b.status) < 0;
  });
  return {
    диалогов: dialogs.length,
    заСутки: dialogs.filter(function (d) { return now - d.lastAt < day; }).length,
    наМенеджере: dialogs.filter(function (d) { return d.mode === 'менеджер'; }).length,
    эскалаций: dialogs.filter(function (d) { return d.escalated; }).length,
    броней: this.data.bookings.length,
    активныхБроней: active.length,
    суммаАктивных: active.reduce(function (s, b) { return s + (b.total || 0); }, 0)
  };
};

Store.prototype.FLOW = FLOW;
module.exports = Store;
