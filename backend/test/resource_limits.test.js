const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=cp;

test('API inventory is generated and contains authenticated operational routes',()=>{
  const outDir=fs.mkdtempSync(path.join(os.tmpdir(),'opscore-api-inventory-'));
  const outFile=path.join(outDir,'API_INVENTORY.json');
  try {
    execFileSync(process.execPath,['scripts/api-inventory.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,OPSC_API_INVENTORY_PATH:outFile},stdio:'pipe'});
    const x=JSON.parse(fs.readFileSync(outFile,'utf8'));
  assert.ok(x.routeCount>=80);
    assert.ok(x.routes.some(r=>r.route==='/api/v1/work-orders'&&r.method==='POST'&&r.scope==='write'));
  } finally {
    fs.rmSync(outDir,{recursive:true,force:true});
  }
});

test('server defines bounded request URL and body controls',()=>{
  const s=fs.readFileSync(path.join(__dirname,'..','src','server.js'),'utf8');
  assert.match(s,/config\.maxUrlLength/);
  assert.match(s,/config\.maxBodyBytes/);
  assert.match(s,/PAYLOAD_TOO_LARGE/);
  assert.match(s,/URI_TOO_LONG/);
});

test('large operational lists and exports are explicitly bounded',()=>{
  const s=fs.readFileSync(path.join(__dirname,'..','src','store.js'),'utf8');
  assert.match(s,/listCustomers[\s\S]*LIMIT 500/);
  assert.match(s,/listWorkOrders[\s\S]*LIMIT 500/);
  assert.match(s,/exportCustomers\s*\(\s*ctx\s*,\s*maxRows\s*=\s*5000\s*\)/);
  assert.match(s,/exportWorkOrders\s*\(\s*ctx\s*,\s*maxRows\s*=\s*5000\s*\)/);
});
