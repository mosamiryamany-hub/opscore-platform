# OpsCore — Technical and Commercial Closure Status

**Reconciled:** 2026-11-22
**Current main:** `43554492218adbf0cde2d700bd0dedfadce67f5e`
**Current classification:** `HOLD — SELLER RELEASE NOT CERTIFIED`  
**Buyer-specific qualification:** `NOT_ESTABLISHED`  
**Buyer environment:** `NOT_VERIFIED` — seller evidence does not transfer to buyer infrastructure.

## Exact current release evidence

| Control | Current verified value | Interpretation |
|---|---|---|
| GitHub main | `43554492218adbf0cde2d700bd0dedfadce67f5e` | Confirmed from `origin/main` on 2026-11-22 |
| GitHub workflow | `44953249616` | Post-merge checks succeeded; Vercel deploy, PITR and Neon Preview migration jobs skipped |
| Production certification / promotion | `NOT_ESTABLISHED` / `NOT_PROVEN` | No exact-head authorized Production workflow or matching runtime evidence |
| Latest Vercel Production-target deployment | `dpl_3Ls8gZdacPzNa1iJEe1r6amVEKRp` | READY, commit `970db239bc1b94401e39669e09b106e16c4defc1`, no aliases |
| Public production alias | `dpl_EacspS7o2jntgw8uS1YMpzf45CFt` | Alias lookup returned `opscore-platform.vercel.app`; deployment source `b7f63445c1748ebaec426a9ebe0ea629e4998839` |

The workflow's source and isolated PostgreSQL 18 checks passed, but its Vercel deploy, PITR and Neon Preview migration jobs were skipped. The latest Vercel Production-target record is on a different SHA and has no alias; the canonical domain alias remains attached to an older commit. These observations do **not** prove a completed production release. Production publication on current main, final runtime/database proof, promotion and canonical-domain verification remain unproven.

## Seller-owned closeout gates

- [ ] Implement and pass full Production PostgreSQL HTTP route **and business-flow** acceptance, bound to exact source commit, pipeline, deployment ID, database identity, complete route/flow inventory and zero failures. SQLite route contract evidence is not sufficient.
- [ ] Close the remaining PostgreSQL tenant trust-boundary findings: migration 071 now implements HMAC-verified context in source, but its Production application and catalog state are unverified; identity-table grants, privileged helper exposure, independent AI/search pools and non-PostgreSQL operational worker paths also require exact-target proof. Require runtime-role denial tests, not catalog-only claims.
- [x] Reconcile GHSA-fc5q-39xc-vjpf / CVE-2026-112366: GitHub/OSV withdrew the advisory on 2026-11-18 and the obsolete exception was removed. Six full / `--omit=dev` audits across root, backend and mobile returned zero findings against current lockfiles. Withdrawal is not a package patch and audit results do not certify the complete dependency graph; repeat on the final package.
- [ ] Complete seller-hosted recovery capability: scheduled protected backups, appropriate retention, tested restore and explicitly measured recovery objectives. Current Neon Free limits do not establish scheduled backup or RPO/RTO coverage.
- [ ] Rehearse WAF enforcement on Preview, review false positives and then apply narrowly scoped production deny/challenge controls with evidence. Current managed attack and bot rules are log-only.
- [ ] Tighten and run Secure Release on one exact main commit; verify the package, archive digest, SBOM, provenance/signature, regression/security results, dependency audits and localization evidence from that same run.
- [ ] Reconcile seller documents and verify public routes. Legal content must be approved by the rights holder/legal reviewer before publication; the last recorded observation found the required legal routes returning 404 and is not a fresh 21-Nov HTTP check.
- [ ] Only after the above gates pass, run the explicitly authorized production release workflow, verify the staged runtime and public domain, and prove the canonical alias maps to the exact released commit.

PR #381 is included in current `main` and updates release-proof controls. The local red-team analyzer correction and regression test are uncommitted and not in `main`; its local PASS cannot replace main's current REVIEW report. Production functional route/business-flow evidence, a post-merge authorized workflow and exact-target proof remain absent, so release stays HOLD.

**NO LICENSE GRANT.** No buyer license or commercial distribution right exists until the rights holder and named buyer execute a **signed** exact-deliverable License Schedule.

## Neon and database boundaries

The last recorded Neon production branch was `br-proud-salad-bcshhdap`. The last plan read reported six-hour history retention, a 1 GiB branch logical-size limit and one listed manual snapshot; no scheduled snapshot schedule was configured and Primary was not protected. Neon was not re-read on 2026-11-22. The 2026-11-20 native PITR probe passed only a historical-branch schema/catalog comparison; it did not establish row-content equality, a tested full restore, or RPO/RTO.

The last catalog observation recorded 136 public tables, with 135 carrying RLS and FORCE RLS; `spatial_ref_sys` is the PostGIS metadata exception. At that observation the runtime role had no superuser/BYPASSRLS attributes. **Historical P0 trust-boundary reproduction (2026-11-21):** a read-only, transaction-local probe using `opscore_runtime` and no signed payload showed `opscore_current_tenant()`, `opscore_current_user()` and `opscore_access_mode()` accepting attacker-supplied raw GUC values; on a count-only test, this exposed 2 rows from `activity_log` for a selected existing tenant context. No row contents were read and no persistent database changes were made. Migration 071 now implements HMAC-verified context in current source and rejects raw-GUC-dependent RLS policies, but no fresh Production catalog evidence confirms it was applied or verifies current grants and policies. Treat Production tenant isolation as **NOT CERTIFIED** until current state and runtime-role denial are independently tested.

## Localization qualification

Contact Center has 105 selectable locales, but native-speaker review and production language qualification remain 0/114. The AI/machine translation notice must remain explicit; no native linguistic approval is claimed.

## Buyer-owned residuals — not included in seller remediation

1. Buyer-specific mobile (Android/iOS) signing, native builds, physical-device QA and store publication.
2. Native-speaker review and production qualification (currently 0/114 reviewed/qualified).
3. Licensed maps and road routing, provider account/credentials, attribution, quotas and buyer-specific live acceptance.

These remain explicitly disclosed; excluding them from the seller work list does not make them complete.

## Commercial offer and rights

Published seller asking floors remain L1 USD 45,000 (use), L2 USD 85,000 (use, modify and redistribute), and L3 USD 175,000 (exclusive/IP assignment subject to the executed schedule). These are seller asking floors, not independently validated market valuations or accepted offers.

**OPEN FOR MARKETING** does not mean delivery authorization. The repository remains `UNLICENSED`; no buyer license is granted until the rights holder and the named buyer execute a transaction-specific License Schedule pinning the exact released artifact and rights.

`backend/docs/verification/COMMERCIAL_CLOSURE_GATE_RESULT.json` dated 2026-11-02 is historical evidence only; it is not the current release verdict.
