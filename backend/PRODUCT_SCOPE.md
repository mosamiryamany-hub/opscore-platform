# Product scope — OpsCore v0.11.62

## Core included (verified in this package)

- Multi-tenant organization model and RBAC (owner/admin/manager/member/viewer)
- Invitations, sessions, API keys/scopes, rate-limit boundary
- Customers, sites, assets, GIS-ready locations
- Work orders, comments, activity, audit chain with provenance hashes
- Attachments with integrity verification (SHA-256); Offline Evidence Vault (chunked, resumable, quarantine on mismatch)
- Custom fields and saved operational views
- SLA policies and live SLA risk evaluation
- Technician profiles, skills and dispatch candidates
- Appointment scheduling with technician conflict protection
- Straight-line route planning based on real coordinates (not road ETA)
- Parts, stock locations, stock receiving, reservation and consumption
- Customer portal access tokens and appointment rescheduling
- Customer sign-off with SHA-256 integrity metadata (optional drawn signature image supported from v0.11.37)
- Offline/mobile synchronization queue with idempotent client event IDs and per-event failure isolation
- Integration outbox for domain events (queued delivery ledger)
- Runtime observability surface (structured health/metrics style readout)
- Commercial layer: estimates (quotes), invoices, payment recording
- Stripe billing webhook integration (buyer-provided keys; not a free hosted processor)
- Hierarchical org units, completion policies, governed workflow transitions
- Control tower / cockpit / handoff / decision engine (transparent weighted reasons)
- CSV and organization JSON export with integrity hash
- OpenAPI-oriented HTTP API surface
- Evidence-Governed Operational Autopilot: deterministic incident simulation, evidence-linkage graph, tenant-scoped guardrails, approval-gated recovery, replay package and outcome learning

## Intentionally excluded / not certified

- AI runtime / predictive failure models / autonomous remediation
- Production SSO / OIDC certification (fail-closed placeholder only unless buyer configures a real IdP)
- Real third-party Email / SMS / WhatsApp delivery as a hosted service (buyer adapter + buyer keys required; package provides outbox/webhook ledger only)
- S3 / object-storage provider certification
- Live road routing / traffic ETA provider (straight-line Haversine only unless buyer wires an external routing engine)
- Production PostgreSQL / PostGIS runtime certification (parity scripts exist; not a certified production deployment)
- Signed mobile store artifacts, physical-device acceptance, App Store / Play approval
- Legal WORM immutability, production DR RPO/RTO certification

## Honesty boundary

The local runtime is a real SQLite execution environment for development, buyer validation, and demonstration. PostgreSQL/PostGIS, external identity, secrets, TLS/ingress, distributed rate limiting, external notification providers, object storage, and production operations still require buyer-environment integration and verification. No capability is claimed unless it is present in code and covered by executable tests in this package.
