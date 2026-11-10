'use strict';

function assertRuntimeConfiguration(config, {postgresRuntimeWired = false} = {}) {
  const engine = String(config.databaseEngine || '').trim().toLowerCase();
  if (!['sqlite', 'postgres'].includes(engine)) throw new Error('DATABASE_ENGINE_INVALID');
  const expectedRaw = process.env.OPSC_EXPECTED_INSTANCES;
  if (expectedRaw !== undefined) {
    if (!/^\d+$/.test(String(expectedRaw)) || Number(expectedRaw) < 1) throw new Error('EXPECTED_INSTANCES_INVALID');
    if (Number(expectedRaw) > 1 && (engine !== 'postgres' || !postgresRuntimeWired)) {
      throw new Error('MULTI_INSTANCE_RUNTIME_NOT_WIRED');
    }
  }
  if (engine === 'postgres' && !postgresRuntimeWired) throw new Error('POSTGRES_RUNTIME_NOT_WIRED');
  if (config.databaseUrl && engine !== 'postgres') throw new Error('DATABASE_URL_REQUIRES_POSTGRES_ENGINE');
  if (engine === 'sqlite' && String(config.nodeEnv).toLowerCase() === 'production' && String(process.env.OPSC_ALLOW_SQLITE_PRODUCTION || '').toLowerCase() !== 'true')
    throw new Error('PRODUCTION_SQLITE_NOT_ALLOWED');
  return engine;
}

module.exports = { assertRuntimeConfiguration };
