'use strict';
const crypto = require('node:crypto');
const {requireRole}=require('./rbac');
const {id,now}=require('./security');
const {audit}=require('./audit');
function stable(v){if(v===null||typeof v!=='object')return v;if(Array.isArray(v))return v.map(stable);return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));}
function sha(v){return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');}
function text(v,max=160){return String(v??'').trim().slice(0,max);}
function int(v,d=50){const n=Number(v);return Number.isInteger(n)&&n>=0?Math.min(n,500):d;}
function ensureSchema(db){if(db.engine==='postgres')return;db.exec(`
CREATE TABLE IF NOT EXISTS incident_replays(
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 incident_ref TEXT NOT NULL,from_at TEXT NOT NULL,to_at TEXT NOT NULL,timeline_json TEXT NOT NULL,
 timeline_sha256 TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_incident_replays_org_created ON incident_replays(organization_id,created_at);
CREATE TABLE IF NOT EXISTS decision_memory(
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 decision_id TEXT NOT NULL REFERENCES decision_replays(id) ON DELETE CASCADE,learning_key TEXT NOT NULL,
 summary TEXT NOT NULL,success INTEGER NOT NULL DEFAULT 0,confidence REAL NOT NULL DEFAULT 0,
 created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at TEXT NOT NULL,
 UNIQUE(organization_id,decision_id,learning_key)
);
CREATE INDEX IF NOT EXISTS idx_decision_memory_org_key ON decision_memory(organization_id,learning_key,created_at);
CREATE TABLE IF NOT EXISTS autopilot_proposals(
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 incident_ref TEXT,action_type TEXT NOT NULL,target_json TEXT NOT NULL,reasons_json TEXT NOT NULL,
 risk TEXT NOT NULL CHECK(risk IN ('low','medium','high','critical')),approval_required INTEGER NOT NULL DEFAULT 1,
 status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','executed','expired')),
 proposal_json TEXT NOT NULL,proposal_sha256 TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 approved_by TEXT,approved_at TEXT,executed_by TEXT,executed_at TEXT,created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_autopilot_org_status ON autopilot_proposals(organization_id,status,created_at);
`);}
function install(Store){
 const p=Store.prototype;
 p._autopilotEnsure=function(){ensureSchema(this.db);};
 p.createIncidentReplay=function(ctx,d={}){
   requireRole(ctx.role,'write');this._autopilotEnsure();
   const incidentRef=text(d.incidentRef||`incident-${Date.now()}`,120);
   const fromAt=text(d.fromAt,40),toAt=text(d.toAt||now(),40);
   if(!fromAt||Number.isNaN(Date.parse(fromAt)))throw new Error('INCIDENT_FROM_INVALID');
   if(!toAt||Number.isNaN(Date.parse(toAt))||Date.parse(toAt)<Date.parse(fromAt))throw new Error('INCIDENT_WINDOW_INVALID');
   const auditRows=this.db.prepare('SELECT id,actor_user_id,action,resource_type,resource_id,metadata_json,created_at,event_hash FROM audit_log WHERE organization_id=? AND created_at>=? AND created_at<=? ORDER BY created_at ASC, id ASC LIMIT ?').all(ctx.organizationId,fromAt,toAt,int(d.limit,250));
   const decisions=this.db.prepare('SELECT id,decision_type,decision_sha256,created_by,created_at,replayed_at FROM decision_replays WHERE organization_id=? AND created_at>=? AND created_at<=? ORDER BY created_at ASC LIMIT ?').all(ctx.organizationId,fromAt,toAt,int(d.limit,250));
   const snapshots=this.db.prepare('SELECT id,state_sha256,snapshot_kind,created_by,created_at FROM operational_twin_snapshots WHERE organization_id=? AND created_at>=? AND created_at<=? ORDER BY created_at ASC LIMIT ?').all(ctx.organizationId,fromAt,toAt,int(d.limit,250));
   const timeline=[...auditRows.map(r=>({kind:'audit',at:r.created_at,id:r.id,action:r.action,resourceType:r.resource_type,resourceId:r.resource_id,actorUserId:r.actor_user_id,metadata:JSON.parse(r.metadata_json||'{}'),eventHash:r.event_hash})),...decisions.map(r=>({kind:'decision',at:r.created_at,id:r.id,decisionType:r.decision_type,decisionSha256:r.decision_sha256,createdBy:r.created_by,replayedAt:r.replayed_at||null})),...snapshots.map(r=>({kind:'twin_snapshot',at:r.created_at,id:r.id,stateSha256:r.state_sha256,snapshotKind:r.snapshot_kind,createdBy:r.created_by}))].sort((a,b)=>String(a.at).localeCompare(String(b.at)));
   const payload={schemaVersion:'opscore.incident-replay.v1',incidentRef,fromAt,toAt,timeline,counts:{audit:auditRows.length,decisions:decisions.length,twinSnapshots:snapshots.length}};
   const digest=sha(payload),rid=id('incident');
   this.db.prepare('INSERT INTO incident_replays(id,organization_id,incident_ref,from_at,to_at,timeline_json,timeline_sha256,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(rid,ctx.organizationId,incidentRef,fromAt,toAt,JSON.stringify(timeline),digest,ctx.userId,now());
   audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'incident_replay_created',resourceType:'incident_replay',resourceId:rid,metadata:{incidentRef,fromAt,toAt,timelineSha256:digest,counts:payload.counts}});
   return{id:rid,...payload,timelineSha256:digest};
 };
 p.listIncidentReplays=function(ctx,limit=20){requireRole(ctx.role,'read');this._autopilotEnsure();return this.db.prepare('SELECT id,incident_ref,from_at,to_at,timeline_sha256,created_by,created_at FROM incident_replays WHERE organization_id=? ORDER BY created_at DESC LIMIT ?').all(ctx.organizationId,int(limit,20));};
 p.buildDecisionMemory=function(ctx,d={}){
   requireRole(ctx.role,'write');this._autopilotEnsure();
   const rows=this.db.prepare('SELECT * FROM decision_replays WHERE organization_id=? ORDER BY created_at DESC LIMIT ?').all(ctx.organizationId,int(d.limit,100));let created=0;
   for(const r of rows){const outcome=JSON.parse(r.outcome_json||'{}');const approved=outcome.approved===true||outcome.result==='success'||outcome.status==='completed';const key=text(d.learningKey||r.decision_type,100)||r.decision_type;const summary=text(d.summary||outcome.reason||outcome.result||`${r.decision_type} replayed`,240);const confidence=approved?0.9:0.4;try{this.db.prepare('INSERT INTO decision_memory(id,organization_id,decision_id,learning_key,summary,success,confidence,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id('memory'),ctx.organizationId,r.id,key,summary,approved?1:0,confidence,ctx.userId,now());created++;}catch(e){if(!String(e.message).includes('UNIQUE constraint'))throw e;}}
   return{schemaVersion:'opscore.decision-memory.v1',created,available:rows.length};
 };
 p.searchDecisionMemory=function(ctx,q={}){requireRole(ctx.role,'read');this._autopilotEnsure();const term=text(q.query,120);const like=`%${term}%`;if(!term)return this.db.prepare('SELECT * FROM decision_memory WHERE organization_id=? ORDER BY created_at DESC LIMIT ?').all(ctx.organizationId,int(q.limit,50));return this.db.prepare('SELECT * FROM decision_memory WHERE organization_id=? AND (learning_key LIKE ? OR summary LIKE ?) ORDER BY confidence DESC,created_at DESC LIMIT ?').all(ctx.organizationId,like,like,int(q.limit,50));};
 p.generateAutopilotProposals=function(ctx,d={}){
   requireRole(ctx.role,'write');this._autopilotEnsure();
   const cp=this.controlPlaneSnapshot(ctx), fabric=this.detectOperationalFabric?.(ctx), incidentRef=text(d.incidentRef||'',120)||null,proposals=[],blocked=[];
   const signals=[];
   for(const a of cp.anomalies||[]) signals.push({code:a.code,severity:a.severity||'medium',count:a.count||1,action:a.action,evidence:{source:'control_plane',...a}});
   if(fabric){
     const add=(code,condition,severity,count,action,evidence={})=>{if(condition)signals.push({code,severity,count,action,evidence:{source:'operational_fabric',...evidence}});};
     add('OUTBOX_BACKLOG',fabric.detected.outboxBacklog,'high',fabric.outboxQueued,'Contain integration delivery backlog before replay.',{queued:fabric.outboxQueued});
     add('WORKER_DEGRADATION',fabric.detected.workerDegradation,'high',fabric.staleProcessingJobs,'Requeue expired worker leases through governed recovery.',{staleProcessingJobs:fabric.staleProcessingJobs});
     add('GEOFENCE_ANOMALY',fabric.detected.geofenceAnomaly,'high',fabric.geofenceAnomalies.length,'Review field location evidence before accepting the event.',{appointments:fabric.geofenceAnomalies});
     add('DEPENDENCY_OUTAGE',fabric.detected.dependencyOutage,'high',fabric.failedDependencies,'Contain integration delivery while the dependency is unavailable.',{failedDependencies:fabric.failedDependencies});
     add('RUNTIME_FAILURE',fabric.detected.runtimeFailure,'high',fabric.runtime.errors,'Inspect recent runtime failures using correlation evidence.',{runtime:fabric.runtime});
     add('CAPACITY_PRESSURE',fabric.detected.capacityPressure,'high',fabric.twin.openWorkOrders,'Review capacity before dispatching additional work.',{activeTechnicians:fabric.twin.activeTechnicians,openWorkOrders:fabric.twin.openWorkOrders});
   }
   const seen=new Set();
   for(const a of signals){
     const previewAction=(a.code==='OUTBOX_FAILURES'||a.code==='OUTBOX_DEAD_LETTER_CANDIDATE'||a.code==='OUTBOX_BACKLOG'||a.code==='DEPENDENCY_OUTAGE')?'contain_integration_delivery':(a.code==='RUNTIME_ERROR_RATE'||a.code==='RUNTIME_FAILURE')?'inspect_runtime_errors':(a.code==='UNASSIGNED_ACTIVE_WORK'||a.code==='CAPACITY_PRESSURE')?'review_capacity_assignment':a.code==='WORKER_DEGRADATION'?'requeue_stale_worker_jobs':a.code==='GEOFENCE_ANOMALY'?'investigate_geofence_anomaly':a.code==='OVERDUE_WORK'?'capture_twin_and_review_overdue':a.code==='SAFE_MODE_ACTIVE'?'keep_safe_mode':'review_anomaly';
     if(seen.has(previewAction))continue;seen.add(previewAction);
     let actionType='review_anomaly',risk=a.severity==='critical'?'critical':a.severity==='high'?'high':'medium',target={signal:a.code};
     if(a.code==='SAFE_MODE_ACTIVE'){actionType='keep_safe_mode';risk='low';target={signal:'safe_mode'};}
     else if(a.code==='OVERDUE_WORK'){actionType='capture_twin_and_review_overdue';risk='low';target={signal:'overdueWorkOrders'};}
     else if(a.code==='OUTBOX_FAILURES'||a.code==='OUTBOX_DEAD_LETTER_CANDIDATE'||a.code==='OUTBOX_BACKLOG'||a.code==='DEPENDENCY_OUTAGE'){actionType='contain_integration_delivery';risk='high';}
     else if(a.code==='RUNTIME_ERROR_RATE'||a.code==='RUNTIME_FAILURE'){actionType='inspect_runtime_errors';risk='medium';}
     else if(a.code==='UNASSIGNED_ACTIVE_WORK'||a.code==='CAPACITY_PRESSURE'){actionType='review_capacity_assignment';risk='medium';}
     else if(a.code==='WORKER_DEGRADATION'){actionType='requeue_stale_worker_jobs';risk='high';target={signal:'staleProcessingJobs'};}
     else if(a.code==='GEOFENCE_ANOMALY'){actionType='investigate_geofence_anomaly';risk='high';}
     const policy=this.evaluateAutopilotPolicy?.(ctx,actionType,{change:a.count||1})||{allowed:true,approvalRequired:true,mode:'approve'};
     if(!policy.allowed){blocked.push({code:a.code,actionType,risk,policy});continue;}
     const proposal={schemaVersion:'opscore.autopilot-proposal.v1',actionType,incidentRef,target,reasons:[a],governance:{automaticExecution:false,approvalRequired:true,policy}};
     const digest=sha(proposal),pid=id('proposal');
     this.db.prepare('INSERT INTO autopilot_proposals(id,organization_id,incident_ref,action_type,target_json,reasons_json,risk,approval_required,status,proposal_json,proposal_sha256,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(pid,ctx.organizationId,incidentRef,actionType,JSON.stringify(target),JSON.stringify([a]),risk,1,'pending',JSON.stringify(proposal),digest,ctx.userId,now());
     proposals.push({id:pid,...proposal,risk,status:'pending',proposalSha256:digest});
   }
   return{schemaVersion:'opscore.autopilot.v2',mode:'governed',automaticExecution:false,proposals,blocked};
 };
 p.listAutopilotProposals=function(ctx,q={}){requireRole(ctx.role,'read');this._autopilotEnsure();const status=text(q.status,20);if(status)return this.db.prepare('SELECT * FROM autopilot_proposals WHERE organization_id=? AND status=? ORDER BY created_at DESC LIMIT ?').all(ctx.organizationId,status,int(q.limit,50)).map(r=>({...r,target:JSON.parse(r.target_json),reasons:JSON.parse(r.reasons_json),proposal:JSON.parse(r.proposal_json)}));return this.db.prepare('SELECT * FROM autopilot_proposals WHERE organization_id=? ORDER BY created_at DESC LIMIT ?').all(ctx.organizationId,int(q.limit,50)).map(r=>({...r,target:JSON.parse(r.target_json),reasons:JSON.parse(r.reasons_json),proposal:JSON.parse(r.proposal_json)}));};
 p.approveAutopilotProposal=function(ctx,proposalId){requireRole(ctx.role,'write');this._autopilotEnsure();let r;try{r=this.db.prepare('SELECT * FROM autopilot_proposals WHERE organization_id=? AND id=?').get(ctx.organizationId,String(proposalId));}catch(e){const m=String(e&&e.message||e);if(/does not exist|no such table|42P01/i.test(m))throw new Error('AUTOPILOT_PROPOSAL_NOT_FOUND');throw e;}if(!r)throw new Error('AUTOPILOT_PROPOSAL_NOT_FOUND');if(r.status!=='pending')throw new Error('AUTOPILOT_PROPOSAL_NOT_PENDING');this.db.prepare('UPDATE autopilot_proposals SET status=\'approved\',approved_by=?,approved_at=? WHERE organization_id=? AND id=?').run(ctx.userId,now(),ctx.organizationId,r.id);audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'autopilot_proposal_approved',resourceType:'autopilot_proposal',resourceId:r.id,metadata:{actionType:r.action_type,proposalSha256:r.proposal_sha256}});return{...r,status:'approved',approvedBy:ctx.userId,approvedAt:now(),proposalSha256:r.proposal_sha256};};
 p.rejectAutopilotProposal=function(ctx,proposalId,reason='Rejected by operator'){requireRole(ctx.role,'write');this._autopilotEnsure();const r=this.db.prepare('SELECT * FROM autopilot_proposals WHERE organization_id=? AND id=?').get(ctx.organizationId,String(proposalId));if(!r)throw new Error('AUTOPILOT_PROPOSAL_NOT_FOUND');if(r.status!=='pending')throw new Error('AUTOPILOT_PROPOSAL_NOT_PENDING');const rr=text(reason,240)||'Rejected by operator';this.db.prepare('UPDATE autopilot_proposals SET status=\'rejected\' WHERE organization_id=? AND id=?').run(ctx.organizationId,r.id);audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'autopilot_proposal_rejected',resourceType:'autopilot_proposal',resourceId:r.id,metadata:{reason:rr,actionType:r.action_type,proposalSha256:r.proposal_sha256}});return{...r,status:'rejected',reason:rr};};
 p.executeAutopilotProposal=function(ctx,proposalId){requireRole(ctx.role,'admin');this._autopilotEnsure();const r=this.db.prepare('SELECT * FROM autopilot_proposals WHERE organization_id=? AND id=?').get(ctx.organizationId,String(proposalId));if(!r)throw new Error('AUTOPILOT_PROPOSAL_NOT_FOUND');if(r.status!=='approved')throw new Error('AUTOPILOT_PROPOSAL_NOT_APPROVED');const target=JSON.parse(r.target_json||'{}');let result;switch(r.action_type){case 'keep_safe_mode':result=this.getSafeMode(ctx);break;case 'capture_twin_and_review_overdue':result=this.platformTwin(ctx);break;case 'inspect_runtime_errors':result=this.runtimeObservability(ctx);break;case 'review_capacity_assignment':result=this.platformCapacity(ctx,{});break;case 'requeue_stale_worker_jobs':result=this.recoverStaleOperationalJobs(ctx,{limit:target.limit||20});break;case 'investigate_geofence_anomaly':result=this.detectOperationalFabric(ctx);break;case 'contain_integration_delivery':this.setSafeMode(ctx,{enabled:true,reason:`Autopilot containment for ${r.id}`});result=this.getSafeMode(ctx);break;default:result={acknowledged:true,target};}
   const executedAt=now();this.db.prepare('UPDATE autopilot_proposals SET status=\'executed\',executed_by=?,executed_at=? WHERE organization_id=? AND id=?').run(ctx.userId,executedAt,ctx.organizationId,r.id);audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'autopilot_proposal_executed',resourceType:'autopilot_proposal',resourceId:r.id,metadata:{actionType:r.action_type,target,result}});return{id:r.id,status:'executed',actionType:r.action_type,executedBy:ctx.userId,executedAt,result};
 };
}
module.exports={install,ensureSchema};
