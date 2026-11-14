# Node/PostgreSQL Signed-Context Integration Plan

Date: 2026-11-14  
Status: **PARTIALLY IMPLEMENTED — 112/112 ISOLATED CI ASSERTIONS PASS; LIVE NEON HTTP / PRODUCTION TRUST-BOUNDARY CERTIFICATION NOT COMPLETE**  
Main baseline: 4ef126ccd59f23cebeead30224d1bcf7199535ab  
Work branch: security/priority-production-hardening-20261114  
Related ADR: backend/docs/security/TENANT_CONTEXT_TRUST_BOUNDARY_REMEDIATION_ADR_2026-11-14.md  
Live evidence: backend/docs/verification/PRODUCTION_TENANT_CONTEXT_TRUST_BOUNDARY_AUDIT_2026-11-14.md

## 1. Why this document exists

The first synchronous-bridge vertical slice now has application signer code, worker-side transaction binding, explicit Preview-gated work-order/evidence routes, and a real Node HTTP CI gate. The CI gate passed against a disposable PostgreSQL 18 service. That result is not a live Neon Preview HTTP test and does not certify the full identity plane or production tenant isolation.

This document separates the implemented slice and its evidence from the remaining work: legacy unsigned GUC compatibility, unmigrated routes and privileged auth operations, the independent asynchronous knowledge pool, and live Neon/Preview acceptance.

## 2. Actual source execution topology

### 2.1 Main synchronous PostgreSQL bridge

- backend/src/server.js wraps each HTTP request in runWithRequest(...) in the HTTP server callback near the bottom of the file.
- backend/src/pg-database-sync.js stores the request's requestId in AsyncLocalStorage.
- The bridge sends each synchronous operation to the child process in backend/src/pg-sync-worker.js, carrying the same requestId.
- pg-sync-worker.js holds one checked-out pg client per request ID in its sessions map.
- On endRequest, the worker rolls back if it believes a transaction remains open, then runs RESET ALL, then releases the client. Cleanup therefore currently prefers rollback over commit for any request left in an open transaction.
- The worker records only a boolean inTransaction. It does not implement a transaction-depth/savepoint stack.
- The current setSession handler writes three caller-supplied identity values into session-level GUCs with is_local=false: tenant ID, user ID, and access mode. It accepts field, auth, system, and backoffice.

### 2.2 Existing explicit Store transactions

A source scan of the current main version of backend/src/store.js found 31 source locations containing explicit transaction-start statements, together with corresponding commit/rollback paths. Examples include bootstrap, idempotent writes, reset-password, invitation acceptance, and many operational writes.

These are currently issued through db.exec('BEGIN...'), followed by one or more Store SQL statements and an explicit COMMIT or ROLLBACK. The worker pins the same request's client for this sequence.

**Constraint:** do not introduce a transaction around the entire HTTP request without first proving nested-transaction behavior. The current bridge does not have a savepoint-depth implementation. A blanket outer transaction could cause an existing COMMIT inside Store to end the transaction carrying the signed context earlier than intended.

### 2.3 Separate PostgreSQL runtime pool

The source has a second PostgreSQL access path:

- backend/src/postgres-runtime.js creates an independent asynchronous pg.Pool.
- Production backend/src/config.js sets databaseUrl from OPSC_DATABASE_URL; it does not use generic DATABASE_URL as a production fallback.
- backend/src/server.js has two current direct getPool(config) call sites for AI knowledge indexing and semantic search.
- backend/src/postgres-knowledge.js executes direct pool.query(...) calls. It receives organizationId as a bound query value but currently does not use the synchronous request worker's connection or request-local session.
- The async adapter's withTenantClient/GUC helper is a separate mechanism and currently binds an unsigned tenant setting on its own checked-out client.

**Constraint:** the worker alone cannot close the full trust boundary. The knowledge pool must either be moved onto the signed-context request protocol or receive its own transaction-bound signing/binding implementation on the exact async PoolClient used for the query. The organization SQL parameter is useful filtering, but it is not a replacement for the database's RLS trust boundary.

## 3. Recommended transaction protocol

Use the no-write, backend/transaction-bound verifier candidate recorded in ADR section 11. Do not use the temporary-table latch as a universal mechanism: ADR section 12 records that it fails closed in READ ONLY transactions.

### 3.1 Principal binding

The trusted application layer first resolves the principal using a narrow authentication operation:

- Session bearer/cookie: resolve token hash to an active, unrevoked session and its membership, then carry sessionId, userId, and organizationId from that database result.
- API key: use a separate SECURITY DEFINER API-key authentication operation that verifies the presented high-entropy key hash and returns only the authorized principal/scope. Do not rely on generic auth-mode table reads.
- Login, OIDC, invitation, reset, and bootstrap: use separate purpose-bound operations as described in the ADR. These are not ordinary field-request contexts.

Client-provided tenant headers/query/body values must never become the source of the signed tenant/user claims. They may only be checked for equality against the resolved principal.

### 3.2 One assertion per database transaction

For a normal authenticated tenant operation, the transaction adapter should:

1. Ensure a transaction is active on the exact checked-out PostgreSQL client.
2. Query pg_backend_pid() and pg_current_xact_id()::text on that same client and inside that same open transaction.
3. Construct a canonical, bounded assertion from already verified server-side identity data: issuer, audience, subject, tenant, session ID, purpose, issued/not-before/expiry times, JTI, key ID, backend PID, and transaction ID.
4. Sign the exact canonical payload in the trusted Node runtime using the deployment secret. Never expose the signing key through a SQL argument, database-visible GUC, query parameter, worker logs, IPC error text, or a table readable by opscore_runtime.
5. Bind only the payload, signature, and key ID using transaction-local settings (set_config(..., true)) on that same client.
6. Run the SQL operation only after binding succeeded. If signing, binding, verification, or transaction identity acquisition fails, abort the transaction and return a fail-closed error.
7. Commit/rollback using the existing transaction boundary. The GUC values disappear at transaction end.

The backend PID and transaction ID must be obtained and signed inside the transaction whose RLS policies will consume the assertion. A request retry, new transaction, new backend, rollback, or pooler re-acquisition must generate a new assertion.

### 3.3 Avoid a transaction around the whole HTTP request

Do not simply open one long transaction at runWithRequest start and keep it open until the HTTP response finishes. Some routes perform external/model/network work, streaming/export work, and multiple independent Store transactions. Keeping a transaction open across that work increases connection hold time, lock lifetime, rollback scope, and operational risk.

Instead, attach verified principal data to the request-scoped bridge, then bind a fresh assertion at each transaction boundary:
- explicit Store BEGIN: bind once immediately after BEGIN, before the first tenant query;
- autocommit single statement: execute the statement in a short transaction with one assertion;
- multi-statement batch: preserve explicit BEGIN/COMMIT semantics and bind immediately after the transaction begins;
- READ ONLY transaction: use the no-write verifier; do not require a temporary table or JTI insert during SELECT.

### 3.4 Do not mutate context in the middle of a transaction

A signed assertion is bound to a specific purpose, tenant, user, session, backend, and transaction. Changing a tenant/user/access mode midway through that same transaction must fail closed. A new purpose or identity requires a separate transaction and a separately authorized capability.

The worker's generic setSession({tenantId,userId,accessMode}) should ultimately be replaced by explicit methods with distinct contracts:
- bindVerifiedFieldSession(...)
- purpose-limited login/OIDC/reset/invitation/bootstrap operations (ideally no generic GUC context at all)
- no caller-selectable auth, system, or backoffice switch.

This replacement must be phased only after all existing call sites are migrated. Replacing it first would break login/bootstrap/reset/invitation flows.

## 4. Authentication-plane migration dependencies

The following operations need separate contracts and cannot be made safe by the field-context signer alone:

| Operation | Safe target |
|---|---|
| Resolve session token | Narrow SECURITY DEFINER function; checks token hash, expiry, revocation, active user, membership and organization state; returns minimal principal |
| Resolve password candidate | Narrow login function; normalized email only; returns password verifier material only to server memory |
| Verify password + list memberships | After password verification, a purpose-bound login capability for that exact user; no arbitrary user-ID membership enumeration |
| Issue session | Atomic helper consumes login/OIDC proof plus selected same-user membership, inserts the session and returns token metadata |
| API-key authentication | Narrow helper verifies key hash, active user/membership, expiry/revocation and scope; updates last-used/rate counters atomically |
| OIDC link/session | Purpose-bound proof from successfully verified issuer/audience/subject/nonce; narrow identity-link and session helpers |
| Password-reset creation/consumption | Helper-only path; one-time token lock/consume; update password and revoke sessions atomically; no compatibility fallback to raw identity DML in production |
| Invitation acceptance | One SECURITY DEFINER transaction: lock token, verify expiry, create/find user, attach membership to exactly the invitation tenant, consume token once |
| Bootstrap | Single-use bootstrap capability + database lock/singleton guard + atomic initial organization/user/membership write |
| Logout/revoke | Narrow exact-token-hash revocation; no generic auth-mode access |

## 5. Implemented first slice and exact proof boundary

### 5.1 Source implementation present on this branch

The following implementation is present in the current work branch:

1. `backend/src/signed-tenant-context.js` builds a bounded versioned HMAC-SHA256 assertion with issuer, audience, purpose, subject, tenant, session, issue/not-before/expiry times, JTI, key ID, backend PID, and transaction ID. The signer reads `OPSC_TENANT_CONTEXT_HMAC_KEY` and `OPSC_TENANT_CONTEXT_KEY_ID` from the trusted Node process.
2. `backend/src/pg-database-sync.js` stores a verified session principal in request-local state, obtains backend PID and transaction ID through the request's worker connection, signs the assertion, and sends only payload/signature to the worker.
3. `backend/src/pg-sync-worker.js` requires an active transaction and matching captured backend/transaction identity before binding payload/signature with transaction-local `set_config(..., true)`. The signing key is not passed to the worker.
4. `backend/src/server.js` has a Preview-only signed-context route allowlist. Read and write routes require explicit Preview feature flags and an authenticated session (API keys are excluded from this first slice). The signed write wrapper preserves the caller-owned transaction and rollback cleanup semantics.
5. `backend/scripts/signed-tenant-context-postgres-gate.js` runs the Node server against isolated PostgreSQL, seeds synthetic Tenant A/B identities and sessions, creates a temporary HMAC key, and tests the HTTP routes and RLS behavior.

### 5.2 CI evidence — passed, but disposable PostgreSQL only

For code commit `21dd4a3779508ffd5a0ab0b69f6af6697f0234d4`, GitHub Actions run `43622890070` completed successfully. The job was `isolated-postgres-rls-and-http-acceptance`, and the signed-context gate emitted:

- `status: PASS`, with **112/112 assertions PASS**.
- 48 signed subresource-read assertions (Tenant A, Tenant B, and foreign-tenant denial).
- 31 work-order write assertions (create, patch/idempotency, comments, bulk, transition, delete, and restore).
- 20 evidence-write assertions (upload initiation, chunks, completion, idempotency, integrity failure, direct attachments, rollback cleanup, and tenant isolation).
- The remaining assertions covered session binding, raw-GUC tampering, read-only transaction binding, unsigned/invalid assertion rejection, and replay rejection on both same-backend/new-transaction and different-backend cases.

The proof environment was the disposable local PostgreSQL 18 database `opscore_http_acceptance`, with owner `neondb_owner` and runtime role `opscore_runtime`; the runtime role had `BYPASSRLS=false`. This is real Node HTTP/worker/PostgreSQL integration evidence, but it is **not** evidence from a Neon-hosted database or a deployed Vercel Preview.

A GitHub compare from the tested code head to the branch state at this documentation update found three commits, with changes limited to `backend/docs/security/TENANT_CONTEXT_NODE_WORKER_INTEGRATION_PLAN_2026-11-14.md` and `backend/docs/verification/SIGNED_TENANT_CONTEXT_WORK_ORDERS_CI_VERIFICATION_2026-11-14.md`; no code-file differences exist after the tested source checkpoint.

### 5.3 Neon isolated branch status — schema applied, signed proof not run

The following migrations were applied and hash-verified on Neon child branch `br-fragrant-king-bcr9928f` (`opscore-signed-context-063-065-20261114`), cloned from Preview branch `br-wispy-credit-bckacgvt`:

- `063_signed_tenant_context_verifier.sql`
- `064_signed_tenant_context_work_orders_routing.sql`
- `065_signed_tenant_context_evidence_upload_chunks.sql`

The branch catalog checks confirmed the dedicated `opscore_auth_definer` ownership/role contract, runtime non-access to the HMAC key table, runtime EXECUTE on the verifier, and signed-aware work-order/evidence-chunk RLS policies. The test database currently has no seeded organizations, users, memberships, or unexpired sessions, and the HMAC key table has zero rows. No valid HMAC assertion or real Node HTTP request has been executed against this Neon branch. No signing secret or feature flags were added to Vercel Preview.

### 5.4 Remaining implementation and acceptance work

The first slice is not the full identity-plane migration. The following remain outside its verified route boundary:

- The generic worker `setSession` operation still accepts caller-supplied `field`, `auth`, `system`, and `backoffice` modes and writes unsigned session-level GUCs. The code must not remove it until every legitimate caller has moved to purpose-specific operations.
- `backend/src/server.js` still binds legacy GUC context for non-allowlisted request paths, login/OIDC/bootstrap flows, and other existing operations.
- Password reset, invitation, bootstrap, API-key, OIDC, logout, and other identity-plane operations require narrow purpose-bound database contracts; the field assertion is not a replacement for those contracts.
- The independent asynchronous `postgres-runtime` pool and AI knowledge index/search path do not yet bind the signed assertion on the exact checked-out `PoolClient`; their organization filters are not a substitute for RLS trust.
- Migration 064 deliberately preserves the raw-GUC compatibility fallback when no signed payload is present. Invalid signed payloads fail closed, but absence of a signed payload still reaches legacy context. Therefore the database-wide direct-runtime-credential trust boundary is not certified.
- Live Neon proof remains outstanding: a valid HMAC assertion, negative/tamper/replay tests, real Node HTTP acceptance against the isolated Neon branch, Neon pooling/transaction lifecycle, and cleanup verification.

Do not remove legacy context, migrate broad production RLS policy sets, revoke identity-table grants, provision a production signing key, merge to main, or deploy Production until the remaining flows have migrated and the full isolated acceptance matrix passes.

## 6. Mandatory regression tests before broader rollout

- The worker must prove the signed payload was bound to the exact backend and transaction performing the query.
- A signed assertion from a prior transaction on the same backend is rejected in a new transaction.
- A signed assertion on another backend is rejected.
- Tampering with raw app.tenant_id, app.user_id, or app.access_mode does not change the verified principal.
- A malformed, wrong-key, expired, future-dated, wrong-audience, wrong-issuer, wrong-purpose, revoked-session, expired-session, wrong-subject, or wrong-tenant assertion yields no context.
- A failed binder causes the SQL operation to be skipped, not retried without a context.
- A connection destroyed/replaced by the pool cannot reuse a previous transaction's assertion.
- READ ONLY transactions work without write-on-read state.
- Request cleanup, rollback, and pool return leave no trusted context available to the next request.
- API-key, OIDC, login, reset, invitation, and bootstrap tests stay green when generic privileged access modes are removed in later phases.
- The separate async knowledge pool either participates in the same contract or is disabled/isolated until migrated; it must not remain an unreviewed side path.

## 7. Release gates

- No production database role/grant/RLS changes before the authenticated HTTP vertical slice and raw-credential red-team tests pass on an isolated branch.
- No key provisioning/rotation in production before the secret management, rollback, and old/new key overlap are tested.
- No main merge, production deployment, or production certification is implied by a passing unit/CI job.
- The current production tenant-isolation gate remains **NOT CERTIFIED**.


## 8. Current environment prerequisites — rechecked 2026-11-14

Vercel project environment metadata was read with decryption disabled. The production and preview targets list the database URL variables, but neither target currently lists `OPSC_TENANT_CONTEXT_HMAC_KEY` or an equivalent dedicated context-signing key.

Therefore:

- The signer code must not silently run with a missing key or fall back to an unsigned GUC.
- Do not add a key to the production target in this phase.
- When the Node slice is ready, generate one high-entropy key for the isolated Preview branch only, create the matching verifier-key record in the isolated Neon lab schema under `opscore_auth_definer`, and bind the Preview environment variable specifically to the security branch.
- Verify that no other Preview or Production deployment can read that variable. Do not expose the value in logs, PR text, tool output, or application responses.
- Keep the production signer key absent until real Preview HTTP acceptance, Neon pooler/backend binding, rollback/retry, and raw-database-credential red-team tests pass.
- Key rotation must have key IDs, bounded old/new overlap, and a tested rollback. Never overwrite a shared key before both verifier and signer are ready.

Additional operational gates rechecked at the same time:

- Vercel Firewall is enabled, but active CRS protections (Generic, RCE, SQLi, XSS) and Bot Protection are currently configured as `log`, not `deny`/challenge. The auth endpoint rate-limit rule (60 requests per 60 seconds per IP) also logs rather than blocks.
- The production Neon branch has no automatic snapshot schedule. The project snapshot listing currently returns one manual snapshot expiring 2026-12-11; this does not certify native PITR or a restore drill.
- No WAF, Neon backup, environment, key, production schema, role, grant, or production data setting was changed during this recheck.


## 9. Source-level trust-boundary audit — 2026-11-14 (branch head 652cebd585ecc3bccb63e0050a2ab58a73552a88)

Scope: direct source inspection of the request bridge, worker, PostgreSQL adapters, runtime pool, knowledge query module, server call sites, and Store transaction/context call sites. This is a source audit, not a proof that every runtime call path has been exercised.

### 9.1 Confirmed paths and findings

| Path | Observed source behavior | Classification | Required disposition |
|---|---|---|---|
| Main synchronous request bridge | `pg-database-sync.js` uses request-local AsyncLocalStorage and passes a request ID to the worker; `pg-sync-worker.js` holds one PoolClient per request ID | Partially migrated | Preserve the existing transaction boundaries; bind a fresh signed assertion at each tenant transaction boundary |
| Signed work-order/evidence wrappers | `server.js` calls `setVerifiedPrincipal` and `activateVerifiedTenantContext` for the explicit signed allowlist | Signed first slice | Expand only after route-by-route tests and transaction-boundary review |
| Generic worker `setSession` | `pg-sync-worker.js` accepts `field`, `system`, `auth`, and `backoffice`, then writes caller-supplied tenant/user/access-mode into session-level GUCs with `set_config(..., false)` | Legacy unsigned trust path | Replace only after all legitimate auth/system/field callers have purpose-specific contracts |
| Public sync adapter methods | `pg-database-sync.js` exposes `setTenant`, `setAccessMode`, and `setSession` and forwards caller-provided values to the generic worker handler | Legacy unsigned API surface | Remove or restrict after call-site migration; do not leave a generic access-mode selector |
| Session/auth resolution | `server.js` binds `auth` mode before identity/session lookup and later binds `field` mode from returned organization/user data | Purpose-specific migration required | Replace with narrow database authentication/session functions; never treat raw auth GUCs as trusted identity |
| Bootstrap and login/OIDC | `server.js` and `store.js` contain additional `setSession` use in bootstrap, login, OIDC and related identity flows | Purpose-specific migration required | Separate one-time bootstrap, password login, OIDC, and session issuance contracts |
| Password-reset and other Store identity operations | Store has additional temporary access-mode changes around identity-table operations | Purpose-specific migration required | Move to narrowly scoped functions and test atomicity, one-time use, and revocation |
| Separate AI knowledge pool | `postgres-runtime.js` creates a second asynchronous Pool from `config.databaseUrl`; `server.js` calls it directly for knowledge index/search; `postgres-knowledge.js` uses `pool.query` directly | Unbound side path | Bind signed context on the exact checked-out PoolClient inside each transaction, or disable this path until migrated |
| Generic async adapter | `adapters/postgres.js` exposes `acquireTenantClient` / `withTenantClient`, which set unsigned session-level tenant GUCs; `pg-database.js` uses this adapter for its own tenant-client flow | Legacy unsigned alternate adapter | Prove whether it is reachable in deployed configuration; migrate or remove, do not assume the main sync bridge covers it |
| Raw pool operations | `pg-database.js` falls back to `pool.query` when no AsyncLocalStorage client exists; runtime health/ping also uses direct pool queries | Non-tenant/system operation or unbound query, depending on caller | Explicitly classify every caller; tenant-table queries must not execute through an unbound fallback |
| Worker transaction state | Worker tracks a boolean `inTransaction`, not transaction/savepoint depth; `batch` and direct SQL both update that boolean | Transaction-lifecycle risk | Add state-machine tests for nested/savepoint/rollback-to/failed-commit behavior before broadening signed binding |
| Worker cleanup | `endRequest` rolls back if worker believes a transaction is open, then `RESET ALL`, destroying the client if cleanup cannot be confirmed | Cleanup behavior present, but state tracking is boolean | Verify cleanup after every error/commit ambiguity and ensure transaction state cannot become desynchronized |

### 9.2 Specific code-level observations

1. The worker's generic `setSession` branch does not require a verified principal and does not require a signed assertion. It accepts any caller-supplied tenant/user IDs and any of four access modes, then persists those values at session scope (`is_local=false`). This is a concrete remaining unsigned-context mechanism.
2. The signed worker binder is stronger: it requires an active transaction, a previously captured backend PID/transaction ID, and a payload whose claims match that identity; it binds payload/signature transaction-locally. However, the generic unsigned branch remains independently callable.
3. `pg-database-sync.js` exposes both signed-principal methods and legacy setters on the same database object. The signed methods do not make other methods signed automatically.
4. The AI knowledge endpoint reads tenant-scoped source rows through the primary Store, then writes/searches vectors through a separate pool. Passing `organizationId` as a SQL parameter is a query filter, not proof of tenant identity to RLS. The async pool must use its own signed transaction context.
5. The alternate `pg-database.js` adapter has a separate unsigned tenant-GUC helper and an unbound `pool.query` fallback. Its production reachability must be resolved from `openDatabase` and deployment configuration before it is either classified as dead code or treated as a live attack surface.
6. The main synchronous worker receives a database connection string through its parent transport. The worker itself expects `DATABASE_URL`; this is not by itself proof of a generic environment fallback because the parent passes the configured connection string to the child. Nevertheless, startup must continue to enforce the production-only `OPSC_DATABASE_URL` gate in `db-open.js`.
7. The worker's boolean transaction tracker cannot safely represent all PostgreSQL transaction states (including savepoint rollback and transaction-aborted state) by inspection alone. Do not add a blanket outer request transaction or rely on the boolean as proof of exact transaction lifecycle.

### 9.3 Audit disposition

- **Confirmed signed:** explicit Preview-gated work-order/evidence route slice and the worker's transaction-bound assertion binder.
- **Partially migrated:** main request bridge, because signed and unsigned context APIs coexist.
- **Confirmed legacy unsigned:** generic worker `setSession`, sync adapter `setTenant` / `setAccessMode` / `setSession`, async adapter tenant GUC helper.
- **Unbound side path:** AI knowledge index/search pool until it binds the same trust contract on its own checked-out client.
- **Requires reachability proof:** alternate `pg-database.js` adapter and all direct pool-query fallback callers.
- **Requires purpose-specific contracts:** auth/session resolution, login, OIDC, bootstrap, password reset, invitations, API keys, logout/revocation, and system/backoffice operations.
- **Not certified:** database-wide tenant isolation against compromise of the runtime credential; all 276 production policies / 134 tables; all production route/worker paths; live Neon HTTP proof for this signed Node slice.

### 9.4 Safe next implementation sequence

1. Build a complete call-site inventory for every `setTenant`, `setAccessMode`, `setSession`, `withTenantClient`, direct `pool.query`, and transaction start/commit/rollback. Record file, function, route/job, identity source, tables touched, and required purpose.
2. Resolve reachability of `pg-database.js` and the async knowledge pool in the actual production startup graph. No path may be dismissed as dead based only on naming.
3. Design and test the transaction state machine for explicit transactions, nested calls, savepoints, rollback-to, aborted transactions, commit failure, client replacement, and endRequest cleanup.
4. Migrate the independent knowledge pool to a signed transaction-bound client contract, or disable its production route until that contract is implemented and accepted.
5. Implement narrow purpose-bound auth-plane functions and migrate callers one family at a time. Keep field tenant assertions separate from login/bootstrap/reset/invitation capabilities.
6. Only after every call site is migrated and the full negative/positive acceptance matrix passes on an isolated Neon branch may the generic unsigned GUC setter and database fallback be removed.
7. Run the full source/CI/isolated Neon HTTP acceptance matrix; do not merge, deploy, or certify Production as part of this audit.

No application code, migration, Neon branch, Vercel environment, secret, deployment, or main-branch ref was changed by this source audit. This section records confirmed source findings and does not claim that the full call-site inventory or live Neon proof is complete.
