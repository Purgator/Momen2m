// Quests ("agenda" in code): goals planned as steps — blocks of consecutive
// days, each with its tasks — optionally branching on a question asked when a
// step is over. A quest is a template until it is started on a chosen day;
// from then on the steps taken form a dated path, and a step may be walked
// more than once (a question can loop back), so progress is keyed by the
// position in the path, not by the step. Independent from the moments engine:
// plain points (no boost, no pause tokens), no penalties — misses only leave
// % behind.
import { state, save, uid } from './store.js';
import { addPlainXp } from './engine.js';
import { dayKey, addDays, at, parseHM, minutesToHM } from './time.js';
import { t } from './i18n.js';

export const TASK_PTS = 5;          // a task done during its step
export const LATE_DIV = 4;          // done after the step: a quarter
export const BLOCK_BONUS = 10;      // every task of a step done, none late
export const GOAL_PTS_PER_DAY = 50; // × completion × planned days (steps with tasks), doubled at 100 %
export const MAX_OPTIONS = 3;
export const MAX_DAYS = 30;
export const UNDO_MS = 5 * 60 * 1000;
const KEY_VERSION = 2;

export function newBlock() { return { id: uid(), title: '', days: 1, tasks: [], next: null, decision: null }; }
export function newTask() { return { id: uid(), name: '', emoji: '' }; }
export function newPlan() {
  const b = newBlock();
  return { id: uid(), kv: KEY_VERSION, name: '', emoji: '🎯', blocks: [b], root: b.id, status: 'draft', startDay: null, path: [], done: {}, decisions: {}, finished: null, createdAt: Date.now() };
}

// A fresh draft with the same steps (new ids, links remapped).
export function clonePlan(p) {
  const ids = new Map(p.blocks.map((b) => [b.id, uid()]));
  const map = (id) => (id && ids.get(id)) || null;
  return {
    ...newPlan(), name: p.name, emoji: p.emoji, root: map(p.root),
    blocks: p.blocks.map((b) => ({
      id: ids.get(b.id), title: b.title, days: b.days, next: map(b.next),
      tasks: b.tasks.map((x) => ({ ...x, id: uid() })),
      decision: b.decision ? { question: b.decision.question, options: b.decision.options.map((o) => ({ label: o.label, next: map(o.next) })) } : null,
    })),
  };
}

export const blockOf = (p, id) => p.blocks.find((b) => b.id === id) || null;
// Progress keys: "<path index>/<task id>"; decisions: by path index.
export const taskKey = (i, taskId) => i + '/' + taskId;
export const isDone = (p, i, task) => !!p.done[taskKey(i, task.id)];

// Runs written before progress was keyed by path position: their keys were
// "<block id>/<task id>" and decisions were by block id.
function migrate(p) {
  if ((p.kv || 1) >= KEY_VERSION) return;
  const idx = (blockId) => p.path.indexOf(blockId);
  const done = {};
  for (const k in p.done || {}) { const [blockId, taskId] = k.split('/'); const i = idx(blockId); if (i >= 0) done[taskKey(i, taskId)] = p.done[k]; }
  const decisions = {};
  for (const k in p.decisions || {}) { const i = idx(k); if (i >= 0) decisions[i] = p.decisions[k]; }
  p.done = done; p.decisions = decisions; p.kv = KEY_VERSION;
}
for (const p of state.plans || []) migrate(p);

// ---- graph helpers -----------------------------------------------------------------
export function reachableIds(p) {
  const seen = new Set(), stack = [p.root];
  while (stack.length) {
    const x = stack.pop(); if (!x || seen.has(x)) continue;
    seen.add(x);
    const b = blockOf(p, x); if (!b) continue;
    if (b.decision) b.decision.options.forEach((o) => stack.push(o.next)); else stack.push(b.next);
  }
  return seen;
}
// Some way from the root leads to the end (a quest that only loops never pays).
export function hasExit(p) {
  for (const id of reachableIds(p)) {
    const b = blockOf(p, id); if (!b) continue;
    if (b.decision ? b.decision.options.some((o) => !blockOf(p, o.next)) : !blockOf(p, b.next)) return true;
  }
  return false;
}

// Steps as they would be walked from the root, first choice at every
// question, each step at most once: an estimate for a draft ("≈ 6 days").
export function estimate(p) {
  const seen = new Set();
  let id = p.root, days = 0, steps = 0;
  while (id && !seen.has(id)) {
    const b = blockOf(p, id); if (!b) break;
    seen.add(id); days += b.days; steps++;
    id = b.decision ? (b.decision.options[0] || {}).next : b.next;
  }
  return { days, steps, branching: p.blocks.some((b) => b.decision) };
}

// The steps taken so far, dated: each starts the day after the previous one
// ends, whatever day the question in between was answered.
export function schedule(p) {
  const out = [];
  let day = p.startDay;
  p.path.forEach((id, i) => {
    const b = blockOf(p, id); if (!b || out.length < i) return;
    out.push({ i, block: b, from: day, to: addDays(day, b.days - 1) });
    day = addDays(day, b.days);
  });
  return out;
}
export function blockPct(p, x) { return x.block.tasks.length ? x.block.tasks.filter((task) => isDone(p, x.i, task)).length / x.block.tasks.length : 1; }
// Completion over the steps walked, weighted by days; rest steps (no task)
// count for nothing, so a quest of pure rest pays nothing.
export function goalPct(p, sched = schedule(p)) {
  let w = 0, s = 0;
  for (const x of sched) { if (!x.block.tasks.length) continue; w += x.block.days; s += blockPct(p, x) * x.block.days; }
  return w ? s / w : 0;
}
export const pathDays = (p) => schedule(p).reduce((n, x) => n + x.block.days, 0);
export function dayIndex(p, today) {
  return Math.round((new Date(today + 'T12:00') - new Date(p.startDay + 'T12:00')) / 86400000) + 1;
}

// Starting runs a copy: the saved quest stays in "Ready to start", and editing
// the run never touches it. Not before today.
export function start(template, day, now = Date.now()) {
  if (template.status !== 'draft' || !blockOf(template, template.root) || day < dayKey(new Date(now))) return null;
  const run = { ...clonePlan(template), status: 'active', startDay: day, done: {}, decisions: {}, startedAt: now, templateId: template.id };
  run.path = [run.root];
  state.plans.push(run);
  save();
  return run;
}

// Gives a running quest up: it ends where it stands and pays nothing.
export function forfeit(p, now) {
  if (p.status !== 'active') return null;
  const sched = schedule(p);
  p.status = 'done';
  p.finished = { at: now, day: dayKey(new Date(now)), pct: goalPct(p, sched), pts: 0, days: sched.reduce((n, x) => n + x.block.days, 0), flawless: false, forfeited: true };
  save();
  return p.finished;
}

// The last step, when its days are over and its question is still unanswered.
export function pendingDecision(p, today) {
  const sched = schedule(p);
  const last = sched[sched.length - 1];
  if (!last || today <= last.to || !last.block.decision || p.decisions[last.i] !== undefined) return null;
  return last;
}

// What can be done today: the current step's tasks, plus earlier steps' (late).
export function openTasks(p, today) {
  const out = [];
  for (const x of schedule(p)) {
    if (x.from > today) continue;
    const late = today > x.to;
    for (const task of x.block.tasks) {
      if (isDone(p, x.i, task)) continue;
      out.push({ plan: p, i: x.i, block: x.block, task, late, to: x.to, pts: late ? Math.round(TASK_PTS / LATE_DIV) : TASK_PTS });
    }
  }
  return out;
}

export function completeTask(p, i, taskId, now) {
  const today = dayKey(new Date(now));
  const x = schedule(p)[i];
  const task = x && x.block.tasks.find((y) => y.id === taskId);
  if (p.status !== 'active' || !task || isDone(p, i, task) || x.from > today) return null;
  const late = today > x.to;
  const pts = late ? Math.round(TASK_PTS / LATE_DIV) : TASK_PTS;
  const rec = { day: today, at: now, pts, late };
  p.done[taskKey(i, task.id)] = rec;
  const full = blockPct(p, x) >= 1 && x.block.tasks.every((y) => !p.done[taskKey(i, y.id)].late);
  if (full) rec.bonus = BLOCK_BONUS;
  addPlainXp(pts + (rec.bonus || 0));
  state.game.goalTasks = (state.game.goalTasks || 0) + 1;
  state.game.goalPts = (state.game.goalPts || 0) + pts + (rec.bonus || 0);
  save();
  return { pts: pts + (rec.bonus || 0), late, full };
}

export function canUndo(p, i, taskId, now) {
  const rec = p.done[taskKey(i, taskId)];
  return !!rec && p.status === 'active' && now - rec.at < UNDO_MS;
}
// Takes a just-completed task back (mis-tap protection), points included; a
// step bonus that no longer holds goes with it.
export function undoTask(p, i, taskId, now) {
  if (!canUndo(p, i, taskId, now)) return false;
  const x = schedule(p)[i];
  const rec = p.done[taskKey(i, taskId)];
  let back = (rec.pts || 0) + (rec.bonus || 0);
  delete p.done[taskKey(i, taskId)];
  for (const y of x.block.tasks) { const o = p.done[taskKey(i, y.id)]; if (o && o.bonus) { back += o.bonus; delete o.bonus; } }
  addPlainXp(-back);
  state.game.goalTasks = Math.max(0, (state.game.goalTasks || 0) - 1);
  state.game.goalPts = Math.max(0, (state.game.goalPts || 0) - back);
  save();
  return true;
}

export function decide(p, i, idx, now) {
  const x = schedule(p)[i];
  if (p.status !== 'active' || !x || !x.block.decision || !x.block.decision.options[idx]) return false;
  p.decisions[i] = idx;
  save();
  advance(now);
  return true;
}

// Walks time forward for every running quest: follows steps whose days are
// over, waits on unanswered questions, finishes quests that reached their end.
// Returns the quests finished on this call, and whether anything moved.
export function advance(now) {
  const today = dayKey(new Date(now));
  const finished = [];
  let changed = false;
  for (const p of state.plans || []) {
    if (p.status !== 'active') continue;
    for (let guard = 0; guard < 60; guard++) {
      const sched = schedule(p);
      const last = sched[sched.length - 1];
      if (!last) break;
      const b = last.block;
      // The final step with every task done: the quest is over, whatever days it had left.
      if (!b.decision && !b.next && b.tasks.length && blockPct(p, last) >= 1) { changed = true; finished.push({ plan: p, ...finish(p, now) }); break; }
      if (today <= last.to) break;
      let next;
      if (b.decision) { const i = p.decisions[last.i]; if (i === undefined) break; next = (b.decision.options[i] || {}).next || null; }
      else next = b.next;
      changed = true;
      if (next && blockOf(p, next)) { p.path.push(next); save(); continue; }
      finished.push({ plan: p, ...finish(p, now) });
      break;
    }
  }
  return { finished, changed };
}

// Ends a quest where it stands and pays it: completion × 50 pts × planned
// days, doubled when nothing was left behind.
export function finish(p, now) {
  const sched = schedule(p);
  const pct = goalPct(p, sched);
  const days = sched.reduce((n, x) => n + x.block.days, 0);
  const flawless = pct >= 1;
  const pts = Math.round(pct * GOAL_PTS_PER_DAY * days) * (flawless ? 2 : 1);
  addPlainXp(pts);
  p.status = 'done';
  p.finished = { at: now, day: dayKey(new Date(now)), pct, pts, days, flawless };
  const g = state.game;
  g.goalsDone = (g.goalsDone || 0) + 1;
  if (flawless) g.goalsFlawless = (g.goalsFlawless || 0) + 1;
  g.goalLongest = Math.max(g.goalLongest || 0, days);
  g.goalPts = (g.goalPts || 0) + pts;
  save();
  return { pct, pts, days, flawless };
}

// What a running quest is worth: if it ended now, and at most (every step in
// sight done on time). Steps in sight = the path plus what follows it up to
// the next question.
export function payout(p) {
  const sched = schedule(p);
  const all = sched.concat(projection(p).steps);
  const days = all.reduce((n, x) => n + x.block.days, 0);
  const tasked = all.some((x) => x.block.tasks.length);
  const pct = goalPct(p, sched);
  const pathDays_ = sched.reduce((n, x) => n + x.block.days, 0);
  return { pct, now: Math.round(pct * GOAL_PTS_PER_DAY * pathDays_) * (pct >= 1 ? 2 : 1), max: tasked ? GOAL_PTS_PER_DAY * days * 2 : 0, days };
}

// What lies ahead: the steps that will follow the path as it stands, dated,
// up to the first question to come (returned with its choices), a few steps
// at most — a loop would otherwise go on for ever.
export const PROJECTION_MAX = 8;
export function projection(p) {
  const sched = schedule(p);
  const steps = [];
  let day = sched.length ? addDays(sched[sched.length - 1].to, 1) : p.startDay;
  let b = sched.length ? sched[sched.length - 1].block : null;
  let i = sched.length - 1;
  let decision = null, more = false;
  while (b) {
    let next;
    if (b.decision) {
      const chosen = p.decisions[i];
      if (chosen === undefined) { decision = { after: b, question: b.decision.question, options: b.decision.options.map((o) => ({ label: o.label, block: blockOf(p, o.next) })) }; break; }
      next = (b.decision.options[chosen] || {}).next;
    } else next = b.next;
    b = blockOf(p, next);
    if (!b) break;
    if (steps.length >= PROJECTION_MAX) { more = true; break; }
    i++;
    steps.push({ i, block: b, from: day, to: addDays(day, b.days - 1) });
    day = addDays(day, b.days);
  }
  return { steps, decision, more };
}

export function remove(id) { state.plans = (state.plans || []).filter((p) => p.id !== id); save(); }

// Quest points earned on a day (tasks, step bonuses, quests finished).
export function pointsOn(day) {
  let sum = 0;
  for (const p of state.plans || []) {
    for (const k in p.done) { const d = p.done[k]; if (d.day === day) sum += (d.pts || 0) + (d.bonus || 0); }
    if (p.finished && p.finished.day === day) sum += p.finished.pts;
  }
  return sum;
}

// ---- reminders -------------------------------------------------------------------
// What waits on a day, across running quests: tasks of the steps covering it
// (open ones for steps walked, all for steps ahead), earlier steps' tasks
// still open, and a question that will be waiting by then.
export function dueOn(day) {
  let tasks = 0, questions = 0;
  for (const p of state.plans || []) {
    if (p.status !== 'active') continue;
    const sched = schedule(p);
    const { steps, decision } = projection(p);
    for (const x of sched) if (x.from <= day) tasks += x.block.tasks.filter((task) => !isDone(p, x.i, task)).length;
    for (const x of steps) if (x.from <= day) tasks += x.block.tasks.length; // by then, still doable (late at worst)
    if (decision && sched.length) {
      const end = steps.length ? steps[steps.length - 1].to : sched[sched.length - 1].to;
      if (day > end) questions++;
    }
  }
  return { tasks, questions };
}
// One daily reminder, at the chosen hour or an hour after the day starts.
export function reminderHM(dayStart = state.settings.dayStart) {
  return minutesToHM((parseHM(dayStart || '07:00') + 60) % 1440);
}
export function reminderAt(day) {
  const s = state.settings;
  return at(day, s.questReminder || reminderHM(s.dayStart));
}
export function reminderText(due) {
  const parts = [];
  if (due.tasks) parts.push(t(due.tasks === 1 ? 'nQuestTask' : 'nQuestTasks', { n: due.tasks }));
  if (due.questions) parts.push(t('nQuestQuestion'));
  return parts.join(' · ');
}

export function stats() {
  const g = state.game;
  return { done: g.goalsDone || 0, flawless: g.goalsFlawless || 0, longest: g.goalLongest || 0, tasks: g.goalTasks || 0, pts: g.goalPts || 0 };
}

// ---- sharing ----------------------------------------------------------------------
// A quest travels as one URL-safe code (a compact JSON, base64url): no file.
const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
const text = (v, max) => String(v == null ? '' : v).slice(0, max);
const emoji = (v, fallback = '') => [...String(v == null ? '' : v)].slice(0, 8).join('') || fallback; // whole code points: no half surrogate
export function exportCode(p) {
  const idx = (id) => p.blocks.findIndex((b) => b.id === id);
  const data = {
    v: 1, n: p.name, e: p.emoji, r: idx(p.root),
    b: p.blocks.map((b) => ({
      t: b.title, d: b.days, k: b.tasks.map((x) => [x.emoji, x.name]), x: idx(b.next),
      q: b.decision ? [b.decision.question, b.decision.options.map((o) => [o.label, idx(o.next)])] : 0,
    })),
  };
  return b64(JSON.stringify(data));
}
// Accepts the code alone or a whole shared link. Returns a fresh draft, or
// null for anything that is not a well-formed quest.
export function importCode(str) {
  try {
    const m = String(str || '').match(/quest=([A-Za-z0-9_-]+)/);
    const code = m ? m[1] : String(str || '').trim();
    const d = JSON.parse(unb64(code));
    if (!d || d.v !== 1 || typeof d.n !== 'string' || !Array.isArray(d.b) || !d.b.length || d.b.length > 60) return null;
    const p = newPlan();
    p.name = text(d.n, 80);
    p.emoji = emoji(d.e, '🎯');
    p.blocks = d.b.map(() => newBlock());
    const ref = (i) => (Number.isInteger(i) && p.blocks[i] ? p.blocks[i].id : null);
    d.b.forEach((s, i) => {
      const b = p.blocks[i];
      if (!s || typeof s !== 'object') throw new Error('bad step');
      b.title = text(s.t, 80);
      b.days = Math.max(1, Math.min(MAX_DAYS, Number(s.d) || 1));
      b.tasks = (Array.isArray(s.k) ? s.k : []).slice(0, 40).map((x) => ({ id: uid(), emoji: emoji(x && x[0]), name: text(x && x[1], 80) })).filter((x) => x.name);
      b.next = ref(s.x);
      if (Array.isArray(s.q) && Array.isArray(s.q[1])) {
        const options = s.q[1].slice(0, MAX_OPTIONS).map((o) => ({ label: text(o && o[0], 40), next: ref(o && o[1]) })).filter((o) => o.label);
        if (options.length >= 2) { b.decision = { question: text(s.q[0], 120), options }; b.next = null; }
      }
    });
    p.root = ref(d.r) || p.blocks[0].id;
    return p;
  } catch { return null; }
}
