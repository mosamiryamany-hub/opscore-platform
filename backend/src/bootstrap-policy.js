'use strict';

function resolveBootstrapConfig(baseConfig, env = process.env) {
  const engine = String(baseConfig?.databaseEngine || env.DATABASE_ENGINE || 'sqlite').trim().toLowerCase();
  if (engine !== 'postgres') {
    if (String(env.NODE_ENV || '').trim().toLowerCase() === 'production') {
      throw new Error('BOOTSTRAP_POSTGRES_REQUIRED_IN_PRODUCTION');
    }
    return baseConfig;
  }

  const bootstrapUrl = String(env.OPSC_BOOTSTRAP_DATABASE_URL || '').trim();
  if (!bootstrapUrl) throw new Error('OPSC_BOOTSTRAP_DATABASE_URL_REQUIRED');
  const runtimeUrls = [env.OPSC_DATABASE_URL, env.DATABASE_URL]
    .filter(value => typeof value === 'string' && value.trim())
    .map(value => value.trim());
  if (runtimeUrls.includes(bootstrapUrl)) {
    throw new Error('BOOTSTRAP_DATABASE_URL_MUST_BE_SEPARATE');
  }
  return { ...baseConfig, databaseUrl: bootstrapUrl };
}

function assertBootstrapDatabaseRole(db, engine) {
  if (String(engine || '').trim().toLowerCase() !== 'postgres') return true;
  if (!db || typeof db.prepare !== 'function') throw new Error('BOOTSTRAP_DATABASE_ROLE_UNVERIFIED');
  const row = db.prepare(
    'SELECT current_user AS role, r.rolsuper AS superuser, r.rolbypassrls AS bypass_rls FROM pg_roles r WHERE r.rolname = current_user'
  ).get();
  if (!row || row.role !== 'neondb_owner' || row.superuser !== false || row.bypass_rls !== true) {
    throw new Error('BOOTSTRAP_DATABASE_ROLE_NOT_ALLOWED');
  }
  return true;
}

function isHttpBootstrapAllowed(nodeEnv) {
  return String(nodeEnv || 'development').trim().toLowerCase() !== 'production';
}

module.exports = {
  resolveBootstrapConfig,
  assertBootstrapDatabaseRole,
  isHttpBootstrapAllowed
};
