# PostgreSQL parity release note

The canonical PostgreSQL schema is now generated from the same table definitions used by the runtime SQLite schema.

- Canonical schema: `backend/db/postgresql_schema.sql`
- RLS hardening reference: `backend/db/postgresql_hierarchy_rls.sql`
- Automated table parity check: `npm run db:postgres-parity`

The parity check compares table names only. It does not certify runtime behavior, query compatibility, migrations, indexes, RLS behavior, backups, failover, or production performance. A buyer must run the database adapter against a real PostgreSQL instance and execute the application integration suite before making a production claim.

The canonical PostgreSQL schema includes `idempotency_records` for the same critical-write replay contract used by the SQLite runtime.
