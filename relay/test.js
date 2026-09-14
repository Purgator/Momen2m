// Relay tests under Node (no Workers runtime needed): the Web Push crypto
// round-trips against a simulated browser, VAPID tokens verify, and the
// scheduling helpers behave. Run: npm test (or node relay/test.js)
import assert from 'node:assert';
import { encryptPayload, decryptPayload, generateVapidKeys, importVapidPrivateKey, vapidAuthorization, b64u } from './src/webpush.js';
import { normaliseSchedule, validateSubscription, splitDue, nextAlarm, LATE_GRACE } from './src/schedule.js';

const subtle = globalThis.crypto.subtle;
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('  ✓', name); };

await test('aes128gcm payload encrypts for a browser subscription and decrypts with its keys', async () => {
  // A "browser": its own P-256 pair and 16-byte auth secret, exactly what PushManager.subscribe() yields.
  const ua = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaPublic = new Uint8Array(await subtle.exportKey('raw', ua.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const subscription = { endpoint: 'https://push.example/abc', keys: { p256dh: b64u.encode(uaPublic), auth: b64u.encode(auth) } };
  const payload = JSON.stringify({ v: 1, title: '💧 Water', body: 'It is time. 1 h to do it, 20 pts at stake.', tag: '2026-09-14|a#0' });
  const body = await encryptPayload(subscription, payload);
  assert.ok(body.byteLength > 86 + payload.length, 'header (86 bytes) + ciphertext + tag');
  assert.strictEqual(body[20], 65, 'key id length is the 65-byte sender public key');
  assert.strictEqual(await decryptPayload(body, ua.privateKey, uaPublic, auth), payload);
  const again = await encryptPayload(subscription, payload);
  assert.notDeepStrictEqual(Array.from(again.slice(0, 16)), Array.from(body.slice(0, 16)), 'fresh salt every time');
});

await test('VAPID: generated keys sign a JWT the push service can verify', async () => {
  const keys = await generateVapidKeys();
  assert.strictEqual(b64u.decode(keys.publicKey).length, 65);
  assert.strictEqual(b64u.decode(keys.privateKey).length, 32);
  const priv = await importVapidPrivateKey(keys.publicKey, keys.privateKey);
  const auth = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/xyz', keys.publicKey, priv, 'mailto:t@example.com');
  const m = auth.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.ok(m, 'Authorization header shape');
  assert.strictEqual(m[2], keys.publicKey);
  const [h, c, s] = m[1].split('.');
  const claims = JSON.parse(new TextDecoder().decode(b64u.decode(c)));
  assert.strictEqual(claims.aud, 'https://fcm.googleapis.com');
  assert.strictEqual(claims.sub, 'mailto:t@example.com');
  assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 24 * 3600, 'expiry within 24 h');
  const pubRaw = b64u.decode(keys.publicKey);
  const pub = await subtle.importKey('raw', pubRaw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64u.decode(s), new TextEncoder().encode(h + '.' + c));
  assert.strictEqual(ok, true, 'signature verifies with the public key');
});

await test('schedule normalisation sorts, trims and rejects junk', () => {
  const sched = normaliseSchedule([
    { at: 2000, title: 'B', tag: 'b', kind: 'ending', strong: true, actions: [{ action: 'done', title: 'Done' }, { action: 'snooze', title: 'Snooze' }, { action: 'x', title: 'x' }] },
    { at: 1000, title: 'A', body: 'x'.repeat(500), tag: 'a', kind: 'weird' },
  ]);
  assert.deepStrictEqual(sched.map((s) => s.tag), ['a', 'b']);
  assert.strictEqual(sched[0].body.length, 300);
  assert.strictEqual(sched[0].kind, 'start', 'unknown kind falls back to start');
  assert.strictEqual(sched[0].key, 'a', 'key defaults to the tag');
  assert.strictEqual(sched[1].actions.length, 2, 'at most two buttons');
  assert.deepStrictEqual(normaliseSchedule([{ at: 1, title: 'v', tag: 'v', vibrate: [80, 60, 80, -5, 9999] }])[0].vibrate, [80, 60, 80, 0, 2000], 'vibration pattern passes through, clamped');
  assert.throws(() => normaliseSchedule([{ at: 'soon', title: 'x', tag: 'x' }]));
  assert.throws(() => normaliseSchedule([{ at: Date.now() + 61 * 86400000, title: 'x', tag: 'x' }]), /bad time/);
  assert.throws(() => normaliseSchedule([{ at: 1, tag: 'x' }]), /title/);
  assert.throws(() => normaliseSchedule(new Array(601).fill({ at: 1, title: 'x', tag: 'x' })), /too many/);
  assert.throws(() => validateSubscription({ endpoint: 'http://insecure', keys: { p256dh: 'a', auth: 'b' } }));
  assert.deepStrictEqual(validateSubscription({ endpoint: 'https://p/1', keys: { p256dh: 'a', auth: 'b' }, extra: 1 }), { endpoint: 'https://p/1', expirationTime: null, keys: { p256dh: 'a', auth: 'b' } });
});

await test('alarm split: due within grace sends, too-late drops, future waits', () => {
  const now = 100_000_000;
  const sched = normaliseSchedule([
    { at: now - LATE_GRACE - 1, title: 'stale', tag: 's' },
    { at: now - 60_000, title: 'late-but-ok', tag: 'l' },
    { at: now, title: 'now', tag: 'n' },
    { at: now + 5 * 60_000, title: 'later', tag: 'f' },
  ]);
  const { due, rest } = splitDue(sched, now);
  assert.deepStrictEqual(due.map((d) => d.tag), ['l', 'n']);
  assert.deepStrictEqual(rest.map((d) => d.tag), ['f']);
  assert.strictEqual(nextAlarm(rest), now + 5 * 60_000);
  assert.strictEqual(nextAlarm([]), null);
});

console.log(`\n${passed} relay tests passed`);
