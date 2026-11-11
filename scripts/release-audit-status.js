'use strict';

function summarizeAuditStatus(summary) {
  if (!summary || !Number.isSafeInteger(summary.total) || summary.total < 0) {
    throw new Error('DEPENDENCY_AUDIT_SUMMARY_INVALID');
  }
  if (summary.high > 0 || summary.critical > 0) return 'FAIL_BLOCKING_ADVISORIES';
  if (summary.total === 0) return 'PASS_ZERO_FINDINGS';
  return 'PASS_WITH_DISCLOSED_ADVISORIES';
}

function describeAuditResidual(name, summary) {
  const status = summarizeAuditStatus(summary);
  if (status === 'PASS_ZERO_FINDINGS') {
    return name + ' dependency audit: 0 findings across info/low/moderate/high/critical on the exact locked tree.';
  }
  if (status === 'FAIL_BLOCKING_ADVISORIES') {
    return name + ' dependency audit: ' + summary.total + ' total; ' + summary.high + ' high; ' + summary.critical + ' critical. Release is blocked.';
  }
  return name + ' dependency audit: ' + summary.total + ' total; ' + summary.high + ' high; ' + summary.critical + ' critical; ' + summary.moderate + ' moderate; ' + summary.low + ' low. Non-blocking findings are disclosed.';
}

module.exports = { summarizeAuditStatus, describeAuditResidual };
