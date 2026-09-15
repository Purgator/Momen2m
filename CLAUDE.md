# Working in this repo

## Commits

Commit finished work yourself, without waiting to be asked — this overrides the
general "only commit when the user explicitly asks" default for this repo.
Every commit message starts with a [gitmoji](https://gitmoji.dev) prefix
(✨ feature, 🐛 fix, 💄 UI/style, 📝 docs, 🔖 version bump, 👷 CI/infra, etc.),
matching the existing `git log`. Prefer several small, logical commits over
one giant one when a task naturally breaks into steps.

## Releases

Release flow, in order:
1. Fill in a summary for the new version in `js/changelog.js` (both `en` and
   `fr`) — **do this before or as part of the bump, never skip it.** It is
   what powers the "what changed" popup users see right after the app
   updates itself (see `js/app.js`'s boot-time version check and
   `js/ui.js#openUpdateSheet`); a release with no changelog entry falls back
   to a generic "includes fixes and improvements" line, which is a
   regression in the update UX, not an acceptable default.
2. `node tools/bump.js X.Y.Z` — updates `version.js`, `sw.js`, `package.json`.
3. Commit, tag `vX.Y.Z`, push (GitHub Pages deploys from `main`).
4. `npm run package`, then `gh release create`.

## Product constraints

- Never mention ADHD in the app or docs (explicit user request).
- The service worker is network-first on localhost, cache-first in
  production — a new/renamed file under `js/` needs adding to the `ASSETS`
  list in `sw.js` or it won't be available offline after install.
