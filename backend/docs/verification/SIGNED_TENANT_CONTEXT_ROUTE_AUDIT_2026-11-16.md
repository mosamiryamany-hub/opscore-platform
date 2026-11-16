# Signed Tenant Context Route Audit — 2026-11-16

## Decision

**Status: NOT VERIFIED — do not generate or publish the 67-route manifest or Production coverage evidence from this audit.**

This report is a deterministic source/inventory comparison. It is not a Production HTTP test, not a signed-session proof, and not an approved route manifest.

## Source inputs

| Input | SHA-256 / Git blob SHA | Finding |
|---|---|---|
| `backend/docs/API_INVENTORY.json` | Git blob `7c0e2397d1e6f7235b5720735878e74a0fbb9960` | 358 source-derived route records |
| `backend/src/server.js` | Git blob `35e5e41b5c3d0f81aecf2a161c2f90a9aa041606` | Rebased signed route allowlists and fail-closed Preview-only guards |
| `backend/src/release-proof.js` | Git blob `b325942a1a5c6a60ce8050e03c02952a24389524` | Requires an exact 67-route manifest and Production evidence |

The API inventory records 358 route entries. The release-proof inventory filter considers 346 entries eligible for further consideration after excluding public routes, authentication routes, and a small explicit exclusion set. **Those 346 entries are not a signed-context allowlist and must not be represented as 346 verified routes.**

## Current signed route flags and allowlist

The source functions `signedWorkOrdersReadEnabled`, `signedWorkOrdersWriteEnabled`, and `signedSessionAutobindEnabled` all require:

`process.env.VERCEL_ENV === 'preview'`

The work-order read/write functions additionally require their respective Preview feature flags. Therefore these functions do not enable the signed-session route path in Production.

Comparing the explicit read/write patterns in those two functions with the current API inventory yields:

| Source allowlist | Matched inventory entries |
|---|---:|
| Signed work-order GET allowlist | 18 |
| Signed work-order/evidence write allowlist | 9 |
| **Explicit route records matched** | **27** |

The wider work-orders plus evidence-uploads inventory contains 40 entries. The remaining 13 are not part of the explicit read/write allowlist above. Two dynamic source handlers (DELETE and restore) are expressed by the API inventory through generic route patterns rather than exact work-order paths; they are deliberately not counted as exact inventory matches here.

The 27 count is a source allowlist count only. It does not prove that requests were executed, that the request used a signed session, that the database transaction activated the verified tenant context, that raw GUC tampering was denied, or that cross-tenant access was blocked.

## Missing release artifacts

The following exact paths were not present on the inspected integrated PR branch at audit time:

- `backend/docs/verification/SIGNED_TENANT_CONTEXT_ROUTE_MANIFEST.json`
- `backend/docs/verification/SIGNED_TENANT_CONTEXT_PRODUCTION_COVERAGE.json`

The release verifier requires a 67-row route manifest bound to the exact API inventory SHA, with 67 unique eligible method/path rows and explicit read/write operations. The Production evidence must then bind all 67 route outcomes to the manifest SHA, inventory SHA, exact Production database, exact commit, exact pipeline, and exact Neon parent branch.

For every route, the verifier requires signed-context, session, and transaction binding; raw-GUC tamper denial; tenant-A and tenant-B own-operation success; and cross-tenant denial. The current Production evidence collector for dual-tenant work-order probes does not generate those 67 per-route records.

## Actions taken

- Performed source and inventory comparison only.
- Did not create a manifest or coverage JSON.
- Did not mark any route as passed.
- Did not invoke Production or Preview probes.
- Did not seed tenants, create users, write rows, or run SQL migrations.
- Did not enable any signed-context feature flag.
- Kept the Production release certification fail-closed.

## Required engineering work before the 67-route gate can pass

1. Identify the authoritative 67 business routes from actual route handlers and their database access paths; do not select them by taking the first 67 inventory rows.
2. Implement and test a common signed-session transaction boundary for every selected read/write route, including consistent rollback and connection cleanup.
3. Ensure the Production activation mechanism is deliberately designed and independently gated; the currently inspected work-order/session autobind functions are Preview-only.
4. Build a disposable-Preview route harness that creates two tenant principals, executes each route's own operation and opposite-tenant denial, injects raw-GUC tampering, and proves transaction binding.
5. Only after the Preview matrix passes, generate a manifest bound to the exact inventory SHA and obtain the required release authorization for a Production execution. Production coverage must be freshly generated on the exact commit and pipeline; Preview results cannot be promoted or rebound as Production evidence.

**Commercial certification remains HOLD.**


## Prior isolated CI evidence and its scope (read before treating counts as comparable)

The repository already contains a historical report, `SIGNED_TENANT_CONTEXT_WORK_ORDERS_CI_VERIFICATION_2026-11-14.md`, documenting disposable PostgreSQL 18 CI evidence:
- 18 signed work-order GET route patterns were tested, including all listed read subresources.
- The write set included create, update, comments, transition, soft-delete, restore, and later bulk; evidence-upload chunk/complete paths are also guarded by the current Preview write allowlist.
- The report records 48/48 read-subresource assertions and 26/26 write assertions for its then-current test suite.
- A separate source-derived tenant route isolation matrix reported 346 route probes on disposable CI data.

Those results are useful CI evidence, but **they are not the missing 67-route Production signed-session certificate**. The 346-route matrix validates its own tenant isolation test scope; it does not assert signed HMAC context binding, same-session/database transaction binding, raw-GUC tamper rejection, or Production source-commit/pipeline/branch identity for all 346 routes. Likewise, a Preview-only work-order route suite cannot be relabeled as Production evidence.

## Current Preview environment metadata (values intentionally not read)

Vercel's environment metadata was listed with `decrypt=false`. The Preview target lists:
- `OPSC_TENANT_CONTEXT_KEY_JSON`
- `OPSC_TENANT_CONTEXT_PROOF_ENABLED`
- `OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_ENABLED`
- `OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_WRITE_ENABLED`
- `OPSC_REQUIRE_SIGNED_TENANT_CONTEXT`
- `OPSC_TENANT_CONTEXT_KEY_ID`
- `OPSC_TENANT_CONTEXT_HMAC_KEY`

The metadata did **not** list `OPSC_SIGNED_TENANT_CONTEXT_SESSION_AUTOBIND_ENABLED`. Secret values were not decrypted, and no environment value was changed. Therefore this is a metadata-only prerequisite check; it does not establish whether `OPSC_REQUIRE_SIGNED_TENANT_CONTEXT` is currently true or false.

The source passes `OPSC_REQUIRE_SIGNED_TENANT_CONTEXT` to the PostgreSQL worker, which rejects unsigned field-mode context when that flag is true. Before this follow-up, `server.js` only attached a verified session principal when Preview session-autobind or the narrower work-order allowlist was active; other routes would attempt the legacy field bind and receive the worker's generic rejection.

## Fail-closed route-policy repair rebased into PR #174

PR #174 reapplies the reviewed PR #163 route-policy repair directly on current main. It extracts the existing Preview-only signed-route decisions into `backend/src/signed-tenant-context-policy.js` and checks `OPSC_REQUIRE_SIGNED_TENANT_CONTEXT` before the legacy unsigned field-context fallback:
- If signed context is required but the current request has no enabled signed-session route path, the server returns `503 SIGNED_TENANT_CONTEXT_ROUTE_NOT_ENABLED`.
- Enabled Preview work-order read/write paths continue through the existing signed principal and transaction-binding path.
- Global session autobind remains Preview-only.
- No Production route or flag was enabled and no runtime deployment was performed.

New unit tests in `backend/test/signed-tenant-context-policy.test.js` cover Preview-only gates, method-specific route allowlists, the separate work-order write flag, the required-but-unsupported route failure, and the server's guard ordering before unsigned GUC binding.

This repair improves the failure mode; it does not add new routes to the signed allowlist and does not close the 67-route gate. CI for the current PR head must pass before the change can be considered merged. Production isolation and commercial closure remain **HOLD**.



## Non-work-orders vertical slice — assets list (2026-11-16)

### Source-selected operation and relational scope

The next vertical slice is the exact authenticated operation **GET /api/v1/assets**. It is outside the work-orders domain and uses the existing Store.listAssets(ctx) query:

`assets a LEFT JOIN sites s ON s.id=a.site_id WHERE a.organization_id=? ORDER BY a.updated_at DESC LIMIT 500`

The returned site_name comes from the joined sites row. On the inspected Neon Preview branch br-fragrant-king-bcr9928f / database opscore_acceptance:

- Both public.assets and public.sites have RLS enabled and FORCE ROW LEVEL SECURITY.
- Both tables have tenant-boundary policies based on opscore_current_tenant().
- assets.site_id references sites(id, organization_id); sites.customer_id references customers(id, organization_id). These are composite tenant-aware foreign keys.
- The Preview migration ledger contains migrations 063–068, including the signed verifier and RLS accessor alignment.
- The database has active HMAC key metadata rows. Secret material was not queried.
- The opscore_runtime role is LOGIN, NOSUPERUSER, NOBYPASSRLS; opscore_auth_definer is NOLOGIN, NOSUPERUSER, BYPASSRLS.

This is schema/role evidence only; it does not establish the Vercel Preview deployment's runtime secret/key alignment.

### Source changes rebased into PR #174

- Added exact Preview-only GET /api/v1/assets gate OPSC_SIGNED_TENANT_CONTEXT_ASSETS_READ_ENABLED=true.
- The route now uses the signed read-only transaction wrapper when this gate is enabled: BEGIN READ ONLY → obtain backend/xid → bind HMAC assertion → execute the existing joined Store query → COMMIT. Failure rolls back and returns no signed-success marker.
- The feature is exact-path and GET-only; it cannot enable asset writes, other asset subroutes, or Production.
- Added policy tests for the Preview-only gate, method/path matching, and signed route admission.
- Extended the real PostgreSQL 18 signed-context CI gate to seed one asset and one site per tenant and exercise the actual GET /api/v1/assets route for Tenant A and Tenant B. Assertions require the signed response marker, exactly one own-tenant asset, correct own-tenant site_name join, no foreign asset, and raw-GUC tampering ignored. The gate already includes unsigned-GUC denial, invalid HMAC denial, same-backend next-transaction replay denial, and different-backend replay denial.
- Cleanup removes only the synthetic asset/site fixtures created by this gate.

### Verification boundary at this update

The changes are now rebased into PR #174 on current main. Exact rebased commit 5b0178720e227f0fe9d1067c1c6d395049530203 passed all three PR workflows: OpsCore CI run 43921995453 (success), PostgreSQL 18 isolated RLS/HTTP acceptance run 43921995281 (success), and Vercel contract workflow run 43921995259 (success). In the Vercel workflow, deploy-bound acceptance and Production deploy jobs were explicitly SKIPPED, not executed. The PostgreSQL job completed the real signed-tenant policy and dual-tenant assets/site test scope; this proves the isolated CI gate only.

The earlier PR #163 Preview build is a different source commit and cannot be carried forward as proof for PR #174. The Preview deployment previously built required Vercel SSO for authenticated routes; GET /api/v1/assets was not exercised over an authenticated Vercel Preview HTTP session. Current Vercel project metadata also showed the project has no connected Git repository, and Preview SSO remains enabled. No SSO bypass, environment variable, or Git link was changed in this PR.

Therefore the non-work-orders GET /api/v1/assets slice has source and isolated PostgreSQL CI coverage, not a verified live Preview HTTP vertical slice. Do not mark it certified until the matching PR #174 commit is deployed to Preview and the route is exercised with the configured Preview runtime identity and signing key.

No Production system or database was touched. No Production route/flag was enabled, no SQL migration was executed, and no synthetic data was seeded in Production. The exact 67-route Production manifest and coverage remain NOT VERIFIED.
