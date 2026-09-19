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
import { versionsSince } from './changelog.js';
import { defaultAnswers, proposeMoments, QUESTIONS, clampCount } from './setup.js';
import { dayKey, addDays, at, nowHM, minutesToHM, parseHM, fmtDuration, fmtClock, fmtDateTime, fileStamp } from './time.js';
import * as AutoImport from './autobackup.js';
import { diffStates } from './diff.js';
import * as G from './game.js';
import { drawShareCard, share } from './share.js';
import * as Push from './push.js';

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
let checkingUpdate = false;
let badgePage = 0;
// First-run questionnaire state: answers, the proposals computed from them,
// which presets are picked, and whether a re-run already saved a recovery
// snapshot of the previous setup.
const ob = { step: 0, a: defaultAnswers(), proposals: [], selected: new Set(), snapshotted: false };
const OB_LAST = 5;
function resetOb() {
  Object.assign(ob, { step: 0, a: defaultAnswers(), proposals: [], selected: new Set(), snapshotted: false });
}

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
    encourageIfRoughPatch(Date.now());
  },
};

// ---- render loop -----------------------------------------------------------------
function render(now = Date.now()) {
  dirty = false;
  if (view === 'ob') {
    app.innerHTML = U.renderOnboarding(ob.step, {
      a: ob.a, proposals: ob.proposals, selected: ob.selected,
      again: state.onboarded, existing: new Map(state.habits.filter((h) => h.preset).map((h) => [h.preset, h])),
      isIosBrowser, canInstall: !!installPrompt, standalone, canAutoImport: AutoImport.supported,
    });
  } else if (view === 'moments') {
    app.innerHTML = U.renderMoments({ needsBackup: needsBackup() });
  } else if (view === 'setup') {
    app.innerHTML = U.renderSetup({
      version: VERSION, updateReady, checkingUpdate, canInstall: !!installPrompt, isIosBrowser,
      needsBackup: needsBackup(), recovery: getRecoverySnapshot(), canAutoImport: AutoImport.supported,
      push: Push.supported() ? { ...Push.info(), caveat: Push.caveat() } : null,
    });
  } else if (view === 'progress') {
    occs = E.buildOccurrences(now);
    const stats = G.computeStats(now, occs);
    G.unlockBadges(stats, now); // persist anything already earned (e.g. history from before badges existed), quietly
    app.innerHTML = U.renderProgress(stats, now, badgePage);
  } else {
    for (const o of occs) o.fresh = fresh.has(o.key);
    fresh.clear();
    const tmrw = addDays(dayKey(new Date(now)), 1);
    app.innerHTML = U.renderLive(occs, now, {
      updateReady, recovery: state.habits.length ? null : getRecoverySnapshot(), expanded,
      tomorrow: state.habits.filter((h) => h.once === tmrw && h.enabled !== false),
    });
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
  if (changed) Push.syncSoon();
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
  if (document.hidden) { stopTicker(); scheduleWake(); Push.sync(false, true); } else { startTicker(); }
});

// ---- helpers -----------------------------------------------------------------------
const findOcc = (key) => occs.find((o) => o.key === key);
const findHabit = (id) => state.habits.find((h) => h.id === id);
const shakeEl = (el) => { el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 500); };

// Premade one-time moments: same emoji + name replaces the earlier one (by
// key, excluding the template being edited itself), so tuning a premade or
// re-saving one from quick-add never piles up copies.
function upsertTemplate(id, { name, emoji, minutes, importance }) {
  const key = G.momentKey({ name, emoji });
  state.templates = state.templates.filter((x) => x.id !== id && G.momentKey(x) !== key);
  state.templates.push({ id: id || uid(), name, emoji, minutes, importance });
  save();
}

function addPreset(p, slots = p.slots.map(([start, end]) => ({ start, end }))) {
  const h = {
    id: uid(), preset: p.id, name: p.name, desc: p.desc, emoji: p.emoji, slots,
    days: [0, 1, 2, 3, 4, 5, 6], importance: p.importance, snooze: true, enabled: true, once: null, createdAt: Date.now(),
  };
  state.habits.push(h);
  touchHabits();
  return h;
}

// Adds the presets picked during onboarding to real habits (idempotent: safe to
// call more than once). Kept separate from 'ob-start' so the backup step, which
// comes before it, has real moments to back up rather than an empty list.
function finishSetup() {
  if (!ob.proposals.length) ob.proposals = proposeMoments(ob.a);
  // The answers define the preset moments: kept ones keep their id (so their
  // history and points), unpicked ones go, the user's own moments are untouched.
  // On a re-run the previous setup is recoverable from Setup > Data.
  if (state.onboarded && !ob.snapshotted) { snapshotRecovery('setup'); ob.snapshotted = true; }
  const dropping = state.habits.some((h) => h.preset && !ob.selected.has(h.preset));
  if (dropping) { state.habits = state.habits.filter((h) => !h.preset || ob.selected.has(h.preset)); touchHabits(); }
  for (const x of ob.proposals) {
    if (!ob.selected.has(x.preset.id)) continue;
    const existing = state.habits.find((h) => h.preset === x.preset.id);
    if (existing) { existing.slots = x.slots; touchHabits(); } else addPreset(x.preset, x.slots);
  }
  save();
}

function obAdvance() {
  if (ob.step === 2) {
    ob.proposals = proposeMoments(ob.a);
    ob.selected = new Set(ob.proposals.filter((x) => x.proposed).map((x) => x.preset.id));
  }
  // Nothing is applied until the last page validates it (Start, or Back up now).
  ob.step = Math.min(OB_LAST, ob.step + 1); render(); scrollTo(0, 0);
}

function refresh() { dirty = true; if (view === 'live') frame(); else render(); Push.syncSoon(); }

// Buttons shown on a reminder notification (Android). Snooze only when allowed.
function notifActions(o) {
  const a = [{ action: 'done', title: '✓ ' + t('done') }];
  if (E.canSnooze(o) === 'ok') a.push({ action: 'snooze', title: '💤 ' + t('snoozeMin', { n: state.settings.snoozeMinutes }) });
  return a;
}

function doDone(o, now, at) {
  const levelBefore = E.levelFor(state.game.xp);
  const r = E.complete(o, now); if (!r) return false;
  if (at) U.sparkles(at.x, at.y);
  N.feedback('done'); N.dismiss(o.key);
  refresh();
  // Feedback ladder: points (+ praise), combo, perfect day, level up, badges.
  const praise = t('praise');
  const line = (r.boost ? '⚡ ' : '') + (r.early ? t('toastEarly', { n: r.pts }) : t('toastDone', { n: r.pts })) + ' · ' + praise[state.game.done % praise.length];
  U.toast(line, 'good');
  let delay = 700;
  const combo = G.todayCombo(occs, now);
  if (combo >= 2 && !r.perfect) { setTimeout(() => U.toast('🔥 ' + t('toastCombo', { n: combo })), delay); delay += 900; }
  if (r.perfect) { setTimeout(() => U.toast('🎉 ' + t('toastPerfectDay', { n: state.game.streak + 1 }), 'good', { ms: 3500 }), delay); delay += 900; }
  const levelAfter = E.levelFor(state.game.xp);
  if (levelAfter > levelBefore) {
    const ranks = t('rankNames');
    const rank = ranks[G.levelInfo(state.game.xp, ranks.length).rankIdx];
    setTimeout(() => {
      N.feedback('levelup'); U.celebrate(['⭐', '🌟', '✨', '💫']);
      U.toast('⬆️ ' + t('toastLevelUp', { n: levelAfter, rank }), 'good', { ms: 4500, action: { label: t('see'), fn: () => showProgress() } });
    }, delay);
    delay += 1200;
  }
  celebrateBadges(delay);
  return true;
}

// Persists any newly earned badge and announces it. Safe to call often.
function celebrateBadges(delay = 0) {
  const fresh = G.unlockBadges(G.computeStats(Date.now(), occs));
  fresh.forEach((b, i) => setTimeout(() => {
    N.feedback('badge'); U.celebrate([b.emoji, '🏅', '✨']);
    U.toast(b.emoji + ' ' + t('toastBadge', { name: t('badgeNames')[b.id] }), 'good', { ms: 4500, action: { label: t('see'), fn: () => showProgress() } });
  }, delay + i * 1300));
  return fresh.length;
}

function showProgress() { view = 'progress'; dirty = true; render(); scrollTo(0, 0); }

// Three misses in a row today (nothing done in between) is a rough patch, not
// a character flaw: one warm nudge per day, plus a 12 h +50 % points boost so
// that getting back on track pays off right away.
function encourageIfRoughPatch(now) {
  const today = dayKey(new Date(now));
  if (state.game.lastEncouraged === today) return;
  const resolved = E.buildOccurrences(now).filter((o) => o.day === today && o.status !== 'open' && o.at).sort((a, b) => a.at - b.at);
  let run = 0;
  for (let i = resolved.length - 1; i >= 0; i--) { if (resolved[i].status === 'missed') run++; else break; }
  if (run < 3) return;
  const msgs = t('encouragements');
  const msg = msgs[(state.game.missed || run) % msgs.length];
  state.game.lastEncouraged = today;
  const until = E.grantBoost(now);
  setTimeout(() => {
    N.feedback('badge');
    U.celebrate(['⚡', '💙', '✨']);
    U.toast('💙 ' + msg + ' ' + t('boostGranted', { until: fmtClock(until) }), 'good', {
      ms: 8000,
      action: { label: t('see'), fn: () => U.openExplainSheet('today', G.computeStats(Date.now(), occs), occs) },
    });
  }, 1200);
  dirty = true;
}

// ---- sharing -------------------------------------------------------------------
const APP_URL = 'https://purgator.github.io/Momen2m/';

async function shareProgress(badge) {
  const now = Date.now();
  const s = G.computeStats(now, occs);
  const ranks = t('rankNames');
  const rank = ranks[s.level.rankIdx];
  const title = badge ? badge.emoji + ' ' + t('badgeNames')[badge.id] : t('level', { n: s.level.level }) + ' · ' + rank;
  const text = badge
    ? t('shareBadgeText', { name: t('badgeNames')[badge.id], level: s.level.level, rank })
    : t('shareText', { level: s.level.level, rank, streak: s.streak, done: s.lifetime.done, rate: s.period.rate === null ? '–' : Math.round(s.period.rate * 100) + '%' });
  let canvas = null;
  try {
    const today = dayKey(new Date(now));
    canvas = drawShareCard(null, {
      title, subtitle: badge ? t('badgeDescs')[badge.id] : t('shareSubtitle', { done: s.lifetime.done }),
      stats: [
        { value: '🔥 ' + s.streak, label: t('streakWord') },
        { value: '✅ ' + s.lifetime.done, label: t('doneWord') },
        { value: '🎯 ' + (s.period.rate === null ? '–' : Math.round(s.period.rate * 100) + '%'), label: t('successRate') },
        { value: '⚡ ' + s.lifetime.early, label: t('earlyWord') },
      ],
      week: s.week.map((d) => ({ value: d.pts, label: t('dayLetters')[new Date(d.day + 'T12:00').getDay()], today: d.day === today })),
      footer: APP_URL.replace('https://', ''),
      dark: !matchMedia('(prefers-color-scheme: light)').matches,
    });
  } catch (err) { console.warn('share card failed', err); }
  const res = await share({ text, url: APP_URL, canvas, fileName: badge ? 'momen2m-badge-' + badge.id + '.png' : 'momen2m-progress.png' });
  if (res === 'cancelled' || res === false) { if (res === false) U.toast(t('shareFailed'), 'bad'); return; }
  state.game.shares = (state.game.shares || 0) + 1; save();
  U.toast(t(res === 'shared' ? 'shared' : res === 'copied' ? 'sharedCopied' : 'sharedDownloaded'), 'good', { ms: 3500 });
  celebrateBadges(600);
  if (view === 'progress') render();
}

async function shareApp() {
  const res = await share({ text: t('inviteText'), url: APP_URL });
  if (res === 'shared' || res === 'copied') U.toast(t(res === 'shared' ? 'shared' : 'sharedCopied'), 'good');
  else if (res === false) U.toast(t('shareFailed'), 'bad');
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
  // One overwritten file by default: no pile of backups to sort through when
  // restoring. Dated files are opt-in (Setup > Data).
  const name = state.settings.backupSingleFile ? 'momen2m-backup.json' : 'momen2m-' + fileStamp(new Date(when)) + '.json';
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
        phases.clear();
        // A backup loaded from the welcome screen skips the rest of the setup.
        if (view === 'ob' && state.onboarded) { view = 'live'; dirty = true; startTicker(); } else refresh();
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

// Moves the badge grid by `delta` pages, clamped to the badge count, and
// re-renders. Shared by the ‹/› buttons and the swipe gesture below.
function changeBadgePage(delta) {
  const pages = Math.ceil(G.BADGES.length / G.BADGE_PAGE);
  const next = Math.max(0, Math.min(pages - 1, badgePage + delta));
  if (next === badgePage) return;
  badgePage = next;
  N.feedback('tap');
  render();
}

// ---- swipe (badges grid) -----------------------------------------------------------
// A left/right swipe on the badge grid pages it, same as the ‹/› buttons.
let swipeStart = null;
app.addEventListener('touchstart', (e) => {
  const grid = e.target.closest('.badges');
  if (!grid || e.touches.length !== 1) { swipeStart = null; return; }
  const touch = e.touches[0];
  swipeStart = { x: touch.clientX, y: touch.clientY };
}, { passive: true });
app.addEventListener('touchend', (e) => {
  if (!swipeStart) return;
  const touch = e.changedTouches[0];
  const dx = touch.clientX - swipeStart.x;
  const dy = touch.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return; // not a clean horizontal swipe
  changeBadgePage(dx < 0 ? 1 : -1);
}, { passive: true });

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
    case 'explain': U.openExplainSheet(btn.dataset.topic, G.computeStats(now, occs), occs); N.feedback('tap'); break;
    case 'badge': {
      const b = G.BADGES.find((x) => x.id === btn.dataset.id); if (!b) break;
      const p = G.badgeProgress(b, G.computeStats(now, occs));
      U.openBadgeSheet(b, p, { onShare: () => shareProgress(b) });
      break;
    }
    case 'share-progress': shareProgress(); break;
    case 'share-app': shareApp(); break;

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
      U.openRecapSheet(o, {
        onUndo: () => { if (E.undo(o)) { N.feedback('tap'); refresh(); } },
        latePts: E.latePts(o, now),
        onLate: E.canCompleteLate(o, now) ? () => {
          const r = E.completeLate(o, now);
          if (!r) return;
          N.feedback('tap');
          U.toast('🩹 ' + t('doneLateToast', { pts: (r.pts >= 0 ? '+' : '') + r.pts }), 'good');
          refresh(); celebrateBadges(600);
        } : undefined,
      });
      break;
    }
    case 'badge-page': {
      changeBadgePage(Number(btn.dataset.d));
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
      U.openQuickSheet(({ name, emoji, minutes, importance, start, tomorrow, saveTemplate }) => {
        const day = dayKey(new Date(now));
        const id = uid();
        const h = {
          id, preset: null, name, emoji, desc: '', slots: [{ start, end: minutesToHM((parseHM(start) + minutes) % 1440) }],
          days: [], importance, snooze: true, enabled: true, once: tomorrow ? addDays(day, 1) : day, createdAt: now,
        };
        if (G.nameConflict(h)) { U.toast(t('nameTaken'), 'bad'); return false; }
        if (saveTemplate) upsertTemplate(null, { name, emoji, minutes, importance });
        state.habits.push(h);
        save(); N.feedback('tap'); refresh();
        const text = tomorrow ? '📅 ' + t('quickAddedTomorrow', { t: fmtClock(at(addDays(day, 1), start)) })
          : parseHM(start) > parseHM(nowHM(new Date(now))) ? '⏰ ' + t('quickAddedLater', { t: fmtClock(at(day, start)) })
          : '✅ ' + t('quickAdded');
        // Ten seconds to take it back at no cost: the moment simply never existed.
        U.toast(text, '', { ms: 10000, action: { label: t('undo'), fn: () => {
          state.habits = state.habits.filter((h) => h.id !== id);
          for (const d of Object.values(state.days)) for (const k of Object.keys(d)) if (k.startsWith(id + '#')) delete d[k];
          phases.clear(); save(); refresh();
        } } });
      }, { templates: state.templates, onSaveTemplate: (d) => { upsertTemplate(null, d); U.toast(t('templateSaved'), 'good'); } });
      break;

    case 'add':
      U.openHabitSheet(null, (h) => {
        const nh = { id: uid(), preset: null, once: null, createdAt: Date.now(), ...h };
        if (G.nameConflict(nh)) { U.toast(t('nameTaken'), 'bad'); return false; }
        state.habits.push(nh);
        touchHabits(); save(); refresh();
      });
      break;
    case 'edit': {
      const h = findHabit(btn.dataset.id); if (!h) break;
      U.openHabitSheet(h, (data) => {
        // Keep translatable preset texts when the user did not change them.
        if (typeof h.name === 'object' && data.name === pick(h.name)) data.name = h.name;
        if (typeof h.desc === 'object' && data.desc === pick(h.desc)) data.desc = h.desc;
        if (G.nameConflict({ ...h, ...data })) { U.toast(t('nameTaken'), 'bad'); return false; }
        Object.assign(h, data); touchHabits(); save(); refresh();
      },
        () => { state.habits = state.habits.filter((x) => x !== h); touchHabits(); save(); refresh(); });
      break;
    }
    case 'tpl-del':
      state.templates = state.templates.filter((x) => x.id !== btn.dataset.id);
      save(); render();
      break;
    case 'tpl-add':
      // Same identity as quick-add's own "Save as premade": matching an
      // existing premade replaces it rather than warning, so tuning one by
      // re-creating it with the same emoji + name just works.
      U.openTemplateSheet(null, (d) => { upsertTemplate(null, d); render(); });
      break;
    case 'tpl-edit': {
      const tpl = state.templates.find((x) => x.id === btn.dataset.id); if (!tpl) break;
      U.openTemplateSheet(tpl, (d) => { upsertTemplate(tpl.id, d); render(); },
        () => { state.templates = state.templates.filter((x) => x.id !== tpl.id); save(); render(); });
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
    case 'push-sync': Push.sync(true).then((ok) => { U.toast(ok ? t('pushSyncedNow') : t('pushFailed'), ok ? 'good' : 'bad'); render(); }); break;
    case 'test-sound': N.testSound(); break;
    case 'test-vibration': N.testVibration(); break;
    case 'export':
      // On the setup's last page, backing up validates the setup first, so the file holds it.
      if (view === 'ob') finishSetup();
      exportData();
      break;
    case 'import': U.$('#importFile').click(); break;
    case 'import-auto': runAutoImport(); break;
    case 'change-folder': changeBackupFolder(); break;
    case 'reset':
      U.openResetSheet(
        async () => {
          const ok = await exportData();
          if (!ok) { U.toast(t('resetCancelled')); return; }
          resetAll(); setLang(state.lang); resetOb(); view = 'ob'; render();
        },
        () => { resetAll(); setLang(state.lang); resetOb(); view = 'ob'; render(); },
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
      if (checkingUpdate) break;
      checkingUpdate = true;
      render();
      checkForUpdate(true).then((has) => {
        checkingUpdate = false;
        updateReady = has;
        // A real update was found: the same background listener that would
        // announce it in the live view already showed the "update ready"
        // toast with its own action button, so don't repeat it here.
        if (!has) U.toast(t('upToDate'), 'good');
        render();
      });
      break;
    case 'apply-update': if (!applyUpdate()) location.reload(); break;
    case 'install':
      if (installPrompt) { installPrompt.prompt(); installPrompt.userChoice.then(() => { installPrompt = null; render(); }); }
      break;
    case 'restart-ob': resetOb(); view = 'ob'; render(); scrollTo(0, 0); break;

    // onboarding
    case 'ob-lang': state.lang = btn.dataset.lang; setLang(state.lang); save(); render(); break;
    case 'ob-preset': {
      const id = btn.dataset.preset;
      if (ob.selected.has(id)) ob.selected.delete(id); else ob.selected.add(id);
      if (state.onboarded) render(); else btn.classList.toggle('on', ob.selected.has(id));
      break;
    }
    case 'ob-work': ob.a.work = btn.dataset.v === 'yes'; render(); break;
    case 'ob-answer': {
      const q = ob.a.q[btn.dataset.q];
      q.v = q.v === btn.dataset.v ? null : btn.dataset.v; // tap again to clear
      render();
      break;
    }
    case 'ob-count': {
      const def = QUESTIONS.find((x) => x.id === btn.dataset.q);
      const q = ob.a.q[def.id];
      q.n = clampCount(def, q.n + Number(btn.dataset.d));
      render();
      break;
    }
    case 'ob-skip':
      if (ob.step === 1) Object.assign(ob.a, { wake: '07:00', bed: '22:30', work: null });
      if (ob.step === 2) for (const q of Object.values(ob.a.q)) q.v = null;
      if (ob.step === 3) ob.selected.clear();
      obAdvance();
      break;
    case 'ob-next': obAdvance(); break;
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
  if (el.dataset.ob) { ob.a[el.dataset.ob] = el.value; return; }
  if (el.dataset.obPick) {
    if (el.checked) ob.selected.add(el.dataset.obPick); else ob.selected.delete(el.dataset.obPick);
    if (state.onboarded) render(); // re-run: the row's colour says what the switch now means
    return;
  }
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
  if (el.dataset.action === 'push-toggle') {
    const on = el.checked;
    el.disabled = true;
    (on ? Push.enable() : Push.disable()).then(() => {
      U.toast(on ? t('pushEnabled') : t('pushDisabled'), on ? 'good' : '');
    }).catch((err) => {
      console.error('push toggle failed', err);
      U.toast(t(String(err && err.message) === 'permission' ? 'pushNeedsPermission' : 'pushFailed'), 'bad', { ms: 6000 });
    }).finally(() => render());
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
    if (e.data && e.data.type === 'PUSH') { if (view === 'live') frame(); else if (view === 'progress') render(); return; }
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

// This boot landed on a different version than the last one (the service
// worker applied an update, in the background or via "Update now", and
// reloaded): say so once, then forget the old version.
if (state.lastSeenVersion && state.lastSeenVersion !== VERSION) {
  if (state.settings.updateSummaries) {
    const notes = versionsSince(state.lastSeenVersion, VERSION, getLang());
    setTimeout(() => U.openUpdateSheet(VERSION, notes, (dontShow) => {
      if (dontShow) { state.settings.updateSummaries = false; save(); if (view === 'setup') render(); }
    }), 300);
  } else U.toast(t('updatedTo', { v: VERSION }), 'good');
}
state.lastSeenVersion = VERSION;
save();

// Badges: the first run after they were introduced persists everything already
// earned quietly (no toast barrage over old history); later boots announce what
// settled overnight, e.g. a streak badge earned while the app was closed.
if (state.onboarded) {
  if (!state.game.badgesInit) {
    G.unlockBadges(G.computeStats(Date.now(), occs.length ? occs : E.buildOccurrences(Date.now())));
    state.game.badgesInit = true; save();
  } else {
    setTimeout(() => celebrateBadges(), 1200);
  }
}
const params = new URLSearchParams(location.search);
if (params.has('quick') && state.onboarded) {
  history.replaceState(null, '', location.pathname);
  setTimeout(() => U.$('.fab') && U.$('.fab').click(), 300);
}
if (params.get('notif') && params.get('key') && state.onboarded) {
  history.replaceState(null, '', location.pathname);
  setTimeout(() => handleNotifAction(params.get('notif'), params.get('key')), 200);
}
