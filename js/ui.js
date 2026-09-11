// Rendering. Pure functions from state to HTML strings, plus a few DOM helpers
// (bottom sheet, toasts, sparkles). Behaviour lives in app.js via data-action.
import { t, pick, getLang } from './i18n.js';
import { state } from './store.js';
import { PRESETS } from './presets.js';
import { suggestEmoji } from './emoji.js';
import { BASE_PTS, canSnooze, currentOf, levelFor, xpForLevel, todayPoints } from './engine.js';
import { fmtClock, fmtCountdown, fmtDuration, nowHM, minutesToHM, parseHM } from './time.js';
import { permission } from './notify.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const RING_R = 70;
const RING_C = 2 * Math.PI * RING_R;

// ---- shared bits ------------------------------------------------------------

export function tabbar(view) {
  return `<nav class="tabbar">
    <button class="tab ${view === 'live' ? 'on' : ''}" data-action="tab" data-view="live"><span class="ico">⏱️</span>${t('tabNow')}</button>
    <button class="tab ${view === 'setup' ? 'on' : ''}" data-action="tab" data-view="setup"><span class="ico">🎛️</span>${t('tabSetup')}</button>
  </nav>`;
}

function habitName(h) { return esc(pick(h.name)); }
function habitDesc(h) { return esc(pick(h.desc || '')); }

function slotsText(h) {
  return (h.slots || []).map((s) => s.start + '–' + s.end).join(' · ');
}

function daysText(h) {
  if (h.once) return t('today');
  const d = h.days || [];
  if (d.length === 7) return t('everyDay');
  if (d.length === 5 && !d.includes(0) && !d.includes(6)) return t('weekdays');
  if (d.length === 2 && d.includes(0) && d.includes(6)) return t('weekends');
  const names = t('days');
  return d.slice().sort().map((i) => names[i]).join(' ');
}

// ---- live ---------------------------------------------------------------------

function pastSide(o) {
  const lang = getLang();
  const time = o.at ? fmtClock(o.at, lang) : '';
  const pts = o.pts ? (o.pts > 0 ? '+' : '') + o.pts : '';
  const undo = (o.status === 'done' || o.status === 'skipped') && Date.now() - o.at < 5 * 60000
    ? `<button class="btn small ghost undo" data-action="undo" data-key="${esc(o.key)}">${t('undo')}</button>` : '';
  const mark = o.status === 'done' ? '✓' : o.status === 'missed' ? '✗' : '–';
  return `<div class="side">${mark} ${pts} <span class="muted">${time}</span>${undo}</div>`;
}

function occRow(o, cls, side, extra = '') {
  return `<div class="occ ${cls} ${extra}" data-key="${esc(o.key)}">
    <div class="emo">${esc(o.habit.emoji)}</div>
    <div><div class="name">${habitName(o.habit)}</div><div class="when">${slotOf(o)}</div></div>
    ${side}
  </div>`;
}

function slotOf(o) {
  const lang = getLang();
  return fmtClock(o.start, lang) + ' – ' + fmtClock(o.end, lang);
}

function currentCard(o, now) {
  const stake = BASE_PTS[o.habit.importance] || 20;
  const sn = canSnooze(o);
  const snoozeLabel = sn === 'ok' ? '💤 ' + t('snoozeMin', { n: state.settings.snoozeMinutes }) : sn === 'exhausted' ? t('noSnoozeLeft') : t('snoozeDisabled');
  const showSnooze = !(sn === 'disabled' && (!state.settings.snoozeAllowed || o.habit.snooze === false));
  const desc = habitDesc(o.habit);
  return `<div class="occ current ${o.fresh ? 'enter' : ''}" data-key="${esc(o.key)}">
    <div class="emo">${esc(o.habit.emoji)}</div>
    <div class="name">${habitName(o.habit)}</div>
    ${desc ? `<div class="desc">${desc}</div>` : ''}
    <div class="when">${slotOf(o)} · <span class="stake">${t('ptsAtStake', { n: stake })}</span></div>
    <div class="ringwrap" data-ring="${esc(o.key)}">
      <svg viewBox="0 0 160 160"><circle class="track" cx="80" cy="80" r="${RING_R}"/><circle class="prog" cx="80" cy="80" r="${RING_R}" stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="0"/></svg>
      <div class="count"><span data-cd="${esc(o.key)}">${fmtCountdown(o.end - now)}</span><small>${t('left', { t: '' }).trim()}</small></div>
    </div>
    <div class="actions">
      <button class="btn ok big" data-action="done" data-key="${esc(o.key)}">✓ ${t('done')}</button>
      ${showSnooze ? `<button class="btn big" data-action="snooze" data-key="${esc(o.key)}" ${sn !== 'ok' ? 'disabled' : ''}>${snoozeLabel}</button>` : ''}
    </div>
    <button class="link" data-action="skip" data-key="${esc(o.key)}">${t('skip')}</button>
  </div>`;
}

export function renderLive(occs, now, opts) {
  const lang = getLang();
  const g = state.game;
  const level = levelFor(g.xp);
  const lo = xpForLevel(level), hi = xpForLevel(level + 1);
  const pct = Math.round(((g.xp - lo) / (hi - lo)) * 100);
  const today = todayPoints(now);
  const ranks = t('rankNames');
  const rank = ranks[Math.min(ranks.length - 1, Math.floor((level - 1) / 2))];

  const past = occs.filter((o) => o.phase === 'past');
  const active = occs.filter((o) => o.phase === 'active');
  const upcoming = occs.filter((o) => o.phase === 'upcoming');
  const cur = currentOf(occs);

  let body = '';
  if (opts.updateReady) {
    body += `<div class="banner"><span>${t('updateAvailable')}</span><button class="btn small primary" data-action="apply-update">${t('updateNow')}</button></div>`;
  }
  body += `<div class="timeline">`;
  if (past.length) {
    body += `<div class="group-title">${t('earlier')}</div>`;
    const shown = past.slice(-6);
    for (const o of shown) body += occRow(o, 'past ' + o.status, pastSide(o), o.fresh ? 'leave' : '');
  }
  if (!state.habits.length) {
    body += `<div class="empty"><div class="emo">🌱</div><h2>${t('liveNoHabits')}</h2><p>${t('liveNoHabitsHint')}</p>
      <p style="margin-top:14px"><button class="btn primary" data-action="tab" data-view="setup">${t('tabSetup')}</button></p></div>`;
  } else if (cur) {
    body += currentCard(cur, now);
    for (const o of active) if (o !== cur) {
      body += occRow(o, 'active', `<div class="side" data-cd="${esc(o.key)}">${fmtCountdown(o.end - now)}</div>`, o.fresh ? 'enter' : '');
    }
  } else if (!upcoming.length) {
    body += `<div class="empty"><div class="emo">${past.length ? '🌙' : '🫧'}</div><h2>${past.length ? t('liveAllDone') : t('liveEmpty')}</h2><p>${past.length ? t('liveAllDoneHint') : t('liveEmptyHint')}</p></div>`;
  } else {
    body += `<div class="empty"><div class="emo">🫧</div><h2>${t('liveEmpty')}</h2><p>${t('liveEmptyHint')}</p></div>`;
  }
  if (upcoming.length) {
    body += `<div class="group-title">${t('upcoming')}</div>`;
    for (const o of upcoming.slice(0, 6)) {
      body += occRow(o, 'upcoming', `<div class="side" data-in="${esc(o.key)}">${t('in', { t: fmtDuration(o.start - now, lang) })}</div>`);
    }
  }
  body += `</div>`;

  return `<div class="screen live">
    <div class="topbar">
      <div class="clock" data-clock>${fmtClock(now, lang)}</div>
      <div class="stats">
        <span class="stat">⭐ ${t('level', { n: level })}</span>
        ${g.streak ? `<span class="stat">🔥 ${g.streak}</span>` : ''}
        <span class="stat today ${today < 0 ? 'neg' : ''}">${today >= 0 ? '+' : ''}${today}</span>
      </div>
    </div>
    <div class="xpbar"><div class="xpfill" style="width:${pct}%"></div></div>
    <div class="rank"><span>${esc(rank)}</span><span>${t('xpToNext', { n: hi - g.xp })}</span></div>
    ${body}
  </div>
  <button class="fab" data-action="quick" aria-label="${t('quickTask')}">+</button>
  ${tabbar('live')}`;
}

// Cheap per-second refresh: countdowns, ring, clock. No re-render.
export function updateCountdowns(occs, now) {
  const clock = $('[data-clock]');
  if (clock) { const s = fmtClock(now, getLang()); if (clock.textContent !== s) clock.textContent = s; }
  for (const o of occs) {
    if (o.phase === 'active') {
      const el = $(`[data-cd="${cssEsc(o.key)}"]`);
      if (el) el.textContent = fmtCountdown(o.end - now);
      const ring = $(`[data-ring="${cssEsc(o.key)}"]`);
      if (ring) {
        const total = o.end - Math.min(o.start, o.end - 1);
        const frac = Math.max(0, Math.min(1, (o.end - now) / total));
        ring.querySelector('.prog').style.strokeDashoffset = (RING_C * (1 - frac)).toFixed(1);
        const left = o.end - now;
        const cls = left <= 60000 || frac < 0.08 ? 'danger' : frac < 0.3 ? 'warn' : '';
        if (ring.dataset.cls !== cls) { ring.dataset.cls = cls; ring.classList.remove('warn', 'danger'); if (cls) ring.classList.add(cls); }
      }
    } else if (o.phase === 'upcoming') {
      const el = $(`[data-in="${cssEsc(o.key)}"]`);
      if (el) { const s = t('in', { t: fmtDuration(o.start - now, getLang()) }); if (el.textContent !== s) el.textContent = s; }
    }
  }
}
const cssEsc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'));

// ---- setup --------------------------------------------------------------------

function toggleRow(label, sub, control) {
  return `<div class="toggle"><div><div class="t">${label}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>${control}</div>`;
}
function sw(setting, on) {
  return `<label class="switch"><input type="checkbox" data-setting="${setting}" ${on ? 'checked' : ''}><span></span></label>`;
}
function sel(setting, options, value) {
  return `<select data-setting="${setting}">${options.map(([v, l]) => `<option value="${v}" ${String(v) === String(value) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
}

export function renderSetup(opts) {
  const s = state.settings;
  const perm = permission();
  const habits = state.habits.filter((h) => !h.once);
  const added = new Set(habits.map((h) => h.preset).filter(Boolean));
  const list = habits.length
    ? habits.map((h) => `<div class="item ${h.enabled === false ? 'off' : ''}" data-action="edit" data-id="${esc(h.id)}">
        <div class="emo">${esc(h.emoji)}</div>
        <div><div class="name">${habitName(h)}</div><div class="sub"><span class="dot i${h.importance}"></span>${slotsText(h)} · ${daysText(h)}</div></div>
        <label class="switch" data-stop><input type="checkbox" data-action="toggle" data-id="${esc(h.id)}" ${h.enabled !== false ? 'checked' : ''}><span></span></label>
      </div>`).join('')
    : `<p class="hint">${t('liveNoHabitsHint')}</p>`;

  const notifControl = perm === 'granted'
    ? `<button class="btn small" data-action="notif-test">${t('notifTest')}</button>`
    : perm === 'denied' || perm === 'unsupported' ? ''
    : `<button class="btn small primary" data-action="notif-enable">${t('notifEnable')}</button>`;

  return `<div class="screen setup">
    <h1>${t('setupTitle')}</h1>

    <div class="section">
      <h2>${t('myMoments')} <button class="btn small primary" data-action="add">+ ${t('addMoment')}</button></h2>
      <div class="list">${list}</div>
    </div>

    <div class="section">
      <h2>${t('presets')}</h2>
      <p class="hint" style="margin-bottom:10px">${t('presetsHint')}</p>
      <div class="chips">${PRESETS.map((p) => `<button class="chip ${added.has(p.id) ? 'dim' : ''}" data-action="preset" data-preset="${p.id}" ${added.has(p.id) ? 'disabled' : ''}>${p.emoji} ${esc(pick(p.name))}</button>`).join('')}</div>
    </div>

    <div class="section">
      <h2>${t('settings')}</h2>
      <div class="card">
        ${toggleRow(t('language'), '', sel('lang', [['en', 'English'], ['fr', 'Français']], state.lang))}
        ${toggleRow(t('notifications'), perm === 'granted' ? t('notifOn') : perm === 'denied' ? t('notifBlocked') : t('notifOff'), notifControl)}
        ${toggleRow(t('reminderBefore'), '', sel('reminderBefore', [[0, '–'], [2, t('minutes', { n: 2 })], [5, t('minutes', { n: 5 })], [10, t('minutes', { n: 10 })], [15, t('minutes', { n: 15 })]], s.reminderBefore))}
        ${toggleRow(t('sound'), '', sw('sound', s.sound))}
        ${toggleRow(t('vibration'), '', sw('vibrate', s.vibrate))}
      </div>
      <p class="hint" style="margin-top:10px">${t('notifBackgroundNote')}</p>
    </div>

    <div class="section">
      <h2>${t('snoozeSettings')}</h2>
      <div class="card">
        ${toggleRow(t('snoozeAllowed'), '', sw('snoozeAllowed', s.snoozeAllowed))}
        ${toggleRow(t('snoozeDuration'), '', sel('snoozeMinutes', [5, 10, 15, 20, 30].map((n) => [n, t('minutes', { n })]), s.snoozeMinutes))}
        ${toggleRow(t('snoozeMax'), '', sel('maxSnoozes', [1, 2, 3, 5].map((n) => [n, n]), s.maxSnoozes))}
      </div>
    </div>

    <div class="section">
      <h2>${t('dataTitle')}</h2>
      <div class="btnrow" style="margin-top:0">
        <button class="btn" data-action="export">${t('exportData')}</button>
        <button class="btn" data-action="import">${t('importData')}</button>
        <button class="btn danger" data-action="reset">${t('resetData')}</button>
      </div>
      <input type="file" accept="application/json,.json" id="importFile" hidden>
    </div>

    <div class="section">
      <h2>${t('about')}</h2>
      <div class="card">
        ${toggleRow(t('version', { v: esc(opts.version) }), opts.updateReady ? t('updateAvailable') : '', opts.updateReady
          ? `<button class="btn small primary" data-action="apply-update">${t('updateNow')}</button>`
          : `<button class="btn small" data-action="check-update">${t('checkUpdate')}</button>`)}
        ${opts.canInstall ? toggleRow(t('install'), '', `<button class="btn small primary" data-action="install">${t('install')}</button>`) : ''}
        ${opts.isIosBrowser ? `<p class="hint" style="padding:10px 0">${t('obIosInstall')}</p>` : ''}
        <div class="toggle"><button class="link" data-action="restart-ob">${t('onboardingRestart')}</button></div>
      </div>
      <p class="hint center" style="margin-top:14px"><a class="muted" href="https://github.com/Purgator/Momen2m" target="_blank" rel="noopener">github.com/Purgator/Momen2m</a></p>
    </div>
  </div>
  ${tabbar('setup')}`;
}

// ---- onboarding ---------------------------------------------------------------

export function renderOnboarding(step, data) {
  const dots = `<div class="dots">${[0, 1, 2].map((i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>`;
  let body = '', foot = '';
  if (step === 0) {
    body = `<img class="logo" src="icons/icon-192.png" alt="">
      <h1>${t('obWelcomeTitle')}</h1>
      <p>${t('obWelcomeText')}</p>
      <div class="field"><span class="lbl">${t('obLanguage')}</span>
        <div class="seg"><button data-action="ob-lang" data-lang="en" class="${state.lang === 'en' ? 'on' : ''}">English</button><button data-action="ob-lang" data-lang="fr" class="${state.lang === 'fr' ? 'on' : ''}">Français</button></div>
      </div>`;
    foot = `<button class="btn primary big" data-action="ob-next">${t('obNext')}</button>`;
  } else if (step === 1) {
    body = `<h1>${t('obPickTitle')}</h1><p>${t('obPickText')}</p>
      <div class="chips">${PRESETS.map((p) => `<button class="chip ${data.selected.has(p.id) ? 'on' : ''}" data-action="ob-preset" data-preset="${p.id}">${p.emoji} ${esc(pick(p.name))}</button>`).join('')}</div>`;
    foot = `<button class="btn ghost big" data-action="ob-back">${t('obBack')}</button><button class="btn primary big" data-action="ob-next">${t('obNext')}</button>`;
  } else {
    const perm = permission();
    const status = perm === 'granted' ? `<p class="note" style="color:var(--ok)">${t('obNotifGranted')}</p>`
      : perm === 'denied' ? `<p class="note">${t('obNotifDenied')}</p>`
      : `<button class="btn primary big wide" data-action="ob-notif" style="margin-top:18px">🔔 ${t('obNotifAllow')}</button>`;
    body = `<h1>${t('obNotifTitle')}</h1><p>${t('obNotifText')}</p>${status}
      ${data.isIosBrowser ? `<p class="note">${t('obIosInstall')}</p>` : ''}
      ${data.canInstall ? `<button class="btn big wide" data-action="install" style="margin-top:14px">📲 ${t('install')}</button>` : ''}
      ${!data.isIosBrowser && !data.canInstall && !data.standalone ? `<p class="note">${t('obInstallHint')}</p>` : ''}`;
    foot = `<button class="btn ghost big" data-action="ob-back">${t('obBack')}</button><button class="btn ok big" data-action="ob-start">${t('obStart')}</button>`;
  }
  return `<div class="ob"><div class="body">${body}</div>${dots}<div class="foot">${foot}</div></div>`;
}

// ---- sheets -------------------------------------------------------------------

let sheetEl = null, backdropEl = null;
export function closeSheet() {
  if (!sheetEl) return;
  const s = sheetEl, b = backdropEl;
  sheetEl = backdropEl = null;
  s.classList.remove('open'); b.classList.remove('open');
  setTimeout(() => { s.remove(); b.remove(); }, 260);
}
function openSheet(html) {
  closeSheet();
  backdropEl = document.createElement('div'); backdropEl.className = 'backdrop';
  sheetEl = document.createElement('div'); sheetEl.className = 'sheet';
  sheetEl.innerHTML = `<div class="grab"></div>${html}`;
  document.body.append(backdropEl, sheetEl);
  backdropEl.addEventListener('click', closeSheet);
  requestAnimationFrame(() => { backdropEl.classList.add('open'); sheetEl.classList.add('open'); });
  return sheetEl;
}

const dayNames = () => t('days');

function slotRow(s, i) {
  return `<div class="slot" data-slot="${i}">
    <input class="input" type="time" value="${s.start}" data-f="start" required>
    <span class="arrow">→</span>
    <input class="input" type="time" value="${s.end}" data-f="end" required>
    <button class="iconbtn" data-rm="${i}" aria-label="${t('delete')}">✕</button>
  </div>`;
}

// Habit editor. `habit` is null for a new one. onSave(habitData), onDelete().
export function openHabitSheet(habit, onSave, onDelete) {
  const h = habit ? JSON.parse(JSON.stringify(habit)) : {
    name: '', emoji: '', desc: '', slots: [{ start: '09:00', end: '10:00' }], days: [0, 1, 2, 3, 4, 5, 6], importance: 2, snooze: true, enabled: true,
  };
  if (typeof h.name === 'object') h.name = pick(h.name);
  if (typeof h.desc === 'object') h.desc = pick(h.desc);
  let autoEmoji = !h.emoji;

  const daysOf = (d) => d.slice().sort().join(',');
  const repeatMode = () => {
    const k = daysOf(h.days);
    return k === '0,1,2,3,4,5,6' ? 'all' : k === '1,2,3,4,5' ? 'wd' : k === '0,6' ? 'we' : 'custom';
  };

  const el = openSheet(`
    <h2>${habit ? t('edit') : t('addMoment')}</h2>
    <div class="field"><label>${t('name')}</label>
      <div class="row"><input class="input emoji-in" data-f="emoji" value="${esc(h.emoji || suggestEmoji(h.name))}" maxlength="4" aria-label="${t('emoji')}">
      <input class="input" data-f="name" value="${esc(h.name)}" placeholder="${t('namePlaceholder')}" autocomplete="off" enterkeyhint="next"></div></div>
    <div class="field"><label>${t('description')}</label><input class="input" data-f="desc" value="${esc(h.desc || '')}" placeholder="${t('descriptionPlaceholder')}" autocomplete="off"></div>
    <div class="field"><label>${t('timeRange')}</label><div data-slots>${h.slots.map(slotRow).join('')}</div>
      <button class="link" data-add-slot>+ ${t('addTime')}</button></div>
    ${h.once ? '' : `<div class="field"><label>${t('repeat')}</label>
      <div class="seg" data-repeat>
        <button data-mode="all" class="${repeatMode() === 'all' ? 'on' : ''}">${t('everyDay')}</button>
        <button data-mode="wd" class="${repeatMode() === 'wd' ? 'on' : ''}">${t('weekdays')}</button>
        <button data-mode="we" class="${repeatMode() === 'we' ? 'on' : ''}">${t('weekends')}</button>
        <button data-mode="custom" class="${repeatMode() === 'custom' ? 'on' : ''}">${t('custom')}</button>
      </div>
      <div class="chips" data-days style="margin-top:10px; ${repeatMode() === 'custom' ? '' : 'display:none'}">
        ${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button class="chip day ${h.days.includes(d) ? 'on' : ''}" data-day="${d}">${dayNames()[d]}</button>`).join('')}
      </div></div>`}
    <div class="field"><label>${t('importance')}</label>
      <div class="seg" data-imp>${[1, 2, 3].map((i) => `<button data-imp="${i}" class="${h.importance === i ? 'on' : ''}">${[null, t('impLow'), t('impNormal'), t('impHigh')][i]}</button>`).join('')}</div></div>
    <div class="card" style="margin-top:14px">
      ${toggleRow(t('allowSnooze'), '', `<label class="switch"><input type="checkbox" data-f="snooze" ${h.snooze !== false ? 'checked' : ''}><span></span></label>`)}
      ${habit ? toggleRow(t('enabled'), '', `<label class="switch"><input type="checkbox" data-f="enabled" ${h.enabled !== false ? 'checked' : ''}><span></span></label>`) : ''}
    </div>
    <div class="btnrow">
      ${habit ? `<button class="btn danger" data-del>${t('delete')}</button>` : `<button class="btn ghost" data-cancel>${t('cancel')}</button>`}
      <button class="btn primary" data-save>${t('save')}</button>
    </div>`);

  const nameIn = $('[data-f="name"]', el), emojiIn = $('[data-f="emoji"]', el);
  nameIn.addEventListener('input', () => { if (autoEmoji) emojiIn.value = suggestEmoji(nameIn.value); });
  emojiIn.addEventListener('input', () => { autoEmoji = !emojiIn.value.trim(); if (autoEmoji) emojiIn.value = suggestEmoji(nameIn.value); });

  const slotsEl = $('[data-slots]', el);
  const readSlots = () => $$('.slot', slotsEl).map((r) => ({ start: $('[data-f="start"]', r).value, end: $('[data-f="end"]', r).value }));
  $('[data-add-slot]', el).addEventListener('click', () => {
    const cur = readSlots();
    const last = cur[cur.length - 1];
    const startMin = last ? parseHM(last.end) + 60 : parseHM(nowHM());
    cur.push({ start: minutesToHM(startMin), end: minutesToHM(startMin + 60) });
    slotsEl.innerHTML = cur.map(slotRow).join('');
  });
  slotsEl.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (!rm) return;
    const cur = readSlots();
    if (cur.length <= 1) return;
    cur.splice(Number(rm.dataset.rm), 1);
    slotsEl.innerHTML = cur.map(slotRow).join('');
  });

  const rep = $('[data-repeat]', el), daysEl = $('[data-days]', el);
  if (rep) {
    rep.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]'); if (!b) return;
      $$('button', rep).forEach((x) => x.classList.toggle('on', x === b));
      const m = b.dataset.mode;
      if (m === 'all') h.days = [0, 1, 2, 3, 4, 5, 6];
      else if (m === 'wd') h.days = [1, 2, 3, 4, 5];
      else if (m === 'we') h.days = [0, 6];
      daysEl.style.display = m === 'custom' ? '' : 'none';
      $$('[data-day]', daysEl).forEach((c) => c.classList.toggle('on', h.days.includes(Number(c.dataset.day))));
    });
    daysEl.addEventListener('click', (e) => {
      const c = e.target.closest('[data-day]'); if (!c) return;
      const d = Number(c.dataset.day);
      h.days = h.days.includes(d) ? h.days.filter((x) => x !== d) : h.days.concat(d);
      c.classList.toggle('on', h.days.includes(d));
    });
  }
  $('[data-imp]', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-imp]'); if (!b || !b.dataset.imp) return;
    h.importance = Number(b.dataset.imp);
    $$('button', $('[data-imp]', el)).forEach((x) => x.classList.toggle('on', x === b));
  });

  const cancel = $('[data-cancel]', el); if (cancel) cancel.addEventListener('click', closeSheet);
  const del = $('[data-del]', el); if (del) del.addEventListener('click', () => { if (confirm(t('confirmDelete'))) { closeSheet(); onDelete(); } });
  $('[data-save]', el).addEventListener('click', () => {
    const slots = readSlots().filter((s) => s.start && s.end);
    const name = nameIn.value.trim();
    if (!name || !slots.length || (!h.once && !h.days.length)) { nameIn.classList.add('shake'); setTimeout(() => nameIn.classList.remove('shake'), 500); toast(t('invalidTime'), 'bad'); return; }
    h.name = name;
    h.emoji = emojiIn.value.trim() || suggestEmoji(name);
    h.desc = $('[data-f="desc"]', el).value.trim();
    h.slots = slots;
    h.snooze = $('[data-f="snooze"]', el).checked;
    const en = $('[data-f="enabled"]', el); if (en) h.enabled = en.checked;
    closeSheet();
    onSave(h);
  });
  setTimeout(() => { if (!habit) nameIn.focus(); }, 300);
}

// One-off task. onAdd({ name, emoji, minutes, importance })
export function openQuickSheet(onAdd) {
  let minutes = 30, importance = 2;
  const el = openSheet(`
    <h2>⚡ ${t('quickTaskTitle')}</h2>
    <div class="field"><label>${t('quickTaskName')}</label>
      <div class="row"><input class="input emoji-in" data-f="emoji" value="✅" maxlength="4" aria-label="${t('emoji')}">
      <input class="input" data-f="name" placeholder="${t('namePlaceholder')}" autocomplete="off" enterkeyhint="done"></div></div>
    <div class="field"><label>${t('quickTaskDuration')}</label>
      <div class="chips" data-dur>${[10, 15, 30, 45, 60, 120].map((m) => `<button class="chip ${m === minutes ? 'on' : ''}" data-min="${m}">${fmtDuration(m * 60000, getLang())}</button>`).join('')}</div></div>
    <div class="field"><label>${t('importance')}</label>
      <div class="seg" data-imp>${[1, 2, 3].map((i) => `<button data-imp="${i}" class="${importance === i ? 'on' : ''}">${[null, t('impLow'), t('impNormal'), t('impHigh')][i]}</button>`).join('')}</div></div>
    <div class="btnrow"><button class="btn ghost" data-cancel>${t('cancel')}</button><button class="btn primary" data-save>${t('quickAdd')}</button></div>`);
  const nameIn = $('[data-f="name"]', el), emojiIn = $('[data-f="emoji"]', el);
  let autoEmoji = true;
  nameIn.addEventListener('input', () => { if (autoEmoji) emojiIn.value = suggestEmoji(nameIn.value); });
  emojiIn.addEventListener('input', () => { autoEmoji = !emojiIn.value.trim(); });
  $('[data-dur]', el).addEventListener('click', (e) => {
    const c = e.target.closest('[data-min]'); if (!c) return;
    minutes = Number(c.dataset.min);
    $$('.chip', e.currentTarget).forEach((x) => x.classList.toggle('on', x === c));
  });
  $('[data-imp]', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-imp]'); if (!b || !b.dataset.imp) return;
    importance = Number(b.dataset.imp);
    $$('button', e.currentTarget).forEach((x) => x.classList.toggle('on', x === b));
  });
  const submit = () => {
    const name = nameIn.value.trim();
    if (!name) { nameIn.classList.add('shake'); setTimeout(() => nameIn.classList.remove('shake'), 500); return; }
    closeSheet();
    onAdd({ name, emoji: emojiIn.value.trim() || suggestEmoji(name), minutes, importance });
  };
  $('[data-cancel]', el).addEventListener('click', closeSheet);
  $('[data-save]', el).addEventListener('click', submit);
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  setTimeout(() => nameIn.focus(), 300);
}

// ---- toasts & sparkles --------------------------------------------------------

export function toast(text, kind = '', opts = {}) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = `<span>${esc(text)}</span>${opts.action ? `<button class="btn small">${esc(opts.action.label)}</button>` : ''}`;
  if (opts.action) $('button', el).addEventListener('click', () => { opts.action.fn(); kill(); });
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  let dead = false;
  const kill = () => { if (dead) return; dead = true; el.classList.add('out'); setTimeout(() => el.remove(), 260); };
  setTimeout(kill, opts.ms || (opts.action ? 5000 : 2200));
  return kill;
}

export function sparkles(x, y, emojis = ['✨', '⭐', '🎉', '💫']) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; i < 10; i++) {
    const s = document.createElement('span');
    s.className = 'sparkle';
    s.textContent = emojis[i % emojis.length];
    const a = (Math.PI * 2 * i) / 10 + Math.random() * 0.5, d = 70 + Math.random() * 60;
    s.style.left = x + 'px'; s.style.top = y + 'px';
    s.style.setProperty('--dx', Math.cos(a) * d + 'px');
    s.style.setProperty('--dy', Math.sin(a) * d - 40 + 'px');
    s.style.setProperty('--rot', Math.random() * 360 - 180 + 'deg');
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 950);
  }
}
