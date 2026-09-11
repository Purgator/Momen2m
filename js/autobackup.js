// Finds the most recent Momen2m backup without the user browsing for it.
//
// A website cannot search a device's filesystem — no browser exposes that,
// for good reason. What it *can* do, with explicit one-time permission: read
// one folder the user picked, and remember it (see fsstore.js) so every later
// import just re-scans that folder for the newest matching file. That is what
// this module does. Where the underlying File System Access API isn't
// available (Safari, Firefox, iOS, some Android versions), `supported` is
// false and the caller falls back to a plain file picker.
import { getSavedDirHandle, saveDirHandle, clearSavedDirHandle } from './fsstore.js';

export const supported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

// Sharing one id/startIn with the Export save dialog (see app.js) means the
// browser tends to default both dialogs to the same real-world folder.
const PICKER_OPTS = { id: 'momen2m-backups', mode: 'read', startIn: 'downloads' };
const MAX_INSPECTED = 30; // most-recently-modified .json files actually opened to check
const MAX_DEPTH = 1;      // the picked folder plus one level of subfolders

async function ensureReadPermission(handle) {
  if (!handle) return false;
  try {
    if ((await handle.queryPermission({ mode: 'read' })) === 'granted') return true;
    return (await handle.requestPermission({ mode: 'read' })) === 'granted';
  } catch {
    return false; // handle from a different origin/session, or API mismatch
  }
}

async function collectJsonFiles(dirHandle, depth, out) {
  for await (const [name, handle] of dirHandle.entries()) {
    if (name.startsWith('.')) continue;
    if (handle.kind === 'file' && name.toLowerCase().endsWith('.json')) out.push(handle);
    else if (handle.kind === 'directory' && depth > 0) await collectJsonFiles(handle, depth - 1, out).catch(() => {});
  }
}

// Scans a folder (and one level of subfolders) for the newest file that
// actually parses as a Momen2m backup, tolerating a renamed file.
async function newestBackupIn(dirHandle) {
  const files = [];
  await collectJsonFiles(dirHandle, MAX_DEPTH, files);

  const withMeta = (await Promise.all(files.map(async (h) => {
    try { return { handle: h, file: await h.getFile() }; } catch { return null; }
  }))).filter(Boolean).sort((a, b) => b.file.lastModified - a.file.lastModified);

  for (const { file } of withMeta.slice(0, MAX_INSPECTED)) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed && Array.isArray(parsed.habits)) return { fileName: file.name, text, parsed };
    } catch { /* not a Momen2m backup, keep looking */ }
  }
  return null;
}

// Returns { fileName, text, parsed } for the newest backup found, or null if
// the folder holds nothing that looks like one. Throws AbortError if the user
// cancels the folder picker — callers should treat that as a silent no-op.
export async function findLatestBackup({ forceNewFolder = false } = {}) {
  let dir = forceNewFolder ? null : await getSavedDirHandle();
  if (!(await ensureReadPermission(dir))) {
    dir = await window.showDirectoryPicker(PICKER_OPTS);
    await saveDirHandle(dir);
  }
  return newestBackupIn(dir);
}

export async function forgetRememberedFolder() {
  await clearSavedDirHandle();
}
