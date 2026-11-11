'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.join(__dirname, '..', '..', '.github', 'workflows', 'vercel-deploy.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');
const deployStart = workflow.indexOf('\n  deploy:\n');
assert.notEqual(deployStart, -1, 'vercel-deploy workflow must define deploy job');
const deploy = workflow.slice(deployStart);

test('production preflight exposes a fail-closed output without failing Main while held', () => {
  const start = deploy.indexOf('      - name: Validate production environment without printing secrets\n');
  const end = deploy.indexOf('      - name: Compute package fingerprint for this commit\n');
  assert.ok(start >= 0 && end > start, 'preflight must precede package build');
  const block = deploy.slice(start, end);
  assert.match(block, /id: production_preflight/);
  assert.match(block, /vercel env run -e production/);
  assert.match(block, /echo "allowed=true" >> "\$GITHUB_OUTPUT"/);
  assert.match(block, /echo "allowed=false" >> "\$GITHUB_OUTPUT"/);
  assert.match(block, /Production preflight: BLOCKED/);
  assert.match(block, /exit 0/);
});

test('every build, staged deployment, smoke and promotion step is conditional on a passing preflight', () => {
  const protectedSteps = [
    'Compute package fingerprint for this commit',
    'Embed current GitHub Actions release identity',
    'Build Vercel output',
    'Verify Vercel output contains the current release identity',
    'Verify deploy-workspace acceptance evidence matches release identity',
    'Create staged production deployment without changing the live domain',
    'Verify staged production HTTP, database, security and release proofs',
    'Promote only the verified staged deployment',
    'Verify production domain resolves to the exact promoted commit'
  ];
  for (const name of protectedSteps) {
    const anchor = `      - name: ${name}\n`;
    const index = deploy.indexOf(anchor);
    assert.ok(index >= 0, `missing deploy step: ${name}`);
    const stepHeader = deploy.slice(index, index + anchor.length + 120);
    assert.match(stepHeader, /if: steps\.production_preflight\.outputs\.allowed == 'true'/, `step is not gated: ${name}`);
  }
});

test('production deploy job itself remains main-only and depends on verification', () => {
  const header = deploy.slice(0, deploy.indexOf('      - uses: actions/checkout'));
  assert.match(header, /needs: \[verify\]/);
  assert.match(header, /if: github\.ref == 'refs\/heads\/main'/);
});
