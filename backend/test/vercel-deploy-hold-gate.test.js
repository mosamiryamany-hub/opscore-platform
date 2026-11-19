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
  assert.match(deployHeader, /github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);
  assert.match(deployHeader, /confirm_production_deployment == 'I_AUTHORIZE_PRODUCTION_DEPLOYMENT'/);
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

test('staged production promotion remains fail-closed even after explicit manual dispatch authorization', () => {
  const smoke = step('Verify staged production HTTP, database, security and release proofs');
  assert.match(smoke, /if: steps\.production_runtime\.outputs\.allowed == 'true'/,
    'smoke must stay gated by Runtime attestation');
  const promote = step('Promote only the verified staged deployment');
  assert.match(promote,
    /steps\.production_runtime\.outputs\.allowed == 'true'\s*&&\s*steps\.production_smoke\.outcome == 'success'/,
    'promotion requires both Runtime attestation and successful staged smoke');
  assert.doesNotMatch(promote, /I_AUTHORIZE_PRODUCTION_DEPLOYMENT/,
    'a manual confirmation must never bypass failed Runtime or smoke checks');
  const finalGate = step('Fail unless production promotion and public-domain verification completed');
  assert.match(finalGate, /test "\$RUNTIME_OUTCOME" = "success"/);
  assert.match(finalGate, /test "\$RUNTIME_ALLOWED" = "true"/);
  assert.match(finalGate, /test "\$SMOKE_OUTCOME" = "success"/);
  assert.match(finalGate, /test "\$PROMOTE_OUTCOME" = "success"/);
  assert.match(finalGate, /test "\$DOMAIN_OUTCOME" = "success"/);
  assert.doesNotMatch(finalGate, /github\.event_name.*workflow_dispatch.*then/);
  assert.doesNotMatch(deploy, /production_preflight/);
});

test('a missing 67-route Production matrix is never replaced with synthetic deferred evidence', () => {
  const embed = step('Embed acceptance and behavioral evidence into serverless bundle');
  assert.doesNotMatch(embed, /DEFERRED_POST_PROMOTE|GENERATED_SIGNED_COVERAGE_PLACEHOLDER/);
  assert.match(embed, /SIGNED_TENANT_CONTEXT_PRODUCTION_COVERAGE=NOT_VERIFIED/);
  assert.match(embed, /if \[ -s "\$signed_coverage" \]; then/);
  assert.match(embed, /cp "\$signed_coverage" "backend\/src\/embedded-evidence\/SIGNED_TENANT_CONTEXT_PRODUCTION_COVERAGE\.json"/);
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
  const certification = step('Resolve production isolation certification from exact candidate evidence');
  assert.match(certification, /sourceCommitMatches/);
  assert.match(certification, /CERTIFIED/);
  assert.match(certification, /NOT_CERTIFIED/);
});

test('Production release flags fail closed when isolation evidence is not certified', () => {
  const publish = step('Publish exact certified release evidence and enable signed tenant context');
  assert.match(publish, /ISOLATION_CERT: \$\{\{ steps\.isolation_cert\.outputs\.certified \}\}/);
  assert.match(publish, /BEHAVIORAL: \$\{\{ steps\.isolation_cert\.outputs\.behavioral \}\}/);
  assert.match(publish, /production-candidate-environment\.js publish/);
});

test('Production environment is not mutated before current-commit evidence and isolation certification pass', () => {
  const earlyGate = step('Require current-commit production evidence before creating staged deployment');
  const publish = step('Publish exact certified release evidence and enable signed tenant context');
  const build = step('Build Vercel output');
  assert.doesNotMatch(deploy, /Publish acceptance evidence hash to Vercel production env/);
  assert.ok(deploy.indexOf(earlyGate) < deploy.indexOf(publish));
  assert.match(earlyGate, /PRODUCTION_ACCEPTANCE_EVIDENCE_MISSING_OR_INVALID/);
  assert.match(earlyGate, /PRODUCTION_ISOLATION_NOT_CERTIFIED/);
  assert.match(earlyGate, /PRODUCTION_BEHAVIORAL_EVIDENCE_NOT_VERIFIED/);
  assert.match(publish, /ISOLATION_CERT: \$\{\{ steps\.isolation_cert\.outputs\.certified \}\}/);
  assert.match(publish, /BEHAVIORAL: \$\{\{ steps\.isolation_cert\.outputs\.behavioral \}\}/);
  assert.match(publish, /production-candidate-environment\.js publish/);
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
  const certification = step('Resolve production isolation certification from exact candidate evidence');
  const earlyGate = step('Require current-commit production evidence before creating staged deployment');
  const publish = step('Publish exact certified release evidence and enable signed tenant context');
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
