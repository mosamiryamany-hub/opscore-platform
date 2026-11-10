# OpsCore v0.11.61 — Buyer Value Dossier

**Release: v0.11.62**

This is the canonical buyer-value record for the release. Historical uplift notes are retained under `docs/history/sale-value/` and are not current release claims.

## What is materially valuable

1. **Deterministic offline recovery** — sync events are isolated with SAVEPOINTs; one permanent failure does not roll back valid neighbors; failed events are recoverable through Sync Center.
2. **Evidence chain** — work-order evidence is integrity-checked and assembled into a completion/evidence package with a package SHA-256.
3. **Governed closeout** — completion policies and workflow versions can block invalid completion and record the governing policy/workflow version used for the decision.
4. **Tenant security proof** — cross-tenant boundaries are exercised by regression tests rather than described only in prose.
5. **Migration readiness** — customer import dry-run, external references, API/OpenAPI contracts, and non-mutating validation reduce acquisition integration risk.
6. **Portability and recovery evidence** — organization export, export verification, backup verification, and recovery drill provide executable buyer checks.
7. **Audit provenance** — audit-chain verification and tamper-detection tests provide a concrete integrity control without claiming legal immutability.

## Buyer proof pattern

The strongest sales evidence is not feature count. It is a reproducible chain:
**defect discovered → defect documented → fix implemented → regression test added → release manifest regenerated → buyer can rerun the proof.**

## Explicit non-claims

This package does not claim PostgreSQL runtime/production certification, signed Android/iOS artifacts, physical-device acceptance, store approval, production RPO/RTO, legal/WORM immutability, AI capability, or autonomous remediation.

## Historical record

See `docs/history/sale-value/` for prior release-specific uplift notes. Those files are historical evidence only.


## Commercial workflow — v0.11.61

The buyer receives a real, tenant-scoped commercial layer rather than a UI-only quote form: estimates persist line items and deterministic totals; acceptance is an explicit state transition; an accepted estimate can be converted exactly once into a linked work order; invoices can inherit accepted-estimate lines; manual payments advance invoice state without claiming an external payment gateway.

This is intentionally a local commercial ledger boundary. Stripe in this package remains an application-subscription integration, not proof of customer payment processing.
