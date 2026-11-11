'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('commercial closeout documents agree on candidate identity and certification boundary', () => {
  const docs = [
    read('COMMERCIAL_CLOSURE_STATUS.md'),
    read('CLOSEOUT_EXECUTION_RUNBOOK.md'),
    read('BUYER_DELIVERY.md'),
    read('docs/release/RELEASE_SCOPE.md')
  ];

  for (const doc of docs) {
    assert.match(doc, /NOT_ESTABLISHED/);
    assert.match(doc, /NOT_CERTIFIED/);
    // Accept either the pre-merge candidate branch name or the production main commit identity.
    assert.ok(doc.includes('security/mobile-dependency-remediation-2026-11-01') || /PASS_WITH_BUYER_RESIDUALS|source commit/i.test(doc));
    assert.match(doc, /buyer|customer/i);
    assert.match(doc, /translation|ترجمة/i);
    assert.match(doc, /mobile|الهاتف/i);
    assert.match(doc, /external integration|external provider|التكاملات الخارجية|maps|buyer residual/i);
    assert.doesNotMatch(doc, /!1 — Draft|fix\/cli-deployment-provenance-20261025/);
  }
});

test('handover sources do not hard-code a superseded candidate ZIP digest', () => {
  const oldDigest = '892565400103ee78ed6b233521cd2b047174515f1d98d7099fb239b9e0e1c61c';
  const sourceDocs = [
    'COMMERCIAL_CLOSURE_STATUS.md',
    'CLOSEOUT_EXECUTION_RUNBOOK.md',
    'BUYER_DELIVERY.md',
    'INTEGRATED_RELEASE_SCOPE.json'
  ].map(read);

  for (const doc of sourceDocs) assert.equal(doc.includes(oldDigest), false);
});

test('preview deployment requires manual opt-in and production deploy remains default-branch only', () => {
  const ci = read('.gitlab-ci.yml');
  const preview = ci.match(/deploy-preview:[\s\S]*?(?=\ndeploy-production:)/);
  const production = ci.match(/deploy-production:[\s\S]*?(?=\n[a-zA-Z0-9_-]+:|$)/);

  assert.ok(preview, 'deploy-preview job must exist');
  assert.ok(production, 'deploy-production job must exist');
  assert.match(preview[0], /CI_PIPELINE_SOURCE == "web"/);
  assert.match(preview[0], /OPSC_RUN_PREVIEW_DEPLOY == "true"/);
  assert.match(preview[0], /when: never/);
  assert.match(production[0], /CI_PIPELINE_SOURCE == "push"/);
  assert.match(production[0], /CI_COMMIT_BRANCH == \$CI_DEFAULT_BRANCH/);
});

test('buyer quickstart matches the pinned Node engine and direct PostgreSQL dependency', () => {
  const pkg = JSON.parse(read('backend/package.json'));
  const quickstart = read('backend/BUYER_QUICKSTART.md');
  assert.equal(pkg.engines.node, '>=22.23.4 <23');
  assert.equal(pkg.dependencies.pg, '8.23.1');
  assert.match(quickstart, /npm ci/);
  assert.ok(quickstart.includes('22.23.4'));
  assert.ok(quickstart.includes('127.0.0.1:3000'));
  assert.doesNotMatch(quickstart, /npm install pg|optional peer dependency/i);
});

test('installation verification enforces the exact supported Node 22 range', () => {
  const verifier = read('backend/scripts/installation-verification.js');
  const preflight = read('backend/scripts/buyer-preflight.js');
  const engine = read('backend/scripts/node-engine.js');
  assert.ok(verifier.includes('satisfiesNodeEngine(process.version, backendPackage.engines?.node)'));
  assert.ok(engine.includes('maximumExclusive'));
  assert.ok(engine.includes('compareVersions(v,r.maximumExclusive)<0'));
  assert.ok(verifier.includes('backendPackage.engines?.node ==='));
  assert.ok(preflight.includes('const hardFailures = checks.filter(x => !x.pass);'));
});

test('package builder validates a clean install from the extracted archive', () => {
  const packager = read('scripts/package-release.js');
  assert.match(packager, /npm ci/);
  assert.match(packager, /buyer:preflight/);
  assert.match(packager, /EXTRACTED_BUYER_BACKEND_INSTALL=PASS/);
  assert.match(packager, /EXTRACTED_BUYER_MOBILE_INSTALL=PASS/);
});

test('customer-facing handoff docs contain no stale candidate failure state or obsolete pg instructions', () => {
  const files = [
    'BUYER_FIRST.md',
    'BUYER_DELIVERY.md',
    'DELIVERY_MANIFEST.md',
    'COMMERCIAL_CLOSURE_STATUS.md',
    'CLOSEOUT_EXECUTION_RUNBOOK.md',
    'CLIENT_INSPECTION_PACKAGE_STATUS.md',
    'COMMERCIAL_RELEASE_STATUS.md',
    'SALES_KIT.md',
    'SALES_README.md',
    'docs/COMMERCIAL_HANDOFF.md',
    'docs/release/RELEASE_SCOPE.md',
    'backend/BUYER_QUICKSTART.md'
  ];
  for (const file of files) {
    const doc = read(file);
    assert.doesNotMatch(doc, /3015330552|e92db6cc|PENDING exact-head validation/);
    assert.doesNotMatch(doc, /npm install pg|optional peer dependency/i);
    assert.doesNotMatch(doc, /Current-candidate PostgreSQL HTTP acceptance — NOT VERIFIED/);
  }
});

test('demo seed URL follows runtime port and never prints demo passwords', () => {
  const config = read('backend/src/config.js');
  const seed = read('backend/scripts/seed-demo.js');
  const readme = read('backend/README.md');
  const quickstart = read('backend/BUYER_QUICKSTART.md');
  assert.match(config, /positiveInt\('PORT', 3000/);
  assert.ok(seed.includes('config.port'));
  assert.doesNotMatch(seed, /3123/);
  assert.doesNotMatch(readme, /127\.0\.0\.1:3123/);
  assert.match(quickstart, /127\.0\.0\.1:3000/);
  for (const key of [
    'OPSC_DEMO_PASSWORD_ADMIN',
    'OPSC_DEMO_PASSWORD_DISPATCHER',
    'OPSC_DEMO_PASSWORD_TECHNICIAN',
    'OPSC_DEMO_PASSWORD_VIEWER'
  ]) assert.ok(seed.includes(key) && quickstart.includes(key), 'missing demo password contract: ' + key);
  assert.match(seed, /passwords are not printed/);
});

test('manual Vercel Preview requires and binds the isolated acceptance runtime database', () => {
  const ci = read('.gitlab-ci.yml');
  const previewStart = ci.indexOf('deploy-preview:');
  const previewEnd = ci.indexOf('deploy-production:', previewStart);
  assert.ok(previewStart >= 0 && previewEnd > previewStart, 'deploy-preview job must exist');
  const preview = ci.slice(previewStart, previewEnd);
  assert.ok(preview.includes('OPSC_PG_ACCEPTANCE_URL_REQUIRED_FOR_SAFE_PREVIEW'));
  assert.ok(preview.includes('PREVIEW_DATABASE_RUNTIME_ROLE_MUST_BE_OPSCORE_APP'));
  assert.ok(preview.includes('PREVIEW_DATABASE_DIRECT_CONNECTION_REQUIRED'));
  assert.ok(preview.includes('OPSC_DATABASE_URL='));
  assert.ok(preview.includes('DATABASE_URL='));
  assert.ok(preview.includes('DATABASE_ENGINE=postgres'));
  assert.ok(preview.includes('PREVIEW_RUNTIME_DATABASE_BOUND_TO_ISOLATED_ACCEPTANCE=PASS'));
});

test('PostgreSQL buyer activation uses real-owner bootstrap and forbids SQLite demo seeding',()=>{
  const seed=read('backend/scripts/seed-demo.js');
  const quick=read('backend/BUYER_QUICKSTART.md');
  const readme=read('backend/README.md');
  assert.ok(seed.includes('DEMO_SEED_REQUIRES_LOCAL_SQLITE_ONLY'));
  for (const doc of [quick,readme]) {
    assert.match(doc,/npm run bootstrap/);
    assert.match(doc,/OPSC_BOOTSTRAP_ORG_NAME/);
    assert.match(doc,/Do not run `seed:demo` when `DATABASE_ENGINE=postgres`/);
  }
});

test('commercial acceptance CI job cannot be auto-cancelled while fixture cleanup is active', () => {
  const ci = read('.gitlab-ci.yml');
  const start = ci.indexOf('commercial-closure:');
  const end = ci.indexOf('deploy-preview:', start);
  assert.ok(start >= 0 && end > start, 'commercial-closure job must exist');
  const closure = ci.slice(start, end);
  assert.ok(closure.includes('interruptible: false'));
  assert.ok(closure.includes('mandatory cleanup finally block'));
});

test('SQLite demo and PostgreSQL real-owner activation remain separate in buyer docs', () => {
  const seed = read('backend/scripts/seed-demo.js');
  const quick = read('backend/BUYER_QUICKSTART.md');
  const readme = read('backend/README.md');
  assert.ok(seed.includes('DEMO_SEED_REQUIRES_LOCAL_SQLITE_ONLY'));
  for (const doc of [quick, readme]) {
    assert.ok(doc.includes('npm run bootstrap'));
    assert.ok(doc.includes('OPSC_BOOTSTRAP_ORG_NAME'));
    assert.ok(doc.includes('OPSC_BOOTSTRAP_CEO_EMAIL'));
    assert.ok(doc.includes('OPSC_BOOTSTRAP_CEO_PASSWORD'));
    assert.ok(doc.includes('seed:demo') && doc.includes('DATABASE_ENGINE=postgres'));
  }
});
 
test('GitHub verification and production pre-deploy jobs validate recorded release evidence', () => {
  const workflows = [
    read('.github/workflows/opscore-ci.yml'),
    read('.github/workflows/vercel-deploy.yml')
  ];
  const verifyStep = `- name: Verify recorded release evidence and provenance
        working-directory: backend
        env:
          OPSC_VERIFY_RECORDED_TEST_EVIDENCE: 'true'
        run: npm run verify`;
  for (const workflow of workflows) {
    const runner = workflow.indexOf('node scripts/release-test-runner.js');
    const verifier = workflow.indexOf(verifyStep);
    const audit = workflow.indexOf('npm audit --omit=dev --audit-level=high');
    assert.ok(runner >= 0 && verifier > runner && audit > verifier,
      'recorded evidence verification must run after tests and before dependency audits/deploy');
  }
});
