'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const store = fs.readFileSync(path.join(root, 'src/store.js'), 'utf8');
const envelope = fs.readFileSync(path.join(root, 'src/operation-envelope.js'), 'utf8');
const checks = [
  ['MAKE_DOMAIN_EVENT_IMPORTED', /makeDomainEvent/.test(store)],
  ['ACTIVITY_OUTBOX_USES_DOMAIN_EVENT', /const domainEvent = makeDomainEvent\([\s\S]*?JSON\.stringify\(domainEvent\)/.test(store)],
  ['SYNC_OUTBOX_USES_DOMAIN_EVENT', /const syncDomainEvent = makeDomainEvent\([\s\S]*?JSON\.stringify\(syncDomainEvent\)/.test(store)],
  ['DOMAIN_EVENT_SCHEMA_DEFINED', /opscore\.domain-event\.v1/.test(envelope)],
  ['DOMAIN_EVENT_HAS_TENANT', /organizationId/.test(envelope)],
  ['DOMAIN_EVENT_HAS_CORRELATION', /correlationId/.test(envelope)],
  ['DOMAIN_EVENT_HAS_CAUSATION', /causationId/.test(envelope)],
  ['DOMAIN_EVENT_HAS_AGGREGATE', /aggregateType[\s\S]*aggregateId/.test(envelope)]
];
const result = { schemaVersion:'opscore.domain-event-contract-gate.v1', decision:checks.every(([,pass])=>pass)?'PASS':'FAIL', checks:checks.map(([code,pass])=>({code,pass})) };
const out = path.join(root, 'docs', 'DOMAIN_EVENT_CONTRACT_GATE_RESULT.json');
fs.writeFileSync(out, JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(result.decision!=='PASS') process.exitCode=1;
