'use strict';
const crypto = require('node:crypto');
const { id, now } = require('./security');
const { requireRole } = require('./rbac');
const { audit } = require('./audit');

function clean(v){ return String(v ?? '').trim(); }
function sha256(v){ return crypto.createHash('sha256').update(v).digest('hex'); }
function normalizeHost(raw){
  const h=clean(raw).toLowerCase().replace(/\.$/,'');
  if(!h || h.length>253 || /[^a-z0-9.-]/.test(h) || h.startsWith('.') || h.endsWith('.') || h.includes('..')) throw new Error('DOMAIN_INVALID');
  const labels=h.split('.');
  if(labels.length<2 || labels.some(x=>!x||x.length>63||x.startsWith('-')||x.endsWith('-'))) throw new Error('DOMAIN_INVALID');
  return h;
}
function deriveKey(secret){ return crypto.createHash('sha256').update(String(secret)).digest(); }
function encryptMemory(text, secret){
  const key=deriveKey(secret), iv=crypto.randomBytes(12), cipher=crypto.createCipheriv('aes-256-gcm',key,iv); const ct=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]); const tag=cipher.getAuthTag(); return Buffer.concat([iv,tag,ct]).toString('base64url');
}
function decryptMemory(enc, secret){
  try{ const raw=Buffer.from(enc,'base64url'); if(raw.length<28) throw new Error(); const key=deriveKey(secret),iv=raw.subarray(0,12),tag=raw.subarray(12,28),ct=raw.subarray(28); const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv); decipher.setAuthTag(tag); return Buffer.concat([decipher.update(ct),decipher.final()]).toString('utf8'); }catch{ throw new Error('MEMORY_DECRYPT_FAILED'); }
}
const COMMANDS = Object.freeze({
  '/closeout': { requiredScope:'read', action:'closure_status' },
  '/recon': { requiredScope:'read', action:'reconciliation_status' },
  '/firewall-status': { requiredScope:'read', action:'firewall_status' },
  '/operations-health': { requiredScope:'read', action:'operations_health' },
  '/worker-status': { requiredScope:'read', action:'worker_status' }
});
function attach(Store){
  const p=Store.prototype;
  p.executeSlashCommand=function(ctx, raw){
    requireRole(ctx.role,'read'); const cmd=clean(raw).split(/\s+/)[0].toLowerCase(); const def=COMMANDS[cmd]; if(!def) throw new Error('SLASH_COMMAND_UNSUPPORTED');
    let result;
    if(def.action==='closure_status'){ result=this.db.prepare("SELECT status,COUNT(*) c FROM closure_sheets WHERE organization_id=? GROUP BY status").all(ctx.organizationId); }
    else if(def.action==='reconciliation_status'){ result=this.db.prepare("SELECT provider,status,matched_count,mismatch_count,unmatched_count,created_at FROM payment_reconciliation_runs WHERE organization_id=? ORDER BY created_at DESC LIMIT 10").all(ctx.organizationId); }
    else if(def.action==='firewall_status'){ result={schemaVersion:'opscore.firewall-status.v1',rateLimitConfigured:true,trustProxy:String(process.env.TRUST_PROXY||'false').toLowerCase()==='true',failClosed:true}; }
    else if(def.action==='operations_health'){ result=this.operationsHealthCenter(ctx); }
    else { result={schemaVersion:'opscore.worker-status.v1',organizationId:ctx.organizationId,queues:String(process.env.OPSC_WORKER_QUEUES||'support,billing,incident,general').split(',').map(x=>x.trim()).filter(Boolean)}; }
    return {schemaVersion:'opscore.slash-command.v1',command:cmd,action:def.action,result};
  };
  p.storeAgentMemory=function(ctx,d={}){
    requireRole(ctx.role,'write'); const key=process.env.OPSC_MEMORY_KEY||''; if(!key) throw new Error('MEMORY_KEY_NOT_CONFIGURED');
    const subjectType=clean(d.subjectType)||'organization'; const subjectId=clean(d.subjectId)||ctx.organizationId; const memoryType=clean(d.memoryType)||'operational'; const content=clean(d.content); if(!content||content.length>10000) throw new Error('MEMORY_CONTENT_INVALID');
    const enc=encryptMemory(content,key), h=sha256(content), t=now(), rec=id('mem'); this.db.prepare('INSERT INTO agent_memories(id,organization_id,subject_type,subject_id,memory_type,content_ciphertext,content_sha256,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(rec,ctx.organizationId,subjectType,subjectId,memoryType,enc,h,ctx.userId,t,t);
    audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'agent_memory_stored',resourceType:'agent_memory',resourceId:rec,metadata:{subjectType,subjectId,memoryType,contentSha256:h}}); return {id:rec,schemaVersion:'opscore.agent-memory.v1',subjectType,subjectId,memoryType,contentSha256:h,stored:true};
  };
  p.listAgentMemories=function(ctx,d={}){
    requireRole(ctx.role,'read'); const key=process.env.OPSC_MEMORY_KEY||''; if(!key) throw new Error('MEMORY_KEY_NOT_CONFIGURED'); const subjectType=clean(d.subjectType),subjectId=clean(d.subjectId);
    const args=[ctx.organizationId]; let q='SELECT * FROM agent_memories WHERE organization_id=?'; if(subjectType){q+=' AND subject_type=?';args.push(subjectType)} if(subjectId){q+=' AND subject_id=?';args.push(subjectId)} q+=' ORDER BY created_at DESC LIMIT 100';
    return {schemaVersion:'opscore.agent-memory.v1',items:this.db.prepare(q).all(...args).map(r=>({id:r.id,subjectType:r.subject_type,subjectId:r.subject_id,memoryType:r.memory_type,content:decryptMemory(r.content_ciphertext,key),contentSha256:r.content_sha256,createdAt:r.created_at,updatedAt:r.updated_at}))};
  };
  p.registerTenantDomain=function(ctx,d={}){
    requireRole(ctx.role,'admin'); const hostname=normalizeHost(d.hostname); const verificationToken=crypto.randomBytes(24).toString('base64url'); const t=now(), rec=id('dom');
    try{ this.db.prepare('INSERT INTO tenant_domains(id,organization_id,hostname,status,verification_token,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(rec,ctx.organizationId,hostname,'pending',verificationToken,ctx.userId,t,t); } catch(e){ if(String(e.message).includes('UNIQUE')) throw new Error('DOMAIN_ALREADY_REGISTERED'); throw e; }
    audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'tenant_domain_registered',resourceType:'tenant_domain',resourceId:rec,metadata:{hostname,status:'pending'}}); return {id:rec,hostname,status:'pending',verificationToken,instructions:'Publish this token in the tenant-controlled DNS record before activation.'};
  };
  p.activateTenantDomain=function(ctx,domainId){
    requireRole(ctx.role,'admin'); const r=this.db.prepare('SELECT * FROM tenant_domains WHERE id=? AND organization_id=?').get(domainId,ctx.organizationId); if(!r) throw new Error('NOT_FOUND'); if(r.status!=='verified') throw new Error('DOMAIN_NOT_VERIFIED'); const t=now(); this.db.prepare("UPDATE tenant_domains SET status='active',updated_at=? WHERE id=? AND organization_id=?").run(t,domainId,ctx.organizationId); return this.db.prepare('SELECT id,hostname,status,verified_at,created_at,updated_at FROM tenant_domains WHERE id=? AND organization_id=?').get(domainId,ctx.organizationId);
  };
  p.verifyTenantDomain=function(ctx,domainId,token){ requireRole(ctx.role,'admin'); const r=this.db.prepare('SELECT * FROM tenant_domains WHERE id=? AND organization_id=?').get(domainId,ctx.organizationId); if(!r) throw new Error('NOT_FOUND'); if(clean(token)!==r.verification_token) throw new Error('DOMAIN_VERIFICATION_FAILED'); const t=now(); this.db.prepare("UPDATE tenant_domains SET status='verified',verified_at=?,updated_at=? WHERE id=? AND organization_id=?").run(t,t,domainId,ctx.organizationId); return {id:r.id,hostname:r.hostname,status:'verified',verifiedAt:t}; };
  p.resolveTenantByHost=function(host){ const h=normalizeHost(host); return this.db.prepare("SELECT organization_id,hostname,status FROM tenant_domains WHERE hostname=? AND status='active'").get(h)||null; };
  p.listTenantDomains=function(ctx){ requireRole(ctx.role,'admin'); return this.db.prepare('SELECT id,hostname,status,verified_at,created_at,updated_at FROM tenant_domains WHERE organization_id=? ORDER BY created_at DESC').all(ctx.organizationId); };
}
module.exports={attach,COMMANDS};
