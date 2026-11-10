const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { Store } = require('../src/store');
const config = require('../src/config');

test('session logout invalidates the bearer session and records audit', () => {
  const db = openDb(':memory:');
  try {
    const store = new Store(db, config);
    store.bootstrap({orgName:'Logout Test',email:'owner@example.com',password:'A-secure-password-123'});
    const login = store.login('owner@example.com','A-secure-password-123');
    const ctx = store.session(login.token);
    assert.ok(ctx?.sessionId);
    assert.equal(store.logout(login.token).loggedOut, true);
    assert.equal(store.session(login.token), null);
    assert.equal(db.prepare("SELECT COUNT(*) c FROM audit_log WHERE organization_id=? AND action='logout'").get(ctx.organizationId).c, 1);
  } finally { db.close(); }
});
