# Node/PostgreSQL Signed-Context Integration Plan

Date: 2026-11-14  
Status: **DESIGN / SOURCE-AUDIT COMPLETE FOR THE FIRST INTEGRATION CUT — NOT IMPLEMENTED**  
Main baseline: 4ef126ccd59f23cebeead30224d1bcf7199535ab  
Work branch: security/priority-production-hardening-20261114  
Related ADR: backend/docs/security/TENANT_CONTEXT_TRUST_BOUNDARY_REMEDIATION_ADR_2026-11-14.md  
Live evidence: backend/docs/verification/PRODUCTION_TENANT_CONTEXT_TRUST_BOUNDARY_AUDIT_2026-11-14.md

## 1. Why this document exists

The signed-context ADR proves a limited database-side mechanism on an isolated Neon branch. It does not show how the actual OpsCore Node process should create and bind that context without breaking existing request handling, transactions, authentication flows, or separate database pools.

This document records the source-specific integration constraints so the next implementation is a real end-to-end vertical slice, not an unused signer module or a cosmetic replacement of set_config.

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

## 5. First implementation slice — exact scope

The first code slice should be limited to an authenticated session-based READ route using the main synchronous bridge, not every auth flow at once:

1. Keep the current main behavior unchanged.
2. Add canonical payload construction and HMAC signing in the trusted Node worker path, with key material read only from a dedicated deployment secret.
3. Add a worker-level transaction-bound context binder that obtains backend PID/XID and binds transaction-local signed context to the same checked-out client.
4. Add a new explicit principal-binding API that requires sessionId, userId, and tenantId returned by the session resolver. Do not allow this API to sign a client-provided arbitrary tenant/user.
5. On a fresh isolated Neon branch, create a separate test-only RLS table using the already-reviewed security_proof.verified_bound_context() pattern, but replace the test session lookup with the actual production public.sessions, public.users, public.memberships, and organization-state checks. Do not alter production policies in this slice.
6. Exercise one real HTTP read route end-to-end against that isolated database and two valid, active, non-empty user sessions. Verify tenant A sees only A and tenant B sees only B.
7. Include raw SQL red-team tests using only the runtime DB credential: change raw GUCs, supply a mismatched tenant, replay on same backend/new transaction, replay on a different backend, and omit/break the signature.
8. Test normal autocommit, explicit READ WRITE transactions, explicit READ ONLY transactions, rollback, backend reconnect, query retry, and actual Neon pooling.
9. Only after this slice passes should the same protocol be extended to all CRUD operations and purpose-bound auth operations.

**No code in this PR currently implements steps 2–9.** The existing isolated ADR proof and this plan are evidence/design inputs, not completion of that slice.

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
