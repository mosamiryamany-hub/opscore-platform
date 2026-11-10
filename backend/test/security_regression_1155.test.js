const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto'); const fs=require('node:fs'); const os=require('node:os'); const path=require('node:path');
const {WorkerResourceGuard}=require('../src/worker-guard');
const {createRateLimiter,inspectRequest}=require('../src/firewall');
const {openDb}=require('../src/db');
const {GatewayCircuitBreaker}=require('../src/gateway-circuit-breaker');
const {registerSensitiveBuffer,withSensitiveBuffer}=require('../src/data-purger');
function fx(){const p=path.join(os.tmpdir(),`opscore-1155-${crypto.randomUUID()}.db`);const db=openDb(p);return {p,db};}
function close(f){try{f.db.close()}catch{} for(const x of [f.p,`${f.p}-wal`,`${f.p}-shm`])try{fs.unlinkSync(x)}catch{}}

test('worker admit and decision agree on critical queue bypass under pressure',()=>{const f=fx();try{const g=new WorkerResourceGuard({maxHeapMb:64,maxDbLatencyMs:10000,maxConcurrent:1});g.active=1;const d=g.decision(f.db,'billing');const a=g.admit(f.db,'billing','no-org');assert.equal(d.allow,true);assert.equal(a.allow,true);assert.equal(a.reason,'critical_queue_bypass');}finally{close(f)}});

test('worker noncritical queue is deferred and circuit opens only for noncritical',()=>{const f=fx();try{const g=new WorkerResourceGuard({maxHeapMb:64,maxDbLatencyMs:10000,maxConcurrent:1,pressureThreshold:1});g.active=1;const a=g.admit(f.db,'general','no-org');assert.equal(a.allow,false);assert.equal(a.reason,'worker_circuit_tripped');const c=g.admit(f.db,'incident','no-org');assert.equal(c.allow,true);}finally{close(f)}});

test('trusted proxy is required before X-Forwarded-For changes firewall key',()=>{const req={method:'GET',url:'/',headers:{'x-forwarded-for':'203.0.113.9'},socket:{remoteAddress:'10.0.0.7'}};const cfg={maxUrlLength:8192,maxBodyBytes:2000000,trustProxy:true,trustedProxyCidrs:['10.0.0.0/24']};assert.equal(inspectRequest(req,cfg).clientKey,'203.0.113.9');const cfg2={...cfg,trustedProxyCidrs:['192.0.2.0/24']};assert.equal(inspectRequest(req,cfg2).clientKey,'10.0.0.7');});

test('database rate limiter coordinates separate limiter instances',()=>{const f=fx();try{const cfg={firewallRateWindowMs:60000,firewallRateLimit:2,firewallRateState:'database',trustedProxyCidrs:[]};process.env.OPSC_EXPECTED_INSTANCES='2';process.env.OPSC_SHARED_STATE_CONFIRMED='true';const a=createRateLimiter(cfg,f.db),b=createRateLimiter(cfg,f.db);const req={headers:{},socket:{remoteAddress:'10.10.10.10'}};assert.equal(a(req).remaining,1);assert.equal(b(req).remaining,0);assert.throws(()=>a(req),/FIREWALL_RATE_LIMITED/);}finally{delete process.env.OPSC_EXPECTED_INSTANCES;delete process.env.OPSC_SHARED_STATE_CONFIRMED;close(f)}});

test('gateway circuit breaker persists tenant-scoped state across instances sharing the database',async()=>{const f=fx();try{f.db.exec("DROP TABLE gateway_circuit_states; CREATE TABLE gateway_circuit_states (organization_id TEXT NOT NULL, gateway_name TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('closed','open','half-open')), failures INTEGER NOT NULL DEFAULT 0, opened_at INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY(organization_id,gateway_name));");const a=new GatewayCircuitBreaker({failureThreshold:1,cooldownMs:30000,db:f.db});const b=new GatewayCircuitBreaker({failureThreshold:1,cooldownMs:30000,db:f.db});await assert.rejects(()=>a.execute('stripe',async()=>{throw new Error('x')},'org-a'),/x/);assert.equal(b.allow('stripe','org-a'),false);assert.equal(b.allow('stripe','org-b'),true);}finally{close(f)}});

test('withSensitiveBuffer zeroizes and unregisters its buffer',()=>{const b=Buffer.from('secret');withSensitiveBuffer(b,buf=>assert.equal(buf.toString(),'secret'));assert.deepEqual(b,Buffer.alloc(b.length));});
