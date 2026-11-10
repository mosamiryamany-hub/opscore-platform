const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {openDb}=require('../src/db');
const {Store}=require('../src/store');
const config=require('../src/config');
const {tmpDbPath,cleanup}=require('./helpers');

function ctx(boot){return{organizationId:boot.orgId,userId:boot.userId,role:'owner'}}

test('operational intelligence fabric detects every deterministic fault scenario and rolls back cleanly',()=>{
 const dbPath=tmpDbPath('fabric-scenarios');let db;
 try{
  db=openDb(dbPath);const store=new Store(db,{...config,sqlitePath:dbPath});
  const boot=store.bootstrap({orgName:'Fabric Test',email:'fabric@example.test',password:'long-secure-test-password'});
  const c=ctx(boot);
  for(const scenario of ['outbox-backlog','worker-degradation','geofence-anomalies','runtime-failure','capacity-pressure','dependency-outage','cascading-worker-failure']){
    const before=store.detectOperationalFabric(c);
    const r=store.simulateOperationalScenario(c,{scenario});
    assert.equal(r.rollback,true);
    if(scenario==='cascading-worker-failure'){
      assert.equal(r.detected,true);
      assert.equal(r.after.detected.workerDegradation,true);
      assert.equal(r.after.detected.outboxBacklog,true);
      assert.equal(r.after.detected.runtimeFailure,true);
    }else{
      const map={
        'outbox-backlog':'outboxBacklog','worker-degradation':'workerDegradation','geofence-anomalies':'geofenceAnomaly',
        'runtime-failure':'runtimeFailure','capacity-pressure':'capacityPressure','dependency-outage':'dependencyOutage'
      };
      assert.equal(r.after.detected[map[scenario]],true,scenario);
    }
    const after=store.detectOperationalFabric(c);
    assert.equal(after.outboxQueued,before.outboxQueued);
    assert.equal(after.staleProcessingJobs,before.staleProcessingJobs);
    assert.equal(after.geofenceAnomalies.length,before.geofenceAnomalies.length);
    assert.equal(after.runtime.errors,before.runtime.errors);
  }
 }finally{try{db?.close()}catch{}cleanup(fs,dbPath)}
});

test('guardrails block forbidden actions and causal graph is evidence-linked and tenant scoped',()=>{
 const dbPath=tmpDbPath('fabric-governance');let db;
 try{
  db=openDb(dbPath);const store=new Store(db,{...config,sqlitePath:dbPath});
  const a=store.bootstrap({orgName:'Org A',email:'a@fabric.test',password:'long-secure-test-password'});
  const ca=ctx(a);
  store.setGuardrailPolicy(ca,{actionType:'requeue_stale_worker_jobs',mode:'deny'});
  assert.equal(store.evaluateAutopilotPolicy(ca,'requeue_stale_worker_jobs',{change:1}).allowed,false);
  const sim=store.simulateOperationalScenario(ca,{scenario:'cascading-worker-failure',rollback:false});
  assert.equal(sim.detected,true);
  const proposals=store.generateAutopilotProposals(ca,{incidentRef:'FAB-1'});
  assert.equal(proposals.proposals.some(p=>p.actionType==='requeue_stale_worker_jobs'),false);
  assert.ok(proposals.blocked.some(x=>x.actionType==='requeue_stale_worker_jobs'));
  const {id,hashPassword}=require('../src/security');
  const bOrg=id('org'),bUser=id('usr'),t=new Date().toISOString();
  db.prepare('INSERT INTO organizations VALUES (?,?,?)').run(bOrg,'B',t);
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(bUser,'b@fabric.test',hashPassword('another-long-secure-password'),'active',t);
  db.prepare('INSERT INTO memberships VALUES (?,?,?,?)').run(bUser,bOrg,'owner',t);
  const cb={organizationId:bOrg,userId:bUser,role:'owner'};
  const graph=store.buildCausalEvidenceGraph(ca,{incidentRef:'FAB-1'});
  assert.equal(graph.schemaVersion,'opscore.causal-evidence-graph.v1');
  assert.equal(graph.summary.signals>0,true);
  assert.equal(graph.summary.dependencies>0,true);
  const storeB=new Store(db,{...config,sqlitePath:dbPath});
  const graphB=storeB.buildCausalEvidenceGraph(cb,{incidentRef:'FAB-1'});
  assert.equal(graphB.nodes.some(n=>n.type==='signal'),false);
 }finally{try{db?.close()}catch{}cleanup(fs,dbPath)}
});

test('evidence center is read-only, replay package is non-executable, and integrity verifies stored evidence',()=>{
 const dbPath=tmpDbPath('fabric-evidence');let db;
 try{
  db=openDb(dbPath);const store=new Store(db,{...config,sqlitePath:dbPath});
  const boot=store.bootstrap({orgName:'Evidence Test',email:'evidence@example.test',password:'long-secure-test-password'});
  const c=ctx(boot);
  store.simulateOperationalScenario(c,{scenario:'cascading-worker-failure',rollback:false});
  const before=db.prepare('SELECT COUNT(*) n FROM causal_evidence_runs').get().n;
  const graph=store.buildCausalEvidenceGraph(c,{incidentRef:'EVID-1'});
  const center=store.getOperationalEvidenceCenter(c,{incidentRef:'EVID-1'});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM causal_evidence_runs').get().n,before+1);
  assert.equal(center.schemaVersion,'opscore.operational-evidence-center.v1');
  assert.equal(center.evidenceGraph.id,graph.id);
  const replay=store.exportOperationalReplayPackage(c,{incidentRef:'EVID-1',fromAt:new Date(Date.now()-3600000).toISOString(),toAt:new Date(Date.now()+1000).toISOString()});
  assert.equal(replay.replaySafety,'READ_ONLY_DATA_PACKAGE; replaying this package does not execute actions.');
  assert.ok(replay.packageSha256.length===64);
  const integrity=store.verifyOperationalEvidence(c);
  assert.equal(integrity.valid,true);
  const safety=store.evaluateAutopilotSafetyContract(c);
  assert.equal(safety.invariant.includes('No action is executable'),true);
 }finally{try{db?.close()}catch{}cleanup(fs,dbPath)}
});
