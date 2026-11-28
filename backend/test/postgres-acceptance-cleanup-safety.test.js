'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.join(__dirname, 'postgres-commercial-acceptance-http.test.js');
const source = fs.readFileSync(sourcePath, 'utf8');

test('PostgreSQL acceptance cleanup never performs a table-wide users delete', () => {
  assert.doesNotMatch(
    source,
    /DELETE\s+FROM\s+users\s*(?:['"`]|;|$)/i,
    'cleanup must not delete unrelated user rows when the virgin-database guard fails'
  );
  assert.match(source, /DELETE\s+FROM\s+users\s+WHERE\s+id\s*=\s*\$1/i);
});

test('bootstrap owner identity is tracked before the test can fail later', () => {
  const idLine = source.indexOf('let ownerAId =');
  const trackLine = source.indexOf('created.users.push(ownerAId)', idLine);
  const assertLine = source.indexOf("assert.ok(ownerAId, 'bootstrap must return the first owner identity')", idLine);
  const canonicalIdentityLine = source.indexOf('const authenticatedOwnerAId = x.data.user.id', assertLine);
  const canonicalTrackLine = source.indexOf('created.users.push(authenticatedOwnerAId)', canonicalIdentityLine);
  const canonicalAssignLine = source.indexOf('ownerAId = authenticatedOwnerAId', canonicalTrackLine);
  assert.ok(idLine >= 0 && trackLine > idLine && assertLine > trackLine
      && canonicalIdentityLine > assertLine && canonicalTrackLine > canonicalIdentityLine
      && canonicalAssignLine > canonicalTrackLine,
    'bootstrap and authenticated /me identities must both be tracked before canonical identity is used for tenant foreign keys');
  assert.match(source, /ownerAMembership\.rowCount, 1/,
    'the canonical owner must have a persisted tenant membership before GIS fixtures are inserted');
});

test('tenant B fixture IDs are tracked before any fixture write', () => {
  const fixture = source.indexOf("const orgBId = 'org_'");
  const orgTrack = source.indexOf('created.organizations.push(orgBId)', fixture);
  const userTrack = source.indexOf('created.users.push(userBId, memberId)', fixture);
  const firstWrite = source.indexOf("INSERT INTO organizations (id,name,created_at)", fixture);
  assert.ok(fixture >= 0 && orgTrack > fixture && userTrack > orgTrack && firstWrite > userTrack,
    'record synthetic IDs before writes so a partial failure can be cleaned safely');
});

test('PostgreSQL acceptance cleanup removes only tracked throttle keys and sets the per-user RLS context', () => {
  assert.match(source, /created\.loginThrottleKeys\.push/i);
  assert.match(source, /DELETE FROM login_throttle WHERE throttle_key=\$1/i);
  assert.match(source, /bindSignedRlsSessionContext\(fixture/);
  assert.match(source, /sessionId: ownerASessionId/);
  assert.doesNotMatch(source, /set_config\('app\.user_id',\$1,false\)/i);
  assert.match(source, /ACCEPTANCE_CLEANUP_FAILED/);
});

test('PostgreSQL acceptance preflight detects RLS-hidden users before any fixture writes', () => {
  assert.match(source, /SELECT\s+opscore_count_users\(\)::int\s+AS\s+n/i,
    'virgin-database preflight must use the SECURITY DEFINER row count, not an RLS-filtered count');
  assert.match(source, /DATABASE_NOT_VIRGIN/i,
    'non-empty acceptance databases must fail closed before fixture writes');
  assert.match(source, /virginDatabaseVerified\s*=\s*true/i);
});

test('acceptance evidence stays temporary during parallel tests and is promoted only by the exact-head CI job', () => {
  assert.ok(source.includes('process.env.OPSC_PG_ACCEPTANCE_RESULT_FILE'));
  assert.ok(source.includes('path.join(os.tmpdir(),'));
  assert.ok(source.includes('opscore-postgres-http-acceptance-result.json'));
  assert.doesNotMatch(source, /process\\.env\\.OPSC_WRITE_EVIDENCE/);
  assert.doesNotMatch(source, /EVIDENCE_PATH/);
});

const { validatePostgresAcceptanceTarget, ACCEPTANCE_DATABASES } = require('../scripts/validate-postgres-acceptance-target');

test('PostgreSQL acceptance target permits only the two named disposable acceptance databases', () => {
  assert.deepEqual([...ACCEPTANCE_DATABASES].sort(), ['opscore_acceptance', 'opscore_http_acceptance']);
  for (const database of ACCEPTANCE_DATABASES) {
    const target = validatePostgresAcceptanceTarget({
      urlText: `postgresql://opscore_runtime:masked@ep-acceptance-test.c-15.us-east-1.aws.neon.tech/${database}?sslmode=verify-full`,
      expectedHost: 'ep-acceptance-test.c-15.us-east-1.aws.neon.tech'
    });
    assert.equal(target.database, database);
  }
  assert.throws(() => validatePostgresAcceptanceTarget({
    urlText: 'postgresql://user:masked@ep-acceptance-test.c-15.us-east-1.aws.neon.tech/neondb',
    expectedHost: 'ep-acceptance-test.c-15.us-east-1.aws.neon.tech'
  }), /OPSC_PG_ACCEPTANCE_DATABASE_NOT_ALLOWLISTED/);
});

test('Neon PITR verification uses libpq system trust roots with full hostname verification', () => {
  const workflowPath = path.join(__dirname, '..', '..', '.github', 'workflows', 'digital-twin-postgres-live.yml');
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  assert.match(workflow, /q\["sslmode"\]="verify-full"/);
  assert.match(workflow, /q\["sslrootcert"\]="system"/);
  assert.match(workflow, /PITR_TEST_BRANCH_CLEANUP=PASS/);
});

test('Production PITR runtime probe stays within read-only catalog grants and never reads the protected migration ledger', () => {
  const workflowPath = path.join(__dirname, '..', '..', '.github', 'workflows', 'digital-twin-postgres-live.yml');
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const start = workflow.indexOf('PITR_TIMESTAMP=');
  const end = workflow.indexOf('PITR_TEST_BRANCH_CLEANUP=PASS');
  assert.ok(start >= 0 && end > start);
  const probe = workflow.slice(start, end);
  assert.match(probe, /sslmode.*verify-full/);
  assert.match(probe, /sslrootcert.*system/);
  assert.match(probe, /pg_policies/);
  assert.match(probe, /relforcerowsecurity/);
  assert.doesNotMatch(probe, /schema_migrations/);
  assert.match(probe, /migration ledger excluded by runtime-role boundary/);
});

test('privileged cleanup is exact-target only and never becomes the application connection', () => {
  assert.match(source, /OPSC_PG_ACCEPTANCE_CLEANUP_URL/);
  assert.match(source, /OPSC_PG_ACCEPTANCE_CLEANUP_HOST/);
  assert.match(source, /cleanupTarget\.database !== database/);
  assert.match(source, /cleanupTarget\.hostname !== parsed\.hostname/);
  assert.ok(source.includes("allowedCleanupRoles = ['opscore_owner', 'neondb_owner']"));
  assert.match(source, /decodeURIComponent\(cleanupTarget\.parsed\.username\) !== cleanupRoleName/);
  assert.match(source, /identity\.role !== cleanupRoleName/);
  assert.match(source, /identity\.superuser !== false/);
  assert.match(source, /identity\.bypass_rls !== true/);
  assert.match(source, /OPSC_PG_ACCEPTANCE_URL/);
  assert.match(source, /DATABASE_URL: urlText/);
  assert.match(source, /application_name: 'opscore-acceptance-targeted-cleanup'/);
  assert.match(source, /exact-target-privileged-cleanup/);
  assert.ok(source.includes('cleanupUsesPrivilegedRole'));
  assert.ok(source.includes('SELECT count(*)::int AS n FROM users'));
  assert.ok(source.includes('identity.bypass_rls !== true'));
  assert.ok(source.includes('identity.superuser !== false'));
  assert.match(source, /created\.organizations/);
  assert.match(source, /created\.users/);
});

test('GIS scale benchmark rate allowance is confined to the disposable PostgreSQL CI step', () => {
  const workflowPath = path.join(__dirname, '..', '..', '.github', 'workflows', 'digital-twin-postgres-live.yml');
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const start = workflow.indexOf('Run real PostgreSQL HTTP and authenticated Dispatcher Map browser acceptance as opscore_runtime');
  const nextStep = workflow.indexOf('\n      - name:', start + 1);
  const step = workflow.slice(start, nextStep < 0 ? workflow.length : nextStep);
  assert.ok(start >= 0, 'the real authenticated GIS acceptance step must exist');
  assert.match(step, /FIREWALL_RATE_LIMIT:\s*'1000'/,
    'only the disposable 3 x 100-sample benchmark step may raise its request budget');
  assert.equal((workflow.match(/^\s*FIREWALL_RATE_LIMIT:/gm) || []).length, 1,
    'the elevated test-only firewall request budget must not become a workflow-wide or production setting');
});

test('Preview and disposable PostgreSQL 18 pass separate exact-target migration-owner cleanup URLs', () => {
  const workflowDir = path.resolve(__dirname, '..', '..', '.github', 'workflows');
  const previewWorkflow = fs.readFileSync(path.join(workflowDir, 'apply-preview-migrations.yml'), 'utf8');
  const pg18Workflow = fs.readFileSync(path.join(workflowDir, 'digital-twin-postgres-live.yml'), 'utf8');

  assert.ok(previewWorkflow.includes('export OPSC_PG_ACCEPTANCE_URL="$(cat "$RUNNER_TEMP/runtime.uri")"'));
  assert.ok(previewWorkflow.includes('export OPSC_PG_ACCEPTANCE_CLEANUP_URL="$(cat "$RUNNER_TEMP/bootstrap.uri")"'));
  assert.ok(previewWorkflow.includes("OPSC_PG_ACCEPTANCE_CLEANUP_ROLE='opscore_owner'"));

  assert.ok(pg18Workflow.includes('OPSC_PG_ACCEPTANCE_URL=postgresql://opscore_runtime:'));
  assert.ok(pg18Workflow.includes('OPSC_PG_ACCEPTANCE_CLEANUP_URL=postgresql://neondb_owner:${owner_password}@127.0.0.1:5432/opscore_http_acceptance'));
  assert.ok(pg18Workflow.includes('OPSC_PG_ACCEPTANCE_CLEANUP_ROLE=neondb_owner'));
  assert.ok(pg18Workflow.includes('CREATE DATABASE opscore_http_acceptance OWNER neondb_owner'));
});
