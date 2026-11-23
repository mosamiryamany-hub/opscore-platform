# Buyer and seller residuals — reconciled 2026-11-23

**Neon/Production ledger register reconciled 2026-11-22** by a read-only ledger query; every figure carried from that register below is labelled with its read date and was not silently promoted to a 2026-11-23 measurement.

## Superseding scope decision (owner, 2026-11-23)

The closeout scope is now the **complete hosted product**: the seller website on Vercel, the seller Production deployment, the Neon production database, periodic backups plus a full restore test, and the commercial/legal pages are **all in scope** and each must be proven on the same commit and the same deployment.

The earlier code-only scope decision (source code and release package only, excluding the seller site, seller Production and seller Neon) is **superseded and no longer governs acceptance**. It is retained only as history. No Neon or Vercel paid-plan upgrade is authorized without explicit owner approval; the current plan stays unless approved otherwise.

## Current source, deploy and proof state (measured 2026-11-23)

| Item | Measured value | Scope of evidence |
|---|---|---|
| `main` head | `fbc4a3082325dff98e2ed41fffe42c3d76863254` | GitHub commits API read 2026-11-23 |
| Pull request #401 | `open`, head `b3648d6c32ecba99f8bc4f114b610d7394b8d473`, 4 files, +223/−77 | GitHub pulls API + files API |
| PR #401 CI | `verify`, `vercel-contract-verify`, `vercel-source-verify` **failure**; CodeQL and `isolated-postgres-rls-and-http-acceptance` success | Run `45124539604` |
| Secure Release (on `main`) | Run `45122272270`, completed/success | Exact source `fbc4a308…` |
| Live `/api/health` | `200` · `{"status":"healthy","version":"0.11.62","engine":"postgres"}` | Live probe 2026-11-23 |
| Live `/api/verify/release` | `status: PASS`, `sourceCommit: 88df9046ea5d57b392530565bc8cf6a10627ac4a`, deployment `dpl_FVXwPoqefvkNsxA3BqVrxYnxRQka` | Live probe 2026-11-23 |
| Live `/api/verify/database-security` | `productionIsolationCertification: NOT_CERTIFIED`, `catalogIsolationScope: CATALOG_ONLY_NOT_BEHAVIORAL_CERTIFICATION` | Live probe 2026-11-23 |
| Identity divergence | Deployed commit `88df9046…` ≠ `main` head `fbc4a308…` | Both probes above; health 200 alone does not establish that `main` is deployed |
| Commercial/legal pages | `/terms`, `/privacy`, `/refund`, `/pricing`, `/legal`, `/security` all return **HTTP 404** | Live probes 2026-11-23 on `opscore-platform.vercel.app` |

The two live proof endpoints currently disagree on isolation status: the release proof reports `CERTIFIED` while the database-security proof reports `NOT_CERTIFIED` for a catalog-only scope. Both must be bound to the same deployment id and the same commit, and the disagreement must be explained at the source, before any single certification claim is made. A green CI run or a `200` health response is not a substitute for that reconciliation.

## Tenant isolation and route acceptance

The 67/67 signed-session route result is isolated PostgreSQL CI evidence, **not buyer-environment qualification**. Buyer environments remain independently unverified.

That result was produced on a disposable isolated PostgreSQL 18 instance inside CI. It does not certify the canonical Production alias, and it is not re-labelled as production acceptance. Production session/tenant isolation, restore and route evidence are separate gates that must each carry their own deployment id and commit.

## Neon production database ledger (read-only register read 2026-11-22)

| Item | Value |
|---|---|
| Project / engine | `summer-leaf-18448271` · PostgreSQL 18 · plan `free_v3` |
| History window | 21,600 seconds (6 hours) |
| Production branch | `br-proud-salad-bcshhdap` |
| Primary branch protected | No (`protected=false`) |
| Listed snapshots | One listed manual snapshot: `snap-aged-thunder-bcsxc1a5` (recorded 2026-11-19) |
| Automatic snapshot schedule | None (live schedule query returned an empty schedule) |
| Main migration ledger | 70 rows; latest `071_signed_rls_context_all_access_modes.sql` (read 2026-11-22) |
| Recovery branch ledger | 68 rows; latest `069_technician_location_trail_tenant_persistence.sql` on `br-calm-poetry-bc7l7wik` (read 2026-11-22) |

A fresh read-only Neon ledger query on 2026-11-22 found 70 rows on Primary, latest `071_signed_rls_context_all_access_modes.sql`, and 68 rows on recovery branch `br-calm-poetry-bc7l7wik`, latest migration `069_technician_location_trail_tenant_persistence.sql`. The two-row ledger difference is a stale recovery branch, **not evidence of data corruption**.

The Neon control plane was not reachable from this session (`api.neon.tech` did not resolve), so the register above was not re-queried on 2026-11-23; it is carried with its read date rather than presented as a current measurement.

Backups and recovery are not closed: there is no periodic external backup job, no automated digest/size/freshness check, and no scheduled restore drill into an isolated database. A logical `pg_dump` copy taken to owner-controlled external storage is a point-in-time copy, not PITR, and it does not by itself establish an RPO or an RTO. Neon Free provides a 6-hour history window; that is the current recovery floor, not a zero-loss guarantee.

## Localization qualification

The Contact Center currently exposes 105 selectable locales (1 English source, 100 machine-assisted drafts, 4 English fallbacks); 9 withdrawn locale codes are excluded. The separate qualification matrix retains 114 source rows, all at `planned_not_qualified` / `not_run`; that historical register is not the current catalog, and no native translation-quality approval is claimed.

Native-speaker review: **0/105**. Production-qualified by native review: **0/105**.

## Vercel firewall enforcement posture

The Vercel firewall enforcement posture is **not verified as enforcement**. What was recorded on 2026-11-18: `firewallEnabled=true`; CRS rules active but `log` only; Bot Protection active but `log` only; IP allow/deny rules list empty; 60 requests per source IP per fixed 60-second window; no anomalies for the default last-24-hour window. Log-only rules are not a denial posture and are not presented as an enforcement certification. A WAF claim requires a settings read on the live project plus an observed blocking test.

## Buyer-owned or separately contracted residuals

| Residual | Status | Boundary |
|---|---|---|
| Android/iOS native signed builds and store publication | REMAINING_BUYER | Buyer signing keys, store accounts, device QA, submission and publication |
| Native-speaker translation review | REMAINING_BUYER | 0/105 reviewed and 0/105 production-qualified |
| Licensed maps and road-routing | REMAINING_BUYER | Provider license, credentials, attribution, quotas, billing |
| Buyer identity/messaging/telephony/payment integrations | REMAINING_BUYER | Buyer-owned provider contracts, accounts, secrets, live acceptance |
| Buyer environment provisioning and operations | REMAINING_BUYER | Install, migration, data import, backup/RPO/RTO, monitoring |

## Certification boundary

CI results, test reports, dependency audits, CycloneDX SBOM, archive SHA-256, GitHub source identity, Sigstore signature/verification and isolated PostgreSQL/RLS/tenant reports are internal technical attestations. They are not ISO 27001, SOC 2, PCI DSS or any third-party certification. No external certification is self-issued, implied, or purchasable by assertion.

## Legal and distribution boundary

The package remains `UNLICENSED`. `NO_LICENSE_GRANT_NOTICE.txt` stays controlling: **no license grant** — no use, installation, running, copying, modification, hosting, distribution, resale, sublicensing or commercial exploitation rights exist until the rights holder and a named buyer execute a License Schedule bound to the exact source commit and/or package SHA-256.

## Commercial page boundary

These paths are currently absent on the live domain and are open gates: `/terms`, `/privacy`, `/refund`, `/pricing`, `/legal`, `/security`. Publishing them requires owner-supplied legal entity data, jurisdiction, contact channel, data-handling and processor details, refund policy, price/currency/tax, and licence/IP limits. No text is invented and no generic placeholder page is published in place of an approved one.

## Closeout decision

**OPEN.** The project is not closed. Open gates: three red CI checks on PR #401; PR #401 scope and content alignment; production identity divergence between `main` and the deployed commit; the `CERTIFIED` / `NOT_CERTIFIED` proof disagreement; six missing commercial/legal pages; absence of periodic backup plus a full restore test; unverified WAF posture. Buyer-side items remain separately contracted.
