// Diagnostics report: a plain-text snapshot of everything that decides whether a
// background reminder reaches the phone, for the user to share with the developer.
// Contains no moment names or personal content; the device id is a random string.
import { state } from './store.js';
import { buildPlan } from './plan.js';
import * as Push from './push.js';
import { permission } from './notify.js';

const safe = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };

// Pure: turns collected facts into text, so it can be tested without a browser.
export function formatReport(d, now = Date.now()) {
  const when = (ms) => {
    if (!ms) return 'never';
    const min = Math.round((now - ms) / 60000);
    const rel = min >= 0 ? `${min < 120 ? min + ' min' : Math.round(min / 60) + ' h'} ago` : `in ${-min < 120 ? -min + ' min' : Math.round(-min / 60) + ' h'}`;
    return `${new Date(ms).toISOString().replace('T', ' ').slice(0, 19)}Z (${rel})`;
  };
  const yn = (v) => (v === null || v === undefined ? '?' : v ? 'yes' : 'no');
  const L = [];
  L.push('Momen2m diagnostics');
  L.push(`Generated: ${when(now)} · timezone ${d.tz}`);
  L.push(`App: v${d.version} · installed (standalone): ${yn(d.standalone)} · online: ${yn(d.online)}`);
  L.push(`Device: ${d.ua}`);
  L.push('');
  L.push('Notifications');
  L.push(`  browser permission: ${d.permission} · app switch: ${d.s.notifications ? 'on' : 'OFF'}`);
  L.push(`  sound: ${d.s.sound ? 'on' : 'OFF (background reminders arrive silent)'} · output: ${d.s.soundOutput} · warn before end: ${d.s.reminderBefore} min`);
  L.push('');
  L.push('Background reminders');
  L.push(`  relay configured: ${yn(d.configured)} · supported here: ${yn(d.supported)} · enabled: ${yn(d.push.enabled)}`);
  L.push(`  device id: ${d.push.deviceId || '-'}`);
  L.push(`  last sync: ${when(d.push.lastSync)} · queued per app: ${d.push.pending || 0}`);
  L.push(`  last error: ${d.push.lastError || '-'}${d.caveat ? ' · caveat: ' + d.caveat : ''}`);
  L.push(`  service worker: ${d.sw || '?'}`);
  L.push(`  push subscription: ${d.sub ? 'yes · ' + d.sub : 'NONE'}${d.permState ? ' · permissionState: ' + d.permState : ''}`);
  L.push(`  planned locally: ${d.plan.count} reminders${d.plan.next ? ' · next ' + when(d.plan.next) : ''}`);
  if (d.relay) {
    const h = d.relay.health, v = d.relay.device;
    L.push(`  relay health: ${typeof h === 'object' && h ? `ok=${h.ok} configured=${h.configured}` : h}`);
    L.push(`  relay device: ${typeof v === 'object' && v ? `subscribed=${v.subscribed} pending=${v.pending} lastSync=${when(v.lastSync)} next=${v.nextAt ? when(v.nextAt) : 'none'}` : v || '-'}`);
  }
  L.push('');
  L.push('Pushes received by this phone (newest first)');
  if (!d.log || !d.log.length) L.push('  none recorded');
  else {
    for (const e of d.log) {
      const lag = e.due ? ` · ${Math.round((e.at - e.due) / 1000)} s after due` : '';
      const out = e.bad ? 'unreadable payload' : e.error ? 'show FAILED: ' + e.error : e.shown ? 'shown' : e.visible ? 'app was on screen (app shows it)' : 'not shown';
      L.push(`  ${when(e.at)}${e.kind ? ' · ' + e.kind : ''}${e.silent ? ' · silent' : ''}${lag} · ${out}`);
    }
  }
  return L.join('\n');
}

export async function collect() {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const reg = nav.serviceWorker ? await safe(() => nav.serviceWorker.getRegistration()) : null;
  const sub = reg ? await safe(() => reg.pushManager.getSubscription()) : null;
  const plan = await safe(() => buildPlan(Date.now()), []);
  const sw = !nav.serviceWorker ? 'unsupported'
    : !reg ? 'not registered'
    : `${reg.active ? 'active' : reg.installing ? 'installing' : reg.waiting ? 'waiting' : 'none'} · controlling this page: ${nav.serviceWorker.controller ? 'yes' : 'no'}`;
  let host = '';
  if (sub) { try { host = new URL(sub.endpoint).host; } catch { host = 'unknown'; } }
  const configured = Push.configured, supported = Push.supported();
  const [relay, log, permState] = await Promise.all([
    supported ? safe(() => Push.relayStatus()) : null,
    safe(() => Push.idbGet('pushLog'), []),
    reg ? safe(() => reg.pushManager.permissionState({ userVisibleOnly: true })) : null,
  ]);
  return {
    tz: await safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone, '?'),
    version: self.MOMEN2M_VERSION || 'dev',
    standalone: await safe(() => matchMedia('(display-mode: standalone)').matches || nav.standalone === true),
    online: nav.onLine,
    ua: nav.userAgent || '?',
    permission: permission(),
    s: state.settings,
    configured, supported,
    push: state.push,
    caveat: supported ? Push.caveat() : '',
    sw,
    sub: sub ? host + (sub.expirationTime ? ' · expires ' + new Date(sub.expirationTime).toISOString() : '') : '',
    permState,
    plan: { count: plan.length, next: plan.length ? plan[0].at : 0 },
    relay, log,
  };
}

export async function report() { return formatReport(await collect()); }
