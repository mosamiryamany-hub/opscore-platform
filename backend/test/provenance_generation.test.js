'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {CHECKSUM_FILES,INTEGRITY_EXCLUSIONS,collectFiles,parseChecksumFile}=require('../scripts/provenance-files');
const root=path.join(__dirname,'..'),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
test('backend provenance manifests match every shipped backend file and canonical exclusions',()=>{
 const m=JSON.parse(fs.readFileSync(path.join(root,'SALES_PACKAGE_MANIFEST.json'),'utf8'));
 assert.equal(m.version,JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version);
 assert.deepEqual(m.integrityExclusions,[...INTEGRITY_EXCLUSIONS]);
 const expected=m.files.map(e=>e.path).sort();
 assert.deepEqual(collectFiles(root),expected);
 assert.ok(INTEGRITY_EXCLUSIONS.includes('junit.xml'));
 assert.ok(!expected.includes('junit.xml'));
 assert.ok(!expected.some(f=>f.split('/').includes('node_modules')));
 for(const e of m.files){assert.equal(sha(path.join(root,e.path)),e.sha256,e.path);assert.equal(fs.statSync(path.join(root,e.path)).size,e.bytes,e.path);}
 for(const name of CHECKSUM_FILES){
  const parsed=parseChecksumFile(fs.readFileSync(path.join(root,name),'utf8'));
  assert.equal(parsed.valid,true,name+': '+parsed.errors.join(','));
  const sums=new Map(parsed.entries.map(e=>[e.path,e.sha256]));
  assert.deepEqual([...sums.keys()].sort(),expected,name);
  for(const e of m.files)assert.equal(sums.get(e.path),e.sha256,e.path);
 }
});
