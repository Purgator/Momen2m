// A small QR code encoder — byte mode, error correction level L, versions
// 1 to 40, mask picked by penalty score. Enough to show a shared link on
// screen for another phone to scan; no dependency. Structure follows the
// classic reference implementation (Nayuki's qrcodegen).

const ECC_PER_BLOCK = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30];
const NUM_BLOCKS = [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25];

// Modules left for data + error correction once the function patterns are placed.
export function rawDataModules(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const a = Math.floor(ver / 7) + 2;
    r -= (25 * a - 10) * a - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}
export function dataCodewords(ver) { return Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver]; }

function versionFor(byteLen) {
  for (let v = 1; v <= 40; v++) {
    if (4 + (v < 10 ? 8 : 16) + byteLen * 8 <= dataCodewords(v) * 8) return v;
  }
  return 0;
}

// ---- Reed-Solomon over GF(2^8), polynomial 0x11D ------------------------------------
function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
  return z;
}
function rsDivisor(degree) {
  const r = new Array(degree).fill(0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) { r[j] = gfMul(r[j], root); if (j + 1 < degree) r[j] ^= r[j + 1]; }
    root = gfMul(root, 2);
  }
  return r;
}
function rsRemainder(data, divisor) {
  const r = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ r.shift();
    r.push(0);
    divisor.forEach((c, i) => { r[i] ^= gfMul(c, factor); });
  }
  return r;
}

function interleave(data, ver) {
  const nb = NUM_BLOCKS[ver], ecLen = ECC_PER_BLOCK[ver], raw = Math.floor(rawDataModules(ver) / 8);
  const nShort = nb - (raw % nb), shortLen = Math.floor(raw / nb);
  const divisor = rsDivisor(ecLen);
  const blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const len = shortLen - ecLen + (i < nShort ? 0 : 1);
    const dat = data.slice(k, k + len); k += len;
    const ecc = rsRemainder(dat, divisor);
    if (i < nShort) dat.push(0); // placeholder so every block has the same length
    blocks.push(dat.concat(ecc));
  }
  const out = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecLen || j >= nShort) out.push(b[i]); });
  return out;
}

// ---- matrix -----------------------------------------------------------------------
function alignPositions(ver) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const r = [6];
  for (let pos = ver * 4 + 17 - 7; r.length < n; pos -= step) r.splice(1, 0, pos);
  return r;
}

function drawFormat(m, f, size, mask) {
  const data = (1 << 3) | mask; // level L = 01
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const set = (x, y, v) => { m[y][x] = v; f[y][x] = 1; };
  const bit = (i) => (bits >>> i) & 1;
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  set(8, size - 8, 1);
}

function drawVersion(m, f, size, ver) {
  if (ver < 7) return;
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
  const bits = (ver << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const b = (bits >>> i) & 1, a = size - 11 + (i % 3), c = Math.floor(i / 3);
    m[c][a] = b; f[c][a] = 1; m[a][c] = b; f[a][c] = 1;
  }
}

function applyMask(m, f, size, mask) {
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (f[y][x]) continue;
    let inv;
    switch (mask) {
      case 0: inv = (x + y) % 2 === 0; break;
      case 1: inv = y % 2 === 0; break;
      case 2: inv = x % 3 === 0; break;
      case 3: inv = (x + y) % 3 === 0; break;
      case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
      case 5: inv = (x * y) % 2 + (x * y) % 3 === 0; break;
      case 6: inv = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
      default: inv = ((x + y) % 2 + (x * y) % 3) % 2 === 0;
    }
    if (inv) m[y][x] ^= 1;
  }
}

function penalty(m, size) {
  let res = 0, dark = 0;
  const lines = [];
  for (let y = 0; y < size; y++) { let s = ''; for (let x = 0; x < size; x++) s += m[y][x]; lines.push(s); }
  for (let x = 0; x < size; x++) { let s = ''; for (let y = 0; y < size; y++) s += m[y][x]; lines.push(s); }
  for (const s of lines) {
    for (const run of s.match(/0+|1+/g)) if (run.length >= 5) res += 3 + run.length - 5;
    for (const pat of ['10111010000', '00001011101']) { let i = -1; while ((i = s.indexOf(pat, i + 1)) >= 0) res += 40; }
  }
  for (let y = 0; y + 1 < size; y++) for (let x = 0; x + 1 < size; x++) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) res += 3;
  }
  for (const row of m) for (const c of row) dark += c;
  const total = size * size;
  res += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return res;
}

// Returns the module matrix (rows of 0/1) for `text`, or null if too long.
export function encode(text) {
  const bytes = new TextEncoder().encode(text);
  const ver = versionFor(bytes.length);
  if (!ver) return null;
  const bits = [];
  const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  push(4, 4); push(bytes.length, ver < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const cap = dataCodewords(ver) * 8;
  push(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  for (let pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) push(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }
  const codewords = interleave(data, ver);

  const size = ver * 4 + 17;
  const m = Array.from({ length: size }, () => new Uint8Array(size));
  const f = Array.from({ length: size }, () => new Uint8Array(size));
  const set = (x, y, v) => { if (x < 0 || y < 0 || x >= size || y >= size) return; m[y][x] = v ? 1 : 0; f[y][x] = 1; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, d !== 2 && d !== 4); } };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const ap = alignPositions(ver);
  for (let i = 0; i < ap.length; i++) for (let j = 0; j < ap.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  drawFormat(m, f, size, 0);
  drawVersion(m, f, size, ver);
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
        if (!f[y][x] && i < codewords.length * 8) { m[y][x] = (codewords[i >>> 3] >>> (7 - (i & 7))) & 1; i++; }
      }
    }
  }
  let best = null, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(m, f, size, mask); drawFormat(m, f, size, mask);
    const score = penalty(m, size);
    if (score < bestScore) { bestScore = score; best = m.map((r) => Array.from(r)); }
    applyMask(m, f, size, mask);
  }
  return best;
}

// Paints `text` as a QR code into `canvas` (quiet zone included). False if too long.
export function drawQR(canvas, text, { scale = 4, margin = 4 } = {}) {
  const m = encode(text);
  if (!m) return false;
  const size = m.length, px = (size + 2 * margin) * scale;
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#000';
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (m[y][x]) ctx.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale);
  return true;
}
