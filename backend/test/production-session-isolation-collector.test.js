'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const collector = fs.readFileSync(path.join(root, 'scripts', 'collect-production-session-isolation.js'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '..', '.github', 'workflows', 'vercel-deploy.yml'), 'utf8');

test('production session evidence requires independently verified Neon project, branch, database and role identity before writes', () => {
  assert.match(collector, /verifyProductionDatabaseTarget\(ownerUri\)/);
  assert.match(collector, /PRODUCTION_NEON_BRANCH_IDENTITY_MISMATCH/);
  assert.match(collector, /PRODUCTION_DATABASE_NAME_MISMATCH/);
  assert.match(collector, /PRODUCTION_DATABASE_OWNER_ROLE_MISMATCH/);
  assert.match(collector, /endpoint\.type/);
  assert.match(collector, /read_write/);
  assert.match(collector, /opscore_acceptance/);
});

test('production session write evidence is based on real HTTP probes and database row-count postconditions', () => {
  assert.match(collector, /POST', '\/api\/v1\/assets'/);
  assert.match(collector, /POST', '\/api\/v1\/assets\/';/);
  assert.match(collector, /POST', '\/api\/v1\/assets\/';/);
  assert.match(collector, /crossWrite\.status/);
  assert.match(collector, /assetAEventAfterCross === assetAEventAfterOwn/);
  assert.match(collector, /checks\.ownAssetCreate = assetA\.status === 201/);
  assert.match(collector, /checks\.ownAssetEventWrite = ownEvent\.status === 201/);
  assert.match(collector, /checks\.crossTenantAssetReadDenied = isIsolationDenial\(crossIntelligence\.status\)/);
  assert.doesNotMatch(collector, /checks\.ownAssetCreate\s*=\s*['"]PASS['"]/);
  assert.doesNotMatch(collector, /checks\.crossTenantWriteDenied\s*=\s*['"]PASS['"]/);
  assert.match(collector, /opscore\.production-session-isolation\.v2/);
});

test('production cleanup disables principals and verifies that sessions, memberships, assets and events are gone', () => {
  assert.match(collector, /UPDATE users SET status='disabled'/);
  assert.match(collector, /Archived Production Isolation Probe/);
  assert.match(collector, /sessionsRemaining/);
  assert.match(collector, /membershipsRemaining/);
  assert.match(collector, /assetsRemaining/);
  assert.match(collector, /assetEventsRemaining/);
  assert.match(collector, /cleanupComplete/);
});

test('release certification refuses stale v1 or incomplete session-isolation evidence', () => {
  assert.match(workflow, /opscore\.production-session-isolation\.v2/);
  assert.match(workflow, /tenantPrincipalBinding/);
  assert.match(workflow, /ownAssetEventWrite/);
  assert.match(workflow, /crossTenantAssetReadDenied/);
  assert.match(workflow, /crossTenantWriteDenied/);
  assert.match(workflow, /cleanupComplete/);
  assert.match(workflow, /session\.databaseName === 'opscore_acceptance'/);
});
