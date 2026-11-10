# OpsCore v0.11.56 — Cross-Module Integrity & Authorization Evidence

## Implemented

- `backend/src/integrity-graph.js` adds a deterministic tenant-scoped integrity graph verifier for core operational relationships.
- The verifier checks cross-organization relationship mismatches and user-membership consistency across customers, sites, work orders, assets, asset events, comments, appointments, inventory/work-order parts, invoices, contracts, and maintenance plans.
- `backend/src/authorization-evidence.js` adds a versioned authorization-decision evidence record with actor, role, source, correlation ID, operation-envelope reference, action, resource, decision, and reason code.
- API-key scope decisions now emit explicit allow/deny evidence without storing credentials or tokens.
- Read-only endpoints expose the tenant-scoped integrity report and admin-only authorization decision history.

## Evidence boundary

- The integrity verifier is deterministic and executes against the active SQLite schema/data. It does not prove PostgreSQL/RLS behavior.
- Authorization evidence currently covers the API-key scope gate directly. Existing method-level RBAC decisions remain enforced by the existing RBAC layer; they are not falsely represented as universally persisted decisions.
- Live infrastructure, OIDC/JWKS, distributed deployment behavior, and PostgreSQL isolation remain unverified until real infrastructure is connected.
