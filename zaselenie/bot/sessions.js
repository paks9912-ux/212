/* Диалоги по чатам: держим в памяти, зеркалим на диск.
   Перезапуск бота не должен стирать «нас четверо» из первого сообщения. */
'use strict';

var fs = require('fs');

function Store(file, ttlHours) {
  this.file = file;
  this.ttl = (ttlHours || 48) * 3600 * 1000;
  this.map = new Map();
  this.dirty = false;
  this.timer = null;
  this.load();
}

/* Контекст сериализуем компактно: варианты храним ссылками на квартиры,
   а не копиями всей базы знаний */
Store.prototype.pack = function (entry) {
  var ctx = entry.ctx;
  return {
    at: entry.at,
    user: entry.user || null,
    ctx: {
      channel: ctx.channel, turns: ctx.turns, guest: ctx.guest, request: ctx.request,
      booking: ctx.booking, unresolved: ctx.unresolved,
      history: ctx.history.slice(-10),
      offers: ctx.offers.map(function (o) {
        return { id: o.object.id, quote: o.quote, score: o.score, notes: o.notes };
      })
    }
  };
};

Store.prototype.unpack = function (raw, KB, AGENT) {
  var ctx = AGENT.newContext({ channel: raw.ctx.channel });
  ['turns', 'guest', 'request', 'booking', 'unresolved', 'history'].forEach(function (k) {
    if (raw.ctx[k] !== undefined && raw.ctx[k] !== null) ctx[k] = raw.ctx[k];
  });
  ctx.offers = (raw.ctx.offers || []).map(function (o) {
    var obj = KB.byId(o.id);
    return obj ? { object: obj, quote: o.quote, score: o.score, notes: o.notes || [] } : null;
  }).filter(Boolean);
  return { at: raw.at, user: raw.user, ctx: ctx };
};

Store.prototype.load = function () {
  try {
    if (!fs.existsSync(this.file)) return;
    var raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    this.raw = raw;
  } catch (e) {
    this.raw = {};
  }
};

/* Гидратация ленивая: модули агента подключаются снаружи */
Store.prototype.attach = function (KB, AGENT) {
  var self = this;
  this.KB = KB; this.AGENT = AGENT;
  var now = Date.now();
  Object.keys(this.raw || {}).forEach(function (chatId) {
    var e = self.raw[chatId];
    if (!e || now - (e.at || 0) > self.ttl) return;
    try { self.map.set(chatId, self.unpack(e, KB, AGENT)); } catch (err) {}
  });
  this.raw = null;
  return this;
};

Store.prototype.get = function (chatId, user) {
  var key = String(chatId);
  var e = this.map.get(key);
  if (e && Date.now() - e.at > this.ttl) { this.map.delete(key); e = null; }
  if (!e) {
    e = { at: Date.now(), user: user || null, ctx: this.AGENT.newContext({ channel: 'telegram' }) };
    this.map.set(key, e);
  }
  if (user) e.user = user;
  e.at = Date.now();
  this.dirty = true;
  return e.ctx;
};

Store.prototype.reset = function (chatId) {
  this.map.delete(String(chatId));
  this.dirty = true;
};

Store.prototype.stats = function () {
  var live = 0, withBooking = 0, now = Date.now();
  this.map.forEach(function (e) {
    if (now - e.at <= 3600 * 1000) live++;
    if (e.ctx.booking) withBooking++;
  });
  return { всего: this.map.size, активных_за_час: live, с_бронью: withBooking };
};

Store.prototype.save = function () {
  if (!this.dirty) return;
  var out = {}, self = this, now = Date.now();
  this.map.forEach(function (e, chatId) {
    if (now - e.at > self.ttl) return;
    out[chatId] = self.pack(e);
  });
  try {
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(out));
    fs.renameSync(this.file + '.tmp', this.file);
    this.dirty = false;
  } catch (e) {
    console.error('Не смог сохранить сессии:', e.message);
  }
};

Store.prototype.autosave = function (ms) {
  var self = this;
  this.timer = setInterval(function () { self.save(); }, ms || 15000);
  if (this.timer.unref) this.timer.unref();
  return this;
};

Store.prototype.stop = function () {
  if (this.timer) clearInterval(this.timer);
  this.save();
};

module.exports = Store;
