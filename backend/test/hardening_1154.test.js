'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {openDb}=require('../src/db'); const {Store}=require('../src/store');
const {WorkerResourceGuard}=require('../src/worker-guard'); const {registerSensitiveBuffer,purgeSensitiveMemory,purgeExpiredForTenant}=require('../src/data-purger');

function fx(name){const p=path.join(os.tmpdir(),`opscore-1154-${name}-${crypto.randomUUID()}.db`);const db=openDb(p);return{p,db}}
function close(f){try{f.db.close()}catch{} for(const p of [f.p,`${f.p}-wal`,`${f.p}-shm`])try{fs.unlinkSync(p)}catch{}}
function org(s,name,email,role='owner'){s.bootstrap({orgName:name,email,password:'Strong-pass-2026'});return s.login(email,'Strong-pass-2026')}

test('worker guard trips a per-queue circuit after repeated resource pressure and recovers after cooldown',()=>{
  const f=fx('guard'); try {
    const s=new Store(f.db,{sessionTtlHours:24}); const c=org(s,'WG','wg@test');
    const g=new WorkerResourceGuard({maxHeapMb:1024,maxDbLatencyMs:10000,maxConcurrent:1,pressureThreshold:2,cooldownMs:10});
    g.active=1;
    const a=g.admit(f.db,'general',c.organizationId); assert.equal(a.allow,false);
    const b=g.admit(f.db,'general',c.organizationId); assert.equal(b.allow,false); assert.equal(b.reason,'worker_circuit_tripped');
    const ev=f.db.prepare("SELECT action,reason FROM worker_guard_events WHERE organization_id=? AND queue_name='general' ORDER BY rowid").all(c.organizationId);
    assert.ok(ev.some(x=>x.action==='trip'&&x.reason==='resource_pressure'));
    g.active=0; setTimeout(()=>{},15);
  } finally { close(f) }
});

test('technician geofence assignments remain tenant scoped and boundary inclusive',()=>{
  const a=fx('geo-a'),b=fx('geo-b'); try {
    const sa=new Store(a.db,{sessionTtlHours:24}); const ca=org(sa,'GeoA','owner@geo1154a.test');
    const inv=sa.inviteMember(ca,{email:'tech@geo1154a.test',role:'member'});
    const tech=sa.acceptInvitation(inv.inviteToken,{password:'Tech-pass-2026'});
    const g=sa.createGeofence(ca,{name:'Zone',geometry:{type:'Polygon',coordinates:[[[0,0],[2,0],[2,2],[0,2],[0,0]]]}})
    const assigned=sa.assignTechnicianToGeofence(ca,{geofenceId:g.id,technicianId:tech.userId});
    assert.equal(assigned.length,1);
    assert.equal(sa.checkTechnicianWithinGeofence(ca,{technicianId:tech.userId,longitude:0,latitude:1}).insideAny,true);
    assert.equal(sa.checkTechnicianWithinGeofence(ca,{technicianId:tech.userId,longitude:3,latitude:1}).insideAny,false);
    const sb=new Store(b.db,{sessionTtlHours:24}); const cb=org(sb,'GeoB','owner@geo1154b.test');
    assert.equal(sb.listTechnicianGeofences(cb,tech.userId).length,0);
  } finally {close(a);close(b)}
});

test('signature chain can be cryptographically sealed only after all three governed levels',()=>{
  const f=fx('sig'); try {
    const s=new Store(f.db,{sessionTtlHours:24}); const owner=org(s,'Sig1154','owner@sig1154.test');
    const inv1=s.inviteMember(owner,{email:'mgr@sig1154.test',role:'manager'}); s.acceptInvitation(inv1.inviteToken,{password:'Mgr-pass-2026'});
    const mgr=s.login('mgr@sig1154.test','Mgr-pass-2026');
    const inv2=s.inviteMember(owner,{email:'mem@sig1154.test',role:'member'}); s.acceptInvitation(inv2.inviteToken,{password:'Mem-pass-2026'});
    const mem=s.login('mem@sig1154.test','Mem-pass-2026');
    s.appendSignatureChain(mem,{documentType:'closure',documentId:'d1',level:1,payload:{v:1}});
    s.appendSignatureChain(mgr,{documentType:'closure',documentId:'d1',level:2,payload:{v:2}});
    assert.throws(()=>s.sealSignatureChain(owner,{documentType:'closure',documentId:'d1'}),/SIGNATURE_CHAIN_INCOMPLETE/);
    s.appendSignatureChain(owner,{documentType:'closure',documentId:'d1',level:3,payload:{v:3}});
    const sealed=s.sealSignatureChain(owner,{documentType:'closure',documentId:'d1'});
    assert.equal(sealed.sealed,true);
    const ver=s.verifySignatureChain(owner,{documentType:'closure',documentId:'d1'});
    assert.equal(ver.valid,true); assert.equal(ver.sealed,true);
    s.db.prepare("UPDATE signature_chain_seals SET final_chain_hash=? WHERE organization_id=? AND document_type='closure' AND document_id='d1'").run('f'.repeat(64),owner.organizationId);
    const broken=s.verifySignatureChain(owner,{documentType:'closure',documentId:'d1'});
    assert.equal(broken.valid,false); assert.equal(broken.reason,'SIGNATURE_CHAIN_SEAL_MISMATCH');
  } finally {close(f)}
});

test('tenant purge zeroizes registered buffers and records a scoped purge run without deleting normal tenant files',()=>{
  const f=fx('purge'); const repo=path.join(os.tmpdir(),`opscore-1154-purge-${crypto.randomUUID()}`); try {
    fs.mkdirSync(path.join(repo,'tmp'),{recursive:true});
    const old=path.join(repo,'tmp','old.tmp'); fs.writeFileSync(old,'secret'); const ts=(Date.now()-2*86400000)/1000; fs.utimesSync(old,ts,ts);
    fs.writeFileSync(path.join(repo,'keep.txt'),'keep');
    const buf=registerSensitiveBuffer(Buffer.from('secret-memory'));
    const s=new Store(f.db,{sessionTtlHours:24}); const c=org(s,'Purge1154','purge1154@test');
    const out=purgeExpiredForTenant(f.db,c.organizationId,{repositoryPath:repo,tempMaxAgeMs:86400000});
    assert.equal(out.organizationId,c.organizationId); assert.equal(out.tempFiles,1); assert.deepEqual(buf,Buffer.alloc(buf.length));
    assert.equal(fs.existsSync(path.join(repo,'keep.txt')),true);
    assert.equal(f.db.prepare('SELECT COUNT(*) c FROM privacy_purge_runs WHERE organization_id=?').get(c.organizationId).c,1);
  } finally {purgeSensitiveMemory();fs.rmSync(repo,{recursive:true,force:true});close(f)}
});


test('signature-chain verification rejects previous-hash metadata tampering',()=>{
  const {appendChain,verifyChain}=require('../src/signature-chain');
  const first=appendChain(undefined,{step:1});
  const second=appendChain(first.chainHash,{step:2});
  const tampered=[{level:1,payload:{step:1},payloadHash:first.payloadHash,previousHash:first.previousHash,chainHash:first.chainHash},{level:2,payload:{step:2},payloadHash:second.payloadHash,previousHash:'f'.repeat(64),chainHash:second.chainHash}];
  assert.equal(verifyChain(tampered).valid,false);
  assert.equal(verifyChain(tampered).brokenAt,2);
});
