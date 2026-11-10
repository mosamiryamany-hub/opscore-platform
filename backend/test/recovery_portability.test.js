const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {Store}=require('../src/store');
const {openDb}=require('../src/db');

test('recovery drill round-trips database state without mutation',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'opscore-recovery-test-')); const dbPath=path.join(dir,'source.db');
  const db=openDb(dbPath); const s=new Store(db,{sessionTtlHours:24});
  try{
    s.bootstrap({orgName:'Recovery',email:'recovery@example.test',password:'Strong-pass-2026'}); const owner=s.login('recovery@example.test','Strong-pass-2026');
    s.createCustomer(owner,{name:'Recovery Customer',externalRef:'REC-1'});
    db.close();
    const out=cp.execFileSync(process.execPath,['scripts/recovery-drill.js',dbPath],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
    const r=JSON.parse(out); assert.equal(r.status,'PASS'); assert.equal(r.sameTables,true); assert.equal(r.sameCounts,true); assert.equal(r.foreignKeys,'PASS');
  } finally {try{db.close()}catch{} fs.rmSync(dir,{recursive:true,force:true});}
});

test('export verifier accepts authentic snapshot and rejects tampering',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'opscore-export-test-')); const dbPath=path.join(dir,'source.db'); const exportPath=path.join(dir,'export.json');
  const db=openDb(dbPath); const s=new Store(db,{sessionTtlHours:24});
  try{
    s.bootstrap({orgName:'Export',email:'export@example.test',password:'Strong-pass-2026'}); const owner=s.login('export@example.test','Strong-pass-2026');
    s.createCustomer(owner,{name:'Portable',externalRef:'CRM-1'});
    const snap=s.exportOrganizationSnapshot(owner); fs.writeFileSync(exportPath,JSON.stringify(snap));
    let r=cp.execFileSync(process.execPath,['scripts/verify-export.js',exportPath],{cwd:path.join(__dirname,'..'),encoding:'utf8'}); assert.equal(JSON.parse(r).status,'PASS');
    snap.tables.customers.rows[0].name='Tampered'; fs.writeFileSync(exportPath,JSON.stringify(snap));
    assert.throws(()=>cp.execFileSync(process.execPath,['scripts/verify-export.js',exportPath],{cwd:path.join(__dirname,'..'),stdio:'pipe'}));
  } finally {db.close(); fs.rmSync(dir,{recursive:true,force:true});}
});
