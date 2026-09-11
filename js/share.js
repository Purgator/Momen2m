// Sharing progress: a generated PNG card plus a line of text, handed to the
// system share sheet when there is one, otherwise copied to the clipboard (and
// the card downloaded on desktop). Returns how it went so the UI can say so.

// Draws a 1200×630 card (the size every messenger previews nicely).
export function drawShareCard(c, { title, subtitle, stats, week, footer, dark = true }) {
  const W = 1200, H = 630;
  const canvas = c || document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, W, H);
  if (dark) { bg.addColorStop(0, '#151a2e'); bg.addColorStop(1, '#0f1220'); } else { bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#eceef8'); }
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // soft accent blob
  const glow = ctx.createRadialGradient(W - 220, 120, 20, W - 220, 120, 420);
  glow.addColorStop(0, 'rgba(108,112,255,.55)'); glow.addColorStop(1, 'rgba(108,112,255,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  const text = dark ? '#eef0ff' : '#171a2e', muted = dark ? '#9aa0c3' : '#626890';
  const font = (px, w = 700) => `${w} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = muted; ctx.font = font(30, 700); ctx.fillText('Momen2m', 64, 56);
  ctx.fillStyle = text; ctx.font = font(76, 800); ctx.fillText(title, 64, 104);
  ctx.fillStyle = muted; ctx.font = font(34, 600); ctx.fillText(subtitle, 64, 200);

  // stat tiles
  const tileW = 240, tileH = 130, gap = 24, y0 = 280;
  stats.slice(0, 4).forEach((s, i) => {
    const x = 64 + i * (tileW + gap);
    ctx.fillStyle = dark ? 'rgba(255,255,255,.06)' : 'rgba(20,24,60,.05)';
    roundRect(ctx, x, y0, tileW, tileH, 22); ctx.fill();
    ctx.fillStyle = text; ctx.font = font(48, 800); ctx.fillText(s.value, x + 22, y0 + 22);
    ctx.fillStyle = muted; ctx.font = font(22, 600); ctx.fillText(s.label, x + 22, y0 + 84);
  });

  // 7-day bars
  const bx = 64, by = 450, bw = 1072, bh = 110;
  const max = Math.max(1, ...week.map((d) => Math.abs(d.value)));
  const colW = bw / week.length;
  week.forEach((d, i) => {
    const h = Math.max(6, (Math.abs(d.value) / max) * (bh - 30));
    const x = bx + i * colW + colW * 0.25, w = colW * 0.5;
    ctx.fillStyle = d.value < 0 ? '#ff5c7a' : d.today ? '#6c70ff' : (dark ? 'rgba(138,141,255,.55)' : 'rgba(84,88,240,.45)');
    roundRect(ctx, x, by + (bh - 30) - h, w, h, 8); ctx.fill();
    ctx.fillStyle = muted; ctx.font = font(20, 600); ctx.textAlign = 'center';
    ctx.fillText(d.label, x + w / 2, by + bh - 22); ctx.textAlign = 'left';
  });

  ctx.fillStyle = muted; ctx.font = font(24, 600); ctx.textAlign = 'right';
  ctx.fillText(footer, W - 64, H - 54); ctx.textAlign = 'left';
  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

const toBlob = (canvas) => new Promise((res) => canvas.toBlob(res, 'image/png'));

// 'shared' | 'copied' | 'downloaded' | 'cancelled' | false
export async function share({ text, url, canvas, fileName = 'momen2m-progress.png' }) {
  const full = url ? text + '\n' + url : text;
  let file = null;
  if (canvas) {
    try { const blob = await toBlob(canvas); if (blob) file = new File([blob], fileName, { type: 'image/png' }); } catch { /* no image, text only */ }
  }
  if (navigator.share) {
    try {
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: full, title: 'Momen2m' });
      else await navigator.share({ text, url, title: 'Momen2m' });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      // fall through to clipboard
    }
  }
  let copied = false;
  try { await navigator.clipboard.writeText(full); copied = true; } catch { /* clipboard blocked */ }
  if (file) {
    try {
      const href = URL.createObjectURL(file);
      const a = document.createElement('a'); a.href = href; a.download = fileName; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 4000);
      return copied ? 'copied' : 'downloaded';
    } catch { /* ignore */ }
  }
  return copied ? 'copied' : false;
}
