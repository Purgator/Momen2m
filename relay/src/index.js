// Momen2m push relay — Cloudflare Worker entry point.
//
//   GET    /v1/health                  -> { ok, publicKey }
//   POST   /v1/device/:id              -> { subscription, schedule[] } replaces the device's plan
//   PUT    /v1/device/:id/subscription -> { subscription } rotates the subscription, keeps the plan
//   GET    /v1/device/:id              -> status (pending count, next time, last sync)
//   DELETE /v1/device/:id              -> forget the device entirely
//
// Device ids are random strings the app generates; nothing links them to a person.
// Optional env ALLOWED_ORIGINS ("https://a.example, https://b.example") restricts
// which sites may talk to this relay.
import { MAX_BODY_BYTES } from './schedule.js';
export { Device } from './device.js';

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      // Health is open to anyone (a browser tab or curl sends no Origin header);
      // everything else must come from an allowed site.
      if (url.pathname === '/v1/health') {
        return json({ ok: true, publicKey: env.VAPID_PUBLIC_KEY || null, configured: !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) }, 200, cors);
      }
      if (!originAllowed(origin, env)) return json({ ok: false, error: 'origin' }, 403, cors);
      const m = url.pathname.match(/^\/v1\/device\/([^/]+)(\/subscription)?$/);
      if (!m) return json({ ok: false, error: 'not found' }, 404, cors);
      const id = m[1];
      if (!ID_RE.test(id)) return json({ ok: false, error: 'bad id' }, 400, cors);
      if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return json({ ok: false, error: 'relay not configured' }, 503, cors);
      const len = Number(request.headers.get('Content-Length') || 0);
      if (len > MAX_BODY_BYTES) return json({ ok: false, error: 'too large' }, 413, cors);

      const stub = env.DEVICE.get(env.DEVICE.idFromName(id));
      const res = await stub.fetch(request);
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(cors)) headers.set(k, v);
      return new Response(res.body, { status: res.status, headers });
    } catch (err) {
      return json({ ok: false, error: String(err && err.message || err) }, 400, cors);
    }
  },
};

function originAllowed(origin, env) {
  const list = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.length) return true;
  return !!origin && list.includes(origin);
}

function corsHeaders(origin, env) {
  return {
    'Access-Control-Allow-Origin': originAllowed(origin, env) && origin ? origin : '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
