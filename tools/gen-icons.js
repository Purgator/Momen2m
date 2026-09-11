// Generates the PWA icons as PNG files with zero dependencies.
// Design: dark rounded tile, white clock ring, two hands, an accent "moment" dot.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'icons');
fs.mkdirSync(OUT, { recursive: true });

// ---- tiny PNG encoder -------------------------------------------------------
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- vector-ish drawing with signed distances --------------------------------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;

function sdRoundedBox(x, y, half, r) {
  const qx = Math.abs(x) - half + r, qy = Math.abs(y) - half + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}
function sdSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay, apx = px - ax, apy = py - ay;
  const h = clamp01((apx * abx + apy * aby) / (abx * abx + aby * aby));
  return Math.hypot(apx - abx * h, apy - aby * h);
}

// Paints one sample (normalized coordinates in [-1, 1]) for a given variant.
function shade(u, v, variant) {
  // variant: 'any' (rounded tile with transparent corners) | 'maskable' (full bleed)
  const bgTop = [0x5b, 0x5f, 0xff], bgBot = [0x1a, 0x1d, 0x3f];
  const t = clamp01((v + 1) / 2);
  let r = mix(bgTop[0], bgBot[0], t), g = mix(bgTop[1], bgBot[1], t), b = mix(bgTop[2], bgBot[2], t);
  let a = 1;
  if (variant === 'any') {
    const d = sdRoundedBox(u, v, 1, 0.24);
    a = clamp01(0.5 - d * 90);
  }
  const scale = variant === 'maskable' ? 0.78 : 1; // keep the safe zone for masks
  const x = u / scale, y = v / scale;

  // Clock ring
  const ringR = 0.62, ringW = 0.085;
  const dRing = Math.abs(Math.hypot(x, y) - ringR) - ringW / 2;
  const ring = clamp01(0.5 - dRing * 90);
  // Hands: hour at about 10, minute at 12
  const hourLen = 0.30, minLen = 0.44, hw = 0.075;
  const ha = -Math.PI * 0.72;
  const dHour = sdSegment(x, y, 0, 0, Math.cos(ha) * hourLen, Math.sin(ha) * hourLen) - hw / 2;
  const dMin = sdSegment(x, y, 0, 0, 0, -minLen) - hw / 2;
  const hands = clamp01(0.5 - Math.min(dHour, dMin) * 90);
  const hub = clamp01(0.5 - (Math.hypot(x, y) - 0.075) * 90);
  const white = Math.max(ring, hands, hub);
  r = mix(r, 255, white); g = mix(g, 255, white); b = mix(b, 255, white);

  // Accent "moment" dot at 12 o'clock sitting on the ring
  const dot = clamp01(0.5 - (Math.hypot(x, y + ringR) - 0.13) * 90);
  r = mix(r, 0xff, dot); g = mix(g, 0xb0, dot); b = mix(b, 0x3a, dot);

  return [r, g, b, a * 255];
}

function render(size, variant) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 3; // supersampling factor
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const u = ((px + (sx + 0.5) / SS) / size) * 2 - 1;
        const v = ((py + (sy + 0.5) / SS) / size) * 2 - 1;
        const [cr, cg, cb, ca] = shade(u, v, variant);
        r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
      }
      const i = (py * size + px) * 4;
      if (a > 0) { buf[i] = r / a; buf[i + 1] = g / a; buf[i + 2] = b / a; }
      buf[i + 3] = a / (SS * SS);
    }
  }
  return encodePNG(size, buf);
}

const jobs = [
  ['icon-192.png', 192, 'any'],
  ['icon-512.png', 512, 'any'],
  ['apple-touch-icon.png', 180, 'maskable'], // iOS wants an opaque square
  ['maskable-512.png', 512, 'maskable'],
  ['favicon-32.png', 32, 'any'],
];
for (const [name, size, variant] of jobs) {
  fs.writeFileSync(path.join(OUT, name), render(size, variant));
  console.log('wrote', name);
}
