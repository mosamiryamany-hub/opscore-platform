'use strict';

const crypto = require('node:crypto');
const { id, now } = require('./security');
const { requireRole } = require('./rbac');
const { audit } = require('./audit');

function clean(v, fallback = '') { return String(v ?? fallback).trim(); }
function finite(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function iso(v) { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
function stable(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(stable);
  return Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])]));
}
function sha(v) { return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex'); }
function haversineM(aLat,aLon,bLat,bLon) {
  const rad=Math.PI/180,R=6371000,dLat=(bLat-aLat)*rad,dLon=(bLon-aLon)*rad;
  const x=Math.sin(dLat/2)**2+Math.cos(aLat*rad)*Math.cos(bLat*rad)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(Math.min(1,Math.max(0,x))));
}
function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dynamic_geofence_events(
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      geofence_id TEXT REFERENCES geofences(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK(event_type IN ('hazard','restriction','clear')),
      severity TEXT NOT NULL CHECK(severity IN ('low','medium','high','critical')),
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      radius_m REAL NOT NULL CHECK(radius_m > 0 AND radius_m <= 100000),
      reason TEXT NOT NULL,
      source_event_id TEXT,
      active_from TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      event_sha256 TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dynamic_geofence_org_active
      ON dynamic_geofence_events(organization_id,active_from,expires_at);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_dynamic_geofence_source_event
      ON dynamic_geofence_events(organization_id,source,source_event_id)
      WHERE source_event_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS field_signoff_assurance(
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
      actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      assurance_mode TEXT NOT NULL CHECK(assurance_mode IN ('os_local_biometric_gate','device_pin_gate','none')),
      verified_at TEXT,
      client_reference TEXT,
      document_sha256 TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_field_signoff_assurance_org_wo
      ON field_signoff_assurance(organization_id,work_order_id,created_at);
  `);
}

function attach(Store) {
  const p = Store.prototype;
  p._fieldValueEnsure = function() { ensureSchema(this.db); };

  p.predictFieldDuration = function(ctx, workOrderId, opts = {}) {
    requireRole(ctx.role, 'read');
    this._fieldValueEnsure();
    const wo = this.db.prepare(`SELECT id,customer_id,site_id,priority,status FROM work_orders WHERE id=? AND organization_id=?`).get(workOrderId, ctx.organizationId);
    if (!wo) throw new Error('NOT_FOUND');
    const limit = Math.min(Math.max(Number(opts.limit) || 30, 5), 100);
    const rows = this.db.prepare(`
      SELECT te.minutes,w.customer_id,w.site_id,w.priority
      FROM time_entries te JOIN work_orders w ON w.id=te.work_order_id
      WHERE te.organization_id=? AND te.status='stopped' AND te.minutes IS NOT NULL
        AND w.status='completed'
        AND (w.site_id=? OR w.customer_id=? OR w.priority=?)
      ORDER BY te.ended_at DESC LIMIT ?`).all(ctx.organizationId, wo.site_id, wo.customer_id, wo.priority, limit);
    const minutes = rows.map(r => Number(r.minutes)).filter(n => Number.isFinite(n) && n > 0 && n <= 1440);
    const global = this.db.prepare(`SELECT minutes FROM time_entries WHERE organization_id=? AND status='stopped' AND minutes IS NOT NULL ORDER BY ended_at DESC LIMIT 100`).all(ctx.organizationId)
      .map(r => Number(r.minutes)).filter(n => Number.isFinite(n) && n > 0 && n <= 1440);
    const sample = minutes.length ? minutes : global;
    if (!sample.length) return { schemaVersion:'opscore.field-duration-forecast.v1',workOrderId,method:'insufficient-history',predictedMinutes:null,rangeMinutes:null,confidence:'none',sampleSize:0,offlineCompatible:true };
    const sorted=[...sample].sort((a,b)=>a-b);
    const median=sorted[Math.floor(sorted.length/2)];
    const p25=sorted[Math.floor((sorted.length-1)*0.25)], p75=sorted[Math.floor((sorted.length-1)*0.75)];
    const confidence=sample.length>=15?'high':sample.length>=7?'medium':'low';
    return { schemaVersion:'opscore.field-duration-forecast.v1',workOrderId,method:minutes.length?'historical-similarity-median':'organization-history-median',predictedMinutes:median,rangeMinutes:{low:p25,high:p75},confidence,sampleSize:sample.length,features:{siteMatch:minutes.filter((_,i)=>rows[i]?.site_id===wo.site_id).length,customerMatch:minutes.filter((_,i)=>rows[i]?.customer_id===wo.customer_id).length,priority:wo.priority},offlineCompatible:true,disclaimer:'Deterministic estimate from persisted OpsCore time-entry history; no external model or weather feed is used.' };
  };

  p.recordDynamicGeofenceEvent = function(ctx, d = {}) {
    requireRole(ctx.role, 'write'); this._fieldValueEnsure();
    const source=clean(d.source), eventType=clean(d.eventType), severity=clean(d.severity), reason=clean(d.reason);
    const lat=finite(d.latitude), lon=finite(d.longitude), radius=finite(d.radiusM);
    const activeFrom=iso(d.activeFrom)||now(), expiresAt=iso(d.expiresAt);
    if (!source || source.length>80 || !['hazard','restriction','clear'].includes(eventType) || !['low','medium','high','critical'].includes(severity) || !reason || lat===null||lon===null||lat<-90||lat>90||lon<-180||lon>180||radius===null||radius<=0||radius>100000||!expiresAt||new Date(expiresAt)<=new Date(activeFrom)) throw new Error('DYNAMIC_GEOFENCE_EVENT_INVALID');
    if (d.geofenceId) { const g=this.db.prepare('SELECT id FROM geofences WHERE id=? AND organization_id=?').get(clean(d.geofenceId),ctx.organizationId); if(!g) throw new Error('GEOFENCE_NOT_FOUND'); }
    const event={source,eventType,severity,latitude:lat,longitude:lon,radiusM:radius,reason,sourceEventId:d.sourceEventId?clean(d.sourceEventId):null,activeFrom,expiresAt};
    const eventSha256=sha(event), existing=event.sourceEventId?this.db.prepare('SELECT * FROM dynamic_geofence_events WHERE organization_id=? AND source=? AND source_event_id=?').get(ctx.organizationId,source,event.sourceEventId):null;
    if(existing) return {...existing,eventSha256:existing.event_sha256,replayed:true};
    const rid=id('dge');
    this.db.prepare(`INSERT INTO dynamic_geofence_events(id,organization_id,geofence_id,source,event_type,severity,latitude,longitude,radius_m,reason,source_event_id,active_from,expires_at,event_sha256,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(rid,ctx.organizationId,d.geofenceId?clean(d.geofenceId):null,source,eventType,severity,lat,lon,radius,reason,event.sourceEventId,activeFrom,expiresAt,eventSha256,ctx.userId,now());
    audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'dynamic_geofence_event_recorded',resourceType:'dynamic_geofence_event',resourceId:rid,metadata:{source,eventType,severity,eventSha256,expiresAt}});
    return {id:rid,organizationId:ctx.organizationId,...event,eventSha256,replayed:false};
  };

  p.evaluateDynamicGeofence = function(ctx, d = {}) {
    requireRole(ctx.role, 'read'); this._fieldValueEnsure();
    const lat=finite(d.latitude), lon=finite(d.longitude), at=iso(d.at)||now();
    if(lat===null||lon===null||lat<-90||lat>90||lon<-180||lon>180) throw new Error('GEOFENCE_POINT_INVALID');
    const rows=this.db.prepare(`SELECT * FROM dynamic_geofence_events WHERE organization_id=? AND active_from<=? AND expires_at>? ORDER BY created_at DESC`).all(ctx.organizationId,at,at);
    const hazards=rows.map(r=>({...r,distanceM:haversineM(lat,lon,r.latitude,r.longitude)})).filter(r=>r.distanceM<=r.radius_m && r.event_type!=='clear');
    const clearIds=new Set(rows.filter(r=>r.event_type==='clear' && r.source_event_id).map(r=>r.source_event_id));
    const active=hazards.filter(h=>!clearIds.has(h.source_event_id));
    const order={critical:4,high:3,medium:2,low:1}; active.sort((a,b)=>order[b.severity]-order[a.severity]||a.distanceM-b.distanceM);
    return {schemaVersion:'opscore.dynamic-geofence-evaluation.v1',organizationId:ctx.organizationId,at,point:{latitude:lat,longitude:lon},allowed:active.length===0,highestSeverity:active[0]?.severity||null,hazards:active.map(x=>({id:x.id,source:x.source,eventType:x.event_type,severity:x.severity,reason:x.reason,distanceM:Number(x.distanceM.toFixed(2)),radiusM:x.radius_m,expiresAt:x.expires_at,eventSha256:x.event_sha256}))};
  };

  p.createFieldInvoiceFromWork = function(ctx, d = {}) {
    requireRole(ctx.role, 'write'); this._fieldValueEnsure();
    const workOrderId=clean(d.workOrderId), hourlyRate=finite(d.hourlyRate), currency=clean(d.currency||'USD').toUpperCase();
    if(!workOrderId || hourlyRate===null || hourlyRate<=0 || !/^[A-Z]{3}$/.test(currency)) throw new Error('FIELD_BILLING_INPUT_INVALID');
    const wo=this.db.prepare('SELECT id,customer_id,number,title,status FROM work_orders WHERE id=? AND organization_id=?').get(workOrderId,ctx.organizationId); if(!wo) throw new Error('NOT_FOUND');
    if(wo.status!=='completed') throw new Error('FIELD_BILLING_WORK_NOT_COMPLETED');
    const existing=this.db.prepare(`SELECT id,number,status,total FROM invoices WHERE organization_id=? AND work_order_id=? AND status<>'void' ORDER BY created_at DESC LIMIT 1`).get(ctx.organizationId,workOrderId);
    if(existing && d.allowDuplicate!==true) return {created:false,invoice: this.getInvoice(ctx,existing.id),reason:'INVOICE_ALREADY_EXISTS'};
    const time=this.db.prepare(`SELECT COALESCE(SUM(minutes),0) minutes FROM time_entries WHERE organization_id=? AND work_order_id=? AND status='stopped'`).get(ctx.organizationId,workOrderId);
    const minutes=Number(time?.minutes||0);
    if(minutes<=0) throw new Error('FIELD_BILLING_TIME_REQUIRED');
    const qty=Number((minutes/60).toFixed(2));
    const parts=this.db.prepare(`SELECT wp.quantity,p.name,p.sku FROM work_order_parts wp JOIN parts p ON p.id=wp.part_id WHERE wp.organization_id=? AND wp.work_order_id=? AND wp.status='consumed' ORDER BY wp.created_at`).all(ctx.organizationId,workOrderId);
    const lines=[{description:`Field service labor · ${wo.number}`,quantity:qty,unitPrice:hourlyRate}];
    for(const part of parts){ const unit=finite(d.partUnitPrices?.[part.sku]); if(unit!==null&&unit>=0) lines.push({description:`Material · ${part.name} (${part.sku})`,quantity:Number(part.quantity),unitPrice:unit}); }
    const invoice=this.createInvoice(ctx,{customerId:wo.customer_id,workOrderId,currency,lines,dueAt:d.dueAt||null,notes:d.notes||`Generated from completed field work ${wo.number}.`});
    audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'field_invoice_generated',resourceType:'invoice',resourceId:invoice.id,metadata:{workOrderId,minutes,hourlyRate,partLineCount:parts.length}});
    return {created:true,invoice,source:{workOrderId,workOrderNumber:wo.number,laborMinutes:minutes,laborHours:qty,consumedPartCount:parts.length},payment:{stripeEndpoint:'/api/v1/invoices/stripe/payment-intent',requiresBuyerConfiguredStripe:true}};
  };

  p.issueFieldSignoffChallenge = function(ctx, d = {}) {
    requireRole(ctx.role, 'write'); this._fieldValueEnsure();
    const workOrderId=clean(d.workOrderId), documentSha256=clean(d.documentSha256);
    if(!workOrderId || !/^[a-f0-9]{64}$/i.test(documentSha256)) throw new Error('SIGNOFF_CHALLENGE_INVALID');
    const wo=this.db.prepare('SELECT id,status FROM work_orders WHERE id=? AND organization_id=?').get(workOrderId,ctx.organizationId);
    if(!wo) throw new Error('NOT_FOUND');
    if(['completed','cancelled'].includes(wo.status)) throw new Error('SIGNOFF_WORK_ORDER_CLOSED');
    const challenge=crypto.randomBytes(32).toString('base64url'), issuedAt=new Date(), expiresAt=new Date(issuedAt.getTime()+120000), challengeHash=crypto.createHash('sha256').update(challenge).digest('hex');
    const aid=id('signchal');
    this.db.prepare('UPDATE field_signoff_challenges SET consumed_at=? WHERE organization_id=? AND work_order_id=? AND consumed_at IS NULL').run(issuedAt.toISOString(),ctx.organizationId,workOrderId);
    this.db.prepare('INSERT INTO field_signoff_challenges(id,organization_id,work_order_id,actor_user_id,challenge_hash,document_sha256,issued_at,expires_at,consumed_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(aid,ctx.organizationId,workOrderId,ctx.userId,challengeHash,documentSha256,issuedAt.toISOString(),expiresAt.toISOString(),null,issuedAt.toISOString());
    return {schemaVersion:'opscore.field-signoff-challenge.v1',challenge,challengeId:aid,expiresAt:expiresAt.toISOString(),workOrderId,documentSha256};
  };

  p.consumeFieldSignoffChallenge = function(ctx, d = {}) {
    requireRole(ctx.role, 'write'); this._fieldValueEnsure();
    const workOrderId=clean(d.workOrderId), challenge=clean(d.challenge), documentSha256=clean(d.documentSha256), mode=clean(d.assuranceMode||'none');
    if(!workOrderId || !challenge || !/^[a-f0-9]{64}$/i.test(documentSha256)) throw new Error('SIGNOFF_CHALLENGE_INVALID');
    if(!['os_local_biometric_gate','device_pin_gate'].includes(mode)) throw new Error('SIGNOFF_ASSURANCE_INVALID');
    const hash=crypto.createHash('sha256').update(challenge).digest('hex');
    const row=this.db.prepare('SELECT * FROM field_signoff_challenges WHERE organization_id=? AND work_order_id=? AND challenge_hash=? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1').get(ctx.organizationId,workOrderId,hash);
    if(!row) throw new Error('SIGNOFF_CHALLENGE_INVALID_OR_REPLAYED');
    if(new Date(row.expires_at).getTime()<=Date.now()) throw new Error('SIGNOFF_CHALLENGE_EXPIRED');
    if(String(row.actor_user_id)!==String(ctx.userId)) throw new Error('SIGNOFF_CHALLENGE_ACTOR_MISMATCH');
    if(String(row.document_sha256).toLowerCase()!==documentSha256.toLowerCase()) throw new Error('SIGNOFF_DOCUMENT_MISMATCH');
    const usedAt=now();
    this.db.prepare('UPDATE field_signoff_challenges SET consumed_at=? WHERE id=? AND organization_id=? AND work_order_id=? AND consumed_at IS NULL').run(usedAt,row.id,ctx.organizationId,workOrderId);
    if(this.db.prepare('SELECT consumed_at FROM field_signoff_challenges WHERE id=?').get(row.id)?.consumed_at!==usedAt) throw new Error('SIGNOFF_CHALLENGE_REPLAYED');
    return this.recordFieldSignoffAssurance(ctx,{workOrderId,assuranceMode:mode,verifiedAt:usedAt,clientReference:clean(d.clientReference),documentSha256,metadata:{challengeId:row.id,serverBound:true}});
  };

  p.recordFieldSignoffAssurance = function(ctx, d = {}) {
    requireRole(ctx.role, 'write'); this._fieldValueEnsure();
    const workOrderId=clean(d.workOrderId), mode=clean(d.assuranceMode||'none'), documentSha256=clean(d.documentSha256);
    if(!workOrderId || !['os_local_biometric_gate','device_pin_gate','none'].includes(mode)) throw new Error('SIGNOFF_ASSURANCE_INVALID');
    if(workOrderId && !this.db.prepare('SELECT id FROM work_orders WHERE id=? AND organization_id=?').get(workOrderId,ctx.organizationId)) throw new Error('NOT_FOUND');
    if(documentSha256 && !/^[a-f0-9]{64}$/i.test(documentSha256)) throw new Error('DOCUMENT_HASH_INVALID');
    if(mode==='os_local_biometric_gate' && !d.verifiedAt) throw new Error('BIOMETRIC_VERIFICATION_REQUIRED');
    const verifiedAt=iso(d.verifiedAt), assurance={mode,verifiedAt,clientReference:clean(d.clientReference),documentSha256,metadata:d.metadata&&typeof d.metadata==='object'?d.metadata:{}};
    const aid=id('assure');
    this.db.prepare(`INSERT INTO field_signoff_assurance(id,organization_id,work_order_id,actor_user_id,assurance_mode,verified_at,client_reference,document_sha256,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(aid,ctx.organizationId,workOrderId,ctx.userId,mode,verifiedAt,assurance.clientReference||null,documentSha256||null,JSON.stringify(assurance.metadata),now());
    audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'field_signoff_assurance_recorded',resourceType:'work_order',resourceId:workOrderId,metadata:{assuranceMode:mode,documentSha256:documentSha256||null}});
    return {schemaVersion:'opscore.field-signoff-assurance.v1',id:aid,workOrderId,assuranceMode:mode,verifiedAt,clientReference:assurance.clientReference||null,documentSha256:documentSha256||null,serverVerified:false,note:'The server records the client-reported OS biometric gate; it does not receive or store biometric data and does not claim independent biometric attestation.'};
  };

  p.liveFieldOperationsSnapshot = function(ctx) {
    requireRole(ctx.role,'read'); this._fieldValueEnsure();
    const map=this.dispatcherMap(ctx);
    const activeRisks=this.db.prepare(`SELECT w.id,w.number,w.title,w.priority,w.status FROM work_orders w WHERE w.organization_id=? AND w.status NOT IN ('completed','cancelled') ORDER BY CASE w.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,w.updated_at DESC LIMIT 100`).all(ctx.organizationId);
    const forecasted=activeRisks.slice(0,25).map(w=>this.predictFieldDuration(ctx,w.id));
    const dynamic=this.db.prepare(`SELECT COUNT(*) count FROM dynamic_geofence_events WHERE organization_id=? AND active_from<=? AND expires_at>? AND event_type IN ('hazard','restriction')`).get(ctx.organizationId,now(),now()).count;
    return {schemaVersion:'opscore.live-field-operations.v1',generatedAt:now(),source:{positions:'last_appointment_checkin_only',continuousTracking:false},map,openWorkOrders:activeRisks.length,dynamicHazardEvents:Number(dynamic||0),forecasts:forecasted};
  };
}
module.exports={attach,ensureSchema};
