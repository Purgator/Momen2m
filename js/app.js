// Controller: wires state, engine, notifications and UI together.
import {
  state, save, uid, resetAll, exportJSON, importJSON,
  snapshotRecovery, getRecoverySnapshot, restoreSnapshot, touchHabits, needsBackup, markBackedUp,
} from './store.js';
import { t, setLang, pick, getLang } from './i18n.js';
import { PRESETS } from './presets.js';
import * as E from './engine.js';
import * as N from './notify.js';
import * as U from './ui.js';
import { initUpdates, applyUpdate, checkForUpdate } from './update.js';
import { dayKey, addDays, at, nowHM, minutesToHM, parseHM, fmtDuration, fmtClock, fmtDateTime, fileStamp } from './time.js';
import * as AutoImport from './autobackup.js';
import { diffStates } from './diff.js';

// Ask the browser not to garbage-collect this origin's storage under pressure.
// Silent and best-effort: it cannot be forced, and some browsers ignore it.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

const VERSION = self.MOMEN2M_VERSION || 'dev';
const app = document.getElementById('app');

const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIosBrowser = isIos && !standalone;

let view = state.onboarded ? 'live' : 'ob';
let occs = [];
const phases = new Map();       // occurrence key -> last seen phase
const fresh = new Set();        // keys that just changed phase (animate once)
const expanded = new Set();     // keys of secondary active moments tapped open
let renderedDay = '';
let lastCurrentKey = '';
let dirty = true;
let installPrompt = null;
let updateReady = false;
const ob = { step: 0, selected: new Set(PRESETS.filter((p) => p.basic).map((p) => p.id)) };

setLang(state.lang);

// ---- notification hooks (called by the engine on transitions) -------------------
const hooks = {
  onStart(o) {
    const pts = E.BASE_PTS[o.habit.importance] || 20;
    N.notify(t('nStart', { emoji: o.habit.emoji, name: pick(o.habit.name) }),
      t('nStartBody', { t: fmtDuration(o.end - o.start, state.lang), pts }), o.key, o.habit.importance, notifActions(o));
    N.feedback('start', o.habit.importance);
  },
  onEnding(o) {
    N.notify(t('nStart', { emoji: o.habit.emoji, name: pick(o.habit.name) }),
      t('nEndingBody', { t: fmtDuration(o.end - Date.now(), state.lang) }), o.key, o.habit.importance, notifActions(o));
    N.feedback('warn', o.habit.importance);
  },
  onMissed(o, pen) {
    N.notify(t('nMissed', { name: pick(o.habit.name) }), t('nMissedBody'), o.key);
    N.feedback('miss');
    if (view === 'live') U.toast(o.habit.emoji + ' ' + t('missed') + ' · ' + pen, 'bad');
  },
};

// ---- render loop -----------------------------------------------------------------
function render(now = Date.now()) {
  dirty = false;
  if (view === 'ob') {
    app.innerHTML = U.renderOnboarding(ob.step, { selected: ob.selected, isIosBrowser, canInstall: !!installPrompt, standalone });
  } else if (view === 'setup') {
    app.innerHTML = U.renderSetup({
      version: VERSION, updateReady, canInstall: !!installPrompt, isIosBrowser,
      needsBackup: needsBackup(), recovery: getRecoverySnapshot(), canAutoImport: AutoImport.supported,
    });
  } else {
    for (const o of occs) o.fresh = fresh.has(o.key);
    fresh.clear();
    app.innerHTML = U.renderLive(occs, now, { updateReady, recovery: state.habits.length ? null : getRecoverySnapshot(), expanded });
    renderedDay = dayKey(new Date(now));
    const cur = E.currentOf(occs);
    const key = cur ? cur.key : '';
    if (key && key !== lastCurrentKey) {
      const el = U.$('.occ.current');
      if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    }
    lastCurrentKey = key;
  }
}

function frame() {
  const now = Date.now();
  const changed = E.tick(now, hooks);
  occs = E.buildOccurrences(now);
  let phaseChanged = false;
  const seen = new Set();
  for (const o of occs) {
    seen.add(o.key);
    const prev = phases.get(o.key);
    if (prev !== o.phase) {
      phaseChanged = true;
      if (prev) fresh.add(o.key);
      phases.set(o.key, o.phase);
      if (o.phase !== 'active') expanded.delete(o.key); // no longer relevant once resolved
    }
  }
  for (const k of Array.from(phases.keys())) if (!seen.has(k)) { phases.delete(k); expanded.delete(k); fresh.delete(k); phaseChanged = true; }
  if (view !== 'live') return;
  if (dirty || changed || phaseChanged || dayKey(new Date(now)) !== renderedDay) render(now);
  else U.updateCountdowns(occs, now);
}

let interval = 0, wake = 0;
function startTicker() {
  stopTicker();
  frame();
  // align to the second boundary so countdowns tick cleanly
  wake = setTimeout(() => { frame(); interval = setInterval(frame, 1000); }, 1000 - (Date.now() % 1000));
}
function stopTicker() {
  clearInterval(interval); interval = 0;
  clearTimeout(wake); wake = 0;
}
// In the background: sleep until the next boundary instead of ticking every second.
function scheduleWake() {
  clearTimeout(wake);
  const now = Date.now();
  const before = (state.settings.reminderBefore || 0) * 60000;
  let next = at(addDays(dayKey(new Date(now)), 1), '00:00');
  for (const o of occs) {
    if (o.status !== 'open') continue;
    for (const ts of [o.start, o.end, before ? o.end - before : 0]) if (ts > now && ts < next) next = ts;
  }
  wake = setTimeout(() => { frame(); scheduleWake(); }, Math.min(next - now + 300, 2 ** 31 - 1));
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopTicker(); scheduleWake(); } else { startTicker(); }
});

// ---- helpers -----------------------------------------------------------------------
const findOcc = (key) => occs.find((o) => o.key === key);
const findHabit = (id) => state.habits.find((h) => h.id === id);
const shakeEl = (el) => { el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 500); };

function addPreset(p) {
  state.habits.push({
    id: uid(), preset: p.id, name: p.name, desc: p.desc, emoji: p.emoji,
    slots: p.slots.map(([start, end]) => ({ start, end })),
    days: [0, 1, 2, 3, 4, 5, 6], importance: p.importance, snooze: true, enabled: true, once: null, createdAt: Date.now(),
  });
  touchHabits();
}

// Adds the presets picked during onboarding to real habits (idempotent: safe to
// call more than once). Kept separate from 'ob-start' so the backup step, which
// comes before it, has real moments to back up rather than an empty list.
function finishSetup() {
  for (const p of PRESETS) if (ob.selected.has(p.id) && !state.habits.some((h) => h.preset === p.id)) addPreset(p);
  save();
}

function refresh() { dirty = true; if (view === 'live') frame(); else render(); }

// Buttons shown on a reminder notification (Android). Snooze only when allowed.
function notifActions(o) {
  const a = [{ action: 'done', title: '✓ ' + t('done') }];
  if (E.canSnooze(o) === 'ok') a.push({ action: 'snooze', title: '💤 ' + t('snoozeMin', { n: state.settings.snoozeMinutes }) });
  return a;
}

function doDone(o, now, at) {
  const r = E.complete(o, now); if (!r) return false;
  if (at) U.sparkles(at.x, at.y);
  N.feedback('done'); N.dismiss(o.key);
  U.toast(r.early ? t('toastEarly', { n: r.pts }) : t('toastDone', { n: r.pts }), 'good');
  if (r.perfect) setTimeout(() => U.toast('🎉 ' + t('toastPerfectDay', { n: state.game.streak + 1 }), 'good', { ms: 3500 }), 700);
  refresh();
  return true;
}

function doSnooze(o, now) {
  const r = E.snooze(o, now); if (!r) return false;
  N.feedback('tap'); N.dismiss(o.key);
  U.toast('💤 ' + t('snoozedUntil', { t: fmtClock(r.start) }) + ' · ' + r.pts);
  refresh();
  return true;
}

// A Done / Snooze tapped on the notification itself (via sw.js), possibly
// long after it was shown: settle the world first, then act if still open.
function handleNotifAction(action, key) {
  frame();
  const o = occs.find((x) => x.key === key);
  if (!o || o.status !== 'open') return;
  if (action === 'done') doDone(o, Date.now());
  else if (action === 'snooze') doSnooze(o, Date.now());
}

// Exporting: straight into the remembered backup folder when there is one (desktop
// Chrome/Edge), else a native Save dialog, else the share sheet (mobile), else the
// classic <a download>. Always ends with a visible toast and a refreshed Setup
// screen so the "changes since your last backup" banner goes away right there.
// Returns true only once the data has actually been handed off somewhere.
async function exportData() {
  const when = Date.now();
  const text = exportJSON(when);
  const name = 'momen2m-' + fileStamp(new Date(when)) + '.json';
  const done = (where, quiet) => {
    markBackedUp(when);
    if (!quiet) U.toast(where ? t('exportedTo', { where }) : t('exported'), 'good', { ms: 5000 });
    if (view === 'setup') render();
    return true;
  };
  try {
    if (AutoImport.supported) {
      try {
        const folder = await AutoImport.writeToBackupFolder(name, text);
        if (folder !== null) return done((folder ? folder + ' › ' : '') + name);
      } catch (err) {
        console.warn('backup folder write failed, falling back to a dialog', err);
      }
    }
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: name,
          id: 'momen2m-backups', // shared with autobackup.js's folder picker
          startIn: 'downloads',  // so both dialogs tend to converge on one real folder
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
        });
        const w = await handle.createWritable();
        await w.write(text);
        await w.close();
        return done(handle.name || name);
      } catch (err) {
        if (err && err.name === 'AbortError') return false; // user cancelled the dialog
        // fall through to the next method
      }
    }
    const file = new File([text], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Momen2m' });
        return done(null, true); // the share sheet was the feedback
      } catch (err) {
        if (err && err.name === 'AbortError') return false; // user cancelled the share sheet
        // fall through to the next method
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return done(name);
  } catch (err) {
    console.error('export failed', err);
    U.toast(t('exportFailed'), 'bad');
    return false;
  }
}

// "moment"/"moments" pluralizes the same way in English and French.
const momentsLabel = (n) => n + ' moment' + (n === 1 ? '' : 's');

// Shows the Cancel/Replace confirmation and, once confirmed, applies the
// import through the usual validate + pre-import-snapshot path. `body` is
// pre-worded by the caller since a manual pick and an auto-found file read
// differently (the latter names the file; the user didn't just choose it).
function confirmAndApplyImport(text, body, parsed) {
  U.openConfirmSheet({
    title: t('importData'),
    body: body + U.diffHtml(diffStates(state, parsed)),
    confirmLabel: t('importReplace'),
    onConfirm: () => {
      try {
        importJSON(text); // re-validates and snapshots the current data first
        setLang(state.lang);
        U.toast(t('imported'), 'good');
        phases.clear(); refresh();
      } catch { U.toast(t('importFailed'), 'bad'); }
    },
  });
}

// Scans the remembered (or newly picked) backup folder for the newest file
// that looks like a Momen2m export, and offers to restore it — no manual
// browsing needed after the very first time.
async function runAutoImport(opts) {
  try {
    const found = await AutoImport.findLatestBackup(opts);
    if (!found) {
      U.toast(t('autoImportNone'), 'bad', { action: { label: t('changeBackupFolder'), fn: () => runAutoImport({ forceNewFolder: true }) }, ms: 6000 });
      return;
    }
    const label = momentsLabel(found.parsed.habits.length);
    const made = found.parsed.lastBackupAt || found.modified;
    const body = made
      ? t('autoImportFoundDated', { file: found.fileName, label, t: fmtDateTime(made) })
      : t('autoImportFound', { file: found.fileName, label });
    confirmAndApplyImport(found.text, body, found.parsed);
  } catch (err) {
    const kind = AutoImport.classifyError(err);
    if (kind === 'cancelled') return; // user closed the folder picker
    console.error('auto-import failed', err);
    const retry = { label: t('changeBackupFolder'), fn: () => runAutoImport({ forceNewFolder: true }) };
    if (kind === 'gesture') U.toast(t('autoImportTapAgain'), 'bad', { ms: 6000 });
    else U.toast(t(kind === 'blocked' ? 'autoImportBlocked' : 'autoImportFailed'), 'bad', { action: retry, ms: 9000 });
  }
}

// (Re)choose the backup folder without importing anything.
async function changeBackupFolder() {
  try {
    const dir = await AutoImport.pickFolder();
    U.toast(t('folderSet', { name: dir.name }), 'good', { ms: 5000 });
    if (view === 'setup') render();
  } catch (err) {
    const kind = AutoImport.classifyError(err);
    if (kind === 'cancelled') return;
    console.error('folder pick failed', err);
    U.toast(t(kind === 'gesture' ? 'autoImportTapAgain' : 'autoImportBlocked'), 'bad', { ms: 9000 });
  }
}

// ---- events (delegated) ------------------------------------------------------------
app.addEventListener('click', async (e) => {
  if (e.target.closest('[data-stop]')) return; // switches inside tappable rows
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const a = btn.dataset.action;
  N.unlockAudio();
  N.stopAlarm(); // any tap silences a strong alert
  const now = Date.now();

  switch (a) {
    case 'tab': view = btn.dataset.view; dirty = true; refresh(); scrollTo(0, 0); break;

    case 'done': {
      const o = findOcc(btn.dataset.key); if (!o) break;
      const b = btn.getBoundingClientRect();
      doDone(o, now, { x: b.left + b.width / 2, y: b.top + b.height / 2 });
      break;
    }
    case 'snooze': {
      const o = findOcc(btn.dataset.key); if (!o) break;
      if (!doSnooze(o, now)) shakeEl(btn);
      break;
    }
    case 'skip': {
      const o = findOcc(btn.dataset.key); if (!o) break;
      const r = E.skip(o, now); if (!r) break;
      N.dismiss(o.key);
      U.toast(t('skipped') + ' · ' + r.pts, 'bad');
      refresh(); break;
    }
    case 'undo': {
      const o = findOcc(btn.dataset.key); if (!o) break;
      if (E.undo(o)) { N.feedback('tap'); refresh(); }
      break;
    }
    case 'toggle-expand': {
      const key = btn.dataset.key; if (!key) break;
      if (expanded.has(key)) expanded.delete(key); else expanded.add(key);
      N.feedback('tap'); refresh();
      break;
    }
    case 'recap': {
      const o = findOcc(btn.dataset.key); if (!o) break;
      U.openRecapSheet(o, { onUndo: () => { if (E.undo(o)) { N.feedback('tap'); refresh(); } } });
      break;
    }
    case 'upcoming-detail': {
      const o = findOcc(btn.dataset.key); if (!o) break;
      U.openUpcomingSheet(o, {
        onDoNow: () => { doDone(o, now); },
        onSkip: () => {
          const r = E.skip(o, now); if (!r) return;
          N.dismiss(o.key);
          U.toast(t('skipped') + ' · ' + r.pts, 'bad');
          refresh();
        },
      });
      break;
    }
    case 'quick':
      U.openQuickSheet(({ name, emoji, minutes, importance }) => {
        const start = nowHM(new Date(now));
        state.habits.push({
          id: uid(), preset: null, name, emoji, desc: '', slots: [{ start, end: minutesToHM(parseHM(start) + minutes) }],
          days: [], importance, snooze: true, enabled: true, once: dayKey(new Date(now)), createdAt: now,
        });
        save(); N.feedback('tap'); refresh();
      });
      break;

    case 'add':
      U.openHabitSheet(null, (h) => {
        state.habits.push({ id: uid(), preset: null, once: null, createdAt: Date.now(), ...h });
        touchHabits(); save(); refresh();
      });
      break;
    case 'edit': {
      const h = findHabit(btn.dataset.id); if (!h) break;
      U.openHabitSheet(h, (data) => {
        // Keep translatable preset texts when the user did not change them.
        if (typeof h.name === 'object' && data.name === pick(h.name)) data.name = h.name;
        if (typeof h.desc === 'object' && data.desc === pick(h.desc)) data.desc = h.desc;
        Object.assign(h, data); touchHabits(); save(); refresh();
      },
        () => { state.habits = state.habits.filter((x) => x !== h); touchHabits(); save(); refresh(); });
      break;
    }
    case 'preset': {
      const p = PRESETS.find((x) => x.id === btn.dataset.preset);
      if (p && !state.habits.some((h) => h.preset === p.id)) { addPreset(p); save(); N.feedback('tap'); refresh(); }
      break;
    }
    case 'notif-enable': case 'ob-notif': {
      const r = await N.requestPermission();
      if (r === 'granted') { U.toast(t('obNotifGranted'), 'good'); N.notify(t('nTest'), t('nTestBody'), 'test'); }
      render(); break;
    }
    case 'notif-test': N.notify(t('nTest'), t('nTestBody'), 'test'); N.feedback('start'); break;
    case 'test-sound': N.testSound(); break;
    case 'test-vibration': N.testVibration(); break;
    case 'export': exportData(); break;
    case 'import': U.$('#importFile').click(); break;
    case 'import-auto': runAutoImport(); break;
    case 'change-folder': changeBackupFolder(); break;
    case 'reset':
      U.openResetSheet(
        async () => {
          const ok = await exportData();
          if (!ok) { U.toast(t('resetCancelled')); return; }
          resetAll(); setLang(state.lang); ob.step = 0; view = 'ob'; render();
        },
        () => { resetAll(); setLang(state.lang); ob.step = 0; view = 'ob'; render(); },
      );
      break;
    case 'restore-recovery': {
      const snap = getRecoverySnapshot();
      if (!snap) break;
      U.openConfirmSheet({
        title: t('restore'),
        body: t('restoreConfirm', { t: fmtDateTime(snap.at) }) + U.diffHtml(diffStates(state, snap.data)),
        confirmLabel: t('restore'),
        onConfirm: () => {
          snapshotRecovery('before-restore');
          restoreSnapshot(snap.data);
          setLang(state.lang);
          phases.clear();
          U.toast(t('restoreDone'), 'good');
          view = state.onboarded ? 'live' : 'ob';
          dirty = true;
          if (view === 'live') startTicker(); else render();
        },
      });
      break;
    }
    case 'check-update':
      btn.disabled = true;
      checkForUpdate(true).then((has) => { updateReady = has; U.toast(has ? t('updateAvailable') : t('upToDate'), has ? '' : 'good'); render(); });
      break;
    case 'apply-update': if (!applyUpdate()) location.reload(); break;
    case 'install':
      if (installPrompt) { installPrompt.prompt(); installPrompt.userChoice.then(() => { installPrompt = null; render(); }); }
      break;
    case 'restart-ob': ob.step = 0; view = 'ob'; render(); scrollTo(0, 0); break;

    // onboarding
    case 'ob-lang': state.lang = btn.dataset.lang; setLang(state.lang); save(); render(); break;
    case 'ob-preset': {
      const id = btn.dataset.preset;
      if (ob.selected.has(id)) ob.selected.delete(id); else ob.selected.add(id);
      btn.classList.toggle('on', ob.selected.has(id));
      break;
    }
    case 'ob-next':
      // Turn the picked presets into real habits before the backup step, so
      // "Back up now" there actually has something to back up.
      if (ob.step === 2) finishSetup();
      ob.step = Math.min(3, ob.step + 1); render(); scrollTo(0, 0);
      break;
    case 'ob-back': ob.step = Math.max(0, ob.step - 1); render(); scrollTo(0, 0); break;
    case 'ob-start':
      finishSetup();
      state.onboarded = true; save();
      view = 'live'; dirty = true; startTicker(); scrollTo(0, 0);
      break;
    default: break;
  }
});

app.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'importFile') {
    const f = el.files && el.files[0];
    el.value = ''; // let the same file be picked again later
    if (!f) return;
    f.text().then((text) => {
      let parsed;
      try {
        parsed = JSON.parse(text);
        if (!parsed || !Array.isArray(parsed.habits)) throw new Error('bad');
      } catch {
        U.toast(t('importFailed'), 'bad');
        return;
      }
      const label = momentsLabel(parsed.habits.length);
      const made = parsed.lastBackupAt || f.lastModified;
      const body = made ? t('importConfirmDated', { label, t: fmtDateTime(made) }) : t('importConfirm', { label });
      confirmAndApplyImport(text, body, parsed);
    }).catch(() => U.toast(t('importFailed'), 'bad'));
    return;
  }
  if (el.dataset.action === 'toggle') {
    const h = findHabit(el.dataset.id); if (!h) return;
    h.enabled = el.checked; touchHabits(); save();
    el.closest('.item').classList.toggle('off', !h.enabled);
    return;
  }
  const key = el.dataset.setting;
  if (!key) return;
  if (key === 'lang') { state.lang = el.value; setLang(state.lang); save(); render(); return; }
  state.settings[key] = el.type === 'checkbox' ? el.checked : STRING_SETTINGS.has(key) ? el.value : Number(el.value);
  save();
  // Some rows depend on others (critical toggle, pattern lock): redraw them.
  if (key === 'alertStyle' || key === 'vibSync') render();
  // Preview as you go, so picking a tone or a volume is immediate.
  if (key === 'soundName' || key === 'volume') { N.unlockAudio(); N.playTone(false); N.vibrate(N.vibrationPattern(false)); }
  if (key === 'vibPattern') N.testVibration();
});
const STRING_SETTINGS = new Set(['alertStyle', 'soundName', 'soundOutput', 'vibPattern']);

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') U.closeSheet(); });

// ---- notification buttons -----------------------------------------------------------------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.type === 'NOTIF_ACTION' && d.action && d.key) handleNotifAction(d.action, d.key);
  });
}

// ---- install & updates ------------------------------------------------------------------
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; if (view !== 'live') render(); });
addEventListener('appinstalled', () => { installPrompt = null; if (view !== 'live') render(); });

initUpdates(() => {
  updateReady = true;
  U.toast(t('updateAvailable'), '', { action: { label: t('updateNow'), fn: applyUpdate }, ms: 8000 });
  if (view === 'live') { dirty = true; frame(); } else render();
});

// ---- boot -------------------------------------------------------------------------------
if (view === 'live') startTicker(); else render();
const params = new URLSearchParams(location.search);
if (params.has('quick') && state.onboarded) {
  history.replaceState(null, '', location.pathname);
  setTimeout(() => U.$('.fab') && U.$('.fab').click(), 300);
}
if (params.get('notif') && params.get('key') && state.onboarded) {
  history.replaceState(null, '', location.pathname);
  setTimeout(() => handleNotifAction(params.get('notif'), params.get('key')), 200);
}
