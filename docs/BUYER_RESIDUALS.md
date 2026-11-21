# Buyer and seller residuals — reconciled 2026-11-21

This register separates seller release blockers from buyer-specific deliverables. The exact live provider observations below were re-read on 2026-11-21; historic evidence is identified as such. No production migration, role change, branch deletion, backup-plan upgrade, WAF enforcement change, legal publication or license grant is implied.

## Current seller release evidence

| Item | Measured value | Scope |
|---|---|---|
| GitHub main | `b4f3bc81135acbf1bbe7262a0ae58b3573cddf82` | Current source head |
| GitHub Actions | Run `44808632964` | Overall success, explicitly `CANDIDATE_EVIDENCE_ONLY` |
| Production certification | `false` | Workflow output |
| Production promotion | `false` | Workflow output |
| Production environment | Restored | Workflow verified restoration after candidate-only processing |
| Vercel candidate | `dpl_4vSUfZX9p1iwbbyGQV3hoPUDvuRV` | READY on current main; no aliases |
| Canonical production alias | `dpl_EacspS7o2jntgw8uS1YMpzf45CFt` | Still serves source `b7f63445c1748ebaec426a9ebe0ea629e4998839`, not current main |
| SQLite API route contracts | 358 / 358 | Contract scope only; not full PostgreSQL functional acceptance |
| PostgreSQL 18 acceptance | PASS | Disposable isolated CI database; not seller Production certification |
| Signed tenant route matrix | 67 expected / 67 covered / 0 failed | Isolated PostgreSQL CI fixture evidence only; not a certification of the canonical production alias or buyer-environment qualification |
| Native Neon PITR probe | PASS | Historical branch schema/catalog comparison only; not row-content equality or RPO/RTO |
| Package fingerprint | `6c758562d271a65d86e1fff45f5b1c3d271a2c3c51cb31af8eafdb162159c190` | Candidate package, source commit `b4f3bc8…`, run `44808632964` |

**Release interpretation:** this is a successful candidate evidence run, not a completed production release or commercial technical certification. The full production publication, final runtime/database/security proof, promotion and public-domain verification steps were skipped.

## Required public-proof semantics

A technical pass must not imply complete buyer delivery. The three buyer-owned items below must remain `REMAINING_BUYER`. Full seller release proof must also require exact Production PostgreSQL HTTP route and business-flow acceptance. A SQLite contract result (`PASS_CONTRACT_SCOPE`), missing evidence, Preview evidence or a proof from another deployment must not qualify.

The candidate code change for this stricter rule is under review on `fix/fail-closed-production-functional-release-proof-2026-11-21`; until merged, tested and populated by genuine Production evidence, current main remains unqualified for a full release claim.

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

The live primary ledger contains 69 rows and its latest entry is `070_evidence_upload_postgres_blob_storage.sql`, applied at `2026-11-19T18:38:00.349Z`. Restore branch `br-calm-poetry-bc7l7wik` contains 68 rows and ends at migration 069 because its snapshot lineage predates migration 070. This measured one-row difference is time-ordered and is not evidence of data corruption. Do not describe the current setup as scheduled-backup coverage, multi-day PITR, or an RPO/RTO guarantee. The 2026-11-20 native instant-restore probe returned PASS for a disposable historical branch and schema/catalog match; it did not prove all row contents, application-level recovery or recovery objectives. Do not delete the only listed manual snapshot without separate approval.

## Database security boundaries

The last detailed catalog read found 136 public tables, 135 with RLS and FORCE RLS; `spatial_ref_sys` is the non-tenant PostGIS metadata exception. The `opscore_runtime` role is not superuser and has no BYPASSRLS, but direct DML grants on identity-sensitive tables and raw-GUC fallback trust paths remain seller-owned findings. **P0 reproduction, 2026-11-21:** a read-only transaction-local probe under `opscore_runtime`, with no signed context, showed raw `app.tenant_id`, `app.user_id` and `app.access_mode` values flowing through public context accessors; a count-only read observed 2 `activity_log` rows after setting an existing tenant context. No row contents were read; no persistent DB changes were made. This confirms the trust-boundary issue reaches a real public RLS-protected table. Production tenant isolation is NOT_CERTIFIED until this is fixed and regression-tested across public table policies. Catalog coverage is not behavioral isolation certification.

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
