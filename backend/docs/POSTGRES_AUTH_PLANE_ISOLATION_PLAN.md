# PostgreSQL Auth-Plane Isolation Plan

Status: implementation blocker identified; do not merge or deploy migration 034 until this plan is implemented and verified.

## Why the current design is not safe to merge

The application currently performs pre-tenant identity operations through generic `db.prepare(...)` queries while setting `app.access_mode='auth'`. The RLS policies for tenant-owned rows now correctly deny rows when no tenant is selected, but the existing authentication paths need to discover identity/tenant information before they can set that context. Separately, broad auth-mode policies on `users`, `sessions`, and `password_reset_tokens` are not an acceptable long-term authorization boundary.

Do not fix this by adding a generic `auth` exception to tenant RLS or by granting the application role general SELECT access.

## Required target design

1. Add a dedicated, non-login owner for narrowly scoped auth functions. The application role must not own the functions/tables and must not have `BYPASSRLS`.
2. Implement a small set of `SECURITY DEFINER` functions with a fixed safe `search_path`, fully qualified object names, no caller-controlled dynamic SQL, minimal return columns, explicit input validation, and explicit `REVOKE ALL ... FROM PUBLIC` plus least-privilege `GRANT EXECUTE`.
3. Required operations:
   - Resolve a login candidate using a normalized email and return only the minimum fields required to verify the password; never return password hashes to API clients or logs.
   - Resolve a session by a hash of the presented token and return only the authenticated principal plus the tenant selected by a valid membership.
   - Revoke the caller's session using a hashed token.
   - Consume a password-reset token exactly once in a transaction, update the password, and invalidate all of that user's sessions.
   - Consume an invitation exactly once under row lock, validate expiry, and create/attach membership atomically.
   - Bootstrap only when no initial account exists, with a transaction and a concurrency-safe singleton/lock.
4. Prefer storing only token hashes. Use row-level locking or conditional updates to guarantee single consumption; use transaction rollback on every failed path.
5. Keep normal tenant data access under `app.tenant_id`, `app.user_id`, and `app.access_mode='field'`. Bind these three settings together on every request and fail closed if binding fails.
6. Remove broad application-role reads/writes of identity-plane tables once all callers use the narrow operations. Do not exclude identity tables from RLS without a replacement control.

## Required verification before merge

Run on a fresh isolated Neon branch created from the intended production parent, never on production first.

- Valid login succeeds; invalid/unknown/inactive account failures are indistinguishable.
- Multi-tenant account can select only an organization where it has a membership.
- Session lookup rejects expired/revoked tokens; logout invalidates the presented session.
- Concurrent use of a reset token and invitation token succeeds at most once.
- Password reset invalidates existing sessions.
- Invitation acceptance cannot create membership in a different organization than the invitation.
- Tenant A cannot read/write tenant B data through SQL or HTTP APIs, including forged tenant headers.
- No-tenant auth context cannot enumerate organizations, memberships, users, sessions, API keys, or reset tokens through generic application queries.
- Confirm the login/bootstrap/reset/invitation routes work end-to-end against PostgreSQL, not just SQLite or static tests.
- Confirm role grants, function ownership, fixed search paths, and that the runtime role is not superuser and does not bypass RLS.

## Release gates

- Keep MR !15 in draft until the above tests pass.
- Apply the migration to production only after explicit release approval and a rehearsed rollback plan.
- Re-run the live production gate against the deployed commit; do not promote older acceptance evidence to the new commit.
- A passing unit/CI pipeline is necessary but does not certify production tenant/session isolation.
