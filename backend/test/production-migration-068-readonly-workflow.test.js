'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.join(__dirname, '..', '..', '.github', 'workflows', 'apply-production-migration-068.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

test('Production migration 068 workflow is a read-only verifier, never a migration executor', () => {
  assert.match(workflow, /name: verify-production-migration-068/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /OPSC_OWNER_DATABASE_URL/);
  assert.match(workflow, /OPSC_PRODUCTION_RUNTIME_URL/);
  assert.match(workflow, /NEON_API_KEY/);
  assert.match(workflow, /expectedProjectId = 'summer-leaf-18448271'/);
  assert.match(workflow, /expectedBranchId = 'br-proud-salad-bcshhdap'/);
  assert.match(workflow, /expectedDatabase = 'opscore_acceptance'/);
  assert.match(workflow, /sslmode', 'verify-full'/);
  assert.match(workflow, /rejectUnauthorized: true/);
  assert.match(workflow, /BEGIN READ ONLY/);
  assert.match(workflow, /NEON_BRANCH_IDENTITY_MISMATCH/);
  assert.match(workflow, /label \+ '_DATABASE_ROLE_MISMATCH'/);
  assert.match(workflow, /r\.role !== 'opscore_runtime'/);
  assert.match(workflow, /PRODUCTION_MIGRATION_068_LEDGER_CHECKSUM_MISMATCH/);
  assert.match(workflow, /writesPerformed: 0/);
  assert.doesNotMatch(workflow, /ALTER ROLE|DROP ROLE|CREATE ROLE|INSERT INTO|UPDATE\s+public\.schema_migrations|DELETE FROM|owner\.client\.query\(sql\)/i);
});

test('Production migration verification uses immutable GitHub Action commit references', () => {
  assert.match(workflow, /actions\/checkout@[a-f0-9]{40}/);
  assert.match(workflow, /actions\/setup-node@[a-f0-9]{40}/);
  assert.doesNotMatch(workflow, /actions\/(?:checkout|setup-node)@v\d+/);
});
