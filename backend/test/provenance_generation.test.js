const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const files = [
  'RELEASE_FILE_SHA256SUMS.txt',
  'RELEASE_COMPONENT_SHA256SUMS.txt',
  'SALES_PACKAGE_MANIFEST.json'
];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readSums(name) {
  return fs.readFileSync(path.join(root, name), 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => {
    const m = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert.ok(m, `${name}: malformed line`);
    return m;
  });
}

test('backend provenance manifests match every shipped backend file', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'SALES_PACKAGE_MANIFEST.json'), 'utf8'));
  const excluded = new Set(manifest.integrityExclusions);
  assert.equal(manifest.version, JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version);

  const expected = manifest.files.map(x => x.path).sort();
  const actual = [];
  function walk(dir, rel = '') {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? path.posix.join(rel, e.name) : e.name;
      if (e.isDirectory()) {
        if (r === 'node_modules' || r === '.git' || r === 'data' || r === 'data/files') continue;
        walk(path.join(dir, e.name), r);
      } else if (!excluded.has(r)) actual.push(r);
    }
  }
  walk(root);
  assert.deepEqual(actual.sort(), expected);
  for (const entry of manifest.files) {
    const file = path.join(root, entry.path);
    assert.equal(sha256(file), entry.sha256, entry.path);
    assert.equal(fs.statSync(file).size, entry.bytes, entry.path);
  }

  const fileSums = new Map(readSums('RELEASE_FILE_SHA256SUMS.txt').map(m => [m[2], m[1]]));
  const componentSums = new Map(readSums('RELEASE_COMPONENT_SHA256SUMS.txt').map(m => [m[2], m[1]]));
  assert.deepEqual([...fileSums.keys()].sort(), expected);
  assert.deepEqual([...componentSums.keys()].sort(), expected);
  for (const entry of manifest.files) {
    assert.equal(fileSums.get(entry.path), entry.sha256, entry.path);
    assert.equal(componentSums.get(entry.path), entry.sha256, entry.path);
  }
});
