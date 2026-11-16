# Signed Tenant Context Route Audit — 2026-11-16

## Decision

**Status: NOT VERIFIED — do not generate or publish the 67-route manifest or Production coverage evidence from this audit.**

This report is a deterministic source/inventory comparison. It is not a Production HTTP test, not a signed-session proof, and not an approved route manifest.

## Source inputs

| Input | SHA-256 / Git blob SHA | Finding |
|---|---|---|
| `backend/docs/API_INVENTORY.json` | Git blob `7c0e2397d1e6f7235b5720735878e74a0fbb9960` | 358 source-derived route records |
| `backend/src/server.js` | Git blob `5a3cfdf80d206f95a8f9ba10169c2f3c810f1c3f` | Signed route allowlists and Preview-only guards |
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
