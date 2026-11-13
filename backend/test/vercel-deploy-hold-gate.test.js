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

function step(name) {
  const anchor = `      - name: ${name}\n`;
  const index = deploy.indexOf(anchor);
  assert.ok(index >= 0, `missing deploy step: ${name}`);
  const next = deploy.indexOf('\n      - name: ', index + anchor.length);
  return deploy.slice(index, next < 0 ? deploy.length : next);
}

test('pull requests run the verification job without invoking the production deploy job', () => {
  assert.match(workflow, /pull_request:\n\s+branches: \[main\]/);
  const verifyHeader = workflow.slice(workflow.indexOf('  verify:'), workflow.indexOf('  deploy:'));
  assert.match(verifyHeader, /github\.event_name == 'pull_request' \|\| github\.ref == 'refs\/heads\/main'/);
  const deployHeader = deploy.slice(0, deploy.indexOf('      - uses: actions/checkout'));
  assert.match(deployHeader, /needs: \[verify, postgres-acceptance\]/);
  assert.match(deployHeader, /github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  const acceptanceStart = workflow.indexOf('  postgres-acceptance:\\n');
  const acceptanceEnd = workflow.indexOf('  deploy:\\n', acceptanceStart);
  assert.ok(acceptanceStart >= 0 && acceptanceEnd > acceptanceStart);
  const acceptanceHeader = workflow.slice(acceptanceStart, acceptanceEnd);
  assert.match(acceptanceHeader, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(acceptanceHeader, /uses: \.\/\.github\/workflows\/digital-twin-postgres-live\.yml/);
});

test('deploy workflow does not attempt to expose Vercel Sensitive environment values to CI', () => {
  assert.doesNotMatch(deploy, /vercel env run/);
  assert.match(deploy, /vercel pull --yes --environment=production/);
  assert.doesNotMatch(deploy, /Resolve production database identity \(read-only\)/);
});

test('staged deployment is immutable to the live domain until Runtime identity and release proof pass', () => {
  const packageStep = step('Compute package fingerprint for this commit');
  const identityStep = step('Embed current GitHub Actions release identity');
  const buildStep = step('Build Vercel output');
  const bindStep = step('Verify Vercel output contains the current release identity');
  const evidenceStep = step('Verify deploy-workspace acceptance evidence matches release identity');
  const stageStep = step('Create staged production deployment without changing the live domain');
  const runtimeStep = step('Verify staged production runtime identity and all release gates');

  assert.match(packageStep, /git archive --format=zip/);
  assert.match(identityStep, /write-vercel-release-identity\.js/);
  assert.match(buildStep, /vercel build --prod/);
  assert.match(bindStep, /VERCEL_RELEASE_IDENTITY_VERIFY=PASS/);
  assert.match(evidenceStep, /DEPLOY_WORKSPACE_ACCEPTANCE_BIND=PASS/);
  assert.match(stageStep, /vercel deploy --prebuilt --prod --skip-domain/);
  assert.match(runtimeStep, /id: production_runtime/);
  assert.match(runtimeStep, /production-runtime-diagnostic\.js/);
  assert.ok(deploy.indexOf(packageStep) < deploy.indexOf(stageStep));
  assert.ok(deploy.indexOf(evidenceStep) < deploy.indexOf(stageStep));
  assert.ok(deploy.indexOf(stageStep) < deploy.indexOf(runtimeStep));
});

test('staged smoke, promotion and live-domain verification require every Runtime gate to pass', () => {
  const protectedSteps = [
    'Verify staged production HTTP, database, security and release proofs',
    'Promote only the verified staged deployment',
    'Verify production domain resolves to the exact promoted commit'
  ];
  for (const name of protectedSteps) {
    const value = step(name);
    assert.match(value, /if: steps\.production_runtime\.outputs\.allowed == 'true'/, `step is not gated by Runtime attestation: ${name}`);
  }
  assert.doesNotMatch(deploy, /production_preflight/);
});

test('Runtime diagnostic requires explicit read-only zero-write and full production evidence', () => {
  const runnerPath = path.join(__dirname, '..', '..', 'scripts', 'production-runtime-diagnostic.js');
  const runner = fs.readFileSync(runnerPath, 'utf8');
  assert.match(runner, /database\.transactionMode === 'READ_ONLY'/);
  assert.match(runner, /database\.writeOperations === 0/);
  assert.match(runner, /database\.productionCertification === false/);
  assert.match(runner, /productionHoldConfiguredFalse/);
  assert.match(runner, /isolationCertification/);
  assert.match(runner, /migration_056_hash/);
});
