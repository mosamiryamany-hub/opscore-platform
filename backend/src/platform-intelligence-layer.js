'use strict';
const crypto = require('node:crypto');
const {requireRole}=require('./rbac');
const {id,now}=require('./security');
function stable(value){if(value===null||typeof value!=='object')return value;if(Array.isArray(value))return value.map(stable);return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));}
function sha(value){return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');}
function parse(v,fallback){try{return JSON.parse(v)}catch{return fallback}}
function positiveInt(v,fallback=0){const n=Number(v);return Number.isInteger(n)&&n>=0?n:fallback;}
function safeText(v,max=120){return String(v??'').trim().slice(0,max);}
function assertIsoDate(d){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(d||'')))throw new Error('INVALID_SCENARIO_DATE');const x=new Date(`${d}T00:00:00Z`);if(Number.isNaN(x.getTime()))throw new Error('INVALID_SCENARIO_DATE');return d;}
function ensureSchema(db){
if(db.engine==='postgres')return; // PostgreSQL schema is migration-owned.
db.exec(`
CREATE TABLE IF NOT EXISTS operational_twin_snapshots(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,snapshot_kind TEXT NOT NULL CHECK(snapshot_kind IN ('on_demand','scenario')),state_json TEXT NOT NULL,state_sha256 TEXT NOT NULL,source_counts_json TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_twin_org_created ON operational_twin_snapshots(organization_id,created_at);
CREATE TABLE IF NOT EXISTS operational_twin_chain_events(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,sequence_no INTEGER NOT NULL,event_type TEXT NOT NULL,snapshot_id TEXT NOT NULL,previous_hash TEXT NOT NULL,event_json TEXT NOT NULL,event_hash TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at TEXT NOT NULL,UNIQUE(organization_id,sequence_no),UNIQUE(organization_id,snapshot_id));
CREATE INDEX IF NOT EXISTS idx_twin_chain_org_sequence ON operational_twin_chain_events(organization_id,sequence_no);
CREATE TABLE IF NOT EXISTS decision_replays(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,decision_type TEXT NOT NULL,input_json TEXT NOT NULL,rules_json TEXT NOT NULL,outcome_json TEXT NOT NULL,decision_sha256 TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at TEXT NOT NULL,replayed_at TEXT);
CREATE INDEX IF NOT EXISTS idx_decision_replays_org_created ON decision_replays(organization_id,created_at);
CREATE TABLE IF NOT EXISTS scenario_runs(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,name TEXT NOT NULL,scenario_json TEXT NOT NULL,baseline_sha256 TEXT NOT NULL,result_json TEXT NOT NULL,result_sha256 TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_scenario_runs_org_created ON scenario_runs(organization_id,created_at);
CREATE TABLE IF NOT EXISTS skill_certifications(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,skill TEXT NOT NULL,certificate_ref TEXT NOT NULL,issuer TEXT NOT NULL,issued_at TEXT,expires_at TEXT,status TEXT NOT NULL CHECK(status IN ('active','expired','revoked')),evidence_sha256 TEXT,created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(organization_id,user_id,certificate_ref));
CREATE INDEX IF NOT EXISTS idx_skill_cert_org_user ON skill_certifications(organization_id,user_id,status,expires_at);
CREATE TABLE IF NOT EXISTS capacity_plans(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,plan_date TEXT NOT NULL,parameters_json TEXT NOT NULL,result_json TEXT NOT NULL,result_sha256 TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at TEXT NOT NULL,UNIQUE(organization_id,plan_date));
CREATE INDEX IF NOT EXISTS idx_capacity_plans_org_date ON capacity_plans(organization_id,plan_date);
`);}
function techHasSkill(db,orgId,userId,skill,minLevel){const row=db.prepare('SELECT level FROM technician_skills WHERE organization_id=? AND user_id=? AND skill=?').get(orgId,userId,skill);return Boolean(row&&Number(row.level)>=minLevel);}
function certValid(db,orgId,userId,skill){const rows=db.prepare("SELECT expires_at FROM skill_certifications WHERE organization_id=? AND user_id=? AND skill=? AND status='active'").all(orgId,userId,skill);if(!rows.length)return true;const t=Date.now();return rows.some(r=>!r.expires_at||new Date(r.expires_at).getTime()>=t);}
function install(Store){const p=Store.prototype;p._platformEnsure=function(){ensureSchema(this.db)};
p.platformTwin=function(ctx,opts={}){
 requireRole(ctx.role,'read');this._platformEnsure();
 const counts={
  workOrders:{open:0,in_progress:0,blocked:0,completed:0,cancelled:0},
  assets:{active:0,inactive:0,retired:0},
  appointments:{scheduled:0,confirmed:0,en_route:0,completed:0,cancelled:0,no_show:0},
  jobs:{queued:0,processing:0,failed:0,dead_letter:0,completed:0},
  maintenancePlans:{active:0,overdue:0},
  invoices:{draft:0,issued:0,partially_paid:0,paid:0,void:0,overdue:0},
  integrationOutbox:{queued:0,processing:0,delivered:0,failed:0}
 };
 for(const group of [['work_orders','workOrders'],['assets','assets'],['appointments','appointments'],['operational_jobs','jobs'],['invoices','invoices'],['integration_outbox','integrationOutbox']]){
  for(const r of this.db.prepare(`SELECT status,COUNT(*) n FROM ${group[0]} WHERE organization_id=? GROUP BY status`).all(ctx.organizationId)){
   if(counts[group[1]][r.status]!==undefined)counts[group[1]][r.status]=Number(r.n);
  }
 }
 counts.maintenancePlans.active=Number(this.db.prepare('SELECT COUNT(*) n FROM maintenance_plans WHERE organization_id=? AND active=1').get(ctx.organizationId).n||0);
 counts.maintenancePlans.overdue=Number(this.db.prepare('SELECT COUNT(*) n FROM maintenance_plans WHERE organization_id=? AND active=1 AND next_due_at<?').get(ctx.organizationId,now()).n||0);
 const eventGroups=this.db.prepare('SELECT event_type,COUNT(*) n FROM asset_events WHERE organization_id=? GROUP BY event_type ORDER BY event_type').all(ctx.organizationId);
 const thirtyDaysAgo=new Date(Date.now()-30*86400000).toISOString();
 counts.assetEvents={total:Number(this.db.prepare('SELECT COUNT(*) n FROM asset_events WHERE organization_id=?').get(ctx.organizationId).n||0),failuresLast30d:Number(this.db.prepare("SELECT COUNT(*) n FROM asset_events WHERE organization_id=? AND event_type='failure' AND occurred_at>=?").get(ctx.organizationId,thirtyDaysAgo).n||0),byType:eventGroups.map(r=>({eventType:r.event_type,count:Number(r.n)}))};
 const distributions={
  workOrderPriority:this.db.prepare('SELECT priority,COUNT(*) n FROM work_orders WHERE organization_id=? GROUP BY priority ORDER BY priority').all(ctx.organizationId).map(r=>({priority:r.priority,count:Number(r.n)})),
  assetTypes:this.db.prepare('SELECT asset_type,COUNT(*) n FROM assets WHERE organization_id=? GROUP BY asset_type ORDER BY asset_type').all(ctx.organizationId).map(r=>({assetType:r.asset_type,count:Number(r.n)}))
 };
 const signals={
  overdueWorkOrders:Number(this.db.prepare("SELECT COUNT(*) n FROM work_orders WHERE organization_id=? AND due_at IS NOT NULL AND due_at<? AND status IN ('open','in_progress','blocked')").get(ctx.organizationId,now()).n||0),
  unassignedActiveWorkOrders:Number(this.db.prepare("SELECT COUNT(*) n FROM work_orders WHERE organization_id=? AND assigned_to IS NULL AND status IN ('open','in_progress','blocked')").get(ctx.organizationId).n||0),
  activeTechnicians:Number(this.db.prepare('SELECT COUNT(*) n FROM technician_profiles WHERE organization_id=? AND active=1').get(ctx.organizationId).n||0),
  criticalWorkOrders:Number(this.db.prepare("SELECT COUNT(*) n FROM work_orders WHERE organization_id=? AND priority='urgent' AND status IN ('open','in_progress','blocked')").get(ctx.organizationId).n||0),
  overdueMaintenancePlans:counts.maintenancePlans.overdue,
  recentAssetFailures:counts.assetEvents.failuresLast30d,
  failedIntegrationDeliveries:counts.integrationOutbox.failed,
  overdueInvoices:counts.invoices.overdue,
  openInvoiceCount:counts.invoices.issued+counts.invoices.partially_paid+counts.invoices.overdue
 };
 const state={schemaVersion:'opscore.operational-twin.v2',organizationId:ctx.organizationId,generatedAt:now(),domain:'general_operations',counts,distributions,signals};
 const stateSha=sha(state);
 if(opts.persist!==false){
  const snapshotId=id('twin');
  const persist=()=>{
   this.db.prepare('INSERT INTO operational_twin_snapshots(id,organization_id,snapshot_kind,state_json,state_sha256,source_counts_json,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)').run(snapshotId,ctx.organizationId,'on_demand',JSON.stringify(state),stateSha,JSON.stringify(counts),ctx.userId,state.generatedAt);
   const previous=this.db.prepare('SELECT sequence_no,event_hash FROM operational_twin_chain_events WHERE organization_id=? ORDER BY sequence_no DESC LIMIT 1').get(ctx.organizationId);
   const sequenceNo=previous?Number(previous.sequence_no)+1:1;
   const previousHash=previous?previous.event_hash:'GENESIS';
   const event={schemaVersion:'opscore.digital-twin-chain-event.v1',organizationId:ctx.organizationId,sequenceNo,eventType:'snapshot.created',snapshotId,stateSha256:stateSha,snapshotKind:'on_demand',createdBy:ctx.userId,createdAt:state.generatedAt,previousHash};
   const eventHash=sha(event);const eventId=id('twinevent');
   this.db.prepare('INSERT INTO operational_twin_chain_events(id,organization_id,sequence_no,event_type,snapshot_id,previous_hash,event_json,event_hash,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(eventId,ctx.organizationId,sequenceNo,event.eventType,snapshotId,previousHash,JSON.stringify(event),eventHash,ctx.userId,state.generatedAt);
   return {snapshotId,eventId,sequenceNo,eventHash};
  };
  if(this._txDepth>0){const committed=persist();state.snapshotId=committed.snapshotId;state.chain={eventId:committed.eventId,sequenceNo:committed.sequenceNo,eventHash:committed.eventHash};}
  else {this.db.exec('BEGIN IMMEDIATE');try{const committed=persist();this.db.exec('COMMIT');state.snapshotId=committed.snapshotId;state.chain={eventId:committed.eventId,sequenceNo:committed.sequenceNo,eventHash:committed.eventHash};}catch(e){try{this.db.exec('ROLLBACK')}catch(rollbackError){throw new AggregateError([e,rollbackError],'TWIN_SNAPSHOT_ROLLBACK_FAILED');}throw e;}}
 }
 const openStatusCount=counts.workOrders.open+counts.workOrders.in_progress+counts.workOrders.blocked;
 return {...state,stateSha256:stateSha,openStatusCount};
};
p.listPlatformTwinSnapshots=function(ctx,opts={}){
 requireRole(ctx.role,'read');this._platformEnsure();
 const rawLimit=Number(opts.limit??20);const limit=Number.isInteger(rawLimit)?Math.min(100,Math.max(1,rawLimit)):20;
 const beforeAt=opts.beforeCreatedAt==null?'':String(opts.beforeCreatedAt);
 const beforeId=opts.beforeId==null?'':String(opts.beforeId);
 let rows;
 if(beforeAt){
  const parsed=Date.parse(beforeAt);if(!Number.isFinite(parsed))throw new Error('TWIN_SNAPSHOT_CURSOR_INVALID');
  const cursorAt=new Date(parsed).toISOString();
  rows=this.db.prepare('SELECT id,snapshot_kind,state_json,state_sha256,source_counts_json,created_by,created_at FROM operational_twin_snapshots WHERE organization_id=? AND (created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT ?').all(ctx.organizationId,cursorAt,cursorAt,beforeId||'\uffff',limit);
 }else{
  rows=this.db.prepare('SELECT id,snapshot_kind,state_json,state_sha256,source_counts_json,created_by,created_at FROM operational_twin_snapshots WHERE organization_id=? ORDER BY created_at DESC,id DESC LIMIT ?').all(ctx.organizationId,limit);
 }
 const items=rows.map(r=>{
  let state=null,sourceCounts=null,integrity='invalid',integrityDetail=null;
  try{state=JSON.parse(r.state_json);sourceCounts=JSON.parse(r.source_counts_json);if(state&&state.organizationId===ctx.organizationId&&sha(state)===r.state_sha256&&sha(state.counts)===sha(sourceCounts))integrity='valid';else integrityDetail='CONTENT_OR_HASH_MISMATCH';}catch{integrityDetail='SNAPSHOT_JSON_INVALID';}
  return{id:r.id,snapshotKind:r.snapshot_kind,stateSha256:r.state_sha256,sourceCounts,createdBy:r.created_by,createdAt:r.created_at,integrity,integrityDetail};
 });
 const last=rows[rows.length-1];
 return{schemaVersion:'opscore.digital-twin.history.v1',organizationId:ctx.organizationId,limit,items,nextCursor:last?{beforeCreatedAt:last.created_at,beforeId:last.id}:null,note:'Hash checks detect inconsistent stored content; they do not make the database tamper-proof or cryptographically signed.'};
};
p.verifyPlatformTwinChain=function(ctx,opts={}){
 requireRole(ctx.role,'read');this._platformEnsure();
 const rows=this.db.prepare('SELECT id,organization_id,sequence_no,event_type,snapshot_id,previous_hash,event_json,event_hash,created_by,created_at FROM operational_twin_chain_events WHERE organization_id=? ORDER BY sequence_no ASC').all(ctx.organizationId);
 const failures=[];let previousHash='GENESIS',expectedSequence=1;const seenSnapshots=new Set();
 for(const row of rows){
  let event=null;try{event=JSON.parse(row.event_json)}catch{failures.push({code:'EVENT_JSON_INVALID',eventId:row.id});continue;}
  if(Number(row.sequence_no)!==expectedSequence)failures.push({code:'SEQUENCE_GAP_OR_REORDER',eventId:row.id,expected:expectedSequence,actual:Number(row.sequence_no)});
  if(row.previous_hash!==previousHash||event.previousHash!==previousHash)failures.push({code:'PREVIOUS_HASH_MISMATCH',eventId:row.id});
  if(event.organizationId!==ctx.organizationId||row.organization_id!==ctx.organizationId)failures.push({code:'TENANT_SCOPE_MISMATCH',eventId:row.id});
  if(event.sequenceNo!==Number(row.sequence_no)||event.snapshotId!==row.snapshot_id||event.eventType!==row.event_type||event.createdBy!==row.created_by||event.createdAt!==row.created_at)failures.push({code:'EVENT_COLUMN_MISMATCH',eventId:row.id});
  const recomputed=sha(event);if(recomputed!==row.event_hash)failures.push({code:'EVENT_HASH_MISMATCH',eventId:row.id});
  const snap=this.db.prepare('SELECT state_sha256,state_json FROM operational_twin_snapshots WHERE organization_id=? AND id=?').get(ctx.organizationId,row.snapshot_id);
  if(!snap)failures.push({code:'SNAPSHOT_MISSING_FOR_EVENT',eventId:row.id,snapshotId:row.snapshot_id});else{if(snap.state_sha256!==event.stateSha256)failures.push({code:'SNAPSHOT_HASH_BINDING_MISMATCH',eventId:row.id,snapshotId:row.snapshot_id});try{if(sha(JSON.parse(snap.state_json))!==snap.state_sha256)failures.push({code:'SNAPSHOT_CONTENT_HASH_MISMATCH',eventId:row.id,snapshotId:row.snapshot_id});}catch{failures.push({code:'SNAPSHOT_CONTENT_INVALID',eventId:row.id,snapshotId:row.snapshot_id});}}
  if(seenSnapshots.has(row.snapshot_id))failures.push({code:'DUPLICATE_SNAPSHOT_EVENT',snapshotId:row.snapshot_id});seenSnapshots.add(row.snapshot_id);
  previousHash=row.event_hash;expectedSequence++;
 }
 const orphan=this.db.prepare('SELECT id FROM operational_twin_snapshots WHERE organization_id=? ORDER BY created_at,id').all(ctx.organizationId).filter(r=>!seenSnapshots.has(r.id));
 for(const r of orphan)failures.push({code:'SNAPSHOT_WITHOUT_CHAIN_EVENT',snapshotId:r.id});
 return{schemaVersion:'opscore.digital-twin-chain-verification.v1',organizationId:ctx.organizationId,valid:failures.length===0,eventCount:rows.length,snapshotCount:this.db.prepare('SELECT COUNT(*) n FROM operational_twin_snapshots WHERE organization_id=?').get(ctx.organizationId).n,headSequence:rows.length?Number(rows[rows.length-1].sequence_no):0,headHash:rows.length?rows[rows.length-1].event_hash:'GENESIS',failures,integrityBoundary:'Database-resident hash chain detects many accidental or partial edits; it is not resistant to an administrator who can rewrite the entire database. External anchoring/signing is not configured.'};
};
p.verifyPlatformTwinSnapshot=function(ctx,snapshotId){
 requireRole(ctx.role,'read');this._platformEnsure();
 const key=safeText(snapshotId,160);if(!key)throw new Error('TWIN_SNAPSHOT_ID_INVALID');
 const r=this.db.prepare('SELECT id,organization_id,state_json,state_sha256,source_counts_json,created_by,created_at FROM operational_twin_snapshots WHERE organization_id=? AND id=?').get(ctx.organizationId,key);
 if(!r)throw new Error('TWIN_SNAPSHOT_NOT_FOUND');
 const failures=[];let state=null,sourceCounts=null;
 try{state=JSON.parse(r.state_json);}catch{failures.push('STATE_JSON_INVALID');}
 try{sourceCounts=JSON.parse(r.source_counts_json);}catch{failures.push('SOURCE_COUNTS_JSON_INVALID');}
 let recomputedSha256=null;
 if(state){recomputedSha256=sha(state);if(recomputedSha256!==r.state_sha256)failures.push('STATE_HASH_MISMATCH');if(state.organizationId!==ctx.organizationId)failures.push('TENANT_SCOPE_MISMATCH');}
 if(state&&sourceCounts&&sha(state.counts)!==sha(sourceCounts))failures.push('SOURCE_COUNTS_MISMATCH');
 const chainEvent=this.db.prepare('SELECT event_hash,event_json FROM operational_twin_chain_events WHERE organization_id=? AND snapshot_id=?').get(ctx.organizationId,r.id);
 if(!chainEvent)failures.push('CHAIN_EVENT_MISSING');else{try{const event=JSON.parse(chainEvent.event_json);if(event.stateSha256!==r.state_sha256)failures.push('CHAIN_SNAPSHOT_HASH_MISMATCH');if(sha(event)!==chainEvent.event_hash)failures.push('CHAIN_EVENT_HASH_MISMATCH');}catch{failures.push('CHAIN_EVENT_JSON_INVALID');}}
 const chain=this.verifyPlatformTwinChain(ctx);if(!chain.valid)failures.push('CHAIN_INTEGRITY_INVALID');
 return{schemaVersion:'opscore.digital-twin.verification.v2',snapshotId:r.id,valid:failures.length===0,failures,storedSha256:r.state_sha256,recomputedSha256,chainEventHash:chainEvent?.event_hash||null,chainValid:chain.valid,createdAt:r.created_at,createdBy:r.created_by,integrityBoundary:'Snapshot hashes are bound to a database-resident hash chain. This detects many edits and omissions but does not provide external signatures, WORM storage, or administrator-resistant immutability.'};
};
p.recordPlatformDecision=function(ctx,d={}){requireRole(ctx.role,'write');this._platformEnsure();const type=safeText(d.decisionType,80);if(!/^[a-z0-9._-]{2,80}$/.test(type))throw new Error('DECISION_TYPE_INVALID');const input=d.input&&typeof d.input==='object'?d.input:{};const rules=Array.isArray(d.rules)?d.rules:[];const outcome=d.outcome&&typeof d.outcome==='object'?d.outcome:{};const record={schemaVersion:'opscore.decision-replay.v1',decisionType:type,input,rules,outcome};const t=now(),rid=id('decision'),h=sha(record);this.db.prepare('INSERT INTO decision_replays(id,organization_id,decision_type,input_json,rules_json,outcome_json,decision_sha256,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(rid,ctx.organizationId,type,JSON.stringify(input),JSON.stringify(rules),JSON.stringify(outcome),h,ctx.userId,t);return{id:rid,...record,decisionSha256:h,createdAt:t};};
p.replayPlatformDecision=function(ctx,decisionId){requireRole(ctx.role,'write');this._platformEnsure();const r=this.db.prepare('SELECT * FROM decision_replays WHERE organization_id=? AND id=?').get(ctx.organizationId,String(decisionId));if(!r)throw new Error('DECISION_NOT_FOUND');const input=parse(r.input_json,{}),rules=parse(r.rules_json,[]),outcome=parse(r.outcome_json,{});const rec={schemaVersion:'opscore.decision-replay.v1',decisionType:r.decision_type,input,rules,outcome},rh=sha(rec),valid=rh===r.decision_sha256;this.db.prepare('UPDATE decision_replays SET replayed_at=? WHERE organization_id=? AND id=?').run(now(),ctx.organizationId,r.id);return{id:r.id,valid,decisionSha256:r.decision_sha256,recomputedSha256:rh,decisionType:r.decision_type,input,rules,outcome,why:valid?'Decision payload and provenance hash are reproducible.':'Decision provenance hash mismatch; treat the record as invalid.'};};
p.simulatePlatformScenario=function(ctx,d={}){requireRole(ctx.role,'write');this._platformEnsure();const planDate=assertIsoDate(d.planDate||new Date().toISOString().slice(0,10)),name=safeText(d.name||'Scenario',100),base=this.platformTwin(ctx,{persist:true}),horizon=positiveInt(d.horizonDays,1),added=positiveInt(d.additionalWorkOrders,0),avg=Number(d.avgHoursPerWorkOrder??2),daily=Number(d.dailyHoursPerTechnician??8),techs=positiveInt(d.technicianCount,base.signals.activeTechnicians);if(horizon<1||horizon>31)throw new Error('SCENARIO_HORIZON_INVALID');if(!(avg>=0.25&&avg<=24))throw new Error('SCENARIO_AVG_HOURS_INVALID');if(!(daily>=1&&daily<=24))throw new Error('SCENARIO_DAILY_HOURS_INVALID');const capacity=techs*daily*horizon,demand=base.openStatusCount*avg+added*avg,utilization=capacity?demand/capacity:null,result={schemaVersion:'opscore.scenario-result.v1',planDate,horizonDays:horizon,inputs:{additionalWorkOrders:added,avgHoursPerWorkOrder:avg,dailyHoursPerTechnician:daily,technicianCount:techs},baseline:{openWorkOrders:base.openStatusCount,activeTechnicians:base.signals.activeTechnicians},capacityHours:capacity,demandHours:demand,utilization,headroomHours:capacity-demand,capacityStatus:capacity===0?'no_capacity':utilization>1?'over_capacity':utilization>=0.85?'near_capacity':'capacity_available'},scenario={schemaVersion:'opscore.scenario.v1',name,planDate,horizonDays:horizon,additionalWorkOrders:added,avgHoursPerWorkOrder:avg,dailyHoursPerTechnician:daily,technicianCount:techs},t=now(),rid=id('scenario'),rh=sha(result);this.db.prepare('INSERT INTO scenario_runs(id,organization_id,name,scenario_json,baseline_sha256,result_json,result_sha256,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(rid,ctx.organizationId,name,JSON.stringify(scenario),base.stateSha256,JSON.stringify(result),rh,ctx.userId,t);return{id:rid,name,baselineSha256:base.stateSha256,resultSha256:rh,result};};
p.registerSkillCertification=function(ctx,d={}){requireRole(ctx.role,'admin');this._platformEnsure();const userId=safeText(d.userId,100),skill=safeText(d.skill,100),ref=safeText(d.certificateRef,120),issuer=safeText(d.issuer,160);if(!userId||!skill||!ref||!issuer)throw new Error('SKILL_CERTIFICATION_INPUT_INVALID');if(!this.db.prepare('SELECT 1 FROM memberships WHERE organization_id=? AND user_id=?').get(ctx.organizationId,userId))throw new Error('SKILL_CERT_USER_NOT_IN_TENANT');const status=['active','expired','revoked'].includes(String(d.status||'active'))?String(d.status||'active'):'active',t=now(),rid=id('cert'),evidence=d.evidence===undefined?null:sha(d.evidence);this.db.prepare('INSERT INTO skill_certifications(id,organization_id,user_id,skill,certificate_ref,issuer,issued_at,expires_at,status,evidence_sha256,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(organization_id,user_id,certificate_ref) DO UPDATE SET skill=excluded.skill,issuer=excluded.issuer,issued_at=excluded.issued_at,expires_at=excluded.expires_at,status=excluded.status,evidence_sha256=excluded.evidence_sha256,updated_at=excluded.updated_at').run(rid,ctx.organizationId,userId,skill,ref,issuer,d.issuedAt||null,d.expiresAt||null,status,evidence,ctx.userId,t,t);return this.db.prepare('SELECT * FROM skill_certifications WHERE organization_id=? AND user_id=? AND certificate_ref=?').get(ctx.organizationId,userId,ref);};
p.listSkillCertifications=function(ctx,userId){requireRole(ctx.role,'read');this._platformEnsure();return this.db.prepare('SELECT id,user_id,skill,certificate_ref,issuer,issued_at,expires_at,status,evidence_sha256,created_at,updated_at FROM skill_certifications WHERE organization_id=? AND (? IS NULL OR user_id=?) ORDER BY user_id,skill,certificate_ref').all(ctx.organizationId,userId||null,userId||null);};
p.matchPlatformSkills=function(ctx,d={}){requireRole(ctx.role,'read');this._platformEnsure();const req=(Array.isArray(d.requiredSkills)?d.requiredSkills:[]).map(x=>({skill:safeText(x.skill,100),level:Math.max(1,Math.min(5,Number(x.level||1)))})).filter(x=>x.skill),techs=this.db.prepare('SELECT tp.user_id,u.email FROM technician_profiles tp JOIN users u ON u.id=tp.user_id WHERE tp.organization_id=? AND tp.active=1 ORDER BY u.email').all(ctx.organizationId);return{schemaVersion:'opscore.skill-match.v1',requiredSkills:req,candidates:techs.map(t=>{const skillRows=this.db.prepare('SELECT skill,level FROM technician_skills WHERE organization_id=? AND user_id=?').all(ctx.organizationId,t.user_id),skills=Object.fromEntries(skillRows.map(x=>[x.skill,Number(x.level)])),missing=req.filter(r=>!techHasSkill(this.db,ctx.organizationId,t.user_id,r.skill,r.level)||!certValid(this.db,ctx.organizationId,t.user_id,r.skill)).map(r=>r.skill);return{userId:t.user_id,email:t.email,skills,qualified:missing.length===0,missing};})};};
p.platformCapacity=function(ctx,d={}){requireRole(ctx.role,'read');this._platformEnsure();const date=assertIsoDate(d.date||new Date().toISOString().slice(0,10)),daily=Number(d.dailyHoursPerTechnician??8);if(!(daily>=1&&daily<=24))throw new Error('CAPACITY_DAILY_HOURS_INVALID');const techs=this.db.prepare('SELECT tp.user_id,u.email FROM technician_profiles tp JOIN users u ON u.id=tp.user_id WHERE tp.organization_id=? AND tp.active=1 ORDER BY u.email').all(ctx.organizationId);const technicians=techs.map(t=>{const row=this.db.prepare("SELECT COALESCE(SUM((julianday(end_at)-julianday(start_at))*24),0) hours FROM appointments WHERE organization_id=? AND technician_id=? AND status IN ('scheduled','confirmed','en_route') AND substr(start_at,1,10)=?").get(ctx.organizationId,t.user_id,date),booked=Number(row.hours||0);return{userId:t.user_id,email:t.email,capacityHours:daily,bookedHours:booked,headroomHours:daily-booked,overbooked:booked>daily};});return{schemaVersion:'opscore.capacity-plan.v1',date,dailyHoursPerTechnician:daily,technicians,generatedAt:now()};};
p.platformRecommendations=function(ctx){requireRole(ctx.role,'read');this._platformEnsure();const twin=this.platformTwin(ctx,{persist:false}),r=[];if(twin.signals.overdueWorkOrders>0)r.push({code:'OVERDUE_WORK_ORDERS',severity:'high',evidence:{count:twin.signals.overdueWorkOrders},action:'Review overdue work and re-plan ownership or due dates.'});if(twin.signals.unassignedActiveWorkOrders>0)r.push({code:'UNASSIGNED_ACTIVE_WORK',severity:'high',evidence:{count:twin.signals.unassignedActiveWorkOrders},action:'Review qualified capacity before assignment.'});if(twin.openStatusCount>0&&twin.signals.activeTechnicians===0)r.push({code:'NO_ACTIVE_TECHNICIAN_CAPACITY',severity:'critical',evidence:{openWorkOrders:twin.openStatusCount},action:'Establish execution capacity before dispatch.'});return{schemaVersion:'opscore.recommendation-gateway.v1',mode:'deterministic',aiProvider:'not_configured',grounding:{twinSnapshotId:twin.snapshotId,twinStateSha256:twin.stateSha256},recommendations:r,actionability:'recommendations_require_human_approval'};};
return p;}
module.exports={install,ensureSchema,sha};
