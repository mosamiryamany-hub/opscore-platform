'use strict';
const {warn}=require('./observability');
const crypto = require('node:crypto');
const { id, now } = require('./security');
const { requireRole } = require('./rbac');
const { audit } = require('./audit');
const { makeLineage } = require('./data-lineage');
const { appendChain } = require('./signature-chain');
function text(v){return String(v??'').trim();}
function iso(v){const d=new Date(v);return Number.isNaN(d.getTime())?null:d.toISOString();}
function sha(v){return crypto.createHash('sha256').update(v).digest('hex');}
function parsed(v,f=null){try{return JSON.parse(v)}catch{return f}}
function stateHash(customerId,lineId){return sha(JSON.stringify({customerId:String(customerId),lineId:String(lineId)}));}
function attach(Store){
 const p=Store.prototype;
 p.enqueueOperationalJob=function(ctx,d={}){requireRole(ctx.role,'write');const q=text(d.queueName||'general'),type=text(d.jobType);if(!['support','billing','incident','general'].includes(q)||!type||type.length>100)throw new Error('INVALID_OPERATIONAL_JOB');const payload=d.payload&&typeof d.payload==='object'&&!Array.isArray(d.payload)?d.payload:{};const max=Math.max(1,Math.min(20,Number(d.maxAttempts)||5));const available=iso(d.availableAt||new Date())||now();const jid=id('job'),t=now();this.db.prepare('INSERT INTO operational_jobs(id,organization_id,queue_name,job_type,entity_type,entity_id,payload_json,status,attempts,max_attempts,available_at,lease_until,last_error,result_json,created_by,created_at,updated_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(jid,ctx.organizationId,q,type,text(d.entityType)||null,text(d.entityId)||null,JSON.stringify(payload),'queued',0,max,available,null,null,null,ctx.userId,t,t,null);audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'operational_job_enqueued',resourceType:'operational_job',resourceId:jid,metadata:{queue:q,type}});return this.getOperationalJob(ctx,jid);};
 p.getOperationalJob=function(ctx,jid){requireRole(ctx.role,'read');const r=this.db.prepare('SELECT * FROM operational_jobs WHERE id=? AND organization_id=?').get(jid,ctx.organizationId);if(!r)throw new Error('NOT_FOUND');return {...r,payload:parsed(r.payload_json,{}),result:parsed(r.result_json,null)};};
 p.listOperationalJobs=function(ctx,q=null,status=null,limit=100){requireRole(ctx.role,'read');const args=[ctx.organizationId],w=['organization_id=?'];if(q){w.push('queue_name=?');args.push(text(q))}if(status){w.push('status=?');args.push(text(status))}args.push(Math.max(1,Math.min(500,Number(limit)||100)));return this.db.prepare(`SELECT * FROM operational_jobs WHERE ${w.join(' AND ')} ORDER BY created_at DESC LIMIT ?`).all(...args).map(r=>({...r,payload:parsed(r.payload_json,{})}));};
 p.claimOperationalJob=function(q='general',leaseSeconds=60){q=text(q);if(!['support','billing','incident','general'].includes(q))throw new Error('INVALID_OPERATIONAL_JOB_QUEUE');const t=now(),lease=new Date(Date.now()+Math.max(10,Math.min(900,Number(leaseSeconds)||60))*1000).toISOString();this.db.exec('BEGIN IMMEDIATE');try{const row=this.db.prepare("SELECT * FROM operational_jobs WHERE queue_name=? AND status IN ('queued','processing') AND available_at<=? AND (status='queued' OR lease_until IS NULL OR lease_until<?) AND attempts<max_attempts ORDER BY available_at,created_at LIMIT 1").get(q,t,t);if(!row){this.db.exec('COMMIT');return null}const r=this.db.prepare("UPDATE operational_jobs SET status='processing',attempts=attempts+1,lease_until=?,updated_at=? WHERE id=? AND status IN ('queued','processing') AND attempts<max_attempts").run(lease,t,row.id);if(r.changes!==1){this.db.exec('ROLLBACK');return null}const out=this.db.prepare('SELECT * FROM operational_jobs WHERE id=?').get(row.id);this.db.exec('COMMIT');return {...out,payload:parsed(out.payload_json,{})};}catch(e){try{this.db.exec('ROLLBACK')}catch(rollbackError){warn('transaction.rollback_failed',{operation:'execute_line_migration',error:rollbackError})}throw e;}};
 p.completeOperationalJob=function(jid,result={}){const t=now(),r=this.db.prepare("UPDATE operational_jobs SET status='completed',result_json=?,lease_until=NULL,updated_at=?,completed_at=? WHERE id=? AND status='processing'").run(JSON.stringify(result??{}),t,t,jid);if(r.changes!==1)throw new Error('OPERATIONAL_JOB_NOT_CLAIMED');return this.db.prepare('SELECT * FROM operational_jobs WHERE id=?').get(jid);};
 p.failOperationalJob=function(jid,error){const row=this.db.prepare('SELECT * FROM operational_jobs WHERE id=?').get(jid);if(!row)throw new Error('NOT_FOUND');const dead=Number(row.attempts)>=Number(row.max_attempts),status=dead?'dead_letter':'failed',backoff=Math.min(3600,2**Math.max(0,Number(row.attempts)-1)*15),available=new Date(Date.now()+backoff*1000).toISOString();this.db.prepare("UPDATE operational_jobs SET status=?,last_error=?,available_at=?,lease_until=NULL,updated_at=? WHERE id=? AND status='processing'").run(status,text(error).slice(0,500),available,now(),jid);return this.db.prepare('SELECT * FROM operational_jobs WHERE id=?').get(jid);};
 p.createServiceLine=function(ctx,d={}){requireRole(ctx.role,'write');const code=text(d.code),name=text(d.name),serviceRef=text(d.serviceRef);if(!code||code.length>80||!name||name.length>200||!serviceRef||serviceRef.length>200)throw new Error('INVALID_SERVICE_LINE');const t=now(),lid=id('line');try{this.db.prepare('INSERT INTO service_lines VALUES (?,?,?,?,?,?,?,?,?)').run(lid,ctx.organizationId,code,name,serviceRef,1,ctx.userId,t,t)}catch(e){if(String(e.message).includes('UNIQUE'))throw new Error('SERVICE_LINE_CODE_EXISTS');throw e}audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'service_line_created',resourceType:'service_line',resourceId:lid,metadata:{code,serviceRef}});return this.getServiceLine(ctx,lid);};
 p.getServiceLine=function(ctx,lid){requireRole(ctx.role,'read');const r=this.db.prepare('SELECT * FROM service_lines WHERE id=? AND organization_id=?').get(lid,ctx.organizationId);if(!r)throw new Error('NOT_FOUND');return r;};
 p.listServiceLines=function(ctx){requireRole(ctx.role,'read');return this.db.prepare('SELECT * FROM service_lines WHERE organization_id=? ORDER BY code').all(ctx.organizationId);};
 p.assignCustomerServiceLine=function(ctx,cid,lid){requireRole(ctx.role,'write');const c=this.db.prepare("SELECT id FROM customers WHERE id=? AND organization_id=? AND status='active'").get(cid,ctx.organizationId),l=this.db.prepare('SELECT id FROM service_lines WHERE id=? AND organization_id=? AND active=1').get(lid,ctx.organizationId);if(!c||!l)throw new Error('SERVICE_LINE_ASSIGNMENT_INVALID');const t=now();this.db.prepare('INSERT INTO customer_service_lines(organization_id,customer_id,line_id,assigned_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(organization_id,customer_id) DO UPDATE SET line_id=excluded.line_id,updated_at=excluded.updated_at').run(ctx.organizationId,cid,lid,t,t);audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'customer_service_line_assigned',resourceType:'customer',resourceId:cid,metadata:{lineId:lid}});return this.getCustomerServiceLine(ctx,cid);};
 p.getCustomerServiceLine=function(ctx,cid){requireRole(ctx.role,'read');const r=this.db.prepare('SELECT csl.*,l.code line_code,l.name line_name,l.service_ref FROM customer_service_lines csl JOIN service_lines l ON l.id=csl.line_id WHERE csl.organization_id=? AND csl.customer_id=?').get(ctx.organizationId,cid);if(!r)throw new Error('NOT_FOUND');return r;};
 p.preflightLineMigration=function(ctx,cid,toLid){
  requireRole(ctx.role,'write');
  const c=this.db.prepare('SELECT id,status FROM customers WHERE id=? AND organization_id=?').get(cid,ctx.organizationId);
  const dest=this.db.prepare('SELECT * FROM service_lines WHERE id=? AND organization_id=?').get(toLid,ctx.organizationId);
  const current=this.db.prepare('SELECT * FROM customer_service_lines WHERE organization_id=? AND customer_id=?').get(ctx.organizationId,cid);
  if(!c||c.status!=='active')throw new Error('MIGRATION_CUSTOMER_INVALID');
  if(!dest)throw new Error('MIGRATION_TARGET_LINE_INVALID');
  // Infrastructure readiness: real service_lines fields only (active + service_ref present). No invented cabinet tables.
  if(Number(dest.active)!==1)throw new Error('MIGRATION_TARGET_LINE_NOT_READY');
  if(!text(dest.service_ref)||text(dest.service_ref).length<1)throw new Error('MIGRATION_TARGET_LINE_NOT_READY');
  if(!current)throw new Error('MIGRATION_SOURCE_LINE_MISSING');
  if(current.line_id===toLid)throw new Error('MIGRATION_ALREADY_ON_TARGET');
  if(this.db.prepare("SELECT 1 FROM line_migration_jobs WHERE organization_id=? AND customer_id=? AND status IN ('preflight','ready','running')").get(ctx.organizationId,cid))
    throw new Error('MIGRATION_ALREADY_ACTIVE');
  const source=this.db.prepare('SELECT * FROM service_lines WHERE id=? AND organization_id=?').get(current.line_id,ctx.organizationId);
  if(!source||Number(source.active)!==1)throw new Error('MIGRATION_SOURCE_LINE_MISSING');
  // Natural idempotency key material (customer + from + to) for mobile retry safety when client key is reused at API layer.
  const naturalKey=sha(JSON.stringify({organizationId:ctx.organizationId,customerId:cid,fromLineId:source.id,toLineId:dest.id}));
  const priorByKey=this.db.prepare("SELECT id,status FROM line_migration_jobs WHERE organization_id=? AND customer_id=? AND from_line_id=? AND to_line_id=? AND status IN ('ready','running','completed') ORDER BY created_at DESC LIMIT 1").get(ctx.organizationId,cid,source.id,dest.id);
  if(priorByKey&&priorByKey.status==='completed')throw new Error('MIGRATION_ALREADY_COMPLETED');
  if(priorByKey&&(priorByKey.status==='ready'||priorByKey.status==='running'))throw new Error('MIGRATION_ALREADY_ACTIVE');
  const openWorkOrders=this.db.prepare("SELECT id,number,status,title FROM work_orders WHERE organization_id=? AND customer_id=? AND status IN ('open','in_progress','blocked') ORDER BY updated_at DESC LIMIT 50").all(ctx.organizationId,cid);
  const activeAppointments=this.db.prepare("SELECT a.id,a.work_order_id,a.status,a.start_at,a.end_at,a.technician_id FROM appointments a JOIN work_orders w ON w.id=a.work_order_id WHERE a.organization_id=? AND w.customer_id=? AND a.status IN ('scheduled','confirmed','en_route') ORDER BY a.start_at LIMIT 50").all(ctx.organizationId,cid);
  const infrastructureCheck={
    schemaVersion:'opscore.migration-infrastructure-check.v1',
    source:{id:source.id,code:source.code,active:Number(source.active)===1,serviceRef:source.service_ref},
    target:{id:dest.id,code:dest.code,active:Number(dest.active)===1,serviceRef:dest.service_ref},
    ready:true,
    checkedAt:now()
  };
  const operationalBlockers={openWorkOrderCount:openWorkOrders.length,activeAppointmentCount:activeAppointments.length,enRouteAppointmentCount:activeAppointments.filter(x=>x.status==='en_route').length,openWorkOrders,activeAppointments};
  const preflightHash=stateHash(cid,source.id);
  const jid=id('lmg'),t=now();
  const lineage=makeLineage({
    organizationId:ctx.organizationId,
    metric:'line_migration_preflight',
    sourceTables:['customers','service_lines','customer_service_lines','work_orders','appointments','line_migration_jobs'],
    filters:[`customer_id=${cid}`,`to_line_id=${dest.id}`],
    transformation:'validate_active_lines_and_capture_operational_blockers',
    evidence:[preflightHash,naturalKey,infrastructureCheck.target.serviceRef],
    generatedAt:t
  });
  const chain=appendChain(null,{action:'line_migration_preflight',jobId:jid,organizationId:ctx.organizationId,preflightHash,naturalKey,lineageSha256:lineage.lineageSha256});
  const snapshot={naturalKey,infrastructureCheck,operationalBlockers,lineage,chain};
  this.db.prepare('INSERT INTO line_migration_jobs(id,organization_id,customer_id,from_line_id,to_line_id,status,preflight_hash,before_hash,after_hash,rollback_json,error_code,created_by,created_at,updated_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(jid,ctx.organizationId,cid,source.id,dest.id,'ready',preflightHash,null,null,JSON.stringify(snapshot),null,ctx.userId,t,t,null);
  audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'line_migration_preflight',resourceType:'line_migration_job',resourceId:jid,metadata:{customerId:cid,fromLineId:source.id,toLineId:dest.id,preflightHash,naturalKey,lineageSha256:lineage.lineageSha256,chainHash:chain.chainHash,operationalBlockers:{openWorkOrderCount:operationalBlockers.openWorkOrderCount,activeAppointmentCount:operationalBlockers.activeAppointmentCount,enRouteAppointmentCount:operationalBlockers.enRouteAppointmentCount}}});
  const job=this.getLineMigration(ctx,jid);
  return {...job,naturalKey,infrastructureCheck,operationalBlockers,lineage,chain,schemaVersion:'opscore.line-migration-preflight.v3'};
};
p.getLineMigration=function(ctx,jid){
  requireRole(ctx.role,'read');
  const r=this.db.prepare('SELECT * FROM line_migration_jobs WHERE id=? AND organization_id=?').get(jid,ctx.organizationId);
  if(!r)throw new Error('NOT_FOUND');
  let snapshot=null;
  try{snapshot=r.rollback_json?JSON.parse(r.rollback_json):null;}catch{snapshot=null;}
  return {...r,snapshot};
};
p.executeLineMigration=function(ctx,jid){
  requireRole(ctx.role,'write');
  const row=this.db.prepare('SELECT * FROM line_migration_jobs WHERE id=? AND organization_id=?').get(jid,ctx.organizationId);
  if(!row)throw new Error('NOT_FOUND');
  if(row.status==='completed')return this.getLineMigration(ctx,jid); // idempotent safe replay
  if(['rolled_back','failed'].includes(row.status))throw new Error('MIGRATION_TERMINAL_STATE');
  if(row.status!=='ready')throw new Error('MIGRATION_NOT_READY');
  const dest=this.db.prepare('SELECT * FROM service_lines WHERE id=? AND organization_id=?').get(row.to_line_id,ctx.organizationId);
  if(!dest||Number(dest.active)!==1||!text(dest.service_ref))throw new Error('MIGRATION_TARGET_LINE_NOT_READY');
  const current=this.db.prepare('SELECT line_id FROM customer_service_lines WHERE organization_id=? AND customer_id=?').get(ctx.organizationId,row.customer_id);
  if(!current||current.line_id!==row.from_line_id)throw new Error('MIGRATION_SOURCE_CHANGED');
  const before=stateHash(row.customer_id,current.line_id);
  if(before!==row.preflight_hash)throw new Error('MIGRATION_PREFLIGHT_STALE');
  const enRoute=this.db.prepare("SELECT a.id FROM appointments a JOIN work_orders w ON w.id=a.work_order_id WHERE a.organization_id=? AND w.customer_id=? AND a.status='en_route' LIMIT 1").get(ctx.organizationId,row.customer_id);
  if(enRoute)throw new Error('MIGRATION_BLOCKED_EN_ROUTE_APPOINTMENT');
  const t=now(),outer=this._txDepth===0;
  if(outer)this.db.exec('BEGIN IMMEDIATE');
  this._txDepth++;
  try{
    const claim=this.db.prepare("UPDATE line_migration_jobs SET status='running',before_hash=?,updated_at=? WHERE id=? AND organization_id=? AND status='ready'").run(before,t,jid,ctx.organizationId);
    if(claim.changes!==1)throw new Error('MIGRATION_NOT_READY');
    const changed=this.db.prepare('UPDATE customer_service_lines SET line_id=?,updated_at=? WHERE organization_id=? AND customer_id=? AND line_id=?').run(row.to_line_id,t,ctx.organizationId,row.customer_id,row.from_line_id);
    if(changed.changes!==1)throw new Error('MIGRATION_CUTOVER_FAILED');
    const verify=this.db.prepare('SELECT line_id FROM customer_service_lines WHERE organization_id=? AND customer_id=?').get(ctx.organizationId,row.customer_id);
    if(!verify||verify.line_id!==row.to_line_id)throw new Error('MIGRATION_POSTCHECK_FAILED');
    const after=stateHash(row.customer_id,row.to_line_id);
    let priorSnapshot={};
    try{priorSnapshot=row.rollback_json?JSON.parse(row.rollback_json):{};}catch{priorSnapshot={};}
    const lineage=makeLineage({
      organizationId:ctx.organizationId,
      metric:'line_migration_execute',
      sourceTables:['customer_service_lines','service_lines','line_migration_jobs'],
      filters:[`job_id=${jid}`],
      transformation:'atomic_customer_service_line_cutover',
      evidence:[before,after,row.preflight_hash],
      generatedAt:t
    });
    const prevHash=(priorSnapshot.chain&&priorSnapshot.chain.chainHash)||null;
    const chain=appendChain(prevHash,{action:'line_migration_completed',jobId:jid,organizationId:ctx.organizationId,beforeHash:before,afterHash:after,lineageSha256:lineage.lineageSha256});
    const snapshot={...priorSnapshot,lineageExecute:lineage,chainExecute:chain,completedAt:t};
    this.db.prepare("UPDATE line_migration_jobs SET status='completed',after_hash=?,rollback_json=?,updated_at=?,completed_at=? WHERE id=? AND organization_id=?").run(after,JSON.stringify(snapshot),t,t,jid,ctx.organizationId);
    audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'line_migration_completed',resourceType:'line_migration_job',resourceId:jid,metadata:{customerId:row.customer_id,fromLineId:row.from_line_id,toLineId:row.to_line_id,beforeHash:before,afterHash:after,lineageSha256:lineage.lineageSha256,chainHash:chain.chainHash}});
    this._txDepth--;
    if(outer)this.db.exec('COMMIT');
    return this.getLineMigration(ctx,jid);
  }catch(e){
    this._txDepth=Math.max(0,this._txDepth-1);
    if(outer){try{this.db.exec('ROLLBACK');}catch(rollbackError){warn('transaction.rollback_failed',{operation:'line_migration_execute',error:rollbackError});}}
    // Auto-log unreachable / failure into operational_jobs (real queue, no hardcoded mock).
    try{
      this.db.prepare("INSERT INTO operational_jobs(id,organization_id,queue_name,job_type,entity_type,entity_id,payload_json,status,attempts,max_attempts,available_at,lease_until,last_error,result_json,created_by,created_at,updated_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(id('job'),ctx.organizationId,'incident','migration_unreachable','line_migration_job',jid,JSON.stringify({reasonCode:String(e&&e.message||'MIGRATION_FAILED'),customerId:row.customer_id,fromLineId:row.from_line_id,toLineId:row.to_line_id}),'queued',0,5,now(),null,String(e&&e.message||'MIGRATION_FAILED'),null,ctx.userId,now(),now(),null);
      this.db.prepare("UPDATE line_migration_jobs SET status='failed',error_code=?,updated_at=? WHERE id=? AND organization_id=? AND status IN ('ready','running')").run(String(e&&e.message||'MIGRATION_FAILED').slice(0,120),now(),jid,ctx.organizationId);
      audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'line_migration_unreachable',resourceType:'line_migration_job',resourceId:jid,metadata:{reasonCode:String(e&&e.message||'MIGRATION_FAILED')}});
    }catch(logErr){warn('migration.unreachable_log_failed',{jobId:jid,error:logErr});}
    throw e;
  }
};
p.markLineMigrationUnreachable=function(ctx,jid,d={}){
  requireRole(ctx.role,'write');
  const row=this.db.prepare('SELECT * FROM line_migration_jobs WHERE id=? AND organization_id=?').get(jid,ctx.organizationId);
  if(!row)throw new Error('NOT_FOUND');
  if(['completed','rolled_back'].includes(row.status))throw new Error('MIGRATION_TERMINAL_STATE');
  const reasonCode=text(d.reasonCode||d.reason||'FIELD_UNREACHABLE').slice(0,120);
  if(reasonCode.length<3)throw new Error('UNREACHABLE_REASON_REQUIRED');
  const t=now();
  const jobId=id('job');
  this.db.prepare("INSERT INTO operational_jobs(id,organization_id,queue_name,job_type,entity_type,entity_id,payload_json,status,attempts,max_attempts,available_at,lease_until,last_error,result_json,created_by,created_at,updated_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(jobId,ctx.organizationId,'incident','migration_unreachable','line_migration_job',jid,JSON.stringify({reasonCode,detail:text(d.detail||''),customerId:row.customer_id,fromLineId:row.from_line_id,toLineId:row.to_line_id,registeredBy:ctx.userId,registeredAt:t}),'queued',0,5,t,null,reasonCode,null,ctx.userId,t,t,null);
  this.db.prepare("UPDATE line_migration_jobs SET status='failed',error_code=?,updated_at=? WHERE id=? AND organization_id=?").run(reasonCode,t,jid,ctx.organizationId);
  const lineage=makeLineage({organizationId:ctx.organizationId,metric:'line_migration_unreachable',sourceTables:['line_migration_jobs','operational_jobs'],filters:[`job_id=${jid}`],transformation:'mark_unreachable_and_enqueue_incident',evidence:[reasonCode,jobId],generatedAt:t});
  const chain=appendChain(null,{action:'line_migration_unreachable',jobId:jid,organizationId:ctx.organizationId,reasonCode,lineageSha256:lineage.lineageSha256});
  audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'line_migration_unreachable',resourceType:'line_migration_job',resourceId:jid,metadata:{reasonCode,operationalJobId:jobId,lineageSha256:lineage.lineageSha256,chainHash:chain.chainHash}});
  return {schemaVersion:'opscore.line-migration-unreachable.v1',migration:this.getLineMigration(ctx,jid),operationalJobId:jobId,reasonCode,lineage,chain};
};
p.rollbackLineMigration=function(ctx,jid){
  requireRole(ctx.role,'admin');
  const row=this.db.prepare('SELECT * FROM line_migration_jobs WHERE id=? AND organization_id=?').get(jid,ctx.organizationId);
  if(!row)throw new Error('NOT_FOUND');
  if(row.status!=='completed')throw new Error('MIGRATION_NOT_ROLLBACKABLE');
  const current=this.db.prepare('SELECT line_id FROM customer_service_lines WHERE organization_id=? AND customer_id=?').get(ctx.organizationId,row.customer_id);
  if(!current||current.line_id!==row.to_line_id)throw new Error('MIGRATION_TARGET_CHANGED');
  const t=now();
  this.db.prepare('UPDATE customer_service_lines SET line_id=?,updated_at=? WHERE organization_id=? AND customer_id=?').run(row.from_line_id,t,ctx.organizationId,row.customer_id);
  let prior={};
  try{prior=row.rollback_json?JSON.parse(row.rollback_json):{};}catch{prior={};}
  const lineage=makeLineage({organizationId:ctx.organizationId,metric:'line_migration_rollback',sourceTables:['customer_service_lines','line_migration_jobs'],filters:[`job_id=${jid}`],transformation:'restore_from_line_id',evidence:[row.from_line_id,row.to_line_id],generatedAt:t});
  const prevHash=(prior.chainExecute&&prior.chainExecute.chainHash)||(prior.chain&&prior.chain.chainHash)||null;
  const chain=appendChain(prevHash,{action:'line_migration_rolled_back',jobId:jid,organizationId:ctx.organizationId,restoredLineId:row.from_line_id,lineageSha256:lineage.lineageSha256});
  const snapshot={...prior,rollback:{restoredLineId:row.from_line_id,at:t,lineage,chain}};
  this.db.prepare("UPDATE line_migration_jobs SET status='rolled_back',rollback_json=?,updated_at=? WHERE id=? AND organization_id=?").run(JSON.stringify(snapshot),t,jid,ctx.organizationId);
  audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'line_migration_rolled_back',resourceType:'line_migration_job',resourceId:jid,metadata:{restoredLineId:row.from_line_id,lineageSha256:lineage.lineageSha256,chainHash:chain.chainHash}});
  return this.getLineMigration(ctx,jid);
};

/**
 * Real Faults Engine — built on work_orders + service_lines + assets + operational_jobs.
 * No invented fault tables. Classification uses persisted infrastructure state only.
 */
p.classifyFaultInfrastructure=function(ctx,d={}){
  requireRole(ctx.role,'read');
  const customerId=text(d.customerId)||null;
  const assetId=text(d.assetId)||null;
  const siteId=text(d.siteId)||null;
  let line=null, asset=null, site=null;
  if(customerId){
    const csl=this.db.prepare('SELECT * FROM customer_service_lines WHERE organization_id=? AND customer_id=?').get(ctx.organizationId,customerId);
    if(csl) line=this.db.prepare('SELECT * FROM service_lines WHERE id=? AND organization_id=?').get(csl.line_id,ctx.organizationId);
  }
  if(assetId) asset=this.db.prepare('SELECT * FROM assets WHERE id=? AND organization_id=?').get(assetId,ctx.organizationId);
  if(siteId) site=this.db.prepare('SELECT * FROM sites WHERE id=? AND organization_id=?').get(siteId,ctx.organizationId);
  const infraSignals=[];
  if(line){
    if(Number(line.active)!==1) infraSignals.push({code:'SERVICE_LINE_INACTIVE',severity:'high',detail:line.code});
    if(!text(line.service_ref)) infraSignals.push({code:'SERVICE_LINE_REF_MISSING',severity:'medium',detail:line.id});
  }
  if(asset){
    if(String(asset.status||'')==='retired') infraSignals.push({code:'ASSET_RETIRED',severity:'high',detail:asset.id});
    if(String(asset.status||'')==='failed'||String(asset.status||'')==='down') infraSignals.push({code:'ASSET_DOWN',severity:'critical',detail:asset.id});
  }
  const category = infraSignals.some(s=>['SERVICE_LINE_INACTIVE','ASSET_DOWN','ASSET_RETIRED'].includes(s.code))
    ? 'infrastructure'
    : 'operational_settings';
  return {
    schemaVersion:'opscore.fault-classification.v1',
    organizationId:ctx.organizationId,
    category,
    infrastructureSignals:infraSignals,
    serviceLine:line?{id:line.id,code:line.code,active:Number(line.active)===1,serviceRef:line.service_ref}:null,
    asset:asset?{id:asset.id,status:asset.status,name:asset.name}:null,
    site:site?{id:site.id,name:site.name}:null,
    note:'Classification uses only persisted service_lines/assets/sites. migration-preflight.js remains a SQL schema release gate, not field infrastructure.'
  };
};
p.createFaultTicket=function(ctx,d={}){
  requireRole(ctx.role,'write');
  const title=text(d.title);
  if(title.length<3) throw new Error('FAULT_TITLE_REQUIRED');
  const classification=this.classifyFaultInfrastructure(ctx,{customerId:d.customerId,assetId:d.assetId,siteId:d.siteId});
  const priority = classification.category==='infrastructure' ? (d.priority||'high') : (d.priority||'normal');
  const description = [
    text(d.description)||'',
    `[fault_category=${classification.category}]`,
    classification.infrastructureSignals.length?`[signals=${classification.infrastructureSignals.map(s=>s.code).join(',')}]`:''
  ].filter(Boolean).join('\n');
  const wo=this.createWorkOrder(ctx,{
    title: title.startsWith('[FAULT]')?title:`[FAULT] ${title}`,
    description,
    priority,
    status:'open',
    customerId:d.customerId||null,
    siteId:d.siteId||null,
    assetId:d.assetId||null,
    assignedTo:d.assignedTo||null
  });
  const chain=appendChain(null,{action:'fault_ticket_created',workOrderId:wo.id,organizationId:ctx.organizationId,category:classification.category,actorUserId:ctx.userId});
  const lineage=makeLineage({
    organizationId:ctx.organizationId,
    metric:'fault_ticket_create',
    sourceTables:['work_orders','service_lines','assets','sites','customer_service_lines'],
    filters:[`work_order_id=${wo.id}`],
    transformation:'classify_and_create_work_order_as_fault',
    evidence:[classification.category,chain.chainHash],
    generatedAt:now()
  });
  audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'fault_ticket_created',resourceType:'work_order',resourceId:wo.id,metadata:{category:classification.category,lineageSha256:lineage.lineageSha256,chainHash:chain.chainHash,signals:classification.infrastructureSignals}});
  return {schemaVersion:'opscore.fault-ticket.v1',workOrder:wo,classification,lineage,chain};
};
p.transitionFaultStatus=function(ctx,workOrderId,d={}){
  requireRole(ctx.role,'write');
  const wo=this.db.prepare('SELECT * FROM work_orders WHERE id=? AND organization_id=?').get(workOrderId,ctx.organizationId);
  if(!wo) throw new Error('NOT_FOUND');
  if(!String(wo.title||'').includes('[FAULT]') && !String(wo.description||'').includes('fault_category='))
    throw new Error('NOT_A_FAULT_TICKET');
  const toStatus=text(d.status);
  if(!['open','in_progress','blocked','completed','cancelled'].includes(toStatus))
    throw new Error('INVALID_STATUS');
  if(wo.status===toStatus) return {schemaVersion:'opscore.fault-transition.v1',workOrder:this.getWorkOrder(ctx,workOrderId),idempotentReplay:true};
  if(['completed','cancelled'].includes(wo.status))
    throw new Error('FAULT_TERMINAL_STATE');
  // Closing requires explicit evidence reason (no free status flip).
  if(toStatus==='completed'){
    const reason=text(d.reason||d.transitionReason||'');
    if(reason.length<3) throw new Error('FAULT_CLOSE_REASON_REQUIRED');
  }
  const updated=this.updateWorkOrder(ctx,workOrderId,{status:toStatus,transitionReason:text(d.reason||d.transitionReason||'')||undefined});
  const payload={action:'fault_status_transition',workOrderId,organizationId:ctx.organizationId,from:wo.status,to:toStatus,actorUserId:ctx.userId,reason:text(d.reason||'')};
  const chain=appendChain(null,payload);
  const lineage=makeLineage({
    organizationId:ctx.organizationId,
    metric:'fault_status_transition',
    sourceTables:['work_orders','workflow_transition_log'],
    filters:[`work_order_id=${workOrderId}`],
    transformation:'gated_status_change_with_signature_chain',
    evidence:[wo.status,toStatus,chain.chainHash],
    generatedAt:now()
  });
  audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'fault_status_transition',resourceType:'work_order',resourceId:workOrderId,metadata:{from:wo.status,to:toStatus,lineageSha256:lineage.lineageSha256,chainHash:chain.chainHash,payloadHash:chain.payloadHash}});
  return {schemaVersion:'opscore.fault-transition.v1',workOrder:updated,from:wo.status,to:toStatus,lineage,chain};
};
p.markFaultUnreachable=function(ctx,workOrderId,d={}){
  requireRole(ctx.role,'write');
  const wo=this.db.prepare('SELECT * FROM work_orders WHERE id=? AND organization_id=?').get(workOrderId,ctx.organizationId);
  if(!wo) throw new Error('NOT_FOUND');
  if(['completed','cancelled'].includes(wo.status)) throw new Error('FAULT_TERMINAL_STATE');
  const reasonCode=text(d.reasonCode||d.reason||'FIELD_UNREACHABLE');
  if(reasonCode.length<3) throw new Error('UNREACHABLE_REASON_REQUIRED');
  const t=now();
  // Transition to blocked (not delete) — real WO status for temporary unreachable.
  const updated=this.updateWorkOrder(ctx,workOrderId,{status:'blocked',transitionReason:reasonCode});
  // Active appointments for this WO → mark no_show / revisit queue without deleting history.
  const activeAppts=this.db.prepare("SELECT id FROM appointments WHERE organization_id=? AND work_order_id=? AND status IN ('scheduled','confirmed','en_route')").all(ctx.organizationId,workOrderId);
  const appointmentResults=[];
  for(const a of activeAppts){
    try{appointmentResults.push(this.markAppointmentUnreachable(ctx,a.id,{reasonCode,detail:text(d.detail||'')}));}catch(err){appointmentResults.push({appointmentId:a.id,error:String(err&&err.message||err)});}
  }
  const jobId=id('job');
  this.db.prepare("INSERT INTO operational_jobs(id,organization_id,queue_name,job_type,entity_type,entity_id,payload_json,status,attempts,max_attempts,available_at,lease_until,last_error,result_json,created_by,created_at,updated_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(jobId,ctx.organizationId,'incident','fault_unreachable','work_order',workOrderId,JSON.stringify({reasonCode,detail:text(d.detail||''),registeredBy:ctx.userId,registeredAt:t}),'queued',0,5,t,null,reasonCode,null,ctx.userId,t,t,null);
  const hasConfigs=this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='operational_configs'").get();
  if(hasConfigs){
    const cfgId=id('cfg');
    this.db.prepare('INSERT INTO operational_configs (id,organization_id,config_key,config_value_json,version,status,created_by,description,reason,created_at,activated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(cfgId,ctx.organizationId,`fault_unreachable:${workOrderId}`,JSON.stringify({schemaVersion:'opscore.fault-unreachable.v1',workOrderId,reasonCode,detail:text(d.detail||''),at:t,actorUserId:ctx.userId}),1,'active',ctx.userId,'Fault temporary unreachable — revisit queue',reasonCode,t,t);
  }
  const chain=appendChain(null,{action:'fault_unreachable',workOrderId,organizationId:ctx.organizationId,reasonCode,actorUserId:ctx.userId});
  audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'fault_unreachable',resourceType:'work_order',resourceId:workOrderId,metadata:{reasonCode,operationalJobId:jobId,chainHash:chain.chainHash}});
  return {schemaVersion:'opscore.fault-unreachable.v1',workOrder:updated,reasonCode,operationalJobId:jobId,appointments:appointmentResults,chain,preserved:true,note:'Ticket retained as blocked; revisit queued via operational_jobs and appointments path.'};
};
p.ingestOfflineFaultEvents=function(ctx,events,blockMeta=null){
  requireRole(ctx.role,'write');
  // Offline-first: reuse atomic journal block verification when provided, then applySyncEvents.
  if(blockMeta && blockMeta.blockHash){
    const normalizedEvents=(Array.isArray(events)?events:[]).map((e,i)=>({sequence:i,clientEventId:String(e.clientEventId||e.id||('evt-'+i)),operation:String(e.operation||'status_update'),entityId:String(e.entityId||e.workOrderId||''),payload:e.payload||e,createdAt:e.createdAt||now()}));
    const block={blockId:blockMeta.blockId,actorId:blockMeta.actorId||ctx.userId,events:normalizedEvents,eventCount:normalizedEvents.length,blockHash:blockMeta.blockHash};
    block.eventCount=block.events.length;
    const {verifyBlock}=require('./sync-atomic-journal');
    if(!verifyBlock(block)) throw new Error('SYNC_BLOCK_INVALID');
  }
  const normalized=(Array.isArray(events)?events:[]).map(e=>({
    clientEventId:String(e.clientEventId||e.id||id('cevt')),
    operation:String(e.operation||'status_update'),
    entityId:String(e.entityId||e.workOrderId||''),
    entityType:'work_order',
    payload:e.payload||{status:e.status,reason:e.reason},
    createdAt:e.createdAt||now()
  }));
  // Prefer existing applySyncEvents when available.
  if(typeof this.applySyncEvents==='function'){
    return this.applySyncEvents(ctx,normalized,blockMeta);
  }
  throw new Error('SYNC_PATH_UNAVAILABLE');
};

p.reconcileCommercial=function(ctx,options={}){requireRole(ctx.role,'read');const provider=text(options.provider||'local');if(!['local','stripe'].includes(provider))throw new Error('RECONCILIATION_PROVIDER_INVALID');const invs=this.db.prepare("SELECT id,number,status,currency,total,amount_paid FROM invoices WHERE organization_id=? AND status NOT IN ('void','draft') ORDER BY created_at").all(ctx.organizationId);const rows=invs.map(i=>{const ledgerPaid=Number(this.db.prepare('SELECT COALESCE(SUM(amount),0) AS paid FROM invoice_payments WHERE organization_id=? AND invoice_id=?').get(ctx.organizationId,i.id)?.paid||0);const invoicePaid=Number(i.amount_paid||0);const delta=Number((ledgerPaid-invoicePaid).toFixed(2));return {...i,ledgerPaid,sourcePaid:invoicePaid,delta,status:Math.abs(delta)<=0.009?'matched':'mismatch'}});const matched=rows.filter(x=>x.status==='matched').length,mismatch=rows.length-matched;const report={schemaVersion:'opscore.payment-reconciliation.v2',provider,providerStatus:provider==='stripe'?'remote_adapter_not_configured':'local_ledger_verified',generatedAt:now(),matchedCount:matched,mismatchCount:mismatch,unmatchedCount:0,invoices:rows,notes:provider==='stripe'?'Stripe is not contacted by this reconciliation path; no remote state is fabricated.':'Compares invoice.amount_paid with the tenant-scoped persisted invoice_payments ledger.'};const rid=id('recon'),t=now();this.db.prepare('INSERT INTO payment_reconciliation_runs(id,organization_id,provider,scope_json,matched_count,mismatch_count,unmatched_count,report_json,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(rid,ctx.organizationId,provider,JSON.stringify({statuses:['issued','partially_paid','paid','overdue']}),matched,mismatch,0,JSON.stringify(report),'completed',ctx.userId,t);audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'payment_reconciliation_run',resourceType:'payment_reconciliation_run',resourceId:rid,metadata:{provider,matched,mismatch}});return {id:rid,...report};};
 p.reconcileCommercialStripe=async function(ctx,options={}){requireRole(ctx.role,'read');const secret=text(process.env.STRIPE_SECRET_KEY);if(!secret)throw new Error('STRIPE_NOT_CONFIGURED');const timeoutMs=Math.max(1000,Math.min(30000,Number(options.timeoutMs||process.env.STRIPE_API_TIMEOUT_MS||8000)));const maxPages=Math.max(1,Math.min(100,Number(options.maxPages||20)));const invs=this.db.prepare("SELECT id,number,status,currency,total,amount_paid FROM invoices WHERE organization_id=? AND status NOT IN ('void','draft') ORDER BY created_at").all(ctx.organizationId);const allowed=new Map(invs.map(i=>[i.id,i]));const remoteByInvoice=new Map(),unmatchedRemote=[];let startingAfter=null,hasMore=true,pageCount=0;while(hasMore&&pageCount<maxPages){const qs=new URLSearchParams({limit:'100'});if(startingAfter)qs.set('starting_after',startingAfter);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);let data;try{const r=await fetch(`https://api.stripe.com/v1/payment_intents?${qs.toString()}`,{method:'GET',signal:controller.signal,headers:{authorization:`Bearer ${secret}`,accept:'application/json'}});if(!r.ok)throw new Error('STRIPE_RECONCILIATION_HTTP_ERROR');data=await r.json()}catch(e){if(e?.name==='AbortError')throw new Error('STRIPE_RECONCILIATION_TIMEOUT');throw e}finally{clearTimeout(timer)}if(!data||!Array.isArray(data.data))throw new Error('STRIPE_RECONCILIATION_INVALID_RESPONSE');for(const pi of data.data){if(String(pi?.metadata?.opscore_organization_id||'')!==String(ctx.organizationId))continue;const invoiceId=text(pi?.metadata?.opscore_invoice_id);if(!invoiceId||!allowed.has(invoiceId)){unmatchedRemote.push({paymentIntentId:pi?.id||null,invoiceId:invoiceId||null,amount:Number(pi?.amount_received||0)/100,currency:String(pi?.currency||'').toUpperCase(),status:pi?.status||null});continue}const cents=Number(pi?.amount_received||0);if(!Number.isFinite(cents)||cents<0)throw new Error('STRIPE_RECONCILIATION_INVALID_AMOUNT');if(!remoteByInvoice.has(invoiceId))remoteByInvoice.set(invoiceId,{amountCents:0,paymentIntentIds:[]});const slot=remoteByInvoice.get(invoiceId);slot.amountCents+=cents;if(pi?.id)slot.paymentIntentIds.push(pi.id)}pageCount++;hasMore=Boolean(data.has_more);startingAfter=data.data.length?data.data[data.data.length-1].id:null;if(hasMore&&!startingAfter)throw new Error('STRIPE_RECONCILIATION_PAGINATION_INVALID')}if(hasMore)throw new Error('STRIPE_RECONCILIATION_PAGE_LIMIT');const rows=invs.map(i=>{const localStripePaid=Number(this.db.prepare("SELECT COALESCE(SUM(amount),0) paid FROM invoice_payments WHERE organization_id=? AND invoice_id=? AND source='stripe'").get(ctx.organizationId,i.id)?.paid||0);const remotePaid=Number(((remoteByInvoice.get(i.id)?.amountCents||0)/100).toFixed(2));const delta=Number((remotePaid-localStripePaid).toFixed(2));return {...i,localStripePaid,remotePaid,delta,status:Math.abs(delta)<=0.009?'matched':'mismatch',paymentIntentIds:remoteByInvoice.get(i.id)?.paymentIntentIds||[]}});const matched=rows.filter(x=>x.status==='matched').length,mismatch=rows.length-matched,unmatched=unmatchedRemote.length;const report={schemaVersion:'opscore.payment-reconciliation.v3',provider:'stripe',providerStatus:'stripe_remote_verified',generatedAt:now(),matchedCount:matched,mismatchCount:mismatch,unmatchedCount:unmatched,pageCount,invoices:rows,unmatchedRemote,notes:'Compares Stripe PaymentIntents received amounts to the tenant-scoped local Stripe payment ledger using OpsCore invoice metadata. This operation does not mutate invoice balances.'};const rid=id('recon'),t=now();this.db.prepare('INSERT INTO payment_reconciliation_runs(id,organization_id,provider,scope_json,matched_count,mismatch_count,unmatched_count,report_json,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(rid,ctx.organizationId,'stripe',JSON.stringify({statuses:['issued','partially_paid','paid','overdue'],pageCount}),matched,mismatch,unmatched,JSON.stringify(report),'completed',ctx.userId,t);audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'payment_reconciliation_run',resourceType:'payment_reconciliation_run',resourceId:rid,metadata:{provider:'stripe',matched,mismatch,unmatched}});return {id:rid,...report}};
 p.latestReconciliation=function(ctx){requireRole(ctx.role,'read');const r=this.db.prepare('SELECT * FROM payment_reconciliation_runs WHERE organization_id=? ORDER BY created_at DESC LIMIT 1').get(ctx.organizationId);return r?{...r,report:parsed(r.report_json,{})}:null;};
}
module.exports={attach};
