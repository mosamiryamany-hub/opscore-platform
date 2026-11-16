# OpsCore — Technical and Commercial Closure Status

**Technical classification (seller-reference, git-stored evidence):** `NOT_VERIFIED` — repository copies of `PRODUCTION_SESSION_ISOLATION.json` / `PRODUCTION_RECOVERY_POINT.json` that still carry `evidenceRebind` with `probesReexecuted=false` must not be cited as certification of the live tip.

**Commercial license status:** **NO LICENSE GRANTED BY DEFAULT** — commercial sales use a **signed License Schedule** under `docs/commercial/LICENSE_FRAMEWORK.md` (tiers: Use / Use+Modify / Use+Modify+Distribute). **No list prices** in-repo; terms negotiated per buyer.

**Distribution status:** **HOLD** until a Schedule is signed for a named buyer and a pinned deliverable. Evaluation or delivery without a Schedule is not authorized by this repository.

## Live deployment pointer (not a license)

See `backend/docs/verification/LIVE_EVIDENCE_AUTHORITY.md`. Observe runtime proof at `GET /api/verify/release`. Buyer-environment certification remains **NOT_ESTABLISHED** for customer deployments.

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

## Engineering honesty

- Seller-reference proofs do not transfer to the buyer environment.  
- Branch-point recovery is not full PITR/RPO/RTO certification.  
- Do not report seller-reference production isolation from rebind-era git JSON as verified.
