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
    assert.ok(migration.includes(`CREATE TABLE IF NOT EXISTS public.${table} (`),`missing table DDL: ${table}`);
  }
  assert.ok(migration.includes('ENABLE ROW LEVEL SECURITY'));
  assert.ok(migration.includes('FORCE ROW LEVEL SECURITY'));
  assert.ok(migration.includes('AS PERMISSIVE FOR ALL'));
  assert.ok(migration.includes('AS RESTRICTIVE FOR ALL'));
  assert.ok(migration.includes("current_setting(''app.tenant_id'',true)"));
});

test('only the actual least-privilege runtime receives autopilot DML grants',()=>{
  assert.ok(migration.includes('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE'));
  assert.ok(migration.includes('TO opscore_runtime'));
  assert.ok(migration.includes('FROM PUBLIC,opscore_app'));
  assert.ok(migration.includes('OPSC_AUTOPILOT_RUNTIME_ROLE_NOT_LEAST_PRIVILEGED'));
  assert.ok(migration.includes('OPSC_AUTOPILOT_RUNTIME_PRIVILEGE_POSTCONDITION_FAILED'));
});

test('proposal and decision foreign keys cannot cross tenant boundaries',()=>{
  assert.ok(migration.includes('decision_replays_id_organization_unique'));
  assert.ok(migration.includes('FOREIGN KEY (decision_id,organization_id)'));
  assert.ok(migration.includes('REFERENCES public.decision_replays(id,organization_id)'));
  assert.ok(migration.includes('ai_agent_runs_proposal_tenant_fkey'));
  assert.ok(migration.includes('FOREIGN KEY (proposal_id,organization_id)'));
  assert.ok(migration.includes('REFERENCES public.autopilot_proposals(id,organization_id)'));
  assert.ok(migration.includes('ON DELETE SET NULL (proposal_id)'));
  assert.ok(migration.includes('OPSC_AUTOPILOT_EXISTING_PROPOSAL_REFERENCES_UNRESOLVED'));
  assert.ok(canonicalSchema.includes('proposal_id TEXT REFERENCES autopilot_proposals(id) ON DELETE SET NULL'));
});

test('PostgreSQL no longer relies on SQLite lazy DDL for autopilot persistence',()=>{
  assert.ok(moduleSource.includes("function ensureSchema(db){if(db.engine==='postgres')return"));
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS public.autopilot_proposals'));
});
