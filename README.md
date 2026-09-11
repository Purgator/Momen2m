# Momen2m

**Your day, one moment at a time.**

Momen2m is a tiny life organizer for people who lose track of the small things: drinking
water, moving, eating, going to bed. You describe your day once as a list of *moments*
(a name and a time range). Then, when a moment's time comes, it slides onto your screen
with a ticking countdown. Finish it before the clock runs out and you earn points. Let it
expire and you lose some.

Nothing else. No feed, no menus to dig through, no account.

👉 **Open the app: [purgator.github.io/Momen2m](https://purgator.github.io/Momen2m/)**

Works on **iPhone** (Safari) and **Android** (Chrome) as an installable web app. English and
French, chosen automatically from your device.

## Features

- **Three tabs** — *Setup* to describe your moments, *Now* to live them, *Progress* to see how it's going.
- **Guided setup** in three taps: language, pick suggested moments (water, movement,
  bedtime and a dozen more), allow notifications. Add your own with a name and a time range;
  the emoji is guessed for you, and you can add a note, several times per day, repeat days
  and an importance level.
- **The Now screen** shows one thing by default: the current moment, big, with a
  countdown ring. New moments arrive from the bottom, finished ones fade away at the top.
- **Overlapping moments stay reachable.** If a second one is already running, tap it to
  expand it into its own full card with Done/Snooze/Skip, right there in the list; tap its
  header again to collapse it back.
- **Done, snooze or skip.** Snooze pushes the moment back by the snooze length: it leaves the screen, waits in *Coming up*, and pops up again (with a fresh alert) when the time comes. Snooze can be limited or disabled in the settings.
- **Act from the notification.** On Android the reminder carries *Done* and *Snooze* buttons; a tap on them works whether the app is open or has to be opened first.
- **Tap any moment for more.** A finished one shows a recap (what happened, when, how many
  points) with Undo if it just happened. An upcoming one offers *Do it now* or *Skip* —
  no need to wait for its time to come around.
- **Quick tasks** for one-off things ("call the dentist, 15 minutes") from the `+` button.
- **Points, levels and streaks.** Finishing on time pays, finishing early pays more,
  missing costs points, snoozing costs a little. A perfect day extends your streak.
  Every number explains itself: hover it on a computer, tap it on a phone, and a short
  sheet tells you what it means and how it is counted.
- **A Progress tab** with your level and rank, a 7-day chart, success rate, per-moment
  scores, 17 badges to earn (with progress towards the locked ones), tips computed from
  your own history, and one-tap sharing: a generated progress card (image + text) for
  the share sheet, or an invitation link for a friend.
- **Feedback that lands.** Each completion gets points plus a word of praise, combos
  ("3 in a row!"), a perfect-day cheer, a level-up fanfare with a burst of stars, and
  badge unlocks announced as they happen — sound and vibration included, all optional.
- **Notifications** when a moment starts, shortly before it ends, and when it's missed. Strong alerts stay in the tray until dismissed. They play the system notification sound by default so Android shows them as a pop-up (silent notifications are shown minimised there, and cannot vibrate).
- **Alerts your way.** Pick a tone (chime, bell, marimba, pulse, siren), a volume, and
  test it on the spot. Choose *gentle* (one short tone and buzz, like a notification) or
  *strong* (louder, repeated with a longer vibration until you tap the screen, like an
  alarm) — critical moments can always be strong. Play the sound in-app (media volume),
  through the system notification (notification volume), or both. Vibration either
  follows the tone or has its own pattern; the pattern is kept even while it's synced.
- **Works offline**, stores everything on your device, updates itself silently.
- **Light on the battery**: no framework, no background polling, one tiny timer that goes
  to sleep when the app is not on screen.

## 📥 Install (2 minutes, no technical skills needed)

Momen2m is a web app: there is nothing to download from a store. You add it to your home
screen and it behaves like a normal app.

### iPhone / iPad

1. Open **Safari** and go to **[purgator.github.io/Momen2m](https://purgator.github.io/Momen2m/)**.
2. Tap the **Share** button (the square with an arrow), then **Add to Home Screen**, then **Add**.
3. Open Momen2m **from the new icon on your home screen** (not from Safari).
4. Follow the three setup steps. When asked, **allow notifications**.

Requires iOS 16.4 or newer. Notifications only work when the app is opened from the
home-screen icon.

### Android

1. Open **Chrome** and go to **[purgator.github.io/Momen2m](https://purgator.github.io/Momen2m/)**.
2. Tap **Install** in the banner, or open the ⋮ menu and choose **Install app** / **Add to Home screen**.
3. Open Momen2m from your home screen and follow the three setup steps. **Allow notifications** when asked.

### Good to know

- **Reminders are reliable while Momen2m is on screen.** Web apps cannot wake a phone
  up on their own, and phones pause a web app a few minutes after you switch away from it
  (Android is strict about this: the page is frozen, its timers stop). A reminder due
  during that pause shows up when you come back. Nothing is lost: missed moments are
  marked and points settled. For a day of reminders, keep Momen2m open — on a stand, or
  simply as the app you return to. Reminders that wake the phone need a push server; see
  *Why there is no push server* below.
- **Everything stays on your phone.** There is no server and no account. Use
  *Setup → Data → Export* to save a backup file, and *Import* to restore it on another device.
- **Updates are automatic.** A new version is fetched in the background and applied the
  next time you leave the app. *Setup → About → Check for updates* forces a check.
- You can restart the guided setup at any time from *Setup → About*.

## Sounds, vibration and the "alarm channel"

A web app has two sound channels, and Setup → Alerts exposes both: **in-app sound**
(synthesized on the spot, follows the phone's media volume) and the **system
notification's own sound** (the phone's notification sound for the browser, follows the
notification volume — it can only be switched on or off). Neither is Android's alarm
channel; no browser lets a website use it. The *strong* alert style is the honest
substitute: a louder tone and a longer vibration, repeated for 10–60 s or until you tap
the screen, and a notification that stays until dismissed.

Vibration only works on Android; iPhone ignores it from web apps.

## Never losing your setup

Because Momen2m keeps everything only on your device, it goes out of its way to make sure
a slip of the thumb — or a lost phone — doesn't cost you your setup:

- **Onboarding ends with a backup step.** Once you've picked your moments, a screen invites
  you to back them up in one tap before you start your day.
- **Setup tells you when you're at risk.** A banner appears there whenever you've changed
  your moments since your last backup, and a status line always shows when that was
  ("Last backup: 3 days ago" or "Never backed up").
- **Reset and Import can't surprise you.** Reset now offers *Back up, then erase* as the
  main button, with *Erase without backing up* as a plain link for when you're sure.
  Import and Restore show exactly what is about to change before doing anything: the
  backup's own date (to the second), then the moments it **adds**, **removes** and
  **changes** compared to what is on the device, with the old and new times side by side.
- **Every export gets its own file.** Backups are named to the second
  (`momen2m-2026-09-11_14-05-33.json`), so saving twice never overwrites an earlier one.
- **One backup folder, chosen once.** Where the browser supports it (desktop Chrome and
  Edge today), *Setup → Data* offers *Find my backup* instead of a plain file picker. The
  first time, you point it at a folder of your own — Momen2m remembers it, writes every
  later *Export* straight into it (no dialog, a toast names the file), and *Find my backup*
  scans it for the most recently modified file that actually looks like a Momen2m export
  (even renamed), one level of subfolders included, then offers to restore it in one tap.
  The Data section shows which folder is in use, with a *Change* link. No website can
  search a whole device — no browser allows that — so this only ever looks inside the one
  folder you chose. One catch worth knowing: browsers refuse to hand out the *Downloads*,
  *Desktop*, *Documents* and home folders themselves (they may hold system files), which
  shows up as a "can't open this folder" message — pick or create a subfolder such as
  *Downloads › Momen2m* instead. *Choose a file instead* stays one tap away for a one-off
  restore, and is the only option on browsers without folder access (Safari, Firefox, iOS,
  Android), same as before.
- **A one-step undo sits behind both of them.** Right before Reset or Import changes
  anything, Momen2m silently keeps one copy of what you had. If a tap goes wrong, *Setup →
  Data → Restore* (or a link on the empty *Now* screen) brings it straight back. The
  button shows exactly when that copy was taken and why (before a reset, an import, a
  restore), and the confirmation lists what restoring it would add, remove and change.
- **The browser is asked to protect the storage.** Momen2m calls the Storage API's
  `persist()` on load, which on Android tells Chrome not to clear the site's data when the
  device is low on space. It's best-effort and invisible — there's nothing to configure.

None of this survives the phone itself wiping this website's data, or the app being
uninstalled and reinstalled from scratch — no code running only in a browser tab can
prevent that. An occasional real export (*Setup → Data → Export*), kept somewhere else,
is the one backup that survives anything.

## Progress, badges and sharing

The *Progress* tab reads the same history the *Now* screen writes; nothing extra is
stored except the moment a badge was earned, so a badge stays yours even after old days
are pruned. Statistics cover the last 30 days. Ranks change every two levels (Newcomer,
Starter, Regular, Steady, Focused, Reliable, Unstoppable, Legend).

Badges: first step, 10 / 50 / 100 / 500 done, early bird (10 early finishes), perfect day,
3 / 7 / 30-day streaks, level 5 and 10, dawn and night owl (5 finishes before 7 am / after
10 pm), all-rounder (5 different moments), comeback (a miss followed by a perfect day),
ambassador (share once).

Sharing uses the system share sheet where there is one (phones), with a 1200×630 PNG card
drawn on the device; elsewhere the text is copied to the clipboard and the card downloaded.
Nothing is sent anywhere by Momen2m itself.

## How points work

| Event | Light | Normal | Critical |
| --- | ---: | ---: | ---: |
| Done in time | +10 | +20 | +30 |
| Done in the first half of the window | +15 | +30 | +45 |
| Missed | −10 | −20 | −30 |
| Skipped | −5 | −10 | −15 |
| Each snooze | −3 | −3 | −3 |

Levels grow with your total points. A day where every moment is done extends your streak;
a single miss or skip resets it.

## For developers

Plain HTML, CSS and JavaScript ES modules. No framework, no build step, no dependencies.
The whole app weighs about 60 KB uncompressed.

```
index.html            app shell
manifest.webmanifest  PWA manifest
sw.js                 service worker: offline cache, versioned, silent updates
version.js            single source of truth for the version shown in the app
css/app.css           styles (dark first, light via prefers-color-scheme)
js/app.js             controller: tick loop, event delegation, install and update flow
js/ui.js              rendering (template strings), bottom sheets, toasts
js/engine.js          occurrences, statuses, misses, scoring, streaks
js/store.js           localStorage persistence, export/import
js/game.js            gamification read side: levels, ranks, stats, badges, tips
js/share.js           progress card (canvas) + share sheet / clipboard fallback
js/diff.js            what an import or restore would add / remove / change
js/autobackup.js      remembered backup folder: direct export, newest-backup scan
js/fsstore.js         persists the folder handle in IndexedDB
js/notify.js          Notification API via the service worker, sound and vibration
js/update.js          service worker registration and update handling
js/i18n.js            English and French strings
js/emoji.js           keyword → emoji suggestions (EN + FR)
js/presets.js         suggested moments
js/time.js            local-time helpers
tools/                zero-dependency scripts (dev server, icons, tests, bump, package)
```

### Run locally

```bash
npm start
```

Then open <http://localhost:8080/>. On localhost the service worker is network-first, so
edits show up on reload. Requires Node 18+ (only for the tooling; the app itself needs no
Node at all).

### Tests

```bash
npm test
```

Simulated-time tests for the engine: start/end/miss transitions, snooze limits, scoring,
undo, streaks, midnight-crossing windows and one-off tasks, plus backup safety (recovery
snapshots, import preview, export stamping), gamification (levels, stats, badges, tips,
combos) and notification options.

### Release a new version

1. Bump the version everywhere (`version.js`, `sw.js`, `package.json`):
   ```bash
   node tools/bump.js 1.1.0
   ```
2. Commit, tag and push. GitHub Pages serves the `main` branch, so pushing **is** deploying.
   Installed apps pick the new service worker up within a day, or immediately via
   *Check for updates*.
3. Build the downloadable zip and attach it to a GitHub release:
   ```bash
   npm run package
   gh release create v1.1.0 dist/Momen2m-1.1.0.zip --title "Momen2m 1.1.0" --notes "..."
   ```

Regenerate the icons with `npm run icons` after editing `tools/gen-icons.js`.

### Self-hosting

Copy the zip from the [latest release](https://github.com/Purgator/Momen2m/releases/latest)
to any static web server. The only requirement is **HTTPS** (service workers and
notifications refuse to run over plain HTTP, except on `localhost`). All paths are relative,
so it works from a sub-folder too.

### Why there is no push server

Scheduled notifications while the app is closed or paused need a Web Push server: the
phone's push service (Google's or Apple's) is the only thing allowed to wake a web app,
and it only relays messages sent by a server at the right moment. Momen2m is deliberately
serverless and keeps all data on the device, so it reminds you while it is on screen and
settles up when you come back.

What background reminders would take, for the record: a tiny relay (a Cloudflare Worker
with a scheduled alarm fits) holding each device's push subscription plus the day's
reminder times and titles, sending a push at each time; `sw.js` would gain a `push`
handler showing the notification. It stays optional — the app must keep working with no
relay configured — and it is the one feature that sends anything off the device.

## License

[MIT](LICENSE)
