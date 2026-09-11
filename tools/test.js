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

  const today = T.dayKey(new Date(2026, 8, 10)); // a Thursday
  const D = (dayOffset, hm) => T.at(today, hm, dayOffset);
  const events = [];
  const hooks = { onStart: (o) => events.push('start:' + o.occ), onEnding: (o) => events.push('ending:' + o.occ), onMissed: (o) => events.push('missed:' + o.occ) };
  const habit = (id, start, end, extra = {}) => ({ id, name: id, emoji: '✅', desc: '', slots: [{ start, end }], days: [0, 1, 2, 3, 4, 5, 6], importance: 2, snooze: true, enabled: true, once: null, createdAt: D(0, '08:00'), ...extra });

  let passed = 0;
  const test = (name, fn) => { fn(); passed++; console.log('  ✓', name); };

  test('emoji suggestions', () => {
    assert.strictEqual(suggestEmoji('Drink water'), '💧');
    assert.strictEqual(suggestEmoji('Boire de l’eau'), '💧');
    assert.strictEqual(suggestEmoji('Call the dentist'), '📞');
    assert.strictEqual(suggestEmoji('Aller au lit'), '😴');
    assert.strictEqual(suggestEmoji('xyz'), '✅');
  });

  test('start, ending warning and miss fire once each', () => {
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

  test('snooze extends the deadline and costs points', () => {
    state.habits = [habit('meds', '10:00', '10:30', { importance: 3 })];
    state.days = {}; state.game.xp = 100; events.length = 0;
    E.tick(D(0, '10:26'), hooks);
    let o = E.buildOccurrences(D(0, '10:27'))[0];
    const r = E.snooze(o, D(0, '10:27'));
    assert.strictEqual(r.deadline, D(0, '10:40'));
    assert.strictEqual(state.game.xp, 97);
    E.tick(D(0, '10:31'), hooks);
    o = E.buildOccurrences(D(0, '10:31'))[0];
    assert.strictEqual(o.phase, 'active');
    assert.strictEqual(E.canSnooze(o), 'ok');
    E.snooze(o, D(0, '10:31'));
    o = E.buildOccurrences(D(0, '10:31'))[0];
    assert.strictEqual(E.canSnooze(o), 'exhausted');
    E.tick(D(0, '10:51'), hooks);
    o = E.buildOccurrences(D(0, '10:51'))[0];
    assert.strictEqual(o.status, 'missed');
    assert.strictEqual(o.pts, -36);
    assert.ok(events.includes('missed:meds#0'));
  });

  test('complete early earns a bonus; undo reverts it', () => {
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

  test('skip costs half and blocks a perfect day', () => {
    state.habits = [habit('a', '11:00', '12:00'), habit('b', '13:00', '14:00')];
    state.days = {}; state.game.xp = 50;
    E.tick(D(0, '11:05'), hooks);
    const o = E.buildOccurrences(D(0, '11:05'))[0];
    assert.strictEqual(E.skip(o, D(0, '11:05')).pts, -10);
    assert.strictEqual(state.game.xp, 40);
  });

  test('windows that ended before the moment existed are ignored', () => {
    state.habits = [habit('late', '09:00', '10:00', { createdAt: D(0, '12:00') }), habit('ok', '13:00', '14:00', { createdAt: D(0, '12:00') })];
    state.days = {}; state.game.xp = 100;
    E.tick(D(0, '12:01'), hooks);
    const occs = E.buildOccurrences(D(0, '12:01'));
    assert.deepStrictEqual(occs.map((o) => o.habit.id), ['ok']);
    assert.strictEqual(state.game.xp, 100);
  });

  test('a window crossing midnight stays active after 00:00', () => {
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

  test('streak grows on perfect days and resets on a miss', () => {
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

  test('one-off tasks only exist on their day', () => {
    state.habits = [habit('once', '15:00', '15:30', { once: today, days: [] })];
    state.days = {};
    assert.strictEqual(E.buildOccurrences(D(0, '14:00')).length, 1);
    assert.strictEqual(E.buildOccurrences(D(1, '14:00')).length, 0);
  });

  test('levels', () => {
    assert.strictEqual(E.levelFor(0), 1);
    assert.strictEqual(E.levelFor(59), 1);
    assert.strictEqual(E.levelFor(60), 2);
    assert.strictEqual(E.levelFor(240), 3);
    assert.strictEqual(E.xpForLevel(3), 240);
  });

  // The remaining tests reassign S.state (reset/import/restore), so from here
  // on they read S.state directly rather than the destructured local above.
  test('needsBackup tracks habit changes against the last backup', () => {
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

  test('resetAll snapshots the previous setup before wiping it', () => {
    S.state.habits = [{ id: 'x', name: 'Test' }];
    S.state.lang = 'fr';
    S.resetAll();
    assert.deepStrictEqual(S.state.habits, []);
    assert.strictEqual(S.state.lang, 'fr', 'language survives a reset');
    const snap = S.getRecoverySnapshot();
    assert.strictEqual(snap.reason, 'reset');
    assert.strictEqual(snap.data.habits[0].id, 'x');
  });

  test('importJSON validates before touching anything, and snapshots on success', () => {
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

  test('restoreSnapshot brings back a previous setup', () => {
    const snap = S.getRecoverySnapshot(); // left over from the import test: { habits: [{ id: 'keep' }] }
    S.restoreSnapshot(snap.data);
    assert.strictEqual(S.state.habits[0].id, 'keep');
  });

  console.log(`\n${passed} tests passed`);
})().catch((e) => { console.error(e); process.exit(1); });
