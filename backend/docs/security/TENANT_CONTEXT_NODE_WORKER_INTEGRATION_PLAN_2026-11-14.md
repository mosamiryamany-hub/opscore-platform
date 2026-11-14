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

The current branch head `c3bde9d0c5b19eb5a689c1f1f8c324a03191a239` is two documentation-only commits ahead of the tested code head and has no code-file differences from that tested checkpoint.

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
