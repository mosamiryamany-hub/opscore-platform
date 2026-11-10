#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDb } = require('../src/db');
const { Store } = require('../src/store');
const config = require('../src/config');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
function main() {
  const demoPassword = String(process.env.OPSC_DEMO_PASSWORD_OWNER || '');
  if (demoPassword.length < 12) throw new Error('OPSC_DEMO_PASSWORD_OWNER_REQUIRED');
  const command = process.argv[2];
  if (command !== 'demo') {
    console.error('Usage: opscore demo --scenario <name>');
    process.exitCode = 2;
    return;
  }
  const scenario = arg('--scenario', 'cascading-worker-failure');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-demo-'));
  const dbPath = path.join(dir, 'demo.sqlite');
  const db = openDb(dbPath);
  try {
    const store = new Store(db, { ...config, sqlitePath: dbPath });
    const boot = store.bootstrap({
      orgName: 'OpsCore Evidence Demo',
      email: 'demo-owner@example.test',
      password: demoPassword
    });
    const ctx = { ...boot, organizationId: boot.orgId, role: 'owner' };
    const simulation = store.simulateOperationalScenario(ctx, { scenario, rollback: false });
    const proposals = store.generateAutopilotProposals(ctx, { incidentRef: `DEMO-${scenario}` });
    const actions = [];
    for (const p of proposals.proposals) {
      store.approveAutopilotProposal(ctx, p.id);
      const executed = store.executeAutopilotProposal(ctx, p.id);
      const workerResolved = p.actionType === 'requeue_stale_worker_jobs' &&
        store.detectOperationalFabric(ctx).staleProcessingJobs === 0;
      const status = p.actionType === 'requeue_stale_worker_jobs' ? (workerResolved ? 'resolved' : 'partial') : 'unverified';
      const outcome = store.recordAutopilotOutcome(ctx, {
        proposalId: p.id,
        outcomeStatus: status,
        recoveryTimeMs: Math.max(0, Date.now() - Date.parse(simulation.after.generatedAt)),
        evidence: { executedStatus: executed.status, verification: workerResolved ? 'stale leases cleared' : 'action executed; recovery not automatically inferred' }
      });
      actions.push({ actionType: p.actionType, proposalId: p.id, outcomeStatus: outcome.outcomeStatus });
    }
    const graph = store.buildCausalEvidenceGraph(ctx, { incidentRef: `DEMO-${scenario}` });
    const learning = store.learningLoop(ctx, { limit: 100 });
    const finalSignals = store.detectOperationalFabric(ctx);
    console.log(JSON.stringify({
      schemaVersion: 'opscore.demo.v1',
      scenario,
      temporaryDatabase: dbPath,
      approvalSimulated: true,
      stages: {
        observe: simulation.before,
        simulate: simulation.after,
        decide: { proposalCount: proposals.proposals.length, blocked: proposals.blocked },
        approveAndAct: actions,
        learn: learning,
        causalEvidenceGraph: { id: graph.id, graphSha256: graph.graphSha256, summary: graph.summary },
        finalSignals: finalSignals.detected
      },
      truthBoundary: 'Local deterministic demonstration only. It does not certify production infrastructure or external dependencies.'
    }, null, 2));
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main();
