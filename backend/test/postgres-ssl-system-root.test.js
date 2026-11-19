'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizePostgresConnectionString } = require('../src/adapters/postgres');

describe('postgres sslrootcert=system', () => {
  it('does not treat system as a filesystem path', () => {
    const { connectionString, tls } = normalizePostgresConnectionString(
      'postgresql://opscore_owner@ep-example.aws.neon.tech/opscore_acceptance?sslmode=verify-full&sslrootcert=system&channel_binding=require'
    );
    assert.equal(new URL(connectionString).searchParams.get('sslrootcert'), null);
    assert.equal(new URL(connectionString).searchParams.get('sslmode'), null);
    assert.equal(tls.ca, undefined);
  });
});
