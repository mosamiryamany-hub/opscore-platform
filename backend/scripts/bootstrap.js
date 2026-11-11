#!/usr/bin/env node
'use strict';
/**
 * Strict Production Bootstrap Engine — Virgin Initialization Mode
 *
 * Guarantees a clean, real-data-only first-time organization setup.
 * No seed/demo data is ever injected by this path.
 *
 * Modes:
 *   Interactive  : prompts on stdin (default)
 *   Non-interactive: supply OPSC_BOOTSTRAP_* environment variables
 *
 * PostgreSQL connection:
 *   OPSC_BOOTSTRAP_DATABASE_URL (separate one-time neondb_owner connection)
 *   Never use OPSC_DATABASE_URL here and never store this URL in Vercel runtime.
 *   After bootstrap, remove/rotate this credential.
 *
 * Required (interactive or env):
 *   OPSC_BOOTSTRAP_ORG_NAME
 *   OPSC_BOOTSTRAP_CEO_EMAIL
 *   OPSC_BOOTSTRAP_CEO_PASSWORD   (min 12 chars)
 *
 * Optional real structural data (JSON arrays as strings or interactive):
 *   OPSC_BOOTSTRAP_REGIONS   e.g. '[{"name":"Cairo Metro","countryCode":"EG","timezone":"Africa/Cairo"}]'
 *   OPSC_BOOTSTRAP_STRUCTURE e.g. '[{"title":"Field Operations","role":"manager"},{"title":"Dispatch","role":"manager"}]'
 *
 * Safety:
 *   - Refuses if database already contains users (ALREADY_BOOTSTRAPPED)
 *   - Refuses any demo/seed environment flags when NODE_ENV=production
 *   - Never calls seed-demo or writes fixture data
 */

const readline = require('node:readline');
const { openDatabase } = require('../src/db-open');
const { Store } = require('../src/store');
const config = require('../src/config');
const { resolveBootstrapConfig, assertBootstrapDatabaseRole } = require('../src/bootstrap-policy');

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || '').trim());
    });
  });
}

function parseJsonEnv(name) {
  const raw = process.env[name];
  if (!raw || !String(raw).trim()) return null;
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) throw new Error(`${name}_MUST_BE_JSON_ARRAY`);
    return value;
  } catch (e) {
    if (e.message && e.message.endsWith('_MUST_BE_JSON_ARRAY')) throw e;
    throw new Error(`${name}_INVALID_JSON`);
  }
}

function assertNoDemoContamination() {
  if (String(process.env.NODE_ENV || '').toLowerCase() !== 'production') return;
  const forbidden = [
    'OPSC_DEMO_PASSWORD_ADMIN',
    'OPSC_DEMO_PASSWORD_DISPATCHER',
    'OPSC_DEMO_PASSWORD_TECHNICIAN',
    'OPSC_DEMO_PASSWORD_VIEWER',
    'OPSC_DEMO_CLEANUP',
    'OPSC_SEED_DEMO'
  ];
  for (const key of forbidden) {
    if (process.env[key]) {
      throw new Error(`BOOTSTRAP_DEMO_FLAG_FORBIDDEN_IN_PRODUCTION:${key}`);
    }
  }
}

function normalizeRegions(raw) {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((r, i) => {
    const name = String(r?.name || r?.region || '').trim();
    if (name.length < 2) throw new Error(`OPERATING_REGION_INVALID_AT_INDEX_${i}`);
    const countryCode = String(r?.countryCode || r?.country || '').trim().toUpperCase() || null;
    const timezone = String(r?.timezone || '').trim() || null;
    return { name, countryCode, timezone };
  });
}

function normalizeStructure(raw) {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((s, i) => {
    const title = String(s?.title || s?.name || s?.department || '').trim();
    if (title.length < 2) throw new Error(`ORG_STRUCTURE_INVALID_AT_INDEX_${i}`);
    const role = String(s?.role || 'member').trim().toLowerCase();
    const allowed = new Set(['owner', 'admin', 'manager', 'member', 'viewer']);
    if (!allowed.has(role)) throw new Error(`ORG_STRUCTURE_ROLE_INVALID_AT_INDEX_${i}`);
    return { title, role };
  });
}

async function collectInteractive() {
  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  OpsCore — Virgin Initialization Mode (Strict Production)');
  console.log('  No demo / mock / seed data will be written.');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('');

  const orgName = await ask('Organization legal / trading name: ');
  const email = await ask('CEO / Owner email: ');
  const password = await ask('CEO / Owner password (min 12 characters): ');

  let regions = [];
  const regionsAnswer = await ask('Operating regions? (y/N): ');
  if (/^y(es)?$/i.test(regionsAnswer)) {
    console.log('  Enter regions one per line as: Name | CountryCode | Timezone');
    console.log('  Empty line finishes the list.');
    while (true) {
      const line = await ask('  Region: ');
      if (!line) break;
      const parts = line.split('|').map((x) => x.trim());
      regions.push({
        name: parts[0] || '',
        countryCode: parts[1] || '',
        timezone: parts[2] || ''
      });
    }
  }

  let structure = [];
  const structureAnswer = await ask('Initial organizational structure notes? (y/N): ');
  if (/^y(es)?$/i.test(structureAnswer)) {
    console.log('  Enter entries as: Title | Role (owner|admin|manager|member|viewer)');
    console.log('  Empty line finishes the list. These are structural notes only — no extra users are created.');
    while (true) {
      const line = await ask('  Structure entry: ');
      if (!line) break;
      const parts = line.split('|').map((x) => x.trim());
      structure.push({
        title: parts[0] || '',
        role: parts[1] || 'member'
      });
    }
  }

  return { orgName, email, password, regions, structure };
}

function collectFromEnv() {
  const orgName = process.env.OPSC_BOOTSTRAP_ORG_NAME;
  const email = process.env.OPSC_BOOTSTRAP_CEO_EMAIL;
  const password = process.env.OPSC_BOOTSTRAP_CEO_PASSWORD;
  if (!orgName || !email || !password) {
    throw new Error('BOOTSTRAP_ENV_INCOMPLETE: require OPSC_BOOTSTRAP_ORG_NAME, OPSC_BOOTSTRAP_CEO_EMAIL, OPSC_BOOTSTRAP_CEO_PASSWORD');
  }
  return {
    orgName,
    email,
    password,
    regions: parseJsonEnv('OPSC_BOOTSTRAP_REGIONS') || [],
    structure: parseJsonEnv('OPSC_BOOTSTRAP_STRUCTURE') || []
  };
}

async function main() {
  try {
    assertNoDemoContamination();

    const nonInteractive = Boolean(
      process.env.OPSC_BOOTSTRAP_ORG_NAME ||
      process.env.OPSC_BOOTSTRAP_CEO_EMAIL ||
      process.env.OPSC_BOOTSTRAP_CEO_PASSWORD
    );

    const input = nonInteractive ? collectFromEnv() : await collectInteractive();

    const regions = normalizeRegions(input.regions);
    const structure = normalizeStructure(input.structure);

    if (String(input.password || '').length < 12) {
      throw new Error('CEO_PASSWORD_TOO_SHORT');
    }

    const bootstrapConfig = resolveBootstrapConfig(config, process.env);
    const opened = openDatabase(bootstrapConfig);
    const db = opened.db;
    try {
      assertBootstrapDatabaseRole(db, opened.engine);
      const store = new Store(db, bootstrapConfig);
      store.pg = opened.engine === 'postgres' ? db : null;
      store.databaseEngineResolved = opened.engine;
      store.postgresRuntimeWired = opened.postgresRuntimeWired;
      const result = store.bootstrap({
        orgName: input.orgName,
        email: input.email,
        password: input.password,
        operatingRegions: regions,
        organizationalStructure: structure
      });

      console.log('');
      console.log('══════════════════════════════════════════════════════════════');
      console.log('  VIRGIN INITIALIZATION COMPLETE — REAL DATA ONLY');
      console.log('══════════════════════════════════════════════════════════════');
      console.log(JSON.stringify({
        schemaVersion: 'opscore.strict-bootstrap.v1',
        status: 'bootstrapped',
        organizationId: result.orgId,
        ownerUserId: result.userId,
        operatingRegionsCount: regions.length,
        organizationalStructureCount: structure.length,
        demoData: false,
        seedData: false,
        message: 'Database is clean and ready for real field operations. No mock or demo records were written.'
      }, null, 2));
      console.log('');
    } finally {
      db.close?.();
    }
  } catch (e) {
    console.error('');
    console.error('BOOTSTRAP_FAILED:', e.message || e);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { main, resolveBootstrapConfig, assertBootstrapDatabaseRole };
