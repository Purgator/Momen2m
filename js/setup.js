// First-run questionnaire: turns a handful of answers (wake and bed time,
// working hours, yes/no habits with a times-per-day count) into concrete
// moment proposals. Pure functions, no DOM: tested in tools/test.js.
import { PRESETS } from './presets.js';
import { parseHM, minutesToHM } from './time.js';

// The preset table's default slots were written for this rhythm; a different
// wake or bed time shifts the morning and evening slots accordingly.
const REF_WAKE = 7 * 60, REF_BED = 22 * 60 + 30;

// trigger: which answer adds the presets. count: optional "how many times a
// day" stepper shown once triggered. Question text lives in i18n as obQ_<id>.
export const QUESTIONS = [
  { id: 'water', emoji: '💧', trigger: 'no', presets: ['water'], count: { def: 3, min: 1, max: 8 } },
  { id: 'meals', emoji: '🍽️', trigger: 'no', presets: ['breakfast', 'lunch', 'dinner'] },
  { id: 'move', emoji: '🏃', trigger: 'no', presets: ['exercise'] },
  { id: 'meds', emoji: '💊', trigger: 'yes', presets: ['meds'], count: { def: 1, min: 1, max: 4 } },
  { id: 'teeth', emoji: '🪥', trigger: 'yes', presets: ['teeth'], count: { def: 2, min: 1, max: 3 } },
  { id: 'screens', emoji: '📵', trigger: 'yes', presets: ['screens'] },
  { id: 'tidy', emoji: '🧹', trigger: 'yes', presets: ['tidy'] },
];

export function defaultAnswers() {
  const q = {};
  for (const x of QUESTIONS) q[x.id] = { v: null, n: x.count ? x.count.def : 0 };
  return { wake: '07:00', bed: '22:30', work: null, workStart: '09:00', workEnd: '18:00', q };
}

export function isTriggered(question, answer) {
  return !!answer && answer.v === question.trigger;
}

export function clampCount(question, n) {
  if (!question.count) return 0;
  return Math.min(question.count.max, Math.max(question.count.min, n | 0));
}

const r5 = (m) => Math.round(m / 5) * 5;
const win = (start, len) => ({ start: minutesToHM(r5(start)), end: minutesToHM(r5(start + len)) });

// n windows of `len` minutes spread evenly so the first starts at `a` and the
// last ends at `b`; a single one sits in the middle.
function spread(n, a, b, len) {
  if (n <= 1) return [win((a + b - len) / 2, len)];
  const step = (b - a - len) / (n - 1);
  return Array.from({ length: n }, (_, i) => win(a + i * step, len));
}

// Bed time is read as "after wake", so 00:30 counts as 24:30 of the same day.
function anchors(a) {
  const wake = parseHM(a.wake);
  let bed = parseHM(a.bed);
  if (bed <= wake) bed += 1440;
  return { wake, bed, wakeDelta: wake - REF_WAKE, bedDelta: bed - REF_BED };
}

// Slots for one preset given the answers. Presets without a dedicated rule
// keep their default windows, shifted with the morning or the evening.
export function slotsFor(id, a) {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return [];
  const { wake, bed, wakeDelta, bedDelta } = anchors(a);
  const count = (qid) => clampCount(QUESTIONS.find((x) => x.id === qid), a.q[qid] ? a.q[qid].n : 0) || 1;
  const ws = parseHM(a.workStart), we = parseHM(a.workEnd);
  switch (id) {
    case 'wake': return [win(wake, 30)];
    case 'sleep': return [win(bed, 45)];
    case 'breakfast': return [win(wake + 30, 60)];
    case 'lunch': return a.work ? [win(ws + 180, 90)] : [win(12 * 60, 90)];
    case 'dinner': return [win(bed - 210, 90)];
    case 'exercise': {
      const start = a.work ? we + 15 : 18 * 60 + bedDelta;
      return [win(Math.min(start, bed - 120), 90)];
    }
    case 'water': return spread(count('water'), wake + 60, bed - 120, 60);
    case 'meds': return spread(count('meds'), wake + 30, bed - 30, 60);
    case 'teeth': return spread(count('teeth'), wake + 45, bed, 45);
    case 'screens': return [win(bed - 45, 30)];
    case 'tidy': return [win(bed - 150, 60)];
    default:
      return p.slots.map(([s, e]) => {
        const start = parseHM(s), len = ((parseHM(e) - start) % 1440 + 1440) % 1440 || 1440;
        const delta = start < 12 * 60 ? wakeDelta : start >= 18 * 60 ? bedDelta : 0;
        return win(start + delta, len);
      });
  }
}

// Every preset with its slots for these answers; `proposed` marks the ones the
// answers call for (wake and bed are always in, they were just typed in).
export function proposeMoments(a) {
  const wanted = new Set(['wake', 'sleep']);
  for (const q of QUESTIONS) if (isTriggered(q, a.q[q.id])) for (const id of q.presets) wanted.add(id);
  return PRESETS.map((p) => ({ preset: p, proposed: wanted.has(p.id), slots: slotsFor(p.id, a) }));
}
