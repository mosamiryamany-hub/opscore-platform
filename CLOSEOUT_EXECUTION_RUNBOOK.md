# OpsCore v0.11.62 — Commercial Closeout Execution Runbook

**Reconciled:** 2026-11-21  
**Current main:** `b4f3bc81135acbf1bbe7262a0ae58b3573cddf82`  
**Seller release status:** `HOLD — CANDIDATE EVIDENCE ONLY`  
**Buyer/product qualification:** `NOT ESTABLISHED`  
**Buyer environment:** `NOT_VERIFIED` — seller evidence does not transfer to customer infrastructure.

This runbook is a current operational register, not a certificate. Each proof must be tied to the exact source commit, pipeline, deployment and database it measures. A later source change invalidates earlier package/release evidence.

## 1. Current exact candidate

| Control | Value | Result |
|---|---|---|
| GitHub Actions | Run `44808632964` | Overall success; candidate-only |
| Workflow mode | `CANDIDATE_EVIDENCE_ONLY` | No production release authorization |
| Production certification | `false` | Not certified |
| Production promotion | `false` | Not promoted |
| Production environment | `productionEnvironmentRestored=true` | Baseline restored |
| Vercel candidate | `dpl_4vSUfZX9p1iwbbyGQV3hoPUDvuRV` | READY, exact current main, no alias |
| Canonical domain | `opscore-platform.vercel.app` | Still aliases older deployment `dpl_EacspS7o2jntgw8uS1YMpzf45CFt` |
| Older aliased deployment source | `b7f63445c1748ebaec426a9ebe0ea629e4998839` | Not current main |

The candidate workflow passed the current source verification, disposable PostgreSQL 18 acceptance, isolated Neon Preview migration/HTTP acceptance, route contract tests and historical PITR probe. Production release steps — evidence publication, staged runtime final proof, promotion and canonical-domain verification — were skipped. Do not describe the workflow's overall `success` as a Production release PASS.

## 2. Required release-proof semantics

- SQLite route checks are contract evidence only. The recorded 358/358 result does not certify real PostgreSQL HTTP functional flows.
- Isolated PostgreSQL 18 acceptance and 67/67 signed-tenant CI route checks prove their stated CI scopes only.
- Native Neon historical restore evidence passed schema/catalog matching for a disposable branch. It does not prove complete row-content equality or RPO/RTO.
- The public release proof must stay `UNVERIFIED` until full Production PostgreSQL route and business-flow acceptance passes against the exact candidate deployment/database and binds source commit, workflow pipeline, deployment ID and complete route/flow inventories.
- The fail-closed code change requiring `PASS_PRODUCTION_FUNCTIONAL_SCOPE` is currently under review on `fix/fail-closed-production-functional-release-proof-2026-11-21`; it is not yet merged or deployed.

## 3. Seller-owned technical gates

1. **Tenant trust boundary:** remove raw-GUC fallback authority from production authorization paths; prove missing, malformed, expired and tampered signed context is denied; audit session binding and SECURITY DEFINER entry points.
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

Neon Production project `summer-leaf-18448271`, branch `br-proud-salad-bcshhdap`, database `opscore_acceptance`; PostgreSQL 18.7. The database catalog previously measured 136 public tables, 135 with RLS + FORCE RLS, with `spatial_ref_sys` as the PostGIS metadata exception. The runtime role has `NOSUPERUSER` and `NOBYPASSRLS`; direct identity-table grants and raw-GUC trust fallbacks remain open. **P0 reproduction (2026-11-21):** a read-only, transaction-local probe as `opscore_runtime` with no signed context showed the public context helpers returning raw caller-set `app.tenant_id`, `app.user_id` and `app.access_mode` values. A count-only read then observed 2 rows in `activity_log` for a selected existing tenant context. No row contents were read and no persistent DB changes were made. This demonstrates raw-GUC impersonation reaches a real public RLS-protected table. Production tenant isolation is **NOT_CERTIFIED** until this trust path is removed, supported application flows are moved to signed context or an independently verified privileged path, and real public-table RLS denial tests pass.

The current Neon Free plan reports six-hour history retention, 1 GiB branch logical-size limit, one listed manual snapshot and no automatic snapshot schedule. Primary reports `protected=false`. Do not delete the only listed manual snapshot or remove branches without checking their role and recoverability. The 2026-11-20 historical-branch PITR probe is PASS for schema/catalog comparison only; do not call it full data restore or RPO/RTO certification.

Vercel firewall is enabled, but CRS generic attack/RCE/SQLi/XSS and Bot Protection are active in `log` mode. The authentication endpoint rule limits 60 requests per source IP per fixed 60-second window. Do not flip all rules to deny without a Preview rehearsal and false-positive review.

## 5. Contact Center and buyer-specific boundaries

Contact Center has 105 selectable locales (1 English source, 100 machine-assisted drafts and 4 English fallback locales; 9 locale codes are withdrawn). The separate language qualification matrix retains 114 source rows. Native-speaker review is 0/114 and production qualification 0/114. Keep the machine-translation notice visible; do not claim native linguistic approval.

Buyer-owned items remain separate: Android/iOS signing, native builds, physical-device QA and store publication; native-speaker review/qualification; licensed maps and road-routing with buyer provider accounts, credentials, attribution, quotas and acceptance. These are excluded from the seller remediation list, not declared complete.

## 6. Commercial rights boundary

The seller may advertise and negotiate the offer before identifying a buyer. Published seller asking floors are L1 USD 45,000 (use), L2 USD 85,000 (use/modify/redistribute), L3 USD 175,000 (exclusive/IP assignment subject to the signed schedule). These are asking floors, not independent market valuations or executed offers.

The repository is `UNLICENSED`. **NO LICENSE GRANT** is made by repository access, an offer, a technical report, a release artifact or a deployment. Before granting licensed use or delivery rights, the rights holder and the named buyer must sign a License Schedule that pins the exact source commit/package digest and specific rights.

## 7. Stop conditions

Stop release and retain HOLD if any exact-head check fails, any source/pipeline/deployment/database identity differs, route/flow evidence is missing or partial, the dependency advisory remains unresolved without an authorized documented disposition, recovery or trust-boundary evidence is incomplete, public legal content is unapproved, or final public-domain mapping does not point to the exact verified deployment.

Do not merge this change directly to `main`, change Production environment variables, modify Neon Production, change WAF enforcement, delete branches/snapshots or promote a deployment as part of a candidate-only run.
