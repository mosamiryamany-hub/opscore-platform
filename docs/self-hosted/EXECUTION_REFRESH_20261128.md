# OpsCore Self-Hosted Execution Refresh

**Evidence cut:** 2026-11-28  
**Audit branch:** `audit/self-hosted-execution-refresh-2026-11-28`  
**Source baseline:** `main` at `f68ec555e5b296ba7ec63c04a4cb1c5d321d8187`  
**Mode:** Read-only platform audit followed by documentation-only branch update  
**Production/main changes:** None

## 1. Executive decision

Continue toward a Buyer-Controlled Self-Hosted Edition, but do not perform a bulk merge, production migration, DNS change, Neon security change, or production deployment yet.

The existing self-hosted branch is useful evidence, not a release candidate. It is 22 commits ahead and 3 commits behind the current main baseline. Its CI passed on its recorded head, but the passing scope is limited: Android is a debug/preview APK, browser acceptance uses a static local server, and Neon Preview plus production PITR jobs were skipped.

The current main source has independently advanced: it already contains the PWA shell/service worker, Android preview workflow, a dispatcher map that calls the signed `/api/v1/map/viewport` endpoint, and tenant-scoped GIS rendering. Therefore, do not copy the older dispatcher-map implementation or merge the self-hosted branch wholesale. Reconcile file-by-file against current main.

## 2. Platform evidence

### GitHub

- Repository: `mosamiryamany-hub/opscore-platform` (public).
- Default branch: `main`.
- Current main SHA: `f68ec555e5b296ba7ec63c04a4cb1c5d321d8187`.
- Current main combined-status query returned no status entries. The available commit-workflow lookup did not return push-triggered runs for this SHA; this is **unverified**, not proof of CI failure.
- Self-hosted branch: `feat/self-hosted-open-source-stack-20261127`.
- Self-hosted branch head observed: `4da2e148523a99a489773ef618024dc9aaac0f8a`.
- Git comparison: 22 commits ahead, 3 behind, status `diverged`.

Recorded successful checks for the self-hosted branch head:

| Run | Result | Evidence boundary |
|---|---|---|
| OpsCore CI `46047790087` | PASS | Source, regression, dependency, disposable PostgreSQL 18/RLS and logical restore checks |
| Android Preview `46047790060` | PASS | `assembleDebug`; not a signed production release |
| PWA/map browser `46047790083` | PASS | Static local browser test; not authenticated live application acceptance |
| Vercel source verification `46047790085` | PASS | Source verification; does not prove current production alias is serving this commit |

Android artifact:
- Artifact ID: `15222719753`
- Size: 60,936,853 bytes
- SHA-256: `1d1d75cfc01b5ab5917e762be25737f5a9a9e2f08e8ce3a521c5dd4163fc42be`
- This is a preview/debug APK, not a production-signed APK and not physical-device acceptance.

PWA artifact:
- Artifact ID: `15222798766`
- SHA-256: `a718b48b4fa86b11dcf45c455602d823e5fd29047aa41c79a715a5f1cb8f68e0`
- The workflow starts Python's static HTTP server and installs Playwright/Axe without the repository lockfile. It proves static browser behavior only; it does not prove authenticated API, tenant, or production deployment behavior.

The self-hosted branch's own implementation-status document says CI is pending. That statement is stale relative to the successful run IDs above and must be reconciled before it is reused in buyer material.

### Neon

Observed projects:

| Project | ID | PostgreSQL | Branch count observed |
|---|---|---:|---:|
| opscore-production | `summer-leaf-18448271` | 18.7 | 8 |
| opscore-acceptance | `sweet-union-58466913` | 18 | 5 |
| opscore-customer-demo | `delicate-lake-72003710` | 18 | 2 |
| opscore-native-pitr-canary | `withered-snow-96046673` | 18 | not expanded in this pass |
| opscore-pitr-free-proof | `empty-butterfly-33823503` | 18 | not expanded in this pass |

On `opscore-production` default branch `br-proud-salad-bcshhdap`:

- Branch is ready but **not protected**.
- Project IP allow-list is empty.
- Public connections are not blocked.
- Recorded history retention is 21,600 seconds (6 hours).
- The project has multiple databases. `neondb` is the Neon Auth database; the application schema is in `opscore_acceptance` and a second application database `opscore_http_acceptance`.
- The application database inspected reports PostgreSQL 18.7 and PostGIS 3.6.4.
- Catalog inventory: 139 ordinary tables; 137 have RLS enabled and forced. The two exceptions are `public.spatial_ref_sys` and `opscore_security.context_hmac_keys`. The latter needs a focused ownership/grant audit; do not enable RLS blindly.
- The migration ledger has 75 rows; the latest observed filename is `076_contact_center_crm_customer_link.sql`.
- Observed row counts in this database: 156 organizations, 156 users, 0 work orders, 0 `spatial_features`.
- Runtime roles `opscore_runtime` and `opscore_app_least` do not have BYPASSRLS. `opscore_auth_definer` is NOLOGIN/BYPASSRLS; review every SECURITY DEFINER grant and fixed search_path as a privileged exception.

**Critical unresolved binding:** Vercel has encrypted production environment entries for the production Neon branch ID and database name. Their values were not decrypted or exposed. Therefore, this audit does not claim that the inspected `opscore_acceptance` database is the exact database currently used by the production deployment. A non-secret, commit-bound runtime attestation must prove the project, branch, database, endpoint and runtime role before any migration or cutover.

A non-default snapshot-restore drill branch exists (`br-muddy-lake-bckrn7md`) and is marked restored. This is useful evidence, but does not by itself establish row-content parity, backup independence, RPO or RTO. The current self-hosted CI run skipped both Neon Preview migration/HTTP acceptance and the production Neon PITR probe.

### Vercel

- Project: `opscore-platform`.
- Project ID: `prj_55IixPihXfnI6YSlkmTC0Vh0sV3J`.
- Runtime configured: Node.js `22.x`.
- Project metadata reports `live: false`.
- Latest production deployment is `READY`, but its source SHA is `fbc3e3acac557bd2c53486eee8813f9f318d7198`, not current main `f68ec555e5b296ba7ec63c04a4cb1c5d321d8187`.
- The deployment has the expected `opscore-platform.vercel.app` alias; project-domain records report the returned Vercel domains verified.
- No custom firewall configuration is installed; the default firewall applies.
- An external HTTP/browser check of the canonical domain was not established in this audit.
- Environment metadata flags `OPSC_RELEASE_PACKAGE_ATTESTATION_KEY` and `OPSC_TENANT_CONTEXT_HMAC_KEY` with `readable-secret`. Do not print or export their values. Correct their secret classification and plan coordinated rotation/verification before treating the environment as clean.
- Production DB binding values are encrypted; do not infer the Neon target from project naming or variable names.

## 3. Source-level reconciliation

Current main already includes:
- `backend/web/sw.js`, `manifest.webmanifest`, `pwa-register.js`, and `offline.html`.
- PWA browser acceptance workflow and Android preview APK workflow.
- A dispatcher map that calls both the legacy persisted-check-in API and the signed `/api/v1/map/viewport` endpoint.
- Viewport debounce and sequence protection against out-of-order responses.
- A visible data boundary: recorded appointment check-ins are not continuous GPS; road ETA is not claimed.
- GIS rendering from server-authorized spatial features, not fabricated browser fixtures.

The current map still loads MapLibre GL JS 6.20.0 from an external unpkg URL and uses the hosted OpenFreeMap style URL. This is a configurable/replaceable hosted dependency, not a self-hosted tile stack. Tiles, geocoding and routing are separate services and remain unprovisioned for the self-hosted edition.

The self-hosted branch's map implementation is older: it only consumes `/api/v1/dispatcher-map/v2` and does not consume the signed spatial viewport endpoint. Do not replace the current main implementation with it.

The current `backend/docker-compose.postgres.yml` is not a complete application stack. It defines a database service only, uses the floating `postgres:18` image rather than a pinned PostGIS-compatible image, and passes credentials through environment variables. It has a loopback-bound host port, which is a good local-exposure boundary, but it does not yet provide the API/web app, reverse proxy, tile/geocoder/router services, independent backup repository, monitoring or recovery orchestration.

## 4. Updated technology decisions

### Runtime and database

- Target Node.js 26 Active LTS after compatibility tests; current workflows pin Node 22.23.4, which is in Maintenance LTS. Move the application, mobile CI and container runtime together only after the complete regression matrix passes.
- Keep PostgreSQL 18.7 + PostGIS 3.6.4 for the first self-hosted release. PostgreSQL 19 has just been released; do not move the buyer baseline to a new major until PostGIS, extensions, migrations, drivers, backup tooling and restore drills pass on an isolated branch.
- Pin exact patch versions and OCI image digests. Do not use `latest` tags.
- Keep separate direct database connections for migrations/backup and pooled connections for high-concurrency application workloads where the deployment topology requires pooling. Verify the current runtime's actual connection mode before changing endpoints.

### Self-hosted runtime

Use Docker Compose v2 as the initial single-node buyer deployment profile, not as a claim of high availability. The stack must include:
- API/web application;
- PostgreSQL 18 + PostGIS image pinned by digest;
- Caddy reverse proxy with automatic TLS;
- background worker/outbox dispatcher;
- health/readiness checks and bounded restart policy;
- internal database network with no public database port;
- non-root containers, least-privilege users, resource limits and controlled writable paths;
- Docker Compose secrets mounted as files, with source secret files encrypted/off-host and access-controlled;
- explicit upgrade, rollback and recovery commands.

Only introduce K3s or multi-node orchestration for buyers with a measured availability/scaling requirement. It adds operational cost and complexity and is not a default substitute for Compose.

### Backup and recovery

Use pgBackRest with WAL archiving and a separately hosted encrypted repository. Define full/differential/incremental schedule and retention only after data-volume and change-rate measurement. Keep repository encryption keys separate from the database host and retain an offline recovery copy.

A backup is accepted only after:
1. backup manifest and repository integrity verification;
2. restore to an isolated host/volume;
3. schema, row-count, FK, RLS, PostGIS and application smoke checks;
4. measured restore duration and recovered timestamp;
5. signed evidence tied to the exact source commit and backup set.

Use `pg_dump`/`pg_restore` for logical export/import and controlled migration, not as the only continuous recovery strategy. If PostgreSQL 18.7 is installed after an earlier minor, follow its release note recommendation to establish a new full-backup baseline before relying on subsequent incremental backups.

### GIS

- Keep MapLibre GL JS 6.20.0 pinned; vendor the JS/CSS assets or serve them from a controlled origin.
- Build regional vector tiles with a reproducible, licensed OSM extract pipeline; serve through a selected self-hosted tile server only after load, cache, attribution and restore tests.
- Self-host Nominatim and OSRM only for defined geographic coverage and measured workloads. Do not use public community endpoints as production SLAs.
- Preserve the existing signed viewport API and its tenant authorization; map tiles must never carry private tenant records.
- Keep external tile failure separate from API/data success. Do not claim live traffic, continuous GPS, geocoding autocomplete or road ETA until each is separately implemented and measured.

## 5. Updated execution order and gates

### Gate 0 — Evidence and branch hygiene
- Preserve `main` at the audited SHA.
- Reconcile stale implementation-status documents with actual run evidence.
- Rebase/stack candidate work on current main in a new feature branch.
- Compare all files and migrations; remove duplicate or superseded work.
- Require CI evidence bound to the exact candidate SHA.

### Gate 1 — Production binding and release truth
- Prove Vercel deployment SHA, canonical alias, public HTTP response and runtime release identity match.
- Prove the exact Neon project, branch, database, endpoint and runtime role through a non-secret attestation.
- Resolve `live: false` and stale deployment binding before any production claim.
- Verify the latest main CI run through a push-triggered workflow/run record.

### Gate 2 — Secret and perimeter hygiene
- Reclassify the two readable-secret findings.
- Plan key rotation with old/new verification overlap and rollback; never rotate the tenant-context key without a controlled session/worker transition.
- Protect Neon default branches.
- Design IP allow-list/private connectivity from measured Vercel/self-hosted egress paths; do not block public connections until all required paths are tested.
- Confirm TLS verification remains enabled and runtime/migration roles remain least-privilege.

### Gate 3 — Database baseline and migration parity
- Identify the real production database and runtime branch before treating the observed counts as production data.
- Compare migration ledger, extension versions, schema, constraints, indexes, RLS policies and role grants across production, acceptance and demo.
- Audit `context_hmac_keys` grants/owner and every BYPASSRLS/SECURITY DEFINER object.
- Test tenant isolation with the actual runtime role, not owner/bypass roles.
- No production migration until a clean branch bootstrap and restore rehearsal pass.

### Gate 4 — Self-hosted runtime
- Replace the database-only Compose file with the complete pinned stack.
- Use a PostGIS-compatible image, file-mounted secrets and internal networks.
- Add Caddy, app/API, worker, health checks, logs/metrics and documented resource minimums.
- Test installation from a clean host and upgrade/rollback from a previous release.

### Gate 5 — Data migration and recovery
- Take a verified source backup and perform a complete restore rehearsal.
- Choose offline dump/restore or a separately tested replication cutover based on an agreed downtime budget.
- Verify attachments/object storage separately from PostgreSQL.
- Measure RPO/RTO; do not publish targets before measurement.

### Gate 6 — GIS and operational UX
- Retain main's signed viewport integration.
- Complete self-hosted tiles/geocoding/routing and attribution.
- Run authenticated browser tests against two real test tenants and actual PostgreSQL/PostGIS.
- Measure 40k/250k/1m spatial tiers under the real signed runtime query path, including repeated P50/P95, buffers and plan evidence.
- Validate current map rendering and responsive RTL; synthetic CI fixtures are not buyer data evidence.

### Gate 7 — Mobile and PWA
- Keep the existing debug APK classified as Preview.
- Implement a stable production signing key with off-host custody/recovery and a signed release workflow.
- Test install/update on physical Android hardware.
- Test PWA on Android Chrome and iOS Safari, including offline navigation and private API cache exclusion.
- Test native iOS only with an actual Apple build/distribution path and physical device or approved device farm.
- Do not enable PWA offline mutations until encrypted queue, CSRF, idempotency, tenant binding, expiry and replay controls pass.

### Gate 8 — Integrations, demo and buyer package
- Complete webhook retries, jitter, dead-letter queue, audited redrive and SSRF tests.
- Keep Activepieces optional and licence-scoped.
- Build Demo seeding/wipe only against a separately identified demo database with fail-closed environment checks.
- Require named vendor endpoints and test credentials for IoT, BIM/3D, SCADA and communications; no mock adapter can close these gates.
- Refresh SBOM, licences, notices, source provenance, release signatures, buyer operating guide, backup guide and explicit commercial rights.

## 6. Explicit non-claims

At this evidence cut, do not claim:
- zero total operating cost;
- self-hosted production is deployed;
- Vercel latest production serves current main;
- exact production Neon database/branch is confirmed;
- production branch security is hardened;
- production backup/PITR and measured RPO/RTO are complete;
- self-hosted tiles, Nominatim or OSRM are provisioned;
- production-signed Android APK or physical iOS/Android acceptance is complete;
- real tenant GIS scale is proven;
- live IoT/BIM/SCADA/SIP integrations are connected;
- buyer resale/IP rights are granted without a signed licence.

## 7. Immediate next execution

1. Close the Vercel-to-Neon source/database binding with non-secret evidence.
2. Correct readable-secret classification and prepare safe key rotation.
3. Create a fresh implementation branch from current main and reconcile the self-hosted branch against it.
4. Replace the incomplete Compose database-only prototype with a tested full-stack design.
5. Run a clean-host install plus encrypted backup/restore drill before any production cutover.

**Release rule:** no production migration, DNS change, Neon access-policy change, Vercel promotion, PR merge or destructive cleanup is authorized by this document.
