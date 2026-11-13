'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SOURCE_DATABASE,
  TARGET_DATABASE,
  REQUIRED_EXTENSIONS,
  parseLocalDatabaseUrl,
  buildPgPassLine,
  filterExtensionToc,
  stableJson
} = require('../scripts/postgres-logical-restore-drill');

test('restore drill binds only the two named localhost disposable databases', () => {
  assert.equal(SOURCE_DATABASE, 'opscore_http_acceptance');
  assert.equal(TARGET_DATABASE, 'opscore_restore_target');
  const source = parseLocalDatabaseUrl(
    'postgresql://neondb_owner:secret@127.0.0.1:5432/opscore_http_acceptance',
    SOURCE_DATABASE
  );
  assert.equal(source.hostname, '127.0.0.1');
  assert.throws(() => parseLocalDatabaseUrl(
    'postgresql://neondb_owner:secret@neon.example:5432/opscore_http_acceptance',
    SOURCE_DATABASE
  ), /RESTORE_DATABASE_TARGET_NOT_ALLOWED/);
  assert.throws(() => parseLocalDatabaseUrl(
    'postgresql://neondb_owner:secret@127.0.0.1:5432/postgres',
    SOURCE_DATABASE
  ), /RESTORE_DATABASE_TARGET_NOT_ALLOWED/);
  assert.throws(() => parseLocalDatabaseUrl(
    'postgresql://postgres:secret@127.0.0.1:5432/opscore_http_acceptance',
    SOURCE_DATABASE
  ), /RESTORE_DATABASE_TARGET_NOT_ALLOWED/);
});

test('pgpass serializer escapes field separators and line breaks', () => {
  const url = new URL('postgresql://neondb_owner:p%3A%5Cword@127.0.0.1:5432/opscore_http_acceptance');
  assert.equal(
    buildPgPassLine(url),
    '127.0.0.1:5432:opscore_http_acceptance:neondb_owner:p\\:\\word'
  );
});

test('restore TOC excludes only pre-provisioned extension definitions', () => {
  const toc = [
    '; Archive created at 2026-11-13',
    '2; 3079 2615 EXTENSION - pgcrypto',
    '3; 0 0 COMMENT - EXTENSION pgcrypto',
    '4; 16384 2615 EXTENSION - postgis',
    '5; 0 0 COMMENT - EXTENSION postgis',
    '6; 16385 2615 EXTENSION - vector',
    '7; 0 0 COMMENT - EXTENSION vector',
    '8; 2200 0 SCHEMA - public neondb_owner',
    '9; 16390 1259 TABLE public example neondb_owner'
  ].join('\\n');

  const result = filterExtensionToc(toc);
  assert.equal(result.removedCreate, REQUIRED_EXTENSIONS.length);
  assert.equal(result.removedComments, REQUIRED_EXTENSIONS.length);
  assert.match(result.text, /SCHEMA - public/);
  assert.match(result.text, /TABLE public example/);
  assert.doesNotMatch(result.text, /EXTENSION - (?:pgcrypto|postgis|vector)/);
});

test('restore TOC fails closed when an expected extension definition is missing', () => {
  const toc = [
    '2; 3079 2615 EXTENSION - pgcrypto',
    '4; 16384 2615 EXTENSION - postgis'
  ].join('\\n');
  assert.throws(() => filterExtensionToc(toc), /RESTORE_TOC_EXTENSION_FILTER_INCOMPLETE/);
});

test('stable JSON compares nested objects without depending on key insertion order', () => {
  assert.equal(stableJson({ b: 2, a: { d: 4, c: 3 } }), stableJson({ a: { c: 3, d: 4 }, b: 2 }));
});
