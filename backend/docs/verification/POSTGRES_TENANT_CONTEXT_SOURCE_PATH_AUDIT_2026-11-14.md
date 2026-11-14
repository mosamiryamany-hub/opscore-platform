# PostgreSQL Tenant-Context Source-Path Audit — 2026-11-14

**Audit checkpoint:** branch `security/priority-production-hardening-20261114`  
**Audited source head:** `652cebd585ecc3bccb63e0050a2ab58a73552a88`  
**Base/main:** `4ef126ccd59f23cebeead30224d1bcf7199535ab`  
**Purpose:** enumerate database access paths and classify where a trusted tenant assertion is actually bound, where unsigned context remains, and which tools are outside the production request path.

## Executive result

The signed tenant-context implementation is a real, tested first slice, but it is not a database-wide runtime trust boundary. Three materially different PostgreSQL paths exist in source, and only the allowlisted synchronous HTTP path currently binds the signed assertion. The independent knowledge pool and optional asynchronous adapter do not. The generic sync-worker `setSession` operation still sets unsigned session-level GUCs. The operational worker script is SQLite-only and is not connected to the PostgreSQL runtime.

The repository's existing signed-context gate reports **112/112 assertions passing** against disposable PostgreSQL 18. This is valid Node/worker/PostgreSQL integration evidence for the allowlisted route slice. It is not Neon-hosted execution evidence, Vercel Preview proof, nor proof for every API route, identity operation, worker, or direct runtime DB credential.

## Findings and classifications

### F-01 — Synchronous HTTP PostgreSQL bridge: partially signed; legacy access remains

**Source path**
- `backend/src/db-open.js`: selects `openPgDatabaseSync()` when `DATABASE_ENGINE=postgres`.
- `backend/src/pg-database-sync.js`: request-local `AsyncLocalStorage`, verified-principal storage, transaction identity capture, Node-side HMAC signing, IPC binding.
- `backend/src/pg-sync-worker.js`: one checked-out `pg` client per request ID; signed payload binding is checked against the active backend PID and transaction ID.
- `backend/src/server.js`: signed work-order/evidence handlers and feature-flagged Preview allowlist.

**Verified positive property:** the signed binder requires an active transaction and the backend/transaction identity captured on that same worker client. The signing key stays in the parent Node process; the child receives the payload and signature, not the HMAC key. The CI test matrix exercises tenant A/B, tampering, invalid assertion, replay, read-only and write flows.

**Unresolved boundary:** the worker's generic `setSession` handler still accepts caller-provided tenant/user IDs and `field`, `auth`, `system`, or `backoffice` modes, then persists `app.tenant_id`, `app.user_id`, and `app.access_mode` with session-level `set_config(..., false)`. `server.js` still uses this interface for non-allowlisted request handling and authentication/bootstrap flows. Migration 064 intentionally retains the raw-GUC fallback when there is no signed payload. Therefore a direct holder of the runtime DB credential can still use the legacy context contract where a policy/accessor permits it.

**Classification:** signed for the explicit first-slice route allowlist; legacy/unsigned for remaining request and auth call sites; database-wide credential-compromise boundary **NOT CERTIFIED**.

### F-02 — AI knowledge pool: separate unsigned PostgreSQL access path

**Source path**
- `backend/src/postgres-runtime.js`: creates a module-level independent `pg.Pool` from `config.databaseUrl`.
- `backend/src/server.js`: invokes `getPool(config)` directly in the knowledge-index and knowledge-search routes.
- `backend/src/postgres-knowledge.js`: performs direct `pool.query(...)` for schema checks, upserts, and searches.

The organization ID is passed as a SQL parameter and used in the query predicate. That is useful application-level filtering, but the code does not bind the signed tenant assertion on the exact PostgreSQL connection executing the query. `withTenantQuery()` only acquires a process-local query-budget slot and passes the pool to its callback; it does not establish a transaction or tenant RLS context. The current two server call sites bypass even that wrapper.

**Classification:** independent pool; signed tenant context **NOT IMPLEMENTED**. Treat this as an uncovered RLS access path, not as covered by the 112/112 synchronous-worker assertions.

**Required design:** perform embedding/network work before checking out the DB client; then acquire one `PoolClient`, begin a short transaction, obtain backend PID and transaction ID on that client, sign the verified request principal in the trusted Node process, bind transaction-local assertion settings on that same client, and execute the tenant query before commit/rollback. Do not hold a DB transaction open while calling the embedding provider. Search and upsert must both use the same binder. Until then, disable this path in PostgreSQL deployments or keep it explicitly outside any tenant-isolation claim.

### F-03 — Optional asynchronous PostgreSQL adapter: raw-GUC helper; not selected by the main server opener

**Source path**
- `backend/src/pg-database.js`: exposes an asynchronous `PgDatabase` and its own `AsyncLocalStorage`.
- `backend/src/adapters/postgres.js`: `acquireTenantClient()` binds `app.tenant_id`, `app.current_tenant_id`, `app.organization_id`, and `app.access_mode='field'` as session-level GUCs; `releaseTenantClient()` resets session state and destroys the client if cleanup cannot be established.
- `backend/src/db-open.js`: the production server opener selects `openPgDatabaseSync()`, not `openPgDatabase()`.

The helper is a separate raw-GUC compatibility mechanism. Its cleanup behavior is useful defense against pooled session leakage, but session reset is not proof that the tenant identity itself was authenticated by the database. The main server's `db-open` path does not route through this optional adapter.

**Classification:** legacy/unsigned helper; not the selected main HTTP PostgreSQL runtime path. Keep it out of the signed-context coverage count and either migrate it to a shared transaction binder or formally retire it after confirming all consumers.

### F-04 — Operational worker: SQLite-only; no PostgreSQL worker integration

**Source path**
- `backend/package.json`: `worker` runs `scripts/operational-worker.js`.
- `backend/scripts/operational-worker.js`: imports `openDb()` from `src/db.js` and creates `new Store(db, config)`.
- `backend/src/db.js`: `openDb()` instantiates `node:sqlite` `DatabaseSync`; it does not select the PostgreSQL bridge.
- `backend/src/operational-enhancements.js`: defines queue claim/complete/fail methods used by that worker.

The worker constructs an elevated synthetic system context from the claimed job's organization and creator. It currently operates through SQLite, not the production PostgreSQL RLS connection. Consequently the signed PostgreSQL HTTP slice does not cover this worker. Starting `npm run worker` alongside a PostgreSQL-backed server does not make this worker a PostgreSQL worker; absent an explicit database-mode guard, it may operate on the configured local SQLite file instead.

**Source correction applied in this audit branch:** `operational-worker.js` now exits with `OPSC_POSTGRES_WORKER_NOT_IMPLEMENTED` before opening SQLite whenever `DATABASE_ENGINE=postgres`. This prevents a PostgreSQL deployment from silently running a second, unrelated SQLite database through the worker command.

**Classification:** SQLite-only worker; PostgreSQL integration **NOT IMPLEMENTED**; fail-closed startup guard now applied. Do not describe it as a Neon-backed or signed-context worker. A real PostgreSQL worker adapter and purpose-bound per-job authorization contract are still required. Do not solve this by granting a generic `system` GUC mode.

`backend/scripts/resilience-worker.js` is likewise a CLI helper using an explicit SQLite database path; classify it separately as a local resilience/test utility, not a PostgreSQL runtime worker.

### F-05 — Production TLS default mismatch in the sync-worker bootstrap (fixed in this audit)

Before this audit change, `pg-database-sync.js` unconditionally supplied `OPSC_PG_SSL_MODE='require'` to its child worker when the environment variable was absent. The child inherits `NODE_ENV`; `adapters/postgres.js` treats `NODE_ENV=production` as requiring `verify-full` and throws `POSTGRES_TLS_VERIFICATION_REQUIRED` for the inherited `require` default.

This was a deterministic source-level default mismatch for production environments where `OPSC_PG_SSL_MODE` was not explicitly set. The parent now resolves the child default to `verify-full` in production and `require` otherwise. An explicit operator value is preserved, so an explicitly weakened production setting still fails closed in the adapter.

A pure unit test covers production, test/development, blank values, explicit `verify-full`, and explicit `require`. This code change does not inspect or alter any deployed environment variable.

**Classification:** source fix applied on this branch; CI verification pending for the new head.

### F-06 — Authentication, bootstrap, migration, and diagnostic paths are purpose-specific, not ordinary field requests

- `server.js` login/OIDC/bootstrap routes still use the generic legacy `setSession` auth/field interface. They need narrow purpose-bound DB capabilities; they must not be blindly wrapped in a field-session assertion.
- `backend/scripts/bootstrap.js` uses `OPSC_BOOTSTRAP_DATABASE_URL` through the bootstrap DB opener and policy. This is a separate one-time bootstrap capability, not a tenant HTTP session.
- `backend/scripts/apply-postgres-migrations.js` uses the separately scoped `OPSC_MIGRATION_DATABASE_URL` for schema administration.
- `backend/scripts/production-database-identity-preflight.js` uses a dedicated read-only diagnostic connection/transaction for identity and privilege inspection.
- These privileged paths need their own reviewed scope and credentials; they must not be counted as signed field-context consumers.

## Route and component coverage boundary

| Surface | Current binding | Audit status |
|---|---|---|
| Explicit signed work-order/evidence route allowlist | Signed principal + backend/transaction-bound assertion | Implemented first slice; disposable PG CI pass |
| Other authenticated API routes | Generic session GUC `setSession` path | Legacy; not migrated |
| Login/OIDC/bootstrap/reset/invitation/API-key/logout | Legacy auth/session operations or separate bootstrap tooling | Purpose-specific migration required |
| AI knowledge index/search | Independent pool, SQL tenant predicate only | No signed DB context |
| Optional `PgDatabase.withTenant()` | Session-level raw tenant GUC + reset | Legacy helper |
| Operational worker | SQLite `openDb()` | No PostgreSQL runtime integration |
| Migration and identity preflight tools | Separate migration/read-only diagnostic connections | Administrative tooling; not field request path |

## Remediation order

1. **Completed in this audit branch:** correct production sync-worker TLS default and add a unit test for the default/override contract.
2. **Next P0:** implement a shared transaction-bound signer/binder for the asynchronous knowledge pool, with real PostgreSQL acceptance proving the same PoolClient handles identity capture, binding, and tenant query. Avoid holding the transaction during embedding-provider network calls.
3. **P0/P1:** define and implement purpose-bound database functions for session resolution, login/OIDC, API-key authentication, logout/revocation, password reset, invitation, and bootstrap. Avoid generic caller-selectable `auth/system/backoffice` context.
4. **P1:** implement a PostgreSQL-native operational worker with job-scoped verified/system authorization and per-transaction context. Until then, the new startup guard refuses PostgreSQL mode. Never silently fall back to SQLite when the API runtime is PostgreSQL.
5. **P1:** retire or migrate the optional asynchronous `PgDatabase`/raw-GUC helper after verifying actual consumer reachability.
6. **Only after all callers are migrated:** remove unsigned `setSession`, raw-GUC compatibility fallbacks, and broad runtime identity-table grants; then run exhaustive route/worker acceptance, Neon-hosted HTTP tests, and direct-runtime-credential red-team probes.

## Evidence limits and change control

- The 112/112 signed-context assertions are from a disposable PostgreSQL 18 CI service. They do not establish live Neon or Vercel Preview acceptance.
- Neon child branch `br-fragrant-king-bcr9928f` has migrations 063–065 applied and hash-reconciled, but no valid HMAC assertion/Node HTTP test was run against that branch, no HMAC key row is provisioned, and no Preview signing secret/feature flag was added.
- The live production tenant trust boundary remains **NOT CERTIFIED**.
- This audit changed only source code, a unit test, and this documentation on `security/priority-production-hardening-20261114`. No main merge, production DB write, Neon DDL, Vercel setting, secret, deployment, or alias change is part of this commit.

## Exact files changed

- `backend/src/pg-database-sync.js`
- `backend/test/pg-database-sync.test.js`
- `backend/scripts/operational-worker.js`
- `backend/test/operational-worker-runtime-guard.test.js`
- `backend/docs/verification/POSTGRES_TENANT_CONTEXT_SOURCE_PATH_AUDIT_2026-11-14.md`
