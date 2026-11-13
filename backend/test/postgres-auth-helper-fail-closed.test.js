'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Store } = require('../src/store');

const sqlFunction = {
  memberships: 'opscore_list_memberships_for_user',
  resolveSession: 'opscore_resolve_session_by_token_hash',
  revokeSession: 'opscore_revoke_session_by_token_hash',
  createReset: 'opscore_create_password_reset_token'
};

function makePostgresStore(handlers = {}) {
  const calls = [];
  const sessionChanges = [];
  const store = Object.create(Store.prototype);
  store.config = { databaseEngine: 'postgres' };
  store.db = {
    setSession(value) {
      sessionChanges.push(value);
    },
    prepare(sql) {
      calls.push({ sql, method: 'prepare' });
      return {
        all(...params) {
          calls.push({ sql, method: 'all', params });
          if (handlers.all) return handlers.all(sql, params);
          throw new Error('UNEXPECTED_ALL_QUERY');
        },
        get(...params) {
          calls.push({ sql, method: 'get', params });
          if (handlers.get) return handlers.get(sql, params);
          throw new Error('UNEXPECTED_GET_QUERY');
        },
        run(...params) {
          calls.push({ sql, method: 'run', params });
          if (handlers.run) return handlers.run(sql, params);
          throw new Error('UNEXPECTED_RUN_QUERY');
        }
      };
    }
  };
  return { store, calls, sessionChanges };
}

function pgError(code, message) {
  return Object.assign(new Error(message), { code });
}

test('membership lookup propagates non-missing SECURITY DEFINER errors without raw SQL fallback', () => {
  const denied = pgError('42501', 'permission denied for function opscore_list_memberships_for_user');
  const { store, calls } = makePostgresStore({
    all(sql) {
      if (sql.includes(sqlFunction.memberships)) throw denied;
      throw new Error('RAW_MEMBERSHIP_FALLBACK_EXECUTED');
    }
  });
  assert.throws(() => store._listMembershipsForUser('user-a'), error => error === denied);
  assert.equal(calls.filter(call => call.method === 'all').length, 1);
  assert.equal(calls.length, 2);
});

test('session resolution and revocation propagate helper failures without direct table fallback', () => {
  for (const [method, functionName, invoke] of [
    ['resolve', sqlFunction.resolveSession, store => store._resolveSessionByTokenHash('token-hash')],
    ['revoke', sqlFunction.revokeSession, store => store._revokeSessionByTokenHash('token-hash')]
  ]) {
    const denied = pgError('42501', 'permission denied for function ' + functionName);
    const { store, calls } = makePostgresStore({
      get(sql) {
        if (sql.includes(functionName)) throw denied;
        throw new Error('RAW_SESSION_FALLBACK_EXECUTED:' + method);
      }
    });
    assert.throws(() => invoke(store), error => error === denied, method);
    assert.equal(calls.filter(call => call.method === 'get').length, 1, method);
    assert.equal(calls.length, 2, method);
  }
});

test('legacy membership/session helpers fall back only for PostgreSQL undefined_function', () => {
  const missingMembership = pgError('42883', 'function opscore_list_memberships_for_user(unknown) does not exist');
  const membershipStore = makePostgresStore({
    all(sql) {
      if (sql.includes(sqlFunction.memberships)) throw missingMembership;
      if (sql.includes('FROM memberships m JOIN organizations')) return [{
        organization_id: 'org-a', role: 'owner', org_name: 'Tenant A', created_at: '2026-01-01'
      }];
      throw new Error('UNEXPECTED_MEMBERSHIP_QUERY');
    }
  });
  assert.deepEqual(membershipStore.store._listMembershipsForUser('user-a'), [{
    user_id: 'user-a', organization_id: 'org-a', role: 'owner', org_name: 'Tenant A', created_at: '2026-01-01'
  }]);
  assert.equal(membershipStore.calls.filter(call => call.method === 'all').length, 2);

  const missingSession = pgError('42883', 'function opscore_resolve_session_by_token_hash(unknown) does not exist');
  const sessionStore = makePostgresStore({
    get(sql) {
      if (sql.includes(sqlFunction.resolveSession)) throw missingSession;
      if (sql.includes('FROM sessions s JOIN users u')) return null;
      throw new Error('UNEXPECTED_SESSION_QUERY');
    }
  });
  assert.equal(sessionStore.store._resolveSessionByTokenHash('token-hash'), null);
  assert.equal(sessionStore.calls.filter(call => call.method === 'get').length, 2);
});

test('a present password-reset helper denial never falls back to direct auth-mode INSERT', () => {
  const denied = new Error('NOT_FOUND');
  const { store, calls, sessionChanges } = makePostgresStore({
    get(sql) {
      if (sql.startsWith('SELECT u.id,u.email FROM users')) return { id: 'user-a', email: 'a@example.com' };
      if (sql.includes(sqlFunction.createReset)) return null;
      throw new Error('UNEXPECTED_RESET_QUERY');
    },
    run() {
      throw new Error('DIRECT_PASSWORD_RESET_INSERT_EXECUTED');
    }
  });
  store._requireOwnerOrAdmin = () => {};
  assert.throws(
    () => store.createPasswordReset({ organizationId: 'org-a', userId: 'admin-a', role: 'admin' }, 'user-a'),
    error => error.message === denied.message
  );
  assert.equal(calls.filter(call => call.sql.startsWith('INSERT INTO password_reset_tokens')).length, 0);
  assert.deepEqual(sessionChanges, []);
});

test('password-reset helper permission errors propagate without compatibility bypass', () => {
  const denied = pgError('42501', 'permission denied for function opscore_create_password_reset_token');
  const { store, calls, sessionChanges } = makePostgresStore({
    get(sql) {
      if (sql.startsWith('SELECT u.id,u.email FROM users')) return { id: 'user-a', email: 'a@example.com' };
      if (sql.includes(sqlFunction.createReset)) throw denied;
      throw new Error('UNEXPECTED_RESET_QUERY');
    },
    run() {
      throw new Error('DIRECT_PASSWORD_RESET_INSERT_EXECUTED');
    }
  });
  store._requireOwnerOrAdmin = () => {};
  assert.throws(
    () => store.createPasswordReset({ organizationId: 'org-a', userId: 'admin-a', role: 'admin' }, 'user-a'),
    error => error === denied
  );
  assert.equal(calls.filter(call => call.sql.startsWith('INSERT INTO password_reset_tokens')).length, 0);
  assert.deepEqual(sessionChanges, []);
});

test('legacy password-reset compatibility remains limited to an actually missing helper', () => {
  const missing = pgError('42883', 'function opscore_create_password_reset_token(unknown) does not exist');
  let insertCount = 0;
  const { store, calls, sessionChanges } = makePostgresStore({
    get(sql) {
      if (sql.startsWith('SELECT u.id,u.email FROM users')) return { id: 'user-a', email: 'a@example.com' };
      if (sql.includes(sqlFunction.createReset)) throw missing;
      throw new Error('UNEXPECTED_RESET_QUERY');
    },
    run(sql) {
      if (!sql.startsWith('INSERT INTO password_reset_tokens')) throw new Error('UNEXPECTED_WRITE');
      insertCount += 1;
      return { changes: 1 };
    }
  });
  store._requireOwnerOrAdmin = () => {};
  const result = store.createPasswordReset({ organizationId: 'org-a', userId: 'admin-a', role: 'admin' }, 'user-a');
  assert.equal(result.userId, 'user-a');
  assert.equal(result.delivery, 'caller_must_deliver_token');
  assert.equal(insertCount, 1);
  assert.deepEqual(sessionChanges.map(value => value.accessMode), ['auth', 'field']);
  assert.equal(calls.filter(call => call.sql.startsWith('INSERT INTO password_reset_tokens')).length, 1);
});


test('undefined_function from a nested membership helper is not mistaken for a missing auth resolver', () => {
  const nested = pgError('42883', 'function internal_membership_scope(text) does not exist');
  const { store, calls } = makePostgresStore({
    all(sql) {
      if (sql.includes(sqlFunction.memberships)) throw nested;
      throw new Error('RAW_MEMBERSHIP_FALLBACK_EXECUTED');
    }
  });
  assert.throws(() => store._listMembershipsForUser('user-a'), error => error === nested);
  assert.equal(calls.filter(call => call.method === 'all').length, 1);
});

test('OIDC resolver errors including undefined columns never fall back to raw identity-table reads', () => {
  for (const failure of [
    pgError('42501', 'permission denied for function opscore_resolve_oidc_identity'),
    pgError('42703', 'column "email" does not exist'),
    pgError('42883', 'function internal_oidc_claim_guard(text) does not exist')
  ]) {
    const { store, calls } = makePostgresStore({
      get(sql) {
        if (sql.includes('opscore_resolve_oidc_identity')) throw failure;
        throw new Error('RAW_OIDC_IDENTITY_FALLBACK_EXECUTED');
      }
    });
    assert.throws(
      () => store.loginOidc({ email: 'user@example.com', issuer: 'https://issuer.example', subject: 'sub-1', emailVerified: true }),
      error => error === failure
    );
    assert.equal(calls.filter(call => call.method === 'get').length, 1);
  }
});

test('a nested undefined function from password-reset consumption never opens the direct-write compatibility path', () => {
  const nested = pgError('42883', 'function internal_password_reset_audit(text) does not exist');
  const { store, calls, sessionChanges } = makePostgresStore({
    get(sql) {
      if (sql.includes('opscore_validate_password_reset_token')) return { valid: true };
      if (sql.includes('opscore_consume_password_reset_token')) throw nested;
      throw new Error('RAW_PASSWORD_RESET_QUERY_EXECUTED');
    }
  });
  const statements = [];
  store.db.exec = sql => statements.push(sql);
  assert.throws(() => store.resetPassword('raw-reset-token', 'New-password-2026!'), error => error === nested);
  assert.equal(statements.length, 0);
  assert.equal(calls.filter(call => call.method === 'get').length, 2);
  assert.deepEqual(sessionChanges, []);
});

test('a missing consume helper after successful validation is treated as partial migration and fails closed', () => {
  const missingConsume = pgError('42883', 'function opscore_consume_password_reset_token(text,text) does not exist');
  const { store, calls } = makePostgresStore({
    get(sql) {
      if (sql.includes('opscore_validate_password_reset_token')) return { valid: true };
      if (sql.includes('opscore_consume_password_reset_token')) throw missingConsume;
      throw new Error('RAW_PASSWORD_RESET_QUERY_EXECUTED');
    }
  });
  const statements = [];
  store.db.exec = sql => statements.push(sql);
  assert.throws(() => store.resetPassword('raw-reset-token', 'New-password-2026!'), error => error === missingConsume);
  assert.equal(statements.length, 0);
  assert.equal(calls.filter(call => call.method === 'get').length, 2);
});

test('password-reset direct compatibility is reachable only when the validation helper itself is absent', () => {
  const missingValidation = pgError('42883', 'function opscore_validate_password_reset_token(text) does not exist');
  const { store, calls } = makePostgresStore({
    get(sql) {
      if (sql.includes('opscore_validate_password_reset_token')) throw missingValidation;
      if (sql.includes('SELECT * FROM password_reset_tokens')) return {
        id: 'rst-1',
        user_id: 'user-a',
        expires_at: new Date(Date.now() + 60_000).toISOString()
      };
      throw new Error('UNEXPECTED_RESET_QUERY');
    },
    run(sql) {
      if (sql.startsWith('UPDATE users SET password_hash=')) return { changes: 1 };
      if (sql.startsWith('UPDATE password_reset_tokens SET used_at=')) return { changes: 1 };
      if (sql.startsWith('DELETE FROM sessions WHERE user_id=')) return { changes: 1 };
      throw new Error('UNEXPECTED_RESET_WRITE');
    }
  });
  const statements = [];
  store.db.exec = sql => statements.push(sql);
  assert.deepEqual(store.resetPassword('raw-reset-token', 'New-password-2026!'), { reset: true });
  assert.deepEqual(statements, ['BEGIN IMMEDIATE', 'COMMIT']);
  assert.equal(calls.filter(call => call.sql.includes('opscore_validate_password_reset_token')).length, 1);
});
