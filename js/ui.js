// Rendering. Pure functions from state to HTML strings, plus a few DOM helpers
// (bottom sheet, toasts, sparkles). Behaviour lives in app.js via data-action.
import { t, pick, getLang } from './i18n.js';
import { state, save } from './store.js';
import { PRESETS } from './presets.js';
import { suggestEmoji } from './emoji.js';
import { BASE_PTS, SNOOZE_PENALTY, canSnooze, currentOf, todayPoints } from './engine.js';
import { levelInfo, rankLadder, BADGES, badgeProgress, tips as gameTips } from './game.js';
import { fmtClock, fmtCountdown, fmtDuration, fmtAgo, fmtDate, fmtDateTime, fmtWhenShort, nowHM, minutesToHM, parseHM, dayKey, weekday, at } from './time.js';
import { permission, TONE_NAMES, PATTERN_NAMES } from './notify.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const RING_R = 70;
const RING_C = 2 * Math.PI * RING_R;

// ---- shared bits ------------------------------------------------------------

export function tabbar(view) {
  return `<nav class="tabbar">
    <button class="tab ${view === 'live' ? 'on' : ''}" data-action="tab" data-view="live"><span class="ico">⏱️</span>${t('tabNow')}</button>
    <button class="tab ${view === 'progress' ? 'on' : ''}" data-action="tab" data-view="progress"><span class="ico">🏆</span>${t('tabProgress')}</button>
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

function occRow(o, cls, side, extra = '', action = null) {
  return `<div class="occ ${cls} ${extra}" data-key="${esc(o.key)}" ${action ? `data-action="${action}"` : ''}>
    <div class="emo">${esc(o.habit.emoji)}</div>
    <div><div class="name">${habitName(o.habit)}</div><div class="when">${slotOf(o)}</div></div>
    ${side}
  </div>`;
}

function slotOf(o) {
  const lang = getLang();
  return fmtClock(o.start, lang) + ' – ' + fmtClock(o.end, lang);
}

// The one big "current" card. `collapsible` is true for a second (or third…)
// simultaneously active moment the user expanded by tapping it — tapping its
// header again collapses it back. The primary current moment is never
// collapsible, so it can't accidentally be tapped away.
function currentCard(o, now, collapsible = false) {
  const stake = BASE_PTS[o.habit.importance] || 20;
  const sn = canSnooze(o);
  const snoozeLabel = sn === 'ok' ? '💤 ' + t('snoozeMin', { n: state.settings.snoozeMinutes }) : sn === 'exhausted' ? t('noSnoozeLeft') : t('snoozeDisabled');
  const showSnooze = !(sn === 'disabled' && (!state.settings.snoozeAllowed || o.habit.snooze === false));
  const desc = habitDesc(o.habit);
  return `<div class="occ current ${collapsible ? 'expandable' : ''} ${o.fresh ? 'enter' : ''}" data-key="${esc(o.key)}" ${collapsible ? 'data-action="toggle-expand"' : ''}>
    <div class="emo">${esc(o.habit.emoji)}</div>
    <div class="name">${habitName(o.habit)}</div>
    ${desc ? `<div class="desc">${desc}</div>` : ''}
    <div class="when">${slotOf(o)} · <span class="stake" data-tip="${esc(t('tipStake', { n: stake, m: stake + Math.round(stake / 2) }))}">${t('ptsAtStake', { n: stake })}</span></div>
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
  const ranks = t('rankNames');
  const li = levelInfo(g.xp, ranks.length);
  const level = li.level, hi = li.hi, pct = li.pct;
  const today = todayPoints(now);
  const rank = ranks[li.rankIdx];

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
    for (const o of shown) body += occRow(o, 'past ' + o.status, pastSide(o), o.fresh ? 'leave' : '', 'recap');
  }
  if (!state.habits.length) {
    body += `<div class="empty"><div class="emo">🌱</div><h2>${t('liveNoHabits')}</h2><p>${t('liveNoHabitsHint')}</p>
      <p style="margin-top:14px"><button class="btn primary" data-action="tab" data-view="setup">${t('tabSetup')}</button></p>
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
      body += occRow(o, 'upcoming', `<div class="side">${o.snoozes ? '💤 ' : ''}<span data-in="${esc(o.key)}">${t('in', { t: fmtDuration(o.start - now, lang) })}</span></div>`, '', 'upcoming-detail');
    }
  }
  body += `</div>`;

  return `<div class="screen live">
    <div class="topbar">
      <div class="clock" data-clock>${fmtClock(now, lang)}</div>
      <div class="stats">
        <button class="stat" data-action="explain" data-topic="level" data-tip="${esc(t('tipLevel', { rank, n: hi - g.xp }))}">⭐ ${t('level', { n: level })}</button>
        ${g.streak ? `<button class="stat" data-action="explain" data-topic="streak" data-tip="${esc(t('tipStreak', { n: g.streak, best: g.bestStreak }))}">🔥 ${g.streak}</button>` : ''}
        <button class="stat today ${today < 0 ? 'neg' : ''}" data-action="explain" data-topic="today" data-tip="${esc(t('tipToday'))}">${today >= 0 ? '+' : ''}${today}</button>
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

// ---- progress -----------------------------------------------------------------

const pctText = (r) => (r === null || r === undefined ? '–' : Math.round(r * 100) + '%');
const signed = (n) => (n > 0 ? '+' : '') + n;
const dayLetter = (day) => t('dayLetters')[weekday(day)];

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

export function renderProgress(s, now) {
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
    </div>

    <div class="section">
      <h2>${t('last7')}</h2>
      <div class="card pad">${weekChart(s.week, now)}
        <p class="hint" style="margin-top:8px">${bestDay ? t('bestDay', { pts: signed(bestDay.pts), d: fmtDate(new Date(bestDay.day + 'T12:00').getTime()) }) : t('noHistoryYet')}</p>
      </div>
    </div>

    <div class="section">
      <h2>${t('badges')} <span class="hint">${nEarned}/${BADGES.length}</span></h2>
      <div class="badges">${earned.map(([b, p]) => badgeTile(b, p)).join('')}</div>
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

// Explanations behind the numbers, opened by a tap on any stat.
export function openExplainSheet(topic, s, todayOccs = []) {
  const ranks = t('rankNames');
  let html = '';
  if (topic === 'level') {
    const li = s.level;
    html = `<h2>⭐ ${t('level', { n: li.level })} · ${esc(ranks[li.rankIdx])}</h2>
      <p class="hint" style="margin-top:6px">${t('explainLevel', { xp: li.xp, n: li.toNext, l: li.level + 1 })}</p>
      <div class="xpbar" style="margin:12px 2px"><div class="xpfill" style="width:${li.pct}%"></div></div>
      <div class="card ladder">${rankLadder(ranks.length).map((r) => `<div class="lrow ${r.rankIdx === li.rankIdx ? 'on' : ''}"><span>${esc(ranks[r.rankIdx])}</span><span class="muted">${t('fromLevel', { l: r.fromLevel, xp: r.fromXp })}</span></div>`).join('')}</div>`;
  } else if (topic === 'streak') {
    const dots = s.week.map((d) => `<span class="dot-day ${d.perfect === true ? 'ok' : d.perfect === false ? 'ko' : ''}" title="${esc(d.day)}">${d.perfect === true ? '✓' : d.perfect === false ? '✗' : '·'}<small>${esc(dayLetter(d.day))}</small></span>`).join('');
    html = `<h2>🔥 ${t('streak', { n: s.streak })}</h2>
      <p class="hint" style="margin-top:6px">${t('explainStreak', { best: s.bestStreak })}</p>
      <div class="dots-week">${dots}</div>`;
  } else if (topic === 'rate') {
    const p = s.period;
    html = `<h2>🎯 ${t('successRate')} · ${pctText(p.rate)}</h2>
      <p class="hint" style="margin-top:6px">${t('explainRate', { done: p.done, missed: p.missed, skipped: p.skipped })}</p>`;
  } else {
    const today = dayKey(new Date());
    const rows = todayOccs.filter((o) => o.day === today && o.status !== 'open').sort((a, b) => a.at - b.at)
      .map((o) => `<div class="lrow"><span>${esc(o.habit.emoji)} ${habitName(o.habit)} <small class="muted">${o.status === 'done' ? t('completed') : o.status === 'missed' ? t('missed') : t('skipped')}${o.snoozes ? ' · 💤×' + o.snoozes : ''}</small></span><span class="${o.pts >= 0 ? 'pos' : 'neg'}">${signed(o.pts)}</span></div>`).join('');
    html = `<h2>${t('today')} · ${signed(s.today.pts)} pts</h2>
      <p class="hint" style="margin-top:6px">${t('explainToday')}</p>
      ${rows ? `<div class="card ladder" style="margin-top:10px">${rows}</div>` : ''}
      <div class="card ladder" style="margin-top:10px">
        <div class="lrow"><span>${t('ruleDone')}</span><span class="pos">+${BASE_PTS[1]} / +${BASE_PTS[2]} / +${BASE_PTS[3]}</span></div>
        <div class="lrow"><span>${t('ruleEarly')}</span><span class="pos">+50%</span></div>
        <div class="lrow"><span>${t('ruleMissed')}</span><span class="neg">−${BASE_PTS[1]} / −${BASE_PTS[2]} / −${BASE_PTS[3]}</span></div>
        <div class="lrow"><span>${t('ruleSkipped')}</span><span class="neg">−50%</span></div>
        <div class="lrow"><span>${t('ruleSnooze')}</span><span class="neg">−${SNOOZE_PENALTY}</span></div>
      </div>`;
  }
  const el = openSheet(html + `<div class="btnrow"><button class="btn primary wide" data-close>${t('close')}</button></div>`);
  $('[data-close]', el).addEventListener('click', closeSheet);
}

export function openBadgeSheet(b, p, { onShare } = {}) {
  const names = t('badgeNames'), descs = t('badgeDescs');
  const el = openSheet(`
    <div class="center"><div class="badge-hero ${p.earned ? 'earned' : 'locked'}">${b.emoji}</div>
    <h2>${esc(names[b.id])}</h2>
    <p class="hint" style="margin-top:6px">${esc(descs[b.id])}</p>
    ${p.earned ? `<p class="hint" style="margin-top:8px">🏅 ${t('earnedOn', { t: p.unlockedAt ? fmtDateTime(p.unlockedAt) : '—' })}</p>`
      : `<div class="bprog big"><i style="width:${Math.round((p.n / p.of) * 100)}%"></i></div><p class="hint">${t('badgeProgress', { n: p.n, of: p.of })}</p>`}</div>
    <div class="btnrow">
      ${p.earned && onShare ? `<button class="btn" data-share>📤 ${t('share')}</button>` : ''}
      <button class="btn ${p.earned && onShare ? '' : 'primary wide'}" data-close>${t('close')}</button>
    </div>`);
  $('[data-close]', el).addEventListener('click', closeSheet);
  if (p.earned && onShare) $('[data-share]', el).addEventListener('click', () => { closeSheet(); onShare(); });
}

// A bigger burst than sparkles(): centred, for level-ups and badges.
export function celebrate(emojis) {
  const x = innerWidth / 2, y = innerHeight / 2.6;
  sparkles(x, y, emojis);
  setTimeout(() => sparkles(x - 60, y + 40, emojis), 150);
  setTimeout(() => sparkles(x + 60, y + 40, emojis), 300);
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

function toggleRow(label, sub, control) {
  return `<div class="toggle"><div><div class="t">${label}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>${control}</div>`;
}
function sw(setting, on) {
  return `<label class="switch"><input type="checkbox" data-setting="${setting}" ${on ? 'checked' : ''}><span></span></label>`;
}
function sel(setting, options, value, disabled = false) {
  return `<select data-setting="${setting}" ${disabled ? 'disabled' : ''}>${options.map(([v, l]) => `<option value="${v}" ${String(v) === String(value) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
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

  const backupLine = state.lastBackupAt ? t('lastBackup', { t: fmtAgo(state.lastBackupAt, getLang()) }) : t('neverBackedUp');
  const folderLine = opts.canAutoImport && state.backupFolder
    ? ` · ${t('backupFolder', { name: esc(state.backupFolder) })} <button class="link" style="padding:0" data-action="change-folder">${t('changeFolder')}</button>`
    : '';

  return `<div class="screen setup">
    <h1>${t('setupTitle')}</h1>
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
      <h2>${t('settings')}</h2>
      <div class="card">
        ${toggleRow(t('language'), '', sel('lang', [['en', 'English'], ['fr', 'Français']], state.lang))}
        ${toggleRow(t('notifications'), perm === 'granted' ? t('notifOn') : perm === 'denied' ? t('notifBlocked') : t('notifOff'), notifControl)}
        ${toggleRow(t('reminderBefore'), '', sel('reminderBefore', [[0, '–'], [2, t('minutes', { n: 2 })], [5, t('minutes', { n: 5 })], [10, t('minutes', { n: 10 })], [15, t('minutes', { n: 15 })]], s.reminderBefore))}
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
        ${opts.canInstall ? toggleRow(t('install'), '', `<button class="btn small primary" data-action="install">${t('install')}</button>`) : ''}
        ${opts.isIosBrowser ? `<p class="hint" style="padding:10px 0">${t('obIosInstall')}</p>` : ''}
        <div class="toggle"><button class="link" data-action="restart-ob">${t('onboardingRestart')}</button></div>
      </div>
      <p class="hint center" style="margin-top:14px"><a class="muted" href="https://github.com/Purgator/Momen2m" target="_blank" rel="noopener">github.com/Purgator/Momen2m</a></p>
      <p class="hint center" style="margin-top:6px">${t('releaseNotesNote')} <a class="muted" href="https://github.com/Purgator/Momen2m/releases" target="_blank" rel="noopener">${t('releaseNotesLink')}</a></p>
    </div>
  </div>
  ${tabbar('setup')}`;
}

// ---- onboarding ---------------------------------------------------------------

const OB_STEPS = 4;
export function renderOnboarding(step, data) {
  const dots = `<div class="dots">${Array.from({ length: OB_STEPS }, (_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>`;
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
  } else if (step === 2) {
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
    body = `<h1>${t('obBackupTitle')}</h1><p>${t('obBackupText')}</p>
      <button class="btn primary big wide" data-action="export" style="margin-top:20px">💾 ${t('backupNow')}</button>
      <p class="note">${t('obBackupNote')}</p>`;
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
  const b = backdropEl, sh = sheetEl;
  requestAnimationFrame(() => { b.classList.add('open'); sh.classList.add('open'); });
  return sheetEl;
}

const dayNames = () => t('days');

// Minutes between start and end, across midnight if needed (a 0-length slot counts as a full day).
export function durationOf(s) {
  return ((parseHM(s.end) - parseHM(s.start)) % 1440 + 1440) % 1440 || 1440;
}

// One time slot, either "start → end" or "start + duration". Both read back as
// {start, end}: the stored model never changes, only the way it is typed.
function slotRow(s, i, mode = state.settings.slotMode) {
  if (mode === 'dur') {
    return `<div class="slot dur" data-slot="${i}">
      <input class="input" type="time" value="${s.start}" data-f="start" required>
      <div class="durctl"><input class="input" type="number" inputmode="numeric" min="1" max="1440" step="5" value="${durationOf(s)}" data-f="dur" required><span class="unit">min</span></div>
      <button class="iconbtn" data-rm="${i}" aria-label="${t('delete')}">✕</button>
    </div>`;
  }
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
    <div class="field"><div class="fieldhead"><label>${t('timeRange')}</label>
        <div class="seg mini" data-slotmode>
          <button data-mode="dur" class="${state.settings.slotMode === 'dur' ? 'on' : ''}">${t('slotModeDur')}</button>
          <button data-mode="end" class="${state.settings.slotMode !== 'dur' ? 'on' : ''}">${t('slotModeEnd')}</button>
        </div></div>
      <div data-slots>${h.slots.map((s, i) => slotRow(s, i)).join('')}</div>
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
  const readSlots = () => $$('.slot', slotsEl).map((r) => {
    const start = $('[data-f="start"]', r).value || '09:00';
    const durIn = $('[data-f="dur"]', r);
    if (durIn) {
      const mins = Math.min(1440, Math.max(1, Math.round(Number(durIn.value) || 30)));
      return { start, end: minutesToHM((parseHM(start) + mins) % 1440) };
    }
    return { start, end: $('[data-f="end"]', r).value || start };
  });
  const renderSlots = (cur) => { slotsEl.innerHTML = cur.map((s, i) => slotRow(s, i)).join(''); };
  $('[data-slotmode]', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]'); if (!b) return;
    const cur = readSlots(); // keep what was typed, re-express it in the other form
    state.settings.slotMode = b.dataset.mode; save();
    $$('button', e.currentTarget).forEach((x) => x.classList.toggle('on', x === b));
    renderSlots(cur);
  });
  $('[data-add-slot]', el).addEventListener('click', () => {
    const cur = readSlots();
    const last = cur[cur.length - 1];
    const len = last ? durationOf(last) : 60;
    const startMin = last ? parseHM(last.end) + 60 : parseHM(nowHM());
    cur.push({ start: minutesToHM(startMin % 1440), end: minutesToHM((startMin + len) % 1440) });
    renderSlots(cur);
  });
  slotsEl.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (!rm) return;
    const cur = readSlots();
    if (cur.length <= 1) return;
    cur.splice(Number(rm.dataset.rm), 1);
    renderSlots(cur);
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
  let startOffset = 0;      // minutes from now (chips), or
  let startHM = null;       // an explicit clock time ("At…")
  const lang = getLang();
  const el = openSheet(`
    <h2>⚡ ${t('quickTaskTitle')}</h2>
    <div class="field"><label>${t('quickTaskName')}</label>
      <div class="row"><input class="input emoji-in" data-f="emoji" value="✅" maxlength="4" aria-label="${t('emoji')}">
      <input class="input" data-f="name" placeholder="${t('namePlaceholder')}" autocomplete="off" enterkeyhint="done"></div></div>
    <div class="field"><label>${t('quickWhen')}</label>
      <div class="chips" data-when>
        <button class="chip on" data-off="0">${t('now')}</button>
        ${[15, 30, 60, 120].map((m) => `<button class="chip" data-off="${m}">+${fmtDuration(m * 60000, lang)}</button>`).join('')}
        <button class="chip" data-at>⏰ ${t('atTime')}</button>
      </div>
      <input class="input" type="time" data-f="startat" style="margin-top:8px;display:none">
      <p class="hint" data-summary style="margin-top:8px"></p></div>
    <div class="field"><label>${t('quickTaskDuration')}</label>
      <div class="chips" data-dur>${[10, 15, 30, 45, 60, 120].map((m) => `<button class="chip ${m === minutes ? 'on' : ''}" data-min="${m}">${fmtDuration(m * 60000, lang)}</button>`).join('')}</div></div>
    <div class="field"><label>${t('importance')}</label>
      <div class="seg" data-imp>${[1, 2, 3].map((i) => `<button data-imp="${i}" class="${importance === i ? 'on' : ''}">${[null, t('impLow'), t('impNormal'), t('impHigh')][i]}</button>`).join('')}</div></div>
    <div class="btnrow"><button class="btn ghost" data-cancel>${t('cancel')}</button><button class="btn primary" data-save>${t('quickAdd')}</button></div>`);
  const nameIn = $('[data-f="name"]', el), emojiIn = $('[data-f="emoji"]', el);
  let autoEmoji = true;
  nameIn.addEventListener('input', () => { if (autoEmoji) emojiIn.value = suggestEmoji(nameIn.value); });
  emojiIn.addEventListener('input', () => { autoEmoji = !emojiIn.value.trim(); });
  // Resolves the chosen start into {start, tomorrow}: an explicit time already
  // behind us means tomorrow; "+N min" is relative to the moment of the tap.
  const resolveStart = () => {
    const nowMin = parseHM(nowHM());
    if (startHM) return { start: startHM, tomorrow: parseHM(startHM) < nowMin };
    return { start: minutesToHM((nowMin + startOffset) % 1440), tomorrow: nowMin + startOffset >= 1440 };
  };
  const summary = $('[data-summary]', el);
  const updateSummary = () => {
    const { start, tomorrow } = resolveStart();
    const end = minutesToHM((parseHM(start) + minutes) % 1440);
    const fmt = (hm) => fmtClock(at(dayKey(), hm), lang);
    summary.textContent = tomorrow ? t('quickSummaryTomorrow', { t1: fmt(start), t2: fmt(end) })
      : startOffset === 0 && !startHM ? t('quickSummaryNow', { t2: fmt(end) })
      : t('quickSummaryAt', { t1: fmt(start), t2: fmt(end) });
  };
  const startIn = $('[data-f="startat"]', el);
  $('[data-when]', el).addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c) return;
    $$('.chip', e.currentTarget).forEach((x) => x.classList.toggle('on', x === c));
    if (c.hasAttribute('data-at')) {
      startIn.style.display = '';
      if (!startIn.value) startIn.value = minutesToHM((parseHM(nowHM()) + 60) % 1440);
      startHM = startIn.value;
      startIn.focus();
    } else {
      startIn.style.display = 'none';
      startHM = null;
      startOffset = Number(c.dataset.off);
    }
    updateSummary();
  });
  startIn.addEventListener('input', () => { if (startIn.value) { startHM = startIn.value; updateSummary(); } });
  $('[data-dur]', el).addEventListener('click', (e) => {
    const c = e.target.closest('[data-min]'); if (!c) return;
    minutes = Number(c.dataset.min);
    $$('.chip', e.currentTarget).forEach((x) => x.classList.toggle('on', x === c));
    updateSummary();
  });
  updateSummary();
  $('[data-imp]', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-imp]'); if (!b || !b.dataset.imp) return;
    importance = Number(b.dataset.imp);
    $$('button', e.currentTarget).forEach((x) => x.classList.toggle('on', x === b));
  });
  const submit = () => {
    const name = nameIn.value.trim();
    if (!name) { nameIn.classList.add('shake'); setTimeout(() => nameIn.classList.remove('shake'), 500); return; }
    closeSheet();
    onAdd({ name, emoji: emojiIn.value.trim() || suggestEmoji(name), minutes, importance, ...resolveStart() });
  };
  $('[data-cancel]', el).addEventListener('click', closeSheet);
  $('[data-save]', el).addEventListener('click', submit);
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  setTimeout(() => nameIn.focus(), 300);
}

// A plain Cancel/Confirm sheet for a single destructive decision (used by Import).
export function openConfirmSheet({ title, body, confirmLabel, onConfirm }) {
  const el = openSheet(`
    <h2>${esc(title)}</h2>
    <div class="hint" style="margin:10px 0 4px">${body}</div>
    <div class="btnrow">
      <button class="btn ghost" data-cancel>${t('cancel')}</button>
      <button class="btn primary" data-confirm>${esc(confirmLabel)}</button>
    </div>`);
  $('[data-cancel]', el).addEventListener('click', closeSheet);
  $('[data-confirm]', el).addEventListener('click', () => { closeSheet(); onConfirm(); });
}

// Shown once right after the app applies an update (a fresh reload landed on
// a newer version). `note` is the changelog line for that version, if any.
export function openUpdateSheet(version, note) {
  const el = openSheet(`
    <h2>🎉 ${t('updatedTitle', { v: esc(version) })}</h2>
    <p class="hint" style="margin-top:6px">${esc(note || t('updatedGeneric'))}</p>
    <div class="btnrow"><button class="btn primary wide" data-close>${t('close')}</button></div>`);
  $('[data-close]', el).addEventListener('click', closeSheet);
}

// Reset needs a stronger, more deliberate choice than a single OK button: the
// safe path (back up, then erase) is the prominent one, erasing without a
// backup is a plain text link, and cancelling needs no confirmation.
export function openResetSheet(onBackupThenErase, onEraseOnly) {
  const el = openSheet(`
    <h2>⚠️ ${t('resetData')}</h2>
    <p class="hint" style="margin:10px 0 16px">${t('confirmReset')}</p>
    <button class="btn primary wide" data-backup-erase>💾 ${t('backupThenErase')}</button>
    <p class="center" style="margin-top:14px"><button class="link" data-erase-only>${t('eraseWithoutBackup')}</button></p>
    <div class="btnrow" style="margin-top:10px"><button class="btn ghost wide" data-cancel>${t('cancel')}</button></div>`);
  $('[data-cancel]', el).addEventListener('click', closeSheet);
  $('[data-backup-erase]', el).addEventListener('click', () => { closeSheet(); onBackupThenErase(); });
  $('[data-erase-only]', el).addEventListener('click', () => { closeSheet(); onEraseOnly(); });
}

// Read-only recap for a done/missed/skipped moment, with Undo when it's still
// fresh enough to matter (mirrors the inline Undo already on the row itself).
export function openRecapSheet(o, { onUndo } = {}) {
  const desc = habitDesc(o.habit);
  const lang = getLang();
  const statusWord = o.status === 'done' ? t('completed') : o.status === 'missed' ? t('missed') : t('skipped');
  const ptsText = (o.pts > 0 ? '+' : '') + o.pts + ' pts';
  const canUndo = !!onUndo && (o.status === 'done' || o.status === 'skipped') && Date.now() - o.at < 5 * 60000;
  const el = openSheet(`
    <h2>${esc(o.habit.emoji)} ${habitName(o.habit)}</h2>
    ${desc ? `<p class="hint" style="margin-top:2px">${desc}</p>` : ''}
    <div class="card" style="margin-top:14px">
      ${toggleRow(t('timeRange'), '', `<span>${slotOf(o)}</span>`)}
      ${toggleRow(statusWord, o.at ? fmtClock(o.at, lang) : '', `<span style="font-weight:700">${ptsText}</span>`)}
    </div>
    <div class="btnrow">
      ${canUndo ? `<button class="btn" data-undo>${t('undo')}</button>` : ''}
      <button class="btn ${canUndo ? '' : 'primary wide'}" data-close>${t('close')}</button>
    </div>`);
  $('[data-close]', el).addEventListener('click', closeSheet);
  if (canUndo) $('[data-undo]', el).addEventListener('click', () => { closeSheet(); onUndo(); });
}

// Lets an upcoming moment be resolved ahead of its scheduled time, without
// waiting for it to become the current one — e.g. "I already did this later
// today" or "I know I'll skip this one".
export function openUpcomingSheet(o, { onDoNow, onSkip } = {}) {
  const desc = habitDesc(o.habit);
  const lang = getLang();
  const el = openSheet(`
    <h2>${esc(o.habit.emoji)} ${habitName(o.habit)}</h2>
    ${desc ? `<p class="hint" style="margin-top:2px">${desc}</p>` : ''}
    <p class="hint" style="margin-top:10px">${slotOf(o)} · ${t('in', { t: fmtDuration(o.start - Date.now(), lang) })}</p>
    <div class="btnrow" style="margin-top:16px">
      <button class="btn ok" data-donenow>✓ ${t('doNow')}</button>
      <button class="btn danger" data-skip>${t('skip')}</button>
    </div>
    <button class="btn ghost wide" style="margin-top:10px" data-close>${t('close')}</button>`);
  $('[data-close]', el).addEventListener('click', closeSheet);
  $('[data-donenow]', el).addEventListener('click', () => { closeSheet(); onDoNow(); });
  $('[data-skip]', el).addEventListener('click', () => { closeSheet(); onSkip(); });
}

// ---- toasts & sparkles --------------------------------------------------------

// ---- import / restore preview ---------------------------------------------------
// Turns diffStates() output into +/−/~ rows: what the incoming data adds,
// removes and changes compared to what is on the device right now.
const DIFF_MAX = 8;
function diffRow(sign, cls, h, detail) {
  return `<div class="diff-row ${cls}"><span class="sign">${sign}</span><span class="emo">${esc(h.emoji)}</span>
    <span class="txt"><span class="name">${habitName(h)}</span>${detail ? `<span class="sub">${detail}</span>` : ''}</span></div>`;
}
function diffMore(n) { return n > 0 ? `<div class="diff-row more">${t('diffMore', { n })}</div>` : ''; }
function briefOf(h) { return esc(slotsText(h)) + ' · ' + esc(daysText(h)); }
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
