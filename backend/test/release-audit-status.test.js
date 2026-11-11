'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeAuditStatus, describeAuditResidual } = require('../../scripts/release-audit-status');

test('zero findings are represented as zero findings, not moderate/low residuals', () => {
  const summary = { total: 0, info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  assert.equal(summarizeAuditStatus(summary), 'PASS_ZERO_FINDINGS');
  assert.match(describeAuditResidual('Mobile', summary), /0 findings across info\/low\/moderate\/high\/critical/);
});

test('non-blocking findings remain explicitly disclosed', () => {
  const summary = { total: 2, info: 0, low: 1, moderate: 1, high: 0, critical: 0 };
  assert.equal(summarizeAuditStatus(summary), 'PASS_WITH_DISCLOSED_ADVISORIES');
  assert.match(describeAuditResidual('Mobile', summary), /1 moderate; 1 low/);
});

test('high and critical findings block release status', () => {
  const summary = { total: 2, info: 0, low: 0, moderate: 0, high: 1, critical: 1 };
  assert.equal(summarizeAuditStatus(summary), 'FAIL_BLOCKING_ADVISORIES');
  assert.match(describeAuditResidual('Mobile', summary), /Release is blocked/);
});

test('malformed dependency audit summaries fail closed', () => {
  assert.throws(() => summarizeAuditStatus({ total: '0' }), /DEPENDENCY_AUDIT_SUMMARY_INVALID/);
});
