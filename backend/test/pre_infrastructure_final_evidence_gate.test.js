'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const tmp = require('node:os').tmpdir();
const script = path.join(__dirname, '..', 'scripts', 'pre-infrastructure-final-evidence-gate.js');
const resultPath = path.join(__dirname, '..', 'docs', 'PRE_INFRASTRUCTURE_FINAL_EVIDENCE_GATE_RESULT.json');

test('unified pre-infrastructure evidence gate is PASS with explicit infrastructure limits', () => {
  const tempDir = fs.mkdtempSync(path.join(tmp, 'opscore-preinfra-evidence-'));
  const evidencePath = path.join(tempDir, 'PRE_INFRA_TEST_EXECUTION_RESULT.json');
  const tempResultPath = path.join(tempDir, 'PRE_INFRASTRUCTURE_FINAL_EVIDENCE_GATE_RESULT.json');
  const fixture = {
    schemaVersion: 'opscore.pre-infra-test-execution.fixture.v1',
    release: require('../package.json').version,
    generatedAt: new Date().toISOString(),
    nodeVersion: process.versions.node,
    declaredNodeEngine: require('../package.json').engines.node,
    tests: 1,
    passed: 1,
    failed: 0,
    skipped: 0,
    status: 'PASS',
    runtimeMinimumSatisfied: false,
    productionCertification: false
  };
  fs.writeFileSync(evidencePath, JSON.stringify(fixture, null, 2) + '\n');
  try {
    const r = cp.spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', env: { ...process.env, OPSC_PRE_INFRA_TEST_EVIDENCE_PATH: evidencePath, OPSC_PRE_INFRA_FINAL_EVIDENCE_PATH: tempResultPath } });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const report = JSON.parse(fs.readFileSync(tempResultPath, 'utf8'));
    assert.equal(report.decision, 'PASS');
    assert.equal(report.productionCertification, false);
    assert.ok(report.checks.some(x => x.id === 'red-team-transaction-audit' && x.status === 'PASS'));
    assert.ok(report.checks.some(x => x.id === 'domain-event-contract-gate' && x.status === 'PASS'));
    assert.ok(report.limitations.some(x => x.includes('PostgreSQL/RLS')));
    assert.ok(report.limitations.some(x => x.includes('OIDC/JWKS')));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
