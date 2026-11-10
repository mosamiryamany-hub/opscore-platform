'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.join(__dirname,'..');
function readJson(name){return JSON.parse(fs.readFileSync(path.join(ROOT,'docs',name),'utf8'));}

test('current write-method boundary is fully classified and source-backed',()=>{
  const policy=readJson('MUTATION_ROUTE_POLICY_RESULT.json');
  assert.equal(policy.entries.length,36);
  assert.equal(policy.decision,'PASS');
  assert.equal(policy.summary.contractPresent,36);
});

test('red-team semantic review accepts current lines by SHA without unresolved findings',()=>{
  const r=readJson('RED_TEAM_TRANSACTION_AUDIT_RESULT.json');
  assert.equal(r.decision,'PASS');
  assert.equal(r.checks.staleSemanticReviewEntries,0);
  assert.equal(r.findings.length,0);
  assert.ok(r.checks.semanticallyReviewedScopeFindings>0);
});

test('outbox writers are explicitly classified without converting simulation fixtures into fake domain events',()=>{
  const r=readJson('OUTBOX_DOMAIN_EVENT_INVENTORY_RESULT.json');
  assert.equal(r.decision,'PASS');
  assert.equal(r.writerCount,3);
  assert.ok(r.writers.some(x=>x.id==='simulation-fixtures' && x.compliant));
});
