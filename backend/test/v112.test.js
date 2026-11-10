const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {tmpDbPath,cleanup}=require('./helpers');
const {Store}=require('../src/store');

test('sync batch isolates invalid events and commits valid neighbors',()=>{
  const p=tmpDbPath('sync-recovery');
  try{
    const db=require('../src/db').openDb(p);
    const s=new Store(db,{sessionTtlHours:24});
    const {orgId,userId}=s.bootstrap({orgName:'Sync Recovery Org',email:'sync@example.invalid',password:'Password-12345678'});
    const ctx={organizationId:orgId,userId,role:'owner',email:'sync@example.invalid'};
    const a=s.createWorkOrder(ctx,{title:'Valid A',description:''});
    const b=s.createWorkOrder(ctx,{title:'Valid B',description:''});
    const out=s.applySyncEvents(ctx,[
      {clientEventId:'ok-1',entityId:a.id,operation:'status_update',payload:{status:'in_progress'}},
      {clientEventId:'bad-1',entityId:'missing',operation:'status_update',payload:{status:'completed'}},
      {clientEventId:'ok-2',entityId:b.id,operation:'status_update',payload:{status:'completed'}}
    ]);
    assert.deepEqual(out.applied.map(x=>x.clientEventId),['ok-1','ok-2']);
    assert.equal(out.failed.length,1);
    assert.equal(out.failed[0].clientEventId,'bad-1');
    assert.equal(out.failed[0].retryable,false);
    assert.equal(s.getWorkOrder(ctx,a.id).status,'in_progress');
    assert.equal(s.getWorkOrder(ctx,b.id).status,'completed');
    assert.equal(db.prepare('SELECT COUNT(*) c FROM sync_events WHERE organization_id=?').get(orgId).c,2);
    db.close();
  }finally{cleanup(fs,p)}
});
