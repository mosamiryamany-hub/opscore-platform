'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const crypto=require('node:crypto');
const {Pool}=require('pg');

const connectionString=process.env.OPSC_PG_ACCEPTANCE_URL;
const workerCode=`
const {openPgDatabaseSync}=require('./src/pg-database-sync');
const {createRateLimiter}=require('./src/firewall');
const db=openPgDatabaseSync(process.env.OPSC_PG_ACCEPTANCE_URL,{max:1});
try{
  const enforce=createRateLimiter({
    nodeEnv:'test',
    trustProxy:false,
    trustVercelEdge:false,
    trustedProxyCidrs:[],
    firewallRateState:'database',
    firewallRateWindowMs:604800000,
    firewallRateLimit:100
  },db);
  const result=enforce({
    method:'POST',
    url:'/api/v1/auth/login',
    headers:{},
    socket:{remoteAddress:process.env.OPSC_RATE_TEST_BUCKET}
  });
  db.close();
  process.stdout.write(JSON.stringify(result));
}catch(error){
  try{db.close()}catch(_){}
  process.stderr.write(String(error&&error.stack||error));
  process.exitCode=1;
}`;

function invokeWorker(bucket){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['-e',workerCode],{
      cwd:path.resolve(__dirname,'..'),
      env:{
        ...process.env,
        OPSC_PG_ACCEPTANCE_URL:connectionString,
        OPSC_RATE_TEST_BUCKET:bucket,
        OPSC_PG_POOL_MAX:'1',
        OPSC_PG_SSL_MODE:process.env.OPSC_PG_SSL_MODE||'disable',
        OPSC_EXPECTED_INSTANCES:'1'
      },
      stdio:['ignore','pipe','pipe']
    });
    let stdout='',stderr='';
    const timeout=setTimeout(()=>child.kill('SIGKILL'),60000);
    child.stdout.setEncoding('utf8').on('data',chunk=>stdout+=chunk);
    child.stderr.setEncoding('utf8').on('data',chunk=>stderr+=chunk);
    child.once('error',error=>{clearTimeout(timeout);reject(error)});
    child.once('close',(code,signal)=>{
      clearTimeout(timeout);
      if(code!==0)return reject(new Error(`rate-limit worker failed code=${code} signal=${signal} stderr=${stderr.slice(0,1200)}`));
      try{resolve(JSON.parse(stdout))}catch(error){reject(new Error(`invalid worker output: ${stdout.slice(0,500)}; ${error.message}; stderr=${stderr.slice(0,500)}`))}
    });
  });
}

test('shared PostgreSQL rate limiter increments atomically across independent runtime processes',{
  skip:!connectionString,
  timeout:120000
},async()=>{
  const pool=new Pool({connectionString,max:2,connectionTimeoutMillis:10000});
  const bucket=`opscore-rate-test:${crypto.randomUUID()}`;
  try{
    const identity=await pool.query('SELECT current_user AS role_name');
    assert.equal(identity.rows[0].role_name,'opscore_runtime','the integration test must use the least-privilege runtime role');
    await pool.query('DELETE FROM public.firewall_rate_buckets WHERE bucket_key=$1',[bucket]);
    const total=16;
    const settled=await Promise.allSettled(Array.from({length:total},()=>invokeWorker(bucket)));
    const failures=settled.filter(x=>x.status==='rejected');
    assert.equal(failures.length,0,failures.map(x=>String(x.reason)).join('\n'));
    const counts=settled.map(x=>100-x.value.remaining).sort((a,b)=>a-b);
    assert.deepEqual(counts,Array.from({length:total},(_,i)=>i+1),'every concurrent request must observe a unique atomic counter value');
    const final=await pool.query('SELECT requests FROM public.firewall_rate_buckets WHERE bucket_key=$1',[bucket]);
    assert.equal(Number(final.rows[0]?.requests),total);
  }finally{
    await pool.query('DELETE FROM public.firewall_rate_buckets WHERE bucket_key=$1',[bucket]).catch(()=>{});
    await pool.end();
  }
});
