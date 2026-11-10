'use strict';

const ACCEPTANCE_DATABASE = 'opscore_acceptance';
const PRODUCTION_HOST_MARKERS = ['ep-mute-sun-bcahhoei', 'ep-winter-leaf-b4d0bwgk'];
const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/i;

function targetError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function validatePostgresAcceptanceTarget({
  urlText = process.env.OPSC_PG_ACCEPTANCE_URL,
  expectedHost = process.env.OPSC_PG_ACCEPTANCE_HOST
} = {}) {
  const raw = String(urlText || '').trim();
  const allowlistedHost = String(expectedHost || '').trim().toLowerCase();
  if (!raw) throw targetError('OPSC_PG_ACCEPTANCE_URL_REQUIRED');
  if (!allowlistedHost) throw targetError('OPSC_PG_ACCEPTANCE_HOST_REQUIRED');
  if (!HOST_RE.test(allowlistedHost)) throw targetError('OPSC_PG_ACCEPTANCE_HOST_INVALID');

  let parsed;
  try { parsed = new URL(raw); }
  catch { throw targetError('OPSC_PG_ACCEPTANCE_URL_INVALID'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw targetError('OPSC_PG_ACCEPTANCE_PROTOCOL_INVALID');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (PRODUCTION_HOST_MARKERS.some(marker => hostname.includes(marker))) {
    throw targetError('OPSC_PG_ACCEPTANCE_PRODUCTION_HOST_FORBIDDEN');
  }
  if (hostname !== allowlistedHost) throw targetError('OPSC_PG_ACCEPTANCE_HOST_MISMATCH');

  let database;
  try { database = decodeURIComponent(parsed.pathname.replace(/^\/+/, '')); }
  catch { throw targetError('OPSC_PG_ACCEPTANCE_DATABASE_INVALID'); }
  if (database !== ACCEPTANCE_DATABASE) {
    throw targetError('OPSC_PG_ACCEPTANCE_DATABASE_NOT_ALLOWLISTED');
  }

  return { parsed, database, hostname };
}

if (require.main === module) {
  try {
    const target = validatePostgresAcceptanceTarget();
    console.log(`POSTGRES_ACCEPTANCE_TARGET=PASS database=${target.database} host=allowlisted`);
  } catch (error) {
    console.error(`POSTGRES_ACCEPTANCE_TARGET=BLOCKED ${error.code || 'INVALID_TARGET'}`);
    process.exitCode = 1;
  }
}

module.exports = { ACCEPTANCE_DATABASE, PRODUCTION_HOST_MARKERS, validatePostgresAcceptanceTarget };
