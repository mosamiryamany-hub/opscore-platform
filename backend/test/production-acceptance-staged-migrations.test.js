'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.resolve(__dirname, '../scripts/generate-production-acceptance-v1.js');
const source = fs.readFileSync(sourcePath, 'utf8');

describe('production acceptance staged preview migrations', () => {
  it('classifies signed_tenant_context files as staged preview-only', () => {
    assert.match(source, /function isStagedPreviewOnlyMigration/);
    assert.match(source, /PASS_WITH_STAGED_PREVIEW_MIGRATIONS/);
    assert.match(source, /productionBlockingPending/);
    assert.match(source, /stagedPreviewPendingFilenames/);
  });

  it('isStagedPreviewOnlyMigration matches only signed context series', () => {
    const fnMatch = source.match(/function isStagedPreviewOnlyMigration\(filename\) \{\n([\s\S]*?)\n\}/);
    assert.ok(fnMatch, 'helper present');
    const sandbox = { module: { exports: {} }, exports: {}, require, console, process, Buffer };
    vm.runInNewContext(
      `${fnMatch[0]}; module.exports = { isStagedPreviewOnlyMigration };`,
      sandbox,
      { filename: 'staged-helper.js' }
    );
    const { isStagedPreviewOnlyMigration } = sandbox.module.exports;
    assert.equal(isStagedPreviewOnlyMigration('063_signed_tenant_context_verifier.sql'), true);
    assert.equal(isStagedPreviewOnlyMigration('064_signed_tenant_context_work_orders_routing.sql'), true);
    assert.equal(isStagedPreviewOnlyMigration('062_autopilot_table_privilege_minimization.sql'), false);
    assert.equal(isStagedPreviewOnlyMigration('066_signed_tenant_context_verifier_search_path_hardening.sql'), true);
  });
});
