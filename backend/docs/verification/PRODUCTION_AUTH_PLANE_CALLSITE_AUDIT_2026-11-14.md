# Production Auth-Plane Call-Site and Privilege Audit

Date: 2026-11-14  
Repository baseline: `main` = `4ef126ccd59f23cebeead30224d1bcf7199535ab`  
Production database inspected: Neon project `summer-leaf-18448271`, branch `br-wispy-term-bcrqqj84`, database `opscore_acceptance`  
Actual database role: `opscore_runtime`  
Source branch: `security/priority-production-hardening-20261114`

## Decision

**Tenant/session isolation remains NOT CERTIFIED.**  
This audit adds source call-site findings to the live database trust-boundary evidence. It does not change production or `main`.

## Live catalog facts

1. `opscore_runtime` is LOGIN, NOSUPERUSER, NOBYPASSRLS.
2. The inspected identity tables are owned by `neondb_owner`; their ACLs explicitly grant `opscore_runtime=arwd` (SELECT, INSERT, UPDATE, DELETE) on `users`, `sessions`, `memberships`, `organizations`, `password_reset_tokens`, `oidc_identities`, and `invitations`.
3. Runtime cannot become `opscore_auth_definer`: `pg_has_role('opscore_runtime','opscore_auth_definer','SET') = false`. The dedicated role exists as NOLOGIN and BYPASSRLS, but the inspected SECURITY DEFINER helpers are actually owned by `neondb_owner`.
4. The role `opscore_app` expected in portions of the checked-in migration source does not exist in this production database. The live deployment uses `opscore_runtime` and `opscore_app_least`; therefore role-name assumptions in migrations must be reconciled before privilege changes.
5. `pgcrypto` is installed and its HMAC functions are available in this database. This confirms a database-side cryptographic verification primitive exists; it does not, by itself, provide safe key storage or prove any signed-context design.
6. `opscore_current_tenant()`, `opscore_current_user()`, and `opscore_access_mode()` are ordinary STABLE SQL functions that read `current_setting('app.tenant_id'...)`, `app.user_id`, and `app.access_mode` directly. They do not verify an assertion or a signature.
7. The production policies inspected on `users` and `oidc_identities` retain permissive write branches for `auth`, `system`, and `backoffice`. `password_reset_tokens` retains a permissive ALL policy for those modes, paired with a restrictive SELECT-deny policy. Invitations are tenant-scoped by a predicate that ultimately relies on the caller-provided tenant GUC.

## Source call-site inventory

The following are source-code findings from the `main` baseline. No request was sent to production to exercise these write paths.

| Flow | Source path / method | Current behavior | Required replacement |
|---|---|---|---|
| HTTP session resolution | `backend/src/server.js` — `ctx()` | Sets empty-tenant `auth` context, then resolves a session token through the database helper | Signed, purpose-bound session-lookup capability; no generic auth mode |
| HTTP API-key resolution | `backend/src/server.js` — `ctx()`; `backend/src/store.js` — `authenticateApiKey()` | Directly reads `api_keys`, `users`, `memberships`, governance; writes rate-limit counters and last-used timestamp | Dedicated API-key verification operation that authenticates the presented key and returns only a validated principal; then bind a signed tenant context |
| Password login | `backend/src/server.js` — login route; `backend/src/store.js` — `loginAsync()` | Sets `auth` GUC; login-candidate helper returns password hash; membership helper accepts arbitrary user ID; then session inserted directly | Signed login-candidate lookup bound to normalized email; after password check, signed membership selection; atomic session-issue helper |
| Membership enumeration | `backend/src/store.js` — `_listMembershipsForUser()` | Calls SECURITY DEFINER `opscore_list_memberships_for_user(user_id)`; function returns memberships for any supplied user ID | Require a verified login capability for the exact user, or a valid existing-session capability; reject unbound IDs |
| Session lookup | `backend/src/store.js` — `_resolveSessionByTokenHash()` | SECURITY DEFINER resolver returns session, user, tenant and role from a supplied token hash | Session-lookup helper must require capability for the presented secret/token hash and enforce expiry/revocation in SQL |
| Session issue | `backend/src/store.js` — `_createSessionForUser()`, `loginAsync()` | Inserts session directly after setting tenant/user/access-mode GUCs | Single transaction helper verifies signed login result + membership and creates the session |
| OIDC exchange | `backend/src/server.js` — OIDC exchange; `backend/src/store.js` — `loginOidc()` | Validates ID token in app; sets `auth`; may resolve identity and directly insert OIDC identity; then inserts session | Signed OIDC-verified capability bound to issuer, subject, and verified email; narrow link/session operations |
| Password-reset creation | `backend/src/store.js` — `createPasswordReset()` | Uses narrow helper when available; retains compatibility fallback that switches to `auth` and inserts directly if helper missing | Remove production fallback; helper only, bound to signed current admin session and same-tenant target |
| Password-reset consumption | `backend/src/store.js` — `resetPassword()` | Uses validation and consume helpers; older-schema fallback performs direct token/user/session SQL | Helper-only in PostgreSQL production; one-time atomic consume, session invalidation, no legacy direct-write fallback |
| Invitation acceptance | `backend/src/store.js` — `acceptInvitation()`; HTTP route in `server.js` | Directly reads/creates user, writes membership, consumes invitation; no explicit tenant context bind in the route | SECURITY DEFINER consume-invitation operation: lock token, validate expiry, attach/create membership atomically, return minimal result |
| Initial bootstrap | `backend/src/server.js` — bootstrap route; `backend/src/store.js` — `bootstrap()` | Uses caller-settable `auth` mode to create organization/user/membership; count check is a separate operation from creation | One-time privileged bootstrap capability, concurrency-safe singleton/lock, and a single atomic database function |
| Tenant request context | `backend/src/server.js` — `requireCtx()`; `backend/src/pg-sync-worker.js` — `setSession` | Application supplies tenant/user/accessMode; worker accepts four access modes and executes `set_config` | HMAC-signed short-lived context bound to an existing session; only verified field context for normal requests |
| Membership/role maintenance | `backend/src/store.js` — `updateMembershipRole()`, `removeMembership()`, `listMembers()` | Direct tenant table reads/writes depend on tenant GUC-backed RLS | Verified session context, with DB constraints ensuring actor membership/role and target membership in the same tenant |

## Security design recommendation

Use a **short-lived, purpose-bound signed context assertion**, not a plain GUC and not a JWT accepted without database verification.

Suggested v1 claims:

- `version`
- `purpose` (for example `tenant_request`, `login_candidate`, `session_lookup`, `oidc_link`, `invitation_accept`, `password_reset`, `bootstrap_once`)
- `tenant_id`
- `user_id`
- `session_id`
- `access_mode`
- `issued_at`
- `expires_at`
- `nonce`
- operation-specific resource binding (normalized email, token hash, OIDC issuer/subject, or invitation token hash)

Candidate implementation mechanics:

1. The application signs the canonical assertion with an HMAC key held in a dedicated Vercel runtime secret.
2. PostgreSQL verifies the signature with `pgcrypto.hmac` through a narrowly scoped SECURITY DEFINER verifier. The verifier key must be inaccessible to `opscore_runtime` and any application SQL role; the runtime role must not be able to `SET ROLE` to the verifier owner.
3. The verifier owner must be the existing dedicated NOLOGIN `opscore_auth_definer` (or another explicitly reviewed NOLOGIN role), not `neondb_owner`. The migration must fail if ownership/grant configuration cannot be proven; it must not swallow ownership errors.
4. The verifier returns only validated claims. Existing policy accessors are replaced so a caller-set GUC alone yields NULL/empty values. RLS predicates must use verified claims, not raw setting values.
5. The ordinary tenant binder accepts only `field` context tied to a real, active, unrevoked database session and a matching user/tenant membership. `auth`, `system`, and `backoffice` are not caller-selectable modes.
6. Every pre-session operation has its own purpose and resource binding. A valid `tenant_request` assertion cannot be replayed as a login lookup, bootstrap, invitation, reset, or OIDC-link capability.
7. Key provisioning and rotation must be separate from code deployment. No secret is checked into Git, printed in tool output, stored in public-readable rows, or logged. Previous keys have a bounded overlap window and are removed only after all running deployments have rotated.

**Threat boundary:** this protects against possession of the database credential alone, provided the signing key remains unavailable to that credential. It does not protect against compromise of the application runtime that holds the signing key; that is a separate threat model and must not be conflated with database-credential compromise.

## Implementation order

1. Freeze a complete inventory of all PostgreSQL auth callers and test paths, including API keys, invitation acceptance, and bootstrap.
2. Build signed-assertion verifier + Node signer behind tests; prove tampered, forged, expired, replayed, wrong-purpose, wrong-session, and wrong-tenant assertions fail.
3. Update all RLS accessors and policies on a fresh isolated Neon branch. Ensure raw GUC changes cannot authorize any row operation.
4. Move every flow in the call-site table to a narrowly scoped operation; remove helper fallback to direct SQL for PostgreSQL production.
5. Reconcile the real production roles (`opscore_runtime`, `opscore_app_least`, `opscore_auth_definer`) with migrations and grants. Revoke broad identity-table DML only after end-to-end tests show no remaining direct caller.
6. Run red-team tests using only `opscore_runtime` credentials, plus true authenticated HTTP tests with two non-empty tenants and real sessions.
7. Produce migration diff, role/ACL evidence, performance results, rollback procedure, then request explicit approval before any production migration or key rotation.

## Acceptance gates

- Setting arbitrary `app.*` GUCs under `opscore_runtime` cannot expose another tenant or enter `auth/system/backoffice`.
- Without the signing key, even a holder of the runtime database credential cannot obtain a valid signed context or enumerate memberships/users via auth helpers.
- All listed flows work on PostgreSQL with real user sessions; API-key and invitation paths are not omitted.
- One-time tokens are consumed at most once under concurrency.
- Role owner, NOLOGIN, NOBYPASSRLS/BYPASSRLS attributes, role-membership SET options, table ACLs, function ACLs, function search_path, and extension support are checked from the isolated target catalog.
- Production stays unchanged until a reviewed migration, secret-provisioning plan, rollback plan, and explicit release authorization are complete.

## Explicitly not done

- No production DDL, grants, roles, data, credentials, Neon settings, or Vercel settings changed.
- No signed-context code or database migration has been implemented by this audit.
- No claim of production certification, successful HTTP session isolation, or buyer-ready release is made.
