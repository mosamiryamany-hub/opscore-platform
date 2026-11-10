'use strict';
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const policy=JSON.parse(fs.readFileSync(path.join(ROOT,'docs','MUTATION_ROUTE_POLICY_RESULT.json'),'utf8'));
const mutating=policy.entries.filter(e=>!e.classification.startsWith('NON_MUTATING'));
const unwrapped=mutating.filter(e=>!e.contractPresent).map(e=>({name:e.name,route:e.route,policy:e.policy}));
const report={
  schemaVersion:'opscore.mutation-boundary.v2',
  generatedAt:new Date().toISOString(),
  sourcePolicy:'MUTATION_ROUTE_POLICY_RESULT.json',
  mutationRoutes:mutating.length,
  idempotentWriteBoundaries:mutating.filter(e=>e.policy==='idempotentWrite').length,
  asyncIdempotencyBoundaries:mutating.filter(e=>e.policy.includes('async')).length,
  explicitReplayAtomicityPolicy:mutating.filter(e=>e.policy).length,
  notCovered:unwrapped,
  status:unwrapped.length?'REVIEW':'PASS',
  reason:unwrapped.length?'At least one current mutation boundary lacks a verified explicit policy marker.':'All current mutation boundaries have an explicit, source-backed replay/atomicity policy; this does not certify runtime concurrency.'
};
fs.writeFileSync(path.join(ROOT,'docs','MUTATION_BOUNDARY_GATE_RESULT.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
