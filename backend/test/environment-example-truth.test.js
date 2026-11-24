'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const example = fs.readFileSync(
  path.join(__dirname, '..', '.env.example'),
  'utf8'
);

test('environment example is clearly development-only and does not fake production release evidence', () => {
  assert.match(example, /^NODE_ENV=development$/m);
  assert.match(example, /^DATABASE_ENGINE=sqlite$/m);
  assert.match(example, /^SQLITE_PATH=\.\/data\/opscore\.sqlite$/m);
  assert.match(example, /NOT a production deployment profile/i);
  assert.match(example, /self-hosted Production is not yet qualified/i);
  assert.doesNotMatch(example, /^\s*VERCEL_ENV\s*=/m);
  assert.doesNotMatch(example, /^\s*OPSC_RELEASE_VERIFIED\s*=\s*true\s*$/m);
  assert.doesNotMatch(example, /^\s*OPSC_PRODUCTION_HOLD\s*=\s*false\s*$/m);
  assert.doesNotMatch(example, /^\s*OPSC_SIGNED_TENANT_CONTEXT_PRODUCTION_ENABLED\s*=\s*true\s*$/m);
});

test('environment example states the strict PostgreSQL production TLS boundary', () => {
  assert.match(example, /Production PostgreSQL requires OPSC_PG_SSL_MODE=verify-full/);
  assert.match(example, /certificate verification enabled/);
  assert.doesNotMatch(example, /^\s*OPSC_PG_SSL_MODE\s*=\s*require\s*$/m);
});

test('environment example supplies no live provider credential', () => {
  for (const name of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) {
    assert.doesNotMatch(example, new RegExp('^\\s*' + name + '\\s*=\\s*[^#\\s].*$', 'm'));
  }
});
