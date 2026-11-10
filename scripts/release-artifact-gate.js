const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const forbiddenRoots = [
  path.join(root, 'backend', 'data', 'files'),
  path.join(root, 'data', 'files')
];
let fail = 0;
function check(label, ok, detail = '') {
  console.log(`${ ok ? 'PASS' : 'FAIL' } ${ label }${ detail ? ` — ${ detail }` : '' }`);
  if (!ok)
    fail++;
}
for (const dir of forbiddenRoots) {
  if (!fs.existsSync(dir)) {
    check(`release runtime artifact tree absent: ${ path.relative(root, dir) }`, true);
    continue;
  }
  const files = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory())
        walk(p);
      else
        files.push(path.relative(root, p));
    }
  }
  walk(dir);
  check(`release runtime artifact tree clean: ${ path.relative(root, dir) }`, files.length === 0, files.length ? files.join(', ') : 'empty');
}
const nestedArchives = [];
function findArchives(d) {
  for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git')
        continue;
      findArchives(p);
    } else if (entry.name.toLowerCase().endsWith('.zip'))
      nestedArchives.push(path.relative(root, p));
  }
}
findArchives(root);
check('source tree contains no nested release archives', nestedArchives.length === 0, nestedArchives.join(', ') || 'none');
check('demo cleanup script targets both runtime storage roots', (() => { const cleanup = fs.readFileSync(path.join(root, 'backend', 'scripts', 'clean-demo-data.js'), 'utf8'); return cleanup.includes("path.join(backendRoot, 'data', 'files')") && cleanup.includes("path.resolve(backendRoot, '..', 'data', 'files')"); })());
process.exitCode = fail ? 1 : 0;
