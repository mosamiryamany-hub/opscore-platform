# OpsCore v0.11.56 — Enterprise Value Additions

This release adds production-oriented capabilities without claiming external services that are not connected.

## Implemented
- Universal tenant-scoped search across work orders, customers, sites and assets.
- Safe bulk work-order mutation with per-record failure reporting, audit record and idempotency support.
- Approval request/decision lifecycle for sensitive operational actions.
- Inventory ledger for explicit, reasoned stock adjustments with balance-after and audit trace.
- Deterministic business calendar and exception model with business-minute deadline calculation.
- Dispatch eligibility endpoint with tenant-scoped skill/capacity reasons.
- Buyer-developer SDK (`sdk/opscore-client.js`) for the new APIs.
- Migration preflight script/API that verifies PostgreSQL migration numbering and produces a release digest.

## Honest boundaries
- Bulk status changes still pass through the existing workflow/completion gates.
- Inventory ledger adjustments are explicit ledger operations; the release does not claim that every legacy inventory mutation is automatically backfilled into the ledger.
- Business calendar calculation uses the supplied week/exception definition and does not claim an external timezone/holiday feed.
- Dispatch eligibility does not calculate road ETA or traffic-aware routing.
- The migration preflight validates migration-file continuity and hashing; it is not proof of a successful PostgreSQL runtime migration.
