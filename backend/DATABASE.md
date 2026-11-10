# Database boundary

## Local/development runtime

The default local runtime uses Node's built-in `node:sqlite`. It is a real local database, not a mock. SQLite is loaded only when the SQLite engine is selected.

## Vercel/PostgreSQL runtime

The Vercel entry point in `api/index.js` explicitly selects `DATABASE_ENGINE=postgres` and requires `DATABASE_URL` or `OPSC_DATABASE_URL`. `backend/src/db-open.js` selects the PostgreSQL adapter and opens the synchronous compatibility bridge. The bridge delegates PostgreSQL operations to the worker and root-pinned `pg@8.23.1`. The root `package.json` and `package-lock.json` are authoritative for this runtime dependency; Vercel installs the backend and root packages with `npm ci`.

The PostgreSQL adapter uses tenant/session settings consumed by the database RLS functions and clears request context when a connection is returned to the pool. CI has a live PostgreSQL HTTP acceptance suite and a tenant RLS matrix against a disposable acceptance database. Those results are scoped to their test database and do not certify the Vercel production deployment, its exact commit, or the actual role in its production `DATABASE_URL`.

## PostGIS and maps

PostGIS is available in the inspected Neon production catalog. Installing PostGIS does not supply a licensed map, geocoding, road-routing or traffic-ETA provider. Provider account, license, API key, attribution and live acceptance are buyer-owned.

## Attachment and object storage boundary

The source validates file content and stores integrity hashes. S3-compatible object storage, immutable/WORM storage, KMS/HSM and buyer cloud accounts are external service boundaries and require real provider credentials, licenses and acceptance.

## Notification and call-center boundary

In-app notifications are persisted. Email, SMS, WhatsApp, PSTN/SIP and external call-center/telephony providers require buyer-provisioned external accounts, credentials, licenses and live acceptance.

## Live PostgreSQL RLS gate

A dedicated integration harness exercises migration `031_digital_twin_chain_hardening.sql` and real `SELECT`/`INSERT`/`UPDATE`/`DELETE` tenant isolation under a temporary `NOLOGIN NOSUPERUSER NOBYPASSRLS` role. It uses a rollback-only transaction and creates a temporary schema/role, so it requires a dedicated disposable test database and a connection role permitted to create schema and role. It is not intended for a production database.

Install the repository-root and backend dependencies from their committed lockfiles:

```sh
npm ci --ignore-scripts
cd backend && npm ci --ignore-scripts --omit=peer
OPSC_PG_TEST_URL='postgres://test-admin:...@127.0.0.1:5432/opscore_test' npm run db:postgres-live-rls
```

For databases whose names are not marked `test`, `testing`, `ci`, `disposable`, or `scratch`, setting `OPSC_PG_TEST_ALLOW_NON_TEST_DATABASE=1` is required as an explicit safety acknowledgement. The harness returns `UNVERIFIED` when URL or driver is absent; it does not report missing infrastructure as a pass.

## Production certification boundary

Production certification remains `NOT_ESTABLISHED` until the exact deployed Git commit, least-privilege Vercel database role, live production session/tenant boundaries, recovery/restore behavior and required external-provider controls have current target-specific evidence.

## Controlled PostgreSQL migrations

The repository includes a fail-closed migration runner. It requires an explicit `OPSC_MIGRATION_DATABASE_URL`, a direct (non-`-pooler`) Neon URL, and the `neondb_owner` migration operator. It takes a PostgreSQL advisory lock, verifies the migration ledger and file checksums, and writes each ledger row in the same transaction as its SQL migration.

Default invocation is dry-run only:

```sh
OPSC_MIGRATION_DATABASE_URL='postgresql://…direct-host…/opscore_preview_virgin?sslmode=require' node scripts/apply-postgres-migrations.js
```

Apply requires `--apply` and exact database-name confirmation via `OPSC_MIGRATION_CONFIRM_DATABASE`. It refuses unknown ledger rows, mismatched checksums, pooled connections, and application roles. The 040-to-044 rename is recognized only when the file hashes match exactly. The 042 historical checksum discrepancy is accepted only after a live catalog-equivalence check; the original ledger value is preserved. Production requires a separate explicit opt-in, not configured in project CI.

Migration 046 enables and forces RLS on `schema_migrations`, creates an owner-only policy, and removes all table privileges from PUBLIC and `opscore_app`. The runtime role is not a migration operator.
