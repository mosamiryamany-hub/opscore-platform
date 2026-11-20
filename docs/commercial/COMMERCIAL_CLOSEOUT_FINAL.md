# OpsCore — Commercial Closeout Status

**Reconciled:** 2026-11-21  
**Product version label:** 0.11.62  
**Current source:** `b4f3bc81135acbf1bbe7262a0ae58b3573cddf82`

## Current decision

**HOLD — SELLER RELEASE NOT CERTIFIED.** The latest main workflow (run `44808632964`) completed successfully in `CANDIDATE_EVIDENCE_ONLY` mode. It explicitly reports `productionCertification=false`, `productionPromotionPerformed=false` and `productionEnvironmentRestored=true`. Current Vercel candidate `dpl_4vSUfZX9p1iwbbyGQV3hoPUDvuRV` is READY on current main but has no aliases. The public domain remains mapped to an older deployment. Candidate readiness is not production release.

## Product closeout independence

No prospective buyer or buyer signature is needed to complete the product. A named buyer is not a seller technical gate and is not a prerequisite for seller-side technical closure, release packaging, offer publication or sales discussions.

No license grant is made to a buyer until the rights holder and that named buyer execute a signed License Schedule that pins the exact deliverable (`sourceCommit` and/or package SHA-256).

Seller advertising, listings, demonstrations and negotiations may happen before a buyer is known. **OPEN FOR MARKETING** does not equal delivery rights. **NO LICENSE GRANT** by repository presence or this file.

Buyer-specific qualification is **NOT_ESTABLISHED** and buyer environments remain independently **NOT_VERIFIED**. The seller's current tests do not transfer to customer-managed infrastructure.

## Seller release gates

| Gate | Current state |
|---|---|
| Candidate CI and isolated PostgreSQL acceptance | PASS in their measured scopes |
| Full Production PostgreSQL API route + business-flow acceptance | NOT VERIFIED; required before release PASS |
| Seller PostgreSQL tenant trust boundary | P0 — raw GUC impersonation reproduced under `opscore_runtime`; NOT CERTIFIED |
| Mobile dependency audit | GHSA-fc5q-39xc-vjpf withdrawn 2026-11-18; fresh exact-head full + `--omit=dev` audit still required |
| Scheduled protected backup and full recovery objectives | NOT ESTABLISHED on current Neon Free plan |
| Vercel managed attack/bot enforcement | LOG ONLY; Preview rehearsal required |
| Secure Release exact-current-main package | NOT YET PRODUCED for current main |
| Production promotion and public-domain identity | NOT DONE |

The in-progress fail-closed change on `fix/fail-closed-production-functional-release-proof-2026-11-21` rejects missing or contract-only route evidence for full Production release. It is not merged and does not itself generate the required Production evidence.

**NO LICENSE GRANT.** No buyer license or commercial distribution is authorized until the rights holder and named buyer sign the transaction-specific License Schedule.

## Published asking floors (USD)

| Tier | Rights | Minimum asking floor |
|---|---|---:|
| **L1** | Use only | **45,000** |
| **L2** | Use + modify + redistribute | **85,000** |
| **L3** | Exclusive / IP assignment, subject to executed terms | **175,000** |

These are seller asking floors, not validated market valuations, an accepted offer or a signed transaction. Buyer-specific price and rights are fixed only in the executed License Schedule.

## Buyer-owned residuals — explicitly disclosed

- Android/iOS signing, native builds, device QA and app-store publication.
- Native-speaker translation review and production qualification (0/114).
- Licensed maps/road-routing and buyer/provider credentials, attribution, quotas and live acceptance.

## Explicit non-claims

1. Candidate CI success is not Production certification or promotion.
2. PostgreSQL CI and SQLite contract checks do not prove every Production business flow.
3. A historical-branch schema/catalog PITR probe is not full row-content equality or RPO/RTO certification.
4. A signature or archive digest does not grant buyer use or distribution rights.
5. Buyer residuals are not complete merely because they are disclosed.
