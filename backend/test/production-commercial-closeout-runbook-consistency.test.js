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
const currentCommercialStatus = fs.readFileSync(
  path.join(root, 'docs', 'commercial', 'COMMERCIAL_CLOSEOUT_STATUS_2026-11-22.md'),
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
const commercialClosureStatus = fs.readFileSync(
  path.join(root, 'COMMERCIAL_CLOSURE_STATUS.md'),
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

test('2026-11-18 maintenance observations remain historical and the 2026-11-22 register is authoritative', () => {
  const historical = runbook.split('## Current evidence reconciliation')[1] || '';
  assert.match(runbook, /2026-11-18/);
  assert.match(historical, /live Production 67-route signed-session matrix remains \*\*NOT ESTABLISHED\*\*/);
  assert.match(currentCommercialStatus, /Commercial handoff status \(2026-11-22\)/);
  assert.match(currentCommercialStatus, /67\/67 signed-tenant route result/);
  assert.match(currentCommercialStatus, /candidate-bound Production evidence/);
  assert.match(currentCommercialStatus, /one manual snapshot is listed/i);
  assert.match(currentCommercialStatus, /protected=false/i);
  assert.match(currentCommercialStatus, /Automatic snapshot schedule is empty/i);
});

test('Seller product closeout is buyer-independent while actual buyer license rights remain transaction-gated', () => {
  assert.match(sellerCloseoutChecklist, /A named buyer, buyer signature, buyer-specific legal review, payment, or transaction schedule is \*\*not\*\* a prerequisite/);
  assert.match(sellerCloseoutChecklist, /Transaction boundary — explicitly outside product closeout/);
  assert.match(sellerCloseoutChecklist, /required before granting the buyer licensed use or delivery rights/);
  assert.match(commercialCloseout, /A named buyer is not required for seller-side release preparation/);
  assert.match(commercialCloseout, /No license grant/);
  assert.doesNotMatch(sellerCloseoutChecklist, /Buyer-specific work — not a seller launch or marketing gate/);
});

test('67-route acceptance remains isolated PostgreSQL CI evidence and does not certify the canonical Production alias', () => {
  assert.match(currentCommercialStatus, /67\/67 signed-tenant route result/);
  assert.match(currentCommercialStatus, /candidate deployment `dpl_FgDTqKJxCDw3SAGLtgPxqfQHGu7v`/);
  assert.match(currentCommercialStatus, /not a second independent 67\/358\/3 probe against the final promoted deployment ID/);
  assert.match(currentCommercialStatus, /Buyer environments remain independently unverified/);
  assert.match(sellerCloseoutChecklist, /buyer|customer/i);
});

test('historical Production observations remain labeled and current Neon ledger evidence is exact', () => {
  const historical = runbook.split('## Current evidence reconciliation')[1] || '';
  assert.match(runbook, /2026-11-18/);
  assert.match(historical, /context_hmac_keys.*exists with the expected schema and ownership/);
  assert.match(historical, /zero Production HMAC key rows/);
  assert.match(historical, /live Production 67-route signed-session matrix remains \*\*NOT ESTABLISHED\*\*/);
  assert.match(currentCommercialStatus, /br-proud-salad-bcshhdap/);
  assert.match(currentCommercialStatus, /071_signed_rls_context_all_access_modes\.sql/);
  assert.match(currentCommercialStatus, /zero policies directly consuming raw tenant\/user\/access-mode GUC values/);
  assert.match(currentCommercialStatus, /effective tenant\/user returned NULL, access mode returned an empty value/);
  assert.match(currentCommercialStatus, /opscore_runtime.*NOBYPASSRLS.*NOINHERIT/);
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

test('114 interface locales remain distinct from 105 conversation targets and 114 unqualified rows', () => {
  const localeStatuses = localesManifest.locales.reduce((counts, locale) => {
    counts[locale.status] = (counts[locale.status] || 0) + 1;
    return counts;
  }, {});
  assert.equal(localesManifest.localeCount, 114);
  assert.equal(localesManifest.locales.length, 114);
  assert.deepEqual(localeStatuses, { machine_draft: 100, english_fallback: 4, source: 1, english_fallback_interface_only: 9 });
  assert.equal(localesManifest.locales.filter(locale => locale.status !== 'english_fallback_interface_only').length, 105);
  assert.deepEqual(localesManifest.locales.filter(locale => locale.status === 'english_fallback_interface_only').map(locale => locale.code).sort(), ['es','hy','ml','ms','my','sr','sw','te','uz']);
  assert.equal(languageQualificationRows.length, 114);
  for (const row of languageQualificationRows) {
    const fields = row.split(',');
    assert.equal(String(fields[4] || '').replaceAll('"', ''), 'planned_not_qualified');
    assert.equal(String(fields[8] || '').replaceAll('"', ''), 'not_run');
  }
  assert.match(currentCommercialStatus, /114 interface locales selectable/);
  assert.match(currentCommercialStatus, /105 conversation-language targets/);
  assert.match(currentCommercialStatus, /9 interface-only fallbacks disabled for conversations/);
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
  assert.match(currentCommercialStatus, /Vercel firewall enforcement posture/);
  assert.match(currentCommercialStatus, /Generic attack, RCE, SQLi, XSS and bot-protection rules are active in `log` mode/);
  assert.match(currentCommercialStatus, /60 requests per source IP per 60-second window/);
  assert.match(currentCommercialStatus, /payment_required/);
});

test('GitHub Environment reviewer protection is not claimed without a verified settings read', () => {
  assert.match(runbook, /Environment protection rules \/ Required reviewers were not readable/);
  assert.match(runbook, /their presence is \*\*UNVERIFIED\*\*/);
  assert.match(runbook, /Verify Settings → Environments → production before any dispatch/);
  assert.doesNotMatch(runbook, /protected GitHub `production` Environment approval/);
});


test('Production release flags remain bound to the older public SHA and do not qualify the current closeout base', () => {
  assert.match(commercialClosureStatus, /OPSC_PRODUCTION_HOLD=false/);
  assert.match(commercialClosureStatus, /OPSC_RELEASE_VERIFIED=true/);
  assert.match(commercialClosureStatus, /OPSC_PRODUCTION_ISOLATION_CERTIFICATION=CERTIFIED/);
  assert.match(commercialClosureStatus, /b7f63445c1748ebaec426a9ebe0ea629e4998839/);
  assert.match(commercialClosureStatus, /OPSC_PG_SSL_MODE=verify-full/);
  assert.match(commercialClosureStatus, /OPSC_PG_SSL_REJECT_UNAUTHORIZED=true/);
  assert.match(commercialClosureStatus, /63682774/);
  assert.match(commercialClosureStatus, /NOT_ESTABLISHED/);
});
