'use strict';

function verifyProductionEnvironment(env = process.env) {
  const checks = [
    { name: 'NODE_ENV', ok: String(env.NODE_ENV || '').trim().toLowerCase() === 'production' },
    { name: 'DATABASE_ENGINE', ok: String(env.DATABASE_ENGINE || '').trim().toLowerCase() === 'postgres' },
    { name: 'OPSC_DATABASE_URL', ok: typeof env.OPSC_DATABASE_URL === 'string' && env.OPSC_DATABASE_URL.trim().length > 0 },
    { name: 'DATABASE_URL', ok: !env.DATABASE_URL || env.DATABASE_URL === env.OPSC_DATABASE_URL },
    { name: 'OPSC_MIGRATION_DATABASE_URL', ok: !env.OPSC_MIGRATION_DATABASE_URL },
    { name: 'OPSC_BOOTSTRAP_DATABASE_URL', ok: !env.OPSC_BOOTSTRAP_DATABASE_URL },
    { name: 'OPSC_PRODUCTION_HOLD', ok: String(env.OPSC_PRODUCTION_HOLD || '').trim().toLowerCase() === 'false' },
    { name: 'OPSC_RELEASE_VERIFIED', ok: String(env.OPSC_RELEASE_VERIFIED || '').trim().toLowerCase() === 'true' }
  ];
  return {
    schemaVersion: 'opscore.production-environment-preflight.v1',
    passed: checks.every(check => check.ok),
    checks: checks.map(check => ({ name: check.name, status: check.ok ? 'PASS' : 'FAIL' }))
  };
}

function main() {
  const result = verifyProductionEnvironment();
  for (const check of result.checks) process.stdout.write(`${check.status} ${check.name}\n`);
  process.stdout.write(`PRODUCTION_ENVIRONMENT_PREFLIGHT=${result.passed ? 'PASS' : 'BLOCKED'}\n`);
  if (!result.passed) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { verifyProductionEnvironment };
