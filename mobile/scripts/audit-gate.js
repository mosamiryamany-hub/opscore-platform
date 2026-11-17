#!/usr/bin/env node
'use strict';

/*
 * OpsCore mobile dependency audit gate — documented, self-expiring risk acceptance.
 *
 * Policy (see mobile/audit-allowlist.json):
 *  - Any high/critical npm-audit finding FAILS the gate unless its root advisory
 *    is explicitly allowlisted with a written justification.
 *  - An allowlist entry stays valid only while:
 *      (a) today <= reviewBy, and
 *      (b) the recorded maxAcceptedVersion still equals the latest published
 *          version on the npm registry (auto-void otherwise).
 *  - A voided or expired entry stops accepting its findings immediately: the
 *    gate fails with AUTO_VOID / EXPIRED, forcing a documented re-review
 *    (upgrade, or renew the exception with new justification). Nothing is
 *    silenced silently; every accepted finding is printed with its GHSA id.
 *  - If the registry version check itself fails, the gate FAILS closed.
 *
 * Outputs:
 *  - mobile-dependency-audit.json     raw npm audit report (npm format, evidence)
 *  - mobile-audit-gate-result.json    classification envelope (verdict + reasons)
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const mobileDir = path.resolve(__dirname, '..');
const ALLOWLIST_PATH = path.join(mobileDir, 'audit-allowlist.json');
const REPORT_PATH = process.env.AUDIT_OUT || path.join(mobileDir, 'mobile-dependency-audit.json');
const GATE_RESULT_PATH = path.join(mobileDir, 'mobile-audit-gate-result.json');

function runAuditJson() {
  try {
    return execFileSync('npm', ['audit', '--omit=dev', '--json'], {
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

function main() {
  const raw = runAuditJson();
  fs.writeFileSync(REPORT_PATH, raw);
  const report = JSON.parse(raw);
  const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  const today = new Date().toISOString().slice(0, 10);

  // Validate entry currency (fail-closed on registry check failure).
  const entryStatus = (allowlist.entries || []).map(entry => {
    const voids = [];
    for (const [pkg, recorded] of Object.entries(entry.maxAcceptedVersions || {})) {
      const latest = latestVersion(pkg);
      if (latest === null) voids.push({ pkg, reason: 'REGISTRY_CHECK_FAILED' });
      else if (latest !== recorded) voids.push({ pkg, reason: 'NEW_VERSION_PUBLISHED', recorded, latest });
    }
    if (entry.reviewBy && today > entry.reviewBy) voids.push({ reason: 'REVIEW_EXPIRED', reviewBy: entry.reviewBy });
    return { ghsa: entry.ghsa, valid: voids.length === 0, voids };
  });
  const validGhsas = new Set(entryStatus.filter(s => s.valid).map(s => s.ghsa));

  const vulns = report.vulnerabilities || {};
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
    (ok ? accepted : unaccepted).push({ package: name, severity: item.severity, range: item.range || null, rootAdvisories });
  }

  const verdict = unaccepted.length === 0 ? 'PASS' : 'FAIL';
  const result = {
    schemaVersion: 'opscore.mobile-audit-gate.v1',
    verdict,
    generatedAt: new Date().toISOString(),
    commit: (process.env.GITHUB_SHA || '').trim() || null,
    findings: report.metadata ? report.metadata.vulnerabilities : null,
    acceptedDocumented: accepted,
    unacceptedFindings: unaccepted,
    allowlist: entryStatus.map((s, i) => ({
      ...s,
      scope: allowlist.entries[i].scope,
      justification: allowlist.entries[i].justification
    }))
  };
  fs.writeFileSync(GATE_RESULT_PATH, JSON.stringify(result, null, 2) + '\n');
  console.log('MOBILE_AUDIT_GATE ' + JSON.stringify({ verdict, accepted: accepted.length, unaccepted: unaccepted.length }));
  for (const a of accepted) console.log('ACCEPTED_DOCUMENTED ' + a.package + ' <- ' + a.rootAdvisories.join(','));
  for (const u of unaccepted) console.log('UNACCEPTED_FINDING ' + u.package + ' <- ' + u.rootAdvisories.join(','));
  for (const s of result.allowlist) if (!s.valid) console.log('ALLOWLIST_ENTRY_VOID ' + s.ghsa + ' ' + JSON.stringify(s.voids));
  if (verdict !== 'PASS') process.exit(1);
}

main();
