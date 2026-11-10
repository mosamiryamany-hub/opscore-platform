# v0.11.62 — Digital Twin Integrity Hardening Candidate

- Strengthened deterministic twin-state canonicalization and deep immutability; lossy/non-JSON inputs fail closed.
- Protected the in-memory event-chain internals from caller-side mutation and bounded chain growth.
- Evolved the tenant-scoped operational twin from v1 to v2 with persisted-record aggregates across work orders, assets/events, maintenance, invoices, and integration delivery.
- Added authenticated snapshot capture, paginated tenant-scoped history, independent SHA-256 consistency verification, and idempotent capture semantics.
- Tightened API inventory/OpenAPI synchronization to remove stale source-derived route methods.
- The candidate remains non-production-qualified: a hash stored in the same database is not a signature or tamper-proof/WORM ledger; external telemetry, physical simulation, predicted failure probabilities and live PostgreSQL/RLS have not been established.

# v0.11.62 — AI Contact Center Candidate and Scope Corrections

- Added a guarded AI contact-center foundation with consented web chat, browser real-time voice bootstrap, encrypted transcript persistence, explicit human escalation, atomic assignment, audit events, and tenant-scoped access checks.
- Added a 114-language planned catalogue. The repeated Welsh (`cy`) at row 104 was corrected to Faroese (`fo`) so all 114 codes are unique. No language is marked production-qualified.
- Added three tenant-scoped contact-center tables to SQLite and PostgreSQL schema/migration/RLS inventory. Static parity now reports 126 tables; live PostgreSQL remains unverified.
- Added security regression tests for encryption/AAD, tenant isolation, member-level conversation access, idempotent human handoff, and agent assignment.
- Re-generated CycloneDX SBOM from backend/mobile lockfiles and refreshed release provenance and current-facing version markers.
- PSTN/SIP, WhatsApp, email adapters, live provider calls, per-language speech quality and device builds still require provider credentials and external verification.

# v0.11.61 — unified hardening release

- Unified the safe runtime improvements already present in the supplied (6) package with this pre-release hardening pass.
- Added bounded Node 22 engine declaration, public source-package metadata, explicit proprietary license boundary, CI/release hardening gate, ESLint/Prettier repository configuration, and environment-only demo credentials.
- Added an explicit storage-provider contract that fails closed; only the shipped local implementation is claimed.
- Added asynchronous scrypt primitives and routed HTTP login verification through the non-blocking async path while retaining synchronous compatibility for existing internal flows.
- Added targeted regression coverage for these controls.
- PostgreSQL/RLS runtime, external identity, edge security, signed mobile artifacts, and buyer infrastructure certification remain environment-bound.

# v0.11.61 — 2026 hardening and operational value additions

- Fixed route-cardinality memory growth with normalization and a 1,000-route cap.
- Added firewall-rate bucket housekeeping.
- Corrected release SBOM attestation to the current release.
- Fixed database engine reporting and removed duplicate dead handlers.
- Upgraded password hashing and key derivation with legacy-password upgrade support.
- Hardened custom-domain resolution and session cookies.
- Added deterministic asset-health assessment, customer self-scheduling, governed agentic copilot, PostgreSQL/pgvector integration boundary, OTLP metrics, and compliance export.
- PostgreSQL live execution and infrastructure certification remain explicitly unverified until buyer-owned infrastructure is available.

# OpsCore v0.11.57 — Multi-Sector Product Audit & Release Candidate Freeze

- Executed the sector-agnostic product audit across backend runtime, Web Console, mobile source, and shipped operational tooling.
- Confirmed the product model is not tied to FTTH, telecom, or another single sector; the generic contract is exercised across facilities, construction, logistics, utilities, and property-operations scenarios.
- Generalized the service-line external reference from `network_ref` to `service_ref`; the legacy SQLite identifier remains only in the explicit v23 → v24 compatibility migration.
- Added the sector-neutrality gate and cross-sector contract regression test; both are executable release evidence.
- Added a functional Web Console Records view for tenant-scoped Customers, Sites, Assets, Inventory, and Members instead of expanding the console with decorative screens.
- Reconciled current-facing marketplace terminology to multi-sector positioning and preserved FTTH/telecom references only where they document exclusions, history, or the separate FiberOS context.
- Release decision remains conditional on live infrastructure verification; no PostgreSQL/RLS, OIDC/JWKS, production edge, signed-mobile, or physical-device certification is inferred from static evidence.

# OpsCore v0.11.57 — Final Pre-DB Release Candidate Hardening (2026-09-17)

- Completed the final independent pre-database security/release pass; **76/76 test files and 265/265 tests passed** with zero failures.
- PostgreSQL static parity is now **115/115/115** across SQLite, canonical schema and migration stream; migration preflight passes.
- Added explicit static-provenance exclusions for mutable verification evidence so release manifests cannot become stale during gate execution.
- Clean backend lockfile installation and high-severity dependency audit passed; mobile connected install remains environment-bound.
- Release candidate gate remains `PASS_WITH_CONDITIONALS`; live PostgreSQL/RLS, OIDC/JWKS, network edge, signed mobile artifacts and other deployment-bound evidence remain explicitly unverified.

# OpsCore v0.11.57 — Evidence-Governed Release Candidate Verification

- Corrected remaining current-facing documentation drift from v0.11.36 to v0.11.57 in backend README/product-scope/sales references.
- Added a per-file isolated release test runner with explicit per-test-file timeout and aggregate TAP counts, so a hanging aggregate Node test process cannot silently block release verification.
- Re-generated backend provenance after the correction and verified all 197 current backend shipped files.
- Verified 213 backend tests across 57 test files individually; 213/213 passed after provenance regeneration.
- Verified PostgreSQL schema parity at 115/115/115 tables across SQLite, canonical schema and migration stream.
- Closed an API-key scope gap on authenticated read/export routes by enforcing the `read` scope at the router boundary.
- Closed a chunked-evidence validation bypass by reapplying attachment extension, MIME and content-signature checks before commit.
- Hardened webhook SSRF protection against hexadecimal IPv4-mapped IPv6 private-address forms.
- Corrected direct invocation of the backend verification script so repository-root execution uses the backend working directory.
- No production certification, signed mobile artifacts, physical-device acceptance, store approval, or external-provider success is claimed.

# OpsCore v0.11.57 — General Domain / Release Hygiene Hardening

- Confirmed the runtime core contains no FTTH/GPON/OLT/ONT/OTDR/PON-specific business logic; industry-specific extensions remain outside the core.
- Added an automated domain-neutrality gate covering backend runtime, web client, backend scripts/tests, mobile source and SDK.
- Synchronized current-facing release markers, parity metadata and buyer documentation to v0.11.57.
- Preserved the existing field-service feature set without adding a telecom-specific dependency.
- Removed superseded HTML snapshot artifacts from the buyer release; they were historical UI snapshots, not runtime dependencies, and were capable of confusing domain-neutral positioning.
- Expanded the domain-neutrality release gate to inspect shipped executable assets for FTTH/GPON-specific runtime references.

# OpsCore v0.11.47 — 2026 High-Value Core Extensions

- Governed scheduling conflict analysis with deterministic candidate slots and explicit human-approval boundary.
- Optional OSRM adapter using a buyer-operated OSRM service via `OSRM_BASE_URL`; fails closed when unconfigured.
- Optional real Stripe PaymentIntent creation derived from persisted invoice balance; uses Stripe idempotency header and webhook-driven final settlement.
- Existing hierarchical RBAC/RLS, provenance, PostgreSQL parity, commercial quoting/invoicing, and AI Field Copilot retained.

# OpsCore v0.11.43 — Priority B (daily planning + reschedule + work pack + PM + search)

- **B1** `GET /api/v1/daily-planning-board` — delayed starts, unassigned, SLA at risk, schedule gaps ≥30m (persisted data only).
- **B2** `POST /api/v1/appointments/:id/reschedule` — requires reason; activity + audit logged.
- **B3** `GET /api/v1/dispatcher-map/v2` — optional haversine distance to site; **road ETA not claimed**.
- **B4** `GET /api/v1/work-orders/:id/work-pack` — next step, evidence, parts, safety, gate on one payload.
- **B5** `GET /api/v1/pm-templates` — preventive maintenance plans as explicit templates contract.
- **B6** `GET /api/v1/search?q=` — unified substring search (customer/site/asset/WO/technician).
- Web: planning board + search on Dispatch; work pack on WO detail.
- Zero fictional delivery/ETA claims.

# OpsCore v0.11.41 — Buyer value roadmap Priority A

Implements the buyer/programmer value map essentials without false external claims:

- **Operations Health Center** `GET /api/v1/operations-health` — DB, sync applied, outbox states, notifications, storage, runtime, correlation header note.
- **Why blocked?** `GET /api/v1/work-orders/:id/why-blocked` — human why/fix for completion gates.
- **Readable changelog** `GET /api/v1/work-orders/:id/changelog`
- **Verified Job Record** `GET /api/v1/work-orders/:id/verified-job-record` — single closeout package for buyer-facing proof.
- Web: health panel under Field map & demo; why-blocked + VJR on work order detail.
- Tests: `value_roadmap_a.test.js` + prior suites.

# OpsCore v0.11.43 — Layer B (buyer-acceptance + outbox catalog + mobile evidence status)

- **B1 Buyer acceptance expanded:** `npm run buyer:acceptance` runs PDF/signoff, notify/map, demo closeout suites + static contract checks (18/18).
- **B2 Outbox richer commercial events:** `estimate.created`, `estimate.status_changed`, `invoice.created`, `invoice.status_changed`, `invoice.payment_recorded` durable in `integration_outbox`. Catalog: `GET /api/v1/outbox/event-catalog`.
- **B3 Mobile evidence status:** local `evidence_local` queue with statuses `local → queued → committed|failed`; camera path shows status after capture.
- Prior Layer A (demo closeout, map UI, providers panel, PDF) retained.
- No fabricated delivery claims; notification/webhook still buyer-key dependent.

# OpsCore v0.11.39 — Buyer value layer A (demo closeout + map UI + providers + PDF)

- **A1 Demo closeout path:**  runs real persisted steps: customer → site → WO → appointment/check-in → evidence → PNG signoff → invoice → completion/invoice PDFs. Web button under **Field map & demo**.
- **A2 Dispatcher map UI:** web section consumes  (last check-in points only).
- **A3 Notification provider panel:** web shows configured/not-configured for email/SMS/WhatsApp (buyer keys).
- **A4 PDF quality:** header, document number, line table, totals, content SHA-256 footer — still pure stored data.
- Tests:  + prior REQ suites green.

# OpsCore v0.11.38 — REQ-01 adapters + REQ-04 map + integration notes + package hash

- **REQ-01 Notification adapters** (`backend/src/adapters/notifications.js`): SendGrid/Mailgun email, Twilio SMS/WhatsApp. Buyer env keys only. Fail-closed when not configured. Status: `GET /api/v1/notification-providers`. Deliver attempt: `POST /api/v1/notifications/:id/deliver`.
- **REQ-04 Dispatcher map**: `GET /api/v1/dispatcher-map` — latest stored appointment check-in per technician only. No continuous tracking. Manager+ only.
- **OSRM exploration**: `docs/OSRM_INTEGRATION.md` — fail-closed design; Haversine remains the certified mode.
- **Expo push investigation**: `docs/EXPO_PUSH_NOTIFICATIONS.md` — contract sketch; not claimed live.
- **Package integrity**: release ZIP ships with `INTEGRATED_SHA256SUMS.txt` regenerated over package files.
- Tests: `req_notify_dispatch_map.test.js` (4/4) + prior REQ-02/03 green.

# OpsCore v0.11.37 — REQ batch (scope truth + PDF + drawn signature)

- **Documentation truth:** `backend/PRODUCT_SCOPE.md` corrected from stale v0.4 wording; Stripe/commercial and evidence vault are listed as included; excluded items remain honest (Email/SMS/WhatsApp as buyer-adapter only, no road ETA claim, no AI).
- **REQ-02 PDF generation:** pure-JS PDF for estimate, invoice, and work-order completion package from **stored rows only**. Endpoints:
  - `GET /api/v1/estimates/:id/pdf`
  - `GET /api/v1/invoices/:id/pdf`
  - `GET /api/v1/work-orders/:id/completion.pdf`
  Response includes `x-opscore-pdf-sha256`. No fabricated amounts.
- **REQ-03 Drawn signature:** `customerSignoff` accepts optional `signatureImageBase64` (PNG only, ≤512 KiB). Stored with `signature_image_sha256`; canonical signoff hash includes image hash when present. Backward compatible without image.
- Schema **v6** additive columns on `customer_signoffs`.
- Tests: `backend/test/req_pdf_signoff.test.js` (2/2) + commercial + evidence-outbox suites green.

Not in this release (still planned per REQUIRED_ADDITIONS_STATEMENT): real Email/SMS/WhatsApp provider adapters (REQ-01), dispatcher map (REQ-04), road ETA, push, ICS, RTL UI, white-label, OIDC, Excel export.

# OpsCore v0.11.36 — Static Audit Corrections

- Fixed login account-enumeration timing branch by performing equivalent scrypt verification for unknown/inactive accounts.
- Hardened field GPS check-in with stored-site coordinate validation, <=100 m reported accuracy, and a 200 m maximum site radius; missing site coordinates fail closed.
- Corrected the contradictory mobile-login patch README wording.
- Hardened release packaging against option-like output names and nested release archives; removed the stray `--help.zip` artifact from the source tree.
- Extended webhook SSRF address filtering to RFC 5737 TEST-NET-1.
- Added regression coverage for timing-equivalence, GPS boundary enforcement and TEST-NET-1 SSRF blocking.

# OpsCore v0.11.36 — Final Due-Diligence Correction

- Corrected release documentation to report the verified 71/71 backend suite.
- No new product capability is claimed by this correction release.

**Release: v0.11.35**

## 0.11.35 — Release Artifact Hygiene

- Fixed demo attachment cleanup to target the real backend runtime store: `backend/data/files/`.
- Added a fail-closed release artifact gate that blocks packaging when runtime attachment files are present.
- Added regression coverage proving both cleanup and gate behavior.
- Added a reproducible packaging script that cleans, gates, stages, manifests, hashes, and zips the release while excluding runtime attachment storage.

## 0.11.29 — Governed Closeout

- Added completion policy version history and governance binding to completed work orders.
- Added non-mutating completion policy preview.
- Added regression coverage for policy history, preview isolation and PostgreSQL schema parity.

## 0.11.28 — Value Control Layer

- Configurable completion assurance gates with persisted proof requirements.
- Exact closeout blocker endpoint.
- Procedure evidence tenant/work-order validation.
- 62/62 backend verification maintained.

# OpsCore v0.11.25 — Sale Hardening Changelog

## Fixed

### Offline sync failure isolation
The previous sync contract executed an entire batch inside one transaction. One deterministic business failure could therefore roll back valid neighboring events and leave the mobile queue blocked.

The release now uses a savepoint per event. Each event gets an explicit result: `applied`, `duplicate`, or `failed`. Permanent domain failures are identified as non-retryable; retryable failures remain pending.

### Mobile failed-event quarantine
The mobile client now preserves permanent sync failures in `sync_failed` instead of leaving them in the main pending queue. The Sync Center exposes these failures and provides an explicit retry action.

## Not claimed

This release does not claim offline attachment synchronization, signed Android/iOS artifacts, physical-device certification, PostgreSQL production parity, or production certification.

## 0.11.36 hardening pass — 2026-09-12

- Added explicit SQLite schema versioning (`PRAGMA user_version`, current version 2) with fail-closed rejection of databases newer than the code.
- Added persisted idempotency records for critical direct Work Order update, governed transition, comment, and evidence writes.
- Added stable direct-write replay semantics via `Idempotency-Key` / `X-Idempotency-Key` and documented `IDEMPOTENCY_KEY_REQUIRED` / `IDEMPOTENCY_KEY_REUSED`.
- Normalized offline sync event results so `applied`, `duplicate`, and `failed` carry explicit retry/error fields.
- Expanded the HTTP error-code map for existing validation and field-operation errors without introducing new dependencies.
- Added regression coverage for schema versioning, sync response contract, and all four critical direct-write idempotency paths.
- Updated buyer/commercial wording to state the non-exclusive source sale and the 30-day critical-defect support boundary.

## 2026-09-12 — Buyer-value hardening
- Added bounded server-side work-order search/filtering.
- Added tenant-scoped unified work-order timeline endpoint and console rendering.
- Added HTTP and store regression coverage.
- Browser critical work-order mutations now send real idempotency keys.
- No synthetic data or cosmetic-only feature code added.

## 0.11.36 customer-value hardening
- Added deterministic per-work-order operational risk evaluation with explicit weighted reasons and tenant scope.
- Added deterministic daily operations brief aggregating active work, due-today work, appointments, no-shows, urgent/high unassigned work, open escalations and elevated-risk queue from persisted records only.
- Added authenticated HTTP routes for both views and web-console rendering without synthetic forecasts or AI claims.
- Added store-level and HTTP integration tests for both contracts; no new database tables or external runtime dependencies were introduced.


## Customer-coherence hardening — FINAL6 follow-through
- Added a server-owned `opscore.client-contract.v1` endpoint covering web, Android and iOS surface roles, sync semantics, idempotency requirements and versioned contracts.
- Enriched `opscore.field-today.v1` with server-owned operational risk and deterministic `recommendedAction` signals so mobile execution follows the same decision authority as the web console.
- Web and Expo clients validate the shared contract before treating the backend as compatible.
- Expo critical work-order writes now self-issue a real idempotency key when the caller does not provide one, aligning Android/iOS behavior with the web console without duplicating business rules client-side.
- Added regression tests proving contract parity and field action/risk propagation. No synthetic records or probabilistic decisions were introduced.

## Customer coherence hardening
- Canonical domain contract and machine-readable compatibility negotiation are server-owned.
- Critical rejection responses expose structured `reasons[]`; completion packages carry an integrity hash and completion assurance.
- Owner/admin-only read-only operational doctor reports real database, audit, sync-record, webhook, and contract state.
- Field recovery semantics remain explicit: applied/duplicate remove local events; retryable failures remain queued; terminal failures are quarantined.

## FINAL8 customer continuity hardening
- Added canonical domain lifecycle and machine-readable compatibility negotiation with fail-closed mobile version checking.
- Added structured rejection `reasons[]` for critical workflow failures.
- Strengthened completion package with completion assurance and SHA-256 package integrity.
- Added owner/admin read-only Operational Doctor for real database, audit, sync-record, webhook, and contract diagnostics.
- Preserved existing dry-run import and explicit offline recovery semantics.

## v0.11.36 — Employee-first operational continuity
- Added a real role-aware operational cockpit at `/api/v1/operations/cockpit` for owner/admin/manager/member workflows.
- Added server-owned next-action reasoning from persisted assignment, appointment, status and completion-assurance facts.
- Added tenant-scoped read-only work-order handoff packets at `/api/v1/work-orders/{id}/handoff` so responsibility can move between staff without reconstructing context manually.
- Web console now shows the role cockpit and handoff context.
- No synthetic tasks, AI predictions, automatic remediation, road ETA claims, or external infrastructure were introduced.

## Runtime-boundary hardening — 2026-09-12
- Work-order number allocation is now serialized with a database write lock so concurrent creates cannot race the next-number read.
- `on-my-way` is state-idempotent: repeating the same request after reaching `en_route` does not create duplicate operational activity or audit entries.
- Expo API requests now have a bounded 15-second default timeout; timeout remains an explicit failure instead of an invented success.
- PostgreSQL canonical schema parity now includes the persisted idempotency-record table required by the critical-write contract.
- No production PostgreSQL, network, device, or infrastructure certification is claimed by these local checks.


## OPSCORE Builder integration
- Integrated an authenticated Build workspace into the real web operations console.
- Live preview consumes persisted OPSCORE API data rather than synthetic dashboard values.
- Safe transformation recipes fail closed when no supported implementation exists.


## v0.11.36 — commercial value layer
- Added tenant-scoped estimates with line items, deterministic totals and explicit acceptance lifecycle.
- Added one-time accepted-estimate to work-order conversion.
- Added tenant-scoped invoices with line items, status governance and manual payment recording.
- Added PostgreSQL parity schema and explicit no-payment-gateway claim.
- Added dedicated tenant isolation and lifecycle regression tests.

## v0.11.57
- Added Platform Intelligence Layer: tenant-scoped operational digital twin with SHA-256 state provenance.
- Added Decision Replay / Why records with deterministic provenance verification.
- Added bounded deterministic scenario simulation for demand/capacity what-if analysis.
- Added skill certification records, expiry/revocation handling, skill matching, and appointment-based capacity visibility.
- Added deterministic Recommendation Gateway with explicit AI-not-configured state and human-approval boundary.
- Added PostgreSQL migration 021 and SQLite schema migration 21.
- Added focused automated tests for integrity and cross-tenant decision isolation.

Added operational deadlock analysis, bounded closure-report chunking, tenant-scoped cryptographic protection with deterministic HMAC lookup index, and backend parity heartbeat checks.

## 0.11.56 — Evidence-Governed Operational Autopilot

- 0.11.56: Operational Intelligence Fabric added: deterministic incident simulator, causal evidence linkage graph, guardrails, governed stale-worker recovery, outcome/learning loop, and `opscore demo` buyer demonstration.


## 0.11.56 — Evidence Trust Layer

- Added a read-only Operational Evidence Center aggregating current signals, latest evidence graph, decisions, outcomes, simulations, and integrity status.
- Added a non-executable Operational Replay Package with deterministic package SHA-256.
- Added operational evidence integrity verification for audit chain, causal-graph digests, and outcome digests.
- Added an Autopilot Safety Contract that makes policy and approval invariants machine-checkable before execution.
- Added authenticated HTTP endpoints and regression coverage for the new evidence/trust surfaces.
- No production certification, external dependency certification, or statistical causality claim is introduced by these additions.
