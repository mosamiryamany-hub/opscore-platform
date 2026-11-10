const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const script=path.join(__dirname,'dependency-upgrade-gate.js');
test('mobile dependency gate passes on the governed Expo/RN targets',()=>{
  const r=spawnSync(process.execPath,[script],{encoding:'utf8'});
  assert.equal(r.status,0);
  const out=JSON.parse(r.stdout);
  assert.equal(out.status,'PASS');
  assert.equal(out.current.lockfile.expo,'57.0.31');
  assert.equal(out.current.lockfile.rn,'0.86.3');
});
