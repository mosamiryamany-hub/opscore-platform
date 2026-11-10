'use strict';
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const src=path.join(ROOT,'src');
const store=fs.readFileSync(path.join(src,'store.js'),'utf8');
const fabric=fs.readFileSync(path.join(src,'operational-intelligence-fabric.js'),'utf8');
const writers=[
  {
    id:'store.activity',
    file:'backend/src/store.js',
    marker:'INSERT INTO integration_outbox',
    evidence:'_activity constructs makeDomainEvent before insert',
    compliant:store.includes('const domainEvent = makeDomainEvent({') && store.includes('JSON.stringify(domainEvent)')
  },
  {
    id:'store.sync',
    file:'backend/src/store.js',
    marker:'INSERT OR IGNORE INTO integration_outbox',
    evidence:'applySyncEvents constructs makeDomainEvent before insert',
    compliant:store.includes('const syncDomainEvent = makeDomainEvent({') && store.includes("'field.sync.applied'")
  },
  {
    id:'simulation-fixtures',
    file:'backend/src/operational-intelligence-fabric.js',
    marker:'makeScenarioArtifacts -> integration_outbox',
    evidence:'simulation-only synthetic demo.* event types; not a production domain-event emission path',
    compliant:fabric.includes('function makeScenarioArtifacts') && fabric.includes("'demo.integration.backlog'") && fabric.includes('synthetic: true') && fabric.includes("'SIMULATED_DEPENDENCY_OUTAGE'")
  }
];
const unknownDirectInsert = (store.match(/integration_outbox/g)||[]).length;
const report={
  schemaVersion:'opscore.outbox-domain-event-inventory.v1',
  generatedAt:new Date().toISOString(),
  scope:'source-level inventory of integration_outbox writers',
  writerCount:writers.length,
  writers,
  storeReferenceCount:unknownDirectInsert,
  decision:writers.every(w=>w.compliant)?'PASS':'REVIEW',
  notes:[
    'Production activity and sync outbox writers embed the versioned domain-event contract in payload_json.',
    'Simulation fixture writes are explicitly synthetic demo.* records and are classified outside the production domain-event path; they are not coerced into fake domain events.',
    'This inventory does not certify external delivery or live broker behavior.'
  ]
};
fs.writeFileSync(path.join(ROOT,'docs','OUTBOX_DOMAIN_EVENT_INVENTORY_RESULT.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
