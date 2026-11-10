# OPSCORE Builder Integration

This release integrates an interactive Build workspace into the authenticated OPSCORE web console.

## What is integrated
- Build tab inside the real OPSCORE operations console.
- Live preview using authenticated OPSCORE API data for metrics, SLA and customers.
- Safe transformation recipes for dashboard, customers table, revenue metric, charts, responsive layout, RTL/LTR, light/dark workspace mode and metric sizing.
- Revision tracking and browser-local Builder workspace persistence.
- Affected-file view and explicit validation state.
- Fail-closed behavior for unsupported prompts; no arbitrary code execution is used by the Builder.

## Boundary
The integrated Builder is a deterministic safe-recipe engine. It is intentionally not presented as a general-purpose autonomous code generator. A future AI provider can be attached to the same orchestration surface without changing the operational core.

## v0.11.36+ Implemented hardening additions

- **Resumable Evidence Vault:** server-side 512 KiB chunks, per-chunk SHA-256, duplicate-safe replay, conflict rejection, contiguous reassembly, final SHA-256 verification, and attachment creation only after verification. The existing 5 MiB attachment ceiling is preserved.
- **Transactional Integration Outbox:** each existing `activity_log` event is persisted as a tenant-scoped integration event in the same database transaction. Authenticated claim/complete/fail contracts are included; no external broker is claimed.
- **Runtime Observability:** `/api/v1/observability` exposes process-local request/error/latency telemetry and explicitly identifies its scope.
