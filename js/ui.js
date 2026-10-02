// Rendering: pure functions from state to HTML strings for the five tabs and
// the setup. Behaviour lives in app.js via data-action. The DOM helpers, the
// sheet, the toasts and the shared widgets have their own modules; they are
// re-exported here so `import * as U from './ui.js'` stays one door.
export * from './dom.js';
export * from './toast.js';
export * from './sheet.js';
export * from './sheets.js';
export { durationOf } from './widgets.js';
import { $, esc, cssEsc, pctText, signed } from './dom.js';
import { habitName, habitDesc, slotsText, daysText, slotOf, dayLetter, toggleRow, timeIn, sw, sel } from './widgets.js';
import { t, pick, getLang } from './i18n.js';
import { state } from './store.js';
import { PRESETS } from './presets.js';
import { QUESTIONS, isTriggered, reviewStatus } from './setup.js';
import { BASE_PTS, PAUSE_MAX, canSnooze, currentOf, todayPoints, boostActive, pausedUntil } from './engine.js';
import { levelInfo, BADGES, BADGE_PAGE, badgeProgress, tips as gameTips } from './game.js';
import { pointsOn as agendaPointsOn, dueOn as questsDueOn, reminderHM as questReminderHM } from './plans.js';
import { fmtClock, fmtCountdown, fmtDuration, fmtAgo, fmtDay, fmtDateTime, fmtWhenShort, dayKey } from './time.js';
import { permission, TONE_NAMES, PATTERN_NAMES } from './notify.js';

const RING_R = 70;
const RING_C = 2 * Math.PI * RING_R;

// ---- shared bits ------------------------------------------------------------

export function tabbar(view) {
  const tab = (v, ico, label) => `<button class="tab ${view === v ? 'on' : ''}" data-action="tab" data-view="${v}" ${view === v ? 'aria-current="page"' : ''}><span class="ico">${ico}</span><span class="lbl">${label}</span></button>`;
  const due = state.settings.agenda !== false ? questsDueOn(dayKey()) : null;
  return `<nav class="tabbar" aria-label="${t('tabs')}">
    ${tab('live', '⏱️', t('tabNow'))}
    ${tab('progress', '🏆', t('tabProgress'))}
    ${tab('moments', '📋', t('tabMoments'))}
    ${due ? tab('agenda', '🗺️' + (due.tasks || due.questions ? '<i class="dot-badge"></i>' : ''), t('tabAgenda')) : ''}
    ${tab('setup', '🎛️', t('tabSetup'))}
  </nav>`;
}
// Rows and cards that react to a tap are divs: make them reachable from a
// keyboard too (app.js turns Enter / Space on them into a click).
export function a11y(root) {
  for (const el of root.querySelectorAll('[data-action]:not(button):not(a):not(input):not(select):not(label):not([tabindex])')) {
    el.tabIndex = 0; el.setAttribute('role', 'button');
  }
}
// ---- live ---------------------------------------------------------------------

function pastSide(o) {
  const time = o.at ? fmtClock(o.at) : '';
  const pts = o.pts ? (o.pts > 0 ? '+' : '') + o.pts : '';
  const undo = (o.status === 'done' || o.status === 'skipped') && Date.now() - o.at < 5 * 60000
    ? `<button class="btn small ghost undo" data-action="undo" data-key="${esc(o.key)}">${t('undo')}</button>` : '';
  const mark = o.status === 'done' ? '✓' : o.status === 'missed' ? '✗' : '–';
  return `<div class="side">${mark} ${pts} <span class="muted">${time}</span>${undo}</div>`;
}

function occRow(o, cls, side, extra = '', action = null) {
  return `<div class="occ ${cls} ${extra}" data-key="${esc(o.key)}" ${action ? `data-action="${action}"` : ''}>
    <div class="emo">${esc(o.habit.emoji)}</div>
    <div><div class="name">${habitName(o.habit)}</div><div class="when">${slotOf(o)}</div></div>
    ${side}
  </div>`;
}

// The one big "current" card. `collapsible` is true for a second (or third…)
// simultaneously active moment the user expanded by tapping it — tapping its
// header again collapses it back. The primary current moment is never
// collapsible, so it can't accidentally be tapped away.
function currentCard(o, now, collapsible = false) {
  const base = BASE_PTS[o.habit.importance] || 20;
  const boost = boostActive(now);
  const stake = boost ? Math.round(base * 1.5) : base;
  const sn = canSnooze(o);
  const snoozeLabel = sn === 'ok' ? '💤 ' + t('snoozeMin', { n: state.settings.snoozeMinutes }) : sn === 'exhausted' ? t('noSnoozeLeft') : t('snoozeDisabled');
  const showSnooze = !(sn === 'disabled' && (!state.settings.snoozeAllowed || o.habit.snooze === false));
  const desc = habitDesc(o.habit);
  return `<div class="occ current ${collapsible ? 'expandable' : ''} ${o.fresh ? 'enter' : ''}" data-key="${esc(o.key)}" ${collapsible ? 'data-action="toggle-expand"' : ''}>
    <div class="emo">${esc(o.habit.emoji)}</div>
    <div class="name">${habitName(o.habit)}</div>
    ${desc ? `<div class="desc">${desc}</div>` : ''}
    <div class="when">${slotOf(o)} · <span class="stake" data-tip="${esc(t('tipStake', { n: stake, m: Math.round((base + Math.round(base / 2)) * (boost ? 1.5 : 1)) }))}">${boost ? '⚡ ' : ''}${t('ptsAtStake', { n: stake })}</span></div>
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
  const g = state.game;
  const ranks = t('rankNames');
  const li = levelInfo(g.xp, ranks.length);
  const level = li.level, hi = li.hi, pct = li.pct;
  const today = todayPoints(now) + agendaPointsOn(dayKey(new Date(now)));
  const rank = ranks[li.rankIdx];

  const past = occs.filter((o) => o.phase === 'past');
  const active = occs.filter((o) => o.phase === 'active');
  const upcoming = occs.filter((o) => o.phase === 'upcoming');
  const cur = currentOf(occs);

  let body = '';
  if (opts.updateReady) {
    body += `<div class="banner"><span>${t('updateAvailable')}</span><button class="btn small primary" data-action="apply-update">${t('updateNow')}</button></div>`;
  }
  if (boostActive(now)) {
    body += `<div class="banner boost" data-action="explain" data-topic="today"><span>⚡ ${t('boostBanner', { until: fmtClock(state.game.boostUntil) })}</span></div>`;
  }
  const paused = pausedUntil(now);
  if (paused) {
    body += `<div class="banner" data-action="pause-info"><span>⏸️ ${t('pausedBanner', { until: fmtClock(paused) })}</span></div>`;
  }
  if (g.greeting && g.greeting.day === dayKey(new Date(now))) {
    const msgs = t('greetings');
    body += `<div class="greet" data-action="greet-dismiss"><span class="emo">💙</span><div><p>${esc(msgs[g.greeting.i % msgs.length])}</p><small>${t('greetTap')}</small></div></div>`;
  }
  body += `<div class="timeline">`;
  if (past.length) {
    body += `<div class="group-title">${t('earlier')}</div>`;
    const shown = past.slice(-6);
    for (const o of shown) body += occRow(o, 'past ' + o.status, pastSide(o), o.fresh ? 'leave' : '', 'recap');
  }
  if (!state.habits.length) {
    body += `<div class="empty"><div class="emo">🌱</div><h2>${t('liveNoHabits')}</h2><p>${t('liveNoHabitsHint')}</p>
      <p style="margin-top:14px"><button class="btn primary" data-action="tab" data-view="moments">${t('tabMoments')}</button></p>
      ${opts.recovery ? `<p style="margin-top:6px"><button class="link" data-action="restore-recovery">${t('restoreAvailable')} · ${fmtWhenShort(opts.recovery.at)}</button></p>` : ''}</div>`;
  } else if (cur) {
    body += currentCard(cur, now);
    const expanded = opts.expanded || new Set();
    for (const o of active) if (o !== cur) {
      if (expanded.has(o.key)) {
        body += currentCard(o, now, true);
      } else {
        body += occRow(o, 'active', `<div class="side" data-cd="${esc(o.key)}">${fmtCountdown(o.end - now)}</div>`, o.fresh ? 'enter' : '', 'toggle-expand');
      }
    }
  } else if (!upcoming.length) {
    body += `<div class="empty"><div class="emo">${past.length ? '🌙' : '🫧'}</div><h2>${past.length ? t('liveAllDone') : t('liveEmpty')}</h2><p>${past.length ? t('liveAllDoneHint') : t('liveEmptyHint')}</p></div>`;
  } else {
    body += `<div class="empty"><div class="emo">🫧</div><h2>${t('liveEmpty')}</h2><p>${t('liveEmptyHint')}</p></div>`;
  }
  if (upcoming.length) {
    body += `<div class="group-title">${t('upcoming')}</div>`;
    for (const o of upcoming.slice(0, 6)) {
      body += occRow(o, 'upcoming', `<div class="side">${o.snoozes ? '💤 ' : ''}<span data-in="${esc(o.key)}">${t('in', { t: fmtDuration(o.start - now) })}</span></div>`, '', 'upcoming-detail');
    }
  }
  // One-time moments set for tomorrow have no other place to show up; a tap opens them for editing.
  const tomorrow = opts.tomorrow || [];
  if (tomorrow.length) {
    body += `<div class="group-title">${t('tomorrow')}</div>`;
    for (const h of tomorrow) {
      body += `<div class="occ upcoming tomorrow" data-action="edit" data-id="${esc(h.id)}">
        <div class="emo">${esc(h.emoji)}</div>
        <div><div class="name">${habitName(h)}</div><div class="when">${slotsText(h)}</div></div>
        <div class="side">📅 ${t('tomorrow')}</div>
      </div>`;
    }
  }
  body += `</div>`;

  return `<div class="screen live">
    <div class="topbar">
      <div class="clock" data-clock>${fmtClock(now)}</div>
      <div class="stats">
        <button class="stat" data-action="explain" data-topic="level" data-tip="${esc(t('tipLevel', { rank, n: hi - g.xp }))}">⭐ ${t('level', { n: level })}</button>
        ${g.streak ? `<button class="stat" data-action="explain" data-topic="streak" data-tip="${esc(t('tipStreak', { n: g.streak, best: g.bestStreak }))}">🔥 ${g.streak}</button>` : ''}
        <button class="stat today ${today < 0 ? 'neg' : ''}" data-action="explain" data-topic="today" data-tip="${esc(t('tipToday'))}">${today >= 0 ? '+' : ''}${today}</button>
        <button class="stat" data-action="pause-info" data-tip="${esc(t('tipPause', { n: g.pauseTokens || 0, max: PAUSE_MAX }))}">⏸️ ${g.pauseTokens || 0}</button>
      </div>
    </div>
    <div class="xpwrap" data-action="explain" data-topic="level" data-tip="${esc(t('tipXp', { n: g.xp, hi }))}">
      <div class="xpbar"><div class="xpfill" style="width:${pct}%"></div></div>
      <div class="rank"><span>${esc(rank)}</span><span>${t('xpToNext', { n: hi - g.xp })}</span></div>
    </div>
    ${body}
  </div>
  <button class="fab" data-action="quick" aria-label="${t('quickTask')}">+</button>
  ${tabbar('live')}`;
}

// Cheap per-second refresh: countdowns, ring, clock. No re-render.
export function updateCountdowns(occs, now) {
  const clock = $('[data-clock]');
  if (clock) { const s = fmtClock(now); if (clock.textContent !== s) clock.textContent = s; }
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
      if (el) { const s = t('in', { t: fmtDuration(o.start - now) }); if (el.textContent !== s) el.textContent = s; }
    }
  }
}

// ---- progress -----------------------------------------------------------------

// Seven small bars: points per day, today highlighted, negatives in red.
function weekChart(week, now) {
  const today = dayKey(new Date(now));
  const max = Math.max(1, ...week.map((d) => Math.abs(d.pts)));
  return `<div class="chart">${week.map((d) => {
    const h = Math.max(4, Math.round((Math.abs(d.pts) / max) * 100));
    const tip = t('chartTip', { pts: signed(d.pts), done: d.done, missed: d.missed + d.skipped });
    const cls = (d.day === today ? 'today ' : '') + (d.pts < 0 ? 'neg ' : '') + (d.perfect === true ? 'perfect' : '');
    return `<div class="col ${cls}" data-tip="${esc(tip)}"><div class="bar"><i style="height:${h}%"></i></div><span class="lbl">${esc(dayLetter(d.day))}</span>${d.perfect === true ? '<span class="star">★</span>' : ''}</div>`;
  }).join('')}</div>`;
}

function badgeTile(b, p) {
  const names = t('badgeNames');
  const tip = p.earned ? t('badgeEarnedTip', { name: names[b.id] }) : t('badgeLockedTip', { name: names[b.id], n: p.n, of: p.of });
  return `<button class="badge ${p.earned ? 'earned' : 'locked'}" data-action="badge" data-id="${b.id}" data-tip="${esc(tip)}">
    <span class="emo">${b.emoji}</span><span class="bname">${esc(names[b.id])}</span>
    ${p.earned ? '' : `<span class="bprog"><i style="width:${Math.round((p.n / p.of) * 100)}%"></i></span>`}
  </button>`;
}

export function renderProgress(s, now, page = 0) {
  const pages = Math.ceil(BADGES.length / BADGE_PAGE);
  page = Math.max(0, Math.min(pages - 1, page));
  const ranks = t('rankNames');
  const li = s.level;
  const rank = ranks[li.rankIdx];
  const earned = BADGES.map((b) => [b, badgeProgress(b, s)]);
  const nEarned = earned.filter(([, p]) => p.earned).length;
  const tipList = gameTips(s);
  const perHabit = s.perHabit.filter((p) => p.total > 0);
  const bestDay = s.period.bestDay;

  return `<div class="screen progress">
    <div class="ptitle"><h1>${t('tabProgress')}</h1><button class="btn small primary" data-action="share-progress">📤 ${t('share')}</button></div>

    <div class="card hero" data-action="explain" data-topic="level" data-tip="${esc(t('tipXp', { n: li.xp, hi: li.hi }))}">
      <div class="lvl"><span class="big">${li.level}</span><span class="lbl">${t('levelWord')}</span></div>
      <div class="hero-txt">
        <div class="rankname">${esc(rank)}</div>
        <div class="xpbar"><div class="xpfill" style="width:${li.pct}%"></div></div>
        <div class="hint">${t('xpProgress', { xp: li.xp, hi: li.hi })} · ${t('xpToNext', { n: li.toNext })}</div>
      </div>
    </div>

    <div class="tiles">
      <button class="tile" data-action="explain" data-topic="streak" data-tip="${esc(t('tipStreak', { n: s.streak, best: s.bestStreak }))}"><span class="v">🔥 ${s.streak}</span><span class="l">${t('streakWord')}</span><span class="s">${t('best', { n: s.bestStreak })}</span></button>
      <button class="tile" data-action="explain" data-topic="rate" data-tip="${esc(t('tipRate'))}"><span class="v">🎯 ${pctText(s.period.rate)}</span><span class="l">${t('successRate')}</span><span class="s">${t('last30')}</span></button>
      <button class="tile" data-action="explain" data-topic="today" data-tip="${esc(t('tipToday'))}"><span class="v">✅ ${s.lifetime.done}</span><span class="l">${t('doneWord')}</span><span class="s">${t('early', { n: s.lifetime.early })}</span></button>
      <button class="tile" data-action="explain" data-topic="today" data-tip="${esc(t('tipToday'))}"><span class="v ${s.today.pts < 0 ? 'neg' : 'pos'}">${signed(s.today.pts)}</span><span class="l">${t('today')}</span><span class="s">${t('todayCount', { done: s.today.done, total: s.today.total })}</span></button>
      ${state.settings.agenda !== false ? `<button class="tile wide" data-action="tab" data-view="agenda" data-tip="${esc(t('tipQuestPts'))}"><span class="v">🗺️ ${s.goals.pts}</span><span class="l">${t('agQuestPts')}</span><span class="s">${t('agQuestsDone', { n: s.goals.done, f: s.goals.flawless })}</span></button>` : ''}
    </div>

    <div class="section">
      <h2>${t('last7')}</h2>
      <div class="card pad">${weekChart(s.week, now)}
        <p class="hint" style="margin-top:8px">${bestDay ? t('bestDay', { pts: signed(bestDay.pts), d: fmtDay(bestDay.day) }) : t('noHistoryYet')}</p>
      </div>
    </div>

    <div class="section">
      <h2>${t('badges')} <span class="hint">${nEarned}/${BADGES.length}</span></h2>
      <div class="badges">${earned.slice(page * BADGE_PAGE, (page + 1) * BADGE_PAGE).map(([b, p]) => badgeTile(b, p)).join('')}</div>
      ${pages > 1 ? `<div class="pager">
        <button class="iconbtn" data-action="badge-page" data-d="-1" ${page === 0 ? 'disabled' : ''} aria-label="${t('obBack')}">‹</button>
        <div class="dots">${Array.from({ length: pages }, (_, i) => `<i class="${i === page ? 'on' : ''}"></i>`).join('')}</div>
        <button class="iconbtn" data-action="badge-page" data-d="1" ${page >= pages - 1 ? 'disabled' : ''} aria-label="${t('obNext')}">›</button>
      </div>` : ''}
    </div>

    ${perHabit.length ? `<div class="section">
      <h2>${t('byMoment')}</h2>
      <div class="card">${perHabit.map((p) => `<div class="hrow" data-tip="${esc(t('hrowTip', { done: p.done, missed: p.missed, skipped: p.skipped }))}">
        <span class="emo">${esc(p.habit.emoji)}</span>
        <span class="txt"><span class="name">${habitName(p.habit)}</span><span class="ratebar"><i style="width:${Math.round((p.rate || 0) * 100)}%"></i></span></span>
        <span class="pct ${p.rate !== null && p.rate < 0.5 ? 'low' : ''}">${pctText(p.rate)}</span>
      </div>`).join('')}</div>
    </div>` : ''}

    <div class="section">
      <h2>${t('tipsTitle')}</h2>
      <div class="card tips">${tipList.map((x) => `<p>💡 ${t(x.key, x.vars ? { ...x.vars, name: x.vars.name ? habitName({ name: x.vars.name }) : '' } : undefined)}</p>`).join('')}</div>
    </div>

    <div class="section">
      <h2>${t('shareTitle')}</h2>
      <div class="card pad">
        <p class="hint">${t('shareHint')}</p>
        <div class="btnrow" style="margin-top:12px">
          <button class="btn primary" data-action="share-progress">📤 ${t('shareProgress')}</button>
          <button class="btn" data-action="share-app">💌 ${t('inviteFriend')}</button>
        </div>
      </div>
    </div>
  </div>
  ${tabbar('progress')}`;
}

// ---- setup --------------------------------------------------------------------

// Background reminders through the relay: one switch plus an honest status line.
function pushRow(p, perm) {
  const canUse = perm === 'granted' && !p.caveat;
  let sub;
  if (p.caveat === 'iosBrowser') sub = t('pushIosHint');
  else if (perm !== 'granted') sub = t('pushNeedsPermission');
  else if (!p.enabled) sub = t('pushOffHint');
  else if (p.lastError) sub = '⚠️ ' + t('pushError') + ' <span class="muted" style="font-size:12px">(' + esc(p.lastError) + ')</span>';
  else if (p.lastSync) sub = t('pushSynced', { t: fmtWhenShort(p.lastSync), n: p.pending || 0 });
  else sub = t('pushSyncing');
  const control = `<label class="switch" data-stop><input type="checkbox" data-action="push-toggle" ${p.enabled ? 'checked' : ''} ${canUse ? '' : 'disabled'}><span></span></label>`;
  return toggleRow('📡 ' + t('pushTitle'), sub, control) +
    (p.enabled ? `<div class="row" style="justify-content:flex-end;padding:0 0 8px"><button class="btn small" data-action="push-sync">${t('pushSyncNow')}</button></div>` : '');
}

// The Moments tab: what the user has set up (repeating moments, suggestions,
// premade one-time moments). Everything about *how the app behaves* stays in
// Setup, so each tab has one job.
export function renderMoments(opts = {}) {
  const habits = state.habits.filter((h) => !h.once);
  const added = new Set(habits.map((h) => h.preset).filter(Boolean));
  const list = habits.length
    ? habits.map((h) => `<div class="item ${h.enabled === false ? 'off' : ''}" data-action="edit" data-id="${esc(h.id)}">
        <div class="emo">${esc(h.emoji)}</div>
        <div><div class="name">${habitName(h)}</div><div class="sub"><span class="dot i${h.importance}" role="img" aria-label="${[null, t('impLow'), t('impNormal'), t('impHigh')][h.importance] || ''}" title="${[null, t('impLow'), t('impNormal'), t('impHigh')][h.importance] || ''}"></span>${slotsText(h)} · ${daysText(h)}</div></div>
        <label class="switch" data-stop><input type="checkbox" data-action="toggle" data-id="${esc(h.id)}" ${h.enabled !== false ? 'checked' : ''}><span></span></label>
      </div>`).join('')
    : `<p class="hint">${t('liveNoHabitsHint')}</p>`;

  return `<div class="screen setup">
    <h1>${t('tabMoments')}</h1>
    ${opts.needsBackup ? `<div class="banner"><span>🛟 ${t('backupNeeded')}</span><button class="btn small primary" data-action="export">${t('backupNow')}</button></div>` : ''}

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
      <h2>${t('templates')}</h2>
      <p class="hint" style="margin:0 0 10px">${t('templatesHint')}</p>
      ${state.templates.length ? `<div class="list">${state.templates.map((x) => `<div class="item" data-action="tpl-edit" data-id="${esc(x.id)}">
        <div class="emo">${esc(x.emoji)}</div>
        <div><div class="name">${esc(x.name)}</div><div class="sub">${fmtDuration(x.minutes * 60000)} · ${[null, t('impLow'), t('impNormal'), t('impHigh')][x.importance]}</div></div>
        <button class="iconbtn" data-stop data-action="tpl-del" data-id="${esc(x.id)}" aria-label="${t('delete')}">✕</button>
      </div>`).join('')}</div>`
        : `<p class="hint">${t('templatesEmpty')}</p>`}
      <div class="toggle"><button class="link" data-action="tpl-add">➕ ${t('templateAdd')}</button></div>
    </div>
  </div>
  ${tabbar('moments')}`;
}

export function renderSetup(opts) {
  const s = state.settings;
  const perm = permission();

  const notifControl = perm === 'granted'
    ? `<button class="btn small" data-action="notif-test">${t('notifTest')}</button>`
    : perm === 'denied' || perm === 'unsupported' ? ''
    : `<button class="btn small primary" data-action="notif-enable">${t('notifEnable')}</button>`;

  const backupLine = state.lastBackupAt ? t('lastBackup', { t: fmtAgo(state.lastBackupAt, getLang()) }) : t('neverBackedUp');
  const folderLine = opts.canAutoImport && state.backupFolder
    ? ` · ${t('backupFolder', { name: esc(state.backupFolder) })} <button class="link" style="padding:0" data-action="change-folder">${t('changeFolder')}</button>`
    : '';

  return `<div class="screen setup">
    <h1>${t('setupTitle')}</h1>
    ${opts.needsBackup ? `<div class="banner"><span>🛟 ${t('backupNeeded')}</span><button class="btn small primary" data-action="export">${t('backupNow')}</button></div>` : ''}

    <div class="section">
      <h2>${t('settings')}</h2>
      <div class="card">
        ${toggleRow(t('language'), '', sel('lang', [['en', 'English'], ['fr', 'Français']], state.lang))}
        ${toggleRow(t('notifications'), perm === 'granted' ? t('notifOn') : perm === 'denied' ? t('notifBlocked') : t('notifOff'), notifControl)}
        ${toggleRow(t('reminderBefore'), '', sel('reminderBefore', [[0, '–'], [2, t('minutes', { n: 2 })], [5, t('minutes', { n: 5 })], [10, t('minutes', { n: 10 })], [15, t('minutes', { n: 15 })]], s.reminderBefore))}
        ${toggleRow('🌅 ' + t('yourDay'), '', `<span class="times">${timeIn('dayStart', s.dayStart || '07:00', t('wakeShort'))}<span class="muted">→</span>${timeIn('dayEnd', s.dayEnd || '22:30', t('bedShort'))}</span>`, 'times-row')}
        ${s.agenda !== false ? toggleRow('🗺️ ' + t('questReminder'), s.questReminder ? '' : t('questReminderAuto'), `<span class="times"><input class="input" type="time" data-setting="questReminder" value="${esc(s.questReminder || questReminderHM(s.dayStart))}" aria-label="${t('questReminder')}">${s.questReminder ? `<button class="iconbtn" data-action="quest-reminder-auto" title="${t('questReminderReset')}" aria-label="${t('questReminderReset')}">↺</button>` : ''}</span>`, 'times-row') : ''}
      </div>
      ${opts.push ? pushRow(opts.push, perm) : ''}
      <p class="hint" style="margin-top:10px">${opts.push ? t('notifBackgroundNotePush') : t('notifBackgroundNote')}</p>
    </div>

    <div class="section">
      <h2>${t('alertsTitle')}</h2>
      <div class="card">
        ${toggleRow(t('sound'), '', sw('sound', s.sound))}
        ${toggleRow(t('alertStyle'), '', sel('alertStyle', [['gentle', t('styleGentle')], ['alarm', t('styleAlarm')]], s.alertStyle))}
        ${s.alertStyle === 'gentle' ? toggleRow(t('criticalAlarm'), '', sw('criticalAlarm', s.criticalAlarm)) : ''}
        ${toggleRow(t('alarmSeconds'), '', sel('alarmSeconds', [10, 15, 20, 30, 60].map((n) => [n, t('seconds', { n })]), s.alarmSeconds))}
        ${toggleRow(t('tone'), '', sel('soundName', TONE_NAMES.map((n) => [n, t('toneNames')[n]]), s.soundName))}
        <div class="toggle"><div class="t">${t('volume')}</div><input type="range" min="10" max="100" step="10" value="${s.volume}" data-setting="volume" aria-label="${t('volume')}"></div>
        ${toggleRow(t('soundOutput'), s.soundOutput === 'app' ? t('soundOutputAppWarn') : '', sel('soundOutput', [['app', t('outputApp')], ['system', t('outputSystem')], ['both', t('outputBoth')]], s.soundOutput))}
        <div class="toggle"><div class="btnrow" style="margin:0;width:100%">
          <button class="btn small" data-action="test-sound">🔊 ${t('testSound')}</button>
          <button class="btn small" data-action="notif-test">🔔 ${t('testNotification')}</button>
        </div></div>
      </div>
      <div class="card" style="margin-top:10px">
        ${toggleRow(t('vibration'), '', sw('vibrate', s.vibrate))}
        ${toggleRow(t('vibSync'), '', sw('vibSync', s.vibSync))}
        ${toggleRow(t('vibPattern'), '', sel('vibPattern', PATTERN_NAMES.map((n) => [n, t('patternNames')[n]]), s.vibPattern, s.vibSync))}
        <div class="toggle"><button class="btn small" data-action="test-vibration">📳 ${t('testVibration')}</button></div>
      </div>
      <p class="hint" style="margin-top:10px">${t('alertsNote')}</p>
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
      <p class="hint" style="margin:0 0 10px">${backupLine}${folderLine}</p>
      <div class="btnrow" style="margin-top:0">
        <button class="btn" data-action="export">${t('exportData')}</button>
        ${opts.canAutoImport
          ? `<button class="btn" data-action="import-auto">🔎 ${t('findBackup')}</button>`
          : `<button class="btn" data-action="import">${t('importData')}</button>`}
        <button class="btn danger" data-action="reset">${t('resetData')}</button>
      </div>
      <label class="dontshow"><input type="checkbox" data-setting="backupSingleFile" ${s.backupSingleFile ? 'checked' : ''}>${t('backupSingleFile')}</label>
      ${opts.canAutoImport ? `<p class="hint" style="margin:10px 0 0">${t('findBackupHint')}
        <button class="link" style="padding:0" data-action="import">${t('chooseFileManually')}</button></p>` : ''}
      <input type="file" accept="application/json,.json" id="importFile" hidden>
      ${opts.recovery ? `<div class="card" style="margin-top:10px">${toggleRow(t('restoreAvailable'),
        t('savedOn', { t: fmtDateTime(opts.recovery.at) }) + (t('recReason')[opts.recovery.reason] ? ' · ' + t('recReason')[opts.recovery.reason] : ''),
        `<button class="btn small" data-action="restore-recovery">${t('restore')} · ${fmtWhenShort(opts.recovery.at)}</button>`)}</div>` : ''}
    </div>

    <div class="section">
      <h2>${t('about')}</h2>
      <div class="card">
        ${toggleRow(t('version', { v: esc(opts.version) }), opts.checkingUpdate ? t('checkingUpdate') : opts.updateReady ? t('updateAvailable') : '', opts.updateReady
          ? `<button class="btn small primary" data-action="apply-update">${t('updateNow')}</button>`
          : `<button class="btn small" data-action="check-update" ${opts.checkingUpdate ? 'disabled' : ''}>${opts.checkingUpdate ? '<span class="spinner"></span>' : ''}${t('checkUpdate')}</button>`)}
        ${toggleRow(t('updateSummaries'), t('updateSummariesHint'), sw('updateSummaries', s.updateSummaries))}
        ${toggleRow('🗺️ ' + t('agSetting'), t('agSettingHint'), sw('agenda', s.agenda !== false))}
        ${opts.canInstall ? toggleRow(t('install'), '', `<button class="btn small primary" data-action="install">${t('install')}</button>`) : ''}
        ${opts.isIosBrowser ? `<p class="hint" style="padding:10px 0">${t('obIosInstall')}</p>` : ''}
        <div class="toggle"><div><div class="t"><button class="link" style="padding:0" data-action="restart-ob">${t('onboardingRestart')}</button></div><div class="s">${t('obRestartHint')}</div></div></div>
      </div>
      <p class="hint center" style="margin-top:14px"><a class="muted" href="https://github.com/Purgator/Momen2m" target="_blank" rel="noopener">github.com/Purgator/Momen2m</a></p>
      <p class="hint center" style="margin-top:6px">${t('releaseNotesNote')} <a class="muted" href="https://github.com/Purgator/Momen2m/releases" target="_blank" rel="noopener">${t('releaseNotesLink')}</a></p>
    </div>
  </div>
  ${tabbar('setup')}`;
}

// ---- onboarding ---------------------------------------------------------------

const OB_STEPS = 6;

function obTime(key, label, value) {
  return `<div class="field"><label class="lbl">${label}</label><input class="input" type="time" data-ob="${key}" value="${value}"></div>`;
}
function yesNo(action, attrs, v) {
  return `<div class="seg mini">${['yes', 'no'].map((x) => `<button data-action="${action}" ${attrs} data-v="${x}" class="${v === x ? 'on' : ''}">${t(x === 'yes' ? 'obYes' : 'obNo')}</button>`).join('')}</div>`;
}
export function renderOnboarding(step, data) {
  const dots = `<div class="dots">${Array.from({ length: OB_STEPS }, (_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>`;
  const a = data.a;
  const skip = `<p class="skip"><button class="link" data-action="ob-skip">${t('obSkip')}</button></p>`;
  const nav = `<button class="btn ghost big" data-action="ob-back">${t('obBack')}</button><button class="btn primary big" data-action="ob-next">${t('obNext')}</button>`;
  let body = '', foot = nav;
  if (step === 0) {
    body = `<img class="logo" src="icons/icon-192.png" alt="">
      <h1>${t('obWelcomeTitle')}</h1>
      <p>${t('obWelcomeText')}</p>
      <div class="field"><span class="lbl">${t('obLanguage')}</span>
        <div class="seg"><button data-action="ob-lang" data-lang="en" class="${state.lang === 'en' ? 'on' : ''}">English</button><button data-action="ob-lang" data-lang="fr" class="${state.lang === 'fr' ? 'on' : ''}">Français</button></div>
      </div>
      <div class="note" style="margin-top:22px"><b>${t('obLoadTitle')}</b><br>${t('obLoadText')}
        <div class="btnrow" style="margin-top:12px">
          ${data.canAutoImport ? `<button class="btn small" data-action="import-auto">🔎 ${t('findBackup')}</button>` : ''}
          <button class="btn small" data-action="import">📂 ${t('obLoadFile')}</button>
        </div>
        <input type="file" accept="application/json,.json" id="importFile" hidden>
      </div>`;
    foot = `<button class="btn primary big" data-action="ob-next">${t('obNext')}</button>`;
  } else if (step === 1) {
    const work = a.work === true ? 'yes' : a.work === false ? 'no' : '';
    body = `<h1>${t('obRhythmTitle')}</h1><p>${t('obRhythmText')}</p>
      <div class="times">${obTime('wake', '⏰ ' + t('obWake'), a.wake)}${obTime('bed', '😴 ' + t('obBed'), a.bed)}</div>
      <div class="qrow" style="margin-top:10px"><div class="q"><span>💼</span>${t('obWorkQ')}</div>${yesNo('ob-work', '', work)}</div>
      ${a.work ? `<div class="times" style="margin-top:0">${obTime('workStart', t('obWorkStart'), a.workStart)}${obTime('workEnd', t('obWorkEnd'), a.workEnd)}</div>` : ''}
      ${skip}`;
  } else if (step === 2) {
    body = `<h1>${t('obQuestionsTitle')}</h1><p>${t('obQuestionsText')}</p>
      <div class="card" style="padding:0 14px">${QUESTIONS.map((q) => {
        const ans = a.q[q.id];
        const stepper = isTriggered(q, ans) && q.count
          ? `<div class="stepper"><button data-action="ob-count" data-q="${q.id}" data-d="-1" aria-label="−">−</button><b>${ans.n}</b><button data-action="ob-count" data-q="${q.id}" data-d="1" aria-label="+">+</button><span>${t('obTimesADay')}</span></div>`
          : '';
        return `<div class="qitem"><div class="qrow"><div class="q"><span>${q.emoji}</span>${t('obQ_' + q.id)}</div>${yesNo('ob-answer', `data-q="${q.id}"`, ans.v || '')}</div>${stepper}</div>`;
      }).join('')}</div>
      ${skip}`;
  } else if (step === 3) {
    // On a re-run, moments the user already has are listed too (unticked when
    // the answers no longer call for them) and every row says what validating
    // would do to it.
    const again = data.again, ex = data.existing;
    const st = (x) => (again ? reviewStatus(ex.get(x.preset.id), data.selected.has(x.preset.id), x.slots) : null);
    const label = { new: t('obStNew'), changed: t('obStChanged'), removed: t('obStRemoved'), same: t('obStSame') };
    const tip = { new: t('obTipNew'), changed: t('obTipChanged'), removed: t('obTipRemoved'), same: t('obTipSame') };
    const listed = data.proposals.filter((x) => x.proposed || (again && ex.has(x.preset.id)));
    const rest = data.proposals.filter((x) => !listed.includes(x));
    const rows = listed.map((x) => {
      const s = st(x);
      return `<div class="toggle ${s ? 'st st-' + s : ''}" ${s ? `title="${esc(tip[s])}"` : ''}><div><div class="t">${x.preset.emoji} ${esc(pick(x.preset.name))}${s && s !== 'same' ? `<span class="tag ${s}">${label[s]}</span>` : ''}</div><div class="s">${x.slots.map((sl) => sl.start).join(' · ')}</div></div>
      <label class="switch"><input type="checkbox" data-ob-pick="${x.preset.id}" ${data.selected.has(x.preset.id) ? 'checked' : ''}><span></span></label></div>`;
    }).join('');
    const legend = again ? `<div class="legend"><span class="new">${t('obStNew')}</span><span class="changed">${t('obStChanged')}</span><span class="removed">${t('obStRemoved')}</span></div>` : '';
    body = `<h1>${t('obReviewTitle')}</h1><p>${again ? t('obReviewAgainText') : data.selected.size ? t('obReviewText') : t('obReviewEmpty')}</p>${legend}
      ${rows ? `<div class="card">${rows}</div>` : ''}
      <p class="hint" style="margin:18px 0 0">${t('obMore')}</p>
      <div class="chips" style="margin-top:8px">${rest.map((x) => { const s = st(x); return `<button class="chip ${data.selected.has(x.preset.id) ? 'on' : ''} ${s ? 'st-' + s : ''}" data-action="ob-preset" data-preset="${x.preset.id}" title="${s ? esc(tip[s]) + ' ' : ''}${x.slots.map((sl) => sl.start).join(' · ')}">${x.preset.emoji} ${esc(pick(x.preset.name))}</button>`; }).join('')}</div>
      ${skip}`;
  } else if (step === 4) {
    const perm = permission();
    const status = perm === 'granted' ? `<p class="note" style="color:var(--ok)">${t('obNotifGranted')}</p>`
      : perm === 'denied' ? `<p class="note">${t('obNotifDenied')}</p>`
      : `<button class="btn primary big wide" data-action="ob-notif" style="margin-top:18px">🔔 ${t('obNotifAllow')}</button>`;
    body = `<h1>${t('obNotifTitle')}</h1><p>${t('obNotifText')}</p>${status}
      ${data.isIosBrowser ? `<p class="note">${t('obIosInstall')}</p>` : ''}
      ${data.canInstall ? `<button class="btn big wide" data-action="install" style="margin-top:14px">📲 ${t('install')}</button>` : ''}
      ${!data.isIosBrowser && !data.canInstall && !data.standalone ? `<p class="note">${t('obInstallHint')}</p>` : ''}`;
    foot = `<button class="btn ghost big" data-action="ob-back">${t('obBack')}</button><button class="btn primary big" data-action="ob-next">${t('obNext')}</button>`;
  } else {
    let summary = '';
    if (data.again) {
      const c = { new: 0, changed: 0, removed: 0 };
      for (const x of data.proposals) { const s = reviewStatus(data.existing.get(x.preset.id), data.selected.has(x.preset.id), x.slots); if (s in c) c[s]++; }
      summary = `<p class="note"><b>${t('obApplySummary', { n: c.new, c: c.changed, r: c.removed })}</b><br>${t('obApplyNote')}</p>`;
    }
    body = `<h1>${t('obBackupTitle')}</h1><p>${t('obBackupText')}</p>${summary}
      <button class="btn primary big wide" data-action="export" style="margin-top:20px">💾 ${t('backupNow')}</button>
      <label class="dontshow"><input type="checkbox" data-setting="backupSingleFile" ${state.settings.backupSingleFile ? 'checked' : ''}>${t('backupSingleFile')}</label>
      <p class="note">${t('obBackupNote')}</p>`;
    foot = `<button class="btn ghost big" data-action="ob-back">${t('obBack')}</button><button class="btn ok big" data-action="ob-start">${t('obStart')}</button>`;
  }
  return `<div class="ob"><div class="body">${body}</div>${dots}<div class="foot">${foot}</div></div>`;
}

// ---- import / restore preview ---------------------------------------------------
// Turns diffStates() output into +/−/~ rows: what the incoming data adds,
// removes and changes compared to what is on the device right now.
const DIFF_MAX = 8;
function diffRow(sign, cls, h, detail) {
  return `<div class="diff-row ${cls}"><span class="sign">${sign}</span><span class="emo">${esc(h.emoji)}</span>
    <span class="txt"><span class="name">${habitName(h)}</span>${detail ? `<span class="sub">${detail}</span>` : ''}</span></div>`;
}
function diffMore(n) { return n > 0 ? `<div class="diff-row more">${t('diffMore', { n })}</div>` : ''; }
function briefOf(h) { return slotsText(h) + ' · ' + esc(daysText(h)); }
function changeDetail(c) {
  const parts = [];
  for (const f of c.facets) {
    if (f === 'name') parts.push(`${habitName(c.from)} → ${habitName(c.to)}`);
    else if (f === 'time') parts.push(`${esc(slotsText(c.from))} → ${esc(slotsText(c.to))}`);
    else if (f === 'days') parts.push(`${esc(daysText(c.from))} → ${esc(daysText(c.to))}`);
    else if (f === 'importance') parts.push(`${t('importance')} ${c.from.importance} → ${c.to.importance}`);
    else if (f === 'enabled') parts.push(c.to.enabled === false ? t('diffPaused') : t('diffResumed'));
    else parts.push(t('diffDetails'));
  }
  return parts.join(' · ');
}
export function diffHtml(d) {
  if (d.identical) return `<div class="diff"><div class="diff-row same">= ${t('diffNone')}</div></div>`;
  let html = '<div class="diff">';
  const section = (label, cls) => { html += `<div class="diff-head ${cls}">${label}</div>`; };
  if (d.added.length) {
    section(t('diffAdded', { n: d.added.length }), 'add');
    for (const h of d.added.slice(0, DIFF_MAX)) html += diffRow('+', 'add', h, briefOf(h));
    html += diffMore(d.added.length - DIFF_MAX);
  }
  if (d.removed.length) {
    section(t('diffRemoved', { n: d.removed.length }), 'del');
    for (const h of d.removed.slice(0, DIFF_MAX)) html += diffRow('−', 'del', h, briefOf(h));
    html += diffMore(d.removed.length - DIFF_MAX);
  }
  if (d.changed.length) {
    section(t('diffChanged', { n: d.changed.length }), 'chg');
    for (const c of d.changed.slice(0, DIFF_MAX)) html += diffRow('~', 'chg', c.to, changeDetail(c));
    html += diffMore(d.changed.length - DIFF_MAX);
  }
  if (d.same.length) html += `<div class="diff-row same">= ${t('diffSame', { n: d.same.length })}</div>`;
  if (d.xp.from !== d.xp.to) html += `<div class="diff-row pts">⭐ ${t('diffPoints', { a: d.xp.from, b: d.xp.to })}</div>`;
  return html + '</div>';
}
