#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const backend=path.join(root,'backend');
const openapi=JSON.parse(fs.readFileSync(path.join(backend,'docs','openapi.json'),'utf8'));
const inventory=JSON.parse(fs.readFileSync(path.join(backend,'docs','API_INVENTORY.json'),'utf8'));

const sources=[
  ['backend/web/app.js',fs.readFileSync(path.join(backend,'web','app.js'),'utf8')],
  ['backend/web/portal.js',fs.readFileSync(path.join(backend,'web','portal.js'),'utf8')]
];

function normalize(raw){
  return raw.replace(/\$\{[^}]+\}/g,'{param}').replace(/\?.*$/,'').replace(/\/+$/,'');
}
const used=new Set();
for(const [file,text] of sources){
  const re=/(?:'|\"|`)(\/api\/v1\/[^'\"`]*)(?:'|\"|`)/g;
  for(const m of text.matchAll(re)) used.add(normalize(m[1]));
}
const documented=[...new Set((inventory.routes||[]).map(r=>r.route))];
const documentedV1=documented.filter(x=>x.startsWith('/api/v1/'));
function matches(usedPath,docPath){
  if(usedPath===docPath) return true;
  const a=usedPath.split('/'),b=docPath.split('/');
  if(a.length!==b.length) return false;
  return a.every((x,i)=>x.startsWith('{') || b[i].startsWith('{') || x===b[i]);
}
const mapped=[...used].map(u=>({path:u,documented:documentedV1.some(d=>matches(u,d))}));
const unmapped=mapped.filter(x=>!x.documented);
const coreRecords=[
  '/api/v1/customers',
  '/api/v1/sites',
  '/api/v1/assets',
  '/api/v1/inventory',
  '/api/v1/members',
  '/api/v1/work-orders',
  '/api/v1/appointments',
  '/api/v1/dispatch-board',
  '/api/v1/security-center',
  '/api/v1/operations/cockpit'
];
const corePresence=coreRecords.map(pathname=>({path:pathname,used:[...used].some(u=>matches(u,pathname))}));
const report={
  schemaVersion:'opscore.console-coverage.v1',
  release:JSON.parse(fs.readFileSync(path.join(backend,'package.json'),'utf8')).version,
  backendApiInventory:{operations:inventory.routeCount,documentedPaths:documentedV1.length},
  webConsole:{files:sources.map(x=>x[0]),uniqueApiPaths:[...used].sort(),uniqueApiPathsCount:used.size,documentedMatchCount:mapped.filter(x=>x.documented).length,unmappedPaths:unmapped},
  coreOperationalSurface:corePresence,
  interpretation:'The browser console is a focused operational surface, not a claim that every backend API operation has a dedicated screen. Advanced governance, billing, provider integration, automation, and infrastructure controls remain API-first where a UI would add little buyer value before infrastructure verification.',
  generatedAt:new Date().toISOString(),
  status:unmapped.length===0 && corePresence.every(x=>x.used)?'PASS':'REVIEW'
};
const out=path.join(root,'docs','verification','CONSOLE_COVERAGE_RESULT.json');
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
process.exitCode=report.status==='PASS'?0:1;
