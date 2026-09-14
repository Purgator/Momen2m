// Builds dist/Momen2m-<version>.zip with just the files a web server needs.
// No dependencies: relies on the `tar` binary shipped with Windows 10+, macOS and Linux.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const version = require(path.join(root, 'package.json')).version;
const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
const stage = path.join(dist, 'Momen2m');
fs.mkdirSync(stage, { recursive: true });
const files = ['index.html', 'manifest.webmanifest', 'sw.js', 'version.js', 'css', 'js', 'icons', '.nojekyll', 'LICENSE'];
for (const f of files) fs.cpSync(path.join(root, f), path.join(stage, f), { recursive: true });
// Self-hosted copies get an empty relay config (no 404, no relay). Deployment-specific
// values never ship in the zip: see relay.config.example.js.
fs.writeFileSync(path.join(stage, 'relay.config.js'), '// No push relay configured for this copy. See relay.config.example.js.
');
const zipName = 'Momen2m-' + version + '.zip';
// Relative paths on purpose: Windows tar reads "C:..." as a remote host.
execFileSync('tar', ['-a', '-c', '-f', zipName, 'Momen2m'], { cwd: dist, stdio: 'inherit' });
console.log('wrote', path.join(dist, zipName));
