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

const localesManifest = JSON.parse(fs.readFileSync(
  path.join(root, 'backend', 'web', 'i18n', 'locales', 'manifest.json'),
  'utf8'
));
const languageQualificationRows = fs.readFileSync(
  path.join(root, 'docs', 'contact-center', 'LANGUAGE_QUALIFICATION_MATRIX.csv'),
  'utf8'
).trim().split('\n').slice(1);

test('Production runbook and buyer residual register use the latest observed Neon capacity', () => {
  assert.match(runbook, /2 active branches \(2\/10 included\)/);
  assert.match(runbook, /2 active branches \(2\/10 included\)/);
  assert.match(runbook, /2 root branches/);
  assert.match(runbook, /Both active branches are unprotected/);
  assert.match(runbook, /Primary automatic snapshot schedule is empty/);
  assert.match(runbook, /snapshots limit exceeded/);
  assert.match(buyerResiduals, /2 active branches/);
  assert.match(buyerResiduals, /Both are currently unprotected/i);
  assert.match(buyerResiduals, /non-finalizing Restore Snapshot API/);
  assert.doesNotMatch(runbook, /10 active branches \(10\/10 included\)/);
  assert.doesNotMatch(buyerResiduals, /10\/10 visible branches|all ten are unprotected/i);
});

test('Production key material and 67-route collector remain open while the real restore proof is accurately recorded', () => {
  assert.match(runbook, /`opscore_security` schema and `context_hmac_keys` table are absent on Primary/);
  assert.match(runbook, /zero Production HMAC key rows/);
  assert.match(runbook, /real Production 67-route collector\/evidence writer is \*\*not implemented and not available\*\*/);
  assert.match(runbook, /valid non-finalizing restore proof now exists in the PR #219 branch/);
  assert.match(runbook, /OPSC_PRODUCTION_RESTORE_PROOF_SHA256/);
  assert.doesNotMatch(runbook, /Production key table exists/i);
  assert.doesNotMatch(runbook, /67-route collector is implemented and available/i);
  assert.doesNotMatch(runbook, /valid, hash-pinned \*\*non-finalizing restore proof does not exist\*\*/);
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

test('legacy migration branch job is explicitly classified as destructive DDL-only evidence', () => {
  assert.match(runbook, /legacy `ops-signed-context-migration-branch` run \*\*44064087564\*\*/);
  assert.match(runbook, /deleted the prior child branch `br-solitary-star-bctbf0ms`/);
  assert.match(runbook, /pooled Neon endpoint/);
  assert.match(runbook, /raw `psql` commands, not the guarded `apply-postgres-migrations.js --apply` runner/);
  assert.match(runbook, /migration-ledger query returned/);
  assert.ok(runbook.includes('(0 rows)'));
  assert.match(runbook, /DDL_ONLY \/ NOT_OFFICIAL_MIGRATION_PROOF/);
  assert.match(runbook, /replacement helper in PR #212 explicitly contains no Neon DELETE operation/);
});

test('Runtime locale availability is separated from the 114-row language qualification matrix', () => {
  const localeStatuses = localesManifest.locales.reduce((counts, locale) => {
    counts[locale.status] = (counts[locale.status] || 0) + 1;
    return counts;
  }, {});
  assert.equal(localesManifest.localeCount, 105);
  assert.equal(localesManifest.locales.length, 105);
  assert.deepEqual(localeStatuses, { machine_draft: 100, english_fallback: 4, source: 1 });
  assert.equal(languageQualificationRows.length, 114);
  for (const row of languageQualificationRows) {
    const fields = row.split(',');
    assert.equal(String(fields[4] || '').replaceAll('"', ''), 'planned_not_qualified');
    assert.equal(String(fields[8] || '').replaceAll('"', ''), 'not_run');
  }
  assert.match(runbook, /105 selectable Contact Center locales/);
  assert.match(runbook, /114 source-language rows/);
  assert.match(buyerResiduals, /105 selectable Contact Center locales/);
  assert.match(buyerResiduals, /qualification matrix has 114 source rows/);
  assert.doesNotMatch(buyerResiduals, /114 locales are listed; 109 are machine-assisted/);
});

test('WAF log-only posture and short attack window are not overstated as enforcement certification', () => {
  assert.match(runbook, /firewallEnabled=true/);
  assert.match(runbook, /CRS rules active but `log` only/);
  assert.match(runbook, /Bot Protection is active but `log` only/);
  assert.match(runbook, /IP allow\/deny rules list is empty/);
  assert.match(runbook, /60 requests per source IP per fixed 60-second window/);
  assert.match(runbook, /no anomalies for its default last-24-hour window/);
  assert.match(runbook, /Do not flip the current `log` rules to `deny`/);
  assert.match(buyerResiduals, /Vercel firewall enforcement posture/);
});

test('GitHub Environment reviewer protection is not claimed without a verified settings read', () => {
  assert.match(runbook, /Environment protection rules \/ Required reviewers were not readable/);
  assert.match(runbook, /their presence is \*\*UNVERIFIED\*\*/);
  assert.match(runbook, /Verify Settings → Environments → production before any dispatch/);
  assert.doesNotMatch(runbook, /protected GitHub `production` Environment approval/);
});
