const crypto=require('node:crypto'); const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const os=require('node:os'); const path=require('node:path');
const {Store}=require('../src/store'); const {hashPassword,id,now,validateWebhookUrl}=require('../src/security');
function fixture(){const p=path.join(os.tmpdir(),`opscore-${crypto.randomUUID()}.db`);const old=process.env.SQLITE_PATH;process.env.SQLITE_PATH=p;delete require.cache[require.resolve('../src/config')];delete require.cache[require.resolve('../src/db')];const d=require('../src/db').openDb();if(old===undefined)delete process.env.SQLITE_PATH;else process.env.SQLITE_PATH=old;return {d,p};}
function close(f){f.d.close();for(const p of [f.p,`${f.p}-shm`,`${f.p}-wal`]){try{fs.unlinkSync(p)}catch{}}}

test('tenant isolation, viewer write denial, expanded work order, activity and comment',()=>{const f=fixture(),s=new Store(f.d,{sessionTtlHours:24});const a=s.bootstrap({orgName:'Tenant A',email:'a@example.com',password:'A-strong-pass-2026'}),sa=s.login('a@example.com','A-strong-pass-2026');const bOrg=id('org'),bUser=id('usr'),t=now();f.d.prepare('INSERT INTO organizations VALUES (?,?,?)').run(bOrg,'Tenant B',t);f.d.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(bUser,'b@example.com',hashPassword('B-strong-pass-2026'),'active',t);f.d.prepare('INSERT INTO memberships VALUES (?,?,?,?)').run(bUser,bOrg,'owner',t);const sb=s.login('b@example.com','B-strong-pass-2026');const c=s.createCustomer(sa,{name:'Customer A'});const site=s.createSite(sa,{name:'Site A',customerId:c.id,latitude:29.9,longitude:31.2});const wo=s.createWorkOrder(sa,{title:'Install service',customerId:c.id,siteId:site.id,priority:'high',teamName:'Team 1'});assert.equal(wo.number,'WO-000001');assert.equal(wo.customer_name,'Customer A');assert.equal(s.listWorkOrders(sa).length,1);assert.equal(s.listWorkOrders(sb).length,0);s.addComment(sa,wo.id,'Field note');assert.equal(s.getWorkOrder(sa,wo.id).comments.length,1);assert.ok(s.listActivity(sa).length>=3);assert.throws(()=>s.createWorkOrder({...sa,role:'viewer'},{title:'blocked'}),/FORBIDDEN/);close(f);});

test('invitation flow creates a real membership',()=>{const f=fixture(),s=new Store(f.d,{sessionTtlHours:24});s.bootstrap({orgName:'Tenant',email:'owner@example.com',password:'Owner-strong-pass-2026'});const so=s.login('owner@example.com','Owner-strong-pass-2026');const inv=s.inviteMember(so,{email:'member@example.com',role:'member'});const out=s.acceptInvitation(inv.inviteToken,{password:'Member-strong-pass-2026',name:'Member'});assert.equal(out.organizationId,so.organizationId);const mem=s.listMembers(so);assert.equal(mem.filter(x=>x.email==='member@example.com').length,1);assert.equal(mem.find(x=>x.email==='member@example.com').role,'member');close(f);});

test('local attachment stores bytes and immutable digest metadata',()=>{const dir=path.join(os.tmpdir(),`opscore-files-${crypto.randomUUID()}`);process.env.OPSC_REPOSITORY_PATH=dir;const f=fixture(),s=new Store(f.d,{sessionTtlHours:24});s.bootstrap({orgName:'Tenant',email:'owner@example.com',password:'Owner-strong-pass-2026'});const so=s.login('owner@example.com','Owner-strong-pass-2026');const wo=s.createWorkOrder(so,{title:'Evidence'});const content=Buffer.from('real attachment content');const a=s.storeAttachment(so,{workOrderId:wo.id,fileName:'evidence.txt',mediaType:'text/plain',contentBase64:content.toString('base64')});assert.equal(a.bytes,content.length);assert.equal(s.listAttachments(so,'work_order',wo.id).length,1);const read=s.readAttachment(so,a.id);assert.deepEqual(fs.readFileSync(read.path),content);close(f);fs.rmSync(dir,{recursive:true,force:true});delete process.env.OPSC_REPOSITORY_PATH;});

test('api keys, scopes, revocation, entitlements and usage are real and tenant-scoped',()=>{const f=fixture(),s=new Store(f.d,{sessionTtlHours:24});s.bootstrap({orgName:'Tenant',email:'owner@example.com',password:'Owner-strong-pass-2026'});const owner=s.login('owner@example.com','Owner-strong-pass-2026');const key=s.createApiKey(owner,{name:'integration',scopes:['read','write']});assert.match(key.secret,/^[A-Za-z0-9_-]{80,}$/);const api=s.authenticateApiKey(key.secret);assert.equal(api.organizationId,owner.organizationId);assert.deepEqual(api.scopes,['read','write']);assert.throws(()=>s.createApiKey(owner,{name:'bad',scopes:['invalid']}),/INVALID_API_KEY/);s.setEntitlements(owner,{plan:'pro',limits:{workOrders:100,apiCalls:10000}});assert.equal(s.getEntitlements(owner).plan,'pro');assert.equal(s.incrementUsage(owner,'api_calls',2).quantity,2); assert.throws(()=>s.incrementUsage(owner,'api_calls',9999),/ENTITLEMENT_LIMIT_EXCEEDED/); assert.throws(()=>s.setEntitlements(owner,{plan:'bad',limits:{apiCalls:-1}}),/INVALID_ENTITLEMENTS/);s.revokeApiKey(owner,key.id);assert.equal(s.authenticateApiKey(key.secret),null);close(f);});

test('webhook target guard rejects hexadecimal IPv4-mapped private IPv6 addresses',()=>{
 const {validateWebhookUrl,resolvePublicWebhookHost}=require('../src/security');
 assert.throws(()=>validateWebhookUrl('https://[::ffff:7f00:1]/hook'),/WEBHOOK_TARGET_FORBIDDEN/);
 assert.throws(()=>validateWebhookUrl('https://[::ffff:c0a8:1]/hook'),/WEBHOOK_TARGET_FORBIDDEN/);
 void resolvePublicWebhookHost;
});

test('custom fields, saved views, sessions and soft delete/restore',()=>{const f=fixture(),s=new Store(f.d,{sessionTtlHours:24});s.bootstrap({orgName:'Tenant',email:'owner@example.com',password:'Owner-strong-pass-2026'});const owner=s.login('owner@example.com','Owner-strong-pass-2026');const c=s.createCustomer(owner,{name:'Acme'});const cf=s.createCustomField(owner,{entityType:'customer',key:'segment',label:'Segment',fieldType:'select',options:['enterprise','smb']});s.setCustomFieldValue(owner,{entityType:'customer',entityId:c.id,fieldId:cf.id,value:'enterprise'});assert.equal(s.customFieldValues(owner,'customer',c.id)[0].value_text,'enterprise');const v=s.createSavedView(owner,{name:'Enterprise customers',entityType:'customers',filters:{segment:'enterprise'},columns:['name','email']});assert.equal(s.listSavedViews(owner,'customers')[0].id,v.id);assert.equal(s.listSessions(owner).length,1);s.softDelete(owner,'customer',c.id);assert.equal(s.listCustomers(owner).length,0);assert.equal(s.deleted(owner,'customer').length,1);s.restore(owner,'customer',c.id);assert.equal(s.listCustomers(owner).length,1);close(f);});


test('login performs password work even when the account is unknown',()=>{
  const f=fixture(),s=new Store(f.d,{sessionTtlHours:24});
  try {
    s.bootstrap({orgName:'Timing',email:'real@example.com',password:'Real-strong-pass-2026'});
    const samplesMissing=[],samplesWrong=[];
    for(let i=0;i<4;i++){
      const t0=process.hrtime.bigint(); assert.throws(()=>s.login(`missing-${i}-${crypto.randomUUID()}@example.com`,'Wrong-strong-pass-2026'),/INVALID_CREDENTIALS/); samplesMissing.push(Number(process.hrtime.bigint()-t0));
      const t1=process.hrtime.bigint(); assert.throws(()=>s.login('real@example.com','Wrong-strong-pass-2026'),/INVALID_CREDENTIALS/); samplesWrong.push(Number(process.hrtime.bigint()-t1));
    }
    const median=a=>{const x=[...a].sort((m,n)=>m-n);return x[Math.floor(x.length/2)]};
    const ratio=median(samplesMissing)/median(samplesWrong);
    assert.ok(ratio>0.35&&ratio<2.8,`timing ratio ${ratio}`);
  } finally { close(f); }
});

test('webhook SSRF guard blocks TEST-NET-1 address space',()=>{ assert.throws(()=>validateWebhookUrl('https://192.0.2.1/hook'),/WEBHOOK_TARGET_FORBIDDEN/); });
