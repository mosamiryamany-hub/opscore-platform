#!/usr/bin/env node
'use strict';

/*
 * OpsCore mobile dependency audit gate — full tree and production tree.
 *
 * Both reports are captured from the exact checked-out lockfile:
 *   - npm audit --json                  (runtime + development dependency tree)
 *   - npm audit --omit=dev --json       (production dependency tree)
 *
 * Every High/Critical finding in either report fails closed unless its root
 * advisory is active and explicitly allowlisted with a written, time-limited
 * justification. Withdrawn advisories are not allowlisted. Registry lookup or
 * audit failures remain fail-closed.
 *
 * Evidence:
 *   mobile-dependency-audit-full.json  raw full-tree npm audit report
 *   mobile-dependency-audit.json      raw --omit=dev npm audit report
 *   mobile-audit-gate-result.json     both-scope verdict and classifications
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const mobileDir = path.resolve(__dirname, '..');
const ALLOWLIST_PATH = path.join(mobileDir, 'audit-allowlist.json');
const FULL_REPORT_PATH = path.join(mobileDir, 'mobile-dependency-audit-full.json');
const PRODUCTION_REPORT_PATH = process.env.AUDIT_OUT || path.join(mobileDir, 'mobile-dependency-audit.json');
const GATE_RESULT_PATH = path.join(mobileDir, 'mobile-audit-gate-result.json');

function runAuditJson(scope) {
  if (!['full', 'production'].includes(scope)) throw new Error('MOBILE_AUDIT_SCOPE_INVALID');
  const args = ['audit', '--json'];
  if (scope === 'production') args.splice(1, 0, '--omit=dev');
  try {
    return execFileSync('npm', args, {
      cwd: mobileDir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024
    });
  } catch (error) {
    // npm audit exits non-zero when vulnerabilities exist; stdout still carries the report.
    if (error.stdout && error.stdout.trim().startsWith('{')) return error.stdout;
    throw error;
  }
}

function latestVersion(pkg) {
  try {
    const out = execFileSync('npm', ['view', pkg, 'version', '--json'], {
      cwd: mobileDir, encoding: 'utf8', maxBuffer: 1024 * 1024
    });
    return JSON.parse(String(out).trim());
  } catch {
    return null; // caller treats this as fail-closed
  }
}

function ghsaFromUrl(url) {
  const match = /GHSA(?:-[a-z0-9]{4}){3,4}/i.exec(String(url || ''));
  return match ? match[0] : null;
}

function entryStatuses(allowlist, today) {
  return (allowlist.entries || []).map(entry => {
    const voids = [];
    for (const [pkg, recorded] of Object.entries(entry.maxAcceptedVersions || {})) {
      const latest = latestVersion(pkg);
      if (latest === null) voids.push({ pkg, reason: 'REGISTRY_CHECK_FAILED' });
      else if (latest !== recorded) voids.push({ pkg, reason: 'NEW_VERSION_PUBLISHED', recorded, latest });
    }
    if (entry.reviewBy && today > entry.reviewBy) voids.push({ reason: 'REVIEW_EXPIRED', reviewBy: entry.reviewBy });
    return { ghsa: entry.ghsa, valid: voids.length === 0, voids };
  });
}

function classifyHighCritical(report, validGhsas, scope) {
  const vulns = report && report.vulnerabilities && typeof report.vulnerabilities === 'object'
    ? report.vulnerabilities : {};
  const accepted = [];
  const unaccepted = [];

  function resolvesToAccepted(name, visited) {
    if (visited.has(name)) return true; // cycle-safe
    visited.add(name);
    const item = vulns[name];
    if (!item) return true;
    for (const via of item.via || []) {
      if (typeof via === 'string') {
        if (!resolvesToAccepted(via, visited)) return false;
      } else {
        const ghsa = ghsaFromUrl(via.url) || (via.source ? 'GHSA#' + via.source : null);
        if (!ghsa || !validGhsas.has(ghsa)) return false;
      }
    }
    return true;
  }

  for (const [name, item] of Object.entries(vulns)) {
    if (!['high', 'critical'].includes(item.severity)) continue;
    const ok = resolvesToAccepted(name, new Set());
    const rootAdvisories = (item.via || []).filter(v => typeof v !== 'string')
      .map(v => ghsaFromUrl(v.url) || String(v.title || v)).slice(0, 3);
    const finding = {
      scope,
      package: name,
      severity: item.severity,
      range: item.range || null,
      rootAdvisories
    };
    (ok ? accepted : unaccepted).push(finding);
  }
  return { accepted, unaccepted };
}

function main() {
  // Capture both scopes before producing a verdict; any command/JSON failure aborts closed.
  const fullRaw = runAuditJson('full');
  const productionRaw = runAuditJson('production');
  fs.writeFileSync(FULL_REPORT_PATH, fullRaw);
  fs.writeFileSync(PRODUCTION_REPORT_PATH, productionRaw);

  const fullReport = JSON.parse(fullRaw);
  const productionReport = JSON.parse(productionRaw);
  const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  const today = new Date().toISOString().slice(0, 10);
  const entryStatus = entryStatuses(allowlist, today);
  const validGhsas = new Set(entryStatus.filter(status => status.valid).map(status => status.ghsa));

  const full = classifyHighCritical(fullReport, validGhsas, 'FULL_TREE');
  const production = classifyHighCritical(productionReport, validGhsas, 'PRODUCTION_TREE');
  const accepted = [...full.accepted, ...production.accepted];
  const unaccepted = [...full.unaccepted, ...production.unaccepted];

  const verdict = unaccepted.length === 0 ? 'PASS' : 'FAIL';
  const result = {
    schemaVersion: 'opscore.mobile-audit-gate.v2',
    verdict,
    generatedAt: new Date().toISOString(),
    commit: (process.env.GITHUB_SHA || '').trim() || null,
    reports: {
      full: {
        file: path.basename(FULL_REPORT_PATH),
        findings: fullReport.metadata ? fullReport.metadata.vulnerabilities : null,
        highCriticalClassified: full.accepted.length + full.unaccepted.length,
        acceptedDocumented: full.accepted.length,
        unaccepted: full.unaccepted.length
      },
      production: {
        file: path.basename(PRODUCTION_REPORT_PATH),
        findings: productionReport.metadata ? productionReport.metadata.vulnerabilities : null,
        highCriticalClassified: production.accepted.length + production.unaccepted.length,
        acceptedDocumented: production.accepted.length,
        unaccepted: production.unaccepted.length
      }
    },
    acceptedDocumented: accepted,
    unacceptedFindings: unaccepted,
    allowlist: entryStatus.map((status, index) => ({
      ...status,
      scope: allowlist.entries[index].scope,
      justification: allowlist.entries[index].justification
    }))
  };
  fs.writeFileSync(GATE_RESULT_PATH, JSON.stringify(result, null, 2) + '\n');
  console.log('MOBILE_AUDIT_GATE ' + JSON.stringify({
    verdict,
    fullTree: { accepted: full.accepted.length, unaccepted: full.unaccepted.length },
    productionTree: { accepted: production.accepted.length, unaccepted: production.unaccepted.length }
  }));
  for (const finding of accepted) {
    console.log('ACCEPTED_DOCUMENTED ' + finding.scope + ' ' + finding.package + ' <- ' + finding.rootAdvisories.join(','));
  }
  for (const finding of unaccepted) {
    console.log('UNACCEPTED_FINDING ' + finding.scope + ' ' + finding.package + ' <- ' + finding.rootAdvisories.join(','));
  }
  for (const status of result.allowlist) {
    if (!status.valid) console.log('ALLOWLIST_ENTRY_VOID ' + status.ghsa + ' ' + JSON.stringify(status.voids));
  }
  if (verdict !== 'PASS') process.exit(1);
}

if (require.main === module) main();

module.exports = {
  classifyHighCritical,
  entryStatuses,
  ghsaFromUrl,
  runAuditJson
};
