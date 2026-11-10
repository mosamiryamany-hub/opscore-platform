const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDb } = require('../src/db');
const { Store } = require('../src/store');
function fixture(){const p=path.join(os.tmpdir(),`opscore-v05-${crypto.randomUUID()}.db`);const db=openDb(p);return {db,p};}
function close(f){f.db.close();for(const p of [f.p,`${f.p}-shm`,`${f.p}-wal`])try{fs.unlinkSync(p)}catch{}}

test('configurable workflow enforces transitions and records them',()=>{
 const f=fixture(),s=new Store(f.db,{sessionTtlHours:24});
 try {s.bootstrap({orgName:'Ops',email:'owner@example.com',password:'Strong-pass-2026'});const o=s.login('owner@example.com','Strong-pass-2026');
 const wf=s.createWorkflow(o,{name:'Controlled flow',statuses:['open','in_progress','blocked','completed','cancelled'],transitions:{open:['in_progress','cancelled'],in_progress:['blocked','completed'],blocked:['in_progress','cancelled']}});
 const w=s.createWorkOrder(o,{title:'Controlled job'});assert.equal(s.transitionWorkOrder(o,w.id,'in_progress').status,'in_progress');assert.throws(()=>s.transitionWorkOrder(o,w.id,'open'),/WORKFLOW_TRANSITION_FORBIDDEN/);assert.equal(s.transitionWorkOrder(o,w.id,'completed').status,'completed');assert.equal(f.db.prepare('SELECT COUNT(*) c FROM workflow_transition_log WHERE workflow_id=?').get(wf.id).c,2);
 } finally {close(f)}
});

test('operational intelligence is calculated from persisted records, not synthetic forecasts',()=>{
 const f=fixture(),s=new Store(f.db,{sessionTtlHours:24});
 try {s.bootstrap({orgName:'Ops',email:'owner@example.com',password:'Strong-pass-2026'});const o=s.login('owner@example.com','Strong-pass-2026');const w=s.createWorkOrder(o,{title:'Done'});s.updateWorkOrder(o,w.id,{status:'completed'});const m=s.operationalIntelligence(o);assert.equal(m.workOrders.total,1);assert.equal(m.workOrders.completed,1);assert.equal(m.workOrders.completionRate,100);assert.equal(typeof m.workOrders.averageCycleHours,'number');assert.equal(m.note.includes('synthetic'),true);
 } finally {close(f)}
});

test('procedures enforce ordered execution and preserve evidence metadata',()=>{
 const f=fixture(),s=new Store(f.db,{sessionTtlHours:24});
 try {s.bootstrap({orgName:'Ops',email:'owner@example.com',password:'Strong-pass-2026'});const o=s.login('owner@example.com','Strong-pass-2026');const w=s.createWorkOrder(o,{title:'Install'});const p=s.createProcedure(o,{name:'Install procedure',workType:'installation',steps:[{id:'check',title:'Check site'},{id:'install',title:'Install equipment'}]});const run=s.startProcedure(o,{procedureId:p.id,workOrderId:w.id});assert.throws(()=>s.completeProcedureStep(o,run.id,{stepIndex:1}),/PROCEDURE_ORDER_REQUIRED/);assert.equal(s.completeProcedureStep(o,run.id,{stepIndex:0,note:'checked'}).status,'in_progress');const done=s.completeProcedureStep(o,run.id,{stepIndex:1,evidenceIds:[]});assert.equal(done.status,'completed');
 } finally {close(f)}
});
