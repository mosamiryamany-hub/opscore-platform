#!/usr/bin/env node
'use strict';
const config=require('../src/config');
const {openDb}=require('../src/db');
const {Store}=require('../src/store');
const {breaker}=require('../src/enterprise-value-additions');
const {purgeExpired}=require('../src/data-purger');
const {purgeExpiredRateBuckets}=require('../src/firewall');
const {WorkerResourceGuard}=require('../src/worker-guard');
const workerGuard=new WorkerResourceGuard();

// This worker currently uses node:sqlite directly. Refuse PostgreSQL deployments rather than
// silently processing a second, unrelated SQLite database beside the production Postgres runtime.
if (String(config.databaseEngine || 'sqlite').trim().toLowerCase() === 'postgres') {
  process.stderr.write('OPSC_POSTGRES_WORKER_NOT_IMPLEMENTED\n');
  process.exit(1);
}
function purgeForOrg(organizationId){ try { const result=purgeExpired(store.db,{repositoryPath:process.env.OPSC_REPOSITORY_PATH||'./data/files'}); store.db.prepare('INSERT INTO privacy_purge_runs(id,organization_id,summary_json,created_at) VALUES (?,?,?,?)').run(`purge_${Date.now()}_${organizationId}`,organizationId,JSON.stringify({...result,organizationId}),new Date().toISOString()); return {...result,organizationId}; } catch(e){ return {error:e.message,organizationId}; } }
const queues=String(process.env.OPSC_WORKER_QUEUES||'support,billing,incident,general').split(',').map(x=>x.trim()).filter((x,i,a)=>x&&a.indexOf(x)===i);
const once=String(process.env.OPSC_WORKER_ONCE||'false').toLowerCase()==='true';
const interval=Math.max(250,Number(process.env.OPSC_WORKER_POLL_MS||1000));
const db=openDb(),store=new Store(db,config);
async function handle(job){
  const system={organizationId:job.organization_id,userId:job.created_by||'system-worker',role:'admin',apiKeyId:null,scopes:['*'],worker:true};
  if(job.job_type==='invoice_reconciliation'){
    const provider=job.payload?.provider||'local';
    return breaker.execute(`billing:${provider}`,()=>provider==='stripe'?store.reconcileCommercialStripe(system,{}):store.reconcileCommercial(system,{provider}));
  }
  if(job.job_type==='closure_sheet_compile'){
    return store.compileClosureSheet(system,{date:job.payload?.date,technicianId:job.payload?.technicianId||null});
  }
  if(job.job_type==='field_event_observation'){
    const payload = job.payload && typeof job.payload === 'object' ? job.payload : {};
    const eventKey = String(payload.eventKey || '');
    if(!eventKey) throw new Error('FIELD_EVENT_KEY_REQUIRED');
    store.db.prepare(`INSERT OR IGNORE INTO operational_event_receipts
      (id,organization_id,event_key,event_type,aggregate_type,aggregate_id,payload_json,event_sha256,observed_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(
        `orec_${Date.now()}_${Math.random().toString(16).slice(2)}`, job.organization_id, eventKey, 'field.sync.applied', 'sync_event',
        String(payload.clientEventId || job.entity_id || ''), JSON.stringify(payload), String(payload.eventHash || ''), new Date().toISOString()
      );
    return {observed:true,eventKey};
  }
  if(job.job_type==='notification_delivery'){
    const payload=job.payload&&typeof job.payload==='object'?job.payload:{};
    if(!payload.notificationId||!payload.channel||!payload.to) throw new Error('NOTIFICATION_DELIVERY_INPUT_REQUIRED');
    return store.deliverNotificationExternal(system,payload.notificationId,{channel:payload.channel,to:payload.to});
  }
  if(job.job_type==='outbox_housekeeping'){
    const r=store.db.prepare("UPDATE integration_outbox SET status='failed',last_error='WORKER_LEASE_EXPIRED',updated_at=? WHERE organization_id=? AND status='processing' AND updated_at<?").run(new Date().toISOString(),job.organization_id,new Date(Date.now()-15*60*1000).toISOString());
    return {requeuedExpiredOutbox:r.changes,organizationId:job.organization_id};
  }
  throw new Error('OPERATIONAL_JOB_TYPE_UNSUPPORTED');
}
let busy=false;
let lastRateBucketPurge=0;
async function tick(){
  if(busy)return false;
  busy=true;
  let did=false;
  try{
    if(Date.now()-lastRateBucketPurge>=Math.max(60000, Number(process.env.OPSC_FIREWALL_RATE_PURGE_MS||300000))){
      try { purgeExpiredRateBuckets(store.db,Date.now(),Math.max(60000,Number(process.env.FIREWALL_RATE_WINDOW_MS||60000))); } catch(e){ process.stderr.write(JSON.stringify({status:'rate_bucket_cleanup_failed',error:e.message})+'\n'); }
      lastRateBucketPurge=Date.now();
    }
    for(const queue of queues){
      const decision=workerGuard.admit(store.db,queue,null);
      if(!decision.allow){ continue; }
      workerGuard.active++;
      try {
        const j=store.claimOperationalJob(queue,60);
        if(!j) continue;
        did=true;
        try{const out=await handle(j);store.completeOperationalJob(j.id,out);process.stdout.write(JSON.stringify({status:'completed',jobId:j.id,queue})+'\n');}
        catch(e){store.failOperationalJob(j.id,e.message);process.stderr.write(JSON.stringify({status:'failed',jobId:j.id,error:e.message,queue})+'\n');}
        break;
      } finally {
        workerGuard.active=Math.max(0,workerGuard.active-1);
      }
    }
    return did;
  } finally {busy=false;}
}
function stop(){clearInterval(timer);db.close();process.exit(0)}
if(String(process.env.OPSC_WORKER_PURGE==='true')){ try { purgeExpired(store.db,{}); } catch {} }
const timer=setInterval(()=>{tick().then(did=>{if(!did&&once)stop()}).catch(()=>{if(once)stop()})},interval);
process.on('SIGINT',stop);process.on('SIGTERM',stop);
tick().catch(()=>{});
