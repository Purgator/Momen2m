// Regenerates the README screenshots in docs/ by driving the real app in headless Chrome.
// Usage: node tools/screenshots.js [port]   (default port 6831)
//
// Puppeteer is the one thing here that is not zero-dependency, and it is not a
// dependency of this project: nothing is installed in this repository. The script
// looks for an existing install, in this order: this folder's own node_modules (if
// you ran `npm install --no-save puppeteer`), the folder named by PUPPETEER_DIR
// (any project that has puppeteer in its node_modules), then every sibling folder
// of this repository.
//
// Everything shown is made up: the script serves the app itself on localhost,
// answers relay.config.js with an empty file (no push relay, whatever the local
// config says), refuses every request to another host, pins the clock to a fixed
// day and fills a fresh browser profile with demo moments and a demo history
// built through the app's own modules.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const docs = path.join(root, 'docs');
const port = Number(process.argv[2] || process.env.PORT || 6831);
const origin = 'http://localhost:' + port;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// The moment every screenshot is taken at: a Thursday, a little before 1 pm.
const CLOCK = [2026, 9, 15, 12, 48, 20]; // year, month (0-based), day, h, min, s
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

function loadPuppeteer() {
  const bases = [root];
  if (process.env.PUPPETEER_DIR) bases.push(path.resolve(process.env.PUPPETEER_DIR));
  for (const e of fs.readdirSync(path.join(root, '..'), { withFileTypes: true })) {
    if (e.isDirectory()) bases.push(path.join(root, '..', e.name));
  }
  for (const base of bases) {
    try { return require(require.resolve('puppeteer', { paths: [base] })); } catch { /* next */ }
  }
  console.error('puppeteer not found. Point PUPPETEER_DIR at a project that has it installed, or run: npm install --no-save puppeteer');
  process.exit(1);
}

// ---- the app, served as it is, minus the deployment-specific relay config ---------
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
};
function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/relay.config.js') { res.writeHead(200, { 'Content-Type': types['.js'] }); return res.end('// no relay for screenshots\n'); }
    // An empty page on the app's origin, to fill its storage before the app boots.
    if (p === '/__seed') { res.writeHead(200, { 'Content-Type': types['.html'] }); return res.end('<!doctype html><title>seed</title>'); }
    if (p.endsWith('/')) p += 'index.html';
    const file = path.normalize(path.join(root, p));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, () => resolve(server)); });
}

// ---- runs in the page -----------------------------------------------------------------
// Before any script of the app: the clock starts at CLOCK on every load and ticks from there.
function pinClock(clock) {
  const Real = Date;
  const offset = new Real(...clock).getTime() - Real.now();
  window.Date = class extends Real {
    constructor(...a) { if (a.length) super(...a); else super(Real.now() + offset); }
    static now() { return Real.now() + offset; }
  };
  try { Object.defineProperty(navigator, 'language', { get: () => 'en-GB' }); } catch { /* keep the browser's */ }
}

// A month of someone's life with the app, written through its own modules so the
// shapes are the real ones. Deterministic: the same run gives the same pictures.
async function seedDemo() {
  const { state, save } = await import('/js/store.js');
  const { setLang } = await import('/js/i18n.js');
  const { PRESETS } = await import('/js/presets.js');
  const T = await import('/js/time.js');
  const P = await import('/js/plans.js');
  const { seedOnce } = await import('/js/questPresets.js');

  const now = Date.now(), today = T.dayKey();
  const BASE = { 1: 10, 2: 20, 3: 30 };
  let seed = 20261015;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  state.lang = 'en'; setLang('en');
  state.onboarded = true;
  state.lastView = 'live';

  const created = T.at(T.addDays(today, -40), '06:00');
  const preset = (id, slots) => {
    const p = PRESETS.find((x) => x.id === id);
    return {
      id: 'demo-' + id, preset: id, name: p.name, desc: p.desc, emoji: p.emoji,
      slots: (slots || p.slots).map(([start, end]) => ({ start, end })),
      days: [0, 1, 2, 3, 4, 5, 6], importance: p.importance, snooze: true, enabled: true, once: null, createdAt: created,
    };
  };
  state.habits = [
    preset('wake'), preset('water'), preset('lunch'), preset('air', [['12:30', '14:30']]),
    preset('exercise'), preset('dinner'),
    {
      id: 'demo-guitar', preset: null, name: 'Guitar practice', desc: 'Ten minutes, one song.', emoji: '🎸',
      slots: [{ start: '20:30', end: '21:00' }], days: [1, 2, 3, 4, 5], importance: 1, snooze: true, enabled: true, once: null, createdAt: created,
    },
    preset('read'), preset('sleep'),
  ];
  state.templates = [
    { id: 'demo-t1', name: 'Call back', emoji: '📞', minutes: 15, importance: 2 },
    { id: 'demo-t2', name: 'Laundry', emoji: '🧺', minutes: 30, importance: 1 },
  ];
  state.habitsVersion = 12; state.backedUpAtVersion = 12; state.lastBackupAt = now - 2 * 86400000;

  // History: mostly done, a few misses and skips, two clean runs for the streaks.
  const g = state.game;
  const windowOf = (day, s) => {
    const start = T.at(day, s.start);
    return [start, T.at(day, s.end, T.parseHM(s.end) <= T.parseHM(s.start) ? 1 : 0)];
  };
  const finish = (h, start, end, early) => {
    const base = BASE[h.importance], pts = base + (early ? Math.round(base / 2) : 0);
    const f = early ? 0.08 + rnd() * 0.35 : 0.55 + rnd() * 0.4;
    g.done++; if (early) g.early++;
    return { status: 'done', snoozes: 0, pts, at: Math.round(start + (end - start) * f), early, nStart: true };
  };
  state.days = {};
  for (let i = 30; i >= 1; i--) {
    const day = T.addDays(today, -i), clean = i <= 6 || (i >= 12 && i <= 19);
    const recs = state.days[day] = {};
    let perfect = true;
    for (const h of state.habits) {
      if (!h.days.includes(T.weekday(day))) continue;
      h.slots.forEach((s, k) => {
        const [start, end] = windowOf(day, s), base = BASE[h.importance], r = rnd();
        let rec;
        if (clean || r < 0.84) {
          rec = finish(h, start, end, rnd() < 0.45);
          if (!clean && rnd() < 0.08) { rec.snoozes = 1; rec.pts -= 3; }
        } else if (r < 0.94) { rec = { status: 'missed', snoozes: 0, pts: -base, at: end, nStart: true }; g.missed++; perfect = false; }
        else { rec = { status: 'skipped', snoozes: 0, pts: -base / 2, at: Math.round((start + end) / 2), nStart: true }; perfect = false; }
        g.xp = Math.max(0, g.xp + rec.pts);
        recs[h.id + '#' + k] = rec;
      });
    }
    if (perfect) { g.streak++; g.bestStreak = Math.max(g.bestStreak, g.streak); } else g.streak = 0;
  }
  g.lastEvaluated = T.addDays(today, -1);
  // Today so far: every window already closed was done in time.
  const recs = state.days[today] = {};
  for (const h of state.habits) {
    if (!h.days.includes(T.weekday(today))) continue;
    h.slots.forEach((s, k) => {
      const [start, end] = windowOf(today, s);
      if (end > now) return;
      const rec = recs[h.id + '#' + k] = finish(h, start, end, h.preset === 'water');
      g.xp += rec.pts;
    });
  }
  // A one-off for this afternoon, as added from the + button.
  state.habits.push({
    id: 'demo-dentist', preset: null, name: 'Call the dentist', emoji: '📞', desc: '', slots: [{ start: '15:00', end: '15:15' }],
    days: [], importance: 2, snooze: true, enabled: true, once: today, createdAt: now - 3 * 3600000,
  });
  Object.assign(g, { shares: 1, onceDone: 6, pauseTokens: 2, pauseXp: 60 });

  // Quests: the app's own examples, one of them on its third day, another starting today.
  seedOnce();
  const begin = (id) => P.start(state.plans.find((p) => p.preset === id && p.status === 'draft'), today, now);
  const flat = begin('move');
  flat.startDay = T.addDays(today, -2); flat.startedAt = now - 2 * 86400000;
  const tasks = P.blockOf(flat, flat.root).tasks;
  P.completeTask(flat, 0, tasks[0].id, T.at(flat.startDay, '18:40'));
  P.completeTask(flat, 0, tasks[1].id, T.at(T.addDays(today, -1), '19:05'));
  begin('race');

  save();
  await new Promise((r) => setTimeout(r, 400)); // the store writes on a short timer
  return { xp: g.xp, streak: g.streak, best: g.bestStreak, done: g.done, stored: !!localStorage.getItem('momen2m.v1') };
}

// ---- the shots --------------------------------------------------------------------------
(async () => {
  const puppeteer = loadPuppeteer();
  fs.mkdirSync(docs, { recursive: true });
  const server = await serve();
  const browser = await puppeteer.launch({
    args: ['--lang=en-GB', `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost`],
  });
  try {
    // One fresh profile per scene: nothing carries over, nothing real is read.
    const open = async (scheme) => {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport(PHONE);
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
      await page.setRequestInterception(true);
      page.on('request', (req) => (req.url().startsWith(origin + '/') ? req.continue() : req.abort()));
      page.on('pageerror', (err) => { throw err; });
      await page.evaluateOnNewDocument(pinClock, CLOCK);
      return page;
    };
    const shot = async (page, name) => {
      await page.waitForFunction(() => !document.querySelector('#toasts').children.length);
      await page.screenshot({ path: path.join(docs, name + '.png') });
      console.log('wrote docs/' + name + '.png');
    };
    const tab = async (page, view, ready) => {
      await page.click(`.tabbar [data-view="${view}"]`);
      await page.waitForSelector(ready);
      await wait(500);
    };

    // 1-3. A day in progress: Now, Progress, Quests.
    let page = await open('dark');
    await page.goto(origin + '/__seed');
    console.log('demo data:', JSON.stringify(await page.evaluate(seedDemo)));
    await page.goto(origin + '/');
    await page.waitForSelector('.occ.current');
    await wait(2600); // the card scrolls into place, the ring takes its first tick
    await page.evaluate(() => scrollTo(0, 0)); // show the score bar rather than the centred card
    await shot(page, 'now');
    await tab(page, 'progress', '.screen.progress');
    await shot(page, 'progress');
    await page.evaluate(() => { document.querySelector('.badges').closest('.section').scrollIntoView(); scrollBy(0, -8); });
    await wait(300);
    await shot(page, 'badges');
    await tab(page, 'agenda', '.screen.agenda');
    await shot(page, 'quests');
    await page.browserContext().close();

    // 4. The guided setup on a brand-new install: a few answers given.
    page = await open('dark');
    await page.goto(origin + '/');
    await page.setViewport({ ...PHONE, height: 900 }); // a slightly taller phone: the whole step, buttons included
    await page.waitForSelector('.ob');
    await page.click('[data-action="ob-lang"][data-lang="en"]');
    await page.click('[data-action="ob-next"]');
    await page.click('[data-action="ob-next"]');
    for (const [q, v] of [['water', 'no'], ['meals', 'yes'], ['move', 'no'], ['meds', 'no'], ['tidy', 'yes']]) {
      await page.click(`[data-action="ob-answer"][data-q="${q}"][data-v="${v}"]`);
    }
    await wait(400);
    await shot(page, 'setup');
    await page.browserContext().close();
  } finally {
    await browser.close();
    server.close();
  }
})().catch((err) => { console.error(err); process.exit(1); });
