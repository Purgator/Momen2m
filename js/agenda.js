// The Quests tab: goals planned as steps, walked day by day. Rendering and
// sheets only — the rules live in plans.js, behaviour in app.js via data-action.
import { t } from './i18n.js';
import { state } from './store.js';
import { esc, $, $$, openSheet, closeSheet, tabbar, toast } from './ui.js';
import { suggestEmoji } from './emoji.js';
import { dayKey, addDays, fmtDate, dayStart } from './time.js';
import { drawQR } from './qr.js';
import * as P from './plans.js';

const pctText = (x) => Math.round(x * 100) + '%';
const stepName = (p, b) => esc(b.title) || t('agStep', { n: p.blocks.indexOf(b) + 1 });
const daysText = (n) => t(n === 1 ? 'agOneDay' : 'agDays', { n });
const dateOf = (day) => fmtDate(new Date(day + 'T12:00'));
const span = (x) => dateOf(x.from) + (x.block.days > 1 ? ' – ' + dateOf(x.to) : '');
const shake = (el) => { el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 500); };
const goalTitle = (p) => esc(p.emoji) + ' ' + (esc(p.name) || t('agUntitled'));

export function renderAgenda(now) {
  const today = dayKey(new Date(now));
  const plans = state.plans || [];
  const active = plans.filter((p) => p.status === 'active');
  const drafts = plans.filter((p) => p.status === 'draft');
  const done = plans.filter((p) => p.status === 'done').sort((a, b) => b.finished.at - a.finished.at);

  let todayHtml = '';
  for (const p of active) {
    const pend = P.pendingDecision(p, today);
    if (pend) {
      todayHtml += `<div class="card pad ag-decide"><div class="ag-q">🧭 ${esc(pend.block.decision.question) || t('agDecide')}</div>
        <p class="hint ag-link" data-action="ag-detail" data-id="${p.id}">${goalTitle(p)} · ${stepName(p, pend.block)}</p>
        <div class="btnrow wrap">${pend.block.decision.options.map((o, k) => `<button class="btn" data-action="ag-decide" data-id="${p.id}" data-i="${pend.i}" data-opt="${k}">${esc(o.label)}</button>`).join('')}</div></div>`;
    }
    for (const x of P.openTasks(p, today)) {
      todayHtml += `<div class="item ag-task" data-action="ag-detail" data-id="${p.id}">
        <div class="emo">${esc(x.task.emoji || '•')}</div>
        <div><div class="name">${esc(x.task.name)}</div><div class="sub">${goalTitle(p)} · ${stepName(p, x.block)}${x.late ? ` · <span class="neg">${t('agLateSince', { day: fmtDate(dayStart(x.to)) })}</span>` : ''}</div></div>
        <button class="btn small ok" data-action="ag-done" data-id="${p.id}" data-i="${x.i}" data-task="${esc(x.task.id)}">✓ +${x.pts}</button></div>`;
    }
  }

  // The week ahead, across running quests: steps about to start, questions to come.
  const horizon = addDays(today, 7);
  const soon = [];
  for (const p of active) {
    const sched = P.schedule(p);
    const { steps, decision } = P.projection(p);
    const stepRow = (x) => `${stepName(p, x.block)} <small class="muted">${daysText(x.block.days)} · ${t('agTasksN', { n: x.block.tasks.length })}</small>`;
    for (const x of sched.concat(steps)) if (x.from > today && x.from <= horizon) soon.push({ day: x.from, p, html: stepRow(x) });
    if (decision && sched.length) {
      const day = addDays(sched[sched.length - 1].to, 1);
      if (day > today && day <= horizon) soon.push({ day, p, html: `🧭 ${esc(decision.question) || t('agDecide')} <small class="muted">${decision.options.map((o) => esc(o.label)).join(' / ')}</small>` });
    }
  }
  soon.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const soonHtml = soon.map((s) => `<div class="lrow ag-link" data-action="ag-detail" data-id="${s.p.id}"><span><b>${dateOf(s.day)}</b> · ${s.html}</span><span class="muted">${esc(s.p.emoji)}</span></div>`).join('');

  const activeHtml = active.map((p) => {
    const sched = P.schedule(p);
    const cur = sched.find((x) => x.from <= today && today <= x.to);
    const days = P.pathDays(p), idx = P.dayIndex(p, today), pct = P.goalPct(p, sched);
    const line = idx < 1 ? t('agStartsOn', { day: dateOf(p.startDay) }) : t('agDay', { x: Math.min(days, idx), n: days });
    const sub = cur ? stepName(p, cur.block) : P.pendingDecision(p, today) ? t('agPending') : '';
    return `<div class="card pad ag-goal" data-action="ag-detail" data-id="${p.id}">
      <div class="ag-head"><span class="ag-emo">${esc(p.emoji)}</span><div><div class="name">${esc(p.name)}</div>
        <div class="sub">${line}${sub ? ' · ' + sub : ''}</div></div><b class="ag-pct">${pctText(pct)}</b></div>
      <div class="bprog"><i style="width:${Math.round(pct * 100)}%"></i></div></div>`;
  }).join('');

  const draftHtml = drafts.map((p) => {
    const e = P.estimate(p);
    return `<div class="card pad ag-goal" data-action="ag-edit" data-id="${p.id}">
      <div class="ag-head"><span class="ag-emo">${esc(p.emoji)}</span><div><div class="name">${esc(p.name) || t('agUntitled')}</div>
        <div class="sub">${t('agEstimate', { n: e.days, b: e.steps })}${e.branching ? ' · 🧭' : ''}</div></div></div>
      <div class="btnrow" style="margin-top:10px"><button class="btn small" data-action="ag-share" data-id="${p.id}">📤 ${t('agShare')}</button><button class="btn small" data-action="ag-edit" data-id="${p.id}">✏️ ${t('edit')}</button><button class="btn small primary" data-action="ag-start" data-id="${p.id}">▶️ ${t('agStart')}</button></div></div>`;
  }).join('');

  const doneHtml = done.map((p) => `<div class="lrow ag-link" data-action="ag-detail" data-id="${p.id}"><span>${goalTitle(p)} <small class="muted">${fmtDate(p.finished.at)}</small></span><span class="${p.finished.forfeited ? 'neg' : p.finished.flawless ? 'pos' : ''}">${p.finished.forfeited ? t('agForfeited') : pctText(p.finished.pct) + ' · +' + p.finished.pts}</span></div>`).join('');

  return `<div class="screen setup agenda">
    <h1>${t('tabAgenda')}</h1>
    <p class="hint">${t('agIntro')}</p>
    <div class="section"><h2>${t('agToday')}</h2>${todayHtml || `<p class="hint">${active.length ? t('agNothingToday') : t('agNoActive')}</p>`}</div>
    ${soon.length ? `<div class="section"><h2>${t('agComingUp')}</h2><div class="card ladder" style="margin-top:0">${soonHtml}</div></div>` : ''}
    <div class="section"><h2>${t('agActive')}</h2>${activeHtml || `<p class="hint">${t('agNoActiveHint')}</p>`}</div>
    <div class="section"><h2>${t('agDrafts')} <span class="btnrow" style="margin:0"><button class="btn small" data-action="ag-import">📥 ${t('agImport')}</button><button class="btn small primary" data-action="ag-new">➕ ${t('agNew')}</button></span></h2>
      ${draftHtml || `<p class="hint">${t('agNoDraftsHint')}</p>`}</div>
    ${done.length ? `<div class="section"><h2>${t('agDone')}</h2><div class="card ladder" style="margin-top:0">${doneHtml}</div></div>` : ''}
    <div class="section"><div class="card pad"><p class="hint">${t('agRules', { task: P.TASK_PTS, late: Math.round(P.TASK_PTS / P.LATE_DIV), bonus: P.BLOCK_BONUS, day: P.GOAL_PTS_PER_DAY })}</p></div></div>
  </div>${tabbar('agenda')}`;
}

// ---- quest editor ----------------------------------------------------------------
// `p` is a draft object owned by the caller; nothing is stored until onSave.
// A running quest is edited the same way, except the steps already walked stay.

function thenText(p, b) {
  if (b.decision) return '🧭 ' + t('agChoicesN', { n: b.decision.options.length });
  const nx = b.next && P.blockOf(p, b.next);
  return nx ? '→ ' + (p.blocks.indexOf(nx) + 1) : '⏹ ' + t('agEnd');
}
// A new step hangs after the first reachable step that currently ends the quest,
// so a linear plan stays linear without touching the "Then" of anything.
function linkTail(p, b) {
  const reach = P.reachableIds(p);
  const tail = p.blocks.find((x) => x !== b && !x.decision && !x.next && reach.has(x.id));
  if (tail) tail.next = b.id;
}

export function openGoalSheet(p, { onSave, onDelete } = {}) {
  const running = p.status === 'active';
  const reach = P.reachableIds(p);
  const orphans = p.blocks.some((b) => !reach.has(b.id));
  const el = openSheet(`
    <h2>🎯 ${p.name ? esc(p.name) : t('agNew')}</h2>
    ${running ? `<p class="hint" style="margin-top:6px">${t('agRunEditHint')}</p>` : ''}
    <div class="field"><label>${t('agGoalName')}</label>
      <div class="row"><input class="input emoji-in" data-f="emoji" value="${esc(p.emoji)}" maxlength="8" aria-label="${t('emoji')}">
      <input class="input" data-f="name" value="${esc(p.name)}" placeholder="${t('agNamePlaceholder')}" autocomplete="off"></div></div>
    <div class="field"><label>${t('agSteps')}</label>
      <div class="card ladder" style="margin-top:0">${p.blocks.map((b, i) => `<div class="lrow ag-link" data-block="${b.id}"><span>${reach.has(b.id) ? '' : '⚠️ '}${i + 1}. ${stepName(p, b)} <small class="muted">${daysText(b.days)} · ${t('agTasksN', { n: b.tasks.length })}${running && p.path.includes(b.id) ? ' · ✓' : ''}</small></span><span class="muted">${thenText(p, b)} ›</span></div>`).join('')}</div>
      <button class="link" data-add-step>➕ ${t('agAddStep')}</button>
      ${orphans ? `<p class="hint neg">${t('agUnreachable')}</p>` : ''}
      <p class="hint neg" data-warn hidden>${t('agNoExit')}</p></div>
    <div class="btnrow">
      ${onDelete ? `<button class="btn danger" data-del>🗑️ ${t('delete')}</button>` : `<button class="btn ghost" data-cancel>✖️ ${t('cancel')}</button>`}
      <button class="btn primary" data-save>💾 ${t('save')}</button></div>`);
  const nameIn = $('[data-f="name"]', el), emojiIn = $('[data-f="emoji"]', el);
  let autoEmoji = !p.name;
  nameIn.addEventListener('input', () => { if (autoEmoji) emojiIn.value = suggestEmoji(nameIn.value); });
  emojiIn.addEventListener('input', () => { autoEmoji = !emojiIn.value.trim(); });
  const keep = () => { p.name = nameIn.value.trim(); p.emoji = emojiIn.value.trim() || '🎯'; };
  const reopen = () => openGoalSheet(p, { onSave, onDelete });
  $$('[data-block]', el).forEach((row) => row.addEventListener('click', () => { keep(); openBlockSheet(p, P.blockOf(p, row.dataset.block), reopen); }));
  $('[data-add-step]', el).addEventListener('click', () => {
    keep();
    const b = P.newBlock(); p.blocks.push(b);
    if (!P.blockOf(p, p.root)) p.root = b.id; else linkTail(p, b);
    openBlockSheet(p, b, reopen);
  });
  const cancel = $('[data-cancel]', el); if (cancel) cancel.addEventListener('click', closeSheet);
  const del = $('[data-del]', el); if (del) del.addEventListener('click', () => { if (confirm(t('agDeleteConfirm'))) { closeSheet(); onDelete(); } });
  $('[data-save]', el).addEventListener('click', () => {
    keep();
    if (!p.name) { shake(nameIn); return; }
    if (!P.hasExit(p)) { $('[data-warn]', el).hidden = false; shake($('[data-warn]', el)); return; }
    closeSheet(); onSave(p);
  });
  if (!p.name) setTimeout(() => nameIn.focus(), 300);
}

function targetSel(p, b, attr, value) {
  const others = p.blocks.filter((x) => x !== b);
  return `<select ${attr}><option value="" ${!value ? 'selected' : ''}>⏹ ${t('agEnd')}</option>${others.map((x) => `<option value="${x.id}" ${value === x.id ? 'selected' : ''}>→ ${p.blocks.indexOf(x) + 1}. ${stepName(p, x)}</option>`).join('')}</select>`;
}
const taskRow = (x, frozen = false) => `<div class="row ag-taskrow" data-t-id="${esc(x.id)}"><input class="input emoji-in" data-t-emoji value="${esc(x.emoji)}" maxlength="8" aria-label="${t('emoji')}"><input class="input" data-t-name value="${esc(x.name)}" placeholder="${t('agTaskPlaceholder')}" autocomplete="off">${frozen ? '' : `<button class="iconbtn" data-rm aria-label="${t('delete')}">✕</button>`}</div>`;
const optionRow = (p, b, o) => `<div class="row ag-opt"><input class="input" data-o-label value="${esc(o.label)}" placeholder="${t('agChoicePlaceholder')}" autocomplete="off">${targetSel(p, b, 'data-o-next', o.next)}<button class="iconbtn" data-rm aria-label="${t('delete')}">✕</button></div>`;

// Task rows: the emoji follows the name as you type, until you pick one yourself.
function wireTaskRows(box) {
  $$('.ag-taskrow', box).forEach((row) => {
    if (row.dataset.wired) return;
    row.dataset.wired = '1';
    const nameIn = $('[data-t-name]', row), emojiIn = $('[data-t-emoji]', row);
    let auto = !emojiIn.value.trim();
    nameIn.addEventListener('input', () => { if (auto) emojiIn.value = suggestEmoji(nameIn.value); });
    emojiIn.addEventListener('input', () => { auto = !emojiIn.value.trim(); });
    const rm = $('[data-rm]', row); if (rm) rm.addEventListener('click', () => row.remove());
  });
}

// Slide-to-unlock: the knob follows the finger; letting go near the end calls
// onUnlock, anywhere else it slides back.
function slideToUnlock(root, onUnlock) {
  const knob = $('.slider-knob', root), track = $('.slider-track', root);
  let startX = 0, x = 0, dragging = false;
  const max = () => track.clientWidth - knob.offsetWidth - 8;
  const place = (v) => { x = Math.max(0, Math.min(max(), v)); knob.style.transform = `translateX(${x}px)`; root.style.setProperty('--slid', (x / max()).toFixed(3)); };
  knob.addEventListener('pointerdown', (e) => { dragging = true; startX = e.clientX - x; knob.setPointerCapture(e.pointerId); root.classList.add('dragging'); });
  knob.addEventListener('pointermove', (e) => { if (dragging) place(e.clientX - startX); });
  const end = () => {
    if (!dragging) return;
    dragging = false; root.classList.remove('dragging');
    if (x >= max() * 0.9) { place(max()); root.classList.add('unlocked'); knob.textContent = '🔓'; setTimeout(onUnlock, 350); }
    else place(0);
  };
  knob.addEventListener('pointerup', end); knob.addEventListener('pointercancel', end);
}

function openBlockSheet(p, b, back) {
  const d = b.decision;
  const walked = p.status === 'active' && p.path.includes(b.id);
  const current = walked && p.path[p.path.length - 1] === b.id; // the step under way: editable once unlocked
  let frozen = walked;
  const options = d ? d.options : [{ label: '', next: null }, { label: '', next: null }];
  const el = openSheet(`
    <h2>${p.blocks.indexOf(b) + 1}. ${stepName(p, b)}</h2>
    <div class="field"><label>${t('agStepTitle')}</label><input class="input" data-f="title" value="${esc(b.title)}" placeholder="${t('agStepPlaceholder')}" autocomplete="off"></div>
    <div class="field"><label>${t('agLength')}</label>
      <div class="stepper" style="padding:0"><button data-days="-1" aria-label="−">−</button><b data-days-n>${b.days}</b><span data-days-label>${daysText(b.days)}</span><button data-days="1" aria-label="+">+</button></div></div>
    <div class="field"><label>${t('agTasks')}</label><div data-tasks>${b.tasks.map((x) => taskRow(x, walked)).join('')}</div>
      <div data-edit-tools ${walked ? 'hidden' : ''}><button class="link" data-add-task>➕ ${t('agAddTask')}</button><p class="hint">${t('agNoTasksHint')}</p></div>
      ${current ? `<div class="slider" data-unlock><div class="slider-track"><span class="slider-label">${t('agUnlockSlide')}</span><div class="slider-knob">🔒</div></div></div><p class="hint" data-unlocked hidden>🔓 ${t('agUnlocked')}</p>`
        : walked ? `<p class="hint">🔒 ${t('agFrozenHint')}</p>` : ''}</div>
    <div class="field"><label>${t('agThen')}</label>
      <div class="chips" data-mode><button class="chip ${d ? '' : 'on'}" data-m="next">→ ${t('agGoOn')}</button><button class="chip ${d ? 'on' : ''}" data-m="ask">🧭 ${t('agAsk')}</button></div>
      <div data-next style="margin-top:8px;${d ? 'display:none' : ''}">${targetSel(p, b, 'data-f="next"', b.next)}</div>
      <div data-ask style="${d ? '' : 'display:none'}">
        <p class="hint" style="margin-top:8px">${t('agAskHint')}</p>
        <div class="field" style="margin-top:8px"><label>${t('agQuestion')}</label><input class="input" data-f="question" value="${esc(d ? d.question : '')}" placeholder="${t('agQuestionPlaceholder')}" autocomplete="off"></div>
        <div class="field" style="margin-top:8px"><label>${t('agChoices')}</label><div data-options>${options.map((o) => optionRow(p, b, o)).join('')}</div>
        <button class="link" data-add-option>➕ ${t('agAddOption')}</button></div></div></div>
    <div class="btnrow">${p.blocks.length > 1 && !walked ? `<button class="btn danger" data-del>🗑️</button>` : ''}<button class="btn primary wide" data-save>✓ ${t('ok')}</button></div>`,
  back); // tapping outside or Escape goes back to the quest, not to nothing
  let days = b.days;
  $$('[data-days]', el).forEach((btn) => btn.addEventListener('click', () => {
    days = Math.max(1, Math.min(P.MAX_DAYS, days + Number(btn.dataset.days)));
    $('[data-days-n]', el).textContent = days; $('[data-days-label]', el).textContent = daysText(days);
  }));
  const tasksBox = $('[data-tasks]', el), optBox = $('[data-options]', el);
  const wireOpts = () => $$('[data-rm]', optBox).forEach((x) => { x.onclick = () => x.closest('.row').remove(); });
  wireTaskRows(tasksBox); wireOpts();
  const addTask = $('[data-add-task]', el);
  if (addTask) addTask.addEventListener('click', () => { tasksBox.insertAdjacentHTML('beforeend', taskRow(P.newTask())); wireTaskRows(tasksBox); $$('[data-t-name]', tasksBox).pop().focus(); });
  const slider = $('[data-unlock]', el);
  if (slider) slideToUnlock(slider, () => {
    frozen = false;
    slider.remove(); $('[data-unlocked]', el).hidden = false; $('[data-edit-tools]', el).hidden = false;
    $$('.ag-taskrow', tasksBox).forEach((row) => { if (!$('[data-rm]', row)) { row.insertAdjacentHTML('beforeend', `<button class="iconbtn" data-rm aria-label="${t('delete')}">✕</button>`); delete row.dataset.wired; } });
    wireTaskRows(tasksBox);
  });
  $('[data-add-option]', el).addEventListener('click', () => {
    if ($$('.ag-opt', optBox).length >= P.MAX_OPTIONS) return;
    optBox.insertAdjacentHTML('beforeend', optionRow(p, b, { label: '', next: null })); wireOpts();
  });
  let mode = d ? 'ask' : 'next';
  $('[data-mode]', el).addEventListener('click', (e) => {
    const c = e.target.closest('[data-m]'); if (!c) return;
    mode = c.dataset.m;
    $$('.chip', e.currentTarget).forEach((x) => x.classList.toggle('on', x === c));
    $('[data-next]', el).style.display = mode === 'next' ? '' : 'none';
    $('[data-ask]', el).style.display = mode === 'ask' ? '' : 'none';
  });
  const leave = () => { closeSheet(); back(); };
  $('[data-save]', el).addEventListener('click', () => {
    b.title = $('[data-f="title"]', el).value.trim();
    b.days = days;
    b.tasks = $$('.ag-taskrow', tasksBox).map((row) => {
      const id = row.dataset.tId || P.newTask().id;
      const name = $('[data-t-name]', row).value.trim() || (frozen ? (b.tasks.find((x) => x.id === id) || {}).name : '');
      return name ? { id, name, emoji: $('[data-t-emoji]', row).value.trim() || suggestEmoji(name) } : null;
    }).filter(Boolean); // a started step keeps its list: a blanked name falls back to the old one
    if (mode === 'ask') {
      const opts = $$('.ag-opt', optBox).map((row) => ({ label: $('[data-o-label]', row).value.trim(), next: $('[data-o-next]', row).value || null })).filter((o) => o.label);
      if (opts.length < 2) { shake($('[data-f="question"]', el)); return; }
      b.decision = { question: $('[data-f="question"]', el).value.trim(), options: opts };
      b.next = null;
    } else {
      b.decision = null;
      b.next = $('[data-f="next"]', el).value || null;
    }
    leave();
  });
  const del = $('[data-del]', el);
  if (del) del.addEventListener('click', () => {
    p.blocks = p.blocks.filter((x) => x !== b);
    for (const x of p.blocks) {
      if (x.next === b.id) x.next = null;
      if (x.decision) x.decision.options.forEach((o) => { if (o.next === b.id) o.next = null; });
    }
    if (p.root === b.id) p.root = p.blocks[0].id;
    leave();
  });
  // No field takes focus: the sheet shows whole before any keyboard comes up.
}

// ---- start / detail / share ---------------------------------------------------------

export function openStartSheet(p, onStart) {
  const today = dayKey();
  const el = openSheet(`
    <h2>▶️ ${goalTitle(p)}</h2>
    <p class="hint" style="margin-top:6px">${t('agStartWhen', { n: P.estimate(p).days })}</p>
    <div class="btnrow" style="margin-top:12px"><button class="btn primary" data-day="${today}">${t('today')}</button><button class="btn" data-day="${addDays(today, 1)}">${t('tomorrow')}</button></div>
    <div class="field"><label>${t('agPickDate')}</label><div class="row"><input class="input" type="date" data-f="date" min="${today}" value="${today}"><button class="btn" data-pick>📅 ${t('agStart')}</button></div></div>
    <div class="btnrow"><button class="btn ghost wide" data-cancel>✖️ ${t('cancel')}</button></div>`);
  $$('[data-day]', el).forEach((btn) => btn.addEventListener('click', () => { closeSheet(); onStart(btn.dataset.day); }));
  $('[data-pick]', el).addEventListener('click', () => {
    const inp = $('[data-f="date"]', el);
    if (!inp.value || inp.value < today) { shake(inp); return; }
    closeSheet(); onStart(inp.value);
  });
  $('[data-cancel]', el).addEventListener('click', closeSheet);
}

// The whole map of a quest: steps walked (with their tasks, undo for a fresh
// one), the step running, the steps ahead with their projected dates, and the
// question that will decide the rest.
export function openDetailSheet(p, now, { onEdit, onForfeit, onDup, onShare, onDelete, onUndo } = {}) {
  const today = dayKey(new Date(now));
  const sched = P.schedule(p);
  const pct = p.finished ? p.finished.pct : P.goalPct(p, sched);
  const running = p.status === 'active';
  const decisionLine = (x) => {
    const dec = x.block.decision; if (!dec) return '';
    const chosen = p.decisions[x.i] !== undefined ? dec.options[p.decisions[x.i]] : null;
    return `<div class="ag-dtask">🧭 ${esc(dec.question) || t('agDecide')}${p.decisions[x.i] !== undefined ? ` → <b>${chosen ? esc(chosen.label) : t('agEnd')}</b>` : ` <small class="muted">${dec.options.map((o) => esc(o.label)).join(' / ')}</small>`}</div>`;
  };
  const walked = sched.map((x) => `<div class="ag-dstep ${!p.finished && x.from <= today && today <= x.to ? 'on' : 'past'}">
      <div class="lrow"><span>${stepName(p, x.block)} <small class="muted">${span(x)}</small></span><span class="${P.blockPct(p, x) >= 1 ? 'pos' : ''}">${pctText(P.blockPct(p, x))}</span></div>
      ${x.block.tasks.map((tk) => {
        const dn = p.done[P.taskKey(x.i, tk.id)];
        const undo = dn && onUndo && P.canUndo(p, x.i, tk.id, now) ? ` <button class="link ag-undo" data-undo="${x.i}/${esc(tk.id)}">${t('undo')}</button>` : '';
        return `<div class="ag-dtask ${dn ? 'ok' : ''}">${dn ? '✓' : '○'} ${esc(tk.emoji)} ${esc(tk.name)}${dn && dn.late ? ` <small class="muted">${t('agLate')}</small>` : ''}${undo}</div>`;
      }).join('')}
      ${decisionLine(x)}</div>`).join('');
  const { steps, decision, more } = running ? P.projection(p) : { steps: [], decision: null, more: false };
  const ahead = steps.map((x) => `<div class="ag-dstep next"><div class="lrow"><span>${stepName(p, x.block)} <small class="muted">${span(x)}</small></span><span class="muted">${t('agTasksN', { n: x.block.tasks.length })}</span></div>
      ${x.block.tasks.map((tk) => `<div class="ag-dtask">○ ${esc(tk.emoji)} ${esc(tk.name)}</div>`).join('')}</div>`).join('')
    + (decision ? `<div class="ag-dstep next"><div class="lrow"><span>🧭 ${esc(decision.question) || t('agDecide')}</span></div>
      ${decision.options.map((o) => `<div class="ag-dtask">↳ <b>${esc(o.label)}</b> → ${o.block ? stepName(p, o.block) + ` <small class="muted">${daysText(o.block.days)}</small>` : t('agEnd')}</div>`).join('')}</div>` : '')
    + (more ? `<div class="ag-dstep next"><div class="ag-dtask">…</div></div>` : '');
  const idx = P.dayIndex(p, today), days = P.pathDays(p);
  const line = p.finished
    ? (p.finished.forfeited ? t('agForfeitedLine', { days: p.finished.days }) : t('agFinishedLine', { pts: p.finished.pts, days: p.finished.days }) + (p.finished.flawless ? ' · 💠 ' + t('agFlawless') : ''))
    : idx < 1 ? t('agStartsOn', { day: dateOf(p.startDay) }) : t('agDay', { x: Math.min(days, idx), n: days });
  const pay = running ? P.payout(p) : null;
  const payHtml = pay ? `<div class="ag-payout">
      <div class="bprog big"><i style="width:${Math.round(pct * 100)}%"></i></div>
      <div class="ag-paylegend"><span>${pctText(pct)}</span><span>💎 ${t('agPayoutNow', { pts: pay.now })}</span><span class="muted">${t('agPayoutMax', { pts: pay.max })}</span></div></div>` : '';
  const el = openSheet(`
    <h2>${goalTitle(p)} · ${pctText(pct)}</h2>
    <p class="hint" style="margin-top:6px">${line}</p>
    ${payHtml}
    <div class="card" style="margin-top:10px;padding:0">${walked}</div>
    ${ahead ? `<div class="hint" style="margin:12px 2px 4px;font-weight:600">${t('agComingUp')}</div><div class="card" style="padding:0">${ahead}</div>` : ''}
    <div class="btnrow wrap">
      ${onShare ? `<button class="btn" data-share>📤 ${t('agShare')}</button>` : ''}
      ${onDup ? `<button class="btn" data-dup>📋 ${t('agDup')}</button>` : ''}
      ${onEdit ? `<button class="btn" data-edit>✏️ ${t('edit')}</button>` : ''}
      ${onForfeit ? `<button class="btn danger" data-forfeit>🏳️ ${t('agForfeit')}</button>` : ''}
      ${onDelete ? `<button class="btn danger" data-del>🗑️ ${t('delete')}</button>` : ''}
      <button class="btn primary" data-close>${t('close')}</button></div>`);
  $('[data-close]', el).addEventListener('click', closeSheet);
  const wire = (sel, fn, ask) => { const b = $(sel, el); if (b) b.addEventListener('click', () => { if (ask && !confirm(ask)) return; closeSheet(); fn(); }); };
  wire('[data-share]', onShare); wire('[data-dup]', onDup); wire('[data-edit]', onEdit);
  wire('[data-forfeit]', onForfeit, t('agForfeitConfirm')); wire('[data-del]', onDelete, t('agDeleteConfirm'));
  $$('[data-undo]', el).forEach((b) => b.addEventListener('click', () => { const [i, taskId] = b.dataset.undo.split('/'); closeSheet(); onUndo(Number(i), taskId); }));
}

// The link as a QR code for the phone next to you, plus the share sheet and
// a copy button for everything else.
export function openShareSheet(p, url, onShare) {
  const e = P.estimate(p);
  const el = openSheet(`
    <h2>📤 ${goalTitle(p)}</h2>
    <p class="hint" style="margin-top:6px">${t('agEstimate', { n: e.days, b: e.steps })} · ${t('agShareQrHint')}</p>
    <div class="qrwrap"><canvas data-qr aria-label="QR"></canvas></div>
    <p class="hint ag-url">${esc(url)}</p>
    <div class="btnrow"><button class="btn" data-copy>📋 ${t('agCopyLink')}</button><button class="btn primary" data-share>📤 ${t('agShareLink')}</button></div>
    <div class="btnrow" style="margin-top:8px"><button class="btn ghost wide" data-close>${t('close')}</button></div>`);
  if (!drawQR($('[data-qr]', el), url)) $('.qrwrap', el).innerHTML = `<p class="hint neg">${t('agQrTooLong')}</p>`;
  $('[data-close]', el).addEventListener('click', closeSheet);
  $('[data-share]', el).addEventListener('click', () => { closeSheet(); onShare(); });
  $('[data-copy]', el).addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(url); toast(t('sharedCopied'), 'good'); } catch { toast(t('shareFailed'), 'bad'); }
  });
}

// Paste a shared link or code; the quest is previewed before it is added.
export function openImportSheet(initial, onImport) {
  const el = openSheet(`
    <h2>📥 ${t('agImportTitle')}</h2>
    <p class="hint" style="margin-top:6px">${t('agImportHint')}</p>
    <div class="row" style="margin-top:10px;align-items:stretch"><textarea class="input" data-f="code" rows="3" style="font-family:monospace;font-size:12px" placeholder="https://…#quest=…"></textarea>
      <button class="btn" data-paste style="flex:0 0 auto">📋 ${t('agPaste')}</button></div>
    <div data-preview style="margin-top:10px"></div>
    <div class="btnrow"><button class="btn ghost" data-cancel>✖️ ${t('cancel')}</button><button class="btn primary" data-add disabled>➕ ${t('agImportAdd')}</button></div>`);
  const codeIn = $('[data-f="code"]', el), preview = $('[data-preview]', el), add = $('[data-add]', el);
  $('[data-paste]', el).addEventListener('click', async () => {
    try { const v = await navigator.clipboard.readText(); if (!v || !v.trim()) throw new Error('empty'); codeIn.value = v; show(); if (!plan) shake(codeIn); } catch { toast(t('agPasteFail'), 'bad'); }
  });
  let plan = null;
  const show = () => {
    plan = codeIn.value.trim() ? P.importCode(codeIn.value) : null;
    add.disabled = !plan;
    if (!plan) { preview.innerHTML = codeIn.value.trim() ? `<p class="hint neg">${t('agImportBad')}</p>` : ''; return; }
    const e = P.estimate(plan);
    preview.innerHTML = `<div class="card pad ag-goal" style="cursor:default"><div class="ag-head"><span class="ag-emo">${esc(plan.emoji)}</span><div><div class="name">${esc(plan.name)}</div><div class="sub">${t('agEstimate', { n: e.days, b: e.steps })}${e.branching ? ' · 🧭' : ''}</div></div></div>
      <div class="card ladder" style="margin-top:8px">${plan.blocks.map((b, i) => `<div class="ag-dstep"><div class="lrow"><span>${i + 1}. ${stepName(plan, b)}</span><span class="muted">${daysText(b.days)}</span></div>
        ${b.tasks.map((tk) => `<div class="ag-dtask">○ ${esc(tk.emoji)} ${esc(tk.name)}</div>`).join('')}
        ${b.decision ? `<div class="ag-dtask">🧭 ${esc(b.decision.question)} <small class="muted">${b.decision.options.map((o) => esc(o.label)).join(' / ')}</small></div>` : ''}</div>`).join('')}</div></div>`;
  };
  codeIn.addEventListener('input', show);
  if (initial) { codeIn.value = initial; show(); }
  $('[data-cancel]', el).addEventListener('click', closeSheet);
  add.addEventListener('click', () => { if (!plan) return; closeSheet(); onImport(plan); });
  if (!initial) setTimeout(() => codeIn.focus(), 300);
}
