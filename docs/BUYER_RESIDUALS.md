# Buyer and seller residuals — reconciled 2026-11-20

This register supersedes earlier dated observations in this file. The live values below are recorded from the owner-provided, same-session API measurements dated 2026-11-20; they are not a substitute for re-querying the providers at the time of a future transaction. No production database write, migration, branch deletion, backup-plan upgrade, legal publication, or license grant is implied.

## Seller-reference release evidence

| Item | Measured value | Scope |
|---|---|---|
| GitHub main | `2dbafb74e0812552a316e3b50588abb6467b081d` | Exact source head |
| Secure Release | Run `44754810550` | Completed / success; Cosign keyless bundle independently verified |
| Production deployment | `dpl_9zuRaUG531Z5mwUMtuq4EL4vsv8R` | Owner-reported Vercel production alias target |
| Public health | HTTP 200; version `0.11.62`; engine `postgres` | Live route response |
| Release proof | HTTP 200; `status=PASS` | Seller-reference only |
| Signed tenant route coverage | 67 expected / 67 covered / 0 failed | Exact seller deployment evidence; not buyer-environment qualification |
| Production acceptance | PASS; commit-bound to `2dbafb74…`; pipeline `44756093116` | Exact evidence SHA-256 `189b15d1…` |
| PostgreSQL HTTP acceptance | PASS; current candidate match true | Acceptance evidence scope only |
| Database security catalog | 136 public tables; 135 with RLS + FORCE RLS; sole exception `spatial_ref_sys` | Catalog evidence; not behavioral certification |

**Required public-proof semantics:** technical `status=PASS` must not be presented as full commercial completion. `gates.commercialClosure` must be `PASS_WITH_BUYER_RESIDUALS` while the buyer-owned items below remain open. The database-security endpoint must use `catalogIsolationScope=CATALOG_ONLY_NOT_BEHAVIORAL_CERTIFICATION`; only the separate release-proof gate may report seller-deployment behavioral isolation certification when all of its independent conditions pass.

## Buyer-owned residuals — explicitly open

| Residual | Status | Exact boundary |
|---|---|---|
| Android/iOS store artifacts | `REMAINING_BUYER` | Buyer-specific signing, native builds, physical-device QA, store accounts, submission and publication are not included. |
| Native-speaker translation review | `REMAINING_BUYER` | 114 locale rows; native-speaker review 0/114 and production qualification 0/114. Machine-assisted drafts and English fallbacks must remain disclosed. |
| Licensed maps and road-routing | `REMAINING_BUYER` | Buyer/provider license, account, credentials, attribution, quotas, billing and buyer-specific live acceptance are not included. |

These residuals do not invalidate the measured seller-reference technical release proof. They do prevent an unqualified claim that the buyer deliverable is complete. Buyer environments remain independently unverified. They do not grant any rights to install, run, copy, modify, distribute, resell, sublicense or commercially exploit the source.

## Neon recovery and backup limits

| Measurement | Primary | Restore branch |
|---|---:|---:|
| PostgreSQL | 18.7 | 18.7 |
| Public tables | 138 | 138 |
| User functions | 953 | 953 |
| RLS policies | 278 | 278 |
| Migration ledger rows | 69 | 68 |
| Branch IDs | `br-proud-salad-bcshhdap` | `br-calm-poetry-bc7l7wik` |

The only ledger difference measured was `070_evidence_upload_postgres_blob_storage.sql`, present on Primary and absent on the restore branch. Its recorded application time was `2026-11-19T18:38:00Z`; the restore snapshot was created at `2026-11-19T06:58:55Z`. This is a time-ordered migration difference, not evidence of data corruption. The measured migration file SHA-256 was `5a7642ab5b82dfb0763553100a1af1d224a9fbf7e9882127126747533a539b4f`.

The Neon Free plan has one listed manual snapshot, `snap-aged-thunder-bcsxc1a5`, created `2026-11-19T06:58:55Z`, with six-hour history retention and a 1 GiB logical limit. The Primary and restore branch records both report `protected=false`; branch protection and scheduled backups are not available on the current plan. Do not describe this as scheduled backup coverage, multi-day PITR, or an RPO/RTO guarantee. Do not create recurring manual snapshots and call them scheduled backups.

## Localization qualification boundary

The Contact Center currently has 105 selectable locales (1 English source, 100 machine-assisted drafts, and 4 English fallbacks); 9 locale codes are withdrawn. The separate qualification matrix retains 114 source rows. Native-speaker review is 0/114 and production qualification is 0/114. No linguistic quality approval is claimed.

## Prior recorded firewall posture — not refreshed in this reconciliation

The last recorded Vercel firewall inspection described the firewall as enabled, with Managed CRS and Bot Protection in `log` mode and a 60-requests-per-source-IP-per-60-second auth rate-limit rule. This posture was not re-queried as part of the 2026-11-20 reconciliation; do not treat it as a current enforcement attestation. The previous inspection explicitly prohibited switching log rules to deny without representative false-positive analysis and a Preview enforcement rehearsal.

## Legal, licensing and distribution boundary

| Item | Measured state | Consequence |
|---|---|---|
| Legal/commercial routes | `/terms`, `/privacy`, `/refund`, `/pricing`, `/legal`, `/security` returned HTTP 404 (79-byte response) | Pages are absent; do not claim they are published. |
| Source license | `UNLICENSED`; no repository `LICENSE` file | No default license grant. |
| Buyer rights | `licenseGrant=NONE_PENDING_RIGHTS_HOLDER_DECISION` | All rights reserved pending a separate written agreement signed by the rights holder. |

Legal terms, privacy notices, refund terms, pricing publication, security disclosures and any distribution/resale grant require rights-holder/legal approval. Do not invent or publish them as technical defaults. A successful release, public repository, signed archive, or seller-operated deployment does not itself grant buyer rights.

## Remaining proof-quality observations

- The release response reported `releaseTag=null` and `deployment.target=null`, while Vercel's API identified the deployment target as `production`. Treat those response fields as unresolved representation gaps until the response assembly code and live contract are inspected; do not silently infer missing values.
- The database catalog endpoint's `catalogIsolationScope` is intentionally non-behavioral. Do not compare it as if it were the release endpoint's behavioral isolation certification.
- Keep exact source commit, pipeline ID, deployment ID, evidence hashes and verification timestamps bound together. Historical evidence from another run or deployment must not be reused as current proof.
- The Cosign keyless signature proves the exact archive blob's signature and signer identity when independently verified. It is not by itself a complete SLSA/in-toto provenance attestation or buyer-environment certification.
