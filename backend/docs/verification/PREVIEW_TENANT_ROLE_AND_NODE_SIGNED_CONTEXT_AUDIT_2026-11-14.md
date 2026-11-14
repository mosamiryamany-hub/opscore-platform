# Preview Tenant-Role and Node Trust-Boundary Audit — 2026-11-14

**Status:** READ-ONLY REVALIDATION; NO ROLE, ACL, POLICY, SECRET, OR APPLICATION-CODE CHANGE IN THIS AUDIT  
**Repository:** `mosamiryamany-hub/opscore-platform`  
**PR:** #103 — `security/priority-production-hardening-20261114`  
**Audited source head:** `9d77c9dbc7644014beae8826fba7678a07e21580`  
**Main baseline reported by PR metadata:** `4ef126ccd59f23cebeead30224d1bcf7199535ab`  
**Neon target:** `summer-leaf-18448271` / Preview branch `br-wispy-credit-bckacgvt` (`vercel-dev`) / database `opscore_acceptance`

## 1. Decision summary

The existing 060–062 table-specific privilege results remain valid for `opscore_runtime`, but they do **not** establish a globally least-privilege role model or a signed tenant identity boundary.

This revalidation found all of the following on the Preview branch:

1. Legacy `opscore_app` is LOGIN, BYPASSRLS, CREATEDB, and CREATEROLE, and is a member of `neon_superuser`.
2. `opscore_app` has effective SELECT/INSERT/UPDATE/DELETE on all 135 public tables inspected. `opscore_runtime` has effective DML on 134 of those 135 tables.
3. Future public tables created by `neondb_owner` inherit SELECT/INSERT/UPDATE/DELETE for both `opscore_app` and `opscore_runtime`.
4. The Preview RLS catalogue contains 276 policies across 134 tables. Twenty policy USING expressions and fourteen WITH CHECK expressions directly reference `current_setting(...)`; these direct GUC dependencies span eleven named tables.
5. The actual worker continues to accept tenant/user/access-mode values and write session-level GUCs. The server has not connected `sessionId` from its resolved session to the database bridge.
6. The separate async PostgreSQL pool used by knowledge indexing/search does not share the synchronous worker's connection or transaction context.
7. The Preview database has no `security_proof` or `security_context` schema and no corresponding verified-context function. The isolated proof described in the ADR is not deployed to this Preview target.

**Disposition:** keep the tenant-isolation gate **NOT CERTIFIED**. Do not revoke the provider-role membership or blanket default ACLs. Do not replace only one production RLS accessor or policy. Do not add an unused signer module or partially switch the live HTTP path. The next implementation must be an end-to-end, session-authenticated, transaction-bound vertical slice with an independently verified database context.

## 2. Live Preview role and effective privilege evidence

Read-only catalog queries returned:

| Role | LOGIN | BYPASSRLS | CREATEDB | CREATEROLE | Membership |
|---|---:|---:|---:|---:|---|
| `opscore_app` | yes | yes | yes | yes | `neon_superuser` |
| `opscore_runtime` | yes | no | no | no | none |
| `opscore_auth_definer` | no | yes | no | no | dedicated NOLOGIN definer role |
| `neondb_owner` | yes | yes | yes | yes | provider and application role memberships |

Effective privileges were checked with `has_table_privilege`, not inferred from direct ACL entries alone:

| Role | Public tables inspected | Tables with effective DML |
|---|---:|---:|
| `opscore_app` | 135 | 135 |
| `opscore_runtime` | 135 | 134 |

The 060–062 least-privilege results on the three Autopilot tables are still true for `opscore_runtime`:

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---:|---:|---:|---:|
| `incident_replays` | yes | yes | no | no |
| `decision_memory` | yes | yes | no | no |
| `autopilot_proposals` | yes | yes | yes | no |

However, `opscore_app` still has effective SELECT/INSERT/UPDATE/DELETE on all three because its provider-role membership overrides the direct table revocations. The role had no active session in the sampled `pg_stat_activity` result; that is only a point-in-time observation and does not prove the credential is unused elsewhere.

### Default privileges

For future TABLE objects created by `neondb_owner` in schema `public`, `pg_default_acl` still grants SELECT, INSERT, UPDATE, DELETE to both `opscore_app` and `opscore_runtime`.

No attempt was made to remove `opscore_app` from `neon_superuser`, change role attributes/passwords, or revoke default privileges. Those changes could break migration, deployment, or application workflows and must be preceded by a complete connection-secret and call-site reconciliation. A safe follow-up is a source-controlled migration after the role model has been proven, not an untracked manual ACL edit.

## 3. Preview RLS dependency inventory

The live Preview catalogue reported 276 policies across 134 public tables:

- 20 policy USING expressions directly reference `current_setting(...)`.
- 14 policy WITH CHECK expressions directly reference `current_setting(...)`.
- The direct references span these eleven tables:

| Table | USING references | WITH CHECK references |
|---|---:|---:|
| `appointments` | 1 | 1 |
| `control_plane_runs` | 2 | 2 |
| `evidence_upload_chunks` | 1 | 1 |
| `feature_flags` | 2 | 2 |
| `oidc_identities` | 2 | 0 |
| `operational_event_receipts` | 1 | 1 |
| `safe_mode_states` | 2 | 2 |
| `sessions` | 5 | 3 |
| `sync_blocks` | 1 | 1 |
| `users` | 2 | 0 |
| `work_orders` | 1 | 1 |

The remaining policies also depend on the current tenant/user/access-mode accessor functions, so the direct-reference counts are not the full dependency graph. This is why replacing one RLS helper or adding a signed gate to a single business table cannot be described as a complete isolation fix.

The Preview target currently has neither `security_proof` nor `security_context` schema, and the queried `verified_bound_context()` function candidates were absent. The existing ADR proof lives on a different isolated lab branch and must not be treated as installed on `vercel-dev`.

## 4. Node source audit at the recorded PR head

The following exact source blobs were fetched from `security/priority-production-hardening-20261114`:

| File | Blob SHA |
|---|---|
| `backend/src/pg-sync-worker.js` | `b616486e2c3cc498e197f601f7c44ea42623c63e` |
| `backend/src/pg-database-sync.js` | `3a78d1e0f1a874659c4043f13462a2da2f3e383a` |
| `backend/src/server.js` | `1e76d2866c1a73aa4eec5808e66fcf89995ad5b5` |
| `backend/src/store.js` | `e6cba03d9c06c46422796caf0a38b9976cbe8d90` |
| `backend/src/postgres-runtime.js` | `53f5ceae9de65297a41d6ddb9a2301a0d6e01978` |
| `backend/src/postgres-knowledge.js` | `4ead9edd984dd892baaf11e08e93c0462296c9f9` |

### Synchronous worker and transaction handling

- `pg-sync-worker.js` keeps one checked-out PostgreSQL client per request ID.
- `setSession` accepts caller-supplied `tenantId`, `userId`, and one of `field/system/auth/backoffice`, then writes the three GUCs with `set_config(..., false)` (session-level, not transaction-local).
- Transaction tracking is one boolean, not a nested transaction/savepoint stack.
- Cleanup rolls back a transaction the worker still believes is open, then runs `RESET ALL` before returning the client.
- The bridge's `setSession` API does not carry `sessionId`.

### Authenticated session flow

- `Store.session(token)` returns `sessionId`, `userId`, and `organizationId` after resolving the token hash.
- `server.js` first binds generic `auth` context to resolve the session, then `requireCtx()` binds the returned tenant/user as `field`, but omits `sessionId`.
- The actual `public.sessions` table has `id`, `user_id`, `token_hash`, `expires_at`, `created_at`, and nullable `organization_id`; no `revoked_at` column was present in this Preview schema. Logout therefore needs to be treated according to the current delete/revoke helper semantics, not an assumed revoked-at field.
- API-key authentication is a separate principal type and cannot be silently passed through a session-only signer contract.

### Existing transaction boundaries

A source scan of `backend/src/store.js` counted 31 explicit transaction-start calls and 91 references to `_txDepth`. The request lifecycle is not itself one PostgreSQL transaction. Wrapping the whole HTTP request in a new transaction would alter existing transaction boundaries and could break operations that commit, roll back, or switch purpose/context internally.

A signed assertion must instead be created and bound on the exact connection and inside each supported transaction, with a separately reviewed contract for autocommit statements and for purpose-bound auth flows. No blanket outer transaction should be introduced.

### Separate async knowledge pool

- `server.js` has two independent `getPool(config)` call sites for knowledge index/search.
- `postgres-runtime.js` creates another `pg.Pool`.
- `postgres-knowledge.js` queries that pool directly; its SQL tenant parameter is not an RLS trust boundary.
- The adapter's current tenant client helper writes unsigned, session-level tenant GUCs. It is a second trust path and must either receive the same signed backend/transaction contract or be explicitly excluded from any claim of complete isolation.

## 5. CI and Vercel freshness boundary

At the pre-audit head `9d77c9dbc7644014beae8826fba7678a07e21580`, GitHub reported:

| Workflow | Run | Result |
|---|---:|---|
| Digital Twin PostgreSQL 18 Isolated RLS and HTTP Acceptance | `43610952610` | SUCCESS |
| OpsCore CI | `43610952627` | SUCCESS |
| Vercel contract workflow | `43610952658` | SUCCESS |

The exact jobs for run `43610952658` show:

- `vercel-contract-verify`: SUCCESS
- `deploy-bound-postgres-18-acceptance`: SKIPPED
- `deploy`: SKIPPED

A Vercel deployment lookup for exact SHA `9d77c9dbc7644014beae8826fba7678a07e21580` returned zero deployments. The latest READY deployment still inspected for this branch was built from older SHA `23ddd6e98f80d9bc6d68597780f7d3b2833dcfbc`. Therefore CI success is not current-head Vercel HTTP acceptance.

Vercel Preview SSO protection remains in place. No SSO bypass was used. Preview environment metadata has no dedicated `OPSC_TENANT_CONTEXT_HMAC_KEY` or equivalent signer key. No environment variable was created or changed during this audit.

## 6. Exact next implementation gate

The next slice is intentionally not a generic replacement of `setSession`. It must:

1. Implement a canonical bounded assertion with `iss/aud/sub/tenant_id/session_id/purpose/iat/nbf/exp/jti/key_id/backend_pid/transaction_id`.
2. Sign only claims resolved from a real authenticated session or a separately designed API-key principal; never sign client-supplied tenant/user/mode.
3. Obtain backend PID and transaction ID from the exact PostgreSQL client inside the exact open transaction, then sign and bind transaction-locally on that client.
4. Use the dedicated `opscore_auth_definer` owner for a private verifier-key store and a fixed-search-path SECURITY DEFINER verifier; `opscore_runtime` must not read or change key material.
5. Base session validation on the actual Preview `sessions/users/memberships/organization_governance` schema and current logout semantics.
6. Start with the planned isolated authenticated READ route and a test-only RLS table; do not change the 134 production application-table policies in the first slice.
7. Prove Tenant A/B isolation, raw GUC tampering, wrong user/tenant/session, wrong key/audience/purpose, expiry, same-backend/new-transaction replay, different-backend replay, READ ONLY, rollback, reconnect, and the real Neon pooled/direct behavior.
8. Either migrate the async knowledge pool into the same contract or explicitly keep it outside the first-slice claim and prevent it from being presented as covered.
9. Add the Preview-only signing key only after code, database verifier, tests, and rollback path exist. Production key provisioning remains forbidden in this phase.

## 7. Change log and safety

During this revalidation:
- No SQL write was executed on any Neon branch.
- No role membership, role attribute, password, grant, default privilege, RLS policy, or database object was changed.
- No Vercel environment variable, deployment protection, alias, or WAF setting was changed.
- No production branch, production data, or production secret was touched.
- No merge to `main` was performed.

This report is evidence of a revalidation and the exact reason the signed-context implementation is still open. It does not claim tenant-isolation certification or production release readiness.


## 8. Additional identity-plane function semantics confirmed after the source audit

The Preview catalog definitions of the authentication helpers were inspected read-only:

- `opscore_resolve_session_by_token_hash(text)` is SECURITY DEFINER, owned by `neondb_owner`, has a fixed `search_path=pg_catalog, public, pg_temp`, and is executable by `opscore_runtime` while PUBLIC EXECUTE is absent. It joins session, active user, membership, organization, and organization-governance records, returning the organization status. It does not itself filter the session expiry; `Store.session()` rejects an expired returned session in Node. The application server then blocks most routes for non-active organizations, with explicit exceptions for governance/status, `/api/v1/me`, and logout.
- `opscore_revoke_session_by_token_hash(text)` is SECURITY DEFINER under the same owner/search-path contract and deletes only the exact matching `sessions.token_hash` row. There is no `revoked_at` column in this schema; successful logout removes the row.
- `opscore_list_memberships_for_user(text)` is SECURITY DEFINER under `neondb_owner` and executable by `opscore_runtime` while PUBLIC EXECUTE is absent. Its body returns memberships for the caller-supplied user ID without a separate proof binding that ID to an authenticated login. This is a separate authentication-plane hardening requirement; a field-session assertion alone does not repair it.

A second expression count across the same 276 policies found 253 tenant-accessor references, 18 current-user-accessor references, and 243 access-mode-accessor references. These counts overlap and must not be summed. Together with the 21 policies directly referencing GUCs, they confirm that most of the current policy set depends on the legacy GUC-based accessor contract.

This additional inspection remains read-only and does not change the disposition in sections 1 and 6.


## 9. Historical source provenance for the `opscore_app` grants

The Preview migration ledger and exact source files were checked for migrations 049–051:

| Migration | Ledger SHA-256 | Source blob SHA | Verified purpose |
|---|---|---|---|
| `049_app_role_table_privileges.sql` | `d2225d45849b029cb611d918fbf09eacd88c7df29b17f1f14029c0cb95ed8e7b` | `d53770cee6a23e2d46b6fa9735f59cf1d8d8ea1b` | Broad DML on existing public tables and default DML for future public tables to `opscore_app`; sequences USAGE/SELECT; schema USAGE. |
| `050_app_role_schema_create.sql` | `417e6ac6d00e8b393d71f2ba833df15fce91947633a6bb3043991ca7b939a900` | `b6c79377df15e5a9a5a1ff60fdc75ae0206f49ca` | Temporarily grants database and public-schema CREATE for isolated live RLS gate setup. |
| `051_revoke_runtime_role_ddl_privileges.sql` | `b1057ee7c46e81322cf9e3e5a4feae72322bed5f56f9501d08d164b134ddc2b5` | `60d642c599f5de10d14eaf80401fe1d4e80e943b` | Revokes CREATE on the database and public schema; does not revoke 049 DML grants or default privileges. |

Migration 051's source comment says the old live RLS gate now bootstraps a rollback-only schema using the owner URL and `SET LOCAL ROLE opscore_app`. Migration 059's source comment separately states that the production application connects as `opscore_runtime`, not `opscore_app`.

The evidence therefore supports this narrower conclusion: `opscore_app` is not identified by migration 059 as the production HTTP application role, but it has a documented isolated acceptance-test use and retains broad effective privileges on the inspected Preview target. Its provider membership and broad defaults remain a role-governance risk until all deploy/test credentials and uses are reconciled. This is not sufficient evidence to remove its membership or credentials now.
