'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {openDb} = require('../src/db');
const {Store} = require('../src/store');

test('cross-module integrity graph passes a coherent tenant graph', () => {
  const db=openDb(':memory:'); const store=new Store(db);
  const t='2026-09-17T00:00:00.000Z';
  db.prepare('INSERT INTO organizations VALUES (?,?,?)').run('org_a','A',t);
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('usr_a','a@example.com','hash','active',t);
  db.prepare('INSERT INTO memberships VALUES (?,?,?,?)').run('usr_a','org_a','owner',t);
  db.prepare('INSERT INTO customers (id,organization_id,name,email,phone,external_ref,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run('cus_a','org_a','Customer',null,null,null,'active',t,t);
  db.prepare('INSERT INTO sites VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('site_a','org_a','cus_a','Site',null,null,null,null,null,t,t);
  db.prepare('INSERT INTO work_orders (id,organization_id,number,title,description,status,priority,customer_id,site_id,assigned_to,team_name,due_at,created_by,created_at,updated_at,completion_policy_id,completion_policy_version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('wo_a','org_a','WO-1','Work','', 'open','normal','cus_a','site_a','usr_a',null,null,'usr_a',t,t,null,null);
  const out=store.crossModuleIntegrity({organizationId:'org_a',userId:'usr_a',role:'owner'});
  assert.equal(out.status,'PASS'); assert.equal(out.violationCount,0); assert.ok(out.checks>=15); db.close();
});

test('cross-module integrity graph detects cross-tenant relationships', () => {
  const db=openDb(':memory:'); const store=new Store(db); const t='2026-09-17T00:00:00.000Z';
  db.prepare('INSERT INTO organizations VALUES (?,?,?)').run('org_a','A',t);
  db.prepare('INSERT INTO organizations VALUES (?,?,?)').run('org_b','B',t);
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('usr_a','a@example.com','hash','active',t);
  db.prepare('INSERT INTO memberships VALUES (?,?,?,?)').run('usr_a','org_a','owner',t);
  db.prepare('INSERT INTO customers (id,organization_id,name,email,phone,external_ref,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run('cus_b','org_b','B customer',null,null,null,'active',t,t);
  db.prepare('INSERT INTO sites VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('site_a','org_a','cus_b','Broken site',null,null,null,null,null,t,t);
  const out=store.crossModuleIntegrity({organizationId:'org_a',userId:'usr_a',role:'owner'});
  assert.equal(out.status,'FAIL'); assert.equal(out.counts.SITE_CUSTOMER_ORG_MISMATCH,1); db.close();
});

test('authorization decision evidence is tenant scoped and explicit', () => {
  const db=openDb(':memory:'); const store=new Store(db); const t='2026-09-17T00:00:00.000Z';
  db.prepare('INSERT INTO organizations VALUES (?,?,?)').run('org_a','A',t);
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('usr_a','a@example.com','hash','active',t);
  db.prepare('INSERT INTO memberships VALUES (?,?,?,?)').run('usr_a','org_a','owner',t);
  const row=store.recordAuthorizationDecision({organizationId:'org_a',userId:'usr_a',role:'owner',source:'api',correlationId:'req_1'}, {action:'api_scope:read',resourceType:'api',resourceId:'read',decision:'deny',reasonCode:'API_KEY_SCOPE_FORBIDDEN'});
  assert.equal(row.schemaVersion,'opscore.authorization-decision.v1'); assert.equal(row.decision,'deny');
  assert.equal(store.authorizationDecisions({organizationId:'org_a',role:'owner'},10).length,1);
  assert.equal(store.authorizationDecisions({organizationId:'org_b',role:'owner'},10).length,0);
  db.close();
});
