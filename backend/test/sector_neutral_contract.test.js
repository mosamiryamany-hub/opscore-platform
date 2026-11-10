const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {Store}=require('../src/store');
function fixture(){const p=path.join(os.tmpdir(),`opscore-sector-${crypto.randomUUID()}.db`);const old=process.env.SQLITE_PATH;process.env.SQLITE_PATH=p;delete require.cache[require.resolve('../src/config')];delete require.cache[require.resolve('../src/db')];const d=require('../src/db').openDb();if(old===undefined)delete process.env.SQLITE_PATH;else process.env.SQLITE_PATH=old;return {d,p};}
function clean(p){for(const x of [p,p+'-wal',p+'-shm'])try{fs.rmSync(x,{force:true})}catch{}}

test('multi-sector contract accepts arbitrary operational domains through generic extension points',()=>{
  const f=fixture(); const s=new Store(f.d,{sessionTtlHours:24});
  try{
    const boot=s.bootstrap({orgName:'Multi Sector Tenant',email:'sector-owner@example.com',password:'Strong-pass-2026'});
    const ctx={...boot,organizationId:boot.orgId,role:'owner'};
    const custom=s.createCustomField(ctx,{entityType:'work_order',key:'work_type',label:'Work type',fieldType:'text'});
    const workflow=s.createWorkflow(ctx,{name:'Generic lifecycle',statuses:['open','scheduled','in_progress','completed'],transitions:{open:['scheduled'],scheduled:['in_progress'],in_progress:['completed']}});
    assert.equal(workflow.entity_type,'work_order');
    const cases=[
      ['facilities','HVAC Unit','Preventive Inspection'],
      ['construction','Tower Crane','Site Inspection'],
      ['logistics','Fleet Vehicle','Delivery Service'],
      ['utilities','Backup Generator','Preventive Maintenance'],
      ['property','Elevator','Safety Inspection']
    ];
    for(const [domain,assetType,workType] of cases){
      const customer=s.createCustomer(ctx,{name:`${domain} customer`});
      const site=s.createSite(ctx,{customerId:customer.id,name:`${domain} site`});
      const asset=s.createAsset(ctx,{name:`${domain} asset`,assetType,siteId:site.id});
      const wo=s.createWorkOrder(ctx,{customerId:customer.id,siteId:site.id,assetId:asset.id,title:`${domain} work`});
      s.setCustomFieldValue(ctx,{entityType:'work_order',entityId:wo.id,fieldId:custom.id,value:workType});
      const policy=s.createCompletionPolicy(ctx,{workType,name:`${domain} completion policy`,requireEvidence:true,minEvidenceCount:0});
      const procedure=s.createProcedure(ctx,{name:`${domain} procedure`,workType,steps:[{title:'Inspect'},{title:'Record result'}]});
      const checklist=s.createSafetyChecklist(ctx,{name:`${domain} safety`,workType,items:[{label:'Area safe'},{label:'Required PPE available'}]});
      assert.equal(policy.workType,workType);
      assert.equal(procedure.work_type,workType);
      assert.equal(checklist.work_type,workType);
      assert.equal(s.customFieldValues(ctx,'work_order',wo.id)[0].value_text,workType);
      assert.equal(s.getWorkOrder(ctx,wo.id).asset_id,asset.id);
    }
    assert.ok(s.listCustomers(ctx).length>=5);
    assert.equal(fs.existsSync(path.join(__dirname,'sector_neutral_contract.test.js')),true);
  }finally{f.d.close();clean(f.p);}}
);

test('legacy service reference column migrates forward to the generic field',()=>{
  const f=fixture();
  try {
    f.d.exec('DROP TABLE service_lines; CREATE TABLE service_lines (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), code TEXT NOT NULL, name TEXT NOT NULL, network_ref TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(organization_id,code)); PRAGMA user_version = 23;');
    f.d.close();
    const old=process.env.SQLITE_PATH; process.env.SQLITE_PATH=f.p;
    delete require.cache[require.resolve('../src/config')]; delete require.cache[require.resolve('../src/db')];
    const d=require('../src/db').openDb(f.p);
    const cols=d.prepare('PRAGMA table_info(service_lines)').all().map(x=>x.name);
    assert.ok(cols.includes('service_ref')); assert.equal(cols.includes('network_ref'),false); assert.equal(Number(d.prepare('PRAGMA user_version').get().user_version),28);
    d.close(); if(old===undefined)delete process.env.SQLITE_PATH;else process.env.SQLITE_PATH=old;
  } finally { try{f.d.close()}catch{} clean(f.p); }
});
