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

test('production deployment workflow is main-only and has no automatic preview deployment', () => {
  const deploy = read('.github/workflows/vercel-deploy.yml');
  assert.match(deploy, /branches:\s*\[main\]/);
  assert.match(deploy, /vercel pull --yes --environment=production/);
  assert.match(deploy, /vercel deploy --prebuilt --prod/);
  assert.match(deploy, /cancel-in-progress:\s*false/);
  assert.doesNotMatch(deploy, /--preview|deploy-preview:/i);
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

test('Vercel production workflow binds deployment to the main project and production environment', () => {
  const deploy = read('.github/workflows/vercel-deploy.yml');
  assert.match(deploy, /branches:\s*\[main\]/);
  assert.match(deploy, /VERCEL_PROJECT_ID/);
  assert.match(deploy, /VERCEL_ORG_ID/);
  assert.match(deploy, /environment=production/);
  assert.match(deploy, /--prod/);
  assert.doesNotMatch(deploy, /--preview|deploy-preview:/i);
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

test('GitHub CI does not auto-cancel release tests and acceptance cleanup remains targeted', () => {
  const ci = read('.github/workflows/opscore-ci.yml');
  const acceptance = read('backend/test/postgres-commercial-acceptance-http.test.js');
  assert.match(ci, /concurrency:/);
  assert.match(ci, /cancel-in-progress:\s*false/);
  assert.match(ci, /node scripts\/release-test-runner\.js/);
  assert.match(acceptance, /finally\s*\{/);
  assert.match(acceptance, /ACCEPTANCE_CLEANUP_FAILED/);
  assert.match(acceptance, /DELETE FROM users WHERE id=\$1/i);
  assert.doesNotMatch(acceptance, /DELETE\s+FROM\s+users\s*(?:['"`]|;|$)/i);
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
