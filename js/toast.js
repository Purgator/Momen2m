// Toasts and sparkles: short-lived feedback layered over the page.
import { $, esc } from './dom.js';

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
// A bigger burst than sparkles(): centred, for level-ups and badges.
export function celebrate(emojis) {
  const x = innerWidth / 2, y = innerHeight / 2.6;
  sparkles(x, y, emojis);
  setTimeout(() => sparkles(x - 60, y + 40, emojis), 150);
  setTimeout(() => sparkles(x + 60, y + 40, emojis), 300);
}
