'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const scanRoots = ['src', 'web', 'scripts'];
const rootFiles = ['backend/'];
const forbidden = [/\bFTTH\b/i, /\bGPON\b/i, /\bXGS[- ]?PON\b/i, /\bOLT\b/i, /\bONT\b/i, /\bOTDR\b/i, /\bdBm\b/i, /\bODF\b/i, /\bFDT\b/i, /\bPON\b/i, /\bsplitter\b/i];
// Static verification scripts contain forbidden terms as detection patterns; they are not runtime/product code.
// Exclude only these exact relative paths, not every file sharing a basename.
const allowedScanPaths = new Set([
  'scripts/domain-neutrality-gate.js',
  'scripts/sector-neutrality-gate.js',
  'scripts/audit-languages-forensic.js'
]);
const hits = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full);
    else if (/\.(js|json|html|css)$/i.test(name) && !allowedScanPaths.has(path.relative(root, full).split(path.sep).join('/'))) {
      const text = fs.readFileSync(full, 'utf8');
      const lines = text.split(/\r?\n/);
      lines.forEach((line, i) => {
        for (const re of forbidden) if (re.test(line)) hits.push(`${path.relative(root, full)}:${i + 1}:${line.trim()}`);
      });
    }
  }
}
for (const rel of scanRoots) walk(path.join(root, rel));
for (const name of fs.readdirSync(root, { withFileTypes: true })) {
  if (name.isFile() && /\.html$/i.test(name.name)) {
    const full = path.join(root, name.name);
    const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const re of forbidden) if (re.test(line)) hits.push(`${path.relative(root, full)}:${i + 1}:${line.trim()}`);
    });
  }
}
if (hits.length) {
  console.error('DOMAIN_NEUTRALITY_FAIL');
  console.error(hits.join('\n'));
  process.exit(1);
}
console.log('DOMAIN_NEUTRALITY_PASS');
