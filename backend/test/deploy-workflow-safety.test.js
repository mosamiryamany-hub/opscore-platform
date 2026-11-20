'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const deploy = fs.readFileSync(path.join(root, '.github/workflows/vercel-deploy.yml'), 'utf8');
const postgres = fs.readFileSync(path.join(root, '.github/workflows/digital-twin-postgres-live.yml'), 'utf8');

test('production promotion requires an exact owner dispatch and staged OIDC readiness gates', () => {
  assert.doesNotMatch(deploy, /if: false && github\.event_name == 'workflow_dispatch'/);
  assert.match(deploy, /if: >-\s*github\.event_name == 'workflow_dispatch'\s*&&\s*github\.ref == 'refs\/heads\/main'/);
  assert.match(deploy, /vars\.OPSC_STAGED_PRODUCTION_PROBE_READY == 'true'/);
  assert.match(deploy, /I_AUTHORIZE_PRODUCTION_DEPLOYMENT/);
  assert.match(deploy, /vars\.OPSC_PRODUCTION_AUTODEPLOY_ENABLED == 'true'/);
  assert.match(deploy, /environment:\s*\n\s+name: production/);
});

test('production deploy pins the declared backend Node engine before installing and running tooling', () => {
  const setup = deploy.indexOf('Set up Node.js 22.23.4 for deployment and acceptance tooling');
  const install = deploy.indexOf('Install Vercel CLI');
  const generator = deploy.indexOf('Generate scoped production acceptance v2 evidence');
  assert.ok(setup >= 0 && install > setup && generator > setup);
  assert.match(deploy.slice(setup, install), /node-version: '22\.23\.4'/);
});

test('production acceptance consumes caller-bound CI evidence and certifies isolation only from behavioral evidence files', () => {
  assert.match(deploy, /tenant_matrix_evidence_b64/);
  assert.match(deploy, /restore_drill_evidence_b64/);
  assert.match(deploy, /OPSC_TENANT_MATRIX_EVIDENCE_PATH/);
  assert.match(deploy, /OPSC_RESTORE_DRILL_EVIDENCE_PATH/);
  // Isolation may be CERTIFIED only after PRODUCTION_SESSION_ISOLATION + PRODUCTION_RECOVERY_POINT validate.
  assert.match(deploy, /PRODUCTION_SESSION_ISOLATION\.json/);
  assert.match(deploy, /PRODUCTION_RECOVERY_POINT\.json/);
  assert.match(deploy, /sourceCommitHint/);
  assert.match(deploy, /process\.env\.GITHUB_SHA/);
  assert.match(deploy, /steps\.isolation_cert\.outputs\.certified/);
  assert.match(deploy, /behavioralPass\(\)/);
  // Must not hard-code CERTIFIED without reading evidence files.
  assert.doesNotMatch(deploy, /OPSC_PRODUCTION_ISOLATION_CERTIFICATION: 'CERTIFIED'/);
  // Live recovery-point collection may use NEON_API_KEY only inside the dedicated collector step.
  assert.match(deploy, /collect-production-recovery-point\.js/);
  assert.match(deploy, /collect-production-session-isolation\.js/);
  assert.match(deploy, /NEON_API_KEY: \$\{\{ secrets\.NEON_API_KEY \}\}/);
  assert.match(postgres, /TENANT_MATRIX_EVIDENCE_INCOMPLETE_OR_NOT_CLEAN/);
  assert.match(postgres, /LOGICAL_RESTORE_EVIDENCE_INCOMPLETE_OR_SCOPE_MISMATCH/);
  assert.match(postgres, /DISPOSABLE_POSTGRESQL_18_LOGICAL_RESTORE_CI/);
});

test('signed tenant 67-route evidence is executed and uploaded from disposable PostgreSQL 18 CI only', () => {
  const runGate = postgres.indexOf('Verify signed tenant context through the real Node PostgreSQL worker');
  const validate = postgres.indexOf('Validate exact disposable PostgreSQL 18 signed-tenant 67-route evidence');
  const upload = postgres.indexOf('Upload disposable PostgreSQL 18 signed-tenant route evidence');
  const nextGate = postgres.indexOf('Verify logical restore drill safety contracts', upload);
  assert.ok(runGate >= 0 && validate > runGate && upload > validate && nextGate > upload);
  const segment = postgres.slice(runGate, upload);
  assert.match(segment, /OPSC_SIGNED_TENANT_CONTEXT_CI_ROUTE_COVERAGE: 'true'/);
  assert.match(segment, /SIGNED_TENANT_CONTEXT_CI_ROUTE_COVERAGE\.json/);
  assert.ok(segment.includes('GITHUB_SHA: $' + '{{ github.sha }}'));
  assert.ok(segment.includes('GITHUB_RUN_ID: $' + '{{ github.run_id }}'));
  assert.doesNotMatch(segment, /VERCEL_TOKEN|NEON_API_KEY|OPSC_PRODUCTION_NEON_BRANCH_ID/);
  const validationBlock = postgres.slice(validate, upload);
  assert.match(validationBlock, /DISPOSABLE_POSTGRESQL_18_CI_ROUTE_PROBES/);
  assert.match(validationBlock, /productionCertification !== false/);
  assert.match(validationBlock, /productionPromotionPerformed !== false/);
  assert.match(validationBlock, /coveredRouteCount !== 67/);
  assert.match(validationBlock, /failedRouteCount !== 0/);
  assert.match(postgres.slice(upload, nextGate), /actions\/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9/);
  assert.match(postgres.slice(upload, nextGate), /if-no-files-found: error/);
});

test('production deploy rejects legacy count-only recovery evidence and requires full-data v4 plus exact cleanup', () => {
  assert.match(deploy, /opscore\.production-recovery-point\.v4/);
  assert.doesNotMatch(deploy, /opscore\.production-recovery-point\.v3/);
  assert.match(deploy, /branch-clone-public-full-table-content-hash-and-core-tenant-row-counts/);
  assert.match(deploy, /contentIntegrity\?\.algorithm === 'SHA-256'/);
  assert.match(deploy, /contentIntegrity\?\.rowsCompared/);
  assert.match(deploy, /referenceBranchDeleted === true/);
  assert.match(deploy, /recoveryBranchDeleted === true/);
  assert.match(deploy, /rlsPolicyTableCount/);
  assert.match(deploy, /spatial_ref_sys/);
});

test('release embed consumes only collector-produced PITR v2 and cannot downgrade to historical catalog-only artifact', () => {
  assert.match(deploy, /Verify collector-produced full-data PITR evidence before embed/);
  assert.match(deploy, /opscore\.production-native-pitr\.v2/);
  assert.match(deploy, /FULL_DATA_PITR_EVIDENCE_MISSING/);
  assert.match(deploy, /FULL_DATA_PITR_EVIDENCE_NOT_EXACT_OR_NOT_VERIFIED/);
  assert.doesNotMatch(deploy, /Download production-native PITR evidence from acceptance job/);
  assert.doesNotMatch(deploy, /PITR_EVIDENCE_REBOUND/);
  assert.match(deploy, /MISSING_EVIDENCE:\$src/);
});
