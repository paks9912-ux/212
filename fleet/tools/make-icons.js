#!/usr/bin/env node
/* Рисует иконки приложения без сторонних библиотек: капля топлива на синем фоне.
   node tools/make-icons.js                                                    */
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const out = path.join(__dirname, '..', 'icons');

/* ---------- запись PNG ---------- */
const CRC = (() => {
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
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const png = (w, h, rgba) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
};

/* ---------- рисование ---------- */
const SS = 4;                                   // сглаживание через суперсэмплинг

/* капля: круг снизу плюс конус, касающийся его сторонами, — вершина сверху */
function inDrop(x, y, cx, top, bottom) {
  const H = bottom - top;
  const r = H / 2.9;                 // высота капли = 2,9 радиуса
  const cy = bottom - r;
  const d = cy - top;                // от вершины до центра круга
  if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) return true;
  const dy = y - top;
  /* конус обрываем в точках касания, иначе по бокам торчат «ушки» */
  if (dy < 0 || dy > (d * d - r * r) / d) return false;
  const alpha = Math.asin(r / d);    // половина угла — стороны касаются круга
  return Math.abs(x - cx) <= dy * Math.tan(alpha);
}

function inRoundRect(x, y, size, radius) {
  const r = radius;
  if (x < r && y < r) return (x - r) ** 2 + (y - r) ** 2 <= r * r;
  if (x > size - r && y < r) return (x - (size - r)) ** 2 + (y - r) ** 2 <= r * r;
  if (x < r && y > size - r) return (x - r) ** 2 + (y - (size - r)) ** 2 <= r * r;
  if (x > size - r && y > size - r) return (x - (size - r)) ** 2 + (y - (size - r)) ** 2 <= r * r;
  return true;
}

function draw(size, { maskable = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const radius = maskable ? 0 : size * 0.225;
  /* капля: в maskable-иконке мельче, чтобы попасть в безопасную зону */
  const scale = maskable ? 0.42 : 0.56;
  const top = size * (0.5 - scale / 2), bottom = size * (0.5 + scale / 2);
  const cx = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0, fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
          if (!inRoundRect(px, py, size, radius)) continue;
          bg++;
          if (inDrop(px, py, cx, top, bottom)) fg++;
        }
      }
      const n = SS * SS;
      const a = bg / n, f = fg / n;
      /* фон — вертикальный градиент синего */
      const t = y / size;
      const br = Math.round(10 + 6 * t), bgc = Math.round(111 - 34 * t), bb = Math.round(209 - 52 * t);
      /* капля белая, чуть прозрачная снизу — читается объём */
      const wr = 255, wg = 255, wb = 255;
      const i = (y * size + x) * 4;
      const mix = f / Math.max(a, 0.0001);
      buf[i] = Math.round(br * (1 - mix) + wr * mix);
      buf[i + 1] = Math.round(bgc * (1 - mix) + wg * mix);
      buf[i + 2] = Math.round(bb * (1 - mix) + wb * mix);
      buf[i + 3] = Math.round(a * 255);
    }
  }
  return png(size, size, buf);
}

const files = [
  ['favicon-64.png', 64, {}],
  ['icon-180.png', 180, {}],
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true }]
];
fs.mkdirSync(out, { recursive: true });
files.forEach(([name, size, opt]) => {
  const data = draw(size, opt);
  fs.writeFileSync(path.join(out, name), data);
  console.log('  ' + name, (data.length / 1024).toFixed(1) + ' КБ');
});
