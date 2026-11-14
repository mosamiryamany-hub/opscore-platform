# Signed Tenant Context — CI Evidence and Remaining Trust-Boundary Gates

Date: 2026-11-14

Repository: `mosamiryamany-hub/opscore-platform`

PR: #103 — `security/priority-production-hardening-20261114`

CI-tested PR head: `3a82852b3aff075de841fb195937e36d6572beeb`

PR base / unchanged `main`: `4ef126ccd59f23cebeead30224d1bcf7199535ab`

## Status

**PASS — isolated CI verification of 18 explicitly allowlisted work-order Preview GET route patterns plus 6 explicitly allowlisted signed write patterns (create, update, comment, transition, soft-delete, and restore).**

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
- Six write method/path patterns use the separate Preview-only feature flag: `POST /api/v1/work-orders`, `PATCH /api/v1/work-orders/:id`, `POST /api/v1/work-orders/:id/comments`, `POST /api/v1/work-orders/:id/transition`, `DELETE /api/v1/work-orders/:id`, and `POST /api/v1/work-orders/:id/restore`. Each opens one read-write transaction, binds the signed assertion to that transaction, and returns the signed-context response marker only after commit.
- `Store.withCallerManagedTransaction()` marks the externally owned transaction in the Store's transaction-depth accounting. This prevents nested Store methods and `idempotentWrite()` from opening or committing a second PostgreSQL transaction before the signed request is complete.
- The transition route passes the supplied reason into `Store.transitionWorkOrder`; transition events and webhook-delivery records are written in the same caller-owned transaction.
- Soft-delete and restore are scoped to the authenticated organization before their `deleted_records` mutation, and their audit records participate in the same signed transaction.
- Idempotency replay now deserializes stored responses from either PostgreSQL JSON/JSONB objects or SQLite JSON text; the same helper is used for synchronous and asynchronous idempotency replay.
- The Node signer remains in the trusted parent process. The PostgreSQL worker receives a minimal allowlist of database and transport settings; the HMAC signing key is not passed to the worker.
- Deliberately excluded: `GET /evidence-package` because it calls attachment integrity verification that writes an audit record; `GET /completion.pdf` because it uses a binary streaming response not handled by this JSON read wrapper; and `dispatch-eligibility` / `field-duration-forecast` pending a source-specific side-effect and transaction audit.


The Preview read routes are gated by `VERCEL_ENV=preview` and `OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_ENABLED=true`. The three write routes additionally require `OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_WRITE_ENABLED=true`. Neither flag nor a signing key was provisioned in Vercel by this source-only change, and the Vercel deployment job was skipped.

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

## Latest signed work-order write expansion — 2026-11-14

Application source commit: `7b04d2117b5d9fd804378bc5e6f121ccd4ac8ac9`.

The PostgreSQL 18 gate exercised the real HTTP write paths as `opscore_runtime` using two independent authenticated tenant sessions:

- `POST /api/v1/work-orders`: Tenant A and Tenant B each created an order. Each response was bound to that session's tenant and user; a client-supplied opposing `organizationId` claim was ignored.
- `PATCH /api/v1/work-orders/:id`: both tenants updated their own order with the signed assertion active and the raw tenant/user/access-mode GUCs overwritten by the CI red-team probe.
- The identical Tenant A PATCH was replayed with the same idempotency key and payload. The replay returned the stored response with `x-idempotency-replayed: true` rather than re-running the write.
- Tenant A attempted to PATCH Tenant B's order. The server returned `404 NOT_FOUND`, and a subsequent authenticated Tenant B read proved that its title remained unchanged.
- `POST /api/v1/work-orders/:id/comments`: both tenants created comments on their own orders. Tenant A's attempt to comment on Tenant B's order returned `404 NOT_FOUND`; Tenant B's subsequent comment listing proved the forged comment was not persisted.

The emitted PostgreSQL proof object contained **12/12 PASS write assertions**: Tenant A/B create, client tenant-claim override rejection, Tenant A/B patch, idempotent replay, cross-tenant patch denial and unchanged foreign row, Tenant A/B comment, and cross-tenant comment denial and non-persistence. All 48 prior read-subresource assertions and the unsigned/invalid/replay/GUC-tampering checks also remained PASS.

The first test attempt exposed an existing cross-database compatibility defect: PostgreSQL returns JSONB response columns as decoded objects, while the idempotency replay path assumed SQLite-style JSON text and called `JSON.parse` unconditionally. The shared deserializer now accepts both object and string forms for synchronous and asynchronous idempotency replay. The subsequent PostgreSQL 18 gate passed the real replay.

Exact GitHub Actions evidence for source commit `7b04d2117b5d9fd804378bc5e6f121ccd4ac8ac9`:

| Workflow | Run ID | Result |
|---|---:|---|
| Digital Twin PostgreSQL 18 Isolated RLS and HTTP Acceptance | `43619126822` | SUCCESS |
| OpsCore CI | `43619126851` | SUCCESS |
| Vercel contract verification | `43619126836` | SUCCESS |

The Vercel contract job passed; `deploy-bound-postgres-18-acceptance` and `deploy` were SKIPPED. This is not a deployment result. The signed write feature flag was set only in the disposable CI process, not in Vercel.

## Latest transition, delete, and restore expansion — 2026-11-14

CI-tested PR head: `3a82852b3aff075de841fb195937e36d6572beeb`.

The PostgreSQL 18 gate exercised the following new HTTP flows with separate Tenant A and Tenant B session tokens:

- Status transition: both tenants transitioned their own synthetic order from `open` to `in_progress`; the response carried the signed-context marker and idempotency metadata.
- Transition replay: Tenant A repeated the identical transition with the same idempotency key and payload. The stored response was replayed; the transition was not executed a second time.
- Cross-tenant transition: Tenant A attempted to transition Tenant B's order. The server returned `404 NOT_FOUND`; a subsequent Tenant B read confirmed its status remained `in_progress`.
- Soft-delete: each tenant soft-deleted its own work order. Tenant A's attempt to delete Tenant B's order returned `404 NOT_FOUND`; a direct owner-side acceptance assertion confirmed no active deletion marker was created for Tenant B.
- Restore: Tenant A's attempt to restore Tenant B's deleted order returned `404 NOT_FOUND`; a direct owner-side acceptance assertion confirmed Tenant B's deletion marker remained active. Each tenant then restored its own order, and the owner-side assertion confirmed both active deletion markers were cleared.

The emitted proof object contained **14/14 PASS assertions** for this expansion: Tenant A/B transitions, idempotent transition replay, cross-tenant transition denial and unchanged foreign row, Tenant A/B soft-delete, cross-tenant delete denial and absence of a foreign deletion marker, cross-tenant restore denial and preservation of the foreign deletion marker, Tenant A/B own restores, and confirmation that no active deletion markers remained.

Together with the previous write suite, the proof object contained **26/26 PASS write assertions**. The earlier **48/48 read-subresource assertions** and the signed-assertion tampering, invalid-signature, unsigned-GUC, and replay checks also remained PASS.

The acceptance gate explicitly cleans up the synthetic `deleted_records` and `workflow_transition_log` rows, together with related audit/activity, idempotency, and work-order fixtures. All data was created in and removed from the disposable local PostgreSQL 18 acceptance database; no live Neon branch was used.

Exact GitHub Actions evidence for the CI-tested PR head `3a82852b3aff075de841fb195937e36d6572beeb`:

| Workflow | Run ID | Result |
|---|---:|---|
| Digital Twin PostgreSQL 18 Isolated RLS and HTTP Acceptance | `43619954294` | SUCCESS |
| OpsCore CI | `43619954346` | SUCCESS |
| Vercel contract verification | `43619954434` | SUCCESS |

Both Vercel deployment jobs, `deploy-bound-postgres-18-acceptance` and `deploy`, were SKIPPED. This is not a deployment result. The signed write flag was set only in the disposable CI process, not in Vercel.

## Latest bulk work-order write expansion — 2026-11-14

Application and acceptance-test head: `e53079b04dbd554da612a0d9d27c2420514ac065`.

The Preview-only signed-write allowlist now includes `POST /api/v1/work-orders/bulk`. The route retains its existing idempotency operation, request payload, HTTP status, and response body; when the signed write feature is enabled it runs inside the same caller-managed transaction and only returns the signed-context response marker after commit.

The PostgreSQL 18 gate exercised the real HTTP endpoint as `opscore_runtime` with two authenticated tenant sessions:

- Tenant A performed a bulk priority update on its own synthetic work order; the operation returned one affected item and no failures.
- Replaying the same request with the same idempotency key returned the same persisted `jobId`, proving that the bulk operation was not executed a second time.
- Tenant B independently performed a bulk priority update on its own work order.
- Tenant A then submitted Tenant B's work-order ID in a bulk request. The endpoint preserved its batch contract and returned one per-item `NOT_FOUND` failure with zero affected items; it did not expose or mutate the foreign row.
- A subsequent authenticated Tenant B read confirmed the foreign work order retained its original priority.

The new bulk proof added **5/5 PASS assertions**: Tenant A success, idempotency replay, Tenant B success, cross-tenant per-item denial, and unchanged foreign row. The complete signed write proof now contains **31/31 PASS assertions**. The previous **48/48 signed read-subresource assertions** and the signed-assertion tampering, invalid-signature, unsigned-GUC, and backend/transaction replay checks also remained PASS.

Synthetic bulk-job rows and their audit rows are included in the PostgreSQL gate cleanup. All test data was created and removed in the disposable local PostgreSQL 18 acceptance database; no live Neon branch was used.

Exact GitHub Actions evidence for head `e53079b04dbd554da612a0d9d27c2420514ac065`:

| Workflow | Run ID | Result |
|---|---:|---|
| Digital Twin PostgreSQL 18 Isolated RLS and HTTP Acceptance | `43620996858` | SUCCESS |
| OpsCore CI | `43620996875` | SUCCESS |
| Vercel contract verification | `43620996874` | SUCCESS |

The Vercel `vercel-contract-verify` job succeeded. Its `deploy-bound-postgres-18-acceptance` and `deploy` jobs were SKIPPED. This is not a deployment result. The signed write flag and ephemeral HMAC key were supplied only to the disposable CI process, not to Vercel.

## Explicit remaining limitations

1. **The database-credential trust boundary is not closed.** Migration 064 deliberately preserves the legacy accessor behavior when no signed payload is supplied. A holder of the raw `opscore_runtime` credential can still omit the signed payload and supply the legacy tenant/user/access-mode GUCs on paths that have not been migrated. The CI pass proves the enabled HTTP paths use the signed assertion; it does not prove that arbitrary direct SQL using the runtime credential cannot impersonate a tenant.
2. **The signed work-order slice remains incomplete.** Eighteen GET patterns are allowlisted (list, detail, and 16 read-only subresources), and seven write method/path patterns are migrated (create, bulk update, update, comments, transition, soft-delete, and restore). Evidence-upload initiation, chunk upload, upload completion, and direct attachment upload are now included in the expanded CI-only signed write slice described below; other tenant-owned write paths remain outside this slice. `evidence-package`, PDF streaming, `dispatch-eligibility`, `field-duration-forecast`, and other tenant-owned routes still need their own transaction design and route-specific tests.
3. The complete policy inventory and identity plane are not migrated. The legacy arbitrary-user membership resolver, login/OIDC/API-key/password-reset/invitation/bootstrap/session lifecycle paths, and broad identity-table grants still require their own narrow-function and end-to-end work.
4. The HMAC key used by this test was ephemeral CI material. No Preview Vercel key was provisioned and no live Preview rollout was executed.
5. The 136-table restore was a disposable logical dump/restore exercise. It is not a Neon point-in-time restore drill or evidence of a scheduled production backup/PITR configuration.
6. The Vercel workflow verified contracts but skipped deployment. The code is not attested as running on a live Preview URL or Production.
7. Formal production tenant-isolation certification and commercial release closure remain **NOT CERTIFIED / OPEN**.

## Required next gates

1. Obtain explicit authorization before applying migrations 063/064 to a fresh, isolated Neon child branch. Run the same signed HTTP and direct-SQL red-team cases there; do not reuse Production or silently alter the existing Preview branch.
2. Remove the unsigned-GUC fallback from each tenant table/policy as that table's full route surface is migrated. The final direct-SQL test must prove a runtime-only credential cannot read or mutate another tenant merely by choosing raw GUC values or omitting the assertion.
3. Continue migrating the remaining work-order write paths and excluded read/streaming paths, then the remaining tenant routes, workers, knowledge pool, and identity helpers. Do not revoke grants until every corresponding caller and rollback path is mapped and tested.
4. Provision a Preview-only signer secret and matching verifier key record only after the isolated branch passes and deployment settings are reviewed. Keep Production key provisioning separate and explicitly approved.
5. Complete real Neon backup/PITR configuration and a genuine recovery drill, plus production HTTP-session, authorization, firewall enforcement, and final release gates.

## Change control

- PR #103 remains **OPEN / DRAFT / NOT MERGED**.
- Latest CI-tested application/test head: `e53079b04dbd554da612a0d9d27c2420514ac065`.
- The signed work-order test matrix at this head is **48/48 read-subresource assertions and 31/31 write assertions PASS** on disposable PostgreSQL 18, with OpsCore CI and Vercel contract verification also SUCCESS.
- The branch is 59 commits ahead of `main` and 0 behind at this tested head; the report-only update that follows may add one further commit.
- `main` remains `4ef126ccd59f23cebeead30224d1bcf7199535ab`.
- No migration, deployment setting, signer secret, or live Neon database was changed by the bulk expansion.
- Both Vercel deployment jobs were SKIPPED; no Preview or Production deployment was performed.
- No merge to `main` was performed.


## Latest signed evidence-upload and direct-attachment expansion — 2026-11-14

Application and acceptance-test head: `21dd4a3779508ffd5a0ab0b69f6af6697f0234d4`.

The Preview-only signed-write allowlist and real PostgreSQL 18 HTTP acceptance gate now include:
- `POST /api/v1/work-orders/:id/evidence-uploads` — tenant A/B upload initiation and idempotent replay.
- `PUT /api/v1/evidence-uploads/:id/chunks/:index` — tenant A/B chunk writes, duplicate replay, and cross-tenant denial.
- `POST /api/v1/evidence-uploads/:id/complete` — tenant A/B completion and cross-tenant completion denial.
- `POST /api/v1/work-orders/:id/attachments` — tenant A/B direct attachment writes and cross-tenant denial.
- Attachment listing tenant isolation.
- Integrity mismatch handling: the failed upload state is committed, no success marker is returned, and temporary assembly data is removed.
- Forced database write failure after file creation: rollback is verified to remove the database row and the unreferenced file.

The Store transaction integration now uses caller-managed transaction lifecycle hooks and savepoints for the evidence upload and attachment paths. Files created during a transaction are removed only after a confirmed rollback; ambiguous commit outcomes do not trigger unsafe deletion of potentially referenced files. The acceptance gate uses an isolated temporary file root and cleans up its synthetic database and filesystem fixtures.

The first full run exposed a PostgreSQL driver type boundary: BIGINT `chunk_index` values are returned as strings, while the assembly loop compared them directly with JavaScript numeric indexes. The check now validates safe integer conversion before comparing the index. This fixes the observed `EVIDENCE_CHUNKS_GAPPED` false rejection without weakening the contiguous-chunk invariant.

Exact GitHub Actions evidence for head `21dd4a3779508ffd5a0ab0b69f6af6697f0234d4`:

| Workflow | Run ID | Result |
|---|---:|---|
| Digital Twin PostgreSQL 18 Isolated RLS and HTTP Acceptance | `43622890070` | SUCCESS |
| OpsCore CI | `43622890112` | SUCCESS |
| Vercel contract verification | `43622890412` | SUCCESS |

The PostgreSQL acceptance workflow completed successfully, including the signed Node worker/HTTP gate, logical restore safety and drill, runtime migration-ledger attestation, isolated RLS gate, tenant composite-FK gate, real PostgreSQL HTTP commercial acceptance, shared login-throttling gate, evidence export, and source-derived tenant route isolation matrix. OpsCore CI completed successfully. Vercel contract verification completed successfully; its deployment and deploy-bound acceptance jobs were SKIPPED. No deployment occurred.

The CI success applies to disposable PostgreSQL 18 and isolated test filesystems. It does not mean migrations 063–065 were applied to Neon, that Vercel signer settings were provisioned, or that the signed feature flags were enabled in a live Preview deployment.

## Current branch and control state

- Current tested head at the time of this report update: `21dd4a3779508ffd5a0ab0b69f6af6697f0234d4`.
- Comparison against `main`: 71 commits ahead, 0 behind; base SHA remains `4ef126ccd59f23cebeead30224d1bcf7199535ab`.
- PR #103 remains OPEN / DRAFT / NOT MERGED.
- No live Neon migration, Vercel environment change, signer secret provisioning, Production action, or merge to `main` was performed.
- Production tenant isolation remains NOT CERTIFIED; Neon PITR/restore remains NOT VERIFIED; production firewall enforcement and commercial release closure remain OPEN.
