// Agenda: goals planned as steps — blocks of consecutive days, each with its
// tasks — optionally branching on a question asked when a step is over. A goal
// is a template until it is started on a chosen day; from then on the steps
// taken form a dated path. Independent from the moments engine: plain points
// (no boost, no pause tokens), no penalties — misses only leave % behind.
import { state, save, uid } from './store.js';
import { addPlainXp } from './engine.js';
import { dayKey, addDays } from './time.js';

export const TASK_PTS = 5;          // a task done during its step
export const LATE_DIV = 4;          // done after the step: a quarter
export const BLOCK_BONUS = 10;      // every task of a step done, none late
export const GOAL_PTS_PER_DAY = 50; // × completion × planned days, doubled at 100 %
export const MAX_OPTIONS = 3;
export const MAX_DAYS = 30;

export function newBlock() { return { id: uid(), title: '', days: 1, tasks: [], next: null, decision: null }; }
export function newTask() { return { id: uid(), name: '', emoji: '' }; }
export function newPlan() {
  const b = newBlock();
  return { id: uid(), name: '', emoji: '🎯', blocks: [b], root: b.id, status: 'draft', startDay: null, path: [], done: {}, decisions: {}, finished: null, createdAt: Date.now() };
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
export const taskKey = (blockId, taskId) => blockId + '/' + taskId;
export const isDone = (p, b, x) => !!p.done[taskKey(b.id, x.id)];

// Steps as they would be walked from the root, first choice at every
// question: an estimate for a draft ("≈ 6 days · 3 steps").
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
  for (const id of p.path) {
    const b = blockOf(p, id); if (!b) break;
    out.push({ block: b, from: day, to: addDays(day, b.days - 1) });
    day = addDays(day, b.days);
  }
  return out;
}
export function blockPct(p, b) { return b.tasks.length ? b.tasks.filter((x) => isDone(p, b, x)).length / b.tasks.length : 1; }
export function goalPct(p, sched = schedule(p)) {
  let w = 0, s = 0;
  for (const x of sched) { w += x.block.days; s += blockPct(p, x.block) * x.block.days; }
  return w ? s / w : 0;
}
export const pathDays = (p) => schedule(p).reduce((n, x) => n + x.block.days, 0);
export function dayIndex(p, today) {
  return Math.round((new Date(today + 'T12:00') - new Date(p.startDay + 'T12:00')) / 86400000) + 1;
}

export function start(p, day) {
  if (p.status !== 'draft' || !blockOf(p, p.root)) return false;
  Object.assign(p, { status: 'active', startDay: day, path: [p.root], done: {}, decisions: {}, startedAt: Date.now() });
  save();
  return true;
}

// The last step, when its days are over and its question is still unanswered.
export function pendingDecision(p, today) {
  const sched = schedule(p);
  const last = sched[sched.length - 1];
  if (!last || today <= last.to || !last.block.decision || p.decisions[last.block.id] !== undefined) return null;
  return last;
}

// What can be done today: the current step's tasks, plus earlier steps' (late).
export function openTasks(p, today) {
  const out = [];
  for (const x of schedule(p)) {
    if (x.from > today) continue;
    const late = today > x.to;
    for (const task of x.block.tasks) {
      if (isDone(p, x.block, task)) continue;
      out.push({ plan: p, block: x.block, task, late, to: x.to, pts: late ? Math.round(TASK_PTS / LATE_DIV) : TASK_PTS });
    }
  }
  return out;
}

export function completeTask(p, blockId, taskId, now) {
  const today = dayKey(new Date(now));
  const b = blockOf(p, blockId);
  const task = b && b.tasks.find((x) => x.id === taskId);
  if (p.status !== 'active' || !task || isDone(p, b, task)) return null;
  const x = schedule(p).find((e) => e.block === b);
  if (!x || x.from > today) return null;
  const late = today > x.to;
  const pts = late ? Math.round(TASK_PTS / LATE_DIV) : TASK_PTS;
  const rec = { day: today, at: now, pts, late };
  p.done[taskKey(b.id, task.id)] = rec;
  const full = blockPct(p, b) >= 1 && b.tasks.every((y) => !p.done[taskKey(b.id, y.id)].late);
  if (full) rec.bonus = BLOCK_BONUS;
  addPlainXp(pts + (rec.bonus || 0));
  state.game.goalTasks = (state.game.goalTasks || 0) + 1;
  save();
  return { pts: pts + (rec.bonus || 0), late, full };
}

export function decide(p, blockId, idx, now) {
  const b = blockOf(p, blockId);
  if (p.status !== 'active' || !b || !b.decision || !b.decision.options[idx]) return false;
  p.decisions[blockId] = idx;
  save();
  advance(now);
  return true;
}

// Walks time forward for every running goal: follows steps whose days are
// over, waits on unanswered questions, finishes goals that reached their end.
// Returns the goals finished on this call, and whether anything moved.
export function advance(now) {
  const today = dayKey(new Date(now));
  const finished = [];
  let changed = false;
  for (const p of state.plans || []) {
    if (p.status !== 'active') continue;
    for (let guard = 0; guard < 60; guard++) {
      const sched = schedule(p);
      const last = sched[sched.length - 1];
      if (!last || today <= last.to) break;
      const b = last.block;
      let next;
      if (b.decision) { const i = p.decisions[b.id]; if (i === undefined) break; next = (b.decision.options[i] || {}).next || null; }
      else next = b.next;
      changed = true;
      if (next && blockOf(p, next)) { p.path.push(next); save(); continue; }
      finished.push({ plan: p, ...finish(p, now) });
      break;
    }
  }
  return { finished, changed };
}

// Ends a goal where it stands and pays it: completion × 50 pts × planned
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
  save();
  return { pct, pts, days, flawless };
}

export function remove(id) { state.plans = (state.plans || []).filter((p) => p.id !== id); save(); }

// Agenda points earned on a day (tasks, step bonuses, goals finished).
export function pointsOn(day) {
  let sum = 0;
  for (const p of state.plans || []) {
    for (const k in p.done) { const d = p.done[k]; if (d.day === day) sum += (d.pts || 0) + (d.bonus || 0); }
    if (p.finished && p.finished.day === day) sum += p.finished.pts;
  }
  return sum;
}

export function stats() {
  const g = state.game;
  return { done: g.goalsDone || 0, flawless: g.goalsFlawless || 0, longest: g.goalLongest || 0, tasks: g.goalTasks || 0 };
}
