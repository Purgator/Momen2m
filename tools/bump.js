// Bumps the app version everywhere it lives. Usage: node tools/bump.js 1.2.3
'use strict';
const fs = require('fs');
const path = require('path');
const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v || '')) {
  console.error('usage: node tools/bump.js X.Y.Z');
  process.exit(1);
}
const root = path.join(__dirname, '..');
const edit = (file, fn) => {
  const p = path.join(root, file);
  fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8')));
};

// Gate: the "what changed" note must exist for this version in both languages,
// and nothing users read may be garbled (see tools/checktext.js) — a release
// with a broken note is what this tool exists to prevent.
const changelog = fs.readFileSync(path.join(root, 'js', 'changelog.js'), 'utf8');
const block = (lang) => { const i = changelog.indexOf(`  ${lang}: {`); return i < 0 ? '' : changelog.slice(i, changelog.indexOf('\n  },', i)); };
const entry = new RegExp(`'${v.replace(/\./g, '\\.')}':\\s*\\[\\s*'`); // a non-empty array of lines
const missing = ['en', 'fr'].filter((l) => !entry.test(block(l)));
if (missing.length) {
  console.error(`js/changelog.js has no ${missing.join(' and ')} entry for ${v} — write it first (one emoji + one short sentence per feature).`);
  process.exit(1);
}
const problems = require('./checktext.js').checkTree(root);
if (problems.length) {
  console.error('garbled text (UTF-8 read as cp1252) — fix it before bumping:\n' + problems.join('\n'));
  process.exit(1);
}

edit('version.js', (s) => s.replace(/MOMEN2M_VERSION = '[^']+'/, "MOMEN2M_VERSION = '" + v + "'"));
edit('package.json', (s) => s.replace(/"version": "[^"]+"/, '"version": "' + v + '"'));
edit('sw.js', (s) => s.replace(/const VERSION = '[^']+'/, "const VERSION = '" + v + "'"));
console.log('version ->', v);
