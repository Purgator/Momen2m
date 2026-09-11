// What would change if an incoming state (import file, recovery snapshot)
// replaced the current one. Pure data; ui.js turns it into +/−/~ rows so a
// "Replace" never happens blind.

// The fields a user would recognise as "the moment changed". Ids, createdAt
// and per-day records are deliberately left out.
function signature(h) {
  return JSON.stringify({
    name: h.name, emoji: h.emoji, desc: h.desc || '', slots: h.slots || [], days: (h.days || []).slice().sort(),
    importance: h.importance, enabled: h.enabled !== false, snooze: h.snooze !== false, once: h.once || null,
  });
}

// Which facets differ between two versions of the same moment, in display order.
export function changedFacets(from, to) {
  const out = [];
  if (JSON.stringify(from.name) !== JSON.stringify(to.name)) out.push('name');
  if (JSON.stringify(from.slots || []) !== JSON.stringify(to.slots || [])) out.push('time');
  if (JSON.stringify((from.days || []).slice().sort()) !== JSON.stringify((to.days || []).slice().sort())) out.push('days');
  if (from.importance !== to.importance) out.push('importance');
  if ((from.enabled !== false) !== (to.enabled !== false)) out.push('enabled');
  if (out.length === 0) out.push('other'); // emoji, note, snooze flag…
  return out;
}

export function diffStates(cur, next) {
  const curH = (cur && cur.habits) || [];
  const nextH = (next && next.habits) || [];
  const byId = new Map(curH.map((h) => [h.id, h]));
  const seen = new Set();
  const added = [], changed = [], same = [];
  for (const h of nextH) {
    const c = byId.get(h.id);
    if (!c) { added.push(h); continue; }
    seen.add(h.id);
    if (signature(c) !== signature(h)) changed.push({ from: c, to: h, facets: changedFacets(c, h) });
    else same.push(h);
  }
  const removed = curH.filter((h) => !seen.has(h.id));
  const xpFrom = ((cur && cur.game) || {}).xp || 0;
  const xpTo = ((next && next.game) || {}).xp || 0;
  return {
    added, removed, changed, same,
    xp: { from: xpFrom, to: xpTo },
    identical: !added.length && !removed.length && !changed.length && xpFrom === xpTo,
  };
}
