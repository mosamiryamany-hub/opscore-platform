const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {openDb}=require('../src/db');const {Store}=require('../src/store');const config=require('../src/config');const {tmpDbPath,cleanup}=require('./helpers');
function ctx(org,user,role='owner'){return{organizationId:org,userId:user,role};}
test('platform intelligence layer: twin -> decision replay -> scenario -> skills/capacity -> governed recommendations',()=>{
 const dbPath=tmpDbPath('platform-intel');process.env.OPSC_SQLITE_PATH=dbPath;let db;
 try{
  db=openDb(dbPath);const store=new Store(db,{...config,sqlitePath:dbPath});
  const boot=store.bootstrap({orgName:'Platform Test',email:'owner@example.test',password:'long-secure-test-password'});const c=ctx(boot.orgId,boot.userId);
  const wo=store.createWorkOrder(c,{title:'Overdue test',description:'',priority:'urgent',dueAt:new Date(Date.now()-3600000).toISOString()});
  assert.equal(wo.status,'open');
  store.upsertTechnician(c,{userId:boot.userId,latitude:30,longitude:31,active:true});
  store.addTechnicianSkill(c,{userId:boot.userId,skill:'electrical',level:4});
  const twin=store.platformTwin(c);assert.equal(twin.openStatusCount,1);assert.equal(twin.signals.overdueWorkOrders,1);assert.ok(twin.stateSha256);
  const decision=store.recordPlatformDecision(c,{decisionType:'dispatch.assignment',input:{workOrderId:wo.id},rules:[{when:'qualified'}],outcome:{approved:false,reason:'awaiting human review'}});
  const replay=store.replayPlatformDecision(c,decision.id);assert.equal(replay.valid,true);assert.equal(replay.recomputedSha256,decision.decisionSha256);
  const scenario=store.simulatePlatformScenario(c,{name:'surge',planDate:'2026-09-16',horizonDays:5,additionalWorkOrders:20,avgHoursPerWorkOrder:2,dailyHoursPerTechnician:8});assert.equal(scenario.result.capacityStatus,'over_capacity');assert.ok(scenario.resultSha256);
  const cert=store.registerSkillCertification(c,{userId:boot.userId,skill:'electrical',certificateRef:'CERT-1',issuer:'Test Issuer',expiresAt:'2027-09-16T00:00:00.000Z',status:'active',evidence:{artifact:'hash-me'}});assert.equal(cert.status,'active');
  const match=store.matchPlatformSkills(c,{requiredSkills:[{skill:'electrical',level:4}]});assert.equal(match.candidates[0].qualified,true);
  const cap=store.platformCapacity(c,{date:'2026-09-16',dailyHoursPerTechnician:8});assert.equal(cap.technicians.length,1);
  const rec=store.platformRecommendations(c);assert.equal(rec.mode,'deterministic');assert.equal(rec.aiProvider,'not_configured');assert.equal(rec.actionability,'recommendations_require_human_approval');
  const row=db.prepare('SELECT decision_sha256 FROM decision_replays WHERE id=? AND organization_id=?').get(decision.id,c.organizationId);assert.equal(row.decision_sha256,decision.decisionSha256);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM operational_twin_snapshots WHERE organization_id=?').get(c.organizationId).n>0,true);
 }finally{try{db?.close()}catch{};cleanup(fs,dbPath)}
});

test('platform intelligence layer enforces tenant boundary on decision replay',()=>{
 const dbPath=tmpDbPath('platform-intel-tenant');let db;
 try{db=openDb(dbPath);const store=new Store(db,{...config,sqlitePath:dbPath});const a=store.bootstrap({orgName:'Org A',email:'a@example.test',password:'long-secure-test-password'});
  const {id,hashPassword}=require('../src/security');const bOrg=id('org'),bUser=id('usr'),t=new Date().toISOString();db.prepare('INSERT INTO organizations VALUES (?,?,?)').run(bOrg,'B',t);db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(bUser,'b@example.test',hashPassword('another-long-secure-password'),'active',t);db.prepare('INSERT INTO memberships VALUES (?,?,?,?)').run(bUser,bOrg,'owner',t);
  const ca=ctx(a.orgId,a.userId),cb=ctx(bOrg,bUser);const d=store.recordPlatformDecision(ca,{decisionType:'test.boundary',input:{x:1},rules:[],outcome:{ok:true}});assert.throws(()=>store.replayPlatformDecision(cb,d.id),/DECISION_NOT_FOUND/);
 }finally{try{db?.close()}catch{};cleanup(fs,dbPath)}
});


test('twin snapshot and chain event roll back atomically when chain append fails',()=>{
 const dbPath=tmpDbPath('twin-chain-atomicity');let db;
 try{
  db=openDb(dbPath);const store=new Store(db,{...config,sqlitePath:dbPath});const a=store.bootstrap({orgName:'Atomic Twin',email:'atomic-twin@example.test',password:'long-secure-test-password'});const c=ctx(a.orgId,a.userId);
  db.exec("CREATE TRIGGER fail_twin_chain_insert BEFORE INSERT ON operational_twin_chain_events BEGIN SELECT RAISE(ABORT,'INJECTED_CHAIN_FAILURE'); END;");
  assert.throws(()=>store.platformTwin(c,{persist:true}),/INJECTED_CHAIN_FAILURE/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM operational_twin_snapshots WHERE organization_id=?').get(c.organizationId).n,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM operational_twin_chain_events WHERE organization_id=?').get(c.organizationId).n,0);
 }finally{try{db?.close()}catch{};cleanup(fs,dbPath)}
});

test('persistent twin chain detects missing events and remains tenant-scoped',()=>{
 const dbPath=tmpDbPath('twin-chain-missing-event');let db;
 try{
  db=openDb(dbPath);const store=new Store(db,{...config,sqlitePath:dbPath});
  const a=store.bootstrap({orgName:'Chain Org A',email:'chain-a@example.test',password:'long-secure-test-password'});const ca=ctx(a.orgId,a.userId);
  const snap=store.platformTwin(ca,{persist:true});assert.equal(store.verifyPlatformTwinChain(ca).valid,true);
  const {id,hashPassword}=require('../src/security');const bOrg=id('org'),bUser=id('usr'),t=new Date().toISOString();
  db.prepare('INSERT INTO organizations VALUES (?,?,?)').run(bOrg,'Chain Org B',t);db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(bUser,'chain-b@example.test',hashPassword('another-long-secure-password'),'active',t);db.prepare('INSERT INTO memberships VALUES (?,?,?,?)').run(bUser,bOrg,'owner',t);
  const other=store.verifyPlatformTwinChain(ctx(bOrg,bUser));assert.equal(other.valid,true);assert.equal(other.eventCount,0);assert.equal(other.snapshotCount,0);
  db.prepare('DELETE FROM operational_twin_chain_events WHERE organization_id=? AND snapshot_id=?').run(ca.organizationId,snap.snapshotId);
  const broken=store.verifyPlatformTwinChain(ca);assert.equal(broken.valid,false);assert.ok(broken.failures.some(x=>x.code==='SNAPSHOT_WITHOUT_CHAIN_EVENT'));
 }finally{try{db?.close()}catch{};cleanup(fs,dbPath)}
});

test('operational twin history is tenant-scoped and detects stored snapshot tampering',()=>{
 const dbPath=tmpDbPath('twin-history-integrity');let db;
 try{
  db=openDb(dbPath);const store=new Store(db,{...config,sqlitePath:dbPath});
  const a=store.bootstrap({orgName:'Twin Org A',email:'twin-a@example.test',password:'long-secure-test-password'});
  const ca=ctx(a.orgId,a.userId);const captured=store.platformTwin(ca,{persist:true});
  assert.equal(captured.schemaVersion,'opscore.operational-twin.v2');
  assert.equal(store.verifyPlatformTwinSnapshot(ca,captured.snapshotId).valid,true);
  const chainBefore=store.verifyPlatformTwinChain(ca);assert.equal(chainBefore.valid,true);assert.equal(chainBefore.eventCount,1);assert.equal(chainBefore.snapshotCount,1);
  const history=store.listPlatformTwinSnapshots(ca,{limit:10});
  assert.equal(history.items[0].id,captured.snapshotId);assert.equal(history.items[0].integrity,'valid');
  const {id,hashPassword}=require('../src/security');const bOrg=id('org'),bUser=id('usr'),t=new Date().toISOString();
  db.prepare('INSERT INTO organizations VALUES (?,?,?)').run(bOrg,'Twin Org B',t);
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(bUser,'twin-b@example.test',hashPassword('another-long-secure-password'),'active',t);
  db.prepare('INSERT INTO memberships VALUES (?,?,?,?)').run(bUser,bOrg,'owner',t);
  assert.throws(()=>store.verifyPlatformTwinSnapshot(ctx(bOrg,bUser),captured.snapshotId),/TWIN_SNAPSHOT_NOT_FOUND/);
  db.prepare('UPDATE operational_twin_snapshots SET state_json=? WHERE organization_id=? AND id=?').run(JSON.stringify({organizationId:a.orgId,counts:{workOrders:{open:999}}}),a.orgId,captured.snapshotId);
  const broken=store.verifyPlatformTwinSnapshot(ca,captured.snapshotId);
  assert.equal(broken.valid,false);assert.ok(broken.failures.includes('STATE_HASH_MISMATCH'));assert.equal(broken.chainValid,false);
  const chainAfter=store.verifyPlatformTwinChain(ca);assert.equal(chainAfter.valid,false);assert.ok(chainAfter.failures.some(x=>x.code==='SNAPSHOT_CONTENT_HASH_MISMATCH'));
  assert.equal(store.listPlatformTwinSnapshots(ca,{limit:10}).items[0].integrity,'invalid');
 }finally{try{db?.close()}catch{};cleanup(fs,dbPath)}
});
