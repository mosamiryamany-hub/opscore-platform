---
name: opscore-2026-high-value
description: Extend and harden OpsCore FIELD Integrated packages for general multi-buyer use with 2026 high-value field-service features and truth-bound enterprise controls. Use when the user asks to add, design, document, audit, clean, or implement high-value extensions, enterprise hardening, domain-neutral features, firewall, sign-off chains, outbox, geofencing, or purge controls for OpsCore. Triggers include OpsCore, high-value features, 2026 extensions, FIELD-INTEGRATED, multi-buyer, enterprise hardening, domain neutrality, add features carefully, truth boundary.
---

# OpsCore 2026 High-Value Feature Extension

Specialize in carefully extending the OpsCore FIELD Integrated source kit (Web Console + API + Expo mobile) with high-value capabilities aligned to 2026 field-service trends while strictly preserving its truth boundaries, deterministic core, offline-first design, tenant isolation, audit/provenance, and source-kit (not SaaS) positioning.

## Core Principles (never violate)

- Truth boundary first. Document exactly what exists, what is optional/external, and what is out of scope. Never claim autonomous agents, local/private LLM, fabricated predictions, road-traffic ETA, or production certifications the package does not contain.
- Deterministic + explainable by default. Prefer reason-code weighted scores, persisted facts only, and transparent eligibility rules over black-box models.
- Fail-closed for any external provider (AI vision, notifications, maps, OIDC, etc.). Buyer supplies keys; package ships adapters only.
- Tenant isolation + RLS from the first line of any new migration or query. Cross-tenant tests are mandatory before claiming completion.
- Offline-first and idempotent. Mobile changes must respect existing sync contracts, conflict center, and SHA-256 evidence handling.
- Docs before code. Update or create the planning statement, then the high-value extensions doc, then implementation. Keep "no gap between documentation and reality".
- Incremental releases. One coherent batch per version bump, with tests, checksums, and RELEASE_SCOPE update.

## High-Value Feature Catalog (2026-aligned)

These seven features were selected after deep review of 2026 sources (Dynamics 365 Field Service wave 1, ServicePower Vision AI, Simpro/FieldEdge trends, BCG Applied AI Field Service, Deloitte Digital, IDC AI-Enabled FSM, Salesforce Agentforce). They complement existing OpsCore capabilities (optional Field Copilot, Offline Sync Conflict Center, Technician Time/Labor, Deterministic Risk, Daily Brief).

### HV-01 — Structured Visual Evidence + Quality Gate
- Guided photo capture with structured checklist items.
- Store image + metadata + SHA-256; never copy large payloads into conflict records.
- Optional external vision adapter (buyer API key only) that returns pass/marginal/fail against tenant-defined thresholds.
- Links to work-order evidence and audit trail. Improves First-Time-Right without autonomous action.

### HV-02 — Asset Installed-Base Condition Ledger
- Persist condition signals derived only from recorded events (check-ins, labor, parts consumption, prior work orders).
- Deterministic readiness score with explicit reason codes.
- No synthetic forecasts or ML claims. Supports proactive maintenance planning from real history.

### HV-03 — Skills & Certification Eligibility Matrix
- Tenant-scoped skills and certifications attached to technicians and work types.
- Deterministic eligibility filter for dispatch candidates, risk, and daily-brief.
- Feeds explainable suggestions; does not auto-assign.

### HV-04 — Bounded Offline Decision Support Pack
- Compact local rule pack (next-action hints + risk level) that works when offline.
- Syncs later under existing idempotency and conflict rules.
- Never executes autonomous remediation.

### HV-05 — Explainable Dispatch Suggestion Layer
- Ranked candidates with transparent weights and reason codes (skills match, load, distance as straight-line, SLA state).
- Operator remains in control; no auto-dispatch.

### HV-06 — Customer Self-Service Constraint Booking
- Appointment windows constrained by capacity, skills, and SLA from existing records.
- Prevents overbooking; respects hierarchical visibility.

### HV-07 — Labor + Parts Cost Attribution to Risk/Brief
- Attribute only already-recorded labor and parts costs into operational-risk and daily-brief views.
- Purely deterministic aggregation; no invented numbers.

## Workflow for Adding Features

1. Confirm current package version and SHA-256 from INTEGRATED_PACKAGE_MANIFEST.json / INTEGRATED_SHA256SUMS.txt.
2. Update or create `docs/REQUIRED_ADDITIONS_STATEMENT.md` (or equivalent planning doc) listing the feature under the correct priority tier with exact scope and truth boundary.
3. Extend `docs/2026_HIGH_VALUE_EXTENSIONS.md` with the new capability, what changed, truth boundary, and environment-dependent validation notes.
4. If code is requested, implement only after docs are consistent. Follow existing patterns (tenant RLS, idempotency keys, audit events, buyer-acceptance tests).
5. Add or extend tests (unit + cross-tenant + buyer:acceptance).
6. Regenerate checksums and update RELEASE_SCOPE / manifests.
7. Never mark a feature "done" in sales-facing docs until the above is complete and verified.

## Reference Materials

- Load `references/feature-specs.md` for detailed acceptance criteria and data-model notes per HV feature.
- Load `references/truth-boundaries.md` when writing any claim that could be misread as production AI, autonomous action, or hosted SaaS.
- Use `scripts/` only for deterministic helpers (checksum verification, simple schema checks) that match existing package scripts style.

## Enterprise Hardening & Domain Neutrality (v0.11.56+)

When the package is positioned as general multi-buyer (not sector-specific):

- Keep and strengthen the domain-neutrality gate (`domain-neutrality-gate.js`). Forbidden terms cover single-sector/telecom-specific vocabulary.
- Map any requested "sovereign / self-destruct / self-healing / zero-downtime" language to the actual modules (firewall, data-purger, signature-chain, geofencing, operational-worker, postgres-parity-check, etc.) using precise scope only.
- Prefer the inventory style in `docs/ENTERPRISE_HARDENING_INVENTORY_v0.11.56.md`: capability → real module → honest scope.
- Never promote marketing inflation into RELEASE_SCOPE, PRODUCT_POSITIONING or buyer-facing claims.
- Duplicated concepts (e.g. sign-off chain appearing twice) must be documented once.

## Anti-Patterns to Reject

- Inventing predictive values or "AI will automatically fix".
- Claiming road-network ETA or continuous live tracking beyond recorded check-ins.
- Shipping hard-coded third-party API keys or free hosted providers.
- Breaking offline sync contracts or existing conflict-center behavior.
- Updating sales positioning before the feature is tested and checksummed.
- Asserting autonomous self-destruct, hot schema rewrite, or zero-downtime self-healing when the code only performs request filtering, buffer zeroisation, static parity checks or worker housekeeping.
- Re-introducing single-sector business logic into a general multi-buyer package.

When the user requests execution ("نفذ", "add the features", "implement", "clean", "organize"), start with documentation updates and truth-bound inventory inside the extracted OpsCore package, then proceed to code only if explicitly asked and after the docs are solid.
