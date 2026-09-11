// Engine tests with simulated time. Run: npm test
'use strict';
const assert = require('assert');

// ---- minimal browser shims so the ES modules load under Node --------------------
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
globalThis.addEventListener = () => {};
globalThis.document = { hidden: false, documentElement: {} };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
globalThis.window = globalThis;

(async () => {
  const path = require('path');
  const url = (f) => 'file://' + path.join(__dirname, '..', 'js', f).replace(/\\/g, '/');
  const S = await import(url('store.js'));
  const { state } = S;
  const E = await import(url('engine.js'));
  const T = await import(url('time.js'));
  const { suggestEmoji } = await import(url('emoji.js'));
  globalThis.Notification = { permission: 'granted' };
  const N = await import(url('notify.js'));

  const today = T.dayKey(new Date(2026, 8, 10)); // a Thursday
  const D = (dayOffset, hm) => T.at(today, hm, dayOffset);
  const events = [];
  const hooks = { onStart: (o) => events.push('start:' + o.occ), onEnding: (o) => events.push('ending:' + o.occ), onMissed: (o) => events.push('missed:' + o.occ) };
  const habit = (id, start, end, extra = {}) => ({ id, name: id, emoji: '✅', desc: '', slots: [{ start, end }], days: [0, 1, 2, 3, 4, 5, 6], importance: 2, snooze: true, enabled: true, once: null, createdAt: D(0, '08:00'), ...extra });

  let passed = 0;
  const test = async (name, fn) => { await fn(); passed++; console.log('  ✓', name); };

  await test('emoji suggestions', () => {
    assert.strictEqual(suggestEmoji('Drink water'), '💧');
    assert.strictEqual(suggestEmoji('Boire de l’eau'), '💧');
    assert.strictEqual(suggestEmoji('Call the dentist'), '📞');
    assert.strictEqual(suggestEmoji('Aller au lit'), '😴');
    assert.strictEqual(suggestEmoji('xyz'), '✅');
  });

  await test('start, ending warning and miss fire once each', () => {
    state.habits = [habit('water', '10:00', '10:30')];
    state.days = {}; state.game.xp = 100; state.game.lastEvaluated = T.addDays(today, -1);
    E.tick(D(0, '09:00'), hooks);
    assert.deepStrictEqual(events, []);
    assert.strictEqual(E.buildOccurrences(D(0, '09:00'))[0].phase, 'upcoming');
    E.tick(D(0, '10:00') + 5000, hooks);
    E.tick(D(0, '10:01'), hooks);
    assert.deepStrictEqual(events, ['start:water#0']);
    assert.strictEqual(E.buildOccurrences(D(0, '10:01'))[0].phase, 'active');
    E.tick(D(0, '10:26'), hooks);
    E.tick(D(0, '10:27'), hooks);
    assert.deepStrictEqual(events, ['start:water#0', 'ending:water#0']);
    E.tick(D(0, '10:31'), hooks);
    E.tick(D(0, '10:32'), hooks);
    assert.deepStrictEqual(events, ['start:water#0', 'ending:water#0', 'missed:water#0']);
    const o = E.buildOccurrences(D(0, '10:32'))[0];
    assert.strictEqual(o.status, 'missed');
    assert.strictEqual(o.pts, -20);
    assert.strictEqual(state.game.xp, 80);
  });

  await test('snooze pushes the window back into "coming up", then it pops again', () => {
    state.habits = [habit('meds', '10:00', '10:30', { importance: 3 })];
    state.days = {}; state.game.xp = 100; events.length = 0;
    E.tick(D(0, '10:26'), hooks);
    assert.deepStrictEqual(events, ['ending:meds#0'], 'the start was 26 min ago: too old to alert, only the ending warning fires');
    let o = E.buildOccurrences(D(0, '10:27'))[0];
    const r = E.snooze(o, D(0, '10:27'));
    assert.strictEqual(r.start, D(0, '10:37'), 'start moves by the snooze length');
    assert.strictEqual(r.deadline, D(0, '10:40'), 'deadline moves by the same amount');
    assert.strictEqual(state.game.xp, 97);
    E.tick(D(0, '10:31'), hooks);
    o = E.buildOccurrences(D(0, '10:31'))[0];
    assert.strictEqual(o.phase, 'upcoming', 'off the screen while snoozed');
    assert.deepStrictEqual(events, ['ending:meds#0'], 'no new alert while snoozed');
    E.tick(D(0, '10:37') + 1000, hooks);
    o = E.buildOccurrences(D(0, '10:38'))[0];
    assert.strictEqual(o.phase, 'active');
    assert.deepStrictEqual(events.slice(-1), ['start:meds#0'], 'a fresh start alert when it comes back');
    assert.strictEqual(E.canSnooze(o), 'ok');
    E.snooze(o, D(0, '10:38'));
    o = E.buildOccurrences(D(0, '10:38'))[0];
    assert.strictEqual(E.canSnooze(o), 'exhausted');
    E.tick(D(0, '10:51'), hooks);
    o = E.buildOccurrences(D(0, '10:51'))[0];
    assert.strictEqual(o.status, 'missed');
    assert.strictEqual(o.pts, -36);
    assert.ok(events.includes('missed:meds#0'));
  });

  await test('complete early earns a bonus; undo reverts it', () => {
    state.habits = [habit('read', '11:00', '12:00', { importance: 1 })];
    state.days = {}; state.game.xp = 0;
    E.tick(D(0, '11:05'), hooks);
    let o = E.buildOccurrences(D(0, '11:05'))[0];
    const r = E.complete(o, D(0, '11:10'));
    assert.deepStrictEqual({ pts: r.pts, early: r.early, perfect: r.perfect }, { pts: 15, early: true, perfect: true });
    assert.strictEqual(state.game.xp, 15);
    o = E.buildOccurrences(D(0, '11:11'))[0];
    assert.strictEqual(o.status, 'done');
    assert.ok(E.undo(o));
    assert.strictEqual(state.game.xp, 0);
    o = E.buildOccurrences(D(0, '11:11'))[0];
    assert.strictEqual(o.phase, 'active');
    assert.strictEqual(E.complete(o, D(0, '11:50')).pts, 10);
  });

  await test('skip costs half and blocks a perfect day', () => {
    state.habits = [habit('a', '11:00', '12:00'), habit('b', '13:00', '14:00')];
    state.days = {}; state.game.xp = 50;
    E.tick(D(0, '11:05'), hooks);
    const o = E.buildOccurrences(D(0, '11:05'))[0];
    assert.strictEqual(E.skip(o, D(0, '11:05')).pts, -10);
    assert.strictEqual(state.game.xp, 40);
  });

  await test('windows that ended before the moment existed are ignored', () => {
    state.habits = [habit('late', '09:00', '10:00', { createdAt: D(0, '12:00') }), habit('ok', '13:00', '14:00', { createdAt: D(0, '12:00') })];
    state.days = {}; state.game.xp = 100;
    E.tick(D(0, '12:01'), hooks);
    const occs = E.buildOccurrences(D(0, '12:01'));
    assert.deepStrictEqual(occs.map((o) => o.habit.id), ['ok']);
    assert.strictEqual(state.game.xp, 100);
  });

  await test('a window crossing midnight stays active after 00:00', () => {
    state.habits = [habit('sleep', '23:30', '00:30', { createdAt: D(-1, '08:00') })];
    state.days = {}; state.game.lastEvaluated = T.addDays(today, -2);
    E.tick(D(-1, '23:40'), hooks);
    E.tick(D(0, '00:10'), hooks);
    const occs = E.buildOccurrences(D(0, '00:10'));
    const cross = occs.find((o) => o.day === T.addDays(today, -1));
    assert.ok(cross, 'yesterday occurrence present');
    assert.strictEqual(cross.phase, 'active');
    assert.strictEqual(cross.end, D(0, '00:30'));
    assert.strictEqual(state.game.lastEvaluated, T.addDays(today, -2), 'yesterday not settled while its window is open');
    E.tick(D(0, '00:31'), hooks);
    assert.strictEqual(state.game.lastEvaluated, T.addDays(today, -1));
  });

  await test('streak grows on perfect days and resets on a miss', () => {
    state.habits = [habit('water', '10:00', '10:30', { createdAt: D(-2, '08:00') })];
    state.days = {}; state.game.xp = 100; state.game.streak = 0; state.game.lastEvaluated = T.addDays(today, -3);
    for (const off of [-2, -1]) {
      E.tick(D(off, '10:05'), hooks);
      const o = E.buildOccurrences(D(off, '10:05')).find((x) => x.day === T.addDays(today, off));
      E.complete(o, D(off, '10:05'));
    }
    E.tick(D(0, '09:00'), hooks);
    assert.strictEqual(state.game.streak, 2);
    assert.strictEqual(state.game.lastEvaluated, T.addDays(today, -1));
    // today is missed entirely, and we only open the app two days later
    E.tick(D(2, '09:00'), hooks);
    assert.strictEqual(state.game.streak, 0);
    assert.strictEqual(state.game.xp, 100 + 30 + 30 - 20 - 20);
    assert.strictEqual(state.game.lastEvaluated, T.addDays(today, 1));
  });

  await test('one-off tasks only exist on their day', () => {
    state.habits = [habit('once', '15:00', '15:30', { once: today, days: [] })];
    state.days = {};
    assert.strictEqual(E.buildOccurrences(D(0, '14:00')).length, 1);
    assert.strictEqual(E.buildOccurrences(D(1, '14:00')).length, 0);
  });

  await test('levels', () => {
    assert.strictEqual(E.levelFor(0), 1);
    assert.strictEqual(E.levelFor(59), 1);
    assert.strictEqual(E.levelFor(60), 2);
    assert.strictEqual(E.levelFor(240), 3);
    assert.strictEqual(E.xpForLevel(3), 240);
  });

  // The remaining tests reassign S.state (reset/import/restore), so from here
  // on they read S.state directly rather than the destructured local above.
  await test('needsBackup tracks habit changes against the last backup', () => {
    S.state.habits = [];
    S.state.habitsVersion = 0; S.state.backedUpAtVersion = -1; S.state.lastBackupAt = 0;
    assert.strictEqual(S.needsBackup(), false, 'no habits yet, nothing to back up');
    S.state.habits.push({ id: 'a' });
    S.touchHabits();
    assert.strictEqual(S.needsBackup(), true);
    S.markBackedUp();
    assert.strictEqual(S.needsBackup(), false);
    assert.ok(S.state.lastBackupAt > 0);
    S.touchHabits();
    assert.strictEqual(S.needsBackup(), true, 'a later edit needs a new backup');
  });

  await test('resetAll snapshots the previous setup before wiping it', () => {
    S.state.habits = [{ id: 'x', name: 'Test' }];
    S.state.lang = 'fr';
    S.resetAll();
    assert.deepStrictEqual(S.state.habits, []);
    assert.strictEqual(S.state.lang, 'fr', 'language survives a reset');
    const snap = S.getRecoverySnapshot();
    assert.strictEqual(snap.reason, 'reset');
    assert.strictEqual(snap.data.habits[0].id, 'x');
  });

  await test('importJSON validates before touching anything, and snapshots on success', () => {
    S.state.habits = [{ id: 'keep' }];
    assert.throws(() => S.importJSON('not json'));
    assert.strictEqual(S.state.habits[0].id, 'keep', 'untouched after a garbage import');
    assert.throws(() => S.importJSON(JSON.stringify({ nope: true })));
    assert.strictEqual(S.state.habits[0].id, 'keep', 'untouched after a shape that fails validation');
    S.importJSON(JSON.stringify({ habits: [{ id: 'incoming' }], lang: 'en' }));
    assert.strictEqual(S.state.habits[0].id, 'incoming');
    const snap = S.getRecoverySnapshot();
    assert.strictEqual(snap.reason, 'import');
    assert.strictEqual(snap.data.habits[0].id, 'keep', 'the pre-import data was saved for undo');
  });

  await test('restoreSnapshot brings back a previous setup', () => {
    const snap = S.getRecoverySnapshot(); // left over from the import test: { habits: [{ id: 'keep' }] }
    S.restoreSnapshot(snap.data);
    assert.strictEqual(S.state.habits[0].id, 'keep');
  });

  await test('alert style: gentle by default, strong for critical or when chosen', () => {
    Object.assign(S.state.settings, { alertStyle: 'gentle', criticalAlarm: true });
    assert.strictEqual(N.isStrong(2), false);
    assert.strictEqual(N.isStrong(3), true);
    S.state.settings.criticalAlarm = false;
    assert.strictEqual(N.isStrong(3), false);
    S.state.settings.alertStyle = 'alarm';
    assert.strictEqual(N.isStrong(1), true);
  });

  await test('vibration follows the tone when synced, the chosen pattern otherwise, tripled when strong', () => {
    Object.assign(S.state.settings, { vibSync: true, soundName: 'chime', vibPattern: 'sos' });
    assert.deepStrictEqual(N.vibrationPattern(false), [80, 60, 80]);
    assert.strictEqual(N.vibrationPattern(true).length, 3 * 3 + 2);
    S.state.settings.vibSync = false;
    assert.strictEqual(N.vibrationPattern(false).length, 17, 'SOS pattern');
    S.state.settings.vibPattern = 'nonsense';
    assert.deepStrictEqual(N.vibrationPattern(false), [80, 60, 80], 'unknown pattern falls back to double');
  });

  await test('system notification options follow the sound output and alert style', async () => {
    let opts = null;
    N.setRegistration({ showNotification: async (_title, o) => { opts = o; }, getNotifications: async () => [] });
    Object.assign(S.state.settings, { notifications: true, sound: true, vibrate: true, alertStyle: 'gentle', criticalAlarm: true, soundOutput: 'app', vibSync: true, soundName: 'bell' });
    assert.strictEqual(await N.notify('t', 'b', 'k', 2), true);
    assert.strictEqual(opts.silent, true, 'in-app output keeps the system notification quiet');
    assert.strictEqual(opts.requireInteraction, false);
    assert.deepStrictEqual(opts.vibrate, [400]);
    S.state.settings.soundOutput = 'system';
    await N.notify('t', 'b', 'k', 3);
    assert.strictEqual(opts.silent, false, 'system output lets the phone play its notification sound');
    assert.strictEqual(opts.requireInteraction, true, 'a strong alert stays until dismissed');
    assert.deepStrictEqual(opts.vibrate, [400, 250, 400, 250, 400]);
    S.state.settings.soundOutput = 'both'; S.state.settings.sound = false;
    await N.notify('t', 'b', 'k', 2);
    assert.strictEqual(opts.silent, true, 'sound switched off silences the system sound too');
    S.state.settings.vibrate = false;
    await N.notify('t', 'b', 'k', 2);
    assert.strictEqual(opts.vibrate, undefined);
  });

  await test('import preview: added / removed / changed / points', async () => {
    const { diffStates } = await import(url('diff.js'));
    const a = habit('water', '09:00', '10:00'), b = habit('walk', '18:00', '19:00'), c = habit('read', '21:00', '22:00');
    const cur = { habits: [a, b, c], game: { xp: 120 } };
    const next = { habits: [a, { ...b, slots: [{ start: '18:30', end: '19:30' }] }, habit('meds', '08:00', '08:30')], game: { xp: 40 } };
    const d = diffStates(cur, next);
    assert.deepStrictEqual(d.added.map((h) => h.id), ['meds']);
    assert.deepStrictEqual(d.removed.map((h) => h.id), ['read']);
    assert.deepStrictEqual(d.changed.map((x) => x.to.id + ':' + x.facets.join('+')), ['walk:time']);
    assert.deepStrictEqual(d.same.map((h) => h.id), ['water']);
    assert.deepStrictEqual(d.xp, { from: 120, to: 40 });
    assert.strictEqual(d.identical, false);
    assert.strictEqual(diffStates(cur, { habits: [a, b, c], game: { xp: 120 } }).identical, true);
    // day order and a missing enabled flag are not "changes"
    const d2 = diffStates({ habits: [{ ...a, days: [6, 0, 1, 2, 3, 4, 5] }] }, { habits: [{ ...a, enabled: undefined }] });
    assert.strictEqual(d2.changed.length, 0);
  });

  await test('export stamps the file itself as the backup, to the second', () => {
    const before = S.state.lastBackupAt;
    const parsed = JSON.parse(S.exportJSON(1800000000000));
    assert.strictEqual(parsed.lastBackupAt, 1800000000000, 'the file says when it was made');
    assert.strictEqual(parsed.backedUpAtVersion, S.state.habitsVersion || 0);
    assert.strictEqual(S.state.lastBackupAt, before, 'exporting alone does not mark the device as backed up');
    S.markBackedUp(1800000000000);
    assert.strictEqual(S.state.lastBackupAt, 1800000000000);
    assert.strictEqual(S.needsBackup(), false);
    assert.strictEqual(T.fileStamp(new Date(2026, 8, 11, 14, 5, 3)), '2026-09-11_14-05-03');
  });

  console.log(`\n${passed} tests passed`);
})().catch((e) => { console.error(e); process.exit(1); });
