// One Durable Object per installed app (device id chosen by the app). Holds the
// push subscription and the upcoming reminders, wakes itself with an alarm at
// the next reminder time, sends the push, arms the next alarm.
import { sendPush, importVapidPrivateKey } from './webpush.js';
import { normaliseSchedule, validateSubscription, splitDue, nextAlarm, STALE_AFTER } from './schedule.js';

export class Device {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'DELETE') {
      await this.state.storage.deleteAll();
      await this.state.storage.deleteAlarm();
      return json({ ok: true });
    }
    if (request.method === 'GET') {
      const [sub, schedule, lastSync] = await Promise.all([
        this.state.storage.get('sub'), this.state.storage.get('schedule'), this.state.storage.get('lastSync'),
      ]);
      return json({ ok: true, subscribed: !!sub, pending: (schedule || []).length, lastSync: lastSync || 0, nextAt: nextAlarm(schedule || []) });
    }
    if (request.method === 'PUT' && url.pathname.endsWith('/subscription')) {
      // Subscription rotated (pushsubscriptionchange in the app's SW): keep the schedule.
      const body = await request.json();
      await this.state.storage.put('sub', validateSubscription(body.subscription));
      return json({ ok: true });
    }
    if (request.method === 'POST') {
      const body = await request.json();
      const sub = validateSubscription(body.subscription);
      const schedule = normaliseSchedule(body.schedule || []);
      const now = Date.now();
      await this.state.storage.put({ sub, schedule, lastSync: now });
      await this.arm(schedule, now);
      return json({ ok: true, pending: schedule.length, nextAt: nextAlarm(schedule) });
    }
    return json({ ok: false, error: 'method' }, 405);
  }

  async arm(schedule, now) {
    const next = nextAlarm(schedule);
    if (next === null) { await this.state.storage.deleteAlarm(); return; }
    await this.state.storage.setAlarm(Math.max(next, now + 1000));
  }

  async alarm() {
    const now = Date.now();
    const [sub, schedule, lastSync] = await Promise.all([
      this.state.storage.get('sub'), this.state.storage.get('schedule'), this.state.storage.get('lastSync'),
    ]);
    if (!sub || !schedule) return;
    if (now - (lastSync || 0) > STALE_AFTER) {
      // The app has not been opened for over a week: its schedule may be wrong. Go quiet.
      await this.state.storage.put('schedule', []);
      return;
    }
    const { due, rest } = splitDue(schedule, now);
    await this.state.storage.put('schedule', rest);
    if (due.length) {
      const privateKey = await importVapidPrivateKey(this.env.VAPID_PUBLIC_KEY, this.env.VAPID_PRIVATE_KEY);
      const vapid = { publicKey: this.env.VAPID_PUBLIC_KEY, privateKey, subject: this.env.VAPID_SUBJECT || 'mailto:admin@example.com' };
      for (const it of due) {
        const payload = JSON.stringify({ v: 1, ...it });
        try {
          const r = await sendPush(sub, payload, { ...vapid, ttl: 900, urgency: 'high', topic: topicOf(it.tag) });
          if (r.gone) { await this.state.storage.delete('sub'); await this.state.storage.deleteAlarm(); return; }
        } catch (err) {
          console.error('push failed', err && err.message);
        }
      }
    }
    await this.arm(rest, now);
  }
}

// Topic header: 32 chars max, URL-safe. Lets the push service collapse a
// replaced reminder (same moment) if the phone was offline for both.
function topicOf(tag) {
  return tag.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
