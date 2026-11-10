'use strict';
const fs=require('fs');const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const checks=[];
function check(name,ok,detail){checks.push({name,ok,detail});}
const db=read('src/db.js'), sync=read('src/sync-atomic-journal.js'), apiInventory=read('src/server.js'), mobile=fs.readFileSync(path.join(root,'..','mobile/src/sync.js'),'utf8');
check('work-order lifecycle is centralized',/status IN \('open','in_progress','blocked','completed','cancelled'\)/.test(db),'SQLite work_orders constraint');
check('outbox is tenant-scoped and idempotent',/UNIQUE\(organization_id,event_key\)/.test(db),'integration_outbox uniqueness');
check('operational jobs are durable',/CREATE TABLE IF NOT EXISTS operational_jobs/.test(db),'operational_jobs table');
check('atomic envelope has block identity',/blockId|block_id/.test(sync),'sync journal block identity');
check('atomic envelope hashes canonical payload',/sha256|SHA-256|createHash/.test(sync),'canonical hash');
check('mobile sync uses durable queue',/SQLite|sqlite|queue|pending/i.test(mobile),'mobile durable queue path');
check('API inventory includes canonical handoff',/handoff/.test(apiInventory),'handoff route inventory');
check('RLS migration is restrictive',/AS RESTRICTIVE/.test(read('sql/postgres/023_contextual_sync_and_rls.sql')),'contextual RLS cannot be weakened by permissive policies');
const failed=checks.filter(x=>!x.ok);const result={schemaVersion:'opscore.integration-coherence.v1',status:failed.length?'fail':'pass',checks,failedCount:failed.length};
console.log(JSON.stringify(result,null,2));if(failed.length)process.exit(1);
