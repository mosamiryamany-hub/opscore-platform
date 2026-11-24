# OpsCore v0.11.62 — Commercial Closeout Execution Runbook

> **HISTORICAL RUNBOOK SNAPSHOT — 2026-11-22 — DO NOT USE AS CURRENT STATUS.** The SHA, run IDs, deployment IDs, migration/snapshot observations and environment flags below describe a prior reconciliation and are retained only for audit history. Current dated buyer evidence is maintained in [Buyer Evidence Index](docs/commercial/BUYER_EVIDENCE_INDEX.md) and [Self-Hosted Buyer Edition](docs/commercial/SELF_HOSTED_BUYER_EDITION_2026-11-24.md). The live classification remains HOLD / self-hosted production blocked / no buyer licence / no external accreditation.

**Reconciled:** 2026-11-22
**Main SHA at reconciliation start:** `63682774b7f81e123f996f6508fed5a714fea0be`  
**Application/runtime baseline audited:** `43554492218adbf0cde2d700bd0dedfadce67f5e` (the merge added closeout documentation, test and static-audit tooling changes; it did not change application runtime, migrations or lockfiles)
**Seller release status:** `HOLD — CANDIDATE EVIDENCE ONLY`  
**Buyer/product qualification:** `NOT ESTABLISHED`  
**Buyer environment:** `NOT_VERIFIED` — seller evidence does not transfer to customer infrastructure.

This archived runbook is not a current operational register or a certificate. Do not use its historical operational values to make current decisions. Each proof must be tied to the exact source commit, pipeline, deployment and database it measures. A later source change invalidates earlier package/release evidence.

## 1. Current exact candidate

| Control | Value | Result |
|---|---|---|
| GitHub Actions | Run `44993913435` | Post-merge `verify` PASS: 960 passed, 0 failed, 3 skipped |
| Vercel workflow | Run `44993913475` | Source verification, isolated PostgreSQL 18 acceptance, contract verification and isolated RLS/HTTP acceptance PASS; PITR and Neon Preview migration jobs SKIPPED; deploy SKIPPED |
| Signed-tenant PostgreSQL 18 evidence | Artifact `signed-tenant-postgres-18-ci-coverage-44993913475` | `PASS 67/67`, 0 failures; source hint `63682774…`; `opscore_runtime`; disposable CI only, not Production |
| Mobile dependency audit evidence | Artifact `mobile-dependency-audit-44993913475-63682774…` | Full and production trees PASS with 0 findings across 497 dependency nodes |
| Vercel deploy job | Same run | `SKIPPED`; no deployment proven by this run |
| PITR / Neon Preview migration jobs | Same run | `SKIPPED`; no fresh recovery or Preview migration proof |
| Secure Release package | SHA `43554492218adbf0cde2d700bd0dedfadce67f5e` | No matching ZIP, SBOM, signed provenance or release statement established |
| Vercel deployment for current main closeout commit | SHA `63682774b7f81e123f996f6508fed5a714fea0be` | No deployment record found for this SHA |
| Latest current-source Vercel Production-target deployments | `dpl_G15K6Sg9Q7xJQKrHKFRYJGSNDerN`; `dpl_EC2Ri4BJrZTN7ca53xurrUV9LvmR` | Both READY on parent/application SHA `43554492218adbf0cde2d700bd0dedfadce67f5e`; both alias lists empty |
| Canonical domain | `opscore-platform.vercel.app` | Alias lookup resolves to `dpl_EacspS7o2jntgw8uS1YMpzf45CFt` |
| Canonical alias deployment source | `b7f63445c1748ebaec426a9ebe0ea629e4998839` | Different from current main; not verified as current release |

The post-merge GitHub `verify` run on reconciliation base SHA `63682774…` passed with 960 tests, zero failures and three skips. Vercel workflow `44993913475` passed source verification, disposable PostgreSQL 18 acceptance, contract verification and isolated RLS/HTTP acceptance; its PITR, Neon Preview migration and deploy jobs were skipped. No Vercel deployment exists for reconciliation base SHA `63682774…`. Two READY Production-target deployments exist for its application/runtime parent SHA `435544922…`, both with empty alias lists. The canonical domain alias remains attached to deployment `dpl_EacspS7o2jntgw8uS1YMpzf45CFt` on SHA `b7f63445…`. Therefore the public domain still serves the older release, not the current main commit; production promotion and exact-head runtime proof remain unproven.

## 2. Required release-proof semantics

- SQLite route checks are contract evidence only. The recorded 358/358 result does not certify real PostgreSQL HTTP functional flows.
- Isolated PostgreSQL 18 acceptance and 67/67 signed-tenant CI route checks prove their stated CI scopes only.
- Native Neon historical restore evidence passed schema/catalog matching for a disposable branch. It does not prove complete row-content equality or RPO/RTO.
- The public release proof must stay `UNVERIFIED` until full Production PostgreSQL route and business-flow acceptance passes against the exact candidate deployment/database and binds source commit, workflow pipeline, deployment ID and complete route/flow inventories.
- PR #381 is included in current `main` and updates release-proof controls. No post-merge authorized Production workflow or exact-deployment runtime evidence was established in this reconciliation; do not infer Production readiness from the source change.

## 2A. Production environment binding (read-only Vercel inspection, 2026-11-22)

The Production environment currently reports `OPSC_PRODUCTION_HOLD=false`, `OPSC_RELEASE_VERIFIED=true`, and the application flag `OPSC_PRODUCTION_ISOLATION_CERTIFICATION=CERTIFIED`. These are internal deployment settings, not external ISO/SOC/PCI certification. The related `OPSC_RELEASE_PACKAGE_COMMIT`, `OPSC_RELEASE_CI_COMMIT`, and `OPSC_SOURCE_COMMIT_SHA` all resolve to `b7f63445c1748ebaec426a9ebe0ea629e4998839`, which is the source SHA of the canonical domain alias deployment. `OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID` resolves to a separate READY Production-target deployment on the same `b7f63445…` source SHA. These flags therefore describe the older deployed release, not reconciliation base SHA `63682774…`.

Production TLS configuration variables are set to `OPSC_PG_SSL_MODE=verify-full` and `OPSC_PG_SSL_REJECT_UNAUTHORIZED=true`. This is the expected strict configuration, but configuration presence is not proof that the actual application worker connection negotiated and verified TLS. The last application-worker TLS diagnostic remains a separate gate; no fresh exact-head Production worker TLS proof is established.

## 3. Seller-owned technical gates

1. **Tenant trust boundary:** migration 071 in current source implements HMAC-verified context and rejects raw-GUC-dependent RLS policies. Production application and catalog state are not verified; prove missing, malformed, expired and tampered signed context is denied, audit session binding and SECURITY DEFINER entry points, and retain HOLD until the exact Production database is tested.
2. **Identity grants:** remove unnecessary direct runtime DML on identity-sensitive tables and exercise real login/session/recovery flows using the least-privilege runtime role.
3. **All runtime data paths:** bind AI knowledge/search pools and asynchronous workers to the same signed tenant context and PostgreSQL enforcement. A SQLite-only worker path is not PostgreSQL production parity.
4. **Full API acceptance:** execute all inventoried application routes and defined business flows against the exact staged Production PostgreSQL target. Record route/flow inventory hashes, pass/fail counts, database, deployment, commit and pipeline.
5. **Dependency audit refresh:** GHSA-fc5q-39xc-vjpf / CVE-2026-112366 was withdrawn by its advisory source on 2026-11-18; the obsolete allowlist entry is removed on this branch. Re-run full and `--omit=dev` mobile audits on the exact head and treat only currently active findings as blockers. The withdrawal is not a package patch and does not imply all dependencies are clean.
6. **Recovery:** provide scheduled protected backups, defined retention, successful restore and measured RPO/RTO for seller-hosted service. The Neon Free configuration currently has six-hour history retention, one manual snapshot and no schedule.
7. **WAF:** conduct Preview deny/challenge rehearsal and false-positive analysis before narrowly applying Production mitigation. Current managed attack/bot rules are log-only.
8. **Secure Release:** generate the package and all checksums, SBOM, provenance/signature, dependency audits, JUnit and forensic reports from one exact-main run; verify the result independently.
9. **Legal and buyer material:** recheck public legal routes and publish only approved content. The last recorded check on 2026-11-20 observed 404 responses for `/terms`, `/privacy`, `/refund`, `/pricing`, `/legal` and `/security`; recheck before claiming current status.
10. **Production release:** verify required repository variables and protected environment controls, run the exact authorized workflow, prove staged runtime and database/security gates, promote only after all gates pass, and verify the canonical domain points to the exact released commit.

## 4. Current database and firewall posture

Neon Production project `summer-leaf-18448271`, branch `br-proud-salad-bcshhdap`, database `opscore_acceptance`; PostgreSQL 18.7. The last detailed database catalog measured 136 public tables, 135 with RLS + FORCE RLS, with `spatial_ref_sys` as the PostGIS metadata exception. The runtime role had `NOSUPERUSER` and `NOBYPASSRLS`. **Historical P0 reproduction (2026-11-21):** a read-only, transaction-local probe as `opscore_runtime` with no signed context showed public context helpers returning raw caller-set `app.tenant_id`, `app.user_id` and `app.access_mode`; a count-only read observed 2 rows in `activity_log` for a selected existing tenant context. No row contents were read and no persistent database changes were made. Migration 071 now exists in current source and replaces this fallback with HMAC-verified context, but no fresh Production catalog proof shows it was applied or that all grants and policies are correct. Production tenant isolation remains **NOT_CERTIFIED** until current state is measured and real public-table RLS denial tests pass.

The live Neon project read on 2026-11-22 confirms Free plan, PostgreSQL 18, six-hour history retention, 1 GiB branch logical-size limit, one manual snapshot, and an empty automatic snapshot schedule. Primary `br-proud-salad-bcshhdap` and recovery `br-calm-poetry-bc7l7wik` are both unprotected. Allowed IP list is empty and public connections are not blocked. Do not delete the only listed manual snapshot or remove branches without checking their role and recoverability. The 2026-11-20 historical-branch PITR probe is PASS for schema/catalog comparison only; do not call it full data restore or RPO/RTO certification.

Vercel firewall is enabled. Fresh 2026-11-22 read confirms CRS generic attack/RCE/SQLi/XSS and Bot Protection are active in `log` mode. The authentication endpoint rule limits 60 requests per source IP per fixed 60-second window. Do not flip all rules to deny without a Preview rehearsal and false-positive review.

## 5. Contact Center and buyer-specific boundaries

Contact Center has 105 selectable locales (1 English source, 100 machine-assisted drafts and 4 English fallback locales; 9 locale codes are withdrawn). The separate language qualification matrix retains 114 source rows. Native-speaker review is 0/114 and production qualification 0/114. Keep the machine-translation notice visible; do not claim native linguistic approval.

Buyer-owned items remain separate: Android/iOS signing, native builds, physical-device QA and store publication; native-speaker review/qualification; licensed maps and road-routing with buyer provider accounts, credentials, attribution, quotas and acceptance. These are excluded from the seller remediation list, not declared complete.

## 6. Commercial rights boundary

The seller may advertise and negotiate the offer before identifying a buyer. Published seller asking floors are L1 USD 45,000 (use), L2 USD 85,000 (use/modify/redistribute), L3 USD 175,000 (exclusive/IP assignment subject to the signed schedule). These are asking floors, not independent market valuations or executed offers.

The repository is `UNLICENSED`. **NO LICENSE GRANT** is made by repository access, an offer, a technical report, a release artifact or a deployment. Before granting licensed use or delivery rights, the rights holder and the named buyer must sign a License Schedule that pins the exact source commit/package digest and specific rights.

## 7. Stop conditions

Stop release and retain HOLD if any exact-head check fails, any source/pipeline/deployment/database identity differs, route/flow evidence is missing or partial, the dependency advisory remains unresolved without an authorized documented disposition, recovery or trust-boundary evidence is incomplete, public legal content is unapproved, or final public-domain mapping does not point to the exact verified deployment.

Do not merge this change directly to `main`, change Production environment variables, modify Neon Production, change WAF enforcement, delete branches/snapshots or promote a deployment as part of a candidate-only run.
