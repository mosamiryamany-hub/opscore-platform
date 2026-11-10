const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Store } = require('../src/store');
const { openDb } = require('../src/db');

function fixture(name){
  const dir=fs.mkdtempSync(path.join('/tmp/',`opscore-${name}-`));
  const db=openDb(path.join(dir,'test.sqlite'));
  return {d:db,p:dir};
}
function clean(p){fs.rmSync(p,{recursive:true,force:true});}

test('control plane creates tenant-scoped feature flags and safe mode with deterministic snapshot',()=>{
  const f=fixture('control-plane');
  try{
    const s=new Store(f.d,{sessionTtlHours:24});
    const boot=s.bootstrap({orgName:'Control Plane Tenant',email:'owner@control.test',password:'Strong-pass-2026'});
    const c={...boot,organizationId:boot.orgId,role:'owner'};
    const flag=s.setFeatureFlag(c,{key:'local.search.v2',enabled:true,reason:'Pilot'});
    assert.equal(flag.enabled,1);
    assert.equal(s.listFeatureFlags(c)[0].flag_key,'local.search.v2');
    const sm=s.setSafeMode(c,{enabled:true,reason:'Incident containment'});
    assert.equal(sm.enabled,true);
    const snap=s.controlPlaneSnapshot(c);
    assert.equal(snap.schemaVersion,'opscore.control-plane.v1');
    assert.equal(snap.status,'critical');
    assert.equal(snap.safeMode.enabled,true);
    assert.match(snap.resultSha256,/^[a-f0-9]{64}$/);
  } finally { f.d.close(); clean(f.p); }
});

test('recovery bundle is tenant-bound and tamper-evident without modifying live data',()=>{
  const f=fixture('recovery');
  try{
    const s=new Store(f.d,{sessionTtlHours:24});
    const boot=s.bootstrap({orgName:'Recovery Tenant',email:'owner@recovery.test',password:'Strong-pass-2026'});
    const c={...boot,organizationId:boot.orgId,role:'owner'};
    s.createCustomer(c,{name:'Recoverable Customer',email:'recover@example.com'});
    const bundle=s.createRecoveryBundle(c);
    assert.equal(bundle.schemaVersion,'opscore.recovery-bundle.v1');
    const ok=s.verifyRecoveryBundle(c,bundle);
    assert.equal(ok.valid,true);
    assert.equal(ok.importMode,'dry_run_only');
    const tampered=JSON.parse(JSON.stringify(bundle));
    tampered.export.tables.customers.rows[0].name='Tampered';
    const bad=s.verifyRecoveryBundle(c,tampered);
    assert.equal(bad.valid,false);
    assert.equal(s.db.prepare('SELECT name FROM customers WHERE organization_id=?').get(c.organizationId).name,'Recoverable Customer');
    assert.throws(()=>s.verifyRecoveryBundle({...c,organizationId:'other-org'},bundle),/RECOVERY_BUNDLE_TENANT_MISMATCH/);
  } finally { f.d.close(); clean(f.p); }
});

test('dedicated web control plane is wired to authenticated recovery and safe-mode APIs',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../web/control-plane.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../web/control-plane.js'),'utf8');
  const home=fs.readFileSync(path.join(__dirname,'../web/index.html'),'utf8');
  assert.match(home,/href="\/control-plane\.html"/);
  assert.match(html,/id="controlPlane"/);
  assert.match(html,/id="loginForm"/);
  assert.match(html,/id="refreshControlPlane"/);
  assert.match(html,/id="downloadRecovery"/);
  assert.match(html,/id="toggleSafeMode"/);
  assert.match(html,/src="\/control-plane\.js"/);
  assert.match(app,/\/api\/v1\/auth\/login/);
  assert.match(app,/credentials:\s*['"]same-origin['"]/);
  assert.match(app,/\/api\/v1\/control-plane/);
  assert.match(app,/\/api\/v1\/control-plane\/recovery-bundle/);
  assert.match(app,/\/api\/v1\/control-plane\/safe-mode/);
});
