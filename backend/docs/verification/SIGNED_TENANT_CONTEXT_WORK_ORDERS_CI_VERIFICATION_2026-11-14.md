# Signed Tenant Context — CI Evidence and Remaining Trust-Boundary Gates

Date: 2026-11-14

Repository: `mosamiryamany-hub/opscore-platform`

PR: #103 — `security/priority-production-hardening-20261114`

Application source commit verified by the latest CI runs below: `f31c15a91b9a0256522d3f6c7546f545f2aff7f1`

PR base / unchanged `main`: `4ef126ccd59f23cebeead30224d1bcf7199535ab`

## Status

**PASS — isolated CI verification of 18 explicitly allowlisted work-order Preview GET route patterns (list, detail, and 16 read-only subresources).**

**NOT CERTIFIED — production tenant isolation against direct compromise of the `opscore_runtime` database credential.**

This report records the exact code and CI proof boundary. It does not claim a live Preview deployment, production deployment, full policy migration, production certification, or Neon PITR certification.

## Source changes included in the tested head

### Migration 063 — signed assertion verifier

`backend/sql/postgres/063_signed_tenant_context_verifier.sql`

- Creates the private `opscore_security.context_hmac_keys` store and `verified_tenant_context()` SECURITY DEFINER verifier.
- The verifier checks the HMAC, issuer, audience, purpose, required claims, bounded issue/expiry times, PostgreSQL backend PID, current transaction ID, active session, active user, tenant membership, and organization governance state.
- The verifier rejects malformed, expired, wrong-purpose, wrong-session, wrong-tenant, wrong-backend, wrong-transaction, and invalid-signature assertions by returning no verified context.
- Runtime can execute the verifier but cannot read or change the HMAC key table. PUBLIC cannot execute the verifier.
- The migration now **requires** `opscore_auth_definer` to exist with `NOLOGIN`, `BYPASSRLS`, `NOSUPERUSER`, `NOCREATEDB`, and `NOCREATEROLE`. It fails instead of falling back to `neondb_owner`. The migration verifies that this dedicated role owns the verifier and key table.

The SQL comparison loop is described in source as fixed-work/preliminary; this is not a formal constant-time cryptographic certification.

### Migration 064 — signed context on the work-order read policy

`backend/sql/postgres/064_signed_tenant_context_work_orders_routing.sql`

- Routes tenant, user, and access-mode accessors through verified claims whenever a signed payload is present.
- With a signed payload present but invalid, the accessor does not fall back to unsigned tenant/user/access-mode GUC values.
- Replaces the direct `current_setting('app.tenant_id')` dependency in `opscore_work_order_context` with the verified tenant/user accessors and verifies the resulting policy definition.
- Keeps a compatibility fallback to the old GUC behavior when no signed payload is present. That compatibility choice is a material remaining trust-boundary limitation described below.

### Application and worker integration

- The explicitly enabled, Preview-only signed-context allowlist covers 18 GET route patterns: `GET /api/v1/work-orders`, `GET /api/v1/work-orders/:id`, and these 16 read-only subresources: `completion-package`, `timeline`, `handoff`, `operational-risk`, `comments`, `attachments`, `dispatch-candidates`, `parts`, `signoffs`, `why-blocked`, `changelog`, `verified-job-record`, `work-pack`, `completion-assurance`, `time-summary`, and `first-time-right`.
- Each selected route pins the authenticated session principal, opens one `READ ONLY` transaction, obtains the backend PID and transaction ID from the same worker connection, binds a short-lived signed assertion, and executes its existing Store read inside that transaction.
- The 16 selected Store methods and their inspected read helpers use read-only database access. The CI-only red-team probe overwrites the raw tenant, user, and access-mode GUCs after the assertion is bound; the probe requires both `CI=true` and its explicit test flag.
- The Node signer remains in the trusted parent process. The PostgreSQL worker receives a minimal allowlist of database and transport settings; the HMAC signing key is not passed to the worker.
- Deliberately excluded: `GET /evidence-package` because it calls attachment integrity verification that writes an audit record; `GET /completion.pdf` because it uses a binary streaming response not handled by this JSON read wrapper; and `dispatch-eligibility` / `field-duration-forecast` pending a source-specific side-effect and transaction audit.


The Preview route is gated by `VERCEL_ENV=preview` and `OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_ENABLED=true`. No such flag or signing key was provisioned in Vercel in this change, and the Vercel deployment step was skipped.

## Initial list/detail CI evidence (historical checkpoint)

All three workflows completed successfully for branch HEAD `bc07f7a68d5df1f757103a46160aef9d1c962427`:

| Workflow | Run ID | Result |
|---|---:|---|
| Digital Twin PostgreSQL 18 Isolated RLS and HTTP Acceptance | `43617102664` | SUCCESS |
| OpsCore CI | `43617102713` | SUCCESS |
| Vercel contract workflow | `43617102699` | SUCCESS |

The Vercel `vercel-contract-verify` job passed. Both `deploy-bound-postgres-18-acceptance` and `deploy` were **SKIPPED** for the pull-request event; this is not a deployment result.

### Real Node worker / HTTP proof

The PostgreSQL gate emitted:

```json
{
  "schemaVersion": "opscore.signed-tenant-context-ci-proof.v1",
  "status": "PASS",
  "checks": {
    "tenantAHttpSession": "PASS",
    "tenantBHttpSession": "PASS",
    "signedWorkOrdersTenantA": "PASS",
    "signedWorkOrdersTenantB": "PASS",
    "signedWorkOrderDetailTenantA": "PASS",
    "signedWorkOrderDetailTenantB": "PASS",
    "workOrdersRawGucTamperingIgnored": "PASS",
    "readOnlyBoundTransaction": "PASS",
    "rawGucTampering": "PASS",
    "unsignedGucDenied": "PASS",
    "invalidSignatureDenied": "PASS",
    "sameBackendNextTransactionReplayDenied": "PASS",
    "differentBackendReplayDenied": "PASS"
  },
  "environment": {
    "database": "opscore_http_acceptance",
    "ownerRole": "neondb_owner",
    "runtimeRole": "opscore_runtime",
    "runtimeBypassesRls": false
  }
}
```

The real HTTP test seeded one work-order row for each of two synthetic tenants and called both actual product read routes — `GET /api/v1/work-orders` and `GET /api/v1/work-orders/:id` — with each tenant's real session token. Before each Store read, the CI-only probe attempted to replace the raw tenant, user, and access-mode settings. List responses contained exactly the authenticated tenant's one seeded row; detail responses returned exactly that tenant's seeded work-order ID and organization ID. All four HTTP responses carried `x-opscore-signed-tenant-context: verified`. The test fails on any mismatch.

The lower-level PostgreSQL checks also passed for unsigned GUC-only access, invalid HMAC, same-backend later-transaction replay, and different-backend replay. The verifier is bound to the database backend and current transaction; it is not a reusable bearer assertion.

### Other acceptance evidence

- Source-derived tenant route isolation matrix: **346 routes**, all tested probes passed, zero skips, zero cleanup errors.
- PostgreSQL logical dump/restore drill: **136 tables**, completed against disposable CI databases only.
- Tenant composite-FK gate: PASS.
- Isolated PostgreSQL 18 RLS gate: PASS.
- Real HTTP commercial acceptance as `opscore_runtime`: PASS.
- Shared PostgreSQL login rate limiter across independent runtime processes: PASS.
- Runtime-only migration-ledger attestation: PASS, with zero write operations.
- `npm audit --omit=dev --audit-level=high`: zero reported vulnerabilities in the tested OpsCore CI run.

The matrix output explicitly retained `productionCertification=false` and `isolationCertification=NOT_CERTIFIED`. The restore output explicitly identified itself as a disposable PostgreSQL logical-restore drill and retained the Neon PITR limitation.

## Live database and deployment boundary

Read-only revalidation of the existing Neon Preview branch `br-wispy-credit-bckacgvt` confirmed:

- `opscore_auth_definer`: NOLOGIN, NOSUPERUSER, BYPASSRLS, NOCREATEDB, NOCREATEROLE.
- `opscore_runtime`: LOGIN, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE.
- `neondb_owner`: LOGIN, NOSUPERUSER, BYPASSRLS, CREATEDB, CREATEROLE.
- Neither `063_signed_tenant_context_verifier.sql` nor `064_signed_tenant_context_work_orders_routing.sql` is recorded in the Preview `schema_migrations` ledger (zero matching rows).

No application of 063/064 to the existing Neon Preview branch was performed. No Production schema/data/role/grant/secret change was performed. No Vercel environment variable or firewall setting was changed.

## Latest work-order read expansion — 2026-11-14

Application source commit: `f31c15a91b9a0256522d3f6c7546f545f2aff7f1`.

The latest PostgreSQL 18 gate extended the real HTTP test from the list/detail pair to all 16 allowlisted subresource routes named above. For every subresource it executed:

- One authenticated Tenant A request: HTTP 200, signed-context response marker, and no Tenant B work-order ID in the returned body.
- One authenticated Tenant B request: HTTP 200, signed-context response marker, and no Tenant A work-order ID in the returned body.
- One Tenant A request using Tenant B's work-order ID: either a parent-not-found rejection (HTTP 503 without a signed-success marker) or an empty tenant-filtered collection (HTTP 200 with zero rows). No foreign-tenant row was returned.

The emitted proof object contained **48/48 PASS assertions** across those 16 routes: 16 Tenant A positives, 16 Tenant B positives, and 16 foreign-ID denial probes. The existing root list/detail checks, GUC-tampering test, unsigned/invalid assertion tests, and same-/different-backend replay tests also remained PASS.

Exact GitHub Actions evidence for source commit `f31c15a91b9a0256522d3f6c7546f545f2aff7f1`:

| Workflow | Run ID | Result |
|---|---:|---|
| Digital Twin PostgreSQL 18 Isolated RLS and HTTP Acceptance | `43617871243` | SUCCESS |
| OpsCore CI | `43617871223` | SUCCESS |
| Vercel contract verification | `43617871225` | SUCCESS |

The Vercel contract job passed. Its `deploy-bound-postgres-18-acceptance` and `deploy` jobs were SKIPPED for the pull-request event. This is not a deployment result. No Preview release occurred.

The signed read wrapper is still feature-gated by `VERCEL_ENV=preview` and `OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_ENABLED=true`. No Preview signer secret or HMAC key row was provisioned by this source-only change, and migrations 063/064 were not applied to Neon.

## Explicit remaining limitations

1. **The database-credential trust boundary is not closed.** Migration 064 deliberately preserves the legacy accessor behavior when no signed payload is supplied. A holder of the raw `opscore_runtime` credential can still omit the signed payload and supply the legacy tenant/user/access-mode GUCs on paths that have not been migrated. The CI pass proves the enabled HTTP paths use the signed assertion; it does not prove that arbitrary direct SQL using the runtime credential cannot impersonate a tenant.
2. **The signed HTTP read slice is incomplete.** Eighteen route patterns are allowlisted (list, detail, and 16 read-only subresources). Work-order writes, `evidence-package`, PDF streaming, the two unevaluated GET subresources, and other tenant-owned routes still need their own transaction design and route-specific tests.
3. The complete policy inventory and identity plane are not migrated. The legacy arbitrary-user membership resolver, login/OIDC/API-key/password-reset/invitation/bootstrap/session lifecycle paths, and broad identity-table grants still require their own narrow-function and end-to-end work.
4. The HMAC key used by this test was ephemeral CI material. No Preview Vercel key was provisioned and no live Preview rollout was executed.
5. The 136-table restore was a disposable logical dump/restore exercise. It is not a Neon point-in-time restore drill or evidence of a scheduled production backup/PITR configuration.
6. The Vercel workflow verified contracts but skipped deployment. The code is not attested as running on a live Preview URL or Production.
7. Formal production tenant-isolation certification and commercial release closure remain **NOT CERTIFIED / OPEN**.

## Required next gates

1. Obtain explicit authorization before applying migrations 063/064 to a fresh, isolated Neon child branch. Run the same signed HTTP and direct-SQL red-team cases there; do not reuse Production or silently alter the existing Preview branch.
2. Remove the unsigned-GUC fallback from each tenant table/policy as that table's full route surface is migrated. The final direct-SQL test must prove a runtime-only credential cannot read or mutate another tenant merely by choosing raw GUC values or omitting the assertion.
3. Migrate the remaining work-order writes and excluded read/streaming paths, then the remaining tenant routes, workers, knowledge pool, and identity helpers. Do not revoke grants until every corresponding caller and rollback path is mapped and tested.
4. Provision a Preview-only signer secret and matching verifier key record only after the isolated branch passes and deployment settings are reviewed. Keep Production key provisioning separate and explicitly approved.
5. Complete real Neon backup/PITR configuration and a genuine recovery drill, plus production HTTP-session, authorization, firewall enforcement, and final release gates.

## Change control

- PR #103 remains **OPEN / DRAFT / NOT MERGED**.
- Application source commit covered by the latest CI evidence: `f31c15a91b9a0256522d3f6c7546f545f2aff7f1`.
- The application-source checkpoint was 44 commits ahead of `main` and 0 behind. The report-refresh commit is documentation-only.
- No migration, deployment setting, signer secret, or production database was changed.
- `main` remains `4ef126ccd59f23cebeead30224d1bcf7199535ab`.
- No deployment was performed.

