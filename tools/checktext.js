// Guards the texts users read. Every source file must be valid UTF-8 without a
// BOM, and no line may carry mojibake: UTF-8 that was read as cp1252 and
// re-encoded (an accent shown as two odd letters, an emoji as four), which is
// what text picks up through a Windows shell (heredocs, `-m` arguments). It has
// reached users twice through js/changelog.js, so the tests and tools/bump.js
// both refuse it. Usage: node tools/checktext.js [root]
'use strict';
const fs = require('fs');
const path = require('path');

// A UTF-8 continuation byte (0x80–0xBF) once decoded as cp1252.
const CONT = '[\\u0080-\\u00bf\\u20ac\\u201a\\u0192\\u201e\\u2026\\u2020\\u2021\\u02c6\\u2030\\u0160\\u2039\\u0152\\u017d\\u2018\\u2019\\u201c\\u201d\\u2022\\u2013\\u2014\\u02dc\\u2122\\u0161\\u203a\\u0153\\u017e\\u0178]';
// A lead byte (2, 3 or 4-byte sequence) decoded as cp1252, followed by exactly
// as many continuation characters as the sequence had: an accent becomes a
// capital A-tilde plus one odd character, a curly quote an a-circumflex plus
// two, an emoji an eth plus three. Or the replacement character a bad decode
// leaves behind.
const MOJIBAKE = new RegExp(`[\\u00c2-\\u00df]${CONT}|[\\u00e0-\\u00ef]${CONT}{2}|[\\u00f0-\\u00f4]${CONT}{3}|\\ufffd`);

const mojibake = (s) => MOJIBAKE.test(s);

// Problems in one file, as "file:line: excerpt" strings (empty when clean).
function checkFile(file, label = file) {
  const raw = fs.readFileSync(file);
  const out = [];
  if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) out.push(`${label}: UTF-8 BOM`);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch { return [...out, `${label}: not valid UTF-8`]; }
  text.split('\n').forEach((line, i) => { if (mojibake(line)) out.push(`${label}:${i + 1}: ${line.trim().slice(0, 100)}`); });
  return out;
}

const EXT = new Set(['.js', '.html', '.css', '.md', '.json', '.webmanifest', '.txt', '.yml']);
const SKIP = new Set(['.git', '.claude', 'node_modules', 'dist']);

// Every text file of the project, recursively.
function checkTree(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (EXT.has(path.extname(e.name))) out.push(...checkFile(p, path.relative(root, p)));
    }
  };
  walk(root);
  return out;
}

module.exports = { mojibake, checkFile, checkTree };

if (require.main === module) {
  const problems = checkTree(path.resolve(process.argv[2] || path.join(__dirname, '..')));
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  console.log('texts ok');
}
