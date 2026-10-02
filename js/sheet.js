// The bottom sheet: one at a time, with the phone's back button wired in.
// Also the small confirm dialog that floats above a sheet.
import { $, esc } from './dom.js';
import { t } from './i18n.js';

let sheetEl = null, backdropEl = null, dismissCb = null;
export function sheetOpen() { return !!sheetEl; }
function teardown() {
  const s = sheetEl, b = backdropEl;
  sheetEl = backdropEl = null; dismissCb = null;
  s.classList.remove('open'); b.classList.remove('open');
  setTimeout(() => { s.remove(); b.remove(); }, 260);
}
// Sheets and the phone's back button. A sheet owns one history entry, so back
// closes it instead of the app; a child sheet (the step editor over the quest
// editor) owns one more, so back returns to its parent. Two rules keep Android
// happy: an entry is only pushed right after a tap (Chrome flags entries the
// page adds on its own as skippable, and then a later back skips the tab under
// them and leaves the app), and the back handler never pushes — returning to a
// parent reuses the parent's entry. Our own history.go() calls are counted so
// the popstate they cause is ignored, and a close from a button pops a moment
// later, so a sheet opened right after (Edit, Share) takes the entry over.
let depth = 0;        // sheet entries on the history stack, as far as we know
let dropTimer = 0;    // pending pop of the entry a just-closed sheet left behind
let ownPops = 0;      // traversals we started, whose popstate is still to come
const tapped = () => !navigator.userActivation || navigator.userActivation.isActive;
function go(n) { if (!n) return; ownPops++; depth += n; history.go(n); }
export function closeSheet() {
  if (!sheetEl) return;
  teardown();
  if (depth > 0 && !dropTimer) dropTimer = setTimeout(() => { dropTimer = 0; if (!sheetEl) go(-depth); }, 0);
}
// Leaving a sheet without choosing (tap outside, Escape): the sheet may have
// something to do about it (go back to a parent sheet, record a checkbox).
export function dismissSheet() {
  const cb = dismissCb;
  closeSheet();
  if (cb) cb();
}
// app.js calls this on popstate; true means the event was about a sheet.
export function handlePop() {
  if (ownPops > 0) { ownPops--; return true; }
  if (depth > 0) { // the phone's back: the top sheet's entry is already gone
    depth--;
    const cb = dismissCb; if (sheetEl) teardown();
    if (cb) cb();
    return true;
  }
  if (sheetEl) { // a sheet with no entry (opened on its own, not after a tap): close it, stay on this tab
    const cb = dismissCb; teardown();
    if (cb) cb();
    go(1);
    return true;
  }
  return false;
}
export function openSheet(html, onDismiss = null) {
  const child = !!sheetEl && !!onDismiss; // opened over a parent it returns to: its own entry
  if (dropTimer) { clearTimeout(dropTimer); dropTimer = 0; }
  if (sheetEl) teardown();
  dismissCb = onDismiss;
  const target = child ? depth + 1 : Math.min(depth, 1) || (tapped() ? 1 : 0);
  if (target > depth) { history.pushState({ ...(history.state || {}), sheet: target }, ''); depth = target; }
  else if (target < depth) go(target - depth);
  backdropEl = document.createElement('div'); backdropEl.className = 'backdrop';
  sheetEl = document.createElement('div'); sheetEl.className = 'sheet';
  sheetEl.setAttribute('role', 'dialog'); sheetEl.setAttribute('aria-modal', 'true');
  sheetEl.innerHTML = `<div class="grab"></div>${html}`;
  document.body.append(backdropEl, sheetEl);
  backdropEl.addEventListener('click', dismissSheet);
  const b = backdropEl, sh = sheetEl;
  requestAnimationFrame(() => { b.classList.add('open'); sh.classList.add('open'); });
  return sheetEl;
}

// A yes/no question over whatever is on screen (a sheet included — sheets are
// one at a time, so this is its own layer). Resolves true on confirm; false on
// cancel, tap outside or Escape. Replaces the native confirm().
let dialogEl = null, dialogResolve = null;
export function dialogOpen() { return !!dialogEl; }
export function confirmDialog(body, { title = '', okLabel = t('ok'), danger = false } = {}) {
  if (dialogEl) closeDialog(false);
  return new Promise((resolve) => {
    dialogResolve = resolve;
    dialogEl = document.createElement('div');
    dialogEl.className = 'dialog-wrap';
    dialogEl.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true">${title ? `<h3>${esc(title)}</h3>` : ''}<p>${esc(body)}</p>
      <div class="btnrow"><button class="btn ghost" data-no>${t('cancel')}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(okLabel)}</button></div></div>`;
    dialogEl.addEventListener('click', (e) => { if (e.target === dialogEl || e.target.closest('[data-no]')) closeDialog(false); else if (e.target.closest('[data-yes]')) closeDialog(true); });
    document.body.append(dialogEl);
    requestAnimationFrame(() => dialogEl && dialogEl.classList.add('open'));
    setTimeout(() => { const b = dialogEl && $('[data-yes]', dialogEl); if (b) b.focus(); }, 50);
  });
}
export function closeDialog(answer = false) {
  if (!dialogEl) return;
  const el = dialogEl, done = dialogResolve;
  dialogEl = null; dialogResolve = null;
  el.classList.remove('open'); setTimeout(() => el.remove(), 200);
  if (done) done(answer);
}
