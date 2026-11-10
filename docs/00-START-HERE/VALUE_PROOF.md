# OpsCore v0.11.61 — Buyer Value Proof

**Release: v0.11.62**

This release deliberately focuses on verifiable acquisition value rather than feature count.

## 1. Evidence Chain
`GET /api/v1/work-orders/{id}/evidence-package` produces a structured evidence package containing the work-order state, appointment/check-in proof, SLA state, parts, attachments, customer sign-offs, safety acknowledgements, activity and audit records.

Every stored attachment is re-hashed before the package is returned. The package includes a SHA-256 digest over its canonical JSON representation and an explicit `allAttachmentsVerified` result.

This is an integrity mechanism. It is **not** claimed to be legal immutability, WORM storage, or regulatory certification.

## 2. Migration Readiness
`POST /api/v1/import/customers/dry-run` validates customer migration input without writing to the database and reports validation errors plus existing external references.

This gives an acquiring team a safe preflight step before committing imported data.

## 3. Tenant Security Proof
`backend/scripts/buyer-security-proof.js` creates isolated tenants and proves that a tenant cannot read another tenant's work order or evidence package. The proof is executable and produces a PASS/FAIL JSON report.

## 4. Offline Recovery Proof
`backend/test/buyer_value_pack.test.js` contains a real `valid → invalid → valid` sync-chaos regression. It proves valid events surrounding a failed event commit while the invalid event is isolated.

## 5. Explicit limits
The release does not claim PostgreSQL production certification, signed Android/iOS store builds, physical-device certification, legal evidence immutability, autonomous remediation, or AI capability unless independently implemented and verified.


## Governance proof
Completion policy history is versioned and closeout records the governing policy id/version. Candidate policy evaluation is explicitly non-mutating.

## Governed Workflow Control — v0.11.31

The configurable Work Order workflow is enforced at the Work Order mutation layer, not only through a convenience transition endpoint. This means a direct status update is evaluated against the active workflow before persistence.

Each governed transition records the workflow version, actor, optional reason, and a SHA-256 decision hash. Workflow definitions are versioned with snapshots, and an administrator can preview a transition without writing data.

This is an operational control mechanism, not a claim of legal immutability or autonomous decision-making.

## Customer coherence hardening
- Canonical domain contract and machine-readable compatibility negotiation are server-owned.
- Critical rejection responses expose structured `reasons[]`; completion packages carry an integrity hash and completion assurance.
- Owner/admin-only read-only operational doctor reports real database, audit, sync-record, webhook, and contract state.
- Field recovery semantics remain explicit: applied/duplicate remove local events; retryable failures remain queued; terminal failures are quarantined.

## Employee-first time saving proof points
The continuity layer is designed to remove repeated status calls and verbal handoff reconstruction without inventing operational facts. The cockpit returns persisted focus, assigned work, appointments, notifications and managerial decision items. The handoff endpoint carries the current record, next accountable action, deterministic risk, appointment, completion blockers, evidence references, latest note and recent timeline.

This is an operational information contract, not an automation or prediction claim.

## 0.11.56 — Evidence-Governed Operational Autopilot

Operational Intelligence Fabric adds deterministic incident simulation, evidence-linkage graphing, tenant-scoped guardrails, approval-gated worker recovery, and measured outcome memory. The local demo is isolated and does not constitute production certification.
