const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');

function waitForServer(child){return new Promise((resolve,reject)=>{let buf='';const onData=d=>{buf+=d;const m=buf.match(/OpsCore Starter: http:\/\/[^:]+:(\d+)/);if(m){cleanup();resolve(Number(m[1]));}};const onErr=e=>{cleanup();reject(e)};const onExit=c=>{cleanup();reject(new Error(`server exited ${c}: ${buf}`))};const cleanup=()=>{child.stdout.off('data',onData);child.off('error',onErr);child.off('exit',onExit)};child.stdout.on('data',onData);child.once('error',onErr);child.once('exit',onExit)});}
function cookie(h){return String(h.get('set-cookie')||'').split(';')[0]}

const GET_ROUTES=['/api/v1/me','/api/v1/metrics','/api/v1/security-center','/api/v1/operational-intelligence','/api/v1/value-intelligence','/api/v1/control-tower','/api/v1/work-orders','/api/v1/activity','/api/v1/notifications','/api/v1/sessions','/api/v1/audit','/api/v1/sla-risks','/api/v1/appointments','/api/v1/technicians','/api/v1/inventory','/api/v1/customers','/api/v1/sites','/api/v1/assets','/api/v1/locations','/api/v1/webhooks','/api/v1/webhook-deliveries','/api/v1/hierarchy','/api/v1/deleted','/api/v1/export/work-orders.csv','/api/v1/export/customers.csv'];

test('frontend console API smoke covers every static UI GET route over HTTP',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'opscore-ui-smoke-')); const port=35000+Math.floor(Math.random()*8000);
 const child=spawn(process.execPath,['src/server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,NODE_ENV:'test',PORT:String(port),HOST:'127.0.0.1',SQLITE_PATH:path.join(dir,'db.sqlite'),OPSC_REPOSITORY_PATH:path.join(dir,'files')},stdio:['ignore','pipe','pipe']});
 try{await waitForServer(child);const base=`http://127.0.0.1:${port}`;
  const req=async(p,o={})=>fetch(base+p,{...o,headers:{...(o.body?{'content-type':'application/json'}:{}),...(o.headers||{})}});
  let r=await req('/api/v1/auth/bootstrap',{method:'POST',body:JSON.stringify({orgName:'UI Smoke',email:'owner@example.com',password:'Strong-pass-2026'})});assert.equal(r.status,201);
  r=await req('/api/v1/auth/login',{method:'POST',body:JSON.stringify({email:'owner@example.com',password:'Strong-pass-2026'})});assert.equal(r.status,200);const c=cookie(r.headers);
  // Simulate a fresh page context: JS cannot read the HttpOnly cookie, so session restoration must use the authenticated API.
  const freshContext=await req('/api/v1/me',{headers:{cookie:c}});assert.equal(freshContext.status,200);const me=await freshContext.json();assert.equal(me.user.email,'owner@example.com');
  for(const p of GET_ROUTES){const rr=await req(p,{headers:{cookie:c}});assert.ok(rr.status<400,`${p} returned ${rr.status}`);}
  for(const method of ['GET','POST','PUT','PATCH','DELETE']){
   const options={method,headers:{cookie:c}};
   if(['POST','PUT','PATCH'].includes(method))options.body='{}';
   const unknown=await req('/api/v1/__unmatched-http-smoke__',options);
   assert.equal(unknown.status,404,`${method} unknown API route must return HTTP 404`);
   assert.ok((unknown.headers.get('content-type')||'').includes('application/json'),`${method} unknown API route must return JSON`);
   assert.deepEqual(await unknown.json(),{error:{code:'NOT_FOUND'}},`${method} unknown API route response contract`);
  }
  r=await req('/api/v1/work-orders',{method:'POST',headers:{cookie:c},body:JSON.stringify({title:'UI smoke work order',description:'smoke'})});assert.equal(r.status,201);const wo=await r.json();
  r=await req(`/api/v1/work-orders/${encodeURIComponent(wo.id)}`,{headers:{cookie:c}});assert.equal(r.status,200);
  r=await req(`/api/v1/work-orders/${encodeURIComponent(wo.id)}/comments`,{method:'POST',headers:{cookie:c,'idempotency-key':'ui-smoke-comment-1'},body:JSON.stringify({body:'smoke comment'})});assert.equal(r.status,201);
  r=await req(`/api/v1/work-orders/${encodeURIComponent(wo.id)}/dispatch-candidates`,{headers:{cookie:c}});assert.equal(r.status,200);
 }finally{child.kill('SIGTERM');await new Promise(res=>child.exitCode!==null?res():child.once('exit',res));fs.rmSync(dir,{recursive:true,force:true});}
});


test('public landing page does not auto-open login during silent session restore',()=>{
 const app=fs.readFileSync(path.resolve(__dirname,'..','web','app.js'),'utf8');
 const start=app.indexOf('async function restoreSession()');
 const end=app.indexOf('restoreSession();',start);
 assert.ok(start>=0 && end>start,'restoreSession implementation exists');
 const restore=app.slice(start,end);
 assert.doesNotMatch(restore,/showAuth\('#loginPanel'\)/,'silent session failure must not open login UI');
 assert.match(restore,/setVisible\('#loginPanel',false\)/,'silent session failure must leave login UI closed');
 assert.match(restore,/api\('\/api\/v1\/me'\)/,'session restore must validate the HttpOnly cookie through /me');
});
