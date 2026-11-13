'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createRateLimiter,createLoginRateLimiter}=require('../src/firewall');

function makeDb(){
  const db=new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE firewall_rate_buckets(
      bucket_key TEXT PRIMARY KEY,
      window_start INTEGER NOT NULL,
      requests INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )
  `);
  return db;
}
function request(remoteAddress='198.51.100.10',headers={}){
  return {method:'POST',url:'/api/v1/auth/login',headers,socket:{remoteAddress}};
}
function config(overrides={}){
  return {
    nodeEnv:'test',
    trustProxy:false,
    trustVercelEdge:false,
    trustedProxyCidrs:[],
    firewallRateState:'database',
    firewallRateWindowMs:60000,
    firewallRateLimit:2,
    ...overrides
  };
}

test('database-backed limiter shares one atomic counter across independent limiter instances',()=>{
  const db=makeDb();
  const originalNow=Date.now;
  Date.now=()=>120000;
  try{
    const first=createRateLimiter(config(),db);
    const second=createRateLimiter(config(),db);
    assert.deepEqual(first(request()),{remaining:1,resetAt:180000});
    assert.deepEqual(second(request()),{remaining:0,resetAt:180000});
    assert.throws(()=>first(request()),/FIREWALL_RATE_LIMITED/);
    const row=db.prepare('SELECT window_start,requests FROM firewall_rate_buckets WHERE bucket_key=?').get('198.51.100.10');
    assert.equal(Number(row.window_start),120000);
    assert.equal(Number(row.requests),3);
  }finally{
    Date.now=originalNow;
    db.close();
  }
});

test('database-backed limiter resets the bucket atomically at the next window',()=>{
  const db=makeDb();
  const originalNow=Date.now;
  let now=120000;
  Date.now=()=>now;
  try{
    const enforce=createRateLimiter(config({firewallRateLimit:3}),db);
    enforce(request());
    enforce(request());
    now=180000;
    assert.deepEqual(enforce(request()),{remaining:2,resetAt:240000});
    const row=db.prepare('SELECT window_start,requests FROM firewall_rate_buckets WHERE bucket_key=?').get('198.51.100.10');
    assert.equal(Number(row.window_start),180000);
    assert.equal(Number(row.requests),1);
  }finally{
    Date.now=originalNow;
    db.close();
  }
});

test('Vercel rate-limit identity uses only the canonical edge-observed x-real-ip header',()=>{
  const limiter=createRateLimiter(config({firewallRateState:'memory',firewallRateLimit:1,trustVercelEdge:true}),null);
  const a=request('10.0.0.5',{'x-real-ip':'198.51.100.20','x-forwarded-for':'203.0.113.99'});
  const b=request('10.0.0.5',{'x-real-ip':'198.51.100.21','x-forwarded-for':'203.0.113.99'});
  assert.equal(limiter(a).remaining,0);
  assert.equal(limiter(b).remaining,0);
  assert.throws(()=>limiter(a),/FIREWALL_RATE_LIMITED/);
});

test('untrusted forwarding headers cannot select the rate-limit identity',()=>{
  const limiter=createRateLimiter(config({firewallRateState:'memory',firewallRateLimit:1,trustVercelEdge:false}),null);
  const a=request('10.0.0.5',{'x-real-ip':'198.51.100.20','x-forwarded-for':'203.0.113.99'});
  const b=request('10.0.0.5',{'x-real-ip':'198.51.100.21','x-forwarded-for':'203.0.113.98'});
  assert.equal(limiter(a).remaining,0);
  assert.throws(()=>limiter(b),/FIREWALL_RATE_LIMITED/);
});
test('shared rate bucket housekeeping removes expired IP rows',()=>{
  const db=makeDb();
  const originalNow=Date.now;
  Date.now=()=>120000;
  try{
    db.prepare('INSERT INTO firewall_rate_buckets(bucket_key,window_start,requests,updated_at) VALUES(?,?,?,?)')
      .run('expired-ip',0,7,'1970-01-01T00:00:59.000Z');
    const enforce=createRateLimiter(config(),db);
    enforce(request('198.51.100.11'));
    assert.equal(db.prepare('SELECT bucket_key FROM firewall_rate_buckets WHERE bucket_key=?').get('expired-ip'),undefined);
  }finally{
    Date.now=originalNow;
    db.close();
  }
});
test('late requests cannot move a shared rate-limit bucket backwards across windows',()=>{
  const db=makeDb();
  const originalNow=Date.now;
  let now=180000;
  Date.now=()=>now;
  try{
    const enforce=createRateLimiter(config({firewallRateLimit:3}),db);
    assert.deepEqual(enforce(request()),{remaining:2,resetAt:240000});
    now=120000;
    assert.deepEqual(enforce(request()),{remaining:1,resetAt:240000});
    const row=db.prepare('SELECT window_start,requests FROM firewall_rate_buckets WHERE bucket_key=?').get('198.51.100.10');
    assert.equal(Number(row.window_start),180000);
    assert.equal(Number(row.requests),2);
  }finally{
    Date.now=originalNow;
    db.close();
  }
});
test('production login limiter forces shared database state even when global limiter defaults to memory',()=>{
  const db=makeDb();
  const oldExpected=process.env.OPSC_EXPECTED_INSTANCES;
  const oldNow=Date.now;
  const oldVercelEnv=process.env.VERCEL_ENV;
  delete process.env.VERCEL_ENV;
  process.env.OPSC_EXPECTED_INSTANCES='1';
  Date.now=()=>120000;
  try{
    const enforce=createLoginRateLimiter(config({
      nodeEnv:'production',
      firewallRateState:'memory',
      loginRateWindowMs:60000,
      loginRateLimit:3
    }),db);
    assert.deepEqual(enforce(request()),{remaining:2,resetAt:180000});
    const row=db.prepare('SELECT requests FROM firewall_rate_buckets WHERE bucket_key=?').get('198.51.100.10');
    assert.equal(Number(row.requests),1);
  }finally{
    Date.now=oldNow;
    if(oldExpected===undefined)delete process.env.OPSC_EXPECTED_INSTANCES;
    else process.env.OPSC_EXPECTED_INSTANCES=oldExpected;
    if(oldVercelEnv===undefined)delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV=oldVercelEnv;
    db.close();
  }
});

test('non-production login limiter preserves explicit memory mode for acceptance harnesses',()=>{
  const oldExpected=process.env.OPSC_EXPECTED_INSTANCES;
  process.env.OPSC_EXPECTED_INSTANCES='1';
  try{
    const forbiddenDatabaseAccess={
      exec(){throw new Error('NON_PRODUCTION_MUST_NOT_OPEN_SHARED_TRANSACTION')},
      prepare(){throw new Error('NON_PRODUCTION_MUST_NOT_QUERY_SHARED_DATABASE')}
    };
    const oldNow=Date.now;
    Date.now=()=>120000;
    const enforce=createLoginRateLimiter(config({
      nodeEnv:'test',
      firewallRateState:'memory',
      loginRateWindowMs:60000,
      loginRateLimit:2
    }),forbiddenDatabaseAccess);
    assert.deepEqual(enforce(request()),{remaining:1,resetAt:180000});
    Date.now=oldNow;
  }finally{
    if(oldExpected===undefined)delete process.env.OPSC_EXPECTED_INSTANCES;
    else process.env.OPSC_EXPECTED_INSTANCES=oldExpected;
  }
});
test('Vercel preview does not force the production shared limiter when NODE_ENV is production',()=>{
  const oldExpected=process.env.OPSC_EXPECTED_INSTANCES;
  const oldVercelEnv=process.env.VERCEL_ENV;
  process.env.OPSC_EXPECTED_INSTANCES='1';
  process.env.VERCEL_ENV='preview';
  try{
    const forbiddenDatabaseAccess={
      exec(){throw new Error('PREVIEW_MUST_NOT_OPEN_PRODUCTION_SHARED_TRANSACTION')},
      prepare(){throw new Error('PREVIEW_MUST_NOT_QUERY_PRODUCTION_SHARED_DATABASE')}
    };
    const enforce=createLoginRateLimiter(config({
      nodeEnv:'production',
      firewallRateState:'memory',
      loginRateWindowMs:60000,
      loginRateLimit:2
    }),forbiddenDatabaseAccess);
    assert.equal(enforce(request()).remaining,1);
  }finally{
    if(oldExpected===undefined)delete process.env.OPSC_EXPECTED_INSTANCES;
    else process.env.OPSC_EXPECTED_INSTANCES=oldExpected;
    if(oldVercelEnv===undefined)delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV=oldVercelEnv;
  }
});
