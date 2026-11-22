# Buyer and seller residuals — reconciled 2026-11-22

This register separates seller release blockers from buyer-specific deliverables. GitHub, Vercel, Neon and WAF were rechecked on 2026-11-22; public legal routes were not freshly checked and remain unverified. No production migration, role change, branch deletion, backup-plan upgrade, WAF enforcement change, legal publication or license grant is implied.

## Current seller release evidence

| Item | Measured value | Scope |
|---|---|---|
| GitHub main closeout commit | `63682774b7f81e123f996f6508fed5a714fea0be` | Verified remote head after PR #382 merge |
| Application/runtime baseline | `43554492218adbf0cde2d700bd0dedfadce67f5e` | PR #382 changed docs, tests and static audit tooling; no runtime/migration/lockfile changes |
| GitHub Actions | Run `44993913435` | Post-merge verify PASS: 960 passed, 0 failed, 3 skipped |
| Vercel workflow | Run `44993913475` | Source verification, isolated PostgreSQL 18, contract verification and isolated RLS/HTTP acceptance PASS; PITR, Neon Preview migration and deploy SKIPPED |
| Production certification / promotion | `NOT_ESTABLISHED` / `NOT_PROVEN` | No exact-head authorized Production run or matching runtime proof |
| Vercel deployment for current main closeout commit | SHA `63682774b7f81e123f996f6508fed5a714fea0be` | No deployment record found for this SHA |
| Latest current-source Vercel Production-target deployments | `dpl_G15K6Sg9Q7xJQKrHKFRYJGSNDerN`; `dpl_EC2Ri4BJrZTN7ca53xurrUV9LvmR` | Both `READY` on application/runtime parent SHA `43554492218adbf0cde2d700bd0dedfadce67f5e`, both have empty alias lists |
| Canonical production domain | `opscore-platform.vercel.app` → `dpl_EacspS7o2jntgw8uS1YMpzf45CFt` | Verified domain record; current alias deployment source SHA `b7f63445c1748ebaec426a9ebe0ea629e4998839`, not current main |
| Focused local test suite | 89 / 89 PASS | Includes local unmerged red-team regression test; not an official main CI result |
| Red-team result | Main: `REVIEW`; local adjusted analyzer: `PASS` | Five bounded contracts verified locally; analyzer change is uncommitted and not attributable to main |
| Dependency audit | 6 audits, zero findings | Full and `--omit=dev` for root/backend/mobile on current SHA lockfiles; not a software security certification |
| Secure Release package | Not established | No exact-main ZIP, SBOM, signed provenance or release statement found |

**Release interpretation:** successful post-merge CI is not a completed Production release or commercial technical certification. No Vercel deployment record exists for closeout commit `63682774b7f81e123f996f6508fed5a714fea0be`. Two READY Production-target records exist on its application/runtime parent SHA `43554492218adbf0cde2d700bd0dedfadce67f5e`, both with empty alias lists. The verified canonical domain record resolves to deployment `dpl_EacspS7o2jntgw8uS1YMpzf45CFt` on SHA `b7f63445c1748ebaec426a9ebe0ea629e4998839`. The public domain is therefore still on the older release; current-main production deployment and promotion remain unproven.

## Production environment binding — read-only Vercel inspection, 2026-11-22

Production environment flags currently read `OPSC_PRODUCTION_HOLD=false`, `OPSC_RELEASE_VERIFIED=true`, and `OPSC_PRODUCTION_ISOLATION_CERTIFICATION=CERTIFIED`. These are internal flags only, not external ISO/SOC/PCI certification. The release package, CI and source commit variables all bind to SHA `b7f63445c1748ebaec426a9ebe0ea629e4998839`, matching the canonical domain alias deployment. The configured production probe deployment is a separate READY deployment on that same older SHA. These settings do not qualify closeout commit `63682774…`.

Production TLS configuration is `OPSC_PG_SSL_MODE=verify-full` and `OPSC_PG_SSL_REJECT_UNAUTHORIZED=true`. This confirms strict configuration values, not a successful TLS handshake on the actual application worker. No fresh exact-head Production worker TLS proof exists.

## Required public-proof semantics

A technical pass must not imply complete buyer delivery. The three buyer-owned items below must remain `REMAINING_BUYER`. Full seller release proof must also require exact Production PostgreSQL HTTP route and business-flow acceptance. A SQLite contract result (`PASS_CONTRACT_SCOPE`), missing evidence, Preview evidence or a proof from another deployment must not qualify.

The release-proof changes from PR #381 are in current `main`, but no post-merge authorized Production workflow or genuine exact-target runtime evidence was found. Current main therefore remains unqualified for a full release claim.

## Buyer-owned residuals — explicitly open

| Residual | Status | Exact boundary |
|---|---|---|
| Android/iOS store artifacts | `REMAINING_BUYER` | Buyer-specific signing, native builds, physical-device QA, store accounts, submission and publication are not included. |
| Native-speaker translation review | `REMAINING_BUYER` | 114 locale rows; native-speaker review 0/114 and production qualification 0/114. Machine-assisted drafts and English fallbacks must remain disclosed. |
| Licensed maps and road-routing | `REMAINING_BUYER` | Buyer/provider license, account, credentials, attribution, quotas, billing and buyer-specific live acceptance are not included. |

The 67/67 signed-session matrix is isolated PostgreSQL CI evidence, not buyer-environment qualification. Buyer environments remain independently unverified. These residuals do not invalidate the scope-limited tests above, but they prevent an unqualified claim that a buyer-specific deliverable is complete. They do not grant any right to install, run, copy, modify, distribute, resell, sublicense or commercially exploit the source.

## Neon recovery and backup limits

| Measurement | Current live value |
|---|---|
| Neon project | `summer-leaf-18448271` (`opscore-production`) |
| Production branch | `br-proud-salad-bcshhdap` |
| PostgreSQL major version | 18 |
| Plan | Free |
| History retention | 21,600 seconds (6 hours) |
| Branch logical-size limit | 1 GiB |
| Primary branch protected | No (`protected=false`) |
| Listed snapshots | One listed manual snapshot: `snap-aged-thunder-bcsxc1a5` |
| Automatic snapshot schedule | None (live schedule query returned an empty schedule) |
| Main migration ledger | 70 rows; latest `071_signed_rls_context_all_access_modes.sql` (read 2026-11-22) |
| Recovery branch migration ledger | 68 rows; latest `069_technician_location_trail_tenant_persistence.sql` (read 2026-11-22) |
| Network restrictions | Allowed IP list empty; public connections not blocked |

A fresh read-only Neon ledger query on 2026-11-22 found 70 rows on Primary, latest `071_signed_rls_context_all_access_modes.sql`, and 68 rows on recovery branch `br-calm-poetry-bc7l7wik`, latest migration 069. The difference reflects the recovery branch's older snapshot lineage; it is not evidence of data corruption. The migration number 071 is not the ledger row count. Do not describe the current setup as scheduled-backup coverage, multi-day PITR, or an RPO/RTO guarantee. The 2026-11-20 native instant-restore probe returned PASS for a disposable historical branch and schema/catalog match; it did not prove all row contents, application-level recovery or recovery objectives. Do not delete the only listed manual snapshot without separate approval.

## Database security boundaries

The last detailed catalog read found 136 public tables, 135 with RLS and FORCE RLS; `spatial_ref_sys` is the non-tenant PostGIS metadata exception. The `opscore_runtime` role then had no superuser or BYPASSRLS attributes. **Historical P0 reproduction, 2026-11-21:** a read-only transaction-local probe under `opscore_runtime`, with no signed context, showed raw `app.tenant_id`, `app.user_id` and `app.access_mode` values flowing through public context accessors; a count-only read observed 2 `activity_log` rows after setting an existing tenant context. No row contents were read; no persistent DB changes were made. Migration 071 now exists in current source and verifies signed context, but no fresh Production catalog read confirms it was applied or that all table grants and policies are correct. A fresh read-only probe on 2026-11-22 as `opscore_runtime` set synthetic raw `app.tenant_id`, `app.user_id` and `app.access_mode` values; `opscore_current_tenant()` and `opscore_current_user()` returned NULL, `opscore_access_mode()` returned an empty value, and `verified_rls_context()` was NULL. This supports rejection of raw-GUC-only identity in this probe, but does not establish complete cross-tenant read/write isolation or every application path. Production isolation remains NOT_CERTIFIED until the full runtime-role denial/regression matrix passes on the exact deployment/database. Catalog coverage is not behavioral isolation certification.

The 67/67 signed-session route result is isolated PostgreSQL CI evidence, **not buyer-environment qualification**. Buyer environments remain independently unverified.

## Localization qualification boundary

The Contact Center currently has 105 selectable locales (1 English source, 100 machine-assisted drafts, and 4 English fallbacks); 9 locale codes are withdrawn. The separate qualification matrix retains 114 source rows. Native-speaker review is 0/114 and production qualification is 0/114. No linguistic quality approval is claimed.

## Vercel firewall enforcement posture — live read 2026-11-22

The firewall is enabled. Managed CRS rules for generic attack, RCE, SQLi and XSS, plus Bot Protection, are active in `log` mode. One authentication endpoint rule rate-limits 60 requests per source IP per fixed 60-second window. This is not full enforcement certification; do not switch managed rules to deny/challenge until representative Preview rehearsal and false-positive review are complete. Application account/session-level throttling remains required.

## Legal, licensing and distribution boundary

The last recorded live route check (2026-11-20) found `/terms`, `/privacy`, `/refund`, `/pricing`, `/legal` and `/security` returning HTTP 404. This has not been rechecked in the 2026-11-21 reconciliation. Legal content requires rights-holder/legal approval before publication.

| Item | State | Consequence |
|---|---|---|
| Source license | `UNLICENSED`; no repository `LICENSE` file | No default license grant |
| Buyer rights | `NONE_PENDING_RIGHTS_HOLDER_DECISION` | All rights reserved pending a separate written agreement |

A successful build, public repository, signed archive or seller-operated deployment does not itself grant buyer rights.
