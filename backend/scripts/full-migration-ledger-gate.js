#!/usr/bin/env node
'use strict';

/**
 * Owner/diagnostic gate: reconcile every source migration file under
 * backend/sql/postgres against public.schema_migrations (filename + sha256).
 *
 * This is intentionally separate from production-database-identity-preflight.js,
 * which must remain safe for the non-owner runtime role and therefore uses only
 * the SECURITY DEFINER migration 056 attestation helper.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');
const {
  buildMigrationPlan,
  parseMigrationFilename,
  compareMigrationFilenames
} = require('../src/postgres-migration-plan');

const DIR = path.resolve(__dirname, '..', 'sql', 'postgres');

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function readSourceMigrations() {
  return fs
    .readdirSync(DIR)
    .filter((name) => parseMigrationFilename(name))
    .sort(compareMigrationFilenames)
    .map((filename) => {
      const content = fs.readFileSync(path.join(DIR, filename), 'utf8');
      return { filename, sha256: sha256(content) };
    });
}

function selectConnectionString(env = process.env) {
  return (
    String(env.OPSC_DATABASE_URL || '').trim() ||
    String(env.DATABASE_URL_UNPOOLED || '').trim() ||
    String(env.DATABASE_URL || '').trim() ||
    ''
  );
}

async function main() {
  const connectionString = selectConnectionString();
  const report = {
    schemaVersion: 'opscore.full-migration-ledger-gate.v1',
    generatedAt: new Date().toISOString(),
    status: 'UNVERIFIED',
    sourceMigrationCount: 0,
    ledgerRowCount: 0,
    matchedCount: 0,
    pendingCount: 0,
    blockerCount: 0,
    pendingFilenames: [],
    blockers: []
  };

  if (!connectionString) {
    report.reasonCode = 'DATABASE_URL_REQUIRED';
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    process.exitCode = 2;
    return;
  }

  const sourceMigrations = readSourceMigrations();
  report.sourceMigrationCount = sourceMigrations.length;

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 20000
  });

  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const ledger = await client.query('SELECT filename, sha256 FROM public.schema_migrations');
    report.ledgerRowCount = ledger.rowCount;
    const plan = buildMigrationPlan(sourceMigrations, ledger.rows);
    report.matchedCount = plan.skipped.length;
    report.pendingCount = plan.pending.length;
    report.blockerCount = plan.blockers.length;
    report.pendingFilenames = plan.pending.map((item) => item.filename).slice(0, 50);
    report.blockers = plan.blockers.slice(0, 50);
    if (plan.blockers.length) {
      report.status = 'LEDGER_BLOCKED';
      process.exitCode = 1;
    } else if (plan.pending.length) {
      report.status = 'LEDGER_PENDING';
      process.exitCode = 1;
    } else {
      report.status = 'LEDGER_COMPLETE';
      process.exitCode = 0;
    }
    await client.query('ROLLBACK');
  } catch (error) {
    report.status = 'UNVERIFIED';
    report.reasonCode = String(error && error.code || 'FULL_LEDGER_GATE_FAILED');
    report.errorMessage = String(error && error.message || error).slice(0, 240);
    process.exitCode = 1;
  } finally {
    try {
      await client.end();
    } catch {
      // ignore close errors
    }
  }

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

main();
