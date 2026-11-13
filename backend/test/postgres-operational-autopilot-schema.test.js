'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const migration=fs.readFileSync(path.join(__dirname,'..','sql','postgres','059_operational_autopilot_tables.sql'),'utf8');
const moduleSource=fs.readFileSync(path.join(__dirname,'..','src','operational-autopilot.js'),'utf8');
const canonicalSchema=fs.readFileSync(path.join(__dirname,'..','db','postgresql_schema.sql'),'utf8');

test('PostgreSQL migration provisions every governed autopilot table with tenant RLS',()=>{
  for(const table of ['incident_replays','decision_memory','autopilot_proposals']){
    assert.match(migration,new RegExp('CREATE TABLE IF NOT EXISTS public\\.'+table+'\\b'));
  }
  assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
  assert.match(migration,/FORCE ROW LEVEL SECURITY/);
  assert.match(migration,/AS PERMISSIVE FOR ALL/);
  assert.match(migration,/AS RESTRICTIVE FOR ALL/);
  assert.match(migration,/current_setting\\(''app\\.tenant_id''/);
});

test('only the actual least-privilege runtime receives autopilot DML grants',()=>{
  assert.match(migration,/GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE[\\s\\S]*TO opscore_runtime/);
  assert.match(migration,/REVOKE ALL PRIVILEGES ON TABLE[\\s\\S]*FROM PUBLIC,opscore_app/);
  assert.match(migration,/OPSC_AUTOPILOT_RUNTIME_ROLE_NOT_LEAST_PRIVILEGED/);
  assert.match(migration,/OPSC_AUTOPILOT_RUNTIME_PRIVILEGE_POSTCONDITION_FAILED/);
});

test('ai_agent_runs proposal references match canonical schema and are orphan-checked',()=>{
  assert.match(migration,/ai_agent_runs_proposal_id_fkey/);
  assert.match(migration,/FOREIGN KEY \\(proposal_id\\)[\\s\\S]*REFERENCES public\\.autopilot_proposals\\(id\\)[\\s\\S]*ON DELETE SET NULL/);
  assert.match(migration,/OPSC_AUTOPILOT_EXISTING_PROPOSAL_REFERENCES_UNRESOLVED/);
  assert.match(canonicalSchema,/proposal_id TEXT REFERENCES autopilot_proposals\\(id\\) ON DELETE SET NULL/);
});

test('PostgreSQL no longer relies on SQLite lazy DDL for autopilot persistence',()=>{
  assert.match(moduleSource,/function ensureSchema\\(db\\)\\{if\\(db\\.engine==='postgres'\\)return/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS public\\.autopilot_proposals/);
});
