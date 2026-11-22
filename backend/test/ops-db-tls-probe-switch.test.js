'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildTlsProbeConfig,
  directEndpointUrl
} = require('../scripts/ops_db_tls_probe_switch');

const strictEnv = {
  OPSC_PG_SSL_MODE: 'verify-full',
  OPSC_PG_SSL_REJECT_UNAUTHORIZED: 'true'
};

test('TLS probe strips URL sslmode=disable before applying verified TLS options', () => {
  const config = buildTlsProbeConfig(
    'postgresql://opscore_runtime:secret@ep-example.neon.tech/opscore_acceptance?sslmode=disable&channel_binding=require',
    strictEnv
  );
  const url = new URL(config.connectionString);
  assert.equal(url.searchParams.has('sslmode'), false);
  assert.equal(url.searchParams.get('channel_binding'), 'require');
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(config.ssl.ca, undefined);
});

test('TLS probe strips encryption-only URL modes and still requires certificate verification', () => {
  const config = buildTlsProbeConfig(
    'postgresql://opscore_runtime:secret@ep-example.neon.tech/opscore_acceptance?sslmode=require',
    strictEnv
  );
  assert.equal(new URL(config.connectionString).searchParams.has('sslmode'), false);
  assert.equal(config.ssl.rejectUnauthorized, true);
});

test('TLS probe rejects a non-verify-full mode', () => {
  assert.throws(
    () => buildTlsProbeConfig(
      'postgresql://opscore_runtime:secret@ep-example.neon.tech/opscore_acceptance?sslmode=disable',
      { ...strictEnv, OPSC_PG_SSL_MODE: 'require' }
    ),
    { code: 'TLS_PROBE_STRICT_TLS_REQUIRED' }
  );
});

test('TLS probe rejects disabled certificate verification', () => {
  assert.throws(
    () => buildTlsProbeConfig(
      'postgresql://opscore_runtime:secret@ep-example.neon.tech/opscore_acceptance',
      { ...strictEnv, OPSC_PG_SSL_REJECT_UNAUTHORIZED: 'false' }
    ),
    { code: 'TLS_PROBE_STRICT_TLS_REQUIRED' }
  );
});

test('direct endpoint rewrite explicitly sets sslmode=verify-full', () => {
  const rewritten = new URL(directEndpointUrl(
    'postgresql://opscore_runtime:secret@ep-example-pooler.neon.tech/opscore_acceptance?sslmode=disable&channel_binding=require',
    'ep-example.neon.tech'
  ));
  assert.equal(rewritten.hostname, 'ep-example.neon.tech');
  assert.equal(rewritten.searchParams.get('sslmode'), 'verify-full');
  assert.equal(rewritten.searchParams.get('channel_binding'), 'require');
});
