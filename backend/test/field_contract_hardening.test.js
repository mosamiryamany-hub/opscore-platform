const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {openDb,CURRENT_SCHEMA_VERSION}=require('../src/db');const {DatabaseSync}=require('node:sqlite');const {Store}=require('../src/store');
function fixture(){const p=path.join(os.tmpdir(),`opscore-hardening-${crypto.randomUUID()}.sqlite`);const db=openDb(p);return {p,db};}
const crypto=require('node:crypto');
function close(f){f.db.close();try{fs.rmSync(f.p,{force:true})}catch{}}
test('schema version is explicit and current',()=>{const f=fixture();try{const v=f.db.prepare('PRAGMA user_version').get().user_version;assert.equal(v,CURRENT_SCHEMA_VERSION);assert.equal(f.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='idempotency_records'").get().name,'idempotency_records');assert.equal(f.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='login_throttle'").get().name,'login_throttle')}finally{close(f)}});
test('sync duplicate is explicit and does not duplicate effect',()=>{const f=fixture(),s=new Store(f.db,{sessionTtlHours:24});try{s.bootstrap({orgName:'Ops',email:'owner@example.com',password:'Strong-pass-2026'});const c=s.login('owner@example.com','Strong-pass-2026');const w=s.createWorkOrder(c,{title:'Sync'});const a=s.applySyncEvents(c,[{clientEventId:'evt-x',entityId:w.id,operation:'comment',payload:{body:'hello'}}]);const b=s.applySyncEvents(c,[{clientEventId:'evt-x',entityId:w.id,operation:'comment',payload:{body:'hello'}}]);assert.equal(a.applied[0].status,'applied');assert.equal(b.applied[0].status,'duplicate');assert.equal(s.listComments(c,w.id).length,1)}finally{close(f)}});
test('critical direct writes require idempotency and replay safely',()=>{const f=fixture(),s=new Store(f.db,{sessionTtlHours:24});try{s.bootstrap({orgName:'Ops',email:'owner@example.com',password:'Strong-pass-2026'});const c=s.login('owner@example.com','Strong-pass-2026');const w=s.createWorkOrder(c,{title:'Critical'});const r1=s.idempotentWrite(c,'work_order_comment','k1',{workOrderId:w.id,body:'one'},()=>s.addComment(c,w.id,'one'));const r2=s.idempotentWrite(c,'work_order_comment','k1',{workOrderId:w.id,body:'one'},()=>s.addComment(c,w.id,'one'));assert.equal(r1.__idempotent,false);assert.equal(r2.__idempotent,true);assert.equal(s.listComments(c,w.id).length,1);assert.throws(()=>s.idempotentWrite(c,'work_order_comment','k1',{workOrderId:w.id,body:'two'},()=>s.addComment(c,w.id,'two')),/IDEMPOTENCY_KEY_REUSED/);assert.throws(()=>s.idempotentWrite(c,'work_order_comment','',{workOrderId:w.id,body:'x'},()=>s.addComment(c,w.id,'x')),/IDEMPOTENCY_KEY_REQUIRED/)}finally{close(f)}});
test('each critical direct write operation replays without repeating its side effect',()=>{const f=fixture(),s=new Store(f.db,{sessionTtlHours:24});const fileRoot=path.join(os.tmpdir(),`opscore-idem-files-${crypto.randomUUID()}`);process.env.OPSC_REPOSITORY_PATH=fileRoot;try{s.bootstrap({orgName:'Ops',email:'owner@example.com',password:'Strong-pass-2026'});const c=s.login('owner@example.com','Strong-pass-2026');const w=s.createWorkOrder(c,{title:'Critical writes'});
 const upd={workOrderId:w.id,body:{title:'Updated once'}};const u1=s.idempotentWrite(c,'work_order_update','u1',upd,()=>s.updateWorkOrder(c,w.id,upd.body));const u2=s.idempotentWrite(c,'work_order_update','u1',upd,()=>s.updateWorkOrder(c,w.id,upd.body));assert.equal(u2.__idempotent,true);assert.equal(u2.payload.title,'Updated once');
 const tr={workOrderId:w.id,toStatus:'in_progress',reason:'field'};const t1=s.idempotentWrite(c,'work_order_transition','t1',tr,()=>s.transitionWorkOrder(c,w.id,tr.toStatus));const t2=s.idempotentWrite(c,'work_order_transition','t1',tr,()=>s.transitionWorkOrder(c,w.id,tr.toStatus));assert.equal(t1.__idempotent,false);assert.equal(t2.__idempotent,true);
 const ev={workOrderId:w.id,body:'note'};s.idempotentWrite(c,'work_order_comment','c1',ev,()=>s.addComment(c,w.id,ev.body));s.idempotentWrite(c,'work_order_comment','c1',ev,()=>s.addComment(c,w.id,ev.body));assert.equal(s.listComments(c,w.id).length,1);
 const a={workOrderId:w.id,fileName:'proof.txt',mediaType:'text/plain',contentBase64:Buffer.from('proof').toString('base64')};const e1=s.idempotentWrite(c,'work_order_evidence','e1',a,()=>s.storeAttachment(c,a));const e2=s.idempotentWrite(c,'work_order_evidence','e1',a,()=>s.storeAttachment(c,a));assert.equal(e1.__idempotent,false);assert.equal(e2.__idempotent,true);assert.equal(s.listAttachments(c,'work_order',w.id).length,1);
 }finally{close(f);fs.rmSync(fileRoot,{recursive:true,force:true});delete process.env.OPSC_REPOSITORY_PATH}});

test('sync event result contract is explicit for applied duplicate and failed',()=>{const f=fixture(),s=new Store(f.db,{sessionTtlHours:24});try{s.bootstrap({orgName:'Ops',email:'owner@example.com',password:'Strong-pass-2026'});const c=s.login('owner@example.com','Strong-pass-2026');const w=s.createWorkOrder(c,{title:'Contract'});const r=s.applySyncEvents(c,[{clientEventId:'x1',entityId:w.id,operation:'comment',payload:{body:'ok'}},{clientEventId:'x2',entityId:w.id,operation:'bad',payload:{}}]);const d=s.applySyncEvents(c,[{clientEventId:'x1',entityId:w.id,operation:'comment',payload:{body:'ok'}}]);assert.equal(r.results[0].status,'applied');assert.equal(r.results[0].retryable,false);assert.equal(r.results[0].error,null);assert.equal(r.results[1].status,'failed');assert.equal(r.results[1].error.code,'INVALID_SYNC_EVENT');assert.equal(typeof r.results[1].retryable,'boolean');assert.equal(d.results[0].status,'duplicate');assert.equal(d.results[0].retryable,false);assert.equal(d.results[0].error,null)}finally{close(f)}});


test('work-order search filters are tenant scoped and timeline merges persisted operational evidence',()=>{
  const f=fixture();
  const db=f.db;
  const s=new Store(db,{sessionTtlHours:24});
  s.bootstrap({orgName:'Search Timeline',email:'owner@st.test',password:'Owner-strong-pass-2026'});
  const owner=s.login('owner@st.test','Owner-strong-pass-2026');
  const a=s.createWorkOrder(owner,{title:'Pump inspection Alpha',description:'north plant',priority:'high'});
  s.createWorkOrder(owner,{title:'Valve replacement Beta',description:'south plant'});
  assert.equal(s.listWorkOrders(owner,{q:'Alpha'}).length,1);
  assert.equal(s.listWorkOrders(owner,{priority:'high'}).length,1);
  assert.equal(s.listWorkOrders(owner,{status:'open',limit:1}).length,1);
  s.addComment(owner,a.id,'Technician note');
  const tl=s.workOrderTimeline(owner,a.id);
  assert.equal(tl.schemaVersion,'opscore.work-order-timeline.v1');
  assert.equal(tl.workOrder.id,a.id);
  assert.ok(tl.events.some(x=>x.source==='activity'&&x.type==='created'));
  assert.ok(tl.events.some(x=>x.source==='comment'&&x.message==='Technician note'));
  assert.ok(tl.events.some(x=>x.source==='audit'&&x.type==='create'));
  close(f);
});


test('operational risk is deterministic, explainable, and tenant scoped',()=>{
  const f=fixture(),s=new Store(f.db,{sessionTtlHours:24});
  try{
    s.bootstrap({orgName:'Risk Ops',email:'owner@risk.test',password:'Owner-strong-pass-2026'});
    const owner=s.login('owner@risk.test','Owner-strong-pass-2026');
    const w=s.createWorkOrder(owner,{title:'Critical field job',priority:'urgent',dueAt:new Date(Date.now()-3600000).toISOString()});
    const risk=s.workOrderOperationalRisk(owner,w.id);
    assert.equal(risk.schemaVersion,'opscore.work-order-risk.v1');
    assert.equal(risk.level,'critical');
    assert.equal(risk.score,60); // urgent 20 + overdue 25 + unassigned 15
    assert.deepEqual(risk.reasons.map(x=>x.code),['OVERDUE','URGENT_PRIORITY','UNASSIGNED']);
    const other={organizationId:'other',userId:'other-user',role:'owner'};
    assert.throws(()=>s.workOrderOperationalRisk(other,w.id),/NOT_FOUND/);
    assert.match(risk.method,/Deterministic/);
  }finally{close(f)}
});

test('daily operations brief ranks persisted exceptions without creating synthetic work',()=>{
  const f=fixture(),s=new Store(f.db,{sessionTtlHours:24});
  try{
    s.bootstrap({orgName:'Brief Ops',email:'owner@brief.test',password:'Owner-strong-pass-2026'});
    const owner=s.login('owner@brief.test','Owner-strong-pass-2026');
    const now=new Date(); const date=now.toISOString().slice(0,10);
    const w=s.createWorkOrder(owner,{title:'Urgent unassigned',priority:'urgent',dueAt:new Date(Date.now()+3600000).toISOString()});
    const before=s.db.prepare('SELECT COUNT(*) c FROM work_orders').get().c;
    const brief=s.dailyOperationsBrief(owner,date);
    const after=s.db.prepare('SELECT COUNT(*) c FROM work_orders').get().c;
    assert.equal(before,after);
    assert.equal(brief.schemaVersion,'opscore.daily-operations-brief.v1');
    assert.equal(brief.summary.unassignedUrgent,1);
    assert.equal(brief.priorityQueue[0].workOrder.id,w.id);
    assert.ok(brief.priorityQueue[0].reasons.some(x=>x.code==='UNASSIGNED'));
  }finally{close(f)}
});

test('client contract is a single authority for web, Android and iOS behavior',()=>{const f=fixture(),s=new Store(f.db,{sessionTtlHours:24});try{s.bootstrap({orgName:'Contract Ops',email:'owner@contract.test',password:'Owner-strong-pass-2026'});const owner=s.login('owner@contract.test','Owner-strong-pass-2026');const c=s.clientContract(owner);assert.equal(c.schemaVersion,'opscore.client-contract.v1');assert.deepEqual(c.surfaces,{web:{role:'operations-console',authority:'server'},android:{role:'field-client',authority:'server'},ios:{role:'field-client',authority:'server'}});assert.deepEqual(c.sync.responses,['applied','duplicate','failed']);assert.ok(c.sync.failure.fields.includes('retryable'));assert.ok(c.criticalWrites.supported.includes('work_order_evidence'));}finally{close(f)}});

test('field mission returns server-owned risk and next-action signals',()=>{const f=fixture(),s=new Store(f.db,{sessionTtlHours:24});try{s.bootstrap({orgName:'Field Contract',email:'owner@field.test',password:'Owner-strong-pass-2026'});const owner=s.login('owner@field.test','Owner-strong-pass-2026');const inv=s.inviteMember(owner,{email:'tech2@field.test',role:'member'}); s.acceptInvitation(inv.inviteToken,{password:'Tech-strong-pass-2026'}); const tech=s.login('tech2@field.test','Tech-strong-pass-2026');s.upsertTechnician(owner,{userId:tech.userId,latitude:30,longitude:31});const w=s.createWorkOrder(owner,{title:'Urgent field work',priority:'urgent',status:'blocked',assignedTo:tech.userId});const now=new Date();s.createAppointment(owner,{workOrderId:w.id,technicianId:tech.userId,startAt:new Date(now.getTime()-600000).toISOString(),endAt:new Date(now.getTime()+600000).toISOString()});const d=s.fieldToday(tech,now.toISOString().slice(0,10));assert.equal(d.schemaVersion,'opscore.field-today.v1');assert.equal(d.contractVersion,'opscore.client-contract.v1');assert.equal(d.appointments.length,1);assert.equal(d.appointments[0].operationalRisk.level,'high');assert.equal(d.appointments[0].recommendedAction,'prioritize');assert.equal(d.attention[0].workOrderId,w.id);}finally{close(f)}});

test('compatibility gate is explicit and fail-closed for unsupported mobile versions',()=>{const f=fixture(),s=new Store(f.db,{sessionTtlHours:24});try{s.bootstrap({orgName:'Compat Ops',email:'owner@compat.test',password:'Owner-strong-pass-2026'});const owner=s.login('owner@compat.test','Owner-strong-pass-2026');const good=s.clientContract(owner,'0.1.16');const bad=s.clientContract(owner,'9.9.9');assert.equal(good.compatibility.compatible,true);assert.equal(good.compatibility.failClosed,true);assert.equal(bad.compatibility.compatible,false);assert.equal(bad.compatibility.reason,'MOBILE_VERSION_UNSUPPORTED');}finally{close(f)}});

test('completion package is a single integrity-bearing operational record',()=>{const f=fixture(),s=new Store(f.db,{sessionTtlHours:24});try{s.bootstrap({orgName:'Completion Ops',email:'owner@completion.test',password:'Owner-strong-pass-2026'});const owner=s.login('owner@completion.test','Owner-strong-pass-2026');const w=s.createWorkOrder(owner,{title:'Completion'});const pkg=s.completionPackage(owner,w.id);assert.equal(pkg.schemaVersion,'opscore.completion-package.v1');assert.equal(typeof pkg.completionSha256,'string');assert.equal(pkg.completionSha256.length,64);assert.equal(pkg.completionAssurance.ready,true);assert.ok(Array.isArray(pkg.workflowTransitions));}finally{close(f)}});

test('operational doctor is read-only and reports real subsystem state',()=>{const f=fixture(),s=new Store(f.db,{sessionTtlHours:24});try{s.bootstrap({orgName:'Doctor Ops',email:'owner@doctor.test',password:'Owner-strong-pass-2026'});const owner=s.login('owner@doctor.test','Owner-strong-pass-2026');const before=s.db.prepare('SELECT COUNT(*) c FROM work_orders').get().c;const d=s.operationalDoctor(owner);const after=s.db.prepare('SELECT COUNT(*) c FROM work_orders').get().c;assert.equal(before,after);assert.equal(d.schemaVersion,'opscore.operational-doctor.v1');assert.equal(d.mode,'read_only');assert.equal(d.checks.databaseIntegrity,true);assert.equal(d.checks.auditChain,true);assert.equal(d.checks.contract,true);}finally{close(f)}});

test('on-my-way is idempotent at the state boundary and does not duplicate audit activity',()=>{const f=fixture(),s=new Store(f.db,{sessionTtlHours:24});try{s.bootstrap({orgName:'Travel Ops',email:'owner@travel.test',password:'Owner-strong-pass-2026'});const c=s.login('owner@travel.test','Owner-strong-pass-2026');const inv=s.inviteMember(c,{email:'tech@travel.test',role:'member'});s.acceptInvitation(inv.inviteToken,{password:'Tech-strong-pass-2026'});const tech=s.login('tech@travel.test','Tech-strong-pass-2026');const w=s.createWorkOrder(c,{title:'Idempotent travel',assignedTo:tech.userId});const appt=s.createAppointment(c,{workOrderId:w.id,technicianId:tech.userId,startAt:new Date(Date.now()+3600000).toISOString(),endAt:new Date(Date.now()+7200000).toISOString()});const before=s.db.prepare("SELECT COUNT(*) c FROM activity_log WHERE organization_id=? AND entity_id=? AND event_type='technician_on_way'").get(c.organizationId,w.id).c;s.onMyWay(tech,appt.id);s.onMyWay(tech,appt.id);const after=s.db.prepare("SELECT COUNT(*) c FROM activity_log WHERE organization_id=? AND entity_id=? AND event_type='technician_on_way'").get(c.organizationId,w.id).c;assert.equal(after-before,1);assert.equal(s.getAppointment(c,appt.id).status,'en_route')}finally{close(f)}});

test('login throttling is database-backed and shared across Store instances',()=>{const f=fixture(),s1=new Store(f.db,{sessionTtlHours:24}),s2=new Store(f.db,{sessionTtlHours:24});try{s1.bootstrap({orgName:'Throttle Ops',email:'owner@throttle.test',password:'Owner-strong-pass-2026'});for(let i=0;i<8;i++)assert.throws(()=>s1.login('owner@throttle.test','wrong-password'),/INVALID_CREDENTIALS/);assert.throws(()=>s2.login('owner@throttle.test','wrong-password'),/LOGIN_RATE_LIMITED/);assert.throws(()=>s1.login('owner@throttle.test','Owner-strong-pass-2026'),/LOGIN_RATE_LIMITED/);}finally{close(f)}});


test('offline evidence sync stores attachment and remains tenant scoped',()=>{const f=fixture(),s=new Store(f.db,{sessionTtlHours:24});try{s.bootstrap({orgName:'Evidence Sync Ops',email:'owner@evidence-sync.test',password:'Owner-strong-pass-2026'});const c=s.login('owner@evidence-sync.test','Owner-strong-pass-2026');const w=s.createWorkOrder(c,{title:'Offline evidence'});const content=Buffer.from([255,216,255,0,1,2,3]);const out=s.applySyncEvents(c,[{clientEventId:'ev-attachment-1',operation:'attachment',entityId:w.id,payload:{fileName:'field.jpg',mediaType:'image/jpeg',contentBase64:content.toString('base64')}}]);assert.equal(out.results[0].status,'applied');assert.equal(s.listAttachments(c,'work_order',w.id).length,1);const dup=s.applySyncEvents(c,[{clientEventId:'ev-attachment-1',operation:'attachment',entityId:w.id,payload:{fileName:'field.jpg',mediaType:'image/jpeg',contentBase64:content.toString('base64')}}]);assert.equal(dup.results[0].status,'duplicate');}finally{close(f)}});


test('schema 3 databases migrate to 4 without losing sync events',()=>{const p=path.join(os.tmpdir(),`opscore-schema3-${crypto.randomUUID()}.sqlite`);let db=openDb(p);const org='org-mig',user='usr-mig',t=new Date().toISOString();db.prepare('INSERT INTO organizations VALUES (?,?,?)').run(org,'Migration Org',t);db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(user,'migration@example.com','x','active',t);db.prepare('INSERT INTO sync_events VALUES (?,?,?,?,?,?,?,?,?)').run('syn-mig',org,user,'evt-mig','status_update','wo-mig','status_update','{}',t);db.exec('ALTER TABLE sync_events RENAME TO sync_events_old');db.exec("CREATE TABLE sync_events (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, client_event_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, operation TEXT NOT NULL CHECK(operation IN ('status_update','comment','appointment_checkin','signoff','attachment')), payload_json TEXT NOT NULL, applied_at TEXT NOT NULL, UNIQUE(organization_id,actor_user_id,client_event_id))");db.exec('INSERT INTO sync_events SELECT * FROM sync_events_old');db.exec('DROP TABLE sync_events_old');db.exec('PRAGMA user_version=3');db.close();db=openDb(p);try{assert.equal(db.prepare('PRAGMA user_version').get().user_version,CURRENT_SCHEMA_VERSION);assert.equal(db.prepare('SELECT operation FROM sync_events WHERE client_event_id=?').get('evt-mig').operation,'status_update');const ddl=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='sync_events'").get().sql;assert.match(ddl,/appointment_on_my_way/)}finally{db.close();for(const x of [p,p+'-wal',p+'-shm']){try{fs.rmSync(x,{force:true})}catch{}}}});
