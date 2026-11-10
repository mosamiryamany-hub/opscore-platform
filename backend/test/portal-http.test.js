const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');

function waitForServer(child){
  return new Promise((resolve,reject)=>{
    let buf='';
    const onData=d=>{buf+=d.toString(); const m=buf.match(/OpsCore Starter: http:\/\/[^:]+:(\d+)/); if(m){cleanup();resolve(Number(m[1]));}};
    const onErr=e=>{cleanup();reject(e)};
    const onExit=code=>{cleanup();reject(new Error(`server exited ${code}: ${buf}`));};
    const cleanup=()=>{child.stdout.off('data',onData);child.off('error',onErr);child.off('exit',onExit)};
    child.stdout.on('data',onData);child.once('error',onErr);child.once('exit',onExit);
  });
}
function cookieFrom(setCookie){return String(setCookie||'').split(';')[0];}

test('customer portal bootstrap works through the real HTTP route and establishes scoped HttpOnly cookie',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'opscore-portal-http-'));
  const db=path.join(dir,'portal.sqlite');
  const port=32000+Math.floor(Math.random()*10000);
  const child=spawn(process.execPath,['src/server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,NODE_ENV:'test',PORT:String(port),HOST:'127.0.0.1',SQLITE_PATH:db,OPSC_REPOSITORY_PATH:path.join(dir,'files')},stdio:['ignore','pipe','pipe']});
  try{
    await waitForServer(child);
    const base=`http://127.0.0.1:${port}`;
    const req=async(pathname,opts={})=>{const r=await fetch(base+pathname,{...opts,headers:{...(opts.body?{'content-type':'application/json'}:{}),...(opts.headers||{})}});const data=await r.json().catch(()=>null);return {r,data};};
    let x=await req('/api/v1/auth/bootstrap',{method:'POST',body:JSON.stringify({orgName:'Portal E2E',email:'owner@example.com',password:'Strong-pass-2026'})});assert.equal(x.r.status,201);
    x=await req('/api/v1/auth/login',{method:'POST',body:JSON.stringify({email:'owner@example.com',password:'Strong-pass-2026'})});assert.equal(x.r.status,200);const adminCookie=cookieFrom(x.r.headers.get('set-cookie'));assert.match(adminCookie,/^__Host-opscore_session=/);
    x=await req('/api/v1/customers',{method:'POST',headers:{cookie:adminCookie},body:JSON.stringify({name:'E2E Customer'})});assert.equal(x.r.status,201);const customer=x.data;
    x=await req('/api/v1/portal/access',{method:'POST',headers:{cookie:adminCookie},body:JSON.stringify({customerId:customer.id,ttlHours:1})});assert.equal(x.r.status,201);const bootstrapToken=x.data.token;assert.ok(bootstrapToken);
    x=await req('/api/v1/portal/exchange',{method:'POST',body:JSON.stringify({token:bootstrapToken})});assert.equal(x.r.status,200);assert.deepEqual(x.data,{ok:true,expiresAt:x.data.expiresAt});const portalCookie=cookieFrom(x.r.headers.get('set-cookie'));assert.match(portalCookie,/^__opscore_portal=/);assert.match(x.r.headers.get('set-cookie'),/HttpOnly/);assert.match(x.r.headers.get('set-cookie'),/Path=\/api\/v1\/portal/);assert.match(x.r.headers.get('set-cookie'),/SameSite=Strict/);
    x=await req('/api/v1/portal/overview',{headers:{cookie:portalCookie}});assert.equal(x.r.status,200);assert.equal(x.data.customer.id,customer.id);assert.equal(x.data.customer.name,'E2E Customer');
    x=await req('/api/v1/portal/exchange',{method:'POST',body:JSON.stringify({token:bootstrapToken})});assert.equal(x.r.status,401);assert.equal(x.data.error.code,'PORTAL_TOKEN_INVALID');
    x=await req('/api/v1/portal/overview');assert.equal(x.r.status,401);assert.equal(x.data.error.code,'PORTAL_TOKEN_INVALID');
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve=>{if(child.exitCode!==null)return resolve(); child.once('exit',resolve);});
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
