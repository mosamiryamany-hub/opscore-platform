const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('release candidate gates are wired and reproducible', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const script of ['production:readiness', 'resilience:gate', 'recovery:gate', 'buyer:self-validation', 'release:candidate']) assert.ok(pkg.scripts[script]);
  for (const rel of [
    'scripts/production-readiness.js',
    'scripts/resilience-gate.js',
    'scripts/resilience-worker.js',
    'scripts/recovery-gate.js',
    'scripts/buyer-self-validation.js',
    '../scripts/release-candidate-gate.js'
  ]) assert.equal(fs.existsSync(path.resolve(root, rel)), true, rel);
});

test('secure release workflow includes production, resilience, recovery and buyer gates', () => {
  const workflow = fs.readFileSync(path.join(root, '..', '.github', 'workflows', 'opscore-secure-release.yml'), 'utf8');
  assert.match(workflow, /npm run production:readiness/);
  assert.match(workflow, /npm run resilience:gate/);
  assert.match(workflow, /npm run buyer:self-validation/);
  assert.match(workflow, /npm run recovery:gate/);
  assert.match(workflow, /node scripts\/release-test-runner\.js/);
});
