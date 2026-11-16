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
  assert.match(deployHeader, /github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);\n  assert.match(deployHeader, /confirm_production_deployment == 'I_AUTHORIZE_PRODUCTION_DEPLOYMENT'/);
  const acceptanceStart = workflow.indexOf('  postgres-acceptance:' + String.fromCharCode(10));
  const acceptanceEnd = workflow.indexOf('  deploy:' + String.fromCharCode(10), acceptanceStart);
  assert.ok(acceptanceStart >= 0 && acceptanceEnd > acceptanceStart);
  const acceptanceHeader = workflow.slice(acceptanceStart, acceptanceEnd);
  assert.match(acceptanceHeader, /if: \(github\.event_name == 'push' \|\| github\.event_name == 'workflow_dispatch'\) && github\.ref == 'refs\/heads\/main'/);
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

test('deploy workflow never rebinds stale production behavioral evidence to a new candidate', () => {
  assert.doesNotMatch(deploy, /Stamp production behavioral evidence with deploy candidate commit/);
  assert.doesNotMatch(deploy, /data\.sourceCommitHint\s*=\s*commit/);
  assert.doesNotMatch(deploy, /probesReexecuted:\s*false/);
  // PR161 consolidates behavioral evidence validation into a single behavioralPass()
  // evaluator (stronger than main's two duplicated sites: it adds pipelineId binding,
  // databaseName, verificationScope and ten named session checks at the same place).
  // The guard therefore requires exactly one call site, and exactly one consumer.
  assert.equal((deploy.match(/noEvidenceRebind\(recovery\)/g) || []).length, 1);
  assert.equal((deploy.match(/noEvidenceRebind\(session\)/g) || []).length, 1);
  assert.equal((deploy.match(/const ok = behavioralPass\(\);/g) || []).length, 1);
  const certification = step('Resolve production isolation certification from behavioral evidence');
  assert.match(certification, /sourceCommitMatches/);
  assert.match(certification, /CERTIFIED/);
  assert.match(certification, /NOT_CERTIFIED/);
});

test('Production release flags fail closed when isolation evidence is not certified', () => {
  assert.match(deploy, /const releaseVerified = process\.env\.ISOLATION_CERT === 'CERTIFIED'/);
  assert.match(deploy, /OPSC_RELEASE_VERIFIED: releaseVerified \? 'true' : 'false'/);
  assert.match(deploy, /OPSC_PRODUCTION_HOLD: releaseVerified \? 'false' : 'true'/);
});

test('Production environment is not mutated before current-commit evidence and isolation certification pass', () => {
  const earlyGate = step('Require current-commit production evidence before creating staged deployment');
  const publish = step('Publish release identity and certification env after evidence validation');
  const build = step('Build Vercel output');
  assert.doesNotMatch(deploy, /Publish acceptance evidence hash to Vercel production env/);
  assert.ok(deploy.indexOf(earlyGate) < deploy.indexOf(publish));
  assert.match(earlyGate, /PRODUCTION_ACCEPTANCE_EVIDENCE_MISSING_OR_INVALID/);
  assert.match(earlyGate, /PRODUCTION_ISOLATION_NOT_CERTIFIED/);
  assert.match(earlyGate, /PRODUCTION_BEHAVIORAL_EVIDENCE_NOT_VERIFIED/);
  assert.match(publish, /OPSC_RELEASE_VERIFIED:\s*releaseVerified\s*\?\s*'true'\s*:\s*'false'/);
  assert.match(publish, /OPSC_PRODUCTION_HOLD:\s*releaseVerified\s*\?\s*'false'\s*:\s*'true'/);
  assert.match(build, /steps\.isolation_cert\.outputs\.certified == 'CERTIFIED'/);
  assert.match(build, /steps\.isolation_cert\.outputs\.behavioral == 'true'/);
  assert.ok(deploy.indexOf(publish) < deploy.indexOf(build));
  assert.ok(deploy.indexOf(earlyGate) < deploy.indexOf(step('Create staged production deployment without changing the live domain')));
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


test('Production promotion requires exact 67-route signed-session evidence before any Vercel environment mutation', () => {
  const certification = step('Resolve production isolation certification from behavioral evidence');
  const earlyGate = step('Require current-commit production evidence before creating staged deployment');
  const publish = step('Publish release identity and certification env after evidence validation');
  const proof = fs.readFileSync(path.join(__dirname, '..', 'src', 'release-proof.js'), 'utf8');
  assert.ok(certification.includes('SIGNED_TENANT_CONTEXT_PRODUCTION_COVERAGE.json'));
  assert.ok(certification.includes('routeRows.length === 67'));
  assert.ok(certification.includes('session.pipelineId'));
  assert.ok(certification.includes('recovery.pipelineId'));
  assert.ok(proof.includes('readProductionSignedTenantRouteCoverageEvidence'));
  assert.ok(proof.includes("productionIsolationCertification === 'CERTIFIED'"));
  assert.ok(!proof.includes("'NOT_CERTIFIED', 'CERTIFIED'"));
  assert.ok(deploy.indexOf(certification) < deploy.indexOf(earlyGate));
  assert.ok(deploy.indexOf(earlyGate) < deploy.indexOf(publish));
});


test('Production deploy requires an explicit one-shot workflow dispatch and owner enable flag', () => {
  const deployHeader = deploy.slice(0, deploy.indexOf('      - uses: actions/checkout'));
  assert.match(deployHeader, /github\.event_name == 'workflow_dispatch'/);
  assert.match(deployHeader, /confirm_production_deployment == 'I_AUTHORIZE_PRODUCTION_DEPLOYMENT'/);
  assert.match(deployHeader, /vars\.OPSC_PRODUCTION_AUTODEPLOY_ENABLED == 'true'/);
  assert.doesNotMatch(deployHeader, /github\.event_name == 'push'/);
  assert.match(workflow, /confirm_production_deployment:/);
});
