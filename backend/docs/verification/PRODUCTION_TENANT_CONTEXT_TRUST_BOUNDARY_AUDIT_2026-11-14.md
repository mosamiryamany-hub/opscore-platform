# Production Tenant-Context Trust-Boundary Audit

Date: 2026-11-14  
Repository: `mosamiryamany-hub/opscore-platform`  
Observed production database: `opscore_acceptance`  
Observed database role: `opscore_runtime`  
Source baseline: `main` at `4ef126ccd59f23cebeead30224d1bcf7199535ab`  
Audit branch: `security/priority-production-hardening-20261114`

## Status

**FAIL — production isolation is not certified against compromise of the runtime database credential.**

This report records read-only production evidence. It does not change the production schema, data, roles, grants, Neon settings, Vercel settings, or `main`.

## Verified evidence

### 1. Runtime role attributes

The live role catalogue reported:

| Role | LOGIN | SUPERUSER | BYPASSRLS | Notes |
|---|---:|---:|---:|---|
| `opscore_runtime` | true | false | false | Actual application database role |
| `opscore_auth_definer` | false | false | true | Exists, but was not the owner of the inspected auth functions |
| `neondb_owner` | true | false | true | Owner of the inspected auth functions |

The fact that `opscore_runtime` has `NOBYPASSRLS` is necessary, but it is not sufficient while the RLS identity inputs are freely settable by that same role.

### 2. Runtime role can select its own RLS identity context

A production transaction was opened as `opscore_runtime`. It used transaction-local `set_config(..., true)` to bind the known test user and tenant A, read the tenant-scoped organization and membership counts, then changed the GUC values to the known test user and tenant B and repeated the same reads.

Observed result:

| Context supplied by the caller | Organizations visible | Memberships visible |
|---|---:|---:|
| Tenant A | 1 | 1 |
| Tenant B | 1 | 1 |

The transaction ended with `ROLLBACK`. The statements were SELECTs plus transaction-local session settings; no row mutation was issued.

**Interpretation:** RLS correctly applies the context it receives, but the runtime database role can choose that context. A party holding only the runtime database credential can therefore impersonate another tenant by supplying its identifiers. This test does not show access by an ordinary authenticated end user; it demonstrates the credential-compromise boundary is not independently enforced by PostgreSQL.

### 3. An auth helper returns memberships for an arbitrary supplied user ID

With an empty tenant/access-mode GUC context, `opscore_runtime` successfully executed:

```sql
SELECT organization_id, role
FROM public.opscore_list_memberships_for_user('<known test user id>');
```

The function returned the corresponding tenant membership. The live catalogue reports that this function is `SECURITY DEFINER`, owned by `neondb_owner`, and executable by `opscore_runtime`.

The function accepts a caller-supplied user ID and, in the inspected definition, does not bind that ID to a verified caller identity or a signed authorization assertion. This is a cross-tenant identity-enumeration capability for a holder of the runtime credential.

### 4. Direct table grants and policy state

The live privilege check reports that `opscore_runtime` has SELECT, INSERT, UPDATE, and DELETE table privileges on each of:

- `users`
- `sessions`
- `memberships`
- `organizations`
- `oidc_identities`
- `password_reset_tokens`

RLS is enabled and FORCE RLS is enabled on the inspected identity tables. However, the live policies still contain auth-mode write branches on `users` and `oidc_identities`; `password_reset_tokens` has a permissive auth/system/backoffice policy for ALL operations and a separate restrictive SELECT guard. The runtime worker accepts the values `field`, `auth`, `system`, and `backoffice` in a caller-provided `setSession` message.

The audit deliberately did **not** issue INSERT, UPDATE, or DELETE statements against production to demonstrate these policy branches. Actual mutation impact remains untested; the policy definitions, grants, and freely supplied GUC context are the evidence.

### 5. Auth-function ownership

The live catalogue shows the inspected `SECURITY DEFINER` auth helpers are owned by `neondb_owner`, not by the existing no-login `opscore_auth_definer` role. Migration `035_auth_plane_functions.sql` attempts an ownership transfer but catches and suppresses transfer errors. The migration therefore does not prove that the intended dedicated function owner actually took ownership.

## Root cause

The application and PostgreSQL authorization boundary currently trusts caller-settable custom GUCs:

- `app.tenant_id`
- `app.user_id`
- `app.access_mode`

The worker's `setSession` handler writes these values without cryptographic verification. Several RLS policy expressions rely on these settings or accessors derived from them. An application-settable GUC is context, not proof of identity.

The current context-based RLS tests prove policy behavior for supplied contexts. They do not prove that a database-credential holder cannot forge those contexts.

## Required remediation — design recommendation, not implemented

1. **Introduce a verifiable context assertion.** The application must provide a short-lived, signed assertion binding tenant ID, user ID, session ID, access mode, issue/expiry times, and a unique request identifier. PostgreSQL policy accessors must verify its signature before returning any tenant/user/access-mode context. Plain `set_config` values must never be sufficient authorization evidence.
2. **Protect the verification key.** Keep the verification material inaccessible to `opscore_runtime`; use a key-management/rotation arrangement that does not expose the signing key through SQL, function output, logs, or runtime DB grants. Select the cryptographic primitive and storage mechanism only after proving the available PostgreSQL extension/runtime support.
3. **Remove privileged modes from the general request binder.** Normal request binding may establish only a verified field context. Bootstrap, system, and backoffice actions must be separate narrowly scoped operations, not caller-selected modes on a generic setter.
4. **Replace broad auth-mode table writes.** Remove direct runtime DML from identity-plane tables once the complete set of callers uses narrowly scoped operations for login, membership selection, session creation/revocation, password reset, invitation acceptance, and bootstrap. Do not revoke grants until every caller and rollback path is mapped and tested.
5. **Constrain every auth helper.** In particular, membership resolution must not accept an arbitrary user ID without a verified login/session capability. Login-candidate lookup and session resolution must require the appropriate signed purpose and must return only required server-side fields.
6. **Make function ownership explicit and fail the migration if ownership cannot be transferred.** Do not silently fall back to a broad database-owner role. Verify function owner, fixed `search_path`, fully qualified objects, EXECUTE grants, and table privileges on the isolated target.
7. **Audit all policy dependencies.** Replace direct reads of unverified `current_setting('app.*')` with verified accessors across every tenant and identity table, including SELECT/INSERT/UPDATE/DELETE and background-worker paths.
8. **Use a fresh isolated Neon branch first.** Do not test candidate DDL on production. Preserve rollback and backward compatibility until all routes have been moved.

## Mandatory acceptance gates

- A runtime credential without the signing key cannot create a valid context for any tenant, user, or privileged mode.
- Forged, unsigned, expired, malformed, replayed, wrong-purpose, and wrong-tenant assertions fail closed.
- Tenant A and tenant B cannot read or mutate each other's data through direct SQL using only the runtime credential.
- No-tenant and auth contexts cannot enumerate users, memberships, sessions, OIDC identities, reset tokens, organizations, or tenant data through generic SQL or unrestricted helper calls.
- Membership, invitation, bootstrap, login, session selection, logout, and password-reset flows pass end-to-end HTTP tests with real PostgreSQL sessions.
- Concurrency tests prove reset/invitation tokens are consumed at most once and password reset revokes all prior sessions.
- A red-team test using only the runtime database credential fails to impersonate another tenant.
- The dedicated function owner, role attributes, grants, policies, and search paths are verified from the isolated database catalog.
- Production certification remains blocked until the exact deployed commit passes the live gate.

## Non-claims

- This report does not claim an ordinary web user can currently choose arbitrary tenant IDs.
- It does not claim production data was modified or exposed by a real attacker.
- It does not claim the proposed signed-context design has been implemented or proven.
- It does not certify HTTP session isolation, restore/PITR, WAF enforcement, or commercial release readiness.

