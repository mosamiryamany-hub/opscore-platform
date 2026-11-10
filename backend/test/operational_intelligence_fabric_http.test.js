const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {openDb}=require('../src/db');
const {Store}=require('../src/store');

async function start(dbPath){
 const port=41000+Math.floor(Math.random()*1000);
 const child=spawn(process.execPath,['src/server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,NODE_ENV:'test',OPSCORE_ENABLE_SIMULATION_RUNTIME:'true',HOST:'127.0.0.1',PORT:String(port),SQLITE_PATH:dbPath},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{let out='';const on=x=>{out+=x.toString();if(out.includes(`OpsCore Starter: http://127.0.0.1:${port}`)){child.stdout.off('data',on);resolve();}};child.stdout.on('data',on);child.once('exit',c=>reject(new Error(`server exit ${c}: ${out}`)));});
 return{child,base:`http://127.0.0.1:${port}`};
}

test('operational intelligence fabric is wired over authenticated HTTP',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'opscore-fabric-http-'));const dbPath=path.join(dir,'fabric.sqlite');const db=openDb(dbPath);const s=new Store(db,{sessionTtlHours:24});
 s.bootstrap({orgName:'Fabric HTTP',email:'owner@fabric-http.test',password:'Owner-strong-pass-2026'});db.close();
 const h=await start(dbPath);
 try{
  async function req(p,opts={}){const r=await fetch(h.base+p,opts);const body=await r.json().catch(()=>null);return{r,body};}
  let x=await req('/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'owner@fabric-http.test',password:'Owner-strong-pass-2026'})});
  assert.equal(x.r.status,200);const cookie=x.r.headers.get('set-cookie').split(';')[0];
  x=await req('/api/v1/platform/twin',{headers:{cookie}});assert.equal(x.r.status,200);assert.equal(x.body.schemaVersion,'opscore.operational-twin.v2');assert.ok(x.body.counts.maintenancePlans);assert.ok(x.body.distributions.assetTypes);
  x=await req('/api/v1/platform/twin/snapshots',{method:'POST',headers:{cookie,'content-type':'application/json','Idempotency-Key':'twin-snapshot-http-1'},body:JSON.stringify({})});assert.equal(x.r.status,201);assert.equal(x.body.integrity.valid,true);assert.equal(x.body.integrity.snapshotId,x.body.snapshotId);const firstSnapshotId=x.body.snapshotId;
  x=await req('/api/v1/platform/twin/snapshots',{method:'POST',headers:{cookie,'content-type':'application/json','Idempotency-Key':'twin-snapshot-http-1'},body:JSON.stringify({})});assert.equal(x.r.status,200);assert.equal(x.body.snapshotId,firstSnapshotId);assert.equal(x.r.headers.get('x-idempotency-replayed'),'true');
  x=await req('/api/v1/platform/twin/snapshots?limit=5',{headers:{cookie}});assert.equal(x.r.status,200);assert.equal(x.body.items[0].integrity,'valid');assert.equal(x.body.items.filter(i=>i.id===firstSnapshotId).length,1);
  x=await req('/api/v1/platform/twin/integrity',{headers:{cookie}});assert.equal(x.r.status,200);assert.equal(x.body.schemaVersion,'opscore.digital-twin-chain-verification.v1');assert.equal(x.body.valid,true);assert.equal(x.body.eventCount,1);
  x=await req('/api/v1/platform/twin/snapshots/'+encodeURIComponent(firstSnapshotId)+'/verify',{headers:{cookie}});assert.equal(x.r.status,200);assert.equal(x.body.valid,true);
  x=await req('/api/v1/autopilot/simulations',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({scenario:'worker-degradation',rollback:false})});
  assert.equal(x.r.status,200);assert.equal(x.body.detected,true);
  x=await req('/api/v1/autopilot/proposals/generate',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({incidentRef:'HTTP-FAB-1'})});
  assert.equal(x.r.status,201);assert.ok(Array.isArray(x.body.proposals));
  const gp=x.body.proposals.find(p=>p.actionType==='requeue_stale_worker_jobs');assert.ok(gp);
  x=await req('/api/v1/autopilot/guardrails',{headers:{cookie}});assert.equal(x.r.status,200);
  x=await req('/api/v1/autopilot/evidence-graph',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({incidentRef:'HTTP-FAB-1'})});
  assert.equal(x.r.status,200);assert.equal(x.body.schemaVersion,'opscore.causal-evidence-graph.v1');
  x=await req('/api/v1/autopilot/learning',{headers:{cookie}});assert.equal(x.r.status,200);assert.equal(x.body.schemaVersion,'opscore.autopilot-learning.v1');
  x=await req('/api/v1/autopilot/evidence-center?incidentRef=HTTP-FAB-1',{headers:{cookie}});assert.equal(x.r.status,200);assert.equal(x.body.schemaVersion,'opscore.operational-evidence-center.v1');
  x=await req('/api/v1/autopilot/evidence-integrity',{headers:{cookie}});assert.equal(x.r.status,200);assert.equal(x.body.schemaVersion,'opscore.operational-evidence-integrity.v1');assert.equal(x.body.valid,true);
  x=await req('/api/v1/autopilot/safety-contract',{headers:{cookie}});assert.equal(x.r.status,200);assert.equal(x.body.schemaVersion,'opscore.autopilot-safety-contract.v1');
  x=await req('/api/v1/autopilot/replay-package',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({incidentRef:'HTTP-FAB-1',fromAt:new Date(Date.now()-3600000).toISOString(),toAt:new Date(Date.now()+1000).toISOString()})});assert.equal(x.r.status,200);assert.equal(x.body.schemaVersion,'opscore.operational-replay-package.v1');assert.ok(x.body.packageSha256);
 }finally{h.child.kill('SIGTERM');await new Promise(r=>{if(h.child.exitCode!==null)return r();h.child.once('exit',r)});fs.rmSync(dir,{recursive:true,force:true});}
});
