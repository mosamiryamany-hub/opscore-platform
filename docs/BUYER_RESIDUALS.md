# Buyer and seller residuals — reconciled 2026-11-22

This register separates seller release blockers from buyer-specific deliverables. GitHub and Vercel observations below were rechecked on 2026-11-22; Neon, WAF and public legal routes were not freshly checked in this reconciliation and remain dated historical evidence. No production migration, role change, branch deletion, backup-plan upgrade, WAF enforcement change, legal publication or license grant is implied.

## Current seller release evidence

| Item | Measured value | Scope |
|---|---|---|
| GitHub main | `43554492218adbf0cde2d700bd0dedfadce67f5e` | Confirmed by remote ref lookup on 2026-11-22 |
| GitHub Actions | Run `44953249616` | Post-merge checks succeeded; Vercel deploy, PITR and Neon Preview migration jobs were skipped |
| Production certification / promotion | `NOT_ESTABLISHED` / `NOT_PROVEN` | No exact-head authorized Production run or matching runtime proof |
| Latest Vercel Production-target record | `dpl_3Ls8gZdacPzNa1iJEe1r6amVEKRp` | READY, commit `970db239bc1b94401e39669e09b106e16c4defc1`; no aliases |
| Canonical production alias | `dpl_EacspS7o2jntgw8uS1YMpzf45CFt` | Alias lookup returned `opscore-platform.vercel.app`; deployment commit `b7f63445c1748ebaec426a9ebe0ea629e4998839` differs from current main |
| Focused local test suite | 89 / 89 PASS | Includes local unmerged red-team regression test; not an official main CI result |
| Red-team result | Main: `REVIEW`; local adjusted analyzer: `PASS` | Five bounded contracts verified locally; analyzer change is uncommitted and not attributable to main |
| Dependency audit | 6 audits, zero findings | Full and `--omit=dev` for root/backend/mobile on current SHA lockfiles; not a software security certification |
| Secure Release package | Not established | No exact-main ZIP, SBOM, signed provenance or release statement found |

**Release interpretation:** successful post-merge CI is not a completed Production release or commercial technical certification. The latest Vercel Production-target record is on a different SHA and has no alias; the canonical alias is attached to another SHA that also differs from current main. Production publication on current main, final runtime/database/security proof, promotion and public-domain verification remain unproven.

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
| Automatic snapshot schedule | None; no scheduled snapshot capability on the current plan |

The last recorded primary ledger contained 69 rows and ended at `070_evidence_upload_postgres_blob_storage.sql`, applied at `2026-11-19T18:38:00.349Z`. Restore branch `br-calm-poetry-bc7l7wik` contained 68 rows and ended at migration 069 because its snapshot lineage predates migration 070. This dated one-row difference was time-ordered and was not evidence of data corruption; Neon was not re-read in this reconciliation. Do not describe the current setup as scheduled-backup coverage, multi-day PITR, or an RPO/RTO guarantee. The 2026-11-20 native instant-restore probe returned PASS for a disposable historical branch and schema/catalog match; it did not prove all row contents, application-level recovery or recovery objectives. Do not delete the only listed manual snapshot without separate approval.

## Database security boundaries

The last detailed catalog read found 136 public tables, 135 with RLS and FORCE RLS; `spatial_ref_sys` is the non-tenant PostGIS metadata exception. The `opscore_runtime` role then had no superuser or BYPASSRLS attributes. **Historical P0 reproduction, 2026-11-21:** a read-only transaction-local probe under `opscore_runtime`, with no signed context, showed raw `app.tenant_id`, `app.user_id` and `app.access_mode` values flowing through public context accessors; a count-only read observed 2 `activity_log` rows after setting an existing tenant context. No row contents were read; no persistent DB changes were made. Migration 071 now exists in current source and verifies signed context, but no fresh Production catalog read confirms it was applied or that all table grants and policies are correct. The earlier probe remains material evidence; Production isolation stays NOT_CERTIFIED until current state is verified and runtime-role denial/regression tests pass. Catalog coverage is not behavioral isolation certification.

The 67/67 signed-session route result is isolated PostgreSQL CI evidence, **not buyer-environment qualification**. Buyer environments remain independently unverified.

## Localization qualification boundary

The Contact Center currently has 105 selectable locales (1 English source, 100 machine-assisted drafts, and 4 English fallbacks); 9 locale codes are withdrawn. The separate qualification matrix retains 114 source rows. Native-speaker review is 0/114 and production qualification is 0/114. No linguistic quality approval is claimed.

## Vercel firewall enforcement posture — live read 2026-11-21

The firewall is enabled. Managed CRS rules for generic attack, RCE, SQLi and XSS, plus Bot Protection, are active in `log` mode. One authentication endpoint rule rate-limits 60 requests per source IP per fixed 60-second window. This is not full enforcement certification; do not switch managed rules to deny/challenge until representative Preview rehearsal and false-positive review are complete. Application account/session-level throttling remains required.

## Legal, licensing and distribution boundary

The last recorded live route check (2026-11-20) found `/terms`, `/privacy`, `/refund`, `/pricing`, `/legal` and `/security` returning HTTP 404. This has not been rechecked in the 2026-11-21 reconciliation. Legal content requires rights-holder/legal approval before publication.

| Item | State | Consequence |
|---|---|---|
| Source license | `UNLICENSED`; no repository `LICENSE` file | No default license grant |
| Buyer rights | `NONE_PENDING_RIGHTS_HOLDER_DECISION` | All rights reserved pending a separate written agreement |

A successful build, public repository, signed archive or seller-operated deployment does not itself grant buyer rights.
