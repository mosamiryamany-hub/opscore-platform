
'use strict';
const {warn}=require('./observability');
const crypto=require('node:crypto');
const {requireRole}=require('./rbac');
const {id,now,randomToken,hashToken}=require('./security');
const {audit}=require('./audit');
function clean(v){return String(v??'').trim();}
function sha(v){return crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');}
function ensure(db){
 // PostgreSQL schema is migration-owned; runtime must never attempt DDL.
 if (db.engine === 'postgres') return;
 db.exec(`CREATE TABLE IF NOT EXISTS asset_health_snapshots (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE, risk_level TEXT NOT NULL CHECK(risk_level IN ('low','medium','high','critical')), risk_score INTEGER NOT NULL CHECK(risk_score BETWEEN 0 AND 100), factors_json TEXT NOT NULL, assessment_sha256 TEXT NOT NULL, assessed_at TEXT NOT NULL, assessed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, UNIQUE(organization_id,asset_id,assessed_at));
 CREATE INDEX IF NOT EXISTS idx_asset_health_org_asset_time ON asset_health_snapshots(organization_id,asset_id,assessed_at);
 CREATE TABLE IF NOT EXISTS self_schedule_links (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, revoked_at TEXT, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, last_used_at TEXT);
 CREATE INDEX IF NOT EXISTS idx_self_schedule_org_wo ON self_schedule_links(organization_id,work_order_id,expires_at,revoked_at);
 CREATE TABLE IF NOT EXISTS self_schedule_bookings (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, link_id TEXT NOT NULL REFERENCES self_schedule_links(id) ON DELETE CASCADE, work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE, appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL, slot_sha256 TEXT NOT NULL, idempotency_key TEXT UNIQUE, start_at TEXT NOT NULL, end_at TEXT NOT NULL, technician_id TEXT REFERENCES users(id) ON DELETE SET NULL, status TEXT NOT NULL CHECK(status IN ('reserved','confirmed','cancelled')), created_at TEXT NOT NULL, UNIQUE(organization_id,slot_sha256));
 CREATE TABLE IF NOT EXISTS ai_agent_runs (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, model TEXT, request_sha256 TEXT NOT NULL, response_sha256 TEXT, tool_calls_json TEXT NOT NULL DEFAULT '[]', proposal_id TEXT REFERENCES autopilot_proposals(id) ON DELETE SET NULL, status TEXT NOT NULL CHECK(status IN ('completed','failed','blocked')), error_code TEXT, created_at TEXT NOT NULL, completed_at TEXT); CREATE TABLE IF NOT EXISTS opscore_knowledge_chunks (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, source_type TEXT NOT NULL, source_id TEXT NOT NULL, content TEXT NOT NULL, content_sha256 TEXT NOT NULL, embedding_text TEXT, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(organization_id,source_type,source_id,content_sha256));`);
}
function attach(Store){const p=Store.prototype;
 p.ensure2026Additions=function(){ensure(this.db);};
 p.evaluateAssetHealth=function(ctx,assetId){
  requireRole(ctx.role,'read'); ensure(this.db); const a=this.db.prepare('SELECT * FROM assets WHERE id=? AND organization_id=?').get(assetId,ctx.organizationId); if(!a)throw new Error('NOT_FOUND');
  const events=this.db.prepare('SELECT event_type,occurred_at FROM asset_events WHERE organization_id=? AND asset_id=? ORDER BY occurred_at DESC LIMIT 200').all(ctx.organizationId,a.id);
  const plans=this.db.prepare('SELECT interval_days,next_due_at,active FROM maintenance_plans WHERE organization_id=? AND asset_id=? AND active=1').all(ctx.organizationId,a.id);
  const nowMs=Date.now(); const failures=events.filter(e=>e.event_type==='failure').length; const repairs=events.filter(e=>e.event_type==='repair').length; const service=events.find(e=>['service','inspection','repair'].includes(e.event_type));
  const daysSinceService=service?Math.max(0,(nowMs-Date.parse(service.occurred_at))/86400000):null; const overduePlans=plans.filter(p=>Date.parse(p.next_due_at)<nowMs).length;
  let score=Math.min(100,failures*18+Math.max(0,failures-repairs)*12+overduePlans*18+(daysSinceService==null?20:Math.min(25,Math.floor(daysSinceService/30)*5)));
  if(a.status==='retired') score=0;
  const riskLevel=score>=75?'critical':score>=50?'high':score>=25?'medium':'low';
  const factors={failureEvents:failures,repairEvents:repairs,daysSinceService:daysSinceService===null?null:Number(daysSinceService.toFixed(1)),overdueMaintenancePlans:overduePlans,eventCount:events.length,maintenancePlanCount:plans.length,method:'deterministic_history_only'};
  const assessedAt=now(), payload={schemaVersion:'opscore.asset-health.v1',assetId:a.id,riskLevel,riskScore:score,factors,assessedAt}; const digest=sha(payload); const rec=id('health');
  this.db.prepare('INSERT INTO asset_health_snapshots(id,organization_id,asset_id,risk_level,risk_score,factors_json,assessment_sha256,assessed_at,assessed_by) VALUES(?,?,?,?,?,?,?,?,?)').run(rec,ctx.organizationId,a.id,riskLevel,score,JSON.stringify(factors),digest,assessedAt,ctx.userId);
  audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'asset_health_assessed',resourceType:'asset',resourceId:a.id,metadata:{riskLevel,riskScore:score,assessmentSha256:digest}});
  return {...payload,assessmentSha256:digest,note:'Deterministic historical assessment only; no sensor telemetry or future failure probability is claimed.'};
 };
 p.createSelfScheduleLink=function(ctx,d={}){requireRole(ctx.role,'admin');ensure(this.db);const wo=this.db.prepare('SELECT id FROM work_orders WHERE id=? AND organization_id=?').get(clean(d.workOrderId),ctx.organizationId);if(!wo)throw new Error('NOT_FOUND');const ttl=Math.min(Math.max(Number(d.ttlHours||72),1),720);const token=randomToken()+randomToken(),exp=new Date(Date.now()+ttl*3600000).toISOString(),rec=id('ssl'),t=now();this.db.prepare('INSERT INTO self_schedule_links(id,organization_id,work_order_id,token_hash,expires_at,created_by,created_at) VALUES(?,?,?,?,?,?,?)').run(rec,ctx.organizationId,wo.id,hashToken(token),exp,ctx.userId,t);return{id:rec,workOrderId:wo.id,token,expiresAt:exp};};
 function linkCtx(store,raw){const r=store.db.prepare('SELECT l.*,w.customer_id FROM self_schedule_links l JOIN work_orders w ON w.id=l.work_order_id WHERE l.token_hash=? AND l.revoked_at IS NULL').get(hashToken(String(raw||'')));if(!r||new Date(r.expires_at)<=new Date())throw new Error('SELF_SCHEDULE_TOKEN_INVALID');return r;}
 p.selfScheduleCandidates=function(raw,workOrderId){ensure(this.db);const l=linkCtx(this,raw); if(l.work_order_id!==workOrderId)throw new Error('FORBIDDEN');const w=this.db.prepare('SELECT * FROM work_orders WHERE id=? AND organization_id=?').get(workOrderId,l.organization_id);if(!w)throw new Error('FORBIDDEN');const techs=this.db.prepare("SELECT u.id FROM technician_profiles tp JOIN users u ON u.id=tp.user_id WHERE tp.organization_id=? AND tp.active=1 AND u.status='active' ORDER BY u.id LIMIT 50").all(l.organization_id);const out=[];const base=new Date();base.setMinutes(0,0,0);for(let day=0;day<14&&out.length<20;day++){for(let hour=8;hour<18&&out.length<20;hour++){for(const t of techs){const s=new Date(base.getTime()+day*86400000+hour*3600000),e=new Date(s.getTime()+60*60000);const conflict=this.db.prepare("SELECT 1 FROM appointments WHERE organization_id=? AND technician_id=? AND status NOT IN ('cancelled','no_show') AND start_at<? AND end_at>? LIMIT 1").get(l.organization_id,t.id,e.toISOString(),s.toISOString());if(conflict)continue;const conflictBook=this.db.prepare("SELECT 1 FROM self_schedule_bookings WHERE organization_id=? AND technician_id=? AND status IN ('reserved','confirmed') AND start_at<? AND end_at>? LIMIT 1").get(l.organization_id,t.id,e.toISOString(),s.toISOString());if(conflictBook)continue;const slot={workOrderId,technicianId:t.id,startAt:s.toISOString(),endAt:e.toISOString()};out.push({...slot,slotToken:sha(`${l.id}|${JSON.stringify(slot)}`)});if(out.length>=20)break;}}}this.db.prepare('UPDATE self_schedule_links SET last_used_at=? WHERE id=?').run(now(),l.id);return{schemaVersion:'opscore.self-scheduling.v1',customerId:l.customer_id,workOrderId,candidates:out,requiresCustomerConfirmation:true};};
 p.bookSelfSchedule = function(raw, workOrderId, slot = {}, idempotencyKey = '') {
  ensure(this.db);
  const outerTx = this._txDepth === 0;
  if (outerTx) this.db.exec('BEGIN IMMEDIATE');
  this._txDepth++;
  try {
    const l = linkCtx(this, raw);
    // Organization is taken only from the authenticated portal/link context — never from client body.
    const orgId = l.organization_id;
    const idem = clean(idempotencyKey);
    if (idem) {
      const previous = this.db.prepare('SELECT * FROM self_schedule_bookings WHERE organization_id=? AND link_id=? AND idempotency_key=?').get(orgId, l.id, idem);
      if (previous) {
        const result = {schemaVersion:'opscore.self-scheduling.v2',bookingId:previous.id,appointmentId:previous.appointment_id,workOrderId:previous.work_order_id,startAt:previous.start_at,endAt:previous.end_at,technicianId:previous.technician_id,confirmed:previous.status==='confirmed',idempotentReplay:true};
        this._txDepth--;
        if (outerTx) this.db.exec('COMMIT');
        return result;
      }
    }
    if (l.work_order_id !== workOrderId) throw new Error('FORBIDDEN');
    const technicianId = clean(slot.technicianId), start = clean(slot.startAt), end = clean(slot.endAt);
    if (!technicianId || !start || !end || Date.parse(end) <= Date.parse(start)) throw new Error('INVALID_SELF_SCHEDULE_SLOT');
    // Natural ledger key: work order + chosen window (stable across retries even without client key).
    const naturalSlotKey = sha(JSON.stringify({organizationId:orgId,workOrderId,startAt:start,endAt:end}));
    const priorNatural = this.db.prepare("SELECT * FROM self_schedule_bookings WHERE organization_id=? AND slot_sha256=? AND status IN ('reserved','confirmed')").get(orgId, naturalSlotKey);
    if (priorNatural) {
      const result = {schemaVersion:'opscore.self-scheduling.v2',bookingId:priorNatural.id,appointmentId:priorNatural.appointment_id,workOrderId:priorNatural.work_order_id,startAt:priorNatural.start_at,endAt:priorNatural.end_at,technicianId:priorNatural.technician_id,confirmed:priorNatural.status==='confirmed',idempotentReplay:true,naturalKeyReplay:true};
      this._txDepth--;
      if (outerTx) this.db.exec('COMMIT');
      return result;
    }
    const expected = sha(`${l.id}|${JSON.stringify({workOrderId,technicianId,startAt:start,endAt:end})}`);
    if (expected !== clean(slot.slotToken)) throw new Error('SELF_SCHEDULE_SLOT_INVALID');
    // True overlap against appointments + existing bookings (parameterized).
    const conflictAppt = this.db.prepare("SELECT 1 FROM appointments WHERE organization_id=? AND technician_id=? AND status NOT IN ('cancelled','no_show') AND start_at<? AND end_at>? LIMIT 1").get(orgId, technicianId, end, start);
    if (conflictAppt) throw new Error('TECHNICIAN_CONFLICT');
    const conflictBook = this.db.prepare("SELECT 1 FROM self_schedule_bookings WHERE organization_id=? AND technician_id=? AND status IN ('reserved','confirmed') AND start_at<? AND end_at>? LIMIT 1").get(orgId, technicianId, end, start);
    if (conflictBook) throw new Error('TECHNICIAN_CONFLICT');
    // One active booking per work order.
    const activeOnWo = this.db.prepare("SELECT 1 FROM appointments WHERE organization_id=? AND work_order_id=? AND status IN ('scheduled','confirmed','en_route') LIMIT 1").get(orgId, workOrderId);
    if (activeOnWo) throw new Error('WORK_ORDER_ALREADY_SCHEDULED');
    const t = now(), apt = id('apt'), booking = id('ssb');
    this.db.prepare('INSERT INTO appointments (id,organization_id,work_order_id,technician_id,start_at,end_at,status,customer_confirmed_at,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(apt,orgId,workOrderId,technicianId,start,end,'confirmed',t,l.created_by,t,t);
    // Prefer naturalSlotKey for UNIQUE(organization_id,slot_sha256) ledger stability across token variants.
    this.db.prepare('INSERT INTO self_schedule_bookings(id,organization_id,link_id,work_order_id,appointment_id,slot_sha256,idempotency_key,start_at,end_at,technician_id,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(booking,orgId,l.id,workOrderId,apt,naturalSlotKey,idem||null,start,end,technicianId,'confirmed',t);
    this.db.prepare('UPDATE self_schedule_links SET last_used_at=? WHERE id=? AND organization_id=?').run(t,l.id,orgId);
    const result = {schemaVersion:'opscore.self-scheduling.v2',bookingId:booking,appointmentId:apt,workOrderId,startAt:start,endAt:end,technicianId,confirmed:true,naturalKey:naturalSlotKey};
    this._txDepth--;
    if (outerTx) this.db.exec('COMMIT');
    return result;
  } catch (e) {
    this._txDepth = Math.max(0,this._txDepth-1);
    if (outerTx) {
      try { this.db.exec('ROLLBACK'); } catch (rollbackError) { warn('transaction.rollback_failed',{operation:'self_schedule_booking',error:rollbackError}); }
    }
    throw e;
  }
 };

 p.revokeSelfScheduleLink=function(ctx,linkId){requireRole(ctx.role,'admin');ensure(this.db);const r=this.db.prepare('UPDATE self_schedule_links SET revoked_at=? WHERE id=? AND organization_id=? AND revoked_at IS NULL').run(now(),linkId,ctx.organizationId);if(!r.changes)throw new Error('NOT_FOUND');return{revoked:true,id:linkId};};
 p.complianceExport=function(ctx){requireRole(ctx.role,'admin');const auditRows=this.db.prepare('SELECT action,resource_type,resource_id,created_at,event_hash FROM audit_log WHERE organization_id=? ORDER BY created_at DESC LIMIT 1000').all(ctx.organizationId);const ai=this.db.prepare('SELECT id,model,request_sha256,response_sha256,status,created_at,completed_at FROM ai_agent_runs WHERE organization_id=? ORDER BY created_at DESC LIMIT 200').all(ctx.organizationId);const purges=this.db.prepare('SELECT id,summary_json,created_at FROM privacy_purge_runs WHERE organization_id=? ORDER BY created_at DESC LIMIT 100').all(ctx.organizationId);const payload={schemaVersion:'opscore.compliance-export.v1',organizationId:ctx.organizationId,generatedAt:now(),audit:auditRows,aiTransparency:ai,privacyPurges:purges};return{...payload,exportSha256:sha(payload),note:'Operational evidence package; not a legal compliance certification.'};};
}
module.exports={attach,ensure};
