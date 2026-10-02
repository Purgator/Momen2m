// Tiny DOM helpers and text formatters shared by every UI module.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const cssEsc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'));
// A short wobble on a field that refused its value.
export const shake = (el) => { if (!el) return; el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 500); };
// 0.83 → "83%"; null/undefined (no data yet) → "–".
export const pctText = (r) => (r === null || r === undefined ? '–' : Math.round(r * 100) + '%');
export const signed = (n) => (n > 0 ? '+' : '') + n;
