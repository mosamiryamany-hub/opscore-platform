'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const collector = fs.readFileSync(path.join(root, 'scripts', 'collect-production-session-isolation.js'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '..', '.github', 'workflows', 'vercel-deploy.yml'), 'utf8');
const releaseProof = fs.readFileSync(path.join(root, 'src', 'release-proof.js'), 'utf8');
const evidenceWorkflow = fs.readFileSync(path.join(root, '..', '.github', 'workflows', 'collect-production-isolation-evidence.yml'), 'utf8');

test('production session evidence requires independently verified Neon project, branch, database and role identity before writes', () => {
  assert.match(collector, /verifyProductionDatabaseTarget\(ownerUri\)/);
  assert.match(collector, /PRODUCTION_NEON_BRANCH_IDENTITY_MISMATCH/);
  assert.match(collector, /PRODUCTION_DATABASE_NAME_MISMATCH/);
  assert.match(collector, /PRODUCTION_DATABASE_OWNER_ROLE_MISMATCH/);
  assert.match(collector, /endpoint\.type/);
  assert.match(collector, /pooled: 'false'/);
  assert.match(collector, /PRODUCTION_OWNER_DIRECT_CONNECTION_REQUIRED/);
  assert.match(collector, /read_write/);
  assert.match(workflow, /OPSC_PRODUCTION_DATABASE_NAME: opscore_acceptance/);
  assert.match(evidenceWorkflow, /OPSC_PRODUCTION_DATABASE_NAME: \$\{\{ inputs\.production_database_name \}\}/);
  assert.match(evidenceWorkflow, /needs\.recovery-point\.result == 'success'/);
});

test('production session write evidence is based on real HTTP probes and database row-count postconditions', () => {
  assert.ok(collector.includes("'POST', '/api/v1/assets'"));
  assert.ok(collector.includes("'POST', '/api/v1/assets/' + encodeURIComponent(assetAId) + '/events'"));
  assert.match(collector, /crossWrite\.status/);
  assert.match(collector, /assetAEventAfterCross === assetAEventAfterOwn/);
  assert.match(collector, /checks\.ownAssetCreate = assetA\.status === 201/);
  assert.match(collector, /checks\.ownAssetEventWrite = ownEvent\.status === 201/);
  assert.match(collector, /checks\.crossTenantAssetReadDenied = isIsolationDenial\(crossIntelligence\.status\)/);
  assert.doesNotMatch(collector, /checks\.ownAssetCreate\s*=\s*['"]PASS['"]/);
  assert.doesNotMatch(collector, /checks\.crossTenantWriteDenied\s*=\s*['"]PASS['"]/);
  assert.match(collector, /opscore.production-session-isolation.v3/);
});

test('production cleanup disables principals and verifies that sessions, memberships, assets and events are gone', () => {
  assert.match(collector, /UPDATE users SET status/);
  assert.match(collector, /Archived Production Isolation Probe/);
  assert.match(collector, /sessionsRemaining/);
  assert.match(collector, /membershipsRemaining/);
  assert.match(collector, /assetsRemaining/);
  assert.match(collector, /assetEventsRemaining/);
  assert.match(collector, /cleanupComplete/);
});

test('release certification refuses stale v1 or incomplete session-isolation evidence', () => {
  assert.match(releaseProof, /evidence.schemaVersion === 'opscore.production-session-isolation.v3'/);
  assert.match(releaseProof, /evidence.databaseName === expectedDatabaseName/);
  assert.match(releaseProof, /deploymentIdBound/);
  for (const key of ['tenantPrincipalBinding','ownAssetEventWrite','crossTenantAssetReadDenied','crossTenantWriteDenied','cleanupComplete']) {
    assert.match(collector, new RegExp(key));
  }
});


test('production session collector obtains the owner connection for the exact configured Neon branch and database', () => {
  assert.ok(collector.includes("'/connection_uri?' + connectionQuery.toString()"));
  assert.match(collector, /branch_id: branchId/);
  assert.match(collector, /database_name: databaseName/);
  assert.match(collector, /role_name: roleName/);
  assert.doesNotMatch(collector, /OPSC_OWNER_DATABASE_URL/);
  assert.doesNotMatch(collector, /process\.env\.DATABASE_URL/);
});

test('production session collector parses as a Node.js program', () => {
  const file = path.join(root, 'scripts', 'collect-production-session-isolation.js');
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});


test('candidate session probes require the exact Production candidate origin, OIDC identity, and signed-context probe token', () => {
  assert.match(collector, /candidateProbeOrigin\(httpBase, process\.env\)/);
  assert.match(collector, /OPSC_PRODUCTION_CANDIDATE_MODE/);
  assert.match(collector, /OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN/);
  assert.match(collector, /VERCEL_TRUSTED_OIDC_TOKEN/);
  assert.match(collector, /x-opscore-signed-context-probe/);
  assert.match(collector, /x-vercel-trusted-oidc-idp-token/);
  assert.match(collector, /redirect:\s*'manual'/);
  assert.match(collector, /readProductionDeploymentIdentity\(/);
});

test('candidate session read and cross-tenant denial use the approved signed assets collection route', () => {
  assert.match(collector, /httpJson\(httpBase, 'GET', '\/api\/v1\/assets', \{ token: tokenA \}\)/);
  assert.match(collector, /httpJson\(httpBase, 'GET', '\/api\/v1\/assets', \{ token: tokenB \}\)/);
  assert.match(collector, /checks\.ownAssetRead = listA\.status === 200/);
  assert.match(collector, /checks\.crossTenantAssetReadDenied = listA\.status === 200/);
  assert.doesNotMatch(collector, /\/api\/v1\/assets\/\{id\}\/intelligence/);
});


test('candidate session principal binding is derived only from the approved signed asset list routes', () => {
  assert.match(collector, /checks\.tenantPrincipalBinding = checks\.tenantListIsolation === 'PASS'/);
  assert.match(collector, /listA\.data\.some\(row => row\.organization_id === orgA\)/);
  assert.match(collector, /listB\.data\.some\(row => row\.organization_id === orgB\)/);
  assert.doesNotMatch(collector, /\/api\/v1\/me/);
  assert.doesNotMatch(collector, /\/api\/v1\/assets\/\+ encodeURIComponent\(assetAId\) \+ '\/intelligence'/);
});
