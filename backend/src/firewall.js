'use strict';
const {warn}=require('./observability');
const crypto = require('node:crypto');
const net = require('node:net');
const dns = require('node:dns').promises;
const netUtil = require('node:net');
const {isPrivateAddress}=require('./security');
const {hasVerifiedProductionRelease}=require('./release-proof');

const MAX_MEMORY_BUCKETS = 10000;
const suspicious = [
  /(?:union\s+select|select\s+.*\s+from\s+|drop\s+table|alter\s+table|insert\s+into|delete\s+from)/i,
  /(?:<script\b|javascript:|on(?:error|load|click)\s*=)/i,
  /(?:\.\.\/|\.\.\\)/,
  /(?:\x00|\r\n(?:host|content-length|transfer-encoding)\s*:)/i
];
function ipv4ToInt(ip){return ip.split('.').reduce((n,o)=>((n<<8) + Number(o))>>>0,0);}
function cidrContains(ip,cidr){
  const [base,bitsRaw]=String(cidr).split('/'); const bits=Number(bitsRaw);
  if(netUtil.isIP(ip)!==4 || netUtil.isIP(base)!==4 || !Number.isInteger(bits)||bits<0||bits>32) return false;
  const mask=bits===0?0:(0xffffffff << (32-bits))>>>0;
  return (ipv4ToInt(ip)&mask)===(ipv4ToInt(base)&mask);
}
function isTrustedProxy(remoteAddress, config){
  const peers=(config?.trustedProxyCidrs||[]).map(String).map(x=>x.trim()).filter(Boolean);
  const remote=String(remoteAddress||'');
  return peers.some(c=>c.includes('/')?cidrContains(remote,c):remote===c);
}
function clientKey(req, config){
  const remote=String(req.socket?.remoteAddress || 'unknown');
  const headers=req.headers || {};
  // Vercel overwrites x-real-ip at its edge with the observed client IP.
  // Trust this canonical header only inside Vercel Functions, and only when
  // it contains one syntactically valid IP address.
  if(config?.trustVercelEdge){
    const edgeIp=String(headers['x-real-ip'] || '').trim();
    if(net.isIP(edgeIp)) return edgeIp;
  }
  // For self-hosted reverse proxies, require an explicit trusted peer CIDR.
  const useForwarded=Boolean(config?.trustProxy && isTrustedProxy(remote,config));
  const forwarded=useForwarded ? headers['x-forwarded-for'] : null;
  const candidate=String(forwarded || remote).split(',')[0].trim();
  return net.isIP(candidate) ? candidate : (candidate || 'unknown');
}
function assertRateLimiterDeployment(config, db){
  const rawExpected=process.env.OPSC_EXPECTED_INSTANCES;
  const production=String(config?.nodeEnv||process.env.NODE_ENV||'development').toLowerCase()==='production';
  if (production && (rawExpected === undefined || !/^\d+$/.test(String(rawExpected)) || Number(rawExpected) < 1)) {
    throw new Error('FIREWALL_EXPECTED_INSTANCES_REQUIRED');
  }
  const expected=rawExpected === undefined ? 1 : Number(rawExpected);
  const shared=String(config?.firewallRateState||'memory').toLowerCase()==='database';
  if(expected>1 && (!shared || !db || String(process.env.OPSC_SHARED_STATE_CONFIRMED||'false').toLowerCase()!=='true')){
    throw new Error('FIREWALL_SHARED_STATE_REQUIRED');
  }
}
function inspectRequest(req, config){
  const method=String(req.method||'GET').toUpperCase();
  const allowed=new Set(['GET','POST','PUT','PATCH','DELETE','OPTIONS','HEAD']);
  if(!allowed.has(method)) throw new Error('FIREWALL_METHOD_BLOCKED');
  const url=String(req.url||'');
  if(url.length>config.maxUrlLength) throw new Error('FIREWALL_URI_TOO_LONG');
  const target=url.slice(0,config.maxUrlLength);
  let decoded=target;
  try {
    for (let i = 0; i < 8; i++) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
    decoded = decoded.normalize('NFKC');
  } catch { throw new Error('FIREWALL_REQUEST_BLOCKED'); }
  if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(decoded)) throw new Error('FIREWALL_REQUEST_BLOCKED');
  if(suspicious.some(rx=>rx.test(decoded))) throw new Error('FIREWALL_REQUEST_BLOCKED');
  for(const [k,v] of Object.entries(req.headers||{})){
    if(String(k).length>128 || String(v).length>8192 || /[\r\n]/.test(String(k)) || /[\r\n]/.test(String(v))) throw new Error('FIREWALL_HEADER_BLOCKED');
  }
  const cl=req.headers['content-length'];
  if(cl!==undefined && (!/^\d+$/.test(String(cl)) || Number(cl)>config.maxBodyBytes)) throw new Error('FIREWALL_BODY_BLOCKED');
  return {clientKey:clientKey(req,config),method,path:target};
}
function productionSafetyGate(config, env = process.env, releaseVerifier = hasVerifiedProductionRelease){
  const nodeEnv=String(config?.nodeEnv||env.NODE_ENV||'development').trim().toLowerCase();
  if(nodeEnv!=='production') return {allowed:true,mode:'development'};
  // Operator-explicit open: OPSC_PRODUCTION_HOLD=false is the sole production traffic gate.
  // Full release evidence remains independently reported by /api/verify/release and is not
  // fabricated here. When hold is not explicitly false, production stays closed.
  if(String(env.OPSC_PRODUCTION_HOLD||'true').toLowerCase()!=='false') throw new Error('PRODUCTION_HOLD_ACTIVE');
  const releaseOk = String(env.OPSC_RELEASE_VERIFIED||'').toLowerCase()==='true' &&
    typeof releaseVerifier==='function' && releaseVerifier(env);
  return {allowed:true,mode: releaseOk ? 'production' : 'production-operator-open'};
}
function validateOsrmBaseUrl(raw, {production=false}={}){
  let u; try{u=new URL(String(raw||''));}catch{throw new Error('OSRM_BASE_URL_INVALID');}
  if(!['http:','https:'].includes(u.protocol) || u.username || u.password) throw new Error('OSRM_BASE_URL_INVALID');
  const hosts=String(process.env.OSRM_ALLOWED_HOSTS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  const host=u.hostname.toLowerCase();
  if(production && (!hosts.length || !hosts.includes(host))) throw new Error('OSRM_HOST_NOT_ALLOWLISTED');
  if(host==='localhost' || host==='127.0.0.1' || host==='::1') return u;
  if(net.isIP(host)) return u;
  return u;
}
async function assertOsrmHostResolvesSafely(raw){
  const production=String(process.env.NODE_ENV||'development').toLowerCase()==='production';
  const u=validateOsrmBaseUrl(raw,{production});
  const hosts=String(process.env.OSRM_ALLOWED_HOSTS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(hosts.length && !hosts.includes(u.hostname.toLowerCase())) throw new Error('OSRM_HOST_NOT_ALLOWLISTED');
  const allowPrivate=!production && String(process.env.OSRM_ALLOW_PRIVATE_TARGETS||'false').toLowerCase()==='true';
  const rejectAddress=(address)=>{
    if(!isPrivateAddress(address)) return;
    if(!allowPrivate) throw new Error('OSRM_PRIVATE_TARGET_FORBIDDEN');
  };
  if(net.isIP(u.hostname)){
    rejectAddress(u.hostname);
    return u;
  }
  const records=await dns.lookup(u.hostname,{all:true,verbatim:true});
  if(!records.length) throw new Error('OSRM_HOST_UNRESOLVED');
  for(const record of records) rejectAddress(record.address);
  return {url:u,address:records[0].address,addresses:records.map(x=>x.address)};
}

function createRateLimiter(config, db){
  assertRateLimiterDeployment(config,db);
  const shared=String(config?.firewallRateState||'memory').toLowerCase()==='database';
  const buckets=new Map();
  let lastSharedCleanupAt=0;
  return function enforce(req){
    const key=clientKey(req,config);
    const now=Date.now(), windowMs=config.firewallRateWindowMs, limit=config.firewallRateLimit;
    if(shared){
      const windowStart=Math.floor(now/windowMs)*windowMs;
      // One atomic UPSERT prevents concurrent serverless instances from
      // overwriting one another's increments. PostgreSQL ON CONFLICT DO UPDATE
      // serializes conflicting row updates; RETURNING reports this request's
      // committed counter value. Keep the explicit transaction so SQLite's
      // writer lock and the existing post-commit rejection contract are preserved.
      db.exec('BEGIN IMMEDIATE');
      let committed=false;
      let row;
      try{
        row=db.prepare(`
          INSERT INTO firewall_rate_buckets(bucket_key,window_start,requests,updated_at)
          VALUES(?,?,1,?)
          ON CONFLICT(bucket_key) DO UPDATE SET
            window_start=excluded.window_start,
            requests=CASE
              WHEN firewall_rate_buckets.window_start=excluded.window_start
                THEN firewall_rate_buckets.requests+1
              ELSE 1
            END,
            updated_at=excluded.updated_at
          RETURNING requests
        `).get(key,windowStart,new Date(now).toISOString());
        db.exec('COMMIT');
        committed=true;
      }catch(error){
        if(!committed){
          try{db.exec('ROLLBACK');}
          catch(rollbackError){warn('transaction.rollback_failed',{operation:'firewall_rate_limit',error:rollbackError});}
        }
        throw error;
      }
      const requests=Number(row?.requests);
      if(!Number.isSafeInteger(requests)||requests<1) throw new Error('FIREWALL_RATE_STATE_INVALID');
      if(now-lastSharedCleanupAt>=60000){
        lastSharedCleanupAt=now;
        try{purgeExpiredRateBuckets(db,now,windowMs);}
        catch(error){
          lastSharedCleanupAt=0;
          warn('firewall_rate_bucket_cleanup_failed',{error});
        }
      }
      if(requests>limit) throw new Error('FIREWALL_RATE_LIMITED');
      return {remaining:Math.max(0,limit-requests),resetAt:windowStart+windowMs};
    }
    const prior=buckets.get(key);
    const bucket=(!prior || now-prior.startedAt>=windowMs)?{startedAt:now,count:0}:{...prior};
    if (!prior && buckets.size >= MAX_MEMORY_BUCKETS) {
      let removed = 0;
      for (const [k, v] of buckets) {
        if (now - v.startedAt >= windowMs) { buckets.delete(k); removed++; }
      }
      if (buckets.size >= MAX_MEMORY_BUCKETS) throw new Error('FIREWALL_RATE_STATE_EXHAUSTED');
    }
    bucket.count++; buckets.set(key,bucket);
    if(bucket.count>limit) throw new Error('FIREWALL_RATE_LIMITED');
    return {remaining:Math.max(0,limit-bucket.count),resetAt:bucket.startedAt+windowMs};
  };
}
function purgeExpiredRateBuckets(db, nowMs=Date.now(), windowMs=60000){ const cutoff=nowMs-windowMs; return db.prepare('DELETE FROM firewall_rate_buckets WHERE updated_at < ?').run(new Date(cutoff).toISOString()).changes; }

function extractClaimedOrganizationIds(req) {
  const claimed = new Set();
  const headers = req.headers || {};
  for (const key of ['x-organization-id', 'x-org-id', 'x-tenant-id']) {
    const v = headers[key];
    if (v != null && String(v).trim()) claimed.add(String(v).trim());
  }
  try {
    const u = new URL(String(req.url || '/'), 'http://127.0.0.1');
    for (const key of ['organizationId', 'organization_id', 'tenantId', 'tenant_id']) {
      const v = u.searchParams.get(key);
      if (v && String(v).trim()) claimed.add(String(v).trim());
    }
  } catch {
    // malformed URL already rejected by inspectRequest in normal path
  }
  return [...claimed];
}

/**
 * Secure Tenant Fingerprinting (post-auth).
 * Session/API-key context is authoritative. Any client-claimed organization
 * identifier that differs from the authenticated organization is treated as
 * an IDOR/tenant-boundary attempt and blocked before route handlers run.
 * Does not invent tables; uses only the authenticated ctx.organizationId.
 */
function assertTenantAlignment(req, ctx) {
  if (!ctx || !ctx.organizationId) throw new Error('TENANT_CONTEXT_REQUIRED');
  const claimed = extractClaimedOrganizationIds(req);
  for (const id of claimed) {
    if (id !== ctx.organizationId) {
      warn('firewall.tenant_mismatch', {
        sessionOrganizationId: ctx.organizationId,
        claimedOrganizationId: id,
        userId: ctx.userId || null,
        path: String(req.url || '').slice(0, 200)
      });
      throw new Error('TENANT_MISMATCH');
    }
  }
  return true;
}

module.exports={inspectRequest,productionSafetyGate,validateOsrmBaseUrl,assertOsrmHostResolvesSafely,createRateLimiter,isTrustedProxy,purgeExpiredRateBuckets,extractClaimedOrganizationIds,assertTenantAlignment};