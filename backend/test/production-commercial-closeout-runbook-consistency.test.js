'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const runbook = fs.readFileSync(
  path.join(root, 'docs', 'ops', 'MAINTENANCE_WINDOW_2026-11-18.md'),
  'utf8'
);
const buyerResiduals = fs.readFileSync(
  path.join(root, 'docs', 'BUYER_RESIDUALS.md'),
  'utf8'
);
const migrationWorkflow = fs.readFileSync(
  path.join(root, '.github', 'workflows', 'ops-apply-production-signed-context-migrations.yml'),
  'utf8'
);
const rotationWorkflow = fs.readFileSync(
  path.join(root, '.github', 'workflows', 'rotate-production-tenant-hmac.yml'),
  'utf8'
);

test('Production runbook and buyer residual register use the latest observed Neon capacity', () => {
  assert.match(runbook, /10 active branches \(10\/10 included\)/);
  assert.match(runbook, /3 root branches/);
  assert.match(runbook, /All ten are unprotected/);
  assert.match(runbook, /current automatic snapshot schedule is empty/);
  assert.match(runbook, /restore attempt failed with `root branches limit exceeded`/);
  assert.match(buyerResiduals, /10\/10 visible branches/);
  assert.match(buyerResiduals, /all ten are unprotected/);
  assert.doesNotMatch(runbook, /eight active branches|Total branch count \(8\)/i);
  assert.doesNotMatch(buyerResiduals, /8 visible branches|eight visible branches/i);
});

test('Production key material, restore proof, and 67-route collector are not falsely described as completed', () => {
  assert.match(runbook, /`opscore_security` schema and `context_hmac_keys` table are absent on Primary/);
  assert.match(runbook, /zero Production HMAC key rows/);
  assert.match(runbook, /real Production 67-route collector\/evidence writer is \*\*not implemented and not available\*\*/);
  assert.match(runbook, /restore proof does not exist/);
  assert.doesNotMatch(runbook, /Production key table exists/i);
  assert.doesNotMatch(runbook, /67-route collector is implemented and available/i);
  assert.doesNotMatch(runbook, /valid, hash-pinned \*\*non-finalizing restore proof\*\* exists/i);
});

test('Production migration and rotation remain manual, confirmation-gated, and traffic-neutral', () => {
  assert.match(migrationWorkflow, /workflow_dispatch:/);
  assert.match(migrationWorkflow, /APPLY_PRODUCTION_SIGNED_CONTEXT_MIGRATIONS/);
  assert.match(migrationWorkflow, /environment:\s*\n\s+name: production/);
  assert.match(migrationWorkflow, /No Vercel deployment was started/);
  assert.match(migrationWorkflow, /No HMAC key was rotated/);
  assert.match(rotationWorkflow, /workflow_dispatch:/);
  assert.match(rotationWorkflow, /ROTATE_PRODUCTION_TENANT_HMAC/);
  assert.match(rotationWorkflow, /Old HMAC keys remain enabled for overlap and rollback/);
  assert.match(rotationWorkflow, /No Production deployment was started/);
  assert.match(rotationWorkflow, /signed_route_enable_flags_unchanged=true/);
});
