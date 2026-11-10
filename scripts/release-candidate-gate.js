#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend');
const mobile = path.join(root, 'mobile');
const gates = [
  ['api-inventory', path.join(backend, 'scripts', 'api-inventory.js')],
  ['openapi-sync', path.join(backend, 'scripts', 'sync-openapi-inventory.js')],
  ['sector-neutrality', path.join(backend, 'scripts', 'sector-neutrality-gate.js')],
  ['console-coverage', path.join(root, 'scripts', 'console-coverage-report.js')],
  ['postgres-parity', path.join(backend, 'scripts', 'postgres-parity-check.js')],
  ['migration-preflight', path.join(backend, 'scripts', 'migration-preflight.js')],
  ['security-red-team', path.join(backend, 'scripts', 'red-team-transaction-audit.js')],
  ['mutation-boundary', path.join(backend, 'scripts', 'mutation-boundary-gate.js')],
  ['backup-verification', path.join(backend, 'scripts', 'backup-verify-selftest.js')],
  ['recovery-gate', path.join(backend, 'scripts', 'recovery-gate.js')],
  ['export-verification', path.join(backend, 'scripts', 'export-verify-selftest.js')],
  ['production-readiness', path.join(backend, 'scripts', 'production-readiness.js')],
  ['resilience', path.join(backend, 'scripts', 'resilience-gate.js')],
  ['buyer-self-validation', path.join(backend, 'scripts', 'buyer-self-validation.js')],
  ['buyer-preflight', path.join(backend, 'scripts', 'buyer-preflight.js')],
  ['mobile-verification', path.join(mobile, 'scripts', 'verify-mobile.js')],
  ['pre-infrastructure-final-evidence', path.join(backend, 'scripts', 'pre-infrastructure-final-evidence-gate.js')],
  ['release-documentation', path.join(root, 'scripts', 'release-doc-gate.js')],
  ['sbom-generation', path.join(root, 'scripts', 'generate-sbom.js')],
  ['sbom-verification', path.join(root, 'scripts', 'verify-sbom.js')],
  ['release-artifact-gate', path.join(root, 'scripts', 'release-artifact-gate.js')]
];
const results = [];
const testEvidencePath = path.join(backend, 'docs', 'verification', 'RELEASE_TEST_RUN_RESULT.json');
let testEvidence = null;
try { testEvidence = JSON.parse(fs.readFileSync(testEvidencePath, 'utf8')); } catch {}
if (testEvidence?.status === 'PASS' && testEvidence.failedTests === 0 && testEvidence.totalTests > 0)
  results.push({ id: 'backend-regression', status: 'PASS', evidence: `${testEvidence.totalTests} tests / ${testEvidence.failedTests} failures` });
else
  results.push({ id: 'backend-regression', status: 'FAIL', evidence: 'Missing or failed RELEASE_TEST_RUN_RESULT.json' });
for (const [id, script] of gates) {
  if (results.some(x => x.id === 'backend-regression' && x.status === 'FAIL')) break;
  try {
    cp.execFileSync(process.execPath, [script], { cwd: root, stdio: 'inherit', env: { ...process.env, OPSC_RELEASE_TEST_CONCURRENCY: process.env.OPSC_RELEASE_TEST_CONCURRENCY || '12' } });
    results.push({ id, status: 'PASS' });
  } catch (e) {
    results.push({ id, status: 'FAIL', code: e.status ?? null });
    break;
  }
}
let productionReadiness = null;
try {
  const p = path.join(root, 'docs', 'verification', 'PRODUCTION_READINESS_RESULT.json');
  if (fs.existsSync(p)) productionReadiness = JSON.parse(fs.readFileSync(p, 'utf8'));
} catch {}
const failure = results.find(x => x.status === 'FAIL');
const status = failure ? 'FAIL' : productionReadiness?.status === 'CONDITIONAL' ? 'PASS_WITH_CONDITIONALS' : 'PASS';
const report = {
  schemaVersion: 'opscore.release-candidate-gate.v2',
  generatedAt: new Date().toISOString(),
  release: JSON.parse(fs.readFileSync(path.join(backend, 'package.json'), 'utf8')).version,
  status,
  results,
  conditions: productionReadiness?.status === 'CONDITIONAL' ? (productionReadiness.checks || []).filter(x => x.status === 'UNVERIFIED' || x.status === 'REMAINING') : [],
  note: 'PASS_WITH_CONDITIONALS is not production certification; infrastructure-bound checks remain explicitly unverified until exercised in the target environment.'
};
fs.mkdirSync(path.join(root, 'docs', 'verification'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs', 'verification', 'RELEASE_CANDIDATE_GATE_RESULT.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = failure ? 1 : 0;
