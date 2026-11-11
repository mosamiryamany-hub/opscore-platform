'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {INTEGRITY_EXCLUSIONS,collectFiles,isSafeRelativePath,parseChecksumFile}=require('../scripts/provenance-files');
test('provenance traversal excludes dependencies, Git metadata, runtime data and transient JUnit',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'opscore-provenance-files-'));
 try{
  for(const d of ['node_modules/pkg','.git/objects','data/files','nested/node_modules/pkg'])fs.mkdirSync(path.join(root,d),{recursive:true});
  for(const f of ['keep.txt','node_modules/pkg/index.js','.git/objects/object','data/files/blob','nested/node_modules/pkg/index.js'])fs.writeFileSync(path.join(root,f),'source');
  assert.deepEqual(collectFiles(root),['keep.txt']);assert.ok(INTEGRITY_EXCLUSIONS.includes('junit.xml'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('provenance paths reject traversal and absolute paths',()=>{
 for(const v of ['','.','../outside','a/../../outside','/absolute','a\\b','a/./b'])assert.equal(isSafeRelativePath(v),false,v);
 assert.equal(isSafeRelativePath('docs/file.json'),true);
});
test('checksum parser rejects malformed, duplicate and empty entries',()=>{
 const d='a'.repeat(64);
 assert.equal(parseChecksumFile(d+'  file.txt\n').valid,true);
 assert.equal(parseChecksumFile('not-a-checksum\n').valid,false);
 assert.equal(parseChecksumFile(d+'  file.txt\n'+d+'  file.txt\n').valid,false);
 assert.equal(parseChecksumFile('').valid,false);
});
