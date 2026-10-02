// Small HTML builders shared by the renderers (ui.js) and the sheets (sheets.js).
import { esc } from './dom.js';
import { t, pick } from './i18n.js';
import { state } from './store.js';
import { fmtClock, parseHM, weekday } from './time.js';

export function habitName(h) { return esc(pick(h.name)); }
export function habitDesc(h) { return esc(pick(h.desc || '')); }

export function slotsText(h) {
  return esc((h.slots || []).map((s) => s.start + '–' + s.end).join(' · '));
}

export function daysText(h) {
  if (h.once) return t('today');
  const d = h.days || [];
  if (d.length === 7) return t('everyDay');
  if (d.length === 5 && !d.includes(0) && !d.includes(6)) return t('weekdays');
  if (d.length === 2 && d.includes(0) && d.includes(6)) return t('weekends');
  const names = t('days');
  return d.slice().sort().map((i) => names[i]).join(' ');
}

export function slotOf(o) {
  return fmtClock(o.start) + ' – ' + fmtClock(o.end);
}
export const dayLetter = (day) => t('dayLetters')[weekday(day)];
export const dayNames = () => t('days');

// A settings row: label (+ optional sub line) and a control. The control's
// first input/select gets the label as its accessible name unless it has one.
export function toggleRow(label, sub, control, cls = '') {
  const name = esc(label.replace(/<[^>]*>/g, '').trim());
  const named = /aria-label=/.test(control) ? control : control.replace(/<(input|select)\b/, `<$1 aria-label="${name}"`);
  return `<div class="toggle ${cls}"><div><div class="t">${label}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>${named}</div>`;
}
// A clock input with a one-word caption under it (Setup's "Your day").
export function timeIn(setting, value, caption) {
  return `<label class="tin"><input class="input" type="time" data-setting="${setting}" value="${esc(value)}" aria-label="${caption}"><small>${caption}</small></label>`;
}
export function sw(setting, on) {
  return `<label class="switch"><input type="checkbox" data-setting="${setting}" ${on ? 'checked' : ''}><span></span></label>`;
}
export function sel(setting, options, value, disabled = false) {
  return `<select data-setting="${setting}" ${disabled ? 'disabled' : ''}>${options.map(([v, l]) => `<option value="${v}" ${String(v) === String(value) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
}

// Minutes between start and end, across midnight if needed (a 0-length slot counts as a full day).
export function durationOf(s) {
  return ((parseHM(s.end) - parseHM(s.start)) % 1440 + 1440) % 1440 || 1440;
}

// One time slot, either "start → end" or "start + duration". Both read back as
// {start, end}: the stored model never changes, only the way it is typed.
export function slotRow(s, i, mode = state.settings.slotMode) {
  if (mode === 'dur') {
    return `<div class="slot dur" data-slot="${i}">
      <input class="input" type="time" value="${esc(s.start)}" data-f="start" required>
      <div class="durctl"><input class="input" type="number" inputmode="numeric" min="1" max="1440" step="5" value="${durationOf(s)}" data-f="dur" required><span class="unit">min</span></div>
      <button class="iconbtn" data-rm="${i}" aria-label="${t('delete')}">✕</button>
    </div>`;
  }
  return `<div class="slot" data-slot="${i}">
    <input class="input" type="time" value="${esc(s.start)}" data-f="start" required>
    <span class="arrow">→</span>
    <input class="input" type="time" value="${esc(s.end)}" data-f="end" required>
    <button class="iconbtn" data-rm="${i}" aria-label="${t('delete')}">✕</button>
  </div>`;
}
