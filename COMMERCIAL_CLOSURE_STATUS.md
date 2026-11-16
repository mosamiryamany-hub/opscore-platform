# OpsCore — Technical and Commercial Closure Status

**Technical classification (seller-reference, git-stored evidence):** `NOT_VERIFIED` — repository copies of `PRODUCTION_SESSION_ISOLATION.json` / `PRODUCTION_RECOVERY_POINT.json` that still carry `evidenceRebind` with `probesReexecuted=false` must not be cited as certification of the live tip.

**Commercial license status:** **NO LICENSE GRANT** by default. All rights reserved by the **rights holder**. Commercial sales require a **signed** License Schedule under `docs/commercial/LICENSE_FRAMEWORK.md` (tiers: Use / Use+Modify / Use+Modify+Distribute). **No list prices** in-repo; terms negotiated per buyer with the rights holder.

**Distribution status:** **HOLD** until a Schedule is **signed** by the rights holder and the named buyer for a pinned deliverable (source commit and/or package digest). Evaluation or delivery without a Schedule is not authorized by this repository.

## Live deployment pointer (not a license)

See `backend/docs/verification/LIVE_EVIDENCE_AUTHORITY.md`. Observe runtime proof at `GET /api/verify/release`. Buyer-environment certification remains **NOT_ESTABLISHED** for customer deployments. Runtime may report `PASS_WITH_BUYER_RESIDUALS` for the seller-operated deployment; that does not transfer certification to a buyer environment.

## Framework (ready for any buyer type)

| Tier | Intent |
|---|---|
| A — Use | Operate for the buyer’s own business |
| B — Use + Modify | Internal adaptation; no third-party distribution |
| C — Use + Modify + Distribute | Agreed redistribution / OEM / hosted offering |

Template: `docs/commercial/LICENSE_SCHEDULE_TEMPLATE.md`.

## Buyer residuals

- Mobile store artifacts — REMAINING_BUYER  
- Native translation review — REMAINING_BUYER  
- Licensed street map — REMAINING_BUYER  
- Mobile dependency remediation notes: `security/mobile-dependency-remediation-2026-11-01`

## Engineering honesty

- Seller-reference proofs do not transfer to the buyer environment.  
- Branch-point recovery is not full PITR/RPO/RTO certification.  
- Do not report seller-reference production isolation from rebind-era git JSON as verified.
