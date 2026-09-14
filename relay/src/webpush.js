// Web Push without dependencies, on WebCrypto (works in Cloudflare Workers and Node 18+).
//  - VAPID (RFC 8292): an ES256 JWT proving the sender owns the public key the
//    browser was given at subscription time.
//  - Payload encryption (RFC 8291 + RFC 8188, "aes128gcm"): ECDH on P-256 with
//    the browser's key, HKDF, AES-128-GCM, single record.
const enc = new TextEncoder();
const subtle = globalThis.crypto.subtle;

export const b64u = {
  encode(bytes) {
    let s = '';
    for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(str) {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  },
};

const concat = (...parts) => {
  const n = parts.reduce((a, p) => a + p.byteLength, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(new Uint8Array(p), o); o += p.byteLength; }
  return out;
};

async function hkdf(salt, ikm, info, length) {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

// Imports a raw (65-byte, uncompressed) P-256 public key.
function importPublic(raw, usages = []) {
  return subtle.importKey('raw', raw, { name: 'ECDH', namedCurve: 'P-256' }, true, usages);
}

// Encrypts `payload` (string or bytes) for a browser subscription. Returns the
// aes128gcm body (header + ciphertext), ready to POST with Content-Encoding: aes128gcm.
export async function encryptPayload(subscription, payload) {
  const ua = b64u.decode(subscription.keys.p256dh);          // browser's public key
  const authSecret = b64u.decode(subscription.keys.auth);     // 16 bytes
  const plaintext = typeof payload === 'string' ? enc.encode(payload) : new Uint8Array(payload);

  const local = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await subtle.exportKey('raw', local.publicKey));
  const uaKey = await importPublic(ua);
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyInfo = concat(enc.encode('WebPush: info\0'), ua, asPublic);
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const record = concat(plaintext, new Uint8Array([2])); // padding delimiter: last record
  const aesKey = await subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, record));

  // Header: salt(16) | rs(4, big-endian) | idlen(1) | keyid(65)
  const rs = record.byteLength + 16 + 1; // one record holds everything (+16 tag, +1 for spec headroom)
  const header = concat(salt, new Uint8Array([(rs >>> 24) & 255, (rs >>> 16) & 255, (rs >>> 8) & 255, rs & 255]), new Uint8Array([asPublic.byteLength]), asPublic);
  return concat(header, ciphertext);
}

// Decrypts an aes128gcm body with the receiver's keys. Only used by tests to
// prove the encryption round-trips; browsers do this part themselves.
export async function decryptPayload(body, receiverPrivateKey, receiverPublicRaw, authSecret) {
  body = new Uint8Array(body);
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);
  const asKey = await importPublic(asPublic);
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asKey }, receiverPrivateKey, 256));
  const keyInfo = concat(enc.encode('WebPush: info\0'), receiverPublicRaw, asPublic);
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const aesKey = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const record = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aesKey, ciphertext));
  let end = record.length;
  while (end > 0 && record[end - 1] === 0) end--; // strip zero padding
  return new TextDecoder().decode(record.slice(0, end - 1)); // drop the delimiter byte
}

// VAPID keys are a P-256 pair. `publicKey` is the raw 65-byte key, base64url
// (what the browser gets as applicationServerKey); `privateKey` is the raw
// 32-byte scalar, base64url (kept as a Worker secret).
export async function importVapidPrivateKey(publicKeyB64u, privateKeyB64u) {
  const pub = b64u.decode(publicKeyB64u);
  const jwk = {
    kty: 'EC', crv: 'P-256',
    x: b64u.encode(pub.slice(1, 33)), y: b64u.encode(pub.slice(33, 65)),
    d: privateKeyB64u, ext: true,
  };
  return subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

export async function vapidAuthorization(endpoint, publicKeyB64u, privateKey, subject, ttlSeconds = 12 * 3600) {
  const aud = new URL(endpoint).origin;
  const header = b64u.encode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u.encode(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + ttlSeconds, sub: subject })));
  const signingInput = enc.encode(header + '.' + claims);
  const sig = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, signingInput)); // raw r|s, 64 bytes
  const jwt = header + '.' + claims + '.' + b64u.encode(sig);
  return 'vapid t=' + jwt + ', k=' + publicKeyB64u;
}

// Sends one push. Resolves to { ok, status, gone } — `gone` means the
// subscription is dead (404/410) and should be forgotten.
export async function sendPush(subscription, payload, { publicKey, privateKey, subject, ttl = 3600, urgency = 'high', topic }) {
  const body = await encryptPayload(subscription, payload);
  const headers = {
    'Content-Type': 'application/octet-stream',
    'Content-Encoding': 'aes128gcm',
    'Content-Length': String(body.byteLength),
    TTL: String(ttl),
    Urgency: urgency,
    Authorization: await vapidAuthorization(subscription.endpoint, publicKey, privateKey, subject),
  };
  if (topic) headers.Topic = topic;
  const res = await fetch(subscription.endpoint, { method: 'POST', headers, body });
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
}

// Generates a fresh VAPID pair (used by tools/vapid.js).
export async function generateVapidKeys() {
  const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await subtle.exportKey('jwk', kp.privateKey);
  const raw = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
  return { publicKey: b64u.encode(raw), privateKey: jwk.d };
}
