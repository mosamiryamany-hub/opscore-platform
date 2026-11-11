# OpsCore — Operational SaaS Starter Kit v0.11.62

OpsCore is a reusable multi-sector operational application foundation for field service, maintenance, facilities, construction, utilities, logistics, asset management and GIS-ready workflows.

## Operational flow

`Customer -> Site -> Work Order -> Assignment -> Schedule -> Field Execution -> Evidence -> Sign-off -> Completion -> Audit`

## Included

- Buyer-oriented responsive operations console with overview, work-order, records, security, value-intelligence and control-tower views
- Explicit session logout with audit entry and stronger default HTTP security headers

- Multi-tenant organizations, invitations and RBAC
- Customers, sites, assets and GIS-ready locations
- Work orders, comments, activity timeline, audit and evidence attachments
- API keys, scopes, expiry/revocation, rate-limit boundary and security center
- Entitlements, usage metering, custom fields, saved views and soft delete/restore
- SLA policies and runtime SLA-risk evaluation
- Technician profiles and skills
- Appointment scheduling with real overlap protection
- Dispatch candidate ranking using skills, current appointment load and coordinate distance
- Coordinate route planning using Haversine straight-line distance (no road ETA claim)
- Parts catalog, stock locations, receiving, reservation and consumption
- Scoped customer portal access using one-time bootstrap exchange and HttpOnly portal session, plus appointment rescheduling
- Customer sign-off with SHA-256 integrity metadata
- Idempotent field/offline sync endpoint
- OpenAPI and CSV transfer
- Evidence-Governed Operational Autopilot: deterministic incident simulation, evidence-linkage graph, tenant-scoped guardrails, approval-gated recovery and outcome learning

## Runtime truth

Local/dev persistence defaults to Node's built-in `node:sqlite`. The Vercel serverless entry point (`api/index.js`) explicitly selects `DATABASE_ENGINE=postgres`; `backend/src/db-open.js` then opens the PostgreSQL adapter through the synchronous bridge. The `pg` runtime driver is pinned as `pg@8.23.1` in the repository-root `package.json` and `package-lock.json`, and the Vercel install command uses `npm ci`. SQLite is loaded lazily only when the SQLite engine is selected.

CI includes PostgreSQL HTTP acceptance and RLS tests against an isolated acceptance database. Those tests establish the tested source path, not proof that the current Vercel production deployment uses the intended commit or least-privilege role. The actual Vercel `OPSC_DATABASE_URL` role, production session/tenant boundary and production recovery remain unverified; production certification is not claimed.

PostGIS is available in the inspected Neon production catalog, but that does not supply a licensed map/road-routing service or traffic ETA. The package does not pretend to deliver email, SMS, WhatsApp, external webhooks, S3, enterprise SSO or billing without real provider integration and buyer-environment verification.

## Run in 5 minutes

Use Node `>=22.23.4 <23` as declared by `package.json` and `.nvmrc`.

```bash
npm ci
# SQLite-only demo: remove PostgreSQL connection settings from this shell.
unset DATABASE_ENGINE OPSC_DATABASE_URL DATABASE_URL
# Set OPSC_DEMO_PASSWORD_ADMIN, OPSC_DEMO_PASSWORD_DISPATCHER,
# OPSC_DEMO_PASSWORD_TECHNICIAN and OPSC_DEMO_PASSWORD_VIEWER locally (12+ chars each).
npm run seed:demo
npm run dev
```

Then open `http://127.0.0.1:3000` (or the port configured by `PORT`).

The demo seed is **SQLite-only** and refuses to run when `DATABASE_ENGINE=postgres` or a database URL is configured. Do not use it for PostgreSQL or real customer activation. Do not run `seed:demo` when `DATABASE_ENGINE=postgres`; use the real-owner `npm run bootstrap` flow instead.

For PostgreSQL, apply migrations using the separate `OPSC_MIGRATION_DATABASE_URL` owner connection. Keep `OPSC_DATABASE_URL` on the least-privilege `opscore_runtime` role. Run the one-time CLI bootstrap with a separate `OPSC_BOOTSTRAP_DATABASE_URL` authenticated as `neondb_owner`, plus `OPSC_BOOTSTRAP_ORG_NAME`, `OPSC_BOOTSTRAP_CEO_EMAIL` and a privately supplied `OPSC_BOOTSTRAP_CEO_PASSWORD`. Never place migration or bootstrap credentials in Vercel runtime; remove/rotate the bootstrap credential after initialization. The production HTTP bootstrap route is disabled.

### Demo accounts

| Account | Functional role | Purpose |
|---|---|---|
| `admin@demo.opscore.invalid` | Owner | Full organization administration |
| `dispatcher@demo.opscore.invalid` | Manager | Operational scheduling/assignment permissions |
| `tech@demo.opscore.invalid` | Member | Field-operation permissions |
| `viewer@demo.opscore.invalid` | Viewer | Read-only verification |

Demo passwords are supplied only through the four `OPSC_DEMO_PASSWORD_*` environment variables (minimum 12 characters each); the seed script never prints passwords and is prohibited in production.

### PostgreSQL runtime and local bridge

The Vercel runtime uses PostgreSQL when `DATABASE_ENGINE=postgres` and the explicit `OPSC_DATABASE_URL` is configured; production does not fall back to `DATABASE_URL`. The repository root pins the runtime driver and Vercel installs it from the root lockfile. `docker-compose.postgres.yml` is an optional local PostgreSQL environment for development and tests; local SQLite remains the default. No production certification is inferred from local or CI tests.

### Local recovery

```bash
npm run backup
npm run restore ./data/backups/<backup-file>.db
```

These commands verify SQLite integrity; production backup/restore remains a buyer-environment verification item.

## Production handoff

The application has a PostgreSQL runtime path, but a buyer-specific production deployment still requires exact-commit deployment provenance, proof that Vercel connects as the least-privilege `opscore_runtime` role, live session/tenant-isolation acceptance, recovery drills, TLS/ingress, secret management, distributed rate limiting, and buyer-owned identity, notifications, object storage, maps and telephony provider setup. CI success alone does not certify production.

## v0.11.61 additions
- Added an executable recovery drill: backup, integrity/FK verification, isolated restore and application-table/count comparison.
- Added an export verifier that recomputes the tenant snapshot SHA-256 and detects tampering.
- Added regression tests for recovery and portability controls.
- Recovery/export tooling is explicitly local verification, not production RPO/RTO certification.

## v0.11.61 and prior hardening
- Browser console authentication no longer stores the session bearer token in localStorage.
- Customer portal access URLs are exchanged once and scrubbed from browser history/navigation state.
- Release verification enforces package/OpenAPI/manifest version consistency and checks critical UI/security contracts.
- Attachment ingestion performs strict base64, extension and common MIME/signature validation before persistence.

## Release hygiene
- Canonical release metadata is synchronized to v0.11.61 across package, OpenAPI, manifest, UI build marker and release documentation.
- Release verification now checks the explicit allowlist of current-facing release documents; historical/pinned documents are intentionally excluded.


## v0.11.61 Evidence-Governed Operational Autopilot

The release adds a deterministic Operational Intelligence Fabric over the existing operational and platform intelligence layers:

- Local incident simulation for documented failure scenarios, with rollback support and explicit local-demo truth boundaries
- Evidence-linkage graph connecting signals, events, resources, dependencies, impact, decisions and outcomes; it is provenance linkage, not statistical proof of causality
- Tenant-scoped guardrail policies with suggest/approve/deny modes, Safe Mode gating and optional change bounds
- Approval-gated stale-worker recovery, with execution and outcome recorded in the audit/evidence trail
- Read-only Evidence Center, replay package and integrity verification
- Deterministic outcome learning summaries; no autonomous AI inference is required for these controls
- `opscore demo --scenario cascading-worker-failure` for a local, isolated buyer demonstration

## API inventory
Run `npm run api:inventory` to generate an inventory from the actual HTTP route table.

## Native mobile integration

The companion OpsCore Mobile client uses the same backend authority. Native authentication is exposed through `/api/v1/auth/mobile-login`; field mutations use the existing `/api/v1/sync` contract. GPS check-in is authoritative on the appointment record and is validated against the signed-in technician and organization.

## Commercial operations

The release includes an optional commercial workflow for buyers who need a deterministic quote-to-cash foundation inside field operations:

`Estimate -> Customer Acceptance -> Work Order Conversion -> Invoice -> Manual Payment Recording`

Estimates and invoices are tenant-scoped, line-item based, currency-validated and status-governed. Totals are calculated from persisted line items, an explicit discount amount and a tax rate. Accepted estimates can be converted once into a linked work order, and invoices can reference the accepted estimate/work order. Manual payment recording is local ledger state only; no payment gateway is claimed by this feature.

Relevant routes include `/api/v1/estimates`, `/api/v1/estimates/{id}/status`, `/api/v1/estimates/{id}/convert-to-work-order`, `/api/v1/invoices`, `/api/v1/invoices/{id}/status` and `/api/v1/invoices/{id}/payments`.
