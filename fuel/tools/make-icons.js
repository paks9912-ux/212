#!/usr/bin/env node
/* Рисует иконки приложения без внешних библиотек: капля топлива на янтарном фоне.
   node fuel/tools/make-icons.js                                                */
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const out = path.join(__dirname, '..', 'icons');

/* ---------- минимальный кодировщик PNG ---------- */
const TBL = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = buf => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TBL[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
};
const png = (w, h, rgba) => {
  const stride = w * 4 + 1, raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
};

/* ---------- сама картинка ---------- */
const SS = 4;                                   // сглаживание сверхдискретизацией
function icon(size, opt) {
  opt = opt || {};
  const radius = (opt.radius == null ? 0.22 : opt.radius) * size;
  const dropR = (opt.drop == null ? 0.215 : opt.drop) * size;
  const cx = size / 2, cy = size * (opt.cy || 0.585);
  const apex = size * (opt.apex || 0.2);
  const buf = Buffer.alloc(size * size * 4);

  const inRound = (x, y) => {
    if (radius <= 0) return true;
    const rx = Math.min(x, size - x), ry = Math.min(y, size - y);
    if (rx >= radius || ry >= radius) return true;
    const dx = radius - rx, dy = radius - ry;
    return dx * dx + dy * dy <= radius * radius;
  };
  const inDrop = (x, y) => {
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy <= dropR * dropR) return true;
    if (y < apex || y > cy) return false;
    const half = dropR * (y - apex) / (cy - apex);
    return Math.abs(dx) <= half;
  };

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bg = 0, fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = px + (sx + 0.5) / SS, y = py + (sy + 0.5) / SS;
          if (!inRound(x, y)) continue;
          bg++;
          if (inDrop(x, y)) fg++;
        }
      }
      const n = SS * SS, i = (py * size + px) * 4;
      const a = bg / n, drop = fg / n;
      /* фон — вертикальный градиент от тёплого к глубокому янтарю */
      const k = py / size;
      const r = Math.round(245 - 28 * k), g = Math.round(158 - 39 * k), b = Math.round(11 - 5 * k);
      buf[i] = Math.round(r * (1 - drop) + 255 * drop);
      buf[i + 1] = Math.round(g * (1 - drop) + 255 * drop);
      buf[i + 2] = Math.round(b * (1 - drop) + 255 * drop);
      buf[i + 3] = Math.round(a * 255);
    }
  }
  return png(size, size, buf);
}

fs.mkdirSync(out, { recursive: true });
const files = [
  ['favicon-64.png', icon(64, { radius: 0.2 })],
  ['icon-180.png', icon(180, { radius: 0 })],            // iOS скругляет сам
  ['icon-192.png', icon(192, { radius: 0.22 })],
  ['icon-512.png', icon(512, { radius: 0.22 })],
  ['icon-maskable-512.png', icon(512, { radius: 0, drop: 0.165, cy: 0.575, apex: 0.29 })]
];
files.forEach(([name, data]) => {
  fs.writeFileSync(path.join(out, name), data);
  console.log('  ' + name, (data.length / 1024).toFixed(1) + ' КБ');
});
console.log('иконки готовы →', out);
