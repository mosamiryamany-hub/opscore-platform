## 0.11.62 — GPS permission policy correction

- Allow same-origin geolocation through the browser Permissions-Policy so the opt-in technician GPS flow can request location after user consent.
- Keep camera and microphone disabled; this does not bypass HTTPS, browser permission prompts, application authentication, or opt-in controls.
- Add regression coverage for Vercel static headers and backend response headers.

## 0.11.62 — Digital Twin Integrity Hardening Candidate

- Hardened the domain-neutral twin-state validator against lossy JSON values, cycles, sparse arrays, symbol properties, getters, and post-hash nested mutation.
- Protected in-memory event-chain records from modification through returned object references; bounded event count and payload size.
- Added persisted operational twin v2 aggregates over existing tenant-scoped records: work-order priorities, asset types/events, maintenance plans, invoices, and integration outbox states.
- Added tenant-scoped snapshot history and re-verification APIs; snapshot capture now uses the existing idempotent-write contract.
- Corrected source-derived API inventory parsing so route methods are bounded by the next route selector; synchronized OpenAPI and removed stale source-derived methods.
- Verification boundary: focused tests exercise SQLite persistence, HTTP authorization, idempotent replay, cross-tenant denial, and hash mismatch detection. This does not provide WORM storage, signed snapshots, live sensor feeds, predictive physics, PostgreSQL/RLS runtime proof, or production certification.

## 0.11.61 — Combined hardening waves merged

- Strict production bootstrap (regions/structure persisted as versioned configs, 12+ char owner password), post-auth tenant fingerprinting (`TENANT_MISMATCH`), viewer/read-only mutation guard, zero re-visit scheduling, technician availability endpoint, line-migration engine v3 (readiness, en-route block, unreachable path, lineage + chain), appointment unreachable/revisit queue, faults engine (classify, create, gated transition, unreachable, offline sync).
- Post-merge fixes: technician-conflict precedence and in-transaction re-visit check; valid default fault priority; nest-aware `createWorkOrder`.
- Added 9 tests (`combined_hardening_0_11_61.test.js`); mutation-route policy 28 → 35 entries; API inventory and OpenAPI regenerated.
- See `docs/COMBINED_HARDENING_WAVES_0.11.61.md`. No schema change; pre-infrastructure truth boundaries unchanged.

## 0.11.56 — Deep Sync / Contextual RLS + Security Hardening

- Added atomic sync envelope with persisted block identity/hash and replay-safe block reuse checks.
- Accepted field sync events now emit an integration-outbox event and a bounded worker job in the same transaction.
- Added PostgreSQL/PostGIS contextual RLS deployment migration for technician geofence (50 m) and appointment time-window enforcement.
- Closed an API-key scope gap on protected read/export routes by enforcing `read` for API-key GET/HEAD/OPTIONS requests at the authenticated router boundary.
- Closed an evidence-upload validation gap: chunked uploads are revalidated against the same filename/MIME/content-signature policy as direct attachments before commit.
- Hardened webhook SSRF filtering for hexadecimal IPv4-mapped IPv6 literals that encode private IPv4 targets.
- Corrected release verification invocation so `scripts/verify.js` resolves its checks relative to `backend/` even when invoked from the repository root.
- No CRDT, zero-collision guarantee, autonomous reassignment, or measured cost reduction is claimed by this release.

# Changelog

## 0.11.56 — Evidence-Governed Operational Autopilot
- Added a deterministic Operational Intelligence Fabric over the existing Platform Intelligence Layer.
- Added local incident simulation for outbox backlog, worker degradation, geofence anomalies, runtime failure, capacity pressure, dependency outage, and cascading worker failure.
- Added an evidence-linkage causal graph spanning signals, events, resources, dependencies, impacts, decisions, and measured outcomes. The graph explicitly describes provenance links, not statistical proof of causality.
- Added tenant-scoped guardrail policies with `suggest`, `approve`, and `deny` modes, safe-mode gating, and optional maximum-change bounds.
- Extended governed autopilot proposals with guardrail evaluation and a real, approval-gated stale-worker lease recovery action.
- Added outcome recording and deterministic learning summaries for resolved/partial/unresolved/unverified actions.
- Added `opscore demo --scenario cascading-worker-failure` as a local, isolated demonstration command.
- Added API endpoints for simulations, evidence graphs, guardrails, outcomes, and learning summaries.
- Truth boundary: local simulation and SQLite execution remain demonstration evidence; this does not certify production infrastructure, PostgreSQL/PostGIS runtime, external dependencies, signed mobile builds, or store acceptance.

## v0.11.56 — General Operational Controls, Governed Commands, Tenant Domains & Protected Local Memory

- Added allow-listed slash command execution for operational status actions.
- Added tenant-scoped encrypted local agent memory using AES-256-GCM.
- Added verified/active custom domain registry and host resolution contract.
- Added independent closure-sheet digest verification endpoint.

## v0.11.49 — Universal Worker, Closure Compilation & Security Boundary Hardening

- Multi-queue operational worker with governed billing reconciliation.
- General daily closure-sheet compilation with persisted digest and blocker state.
- Firewall proxy trust and malformed-URI hardening.

# OpsCore v0.11.43 — 2026 High-Value Field Operations Extensions

- Added optional, fail-closed OpenAI Responses API Field Copilot with structured output, context hashing, PII redaction and explicit data-minimization controls.
- Added tenant-scoped offline sync conflict center with guarded retry/acknowledge flows.
- Added transactional technician time/labor tracking, atomic stop semantics and database-enforced single running entry per technician.
- Work-order financial value now exposes tracked labor without fabricating values; manual labor inputs remain authoritative when supplied.

# OpsCore v0.11.36 — Adversarial Continuity Hardening

- Added idempotency enforcement to direct appointment updates and tenant-bound regression coverage.
- Fixed the mobile offline `On My Way` retry path: it now queues `appointment_on_my_way` instead of misclassifying the action as GPS check-in.
- Added SQLite schema v3 -> v4 migration coverage for the new sync operation without losing existing sync events.
- Switched mobile client-event identifiers to platform `crypto.randomUUID()` when available.
- PostgreSQL schema parity remains schema-only; no PostgreSQL runtime certification is claimed.

# OpsCore v0.11.36 — Due-Diligence Integrity Correction

- Corrected the release scope test count to the actual 71-test backend suite.
- Added a final buyer-due-diligence consistency pass; no runtime feature claims changed.

## 0.11.35 — Release Artifact Hygiene

- Added fail-closed root buyer-document release gate.
- Consolidated current buyer-value narrative into `BUYER_VALUE_DOSSIER.md`; historical uplift notes moved under `docs/history/sale-value/`.
- Corrected historical filename/version mismatches in sale uplift notes.
- Made PostgreSQL parity result self-describing as schema-only with `runtimeVerified: false`.
- Added a fail-closed release artifact gate for `backend/data/files/` and excluded that runtime storage tree from release packaging.
- Corrected guarded demo-data cleanup to target the actual backend runtime attachment directory and verify removal.
- Added regression coverage for generated attachment artifacts and packaging exclusion.

## 0.11.33 — Audit Provenance Control

- Added read-only tenant audit-chain verification with tamper detection.
- Strengthened backup verification with foreign-key checks.

## 0.11.31 — Governed Closeout

- Versioned completion policies and recorded the governing policy version on closeout.
- Added policy history and non-mutating preview endpoints.

## 0.11.28 — Completion Assurance

- Added tenant-scoped configurable completion assurance policies.
- Work-order completion can now be blocked until configured evidence, customer sign-off, safety acknowledgement, and/or guided procedure completion exists.
- Added read-only completion assurance evaluation endpoint for pre-closeout visibility.
- Validated procedure-step evidence against the owning work order and organization.
- Added automated closeout-gate and tenant-isolation regression coverage.

# OpsCore v0.11.27 — Buyer Value Uplift

- Added verified work-order Evidence Package with attachment re-hashing and canonical SHA-256.
- Added customer migration dry-run endpoint with zero-write validation.
- Added executable tenant security proof.
- Added offline sync chaos regression and buyer demo script.
- Updated OpenAPI and release gates.

# OpsCore v0.11.25

## Sale hardening

- Offline sync batches now isolate invalid events with database savepoints instead of rolling back valid neighboring events.
- Mobile sync now consumes per-event results, quarantines permanent failures, and preserves retryable failures for later delivery.
- Added mobile EAS build profiles and a reproducible-build contract without claiming signed artifacts or physical-device certification.
- Added buyer evidence and commercial handoff documentation for technical due diligence.
- PostgreSQL production parity remains explicitly unverified.

## 0.11.24 — Operational Loop & Field UX Hardening

- Added technician-scoped Today Mission and visible Sync Center.
- Added secure On My Way appointment transition and verified completion-package endpoint.
- Added manager Dispatch Board and customer-scoped live work-order view.
- Added safety-checklist mobile contract using existing server-authoritative checklist APIs.
- Updated buyer-facing web console with dispatch/attention views and explicit truth boundaries.
- No new external provider is claimed as live; maps, messaging and store signing remain environment-dependent.

## 0.11.23 — Mobile Check-in Entity Binding Hardening

- Fixed the field mobile check-in sync contract so `appointment_checkin` uses the real appointment ID as the sync event entity ID.
- Added a mobile verification assertion preventing regression to work-order-ID binding for appointment check-in.
- No backend runtime contract change; existing server-authoritative appointment/technician/GPS validation remains authoritative.

## 0.11.22 — Mobile Backend Integration & Atomic Sync

- Integrated the native mobile-login HTTP route into the bundled backend instead of requiring a separate patch.
- Made each offline sync batch atomic: an event failure rolls back earlier events in the same batch.
- Added regression coverage for the real mobile-login route contract and sync rollback behavior.

## 0.11.20 — Stripe Invoice State Consistency Hardening

- Fixed a billing-state integrity flaw where `invoice.paid` could reactivate a locally canceled subscription, or `invoice.payment_failed` could downgrade the subscription state independently of the authoritative subscription webhook state.
- Invoice events are now persisted/idempotent and audited without mutating the authoritative subscription status or entitlements.
- Added regression coverage proving paid/failed invoice events cannot resurrect or downgrade a canceled subscription.
- No live Stripe account, payment collection, PostgreSQL production certification, or production billing certification is claimed.

## 0.11.18 — Stripe Billing Security Hardening

- Harden Stripe webhook tenant binding: webhook metadata can no longer establish or redirect tenant ownership; established Stripe customer/subscription links must agree.
- Reject invalid negative/non-safe Stripe event timestamps and require a valid positive event.created at the HTTP webhook boundary.
- Preserve monotonic last-event timestamps when internal callers omit an event timestamp.
- Added regression coverage for tenant-claim, identity-replacement, and timestamp validation attacks.

## 0.11.17 — Stripe Billing State Adapter

- Added verified Stripe webhook signature validation with timestamp tolerance.
- Added tenant-scoped Stripe customer/subscription state and idempotent event persistence.
- Added explicit owner/admin Stripe customer linking.
- Connected verified subscription metadata to the existing entitlement store when valid metadata is supplied.
- Added invoice paid/payment-failed state synchronization and audit events.
- Added protection against conflicting event replays and stale out-of-order events.
- Added regression tests for signature validation, idempotency, stale events, tenant resolution, and customer-linking isolation.
- No Stripe checkout/payment collection or production billing certification is claimed.

# 0.11.16

- Hardened entitlement/usage enforcement: configured limits are now enforced atomically by the usage counter path.
- Added validation for non-negative safe-integer entitlement limits and a deterministic `ENTITLEMENT_LIMIT_EXCEEDED` error.
- Added regression coverage for quota enforcement.

# Changelog

## 0.11.15 — Release Integrity & Documentation Gate Hardening

- Restored mandatory release provenance artifacts: `SALES_PACKAGE_MANIFEST.json`, `RELEASE_FILE_SHA256SUMS.txt`, and `RELEASE_COMPONENT_SHA256SUMS.txt`.
- Hardened `scripts/verify.js` so missing or malformed integrity artifacts produce explicit failed checks instead of an early process crash.
- Release verification now validates the manifest file set, SHA-256 digests and byte counts against the extracted package.
- Added the missing `docs/FINAL_INTEGRATION_AUDIT_0.11.13.md` entry to the historical/pinned document policy and restored that audit byte-for-byte from v0.11.13.
- No runtime product behavior changed.
- Node engine remains `>=22.23.2`; the current verification host is Node `22.16.0`, so engine compatibility is not claimed by this host.

## 0.11.11


## 0.11.12 — Session continuity hardening

- Restores an authenticated console session after page reload by validating the HttpOnly session cookie through `GET /api/v1/me`.
- Removes the ineffective `document.cookie` check for the HttpOnly session cookie.
- Keeps the session token out of JavaScript storage and adds release checks for session-restore behavior and lockfile/version alignment.
- Added a real HTTP smoke suite covering all static console GET routes and key dynamic work-order interactions.
- No runtime feature behavior changed; this release closes an integration-test coverage gap discovered during final buyer audit.

# Changelog

## 0.11.14 — Release documentation consistency hardening

- Corrected the current-facing `docs/COMMERCIAL_HANDOFF.md` release marker from the stale `v0.5.0` label to `0.11.14`.
- Added `docs/RELEASE_DOCUMENTATION_POLICY.json` with an explicit allowlist separating current-facing release documents from historical/pinned artifacts.
- Strengthened `verify.js` to validate the allowlisted current-facing documents by exact required heading, rather than relying on generic version-number regex matches.
- Historical/pinned documents such as `DEMO_GUIDE.md`, archived release notes, and versioned audit records are intentionally not rewritten.
- No runtime product behavior changed.


## 0.11.13 — Session restore UX hardening

- Keeps HttpOnly-cookie session restoration through `GET /api/v1/me`.
- Fixed a new regression where an unauthenticated silent session probe automatically opened and scrolled to the login form on the public landing page.
- Login UI remains explicitly user-initiated.
- Added regression coverage for the public landing-page behavior.
- Node requirement remains `>=22.23.2`; the current verification host is Node `22.16.0`, so engine compatibility is not claimed by this host.



## 0.11.12 — Session continuity hardening

- Restores an authenticated console session after page reload by validating the HttpOnly session cookie through `GET /api/v1/me`.
- Removes the ineffective `document.cookie` check for the HttpOnly session cookie.
- Keeps the session token out of JavaScript storage and adds release checks for session-restore behavior and lockfile/version alignment.


## 0.11.11 — Customer Portal HTTP Integration Fix

- Added the missing `POST /api/v1/portal/exchange` server route used by `web/portal.js`.
- Exchanges the one-time bootstrap token into a scoped HttpOnly portal cookie.
- Portal overview and appointment routes accept the scoped portal cookie or bearer token.
- Added OpenAPI documentation for the exchange route.
- Added an end-to-end HTTP regression test covering bootstrap, exchange, cookie scope, overview access, and one-time replay rejection.
- Release inventory increased from 92 to 93 discovered API routes.

## 0.11.11 — Final release hygiene
- Synchronized current release metadata across package, VERSION, OpenAPI, README and commercial sales kit.
- Made the generated API inventory deterministic so repeated verification does not mutate release hashes.
- Final buyer artifact audit found no credential-like secrets in the packaged source and `npm audit --omit=dev` reported 0 vulnerabilities.
- No runtime feature behavior was changed in this patch.


## 0.11.8 — Security Deep Pass
- Closed cross-tenant foreign-reference integrity gaps for work-order create/update and site/customer association.
- Bounded route planning to 100 unique work-order IDs and classified it as a read-scoped API operation.
- Added regression coverage and release gates for these controls.
- No production certification claims added.
## 0.11.6
- Closed webhook SSRF targets with DNS resolution + pinned HTTPS delivery and redirect rejection.
- OIDC configuration now fails closed until a real verifier exists.
- Normalized webhook delivery errors to safe codes.
- Added regression tests for SSRF and OIDC fail-closed behavior.

## 0.11.5 — Canonical release metadata correction

- Fixed stale 0.11.1 current-release markers discovered by direct archive inspection.
- Added release verification for README/UI current-version drift.

# Changelog

## 0.11.3 — Cross-tenant authorization fix and test-hygiene fix

See `RELEASE_NOTES_0.11.3.md` for full detail. Summary:

- **Critical fix:** `createPasswordReset` allowed an org admin to mint a
  password-reset token for a user in a *different* organization, enabling
  full cross-tenant account takeover. Now requires the target user to be a
  member of the caller's organization. Same fix applied to
  `assignUserToUnit`, which had the same missing check for a lower-severity
  cross-tenant object reference.
- **Fixed:** ~15 mutating endpoints missed the router-level API-key scope
  check added in 0.11.2 (`POST /api/v1/webhooks`, `PUT
  /api/v1/entitlements`, `POST /api/v1/api-keys`, `POST
  /api/v1/admin/password-reset`, hierarchy units/memberships, financial
  settings, safety checklists, workflows, escalation rules, procedures, SLA
  policies, inventory locations/parts, portal access, session revocation,
  notification-read). Two of these (`revokeSession`,
  `markNotificationRead`) had no authorization check at all beyond resource
  ownership, so a read-only API key could call them.
- **Fixed:** the attachment storage root was frozen at module load time,
  so tests that tried to isolate file writes into a temp directory were
  silently ignored and wrote real files into the package's own
  `data/files/` on every `npm test` run — the exact issue 0.11.2's
  changelog entry below claimed was already resolved. A second test file
  wrote SQLite databases directly into `./data/` with no cleanup of the
  directory itself. Both fixed; the project directory is now verified
  clean across repeated test runs.
- **Added:** `test/security_cross_tenant.test.js` — regression tests for
  the two IDOR fixes above, each confirmed to fail against the
  pre-fix code.

## 0.11.2 — Independent security audit fixes

An external code review found that the advertised "scoped API keys" security
feature was not consistently enforced, and that two authenticated actions had
no role check at all. All findings below are fixed and covered by a new
regression test (`test/security_scopes.test.js`) that runs the real HTTP
server and exercises a read-only API key against every endpoint listed.

- **Fixed:** API-key scope enforcement (`requireScope(ctx,'write')`) was
  missing at the router level on ~20 mutating endpoints (appointments,
  inventory receive/reserve/consume, customer sign-offs, offline sync,
  asset events, CSV/JSON customer import, contracts, warranties,
  maintenance plans, safety acknowledgements, procedure runs, escalation
  evaluate/acknowledge/resolve, maintenance evaluate, control-tower actions,
  work-order financials, technician profile/skills, usage counters, and
  webhook-delivery triggering). A `read`-only API key could previously
  perform all of these writes because the underlying store-layer check only
  verifies organization role, and API-key contexts are always assigned
  role `member` regardless of their granted scope. Every one of these
  routes now checks the key's scope before calling the store.
- **Fixed:** `incrementUsage`, `deliverWebhook`, `evaluateMaintenance` and
  `evaluateEscalations` had no authorization check whatsoever beyond
  organization membership (any authenticated session or API key of any
  scope could call them). They now require the `write` role/scope like
  other mutating operations.
- **Added:** login throttling. Password login had no brute-force
  protection. After 8 failed attempts for the same email within 15
  minutes, further attempts (including with the correct password) are
  rejected with `429 LOGIN_RATE_LIMITED` for 15 minutes. This is an
  in-process, single-instance mitigation — as with the rate limiting noted
  elsewhere in this package, a multi-instance deployment still needs a
  shared/distributed store for this to hold across instances.
- **Removed:** leftover local test-fixture files under `data/files/` that
  were accidentally included in the shipped package despite `data/` being
  listed in `.gitignore`. Contents were non-sensitive placeholder text, not
  real customer data, but they should not have shipped in a "clean source
  ZIP".

## 0.11.1

Security/release hardening derived from v0.11.0 review:
- fixed console rendering contract for persisted Value Intelligence and Control Tower data
- synchronized release/OpenAPI/manifest versions
- switched browser console authentication to HttpOnly session cookie transport
- converted portal access-link bootstrap into one-time token exchange with URL scrubbing
- externalized portal JavaScript to enable CSP enforcement
- strengthened attachment input validation and signature/MIME checks
- added release contract verification checks

## 0.9.0
- Added explicit Control Tower remediation actions: reassign, reschedule, acknowledge and resolve.
- Added correlation ID response boundary for API requests.
- Control Tower now exposes recommended operator actions without autonomous remediation.
- Added security test coverage for explicit actions and tenant scoping.

## 0.7.0
- Operational Value Engine, Exception Control Tower, contracts/warranty, preventive maintenance and safety controls.
- Monetary calculations require buyer-provided inputs; no synthetic defaults.

# Changelog

## 0.6.0 — Operational Intelligence & Control
- Added persisted operational intelligence metrics: completion rate, average cycle time, SLA compliance, technician/appointment and inventory indicators.
- Added configurable work-order workflow definitions and transition audit trail.
- Added SLA escalation records with evaluate/acknowledge/resolve lifecycle.
- Added guided procedure definitions and ordered procedure runs for field execution.
- Added service-history aggregation across customer, site, asset and work order.
- Added buyer-facing operational intelligence console section.
- No synthetic forecasts, AI claims, external provider success, or production certification added.


## 0.5.0
- Added buyer-oriented responsive operations console without external frontend runtime dependencies.
- Added navigation between overview, work orders and security views.
- Added work-order search, stronger operational summary cards and clearer security posture display.
- Added explicit session sign-out endpoint with session audit entry.
- Added stronger default HTTP security headers: X-Frame-Options and Permissions-Policy alongside existing no-sniff and referrer policy.
- Added commercial handoff documentation.
- Preserved explicit production boundaries and no-provider-success claims.

## 0.4.0
- Scheduling, SLA, dispatch, inventory, customer portal and offline sync.

## 0.10.0 — Evidence-Based Decision Engine
- Added decision engine derived from persisted SLA, appointment, technician-load and repeat-visit exceptions.
- Added explicit data-sufficiency and confidence fields; incomplete financial data remains unestimated.
- Added human-approval policy and explicitly disabled autonomous remediation.
- Added `/api/v1/decision-engine` and OpenAPI documentation.
- Added regression coverage for non-fabricated financial impact.

## 0.11.4 — Canonical security + value merge
- Merged the v0.11.3 security-fixed authorization regressions into the buyer-value line without dropping the fixes.
- Added guarded `npm run reset:demo` for local evaluation only.
- Added customer CSV fixtures and an intentionally invalid fixture for validation testing.
- Added a canonical release verification document for the merged artifact.

## 0.11.7 — Resource & API Assurance
- Added bounded HTTP URL/body resource controls.
- Added bounded high-volume list queries and export limits.
- Added generated API inventory from the actual HTTP route table.
- Added resource/API regression tests and buyer-facing assurance documentation.

## v0.11.48 — Operational Queue, Line Cutover & Reconciliation

- Added tenant-scoped operational background job queues with leases and dead-letter state.
- Added service-line cutover preflight, atomic state transition, post-check and administrative rollback.
- Added browser-side request preflight as an early validation layer; server authorization remains authoritative.
- Added a persisted invoice payment ledger with idempotent API payment recording.
- Added local ledger reconciliation and an optional real Stripe PaymentIntent reconciliation path; remote state is never fabricated when Stripe is not configured.
- Added PostgreSQL canonical parity for all v0.11.48 tables.

## 0.11.56
- Worker resource guard and throttling.
- Tenant-scoped geofencing.
- Hierarchical signature-chain role evidence and sequential levels.
- Safer privacy purge with explicit ephemeral-memory cleanup and zeroization of registered Buffers.
