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

- **Two sides** — *Setup* to describe your moments, *Now* to live them.
- **Guided setup** in three taps: language, pick suggested moments (water, movement,
  bedtime and a dozen more), allow notifications. Add your own with a name and a time range;
  the emoji is guessed for you, and you can add a note, several times per day, repeat days
  and an importance level.
- **The Now screen** shows one thing: the current moment, big, with a countdown ring.
  New moments arrive from the bottom, finished ones fade away at the top.
- **Done, snooze or skip.** Snooze can be limited or disabled in the settings.
- **Quick tasks** for one-off things ("call the dentist, 15 minutes") from the `+` button.
- **Points, levels and streaks.** Finishing on time pays, finishing early pays more,
  missing costs points, snoozing costs a little. A perfect day extends your streak.
- **Notifications** when a moment starts, shortly before it ends, and when it's missed,
  with optional sound and vibration.
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

- **Reminders work while Momen2m is open or in the background.** Web apps cannot wake a
  phone up on their own, so open Momen2m at the start of your day and leave it running
  (switching to other apps is fine). If you come back after hours away, it catches up:
  missed moments are marked, points are settled, nothing is lost.
- **Everything stays on your phone.** There is no server and no account. Use
  *Setup → Data → Export* to save a backup file, and *Import* to restore it on another device.
- **Updates are automatic.** A new version is fetched in the background and applied the
  next time you leave the app. *Setup → About → Check for updates* forces a check.
- You can restart the guided setup at any time from *Setup → About*.

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
  Import shows what it's about to replace, with a count and the backup's own date, before
  doing anything.
- **A one-step undo sits behind both of them.** Right before Reset or Import changes
  anything, Momen2m silently keeps one copy of what you had. If a tap goes wrong, *Setup →
  Data → Restore* (or a link on the empty *Now* screen) brings it straight back.
- **The browser is asked to protect the storage.** Momen2m calls the Storage API's
  `persist()` on load, which on Android tells Chrome not to clear the site's data when the
  device is low on space. It's best-effort and invisible — there's nothing to configure.

None of this survives the phone itself wiping this website's data, or the app being
uninstalled and reinstalled from scratch — no code running only in a browser tab can
prevent that. An occasional real export (*Setup → Data → Export*), kept somewhere else,
is the one backup that survives anything.

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
undo, streaks, midnight-crossing windows and one-off tasks.

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

Scheduled notifications while the app is fully closed need a Web Push server that holds
subscriptions and sends messages at the right time. Momen2m is deliberately serverless and
keeps all data on the device, so it reminds you while it is open or in the background and
settles up when you come back. A self-hosted push relay would be the natural extension if
you need wake-the-phone reminders.

## License

[MIT](LICENSE)
