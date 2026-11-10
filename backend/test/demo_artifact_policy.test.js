const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const backendRoot = path.join(root, 'backend');
const attachmentDir = path.join(backendRoot, 'data', 'files');
const cleanup = path.join(backendRoot, 'scripts', 'clean-demo-data.js');
const gate = path.join(root, 'scripts', 'release-artifact-gate.js');

function resetAttachments() {
  fs.rmSync(attachmentDir, { recursive: true, force: true });
}

test('guarded demo cleanup removes actual backend runtime attachment artifacts', () => {
  resetAttachments();
  const orgDir = path.join(attachmentDir, 'org-test');
  fs.mkdirSync(orgDir, { recursive: true });
  fs.writeFileSync(path.join(orgDir, 'closeout.png'), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const out = cp.execFileSync(process.execPath, [cleanup, '--confirm'], {
    cwd: root,
    env: { ...process.env, OPSC_DEMO_CLEANUP: 'CONFIRM', NODE_ENV: 'test' },
    encoding: 'utf8'
  });
  assert.match(out, /PASS backend demo attachment data removed/);
  assert.equal(fs.existsSync(attachmentDir), false);
});

test('release artifact gate fails closed when backend runtime artifacts exist', () => {
  resetAttachments();
  fs.mkdirSync(attachmentDir, { recursive: true });
  fs.writeFileSync(path.join(attachmentDir, 'unexpected.bin'), Buffer.from([1, 2, 3]));
  const result = cp.spawnSync(process.execPath, [gate], { cwd: root, encoding: 'utf8' });
  try {
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /FAIL release runtime artifact tree clean: backend\/data\/files/);
  } finally {
    resetAttachments();
  }
});

test('demo cleanup honors the explicit --confirm CLI flag outside production', () => {
  const cp = require('node:child_process');
  const result = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'clean-demo-data.js'), '--confirm'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'test' },
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
