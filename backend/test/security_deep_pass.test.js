const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Store}=require('../src/store');
function fixture(){const p=path.join(os.tmpdir(),`opscore-${crypto.randomUUID()}.db`);const old=process.env.SQLITE_PATH;process.env.SQLITE_PATH=p;delete require.cache[require.resolve('../src/config')];delete require.cache[require.resolve('../src/db')];const d=require('../src/db').openDb();if(old===undefined)delete process.env.SQLITE_PATH;else process.env.SQLITE_PATH=old;return {d,p};}
function close(f){f.d.close();for(const p of [f.p,`${f.p}-shm`,`${f.p}-wal`]){try{fs.unlinkSync(p)}catch{}}}

test('work-order creation rejects cross-tenant customer, site, asset and assignee references',()=>{
 const f=fixture(),s=new Store(f.d,{sessionTtlHours:24});
 s.bootstrap({orgName:'Tenant A',email:'a@example.com',password:'Strong-A-2026!'}); const a=s.login('a@example.com','Strong-A-2026!');
 const {id,now,hashPassword}=require('../src/security'); const org=id('org'),u=id('usr'),c=id('cus'),site=id('site'),asset=id('ast'),t=now();
 f.d.prepare('INSERT INTO organizations VALUES (?,?,?)').run(org,'B',t);
 f.d.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(u,'b@example.com',hashPassword('Strong-B-2026!'),'active',t);
 f.d.prepare('INSERT INTO memberships VALUES (?,?,?,?)').run(u,org,'owner',t);
 f.d.prepare('INSERT INTO customers VALUES (?,?,?,?,?,?,?,?,?)').run(c,org,'B Customer',null,null,null,'active',t,t);
 f.d.prepare('INSERT INTO sites VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(site,org,null,'B Site',null,null,null,null,null,t,t);
 f.d.prepare('INSERT INTO assets VALUES (?,?,?,?,?,?,?,?,?)').run(asset,org,'B Asset','router',null,'active',site,t,t);
 assert.throws(()=>s.createWorkOrder(a,{title:'x',customerId:c}),/INVALID|NOT_FOUND/);
 assert.throws(()=>s.createWorkOrder(a,{title:'x',siteId:site}),/INVALID|NOT_FOUND/);
 assert.throws(()=>s.createWorkOrder(a,{title:'x',assetId:asset}),/INVALID|NOT_FOUND/);
 assert.throws(()=>s.createWorkOrder(a,{title:'x',assignedTo:u}),/INVALID_ASSIGNEE/);
 close(f);
});

test('work-order update rejects cross-tenant references',()=>{
 const f=fixture(),s=new Store(f.d,{sessionTtlHours:24});
 s.bootstrap({orgName:'Tenant A2',email:'a2@example.com',password:'Strong-A2-2026!'}); const a=s.login('a2@example.com','Strong-A2-2026!');
 const {id,now}=require('../src/security'); const org=id('org'),c=id('cus'),t=now();
 f.d.prepare('INSERT INTO organizations VALUES (?,?,?)').run(org,'B2',t);
 f.d.prepare('INSERT INTO customers VALUES (?,?,?,?,?,?,?,?,?)').run(c,org,'B Customer',null,null,null,'active',t,t);
 assert.throws(()=>s.createSite(a,{name:'Cross tenant site',customerId:c}),/NOT_FOUND/);
 close(f);
});

test('route planner bounds work-order count and API inventory exposes read scope',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','src','server.js'),'utf8');
 assert.match(src,/route-plan[\s\S]{0,400}requireScope\s*\(\s*c\s*,\s*'read'\s*\)/);
 const store=fs.readFileSync(path.join(__dirname,'..','src','store.js'),'utf8');
 assert.match(store,/ids\.length\s*>\s*100/);
});
test('work-order update rejects cross-tenant references',()=>{
 const f=fixture(),s=new Store(f.d,{sessionTtlHours:24});
 s.bootstrap({orgName:'Tenant A3',email:'a3@example.com',password:'Strong-A3-2026!'}); const a=s.login('a3@example.com','Strong-A3-2026!');
 const own=s.createCustomer(a,{name:'Own'}); const wo=s.createWorkOrder(a,{title:'Own WO',customerId:own.id});
 const {id,now}=require('../src/security'); const org=id('org'),c=id('cus'),t=now();
 f.d.prepare('INSERT INTO organizations VALUES (?,?,?)').run(org,'Tenant B3',t);
 f.d.prepare('INSERT INTO customers VALUES (?,?,?,?,?,?,?,?,?)').run(c,org,'B Customer',null,null,null,'active',t,t);
 assert.throws(()=>s.updateWorkOrder(a,wo.id,{customerId:c}),/INVALID_CUSTOMER/);
 const after=s.getWorkOrder(a,wo.id); assert.equal(after.customer_id,own.id);
 close(f);
});


