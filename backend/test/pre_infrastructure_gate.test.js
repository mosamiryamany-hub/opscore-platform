const test=require('node:test');
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');

test('pre-infrastructure gate reports only source/deterministic evidence and preserves infrastructure unknowns',()=>{
  const root=path.join(__dirname,'..','..');
  const script=path.join(__dirname,'..','scripts','pre-infrastructure-gate.js');
  const r=cp.spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8'});
  assert.equal(r.status,0,r.stderr||r.stdout);
  const report=JSON.parse(fs.readFileSync(path.join(root,'PRE_INFRASTRUCTURE_READINESS.json'),'utf8'));
  assert.equal(report.evidenceBoundary,'SOURCE_STATIC_DETERMINISTIC');
  assert.ok(report.checks.some(x=>x.id==='postgres-live'&&x.status==='UNVERIFIED'));
  assert.ok(report.checks.some(x=>x.id==='oidc-live'&&x.status==='UNVERIFIED'));
  assert.ok(report.checks.some(x=>x.id==='http-runtime-bounds'&&x.status==='VERIFIED'));
  assert.notEqual(report.status,'FAIL');
});
