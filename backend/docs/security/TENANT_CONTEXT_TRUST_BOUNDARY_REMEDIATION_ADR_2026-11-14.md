# Tenant Context Trust-Boundary — Remediation ADR and Route Inventory

Date: 2026-11-14  
Status: **PROPOSED FOR ISOLATED VALIDATION — NOT IMPLEMENTED**  
Repository baseline: `main` = `4ef126ccd59f23cebeead30224d1bcf7199535ab`  
Work branch: `security/priority-production-hardening-20261114`  
Related evidence: `PRODUCTION_TENANT_CONTEXT_TRUST_BOUNDARY_AUDIT_2026-11-14.md`

## 1. Decision to be made

The current production boundary accepts tenant, user, and access-mode values from caller-settable PostgreSQL GUCs. Production read-only tests proved that `opscore_runtime` can switch those values and read each corresponding test tenant through RLS.

The required boundary is:

> RLS may use a tenant/user context only after the database verifies an assertion that a holder of the runtime database credential cannot mint or alter.

The assertion must bind at least:

- `iss`: the expected service issuer
- `aud`: this database/application audience
- `sub`: authenticated user ID
- `tenant_id`: selected organization ID
- `session_id`: the database session record
- `purpose`: a narrowly scoped purpose such as `field_request`, `login_verified`, `oidc_verified`, `password_reset`, `invitation_accept`, or `bootstrap_once`
- `iat`, `nbf`, and `exp`: bounded validity
- `jti`: a unique request/assertion identifier
- `key_id`: key version for rotation

A request may not elevate itself by setting `access_mode=auth/system/backoffice`. Privileged operations must have separate purpose-scoped capabilities.

## 2. Live environment evidence

Read-only catalog inspection of the production branch reported:

| Check | Observed result |
|---|---|
| PostgreSQL | 18 |
| `pgcrypto` | Installed, version 1.4 |
| `hmac(bytea,bytea,text)` | Exists; EXECUTE granted to `opscore_runtime` |
| `pg_session_jwt` | Available version 0.5.0; not installed |
| `pgjwt` | Available version 0.2.0; not installed |
| `opscore_auth_definer` | NOLOGIN, NOSUPERUSER, BYPASSRLS=true |
| `opscore_runtime` | LOGIN, NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE, NOCREATEDB |
| Runtime CREATE on public schema | false |
| Runtime CREATE on database | false |
| Runtime TEMP on database | true |
| RLS policies in public | 276 across 134 tables |
| Policies directly referencing `current_setting(...)` | 21 across 11 tables |
| Policies using the current tenant/user/access-mode accessors | 262 |

The current accessors are plain SQL functions over unverified GUCs:

- `opscore_current_tenant()` returns `current_setting('app.tenant_id', true)`.
- `opscore_current_user()` returns `current_setting('app.user_id', true)`.
- `opscore_access_mode()` returns `app.access_mode` if it is one of `field/auth/system/backoffice`.

Therefore replacing only one policy or only one accessor would leave alternate direct-GUC policy paths. The migration must inventory and replace all direct and indirect dependencies before claiming closure.

## 3. Cryptographic implementation options

### Option A — `pg_session_jwt`: not approved as the trust root yet

The production catalogue lists `pg_session_jwt` as available but not installed. Its README describes a JWK-validated JWT mode and a fallback to the PostgREST `request.jwt.claims` parameter; the README explicitly warns that the fallback parameter is user-modifiable and can permit impersonation.

More importantly, the upstream source registers `pg_session_jwt.jwk` with PostgreSQL `GucContext::Backend`, while the JWT value and fallback claims use `GucContext::Userset`. PostgreSQL defines BACKEND parameters as settable at server startup or by the client in the connection startup packet for an ordinary non-superuser connection. The extension README also documents setting the JWK through client startup options.

**Decision:** do not use `pg_session_jwt` as the trust root on the direct `opscore_runtime` connection unless an isolated test proves that this Neon connection path prevents the runtime-role client from supplying or replacing its own JWK. Never use its unsigned/PostgREST fallback for this boundary. An installed extension is not, by itself, proof of trusted identity.

### Option B — `pgcrypto` HMAC verification: preferred candidate for an isolated proof, not yet approved

The production branch already has `pgcrypto` 1.4 and a working `hmac()` routine. PostgreSQL documents HMAC as a keyed MAC that cannot be recalculated without the key.

Candidate design:

1. The application signer obtains a high-entropy HMAC key from the deployment secret manager, outside PostgreSQL and outside the database connection.
2. Because HMAC is symmetric, the same high-entropy secret is held by the trusted application signer and stored for verification in a private schema/table accessible only to the non-login definer owner. The runtime role cannot read, write, own, or alter that table. This protects against a runtime-credential-only compromise, not compromise of the privileged database owner/definer or the trusted signer.
3. A narrowly scoped `SECURITY DEFINER` verification function, owned by the dedicated NOLOGIN `opscore_auth_definer` role, reads that verifier key and validates the exact signed assertion. It returns only verified claims or a boolean/error; it never returns the key or a newly generated MAC.
4. RLS context accessors read only the verified assertion. Plain `app.tenant_id`, `app.user_id`, and `app.access_mode` become non-authoritative.
5. The signer key is not present in SQL arguments, database logs, worker IPC diagnostics, exception messages, or any table accessible by `opscore_runtime`.

Before adoption, the isolated proof must demonstrate: no key read through table access, views, functions, error paths or catalog metadata; no exposed signing oracle; strict key versioning and rotation; deterministic canonical claim encoding; expiry and purpose checks; replay controls; and a safe comparison implementation. Do not assume a normal byte-string equality operator is constant-time without evidence.

**Threat-model limit:** a shared HMAC signer key in the application protects against a database-credential-only compromise, but not against arbitrary code execution in the signer process or compromise of the deployment secret manager. If that wider threat is in scope, use a private-key signer and a database-side verifier whose public-key configuration cannot be overridden by the connecting runtime role; confirm Neon extension/runtime support before selecting the algorithm.

### Option C — per-tenant database roles

Not selected. It would complicate connection pooling and tenant lifecycle and is not justified for this schema without a capacity and operations analysis. No role-per-tenant migration should be attempted.

## 4. Application route / data-path inventory

The following paths must be migrated as one identity-plane programme. Updating only `setSession` is insufficient.

| Flow | Current source behavior | Required replacement |
|---|---|---|
| Authenticated HTTP request | `server.js ctx()` sets empty `auth` context, then resolves session/API key; `requireCtx()` rebinds caller-derived tenant/user as `field` | Resolve token/key through narrow helpers; produce verified, short-lived field assertion; bind verified context only |
| Password login | Resolve user by email and return password hash; verify in Node; query all memberships by arbitrary user ID; insert session directly | Protect password verifier material; bind login proof to authenticated user; return only that user's authorized memberships; create session through single-purpose helper |
| OIDC exchange | Verify ID token in app; query/link identity; optional auto-link direct INSERT; create session | Signed OIDC-verification capability with issuer/subject/audience/nonce; narrow link/session helpers |
| API-key auth | Generic SQL joins API keys/users/memberships, checks expiry, updates usage/rate limits | Narrow helper that accepts only hash of high-entropy presented key and returns the minimum verified scope/context; atomic rate-limit update |
| Session resolution | `opscore_resolve_session_by_token_hash` accepts hash and returns session/user/tenant fields | Keep token-hash lookup but enforce expiry/revocation/organization state in the helper; return minimal claims; no caller-chosen user/tenant |
| Session creation | `_createSessionForUser()` performs direct INSERT after application membership selection | Purpose-specific helper consumes a signed login/OIDC proof and creates the session atomically |
| Logout | SECURITY DEFINER delete by hash | Keep narrowly scoped exact-token revocation; require token hash and ensure it cannot delete any unrelated row |
| Password reset request | Narrow helper exists; legacy missing-function path switches generic setter to `auth` and inserts directly | Remove production fallback after all deployed schemas meet helper contract; function binds verified admin capability and exact target membership |
| Password reset consume | Narrow validation/consume helpers; old-schema direct write fallback | Helper atomically consumes one-time token, updates password and revokes sessions; no raw DML compatibility path after migration gate |
| Invitation acceptance | Direct transaction reads invitation by token hash, inserts/updates user and membership, marks invitation accepted | Single-purpose helper: high-entropy token hash, expiry, atomic one-time consume, membership write, and session issuance as applicable |
| Bootstrap | Direct GUC `auth` context and multi-table inserts after application route gate | One-time bootstrap capability, DB advisory/row lock, zero-user invariant, and atomic single-use helper |
| Password-hash upgrade | Direct UPDATE to `users` after login | Dedicated helper requiring verified login capability; do not expose generic user-table UPDATE |
| Generic privileged modes | Worker accepts caller-provided `field/auth/system/backoffice` values | General field binder cannot choose privileged modes; separate helper functions accept narrowly scoped proof only |

Source inventory is from the source baseline noted at the top. It is not proof that every path has been exercised by production HTTP tests.

## 5. Database grant and function-owner requirements

Current live state is not least privilege:

- `opscore_runtime` has SELECT/INSERT/UPDATE/DELETE on `users`, `sessions`, `memberships`, `organizations`, `oidc_identities`, and `password_reset_tokens`.
- `opscore_list_memberships_for_user(text)` is executable by runtime and returns membership data for a caller-supplied user ID without a verified caller identity.
- The inspected SECURITY DEFINER helpers are owned by `neondb_owner`, despite the presence of `opscore_auth_definer`.
- Migration 035 suppresses function-owner transfer failures inside `EXCEPTION WHEN OTHERS THEN NULL`.

Required end-state:

1. Every SECURITY DEFINER function must have a documented, least-privilege purpose and fixed safe `search_path`; qualify sensitive object references.
2. The dedicated NOLOGIN `opscore_auth_definer` must own only the functions that require its BYPASSRLS capability. It must not be grantable to `opscore_runtime`.
3. A failed ownership transfer must fail the migration. No swallowed exception or silent fallback to `neondb_owner`.
4. Revoke direct runtime DML/SELECT on identity-plane tables only after route mapping, full compatibility migration, and rollback-safe tests prove every caller uses the narrow functions.
5. Revoke EXECUTE on arbitrary-user identity resolvers and replace them with caller-bound, purpose-bound operations.
6. Ensure no view, trigger, SECURITY DEFINER function, or background worker reintroduces a wider read/write path.

## 6. Migration sequence — isolated branch only

**Phase 0 — Freeze and inventory**
- Keep production and `main` unchanged.
- Inventory all grants, owners, functions, RLS policies, views, triggers, background jobs, API routes, and migration compatibility paths.
- Compare source migrations with the live catalogue; don't assume source migration files equal deployed schema.

**Phase 1 — Cryptographic proof**
- Use a fresh Neon child branch from a known production checkpoint.
- Validate HMAC signing/verifying with independent Node and PostgreSQL test vectors.
- Prove that a direct `opscore_runtime` connection cannot read or change the verifier key, cannot mint signatures, and cannot authenticate a forged tenant/user/purpose.
- Test malformed, wrong-key, expired, future-dated, wrong-audience, wrong-issuer, wrong-purpose, wrong-tenant, wrong-session, and replayed assertions.
- Benchmark the accessor path on realistic query plans before broad RLS migration.

**Phase 2 — Narrow identity functions**
- Implement login candidate verification, verified membership retrieval, session issue/resolve/revoke, OIDC link, API-key authentication, password reset, invitation consume, and bootstrap as explicit functions.
- Add lock/concurrency tests for one-time tokens and first-user bootstrap.
- Use no generic function that accepts arbitrary `user_id`, `organization_id`, or privileged `access_mode` as authorization proof.

**Phase 3 — Application migration**
- Update every route in Section 4.
- Remove generic `setSession({accessMode})` behavior from application callers.
- Keep backward compatibility only in development/test while version-gated production migrations are completed. Do not let a missing function silently fall back to a broad auth GUC.

**Phase 4 — RLS and grants**
- Replace all 21 direct GUC policy dependencies and all 262 accessor dependencies.
- Verify every one of 276 public policies across 134 tables after migration.
- Remove direct runtime identity-table privileges in a single controlled migration after the callers are moved.
- Verify function owners/ACLs, private key ACLs, table owners, FORCE RLS flags, and default privileges.

**Phase 5 — Real acceptance**
- Use actual HTTP login, OIDC, API-key, password-reset, invitation, bootstrap, logout, and tenant-owned CRUD flows.
- Run raw SQL red-team attempts using only the runtime DB credential.
- Test pooled connection reuse, concurrent mixed tenants, worker request teardown, and exception/rollback paths.
- Require zero cross-tenant reads/writes and no identity enumeration outside the exact capabilities.

**Phase 6 — Production go-live**
- Only after the isolated branch proves all acceptance gates, create a reviewed migration PR.
- Apply to production in a separately approved, observable migration window with a tested rollback.
- Run the same direct-SQL and HTTP acceptance tests against the exact deployed commit.
- Certification remains blocked until all results are attached to that commit.

## 7. Explicit acceptance criteria

- The raw runtime DB credential alone cannot forge tenant, user, session, or privileged-purpose assertions.
- Every untrusted GUC value, including `app.tenant_id`, `app.user_id`, `app.access_mode`, `request.jwt.claims`, and `pg_session_jwt.jwt`, is non-authoritative unless verified by a trusted mechanism.
- A runtime connection cannot supply an alternate verifier key or bypass the configured trust root.
- Tenant A's assertion cannot read/write Tenant B; changing plain settings has no effect.
- An arbitrary user ID cannot be passed to a helper to enumerate memberships or sessions.
- API-key/session/reset/invitation helpers accept only high-entropy presented token hashes and verify expiry/revocation/one-time use atomically.
- General HTTP request code cannot select `auth`, `system`, or `backoffice`.
- All direct GUC policy references and accessor dependencies are accounted for; no unreviewed policy remains.
- Runtime role does not have unnecessary direct DML/SELECT grants on identity-plane tables.
- Every SECURITY DEFINER owner, ACL, fixed search path, and table grant is verified from the isolated catalogue.
- Real PostgreSQL HTTP and raw SQL red-team tests pass on the same commit intended for production.

## 8. Current decision record

| Item | Status |
|---|---|
| Root cause: caller-settable tenant/user/access-mode GUCs | **Verified** |
| Production A→B context-switch test | **Verified; transaction rolled back** |
| 276-policy / 134-table RLS inventory | **Verified from live catalogue** |
| 21 direct-current_setting policies / 11 tables | **Verified from live catalogue** |
| Runtime identity table grants | **Verified** |
| Arbitrary-user membership resolver path | **Verified** |
| Dedicated definer role exists | **Verified** |
| Dedicated definer owns current auth helpers | **False; live catalog shows neondb_owner** |
| pgcrypto/HMAC is available in production | **Verified installed; candidate only** |
| pg_session_jwt installed | **No; available only** |
| pg_session_jwt safe against caller-supplied JWK in current direct-connection model | **Not verified; do not rely on it** |
| Signed context implementation | **Not implemented** |
| Identity grants revoked | **No; deliberately unchanged** |
| Production tenant isolation certification | **NOT CERTIFIED** |

## 9. Non-claims

This ADR does not say the fix is implemented, tested in an isolated branch, merged, deployed, or certified. No production database DDL/DML, grants, secrets, roles, Vercel project settings, or deployments were changed by this analysis.


## 10. Isolated HMAC/RLS proof — executed on a Neon child branch

**Status: PASS for the limited cryptographic-context prototype; NOT an application fix or production certification.**

### Isolated target

- Branch: `security-tenant-context-proof-20261114`
- Branch ID: `br-patient-truth-bcc63gli`
- Parent: production branch `br-wispy-term-bcrqqj84`
- Parent LSN: `0/8A2B988`
- Parent timestamp: `2026-11-14T13:54:14Z`
- PostgreSQL: 18.7
- `pgcrypto`: 1.4, installed
- The proof created a separate `security_proof` schema, one private HMAC key table, one toy tenant-row table, and a `SECURITY DEFINER` verifier function. No production schema, row, role, grant, or Vercel setting was changed.

### Ownership and access checks

Live isolated-branch catalogue checks reported:

- `security_proof` schema and both tables are owned by `opscore_auth_definer`.
- `security_proof.verified_context()` is `SECURITY DEFINER`, owned by `opscore_auth_definer`, with fixed `search_path=pg_catalog, security_proof`.
- `opscore_runtime` is not a member of `opscore_auth_definer`.
- Runtime has SELECT on the toy tenant-row table and EXECUTE on the verifier, but no SELECT/INSERT access to the private key table.
- Direct SELECT from `security_proof.context_keys` as `opscore_runtime` failed with SQLSTATE `42501` (permission denied).
- `SET ROLE opscore_auth_definer` as `opscore_runtime` failed with SQLSTATE `42501` (permission denied).

### Positive tenant-boundary tests

Using separately signed test assertions:

| Signed assertion | Raw caller settings | Verified context | Rows visible |
|---|---|---|---:|
| Tenant A | Tenant A / field | Tenant A | 1 (A only) |
| Tenant B | Tenant B / field | Tenant B | 1 (B only) |
| Tenant B | Changed to Tenant A / backoffice | Tenant B | 1 (B only) |
| Tenant A | Changed to Tenant B / system | Tenant A | 1 (A only) |

This proves that in this isolated prototype the RLS policy reads the verified assertion, not the caller's mutable tenant/user/access-mode GUCs.

### Negative tests

The following assertion cases returned no verified context and zero rows:

- Tenant B payload paired with Tenant A's signature.
- Wrong signature.
- Missing signed payload/signature while caller-supplied tenant GUCs were populated.
- Expired assertion.
- Wrong audience.
- Disallowed `backoffice` purpose.
- Empty subject.
- Unknown key ID.
- Missing `nbf`.
- Valid signature with a future `nbf` outside the acceptance time.

The verifier prototype enforces a 60-second maximum assertion lifetime, exact issuer/audience/purpose, non-empty subject/tenant/session/JTI/key ID, `iat`, `nbf`, and `exp`, a 4 KiB payload bound, and a 32-byte HMAC-SHA256 value. The comparison uses a fixed-length XOR accumulation loop; this is not a formal constant-time certification.

### Critical limits — still open

This proof is a deliberately small mechanism test, not a production identity implementation:

1. It protects against a holder of `opscore_runtime` who does not possess the shared HMAC secret. HMAC is symmetric: the trusted signer and privileged verifier owner share the same secret. A compromise of the signer, `opscore_auth_definer`, `neondb_owner`, or higher database administration remains outside this proof's threat boundary.
2. The first prototype (`verified_context`) records each `jti` in a private table bound to `pg_backend_pid()` and `pg_current_xact_id()`. Verified on the isolated branch: the same assertion supports repeated reads in the same transaction; after that transaction commits, the same assertion is rejected in a second transaction; and two concurrent transactions presenting the same assertion produced one winner and one denial. This mechanism is replay-resistant in the test but writes during RLS SELECT and is not the preferred production candidate. A second, no-write backend/transaction-bound verifier is documented below.
3. The prototype now looks up a private test-session row and proves that `sub`, `tenant_id`, and `session_id` match, that the session is not revoked, and that the session/assertion have not expired. Valid A and B sessions passed; wrong subject/tenant binding, revoked session, and expired session were denied. This uses only synthetic `security_proof.test_sessions`, not the production `sessions` table or real HTTP sessions.
4. The prototype has not been connected to `pg-sync-worker.js`, `pg-database-sync.js`, `Store`, `server.js`, API-key authentication, OIDC, bootstrap, invitation acceptance, or password-reset routes.
5. It protects only the toy `security_proof.tenant_rows` table. None of the 276 production policies or 134 production tables has been migrated.
6. The test key is a temporary isolated-branch value, not a production key. Production key management, rotation, signer audit, cleanup/retention of consumed JTI rows, first-use bearer theft/racing, pooler behavior, read-only transaction compatibility, performance, and formal constant-time behavior remain unproven. Because the current RLS verifier inserts a JTI-use row while evaluating SELECT policy, the request transaction must be writable; this write-on-read cost and compatibility must be redesigned or measured before production.
7. No live production HTTP login/session tenant-boundary test was run.

### Decision after proof

- The `pgcrypto` HMAC route is now a **viable candidate for a fuller isolated implementation**, not an approved production design.
- The next isolated phase must add session binding and replay-safe request context, then integrate one narrow vertical slice (session resolution + one tenant read route) and prove it with real HTTP and raw SQL tests.
- Do not revoke production grants, alter production policies, apply migrations to production, or change `main` based on this proof.
- Production isolation remains **NOT CERTIFIED**.


### Session binding and replay-consumption extension — additional isolated tests

The prototype was extended on the same Neon child branch (no production DDL/DML):

- Added private test-session records for active Tenant A/B sessions, one revoked session, and one expired session. The verifier checks a matching `session_id`, `sub`, and `tenant_id`, session expiry, session revocation, and that assertion expiry does not outlive the session.
- Added private `used_assertions` with unique `jti`, backend PID, transaction ID (`xid8`), session, tenant, user, assertion hash, and expiry.
- The verifier atomically inserts the JTI on first use. Further RLS evaluations in the same transaction are accepted only when backend PID, transaction ID, session, tenant, user, and exact assertion hash match.
- Runtime cannot SELECT or INSERT into either private table and cannot CREATE in the proof schema. It can only SELECT the toy tenant rows and EXECUTE the verifier.

Observed result matrix:

| Test | Result |
|---|---|
| Valid Tenant A signed assertion + matching active test session | PASS — A row only |
| Valid Tenant B signed assertion + matching active test session | PASS — B row only |
| Two independent tenant-row reads in the same transaction using same JTI | PASS — repeated read allowed |
| Commit the first transaction, then replay same still-valid assertion in a new transaction | PASS — denied, zero rows |
| Two concurrent transactions race using the same JTI | PASS — one winner (one row), one denied (zero rows) |
| Signed subject/tenant do not match the named test session | PASS — denied, zero rows |
| Test session already revoked | PASS — denied, zero rows |
| Test session expired | PASS — denied, zero rows |

The concurrent race used two independent tool transactions and a one-second barrier before the verifier query. The winning transaction committed the unique JTI row. The other transaction observed the already-claimed JTI from a different backend/transaction and was denied.

**Additional design constraints:** this lazy RLS-consumption technique writes to `used_assertions` during a SELECT. It can reject a PostgreSQL READ ONLY transaction and adds a write/lock to tenant reads. The proof does not measure that cost, test a real Neon pooler, or validate cleanup/retention of expired JTI rows. The first-use bearer-race risk remains if a valid unused assertion is stolen. A production implementation may use a separate explicit `activate_context` step at the start of each writable request transaction, provided RLS then requires the activation record bound to that same backend and transaction.



## 11. Preferred isolated candidate: signed context bound to the live backend and transaction

A second verifier, `security_proof.verified_bound_context()`, was created on the same isolated child branch. It is separate from the earlier JTI-writing `verified_context()` prototype.

### Verification contract

The signed payload additionally carries:

- `backend_pid`: the PostgreSQL backend PID returned by the actual transaction connection.
- `transaction_id`: the PostgreSQL `pg_current_xact_id()::text` value for that same open transaction.

The verifier compares these claims to the live `pg_backend_pid()` and `pg_current_xact_id()::text` on every RLS evaluation. It also verifies the HMAC, issuer, audience, purpose, required non-empty identity/session/JTI/key claims, `iat`, `nbf`, `exp`, maximum 60-second lifetime, and the matching active test-session row. Unlike the first prototype, it does not insert a JTI record or write any table when reading tenant rows.

### Exact isolated outcomes

- **READ ONLY success:** a transaction executed `BEGIN; SET TRANSACTION READ ONLY`, generated a signed assertion in that same transaction, switched effective role to `opscore_runtime`, changed the raw tenant/user/access-mode GUCs to a different tenant and `backoffice`, and read the RLS-protected table. Only the signed tenant A row was visible.
- **Tenant B symmetry:** a separate READ ONLY transaction signed for tenant B while raw GUCs were set to tenant A/`backoffice`; only tenant B's row was visible.
- **Same backend, new transaction replay:** the first transaction used backend PID `991` and transaction ID `175117`; it committed. A second transaction on the **same backend PID `991`** had transaction ID `175118`. Reusing the exact same signed payload and signature returned NULL context and zero rows.
- **Different backend replay:** reusing an assertion created for backend PID `991` on another backend PID `1016` also returned NULL context and zero rows.
- **Invalid assertions:** a correctly signed wrong-audience assertion and a correctly signed future-`nbf` assertion each returned NULL context and zero rows.
- **Session binding:** correctly signed assertions whose subject/tenant did not match the referenced test session, or whose test session was revoked or expired, returned NULL context and zero rows.
- The read-only tests executed under effective role `opscore_runtime`; the trusted signing step was simulated inside the isolated database under `opscore_auth_definer`, not in a real Node signer service.

### Why this is the stronger candidate

It prevents cross-transaction replay by binding a valid assertion to both the actual backend and the actual transaction. It can be checked repeatedly during one request transaction and does not need to write a JTI-use row during each RLS read. The observed READ ONLY success is evidence that this approach avoids the first prototype's write-on-read limitation.

### Remaining design obligations

1. The actual Node request path must begin a DB transaction, obtain `pg_backend_pid()` and `pg_current_xact_id()` from that exact connection, ask a trusted signer to sign only the independently authenticated user/session/tenant context plus those DB values, then bind the resulting payload/signature transaction-locally on the **same** connection before any tenant query.
2. The signer must never sign caller-supplied arbitrary user/tenant/mode values. It must derive those claims from verified HTTP session/API-key/OIDC state and an authorized membership selection.
3. Prove the connection remains pinned to the same backend for the transaction under the actual Neon pooler and Node worker. A pooler disconnect/retry/new transaction must require a newly signed assertion.
4. Explicitly define the policy for a transaction attempting to install a second, different signed context. The isolated no-write verifier validates each signed assertion but does not maintain a database-side one-context latch; the trusted signer/application must issue only one tenant context per transaction, or a separate safe latch mechanism must be designed.
5. Measure the cost of repeated HMAC + key lookup + session lookup from RLS. No performance claim is made.
6. Test session revocation semantics under the application's isolation level. The prototype reads session state without a row lock so it remains compatible with READ ONLY transactions; a concurrent revocation is observed according to the transaction snapshot.
7. Keep the shared HMAC secret unavailable to `opscore_runtime`. The test signing step used `opscore_auth_definer` on the same test database solely to generate a proof assertion. Real application signing must live in the trusted server process/secret manager, not in a function callable by runtime.
8. The fixed-length XOR comparison in PL/pgSQL is a preliminary constant-work comparison only; formal constant-time behavior is not certified. A production implementation needs independent security review and possibly an audited verifier primitive.
9. Do not remove the first proof's test schema or any prior evidence until the final design is selected and all test artifacts are preserved. The experimental child branch is kept with its compute suspended.

### Decision

- **Preferred candidate for the next isolated vertical slice:** backend/transaction-bound signed context, because the test succeeded under `READ ONLY` and rejected replay on the same backend in a new transaction.
- **Not approved for production:** it has not been integrated into the real Node signer/worker, has not passed real Neon pooler tests, and has not migrated any production RLS policy.
- The HMAC key is symmetric and shared by the trusted signer and the privileged verifier owner. A compromise of the signer, `opscore_auth_definer`, `neondb_owner`, or higher database administration remains outside this credential-only proof.
- Production isolation remains **NOT CERTIFIED**.

