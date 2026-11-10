#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const backend = path.join(root, 'backend');
const docs = path.join(backend, 'docs');
const pkg = JSON.parse(fs.readFileSync(path.join(backend, 'package.json'), 'utf8'));

function readJson(name) {
  const p = path.join(docs, name);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function check(id, ok, evidence, statusOverride = null) {
  return { id, status: statusOverride || (ok ? 'PASS' : 'FAIL'), evidence };
}

const checks = [];
const testEvidencePath = process.env.OPSC_PRE_INFRA_TEST_EVIDENCE_PATH || path.join(docs, 'PRE_INFRA_TEST_EXECUTION_RESULT.json');
const execution = fs.existsSync(testEvidencePath)
  ? JSON.parse(fs.readFileSync(testEvidencePath, 'utf8'))
  : null;

const red = readJson('RED_TEAM_TRANSACTION_AUDIT_RESULT.json');
const route = readJson('MUTATION_ROUTE_POLICY_RESULT.json');
const boundary = readJson('MUTATION_BOUNDARY_GATE_RESULT.json');
const internal = readJson('INTERNAL_MUTATION_BOUNDARY_RESULT.json');
const outbox = readJson('OUTBOX_DOMAIN_EVENT_INVENTORY_RESULT.json');
const domain = readJson('DOMAIN_EVENT_CONTRACT_GATE_RESULT.json');
const api = readJson('API_SECURITY_CONTRACT_GATE_RESULT.json');
const sbom = fs.existsSync(path.join(root, 'docs', 'sbom', `opscore-v${pkg.version}.cyclonedx.json`)) && fs.existsSync(path.join(root, 'docs', 'sbom', 'SBOM_GENERATION_RESULT.json'))
  ? JSON.parse(fs.readFileSync(path.join(root, 'docs', 'sbom', 'SBOM_GENERATION_RESULT.json'), 'utf8')) : null;

checks.push(check(
  'backend-test-execution',
  !!execution && execution.status === 'PASS' && execution.failed === 0 && execution.passed === execution.tests && execution.tests > 0,
  execution || 'missing PRE_INFRA_TEST_EXECUTION_RESULT.json'
));
checks.push(check(
  'red-team-transaction-audit',
  red.decision === 'PASS' && red.findings.length === 0 && red.checks.unwrappedMutationRoutes === 0 && red.checks.staleSemanticReviewEntries === 0,
  `decision=${red.decision}; unwrapped=${red.checks.unwrappedMutationRoutes}; staleReview=${red.checks.staleSemanticReviewEntries}; findings=${red.findings.length}`
));
checks.push(check(
  'mutation-route-policy',
  route.decision === 'PASS' && route.entries.length === route.summary.total && route.summary.contractPresent === route.summary.total,
  `decision=${route.decision}; routes=${route.summary.total}; contracts=${route.summary.contractPresent}; mutating=${route.summary.mutating}; async=${route.summary.asyncIdempotencyRequired}`
));
checks.push(check(
  'mutation-boundary-gate',
  boundary.status === 'PASS' && boundary.notCovered.length === 0,
  `status=${boundary.status}; idempotent=${boundary.idempotentWriteBoundaries}; async=${boundary.asyncIdempotencyBoundaries}; uncovered=${boundary.notCovered.length}`
));
checks.push(check(
  'internal-mutation-boundary',
  internal.decision === 'PASS' && internal.covered === internal.total && internal.unresolved.length === 0,
  `decision=${internal.decision}; covered=${internal.covered}/${internal.total}; unresolved=${internal.unresolved.length}`
));
checks.push(check(
  'outbox-domain-event-inventory',
  outbox.decision === 'PASS' && outbox.writerCount === outbox.writers.length && outbox.writers.every(w => w.compliant === true),
  `decision=${outbox.decision}; writers=${outbox.writerCount}; allClassified=${outbox.writers.every(w => w.compliant === true)}`
));
checks.push(check(
  'domain-event-contract-gate',
  domain.decision === 'PASS' && domain.checks.every(c => c.pass === true),
  `decision=${domain.decision}; checks=${domain.checks.length}; failed=${domain.checks.filter(c => c.pass !== true).length}`
));
checks.push(check(
  'api-security-contract-gate',
  api.status === 'PASS' && api.failed.length === 0,
  `status=${api.status}; failed=${api.failed.length}`
));
checks.push(check(
  'deterministic-sbom',
  !!sbom && sbom.status === 'PASS' && sbom.format === 'CycloneDX 1.6',
  sbom || 'missing committed SBOM evidence'
));
checks.push(check(
  'provenance-manifest-present',
  fs.existsSync(path.join(backend, 'SALES_PACKAGE_MANIFEST.json')) && fs.existsSync(path.join(backend, 'RELEASE_FILE_SHA256SUMS.txt')) && fs.existsSync(path.join(backend, 'RELEASE_COMPONENT_SHA256SUMS.txt')),
  'backend provenance manifest and checksum files are present; final staged package verification remains a separate release gate'
));

const runtimeRequired = String(pkg.engines && pkg.engines.node || '').trim() || 'UNDECLARED';
const runtimeVersion = process.versions.node;
const runtimeParts = /^>=(\d+)\.(\d+)\.(\d+) <(\d+)$/.exec(runtimeRequired);
const cur = runtimeVersion.split('.').map(Number);
const min = runtimeParts ? runtimeParts.slice(1,4).map(Number) : [0,0,0];
const lowerSatisfied = cur[0] > min[0] || (cur[0] === min[0] && (cur[1] > min[1] || (cur[1] === min[1] && cur[2] >= min[2])));
const upperSatisfied = runtimeParts ? cur[0] < Number(runtimeParts[4]) : false;
const runtimeBelow = !(lowerSatisfied && upperSatisfied);
checks.push(check(
  'execution-runtime-minimum',
  !runtimeBelow,
  `current executor Node ${runtimeVersion}; declared backend engine ${runtimeRequired}`,
  runtimeBelow ? 'LIMITED' : null
));

const limitations = [
  ...(runtimeBelow ? [`Current executor Node ${runtimeVersion} is outside the declared backend engine ${runtimeRequired}; runtime certification remains UNVERIFIED.`] : []),
  'Live PostgreSQL/RLS tenant isolation and transaction-concurrency proof are UNVERIFIED until real infrastructure is connected.',
  'Live OIDC/JWKS identity-provider verification is UNVERIFIED until a real identity provider is configured.',
  'TLS/reverse-proxy/WAF/network-segmentation and distributed shared rate-limit behavior are deployment-bound and UNVERIFIED.',
  'External provider live behavior, hosted CI cryptographic attestation, and physical mobile signing/device validation remain UNVERIFIED.'
];

const status = checks.some(c => c.status === 'FAIL') ? 'FAIL' : 'PASS';
const report = {
  schemaVersion: 'opscore.pre-infrastructure-final-evidence-gate.v1',
  release: pkg.version,
  generatedAt: execution?.generatedAt || new Date().toISOString(),
  decision: status,
  evidenceBoundary: 'SOURCE_STATIC_DETERMINISTIC_PLUS_RECORDED_LOCAL_TEST_EXECUTION',
  checks,
  limitations,
  freezeRule: 'No feature expansion before real database/infrastructure verification unless a concrete defect, security finding, integration requirement, or buyer acceptance requirement is identified.',
  productionCertification: false
};
const out = process.env.OPSC_PRE_INFRA_FINAL_EVIDENCE_PATH || path.join(docs, 'PRE_INFRASTRUCTURE_FINAL_EVIDENCE_GATE_RESULT.json');
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = status === 'FAIL' ? 1 : 0;
