// The Agenda tab: goals planned as steps, walked day by day. Rendering and
// sheets only — the rules live in plans.js, behaviour in app.js via data-action.
import { t } from './i18n.js';
import { state } from './store.js';
import { esc, $, $$, openSheet, closeSheet, tabbar } from './ui.js';
import { suggestEmoji } from './emoji.js';
import { dayKey, addDays, fmtDate } from './time.js';
import * as P from './plans.js';

const pctText = (x) => Math.round(x * 100) + '%';
const stepName = (p, b) => esc(b.title) || t('agStep', { n: p.blocks.indexOf(b) + 1 });
const daysText = (n) => t(n === 1 ? 'agOneDay' : 'agDays', { n });
const dateOf = (day) => fmtDate(new Date(day + 'T12:00'));
const shake = (el) => { el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 500); };

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
        <p class="hint">${esc(p.emoji)} ${esc(p.name)} · ${stepName(p, pend.block)}</p>
        <div class="btnrow wrap">${pend.block.decision.options.map((o, i) => `<button class="btn" data-action="ag-decide" data-id="${p.id}" data-block="${pend.block.id}" data-opt="${i}">${esc(o.label)}</button>`).join('')}</div></div>`;
    }
    for (const x of P.openTasks(p, today)) {
      todayHtml += `<div class="item ag-task">
        <div class="emo">${esc(x.task.emoji || '•')}</div>
        <div><div class="name">${esc(x.task.name)}</div><div class="sub">${esc(p.emoji)} ${esc(p.name)} · ${stepName(p, x.block)}${x.late ? ` · <span class="neg">${t('agLate')}</span>` : ''}</div></div>
        <button class="btn small ok" data-action="ag-done" data-id="${p.id}" data-block="${x.block.id}" data-task="${x.task.id}">✓ +${x.pts}</button></div>`;
    }
  }

  const activeHtml = active.map((p) => {
    const sched = P.schedule(p);
    const cur = sched.find((x) => x.from <= today && today <= x.to);
    const days = P.pathDays(p), idx = Math.min(days, P.dayIndex(p, today)), pct = P.goalPct(p, sched);
    const sub = cur ? stepName(p, cur.block) : P.pendingDecision(p, today) ? t('agPending') : '';
    return `<div class="card pad ag-goal" data-action="ag-detail" data-id="${p.id}">
      <div class="ag-head"><span class="ag-emo">${esc(p.emoji)}</span><div><div class="name">${esc(p.name)}</div>
        <div class="sub">${t('agDay', { x: idx, n: days })}${sub ? ' · ' + sub : ''}</div></div><b class="ag-pct">${pctText(pct)}</b></div>
      <div class="bprog"><i style="width:${Math.round(pct * 100)}%"></i></div></div>`;
  }).join('');

  const draftHtml = drafts.map((p) => {
    const e = P.estimate(p);
    return `<div class="card pad ag-goal">
      <div class="ag-head" data-action="ag-edit" data-id="${p.id}"><span class="ag-emo">${esc(p.emoji)}</span><div><div class="name">${esc(p.name) || t('agUntitled')}</div>
        <div class="sub">${t('agEstimate', { n: e.days, b: e.steps })}${e.branching ? ' · 🧭' : ''}</div></div></div>
      <div class="btnrow" style="margin-top:10px"><button class="btn small" data-action="ag-edit" data-id="${p.id}">✏️ ${t('edit')}</button><button class="btn small primary" data-action="ag-start" data-id="${p.id}">▶️ ${t('agStart')}</button></div></div>`;
  }).join('');

  const doneHtml = done.slice(0, 12).map((p) => `<div class="lrow ag-step" data-action="ag-detail" data-id="${p.id}"><span>${esc(p.emoji)} ${esc(p.name)} <small class="muted">${fmtDate(p.finished.at)}</small></span><span class="${p.finished.flawless ? 'pos' : ''}">${pctText(p.finished.pct)} · +${p.finished.pts}</span></div>`).join('');

  return `<div class="screen setup agenda">
    <h1>${t('tabAgenda')}</h1>
    <p class="hint">${t('agIntro')}</p>
    <div class="section"><h2>${t('agToday')}</h2>${todayHtml || `<p class="hint">${active.length ? t('agNothingToday') : t('agNoActive')}</p>`}</div>
    <div class="section"><h2>${t('agActive')} <button class="btn small primary" data-action="ag-new">➕ ${t('agNew')}</button></h2>
      ${activeHtml || `<p class="hint">${t('agNoActiveHint')}</p>`}</div>
    ${drafts.length ? `<div class="section"><h2>${t('agDrafts')}</h2>${draftHtml}</div>` : ''}
    ${done.length ? `<div class="section"><h2>${t('agDone')}</h2><div class="card ladder">${doneHtml}</div></div>` : ''}
    <div class="section"><div class="card pad"><p class="hint">${t('agRules', { task: P.TASK_PTS, late: Math.round(P.TASK_PTS / P.LATE_DIV), bonus: P.BLOCK_BONUS, day: P.GOAL_PTS_PER_DAY })}</p></div></div>
  </div>${tabbar('agenda')}`;
}

// ---- goal editor ----------------------------------------------------------------
// `p` is a draft object owned by the caller; nothing is stored until onSave.

function thenText(p, b) {
  if (b.decision) return '🧭 ' + t('agChoicesN', { n: b.decision.options.length });
  const nx = b.next && P.blockOf(p, b.next);
  return nx ? '→ ' + (p.blocks.indexOf(nx) + 1) : '⏹ ' + t('agEnd');
}
function reachable(p, id) {
  const seen = new Set(), stack = [p.root];
  while (stack.length) {
    const x = stack.pop(); if (!x || seen.has(x)) continue;
    seen.add(x);
    const b = P.blockOf(p, x); if (!b) continue;
    if (b.decision) b.decision.options.forEach((o) => stack.push(o.next)); else stack.push(b.next);
  }
  return seen.has(id);
}
// A new step hangs after the first reachable step that currently ends the goal,
// so a linear plan stays linear without touching the "Then" of anything.
function linkTail(p, b) {
  const tail = p.blocks.find((x) => x !== b && !x.decision && !x.next && reachable(p, x.id));
  if (tail) tail.next = b.id;
}

export function openGoalSheet(p, { onSave, onDelete } = {}) {
  const el = openSheet(`
    <h2>🎯 ${p.name ? esc(p.name) : t('agNew')}</h2>
    <div class="field"><label>${t('agGoalName')}</label>
      <div class="row"><input class="input emoji-in" data-f="emoji" value="${esc(p.emoji)}" maxlength="4" aria-label="${t('emoji')}">
      <input class="input" data-f="name" value="${esc(p.name)}" placeholder="${t('agNamePlaceholder')}" autocomplete="off"></div></div>
    <div class="field"><label>${t('agSteps')}</label>
      <div class="card ladder" style="margin-top:0">${p.blocks.map((b, i) => `<div class="lrow ag-step" data-block="${b.id}"><span>${i + 1}. ${stepName(p, b)} <small class="muted">${daysText(b.days)} · ${t('agTasksN', { n: b.tasks.length })}</small></span><span class="muted">${thenText(p, b)} ›</span></div>`).join('')}</div>
      <button class="link" data-add-step>➕ ${t('agAddStep')}</button></div>
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
  $('[data-save]', el).addEventListener('click', () => { keep(); if (!p.name) { shake(nameIn); return; } closeSheet(); onSave(p); });
  if (!p.name) setTimeout(() => nameIn.focus(), 300);
}

function targetSel(p, b, attr, value) {
  const others = p.blocks.filter((x) => x !== b);
  return `<select ${attr}><option value="" ${!value ? 'selected' : ''}>⏹ ${t('agEnd')}</option>${others.map((x) => `<option value="${x.id}" ${value === x.id ? 'selected' : ''}>→ ${p.blocks.indexOf(x) + 1}. ${stepName(p, x)}</option>`).join('')}</select>`;
}
const taskRow = (x) => `<div class="row ag-taskrow"><input class="input emoji-in" data-t-emoji value="${esc(x.emoji)}" maxlength="4" aria-label="${t('emoji')}"><input class="input" data-t-name value="${esc(x.name)}" placeholder="${t('agTaskPlaceholder')}" autocomplete="off"><button class="iconbtn" data-rm aria-label="${t('delete')}">✕</button></div>`;
const optionRow = (p, b, o) => `<div class="row ag-opt"><input class="input" data-o-label value="${esc(o.label)}" placeholder="${t('agChoicePlaceholder')}" autocomplete="off">${targetSel(p, b, 'data-o-next', o.next)}<button class="iconbtn" data-rm aria-label="${t('delete')}">✕</button></div>`;

function openBlockSheet(p, b, back) {
  const d = b.decision;
  const options = d ? d.options : [{ label: '', next: null }, { label: '', next: null }];
  const el = openSheet(`
    <h2>${p.blocks.indexOf(b) + 1}. ${stepName(p, b)}</h2>
    <div class="field"><label>${t('agStepTitle')}</label><input class="input" data-f="title" value="${esc(b.title)}" placeholder="${t('agStepPlaceholder')}" autocomplete="off"></div>
    <div class="field"><label>${t('agLength')}</label>
      <div class="stepper" style="padding:0"><button data-days="-1" aria-label="−">−</button><b data-days-n>${b.days}</b><span data-days-label>${daysText(b.days)}</span><button data-days="1" aria-label="+">+</button></div></div>
    <div class="field"><label>${t('agTasks')}</label><div data-tasks>${b.tasks.map(taskRow).join('')}</div>
      <button class="link" data-add-task>➕ ${t('agAddTask')}</button><p class="hint">${t('agNoTasksHint')}</p></div>
    <div class="field"><label>${t('agThen')}</label>
      <div class="chips" data-mode><button class="chip ${d ? '' : 'on'}" data-m="next">→ ${t('agGoOn')}</button><button class="chip ${d ? 'on' : ''}" data-m="ask">🧭 ${t('agAsk')}</button></div>
      <div data-next style="margin-top:8px;${d ? 'display:none' : ''}">${targetSel(p, b, 'data-f="next"', b.next)}</div>
      <div data-ask style="margin-top:8px;${d ? '' : 'display:none'}">
        <input class="input" data-f="question" value="${esc(d ? d.question : '')}" placeholder="${t('agQuestionPlaceholder')}" autocomplete="off">
        <div data-options>${options.map((o) => optionRow(p, b, o)).join('')}</div>
        <button class="link" data-add-option>➕ ${t('agAddOption')}</button></div></div>
    <div class="btnrow">${p.blocks.length > 1 ? `<button class="btn danger" data-del>🗑️</button>` : ''}<button class="btn primary wide" data-save>✓ ${t('ok')}</button></div>`);
  el.previousElementSibling.addEventListener('click', back, { once: true }); // tapping outside goes back to the goal, not to nothing
  let days = b.days;
  $$('[data-days]', el).forEach((btn) => btn.addEventListener('click', () => {
    days = Math.max(1, Math.min(P.MAX_DAYS, days + Number(btn.dataset.days)));
    $('[data-days-n]', el).textContent = days; $('[data-days-label]', el).textContent = daysText(days);
  }));
  const tasksBox = $('[data-tasks]', el), optBox = $('[data-options]', el);
  const wireRm = (box) => $$('[data-rm]', box).forEach((x) => { x.onclick = () => x.closest('.row').remove(); });
  wireRm(tasksBox); wireRm(optBox);
  $('[data-add-task]', el).addEventListener('click', () => { tasksBox.insertAdjacentHTML('beforeend', taskRow(P.newTask())); wireRm(tasksBox); $$('[data-t-name]', tasksBox).pop().focus(); });
  $('[data-add-option]', el).addEventListener('click', () => {
    if ($$('.ag-opt', optBox).length >= P.MAX_OPTIONS) return;
    optBox.insertAdjacentHTML('beforeend', optionRow(p, b, { label: '', next: null })); wireRm(optBox);
  });
  let mode = d ? 'ask' : 'next';
  $('[data-mode]', el).addEventListener('click', (e) => {
    const c = e.target.closest('[data-m]'); if (!c) return;
    mode = c.dataset.m;
    $$('.chip', e.currentTarget).forEach((x) => x.classList.toggle('on', x === c));
    $('[data-next]', el).style.display = mode === 'next' ? '' : 'none';
    $('[data-ask]', el).style.display = mode === 'ask' ? '' : 'none';
  });
  const leave = () => { el.previousElementSibling.removeEventListener('click', back); closeSheet(); back(); };
  $('[data-save]', el).addEventListener('click', () => {
    b.title = $('[data-f="title"]', el).value.trim();
    b.days = days;
    b.tasks = $$('.ag-taskrow', tasksBox).map((row) => {
      const name = $('[data-t-name]', row).value.trim();
      return name ? { id: P.newTask().id, name, emoji: $('[data-t-emoji]', row).value.trim() || suggestEmoji(name) } : null;
    }).filter(Boolean);
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
  setTimeout(() => $('[data-f="title"]', el).focus(), 300);
}

// ---- start / detail --------------------------------------------------------------

export function openStartSheet(p, onStart) {
  const today = dayKey();
  const el = openSheet(`
    <h2>▶️ ${esc(p.emoji)} ${esc(p.name)}</h2>
    <p class="hint" style="margin-top:6px">${t('agStartWhen', { n: P.estimate(p).days })}</p>
    <div class="btnrow" style="margin-top:12px"><button class="btn primary" data-day="${today}">${t('today')}</button><button class="btn" data-day="${addDays(today, 1)}">${t('tomorrow')}</button></div>
    <div class="field"><label>${t('agPickDate')}</label><div class="row"><input class="input" type="date" data-f="date" min="${today}" value="${today}"><button class="btn" data-pick>📅 ${t('agStart')}</button></div></div>
    <div class="btnrow"><button class="btn ghost wide" data-cancel>✖️ ${t('cancel')}</button></div>`);
  $$('[data-day]', el).forEach((btn) => btn.addEventListener('click', () => { closeSheet(); onStart(btn.dataset.day); }));
  $('[data-pick]', el).addEventListener('click', () => { const v = $('[data-f="date"]', el).value; if (!v) return; closeSheet(); onStart(v); });
  $('[data-cancel]', el).addEventListener('click', closeSheet);
}

export function openDetailSheet(p, today, { onEnd, onDup, onDelete } = {}) {
  const sched = P.schedule(p);
  const pct = p.finished ? p.finished.pct : P.goalPct(p, sched);
  const steps = sched.map((x) => {
    const bp = P.blockPct(p, x.block), cur = !p.finished && x.from <= today && today <= x.to;
    const dec = x.block.decision, chosen = dec && p.decisions[x.block.id] !== undefined ? dec.options[p.decisions[x.block.id]] : null;
    return `<div class="ag-dstep ${cur ? 'on' : ''}">
      <div class="lrow"><span>${stepName(p, x.block)} <small class="muted">${dateOf(x.from)}${x.block.days > 1 ? ' – ' + dateOf(x.to) : ''}</small></span><span class="${bp >= 1 ? 'pos' : ''}">${pctText(bp)}</span></div>
      ${x.block.tasks.map((tk) => { const dn = p.done[P.taskKey(x.block.id, tk.id)]; return `<div class="ag-dtask ${dn ? 'ok' : ''}">${dn ? '✓' : '○'} ${esc(tk.emoji)} ${esc(tk.name)}${dn && dn.late ? ` <small class="muted">${t('agLate')}</small>` : ''}</div>`; }).join('')}
      ${dec ? `<div class="ag-dtask">🧭 ${esc(dec.question)}${chosen ? ` → <b>${esc(chosen.label)}</b>` : ` <small class="muted">${t('agPending')}</small>`}</div>` : ''}</div>`;
  }).join('');
  const line = p.finished
    ? t('agFinishedLine', { pts: p.finished.pts, days: p.finished.days }) + (p.finished.flawless ? ' · 💠 ' + t('agFlawless') : '')
    : t('agDay', { x: Math.min(P.pathDays(p), P.dayIndex(p, today)), n: P.pathDays(p) }) + ' · ' + t('agLockedHint');
  const el = openSheet(`
    <h2>${esc(p.emoji)} ${esc(p.name)} · ${pctText(pct)}</h2>
    <p class="hint" style="margin-top:6px">${line}</p>
    <div class="card" style="margin-top:10px;padding:0">${steps}</div>
    <div class="btnrow wrap">
      ${onDup ? `<button class="btn" data-dup>📋 ${t('agDup')}</button>` : ''}
      ${onEnd ? `<button class="btn danger" data-end>⏹ ${t('agEndNow')}</button>` : ''}
      ${onDelete ? `<button class="btn danger" data-del>🗑️ ${t('delete')}</button>` : ''}
      <button class="btn primary" data-close>${t('close')}</button></div>`);
  $('[data-close]', el).addEventListener('click', closeSheet);
  const dup = $('[data-dup]', el); if (dup) dup.addEventListener('click', () => { closeSheet(); onDup(); });
  const end = $('[data-end]', el); if (end) end.addEventListener('click', () => { if (confirm(t('agEndConfirm'))) { closeSheet(); onEnd(); } });
  const del = $('[data-del]', el); if (del) del.addEventListener('click', () => { if (confirm(t('agDeleteConfirm'))) { closeSheet(); onDelete(); } });
}
