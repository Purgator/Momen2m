# Momen2m — codebase map, scoring rules, and current status

This complements `CLAUDE.md` (commit/release process and product constraints)
with the parts a session otherwise has to reconstruct by reading half the
codebase: where things live, the exact current point math, and what has
already shipped.

## Codebase map

Vanilla-JS ES modules, no build step, no framework. Repo root has
`index.html`, `sw.js`, `css/app.css`, `js/*.js`, `tools/`. Worktree sessions
run from `.claude/worktrees/<name>/` — never `cd` to the main checkout; land
with `git push origin HEAD:main` (see `CLAUDE.md`).

**State**: a single object in `js/store.js`, persisted to localStorage under
`momen2m.v1` (debounced save, 120 ms), with defaults + `mergeWithDefaults` so
old saves upgrade cleanly. A recovery snapshot lives at
`momen2m.v1.recovery` (reasons: reset, import, before-restore, setup) so
destructive actions are undoable. Shape roughly: `settings` (toggles),
`habits` (recurring + one-time moments), `templates` (premade one-time
moments), `days[dayKey][habitId#slotIndex]` (occurrence records:
status/pts/at/late/snoozes/early), `game` (xp/streak/badges/lifetime
counters/boostUntil/lastEncouraged/onceDone/recovered), `lastSeenVersion`,
`habitsVersion` / `backedUpAtVersion` (drives the backup nag).

**Engine** (`js/engine.js`): pure functions over that state — `complete`,
`completeLate` (see Scoring below), `skip`, `snooze`, `undo`, `tick`
(advances time, marks misses, settles streaks), `buildOccurrences`,
`canCompleteLate` / `LATE_WINDOW` (24 h), `boostActive` / `grantBoost` /
`BOOST_MS` (12 h) / `BOOST_MULT` (1.5×). `BASE_PTS = {1:10, 2:20, 3:30}` by
importance, `SNOOZE_PENALTY = 3`. Pauses: `PAUSE_MAX` (3 in stock) /
`PAUSE_XP` (150 pts of gains per token, stock stops filling when full) /
`PAUSE_MS` (3 h each); `startPause(n, now)` spends 1–3 tokens (no stacking
while one runs), `pausedUntil(now)`; `game.pauseLog` keeps the intervals and
`occurrencesOfDay` leaves out open moments overlapping one, so they are
neither shown, notified, nor missed, and don't block a perfect day.

**Gamification** (`js/game.js`): `computeStats(now, occs)` builds everything
`ui.js` renders (level, streak, lifetime/period counters, perHabit,
badges-in-progress, tips). `momentKey(habit)` = emoji+name lowercased —
identity for merging stats across a repeating and any one-time copies, for
keeping repeating moments unique (`nameConflict`) and premades unique
(`upsertTemplate`, which asks before replacing). One-time moments themselves
can be added any number of times. `BADGES`
is an array of `{id, emoji, goal(stats) -> [current, target]}`, names and
descriptions live in i18n under `badgeNames` / `badgeDescs`. `BADGE_PAGE = 9`,
paged UI in `renderProgress`, navigable by tapping ‹/› or by swiping the
grid (delegated touchstart/touchend in `app.js`, `changeBadgePage()`).
`timingAdvice()` suggests moving a moment's slot only with ≥7 tightly
clustered samples (`ADVICE_MIN_SAMPLES` / `ADVICE_MAX_SPREAD`) — never on
thin or noisy data.

**Setup / onboarding** (`js/setup.js` + `app.js`'s `ob` state): `QUESTIONS`
(water/meals/move/etc., trigger + yes/no + count), `proposeMoments(answers)`,
`reviewStatus()` diffs a re-run against existing habits (new/changed/
same/removed, colour-coded, tooltip) and only applies on the last page's
confirm — never loses points, snapshots to recovery first.

**UI** (`js/ui.js`, pure string-returning render functions plus
`openSheet`/`closeSheet` bottom sheets): `renderLive` / `renderProgress` /
`renderMoments` / `renderSetup` / `renderOnboarding`. A delegated click
handler on `#app` is keyed by `data-action` (`app.js`); `data-stop` blocks a
row's own action; `data-setting` is the generic settings-change handler.
Tabs: live, progress, moments, setup.

**i18n** (`js/i18n.js`): `t(key, vars)` with `{var}` interpolation, `en`/`fr`
objects side by side — every new user-facing string needs both, French uses
"tu". Emoji-prefixed strings are the house style throughout the UI.

**Testing**: `npm test` runs `tools/test.js` (Node, no framework — hand-rolled
`test()`/`assert`, plus 4 relay tests for the Cloudflare Worker crypto/queue
logic). Currently 31 + 4 passing (2026-09-19). Add a test alongside any
engine/game logic change; the file is large — `grep -n` for the nearest
existing test of the same feature before appending.

**Browser verification**: `.claude/launch.json` has a `momen2m` preview
config on port 8093. Screenshots via the Claude Browser tool routinely time
out when the pane is hidden — verify instead with `javascript_tool` running
DOM/localStorage assertions (seed `localStorage['momen2m.v1']` directly,
reload, then read `.toast` / `.sheet` etc. text, or dispatch synthetic
`TouchEvent`s for gesture testing, as done for the badge-swipe feature).

## Scoring rules

As of v1.16.2 (2026-09-19), in `js/engine.js`:

- **Done in time**: `BASE_PTS[importance]` (10/20/30), +50% if in the first
  half of the window ("early"/"quick", not morning — see the badge rename
  below).
- **Missed**: `-BASE_PTS[importance]`.
- **Skipped**: `-BASE_PTS[importance]/2`.
- **Snoozed**: `-SNOOZE_PENALTY` (3) each time, always kept even if later
  undone or done late.
- **Done late** (`completeLate`, within 24 h of a miss via
  `canCompleteLate`): the miss penalty is **not** lifted — it stays a net
  loss. Only a quarter of the base points is given back on top
  (`latePts()`). E.g. importance 2: the miss is −20, the late completion
  adds back +5, net −15. Counts as done and as a `recovered` stat for
  badges. **This was changed 2026-09-19** — v1.15.0 originally lifted the
  penalty entirely (net positive); the user corrected it to stay a penalty,
  softened only by the quarter given back.
- **Boost** (`boostActive`/`grantBoost`, granted automatically alongside the
  "rough patch" encouragement toast after 3 misses in a row, once per day):
  for the next 12 h (`BOOST_MS`), every gain (base + early bonus, and the
  late quarter) is multiplied by 1.5 (`BOOST_MULT`). Shown as a banner in
  the live view and a ⚡ prefix on the stake/toast. Added 2026-09-19 in the
  same session as the penalty-lift reversal above — don't confuse the two:
  the boost multiplies gains, the late-completion fix stopped lifting the
  loss.
- Badges named "early"/"early50" reward finishing in the first half of a
  window, not morning completion — renamed to "Quick hands" / "Fifty quick
  ones" in English (💨 emoji) and "Mains rapides" → **"Flash"** /
  "Cinquante rapides" in French (the French "early" name went through two
  renames in one week: Lève-tôt → Mains rapides → Flash).

Before touching `complete` / `completeLate` / `skip` / `snooze`, re-read this
list; the unit tests in `tools/test.js` ("late completion...", "boost:
+50%...") encode these exact numbers and are the executable source of truth
if this doc and the code ever disagree.

## Current status

Latest released version as of 2026-09-19: **v1.16.2** (tag pushed, GitHub
release published, `main` up to date). The user's local `main` checkout has
repeatedly lagged behind `origin/main` after worktree sessions land — if
behaviour looks stale, suggest `git pull` before debugging further.

Shipped feature set (newest first), so a request isn't re-implemented from
scratch:

- **v1.16.2**: swipe left/right on the badge grid to change page (touch
  gesture, delegated on `#app`, alongside the existing ‹/› buttons).
- **v1.16.1**: French "early" badge renamed Mains rapides → Flash.
- **v1.16.0**: rough-patch boost (+50% for 12 h after 3 misses in a row);
  "Done late" reworked to keep the miss penalty (see Scoring above);
  early/early50 badges renamed to reflect speed, not morning.
- **v1.15.0**: Moments tab split out from Setup (my moments / suggestions /
  premades; Setup keeps settings/alerts/snooze/data/about); tomorrow's
  one-time moments shown in "Coming up"; the original (later-corrected)
  "Done late"; badge paging + 10 new badges; timing-advice tips; rough-patch
  encouragement toast (no boost yet — that came in 1.16.0).
- **v1.9.0–v1.14.0**: update-check loader + post-update summary popup
  (skippable, "don't show next time", lists every skipped version); guided
  first-run setup with re-setup diffing (green/orange/red); backup
  overwrite-vs-timestamped toggle; 10 s undo on a new one-off; premade
  one-time moments (save/manage/edit, unique emoji+name per kind, merged
  stats for repeating+one-time pairs).

Commit/PR attribution lines (`Co-Authored-By:` model name, PR footer) are
dictated fresh by each session's own system reminder and change with the
active model — always use whatever the current session states, never
hardcode a specific model name from a past release.
