'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createIdentity, writeIdentity } = require('../../scripts/write-vercel-release-identity');
const { validatePostgresAcceptanceTarget } = require('../scripts/validate-postgres-acceptance-target');

const ROOT = path.resolve(__dirname, '..', '..');
const COMMIT = '9'.repeat(40);
const ACCEPTANCE_HOST = 'ep-calm-forest-123456.pooler.us-east-1.aws.neon.tech';

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Vercel release identity accepts only a valid main-branch GitHub run', () => {
  const identity = createIdentity({
    GITHUB_REF: 'refs/heads/main',
    GITHUB_REF_NAME: 'main',
    GITHUB_SHA: COMMIT,
    GITHUB_RUN_ID: '3014583826',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_REPOSITORY: 'mosamiryamany-hub/opscore-platform'
  });
  assert.equal(identity.schemaVersion, 'opscore.vercel-release-identity.v1');
  assert.equal(identity.commitSha, COMMIT);
  assert.equal(identity.pipelineId, '3014583826');
  assert.equal(identity.ref, 'main');
  assert.match(identity.runUrl, /actions\/runs\/3014583826$/);
  assert.throws(() => createIdentity({ GITHUB_REF: 'refs/heads/feature', GITHUB_REF_NAME: 'feature', GITHUB_SHA: COMMIT, GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1' }), /UNAPPROVED_PRODUCTION_REF/);
  assert.throws(() => createIdentity({ GITHUB_REF: 'refs/heads/main', GITHUB_REF_NAME: 'main', GITHUB_SHA: 'bad', GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1' }), /GITHUB_COMMIT_SHA_INVALID/);
});

test('Vercel release identity writer emits only a validated, atomically written file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-release-identity-test-'));
  const target = path.join(dir, 'identity.json');
  try {
    const result = writeIdentity(target, {
      GITHUB_REF: 'refs/heads/main',
      GITHUB_REF_NAME: 'main',
      GITHUB_SHA: COMMIT,
      GITHUB_RUN_ID: '3014583826',
      GITHUB_RUN_ATTEMPT: '2'
    });
    assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), result.identity);
    assert.equal(fs.readdirSync(dir).length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('acceptance database validation requires one exact allowlisted host and database', () => {
  const urlText = `postgresql://user:password@${ACCEPTANCE_HOST}/opscore_http_acceptance?sslmode=require`;
  const target = validatePostgresAcceptanceTarget({ urlText, expectedHost: ACCEPTANCE_HOST });
  assert.equal(target.database, 'opscore_http_acceptance');
  assert.equal(target.hostname, ACCEPTANCE_HOST);
  assert.throws(() => validatePostgresAcceptanceTarget({ urlText, expectedHost: 'ep-other-host.neon.tech' }), /OPSC_PG_ACCEPTANCE_HOST_MISMATCH/);
  assert.throws(() => validatePostgresAcceptanceTarget({ urlText: urlText.replace('/opscore_http_acceptance?', '/opscore_http_acceptance_old?'), expectedHost: ACCEPTANCE_HOST }), /OPSC_PG_ACCEPTANCE_DATABASE_NOT_ALLOWLISTED/);
  assert.throws(() => validatePostgresAcceptanceTarget({ urlText: `postgresql://user:password@ep-winter-leaf-b4d0bwgk.pooler.neon.tech/opscore_http_acceptance`, expectedHost: 'ep-winter-leaf-b4d0bwgk.pooler.neon.tech' }), /OPSC_PG_ACCEPTANCE_PRODUCTION_HOST_FORBIDDEN/);
  assert.throws(() => validatePostgresAcceptanceTarget({ urlText, expectedHost: '' }), /OPSC_PG_ACCEPTANCE_HOST_REQUIRED/);
});

test('production Vercel deploy is main-only, waits on the mobile high-severity audit, and embeds run identity', () => {
  const workflow = read('.github/workflows/vercel-deploy.yml');
  assert.match(workflow, /verify:\s*\n\s+if: github\.event_name == 'pull_request' \|\| github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /deploy:\s*\n\s+needs: \[verify\]\s*\n\s+if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(workflow, /workflow_dispatch:/);
  assert.match(workflow, /working-directory: mobile\s+run: npm audit --omit=dev --audit-level=high/);
  assert.match(workflow, /node scripts\/write-vercel-release-identity\.js/);
  assert.match(workflow, /Verify Vercel output contains the current release identity/);
  assert.match(workflow, /find \.vercel\/output/);
  assert.match(workflow, /opscore-vercel-release-identity\.json/);
  assert.match(workflow, /backend\/src\/opscore-vercel-release-identity\.json/);
  assert.match(workflow, /OPSC_RELEASE_CI_COMMIT: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /Compute package fingerprint for this commit/);
  assert.match(workflow, /OPSC_RELEASE_PACKAGE_SHA256: \$\{\{ steps\.package_fp\.outputs\.sha \}\}/);
  assert.match(workflow, /OPSC_RELEASE_PACKAGE_COMMIT: \$\{\{ github\.sha \}\}/);
});

test('Vercel function inclusion uses a valid single glob that carries backend runtime proof files', () => {
  const config = JSON.parse(read('vercel.json'));
  assert.equal(config.functions['api/index.js'].includeFiles, 'backend/**');
  assert.doesNotMatch(config.functions['api/index.js'].includeFiles, /,/);
  const adapter = read('api/index.js');
  assert.match(adapter, /requestedReleaseVerified === 'true' && hasVerifiedProductionRelease\(process\.env\)/);
  assert.match(read('scripts/package-release.js'), /if \(r === 'backend\/src\/opscore-vercel-release-identity\.json'\) continue/);
});

test('PostgreSQL acceptance workflow requires a separate host allowlist secret', () => {
  const workflow = read('.github/workflows/postgres-http-acceptance.yml');
  assert.match(workflow, /node backend\/scripts\/validate-postgres-acceptance-target\.js/);
  assert.equal((workflow.match(/OPSC_PG_ACCEPTANCE_HOST:\s*\$\{\{ secrets\.OPSC_PG_ACCEPTANCE_HOST \}\}/g) || []).length, 2);
});

test('secure release workflow supports version-bound tags and guarded exact-main dispatch', () => {
  const workflow = read('.github/workflows/opscore-secure-release.yml');
  assert.match(workflow, /github\.ref_type == 'tag' && startsWith\(github\.ref_name, 'v'\)/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /Verify release tag matches package version/);
  assert.match(workflow, /Verify manually dispatched source is main/);
  assert.match(workflow, /git merge-base --is-ancestor/);
  assert.match(workflow, /CI_COMMIT_TAG:\s*\$\{\{ github\.ref_type == 'tag' && github\.ref_name \|\| '' \}\}/);
  assert.match(workflow, /CI_COMMIT_SHA:\s*\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /CI_PIPELINE_ID:\s*\$\{\{ github\.run_id \}\}/);
  assert.match(workflow, /CI_JOB_NAME:\s*commercial-closure/);
  assert.match(workflow, /Regenerate current-head forensic language evidence/);
  assert.match(workflow, /npm run contact-center:i18n:forensic/);
  assert.match(workflow, /Generate current mobile dependency audit/);
  assert.match(workflow, /Generate current root dependency audit/);
  assert.match(workflow, /MOBILE_AUDIT_REPORT_INCOMPLETE/);
  assert.match(workflow, /ROOT_AUDIT_REPORT_INCOMPLETE/);
  assert.match(workflow, /node scripts\/write-release-attestation\.js/);
  assert.match(workflow, /actions\/attest@/);
  assert.match(workflow, /Upload release and exact-run evidence/);
  assert.match(workflow, /OPSC_RELEASE_TEST_CONCURRENCY=4/);
  assert.match(read('.github/workflows/opscore-ci.yml'), /OPSC_RELEASE_TEST_CONCURRENCY=4/);
  assert.match(read('.github/workflows/vercel-deploy.yml'), /OPSC_RELEASE_TEST_CONCURRENCY=4/);
  assert.match(read('scripts/release-candidate-gate.js'), /OPSC_RELEASE_TEST_CONCURRENCY: process\.env\.OPSC_RELEASE_TEST_CONCURRENCY \|\| '4'/);
});
