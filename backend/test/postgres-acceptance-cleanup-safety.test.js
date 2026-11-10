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
  const idLine = source.indexOf('const ownerAId =');
  const trackLine = source.indexOf('created.users.push(ownerAId)', idLine);
  const assertLine = source.indexOf("assert.ok(ownerAId, 'bootstrap must return the first owner identity')", idLine);
  assert.ok(idLine >= 0 && trackLine > idLine && assertLine > trackLine,
    'the owner must be registered for targeted cleanup before the following assertion');
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
  assert.match(source, /set_config\('app\.user_id',\$1,false\)/i);
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
