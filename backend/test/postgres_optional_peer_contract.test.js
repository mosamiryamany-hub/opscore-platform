'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const pkg = require('../package.json');
const lock = require('../package-lock.json');
const { createPostgresPool } = require('../src/adapters/postgres');

test('PostgreSQL driver is a pinned direct runtime dependency in package and lockfile', () => {
  assert.equal(pkg.dependencies?.pg, '8.23.1');
  assert.equal(pkg.peerDependencies?.pg, undefined);
  assert.equal(pkg.peerDependenciesMeta?.pg, undefined);
  assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies);
  assert.equal(lock.packages['node_modules/pg']?.version, '8.23.1');
  assert.equal(lock.packages['node_modules/pg']?.resolved, 'https://registry.npmjs.org/pg/-/pg-8.23.1.tgz');
});

test('PostgreSQL adapter fails closed if the pinned runtime driver is unavailable', () => {
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'pg') {
      const error = new Error("Cannot find module 'pg'");
      error.code = 'MODULE_NOT_FOUND';
      throw error;
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    assert.throws(
      () => createPostgresPool({ connectionString: 'postgres://example.invalid/opscore' }),
      error => error.message === 'POSTGRES_DRIVER_MISSING: install pg before using the PostgreSQL adapter'
    );
  } finally {
    Module._load = originalLoad;
  }
});
