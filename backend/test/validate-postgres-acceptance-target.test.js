'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ACCEPTANCE_DATABASES, validatePostgresAcceptanceTarget } = require('../scripts/validate-postgres-acceptance-target');

const host = 'ep-ci-local-service.c-15.us-east-1.aws.neon.tech';

test('PostgreSQL acceptance validator allows only the named disposable acceptance databases', () => {
  assert.deepEqual(
    [...ACCEPTANCE_DATABASES].sort(),
    ['opscore_acceptance', 'opscore_http_acceptance', 'opscore_matrix_test'].sort()
  );
  for (const database of ['opscore_acceptance', 'opscore_http_acceptance', 'opscore_matrix_test']) {
    const target = validatePostgresAcceptanceTarget({
      urlText: `postgresql://opscore_runtime:masked@${host}/${database}`,
      expectedHost: host
    });
    assert.equal(target.database, database);
    assert.equal(target.hostname, host);
  }
});

test('PostgreSQL acceptance validator rejects non-allowlisted databases and production hosts', () => {
  assert.throws(() => validatePostgresAcceptanceTarget({
    urlText: `postgresql://opscore_runtime:masked@${host}/postgres`,
    expectedHost: host
  }), /OPSC_PG_ACCEPTANCE_DATABASE_NOT_ALLOWLISTED/);

  assert.throws(() => validatePostgresAcceptanceTarget({
    urlText: 'postgresql://opscore_runtime:masked@ep-winter-leaf-b4d0bwgk.c-15.aws.neon.tech/opscore_matrix_test',
    expectedHost: 'ep-winter-leaf-b4d0bwgk.c-15.aws.neon.tech'
  }), /OPSC_PG_ACCEPTANCE_PRODUCTION_HOST_FORBIDDEN/);
});

test('PostgreSQL acceptance validator requires exact host equality and direct connection', () => {
  assert.throws(() => validatePostgresAcceptanceTarget({
    urlText: `postgresql://opscore_runtime:masked@different.${host}/opscore_matrix_test`,
    expectedHost: host
  }), /OPSC_PG_ACCEPTANCE_HOST_MISMATCH/);

  const pooledHost = host.replace('.c-15', '-pooler.c-15');
  assert.throws(() => validatePostgresAcceptanceTarget({
    urlText: `postgresql://opscore_runtime:masked@${pooledHost}/opscore_matrix_test`,
    expectedHost: pooledHost
  }), /OPSC_PG_ACCEPTANCE_POOLER_HOST_FORBIDDEN/);
});
