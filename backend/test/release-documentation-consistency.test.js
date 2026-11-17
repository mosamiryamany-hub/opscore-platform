'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('commercial-facing documents keep buyer-environment fail-closed language', () => {
  const files = [
    'COMMERCIAL_CLOSURE_STATUS.md',
    'COMMERCIAL_RELEASE_STATUS.md',
    'CLIENT_INSPECTION_PACKAGE_STATUS.md',
    'CLOSEOUT_EXECUTION_RUNBOOK.md',
    'BUYER_DELIVERY.md',
    'SALES_README.md',
    'SALES_KIT.md',
    'docs/release/RELEASE_SCOPE.md',
    'docs/COMMERCIAL_HANDOFF.md'
  ];
  for (const file of files) {
    const doc = read(file);
    // Buyer transfer remains unproven; seller runtime may separately report CERTIFIED on its pin.
    assert.match(doc, /NOT_VERIFIED|NOT_ESTABLISHED|NO LICENSE GRANT/i);
    assert.doesNotMatch(doc, /productionIsolationCertification=CERTIFIED/);
    assert.doesNotMatch(doc, /reports seller-reference production isolation as CERTIFIED/i);
  }
  const scope = JSON.parse(read('INTEGRATED_RELEASE_SCOPE.json'));
  // Scope JSON may lag live runtime; must not claim buyer-environment certification.
  assert.match(String(scope.production.productionIsolationCertification), /NOT_VERIFIED|PENDING|NOT_ESTABLISHED/);
});

test('commercial closeout documents agree on candidate identity and certification boundary', () => {
  const docs = [
    read('COMMERCIAL_CLOSURE_STATUS.md'),
    read('CLOSEOUT_EXECUTION_RUNBOOK.md'),
    read('BUYER_DELIVERY.md'),
    read('docs/release/RELEASE_SCOPE.md')
  ];

  for (const doc of docs) {
    // Buyer-environment production certification remains not established.
    assert.match(doc, /NOT_ESTABLISHED|buyer environment|بيئة العميل|buyer-environment/i);
    // Either legacy formal NOT_CERTIFIED wording, or explicit seller-reference CERTIFIED
    // paired with buyer residual / non-transfer of buyer certification.
    assert.ok(
      /NOT_CERTIFIED/.test(doc) ||
        (/CERTIFIED/.test(doc) && /PASS_WITH_BUYER_RESIDUALS/.test(doc) && /buyer|customer|residual/i.test(doc)) ||
        /NO LICENSE GRANT|NO COMMERCIAL LICENSE/i.test(doc),
      'doc must keep a clear certification boundary'
    );
    assert.ok(doc.includes('security/mobile-dependency-remediation-2026-11-01') || /PASS_WITH_BUYER_RESIDUALS|source commit|4ef126/i.test(doc));
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
    'DELIVERY_MANIFEST.md',
    'INTEGRATED_RELEASE_SCOPE.json'
  ].map(read);

  for (const doc of sourceDocs) assert.equal(doc.includes(oldDigest), false);
});

test('active release and deployment automation is GitHub Actions; legacy GitLab config is archived', () => {
  const secureRelease = read('.github/workflows/opscore-secure-release.yml');
  const vercelDeploy = read('.github/workflows/vercel-deploy.yml');
  const historicalGitLab = read('docs/archive/legacy-gitlab-ci.yml');
  assert.match(secureRelease, /workflow_dispatch/);
  assert.ok(secureRelease.includes("github.ref == 'refs/heads/main'"));
  assert.match(secureRelease, /cancel-in-progress: false/);
  assert.match(vercelDeploy, /GITHUB_SHA/);
  assert.match(vercelDeploy, /vercel deploy --prebuilt --prod/);
  assert.equal(fs.existsSync(path.join(root, '.gitlab-ci.yml')), false);
  assert.match(historicalGitLab, /deploy-production:/);
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

test('Vercel production deploy requires same-run disposable PostgreSQL HTTP acceptance', () => {
  const workflow = read('.github/workflows/vercel-deploy.yml');
  const postgresWorkflow = read('.github/workflows/digital-twin-postgres-live.yml');
  const targetValidator = read('backend/scripts/validate-postgres-acceptance-target.js');
  const acceptanceTest = read('backend/test/postgres-commercial-acceptance-http.test.js');
  assert.ok(workflow.includes('./.github/workflows/digital-twin-postgres-live.yml'));
  assert.match(workflow, /needs: \[verify, postgres-acceptance\]/);
  assert.match(workflow, /acceptance_evidence_b64/);
  assert.match(workflow, /POSTGRES_ACCEPTANCE_EVIDENCE_MISSING/);
  assert.doesNotMatch(workflow, /secrets\.OPSC_PG_ACCEPTANCE_URL/);
  assert.match(workflow, /acceptance_commit_mismatch/);
  assert.match(workflow, /acceptance_pipeline_mismatch/);
  assert.ok(workflow.includes("data['productionCertification'] = False"));
  assert.match(postgresWorkflow, /OPSC_PG_ACCEPTANCE_URL:/);
  assert.match(postgresWorkflow, /validate-postgres-acceptance-target\.js/);
  assert.match(postgresWorkflow, /postgres-commercial-acceptance-http\.test\.js/);
  assert.match(postgresWorkflow, /CI_COMMIT_SHA:\s*\$\{\{ github\.sha \}\}/);
  assert.match(postgresWorkflow, /CI_PIPELINE_ID:\s*\$\{\{ github\.run_id \}\}/);
  assert.match(postgresWorkflow, /POSTGRES_ACCEPTANCE_CLEANUP_NOT_PASS/);
  assert.match(targetValidator, /OPSC_PG_ACCEPTANCE_URL_REQUIRED/);
  assert.match(acceptanceTest, /OPSC_PG_ACCEPTANCE_URL/);
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

test('release and production deploy workflows are not auto-cancelled during cleanup', () => {
  const release = read('.github/workflows/opscore-secure-release.yml');
  const deployment = read('.github/workflows/vercel-deploy.yml');
  assert.match(release, /cancel-in-progress: false/);
  assert.match(deployment, /cancel-in-progress: false/);
  assert.match(deployment, /timeout-minutes: 30/);
  assert.match(release, /timeout-minutes: 20/);
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


test('commercial release grants no license and forbids distribution pending rights decision', () => {
  const notice = read('NO_LICENSE_GRANT_NOTICE.txt');
  const buyer = read('BUYER_DELIVERY.md');
  const closure = read('COMMERCIAL_CLOSURE_STATUS.md');
  const manifest = read('DELIVERY_MANIFEST.md');
  const packageBuilder = read('scripts/package-release.js');
  assert.equal(fs.existsSync(path.join(root, 'PROPRIETARY_LICENSE.txt')), false);
  for (const doc of [notice, buyer, closure, manifest]) {
    assert.match(doc, /NO LICENSE GRANT/i);
    assert.match(doc, /rights holder/i);
    assert.match(doc, /signed/i);
  }
  assert.match(packageBuilder, /licenseGrant: 'NONE_PENDING_RIGHTS_HOLDER_DECISION'/);
  assert.match(packageBuilder, /distributionAuthorized: false/);
  assert.match(packageBuilder, /NO LICENSE GRANT/);
});

test('current-facing release documents do not pin superseded candidate identities or bundled license grants', () => {
  const sourceDocs = [
    'DELIVERY_MANIFEST.md',
    'BUYER_DELIVERY.md',
    'COMMERCIAL_CLOSURE_STATUS.md',
    'CLOSEOUT_EXECUTION_RUNBOOK.md',
    'docs/release/RELEASE_SCOPE.md',
    'COMMERCIAL_RELEASE_STATUS.md',
    'SALES_KIT.md',
    'SALES_README.md',
    'docs/COMMERCIAL_HANDOFF.md',
    'BUYER_FIRST.md',
    'CLIENT_INSPECTION_PACKAGE_STATUS.md',
    'INTEGRATED_RELEASE_SCOPE.json',
    'docs/release/COMMERCIAL_RELEASE_STATEMENT.json'
  ].map(read);

  const supersededIdentity = /4ef126ccd59f23cebeead30224d1bcf7199535ab|43588278472|43308699094|dpl_5nx3dRRu9WuYmpqR9deiSeCqHwF3|d940152d1428d82d9bb0c57695d929099a648ac3|3014428936|30bf29aa1a995a476f40a37600e869772c086ece9f3148da5e9140766806bbf6/;
  const withdrawnLicenseGrant = /bundled license grants internal-use|upon full payment[\s\S]{0,120}purchaser receives/i;
  for (const doc of sourceDocs) {
    assert.doesNotMatch(doc, supersededIdentity);
    assert.doesNotMatch(doc, withdrawnLicenseGrant);
    assert.match(doc, /NO LICENSE GRANT|NO BUYER LICENSE GRANT|NO COMMERCIAL DISTRIBUTION/i);
  }
});

test('external release attestation statement includes explicit no-license fields', () => {
  const attestation = read('scripts/write-release-attestation.js');
  assert.match(attestation, /licenseGrant:\s*'NONE_PENDING_RIGHTS_HOLDER_DECISION'/);
  assert.match(attestation, /distributionAuthorized:\s*false/);
});

test('handover docs do not advertise a bundled proprietary or use-only license file', () => {
  const files = [
    'README.md',
    'docs/commercial/COMMERCIAL_TRANSFER_CHECKLIST.md',
    'backend/docs/COMMERCIAL_HANDOFF.md',
    'BUYER_DELIVERY.md',
    'DELIVERY_MANIFEST.md',
    'COMMERCIAL_CLOSURE_STATUS.md'
  ];
  for (const file of files) {
    const doc = read(file);
    assert.doesNotMatch(doc, /PROPRIETARY_LICENSE\.txt/);
    assert.doesNotMatch(doc, /bundled license file is not a substitute/i);
    assert.doesNotMatch(doc, /proprietary internal-use license/i);
  }
});

test('seller offer may be marketed before buyer identification while buyer rights and delivery remain gated', () => {
  const sellerDocs = [
    read('COMMERCIAL_CLOSURE_STATUS.md'),
    read('COMMERCIAL_RELEASE_STATUS.md'),
    read('SALES_KIT.md'),
    read('SALES_README.md'),
    read('docs/COMMERCIAL_HANDOFF.md'),
    read('docs/commercial/SELLER_COMMERCIAL_MODEL.md')
  ];
  for (const doc of sellerDocs) {
    assert.match(doc, /OPEN FOR MARKETING|may (?:advertise|publish|market)|may be advertised|offer may be prepared/i);
    assert.match(doc, /License Schedule|NO LICENSE GRANT/i);
  }

  const notice = read('NO_LICENSE_GRANT_NOTICE.txt');
  assert.match(notice, /before a buyer is identified/i);
  assert.match(notice, /until the rights holder and that named buyer execute/i);
  assert.match(notice, /pins the exact deliverable/i);

  const buyerDelivery = read('BUYER_DELIVERY.md');
  assert.match(buyerDelivery, /Delivery status: HOLD/);
  assert.match(buyerDelivery, /NO BUYER LICENSE GRANT \/ NO DELIVERY BEFORE EXECUTED SCHEDULE/);
  assert.match(buyerDelivery, /Seller advertising, listings, demonstrations and negotiations may happen before a buyer is known/i);

  const closeout = read('docs/commercial/REMAINING_CLOSEOUT_CHECKLIST.md');
  assert.match(closeout, /not a seller launch or marketing gate/i);
  assert.doesNotMatch(closeout, /- \[ \] First signed License Schedule with a named buyer/i);

  const gate = read('backend/scripts/release-hardening-gate.js');
  assert.match(gate, /do not grant a buyer any rights/i);
  assert.match(gate, /pins the exact deliverable/i);
});
