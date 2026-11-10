const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');

const root=path.join(__dirname,'..');

test('demo seed is fail-closed in production',()=>{
  const result=cp.spawnSync(process.execPath,['scripts/seed-demo.js'],{cwd:root,env:{...process.env,NODE_ENV:'production',SQLITE_PATH:path.join(root,'data','should-not-be-created.sqlite')},encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(`${result.stdout}\n${result.stderr}`,/DEMO_SEED_FORBIDDEN_IN_PRODUCTION/);
  assert.equal(fs.existsSync(path.join(root,'data','should-not-be-created.sqlite')),false);
});

test('buyer demo documentation exposes the truth boundary',()=>{
  const script=fs.readFileSync(path.join(root,'..','docs','00-START-HERE','DEMO_SCRIPT.md'),'utf8');
  const evalDoc=fs.readFileSync(path.join(root,'..','docs','commercial','BUYER_EVALUATION.md'),'utf8');
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const releaseMarker=new RegExp('Release: v'+pkg.version.replaceAll('.','\\.'));
  assert.match(script,releaseMarker);
  assert.match(script,/external payment gateway is connected/i);
  assert.match(evalDoc,/environment-specific acceptance/i);
});

test('demo seed refuses PostgreSQL runtime configuration before creating a SQLite file',()=>{
  const dbPath=path.join(root,'data','should-not-be-created-postgres-demo.sqlite');
  try { fs.rmSync(dbPath,{force:true}); } catch {}
  const result=cp.spawnSync(process.execPath,['scripts/seed-demo.js'],{
    cwd:root,
    env:{
      ...process.env,
      NODE_ENV:'test',
      DATABASE_ENGINE:'postgres',
      DATABASE_URL:'',
      OPSC_DATABASE_URL:'postgresql://opscore_app:unused@127.0.0.1/acceptance_test',
      SQLITE_PATH:dbPath,
      OPSC_DEMO_PASSWORD_ADMIN:'',
      OPSC_DEMO_PASSWORD_DISPATCHER:'',
      OPSC_DEMO_PASSWORD_TECHNICIAN:'',
      OPSC_DEMO_PASSWORD_VIEWER:''
    },
    encoding:'utf8',
    timeout:10000
  });
  assert.notEqual(result.status,0);
  assert.match(`${result.stdout}\\n${result.stderr}`,/DEMO_SEED_REQUIRES_LOCAL_SQLITE_ONLY/);
  assert.equal(fs.existsSync(dbPath),false);
});
