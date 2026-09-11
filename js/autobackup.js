// One backup folder, chosen once, used both ways: exports are written straight
// into it and "Find my backup" scans it for the newest Momen2m file.
//
// A website cannot search a device's filesystem — no browser exposes that,
// for good reason. What it *can* do, with explicit one-time permission: read
// and write one folder the user picked, and remember it (see fsstore.js).
// Where the File System Access API isn't available (Safari, Firefox, iOS,
// Android), `supported` is false and the caller falls back to a save dialog /
// share sheet for export and a plain file picker for import.
//
// Browsers refuse to hand out the Downloads, Desktop, Documents and home
// folders *themselves* (they may contain system files); any subfolder is fine.
// That refusal is what a user sees as "not enough permissions", hence the
// wording in the hints and in `pickFolder`'s guidance.
import { getSavedDirHandle, saveDirHandle, clearSavedDirHandle } from './fsstore.js';
import { state, save } from './store.js';

export const supported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

// Sharing one id/startIn with the Export save dialog (see app.js) means the
// browser tends to default both dialogs to the same real-world folder.
const PICKER_OPTS = { id: 'momen2m-backups', mode: 'readwrite', startIn: 'downloads' };
const MAX_INSPECTED = 30; // most-recently-modified .json files actually opened to check
const MAX_DEPTH = 1;      // the picked folder plus one level of subfolders

// 'granted' | 'denied' | 'gone' (handle unusable: another profile, API mismatch)
async function permissionFor(handle, mode) {
  if (!handle) return 'gone';
  try {
    if ((await handle.queryPermission({ mode })) === 'granted') return 'granted';
    return (await handle.requestPermission({ mode })) === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'gone';
  }
}

async function remember(dir) {
  await saveDirHandle(dir);
  state.backupFolder = dir.name || '';
  save();
}

// Lets the user (re)choose the folder. Throws AbortError on cancel.
export async function pickFolder() {
  const dir = await window.showDirectoryPicker(PICKER_OPTS);
  await remember(dir);
  return dir;
}

// The remembered folder with the requested permission, or null when there is
// none or the user just declined. Never opens a picker itself.
async function rememberedFolder(mode) {
  const dir = await getSavedDirHandle();
  if (!dir) return null;
  const p = await permissionFor(dir, mode);
  if (p === 'granted') return dir;
  if (p === 'gone') await forgetRememberedFolder();
  return null;
}

// Writes a backup straight into the remembered folder. Returns the folder
// name on success, null when there is no usable folder (caller falls back to
// a save dialog). Must be called from a user gesture (a permission prompt may
// be needed).
export async function writeToBackupFolder(fileName, text) {
  if (!supported) return null;
  const dir = await rememberedFolder('readwrite');
  if (!dir) return null;
  const fh = await dir.getFileHandle(fileName, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
  return dir.name || '';
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
      if (parsed && Array.isArray(parsed.habits)) return { fileName: file.name, text, parsed, modified: file.lastModified };
    } catch { /* not a Momen2m backup, keep looking */ }
  }
  return null;
}

// Returns { fileName, text, parsed, modified } for the newest backup found, or
// null if the folder holds nothing that looks like one. Throws AbortError if
// the user cancels the folder picker — callers should treat that as a silent
// no-op. Any other error means the folder could not be opened.
export async function findLatestBackup({ forceNewFolder = false } = {}) {
  let dir = forceNewFolder ? null : await rememberedFolder('read');
  if (!dir) dir = await pickFolder();
  return newestBackupIn(dir);
}

export async function forgetRememberedFolder() {
  await clearSavedDirHandle();
  state.backupFolder = '';
  save();
}

// Turns a thrown error into one of: 'cancelled' (user closed a dialog),
// 'gesture' (the browser wanted a fresh tap), 'blocked' (folder refused or
// unreadable), 'other'.
export function classifyError(err) {
  const n = (err && err.name) || '';
  if (n === 'AbortError') return 'cancelled';
  if (n === 'SecurityError') return 'gesture';
  if (n === 'NotAllowedError' || n === 'NotFoundError' || n === 'NotReadableError') return 'blocked';
  return 'other';
}
