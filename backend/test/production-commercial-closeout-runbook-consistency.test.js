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
const sellerCloseoutChecklist = fs.readFileSync(
  path.join(root, 'docs', 'commercial', 'REMAINING_CLOSEOUT_CHECKLIST.md'),
  'utf8'
);
const commercialCloseout = fs.readFileSync(
  path.join(root, 'docs', 'commercial', 'COMMERCIAL_CLOSEOUT_FINAL.md'),
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
const currentCloseoutRunbook = fs.readFileSync(
  path.join(root, 'CLOSEOUT_EXECUTION_RUNBOOK.md'),
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

test('2026-11-18 maintenance observations remain historical and the 2026-11-20 register is authoritative', () => {
  const historical = runbook.split('## Current evidence reconciliation')[1] || '';
  assert.match(runbook, /2026-11-18/);
  assert.match(historical, /live Production 67-route signed-session matrix remains \*\*NOT ESTABLISHED\*\*/);
  assert.match(buyerResiduals, /reconciled 2026-11-20/);
  assert.match(buyerResiduals, /67 expected \/ 67 covered \/ 0 failed/);
  assert.match(buyerResiduals, /not buyer-environment qualification/);
  assert.match(buyerResiduals, /one listed manual snapshot/i);
  assert.match(buyerResiduals, /protected=false/i);
  assert.match(buyerResiduals, /no scheduled snapshot capability/i);
});

test('Seller product closeout is buyer-independent while actual buyer license rights remain transaction-gated', () => {
  assert.match(sellerCloseoutChecklist, /A named buyer, buyer signature, buyer-specific legal review, payment, or transaction schedule is \*\*not\*\* a prerequisite/);
  assert.match(sellerCloseoutChecklist, /Transaction boundary — explicitly outside product closeout/);
  assert.match(sellerCloseoutChecklist, /required before granting the buyer licensed use or delivery rights/);
  assert.match(commercialCloseout, /No prospective buyer or buyer signature is needed to complete the product/);
  assert.match(commercialCloseout, /No license grant is made to a buyer until/);
  assert.doesNotMatch(sellerCloseoutChecklist, /Buyer-specific work — not a seller launch or marketing gate/);
});

test('67-route acceptance is certified only for the measured seller deployment and does not transfer to buyers', () => {
  assert.match(buyerResiduals, /67 expected \/ 67 covered \/ 0 failed/);
  assert.match(buyerResiduals, /Exact seller deployment evidence; not buyer-environment qualification/);
  assert.match(buyerResiduals, /Buyer environments remain independently unverified/);
  assert.match(sellerCloseoutChecklist, /buyer|customer/i);
});

test('historical Production key and restore notes are not reused as current evidence', () => {
  const historical = runbook.split('## Current evidence reconciliation')[1] || '';
  assert.match(runbook, /2026-11-18/);
  assert.match(historical, /context_hmac_keys.*exists with the expected schema and ownership/);
  assert.match(historical, /zero Production HMAC key rows/);
  assert.match(historical, /live Production 67-route signed-session matrix remains \*\*NOT ESTABLISHED\*\*/);
  assert.match(buyerResiduals, /67 expected \/ 67 covered \/ 0 failed/);
  assert.match(buyerResiduals, /br-proud-salad-bcshhdap/);
  assert.match(buyerResiduals, /br-calm-poetry-bc7l7wik/);
  assert.match(buyerResiduals, /070_evidence_upload_postgres_blob_storage\.sql/);
  assert.match(buyerResiduals, /not evidence of data corruption/i);
});

test('Production migration and rotation remain manual, confirmation-gated, and traffic-neutral', () => {
  assert.match(migrationWorkflow, /workflow_dispatch:/);
  assert.match(migrationWorkflow, /VERIFY_PRODUCTION_SIGNED_CONTEXT_MIGRATIONS/);
  assert.match(migrationWorkflow, /read-only/);
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
  assert.match(currentCloseoutRunbook, /105 selectable Contact Center locales/);
  assert.match(currentCloseoutRunbook, /114 source rows/);
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
