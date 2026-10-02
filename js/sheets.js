// Every bottom sheet of the app (moments, setup, progress). Quest sheets live
// in agenda.js. Pure UI: each takes callbacks, behaviour stays in app.js.
import { $, $$, esc, pctText, signed, shake } from './dom.js';
import { openSheet, closeSheet, confirmDialog } from './sheet.js';
import { toast } from './toast.js';
import { habitName, habitDesc, slotOf, dayLetter, dayNames, toggleRow, slotRow, durationOf } from './widgets.js';
import { t, pick } from './i18n.js';
import { state, save } from './store.js';
import { suggestEmoji } from './emoji.js';
import { BASE_PTS, SNOOZE_PENALTY, PAUSE_MAX, PAUSE_XP, PAUSE_MS, boostActive } from './engine.js';
import { rankLadder, badgeProgress } from './game.js';
import { pointsOn as agendaPointsOn } from './plans.js';
import { fmtClock, fmtDuration, fmtDateTime, nowHM, minutesToHM, parseHM, dayKey, at } from './time.js';

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
      ${boostActive(Date.now()) ? `<p class="hint boost-hint" style="margin-top:6px">⚡ ${t('boostBanner', { until: fmtClock(state.game.boostUntil) })}</p>` : ''}
      ${rows || agendaPointsOn(today) ? `<div class="card ladder" style="margin-top:10px">${rows}${agendaPointsOn(today) ? `<div class="lrow"><span>🗺️ ${t('tabAgenda')}</span><span class="pos">+${agendaPointsOn(today)}</span></div>` : ''}</div>` : ''}
      <div class="card ladder" style="margin-top:10px">
        <div class="lrow"><span>${t('ruleDone')}</span><span class="pos">+${BASE_PTS[1]} / +${BASE_PTS[2]} / +${BASE_PTS[3]}</span></div>
        <div class="lrow"><span>${t('ruleEarly')}</span><span class="pos">+50%</span></div>
        <div class="lrow"><span>${t('ruleMissed')}</span><span class="neg">−${BASE_PTS[1]} / −${BASE_PTS[2]} / −${BASE_PTS[3]}</span></div>
        <div class="lrow"><span>${t('ruleSkipped')}</span><span class="neg">−50%</span></div>
        <div class="lrow"><span>${t('ruleSnooze')}</span><span class="neg">−${SNOOZE_PENALTY}</span></div>
        <div class="lrow"><span>${t('ruleLate')}</span><span class="pos">+25%</span></div>
        <div class="lrow"><span>${t('ruleBoost')}</span><span class="pos">×1.5</span></div>
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

// The pause stock: what it is, progress to the next one, and — when some are
// in stock and none is running — buttons to spend one to three at once.
export function openPauseSheet({ tokens, xp, until }, onPause) {
  const hours = (n) => fmtDuration(n * PAUSE_MS);
  const pct = Math.min(100, Math.round((xp / PAUSE_XP) * 100));
  const el = openSheet(`
    <h2>⏸️ ${t('pauseTitle', { n: tokens, max: PAUSE_MAX })}</h2>
    <p class="hint" style="margin-top:6px">${t('pauseExplain', { h: hours(1), pts: PAUSE_XP, max: PAUSE_MAX })}</p>
    ${tokens < PAUSE_MAX
      ? `<div class="xpbar" style="margin:12px 2px"><div class="xpfill" style="width:${pct}%"></div></div><p class="hint">${t('pauseProgress', { n: PAUSE_XP - xp })}</p>`
      : `<p class="hint" style="margin-top:8px">${t('pauseFull')}</p>`}
    ${until ? `<p class="hint boost-hint" style="margin-top:12px">⏸️ ${t('pausedBanner', { until: fmtClock(until) })}</p>`
      : tokens ? `<p class="hint" style="margin-top:12px">${t('pauseUseHint')}</p>
        <div class="btnrow" style="margin-top:8px">${[1, 2, 3].filter((n) => n <= tokens).map((n) => `<button class="btn" data-pause="${n}">${t('pauseBtn', { h: hours(n), n })}</button>`).join('')}</div>`
      : ''}
    <div class="btnrow"><button class="btn primary wide" data-close>${t('close')}</button></div>`);
  $('[data-close]', el).addEventListener('click', closeSheet);
  $$('[data-pause]', el).forEach((b) => b.addEventListener('click', () => { closeSheet(); onPause(Number(b.dataset.pause)); }));
}

// Announces a freshly granted boost. Closes on OK or a tap outside.
export function openBoostSheet(until) {
  const el = openSheet(`
    <div class="center"><div class="badge-hero earned">⚡</div>
    <h2>${t('boostTitle')}</h2>
    <p class="hint" style="margin-top:6px">${t('boostBody', { until: fmtClock(until) })}</p></div>
    <div class="btnrow"><button class="btn primary wide" data-close>${t('ok')}</button></div>`);
  $('[data-close]', el).addEventListener('click', closeSheet);
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
  const del = $('[data-del]', el); if (del) del.addEventListener('click', async () => { if (await confirmDialog(t('confirmDelete'), { okLabel: t('delete'), danger: true })) { closeSheet(); onDelete(); } });
  $('[data-save]', el).addEventListener('click', () => {
    const slots = readSlots().filter((s) => s.start && s.end);
    const name = nameIn.value.trim();
    if (!name || !slots.length || (!h.once && !h.days.length)) { shake(nameIn); toast(t('invalidTime'), 'bad'); return; }
    h.name = name;
    h.emoji = emojiIn.value.trim() || suggestEmoji(name);
    h.desc = $('[data-f="desc"]', el).value.trim();
    h.slots = slots;
    h.snooze = $('[data-f="snooze"]', el).checked;
    const en = $('[data-f="enabled"]', el); if (en) h.enabled = en.checked;
    if (onSave(h) === false) return; // refused (duplicate name): keep editing
    closeSheet();
  });
  setTimeout(() => { if (!habit) nameIn.focus(); }, 300);
}

// One-off task. onAdd({ name, emoji, minutes, importance })
// `templates` are premade one-time moments: a tap fills the form; the "Save as
// premade" switch turns Add into Save + Add (onSaveTemplate gets the same data).
export function openQuickSheet(onAdd, { templates = [], onSaveTemplate } = {}) {
  let minutes = 30, importance = 2;
  let startOffset = 0;      // minutes from now (chips), or
  let startHM = null;       // an explicit clock time ("At…")
  const el = openSheet(`
    <h2>⚡ ${t('quickTaskTitle')}</h2>
    ${templates.length ? `<div class="field"><label>${t('templates')}</label>
      <div class="chips" data-templates>${templates.map((x) => `<button class="chip" data-tpl="${esc(x.id)}" title="${fmtDuration(x.minutes * 60000)}">${esc(x.emoji)} ${esc(x.name)}</button>`).join('')}</div></div>` : ''}
    <div class="field"><label>${t('quickTaskName')}</label>
      <div class="row"><input class="input emoji-in" data-f="emoji" value="✅" maxlength="4" aria-label="${t('emoji')}">
      <input class="input" data-f="name" placeholder="${t('namePlaceholder')}" autocomplete="off" enterkeyhint="done"></div></div>
    <div class="field"><label>${t('quickWhen')}</label>
      <div class="chips" data-when>
        <button class="chip on" data-off="0">${t('now')}</button>
        ${[15, 30, 60, 120].map((m) => `<button class="chip" data-off="${m}">+${fmtDuration(m * 60000)}</button>`).join('')}
        <button class="chip" data-at>⏰ ${t('atTime')}</button>
      </div>
      <input class="input" type="time" data-f="startat" style="margin-top:8px;display:none">
      <p class="hint" data-summary style="margin-top:8px"></p></div>
    <div class="field"><label>${t('quickTaskDuration')}</label>
      <div class="chips" data-dur>${[10, 15, 30, 45, 60, 120].map((m) => `<button class="chip ${m === minutes ? 'on' : ''}" data-min="${m}">${fmtDuration(m * 60000)}</button>`).join('')}</div></div>
    <div class="field"><label>${t('importance')}</label>
      <div class="seg" data-imp>${[1, 2, 3].map((i) => `<button data-imp="${i}" class="${importance === i ? 'on' : ''}">${[null, t('impLow'), t('impNormal'), t('impHigh')][i]}</button>`).join('')}</div></div>
    ${onSaveTemplate ? `<label class="dontshow"><input type="checkbox" data-f="template">${t('saveAsTemplate')}</label>` : ''}
    <div class="btnrow"><button class="btn ghost" data-cancel>✖️ ${t('cancel')}</button><button class="btn" data-save-tpl hidden>💾 ${t('save')}</button><button class="btn primary" data-save><span data-add-icon>➕</span> ${t('quickAdd')}</button></div>`);
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
    const fmt = (hm) => fmtClock(at(dayKey(), hm));
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
  const tplBox = $('[data-f="template"]', el), tplBtn = $('[data-save-tpl]', el);
  const addIcon = $('[data-add-icon]', el);
  // Checked: Add also saves a premade, so its icon says both at a glance.
  if (tplBox) tplBox.addEventListener('change', () => { tplBtn.hidden = !tplBox.checked; addIcon.textContent = tplBox.checked ? '💾➕' : '➕'; });
  const tplChips = $('[data-templates]', el);
  if (tplChips) tplChips.addEventListener('click', (e) => {
    const c = e.target.closest('[data-tpl]'); if (!c) return;
    const x = templates.find((y) => y.id === c.dataset.tpl); if (!x) return;
    $$('.chip', tplChips).forEach((y) => y.classList.toggle('on', y === c));
    nameIn.value = x.name; emojiIn.value = x.emoji; autoEmoji = false;
    minutes = x.minutes; importance = x.importance;
    $$('[data-dur] .chip', el).forEach((y) => y.classList.toggle('on', Number(y.dataset.min) === minutes));
    $$('[data-imp] button', el).forEach((y) => y.classList.toggle('on', Number(y.dataset.imp) === importance));
    updateSummary();
  });
  // Returns the form's data, or null (with a shake) when there is no name.
  const read = () => {
    const name = nameIn.value.trim();
    if (!name) { shake(nameIn); return null; }
    return { name, emoji: emojiIn.value.trim() || suggestEmoji(name), minutes, importance };
  };
  const submit = async () => {
    const d = read(); if (!d) return;
    // onAdd may back out (premade replacement declined): the sheet stays open.
    if ((await onAdd({ ...d, ...resolveStart(), saveTemplate: !!(tplBox && tplBox.checked) })) === false) return;
    closeSheet();
  };
  $('[data-cancel]', el).addEventListener('click', closeSheet);
  $('[data-save]', el).addEventListener('click', submit);
  tplBtn.addEventListener('click', async () => { const d = read(); if (!d) return; if ((await onSaveTemplate(d)) === false) return; closeSheet(); });
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  setTimeout(() => nameIn.focus(), 300);
}

// Create or edit a premade one-time moment, from Setup. `tpl` is null for a new
// one. onSave may return false (replacing another premade was declined) to
// keep editing; onDelete is only wired when editing an existing one.
export function openTemplateSheet(tpl, onSave, onDelete) {
  const x = tpl || { name: '', emoji: '⭐', minutes: 30, importance: 2 };
  let minutes = x.minutes, importance = x.importance;
  const el = openSheet(`
    <h2>⭐ ${t('templates')}</h2>
    <div class="field"><label>${t('quickTaskName')}</label>
      <div class="row"><input class="input emoji-in" data-f="emoji" value="${esc(x.emoji)}" maxlength="4" aria-label="${t('emoji')}">
      <input class="input" data-f="name" value="${esc(x.name)}" placeholder="${t('namePlaceholder')}" autocomplete="off" enterkeyhint="done"></div></div>
    <div class="field"><label>${t('quickTaskDuration')}</label>
      <div class="chips" data-dur>${[10, 15, 30, 45, 60, 120].map((m) => `<button class="chip ${m === minutes ? 'on' : ''}" data-min="${m}">${fmtDuration(m * 60000)}</button>`).join('')}</div></div>
    <div class="field"><label>${t('importance')}</label>
      <div class="seg" data-imp>${[1, 2, 3].map((i) => `<button data-imp="${i}" class="${importance === i ? 'on' : ''}">${[null, t('impLow'), t('impNormal'), t('impHigh')][i]}</button>`).join('')}</div></div>
    <div class="btnrow">
      ${tpl ? `<button class="btn danger" data-del>🗑️ ${t('delete')}</button>` : `<button class="btn ghost" data-cancel>✖️ ${t('cancel')}</button>`}
      <button class="btn primary" data-save>💾 ${t('save')}</button>
    </div>`);
  const nameIn = $('[data-f="name"]', el), emojiIn = $('[data-f="emoji"]', el);
  let autoEmoji = !x.name;
  nameIn.addEventListener('input', () => { if (autoEmoji) emojiIn.value = suggestEmoji(nameIn.value); });
  emojiIn.addEventListener('input', () => { autoEmoji = !emojiIn.value.trim(); });
  $('[data-dur]', el).addEventListener('click', (e) => {
    const c = e.target.closest('[data-min]'); if (!c) return;
    minutes = Number(c.dataset.min);
    $$('.chip', e.currentTarget).forEach((y) => y.classList.toggle('on', y === c));
  });
  $('[data-imp]', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-imp]'); if (!b) return;
    importance = Number(b.dataset.imp);
    $$('button', e.currentTarget).forEach((y) => y.classList.toggle('on', y === b));
  });
  const cancel = $('[data-cancel]', el); if (cancel) cancel.addEventListener('click', closeSheet);
  $('[data-save]', el).addEventListener('click', async () => {
    const name = nameIn.value.trim();
    if (!name) { shake(nameIn); return; }
    if ((await onSave({ name, emoji: emojiIn.value.trim() || suggestEmoji(name), minutes, importance })) === false) return;
    closeSheet();
  });
  const del = $('[data-del]', el); if (del) del.addEventListener('click', () => { closeSheet(); onDelete(); });
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('[data-save]', el).click(); });
  if (!tpl) setTimeout(() => nameIn.focus(), 300); // editing: the sheet shows whole, no keyboard first
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
// `notes` is [{v, lines}] newest first — every release since the last one
// seen, so skipping versions loses nothing. onClose(dontShowAgain) fires
// however the sheet is dismissed (button or backdrop).
export function openUpdateSheet(version, notes, onClose) {
  const many = notes.length > 1;
  const list = notes.map((n) => `${many ? `<h3>${t('version', { v: esc(n.v) })}</h3>` : ''}
    <ul>${(n.lines.length ? n.lines : [t('updatedGeneric')]).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`).join('');
  let el = null;
  const read = () => onClose(!!(el && $('[data-dontshow]', el).checked));
  el = openSheet(`
    <h2>🎉 ${t('updatedTitle', { v: esc(version) })}</h2>
    <div class="notes">${list}</div>
    <label class="dontshow"><input type="checkbox" data-dontshow>${t('dontShowAgain')}</label>
    <div class="btnrow"><button class="btn primary wide" data-close>${t('close')}</button></div>`, read);
  el.classList.add('update');
  $('[data-close]', el).addEventListener('click', () => { read(); closeSheet(); });
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
// `onLate` is passed only while a missed moment can still be completed late
// (see engine.canCompleteLate): the button lifts the penalty for a quarter
// of the points, so a bad day is recoverable without being free.
export function openRecapSheet(o, { onUndo, onLate, latePts } = {}) {
  const desc = habitDesc(o.habit);
  const statusWord = o.status === 'done' ? (o.late ? t('completedLate') : t('completed')) : o.status === 'missed' ? t('missed') : t('skipped');
  const ptsText = (o.pts > 0 ? '+' : '') + o.pts + ' pts';
  const canUndo = !!onUndo && (o.status === 'done' || o.status === 'skipped') && Date.now() - o.at < 5 * 60000;
  const canLate = !!onLate;
  const el = openSheet(`
    <h2>${esc(o.habit.emoji)} ${habitName(o.habit)}</h2>
    ${desc ? `<p class="hint" style="margin-top:2px">${desc}</p>` : ''}
    <div class="card" style="margin-top:14px">
      ${toggleRow(t('timeRange'), '', `<span>${slotOf(o)}</span>`)}
      ${toggleRow(statusWord, o.at ? fmtClock(o.at) : '', `<span style="font-weight:700">${ptsText}</span>`)}
    </div>
    ${canLate ? `<p class="hint" style="margin-top:10px">${t('doneLateHint', { pts: latePts })}</p>` : ''}
    <div class="btnrow">
      ${canUndo ? `<button class="btn" data-undo>${t('undo')}</button>` : ''}
      ${canLate ? `<button class="btn ok" data-late>✅ ${t('doneLate')}</button>` : ''}
      <button class="btn ${canUndo || canLate ? '' : 'primary wide'}" data-close>${t('close')}</button>
    </div>`);
  $('[data-close]', el).addEventListener('click', closeSheet);
  if (canUndo) $('[data-undo]', el).addEventListener('click', () => { closeSheet(); onUndo(); });
  if (canLate) $('[data-late]', el).addEventListener('click', () => { closeSheet(); onLate(); });
}

// Lets an upcoming moment be resolved ahead of its scheduled time, without
// waiting for it to become the current one — e.g. "I already did this later
// today" or "I know I'll skip this one".
export function openUpcomingSheet(o, { onDoNow, onSkip } = {}) {
  const desc = habitDesc(o.habit);
  const el = openSheet(`
    <h2>${esc(o.habit.emoji)} ${habitName(o.habit)}</h2>
    ${desc ? `<p class="hint" style="margin-top:2px">${desc}</p>` : ''}
    <p class="hint" style="margin-top:10px">${slotOf(o)} · ${t('in', { t: fmtDuration(o.start - Date.now()) })}</p>
    <div class="btnrow" style="margin-top:16px">
      <button class="btn ok" data-donenow>✓ ${t('doNow')}</button>
      <button class="btn danger" data-skip>${t('skip')}</button>
    </div>
    <button class="btn ghost wide" style="margin-top:10px" data-close>${t('close')}</button>`);
  $('[data-close]', el).addEventListener('click', closeSheet);
  $('[data-donenow]', el).addEventListener('click', () => { closeSheet(); onDoNow(); });
  $('[data-skip]', el).addEventListener('click', () => { closeSheet(); onSkip(); });
}
