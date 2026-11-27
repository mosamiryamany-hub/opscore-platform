'use strict';

const { Client } = require('pg');

const PRODUCTION_HOST_MARKER = 'ep-winter-leaf-b4d0bwgk';
const DATABASE_NAME = 'opscore_acceptance';
const CLEANUP_ROLE = 'neondb_owner';

function invalid(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function validateSeedTarget(env = process.env) {
  const raw = String(env.OPSC_PG_ACCEPTANCE_CLEANUP_URL || '').trim();
  const expectedHost = String(env.OPSC_PG_ACCEPTANCE_CLEANUP_HOST || '').trim().toLowerCase();
  const runtimeHost = String(env.OPSC_PG_ACCEPTANCE_HOST || '').trim().toLowerCase();
  const secretHex = String(env.OPSC_TENANT_CONTEXT_HMAC_KEY || '').trim();
  const keyId = String(env.OPSC_TENANT_CONTEXT_KEY_ID || '').trim();

  if (!raw || !expectedHost || !runtimeHost) throw invalid('CI_SIGNING_KEY_SEED_TARGET_REQUIRED');
  let url;
  try { url = new URL(raw); } catch { throw invalid('CI_SIGNING_KEY_SEED_URL_INVALID'); }
  const host = String(url.hostname || '').toLowerCase();
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, '').split('/')[0] || '');
  const role = decodeURIComponent(url.username || '');

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw invalid('CI_SIGNING_KEY_SEED_PROTOCOL_INVALID');
  if (!host || host !== expectedHost || host !== runtimeHost) throw invalid('CI_SIGNING_KEY_SEED_HOST_MISMATCH');
  if (host.includes('-pooler') || host.includes(PRODUCTION_HOST_MARKER)) throw invalid('CI_SIGNING_KEY_SEED_PRODUCTION_OR_POOLER_FORBIDDEN');
  if (database !== DATABASE_NAME || role !== CLEANUP_ROLE) throw invalid('CI_SIGNING_KEY_SEED_IDENTITY_MISMATCH');
  if (!/^[a-f0-9]{64}$/i.test(secretHex)) throw invalid('CI_SIGNING_KEY_SEED_SECRET_INVALID');
  if (!/^ci-[0-9]{1,20}-[0-9]{1,6}$/.test(keyId)) throw invalid('CI_SIGNING_KEY_SEED_ID_INVALID');
  return { url, host, database, role, secretHex, keyId };
}

async function seedSigningKey(env = process.env) {
  const target = validateSeedTarget(env);
  const client = new Client({
    connectionString: target.url.toString(),
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 30000,
    application_name: 'opscore-ci-one-run-signing-key-seed'
  });
  try {
    await client.connect();
    const identity = (await client.query(
      "SELECT current_database() AS database,current_user AS role,r.rolsuper AS superuser,r.rolbypassrls AS bypass_rls,to_regclass('opscore_security.context_hmac_keys') AS key_table,to_regprocedure('opscore_security.verified_rls_context()') AS verifier FROM pg_roles r WHERE r.rolname=current_user"
    )).rows[0];
    if (!identity || identity.database !== target.database || identity.role !== CLEANUP_ROLE
        || identity.superuser !== false || identity.bypass_rls !== true
        || !identity.key_table || !identity.verifier) {
      throw invalid('CI_SIGNING_KEY_SEED_DATABASE_CONTRACT_FAILED');
    }
    const runtimeSafety = (await client.query(
      "SELECT has_table_privilege('opscore_runtime','opscore_security.context_hmac_keys','SELECT') AS runtime_can_read_key,has_function_privilege('opscore_runtime','opscore_security.verified_rls_context()','EXECUTE') AS runtime_can_verify"
    )).rows[0];
    if (!runtimeSafety || runtimeSafety.runtime_can_read_key !== false || runtimeSafety.runtime_can_verify !== true) {
      throw invalid('CI_SIGNING_KEY_SEED_RUNTIME_PRIVILEGE_CONTRACT_FAILED');
    }
    const inserted = await client.query(
      "INSERT INTO opscore_security.context_hmac_keys (key_id,secret,enabled,not_before,not_after) VALUES ($1,decode($2,'hex'),true,clock_timestamp()-interval '30 seconds',clock_timestamp()+interval '2 hours') RETURNING key_id,enabled,octet_length(secret) AS secret_bytes",
      [target.keyId, target.secretHex]
    );
    if (inserted.rowCount !== 1 || inserted.rows[0].key_id !== target.keyId
        || inserted.rows[0].enabled !== true || Number(inserted.rows[0].secret_bytes) !== 32) {
      throw invalid('CI_SIGNING_KEY_SEED_INSERT_VERIFY_FAILED');
    }
    process.stdout.write('CI_TENANT_CONTEXT_KEY_SEEDED=PASS role=neondb_owner runtime_secret_read=false verifier_execute=true key_id=' + target.keyId + '\n');
    return true;
  } finally {
    await client.end().catch(() => {});
  }
}

if (require.main === module) {
  seedSigningKey().catch(error => {
    process.stderr.write('CI_TENANT_CONTEXT_KEY_SEEDED=FAIL code=' + String(error && error.code || 'CI_SIGNING_KEY_SEED_FAILED') + '\n');
    process.exitCode = 1;
  });
}

module.exports = { validateSeedTarget, seedSigningKey };
