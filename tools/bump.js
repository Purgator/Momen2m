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
edit('version.js', (s) => s.replace(/MOMEN2M_VERSION = '[^']+'/, "MOMEN2M_VERSION = '" + v + "'"));
edit('package.json', (s) => s.replace(/"version": "[^"]+"/, '"version": "' + v + '"'));
edit('sw.js', (s) => s.replace(/const VERSION = '[^']+'/, "const VERSION = '" + v + "'"));
console.log('version ->', v);
