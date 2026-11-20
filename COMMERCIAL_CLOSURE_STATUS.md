# OpsCore — Technical and Commercial Closure Status

**Reconciled:** 2026-11-21  
**Current main:** `b4f3bc81135acbf1bbe7262a0ae58b3573cddf82`  
**Current classification:** `HOLD — SELLER RELEASE NOT CERTIFIED`  
**Buyer-specific qualification:** `NOT_ESTABLISHED`  
**Buyer environment:** `NOT_VERIFIED` — seller evidence does not transfer to buyer infrastructure.

## Exact current release evidence

| Control | Current verified value | Interpretation |
|---|---|---|
| GitHub main | `b4f3bc81135acbf1bbe7262a0ae58b3573cddf82` | Signed main commit |
| GitHub workflow | `44808632964` | Overall success in `CANDIDATE_EVIDENCE_ONLY` mode |
| Production certification | `false` | Explicit workflow output |
| Production promotion | `false` | No production promotion occurred |
| Production environment | Restored | Candidate workflow restored its pre-run Production environment |
| Vercel candidate | `dpl_4vSUfZX9p1iwbbyGQV3hoPUDvuRV` | READY, built from current main, no aliases |
| Public production alias | `dpl_EacspS7o2jntgw8uS1YMpzf45CFt` | Still points to older source `b7f63445c1748ebaec426a9ebe0ea629e4998839` |

The successful workflow proves candidate build and specified isolated acceptance checks. It does **not** prove a completed production release. The required production publication, final runtime proof, promotion and canonical-domain verification steps were skipped by the candidate-only mode.

## Seller-owned closeout gates

- [ ] Implement and pass full Production PostgreSQL HTTP route **and business-flow** acceptance, bound to exact source commit, pipeline, deployment ID, database identity, complete route/flow inventory and zero failures. SQLite route contract evidence is not sufficient.
- [ ] Close the remaining PostgreSQL tenant trust-boundary findings: raw-GUC fallback paths, identity-table direct-DML grants, privileged helper exposure, independent AI/search pools and non-PostgreSQL operational worker paths. Require real runtime-role denial tests, not catalog-only claims.
- [x] Reconcile GHSA-fc5q-39xc-vjpf / CVE-2026-112366: the GitHub/OSV advisory record was withdrawn on 2026-11-18. The obsolete exception was removed from `mobile/audit-allowlist.json`. [ ] Run fresh full and `--omit=dev` mobile audits on this exact head; any remaining active High/Critical must be evaluated individually. Withdrawal is not a package patch and does not itself certify the complete dependency graph.
- [ ] Complete seller-hosted recovery capability: scheduled protected backups, appropriate retention, tested restore and explicitly measured recovery objectives. Current Neon Free limits do not establish scheduled backup or RPO/RTO coverage.
- [ ] Rehearse WAF enforcement on Preview, review false positives and then apply narrowly scoped production deny/challenge controls with evidence. Current managed attack and bot rules are log-only.
- [ ] Tighten and run Secure Release on one exact main commit; verify the package, archive digest, SBOM, provenance/signature, regression/security results, dependency audits and localization evidence from that same run.
- [ ] Reconcile seller documents and verify public routes. Legal content must be approved by the rights holder/legal reviewer before publication; the last recorded observation found the required legal routes returning 404 and is not a fresh 21-Nov HTTP check.
- [ ] Only after the above gates pass, run the explicitly authorized production release workflow, verify the staged runtime and public domain, and prove the canonical alias maps to the exact released commit.

The working implementation of the fail-closed functional-release gate is on branch `fix/fail-closed-production-functional-release-proof-2026-11-21`; it is not yet merged or deployed. The updated contract requires explicit Production PostgreSQL route and business-flow evidence. Until a real evidence producer and exact-target run satisfy it, the release remains HOLD.

**NO LICENSE GRANT.** No buyer license or commercial distribution right exists until the rights holder and named buyer execute a **signed** exact-deliverable License Schedule.

## Neon and database boundaries

The current Neon production branch is `br-proud-salad-bcshhdap`. The Free plan reports six-hour history retention, a 1 GiB branch logical-size limit and one listed manual snapshot; no scheduled snapshot schedule is configured. Primary is not protected. The 2026-11-20 native PITR probe passed only a historical-branch schema/catalog comparison; it did not establish row-content equality, a tested full restore, or RPO/RTO.

Catalog observations recorded 136 public tables, with 135 carrying RLS and FORCE RLS; `spatial_ref_sys` is the PostGIS metadata exception. The runtime role has no superuser/BYPASSRLS attributes, but identity-table direct DML grants and raw-GUC trust fallbacks remain seller-owned findings to close. **P0 trust-boundary reproduction (2026-11-21):** a read-only, transaction-local probe using `opscore_runtime` and no signed payload showed `opscore_current_tenant()`, `opscore_current_user()` and `opscore_access_mode()` accepting attacker-supplied raw GUC values; on a count-only test, this exposed 2 rows from `activity_log` for a selected existing tenant context. No row contents were read and no persistent database changes were made. Treat Production tenant isolation as **NOT CERTIFIED** until the accessor trust model is corrected and actual public-table RLS regression tests prove unsigned tenant/user/access-mode GUCs are ignored.

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
