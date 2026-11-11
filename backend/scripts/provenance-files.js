'use strict';
const fs=require('node:fs'),path=require('node:path');
const CHECKSUM_FILES=Object.freeze(['RELEASE_FILE_SHA256SUMS.txt','RELEASE_COMPONENT_SHA256SUMS.txt']);
const VOLATILE_EVIDENCE=Object.freeze([
'docs/verification/RELEASE_TEST_RUN_RESULT.json','docs/verification/RELEASE_CANDIDATE_GATE_RESULT.json',
'docs/verification/BUYER_PREFLIGHT_RESULT.json','docs/verification/BUYER_SELF_VALIDATION_RESULT.json',
'docs/verification/PRODUCTION_READINESS_RESULT.json','docs/verification/RESILIENCE_GATE_RESULT.json',
'docs/RECOVERY_GATE_RESULT.json','docs/RED_TEAM_TRANSACTION_AUDIT_RESULT.json',
'docs/MUTATION_ROUTE_POLICY_RESULT.json','docs/MUTATION_BOUNDARY_GATE_RESULT.json',
'docs/INTERNAL_MUTATION_BOUNDARY_RESULT.json','docs/OUTBOX_DOMAIN_EVENT_INVENTORY_RESULT.json',
'docs/DOMAIN_EVENT_CONTRACT_GATE_RESULT.json','docs/PRE_INFRASTRUCTURE_FINAL_EVIDENCE_GATE_RESULT.json',
'docs/PRE_INFRA_TEST_EXECUTION_RESULT.json','docs/sbom/SBOM_GENERATION_RESULT.json',
'docs/verification/SECTOR_NEUTRALITY_RESULT.json','docs/verification/CONSOLE_COVERAGE_RESULT.json'
]);
const INTEGRITY_EXCLUSIONS=Object.freeze([...CHECKSUM_FILES,'SALES_PACKAGE_MANIFEST.json','junit.xml',...VOLATILE_EVIDENCE].sort());
function isSafeRelativePath(value){
 if(typeof value!=='string'||!value.length||value.includes('\\')||value.includes('\0')||value.startsWith('/')||path.posix.isAbsolute(value))return false;
 const n=path.posix.normalize(value);
 return n===value&&n!=='.'&&!value.split('/').some(x=>x==='..'||x==='.');
}
function isExcludedPath(relativePath,exclusions=INTEGRITY_EXCLUSIONS){
 const p=String(relativePath).replace(/\\/g,'/');
 return exclusions.some(x=>x.endsWith('/**')?p.startsWith(x.slice(0,-2)):p===x);
}
function shouldSkipDirectory(relativePath){
 const p=String(relativePath).split('/');
 return p.includes('.git')||p.includes('node_modules')||relativePath==='data'||relativePath.startsWith('data/');
}
function collectFiles(root){
 const files=[];
 function walk(dir,rel=''){
  const entries=fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name));
  for(const e of entries){
   const name=rel?path.posix.join(rel,e.name):e.name,absolute=path.join(dir,e.name);
   if(e.isSymbolicLink())throw new Error('PROVENANCE_SYMLINK_FORBIDDEN: '+name);
   if(e.isDirectory()){if(!shouldSkipDirectory(name))walk(absolute,name);}
   else if(e.isFile()&&!isExcludedPath(name))files.push(name);
  }
 }
 walk(root);return files.sort();
}
function parseChecksumFile(content){
 const entries=[],seen=new Set(),errors=[],lines=String(content).split(/\r?\n/);
 for(let i=0;i<lines.length;i++){
  const line=lines[i];if(!line.trim())continue;
  const m=line.match(/^([0-9a-f]{64})  (.+)$/);
  if(!m){errors.push('MALFORMED_LINE:'+(i+1));continue;}
  if(!isSafeRelativePath(m[2])){errors.push('UNSAFE_PATH:'+(i+1));continue;}
  if(seen.has(m[2])){errors.push('DUPLICATE_PATH:'+m[2]);continue;}
  seen.add(m[2]);entries.push({sha256:m[1],path:m[2]});
 }
 if(!entries.length)errors.push('EMPTY_CHECKSUM_FILE');
 return {valid:errors.length===0,entries,errors};
}
module.exports={CHECKSUM_FILES,INTEGRITY_EXCLUSIONS,VOLATILE_EVIDENCE,collectFiles,isExcludedPath,isSafeRelativePath,parseChecksumFile,shouldSkipDirectory};
