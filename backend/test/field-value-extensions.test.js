'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('../src/db');
const { Store } = require('../src/store');
const { id, now } = require('../src/security');
const config = require('../src/config');

function boot(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'opscore-field-value-'));
  process.env.OPSC_REPOSITORY_PATH=dir;
  const db=openDb(':memory:');
  const store=new Store(db,config);
  const b=store.bootstrap({orgName:'Field Value Test',email:'owner@example.com',password:'CorrectHorseBattery9!'});
  return {dir,db,store,ctx:{organizationId:b.orgId,userId:b.userId,role:'owner'}};
}

test('field duration forecast uses persisted time history only',()=>{
  const x=boot();
  try{
    const {store,ctx}=x;
    const cust=store.createCustomer(ctx,{name:'Test Customer'});
    const site=store.createSite(ctx,{name:'Test Site',customerId:cust.id,latitude:30,longitude:31});
    store.db.prepare('INSERT INTO technician_profiles(user_id,organization_id,working_from_lat,working_from_lon,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(ctx.userId,ctx.organizationId,30,31,1,now(),now());
    const w=store.createWorkOrder(ctx,{customerId:cust.id,siteId:site.id,title:'Target',priority:'normal'});
    const times=[30,45,60,90,120];
    for(let i=0;i<times.length;i++){
      const wo=store.createWorkOrder(ctx,{customerId:cust.id,siteId:site.id,title:`History ${i}`,priority:'normal'});
      const start=new Date(Date.now()-times[i]*60000).toISOString(), end=new Date().toISOString();
      store.db.prepare("INSERT INTO time_entries(id,organization_id,technician_id,work_order_id,appointment_id,started_at,ended_at,status,minutes,note,source,created_by,created_at,updated_at) VALUES(?,?,?,?,?,? ,?,'stopped',?,?,?,?,?,?)").run(id('time'),ctx.organizationId,ctx.userId,wo.id,null,start,end,times[i],'','test',ctx.userId,now(),now());
      store.db.prepare("UPDATE work_orders SET status='completed',updated_at=? WHERE id=? AND organization_id=?").run(now(),wo.id,ctx.organizationId);
    }
    const out=store.predictFieldDuration(ctx,w.id);
    assert.equal(out.schemaVersion,'opscore.field-duration-forecast.v1');
    assert.equal(out.predictedMinutes,60);
    assert.equal(out.offlineCompatible,true);
    assert.ok(out.sampleSize>=5);
  } finally {x.db.close();fs.rmSync(x.dir,{recursive:true,force:true});}
});

test('dynamic geofence event blocks a point and is tenant scoped',()=>{
  const x=boot();
  try{
    const {store,ctx}=x;
    const ev=store.recordDynamicGeofenceEvent(ctx,{source:'operator',eventType:'hazard',severity:'high',latitude:30,longitude:31,radiusM:500,reason:'temporary crane exclusion',sourceEventId:'evt-1',expiresAt:new Date(Date.now()+3600000).toISOString()});
    const out=store.evaluateDynamicGeofence(ctx,{latitude:30,longitude:31});
    assert.equal(ev.replayed,false);
    assert.equal(out.allowed,false);
    assert.equal(out.hazards.length,1);
    const replay=store.recordDynamicGeofenceEvent(ctx,{source:'operator',eventType:'hazard',severity:'high',latitude:30,longitude:31,radiusM:500,reason:'temporary crane exclusion',sourceEventId:'evt-1',expiresAt:new Date(Date.now()+3600000).toISOString()});
    assert.equal(replay.replayed,true);
  } finally {x.db.close();fs.rmSync(x.dir,{recursive:true,force:true});}
});

test('field billing requires completed work with actual stopped minutes and is idempotent',()=>{
  const x=boot();
  try{
    const {store,ctx}=x;
    const cust=store.createCustomer(ctx,{name:'Billing Customer'});
    const wo=store.createWorkOrder(ctx,{customerId:cust.id,title:'Billable Field Work',priority:'normal'});
    store.db.prepare('INSERT INTO technician_profiles(user_id,organization_id,working_from_lat,working_from_lon,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(ctx.userId,ctx.organizationId,30,31,1,now(),now());
    assert.throws(()=>store.createFieldInvoiceFromWork(ctx,{workOrderId:wo.id,hourlyRate:100,currency:'USD'}),/FIELD_BILLING_WORK_NOT_COMPLETED/);
    const start=new Date(Date.now()-120*60000).toISOString(), end=new Date().toISOString();
    store.db.prepare("INSERT INTO time_entries(id,organization_id,technician_id,work_order_id,appointment_id,started_at,ended_at,status,minutes,note,source,created_by,created_at,updated_at) VALUES(?,?,?,?,?,? ,?,'stopped',?,?,?,?,?,?)").run(id('time'),ctx.organizationId,ctx.userId,wo.id,null,start,end,120,'','test',ctx.userId,now(),now());
    store.db.prepare("UPDATE work_orders SET status='completed',updated_at=? WHERE id=? AND organization_id=?").run(now(),wo.id,ctx.organizationId);
    const out=store.createFieldInvoiceFromWork(ctx,{workOrderId:wo.id,hourlyRate:100,currency:'USD'});
    assert.equal(out.created,true);
    assert.equal(out.source.laborMinutes,120);
    assert.equal(out.invoice.total,200);
    const second=store.createFieldInvoiceFromWork(ctx,{workOrderId:wo.id,hourlyRate:100,currency:'USD'});
    assert.equal(second.created,false);
    assert.equal(second.reason,'INVOICE_ALREADY_EXISTS');
  } finally {x.db.close();fs.rmSync(x.dir,{recursive:true,force:true});}
});

test('signoff assurance explicitly refuses to claim biometric attestation',()=>{
  const x=boot();
  try{
    const {store,ctx}=x;
    const cust=store.createCustomer(ctx,{name:'Signoff Customer'});
    const wo=store.createWorkOrder(ctx,{customerId:cust.id,title:'Signoff',priority:'normal'});
    const out=store.recordFieldSignoffAssurance(ctx,{workOrderId:wo.id,assuranceMode:'os_local_biometric_gate',verifiedAt:new Date().toISOString(),clientReference:'device-session-1',documentSha256:'a'.repeat(64)});
    assert.equal(out.serverVerified,false);
    assert.match(out.note,/does not claim independent biometric attestation/);
  } finally {x.db.close();fs.rmSync(x.dir,{recursive:true,force:true});}
});
