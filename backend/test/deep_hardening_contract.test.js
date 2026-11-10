const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {makeBlock, verifyBlock} = require('../src/sync-atomic-journal');
const {evaluateContext} = require('../src/contextual-access-policy');
const {eligibleAssignments} = require('../src/route-constraints');

test('atomic block detects tampering', () => {
  const b = makeBlock([{clientEventId:'e1',operation:'close',entityId:'w1',payload:{ok:true}}], 'u1');
  assert.equal(verifyBlock(b), true);
  b.events[0].payload.ok = false;
  assert.equal(verifyBlock(b), false);
});
test('context policy requires role, spatial, temporal and fresh GPS', () => {
  const base = {role:'technician',allowedRoles:['technician'],actorPoint:{lat:30,lon:31},taskPoint:{lat:30,lon:31},now:'2026-01-01T10:00:00Z',startsAt:'2026-01-01T09:00:00Z',endsAt:'2026-01-01T11:00:00Z',gpsCapturedAt:'2026-01-01T09:59:00Z'};
  assert.equal(evaluateContext(base).allow, true);
  assert.equal(evaluateContext({...base, role:'viewer'}).allow, false);
  assert.equal(evaluateContext({...base, gpsCapturedAt:'2026-01-01T09:00:00Z'}).allow, false);
});
test('assignment feasibility is deterministic', () => {
  const out = eligibleAssignments([{id:'w1',requiredSkills:['fiber'],requiredEquipment:['otdr'],window:{start:10,end:12}}],
    [{id:'t1',skills:['fiber'],equipment:['otdr'],availableFrom:9,availableTo:13},{id:'t2',skills:['fiber'],equipment:[],availableFrom:9,availableTo:13}]);
  assert.deepEqual(out,[{taskId:'w1',candidates:['t1']}]);
});


test('atomic sync envelope is persisted and rejects changed replay', () => {
  const fs = require('node:fs');
  const {openDb} = require('../src/db');
  const {Store} = require('../src/store');
  const config = require('../src/config');
  const {tmpDbPath, cleanup} = require('./helpers');
  const dbPath = tmpDbPath('atomic-sync');
  const oldRepo = process.env.OPSC_REPOSITORY_PATH;
  const oldDb = process.env.OPSC_SQLITE_PATH;
  process.env.OPSC_SQLITE_PATH = dbPath;
  process.env.OPSC_REPOSITORY_PATH = path.join(require('node:os').tmpdir(), `opscore-files-${process.pid}-${Date.now()}`);
  try {
    const db = openDb(dbPath);
    const store = new Store(db, config);
    const t = new Date().toISOString();
    const org = 'org-sync-test', user = 'usr-sync-test';
    db.prepare('INSERT INTO organizations(id,name,created_at) VALUES(?,?,?)').run(org,'Sync Test',t);
    db.prepare('INSERT INTO users(id,email,password_hash,status,created_at) VALUES(?,?,?,?,?)').run(user,'sync@test.invalid','x','active',t);
    db.prepare('INSERT INTO memberships(user_id,organization_id,role,created_at) VALUES(?,?,?,?)').run(user,org,'owner',t);
    const ctx = {organizationId:org,userId:user,role:'owner',scopes:['*']};
    const block = {blockId:'block-test-1',blockVersion:1,events:[]};
    const first = store.applySyncEvents(ctx, [], block);
    assert.equal(first.results.length, 0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM sync_blocks WHERE organization_id=? AND block_id=?').get(org,'block-test-1').n, 1);
    assert.throws(() => store.applySyncEvents(ctx, [], {blockId:'block-test-1',blockVersion:1,events:[{clientEventId:'e2',operation:'comment',entityId:'x',payload:{body:'changed'}}]}), /SYNC_BLOCK_ID_REUSED/);
    db.close();
  } finally {
    if (oldDb === undefined) delete process.env.OPSC_SQLITE_PATH; else process.env.OPSC_SQLITE_PATH = oldDb;
    if (oldRepo === undefined) delete process.env.OPSC_REPOSITORY_PATH; else process.env.OPSC_REPOSITORY_PATH = oldRepo;
    cleanup(fs, dbPath);
  }
});
