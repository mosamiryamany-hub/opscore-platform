'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('red-team audit verifies bounded idempotency contracts for reviewed multi-line routes', () => {
  const repo = path.resolve(__dirname, '..', '..');
  const script = path.join(repo, 'backend', 'scripts', 'red-team-transaction-audit.js');
  const run = spawnSync(process.execPath, [script], { cwd: repo, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.decision, 'PASS');
  assert.equal(report.checks.unwrappedMutationRoutes, 0);
  assert.equal(report.checks.reviewedMutationRouteContracts, 5);
  assert.equal(report.checks.unverifiedMutationRouteContracts, 0);
  assert.deepEqual(
    report.reviewedMutationContracts.map(contract => contract.id),
    [
      'portal_self_schedule_booking',
      'customer_service_line_assignment',
      'geofence_create',
      'geofence_technician_assignment',
      'geofence_dynamic_event'
    ]
  );
  assert.ok(report.reviewedMutationContracts.every(contract => contract.verified && contract.missing.length === 0));
  assert.equal(report.findings.some(finding => finding.code === 'MUTATION_NOT_IDEMPOTENT_WRAPPED'), false);
});
