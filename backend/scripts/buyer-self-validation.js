#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..', '..');
const backend = path.join(root, 'backend');
const demoEnv = { OPSC_DEMO_PASSWORD_OWNER: 'BuyerDemoOwner-2026!' };
const results = [];
function add(id, status, detail, evidence = null) { results.push({ id, status, detail, evidence }); }
function runNode(script, args = [], extraEnv = {}) {
  try {
    const out = cp.execFileSync(process.execPath, [script, ...args], { cwd: backend, encoding: 'utf8', stdio: ['ignore','pipe','pipe'], env: { ...process.env, ...extraEnv } });
    return { ok: true, out };
  } catch (e) { return { ok: false, out: String(e.stdout || e.stderr || e.message || e) }; }
}
const acceptance = runNode('scripts/buyer-acceptance.js');
add('buyer-acceptance-harness', acceptance.ok ? 'PASS' : 'FAIL', acceptance.ok ? 'Existing buyer acceptance harness completed.' : 'Buyer acceptance harness failed.', acceptance.out.slice(-3000));
for (const scenario of ['cascading-worker-failure','dependency-outage','worker-degradation']) {
  const demo = runNode('bin/opscore.js', ['demo', '--scenario', scenario], demoEnv);
  add(`demo-scenario:${scenario}`, demo.ok ? 'PASS' : 'FAIL', demo.ok ? 'End-to-end evidence-governed demo completed.' : 'Demo failed.', demo.ok ? JSON.parse(demo.out) : demo.out.slice(-2000));
}
const documents = [
  'docs/commercial/BUYER_EVALUATION.md','docs/00-START-HERE/DEMO_SCRIPT.md','docs/commercial/BUYER_INSTALLATION_GUIDE.md','docs/00-START-HERE/VALUE_PROOF.md',
  'docs/BUYER_INSTALLATION_VERIFICATION.json','docs/security/SECURITY.md','docs/security/SECURITY_THREAT_MODEL.md'
];
for (const rel of documents) add(`buyer-artifact:${rel}`, fs.existsSync(path.join(root, rel)) ? 'PASS' : 'FAIL', 'Buyer-facing evidence artifact presence.');
const fail = results.filter(x => x.status === 'FAIL');
const report = {
  schemaVersion: 'opscore.buyer-self-validation.v1',
  generatedAt: new Date().toISOString(),
  release: require('../package.json').version,
  status: fail.length ? 'FAIL' : 'PASS',
  results,
  truthBoundary: 'This is an internal, reproducible buyer-style validation. It is not evidence from an independent customer or proof of production deployment acceptance.'
};
const out = path.join(root, 'docs', 'verification', 'BUYER_SELF_VALIDATION_RESULT.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exit(fail.length ? 1 : 0);
